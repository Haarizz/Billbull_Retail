package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

import com.billbull.backend.sales.common.FooterDiscountAllocator;
import com.billbull.backend.sales.common.VatMode;

/**
 * Each line's share of an invoice's footer (bill) discount, for consumers that must reverse or
 * report it per line (sales returns, reports).
 *
 * <ul>
 *   <li>Invoices whose lines carry {@code footer_discount} (every non-POS invoice saved through
 *       the allocator, and legacy back-office invoices that stored the browser's allocation):
 *       the stored shares are used as-is.</li>
 *   <li>Invoices with a header discount but no line shares (POS sales, whose bill discount is
 *       still header-only, and very old documents): a share is derived with the same
 *       {@link FooterDiscountAllocator} over the stored lines, so the header discount is never
 *       silently dropped from a refund. Nothing is written back.</li>
 * </ul>
 */
public final class InvoiceFooterDiscountShares {

    private InvoiceFooterDiscountShares() {
    }

    public static Map<SalesInvoiceItem, BigDecimal> of(SalesInvoice invoice) {
        Map<SalesInvoiceItem, BigDecimal> shares = new IdentityHashMap<>();
        List<SalesInvoiceItem> items = invoice != null && invoice.getItems() != null
                ? invoice.getItems() : List.of();

        boolean anyStored = items.stream().anyMatch(it -> it.getFooterDiscount() != null);
        BigDecimal header = invoice != null && invoice.getBillDiscountAmount() != null
                ? invoice.getBillDiscountAmount() : BigDecimal.ZERO;

        if (anyStored || header.signum() <= 0) {
            for (SalesInvoiceItem it : items) {
                shares.put(it, it.getFooterDiscount() != null ? it.getFooterDiscount() : BigDecimal.ZERO);
            }
            return shares;
        }

        boolean inclusive = invoice.getVatMode() == VatMode.INCLUSIVE
                || Boolean.TRUE.equals(invoice.getTaxInclusive());
        List<SalesInvoiceItem> ordered = new ArrayList<>(items);
        FooterDiscountAllocator.allocateLines(
                ordered,
                it -> new FooterDiscountAllocator.LineSpec(
                        BigDecimal.valueOf(it.getQuantity() != null ? it.getQuantity() : 0),
                        it.getPrice(),
                        BigDecimal.valueOf(it.getFoc() != null ? it.getFoc() : 0),
                        BigDecimal.valueOf(it.getDiscount() != null ? it.getDiscount() : 0d),
                        BigDecimal.valueOf(it.getTaxRate() != null ? it.getTaxRate() : 0d),
                        !it.isVoided()),
                FooterDiscountAllocator.DiscountType.AMOUNT, header,
                inclusive ? VatMode.INCLUSIVE : VatMode.EXCLUSIVE,
                (it, base, line) -> shares.put(it, line.footerShare()));
        return shares;
    }
}
