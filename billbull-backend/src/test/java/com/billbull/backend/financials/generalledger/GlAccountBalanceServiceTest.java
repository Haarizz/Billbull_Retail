package com.billbull.backend.financials.generalledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.billbull.backend.financials.period.AccountingPeriodService;

/**
 * The pre-aggregated GL balance table.
 *
 * <p>The behaviour worth pinning is that a rebuild lands rows in the same buckets the incremental
 * upsert does. If the two disagreed on which fiscal period or branch a line belongs to, a rebuild
 * would not repair drift — it would replace one kind of wrong with another, while reporting
 * success.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GlAccountBalanceServiceTest {

    @Mock private GlAccountBalanceRepository balanceRepository;
    @Mock private JournalLineRepository journalLineRepository;
    @Mock private AccountingPeriodService accountingPeriodService;

    @InjectMocks private GlAccountBalanceService service;

    @Test
    void applyEntryAddsEachLineToItsAccountPeriodAndBranch() {
        JournalEntry entry = entryWithLines();
        when(balanceRepository.findForUpdate(anyString(), any(), any())).thenReturn(Optional.empty());

        service.applyEntry(entry);

        ArgumentCaptor<GlAccountBalance> captor = ArgumentCaptor.forClass(GlAccountBalance.class);
        verify(balanceRepository, org.mockito.Mockito.times(2)).saveAndFlush(captor.capture());

        GlAccountBalance debitSide = captor.getAllValues().get(0);
        assertEquals("1100", debitSide.getAccountCode());
        assertEquals(0, new BigDecimal("50.00").compareTo(debitSide.getDebitTotal()));
        assertEquals(0, new BigDecimal("50.00").compareTo(debitSide.getClosingBalance()));

        GlAccountBalance creditSide = captor.getAllValues().get(1);
        assertEquals("4001", creditSide.getAccountCode());
        assertEquals(0, new BigDecimal("50.00").compareTo(creditSide.getCreditTotal()));
        assertEquals(0, new BigDecimal("-50.00").compareTo(creditSide.getClosingBalance()));
    }

    @Test
    void applyEntryAccumulatesOntoAnExistingRow() {
        JournalEntry entry = entryWithLines();
        GlAccountBalance existing = new GlAccountBalance();
        existing.setAccountCode("1100");
        existing.setDebitTotal(new BigDecimal("10.00"));
        existing.setCreditTotal(new BigDecimal("4.00"));
        when(balanceRepository.findForUpdate(org.mockito.ArgumentMatchers.eq("1100"), any(), any()))
                .thenReturn(Optional.of(existing));
        when(balanceRepository.findForUpdate(org.mockito.ArgumentMatchers.eq("4001"), any(), any()))
                .thenReturn(Optional.empty());

        service.applyEntry(entry);

        assertEquals(0, new BigDecimal("60.00").compareTo(existing.getDebitTotal()));
        assertEquals(0, new BigDecimal("56.00").compareTo(existing.getClosingBalance()));
    }

    @Test
    void applyEntrySkipsLinesWithNoAccountCode() {
        JournalEntry entry = new JournalEntry();
        entry.setDate(LocalDate.of(2026, 10, 5));
        JournalLine orphan = new JournalLine();
        orphan.setAccountCode("  ");
        orphan.setDebit(new BigDecimal("5.00"));
        orphan.setCredit(BigDecimal.ZERO);
        entry.setLines(new java.util.ArrayList<>(List.of(orphan)));

        service.applyEntry(entry);

        verify(balanceRepository, never()).save(any());
        verify(balanceRepository, never()).saveAndFlush(any());
    }

    @Test
    void rebuildWritesWhatThePostedLinesSay() {
        when(journalLineRepository.sumPostedByAccountPeriodBranch()).thenReturn(java.util.Arrays.<Object[]>asList(
                new Object[]{"1100", 22L, 1L, new BigDecimal("300.00"), new BigDecimal("120.00")}));
        GlAccountBalance stored = new GlAccountBalance();
        stored.setAccountCode("1100");
        // Keyed exactly as the posted totals are: a stored row always carries the period and
        // branch it was looked up by, and the orphan sweep below matches on that key.
        stored.setFiscalPeriodId(22L);
        stored.setBranchId(1L);
        stored.setDebitTotal(new BigDecimal("300.00"));
        stored.setCreditTotal(new BigDecimal("118.74"));   // drifted by 1.26
        when(balanceRepository.findForUpdate("1100", 22L, 1L)).thenReturn(Optional.of(stored));
        when(balanceRepository.findAll()).thenReturn(List.of(stored));

        List<String> corrected = service.rebuild(null);

        assertEquals(List.of("1100"), corrected);
        assertEquals(0, new BigDecimal("120.00").compareTo(stored.getCreditTotal()));
        assertEquals(0, new BigDecimal("180.00").compareTo(stored.getClosingBalance()));
    }

    @Test
    void rebuildReportsNothingWhenTheTableAlreadyAgrees() {
        GlAccountBalance stored = new GlAccountBalance();
        stored.setAccountCode("1100");
        stored.setFiscalPeriodId(22L);
        stored.setBranchId(1L);
        stored.setDebitTotal(new BigDecimal("300.00"));
        stored.setCreditTotal(new BigDecimal("120.00"));
        stored.setClosingBalance(new BigDecimal("180.00"));
        when(journalLineRepository.sumPostedByAccountPeriodBranch()).thenReturn(java.util.Arrays.<Object[]>asList(
                new Object[]{"1100", 22L, 1L, new BigDecimal("300.00"), new BigDecimal("120.00")}));
        when(balanceRepository.findForUpdate("1100", 22L, 1L)).thenReturn(Optional.of(stored));
        when(balanceRepository.findAll()).thenReturn(List.of(stored));

        assertTrue(service.rebuild(null).isEmpty());
        verify(balanceRepository, never()).save(any());
    }

    @Test
    void rebuildZeroesARowWithNoPostedLinesLeftBehindIt() {
        GlAccountBalance orphaned = new GlAccountBalance();
        orphaned.setAccountCode("5999");
        orphaned.setFiscalPeriodId(21L);
        orphaned.setBranchId(1L);
        orphaned.setDebitTotal(new BigDecimal("75.00"));
        orphaned.setCreditTotal(BigDecimal.ZERO);
        when(journalLineRepository.sumPostedByAccountPeriodBranch()).thenReturn(List.of());
        when(balanceRepository.findAll()).thenReturn(List.of(orphaned));

        List<String> corrected = service.rebuild(null);

        assertEquals(List.of("5999"), corrected);
        assertEquals(0, BigDecimal.ZERO.compareTo(orphaned.getDebitTotal()));
        assertEquals(0, BigDecimal.ZERO.compareTo(orphaned.getClosingBalance()));
    }

    @Test
    void aSingleAccountRebuildLeavesEveryOtherRowAlone() {
        when(journalLineRepository.sumPostedByAccountPeriodBranchForAccount("1100"))
                .thenReturn(List.of());

        service.rebuild("1100");

        // The orphan sweep is whole-table only: narrowing to one account must not zero rows the
        // narrowed query was never going to mention.
        verify(balanceRepository, never()).findAll();
        verify(journalLineRepository, never()).sumPostedByAccountPeriodBranch();
    }

    private JournalEntry entryWithLines() {
        JournalEntry entry = new JournalEntry();
        entry.setDate(LocalDate.of(2026, 10, 5));

        JournalLine debit = new JournalLine();
        debit.setAccountCode("1100");
        debit.setDebit(new BigDecimal("50.00"));
        debit.setCredit(BigDecimal.ZERO);

        JournalLine credit = new JournalLine();
        credit.setAccountCode("4001");
        credit.setDebit(BigDecimal.ZERO);
        credit.setCredit(new BigDecimal("50.00"));

        entry.setLines(new java.util.ArrayList<>(List.of(debit, credit)));
        return entry;
    }
}
