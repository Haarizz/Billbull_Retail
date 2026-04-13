package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import lombok.Data;

@Data
public class PurchaseInvoiceRequest {

	private String invoiceNumber;
	private LocalDate invoiceDate;

	private String vendorName;
	private String vendorInvoiceNo;

	private String sourceType;
	private String referenceNo;
	private String warehouseName;
	private Long warehouseId;
	private Long zoneId;
	private Long locatorId;
	private Long binId;

	private LocalDate dueDate;

	private BigDecimal subTotal;
	private BigDecimal discountTotal;
	private BigDecimal taxTotal;
	private BigDecimal landedCost;
	private BigDecimal grandTotal;
	private Long grnId;
	private String grnNo;

	private Long lpoId;

	private BigDecimal freight;
	private BigDecimal customsDuty;
	private BigDecimal handling;
	private BigDecimal clearing;
	private BigDecimal insurance;
	private BigDecimal otherCosts;

	private List<PurchaseInvoiceItemRequest> items;
	private List<LandedCostRequest> landedCosts;

	public String getInvoiceNumber() {
		return invoiceNumber;
	}

	public void setInvoiceNumber(String invoiceNumber) {
		this.invoiceNumber = invoiceNumber;
	}

	public LocalDate getInvoiceDate() {
		return invoiceDate;
	}

	public void setInvoiceDate(LocalDate invoiceDate) {
		this.invoiceDate = invoiceDate;
	}

	public String getVendorName() {
		return vendorName;
	}

	public void setVendorName(String vendorName) {
		this.vendorName = vendorName;
	}

	public String getVendorInvoiceNo() {
		return vendorInvoiceNo;
	}

	public void setVendorInvoiceNo(String vendorInvoiceNo) {
		this.vendorInvoiceNo = vendorInvoiceNo;
	}

	public String getSourceType() {
		return sourceType;
	}

	public void setSourceType(String sourceType) {
		this.sourceType = sourceType;
	}

	public String getReferenceNo() {
		return referenceNo;
	}

	public void setReferenceNo(String referenceNo) {
		this.referenceNo = referenceNo;
	}

	public String getWarehouseName() {
		return warehouseName;
	}

	public void setWarehouseName(String warehouseName) {
		this.warehouseName = warehouseName;
	}

	public LocalDate getDueDate() {
		return dueDate;
	}

	public void setDueDate(LocalDate dueDate) {
		this.dueDate = dueDate;
	}

	public BigDecimal getSubTotal() {
		return subTotal;
	}

	public void setSubTotal(BigDecimal subTotal) {
		this.subTotal = subTotal;
	}

	public BigDecimal getDiscountTotal() {
		return discountTotal;
	}

	public void setDiscountTotal(BigDecimal discountTotal) {
		this.discountTotal = discountTotal;
	}

	public BigDecimal getTaxTotal() {
		return taxTotal;
	}

	public void setTaxTotal(BigDecimal taxTotal) {
		this.taxTotal = taxTotal;
	}

	public BigDecimal getLandedCost() {
		return landedCost;
	}

	public void setLandedCost(BigDecimal landedCost) {
		this.landedCost = landedCost;
	}

	public BigDecimal getGrandTotal() {
		return grandTotal;
	}

	public void setGrandTotal(BigDecimal grandTotal) {
		this.grandTotal = grandTotal;
	}

	public List<PurchaseInvoiceItemRequest> getItems() {
		return items;
	}

	public void setItems(List<PurchaseInvoiceItemRequest> items) {
		this.items = items;
	}

	public List<LandedCostRequest> getLandedCosts() {
		return landedCosts;
	}

	public void setLandedCosts(List<LandedCostRequest> landedCosts) {
		this.landedCosts = landedCosts;
	}

	public Long getGrnId() {
		return grnId;
	}

	public void setGrnId(Long grnId) {
		this.grnId = grnId;
	}

	public String getGrnNo() {
		return grnNo;
	}

	public void setGrnNo(String grnNo) {
		this.grnNo = grnNo;
	}

	public Long getLpoId() {
		return lpoId;
	}

	public void setLpoId(Long lpoId) {
		this.lpoId = lpoId;
	}

	public BigDecimal getFreight() {
		return freight;
	}

	public void setFreight(BigDecimal freight) {
		this.freight = freight;
	}

	public BigDecimal getCustomsDuty() {
		return customsDuty;
	}

	public void setCustomsDuty(BigDecimal customsDuty) {
		this.customsDuty = customsDuty;
	}

	public BigDecimal getHandling() {
		return handling;
	}

	public void setHandling(BigDecimal handling) {
		this.handling = handling;
	}

	public BigDecimal getClearing() {
		return clearing;
	}

	public void setClearing(BigDecimal clearing) {
		this.clearing = clearing;
	}

	public BigDecimal getInsurance() {
		return insurance;
	}

	public void setInsurance(BigDecimal insurance) {
		this.insurance = insurance;
	}

	public BigDecimal getOtherCosts() {
		return otherCosts;
	}

	public void setOtherCosts(BigDecimal otherCosts) {
		this.otherCosts = otherCosts;
	}

	public Long getWarehouseId() {
		return warehouseId;
	}

	public void setWarehouseId(Long warehouseId) {
		this.warehouseId = warehouseId;
	}

	public Long getZoneId() {
		return zoneId;
	}

	public void setZoneId(Long zoneId) {
		this.zoneId = zoneId;
	}

	public Long getLocatorId() {
		return locatorId;
	}

	public void setLocatorId(Long locatorId) {
		this.locatorId = locatorId;
	}

	public Long getBinId() {
		return binId;
	}

	public void setBinId(Long binId) {
		this.binId = binId;
	}

}
