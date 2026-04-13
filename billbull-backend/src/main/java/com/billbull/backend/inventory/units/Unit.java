package com.billbull.backend.inventory.units;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "units", uniqueConstraints = {
        @UniqueConstraint(columnNames = "name"),
        @UniqueConstraint(columnNames = "symbol")
})
public class Unit extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, length = 10)
    private String symbol;

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