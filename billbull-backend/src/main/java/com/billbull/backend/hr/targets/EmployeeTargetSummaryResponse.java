package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One employee's target achievement for this month and last, for the global search panel.
 *
 * <p>A slim projection of {@link EmployeePerformanceRow}: target, sales, bills, achievement and
 * the target status — computed by {@link EmployeePerformanceService} exactly as the admin grid
 * computes them. Commission rate and amount are deliberately left out; they are pay, and pay is
 * not shown in search through this endpoint.
 *
 * <p>Always consolidated across branches: the target is global per employee, so a branch slice of
 * sales is not comparable to it (see {@link EmployeePerformanceResponse#isBranchFiltered()}).
 */
public class EmployeeTargetSummaryResponse {

    private Month currentMonth;
    private Month previousMonth;

    public Month getCurrentMonth() { return currentMonth; }
    public void setCurrentMonth(Month currentMonth) { this.currentMonth = currentMonth; }
    public Month getPreviousMonth() { return previousMonth; }
    public void setPreviousMonth(Month previousMonth) { this.previousMonth = previousMonth; }

    public static class Month {
        private LocalDate month;
        /** Null when no target is set for the month. */
        private BigDecimal targetAmount;
        private BigDecimal sales;
        private long bills;
        /** Null when there is no usable target — rendered "—", never 0 or ∞. */
        private BigDecimal achievementPercent;
        private String targetStatus;

        static Month of(LocalDate month, EmployeePerformanceRow row) {
            Month m = new Month();
            m.month = month;
            m.targetAmount = row.getTargetAmount();
            m.sales = row.getSales();
            m.bills = row.getBills();
            m.achievementPercent = row.getAchievementPercent();
            m.targetStatus = row.getTargetStatus();
            return m;
        }

        public LocalDate getMonth() { return month; }
        public BigDecimal getTargetAmount() { return targetAmount; }
        public BigDecimal getSales() { return sales; }
        public long getBills() { return bills; }
        public BigDecimal getAchievementPercent() { return achievementPercent; }
        public String getTargetStatus() { return targetStatus; }
    }
}
