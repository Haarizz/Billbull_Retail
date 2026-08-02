package com.billbull.backend.pos.admin;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

/**
 * Enterprise Console &gt; POS Administration &gt; Cash Movement Categories — centrally managed
 * master data (architectural review §7): every POS Cash Drop / Drop Out can optionally (and,
 * once {@code PosSettings.requireCashMovementCategory} is enabled for a branch, mandatorily)
 * carry one of these. Categories are not tenant/branch-scoped by design (§7: "Do not introduce
 * tenant-specific behaviour. Categories are centrally managed.").
 *
 * <p>{@code isActive} (inherited from {@link BaseEntity}) is the Active/Inactive flag — reused
 * rather than duplicated. There is deliberately no delete endpoint: deactivation is the only
 * way to retire a category, which trivially satisfies "never delete a category referenced by
 * existing cash movements" (there's nothing to delete).
 */
@Entity
@Table(name = "pos_cash_movement_categories")
public class PosCashMovementCategory extends BaseEntity {

    @Column(name = "code", length = 40, nullable = false, unique = true)
    private String code;

    @Column(name = "name", length = 150, nullable = false)
    private String name;

    @Column(name = "description", length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "movement_type", length = 20, nullable = false)
    private PosCashMovementCategoryMovementType movementType;

    /** Optional override into the chart of accounts — {@link com.billbull.backend.financials.
     *  chartofaccounts.Account#getId()} (same convention as {@code Expense.getGlAccountId()}).
     *  Null means "fall back to the existing default cash-movement posting rule" (§7/§9). */
    @Column(name = "gl_account_id", length = 60)
    private String glAccountId;

    @Column(name = "display_order")
    private Integer displayOrder = 0;

    @Column(name = "notes_required", nullable = false)
    private boolean notesRequired = false;

    @Column(name = "approval_required", nullable = false)
    private boolean approvalRequired = false;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public PosCashMovementCategoryMovementType getMovementType() { return movementType; }
    public void setMovementType(PosCashMovementCategoryMovementType movementType) { this.movementType = movementType; }

    public String getGlAccountId() { return glAccountId; }
    public void setGlAccountId(String glAccountId) { this.glAccountId = glAccountId; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }

    public boolean isNotesRequired() { return notesRequired; }
    public void setNotesRequired(boolean notesRequired) { this.notesRequired = notesRequired; }

    public boolean isApprovalRequired() { return approvalRequired; }
    public void setApprovalRequired(boolean approvalRequired) { this.approvalRequired = approvalRequired; }
}
