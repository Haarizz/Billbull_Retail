package com.billbull.backend.sales.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;

/**
 * Report "discount" is money: item-discount amounts + footer discount amount. It used to add
 * the PERCENTAGE rates together (20% + 10% + 0% footer => "30") and lost amount-type footers.
 */
class SalesReportDiscountTest {

    private final SalesReportDataService service = new SalesReportDataService(
            mock(SalesInvoiceRepository.class), mock(SalesReturnRepository.class), mock(SalesOrderRepository.class),
            mock(DeliveryNoteRepository.class), mock(CustomerRepository.class), mock(ProductRepository.class),
            mock(PaymentRepository.class),
            new com.billbull.backend.sales.returns.reporting.SalesReturnReportingService(
                    mock(SalesReturnRepository.class)));

    @Test
    void discountIsItemDiscountMoneyPlusFooterAmount() {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setBillDiscountType("amount");
        invoice.setBillDiscount(0d);
        invoice.setBillDiscountAmount(new BigDecimal("100.00"));
        invoice.setItems(List.of(line("3500", 20d, false), line("200", 10d, false), line("999", 50d, true)));

        // 700 + 20 item discount (voided line ignored) + 100 footer.
        assertEquals(820.0, service.invoiceDiscount(invoice), 0.0001);
    }

    @Test
    void percentFooterUsesTheStoredMoneyAmount() {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setBillDiscountType("percent");
        invoice.setBillDiscount(10d);
        invoice.setBillDiscountAmount(new BigDecimal("298.00"));
        invoice.setItems(List.of(line("3500", 20d, false), line("200", 10d, false)));

        assertEquals(1018.0, service.invoiceDiscount(invoice), 0.0001);
    }

    private static SalesInvoiceItem line(String price, double disc, boolean voided) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setQuantity(1);
        item.setPrice(new BigDecimal(price));
        item.setDiscount(disc);
        item.setVoided(voided);
        return item;
    }
}
