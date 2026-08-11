package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;

import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Business-date correctness for POS checkout.
 *
 * <p>The contract under test: a POS document's date is the <b>session's Trading Date</b>,
 * not the calendar date and not the Business Day clock's date. Under an overnight
 * Business Day (Aug 10 09:00 → Aug 11 02:00) a sale rung at Aug 11 01:00 has calendar
 * date Aug 11 but Trading Date Aug 10 — and the invoice, and the payment recorded against
 * it, must both land in Aug 10 or the Z-Report, the GL and the sales ledger disagree.
 *
 * <p>Because the assertion is against the session's persisted Trading Date, these tests
 * are fully deterministic — they do not depend on the host clock or the host timezone at
 * all, which is exactly the property the fix introduces. The Business Day clock is
 * injected as a real instance on a fixed zone and is only reachable on the no-session
 * fallback path.
 */
class PosCheckoutBusinessDateTest {

    /** Business Day timezone deliberately different from any plausible JVM default, so a
     *  regression back to {@code LocalDate.now()} cannot pass by coincidence. */
    private static final String BUSINESS_ZONE = "Asia/Kolkata";

    /** The overnight scenario from the spec: window Aug 10 09:00 → Aug 11 02:00. */
    private static final LocalDate TRADING_DATE = LocalDate.of(2026, 8, 10);
    private static final LocalDate CALENDAR_DATE_AT_0100 = LocalDate.of(2026, 8, 11);

    @Mock private SalesInvoiceService invoiceService;
    @Mock private PosSessionService sessionService;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private PosAuditService auditService;
    @Mock private BranchRepository branchRepository;
    @Mock private SerialMasterRepository serialMasterRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductPricingRepository pricingRepository;
    @Mock private RolePermissionService permissionService;
    @Mock private PosSettingsService posSettingsService;
    @Mock private com.billbull.backend.inventory.product.ProductService productService;
    @Mock private com.billbull.backend.hr.employees.EmployeeRepository employeeRepository;
    @Mock private com.billbull.backend.sales.payment.PaymentRepository paymentRepository;
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate;
    /** Continuation gate — mocked to a no-op here; the previous-Business-Day rule
     *  itself has dedicated coverage in {@code BusinessDayContinuationGateTest}. */
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayContinuationGate businessDayContinuationGate;
    /** Close-workflow gate — a REAL instance, deliberately not a mock: it is a pure,
     *  dependency-free predicate over the session, so mocking it would only hide whether
     *  these checkouts are gated. Sessions here have no X-Report, so it is a no-op.
     *  Dedicated coverage lives in PosSessionServiceTest. */
    @org.mockito.Spy private com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate =
            new com.billbull.backend.pos.session.PosSessionClosureWorkflowGate();

    @Spy private PosPaymentAllocationResolver allocationResolver = new PosPaymentAllocationResolver();
    @Spy private BusinessDayClock businessDayClock = new BusinessDayClock(BUSINESS_ZONE);

    @InjectMocks private PosCheckoutController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        lenient().when(branchTaxResolutionService.resolveSalesTaxRateForProduct(any(), any()))
                .thenReturn(BigDecimal.ZERO);
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() throws Exception {
        mocks.close();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private PosSession overnightSession() {
        PosSession s = new PosSession();
        s.setId(7L);
        s.setTradingDate(TRADING_DATE);
        // Deliberately different from tradingDate: proves tradingDate wins, not the
        // legacy accounting-bucket pointer.
        s.setSessionDate(CALENDAR_DATE_AT_0100);
        return s;
    }

    /** Echoes back whatever invoice the controller built, with an id, so the assertion can
     *  read the invoiceDate the controller actually set. */
    private SalesInvoice stubSaveEchoingInvoice() {
        ArgumentCaptor<SalesInvoice> captor = ArgumentCaptor.forClass(SalesInvoice.class);
        when(invoiceService.save(captor.capture())).thenAnswer(inv -> {
            SalesInvoice built = inv.getArgument(0);
            built.setId(42L);
            built.setInvoiceNumber("INV-2026-0042");
            built.setInvoiceTotal(new BigDecimal("100.00"));
            built.setTaxTotal(BigDecimal.ZERO);
            built.setStatus(SalesInvoiceStatus.DRAFT);
            return built;
        });
        lenient().when(invoiceService.getById(42L)).thenAnswer(inv -> captor.getValue());
        return null;
    }

    private PosCheckoutRequest cashCheckout(Long sessionId) {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setSessionId(sessionId);
        req.setBranchId(1L);
        req.setPaymentMode("Cash");
        req.setAmountTendered(100.0);
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode("10593");
        item.setItemName("WATER TANK");
        item.setQuantity(1);
        item.setPrice(100.0);
        req.setItems(List.of(item));
        return req;
    }

    private LocalDate capturedInvoiceDate() {
        ArgumentCaptor<SalesInvoice> captor = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceService).save(captor.capture());
        return captor.getValue().getInvoiceDate();
    }

    private LocalDate capturedPaymentDate() {
        ArgumentCaptor<LocalDate> captor = ArgumentCaptor.forClass(LocalDate.class);
        verify(invoiceService).recordPayment(anyLong(), anyDouble(), any(), any(),
                captor.capture(), any(), any(), any(), any());
        return captor.getValue();
    }

    // ── tests ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Invoice date is the session's Trading Date, not the calendar date")
    void invoiceDateIsSessionTradingDate() {
        when(sessionService.getById(7L)).thenReturn(overnightSession());
        stubSaveEchoingInvoice();

        controller.checkout(cashCheckout(7L));

        assertEquals(TRADING_DATE, capturedInvoiceDate());
    }

    @Test
    @DisplayName("Overnight Business Day: a 01:00 sale on Aug 11 is invoiced into Aug 10")
    void overnightBusinessDayKeepsTradingDate() {
        when(sessionService.getById(7L)).thenReturn(overnightSession());
        stubSaveEchoingInvoice();

        controller.checkout(cashCheckout(7L));

        LocalDate invoiceDate = capturedInvoiceDate();
        assertEquals(TRADING_DATE, invoiceDate);
        // The whole point: the calendar has already rolled over, the Business Day has not.
        org.junit.jupiter.api.Assertions.assertNotEquals(CALENDAR_DATE_AT_0100, invoiceDate);
    }

    @Test
    @DisplayName("Payment date equals the invoice date — one sale never straddles two Business Days")
    void paymentDateMatchesInvoiceDate() {
        when(sessionService.getById(7L)).thenReturn(overnightSession());
        stubSaveEchoingInvoice();

        controller.checkout(cashCheckout(7L));

        assertEquals(TRADING_DATE, capturedPaymentDate());
        assertEquals(capturedInvoiceDate(), capturedPaymentDate());
    }

    @Test
    @DisplayName("Sessions predating tradingDate fall back to sessionDate, never to LocalDate.now()")
    void legacySessionFallsBackToSessionDate() {
        PosSession legacy = new PosSession();
        legacy.setId(7L);
        legacy.setTradingDate(null);
        legacy.setSessionDate(TRADING_DATE);
        when(sessionService.getById(7L)).thenReturn(legacy);
        stubSaveEchoingInvoice();

        controller.checkout(cashCheckout(7L));

        assertEquals(TRADING_DATE, capturedInvoiceDate());
    }

    @Test
    @DisplayName("With no session at all, the date comes from the Business Day clock, not the JVM")
    void noSessionFallsBackToBusinessDayClock() {
        stubSaveEchoingInvoice();

        controller.checkout(cashCheckout(null));

        assertEquals(businessDayClock.now().toLocalDate(), capturedInvoiceDate());
    }
}
