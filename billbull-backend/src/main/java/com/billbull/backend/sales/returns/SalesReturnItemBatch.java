package com.billbull.backend.sales.returns;

import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonBackReference;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "sales_return_item_batches")
public class SalesReturnItemBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "original_allocation_id")
    private Long originalAllocationId;

    @Column(name = "batch_master_id")
    private Long batchMasterId;

    @Column(name = "batch_number", length = 120)
    private String batchNumber;

    @Column(name = "bin_code", length = 50)
    private String binCode;

    @Column(nullable = false)
    private Integer quantity;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_return_item_id")
    @JsonBackReference
    private SalesReturnItem salesReturnItem;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getOriginalAllocationId() { return originalAllocationId; }
    public void setOriginalAllocationId(Long originalAllocationId) { this.originalAllocationId = originalAllocationId; }

    public Long getBatchMasterId() { return batchMasterId; }
    public void setBatchMasterId(Long batchMasterId) { this.batchMasterId = batchMasterId; }

    public String getBatchNumber() { return batchNumber; }
    public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }

    public String getBinCode() { return binCode; }
    public void setBinCode(String binCode) { this.binCode = binCode; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public SalesReturnItem getSalesReturnItem() { return salesReturnItem; }
    public void setSalesReturnItem(SalesReturnItem salesReturnItem) { this.salesReturnItem = salesReturnItem; }
}
