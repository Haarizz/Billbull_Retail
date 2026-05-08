package com.billbull.backend.inventory.batch;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(
        name = "batch_allocation",
        indexes = {
                @Index(name = "idx_batch_allocation_source_line", columnList = "source_document_type, source_document_id, source_line_id, status"),
                @Index(name = "idx_batch_allocation_batch", columnList = "batch_master_id, status"),
                @Index(name = "idx_batch_allocation_product_location", columnList = "product_code, bin_code, status")
        })
public class BatchAllocation extends BaseEntity {

    @Column(name = "source_document_type", nullable = false, length = 40)
    private String sourceDocumentType;

    @Column(name = "source_document_id", nullable = false)
    private Long sourceDocumentId;

    @Column(name = "source_line_id", nullable = false)
    private Long sourceLineId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "product_code", nullable = false, length = 80)
    private String productCode;

    @Column(name = "bin_id")
    private Long binId;

    @Column(name = "bin_code", length = 50)
    private String binCode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_master_id", nullable = false)
    private BatchMaster batchMaster;

    @Column(name = "batch_number", nullable = false, length = 120)
    private String batchNumber;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(nullable = false)
    private Integer quantity = 1;

    @Enumerated(EnumType.STRING)
    @Column(name = "allocation_method", nullable = false, length = 20)
    private BatchAllocationMethod allocationMethod;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BatchAllocationStatus status = BatchAllocationStatus.RESERVED;

    @Column(name = "selected_by", length = 120)
    private String selectedBy;

    @Column(name = "selected_at", nullable = false)
    private LocalDateTime selectedAt;

    @Column(name = "depleted_by_document_type", length = 40)
    private String depletedByDocumentType;

    @Column(name = "depleted_by_document_id")
    private Long depletedByDocumentId;

    @Column(name = "depleted_by_line_id")
    private Long depletedByLineId;

    @Column(name = "depleted_at")
    private LocalDateTime depletedAt;

    public String getSourceDocumentType() {
        return sourceDocumentType;
    }

    public void setSourceDocumentType(String sourceDocumentType) {
        this.sourceDocumentType = sourceDocumentType;
    }

    public Long getSourceDocumentId() {
        return sourceDocumentId;
    }

    public void setSourceDocumentId(Long sourceDocumentId) {
        this.sourceDocumentId = sourceDocumentId;
    }

    public Long getSourceLineId() {
        return sourceLineId;
    }

    public void setSourceLineId(Long sourceLineId) {
        this.sourceLineId = sourceLineId;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public String getProductCode() {
        return productCode;
    }

    public void setProductCode(String productCode) {
        this.productCode = productCode;
    }

    public Long getBinId() {
        return binId;
    }

    public void setBinId(Long binId) {
        this.binId = binId;
    }

    public String getBinCode() {
        return binCode;
    }

    public void setBinCode(String binCode) {
        this.binCode = binCode;
    }

    public BatchMaster getBatchMaster() {
        return batchMaster;
    }

    public void setBatchMaster(BatchMaster batchMaster) {
        this.batchMaster = batchMaster;
    }

    public String getBatchNumber() {
        return batchNumber;
    }

    public void setBatchNumber(String batchNumber) {
        this.batchNumber = batchNumber;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(LocalDate expiryDate) {
        this.expiryDate = expiryDate;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BatchAllocationMethod getAllocationMethod() {
        return allocationMethod;
    }

    public void setAllocationMethod(BatchAllocationMethod allocationMethod) {
        this.allocationMethod = allocationMethod;
    }

    public BatchAllocationStatus getStatus() {
        return status;
    }

    public void setStatus(BatchAllocationStatus status) {
        this.status = status;
    }

    public String getSelectedBy() {
        return selectedBy;
    }

    public void setSelectedBy(String selectedBy) {
        this.selectedBy = selectedBy;
    }

    public LocalDateTime getSelectedAt() {
        return selectedAt;
    }

    public void setSelectedAt(LocalDateTime selectedAt) {
        this.selectedAt = selectedAt;
    }

    public String getDepletedByDocumentType() {
        return depletedByDocumentType;
    }

    public void setDepletedByDocumentType(String depletedByDocumentType) {
        this.depletedByDocumentType = depletedByDocumentType;
    }

    public Long getDepletedByDocumentId() {
        return depletedByDocumentId;
    }

    public void setDepletedByDocumentId(Long depletedByDocumentId) {
        this.depletedByDocumentId = depletedByDocumentId;
    }

    public Long getDepletedByLineId() {
        return depletedByLineId;
    }

    public void setDepletedByLineId(Long depletedByLineId) {
        this.depletedByLineId = depletedByLineId;
    }

    public LocalDateTime getDepletedAt() {
        return depletedAt;
    }

    public void setDepletedAt(LocalDateTime depletedAt) {
        this.depletedAt = depletedAt;
    }
}
