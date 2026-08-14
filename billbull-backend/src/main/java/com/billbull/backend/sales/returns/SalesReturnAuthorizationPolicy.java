package com.billbull.backend.sales.returns;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * The single rule deciding when a Sales Return needs supervisor sign-off (§15), and the return
 * window that feeds it.
 *
 * <p>Deliberately a standalone component rather than a method on
 * {@link SalesReturnEligibilityService}: both that service (which shows the cashier a
 * warning up front) and {@link SalesReturnAuthorizationService} (which enforces the gate at
 * approval) need it. Since the eligibility service already depends on
 * {@link SalesReturnService}, putting the rule there and injecting it back would close a
 * dependency cycle — and, more importantly, the badge the cashier sees and the gate the backend
 * enforces must come from one place or they will eventually disagree.
 *
 * <p>Both settings default to 0, preserving the pre-existing behaviour exactly: no return
 * window, and no cash approval threshold.
 */
@Component
public class SalesReturnAuthorizationPolicy {

    /**
     * Return window in days. {@code 0} (the default) means unlimited — matching the behaviour
     * before this setting existed, where no window was enforced at all.
     *
     * <p>A lapsed window never blocks a return outright; it escalates it to supervisor
     * approval. Refusing outright would leave a genuine customer with no path at all, which is
     * a policy decision for a manager to make at the counter, not for the software to make.
     */
    @Value("${sales.return.window-days:0}")
    private int returnWindowDays;

    /**
     * Cash refunds at or above this value require supervisor authorization. {@code 0} (the
     * default) disables the threshold entirely.
     *
     * <p>Applies only to cash: it is the refund method where value leaves the building
     * immediately and irreversibly. Card, bank, voucher and customer-credit refunds are all
     * traceable and reversible after the fact.
     */
    @Value("${sales.return.cash-approval-threshold-aed:0}")
    private BigDecimal cashApprovalThreshold;

    /** Configured window in days, or {@code null} when unlimited. */
    public Integer getReturnWindowDays() {
        return returnWindowDays > 0 ? returnWindowDays : null;
    }

    /** True when an invoice of this age falls outside the configured window. */
    public boolean isReturnWindowExpired(long invoiceAgeDays) {
        return returnWindowDays > 0 && invoiceAgeDays > returnWindowDays;
    }

    /**
     * Why this return needs sign-off, or {@code null} when it does not.
     *
     * <p>The expired window is checked first so the reason recorded on the return names the
     * policy that actually triggered it — a late, high-value cash refund is reported as a
     * window breach, which is the more significant of the two.
     */
    public String resolveAuthorizationReason(SalesReturnRefundMethod method,
                                             BigDecimal refundAmount,
                                             boolean returnWindowExpired) {
        if (returnWindowExpired) {
            return "RETURN_WINDOW_EXPIRED";
        }
        if (method != null && method.isCashDrawerAffecting()
                && cashApprovalThreshold != null
                && cashApprovalThreshold.compareTo(BigDecimal.ZERO) > 0
                && refundAmount != null
                && refundAmount.compareTo(cashApprovalThreshold) >= 0) {
            return "HIGH_VALUE_CASH_REFUND";
        }
        return null;
    }
}
