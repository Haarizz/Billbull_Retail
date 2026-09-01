package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;

@ExtendWith(MockitoExtension.class)
class LedgerServiceBankAccountTest {

    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private LedgerService ledgerService;

    @Test
    void getBankAccountsReturnsOnlyActiveAssetBankAccounts() {
        when(accountRepository.findAll()).thenReturn(List.of(
                account("1010", "Bank Account (Main)", "Assets", "Asset", false, "active", true),
                account("1001", "Cash in Hand", "Assets", "Asset", false, "active", true),
                account("1012", "Petty Cash", "Assets", "Asset", false, "active", true),
                account("1200", "HDFC Current Account", "Assets", "Asset", false, "active", false),
                account("2001", "AP Control", "Liabilities", "Liability", false, "active", false),
                account("1300", "Old Bank Account", "Assets", "Asset", false, "inactive", true),
                account("1050", "Bank Accounts", "Assets", "Asset", true, "active", false)));

        List<Account> result = ledgerService.getBankAccounts();

        assertThat(result)
                .extracting(Account::getCode)
                .containsExactly("1010", "1200");
    }

    @Test
    void excludeCashDropsCashAccountsThatTheCashAndBankReportGroupLetsThrough() {
        // Production shape: SystemAccountSeeder files 1001/1010/1011/1012 under the report
        // group CASH_AND_BANK, whose text contains "bank" — so the loose bank matcher accepts
        // Cash in Hand and Petty Cash too. Fine for a generic "paid through" picker, wrong for
        // an online/bank-transfer receiving account.
        when(accountRepository.findAll()).thenReturn(List.of(
                cashAndBank("1001", "Cash in Hand"),
                cashAndBank("1010", "Bank Account (Main)"),
                cashAndBank("1011", "Bank Account (Collection)"),
                cashAndBank("1012", "Petty Cash"),
                reportGrouped("1451", "Current Sub Assets", "CASH_AND_BANK")));

        assertThat(ledgerService.getBankAccounts())
                .extracting(Account::getCode)
                .containsExactly("1001", "1010", "1011", "1012", "1451");

        assertThat(ledgerService.getBankAccounts(true))
                .extracting(Account::getCode)
                .containsExactly("1010", "1011", "1451");
    }

    @Test
    void excludeCashKeepsABankAccountWhoseNameMentionsCash() {
        when(accountRepository.findAll()).thenReturn(List.of(
                cashAndBank("1015", "Cash Deposits — Bank Account (Main)"),
                cashAndBank("1016", "Till Float")));

        assertThat(ledgerService.getBankAccounts(true))
                .extracting(Account::getCode)
                .containsExactly("1015");
    }

    @Test
    void getAllAccountsIsCompanyWideRegardlessOfBranchScope() {
        // Chart of Accounts is a shared company-wide master: it must not be
        // filtered even when the caller has a specific (non-"all branches")
        // branch scope active. Only transactional/reporting data is
        // branch-scoped, never the COA itself.
        when(accountRepository.findAll()).thenReturn(List.of(
                account("1000", "Assets", "Assets", "Asset", true, "active", false),
                account("1010", "Bank Account (Main)", "Assets", "Asset", false, "active", true)));

        List<Account> result = ledgerService.getAllAccounts();

        assertThat(result)
                .extracting(Account::getCode)
                .containsExactly("1000", "1010");
    }

    private Account cashAndBank(String code, String name) {
        return reportGrouped(code, name, "CASH_AND_BANK");
    }

    private Account reportGrouped(String code, String name, String reportGroup) {
        Account account = account(code, name, "Assets", "Asset", false, "active", true);
        account.setReportGroup(reportGroup);
        return account;
    }

    private Account account(String code, String name, String accountGroup, String accountType,
            boolean isGroup, String status, boolean cashFlag) {
        Account account = new Account();
        account.setId("ID-" + code);
        account.setCode(code);
        account.setName(name);
        account.setAccountGroup(accountGroup);
        account.setAccountType(accountType);
        account.setIsGroup(isGroup);
        account.setStatus(status);
        account.setCashFlag(cashFlag);
        return account;
    }
}
