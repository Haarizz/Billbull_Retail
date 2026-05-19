package com.billbull.backend.customer.inquiries;

import java.time.LocalDate;
import java.util.List;

public class CustomerInquiryRequestDto {

    private String customer;
    private String mobile;
    private String email;
    private String branch;
    private String source;
    private String category;
    private String priority;
    private String notes;
    private String assignedTo;
    private String status;
    private Long convertedQuotationId;
    private String convertedQuotationNo;
    private LocalDate convertedDate;
    private List<InquiryItemRequest> items;

    // Getters & Setters
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

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
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

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(String assignedTo) {
        this.assignedTo = assignedTo;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
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

    public List<InquiryItemRequest> getItems() {
        return items;
    }

    public void setItems(List<InquiryItemRequest> items) {
        this.items = items;
    }
}
