package com.billbull.backend.financials.chartofaccounts;

/**
 * Lightweight chart-of-accounts projection for typeahead / global search.
 *
 * <p>Identification only — code, name, type/group and status. Deliberately
 * carries no balance: balances are a Phase 2B detail concern and computing them
 * per keystroke would be wasteful.
 */
public class AccountSearchResponse {

    private String id;
    private String code;
    private String name;
    /** "Asset", "Liability", "Equity", "Income", "Expense". */
    private String accountType;
    /** "Assets", "Liabilities", … — the frontend's "group". */
    private String accountGroup;
    /** "active", "archived", "inactive". */
    private String status;
    /** true for group/header accounts, which cannot receive transactions. */
    private Boolean isGroup;

    public AccountSearchResponse() {
    }

    public AccountSearchResponse(String id, String code, String name, String accountType,
            String accountGroup, String status, Boolean isGroup) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.accountType = accountType;
        this.accountGroup = accountGroup;
        this.status = status;
        this.isGroup = isGroup;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getAccountType() { return accountType; }
    public void setAccountType(String accountType) { this.accountType = accountType; }

    public String getAccountGroup() { return accountGroup; }
    public void setAccountGroup(String accountGroup) { this.accountGroup = accountGroup; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Boolean getIsGroup() { return isGroup; }
    public void setIsGroup(Boolean isGroup) { this.isGroup = isGroup; }
}
