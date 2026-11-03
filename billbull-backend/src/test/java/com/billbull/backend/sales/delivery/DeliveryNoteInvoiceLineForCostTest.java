package com.billbull.backend.sales.delivery;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;

/**
 * {@link DeliveryNoteService#invoiceLineForCost}: which invoice line a delivered DN line's
 * weighted-average cost is stamped onto.
 *
 * <p>POS checkout leaves inventory lines without a cost; this stamp is what costs them (at
 * checkout for a counter sale, at Delivery Settlement when a PI Flow order is converted). A
 * product sold on several lines (one unit per line for batch/serial goods) must cost every line,
 * not just the first one with that item code.
 */
class DeliveryNoteInvoiceLineForCostTest {

    private static SalesInvoiceItem line(long id, String code) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setId(id);
        item.setItemCode(code);
        return item;
    }

    private static SalesInvoice invoice(long id, SalesInvoiceItem... lines) {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(id);
        inv.setItems(List.of(lines));
        return inv;
    }

    private static DeliveryNote dn(String sourceType, Long sourceId) {
        DeliveryNote dn = new DeliveryNote();
        dn.setSourceDocumentType(sourceType);
        dn.setSourceDocumentId(sourceId);
        return dn;
    }

    private static DeliveryNoteItem dnLine(String code, Long sourceLineId) {
        DeliveryNoteItem item = new DeliveryNoteItem();
        item.setItemCode(code);
        item.setSourceLineId(sourceLineId);
        return item;
    }

    @Test
    void theInvoicesOwnDeliveryNoteCostsEachRepeatedLineExactly() {
        SalesInvoiceItem first = line(11L, "SER-1");
        SalesInvoiceItem second = line(12L, "SER-1");
        SalesInvoiceItem third = line(13L, "SER-1");
        SalesInvoice inv = invoice(500L, first, second, third);
        DeliveryNote autoDn = dn("SALES_INVOICE", 500L);

        // byItemCode is what the item-code match returns: always the first line.
        assertSame(first, DeliveryNoteService.invoiceLineForCost(autoDn, dnLine("SER-1", 11L), inv, first));
        assertSame(second, DeliveryNoteService.invoiceLineForCost(autoDn, dnLine("SER-1", 12L), inv, first));
        assertSame(third, DeliveryNoteService.invoiceLineForCost(autoDn, dnLine("SER-1", 13L), inv, first));
    }

    @Test
    void aPiConversionDeliveryNoteIsTheInvoicesOwnAndMatchesByLine() {
        // PI Flow: conversion posts the invoice through updateStatus → auto-DN sourced from it.
        SalesInvoiceItem a = line(21L, "BAT-1");
        SalesInvoiceItem b = line(22L, "BAT-1");
        SalesInvoice pi = invoice(600L, a, b);

        assertSame(b, DeliveryNoteService.invoiceLineForCost(dn("SALES_INVOICE", 600L), dnLine("BAT-1", 22L), pi, a));
    }

    @Test
    void aDeliveryNoteOfAnotherDocumentKeepsTheItemCodeMatch() {
        // A DN raised from a Sales Order: its sourceLineId names an ORDER line, which may share
        // an id with an unrelated invoice line — it must never be read as an invoice line id.
        SalesInvoiceItem first = line(31L, "X");
        SalesInvoiceItem collidingId = line(32L, "X");
        SalesInvoice inv = invoice(700L, first, collidingId);

        assertSame(first, DeliveryNoteService.invoiceLineForCost(dn("SALES_ORDER", 9L), dnLine("X", 32L), inv, first));
        assertSame(first, DeliveryNoteService.invoiceLineForCost(dn("SALES_INVOICE", 701L), dnLine("X", 32L), inv, first));
        assertSame(first, DeliveryNoteService.invoiceLineForCost(dn(null, null), dnLine("X", 32L), inv, first));
    }

    @Test
    void noRecordedOriginOrAnUnknownOneFallsBackToTheItemCodeMatch() {
        SalesInvoiceItem first = line(41L, "Y");
        SalesInvoice inv = invoice(800L, first);
        DeliveryNote autoDn = dn("SALES_INVOICE", 800L);

        assertSame(first, DeliveryNoteService.invoiceLineForCost(autoDn, dnLine("Y", null), inv, first));
        assertSame(first, DeliveryNoteService.invoiceLineForCost(autoDn, dnLine("Y", 999L), inv, first));
        assertNull(DeliveryNoteService.invoiceLineForCost(autoDn, dnLine("Z", null), inv, null));
    }
}
