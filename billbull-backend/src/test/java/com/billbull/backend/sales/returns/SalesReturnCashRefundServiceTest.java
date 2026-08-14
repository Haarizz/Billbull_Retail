package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.config.SalesReturnCashCategorySeeder;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementStatus;
import com.billbull.backend.pos.session.PosCashMovementType;
import com.billbull.backend.pos.session.PosSessionService;

/**
 * The drawer cash-out a Sales Return books when it is settled in cash.
 *
 * <p>Before this path existed a cash refund completed with no {@link PosCashMovement} at all:
 * the money left the till but expected-cash, the X-Report and day-close behaved as though it
 * had not, so the cashier came up short at close with nothing to explain it.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnCashRefundServiceTest {

    private static final Long SESSION_ID = 76L;
    private static final Long CATEGORY_ID = 42L;

    @Mock private PosSessionService posSessionService;
    @Mock private PosCashMovementCategoryRepository categoryRepository;
    @Mock private PosCashMovementRepository cashMovementRepository;

    @InjectMocks private SalesReturnCashRefundService service;

    @Test
    void cashRefundBooksADropOutAgainstTheSessionReferencingTheReturn() {
        stubCategory();
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong()))
                .thenReturn(new PosCashMovement());

        SalesReturn ret = cashReturn("SR-1", new BigDecimal("125.50"));
        service.recordCashRefund(ret);

        ArgumentCaptor<String> type = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<String> reference = ArgumentCaptor.forClass(String.class);
        verify(posSessionService).addCashMovement(eq(SESSION_ID), type.capture(), amount.capture(),
                anyString(), reference.capture(), eq(CATEGORY_ID));

        // DROP_OUT is what reduces expected cash in computeExpectedCash().
        assertEquals(PosCashMovementType.DROP_OUT.name(), type.getValue());
        assertEquals(0, new BigDecimal("125.50").compareTo(amount.getValue()));
        // The return number is the traceable link back, and the key the duplicate guard reads.
        assertEquals("SR-1", reference.getValue());
    }

    @Test
    void nonCashRefundMethodsNeverTouchTheDrawer() {
        for (SalesReturnRefundMethod method : List.of(SalesReturnRefundMethod.CARD_REFUND,
                SalesReturnRefundMethod.BANK_TRANSFER, SalesReturnRefundMethod.CREDIT_VOUCHER,
                SalesReturnRefundMethod.CUSTOMER_CREDIT)) {
            SalesReturn ret = cashReturn("SR-" + method, new BigDecimal("100.00"));
            ret.setRefundMethod(method);

            assertNull(service.recordCashRefund(ret), method + " must not create a cash movement");
        }
        verify(posSessionService, never()).addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void aReturnWithNoRefundMethodIsIgnored() {
        SalesReturn ret = cashReturn("SR-1", new BigDecimal("100.00"));
        ret.setRefundMethod(null);

        assertNull(service.recordCashRefund(ret));
        verify(posSessionService, never()).addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void anExistingMovementForTheSameReturnIsReusedRatherThanPayingOutTwice() {
        PosCashMovement already = new PosCashMovement();
        when(cashMovementRepository.findByReferenceAndMovementTypeAndStatus(
                "SR-1", PosCashMovementType.DROP_OUT, PosCashMovementStatus.ACTIVE))
                .thenReturn(List.of(already));

        PosCashMovement result = service.recordCashRefund(cashReturn("SR-1", new BigDecimal("100.00")));

        assertSame(already, result, "a retry must return the existing movement");
        verify(posSessionService, never()).addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void cashRefundWithoutAPosSessionIsRefused() {
        stubNoExistingMovement();
        SalesReturn ret = cashReturn("SR-1", new BigDecimal("100.00"));
        ret.setPosSessionId(null);

        // Cash cannot leave a drawer that no session is accountable for. The UI blocks this,
        // but the service must not depend on the UI having done so.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.recordCashRefund(ret));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(posSessionService, never()).addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void aMissingRefundCategoryFailsRatherThanPostingToTheWrongAccount() {
        stubNoExistingMovement();
        when(categoryRepository.findAll()).thenReturn(List.of());

        // Falling back to a plain DROP_OUT would post Dr General Expense / Cr Cash, leaving
        // Accounts Receivable overstated and expenses inflated. Refusing is the correct outcome.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.recordCashRefund(cashReturn("SR-1", new BigDecimal("100.00"))));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        verify(posSessionService, never()).addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void aZeroValueRefundBooksNothing() {
        stubNoExistingMovement();
        assertNull(service.recordCashRefund(cashReturn("SR-1", BigDecimal.ZERO)));
        verify(posSessionService, never()).addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void refundAmountFallsBackToTheReturnTotalWhenNotSetExplicitly() {
        stubCategory();
        stubNoExistingMovement();
        when(posSessionService.addCashMovement(anyLong(), anyString(), any(), anyString(), anyString(), anyLong()))
                .thenReturn(new PosCashMovement());

        SalesReturn ret = cashReturn("SR-1", null);
        ret.setTotalAmount(new BigDecimal("77.00"));
        service.recordCashRefund(ret);

        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        verify(posSessionService).addCashMovement(anyLong(), anyString(), amount.capture(),
                anyString(), anyString(), anyLong());
        assertEquals(0, new BigDecimal("77.00").compareTo(amount.getValue()));
    }

    // ---------------------------------------------------------------

    private void stubCategory() {
        PosCashMovementCategory category = new PosCashMovementCategory();
        category.setId(CATEGORY_ID);
        category.setCode(SalesReturnCashCategorySeeder.CATEGORY_CODE);
        lenient().when(categoryRepository.findAll()).thenReturn(List.of(category));
    }

    private void stubNoExistingMovement() {
        lenient().when(cashMovementRepository.findByReferenceAndMovementTypeAndStatus(
                        anyString(), any(), any()))
                .thenReturn(List.of());
    }

    private static SalesReturn cashReturn(String returnNumber, BigDecimal refundAmount) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber(returnNumber);
        r.setLinkedInvoice("INV-1");
        r.setCustomerName("Walk-in Customer");
        r.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);
        r.setRefundAmount(refundAmount);
        r.setPosSessionId(SESSION_ID);
        return r;
    }
}
