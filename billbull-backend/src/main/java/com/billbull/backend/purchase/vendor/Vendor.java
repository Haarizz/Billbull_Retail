package com.billbull.backend.purchase.vendor;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(
    name = "vendors",
    indexes = {
        @Index(name = "idx_vendor_branch", columnList = "branch_id")
    }
)
public class Vendor extends BaseEntity {

    // =========================
    // General
    // =========================
    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branch;

    private String status;        // Active, On Hold, Draft
    private String vendorGroup;   // Local Supplier, International Supplier
    private String vendorType;    // Manufacturer, Distributor
    private String category;
    private String country;

    private Boolean isPreferred = false;

    private String email;
    private String contact;

    // =========================
    // Contact
    // =========================
    private String prefComm;      // Email, Phone, WhatsApp
    private String priority;      // P1 - Critical, etc

    // =========================
    // Financial
    // =========================
    private String currency;
    private String payTerms;

    /** FK to PaymentTerms master. Drives due-date calculation and discount suggestion on vendor payments. */
    @Column(name = "payment_terms_id")
    private Long paymentTermsId;

    private String balType;
    private String payPref;
    private java.time.LocalDate openingBalanceDate;
    private String openingBalanceNotes;
    private String nickname;
    private String taxId;
    private String website;
    private String address;
    private String primaryPhone;
    private String secondaryPhone;
    private String mobile;
    private String whatsapp;
    private String secondaryEmail;
    private String commNotes;
    private java.math.BigDecimal creditLimit;
    private Integer creditDays;
    private Boolean autoBlockPo;
    private Boolean requireFinanceApproval;
    private String bankName;
    private String bankBranch;
    private String accountNumber;
    private String iban;
    private String swiftCode;
    private String beneficiaryName;


    // =========================
    // Opening Balance
    // =========================
    private BigDecimal openingBalance = BigDecimal.ZERO;

    // =========================
    // UI / Display-only
    // =========================
    private String leadTime = "1 day";
    private BigDecimal rating = BigDecimal.ZERO;
    private BigDecimal balance = BigDecimal.ZERO;
    
    
	public Vendor(String code, String name, String status, String vendorGroup, String vendorType, String category,
			String country, Boolean isPreferred, String email, String contact, String prefComm, String priority,
			String currency, String payTerms, String balType, String payPref, BigDecimal openingBalance,
			String leadTime, BigDecimal rating, BigDecimal balance) {
		super();
		this.code = code;
		this.name = name;
		this.status = status;
		this.vendorGroup = vendorGroup;
		this.vendorType = vendorType;
		this.category = category;
		this.country = country;
		this.isPreferred = isPreferred;
		this.email = email;
		this.contact = contact;
		this.prefComm = prefComm;
		this.priority = priority;
		this.currency = currency;
		this.payTerms = payTerms;
		this.balType = balType;
		this.payPref = payPref;
		this.openingBalance = openingBalance;
		this.leadTime = leadTime;
		this.rating = rating;
		this.balance = balance;
	}
	
	
	public Vendor() {
	}


	public String getCode() {
		return code;
	}
	public void setCode(String code) {
		this.code = code;
	}
	public String getName() {
		return name;
	}
	public void setName(String name) {
		this.name = name;
	}
	public Branch getBranch() { return branch; }
	public void setBranch(Branch branch) { this.branch = branch; }
	public String getStatus() {
		return status;
	}
	public void setStatus(String status) {
		this.status = status;
	}
	public String getVendorGroup() {
		return vendorGroup;
	}
	public void setVendorGroup(String vendorGroup) {
		this.vendorGroup = vendorGroup;
	}
	public String getVendorType() {
		return vendorType;
	}
	public void setVendorType(String vendorType) {
		this.vendorType = vendorType;
	}
	public String getCategory() {
		return category;
	}
	public void setCategory(String category) {
		this.category = category;
	}
	public String getCountry() {
		return country;
	}
	public void setCountry(String country) {
		this.country = country;
	}
	public Boolean getIsPreferred() {
		return isPreferred;
	}
	public void setIsPreferred(Boolean isPreferred) {
		this.isPreferred = isPreferred;
	}
	public String getEmail() {
		return email;
	}
	public void setEmail(String email) {
		this.email = email;
	}
	public String getContact() {
		return contact;
	}
	public void setContact(String contact) {
		this.contact = contact;
	}
	public String getPrefComm() {
		return prefComm;
	}
	public void setPrefComm(String prefComm) {
		this.prefComm = prefComm;
	}
	public String getPriority() {
		return priority;
	}
	public void setPriority(String priority) {
		this.priority = priority;
	}
	public String getCurrency() {
		return currency;
	}
	public void setCurrency(String currency) {
		this.currency = currency;
	}
	public String getPayTerms() {
		return payTerms;
	}
	public void setPayTerms(String payTerms) {
		this.payTerms = payTerms;
	}

	public Long getPaymentTermsId() { return paymentTermsId; }
	public void setPaymentTermsId(Long paymentTermsId) { this.paymentTermsId = paymentTermsId; }
	public String getBalType() {
		return balType;
	}
	public void setBalType(String balType) {
		this.balType = balType;
	}
	public String getPayPref() {
		return payPref;
	}
	public void setPayPref(String payPref) {
		this.payPref = payPref;
	}
	public BigDecimal getOpeningBalance() {
		return openingBalance;
	}
	public void setOpeningBalance(BigDecimal openingBalance) {
		this.openingBalance = openingBalance;
	}
	public String getLeadTime() {
		return leadTime;
	}
	public void setLeadTime(String leadTime) {
		this.leadTime = leadTime;
	}
	public BigDecimal getRating() {
		return rating;
	}
	public void setRating(BigDecimal rating) {
		this.rating = rating;
	}
	public BigDecimal getBalance() {
		return balance;
	}
	public void setBalance(BigDecimal balance) {
		this.balance = balance;
	}
    
    

    public java.time.LocalDate getOpeningBalanceDate() { return openingBalanceDate; }
    public void setOpeningBalanceDate(java.time.LocalDate openingBalanceDate) { this.openingBalanceDate = openingBalanceDate; }
    public String getOpeningBalanceNotes() { return openingBalanceNotes; }
    public void setOpeningBalanceNotes(String openingBalanceNotes) { this.openingBalanceNotes = openingBalanceNotes; }
    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public String getTaxId() { return taxId; }
    public void setTaxId(String taxId) { this.taxId = taxId; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getPrimaryPhone() { return primaryPhone; }
    public void setPrimaryPhone(String primaryPhone) { this.primaryPhone = primaryPhone; }
    public String getSecondaryPhone() { return secondaryPhone; }
    public void setSecondaryPhone(String secondaryPhone) { this.secondaryPhone = secondaryPhone; }
    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }
    public String getWhatsapp() { return whatsapp; }
    public void setWhatsapp(String whatsapp) { this.whatsapp = whatsapp; }
    public String getSecondaryEmail() { return secondaryEmail; }
    public void setSecondaryEmail(String secondaryEmail) { this.secondaryEmail = secondaryEmail; }
    public String getCommNotes() { return commNotes; }
    public void setCommNotes(String commNotes) { this.commNotes = commNotes; }
    public java.math.BigDecimal getCreditLimit() { return creditLimit; }
    public void setCreditLimit(java.math.BigDecimal creditLimit) { this.creditLimit = creditLimit; }
    public Integer getCreditDays() { return creditDays; }
    public void setCreditDays(Integer creditDays) { this.creditDays = creditDays; }
    public Boolean getAutoBlockPo() { return autoBlockPo; }
    public void setAutoBlockPo(Boolean autoBlockPo) { this.autoBlockPo = autoBlockPo; }
    public Boolean getRequireFinanceApproval() { return requireFinanceApproval; }
    public void setRequireFinanceApproval(Boolean requireFinanceApproval) { this.requireFinanceApproval = requireFinanceApproval; }
    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }
    public String getBankBranch() { return bankBranch; }
    public void setBankBranch(String bankBranch) { this.bankBranch = bankBranch; }
    public String getAccountNumber() { return accountNumber; }
    public void setAccountNumber(String accountNumber) { this.accountNumber = accountNumber; }
    public String getIban() { return iban; }
    public void setIban(String iban) { this.iban = iban; }
    public String getSwiftCode() { return swiftCode; }
    public void setSwiftCode(String swiftCode) { this.swiftCode = swiftCode; }
    public String getBeneficiaryName() { return beneficiaryName; }
    public void setBeneficiaryName(String beneficiaryName) { this.beneficiaryName = beneficiaryName; }
}
