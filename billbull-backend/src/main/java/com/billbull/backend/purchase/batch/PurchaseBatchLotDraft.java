package com.billbull.backend.purchase.batch;

import java.time.LocalDate;

/**
 * One captured batch/lot on a purchase document line: "N units of this product share this
 * batch number and this expiry date".
 *
 * This is the *capture* shape, not the storage shape. Inventory identity itself stays per-unit
 * in {@link com.billbull.backend.inventory.batch.BatchMaster} (quantity = 1 per row), exactly as
 * stock-taking stores it; a lot of N units becomes N BatchMaster rows sharing a lot prefix and
 * this expiry date. Shared by GRN and Purchase Invoice so both documents capture lots identically.
 */
public class PurchaseBatchLotDraft {

    private Long id;

    /**
     * Optional user/supplier-supplied lot prefix. Blank means "generate one", which yields the
     * standard {ID}-{ddMMyy}-L{NN}-{itemCode}-{unitIndex} identity used everywhere else.
     */
    private String batchNumber;

    private LocalDate manufacturingDate;
    private LocalDate expiryDate;

    /** Number of base units received under this lot. */
    private Integer quantity;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
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
