package com.billbull.backend.sales.returns.credit;

/**
 * Lifecycle of one {@link SalesReturnCreditApplication} row.
 *
 * <p>Deliberately the same vocabulary as {@code advance_applications.status}
 * ({@code APPLIED} / {@code REFUNDED}) plus {@code REVERSED}, because the two ledgers are the
 * same kind of object and anyone reading one should not have to learn a second vocabulary.
 *
 * <p>Rows are immutable: a reversal is a new row, never an update of an existing one. Only
 * {@link #APPLIED} rows reduce an invoice's outstanding balance.
 */
public enum SalesReturnCreditApplicationStatus {

    /** Live allocation. This is the only status that reduces the linked invoice's balance. */
    APPLIED,

    /** The allocation was undone (e.g. the return was cancelled). Carries no balance effect. */
    REVERSED,

    /** The allocated credit was paid back out to the customer instead. Carries no balance effect. */
    REFUNDED
}
