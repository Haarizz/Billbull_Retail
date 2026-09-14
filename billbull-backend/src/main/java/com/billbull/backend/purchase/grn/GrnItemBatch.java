package com.billbull.backend.purchase.grn;

import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A batch/expiry lot captured on a GRN line, mirroring {@link GrnItemSerial} for serialised
 * products.
 *
 * A GRN captures lots at receiving time but only creates inventory identity at post time, so the
 * captured plan has to survive on the document in between. The per-unit {@code BatchMaster} rows
 * (and the stock movements that reference them) are still the source of truth for on-hand stock.
 */
@Entity
@Table(name = "grn_item_batches", indexes = {
        @Index(name = "idx_grn_item_batch_grn_item", columnList = "grn_item_id"),
        @Index(name = "idx_grn_item_batch_expiry", columnList = "expiry_date")
})
public class GrnItemBatch extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "grn_item_id", nullable = false)
    private GrnItemEntity grnItem;

    /** Optional supplier/user-supplied lot prefix; null means "generate the standard identity". */
    @Column(name = "batch_number", length = 120)
    private String batchNumber;

    @Column(name = "manufacturing_date")
    private LocalDate manufacturingDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(nullable = false)
    private Integer quantity = 0;

    public GrnItemEntity getGrnItem() {
        return grnItem;
    }

    public void setGrnItem(GrnItemEntity grnItem) {
        this.grnItem = grnItem;
    }

    public String getBatchNumber() {
        return batchNumber;
    }

    public void setBatchNumber(String batchNumber) {
        this.batchNumber = batchNumber;
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

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }
}
