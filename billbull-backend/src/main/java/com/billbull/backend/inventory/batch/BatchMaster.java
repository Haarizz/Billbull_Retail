package com.billbull.backend.inventory.batch;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "batch_master",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_batch_master_batch_number", columnNames = "batch_number"),
                @UniqueConstraint(
                        name = "uk_batch_master_source_line_unit",
                        columnNames = { "source_document_type", "source_document_id", "source_line_id", "unit_index" })
        },
        indexes = {
                @Index(name = "idx_batch_master_source", columnList = "source_type, source_ref_no"),
                @Index(name = "idx_batch_master_doc", columnList = "source_document_type, source_document_id"),
                @Index(name = "idx_batch_master_product", columnList = "product_id"),
                @Index(name = "idx_batch_master_location", columnList = "warehouse_id, bin_id"),
                @Index(name = "idx_batch_master_selection", columnList = "product_code, bin_id, status, expiry_date")
        })
public class BatchMaster extends BaseEntity {

    @Column(name = "batch_number", nullable = false, length = 120)
    private String batchNumber;

    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType;

    @Column(name = "source_ref_no", nullable = false, length = 100)
    private String sourceRefNo;

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

    @Column(name = "product_name", length = 200)
    private String productName;

    @Column(name = "warehouse_id")
    private Long warehouseId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "locator_id")
    private Long locatorId;

    @Column(name = "bin_id")
    private Long binId;

    @Column(name = "unit_index", nullable = false)
    private Integer unitIndex;

    @Column(name = "qty_unit_no")
    private Integer qtyUnitNo;

    @Column(nullable = false)
    private Integer quantity = 1;

    @Column(name = "generated_date", nullable = false)
    private LocalDate generatedDate;

    @Column(name = "manufacturing_date")
    private LocalDate manufacturingDate;

    @Column(name = "entry_date")
    private LocalDate entryDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "unit_cost", precision = 19, scale = 4)
    private BigDecimal unitCost;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BatchStatus status = BatchStatus.AVAILABLE;

    @Column(nullable = false)
    private boolean printed = false;

    @PrePersist
    @PreUpdate
    private void applyDefaults() {
        if (status == null) {
            status = BatchStatus.AVAILABLE;
        }
        if (quantity == null) {
            quantity = 1;
        }
        if (qtyUnitNo == null) {
            qtyUnitNo = unitIndex;
        }
        if (unitIndex == null) {
            unitIndex = qtyUnitNo;
        }
        if (entryDate == null) {
            entryDate = generatedDate != null ? generatedDate : LocalDate.now();
        }
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

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public Long getWarehouseId() {
        return warehouseId;
    }

    public void setWarehouseId(Long warehouseId) {
        this.warehouseId = warehouseId;
    }

    public Long getZoneId() {
        return zoneId;
    }

    public void setZoneId(Long zoneId) {
        this.zoneId = zoneId;
    }

    public Long getLocatorId() {
        return locatorId;
    }

    public void setLocatorId(Long locatorId) {
        this.locatorId = locatorId;
    }

    public Long getBinId() {
        return binId;
    }

    public void setBinId(Long binId) {
        this.binId = binId;
    }

    public Integer getUnitIndex() {
        return unitIndex;
    }

    public void setUnitIndex(Integer unitIndex) {
        this.unitIndex = unitIndex;
        if (this.qtyUnitNo == null) {
            this.qtyUnitNo = unitIndex;
        }
    }

    public Integer getQtyUnitNo() {
        return qtyUnitNo;
    }

    public void setQtyUnitNo(Integer qtyUnitNo) {
        this.qtyUnitNo = qtyUnitNo;
        if (this.unitIndex == null) {
            this.unitIndex = qtyUnitNo;
        }
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public LocalDate getGeneratedDate() {
        return generatedDate;
    }

    public void setGeneratedDate(LocalDate generatedDate) {
        this.generatedDate = generatedDate;
        if (this.entryDate == null) {
            this.entryDate = generatedDate;
        }
    }

    public LocalDate getManufacturingDate() {
        return manufacturingDate;
    }

    public void setManufacturingDate(LocalDate manufacturingDate) {
        this.manufacturingDate = manufacturingDate;
    }

    public LocalDate getEntryDate() {
        return entryDate;
    }

    public void setEntryDate(LocalDate entryDate) {
        this.entryDate = entryDate;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(LocalDate expiryDate) {
        this.expiryDate = expiryDate;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }

    public BatchStatus getStatus() {
        return status;
    }

    public void setStatus(BatchStatus status) {
        this.status = status;
    }

    public boolean isPrinted() {
        return printed;
    }

    public void setPrinted(boolean printed) {
        this.printed = printed;
    }
}
