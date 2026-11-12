package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.product.Product;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

@Entity
@Table(name = "lpo_items")
public class LpoItem extends BaseEntity {

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "lpo_id", nullable = false)
	@JsonIgnore
	private Lpo lpo;

	private String itemCode;
	private String itemName;
	private String barcode;
	private String uom;

	private BigDecimal lastPrice;
	private BigDecimal currentCost;

	private Integer quantity;
	private BigDecimal unitPrice;
	private BigDecimal discountPercent;
	private BigDecimal lineTotal;
	private Integer focQty;
	private String focUnit;

	private String remarks;

	/**
	 * Optional per-line VAT % (e.g. the rate a vendor quoted on an RFQ). NULL means "use the
	 * product's purchase tax", resolved at read time — the behaviour every LPO had before V137.
	 */
	@Column(name = "purchase_tax", precision = 7, scale = 2)
	private BigDecimal purchaseTax;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	public BigDecimal getPurchaseTax() {
		return purchaseTax;
	}

	public void setPurchaseTax(BigDecimal purchaseTax) {
		this.purchaseTax = purchaseTax;
	}

	public Integer getQuantity() {
		return quantity;
	}

	public Product getProduct() {
		return product;
	}

	public Lpo getLpo() {
		return lpo;
	}

	public void setLpo(Lpo lpo) {
		this.lpo = lpo;
	}

	public String getItemCode() {
		return itemCode;
	}

	public void setItemCode(String itemCode) {
		this.itemCode = itemCode;
	}

	public String getItemName() {
		return itemName;
	}

	public void setItemName(String itemName) {
		this.itemName = itemName;
	}

	public String getBarcode() {
		return barcode;
	}

	public void setBarcode(String barcode) {
		this.barcode = barcode;
	}

	public String getUom() {
		return uom;
	}

	public void setUom(String uom) {
		this.uom = uom;
	}

	public BigDecimal getLastPrice() {
		return lastPrice;
	}

	public void setLastPrice(BigDecimal lastPrice) {
		this.lastPrice = lastPrice;
	}

	public BigDecimal getCurrentCost() {
		return currentCost;
	}

	public void setCurrentCost(BigDecimal currentCost) {
		this.currentCost = currentCost;
	}

	public BigDecimal getUnitPrice() {
		return unitPrice;
	}

	public void setUnitPrice(BigDecimal unitPrice) {
		this.unitPrice = unitPrice;
	}

	public BigDecimal getDiscountPercent() {
		return discountPercent;
	}

	public void setDiscountPercent(BigDecimal discountPercent) {
		this.discountPercent = discountPercent;
	}

	public BigDecimal getLineTotal() {
		return lineTotal;
	}

	public void setLineTotal(BigDecimal lineTotal) {
		this.lineTotal = lineTotal;
	}

	public String getRemarks() {
		return remarks;
	}

	public void setRemarks(String remarks) {
		this.remarks = remarks;
	}

	public void setQuantity(Integer quantity) {
		this.quantity = quantity;
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

	public String getFocUnit() {
		return focUnit;
	}

	public void setFocUnit(String focUnit) {
		this.focUnit = focUnit;
	}
}
