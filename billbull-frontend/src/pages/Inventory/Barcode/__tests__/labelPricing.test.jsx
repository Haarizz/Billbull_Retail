import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { zplFieldData } from '@billbull/shared/utils/zplText';
import { buildZplBatch } from '../../../../utils/zebraZpl';
import {
    DEFAULT_PRICE_SOURCE,
    PRICE_SOURCE_FIELD,
    buildLabelPriceRequest,
    hasLabelPrice,
    labelPriceDisplay,
    labelPriceIdentity,
    labelPriceParamsKey,
    labelsWithoutPrice,
    missingPriceWarning,
    templatePriceSource,
    withPriceSource,
    zplPriceField,
} from '../labelPricing';
import useLabelPrices from '../useLabelPrices';
import LabelPricePanel from '../LabelPricePanel';

vi.mock('@billbull/shared/api/customerledgerApi', () => ({ searchCustomersAllFields: vi.fn() }));
vi.mock('../../../../api/barcodeTemplateApi', () => ({ resolveLabelPrices: vi.fn() }));
import { searchCustomersAllFields } from '@billbull/shared/api/customerledgerApi';

// Pricing Phase 4 — barcode label price selection, frontend side.

const piece = { product: { id: 10, code: 'A', name: 'Apple' }, barcode: 'A-PCS', productBarcode: 'A-PCS', unit: 'PCS', qty: 2 };
const box = { product: { id: 10, code: 'A', name: 'Apple' }, barcode: 'A-BOX', productBarcode: 'A-BOX', unit: 'BOX', qty: 1 };
const stockTake = { product: { id: 'stk-10-3', code: 'B', sku: 'B', name: 'Banana' }, barcode: 'B-PCS', unit: null, qty: 1 };

const SOURCES = [
    { key: 'DEFAULT', kind: 'DEFAULT', label: 'Retail (selling price)', supportsQuantityTiers: true },
    { key: 'LEVEL:2', kind: 'LEVEL', label: 'Wholesale', supportsQuantityTiers: true },
    { key: 'LEVEL:7', kind: 'LEVEL', label: 'VIP Gold', supportsQuantityTiers: true },
    { key: 'FIELD:WHOLESALE', kind: 'FIELD', label: 'Wholesale price', supportsQuantityTiers: false },
    { key: 'FIELD:MAX', kind: 'FIELD', label: 'Maximum price', supportsQuantityTiers: false },
    { key: 'CUSTOMER', kind: 'CUSTOMER', label: 'Customer-specific price', requiresCustomer: true, supportsQuantityTiers: false },
];

/** A fake server: prices by source, the request recorded. */
const fakeServer = (pricesBySource) => vi.fn(async (body) => ({
    source: body.source,
    sourceLabel: SOURCES.find((s) => s.key === body.source)?.label || body.source,
    branchId: body.branchId,
    branchName: body.branchId ? `Branch ${body.branchId}` : null,
    items: body.items.map((i) => {
        const price = pricesBySource[body.source]?.[i.barcode];
        return price == null
            ? { key: i.key, available: false, price: null, message: 'No price is set for this product.' }
            : { key: i.key, available: true, price, sourceLabel: body.source };
    }),
}));

describe('template price source', () => {
    it('defaults to the retail source for a template saved before Phase 4', () => {
        expect(templatePriceSource({ fields: { price: true, _contentScale: 0.9 } })).toBe(DEFAULT_PRICE_SOURCE);
        expect(templatePriceSource({ fields: '{"price":true}' })).toBe(DEFAULT_PRICE_SOURCE);
        expect(templatePriceSource(null)).toBe(DEFAULT_PRICE_SOURCE);
    });

    it('persists the chosen source next to the other template settings', () => {
        const fields = withPriceSource({ price: true, _contentScale: 0.9 }, 'LEVEL:7');
        expect(fields).toEqual({ price: true, _contentScale: 0.9, [PRICE_SOURCE_FIELD]: 'LEVEL:7' });
        const saved = JSON.stringify(fields);
        expect(templatePriceSource({ fields: saved })).toBe('LEVEL:7');
    });
});

describe('request building', () => {
    it('sends identity only (never a price) and only real product ids', () => {
        const body = buildLabelPriceRequest(
            [{ ...piece, product: { ...piece.product, price: 99, retailPrice: 99, unitCost: 4 } }, stockTake, piece],
            { source: 'LEVEL:2', branchId: '3', pricingQuantity: '' },
        );
        expect(body).toEqual({
            source: 'LEVEL:2', branchId: 3, customerId: null, pricingQuantity: null,
            items: [
                { key: labelPriceIdentity(piece), productId: 10, itemCode: 'A', barcode: 'A-PCS', unit: 'PCS' },
                { key: labelPriceIdentity(stockTake), productId: null, itemCode: 'B', barcode: 'B-PCS', unit: null },
            ],
        });
        expect(JSON.stringify(body)).not.toMatch(/price"?:\s*99|unitCost/);
    });

    it('sends the customer only for the customer source and keeps the pricing quantity', () => {
        expect(buildLabelPriceRequest([piece], { source: 'DEFAULT', customerId: 5 }).customerId).toBeNull();
        const body = buildLabelPriceRequest([piece], { source: 'CUSTOMER', customerId: 5, pricingQuantity: '20' });
        expect(body.customerId).toBe(5);
        expect(body.pricingQuantity).toBe(20);
    });

    it('keys the cache by every setting that changes a price', () => {
        const base = labelPriceParamsKey({ source: 'LEVEL:2', branchId: 1 });
        expect(labelPriceParamsKey({ source: 'LEVEL:2', branchId: 2 })).not.toBe(base);
        expect(labelPriceParamsKey({ source: 'LEVEL:7', branchId: 1 })).not.toBe(base);
        expect(labelPriceParamsKey({ source: 'LEVEL:2', branchId: 1, pricingQuantity: 20 })).not.toBe(base);
        expect(labelPriceParamsKey({ source: 'CUSTOMER', customerId: 1 })).not.toBe(labelPriceParamsKey({ source: 'CUSTOMER', customerId: 2 }));
        expect(labelPriceIdentity(piece)).not.toBe(labelPriceIdentity(box));
    });
});

describe('HTML and ZPL print the same resolved value', () => {
    it('builds both renderers from one display', () => {
        const result = { available: true, price: 1234.5 };
        const html = labelPriceDisplay(result, { currencyCode: 'AED' });
        const zpl = zplPriceField(result, { enabled: true, currencyCode: 'AED' });

        expect(html.status).toBe('ok');
        expect(html.amount).toBe('1,234.50');
        expect(zpl).toEqual({ type: 'text', id: 'price', enabled: true, value: 'AED 1,234.50' });

        const out = buildZplBatch([{ labelWidthMm: 50, labelHeightMm: 30, fields: [zpl] }]);
        expect(out).toContain(zplFieldData('AED 1,234.50'));
        render(<div data-testid="html">{html.amount}</div>);
        expect(zpl.value.endsWith(screen.getByTestId('html').textContent)).toBe(true);
    });

    it('prints no price at all — not 0.00, not cost — when the source has none', () => {
        for (const result of [{ available: false, price: null }, { available: true, price: null }, null]) {
            const html = labelPriceDisplay(result, { currencyCode: 'AED' });
            const zpl = zplPriceField(result, { enabled: true, currencyCode: 'AED' });
            expect(html.status).toBe('unavailable');
            expect(html.amount).toBe('');
            expect(zpl.enabled).toBe(false);
            expect(zpl.value).toBe('');
        }
        expect(labelPriceDisplay(undefined).status).toBe('pending');
        expect(zplPriceField({ available: true, price: 5 }, { enabled: false }).enabled).toBe(false);
    });

    it('lists and warns about labels without a price', () => {
        const results = new Map([[labelPriceIdentity(piece), { available: true, price: 3 }], [labelPriceIdentity(box), { available: false }]]);
        const missing = labelsWithoutPrice([piece, box], (i) => results.get(labelPriceIdentity(i)));
        expect(missing.map((m) => m.item)).toEqual([box]);
        expect(missingPriceWarning(missing, 'VIP Gold')).toMatch(/no VIP Gold price[\s\S]*No other price is substituted/);
        expect(hasLabelPrice({ available: true, price: 0.5 })).toBe(true);
    });
});

describe('useLabelPrices', () => {
    it('serves preview and print from one resolution: print does not re-price', async () => {
        const resolve = fakeServer({ 'LEVEL:2': { 'A-PCS': 27, 'A-BOX': 324 } });
        const { result } = renderHook(() => useLabelPrices({ resolve }));
        const params = { source: 'LEVEL:2', branchId: 1 };

        expect(result.current.lookup(piece, params)).toBeUndefined(); // loading
        await waitFor(() => expect(result.current.lookup(piece, params)?.price).toBe(27));
        expect(resolve).toHaveBeenCalledTimes(1);

        let printed;
        await act(async () => { printed = await result.current.ensure([piece, box], params); });
        expect(printed.resultFor(piece)).toBe(result.current.lookup(piece, params)); // the very same object
        expect(printed.resultFor(box).price).toBe(324);
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(resolve.mock.calls[1][0].items.map((i) => i.barcode)).toEqual(['A-BOX']); // only the miss
    });

    it('re-resolves when the source, branch or quantity changes', async () => {
        const resolve = fakeServer({ 'LEVEL:2': { 'A-PCS': 27 }, 'LEVEL:7': { 'A-PCS': 26 }, 'FIELD:MAX': {} });
        const { result } = renderHook(() => useLabelPrices({ resolve }));

        let a; let b; let c;
        await act(async () => {
            a = await result.current.ensure([piece], { source: 'LEVEL:2' });
            b = await result.current.ensure([piece], { source: 'LEVEL:7' });
            c = await result.current.ensure([piece], { source: 'FIELD:MAX' });
        });
        expect(a.resultFor(piece).price).toBe(27);
        expect(b.resultFor(piece).price).toBe(26);
        expect(c.resultFor(piece).available).toBe(false);
        expect(c.meta.sourceLabel).toBe('Maximum price');
        expect(resolve).toHaveBeenCalledTimes(3);
    });

    it('reports a failed request as unavailable and retries on the next print', async () => {
        const resolve = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockImplementation(fakeServer({ DEFAULT: { 'A-PCS': 30 } }));
        const { result } = renderHook(() => useLabelPrices({ resolve }));

        let first; let second;
        await act(async () => { first = await result.current.ensure([piece], { source: 'DEFAULT' }); });
        expect(first.resultFor(piece).available).toBe(false);
        expect(first.meta.sourceError).toMatch(/offline/);
        await act(async () => { second = await result.current.ensure([piece], { source: 'DEFAULT' }); });
        expect(second.resultFor(piece).price).toBe(30);
    });
});

describe('LabelPricePanel', () => {
    const baseValue = { sourceOverride: null, branchId: undefined, customer: null, pricingQuantity: '' };

    function Harness({ initial = baseValue, meta = null, summary = null, canSwitchBranches = true, templateSource = 'DEFAULT', onChangeSpy }) {
        const [value, setValue] = React.useState(initial);
        return (
            <LabelPricePanel
                sources={SOURCES}
                templateName="Retail 90x50"
                templateSource={templateSource}
                value={value}
                onChange={(v) => { onChangeSpy?.(v); setValue(v); }}
                branches={[{ id: 1, name: 'Dubai' }, { id: 2, name: 'Sharjah' }]}
                canSwitchBranches={canSwitchBranches}
                activeBranchName="Dubai"
                meta={meta}
                summary={summary}
            />
        );
    }

    beforeEach(() => searchCustomersAllFields.mockReset());

    it('offers every configured source — including levels users created — and the template default', () => {
        render(<Harness templateSource="LEVEL:7" />);
        const select = screen.getByLabelText('Label price source');
        const options = [...select.querySelectorAll('option')].map((o) => o.textContent);
        expect(options[0]).toBe('Template default — VIP Gold (Retail 90x50)');
        expect(options).toEqual(expect.arrayContaining(['Wholesale', 'VIP Gold', 'Wholesale price', 'Maximum price', 'Customer-specific price']));
    });

    it('selects a branch, and shows a fixed branch to users who cannot switch', async () => {
        const spy = vi.fn();
        const { unmount } = render(<Harness onChangeSpy={spy} />);
        await userEvent.selectOptions(screen.getByLabelText('Label price branch'), '2');
        expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: 2 }));
        unmount();
        render(<Harness canSwitchBranches={false} />);
        expect(screen.getByLabelText('Label price branch').tagName).toBe('DIV');
        expect(screen.getByLabelText('Label price branch')).toHaveTextContent('Dubai');
    });

    it('asks for a customer only for customer-specific labels', async () => {
        searchCustomersAllFields.mockResolvedValue([{ id: 501, name: 'ABC Trading', code: 'ABC' }]);
        const spy = vi.fn();
        render(<Harness onChangeSpy={spy} />);
        expect(screen.queryByLabelText('Search customer for label prices')).toBeNull();

        await userEvent.selectOptions(screen.getByLabelText('Label price source'), 'CUSTOMER');
        await userEvent.type(screen.getByLabelText('Search customer for label prices'), 'ABC');
        await userEvent.click(await screen.findByText('ABC Trading'));
        expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sourceOverride: 'CUSTOMER', customer: { id: 501, name: 'ABC Trading', code: 'ABC' } }));
        expect(screen.getByTestId('label-customer')).toHaveTextContent('ABC Trading');
    });

    it('takes a pricing quantity for price levels and disables it for fixed fields', async () => {
        const spy = vi.fn();
        render(<Harness onChangeSpy={spy} />);
        expect(screen.getByTestId('label-price-status')).toHaveTextContent('No quantity tier applies until a pricing quantity is entered');
        await userEvent.type(screen.getByLabelText('Pricing quantity'), '20');
        expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ pricingQuantity: '20' }));
        expect(screen.getByTestId('label-price-status')).toHaveTextContent('priced for 20 per label unit');

        await userEvent.selectOptions(screen.getByLabelText('Label price source'), 'FIELD:MAX');
        expect(screen.getByLabelText('Pricing quantity')).toBeDisabled();
    });

    it('shows what is being printed and which labels have no price', () => {
        render(<Harness
            meta={{ sourceLabel: 'VIP Gold', branchName: 'Dubai', notice: null, sourceError: null }}
            summary={{ total: 3, priced: 2, missing: 1, pending: 0 }}
        />);
        const status = screen.getByTestId('label-price-status');
        expect(status).toHaveTextContent('Printing VIP Gold · Dubai');
        expect(status).toHaveTextContent('2 of 3 queued item(s) priced');
        expect(status).toHaveTextContent('1 without a VIP Gold price');
    });

    it('surfaces an unusable source', () => {
        render(<Harness meta={{ sourceLabel: 'Old list', sourceError: "Price level 'Old list' is inactive. Choose another price source." }} />);
        expect(screen.getByRole('alert')).toHaveTextContent('inactive');
    });
});
