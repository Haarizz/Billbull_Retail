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
            new GroupSeed("SYS-GRP-3100", "3100", "Equity",               "Equity",      "Equity",    "Cr", "BS", "3000", 2),
            new GroupSeed("SYS-GRP-4100", "4100", "Sales",                "Income",      "Income",    "Cr", "PL", "4000", 2),
            new GroupSeed("SYS-GRP-4200", "4200", "Other Income",         "Income",      "Income",    "Cr", "PL", "4000", 2),
            new GroupSeed("SYS-GRP-5100", "5100", "Cost of Goods Sold",   "Expenses",    "Expense",   "Dr", "PL", "5000", 2),
            new GroupSeed("SYS-GRP-5400", "5400", "Operating Expenses",   "Expenses",    "Expense",   "Dr", "PL", "5000", 2),
            new GroupSeed("SYS-GRP-1300", "1300", "Fixed Assets",         "Assets",      "Asset",     "Dr", "BS", "1000", 2)
        );

        for (GroupSeed g : rootGroups) seedGroup(g);
        for (GroupSeed g : subGroups)  seedGroup(g);

        // ── Level 4: Leaf accounts ────────────────────────────────────────────
        //   parentCode now points to the L2 sub-group (not the L1 root)
        List<AccountSeed> seeds = List.of(
            new AccountSeed("SYS-1101", "1101", "Cash on Hand",       "Assets",      "Asset",     "Dr", "BS", true,  "1100", "CASH_AND_BANK"),
            new AccountSeed("SYS-1102", "1102", "Bank Account",        "Assets",      "Asset",     "Dr", "BS", true,  "1100", "CASH_AND_BANK"),
            new AccountSeed("SYS-1103", "1103", "Petty Cash",          "Assets",      "Asset",     "Dr", "BS", true,  "1100", "CASH_AND_BANK"),
            new AccountSeed("SYS-1104", "1104", "Merchant Clearing",   "Assets",      "Asset",     "Dr", "BS", false, "1100", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1105", "1105", "Vendor Advances Paid","Assets",      "Asset",     "Dr", "BS", false, "1100", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1106", "1106", "Salary Advances",     "Assets",      "Asset",     "Dr", "BS", false, "1100", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1107", "1107", "Cheques Under Collection","Assets",  "Asset",     "Dr", "BS", false, "1100", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1110", "1110", "Accounts Receivable", "Assets",      "Asset",     "Dr", "BS", false, "1100", "ACCOUNTS_RECEIVABLE"),
            new AccountSeed("SYS-1120", "1120", "Inventory",           "Assets",      "Asset",     "Dr", "BS", false, "1100", "INVENTORY"),
            new AccountSeed("SYS-1130", "1130", "VAT Input Tax",       "Assets",      "Asset",     "Dr", "BS", false, "1100", "TAX_ASSETS"),
            new AccountSeed("SYS-2101", "2101", "Accounts Payable",    "Liabilities", "Liability", "Cr", "BS", false, "2100", "ACCOUNTS_PAYABLE"),
            new AccountSeed("SYS-2102", "2102", "VAT Output Tax",      "Liabilities", "Liability", "Cr", "BS", false, "2100", "TAX_LIABILITIES"),
            new AccountSeed("SYS-2103", "2103", "GRN Clearing",        "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2104", "2104", "Customer Advance",    "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2107", "2107", "Deferred Revenue",    "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2108", "2108", "VAT Payable",         "Liabilities", "Liability", "Cr", "BS", false, "2100", "TAX_LIABILITIES"),
            new AccountSeed("SYS-2200", "2200", "Salary Payable",      "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2201", "2201", "Other Deductions Payable","Liabilities","Liability","Cr","BS",false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-3100", "3100", "Retained Earnings",   "Equity",      "Equity",    "Cr", "BS", false, "3100", "EQUITY"),
            new AccountSeed("SYS-4101", "4101", "Sales Revenue",       "Income",      "Income",    "Cr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-4102", "4102", "Sales Returns",       "Income",      "Income",    "Dr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-4103", "4103", "Delivery Income",     "Income",      "Income",    "Cr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-5101", "5101", "Cost of Goods Sold",  "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5103", "5103", "Purchase Price Variance","Expenses", "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5104", "5104", "Inventory Write-off", "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-6010", "6010", "Salary Expense",      "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6050", "6050", "Discount Allowed",    "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-7001", "7001", "Discount Received",   "Income",      "Income",    "Cr", "PL", false, "4200", "OTHER_INCOME"),
            new AccountSeed("SYS-7002", "7002", "Interest Income",     "Income",      "Income",    "Cr", "PL", false, "4200", "OTHER_INCOME"),
            new AccountSeed("SYS-7501", "7501", "Bank Charges",                   "Expenses", "Expense", "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-7502", "7502", "Inventory Write-off/Shrinkage", "Expenses", "Expense", "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-5403", "5403", "General Expense",               "Expenses", "Expense", "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-5999", "5999", "Rounding Adjustment",           "Expenses", "Expense", "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),

            // ── Missing accounts per PDF §03 COA spec ─────────────────────────────
            new AccountSeed("SYS-1201", "1201", "Inventory – In Transit",         "Assets",      "Asset",     "Dr", "BS", false, "1100", "INVENTORY"),
            new AccountSeed("SYS-1320", "1320", "Prepaid Expenses",               "Assets",      "Asset",     "Dr", "BS", false, "1100", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1400", "1400", "Fixed Assets – Equipment",       "Assets",      "Asset",     "Dr", "BS", false, "1300", "FIXED_ASSETS"),
            new AccountSeed("SYS-1450", "1450", "Accumulated Depreciation",       "Assets",      "Asset",     "Cr", "BS", false, "1300", "FIXED_ASSETS"),
            new AccountSeed("SYS-3001", "3001", "Share Capital / Owner Equity",   "Equity",      "Equity",    "Cr", "BS", false, "3100", "EQUITY"),
            new AccountSeed("SYS-4002", "4002", "Sales Returns",                  "Income",      "Income",    "Dr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-5002", "5002", "Purchase Returns",               "Expenses",    "Expense",   "Cr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-6030", "6030", "Depreciation Expense",           "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6001", "6001", "Rent Expense",                   "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6002", "6002", "Utility Expense",                "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-7502B","7503", "Accrued Liabilities",            "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-5101B","5999B","Interest Expense",               "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),

            // ── Additional accounts required by complete financial flow ────────────
            // Equity
            new AccountSeed("SYS-3000", "3000", "Retained Earnings",              "Equity",      "Equity",    "Cr", "BS", false, "3100", "EQUITY"),
            // Purchase Price Variance (distinct from 5103 used in GRN/PI flow — alias safe)
            new AccountSeed("SYS-5110", "5110", "Purchase Price Variance - Returns","Expenses",  "Expense",   "Dr", "PL", false, "5100", "COGS"),
            // PDC sub-ledger clearing
            new AccountSeed("SYS-2150", "2150", "AP - Post-Dated Cheques",        "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-1150", "1150", "AR - Post-Dated Cheques",        "Assets",      "Asset",     "Dr", "BS", false, "1100", "CURRENT_ASSETS"),
            // HR — Gratuity (End of Service Benefit per UAE Labour Law)
            new AccountSeed("SYS-6020", "6020", "Gratuity Expense",               "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-2210", "2210", "Gratuity Payable",               "Liabilities", "Liability", "Cr", "BS", false, "2100", "CURRENT_LIABILITIES"),
            // Discount / settlement income
            new AccountSeed("SYS-4301", "4301", "Trade Discount Income",          "Income",      "Income",    "Cr", "PL", false, "4200", "OTHER_INCOME"),
            // Additional operating expense accounts
            new AccountSeed("SYS-6003", "6003", "Repairs & Maintenance",          "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6004", "6004", "Insurance Expense",              "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6005", "6005", "Advertising & Marketing",        "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6006", "6006", "Transportation Expense",         "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6007", "6007", "Communication Expense",          "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6008", "6008", "Office Supplies",                "Expenses",    "Expense",   "Dr", "PL", false, "5400", "OPERATING_EXPENSES"),
            // Inventory adjustments
            new AccountSeed("SYS-5105", "5105", "Inventory Adjustment",           "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            // Long-term liabilities sub-group
            new AccountSeed("SYS-GRP-2500", "2500", "Long-term Liabilities",    "Liabilities", "Liability", "Cr", "BS", false, "2000", "NON_CURRENT_LIABILITIES"),
            // Bank-related
            new AccountSeed("SYS-1108", "1108", "Petty Cash - Branch",            "Assets",      "Asset",     "Dr", "BS", true,  "1100", "CASH_AND_BANK")
        );

        int seeded = 0;
        int patched = 0;
        for (AccountSeed s : seeds) {
            Account existing = accountRepository.findByCode(s.code());
            if (existing == null) {
                Account a = new Account();
                a.setId(s.id());
                a.setCode(s.code());
                a.setName(s.name());
                a.setAccountGroup(s.accountGroup());
                a.setAccountType(s.accountType());
                a.setNormalBalance(s.normalBalance());
                a.setStatement(s.statement());
                a.setCashFlag(s.cashFlag());
                a.setParentCode(s.parentCode());
                a.setStatus("active");
                a.setIsGroup(false);
                a.setLevel(4);
                a.setAllowManualJV(true);
                a.setControlAccount(false);
                a.setCostCenterRequired(false);
                a.setReportGroup(s.reportGroup());
                a.setCashFlowSection(deriveCashFlowSection(s.accountType(), s.reportGroup()));
                accountRepository.save(a);
                seeded++;
            } else {
                boolean needsPatch = false;
                if (s.cashFlag() && !Boolean.TRUE.equals(existing.getCashFlag())) {
                    existing.setCashFlag(true);
                    needsPatch = true;
                }
                if (existing.getAccountGroup() == null || existing.getAccountGroup().isEmpty()) {
                    existing.setAccountGroup(s.accountGroup());
                    needsPatch = true;
                }
                if (existing.getAccountType() == null || existing.getAccountType().isEmpty()) {
                    existing.setAccountType(s.accountType());
                    needsPatch = true;
                }
                // Always ensure parentCode points to the L2 sub-group
                if (!s.parentCode().equals(existing.getParentCode())) {
                    existing.setParentCode(s.parentCode());
                    needsPatch = true;
                }
                if (existing.getReportGroup() == null || existing.getReportGroup().isEmpty()) {
                    existing.setReportGroup(s.reportGroup());
                    needsPatch = true;
                }
                if (existing.getCashFlowSection() == null || existing.getCashFlowSection().isEmpty()) {
                    existing.setCashFlowSection(deriveCashFlowSection(s.accountType(), s.reportGroup()));
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

    /** Derives IAS 7 cash flow section from account type and report group. */
    private static String deriveCashFlowSection(String accountType, String reportGroup) {
        if ("Equity".equalsIgnoreCase(accountType)) return "FINANCING";
        if ("EQUITY".equals(reportGroup)) return "FINANCING";
        if ("FIXED_ASSETS".equals(reportGroup)) return "INVESTING";
        if ("Asset".equalsIgnoreCase(accountType) || "Liability".equalsIgnoreCase(accountType)) return "OPERATING";
        if ("Income".equalsIgnoreCase(accountType) || "Expense".equalsIgnoreCase(accountType)) return "OPERATING";
        return "NONE";
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
        boolean cashFlag, String parentCode, String reportGroup
    ) {}
}
