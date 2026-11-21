package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;

/** Phase 0 / M1 rules: {@link PosCheckoutSessionGuard} and {@link PosCheckoutReplayMatcher}. */
class PosCheckoutSessionGuardTest {

    private static PosSession session(PosSessionStatus status, Long branchId) {
        PosSession s = new PosSession();
        s.setId(7L);
        s.setStatus(status);
        s.setBranchId(branchId);
        return s;
    }

    private static PosPaymentAllocation allocation(String type, double amount) {
        PosPaymentAllocation a = new PosPaymentAllocation();
        a.setType(type);
        a.setAmount(amount);
        return a;
    }

    @Nested
    @DisplayName("Session status")
    class Status {
        @Test void openPasses() {
            assertTrue(PosCheckoutSessionGuard.checkOpen(session(PosSessionStatus.OPEN, 1L)).isEmpty());
        }

        @Test void closedIsRefused() {
            var r = PosCheckoutSessionGuard.checkOpen(session(PosSessionStatus.CLOSED, 1L));
            assertEquals(PosCheckoutSessionGuard.Code.SESSION_NOT_OPEN, r.orElseThrow().code());
            assertEquals("CLOSED", r.get().body().get("sessionStatus"));
            assertEquals(Boolean.FALSE, r.get().body().get("recorded"));
        }

        @Test void suspendedIsRefused() {
            var r = PosCheckoutSessionGuard.checkOpen(session(PosSessionStatus.SUSPENDED, 1L));
            assertEquals(PosCheckoutSessionGuard.Code.SESSION_NOT_OPEN, r.orElseThrow().code());
            assertTrue(r.get().message().contains("Resume"));
        }

        @Test void refusalMessagesNeverLookLikeTheCloseWorkflowError() {
            // sessionWorkflowErrors.isClosureWorkflowError matches this marker; a session-guard
            // refusal must not be routed into the closure screen by mistake.
            for (PosSessionStatus s : List.of(PosSessionStatus.CLOSED, PosSessionStatus.SUSPENDED)) {
                assertFalse(PosCheckoutSessionGuard.checkOpen(session(s, 1L)).orElseThrow()
                        .message().contains("SESSION_CLOSING_WORKFLOW"));
            }
        }

        @Test void missingSessionHasItsOwnCode() {
            assertEquals(PosCheckoutSessionGuard.Code.SESSION_NOT_FOUND, PosCheckoutSessionGuard.missing(9L).code());
        }
    }

    @Nested
    @DisplayName("Branch ownership")
    class Branch {
        @Test void sameBranchPasses() {
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setBranchId(1L);
            assertTrue(PosCheckoutSessionGuard.checkBranch(req, session(PosSessionStatus.OPEN, 1L), 1L).isEmpty());
        }

        @Test void requestWithoutBranchStillChecksTheResolvedBranch() {
            assertTrue(PosCheckoutSessionGuard.checkBranch(new PosCheckoutRequest(),
                    session(PosSessionStatus.OPEN, 1L), 1L).isEmpty());
            assertEquals(PosCheckoutSessionGuard.Code.SESSION_BRANCH_MISMATCH, PosCheckoutSessionGuard
                    .checkBranch(new PosCheckoutRequest(), session(PosSessionStatus.OPEN, 2L), 1L).orElseThrow().code());
        }

        @Test void requestBranchDifferentFromTheSessionIsRefused() {
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setBranchId(2L);
            assertTrue(PosCheckoutSessionGuard.checkBranch(req, session(PosSessionStatus.OPEN, 1L), 1L).isPresent());
        }

        @Test void unknownBranchOnEitherSideIsRefusedNotAssumed() {
            assertTrue(PosCheckoutSessionGuard.checkBranch(new PosCheckoutRequest(),
                    session(PosSessionStatus.OPEN, null), 1L).isPresent());
            assertTrue(PosCheckoutSessionGuard.checkBranch(new PosCheckoutRequest(),
                    session(PosSessionStatus.OPEN, 1L), null).isPresent());
        }
    }

    @Nested
    @DisplayName("Sessionless checkouts")
    class Sessionless {
        @Test void explicitCashAllocationNeedsASession() {
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setPaymentAllocations(List.of(allocation("CASH", 100)));
            assertEquals(PosCheckoutSessionGuard.Code.SESSION_REQUIRED,
                    PosCheckoutSessionGuard.checkSessionless(req).orElseThrow().code());
        }

        @Test void cardOnlineAndVoucherAllocationsNeedASession() {
            for (String type : List.of("CARD", "ONLINE", "VOUCHER")) {
                PosCheckoutRequest req = new PosCheckoutRequest();
                req.setPaymentAllocations(List.of(allocation(type, 10)));
                assertTrue(PosCheckoutSessionGuard.collectsTender(req), type);
            }
        }

        @Test void creditOnlyAndZeroAllocationsCollectNothing() {
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setPaymentAllocations(List.of(allocation("CREDIT", 100), allocation("CASH", 0)));
            assertFalse(PosCheckoutSessionGuard.collectsTender(req));
        }

        @Test void legacyScalarsCollectTender() {
            PosCheckoutRequest cash = new PosCheckoutRequest();
            cash.setCashAmount(5.0);
            PosCheckoutRequest tendered = new PosCheckoutRequest();
            tendered.setPaymentMode("Cash");
            tendered.setAmountTendered(5.0);
            PosCheckoutRequest legs = new PosCheckoutRequest();
            PosCheckoutRequest.PosCardLeg leg = new PosCheckoutRequest.PosCardLeg();
            leg.setCardType("Visa");
            leg.setAmount(5.0);
            legs.setCardLegs(List.of(leg));
            assertTrue(PosCheckoutSessionGuard.collectsTender(cash));
            assertTrue(PosCheckoutSessionGuard.collectsTender(tendered));
            assertTrue(PosCheckoutSessionGuard.collectsTender(legs));
        }

        @Test void explicitAllocationsWinOverLegacyScalarsAsTheResolverDoes() {
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setAmountTendered(100.0);
            req.setPaymentAllocations(List.of(allocation("CREDIT", 100)));
            assertFalse(PosCheckoutSessionGuard.collectsTender(req));
        }

        @Test void theTillsDeliveryOrderPayloadStillPassesWithoutASession() {
            // POSSales.jsx delivery-order builder: paymentMode 'Delivery', no allocations, no
            // tender scalars, sessionId: currentSession?.id || null.
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setPaymentMode("Delivery");
            req.setShippingAddress("Warehouse road 4");
            req.setDeliveryDate("2026-11-13");
            assertTrue(PosCheckoutSessionGuard.checkSessionless(req).isEmpty());
        }
    }

    @Nested
    @DisplayName("Same-key replay matching")
    class Replay {
        private PosCheckoutRequest request(Long sessionId, String terminal, String customer, Object[]... lines) {
            PosCheckoutRequest req = new PosCheckoutRequest();
            req.setSessionId(sessionId);
            req.setTerminalId(terminal);
            req.setCustomerCode(customer);
            List<PosCheckoutRequest.PosCheckoutItem> items = new ArrayList<>();
            for (Object[] l : lines) {
                PosCheckoutRequest.PosCheckoutItem i = new PosCheckoutRequest.PosCheckoutItem();
                i.setItemCode((String) l[0]);
                i.setQuantity((Integer) l[1]);
                i.setPrice((Double) l[2]);
                items.add(i);
            }
            req.setItems(items);
            return req;
        }

        private SalesInvoice stored(Long sessionId, String terminal, String customer, Object[]... lines) {
            SalesInvoice inv = new SalesInvoice();
            inv.setPosSessionId(sessionId);
            inv.setPosTerminalId(terminal);
            inv.setCustomerCode(customer);
            List<SalesInvoiceItem> items = new ArrayList<>();
            for (Object[] l : lines) {
                SalesInvoiceItem i = new SalesInvoiceItem();
                i.setItemCode((String) l[0]);
                i.setQuantity((Integer) l[1]);
                i.setPrice(BigDecimal.valueOf((Double) l[2]));
                items.add(i);
            }
            inv.setItems(items);
            return inv;
        }

        @Test void identicalSaleMatchesInAnyLineOrder() {
            var req = request(5L, "T1", null, new Object[]{"A", 1, 10.0}, new Object[]{"B", 2, 3.5});
            var inv = stored(5L, "T1", "WALK-IN", new Object[]{"B", 2, 3.5}, new Object[]{"A", 1, 10.0});
            assertTrue(PosCheckoutReplayMatcher.firstMismatch(req, inv).isEmpty());
        }

        @Test void aLineSentWithoutAPriceMatchesTheServerFilledPrice() {
            var req = request(5L, "T1", null, new Object[]{"A", 1, null});
            var inv = stored(5L, "T1", "WALK-IN", new Object[]{"A", 1, 42.0});
            assertTrue(PosCheckoutReplayMatcher.firstMismatch(req, inv).isEmpty());
        }

        @Test void differentQuantityPriceOrExtraLineIsADifferentSale() {
            var inv = stored(5L, "T1", "WALK-IN", new Object[]{"A", 1, 10.0});
            assertEquals("items", PosCheckoutReplayMatcher.firstMismatch(
                    request(5L, "T1", null, new Object[]{"A", 2, 10.0}), inv).orElseThrow());
            assertEquals("items", PosCheckoutReplayMatcher.firstMismatch(
                    request(5L, "T1", null, new Object[]{"A", 1, 11.0}), inv).orElseThrow());
            assertEquals("items", PosCheckoutReplayMatcher.firstMismatch(
                    request(5L, "T1", null, new Object[]{"A", 1, 10.0}, new Object[]{"B", 1, 1.0}), inv).orElseThrow());
        }

        @Test void differentSessionTerminalOrCustomerIsADifferentSale() {
            var inv = stored(5L, "T1", "C-1", new Object[]{"A", 1, 10.0});
            assertEquals("sessionId", PosCheckoutReplayMatcher.firstMismatch(
                    request(6L, "T1", "C-1", new Object[]{"A", 1, 10.0}), inv).orElseThrow());
            assertEquals("terminalId", PosCheckoutReplayMatcher.firstMismatch(
                    request(5L, "T2", "C-1", new Object[]{"A", 1, 10.0}), inv).orElseThrow());
            assertEquals("customerCode", PosCheckoutReplayMatcher.firstMismatch(
                    request(5L, "T1", null, new Object[]{"A", 1, 10.0}), inv).orElseThrow());
        }
    }
}
