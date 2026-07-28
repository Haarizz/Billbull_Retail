package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_cash_movements")
public class PosCashMovement extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_session_id")
    @JsonIgnore
    private PosSession posSession;

    @Enumerated(EnumType.STRING)
    @Column(name = "movement_type", length = 20)
    private PosCashMovementType movementType;

    @Column(name = "amount", precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "performed_by")
    private String performedBy;

    @Column(name = "performed_at")
    private LocalDateTime performedAt;

    @Column(name = "reference", length = 100)
    private String reference;

    // ── Financial-ledger record keeping (never mutate amount/movementType/session/businessDate) ──

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20)
    private PosCashMovementStatus status = PosCashMovementStatus.ACTIVE;

    @Column(name = "void_reason", length = 500)
    private String voidReason;

    @Column(name = "voided_by")
    private String voidedBy;

    @Column(name = "voided_at")
    private LocalDateTime voidedAt;

    @Column(name = "edited_by")
    private String editedBy;

    @Column(name = "edited_at")
    private LocalDateTime editedAt;

    @Column(name = "edit_count")
    private Integer editCount = 0;

    /** Snapshot of description as originally created, captured once on first edit. */
    @Column(name = "original_description", length = 500)
    private String originalDescription;

    /** Snapshot of reference as originally created, captured once on first edit. */
    @Column(name = "original_reference", length = 100)
    private String originalReference;

    /** Denormalized from posSession.sessionDate at creation time — lets list/report
     *  queries filter by business date without joining through the session. */
    @Column(name = "business_date")
    private LocalDate businessDate;

    /** Denormalized from posSession.branchId at creation time — lets the back-office
     *  list view filter/query without joining through the session on every call. */
    @Column(name = "branch_id")
    private Long branchId;

    // Getters & Setters

    public PosSession getPosSession() { return posSession; }
    public void setPosSession(PosSession posSession) { this.posSession = posSession; }

    public PosCashMovementType getMovementType() { return movementType; }
    public void setMovementType(PosCashMovementType movementType) { this.movementType = movementType; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public LocalDateTime getPerformedAt() { return performedAt; }
    public void setPerformedAt(LocalDateTime performedAt) { this.performedAt = performedAt; }

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }

    public PosCashMovementStatus getStatus() { return status; }
    public void setStatus(PosCashMovementStatus status) { this.status = status; }

    public String getVoidReason() { return voidReason; }
    public void setVoidReason(String voidReason) { this.voidReason = voidReason; }

    public String getVoidedBy() { return voidedBy; }
    public void setVoidedBy(String voidedBy) { this.voidedBy = voidedBy; }

    public LocalDateTime getVoidedAt() { return voidedAt; }
    public void setVoidedAt(LocalDateTime voidedAt) { this.voidedAt = voidedAt; }

    public String getEditedBy() { return editedBy; }
    public void setEditedBy(String editedBy) { this.editedBy = editedBy; }

    public LocalDateTime getEditedAt() { return editedAt; }
    public void setEditedAt(LocalDateTime editedAt) { this.editedAt = editedAt; }

    public Integer getEditCount() { return editCount; }
    public void setEditCount(Integer editCount) { this.editCount = editCount; }

    public String getOriginalDescription() { return originalDescription; }
    public void setOriginalDescription(String originalDescription) { this.originalDescription = originalDescription; }

    public String getOriginalReference() { return originalReference; }
    public void setOriginalReference(String originalReference) { this.originalReference = originalReference; }

    public LocalDate getBusinessDate() { return businessDate; }
    public void setBusinessDate(LocalDate businessDate) { this.businessDate = businessDate; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
}
