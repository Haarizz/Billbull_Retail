package com.billbull.backend.financials.pdc;

public enum PdcStatus {
    RECEIVED, // Initial state upon receipt from customer
    DEPOSITED, // Sent to bank for clearing
    CLEARED, // Funds hit the actual bank account
    BOUNCED, // Cheque bounced (NSF)
    CANCELLED // Cheque cancelled/returned before clearing
}
