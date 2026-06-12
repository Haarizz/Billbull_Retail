package com.billbull.backend.purchase.payment;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
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
@PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
public class PaymentVoucherController {

    private static final String MODULE = "purchases";

    @Autowired
    private PaymentVoucherService service;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    // --------------------
    // GET ALL
    // --------------------
    @GetMapping
    public ResponseEntity<List<PaymentVoucher>> getAllVouchers() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllVouchers());
    }

    @GetMapping("/page")
    public ResponseEntity<com.billbull.backend.util.PageResponse<PaymentVoucher>> getVouchersPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        modulePermissionService.requireCanView(MODULE);
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
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.statsByMode());
    }

    // --------------------
    // GET BY ID
    // --------------------
    @GetMapping("/{id}")
    public ResponseEntity<PaymentVoucher> getVoucherById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.getVoucherById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // --------------------
    // CREATE
    // --------------------
    @PostMapping
    public ResponseEntity<PaymentVoucher> createVoucher(@RequestBody Map<String, Object> payload) {
        modulePermissionService.requireCanCreate(MODULE);
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
    public ResponseEntity<?> updateStatus(
            @PathVariable Long id,
            @RequestParam String status) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            PaymentStatus newStatus = PaymentStatus.valueOf(status.toUpperCase());
            PaymentVoucher updated = service.updateStatus(id, newStatus);
            Map<String, Object> response = new java.util.LinkedHashMap<>();
            response.put("id", updated.getId());
            response.put("voucherNumber", updated.getVoucherNumber());
            response.put("status", updated.getStatus() != null ? updated.getStatus().name() : null);
            response.put("message", "Payment voucher status updated");
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid status: " + status));
        } catch (org.springframework.web.server.ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).body(Map.of("message", e.getReason() != null ? e.getReason() : e.getMessage()));
        } catch (com.billbull.backend.financials.generalledger.postingengine.PostingException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage() != null ? e.getMessage() : "Failed to update payment status"));
        }
    }

    // --------------------
    // DELETE
    // --------------------
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteVoucher(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deleteVoucher(id);
        return ResponseEntity.noContent().build();
    }
}
