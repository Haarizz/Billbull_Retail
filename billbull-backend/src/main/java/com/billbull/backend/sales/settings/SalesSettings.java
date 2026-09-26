package com.billbull.backend.sales.settings;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

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
     * FAST_SALE (default): invoice creation auto-completes delivery and stock deduction instantly.
     * WORKFLOW_DRIVEN: full pipeline with manual Delivery Note lifecycle.
     *
     * columnDefinition ensures Hibernate generates a DB-level DEFAULT so that the
     * existing singleton row receives WORKFLOW_DRIVEN when the column is first added.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20) default 'FAST_SALE'")
    private SalesMode salesMode = SalesMode.FAST_SALE;

    /**
     * Which price field from a product's pricing master is auto-filled when an
     * item is added to a Quotation / Sales Order / Sales Invoice. Default is
     * RETAIL — matches the legacy hard-coded behaviour.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20) default 'RETAIL'")
    private SalesItemPricePolicy salesItemPricePolicy = SalesItemPricePolicy.RETAIL;

    /**
     * How the Sales Invoice net total is rounded. Default NEAREST with precision
     * 1.00 snaps the payable total to the nearest whole currency unit.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, columnDefinition = "varchar(10) default 'NEAREST'")
    private SalesRoundingMode roundingMode = SalesRoundingMode.NEAREST;

    /** Rounding step (e.g. 1.00, 0.50, 0.25, 0.05). Ignored when roundingMode is NONE. */
    @Column(nullable = false, columnDefinition = "double precision default 1.0")
    private double roundingPrecision = 1.0;

    /**
     * What to do when a sales document line has a unit price of zero.
     * BLOCK (default) rejects the save until every line carries a price > 0.
     * WARN  shows a confirmation dialog but still allows saving.
     * ALLOW permits zero-price lines (free gifts, samples, promotions).
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, columnDefinition = "varchar(10) default 'BLOCK'")
    private ZeroPricePolicy zeroPricePolicy = ZeroPricePolicy.BLOCK;

    /**
     * Require employee salesperson verification (barcode scan) before a POS checkout may settle.
     *
     * <p>OFF (the default, and what every existing tenant gets) leaves the POS flow exactly as it
     * was. ON makes verification mandatory for EVERY POS sale regardless of the logged-in
     * operator's own designation — a Cashier + Salesperson does not bypass it. Enforced
     * authoritatively in {@code PosCheckoutController} before the invoice is persisted; the POS UI
     * gate is a courtesy.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean salespersonRequiredAtPos = false;

    /**
     * Enable the eligible-salesperson selector on back-office Sales Invoices.
     *
     * <p>Independent of {@link #salespersonRequiredAtPos}. Back office selects manually (no
     * barcode) and is NOT subject to {@link #monthlyTargetRequired} — see
     * {@code TargetReadinessService}'s class comment for that scope decision.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean salespersonRequiredAtBackOffice = false;

    /**
     * Block POS sales until EVERY active salesperson-eligible employee has a current-month target
     * and an explicitly configured commission rate.
     *
     * <p>A GLOBAL, tenant-level readiness condition — not a check against the salesperson selected
     * for the sale in hand. One misconfigured eligible employee blocks every POS sale, at every
     * branch, because the target model is global per employee per month.
     *
     * <p>Deliberately independent of {@link #salespersonRequiredAtPos}: either may be on without
     * the other.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean monthlyTargetRequired = false;

    @Transient
    private List<SalesDocumentNumberSetting> documentNumbering = new ArrayList<>();

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

    public SalesItemPricePolicy getSalesItemPricePolicy() {
        return salesItemPricePolicy;
    }

    public void setSalesItemPricePolicy(SalesItemPricePolicy salesItemPricePolicy) {
        this.salesItemPricePolicy = salesItemPricePolicy;
    }

    public SalesRoundingMode getRoundingMode() {
        return roundingMode;
    }

    public void setRoundingMode(SalesRoundingMode roundingMode) {
        this.roundingMode = roundingMode;
    }

    public double getRoundingPrecision() {
        return roundingPrecision;
    }

    public void setRoundingPrecision(double roundingPrecision) {
        this.roundingPrecision = roundingPrecision;
    }

    public ZeroPricePolicy getZeroPricePolicy() {
        return zeroPricePolicy;
    }

    public void setZeroPricePolicy(ZeroPricePolicy zeroPricePolicy) {
        this.zeroPricePolicy = zeroPricePolicy;
    }

    public boolean isSalespersonRequiredAtPos() {
        return salespersonRequiredAtPos;
    }

    public void setSalespersonRequiredAtPos(boolean salespersonRequiredAtPos) {
        this.salespersonRequiredAtPos = salespersonRequiredAtPos;
    }

    public boolean isSalespersonRequiredAtBackOffice() {
        return salespersonRequiredAtBackOffice;
    }

    public void setSalespersonRequiredAtBackOffice(boolean salespersonRequiredAtBackOffice) {
        this.salespersonRequiredAtBackOffice = salespersonRequiredAtBackOffice;
    }

    public boolean isMonthlyTargetRequired() {
        return monthlyTargetRequired;
    }

    public void setMonthlyTargetRequired(boolean monthlyTargetRequired) {
        this.monthlyTargetRequired = monthlyTargetRequired;
    }

    public List<SalesDocumentNumberSetting> getDocumentNumbering() {
        return documentNumbering;
    }

    public void setDocumentNumbering(List<SalesDocumentNumberSetting> documentNumbering) {
        this.documentNumbering = documentNumbering;
    }
}
