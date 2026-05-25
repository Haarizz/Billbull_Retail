package com.billbull.backend.settings.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.util.ByteArrayDataSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * QA-040: Shared sender for designed-template document emails (Quotation,
 * Sales Order, Sales Invoice, Delivery Note, Proforma Invoice, Receipt
 * Voucher, etc.).
 *
 * The frontend renders the body with the same template as Print, runs juice
 * to inline CSS, and ships <img src="cid:..."> + a list of base64 inline
 * attachments. This service unwraps that payload into a multipart/related
 * MIME message via JavaMail.
 */
@Service
public class DocumentEmailSender {

    private final EmailConfigService emailConfigService;

    public DocumentEmailSender(EmailConfigService emailConfigService) {
        this.emailConfigService = emailConfigService;
    }

    /**
     * Returns the resolved "from name" for downstream loggers / subject
     * fallbacks.
     */
    public String getFromName() {
        return emailConfigService.getFromName();
    }

    /**
     * Sends an HTML email with optional CID-referenced inline attachments.
     *
     * @param toEmail         recipient address (required, non-blank)
     * @param subject         email subject (required, non-blank)
     * @param htmlBody        pre-rendered, juice-inlined HTML body
     * @param inlineAttachments list of { cid, base64, contentType } maps —
     *                          each becomes a MIME inline part referenced by
     *                          `<img src="cid:<id>">` in the body. May be
     *                          null/empty.
     */
    public void send(String toEmail, String subject, String htmlBody,
                     List<Map<String, String>> inlineAttachments)
            throws MessagingException, UnsupportedEncodingException {

        if (toEmail == null || toEmail.isBlank()) {
            throw new IllegalArgumentException("Recipient email is required.");
        }
        if (htmlBody == null || htmlBody.isBlank()) {
            throw new IllegalArgumentException("Email body is empty.");
        }

        JavaMailSender sender = emailConfigService.buildMailSender();
        String fromAddress = emailConfigService.getFromAddress();
        String fromName = emailConfigService.getFromName();

        boolean hasInlineParts = inlineAttachments != null && !inlineAttachments.isEmpty();

        MimeMessage message = sender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, hasInlineParts, "UTF-8");
        helper.setFrom(fromAddress, fromName);
        helper.setTo(toEmail);
        helper.setSubject(subject);
        helper.setText(htmlBody, true);

        if (hasInlineParts) {
            for (Map<String, String> att : inlineAttachments) {
                String cid = att.get("cid");
                String base64 = att.get("base64");
                String contentType = att.getOrDefault("contentType", "application/octet-stream");
                if (cid == null || cid.isBlank() || base64 == null || base64.isBlank()) continue;
                try {
                    byte[] bytes = Base64.getDecoder().decode(base64);
                    ByteArrayDataSource source = new ByteArrayDataSource(bytes, contentType);
                    helper.addInline(cid, source);
                } catch (IllegalArgumentException e) {
                    // Bad base64 — skip this attachment but continue with the send.
                }
            }
        }

        sender.send(message);
    }
}
