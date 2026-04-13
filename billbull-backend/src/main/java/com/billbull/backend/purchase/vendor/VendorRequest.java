package com.billbull.backend.purchase.vendor;

import java.math.BigDecimal;


public class VendorRequest {

    private String name;
    private String status;
    private String vendorGroup;
    private String vendorType;
    private String category;
    private String country;
    private Boolean isPreferred;

    private String email;
    private String contact;

    private String prefComm;
    private String priority;

    private String currency;
    private String payTerms;
    private String balType;
    private String payPref;

    private BigDecimal openingBalance;

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

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
    
    
}
