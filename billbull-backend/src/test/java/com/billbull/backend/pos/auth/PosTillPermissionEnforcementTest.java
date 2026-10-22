package com.billbull.backend.pos.auth;

import com.billbull.backend.pos.checkout.PosCheckoutController;
import com.billbull.backend.pos.checkout.PosCheckoutRequest;
import com.billbull.backend.pos.held.PosHeldSaleController;
import com.billbull.backend.pos.held.PosHeldSaleRequest;
import com.billbull.backend.pos.held.PosHeldSaleService;
import com.billbull.backend.pos.layaway.PosLayawayController;
import com.billbull.backend.pos.layaway.PosLayawayCreateRequest;
import com.billbull.backend.pos.layaway.PosLayawayService;
import com.billbull.backend.pos.session.PosAuthorizationService;
import com.billbull.backend.pos.session.PosSessionController;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.role.Role;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceController;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * The till permission ({@code sales.pos}) as the backend enforces it, per role.
 *
 * <p>Permission decisions here run through the real {@link ModulePermissionService} against
 * role_permissions rows, so explicit rows, parent inheritance and explicit denies behave as they do
 * in production. The controllers are called directly, which is what a client bypassing the till's
 * route guards does: these endpoints carry no URL-level rule beyond authentication.
 *
 * <p>Roles: a least-privilege till cashier (explicit {@code sales.pos} + {@code sales.invoice} view
 * rows, no {@code sales} parent), a back-office invoice clerk without the till permission, a user
 * holding both, the seeded SALES and SUPERVISOR roles (which reach both keys through the
 * {@code sales} parent row), and a role with no sales access at all.
 */
class PosTillPermissionEnforcementTest {

    @Mock private RolePermissionRepository rolePermissionRepository;

    // Checkout controller collaborators the replay path touches.
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private SalesInvoiceService invoiceService;
    @Mock private InvoiceCustomerContactService invoiceCustomerContactService;
    // Delegates to the real permission service below, so @InjectMocks can still build the controller.
    @Mock private ModulePermissionService checkoutPermissions;
    @InjectMocks private PosCheckoutController checkoutController;

    @Mock private PosHeldSaleService heldSaleService;
    @Mock private PosLayawayService layawayService;
    @Mock private PosSessionService sessionService;
    @Mock private PosSettingsService posSettingsService;

    private ModulePermissionService permissions;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        permissions = new ModulePermissionService(rolePermissionRepository);
        doAnswer(inv -> { permissions.requireCanView(inv.getArgument(0)); return null; })
                .when(checkoutPermissions).requireCanView(anyString());
        when(rolePermissionRepository.findByRole_NameIn(anyCollection())).thenAnswer(inv -> {
            List<RolePermission> rows = new ArrayList<>();
            for (Object role : (java.util.Collection<?>) inv.getArgument(0)) {
                rows.addAll(rowsFor(role.toString()));
            }
            return rows;
        });
    }

    @AfterEach
    void tearDown() throws Exception {
        SecurityContextHolder.clearContext();
        mocks.close();
    }

    // ── Till cashier: sales.pos + sales.invoice view, nothing else ────────────────────────

    @Test
    void tillCashierCanOperateEveryTillEndpoint() {
        authenticateAs("TILL_CASHIER");

        assertEquals(HttpStatus.OK, replayCheckout().getStatusCode());
        assertDoesNotThrow(() -> heldSaleController().hold(new PosHeldSaleRequest()));
        assertDoesNotThrow(() -> layawayController().create(new PosLayawayCreateRequest()));
        assertDoesNotThrow(() -> sessionController().openSession(Map.of("terminalId", "T1")));
        verify(heldSaleService).hold(any());
        verify(layawayService).create(any());
        verify(sessionService).openSession(eq("T1"), anyString(), any(BigDecimal.class));
    }

    @Test
    void tillCashierGainsNoBackOfficeInvoiceAuthority() {
        authenticateAs("TILL_CASHIER");

        // Creating a back-office invoice needs sales.invoice CREATE, which the till does not grant.
        SalesInvoiceController invoices = new SalesInvoiceController(
                invoiceService, invoiceCustomerContactService, permissions, null, null, null, null);
        assertThrows(AccessDeniedException.class, () -> invoices.save(new SalesInvoice()));
        assertFalse(permissions.canEdit("sales.invoice"));
        verify(invoiceService, never()).save(any());
    }

    // ── Back-office user: sales.invoice, but no till permission ───────────────────────────

    @Test
    void invoiceClerkWithoutTillPermissionIsRefusedBeforeAnythingIsWritten() {
        authenticateAs("INVOICE_CLERK");
        assertTillRefusedEverywhere();
    }

    @Test
    void explicitTillDenyOverridesTheSalesParentGrant() {
        authenticateAs("SALES_NO_TILL");
        assertTillRefusedEverywhere();
    }

    @Test
    void roleWithNoSalesAccessCanNoLongerRingUpASaleOverTheApi() {
        authenticateAs("HR");
        assertTillRefusedEverywhere();
    }

    // ── Users holding both, and the seeded roles (embedded POS compatibility) ─────────────

    @Test
    void userWithTillAndInvoiceAccessCanOperateTheTill() {
        authenticateAs("TILL_AND_INVOICE");
        assertEquals(HttpStatus.OK, replayCheckout().getStatusCode());
        assertTrue(permissions.canCreate("sales.invoice"));
    }

    @Test
    void seededSalesRoleKeepsTillAccessThroughTheSalesParentRow() {
        authenticateAs("SALES");
        assertEquals(HttpStatus.OK, replayCheckout().getStatusCode());
        assertDoesNotThrow(() -> heldSaleController().hold(new PosHeldSaleRequest()));
    }

    // ── Supervisor-only controls are untouched by till access ─────────────────────────────

    @Test
    void dayCloseStillRequiresASupervisorWhenTheBranchSaysSo() {
        PosSettings settings = new PosSettings();
        settings.setRequireSupervisorForDayClose(true);
        when(posSettingsService.getForBranch(1L)).thenReturn(settings);
        PosAuthorizationService dayClose = new PosAuthorizationService(posSettingsService);

        authenticateAs("TILL_CASHIER");
        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> dayClose.authorizeDayClose(1L));
        assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode());

        authenticateAs("SUPERVISOR");
        assertDoesNotThrow(() -> dayClose.authorizeDayClose(1L));
        assertEquals(HttpStatus.OK, replayCheckout().getStatusCode());
    }

    @Test
    void tillAccessNeverConfersCorrectionApproval() {
        authenticateAs("SALES");
        assertTrue(permissions.canView(PosTillPermission.MODULE));
        assertFalse(permissions.canApprove("pos.admin.approvals"));

        authenticateAs("SUPERVISOR");
        assertTrue(permissions.canApprove("pos.admin.approvals"));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────────────

    private void assertTillRefusedEverywhere() {
        PosCheckoutRequest request = new PosCheckoutRequest();
        request.setCheckoutKey("k-1");
        assertThrows(AccessDeniedException.class, () -> checkoutController.checkout(request));
        assertThrows(AccessDeniedException.class, () -> checkoutController.getPosInvoices(null, null, 1L));
        assertThrows(AccessDeniedException.class,
                () -> checkoutController.lookupInvoiceForReturn("INV-1", null, null, 1L));
        assertThrows(AccessDeniedException.class, () -> checkoutController.getReceiptData(1L));
        assertThrows(AccessDeniedException.class, () -> checkoutController.getPendingDeliveries(1L));
        assertThrows(AccessDeniedException.class,
                () -> checkoutController.settleDelivery(1L, new PosCheckoutController.DeliverySettleRequest()));
        assertThrows(AccessDeniedException.class, () -> heldSaleController().hold(new PosHeldSaleRequest()));
        assertThrows(AccessDeniedException.class, () -> heldSaleController().recall(1L));
        assertThrows(AccessDeniedException.class, () -> layawayController().create(new PosLayawayCreateRequest()));
        assertThrows(AccessDeniedException.class, () -> layawayController().recordPayment(1L,
                new PosLayawayController.PaymentRequest()));
        assertThrows(AccessDeniedException.class,
                () -> sessionController().openSession(Map.of("terminalId", "T1")));

        // Refused at the door: no invoice read (not even the idempotent replay), nothing written.
        verifyNoInteractions(invoiceRepository, invoiceService, heldSaleService, layawayService, sessionService);
    }

    /** The idempotent replay path: the smallest complete checkout call that returns a sale. */
    private org.springframework.http.ResponseEntity<?> replayCheckout() {
        SalesInvoice sale = new SalesInvoice();
        sale.setId(7L);
        when(invoiceRepository.findByPosCheckoutKey("k-1")).thenReturn(Optional.of(sale));
        when(invoiceService.getById(7L)).thenReturn(sale);
        PosCheckoutRequest request = new PosCheckoutRequest();
        request.setCheckoutKey("k-1");
        return checkoutController.checkout(request);
    }

    private PosHeldSaleController heldSaleController() {
        return new PosHeldSaleController(heldSaleService, permissions);
    }

    private PosLayawayController layawayController() {
        return new PosLayawayController(layawayService, permissions);
    }

    private PosSessionController sessionController() {
        return new PosSessionController(sessionService, null, null, null, null, null, null, null, null, null,
                permissions);
    }

    private void authenticateAs(String role) {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "pw", "ROLE_" + role));
    }

    /** role_permissions rows per role: (module, view, create, edit, approve). */
    private List<RolePermission> rowsFor(String role) {
        return switch (role) {
            case "TILL_CASHIER" -> List.of(
                    row(role, "sales.pos", true, true, false, false),
                    row(role, "sales.invoice", true, false, false, false));
            case "INVOICE_CLERK" -> List.of(
                    row(role, "sales.invoice", true, true, true, false));
            case "SALES_NO_TILL" -> List.of(
                    row(role, "sales", true, true, true, false),
                    row(role, "sales.pos", false, false, false, false));
            case "TILL_AND_INVOICE" -> List.of(
                    row(role, "sales.pos", true, true, false, false),
                    row(role, "sales.invoice", true, true, true, false));
            // Seeded by RolePermissionInitializer.
            case "SALES" -> List.of(
                    row(role, "sales", true, true, true, false),
                    row(role, "pos", true, false, false, false),
                    row(role, "pos.admin.approvals", false, false, false, false));
            case "SUPERVISOR" -> List.of(
                    row(role, "sales", true, false, false, true),
                    row(role, "pos", true, false, false, false),
                    row(role, "pos.admin.approvals", true, false, false, true));
            case "HR" -> List.of(row(role, "hr", true, true, true, false));
            default -> List.of();
        };
    }

    private RolePermission row(String roleName, String module,
                               boolean view, boolean create, boolean edit, boolean approve) {
        Role role = new Role();
        role.setName(roleName);
        RolePermission rp = new RolePermission();
        rp.setRole(role);
        rp.setModule(module);
        rp.setCanView(view);
        rp.setCanCreate(create);
        rp.setCanEdit(edit);
        rp.setCanDelete(edit);
        rp.setCanApprove(approve);
        return rp;
    }
}
