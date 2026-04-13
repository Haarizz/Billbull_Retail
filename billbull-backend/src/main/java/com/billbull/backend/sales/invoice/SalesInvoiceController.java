package com.billbull.backend.sales.invoice;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/invoices")
@CrossOrigin
public class SalesInvoiceController {

    private final SalesInvoiceService service;

    public SalesInvoiceController(SalesInvoiceService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public List<SalesInvoice> getAll() {
        return service.getAll();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public SalesInvoice getById(@PathVariable Long id) {
        return service.getById(id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SALES')")
    public SalesInvoice save(@RequestBody SalesInvoice invoice) {
        return service.save(invoice);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
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
        LocalDate paymentDate = null;
        if (payload.get("paymentDate") != null && !payload.get("paymentDate").toString().isBlank()) {
            paymentDate = LocalDate.parse(payload.get("paymentDate").toString());
        }
        return service.recordPayment(id, amount, paymentMode, paymentReference, paymentDate);
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
