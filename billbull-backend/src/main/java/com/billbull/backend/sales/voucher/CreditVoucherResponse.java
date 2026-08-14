package com.billbull.backend.sales.voucher;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * What the frontend and the print layer are given for a voucher.
 *
 * <p>Carries everything the Figma voucher card and the printed voucher need, so neither has to
 * reconstruct or recompute any of it (§32). Every value here is persisted and backend-generated —
 * the frontend never decides a code, balance, expiry or status (§25).
 */
public class CreditVoucherResponse {

    public Long id;
    public String voucherNumber;
    public String voucherCode;
    public String barcodeValue;

    public String customerCode;
    public String customerName;
    public String customerMobile;

    public Long branchId;
    public String branchName;

    public BigDecimal originalAmount;
    public BigDecimal usedAmount;
    public BigDecimal remainingAmount;
    public String currencyCode;

    public LocalDate issueDate;
    public LocalDate expiryDate;
    public String status;

    /** True when the expiry date has passed, computed at read time rather than trusted from status. */
    public boolean expired;

    /** True when this voucher could be redeemed right now: status, expiry and balance all permit it. */
    public boolean redeemable;

    /** Why it cannot be redeemed, when {@link #redeemable} is false. */
    public String notRedeemableReason;

    public String sourceReturnNumber;
    public String sourceInvoiceNumber;

    public static CreditVoucherResponse from(CreditVoucher v) {
        return from(v, LocalDate.now());
    }

    public static CreditVoucherResponse from(CreditVoucher v, LocalDate asOf) {
        CreditVoucherResponse r = new CreditVoucherResponse();
        r.id = v.getId();
        r.voucherNumber = v.getVoucherNumber();
        r.voucherCode = v.getVoucherCode();
        r.barcodeValue = v.getBarcodeValue();

        r.customerCode = v.getCustomerCode();
        r.customerName = v.getCustomerName();
        r.customerMobile = v.getCustomerMobile();

        if (v.getBranch() != null) {
            r.branchId = v.getBranch().getId();
            r.branchName = v.getBranch().getName();
        }

        r.originalAmount = v.getOriginalAmount();
        r.usedAmount = v.getUsedAmount();
        r.remainingAmount = v.getRemainingAmount();
        r.currencyCode = v.getCurrencyCode();

        r.issueDate = v.getIssueDate();
        r.expiryDate = v.getExpiryDate();
        r.status = v.getStatus() != null ? v.getStatus().name() : null;
        r.expired = v.isExpiredOn(asOf);

        r.sourceReturnNumber = v.getSourceReturnNumber();
        r.sourceInvoiceNumber = v.getSourceInvoiceNumber();

        // Mirrors the order of checks in CreditVoucherService.assertRedeemable, so the message the
        // cashier sees before applying matches the one they would get if they tried.
        if (v.getStatus() == CreditVoucherStatus.CANCELLED) {
            r.notRedeemableReason = "This voucher has been cancelled.";
        } else if (r.expired) {
            r.notRedeemableReason = "This voucher expired on " + v.getExpiryDate() + ".";
        } else if (v.getRemainingAmount() == null
                || v.getRemainingAmount().compareTo(BigDecimal.ZERO) <= 0) {
            r.notRedeemableReason = "This voucher has no remaining balance.";
        } else if (v.getStatus() != null && !v.getStatus().isRedeemable()) {
            r.notRedeemableReason = "This voucher is " + v.getStatus().name().toLowerCase().replace('_', ' ') + ".";
        }
        r.redeemable = r.notRedeemableReason == null;

        return r;
    }
}
