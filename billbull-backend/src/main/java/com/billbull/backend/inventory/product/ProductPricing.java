package com.billbull.backend.inventory.product;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_pricing")
public class ProductPricing extends BaseEntity {

    @OneToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Product product;

    private BigDecimal cost;
    private BigDecimal landingCost;
    private BigDecimal nlc;

    @Enumerated(EnumType.STRING)
    private CostMethod costMethod;

    private boolean isCostInclusive;

    private BigDecimal retailPrice;
    private BigDecimal wholesalePrice;
    private BigDecimal minPrice;
    private BigDecimal maxPrice;
    private BigDecimal onlinePrice;

    private BigDecimal markup;
    private BigDecimal gp;

    /** Default discount % applied automatically when this product is added to a POS cart. 0 = no default discount. */
    private BigDecimal defaultDiscount;
    /** Product reward/loyalty points imported from legacy product masters. */
    private BigDecimal loyaltyPoints;

	public BigDecimal getDefaultDiscount() { return defaultDiscount; }
	public void setDefaultDiscount(BigDecimal defaultDiscount) { this.defaultDiscount = defaultDiscount; }
	public BigDecimal getLoyaltyPoints() { return loyaltyPoints; }
	public void setLoyaltyPoints(BigDecimal loyaltyPoints) { this.loyaltyPoints = loyaltyPoints; }

	public Product getProduct() {
		return product;
	}
	public void setProduct(Product product) {
		this.product = product;
	}
	public BigDecimal getCost() {
		return cost;
	}
	public void setCost(BigDecimal cost) {
		this.cost = cost;
	}
	public BigDecimal getLandingCost() {
		return landingCost;
	}
	public void setLandingCost(BigDecimal landingCost) {
		this.landingCost = landingCost;
	}
	public BigDecimal getNlc() {
		return nlc;
	}
	public void setNlc(BigDecimal nlc) {
		this.nlc = nlc;
	}
	public CostMethod getCostMethod() {
		return costMethod;
	}
	public void setCostMethod(CostMethod costMethod) {
		this.costMethod = costMethod;
	}
	public boolean isCostInclusive() {
		return isCostInclusive;
	}
	public void setCostInclusive(boolean isCostInclusive) {
		this.isCostInclusive = isCostInclusive;
	}
	public BigDecimal getRetailPrice() {
		return retailPrice;
	}
	public void setRetailPrice(BigDecimal retailPrice) {
		this.retailPrice = retailPrice;
	}
	public BigDecimal getWholesalePrice() {
		return wholesalePrice;
	}
	public void setWholesalePrice(BigDecimal wholesalePrice) {
		this.wholesalePrice = wholesalePrice;
	}
	public BigDecimal getMinPrice() {
		return minPrice;
	}
	public void setMinPrice(BigDecimal minPrice) {
		this.minPrice = minPrice;
	}
	public BigDecimal getMaxPrice() {
		return maxPrice;
	}
	public void setMaxPrice(BigDecimal maxPrice) {
		this.maxPrice = maxPrice;
	}
	public BigDecimal getOnlinePrice() {
		return onlinePrice;
	}
	public void setOnlinePrice(BigDecimal onlinePrice) {
		this.onlinePrice = onlinePrice;
	}
	public BigDecimal getMarkup() {
		return markup;
	}
	public void setMarkup(BigDecimal markup) {
		this.markup = markup;
	}
	public BigDecimal getGp() {
		return gp;
	}
	public void setGp(BigDecimal gp) {
		this.gp = gp;
	}
    
    
}
