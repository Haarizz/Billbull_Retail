package com.billbull.backend.sales.quotation;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonBackReference;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

@Entity
@Table(name = "sales_quotation_items")
public class QuotationItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String itemCode;
    private String barcode;
    private String description;
    private String unit;

    private BigDecimal quantity;
    private BigDecimal price;
    private BigDecimal discount;
    private BigDecimal taxRate;
    private BigDecimal taxAmount;
    private BigDecimal lineTotal;
    private BigDecimal foc;

    private String image;

    @Column(length = 500)
    private String remarks;

    @JsonBackReference
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    /**
     * QA-001: not persisted — populated by QuotationService at read-time from the
     * Product master so the frontend can short-circuit stock checks for service
     * lines without an extra round-trip. Stays null when the master row no
     * longer exists (e.g. archived product).
     */
    @Transient
    private String productType;

    /**
     * QA-001: transient batch-control hints for the Sales Order conversion flow.
     * Quotations don't reserve stock, so these flags are NOT persisted on the
     * quotation row — they're resolved from the Product master at read-time and
     * shipped to the client. The Sales Order page reads them via
     * `normalizeOrderItem` so that converted lines remember they need batch
     * selection.
     */
    @Transient
    private Boolean batchControlled;
    @Transient
    private Boolean fefoEnabled;
    @Transient
    private Integer minExpiryDaysForSale;

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public Boolean getBatchControlled() { return batchControlled; }
    public void setBatchControlled(Boolean batchControlled) { this.batchControlled = batchControlled; }

    public Boolean getFefoEnabled() { return fefoEnabled; }
    public void setFefoEnabled(Boolean fefoEnabled) { this.fefoEnabled = fefoEnabled; }

    public Integer getMinExpiryDaysForSale() { return minExpiryDaysForSale; }
    public void setMinExpiryDaysForSale(Integer minExpiryDaysForSale) { this.minExpiryDaysForSale = minExpiryDaysForSale; }

    public QuotationItem() {
    }

    // ---------------- GETTERS & SETTERS ----------------

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

    public BigDecimal getQuantity() {
        return quantity;
    }

    public void setQuantity(BigDecimal quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public BigDecimal getDiscount() {
        return discount;
    }

    public void setDiscount(BigDecimal discount) {
        this.discount = discount;
    }

    public BigDecimal getTaxRate() {
        return taxRate;
    }

    public void setTaxRate(BigDecimal taxRate) {
        this.taxRate = taxRate;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }

    public void setLineTotal(BigDecimal lineTotal) {
        this.lineTotal = lineTotal;
    }

    public BigDecimal getFoc() {
        return foc;
    }

    public void setFoc(BigDecimal foc) {
        this.foc = foc;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public Quotation getQuotation() {
        return quotation;
    }

    public void setQuotation(Quotation quotation) {
        this.quotation = quotation;
    }
}