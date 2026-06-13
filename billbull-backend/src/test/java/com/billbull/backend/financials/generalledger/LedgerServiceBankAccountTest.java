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
