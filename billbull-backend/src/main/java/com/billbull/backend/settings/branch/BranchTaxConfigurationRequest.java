package com.billbull.backend.settings.branch;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

/**
 * Write DTO for {@code PUT /api/branches/{branchId}/tax-configuration}. Deliberately exposes
 * only the three editable business fields — never the underlying {@link BranchTaxConfiguration}
 * entity (which carries {@code id}/{@code createdAt}/{@code createdBy}/{@code updatedAt}/
 * {@code updatedBy}/{@code isActive} inherited from BaseEntity). Entity mapping happens only in
 * {@link BranchTaxConfigurationService}.
 */
public class BranchTaxConfigurationRequest {

    private Boolean taxEnabled;

    private Boolean taxInclusive;

    @DecimalMin(value = "0", message = "Branch Default VAT Rate cannot be negative")
    @DecimalMax(value = "100", message = "Branch Default VAT Rate cannot exceed 100")
    private Double branchDefaultVatRate;

    public Boolean getTaxEnabled() { return taxEnabled; }
    public void setTaxEnabled(Boolean taxEnabled) { this.taxEnabled = taxEnabled; }

    public Boolean getTaxInclusive() { return taxInclusive; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }

    public Double getBranchDefaultVatRate() { return branchDefaultVatRate; }
    public void setBranchDefaultVatRate(Double branchDefaultVatRate) { this.branchDefaultVatRate = branchDefaultVatRate; }
}
