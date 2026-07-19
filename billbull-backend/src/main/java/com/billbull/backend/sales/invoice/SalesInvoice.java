package com.billbull.backend.sales.invoice;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "sales_invoices", indexes = {
    @Index(name = "idx_sales_invoice_branch",        columnList = "branch_id"),
    @Index(name = "idx_sales_invoice_date",          columnList = "invoice_date"),
    @Index(name = "idx_sales_invoice_customer",      columnList = "customer_code"),
    @Index(name = "idx_sales_invoice_status",        columnList = "status"),
    @Index(name = "idx_sales_invoice_customer_due",  columnList = "customer_code, delivery_date"),
    @Index(name = "idx_sales_invoice_number",        columnList = "invoice_number")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
@EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class SalesInvoice implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "created_at", updatable = false)
    @org.hibernate.annotations.CreationTimestamp
    private LocalDateTime createdAt;

    /** Stable owner id for user-based data visibility (ownership filtering). Stamped on persist by
     *  {@link com.billbull.backend.common.ownership.OwnershipAuditListener}. Nullable forever. */
    @Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @Column(unique = true)
    private String invoiceNumber;

    private LocalDate invoiceDate;

    @Column(name = "sales_channel", length = 50)
    private String salesChannel;

    @Column(name = "is_fast_sale", columnDefinition = "boolean default false")
    private boolean isFastSale = false;

    @Column(name = "delivery_date")
    private LocalDate dueDate;

    private String customerCode;
    private String customerName;

    private String linkedSalesOrder;
    private String linkedDeliveryNote;
    private String linkedProforma;
    private String linkedQuotation;

    @Column(length = 1000)
    private String shippingAddress;

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

    @Column(precision = 15, scale = 2)
    private BigDecimal subTotal;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxTotal;
    @Column(precision = 15, scale = 2)
    private BigDecimal invoiceTotal;

    @Column(precision = 15, scale = 2)
    private BigDecimal amountPaid;
    @Column(precision = 15, scale = 2)
    private BigDecimal balance;
    /** Bill-level discount as a PERCENTAGE rate (not money) — paired with {@link #billDiscountAmount}. */
    private Double billDiscount;

    @Column(name = "bill_discount_amount", precision = 15, scale = 2)
    private BigDecimal billDiscountAmount;

    @Column(name = "bill_discount_type", length = 20)
    private String billDiscountType;

    /** Flat delivery/shipping charge added to the invoice total (no VAT applied). */
    @Column(precision = 15, scale = 2)
    private BigDecimal deliveryCharge;

    /** Flat shipping charge added to the invoice total (no VAT applied). Kept distinct
     *  from deliveryCharge so a sale can show "Shipping" separately from "Delivery". */
    @Column(name = "shipping_charge", precision = 15, scale = 2)
    private BigDecimal shippingCharge;

    /** True when line prices already include VAT (Inclusive mode); VAT is then
     *  extracted from the price rather than added on top. Persisted per-invoice so
     *  historical receipts/reports recompute against the mode used at sale time. */
    @Column(name = "tax_inclusive")
    private Boolean taxInclusive = Boolean.FALSE;

    /** Manual rounding adjustment (+/-) applied to the invoice total. */
    @Column(precision = 15, scale = 2)
    private BigDecimal roundOff;

    /**
     * Customer's credit limit (copied from Customer record at invoice creation, or
     * entered manually). Used by the credit-limit enforcement policy in Sales
     * Settings.
     * A value of 0 or null means no limit is configured.
     */
    @Column(precision = 15, scale = 2)
    private BigDecimal creditLimit;

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

    @Column(name = "pos_session_id")
    private Long posSessionId;

    @Column(name = "pos_terminal_id", length = 100)
    private String posTerminalId;

    @Column(name = "pos_checkout_key", length = 100, unique = true)
    private String posCheckoutKey;

    @Column(name = "pos_counter_name", length = 100)
    private String posCounterName;

    @Column(name = "pos_driver_name", length = 200)
    private String posDriverName;

    @Column(name = "pos_driver_employee_id")
    private Long posDriverEmployeeId;

    @Column(name = "pos_driver_employee_code", length = 100)
    private String posDriverEmployeeCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_driver_employee_id", insertable = false, updatable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Employee posDriverEmployee;

    @Column(name = "pos_delivery_notes", length = 1000)
    private String posDeliveryNotes;

    /** ZATCA Phase-1 TLV base64 QR stored at checkout time for receipt archival and reprint. */
    @Column(name = "pos_receipt_qr", length = 500)
    private String posReceiptQr;

    @Enumerated(EnumType.STRING)
    private DeliveryStatus deliveryStatus = DeliveryStatus.PENDING;

    /** How many times this invoice's receipt has been reprinted (POS "Reprint Previous Invoices"). */
    @Column(name = "reprint_count", nullable = false, columnDefinition = "integer default 0")
    private Integer reprintCount = 0;

    @Column(name = "last_reprinted_by", length = 255)
    private String lastReprintedBy;

    /** True UTC instant (not server-local wall-clock) so every viewer's browser
     *  renders it in their own local timezone rather than the server's. */
    @Column(name = "last_reprinted_at")
    private Instant lastReprintedAt;

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

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
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

    public String getSalesChannel() {
        return salesChannel;
    }

    public void setSalesChannel(String salesChannel) {
        this.salesChannel = salesChannel;
    }

    public boolean isFastSale() {
        return isFastSale;
    }

    public void setFastSale(boolean fastSale) {
        isFastSale = fastSale;
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

    public String getShippingAddress() {
        return shippingAddress;
    }

    public void setShippingAddress(String shippingAddress) {
        this.shippingAddress = shippingAddress;
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

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(BigDecimal taxTotal) {
        this.taxTotal = taxTotal;
    }

    public BigDecimal getInvoiceTotal() {
        return invoiceTotal;
    }

    public void setInvoiceTotal(BigDecimal invoiceTotal) {
        this.invoiceTotal = invoiceTotal;
    }

    public BigDecimal getAmountPaid() {
        return amountPaid;
    }

    public void setAmountPaid(BigDecimal amountPaid) {
        this.amountPaid = amountPaid;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    public Double getBillDiscount() {
        return billDiscount;
    }

    public void setBillDiscount(Double billDiscount) {
        this.billDiscount = billDiscount;
    }

    public BigDecimal getBillDiscountAmount() {
        return billDiscountAmount;
    }

    public void setBillDiscountAmount(BigDecimal billDiscountAmount) {
        this.billDiscountAmount = billDiscountAmount;
    }

    public String getBillDiscountType() {
        return billDiscountType;
    }

    public void setBillDiscountType(String billDiscountType) {
        this.billDiscountType = billDiscountType;
    }

    public BigDecimal getDeliveryCharge() {
        return deliveryCharge;
    }

    public void setDeliveryCharge(BigDecimal deliveryCharge) {
        this.deliveryCharge = deliveryCharge;
    }

    public BigDecimal getShippingCharge() {
        return shippingCharge;
    }

    public void setShippingCharge(BigDecimal shippingCharge) {
        this.shippingCharge = shippingCharge;
    }

    public Boolean getTaxInclusive() {
        return taxInclusive;
    }

    public void setTaxInclusive(Boolean taxInclusive) {
        this.taxInclusive = taxInclusive;
    }

    public BigDecimal getRoundOff() {
        return roundOff;
    }

    public void setRoundOff(BigDecimal roundOff) {
        this.roundOff = roundOff;
    }

    public BigDecimal getCreditLimit() {
        return creditLimit;
    }

    public void setCreditLimit(BigDecimal creditLimit) {
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

    public Long getPosSessionId() { return posSessionId; }
    public void setPosSessionId(Long posSessionId) { this.posSessionId = posSessionId; }

    public String getPosTerminalId() { return posTerminalId; }
    public void setPosTerminalId(String posTerminalId) { this.posTerminalId = posTerminalId; }
    public String getPosCheckoutKey() { return posCheckoutKey; }
    public void setPosCheckoutKey(String posCheckoutKey) { this.posCheckoutKey = posCheckoutKey; }

    public String getPosCounterName() { return posCounterName; }
    public void setPosCounterName(String posCounterName) { this.posCounterName = posCounterName; }

    public String getPosDriverName() { return posDriverName; }
    public void setPosDriverName(String posDriverName) { this.posDriverName = posDriverName; }

    public Long getPosDriverEmployeeId() { return posDriverEmployeeId; }
    public void setPosDriverEmployeeId(Long posDriverEmployeeId) { this.posDriverEmployeeId = posDriverEmployeeId; }

    public String getPosDriverEmployeeCode() { return posDriverEmployeeCode; }
    public void setPosDriverEmployeeCode(String posDriverEmployeeCode) { this.posDriverEmployeeCode = posDriverEmployeeCode; }

    public Employee getPosDriverEmployee() { return posDriverEmployee; }
    public void setPosDriverEmployee(Employee posDriverEmployee) { this.posDriverEmployee = posDriverEmployee; }

    public String getPosDeliveryNotes() { return posDeliveryNotes; }
    public void setPosDeliveryNotes(String posDeliveryNotes) { this.posDeliveryNotes = posDeliveryNotes; }

    public String getPosReceiptQr() { return posReceiptQr; }
    public void setPosReceiptQr(String posReceiptQr) { this.posReceiptQr = posReceiptQr; }

    public DeliveryStatus getDeliveryStatus() {
        return deliveryStatus;
    }

    public void setDeliveryStatus(DeliveryStatus deliveryStatus) {
        this.deliveryStatus = deliveryStatus;
    }

    public Integer getReprintCount() {
        return reprintCount;
    }

    public void setReprintCount(Integer reprintCount) {
        this.reprintCount = reprintCount;
    }

    public String getLastReprintedBy() {
        return lastReprintedBy;
    }

    public void setLastReprintedBy(String lastReprintedBy) {
        this.lastReprintedBy = lastReprintedBy;
    }

    public Instant getLastReprintedAt() {
        return lastReprintedAt;
    }

    public void setLastReprintedAt(Instant lastReprintedAt) {
        this.lastReprintedAt = lastReprintedAt;
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
