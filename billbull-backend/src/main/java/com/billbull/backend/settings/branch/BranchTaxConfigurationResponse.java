package com.billbull.backend.settings.branch;

/**
 * Read DTO for the tax-configuration endpoints. Exposes only the business fields —
 * never the entity's internal audit columns ({@code id}, {@code createdAt/By}, {@code
 * updatedAt/By}, {@code isActive}).
 */
public class BranchTaxConfigurationResponse {

    private final Boolean taxEnabled;
    private final Boolean taxInclusive;
    private final Double branchDefaultVatRate;
    private final Double branchDefaultPurchaseTaxRate;

    public BranchTaxConfigurationResponse(Boolean taxEnabled, Boolean taxInclusive, Double branchDefaultVatRate,
                                          Double branchDefaultPurchaseTaxRate) {
        this.taxEnabled = taxEnabled;
        this.taxInclusive = taxInclusive;
        this.branchDefaultVatRate = branchDefaultVatRate;
        this.branchDefaultPurchaseTaxRate = branchDefaultPurchaseTaxRate;
    }

    public static BranchTaxConfigurationResponse from(BranchTaxConfiguration config) {
        return new BranchTaxConfigurationResponse(
                config.getTaxEnabled(),
                config.getTaxInclusive(),
                config.getBranchDefaultVatRate(),
                config.getBranchDefaultPurchaseTaxRate() != null ? config.getBranchDefaultPurchaseTaxRate() : 0.0);
    }

    public Boolean getTaxEnabled() { return taxEnabled; }
    public Boolean getTaxInclusive() { return taxInclusive; }
    public Double getBranchDefaultVatRate() { return branchDefaultVatRate; }
    public Double getBranchDefaultPurchaseTaxRate() { return branchDefaultPurchaseTaxRate; }
}
