package com.billbull.backend.hr.salarypayments;

import java.math.BigDecimal;

public class PayrollStatsDTO {
    private long totalEmployees;
    private BigDecimal totalPayable;
    private long pendingCount;
    private BigDecimal pendingAmount; 
    private long paidCount;

    public PayrollStatsDTO() {
    }

    public PayrollStatsDTO(long totalEmployees, BigDecimal totalPayable, long pendingCount, BigDecimal pendingAmount, long paidCount) {
        this.totalEmployees = totalEmployees;
        this.totalPayable = totalPayable;
        this.pendingCount = pendingCount;
        this.pendingAmount = pendingAmount;
        this.paidCount = paidCount;
    }

    public long getTotalEmployees() {
        return totalEmployees;
    }

    public void setTotalEmployees(long totalEmployees) {
        this.totalEmployees = totalEmployees;
    }

    public BigDecimal getTotalPayable() {
        return totalPayable;
    }

    public void setTotalPayable(BigDecimal totalPayable) {
        this.totalPayable = totalPayable;
    }

    public long getPendingCount() {
        return pendingCount;
    }

    public void setPendingCount(long pendingCount) {
        this.pendingCount = pendingCount;
    }

    public BigDecimal getPendingAmount() {
        return pendingAmount;
    }

    public void setPendingAmount(BigDecimal pendingAmount) {
        this.pendingAmount = pendingAmount;
    }

    public long getPaidCount() {
        return paidCount;
    }

    public void setPaidCount(long paidCount) {
        this.paidCount = paidCount;
    }
}