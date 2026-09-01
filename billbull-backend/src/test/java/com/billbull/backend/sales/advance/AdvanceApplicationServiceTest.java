package com.billbull.backend.sales.advance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Covers the plan's manual-verification scenarios for advance application:
 * partial application against one advance, and the validation guards that
 * must reject bad manual-apply requests before any AdvanceApplication row
 * or journal is created.
 */
@ExtendWith(MockitoExtension.class)
class AdvanceApplicationServiceTest {

    @Mock private AdvanceApplicationRepository applicationRepo;
    @Mock private ReceiptVoucherRepository receiptRepo;
    @Mock private SalesInvoiceRepository salesInvoiceRepo;
    @Mock private PostingEngineService postingEngine;
    @Mock private com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService receiptVoucherService;
    @Mock private com.billbull.backend.pos.session.PosSessionService posSessionService;
    @Mock private com.billbull.backend.pos.session.PosDrawerSessionValidator drawerSessionValidator;
    @Mock private AdvanceCashRefundService cashRefundService;
    @Mock private jakarta.persistence.EntityManager entityManager;
    @Mock private com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService;

    private AdvanceApplicationService service;

    @BeforeEach
    void setUp() {
        service = new AdvanceApplicationService(applicationRepo, receiptRepo, salesInvoiceRepo, postingEngine, receiptVoucherService, posSessionService, drawerSessionValidator, cashRefundService, entityManager, effectiveCorrectionViewService);

        org.mockito.Mockito.lenient().when(effectiveCorrectionViewService.resolveOverlays(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any()))
                .thenAnswer(i -> i.getArgument(1));
    }

    private ReceiptVoucher advance(Long id, String customerCode, BigDecimal amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setId(id);
        rv.setCustomerCode(customerCode);
        rv.setAmount(amount);
        rv.setVoucherId("RV-" + id);
        return rv;
    }

    private SalesInvoice invoice(String number, String customerCode, BigDecimal balance) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setCustomerCode(customerCode);
        inv.setBalance(balance);
        return inv;
    }

    // ---- Scenario A: partial application ----

    @Test
    void appliesPartialAmountAndLeavesRemainderOpen() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("600.00"))));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdvanceApplication result = service.apply(1L, "INV-1", new BigDecimal("600.00"), LocalDate.now());

        assertEquals(0, new BigDecimal("600.00").compareTo(result.getAppliedAmount()));
    }

    @Test
    void secondPartialApplicationRespectsRemainingOpenBalance() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-2"))
                .thenReturn(Optional.of(invoice("INV-2", "CUST-1", new BigDecimal("300.00"))));
        // 600 already applied from a prior call (Scenario A), 400 left open
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(new BigDecimal("600.00"));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdvanceApplication result = service.apply(1L, "INV-2", new BigDecimal("300.00"), LocalDate.now());

        assertEquals(0, new BigDecimal("300.00").compareTo(result.getAppliedAmount()));
    }

    // ---- Validation guards (never trust the caller) ----

    @Test
    void rejectsUnknownInvoice() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-MISSING")).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-MISSING", new BigDecimal("100.00"), LocalDate.now()));
    }

    @Test
    void rejectsInvoiceBelongingToAnotherCustomer() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-OTHER"))
                .thenReturn(Optional.of(invoice("INV-OTHER", "CUST-2", new BigDecimal("100.00"))));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-OTHER", new BigDecimal("100.00"), LocalDate.now()));
    }

    @Test
    void rejectsAlreadySettledInvoice() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-PAID"))
                .thenReturn(Optional.of(invoice("INV-PAID", "CUST-1", BigDecimal.ZERO)));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-PAID", new BigDecimal("50.00"), LocalDate.now()));
    }

    @Test
    void rejectsAmountExceedingInvoiceBalance() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("100.00"))));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-1", new BigDecimal("200.00"), LocalDate.now()));
    }

    @Test
    void rejectsAmountExceedingAdvanceOpenBalance() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("1000.00"))));
        // Advance already fully applied elsewhere
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(new BigDecimal("500.00"));

        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-1", new BigDecimal("1.00"), LocalDate.now()));
    }

    @Test
    void rejectsNonPositiveAmount() {
        assertThrows(IllegalArgumentException.class,
                () -> service.apply(1L, "INV-1", BigDecimal.ZERO, LocalDate.now()));
    }

    @Test
    void usesRowLockedLookupNotPlainFindById() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1"))
                .thenReturn(Optional.of(invoice("INV-1", "CUST-1", new BigDecimal("500.00"))));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.apply(1L, "INV-1", new BigDecimal("100.00"), LocalDate.now());

        org.mockito.Mockito.verify(receiptRepo).findByIdForUpdate(1L);
        org.mockito.Mockito.verify(receiptRepo, org.mockito.Mockito.never()).findById(any());
    }

    // ---- applyAgainstOutstandingInvoices: general receipt settles existing balance ----

    @Test
    void appliesReceiptAgainstOldestOutstandingInvoiceFirst() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        SalesInvoice older = invoice("INV-OLD", "CUST-1", new BigDecimal("400.00"));
        older.setInvoiceDate(LocalDate.of(2026, 1, 1));
        SalesInvoice newer = invoice("INV-NEW", "CUST-1", new BigDecimal("800.00"));
        newer.setInvoiceDate(LocalDate.of(2026, 2, 1));
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of(older, newer));

        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-OLD")).thenReturn(Optional.of(older));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-NEW")).thenReturn(Optional.of(newer));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal totalApplied = service.applyAgainstOutstandingInvoices("CUST-1", 1L);

        // 400 to the older invoice, remaining 600 of the 1000 open advance to the newer one
        assertEquals(0, new BigDecimal("1000.00").compareTo(totalApplied));
        org.mockito.Mockito.verify(salesInvoiceRepo).findByInvoiceNumber("INV-OLD");
        org.mockito.Mockito.verify(salesInvoiceRepo).findByInvoiceNumber("INV-NEW");
    }

    @Test
    void leavesRemainderUnappliedWhenAdvanceExceedsOutstandingInvoices() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("1000.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        SalesInvoice onlyInvoice = invoice("INV-1", "CUST-1", new BigDecimal("300.00"));
        onlyInvoice.setInvoiceDate(LocalDate.of(2026, 1, 1));
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of(onlyInvoice));

        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1")).thenReturn(Optional.of(onlyInvoice));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal totalApplied = service.applyAgainstOutstandingInvoices("CUST-1", 1L);

        // Only the 300 outstanding balance gets applied; the remaining 700 stays an open advance
        assertEquals(0, new BigDecimal("300.00").compareTo(totalApplied));
    }

    @Test
    void noOutstandingInvoicesLeavesAdvanceFullyOpen() {
        ReceiptVoucher rv = advance(1L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc("CUST-1"))
                .thenReturn(List.of());

        BigDecimal totalApplied = service.applyAgainstOutstandingInvoices("CUST-1", 1L);

        assertEquals(0, BigDecimal.ZERO.compareTo(totalApplied));
        org.mockito.Mockito.verify(applicationRepo, org.mockito.Mockito.never()).save(any());
    }

    // ---- FIFO ordering plumbing ----

    @Test
    void findOpenAdvancesUsesDbLevelFifoOrdering() {
        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(advance(1L, "CUST-1", new BigDecimal("500.00"))));
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);

        List<AdvanceApplicationService.AdvanceBalance> result = service.findOpenAdvances("CUST-1");

        assertEquals(1, result.size());
        org.mockito.Mockito.verify(receiptRepo)
                .findByCustomerCodeAndPurposeOrderByDateAsc(eq("CUST-1"), any());
        org.mockito.Mockito.verify(receiptRepo, org.mockito.Mockito.never())
                .findByCustomerCodeAndPurpose(any(), any());
    }
    // ---- applyAvailableAdvancesToInvoice ----

    @Test
    void applyAvailableAdvancesToInvoice_Success() {
        ReceiptVoucher rv1 = advance(1L, "CUST-1", new BigDecimal("500.00"));
        ReceiptVoucher rv2 = advance(2L, "CUST-1", new BigDecimal("300.00"));

        when(receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                eq("CUST-1"), eq(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(rv1, rv2));
        
        when(applicationRepo.sumAppliedByReceiptId(1L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.sumAppliedByReceiptId(2L)).thenReturn(BigDecimal.ZERO);

        SalesInvoice invoice = invoice("INV-1", "CUST-1", new BigDecimal("600.00"));
        
        // Mock apply() internals for rv1
        when(receiptRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(rv1));
        when(receiptRepo.findByIdForUpdate(2L)).thenReturn(Optional.of(rv2));
        when(salesInvoiceRepo.findByInvoiceNumber("INV-1")).thenReturn(Optional.of(invoice));
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal totalApplied = service.applyAvailableAdvancesToInvoice("CUST-1", "INV-1", new BigDecimal("600.00"), LocalDate.now());

        assertEquals(0, new BigDecimal("600.00").compareTo(totalApplied));
        
        org.mockito.Mockito.verify(applicationRepo, org.mockito.Mockito.times(2)).save(any());
    }

    // ── Drawer attribution on advance receipt (release 1 item 2) ──────────────────────────
    //
    // aggregateTender reads ADVANCE_RECEIVED vouchers by posSessionId as part of Cash Tender
    // Collected, so a cash advance taken at a till must carry the collecting session or the
    // drawer closes over by that amount. The previous terminalId form inferred the session and
    // silently produced an unattributed voucher when none was open.

    @Test
    void cashAdvanceStampsTheDeclaredDrawerSessionOnTheVoucher() {
        com.billbull.backend.pos.session.PosSession session = new com.billbull.backend.pos.session.PosSession();
        org.springframework.test.util.ReflectionTestUtils.setField(session, "id", 77L);
        session.setTerminalId("POS-01");
        session.setCounterName("Counter 1");
        session.setBranchId(3L);
        session.setSessionDate(LocalDate.of(2026, 8, 31));

        when(drawerSessionValidator.validateOptionalDrawerSession(eq(77L), any())).thenReturn(session);
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any()))
                .thenAnswer(inv -> inv.getArgument(0));

        service.receiveAdvance("CUST-1", new BigDecimal("200.00"), "Cash", null, 77L, "Acme", "note");

        org.mockito.ArgumentCaptor<ReceiptVoucher> captor =
                org.mockito.ArgumentCaptor.forClass(ReceiptVoucher.class);
        org.mockito.Mockito.verify(receiptVoucherService).createReceipt(captor.capture(), any());
        ReceiptVoucher saved = captor.getValue();

        assertEquals(77L, saved.getPosSessionId());
        assertEquals("POS-01", saved.getPosTerminalId());
        assertEquals("Counter 1", saved.getPosCounterName());
        // Dated into the session's business day, not today's calendar date.
        assertEquals(LocalDate.of(2026, 8, 31), saved.getDate());
        // Detail the POS screen used to set directly must survive the reroute.
        assertEquals("Acme", saved.getMemberName());
        assertEquals("note", saved.getNotes());
    }

    @Test
    void backOfficeAdvanceWithNoDeclaredSessionIsNeverAttributedToADrawer() {
        when(drawerSessionValidator.validateOptionalDrawerSession(eq(null), any())).thenReturn(null);
        when(receiptVoucherService.createReceipt(any(ReceiptVoucher.class), any()))
                .thenAnswer(inv -> inv.getArgument(0));

        service.receiveAdvance("CUST-1", new BigDecimal("200.00"), "Cash", null, null);

        org.mockito.ArgumentCaptor<ReceiptVoucher> captor =
                org.mockito.ArgumentCaptor.forClass(ReceiptVoucher.class);
        org.mockito.Mockito.verify(receiptVoucherService).createReceipt(captor.capture(), any());
        assertNull(captor.getValue().getPosSessionId());
        // No session is discovered from a terminal, and none is invented.
        org.mockito.Mockito.verifyNoInteractions(posSessionService);
    }

    // ── Advance cash refund books the drawer cash-out (release 1 item 3) ───────────────────

    @Test
    void cashRefundBooksTheDrawerMovementAndStillPostsTheOriginalJournal() {
        ReceiptVoucher rv = advance(5L, "CUST-1", new BigDecimal("500.00"));
        rv.setVoucherId("RV-0005");
        when(receiptRepo.findById(5L)).thenReturn(Optional.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(5L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> {
            AdvanceApplication a = inv.getArgument(0);
            org.springframework.test.util.ReflectionTestUtils.setField(a, "id", 55L);
            return a;
        });

        service.refund(5L, new BigDecimal("100.00"), "Cash", 9L, AdvanceRefundCashSource.POS_DRAWER);

        // Drawer ledger gains the cash-out, keyed to the declared session.
        org.mockito.Mockito.verify(cashRefundService)
                .recordCashRefund(eq(55L), eq(new BigDecimal("100.00")), eq("Cash"), eq(9L),
                        eq(AdvanceRefundCashSource.POS_DRAWER), eq("RV-0005"));
        // Accounting semantics are untouched: the advance-refund journal still posts exactly
        // as before, and it is the only journal for this refund.
        org.mockito.Mockito.verify(postingEngine)
                .createJournalFromAdvanceRefund(eq(5L), eq(new BigDecimal("100.00")), eq("Cash"));
    }

    @Test
    void nonCashRefundPassesThroughWithNoDrawerSession() {
        ReceiptVoucher rv = advance(5L, "CUST-1", new BigDecimal("500.00"));
        when(receiptRepo.findById(5L)).thenReturn(Optional.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(5L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.refund(5L, new BigDecimal("100.00"), "Bank");

        // The service is still consulted; it is the one place that decides cash vs non-cash.
        org.mockito.Mockito.verify(cashRefundService)
                .recordCashRefund(any(), eq(new BigDecimal("100.00")), eq("Bank"), eq(null), any(), any());
    }

    @Test
    void backOfficeCashRefundStillWorksWithNoPosSession() {
        // Regression guard for the back-office path: it must keep working without a till, and
        // must not reach the drawer ledger.
        ReceiptVoucher rv = advance(5L, "CUST-1", new BigDecimal("500.00"));
        rv.setVoucherId("RV-0005");
        when(receiptRepo.findById(5L)).thenReturn(Optional.of(rv));
        when(applicationRepo.sumAppliedByReceiptId(5L)).thenReturn(BigDecimal.ZERO);
        when(applicationRepo.save(any())).thenAnswer(inv -> {
            AdvanceApplication a = inv.getArgument(0);
            org.springframework.test.util.ReflectionTestUtils.setField(a, "id", 56L);
            return a;
        });

        AdvanceApplication saved = service.refund(
                5L, new BigDecimal("100.00"), "Cash", null, AdvanceRefundCashSource.BACK_OFFICE);

        assertEquals("REFUNDED", saved.getStatus());
        // Accounting behaviour preserved exactly: the same journal, unchanged.
        org.mockito.Mockito.verify(postingEngine)
                .createJournalFromAdvanceRefund(eq(5L), eq(new BigDecimal("100.00")), eq("Cash"));
        // Routed with the BACK_OFFICE source and no session; the service books no movement.
        org.mockito.Mockito.verify(cashRefundService).recordCashRefund(
                eq(56L), eq(new BigDecimal("100.00")), eq("Cash"), eq(null),
                eq(AdvanceRefundCashSource.BACK_OFFICE), eq("RV-0005"));
    }
}
