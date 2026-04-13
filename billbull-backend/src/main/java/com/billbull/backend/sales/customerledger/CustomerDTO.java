package com.billbull.backend.sales.customerledger;

import java.math.BigDecimal;
import java.util.List;

public class CustomerDTO {
    private Long id;
    private String code;
    private String name;
    private String localName;
    private String group; // Frontend uses 'group'
    private String trn;
    private String status;
    private String mobile;
    private String phone;
    private String email;
    private String whatsapp;
    private String country;
    private String city;
    private String postalCode;
    
    private String payMode;
    private String payTerms;
    private Integer creditLimitDays;
    private BigDecimal creditLimitAmount;
    private Integer maxCreditInvoices;
    private BigDecimal discountLimitPercent;
    private BigDecimal discountLimitAmount;
    private String creditStatus;
    private Boolean blockCredit;
    
    private String priceList;
    private String currency;
    private String salesman;
    private String taxGroup;
    private String branch;
    private String warehouse;
    
    private String billingAddress;
    private String notes;
    private String avatar; // Base64 string from frontend
    private BigDecimal balance;
    
    private List<SavedAddress> savedAddresses;
    private List<OpeningInvoice> openingInvoices;
    private List<ContactPerson> contactPersons;
    private List<CustomerDocument> documents;

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }
    public String getGroup() { return group; }
    public void setGroup(String group) { this.group = group; }
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
    public String getWarehouse() { return warehouse; }
    public void setWarehouse(String warehouse) { this.warehouse = warehouse; }
    public String getBillingAddress() { return billingAddress; }
    public void setBillingAddress(String billingAddress) { this.billingAddress = billingAddress; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }
    public BigDecimal getBalance() { return balance; }
    public void setBalance(BigDecimal balance) { this.balance = balance; }
    public List<SavedAddress> getSavedAddresses() { return savedAddresses; }
    public void setSavedAddresses(List<SavedAddress> savedAddresses) { this.savedAddresses = savedAddresses; }
    public List<OpeningInvoice> getOpeningInvoices() { return openingInvoices; }
    public void setOpeningInvoices(List<OpeningInvoice> openingInvoices) { this.openingInvoices = openingInvoices; }
    public List<ContactPerson> getContactPersons() { return contactPersons; }
    public void setContactPersons(List<ContactPerson> contactPersons) { this.contactPersons = contactPersons; }
    public List<CustomerDocument> getDocuments() { return documents; }
    public void setDocuments(List<CustomerDocument> documents) { this.documents = documents; }
}