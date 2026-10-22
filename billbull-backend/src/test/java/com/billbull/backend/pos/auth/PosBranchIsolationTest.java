package com.billbull.backend.pos.auth;

import com.billbull.backend.exception.GlobalExceptionHandler;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.reservation.PosStockReservationService;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.held.PosHeldSale;
import com.billbull.backend.pos.held.PosHeldSaleController;
import com.billbull.backend.pos.held.PosHeldSaleRepository;
import com.billbull.backend.pos.held.PosHeldSaleRequest;
import com.billbull.backend.pos.held.PosHeldSaleService;
import com.billbull.backend.pos.layaway.PosLayaway;
import com.billbull.backend.pos.layaway.PosLayawayCashMovementService;
import com.billbull.backend.pos.layaway.PosLayawayCreateRequest;
import com.billbull.backend.pos.layaway.PosLayawayPaymentRepository;
import com.billbull.backend.pos.layaway.PosLayawayRepository;
import com.billbull.backend.pos.layaway.PosLayawayService;
import com.billbull.backend.pos.layaway.PosLayawayStatus;
import com.billbull.backend.pos.session.PosCashMovementController;
import com.billbull.backend.pos.session.PosCashMovementService;
import com.billbull.backend.pos.session.PosCashMovementSessionOption;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsController;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static com.billbull.backend.pos.auth.PosAuthFixture.OTHER;
import static com.billbull.backend.pos.auth.PosAuthFixture.OWN;
import static com.billbull.backend.pos.auth.PosAuthFixture.assertForbidden;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Branch isolation for held sales, layaways, back-office cash movements and POS settings: a
 * caller who changes an id or a {@code branchId} in the request must not read or change another
 * branch's records, and a refused change must write nothing.
 *
 * <p>Held sales and layaways run through their real services, so the check is shown to sit
 * before every write. Cash movements and settings run through their real controllers over mocked
 * services, which shows the service is never reached.
 */
class PosBranchIsolationTest {

    private final PosAuthFixture auth = new PosAuthFixture();

    private final PosSessionRepository sessionRepository = mock(PosSessionRepository.class);
    private final PosHeldSaleRepository heldRepository = mock(PosHeldSaleRepository.class);
    private final PosLayawayRepository layawayRepository = mock(PosLayawayRepository.class);
    private final PosLayawayPaymentRepository layawayPaymentRepository = mock(PosLayawayPaymentRepository.class);
    private final BatchSelectionService batchSelectionService = mock(BatchSelectionService.class);
    private final PosStockReservationService stockReservationService = mock(PosStockReservationService.class);
    private final PosLayawayCashMovementService layawayCashService = mock(PosLayawayCashMovementService.class);
    private final RolePermissionService rolePermissionService = mock(RolePermissionService.class);
    private final PosCashMovementService cashMovementService = mock(PosCashMovementService.class);
    private final PosSettingsService settingsService = mock(PosSettingsService.class);

    private PosHeldSaleService heldSales;
    private PosLayawayService layaways;

    @BeforeEach
    void setUp() {
        when(sessionRepository.findById(10L)).thenReturn(Optional.of(session(10L, OWN)));
        when(sessionRepository.findById(20L)).thenReturn(Optional.of(session(20L, OTHER)));
        when(heldRepository.findById(10L)).thenReturn(Optional.of(held(10L, 10L)));
        when(heldRepository.findById(20L)).thenReturn(Optional.of(held(20L, 20L)));
        when(heldRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(layawayRepository.findById(10L)).thenReturn(Optional.of(layaway(10L, OWN)));
        when(layawayRepository.findById(20L)).thenReturn(Optional.of(layaway(20L, OTHER)));
        when(rolePermissionService.currentUserCanDelete(anyString())).thenReturn(true);
        when(cashMovementService.branchIdOf(10L)).thenReturn(OWN);
        when(cashMovementService.branchIdOf(20L)).thenReturn(OTHER);

        heldSales = new PosHeldSaleService(heldRepository, sessionRepository, auth.branchAccess);
        layaways = new PosLayawayService(layawayRepository, layawayPaymentRepository, mock(ProductRepository.class),
                batchSelectionService, stockReservationService, rolePermissionService,
                new com.billbull.backend.pos.checkout.PosPaymentAllocationResolver(),
                mock(PostingEngineService.class), mock(BranchRepository.class), mock(WarehouseRepository.class),
                mock(PosAuditService.class), mock(com.billbull.backend.common.tax.BranchTaxResolutionService.class),
                new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Kolkata"), sessionRepository,
                mock(com.billbull.backend.inventory.warehouse.WarehouseSourceResolutionService.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class));
        ReflectionTestUtils.setField(layaways, "cashMovementService", layawayCashService);
        ReflectionTestUtils.setField(layaways, "branchAccessService", auth.branchAccess);
    }

    @AfterEach
    void tearDown() {
        auth.clear();
    }

    // ── Held sales ────────────────────────────────────────────────────────────────────────

    @Test
    void aCartCannotBeHeldOnAnotherBranchsSession() {
        auth.signIn("TILL_CASHIER", OWN);

        assertForbidden(() -> heldSales.hold(holdRequest(20L, OWN)));
        verify(heldRepository, never()).save(any());
    }

    @Test
    void aHeldCartTakesItsBranchFromTheSessionNotTheRequest() {
        auth.signIn("TILL_CASHIER", OWN);

        heldSales.hold(holdRequest(10L, OTHER)); // the client claims branch 2 on a branch-1 session

        ArgumentCaptor<PosHeldSale> saved = ArgumentCaptor.forClass(PosHeldSale.class);
        verify(heldRepository).save(saved.capture());
        assertEquals(OWN, saved.getValue().getBranchId());
    }

    @Test
    void anotherBranchsHeldCartsCannotBeListedOrRecalled() {
        auth.signIn("TILL_CASHIER", OWN);

        assertForbidden(() -> heldSales.listForSession(20L));
        assertForbidden(() -> heldSales.recall(20L));
        verify(heldRepository, never()).save(any());
        verify(heldRepository, never()).findByPosSessionIdAndIsActiveTrueOrderByCreatedAtAsc(any());

        assertEquals(10L, heldSales.recall(10L).getId());
    }

    @Test
    void anAdministratorRecallsAcrossBranches() {
        auth.signInAsAdministrator();
        assertDoesNotThrow(() -> heldSales.recall(20L));
    }

    @Test
    void aCrossBranchRecallOverHttpIs403AndTheCartStaysHeld() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new PosHeldSaleController(heldSales, auth.permissions))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        auth.signIn("TILL_CASHIER", OWN);

        mvc.perform(post("/api/pos/held-sales/20/recall")).andExpect(status().isForbidden());
        assertTrue(heldRepository.findById(20L).orElseThrow().isActive());
        verify(heldRepository, never()).save(any());
    }

    // ── Layaways ──────────────────────────────────────────────────────────────────────────

    @Test
    void anotherBranchsLayawayCannotBeReadOrChanged() {
        auth.signIn("SALES", OWN);

        assertForbidden(() -> layaways.getById(20L));
        assertForbidden(() -> layaways.getPayments(20L));
        assertForbidden(() -> layaways.cancel(20L, 10L));
        assertForbidden(() -> layaways.markConverted(20L, 99L, "INV-99"));
        assertForbidden(() -> layaways.recordPayment(20L, new BigDecimal("10"), "CASH", null, null, 10L));
        assertForbidden(() -> layaways.releaseReservation(20L));

        assertNothingWrittenForLayaways();
    }

    @Test
    void layawayCashCannotBeBookedToAnotherBranchsDrawer() {
        auth.signIn("SALES", OWN);

        assertForbidden(() -> layaways.recordPayment(10L, new BigDecimal("10"), "CASH", null, null, 20L));
        assertForbidden(() -> layaways.cancel(10L, 20L));

        assertNothingWrittenForLayaways();
    }

    @Test
    void aLayawayCannotBeCreatedForAnotherBranch() {
        auth.signIn("SALES", OWN);

        assertForbidden(() -> layaways.create(layawayRequest(OTHER, 10L)));
        assertForbidden(() -> layaways.create(layawayRequest(OWN, 20L)));

        assertNothingWrittenForLayaways();
        verify(layawayRepository, never()).findMaxLayawayNumber();
    }

    @Test
    void layawaySearchIsLimitedToReachableBranches() {
        when(layawayRepository.search(isNull(), any(), any(), any(), any()))
                .thenReturn(new ArrayList<>(List.of(layaway(10L, OWN), layaway(20L, OTHER))));

        auth.signIn("SALES", OWN);
        assertForbidden(() -> layaways.search(OTHER, null, null, null));
        assertEquals(List.of(10L), layaways.search(null, null, null, null).stream().map(PosLayaway::getId).toList());

        auth.signInAsAdministrator();
        assertEquals(2, layaways.search(null, null, null, null).size());
        assertDoesNotThrow(() -> layaways.getById(20L));
    }

    private void assertNothingWrittenForLayaways() {
        verify(layawayRepository, never()).save(any());
        verify(layawayPaymentRepository, never()).save(any());
        verifyNoInteractions(batchSelectionService, stockReservationService, layawayCashService);
    }

    // ── Back-office cash movements ────────────────────────────────────────────────────────

    @Test
    void cashMovementsOfAnotherBranchCannotBeListedReadOrChanged() {
        auth.signIn("CASH_OFFICE", OWN);

        assertForbidden(() -> cashMovements().list(OTHER, null, null, null, null, null, null, 0, 20));
        assertForbidden(() -> cashMovements().list(null, 20L, null, null, null, null, null, 0, 20));
        assertForbidden(() -> cashMovements().getById(20L));
        assertForbidden(() -> cashMovements().edit(20L, new PosCashMovementController.EditRequest()));
        assertForbidden(() -> cashMovements().voidMovement(20L, voidRequest()));
        assertForbidden(() -> cashMovements().create(createRequest(20L)));
        assertForbidden(() -> cashMovements().eligibleSessions(OTHER));

        verify(cashMovementService, never()).list(any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt());
        verify(cashMovementService, never()).getById(anyLong());
        verify(cashMovementService, never()).edit(anyLong(), any(), any());
        verify(cashMovementService, never()).voidMovement(anyLong(), any());
        verify(cashMovementService, never()).create(any(), any(), any(), any(), any(), any());
    }

    @Test
    void anUnfilteredCashMovementListIsScopedInTheQuery() {
        ArgumentCaptor<BranchAccessService.ListScope> scope = ArgumentCaptor.forClass(BranchAccessService.ListScope.class);

        auth.signIn("CASH_OFFICE", OWN);
        cashMovements().list(null, null, null, null, null, null, null, 0, 20);
        auth.signInAsAdministrator();
        cashMovements().list(null, null, null, null, null, null, null, 0, 20);

        verify(cashMovementService, times(2)).list(scope.capture(), isNull(), isNull(), any(), any(), any(), any(), any(), anyInt(), anyInt());
        assertEquals(new BranchAccessService.ListScope(false, Set.of(OWN)), scope.getAllValues().get(0));
        assertTrue(scope.getAllValues().get(1).allBranches());
    }

    @Test
    void eligibleSessionsForEveryBranchShowOnlyReachableOnes() {
        when(cashMovementService.listEligibleSessions(isNull()))
                .thenReturn(List.of(PosCashMovementSessionOption.from(session(10L, OWN)),
                        PosCashMovementSessionOption.from(session(20L, OTHER))));

        auth.signIn("CASH_OFFICE", OWN);
        assertEquals(List.of(OWN), cashMovements().eligibleSessions(null).getBody().stream()
                .map(PosCashMovementSessionOption::getBranchId).toList());
    }

    @Test
    void ownBranchCashMovementWorkKeepsWorking() {
        auth.signIn("CASH_OFFICE", OWN);
        assertDoesNotThrow(() -> cashMovements().getById(10L));
        assertDoesNotThrow(() -> cashMovements().voidMovement(10L, voidRequest()));
        assertDoesNotThrow(() -> cashMovements().create(createRequest(10L)));
        verify(cashMovementService).voidMovement(10L, "Miscounted");
        verify(cashMovementService).create(eq(10L), any(), any(), any(), any(), any());
    }

    // ── POS settings ──────────────────────────────────────────────────────────────────────

    @Test
    void settingsNeedPosSettingsEditToSave() {
        PosSettings ownBranch = settingsFor(OWN);

        for (String role : List.of("TILL_CASHIER", "SALES", "HR")) {
            auth.signIn(role, OWN);
            assertThrows(AccessDeniedException.class, () -> settings().save(ownBranch), role);
        }
        verify(settingsService, never()).save(any());

        auth.signIn("MANAGER", OWN); // seeded pos edit
        assertDoesNotThrow(() -> settings().save(ownBranch));
        verify(settingsService).save(ownBranch);
    }

    @Test
    void settingsOfAnotherBranchCannotBeReadOrSaved() {
        auth.signIn("BRANCH_ADMIN", OWN);
        assertForbidden(() -> settings().save(settingsFor(OTHER)));
        assertForbidden(() -> settings().getForBranch(OTHER));
        verify(settingsService, never()).save(any());
        verify(settingsService, never()).getForBranch(anyLong());

        auth.signInAsAdministrator();
        assertDoesNotThrow(() -> settings().save(settingsFor(OTHER)));
        assertDoesNotThrow(() -> settings().getForBranch(OTHER));
    }

    @Test
    void theTillReadsItsSettingsButOtherUsersCannot() {
        auth.signIn("TILL_CASHIER", OWN);
        assertDoesNotThrow(() -> settings().get());
        assertDoesNotThrow(() -> settings().getForBranch(OWN));

        auth.signIn("HR", OWN);
        assertThrows(AccessDeniedException.class, () -> settings().get());
        assertThrows(AccessDeniedException.class, () -> settings().verifyPin(new PosSettingsController.VerifyPinRequest()));
        verify(settingsService, never()).verifyPin(any());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────────────

    private PosCashMovementController cashMovements() {
        return new PosCashMovementController(cashMovementService, auth.permissions, auth.branchAccess, sessionRepository);
    }

    private PosSettingsController settings() {
        return new PosSettingsController(settingsService, auth.permissions, auth.branchAccess);
    }

    private static PosSession session(long id, long branch) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setBranchId(branch);
        return s;
    }

    private static PosHeldSale held(long id, long sessionId) {
        PosHeldSale h = new PosHeldSale();
        h.setId(id);
        h.setPosSessionId(sessionId);
        h.setActive(true);
        return h;
    }

    private static PosHeldSaleRequest holdRequest(long sessionId, long claimedBranch) {
        PosHeldSaleRequest r = new PosHeldSaleRequest();
        r.setSessionId(sessionId);
        r.setBranchId(claimedBranch);
        r.setCartJson("{\"lines\":[]}");
        return r;
    }

    private static PosLayaway layaway(long id, long branch) {
        PosLayaway l = new PosLayaway();
        l.setId(id);
        l.setBranchId(branch);
        l.setStatus(PosLayawayStatus.ACTIVE);
        l.setItems(new ArrayList<>());
        return l;
    }

    private static PosLayawayCreateRequest layawayRequest(long branch, long sessionId) {
        PosLayawayCreateRequest.PosLayawayItemRequest item = new PosLayawayCreateRequest.PosLayawayItemRequest();
        item.setItemCode("ITEM-1");
        item.setQuantity(1);
        PosLayawayCreateRequest r = new PosLayawayCreateRequest();
        r.setBranchId(branch);
        r.setSessionId(sessionId);
        r.setCustomerCode("C-1");
        r.setItems(List.of(item));
        return r;
    }

    private static PosCashMovementController.CreateRequest createRequest(long sessionId) {
        PosCashMovementController.CreateRequest r = new PosCashMovementController.CreateRequest();
        r.sessionId = sessionId;
        r.movementType = "DROP_IN";
        r.amount = new BigDecimal("50");
        return r;
    }

    private static PosCashMovementController.VoidRequest voidRequest() {
        PosCashMovementController.VoidRequest r = new PosCashMovementController.VoidRequest();
        r.voidReason = "Miscounted";
        return r;
    }

    private static PosSettings settingsFor(long branch) {
        PosSettings s = new PosSettings();
        s.setBranchId(branch);
        return s;
    }
}
