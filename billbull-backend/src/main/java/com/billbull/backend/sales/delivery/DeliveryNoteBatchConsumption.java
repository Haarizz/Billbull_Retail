package com.billbull.backend.sales.delivery;

import jakarta.persistence.*;
import java.math.BigDecimal;

/**
 * Records the exact batch-level cost consumed at DeliveryNote delivery time.
 * One row per DN line × batch. Used by SalesReturnService to reverse COGS at
 * the original cost (not current WAC) when a return is processed.
 */
@Entity
@Table(
    name = "delivery_note_batch_consumptions",
    indexes = {
        @Index(name = "idx_dnbc_dn_item",    columnList = "delivery_note_item_id"),
        @Index(name = "idx_dnbc_item_code",  columnList = "item_code"),
        @Index(name = "idx_dnbc_dn_id",      columnList = "delivery_note_id")
    }
)
public class DeliveryNoteBatchConsumption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "delivery_note_id", nullable = false)
    private Long deliveryNoteId;

    @Column(name = "delivery_note_item_id", nullable = false)
    private Long deliveryNoteItemId;

    @Column(name = "item_code", nullable = false)
    private String itemCode;

    private String batchNumber;

    @Column(nullable = false)
    private Integer quantity;

    /** Unit cost at the time of delivery (WAC or batch-specific). */
    @Column(nullable = false, precision = 15, scale = 4)
    private BigDecimal unitCost;

    @Column(nullable = false, precision = 15, scale = 4)
    private BigDecimal totalCost;

    public DeliveryNoteBatchConsumption() {}

    public Long getId() { return id; }

    public Long getDeliveryNoteId() { return deliveryNoteId; }
    public void setDeliveryNoteId(Long deliveryNoteId) { this.deliveryNoteId = deliveryNoteId; }

    public Long getDeliveryNoteItemId() { return deliveryNoteItemId; }
    public void setDeliveryNoteItemId(Long deliveryNoteItemId) { this.deliveryNoteItemId = deliveryNoteItemId; }

    public String getItemCode() { return itemCode; }
    public void setItemCode(String itemCode) { this.itemCode = itemCode; }

    public String getBatchNumber() { return batchNumber; }
    public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public BigDecimal getTotalCost() { return totalCost; }
    public void setTotalCost(BigDecimal totalCost) { this.totalCost = totalCost; }
}
