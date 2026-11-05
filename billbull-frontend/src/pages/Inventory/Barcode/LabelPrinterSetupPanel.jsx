import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Plus, RefreshCw, Zap, Pencil, Trash2, Star, Wifi, Usb, Monitor, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react';
import {
    getPosPrinters,
    createPosPrinter,
    updatePosPrinter,
    updatePosPrinterRuntime,
    decommissionPosPrinter,
} from '@billbull/shared/api/posPrinterApi';
import {
    listPrintAgentPrinters,
    testConfiguredPrinter,
    runtimeStatusFromPrintError,
    runtimeStatusFromPrintSuccess,
} from '@billbull/shared/utils/localPrintAgent';
import { buildZplTestLabel, zplToBase64 } from '@billbull/shared/utils/zplText';
import { confirmDialog } from '@billbull/shared/components/AppConfirmBridge';
import PrintAgentPairing from '@billbull/shared/pages/Sales/POS/device/printing/PrintAgentPairing';
import {
    DEFAULT_ZPL_PORT,
    LABEL_CONNECTIONS,
    TRAY_ZPL_STEPS,
    agentZplReadiness,
    branchLabelPrinters,
    buildLabelPrinterPayload,
    conflictingBranchDefault,
    emptyLabelPrinterForm,
    formFromPrinter,
    isLocalConnection,
    printerPayloadWith,
    validateLabelPrinterForm,
} from './labelPrinterSetup';

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

const TONE = {
    ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    info: 'text-slate-600 bg-slate-50 border-slate-200',
    warn: 'text-amber-800 bg-[#FFF8E7] border-[#FDE6A9]',
    error: 'text-red-700 bg-red-50 border-red-200',
};

const runtimePill = (printer) => {
    if (printer.status && printer.status !== 'ACTIVE') return { text: 'Inactive', cls: 'bg-slate-100 text-slate-500' };
    if (printer.runtimeStatus === 'ONLINE') return { text: 'Online', cls: 'bg-emerald-50 text-emerald-700' };
    if (printer.runtimeStatus && printer.runtimeStatus !== 'UNKNOWN') return { text: 'Needs attention', cls: 'bg-red-50 text-red-600' };
    return { text: 'Not tested', cls: 'bg-slate-100 text-slate-500' };
};

const formatTested = (value) => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

/**
 * Barcode Print → Print Settings → Printers. Adds, edits, tests and removes the branch's ZPL
 * label printers without the POS console, and shows whether the print agent on this PC is ready
 * for a USB one. Changes save to the server straight away, not with the settings' Save button.
 *
 * Writes the same printer records POS → Devices does, always branch-wide (no terminal).
 */
const LabelPrinterSetupPanel = ({
    branchId,
    branchLabel = 'this branch',
    testLabelSize = null,
    onChanged,
}) => {
    const hasBranch = branchId != null && branchId !== 'ALL' && branchId !== '';

    const [printers, setPrinters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [editing, setEditing] = useState(null); // null | 'new' | printer
    const [form, setForm] = useState(emptyLabelPrinterForm);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [rowMessage, setRowMessage] = useState({}); // { [id]: { ok, text } }

    const [agentPrinters, setAgentPrinters] = useState([]);
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentError, setAgentError] = useState('');

    const list = useMemo(() => branchLabelPrinters(printers, branchId), [printers, branchId]);

    const loadPrinters = useCallback(async () => {
        if (!hasBranch) return;
        setLoading(true);
        setLoadError('');
        try {
            setPrinters(await getPosPrinters({ branchId: Number(branchId), deviceType: 'LABEL_PRINTER' }) || []);
        } catch (err) {
            setPrinters([]);
            setLoadError(`Could not load label printers: ${errorText(err, 'request failed')}`);
        } finally {
            setLoading(false);
        }
    }, [branchId, hasBranch]);

    const loadAgentPrinters = useCallback(async () => {
        setAgentLoading(true);
        setAgentError('');
        try {
            const data = await listPrintAgentPrinters();
            setAgentPrinters(Array.isArray(data) ? data : []);
        } catch (err) {
            setAgentPrinters([]);
            setAgentError(err?.message || 'Print agent not reachable on this PC.');
        } finally {
            setAgentLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPrinters();
        loadAgentPrinters();
    }, [loadPrinters, loadAgentPrinters]);

    const agentByName = new Map(agentPrinters.map((p) => [String(p.name || '').toLowerCase(), p]));
    const configuredNames = new Set(list.map((p) => String(p.systemPrinterName || '').toLowerCase()).filter(Boolean));

    const changed = async () => {
        await loadPrinters();
        onChanged?.();
    };

    const startNew = (prefill = {}) => {
        setEditing('new');
        setForm({ ...emptyLabelPrinterForm(), defaultPrinter: !conflictingBranchDefault(list), ...prefill });
        setFormError('');
    };

    const startEdit = (printer) => {
        setEditing(printer);
        setForm(formFromPrinter(printer));
        setFormError('');
    };

    const cancelEdit = () => {
        setEditing(null);
        setFormError('');
    };

    const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

    // The backend refuses a second branch default (409), so the old one is cleared first.
    const clearOtherDefault = async (keepId) => {
        const other = conflictingBranchDefault(list, keepId);
        if (other) await updatePosPrinter(other.id, printerPayloadWith(other, { defaultPrinter: false }));
    };

    const save = async () => {
        const problem = validateLabelPrinterForm(form);
        if (problem) { setFormError(problem); return; }
        const existing = editing === 'new' ? null : editing;
        setSaving(true);
        setFormError('');
        try {
            if (form.defaultPrinter) await clearOtherDefault(existing?.id ?? null);
            const payload = buildLabelPrinterPayload(form, { branchId, branchName: branchLabel, existing });
            if (existing) await updatePosPrinter(existing.id, payload);
            else await createPosPrinter(payload);
            setEditing(null);
            await changed();
        } catch (err) {
            setFormError(errorText(err, 'Could not save the printer.'));
            await loadPrinters();
        } finally {
            setSaving(false);
        }
    };

    const makeDefault = async (printer) => {
        setBusyId(printer.id);
        try {
            await clearOtherDefault(printer.id);
            await updatePosPrinter(printer.id, printerPayloadWith(printer, { defaultPrinter: true, terminalId: null, terminalName: null, counterName: null }));
            await changed();
        } catch (err) {
            setRowMessage((prev) => ({ ...prev, [printer.id]: { ok: false, text: errorText(err, 'Could not set the default.') } }));
            await loadPrinters();
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (printer) => {
        if (!(await confirmDialog({
            title: 'Remove label printer?',
            message: `"${printer.deviceName}" will no longer be used for labels in ${branchLabel}. POS terminals lose it too.`,
            confirmLabel: 'Remove printer',
            tone: 'danger',
        }))) return;
        setBusyId(printer.id);
        try {
            await decommissionPosPrinter(printer.id);
            if (editing && editing !== 'new' && editing.id === printer.id) setEditing(null);
            await changed();
        } catch (err) {
            setRowMessage((prev) => ({ ...prev, [printer.id]: { ok: false, text: errorText(err, 'Could not remove the printer.') } }));
        } finally {
            setBusyId(null);
        }
    };

    const test = async (printer) => {
        setBusyId(printer.id);
        setRowMessage((prev) => ({ ...prev, [printer.id]: null }));
        try {
            const zpl = buildZplTestLabel({
                companyName: branchLabel,
                branchName: branchLabel,
                printerName: printer.deviceName || printer.systemPrinterName || '',
                ...(testLabelSize?.widthMm && testLabelSize?.heightMm ? { widthMm: testLabelSize.widthMm, heightMm: testLabelSize.heightMm } : {}),
            });
            const result = await testConfiguredPrinter(printer, { zplBase64: zplToBase64(zpl) });
            const text = result?.message || 'Test label sent.';
            setRowMessage((prev) => ({ ...prev, [printer.id]: { ok: true, text } }));
            await updatePosPrinterRuntime(printer.id, runtimeStatusFromPrintSuccess(text)).catch(() => null);
        } catch (err) {
            setRowMessage((prev) => ({ ...prev, [printer.id]: { ok: false, text: err?.message || 'Test print failed.' } }));
            await updatePosPrinterRuntime(printer.id, runtimeStatusFromPrintError(err)).catch(() => null);
        } finally {
            setBusyId(null);
            loadPrinters();
        }
    };

    const labelCls = 'block text-xs font-bold text-slate-700 mb-1';
    const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 focus:border-[#F5C742]';
    const radioCard = (active) => `flex-1 text-left p-3 rounded-lg border cursor-pointer transition-colors ${active ? 'border-[#F5C742] bg-[#FFF8E7] ring-1 ring-[#F5C742]' : 'border-slate-200 hover:border-slate-300'}`;
    const smallBtn = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1 disabled:opacity-50';

    const localFormAgentPrinter = isLocalConnection(form.connectionType) && form.systemPrinterName
        ? agentByName.get(String(form.systemPrinterName).toLowerCase())
        : null;
    const localFormReadiness = isLocalConnection(form.connectionType) && form.systemPrinterName && !agentError
        ? agentZplReadiness(localFormAgentPrinter)
        : null;
    const replacingDefault = form.defaultPrinter ? conflictingBranchDefault(list, editing && editing !== 'new' ? editing.id : null) : null;

    const renderForm = () => (
        <div className="rounded-xl border border-[#FDE6A9] bg-white p-4 space-y-4">
            <p className="text-sm font-bold text-slate-900">{editing === 'new' ? 'Add label printer' : `Edit ${editing.deviceName}`}</p>

            <div>
                <span className={labelCls}>How is the printer connected?</span>
                <div className="flex flex-col sm:flex-row gap-2">
                    <button type="button" className={radioCard(form.connectionType === LABEL_CONNECTIONS.NETWORK)} onClick={() => set({ connectionType: LABEL_CONNECTIONS.NETWORK })}>
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Wifi size={14} /> Network / IP</div>
                        <div className="text-xs text-slate-500">On the shop LAN. Prints from any PC, no agent needed</div>
                    </button>
                    <button type="button" className={radioCard(isLocalConnection(form.connectionType))} onClick={() => set({ connectionType: isLocalConnection(form.connectionType) ? form.connectionType : LABEL_CONNECTIONS.LOCAL })}>
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Usb size={14} /> USB / Windows printer</div>
                        <div className="text-xs text-slate-500">Plugged into one PC. Prints through the BillBull Print Agent</div>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label htmlFor="bb-lp-name" className={labelCls}>Printer name</label>
                    <input id="bb-lp-name" className={inputCls} value={form.deviceName} onChange={(e) => set({ deviceName: e.target.value })} placeholder="e.g. Stockroom Zebra" />
                </div>
                <div>
                    <label htmlFor="bb-lp-model" className={labelCls}>Model <span className="font-normal text-slate-400">(optional)</span></label>
                    <input id="bb-lp-model" className={inputCls} value={form.modelName} onChange={(e) => set({ modelName: e.target.value })} placeholder="e.g. Zebra ZD220" />
                </div>
            </div>

            {form.connectionType === LABEL_CONNECTIONS.NETWORK ? (
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <label htmlFor="bb-lp-ip" className={labelCls}>IP address</label>
                        <input id="bb-lp-ip" className={inputCls} value={form.ipAddress} onChange={(e) => set({ ipAddress: e.target.value })} placeholder="192.168.1.50" inputMode="decimal" />
                    </div>
                    <div>
                        <label htmlFor="bb-lp-port" className={labelCls}>Port</label>
                        <input id="bb-lp-port" className={inputCls} value={form.portNumber} onChange={(e) => set({ portNumber: e.target.value.replace(/\D/g, '') })} placeholder={String(DEFAULT_ZPL_PORT)} inputMode="numeric" />
                    </div>
                    <p className="col-span-3 text-xs text-slate-500">Print the printer's configuration label (hold the feed button) to find its IP. Zebra printers listen on port 9100.</p>
                </div>
            ) : (
                <div>
                    <label htmlFor="bb-lp-queue" className={labelCls}>Windows printer</label>
                    {agentPrinters.length > 0 ? (
                        <select id="bb-lp-queue" className={inputCls} value={form.systemPrinterName} onChange={(e) => set({ systemPrinterName: e.target.value })}>
                            <option value="">Select a printer on this PC…</option>
                            {form.systemPrinterName && !agentByName.has(form.systemPrinterName.toLowerCase()) && (
                                <option value={form.systemPrinterName}>{form.systemPrinterName} (not on this PC)</option>
                            )}
                            {agentPrinters.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                    ) : (
                        <input id="bb-lp-queue" className={inputCls} value={form.systemPrinterName} onChange={(e) => set({ systemPrinterName: e.target.value })} placeholder="Exact name from Windows → Printers & scanners" />
                    )}
                    {localFormReadiness && (
                        <div className={`mt-2 text-xs border rounded-lg px-3 py-2 ${TONE[localFormReadiness.tone]}`}>
                            <p>{localFormReadiness.text}</p>
                            {!localFormReadiness.ok && localFormAgentPrinter && <p className="mt-1 text-slate-700">{TRAY_ZPL_STEPS} Then Rescan.</p>}
                        </div>
                    )}
                    <p className="text-xs text-slate-500 mt-1">The printer must be connected to the PC that prints. Each PC that prints to it needs the print agent installed and paired.</p>
                </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#F5C742]" checked={form.defaultPrinter} onChange={(e) => set({ defaultPrinter: e.target.checked })} />
                <span>
                    <span className="block text-sm font-medium text-slate-800">Default label printer for {branchLabel}</span>
                    <span className="block text-xs text-slate-500">
                        {replacingDefault ? `Replaces "${replacingDefault.deviceName}" as the default.` : 'Used whenever no other printer is picked in Print Settings.'}
                    </span>
                </span>
            </label>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={cancelEdit} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={save} disabled={saving} className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded-lg disabled:opacity-60">
                    {saving ? 'Saving…' : 'Save printer'}
                </button>
            </div>
        </div>
    );

    const renderPrinter = (p) => {
        const network = p.connectionType === LABEL_CONNECTIONS.NETWORK;
        const pill = runtimePill(p);
        const msg = rowMessage[p.id];
        const terminalBound = p.terminalId && String(p.terminalId).trim();
        const agentInfo = !network && !agentError && agentPrinters.length > 0
            ? agentZplReadiness(agentByName.get(String(p.systemPrinterName || '').toLowerCase()))
            : null;
        const busy = busyId === p.id;
        return (
            <li key={p.id} className="py-3">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">{p.deviceName}</span>
                            {p.defaultPrinter && !terminalBound && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F5C742]/25 text-[#8a6d0a]">Default</span>}
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${pill.cls}`}>{pill.text}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            {network ? <Wifi size={12} /> : <Usb size={12} />}
                            {network ? `Network · ${p.ipAddress || '?'}:${p.portNumber || '?'}` : `USB / Windows · ${p.systemPrinterName || 'no printer name'}`}
                            {p.modelName ? ` · ${p.modelName}` : ''}
                        </p>
                        {terminalBound && (
                            <p className="text-xs text-amber-800 mt-1">Assigned to POS terminal {p.terminalName || p.terminalId} — barcode printing can't use it. Set it as default to make it branch-wide.</p>
                        )}
                        {p.lastTestResult && !msg && (
                            <p className="text-[11px] text-slate-400 mt-1 break-words">{formatTested(p.lastTestedAt)}{p.lastTestedAt ? ' · ' : ''}{p.lastTestResult}</p>
                        )}
                        {msg && <p className={`text-xs mt-1 break-words ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
                        {agentInfo && !agentInfo.ok && (
                            <p className="text-[11px] text-amber-800 mt-1">On this PC: {agentInfo.text}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <button type="button" disabled={busy} onClick={() => test(p)} className={`${smallBtn} border-[#F5C742] bg-[#FFF8E7] text-[#8a6d0a] hover:bg-[#FDE6A9]/60`}>
                            <Zap size={12} className={busy ? 'animate-pulse' : ''} /> Test
                        </button>
                        {(!p.defaultPrinter || terminalBound) && (
                            <button type="button" disabled={busy} onClick={() => makeDefault(p)} className={`${smallBtn} border-slate-200 text-slate-600 hover:bg-slate-50`} title="Make this the branch default">
                                <Star size={12} /> Default
                            </button>
                        )}
                        <button type="button" disabled={busy} onClick={() => startEdit(p)} className={`${smallBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}>
                            <Pencil size={12} /> Edit
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(p)} className={`${smallBtn} border-transparent text-slate-400 hover:text-red-600`} aria-label={`Remove ${p.deviceName}`}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </li>
        );
    };

    if (!hasBranch) {
        return (
            <p className="text-sm text-amber-800 bg-[#FFF8E7] border border-[#FDE6A9] rounded-lg px-3 py-2">
                Label printers belong to a branch. Pick a branch in the branch selector to set them up.
            </p>
        );
    }

    return (
        <div className="space-y-5">
            <section>
                <div className="flex items-center justify-between mb-1">
                    <div>
                        <p className="text-sm font-bold text-slate-900">Branch label printers <span className="text-slate-400 font-normal">· {list.length}</span></p>
                        <p className="text-[11px] text-slate-500">Shared by every PC in {branchLabel}. Changes here save straight away.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={loadPrinters} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                        {!editing && (
                            <button type="button" onClick={() => startNew()} className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded-lg flex items-center gap-1">
                                <Plus size={14} /> Add label printer
                            </button>
                        )}
                    </div>
                </div>
                {loadError && <p className="text-xs text-red-600">{loadError}</p>}
                {editing && renderForm()}
                {!loading && !loadError && list.length === 0 && !editing && (
                    <div className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
                        No label printer set up for {branchLabel} yet.
                    </div>
                )}
                {list.length > 0 && <ul className="divide-y divide-slate-100">{list.map(renderPrinter)}</ul>}
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-2"><Monitor size={16} className="text-slate-400" /> This PC</p>
                    <button type="button" onClick={loadAgentPrinters} disabled={agentLoading} className="text-xs text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 flex items-center gap-1 disabled:opacity-60">
                        <RefreshCw size={12} className={agentLoading ? 'animate-spin' : ''} /> {agentLoading ? 'Checking…' : 'Rescan'}
                    </button>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    Only needed for USB / Windows label printers. Network printers work from any PC without this.
                </p>
                <PrintAgentPairing onPaired={loadAgentPrinters} label="Barcode printing" />
                {agentError && <p className="text-xs text-slate-500 mt-2">{agentError}</p>}

                {agentPrinters.length > 0 && (
                    <ul className="mt-3 divide-y divide-slate-100">
                        {agentPrinters.map((p) => {
                            const readiness = agentZplReadiness(p);
                            const added = configuredNames.has(String(p.name || '').toLowerCase());
                            const isReceipt = p.agentProtocol === 'escpos';
                            return (
                                <li key={`${p.name}-${p.portName || ''}`} className="py-2 flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-slate-800 truncate" title={p.name}>{p.name}</p>
                                        <p className="text-[11px] text-slate-400 truncate">{p.driverName || 'Driver unknown'}{p.portName ? ` · ${p.portName}` : ''}</p>
                                        {!isReceipt && (
                                            <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${readiness.ok ? 'text-emerald-700' : 'text-amber-800'}`}>
                                                {readiness.ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                                                {p.agentProtocol === 'zpl' ? 'Set up for labels' : readiness.text}
                                            </p>
                                        )}
                                        {isReceipt && <p className="text-[11px] mt-0.5 text-slate-400">Set up as a receipt printer</p>}
                                    </div>
                                    {added ? (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md"><CheckCircle2 size={11} /> Added</span>
                                    ) : !isReceipt && !editing ? (
                                        <button type="button"
                                            onClick={() => startNew({ deviceName: p.name, systemPrinterName: p.name, connectionType: LABEL_CONNECTIONS.LOCAL })}
                                            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#8a6d0a] border border-[#F5C742]/60 hover:bg-[#F5C742]/10 px-2 py-1 rounded-md">
                                            <Plus size={11} /> Add
                                        </button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {agentPrinters.some((p) => p.agentProtocol !== 'zpl' && p.agentProtocol !== 'escpos' && p.agentProtocol !== undefined) && (
                    <p className="text-[11px] text-slate-500 mt-2">To set a printer up for labels: {TRAY_ZPL_STEPS}</p>
                )}
            </section>
        </div>
    );
};

export default LabelPrinterSetupPanel;
