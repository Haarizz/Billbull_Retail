package com.billbull.backend.sales.settings;

import jakarta.persistence.*;
import java.math.BigDecimal;
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

    /**
     * Back-office Sales Invoices must name a real customer — the walk-in customer is refused.
     * OFF by default. The POS has its own per-branch switch ({@code PosSettings.requireCustomer},
     * Console → Behavior); this one covers invoices saved through {@code SalesInvoiceController}.
     */
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean customerRequiredOnSalesInvoice = false;

    /**
     * Pricing rules (Price Levels workspace, V135). A selling price whose gross margin is below
     * {@code pricingMinMarginPercent} is flagged as a margin alert; with
     * {@code pricingBlockBelowCost} a price-level or negotiated price below cost is refused;
     * {@code pricingRoundTo} is the default rounding step for bulk price changes.
     */
    @Column(name = "pricing_min_margin_percent", nullable = false, precision = 7, scale = 2,
            columnDefinition = "numeric(7,2) default 15")
    private BigDecimal pricingMinMarginPercent = new BigDecimal("15");

    @Column(name = "pricing_block_below_cost", nullable = false, columnDefinition = "boolean default false")
    private boolean pricingBlockBelowCost = false;

    @Column(name = "pricing_round_to", nullable = false, precision = 10, scale = 2,
            columnDefinition = "numeric(10,2) default 0.01")
    private BigDecimal pricingRoundTo = new BigDecimal("0.01");

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

    public boolean isCustomerRequiredOnSalesInvoice() {
        return customerRequiredOnSalesInvoice;
    }

    public void setCustomerRequiredOnSalesInvoice(boolean customerRequiredOnSalesInvoice) {
        this.customerRequiredOnSalesInvoice = customerRequiredOnSalesInvoice;
    }

    public List<SalesDocumentNumberSetting> getDocumentNumbering() {
        return documentNumbering;
    }

    public void setDocumentNumbering(List<SalesDocumentNumberSetting> documentNumbering) {
        this.documentNumbering = documentNumbering;
    }

    public BigDecimal getPricingMinMarginPercent() {
        return pricingMinMarginPercent;
    }

    public void setPricingMinMarginPercent(BigDecimal pricingMinMarginPercent) {
        this.pricingMinMarginPercent = pricingMinMarginPercent != null ? pricingMinMarginPercent : new BigDecimal("15");
    }

    public boolean isPricingBlockBelowCost() {
        return pricingBlockBelowCost;
    }

    public void setPricingBlockBelowCost(boolean pricingBlockBelowCost) {
        this.pricingBlockBelowCost = pricingBlockBelowCost;
    }

    public BigDecimal getPricingRoundTo() {
        return pricingRoundTo;
    }

    public void setPricingRoundTo(BigDecimal pricingRoundTo) {
        this.pricingRoundTo = pricingRoundTo != null ? pricingRoundTo : new BigDecimal("0.01");
    }
}
