package com.billbull.backend.hr.targets;

import java.math.BigDecimal;

/** One employee's line in the admin Performance &amp; Targets grid. */
public class EmployeePerformanceRow {

    private Long employeeId;
    private String employeeCode;
    private String employeeName;
    private String role;
    private String department;
    private String branchName;
    private String employeeStatus;

    private BigDecimal targetAmount;
    private BigDecimal commissionRate;
    private BigDecimal sales;
    private long bills;
    /** Null when there is no usable target (zero/absent) — the UI renders "—" rather than 0 or ∞. */
    private BigDecimal achievementPercent;
    private BigDecimal commission;
    /**
     * Has the target been reached? Commission is earned only after it is, so a 0.00 commission
     * means two very different things depending on this flag ("0% rate, target met" vs "target
     * missed") and the UI must be able to tell them apart.
     */
    private boolean commissionEligible;
    /** "Eligible" / "Not Eligible" — the label paired with {@link #commissionEligible}. */
    private String commissionStatus;
    private BigDecimal remainingTarget;
    private String targetStatus;

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }
    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }
    public String getEmployeeName() { return employeeName; }
    public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public String getEmployeeStatus() { return employeeStatus; }
    public void setEmployeeStatus(String employeeStatus) { this.employeeStatus = employeeStatus; }
    public BigDecimal getTargetAmount() { return targetAmount; }
    public void setTargetAmount(BigDecimal targetAmount) { this.targetAmount = targetAmount; }
    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }
    public BigDecimal getSales() { return sales; }
    public void setSales(BigDecimal sales) { this.sales = sales; }
    public long getBills() { return bills; }
    public void setBills(long bills) { this.bills = bills; }
    public BigDecimal getAchievementPercent() { return achievementPercent; }
    public void setAchievementPercent(BigDecimal achievementPercent) { this.achievementPercent = achievementPercent; }
    public BigDecimal getCommission() { return commission; }
    public void setCommission(BigDecimal commission) { this.commission = commission; }
    public boolean isCommissionEligible() { return commissionEligible; }
    public void setCommissionEligible(boolean commissionEligible) { this.commissionEligible = commissionEligible; }
    public String getCommissionStatus() { return commissionStatus; }
    public void setCommissionStatus(String commissionStatus) { this.commissionStatus = commissionStatus; }
    public BigDecimal getRemainingTarget() { return remainingTarget; }
    public void setRemainingTarget(BigDecimal remainingTarget) { this.remainingTarget = remainingTarget; }
    public String getTargetStatus() { return targetStatus; }
    public void setTargetStatus(String targetStatus) { this.targetStatus = targetStatus; }
}
