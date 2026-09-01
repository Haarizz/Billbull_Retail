package com.billbull.backend.sales.payment;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/payments")
public class PaymentController {

    private static final String MODULE = "sales.payment";

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    @Autowired
    private InvoicePaymentSummaryService invoicePaymentSummaryService;

    @Autowired
    private PaymentReconciliationService paymentReconciliationService;

    // ==========================================
    // GET ALL
    // ==========================================
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<Payment> getAllPayments() {
        modulePermissionService.requireCanView(MODULE);
        return paymentService.getAllPayments();
    }

    @GetMapping("/page")
    @PreAuthorize("isAuthenticated()")
    public com.billbull.backend.util.PageResponse<Payment> getPaymentsPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        java.util.List<Payment> all = (fromDate != null || toDate != null)
                ? paymentService.getAllByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : paymentService.getAllPayments();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    // ==========================================
    // GET BY ID
    // ==========================================
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public Payment getPaymentById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return paymentService.getPaymentById(id);
    }

    @GetMapping("/customer/{customerCode}")
    public List<Payment> getPaymentsByCustomer(@PathVariable String customerCode) {
        modulePermissionService.requireCanView(MODULE);
        return paymentService.getPaymentsByCustomer(customerCode);
    }

    @GetMapping("/invoice/{invoiceNumber}")
    public List<Payment> getPaymentsByInvoice(@PathVariable String invoiceNumber) {
        modulePermissionService.requireCanView(MODULE);
        return paymentService.getPaymentsByInvoice(invoiceNumber);
    }

    /**
     * How the given invoices were actually paid, as payment allocations reconstructed from the
     * recorded tender rows. Back-office screens use this instead of pattern-matching an
     * invoice's stored paymentMode text, which cannot say how much went on each tender and,
     * for older sales, may only say "Mixed".
     *
     * <p>Batched deliberately: a sales list needs the breakdown for a whole page of invoices,
     * and one request per row would be a query storm.
     *
     * GET /api/payments/invoice-summary?invoiceNumbers=INV-1,INV-2
     */
    @GetMapping("/invoice-summary")
    @PreAuthorize("isAuthenticated()")
    public Map<String, InvoicePaymentSummary> getInvoicePaymentSummaries(
            @RequestParam List<String> invoiceNumbers) {
        modulePermissionService.requireCanView(MODULE);
        return invoicePaymentSummaryService.summariesFor(invoiceNumbers);
    }

    /**
     * Read-only payment diagnostics for one invoice: what the invoice says, what the tender
     * rows say, what follows arithmetically, and every way they disagree.
     *
     * <p>Admin-only, and it never writes: a diagnostic that silently repaired data would
     * destroy the evidence of how the data got that way. Intended for support engineers
     * investigating a till/ledger discrepancy.
     *
     * GET /api/sales/payments/diagnostics/{invoiceNumber}
     */
    @GetMapping("/diagnostics/{invoiceNumber}")
    @PreAuthorize("hasRole('ADMIN')")
    public InvoicePaymentDiagnostics getPaymentDiagnostics(@PathVariable String invoiceNumber) {
        try {
            return paymentReconciliationService.diagnose(invoiceNumber);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.getMessage());
        }
    }

    /**
     * The same diagnosis across many invoices, for a bulk health check. Runs in a fixed
     * number of queries regardless of how many invoices are asked about.
     *
     * <p>Returns only the inconsistent ones by default — a health check wants the exceptions,
     * not a listing of everything that is fine. Pass {@code includeConsistent=true} to see all.
     *
     * GET /api/sales/payments/diagnostics?invoiceNumbers=INV-1,INV-2
     */
    @GetMapping("/diagnostics")
    @PreAuthorize("hasRole('ADMIN')")
    public List<InvoicePaymentDiagnostics> getPaymentDiagnosticsBatch(
            @RequestParam List<String> invoiceNumbers,
            @RequestParam(defaultValue = "false") boolean includeConsistent) {
        List<InvoicePaymentDiagnostics> all = paymentReconciliationService.diagnoseAll(invoiceNumbers);
        if (includeConsistent) return all;
        return all.stream().filter(d -> !d.isConsistent() || d.isHasWarnings()).toList();
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextPaymentNumber() {
        modulePermissionService.requireCanCreate(MODULE);
        String number = paymentService.generatePaymentNumber();
        return Map.of("paymentNumber", number);
    }

    @GetMapping("/stats")
    public Map<String, Object> getPaymentStats() {
        modulePermissionService.requireCanView(MODULE);
        return paymentService.getPaymentStats();
    }

    /**
     * @param posSessionId the POS drawer session that physically collected this tender, when
     *      the caller is a till. Supplied as a query parameter rather than a body field on
     *      purpose: {@code Payment.posSessionId} is {@code READ_ONLY} to Jackson, so a body
     *      value is dropped and cannot be forged — this parameter is validated server-side
     *      before it is stamped. Omitted by back-office callers, whose receipts never pass
     *      through a drawer and therefore take no part in POS cash reconciliation.
     */
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public Payment savePayment(@RequestBody Payment payment,
                               @RequestParam(required = false) Long posSessionId) {
        modulePermissionService.requireCanCreate(MODULE);
        String mode = payment.getPaymentMode();
        if (mode != null && !mode.equalsIgnoreCase("Cash")) {
            if (payment.getBankName() == null || payment.getBankName().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bank account is required for non-cash payments.");
            }
        }
        return paymentService.savePayment(payment, posSessionId);
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("isAuthenticated()")
    public Payment updateStatus(@PathVariable Long id, @RequestParam PaymentStatus status) {
        modulePermissionService.requireCanEdit(MODULE);
        return paymentService.updateStatus(id, status);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        paymentService.deletePayment(id);
        return ResponseEntity.noContent().build();
    }
}
