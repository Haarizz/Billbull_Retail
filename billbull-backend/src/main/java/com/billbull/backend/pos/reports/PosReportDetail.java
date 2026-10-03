package com.billbull.backend.pos.reports;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
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
    /** Z only: the returns-aware reporting figures as PERSISTED on the Day Close row, or null
     *  for a historical snapshot written before they existed. Never reconstructed and never
     *  back-filled from the stored gross_sales / net_sales, whose meanings predate the reporting
     *  basis — see PosDayClose. A client that wants the authoritative Net Sales for a day reads
     *  this when present and falls back to the stored report JSON when it is null, which is also
     *  the signal that it is looking at a snapshot taken under the old reporting definition. */
    private Map<String, Object> persistedReporting;

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
        d.persistedReporting = persistedReporting(z);
        return d;
    }

    /** The persisted reporting block, or null when this row predates it. Preferred over the
     *  stored report JSON for a new snapshot; a null is left as a null so the caller can tell a
     *  historical snapshot apart from a day that genuinely reported zero. */
    private static Map<String, Object> persistedReporting(com.billbull.backend.pos.dayclose.PosDayClose z) {
        if (!z.hasReportingSnapshot()) {
            return null;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("netSalesBasis", z.getReportingNetSalesBasis());
        m.put("reportingGrossSales", z.getReportingGrossSales());
        m.put("reportingReturnValue", z.getReportingReturnValue());
        m.put("reportingNetSales", z.getReportingNetSales());
        m.put("reportingSalesTax", z.getReportingSalesTax());
        m.put("reportingReturnTax", z.getReportingReturnTax());
        m.put("reportingNetTax", z.getReportingNetTax());
        m.put("reportingNetSalesExTax", z.getReportingNetSalesExTax());
        return m;
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
    public Map<String, Object> getPersistedReporting() { return persistedReporting; }
}
