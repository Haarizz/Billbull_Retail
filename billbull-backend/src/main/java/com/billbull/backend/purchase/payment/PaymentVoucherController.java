package com.billbull.backend.purchase.payment;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/vouchers")
@CrossOrigin(origins = "*") // Adjust for production security
@PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
public class PaymentVoucherController {

    @Autowired
    private PaymentVoucherService service;

    @Autowired
    private AuditLogService auditLogService;

    // --------------------
    // GET ALL
    // --------------------
    @GetMapping
    public ResponseEntity<List<PaymentVoucher>> getAllVouchers() {
        return ResponseEntity.ok(service.getAllVouchers());
    }

    @GetMapping("/page")
    public ResponseEntity<com.billbull.backend.util.PageResponse<PaymentVoucher>> getVouchersPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        // `status` may be a single status or a comma-separated group (e.g. the
        // History tab = POSTED,REJECTED,CLEARED). Blank/absent → all statuses.
        java.util.List<PaymentStatus> statuses = new java.util.ArrayList<>();
        if (status != null && !status.isBlank()) {
            for (String s : status.split(",")) {
                String trimmed = s.trim();
                if (trimmed.isEmpty()) continue;
                try {
                    statuses.add(PaymentStatus.valueOf(trimmed.toUpperCase().replace(" ", "_")));
                } catch (IllegalArgumentException ignored) {
                    // skip unknown status tokens
                }
            }
        }
        return ResponseEntity.ok(service.listPage(statuses, search, page, size));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, BigDecimal>> getStats() {
        return ResponseEntity.ok(service.statsByMode());
    }

    // --------------------
    // GET BY ID
    // --------------------
    @GetMapping("/{id}")
    public ResponseEntity<PaymentVoucher> getVoucherById(@PathVariable Long id) {
        return service.getVoucherById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // --------------------
    // CREATE
    // --------------------
    @PostMapping
    public ResponseEntity<PaymentVoucher> createVoucher(@RequestBody Map<String, Object> payload) {
        try {
            PaymentVoucher voucher = new PaymentVoucher();

            // Map JSON payload to Entity
            voucher.setVendorName((String) payload.get("vendor"));
            voucher.setVendorId(payload.get("vendorId") != null ? payload.get("vendorId").toString() : "VND-EXT");

            voucher.setPaymentDate(LocalDate.parse((String) payload.get("date")));

            String modeStr = ((String) payload.get("mode")).toUpperCase().replace(" ", "_");
            PaymentMode mode = PaymentMode.valueOf(modeStr);
            voucher.setPaymentMode(mode);

            if (mode != PaymentMode.CASH) {
                Object bankAcc = payload.get("bankAccount");
                if (bankAcc == null || bankAcc.toString().isBlank()) {
                    return ResponseEntity.badRequest().build();
                }
            }

            voucher.setAmount(new BigDecimal(payload.get("amount").toString()));
            voucher.setReferenceNumber((String) payload.get("ref"));
            if (payload.get("notes") != null) {
                voucher.setNotes(payload.get("notes").toString());
            }
            if (payload.get("bankAccount") != null) {
                voucher.setBankAccount(payload.get("bankAccount").toString());
            }
            if (payload.get("chequeDate") != null && !payload.get("chequeDate").toString().isBlank()) {
                voucher.setChequeDate(LocalDate.parse(payload.get("chequeDate").toString()));
            }

            if (payload.get("invoiceId") != null && !payload.get("invoiceId").toString().isEmpty()) {
                voucher.setInvoiceId(Long.parseLong(payload.get("invoiceId").toString()));
            }

            return ResponseEntity.ok(service.createVoucher(voucher));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.badRequest().build();
        }
    }

    // --------------------
    // UPDATE STATUS
    // --------------------
    @PutMapping("/{id}/status")
    public ResponseEntity<PaymentVoucher> updateStatus(
            @PathVariable Long id,
            @RequestParam String status) {
        try {
            PaymentStatus newStatus = PaymentStatus.valueOf(status.toUpperCase());
            return ResponseEntity.ok(service.updateStatus(id, newStatus));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // --------------------
    // DELETE
    // --------------------
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteVoucher(@PathVariable Long id) {
        service.deleteVoucher(id);
        return ResponseEntity.noContent().build();
    }
}
