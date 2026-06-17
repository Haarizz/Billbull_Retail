package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "pos_sessions", indexes = {
    @Index(name = "idx_pos_session_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_session_date",   columnList = "session_date"),
    @Index(name = "idx_pos_session_status", columnList = "status")
})
public class PosSession extends BaseEntity {

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "branch_name")
    private String branchName;

    @Column(name = "terminal_id")
    private String terminalId;

    @Column(name = "counter_name")
    private String counterName;

    @Column(name = "opened_by")
    private String openedBy;

    @Column(name = "closed_by")
    private String closedBy;

    @Column(name = "session_date")
    private LocalDate sessionDate;

    @Column(name = "opened_at")
    private LocalDateTime openedAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosSessionStatus status = PosSessionStatus.OPEN;

    @Column(name = "opening_cash")
    private Double openingCash = 0.0;

    @Column(name = "closing_cash")
    private Double closingCash;

    @Column(name = "expected_cash")
    private Double expectedCash;

    @Column(name = "cash_difference")
    private Double cashDifference;

    @Column(name = "total_sales")
    private Double totalSales = 0.0;

    @Column(name = "total_cash_sales")
    private Double totalCashSales = 0.0;

    @Column(name = "total_card_sales")
    private Double totalCardSales = 0.0;

    @Column(name = "total_credit_sales")
    private Double totalCreditSales = 0.0;

    @Column(name = "total_mixed_sales")
    private Double totalMixedSales = 0.0;

    @Column(name = "total_refunds")
    private Double totalRefunds = 0.0;

    @Column(name = "total_voids")
    private Integer totalVoids = 0;

    @Column(name = "invoice_count")
    private Integer invoiceCount = 0;

    @Column(name = "x_report_printed")
    private Boolean xReportPrinted = false;

    @Column(name = "z_report_printed")
    private Boolean zReportPrinted = false;

    @Column(name = "notes", length = 1000)
    private String notes;

    @JsonIgnore
    @OneToMany(mappedBy = "posSession", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<PosCashMovement> cashMovements = new ArrayList<>();

    // Getters & Setters

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getOpenedBy() { return openedBy; }
    public void setOpenedBy(String openedBy) { this.openedBy = openedBy; }

    public String getClosedBy() { return closedBy; }
    public void setClosedBy(String closedBy) { this.closedBy = closedBy; }

    public LocalDate getSessionDate() { return sessionDate; }
    public void setSessionDate(LocalDate sessionDate) { this.sessionDate = sessionDate; }

    public LocalDateTime getOpenedAt() { return openedAt; }
    public void setOpenedAt(LocalDateTime openedAt) { this.openedAt = openedAt; }

    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }

    public PosSessionStatus getStatus() { return status; }
    public void setStatus(PosSessionStatus status) { this.status = status; }

    public Double getOpeningCash() { return openingCash; }
    public void setOpeningCash(Double openingCash) { this.openingCash = openingCash; }

    public Double getClosingCash() { return closingCash; }
    public void setClosingCash(Double closingCash) { this.closingCash = closingCash; }

    public Double getExpectedCash() { return expectedCash; }
    public void setExpectedCash(Double expectedCash) { this.expectedCash = expectedCash; }

    public Double getCashDifference() { return cashDifference; }
    public void setCashDifference(Double cashDifference) { this.cashDifference = cashDifference; }

    public Double getTotalSales() { return totalSales; }
    public void setTotalSales(Double totalSales) { this.totalSales = totalSales; }

    public Double getTotalCashSales() { return totalCashSales; }
    public void setTotalCashSales(Double totalCashSales) { this.totalCashSales = totalCashSales; }

    public Double getTotalCardSales() { return totalCardSales; }
    public void setTotalCardSales(Double totalCardSales) { this.totalCardSales = totalCardSales; }

    public Double getTotalCreditSales() { return totalCreditSales; }
    public void setTotalCreditSales(Double totalCreditSales) { this.totalCreditSales = totalCreditSales; }

    public Double getTotalMixedSales() { return totalMixedSales; }
    public void setTotalMixedSales(Double totalMixedSales) { this.totalMixedSales = totalMixedSales; }

    public Double getTotalRefunds() { return totalRefunds; }
    public void setTotalRefunds(Double totalRefunds) { this.totalRefunds = totalRefunds; }

    public Integer getTotalVoids() { return totalVoids; }
    public void setTotalVoids(Integer totalVoids) { this.totalVoids = totalVoids; }

    public Integer getInvoiceCount() { return invoiceCount; }
    public void setInvoiceCount(Integer invoiceCount) { this.invoiceCount = invoiceCount; }

    public Boolean getXReportPrinted() { return xReportPrinted; }
    public void setXReportPrinted(Boolean xReportPrinted) { this.xReportPrinted = xReportPrinted; }

    public Boolean getZReportPrinted() { return zReportPrinted; }
    public void setZReportPrinted(Boolean zReportPrinted) { this.zReportPrinted = zReportPrinted; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public List<PosCashMovement> getCashMovements() { return cashMovements; }
    public void setCashMovements(List<PosCashMovement> cashMovements) { this.cashMovements = cashMovements; }
}
