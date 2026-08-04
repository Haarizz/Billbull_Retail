package com.billbull.backend.pos.reports;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

/** Full detail response for {@code GET /api/pos/reports/x/{id}} / {@code /z/{id}} — the
 *  stored snapshot metadata plus the parsed, immutable report JSON exactly as generated. */
public class PosReportDetail {

    private Long id;
    private String reportNumber;
    private String reportType;
    private LocalDate businessDate;
    private Long branchId;
    private String branchName;
    private String terminalId;
    private String counterName;
    private String cashierName;
    private String generatedBy;
    private LocalDateTime generatedAt;
    private Map<String, Object> report;
    private boolean skipped;
    private String skipReason;

    public static PosReportDetail fromX(PosXReportSnapshot s, Map<String, Object> report) {
        PosReportDetail d = new PosReportDetail();
        d.id = s.getId();
        d.reportNumber = s.getReportNumber();
        d.reportType = "X";
        d.businessDate = s.getBusinessDate();
        d.branchId = s.getBranchId();
        d.branchName = s.getBranchName();
        d.terminalId = s.getTerminalId();
        d.counterName = s.getCounterName();
        d.cashierName = s.getCashierName();
        d.generatedBy = s.getGeneratedBy();
        d.generatedAt = s.getGeneratedAt();
        d.report = report;
        return d;
    }

    public static PosReportDetail fromZ(com.billbull.backend.pos.dayclose.PosDayClose z, Map<String, Object> report) {
        PosReportDetail d = new PosReportDetail();
        d.id = z.getId();
        d.reportNumber = z.getReportNumber();
        d.reportType = "Z";
        d.businessDate = z.getCloseDate();
        d.branchId = z.getBranchId();
        d.branchName = z.getBranchName();
        d.generatedBy = z.getClosedBy();
        d.generatedAt = z.getClosedAt();
        d.report = report;
        d.skipped = z.isSkipped();
        d.skipReason = z.getSkipReason();
        return d;
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
    public Map<String, Object> getReport() { return report; }
    public boolean isSkipped() { return skipped; }
    public String getSkipReason() { return skipReason; }
}
