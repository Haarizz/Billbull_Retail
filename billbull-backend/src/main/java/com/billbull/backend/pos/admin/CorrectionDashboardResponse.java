package com.billbull.backend.pos.admin;

import java.util.List;
import java.util.Map;

/** Enterprise Console &gt; POS Administration &gt; Dashboard — aggregate counts only, computed
 *  entirely via SQL-side GROUP BY (see {@link CorrectionRequestRepository}), never by loading
 *  and counting rows in memory. */
public class CorrectionDashboardResponse {

    public record NamedCount(String name, long count) {}

    private Map<String, Long> statusCounts;
    private Map<String, Long> correctionTypeCounts;
    private long todayCount;
    private long thisMonthCount;
    private long activeCategoriesCount;
    private List<NamedCount> topRequesters;
    private List<NamedCount> topBranches;

    public Map<String, Long> getStatusCounts() { return statusCounts; }
    public void setStatusCounts(Map<String, Long> statusCounts) { this.statusCounts = statusCounts; }
    public Map<String, Long> getCorrectionTypeCounts() { return correctionTypeCounts; }
    public void setCorrectionTypeCounts(Map<String, Long> correctionTypeCounts) { this.correctionTypeCounts = correctionTypeCounts; }
    public long getTodayCount() { return todayCount; }
    public void setTodayCount(long todayCount) { this.todayCount = todayCount; }
    public long getThisMonthCount() { return thisMonthCount; }
    public void setThisMonthCount(long thisMonthCount) { this.thisMonthCount = thisMonthCount; }
    public long getActiveCategoriesCount() { return activeCategoriesCount; }
    public void setActiveCategoriesCount(long activeCategoriesCount) { this.activeCategoriesCount = activeCategoriesCount; }
    public List<NamedCount> getTopRequesters() { return topRequesters; }
    public void setTopRequesters(List<NamedCount> topRequesters) { this.topRequesters = topRequesters; }
    public List<NamedCount> getTopBranches() { return topBranches; }
    public void setTopBranches(List<NamedCount> topBranches) { this.topBranches = topBranches; }
}
