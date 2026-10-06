package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.payment.Payment;
import com.billbull.backend.sales.payment.PaymentRepository;

/**
 * Regression cover for the SALES reconciliation split that unblocks Day Close when a credit
 * customer settles an OLDER invoice at the till.
 *
 * <p>Tender is attributed to the session that COLLECTED it ({@code Payment.posSessionId}),
 * while {@code totalSales} counts only invoices SOLD in those sessions — so money taken today
 * for an August bill lands on the tender side with no counterpart on the sales side. That is
 * correct accrual accounting on both halves, but Day Close used to assert the two were equal
 * and blocked with a variance equal to whatever the customer paid.
 *
 * <p>The figures below reproduce the royaltools 2026-09-01 close verbatim: 21 invoices worth
 * 4354.00 sold, 4963.00 collected, and exactly 609.00 of that collected against INV-2026-0908 /
 * 0930 / 0936 from 27–28 August.
 */
@ExtendWith(MockitoExtension.class)
class PosSalesReconciliationSplitTest {

    private static final List<Long> SESSION_IDS = List.of(111L, 115L);

    @Mock private PaymentRepository paymentRepository;
    @Mock private com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository
            returnCreditApplicationRepository;
    @Mock private com.billbull.backend.sales.advance.AdvanceApplicationRepository advanceApplicationRepository;

    @InjectMocks private PosSessionService posSessionService;

    /** @InjectMocks fills the constructor, not the @Autowired fields the allocation ledgers
     *  live in, so they are set here by hand -- the same way the rest of the POS session
     *  suite wires them. */
    @org.junit.jupiter.api.BeforeEach
    void wireAllocationLedgers() {
        org.springframework.test.util.ReflectionTestUtils.setField(posSessionService,
                "returnCreditApplicationRepository", returnCreditApplicationRepository);
        org.springframework.test.util.ReflectionTestUtils.setField(posSessionService,
                "advanceApplicationRepository", advanceApplicationRepository);
    }

    @Test
    void settlementOfAnEarlierInvoiceIsSplitOutAndDoesNotCreateSalesVariance() throws Exception {
        List<SalesInvoice> soldToday = List.of(
                invoice("INV-2026-1001", "2905.00", "0.00"),
                invoice("INV-2026-1002", "1449.00", "1449.00"));   // sold on credit today

        when(paymentRepository.sumTenderByModeForSessions(SESSION_IDS)).thenReturn(List.<Object[]>of(
                new Object[] { "Cash", new BigDecimal("495.00"), 1L },
                new Object[] { "Visa", new BigDecimal("2398.00"), 1L },
                new Object[] { "Bank Transfer", new BigDecimal("12.00"), 1L },
                new Object[] { "Bank Account (Main)", new BigDecimal("609.00"), 3L }));
        when(paymentRepository.findTenderForSessions(SESSION_IDS)).thenReturn(List.of(
                payment("PAY-2026-1001", "INV-2026-1001", "Cash", "495.00"),
                payment("PAY-2026-1002", "INV-2026-1001", "Visa", "2398.00"),
                payment("PAY-2026-1003", "INV-2026-1001", "Bank Transfer", "12.00"),
                // Collected today, but for invoices rung up on 27-28 August.
                payment("PAY-2026-1010", "INV-2026-0936", "Bank Account (Main)", "310.00"),
                payment("PAY-2026-1007", "INV-2026-0930", "Bank Account (Main)", "195.00"),
                payment("PAY-2026-1008", "INV-2026-0908", "Bank Account (Main)", "104.00")));

        Map<String, Object> summary = summarize(soldToday, List.of());

        assertEquals(new BigDecimal("609.00"), summary.get("earlierInvoiceCollections"));
        assertEquals(3L, summary.get("earlierInvoiceCollectionCount"));
        assertEquals(BigDecimal.ZERO, summary.get("advanceCollections"));

        // The pre-fix identity — kept here to pin down exactly what used to block the close.
        assertEquals(new BigDecimal("4354.00"), summary.get("totalSales"));
        assertEquals(new BigDecimal("4963.00"), rawComputedTotalSales(summary));

        // The identity Day Close now applies: variance is zero, so the day closes.
        assertEquals(0, reconciledVariance(summary).compareTo(BigDecimal.ZERO),
                "settling an earlier invoice must not register as a sales variance");
    }

    @Test
    void customerAdvancesAreSplitOutToo() throws Exception {
        List<SalesInvoice> soldToday = List.of(invoice("INV-2026-2001", "200.00", "0.00"));

        when(paymentRepository.sumTenderByModeForSessions(SESSION_IDS)).thenReturn(List.<Object[]>of(
                new Object[] { "Cash", new BigDecimal("200.00"), 1L }));
        when(paymentRepository.findTenderForSessions(SESSION_IDS)).thenReturn(List.of(
                payment("PAY-2026-2001", "INV-2026-2001", "Cash", "200.00")));

        // An advance has no invoice at all — aggregateTender adds it to the cash bucket.
        Map<String, Object> summary = summarize(soldToday, List.of(advance("Cash", "150.00")));

        assertEquals(new BigDecimal("150.00"), summary.get("advanceCollections"));
        assertEquals(1L, summary.get("advanceCollectionCount"));
        assertEquals(BigDecimal.ZERO, summary.get("earlierInvoiceCollections"));
        assertEquals(new BigDecimal("350.00"), rawComputedTotalSales(summary));
        assertEquals(0, reconciledVariance(summary).compareTo(BigDecimal.ZERO));
    }

    @Test
    void anOrdinarySameDayCashAndCardDayStillReconcilesToZero() throws Exception {
        List<SalesInvoice> soldToday = List.of(
                invoice("INV-2026-3001", "100.00", "0.00"),
                invoice("INV-2026-3002", "250.00", "0.00"));

        when(paymentRepository.sumTenderByModeForSessions(SESSION_IDS)).thenReturn(List.<Object[]>of(
                new Object[] { "Cash", new BigDecimal("100.00"), 1L },
                new Object[] { "Mastercard", new BigDecimal("250.00"), 1L }));
        when(paymentRepository.findTenderForSessions(SESSION_IDS)).thenReturn(List.of(
                payment("PAY-2026-3001", "INV-2026-3001", "Cash", "100.00"),
                payment("PAY-2026-3002", "INV-2026-3002", "Mastercard", "250.00")));

        Map<String, Object> summary = summarize(soldToday, List.of());

        assertEquals(BigDecimal.ZERO, summary.get("earlierInvoiceCollections"));
        assertEquals(BigDecimal.ZERO, summary.get("advanceCollections"));
        assertEquals(0, reconciledVariance(summary).compareTo(BigDecimal.ZERO));
    }

    @Test
    void returnCreditAppliedToTheSameDaysInvoiceIsNotASalesVariance() throws Exception {
        // The shape that blocked a real close: a 2800.00 credit note raised against the same
        // day's 2810.00 bill. The credit settles the receivable, so the invoice's balance --
        // and with it creditSales -- falls to 10.00, while no tender is ever collected.
        List<SalesInvoice> soldToday = List.of(invoice("INV-2026-0228", "2810.00", "10.00"));

        when(paymentRepository.sumTenderByModeForSessions(SESSION_IDS)).thenReturn(List.<Object[]>of());
        when(paymentRepository.findTenderForSessions(SESSION_IDS)).thenReturn(List.of());
        when(returnCreditApplicationRepository.sumAppliedByInvoiceNumbers(Set.of("INV-2026-0228")))
                .thenReturn(new BigDecimal("2800.00"));

        Map<String, Object> summary = summarize(soldToday, List.of());

        assertEquals(new BigDecimal("2800.00"), summary.get("returnCreditApplied"));
        assertEquals(BigDecimal.ZERO, summary.get("advanceApplied"));

        // The pre-fix identity -- 10.00 of credit against 2810.00 sold, a 2800.00 variance.
        assertEquals(new BigDecimal("10.00"), rawComputedTotalSales(summary));

        assertEquals(0, reconciledVariance(summary).compareTo(BigDecimal.ZERO),
                "a credit note against the same day's invoice must not register as a sales variance");
    }

    @Test
    void returnCreditAppliedToAnEarlierInvoiceLeavesThisDaysIdentityAlone() throws Exception {
        // Credit applied to an invoice sold on another day settles a receivable that was
        // recognised as a sale then, so it must not enter this day's identity at all. The
        // repository is asked only about invoices sold in the range, which is what enforces it.
        List<SalesInvoice> soldToday = List.of(invoice("INV-2026-4001", "500.00", "0.00"));

        when(paymentRepository.sumTenderByModeForSessions(SESSION_IDS)).thenReturn(List.<Object[]>of(
                new Object[] { "Cash", new BigDecimal("500.00"), 1L }));
        when(paymentRepository.findTenderForSessions(SESSION_IDS)).thenReturn(List.of(
                payment("PAY-2026-4001", "INV-2026-4001", "Cash", "500.00")));
        // 246.75 of credit was applied today, but to INV-2026-0120 -- an earlier bill.
        when(returnCreditApplicationRepository.sumAppliedByInvoiceNumbers(Set.of("INV-2026-4001")))
                .thenReturn(BigDecimal.ZERO);

        Map<String, Object> summary = summarize(soldToday, List.of());

        assertEquals(BigDecimal.ZERO, summary.get("returnCreditApplied"));
        assertEquals(0, reconciledVariance(summary).compareTo(BigDecimal.ZERO));
    }

    @Test
    void anAdvanceAllocatedToTheSameDaysInvoiceIsNotASalesVariance() throws Exception {
        // The advance was collected on an earlier day, so no tender lands in this range at all;
        // allocating it just clears the receivable.
        List<SalesInvoice> soldToday = List.of(invoice("INV-2026-5001", "750.00", "0.00"));

        when(paymentRepository.sumTenderByModeForSessions(SESSION_IDS)).thenReturn(List.<Object[]>of());
        when(paymentRepository.findTenderForSessions(SESSION_IDS)).thenReturn(List.of());
        when(advanceApplicationRepository.sumAppliedByInvoiceNumbers(Set.of("INV-2026-5001")))
                .thenReturn(new BigDecimal("750.00"));

        Map<String, Object> summary = summarize(soldToday, List.of());

        assertEquals(new BigDecimal("750.00"), summary.get("advanceApplied"));
        assertEquals(0, reconciledVariance(summary).compareTo(BigDecimal.ZERO));
    }

    /* ===== helpers ===== */

    /** Runs the real aggregateTender -> buildSalesSummary path the Z-Report/Day Close uses. */
    private Map<String, Object> summarize(List<SalesInvoice> invoices, List<ReceiptVoucher> advances)
            throws Exception {
        Method aggregate = PosSessionService.class.getDeclaredMethod(
                "aggregateTender", List.class, List.class);
        aggregate.setAccessible(true);
        Object tender = aggregate.invoke(posSessionService, advances, SESSION_IDS);

        Method summarize = PosSessionService.class.getDeclaredMethod(
                "buildSalesSummary", List.class, tender.getClass());
        summarize.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) summarize.invoke(posSessionService, invoices, tender);
        return summary;
    }

    /** cash + card + credit + other — the identity as it stood before the split. */
    private static BigDecimal rawComputedTotalSales(Map<String, Object> summary) {
        return big(summary, "cashSales").add(big(summary, "cardSales"))
                .add(big(summary, "creditSales")).add(big(summary, "otherSales"));
    }

    /** The identity closeDay() applies now: out-of-period collections excluded. */
    private static BigDecimal reconciledVariance(Map<String, Object> summary) {
        BigDecimal computed = rawComputedTotalSales(summary)
                .subtract(big(summary, "earlierInvoiceCollections"))
                .subtract(big(summary, "advanceCollections"))
                .add(big(summary, "returnCreditApplied"))
                .add(big(summary, "advanceApplied"));
        return big(summary, "totalSales").subtract(computed);
    }

    private static BigDecimal big(Map<String, Object> summary, String key) {
        Object v = summary.get(key);
        return v instanceof BigDecimal bd ? bd : BigDecimal.ZERO;
    }

    private static SalesInvoice invoice(String number, String total, String balance) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setInvoiceTotal(new BigDecimal(total));
        inv.setBalance(new BigDecimal(balance));
        return inv;
    }

    private static Payment payment(String number, String linkedInvoice, String mode, String amount) {
        Payment p = new Payment();
        p.setPaymentNumber(number);
        p.setLinkedInvoice(linkedInvoice);
        p.setPaymentMode(mode);
        p.setAmount(new BigDecimal(amount));
        return p;
    }

    private static ReceiptVoucher advance(String mode, String amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setPurpose(ReceiptPurpose.ADVANCE_RECEIVED);
        rv.setPaymentMode(mode);
        rv.setAmount(new BigDecimal(amount));
        return rv;
    }
}
