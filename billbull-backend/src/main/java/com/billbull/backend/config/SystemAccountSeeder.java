package com.billbull.backend.config;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds the minimum Chart of Accounts entries required by the PostingEngine.
 * Hierarchy (3 levels):
 *   L1 root groups  — 1000 Assets, 2000 Liabilities, 3000 Equity, 4000 Income, 5000 Expenses
 *   L2 sub-groups   — 1100 Current Assets, 2100 Current Liabilities, 4100 Sales, 5100 COGS, 5400 Operating Expenses
 *   L4 leaf accounts— 1101…5403
 * Runs on every startup — idempotent (inserts missing, patches stale records).
 */
@Component
@Order(1)
public class SystemAccountSeeder implements ApplicationRunner {

    private final AccountRepository accountRepository;

    public SystemAccountSeeder(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    @Override
    public void run(ApplicationArguments args) {

        // ── Level 1: Root group accounts ──────────────────────────────────────
        List<GroupSeed> rootGroups = List.of(
            new GroupSeed("SYS-GRP-1000", "1000", "Assets",      "Assets",      "Asset",     "Dr", "BS", null, 1),
            new GroupSeed("SYS-GRP-2000", "2000", "Liabilities",  "Liabilities", "Liability", "Cr", "BS", null, 1),
            new GroupSeed("SYS-GRP-3000", "3000", "Equity",       "Equity",      "Equity",    "Cr", "BS", null, 1),
            new GroupSeed("SYS-GRP-4000", "4000", "Income",       "Income",      "Income",    "Cr", "PL", null, 1),
            new GroupSeed("SYS-GRP-5000", "5000", "Expenses",     "Expenses",    "Expense",   "Dr", "PL", null, 1)
        );

        // ── Level 2: Sub-group accounts ───────────────────────────────────────
        List<GroupSeed> subGroups = List.of(
            new GroupSeed("SYS-GRP-1100", "1100", "Current Assets",       "Assets",      "Asset",     "Dr", "BS", "1000", 2),
            new GroupSeed("SYS-GRP-2100", "2100", "Current Liabilities",  "Liabilities", "Liability", "Cr", "BS", "2000", 2),
            new GroupSeed("SYS-GRP-4100", "4100", "Sales",                "Income",      "Income",    "Cr", "PL", "4000", 2),
            new GroupSeed("SYS-GRP-5100", "5100", "Cost of Goods Sold",   "Expenses",    "Expense",   "Dr", "PL", "5000", 2),
            new GroupSeed("SYS-GRP-5400", "5400", "Operating Expenses",   "Expenses",    "Expense",   "Dr", "PL", "5000", 2)
        );

        for (GroupSeed g : rootGroups) seedGroup(g);
        for (GroupSeed g : subGroups)  seedGroup(g);

        // ── Level 4: Leaf accounts ────────────────────────────────────────────
        //   parentCode now points to the L2 sub-group (not the L1 root)
        List<AccountSeed> seeds = List.of(
            new AccountSeed("SYS-1101", "1101", "Cash on Hand",       "Assets",      "Asset",     "Dr", "BS", true,  "1100"),
            new AccountSeed("SYS-1102", "1102", "Bank Account",        "Assets",      "Asset",     "Dr", "BS", true,  "1100"),
            new AccountSeed("SYS-1103", "1103", "Petty Cash",          "Assets",      "Asset",     "Dr", "BS", true,  "1100"),
            new AccountSeed("SYS-1104", "1104", "Merchant Clearing",   "Assets",      "Asset",     "Dr", "BS", false, "1100"),
            new AccountSeed("SYS-1110", "1110", "Accounts Receivable", "Assets",      "Asset",     "Dr", "BS", false, "1100"),
            new AccountSeed("SYS-1120", "1120", "Inventory",           "Assets",      "Asset",     "Dr", "BS", false, "1100"),
            new AccountSeed("SYS-1130", "1130", "VAT Input Tax",       "Assets",      "Asset",     "Dr", "BS", false, "1100"),
            new AccountSeed("SYS-2101", "2101", "Accounts Payable",    "Liabilities", "Liability", "Cr", "BS", false, "2100"),
            new AccountSeed("SYS-2102", "2102", "VAT Output Tax",      "Liabilities", "Liability", "Cr", "BS", false, "2100"),
            new AccountSeed("SYS-2103", "2103", "GRN Clearing",        "Liabilities", "Liability", "Cr", "BS", false, "2100"),
            new AccountSeed("SYS-2104", "2104", "Customer Advance",    "Liabilities", "Liability", "Cr", "BS", false, "2100"),
            new AccountSeed("SYS-2107", "2107", "Deferred Revenue",    "Liabilities", "Liability", "Cr", "BS", false, "2100"),
            new AccountSeed("SYS-4101", "4101", "Sales Revenue",       "Income",      "Income",    "Cr", "PL", false, "4100"),
            new AccountSeed("SYS-4102", "4102", "Sales Returns",       "Income",      "Income",    "Dr", "PL", false, "4100"),
            new AccountSeed("SYS-5101", "5101", "Cost of Goods Sold",  "Expenses",    "Expense",   "Dr", "PL", false, "5100"),
            new AccountSeed("SYS-5403", "5403", "General Expense",     "Expenses",    "Expense",   "Dr", "PL", false, "5400")
        );

        int seeded = 0;
        int patched = 0;
        for (AccountSeed s : seeds) {
            Account existing = accountRepository.findByCode(s.code);
            if (existing == null) {
                Account a = new Account();
                a.setId(s.id);
                a.setCode(s.code);
                a.setName(s.name);
                a.setAccountGroup(s.accountGroup);
                a.setAccountType(s.accountType);
                a.setNormalBalance(s.normalBalance);
                a.setStatement(s.statement);
                a.setCashFlag(s.cashFlag);
                a.setParentCode(s.parentCode);
                a.setStatus("active");
                a.setIsGroup(false);
                a.setLevel(4);
                a.setAllowManualJV(true);
                a.setControlAccount(false);
                a.setCostCenterRequired(false);
                accountRepository.save(a);
                seeded++;
            } else {
                boolean needsPatch = false;
                if (s.cashFlag && !Boolean.TRUE.equals(existing.getCashFlag())) {
                    existing.setCashFlag(true);
                    needsPatch = true;
                }
                if (existing.getAccountGroup() == null || existing.getAccountGroup().isEmpty()) {
                    existing.setAccountGroup(s.accountGroup);
                    needsPatch = true;
                }
                if (existing.getAccountType() == null || existing.getAccountType().isEmpty()) {
                    existing.setAccountType(s.accountType);
                    needsPatch = true;
                }
                // Always ensure parentCode points to the L2 sub-group
                if (!s.parentCode.equals(existing.getParentCode())) {
                    existing.setParentCode(s.parentCode);
                    needsPatch = true;
                }
                if (needsPatch) {
                    accountRepository.save(existing);
                    patched++;
                }
            }
        }

        if (seeded > 0 || patched > 0) {
            System.out.println("[SystemAccountSeeder] Seeded " + seeded + " account(s), patched " + patched + " account(s).");
        } else {
            System.out.println("[SystemAccountSeeder] All system accounts already present — no seeding required.");
        }
    }

    private void seedGroup(GroupSeed g) {
        if (accountRepository.findByCode(g.code) != null) return;
        Account a = new Account();
        a.setId(g.id);
        a.setCode(g.code);
        a.setName(g.name);
        a.setAccountGroup(g.accountGroup);
        a.setAccountType(g.accountType);
        a.setNormalBalance(g.normalBalance);
        a.setStatement(g.statement);
        a.setParentCode(g.parentCode);
        a.setIsGroup(true);
        a.setLevel(g.level);
        a.setStatus("active");
        a.setAllowManualJV(false);
        a.setControlAccount(false);
        a.setCostCenterRequired(false);
        accountRepository.save(a);
    }

    private record GroupSeed(
        String id, String code, String name,
        String accountGroup, String accountType,
        String normalBalance, String statement,
        String parentCode, int level
    ) {}

    private record AccountSeed(
        String id, String code, String name,
        String accountGroup, String accountType,
        String normalBalance, String statement,
        boolean cashFlag, String parentCode
    ) {}
}
