package com.billbull.backend.sales.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import com.billbull.backend.sales.common.FooterDiscountAllocator.DiscountType;
import com.billbull.backend.sales.common.FooterDiscountAllocator.LineInput;
import com.billbull.backend.sales.common.FooterDiscountAllocator.Result;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Pins {@link FooterDiscountAllocator} to the shared parity fixtures that the frontend's
 * footerDiscountAllocator.js is also tested against.
 */
class FooterDiscountAllocatorTest {

    @TestFactory
    Stream<DynamicTest> sharedFixtures() throws Exception {
        JsonNode root;
        try (InputStream in = getClass().getResourceAsStream("/footer-discount-fixtures.json")) {
            root = new ObjectMapper().readTree(in);
        }
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : root.get("cases")) {
            tests.add(DynamicTest.dynamicTest(c.get("name").asText(), () -> runFixture(c)));
        }
        return tests.stream();
    }

    private static void runFixture(JsonNode c) {
        Result r = run(c);
        JsonNode exp = c.get("expected");
        assertMoney(exp.get("footerAmount").asText(), r.footerAmount(), "footerAmount");
        for (int i = 0; i < exp.get("lines").size(); i++) {
            JsonNode el = exp.get("lines").get(i);
            var line = r.lines().get(i);
            assertMoney(el.get("base").asText(), line.base(), "line " + i + " base");
            assertMoney(el.get("share").asText(), line.footerShare(), "line " + i + " share");
            assertMoney(el.get("taxable").asText(), line.taxableAmount(), "line " + i + " taxable");
            assertMoney(el.get("tax").asText(), line.taxAmount(), "line " + i + " tax");
            assertMoney(el.get("total").asText(), line.lineTotal(), "line " + i + " total");
        }
        assertMoney(exp.get("taxableTotal").asText(), r.taxableTotal(), "taxableTotal");
        assertMoney(exp.get("taxTotal").asText(), r.taxTotal(), "taxTotal");
        assertMoney(exp.get("lineTotal").asText(), r.lineTotal(), "lineTotal");
        assertMoney(exp.get("subTotal").asText(), r.subTotal(), "subTotal");
        assertInvariants(r);
    }

    private static Result run(JsonNode c) {
        List<LineInput> lines = new ArrayList<>();
        for (JsonNode l : c.get("lines")) {
            var base = FooterDiscountAllocator.lineBase(
                    new BigDecimal(l.get("qty").asText()), new BigDecimal(l.get("price").asText()),
                    new BigDecimal(l.get("foc").asText()), new BigDecimal(l.get("disc").asText()));
            lines.add(new LineInput(base.base(), new BigDecimal(l.get("tax").asText()),
                    !l.path("voided").asBoolean(false)));
        }
        JsonNode d = c.get("discount");
        return FooterDiscountAllocator.allocate(lines, DiscountType.from(d.get("type").asText()),
                new BigDecimal(d.get("value").asText()), VatMode.valueOf(c.get("vatMode").asText()));
    }

    @Test
    void repeatedCalculationsAreIdentical() {
        List<LineInput> lines = List.of(
                new LineInput(new BigDecimal("10.00"), BigDecimal.valueOf(5), true),
                new LineInput(new BigDecimal("10.00"), BigDecimal.valueOf(5), true),
                new LineInput(new BigDecimal("10.00"), BigDecimal.valueOf(5), true));
        Result first = FooterDiscountAllocator.allocate(lines, DiscountType.AMOUNT, new BigDecimal("0.10"),
                VatMode.EXCLUSIVE);
        for (int i = 0; i < 50; i++) {
            assertEquals(first, FooterDiscountAllocator.allocate(lines, DiscountType.AMOUNT,
                    new BigDecimal("0.10"), VatMode.EXCLUSIVE));
        }
    }

    @Test
    void randomDocumentsAlwaysReconcile() {
        Random rnd = new Random(20261001L);
        int[] rates = { 0, 5, 15, 20 };
        for (int doc = 0; doc < 2000; doc++) {
            int n = 1 + rnd.nextInt(8);
            List<LineInput> lines = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                BigDecimal base = BigDecimal.valueOf(rnd.nextInt(500_000), 2);
                lines.add(new LineInput(base, BigDecimal.valueOf(rates[rnd.nextInt(rates.length)]),
                        rnd.nextInt(10) != 0));
            }
            DiscountType type = rnd.nextBoolean() ? DiscountType.AMOUNT : DiscountType.PERCENT;
            BigDecimal value = type == DiscountType.AMOUNT
                    ? BigDecimal.valueOf(rnd.nextInt(300_000), 2)
                    : BigDecimal.valueOf(rnd.nextInt(10_001), 2);
            VatMode mode = rnd.nextBoolean() ? VatMode.EXCLUSIVE : VatMode.INCLUSIVE;
            assertInvariants(FooterDiscountAllocator.allocate(lines, type, value, mode));
        }
    }

    @Test
    void unknownTypeFallsBackToLegacyPercent() {
        assertEquals(DiscountType.PERCENT, DiscountType.from(null));
        assertEquals(DiscountType.PERCENT, DiscountType.from("percent"));
        assertEquals(DiscountType.AMOUNT, DiscountType.from("AMOUNT"));
    }

    /** Σ share == F, every share within its line, and the header identity holds. */
    private static void assertInvariants(Result r) {
        BigDecimal shares = BigDecimal.ZERO;
        BigDecimal totals = BigDecimal.ZERO;
        for (var line : r.lines()) {
            assertTrue(line.footerShare().signum() >= 0, "negative share");
            assertTrue(line.footerShare().compareTo(line.base()) <= 0, "share exceeds base");
            assertEquals(2, line.footerShare().scale());
            if (line.eligible()) {
                shares = shares.add(line.footerShare());
                totals = totals.add(line.lineTotal());
                assertMoney(line.lineTotal().toPlainString(), line.taxableAmount().add(line.taxAmount()),
                        "taxable + tax == total");
            } else {
                assertMoney("0", line.footerShare(), "voided share");
            }
        }
        assertMoney(r.footerAmount().toPlainString(), shares, "sum of shares");
        assertMoney(r.lineTotal().toPlainString(), totals, "sum of line totals");
        assertMoney(r.lineTotal().toPlainString(), r.subTotal().subtract(r.footerAmount()).add(r.taxTotal()),
                "subTotal - footer + tax == total");
    }

    private static void assertMoney(String expected, BigDecimal actual, String what) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> what + ": expected " + expected + " but was " + actual);
    }
}
