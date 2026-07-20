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
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> draftFromGrn(
            @PathVariable Long grnId) {
        return ResponseEntity.ok(service.createDraftFromGrn(grnId));
    }

    @GetMapping("/draft/from-lpo/{lpoId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> draftFromLpo(
            @PathVariable Long lpoId) {
        return ResponseEntity.ok(service.createDraftFromLpo(lpoId));
    }

    @PostMapping("/draft")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> createDraft(
            @RequestBody PurchaseInvoiceRequest request) {
        modulePermissionService.requireCanCreate("purchases.invoice");

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
    // @PreAuthorize("isAuthenticated()") // Temporarily disabled for testing
    public ResponseEntity<List<PurchaseInvoiceResponse>> getPostedInvoicesForPayment() {
        return ResponseEntity.ok(service.getPostedInvoicesForPayment());
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> update(
            @PathVariable Long id,
            @RequestBody PurchaseInvoiceRequest request) {
        return ResponseEntity.ok(
                service.getResponse(service.update(id, request).getId()));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("isAuthenticated()")
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
        modulePermissionService.requireCanApprove("purchases.invoice");
        String approver = SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getName();

        return ResponseEntity.ok(
                service.getResponse(service.approve(id, approver).getId()));
    }

    @PostMapping("/{id}/payment")
    @PreAuthorize("isAuthenticated()")
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
        modulePermissionService.requireCanView("purchases.invoice");
        return ResponseEntity.ok(service.listAll());
    }

    @GetMapping("/page")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<com.billbull.backend.util.PageResponse<PurchaseInvoiceResponse>> page(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        modulePermissionService.requireCanView("purchases.invoice");
        return ResponseEntity.ok(com.billbull.backend.util.PaginationUtil.paginate(
                service.listAll(), page, size, search, status));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PurchaseInvoiceResponse> get(@PathVariable Long id) {
        modulePermissionService.requireCanView("purchases.invoice");
        return ResponseEntity.ok(service.getResponse(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("purchases.invoice");
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
