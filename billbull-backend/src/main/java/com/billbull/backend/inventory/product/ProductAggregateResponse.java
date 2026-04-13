package com.billbull.backend.inventory.product;

public class ProductAggregateResponse {

    private Product product;
    private ProductPricing pricing;
    private ProductTax tax;
    private ProductInventoryPolicy inventory;
    private String primaryImage; // Added field

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

    public String getPrimaryImage() {
        return primaryImage;
    }

    public void setPrimaryImage(String primaryImage) {
        this.primaryImage = primaryImage;
    }
}