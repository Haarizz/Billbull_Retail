package com.billbull.backend.sales.settings;

public enum CreditLimitPolicy {
    WARNING, // Show a warning but allow the transaction
    BLOCK, // Block the transaction if credit limit is exceeded
    NO_IMPACT // No check performed
}
