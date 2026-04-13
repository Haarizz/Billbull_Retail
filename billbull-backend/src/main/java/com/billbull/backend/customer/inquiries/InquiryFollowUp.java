package com.billbull.backend.customer.inquiries;

import java.time.LocalDate;
import java.time.LocalTime;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "inquiry_followups")
public class InquiryFollowUp extends BaseEntity{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String type;
    private String summary;
    private LocalDate nextFollowUpDate;
    private LocalTime nextFollowUpTime;
    private String status;

    @ManyToOne
    @JoinColumn(name = "inquiry_id", nullable = false)
    private CustomerInquiry inquiry;

    // ===== Getters & Setters =====

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public LocalDate getNextFollowUpDate() { return nextFollowUpDate; }
    public void setNextFollowUpDate(LocalDate nextFollowUpDate) { this.nextFollowUpDate = nextFollowUpDate; }

    public LocalTime getNextFollowUpTime() { return nextFollowUpTime; }
    public void setNextFollowUpTime(LocalTime nextFollowUpTime) { this.nextFollowUpTime = nextFollowUpTime; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public CustomerInquiry getInquiry() { return inquiry; }
    public void setInquiry(CustomerInquiry inquiry) { this.inquiry = inquiry; }
}
