package com.billbull.backend.purchase.payment;

public enum PaymentStatus {
    PENDING_APPROVAL,
    POSTED,
    CLEARED,
    REJECTED,
    /**
     * A CHEQUE-mode payment approved in Pay Invoices but not yet paid: its invoices are reserved
     * (no second allotment can exceed them) yet nothing is posted and nothing counts as paid.
     * Issuing the cheque in Financials → Pay Cheques turns it into POSTED; see PayChequeService.
     */
    CHEQUE_PENDING
}