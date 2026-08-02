package com.billbull.backend.pos.admin;

import java.util.List;
import java.util.Map;

/** Enterprise Console &gt; POS Administration &gt; Analytics (Phase 5 §8) — reporting metrics
 *  only; nothing here feeds back into any financial calculation. */
public class CorrectionAnalyticsResponse {

    public record NamedCount(String name, long count) {}
    public record DateCount(String date, long count) {}

    private List<NamedCount> topBranches;
    private List<NamedCount> topRequesters;
    private Map<String, Long> correctionTypeCounts;

    private long appliedCount;
    private long failedCount;
    private long terminalCount;
    private double successRatePercent;
    private double failureRatePercent;

    private Double averageApprovalMinutes;
    private Double averageExecutionMinutes;

    private List<DateCount> correctionsByBusinessDate;
    private List<DateCount> correctionsByMonth;

    public List<NamedCount> getTopBranches() { return topBranches; }
    public void setTopBranches(List<NamedCount> topBranches) { this.topBranches = topBranches; }
    public List<NamedCount> getTopRequesters() { return topRequesters; }
    public void setTopRequesters(List<NamedCount> topRequesters) { this.topRequesters = topRequesters; }
    public Map<String, Long> getCorrectionTypeCounts() { return correctionTypeCounts; }
    public void setCorrectionTypeCounts(Map<String, Long> correctionTypeCounts) { this.correctionTypeCounts = correctionTypeCounts; }
    public long getAppliedCount() { return appliedCount; }
    public void setAppliedCount(long appliedCount) { this.appliedCount = appliedCount; }
    public long getFailedCount() { return failedCount; }
    public void setFailedCount(long failedCount) { this.failedCount = failedCount; }
    public long getTerminalCount() { return terminalCount; }
    public void setTerminalCount(long terminalCount) { this.terminalCount = terminalCount; }
    public double getSuccessRatePercent() { return successRatePercent; }
    public void setSuccessRatePercent(double successRatePercent) { this.successRatePercent = successRatePercent; }
    public double getFailureRatePercent() { return failureRatePercent; }
    public void setFailureRatePercent(double failureRatePercent) { this.failureRatePercent = failureRatePercent; }
    public Double getAverageApprovalMinutes() { return averageApprovalMinutes; }
    public void setAverageApprovalMinutes(Double averageApprovalMinutes) { this.averageApprovalMinutes = averageApprovalMinutes; }
    public Double getAverageExecutionMinutes() { return averageExecutionMinutes; }
    public void setAverageExecutionMinutes(Double averageExecutionMinutes) { this.averageExecutionMinutes = averageExecutionMinutes; }
    public List<DateCount> getCorrectionsByBusinessDate() { return correctionsByBusinessDate; }
    public void setCorrectionsByBusinessDate(List<DateCount> correctionsByBusinessDate) { this.correctionsByBusinessDate = correctionsByBusinessDate; }
    public List<DateCount> getCorrectionsByMonth() { return correctionsByMonth; }
    public void setCorrectionsByMonth(List<DateCount> correctionsByMonth) { this.correctionsByMonth = correctionsByMonth; }
}
