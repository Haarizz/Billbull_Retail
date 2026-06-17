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

    private static final String MODULE = "sales";

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

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

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public Payment savePayment(@RequestBody Payment payment) {
        modulePermissionService.requireCanCreate(MODULE);
        String mode = payment.getPaymentMode();
        if (mode != null && !mode.equalsIgnoreCase("Cash")) {
            if (payment.getBankName() == null || payment.getBankName().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bank account is required for non-cash payments.");
            }
        }
        return paymentService.savePayment(payment);
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
