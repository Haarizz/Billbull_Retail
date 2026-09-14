package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;

/**
 * {@code Account.balanceAmount} is a cache of the ledger, not a client-writable field.
 * The Chart of Accounts list reads it while the COA tree and every report aggregate posted
 * ledger entries, so letting the create form write it directly counted an opening balance
 * twice (list showed 2x) and let an edit rewrite a balance with no journal behind it.
 */
@ExtendWith(MockitoExtension.class)
class LedgerServiceSaveAccountBalanceTest {

    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private LedgerService ledgerService;

    @Test
    void newAccountStartsAtZeroSoTheOpeningBalanceJournalIsNotCountedTwice() {
        when(accountRepository.findByCode("4101")).thenReturn(null);
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        Account submitted = account(null, "4101", "Consulting Income");
        submitted.setBalanceAmount(new BigDecimal("5000.00"));
        submitted.setBalanceType("Cr");

        Account saved = ledgerService.saveAccount(submitted);

        assertThat(saved.getBalanceAmount()).isEqualByComparingTo(BigDecimal.ZERO);
        // The side the user picked is kept — it is what the opening-balance journal posts to.
        assertThat(saved.getBalanceType()).isEqualTo("Cr");
    }

    @Test
    void updateKeepsThePersistedBalanceInsteadOfTheOneOnTheForm() {
        Account persisted = account("acc-1", "4101", "Consulting Income");
        persisted.setBalanceAmount(new BigDecimal("5000.00"));
        persisted.setBalanceType("Cr");

        when(accountRepository.findByCode("4101")).thenReturn(persisted);
        when(accountRepository.findById("acc-1")).thenReturn(Optional.of(persisted));
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        Account submitted = account("acc-1", "4101", "Consulting Income (renamed)");
        submitted.setBalanceAmount(new BigDecimal("999999.00"));
        submitted.setBalanceType("Dr");

        Account saved = ledgerService.saveAccount(submitted);

        assertThat(saved.getName()).isEqualTo("Consulting Income (renamed)");
        assertThat(saved.getBalanceAmount()).isEqualByComparingTo(new BigDecimal("5000.00"));
        assertThat(saved.getBalanceType()).isEqualTo("Cr");
    }

    private static Account account(String id, String code, String name) {
        Account a = new Account();
        a.setId(id);
        a.setCode(code);
        a.setName(name);
        a.setAccountGroup("Income");
        a.setStatus("active");
        a.setIsGroup(false);
        return a;
    }
}
