package com.billbull.backend.pos.reports;

import jakarta.persistence.*;
import java.time.LocalDate;

/** Per (reportType, branchId, businessDate) running counter backing XR-/ZR- report numbers. */
@Entity
@Table(name = "pos_report_sequences", uniqueConstraints = {
        @UniqueConstraint(name = "uk_pos_report_sequence", columnNames = {"report_type", "branch_id", "business_date"})
})
public class PosReportSequence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "report_type", nullable = false, length = 10)
    private String reportType;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "business_date", nullable = false)
    private LocalDate businessDate;

    @Column(name = "last_number", nullable = false)
    private Long lastNumber = 0L;

    public PosReportSequence() {
    }

    public PosReportSequence(String reportType, Long branchId, LocalDate businessDate, Long lastNumber) {
        this.reportType = reportType;
        this.branchId = branchId;
        this.businessDate = businessDate;
        this.lastNumber = lastNumber;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getReportType() { return reportType; }
    public void setReportType(String reportType) { this.reportType = reportType; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public LocalDate getBusinessDate() { return businessDate; }
    public void setBusinessDate(LocalDate businessDate) { this.businessDate = businessDate; }

    public Long getLastNumber() { return lastNumber; }
    public void setLastNumber(Long lastNumber) { this.lastNumber = lastNumber; }
}
