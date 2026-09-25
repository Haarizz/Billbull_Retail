package com.billbull.backend.hr.employees;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * What the POS salesperson verification modal renders after a successful barcode scan.
 *
 * <p>Readable by any authenticated user, so it is a strict projection: identity, designation,
 * status, and this month's target/commission. No phone, email, salary, documents or address.
 *
 * <p>{@link #commissionRate} is nullable and that null is meaningful — it is "commission not
 * configured", which is a different state from a configured 0%. The modal must render it as
 * "Not set" rather than "0%".
 */
public class SalespersonLookupResponse {

    private Long id;
    private String employeeCode;
    private String name;
    private String role;
    private String status;
    /** The month the target/commission below belong to, normalised to its first day. */
    private LocalDate targetMonth;
    /** Null when no target row exists for the month. */
    private BigDecimal targetAmount;
    /** Null when commission has not been configured. 0.00 means an explicit 0%. */
    private BigDecimal commissionRate;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDate getTargetMonth() { return targetMonth; }
    public void setTargetMonth(LocalDate targetMonth) { this.targetMonth = targetMonth; }

    public BigDecimal getTargetAmount() { return targetAmount; }
    public void setTargetAmount(BigDecimal targetAmount) { this.targetAmount = targetAmount; }

    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }
}
