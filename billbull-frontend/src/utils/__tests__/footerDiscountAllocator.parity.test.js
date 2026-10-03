import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    allocateFooterDiscountLines,
    allocateSalesDocument,
    computeLineBase,
    focInSellingUnit,
    resolveFooterDiscountType,
} from '../footerDiscountAllocator';

// The SAME file FooterDiscountAllocatorTest.java runs against — Java/JS parity.
// vitest runs from billbull-frontend/.
const fixtures = JSON.parse(readFileSync(resolve(process.cwd(),
    '../billbull-backend/src/test/resources/footer-discount-fixtures.json'), 'utf8'));

const money = (v) => Number(v).toFixed(2);

describe('footerDiscountAllocator — shared Java/JS fixtures', () => {
    it.each(fixtures.cases.map((c) => [c.name, c]))('%s', (_name, c) => {
        const items = c.lines.map((l) => ({ qty: l.qty, price: l.price, foc: l.foc, disc: l.disc, tax: l.tax, voided: Boolean(l.voided) }));
        const r = allocateSalesDocument(items, c.discount, c.vatMode);
        const exp = c.expected;

        expect(money(r.footerAmount)).toBe(exp.footerAmount);
        exp.lines.forEach((el, i) => {
            const line = r.lines[i];
            expect({
                base: money(line.base), share: money(line.share), taxable: money(line.taxable),
                tax: money(line.tax), total: money(line.total),
            }).toEqual(el);
        });
        expect(money(r.taxableTotal)).toBe(exp.taxableTotal);
        expect(money(r.taxTotal)).toBe(exp.taxTotal);
        expect(money(r.lineTotal)).toBe(exp.lineTotal);
        expect(money(r.subTotal)).toBe(exp.subTotal);
    });
});

describe('footerDiscountAllocator — invariants', () => {
    it('always reconciles: Σ share == footer, share within base, header identity', () => {
        let seed = 20261001;
        const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        for (let doc = 0; doc < 2000; doc += 1) {
            const n = 1 + Math.floor(rnd() * 8);
            const lines = Array.from({ length: n }, () => ({
                base: Math.floor(rnd() * 500000) / 100,
                taxPercent: [0, 5, 15, 20][Math.floor(rnd() * 4)],
                eligible: rnd() > 0.1,
            }));
            const footer = rnd() > 0.5
                ? { type: 'amount', value: Math.floor(rnd() * 300000) / 100 }
                : { type: 'percent', value: Math.floor(rnd() * 10001) / 100 };
            const r = allocateFooterDiscountLines(lines, footer, rnd() > 0.5 ? 'INCLUSIVE' : 'EXCLUSIVE');

            const cents = (v) => Math.round(v * 100);
            const shares = r.lines.filter((l) => l.eligible).reduce((s, l) => s + cents(l.share), 0);
            expect(shares).toBe(cents(r.footerAmount));
            r.lines.forEach((l) => {
                expect(l.share).toBeGreaterThanOrEqual(0);
                expect(cents(l.share)).toBeLessThanOrEqual(cents(l.base));
                expect(cents(l.taxable) + cents(l.tax)).toBe(cents(l.total));
            });
            expect(cents(r.subTotal) - cents(r.footerAmount) + cents(r.taxTotal)).toBe(cents(r.lineTotal));
        }
    });

    it('is deterministic for the same input', () => {
        const lines = [10, 10, 10].map((b) => ({ base: b, taxPercent: 5, eligible: true }));
        const first = allocateFooterDiscountLines(lines, { type: 'amount', value: 0.1 });
        for (let i = 0; i < 20; i += 1) {
            expect(allocateFooterDiscountLines(lines, { type: 'amount', value: 0.1 })).toEqual(first);
        }
        expect(first.lines.map((l) => l.share)).toEqual([0.04, 0.03, 0.03]);
    });
});

describe('footerDiscountAllocator — helpers', () => {
    it('resolves the discount type like the backend', () => {
        expect(resolveFooterDiscountType('amount', 0, 0)).toBe('amount');
        expect(resolveFooterDiscountType('PERCENT', 0, 50)).toBe('percent');
        expect(resolveFooterDiscountType(null, 0, 50)).toBe('amount');
        expect(resolveFooterDiscountType(undefined, 10, 50)).toBe('percent');
        expect(resolveFooterDiscountType(null, 0, 0)).toBe('percent');
    });

    it('converts FOC into selling units', () => {
        expect(focInSellingUnit(2, 'PCS', 'PCS', {})).toBe(2);
        expect(focInSellingUnit(2, 'PCS', undefined, {})).toBe(2);
        expect(focInSellingUnit(1, 'PCS', 'BOX', { BOX: 12, PCS: 1 })).toBe(12);
        expect(focInSellingUnit(6, 'BOX', 'PCS', { BOX: 12, PCS: 1 })).toBe(0.5);
    });

    it('rounds item discount on the entered price (no VAT deflation)', () => {
        expect(computeLineBase({ qty: 1, price: 3500, discPercent: 20 })).toEqual({
            gross: 3500, focDeduction: 0, itemDiscount: 700, base: 2800,
        });
    });
});
