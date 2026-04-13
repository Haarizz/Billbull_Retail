package com.billbull.backend.purchase.vendor;


import java.math.BigDecimal;


public class VendorListResponse {

    private Long id;
    private String code;
    private String name;
    private String email;
    private String category;
    private String contact;
    private String leadTime;
    private BigDecimal rating;
    private BigDecimal balance;
    private BigDecimal openingBalance;
    private String status;
    private Boolean isPreferred;


	public VendorListResponse() {

	}


	public VendorListResponse(Long id, String code, String name, String email, String category, String contact,
			String leadTime, BigDecimal rating, BigDecimal balance, BigDecimal openingBalance, String status, Boolean isPreferred) {
		super();
		this.id = id;
		this.code = code;
		this.name = name;
		this.email = email;
		this.category = category;
		this.contact = contact;
		this.leadTime = leadTime;
		this.rating = rating;
		this.balance = balance;
		this.openingBalance = openingBalance;
		this.status = status;
		this.isPreferred = isPreferred;
	}


	public Long getId() {
		return id;
	}
	public void setId(Long id) {
		this.id = id;
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
	public String getEmail() {
		return email;
	}
	public void setEmail(String email) {
		this.email = email;
	}
	public String getCategory() {
		return category;
	}
	public void setCategory(String category) {
		this.category = category;
	}
	public String getContact() {
		return contact;
	}
	public void setContact(String contact) {
		this.contact = contact;
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
	public BigDecimal getOpeningBalance() {
		return openingBalance;
	}
	public void setOpeningBalance(BigDecimal openingBalance) {
		this.openingBalance = openingBalance;
	}
	public String getStatus() {
		return status;
	}
	public void setStatus(String status) {
		this.status = status;
	}
	public Boolean getIsPreferred() {
		return isPreferred;
	}
	public void setIsPreferred(Boolean isPreferred) {
		this.isPreferred = isPreferred;
	}
    
    
}
