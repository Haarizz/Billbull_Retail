package com.billbull.backend.customer.inquiries;

import java.time.LocalDate;
import java.time.LocalTime;

public class FollowUpRequestDto {

    private String type;
    private String summary;
    private LocalDate nextFollowUpDate;
    private LocalTime nextFollowUpTime;
    private String status;

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
}
