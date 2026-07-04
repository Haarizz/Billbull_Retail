package com.billbull.backend.sales.invoice;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.settings.email.DocumentEmailSender;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/invoices")
@CrossOrigin
public class SalesInvoiceController {

    private final SalesInvoiceService service;
    private final ModulePermissionService modulePermissionService;
    private final DocumentEmailSender emailSender;

    public SalesInvoiceController(SalesInvoiceService service,
                                  ModulePermissionService modulePermissionService,
                                  DocumentEmailSender emailSender) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.emailSender = emailSender;
    }

    // QA-040: send the invoice email using the frontend-rendered HTML body
    // (same template as Print) + CID inline images.
    @PostMapping("/{id}/send-email")
    @PreAuthorize("isAuthenticated()")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> sendEmail(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        modulePermissionService.requireCanView("sales");
        try {
            String toEmail = body != null ? (String) body.get("toEmail") : null;
            String subject = body != null ? (String) body.get("subject") : null;
            String htmlBody = body != null ? (String) body.get("htmlBody") : null;
            List<Map<String, String>> inlineAttachments = body != null
                    ? (List<Map<String, String>>) body.get("inlineAttachments")
                    : null;

            SalesInvoice invoice = service.getById(id);
            if (subject == null || subject.isBlank()) {
                subject = "Sales Invoice " + invoice.getInvoiceNumber() + " from "
                        + emailSender.getFromNameForBranch(invoice.getBranchId());
            }
            // PDF §7.4 — branch-aware From + reply-to.
            emailSender.send(toEmail, subject, htmlBody, inlineAttachments, invoice.getBranchId());
            return ResponseEntity.ok(Map.of("message", "Email sent successfully to " + toEmail));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to send email: " + e.getMessage());
        }
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<SalesInvoice> getAll() {
        modulePermissionService.requireCanView("sales");
        return service.getAll();
    }

    @GetMapping("/stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> getStats() {
        return service.getStats();
    }

    @GetMapping("/page")
    @PreAuthorize("isAuthenticated()")
    public com.billbull.backend.util.PageResponse<SalesInvoice> getPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        modulePermissionService.requireCanView("sales");
        java.util.List<SalesInvoice> all = (fromDate != null || toDate != null)
                ? service.getAllByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : service.getAll();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public SalesInvoice getById(@PathVariable Long id) {
        modulePermissionService.requireCanView("sales");
        return service.getById(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public SalesInvoice save(@RequestBody SalesInvoice invoice) {
        modulePermissionService.requireCanCreate("sales");
        return service.save(invoice);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("sales");
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{invoiceId}/items/{itemId}/batch-selection")
    @PreAuthorize("isAuthenticated()")
    public SalesInvoice saveBatchSelection(
            @PathVariable Long invoiceId,
            @PathVariable Long itemId,
            @RequestBody BatchSelectionRequest request) {
        modulePermissionService.requireCanEdit("sales");
        return service.saveBatchSelection(invoiceId, itemId, request);
    }

    @DeleteMapping("/{invoiceId}/items/{itemId}/batch-selection")
    @PreAuthorize("isAuthenticated()")
    public SalesInvoice deleteBatchSelection(
            @PathVariable Long invoiceId,
            @PathVariable Long itemId) {
        modulePermissionService.requireCanEdit("sales");
        return service.deleteBatchSelection(invoiceId, itemId);
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextNumber() {
        return Map.of("invoiceNumber", service.generateInvoiceNumber());
    }

    /**
     * Returns the total outstanding balance for a customer (unpaid invoices + opening balance).
     * Used by the sales invoice screen to show "Previous Outstanding" before a new invoice is created.
     */
    @GetMapping("/outstanding")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> getCustomerOutstanding(@RequestParam String customerCode) {
        return service.getCustomerOutstanding(customerCode);
    }

    /**
     * Open (balance > 0) invoices for a customer, oldest first — lets a payment
     * be targeted at a specific invoice instead of the default oldest-first sweep.
     */
    @GetMapping("/open")
    @PreAuthorize("isAuthenticated()")
    public List<SalesInvoice> getOpenInvoices(@RequestParam String customerCode) {
        modulePermissionService.requireCanView("sales");
        return service.getOpenInvoicesForCustomer(customerCode);
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> updateStatus(
            @PathVariable Long id,
            @RequestParam SalesInvoiceStatus status) {
        service.updateStatus(id, status);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/payment")
    @PreAuthorize("isAuthenticated()")
    public SalesInvoice recordPayment(
            @PathVariable Long id,
            @RequestBody Map<String, Double> payload) {
        Double amount = payload.get("amount");
        return service.recordPayment(id, amount, null, null, null);
    }

    @PostMapping("/{id}/payment-detailed")
    @PreAuthorize("isAuthenticated()")
    public SalesInvoice recordDetailedPayment(
            @PathVariable Long id,
            @RequestBody Map<String, Object> payload) {
        Double amount = payload.get("amount") != null
                ? Double.valueOf(payload.get("amount").toString())
                : null;
        String paymentMode = payload.get("paymentMode") != null ? payload.get("paymentMode").toString() : null;
        String paymentReference = payload.get("paymentReference") != null
                ? payload.get("paymentReference").toString()
                : null;
        String bankAccount = payload.get("bankAccount") != null ? payload.get("bankAccount").toString() : null;
        String chequeDateStr = payload.get("chequeDate") != null ? payload.get("chequeDate").toString() : null;
        LocalDate paymentDate = null;
        if (payload.get("paymentDate") != null && !payload.get("paymentDate").toString().isBlank()) {
            paymentDate = LocalDate.parse(payload.get("paymentDate").toString());
        }
        LocalDate chequeDate = null;
        if (chequeDateStr != null && !chequeDateStr.isBlank()) {
            try { chequeDate = LocalDate.parse(chequeDateStr); } catch (Exception ignored) {}
        }
        String splitGroupId = payload.get("splitGroupId") != null ? payload.get("splitGroupId").toString() : null;
        String combinedPaymentMode = payload.get("combinedPaymentMode") != null ? payload.get("combinedPaymentMode").toString() : null;
        // Credit-only settlement: no money changes hands — just stamp the invoice
        // paymentMode so it's visible in history and leave status as CONFIRMED.
        if ("Credit".equalsIgnoreCase(paymentMode) && (amount == null || amount <= 0)) {
            return service.markAsCreditSettled(id);
        }
        return service.recordPayment(id, amount, paymentMode, paymentReference, paymentDate, bankAccount, chequeDate, splitGroupId, combinedPaymentMode);
    }

    @GetMapping("/price-history/{itemCode}")
    @PreAuthorize("isAuthenticated()")
    public List<PriceHistoryDTO> getPriceHistory(
            @PathVariable String itemCode,
            @RequestParam(required = false) String customerCode) {
        return service.getPriceHistory(itemCode, customerCode);
    }

    /**
     * Financial integrity check — detects orphaned invoices, under/over-recognized
     * revenue, and other accounting/delivery mismatches.
     * Admin-only.
     */
    @GetMapping("/reconcile")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> reconcile() {
        return service.reconcile();
    }
}
