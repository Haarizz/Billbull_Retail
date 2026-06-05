package com.billbull.backend.settings.email;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
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
    private final BranchRepository branchRepository;

    public DocumentEmailSender(EmailConfigService emailConfigService,
                               BranchRepository branchRepository) {
        this.emailConfigService = emailConfigService;
        this.branchRepository = branchRepository;
    }

    /**
     * Returns the resolved "from name" for downstream loggers / subject
     * fallbacks.
     */
    public String getFromName() {
        return emailConfigService.getFromName();
    }

    /**
     * PDF §7.4: "From" display name reflects the branch under which the
     * originating transaction was created — e.g. "MyCompany — Dubai Branch".
     * Returns the suffix "{Company} — {Branch}" when {@code branchId} resolves,
     * else the plain configured From name.
     */
    public String getFromNameForBranch(Long branchId) {
        String base = emailConfigService.getFromName();
        if (branchId == null) return base;
        Branch branch = branchRepository.findById(branchId).orElse(null);
        if (branch == null || branch.getName() == null || branch.getName().isBlank()) return base;
        return base + " — " + branch.getName();
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
        send(toEmail, subject, htmlBody, inlineAttachments, null);
    }

    /**
     * Branch-aware variant — sets From display name and reply-to from the
     * branch profile when available (PDF §7.4). Falls back to globals.
     */
    public void send(String toEmail, String subject, String htmlBody,
                     List<Map<String, String>> inlineAttachments,
                     Long branchId)
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
        String replyTo = null;

        if (branchId != null) {
            Branch branch = branchRepository.findById(branchId).orElse(null);
            if (branch != null) {
                if (branch.getName() != null && !branch.getName().isBlank()) {
                    fromName = fromName + " — " + branch.getName();
                }
                if (branch.getEmail() != null && !branch.getEmail().isBlank()) {
                    replyTo = branch.getEmail();
                }
            }
        }

        boolean hasInlineParts = inlineAttachments != null && !inlineAttachments.isEmpty();

        MimeMessage message = sender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, hasInlineParts, "UTF-8");
        helper.setFrom(fromAddress, fromName);
        if (replyTo != null) {
            helper.setReplyTo(replyTo);
        }
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
