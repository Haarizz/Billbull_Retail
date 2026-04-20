package com.billbull.backend.sales.proforma;

import java.math.BigDecimal;

public class ProformaItemResponse {

	private Long id;
	private String itemCode;
	private String barcode;
	private String description;
	private String unit;
	private Integer quantity;
	private BigDecimal price;
	private BigDecimal taxPercent;
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

	public Integer getQuantity() {
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

	public void setQuantity(Integer quantity) {
		this.quantity = quantity;
	}

	public void setPrice(BigDecimal price) {
		this.price = price;
	}

	public void setTaxPercent(BigDecimal taxPercent) {
		this.taxPercent = taxPercent;
	}

	public void setLineTotal(BigDecimal lineTotal) {
		this.lineTotal = lineTotal;
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
}
