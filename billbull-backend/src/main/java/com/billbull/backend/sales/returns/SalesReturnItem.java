package com.billbull.backend.sales.returns;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

@Entity
@Table(name = "sales_return_items")
public class SalesReturnItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String itemCode;
    private String itemName;
    private String unit;
    private Integer soldQty;
    private Integer returnQty;

    @Column(precision = 15, scale = 2)
    private BigDecimal price;
    /** Discount PERCENTAGE rate carried over from the original invoice line (not money). */
    private Double discountPercent;
    /** Discount amount prorated to returnQty/soldQty from the original invoice line. */
    @Column(precision = 15, scale = 2)
    private BigDecimal discountAmount;
    /** Tax PERCENTAGE rate (not money). */
    private Double taxRate;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal total;
    private String itemStatus; // Good (Restock), Damaged (Scrap)

    /**
     * Structured per-line condition (§12). Authoritative for new returns; the service keeps
     * the legacy {@link #itemStatus} string in sync from it so the existing restock and COGS
     * branches in SalesReturnService continue to work untouched. Null on rows written before
     * this column existed — read those through
     * {@link SalesReturnCondition#fromLegacyItemStatus(String)}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "return_condition", length = 20)
    private SalesReturnCondition condition;

    /** Standardised return reason code (e.g. DEFECTIVE, WRONG_ITEM, CUSTOMER_CHANGED_MIND). */
    @Column(name = "return_reason", length = 100)
    private String returnReason;

    /** Free-text notes from the cashier / customer service agent explaining the return. */
    @Column(name = "return_reason_notes", columnDefinition = "TEXT")
    private String returnReasonNotes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_return_id")
    @JsonBackReference
    private SalesReturn salesReturn;

    // ARCHFIX §1.6: LAZY (was EAGER) with @BatchSize so a list of items loads their batches in a
    // few batched selects (not N) rather than an EAGER cartesian product across items × batches.
    @OneToMany(mappedBy = "salesReturnItem", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference
    @org.hibernate.annotations.BatchSize(size = 50)
    private List<SalesReturnItemBatch> batches = new ArrayList<>();

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getItemCode() {
        return itemCode;
    }

    public void setItemCode(String itemCode) {
        this.itemCode = itemCode;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public Integer getSoldQty() {
        return soldQty;
    }

    public void setSoldQty(Integer soldQty) {
        this.soldQty = soldQty;
    }

    public Integer getReturnQty() {
        return returnQty;
    }

    public void setReturnQty(Integer returnQty) {
        this.returnQty = returnQty;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public Double getDiscountPercent() {
        return discountPercent;
    }

    public void setDiscountPercent(Double discountPercent) {
        this.discountPercent = discountPercent;
    }

    public BigDecimal getDiscountAmount() {
        return discountAmount;
    }

    public void setDiscountAmount(BigDecimal discountAmount) {
        this.discountAmount = discountAmount;
    }

    public Double getTaxRate() {
        return taxRate;
    }

    public void setTaxRate(Double taxRate) {
        this.taxRate = taxRate;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public void setTotal(BigDecimal total) {
        this.total = total;
    }

    public String getItemStatus() {
        return itemStatus;
    }

    public void setItemStatus(String itemStatus) {
        this.itemStatus = itemStatus;
    }

    public SalesReturnCondition getCondition() {
        return condition;
    }

    public void setCondition(SalesReturnCondition condition) {
        this.condition = condition;
    }

    /**
     * Condition for display/reporting, falling back to the legacy itemStatus string for rows
     * written before the column existed. Serialized to the UI so the new screen can render a
     * historic return without a null condition chip.
     */
    @Transient
    public SalesReturnCondition getEffectiveCondition() {
        return condition != null ? condition : SalesReturnCondition.fromLegacyItemStatus(itemStatus);
    }

    public String getReturnReason() { return returnReason; }
    public void setReturnReason(String returnReason) { this.returnReason = returnReason; }

    public String getReturnReasonNotes() { return returnReasonNotes; }
    public void setReturnReasonNotes(String returnReasonNotes) { this.returnReasonNotes = returnReasonNotes; }

    public SalesReturn getSalesReturn() {
        return salesReturn;
    }

    public void setSalesReturn(SalesReturn salesReturn) {
        this.salesReturn = salesReturn;
    }

    public List<SalesReturnItemBatch> getBatches() {
        return batches;
    }

    public void setBatches(List<SalesReturnItemBatch> batches) {
        this.batches.clear();
        if (batches != null) {
            for (SalesReturnItemBatch b : batches) {
                b.setSalesReturnItem(this);
                this.batches.add(b);
            }
        }
    }
}
