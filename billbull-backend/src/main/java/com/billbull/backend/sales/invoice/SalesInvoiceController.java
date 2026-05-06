package com.billbull.backend.sales.invoice;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.billbull.backend.security.ModulePermissionService;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/invoices")
@CrossOrigin
public class SalesInvoiceController {

    private final SalesInvoiceService service;
    private final ModulePermissionService modulePermissionService;

    public SalesInvoiceController(SalesInvoiceService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<SalesInvoice> getAll() {
        modulePermissionService.requireCanView("sales");
        return service.getAll();
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

    @GetMapping("/next-number")
    public Map<String, String> getNextNumber() {
        return Map.of("invoiceNumber", service.generateInvoiceNumber());
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','SALES')")
    public ResponseEntity<Void> updateStatus(
            @PathVariable Long id,
            @RequestParam SalesInvoiceStatus status) {
        service.updateStatus(id, status);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/payment")
    @PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
    public SalesInvoice recordPayment(
            @PathVariable Long id,
            @RequestBody Map<String, Double> payload) {
        Double amount = payload.get("amount");
        return service.recordPayment(id, amount, null, null, null);
    }

    @PostMapping("/{id}/payment-detailed")
    @PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
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
        return service.recordPayment(id, amount, paymentMode, paymentReference, paymentDate, bankAccount, chequeDate);
    }

    @GetMapping("/price-history/{itemCode}")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public List<PriceHistoryDTO> getPriceHistory(@PathVariable String itemCode) {
        return service.getPriceHistory(itemCode);
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
