package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pos_cash_movements")
public class PosCashMovement extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_session_id")
    @JsonIgnore
    private PosSession posSession;

    @Column(name = "movement_type", length = 20)
    private String movementType; // DROP_IN, DROP_OUT

    @Column(name = "amount")
    private Double amount;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "performed_by")
    private String performedBy;

    @Column(name = "performed_at")
    private LocalDateTime performedAt;

    @Column(name = "reference", length = 100)
    private String reference;

    // Getters & Setters

    public PosSession getPosSession() { return posSession; }
    public void setPosSession(PosSession posSession) { this.posSession = posSession; }

    public String getMovementType() { return movementType; }
    public void setMovementType(String movementType) { this.movementType = movementType; }

    public Double getAmount() { return amount; }
    public void setAmount(Double amount) { this.amount = amount; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public LocalDateTime getPerformedAt() { return performedAt; }
    public void setPerformedAt(LocalDateTime performedAt) { this.performedAt = performedAt; }

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
}
