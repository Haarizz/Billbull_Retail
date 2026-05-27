package com.billbull.backend.settings.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Properties;

@Service
public class EmailConfigService {

    private final EmailConfigRepository repo;

    public EmailConfigService(EmailConfigRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public EmailConfig getConfig() {
        return repo.findById(1L).orElseGet(() -> {
            EmailConfig empty = new EmailConfig();
            empty.setId(1L);
            empty.setSmtpHost("smtp.gmail.com");
            empty.setSmtpPort(587);
            empty.setFromName("BillBull ERP");
            empty.setEnabled(false);
            return empty;
        });
    }

    @Transactional(readOnly = true)
    public EmailConfig getConfigMasked() {
        EmailConfig config = getConfig();
        if (config.getPassword() != null && !config.getPassword().isBlank()) {
            config.setPassword("••••••••••••••••");
        }
        return config;
    }

    @Transactional
    public EmailConfig saveConfig(EmailConfig incoming) {
        incoming.setId(1L);
        // Preserve existing password if the masked placeholder is sent back
        if ("••••••••••••••••".equals(incoming.getPassword())) {
            repo.findById(1L).ifPresent(existing ->
                incoming.setPassword(existing.getPassword())
            );
        }
        return repo.save(incoming);
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

        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(config.getSmtpHost());
        sender.setPort(config.getSmtpPort() != null ? config.getSmtpPort() : 587);
        sender.setUsername(config.getUsername());
        sender.setPassword(config.getPassword());
        sender.setDefaultEncoding("UTF-8");

        Properties props = sender.getJavaMailProperties();
        props.put("mail.transport.protocol", "smtp");
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.connectiontimeout", "5000");
        props.put("mail.smtp.timeout", "5000");
        props.put("mail.smtp.writetimeout", "5000");

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
}
