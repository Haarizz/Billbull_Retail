package com.billbull.backend.inventory.product;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public class ProductRequest {

    @NotBlank
    private String code;

    @NotBlank
    private String name;

    @NotNull
    private Long departmentId;

    @NotNull
    private Long brandId;

    @NotNull
    private Long unitId;

    @NotNull
    private BigDecimal sellingPrice;

    private String description;

    private Boolean availableInPos = true;

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

	public Long getDepartmentId() {
		return departmentId;
	}

	public void setDepartmentId(Long departmentId) {
		this.departmentId = departmentId;
	}

	public Long getBrandId() {
		return brandId;
	}

	public void setBrandId(Long brandId) {
		this.brandId = brandId;
	}

	public Long getUnitId() {
		return unitId;
	}

	public void setUnitId(Long unitId) {
		this.unitId = unitId;
	}

	public BigDecimal getSellingPrice() {
		return sellingPrice;
	}

	public void setSellingPrice(BigDecimal sellingPrice) {
		this.sellingPrice = sellingPrice;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public Boolean getAvailableInPos() {
		return availableInPos;
	}

	public void setAvailableInPos(Boolean availableInPos) {
		this.availableInPos = availableInPos;
	}

    // getters and setters
}
