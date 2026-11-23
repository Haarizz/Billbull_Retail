import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import useEntryRowTable from '../useEntryRowTable';
import { entryRowAttrs, orderRowsForEntryDisplay } from '../../utils/entryRowOrder';

// jsdom has no layout: give every row a fixed height and stack them.
const HEAD_H = 40;
const ROW_H = 100;
const BLANK_H = 50;

function layout() {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height() {
        if (this.tagName === 'THEAD') return HEAD_H;
        if (this.tagName === 'TR') return this.style.position === 'sticky' ? BLANK_H : ROW_H;
        return 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        if (this.tagName !== 'TR') return { top: 0, bottom: 300, height: 300 };
        let top = HEAD_H;
        for (let el = this.parentElement.firstElementChild; el !== this; el = el.nextElementSibling) {
            top += el.offsetHeight;
        }
        return { top, bottom: top + this.offsetHeight, height: this.offsetHeight };
    });
}

const Table = ({ items }) => {
    const ref = useEntryRowTable(items);
    return (
        <div ref={ref} data-testid="box" className="overflow-auto">
            <table>
                <thead><tr><th>#</th></tr></thead>
                <tbody>
                    {orderRowsForEntryDisplay(items).map(({ item, rowNo, blank }) => (
                        <tr key={item.id} {...entryRowAttrs({ item, blank })}><td>{rowNo}</td></tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const filled = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, code: `C${i + 1}` }));
const blank = { id: 99, code: '' };

afterEach(() => vi.restoreAllMocks());

describe('useEntryRowTable', () => {
    it('leaves the box at its CSS height with three lines or fewer', () => {
        layout();
        const { getByTestId } = render(<Table items={[...filled(3), blank]} />);
        expect(getByTestId('box').style.maxHeight).toBe('');
    });

    it('caps the box at header + search row + 3 lines + a peek once a 4th line exists', () => {
        layout();
        const { getByTestId } = render(<Table items={[...filled(4), blank]} />);
        const box = getByTestId('box');
        expect(box.style.maxHeight).toBe(`${HEAD_H + BLANK_H + 3 * ROW_H + 28}px`);
        expect(box.style.minHeight).toBe('0px');
        expect(box.style.getPropertyValue('--bb-entry-head-h')).toBe(`${HEAD_H}px`);
    });

    it('scrolls a line filled from the search row into view, but not on a fresh load', () => {
        layout();
        const { getByTestId, rerender } = render(<Table items={[...filled(4), blank]} />);
        const box = getByTestId('box');
        expect(box.scrollTop).toBe(0);

        // fast entry fills the blank row (same id) and a new blank row is added
        rerender(<Table items={[...filled(4), { id: 99, code: 'NEW' }, { id: 100, code: '' }]} />);
        expect(box.scrollTop).toBeGreaterThan(0);

        box.scrollTop = 0;
        rerender(<Table items={[{ id: 500, code: 'A' }, { id: 501, code: 'B' }, { id: 502, code: 'C' }, { id: 503, code: 'D' }, { id: 504, code: 'E' }]} />);
        expect(box.scrollTop).toBe(0);
    });
});
