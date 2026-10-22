package com.billbull.backend.settings.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Properties;
import java.util.regex.Pattern;

@Service
public class EmailConfigService {

    private static final Logger log = LoggerFactory.getLogger(EmailConfigService.class);

    /**
     * What the previous settings page showed in the password box and sent back unchanged. Still
     * read as "keep the stored password" so a browser holding the old page cannot store it as the
     * password. Responses no longer contain it.
     */
    static final String LEGACY_MASK = "••••••••••••••••";

    static final String GMAIL_HOST = "smtp.gmail.com";

    /** Connect: the server is down or a firewall drops 587/465. Read/write: a 15 MB PDF on a slow uplink. */
    static final int DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
    static final int DEFAULT_READ_TIMEOUT_MS = 30_000;
    static final int DEFAULT_WRITE_TIMEOUT_MS = 30_000;
    private static final int MAX_TIMEOUT_MS = 120_000;

    /** One DNS label: letters, digits and inner hyphens. */
    private static final Pattern HOST_LABEL = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");
    private static final Pattern IPV4 = Pattern.compile("\\d{1,3}(?:\\.\\d{1,3}){3}");
    private static final int MAX_FROM_NAME = 100;

    private final EmailConfigRepository repo;
    private final int connectTimeoutMs;
    private final int readTimeoutMs;
    private final int writeTimeoutMs;

    @Autowired
    public EmailConfigService(EmailConfigRepository repo,
                              @Value("${billbull.mail.smtp.connection-timeout-ms:10000}") int connectTimeoutMs,
                              @Value("${billbull.mail.smtp.read-timeout-ms:30000}") int readTimeoutMs,
                              @Value("${billbull.mail.smtp.write-timeout-ms:30000}") int writeTimeoutMs) {
        this.repo = repo;
        this.connectTimeoutMs = requireTimeout(connectTimeoutMs, "connection-timeout-ms");
        this.readTimeoutMs = requireTimeout(readTimeoutMs, "read-timeout-ms");
        this.writeTimeoutMs = requireTimeout(writeTimeoutMs, "write-timeout-ms");
    }

    public EmailConfigService(EmailConfigRepository repo) {
        this(repo, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS);
    }

    @Transactional(readOnly = true)
    public EmailConfig getConfig() {
        return repo.findById(1L).orElseGet(() -> {
            EmailConfig empty = new EmailConfig();
            empty.setId(1L);
            empty.setSmtpHost(GMAIL_HOST);
            empty.setSmtpPort(SmtpSecurity.STARTTLS.standardPort());
            empty.setSmtpSecurity(SmtpSecurity.STARTTLS.name());
            empty.setFromName("BillBull ERP");
            empty.setEnabled(false);
            return empty;
        });
    }

    /** The settings as the page sees them: everything but the password, plus whether one is stored. */
    @Transactional(readOnly = true)
    public EmailConfigResponse getConfigView() {
        return EmailConfigResponse.of(getConfig());
    }

    /**
     * Validates the whole request before changing anything, then saves. The stored password is
     * kept unless the request carries a new one or asks to clear it (see {@link EmailConfigRequest}).
     *
     * @throws ResponseStatusException 400 naming the field to fix. The message never contains the
     *         password, and quotes the host or address only when it is malformed, not a secret.
     */
    @Transactional
    public EmailConfigResponse saveConfig(EmailConfigRequest in) {
        String host = requireHost(in.getSmtpHost());
        int port = requirePort(in.getSmtpPort());
        SmtpSecurity security = requireSecurity(in.getSmtpSecurity(), port);
        String username = trimToNull(in.getUsername());
        if (username != null) requireEmail(username);
        String fromName = requireFromName(in.getFromName());
        boolean enabled = Boolean.TRUE.equals(in.getEnabled());

        boolean clear = Boolean.TRUE.equals(in.getClearPassword());
        String replacement = in.getPassword() == null || in.getPassword().isBlank()
                || LEGACY_MASK.equals(in.getPassword()) ? null : in.getPassword().strip();
        if (clear && replacement != null) {
            throw badRequest("Either type a new app password or remove the saved one, not both.");
        }

        EmailConfig config = repo.findById(1L).orElseGet(EmailConfig::new);
        String password = clear ? null : replacement != null ? replacement : config.getPassword();
        if (enabled && username == null) {
            throw badRequest("Enter the Email Address before enabling email.");
        }
        if (enabled && (password == null || password.isEmpty())) {
            throw badRequest("Enter the app password before enabling email.");
        }

        config.setId(1L);
        config.setSmtpHost(host);
        config.setSmtpPort(port);
        config.setSmtpSecurity(security.name());
        config.setUsername(username);
        config.setFromName(fromName);
        config.setEnabled(enabled);
        config.setPassword(password);
        EmailConfig saved = repo.save(config);
        log.info("Email settings saved: host={} port={} security={} enabled={} password={}",
                host, port, security, enabled, clear ? "removed" : replacement != null ? "replaced" : "unchanged");
        return EmailConfigResponse.of(saved);
    }

    public JavaMailSender buildMailSender() {
        EmailConfig config = repo.findById(1L)
                .orElseThrow(() -> new IllegalStateException(
                        "Email is not configured. Go to Settings → Email Settings to set it up."));

        if (!Boolean.TRUE.equals(config.getEnabled())) {
            throw new IllegalStateException(
                    "Email is disabled. Go to Settings → Email Settings and enable it.");
        }
        if (config.getSmtpHost() == null || config.getSmtpHost().isBlank()) {
            throw new IllegalStateException(
                    "SMTP host is not configured. Go to Settings → Email Settings.");
        }

        int port = config.getSmtpPort() != null ? config.getSmtpPort() : SmtpSecurity.STARTTLS.standardPort();
        SmtpSecurity security = SmtpSecurity.resolve(config.getSmtpSecurity(), port);

        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(config.getSmtpHost());
        sender.setPort(port);
        sender.setUsername(config.getUsername());
        sender.setPassword(config.getPassword());
        sender.setDefaultEncoding("UTF-8");

        Properties props = sender.getJavaMailProperties();
        props.put("mail.transport.protocol", "smtp");
        props.put("mail.smtp.auth", "true");
        if (security == SmtpSecurity.SSL) {
            // Implicit TLS: the socket is TLS before the greeting, so there is nothing to upgrade.
            props.put("mail.smtp.ssl.enable", "true");
        } else {
            // A server (or anything in between) that does not offer STARTTLS fails the send instead
            // of receiving AUTH and the app password in plaintext.
            props.put("mail.smtp.starttls.enable", "true");
            props.put("mail.smtp.starttls.required", "true");
        }
        // Both modes: the JDK trust store decides the certificate (no mail.smtp.ssl.trust override)
        // and the certificate must name the configured host.
        props.put("mail.smtp.ssl.checkserveridentity", "true");
        props.put("mail.smtp.connectiontimeout", String.valueOf(connectTimeoutMs));
        props.put("mail.smtp.timeout", String.valueOf(readTimeoutMs));
        props.put("mail.smtp.writetimeout", String.valueOf(writeTimeoutMs));

        return sender;
    }

    public String getFromAddress() {
        return getConfig().getUsername();
    }

    public String getFromName() {
        String name = getConfig().getFromName();
        return (name != null && !name.isBlank()) ? name : "BillBull ERP";
    }

    public void sendTestEmail(String toEmail) throws MessagingException, java.io.UnsupportedEncodingException {
        JavaMailSender sender = buildMailSender();
        MimeMessage message = sender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
        helper.setFrom(getFromAddress(), getFromName());
        helper.setTo(toEmail);
        helper.setSubject("BillBull ERP — Email Test");
        helper.setText(
            "<div style='font-family:Arial,sans-serif;padding:24px'>"
            + "<h2 style='color:#F5C742'>Email Setup Successful!</h2>"
            + "<p>Your BillBull ERP email configuration is working correctly.</p>"
            + "<p style='color:#888;font-size:12px'>Sent from BillBull ERP Email Settings</p>"
            + "</div>", true);
        sender.send(message);
    }

    // ---------------- validation ----------------

    /**
     * A DNS host name such as smtp.office365.com. IP addresses are refused: the certificate check
     * needs the name the certificate was issued for.
     */
    static String requireHost(String raw) {
        String host = trimToNull(raw);
        if (host == null) {
            throw badRequest("Enter the SMTP host, for example smtp.gmail.com.");
        }
        host = host.toLowerCase(Locale.ROOT);
        if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        if (IPV4.matcher(host).matches() || host.contains(":")) {
            throw badRequest("Enter the SMTP server's host name (for example smtp.gmail.com), not an IP address: "
                    + "the server's certificate is checked against that name.");
        }
        String[] labels = host.split("\\.", -1);
        boolean valid = host.length() <= 253 && labels.length >= 2
                && labels[labels.length - 1].matches("[a-z]{2,63}");
        for (String label : labels) {
            valid &= HOST_LABEL.matcher(label).matches();
        }
        if (!valid) {
            throw badRequest("SMTP host must be a host name such as smtp.gmail.com, without http:// or a port.");
        }
        return host;
    }

    static int requirePort(Integer port) {
        if (port == null || port < 1 || port > 65_535) {
            throw badRequest("SMTP port must be a number from 1 to 65535 (587 for STARTTLS, 465 for SSL).");
        }
        return port;
    }

    /**
     * 465 is implicit TLS and 587/25 are STARTTLS ports; the other mode on those ports cannot
     * connect, so it is refused here rather than as a confusing timeout on the first send.
     * Other ports are a provider's choice and accept either mode.
     */
    static SmtpSecurity requireSecurity(String raw, int port) {
        SmtpSecurity security;
        try {
            security = raw == null || raw.isBlank() ? SmtpSecurity.resolve(null, port) : SmtpSecurity.parse(raw);
        } catch (IllegalArgumentException e) {
            throw badRequest(e.getMessage());
        }
        if (security == SmtpSecurity.STARTTLS && port == SmtpSecurity.SSL.standardPort()) {
            throw badRequest("Port 465 uses SSL (implicit TLS). Choose SSL, or use port 587 for STARTTLS.");
        }
        if (security == SmtpSecurity.SSL && (port == SmtpSecurity.STARTTLS.standardPort() || port == 25)) {
            throw badRequest("Port " + port + " uses STARTTLS. Choose STARTTLS, or use port 465 for SSL.");
        }
        return security;
    }

    static void requireEmail(String value) {
        try {
            InternetAddress address = new InternetAddress(value, true);
            String domain = value.substring(value.lastIndexOf('@') + 1);
            if (address.getPersonal() != null || !value.equals(address.getAddress())
                    || value.indexOf('@') < 1 || !domain.contains(".") || value.length() > 254) {
                throw new AddressException();
            }
        } catch (AddressException | StringIndexOutOfBoundsException e) {
            throw badRequest("Email Address must be a single address such as accounts@example.com.");
        }
    }

    /** Header text: no line breaks, a reasonable length. Blank means the default name. */
    static String requireFromName(String raw) {
        String name = trimToNull(raw);
        if (name == null) return null;
        if (name.indexOf('\r') >= 0 || name.indexOf('\n') >= 0) {
            throw badRequest("Sender Name cannot contain line breaks.");
        }
        if (name.length() > MAX_FROM_NAME) {
            throw badRequest("Sender Name can be at most " + MAX_FROM_NAME + " characters.");
        }
        return name;
    }

    private static int requireTimeout(int value, String name) {
        if (value <= 0 || value > MAX_TIMEOUT_MS) {
            throw new IllegalArgumentException("billbull.mail.smtp." + name + " must be between 1 and " + MAX_TIMEOUT_MS);
        }
        return value;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
