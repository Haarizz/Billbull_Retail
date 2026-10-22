package com.billbull.backend.financials.cheque;

/** The document a cheque allocation points at. */
public enum PayChequeSourceType {
    /** A CHEQUE-mode purchase payment voucher (Vendors and Purchases, Payments / Pay Invoices). */
    PAYMENT_VOUCHER,
    /** A Cheque-mode expense row (Financials, Expenses). */
    EXPENSE
}
