package com.billbull.backend.inventory.serial;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "serial_master",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_serial_master_serial_number", columnNames = "serial_number")
        },
        indexes = {
                @Index(name = "idx_serial_master_product", columnList = "product_id"),
                @Index(name = "idx_serial_master_location", columnList = "warehouse_id, bin_id"),
                @Index(name = "idx_serial_master_source", columnList = "source_document_type, source_document_id")
        })
public class SerialMaster extends BaseEntity {

    @Column(name = "serial_number", nullable = false, length = 120)
    private String serialNumber;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "product_code", nullable = false, length = 80)
    private String productCode;

    @Column(name = "product_name", length = 200)
    private String productName;

    @Column(name = "source_document_type", nullable = false, length = 40)
    private String sourceDocumentType;

    @Column(name = "source_document_id", nullable = false)
    private Long sourceDocumentId;

    @Column(name = "source_line_id", nullable = false)
    private Long sourceLineId;

    @Column(name = "source_ref_no", nullable = false, length = 100)
    private String sourceRefNo;

    @Column(name = "warehouse_id")
    private Long warehouseId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "locator_id")
    private Long locatorId;

    @Column(name = "bin_id")
    private Long binId;

    @Column(name = "unit_cost", precision = 19, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "manufacturing_date")
    private LocalDate manufacturingDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SerialStatus status = SerialStatus.AVAILABLE;

    public String getSerialNumber() {
        return serialNumber;
    }

    public void setSerialNumber(String serialNumber) {
        this.serialNumber = serialNumber;
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

    public String getSourceRefNo() {
        return sourceRefNo;
    }

    public void setSourceRefNo(String sourceRefNo) {
        this.sourceRefNo = sourceRefNo;
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

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }

    public LocalDate getManufacturingDate() {
        return manufacturingDate;
    }

    public void setManufacturingDate(LocalDate manufacturingDate) {
        this.manufacturingDate = manufacturingDate;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(LocalDate expiryDate) {
        this.expiryDate = expiryDate;
    }

    public SerialStatus getStatus() {
        return status;
    }

    public void setStatus(SerialStatus status) {
        this.status = status;
    }
}
