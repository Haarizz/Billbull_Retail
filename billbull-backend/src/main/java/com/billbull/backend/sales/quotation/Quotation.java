package com.billbull.backend.sales.quotation;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sales_quotations", indexes = {
    @Index(name = "idx_quotation_branch", columnList = "branch_id")
})
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class Quotation  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @Column(unique = true, nullable = false)
    private String qtnNo;

    private String customer;
    private String customerCode;
    private String customerMobile;
    private String customerEmail;
    private LocalDate date;
    private LocalDate validTill;
    private String currency;
    @Column(name = "branch_id")
    private Long branchId;
    private String branchName;
    private String branchCode;
    private String branchLocation;

    /** Navigable view of {@link #branchId}. Read-only — writes go through {@link #setBranchId(Long)}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", insertable = false, updatable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branchEntity;

    @Column(name = "source_inquiry_id")
    private Long sourceInquiryId;

    @Column(name = "source_inquiry_number")
    private String sourceInquiryNumber;

    private String paymentTerms;
    private String deliveryType;
    private LocalDate expectedDispatch;

    @Column(length = 1000)
    private String shippingAddress;

    @Column(length = 1000)
    private String notesToCustomer;

    @Column(length = 1000)
    private String internalNotes;

    @Enumerated(EnumType.STRING)
    private QuotationStatus status = QuotationStatus.DRAFT;

    /**
     * Whether line prices on this quotation are entered VAT-exclusive (tax is
     * added on top) or VAT-inclusive (tax is extracted out of the price).
     * Default EXCLUSIVE preserves legacy behaviour for existing rows.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12, columnDefinition = "varchar(12) default 'EXCLUSIVE'")
    private com.billbull.backend.sales.common.VatMode vatMode
            = com.billbull.backend.sales.common.VatMode.EXCLUSIVE;

    private BigDecimal subTotal;
    private BigDecimal taxAmount;
    private BigDecimal totalAmount;
    private BigDecimal billDiscount;

    @Column(name = "bill_discount_amount")
    private BigDecimal billDiscountAmount;

    @Column(name = "bill_discount_type", length = 20)
    private String billDiscountType;

    // ---------------- RELATIONSHIPS ----------------

    @JsonManagedReference
    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<QuotationItem> items = new ArrayList<>();

    @JsonManagedReference
    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<QuotationAttachment> attachments = new ArrayList<>();

    @JsonManagedReference
    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL)
    private List<QuotationRevision> revisions = new ArrayList<>();

    public Quotation() {}

    // ---------------- GETTERS & SETTERS ----------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getQtnNo() { return qtnNo; }
    public void setQtnNo(String qtnNo) { this.qtnNo = qtnNo; }

    public String getCustomer() { return customer; }
    public void setCustomer(String customer) { this.customer = customer; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

    public String getCustomerMobile() { return customerMobile; }
    public void setCustomerMobile(String customerMobile) { this.customerMobile = customerMobile; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }

    public LocalDate getValidTill() { return validTill; }
    public void setValidTill(LocalDate validTill) { this.validTill = validTill; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }

    public Branch getBranchEntity() { return branchEntity; }

    public String getBranchLocation() { return branchLocation; }
    public void setBranchLocation(String branchLocation) { this.branchLocation = branchLocation; }

    public Long getSourceInquiryId() { return sourceInquiryId; }
    public void setSourceInquiryId(Long sourceInquiryId) { this.sourceInquiryId = sourceInquiryId; }

    public String getSourceInquiryNumber() { return sourceInquiryNumber; }
    public void setSourceInquiryNumber(String sourceInquiryNumber) { this.sourceInquiryNumber = sourceInquiryNumber; }

    public String getPaymentTerms() { return paymentTerms; }
    public void setPaymentTerms(String paymentTerms) { this.paymentTerms = paymentTerms; }

    public String getDeliveryType() { return deliveryType; }
    public void setDeliveryType(String deliveryType) { this.deliveryType = deliveryType; }

    public LocalDate getExpectedDispatch() { return expectedDispatch; }
    public void setExpectedDispatch(LocalDate expectedDispatch) { this.expectedDispatch = expectedDispatch; }

    public String getShippingAddress() { return shippingAddress; }
    public void setShippingAddress(String shippingAddress) { this.shippingAddress = shippingAddress; }

    public String getNotesToCustomer() { return notesToCustomer; }
    public void setNotesToCustomer(String notesToCustomer) { this.notesToCustomer = notesToCustomer; }

    public String getInternalNotes() { return internalNotes; }
    public void setInternalNotes(String internalNotes) { this.internalNotes = internalNotes; }

    public QuotationStatus getStatus() { return status; }
    public void setStatus(QuotationStatus status) { this.status = status; }

    public com.billbull.backend.sales.common.VatMode getVatMode() { return vatMode; }
    public void setVatMode(com.billbull.backend.sales.common.VatMode vatMode) { this.vatMode = vatMode; }

    public BigDecimal getSubTotal() { return subTotal; }
    public void setSubTotal(BigDecimal subTotal) { this.subTotal = subTotal; }

    public BigDecimal getTaxAmount() { return taxAmount; }
    public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public BigDecimal getBillDiscount() { return billDiscount; }
    public void setBillDiscount(BigDecimal billDiscount) { this.billDiscount = billDiscount; }

    public BigDecimal getBillDiscountAmount() { return billDiscountAmount; }
    public void setBillDiscountAmount(BigDecimal billDiscountAmount) { this.billDiscountAmount = billDiscountAmount; }

    public String getBillDiscountType() { return billDiscountType; }
    public void setBillDiscountType(String billDiscountType) { this.billDiscountType = billDiscountType; }

    public List<QuotationItem> getItems() { return items; }
    public void setItems(List<QuotationItem> items) { this.items = items; }

    public List<QuotationAttachment> getAttachments() { return attachments; }
    public void setAttachments(List<QuotationAttachment> attachments) { this.attachments = attachments; }

    public List<QuotationRevision> getRevisions() { return revisions; }
    public void setRevisions(List<QuotationRevision> revisions) { this.revisions = revisions; }

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
