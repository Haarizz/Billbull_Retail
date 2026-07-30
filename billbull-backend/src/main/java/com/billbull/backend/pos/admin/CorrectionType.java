package com.billbull.backend.pos.admin;

/** The nature of the correction being requested, independent of which entity it targets. */
public enum CorrectionType {
    DENOMINATION,
    PAYMENT_MODE,
    CUSTOMER,
    RECEIPT_AMOUNT,
    ADVANCE_PAYMENT,
    CASH_MOVEMENT_CATEGORY,
    OTHER
}
