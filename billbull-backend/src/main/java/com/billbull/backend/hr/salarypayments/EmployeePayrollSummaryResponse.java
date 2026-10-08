package com.billbull.backend.hr.salarypayments;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One employee's payroll at a glance, for the global search employee panel.
 *
 * <p>A strict figures-only projection of {@link SalaryPayment}: the current period's line, the
 * year-to-date paid total and when the last payment went out. It deliberately carries no
 * {@code paymentMethod}, no bank details and no other employee's rows — the panel is a glance,
 * and the Payroll screen remains where a record is worked on.
 */
public class EmployeePayrollSummaryResponse {

    /** The current period's payroll line, or null when none has been created yet. */
    private Period currentMonth;
    /** The calendar year {@link #salaryYtd} covers. */
    private int ytdYear;
    /** SUM(netPayable) of this year's Paid lines. Pending/On Hold lines are not salary received. */
    private BigDecimal salaryYtd;
    /** The most recent Paid line, or null when the employee has never been paid. */
    private LatestPayslip latestPayslip;

    public Period getCurrentMonth() { return currentMonth; }
    public void setCurrentMonth(Period currentMonth) { this.currentMonth = currentMonth; }
    public int getYtdYear() { return ytdYear; }
    public void setYtdYear(int ytdYear) { this.ytdYear = ytdYear; }
    public BigDecimal getSalaryYtd() { return salaryYtd; }
    public void setSalaryYtd(BigDecimal salaryYtd) { this.salaryYtd = salaryYtd; }
    public LatestPayslip getLatestPayslip() { return latestPayslip; }
    public void setLatestPayslip(LatestPayslip latestPayslip) { this.latestPayslip = latestPayslip; }

    public static class Period {
        private int month;
        private int year;
        private BigDecimal baseSalary;
        private BigDecimal allowances;
        private BigDecimal deductions;
        private BigDecimal netPayable;
        /** Payroll status ("Pending", "Paid", "On Hold") — not employment status. */
        private String status;

        static Period of(SalaryPayment p) {
            Period period = new Period();
            period.month = p.getSalaryMonth();
            period.year = p.getSalaryYear();
            period.baseSalary = p.getBaseSalary();
            period.allowances = p.getAllowances();
            period.deductions = p.getDeductions();
            period.netPayable = p.getNetPayable();
            period.status = p.getStatus();
            return period;
        }

        public int getMonth() { return month; }
        public int getYear() { return year; }
        public BigDecimal getBaseSalary() { return baseSalary; }
        public BigDecimal getAllowances() { return allowances; }
        public BigDecimal getDeductions() { return deductions; }
        public BigDecimal getNetPayable() { return netPayable; }
        public String getStatus() { return status; }
    }

    public static class LatestPayslip {
        private int month;
        private int year;
        private LocalDate paymentDate;

        static LatestPayslip of(SalaryPayment p) {
            LatestPayslip slip = new LatestPayslip();
            slip.month = p.getSalaryMonth();
            slip.year = p.getSalaryYear();
            slip.paymentDate = p.getPaymentDate();
            return slip;
        }

        public int getMonth() { return month; }
        public int getYear() { return year; }
        public LocalDate getPaymentDate() { return paymentDate; }
    }
}
