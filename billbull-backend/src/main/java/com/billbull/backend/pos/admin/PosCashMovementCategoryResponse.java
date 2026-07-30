package com.billbull.backend.pos.admin;

import java.time.LocalDateTime;

/** Enterprise Console management view of a {@link PosCashMovementCategory}. */
public class PosCashMovementCategoryResponse {

    private Long id;
    private String code;
    private String name;
    private String description;
    private PosCashMovementCategoryMovementType movementType;
    private String glAccountId;
    private String glAccountCode;
    private String glAccountName;
    private Integer displayOrder;
    private boolean notesRequired;
    private boolean approvalRequired;
    private boolean active;
    private LocalDateTime createdAt;
    private String createdBy;
    private LocalDateTime updatedAt;
    private String updatedBy;

    public static PosCashMovementCategoryResponse from(PosCashMovementCategory c) {
        return from(c, null);
    }

    public static PosCashMovementCategoryResponse from(PosCashMovementCategory c,
            com.billbull.backend.financials.chartofaccounts.Account glAccount) {
        PosCashMovementCategoryResponse r = new PosCashMovementCategoryResponse();
        r.id = c.getId();
        r.code = c.getCode();
        r.name = c.getName();
        r.description = c.getDescription();
        r.movementType = c.getMovementType();
        r.glAccountId = c.getGlAccountId();
        if (glAccount != null) {
            r.glAccountCode = glAccount.getCode();
            r.glAccountName = glAccount.getName();
        }
        r.displayOrder = c.getDisplayOrder();
        r.notesRequired = c.isNotesRequired();
        r.approvalRequired = c.isApprovalRequired();
        r.active = c.isActive();
        r.createdAt = c.getCreatedAt();
        r.createdBy = c.getCreatedBy();
        r.updatedAt = c.getUpdatedAt();
        r.updatedBy = c.getUpdatedBy();
        return r;
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public PosCashMovementCategoryMovementType getMovementType() { return movementType; }
    public String getGlAccountId() { return glAccountId; }
    public String getGlAccountCode() { return glAccountCode; }
    public String getGlAccountName() { return glAccountName; }
    public Integer getDisplayOrder() { return displayOrder; }
    public boolean isNotesRequired() { return notesRequired; }
    public boolean isApprovalRequired() { return approvalRequired; }
    public boolean isActive() { return active; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public String getUpdatedBy() { return updatedBy; }
}
