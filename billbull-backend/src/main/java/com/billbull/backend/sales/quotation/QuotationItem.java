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
public class QuotationItem implements com.billbull.backend.sales.pricing.PriceStampedLine {

    // How this line was priced (V129, Pricing Phase 2.1/3), stamped by the server on save through
    // sales.pricing.PricingResolutionService#applyToLines — never trusted from the client. The charged
    // price stays in `price`; these only record what the resolver offered and why. Reference ids
    // only (no foreign keys): later pricing changes never touch a saved line.
    @Column(name = "price_level_id")
    private Long priceLevelId;
    @Column(name = "price_level_name", length = 100)
    private String priceLevelName;
    /** sales.pricing.PriceSource name. */
    @Column(name = "price_source", length = 30)
    private String priceSource;
    @Column(name = "resolved_unit_price", precision = 15, scale = 2)
    private BigDecimal resolvedUnitPrice;
    /** The charged price differs from the resolved one (a manual price edit). */
    @Column(name = "price_overridden")
    private Boolean priceOverridden;
    @Column(name = "customer_price_id")
    private Long customerPriceId;

    /** The quantity tier (sales.pricing.ProductQuantityTier) the line was resolved from, if any (V129). */
    @Column(name = "quantity_tier_id")
    private Long quantityTierId;
    /** That tier's threshold, in base units. */
    @Column(name = "tier_min_quantity", precision = 15, scale = 3)
    private java.math.BigDecimal tierMinQuantity;
    /** The document's paid base-unit quantity of the product that qualified for the tier. */
    @Column(name = "tier_eligible_quantity", precision = 15, scale = 3)
    private java.math.BigDecimal tierEligibleQuantity;


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
    @Column(name = "footer_discount", precision = 15, scale = 2)
    private BigDecimal footerDiscount;
    private BigDecimal taxRate;
    private BigDecimal taxAmount;
    private BigDecimal lineTotal;
    private BigDecimal foc;
    /** Unit the FOC quantity is expressed in; null means the selling unit. */
    @Column(name = "foc_unit", length = 50)
    private String focUnit;

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

    @Transient
    private String brandName;
    @Transient
    private String detailedDesc;
    // QA-029: transient identity fields hydrated at read-time from the Product
    // master so print templates can render Product Name, SKU, Short Desc, and
    // Arabic Name without persisting duplicate columns on every line.
    @Transient
    private String productName;
    @Transient
    private String sku;
    @Transient
    private String shortDesc;
    @Transient
    private String localName;

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public Boolean getBatchControlled() { return batchControlled; }
    public void setBatchControlled(Boolean batchControlled) { this.batchControlled = batchControlled; }

    public Boolean getFefoEnabled() { return fefoEnabled; }
    public void setFefoEnabled(Boolean fefoEnabled) { this.fefoEnabled = fefoEnabled; }

    public Integer getMinExpiryDaysForSale() { return minExpiryDaysForSale; }
    public void setMinExpiryDaysForSale(Integer minExpiryDaysForSale) { this.minExpiryDaysForSale = minExpiryDaysForSale; }

    public String getBrandName() { return brandName; }
    public void setBrandName(String brandName) { this.brandName = brandName; }
    public String getDetailedDesc() { return detailedDesc; }
    public void setDetailedDesc(String detailedDesc) { this.detailedDesc = detailedDesc; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public String getShortDesc() { return shortDesc; }
    public void setShortDesc(String shortDesc) { this.shortDesc = shortDesc; }
    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }

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

    public BigDecimal getFooterDiscount() {
        return footerDiscount;
    }

    public void setFooterDiscount(BigDecimal footerDiscount) {
        this.footerDiscount = footerDiscount;
    }

    public String getFocUnit() {
        return focUnit;
    }

    public void setFocUnit(String focUnit) {
        this.focUnit = focUnit;
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

    public Long getPriceLevelId() { return priceLevelId; }
    public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
    public String getPriceLevelName() { return priceLevelName; }
    public void setPriceLevelName(String priceLevelName) { this.priceLevelName = priceLevelName; }
    public String getPriceSource() { return priceSource; }
    public void setPriceSource(String priceSource) { this.priceSource = priceSource; }
    public BigDecimal getResolvedUnitPrice() { return resolvedUnitPrice; }
    public void setResolvedUnitPrice(BigDecimal resolvedUnitPrice) { this.resolvedUnitPrice = resolvedUnitPrice; }
    public Boolean getPriceOverridden() { return priceOverridden; }
    public void setPriceOverridden(Boolean priceOverridden) { this.priceOverridden = priceOverridden; }
    public Long getCustomerPriceId() { return customerPriceId; }
    public void setCustomerPriceId(Long customerPriceId) { this.customerPriceId = customerPriceId; }

    public Long getQuantityTierId() { return quantityTierId; }
    public void setQuantityTierId(Long quantityTierId) { this.quantityTierId = quantityTierId; }
    public java.math.BigDecimal getTierMinQuantity() { return tierMinQuantity; }
    public void setTierMinQuantity(java.math.BigDecimal tierMinQuantity) { this.tierMinQuantity = tierMinQuantity; }
    public java.math.BigDecimal getTierEligibleQuantity() { return tierEligibleQuantity; }
    public void setTierEligibleQuantity(java.math.BigDecimal tierEligibleQuantity) { this.tierEligibleQuantity = tierEligibleQuantity; }

    @Override
    public BigDecimal pricingQuantity() { return quantity; }
}
