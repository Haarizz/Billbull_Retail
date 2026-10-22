package com.billbull.backend.settings.email;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/** T-P0-3: the SMTP sender requires TLS and checks the server's identity. */
@ExtendWith(MockitoExtension.class)
class EmailConfigServiceTest {

    private static final String PASSWORD = "fake-app-password-for-tests";

    @Mock private EmailConfigRepository repo;

    private EmailConfigService service;

    @BeforeEach
    void setUp() {
        service = new EmailConfigService(repo);
    }

    @Test
    void theSenderRequiresStartTlsAndChecksServerIdentity() {
        when(repo.findById(1L)).thenReturn(Optional.of(gmail()));

        JavaMailSenderImpl sender = (JavaMailSenderImpl) service.buildMailSender();
        Properties props = sender.getJavaMailProperties();

        assertEquals("smtp", props.getProperty("mail.transport.protocol"));
        assertEquals("true", props.getProperty("mail.smtp.auth"));
        assertEquals("true", props.getProperty("mail.smtp.starttls.enable"));
        assertEquals("true", props.getProperty("mail.smtp.starttls.required"));
        assertEquals("true", props.getProperty("mail.smtp.ssl.checkserveridentity"));
        assertNull(props.getProperty("mail.smtp.ssl.trust"), "no trust-all override");
        assertNull(props.getProperty("mail.smtp.ssl.enable"), "STARTTLS mode starts in plaintext and upgrades");
        // E3: 10 s to connect, 30 s per read/write (a 15 MB PDF on a slow uplink); see SmtpTransportTest.
        assertEquals("10000", props.getProperty("mail.smtp.connectiontimeout"));
        assertEquals("30000", props.getProperty("mail.smtp.timeout"));
        assertEquals("30000", props.getProperty("mail.smtp.writetimeout"));
        assertEquals("smtp.gmail.com", sender.getHost());
        assertEquals(587, sender.getPort());
        assertEquals("billing@example.com", sender.getUsername());
        assertEquals(PASSWORD, sender.getPassword());
    }

    @Test
    void sslModeUsesImplicitTlsAndStillChecksTheServer() {
        EmailConfig cfg = gmail();
        cfg.setSmtpPort(465);
        cfg.setSmtpSecurity("SSL");
        when(repo.findById(1L)).thenReturn(Optional.of(cfg));

        Properties props = ((JavaMailSenderImpl) service.buildMailSender()).getJavaMailProperties();

        assertEquals("true", props.getProperty("mail.smtp.ssl.enable"));
        assertEquals("true", props.getProperty("mail.smtp.ssl.checkserveridentity"));
        assertNull(props.getProperty("mail.smtp.starttls.enable"));
        assertNull(props.getProperty("mail.smtp.ssl.trust"), "no trust-all override");
    }

    @Test
    void aRowSavedBeforeTheSecurityModeExistedKeepsItsBehaviour() {
        EmailConfig legacy587 = gmail();
        legacy587.setSmtpSecurity(null);
        when(repo.findById(1L)).thenReturn(Optional.of(legacy587));
        assertEquals("true", ((JavaMailSenderImpl) service.buildMailSender()).getJavaMailProperties()
                .getProperty("mail.smtp.starttls.required"));

        EmailConfig legacy465 = gmail();
        legacy465.setSmtpSecurity(null);
        legacy465.setSmtpPort(465);
        when(repo.findById(1L)).thenReturn(Optional.of(legacy465));
        assertEquals("true", ((JavaMailSenderImpl) service.buildMailSender()).getJavaMailProperties()
                .getProperty("mail.smtp.ssl.enable"));
    }

    @Test
    void timeoutsComeFromConfigurationWithinBounds() {
        when(repo.findById(1L)).thenReturn(Optional.of(gmail()));
        Properties props = ((JavaMailSenderImpl) new EmailConfigService(repo, 7_000, 45_000, 60_000)
                .buildMailSender()).getJavaMailProperties();
        assertEquals("7000", props.getProperty("mail.smtp.connectiontimeout"));
        assertEquals("45000", props.getProperty("mail.smtp.timeout"));
        assertEquals("60000", props.getProperty("mail.smtp.writetimeout"));

        assertThrows(IllegalArgumentException.class, () -> new EmailConfigService(repo, 0, 30_000, 30_000));
        assertThrows(IllegalArgumentException.class, () -> new EmailConfigService(repo, 10_000, 600_000, 30_000));
    }

    @Test
    void thePropertiesReachTheJavaMailSession() {
        when(repo.findById(1L)).thenReturn(Optional.of(gmail()));

        Session session = ((JavaMailSenderImpl) service.buildMailSender()).getSession();

        assertEquals("true", session.getProperty("mail.smtp.starttls.required"));
        assertEquals("true", session.getProperty("mail.smtp.ssl.checkserveridentity"));
    }

    @Test
    void disabledOrUnconfiguredEmailStillRefusesToBuildASender() {
        EmailConfig off = gmail();
        off.setEnabled(false);
        when(repo.findById(1L)).thenReturn(Optional.of(off));
        assertThrows(IllegalStateException.class, () -> service.buildMailSender());
    }

    /**
     * A loopback SMTP server that offers AUTH but not STARTTLS, as a downgrade attack would leave
     * it. The send must fail before AUTH: the server never sees the credentials or the message.
     */
    @Test
    void aServerWithoutStartTlsNeverReceivesTheCredentialsOrTheMessage() throws Exception {
        List<String> received = new CopyOnWriteArrayList<>();
        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            Thread smtp = new Thread(() -> plaintextOnlySmtp(server, received));
            smtp.setDaemon(true);
            smtp.start();

            EmailConfig cfg = gmail();
            cfg.setSmtpHost("127.0.0.1");
            cfg.setSmtpPort(server.getLocalPort());
            when(repo.findById(1L)).thenReturn(Optional.of(cfg));
            JavaMailSender sender = service.buildMailSender();
            MimeMessage message = sender.createMimeMessage();
            message.setFrom("billing@example.com");
            message.setRecipients(jakarta.mail.Message.RecipientType.TO, "customer@example.com");
            message.setSubject("Invoice");
            message.setText("body");

            MailException e = assertThrows(MailException.class, () -> sender.send(message));
            assertTrue(String.valueOf(e.getMessage()).contains("STARTTLS"), e.getMessage());
            smtp.join(5000);
        }

        assertTrue(received.stream().anyMatch(c -> c.startsWith("EHLO")), "the client did connect: " + received);
        String b64 = Base64.getEncoder().encodeToString(PASSWORD.getBytes(StandardCharsets.UTF_8));
        for (String command : received) {
            assertFalse(command.toUpperCase().startsWith("AUTH"), "AUTH sent in plaintext: " + received);
            assertFalse(command.startsWith("MAIL FROM"), "message submitted in plaintext: " + received);
            assertFalse(command.contains(PASSWORD) || command.contains(b64), "credentials leaked");
        }
    }

    // ---------------- fixtures ----------------

    private static EmailConfig gmail() {
        EmailConfig c = new EmailConfig();
        c.setSmtpHost("smtp.gmail.com");
        c.setSmtpPort(587);
        c.setUsername("billing@example.com");
        c.setPassword(PASSWORD);
        c.setFromName("Acme Trading");
        c.setEnabled(true);
        return c;
    }

    /** Answers like an ESMTP server that offers AUTH but no STARTTLS, and records every command. */
    private static void plaintextOnlySmtp(ServerSocket server, List<String> received) {
        try (Socket client = server.accept()) {
            client.setSoTimeout(5000);
            BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
            OutputStream out = client.getOutputStream();
            write(out, "220 fake.local ESMTP");
            String line;
            while ((line = in.readLine()) != null) {
                received.add(line);
                String verb = line.length() >= 4 ? line.substring(0, 4).toUpperCase() : line.toUpperCase();
                switch (verb) {
                    case "EHLO" -> write(out, "250-fake.local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME");
                    case "HELO" -> write(out, "250 fake.local");
                    case "AUTH" -> write(out, "235 2.7.0 Accepted");
                    case "QUIT" -> {
                        write(out, "221 bye");
                        return;
                    }
                    default -> write(out, "250 OK");
                }
            }
        } catch (Exception ignored) {
            // the client hanging up is the expected end
        }
    }

    private static void write(OutputStream out, String reply) throws java.io.IOException {
        out.write((reply + "\r\n").getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }
}
