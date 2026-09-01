package com.billbull.backend.pos.layaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.config.PosDrawerCashCategorySeeder;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementStatus;
import com.billbull.backend.pos.session.PosCashMovementType;
import com.billbull.backend.pos.session.PosDrawerSessionValidator;
import com.billbull.backend.pos.session.PosSessionService;

/**
 * Drawer movements for layaway cash.
 *
 * <p>Layaway cash previously reached only pos_layaway_payments and the GL, so a cash deposit
 * left the drawer long at close and a cash cancellation refund left it short.
 */
@ExtendWith(MockitoExtension.class)
class PosLayawayCashMovementServiceTest {

    @Mock private PosSessionService posSessionService;
    @Mock private PosDrawerSessionValidator drawerSessionValidator;
    @Mock private PosCashMovementCategoryRepository categoryRepository;
    @Mock private PosCashMovementRepository cashMovementRepository;

    @InjectMocks private PosLayawayCashMovementService service;

    // -- Cash in -------------------------------------------------------------------------

    @Test
    void cashDepositBooksADropInAgainstTheDeclaredDrawer() {
        stubCategory(PosDrawerCashCategorySeeder.LAYAWAY_DEPOSIT_CODE, 11L);
        stubNoExistingMovement();
        PosCashMovement created = new PosCashMovement();
        when(posSessionService.addCashMovement(
                eq(9L), eq("DROP_IN"), eq(new BigDecimal("600.00")), anyString(),
                eq("LAY-DEP-3"), eq(11L), eq(false)))
                .thenReturn(created);

        assertSame(created, service.recordDeposit(3L, "LAY-0003", new BigDecimal("600.00"), "Cash", 9L));
        verify(drawerSessionValidator).requireOpenDrawerSession(eq(9L), anyString());
    }

    @Test
    void cashInstalmentBooksADropInKeyedToThePaymentRow() {
        // Keyed on the instalment id, not the layaway id, so a second instalment against the
        // same layaway is its own movement rather than being swallowed as a duplicate.
        stubCategory(PosDrawerCashCategorySeeder.LAYAWAY_DEPOSIT_CODE, 11L);
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(
                anyLong(), eq("DROP_IN"), any(), anyString(), eq("LAY-PAY-77"), anyLong(), eq(false)))
                .thenReturn(new PosCashMovement());

        service.recordInstalment(77L, 3L, "LAY-0003", new BigDecimal("200.00"), "Cash", 9L);

        verify(posSessionService).addCashMovement(
                anyLong(), eq("DROP_IN"), any(), anyString(), eq("LAY-PAY-77"), anyLong(), eq(false));
    }

    // -- Cash out ------------------------------------------------------------------------

    @Test
    void cancellationRefundBooksADropOut() {
        stubCategory(PosDrawerCashCategorySeeder.LAYAWAY_REFUND_CODE, 12L);
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(
                eq(9L), eq("DROP_OUT"), eq(new BigDecimal("600.00")), anyString(),
                eq("LAY-REF-3"), eq(12L), eq(false)))
                .thenReturn(new PosCashMovement());

        service.recordCancellationRefund(3L, "LAY-0003", new BigDecimal("600.00"), "Cash", 9L);

        verify(drawerSessionValidator).requireOpenDrawerSession(eq(9L), anyString());
    }

    // -- No second GL journal ------------------------------------------------------------

    @Test
    void layawayMovementsNeverPostTheirOwnJournal() {
        // createJournalFromLayawayDeposit already posts Dr Cash / Cr Customer Advance. A second
        // journal from the movement would double it, so postGlJournal must be false.
        stubCategory(PosDrawerCashCategorySeeder.LAYAWAY_DEPOSIT_CODE, 11L);
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), eq(false)))
                .thenReturn(new PosCashMovement());

        service.recordDeposit(3L, "LAY-0003", new BigDecimal("600.00"), "Cash", 9L);

        verify(posSessionService).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), eq(false));
    }

    // -- Non-cash moves no drawer cash ---------------------------------------------------

    @Test
    void cardDepositBooksNoDrawerMovement() {
        assertNull(service.recordDeposit(3L, "LAY-0003", new BigDecimal("600.00"), "Visa", 9L));
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), anyBoolean());
    }

    @Test
    void bankTransferDepositBooksNoDrawerMovement() {
        // The GL side treats every non-card mode as cash; this must not inherit that bug.
        assertNull(service.recordDeposit(3L, "LAY-0003", new BigDecimal("600.00"), "Bank Transfer", 9L));
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), anyBoolean());
    }

    @Test
    void aHoldWithNoDepositBooksNothing() {
        assertNull(service.recordDeposit(3L, "LAY-0003", BigDecimal.ZERO, "Cash", 9L));
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), anyBoolean());
    }

    // -- Session required, never inferred ------------------------------------------------

    @Test
    void cashInstalmentWithoutADeclaredSessionIsRefused() {
        stubNoExistingMovement();
        when(drawerSessionValidator.requireOpenDrawerSession(eq(null), anyString()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "no session"));

        assertThrows(ResponseStatusException.class,
                () -> service.recordInstalment(77L, 3L, "LAY-0003", new BigDecimal("200.00"), "Cash", null));

        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), anyBoolean());
    }

    // -- Idempotency ---------------------------------------------------------------------

    @Test
    void aRetriedDepositReturnsTheExistingMovement() {
        PosCashMovement existing = new PosCashMovement();
        when(cashMovementRepository.findByReferenceAndMovementTypeAndStatus(
                "LAY-DEP-3", PosCashMovementType.DROP_IN, PosCashMovementStatus.ACTIVE))
                .thenReturn(List.of(existing));

        assertSame(existing, service.recordDeposit(3L, "LAY-0003", new BigDecimal("600.00"), "Cash", 9L));
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), anyBoolean());
    }

    // -- Category ------------------------------------------------------------------------

    @Test
    void aMissingCategoryRefusesRatherThanBookingToPettyCash() {
        stubNoExistingMovement();
        when(categoryRepository.findAll()).thenReturn(List.of());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.recordDeposit(3L, "LAY-0003", new BigDecimal("600.00"), "Cash", 9L));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    // -- Fixtures ------------------------------------------------------------------------

    private void stubCategory(String code, Long id) {
        PosCashMovementCategory category = new PosCashMovementCategory();
        category.setCode(code);
        org.springframework.test.util.ReflectionTestUtils.setField(category, "id", id);
        when(categoryRepository.findAll()).thenReturn(List.of(category));
    }

    private void stubNoExistingMovement() {
        when(cashMovementRepository.findByReferenceAndMovementTypeAndStatus(
                anyString(), any(PosCashMovementType.class), any(PosCashMovementStatus.class)))
                .thenReturn(List.of());
    }
}
