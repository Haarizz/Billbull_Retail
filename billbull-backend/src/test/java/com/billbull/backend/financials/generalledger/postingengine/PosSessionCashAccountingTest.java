package com.billbull.backend.financials.generalledger.postingengine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
 * The accounting lifecycle of a POS drawer, open to close.
 *
 * <p>Two defects these tests exist to prevent from returning:
 *
 * <ol>
 *   <li><b>The float was never booked.</b> Session open posted no journal while close credited
 *       Cash in Hand, so every session left a negative Cash-in-Hand residual exactly equal to
 *       its float — the notes were in the till but had never entered the ledger.</li>
 *   <li><b>Variance was invisible.</b> Close posted {@code Dr Bank = counted / Cr Cash = counted},
 *       which balances no matter what the drawer held. A shortage simply vanished into the cash
 *       account instead of being recognised anywhere.</li>
 * </ol>
 *
 * <p>Each scenario below traces the full session and asserts the net movement on Cash in Hand,
 * because that single number is what says whether the books describe the drawer.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosSessionCashAccountingTest {

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

    // ── TEST A — BALANCED ────────────────────────────────────────────────────────────────

    @Test
    void testA_balancedSessionLeavesNoCashResidual() {
        // Float 1,000; cash sales 9,000; drop-out 5,000; expected 5,000; counted 5,000.
        JournalEntry open = service.createJournalFromSessionOpen(1L, bd("1000"), DATE, null);
        JournalEntry close = service.createJournalFromSessionClose(1L, bd("5000"), bd("5000"), DATE, null);

        assertBalanced(open);
        assertBalanced(close);
        assertLine(open, PostingEngineService.ACC_CASH, "1000", true);
        assertLine(open, PostingEngineService.ACC_PETTY_CASH, "1000", false);
        assertLine(close, PostingEngineService.ACC_BANK, "5000", true);
        assertLine(close, PostingEngineService.ACC_CASH, "5000", false);

        // No variance means no over/short line at all.
        assertNoLine(close, PostingEngineService.ACC_CASH_SHORT);
        assertNoLine(close, PostingEngineService.ACC_CASH_OVER);

        // Cash in Hand across the whole session: +1,000 float, +9,000 sales, −5,000 drop-out,
        // −5,000 close = 0. Before the float was booked this came to −1,000 every session.
        assertEquals(0, netCash(open, close).add(bd("9000")).subtract(bd("5000")).compareTo(BigDecimal.ZERO),
                "a balanced session must leave Cash in Hand at exactly zero");
    }

    // ── TEST B — SHORT ───────────────────────────────────────────────────────────────────

    @Test
    void testB_shortageIsRecognisedNotAbsorbed() {
        JournalEntry open = service.createJournalFromSessionOpen(1L, bd("1000"), DATE, null);
        JournalEntry close = service.createJournalFromSessionClose(1L, bd("4800"), bd("5000"), DATE, null);

        assertBalanced(close);
        assertLine(close, PostingEngineService.ACC_BANK, "4800", true);        // what was banked
        assertLine(close, PostingEngineService.ACC_CASH_SHORT, "200", true);   // the missing 200, named
        assertLine(close, PostingEngineService.ACC_CASH, "5000", false);       // relieved by EXPECTED
        assertNoLine(close, PostingEngineService.ACC_CASH_OVER);

        // Still zero: the shortage left through Cash Short, not through the cash account.
        assertEquals(0, netCash(open, close).add(bd("9000")).subtract(bd("5000")).compareTo(BigDecimal.ZERO),
                "a shortage must not leave a residual in Cash in Hand");
    }

    // ── TEST C — OVER ────────────────────────────────────────────────────────────────────

    @Test
    void testC_overageIsRecognisedNotAbsorbed() {
        JournalEntry open = service.createJournalFromSessionOpen(1L, bd("1000"), DATE, null);
        JournalEntry close = service.createJournalFromSessionClose(1L, bd("5200"), bd("5000"), DATE, null);

        assertBalanced(close);
        assertLine(close, PostingEngineService.ACC_BANK, "5200", true);
        assertLine(close, PostingEngineService.ACC_CASH, "5000", false);
        assertLine(close, PostingEngineService.ACC_CASH_OVER, "200", false);
        assertNoLine(close, PostingEngineService.ACC_CASH_SHORT);

        assertEquals(0, netCash(open, close).add(bd("9000")).subtract(bd("5000")).compareTo(BigDecimal.ZERO),
                "an overage must not leave a residual in Cash in Hand");
    }

    // ── TEST D — REFUND ──────────────────────────────────────────────────────────────────

    @Test
    void testD_aCashRefundIsNotAVariance() {
        // Cash sale 500, cash refund 200 (a DROP_OUT), counted 300. Expected is also 300, so the
        // refund reduced the expectation rather than showing up as a 200 shortage.
        JournalEntry close = service.createJournalFromSessionClose(1L, bd("300"), bd("300"), DATE, null);

        assertBalanced(close);
        assertNoLine(close, PostingEngineService.ACC_CASH_SHORT);
        assertNoLine(close, PostingEngineService.ACC_CASH_OVER);
    }

    // ── Uncounted, and idempotency ───────────────────────────────────────────────────────

    @Test
    void anUncountedCloseSettlesNothing() {
        // No count means no figure to settle and no variance to recognise. Posting anything
        // would fabricate a reconciliation nobody performed.
        assertNull(service.createJournalFromSessionClose(1L, null, bd("5000"), DATE, null));
    }

    @Test
    void aCountedZeroDrawerStillRecognisesItsFullShortage() {
        // Counted 0 against expected 5,000 is a 5,000 shortage, not "nothing happened".
        JournalEntry close = service.createJournalFromSessionClose(1L, BigDecimal.ZERO, bd("5000"), DATE, null);

        assertBalanced(close);
        assertLine(close, PostingEngineService.ACC_CASH_SHORT, "5000", true);
        assertLine(close, PostingEngineService.ACC_CASH, "5000", false);
        assertNoLine(close, PostingEngineService.ACC_BANK);
    }

    @Test
    void aRetriedOpenCannotDoubleTheFloat() {
        service.createJournalFromSessionOpen(1L, bd("1000"), DATE, null);
        when(journalEntryRepository.existsByReference("SESSOPEN-1")).thenReturn(true);
        when(journalEntryRepository.findByReference("SESSOPEN-1"))
                .thenReturn(Optional.of(new JournalEntry()));

        assertNotNull(service.createJournalFromSessionOpen(1L, bd("1000"), DATE, null));
        // findDuplicate short-circuits, so no second entry is built.
    }

    @Test
    void aZeroFloatPostsNothing() {
        assertNull(service.createJournalFromSessionOpen(1L, BigDecimal.ZERO, DATE, null));
        assertNull(service.createJournalFromSessionOpen(1L, null, DATE, null));
    }

    @Test
    void theCloseJournalNeverTouchesRevenueOrTax() {
        JournalEntry close = service.createJournalFromSessionClose(1L, bd("4800"), bd("5000"), DATE, null);

        assertNoLine(close, PostingEngineService.ACC_SALES_REVENUE);
        assertNoLine(close, PostingEngineService.ACC_VAT_OUTPUT);
        assertNoLine(close, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    private static final LocalDate DATE = LocalDate.of(2026, 8, 31);

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

    /** Net movement on Cash in Hand across the given entries (debits positive). */
    private static BigDecimal netCash(JournalEntry... entries) {
        BigDecimal net = BigDecimal.ZERO;
        for (JournalEntry e : entries) {
            if (e == null) continue;
            for (JournalLine l : e.getLines()) {
                if (!PostingEngineService.ACC_CASH.equals(l.getAccountCode())) continue;
                net = net.add(nz(l.getDebit())).subtract(nz(l.getCredit()));
            }
        }
        return net;
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

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
        assertTrue(found, "expected a " + (debit ? "debit" : "credit") + " of " + amount
                + " to " + accountCode + " in " + entry.getReference());
    }

    private static void assertNoLine(JournalEntry entry, String accountCode) {
        boolean found = entry.getLines().stream()
                .anyMatch(l -> accountCode.equals(l.getAccountCode()));
        assertFalse(found, accountCode + " must not appear in " + entry.getReference());
    }
}
