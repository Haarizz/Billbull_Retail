package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Repeated submits of Finance -> Ledger -> Record Transaction used to create one entry per click.
 * Recording also advances the account balance and cost-center spend, so a duplicate skews the
 * ledger, not just the entry list — these tests pin the replay guard that stops that.
 */
@ExtendWith(MockitoExtension.class)
class LedgerServiceRecordTransactionIdempotencyTest {

    @Mock
    private AccountRepository accountRepo;
    @Mock
    private CostCenterRepository costCenterRepo;
    @Mock
    private LedgerEntryRepository entryRepo;
    @Mock
    private BranchAccessService branchAccessService;

    @InjectMocks
    private LedgerService ledgerService;

    @Test
    void repeatedSubmitWithSameRequestIdReturnsTheFirstEntryWithoutPostingAgain() {
        LedgerEntry firstClick = existingEntry("req-1");
        when(entryRepo.findByClientRequestId("req-1")).thenReturn(Optional.of(firstClick));

        LedgerEntry result = ledgerService.recordTransaction(debitOf("1010", "250.00", "req-1"));

        assertThat(result).isSameAs(firstClick);
        // The whole posting path is skipped: no balance update, no second row.
        verify(accountRepo, never()).save(any());
        verify(costCenterRepo, never()).save(any());
        verify(entryRepo, never()).save(any());
    }

    @Test
    void firstSubmitWithAnUnseenRequestIdPostsNormallyAndStoresTheKey() {
        when(entryRepo.findByClientRequestId("req-2")).thenReturn(Optional.empty());
        when(accountRepo.findByCode("1010")).thenReturn(account("1010", "Bank", "100.00", "Dr"));
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(new Branch());
        when(entryRepo.save(any(LedgerEntry.class))).thenAnswer(inv -> inv.getArgument(0));

        LedgerEntry saved = ledgerService.recordTransaction(debitOf("1010", "250.00", "req-2"));

        assertThat(saved.getClientRequestId()).isEqualTo("req-2");
        assertThat(saved.getRunningBalance()).isEqualByComparingTo("350.00");
        assertThat(saved.getBalanceType()).isEqualTo("Dr");
        verify(accountRepo).save(any(Account.class));
    }

    @Test
    void blankRequestIdIsStoredAsNullSoItNeverCollidesWithAnotherBlankSubmit() {
        // The partial unique index ignores NULLs; storing "" or "   " instead would make the
        // second keyless caller (posting engine, backfill) collide with the first.
        when(accountRepo.findByCode("1010")).thenReturn(account("1010", "Bank", "100.00", "Dr"));
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(new Branch());
        when(entryRepo.save(any(LedgerEntry.class))).thenAnswer(inv -> inv.getArgument(0));

        LedgerEntry saved = ledgerService.recordTransaction(debitOf("1010", "250.00", "   "));

        assertThat(saved.getClientRequestId()).isNull();
        verify(entryRepo, never()).findByClientRequestId(any());
    }

    // --- fixtures ---

    private static LedgerEntry debitOf(String accountCode, String amount, String requestId) {
        LedgerEntry entry = new LedgerEntry();
        entry.setClientRequestId(requestId);
        entry.setTransactionDate(LocalDate.of(2026, 8, 25));
        entry.setType("Debit");
        entry.setAccountCode(accountCode);
        entry.setDescription("Transaction Entry");
        entry.setDebitAmount(new BigDecimal(amount));
        return entry;
    }

    private static LedgerEntry existingEntry(String requestId) {
        LedgerEntry entry = debitOf("1010", "250.00", requestId);
        entry.setId("already-saved");
        return entry;
    }

    private static Account account(String code, String name, String balance, String balanceType) {
        Account acc = new Account();
        acc.setCode(code);
        acc.setName(name);
        acc.setStatus("active");
        acc.setBalanceAmount(new BigDecimal(balance));
        acc.setBalanceType(balanceType);
        return acc;
    }
}
