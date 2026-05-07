package com.billbull.backend.inventory.batch;

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
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "batch_print_queue",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_batch_print_queue_batch", columnNames = "batch_master_id")
        },
        indexes = {
                @Index(name = "idx_batch_print_queue_status", columnList = "status"),
                @Index(name = "idx_batch_print_queue_source", columnList = "source_type, source_ref_no")
        })
public class BatchPrintQueue extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_master_id", nullable = false)
    private BatchMaster batch;

    @Column(name = "batch_number", nullable = false, length = 120)
    private String batchNumber;

    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType;

    @Column(name = "source_ref_no", nullable = false, length = 100)
    private String sourceRefNo;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "product_code", nullable = false, length = 80)
    private String productCode;

    @Column(name = "product_name", length = 200)
    private String productName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BatchPrintQueueStatus status = BatchPrintQueueStatus.PENDING;

    @Column(name = "queued_at", nullable = false)
    private LocalDateTime queuedAt = LocalDateTime.now();

    @Column(name = "printed_at")
    private LocalDateTime printedAt;

    public BatchMaster getBatch() {
        return batch;
    }

    public void setBatch(BatchMaster batch) {
        this.batch = batch;
    }

    public String getBatchNumber() {
        return batchNumber;
    }

    public void setBatchNumber(String batchNumber) {
        this.batchNumber = batchNumber;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getSourceRefNo() {
        return sourceRefNo;
    }

    public void setSourceRefNo(String sourceRefNo) {
        this.sourceRefNo = sourceRefNo;
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

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public BatchPrintQueueStatus getStatus() {
        return status;
    }

    public void setStatus(BatchPrintQueueStatus status) {
        this.status = status;
    }

    public LocalDateTime getQueuedAt() {
        return queuedAt;
    }

    public void setQueuedAt(LocalDateTime queuedAt) {
        this.queuedAt = queuedAt;
    }

    public LocalDateTime getPrintedAt() {
        return printedAt;
    }

    public void setPrintedAt(LocalDateTime printedAt) {
        this.printedAt = printedAt;
    }
}
