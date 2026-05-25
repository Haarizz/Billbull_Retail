package com.billbull.backend.inventory.reports;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class InventoryReportDataResponse {

    private String reportId;
    private String title;
    private String subtitle;
    private LocalDateTime generatedAt = LocalDateTime.now();
    private List<Map<String, Object>> cards = new ArrayList<>();
    private List<Map<String, Object>> charts = new ArrayList<>();
    private List<Map<String, Object>> columns = new ArrayList<>();
    private List<Map<String, Object>> rows = new ArrayList<>();

    public String getReportId() {
        return reportId;
    }

    public void setReportId(String reportId) {
        this.reportId = reportId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSubtitle() {
        return subtitle;
    }

    public void setSubtitle(String subtitle) {
        this.subtitle = subtitle;
    }

    public LocalDateTime getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(LocalDateTime generatedAt) {
        this.generatedAt = generatedAt;
    }

    public List<Map<String, Object>> getCards() {
        return cards;
    }

    public void setCards(List<Map<String, Object>> cards) {
        this.cards = cards;
    }

    public List<Map<String, Object>> getCharts() {
        return charts;
    }

    public void setCharts(List<Map<String, Object>> charts) {
        this.charts = charts;
    }

    public List<Map<String, Object>> getColumns() {
        return columns;
    }

    public void setColumns(List<Map<String, Object>> columns) {
        this.columns = columns;
    }

    public List<Map<String, Object>> getRows() {
        return rows;
    }

    public void setRows(List<Map<String, Object>> rows) {
        this.rows = rows;
    }
}
