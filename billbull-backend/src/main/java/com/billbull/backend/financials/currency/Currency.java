package com.billbull.backend.financials.currency;

import jakarta.persistence.*;

@Entity
@Table(name = "currencies")
public class Currency {

    @Id
    @Column(length = 3)
    private String code; // ISO 4217, e.g. "AED", "USD"

    @Column(nullable = false)
    private String name; // e.g. "UAE Dirham"

    @Column(length = 10)
    private String symbol; // e.g. "AED", "$"

    /** True for the single base currency (AED). Only one row may have this flag. */
    @Column(nullable = false)
    private Boolean isBase = false;

    @Column(nullable = false)
    private Boolean isActive = true;

    public Currency() {}

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }

    public Boolean getIsBase() { return isBase; }
    public void setIsBase(Boolean isBase) { this.isBase = isBase; }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
