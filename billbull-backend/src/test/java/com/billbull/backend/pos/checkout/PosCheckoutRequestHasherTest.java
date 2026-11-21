package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Deterministic test vectors for {@link PosCheckoutRequestHasher} (Phase 0 / M2).
 *
 * <p>Requests are built the way the server receives them: JSON text deserialised by Jackson into
 * {@link PosCheckoutRequest}. The hash is then computed from that object by the hasher's own
 * encoding, so these vectors pin the encoding itself and do not depend on any serializer.
 */
@DisplayName("Checkout request hash (M2)")
class PosCheckoutRequestHasherTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** A cash sale of one line, as the till sends it (trimmed to the fields that matter here). */
    private static final String BASE = """
            {"checkoutKey":"K-1","customerName":"Walk-in Customer","paymentMode":"Cash",
             "amountTendered":100,"cashAmount":100,"branchId":1,"sessionId":42,"terminalId":"T1",
             "taxInclusive":true,
             "items":[{"itemCode":"08747","quantity":1,"unit":"Each","price":100,"discount":0,"taxRate":5}],
             "paymentAllocations":[{"type":"CASH","amount":100}]}
            """;

    private static PosCheckoutRequest req(String json) throws Exception {
        return JSON.readValue(json, PosCheckoutRequest.class);
    }

    private static String hash(String json) throws Exception {
        return PosCheckoutRequestHasher.hash(req(json));
    }

    // ------------------------------------------------------------------ pinned vectors

    @Test
    @DisplayName("pinned vector: canonical form and SHA-256 of the base sale")
    void pinnedVector() throws Exception {
        String canonical = PosCheckoutRequestHasher.canonical(req(BASE));
        assertEquals("{\"advanceAmount\":null,\"amountTendered\":100,\"bankAccountName\":null,\"billDiscountAmount\":null,"
                + "\"branchCode\":null,\"branchId\":1,\"branchName\":null,\"cardAmount\":null,\"cardLegs\":null,"
                + "\"cardReference\":null,\"cardType\":null,\"cashAmount\":100,\"combinedPaymentMode\":null,"
                + "\"counterName\":null,\"customerCode\":null,\"customerName\":\"Walk-in Customer\",\"deliveryCharge\":null,"
                + "\"deliveryDate\":null,\"deliveryNotes\":null,\"deliveryPersonEmployeeCode\":null,"
                + "\"deliveryPersonEmployeeId\":null,\"deliveryTimeSlot\":null,\"driverName\":null,"
                + "\"items\":[{\"batchNumber\":null,\"discount\":0,\"itemCode\":\"08747\",\"itemName\":null,\"price\":100,"
                + "\"quantity\":1,\"salesOrderItemId\":null,\"serialNumber\":null,\"taxRate\":5,\"unit\":\"Each\","
                + "\"voidReason\":null,\"voided\":null}],\"linkedSalesOrder\":null,\"notes\":null,\"onlineAmount\":null,"
                + "\"paymentAllocations\":[{\"amount\":100,\"bankAccountName\":null,\"metadata\":null,\"reference\":null,"
                + "\"subtype\":null,\"type\":\"CASH\"}],\"paymentMode\":\"Cash\",\"priceLevelId\":null,"
                + "\"salespersonEmployeeCode\":null,\"salespersonEmployeeId\":null,\"sessionId\":42,\"shippingAddress\":null,"
                + "\"shippingCharge\":null,\"taxInclusive\":true,\"terminalId\":\"T1\"}", canonical);
        assertEquals(PIN_BASE, PosCheckoutRequestHasher.hash(req(BASE)));
    }

    /** SHA-256 of "pos-checkout-v1:" + the canonical string above; cross-checked with coreutils
     *  {@code printf '%s' 'pos-checkout-v1:{...}' | sha256sum}, independently of the JDK. */
    private static final String PIN_BASE = "a6c2bfb44336266a5af057f0c7f8b6904f5c670913b828fe18f4f93b5eed6acc";

    @Test
    @DisplayName("number encoding: shortest round-trip decimal, trailing zeros stripped, zero is 0")
    void numberEncoding() {
        assertEquals("100", PosCheckoutRequestHasher.number(100.0));
        assertEquals("100", PosCheckoutRequestHasher.number(1e2));
        assertEquals("0.1", PosCheckoutRequestHasher.number(0.1));
        assertEquals("0.3", PosCheckoutRequestHasher.number(0.30));
        assertEquals("0.30000000000000004", PosCheckoutRequestHasher.number(0.1 + 0.2));
        assertEquals("0", PosCheckoutRequestHasher.number(-0.0));
        assertEquals("0", PosCheckoutRequestHasher.number(0));
        assertEquals("-12.5", PosCheckoutRequestHasher.number(-12.50));
        assertEquals("1000000", PosCheckoutRequestHasher.number(1_000_000L));
        assertThrows(IllegalArgumentException.class, () -> PosCheckoutRequestHasher.number(Double.NaN));
        assertThrows(IllegalArgumentException.class, () -> PosCheckoutRequestHasher.number(Double.POSITIVE_INFINITY));
    }

    // ------------------------------------------------------------------ equal requests, equal hash

    @Test
    @DisplayName("property order does not matter, at the top level, in lines and in allocations")
    void propertyOrder() throws Exception {
        String reordered = """
                {"paymentAllocations":[{"amount":100,"type":"CASH"}],
                 "items":[{"taxRate":5,"discount":0,"price":100,"unit":"Each","quantity":1,"itemCode":"08747"}],
                 "taxInclusive":true,"terminalId":"T1","sessionId":42,"branchId":1,"cashAmount":100,
                 "amountTendered":100,"paymentMode":"Cash","customerName":"Walk-in Customer","checkoutKey":"K-1"}
                """;
        assertEquals(hash(BASE), hash(reordered));
    }

    @Test
    @DisplayName("numeric representation does not matter: 100, 100.0, 1e2, 100.00")
    void numericRepresentation() throws Exception {
        String variant = BASE.replace("\"amountTendered\":100", "\"amountTendered\":100.0")
                .replace("\"cashAmount\":100", "\"cashAmount\":1e2")
                .replace("\"price\":100", "\"price\":100.00")
                .replace("\"discount\":0", "\"discount\":0.0")
                .replace("{\"type\":\"CASH\",\"amount\":100}", "{\"type\":\"CASH\",\"amount\":100.000}");
        assertNotEquals(BASE, variant);
        assertEquals(hash(BASE), hash(variant));
    }

    @Test
    @DisplayName("an omitted field and an explicit null hash the same")
    void nullAndOmitted() throws Exception {
        String explicitNulls = BASE.replace("\"taxInclusive\":true,",
                "\"taxInclusive\":true,\"customerCode\":null,\"notes\":null,\"cardLegs\":null,\"linkedSalesOrder\":null,");
        assertEquals(hash(BASE), hash(explicitNulls));
    }

    @Test
    @DisplayName("credentials and the checkout key itself are not part of the hash")
    void credentialsAndKeyExcluded() throws Exception {
        String withCreds = BASE.replace("\"taxInclusive\":true,",
                "\"taxInclusive\":true,\"supervisorOverridePin\":\"1234\",\"supervisorOverrideEmail\":\"s@x\","
                        + "\"supervisorOverridePassword\":\"pw\",");
        assertEquals(hash(BASE), hash(withCreds));
        assertEquals(hash(BASE), hash(BASE.replace("\"K-1\"", "\"K-2\"")));
    }

    @Test
    @DisplayName("allocation metadata is encoded with sorted keys")
    void metadataOrder() throws Exception {
        String a = BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CASH\",\"amount\":100,\"metadata\":{\"b\":2,\"a\":{\"y\":[1,2],\"x\":null}}}");
        String b = BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CASH\",\"amount\":100,\"metadata\":{\"a\":{\"x\":null,\"y\":[1.0,2]},\"b\":2.0}}");
        assertEquals(hash(a), hash(b));
        assertNotEquals(hash(BASE), hash(a));
    }

    // ------------------------------------------------------------------ different requests, different hash

    @Test
    @DisplayName("tender-only changes change the hash (the gap M1 could not see)")
    void tenderOnlyChanges() throws Exception {
        String base = hash(BASE);
        assertNotEquals(base, hash(BASE.replace("{\"type\":\"CASH\",\"amount\":100}", "{\"type\":\"CARD\",\"amount\":100}")),
                "cash → card");
        assertNotEquals(base, hash(BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CASH\",\"amount\":60},{\"type\":\"CARD\",\"amount\":40}")), "cash → cash + card split");
        assertNotEquals(base, hash(BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CASH\",\"amount\":100,\"reference\":\"R1\"}")), "tender reference");
        assertNotEquals(base, hash(BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CASH\",\"amount\":100,\"bankAccountName\":\"1010 - Bank\"}")), "receiving account");
        assertNotEquals(base, hash(BASE.replace("\"cashAmount\":100", "\"cashAmount\":90")), "legacy cash scalar");
        assertNotEquals(base, hash(BASE.replace("\"taxInclusive\":true,",
                "\"taxInclusive\":true,\"cardLegs\":[{\"cardType\":\"Visa\",\"amount\":100}],")), "card legs");
    }

    @Test
    @DisplayName("array order matters: reordered tender plan or cart is a different request")
    void arrayOrder() throws Exception {
        String split = BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CASH\",\"amount\":60},{\"type\":\"CARD\",\"amount\":40}");
        String swapped = BASE.replace("{\"type\":\"CASH\",\"amount\":100}",
                "{\"type\":\"CARD\",\"amount\":40},{\"type\":\"CASH\",\"amount\":60}");
        assertNotEquals(hash(split), hash(swapped));

        String twoLines = BASE.replace("\"items\":[{", "\"items\":[{\"itemCode\":\"A\",\"quantity\":1},{");
        String twoLinesSwapped = BASE.replace("\"taxRate\":5}]", "\"taxRate\":5},{\"itemCode\":\"A\",\"quantity\":1}]");
        assertNotEquals(hash(twoLines), hash(twoLinesSwapped));
    }

    @Test
    @DisplayName("sale changes change the hash: quantity, price, customer, session, void flag, strings exactly")
    void saleChanges() throws Exception {
        String base = hash(BASE);
        assertNotEquals(base, hash(BASE.replace("\"quantity\":1", "\"quantity\":2")));
        assertNotEquals(base, hash(BASE.replace("\"price\":100", "\"price\":99.99")));
        assertNotEquals(base, hash(BASE.replace("\"sessionId\":42", "\"sessionId\":43")));
        assertNotEquals(base, hash(BASE.replace("\"taxInclusive\":true,", "\"taxInclusive\":true,\"customerCode\":\"C1\",")));
        assertNotEquals(base, hash(BASE.replace("\"taxRate\":5}", "\"taxRate\":5,\"voided\":true}")));
        assertNotEquals(base, hash(BASE.replace("\"T1\"", "\"T1 \"")), "strings are not trimmed");
        assertNotEquals(base, hash(BASE.replace("\"taxRate\":5", "\"taxRate\":0")), "zero is a value, not null");
    }
}
