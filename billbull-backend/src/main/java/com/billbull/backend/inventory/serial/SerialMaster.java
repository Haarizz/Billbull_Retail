package com.billbull.backend.inventory.serial;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
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
