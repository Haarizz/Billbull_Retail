package com.billbull.backend.sales.invoice;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "sales_invoices", indexes = {
    @Index(name = "idx_sales_invoice_branch", columnList = "branch_id")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class SalesInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String invoiceNumber;

    private LocalDate invoiceDate;

    @Column(name = "delivery_date")
    private LocalDate dueDate;

    private String customerCode;
    private String customerName;

    private String linkedSalesOrder;
    private String linkedDeliveryNote;
    private String linkedProforma;
    private String linkedQuotation;

    private String paymentMode;
    private String paymentTerms;
    private String salesperson;
    private String branch;
    @Column(name = "branch_id")
    private Long branchId;
    private String branchName;
    private String branchCode;

    /** Navigable view of {@link #branchId}. Read-only — writes go through {@link #setBranchId(Long)}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", insertable = false, updatable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branchEntity;

    private Double subTotal;
    private Double taxTotal;
    private Double invoiceTotal;

    private Double amountPaid;
    private Double balance;
    private Double billDiscount;

    /**
     * Customer's credit limit (copied from Customer record at invoice creation, or
     * entered manually). Used by the credit-limit enforcement policy in Sales
     * Settings.
     * A value of 0 or null means no limit is configured.
     */
    private Double creditLimit;

    @Column(length = 1000)
    private String customerNotes;

    @Column(length = 1000)
    private String internalNotes;

    @Enumerated(EnumType.STRING)
    private SalesInvoiceStatus status;

    /**
     * Whether line prices on this invoice are entered VAT-exclusive (tax
     * added on top) or VAT-inclusive (tax extracted out of the line).
     * Default EXCLUSIVE preserves legacy behaviour.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12, columnDefinition = "varchar(12) default 'EXCLUSIVE'")
    private com.billbull.backend.sales.common.VatMode vatMode
            = com.billbull.backend.sales.common.VatMode.EXCLUSIVE;

    @Enumerated(EnumType.STRING)
    private SalesType salesType = SalesType.STANDARD_FLOW;

    @Enumerated(EnumType.STRING)
    private DeliveryStatus deliveryStatus = DeliveryStatus.PENDING;

    @Transient
    private Boolean requirePickingNote = Boolean.TRUE;

    @Transient
    private String requestedFulfillmentType = "Picking";

    @OneToMany(mappedBy = "salesInvoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    private List<SalesInvoiceItem> items;

    /* ===== GETTERS & SETTERS ===== */

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

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public String getCustomerCode() {
        return customerCode;
    }

    public void setCustomerCode(String customerCode) {
        this.customerCode = customerCode;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getLinkedSalesOrder() {
        return linkedSalesOrder;
    }

    public void setLinkedSalesOrder(String linkedSalesOrder) {
        this.linkedSalesOrder = linkedSalesOrder;
    }

    public String getLinkedDeliveryNote() {
        return linkedDeliveryNote;
    }

    public void setLinkedDeliveryNote(String linkedDeliveryNote) {
        this.linkedDeliveryNote = linkedDeliveryNote;
    }

    public String getLinkedProforma() {
        return linkedProforma;
    }

    public void setLinkedProforma(String linkedProforma) {
        this.linkedProforma = linkedProforma;
    }

    public String getLinkedQuotation() {
        return linkedQuotation;
    }

    public void setLinkedQuotation(String linkedQuotation) {
        this.linkedQuotation = linkedQuotation;
    }

    public com.billbull.backend.sales.common.VatMode getVatMode() {
        return vatMode;
    }

    public void setVatMode(com.billbull.backend.sales.common.VatMode vatMode) {
        this.vatMode = vatMode;
    }

    public String getPaymentMode() {
        return paymentMode;
    }

    public void setPaymentMode(String paymentMode) {
        this.paymentMode = paymentMode;
    }

    public String getPaymentTerms() {
        return paymentTerms;
    }

    public void setPaymentTerms(String paymentTerms) {
        this.paymentTerms = paymentTerms;
    }

    public String getSalesperson() {
        return salesperson;
    }

    public void setSalesperson(String salesperson) {
        this.salesperson = salesperson;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
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

    public Double getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(Double subTotal) {
        this.subTotal = subTotal;
    }

    public Double getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(Double taxTotal) {
        this.taxTotal = taxTotal;
    }

    public Double getInvoiceTotal() {
        return invoiceTotal;
    }

    public void setInvoiceTotal(Double invoiceTotal) {
        this.invoiceTotal = invoiceTotal;
    }

    public Double getAmountPaid() {
        return amountPaid;
    }

    public void setAmountPaid(Double amountPaid) {
        this.amountPaid = amountPaid;
    }

    public Double getBalance() {
        return balance;
    }

    public void setBalance(Double balance) {
        this.balance = balance;
    }

    public Double getBillDiscount() {
        return billDiscount;
    }

    public void setBillDiscount(Double billDiscount) {
        this.billDiscount = billDiscount;
    }

    public Double getCreditLimit() {
        return creditLimit;
    }

    public void setCreditLimit(Double creditLimit) {
        this.creditLimit = creditLimit;
    }

    public String getCustomerNotes() {
        return customerNotes;
    }

    public void setCustomerNotes(String customerNotes) {
        this.customerNotes = customerNotes;
    }

    public String getInternalNotes() {
        return internalNotes;
    }

    public void setInternalNotes(String internalNotes) {
        this.internalNotes = internalNotes;
    }

    public SalesInvoiceStatus getStatus() {
        return status;
    }

    public void setStatus(SalesInvoiceStatus status) {
        this.status = status;
    }

    public List<SalesInvoiceItem> getItems() {
        return items;
    }

    public void setItems(List<SalesInvoiceItem> items) {
        this.items = items;
    }

    public SalesType getSalesType() {
        return salesType;
    }

    public void setSalesType(SalesType salesType) {
        this.salesType = salesType;
    }

    public DeliveryStatus getDeliveryStatus() {
        return deliveryStatus;
    }

    public void setDeliveryStatus(DeliveryStatus deliveryStatus) {
        this.deliveryStatus = deliveryStatus;
    }

    public Boolean getRequirePickingNote() {
        return requirePickingNote;
    }

    public void setRequirePickingNote(Boolean requirePickingNote) {
        this.requirePickingNote = requirePickingNote;
    }

    public String getRequestedFulfillmentType() {
        return requestedFulfillmentType;
    }

    public void setRequestedFulfillmentType(String requestedFulfillmentType) {
        this.requestedFulfillmentType = requestedFulfillmentType;
    }
}
