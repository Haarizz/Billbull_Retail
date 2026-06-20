package com.billbull.backend.pos.layaway;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

/**
 * A single reserved line on a {@link PosLayaway}. Mirrors the shape consumed by
 * PosCheckoutRequest.PosCheckoutItem so conversion to a real POS sale maps 1:1.
 */
@Entity
@Table(name = "pos_layaway_items")
public class PosLayawayItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String itemCode;
    private String itemName;
    private String unit;
    private Integer quantity;
    private Double price;
    private Double discount;
    private Double taxRate;

    /**
     * For batch/serial-controlled items, the specific batch number reserved for
     * this line at scan time. Null for normal products (reserved only at conversion).
     */
    @Column(name = "pinned_batch_number")
    private String pinnedBatchNumber;

    /** True when the product is batch-controlled — drives scan-time reservation. */
    @Column(name = "batch_controlled")
    private Boolean batchControlled = Boolean.FALSE;

    /** True when this line was voided in the cart before the layaway was saved. */
    @Column(name = "voided")
    private Boolean voided = Boolean.FALSE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_layaway_id")
    @JsonBackReference
    private PosLayaway posLayaway;

    // Getters & Setters

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getItemCode() { return itemCode; }
    public void setItemCode(String itemCode) { this.itemCode = itemCode; }

    public String getItemName() { return itemName; }
    public void setItemName(String itemName) { this.itemName = itemName; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public Double getPrice() { return price; }
    public void setPrice(Double price) { this.price = price; }

    public Double getDiscount() { return discount; }
    public void setDiscount(Double discount) { this.discount = discount; }

    public Double getTaxRate() { return taxRate; }
    public void setTaxRate(Double taxRate) { this.taxRate = taxRate; }

    public String getPinnedBatchNumber() { return pinnedBatchNumber; }
    public void setPinnedBatchNumber(String pinnedBatchNumber) { this.pinnedBatchNumber = pinnedBatchNumber; }

    public Boolean getBatchControlled() { return batchControlled != null ? batchControlled : Boolean.FALSE; }
    public void setBatchControlled(Boolean batchControlled) {
        this.batchControlled = batchControlled != null ? batchControlled : Boolean.FALSE;
    }

    public boolean isBatchControlled() { return Boolean.TRUE.equals(batchControlled); }

    public Boolean getVoided() { return voided != null ? voided : Boolean.FALSE; }
    public void setVoided(Boolean voided) { this.voided = voided != null ? voided : Boolean.FALSE; }
    public boolean isVoided() { return Boolean.TRUE.equals(voided); }

    public PosLayaway getPosLayaway() { return posLayaway; }
    public void setPosLayaway(PosLayaway posLayaway) { this.posLayaway = posLayaway; }
}
