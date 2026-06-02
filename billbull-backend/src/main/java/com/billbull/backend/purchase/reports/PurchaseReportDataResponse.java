package com.billbull.backend.purchase.reports;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class PurchaseReportDataResponse {

    private String reportId;
    private String generatedAt;
    private List<Map<String, Object>> rows = new ArrayList<>();
    private List<Map<String, Object>> charts = new ArrayList<>();

    public String getReportId() {
        return reportId;
    }

    public void setReportId(String reportId) {
        this.reportId = reportId;
    }

    public String getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(String generatedAt) {
        this.generatedAt = generatedAt;
    }

    public List<Map<String, Object>> getRows() {
        return rows;
    }

    public void setRows(List<Map<String, Object>> rows) {
        this.rows = rows;
    }

    public List<Map<String, Object>> getCharts() {
        return charts;
    }

    public void setCharts(List<Map<String, Object>> charts) {
        this.charts = charts;
    }
}
