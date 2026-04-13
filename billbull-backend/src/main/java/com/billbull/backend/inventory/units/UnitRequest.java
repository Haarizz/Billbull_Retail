package com.billbull.backend.inventory.units;

import jakarta.validation.constraints.NotBlank;

public class UnitRequest {

	@NotBlank
	private String name;

	@NotBlank
	private String symbol;

	private String description;

	private Long baseUnitId;

	private java.math.BigDecimal conversionRate;

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getSymbol() {
		return symbol;
	}

	public void setSymbol(String symbol) {
		this.symbol = symbol;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public Long getBaseUnitId() {
		return baseUnitId;
	}

	public void setBaseUnitId(Long baseUnitId) {
		this.baseUnitId = baseUnitId;
	}

	public java.math.BigDecimal getConversionRate() {
		return conversionRate;
	}

	public void setConversionRate(java.math.BigDecimal conversionRate) {
		this.conversionRate = conversionRate;
	}
}