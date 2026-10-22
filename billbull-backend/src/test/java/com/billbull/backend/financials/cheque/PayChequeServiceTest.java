package com.billbull.backend.financials.cheque;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeRequest;
import com.billbull.backend.financials.cheque.PayChequeDtos.ChequeView;
import com.billbull.backend.financials.cheque.PayChequeDtos.PendingSource;
import com.billbull.backend.financials.cheque.PayChequeDtos.SourceRef;
import com.billbull.backend.financials.cheque.PayChequeDtos.TransitionRequest;
import com.billbull.backend.financials.expense.Expense;
import com.billbull.backend.financials.expense.ExpenseRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.payment.PaymentMode;
import com.billbull.backend.purchase.payment.PaymentStatus;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherService;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.settings.branch.BranchAccessService;

@ExtendWith(MockitoExtension.class)
class PayChequeServiceTest {

    @Mock private PayChequeRepository chequeRepository;
    @Mock private ChequeBookRepository bookRepository;
    @Mock private PayChequeAllocationRepository allocationRepository;
    @Mock private PayChequeEventRepository eventRepository;
    @Mock private PaymentVoucherRepository paymentVoucherRepository;
    @Mock private ExpenseRepository expenseRepository;
    @Mock private PurchaseInvoiceRepository purchaseInvoiceRepository;
    @Mock private AccountRepository accountRepository;
    @Mock private BranchAccessService branchAccessService;
    @Mock private PaymentVoucherService paymentVoucherService;
    @Mock private PostingEngineService postingEngineService;
    @Mock private JournalEntryRepository journalEntryRepository;

    private PayChequeService service;
    /** Allocations "persisted" through the mocked repository, so detail views can read them back. */
    private final List<PayChequeAllocation> stored = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new PayChequeService(chequeRepository, bookRepository, allocationRepository, eventRepository,
                paymentVoucherRepository, expenseRepository, purchaseInvoiceRepository, accountRepository,
                branchAccessService, paymentVoucherService, postingEngineService, journalEntryRepository);

        lenient().when(chequeRepository.countByBookAndStatusIn(anyCollection())).thenReturn(List.of());
        lenient().when(chequeRepository.save(any(PayCheque.class))).thenAnswer(inv -> {
            PayCheque c = inv.getArgument(0);
            if (c.getId() == null) c.setId(500L);
            return c;
        });
        lenient().when(allocationRepository.saveAll(any())).thenAnswer(inv -> {
            Iterable<PayChequeAllocation> rows = inv.getArgument(0);
            rows.forEach(a -> { if (!stored.contains(a)) stored.add(a); });
            return rows;
        });
        lenient().when(allocationRepository.findByPayChequeIdIn(anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(0);
            return stored.stream().filter(a -> ids.contains(a.getPayChequeId())).toList();
        });
        lenient().when(allocationRepository.findByPayChequeIdAndActiveTrue(any())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return stored.stream().filter(a -> id.equals(a.getPayChequeId()) && a.isActive()).toList();
        });
        lenient().when(eventRepository.findByPayChequeIdOrderByCreatedAtAscIdAsc(any())).thenReturn(List.of());
        lenient().when(accountRepository.findByCode("1010")).thenReturn(account("acc-1010", "1010", "Bank Account (Main)"));
        lenient().when(accountRepository.findByCode("1011")).thenReturn(account("acc-1011", "1011", "Bank Account (Collection)"));
    }

    // ── Cheque due ──────────────────────────────────────────────────────────

    @Test
    void pendingVendorDueListsOnlyWhatTheRepositoryReportsAsUnallottedWithInvoiceNumbers() {
        when(branchAccessService.currentListScope()).thenReturn(new BranchAccessService.ListScope(true, Set.of()));
        PaymentVoucher pv = voucher(11L, "VEN-A", "Vendor A", "2500.00", PaymentStatus.POSTED, "1010");
        pv.setInvoiceId(77L);
        when(allocationRepository.findPendingChequeVouchers(eq(true), anyCollection())).thenReturn(List.of(pv));
        PurchaseInvoice invoice = new PurchaseInvoice();
        invoice.setId(77L);
        invoice.setInvoiceNumber("PINV-2026-0008");
        when(purchaseInvoiceRepository.findAllById(any())).thenReturn(List.of(invoice));

        List<PendingSource> pending = service.listPending(PayChequeType.VENDOR);

        assertEquals(1, pending.size());
        PendingSource row = pending.get(0);
        assertEquals(new BigDecimal("2500.00"), row.amount());
        assertEquals("PINV-2026-0008", row.reference());
        assertEquals("V:ven-a", row.payeeKey());
        assertEquals("1010", row.bankCode());
    }

    // ── Create ──────────────────────────────────────────────────────────────

    @Test
    void createSumsTheChosenVouchersTakesTheNextLeafAndAdvancesTheBook() {
        ChequeBook book = book(1L, "1010", "000147");
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "1500.00", PaymentStatus.POSTED, "1010"),
                voucher(12L, "VEN-A", "Vendor A", "1000.00", PaymentStatus.POSTED, "1010 — Bank Account (Main)")));

        ChequeView view = service.create(vendorRequest(1L, null, 11L, 12L));

        assertEquals(new BigDecimal("2500.00"), view.amount());
        assertEquals("000147", view.chequeNumber());
        assertEquals("000148", book.getNextChequeNumber());
        assertEquals(PayChequeStatus.DRAFT, view.status());
        assertEquals("VEN-A", view.vendorId());
        assertEquals(2, view.allocations().size());
    }

    @Test
    void createRejectsPaymentsForTwoDifferentVendors() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "1500.00", PaymentStatus.POSTED, "1010"),
                voucher(12L, "VEN-B", "Vendor B", "1000.00", PaymentStatus.POSTED, "1010")));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(vendorRequest(1L, null, 11L, 12L)));
        assertTrue(ex.getReason().contains("same vendor"));
        verify(chequeRepository, never()).save(any());
    }

    @Test
    void createRejectsAVoucherThatIsNotPostedYet() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "1500.00", PaymentStatus.PENDING_APPROVAL, "1010")));

        assertThrows(ResponseStatusException.class, () -> service.create(vendorRequest(1L, null, 11L)));
    }

    @Test
    void createRejectsAChequeBookOnADifferentBankLedgerThanThePayment() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "1500.00", PaymentStatus.POSTED, "1011")));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(vendorRequest(1L, null, 11L)));
        assertTrue(ex.getReason().contains("1011"));
    }

    @Test
    void createRejectsAPaymentAlreadyOnAnotherLiveCheque() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "1500.00", PaymentStatus.POSTED, "1010")));
        PayChequeAllocation other = new PayChequeAllocation();
        other.setPayChequeId(99L);
        other.setSourceId(11L);
        when(allocationRepository.findBySourceTypeAndSourceIdInAndActiveTrue(
                eq(PayChequeSourceType.PAYMENT_VOUCHER), anyCollection())).thenReturn(List.of(other));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.create(vendorRequest(1L, null, 11L)));
        assertTrue(ex.getReason().contains("another cheque"));
    }

    @Test
    void createRejectsAChequeNumberAlreadyLiveInTheBook() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        when(chequeRepository.existsLiveNumber(1L, "000120", null)).thenReturn(true);

        assertThrows(ResponseStatusException.class, () -> service.create(vendorRequest(1L, "000120", 11L)));
    }

    @Test
    void createExpenseChequeUsesTheExpenseTotalIncludingTax() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        Expense e = new Expense();
        e.setId(31L);
        e.setVendor("Dubai Municipality");
        e.setPaymentMode("Cheque");
        e.setStatus("Paid");
        e.setAmount(new BigDecimal("1000.00"));
        e.setTotal(new BigDecimal("1050.00"));
        e.setPaymentAccountId("acc-1010");
        when(expenseRepository.findAllById(any())).thenReturn(List.of(e));
        when(accountRepository.findById("acc-1010")).thenReturn(Optional.of(account("acc-1010", "1010", "Bank")));

        ChequeView view = service.create(new ChequeRequest(PayChequeType.EXPENSE, 1L, null, LocalDate.of(2026, 10, 16),
                "Dubai Municipality", null, List.of(new SourceRef(PayChequeSourceType.EXPENSE, 31L))));

        assertEquals(new BigDecimal("1050.00"), view.amount());
        assertEquals("EXP-31", view.allocations().get(0).sourceNumber());
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    @Test
    void fullLifecycleDraftToReconciled() {
        PayCheque cheque = cheque(PayChequeStatus.DRAFT);
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque));
        stored.add(liveAllocation(500L, 11L));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "2500.00", PaymentStatus.POSTED, "1010")));

        assertEquals(PayChequeStatus.APPROVED, service.approve(500L, null).status());
        assertEquals(PayChequeStatus.PRINTED, service.recordPrint(500L, null).status());
        ChequeView reprinted = service.recordPrint(500L, null);
        assertEquals(2, reprinted.printCount());
        assertEquals(PayChequeStatus.ISSUED, service.issue(500L, null).status());
        ChequeView paid = service.markPaid(500L, new TransitionRequest(LocalDate.of(2026, 10, 20), null));
        assertEquals(PayChequeStatus.PAID, paid.status());
        assertEquals(LocalDate.of(2026, 10, 20), paid.paidDate());
        ChequeView reconciled = service.reconcile(500L, new TransitionRequest(LocalDate.of(2026, 10, 22), null));
        assertEquals(PayChequeStatus.RECONCILED, reconciled.status());
    }

    @Test
    void stepsCannotBeSkipped() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.DRAFT)));

        assertThrows(ResponseStatusException.class, () -> service.recordPrint(500L, null));
        assertThrows(ResponseStatusException.class, () -> service.issue(500L, null));
        assertThrows(ResponseStatusException.class, () -> service.markPaid(500L, null));
        assertThrows(ResponseStatusException.class, () -> service.reconcile(500L, null));
    }

    @Test
    void approveFailsWhenAVoucherWasRejectedAfterTheDraftWasSaved() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.DRAFT)));
        stored.add(liveAllocation(500L, 11L));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "2500.00", PaymentStatus.REJECTED, "1010")));

        assertThrows(ResponseStatusException.class, () -> service.approve(500L, null));
    }

    @Test
    void cancelReleasesAllocationsSoThePaymentReturnsToTheDue() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.APPROVED)));
        PayChequeAllocation a = liveAllocation(500L, 11L);
        stored.add(a);

        ChequeView view = service.cancel(500L, null);

        assertEquals(PayChequeStatus.CANCELLED, view.status());
        assertFalse(a.isActive());
    }

    @Test
    void cancellingAnIssuedChequeNeedsAReasonAndAPaidChequeCannotBeCancelled() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.ISSUED)));
        assertThrows(ResponseStatusException.class, () -> service.cancel(500L, null));

        when(chequeRepository.findByIdWithBook(501L)).thenReturn(Optional.of(cheque(PayChequeStatus.PAID)));
        assertThrows(ResponseStatusException.class, () -> service.cancel(501L, new TransitionRequest(null, "lost")));
    }

    // ── Ledger timing (V120) ────────────────────────────────────────────────

    @Test
    void aChequePendingVoucherHandsItsLedgerMovementToTheChequeButALegacyPostedOneDoesNot() {
        when(bookRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(book(1L, "1010", "000147")));
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "1500.00", PaymentStatus.CHEQUE_PENDING, "1010"),
                voucher(12L, "VEN-A", "Vendor A", "1000.00", PaymentStatus.POSTED, "1010")));

        ChequeView view = service.create(vendorRequest(1L, null, 11L, 12L));

        assertTrue(view.allocations().stream().filter(a -> a.sourceId() == 11L).findFirst().orElseThrow().postsGl());
        assertFalse(view.allocations().stream().filter(a -> a.sourceId() == 12L).findFirst().orElseThrow().postsGl());
    }

    @Test
    void issuePaysTheVouchersAndPostsApToPostDatedCheques() {
        PayCheque cheque = cheque(PayChequeStatus.PRINTED);
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque));
        PayChequeAllocation a = liveAllocation(500L, 11L);
        a.setPostsGl(true);
        stored.add(a);
        PaymentVoucher pv = voucher(11L, "VEN-A", "Vendor A", "2500.00", PaymentStatus.CHEQUE_PENDING, "1010");
        pv.setInvoiceId(77L);
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(pv));
        LocalDate issueDate = LocalDate.of(2026, 10, 18);

        service.issue(500L, new TransitionRequest(issueDate, null));

        verify(paymentVoucherService).issueChequePayment(11L, issueDate);
        verify(postingEngineService).createJournalFromChequeIssue(eq(500L), eq("000147"), eq("Vendor A"), eq(issueDate),
                eq(List.of(new PostingEngineService.ChequeIssueLine("PV-11", new BigDecimal("2500.00"), false))), any());
    }

    @Test
    void paidCreditsTheChequeBooksBankOnlyForTheChequesOwnLedgerAmount() {
        PayCheque cheque = cheque(PayChequeStatus.ISSUED);
        cheque.getChequeBook().setGlAccountName("Bank Account (Main)");
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque));
        PayChequeAllocation owned = liveAllocation(500L, 11L);
        owned.setPostsGl(true);
        PayChequeAllocation legacy = liveAllocation(500L, 12L);
        legacy.setAmount(new BigDecimal("700.00"));
        stored.add(owned);
        stored.add(legacy);
        LocalDate paid = LocalDate.of(2026, 10, 25);

        service.markPaid(500L, new TransitionRequest(paid, null));

        verify(postingEngineService).createJournalFromChequePaid(eq(500L), eq("000147"), eq("Vendor A"), eq(paid),
                eq(new BigDecimal("2500.00")), eq("1010"), eq("Bank Account (Main)"), any());
    }

    @Test
    void legacyOnlyChequePostsNothingAtIssueOrPaid() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.PRINTED)));
        stored.add(liveAllocation(500L, 11L));

        service.issue(500L, null);
        service.markPaid(500L, null);

        verify(paymentVoucherService, never()).issueChequePayment(any(), any());
        verify(postingEngineService, never()).createJournalFromChequeIssue(any(), any(), any(), any(), any(), any());
        verify(postingEngineService, never()).createJournalFromChequePaid(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void cancellingAnIssuedChequeReversesTheIssueAndReopensTheVoucher() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.ISSUED)));
        PayChequeAllocation a = liveAllocation(500L, 11L);
        a.setPostsGl(true);
        stored.add(a);
        when(paymentVoucherRepository.findAllById(any())).thenReturn(List.of(
                voucher(11L, "VEN-A", "Vendor A", "2500.00", PaymentStatus.POSTED, "1010")));

        service.cancel(500L, new TransitionRequest(null, "Vendor lost the cheque"));

        verify(paymentVoucherService).reverseChequePayment(11L);
        verify(postingEngineService).reverseJournalFromChequeIssue(eq(500L), eq("000147"), eq("Vendor A"), any(),
                eq(List.of(new PostingEngineService.ChequeIssueLine("PV-11", new BigDecimal("2500.00"), false))), any());
        assertFalse(a.isActive());
    }

    @Test
    void cancellingBeforeIssuePostsNothing() {
        when(chequeRepository.findByIdWithBook(500L)).thenReturn(Optional.of(cheque(PayChequeStatus.PRINTED)));
        PayChequeAllocation a = liveAllocation(500L, 11L);
        a.setPostsGl(true);
        stored.add(a);

        service.cancel(500L, new TransitionRequest(null, "Spoiled leaf"));

        verify(paymentVoucherService, never()).reverseChequePayment(any());
        verify(postingEngineService, never()).reverseJournalFromChequeIssue(any(), any(), any(), any(), any(), any());
    }

    // ── Numbering ───────────────────────────────────────────────────────────

    @Test
    void incrementKeepsWidthAndPrefix() {
        assertEquals("000148", PayChequeService.incrementNumber("000147"));
        assertEquals("001000", PayChequeService.incrementNumber("000999"));
        assertEquals("CHQ-0100", PayChequeService.incrementNumber("CHQ-0099"));
        assertEquals("1000", PayChequeService.incrementNumber("999"));
    }

    @Test
    void usingAnEarlierLeafDoesNotMoveTheBookBackwards() {
        ChequeBook book = book(1L, "1010", "000150");
        PayChequeService.advanceBook(book, "000140");
        assertEquals("000150", book.getNextChequeNumber());
        PayChequeService.advanceBook(book, "000155");
        assertEquals("000156", book.getNextChequeNumber());
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private static ChequeRequest vendorRequest(Long bookId, String number, Long... voucherIds) {
        List<SourceRef> refs = new ArrayList<>();
        for (Long id : voucherIds) refs.add(new SourceRef(PayChequeSourceType.PAYMENT_VOUCHER, id));
        return new ChequeRequest(PayChequeType.VENDOR, bookId, number, LocalDate.of(2026, 10, 16),
                "Vendor A", null, refs);
    }

    private static PaymentVoucher voucher(Long id, String vendorId, String vendorName, String amount,
                                          PaymentStatus status, String bankAccount) {
        PaymentVoucher v = new PaymentVoucher();
        v.setId(id);
        v.setVoucherNumber("PV-" + id);
        v.setVendorId(vendorId);
        v.setVendorName(vendorName);
        v.setAmount(new BigDecimal(amount));
        v.setPaymentMode(PaymentMode.CHEQUE);
        v.setStatus(status);
        v.setBankAccount(bankAccount);
        v.setPaymentDate(LocalDate.of(2026, 10, 16));
        return v;
    }

    private static ChequeBook book(Long id, String glCode, String next) {
        ChequeBook b = new ChequeBook();
        b.setId(id);
        b.setBankName("Emirates NBD");
        b.setGlAccountCode(glCode);
        b.setNextChequeNumber(next);
        return b;
    }

    private static PayCheque cheque(PayChequeStatus status) {
        PayCheque c = new PayCheque();
        c.setId(500L);
        c.setChequeBook(book(1L, "1010", "000148"));
        c.setChequeNumber("000147");
        c.setPaymentType(PayChequeType.VENDOR);
        c.setPayeeName("Vendor A");
        c.setChequeDate(LocalDate.of(2026, 10, 16));
        c.setAmount(new BigDecimal("2500.00"));
        c.setStatus(status);
        return c;
    }

    private static PayChequeAllocation liveAllocation(Long chequeId, Long sourceId) {
        PayChequeAllocation a = new PayChequeAllocation();
        a.setPayChequeId(chequeId);
        a.setSourceType(PayChequeSourceType.PAYMENT_VOUCHER);
        a.setSourceId(sourceId);
        a.setSourceNumber("PV-" + sourceId);
        a.setAmount(new BigDecimal("2500.00"));
        a.setActive(true);
        return a;
    }

    private static Account account(String id, String code, String name) {
        Account a = new Account();
        a.setId(id);
        a.setCode(code);
        a.setName(name);
        return a;
    }
}
