package com.billbull.backend.financials.receiptvoucher;

/**
 * Defines the accounting context for a Receipt Voucher.
 * Determines how the transaction is mapped to the General Ledger.
 */
public enum ReceiptPurpose {
    CASH_SALE, // Direct Revenue recognition
    AGAINST_INVOICE, // Settlement of Accounts Receivable
    ADVANCE_RECEIVED, // Liability recognition
    REFUND_IN // Recovery of an expense or overpayment
}
