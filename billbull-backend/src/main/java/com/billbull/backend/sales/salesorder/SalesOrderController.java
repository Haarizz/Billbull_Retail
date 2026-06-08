package com.billbull.backend.sales.salesorder;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.settings.email.DocumentEmailSender;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/sales-orders")
@CrossOrigin
@PreAuthorize("hasAnyRole('ADMIN','SALES')")
public class SalesOrderController {

    private final SalesOrderService service;
    private final SalesOrderAttachmentRepository attachmentRepo;
    private final AuditLogService auditLogService;
    private final DocumentEmailSender emailSender;

    public SalesOrderController(
            SalesOrderService service,
            SalesOrderAttachmentRepository attachmentRepo,
            AuditLogService auditLogService,
            DocumentEmailSender emailSender) {
        this.service = service;
        this.attachmentRepo = attachmentRepo;
        this.auditLogService = auditLogService;
        this.emailSender = emailSender;
    }

    // QA-040: send the SO email using the frontend-rendered HTML body.
    @PostMapping("/{id}/send-email")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> sendEmail(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        try {
            String toEmail = body != null ? (String) body.get("toEmail") : null;
            String subject = body != null ? (String) body.get("subject") : null;
            String htmlBody = body != null ? (String) body.get("htmlBody") : null;
            List<Map<String, String>> inlineAttachments = body != null
                    ? (List<Map<String, String>>) body.get("inlineAttachments")
                    : null;

            SalesOrder order = service.getById(id);
            if (subject == null || subject.isBlank()) {
                subject = "Sales Order " + order.getSoNumber() + " from " + emailSender.getFromName();
            }
            emailSender.send(toEmail, subject, htmlBody, inlineAttachments);
            return ResponseEntity.ok(Map.of("message", "Email sent successfully to " + toEmail));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to send email: " + e.getMessage());
        }
    }

    @PostMapping
    public ResponseEntity<?> save(@RequestBody SalesOrder order) {
        try {
            return ResponseEntity.ok(service.save(order));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping
    public List<SalesOrder> getAll() {
        return service.getAll();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<SalesOrder> getPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        java.util.List<SalesOrder> all = (fromDate != null || toDate != null)
                ? service.getAllByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : service.getAll();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        return service.getStats();
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextNumber() {
        return Map.of("soNumber", service.generateSalesOrderNumber());
    }

    @GetMapping("/{id}")
    public SalesOrder getById(@PathVariable Long id) {
        return service.getById(id);
    }

    /**
     * QA-032: Return the Receipt Vouchers linked to this Sales Order so the
     * editor can offer a "Print Advance Receipt" action.
     */
    @GetMapping("/{id}/receipt-vouchers")
    public List<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> getReceiptVouchers(@PathVariable Long id) {
        return service.getReceiptVouchersForOrder(id);
    }

    @PutMapping("/{id}/status")
    public void updateStatus(@PathVariable Long id, @RequestParam String status) {
        service.updateStatusById(id, SalesOrderStatus.valueOf(status));
    }

    @PostMapping("/{orderId}/items/{itemId}/batch-selection")
    public ResponseEntity<?> saveBatchSelection(
            @PathVariable Long orderId,
            @PathVariable Long itemId,
            @RequestBody BatchSelectionRequest request) {
        try {
            return ResponseEntity.ok(service.saveBatchSelection(orderId, itemId, request));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{orderId}/items/{itemId}/batch-selection")
    public ResponseEntity<?> deleteBatchSelection(
            @PathVariable Long orderId,
            @PathVariable Long itemId) {
        try {
            return ResponseEntity.ok(service.deleteBatchSelection(orderId, itemId));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/{id}/attachments")
    public SalesOrderAttachment upload(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) throws Exception {

        String dir = "uploads/sales-orders/" + id;
        Files.createDirectories(Paths.get(dir));

        String filePath = dir + "/" + file.getOriginalFilename();
        file.transferTo(new File(filePath));

        SalesOrderAttachment att = new SalesOrderAttachment();
        att.setFileName(file.getOriginalFilename());
        att.setFileType(file.getContentType());
        att.setFilePath(filePath);
        att.setSalesOrder(service.getById(id));

        return attachmentRepo.save(att);
    }
}
