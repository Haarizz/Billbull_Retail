package com.billbull.backend.inventory.product;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_barcodes")
public class ProductBarcode extends BaseEntity {

	@ManyToOne(optional = false)
	@com.fasterxml.jackson.annotation.JsonIgnore
	private Product product;

	@ManyToOne(optional = false)
	@com.fasterxml.jackson.annotation.JsonIgnore
	private ProductPacking packing;

	@Column
	private String barcode;

	private boolean perBranch;
	private boolean includePrice;
	private String labelLayout;

	public Product getProduct() {
		return product;
	}

	public void setProduct(Product product) {
		this.product = product;
	}

	public ProductPacking getPacking() {
		return packing;
	}

	public void setPacking(ProductPacking packing) {
		this.packing = packing;
	}

	public String getBarcode() {
		return barcode;
	}

	public void setBarcode(String barcode) {
		this.barcode = barcode;
	}

	public boolean isPerBranch() {
		return perBranch;
	}

	public void setPerBranch(boolean perBranch) {
		this.perBranch = perBranch;
	}

	public boolean isIncludePrice() {
		return includePrice;
	}

	public void setIncludePrice(boolean includePrice) {
		this.includePrice = includePrice;
	}

	public String getLabelLayout() {
		return labelLayout;
	}

	public void setLabelLayout(String labelLayout) {
		this.labelLayout = labelLayout;
	}

}