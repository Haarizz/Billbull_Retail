package com.billbull.backend.settings.outlet;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
@Table(
    name = "outlets",
    indexes = {
        @Index(name = "idx_outlet_branch", columnList = "branch_id")
    }
)
public class Outlet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String code; // e.g. "DXB-01"

    @Column(nullable = false)
    private String name;

    /** Retail, Warehouse, Kiosk, etc. */
    private String type;

    /** Writable FK column — used by Spring Data query derivation (findByBranchIdAndIsActiveTrue). */
    @Column(name = "branch_id")
    private Long branchId;

    /** Navigable view of {@link #branchId}. Read-only — writes go through {@link #setBranchId(Long)}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", insertable = false, updatable = false)
    @JsonIgnore
    private Branch branch;

    @Column(nullable = false)
    private Boolean isActive = true;

    public Outlet() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public Branch getBranch() { return branch; }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
