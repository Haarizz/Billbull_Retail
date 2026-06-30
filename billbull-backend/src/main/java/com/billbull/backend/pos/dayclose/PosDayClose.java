package com.billbull.backend.pos.dayclose;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_day_closes", uniqueConstraints = {
        @UniqueConstraint(name = "uk_pos_day_close_branch_date", columnNames = {"branch_id", "close_date"})
})
public class PosDayClose {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "close_date", nullable = false)
    private LocalDate closeDate;

    @Column(name = "closed_by", length = 100)
    private String closedBy;

    @Column(name = "closed_at", nullable = false)
    private LocalDateTime closedAt;

    @Column(name = "report_version", length = 50)
    private String reportVersion;

    @Column(name = "app_version", length = 50)
    private String appVersion;

    @Column(name = "branch_name", length = 100)
    private String branchName;

    @Column(name = "branch_code", length = 50)
    private String branchCode;

    @Column(name = "time_zone", length = 50)
    private String timeZone;

    @Column(name = "z_report_json", columnDefinition = "TEXT")
    private String zReportJson;

    @Column(name = "gross_sales", precision = 19, scale = 4)
    private BigDecimal grossSales = BigDecimal.ZERO;

    @Column(name = "net_sales", precision = 19, scale = 4)
    private BigDecimal netSales = BigDecimal.ZERO;

    @Column(name = "total_discount", precision = 19, scale = 4)
    private BigDecimal totalDiscount = BigDecimal.ZERO;

    @Column(name = "total_vat", precision = 19, scale = 4)
    private BigDecimal totalVat = BigDecimal.ZERO;

    @Column(name = "cash_sales", precision = 19, scale = 4)
    private BigDecimal cashSales = BigDecimal.ZERO;

    @Column(name = "card_sales", precision = 19, scale = 4)
    private BigDecimal cardSales = BigDecimal.ZERO;

    @Column(name = "credit_sales", precision = 19, scale = 4)
    private BigDecimal creditSales = BigDecimal.ZERO;

    @Column(name = "other_sales", precision = 19, scale = 4)
    private BigDecimal otherSales = BigDecimal.ZERO;

    @Column(name = "expected_cash", precision = 19, scale = 4)
    private BigDecimal expectedCash = BigDecimal.ZERO;

    @Column(name = "total_invoices")
    private Integer totalInvoices = 0;

    @Column(name = "total_sessions")
    private Integer totalSessions = 0;

    public PosDayClose() {
    }

    // Getters and Setters

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public LocalDate getCloseDate() {
        return closeDate;
    }

    public void setCloseDate(LocalDate closeDate) {
        this.closeDate = closeDate;
    }

    public String getClosedBy() {
        return closedBy;
    }

    public void setClosedBy(String closedBy) {
        this.closedBy = closedBy;
    }

    public LocalDateTime getClosedAt() {
        return closedAt;
    }

    public void setClosedAt(LocalDateTime closedAt) {
        this.closedAt = closedAt;
    }

    public String getReportVersion() {
        return reportVersion;
    }

    public void setReportVersion(String reportVersion) {
        this.reportVersion = reportVersion;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public void setAppVersion(String appVersion) {
        this.appVersion = appVersion;
    }

    public String getBranchName() {
        return branchName;
    }

    public void setBranchName(String branchName) {
        this.branchName = branchName;
    }

    public String getBranchCode() {
        return branchCode;
    }

    public void setBranchCode(String branchCode) {
        this.branchCode = branchCode;
    }

    public String getTimeZone() {
        return timeZone;
    }

    public void setTimeZone(String timeZone) {
        this.timeZone = timeZone;
    }

    public String getzReportJson() {
        return zReportJson;
    }

    public void setzReportJson(String zReportJson) {
        this.zReportJson = zReportJson;
    }

    public BigDecimal getGrossSales() {
        return grossSales;
    }

    public void setGrossSales(BigDecimal grossSales) {
        this.grossSales = grossSales;
    }

    public BigDecimal getNetSales() {
        return netSales;
    }

    public void setNetSales(BigDecimal netSales) {
        this.netSales = netSales;
    }

    public BigDecimal getTotalDiscount() {
        return totalDiscount;
    }

    public void setTotalDiscount(BigDecimal totalDiscount) {
        this.totalDiscount = totalDiscount;
    }

    public BigDecimal getTotalVat() {
        return totalVat;
    }

    public void setTotalVat(BigDecimal totalVat) {
        this.totalVat = totalVat;
    }

    public BigDecimal getCashSales() {
        return cashSales;
    }

    public void setCashSales(BigDecimal cashSales) {
        this.cashSales = cashSales;
    }

    public BigDecimal getCardSales() {
        return cardSales;
    }

    public void setCardSales(BigDecimal cardSales) {
        this.cardSales = cardSales;
    }

    public BigDecimal getCreditSales() {
        return creditSales;
    }

    public void setCreditSales(BigDecimal creditSales) {
        this.creditSales = creditSales;
    }

    public BigDecimal getOtherSales() {
        return otherSales;
    }

    public void setOtherSales(BigDecimal otherSales) {
        this.otherSales = otherSales;
    }

    public BigDecimal getExpectedCash() {
        return expectedCash;
    }

    public void setExpectedCash(BigDecimal expectedCash) {
        this.expectedCash = expectedCash;
    }

    public Integer getTotalInvoices() {
        return totalInvoices;
    }

    public void setTotalInvoices(Integer totalInvoices) {
        this.totalInvoices = totalInvoices;
    }

    public Integer getTotalSessions() {
        return totalSessions;
    }

    public void setTotalSessions(Integer totalSessions) {
        this.totalSessions = totalSessions;
    }
}
