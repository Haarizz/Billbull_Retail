import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemDescriptionCell } from '../ItemDescriptionCell';
import { summarizeSalesItems, makeFooterDiscount } from '../../utils/documentSummaryUtils';

const row = { id: 1, code: 'A', desc: '1000 GLN WATER TANK', qty: 1, price: 3500, disc: 20, tax: 5, taxAmt: 140, unit: 'PCS' };

describe('ItemDescriptionCell — footer discount at line level', () => {
    it('shows Gross / Item Disc. / Footer Disc. / Taxable / VAT for the line', () => {
        const summary = summarizeSalesItems([row, { ...row, id: 2, price: 200, disc: 10, tax: 20 }],
            makeFooterDiscount('amount', 100), {}, 'EXCLUSIVE');

        render(<ItemDescriptionCell item={row} footerAllocation={summary.lines[0]} showFooterBreakdown onToggleExpand={() => {}} />);

        const breakdown = screen.getByTestId('footer-discount-breakdown');
        expect(breakdown).toHaveTextContent('Gross 3,500.00');
        expect(breakdown).toHaveTextContent('Item Disc. −700.00');
        expect(breakdown).toHaveTextContent('Footer Disc. −93.96');
        expect(breakdown).toHaveTextContent('Taxable 2,706.04');
        expect(breakdown).toHaveTextContent('VAT 135.30');
        // The tax chip shows post-footer VAT and the item discount is labelled distinctly.
        expect(screen.getByText(/Tax 5%/)).toHaveTextContent('(135.30)');
        expect(screen.getByText(/Item Disc\. 20%/)).toBeInTheDocument();
    });

    it('renders nothing extra when the document has no footer discount (and for non-sales callers)', () => {
        render(<ItemDescriptionCell item={row} onToggleExpand={() => {}} />);
        expect(screen.queryByTestId('footer-discount-breakdown')).toBeNull();
        expect(screen.getByText(/Disc 20%/)).toBeInTheDocument();
        expect(screen.getByText(/Tax 5%/)).toHaveTextContent('(140.00)');
    });
});
