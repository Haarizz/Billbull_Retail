package com.billbull.backend.purchase.invoice;

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
import com.billbull.backend.settings.branch.Branch;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "purchase_invoices", indexes = {
    @Index(name = "idx_purchase_invoice_branch", columnList = "branch_id")
})
public class PurchaseInvoice extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String invoiceNumber;

	private LocalDate invoiceDate;

	// TEMP vendor (as per your decision)
	private String vendorName;
	private String vendorInvoiceNo;
	private LocalDate vendorInvoiceDate;

	private String sourceType; // DIRECT / AGAINST_LPO / AGAINST_GRN
	private String referenceNo;
	@Column(name = "branch_id")
	private Long branchId;
	private String branchName;
	private String branchCode;

	/** Navigable view of {@link #branchId}. Read-only — writes go through {@link #setBranchId(Long)}. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "branch_id", insertable = false, updatable = false)
	@com.fasterxml.jackson.annotation.JsonIgnore
	private Branch branchEntity;

	private String warehouseName;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "warehouse_id")
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

	@Enumerated(EnumType.STRING)
	private InvoiceStatus status;

	@Enumerated(EnumType.STRING)
	private PaymentStatus paymentStatus;

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

	private LocalDate dueDate;

	private String submittedBy;
	private LocalDateTime submittedAt;

	private String approvedBy;
	private LocalDateTime approvedAt;

	@Column(nullable = false)
	private boolean stockPosted = false;

	// CHILD TABLES (still ONE module)
	@OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<PurchaseInvoiceItem> items = new ArrayList<>();

	@OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<InvoiceLandedCost> landedCosts = new ArrayList<>();

	@OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<InvoicePayment> payments = new ArrayList<>();

	public List<InvoicePayment> getPayments() {
		return payments;
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

	public void setPayments(List<InvoicePayment> payments) {
		this.payments = payments;
	}

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

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

	public LocalDate getVendorInvoiceDate() {
		return vendorInvoiceDate;
	}

	public void setVendorInvoiceDate(LocalDate vendorInvoiceDate) {
		this.vendorInvoiceDate = vendorInvoiceDate;
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

	public Long getBranchId() {
		return branchId;
	}

	public void setBranchId(Long branchId) {
		this.branchId = branchId;
	}

	public String getBranchName() {
		return branchName;
	}

	public void setBranchName(String branchName) {
		this.branchName = branchName;
	}

	public String getBranchCode() {
		return branchCode;
	}

	public void setBranchCode(String branchCode) {
		this.branchCode = branchCode;
	}

	public Branch getBranchEntity() { return branchEntity; }

	public String getWarehouseName() {
		return warehouseName;
	}

	public void setWarehouseName(String warehouseName) {
		this.warehouseName = warehouseName;
	}

	public InvoiceStatus getStatus() {
		return status;
	}

	public void setStatus(InvoiceStatus status) {
		this.status = status;
	}

	public PaymentStatus getPaymentStatus() {
		return paymentStatus;
	}

	public void setPaymentStatus(PaymentStatus paymentStatus) {
		this.paymentStatus = paymentStatus;
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

	public LocalDate getDueDate() {
		return dueDate;
	}

	public void setDueDate(LocalDate dueDate) {
		this.dueDate = dueDate;
	}

	public String getSubmittedBy() {
		return submittedBy;
	}

	public void setSubmittedBy(String submittedBy) {
		this.submittedBy = submittedBy;
	}

	public LocalDateTime getSubmittedAt() {
		return submittedAt;
	}

	public void setSubmittedAt(LocalDateTime submittedAt) {
		this.submittedAt = submittedAt;
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

	public List<PurchaseInvoiceItem> getItems() {
		return items;
	}

	public void setItems(List<PurchaseInvoiceItem> items) {
		this.items = items;
	}

	public List<InvoiceLandedCost> getLandedCosts() {
		return landedCosts;
	}

	public void setLandedCosts(List<InvoiceLandedCost> landedCosts) {
		this.landedCosts = landedCosts;
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

	public boolean isStockPosted() {
		return stockPosted;
	}

	public void setStockPosted(boolean stockPosted) {
		this.stockPosted = stockPosted;
	}

}
