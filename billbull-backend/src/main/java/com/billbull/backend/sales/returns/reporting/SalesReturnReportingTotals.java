package com.billbull.backend.sales.returns.reporting;

import com.billbull.backend.sales.returns.SalesReturnRefundMethod;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.Map;

/**
 * One scope's approved Sales Returns, reduced to the figures every report needs.
 *
 * <p>This exists because the same arithmetic used to live in three places — the Back Office
 * Sales Report, the POS X-Report and the POS Z-Report — and the three had drifted. They now all
 * read this, so a change that moves one of them moves all of them.
 *
 * <h2>Reporting basis</h2>
 *
 * <p>{@link #value()} is <b>VAT-inclusive</b>, because that is the basis the shipped Back Office
 * Sales Report contract already uses: its Gross Sales is {@code Σ invoiceTotal} (VAT-inclusive)
 * and its Net Sales card reads "after returns". {@link #base()} and {@link #tax()} split that
 * same figure, so a report working on an ex-VAT basis can net returns off without subtracting a
 * VAT-inclusive number from an ex-VAT one — the specific mismatch the POS reports had.
 *
 * <p>Headers carry a derived discount ({@code total = subTotal - discount + tax}), so the
 * discount is published separately as {@link #discount()} and the reconciliation invariant is
 * {@code value == base - discount + tax}. {@link #isConsistent()} asserts it.
 *
 * <h2>Settlement buckets</h2>
 *
 * <p>Keyed on {@code sales_returns.refund_method} — never on the free-text {@code returnAction}
 * the UI derives. {@link #refund(SalesReturnRefundMethod)} is {@code Σ refundAmount}, the
 * server-derived paid portion, which is what a drawer or a bank statement is reconciled
 * against. {@link #value()} stays the document total, which is what nets off sales.
 *
 * <p>Rows written before {@code refund_method} existed land in {@link #legacyPaidOut()} or
 * {@link #legacyLedgerCredit()}; a row neither reading can classify lands in
 * {@link #unclassified()} and is never reported as money paid out.
 */
public final class SalesReturnReportingTotals {

    /** The one documented basis for every cross-report Net Sales comparison. */
    public static final String NET_SALES_BASIS = "VAT_INCLUSIVE";

    private int count;
    private BigDecimal value = BigDecimal.ZERO;
    private BigDecimal base = BigDecimal.ZERO;
    private BigDecimal tax = BigDecimal.ZERO;
    private BigDecimal discount = BigDecimal.ZERO;
    private int quantity;

    private final Map<SalesReturnRefundMethod, BigDecimal> refundByMethod =
            new EnumMap<>(SalesReturnRefundMethod.class);
    private final Map<SalesReturnRefundMethod, Integer> countByMethod =
            new EnumMap<>(SalesReturnRefundMethod.class);

    private int legacyPaidOutCount;
    private BigDecimal legacyPaidOut = BigDecimal.ZERO;
    private int legacyLedgerCreditCount;
    private BigDecimal legacyLedgerCredit = BigDecimal.ZERO;
    private int unclassifiedCount;
    private BigDecimal unclassified = BigDecimal.ZERO;

    private int exchangeCount;
    private BigDecimal exchange = BigDecimal.ZERO;

    SalesReturnReportingTotals() {
    }

    /** An empty scope — no approved returns. */
    public static SalesReturnReportingTotals empty() {
        return new SalesReturnReportingTotals();
    }

    // ---- header figures ------------------------------------------------------

    public int count() { return count; }

    /** Sum of total_amount over approved returns, VAT-inclusive. The figure that nets off sales. */
    public BigDecimal value() { return value; }

    /** Sum of sub_total — the gross, pre-discount, ex-VAT return base. */
    public BigDecimal base() { return base; }

    /** Sum of tax_amount — the output VAT reversed by these returns. */
    public BigDecimal tax() { return tax; }

    /** Discount carried by the returned lines, derived as {@code base + tax - value}. */
    public BigDecimal discount() { return discount; }

    /** Sum of return_qty over the returned lines. */
    public int quantity() { return quantity; }

    /** {@code value == base - discount + tax} — the header reconciliation invariant. */
    public boolean isConsistent() {
        return base.subtract(discount).add(tax).compareTo(value) == 0;
    }

    // ---- settlement buckets --------------------------------------------------

    public BigDecimal refund(SalesReturnRefundMethod method) {
        return refundByMethod.getOrDefault(method, BigDecimal.ZERO);
    }

    public int refundCount(SalesReturnRefundMethod method) {
        return countByMethod.getOrDefault(method, 0);
    }

    public BigDecimal cashRefund() { return refund(SalesReturnRefundMethod.CASH_REFUND); }
    public BigDecimal cardRefund() { return refund(SalesReturnRefundMethod.CARD_REFUND); }
    public BigDecimal bankRefund() { return refund(SalesReturnRefundMethod.BANK_TRANSFER); }
    public BigDecimal creditVoucherRefund() { return refund(SalesReturnRefundMethod.CREDIT_VOUCHER); }
    public BigDecimal customerCredit() { return refund(SalesReturnRefundMethod.CUSTOMER_CREDIT); }

    public BigDecimal legacyPaidOut() { return legacyPaidOut; }
    public int legacyPaidOutCount() { return legacyPaidOutCount; }
    public BigDecimal legacyLedgerCredit() { return legacyLedgerCredit; }
    public int legacyLedgerCreditCount() { return legacyLedgerCreditCount; }
    public BigDecimal unclassified() { return unclassified; }
    public int unclassifiedCount() { return unclassifiedCount; }

    public BigDecimal exchange() { return exchange; }
    public int exchangeCount() { return exchangeCount; }

    /**
     * Money that physically left the business: cash, card and bank, plus the legacy residue
     * whose instrument is no longer recorded. Never includes a credit voucher or customer
     * credit — no money moves for either, and reporting them here is what made a Z-Report
     * drawer look short by an amount no cashier had taken.
     */
    public BigDecimal refundsPaidOut() {
        return cashRefund().add(cardRefund()).add(bankRefund()).add(legacyPaidOut);
    }

    public int refundsPaidOutCount() {
        return refundCount(SalesReturnRefundMethod.CASH_REFUND)
                + refundCount(SalesReturnRefundMethod.CARD_REFUND)
                + refundCount(SalesReturnRefundMethod.BANK_TRANSFER)
                + legacyPaidOutCount;
    }

    /** Value the business owes the customer instead of paying it out. */
    public BigDecimal creditNotesIssued() {
        return creditVoucherRefund().add(customerCredit()).add(legacyLedgerCredit);
    }

    public int creditNotesIssuedCount() {
        return refundCount(SalesReturnRefundMethod.CREDIT_VOUCHER)
                + refundCount(SalesReturnRefundMethod.CUSTOMER_CREDIT)
                + legacyLedgerCreditCount;
    }

    // ---- accumulation (package-private; only the service builds these) -------

    void addHeader(BigDecimal totalAmount, BigDecimal subTotal, BigDecimal taxAmount) {
        BigDecimal total = nz(totalAmount);
        BigDecimal sub = nz(subTotal);
        BigDecimal vat = nz(taxAmount);
        count++;
        value = value.add(total);
        base = base.add(sub);
        tax = tax.add(vat);
        // Derived as the residual, exactly as the return journal derives it, so the two cannot
        // disagree about what the discount on a return was.
        discount = discount.add(sub.add(vat).subtract(total).max(BigDecimal.ZERO));
    }

    void addQuantity(int qty) {
        quantity += qty;
    }

    void addRefund(SalesReturnRefundMethod method, BigDecimal settled) {
        refundByMethod.merge(method, nz(settled), BigDecimal::add);
        countByMethod.merge(method, 1, Integer::sum);
    }

    void addLegacyPaidOut(BigDecimal settled) {
        legacyPaidOutCount++;
        legacyPaidOut = legacyPaidOut.add(nz(settled));
    }

    void addLegacyLedgerCredit(BigDecimal settled) {
        legacyLedgerCreditCount++;
        legacyLedgerCredit = legacyLedgerCredit.add(nz(settled));
    }

    void addUnclassified(BigDecimal settled) {
        unclassifiedCount++;
        unclassified = unclassified.add(nz(settled));
    }

    void addExchange(BigDecimal amount) {
        exchangeCount++;
        exchange = exchange.add(nz(amount));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
