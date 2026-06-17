package com.billbull.backend.financials.prepaid;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Prepaid expense record (PDF §14 Prepaid Expense Amortization).
 * Monthly amortization: Dr Expense Account / Cr Prepaid Expenses (1320).
 */
@Entity
@Table(name = "prepaid_expenses")
public class PrepaidExpense extends BaseEntity {

    public enum PrepaidStatus { ACTIVE, FULLY_AMORTIZED, CANCELLED }

    @Column(nullable = false)
    private String prepaidCode;

    @Column(nullable = false)
    private String description;

    /** Total amount prepaid (original prepaid asset value). */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    /** Accumulated amortization so far. */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amortizedAmount = BigDecimal.ZERO;

    /** Number of months over which to amortize. */
    @Column(nullable = false)
    private int amortizationMonths;

    /** Expense account to debit each month (e.g. 6001 Rent, 6002 Utilities). */
    @Column(nullable = false)
    private String expenseAccountCode;

    @Column(nullable = false)
    private LocalDate startDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PrepaidStatus status = PrepaidStatus.ACTIVE;

    private String costCenter;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    // ── computed helpers ────────────────────────────────────────────────────

    public BigDecimal getMonthlyAmortization() {
        if (amortizationMonths <= 0) return BigDecimal.ZERO;
        return totalAmount.divide(new BigDecimal(amortizationMonths), 2, java.math.RoundingMode.HALF_UP);
    }

    public BigDecimal getRemainingAmount() {
        return totalAmount.subtract(amortizedAmount != null ? amortizedAmount : BigDecimal.ZERO);
    }

    // ── getters / setters ──────────────────────────────────────────────────

    public String getPrepaidCode() { return prepaidCode; }
    public void setPrepaidCode(String prepaidCode) { this.prepaidCode = prepaidCode; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public BigDecimal getAmortizedAmount() { return amortizedAmount; }
    public void setAmortizedAmount(BigDecimal amortizedAmount) { this.amortizedAmount = amortizedAmount; }

    public int getAmortizationMonths() { return amortizationMonths; }
    public void setAmortizationMonths(int amortizationMonths) { this.amortizationMonths = amortizationMonths; }

    public String getExpenseAccountCode() { return expenseAccountCode; }
    public void setExpenseAccountCode(String expenseAccountCode) { this.expenseAccountCode = expenseAccountCode; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public PrepaidStatus getStatus() { return status; }
    public void setStatus(PrepaidStatus status) { this.status = status; }

    public String getCostCenter() { return costCenter; }
    public void setCostCenter(String costCenter) { this.costCenter = costCenter; }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }
}
