import React, { useState } from 'react';
import { X, Printer, Settings2, RefreshCw, RotateCcw, SlidersHorizontal } from 'lucide-react';
import LabelPrinterSetupPanel from './LabelPrinterSetupPanel';
import {
    BULK_QTY_MODES,
    DEFAULT_BARCODE_PRINT_SETTINGS,
    LARGE_JOB_LABELS,
    MAX_COPIES,
    PRINT_METHODS,
    clampCopies,
    normalizeBarcodePrintSettings,
} from './barcodePrintSettings';

const describePrinter = (p) => {
    const name = p.deviceName || p.modelName || p.systemPrinterName || `Printer #${p.id}`;
    const where = p.connectionType === 'NETWORK_IP'
        ? `${p.ipAddress || '?'}:${p.portNumber || '?'}`
        : (p.systemPrinterName || p.connectionType || '');
    return `${name}${p.defaultPrinter ? ' (default)' : ''}${where ? ` — ${where}` : ''}`;
};

/**
 * Per-PC barcode print preferences: default template, how to print, which label printer,
 * and the defaults Quick Print starts from.
 */
const BarcodePrintSettingsDialog = ({
    open,
    settings,
    templates,
    branchId,
    branchLabel,
    printers,
    printersLoading,
    printersError,
    onReloadPrinters,
    testLabelSize,
    initialTab = 'general',
    onSave,
    onClose,
}) => {
    // Mounted only while open, so the draft always starts from the saved settings.
    const [draft, setDraft] = useState(settings);
    const [tab, setTab] = useState(initialTab === 'printers' ? 'printers' : 'general');

    if (!open) return null;

    const hasBranch = branchId != null && branchId !== 'ALL';
    const branchKey = hasBranch ? String(branchId) : null;
    const pickedPrinterId = branchKey ? (draft.printerByBranch?.[branchKey] ?? '') : '';
    const pickedPrinter = pickedPrinterId ? printers.find(p => String(p.id) === String(pickedPrinterId)) : null;
    const branchDefault = printers.find(p => p.defaultPrinter) || null;
    const tabCls = (active) => `px-3 py-2 text-sm font-semibold border-b-2 -mb-px flex items-center gap-1.5 ${active ? 'border-[#F5C742] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`;

    const set = (patch) => setDraft(prev => ({ ...prev, ...patch }));
    const setPrinter = (printerId) => {
        if (!branchKey) return;
        setDraft(prev => {
            const next = { ...(prev.printerByBranch || {}) };
            if (printerId) next[branchKey] = printerId; else delete next[branchKey];
            return { ...prev, printerByBranch: next };
        });
    };

    const labelCls = 'block text-xs font-bold text-slate-700 mb-1';
    const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 focus:border-[#F5C742]';
    const radioCard = (active) => `flex-1 text-left p-3 rounded-lg border cursor-pointer transition-colors ${active ? 'border-[#F5C742] bg-[#FFF8E7] ring-1 ring-[#F5C742]' : 'border-slate-200 hover:border-slate-300'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" role="dialog" aria-modal="true" aria-labelledby="bb-print-settings-title">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Settings2 size={18} className="text-[#D4A017]" />
                        <div>
                            <h3 id="bb-print-settings-title" className="text-base font-bold text-slate-900">Print Settings</h3>
                            <p className="text-xs text-slate-500">Saved on this computer only</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex gap-1 px-5 border-b border-slate-200" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'general'} className={tabCls(tab === 'general')} onClick={() => setTab('general')}>
                        <SlidersHorizontal size={14} /> General
                    </button>
                    <button type="button" role="tab" aria-selected={tab === 'printers'} className={tabCls(tab === 'printers')} onClick={() => setTab('printers')}>
                        <Printer size={14} /> Printers
                        {hasBranch && !printersLoading && !printersError && printers.length === 0 && (
                            <span className="w-2 h-2 rounded-full bg-amber-500" title="No label printer set up" />
                        )}
                    </button>
                </div>

                {tab === 'printers' ? (
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Which printer this PC sends labels to (saved with Save Settings) */}
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-1">
                            <label htmlFor="bb-ps-printer" className="text-xs font-bold text-slate-700">
                                This PC prints labels to
                            </label>
                            {hasBranch && (
                                <button type="button" onClick={onReloadPrinters} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                                    <RefreshCw size={12} className={printersLoading ? 'animate-spin' : ''} /> Refresh
                                </button>
                            )}
                        </div>
                        {!hasBranch ? (
                            <p className="text-xs text-amber-800">Select a branch to choose its label printer. Label printing never guesses a branch.</p>
                        ) : (
                            <>
                                <select id="bb-ps-printer" className={inputCls} value={pickedPrinterId} onChange={e => setPrinter(e.target.value)}>
                                    <option value="">Branch default printer{branchDefault ? ` (${branchDefault.deviceName})` : ''}</option>
                                    {printers.map(p => (
                                        <option key={p.id} value={String(p.id)}>{describePrinter(p)}</option>
                                    ))}
                                </select>
                                {printersError && <p className="text-xs text-red-600 mt-1">{printersError}</p>}
                                <p className="text-[11px] text-slate-500 mt-1">Only this computer. Click Save Settings to keep the choice.</p>
                            </>
                        )}
                    </div>

                    <LabelPrinterSetupPanel
                        branchId={hasBranch ? branchId : null}
                        branchLabel={branchLabel}
                        testLabelSize={testLabelSize}
                        onChanged={onReloadPrinters}
                    />
                </div>
                ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Print method */}
                    <div>
                        <span className={labelCls}>Print method</span>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button type="button" className={radioCard(draft.printMethod === PRINT_METHODS.ZEBRA)} onClick={() => set({ printMethod: PRINT_METHODS.ZEBRA })}>
                                <div className="text-sm font-bold text-slate-900">Label printer (Zebra)</div>
                                <div className="text-xs text-slate-500">Sends ZPL straight to the branch label printer</div>
                            </button>
                            <button type="button" className={radioCard(draft.printMethod === PRINT_METHODS.BROWSER)} onClick={() => set({ printMethod: PRINT_METHODS.BROWSER })}>
                                <div className="text-sm font-bold text-slate-900">Browser print dialog</div>
                                <div className="text-xs text-slate-500">Choose any printer in the system dialog</div>
                            </button>
                        </div>
                    </div>

                    {/* Which printer, at a glance; set up on the Printers tab */}
                    {draft.printMethod === PRINT_METHODS.ZEBRA && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700">Label printer</p>
                                <p className="text-xs text-slate-500 truncate">
                                    {!hasBranch ? 'Select a branch first'
                                        : pickedPrinter ? describePrinter(pickedPrinter)
                                            : branchDefault ? `Branch default — ${describePrinter(branchDefault)}`
                                                : printersLoading ? 'Loading…' : 'None set up yet'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setTab('printers')} className="shrink-0 text-xs font-semibold text-[#8a6d0a] hover:underline">
                                {hasBranch && !printersLoading && printers.length === 0 ? 'Set up a printer' : 'Change'}
                            </button>
                        </div>
                    )}

                    {/* Default template */}
                    <div>
                        <label htmlFor="bb-ps-template" className={labelCls}>Default label template</label>
                        <select
                            id="bb-ps-template"
                            className={inputCls}
                            value={draft.defaultTemplateId ?? ''}
                            onChange={e => set({ defaultTemplateId: e.target.value || null })}
                        >
                            <option value="">Use the template selected on the page</option>
                            {templates.map(t => (
                                <option key={t.id} value={String(t.id)}>{t.name} ({t.width}×{t.height}mm)</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="bb-ps-copies" className={labelCls}>Default labels per scan</label>
                            <input
                                id="bb-ps-copies"
                                type="number"
                                min={1}
                                max={MAX_COPIES}
                                className={inputCls}
                                value={draft.defaultCopies}
                                onChange={e => set({ defaultCopies: e.target.value })}
                                onBlur={e => set({ defaultCopies: clampCopies(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label htmlFor="bb-ps-bulk" className={labelCls}>Bulk print starting quantity</label>
                            <select id="bb-ps-bulk" className={inputCls} value={draft.bulkQtyMode} onChange={e => set({ bulkQtyMode: e.target.value })}>
                                <option value={BULK_QTY_MODES.MANUAL}>0 — pick each item</option>
                                <option value={BULK_QTY_MODES.ONE}>1 label per item</option>
                                <option value={BULK_QTY_MODES.STOCK}>1 label per unit in stock</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-[#F5C742]"
                                checked={draft.autoPrintOnScan}
                                onChange={e => set({ autoPrintOnScan: e.target.checked })}
                            />
                            <span>
                                <span className="block text-sm font-medium text-slate-800">Print as soon as a barcode is scanned</span>
                                <span className="block text-xs text-slate-500">In Quick Print, an exact barcode match prints the default number of labels without a click</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-[#F5C742]"
                                checked={draft.confirmLargeJobs}
                                onChange={e => set({ confirmLargeJobs: e.target.checked })}
                            />
                            <span>
                                <span className="block text-sm font-medium text-slate-800">Confirm large print jobs</span>
                                <span className="block text-xs text-slate-500">Ask before printing more than {LARGE_JOB_LABELS} labels at once</span>
                            </span>
                        </label>
                    </div>
                </div>
                )}

                <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
                    <button
                        type="button"
                        onClick={() => setDraft(normalizeBarcodePrintSettings({ ...DEFAULT_BARCODE_PRINT_SETTINGS, printerByBranch: draft.printerByBranch }))}
                        className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                    >
                        <RotateCcw size={14} /> Reset defaults
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            onClick={() => onSave(normalizeBarcodePrintSettings(draft))}
                            className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-amber-400 rounded-lg flex items-center gap-1"
                        >
                            <Printer size={14} /> Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BarcodePrintSettingsDialog;
