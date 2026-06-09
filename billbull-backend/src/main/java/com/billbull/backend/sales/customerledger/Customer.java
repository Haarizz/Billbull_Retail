package com.billbull.backend.sales.customerledger;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(
    name = "customers",
    indexes = { @Index(name = "idx_customer_branch", columnList = "branch_id") }
)
public class Customer {

    public Customer() {} // ✅ REQUIRED BY JPA

    // =========================
    // PRIMARY KEY
    // =========================
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String code;

    // =========================
    // BASIC DETAILS
    // =========================
    private String groupType;
    private String name;
    private String localName;
    private String trn;
    private String status;

    private String mobile;
    private String phone;
    private String email;
    private String whatsapp;

    private String country;
    private String city;
    private String postalCode;

    // =========================
    // PAYMENT / CREDIT
    // =========================
    private String payMode;
    private String payTerms;

    /** FK to PaymentTerms master. Drives due-date calculation and settlement-discount suggestion. */
    @Column(name = "payment_terms_id")
    private Long paymentTermsId;
    private Integer creditLimitDays;
    private BigDecimal creditLimitAmount;
    private Integer maxCreditInvoices;
    private BigDecimal discountLimitPercent;
    private BigDecimal discountLimitAmount;
    private String creditStatus;
    private Boolean blockCredit;

    // =========================
    // BUSINESS
    // =========================
    private String priceList;
    private String currency;
    private String salesman;
    private String taxGroup;
    /** Legacy free-text branch label; kept until all callers migrate to {@link #branchEntity}. */
    private String branch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branchEntity;

    private String warehouse;

    @Column(length = 1000)
    private String billingAddress;

    @Column(length = 1000)
    private String defaultShippingAddress;

    @Column(length = 1000)
    private String notes;

    // =========================
    // MEDIA
    // =========================
    @Lob
    @Column
    private String avatar;

    // =========================
    // BALANCES
    // =========================
    private BigDecimal balance = BigDecimal.ZERO;
    private BigDecimal totalSales = BigDecimal.ZERO;

    /** Computed at list-load time: openingBalance + invoiceTotal - receipts. Not persisted. */
    @jakarta.persistence.Transient
    private BigDecimal currentBalance;

    // =========================
    // RELATIONSHIPS (IGNORED IN JSON)
    // =========================

    @OneToMany(
            mappedBy = "customer",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY
    )
    private List<SavedAddress> savedAddresses = new ArrayList<>();

    @OneToMany(
            mappedBy = "customer",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY
    )
    @JsonIgnore
    private List<OpeningInvoice> openingInvoices = new ArrayList<>();

    @OneToMany(
            mappedBy = "customer",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY
    )
    @JsonIgnore
    private List<ContactPerson> contactPersons = new ArrayList<>();

    @OneToMany(
            mappedBy = "customer",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY
    )
    @JsonIgnore
    private List<CustomerDocument> documents = new ArrayList<>();

    @OneToMany(
            mappedBy = "customer",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY
    )
    @JsonIgnore
    private List<CustomerBranchAllocation> branchAllocations = new ArrayList<>();

    // =========================
    // GETTERS & SETTERS
    // =========================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getGroupType() { return groupType; }
    public void setGroupType(String groupType) { this.groupType = groupType; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }

    public String getTrn() { return trn; }
    public void setTrn(String trn) { this.trn = trn; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getWhatsapp() { return whatsapp; }
    public void setWhatsapp(String whatsapp) { this.whatsapp = whatsapp; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getPostalCode() { return postalCode; }
    public void setPostalCode(String postalCode) { this.postalCode = postalCode; }

    public String getPayMode() { return payMode; }
    public void setPayMode(String payMode) { this.payMode = payMode; }

    public String getPayTerms() { return payTerms; }
    public void setPayTerms(String payTerms) { this.payTerms = payTerms; }

    public Long getPaymentTermsId() { return paymentTermsId; }
    public void setPaymentTermsId(Long paymentTermsId) { this.paymentTermsId = paymentTermsId; }

    public Integer getCreditLimitDays() { return creditLimitDays; }
    public void setCreditLimitDays(Integer creditLimitDays) { this.creditLimitDays = creditLimitDays; }

    public BigDecimal getCreditLimitAmount() { return creditLimitAmount; }
    public void setCreditLimitAmount(BigDecimal creditLimitAmount) { this.creditLimitAmount = creditLimitAmount; }

    public Integer getMaxCreditInvoices() { return maxCreditInvoices; }
    public void setMaxCreditInvoices(Integer maxCreditInvoices) { this.maxCreditInvoices = maxCreditInvoices; }

    public BigDecimal getDiscountLimitPercent() { return discountLimitPercent; }
    public void setDiscountLimitPercent(BigDecimal discountLimitPercent) { this.discountLimitPercent = discountLimitPercent; }

    public BigDecimal getDiscountLimitAmount() { return discountLimitAmount; }
    public void setDiscountLimitAmount(BigDecimal discountLimitAmount) { this.discountLimitAmount = discountLimitAmount; }

    public String getCreditStatus() { return creditStatus; }
    public void setCreditStatus(String creditStatus) { this.creditStatus = creditStatus; }

    public Boolean getBlockCredit() { return blockCredit; }
    public void setBlockCredit(Boolean blockCredit) { this.blockCredit = blockCredit; }

    public String getPriceList() { return priceList; }
    public void setPriceList(String priceList) { this.priceList = priceList; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getSalesman() { return salesman; }
    public void setSalesman(String salesman) { this.salesman = salesman; }

    public String getTaxGroup() { return taxGroup; }
    public void setTaxGroup(String taxGroup) { this.taxGroup = taxGroup; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public Branch getBranchEntity() { return branchEntity; }
    public void setBranchEntity(Branch branchEntity) { this.branchEntity = branchEntity; }

    public String getWarehouse() { return warehouse; }
    public void setWarehouse(String warehouse) { this.warehouse = warehouse; }

    public String getBillingAddress() { return billingAddress; }
    public void setBillingAddress(String billingAddress) { this.billingAddress = billingAddress; }

    public String getDefaultShippingAddress() { return defaultShippingAddress; }
    public void setDefaultShippingAddress(String defaultShippingAddress) { this.defaultShippingAddress = defaultShippingAddress; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }

    public BigDecimal getBalance() { return balance; }
    public void setBalance(BigDecimal balance) { this.balance = balance; }

    public BigDecimal getTotalSales() { return totalSales; }
    public void setTotalSales(BigDecimal totalSales) { this.totalSales = totalSales; }

    public BigDecimal getCurrentBalance() { return currentBalance; }
    public void setCurrentBalance(BigDecimal currentBalance) { this.currentBalance = currentBalance; }

    public List<SavedAddress> getSavedAddresses() { return savedAddresses; }
    public void setSavedAddresses(List<SavedAddress> savedAddresses) { this.savedAddresses = savedAddresses; }

    public List<OpeningInvoice> getOpeningInvoices() { return openingInvoices; }
    public void setOpeningInvoices(List<OpeningInvoice> openingInvoices) { this.openingInvoices = openingInvoices; }

    public List<ContactPerson> getContactPersons() { return contactPersons; }
    public void setContactPersons(List<ContactPerson> contactPersons) { this.contactPersons = contactPersons; }

    public List<CustomerDocument> getDocuments() { return documents; }
    public void setDocuments(List<CustomerDocument> documents) { this.documents = documents; }

    public List<CustomerBranchAllocation> getBranchAllocations() { return branchAllocations; }
    public void setBranchAllocations(List<CustomerBranchAllocation> branchAllocations) { this.branchAllocations = branchAllocations; }
}