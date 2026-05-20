package com.billbull.backend.customer.inquiries;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "customer_inquiries")
public class CustomerInquiry extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String customer;
    private String mobile;
    private String email;
    private String branch;
    private String source;
    private String category;
    private String priority;
    private String status;
    private String assignedTo;
    
    @Column(name = "inquiry_number")
    private String inquiryNumber;

    @Column(name = "converted_quotation_id")
    private Long convertedQuotationId;

    @Column(name = "converted_quotation_no")
    private String convertedQuotationNo;

    @Column(name = "converted_date")
    private LocalDate convertedDate;

    @Column(length = 1000)
    private String notes;

    private LocalDate createdDate;
    
    @Column(name = "follow_up_date")
    private LocalDate followUpDate;

    @Column(name = "follow_up_time")
    private LocalTime followUpTime;

    @OneToMany(mappedBy = "inquiry", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InquiryFollowUp> followUps = new ArrayList<>();

    @OneToMany(mappedBy = "inquiry", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InquiryItem> items = new ArrayList<>();

    // ===== Getters & Setters =====

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public void setId(Long id) {
        this.id = id;
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

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public LocalDate getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(LocalDate createdDate) {
        this.createdDate = createdDate;
    }

    public List<InquiryFollowUp> getFollowUps() {
        return followUps;
    }

    public void setFollowUps(List<InquiryFollowUp> followUps) {
        this.followUps = followUps;
    }

    public List<InquiryItem> getItems() {
        return items;
    }

    public void setItems(List<InquiryItem> items) {
        this.items = items;
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
}
