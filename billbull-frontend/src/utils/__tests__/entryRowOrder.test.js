import { describe, expect, it } from 'vitest';
import {
    entryRowAttrs,
    findOpenEntryRow,
    placeEntryLine,
    isBlankByCodeDesc,
    isBlankByCodeName,
    orderRowsForEntryDisplay,
} from '../entryRowOrder';

const line = (id, code) => ({ id, code, name: code ? `N-${code}` : '', desc: code ? `D-${code}` : '' });

describe('orderRowsForEntryDisplay', () => {
    it('pins the blank search row on top and numbers filled lines 1..N in entry order', () => {
        const rows = orderRowsForEntryDisplay([line(1, 'A'), line(2, 'B'), line(3, '')]);
        expect(rows.map((r) => [r.item.id, r.rowNo, r.blank])).toEqual([
            [3, 3, true],
            [1, 1, false],
            [2, 2, false],
        ]);
    });

    it('keeps the source index so the items array order is untouched', () => {
        const items = [line(1, ''), line(2, 'A')];
        expect(orderRowsForEntryDisplay(items).map((r) => r.sourceIndex)).toEqual([0, 1]);
        expect(items.map((i) => i.id)).toEqual([1, 2]);
    });

    it('numbers a lone blank row 1 and copes with no items', () => {
        expect(orderRowsForEntryDisplay([line(9, '')])[0].rowNo).toBe(1);
        expect(orderRowsForEntryDisplay(undefined)).toEqual([]);
    });

    it('uses the page-specific blank test', () => {
        const nameOnly = { id: 1, code: '', name: 'Typed', desc: '' };
        expect(orderRowsForEntryDisplay([nameOnly], isBlankByCodeDesc)[0].blank).toBe(true);
        expect(orderRowsForEntryDisplay([nameOnly], isBlankByCodeName)[0].blank).toBe(false);
    });
});

describe('placeEntryLine / findOpenEntryRow', () => {
    it('fills the open search row instead of appending past it', () => {
        const next = placeEntryLine([line(1, 'A'), line(2, '')], line(3, 'B'));
        expect(next.map((i) => i.id)).toEqual([1, 3]);
    });

    it('prefers the row the user typed in, and appends when no row is open', () => {
        expect(placeEntryLine([line(1, ''), line(2, '')], line(3, 'B'), undefined, 2).map((i) => i.id)).toEqual([1, 3]);
        expect(placeEntryLine([line(1, 'A')], line(3, 'B')).map((i) => i.id)).toEqual([1, 3]);
    });

    it('finds the open search row', () => {
        expect(findOpenEntryRow([line(1, 'A'), line(2, '')]).id).toBe(2);
        expect(findOpenEntryRow([line(1, 'A')])).toBeNull();
    });

    it('pins only the first of several empty rows', () => {
        const rows = orderRowsForEntryDisplay([line(1, 'A'), line(2, ''), line(3, '')]);
        expect(rows.map((r) => r.blank)).toEqual([true, false, false]);
    });
});

describe('entryRowAttrs', () => {
    it('makes only the blank row sticky under the header', () => {
        expect(entryRowAttrs({ item: { id: 7 }, blank: true })).toMatchObject({
            'data-entry-row-id': '7',
            style: { position: 'sticky', top: 'var(--bb-entry-head-h, 0px)' },
        });
        expect(entryRowAttrs({ item: { id: 8 }, blank: false }).style).toBeUndefined();
    });
});
