package com.billbull.backend.purchase.vendor;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "vendors")

public class Vendor extends BaseEntity {

    // =========================
    // General
    // =========================
    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

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
    private String balType;
    private String payPref;

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
    
    
}
