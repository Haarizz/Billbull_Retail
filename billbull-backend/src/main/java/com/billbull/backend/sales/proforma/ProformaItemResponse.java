package com.billbull.backend.sales.proforma;

import java.math.BigDecimal;

public class ProformaItemResponse {

	private Long id;
	private String itemCode;
	private String barcode;
	private String description;
	private String unit;
	private BigDecimal quantity;
	private BigDecimal price;
	private BigDecimal taxPercent;
	private BigDecimal discountPercent;
	private BigDecimal taxableAmount;
	private BigDecimal footerDiscount;
	private BigDecimal taxAmount;
	private BigDecimal lineTotal;
	private Integer foc;
	private String focUnit;
	private String remarks;
	private String image;

	public Long getId() {
		return id;
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

	public Integer getFoc() {
		return foc;
	}

	public String getFocUnit() {
		return focUnit;
	}

	public String getRemarks() {
		return remarks;
	}

	public void setId(Long id) {
		this.id = id;
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

	public void setFoc(Integer foc) {
		this.foc = foc;
	}

	public void setFocUnit(String focUnit) {
		this.focUnit = focUnit;
	}

	public void setRemarks(String remarks) {
		this.remarks = remarks;
	}

	public String getImage() {
		return image;
	}

	public void setImage(String image) {
		this.image = image;
	}

	public BigDecimal getFooterDiscount() {
		return footerDiscount;
	}

	public void setFooterDiscount(BigDecimal footerDiscount) {
		this.footerDiscount = footerDiscount;
	}

	// How the line was priced (server-stamped, Pricing Phase 2.1 / 3).
	private Long priceLevelId;
	private String priceLevelName;
	private String priceSource;
	private BigDecimal resolvedUnitPrice;
	private Boolean priceOverridden;
	private Long customerPriceId;
	private Long quantityTierId;
	private BigDecimal tierMinQuantity;
	private BigDecimal tierEligibleQuantity;

	public Long getPriceLevelId() { return priceLevelId; }
	public void setPriceLevelId(Long v) { this.priceLevelId = v; }
	public String getPriceLevelName() { return priceLevelName; }
	public void setPriceLevelName(String v) { this.priceLevelName = v; }
	public String getPriceSource() { return priceSource; }
	public void setPriceSource(String v) { this.priceSource = v; }
	public BigDecimal getResolvedUnitPrice() { return resolvedUnitPrice; }
	public void setResolvedUnitPrice(BigDecimal v) { this.resolvedUnitPrice = v; }
	public Boolean getPriceOverridden() { return priceOverridden; }
	public void setPriceOverridden(Boolean v) { this.priceOverridden = v; }
	public Long getCustomerPriceId() { return customerPriceId; }
	public void setCustomerPriceId(Long v) { this.customerPriceId = v; }
	public Long getQuantityTierId() { return quantityTierId; }
	public void setQuantityTierId(Long v) { this.quantityTierId = v; }
	public BigDecimal getTierMinQuantity() { return tierMinQuantity; }
	public void setTierMinQuantity(BigDecimal v) { this.tierMinQuantity = v; }
	public BigDecimal getTierEligibleQuantity() { return tierEligibleQuantity; }
	public void setTierEligibleQuantity(BigDecimal v) { this.tierEligibleQuantity = v; }
}
