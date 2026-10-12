package com.billbull.backend.document;

import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.PlaywrightException;
import com.microsoft.playwright.Route;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLConnection;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Decides what the headless Chromium in {@link HtmlPdfService} may load while it
 * renders client-supplied print HTML, so the renderer cannot be used to reach the
 * server's own network (SSRF):
 * <ul>
 *   <li>{@code /uploads/**} on any host — logos, stamps, product images — is served
 *       straight from the backend's own upload directory, the same files
 *       {@code StaticResourceConfig} (and nginx, which proxies /uploads to it) serves.
 *       No network request is made, so this works whether or not the server can
 *       reach its own public URL.</li>
 *   <li>Other http(s) URLs are fetched only when every address the host resolves to
 *       is public, and without following redirects (a redirect could point
 *       anywhere). Loopback, private, link-local (cloud metadata), CGNAT, multicast
 *       and unique-local IPv6 destinations are blocked.</li>
 *   <li>Every other scheme (file:, ftp:, ...) is blocked. data: and blob: URLs never
 *       reach the router.</li>
 * </ul>
 * Residual risk, documented rather than solved: the host is resolved here and again
 * by the fetch, so a DNS-rebinding host could answer differently the second time.
 */
class PdfResourcePolicy {

    private static final Logger log = LoggerFactory.getLogger(PdfResourcePolicy.class);

    private static final String UPLOADS_PREFIX = "/uploads/";
    /** Largest single upload served into a render. */
    static final long MAX_UPLOAD_BYTES = 20L * 1024 * 1024;
    private static final double FETCH_TIMEOUT_MS = 15_000;

    enum Kind { LOCAL_UPLOAD, FETCH, BLOCK }

    record Decision(Kind kind, Path file, String reason) {
        static Decision block(String reason) { return new Decision(Kind.BLOCK, null, reason); }
    }

    /** Resolves a host name; swapped out in tests. */
    interface HostResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    private final Path uploadsRoot;
    private final HostResolver resolver;

    PdfResourcePolicy(Path uploadsRoot, HostResolver resolver) {
        this.uploadsRoot = uploadsRoot.toAbsolutePath().normalize();
        this.resolver = resolver;
    }

    /** The upload directory as {@code StaticResourceConfig} maps it ({@code file:./uploads/}). */
    static PdfResourcePolicy forServer() {
        return new PdfResourcePolicy(Path.of("uploads"), InetAddress::getAllByName);
    }

    Decision decide(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            return Decision.block("malformed URL");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            return Decision.block("scheme " + scheme);
        }

        String path = uri.getPath();
        if (path != null && path.startsWith(UPLOADS_PREFIX)) {
            Path file = uploadsRoot.resolve(path.substring(UPLOADS_PREFIX.length())).normalize();
            if (!file.startsWith(uploadsRoot) || file.equals(uploadsRoot)) {
                return Decision.block("path outside uploads");
            }
            return new Decision(Kind.LOCAL_UPLOAD, file, null);
        }

        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            return Decision.block("no host");
        }
        InetAddress[] addresses;
        try {
            addresses = resolver.resolve(host);
        } catch (UnknownHostException e) {
            return Decision.block("unresolvable host");
        }
        if (addresses == null || addresses.length == 0) {
            return Decision.block("unresolvable host");
        }
        for (InetAddress address : addresses) {
            if (!isPublic(address)) {
                return Decision.block("non-public address");
            }
        }
        return new Decision(Kind.FETCH, null, null);
    }

    static boolean isPublic(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()
                || a.isSiteLocalAddress() || a.isMulticastAddress()) {
            return false;
        }
        byte[] b = a.getAddress();
        if (a instanceof Inet4Address) {
            int first = b[0] & 0xff;
            int second = b[1] & 0xff;
            if (first == 0) return false;                                // 0.0.0.0/8
            if (first == 100 && second >= 64 && second <= 127) return false; // 100.64.0.0/10 CGNAT
            if (first >= 240) return false;                              // reserved + broadcast
            return true;
        }
        if (a instanceof Inet6Address) {
            if ((b[0] & 0xfe) == 0xfc) return false;                     // fc00::/7 unique local
            // IPv4-mapped (::ffff:a.b.c.d): judge the embedded IPv4 address.
            boolean mapped = true;
            for (int i = 0; i < 10; i++) if (b[i] != 0) { mapped = false; break; }
            if (mapped && (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff) {
                try {
                    return isPublic(InetAddress.getByAddress(new byte[]{b[12], b[13], b[14], b[15]}));
                } catch (UnknownHostException e) {
                    return false;
                }
            }
        }
        return true;
    }

    /** Playwright route handler. Runs on the rendering thread. */
    void handle(Route route) {
        String url = route.request().url();
        Decision decision = decide(url);
        try {
            switch (decision.kind()) {
                case LOCAL_UPLOAD -> fulfillUpload(route, decision.file());
                case FETCH -> fetchWithoutRedirects(route, url);
                default -> {
                    log.warn("PDF render blocked resource ({}): {}", decision.reason(), redact(url));
                    route.abort();
                }
            }
        } catch (PlaywrightException e) {
            // The page may already be closing (timeout); nothing left to answer.
            log.debug("PDF render route for {} not completed: {}", redact(url), e.getMessage());
        }
    }

    private void fulfillUpload(Route route, Path file) {
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > MAX_UPLOAD_BYTES) {
                route.fulfill(new Route.FulfillOptions().setStatus(404));
                return;
            }
            byte[] bytes = Files.readAllBytes(file);
            route.fulfill(new Route.FulfillOptions()
                    .setStatus(200)
                    .setContentType(contentType(file))
                    .setBodyBytes(bytes));
        } catch (IOException e) {
            route.fulfill(new Route.FulfillOptions().setStatus(404));
        }
    }

    private void fetchWithoutRedirects(Route route, String url) {
        APIResponse response;
        try {
            response = route.fetch(new Route.FetchOptions().setMaxRedirects(0).setTimeout(FETCH_TIMEOUT_MS));
        } catch (PlaywrightException e) {
            log.warn("PDF render could not load {}: {}", redact(url), e.getMessage());
            route.abort();
            return;
        }
        int status = response.status();
        if (status >= 300 && status < 400) {
            log.warn("PDF render blocked a redirect from {}", redact(url));
            route.abort();
            return;
        }
        route.fulfill(new Route.FulfillOptions().setResponse(response));
    }

    private static String contentType(Path file) {
        String guessed = URLConnection.guessContentTypeFromName(file.getFileName().toString());
        if (guessed != null) return guessed;
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    /** Logs the origin and path only — query strings can carry tokens. */
    private static String redact(String url) {
        int q = url.indexOf('?');
        String noQuery = q >= 0 ? url.substring(0, q) : url;
        return noQuery.length() > 200 ? noQuery.substring(0, 200) + "…" : noQuery;
    }
}
