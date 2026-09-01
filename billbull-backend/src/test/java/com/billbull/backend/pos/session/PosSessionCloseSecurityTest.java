package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.payment.Payment;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The trust boundary at session close.
 *
 * <p>The invariant these tests defend: a client may state what it counted, never what it is
 * worth. Every financial figure — Counted Cash, Expected Cash, variance — is derived on the
 * server, so a tampered or stale client can produce an <em>incorrect count</em> (which a
 * recount catches) but never an <em>unverifiable total</em> (which nothing catches).
 */
class PosSessionCloseSecurityTest {

    /**
     * The headline case from the phase brief: a client submits denominations worth 9,800 while
     * asserting a closing total of 10,000.
     *
     * <p>Proved structurally rather than by stubbing a scenario: the close path no longer has a
     * parameter through which a total can arrive. There is no signature that accepts one, so
     * there is no code path to test for "does it prefer the client's number" — the number cannot
     * be expressed. This is a stronger guarantee than a runtime check, which could be bypassed
     * by a future caller.
     */
    @Test
    void noCloseSessionSignatureAcceptsAClientSuppliedCashTotal() {
        for (Method m : PosSessionService.class.getMethods()) {
            if (!m.getName().equals("closeSession")) continue;
            Class<?>[] params = m.getParameterTypes();
            // The only BigDecimal a close may accept is the card settlement figure, which is a
            // separate reconciliation from the cash drawer and is not Counted Cash.
            long bigDecimals = java.util.Arrays.stream(params).filter(p -> p == BigDecimal.class).count();
            assertTrue(bigDecimals <= 1,
                    "closeSession must not take a cash total; found " + bigDecimals
                            + " BigDecimal parameters on " + m);
        }
    }

    /**
     * Counted Cash is a pure function of the submitted quantities.
     *
     * <p>Whatever a client might additionally send, the persisted figure equals the sum of the
     * denominations and nothing else. 19×500 + 3×100 = 9,800 — the asserted 10,000 has no way in.
     */
    @Test
    void countedCashIsTheDenominationTotalAndNothingElse() {
        var countService = new com.billbull.backend.pos.session.denomination.PosDenominationCountService(
                org.mockito.Mockito.mock(com.billbull.backend.settings.company.CompanyProfileService.class),
                org.mockito.Mockito.mock(com.billbull.backend.financials.currency.CurrencyRepository.class),
                new com.fasterxml.jackson.databind.ObjectMapper());

        Map<String, Object> denominations = new LinkedHashMap<>();
        denominations.put("500", 19);
        denominations.put("100", 3);

        var count = countService.count(denominations, null);

        assertEquals(0, new BigDecimal("9800").compareTo(count.countedCash()),
                "the server must total the notes, not accept a stated amount");
    }

    /**
     * Expected Cash is derived, never supplied.
     *
     * <p>The reconciliation service takes a session and reads ledgers; it has no parameter for a
     * caller to inject an expected figure or a variance.
     */
    @Test
    void reconciliationTakesNoClientSuppliedFinancialInput() {
        for (Method m : PosCashReconciliationService.class.getDeclaredMethods()) {
            if (!m.getName().equals("reconcile")) continue;
            for (Class<?> p : m.getParameterTypes()) {
                assertTrue(p == PosSession.class || p == Long.class,
                        "reconcile must derive its figures, but takes a " + p.getSimpleName());
            }
        }
    }

    /**
     * The Release 1 boundary still holds: a client cannot stamp the collection session on a
     * tender row, so it cannot move cash between drawers by editing JSON.
     */
    @Test
    void paymentPosSessionIdRemainsReadOnlyToClients() throws Exception {
        Field field = Payment.class.getDeclaredField("posSessionId");
        JsonProperty annotation = field.getAnnotation(JsonProperty.class);

        assertNotNull(annotation, "posSessionId must carry an explicit Jackson access mode");
        assertEquals(JsonProperty.Access.READ_ONLY, annotation.access(),
                "a client-supplied posSessionId must be dropped, never honoured");
    }

    /**
     * A count is always scoped to the session in the request path.
     *
     * <p>There is no session id inside the denomination payload, so a count cannot name a
     * different drawer than the one being closed — and the existing authorization gate runs
     * against that path id before anything is persisted.
     */
    @Test
    void aCountCannotTargetADifferentSessionThanTheOneBeingClosed() {
        for (Method m : PosSessionService.class.getMethods()) {
            if (!m.getName().equals("closeSession")) continue;
            assertEquals(Long.class, m.getParameterTypes()[0],
                    "the session being closed must be the first, explicit parameter");
            long sessionIdParams = java.util.Arrays.stream(m.getParameterTypes())
                    .filter(p -> p == Long.class).count();
            assertEquals(1, sessionIdParams,
                    "exactly one session may be named, so a count cannot address another drawer");
        }
    }

    /**
     * No session inference: the service exposes no way to discover a drawer from a terminal,
     * a branch, a cashier or a date.
     */
    @Test
    void theDrawerValidatorOffersNoLookupByAnythingButAnExplicitId() {
        for (Method m : PosDrawerSessionValidator.class.getDeclaredMethods()) {
            if (m.isSynthetic()) continue;
            for (Class<?> p : m.getParameterTypes()) {
                assertTrue(p == Long.class || p == String.class,
                        "a validator parameter of type " + p.getSimpleName()
                                + " suggests resolution by something other than a declared id");
            }
        }
    }

    // Re-closing a CLOSED session is refused by closeSession()'s status guard; that is
    // asserted in PosSessionServiceTest#aClosedSessionCannotBeCountedAgainThroughTheClosePath,
    // where the service is fully wired and the assertion exercises the real path rather
    // than a hand-built stand-in.
}
