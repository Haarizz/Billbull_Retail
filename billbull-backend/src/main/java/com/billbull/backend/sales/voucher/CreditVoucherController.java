package com.billbull.backend.sales.voucher;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Credit Voucher API.
 *
 * <p>Lookup is intentionally the only endpoint a till needs — redemption happens as part of
 * checkout through the POS payment pipeline, not as a standalone call, so a voucher can never be
 * drawn down without a sale to attach it to.
 *
 * <p>Permissions ride on the existing {@code sales.return} module gate: vouchers are created by
 * returns and anyone who may take a return may look one up.
 */
@RestController
@RequestMapping("/api/sales/vouchers")
@PreAuthorize("isAuthenticated()")
public class CreditVoucherController {

    private static final String MODULE = "sales.return";

    @Autowired
    private CreditVoucherService voucherService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    /**
     * Resolves a scanned barcode or typed code to a voucher, with its live balance and whether it
     * can be redeemed right now.
     *
     * <p>Read-only: it never reserves or decrements anything, so a cashier can check a balance
     * freely. The balance shown here is advisory — redemption re-checks it under a row lock, so a
     * voucher spent on another till between lookup and apply is still correctly refused.
     */
    @GetMapping("/lookup")
    public CreditVoucherResponse lookup(@RequestParam String code) {
        modulePermissionService.requireCanView(MODULE);
        return voucherService.validate(code);
    }

    /** A voucher's full history — issue, every redemption, any adjustment or cancellation. */
    @GetMapping("/{id}/history")
    public List<Map<String, Object>> history(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return voucherService.getHistory(id).stream()
                .map(t -> {
                    Map<String, Object> row = new java.util.LinkedHashMap<>();
                    row.put("id", t.getId());
                    row.put("type", t.getTransactionType() != null ? t.getTransactionType().name() : null);
                    row.put("amount", t.getAmount());
                    row.put("balanceBefore", t.getBalanceBefore());
                    row.put("balanceAfter", t.getBalanceAfter());
                    row.put("referenceType", t.getReferenceType());
                    row.put("referenceNumber", t.getReferenceNumber());
                    row.put("performedBy", t.getPerformedBy());
                    row.put("branchId", t.getBranchId());
                    row.put("terminalId", t.getPosTerminalId());
                    row.put("posSessionId", t.getPosSessionId());
                    row.put("businessDate", t.getBusinessDate());
                    row.put("notes", t.getNotes());
                    row.put("createdAt", t.getCreatedAt());
                    return row;
                })
                .toList();
    }

    /** The voucher issued by a given Sales Return, for reprinting from the returns register. */
    @GetMapping("/by-return/{returnNumber}")
    public CreditVoucherResponse byReturn(@PathVariable String returnNumber) {
        modulePermissionService.requireCanView(MODULE);
        return voucherService.findBySalesReturnNumber(returnNumber)
                .map(CreditVoucherResponse::from)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND,
                        "No credit voucher was issued for return " + returnNumber + "."));
    }

    /**
     * Withdraws a voucher and releases its unredeemed balance. Restricted to admins — this
     * destroys value the customer is holding, so it is not a till-level action.
     */
    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    public CreditVoucherResponse cancel(@PathVariable Long id, @RequestBody CancelRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return CreditVoucherResponse.from(
                voucherService.cancel(id, request != null ? request.reason : null));
    }

    public static class CancelRequest {
        public String reason;
    }
}
