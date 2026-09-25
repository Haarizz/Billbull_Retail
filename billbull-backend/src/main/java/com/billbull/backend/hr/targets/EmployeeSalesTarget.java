package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One employee's sales target and commission rate for one month.
 *
 * <p>{@link #targetMonth} is always the FIRST day of the month (normalised by
 * {@link EmployeeSalesTargetService}), so {@code 2026-09-01} means "September 2026". Phase 1 is
 * monthly only; a future weekly/quarterly period type slots in as a discriminator beside this
 * column rather than by re-typing it.
 *
 * <p>There is deliberately no {@code branchId}: an employee sells across branches (see
 * {@code Employee.additionalBranchIds}, and a POS sale's branch comes from the terminal, not the
 * employee), so the target is GLOBAL per employee per month. Branch filters only the sales side of
 * the comparison — see {@code EmployeePerformanceService}.
 */
@Entity
@Table(
    name = "employee_sales_targets",
    uniqueConstraints = @UniqueConstraint(
            name = "uq_employee_sales_target_month",
            columnNames = { "employee_id", "target_month" }),
    indexes = @Index(name = "idx_employee_sales_target_month", columnList = "target_month")
)
public class EmployeeSalesTarget extends BaseEntity {

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    /** Always the first day of the month this target applies to. */
    @Column(name = "target_month", nullable = false)
    private LocalDate targetMonth;

    @Column(name = "target_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal targetAmount = BigDecimal.ZERO;

    /**
     * Commission as a PERCENTAGE rate (10.00 = 10%), not a fraction and not money.
     *
     * <p>NULLABLE, and deliberately so: {@code null} means "commission has not been configured",
     * which is a different fact from {@code 0.00}, meaning "configured, and the rate is zero". The
     * Phase 2 target-readiness rule has to tell those apart — a deliberate 0% commission is a
     * complete configuration and must not block sales, while an unset one must. The column was
     * originally {@code NOT NULL DEFAULT 0}, which collapsed both into zero; V104 relaxes it.
     *
     * <p>Existing zero rows are left as explicit zeros by that migration. They were written by a
     * UI that always sent a number, so they are configured-zero, not placeholders — rewriting them
     * to NULL would invent a blocking condition out of nothing.
     *
     * <p>Every arithmetic consumer already null-guards ({@code EmployeePerformanceService.nz}), so
     * the commission formula is unchanged: a null rate still yields a zero commission amount.
     */
    @Column(name = "commission_rate", precision = 5, scale = 2)
    private BigDecimal commissionRate;

    @Column(name = "status", length = 20)
    private String status;

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }

    public LocalDate getTargetMonth() { return targetMonth; }
    public void setTargetMonth(LocalDate targetMonth) { this.targetMonth = targetMonth; }

    public BigDecimal getTargetAmount() { return targetAmount; }
    public void setTargetAmount(BigDecimal targetAmount) { this.targetAmount = targetAmount; }

    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
