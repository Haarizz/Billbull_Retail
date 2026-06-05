package com.billbull.backend.financials.chartofaccounts;

import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(
    name = "cost_centers",
    indexes = { @Index(name = "idx_cost_center_branch", columnList = "branch_id") }
)
public class CostCenter {
    @Id
    private String id;

    @Column(unique = true, nullable = false)
    private String code;

    private String name;
    private String manager;

    /** Legacy free-text branch label; kept until all callers migrate to {@link #branchEntity}. */
    private String branch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branchEntity;

    private BigDecimal budget;
    private BigDecimal spent; // Automatically updated by transactions

    @Column(columnDefinition = "TEXT")
    private String description;

    private String status; // "active", "archived"

    public CostCenter() {
        this.spent = BigDecimal.ZERO;
    }

    // --- GETTERS & SETTERS ---
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getManager() {
        return manager;
    }

    public void setManager(String manager) {
        this.manager = manager;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public Branch getBranchEntity() {
        return branchEntity;
    }

    public void setBranchEntity(Branch branchEntity) {
        this.branchEntity = branchEntity;
    }

    public BigDecimal getBudget() {
        return budget;
    }

    public void setBudget(BigDecimal budget) {
        this.budget = budget;
    }

    public BigDecimal getSpent() {
        return spent;
    }

    public void setSpent(BigDecimal spent) {
        this.spent = spent;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
