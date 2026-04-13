package com.billbull.backend.financials.reports;

import java.math.BigDecimal;

/**
 * Expense grouping entry (by category or cost center).
 */
public class ExpenseGroupDTO {
    private String groupName;
    private BigDecimal amount;
    private int count;

    public ExpenseGroupDTO() {
    }

    public ExpenseGroupDTO(String groupName, BigDecimal amount, int count) {
        this.groupName = groupName;
        this.amount = amount;
        this.count = count;
    }

    public String getGroupName() {
        return groupName;
    }

    public void setGroupName(String groupName) {
        this.groupName = groupName;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }
}
