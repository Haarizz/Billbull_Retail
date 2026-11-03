/**
 * Barcode Print → Print Settings.
 *
 * Kept per browser (localStorage), not on the server: label printers are physical hardware next
 * to a particular PC, so "which printer and how do I print" belongs to the machine doing it.
 * Storage can be unavailable (private window, blocked site data); every read falls back to the
 * defaults and every write is best-effort.
 */

export const BARCODE_PRINT_SETTINGS_KEY = 'billbull.barcodePrint.settings';

export const PRINT_METHODS = {
    ZEBRA: 'zebra',     // ZPL straight to the label printer (agent or network)
    BROWSER: 'browser', // the browser's print dialog, any printer
};

export const BULK_QTY_MODES = {
    MANUAL: 'manual', // start every row at 0 and let the user pick
    ONE: 'one',       // one label per item
    STOCK: 'stock',   // one label per unit in stock
};

export const DEFAULT_BARCODE_PRINT_SETTINGS = Object.freeze({
    defaultTemplateId: null,          // null = whatever template is selected on the page
    printMethod: PRINT_METHODS.ZEBRA,
    printerByBranch: {},              // { [branchId]: printerId } — null/absent = branch default
    defaultCopies: 1,
    bulkQtyMode: BULK_QTY_MODES.MANUAL,
    autoPrintOnScan: false,           // exact barcode scan in Quick Print prints straight away
    confirmLargeJobs: true,           // ask before printing more than LARGE_JOB_LABELS labels
});

export const LARGE_JOB_LABELS = 100;
export const MAX_COPIES = 999;

export const clampCopies = (value, min = 1) => {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.min(MAX_COPIES, Math.max(min, n));
};

const pickEnum = (value, enumObj, fallback) => (
    Object.values(enumObj).includes(value) ? value : fallback
);

/** Coerces anything (old shape, hand-edited JSON, null) into a complete, valid settings object. */
export const normalizeBarcodePrintSettings = (raw) => {
    const src = raw && typeof raw === 'object' ? raw : {};
    const d = DEFAULT_BARCODE_PRINT_SETTINGS;
    const printerByBranch = {};
    if (src.printerByBranch && typeof src.printerByBranch === 'object') {
        Object.entries(src.printerByBranch).forEach(([branchId, printerId]) => {
            if (printerId != null && printerId !== '') printerByBranch[branchId] = printerId;
        });
    }
    return {
        defaultTemplateId: src.defaultTemplateId != null && src.defaultTemplateId !== '' ? src.defaultTemplateId : d.defaultTemplateId,
        printMethod: pickEnum(src.printMethod, PRINT_METHODS, d.printMethod),
        printerByBranch,
        defaultCopies: clampCopies(src.defaultCopies ?? d.defaultCopies),
        bulkQtyMode: pickEnum(src.bulkQtyMode, BULK_QTY_MODES, d.bulkQtyMode),
        autoPrintOnScan: typeof src.autoPrintOnScan === 'boolean' ? src.autoPrintOnScan : d.autoPrintOnScan,
        confirmLargeJobs: typeof src.confirmLargeJobs === 'boolean' ? src.confirmLargeJobs : d.confirmLargeJobs,
    };
};

export const loadBarcodePrintSettings = () => {
    try {
        const raw = window.localStorage.getItem(BARCODE_PRINT_SETTINGS_KEY);
        return normalizeBarcodePrintSettings(raw ? JSON.parse(raw) : null);
    } catch {
        return normalizeBarcodePrintSettings(null);
    }
};

export const saveBarcodePrintSettings = (settings) => {
    const normalized = normalizeBarcodePrintSettings(settings);
    try {
        window.localStorage.setItem(BARCODE_PRINT_SETTINGS_KEY, JSON.stringify(normalized));
    } catch {
        // Storage blocked: the settings still apply for this visit.
    }
    return normalized;
};

/** The printer picked for a branch, or null to use the branch default. */
export const preferredPrinterFor = (settings, branchId) => (
    branchId == null || branchId === 'ALL' ? null : (settings?.printerByBranch?.[String(branchId)] ?? null)
);

/** Starting label count for a bulk row, from the setting and the item's stock. */
export const initialBulkQty = (mode, stock) => {
    if (mode === BULK_QTY_MODES.ONE) return 1;
    if (mode === BULK_QTY_MODES.STOCK) {
        const n = Math.floor(Number(stock));
        return Number.isFinite(n) && n > 0 ? Math.min(MAX_COPIES, n) : 0;
    }
    return 0;
};
