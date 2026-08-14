package com.billbull.backend.sales.voucher;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Configurable business rules for credit vouchers — expiry and redemption scope (§13/§23).
 *
 * <p>Nothing here is hardcoded. In particular the expiry period is a setting rather than the
 * prototype's assumed "+1 year", because the correct window is a commercial decision (and in some
 * jurisdictions a regulated one) that differs per deployment.
 */
@Component
public class CreditVoucherPolicy {

    /**
     * Months a voucher stays valid from its issue date. {@code 0} means it never expires, which
     * is a legitimate policy — several jurisdictions prohibit expiring store credit at all.
     */
    @Value("${sales.voucher.expiry-months:12}")
    private int expiryMonths;

    /**
     * When true, a voucher may only be redeemed at the branch that issued it.
     *
     * <p>Defaults to false — business-wide redemption — because that is what a customer expects
     * from store credit, and because a stricter default would silently break redemption for
     * existing multi-branch deployments the first time they upgraded.
     */
    @Value("${sales.voucher.branch-restricted:false}")
    private boolean branchRestricted;

    /**
     * Minimum return value that produces a voucher. {@code 0} (the default) means any amount does.
     */
    @Value("${sales.voucher.minimum-amount:0}")
    private java.math.BigDecimal minimumAmount;

    /** Expiry date for a voucher issued on {@code issueDate}, or null when they never expire. */
    public LocalDate resolveExpiryDate(LocalDate issueDate) {
        if (expiryMonths <= 0 || issueDate == null) return null;
        return issueDate.plusMonths(expiryMonths);
    }

    public int getExpiryMonths() {
        return expiryMonths;
    }

    public boolean isBranchRestricted() {
        return branchRestricted;
    }

    public java.math.BigDecimal getMinimumAmount() {
        return minimumAmount;
    }
}
