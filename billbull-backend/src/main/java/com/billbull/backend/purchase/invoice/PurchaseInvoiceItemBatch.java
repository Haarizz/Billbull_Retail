package com.billbull.backend.purchase.invoice;

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
 * A batch/expiry lot captured on a purchase invoice line, mirroring
 * {@link PurchaseInvoiceItemSerial} for serialised products.
 *
 * This is the captured intent, kept on the document so a draft round-trips and so regeneration of
 * the per-unit rows never loses the expiry. The inventory identity itself lives in
 * {@code BatchMaster} (one row per unit) — this table never becomes a second source of truth for
 * on-hand stock.
 */
@Entity
@Table(name = "purchase_invoice_item_batches", indexes = {
        @Index(name = "idx_pi_item_batch_invoice_item", columnList = "invoice_item_id"),
        @Index(name = "idx_pi_item_batch_expiry", columnList = "expiry_date")
})
public class PurchaseInvoiceItemBatch extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_item_id", nullable = false)
    private PurchaseInvoiceItem invoiceItem;

    /** Optional supplier/user-supplied lot prefix; null means "generate the standard identity". */
    @Column(name = "batch_number", length = 120)
    private String batchNumber;

    @Column(name = "manufacturing_date")
    private LocalDate manufacturingDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(nullable = false)
    private Integer quantity = 0;

    public PurchaseInvoiceItem getInvoiceItem() {
        return invoiceItem;
    }

    public void setInvoiceItem(PurchaseInvoiceItem invoiceItem) {
        this.invoiceItem = invoiceItem;
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
