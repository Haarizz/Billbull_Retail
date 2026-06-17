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

        // ── Level 2: Sub-group accounts (PDF ranges: CA 1000-1299, FA 1300-1599, CL 2000-2399, LTL 2400-2999) ──
        List<GroupSeed> subGroups = List.of(
            new GroupSeed("SYS-GRP-CA",   "1050", "Current Assets",        "Assets",      "Asset",     "Dr", "BS", "1000", 2),
            new GroupSeed("SYS-GRP-FA",   "1300", "Fixed Assets",          "Assets",      "Asset",     "Dr", "BS", "1000", 2),
            new GroupSeed("SYS-GRP-CL",   "2050", "Current Liabilities",   "Liabilities", "Liability", "Cr", "BS", "2000", 2),
            new GroupSeed("SYS-GRP-LTL",  "2400", "Long-term Liabilities", "Liabilities", "Liability", "Cr", "BS", "2000", 2),
            new GroupSeed("SYS-GRP-3100", "3100", "Equity",                "Equity",      "Equity",    "Cr", "BS", "3000", 2),
            new GroupSeed("SYS-GRP-4100", "4100", "Sales",                 "Income",      "Income",    "Cr", "PL", "4000", 2),
            new GroupSeed("SYS-GRP-4200", "4200", "Other Income",          "Income",      "Income",    "Cr", "PL", "4000", 2),
            new GroupSeed("SYS-GRP-5100", "5100", "Cost of Goods Sold",    "Expenses",    "Expense",   "Dr", "PL", "5000", 2),
            new GroupSeed("SYS-GRP-6000", "6000", "Operating Expenses",    "Expenses",    "Expense",   "Dr", "PL", "5000", 2),
            new GroupSeed("SYS-GRP-7000", "7000", "Other Income",          "Income",      "Income",    "Cr", "PL", "4000", 2),
            new GroupSeed("SYS-GRP-7500", "7500", "Other Expenses",        "Expenses",    "Expense",   "Dr", "PL", "5000", 2)
        );

        for (GroupSeed g : rootGroups) seedGroup(g);
        for (GroupSeed g : subGroups)  seedGroup(g);

        // ── Level 4: Leaf accounts ────────────────────────────────────────────
        //   Numbered per BillBull Standard COA (PDF key account codes table).
        //   parentCode points to the L2 sub-group that covers the account's range.
        List<AccountSeed> seeds = List.of(
            // ── Current Assets (parent: 1050 group) ──────────────────────────
            new AccountSeed("SYS-1001", "1001", "Cash in Hand",              "Assets",      "Asset",     "Dr", "BS", true,  "1050", "CASH_AND_BANK"),
            new AccountSeed("SYS-1010", "1010", "Bank Account (Main)",       "Assets",      "Asset",     "Dr", "BS", true,  "1050", "CASH_AND_BANK"),
            new AccountSeed("SYS-1011", "1011", "Bank Account (Collection)", "Assets",      "Asset",     "Dr", "BS", true,  "1050", "CASH_AND_BANK"),
            new AccountSeed("SYS-1012", "1012", "Petty Cash",                "Assets",      "Asset",     "Dr", "BS", true,  "1050", "CASH_AND_BANK"),
            new AccountSeed("SYS-1013", "1013", "Merchant Clearing",         "Assets",      "Asset",     "Dr", "BS", false, "1050", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1100", "1100", "Accounts Receivable Control","Assets",     "Asset",     "Dr", "BS", false, "1050", "ACCOUNTS_RECEIVABLE"),
            new AccountSeed("SYS-1101", "1101", "AR – Post-Dated Cheques",   "Assets",      "Asset",     "Dr", "BS", false, "1050", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1105", "1105", "Vendor Advances Paid",      "Assets",      "Asset",     "Dr", "BS", false, "1050", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1106", "1106", "Salary Advances – Employees","Assets",     "Asset",     "Dr", "BS", false, "1050", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1107", "1107", "Cheques Under Collection",  "Assets",      "Asset",     "Dr", "BS", false, "1050", "CURRENT_ASSETS"),
            new AccountSeed("SYS-1200", "1200", "Inventory – Raw / Retail",  "Assets",      "Asset",     "Dr", "BS", false, "1050", "INVENTORY"),
            new AccountSeed("SYS-1201", "1201", "Inventory – In Transit",    "Assets",      "Asset",     "Dr", "BS", false, "1050", "INVENTORY"),
            new AccountSeed("SYS-1310", "1310", "VAT Input Tax",             "Assets",      "Asset",     "Dr", "BS", false, "1050", "TAX_ASSETS"),
            new AccountSeed("SYS-1320", "1320", "Prepaid Expenses",          "Assets",      "Asset",     "Dr", "BS", false, "1050", "CURRENT_ASSETS"),
            // ── Fixed Assets (parent: 1300 group) ────────────────────────────
            new AccountSeed("SYS-1400", "1400", "Fixed Assets – Equipment",  "Assets",      "Asset",     "Dr", "BS", false, "1300", "FIXED_ASSETS"),
            new AccountSeed("SYS-1450", "1450", "Accumulated Depreciation",  "Assets",      "Asset",     "Cr", "BS", false, "1300", "FIXED_ASSETS"),
            // ── Current Liabilities (parent: 2050 group) ─────────────────────
            new AccountSeed("SYS-2001", "2001", "Accounts Payable Control",  "Liabilities", "Liability", "Cr", "BS", false, "2050", "ACCOUNTS_PAYABLE"),
            new AccountSeed("SYS-2002", "2002", "GRN Clearing",              "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2060", "2060", "Customer Advances Received","Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2051", "2051", "Deferred Revenue",          "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2100", "2100", "VAT Output Tax",            "Liabilities", "Liability", "Cr", "BS", false, "2050", "TAX_LIABILITIES"),
            new AccountSeed("SYS-2101", "2101", "VAT Payable (Net)",         "Liabilities", "Liability", "Cr", "BS", false, "2050", "TAX_LIABILITIES"),
            new AccountSeed("SYS-2150", "2150", "AP – Post-Dated Cheques",   "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2200", "2200", "Salary Payable",            "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2201", "2201", "Other Deductions Payable",  "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2210", "2210", "Gratuity Payable",          "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            new AccountSeed("SYS-2250", "2250", "Accrued Liabilities",       "Liabilities", "Liability", "Cr", "BS", false, "2050", "CURRENT_LIABILITIES"),
            // ── Equity ────────────────────────────────────────────────────────
            new AccountSeed("SYS-3001", "3001", "Owner's Equity / Share Capital","Equity",  "Equity",    "Cr", "BS", false, "3100", "EQUITY"),
            new AccountSeed("SYS-3100", "3100", "Retained Earnings",         "Equity",      "Equity",    "Cr", "BS", false, "3100", "EQUITY"),
            // ── Revenue (parent: 4100 group) ──────────────────────────────────
            new AccountSeed("SYS-4001", "4001", "Sales Revenue",             "Income",      "Income",    "Cr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-4002", "4002", "Sales Returns",             "Income",      "Income",    "Dr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-4003", "4003", "Trade Discounts Given",     "Income",      "Income",    "Dr", "PL", false, "4100", "REVENUE"),
            new AccountSeed("SYS-4004", "4004", "Delivery Income",           "Income",      "Income",    "Cr", "PL", false, "4100", "REVENUE"),
            // ── Other Income (parent: 7000 group, range 7000-7499) ────────────
            new AccountSeed("SYS-7001", "7001", "Discount Received (Purchase)","Income",    "Income",    "Cr", "PL", false, "7000", "OTHER_INCOME"),
            new AccountSeed("SYS-7002", "7002", "Interest Income",           "Income",      "Income",    "Cr", "PL", false, "7000", "OTHER_INCOME"),
            new AccountSeed("SYS-7003", "7003", "Trade Discount Income",     "Income",      "Income",    "Cr", "PL", false, "7000", "OTHER_INCOME"),
            new AccountSeed("SYS-7004", "7004", "Gain on Disposal",          "Income",      "Income",    "Cr", "PL", false, "7000", "OTHER_INCOME"),
            // ── COGS (parent: 5100 group) ─────────────────────────────────────
            new AccountSeed("SYS-5001", "5001", "Purchase / COGS",           "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5002", "5002", "Purchase Returns",          "Expenses",    "Expense",   "Cr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5003", "5003", "Purchase Price Variance",   "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5004", "5004", "Purchase Price Variance – Returns","Expenses","Expense","Dr","PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5005", "5005", "Inventory Write-off",       "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5006", "5006", "Inventory Adjustment",      "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            new AccountSeed("SYS-5999", "5999", "Rounding Adjustment",       "Expenses",    "Expense",   "Dr", "PL", false, "5100", "COGS"),
            // ── Operating Expenses (parent: 6000 group) ───────────────────────
            new AccountSeed("SYS-6001", "6001", "Rent Expense",              "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6002", "6002", "Utility Expense",           "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6003", "6003", "Repairs & Maintenance",     "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6004", "6004", "Insurance Expense",         "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6005", "6005", "Advertising & Marketing",   "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6006", "6006", "Transportation Expense",    "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6007", "6007", "Communication Expense",     "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6008", "6008", "Office Supplies",           "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6009", "6009", "Interest Expense",          "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6010", "6010", "Salary Expense",            "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6020", "6020", "Gratuity Expense",          "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6030", "6030", "Depreciation Expense",      "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6040", "6040", "Loss on Disposal",          "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6050", "6050", "Discount Allowed (Sales)",  "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            new AccountSeed("SYS-6099", "6099", "General Expense",           "Expenses",    "Expense",   "Dr", "PL", false, "6000", "OPERATING_EXPENSES"),
            // ── Other Expenses (parent: 7500 group, range 7500-7999) ──────────
            new AccountSeed("SYS-7501", "7501", "Bank Charges",              "Expenses",    "Expense",   "Dr", "PL", false, "7500", "OTHER_EXPENSES"),
            new AccountSeed("SYS-7502", "7502", "Inventory Write-off/Shrinkage","Expenses", "Expense",   "Dr", "PL", false, "7500", "OTHER_EXPENSES")
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

        // Archive old-numbered accounts superseded by the PDF COA renumbering.
        for (String retired : List.of(
                "1101","1102","1103","1104","1108",  // old cash/bank — replaced by 1001,1010,1011,1012,1013
                "1110","1120","1130","1150",          // old AR/Inventory/VAT-In/AR-PDC — replaced by 1100,1200,1310,1101
                "2101","2102","2103","2104","2107","2108", // old AP/VAT-Out/GRN/CustAdv/Deferred/VATPayable
                "2503","4101","4102","4103","4301","4302", // old revenue — replaced by 4001-4004,7003,7004
                "5101","5102","5103","5104","5105","5110", // old COGS — replaced by 5001-5006
                "5400","5403","7503"                  // old op-exp group, GeneralExp, AccruedLiab
        )) {
            Account a = accountRepository.findByCode(retired);
            if (a != null && !"archived".equals(a.getStatus())) {
                a.setStatus("archived");
                accountRepository.save(a);
                System.out.println("[SystemAccountSeeder] Archived retired account " + retired + ".");
            }
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
