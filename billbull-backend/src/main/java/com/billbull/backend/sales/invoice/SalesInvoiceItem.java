package com.billbull.backend.sales.invoice;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;

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
    @Transient
    private String barcode;

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
