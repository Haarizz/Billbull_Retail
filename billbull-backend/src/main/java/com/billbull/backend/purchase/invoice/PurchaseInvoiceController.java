package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.util.List;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import com.billbull.backend.security.ModulePermissionService;

@RestController
@RequestMapping("/api/purchase-invoices")
public class PurchaseInvoiceController {

    private final PurchaseInvoiceService service;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public PurchaseInvoiceController(
            PurchaseInvoiceService service, 
            AuditLogService auditLogService,
            ModulePermissionService modulePermissionService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
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
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> createDraft(
            @RequestBody PurchaseInvoiceRequest request) {
        modulePermissionService.requireCanCreate("purchases");

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
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> approve(@PathVariable Long id) {
        modulePermissionService.requireCanApprove("purchases");
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
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PurchaseInvoiceResponse>> list() {
        modulePermissionService.requireCanView("purchases");
        return ResponseEntity.ok(service.listAll());
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> get(@PathVariable Long id) {
        modulePermissionService.requireCanView("purchases");
        return ResponseEntity.ok(service.getResponse(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("purchases");
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
