package com.billbull.backend.financials.generalledger.postingengine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.JournalEntryService;
import com.billbull.backend.financials.generalledger.JournalLine;
import com.billbull.backend.financials.generalledger.voucher.VoucherSequenceService;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.purchase.grn.GrnEntity;

/**
 * Unit tests for the posting gateway pre-validation pipeline (PDF §1 / §21A).
 * Exercises each guard's stable error code plus the rounding-absorption and
 * voucher-numbering behaviour of a full posting.
 */
@ExtendWith(MockitoExtension.class)
class PostingEngineServiceTest {

    @Mock private JournalEntryRepository journalEntryRepository;
    @Mock private JournalEntryService journalEntryService;
    @Mock private AccountRepository accountRepository;
    @Mock private AccountingPeriodService accountingPeriodService;
    @Mock private DimensionMatrixService dimensionMatrixService;
    @Mock private VoucherSequenceService voucherSequenceService;
    @Mock private com.billbull.backend.sales.customerledger.CustomerCreditService customerCreditService;
    @Mock private com.billbull.backend.purchase.grn.GrnRepository grnRepository;
    @Mock private com.billbull.backend.financials.generalledger.GlAccountBalanceRepository glBalanceRepository;
    @Mock private com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;
    @Mock private com.billbull.backend.financials.currency.CurrencyService currencyService;
    @Mock private com.billbull.backend.settings.outlet.OutletRepository outletRepository;

    private PostingEngineService service;

    @BeforeEach
    void setUp() {
        com.billbull.backend.sales.settings.SalesSettings settings =
                new com.billbull.backend.sales.settings.SalesSettings();
        settings.setCreditLimitPolicy(com.billbull.backend.sales.settings.CreditLimitPolicy.NO_IMPACT);
        org.mockito.Mockito.lenient().when(salesSettingsService.getSettings()).thenReturn(settings);

        service = new PostingEngineService(
                journalEntryRepository,
                journalEntryService,
                accountRepository,
                accountingPeriodService,
                dimensionMatrixService,
                voucherSequenceService,
                customerCreditService,
                grnRepository,
                glBalanceRepository,
                salesSettingsService,
                currencyService,
                outletRepository);
    }

    @Test
    void validateRejectsUnbalancedEntryBeyondTolerance() {
        JournalEntry entry = entryWith(line("1001", "100.00", "0.00"), line("4001", "0.00", "90.00"));

        PostingException ex = assertThrows(PostingException.class, () -> service.validate(entry));
        assertEquals(PostingErrorCode.UNBALANCED_ENTRY, ex.getCode());
    }

    @Test
    void validateAbsorbsSubToleranceResidualIntoRoundingAccount() {
        when(accountRepository.findByCode(anyString())).thenReturn(activeAccount());
        // 100.00 Dr vs 99.99 Cr → 0.01 residual within tolerance.
        JournalEntry entry = entryWith(line("1001", "100.00", "0.00"), line("4001", "0.00", "99.99"));

        service.validate(entry);

        assertEquals(3, entry.getLines().size(), "rounding line should be injected");
        JournalLine rounding = entry.getLines().get(2);
        assertEquals(PostingEngineService.ACC_ROUNDING, rounding.getAccountCode());
        assertEquals(0, sum(entry, true).compareTo(sum(entry, false)), "entry must balance after absorption");
    }

    @Test
    void validateRejectsInactiveAccount() {
        Account archived = new Account();
        archived.setCode("6099");
        archived.setName("General Expense");
        archived.setStatus("archived");
        when(accountRepository.findByCode("6099")).thenReturn(archived);

        JournalEntry entry = entryWith(line("6099", "100.00", "0.00"), line("1001", "0.00", "100.00"));

        PostingException ex = assertThrows(PostingException.class, () -> service.validate(entry));
        assertEquals(PostingErrorCode.ACCOUNT_INACTIVE, ex.getCode());
    }

    @Test
    void validatePropagatesPeriodLock() {
        doThrow(new PostingException(PostingErrorCode.PERIOD_LOCKED, "closed"))
                .when(accountingPeriodService).assertOpen(any());

        JournalEntry entry = entryWith(line("1001", "100.00", "0.00"), line("4001", "0.00", "100.00"));

        PostingException ex = assertThrows(PostingException.class, () -> service.validate(entry));
        assertEquals(PostingErrorCode.PERIOD_LOCKED, ex.getCode());
    }

    @Test
    void grnPostingAssignsVoucherNumberAndBalances() {
        GrnEntity grn = new GrnEntity();
        grn.setGrnNo("GRN-1");
        grn.setGrnDate(LocalDate.of(2026, 5, 10));
        grn.setGrandTotal(new BigDecimal("105.00"));
        grn.setSubtotal(new BigDecimal("105.00")); // createJournalFromGRN uses subtotal, not grandTotal

        when(accountRepository.findByCode(anyString())).thenReturn(activeAccount());
        when(voucherSequenceService.nextVoucherNumber(eq("GRN"), anyString(), any()))
                .thenReturn("GRN-HO-2026-000001");
        when(journalEntryRepository.save(any(JournalEntry.class))).thenAnswer(inv -> {
            JournalEntry e = inv.getArgument(0);
            e.setId(1L);
            return e;
        });

        JournalEntry result = service.createJournalFromGRN(grn);

        assertNotNull(result);
        assertEquals("GRN-HO-2026-000001", result.getEntryNumber());
        assertEquals(2, result.getLines().size());
        assertEquals(0, sum(result, true).compareTo(sum(result, false)));
        verify(journalEntryService).postEntry(1L, "System");
    }

    // ---- fixtures -------------------------------------------------------

    private static JournalEntry entryWith(JournalLine... lines) {
        JournalEntry entry = new JournalEntry();
        entry.setDate(LocalDate.of(2026, 5, 10));
        entry.setReference("TEST-REF");
        for (JournalLine l : lines) {
            entry.addLine(l);
        }
        return entry;
    }

    private static JournalLine line(String code, String debit, String credit) {
        JournalLine l = new JournalLine();
        l.setAccount(code);
        l.setAccountCode(code);
        l.setDebit(new BigDecimal(debit));
        l.setCredit(new BigDecimal(credit));
        return l;
    }

    private static Account activeAccount() {
        Account a = new Account();
        a.setStatus("active");
        return a;
    }

    private static BigDecimal sum(JournalEntry entry, boolean debit) {
        BigDecimal total = BigDecimal.ZERO;
        for (JournalLine l : entry.getLines()) {
            total = total.add(debit ? l.getDebit() : l.getCredit());
        }
        return total;
    }
}
