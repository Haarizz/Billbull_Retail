import { describe, expect, it } from 'vitest';
import {
    allocateFooterDiscount,
    makeFooterDiscount,
    printLineMoney,
    resolveSourceFooterDiscount,
    summarizeSalesItems,
    summarizeStoredSalesItems,
    summaryLineLookup,
} from '../documentSummaryUtils';

// The screenshot invoice: A 1 × 3,500 @ 20% / 5% VAT, B 1 × 200 @ 10% / 20% VAT.
// Editor rows carry PRE-footer taxAmt/net from calculateRow (2940.00 / 216.00).
const editorRows = () => ([
    { id: 1, code: 'A', qty: 1, price: 3500, disc: 20, tax: 5, taxAmt: 140, net: 2940, taxableAmount: 2800, unit: 'PCS' },
    { id: 2, code: 'B', qty: 1, price: 200, disc: 10, tax: 20, taxAmt: 36, net: 216, taxableAmount: 180, unit: 'PCS' },
]);

// What the server returns after saving that invoice with an AED 100 footer discount.
const savedApiInvoice = () => ({
    invoiceNumber: 'INV-1',
    billDiscountType: 'amount',
    billDiscount: 0,
    billDiscountAmount: 100,
    vatMode: 'EXCLUSIVE',
    items: [
        { itemCode: 'A', quantity: 1, price: 3500, discount: 20, taxRate: 5, footerDiscount: 93.96, taxableAmount: 2706.04, taxAmount: 135.3, netAmount: 2841.34, grossAmount: 3500 },
        { itemCode: 'B', quantity: 1, price: 200, discount: 10, taxRate: 20, footerDiscount: 6.04, taxableAmount: 173.96, taxAmount: 34.79, netAmount: 208.75, grossAmount: 200 },
    ],
});

const sum = (xs) => Math.round(xs.reduce((s, x) => s + x * 100, 0)) / 100;

describe('summarizeSalesItems — live allocation (screenshot regression)', () => {
    it('allocates AED 100 as 93.96 / 6.04 and reduces VAT to 170.09', () => {
        const s = summarizeSalesItems(editorRows(), makeFooterDiscount('amount', 100), {}, 'EXCLUSIVE');

        expect(s.lines.map((l) => l.share)).toEqual([93.96, 6.04]);
        expect(s.lines.map((l) => l.tax)).toEqual([135.3, 34.79]);
        expect(s.lines.map((l) => l.total)).toEqual([2841.34, 208.75]);
        expect(s.footerDiscountTotal).toBe(100);
        expect(sum(s.lines.map((l) => l.share))).toBe(s.footerDiscountTotal);
        expect(s.tax).toBe(170.09);
        expect(s.taxableTotal).toBe(2880);
        expect(s.subTotal).toBe(2980);
        expect(s.grossTotal).toBe(3700);
        expect(s.itemDiscountTotal).toBe(720);
        expect(s.grandTotal).toBe(3050.09);
        // Lines reconcile to the header.
        expect(sum(s.lines.map((l) => l.total))).toBe(s.grandTotal);
    });

    it('INCLUSIVE: the fixed AED 100 is customer-facing (2,980 -> 2,880)', () => {
        const s = summarizeSalesItems(editorRows(), makeFooterDiscount('amount', 100), {}, 'INCLUSIVE');
        expect(s.grandTotal).toBe(2880);
        expect(s.tax).toBe(157.85);
    });

    it('ignores stale stored totals on the rows (no double discount)', () => {
        // Rows rehydrated from the server WITHOUT calculateRow used to carry post-footer
        // taxable/net, and the footer was applied again (3,050.09 -> 2,944.19).
        const rehydrated = savedApiInvoice().items.map((i) => ({
            qty: i.quantity, price: i.price, disc: i.discount, tax: i.taxRate,
            taxAmt: i.taxAmount, net: i.netAmount, taxableAmount: i.netAmount - i.taxAmount,
        }));
        const s = summarizeSalesItems(rehydrated, makeFooterDiscount('amount', 100), {}, 'EXCLUSIVE');
        expect(s.grandTotal).toBe(3050.09);
    });

    it('keeps delivery charge and round-off as flat adds', () => {
        const s = summarizeSalesItems(editorRows(), makeFooterDiscount('amount', 100), { deliveryCharge: 10, roundOff: -0.09 }, 'EXCLUSIVE');
        expect(s.grandTotal).toBe(3060);
    });
});

describe('preview -> save -> reload -> print -> PDF give identical money', () => {
    it('stored server values equal the live preview', () => {
        const preview = summarizeSalesItems(editorRows(), makeFooterDiscount('amount', 100), {}, 'EXCLUSIVE');
        const saved = savedApiInvoice();

        // Reload / list print / PDF all read the stored values.
        const stored = summarizeStoredSalesItems(saved.items, saved, {}, 'EXCLUSIVE');

        expect(stored.storedValues).toBe(true);
        expect(stored.grandTotal).toBe(preview.grandTotal);
        expect(stored.tax).toBe(preview.tax);
        expect(stored.footerDiscountTotal).toBe(preview.footerDiscountTotal);
        expect(stored.taxableTotal).toBe(preview.taxableTotal);
        expect(stored.lines.map((l) => l.share)).toEqual(preview.lines.map((l) => l.share));
        // Printing twice changes nothing.
        expect(summarizeStoredSalesItems(saved.items, saved, {}, 'EXCLUSIVE').grandTotal).toBe(3050.09);
    });

    it('printed lines reconcile with printed totals', () => {
        const saved = savedApiInvoice();
        const stored = summarizeStoredSalesItems(saved.items, saved, {}, 'EXCLUSIVE');
        const lineFor = summaryLineLookup(saved.items, stored);
        const printed = saved.items.map((i) => printLineMoney(lineFor(i), i));

        expect(printed.map((p) => p.footerDiscount)).toEqual([93.96, 6.04]);
        expect(sum(printed.map((p) => p.total))).toBe(stored.grandTotal);
        expect(sum(printed.map((p) => p.taxAmt))).toBe(stored.tax);
        expect(sum(printed.map((p) => p.footerDiscount))).toBe(stored.footerDiscountTotal);
    });

    it('editor rows carrying a serverLine snapshot also display stored values', () => {
        const saved = savedApiInvoice();
        const rows = saved.items.map((i, idx) => ({
            ...editorRows()[idx],
            serverLine: { netAmount: i.netAmount, taxAmount: i.taxAmount, footerDiscount: i.footerDiscount, taxableAmount: i.taxableAmount },
        }));
        const s = summarizeStoredSalesItems(rows, { billDiscountType: 'amount', billDiscountAmount: 100 }, {}, 'EXCLUSIVE');
        expect(s.grandTotal).toBe(3050.09);
    });
});

describe('summarizeStoredSalesItems — historical documents', () => {
    it('header-only discount (POS / older documents) is shown from the header, not per line', () => {
        const pos = {
            billDiscountType: null, billDiscount: null, billDiscountAmount: 20,
            items: [{ quantity: 1, price: 100, discount: 0, taxRate: 5, taxAmount: 5, netAmount: 105, footerDiscount: null }],
        };
        const s = summarizeStoredSalesItems(pos.items, pos, {}, 'EXCLUSIVE');
        expect(s.headerOnlyFooter).toBe(true);
        expect(s.footerDiscountTotal).toBe(20);
        expect(s.lines[0].share).toBe(0);
        expect(s.tax).toBe(5); // VAT as it was charged — not recomputed
        expect(s.grandTotal).toBe(85);
    });

    it('legacy stored lines are summed as stored, never re-allocated', () => {
        // Old browser allocation (unrounded) — the stored values are what was posted.
        const legacy = {
            billDiscountType: 'amount', billDiscountAmount: 0.1,
            items: [1, 2, 3].map(() => ({ quantity: 1, price: 10, discount: 0, taxRate: 5, footerDiscount: 0.03, taxAmount: 0.5, netAmount: 10.47 })),
        };
        const s = summarizeStoredSalesItems(legacy.items, legacy, {}, 'EXCLUSIVE');
        expect(s.footerDiscountTotal).toBe(0.09);
        expect(s.grandTotal).toBe(31.41);
    });

    it('falls back to the live allocation for unsaved rows', () => {
        const s = summarizeStoredSalesItems(editorRows(), { billDiscountType: 'amount', billDiscountAmount: 100 }, {}, 'EXCLUSIVE');
        expect(s.storedValues).toBe(false);
        expect(s.grandTotal).toBe(3050.09);
    });
});

describe('allocateFooterDiscount — save payload preview', () => {
    it('enriches rows with the authoritative per-line money', () => {
        const rows = allocateFooterDiscount(editorRows(), makeFooterDiscount('amount', 100), 'EXCLUSIVE');
        expect(rows.map((r) => r.allocatedFooterDiscount)).toEqual([93.96, 6.04]);
        expect(rows[0].footerAllocation).toMatchObject({ share: 93.96, taxable: 2706.04, tax: 135.3, total: 2841.34, gross: 3500, itemDiscount: 700 });
    });

    it('zero-rated lines stay zero-rated', () => {
        const rows = allocateFooterDiscount([
            { qty: 1, price: 100, disc: 0, tax: 0 },
            { qty: 1, price: 100, disc: 0, tax: 5 },
        ], makeFooterDiscount('amount', 10), 'EXCLUSIVE');
        expect(rows[0].footerAllocation).toMatchObject({ share: 5, tax: 0, total: 95 });
        expect(rows[1].footerAllocation).toMatchObject({ share: 5, tax: 4.75, total: 99.75 });
    });
});

describe('resolveSourceFooterDiscount — conversions never lose the type or value', () => {
    it.each([
        ['Quotation, amount, typed fixed', { billDiscountType: 'amount', billDiscountFixed: 100, billDiscountAmount: 100, billDiscount: 0 }, { type: 'amount', value: 100 }],
        ['Sales Order, amount (API: no fixed field)', { billDiscountType: 'amount', billDiscount: 0, billDiscountAmount: 100 }, { type: 'amount', value: 100 }],
        ['Sales Order, percent', { billDiscountType: 'percent', billDiscount: 10, billDiscountAmount: 298 }, { type: 'percent', value: 10 }],
        ['Proforma, percent (legacy, untyped)', { billDiscount: 10 }, { type: 'percent', value: 10 }],
        ['Proforma, amount', { billDiscountType: 'amount', billDiscount: 0, billDiscountAmount: 50 }, { type: 'amount', value: 50 }],
        ['POS invoice, header-only amount', { billDiscountType: null, billDiscount: null, billDiscountAmount: 20 }, { type: 'amount', value: 20 }],
        ['no discount', {}, { type: 'percent', value: 0 }],
    ])('%s', (_name, src, expected) => {
        expect(resolveSourceFooterDiscount(src)).toEqual(expected);
    });

    it('target re-allocates over its own (changed) lines with the same allocator', () => {
        const footer = resolveSourceFooterDiscount({ billDiscountType: 'amount', billDiscountAmount: 100 });
        // Partial conversion: only line A moves to the invoice.
        const s = summarizeSalesItems([editorRows()[0]], footer, {}, 'EXCLUSIVE');
        expect(s.lines[0].share).toBe(100);
        expect(s.footerDiscountTotal).toBe(100);
    });
});
