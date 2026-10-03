package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
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
 * A return's discount reversal includes the line's footer-discount share — it used to prorate
 * only the item discount, refunding the footer discount to the customer a second time.
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnFooterDiscountTest {

    private static final String INVOICE = "INV-1";

    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @InjectMocks private SalesReturnService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
    }

    @Test
    void storedFooterShareIsProratedIntoTheReturnedDiscount() {
        // 2 × 1,750 @ 20% item discount, footer share 93.96 on the line.
        SalesInvoiceItem line = invoiceLine("A", 2, "1750", 20d);
        line.setFooterDiscount(new BigDecimal("93.96"));
        stubInvoice(line);

        SalesReturn ret = returnOf("A", 1);
        service.prorateDiscountFromInvoice(ret);

        // (700 item discount + 93.96 footer) × 1/2
        assertMoney("396.98", ret.getItems().get(0).getDiscountAmount());
    }

    @Test
    void headerOnlyDiscountOnOlderInvoicesIsApportionedAsAFallback() {
        // POS-style invoice: bill discount on the header only, no line shares stored.
        SalesInvoiceItem a = invoiceLine("A", 1, "300", 0d);
        SalesInvoiceItem b = invoiceLine("B", 1, "100", 0d);
        SalesInvoice inv = stubInvoice(a, b);
        inv.setBillDiscountAmount(new BigDecimal("40"));

        SalesReturn ret = returnOf("A", 1);
        service.prorateDiscountFromInvoice(ret);

        assertMoney("30.00", ret.getItems().get(0).getDiscountAmount());
    }

    @Test
    void invoiceWithoutFooterDiscountIsUnchanged() {
        stubInvoice(invoiceLine("A", 2, "100", 10d));

        SalesReturn ret = returnOf("A", 1);
        service.prorateDiscountFromInvoice(ret);

        assertMoney("10.00", ret.getItems().get(0).getDiscountAmount());
    }

    private SalesInvoice stubInvoice(SalesInvoiceItem... items) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(INVOICE);
        inv.setItems(new ArrayList<>(List.of(items)));
        when(salesInvoiceRepository.findByInvoiceNumber(INVOICE)).thenReturn(Optional.of(inv));
        return inv;
    }

    private static SalesInvoiceItem invoiceLine(String code, int qty, String price, double discPct) {
        SalesInvoiceItem it = new SalesInvoiceItem();
        it.setItemCode(code);
        it.setQuantity(qty);
        it.setPrice(new BigDecimal(price));
        it.setDiscount(discPct);
        it.setTaxRate(5d);
        return it;
    }

    private static SalesReturn returnOf(String code, int qty) {
        SalesReturnItem ri = new SalesReturnItem();
        ri.setItemCode(code);
        ri.setReturnQty(qty);
        SalesReturn ret = new SalesReturn();
        ret.setLinkedInvoice(INVOICE);
        ret.setItems(new ArrayList<>(List.of(ri)));
        return ret;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }
}
