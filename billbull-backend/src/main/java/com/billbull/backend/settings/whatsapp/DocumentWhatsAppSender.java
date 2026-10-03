package com.billbull.backend.settings.whatsapp;

import com.billbull.backend.document.HtmlPdfService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Shared "send this document's PDF to a customer on WhatsApp" flow — the WhatsApp counterpart of
 * {@code DocumentEmailSender}. Module-agnostic: the caller passes the same print HTML its Download
 * PDF button uses (rendered here with {@link HtmlPdfService}, so the attachment is identical), the
 * document type (which picks the template) and the template's body variables.
 *
 * Steps: check config + normalise number → render PDF → upload to Meta → send template with the
 * PDF as header → log. Config and phone are checked before rendering, which is the slow part.
 * Every attempt is logged, including failures, so the outcome is visible on the document.
 * Not @Transactional on purpose: no DB transaction is held open across the Meta HTTP calls.
 */
@Service
public class DocumentWhatsAppSender {

    private static final Logger log = LoggerFactory.getLogger(DocumentWhatsAppSender.class);

    private final WhatsAppConfigService configService;
    private final WhatsAppCloudApiClient client;
    private final WhatsAppMessageLogRepository logRepository;
    private final HtmlPdfService pdfService;

    public DocumentWhatsAppSender(WhatsAppConfigService configService,
                                  WhatsAppCloudApiClient client,
                                  WhatsAppMessageLogRepository logRepository,
                                  HtmlPdfService pdfService) {
        this.configService = configService;
        this.client = client;
        this.logRepository = logRepository;
        this.pdfService = pdfService;
    }

    public record SendRequest(
            WhatsAppDocumentType documentType,
            Long documentId,
            String documentNo,
            Long branchId,
            String rawPhone,
            String html,
            String filename,
            List<String> bodyParams) {}

    /**
     * Throws IllegalStateException when WhatsApp or this document's template is not set up, and
     * IllegalArgumentException for missing HTML or a bad phone number (both before anything is
     * rendered or logged); WhatsAppApiException when Meta rejects the call (logged as FAILED first).
     */
    public WhatsAppMessageLog send(SendRequest request) {
        if (request.html() == null || request.html().isBlank()) {
            throw new IllegalArgumentException("Document HTML is required.");
        }
        WhatsAppConfig cfg = configService.requireReady(request.documentType());
        String templateName = request.documentType().templateName(cfg);
        String to = PhoneNumberNormalizer.normalize(request.rawPhone(), cfg.getDefaultCountryCode());
        byte[] pdf = pdfService.render(request.html());
        String filename = safeFilename(request.filename(), request.documentNo());

        WhatsAppMessageLog entry = new WhatsAppMessageLog();
        entry.setDocumentType(request.documentType().name());
        entry.setDocumentId(request.documentId());
        entry.setDocumentNo(request.documentNo());
        entry.setBranchId(request.branchId());
        entry.setToPhone(to);
        entry.setTemplateName(templateName);
        entry.setStatusUpdatedAt(LocalDateTime.now());

        try {
            String mediaId = client.uploadMedia(cfg, pdf, filename, "application/pdf");
            String wamid = client.sendDocumentTemplate(cfg, to, templateName, mediaId, filename, request.bodyParams());
            entry.setWamid(wamid);
            entry.setStatus(WhatsAppMessageStatus.ACCEPTED);
            return logRepository.save(entry);
        } catch (WhatsAppApiException e) {
            log.warn("WhatsApp send failed for {} {} to {}: {}", request.documentType(), request.documentNo(), to, e.getMessage());
            entry.setStatus(WhatsAppMessageStatus.FAILED);
            entry.setErrorCode(e.getMetaCode());
            entry.setErrorMessage(e.getMessage());
            logRepository.save(entry);
            throw e;
        }
    }

    static String safeFilename(String filename, String documentNo) {
        String base = filename != null && !filename.isBlank() ? filename
                : (documentNo != null && !documentNo.isBlank() ? documentNo : "document");
        base = base.replaceAll("\\.[Pp][Dd][Ff]$", "").replaceAll("[^A-Za-z0-9._\\- ]", "_");
        return base + ".pdf";
    }
}
