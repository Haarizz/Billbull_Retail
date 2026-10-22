package com.billbull.backend.settings.email;

import com.billbull.backend.document.DocumentPdfGuard;
import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.util.ByteArrayDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
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
 *
 * When the request also carries {@code pdfHtml} (the PRINT HTML, the same
 * string Download PDF and WhatsApp send — never the cid-rewritten email body),
 * it is rendered with {@link HtmlPdfService} and attached as a real
 * application/pdf part:
 * <pre>
 *   multipart/mixed
 *     multipart/related   (HTML body + cid inline images, unchanged)
 *     application/pdf     (attachment; filename from the server-side document number)
 * </pre>
 * The PDF is rendered and validated before anything is handed to SMTP, so a
 * render failure never produces an email without the attachment the user asked for.
 */
@Service
public class DocumentEmailSender {

    private static final Logger log = LoggerFactory.getLogger(DocumentEmailSender.class);

    /** See {@link DocumentPdfGuard#MAX_HTML_CHARS}. */
    static final int MAX_PDF_HTML_CHARS = DocumentPdfGuard.MAX_HTML_CHARS;

    /**
     * Upper bound on the rendered PDF. Base64 transfer encoding adds about a third,
     * so 15 MB stays inside the ~25 MB per-message limit of common SMTP providers
     * (Gmail included) with room for the inline images.
     */
    static final int MAX_PDF_BYTES = 15 * 1024 * 1024;

    private final EmailConfigService emailConfigService;
    private final BranchRepository branchRepository;
    private final HtmlPdfService pdfService;

    public DocumentEmailSender(EmailConfigService emailConfigService,
                               BranchRepository branchRepository,
                               HtmlPdfService pdfService) {
        this.emailConfigService = emailConfigService;
        this.branchRepository = branchRepository;
        this.pdfService = pdfService;
    }

    /**
     * A PDF to render from print HTML and attach. {@code filename} is built
     * server-side from the document number (see {@link #fromRequest}); the
     * client never names the attachment.
     */
    public record PdfAttachment(String html, String filename) {

        /**
         * Reads {@code pdfHtml} from a send-email request body. Returns null when the
         * key is absent or null — an older frontend that predates PDF attachments, which
         * keeps getting the HTML-only email. Any other value is a PDF request and is
         * validated when the email is sent.
         */
        public static PdfAttachment fromRequest(Map<String, Object> body, String documentNumber,
                                                String fallbackName) {
            Object raw = body != null ? body.get("pdfHtml") : null;
            if (raw == null) return null;
            if (!(raw instanceof String html)) {
                throw new IllegalArgumentException("pdfHtml must be a string.");
            }
            return new PdfAttachment(html, pdfFilename(documentNumber, fallbackName));
        }
    }

    /**
     * "{documentNumber}.pdf" reduced to safe ASCII (letters, digits, dot, dash,
     * underscore, space), so it needs no RFC 2231 encoding and cannot carry a path.
     */
    public static String pdfFilename(String documentNumber, String fallbackName) {
        String base = documentNumber != null && !documentNumber.isBlank() ? documentNumber : fallbackName;
        if (base == null || base.isBlank()) base = "document";
        base = base.trim()
                .replaceAll("\\.[Pp][Dd][Ff]$", "")
                .replaceAll("[^A-Za-z0-9._\\- ]", "_")
                .replaceAll("^[.\\s]+", "");
        if (base.length() > 100) base = base.substring(0, 100);
        if (base.isBlank()) base = "document";
        return base + ".pdf";
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
        send(toEmail, subject, htmlBody, inlineAttachments, null, null);
    }

    /**
     * Branch-aware variant — sets From display name and reply-to from the
     * branch profile when available (PDF §7.4). Falls back to globals.
     */
    public void send(String toEmail, String subject, String htmlBody,
                     List<Map<String, String>> inlineAttachments,
                     Long branchId)
            throws MessagingException, UnsupportedEncodingException {
        send(toEmail, subject, htmlBody, inlineAttachments, branchId, null);
    }

    /**
     * Full variant. {@code pdf} may be null (HTML-only email, as before). When it is
     * present the PDF is rendered and validated first; IllegalArgumentException for
     * bad input, IllegalStateException when the PDF cannot be produced — in both
     * cases nothing is sent.
     */
    public void send(String toEmail, String subject, String htmlBody,
                     List<Map<String, String>> inlineAttachments,
                     Long branchId, PdfAttachment pdf)
            throws MessagingException, UnsupportedEncodingException {

        if (toEmail == null || toEmail.isBlank()) {
            throw new IllegalArgumentException("Recipient email is required.");
        }
        if (htmlBody == null || htmlBody.isBlank()) {
            throw new IllegalArgumentException("Email body is empty.");
        }
        if (pdf != null) {
            validatePdfRequest(pdf);
        }

        // Config first: "email is disabled" should not cost a Chromium render.
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

        byte[] pdfBytes = pdf != null ? renderPdf(pdf) : null;

        boolean hasInlineParts = inlineAttachments != null && !inlineAttachments.isEmpty();

        MimeMessage message = sender.createMimeMessage();
        // multipart=true (MULTIPART_MODE_MIXED_RELATED) is required as soon as we
        // addInline or addAttachment anything: inline parts go into the
        // multipart/related, the PDF into the outer multipart/mixed.
        MimeMessageHelper helper = new MimeMessageHelper(message, hasInlineParts || pdfBytes != null, "UTF-8");
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

        if (pdfBytes != null) {
            helper.addAttachment(pdf.filename(), new ByteArrayResource(pdfBytes), "application/pdf");
        }

        sender.send(message);
    }

    private static void validatePdfRequest(PdfAttachment pdf) {
        if (pdf.html() == null || pdf.html().isBlank()) {
            throw new IllegalArgumentException("The PDF attachment could not be prepared: the document HTML is empty.");
        }
        if (pdf.html().length() > MAX_PDF_HTML_CHARS) {
            throw new IllegalArgumentException("The document is too large to attach as a PDF.");
        }
        if (pdf.filename() == null || pdf.filename().isBlank()) {
            throw new IllegalArgumentException("The PDF attachment has no file name.");
        }
    }

    /** Throws {@link DocumentPdfGuard.PdfRejectedException} (an IllegalStateException) before SMTP is touched. */
    private byte[] renderPdf(PdfAttachment pdf) {
        return DocumentPdfGuard.render(pdfService, pdf.html(), "email attachment " + pdf.filename(),
                MAX_PDF_BYTES, "PDF attachment", "the email was not sent");
    }

    static boolean isPdf(byte[] bytes) {
        return DocumentPdfGuard.hasSignature(bytes);
    }
}
