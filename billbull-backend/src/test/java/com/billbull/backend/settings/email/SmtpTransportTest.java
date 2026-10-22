package com.billbull.backend.settings.email;

import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import javax.net.ssl.SSLSocketFactory;
import java.security.KeyStore;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * E2/E3: the sender built from the saved settings, against a loopback SMTP server, in both
 * security modes. Nothing reaches a real mail server.
 *
 * <p>Where a test needs the TLS handshake to succeed it gives JavaMail a socket factory that trusts
 * the test certificate only. Hostname checking stays on ({@code mail.smtp.ssl.checkserveridentity}),
 * so the mismatch test still fails. The untrusted-certificate tests use the sender as production
 * builds it, with the JDK trust store.
 */
class SmtpTransportTest {

    private static final String PASSWORD = "fake-app-password-for-tests";

    private static KeyStore localhostCert;
    private static KeyStore otherNameCert;

    private final EmailConfigRepository repo = mock(EmailConfigRepository.class);

    @BeforeAll
    static void certificates() throws Exception {
        localhostCert = FakeSmtpServer.selfSigned("localhost");
        otherNameCert = FakeSmtpServer.selfSigned("mail.example.com");
    }

    // ---------------- both modes work, and AUTH only ever travels inside TLS ----------------

    @Test
    void starttlsUpgradesBeforeAuthAndDelivers() throws Exception {
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, localhostCert, true, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.STARTTLS, smtp.port(), FakeSmtpServer.trusting(localhostCert));

            sender.send(message(sender));
            smtp.awaitEnd();

            assertTrue(smtp.commands.contains("STARTTLS"), smtp.commands.toString());
            assertTrue(smtp.receivedAuth());
            assertTrue(smtp.commandsAfterTls.stream().anyMatch(c -> c.startsWith("AUTH")), "AUTH after the upgrade");
            assertTrue(smtp.commandsAfterTls.stream().anyMatch(c -> c.startsWith("MAIL FROM")));
            int starttls = smtp.commands.indexOf("STARTTLS");
            for (int i = 0; i < starttls; i++) {
                assertFalse(smtp.commands.get(i).toUpperCase().startsWith("AUTH"), "AUTH before STARTTLS");
            }
        }
    }

    @Test
    void implicitSslSpeaksTlsFromTheFirstByteAndDelivers() throws Exception {
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.IMPLICIT_TLS, localhostCert, true, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.SSL, smtp.port(), FakeSmtpServer.trusting(localhostCert));

            sender.send(message(sender));
            smtp.awaitEnd();

            assertFalse(smtp.commands.contains("STARTTLS"), "no upgrade on an implicit TLS connection");
            assertEquals(smtp.commands, smtp.commandsAfterTls, "every command arrived over TLS");
            assertTrue(smtp.receivedAuth() && smtp.receivedMessage());
        }
    }

    // ---------------- TLS failures: nothing authenticates, nothing is sent ----------------

    @Test
    void starttlsWithAnUntrustedCertificateFailsBeforeAuth() throws Exception {
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, localhostCert, true, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.STARTTLS, smtp.port(), null); // JDK trust store

            MailException e = assertThrows(MailException.class, () -> sender.send(message(sender)));
            smtp.awaitEnd();

            assertEquals(SmtpErrorMessages.Kind.TLS, SmtpErrorMessages.describe(e, "localhost", smtp.port()).kind());
            assertFalse(smtp.receivedAuth(), smtp.commands.toString());
            assertFalse(smtp.receivedMessage());
        }
    }

    @Test
    void implicitSslWithAnUntrustedCertificateFails() throws Exception {
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.IMPLICIT_TLS, localhostCert, true, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.SSL, smtp.port(), null);

            MailException e = assertThrows(MailException.class, () -> sender.send(message(sender)));
            smtp.awaitEnd();

            assertEquals(SmtpErrorMessages.Kind.TLS, SmtpErrorMessages.describe(e, "localhost", smtp.port()).kind());
            assertTrue(smtp.commands.isEmpty(), "no SMTP command after a failed handshake: " + smtp.commands);
        }
    }

    @Test
    void aTrustedCertificateForAnotherHostNameIsRefused() throws Exception {
        // Trusted chain, wrong name: only the server-identity check stops this one.
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, otherNameCert, true, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.STARTTLS, smtp.port(), FakeSmtpServer.trusting(otherNameCert));

            MailException e = assertThrows(MailException.class, () -> sender.send(message(sender)));
            smtp.awaitEnd();

            assertEquals(SmtpErrorMessages.Kind.TLS, SmtpErrorMessages.describe(e, "localhost", smtp.port()).kind());
            assertFalse(smtp.receivedAuth(), smtp.commands.toString());
        }
    }

    @Test
    void sslModeAgainstAStarttlsPortFailsInsteadOfFallingBackToPlaintext() throws Exception {
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, localhostCert, true, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.SSL, smtp.port(), FakeSmtpServer.trusting(localhostCert));

            assertThrows(MailException.class, () -> sender.send(message(sender)));
            smtp.awaitEnd();

            assertFalse(smtp.receivedAuth());
            assertFalse(smtp.receivedMessage());
        }
    }

    // ---------------- authentication and timeouts ----------------

    @Test
    void aRejectedPasswordIsAnAuthenticationFailureWithAUsefulMessage() throws Exception {
        try (FakeSmtpServer smtp = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, localhostCert, false, 0)) {
            JavaMailSenderImpl sender = sender(SmtpSecurity.STARTTLS, smtp.port(), FakeSmtpServer.trusting(localhostCert));

            MailException e = assertThrows(MailException.class, () -> sender.send(message(sender)));
            smtp.awaitEnd();

            assertInstanceOf(MailAuthenticationException.class, e);
            SmtpErrorMessages.Described d = SmtpErrorMessages.describe(e, "localhost", smtp.port());
            assertEquals(SmtpErrorMessages.Kind.AUTHENTICATION, d.kind());
            assertTrue(d.message().contains("app password"), d.message());
            assertFalse(d.message().contains(PASSWORD));
            assertFalse(smtp.receivedMessage(), "nothing submitted after a failed login");
        }
    }

    /**
     * The read timeout covers the wait for the server's answer to DATA, which a server scanning a
     * large attachment can stretch. A timeout shorter than that wait fails a send the server would
     * have accepted (the old fixed 5 s); the default 30 s does not.
     */
    @Test
    void theReadTimeoutBoundsTheWaitForTheAnswerToData() throws Exception {
        try (FakeSmtpServer slow = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, localhostCert, true, 1_500)) {
            JavaMailSenderImpl tight = sender(new EmailConfigService(repo, 5_000, 500, 5_000),
                    SmtpSecurity.STARTTLS, slow.port(), FakeSmtpServer.trusting(localhostCert));

            MailException e = assertThrows(MailException.class, () -> tight.send(message(tight)));
            assertEquals(SmtpErrorMessages.Kind.TIMEOUT, SmtpErrorMessages.describe(e, "localhost", slow.port()).kind());
        }
        try (FakeSmtpServer slow = new FakeSmtpServer(FakeSmtpServer.Mode.STARTTLS, localhostCert, true, 1_500)) {
            JavaMailSenderImpl defaults = sender(SmtpSecurity.STARTTLS, slow.port(), FakeSmtpServer.trusting(localhostCert));

            defaults.send(message(defaults));
            slow.awaitEnd();
            assertTrue(slow.receivedMessage());
        }
    }

    @Test
    void nothingListeningIsAConnectFailure() throws Exception {
        int closedPort;
        try (java.net.ServerSocket s = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("localhost"))) {
            closedPort = s.getLocalPort();
        }
        JavaMailSenderImpl sender = sender(SmtpSecurity.STARTTLS, closedPort, null);

        MailException e = assertThrows(MailException.class, () -> sender.send(message(sender)));
        assertEquals(SmtpErrorMessages.Kind.CONNECT, SmtpErrorMessages.describe(e, "localhost", closedPort).kind());
    }

    // ---------------- fixtures ----------------

    private JavaMailSenderImpl sender(SmtpSecurity security, int port, SSLSocketFactory trust) {
        return sender(new EmailConfigService(repo), security, port, trust);
    }

    private JavaMailSenderImpl sender(EmailConfigService service, SmtpSecurity security, int port, SSLSocketFactory trust) {
        EmailConfig c = new EmailConfig();
        c.setSmtpHost("localhost");
        c.setSmtpPort(port);
        c.setSmtpSecurity(security.name());
        c.setUsername("billing@example.com");
        c.setPassword(PASSWORD);
        c.setEnabled(true);
        when(repo.findById(1L)).thenReturn(Optional.of(c));
        JavaMailSenderImpl sender = (JavaMailSenderImpl) service.buildMailSender();
        if (trust != null) {
            // An instance, so it must be put(), not setProperty(); see the Angus Mail SMTP docs.
            sender.getJavaMailProperties().put("mail.smtp.ssl.socketFactory", trust);
        }
        return sender;
    }

    private static MimeMessage message(JavaMailSenderImpl sender) throws Exception {
        MimeMessage m = sender.createMimeMessage();
        m.setFrom("billing@example.com");
        m.setRecipients(Message.RecipientType.TO, "customer@example.com");
        m.setSubject("Invoice INV-1");
        m.setText("body");
        return m;
    }
}
