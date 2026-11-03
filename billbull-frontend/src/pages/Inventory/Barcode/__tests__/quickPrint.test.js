import { describe, it, expect, beforeEach } from 'vitest';
import { pickScanMatch, productBarcodeOptions, departmentOf, categoryOf } from '../quickPrintHelpers';
import {
    BARCODE_PRINT_SETTINGS_KEY,
    BULK_QTY_MODES,
    DEFAULT_BARCODE_PRINT_SETTINGS,
    PRINT_METHODS,
    clampCopies,
    initialBulkQty,
    loadBarcodePrintSettings,
    normalizeBarcodePrintSettings,
    preferredPrinterFor,
    saveBarcodePrintSettings,
} from '../barcodePrintSettings';

const mouse = {
    id: 1, name: 'Wireless Mouse', code: 'LOG-MX', sku: 'SKU-MX',
    packings: [
        { barcode: '111', unit: { name: 'BOX' } },
        { barcode: '222', isSale: true, unit: { name: 'PCS' } },
        { barcode: '222', unit: { name: 'PCS' } }, // duplicate barcode on another packing
        { barcode: '  ' },
    ],
};
const keyboard = { id: 2, name: 'Keyboard', code: 'KB-1', packings: [{ barcode: '333' }] };
const noBarcode = { id: 3, name: 'Service', code: 'SRV', packings: [] };

describe('productBarcodeOptions', () => {
    it('lists each barcode once, sale unit first, skipping blanks', () => {
        expect(productBarcodeOptions(mouse)).toEqual([
            { barcode: '222', unit: 'PCS' },
            { barcode: '111', unit: 'BOX' },
        ]);
        expect(productBarcodeOptions(noBarcode)).toEqual([]);
    });
});

describe('pickScanMatch', () => {
    it('prefers an exact barcode — including a non-sale packing — and flags it as a scan', () => {
        expect(pickScanMatch([keyboard, mouse], '111')).toEqual({
            product: mouse, barcode: '111', unit: 'BOX', exactBarcode: true,
        });
    });

    it('falls back to an exact code or SKU, using the sale barcode', () => {
        expect(pickScanMatch([keyboard, mouse], 'sku-mx')).toMatchObject({ product: mouse, barcode: '222', exactBarcode: false });
    });

    it('takes a lone search result', () => {
        expect(pickScanMatch([keyboard], 'keyb')).toMatchObject({ product: keyboard, barcode: '333', exactBarcode: false });
    });

    it('refuses to guess between several partial matches, or for an item with no barcode', () => {
        expect(pickScanMatch([keyboard, mouse], 'o')).toBeNull();
        expect(pickScanMatch([noBarcode], 'srv')).toBeNull();
        expect(pickScanMatch([], '111')).toBeNull();
        expect(pickScanMatch([mouse], '  ')).toBeNull();
    });
});

describe('classification readers', () => {
    it('read entity objects or plain names', () => {
        expect(departmentOf({ department: { name: 'Electronics' } })).toBe('Electronics');
        expect(departmentOf({ departmentName: 'Grocery' })).toBe('Grocery');
        expect(categoryOf({ category: 'Input Devices' })).toBe('Input Devices');
        expect(categoryOf({})).toBe('');
    });
});

describe('barcode print settings', () => {
    beforeEach(() => window.localStorage.clear());

    it('defaults when nothing (or garbage) is stored', () => {
        expect(loadBarcodePrintSettings()).toEqual(normalizeBarcodePrintSettings(DEFAULT_BARCODE_PRINT_SETTINGS));
        window.localStorage.setItem(BARCODE_PRINT_SETTINGS_KEY, '{not json');
        expect(loadBarcodePrintSettings().printMethod).toBe(PRINT_METHODS.ZEBRA);
    });

    it('round-trips and repairs invalid values', () => {
        saveBarcodePrintSettings({
            printMethod: 'fax', defaultCopies: '5000', bulkQtyMode: BULK_QTY_MODES.STOCK,
            autoPrintOnScan: true, printerByBranch: { 3: 9, 4: '' }, defaultTemplateId: 12,
        });
        const s = loadBarcodePrintSettings();
        expect(s.printMethod).toBe(PRINT_METHODS.ZEBRA);
        expect(s.defaultCopies).toBe(999);
        expect(s.bulkQtyMode).toBe(BULK_QTY_MODES.STOCK);
        expect(s.autoPrintOnScan).toBe(true);
        expect(s.printerByBranch).toEqual({ 3: 9 });
        expect(s.defaultTemplateId).toBe(12);
    });

    it('never picks a printer without a branch', () => {
        const s = normalizeBarcodePrintSettings({ printerByBranch: { 3: 9 } });
        expect(preferredPrinterFor(s, 3)).toBe(9);
        expect(preferredPrinterFor(s, '3')).toBe(9);
        expect(preferredPrinterFor(s, 'ALL')).toBeNull();
        expect(preferredPrinterFor(s, null)).toBeNull();
        expect(preferredPrinterFor(s, 4)).toBeNull();
    });

    it('starts bulk rows from the configured quantity', () => {
        expect(initialBulkQty(BULK_QTY_MODES.MANUAL, 10)).toBe(0);
        expect(initialBulkQty(BULK_QTY_MODES.ONE, 0)).toBe(1);
        expect(initialBulkQty(BULK_QTY_MODES.STOCK, 7.9)).toBe(7);
        expect(initialBulkQty(BULK_QTY_MODES.STOCK, -2)).toBe(0);
        expect(initialBulkQty(BULK_QTY_MODES.STOCK, null)).toBe(0);
    });

    it('clamps copies', () => {
        expect(clampCopies('abc')).toBe(1);
        expect(clampCopies(0)).toBe(1);
        expect(clampCopies(0, 0)).toBe(0);
        expect(clampCopies(12.7)).toBe(12);
    });
});
