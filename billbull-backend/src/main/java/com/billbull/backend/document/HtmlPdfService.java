package com.billbull.backend.document;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Margin;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.microsoft.playwright.impl.driver.Driver;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Renders document HTML to PDF using a headless Chromium instance driven by
 * Playwright. The frontend builds the print HTML (via documentTemplateRenderer)
 * and posts it here; Chromium paginates it with the real browser layout engine,
 * so the PDF is byte-identical to the on-screen print preview — page breaks,
 * @page rules, repeating table headers and flexbox all behave correctly.
 *
 * <h3>Browser binary lifecycle on the VPS</h3>
 * The Chromium binary is NOT bundled in the jar. On this deployment every client
 * runs the same jar as a separate Spring Boot process on one VPS. To avoid each
 * process downloading its own copy:
 * <ul>
 *   <li>All processes share one browser dir via {@code PLAYWRIGHT_BROWSERS_PATH}
 *       (defaults to {@code /opt/ms-playwright} if the env var is unset).</li>
 *   <li>Chromium is launched lazily on the first PDF request (not at boot, so a
 *       missing browser never blocks app startup).</li>
 *   <li>If the launch fails because the browser is missing, we auto-install it
 *       once, guarded by a cross-process file lock so concurrent processes don't
 *       race, then retry.</li>
 * </ul>
 *
 * <h3>One-time root step still required</h3>
 * Auto-install fetches the Chromium <em>binary</em>, but it cannot install the
 * Linux <em>system libraries</em> Chromium needs (libnss3, libatk, fonts, ...),
 * because that needs root + apt. Run this ONCE on a fresh VPS:
 * <pre>
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
 *     mvn exec:java -Dexec.mainClass=com.microsoft.playwright.CLI \
 *                   -Dexec.args="install --with-deps chromium"
 * </pre>
 * After that, the running jars keep the binary up to date by themselves.
 */
@Service
public class HtmlPdfService {

    private static final Logger log = LoggerFactory.getLogger(HtmlPdfService.class);

    /** Shared browser location for all client processes on the VPS. */
    private static final String DEFAULT_BROWSERS_PATH = "/opt/ms-playwright";

    private Playwright playwright;
    private Browser browser;

    /**
     * Where Chromium lives, shared by every client process on the VPS. Honour an
     * explicit {@code PLAYWRIGHT_BROWSERS_PATH} env var if the operator set one
     * (e.g. in the systemd unit); otherwise default to {@code /opt/ms-playwright}
     * on Linux. On Windows (dev) leave it null so Playwright uses its own default
     * ({@code %LOCALAPPDATA%\ms-playwright}).
     */
    private static String browsersPath() {
        String env = System.getenv("PLAYWRIGHT_BROWSERS_PATH");
        if (env != null && !env.isBlank()) return env;
        String os = System.getProperty("os.name", "").toLowerCase();
        return os.contains("win") ? null : DEFAULT_BROWSERS_PATH;
    }

    /** Build the Playwright instance, pinning the shared browsers dir if we have one. */
    private Playwright createPlaywright() {
        String path = browsersPath();
        if (path != null) {
            Playwright.CreateOptions opts = new Playwright.CreateOptions()
                    .setEnv(Collections.singletonMap("PLAYWRIGHT_BROWSERS_PATH", path));
            return Playwright.create(opts);
        }
        return Playwright.create();
    }

    /** Lazily launch (and lazily relaunch if Chromium died) a shared browser. */
    private synchronized Browser browser() {
        if (browser != null && browser.isConnected()) {
            return browser;
        }
        if (playwright == null) {
            playwright = createPlaywright();
        }
        try {
            browser = launchChromium();
        } catch (RuntimeException firstError) {
            if (looksLikeMissingBrowser(firstError)) {
                log.warn("Chromium not found — attempting one-time auto-install");
                installChromium();
                browser = launchChromium(); // retry; let it throw if still broken
            } else {
                throw firstError;
            }
        }
        log.info("Launched headless Chromium for PDF rendering");
        return browser;
    }

    private Browser launchChromium() {
        return playwright.chromium().launch(
                new BrowserType.LaunchOptions().setHeadless(true));
    }

    /** A missing-binary failure reads differently from a missing-syslib failure. */
    private boolean looksLikeMissingBrowser(Throwable t) {
        String msg = String.valueOf(t.getMessage()).toLowerCase();
        return msg.contains("executable doesn't exist")
                || msg.contains("please run the following command to download")
                || msg.contains("looks like playwright")
                || msg.contains("browsertype.launch");
    }

    /**
     * Download the Chromium binary via Playwright's own installer, serialised
     * across processes with a file lock so the ~10 client jars on this VPS don't
     * all download at once. Does NOT install system libraries (needs root).
     */
    private void installChromium() {
        String path = browsersPath();
        Path lockDir = Paths.get(path != null ? path : System.getProperty("java.io.tmpdir"));
        Path lockFile = lockDir.resolve(".bb-chromium-install.lock");
        try {
            Files.createDirectories(lockDir);
        } catch (IOException e) {
            log.warn("Could not create browsers dir {}: {}", lockDir, e.getMessage());
        }

        try (RandomAccessFile raf = new RandomAccessFile(lockFile.toFile(), "rw");
             FileChannel ch = raf.getChannel();
             FileLock lock = ch.lock()) {           // blocks until we hold the lock

            // Another process may have finished the install while we waited.
            try {
                launchChromium().close();
                log.info("Chromium became available while waiting for install lock");
                return;
            } catch (RuntimeException stillMissing) {
                // fall through and install
            }

            log.info("Downloading Chromium binary (one-time)…");
            runInstaller(path);
            log.info("Chromium binary installed");
        } catch (IOException e) {
            throw new IllegalStateException("Failed to acquire Chromium install lock", e);
        }
    }

    /**
     * Run {@code playwright install chromium} as a CHILD process via the bundled
     * driver — NOT {@code CLI.main}, which calls {@code System.exit} and would
     * tear down this server JVM. We seed the child's environment with the shared
     * {@code PLAYWRIGHT_BROWSERS_PATH} so the binary lands where every client
     * process looks for it.
     */
    private void runInstaller(String path) {
        Map<String, String> env = new HashMap<>();
        if (path != null) env.put("PLAYWRIGHT_BROWSERS_PATH", path);

        try {
            Driver driver = Driver.ensureDriverInstalled(env, true);
            ProcessBuilder pb = driver.createProcessBuilder();
            pb.command().addAll(java.util.Arrays.asList("install", "chromium"));
            pb.environment().putAll(env);
            pb.redirectErrorStream(true);
            pb.redirectOutput(ProcessBuilder.Redirect.INHERIT);

            Process proc = pb.start();
            int code = proc.waitFor();
            if (code != 0) {
                throw new IllegalStateException(installFailureMessage(code));
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Chromium auto-install failed: " + e.getMessage(), e);
        }
    }

    private String installFailureMessage(int code) {
        return "Playwright 'install chromium' exited with code " + code
                + ". If launch still fails the VPS is likely missing Chromium's "
                + "system libraries — run ONCE as root: "
                + "PLAYWRIGHT_BROWSERS_PATH=" + DEFAULT_BROWSERS_PATH + " "
                + "mvn exec:java -Dexec.mainClass=com.microsoft.playwright.CLI "
                + "-Dexec.args=\"install --with-deps chromium\"";
    }

    /**
     * Render the given full HTML document to a PDF byte array.
     *
     * The HTML is expected to carry its own {@code @page { size; margin }} rules
     * (the print stylesheet already does). We therefore tell Chromium to honour
     * the page CSS and not impose its own margins.
     */
    public byte[] render(String html) {
        try (Page page = browser().newPage()) {
            // Load the HTML directly; wait until network is idle so embedded
            // images / fonts (data URIs are instant, remote ones get a moment)
            // are painted before we snapshot.
            page.setContent(html, new Page.SetContentOptions()
                    .setWaitUntil(com.microsoft.playwright.options.WaitUntilState.NETWORKIDLE));
            page.waitForLoadState();

            return page.pdf(new Page.PdfOptions()
                    .setPrintBackground(true)            // amber bars, zebra rows, etc.
                    .setPreferCSSPageSize(true)          // honour the doc's own @page size
                    .setMargin(new Margin()              // doc CSS owns margins; zero here
                            .setTop("0").setBottom("0").setLeft("0").setRight("0")));
        }
    }

    @PreDestroy
    public void shutdown() {
        try {
            if (browser != null) browser.close();
        } catch (Exception e) {
            log.warn("Error closing Chromium: {}", e.getMessage());
        }
        try {
            if (playwright != null) playwright.close();
        } catch (Exception e) {
            log.warn("Error closing Playwright: {}", e.getMessage());
        }
    }
}
