package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.Zone;
import com.billbull.backend.inventory.warehouse.Locator;
import com.billbull.backend.inventory.warehouse.Bin;

import jakarta.persistence.*;

@Entity
@Table(name = "lpos")
public class Lpo extends BaseEntity {

	@Column(unique = true, nullable = false)
	private String lpoNumber;

	private String vendorName;
	private String vendorCode;

	@Enumerated(EnumType.STRING)
	private LpoSource source;

	@Enumerated(EnumType.STRING)
	private LpoStatus status;

	private LocalDate lpoDate;
	private LocalDate expectedDeliveryDate;

	private String deliveryLocation;
	private String purchaseType;
	private String buyerAssigned;
	private String referenceDocument;

	private BigDecimal subtotal;
	private BigDecimal discount;
	private BigDecimal tax;
	private BigDecimal grandTotal;

	@Enumerated(EnumType.STRING)
	private com.billbull.backend.common.workflow.ApprovalStatus approvalStatus;

	private String tenantId;

	private String approvedBy;
	private LocalDateTime approvedAt;

	/* ===== STOCK FLAGS ===== */
	@Column(nullable = false)
	private boolean stockPosted = false; // AUTHORITATIVE

	@Column(nullable = false)
	private boolean fullStockProvided = false; // INFORMATIVE ONLY

	/* ===== RELATIONSHIPS ===== */
	@OneToMany(mappedBy = "lpo", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<LpoItem> items = new ArrayList<>();

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "warehouse_id", nullable = false)
	private Warehouse warehouse;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "zone_id")
	private Zone zone;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "locator_id")
	private Locator locator;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "bin_id")
	private Bin bin;

	/* ===== GETTERS / SETTERS ===== */

	public String getLpoNumber() {
		return lpoNumber;
	}

	public void setLpoNumber(String lpoNumber) {
		this.lpoNumber = lpoNumber;
	}

	public boolean isStockPosted() {
		return stockPosted;
	}

	public void setStockPosted(boolean stockPosted) {
		this.stockPosted = stockPosted;
	}

	public boolean isFullStockProvided() {
		return fullStockProvided;
	}

	public void setFullStockProvided(boolean fullStockProvided) {
		this.fullStockProvided = fullStockProvided;
	}

	public LpoStatus getStatus() {
		return status;
	}

	public void setStatus(LpoStatus status) {
		this.status = status;
	}

	public com.billbull.backend.common.workflow.ApprovalStatus getApprovalStatus() {
		return approvalStatus;
	}

	public void setApprovalStatus(com.billbull.backend.common.workflow.ApprovalStatus approvalStatus) {
		this.approvalStatus = approvalStatus;
	}

	public String getTenantId() {
		return tenantId;
	}

	public void setTenantId(String tenantId) {
		this.tenantId = tenantId;
	}

	public Warehouse getWarehouse() {
		return warehouse;
	}

	public void setWarehouse(Warehouse warehouse) {
		this.warehouse = warehouse;
	}

	public Zone getZone() {
		return zone;
	}

	public void setZone(Zone zone) {
		this.zone = zone;
	}

	public Locator getLocator() {
		return locator;
	}

	public void setLocator(Locator locator) {
		this.locator = locator;
	}

	public Bin getBin() {
		return bin;
	}

	public void setBin(Bin bin) {
		this.bin = bin;
	}

	public List<LpoItem> getItems() {
		return items;
	}

	public void setItems(List<LpoItem> items) {
		this.items = items;
	}

	public String getVendorName() {
		return vendorName;
	}

	public void setVendorName(String vendorName) {
		this.vendorName = vendorName;
	}

	public String getVendorCode() {
		return vendorCode;
	}

	public void setVendorCode(String vendorCode) {
		this.vendorCode = vendorCode;
	}

	public LpoSource getSource() {
		return source;
	}

	public void setSource(LpoSource source) {
		this.source = source;
	}

	public LocalDate getLpoDate() {
		return lpoDate;
	}

	public void setLpoDate(LocalDate lpoDate) {
		this.lpoDate = lpoDate;
	}

	public LocalDate getExpectedDeliveryDate() {
		return expectedDeliveryDate;
	}

	public void setExpectedDeliveryDate(LocalDate expectedDeliveryDate) {
		this.expectedDeliveryDate = expectedDeliveryDate;
	}

	public String getDeliveryLocation() {
		return deliveryLocation;
	}

	public void setDeliveryLocation(String deliveryLocation) {
		this.deliveryLocation = deliveryLocation;
	}

	public String getPurchaseType() {
		return purchaseType;
	}

	public void setPurchaseType(String purchaseType) {
		this.purchaseType = purchaseType;
	}

	public String getBuyerAssigned() {
		return buyerAssigned;
	}

	public void setBuyerAssigned(String buyerAssigned) {
		this.buyerAssigned = buyerAssigned;
	}

	public String getReferenceDocument() {
		return referenceDocument;
	}

	public void setReferenceDocument(String referenceDocument) {
		this.referenceDocument = referenceDocument;
	}

	public BigDecimal getSubtotal() {
		return subtotal;
	}

	public void setSubtotal(BigDecimal subtotal) {
		this.subtotal = subtotal;
	}

	public BigDecimal getDiscount() {
		return discount;
	}

	public void setDiscount(BigDecimal discount) {
		this.discount = discount;
	}

	public BigDecimal getTax() {
		return tax;
	}

	public void setTax(BigDecimal tax) {
		this.tax = tax;
	}

	public BigDecimal getGrandTotal() {
		return grandTotal;
	}

	public void setGrandTotal(BigDecimal grandTotal) {
		this.grandTotal = grandTotal;
	}

	public String getApprovedBy() {
		return approvedBy;
	}

	public void setApprovedBy(String approvedBy) {
		this.approvedBy = approvedBy;
	}

	public LocalDateTime getApprovedAt() {
		return approvedAt;
	}

	public void setApprovedAt(LocalDateTime approvedAt) {
		this.approvedAt = approvedAt;
	}
}
