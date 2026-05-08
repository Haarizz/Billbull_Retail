package com.billbull.backend.sales.invoice;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.sales.delivery.DeliveryBatchSelectionResponse;

@Entity
@Table(name = "sales_invoice_items")
public class SalesInvoiceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String itemCode;
    private String itemName;
    private String description;
    private String sku;
    private String localName;
    private String unit;
    private Integer quantity;

    private Double price;
    private Double cost;
    private Double discount;
    private Double taxRate;
    private Double taxAmount;
    private Double grossAmount;
    private Double netAmount;
    private Integer foc;
    private String image;
    private Long warehouseId;
    private Long binId;
    private Long salesOrderItemId;
    @Transient
    private String barcode;

    @Transient
    private String binCode;

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

    // Cumulative revenue and COGS recognized via Delivery Notes for this item.
    // Used to track partial delivery recognition and prevent over-posting.
    private BigDecimal recognizedRevenue = BigDecimal.ZERO;
    private BigDecimal recognizedCogs = BigDecimal.ZERO;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_invoice_id")
    @JsonBackReference
    private SalesInvoice salesInvoice;

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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public String getLocalName() {
        return localName;
    }

    public void setLocalName(String localName) {
        this.localName = localName;
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

    public Double getGrossAmount() {
        return grossAmount;
    }

    public void setGrossAmount(Double grossAmount) {
        this.grossAmount = grossAmount;
    }

    public Double getNetAmount() {
        return netAmount;
    }

    public void setNetAmount(Double netAmount) {
        this.netAmount = netAmount;
    }

    public SalesInvoice getSalesInvoice() {
        return salesInvoice;
    }

    public void setSalesInvoice(SalesInvoice salesInvoice) {
        this.salesInvoice = salesInvoice;
    }

    public Integer getFoc() {
        return foc;
    }

    public void setFoc(Integer foc) {
        this.foc = foc;
    }

    public Long getWarehouseId() {
        return warehouseId;
    }

    public void setWarehouseId(Long warehouseId) {
        this.warehouseId = warehouseId;
    }

    public Long getBinId() {
        return binId;
    }

    public void setBinId(Long binId) {
        this.binId = binId;
    }

    public Long getSalesOrderItemId() {
        return salesOrderItemId;
    }

    public void setSalesOrderItemId(Long salesOrderItemId) {
        this.salesOrderItemId = salesOrderItemId;
    }

    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
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

    public BigDecimal getRecognizedRevenue() {
        return recognizedRevenue != null ? recognizedRevenue : BigDecimal.ZERO;
    }

    public void setRecognizedRevenue(BigDecimal recognizedRevenue) {
        this.recognizedRevenue = recognizedRevenue;
    }

    public BigDecimal getRecognizedCogs() {
        return recognizedCogs != null ? recognizedCogs : BigDecimal.ZERO;
    }

    public void setRecognizedCogs(BigDecimal recognizedCogs) {
        this.recognizedCogs = recognizedCogs;
    }
}
