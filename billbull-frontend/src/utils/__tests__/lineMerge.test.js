import { describe, expect, it } from 'vitest';
import { canStackOnLine, findStackableLine, addQtyToLine } from '../lineMerge';

const line = (over = {}) => ({
    id: 1,
    code: '10593',
    productId: 77,
    unit: 'PCS',
    qty: 1,
    price: 4000,
    disc: 20,
    tax: 5,
    warehouseId: 3,
    priceLevelAuto: true,
    batchSelections: [],
    ...over,
});

describe('canStackOnLine', () => {
    it('stacks a repeat add of the same item on the price level', () => {
        expect(canStackOnLine(line(), line({ id: 2 }))).toBe(true);
    });

    it('stacks onto a line whose batches are already picked (different batch/serial goes on the same line)', () => {
        const existing = line({ batchSelections: [{ batchNumber: 'ST-201126-L01-10593-1', quantity: 1 }] });
        expect(canStackOnLine(existing, line({ id: 2 }))).toBe(true);
    });

    it('matches item codes case- and space-insensitively and tolerates a saved line without productId', () => {
        expect(canStackOnLine(line({ code: ' ab-1 ', productId: null }), line({ id: 2, code: 'AB-1' }))).toBe(true);
    });

    it.each([
        ['another item', { code: '10594' }],
        ['a different productId', { productId: 78 }],
        ['another unit', { unit: 'BOX' }],
        ['another warehouse', { warehouseId: 4 }],
        ['another tax rate', { tax: 0 }],
        ['another discount', { disc: 10 }],
    ])('keeps a separate row for %s', (_label, diff) => {
        expect(canStackOnLine(line(), line({ id: 2, ...diff }))).toBe(false);
    });

    it('never stacks onto a hand-priced line from a price-level add, or onto voided / Sales Order lines', () => {
        expect(canStackOnLine(line({ priceOverridden: true }), line({ id: 2 }))).toBe(false);
        expect(canStackOnLine(line({ voided: true }), line({ id: 2 }))).toBe(false);
        expect(canStackOnLine(line({ salesOrderItemId: 9 }), line({ id: 2 }))).toBe(false);
    });

    it('stacks fixed-price lines only when the prices match', () => {
        const fixed = { priceLevelAuto: false };
        expect(canStackOnLine(line(fixed), line({ id: 2, ...fixed }))).toBe(true);
        expect(canStackOnLine(line(fixed), line({ id: 2, ...fixed, price: 3900 }))).toBe(false);
        expect(canStackOnLine(line({ priceLevelAuto: false, price: '4000.00' }), line({ id: 2, ...fixed }))).toBe(true);
    });
});

describe('findStackableLine / addQtyToLine', () => {
    it('finds the first stackable line and skips blank rows', () => {
        const items = [{ id: 0, code: '', name: '' }, line({ id: 5, unit: 'BOX' }), line({ id: 6 })];
        expect(findStackableLine(items, line({ id: 9 }))?.id).toBe(6);
        expect(findStackableLine(items, line({ id: 9, code: 'X' }))).toBeNull();
        expect(findStackableLine(undefined, line())).toBeNull();
    });

    it('adds the quantity to that line only, without float drift', () => {
        const items = [line({ id: 1, qty: 0.1 }), line({ id: 2, qty: 3 })];
        const next = addQtyToLine(items, 1, 0.2);
        expect(next[0].qty).toBe(0.3);
        expect(next[1]).toBe(items[1]);
        expect(items[0].qty).toBe(0.1);
    });
});
