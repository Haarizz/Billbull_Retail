package com.billbull.backend.pos.reports;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Lightweight summary row for {@code GET /api/pos/reports} — deliberately excludes the
 * full report JSON so the back-office list/filter/pagination screen never transfers the
 * large snapshot payload; that is only loaded by the detail endpoints
 * ({@code GET /api/pos/reports/x/{id}} / {@code /z/{id}}) when a specific report is opened.
 */
public class PosReportSummary {

    private Long id;
    private String reportNumber;
    private String reportType; // "X" or "Z"
    private LocalDate businessDate;
    private Long branchId;
    private String branchName;
    private String terminalId;
    private String counterName;
    private String cashierName;
    private String generatedBy;
    private LocalDateTime generatedAt;
    private String status;

    public static PosReportSummary fromX(PosXReportSnapshot s) {
        PosReportSummary r = new PosReportSummary();
        r.id = s.getId();
        r.reportNumber = s.getReportNumber();
        r.reportType = "X";
        r.businessDate = s.getBusinessDate();
        r.branchId = s.getBranchId();
        r.branchName = s.getBranchName();
        r.terminalId = s.getTerminalId();
        r.counterName = s.getCounterName();
        r.cashierName = s.getCashierName();
        r.generatedBy = s.getGeneratedBy();
        r.generatedAt = s.getGeneratedAt();
        r.status = "GENERATED";
        return r;
    }

    public static PosReportSummary fromZ(com.billbull.backend.pos.dayclose.PosDayClose d) {
        PosReportSummary r = new PosReportSummary();
        r.id = d.getId();
        r.reportNumber = d.getReportNumber();
        r.reportType = "Z";
        r.businessDate = d.getCloseDate();
        r.branchId = d.getBranchId();
        r.branchName = d.getBranchName();
        r.terminalId = null;
        r.counterName = null;
        r.cashierName = null;
        r.generatedBy = d.getClosedBy();
        r.generatedAt = d.getClosedAt();
        r.status = "COMPLETED";
        return r;
    }

    public Long getId() { return id; }
    public String getReportNumber() { return reportNumber; }
    public String getReportType() { return reportType; }
    public LocalDate getBusinessDate() { return businessDate; }
    public Long getBranchId() { return branchId; }
    public String getBranchName() { return branchName; }
    public String getTerminalId() { return terminalId; }
    public String getCounterName() { return counterName; }
    public String getCashierName() { return cashierName; }
    public String getGeneratedBy() { return generatedBy; }
    public LocalDateTime getGeneratedAt() { return generatedAt; }
    public String getStatus() { return status; }
}
