package com.billbull.backend.sales.settings;

import jakarta.persistence.*;

/**
 * Singleton entity: always ONE row with id = 1.
 * Stores global configuration for the Sales module.
 */
@Entity
@Table(name = "sales_settings")
public class SalesSettings {

    @Id
    private Long id = 1L;

    /**
     * When true, the system requires sufficient stock before a Sales Invoice
     * can be posted. If stock is insufficient, the post is rejected.
     */
    @Column(nullable = false)
    private boolean stockCheckRequired = false;

    /**
     * Controls what happens when a customer's outstanding balance exceeds
     * their credit limit at the time of invoicing.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CreditLimitPolicy creditLimitPolicy = CreditLimitPolicy.NO_IMPACT;

    /**
     * Controls the global sales execution mode.
     *
     * WORKFLOW_DRIVEN (default): full pipeline with manual Delivery Note lifecycle.
     * FAST_SALE: invoice creation auto-completes delivery and stock deduction instantly.
     *
     * columnDefinition ensures Hibernate generates a DB-level DEFAULT so that the
     * existing singleton row receives WORKFLOW_DRIVEN when the column is first added.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20) default 'WORKFLOW_DRIVEN'")
    private SalesMode salesMode = SalesMode.WORKFLOW_DRIVEN;

    // ------------------------------------------------
    // Getters & Setters
    // ------------------------------------------------

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public boolean isStockCheckRequired() {
        return stockCheckRequired;
    }

    public void setStockCheckRequired(boolean stockCheckRequired) {
        this.stockCheckRequired = stockCheckRequired;
    }

    public CreditLimitPolicy getCreditLimitPolicy() {
        return creditLimitPolicy;
    }

    public void setCreditLimitPolicy(CreditLimitPolicy creditLimitPolicy) {
        this.creditLimitPolicy = creditLimitPolicy;
    }

    public SalesMode getSalesMode() {
        return salesMode;
    }

    public void setSalesMode(SalesMode salesMode) {
        this.salesMode = salesMode;
    }
}
