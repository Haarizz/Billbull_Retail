package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * §20A — the same product on one invoice twice must not be prorated off the wrong line.
 *
 * <p>Proration, cost resolution and restock all matched the original invoice line by item code
 * alone, taking the first match ({@code putIfAbsent}). Two lines of the same product at
 * different prices — a genuine case after a price change, a negotiated second line, or a
 * split-unit sale — therefore both received the first line's discount, so one of them was
 * refunded against money the customer never paid for it and valued in GL 1200 at the wrong
 * cost.
 *
 * <p>The fix is to match on the strongest identity available, {@code invoiceItemId}, which the
 * eligibility response already carries per line. The item-code fallback is retained for legacy
 * rows and is correct whenever the product appears once, which is the common case.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnLineIdentityTest {

    private static final String INVOICE = "INV-2026-04812";

    @Mock private SalesInvoiceRepository salesInvoiceRepository;

    @InjectMocks private SalesReturnService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
    }

    // ---------------------------------------------------------------------------
    // The resolver
    // ---------------------------------------------------------------------------

    @Test
    void theExactInvoiceLineWinsWhenTheReturnLineNamesOne() {
        SalesInvoiceItem first = invoiceLine(1L, "ITEM-A", "100.00", 20d);
        SalesInvoiceItem second = invoiceLine(2L, "ITEM-A", "100.00", 0d);
        Map<Long, SalesInvoiceItem> byId = index(first, second);
        Map<String, SalesInvoiceItem> byCode = codeIndex(first, second);

        assertSame(second, SalesReturnService.resolveInvoiceLine(returnLine(2L, "ITEM-A", 1), byId, byCode));
        assertSame(first, SalesReturnService.resolveInvoiceLine(returnLine(1L, "ITEM-A", 1), byId, byCode));
    }

    @Test
    void aReturnLineWithNoInvoiceLineIdFallsBackToTheItemCode() {
        SalesInvoiceItem first = invoiceLine(1L, "ITEM-A", "100.00", 20d);
        SalesInvoiceItem second = invoiceLine(2L, "ITEM-A", "100.00", 0d);

        assertSame(first, SalesReturnService.resolveInvoiceLine(
                returnLine(null, "ITEM-A", 1), index(first, second), codeIndex(first, second)));
    }

    @Test
    void anInvoiceLineIdThatIsNotOnTheInvoiceFallsBackRatherThanFailing() {
        SalesInvoiceItem only = invoiceLine(1L, "ITEM-A", "100.00", 20d);

        assertSame(only, SalesReturnService.resolveInvoiceLine(
                returnLine(999L, "ITEM-A", 1), index(only), codeIndex(only)));
    }

    @Test
    void anItemThatIsNotOnTheInvoiceAtAllResolvesToNothing() {
        SalesInvoiceItem only = invoiceLine(1L, "ITEM-A", "100.00", 20d);

        assertNull(SalesReturnService.resolveInvoiceLine(
                returnLine(null, "ITEM-GHOST", 1), index(only), codeIndex(only)));
    }

    // ---------------------------------------------------------------------------
    // Proration through the resolver
    // ---------------------------------------------------------------------------

    /**
     * The regression the brief asks for: one product, two invoice lines, different discounts.
     * Each return line must be prorated against its own line.
     */
    @Test
    void theSameProductTwiceAtDifferentDiscountsProratesEachLineSeparately() {
        // Line 1: 10 units at 100 with a 20% discount -> 200 discount, 20 per unit.
        // Line 2: 10 units at 100 with no discount    ->   0 discount,  0 per unit.
        stubInvoice(invoiceLine(1L, "ITEM-A", "100.00", 20d), invoiceLine(2L, "ITEM-A", "100.00", 0d));

        SalesReturn ret = new SalesReturn();
        ret.setLinkedInvoice(INVOICE);
        SalesReturnItem fromDiscountedLine = returnLine(1L, "ITEM-A", 2);
        SalesReturnItem fromFullPriceLine = returnLine(2L, "ITEM-A", 2);
        ret.setItems(new ArrayList<>(List.of(fromDiscountedLine, fromFullPriceLine)));

        service.prorateDiscountFromInvoice(ret);

        assertMoney("40.00", fromDiscountedLine.getDiscountAmount());
        assertEquals(20d, fromDiscountedLine.getDiscountPercent());
        // Before the fix this read 40.00 too, refunding a discount this line never carried.
        assertMoney("0.00", fromFullPriceLine.getDiscountAmount());
        assertEquals(0d, fromFullPriceLine.getDiscountPercent());
    }

    @Test
    void aSingleOccurrenceOfTheProductIsUnaffectedByTheChange() {
        // The common case has to keep behaving exactly as it did, with or without a line id.
        stubInvoice(invoiceLine(1L, "ITEM-A", "100.00", 20d));

        SalesReturn withId = new SalesReturn();
        withId.setLinkedInvoice(INVOICE);
        SalesReturnItem identified = returnLine(1L, "ITEM-A", 2);
        withId.setItems(new ArrayList<>(List.of(identified)));
        service.prorateDiscountFromInvoice(withId);

        SalesReturn legacy = new SalesReturn();
        legacy.setLinkedInvoice(INVOICE);
        SalesReturnItem unidentified = returnLine(null, "ITEM-A", 2);
        legacy.setItems(new ArrayList<>(List.of(unidentified)));
        service.prorateDiscountFromInvoice(legacy);

        assertMoney("40.00", identified.getDiscountAmount());
        assertMoney("40.00", unidentified.getDiscountAmount());
    }

    @Test
    void aCallerSuppliedDiscountIsStillNeverOverwritten() {
        stubInvoice(invoiceLine(1L, "ITEM-A", "100.00", 20d));

        SalesReturn ret = new SalesReturn();
        ret.setLinkedInvoice(INVOICE);
        SalesReturnItem line = returnLine(1L, "ITEM-A", 2);
        line.setDiscountAmount(new BigDecimal("5.00"));
        ret.setItems(new ArrayList<>(List.of(line)));

        service.prorateDiscountFromInvoice(ret);

        assertMoney("5.00", line.getDiscountAmount());
    }

    // ---------------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------------

    private void stubInvoice(SalesInvoiceItem... items) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setItems(new ArrayList<>(List.of(items)));
        org.mockito.Mockito.lenient().when(salesInvoiceRepository.findByInvoiceNumber(INVOICE))
                .thenReturn(Optional.of(invoice));
    }

    private static SalesInvoiceItem invoiceLine(Long id, String code, String price, Double discountPct) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        ReflectionTestUtils.setField(item, "id", id);
        item.setItemCode(code);
        item.setQuantity(10);
        item.setPrice(new BigDecimal(price));
        item.setDiscount(discountPct);
        return item;
    }

    private static SalesReturnItem returnLine(Long invoiceItemId, String code, int qty) {
        SalesReturnItem item = new SalesReturnItem();
        item.setInvoiceItemId(invoiceItemId);
        item.setItemCode(code);
        item.setReturnQty(qty);
        return item;
    }

    private static Map<Long, SalesInvoiceItem> index(SalesInvoiceItem... items) {
        Map<Long, SalesInvoiceItem> byId = new HashMap<>();
        for (SalesInvoiceItem i : items) byId.put(i.getId(), i);
        return byId;
    }

    private static Map<String, SalesInvoiceItem> codeIndex(SalesInvoiceItem... items) {
        Map<String, SalesInvoiceItem> byCode = new HashMap<>();
        for (SalesInvoiceItem i : items) byCode.putIfAbsent(i.getItemCode(), i);
        return byCode;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
