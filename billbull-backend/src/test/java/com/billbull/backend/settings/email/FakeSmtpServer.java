package com.billbull.backend.settings.email;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManagerFactory;
import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

/**
 * A one-connection SMTP server on the loopback interface, for transport tests. It records every
 * command and never relays anything. TLS uses a throwaway self-signed certificate made with the
 * JDK's keytool for each test run, so no key is committed and nothing leaves the machine.
 */
final class FakeSmtpServer implements AutoCloseable {

    enum Mode {
        /** Plain greeting, offers STARTTLS and upgrades on request (port 587 behaviour). */
        STARTTLS,
        /** TLS from the first byte (port 465 behaviour). */
        IMPLICIT_TLS
    }

    static final char[] STORE_PASSWORD = "changeit-test".toCharArray();

    final List<String> commands = new CopyOnWriteArrayList<>();
    final List<String> commandsAfterTls = new CopyOnWriteArrayList<>();
    private final ServerSocket server;
    private final Thread thread;
    private volatile boolean tls;

    /**
     * @param acceptAuth   false answers AUTH with 535
     * @param dataDelayMs  pause before answering the end of DATA, like a server scanning a large attachment
     */
    FakeSmtpServer(Mode mode, KeyStore keyStore, boolean acceptAuth, long dataDelayMs) throws Exception {
        SSLContext ctx = serverContext(keyStore);
        InetAddress loopback = InetAddress.getByName("localhost");
        this.server = mode == Mode.IMPLICIT_TLS
                ? ctx.getServerSocketFactory().createServerSocket(0, 1, loopback)
                : new ServerSocket(0, 1, loopback);
        if (server instanceof SSLServerSocket ssl) ssl.setNeedClientAuth(false);
        this.thread = new Thread(() -> serve(mode, ctx, acceptAuth, dataDelayMs), "fake-smtp");
        thread.setDaemon(true);
        thread.start();
    }

    int port() {
        return server.getLocalPort();
    }

    boolean receivedAuth() {
        return commands.stream().anyMatch(c -> c.toUpperCase().startsWith("AUTH"));
    }

    boolean receivedMessage() {
        return commands.stream().anyMatch(c -> c.startsWith("MAIL FROM"));
    }

    void awaitEnd() throws InterruptedException {
        thread.join(TimeUnit.SECONDS.toMillis(10));
    }

    @Override
    public void close() throws IOException {
        server.close();
    }

    private void serve(Mode mode, SSLContext ctx, boolean acceptAuth, long dataDelayMs) {
        try (Socket accepted = server.accept()) {
            Socket socket = accepted;
            tls = mode == Mode.IMPLICIT_TLS;
            socket.setSoTimeout(10_000);
            BufferedReader in = reader(socket);
            OutputStream out = socket.getOutputStream();
            write(out, "220 fake.local ESMTP");
            boolean inData = false;
            String line;
            while ((line = in.readLine()) != null) {
                if (inData) {
                    if (line.equals(".")) {
                        inData = false;
                        if (dataDelayMs > 0) Thread.sleep(dataDelayMs);
                        write(out, "250 2.0.0 queued");
                    }
                    continue;
                }
                commands.add(line);
                if (tls) commandsAfterTls.add(line);
                String verb = line.length() >= 4 ? line.substring(0, 4).toUpperCase() : line.toUpperCase();
                switch (verb) {
                    case "EHLO" -> write(out, tls
                            ? "250-fake.local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME"
                            : "250-fake.local\r\n250-STARTTLS\r\n250 8BITMIME");
                    case "STAR" -> {
                        write(out, "220 2.0.0 Ready to start TLS");
                        SSLSocket upgraded = (SSLSocket) ctx.getSocketFactory()
                                .createSocket(socket, "localhost", socket.getPort(), true);
                        upgraded.setUseClientMode(false);
                        upgraded.startHandshake();
                        socket = upgraded;
                        tls = true;
                        in = reader(socket);
                        out = socket.getOutputStream();
                    }
                    case "AUTH" -> {
                        if (!tls) {
                            write(out, "530 5.7.0 Must issue a STARTTLS command first");
                        } else if (acceptAuth) {
                            write(out, "235 2.7.0 Accepted");
                        } else {
                            write(out, "535 5.7.8 Username and Password not accepted");
                        }
                    }
                    case "DATA" -> {
                        write(out, "354 Go ahead");
                        inData = true;
                    }
                    case "QUIT" -> {
                        write(out, "221 bye");
                        return;
                    }
                    default -> write(out, "250 OK");
                }
            }
        } catch (Exception ignored) {
            // A failed handshake or the client hanging up ends the session; tests assert on what was recorded.
        }
    }

    private static BufferedReader reader(Socket socket) throws IOException {
        return new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
    }

    private static void write(OutputStream out, String reply) throws IOException {
        out.write((reply + "\r\n").getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    // ---------------- certificates ----------------

    /** A PKCS12 key store holding a fresh self-signed RSA key for {@code dnsName}. */
    static KeyStore selfSigned(String dnsName) throws Exception {
        Path dir = Files.createTempDirectory("fake-smtp-tls");
        Path file = dir.resolve("server.p12");
        String keytool = Path.of(System.getProperty("java.home"), "bin",
                System.getProperty("os.name").toLowerCase().contains("win") ? "keytool.exe" : "keytool").toString();
        Process p = new ProcessBuilder(keytool, "-genkeypair", "-alias", "smtp", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=" + dnsName, "-ext", "SAN=dns:" + dnsName, "-validity", "2",
                "-storetype", "PKCS12", "-keystore", file.toString(),
                "-storepass", new String(STORE_PASSWORD), "-keypass", new String(STORE_PASSWORD), "-noprompt")
                .redirectErrorStream(true).start();
        p.getInputStream().readAllBytes();
        if (!p.waitFor(60, TimeUnit.SECONDS) || p.exitValue() != 0) {
            throw new IllegalStateException("keytool failed");
        }
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream inStream = new FileInputStream(file.toFile())) {
            ks.load(inStream, STORE_PASSWORD);
        }
        Files.deleteIfExists(file);
        Files.deleteIfExists(dir);
        return ks;
    }

    /** A client socket factory that trusts exactly this key store's certificate, nothing else. */
    static SSLSocketFactory trusting(KeyStore keyStore) throws Exception {
        Certificate cert = keyStore.getCertificate("smtp");
        KeyStore trust = KeyStore.getInstance("PKCS12");
        trust.load(null, null);
        trust.setCertificateEntry("smtp", cert);
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trust);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, tmf.getTrustManagers(), null);
        return ctx.getSocketFactory();
    }

    private static SSLContext serverContext(KeyStore keyStore) throws Exception {
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, STORE_PASSWORD);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), null, null);
        return ctx;
    }
}
