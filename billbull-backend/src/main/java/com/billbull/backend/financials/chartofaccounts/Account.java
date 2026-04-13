package com.billbull.backend.financials.chartofaccounts;

import jakarta.persistence.*;
import java.math.BigDecimal;

// ================== 1. ACCOUNT ENTITY ==================
@Entity
@Table(name = "accounts")
public class Account {
    @Id
    private String id;

    @Column(unique = true, nullable = false)
    private String code;

    private String name;
    private String subGroup; // Frontend: "sub"
    private String accountGroup; // Frontend: "group" (Assets, Liabilities, etc.)
    private String branch;
    private String costCenterCode; // Frontend: "cc"

    // ===== COA TREE HIERARCHY =====
    private String parentCode; // Parent account code (null for root accounts)
    private Integer level; // Depth in tree: 1=root, 2=group, 3=sub-group, 4=leaf
    private Boolean isGroup; // true = group account (cannot receive transactions)
    private String accountType; // Asset, Liability, Equity, Income, Expense
    private String normalBalance; // "Dr" or "Cr" (natural balance side)

    // Balance tracking
    private BigDecimal balanceAmount;
    private String balanceType; // "Dr" or "Cr"

    // IFRS & Workflow Fields
    private String statement; // "BS" or "PL"
    private Boolean cashFlag = false; // true for cash/bank accounts
    private String taxRole; // "INPUT_TAX", "OUTPUT_TAX", "TAXABLE_SALES"
    private Boolean costCenterRequired = false;
    private Boolean controlAccount = false;
    private Boolean allowManualJV = true;
    private String reportGroup; // "CURRENT_ASSETS", "REVENUE", "COGS", etc.

    @Column(columnDefinition = "TEXT")
    private String description;

    private String status; // "active", "archived", "inactive"

    public Account() {
        // ID generation handled in Service if null
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

    public String getSubGroup() {
        return subGroup;
    }

    public void setSubGroup(String subGroup) {
        this.subGroup = subGroup;
    }

    public String getAccountGroup() {
        return accountGroup;
    }

    public void setAccountGroup(String accountGroup) {
        this.accountGroup = accountGroup;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public String getCostCenterCode() {
        return costCenterCode;
    }

    public void setCostCenterCode(String costCenterCode) {
        this.costCenterCode = costCenterCode;
    }

    public BigDecimal getBalanceAmount() {
        return balanceAmount;
    }

    public void setBalanceAmount(BigDecimal balanceAmount) {
        this.balanceAmount = balanceAmount;
    }

    public String getBalanceType() {
        return balanceType;
    }

    public void setBalanceType(String balanceType) {
        this.balanceType = balanceType;
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

    // ===== COA TREE GETTERS & SETTERS =====
    public String getParentCode() {
        return parentCode;
    }

    public void setParentCode(String parentCode) {
        this.parentCode = parentCode;
    }

    public Integer getLevel() {
        return level;
    }

    public void setLevel(Integer level) {
        this.level = level;
    }

    public Boolean getIsGroup() {
        return isGroup;
    }

    public void setIsGroup(Boolean isGroup) {
        this.isGroup = isGroup;
    }

    public String getAccountType() {
        return accountType;
    }

    public void setAccountType(String accountType) {
        this.accountType = accountType;
    }

    public String getNormalBalance() {
        return normalBalance;
    }

    public void setNormalBalance(String normalBalance) {
        this.normalBalance = normalBalance;
    }

    public String getStatement() {
        return statement;
    }

    public void setStatement(String statement) {
        this.statement = statement;
    }

    public Boolean getCashFlag() {
        return cashFlag;
    }

    public void setCashFlag(Boolean cashFlag) {
        this.cashFlag = cashFlag;
    }

    public String getTaxRole() {
        return taxRole;
    }

    public void setTaxRole(String taxRole) {
        this.taxRole = taxRole;
    }

    public Boolean getCostCenterRequired() {
        return costCenterRequired;
    }

    public void setCostCenterRequired(Boolean costCenterRequired) {
        this.costCenterRequired = costCenterRequired;
    }

    public Boolean getControlAccount() {
        return controlAccount;
    }

    public void setControlAccount(Boolean controlAccount) {
        this.controlAccount = controlAccount;
    }

    public Boolean getAllowManualJV() {
        return allowManualJV;
    }

    public void setAllowManualJV(Boolean allowManualJV) {
        this.allowManualJV = allowManualJV;
    }

    public String getReportGroup() {
        return reportGroup;
    }

    public void setReportGroup(String reportGroup) {
        this.reportGroup = reportGroup;
    }
}
