package com.billbull.backend.sales.quotation;

import java.math.BigDecimal;
import java.util.List;

public class SalesProductDTO {

	private Long id;
	private String code;
	private String name;
	private String unit;
	private BigDecimal price;
	private Integer maxDiscount;
	private BigDecimal taxRate;
	private String primaryImage;
	private String sku;
	private String barcode;
	private BigDecimal stock;
	private List<PackingDTO> packings;

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public String getCode() {
		return code;
	}

	public void setCode(String code) {
		this.code = code;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getUnit() {
		return unit;
	}

	public void setUnit(String unit) {
		this.unit = unit;
	}

	public BigDecimal getPrice() {
		return price;
	}

	public void setPrice(BigDecimal price) {
		this.price = price;
	}

	public Integer getMaxDiscount() {
		return maxDiscount;
	}

	public void setMaxDiscount(Integer maxDiscount) {
		this.maxDiscount = maxDiscount;
	}

	public BigDecimal getTaxRate() {
		return taxRate;
	}

	public void setTaxRate(BigDecimal taxRate) {
		this.taxRate = taxRate;
	}

	public String getPrimaryImage() {
		return primaryImage;
	}

	public void setPrimaryImage(String primaryImage) {
		this.primaryImage = primaryImage;
	}

	public String getSku() {
		return sku;
	}

	public void setSku(String sku) {
		this.sku = sku;
	}

	public String getBarcode() {
		return barcode;
	}

	public void setBarcode(String barcode) {
		this.barcode = barcode;
	}

	public BigDecimal getStock() {
		return stock;
	}

	public void setStock(BigDecimal stock) {
		this.stock = stock;
	}

	public List<PackingDTO> getPackings() {
		return packings;
	}

	public void setPackings(List<PackingDTO> packings) {
		this.packings = packings;
	}

	// getters & setters
}