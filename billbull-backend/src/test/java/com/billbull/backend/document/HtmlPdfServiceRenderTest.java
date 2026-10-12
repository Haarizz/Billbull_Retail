package com.billbull.backend.document;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Renders with a real headless Chromium. Opt-in, because it launches a browser and,
 * when none is installed, HtmlPdfService would download one:
 * <pre>
 *   mvn -o test -Dtest=HtmlPdfServiceRenderTest -Dbillbull.pdfRenderTest=true
 * </pre>
 * Uses the developer's Playwright browser cache; no database, no network.
 */
@EnabledIfSystemProperty(named = "billbull.pdfRenderTest", matches = "true")
class HtmlPdfServiceRenderTest {

    private static final byte[] PNG_1PX = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    @TempDir static Path uploads;
    private static HttpServer loopbackServer;
    private static final AtomicInteger loopbackHits = new AtomicInteger();
    private static final List<String> loopbackPaths = java.util.Collections.synchronizedList(new ArrayList<>());
    private static HtmlPdfService service;

    @BeforeAll
    static void start() throws Exception {
        Files.createDirectories(uploads.resolve("company"));
        Files.write(uploads.resolve("company/logo.png"), PNG_1PX);

        // A loopback service the renderer must never reach (stands in for an
        // internal admin endpoint or the cloud metadata address).
        loopbackServer = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        loopbackServer.createContext("/", exchange -> {
            loopbackHits.incrementAndGet();
            loopbackPaths.add(exchange.getRequestURI().toString());
            byte[] body = "secret".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        loopbackServer.start();

        service = new HtmlPdfService(new PdfResourcePolicy(uploads, InetAddress::getAllByName));
    }

    @AfterAll
    static void stop() {
        if (service != null) service.shutdown();
        if (loopbackServer != null) loopbackServer.stop(0);
    }

    private static String loopback(String path) {
        return "http://127.0.0.1:" + loopbackServer.getAddress().getPort() + path;
    }

    @Test
    void rendersAValidPdfHonouringThePagesOwnSize() {
        String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><style>"
                + "@page { size: A5 landscape; margin: 10mm; } body { font-family: sans-serif; }"
                + "</style></head><body><h1>Tax Invoice INV-2026-0001</h1>"
                + "<p>العربية — മലയാളം</p>"
                + "<img src='data:image/png;base64," + Base64.getEncoder().encodeToString(PNG_1PX) + "'/>"
                + "</body></html>";

        byte[] pdf = service.render(html);

        assertTrue(pdf.length > 100);
        assertEquals("%PDF-", new String(pdf, 0, 5, StandardCharsets.US_ASCII));
        double[] box = firstMediaBox(pdf);
        // A5 landscape = 595 x 420 pt.
        assertEquals(595, box[2] - box[0], 3);
        assertEquals(420, box[3] - box[1], 3);
    }

    @Test
    void uploadsAreServedFromDiskAndLoopbackIsNeverContacted() {
        int before = loopbackHits.get();
        String html = "<!DOCTYPE html><html><body>"
                // Same-host upload path: answered from the upload directory, not over the network.
                + "<img onerror='this.remove()' src='" + loopback("/uploads/company/logo.png") + "'/>"
                // Internal targets: image, script fetch, navigation attempt, WebSocket.
                + "<img onerror='this.remove()' src='" + loopback("/admin/secret.png") + "'/>"
                + "<script>"
                + "fetch('" + loopback("/api/internal") + "').catch(() => {});"
                + "try { new WebSocket('ws://127.0.0.1:" + loopbackServer.getAddress().getPort() + "/ws'); } catch (e) {}"
                + "</script>"
                + "<iframe src='" + loopback("/frame") + "'></iframe>"
                + "<img onerror='this.remove()' src='file:///etc/hosts'/>"
                + "</body></html>";

        byte[] pdf = service.render(html);

        assertEquals("%PDF-", new String(pdf, 0, 5, StandardCharsets.US_ASCII));
        assertEquals(before, loopbackHits.get(), "renderer reached the loopback service: " + loopbackPaths);
        // The only image that can load is the upload, so an embedded image proves it rendered.
        assertTrue(hasEmbeddedImage(pdf), "upload logo was not rendered");
    }

    @Test
    void aDocumentThatOpensWebSocketsDoesNotBreakTheNextRender() {
        String ws = "ws://127.0.0.1:" + loopbackServer.getAddress().getPort();
        service.render("<!DOCTYPE html><html><body><script>"
                + "for (let i = 0; i < 5; i++) { try { new WebSocket('" + ws + "/s' + i); } catch (e) {} }"
                + "</script></body></html>");
        for (int i = 0; i < 3; i++) {
            byte[] pdf = service.render("<!DOCTYPE html><html><body><p>after " + i + "</p></body></html>");
            assertEquals("%PDF-", new String(pdf, 0, 5, StandardCharsets.US_ASCII));
        }
    }

    @Test
    void allowedHostsAreFetchedButRedirectsAreNotFollowed() throws Exception {
        // Stands in for a public CDN: the policy below treats it as public.
        HttpServer cdn = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        cdn.createContext("/logo.png", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "image/png");
            exchange.sendResponseHeaders(200, PNG_1PX.length);
            exchange.getResponseBody().write(PNG_1PX);
            exchange.close();
        });
        cdn.createContext("/hop.png", exchange -> {
            exchange.getResponseHeaders().add("Location", loopback("/admin/secret.png"));
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        cdn.start();
        String base = "http://127.0.0.1:" + cdn.getAddress().getPort();
        PdfResourcePolicy treatCdnAsPublic = new PdfResourcePolicy(uploads, InetAddress::getAllByName) {
            @Override
            Decision decide(String url) {
                return url.startsWith(base) ? new Decision(Kind.FETCH, null, null) : super.decide(url);
            }
        };
        HtmlPdfService withCdn = new HtmlPdfService(treatCdnAsPublic);
        try {
            int before = loopbackHits.get();
            byte[] fetched = withCdn.render("<!DOCTYPE html><html><body>"
                    + "<img onerror='this.remove()' src='" + base + "/logo.png'/></body></html>");
            assertTrue(hasEmbeddedImage(fetched), "allowed host was not fetched");

            byte[] redirected = withCdn.render("<!DOCTYPE html><html><body>"
                    + "<img onerror='this.remove()' src='" + base + "/hop.png'/></body></html>");
            assertFalse(hasEmbeddedImage(redirected), "redirect was followed");
            assertEquals(before, loopbackHits.get(), "redirect reached the loopback service: " + loopbackPaths);
        } finally {
            withCdn.shutdown();
            cdn.stop(0);
        }
    }

    @Test
    void blockedImagesLeaveNoImageInThePdf() {
        // Negative control for the assertion above.
        byte[] pdf = service.render("<!DOCTYPE html><html><body>"
                + "<img onerror='this.remove()' src='" + loopback("/x.png") + "'/>"
                + "<img onerror='this.remove()' src='" + loopback("/uploads/company/missing.png") + "'/>"
                + "</body></html>");
        assertFalse(hasEmbeddedImage(pdf));
    }

    private static boolean hasEmbeddedImage(byte[] pdf) {
        return Pattern.compile("/Subtype\\s*/Image").matcher(new String(pdf, StandardCharsets.ISO_8859_1)).find();
    }

    @Test
    void concurrentRendersAreSerialisedAndAllSucceed() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Future<byte[]>> results = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                String doc = "<!DOCTYPE html><html><head><style>@page{size:A4}</style></head>"
                        + "<body><h1>Document " + i + "</h1></body></html>";
                results.add(pool.submit(() -> service.render(doc)));
            }
            for (Future<byte[]> f : results) {
                byte[] pdf = f.get(120, TimeUnit.SECONDS);
                assertEquals("%PDF-", new String(pdf, 0, 5, StandardCharsets.US_ASCII));
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private static double[] firstMediaBox(byte[] pdf) {
        String text = new String(pdf, StandardCharsets.ISO_8859_1);
        Matcher m = Pattern.compile("/MediaBox\\s*\\[\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*]")
                .matcher(text);
        assertTrue(m.find(), "no /MediaBox in PDF");
        return new double[]{Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2)),
                Double.parseDouble(m.group(3)), Double.parseDouble(m.group(4))};
    }
}
