package com.billbull.backend.settings.branch;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Branch-level tax configuration — the single source of truth for {@code taxEnabled},
 * {@code taxMode} (inclusive/exclusive), and {@code branchDefaultVatRate}. Tax is a branch-wide
 * ERP configuration (used by POS, Sales Invoice, Quotation, Sales Order, Delivery Note, Proforma,
 * Product Pricing, Financials, Reports), not a POS-specific setting — this entity deliberately
 * lives outside {@code pos.settings.PosSettings}. Only {@link com.billbull.backend.common.tax.BranchTaxResolutionService}
 * should read this entity directly; every other module resolves tax through that service.
 *
 * Future tax fields (VAT registration number, tax authority, fiscal country, rounding method,
 * decimal precision, reverse charge, zero-rated/exempt rules, tax categories, e-invoice, etc.)
 * belong on this entity as they're implemented — the resolver's public API is designed to absorb
 * them without another architectural change.
 */
@Entity
@Table(name = "branch_tax_configuration")
public class BranchTaxConfiguration extends BaseEntity {

    @Column(name = "branch_id", unique = true, nullable = false)
    private Long branchId;

    /** Master switch. When false, tax calculations are disabled for this branch going forward
     *  (historical documents are unaffected — the snapshot on each line item never changes). */
    @JsonProperty("taxEnabled")
    @Column(name = "tax_enabled", nullable = false)
    private Boolean taxEnabled = true;

    /** true = prices already include VAT (extracted at calc time); false = VAT added on top. */
    @JsonProperty("taxInclusive")
    @Column(name = "tax_inclusive", nullable = false)
    private Boolean taxInclusive = false;

    /** Branch Default VAT Rate — used only when a product has no Sales Tax configured. */
    @JsonProperty("branchDefaultVatRate")
    @Column(name = "branch_default_vat_rate")
    private Double branchDefaultVatRate = 0.0;

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public Boolean getTaxEnabled() { return taxEnabled; }
    public void setTaxEnabled(Boolean taxEnabled) { this.taxEnabled = taxEnabled; }

    public Boolean getTaxInclusive() { return taxInclusive; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }

    public Double getBranchDefaultVatRate() { return branchDefaultVatRate; }
    public void setBranchDefaultVatRate(Double branchDefaultVatRate) { this.branchDefaultVatRate = branchDefaultVatRate; }
}
