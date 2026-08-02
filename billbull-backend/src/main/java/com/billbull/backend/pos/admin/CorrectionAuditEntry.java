package com.billbull.backend.pos.admin;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_correction_audit_entries")
public class CorrectionAuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "correction_request_id", nullable = false)
    private Long correctionRequestId;

    @Column(name = "action", length = 50, nullable = false)
    private String action;

    @Column(name = "actor", length = 100, nullable = false)
    private String actor;

    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    @Column(name = "notes", length = 1000)
    private String notes;

    public CorrectionAuditEntry() {
    }

    public CorrectionAuditEntry(Long correctionRequestId, String action, String actor, LocalDateTime timestamp, String notes) {
        this.correctionRequestId = correctionRequestId;
        this.action = action;
        this.actor = actor;
        this.timestamp = timestamp;
        this.notes = notes;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCorrectionRequestId() { return correctionRequestId; }
    public void setCorrectionRequestId(Long correctionRequestId) { this.correctionRequestId = correctionRequestId; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
