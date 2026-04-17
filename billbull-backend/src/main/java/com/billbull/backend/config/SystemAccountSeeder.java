package com.billbull.backend.config;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds the minimum Chart of Accounts entries required by the PostingEngine.
 * Runs once on every startup — safe to run multiple times (idempotent).
 */
@Component
public class SystemAccountSeeder implements ApplicationRunner {

    private final AccountRepository accountRepository;

    public SystemAccountSeeder(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<AccountSeed> seeds = List.of(
            new AccountSeed("SYS-1101", "1101", "Cash on Hand",        "Asset",     "Dr", "BS", true),
            new AccountSeed("SYS-1102", "1102", "Bank Account",         "Asset",     "Dr", "BS", true),
            new AccountSeed("SYS-1103", "1103", "Petty Cash",           "Asset",     "Dr", "BS", true),
            new AccountSeed("SYS-1104", "1104", "Merchant Clearing",    "Asset",     "Dr", "BS", false),
            new AccountSeed("SYS-1110", "1110", "Accounts Receivable",  "Asset",     "Dr", "BS", false),
            new AccountSeed("SYS-1120", "1120", "Inventory",            "Asset",     "Dr", "BS", false),
            new AccountSeed("SYS-1130", "1130", "VAT Input Tax",        "Asset",     "Dr", "BS", false),
            new AccountSeed("SYS-2101", "2101", "Accounts Payable",     "Liability", "Cr", "BS", false),
            new AccountSeed("SYS-2102", "2102", "VAT Output Tax",       "Liability", "Cr", "BS", false),
            new AccountSeed("SYS-2103", "2103", "GRN Clearing",         "Liability", "Cr", "BS", false),
            new AccountSeed("SYS-2104", "2104", "Customer Advance",     "Liability", "Cr", "BS", false),
            new AccountSeed("SYS-2107", "2107", "Deferred Revenue",     "Liability", "Cr", "BS", false),
            new AccountSeed("SYS-4101", "4101", "Sales Revenue",        "Income",    "Cr", "PL", false),
            new AccountSeed("SYS-4102", "4102", "Sales Returns",        "Income",    "Dr", "PL", false),
            new AccountSeed("SYS-5101", "5101", "Cost of Goods Sold",   "Expense",   "Dr", "PL", false),
            new AccountSeed("SYS-5403", "5403", "General Expense",      "Expense",   "Dr", "PL", false)
        );

        int seeded = 0;
        for (AccountSeed s : seeds) {
            if (accountRepository.findByCode(s.code) == null) {
                Account a = new Account();
                a.setId(s.id);
                a.setCode(s.code);
                a.setName(s.name);
                a.setAccountType(s.accountType);
                a.setNormalBalance(s.normalBalance);
                a.setStatement(s.statement);
                a.setCashFlag(s.cashFlag);
                a.setStatus("active");
                a.setIsGroup(false);
                a.setLevel(4);
                a.setAllowManualJV(true);
                a.setControlAccount(false);
                a.setCostCenterRequired(false);
                accountRepository.save(a);
                seeded++;
            }
        }

        if (seeded > 0) {
            System.out.println("[SystemAccountSeeder] Seeded " + seeded + " system account(s) into Chart of Accounts.");
        } else {
            System.out.println("[SystemAccountSeeder] All system accounts already present — no seeding required.");
        }
    }

    private record AccountSeed(
        String id, String code, String name,
        String accountType, String normalBalance, String statement,
        boolean cashFlag
    ) {}
}
