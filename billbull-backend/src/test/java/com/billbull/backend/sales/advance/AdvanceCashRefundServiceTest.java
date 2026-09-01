package com.billbull.backend.sales.advance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
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
 * The drawer cash-out an advance refund books when it is paid in notes.
 *
 * <p>Before this path existed the refund posted a GL journal and nothing else: the money left
 * the till while Expected Cash stood still, producing a permanent false shortage.
 */
@ExtendWith(MockitoExtension.class)
class AdvanceCashRefundServiceTest {

    @Mock private PosSessionService posSessionService;
    @Mock private PosDrawerSessionValidator drawerSessionValidator;
    @Mock private PosCashMovementCategoryRepository categoryRepository;
    @Mock private PosCashMovementRepository cashMovementRepository;

    @InjectMocks private AdvanceCashRefundService service;

    // ── Cash refunds book a DROP_OUT ──────────────────────────────────────────────────────

    @Test
    void cashRefundBooksADropOutAgainstTheDeclaredDrawer() {
        stubCategory();
        stubNoExistingMovement();
        PosCashMovement created = new PosCashMovement();
        when(posSessionService.addCashMovement(
                eq(9L), eq("DROP_OUT"), eq(new BigDecimal("100.00")), anyString(),
                eq("ADV-REFUND-55"), eq(4L), eq(false)))
                .thenReturn(created);

        PosCashMovement result = service.recordCashRefund(
                55L, new BigDecimal("100.00"), "Cash", 9L, AdvanceRefundCashSource.POS_DRAWER, "RV-0001");

        assertSame(created, result);
        verify(drawerSessionValidator).requireOpenDrawerSession(eq(9L), anyString());
    }

    @Test
    void theMovementDoesNotPostItsOwnJournal() {
        // createJournalFromAdvanceRefund already posts Dr Customer Advance / Cr Cash. A second
        // journal from the movement would double the entry, so postGlJournal must be false.
        stubCategory();
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), eq(false)))
                .thenReturn(new PosCashMovement());

        service.recordCashRefund(55L, new BigDecimal("100.00"), "Cash", 9L, AdvanceRefundCashSource.POS_DRAWER, "RV-0001");

        verify(posSessionService).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), eq(false));
    }

    // ── Non-cash refunds move no drawer cash ──────────────────────────────────────────────

    @Test
    void bankRefundBooksNoDrawerMovement() {
        assertNull(service.recordCashRefund(55L, new BigDecimal("100.00"), "Bank", 9L, AdvanceRefundCashSource.POS_DRAWER, "RV-0001"));
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
        // A non-cash refund needs no drawer at all, so it must not be gated on one.
        verify(drawerSessionValidator, never()).requireOpenDrawerSession(any(), anyString());
    }

    @Test
    void nonPositiveAmountBooksNothing() {
        assertNull(service.recordCashRefund(55L, BigDecimal.ZERO, "Cash", 9L, AdvanceRefundCashSource.POS_DRAWER, "RV-0001"));
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    // ── Session is required, never inferred ───────────────────────────────────────────────

    @Test
    void cashRefundWithoutADeclaredSessionIsRefused() {
        stubNoExistingMovement();
        when(drawerSessionValidator.requireOpenDrawerSession(eq(null), anyString()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "no session"));

        assertThrows(ResponseStatusException.class,
                () -> service.recordCashRefund(55L, new BigDecimal("100.00"), "Cash", null, AdvanceRefundCashSource.POS_DRAWER, "RV-0001"));

        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    // ── Idempotency ───────────────────────────────────────────────────────────────────────

    @Test
    void aRetryReturnsTheExistingMovementRatherThanPayingTwice() {
        PosCashMovement existing = new PosCashMovement();
        when(cashMovementRepository.findByReferenceAndMovementTypeAndStatus(
                "ADV-REFUND-55", PosCashMovementType.DROP_OUT, PosCashMovementStatus.ACTIVE))
                .thenReturn(List.of(existing));

        PosCashMovement result = service.recordCashRefund(
                55L, new BigDecimal("100.00"), "Cash", 9L, AdvanceRefundCashSource.POS_DRAWER, "RV-0001");

        assertSame(existing, result);
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    // ── Category ──────────────────────────────────────────────────────────────────────────

    @Test
    void aMissingCategoryRefusesRatherThanBookingToGeneralExpense() {
        stubNoExistingMovement();
        when(categoryRepository.findAll()).thenReturn(List.of());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.recordCashRefund(55L, new BigDecimal("100.00"), "Cash", 9L, AdvanceRefundCashSource.POS_DRAWER, "RV-0001"));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────────────────

    private void stubCategory() {
        PosCashMovementCategory category = new PosCashMovementCategory();
        category.setCode(PosDrawerCashCategorySeeder.ADVANCE_REFUND_CODE);
        org.springframework.test.util.ReflectionTestUtils.setField(category, "id", 4L);
        when(categoryRepository.findAll()).thenReturn(List.of(category));
    }

    private void stubNoExistingMovement() {
        when(cashMovementRepository.findByReferenceAndMovementTypeAndStatus(
                anyString(), any(PosCashMovementType.class), any(PosCashMovementStatus.class)))
                .thenReturn(List.of());
    }

    // -- Back-office cash is a separate source, not a missing session ---------------------

    @Test
    void backOfficeCashRefundBooksNoDrawerMovement() {
        // Office-safe cash. Legitimate, and deliberately outside POS reconciliation: no drawer
        // movement, no session required, and the advance-refund journal still posts unchanged.
        assertNull(service.recordCashRefund(
                55L, new BigDecimal("100.00"), "Cash", null,
                AdvanceRefundCashSource.BACK_OFFICE, "RV-0001"));

        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(),
                org.mockito.ArgumentMatchers.anyBoolean());
        // Critically: no session is required, requested, or discovered.
        verify(drawerSessionValidator, never()).requireOpenDrawerSession(any(), anyString());
    }

    @Test
    void backOfficeRefundCarryingAPosSessionIsRefused() {
        // Contradictory: office cash does not come out of a till. Accepting it would book
        // safe cash against a drawer that never held it.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.recordCashRefund(55L, new BigDecimal("100.00"), "Cash", 9L,
                        AdvanceRefundCashSource.BACK_OFFICE, "RV-0001"));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(),
                org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void anUndeclaredCashRefundIsRefusedRatherThanAssumedBackOffice() {
        // The whole point of declaring the source. If "no session" silently meant back-office,
        // a POS client that forgot its session would pay cash out of a till with no drawer
        // movement -- the original defect, relocated.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.recordCashRefund(55L, new BigDecimal("100.00"), "Cash", null,
                        null, "RV-0001"));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(posSessionService, never()).addCashMovement(
                anyLong(), anyString(), any(), anyString(), anyString(), anyLong(),
                org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void anUndeclaredSourceWithASessionIsTreatedAsAPosDrawerRefund() {
        // Supplying the drawer session IS a statement that a till paid the cash, so this stays
        // accepted -- it cannot be the silent-hole case, which is the absence of both.
        stubCategory();
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(
                eq(9L), eq("DROP_OUT"), any(), anyString(), anyString(), anyLong(), eq(false)))
                .thenReturn(new PosCashMovement());

        service.recordCashRefund(55L, new BigDecimal("100.00"), "Cash", 9L, null, "RV-0001");

        verify(drawerSessionValidator).requireOpenDrawerSession(eq(9L), anyString());
    }
}
