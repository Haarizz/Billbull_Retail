package com.billbull.backend.inventory.serial;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Registry of individual serial numbers for serialized products (Product.isSerial == true).
 *
 * Lifecycle: AVAILABLE → RESERVED (layaway) → SOLD (POS checkout / invoice)
 *            SOLD → RETURNED → AVAILABLE (after quality check) or DEFECTIVE.
 *
 * serial_number is globally unique per product — enforced by the DB unique index.
 */
@Entity
@Table(name = "serial_master", indexes = {
        @Index(name = "idx_sm_serial_number", columnList = "serial_number", unique = true),
        @Index(name = "idx_sm_product_code",  columnList = "product_code"),
        @Index(name = "idx_sm_status",        columnList = "status"),
        @Index(name = "idx_sm_branch",        columnList = "branch_code"),
})
public class SerialMaster extends BaseEntity {

    @Column(name = "serial_number", nullable = false, length = 120, unique = true)
    private String serialNumber;

    @Column(name = "product_code", nullable = false, length = 80)
    private String productCode;

    @Column(name = "product_id")
    private Long productId;

    @Column(name = "product_name", length = 255)
    private String productName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SerialStatus status = SerialStatus.AVAILABLE;

    @Column(name = "warehouse_code", length = 50)
    private String warehouseCode;

    @Column(name = "branch_code", length = 50)
    private String branchCode;

    /** GRN / LPO / purchase receipt that introduced this unit into stock. */
    @Column(name = "purchase_reference", length = 100)
    private String purchaseReference;

    @Column(name = "source_document_type", length = 50)
    private String sourceDocumentType;

    @Column(name = "source_document_id")
    private Long sourceDocumentId;

    @Column(name = "source_line_id")
    private Long sourceLineId;

    @Column(name = "source_ref_no", length = 100)
    private String sourceRefNo;

    @Column(name = "warehouse_id")
    private Long warehouseId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "locator_id")
    private Long locatorId;

    @Column(name = "bin_id")
    private Long binId;

    @Column(name = "unit_cost", precision = 15, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "manufacturing_date")
    private LocalDate manufacturingDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "sold_invoice_id")
    private Long soldInvoiceId;

    @Column(name = "sold_invoice_number", length = 60)
    private String soldInvoiceNumber;

    @Column(name = "sold_at")
    private LocalDateTime soldAt;

    @Column(name = "returned_at")
    private LocalDateTime returnedAt;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    // ── getters/setters ──────────────────────────────────────────────────────

    public String getSerialNumber() { return serialNumber; }
    public void setSerialNumber(String serialNumber) { this.serialNumber = serialNumber; }

    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public SerialStatus getStatus() { return status; }
    public void setStatus(SerialStatus status) { this.status = status; }

    public String getWarehouseCode() { return warehouseCode; }
    public void setWarehouseCode(String warehouseCode) { this.warehouseCode = warehouseCode; }

    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }

    public String getPurchaseReference() { return purchaseReference; }
    public void setPurchaseReference(String purchaseReference) { this.purchaseReference = purchaseReference; }

    public String getSourceDocumentType() { return sourceDocumentType; }
    public void setSourceDocumentType(String sourceDocumentType) { this.sourceDocumentType = sourceDocumentType; }

    public Long getSourceDocumentId() { return sourceDocumentId; }
    public void setSourceDocumentId(Long sourceDocumentId) { this.sourceDocumentId = sourceDocumentId; }

    public Long getSourceLineId() { return sourceLineId; }
    public void setSourceLineId(Long sourceLineId) { this.sourceLineId = sourceLineId; }

    public String getSourceRefNo() { return sourceRefNo; }
    public void setSourceRefNo(String sourceRefNo) { this.sourceRefNo = sourceRefNo; }

    public Long getWarehouseId() { return warehouseId; }
    public void setWarehouseId(Long warehouseId) { this.warehouseId = warehouseId; }

    public Long getZoneId() { return zoneId; }
    public void setZoneId(Long zoneId) { this.zoneId = zoneId; }

    public Long getLocatorId() { return locatorId; }
    public void setLocatorId(Long locatorId) { this.locatorId = locatorId; }

    public Long getBinId() { return binId; }
    public void setBinId(Long binId) { this.binId = binId; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public LocalDate getManufacturingDate() { return manufacturingDate; }
    public void setManufacturingDate(LocalDate manufacturingDate) { this.manufacturingDate = manufacturingDate; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public Long getSoldInvoiceId() { return soldInvoiceId; }
    public void setSoldInvoiceId(Long soldInvoiceId) { this.soldInvoiceId = soldInvoiceId; }

    public String getSoldInvoiceNumber() { return soldInvoiceNumber; }
    public void setSoldInvoiceNumber(String soldInvoiceNumber) { this.soldInvoiceNumber = soldInvoiceNumber; }

    public LocalDateTime getSoldAt() { return soldAt; }
    public void setSoldAt(LocalDateTime soldAt) { this.soldAt = soldAt; }

    public LocalDateTime getReturnedAt() { return returnedAt; }
    public void setReturnedAt(LocalDateTime returnedAt) { this.returnedAt = returnedAt; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
