package com.billbull.backend.inventory.units;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

// Branch-Level Inventory Phase 6A: the global UNIQUE(name) and UNIQUE(symbol) constraints were
// removed here and replaced by DB-level PARTIAL unique indexes (Flyway V37) — per-branch +
// global-null. The @UniqueConstraint set is intentionally gone so Hibernate does not recreate the
// global constraints. Uniqueness is now owned by the database.
@Entity
@Table(name = "units")
public class Unit extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, length = 10)
    private String symbol;

    // Phase 6A: nullable branch (null = shared/global). Scoping wired in Phase 6B; inert for now.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branch;

    @Column(length = 500)
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_unit_id")
    private Unit baseUnit;

    @Column(precision = 19, scale = 4)
    private java.math.BigDecimal conversionRate;

    protected Unit() {
    }

    public Unit(String name, String symbol, String description) {
        this.name = name;
        this.symbol = symbol.toUpperCase();
        this.description = description;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public Branch getBranch() {
        return branch;
    }

    public void setBranch(Branch branch) {
        this.branch = branch;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Unit getBaseUnit() {
        return baseUnit;
    }

    public void setBaseUnit(Unit baseUnit) {
        this.baseUnit = baseUnit;
    }

    public java.math.BigDecimal getConversionRate() {
        return conversionRate;
    }

    public void setConversionRate(java.math.BigDecimal conversionRate) {
        this.conversionRate = conversionRate;
    }
}