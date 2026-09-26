import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AlertTriangle, Archive, Pause, Plus, RefreshCw, RotateCcw, Search, X, XCircle, Zap } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LayawaysList from '../features/layaway/LayawaysList';
import { CurrencyAmount } from '../POSCurrency';
import { STATUS_ENUM_TO_LABEL } from '../posConstants';

/**
 * CHARACTERIZATION — the POSSales.jsx "Layaways List" modal.
 *
 * The region is now rendered by POS/features/layaway/LayawaysList.jsx. The extraction is a
 * Type-B presentation move: useLayaway() is still called in POSSales, no state or lifecycle
 * moved, and setShowSaveLayaway is still parent-owned.
 *
 * `LayawaysListRegion` below is the PRE-EXTRACTION reference: the IIFE body of the original
 * POSSales region copied VERBATIM between the REGION-VERBATIM markers, with every render-time
 * closure lifted to a prop under its ORIGINAL POSSales name. The `source contract` describe
 * block asserts the extracted child's body is byte-identical to that copy, and the
 * `extracted parity` block renders both side by side, so the behavioural tests below still
 * characterize the shipped region and fail the moment either side drifts.
 *
 * Dependency surface (19 POSSales bindings, verified against the source, NOT assumed):
 *   18 come straight from useLayaway():
 *     showLayawaysList/setShowLayawaysList, layawaysFilterStatus/setLayawaysFilterStatus,
 *     layawaysFilterCustomer/setLayawaysFilterCustomer, layawaysFilterNo/setLayawaysFilterNo,
 *     selectedLayawayId/setSelectedLayawayId, layawaysList, layawaysLoading, layawaysError,
 *     selectedLayawayDetail, layawayBusyId, loadLayaways, startLayawayConversion,
 *     handleCancelLayaway
 *   1 is parent-owned POSSales state:
 *     setShowSaveLayaway  (useState at POSSales.jsx:741 — the Save-Layaway modal flag)
 *   plus module-level imports only: STATUS_ENUM_TO_LABEL, CurrencyAmount, 10 lucide icons.
 *
 * NOTE on the architecture pass: it recorded "19 bindings, 17 from useLayaway". The actual
 * split is 18 from useLayaway + 1 parent-owned (setShowSaveLayaway). Pinned below.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - `filtered` does NOT filter. It is a pure row projection over layaywaysList; the
 *     three filter inputs are server-side params consumed by loadLayaways only. Typing in
 *     a filter therefore changes NOTHING on screen until Search/Reset is pressed.
 *   - Reset clears the three filters and then calls loadLayaways through
 *     `setTimeout(loadLayaways, 0)` — a deferred call, not a direct one.
 *   - Search calls `loadLayaways()` with no arguments; Reset's setTimeout passes the
 *     timer's own arguments, so loadLayaways is called with no meaningful args either way.
 *   - The status <option> elements carry no explicit value, so the option text is the value.
 *   - Render precedence is loading > error > empty > table. A list that arrives alongside
 *     an error is never shown.
 *   - Status colouring is keyed off the LABEL, not the enum; an unmapped enum falls through
 *     to the raw enum string and gets the default grey chip.
 *   - `isOpen` (which gates Convert/Delete) is computed from the enum, independent of
 *     whether the label mapped.
 *   - The detail pane renders from the LIST row, but the Reserved Items table renders from
 *     selectedLayawayDetail and shows "Loading items…" whenever the detail is null or
 *     belongs to a different layaway.
 *   - The row-level Delete button is disabled while busy and shows "…"; the detail-pane
 *     Cancel button is disabled while busy and shows "Cancelling…" — same action, two labels.
 *   - Clicking an already-selected row toggles the selection off; the row-level View button
 *     always selects (never toggles off).
 *   - "New Layaway" closes this modal and opens the Save-Layaway modal — the only
 *     parent-owned write in the whole region.
 *   - The region owns NO local state, NO effects and NO refs. `filtered`, `selected` and
 *     `statusColor` are recomputed on every parent render.
 */

// ── the verbatim block ──────────────────────────────────────────────────────────────────
function LayawaysListRegion({
  showLayawaysList,
  setShowLayawaysList,
  layawaysFilterStatus,
  setLayawaysFilterStatus,
  layawaysFilterCustomer,
  setLayawaysFilterCustomer,
  layawaysFilterNo,
  setLayawaysFilterNo,
  selectedLayawayId,
  setSelectedLayawayId,
  layawaysList,
  layawaysLoading,
  layawaysError,
  selectedLayawayDetail,
  layawayBusyId,
  loadLayaways,
  startLayawayConversion,
  handleCancelLayaway,
  setShowSaveLayaway,
}) {
  if (!showLayawaysList) return null;
  /* REGION-VERBATIM-START */
        // Server filters the list; map entity rows to the view shape the table uses.
        const filtered = (layawaysList || []).map(l => {
          const eff = l.effectiveStatus || l.status;
          const created = l.createdAt ? new Date(l.createdAt) : null;
          return {
            id: l.layawayNumber,
            entityId: l.id,
            date: created ? created.toLocaleDateString() : '—',
            time: created ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            customer: l.customerName || l.customerCode || '—',
            cashier: l.cashierName || '—',
            items: (l.items || []).length,
            saleAmt: l.saleTotal || 0,
            deposit: l.depositAmount || 0,
            balance: l.balanceAmount || 0,
            due: l.dueDate || '—',
            status: STATUS_ENUM_TO_LABEL[eff] || eff,
            isOpen: eff === 'ACTIVE' || eff === 'PARTIALLY_PAID' || eff === 'READY_TO_CONVERT',
            hold: !!l.hold,
            raw: l,
          };
        });
        const selected = filtered.find(l => l.entityId === selectedLayawayId) || null;
        const statusColor = (s) => ({ Active: 'bg-green-100 text-green-700', 'Partially Paid': 'bg-blue-100 text-blue-700', 'Ready to Convert': 'bg-[#F5C742]/20 text-amber-700', 'Converted to Sale': 'bg-gray-100 text-gray-600', Cancelled: 'bg-red-100 text-red-600', Expired: 'bg-red-50 text-red-500' }[s] || 'bg-gray-100 text-gray-500');
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowLayawaysList(false)} />
            <div className="relative ml-auto w-full max-w-5xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Pause className="h-4 w-4 text-amber-500" /><span className="text-base font-semibold text-[#1E293B]">Layaways</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">View and manage all sales reserved using Save Layaway.</p>
                </div>
                <button onClick={() => setShowLayawaysList(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Filters */}
              <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Layaway No.</label><input value={layawaysFilterNo} onChange={e => setLayawaysFilterNo(e.target.value)} placeholder="LAY-..." className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Customer</label><input value={layawaysFilterCustomer} onChange={e => setLayawaysFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Status</label>
                  <select value={layawaysFilterStatus} onChange={e => setLayawaysFilterStatus(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                    {['All', 'Active', 'Partially Paid', 'Ready to Convert', 'Converted to Sale', 'Cancelled', 'Expired'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <button onClick={() => loadLayaways()} className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
                <button onClick={() => { setLayawaysFilterStatus('All'); setLayawaysFilterCustomer(''); setLayawaysFilterNo(''); setTimeout(loadLayaways, 0); }} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                <button onClick={() => { setShowLayawaysList(false); setShowSaveLayaway(true); }} className="mt-auto ml-auto bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Plus className="h-3 w-3" />New Layaway</button>
              </div>
              <div className="flex flex-col lg:flex-row flex-1 min-h-0">
                <div className={`flex flex-col w-full min-h-0 overflow-hidden ${selected ? 'lg:w-[55%] max-h-[50vh] lg:max-h-none' : 'lg:w-full'} lg:border-r border-b lg:border-b-0 border-[#327F74]/10`}>
                  <div className="overflow-auto flex-1">
                    {layawaysLoading ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><RefreshCw className="h-8 w-8 text-gray-300 mb-3 animate-spin" /><p className="text-sm text-gray-400">Loading layaways…</p></div>
                    ) : layawaysError ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><AlertTriangle className="h-8 w-8 text-red-300 mb-3" /><p className="text-sm text-red-500">{layawaysError}</p></div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><Archive className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">No layaways found.</p></div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-xs">
                        <thead className="sticky top-0 bg-[#F7F7FA] z-10 border-b border-[#327F74]/10">
                          <tr className="text-gray-500">{['Layaway No.', 'Date & Time', 'Customer', 'Cashier', 'Items', 'Sale Amt', 'Deposit', 'Balance', 'Due Date', 'Status', 'Action'].map((h, i) => <th key={i} className={`px-3 py-2 text-left font-medium ${i >= 4 && i <= 7 ? 'text-right' : ''} ${i === 10 ? 'text-center' : ''}`}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {filtered.map(l => (
                            <tr key={l.entityId} onClick={() => setSelectedLayawayId(l.entityId === selectedLayawayId ? null : l.entityId)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors ${l.status === 'Expired' ? 'bg-red-50/30' : ''} ${l.entityId === selectedLayawayId ? 'bg-[#FFF8DC] border-l-2 border-l-[#F5C742]' : 'hover:bg-white'}`}>
                              <td className="px-3 py-2 font-semibold text-[#1E293B] whitespace-nowrap">
                                {l.id}
                                {l.hold && <span className="ml-1.5 text-[9px] uppercase tracking-wide rounded px-1 py-0.5 bg-purple-100 text-purple-700">Hold</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.date}</td>
                              <td className="px-3 py-2 text-[#1E293B] max-w-[160px] truncate">{l.customer}</td>
                              <td className="px-3 py-2 text-gray-500">{l.cashier}</td>
                              <td className="px-3 py-2 text-right">{l.items}</td>
                              <td className="px-3 py-2 text-right font-semibold"><CurrencyAmount amount={l.saleAmt} /></td>
                              <td className="px-3 py-2 text-right text-green-700"><CurrencyAmount amount={l.deposit} /></td>
                              <td className="px-3 py-2 text-right text-red-600"><CurrencyAmount amount={l.balance} /></td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.due}</td>
                              <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(l.status)}`}>{l.status}</span></td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={e => { e.stopPropagation(); setSelectedLayawayId(l.entityId); }} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                                  {l.isOpen && <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-[10px] px-1.5 py-0.5 rounded" onClick={e => { e.stopPropagation(); startLayawayConversion(l.entityId); }}>Convert</button>}
                                  {l.isOpen && <button disabled={layawayBusyId === l.entityId} className="border border-red-300 text-red-600 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-40" onClick={e => { e.stopPropagation(); handleCancelLayaway(l.entityId); }}>{layawayBusyId === l.entityId ? '…' : 'Delete'}</button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                </div>
                {selected && (
                  <div className="w-full lg:w-[45%] flex flex-col bg-white overflow-hidden min-h-0">
                    <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                      <span className="text-xs font-semibold text-[#1E293B]">{selected.id}</span>
                      <button onClick={() => setSelectedLayawayId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="overflow-auto flex-1 p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {[['Customer', selected.customer], ['Cashier', selected.cashier], ['Sale Amount', <CurrencyAmount amount={selected.saleAmt} />], ['Deposit Paid', <CurrencyAmount amount={selected.deposit} />], ['Balance Due', <CurrencyAmount amount={selected.balance} />], ['Due Date', selected.due], ['Status', selected.status], ['Created', selected.date + ' ' + selected.time]].map(([k, v]) => (
                          <div key={k} className="flex gap-1"><span className="text-gray-400 w-24 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                        ))}
                      </div>
                      {selected.raw?.remarks && (
                        <div className="text-[11px] text-gray-500 bg-[#F7F7FA] rounded p-2"><span className="font-semibold text-[#1E293B]">Remarks: </span>{selected.raw.remarks}</div>
                      )}
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-xs font-semibold text-[#1E293B] mb-1">Reserved Items</p>
                        {(!selectedLayawayDetail || selectedLayawayDetail.id !== selected.entityId) ? (
                          <p className="text-[11px] text-gray-400 py-2">Loading items…</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400">{['Item', 'Qty', 'Rate', 'Amount'].map(h => <th key={h} className={`py-0.5 text-left ${h !== 'Item' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                            <tbody>
                              {(selectedLayawayDetail.items || []).map((it, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-1 text-[#1E293B]">{it.itemName}{it.pinnedBatchNumber && <span className="ml-1 text-[9px] text-amber-600">[{it.pinnedBatchNumber}]</span>}</td>
                                  <td className="py-1 text-right text-[#1E293B]">{it.quantity}</td>
                                  <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={it.price || 0} /></td>
                                  <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={(it.price || 0) * (it.quantity || 0) * (1 - (it.discount || 0) / 100)} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                      {selected.isOpen && <button onClick={() => startLayawayConversion(selected.entityId)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Zap className="h-3 w-3" />Convert to Sale</button>}
                      {selected.isOpen && <button disabled={layawayBusyId === selected.entityId} onClick={() => handleCancelLayaway(selected.entityId)} className="border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-50 flex items-center gap-1 disabled:opacity-40"><XCircle className="h-3 w-3" />{layawayBusyId === selected.entityId ? 'Cancelling…' : 'Cancel'}</button>}
                      {selected.raw?.convertedInvoiceNumber && <span className="text-[11px] text-gray-500 self-center">Converted → {selected.raw.convertedInvoiceNumber}</span>}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-2.5 flex justify-end shrink-0">
                <button onClick={() => setShowLayawaysList(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
  /* REGION-VERBATIM-END */
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────
const ACTIVE_ROW = {
  id: 'ly-1',
  layawayNumber: 'LAY-0001',
  status: 'ACTIVE',
  createdAt: '2026-03-04T09:30:00Z',
  customerName: 'Aisha Khan',
  cashierName: 'Cashier One',
  items: [{ itemCode: 'A' }, { itemCode: 'B' }],
  saleTotal: 1000,
  depositAmount: 250,
  balanceAmount: 750,
  dueDate: '2026-04-04',
  remarks: null,
  hold: false,
};
const CONVERTED_ROW = {
  id: 'ly-2',
  layawayNumber: 'LAY-0002',
  status: 'CONVERTED',
  createdAt: '2026-03-05T11:00:00Z',
  customerName: 'Bilal Rao',
  cashierName: 'Cashier Two',
  items: [{ itemCode: 'C' }],
  saleTotal: 500,
  depositAmount: 500,
  balanceAmount: 0,
  dueDate: '2026-04-05',
  convertedInvoiceNumber: 'INV-99',
};

function baseProps(overrides = {}) {
  return {
    showLayawaysList: true,
    setShowLayawaysList: vi.fn(),
    layawaysFilterStatus: 'All',
    setLayawaysFilterStatus: vi.fn(),
    layawaysFilterCustomer: '',
    setLayawaysFilterCustomer: vi.fn(),
    layawaysFilterNo: '',
    setLayawaysFilterNo: vi.fn(),
    selectedLayawayId: null,
    setSelectedLayawayId: vi.fn(),
    layawaysList: [],
    layawaysLoading: false,
    layawaysError: null,
    selectedLayawayDetail: null,
    layawayBusyId: null,
    loadLayaways: vi.fn(),
    startLayawayConversion: vi.fn(),
    handleCancelLayaway: vi.fn(),
    setShowSaveLayaway: vi.fn(),
    ...overrides,
  };
}

const renderRegion = (overrides = {}) => {
  const props = baseProps(overrides);
  const view = render(<LayawaysListRegion {...props} />);
  return { props, view };
};

// Scoped to the table body: the layaway number also appears in the detail-pane header.
const rowFor = (number) => screen.getAllByText(number)
  .map(el => el.closest('tr'))
  .find(tr => tr && tr.closest('tbody'));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── mount / guard ───────────────────────────────────────────────────────────────────────
describe('Layaways List — mount guard', () => {
  it('renders nothing at all while showLayawaysList is false', () => {
    const { container } = render(<LayawaysListRegion {...baseProps({ showLayawaysList: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mounts the whole drawer as soon as showLayawaysList flips true', () => {
    renderRegion();
    expect(screen.getByText('Layaways')).toBeTruthy();
    expect(screen.getByText('View and manage all sales reserved using Save Layaway.')).toBeTruthy();
  });

  it('is fully unmounted — not hidden — when the flag goes false', () => {
    const props = baseProps();
    const { container, rerender } = render(<LayawaysListRegion {...props} />);
    expect(container.querySelector('.fixed.inset-0')).toBeTruthy();
    rerender(<LayawaysListRegion {...props} showLayawaysList={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a plain fixed-overlay div at z-50, not a Radix Dialog — no role="dialog", no portal', () => {
    const { container } = render(<LayawaysListRegion {...baseProps()} />);
    expect(container.firstChild.className).toContain('fixed inset-0 z-50 flex');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.querySelectorAll('[data-radix-portal]')).toHaveLength(0);
  });
});

// ── header / close paths ────────────────────────────────────────────────────────────────
describe('Layaways List — close paths', () => {
  it('the backdrop closes the modal', () => {
    const { props, view } = renderRegion();
    fireEvent.click(view.container.querySelector('.absolute.inset-0.bg-black\\/50'));
    expect(props.setShowLayawaysList).toHaveBeenCalledWith(false);
  });

  it('the header X closes the modal', () => {
    const { props, view } = renderRegion();
    const header = view.container.querySelector('.border-b.border-\\[\\#327F74\\]\\/20');
    fireEvent.click(within(header).getAllByRole('button')[0]);
    expect(props.setShowLayawaysList).toHaveBeenCalledWith(false);
  });

  it('the footer Close closes the modal', () => {
    const { props } = renderRegion();
    fireEvent.click(screen.getByText('Close'));
    expect(props.setShowLayawaysList).toHaveBeenCalledWith(false);
  });

  it('no close path clears filters, selection or the list', () => {
    const { props } = renderRegion({ selectedLayawayId: 'ly-1', layawaysList: [ACTIVE_ROW] });
    fireEvent.click(screen.getByText('Close'));
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
    expect(props.setLayawaysFilterNo).not.toHaveBeenCalled();
    expect(props.setLayawaysFilterCustomer).not.toHaveBeenCalled();
    expect(props.setLayawaysFilterStatus).not.toHaveBeenCalled();
  });
});

// ── filters ─────────────────────────────────────────────────────────────────────────────
describe('Layaways List — filters', () => {
  it('renders the three filter controls seeded from props', () => {
    renderRegion({ layawaysFilterNo: 'LAY-7', layawaysFilterCustomer: 'Aisha', layawaysFilterStatus: 'Active' });
    expect(screen.getByPlaceholderText('LAY-...').value).toBe('LAY-7');
    expect(screen.getByPlaceholderText('Name / Mobile').value).toBe('Aisha');
    expect(screen.getByRole('combobox').value).toBe('Active');
  });

  it('typing a layaway number writes straight through the setter', () => {
    const { props } = renderRegion();
    fireEvent.change(screen.getByPlaceholderText('LAY-...'), { target: { value: 'LAY-9' } });
    expect(props.setLayawaysFilterNo).toHaveBeenCalledWith('LAY-9');
  });

  it('typing a customer writes straight through the setter', () => {
    const { props } = renderRegion();
    fireEvent.change(screen.getByPlaceholderText('Name / Mobile'), { target: { value: '0501234567' } });
    expect(props.setLayawaysFilterCustomer).toHaveBeenCalledWith('0501234567');
  });

  it('offers exactly the seven status options, using the option text as its value', () => {
    renderRegion();
    const opts = Array.from(screen.getByRole('combobox').options);
    expect(opts.map(o => o.textContent)).toEqual(
      ['All', 'Active', 'Partially Paid', 'Ready to Convert', 'Converted to Sale', 'Cancelled', 'Expired']);
    expect(opts.map(o => o.value)).toEqual(opts.map(o => o.textContent));
  });

  it('changing status writes the LABEL, not the enum', () => {
    const { props } = renderRegion();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ready to Convert' } });
    expect(props.setLayawaysFilterStatus).toHaveBeenCalledWith('Ready to Convert');
  });

  it('no filter edit re-queries — none of them calls loadLayaways', () => {
    const { props } = renderRegion();
    fireEvent.change(screen.getByPlaceholderText('LAY-...'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('Name / Mobile'), { target: { value: 'y' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Active' } });
    expect(props.loadLayaways).not.toHaveBeenCalled();
  });

  it('a filter edit does NOT change the rows on screen — `filtered` is a projection, not a filter', () => {
    const props = baseProps({ layawaysList: [ACTIVE_ROW, CONVERTED_ROW] });
    const { rerender } = render(<LayawaysListRegion {...props} />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    rerender(<LayawaysListRegion {...props} layawaysFilterStatus="Cancelled" layawaysFilterNo="ZZZ" layawaysFilterCustomer="nobody" />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('LAY-0001')).toBeTruthy();
    expect(screen.getByText('LAY-0002')).toBeTruthy();
  });

  it('Search calls loadLayaways once, with no arguments', () => {
    const { props } = renderRegion();
    fireEvent.click(screen.getByText('Search'));
    expect(props.loadLayaways).toHaveBeenCalledTimes(1);
    expect(props.loadLayaways.mock.calls[0]).toEqual([]);
  });

  it('Reset clears the three filters and DEFERS loadLayaways to a 0ms timer', () => {
    vi.useFakeTimers();
    try {
      const props = baseProps();
      render(<LayawaysListRegion {...props} />);
      fireEvent.click(screen.getByText('Reset'));
      expect(props.setLayawaysFilterStatus).toHaveBeenCalledWith('All');
      expect(props.setLayawaysFilterCustomer).toHaveBeenCalledWith('');
      expect(props.setLayawaysFilterNo).toHaveBeenCalledWith('');
      expect(props.loadLayaways).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(props.loadLayaways).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('New Layaway closes this modal and opens the Save-Layaway modal, in that order', () => {
    const calls = [];
    const { props } = renderRegion({
      setShowLayawaysList: vi.fn(v => calls.push(['setShowLayawaysList', v])),
      setShowSaveLayaway: vi.fn(v => calls.push(['setShowSaveLayaway', v])),
    });
    fireEvent.click(screen.getByText('New Layaway'));
    expect(calls).toEqual([['setShowLayawaysList', false], ['setShowSaveLayaway', true]]);
    expect(props.loadLayaways).not.toHaveBeenCalled();
  });
});

// ── list states ─────────────────────────────────────────────────────────────────────────
describe('Layaways List — list states', () => {
  it('shows the loading placeholder while layawaysLoading', () => {
    renderRegion({ layawaysLoading: true });
    expect(screen.getByText('Loading layaways…')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the error text when layawaysError is set', () => {
    renderRegion({ layawaysError: 'Failed to load layaways.' });
    expect(screen.getByText('Failed to load layaways.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('loading wins over error when both are set', () => {
    renderRegion({ layawaysLoading: true, layawaysError: 'boom' });
    expect(screen.getByText('Loading layaways…')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('an error hides rows that did arrive', () => {
    renderRegion({ layawaysError: 'boom', layawaysList: [ACTIVE_ROW] });
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.queryByText('LAY-0001')).toBeNull();
  });

  it('shows the empty state for an empty list', () => {
    renderRegion({ layawaysList: [] });
    expect(screen.getByText('No layaways found.')).toBeTruthy();
  });

  it('treats a null list as empty rather than throwing', () => {
    expect(() => renderRegion({ layawaysList: null })).not.toThrow();
    expect(screen.getByText('No layaways found.')).toBeTruthy();
  });

  it('renders the eleven column headers in order', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW] });
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(
      ['Layaway No.', 'Date & Time', 'Customer', 'Cashier', 'Items', 'Sale Amt', 'Deposit', 'Balance', 'Due Date', 'Status', 'Action']);
  });
});

// ── row projection ──────────────────────────────────────────────────────────────────────
describe('Layaways List — row projection', () => {
  it('projects number, customer, cashier, item count, amounts, due date and label', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW] });
    const cells = within(rowFor('LAY-0001')).getAllByRole('cell').map(c => c.textContent);
    expect(cells[2]).toBe('Aisha Khan');
    expect(cells[3]).toBe('Cashier One');
    expect(cells[4]).toBe('2');
    expect(cells[5]).toContain('1000.00');
    expect(cells[6]).toContain('250.00');
    expect(cells[7]).toContain('750.00');
    expect(cells[8]).toBe('2026-04-04');
    expect(cells[9]).toBe('Active');
  });

  it('prefers effectiveStatus over status for both the label and the open gate', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, status: 'ACTIVE', effectiveStatus: 'EXPIRED' }] });
    expect(within(rowFor('LAY-0001')).getByText('Expired')).toBeTruthy();
    expect(within(rowFor('LAY-0001')).queryByText('Convert')).toBeNull();
  });

  it('falls back to the raw enum when the label map has no entry', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, effectiveStatus: 'SOMETHING_NEW' }] });
    expect(within(rowFor('LAY-0001')).getByText('SOMETHING_NEW')).toBeTruthy();
  });

  it('falls back to customerCode, then to an em dash, for the customer column', () => {
    renderRegion({ layawaysList: [
      { ...ACTIVE_ROW, id: 'a', layawayNumber: 'L-A', customerName: null, customerCode: 'C-42' },
      { ...ACTIVE_ROW, id: 'b', layawayNumber: 'L-B', customerName: null, customerCode: null },
    ] });
    expect(within(rowFor('L-A')).getAllByRole('cell')[2].textContent).toBe('C-42');
    expect(within(rowFor('L-B')).getAllByRole('cell')[2].textContent).toBe('—');
  });

  it('em-dashes a missing cashier, due date and createdAt', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, cashierName: null, dueDate: null, createdAt: null }] });
    const cells = within(rowFor('LAY-0001')).getAllByRole('cell').map(c => c.textContent);
    expect(cells[1]).toBe('—');
    expect(cells[3]).toBe('—');
    expect(cells[8]).toBe('—');
  });

  it('formats date from createdAt with the runtime locale', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW] });
    const created = new Date(ACTIVE_ROW.createdAt);
    expect(within(rowFor('LAY-0001')).getAllByRole('cell')[1].textContent).toBe(created.toLocaleDateString());
  });

  it('zero-fills missing amounts and counts a missing items array as 0', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, items: undefined, saleTotal: undefined, depositAmount: undefined, balanceAmount: undefined }] });
    const cells = within(rowFor('LAY-0001')).getAllByRole('cell').map(c => c.textContent);
    expect(cells[4]).toBe('0');
    expect(cells[5]).toContain('0.00');
  });

  it('adds the Hold badge only for rows flagged hold', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, hold: true }, { ...CONVERTED_ROW }] });
    expect(within(rowFor('LAY-0001')).getByText('Hold')).toBeTruthy();
    expect(within(rowFor('LAY-0002')).queryByText('Hold')).toBeNull();
  });

  it('tints an Expired row and colours each status chip by LABEL', () => {
    renderRegion({ layawaysList: [
      { ...ACTIVE_ROW, id: 'e', layawayNumber: 'L-E', effectiveStatus: 'EXPIRED' },
      { ...ACTIVE_ROW, id: 'p', layawayNumber: 'L-P', effectiveStatus: 'PARTIALLY_PAID' },
      { ...ACTIVE_ROW, id: 'u', layawayNumber: 'L-U', effectiveStatus: 'MYSTERY' },
    ] });
    expect(rowFor('L-E').className).toContain('bg-red-50/30');
    expect(rowFor('L-P').className).not.toContain('bg-red-50/30');
    expect(within(rowFor('L-P')).getByText('Partially Paid').className).toContain('bg-blue-100');
    expect(within(rowFor('L-U')).getByText('MYSTERY').className).toContain('bg-gray-100 text-gray-500');
  });

  it('keys rows by entity id — duplicate layaway numbers still render as separate rows', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, id: 'x' }, { ...ACTIVE_ROW, id: 'y' }] });
    expect(screen.getAllByText('LAY-0001')).toHaveLength(2);
  });
});

// ── selection ───────────────────────────────────────────────────────────────────────────
describe('Layaways List — selection', () => {
  it('clicking a row selects it by entity id', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW] });
    fireEvent.click(rowFor('LAY-0001'));
    expect(props.setSelectedLayawayId).toHaveBeenCalledWith('ly-1');
  });

  it('clicking the already-selected row toggles the selection off', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(rowFor('LAY-0001'));
    expect(props.setSelectedLayawayId).toHaveBeenCalledWith(null);
  });

  it('the row View button always selects and never toggles off', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(within(rowFor('LAY-0001')).getByText('View'));
    expect(props.setSelectedLayawayId).toHaveBeenCalledTimes(1);
    expect(props.setSelectedLayawayId).toHaveBeenCalledWith('ly-1');
  });

  it('highlights the selected row and narrows the table to 55% once a pane is open', () => {
    const { view } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    expect(rowFor('LAY-0001').className).toContain('bg-[#FFF8DC]');
    expect(view.container.querySelector('.lg\\:w-\\[55\\%\\]')).toBeTruthy();
  });

  it('keeps the table full width while nothing is selected', () => {
    const { view } = renderRegion({ layawaysList: [ACTIVE_ROW] });
    expect(view.container.querySelector('.lg\\:w-full')).toBeTruthy();
    expect(view.container.querySelector('.lg\\:w-\\[45\\%\\]')).toBeNull();
  });

  it('a selectedLayawayId that matches no row renders no detail pane', () => {
    const { view } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ghost' });
    expect(view.container.querySelector('.lg\\:w-\\[45\\%\\]')).toBeNull();
  });
});

// ── detail pane ─────────────────────────────────────────────────────────────────────────
describe('Layaways List — detail pane', () => {
  const withDetail = (o = {}) => renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1', ...o });

  it('renders the eight summary fields from the LIST row, not from the detail fetch', () => {
    withDetail();
    ['Customer:', 'Cashier:', 'Sale Amount:', 'Deposit Paid:', 'Balance Due:', 'Due Date:', 'Status:', 'Created:']
      .forEach(k => expect(screen.getByText(k)).toBeTruthy());
  });

  it('hides the remarks block when the raw row carries none', () => {
    withDetail();
    expect(screen.queryByText('Remarks:')).toBeNull();
  });

  it('shows remarks from the raw row when present', () => {
    renderRegion({ layawaysList: [{ ...ACTIVE_ROW, remarks: 'gift wrap' }], selectedLayawayId: 'ly-1' });
    expect(screen.getByText('Remarks:')).toBeTruthy();
    expect(screen.getByText('gift wrap', { exact: false })).toBeTruthy();
  });

  it('shows "Loading items…" while the detail is null', () => {
    withDetail({ selectedLayawayDetail: null });
    expect(screen.getByText('Loading items…')).toBeTruthy();
  });

  it('shows "Loading items…" while the detail belongs to a DIFFERENT layaway', () => {
    withDetail({ selectedLayawayDetail: { id: 'ly-2', items: [{ itemName: 'Wrong', quantity: 1, price: 1 }] } });
    expect(screen.getByText('Loading items…')).toBeTruthy();
    expect(screen.queryByText('Wrong')).toBeNull();
  });

  it('renders the reserved items once the detail id matches', () => {
    withDetail({ selectedLayawayDetail: { id: 'ly-1', items: [
      { itemName: 'Ring', quantity: 2, price: 100, discount: 10 },
      { itemName: 'Chain', quantity: 1, price: 50, pinnedBatchNumber: 'B-7' },
    ] } });
    expect(screen.getByText('Ring')).toBeTruthy();
    expect(screen.getByText('[B-7]')).toBeTruthy();
    expect(screen.getByText('180.00')).toBeTruthy();
  });

  it('tolerates a matching detail with no items array', () => {
    withDetail({ selectedLayawayDetail: { id: 'ly-1' } });
    expect(screen.getByText('Reserved Items')).toBeTruthy();
    expect(screen.queryByText('Loading items…')).toBeNull();
  });

  it('the pane X clears the selection', () => {
    const { props, view } = withDetail();
    const pane = view.container.querySelector('.lg\\:w-\\[45\\%\\]');
    fireEvent.click(within(pane).getAllByRole('button')[0]);
    expect(props.setSelectedLayawayId).toHaveBeenCalledWith(null);
  });

  it('shows the converted invoice note and hides the actions for a converted layaway', () => {
    renderRegion({ layawaysList: [CONVERTED_ROW], selectedLayawayId: 'ly-2' });
    expect(screen.getByText('Converted → INV-99')).toBeTruthy();
    expect(screen.queryByText('Convert to Sale')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
  });
});

// ── actions / cross-feature callbacks ───────────────────────────────────────────────────
describe('Layaways List — convert and cancel', () => {
  it('offers Convert/Delete only for ACTIVE, PARTIALLY_PAID and READY_TO_CONVERT', () => {
    renderRegion({ layawaysList: [
      { ...ACTIVE_ROW, id: '1', layawayNumber: 'L-1', effectiveStatus: 'ACTIVE' },
      { ...ACTIVE_ROW, id: '2', layawayNumber: 'L-2', effectiveStatus: 'PARTIALLY_PAID' },
      { ...ACTIVE_ROW, id: '3', layawayNumber: 'L-3', effectiveStatus: 'READY_TO_CONVERT' },
      { ...ACTIVE_ROW, id: '4', layawayNumber: 'L-4', effectiveStatus: 'CONVERTED' },
      { ...ACTIVE_ROW, id: '5', layawayNumber: 'L-5', effectiveStatus: 'CANCELLED' },
      { ...ACTIVE_ROW, id: '6', layawayNumber: 'L-6', effectiveStatus: 'EXPIRED' },
    ] });
    ['L-1', 'L-2', 'L-3'].forEach(n => expect(within(rowFor(n)).getByText('Convert')).toBeTruthy());
    ['L-4', 'L-5', 'L-6'].forEach(n => {
      expect(within(rowFor(n)).queryByText('Convert')).toBeNull();
      expect(within(rowFor(n)).queryByText('Delete')).toBeNull();
      expect(within(rowFor(n)).getByText('View')).toBeTruthy();
    });
  });

  it('the row Convert calls startLayawayConversion(entityId) WITHOUT selecting the row', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW] });
    fireEvent.click(within(rowFor('LAY-0001')).getByText('Convert'));
    expect(props.startLayawayConversion).toHaveBeenCalledWith('ly-1');
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
  });

  it('the row Delete calls handleCancelLayaway(entityId) WITHOUT selecting the row', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW] });
    fireEvent.click(within(rowFor('LAY-0001')).getByText('Delete'));
    expect(props.handleCancelLayaway).toHaveBeenCalledWith('ly-1');
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
  });

  it('the row Delete disables and shows "…" only for the busy row', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW, { ...ACTIVE_ROW, id: 'ly-9', layawayNumber: 'L-9' }], layawayBusyId: 'ly-1' });
    expect(within(rowFor('LAY-0001')).getByText('…').disabled).toBe(true);
    expect(within(rowFor('L-9')).getByText('Delete').disabled).toBe(false);
  });

  it('Convert stays enabled while a cancel is in flight for the same row', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW], layawayBusyId: 'ly-1' });
    expect(within(rowFor('LAY-0001')).getByText('Convert').disabled).toBe(false);
  });

  it('the pane Convert to Sale calls startLayawayConversion(entityId)', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(screen.getByText('Convert to Sale'));
    expect(props.startLayawayConversion).toHaveBeenCalledWith('ly-1');
  });

  it('the pane Cancel calls handleCancelLayaway(entityId)', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.handleCancelLayaway).toHaveBeenCalledWith('ly-1');
  });

  it('the pane Cancel becomes "Cancelling…" and disables while busy', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1', layawayBusyId: 'ly-1' });
    expect(screen.getByText('Cancelling…').closest('button').disabled).toBe(true);
  });

  it('neither convert nor cancel closes the modal or clears the selection from inside the region', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(screen.getByText('Convert to Sale'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.setShowLayawaysList).not.toHaveBeenCalled();
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
    expect(props.loadLayaways).not.toHaveBeenCalled();
  });

  it('a rejected convert belongs to the callback owner — the region renders no error of its own', async () => {
    const boom = vi.fn(() => Promise.reject(new Error('nope')));
    renderRegion({ layawaysList: [ACTIVE_ROW], startLayawayConversion: boom });
    fireEvent.click(within(rowFor('LAY-0001')).getByText('Convert'));
    await Promise.resolve();
    expect(boom).toHaveBeenCalledWith('ly-1');
    // layawaysError is the ONLY error surface the region has, and it is a prop.
    expect(screen.queryByText('nope')).toBeNull();
    expect(screen.getByText('LAY-0001')).toBeTruthy();
  });
});

// ── extraction-sensitive behaviour ──────────────────────────────────────────────────────
describe('Layaways List — extraction sensitivity', () => {
  it('owns no local state: an unrelated parent re-render leaves the rendered DOM identical', () => {
    const props = baseProps({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    const { container, rerender } = render(<LayawaysListRegion {...props} />);
    const before = container.innerHTML;
    rerender(<LayawaysListRegion {...props} />);
    expect(container.innerHTML).toBe(before);
  });

  it('every visible piece of state is a prop — new props alone move the UI', () => {
    const props = baseProps({ layawaysLoading: true });
    const { rerender } = render(<LayawaysListRegion {...props} />);
    expect(screen.getByText('Loading layaways…')).toBeTruthy();
    rerender(<LayawaysListRegion {...props} layawaysLoading={false} layawaysList={[ACTIVE_ROW]} />);
    expect(screen.getByText('LAY-0001')).toBeTruthy();
  });

  it('runs no effect on mount — nothing is fetched or loaded by rendering the region', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW] });
    expect(props.loadLayaways).not.toHaveBeenCalled();
    expect(props.startLayawayConversion).not.toHaveBeenCalled();
    expect(props.handleCancelLayaway).not.toHaveBeenCalled();
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
  });

  it('manages no focus — nothing is auto-focused when the drawer mounts', () => {
    renderRegion({ layawaysList: [ACTIVE_ROW] });
    expect(document.activeElement).toBe(document.body);
  });

  it('the only parent-owned write in the whole region is setShowSaveLayaway(true)', () => {
    const { props } = renderRegion({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(screen.getByText('New Layaway'));
    expect(props.setShowSaveLayaway).toHaveBeenCalledWith(true);
  });
});


// ── extracted parity ────────────────────────────────────────────────────────────────────
// Every behavioural describe above runs against the pre-extraction reference copy. This block
// renders the SHIPPED component (POS/features/layaway/LayawaysList.jsx) side by side with that
// reference and proves they are indistinguishable for representative states and interactions.

const DETAIL_FOR_ACTIVE = {
  id: 'ly-1',
  items: [
    { itemName: 'Widget', quantity: 2, price: 100, discount: 0, pinnedBatchNumber: 'B-1' },
    { itemName: 'Gadget', quantity: 1, price: 500, discount: 10 },
  ],
};

const REPRESENTATIVE_STATES = [
  ['empty list', {}],
  ['loading', { layawaysLoading: true }],
  ['error', { layawaysError: 'Boom' }],
  ['error wins over an arrived list', { layawaysError: 'Boom', layawaysList: [ACTIVE_ROW] }],
  ['loading wins over error and list', { layawaysLoading: true, layawaysError: 'Boom', layawaysList: [ACTIVE_ROW] }],
  ['table', { layawaysList: [ACTIVE_ROW, CONVERTED_ROW] }],
  ['row selected, detail missing', { layawaysList: [ACTIVE_ROW, CONVERTED_ROW], selectedLayawayId: 'ly-1' }],
  ['row selected, detail loaded', { layawaysList: [ACTIVE_ROW, CONVERTED_ROW], selectedLayawayId: 'ly-1', selectedLayawayDetail: DETAIL_FOR_ACTIVE }],
  ['row selected, detail belongs to another layaway', { layawaysList: [ACTIVE_ROW, CONVERTED_ROW], selectedLayawayId: 'ly-1', selectedLayawayDetail: { id: 'ly-2', items: [] } }],
  ['converted row selected', { layawaysList: [ACTIVE_ROW, CONVERTED_ROW], selectedLayawayId: 'ly-2' }],
  ['busy row', { layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1', layawayBusyId: 'ly-1' }],
  ['hold + remarks row', { layawaysList: [{ ...ACTIVE_ROW, hold: true, remarks: 'Hold for pickup' }], selectedLayawayId: 'ly-1' }],
  ['unmapped status enum', { layawaysList: [{ ...ACTIVE_ROW, status: 'WEIRD_STATUS' }] }],
  ['non-default filters', { layawaysFilterStatus: 'Expired', layawaysFilterCustomer: 'Aisha', layawaysFilterNo: 'LAY-0001', layawaysList: [ACTIVE_ROW] }],
  ['closed', { showLayawaysList: false }],
];

const renderBoth = (overrides = {}) => {
  const original = render(<LayawaysListRegion {...baseProps(overrides)} />);
  const originalHtml = original.container.innerHTML;
  cleanup();
  const extracted = render(<LayawaysList {...baseProps(overrides)} />);
  return { originalHtml, extractedHtml: extracted.container.innerHTML };
};

describe('extracted parity — DOM', () => {
  it.each(REPRESENTATIVE_STATES)('renders identical DOM for %s', (_label, overrides) => {
    const { originalHtml, extractedHtml } = renderBoth(overrides);
    expect(extractedHtml).toBe(originalHtml);
  });

  it('is fully unmounted — not hidden — when the flag goes false', () => {
    const props = baseProps({ layawaysList: [ACTIVE_ROW] });
    const { container, rerender } = render(<LayawaysList {...props} />);
    expect(container.querySelector('.fixed.inset-0')).toBeTruthy();
    rerender(<LayawaysList {...props} showLayawaysList={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('owns no local state: an unrelated re-render leaves the DOM identical', () => {
    const props = baseProps({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    const { container, rerender } = render(<LayawaysList {...props} />);
    const before = container.innerHTML;
    rerender(<LayawaysList {...props} />);
    expect(container.innerHTML).toBe(before);
  });

  it('runs no effect on mount — rendering it calls nothing and focuses nothing', () => {
    const props = baseProps({ layawaysList: [ACTIVE_ROW] });
    render(<LayawaysList {...props} />);
    expect(props.loadLayaways).not.toHaveBeenCalled();
    expect(props.startLayawayConversion).not.toHaveBeenCalled();
    expect(props.handleCancelLayaway).not.toHaveBeenCalled();
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('extracted parity — interactions', () => {
  const mountExtracted = (overrides = {}) => {
    const props = baseProps(overrides);
    const view = render(<LayawaysList {...props} />);
    return { props, view };
  };

  it('filter typing routes to the same setters and performs no client-side filtering', () => {
    const { props } = mountExtracted({ layawaysList: [ACTIVE_ROW, CONVERTED_ROW] });
    fireEvent.change(screen.getByPlaceholderText('LAY-...'), { target: { value: 'LAY-0001' } });
    fireEvent.change(screen.getByPlaceholderText('Name / Mobile'), { target: { value: 'Aisha' } });
    fireEvent.change(document.querySelector('select'), { target: { value: 'Expired' } });
    expect(props.setLayawaysFilterNo).toHaveBeenCalledWith('LAY-0001');
    expect(props.setLayawaysFilterCustomer).toHaveBeenCalledWith('Aisha');
    expect(props.setLayawaysFilterStatus).toHaveBeenCalledWith('Expired');
    // Uncontrolled by the child: both rows are still on screen.
    expect(rowFor('LAY-0001')).toBeTruthy();
    expect(rowFor('LAY-0002')).toBeTruthy();
  });

  it('offers the same status options, whose values come from their label text', () => {
    mountExtracted();
    expect([...document.querySelector('select').options].map(o => o.value)).toEqual([
      'All', 'Active', 'Partially Paid', 'Ready to Convert', 'Converted to Sale', 'Cancelled', 'Expired',
    ]);
  });

  it('Search calls loadLayaways directly', () => {
    const { props } = mountExtracted();
    fireEvent.click(screen.getByText('Search'));
    expect(props.loadLayaways).toHaveBeenCalledTimes(1);
  });

  it('Reset clears the three filters and reloads through setTimeout(loadLayaways, 0)', () => {
    vi.useFakeTimers();
    try {
      const { props } = mountExtracted();
      fireEvent.click(screen.getByText('Reset'));
      expect(props.setLayawaysFilterStatus).toHaveBeenCalledWith('All');
      expect(props.setLayawaysFilterCustomer).toHaveBeenCalledWith('');
      expect(props.setLayawaysFilterNo).toHaveBeenCalledWith('');
      expect(props.loadLayaways).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(props.loadLayaways).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('New Layaway closes this drawer and opens the Save-Layaway modal, in that order', () => {
    const order = [];
    const { props } = mountExtracted({
      setShowLayawaysList: vi.fn(() => order.push('close')),
      setShowSaveLayaway: vi.fn(() => order.push('save')),
    });
    fireEvent.click(screen.getByText('New Layaway'));
    expect(props.setShowLayawaysList).toHaveBeenCalledWith(false);
    expect(props.setShowSaveLayaway).toHaveBeenCalledWith(true);
    expect(order).toEqual(['close', 'save']);
  });

  it('row click toggles the selection off; View never toggles off', () => {
    const { props } = mountExtracted({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(rowFor('LAY-0001'));
    expect(props.setSelectedLayawayId).toHaveBeenLastCalledWith(null);
    fireEvent.click(within(rowFor('LAY-0001')).getByText('View'));
    expect(props.setSelectedLayawayId).toHaveBeenLastCalledWith('ly-1');
  });

  it('the row Convert/Delete buttons pass the row entity id and do not select the row', () => {
    const { props } = mountExtracted({ layawaysList: [ACTIVE_ROW] });
    fireEvent.click(within(rowFor('LAY-0001')).getByText('Convert'));
    expect(props.startLayawayConversion).toHaveBeenCalledWith('ly-1');
    fireEvent.click(within(rowFor('LAY-0001')).getByText('Delete'));
    expect(props.handleCancelLayaway).toHaveBeenCalledWith('ly-1');
    expect(props.setSelectedLayawayId).not.toHaveBeenCalled();
  });

  it('the detail pane Convert/Cancel pass the selected entity id', () => {
    const { props } = mountExtracted({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    fireEvent.click(screen.getByText('Convert to Sale'));
    expect(props.startLayawayConversion).toHaveBeenCalledWith('ly-1');
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.handleCancelLayaway).toHaveBeenCalledWith('ly-1');
  });

  it('busy state keeps the two different labels: row ellipsis and pane Cancelling', () => {
    mountExtracted({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1', layawayBusyId: 'ly-1' });
    expect(within(rowFor('LAY-0001')).getByText('…')).toBeTruthy();
    expect(screen.getByText('Cancelling…')).toBeTruthy();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('a converted row exposes neither Convert nor Delete, and shows the converted invoice', () => {
    mountExtracted({ layawaysList: [CONVERTED_ROW], selectedLayawayId: 'ly-2' });
    expect(screen.queryByText('Convert')).toBeNull();
    expect(screen.queryByText('Convert to Sale')).toBeNull();
    expect(screen.getByText('Converted → INV-99')).toBeTruthy();
  });

  it('Reserved Items stays in its loading state until the detail matches the selected row', () => {
    const { view } = mountExtracted({ layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1' });
    expect(screen.getByText('Loading items…')).toBeTruthy();
    view.rerender(<LayawaysList {...baseProps({
      layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1', selectedLayawayDetail: { id: 'ly-2', items: [] },
    })} />);
    expect(screen.getByText('Loading items…')).toBeTruthy();
    view.rerender(<LayawaysList {...baseProps({
      layawaysList: [ACTIVE_ROW], selectedLayawayId: 'ly-1', selectedLayawayDetail: DETAIL_FOR_ACTIVE,
    })} />);
    expect(screen.queryByText('Loading items…')).toBeNull();
    expect(screen.getByText('Widget')).toBeTruthy();
  });

  it('status chips keep their label-keyed colours, including the unmapped-enum fallback', () => {
    mountExtracted({ layawaysList: [ACTIVE_ROW, { ...CONVERTED_ROW, status: 'WEIRD_STATUS' }] });
    expect(within(rowFor('LAY-0001')).getByText('Active').className).toContain('bg-green-100 text-green-700');
    expect(within(rowFor('LAY-0002')).getByText('WEIRD_STATUS').className).toContain('bg-gray-100 text-gray-500');
  });

  it('the backdrop, header X and footer Close all close the drawer', () => {
    const { props, view } = mountExtracted();
    fireEvent.click(view.container.querySelector('.absolute.inset-0.bg-black\\/50'));
    fireEvent.click(screen.getByText('Close'));
    expect(props.setShowLayawaysList).toHaveBeenCalledTimes(2);
    expect(props.setShowLayawaysList).toHaveBeenCalledWith(false);
  });
});

// ── source contract ─────────────────────────────────────────────────────────────────────
describe('source contract', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const CHILD = read('../features/layaway/LayawaysList.jsx');
  const PARENT = read('../../POSSales.jsx');
  const TEST = read('./LayawaysList.characterization.test.jsx');
  const HOOK = read('../features/layaway/useLayaway.js');

  const EXPECTED = [
    // 18 from useLayaway()
    'showLayawaysList', 'setShowLayawaysList',
    'layawaysFilterStatus', 'setLayawaysFilterStatus',
    'layawaysFilterCustomer', 'setLayawaysFilterCustomer',
    'layawaysFilterNo', 'setLayawaysFilterNo',
    'selectedLayawayId', 'setSelectedLayawayId',
    'layawaysList', 'layawaysLoading', 'layawaysError',
    'selectedLayawayDetail', 'layawayBusyId',
    'loadLayaways', 'startLayawayConversion', 'handleCancelLayaway',
    // 1 parent-owned
    'setShowSaveLayaway',
  ];

  it('pins the exact boundaries of the extracted call site', () => {
    const LINES = PARENT.split('\n');
    const i = LINES.indexOf('      {/* ─── LAYAWAYS LIST MODAL ─── */}');
    expect(i).toBeGreaterThan(-1);
    expect(LINES[i + 1]).toBe('      {showLayawaysList && (');
    expect(LINES[i + 2]).toBe('        <LayawaysList');
    expect(LINES[i + 22]).toBe('        />');
    expect(LINES[i + 23]).toBe('      )}');
    expect(LINES[i + 24]).toBe('');
    expect(LINES[i + 25]).toBe('      {/* ─── CONFIRM ACTION MODAL ─── */}');
  });

  it('leaves the adjacent modal boundaries untouched — Credit Balance before, Confirm Action after', () => {
    const LINES = PARENT.split('\n');
    const i = LINES.indexOf('      {/* ─── LAYAWAYS LIST MODAL ─── */}');
    // Credit Balance (now extracted to CreditBalance.jsx) closes its call site immediately above, at the same depth.
    expect(LINES[i - 1]).toBe('');
    expect(LINES[i - 2]).toBe('      )}');
    expect(LINES[i - 3]).toBe('        />');
    expect(PARENT).toContain('{showCreditBalance && (\n        <CreditBalance');
    expect(PARENT).toContain('      {/* ─── CONFIRM ACTION MODAL ─── */}\n      {confirmAction && (');
  });

  it('renders from exactly one call site — the region is not duplicated anywhere', () => {
    expect(PARENT.split('<LayawaysList').length - 1).toBe(1);
    expect(PARENT.split('LAYAWAYS LIST MODAL').length - 1).toBe(1);
    expect(PARENT).toContain("import LayawaysList from './POS/features/layaway/LayawaysList';");
    // The IIFE is gone from the parent.
    expect(PARENT).not.toContain('{showLayawaysList && (() => {');
  });

  it('adds no key, no memo wrapper and no inline component at the call site', () => {
    expect(PARENT).not.toContain('<LayawaysList key=');
    expect(PARENT).not.toContain('memo(LayawaysList');
    expect(CHILD).not.toContain('React.memo');
    expect(CHILD).not.toContain('memo(');
  });

  it('is the only showLayawaysList render guard — the legacy showLayawaysDialog is a different modal', () => {
    expect(PARENT).toContain('{/* Legacy Layaways Dialog (kept for backward compat) */}');
    expect(CHILD).not.toContain('showLayawaysDialog');
  });

  it('the child destructures exactly the 19 characterized props, under their original names', () => {
    const a = CHILD.indexOf('function LayawaysList({');
    expect(a, 'component signature').toBeGreaterThan(-1);
    const sig = CHILD.slice(a, CHILD.indexOf('}) {', a));
    const declared = (sig.match(/^ {2}([A-Za-z0-9_]+),$/gm) || []).map(l => l.trim().replace(',', ''));
    expect(declared).toEqual(EXPECTED);
    expect(declared).toHaveLength(19);
  });

  it('the call site passes every prop explicitly — no spread of the useLayaway object', () => {
    const a = PARENT.indexOf('<LayawaysList');
    const site = PARENT.slice(a, PARENT.indexOf('/>', a));
    for (const p of EXPECTED) expect(site, p).toContain(`${p}={${p}}`);
    expect(site).not.toContain('{...');
    expect(site.match(/^ {10}[A-Za-z0-9_]+=\{/gm)).toHaveLength(19);
  });

  it('the reference region copy takes the same 19 props', () => {
    const props = TEST.slice(TEST.indexOf('function LayawaysListRegion({') + 'function LayawaysListRegion({'.length,
      TEST.indexOf('}) {\n  if (!showLayawaysList) return null;'))
      .split(',').map(s => s.trim()).filter(Boolean);
    expect(props.sort()).toEqual([...EXPECTED].sort());
  });

  it('18 of the 19 bindings still come from the single useLayaway destructure in POSSales', () => {
    const start = HOOK.indexOf('  return {');
    const returned = HOOK.slice(start);
    EXPECTED.filter(n => n !== 'setShowSaveLayaway').forEach(n => expect(returned).toContain(n));
    expect(PARENT.split('useLayaway(').length - 1).toBe(1);
    expect(PARENT).toContain('} = useLayaway(');
    // Ownership did NOT move into the child.
    expect(CHILD).not.toMatch(/import[^\n]*useLayaway[^\n]*from/);
    expect(CHILD).not.toContain('useLayaway(');
  });

  it('setShowSaveLayaway is the one parent-owned binding, declared as POSSales useState and passed explicitly', () => {
    expect(PARENT).toContain('const [showSaveLayaway, setShowSaveLayaway] = useState(false);');
    expect(PARENT).toContain('setShowSaveLayaway={setShowSaveLayaway}');
    expect(HOOK).not.toContain('setShowSaveLayaway');
  });

  it('the child declares no state, no effects, no refs and calls no hooks', () => {
    for (const forbidden of ['useState(', 'useEffect(', 'useRef(', 'useMemo(', 'useCallback(',
      'useReducer(', 'useContext(', 'createContext']) {
      expect(CHILD, forbidden).not.toContain(forbidden);
    }
    expect(CHILD).not.toMatch(/\bref=\{/);
  });

  it('the child calls no API directly — every fetch goes through useLayaway', () => {
    expect(CHILD).not.toMatch(/\bgetLayaways?\(|\bcancelLayaway\(|\bcreateLayaway\(|\baxios\b/);
    for (const forbidden of ["from '../../../../api", '/api/', 'Api(', 'fetch(']) {
      expect(CHILD, forbidden).not.toContain(forbidden);
    }
  });

  it('the child performs NO cross-feature writes of its own', () => {
    [
      'setCurrentInvoice', 'recalculateInvoice', 'handleCheckout', 'syncPosData', 'syncPosDataRef',
      'setSelectedCustomer', 'setConfirmAction', 'setActiveLayawayId', 'setActiveLayawayDeposit',
      'currentInvoice', 'setShowPaymentDialog', 'checkoutPayment',
    ].forEach(n => expect(CHILD, n).not.toContain(n));
  });

  it('the cart/customer/confirm/sync writes all live inside useLayaway, not in the child', () => {
    expect(HOOK).toContain('setCurrentInvoice(recalculateInvoice(items, billDiscountAmount));');
    expect(HOOK).toContain('syncPosDataRef.current();');
    expect(HOOK).toContain('setConfirmAction({');
    expect(HOOK).toContain('if (match) setSelectedCustomer(match.id);');
  });

  it('the child does not touch Delivery Settlement, Checkout or Session Closure', () => {
    [
      'showDeliverySettleModal', 'deliverySettle', 'handleOutForDelivery',
      'showPaymentDialog', 'showCheckoutComplete', 'completeSale',
      'showCloseSession', 'closeDay', 'zReport', 'xReport',
    ].forEach(n => expect(CHILD, n).not.toContain(n));
    // Delivery Settlement stayed inline in POSSales.
    expect(PARENT).toContain('{showDeliverySettleModal && (() => {');
  });

  it('its only imports are React, the shared constant, CurrencyAmount and lucide icons', () => {
    expect(CHILD).toContain("import React from 'react';");
    expect(CHILD).toContain("import { CurrencyAmount } from '../../POSCurrency';");
    expect(CHILD).toContain("import { STATUS_ENUM_TO_LABEL } from '../../posConstants';");
    expect(CHILD).toContain("from 'lucide-react';");
    expect(CHILD.match(/^import /gm)).toHaveLength(4);
    expect(CHILD).toContain('STATUS_ENUM_TO_LABEL[eff]');
    ['Pause', 'X', 'Search', 'RotateCcw', 'Plus', 'RefreshCw', 'AlertTriangle', 'Archive', 'Zap', 'XCircle']
      .forEach(icon => expect(CHILD).toContain(`<${icon} `));
  });

  it('the child body is the characterized region copied verbatim', () => {
    const startMarker = '  /* REGION-VERBATIM-START */\n';
    const endMarker = '  /* REGION-VERBATIM-END */';
    const reference = TEST.slice(TEST.indexOf(startMarker) + startMarker.length, TEST.indexOf(endMarker));
    const ca = CHILD.indexOf(startMarker);
    const cb = CHILD.indexOf(endMarker);
    expect(cb, 'verbatim markers in the child').toBeGreaterThan(-1);
    expect(CHILD.slice(ca + startMarker.length, cb)).toBe(reference);
    expect(reference.split('\n')).toHaveLength(146); // 145 source lines + the trailing empty split
  });

  it('the child is a module-level function component with a single default export', () => {
    expect(CHILD).toContain('\nfunction LayawaysList({');
    expect(CHILD).toContain('\nexport default LayawaysList;\n');
    expect(CHILD.match(/^function /gm)).toHaveLength(1);
    expect(CHILD.match(/^export /gm)).toHaveLength(1);
  });
});
