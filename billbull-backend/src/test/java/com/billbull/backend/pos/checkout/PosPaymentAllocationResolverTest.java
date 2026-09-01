package com.billbull.backend.pos.checkout;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link PosPaymentAllocationResolver} — the normalisation layer that turns both
 * the new progressive-payment {@code paymentAllocations} list and the legacy scalar request
 * fields into a single {@link PosPaymentPlan}.
 *
 * <p>The legacy cases pin backward compatibility: they assert the resolver reproduces exactly the
 * legs, mode labels and capping the pre-allocation checkout code produced.
 */
class PosPaymentAllocationResolverTest {

    private final PosPaymentAllocationResolver resolver = new PosPaymentAllocationResolver();

    // ── Progressive payment ────────────────────────────────────────────────────

    @Test
    void progressiveAllocationsSettleInvoiceInOrderAndProduceCombinedLabel() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentAllocations(List.of(
                allocation("CASH", null, 80.0, null, null),
                allocation("CARD", "Visa", 10.0, "AUTH-1", null),
                allocation("ONLINE", null, 50.0, "WIRE-1", "1010 - FAB Current"),
                allocation("CREDIT", null, 16.45, null, null)));

        PosPaymentPlan plan = resolver.resolve(req, 156.45);

        assertEquals(4, plan.getAllocations().size());
        // Credit is not a receipt, so only the first three settle the invoice.
        assertEquals(140.0, plan.getSettledAmount(), 0.001);
        assertEquals(16.45, plan.getCreditAmount(), 0.001);
        assertEquals("Cash + Visa + Online + Credit", plan.getCombinedPaymentMode());
        assertEquals(3, plan.getLegCount());

        ResolvedPaymentAllocation online = plan.getAllocations().get(2);
        assertEquals("Online", online.getModeLabel());
        assertEquals("1010 - FAB Current", online.getBankAccountName());
        assertTrue(online.isReceipt());
        assertFalse(plan.getAllocations().get(3).isReceipt()); // credit records nothing
    }

    @Test
    void multipleAllocationsOfTheSameTypeAreKeptSeparate() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentAllocations(List.of(
                allocation("CASH", null, 20.0, null, null),
                allocation("CASH", null, 30.0, null, null),
                allocation("CARD", "Visa", 40.0, null, null),
                allocation("CARD", "Mastercard", 10.0, null, null)));

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertEquals(4, plan.getAllocations().size());
        assertEquals(50.0, plan.getCashAmount(), 0.001);
        assertEquals(50.0, plan.getCardAmount(), 0.001);
        assertEquals(100.0, plan.getSettledAmount(), 0.001);
        assertEquals("Cash + Visa + Mastercard", plan.getCombinedPaymentMode());
    }

    @Test
    void cashMayOverpayAndIsCappedToTheRemainingBalance() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentAllocations(List.of(
                allocation("CARD", "Visa", 40.0, null, null),
                allocation("CASH", null, 100.0, null, null)));

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertEquals(100.0, plan.getSettledAmount(), 0.001);
        // Card takes 40, so only 60 of the 100 cash tendered is applied — the rest is change.
        assertEquals(60.0, plan.getAllocations().get(1).getAmount(), 0.001);
    }

    @Test
    void nonCashAllocationsMayNotExceedTheInvoiceTotal() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentAllocations(List.of(allocation("CARD", "Visa", 150.0, null, null)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> resolver.resolve(req, 100.0));
        assertTrue(ex.getReason().contains("cannot exceed the invoice total"));
    }

    @Test
    void unknownAllocationTypeAndZeroAmountAreRejectedStructurally() {
        PosCheckoutRequest unknown = new PosCheckoutRequest();
        unknown.setPaymentAllocations(List.of(allocation("BITCOIN", null, 10.0, null, null)));
        assertThrows(ResponseStatusException.class, () -> resolver.validateStructure(unknown));

        PosCheckoutRequest zero = new PosCheckoutRequest();
        zero.setPaymentAllocations(List.of(allocation("CASH", null, 0.0, null, null)));
        assertThrows(ResponseStatusException.class, () -> resolver.validateStructure(zero));
    }

    @Test
    void duplicateCardReferencesAcrossAllocationsAreRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentAllocations(List.of(
                allocation("CARD", "Visa", 10.0, "AUTH-1", null),
                allocation("CARD", "Mastercard", 10.0, "auth-1", null)));

        assertThrows(ResponseStatusException.class, () -> resolver.validateStructure(req));
    }

    @Test
    void theWordMixedIsNeverProducedNorAcceptedAsALabel() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCombinedPaymentMode("Mixed");
        req.setPaymentMode("mixed");
        req.setPaymentAllocations(List.of(
                allocation("CASH", null, 60.0, null, null),
                allocation("CARD", "Visa", 40.0, null, null)));

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertEquals("Cash + Visa", plan.getCombinedPaymentMode());
        assertEquals("Cash", resolver.resolvePaymentMode(req));
    }

    // ── Legacy backward compatibility ──────────────────────────────────────────

    @Test
    void legacyAmountTenderedOnlyProducesOneCappedLeg() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(200.0);

        PosPaymentPlan plan = resolver.resolve(req, 156.45);

        assertEquals(1, plan.getAllocations().size());
        assertEquals(156.45, plan.getSettledAmount(), 0.001);
        assertEquals("Cash", plan.getAllocations().get(0).getModeLabel());
        assertTrue(plan.getAllocations().get(0).isReceipt());
    }

    @Test
    void legacyCashPlusCardScalarsCapCashToTheBalanceJustLikeBefore() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCashAmount(80.0);
        req.setCardAmount(40.0);
        req.setCardType("Visa");
        req.setCardReference("AUTH-9");

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertEquals(100.0, plan.getSettledAmount(), 0.001);
        assertEquals(60.0, plan.getAllocations().get(0).getAmount(), 0.001);
        assertEquals("Visa", plan.getAllocations().get(1).getModeLabel());
        assertEquals("AUTH-9", plan.getAllocations().get(1).getReference());
        assertEquals("Cash + Visa", plan.getCombinedPaymentMode());
    }

    @Test
    void legacyCardLegsDriveTheCardPortionAndAreFlaggedOnThePlan() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCardLegs(List.of(cardLeg("Visa", 60.0, "A1"), cardLeg("Mastercard", 40.0, "A2")));

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertTrue(plan.isUsesCardLegs());
        assertEquals(2, plan.getAllocations().size());
        assertEquals(100.0, plan.getTenderTotal(), 0.001);
        assertEquals("Visa + Mastercard", plan.getCombinedPaymentMode());
    }

    @Test
    void legacyCreditCheckoutKeepsTheCreditStampOnPartialReceipts() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("credit");
        req.setCashAmount(30.0);

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertTrue(resolver.isCreditCheckout(req));
        assertEquals("Credit", plan.getCombinedPaymentMode());
        assertEquals(30.0, plan.getSettledAmount(), 0.001);
    }

    /**
     * Customer Advance was retired as a checkout tender. A stale terminal that still posts the
     * scalar must fail loudly: honouring it would settle the sale out of the customer ledger
     * behind the Customer module's back, and ignoring it would post the invoice 40 short.
     */
    @Test
    void legacyAdvanceScalarIsRejectedRatherThanSilentlyDropped() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCashAmount(60.0);
        req.setAdvanceAmount(40.0);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> resolver.validateStructure(req));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Customer Advance Management"));
    }

    /** Same for a terminal sending the retired allocation type. */
    @Test
    void advanceAllocationTypeIsRejectedWithAnActionableMessage() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentAllocations(List.of(allocation("ADVANCE", null, 40.0, null, null)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> resolver.validateStructure(req));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Customer Advance Management"));
    }

    @Test
    void legacyCardLegValidationRulesAreUnchanged() {
        PosCheckoutRequest noType = new PosCheckoutRequest();
        noType.setCardLegs(List.of(cardLeg(null, 10.0, null)));
        assertThrows(ResponseStatusException.class, () -> resolver.validateStructure(noType));

        PosCheckoutRequest tooMany = new PosCheckoutRequest();
        tooMany.setCardLegs(List.of(cardLeg("Visa", 1.0, null), cardLeg("Visa", 1.0, null),
                cardLeg("Visa", 1.0, null), cardLeg("Visa", 1.0, null),
                cardLeg("Visa", 1.0, null), cardLeg("Visa", 1.0, null)));
        assertThrows(ResponseStatusException.class, () -> resolver.validateStructure(tooMany));

        PosCheckoutRequest dupRef = new PosCheckoutRequest();
        dupRef.setCardLegs(List.of(cardLeg("Visa", 1.0, "R1"), cardLeg("Amex", 1.0, "r1")));
        assertThrows(ResponseStatusException.class, () -> resolver.validateStructure(dupRef));
    }

    @Test
    void explicitAllocationsTakePrecedenceOverLegacyScalars() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCashAmount(999.0);
        req.setCardAmount(999.0);
        req.setPaymentAllocations(List.of(allocation("CASH", null, 100.0, null, null)));

        PosPaymentPlan plan = resolver.resolve(req, 100.0);

        assertEquals(1, plan.getAllocations().size());
        assertEquals(0.0, plan.getCardAmount(), 0.001);
        assertEquals("Cash", plan.getCombinedPaymentMode());
    }

    // ── Fixtures ───────────────────────────────────────────────────────────────

    private PosPaymentAllocation allocation(String type, String subtype, Double amount,
                                            String reference, String bankAccountName) {
        PosPaymentAllocation a = new PosPaymentAllocation();
        a.setType(type);
        a.setSubtype(subtype);
        a.setAmount(amount);
        a.setReference(reference);
        a.setBankAccountName(bankAccountName);
        return a;
    }

    private PosCheckoutRequest.PosCardLeg cardLeg(String cardType, Double amount, String reference) {
        PosCheckoutRequest.PosCardLeg leg = new PosCheckoutRequest.PosCardLeg();
        leg.setCardType(cardType);
        leg.setAmount(amount);
        leg.setReferenceNumber(reference);
        return leg;
    }

    // ── Shared settlement engine (delivery, layaway, any collection screen) ────

    @Test
    void settlementFlowsShareTheSameEngineAsCheckout() {
        // A delivery balance settled Cash 60 + Visa 40 resolves exactly as the same tenders
        // would at the till — same legs, same label, same settled amount.
        PosPaymentPlan plan = resolver.resolveAllocations(List.of(
                allocation("CASH", null, 60.0, null, null),
                allocation("CARD", "Visa", 40.0, "AUTH-7", null)), 100.0, null, "Cash");

        assertEquals(2, plan.getAllocations().size());
        assertEquals(100.0, plan.getSettledAmount(), 0.001);
        assertEquals("Cash + Visa", plan.getCombinedPaymentMode());
        assertEquals(2, plan.getLegCount());
    }

    @Test
    void settlementLetsCashOverpayButNotCard() {
        PosPaymentPlan cashOver = resolver.resolveAllocations(
                List.of(allocation("CASH", null, 200.0, null, null)), 156.45, null, "Cash");
        assertEquals(156.45, cashOver.getSettledAmount(), 0.001);
        assertEquals(156.45, cashOver.getAllocations().get(0).getAmount(), 0.001);

        assertThrows(ResponseStatusException.class, () -> resolver.resolveAllocations(
                List.of(allocation("CARD", "Visa", 200.0, null, null)), 156.45, null, "Cash"));
    }

    @Test
    void settlementAcceptsAPartialDepositWithoutCoveringTheTotal() {
        // A layaway deposit need not settle the sale — the remainder becomes the balance.
        PosPaymentPlan plan = resolver.resolveAllocations(
                List.of(allocation("CASH", null, 50.0, null, null)), 200.0, null, "Cash");

        assertEquals(50.0, plan.getSettledAmount(), 0.001);
        assertEquals("Cash", plan.getCombinedPaymentMode());
    }

    @Test
    void settlementKeepsSeveralCardsAndTransfersSeparate() {
        PosPaymentPlan plan = resolver.resolveAllocations(List.of(
                allocation("CARD", "Visa", 40.0, "A1", null),
                allocation("CARD", "Mastercard", 10.0, "A2", null),
                allocation("ONLINE", null, 30.0, "W1", "1010 - FAB"),
                allocation("ONLINE", null, 20.0, "W2", "1020 - ADCB")), 100.0, null, "Cash");

        assertEquals(4, plan.getAllocations().size());
        assertEquals("Visa + Mastercard + Online", plan.getCombinedPaymentMode());
        assertEquals("1020 - ADCB", plan.getAllocations().get(3).getBankAccountName());
    }

    @Test
    void bnplSettlesTheSaleAndRecordsItsProvider() {
        PosPaymentPlan plan = resolver.resolveAllocations(List.of(
                allocation("BNPL", "Tabby", 93.45, "BNPL-79109320", null)), 93.45, null, "Cash");

        // The provider settles the sale, so it is money received — not a receivable.
        assertEquals(93.45, plan.getSettledAmount(), 0.001);
        assertEquals(0.0, plan.getCreditAmount(), 0.001);
        assertTrue(plan.getAllocations().get(0).isReceipt());
        // "BNPL Tabby", not "Tabby": the prefix is what every report buckets on.
        assertEquals("BNPL Tabby", plan.getAllocations().get(0).getModeLabel());
        // Summarised by rail, the same way Visa and Mastercard both read as "Card".
        assertEquals("BNPL", plan.getCombinedPaymentMode());
    }

    @Test
    void bnplCannotExceedTheInvoiceTotal() {
        // A provider settles what it financed and hands back nothing, so an over-allocation
        // would be money the store has to refund through a separate channel.
        assertThrows(ResponseStatusException.class, () -> resolver.resolveAllocations(List.of(
                allocation("BNPL", "Tabby", 150.0, "BNPL-1", null)), 100.0, null, "Cash"));
    }

    @Test
    void bnplSplitsWithOtherTenders() {
        PosPaymentPlan plan = resolver.resolveAllocations(List.of(
                allocation("BNPL", "Tamara", 60.0, "BNPL-2", null),
                allocation("CASH", null, 40.0, null, null)), 100.0, null, "Cash");

        assertEquals(100.0, plan.getSettledAmount(), 0.001);
        assertEquals("BNPL + Cash", plan.getCombinedPaymentMode());
    }

    @Test
    void settlementRejectsTheWordMixedAsALabel() {
        PosPaymentPlan plan = resolver.resolveAllocations(List.of(
                allocation("CASH", null, 60.0, null, null),
                allocation("CARD", "Visa", 40.0, null, null)), 100.0, "Mixed", "Cash");

        assertEquals("Cash + Visa", plan.getCombinedPaymentMode());
    }
}
