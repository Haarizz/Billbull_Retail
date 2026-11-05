/**
 * Barcode Print → Label Printers: the rules for creating and editing a branch's ZPL label
 * printers from the barcode page, so a back-office user never has to open the POS console.
 *
 * These are the same PosPrinter rows POS → Devices manages (deviceType LABEL_PRINTER); this file
 * only shapes them. Label printers set up here are always branch-wide (no terminal), because
 * that is the only kind labelPrinterTransport will print to.
 */

export const LABEL_CONNECTIONS = {
    NETWORK: 'NETWORK_IP',   // LAN printer, relayed by the backend; works from any device
    LOCAL: 'WINDOWS_QUEUE',  // USB / Windows printer on one PC, reached via the print agent
};

export const DEFAULT_ZPL_PORT = 9100;
const DEFAULT_LABEL_PAPER = '100x150mm';

export const emptyLabelPrinterForm = () => ({
    deviceName: '',
    modelName: '',
    connectionType: LABEL_CONNECTIONS.NETWORK,
    ipAddress: '',
    portNumber: String(DEFAULT_ZPL_PORT),
    systemPrinterName: '',
    defaultPrinter: true,
    notes: '',
});

/** USB, Bluetooth and Windows-queue printers all go through the agent; the form shows them as one choice. */
export const isLocalConnection = (connectionType) => connectionType !== LABEL_CONNECTIONS.NETWORK;

export const formFromPrinter = (printer) => ({
    deviceName: printer.deviceName || '',
    modelName: printer.modelName || '',
    connectionType: printer.connectionType === LABEL_CONNECTIONS.NETWORK ? LABEL_CONNECTIONS.NETWORK : (printer.connectionType || LABEL_CONNECTIONS.LOCAL),
    ipAddress: printer.ipAddress || '',
    portNumber: printer.portNumber == null ? String(DEFAULT_ZPL_PORT) : String(printer.portNumber),
    systemPrinterName: printer.systemPrinterName || '',
    defaultPrinter: Boolean(printer.defaultPrinter),
    notes: printer.notes || '',
});

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOSTNAME = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** Returns a message for the first problem, or null when the form can be saved. */
export const validateLabelPrinterForm = (form) => {
    if (!String(form.deviceName || '').trim()) return 'Give the printer a name.';
    if (form.connectionType === LABEL_CONNECTIONS.NETWORK) {
        const host = String(form.ipAddress || '').trim();
        if (!host) return 'Enter the printer\'s IP address.';
        // Anything made only of digits and dots must be a real IPv4 address, not a "hostname".
        const valid = /^[\d.]+$/.test(host) ? IPV4.test(host) : HOSTNAME.test(host);
        if (!valid) return 'That is not a valid IP address.';
        const port = Number(form.portNumber);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Port must be a number from 1 to 65535 (Zebra printers use 9100).';
        return null;
    }
    if (!String(form.systemPrinterName || '').trim()) return 'Pick the Windows printer this label printer is installed as.';
    return null;
};

/** Device codes are unique server-side; this one is readable and needs no input. */
export const generateLabelDeviceCode = (branchId, now = Date.now()) => (
    `LBL-B${branchId}-${now.toString(36).toUpperCase()}`
);

/**
 * The full PUT/POST body. The backend replaces every field on update, so an edit starts from
 * the existing row and only the form's fields change.
 */
export const buildLabelPrinterPayload = (form, { branchId, branchName, existing = null }) => {
    const network = form.connectionType === LABEL_CONNECTIONS.NETWORK;
    return {
        deviceCode: existing?.deviceCode || generateLabelDeviceCode(branchId),
        deviceType: 'LABEL_PRINTER',
        deviceName: String(form.deviceName).trim(),
        modelName: String(form.modelName || '').trim() || null,
        branchId: Number(branchId),
        branchName: existing?.branchName || branchName || '',
        // Branch-wide: barcode printing never uses a terminal-bound printer.
        terminalId: null,
        terminalName: null,
        counterName: null,
        connectionType: form.connectionType,
        systemPrinterName: network ? null : String(form.systemPrinterName).trim(),
        deviceIdentifier: existing?.deviceIdentifier || null,
        ipAddress: network ? String(form.ipAddress).trim() : null,
        portNumber: network ? Number(form.portNumber) : null,
        paperSize: existing?.paperSize || DEFAULT_LABEL_PAPER,
        printTemplate: 'Label',
        defaultPrinter: Boolean(form.defaultPrinter),
        status: existing?.status || 'ACTIVE',
        notes: String(form.notes || '').trim() || null,
    };
};

/** An existing row as a PUT body with some fields changed (e.g. clearing its default flag). */
export const printerPayloadWith = (printer, overrides = {}) => ({
    deviceCode: printer.deviceCode,
    deviceType: printer.deviceType,
    deviceName: printer.deviceName,
    modelName: printer.modelName ?? null,
    branchId: printer.branchId,
    branchName: printer.branchName ?? '',
    terminalId: printer.terminalId ?? null,
    terminalName: printer.terminalName ?? null,
    counterName: printer.counterName ?? null,
    connectionType: printer.connectionType,
    systemPrinterName: printer.systemPrinterName ?? null,
    deviceIdentifier: printer.deviceIdentifier ?? null,
    ipAddress: printer.ipAddress ?? null,
    portNumber: printer.portNumber ?? null,
    paperSize: printer.paperSize ?? null,
    printTemplate: printer.printTemplate ?? null,
    defaultPrinter: Boolean(printer.defaultPrinter),
    status: printer.status ?? 'ACTIVE',
    notes: printer.notes ?? null,
    ...overrides,
});

/**
 * The branch allows one default label printer per scope, and refuses a second with 409. Before
 * making a printer the branch default, the current branch-wide default (other than it) must be
 * cleared; this finds it.
 */
export const conflictingBranchDefault = (printers, keepId = null) => (Array.isArray(printers) ? printers : []).find((p) => (
    p
    && p.deviceType === 'LABEL_PRINTER'
    && p.defaultPrinter
    && p.status !== 'DECOMMISSIONED'
    && !(p.terminalId && String(p.terminalId).trim())
    && String(p.id) !== String(keepId)
)) || null;

/** Label printers managed here: this branch's, active or inactive, not decommissioned. */
export const branchLabelPrinters = (printers, branchId) => (Array.isArray(printers) ? printers : [])
    .filter((p) => p && p.deviceType === 'LABEL_PRINTER' && p.status !== 'DECOMMISSIONED')
    .filter((p) => p.branchId == null || Number(p.branchId) === Number(branchId))
    .sort((a, b) => (Number(Boolean(b.defaultPrinter)) - Number(Boolean(a.defaultPrinter)))
        || String(a.deviceName || '').localeCompare(String(b.deviceName || '')));

/**
 * What the print agent on this PC says about a Windows printer, for a ZPL label printer:
 * ready, or the one step the operator still has to do in the agent's tray menu.
 */
export const agentZplReadiness = (agentPrinter) => {
    if (!agentPrinter) return { ok: false, tone: 'warn', text: 'Not found on this PC. Check the printer is installed in Windows and the print agent is running.' };
    const proto = agentPrinter.agentProtocol;
    if (proto === 'zpl') return { ok: true, tone: 'ok', text: 'Ready for labels on this PC.' };
    if (proto === 'conflict') return { ok: false, tone: 'error', text: 'Conflicting setup in the print agent — jobs are refused. Set it again in the tray menu.' };
    if (proto === 'escpos') return { ok: false, tone: 'error', text: 'The print agent has this printer set up for receipts. Change it to labels in the tray menu.' };
    if (proto === undefined) return { ok: true, tone: 'info', text: 'Older print agent — no per-printer setup needed.' };
    return { ok: false, tone: 'warn', text: 'Not set up in the print agent yet.' };
};

export const TRAY_ZPL_STEPS = 'Right-click the BillBull Print Agent icon in the taskbar → Printers → this printer → "Zebra label printer (ZPL)".';
