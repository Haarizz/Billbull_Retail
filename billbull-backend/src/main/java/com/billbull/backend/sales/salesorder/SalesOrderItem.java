package com.billbull.backend.sales.salesorder;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.sales.delivery.DeliveryBatchSelectionResponse;

@Entity
@Table(name = "sales_order_items")
public class SalesOrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String itemCode;
    private String barcode;
    private String description;
    private String unit;
    private Integer quantity;

    private Double price;
    private Double cost;
    private Double discount;
    private Double taxRate;
    private Double taxAmount;
    private Double lineTotal;
    private Integer deliveredQuantity = 0;
    private Integer foc;
    private String focUnit;
    private String image;
    private Long binId;

    @Column(length = 500)
    private String remarks;

    @Transient
    private String binCode;

    /**
     * QA-001: not persisted — populated by SalesOrderService.hydrate from the
     * Product master so the frontend can short-circuit stock checks and the
     * "Stock & Incoming" side panel for SERVICE items.
     */
    @Transient
    private String productType;

    @Transient
    private Boolean batchControlled;

    @Transient
    private Boolean fefoEnabled;

    @Transient
    private Integer minExpiryDaysForSale;

    @Transient
    private Integer baseRequiredQuantity;

    @Transient
    private Integer batchSelectedQuantity;

    @Transient
    private String batchSelectionMode;

    @Transient
    private List<DeliveryBatchSelectionResponse> batchSelections = new ArrayList<>();

    @Transient
    private String brandName;
    @Transient
    private String detailedDesc;

    // ✅ LAZY + BACK REFERENCE
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_order_id")
    @JsonBackReference
    private SalesOrder salesOrder;

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

    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public Integer getDeliveredQuantity() {
        return deliveredQuantity;
    }

    public void setDeliveredQuantity(Integer deliveredQuantity) {
        this.deliveredQuantity = deliveredQuantity;
    }

    public Integer getRemainingQuantity() {
        int qty = this.quantity != null ? this.quantity : 0;
        int del = this.deliveredQuantity != null ? this.deliveredQuantity : 0;
        return Math.max(0, qty - del);
    }

    public Double getPrice() {
        return price;
    }

    public void setPrice(Double price) {
        this.price = price;
    }

    public Double getCost() {
        return cost;
    }

    public void setCost(Double cost) {
        this.cost = cost;
    }

    public Double getDiscount() {
        return discount;
    }

    public void setDiscount(Double discount) {
        this.discount = discount;
    }

    public Double getTaxRate() {
        return taxRate;
    }

    public void setTaxRate(Double taxRate) {
        this.taxRate = taxRate;
    }

    public Double getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(Double taxAmount) {
        this.taxAmount = taxAmount;
    }

    public Double getLineTotal() {
        return lineTotal;
    }

    public void setLineTotal(Double lineTotal) {
        this.lineTotal = lineTotal;
    }

    public SalesOrder getSalesOrder() {
        return salesOrder;
    }

    public void setSalesOrder(SalesOrder salesOrder) {
        this.salesOrder = salesOrder;
    }

    public Integer getFoc() {
        return foc;
    }

    public void setFoc(Integer foc) {
        this.foc = foc;
    }

    public String getFocUnit() {
        return focUnit;
    }

    public void setFocUnit(String focUnit) {
        this.focUnit = focUnit;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public Long getBinId() {
        return binId;
    }

    public void setBinId(Long binId) {
        this.binId = binId;
    }

    public String getBinCode() {
        return binCode;
    }

    public void setBinCode(String binCode) {
        this.binCode = binCode;
    }

    public Boolean getBatchControlled() {
        return batchControlled;
    }

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public void setBatchControlled(Boolean batchControlled) {
        this.batchControlled = batchControlled;
    }

    public Boolean getFefoEnabled() {
        return fefoEnabled;
    }

    public void setFefoEnabled(Boolean fefoEnabled) {
        this.fefoEnabled = fefoEnabled;
    }

    public Integer getMinExpiryDaysForSale() {
        return minExpiryDaysForSale;
    }

    public void setMinExpiryDaysForSale(Integer minExpiryDaysForSale) {
        this.minExpiryDaysForSale = minExpiryDaysForSale;
    }

    public Integer getBaseRequiredQuantity() {
        return baseRequiredQuantity;
    }

    public void setBaseRequiredQuantity(Integer baseRequiredQuantity) {
        this.baseRequiredQuantity = baseRequiredQuantity;
    }

    public Integer getBatchSelectedQuantity() {
        return batchSelectedQuantity;
    }

    public void setBatchSelectedQuantity(Integer batchSelectedQuantity) {
        this.batchSelectedQuantity = batchSelectedQuantity;
    }

    public String getBatchSelectionMode() {
        return batchSelectionMode;
    }

    public void setBatchSelectionMode(String batchSelectionMode) {
        this.batchSelectionMode = batchSelectionMode;
    }

    public List<DeliveryBatchSelectionResponse> getBatchSelections() {
        return batchSelections;
    }

    public void setBatchSelections(List<DeliveryBatchSelectionResponse> batchSelections) {
        this.batchSelections = batchSelections;
    }

    public String getBrandName() { return brandName; }
    public void setBrandName(String brandName) { this.brandName = brandName; }
    public String getDetailedDesc() { return detailedDesc; }
    public void setDetailedDesc(String detailedDesc) { this.detailedDesc = detailedDesc; }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }
}
