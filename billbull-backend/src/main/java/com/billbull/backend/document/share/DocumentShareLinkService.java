package com.billbull.backend.document.share;

import com.billbull.backend.document.DocumentPdfGuard;
import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.quotation.Quotation;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.quotation.QuotationService;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderService;
import com.billbull.backend.settings.company.CompanyProfile;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.billbull.backend.settings.whatsapp.WhatsAppDocumentType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Public links to sales documents, for sending on WhatsApp without the Meta API (the message
 * carries the link; the customer opens a page with the summary and the PDF).
 *
 * <p>Creating a link needs a signed-in user who can open the document: it is loaded through the
 * document's own service, so branch scope and record ownership apply exactly as for Download PDF.
 * Reading a link needs only the token (256 random bits; only its SHA-256 is stored), so the public
 * side reads the document straight from its repository.
 *
 * <p>The HTML is stored when the link is made; the PDF is rendered from it on the first PDF request
 * and kept, so making a link is fast and links nobody opens never cost a render.
 */
@Service
public class DocumentShareLinkService {

    static final Pattern TOKEN_FORMAT = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    /** Same practical ceiling as an email attachment; real documents are far smaller. */
    static final int MAX_PDF_BYTES = 25 * 1024 * 1024;
    static final String PATH_PREFIX = "/d/";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final DocumentShareLinkRepository repository;
    private final SalesInvoiceService invoiceService;
    private final SalesInvoiceRepository invoiceRepository;
    private final QuotationService quotationService;
    private final QuotationRepository quotationRepository;
    private final SalesOrderService salesOrderService;
    private final SalesOrderRepository salesOrderRepository;
    private final CompanyProfileService companyProfileService;
    private final HtmlPdfService pdfService;
    private final int ttlDays;

    public DocumentShareLinkService(DocumentShareLinkRepository repository,
                                    SalesInvoiceService invoiceService,
                                    SalesInvoiceRepository invoiceRepository,
                                    QuotationService quotationService,
                                    QuotationRepository quotationRepository,
                                    SalesOrderService salesOrderService,
                                    SalesOrderRepository salesOrderRepository,
                                    CompanyProfileService companyProfileService,
                                    HtmlPdfService pdfService,
                                    @Value("${billbull.document-links.ttl-days:180}") int ttlDays) {
        this.repository = repository;
        this.invoiceService = invoiceService;
        this.invoiceRepository = invoiceRepository;
        this.quotationService = quotationService;
        this.quotationRepository = quotationRepository;
        this.salesOrderService = salesOrderService;
        this.salesOrderRepository = salesOrderRepository;
        this.companyProfileService = companyProfileService;
        this.pdfService = pdfService;
        this.ttlDays = ttlDays;
    }

    /** Company details shown at the top of the public page. */
    public record Company(String name, String localName, String logoPath, String phone, String mobile,
                          String email, String address, String city, String country, String trn, String website) {
        static Company of(CompanyProfile p) {
            return new Company(p.getCompanyName(), p.getLocalName(), p.getLogoPath(), p.getPhone(), p.getMobile(),
                    p.getEmail(), p.getAddress(), p.getCity(), p.getCountry(), p.getTrn(), p.getWebsite());
        }
    }

    /** Returned once, to the user who made the link: the only time the token is known. */
    public record Created(String token, String path, LocalDateTime expiresAt,
                          DocumentShareSummary summary, Company company) {}

    /** A previous link to the same document, for the send dialog's history. */
    public record LinkInfo(Long id, LocalDateTime createdAt, String createdBy, int viewCount,
                           LocalDateTime lastViewedAt, LocalDateTime expiresAt) {}

    /** What the customer's page shows. */
    public record PublicView(DocumentShareSummary summary, Company company, String html,
                             LocalDateTime sharedAt, LocalDateTime expiresAt) {}

    public record Pdf(byte[] bytes, String filename) {}

    private record Loaded(DocumentShareSummary summary, Long branchId) {}

    // ───────────────────────── staff side ─────────────────────────

    /**
     * Throws IllegalArgumentException for missing/oversized HTML; whatever the document's service
     * throws when the user may not open it (branch scope / ownership / not found).
     */
    public Created create(WhatsAppDocumentType type, Long documentId, String html) {
        return create(type, documentId, html, null);
    }

    /**
     * @param presentation "RECEIPT" shows a sales invoice as a receipt (POS sales); anything else,
     *                     or any other document type, keeps the type's own label
     */
    public Created create(WhatsAppDocumentType type, Long documentId, String html, String presentation) {
        if (html == null || html.isBlank()) {
            throw new IllegalArgumentException("Document HTML is required.");
        }
        if (html.length() > DocumentPdfGuard.MAX_HTML_CHARS) {
            throw new IllegalArgumentException("The document is too large to share.");
        }
        // A POS receipt is a sales invoice row: store it as one, labelled "Receipt".
        if (type == WhatsAppDocumentType.POS_RECEIPT) {
            type = WhatsAppDocumentType.SALES_INVOICE;
            presentation = "RECEIPT";
        }
        Loaded doc = loadWithAccessCheck(type, documentId);
        String label = labelFor(type, presentation);

        String token = newToken();
        DocumentShareLink link = new DocumentShareLink();
        link.setTokenHash(sha256(token));
        link.setDocumentType(type.name());
        link.setDocumentId(documentId);
        link.setDocumentNo(doc.summary().documentNo());
        link.setBranchId(doc.branchId());
        link.setDocumentLabel(label);
        link.setHtml(html);
        link.setExpiresAt(ttlDays > 0 ? LocalDateTime.now().plusDays(ttlDays) : null);
        repository.save(link);

        return new Created(token, PATH_PREFIX + token, link.getExpiresAt(), doc.summary().withLabel(label),
                Company.of(companyProfileService.getProfile()));
    }

    static String labelFor(WhatsAppDocumentType type, String presentation) {
        return type == WhatsAppDocumentType.SALES_INVOICE && "RECEIPT".equalsIgnoreCase(presentation) ? "Receipt" : null;
    }

    public List<LinkInfo> history(WhatsAppDocumentType type, Long documentId) {
        loadWithAccessCheck(type, documentId);
        return repository.findTop10ByDocumentTypeAndDocumentIdAndIsActiveTrueOrderByIdDesc(type.name(), documentId)
                .stream()
                .map(l -> new LinkInfo(l.getId(), l.getCreatedAt(), l.getCreatedBy(), l.getViewCount(),
                        l.getLastViewedAt(), l.getExpiresAt()))
                .toList();
    }

    private Loaded loadWithAccessCheck(WhatsAppDocumentType type, Long id) {
        String currency = companyProfileService.getProfile().getCurrency();
        return switch (type) {
            case SALES_INVOICE, POS_RECEIPT -> {
                SalesInvoice inv = invoiceService.getById(id);
                yield new Loaded(DocumentShareSummary.of(inv, currency, LocalDate.now()), inv.getBranchId());
            }
            case QUOTATION -> {
                Quotation q = quotationService.getQuotationById(id);
                yield new Loaded(DocumentShareSummary.of(q, currency, LocalDate.now()), q.getBranchId());
            }
            case SALES_ORDER -> {
                SalesOrder so = salesOrderService.getById(id);
                yield new Loaded(DocumentShareSummary.of(so, currency),
                        so.getBranch() != null ? so.getBranch().getId() : null);
            }
        };
    }

    // ───────────────────────── public side ─────────────────────────

    /** 404 for an unknown or revoked link, 410 when it expired or the document was deleted. */
    public PublicView view(String token) {
        DocumentShareLink link = requireLink(token);
        DocumentShareSummary summary = liveSummary(link);
        repository.recordView(link.getId(), LocalDateTime.now());
        return new PublicView(summary, Company.of(companyProfileService.getProfile()), link.getHtml(),
                link.getCreatedAt(), link.getExpiresAt());
    }

    /**
     * Renders on first request (outside any transaction — the render is slow) and keeps the result.
     * Two concurrent first requests both render; only the first store wins, which is harmless.
     */
    public Pdf pdf(String token) {
        DocumentShareLink link = requireLink(token);
        liveSummary(link);
        String filename = safeFilename(link.getDocumentNo());
        byte[] pdf = link.getPdf();
        if (pdf == null || pdf.length == 0) {
            pdf = DocumentPdfGuard.render(pdfService, link.getHtml(), "share link " + filename,
                    MAX_PDF_BYTES, "PDF", "it cannot be downloaded right now");
            repository.storePdf(link.getId(), pdf);
        }
        return new Pdf(pdf, filename);
    }

    private DocumentShareLink requireLink(String token) {
        if (token == null || !TOKEN_FORMAT.matcher(token).matches()) {
            throw notFound();
        }
        DocumentShareLink link = repository.findByTokenHash(sha256(token))
                .filter(DocumentShareLink::isActive)
                .orElseThrow(DocumentShareLinkService::notFound);
        if (link.isExpired(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "This link has expired. Please ask the sender for a new one.");
        }
        return link;
    }

    private DocumentShareSummary liveSummary(DocumentShareLink link) {
        WhatsAppDocumentType type = WhatsAppDocumentType.parse(link.getDocumentType());
        String currency = companyProfileService.getProfile().getCurrency();
        DocumentShareSummary summary = type == null ? null : switch (type) {
            case SALES_INVOICE, POS_RECEIPT -> invoiceRepository.findById(link.getDocumentId())
                    .map(inv -> DocumentShareSummary.of(inv, currency, LocalDate.now())).orElse(null);
            case QUOTATION -> quotationRepository.findById(link.getDocumentId())
                    .map(q -> DocumentShareSummary.of(q, currency, LocalDate.now())).orElse(null);
            case SALES_ORDER -> salesOrderRepository.findById(link.getDocumentId())
                    .map(so -> DocumentShareSummary.of(so, currency)).orElse(null);
        };
        if (summary == null) {
            throw new ResponseStatusException(HttpStatus.GONE, "This document is no longer available.");
        }
        return summary.withLabel(link.getDocumentLabel());
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "This link is not valid.");
    }

    static String newToken() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String safeFilename(String documentNo) {
        String base = documentNo == null || documentNo.isBlank() ? "document" : documentNo;
        return base.replaceAll("[^A-Za-z0-9._\\- ]", "_") + ".pdf";
    }
}
