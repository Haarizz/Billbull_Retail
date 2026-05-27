package com.billbull.backend.sales.quotation;

import com.billbull.backend.customer.messaging.MessageLog;
import com.billbull.backend.customer.messaging.MessagingService;
import com.billbull.backend.settings.email.EmailConfigService;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.util.ByteArrayDataSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class QuotationEmailService {

    private final EmailConfigService emailConfigService;
    private final MessagingService messagingService;

    public QuotationEmailService(EmailConfigService emailConfigService,
                                 MessagingService messagingService) {
        this.emailConfigService = emailConfigService;
        this.messagingService = messagingService;
    }

    // QA-040: legacy 3-arg signature preserved for internal callers.
    public void sendQuotationEmail(Quotation quotation, String toEmail, String subject)
            throws MessagingException, UnsupportedEncodingException {
        sendQuotationEmail(quotation, toEmail, subject, null, null);
    }

    // QA-040: 4-arg overload — pre-rendered HTML body from the frontend
    // (so the email mirrors whatever was designed in Print & Email Templates).
    public void sendQuotationEmail(Quotation quotation, String toEmail, String subject, String htmlBody)
            throws MessagingException, UnsupportedEncodingException {
        sendQuotationEmail(quotation, toEmail, subject, htmlBody, null);
    }

    // QA-040: 5-arg overload — htmlBody references images by `cid:<id>`, the
    // matching bytes ride along in `inlineAttachments` and are attached as
    // MIME inline parts. Keeps the body under Gmail's 102KB limit instead of
    // bloating it with data: URIs that get stripped on delivery.
    public void sendQuotationEmail(Quotation quotation, String toEmail, String subject,
                                   String htmlBody, List<Map<String, String>> inlineAttachments)
            throws MessagingException, UnsupportedEncodingException {

        String recipient = (toEmail != null && !toEmail.isBlank())
                ? toEmail : quotation.getCustomerEmail();

        if (recipient == null || recipient.isBlank()) {
            throw new IllegalArgumentException("No email address available for this customer.");
        }

        String emailSubject = (subject != null && !subject.isBlank())
                ? subject
                : "Quotation " + quotation.getQtnNo() + " from " + emailConfigService.getFromName();

        JavaMailSender sender = emailConfigService.buildMailSender();
        String fromAddress = emailConfigService.getFromAddress();
        String fromName = emailConfigService.getFromName();

        String body = (htmlBody != null && !htmlBody.isBlank())
                ? htmlBody
                : buildHtmlEmail(quotation, fromName);

        boolean hasInlineParts = inlineAttachments != null && !inlineAttachments.isEmpty();

        MimeMessage message = sender.createMimeMessage();
        // multipart=true is required as soon as we addInline anything.
        MimeMessageHelper helper = new MimeMessageHelper(message, hasInlineParts, "UTF-8");
        helper.setFrom(fromAddress, fromName);
        helper.setTo(recipient);
        helper.setSubject(emailSubject);
        helper.setText(body, true);

        if (hasInlineParts) {
            for (Map<String, String> att : inlineAttachments) {
                String cid = att.get("cid");
                String base64 = att.get("base64");
                String contentType = att.getOrDefault("contentType", "application/octet-stream");
                if (cid == null || cid.isBlank() || base64 == null || base64.isBlank()) continue;
                try {
                    byte[] bytes = Base64.getDecoder().decode(base64);
                    ByteArrayDataSource source = new ByteArrayDataSource(bytes, contentType);
                    // addInline(<cid>, ...) — JavaMail handles the Content-ID
                    // and angle-bracket wrapping so the email body's
                    // `src="cid:<cid>"` resolves on the recipient side.
                    helper.addInline(cid, source);
                } catch (IllegalArgumentException e) {
                    // Bad base64 — skip this attachment instead of failing the send.
                }
            }
        }

        sender.send(message);
        logEmail(quotation, recipient, emailSubject, "sent");
    }

    private void logEmail(Quotation q, String recipient, String subject, String status) {
        MessageLog log = new MessageLog();
        log.setRecipientName(q.getCustomer());
        log.setRecipientContact(recipient);
        log.setChannel("email");
        log.setStatus(status);
        log.setTitle(subject);
        log.setContent("Quotation email sent for " + q.getQtnNo());
        messagingService.logMessage(log);
    }

    private String buildHtmlEmail(Quotation q, String fromName) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd MMM yyyy");

        StringBuilder items = new StringBuilder();
        int index = 1;
        for (QuotationItem item : q.getItems()) {
            String bg = (index % 2 == 0) ? "#f9f9f9" : "#ffffff";
            BigDecimal lineTotal = item.getLineTotal() != null ? item.getLineTotal() : BigDecimal.ZERO;
            BigDecimal qty = item.getQuantity() != null ? item.getQuantity() : BigDecimal.ZERO;
            BigDecimal price = item.getPrice() != null ? item.getPrice() : BigDecimal.ZERO;
            items.append("<tr style=\"background:").append(bg).append(";\">")
                 .append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee;\">").append(index).append("</td>")
                 .append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee;\">")
                 .append(item.getDescription() != null ? item.getDescription() : item.getItemCode())
                 .append("</td>")
                 .append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee;text-align:center;\">")
                 .append(item.getUnit() != null ? item.getUnit() : "").append("</td>")
                 .append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee;text-align:center;\">")
                 .append(qty.stripTrailingZeros().toPlainString()).append("</td>")
                 .append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee;text-align:right;\">")
                 .append(formatAmount(price, q.getCurrency())).append("</td>")
                 .append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee;text-align:right;\">")
                 .append(formatAmount(lineTotal, q.getCurrency())).append("</td>")
                 .append("</tr>");
            index++;
        }

        String validTill = q.getValidTill() != null ? q.getValidTill().format(fmt) : "N/A";
        String date = q.getDate() != null ? q.getDate().format(fmt) : "N/A";
        String currency = q.getCurrency() != null ? q.getCurrency() : "";

        String notesSection = "";
        if (q.getNotesToCustomer() != null && !q.getNotesToCustomer().isBlank()) {
            notesSection = "<div style=\"margin:24px 32px 0;padding:16px;background:#fffbeb;"
                    + "border-left:4px solid #F5C742;border-radius:4px;\">"
                    + "<p style=\"margin:0 0 6px;font-weight:600;color:#555;\">Notes</p>"
                    + "<p style=\"margin:0;color:#333;font-size:14px;\">" + q.getNotesToCustomer() + "</p>"
                    + "</div>";
        }

        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>"
                + "<body style=\"margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;\">"
                + "<div style=\"max-width:680px;margin:32px auto;background:#fff;border-radius:8px;"
                + "overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);\">"

                + "<div style=\"background:#F5C742;padding:28px 32px;\">"
                + "<h1 style=\"margin:0;font-size:24px;color:#333;\">Quotation</h1>"
                + "<p style=\"margin:6px 0 0;font-size:16px;color:#555;font-weight:600;\">" + q.getQtnNo() + "</p>"
                + "</div>"

                + "<div style=\"padding:24px 32px;background:#fafafa;border-bottom:1px solid #eee;\">"
                + "<table style=\"width:100%;\"><tr>"
                + "<td style=\"vertical-align:top;\"><p style=\"margin:0 0 4px;font-size:12px;color:#888;\">CUSTOMER</p>"
                + "<p style=\"margin:0;font-weight:600;color:#333;font-size:15px;\">"
                + (q.getCustomer() != null ? q.getCustomer() : "") + "</p></td>"
                + "<td style=\"vertical-align:top;text-align:right;\">"
                + "<p style=\"margin:0 0 4px;font-size:12px;color:#888;\">DATE</p>"
                + "<p style=\"margin:0;color:#333;font-size:14px;\">" + date + "</p>"
                + "<p style=\"margin:8px 0 4px;font-size:12px;color:#888;\">VALID TILL</p>"
                + "<p style=\"margin:0;color:#e05252;font-size:14px;font-weight:600;\">" + validTill + "</p>"
                + "</td></tr></table></div>"

                + "<div style=\"padding:24px 32px;\">"
                + "<table style=\"width:100%;border-collapse:collapse;\">"
                + "<thead><tr style=\"background:#F5C742;\">"
                + "<th style=\"padding:10px 12px;text-align:left;font-size:13px;\">#</th>"
                + "<th style=\"padding:10px 12px;text-align:left;font-size:13px;\">Item</th>"
                + "<th style=\"padding:10px 12px;text-align:center;font-size:13px;\">Unit</th>"
                + "<th style=\"padding:10px 12px;text-align:center;font-size:13px;\">Qty</th>"
                + "<th style=\"padding:10px 12px;text-align:right;font-size:13px;\">Unit Price</th>"
                + "<th style=\"padding:10px 12px;text-align:right;font-size:13px;\">Total</th>"
                + "</tr></thead>"
                + "<tbody>" + items + "</tbody>"
                + "</table>"

                + "<table style=\"width:100%;margin-top:16px;\"><tr><td style=\"width:60%;\"></td><td>"
                + "<table style=\"width:100%;\">"
                + buildTotalRow("Subtotal", q.getSubTotal(), currency, false)
                + (q.getBillDiscount() != null && q.getBillDiscount().compareTo(BigDecimal.ZERO) > 0
                        ? buildTotalRow("Discount", q.getBillDiscount().negate(), currency, false) : "")
                + buildTotalRow("Tax", q.getTaxAmount(), currency, false)
                + buildTotalRow("Total", q.getTotalAmount(), currency, true)
                + "</table></td></tr></table></div>"

                + notesSection

                + "<div style=\"padding:20px 32px;background:#f4f4f4;border-top:1px solid #eee;"
                + "text-align:center;margin-top:24px;\">"
                + "<p style=\"margin:0;font-size:12px;color:#999;\">This quotation was generated by "
                + fromName + ". Please do not reply to this email.</p>"
                + "</div></div></body></html>";
    }

    private String buildTotalRow(String label, BigDecimal amount, String currency, boolean bold) {
        String val = formatAmount(amount, currency);
        String style = bold
                ? "padding:6px 12px;font-weight:700;font-size:15px;border-top:2px solid #F5C742;"
                : "padding:4px 12px;font-size:14px;color:#555;";
        return "<tr><td style=\"" + style + "\">" + label + "</td>"
                + "<td style=\"" + style + "text-align:right;\">" + val + "</td></tr>";
    }

    private String formatAmount(BigDecimal amount, String currency) {
        if (amount == null) return (currency != null ? currency + " " : "") + "0.00";
        return (currency != null ? currency + " " : "") + String.format("%,.2f", amount);
    }
}
