package com.billbull.backend.sales.proforma;

import jakarta.persistence.*;
import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "proforma_invoice_items")
public class ProformaInvoiceItem implements com.billbull.backend.sales.pricing.PriceStampedLine {

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

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "proforma_id", nullable = false)
	@JsonIgnore
	private ProformaInvoice proforma;

	private String itemCode;
	private String barcode;
	private String description;
	private String unit;

	private BigDecimal quantity;
	private BigDecimal price;
	private BigDecimal taxPercent;
	private BigDecimal discountPercent;
	private BigDecimal taxableAmount;
	/** This line's share of the document footer discount (money). */
	@Column(name = "footer_discount", precision = 15, scale = 2)
	private BigDecimal footerDiscount;
	private BigDecimal taxAmount;
	private BigDecimal lineTotal;
	private Integer foc;
	private String focUnit;
	@Column(length = 500)
	private String remarks;

	public Long getId() {
		return id;
	}

	public ProformaInvoice getProforma() {
		return proforma;
	}

	public String getItemCode() {
		return itemCode;
	}

	public String getBarcode() {
		return barcode;
	}

	public String getDescription() {
		return description;
	}

	public String getUnit() {
		return unit;
	}

	public BigDecimal getQuantity() {
		return quantity;
	}

	public BigDecimal getPrice() {
		return price;
	}

	public BigDecimal getTaxPercent() {
		return taxPercent;
	}

	public BigDecimal getLineTotal() {
		return lineTotal;
	}

	public BigDecimal getTaxableAmount() {
		return taxableAmount;
	}

	public void setTaxableAmount(BigDecimal taxableAmount) {
		this.taxableAmount = taxableAmount;
	}

	public BigDecimal getTaxAmount() {
		return taxAmount;
	}

	public void setTaxAmount(BigDecimal taxAmount) {
		this.taxAmount = taxAmount;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public void setProforma(ProformaInvoice proforma) {
		this.proforma = proforma;
	}

	public void setItemCode(String itemCode) {
		this.itemCode = itemCode;
	}

	public void setBarcode(String barcode) {
		this.barcode = barcode;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public void setUnit(String unit) {
		this.unit = unit;
	}

	public void setQuantity(BigDecimal quantity) {
		this.quantity = quantity;
	}

	public void setPrice(BigDecimal price) {
		this.price = price;
	}

	public void setTaxPercent(BigDecimal taxPercent) {
		this.taxPercent = taxPercent;
	}

	public BigDecimal getDiscountPercent() {
		return discountPercent;
	}

	public void setDiscountPercent(BigDecimal discountPercent) {
		this.discountPercent = discountPercent;
	}

	public void setLineTotal(BigDecimal lineTotal) {
		this.lineTotal = lineTotal;
	}

	public Integer getFoc() {
		return foc;
	}

	public String getFocUnit() {
		return focUnit;
	}

	public String getRemarks() {
		return remarks;
	}

	public void setFoc(Integer foc) {
		this.foc = foc;
	}

	public void setFocUnit(String focUnit) {
		this.focUnit = focUnit;
	}

	public void setRemarks(String remarks) {
		this.remarks = remarks;
	}

	// getters & setters

	public BigDecimal getFooterDiscount() {
		return footerDiscount;
	}

	public void setFooterDiscount(BigDecimal footerDiscount) {
		this.footerDiscount = footerDiscount;
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
