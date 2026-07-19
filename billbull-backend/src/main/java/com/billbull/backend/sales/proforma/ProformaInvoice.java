package com.billbull.backend.sales.proforma;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.settings.branch.Branch;


@Entity
@Table(name = "proforma_invoices", indexes = {
    @Index(name = "idx_proforma_branch", columnList = "branch_id")
})
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class ProformaInvoice  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    private String piNumber;

    private LocalDate piDate;
    private LocalDate validUntil;

    private Integer revisionNo; // 1,2,3...

    @Enumerated(EnumType.STRING)
    private ProformaStatus status; // DRAFT / ISSUED

    // ---- Customer Snapshot ----
    private Long customerId;
    private String customerCode;
    private String customerName;
    private String customerTrn;

    // ---- Optional Links ----
    private String quotationNo;
    private String salesOrderNo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    // ---- Totals ----
    private BigDecimal subTotal;
    private BigDecimal billDiscount;
    private BigDecimal taxTotal;
    private BigDecimal grandTotal;

    // True when line prices already include VAT (extract tax rather than add it on top).
    private Boolean taxInclusive = Boolean.FALSE;

    // ---- Payment (INLINE, SIMPLE) ----
    private BigDecimal advancePaid;
    private BigDecimal balanceDue;
    private String paymentMethod;
    private String paymentReference;
    private String paymentNotes;

    // ---- Audit ----
    private LocalDateTime createdAt;
    private LocalDateTime issuedAt;

    @OneToMany(
    	    mappedBy = "proforma",
    	    cascade = CascadeType.ALL,
    	    orphanRemoval = true
    	)
    	@JsonManagedReference
    	private List<ProformaInvoiceItem> items = new ArrayList<>();


    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) this.status = ProformaStatus.DRAFT;
        if (this.revisionNo == null) this.revisionNo = 1;
    }

	public Long getId() {
		return id;
	}

	public Branch getBranch() { return branch; }
	public void setBranch(Branch branch) { this.branch = branch; }

	public String getPiNumber() {
		return piNumber;
	}

	public LocalDate getPiDate() {
		return piDate;
	}

	public LocalDate getValidUntil() {
		return validUntil;
	}

	public Integer getRevisionNo() {
		return revisionNo;
	}

	public ProformaStatus getStatus() {
		return status;
	}

	public Long getCustomerId() {
		return customerId;
	}

	public String getCustomerCode() {
		return customerCode;
	}

	public String getCustomerName() {
		return customerName;
	}

	public String getCustomerTrn() {
		return customerTrn;
	}

	public String getQuotationNo() {
		return quotationNo;
	}

	public String getSalesOrderNo() {
		return salesOrderNo;
	}

	public Warehouse getWarehouse() {
		return warehouse;
	}

	public BigDecimal getSubTotal() {
		return subTotal;
	}

	public BigDecimal getBillDiscount() {
		return billDiscount;
	}

	public void setBillDiscount(BigDecimal billDiscount) {
		this.billDiscount = billDiscount;
	}

	public BigDecimal getTaxTotal() {
		return taxTotal;
	}

	public BigDecimal getGrandTotal() {
		return grandTotal;
	}

	public Boolean getTaxInclusive() {
		return taxInclusive;
	}

	public void setTaxInclusive(Boolean taxInclusive) {
		this.taxInclusive = taxInclusive;
	}

	public BigDecimal getAdvancePaid() {
		return advancePaid;
	}

	public BigDecimal getBalanceDue() {
		return balanceDue;
	}

	public String getPaymentMethod() {
		return paymentMethod;
	}

	public String getPaymentReference() {
		return paymentReference;
	}

	public String getPaymentNotes() {
		return paymentNotes;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getIssuedAt() {
		return issuedAt;
	}

	

	public void setId(Long id) {
		this.id = id;
	}

	public void setPiNumber(String piNumber) {
		this.piNumber = piNumber;
	}

	public void setPiDate(LocalDate piDate) {
		this.piDate = piDate;
	}

	public void setValidUntil(LocalDate validUntil) {
		this.validUntil = validUntil;
	}

	public void setRevisionNo(Integer revisionNo) {
		this.revisionNo = revisionNo;
	}

	public void setStatus(ProformaStatus status) {
		this.status = status;
	}

	public void setCustomerId(Long customerId) {
		this.customerId = customerId;
	}

	public void setCustomerCode(String customerCode) {
		this.customerCode = customerCode;
	}

	public void setCustomerName(String customerName) {
		this.customerName = customerName;
	}

	public void setCustomerTrn(String customerTrn) {
		this.customerTrn = customerTrn;
	}

	public void setQuotationNo(String quotationNo) {
		this.quotationNo = quotationNo;
	}

	public void setSalesOrderNo(String salesOrderNo) {
		this.salesOrderNo = salesOrderNo;
	}

	public void setWarehouse(Warehouse warehouse) {
		this.warehouse = warehouse;
	}

	public void setSubTotal(BigDecimal subTotal) {
		this.subTotal = subTotal;
	}

	public void setTaxTotal(BigDecimal taxTotal) {
		this.taxTotal = taxTotal;
	}

	public void setGrandTotal(BigDecimal grandTotal) {
		this.grandTotal = grandTotal;
	}

	public void setAdvancePaid(BigDecimal advancePaid) {
		this.advancePaid = advancePaid;
	}

	public void setBalanceDue(BigDecimal balanceDue) {
		this.balanceDue = balanceDue;
	}

	public void setPaymentMethod(String paymentMethod) {
		this.paymentMethod = paymentMethod;
	}

	public void setPaymentReference(String paymentReference) {
		this.paymentReference = paymentReference;
	}

	public void setPaymentNotes(String paymentNotes) {
		this.paymentNotes = paymentNotes;
	}

	public void setCreatedAt(LocalDateTime createdAt) {
		this.createdAt = createdAt;
	}

	public void setIssuedAt(LocalDateTime issuedAt) {
		this.issuedAt = issuedAt;
	}

	public List<ProformaInvoiceItem> getItems() {
		return items;
	}

	public void setItems(List<ProformaInvoiceItem> items) {
		this.items = items;
	}

	

    // getters & setters

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
