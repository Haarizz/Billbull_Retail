package com.billbull.backend.inventory.product;

import java.util.List;

public class ProductAggregateResponse {

    private Product product;
    private ProductPricing pricing;
    private ProductPricing effectivePricing;
    private ProductTax tax;
    private ProductInventoryPolicy inventory;
    private List<ProductBranchPricing> branchPrices;
    private ProductBranchPricing activeBranchPrice;
    private String primaryImage;
    private Integer stock;

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

    public ProductPricing getEffectivePricing() {
        return effectivePricing;
    }

    public void setEffectivePricing(ProductPricing effectivePricing) {
        this.effectivePricing = effectivePricing;
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

    public ProductBranchPricing getActiveBranchPrice() {
        return activeBranchPrice;
    }

    public void setActiveBranchPrice(ProductBranchPricing activeBranchPrice) {
        this.activeBranchPrice = activeBranchPrice;
    }

    public String getPrimaryImage() {
        return primaryImage;
    }

    public void setPrimaryImage(String primaryImage) {
        this.primaryImage = primaryImage;
    }

    public Integer getStock() {
        return stock;
    }

    public void setStock(Integer stock) {
        this.stock = stock;
    }
}
