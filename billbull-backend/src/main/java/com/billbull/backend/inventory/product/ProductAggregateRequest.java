package com.billbull.backend.inventory.product;

import java.util.List;

public class ProductAggregateRequest {

    private Product product;
    private ProductPricing pricing;
    private ProductTax tax;
    private ProductInventoryPolicy inventory;
    private List<ProductBranchPricing> branchPrices;
	public Product getProduct() {
		return product;
	}
	public void setProduct(Product product) {
		this.product = product;
	}
	public ProductPricing getPricing() {
		return pricing;
	}
	public void setPricing(ProductPricing pricing) {
		this.pricing = pricing;
	}
	public ProductTax getTax() {
		return tax;
	}
	public void setTax(ProductTax tax) {
		this.tax = tax;
	}
	public ProductInventoryPolicy getInventory() {
		return inventory;
	}
	public void setInventory(ProductInventoryPolicy inventory) {
		this.inventory = inventory;
	}

    public List<ProductBranchPricing> getBranchPrices() {
        return branchPrices;
    }

    public void setBranchPrices(List<ProductBranchPricing> branchPrices) {
        this.branchPrices = branchPrices;
    }

    // getters & setters
}
