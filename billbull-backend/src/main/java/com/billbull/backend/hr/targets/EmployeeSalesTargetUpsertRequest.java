package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One row of the Set Targets grid. {@code targetMonth} accepts any date within the month; the
 * service normalises it to the first day.
 */
public class EmployeeSalesTargetUpsertRequest {

    private Long employeeId;
    private LocalDate targetMonth;
    private BigDecimal targetAmount;
    private BigDecimal commissionRate;

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }

    public LocalDate getTargetMonth() { return targetMonth; }
    public void setTargetMonth(LocalDate targetMonth) { this.targetMonth = targetMonth; }

    public BigDecimal getTargetAmount() { return targetAmount; }
    public void setTargetAmount(BigDecimal targetAmount) { this.targetAmount = targetAmount; }

    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }
}
