import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { zplFieldData } from '@billbull/shared/utils/zplText';

// Pricing Phase 4 — the barcode page end to end in the browser: the queue, the preview and the
// Zebra output show the server-resolved price of the chosen source, and a template stores it.

vi.mock('@billbull/shared/api/productsApi', () => ({
    searchExactProducts: vi.fn(),
    getProductsByClassification: vi.fn(async () => ({ content: [], totalElements: 0 })),
}));
vi.mock('../../../../api/lpoApi', () => ({ getLpos: vi.fn(async () => []) }));
vi.mock('../../../../api/purchaseInvoiceApi', () => ({ getPostedPurchaseInvoices: vi.fn(async () => []) }));
vi.mock('../../../../api/vendorsApi', () => ({ getVendors: vi.fn(async () => []) }));
vi.mock('../../../../api/stockTakeApi', () => ({ getStockTakeSessions: vi.fn(async () => []), getStockTakeSession: vi.fn() }));
vi.mock('../../../../api/barcodeTemplateApi', () => ({
    getBarcodeTemplates: vi.fn(),
    createBarcodeTemplate: vi.fn(),
    updateBarcodeTemplate: vi.fn(),
    deleteBarcodeTemplate: vi.fn(),
    getLabelPriceSources: vi.fn(),
    resolveLabelPrices: vi.fn(),
}));
vi.mock('../../../../utils/labelPrinterTransport', () => {
    class LabelPrinterError extends Error {}
    return {
        LabelPrinterError,
        resolveLabelPrinter: vi.fn(async () => ({ id: 1, name: 'Zebra' })),
        sendZplToLabelPrinter: vi.fn(async () => ({ transport: 'test', target: 'Zebra' })),
        listLabelPrinters: vi.fn(async () => []),
    };
});
vi.mock('@billbull/shared/context/CompanyContext', () => ({
    useCompany: () => ({ company: { companyName: 'Test Co', currency: 'USD', currencySymbol: 'USD' } }),
}));
vi.mock('@billbull/shared/context/BranchContext', () => ({
    useBranch: () => ({
        activeBranchId: 1,
        activeBranch: { id: 1, name: 'Dubai' },
        branches: [{ id: 1, name: 'Dubai' }, { id: 2, name: 'Sharjah' }],
        canSwitchBranches: true,
    }),
}));
vi.mock('jsbarcode', () => ({ default: vi.fn() }));

import { searchExactProducts } from '@billbull/shared/api/productsApi';
import {
    createBarcodeTemplate, getBarcodeTemplates, getLabelPriceSources, resolveLabelPrices,
} from '../../../../api/barcodeTemplateApi';
import { sendZplToLabelPrinter } from '../../../../utils/labelPrinterTransport';
import BarcodePrinter from '../BarcodePrinter';

const TEMPLATE = {
    id: 41, name: 'Shelf 50x30', width: 50, height: 30, type: 'Roll', perPage: 1, barcodeFormat: 'CODE128',
    isSystem: true, systemKey: 'shelf',
    fields: JSON.stringify({ barcode: true, name: true, price: true, _priceSource: 'LEVEL:7' }),
};
const OLD_TEMPLATE = { ...TEMPLATE, id: 42, name: 'Old 40x25', systemKey: 'old', fields: JSON.stringify({ barcode: true, name: true, price: true }) };

// Retail 30 (aggregate) — the label must NOT show it for the VIP source.
const AGGREGATE = {
    product: { id: 10, code: 'A', name: 'Apple Juice', isActive: true },
    pricing: { id: 900, retailPrice: 30, cost: 4 },
    inventory: { packings: [{ barcode: 'A-PCS', isSale: true, unit: { name: 'PCS' } }, { barcode: 'A-BOX', unit: { name: 'BOX' } }] },
};

const PRICES = {
    'LEVEL:7': { 'A-PCS': 26.5 },
    DEFAULT: { 'A-PCS': 30, 'A-BOX': 300 },
    'FIELD:MAX': {},
};

beforeEach(() => {
    vi.clearAllMocks();
    getBarcodeTemplates.mockResolvedValue([TEMPLATE, OLD_TEMPLATE]);
    getLabelPriceSources.mockResolvedValue([
        { key: 'DEFAULT', label: 'Retail (selling price)', supportsQuantityTiers: true },
        { key: 'LEVEL:7', label: 'VIP', supportsQuantityTiers: true },
        { key: 'FIELD:MAX', label: 'Maximum price', supportsQuantityTiers: false },
    ]);
    resolveLabelPrices.mockImplementation(async (body) => ({
        source: body.source,
        sourceLabel: { DEFAULT: 'Retail (selling price)', 'LEVEL:7': 'VIP', 'FIELD:MAX': 'Maximum price' }[body.source],
        branchId: body.branchId,
        branchName: body.branchId === 2 ? 'Sharjah' : 'Dubai',
        items: body.items.map((i) => {
            const price = PRICES[body.source]?.[i.barcode];
            return price == null
                ? { key: i.key, available: false, price: null, message: 'No maximum price is set for this product.' }
                : { key: i.key, available: true, price, sourceLabel: body.source === 'LEVEL:7' ? 'VIP' : 'Retail' };
        }),
    }));
    searchExactProducts.mockResolvedValue([AGGREGATE]);
    window.alert = vi.fn();
});

const renderPage = () => render(<MemoryRouter><BarcodePrinter /></MemoryRouter>);

async function addApple(barcodeTerm = 'Apple') {
    await userEvent.type(screen.getByPlaceholderText('Search by product code, name, or barcode...'), barcodeTerm);
    const row = await screen.findByText('Apple Juice', {}, { timeout: 3000 });
    row.closest('div[class*="cursor-pointer"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

describe('BarcodePrinter label prices', () => {
    it('prices the queue, preview and Zebra output from the template source, never the retail field', async () => {
        renderPage();
        await screen.findByText('Shelf 50x30');
        await userEvent.click(screen.getByText('Shelf 50x30'));
        await addApple();

        const queuePrice = await screen.findByTestId('queue-label-price');
        await waitFor(() => expect(queuePrice).toHaveTextContent('26.50'));
        expect(queuePrice).toHaveTextContent('VIP');
        const preview = document.querySelector('[data-label-price]');
        expect(preview.getAttribute('data-label-price')).toBe('26.50');
        expect(screen.getByTestId('label-price-status')).toHaveTextContent('Printing VIP · Dubai');

        // The request carried identity only, on the active branch.
        const body = resolveLabelPrices.mock.calls[0][0];
        expect(body).toMatchObject({ source: 'LEVEL:7', branchId: 1, items: [{ productId: 10, itemCode: 'A', barcode: 'A-PCS' }] });

        await userEvent.click(screen.getByText('Print to Zebra'));
        await waitFor(() => expect(sendZplToLabelPrinter).toHaveBeenCalled());
        const zpl = sendZplToLabelPrinter.mock.calls[0][1];
        expect(zpl).toContain(zplFieldData('USD 26.50'));
        expect(zpl).not.toContain(zplFieldData('USD 30.00'));
        // Print reused the preview's resolution.
        expect(resolveLabelPrices).toHaveBeenCalledTimes(1);
    });

    it('keeps an existing template without a stored source on the retail price', async () => {
        renderPage();
        await screen.findByText('Old 40x25');
        await userEvent.click(screen.getByText('Old 40x25'));
        await addApple();
        await waitFor(() => expect(screen.getByTestId('queue-label-price')).toHaveTextContent('30.00'));
        expect(resolveLabelPrices.mock.calls.at(-1)[0].source).toBe('DEFAULT');
    });

    it('shows a missing price as unavailable and asks before printing labels without it', async () => {
        window.confirm = vi.fn(() => false);
        renderPage();
        await screen.findByText('Shelf 50x30');
        await userEvent.click(screen.getByText('Shelf 50x30'));
        await addApple();
        await userEvent.selectOptions(screen.getByLabelText('Label price source'), 'FIELD:MAX');

        await waitFor(() => expect(screen.getByTestId('queue-label-price')).toHaveTextContent('No price: No maximum price'));
        expect(document.querySelector('[data-label-price-status="unavailable"]')).not.toBeNull();
        expect(document.querySelector('[data-label-price]')).toBeNull();
        expect(screen.getByTestId('label-price-status')).toHaveTextContent('1 without a Maximum price price');

        await userEvent.click(screen.getByText('Print to Zebra'));
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).toMatch(/No other price is substituted/);
        expect(sendZplToLabelPrinter).not.toHaveBeenCalled();
    });

    it('re-prices for another branch', async () => {
        renderPage();
        await screen.findByText('Shelf 50x30');
        await userEvent.click(screen.getByText('Shelf 50x30'));
        await addApple();
        await waitFor(() => expect(screen.getByTestId('queue-label-price')).toHaveTextContent('26.50'));
        await userEvent.selectOptions(screen.getByLabelText('Label price branch'), '2');
        await waitFor(() => expect(resolveLabelPrices.mock.calls.at(-1)[0].branchId).toBe(2));
    });

    it('stores the chosen price source in a new template', async () => {
        createBarcodeTemplate.mockResolvedValue({ id: 99 });
        renderPage();
        await screen.findByText('Shelf 50x30');
        await userEvent.click(screen.getByText('New Template'));
        const select = await screen.findByLabelText('Template price source');
        await waitFor(() => expect(within(select).getByText('VIP')).toBeTruthy());
        await userEvent.selectOptions(select, 'LEVEL:7');
        await userEvent.click(screen.getByText('Save Template'));

        await waitFor(() => expect(createBarcodeTemplate).toHaveBeenCalled());
        const fields = JSON.parse(createBarcodeTemplate.mock.calls[0][0].fields);
        expect(fields._priceSource).toBe('LEVEL:7');
        expect(fields._contentScale).toBeDefined();
    });
});
