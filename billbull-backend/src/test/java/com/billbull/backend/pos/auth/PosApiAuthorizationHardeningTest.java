package com.billbull.backend.pos.auth;

import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.inventory.product.ProductController;
import com.billbull.backend.inventory.product.ProductService;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.businessdate.PosDayStatusService;
import com.billbull.backend.pos.cashdrawer.PosCashDrawer;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerController;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerService;
import com.billbull.backend.pos.checkout.PosCheckoutController;
import com.billbull.backend.pos.checkout.PosDeliveryReturnRequest;
import com.billbull.backend.pos.checkout.PosDeliveryReturnService;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterController;
import com.billbull.backend.pos.printer.PosPrinterService;
import com.billbull.backend.pos.search.PosLookupService;
import com.billbull.backend.pos.search.PosSearchController;
import com.billbull.backend.pos.search.PosSearchService;
import com.billbull.backend.pos.session.PosAuthorizationService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionController;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionSyncService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.role.Role;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceController;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturnService;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Authorization on the POS endpoints the till calls directly: sessions and day close, invoice
 * lookups, cash drawers and printers, POS search, the till's product panels, and the invoice
 * helpers the till shares with Retail.
 *
 * <p>Permission decisions run through the real {@link ModulePermissionService} over
 * role_permissions rows, and branch decisions through the real {@link BranchAccessService} over a
 * real {@link BranchContextHolder}, so explicit rows, parent inheritance, explicit denies and
 * branch scope behave as they do in production. Controllers are called directly, which is what
 * a client bypassing the UI does; {@link #directApiCallsAreRefusedWithHttp403} also goes through
 * the dispatcher and the application's exception handler to show the status a client receives.
 *
 * <p>Branches: the cashier works in branch 1; branch 2 is another branch they cannot reach.
 */
class PosApiAuthorizationHardeningTest {

    private static final long OWN = 1L;
    private static final long OTHER = 2L;

    // Real authorization services over mocked storage. Declared first: the @Spy fields use them.
    private final RolePermissionRepository rolePermissionRepository = mock(RolePermissionRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);

    @Spy private ModulePermissionService permissions = new ModulePermissionService(rolePermissionRepository);
    @Spy private BranchAccessService branchAccess = new BranchAccessService(userRepository, mock(BranchRepository.class));

    // Checkout collaborators the lookup and list endpoints use.
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private InvoiceCustomerContactService invoiceCustomerContactService;
    @Mock private PaymentRepository paymentRepository;
    @Spy private BusinessDayClock businessDayClock = new BusinessDayClock("Asia/Kolkata");
    @InjectMocks private PosCheckoutController checkoutController;

    // Delivery return, with the real branch check.
    @Mock private SalesReturnService salesReturnService;
    @InjectMocks private PosDeliveryReturnService deliveryReturnService;

    @Mock private PosSessionService sessionService;
    @Mock private PosSessionSyncService syncService;
    @Mock private PosDayStatusService dayStatusService;
    @Mock private PosSettingsService posSettingsService;
    @Mock private PosCredentialVerificationService credentialVerificationService;
    @Mock private PosCashDrawerService drawerService;
    @Mock private PosPrinterService printerService;
    @Mock private PosSearchService searchService;
    @Mock private PosLookupService lookupService;
    @Mock private SalesInvoiceService invoiceService;
    @Mock private ProductService productService;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        when(rolePermissionRepository.findByRole_NameIn(anyCollection())).thenAnswer(inv -> {
            List<RolePermission> rows = new ArrayList<>();
            for (Object role : (Collection<?>) inv.getArgument(0)) {
                rows.addAll(rowsFor(role.toString()));
            }
            return rows;
        });
        when(sessionService.getById(10L)).thenReturn(session(10L, OWN));
        when(sessionService.getById(20L)).thenReturn(session(20L, OTHER));
        when(drawerService.get(10L)).thenReturn(drawer(OWN));
        when(drawerService.get(20L)).thenReturn(drawer(OTHER));
        when(printerService.get(10L)).thenReturn(printer(OWN));
        when(printerService.get(20L)).thenReturn(printer(OTHER));
        dayCloseNeedsSupervisor(false);
    }

    @AfterEach
    void tearDown() throws Exception {
        SecurityContextHolder.clearContext();
        BranchContextHolder.clear();
        mocks.close();
    }

    // ── Sessions ──────────────────────────────────────────────────────────────────────────

    @Test
    void tillCashierRunsTheirShiftInTheirOwnBranch() {
        signIn("TILL_CASHIER", OWN);

        assertDoesNotThrow(() -> sessions().getById(10L));
        assertDoesNotThrow(() -> sessions().touchActivity(10L));
        assertDoesNotThrow(() -> sessions().suspend(10L));
        assertDoesNotThrow(() -> sessions().resume(10L));
        assertDoesNotThrow(() -> sessions().getXReport(10L));
        assertDoesNotThrow(() -> sessions().generateXReport(10L));
        assertDoesNotThrow(() -> sessions().closeSession(10L, Map.of()));
        assertDoesNotThrow(() -> sessions().getZReport(OWN, "2026-10-09", null, null));
        assertDoesNotThrow(() -> sessions().getDayStatus("T1"));
        assertDoesNotThrow(() -> sessions().getActiveSession("T1"));
        assertDoesNotThrow(() -> sessions().getSessionHistory(OWN, "2026-10-01", "2026-10-09", null, null, 0, 20));

        verify(sessionService).suspendSession(10L);
        verify(sessionService).resumeSession(10L);
        verify(sessionService).generateXReport(10L);
        verify(sessionService).touchActivity(10L);
    }

    @Test
    void userWithoutTillAccessCannotReadOrChangeAnySession() {
        signIn("HR", OWN);

        for (Executable call : List.<Executable>of(
                () -> sessions().getById(10L),
                () -> sessions().getActiveSession("T1"),
                () -> sessions().syncSession(10L, "T1"),
                () -> sessions().suspend(10L),
                () -> sessions().resume(10L),
                () -> sessions().touchActivity(10L),
                () -> sessions().closeSession(10L, Map.of()),
                () -> sessions().beginClosure(10L, Map.of()),
                () -> sessions().cancelClosure(10L, Map.of()),
                () -> sessions().authorizeClosure(10L, new ClosureAuthorizationRequest()),
                () -> sessions().authorizeVariance(10L, Map.of("reason", "short")),
                () -> sessions().supervisorTakeover(10L, Map.of()),
                () -> sessions().transferSession(10L, Map.of("destinationTerminalId", "T2", "confirm", true)),
                () -> sessions().addCashMovement(10L, Map.of("amount", "5")),
                () -> sessions().getXReport(10L),
                () -> sessions().generateXReport(10L),
                () -> sessions().checkXReportPrintable(10L),
                () -> sessions().getZReport(OWN, "2026-10-09", null, null),
                () -> sessions().getDayCloseSummary(OWN, "2026-10-09", null, null),
                () -> sessions().checkZReportPrintable(OWN, "2026-10-09"),
                () -> sessions().closeDay(OWN, "2026-10-09", null, null, false),
                () -> sessions().getDayStatus("T1"),
                () -> sessions().getSessionHistory(OWN, "2026-10-01", "2026-10-09", null, null, 0, 20))) {
            assertThrows(AccessDeniedException.class, call);
        }

        // Refused before the session is even read, let alone changed; no password was checked.
        verifyNoInteractions(sessionService, syncService, dayStatusService, credentialVerificationService);
    }

    @Test
    void sessionInAnotherBranchIsRefusedBeforeAnythingChanges() {
        signIn("SALES", OWN);

        for (Executable call : List.<Executable>of(
                () -> sessions().getById(20L),
                () -> sessions().syncSession(20L, "T9"),
                () -> sessions().suspend(20L),
                () -> sessions().resume(20L),
                () -> sessions().touchActivity(20L),
                () -> sessions().closeSession(20L, Map.of()),
                () -> sessions().beginClosure(20L, Map.of()),
                () -> sessions().cancelClosure(20L, Map.of()),
                () -> sessions().authorizeClosure(20L, new ClosureAuthorizationRequest()),
                () -> sessions().authorizeVariance(20L, Map.of("reason", "short")),
                () -> sessions().supervisorTakeover(20L, Map.of()),
                () -> sessions().transferSession(20L, Map.of("destinationTerminalId", "T2", "confirm", true)),
                () -> sessions().addCashMovement(20L, Map.of("amount", "5")),
                () -> sessions().getXReport(20L),
                () -> sessions().checkXReportPrintable(20L))) {
            assertForbidden(call);
        }

        verify(sessionService, never()).suspendSession(anyLong());
        verify(sessionService, never()).resumeSession(anyLong());
        verify(sessionService, never()).touchActivity(anyLong());
        verify(sessionService, never()).supervisorTakeover(anyLong(), any());
        verify(sessionService, never()).transferSession(anyLong(), any(), any(), any());
        verify(sessionService, never()).getXReport(anyLong());
        verify(sessionService, never()).addCashMovement(anyLong(), any(), any(), any(), any(), any());
        verifyNoInteractions(syncService, credentialVerificationService);
    }

    @Test
    void branchReportsAndHistoryForAnotherBranchAreRefused() {
        signIn("SALES", OWN);

        assertForbidden(() -> sessions().getZReport(OTHER, "2026-10-09", null, null));
        assertForbidden(() -> sessions().getDayCloseSummary(OTHER, "2026-10-09", null, null));
        assertForbidden(() -> sessions().checkZReportPrintable(OTHER, "2026-10-09"));
        assertForbidden(() -> sessions().getSessionHistory(OTHER, "2026-10-01", "2026-10-09", null, null, 0, 20));
        verifyNoInteractions(sessionService);
    }

    @Test
    void tillCashMovementNeedsTillAccessAndTheSessionsBranch() {
        Map<String, Object> drop = Map.of("movementType", "DROP_IN", "amount", "50");

        signIn("HR", OWN);
        assertThrows(AccessDeniedException.class, () -> sessions().addCashMovement(10L, drop));
        signIn("TILL_CASHIER", OWN);
        assertForbidden(() -> sessions().addCashMovement(20L, drop));
        verify(sessionService, never()).addCashMovement(anyLong(), any(), any(), any(), any(), any());

        // A cashier without the seeded cash-movement grant keeps cash in/out at the till: the
        // Roles screen offers no switch to grant it, so requiring it would strand such roles.
        assertDoesNotThrow(() -> sessions().addCashMovement(10L, drop));
        verify(sessionService).addCashMovement(eq(10L), eq("DROP_IN"), eq(new BigDecimal("50")), eq(""), isNull(), isNull());
    }

    @Test
    void dayCloseNeedsTillAccessEvenWhenNoSupervisorIsRequired() {
        dayCloseNeedsSupervisor(false);

        signIn("HR", OWN);
        assertThrows(AccessDeniedException.class, () -> sessions().closeDay(OWN, "2026-10-09", null, null, false));

        signIn("TILL_CASHIER", OWN);
        assertForbidden(() -> sessions().closeDay(OTHER, "2026-10-09", null, null, false));
        verify(sessionService, never()).closeDay(anyLong(), any(), any(), any(), anyBoolean());

        assertDoesNotThrow(() -> sessions().closeDay(OWN, "2026-10-09", null, null, false));
        verify(sessionService).closeDay(OWN, LocalDate.parse("2026-10-09"), null, null, false);
    }

    @Test
    void dayCloseStillNeedsASupervisorWhenTheBranchRequiresOne() {
        dayCloseNeedsSupervisor(true);

        signIn("TILL_CASHIER", OWN);
        assertForbidden(() -> sessions().closeDay(OWN, "2026-10-09", null, null, false));
        verify(sessionService, never()).closeDay(anyLong(), any(), any(), any(), anyBoolean());

        signIn("SUPERVISOR", OWN);
        assertDoesNotThrow(() -> sessions().closeDay(OWN, "2026-10-09", null, null, false));
        verify(sessionService).closeDay(OWN, LocalDate.parse("2026-10-09"), null, null, false);
    }

    // ── Invoice lookup and lists ──────────────────────────────────────────────────────────

    @Test
    void invoiceNumberLookupRefusesAnInvoiceFromAnotherBranch() {
        signIn("TILL_CASHIER", OWN);
        when(invoiceRepository.findByInvoiceNumberWithItems("INV-2")).thenReturn(Optional.of(invoice("INV-2", OTHER)));

        assertForbidden(() -> checkoutController.lookupInvoiceForReturn("inv-2", null, null, OWN));
    }

    @Test
    void invoiceNumberLookupStillFindsTheCashiersOwnBranchInvoice() {
        signIn("TILL_CASHIER", OWN);
        SalesInvoice own = invoice("INV-1", OWN);
        when(invoiceRepository.findByInvoiceNumberWithItems("INV-1")).thenReturn(Optional.of(own));

        assertSame(own, checkoutController.lookupInvoiceForReturn("INV-1", null, null, null).getBody());
    }

    @Test
    void invoiceNumberLookupTrustsNoBranchSentByTheClient() {
        // Naming the other branch as the request's branchId changes nothing: the invoice's own
        // branch is what is checked.
        signIn("TILL_CASHIER", OWN);
        when(invoiceRepository.findByInvoiceNumberWithItems("INV-2")).thenReturn(Optional.of(invoice("INV-2", OTHER)));

        assertForbidden(() -> checkoutController.lookupInvoiceForReturn("INV-2", null, null, OTHER));
    }

    @Test
    void prefixLookupSkipsInvoicesFromOtherBranches() {
        signIn("TILL_CASHIER", OWN);
        SalesInvoice own = invoice("INV-10", OWN);
        when(invoiceRepository.findByInvoiceNumberWithItems("INV-1")).thenReturn(Optional.empty());
        when(invoiceRepository.findByInvoiceNumberPrefixWithItems("INV-1"))
                .thenReturn(List.of(invoice("INV-11", OTHER), own));

        assertSame(own, checkoutController.lookupInvoiceForReturn("INV-1", null, null, null).getBody());

        when(invoiceRepository.findByInvoiceNumberPrefixWithItems("INV-1"))
                .thenReturn(List.of(invoice("INV-11", OTHER)));
        assertEquals(HttpStatus.NOT_FOUND,
                checkoutController.lookupInvoiceForReturn("INV-1", null, null, null).getStatusCode());
    }

    @Test
    void mobileLookupOnlyMatchesSalesFromReachableBranches() {
        signIn("TILL_CASHIER", OWN);
        Customer customer = new Customer();
        customer.setCode("C1");
        when(customerRepository.findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                any(), any(), any(), any())).thenReturn(Optional.of(customer));
        SalesInvoice foreign = invoice("INV-2", OTHER);
        foreign.setCustomerCode("C1");
        when(invoiceRepository.findPosInvoicesByDateRange(any(), any(), isNull())).thenReturn(List.of(foreign));

        assertEquals(HttpStatus.NOT_FOUND,
                checkoutController.lookupInvoiceForReturn(null, "0500000000", null, null).getStatusCode());
        verify(invoiceRepository, never()).findByInvoiceNumberWithItems(any());

        assertForbidden(() -> checkoutController.lookupInvoiceForReturn(null, "0500000000", null, OTHER));
    }

    @Test
    void reprintListAndDeliveriesShowOnlyReachableBranches() {
        signIn("TILL_CASHIER", OWN);
        SalesInvoice own = invoice("INV-1", OWN);
        when(invoiceRepository.findPosInvoicesByDateRange(any(), any(), isNull()))
                .thenReturn(List.of(own, invoice("INV-2", OTHER)));
        when(invoiceRepository.findPendingDeliveryOrders(isNull()))
                .thenReturn(List.of(invoice("INV-3", OTHER), own));

        assertEquals(List.of(own), checkoutController.getPosInvoices(null, null, null));
        assertEquals(List.of(own), checkoutController.getPendingDeliveries(null));

        assertForbidden(() -> checkoutController.getPosInvoices(null, null, OTHER));
        assertForbidden(() -> checkoutController.getPendingDeliveries(OTHER));
    }

    @Test
    void administratorKeepsCrossBranchInvoiceLookup() {
        signInAsAdministrator();
        SalesInvoice foreign = invoice("INV-2", OTHER);
        when(invoiceRepository.findByInvoiceNumberWithItems("INV-2")).thenReturn(Optional.of(foreign));
        when(invoiceRepository.findPosInvoicesByDateRange(any(), any(), isNull()))
                .thenReturn(List.of(invoice("INV-1", OWN), foreign));

        assertSame(foreign, checkoutController.lookupInvoiceForReturn("INV-2", null, null, null).getBody());
        assertEquals(2, checkoutController.getPosInvoices(null, null, null).size());
    }

    @Test
    void deliveryReturnForAnotherBranchWritesNothing() {
        signIn("TILL_CASHIER", OWN);
        SalesInvoice foreign = invoice("INV-2", OTHER);
        when(invoiceRepository.findByIdWithItems(5L)).thenReturn(Optional.of(foreign));

        assertForbidden(() -> deliveryReturnService.returnDelivery(5L, new PosDeliveryReturnRequest()));
        verifyNoInteractions(salesReturnService);
        verify(invoiceRepository, never()).save(any());
    }

    // ── Cash drawers and printers ─────────────────────────────────────────────────────────

    @Test
    void tillCashierReadsDrawersAndRecordsKicksButCannotConfigureThem() {
        signIn("SALES", OWN);

        assertDoesNotThrow(() -> drawers().list(OWN));
        assertDoesNotThrow(() -> drawers().get(10L));
        assertDoesNotThrow(() -> drawers().kickResult(10L, Map.of("success", true)));
        verify(drawerService).recordKickResult(10L, true);

        assertThrows(AccessDeniedException.class, () -> drawers().create(drawerRequest(OWN)));
        assertThrows(AccessDeniedException.class, () -> drawers().update(10L, drawerRequest(OWN)));
        assertThrows(AccessDeniedException.class, () -> drawers().decommission(10L));
        verify(drawerService, never()).create(any());
        verify(drawerService, never()).update(anyLong(), any());
        verify(drawerService, never()).decommission(anyLong());
    }

    @Test
    void userWithoutTillOrDeviceAccessCannotTouchDrawers() {
        signIn("HR", OWN);

        assertThrows(AccessDeniedException.class, () -> drawers().list(OWN));
        assertThrows(AccessDeniedException.class, () -> drawers().get(10L));
        assertThrows(AccessDeniedException.class, () -> drawers().kickResult(10L, Map.of("success", true)));
        verifyNoInteractions(drawerService);
    }

    @Test
    void deviceAdministratorConfiguresDrawersOnlyInReachableBranches() {
        signIn("BRANCH_ADMIN", OWN);

        assertDoesNotThrow(() -> drawers().create(drawerRequest(OWN)));
        assertDoesNotThrow(() -> drawers().update(10L, drawerRequest(OWN)));
        assertDoesNotThrow(() -> drawers().decommission(10L));

        // A branch administrator is still confined to their branches.
        assertForbidden(() -> drawers().create(drawerRequest(OTHER)));
        assertForbidden(() -> drawers().update(20L, drawerRequest(OWN)));
        assertForbidden(() -> drawers().update(10L, drawerRequest(OTHER)));
        assertForbidden(() -> drawers().decommission(20L));
        assertForbidden(() -> drawers().kickResult(20L, Map.of("success", true)));
        assertForbidden(() -> drawers().list(OTHER));
        verify(drawerService, times(1)).create(any());
        verify(drawerService, times(1)).update(anyLong(), any());
        verify(drawerService, times(1)).decommission(anyLong());
        verify(drawerService, never()).recordKickResult(anyLong(), anyBoolean());
    }

    @Test
    void printerConfigurationNeedsPrinterAdministration() {
        signIn("SALES", OWN);

        assertThrows(AccessDeniedException.class, () -> printers().create(printerRequest(OWN)));
        assertThrows(AccessDeniedException.class, () -> printers().update(10L, printerRequest(OWN)));
        assertThrows(AccessDeniedException.class, () -> printers().decommission(10L));
        verify(printerService, never()).create(any());
        verify(printerService, never()).update(anyLong(), any());
        verify(printerService, never()).decommission(anyLong());

        // Reading and printing stay open to the till and Retail printing, inside the branch.
        assertDoesNotThrow(() -> printers().list(OWN, null, null));
        assertDoesNotThrow(() -> printers().printEscPos(10L, new PosPrinterController.PrintEscPosRequest("AA==")));
        verify(printerService).printRaw(10L, "AA==", null); // no format: the printer's own type picks the policy

        signInAsAdministrator();
        assertDoesNotThrow(() -> printers().create(printerRequest(OTHER)));
        verify(printerService).create(any());
    }

    @Test
    void rawPrintToAnotherBranchsPrinterSendsNothing() {
        signIn("SALES", OWN);

        assertForbidden(() -> printers().printEscPos(20L, new PosPrinterController.PrintEscPosRequest("G3AAGRk=")));
        assertForbidden(() -> printers().get(20L));
        assertForbidden(() -> printers().updateRuntime(20L, null));
        verify(printerService, never()).printEscPos(anyLong(), any());
        verify(printerService, never()).updateRuntime(anyLong(), any());
    }

    // ── POS search and the till's product panels ──────────────────────────────────────────

    @Test
    void posLookupsNeedTillAccess() {
        signIn("HR", OWN);
        PosSearchController search = new PosSearchController(searchService, lookupService, permissions,
                new com.billbull.backend.inventory.product.ProductCostMasking(permissions, new com.fasterxml.jackson.databind.ObjectMapper()));

        assertThrows(AccessDeniedException.class, () -> search.resolve("4006381333931"));
        assertThrows(AccessDeniedException.class, () -> search.creditBalance("C1"));
        assertThrows(AccessDeniedException.class, () -> search.batchCheck("B1", "", "", ""));
        assertThrows(AccessDeniedException.class, () -> search.customerHistory("C1"));
        verifyNoInteractions(searchService, lookupService);

        signIn("TILL_CASHIER", OWN);
        assertDoesNotThrow(() -> search.resolve("4006381333931"));
        assertDoesNotThrow(() -> search.creditBalance("C1"));
        verify(searchService).resolve("4006381333931");
    }

    @Test
    void tillProductPanelsNeedTillAccess() {
        ProductController products = new ProductController(productService, null, null, null, null, permissions, null,
                new com.billbull.backend.inventory.product.ProductCostMasking(permissions, new com.fasterxml.jackson.databind.ObjectMapper()));
        // A user with Retail inventory access but no till has no reason to call the till's panels.
        signIn("HR", OWN);
        assertThrows(AccessDeniedException.class, () -> products.getFavourites(0, 10));
        assertThrows(AccessDeniedException.class, () -> products.getRecentlySold(0, 10));
        assertThrows(AccessDeniedException.class, () -> products.getTopSold(0, 10));
        verifyNoInteractions(productService);

        signIn("TILL_ONLY", OWN);
        assertDoesNotThrow(() -> products.getRecentlySold(0, 10));
        assertDoesNotThrow(() -> products.getTopSold(0, 10));
    }

    // ── Invoice helpers shared by Retail and the till ─────────────────────────────────────

    @Test
    void invoiceHelpersRefuseRolesWithoutASalesScreen() {
        signIn("HR", OWN);

        assertThrows(AccessDeniedException.class, () -> invoices().getNextNumber());
        assertThrows(AccessDeniedException.class, () -> invoices().getCustomerOutstanding("C1"));
        assertThrows(AccessDeniedException.class, () -> invoices().getPriceHistory("ITEM-1", "C1"));
        verifyNoInteractions(invoiceService);
    }

    @Test
    void invoiceHelpersKeepTheirRetailAndTillReaders() {
        when(invoiceService.generateInvoiceNumber()).thenReturn("INV-0001");
        for (String role : List.of("INVOICE_CLERK", "TILL_CASHIER", "TILL_ONLY", "SALES")) {
            signIn(role, OWN);
            assertDoesNotThrow(() -> invoices().getNextNumber(), role);
            assertDoesNotThrow(() -> invoices().getCustomerOutstanding("C1"), role);
            assertDoesNotThrow(() -> invoices().getPriceHistory("ITEM-1", "C1"), role);
        }

        // Quotation and delivery-note entry show price history, nothing else.
        signIn("QUOTE_CLERK", OWN);
        assertDoesNotThrow(() -> invoices().getPriceHistory("ITEM-1", "C1"));
        assertThrows(AccessDeniedException.class, () -> invoices().getCustomerOutstanding("C1"));
        assertThrows(AccessDeniedException.class, () -> invoices().getNextNumber());
    }

    // ── Over HTTP ─────────────────────────────────────────────────────────────────────────

    @Test
    void directApiCallsAreRefusedWithHttp403() throws Exception {
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(checkoutController, sessions(), drawers(), invoices())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        when(invoiceRepository.findByInvoiceNumberWithItems("INV-2")).thenReturn(Optional.of(invoice("INV-2", OTHER)));

        signIn("TILL_CASHIER", OWN);
        mvc.perform(get("/api/pos/checkout/invoices/lookup").param("invoiceNumber", "INV-2"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/pos/cash-drawers").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deviceCode\":\"DRW-1\",\"deviceName\":\"Drawer\",\"branchId\":1}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/pos/sessions/20/suspend")).andExpect(status().isForbidden());

        signIn("HR", OWN);
        mvc.perform(post("/api/pos/sessions/close-day").param("branchId", "1").param("date", "2026-10-09"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/sales/invoices/outstanding").param("customerCode", "C1"))
                .andExpect(status().isForbidden());

        verify(sessionService, never()).suspendSession(anyLong());
        verify(sessionService, never()).closeDay(anyLong(), any(), any(), any(), anyBoolean());
        verify(drawerService, never()).create(any());
        verifyNoInteractions(invoiceService);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────────────

    private PosSessionController sessions() {
        return new PosSessionController(sessionService, syncService, null, dayStatusService, null, branchAccess,
                new PosAuthorizationService(posSettingsService), credentialVerificationService, null, null,
                permissions);
    }

    private PosCashDrawerController drawers() {
        return new PosCashDrawerController(drawerService, permissions, branchAccess);
    }

    private PosPrinterController printers() {
        return new PosPrinterController(printerService, permissions, branchAccess);
    }

    private SalesInvoiceController invoices() {
        return new SalesInvoiceController(invoiceService, invoiceCustomerContactService, permissions,
                null, null, null, null);
    }

    private void dayCloseNeedsSupervisor(boolean required) {
        PosSettings settings = new PosSettings();
        settings.setRequireSupervisorForDayClose(required);
        when(posSettingsService.getForBranch(anyLong())).thenReturn(settings);
    }

    /** A branch-restricted user whose only branch is {@code branch}. */
    private void signIn(String role, long branch) {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "pw", "ROLE_" + role));
        BranchContextHolder.set(new BranchContextHolder.BranchContext(branch, Set.of(branch), false));
    }

    /** ADMIN on the consolidated all-branches view, as JwtFilter sets it. */
    private void signInAsAdministrator() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin", "pw", "ROLE_ADMIN"));
        BranchContextHolder.set(new BranchContextHolder.BranchContext(null, Set.of(), true));
    }

    private static void assertForbidden(Executable call) {
        ResponseStatusException refused = assertThrows(ResponseStatusException.class, call);
        assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode());
    }

    private static PosSession session(long id, long branch) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setBranchId(branch);
        return s;
    }

    private static PosCashDrawer drawer(long branch) {
        PosCashDrawer d = new PosCashDrawer();
        d.setBranchId(branch);
        return d;
    }

    private static PosPrinter printer(long branch) {
        PosPrinter p = new PosPrinter();
        p.setBranchId(branch);
        return p;
    }

    private static SalesInvoice invoice(String number, long branch) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setBranchId(branch);
        inv.setItems(new ArrayList<>());
        return inv;
    }

    private static PosCashDrawerService.UpsertRequest drawerRequest(long branch) {
        return new PosCashDrawerService.UpsertRequest("DRW-1", "Drawer", branch, null, null, null, 1L, null, null);
    }

    private static PosPrinterService.UpsertRequest printerRequest(long branch) {
        return new PosPrinterService.UpsertRequest("PRN-1", null, "Printer", null, branch, null, null, null, null,
                null, null, null, "10.0.0.5", 9100, null, null, null, null, null);
    }

    /** role_permissions rows per role: (module, view, create, edit, delete, approve). */
    private List<RolePermission> rowsFor(String role) {
        return switch (role) {
            // Least-privilege till cashier: till and invoice view, no cash movement grant.
            case "TILL_CASHIER" -> List.of(
                    row(role, "sales.pos", true, true, false, false, false),
                    row(role, "sales.invoice", true, false, false, false, false));
            case "TILL_ONLY" -> List.of(row(role, "sales.pos", true, true, false, false, false));
            case "INVOICE_CLERK" -> List.of(row(role, "sales.invoice", true, true, true, false, false));
            case "QUOTE_CLERK" -> List.of(row(role, "sales.quotation", true, true, true, false, false));
            // Seeded by RolePermissionInitializer.
            case "SALES" -> List.of(
                    row(role, "sales", true, true, true, false, false),
                    row(role, "pos", true, false, false, false, false),
                    row(role, "permissions.pos.cashmovement.create", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.view", true, true, true, true, true));
            case "SUPERVISOR" -> List.of(
                    row(role, "sales", true, false, false, false, true),
                    row(role, "pos", true, false, false, false, false),
                    row(role, "permissions.pos.cashmovement.create", true, true, true, true, true));
            case "BRANCH_ADMIN", "ADMIN" -> List.of(
                    row(role, "sales", true, true, true, true, true),
                    row(role, "pos", true, true, true, true, true));
            case "HR" -> List.of(row(role, "hr", true, true, true, false, false));
            default -> List.of();
        };
    }

    private RolePermission row(String roleName, String module,
                               boolean view, boolean create, boolean edit, boolean delete, boolean approve) {
        Role role = new Role();
        role.setName(roleName);
        RolePermission rp = new RolePermission();
        rp.setRole(role);
        rp.setModule(module);
        rp.setCanView(view);
        rp.setCanCreate(create);
        rp.setCanEdit(edit);
        rp.setCanDelete(delete);
        rp.setCanApprove(approve);
        return rp;
    }
}
