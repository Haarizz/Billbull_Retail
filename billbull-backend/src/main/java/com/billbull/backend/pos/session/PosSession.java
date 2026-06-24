package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "pos_sessions", indexes = {
    @Index(name = "idx_pos_session_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_session_date",   columnList = "session_date"),
    @Index(name = "idx_pos_session_status", columnList = "status"),
    // ARCHFIX §3 — hot session lookup; name matches V3__missing_indexes.sql.
    @Index(name = "idx_pos_sess_lookup",    columnList = "branch_id, terminal_id, status")
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

    @Column(name = "opening_cash", precision = 15, scale = 2)
    private BigDecimal openingCash = BigDecimal.ZERO;

    @Column(name = "closing_cash", precision = 15, scale = 2)
    private BigDecimal closingCash;

    @Column(name = "expected_cash", precision = 15, scale = 2)
    private BigDecimal expectedCash;

    @Column(name = "cash_difference", precision = 15, scale = 2)
    private BigDecimal cashDifference;

    @Column(name = "total_sales", precision = 15, scale = 2)
    private BigDecimal totalSales = BigDecimal.ZERO;

    @Column(name = "total_cash_sales", precision = 15, scale = 2)
    private BigDecimal totalCashSales = BigDecimal.ZERO;

    @Column(name = "total_card_sales", precision = 15, scale = 2)
    private BigDecimal totalCardSales = BigDecimal.ZERO;

    @Column(name = "total_credit_sales", precision = 15, scale = 2)
    private BigDecimal totalCreditSales = BigDecimal.ZERO;

    @Column(name = "total_mixed_sales", precision = 15, scale = 2)
    private BigDecimal totalMixedSales = BigDecimal.ZERO;

    @Column(name = "total_refunds", precision = 15, scale = 2)
    private BigDecimal totalRefunds = BigDecimal.ZERO;

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

    /** Immutable JSON snapshot of the Z-Report summary captured when this session was closed.
     *  Null while the session is open. Written once by closeSession(), never overwritten. */
    @Column(name = "z_report_json", columnDefinition = "TEXT")
    private String zReportJson;

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

    public BigDecimal getOpeningCash() { return openingCash; }
    public void setOpeningCash(BigDecimal openingCash) { this.openingCash = openingCash; }

    public BigDecimal getClosingCash() { return closingCash; }
    public void setClosingCash(BigDecimal closingCash) { this.closingCash = closingCash; }

    public BigDecimal getExpectedCash() { return expectedCash; }
    public void setExpectedCash(BigDecimal expectedCash) { this.expectedCash = expectedCash; }

    public BigDecimal getCashDifference() { return cashDifference; }
    public void setCashDifference(BigDecimal cashDifference) { this.cashDifference = cashDifference; }

    public BigDecimal getTotalSales() { return totalSales; }
    public void setTotalSales(BigDecimal totalSales) { this.totalSales = totalSales; }

    public BigDecimal getTotalCashSales() { return totalCashSales; }
    public void setTotalCashSales(BigDecimal totalCashSales) { this.totalCashSales = totalCashSales; }

    public BigDecimal getTotalCardSales() { return totalCardSales; }
    public void setTotalCardSales(BigDecimal totalCardSales) { this.totalCardSales = totalCardSales; }

    public BigDecimal getTotalCreditSales() { return totalCreditSales; }
    public void setTotalCreditSales(BigDecimal totalCreditSales) { this.totalCreditSales = totalCreditSales; }

    public BigDecimal getTotalMixedSales() { return totalMixedSales; }
    public void setTotalMixedSales(BigDecimal totalMixedSales) { this.totalMixedSales = totalMixedSales; }

    public BigDecimal getTotalRefunds() { return totalRefunds; }
    public void setTotalRefunds(BigDecimal totalRefunds) { this.totalRefunds = totalRefunds; }

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

    public String getZReportJson() { return zReportJson; }
    public void setZReportJson(String zReportJson) { this.zReportJson = zReportJson; }

    public List<PosCashMovement> getCashMovements() { return cashMovements; }
    public void setCashMovements(List<PosCashMovement> cashMovements) { this.cashMovements = cashMovements; }
}
