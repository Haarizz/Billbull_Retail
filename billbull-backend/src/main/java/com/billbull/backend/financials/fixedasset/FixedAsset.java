package com.billbull.backend.financials.fixedasset;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Fixed asset register entry (PDF §02 Employee/Fixed Asset master, §14 Depreciation).
 * Each row represents one asset; depreciation is calculated straight-line monthly.
 */
@Entity
@Table(name = "fixed_assets")
public class FixedAsset extends BaseEntity {

    public enum AssetStatus { ACTIVE, FULLY_DEPRECIATED, DISPOSED }

    @Column(nullable = false)
    private String assetCode;

    @Column(nullable = false)
    private String assetName;

    private String description;

    /** Account code for the asset (e.g. 1400 Equipment). */
    @Column(nullable = false)
    private String assetAccountCode;

    /** Account code for accumulated depreciation (e.g. 1450). */
    @Column(nullable = false)
    private String accumDeprecAccountCode;

    /** Account code for depreciation expense (e.g. 6030). */
    @Column(nullable = false)
    private String depExpenseAccountCode;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal purchaseCost;

    /** Estimated salvage/residual value at end of useful life. */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal residualValue = BigDecimal.ZERO;

    /** Useful life in months. */
    @Column(nullable = false)
    private int usefulLifeMonths;

    @Column(nullable = false)
    private LocalDate purchaseDate;

    /** First depreciation run date (usually first day of month after purchase). */
    @Column(nullable = false)
    private LocalDate depreciationStartDate;

    @Column(precision = 15, scale = 2)
    private BigDecimal accumulatedDepreciation = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssetStatus status = AssetStatus.ACTIVE;

    /** Cost center for departmental P&L tagging. */
    private String costCenter;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    /** Reference to source purchase document. */
    private String purchaseRef;

    // ── computed helpers ────────────────────────────────────────────────────

    public BigDecimal getDepreciableAmount() {
        return purchaseCost.subtract(residualValue);
    }

    public BigDecimal getMonthlyDepreciation() {
        if (usefulLifeMonths <= 0) return BigDecimal.ZERO;
        return getDepreciableAmount()
                .divide(new BigDecimal(usefulLifeMonths), 2, java.math.RoundingMode.HALF_UP);
    }

    public BigDecimal getNetBookValue() {
        return purchaseCost.subtract(accumulatedDepreciation != null ? accumulatedDepreciation : BigDecimal.ZERO);
    }

    // ── getters / setters ──────────────────────────────────────────────────

    public String getAssetCode() { return assetCode; }
    public void setAssetCode(String assetCode) { this.assetCode = assetCode; }

    public String getAssetName() { return assetName; }
    public void setAssetName(String assetName) { this.assetName = assetName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getAssetAccountCode() { return assetAccountCode; }
    public void setAssetAccountCode(String assetAccountCode) { this.assetAccountCode = assetAccountCode; }

    public String getAccumDeprecAccountCode() { return accumDeprecAccountCode; }
    public void setAccumDeprecAccountCode(String accumDeprecAccountCode) { this.accumDeprecAccountCode = accumDeprecAccountCode; }

    public String getDepExpenseAccountCode() { return depExpenseAccountCode; }
    public void setDepExpenseAccountCode(String depExpenseAccountCode) { this.depExpenseAccountCode = depExpenseAccountCode; }

    public BigDecimal getPurchaseCost() { return purchaseCost; }
    public void setPurchaseCost(BigDecimal purchaseCost) { this.purchaseCost = purchaseCost; }

    public BigDecimal getResidualValue() { return residualValue; }
    public void setResidualValue(BigDecimal residualValue) { this.residualValue = residualValue; }

    public int getUsefulLifeMonths() { return usefulLifeMonths; }
    public void setUsefulLifeMonths(int usefulLifeMonths) { this.usefulLifeMonths = usefulLifeMonths; }

    public LocalDate getPurchaseDate() { return purchaseDate; }
    public void setPurchaseDate(LocalDate purchaseDate) { this.purchaseDate = purchaseDate; }

    public LocalDate getDepreciationStartDate() { return depreciationStartDate; }
    public void setDepreciationStartDate(LocalDate depreciationStartDate) { this.depreciationStartDate = depreciationStartDate; }

    public BigDecimal getAccumulatedDepreciation() { return accumulatedDepreciation; }
    public void setAccumulatedDepreciation(BigDecimal accumulatedDepreciation) { this.accumulatedDepreciation = accumulatedDepreciation; }

    public AssetStatus getStatus() { return status; }
    public void setStatus(AssetStatus status) { this.status = status; }

    public String getCostCenter() { return costCenter; }
    public void setCostCenter(String costCenter) { this.costCenter = costCenter; }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getPurchaseRef() { return purchaseRef; }
    public void setPurchaseRef(String purchaseRef) { this.purchaseRef = purchaseRef; }
}
