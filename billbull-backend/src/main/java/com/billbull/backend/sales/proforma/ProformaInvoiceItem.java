package com.billbull.backend.sales.proforma;

import jakarta.persistence.*;
import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "proforma_invoice_items")
public class ProformaInvoiceItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "proforma_id", nullable = false)
	@JsonIgnore
	private ProformaInvoice proforma;

	private String itemCode;
	private String barcode;
	private String description;
	private String unit;

	private BigDecimal quantity;
	private BigDecimal price;
	private BigDecimal taxPercent;
	private BigDecimal discountPercent;
	private BigDecimal taxableAmount;
	private BigDecimal taxAmount;
	private BigDecimal lineTotal;
	private Integer foc;
	private String focUnit;
	@Column(length = 500)
	private String remarks;

	public Long getId() {
		return id;
	}

	public ProformaInvoice getProforma() {
		return proforma;
	}

	public String getItemCode() {
		return itemCode;
	}

	public String getBarcode() {
		return barcode;
	}

	public String getDescription() {
		return description;
	}

	public String getUnit() {
		return unit;
	}

	public BigDecimal getQuantity() {
		return quantity;
	}

	public BigDecimal getPrice() {
		return price;
	}

	public BigDecimal getTaxPercent() {
		return taxPercent;
	}

	public BigDecimal getLineTotal() {
		return lineTotal;
	}

	public BigDecimal getTaxableAmount() {
		return taxableAmount;
	}

	public void setTaxableAmount(BigDecimal taxableAmount) {
		this.taxableAmount = taxableAmount;
	}

	public BigDecimal getTaxAmount() {
		return taxAmount;
	}

	public void setTaxAmount(BigDecimal taxAmount) {
		this.taxAmount = taxAmount;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public void setProforma(ProformaInvoice proforma) {
		this.proforma = proforma;
	}

	public void setItemCode(String itemCode) {
		this.itemCode = itemCode;
	}

	public void setBarcode(String barcode) {
		this.barcode = barcode;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public void setUnit(String unit) {
		this.unit = unit;
	}

	public void setQuantity(BigDecimal quantity) {
		this.quantity = quantity;
	}

	public void setPrice(BigDecimal price) {
		this.price = price;
	}

	public void setTaxPercent(BigDecimal taxPercent) {
		this.taxPercent = taxPercent;
	}

	public BigDecimal getDiscountPercent() {
		return discountPercent;
	}

	public void setDiscountPercent(BigDecimal discountPercent) {
		this.discountPercent = discountPercent;
	}

	public void setLineTotal(BigDecimal lineTotal) {
		this.lineTotal = lineTotal;
	}

	public Integer getFoc() {
		return foc;
	}

	public String getFocUnit() {
		return focUnit;
	}

	public String getRemarks() {
		return remarks;
	}

	public void setFoc(Integer foc) {
		this.foc = foc;
	}

	public void setFocUnit(String focUnit) {
		this.focUnit = focUnit;
	}

	public void setRemarks(String remarks) {
		this.remarks = remarks;
	}

	// getters & setters
}
