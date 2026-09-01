package com.billbull.backend.sales.advance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.security.ModulePermissionService;

/**
 * The retired {@code terminalId} field on the advance endpoints.
 *
 * <p>It used to be resolved into a drawer session with {@code getActiveSession(terminalId)} --
 * "whichever session is open at that terminal right now". That is session inference, and its
 * {@code ifPresent} form silently produced an unattributed voucher when nothing was open while
 * the money moved anyway.
 *
 * <p>The field is now refused rather than translated (translating it would reintroduce the same
 * lookup) and rather than ignored (a stale client would appear to succeed while creating a
 * sessionless POS cash advance). These tests pin down that a legacy request fails loudly and
 * reaches no service.
 */
@ExtendWith(MockitoExtension.class)
class AdvanceApplicationControllerLegacyTerminalIdTest {

    @Mock private AdvanceApplicationService service;
    @Mock private ModulePermissionService modulePermissionService;

    @InjectMocks private AdvanceApplicationController controller;

    private Map<String, Object> receiveBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("customerCode", "CUST-1");
        body.put("amount", "200.00");
        body.put("paymentMode", "Cash");
        return body;
    }

    private Map<String, Object> refundBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("advanceReceiptId", "5");
        body.put("amount", "100.00");
        body.put("paymentMode", "Cash");
        return body;
    }

    // -- Rejection --------------------------------------------------------------------

    @Test
    void receiveWithLegacyTerminalIdIsRefusedAndNeverReachesTheService() {
        Map<String, Object> body = receiveBody();
        body.put("terminalId", "POS-01");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.receiveAdvance(body));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Reload"),
                "a stale terminal needs an actionable instruction, not just a rejection");
        // The critical assertion: no sessionless advance is created as a side effect.
        verify(service, never()).receiveAdvance(anyString(), any(), anyString(), any(), any(), any(), any());
    }

    @Test
    void refundWithLegacyTerminalIdIsRefusedAndNeverReachesTheService() {
        Map<String, Object> body = refundBody();
        body.put("terminalId", "POS-01");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.refund(body));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(service, never()).refund(any(), any(), anyString(), any(), any());
    }

    @Test
    void aBlankTerminalIdIsNotTreatedAsALegacyRequest() {
        // Some clients send the key with an empty value; that carries no stale intent.
        Map<String, Object> body = receiveBody();
        body.put("terminalId", "");
        when(service.receiveAdvance(eq("CUST-1"), any(), eq("Cash"), any(), eq(null), any(), any()))
                .thenReturn(new ReceiptVoucher());

        controller.receiveAdvance(body);

        verify(service).receiveAdvance(eq("CUST-1"), any(), eq("Cash"), any(), eq(null), any(), any());
    }

    // -- The modern shape still works ---------------------------------------------------

    @Test
    void receiveWithAnExplicitPosSessionIdIsAccepted() {
        Map<String, Object> body = receiveBody();
        body.put("posSessionId", "42");
        when(service.receiveAdvance(eq("CUST-1"), any(), eq("Cash"), any(), eq(42L), any(), any()))
                .thenReturn(new ReceiptVoucher());

        controller.receiveAdvance(body);

        verify(service).receiveAdvance(eq("CUST-1"), any(), eq("Cash"), any(), eq(42L), any(), any());
    }

    @Test
    void refundDeclaringBackOfficeIsAcceptedWithNoSession() {
        Map<String, Object> body = refundBody();
        body.put("cashSource", "BACK_OFFICE");

        controller.refund(body);

        verify(service).refund(eq(5L), eq(new BigDecimal("100.00")), eq("Cash"), eq(null),
                eq(AdvanceRefundCashSource.BACK_OFFICE));
    }

    @Test
    void refundWithAnUnknownCashSourceIsRefused() {
        Map<String, Object> body = refundBody();
        body.put("cashSource", "WAREHOUSE");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.refund(body));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verifyNoInteractions(service);
    }
}
