package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;

public class OpeningBalanceRequest {
    private String accountCode;
    private BigDecimal amount;
    private String balanceType; // "Dr" or "Cr"

    public String getAccountCode() {
        return accountCode;
    }

    public void setAccountCode(String accountCode) {
        this.accountCode = accountCode;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getBalanceType() {
        return balanceType;
    }

    public void setBalanceType(String balanceType) {
        this.balanceType = balanceType;
    }
}

