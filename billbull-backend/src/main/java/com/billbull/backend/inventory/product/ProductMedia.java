package com.billbull.backend.inventory.product;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_media")
public class ProductMedia extends BaseEntity {

    @ManyToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Product product;

    private String imageUrl;
    private boolean isPrimary;
	public Product getProduct() {
		return product;
	}
	public void setProduct(Product product) {
		this.product = product;
	}
	public String getImageUrl() {
		return imageUrl;
	}
	public void setImageUrl(String imageUrl) {
		this.imageUrl = imageUrl;
	}
	public boolean isPrimary() {
		return isPrimary;
	}
	public void setPrimary(boolean isPrimary) {
		this.isPrimary = isPrimary;
	}
    
    
}
