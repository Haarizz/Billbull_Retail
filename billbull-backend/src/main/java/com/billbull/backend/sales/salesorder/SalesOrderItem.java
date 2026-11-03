package com.billbull.backend.sales.salesorder;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.sales.delivery.DeliveryBatchSelectionResponse;

@Entity
@Table(name = "sales_order_items")
public class SalesOrderItem implements com.billbull.backend.sales.pricing.PriceStampedLine {

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
    private Integer quantity;

    @Column(precision = 15, scale = 2)
    private BigDecimal price;
    @Column(precision = 15, scale = 2)
    private BigDecimal cost;
    /** Line discount PERCENTAGE rate (not money). */
    private Double discount;
    @Column(name = "footer_discount", precision = 15, scale = 2)
    private BigDecimal footerDiscount;
    /** Tax PERCENTAGE rate (not money). */
    private Double taxRate;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxAmount;
    /** Net-of-discount, pre-tax amount the tax is calculated on. */
    @Column(name = "taxable_amount", precision = 15, scale = 2)
    private BigDecimal taxableAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal lineTotal;
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
    // QA-029: identity fields hydrated from Product master at read-time so the
    // shared print template can render Name / SKU / Short Desc / Arabic Name.
    @Transient
    private String productName;
    @Transient
    private String sku;
    @Transient
    private String shortDesc;
    @Transient
    private String localName;

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

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public BigDecimal getCost() {
        return cost;
    }

    public void setCost(BigDecimal cost) {
        this.cost = cost;
    }

    public Double getDiscount() {
        return discount;
    }

    public void setDiscount(Double discount) {
        this.discount = discount;
    }

    public BigDecimal getFooterDiscount() {
        return footerDiscount;
    }

    public void setFooterDiscount(BigDecimal footerDiscount) {
        this.footerDiscount = footerDiscount;
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

    public BigDecimal getTaxableAmount() {
        return taxableAmount;
    }

    public void setTaxableAmount(BigDecimal taxableAmount) {
        this.taxableAmount = taxableAmount;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }

    public void setLineTotal(BigDecimal lineTotal) {
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

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public String getShortDesc() { return shortDesc; }
    public void setShortDesc(String shortDesc) { this.shortDesc = shortDesc; }
    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
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
    public BigDecimal pricingQuantity() { return quantity != null ? BigDecimal.valueOf(quantity) : null; }
}
