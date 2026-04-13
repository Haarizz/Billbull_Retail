package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.product.Product;

import jakarta.persistence.*;

@Entity
@Table(name = "grn_items")
public class GrnItemEntity extends BaseEntity {

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "grn_id", nullable = false)
	private GrnEntity grn;

	private String productCode;
	private String productName;
	private String uom;

	private Integer lpoQty;
	private Integer receivedQty;
	private Integer acceptedQty;
	private Integer rejectedQty;

	private BigDecimal unitCost;
	private BigDecimal netCost;
	private BigDecimal lineTotal;
	private Integer focQty;

	private boolean batchManaged;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	public Integer getReceivedQty() {
		return receivedQty;
	}

	public Product getProduct() {
		return product;
	}

	public GrnEntity getGrn() {
		return grn;
	}

	public void setGrn(GrnEntity grn) {
		this.grn = grn;
	}

	public String getProductCode() {
		return productCode;
	}

	public void setProductCode(String productCode) {
		this.productCode = productCode;
	}

	public String getProductName() {
		return productName;
	}

	public void setProductName(String productName) {
		this.productName = productName;
	}

	public String getUom() {
		return uom;
	}

	public void setUom(String uom) {
		this.uom = uom;
	}

	public Integer getLpoQty() {
		return lpoQty;
	}

	public void setLpoQty(Integer lpoQty) {
		this.lpoQty = lpoQty;
	}

	public Integer getAcceptedQty() {
		return acceptedQty;
	}

	public void setAcceptedQty(Integer acceptedQty) {
		this.acceptedQty = acceptedQty;
	}

	public Integer getRejectedQty() {
		return rejectedQty;
	}

	public void setRejectedQty(Integer rejectedQty) {
		this.rejectedQty = rejectedQty;
	}

	public BigDecimal getUnitCost() {
		return unitCost;
	}

	public void setUnitCost(BigDecimal unitCost) {
		this.unitCost = unitCost;
	}

	public BigDecimal getNetCost() {
		return netCost;
	}

	public void setNetCost(BigDecimal netCost) {
		this.netCost = netCost;
	}

	public BigDecimal getLineTotal() {
		return lineTotal;
	}

	public void setLineTotal(BigDecimal lineTotal) {
		this.lineTotal = lineTotal;
	}

	public boolean isBatchManaged() {
		return batchManaged;
	}

	public void setBatchManaged(boolean batchManaged) {
		this.batchManaged = batchManaged;
	}

	public void setReceivedQty(Integer receivedQty) {
		this.receivedQty = receivedQty;
	}

	public void setProduct(Product product) {
		this.product = product;
	}

	public Integer getFocQty() {
		return focQty;
	}

	public void setFocQty(Integer focQty) {
		this.focQty = focQty;
	}
}
