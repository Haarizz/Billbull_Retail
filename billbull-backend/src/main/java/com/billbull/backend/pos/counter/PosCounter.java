package com.billbull.backend.pos.counter;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "pos_counters", indexes = {
    @Index(name = "idx_pos_counter_branch", columnList = "branch_id"),
    @Index(name = "idx_pos_counter_code_branch", columnList = "branch_id, counter_code", unique = true)
})
public class PosCounter extends BaseEntity {

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "branch_name", length = 100)
    private String branchName;

    @Column(name = "counter_code", nullable = false, length = 20)
    private String counterCode;

    @Column(name = "counter_name", nullable = false, length = 100)
    private String counterName;

    @Column(name = "description", length = 255)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosCounterStatus status = PosCounterStatus.ACTIVE;

    @Column(name = "default_cash_drawer", length = 100)
    private String defaultCashDrawer;

    @Column(name = "default_receipt_printer", length = 100)
    private String defaultReceiptPrinter;

    @Column(name = "display_order")
    private Integer displayOrder = 0;

    // Getters & Setters

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getCounterCode() { return counterCode; }
    public void setCounterCode(String counterCode) { this.counterCode = counterCode; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public PosCounterStatus getStatus() { return status; }
    public void setStatus(PosCounterStatus status) { this.status = status; }

    public String getDefaultCashDrawer() { return defaultCashDrawer; }
    public void setDefaultCashDrawer(String defaultCashDrawer) { this.defaultCashDrawer = defaultCashDrawer; }

    public String getDefaultReceiptPrinter() { return defaultReceiptPrinter; }
    public void setDefaultReceiptPrinter(String defaultReceiptPrinter) { this.defaultReceiptPrinter = defaultReceiptPrinter; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
}
