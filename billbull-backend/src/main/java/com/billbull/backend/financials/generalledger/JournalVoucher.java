package com.billbull.backend.financials.generalledger;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import java.time.LocalDateTime;

@Entity
@DiscriminatorValue("MANUAL")
public class JournalVoucher extends JournalEntry {

    private String approvedBy;
    private LocalDateTime approvedAt;
    private String rejectionReason;

    public JournalVoucher() {
        super();
    }

    // Getters and Setters for JV specific fields (workflow)
    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public LocalDateTime getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(LocalDateTime approvedAt) {
        this.approvedAt = approvedAt;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }
}
