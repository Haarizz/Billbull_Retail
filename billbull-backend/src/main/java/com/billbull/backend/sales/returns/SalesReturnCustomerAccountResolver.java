package com.billbull.backend.sales.returns;

import com.billbull.backend.sales.customerledger.CustomerRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Answers one question: does this sale belong to a customer who has an account we can credit?
 *
 * <p>It matters because the refund methods split cleanly on it (§14):
 *
 * <ul>
 *   <li>{@link SalesReturnRefundMethod#CUSTOMER_CREDIT} posts the refund to the customer's
 *       ledger. A walk-in has no ledger, so there is nothing to post to — the credit would be
 *       recorded against a placeholder code that no one can ever redeem against.</li>
 *   <li>{@link SalesReturnRefundMethod#CREDIT_VOUCHER} issues bearer credit: a code and barcode
 *       that whoever holds the slip can spend. It needs no customer record at all, which is
 *       exactly why {@code CreditVoucher.customerCode} is documented as nullable for walk-in
 *       returns. This is the correct instrument for an anonymous customer.</li>
 * </ul>
 *
 * <p>Shared by the read side (which greys the control out and says why) and the write side
 * (which rejects it outright), so the two cannot drift into disagreeing about who counts as a
 * walk-in — a UI-only gate would be bypassable by calling the API directly.
 */
@Component
public class SalesReturnCustomerAccountResolver {

    /** The placeholder code POS stamps on anonymous sales — see PosCheckoutController. */
    private static final String WALK_IN_CODE = "WALK-IN";

    @Autowired
    private CustomerRepository customerRepository;

    /**
     * True when the sale was anonymous: no customer code, the walk-in placeholder, or a code
     * with no matching row in the Customer master.
     *
     * <p>The last case is the one worth spelling out: an invoice can carry a customer code that
     * has since been deleted or was never a real master record. Treating that as a walk-in is
     * deliberate — a ledger credit against a customer who does not exist is unrecoverable money.
     */
    public boolean isWalkIn(String customerCode) {
        if (customerCode == null || customerCode.isBlank()) return true;
        String code = customerCode.trim();
        if (WALK_IN_CODE.equalsIgnoreCase(code)) return true;
        return customerRepository.findByCode(code).isEmpty();
    }

    /**
     * The reason a walk-in cannot use a given method, or null when the method is allowed.
     * Phrased for the cashier, and it names the alternative rather than just refusing.
     */
    public String blockedReason(SalesReturnRefundMethod method, String customerCode) {
        if (method != SalesReturnRefundMethod.CUSTOMER_CREDIT) return null;
        if (!isWalkIn(customerCode)) return null;
        return "Customer Credit needs a registered customer account to post the credit to. "
                + "This sale was to a walk-in customer — issue a Credit Voucher instead, "
                + "which the customer can redeem in store without an account.";
    }
}
