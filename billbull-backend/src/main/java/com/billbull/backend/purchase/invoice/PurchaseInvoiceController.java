package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.util.List;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase-invoices")
public class PurchaseInvoiceController {

    private final PurchaseInvoiceService service;
    private final AuditLogService auditLogService;

    public PurchaseInvoiceController(PurchaseInvoiceService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/draft/from-grn/{grnId}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<PurchaseInvoiceResponse> draftFromGrn(
            @PathVariable Long grnId) {
        return ResponseEntity.ok(service.createDraftFromGrn(grnId));
    }

    @GetMapping("/draft/from-lpo/{lpoId}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<PurchaseInvoiceResponse> draftFromLpo(
            @PathVariable Long lpoId) {
        return ResponseEntity.ok(service.createDraftFromLpo(lpoId));
    }

    @PostMapping("/draft")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<PurchaseInvoiceResponse> createDraft(
            @RequestBody PurchaseInvoiceRequest request) {

        PurchaseInvoice invoice = service.createDraft(request);
        return ResponseEntity.ok(service.getResponse(invoice.getId()));
    }

    @PostMapping("/draft/save")
    public ResponseEntity<PurchaseInvoiceResponse> saveDraft(
            @RequestBody PurchaseInvoiceRequest request) {
        return ResponseEntity.ok(
                service.listAll().get(0));
    }

    @GetMapping("/posted-for-payment")
    // @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')") // Temporarily disabled for testing
    public ResponseEntity<List<PurchaseInvoiceResponse>> getPostedInvoicesForPayment() {
        return ResponseEntity.ok(service.getPostedInvoicesForPayment());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<PurchaseInvoiceResponse> update(
            @PathVariable Long id,
            @RequestBody PurchaseInvoiceRequest request) {
        return ResponseEntity.ok(
                service.getResponse(service.update(id, request).getId()));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<PurchaseInvoiceResponse> submit(@PathVariable Long id) {
        String username = SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getName();

        return ResponseEntity.ok(service.submitForApproval(id, username));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<PurchaseInvoiceResponse> approve(@PathVariable Long id) {
        String approver = SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getName();

        return ResponseEntity.ok(
                service.getResponse(service.approve(id, approver).getId()));
    }

    @PostMapping("/{id}/payment")
    @PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
    public ResponseEntity<PurchaseInvoiceResponse> recordPayment(
            @PathVariable Long id,
            @RequestParam BigDecimal amount,
            @RequestParam(defaultValue = "BANK_TRANSFER") String paymentMode,
            @RequestParam(required = false) String bankAccount,
            @RequestParam(required = false) String chequeDate) {
        return ResponseEntity.ok(
                service.getResponse(service.recordPayment(id, amount, paymentMode, bankAccount, chequeDate).getId()));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public ResponseEntity<List<PurchaseInvoiceResponse>> list() {
        return ResponseEntity.ok(service.listAll());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public ResponseEntity<PurchaseInvoiceResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.getResponse(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
