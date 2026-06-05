package com.billbull.backend.sales.payment;

import com.billbull.backend.security.AuditLogService;
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
@CrossOrigin(origins = "*")
public class PaymentController {

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private AuditLogService auditLogService;

    // ==========================================
    // GET ALL
    // ==========================================
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public List<Payment> getAllPayments() {
        return paymentService.getAllPayments();
    }

    @GetMapping("/page")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
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
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public Payment getPaymentById(@PathVariable Long id) {
        return paymentService.getPaymentById(id);
    }

    // ==========================================
    // GET BY CUSTOMER
    // ==========================================
    @GetMapping("/customer/{customerCode}")
    public List<Payment> getPaymentsByCustomer(@PathVariable String customerCode) {
        return paymentService.getPaymentsByCustomer(customerCode);
    }

    // ==========================================
    // GET BY INVOICE
    // ==========================================
    @GetMapping("/invoice/{invoiceNumber}")
    public List<Payment> getPaymentsByInvoice(@PathVariable String invoiceNumber) {
        return paymentService.getPaymentsByInvoice(invoiceNumber);
    }

    // ==========================================
    // GET NEXT NUMBER
    // ==========================================
    @GetMapping("/next-number")
    public Map<String, String> getNextPaymentNumber() {
        String number = paymentService.generatePaymentNumber();
        return Map.of("paymentNumber", number);
    }

    // ==========================================
    // GET STATS
    // ==========================================
    @GetMapping("/stats")
    public Map<String, Object> getPaymentStats() {
        return paymentService.getPaymentStats();
    }

    // ==========================================
    // CREATE / UPDATE
    // ==========================================
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SALES')")
    public Payment savePayment(@RequestBody Payment payment) {
        String mode = payment.getPaymentMode();
        if (mode != null && !mode.equalsIgnoreCase("Cash")) {
            if (payment.getBankName() == null || payment.getBankName().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bank account is required for non-cash payments.");
            }
        }
        return paymentService.savePayment(payment);
    }

    // ==========================================
    // UPDATE STATUS
    // ==========================================
    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
    public Payment updateStatus(@PathVariable Long id, @RequestParam PaymentStatus status) {
        return paymentService.updateStatus(id, status);
    }

    // ==========================================
    // DELETE
    // ==========================================
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deletePayment(@PathVariable Long id) {
        paymentService.deletePayment(id);
        return ResponseEntity.noContent().build();
    }
}
