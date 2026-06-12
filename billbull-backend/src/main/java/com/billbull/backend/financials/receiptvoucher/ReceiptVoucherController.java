package com.billbull.backend.financials.receiptvoucher;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/receipt-vouchers")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class ReceiptVoucherController {

    private static final String MODULE = "finance";

    private final ReceiptVoucherService service;
    private final ObjectMapper objectMapper;
    private final AuditLogService auditLogService;
    private final DocumentEmailSender emailSender;
    private final ModulePermissionService modulePermissionService;

    public ReceiptVoucherController(ReceiptVoucherService service, ObjectMapper objectMapper,
            AuditLogService auditLogService, DocumentEmailSender emailSender,
            ModulePermissionService modulePermissionService) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.auditLogService = auditLogService;
        this.emailSender = emailSender;
        this.modulePermissionService = modulePermissionService;
    }

    // QA-040: send the receipt-voucher email using the frontend-rendered HTML.
    @PostMapping("/{id}/send-email")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> sendEmail(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            String toEmail = body != null ? (String) body.get("toEmail") : null;
            String subject = body != null ? (String) body.get("subject") : null;
            String htmlBody = body != null ? (String) body.get("htmlBody") : null;
            List<Map<String, String>> inlineAttachments = body != null
                    ? (List<Map<String, String>>) body.get("inlineAttachments")
                    : null;

            ReceiptVoucher rv = service.getReceiptById(id);
            if (subject == null || subject.isBlank()) {
                String num = rv != null && rv.getVoucherId() != null ? rv.getVoucherId() : ("RV-" + id);
                subject = "Receipt Voucher " + num + " from " + emailSender.getFromName();
            }
            emailSender.send(toEmail, subject, htmlBody, inlineAttachments);
            return ResponseEntity.ok(Map.of("message", "Email sent successfully to " + toEmail));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to send email: " + e.getMessage());
        }
    }

    @GetMapping("/next-number")
    public ResponseEntity<Map<String, String>> getNextVoucherNumber() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(Map.of("voucherNumber", service.generateNextVoucherId()));
    }

    @GetMapping
    public ResponseEntity<List<ReceiptVoucher>> getAllReceipts() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllReceipts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReceiptVoucher> getReceiptById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getReceiptById(id));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReceiptVoucher> createReceipt(
            @RequestPart("data") String receiptData,
            @RequestPart(value = "file", required = false) MultipartFile file) throws Exception {
        modulePermissionService.requireCanCreate(MODULE);
        ReceiptVoucher receipt = objectMapper.readValue(receiptData, ReceiptVoucher.class);
        return ResponseEntity.ok(service.createReceipt(receipt, file));
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReceiptVoucher> updateReceipt(
            @PathVariable Long id,
            @RequestPart("data") String receiptData,
            @RequestPart(value = "file", required = false) MultipartFile file) throws Exception {
        modulePermissionService.requireCanEdit(MODULE);
        ReceiptVoucher receipt = objectMapper.readValue(receiptData, ReceiptVoucher.class);
        return ResponseEntity.ok(service.updateReceipt(id, receipt, file));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteReceipt(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deleteReceipt(id);
        return ResponseEntity.ok().build();
    }
}
