package com.billbull.backend.financials.payment;

import jakarta.persistence.*;

/**
 * Configurable payment method entity.
 * Maps payment types (Cash, Bank Transfer, Card, Online) to their corresponding
 * COA accounts.
 */
@Entity
@Table(name = "payment_methods")
public class PaymentMethod {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String name; // e.g. "Cash", "Bank Transfer", "Credit Card", "Online Gateway"

    @Column(unique = true, nullable = false)
    private String code; // e.g. "CASH", "BANK", "CARD", "ONLINE"

    private String accountCode; // COA account code this payment clears through

    @Column(nullable = false)
    private Boolean isActive = true;

    @Column(columnDefinition = "TEXT")
    private String description;

    public PaymentMethod() {
    }

    // --- GETTERS & SETTERS ---
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getAccountCode() {
        return accountCode;
    }

    public void setAccountCode(String accountCode) {
        this.accountCode = accountCode;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
