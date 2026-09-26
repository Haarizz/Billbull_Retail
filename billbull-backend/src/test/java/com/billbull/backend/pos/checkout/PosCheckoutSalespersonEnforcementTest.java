package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.hr.employees.SalespersonService;
import com.billbull.backend.hr.targets.TargetReadinessResponse;
import com.billbull.backend.hr.targets.TargetReadinessService;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * The Phase 2 POS acceptance rules, at the checkout boundary.
 *
 * <p>Three things are pinned here that no other suite covers:
 *
 * <ol>
 *   <li><b>OFF is unchanged.</b> With both settings off, a sale with no salesperson settles
 *       exactly as it did before.
 *   <li><b>ON has no bypass.</b> Verification is required regardless of who is logged in — a
 *       Cashier + Salesperson operator does not get a free pass.
 *   <li><b>Refusal has no side effects.</b> Every rejection path is asserted to leave behind no
 *       invoice, no payment and no session counter. This is the guarantee that makes it safe to
 *       put a hard gate in front of a till.
 * </ol>
 */
class PosCheckoutSalespersonEnforcementTest {

    @Mock private SalesInvoiceService invoiceService;
    @Mock private com.billbull.backend.pos.session.PosSessionService sessionService;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private PosAuditService auditService;
    @Mock private BranchRepository branchRepository;
    @Mock private SerialMasterRepository serialMasterRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductPricingRepository pricingRepository;
    @Mock private RolePermissionService permissionService;
    @Mock private PosSettingsService posSettingsService;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private TargetReadinessService targetReadinessService;
    @Mock private SalesSettingsService salesSettingsService;
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayContinuationGate businessDayContinuationGate;
    @Mock private InvoiceCustomerContactService invoiceCustomerContactService;
    @Mock private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    /** Real: the eligibility rule under test must be the production one, not a restatement. */
    @org.mockito.Spy private SalespersonService salespersonService = new SalespersonService(null);

    @org.mockito.Spy private com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate =
            new com.billbull.backend.pos.session.PosSessionClosureWorkflowGate();
    @org.mockito.Spy private com.billbull.backend.pos.businessdate.BusinessDayClock businessDayClock =
            new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Kolkata");
    @org.mockito.Spy private PosPaymentAllocationResolver allocationResolver = new PosPaymentAllocationResolver();

    @InjectMocks private PosCheckoutController controller;

    private AutoCloseable mocks;
    private final SalesSettings settings = new SalesSettings();

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        org.springframework.test.util.ReflectionTestUtils.setField(
                salespersonService, "employeeRepository", employeeRepository);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "deliverySettlementService",
                new PosDeliverySettlementService(
                        invoiceRepository, invoiceService, ownershipAccessService, posSettingsService,
                        auditService, sessionService, businessDayContinuationGate, closureWorkflowGate,
                        allocationResolver, terminalActivityService, invoiceCustomerContactService));

        lenient().when(salesSettingsService.getSettings()).thenReturn(settings);
        lenient().when(branchTaxResolutionService.resolveSalesTaxRateForProduct(any(), any()))
                .thenReturn(BigDecimal.ZERO);

        SalesInvoice draft = new SalesInvoice();
        draft.setId(42L);
        draft.setInvoiceNumber("INV-2026-9001");
        draft.setInvoiceTotal(new BigDecimal("100.00"));
        draft.setTaxTotal(BigDecimal.ZERO);
        draft.setInvoiceDate(LocalDate.now());
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        lenient().when(invoiceService.save(any())).thenReturn(draft);
        lenient().when(invoiceService.getById(42L)).thenReturn(draft);
    }

    @AfterEach
    void tearDown() throws Exception {
        mocks.close();
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static Employee employee(long id, String code, String first, String last,
                                     String status, String role) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        e.setStatus(status);
        e.setRole(role);
        return e;
    }

    private static PosCheckoutRequest cashRequest() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(100.0);
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode("SKU-1");
        item.setItemName("Widget");
        item.setQuantity(1);
        item.setPrice(100.0);
        req.setItems(List.of(item));
        return req;
    }

    private void ready() {
        TargetReadinessResponse r = new TargetReadinessResponse();
        r.setRequired(true);
        r.setReady(true);
        r.setMonth(LocalDate.now().withDayOfMonth(1));
        lenient().when(targetReadinessService.evaluate(any(LocalDate.class))).thenReturn(r);
    }

    private TargetReadinessResponse notReady(long employeeId, String code, String name) {
        TargetReadinessResponse r = new TargetReadinessResponse();
        r.setRequired(true);
        r.setReady(false);
        r.setMonth(LocalDate.now().withDayOfMonth(1));
        TargetReadinessResponse.MissingRow row = new TargetReadinessResponse.MissingRow();
        row.setEmployeeId(employeeId);
        row.setEmployeeCode(code);
        row.setEmployeeName(name);
        row.setRole("Salesperson");
        row.setMissingTarget(true);
        r.setMissing(List.of(row));
        when(targetReadinessService.evaluate(any(LocalDate.class))).thenReturn(r);
        return r;
    }

    /** No invoice, no payment, no session counter — the no-side-effect guarantee. */
    private void assertNothingWasWritten() {
        verify(invoiceService, never()).save(any());
        verify(invoiceService, never()).updateStatus(any(), any());
        verify(invoiceService, never()).recordPayment(
                any(), org.mockito.ArgumentMatchers.anyDouble(), any(), any(), any(),
                any(), any(), any(), any(), any());
        verify(sessionService, never()).recordInvoiceOnSession(any(), any(), any());
        verify(serialMasterRepository, never()).save(any());
    }

    // ── 1. SETTING OFF — nothing changes ────────────────────────────────────

    @Test
    void withPosSalespersonOffASaleWithNoSalespersonSettlesAsBefore() {
        settings.setSalespersonRequiredAtPos(false);
        settings.setMonthlyTargetRequired(false);

        ResponseEntity<?> response = controller.checkout(cashRequest());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(invoiceService).save(any());
        // Readiness is not even consulted when enforcement is off.
        verify(targetReadinessService, never()).evaluate(any(LocalDate.class));
    }

    @Test
    void withPosSalespersonOffAnIneligibleEmployeeIsStillRejectedWhenExplicitlyNamed() {
        // The setting decides whether attribution is REQUIRED. It never makes an invalid
        // attribution acceptable — a client that names someone must name someone valid.
        settings.setSalespersonRequiredAtPos(false);
        when(employeeRepository.findById(5L))
                .thenReturn(Optional.of(employee(5L, "EMP-005", "Plain", "Cashier", "Active", "Cashier")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(5L);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        assertNothingWasWritten();
    }

    // ── 2. SETTING ON — verification is mandatory, with no bypass ───────────

    @Test
    void withPosSalespersonOnASaleWithNoSalespersonIsRejected() {
        settings.setSalespersonRequiredAtPos(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(cashRequest()));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(String.valueOf(ex.getReason()).contains("must be attributed to a salesperson"));
        assertNothingWasWritten();
    }

    @Test
    void withPosSalespersonOnAnActiveSalespersonIsAccepted() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findById(7L))
                .thenReturn(Optional.of(employee(7L, "EMP-007", "Sales", "One", "Active", "Salesperson")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(7L);

        ResponseEntity<?> response = controller.checkout(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(invoiceService).save(any());
    }

    @Test
    void withPosSalespersonOnAnActiveCashierSalespersonIsAccepted() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findById(8L)).thenReturn(Optional.of(
                employee(8L, "EMP-008", "Cashier", "One", "Active", "Cashier + Salesperson")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(8L);

        assertEquals(HttpStatus.OK, controller.checkout(req).getStatusCode());
        verify(invoiceService).save(any());
    }

    /**
     * THE locked rule. The operator's own designation is irrelevant: the server sees a request
     * with no salesperson and refuses it, whoever is logged in. There is no code path that
     * inspects the caller's role here, and this test exists so nobody adds one.
     */
    @Test
    void aCashierSalespersonOperatorStillHasToVerifySomebody() {
        settings.setSalespersonRequiredAtPos(true);
        // The operator IS an eligible salesperson...
        lenient().when(employeeRepository.findById(8L)).thenReturn(Optional.of(
                employee(8L, "EMP-008", "Cashier", "One", "Active", "Cashier + Salesperson")));

        // ...but the sale names nobody.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(cashRequest()));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertNothingWasWritten();
    }

    @Test
    void withPosSalespersonOnAPlainCashierIsRejected() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findById(5L))
                .thenReturn(Optional.of(employee(5L, "EMP-005", "Plain", "Cashier", "Active", "Cashier")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(5L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(req));

        assertTrue(String.valueOf(ex.getReason()).contains("not an eligible salesperson"));
        assertNothingWasWritten();
    }

    @Test
    void withPosSalespersonOnAStorekeeperIsRejected() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findById(6L))
                .thenReturn(Optional.of(employee(6L, "EMP-006", "Store", "Keeper", "Active", "Storekeeper")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(6L);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        assertNothingWasWritten();
    }

    @Test
    void withPosSalespersonOnAnInactiveSalespersonIsRejected() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findById(9L)).thenReturn(Optional.of(
                employee(9L, "EMP-009", "Gone", "Away", "Inactive", "Salesperson")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(9L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(req));

        assertTrue(String.valueOf(ex.getReason()).contains("active employee"));
        assertNothingWasWritten();
    }

    @Test
    void withPosSalespersonOnAnUnknownBarcodeIsRejected() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findByEmployeeCodeIgnoreCase("NOPE")).thenReturn(Optional.empty());

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeCode("NOPE");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(req));

        assertTrue(String.valueOf(ex.getReason()).contains("could not be found"));
        assertNothingWasWritten();
    }

    /** A hostile client cannot make an arbitrary employee the salesperson. */
    @Test
    void anArbitraryEmployeeIdFromTheClientIsNotTrusted() {
        settings.setSalespersonRequiredAtPos(true);
        when(employeeRepository.findById(999L)).thenReturn(Optional.empty());

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(999L);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        assertNothingWasWritten();
    }

    // ── 3. TARGET READINESS ─────────────────────────────────────────────────

    @Test
    void withSetTargetsOffReadinessNeverBlocks() {
        settings.setMonthlyTargetRequired(false);

        assertEquals(HttpStatus.OK, controller.checkout(cashRequest()).getStatusCode());
        verify(targetReadinessService, never()).evaluate(any(LocalDate.class));
    }

    @Test
    void withSetTargetsOnAndEverythingConfiguredTheSaleProceeds() {
        settings.setMonthlyTargetRequired(true);
        ready();

        assertEquals(HttpStatus.OK, controller.checkout(cashRequest()).getStatusCode());
        verify(invoiceService).save(any());
    }

    @Test
    void withSetTargetsOnAMissingEmployeeBlocksTheSaleWithAStructuredBody() {
        settings.setMonthlyTargetRequired(true);
        TargetReadinessResponse expected = notReady(3L, "EMP-003", "Sales B");

        ResponseEntity<?> response = controller.checkout(cashRequest());

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        // Structured, not a message string — the cashier has to be told WHO to configure.
        assertEquals(expected, response.getBody());
        assertNothingWasWritten();
    }

    /**
     * THE global rule (§31). The salesperson on this sale is fully configured; a DIFFERENT
     * eligible employee is not. The sale is still refused.
     */
    @Test
    void aFullyConfiguredSalespersonDoesNotRescueASaleWhenAColleagueIsUnconfigured() {
        settings.setSalespersonRequiredAtPos(true);
        settings.setMonthlyTargetRequired(true);
        when(employeeRepository.findById(1L)).thenReturn(Optional.of(
                employee(1L, "EMP-001", "Sales", "A", "Active", "Salesperson")));
        notReady(3L, "EMP-003", "Sales B");

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(1L);

        ResponseEntity<?> response = controller.checkout(req);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNothingWasWritten();
    }

    // ── 4. THE TWO SETTINGS ARE INDEPENDENT ─────────────────────────────────

    @Test
    void readinessCanBlockEvenWhenSalespersonVerificationIsOff() {
        settings.setSalespersonRequiredAtPos(false);
        settings.setMonthlyTargetRequired(true);
        notReady(3L, "EMP-003", "Sales B");

        assertEquals(HttpStatus.CONFLICT, controller.checkout(cashRequest()).getStatusCode());
        assertNothingWasWritten();
    }

    @Test
    void salespersonVerificationCanBlockEvenWhenReadinessIsOff() {
        settings.setSalespersonRequiredAtPos(true);
        settings.setMonthlyTargetRequired(false);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(cashRequest()));
        verify(targetReadinessService, never()).evaluate(any(LocalDate.class));
        assertNothingWasWritten();
    }

    // ── 5. ORDERING ─────────────────────────────────────────────────────────

    /**
     * The gate must sit BEFORE invoice creation, not after. If it ever moves below
     * {@code invoiceService.save}, a refused sale would leave a stranded DRAFT that only a
     * compensating delete could clean up — a weaker guarantee than never having written.
     */
    @Test
    void theGateRunsBeforeAnyInvoiceRowExists() {
        settings.setSalespersonRequiredAtPos(true);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(cashRequest()));

        verify(invoiceService, never()).save(any());
        verify(invoiceRepository, never()).deleteById(anyLong());
    }
}
