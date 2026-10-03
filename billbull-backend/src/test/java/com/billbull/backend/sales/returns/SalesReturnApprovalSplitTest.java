package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplication;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationStatus;

/**
 * The server is the accounting authority for a Sales Return's split.
 *
 * <p>What these cases pin, in order of how much damage the absence of each did:
 *
 * <ul>
 *   <li>{@code refundAmount} arrives from the browser and is <b>overwritten</b>, not defaulted.
 *       Before this, every settlement path read {@code refundAmount ?? totalAmount} and the
 *       return screen sent the full refund total, so the amount of cash that left the drawer was
 *       whatever the client said it was.</li>
 *   <li>The unpaid portion becomes an allocation row and a canonical balance recompute — never a
 *       direct write to {@code invoice.balance}, which the next receipt against that invoice
 *       would silently erase.</li>
 *   <li>A money-moving refund method is refused outright when nothing has been paid for, so the
 *       "hand over cash and leave the customer still owing" outcome is unreachable rather than
 *       discouraged.</li>
 *   <li>The split is read from the row-locked invoice the quantity guard took, so two concurrent
 *       returns cannot both consume the same outstanding.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnApprovalSplitTest {

    private static final String INVOICE = "INV-2026-04812";
    private static final String RETURN = "SR-2026-0031";
    private static final LocalDate BUSINESS_DATE = LocalDate.of(2026, 10, 1);

    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private com.billbull.backend.sales.invoice.SalesInvoiceRepository salesInvoiceRepository;
    @Mock private InvoiceBalanceService invoiceBalanceService;
    @Mock private SalesReturnCreditApplicationRepository returnCreditApplicationRepository;

    @InjectMocks private SalesReturnService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesReturnRepository", salesReturnRepository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "invoiceBalanceService", invoiceBalanceService);
        ReflectionTestUtils.setField(service, "returnCreditApplicationRepository",
                returnCreditApplicationRepository);
        lenient().when(salesReturnRepository.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    // ---------------------------------------------------------------------------
    // refundAmount must become server-derived (§7)
    // ---------------------------------------------------------------------------

    @Test
    void aClientSuppliedRefundAmountIsOverriddenByTheServerDerivedPaidPortion() {
        // Invoice 10,000, paid 6,000 -> outstanding 4,000. Return 2,000, so nothing is payable.
        SalesInvoice invoice = invoiceWithOutstanding("4000.00");
        SalesReturn pending = returnOf("2000.00");
        // The browser says "refund the lot" — which is exactly what it sends today.
        pending.setRefundAmount(new BigDecimal("2000.00"));

        SalesReturnSettlementSplit split = resolveSplit(pending, invoice);

        assertMoney("2000.00", split.unpaidPortion());
        assertMoney("0.00", split.paidPortion());
        assertMoney("0.00", pending.getRefundAmount());
    }

    @Test
    void aMaliciouslyInflatedRefundAmountCannotEnlargeThePaidPortion() {
        // Fully paid invoice, return 2,500 — so 2,500 is genuinely payable and no more.
        SalesInvoice invoice = invoiceWithOutstanding("0.00");
        SalesReturn pending = returnOf("2500.00");
        pending.setRefundAmount(new BigDecimal("99999.00"));

        SalesReturnSettlementSplit split = resolveSplit(pending, invoice);

        assertMoney("2500.00", split.paidPortion());
        assertMoney("2500.00", pending.getRefundAmount());
    }

    @Test
    void aMissingRefundAmountIsFilledFromTheSplitRatherThanFromTheTotal() {
        // The old fallback was `refundAmount ?? totalAmount`, which paid out the full return
        // value whenever the field was null. On a part-paid invoice that was money the customer
        // had never handed over.
        SalesInvoice invoice = invoiceWithOutstanding("2000.00");
        SalesReturn pending = returnOf("5000.00");
        pending.setRefundAmount(null);

        SalesReturnSettlementSplit split = resolveSplit(pending, invoice);

        assertMoney("2000.00", split.unpaidPortion());
        assertMoney("3000.00", split.paidPortion());
        assertMoney("3000.00", pending.getRefundAmount());
    }

    @Test
    void theSplitIsPersistedSoAReprintRendersStoredNumbers() {
        SalesInvoice invoice = invoiceWithOutstanding("2000.00");
        SalesReturn pending = returnOf("5000.00");

        resolveSplit(pending, invoice);

        verify(salesReturnRepository).save(pending);
        // unpaidPortion is recoverable as totalAmount - refundAmount, which is the same identity
        // the X/Z "Receivable credited" figure reads.
        assertMoney("2000.00", pending.getTotalAmount().subtract(pending.getRefundAmount()));
    }

    // ---------------------------------------------------------------------------
    // The split comes from the LOCKED invoice (§6)
    // ---------------------------------------------------------------------------

    @Test
    void theOutstandingIsReadFromTheLockedInvoiceInstanceNotFromAFreshQuery() {
        SalesInvoice locked = invoiceWithOutstanding("4000.00");
        SalesReturn pending = returnOf("2000.00");

        resolveSplit(pending, locked);

        // The identity of the instance matters: a second, unlocked read could be stale, and two
        // concurrent returns would then both claim the same outstanding.
        verify(invoiceBalanceService).effectiveOutstanding(locked);
        verify(salesInvoiceRepository, never()).findByInvoiceNumber(anyString());
    }

    @Test
    void aSecondReturnSeesAnOutstandingAlreadyNetOfTheFirstAllocation() {
        // Invoice 10,000 paid 6,000. SR-A returns 2,000 and allocates all of it.
        SalesInvoice invoice = invoiceWithOutstanding("4000.00");
        SalesReturn first = returnOf("2000.00");
        SalesReturnSettlementSplit firstSplit = resolveSplit(first, invoice);
        assertMoney("2000.00", firstSplit.unpaidPortion());

        // The canonical outstanding now reports 2,000 because the allocation is one of its terms
        // — it is not a figure this service subtracts for itself. SR-B therefore cannot claim the
        // same 2,000 again.
        when(invoiceBalanceService.effectiveOutstanding(invoice)).thenReturn(new BigDecimal("2000.00"));
        SalesReturn second = returnOf("3000.00");

        SalesReturnSettlementSplit secondSplit = resolveSplit(second, invoice);

        assertMoney("2000.00", secondSplit.unpaidPortion());
        assertMoney("1000.00", secondSplit.paidPortion());
        // Total credited across both returns is 4,000 — exactly what was ever outstanding.
        assertMoney("4000.00", firstSplit.unpaidPortion().add(secondSplit.unpaidPortion()));
    }

    @Test
    void anUnlinkedReturnIsWhollyPayableAndCreditsNothing() {
        SalesReturn pending = returnOf("750.00");
        pending.setLinkedInvoice(null);

        SalesReturnSettlementSplit split = resolveSplit(pending, null);

        assertMoney("0.00", split.unpaidPortion());
        assertMoney("750.00", split.paidPortion());
    }

    // ---------------------------------------------------------------------------
    // The allocation ledger (§8, §9)
    // ---------------------------------------------------------------------------

    @Test
    void theUnpaidPortionIsWrittenAsAnAppliedAllocationAndTheBalanceIsRecomputed() {
        SalesInvoice invoice = invoiceWithOutstanding("4000.00");
        SalesReturn approved = returnOf("2000.00");
        approved.setId(501L);

        applyCredit(approved, SalesReturnSettlementSplit.of(new BigDecimal("2000.00"),
                new BigDecimal("4000.00")), invoice);

        ArgumentCaptor<SalesReturnCreditApplication> row =
                ArgumentCaptor.forClass(SalesReturnCreditApplication.class);
        verify(returnCreditApplicationRepository).save(row.capture());
        assertEquals(501L, row.getValue().getSalesReturnId());
        assertEquals(RETURN, row.getValue().getReturnNumber());
        assertEquals(INVOICE, row.getValue().getInvoiceNumber());
        assertEquals(SalesReturnCreditApplicationStatus.APPLIED, row.getValue().getStatus());
        assertMoney("2000.00", row.getValue().getAppliedAmount());
        // The return's authoritative business date, so every leg lands on one day.
        assertEquals(BUSINESS_DATE, row.getValue().getAppliedDate());

        // The balance is a projection the canonical owner derives — never a direct write here.
        verify(invoiceBalanceService).recomputeInvoiceBalance(invoice);
    }

    @Test
    void theAllocationIsCreditedToTheInvoicesCustomerNotTheReturnsOwn() {
        SalesInvoice invoice = invoiceWithOutstanding("4000.00");
        invoice.setCustomerCode("CUS-INVOICE");
        SalesReturn approved = returnOf("2000.00");
        approved.setCustomerCode("CUS-STALE");

        applyCredit(approved, SalesReturnSettlementSplit.of(new BigDecimal("2000.00"),
                new BigDecimal("4000.00")), invoice);

        ArgumentCaptor<SalesReturnCreditApplication> row =
                ArgumentCaptor.forClass(SalesReturnCreditApplication.class);
        verify(returnCreditApplicationRepository).save(row.capture());
        assertEquals("CUS-INVOICE", row.getValue().getCustomerCode(),
                "The allocation cancels the invoice's receivable, so it belongs to that account.");
    }

    @Test
    void aFullyPaidReturnWritesNoAllocationRowAtAll() {
        SalesInvoice invoice = invoiceWithOutstanding("0.00");

        applyCredit(returnOf("2500.00"),
                SalesReturnSettlementSplit.of(new BigDecimal("2500.00"), BigDecimal.ZERO), invoice);

        verify(returnCreditApplicationRepository, never()).save(any());
        verify(invoiceBalanceService, never()).recomputeInvoiceBalance(any());
    }

    @Test
    void aRepeatedApprovalDoesNotAllocateTwice() {
        // §21 — the row lock is the primary guard and the unique index the hard one; this check
        // turns a retry into a no-op instead of a constraint violation.
        SalesInvoice invoice = invoiceWithOutstanding("4000.00");
        when(returnCreditApplicationRepository.existsByReturnNumberAndInvoiceNumberAndStatus(
                RETURN, INVOICE, SalesReturnCreditApplicationStatus.APPLIED)).thenReturn(true);

        applyCredit(returnOf("2000.00"),
                SalesReturnSettlementSplit.of(new BigDecimal("2000.00"), new BigDecimal("4000.00")),
                invoice);

        verify(returnCreditApplicationRepository, never()).save(any());
        verify(invoiceBalanceService, never()).recomputeInvoiceBalance(any());
    }

    // ---------------------------------------------------------------------------
    // The refund method stops being the accounting policy (§11)
    // ---------------------------------------------------------------------------

    @Test
    void everyMoneyMovingMethodIsRefusedWhenNothingHasBeenPaidFor() {
        SalesReturnSettlementSplit noPaidPortion =
                SalesReturnSettlementSplit.of(new BigDecimal("2000.00"), new BigDecimal("4000.00"));

        for (SalesReturnRefundMethod method : SalesReturnRefundMethod.values()) {
            if (!method.movesValueToCustomer()) continue;
            SalesReturn pending = returnOf("2000.00");
            pending.setRefundMethod(method);

            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> assertMethod(pending, noPaidPortion),
                    method + " must not be settleable when the paid portion is zero");

            assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
            assertTrue(ex.getReason().contains("has not paid for these goods"),
                    "The reason must say why, was: " + ex.getReason());
        }
    }

    @Test
    void customerCreditIsTheOneMethodAvailableOnAnUnpaidInvoice() {
        SalesReturn pending = returnOf("2000.00");
        pending.setRefundMethod(SalesReturnRefundMethod.CUSTOMER_CREDIT);

        assertDoesNotThrow(() -> assertMethod(pending,
                SalesReturnSettlementSplit.of(new BigDecimal("2000.00"), new BigDecimal("4000.00"))));
    }

    @Test
    void aMoneyMovingMethodIsAllowedWhenThereIsAPaidPortionToMove() {
        SalesReturn pending = returnOf("5000.00");
        pending.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);

        assertDoesNotThrow(() -> assertMethod(pending,
                SalesReturnSettlementSplit.of(new BigDecimal("5000.00"), new BigDecimal("2000.00"))));
    }

    /**
     * Customer Credit on a paid portion needs GL 2062 (Customer Credit Notes Unapplied), which
     * does not exist in this chart of accounts; creating it is an unapproved business decision
     * (economic model §J decision 7). Refused with a stated reason rather than posting a credit
     * to GL 1100 that the sub-ledger never records.
     */
    @Test
    void customerCreditIsBlockedOnAPaidPortionUntilTheLiabilityAccountExists() {
        SalesReturn pending = returnOf("5000.00");
        pending.setRefundMethod(SalesReturnRefundMethod.CUSTOMER_CREDIT);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> assertMethod(pending,
                        SalesReturnSettlementSplit.of(new BigDecimal("5000.00"), new BigDecimal("2000.00"))));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Customer Credit Notes Unapplied"), ex.getReason());
    }

    @Test
    void aReturnWithNoRefundMethodIsNotGatedByTheSplit() {
        SalesReturn pending = returnOf("2000.00");
        pending.setRefundMethod(null);

        assertDoesNotThrow(() -> assertMethod(pending,
                SalesReturnSettlementSplit.of(new BigDecimal("2000.00"), new BigDecimal("4000.00"))));
    }

    // ---------------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------------

    private SalesReturnSettlementSplit resolveSplit(SalesReturn pending, SalesInvoice locked) {
        SalesReturnSettlementSplit split = ReflectionTestUtils.invokeMethod(
                service, "resolveSettlementSplit", pending, locked);
        assertNotNull(split);
        assertTrue(split.isConsistent(), "returnValue must equal unpaidPortion + paidPortion");
        return split;
    }

    private void applyCredit(SalesReturn approved, SalesReturnSettlementSplit split, SalesInvoice locked) {
        ReflectionTestUtils.invokeMethod(service, "applyReturnCreditToInvoice", approved, split, locked);
    }

    private void assertMethod(SalesReturn pending, SalesReturnSettlementSplit split) {
        ReflectionTestUtils.invokeMethod(service, "assertSettlementMethodMatchesSplit", pending, split);
    }

    private SalesInvoice invoiceWithOutstanding(String outstanding) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setCustomerCode("CUS-007");
        invoice.setInvoiceTotal(new BigDecimal("10000.00"));
        invoice.setItems(new ArrayList<>(List.of()));
        lenient().when(invoiceBalanceService.effectiveOutstanding(invoice))
                .thenReturn(new BigDecimal(outstanding));
        lenient().when(salesInvoiceRepository.findByInvoiceNumberForUpdate(INVOICE))
                .thenReturn(Optional.of(invoice));
        return invoice;
    }

    private static SalesReturn returnOf(String totalAmount) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber(RETURN);
        r.setLinkedInvoice(INVOICE);
        r.setCustomerCode("CUS-007");
        r.setReturnDate(BUSINESS_DATE);
        r.setTotalAmount(new BigDecimal(totalAmount));
        r.setStatus(SalesReturnStatus.DRAFT);
        return r;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
