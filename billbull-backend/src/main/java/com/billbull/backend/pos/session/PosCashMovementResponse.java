package com.billbull.backend.pos.session;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Back-office view of a {@link PosCashMovement} — the Cash Drop / Outs Management module's
 *  list/view DTO. Unlike the entity, this is safe to serialize directly (no lazy session
 *  reference) and carries session/counter/terminal context flattened in. */
public class PosCashMovementResponse {

    private Long id;
    private Long sessionId;
    private String counterName;
    private String terminalId;
    private Long branchId;
    private String branchName;
    private PosCashMovementType movementType;
    private BigDecimal amount;
    private String description;
    private String reference;
    private String performedBy;
    private LocalDateTime performedAt;
    private LocalDate businessDate;
    private PosCashMovementStatus status;

    private String voidReason;
    private String voidedBy;
    private LocalDateTime voidedAt;

    private String editedBy;
    private LocalDateTime editedAt;
    private Integer editCount;
    private String originalDescription;
    private String originalReference;

    /** True once the owning session's business day has been Day-Closed — historical
     *  cash movements become fully read-only at that point (§6). */
    private boolean dayClosed;
    /** Convenience flags so the UI can disable Edit/Void without re-deriving the
     *  closed-day + already-voided rules itself. */
    private boolean editable;
    private boolean voidable;

    public static PosCashMovementResponse from(PosCashMovement m) {
        PosCashMovementResponse r = new PosCashMovementResponse();
        r.id = m.getId();
        PosSession session = m.getPosSession();
        if (session != null) {
            r.sessionId = session.getId();
            r.counterName = session.getCounterName();
            r.terminalId = session.getTerminalId();
            r.dayClosed = session.getDayCloseId() != null;
        }
        r.branchId = m.getBranchId();
        r.movementType = m.getMovementType();
        r.amount = m.getAmount();
        r.description = m.getDescription();
        r.reference = m.getReference();
        r.performedBy = m.getPerformedBy();
        r.performedAt = m.getPerformedAt();
        r.businessDate = m.getBusinessDate();
        r.status = m.getStatus();
        r.voidReason = m.getVoidReason();
        r.voidedBy = m.getVoidedBy();
        r.voidedAt = m.getVoidedAt();
        r.editedBy = m.getEditedBy();
        r.editedAt = m.getEditedAt();
        r.editCount = m.getEditCount();
        r.originalDescription = m.getOriginalDescription();
        r.originalReference = m.getOriginalReference();
        boolean active = m.getStatus() == null || m.getStatus() == PosCashMovementStatus.ACTIVE;
        r.editable = active && !r.dayClosed;
        r.voidable = active && !r.dayClosed;
        return r;
    }

    public Long getId() { return id; }
    public Long getSessionId() { return sessionId; }
    public String getCounterName() { return counterName; }
    public String getTerminalId() { return terminalId; }
    public Long getBranchId() { return branchId; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public PosCashMovementType getMovementType() { return movementType; }
    public BigDecimal getAmount() { return amount; }
    public String getDescription() { return description; }
    public String getReference() { return reference; }
    public String getPerformedBy() { return performedBy; }
    public LocalDateTime getPerformedAt() { return performedAt; }
    public LocalDate getBusinessDate() { return businessDate; }
    public PosCashMovementStatus getStatus() { return status; }
    public String getVoidReason() { return voidReason; }
    public String getVoidedBy() { return voidedBy; }
    public LocalDateTime getVoidedAt() { return voidedAt; }
    public String getEditedBy() { return editedBy; }
    public LocalDateTime getEditedAt() { return editedAt; }
    public Integer getEditCount() { return editCount; }
    public String getOriginalDescription() { return originalDescription; }
    public String getOriginalReference() { return originalReference; }
    public boolean isDayClosed() { return dayClosed; }
    public boolean isEditable() { return editable; }
    public boolean isVoidable() { return voidable; }
}
