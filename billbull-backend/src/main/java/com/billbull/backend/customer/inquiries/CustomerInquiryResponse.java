package com.billbull.backend.customer.inquiries;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public class CustomerInquiryResponse {

    private Long id;
    private Long customerId;
    private String customerCode;
    private String customer;
    private String mobile;
    private String email;
    private String address;
    private String branch;
    private String source;
    private String category;
    private String priority;
    private String status;
    private String assignedTo;
    private String inquiryNumber;
    private Long convertedQuotationId;
    private String convertedQuotationNo;
    private LocalDate convertedDate;
    private LocalDate createdDate;
    private LocalDate followUpDate;
    private LocalTime followUpTime;
    private List<InquiryFollowUpResponse> timeline;
    private List<InquiryItemResponse> items;
    private List<ActivityLogEntry> activityLog;

    // Getters & Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getCustomerId() {
        return customerId;
    }

    public void setCustomerId(Long customerId) {
        this.customerId = customerId;
    }

    public String getCustomerCode() {
        return customerCode;
    }

    public void setCustomerCode(String customerCode) {
        this.customerCode = customerCode;
    }

    public LocalDate getFollowUpDate() {
        return followUpDate;
    }

    public void setFollowUpDate(LocalDate followUpDate) {
        this.followUpDate = followUpDate;
    }

    public LocalTime getFollowUpTime() {
        return followUpTime;
    }

    public void setFollowUpTime(LocalTime followUpTime) {
        this.followUpTime = followUpTime;
    }

    public String getCustomer() {
        return customer;
    }

    public void setCustomer(String customer) {
        this.customer = customer;
    }

    public String getMobile() {
        return mobile;
    }

    public void setMobile(String mobile) {
        this.mobile = mobile;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public List<ActivityLogEntry> getActivityLog() {
        return activityLog;
    }

    public void setActivityLog(List<ActivityLogEntry> activityLog) {
        this.activityLog = activityLog;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(String assignedTo) {
        this.assignedTo = assignedTo;
    }

    public String getInquiryNumber() {
        return inquiryNumber;
    }

    public void setInquiryNumber(String inquiryNumber) {
        this.inquiryNumber = inquiryNumber;
    }

    public Long getConvertedQuotationId() {
        return convertedQuotationId;
    }

    public void setConvertedQuotationId(Long convertedQuotationId) {
        this.convertedQuotationId = convertedQuotationId;
    }

    public String getConvertedQuotationNo() {
        return convertedQuotationNo;
    }

    public void setConvertedQuotationNo(String convertedQuotationNo) {
        this.convertedQuotationNo = convertedQuotationNo;
    }

    public LocalDate getConvertedDate() {
        return convertedDate;
    }

    public void setConvertedDate(LocalDate convertedDate) {
        this.convertedDate = convertedDate;
    }

    public LocalDate getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(LocalDate createdDate) {
        this.createdDate = createdDate;
    }

    public List<InquiryFollowUpResponse> getTimeline() {
        return timeline;
    }

    public void setTimeline(List<InquiryFollowUpResponse> timeline) {
        this.timeline = timeline;
    }

    public List<InquiryItemResponse> getItems() {
        return items;
    }

    public void setItems(List<InquiryItemResponse> items) {
        this.items = items;
    }
}
