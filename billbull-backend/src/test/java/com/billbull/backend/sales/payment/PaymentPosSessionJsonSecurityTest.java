package com.billbull.backend.sales.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * P2 hardening regression: {@code Payment.posSessionId} — the COLLECTION session, the
 * authoritative source for every POS cash-reconciliation figure — must never be settable
 * by a raw client JSON payload (e.g. a direct {@code POST /api/sales/payments} call).
 * The only legitimate writer is the server-side {@code SalesInvoiceService.recordPayment}
 * family, which threads a session the server itself has already validated.
 *
 * <p>Exercises the entity's Jackson binding directly (no Spring context needed) — this is
 * exactly the same deserialization {@code PaymentController.savePayment(@RequestBody Payment)}
 * performs on every request.
 */
class PaymentPosSessionJsonSecurityTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void clientSuppliedPosSessionIdIsIgnoredOnDeserialization() throws Exception {
        String maliciousPayload = "{"
                + "\"paymentType\":\"RECEIVED\","
                + "\"amount\":195.00,"
                + "\"linkedInvoice\":\"INV-2026-0891\","
                + "\"posSessionId\":100"
                + "}";

        Payment deserialized = mapper.readValue(maliciousPayload, Payment.class);

        assertNull(deserialized.getPosSessionId(),
                "a client-supplied posSessionId in the request body must be dropped, never trusted");
        // Confirm the rest of the payload still deserializes normally — this isn't a
        // blanket lockdown, only posSessionId is write-protected.
        assertEquals("INV-2026-0891", deserialized.getLinkedInvoice());
    }

    @Test
    void posSessionIdStillSerializesInResponses() throws Exception {
        Payment payment = new Payment();
        payment.setPosSessionId(100L);
        payment.setLinkedInvoice("INV-2026-0891");

        String json = mapper.writeValueAsString(payment);

        assertTrue(json.contains("\"posSessionId\":100"),
                "server-set posSessionId must still be visible to API consumers/receipts");
    }
}
