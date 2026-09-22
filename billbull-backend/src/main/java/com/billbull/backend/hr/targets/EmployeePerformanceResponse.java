package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Admin Performance &amp; Targets payload: the per-employee rows plus server-computed totals. */
public class EmployeePerformanceResponse {

    private LocalDate month;
    /** Null = All Branches (consolidated). */
    private Long branchId;
    /**
     * True when a specific branch is selected. The target is global per employee, so a
     * branch-filtered sales figure is not directly comparable to it — the UI uses this flag to
     * suppress the achievement percentage for the filtered view rather than showing a number that
     * silently compares one branch's sales against a whole-company target.
     */
    private boolean branchFiltered;

    private List<EmployeePerformanceRow> rows;

    private BigDecimal totalTarget;
    private BigDecimal totalSales;
    private long totalBills;
    /** SUM(sales) / SUM(target) × 100 — never the mean of the per-row percentages. Null when
     *  there is no usable total target, or when the view is branch-filtered. */
    private BigDecimal overallAchievementPercent;
    private BigDecimal totalCommission;

    /** Sales in the period with no salesperson attribution (historical or unselected). */
    private BigDecimal unassignedSales;
    private long unassignedBills;

    public LocalDate getMonth() { return month; }
    public void setMonth(LocalDate month) { this.month = month; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public boolean isBranchFiltered() { return branchFiltered; }
    public void setBranchFiltered(boolean branchFiltered) { this.branchFiltered = branchFiltered; }
    public List<EmployeePerformanceRow> getRows() { return rows; }
    public void setRows(List<EmployeePerformanceRow> rows) { this.rows = rows; }
    public BigDecimal getTotalTarget() { return totalTarget; }
    public void setTotalTarget(BigDecimal totalTarget) { this.totalTarget = totalTarget; }
    public BigDecimal getTotalSales() { return totalSales; }
    public void setTotalSales(BigDecimal totalSales) { this.totalSales = totalSales; }
    public long getTotalBills() { return totalBills; }
    public void setTotalBills(long totalBills) { this.totalBills = totalBills; }
    public BigDecimal getOverallAchievementPercent() { return overallAchievementPercent; }
    public void setOverallAchievementPercent(BigDecimal v) { this.overallAchievementPercent = v; }
    public BigDecimal getTotalCommission() { return totalCommission; }
    public void setTotalCommission(BigDecimal totalCommission) { this.totalCommission = totalCommission; }
    public BigDecimal getUnassignedSales() { return unassignedSales; }
    public void setUnassignedSales(BigDecimal unassignedSales) { this.unassignedSales = unassignedSales; }
    public long getUnassignedBills() { return unassignedBills; }
    public void setUnassignedBills(long unassignedBills) { this.unassignedBills = unassignedBills; }
}
