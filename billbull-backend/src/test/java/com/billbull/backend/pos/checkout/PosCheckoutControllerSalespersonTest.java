package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
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
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Salesperson attribution at POS checkout.
 *
 * <p>The thing under test is {@code buildInvoice}'s salesperson resolution: the client names a
 * candidate by id (or employee code), and the identity written onto the invoice is re-read from
 * the employee row. These tests also pin what must NOT change — the legacy {@code salesperson}
 * String and the delivery-driver fields.
 */
class PosCheckoutControllerSalespersonTest {

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
    @Mock private com.billbull.backend.hr.targets.TargetReadinessService targetReadinessService;
    @Mock private com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;
    /** Real, not mocked: the eligibility rule IS what these tests exercise. */
    @org.mockito.Spy private com.billbull.backend.hr.employees.SalespersonService salespersonService =
            new com.billbull.backend.hr.employees.SalespersonService(null);
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayContinuationGate businessDayContinuationGate;
    @Mock private InvoiceCustomerContactService invoiceCustomerContactService;
    @Mock private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    @org.mockito.Spy private com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate =
            new com.billbull.backend.pos.session.PosSessionClosureWorkflowGate();
    @org.mockito.Spy private com.billbull.backend.pos.businessdate.BusinessDayClock businessDayClock =
            new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Kolkata");
    @org.mockito.Spy private PosPaymentAllocationResolver allocationResolver = new PosPaymentAllocationResolver();

    @InjectMocks private PosCheckoutController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        // SalespersonService resolves through the EmployeeRepository these tests already stub, so
        // it is constructed against the same mock rather than being stubbed itself — the tests
        // then exercise the real eligibility rule, not a restatement of it.
        org.springframework.test.util.ReflectionTestUtils.setField(
                salespersonService, "employeeRepository", employeeRepository);
        // Phase 2 settings default to OFF, which is what keeps the Phase 1 behaviour these tests
        // pin (optional attribution) intact. The ON cases live in their own suite.
        lenient().when(salesSettingsService.getSettings())
                .thenReturn(new com.billbull.backend.sales.settings.SalesSettings());
        lenient().when(branchTaxResolutionService.resolveSalesTaxRateForProduct(any(), any()))
                .thenReturn(BigDecimal.ZERO);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "deliverySettlementService",
                new PosDeliverySettlementService(
                        invoiceRepository, invoiceService, ownershipAccessService, posSettingsService,
                        auditService, sessionService, businessDayContinuationGate, closureWorkflowGate,
                        allocationResolver, terminalActivityService, invoiceCustomerContactService));

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

    /**
     * DELIBERATELY CHANGED in Phase 2: the fixture now carries an eligible designation.
     *
     * <p>Phase 1 accepted ANY active employee as a salesperson, so these fixtures needed no role.
     * Phase 2 narrows eligibility to Salesperson / Cashier + Salesperson, so a role-less employee
     * is now correctly rejected — the assertions below are about what happens to an employee who
     * IS eligible, and they would otherwise be testing the rejection path by accident.
     * Role-based rejection has its own suite: PosCheckoutSalespersonEnforcementTest.
     */
    private static Employee employee(long id, String code, String first, String last, String status) {
        return employee(id, code, first, last, status, "Salesperson");
    }

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

    /** The invoice instance handed to save() — i.e. what buildInvoice produced. */
    private SalesInvoice capturedInvoice() {
        ArgumentCaptor<SalesInvoice> captor = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceService).save(captor.capture());
        return captor.getValue();
    }

    // ── tests ───────────────────────────────────────────────────────────────

    @Test
    void resolvesSalespersonByIdAndStoresCanonicalIdCodeAndName() {
        when(employeeRepository.findById(7L))
                .thenReturn(Optional.of(employee(7L, "EMP-007", "Manager", "One", "Active")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(7L);
        // A deliberately wrong code alongside the id: the id wins and the code stored is the
        // employee record's, never the client's.
        req.setSalespersonEmployeeCode("WRONG-CODE");

        controller.checkout(req);

        SalesInvoice inv = capturedInvoice();
        assertEquals(7L, inv.getSalespersonEmployeeId());
        assertEquals("EMP-007", inv.getSalespersonEmployeeCode());
        assertEquals("Manager One", inv.getSalespersonName());
    }

    @Test
    void fallsBackToEmployeeCodeWhenIdIsNotSupplied() {
        when(employeeRepository.findByEmployeeCodeIgnoreCase("emp-009"))
                .thenReturn(Optional.of(employee(9L, "EMP-009", "Sales", "Person", "Active")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeCode("emp-009");

        controller.checkout(req);

        SalesInvoice inv = capturedInvoice();
        assertEquals(9L, inv.getSalespersonEmployeeId());
        assertEquals("EMP-009", inv.getSalespersonEmployeeCode());
        assertEquals("Sales Person", inv.getSalespersonName());
    }

    @Test
    void leavesAttributionNullWhenNoSalespersonIsSupplied() {
        controller.checkout(cashRequest());

        SalesInvoice inv = capturedInvoice();
        assertNull(inv.getSalespersonEmployeeId());
        assertNull(inv.getSalespersonEmployeeCode());
        assertNull(inv.getSalespersonName());
    }

    @Test
    void blankEmployeeCodeIsTreatedAsUnassigned() {
        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeCode("   ");

        controller.checkout(req);

        assertNull(capturedInvoice().getSalespersonEmployeeId());
    }

    @Test
    void rejectsAnInactiveEmployee() {
        when(employeeRepository.findById(11L))
                .thenReturn(Optional.of(employee(11L, "EMP-011", "Former", "Staff", "Inactive")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(11L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(req));
        assertTrue(ex.getMessage().contains("active employee"));
    }

    @Test
    void rejectsAnUnknownEmployeeRatherThanSilentlyDroppingTheAttribution() {
        when(employeeRepository.findById(404L)).thenReturn(Optional.empty());

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(404L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.checkout(req));
        assertTrue(ex.getMessage().contains("could not be found"));
    }

    @Test
    void doesNotTouchTheLegacySalespersonStringOrTheDeliveryDriverFields() {
        when(employeeRepository.findById(7L))
                .thenReturn(Optional.of(employee(7L, "EMP-007", "Manager", "One", "Active")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(7L);

        controller.checkout(req);

        SalesInvoice inv = capturedInvoice();
        // The legacy String stays unset here — SalesInvoiceService still owns its
        // "default to the authenticated username" behaviour, unchanged by this feature.
        assertNull(inv.getSalesperson());
        // Delivery attribution is a separate concept and must be untouched by a counter sale.
        assertNull(inv.getPosDriverEmployeeId());
        assertNull(inv.getPosDriverEmployeeCode());
        assertNull(inv.getPosDriverName());
    }

    @Test
    void salespersonIsIndependentOfTheCashier() {
        // Cashier is whoever is authenticated (session owner); the sale is attributed to
        // someone else entirely. Nothing about the session/terminal fields changes.
        when(employeeRepository.findById(7L))
                .thenReturn(Optional.of(employee(7L, "EMP-007", "Manager", "One", "Active")));

        PosCheckoutRequest req = cashRequest();
        req.setSalespersonEmployeeId(7L);
        req.setTerminalId("TERM-1");
        req.setCounterName("Counter 1");

        controller.checkout(req);

        SalesInvoice inv = capturedInvoice();
        assertEquals(7L, inv.getSalespersonEmployeeId());
        assertEquals("TERM-1", inv.getPosTerminalId());
        assertEquals("Counter 1", inv.getPosCounterName());
    }
}
