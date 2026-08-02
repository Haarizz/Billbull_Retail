package com.billbull.backend.pos.reports;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Immutable snapshot of an X-Report, persisted the first time a session's X-Report is
 * explicitly generated (see {@code PosSessionService#generateXReport}). Never updated
 * after creation — {@code reportJson} is the exact payload the cashier/back-office saw
 * at generation time, replayed verbatim by the POS Reports viewer rather than recomputed.
 */
@Entity
@Table(name = "pos_x_report_snapshots", indexes = {
        @Index(name = "idx_pos_x_report_branch_date", columnList = "branch_id, business_date"),
        @Index(name = "idx_pos_x_report_session", columnList = "session_id"),
        @Index(name = "idx_pos_x_report_generated_by", columnList = "generated_by")
})
public class PosXReportSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "report_number", nullable = false, unique = true, length = 50)
    private String reportNumber;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "branch_name", length = 100)
    private String branchName;

    @Column(name = "terminal_id", length = 100)
    private String terminalId;

    @Column(name = "counter_id")
    private Long counterId;

    @Column(name = "counter_name", length = 100)
    private String counterName;

    @Column(name = "cashier_name", length = 100)
    private String cashierName;

    /** Resolved employee full name (User.getResolvedDisplayName()), captured once at
     *  generation time — display-only, never re-resolved on later reads so the snapshot
     *  stays immutable even if the employee is renamed afterward. */
    @Column(name = "cashier_display_name", length = 150)
    private String cashierDisplayName;

    @Column(name = "business_date", nullable = false)
    private LocalDate businessDate;

    @Column(name = "generated_by", length = 100)
    private String generatedBy;

    /** See {@link #cashierDisplayName} doc. */
    @Column(name = "generated_by_display_name", length = 150)
    private String generatedByDisplayName;

    @Column(name = "generated_at", nullable = false)
    private LocalDateTime generatedAt;

    @Column(name = "report_json", nullable = false, columnDefinition = "TEXT")
    private String reportJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getReportNumber() { return reportNumber; }
    public void setReportNumber(String reportNumber) { this.reportNumber = reportNumber; }

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public Long getCounterId() { return counterId; }
    public void setCounterId(Long counterId) { this.counterId = counterId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }

    public String getCashierDisplayName() { return cashierDisplayName; }
    public void setCashierDisplayName(String cashierDisplayName) { this.cashierDisplayName = cashierDisplayName; }

    public LocalDate getBusinessDate() { return businessDate; }
    public void setBusinessDate(LocalDate businessDate) { this.businessDate = businessDate; }

    public String getGeneratedBy() { return generatedBy; }
    public void setGeneratedBy(String generatedBy) { this.generatedBy = generatedBy; }

    public String getGeneratedByDisplayName() { return generatedByDisplayName; }
    public void setGeneratedByDisplayName(String generatedByDisplayName) { this.generatedByDisplayName = generatedByDisplayName; }

    public LocalDateTime getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(LocalDateTime generatedAt) { this.generatedAt = generatedAt; }

    public String getReportJson() { return reportJson; }
    public void setReportJson(String reportJson) { this.reportJson = reportJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
