package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Read-only balance summary for a single chart-of-accounts code, backing the global
 * search details panel.
 *
 * <p>Every figure here is the server's own authoritative value, read from the
 * pre-aggregated {@link GlAccountBalance} rows (the same rows
 * {@code config/GlBalanceRebuildJob} maintains). The frontend renders these as
 * given — it never re-derives a balance from transaction rows.
 *
 * <p>Balance-sheet convention matches the rest of the GL:
 * {@code closingBalance = debitTotal - creditTotal}.
 */
public class LedgerAccountSummaryResponse {

    private String accountCode;
    private String accountName;
    private String accountType;
    private String accountGroup;
    private String status;

    private BigDecimal debitTotal = BigDecimal.ZERO;
    private BigDecimal creditTotal = BigDecimal.ZERO;
    private BigDecimal closingBalance = BigDecimal.ZERO;

    private List<BranchBalance> branchBalances = new ArrayList<>();

    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String accountCode) { this.accountCode = accountCode; }

    public String getAccountName() { return accountName; }
    public void setAccountName(String accountName) { this.accountName = accountName; }

    public String getAccountType() { return accountType; }
    public void setAccountType(String accountType) { this.accountType = accountType; }

    public String getAccountGroup() { return accountGroup; }
    public void setAccountGroup(String accountGroup) { this.accountGroup = accountGroup; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public BigDecimal getDebitTotal() { return debitTotal; }
    public void setDebitTotal(BigDecimal debitTotal) {
        this.debitTotal = debitTotal != null ? debitTotal : BigDecimal.ZERO;
    }

    public BigDecimal getCreditTotal() { return creditTotal; }
    public void setCreditTotal(BigDecimal creditTotal) {
        this.creditTotal = creditTotal != null ? creditTotal : BigDecimal.ZERO;
    }

    public BigDecimal getClosingBalance() { return closingBalance; }
    public void setClosingBalance(BigDecimal closingBalance) {
        this.closingBalance = closingBalance != null ? closingBalance : BigDecimal.ZERO;
    }

    public List<BranchBalance> getBranchBalances() { return branchBalances; }
    public void setBranchBalances(List<BranchBalance> branchBalances) {
        this.branchBalances = branchBalances != null ? branchBalances : new ArrayList<>();
    }

    /**
     * One branch's share of the account balance.
     *
     * <p>{@code branchId} is nullable by design: the posting engine writes
     * branch-less (rolling-window) balance rows, and dropping them would make the
     * branch rows fail to add up to the account total. Such a row is returned with
     * a null id and an "Unattributed" name rather than being discarded.
     */
    public static class BranchBalance {
        private Long branchId;
        private String branchName;
        private BigDecimal debitTotal = BigDecimal.ZERO;
        private BigDecimal creditTotal = BigDecimal.ZERO;
        private BigDecimal closingBalance = BigDecimal.ZERO;

        public BranchBalance() {}

        public BranchBalance(Long branchId, String branchName, BigDecimal debitTotal,
                             BigDecimal creditTotal, BigDecimal closingBalance) {
            this.branchId = branchId;
            this.branchName = branchName;
            setDebitTotal(debitTotal);
            setCreditTotal(creditTotal);
            setClosingBalance(closingBalance);
        }

        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }

        public String getBranchName() { return branchName; }
        public void setBranchName(String branchName) { this.branchName = branchName; }

        public BigDecimal getDebitTotal() { return debitTotal; }
        public void setDebitTotal(BigDecimal debitTotal) {
            this.debitTotal = debitTotal != null ? debitTotal : BigDecimal.ZERO;
        }

        public BigDecimal getCreditTotal() { return creditTotal; }
        public void setCreditTotal(BigDecimal creditTotal) {
            this.creditTotal = creditTotal != null ? creditTotal : BigDecimal.ZERO;
        }

        public BigDecimal getClosingBalance() { return closingBalance; }
        public void setClosingBalance(BigDecimal closingBalance) {
            this.closingBalance = closingBalance != null ? closingBalance : BigDecimal.ZERO;
        }
    }
}
