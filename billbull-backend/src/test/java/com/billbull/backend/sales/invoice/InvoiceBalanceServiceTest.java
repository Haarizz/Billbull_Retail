package com.billbull.backend.sales.invoice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.advance.AdvanceApplicationRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;

/**
 * The one owner of {@code amountPaid} / {@code returnCredited} / {@code balance} /
 * {@code status} on a sales invoice.
 *
 * <p>Before this class there were two independent owners that did not know about each other:
 * {@code SalesInvoiceService.finalizeInvoiceTotals} on every invoice save, and
 * {@code ReceiptVoucherService.syncLinkedInvoice} on every receipt change. A term added to one
 * was erased by the other, so a return credit would have survived only until the customer next
 * paid something — precisely when it matters.
 *
 * <p>The decisive case here is {@link #allThreeCallersAgreeOnTheSameLedgerPosition()}: the three
 * paths that write an invoice balance must land on the same number for the same ledger
 * position, or the fragmentation is back.
 */
@ExtendWith(MockitoExtension.class)
class InvoiceBalanceServiceTest {

    private static final String INVOICE = "INV-2026-04812";

    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private ReceiptVoucherRepository receiptVoucherRepository;
    @Mock private AdvanceApplicationRepository advanceApplicationRepository;
    @Mock private SalesReturnCreditApplicationRepository returnCreditApplicationRepository;

    @InjectMocks private InvoiceBalanceService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "receiptVoucherRepository", receiptVoucherRepository);
        ReflectionTestUtils.setField(service, "advanceApplicationRepository", advanceApplicationRepository);
        ReflectionTestUtils.setField(service, "returnCreditApplicationRepository",
                returnCreditApplicationRepository);
    }

    // ---------------------------------------------------------------------------
    // The formula
    // ---------------------------------------------------------------------------

    @Test
    void balanceIsTheInvoiceTotalLessWhatWasPaidAndWhatWasCredited() {
        assertMoney("2000.00", InvoiceBalanceService.project(
                money("10000"), money("6000"), money("2000")));
    }

    @Test
    void balanceIsFlooredAtZeroPerInvoice() {
        // Combined with the min() cap on the allocation itself, this is what makes a negative
        // receivable structurally impossible rather than floored after the fact.
        assertMoney("0.00", InvoiceBalanceService.project(
                money("10000"), money("8000"), money("5000")));
    }

    @Test
    void nullMoneyIsTreatedAsZero() {
        assertMoney("10000.00", InvoiceBalanceService.project(money("10000"), null, null));
        assertMoney("0.00", InvoiceBalanceService.project(null, money("500"), null));
    }

    // ---------------------------------------------------------------------------
    // The ledger read
    // ---------------------------------------------------------------------------

    @Test
    void recomputeFoldsReceiptsAdvanceApplicationsAndReturnCreditsIntoOneBalance() {
        SalesInvoice invoice = postedInvoice("10000.00");
        stubLedgers(invoice, List.of(completedReceipt("4000.00"), completedReceipt("2000.00")),
                "1000.00", "500.00");

        service.recomputeInvoiceBalance(invoice);

        // Receipts 6,000 + advance applications 1,000 = 7,000 paid; 500 credited.
        assertMoney("7000.00", invoice.getAmountPaid());
        assertMoney("500.00", invoice.getReturnCredited());
        assertMoney("2500.00", invoice.getBalance());
        verify(salesInvoiceRepository).save(invoice);
    }

    @Test
    void onlyCompletedReceiptsCount() {
        SalesInvoice invoice = postedInvoice("1000.00");
        ReceiptVoucher pending = completedReceipt("400.00");
        pending.setStatus("Pending");
        stubLedgers(invoice, List.of(completedReceipt("600.00"), pending), "0.00", "0.00");

        service.recomputeInvoiceBalance(invoice);

        assertMoney("600.00", invoice.getAmountPaid());
        assertMoney("400.00", invoice.getBalance());
    }

    @Test
    void anInvoiceClearedEntirelyByAReturnCreditReadsPaid() {
        // Otherwise an invoice sits at PARTIALLY_PAID forever with nothing outstanding, which is
        // what the AR aging and the collections list would both report.
        SalesInvoice invoice = postedInvoice("1000.00");
        invoice.setStatus(SalesInvoiceStatus.PARTIALLY_PAID);
        stubLedgers(invoice, List.of(completedReceipt("600.00")), "0.00", "400.00");

        service.recomputeInvoiceBalance(invoice);

        assertMoney("0.00", invoice.getBalance());
        assertEquals(SalesInvoiceStatus.PAID, invoice.getStatus());
    }

    @Test
    void aCancelledInvoiceIsNeverRewritten() {
        // Its figures are history: a later receipt or return must not restate them.
        SalesInvoice invoice = postedInvoice("1000.00");
        invoice.setStatus(SalesInvoiceStatus.CANCELLED);
        invoice.setBalance(money("777.00"));

        service.recomputeInvoiceBalance(invoice);

        assertMoney("777.00", invoice.getBalance());
        verify(salesInvoiceRepository, org.mockito.Mockito.never()).save(invoice);
    }

    // ---------------------------------------------------------------------------
    // Effective outstanding — what a return splits against
    // ---------------------------------------------------------------------------

    @Test
    void effectiveOutstandingIsAlreadyNetOfEarlierReturnCredits() {
        // This is refinement 2 of the model: without the credit term, two successive returns
        // against the same part-paid invoice would both see the same unpaid portion and both
        // claim it.
        SalesInvoice invoice = postedInvoice("10000.00");
        stubLedgers(invoice, List.of(completedReceipt("6000.00")), "0.00", "2000.00");

        assertMoney("2000.00", service.effectiveOutstanding(invoice));
    }

    @Test
    void aDraftOrCancelledInvoiceCarriesNoReceivableToSplitAgainst() {
        SalesInvoice draft = postedInvoice("10000.00");
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        assertMoney("0.00", service.effectiveOutstanding(draft));

        SalesInvoice cancelled = postedInvoice("10000.00");
        cancelled.setStatus(SalesInvoiceStatus.CANCELLED);
        assertMoney("0.00", service.effectiveOutstanding(cancelled));
    }

    @Test
    void effectiveOutstandingAgreesWithTheStoredBalanceItProjects() {
        SalesInvoice invoice = postedInvoice("10000.00");
        stubLedgers(invoice, List.of(completedReceipt("6000.00")), "500.00", "1500.00");

        BigDecimal outstanding = service.effectiveOutstanding(invoice);
        service.recomputeInvoiceBalance(invoice);

        assertEquals(0, outstanding.compareTo(invoice.getBalance()),
                "The live figure and the stored column must be the same formula.");
    }

    // ---------------------------------------------------------------------------
    // §3 — one owner, three callers
    // ---------------------------------------------------------------------------

    @Test
    void allThreeCallersAgreeOnTheSameLedgerPosition() {
        // Position: invoice 10,000, receipts 6,000, advances 0, return credit 2,000.
        // Caller 2 (ReceiptVoucherService.syncLinkedInvoice) and caller 3
        // (SalesReturnService, after writing an allocation) both reach the ledger-backed
        // recompute, so they are the same call by construction.
        SalesInvoice viaRecompute = postedInvoice("10000.00");
        stubLedgers(viaRecompute, List.of(completedReceipt("6000.00")), "0.00", "2000.00");
        service.recomputeInvoiceBalance(viaRecompute);

        // Caller 1 (SalesInvoiceService.finalizeInvoiceTotals) runs pre-persist on a
        // client-supplied instance and is collaborator-free, so it feeds the same figures into
        // the same pure arithmetic instead of reading the ledgers.
        SalesInvoice viaInvoiceSave = postedInvoice("10000.00");
        InvoiceBalanceService.applyMoney(viaInvoiceSave, money("6000.00"), money("2000.00"));

        assertEquals(0, viaRecompute.getBalance().compareTo(viaInvoiceSave.getBalance()),
                "The invoice-save path and the ledger recompute must not drift apart.");
        assertEquals(0, viaRecompute.getAmountPaid().compareTo(viaInvoiceSave.getAmountPaid()));
        assertEquals(0, viaRecompute.getReturnCredited().compareTo(viaInvoiceSave.getReturnCredited()));
        assertMoney("2000.00", viaRecompute.getBalance());
    }

    @Test
    void applyMoneyLeavesStatusAloneSoTheInvoiceSavePathKeepsItsOwnRules() {
        // finalizeInvoiceTotals is followed by the invoice-save path's own delivery-aware status
        // logic; overwriting status here would change that behaviour.
        SalesInvoice invoice = postedInvoice("10000.00");
        invoice.setStatus(SalesInvoiceStatus.CONFIRMED);

        InvoiceBalanceService.applyMoney(invoice, money("10000.00"), BigDecimal.ZERO);

        assertEquals(SalesInvoiceStatus.CONFIRMED, invoice.getStatus());
    }

    // ---------------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------------

    private SalesInvoice postedInvoice(String total) {
        SalesInvoice invoice = new SalesInvoice();
        ReflectionTestUtils.setField(invoice, "id", 42L);
        invoice.setInvoiceNumber(INVOICE);
        invoice.setInvoiceTotal(new BigDecimal(total));
        invoice.setStatus(SalesInvoiceStatus.POSTED);
        invoice.setDeliveryStatus(DeliveryStatus.DELIVERED);
        return invoice;
    }

    private void stubLedgers(SalesInvoice invoice, List<ReceiptVoucher> receipts,
                             String advancesApplied, String returnCredited) {
        lenient().when(receiptVoucherRepository.findBySalesInvoiceId(invoice.getId()))
                .thenReturn(new ArrayList<>(receipts));
        lenient().when(advanceApplicationRepository.sumAppliedByInvoiceNumber(anyString()))
                .thenReturn(new BigDecimal(advancesApplied));
        lenient().when(returnCreditApplicationRepository.sumAppliedByInvoiceNumber(anyString()))
                .thenReturn(new BigDecimal(returnCredited));
    }

    private static ReceiptVoucher completedReceipt(String amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setAmount(new BigDecimal(amount));
        rv.setStatus("Completed");
        return rv;
    }

    private static BigDecimal money(String v) {
        return v != null ? new BigDecimal(v) : null;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
