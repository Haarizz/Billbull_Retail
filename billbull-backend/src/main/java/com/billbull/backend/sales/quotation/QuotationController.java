package com.billbull.backend.sales.quotation;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;

@RestController
@RequestMapping("/api/sales/quotations")
@CrossOrigin(origins = "*")
public class QuotationController {

    private static final String MODULE = "sales.quotation";

    private final QuotationService service;
    private final AuditLogService auditLogService;
    private final ModulePermissionService permissionService;
    private final QuotationEmailService emailService;

    public QuotationController(QuotationService service,
                               AuditLogService auditLogService,
                               ModulePermissionService permissionService,
                               QuotationEmailService emailService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.permissionService = permissionService;
        this.emailService = emailService;
    }

    // ---------------- PRODUCTS ----------------
    @GetMapping("/products-lookup")
    public ResponseEntity<List<SalesProductDTO>> getProductsForQuotation() {
        return ResponseEntity.ok(service.getProductsForSales());
    }

    // ---------------- CRUD ----------------
    @GetMapping("/next-qtn-no")
    public ResponseEntity<String> getNextQtnNo() {
        return ResponseEntity.ok(service.generateNextQuotationNo());
    }

    @GetMapping
    public ResponseEntity<List<Quotation>> getAll() {
        permissionService.requireCan(MODULE, "view");
        return ResponseEntity.ok(service.getAllQuotations());
    }

    @GetMapping("/page")
    public ResponseEntity<com.billbull.backend.util.PageResponse<Quotation>> getPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        permissionService.requireCan(MODULE, "view");
        return ResponseEntity.ok(com.billbull.backend.util.PaginationUtil.paginate(
                service.getAllQuotations(), page, size, search, status));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Quotation> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getQuotationById(id));
    }

    @PostMapping
    public ResponseEntity<Quotation> save(@RequestBody Quotation quotation) {
        if (quotation.getId() == null) {
            permissionService.requireCan(MODULE, "create");
        } else {
            permissionService.requireCan(MODULE, "edit");
        }
        return ResponseEntity.ok(service.createOrUpdateQuotation(quotation));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        permissionService.requireCan(MODULE, "edit");
        service.deleteQuotation(id);
        return ResponseEntity.ok().build();
    }

    // ---------------- STATUS UPDATE ----------------
    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(
            @PathVariable Long id,
            @RequestParam String status) {
        
        permissionService.requireCan(MODULE, "approve");

        try {
            QuotationStatus enumStatus = QuotationStatus.valueOf(status);
            return ResponseEntity.ok(service.updateStatus(id, enumStatus));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body("Invalid quotation status: " + status);

        } catch (IllegalStateException e) {
            return ResponseEntity.status(409)
                    .body(e.getMessage());
        }
    }

    // ---------------- STOCK CHECK (READ-ONLY) ----------------
    @GetMapping("/{id}/stock-check")
    public ResponseEntity<List<QuotationStockCheckDTO>> checkStock(
            @PathVariable Long id) {

        return ResponseEntity.ok(service.checkStockForApproval(id));
    }

    // ---------------- PRICE HISTORY ----------------
    @GetMapping("/history/item/{itemCode}")
    public ResponseEntity<List<QuotationHistoryDTO>> getItemPriceHistory(
            @PathVariable String itemCode) {
        return ResponseEntity.ok(service.getItemPriceHistory(itemCode));
    }

    // ---------------- ATTACHMENTS ----------------
    @PostMapping(value = "/{id}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadAttachment(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {

        try {
            return ResponseEntity.ok(service.uploadAttachment(id, file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body("File upload failed");
        }
    }

    // ---------------- REVISIONS ----------------
    @PostMapping("/{id}/revise")
    public ResponseEntity<?> createRevision(
            @PathVariable Long id,
            @RequestBody String note) {

        try {
            return ResponseEntity.ok(service.createRevision(id, note));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body("Failed to create revision");
        }
    }

    // ---------------- SEND EMAIL ----------------
    @PostMapping("/{id}/send-email")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> sendEmail(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {

        permissionService.requireCan(MODULE, "view");

        String toEmail = body != null ? (String) body.get("toEmail") : null;
        String subject = body != null ? (String) body.get("subject") : null;
        // QA-040: frontend pre-renders the email body from the same template
        // used by Print, then ships it here. If absent we fall back to the
        // legacy hand-built HTML in QuotationEmailService.
        String htmlBody = body != null ? (String) body.get("htmlBody") : null;
        // QA-040: <img> tags in the body reference cid:<id> — the actual
        // bytes are shipped here as base64 strings + content type, so we
        // attach them as MIME inline parts. Keeps the body under Gmail's
        // 102KB cap (data: URIs blow past it instantly).
        List<Map<String, String>> inlineAttachments = body != null
                ? (List<Map<String, String>>) body.get("inlineAttachments")
                : null;

        try {
            Quotation quotation = service.getQuotationById(id);
            emailService.sendQuotationEmail(quotation, toEmail, subject, htmlBody, inlineAttachments);
            return ResponseEntity.ok(Map.of("message", "Email sent successfully to " +
                    (toEmail != null && !toEmail.isBlank() ? toEmail : quotation.getCustomerEmail())));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (UnsupportedEncodingException | jakarta.mail.MessagingException e) {
            return ResponseEntity.internalServerError()
                    .body("Failed to send email: " + e.getMessage());
        }
    }
}
