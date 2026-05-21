package com.billbull.backend.sales.quotation;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sales_quotations")
public class Quotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String qtnNo;

    private String customer;
    private String customerCode;
    private String customerMobile;
    private String customerEmail;
    private LocalDate date;
    private LocalDate validTill;
    private String currency;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private String branchLocation;

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

    private BigDecimal subTotal;
    private BigDecimal taxAmount;
    private BigDecimal totalAmount;
    private BigDecimal billDiscount;

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

    public BigDecimal getSubTotal() { return subTotal; }
    public void setSubTotal(BigDecimal subTotal) { this.subTotal = subTotal; }

    public BigDecimal getTaxAmount() { return taxAmount; }
    public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public BigDecimal getBillDiscount() { return billDiscount; }
    public void setBillDiscount(BigDecimal billDiscount) { this.billDiscount = billDiscount; }

    public List<QuotationItem> getItems() { return items; }
    public void setItems(List<QuotationItem> items) { this.items = items; }

    public List<QuotationAttachment> getAttachments() { return attachments; }
    public void setAttachments(List<QuotationAttachment> attachments) { this.attachments = attachments; }

    public List<QuotationRevision> getRevisions() { return revisions; }
    public void setRevisions(List<QuotationRevision> revisions) { this.revisions = revisions; }
}
