package com.billbull.backend.inventory.product;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_tax")
public class ProductTax extends BaseEntity {

    @OneToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Product product;

    private BigDecimal purchaseTax;
    private BigDecimal salesTax;
    private String taxCategory;
    private String hsnCode;
	public Product getProduct() {
		return product;
	}
	public void setProduct(Product product) {
		this.product = product;
	}
	public BigDecimal getPurchaseTax() {
		return purchaseTax;
	}
	public void setPurchaseTax(BigDecimal purchaseTax) {
		this.purchaseTax = purchaseTax;
	}
	public BigDecimal getSalesTax() {
		return salesTax;
	}
	public void setSalesTax(BigDecimal salesTax) {
		this.salesTax = salesTax;
	}
	public String getTaxCategory() {
		return taxCategory;
	}
	public void setTaxCategory(String taxCategory) {
		this.taxCategory = taxCategory;
	}
	public String getHsnCode() {
		return hsnCode;
	}
	public void setHsnCode(String hsnCode) {
		this.hsnCode = hsnCode;
	}
    
    
}
