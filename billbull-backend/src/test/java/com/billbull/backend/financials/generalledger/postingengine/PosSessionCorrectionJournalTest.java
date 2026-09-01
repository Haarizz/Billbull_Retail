package com.billbull.backend.financials.generalledger.postingengine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.GlAccountBalanceRepository;
import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.JournalEntryService;
import com.billbull.backend.financials.generalledger.JournalLine;
import com.billbull.backend.financials.generalledger.voucher.VoucherSequenceService;
import com.billbull.backend.financials.period.AccountingPeriodService;

/**
 * The adjustment journal a post-close denomination correction produces.
 *
 * <p>A correction moves effective counted cash, and therefore effective variance, while the
 * already-posted close journal still describes the original count. Left alone, reports and
 * ledger drift apart. The fix is one adjustment entry per correction that reverses the original
 * outright and reposts the corrected state — never a rewrite of the original, which is the
 * record of what was counted and approved at the time.
 *
 * <p>Each test asserts the same thing in the end: the <em>net</em> of the original entry and the
 * adjustment equals what a clean close of the corrected figures would have produced. That is the
 * invariant — effective counted − expected = effective variance = net accounting variance.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosSessionCorrectionJournalTest {

    @Mock private JournalEntryRepository journalEntryRepository;
    @Mock private JournalEntryService journalEntryService;
    @Mock private AccountRepository accountRepository;
    @Mock private AccountingPeriodService accountingPeriodService;
    @Mock private DimensionMatrixService dimensionMatrixService;
    @Mock private VoucherSequenceService voucherSequenceService;
    @Mock private com.billbull.backend.sales.customerledger.CustomerCreditService customerCreditService;
    @Mock private com.billbull.backend.purchase.grn.GrnRepository grnRepository;
    @Mock private GlAccountBalanceRepository glBalanceRepository;
    @Mock private com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;
    @Mock private com.billbull.backend.financials.currency.CurrencyService currencyService;
    @Mock private com.billbull.backend.settings.outlet.OutletRepository outletRepository;

    private PostingEngineService service;

    @BeforeEach
    void setUp() {
        com.billbull.backend.sales.settings.SalesSettings settings =
                new com.billbull.backend.sales.settings.SalesSettings();
        settings.setCreditLimitPolicy(com.billbull.backend.sales.settings.CreditLimitPolicy.BLOCK);
        when(salesSettingsService.getSettings()).thenReturn(settings);

        service = new PostingEngineService(
                journalEntryRepository, journalEntryService, accountRepository,
                accountingPeriodService, dimensionMatrixService, voucherSequenceService,
                customerCreditService, grnRepository, glBalanceRepository, salesSettingsService,
                currencyService, outletRepository);

        Account active = new Account();
        active.setStatus("active");
        active.setIsGroup(false);
        when(accountRepository.findByCode(anyString())).thenReturn(active);
        when(journalEntryRepository.existsByReference(anyString())).thenReturn(false);
        when(voucherSequenceService.nextVoucherNumber(anyString(), anyString(), any()))
                .thenAnswer(inv -> inv.getArgument(0) + "-HO-2026-000001");
        when(journalEntryRepository.save(any())).thenAnswer(inv -> {
            JournalEntry e = inv.getArgument(0);
            e.setId(1L);
            return e;
        });
        when(glBalanceRepository.findByAccountCodeAndFiscalPeriodIdAndBranchId(anyString(), any(), any()))
                .thenReturn(Optional.empty());
    }

    // ── Every direction a correction can take ────────────────────────────────────────────

    @Test
    void shortageCorrectedToZero() {
        assertNetsToACleanCloseOf("4800", "5000", "5000");
    }

    @Test
    void shortageCorrectedToADifferentShortage() {
        assertNetsToACleanCloseOf("4800", "4900", "5000");
    }

    @Test
    void shortageCorrectedToAnOverage() {
        // The case a delta-style adjustment is most likely to get wrong: the variance crosses
        // zero, so the account it lands in changes from Cash Short to Cash Over.
        assertNetsToACleanCloseOf("4800", "5200", "5000");
    }

    @Test
    void overageCorrectedToAShortage() {
        assertNetsToACleanCloseOf("5200", "4800", "5000");
    }

    @Test
    void overageCorrectedToZero() {
        assertNetsToACleanCloseOf("5200", "5000", "5000");
    }

    @Test
    void aBalancedCloseCorrectedIntoAVariance() {
        assertNetsToACleanCloseOf("5000", "4700", "5000");
    }

    // ── Structure ────────────────────────────────────────────────────────────────────────

    @Test
    void theAdjustmentReversesTheOriginalAndRepostsTheCorrection() {
        JournalEntry adj = service.createAdjustmentJournalFromSessionCorrection(
                1L, 1, bd("4800"), bd("5000"), bd("5000"), DATE, null);

        assertNotNull(adj);
        assertBalanced(adj);
        // Reversal half: the original Dr Bank 4,800 and Dr Cash Short 200 come back as credits,
        // and the original Cr Cash 5,000 as a debit.
        assertLine(adj, PostingEngineService.ACC_BANK, "4800", false);
        assertLine(adj, PostingEngineService.ACC_CASH_SHORT, "200", false);
        assertLine(adj, PostingEngineService.ACC_CASH, "5000", true);
        // Repost half: the corrected close.
        assertLine(adj, PostingEngineService.ACC_BANK, "5000", true);
        assertLine(adj, PostingEngineService.ACC_CASH, "5000", false);
    }

    @Test
    void aCorrectionThatChangesNothingPostsNothing() {
        // A self-cancelling entry would add noise and imply a change that never happened.
        assertNull(service.createAdjustmentJournalFromSessionCorrection(
                1L, 1, bd("5000"), bd("5000"), bd("5000"), DATE, null));
    }

    @Test
    void theAdjustmentIsIdempotentOnItsVersionedReference() {
        JournalEntry first = service.createAdjustmentJournalFromSessionCorrection(
                1L, 1, bd("4800"), bd("5000"), bd("5000"), DATE, null);
        assertNotNull(first);

        // A retry finds the existing entry rather than posting a second one.
        JournalEntry existing = new JournalEntry();
        when(journalEntryRepository.existsByReference("SCLADJ-1-v1")).thenReturn(true);
        when(journalEntryRepository.findByReference("SCLADJ-1-v1")).thenReturn(Optional.of(existing));

        assertSame(existing, service.createAdjustmentJournalFromSessionCorrection(
                1L, 1, bd("4800"), bd("5000"), bd("5000"), DATE, null));
    }

    @Test
    void aSecondCorrectionGetsItsOwnVersionedEntry() {
        when(journalEntryRepository.existsByReference("SCLADJ-1-v1")).thenReturn(true);
        when(journalEntryRepository.findByReference("SCLADJ-1-v1"))
                .thenReturn(Optional.of(new JournalEntry()));

        JournalEntry v2 = service.createAdjustmentJournalFromSessionCorrection(
                1L, 2, bd("5000"), bd("4900"), bd("5000"), DATE, null);

        assertNotNull(v2);
        assertBalanced(v2);
    }

    @Test
    void theAdjustmentNeverTouchesRevenueTaxOrReceivables() {
        JournalEntry adj = service.createAdjustmentJournalFromSessionCorrection(
                1L, 1, bd("4800"), bd("5200"), bd("5000"), DATE, null);

        assertNoLine(adj, PostingEngineService.ACC_SALES_REVENUE);
        assertNoLine(adj, PostingEngineService.ACC_VAT_OUTPUT);
        assertNoLine(adj, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE);
    }

    // ── The invariant ────────────────────────────────────────────────────────────────────

    /**
     * Posts the original close, then the correction, and proves the net of the two equals a
     * clean close of the corrected figures — on every account, not just in total.
     */
    private void assertNetsToACleanCloseOf(String originalCounted, String correctedCounted,
                                           String expected) {
        JournalEntry original = service.createJournalFromSessionClose(
                1L, bd(originalCounted), bd(expected), DATE, null);
        JournalEntry adjustment = service.createAdjustmentJournalFromSessionCorrection(
                1L, 1, bd(originalCounted), bd(correctedCounted), bd(expected), DATE, null);

        assertBalanced(original);
        assertBalanced(adjustment);

        when(journalEntryRepository.existsByReference("SCL-1")).thenReturn(false);
        JournalEntry cleanClose = service.createJournalFromSessionClose(
                2L, bd(correctedCounted), bd(expected), DATE, null);

        for (String account : new String[]{
                PostingEngineService.ACC_BANK, PostingEngineService.ACC_CASH,
                PostingEngineService.ACC_CASH_SHORT, PostingEngineService.ACC_CASH_OVER}) {
            BigDecimal actual = net(account, original, adjustment);
            BigDecimal ideal = net(account, cleanClose);
            assertEquals(0, actual.compareTo(ideal),
                    "net effect on " + account + " after correction must equal a clean close of "
                            + correctedCounted + " against " + expected
                            + " — was " + actual + ", expected " + ideal);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    private static final LocalDate DATE = LocalDate.of(2026, 8, 31);

    private static BigDecimal bd(String v) { return new BigDecimal(v); }
    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    /** Net movement on one account across the given entries, debits positive. */
    private static BigDecimal net(String accountCode, JournalEntry... entries) {
        BigDecimal total = BigDecimal.ZERO;
        for (JournalEntry e : entries) {
            if (e == null) continue;
            for (JournalLine l : e.getLines()) {
                if (!accountCode.equals(l.getAccountCode())) continue;
                total = total.add(nz(l.getDebit())).subtract(nz(l.getCredit()));
            }
        }
        return total;
    }

    private static void assertBalanced(JournalEntry entry) {
        assertNotNull(entry, "entry must not be null");
        BigDecimal dr = BigDecimal.ZERO, cr = BigDecimal.ZERO;
        for (JournalLine l : entry.getLines()) {
            dr = dr.add(nz(l.getDebit()));
            cr = cr.add(nz(l.getCredit()));
        }
        assertEquals(0, dr.compareTo(cr),
                "entry " + entry.getReference() + " must balance. Dr=" + dr + " Cr=" + cr);
    }

    private static void assertLine(JournalEntry entry, String accountCode, String amount, boolean debit) {
        boolean found = entry.getLines().stream().anyMatch(l ->
                accountCode.equals(l.getAccountCode())
                        && nz(debit ? l.getDebit() : l.getCredit()).compareTo(bd(amount)) == 0);
        org.junit.jupiter.api.Assertions.assertTrue(found,
                "expected a " + (debit ? "debit" : "credit") + " of " + amount + " to " + accountCode);
    }

    private static void assertNoLine(JournalEntry entry, String accountCode) {
        org.junit.jupiter.api.Assertions.assertFalse(
                entry.getLines().stream().anyMatch(l -> accountCode.equals(l.getAccountCode())),
                accountCode + " must not appear in " + entry.getReference());
    }
}
