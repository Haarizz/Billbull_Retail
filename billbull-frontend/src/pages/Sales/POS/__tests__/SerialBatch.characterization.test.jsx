import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  AlertCircle, AlertTriangle, ChevronRight, FileText, Hash, Package, Printer, RotateCcw, Search, Shield, Wrench, X,
} from 'lucide-react';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/posApi', () => ({ posBatchCheck: vi.fn() }));
vi.mock('../../../../api/productsApi', () => ({ getProductsList: vi.fn() }));
vi.mock('../../../../api/salesInvoiceApi', () => ({ getSalesInvoicesPage: vi.fn() }));
vi.mock('../../../../api/customerledgerApi', () => ({ searchCustomersAllFields: vi.fn() }));

import { posBatchCheck } from '../../../../api/posApi';
import { getProductsList } from '../../../../api/productsApi';
import { getSalesInvoicesPage } from '../../../../api/salesInvoiceApi';
import { searchCustomersAllFields } from '../../../../api/customerledgerApi';
import AsyncSearchableDropdown from '../../../../components/AsyncSearchableDropdown';
import { CurrencyAmount } from '../POSCurrency';
import SerialBatch from '../features/products/SerialBatch';

const traverse = traverseModule.default || traverseModule;

// jsdom has no scrollIntoView; AsyncSearchableDropdown calls it on ArrowUp/ArrowDown.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

/**
 * CHARACTERIZATION — the POSSales.jsx "Serial / Batch Check" modal.
 *
 * Pre-extraction region: POSSales.jsx:9994–10378 (385 lines) — the `{/* ─── SERIAL / BATCH CHECK MODAL ─── *\/}`
 * anchor, then `{showSerialBatch && (() => { ... })()}`. Siblings: the Add Customer <Dialog> above, the
 * Service & Repair call site below. An IIFE that derives results / hasResults / selectedItem / isConvert /
 * isService, declares doBatchSearch / resetBatchSearch / fmtDate / fmtDateTime, then returns ONE hand-rolled
 * fixed right-side drawer (no Radix Dialog, no portal, no key, no ref, no hooks) with three mutually exclusive
 * sub-views: check, convert, service. Conditionally MOUNTED: closing unmounts the tree, including the four
 * AsyncSearchableDropdowns' internal state and every uncontrolled Service Job field.
 *
 * The region is now rendered by POS/features/products/SerialBatch.jsx. The extraction is a presentation move
 * only: all twelve Serial / Batch useState declarations (and setters) and the `showSerialBatch &&` mount
 * condition stay in POSSales. The child receives exactly the 28 bindings the body reads, under their ORIGINAL
 * POSSales names (showSerialBatch is NOT passed). The four API lookups, AsyncSearchableDropdown and Wrench moved
 * with it (they had no other POSSales use); the Service & Repair handoff moved with it unchanged.
 *
 * Two harnesses; every behavioural describe runs against BOTH:
 *   - `SerialBatchHarness` (reference): the PRE-EXTRACTION region copied VERBATIM (REGION markers, sha256-pinned),
 *   - `ExtractedSerialBatchHarness`: the POSSales call site copied VERBATIM (CALLSITE markers) rendering the
 *     real SerialBatch component.
 * A DOM-parity block renders both side by side through every view and compares the HTML.
 * Both reproduce the parent side: the 12 useState declarations copied VERBATIM (STATE markers), POSTouchScreen's
 * 'serial-batch' action as the only live opener, the three Service & Repair states the handoff writes, and
 * currentTerminal / currentSession as plain props (POSSales gets them from usePosSession). APIs are mocked at
 * the module boundary; AsyncSearchableDropdown is the real component.
 *
 * Direct dependency surface (derived from the parsed region):
 *   guard only:          showSerialBatch (the body never reads it)
 *   POSSales useState:   setShowSerialBatch + 11 value/setter pairs (serialBatchQuery, Result, SubView, ReturnQty,
 *                        ReturnReason, ReturnCondition, RefundMethod, InvoiceNo, ItemCode, CustomerMobile,
 *                        SelectedItem) = 23 bindings
 *   Service & Repair:    setShowServiceRepair, setServiceView, setServiceJobStep   (write-only handoff)
 *   usePosSession:       currentTerminal, currentSession   (read-only: branch for the item-code lookup only)
 *   module imports:      posBatchCheck (posApi, 2 call sites), getProductsList (productsApi, 1),
 *                        getSalesInvoicesPage (salesInvoiceApi, 1), searchCustomersAllFields (customerledgerApi, 1),
 *                        AsyncSearchableDropdown, CurrencyAmount, 14 lucide icons
 *   globals:             Date, Math, parseInt, setTimeout, undefined
 * Before the extraction the region was the ONLY POSSales user of the four APIs, AsyncSearchableDropdown and Wrench.
 *
 * `serialBatchResult` is a tagged union: null (idle) | 'searching' | 'notfound' | { results, total }.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - doBatchSearch trims all four filters; all blank → 'notfound' with NO API call and WITHOUT clearing the
 *     selected item. Otherwise: selected item cleared, 'searching', then `res.total > 0 ? res : 'notfound'`.
 *     A rejection, an undefined response or a missing `total` all end in 'notfound'. No error UI.
 *   - `{ total > 0, results missing/empty }` renders a blank results pane (no idle, no not-found, no list).
 *   - No cancellation / sequencing: the LAST promise to settle wins, and a search settling after close still
 *     writes serialBatchResult.
 *   - The four dropdown fetchOptions use the UNTRIMMED query; empty query → [] without an API call; every
 *     failure → [] ("No results found."). Batch dropdown debounce 400ms, the other three the 300ms default.
 *     Only the batch dropdown forwards the other three filters (untrimmed). Only the item-code lookup sends a
 *     branch (`currentTerminal?.branchId || currentSession?.branchId`).
 *   - Every dropdown onSelect schedules `setTimeout(() => doBatchSearch(), 50)` with the doBatchSearch of the
 *     render in which the option was clicked: the follow-up search uses the PRE-SELECTION filter values.
 *   - AsyncSearchableDropdown.handleSelect writes `label || name || code || batchNumber || invoiceNumber || ''`
 *     back through onInputChange AFTER onSelect: the item-code field ends up '' for a product option and the
 *     customer-mobile field ends up holding the customer NAME.
 *   - The opener resets query / result / sub-view / three filters / selection but NOT return qty, reason,
 *     condition or refund method; close (X / footer / backdrop) resets nothing; a raw reopen shows the last view.
 *   - Sub-view changes (Convert, Create Service Job, Cancel, header back) never reset return fields or selection.
 *   - Return qty clamps to [1, soldQty ?? 1] via parseInt; refund = itemNetAmount / (soldQty || 1) * qty.
 *   - Confirm Return and Confirm & Print are inert (no onClick).
 *   - Service Job fields are uncontrolled and unnamed; the warranty notice is hard-coded "Under Warranty".
 *   - Create Service Job hands off with NO item/customer data, and leaves serialBatchSubView at 'service'.
 *   - fmtDate / fmtDateTime use en-GB locale formatting; a falsy date renders '—', an unparseable one 'Invalid Date'.
 */

// ── harness ─────────────────────────────────────────────────────────────────────────────
const fmtResult = (r) => (r === null ? 'null' : typeof r === 'string' ? r : `obj:${r.total}:${(r.results || []).length}`);
const fmtItem = (s) => (s ? `item:${s.itemCode}` : 'null');

function ParentProbes({
  showSerialBatch, setShowSerialBatch, serialBatchQuery, setSerialBatchQuery, serialBatchResult, setSerialBatchResult,
  serialBatchSubView, setSerialBatchSubView, serialBatchReturnQty, serialBatchReturnReason, serialBatchReturnCondition,
  serialBatchRefundMethod, serialBatchInvoiceNo, setSerialBatchInvoiceNo, serialBatchItemCode, setSerialBatchItemCode,
  serialBatchCustomerMobile, setSerialBatchCustomerMobile, serialBatchSelectedItem, setSerialBatchSelectedItem,
  showServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep, bump,
}) {
  return (
    <div data-testid="probes">
      {/* POSTouchScreen 'serial-batch' action, verbatim */}
      <button data-testid="fn-serial-batch" onClick={() => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setSerialBatchInvoiceNo(''); setSerialBatchItemCode(''); setSerialBatchCustomerMobile(''); setSerialBatchSelectedItem(null); setShowSerialBatch(true); }}>fn</button>
      <button data-testid="raw-open" onClick={() => setShowSerialBatch(true)}>raw-open</button>
      <button data-testid="raw-close" onClick={() => setShowSerialBatch(false)}>raw-close</button>
      <button data-testid="raw-convert" onClick={() => setSerialBatchSubView('convert')}>raw-convert</button>
      <button data-testid="raw-select" onClick={() => setSerialBatchSelectedItem(ITEM_A)}>raw-select</button>
      <button data-testid="raw-sr-dirty" onClick={() => { setServiceView('detail'); setServiceJobStep(4); }}>raw-sr-dirty</button>
      <button data-testid="bump" onClick={bump}>bump</button>
      <span data-testid="probe-show">{String(showSerialBatch)}</span>
      <span data-testid="probe-query">{serialBatchQuery}</span>
      <span data-testid="probe-result">{fmtResult(serialBatchResult)}</span>
      <span data-testid="probe-sub">{serialBatchSubView}</span>
      <span data-testid="probe-qty">{String(serialBatchReturnQty)}</span>
      <span data-testid="probe-reason">{serialBatchReturnReason}</span>
      <span data-testid="probe-condition">{serialBatchReturnCondition}</span>
      <span data-testid="probe-refund">{serialBatchRefundMethod}</span>
      <span data-testid="probe-inv">{serialBatchInvoiceNo}</span>
      <span data-testid="probe-code">{serialBatchItemCode}</span>
      <span data-testid="probe-mobile">{serialBatchCustomerMobile}</span>
      <span data-testid="probe-selected">{fmtItem(serialBatchSelectedItem)}</span>
      <span data-testid="probe-sr-show">{String(showServiceRepair)}</span>
      <span data-testid="probe-sr-view">{serviceView}</span>
      <span data-testid="probe-sr-step">{String(serviceJobStep)}</span>
    </div>
  );
}

// ── reference: the POSSales region, verbatim ────────────────────────────────────────────
function SerialBatchHarness({ currentTerminal, currentSession }) {
  // STATE-VERBATIM-START
  // Serial / Batch Check modal
  const [showSerialBatch, setShowSerialBatch] = useState(false);
  const [serialBatchQuery, setSerialBatchQuery] = useState('');
  const [serialBatchResult, setSerialBatchResult] = useState(null);
  const [serialBatchSubView, setSerialBatchSubView] = useState('check');
  const [serialBatchReturnQty, setSerialBatchReturnQty] = useState(1);
  const [serialBatchReturnReason, setSerialBatchReturnReason] = useState('');
  const [serialBatchReturnCondition, setSerialBatchReturnCondition] = useState('');
  const [serialBatchRefundMethod, setSerialBatchRefundMethod] = useState('Cash Back');
  const [serialBatchInvoiceNo, setSerialBatchInvoiceNo] = useState('');
  const [serialBatchItemCode, setSerialBatchItemCode] = useState('');
  const [serialBatchCustomerMobile, setSerialBatchCustomerMobile] = useState('');
  const [serialBatchSelectedItem, setSerialBatchSelectedItem] = useState(null);
  // STATE-VERBATIM-END
  const [showServiceRepair, setShowServiceRepair] = useState(false);
  const [serviceView, setServiceView] = useState('list');
  const [serviceJobStep, setServiceJobStep] = useState(1);
  const [, setTick] = useState(0);

  return (
    <div data-testid="pos-root">
      <ParentProbes
        {...{ showSerialBatch, setShowSerialBatch, serialBatchQuery, setSerialBatchQuery, serialBatchResult, setSerialBatchResult,
          serialBatchSubView, setSerialBatchSubView, serialBatchReturnQty, serialBatchReturnReason, serialBatchReturnCondition,
          serialBatchRefundMethod, serialBatchInvoiceNo, setSerialBatchInvoiceNo, serialBatchItemCode, setSerialBatchItemCode,
          serialBatchCustomerMobile, setSerialBatchCustomerMobile, serialBatchSelectedItem, setSerialBatchSelectedItem,
          showServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep }}
        bump={() => setTick((t) => t + 1)}
      />
      {/* REGION-VERBATIM-START */}
      {/* ─── SERIAL / BATCH CHECK MODAL ─── */}
      {showSerialBatch && (() => {
        // serialBatchResult: null | 'searching' | 'notfound' | { results, total }
        const results = serialBatchResult && typeof serialBatchResult === 'object' ? serialBatchResult.results || [] : [];
        const hasResults = results.length > 0;
        const selectedItem = serialBatchSelectedItem;
        const isConvert = serialBatchSubView === 'convert';
        const isService = serialBatchSubView === 'service';
        const doBatchSearch = async () => {
          const q = serialBatchQuery.trim();
          const inv = serialBatchInvoiceNo.trim();
          const ic = serialBatchItemCode.trim();
          const mob = serialBatchCustomerMobile.trim();
          if (!q && !inv && !ic && !mob) { setSerialBatchResult('notfound'); return; }
          setSerialBatchResult('searching');
          setSerialBatchSelectedItem(null);
          try {
            const res = await posBatchCheck({ batchNumber: q, invoiceNumber: inv, itemCode: ic, customerMobile: mob });
            setSerialBatchResult(res.total > 0 ? res : 'notfound');
          } catch { setSerialBatchResult('notfound'); }
        };
        const resetBatchSearch = () => {
          setSerialBatchQuery(''); setSerialBatchInvoiceNo(''); setSerialBatchItemCode('');
          setSerialBatchCustomerMobile(''); setSerialBatchResult(null); setSerialBatchSelectedItem(null);
        };
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowSerialBatch(false)} />
            <div className="relative ml-auto w-full max-w-3xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              {/* Header */}
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    {isConvert && <button onClick={() => setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
                    {isService && <button onClick={() => setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
                    <Hash className="h-4 w-4 text-teal-600" />
                    <span className="text-base font-semibold text-[#1E293B]">{isConvert ? 'Convert to Return' : isService ? 'Create Service Job' : 'Serial / Batch Check'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{isConvert ? 'Process return for this serial/batch item.' : isService ? 'Create a service repair job for this item.' : 'Search sold batch or serial items, view invoice details, and convert eligible items to return.'}</p>
                </div>
                <button onClick={() => setShowSerialBatch(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              {/* ── CHECK VIEW ── */}
              {!isConvert && !isService && (
                <>
                  {/* Search */}
                  <div className="bg-white border-b border-gray-100 px-5 py-3 space-y-2 shrink-0">
                    <AsyncSearchableDropdown
                      value={null}
                      inputValue={serialBatchQuery}
                      onInputChange={setSerialBatchQuery}
                      placeholder="Scan or search batch number..."
                      fetchOptions={async (query) => {
                        if (!query) return [];
                        try {
                          const res = await posBatchCheck({ batchNumber: query, invoiceNumber: serialBatchInvoiceNo, itemCode: serialBatchItemCode, customerMobile: serialBatchCustomerMobile });
                          if (res && res.results) {
                            return res.results;
                          }
                        } catch { return []; }
                        return [];
                      }}
                      renderOption={(opt, active) => (
                        <div className="flex justify-between items-center p-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="font-bold text-sm text-[#1E293B]">{opt.batchNumber}</p>
                            <p className="text-xs text-gray-500">{opt.itemName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-xs text-gray-700">Inv: {opt.invoiceNumber}</p>
                            <p className="text-[10px] text-gray-400">Qty: {opt.soldQty}</p>
                          </div>
                        </div>
                      )}
                      onSelect={(opt) => {
                        if (opt) {
                          setSerialBatchQuery(opt.batchNumber || '');
                          if (opt.invoiceNumber) setSerialBatchInvoiceNo(opt.invoiceNumber);
                          if (opt.itemCode) setSerialBatchItemCode(opt.itemCode);
                          setTimeout(() => doBatchSearch(), 50);
                        }
                      }}
                      className="w-full text-sm"
                      debounceMs={400}
                    />
                    <div className="flex flex-wrap gap-2">
                      <div className="flex-1 min-w-[140px]">
                        <AsyncSearchableDropdown
                          value={null}
                          inputValue={serialBatchItemCode}
                          onInputChange={setSerialBatchItemCode}
                          placeholder="Item code / barcode"
                          fetchOptions={async (query) => {
                            if (!query) return [];
                            try {
                              const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
                              const res = await getProductsList(0, 5, query, undefined, null, null, null, true, posBranchId);
                              return res?.content || [];
                            } catch { return []; }
                          }}
                          renderOption={(opt) => (
                            <div className="flex flex-col py-1">
                              <span className="font-medium text-xs">{opt.itemName}</span>
                              <span className="text-[10px] text-gray-500">{opt.itemCode} {opt.barcode ? `| ${opt.barcode}` : ''}</span>
                            </div>
                          )}
                          onSelect={(opt) => {
                            if (opt) {
                              setSerialBatchItemCode(opt.itemCode || opt.barcode || '');
                              setTimeout(() => doBatchSearch(), 50);
                            }
                          }}
                          className="w-full text-xs"
                        />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <AsyncSearchableDropdown
                          value={null}
                          inputValue={serialBatchInvoiceNo}
                          onInputChange={setSerialBatchInvoiceNo}
                          placeholder="Invoice number"
                          fetchOptions={async (query) => {
                            if (!query) return [];
                            try {
                              const res = await getSalesInvoicesPage({ search: query, size: 5 });
                              return res?.content || [];
                            } catch { return []; }
                          }}
                          renderOption={(opt) => (
                            <div className="flex justify-between py-1">
                              <span className="font-medium text-xs">{opt.invoiceNumber}</span>
                              <span className="text-[10px] text-gray-500">{opt.customerName || 'Walk-in'}</span>
                            </div>
                          )}
                          onSelect={(opt) => {
                            if (opt) {
                              setSerialBatchInvoiceNo(opt.invoiceNumber || '');
                              setTimeout(() => doBatchSearch(), 50);
                            }
                          }}
                          className="w-full text-xs"
                        />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <AsyncSearchableDropdown
                          value={null}
                          inputValue={serialBatchCustomerMobile}
                          onInputChange={setSerialBatchCustomerMobile}
                          placeholder="Customer mobile"
                          fetchOptions={async (query) => {
                            if (!query) return [];
                            try {
                              const res = await searchCustomersAllFields(query);
                              return res || [];
                            } catch { return []; }
                          }}
                          renderOption={(opt) => (
                            <div className="flex flex-col py-1">
                              <span className="font-medium text-xs">{opt.name}</span>
                              <span className="text-[10px] text-gray-500">{opt.mobile || opt.email || ''}</span>
                            </div>
                          )}
                          onSelect={(opt) => {
                            if (opt) {
                              setSerialBatchCustomerMobile(opt.mobile || opt.name || '');
                              setTimeout(() => doBatchSearch(), 50);
                            }
                          }}
                          className="w-full text-xs"
                        />
                      </div>
                      <button onClick={doBatchSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 shrink-0"><Search className="h-3 w-3" />Search</button>
                      <button onClick={resetBatchSearch} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1 shrink-0"><RotateCcw className="h-3 w-3" />Reset</button>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
                    {/* Results list */}
                    <div className={`flex flex-col w-full min-h-0 overflow-hidden ${selectedItem ? 'lg:w-[45%] max-h-[50vh] lg:max-h-none border-b lg:border-b-0 lg:border-r border-[#327F74]/10' : 'lg:w-full'}`}>
                      <div className="overflow-auto flex-1 p-5">
                        {serialBatchResult === null && (
                          <div className="flex flex-col items-center justify-center h-48 text-center"><Hash className="h-12 w-12 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Scan or enter a batch number or invoice to search sold items.</p></div>
                        )}
                        {serialBatchResult === 'searching' && (
                          <div className="flex flex-col items-center justify-center h-48 text-center"><div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm text-gray-400">Searching...</p></div>
                        )}
                        {serialBatchResult === 'notfound' && (
                          <div className="flex flex-col items-center justify-center h-48 text-center"><AlertCircle className="h-12 w-12 text-gray-300 mb-3" /><p className="text-sm text-gray-500">No sold batch item found.</p><p className="text-xs text-gray-400 mt-1">Try searching by invoice number or item code.</p></div>
                        )}
                        {hasResults && (
                          <div className="space-y-2">
                            {results.map((item, i) => (
                              <div key={i} onClick={() => setSerialBatchSelectedItem(item)}
                                className={`bg-white border rounded-lg p-3 shadow-sm cursor-pointer transition-colors ${selectedItem === item ? 'border-[#327F74] bg-[#F0FAF8]' : 'border-[#327F74]/20 hover:border-[#327F74]/50'}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-[#1E293B] text-sm truncate">{item.itemName}</p>
                                    <p className="text-xs text-gray-500">{item.itemCode}{item.batchNumber ? ` · ${item.batchNumber}` : ''}</p>
                                  </div>
                                  <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 shrink-0">{item.status}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-xs">
                                  <div><span className="text-gray-400">Invoice: </span><span className="text-[#1E293B]">{item.invoiceNumber}</span></div>
                                  <div><span className="text-gray-400">Date: </span><span className="text-[#1E293B]">{fmtDate(item.invoiceDate)}</span></div>
                                  <div><span className="text-gray-400">Customer: </span><span className="text-[#1E293B]">{item.customerName || '—'}</span></div>
                                  <div><span className="text-gray-400">Qty: </span><span className="text-[#1E293B]">{item.soldQty}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Detail panel */}
                    {selectedItem && (
                      <div className="flex-1 flex flex-col bg-white overflow-hidden min-h-0">
                        <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                          <span className="text-xs font-semibold text-[#1E293B]">{selectedItem.itemName}</span>
                          <button onClick={() => setSerialBatchSelectedItem(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-4 space-y-3">
                          <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><Package className="h-3.5 w-3.5 text-[#327F74]" />Item Details</p>
                            <div className="space-y-0.5 text-xs">
                              {[['Item Code', selectedItem.itemCode || '—'], ['Batch No.', selectedItem.batchNumber || '—'], ['Expiry', fmtDate(selectedItem.expiryDate)], ['Sold Qty', selectedItem.soldQty]].map(([k, v]) => (
                                <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-[#327F74]" />Invoice Details</p>
                            <div className="space-y-0.5 text-xs">
                              {[['Invoice No.', selectedItem.invoiceNumber], ['Date', fmtDateTime(selectedItem.invoiceCreatedAt || selectedItem.invoiceDate)], ['Customer', selectedItem.customerName || '—'], ['Cashier', selectedItem.cashierName || '—'], ['Branch', selectedItem.branchName || '—'], ['Payment', selectedItem.paymentMode || '—'], ['Item Net', <CurrencyAmount amount={selectedItem.itemNetAmount || 0} />], ['VAT', <CurrencyAmount amount={selectedItem.itemTaxAmount || 0} />]].map(([k, v]) => (
                                <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                          <button onClick={() => setSerialBatchSubView('convert')} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><RotateCcw className="h-3 w-3" />Convert to Return</button>
                          <button onClick={() => setSerialBatchSubView('service')} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Wrench className="h-3 w-3" />Create Service Job</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!selectedItem && (
                    <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                      <button onClick={() => setShowSerialBatch(false)} className="border border-gray-300 text-gray-500 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
                    </div>
                  )}
                </>
              )}

              {/* ── CONVERT TO RETURN VIEW ── */}
              {isConvert && (
                <>
                  <div className="overflow-auto flex-1 p-5 space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                      <p className="text-sm font-semibold text-[#1E293B] mb-2">Original Invoice &amp; Item</p>
                      {[
                        ['Original Invoice', selectedItem?.invoiceNumber || '—'],
                        ['Invoice Date', selectedItem ? fmtDateTime(selectedItem.invoiceCreatedAt || selectedItem.invoiceDate) : '—'],
                        ['Customer', selectedItem?.customerName || '—'],
                        ['Item', selectedItem?.itemName || '—'],
                        ['Item Code', selectedItem?.itemCode || '—'],
                        ['Batch No.', selectedItem?.batchNumber || '—'],
                        ['Sold Qty', selectedItem?.soldQty ?? '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-36 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Return Details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Quantity (max: {selectedItem?.soldQty ?? 1})</label>
                          <input type="number" min={1} max={selectedItem?.soldQty ?? 1} value={serialBatchReturnQty} onChange={e => setSerialBatchReturnQty(Math.min(selectedItem?.soldQty ?? 1, Math.max(1, parseInt(e.target.value) || 1)))} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Reason</label>
                          <select value={serialBatchReturnReason} onChange={e => setSerialBatchReturnReason(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option value="">Select reason…</option>
                            {['Damaged', 'Wrong item', 'Customer changed mind', 'Warranty claim', 'Defective item', 'Expired item', 'Other'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Condition</label>
                          <select value={serialBatchReturnCondition} onChange={e => setSerialBatchReturnCondition(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option value="">Select condition…</option>
                            {['Resalable', 'Damaged', 'Defective', 'Warranty claim', 'Scrap', 'Needs service inspection'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Refund Method</label>
                          <select value={serialBatchRefundMethod} onChange={e => setSerialBatchRefundMethod(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            {['Cash Back', 'Card Refund', 'Credit Voucher', 'Customer Credit Balance', 'Exchange Adjustment'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>
                      {serialBatchReturnCondition === 'Needs service inspection' && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          Item condition requires service inspection. Consider creating a Service Job instead of direct refund.
                          <button onClick={() => setSerialBatchSubView('service')} className="ml-auto text-[#327F74] underline whitespace-nowrap">Create Service Job</button>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#FFF8DC] border border-[#F5C742]/40 rounded-lg p-3 flex items-center justify-between text-sm">
                      <span className="text-gray-600">Refund Amount (incl. VAT reversal):</span>
                      <span className="font-bold text-[#1E293B]"><CurrencyAmount amount={((selectedItem?.itemNetAmount || 0) / (selectedItem?.soldQty || 1)) * serialBatchReturnQty} /></span>
                    </div>
                  </div>
                  <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                    <button onClick={() => setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Confirm Return</button>
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Confirm &amp; Print</button>
                  </div>
                </>
              )}

              {/* ── CREATE SERVICE JOB VIEW ── */}
              {isService && (
                <>
                  <div className="overflow-auto flex-1 p-5 space-y-3">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                      <p className="text-sm font-semibold text-[#1E293B] mb-1">Pre-filled from Batch Check</p>
                      {[
                        ['Customer', selectedItem?.customerName || '—'],
                        ['Item', selectedItem?.itemName || '—'],
                        ['Batch No.', selectedItem?.batchNumber || '—'],
                        ['Invoice Ref', selectedItem?.invoiceNumber || '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Problem Details</p>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Customer Reported Problem</label>
                        <textarea placeholder="Describe the issue reported by customer..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Problem Category</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Select…</option>
                            {['Display issue', 'Battery issue', 'Charging issue', 'Software issue', 'Speaker/mic issue', 'Network issue', 'Camera issue', 'Physical damage', 'Water damage', 'Other'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Service Priority</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Normal</option><option>Urgent</option><option>High</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Expected Delivery Date</label>
                          <input type="date" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Assign Technician</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Select Technician</option>
                            {['Mohammed Al-Rashid', 'Rajan Kumar', 'Ali Hassan'].map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded p-3 flex items-start gap-2 text-xs text-green-700">
                      <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Item is Under Warranty. This repair may be eligible for free service. Warranty coverage will be verified by the technician.
                    </div>
                  </div>
                  <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                    <button onClick={() => setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                    <button onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Create Service Job</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── extracted: the POSSales call site, verbatim, rendering the real child ─────────────────
function ExtractedSerialBatchHarness({ currentTerminal, currentSession }) {
  // Serial / Batch Check modal
  const [showSerialBatch, setShowSerialBatch] = useState(false);
  const [serialBatchQuery, setSerialBatchQuery] = useState('');
  const [serialBatchResult, setSerialBatchResult] = useState(null);
  const [serialBatchSubView, setSerialBatchSubView] = useState('check');
  const [serialBatchReturnQty, setSerialBatchReturnQty] = useState(1);
  const [serialBatchReturnReason, setSerialBatchReturnReason] = useState('');
  const [serialBatchReturnCondition, setSerialBatchReturnCondition] = useState('');
  const [serialBatchRefundMethod, setSerialBatchRefundMethod] = useState('Cash Back');
  const [serialBatchInvoiceNo, setSerialBatchInvoiceNo] = useState('');
  const [serialBatchItemCode, setSerialBatchItemCode] = useState('');
  const [serialBatchCustomerMobile, setSerialBatchCustomerMobile] = useState('');
  const [serialBatchSelectedItem, setSerialBatchSelectedItem] = useState(null);
  const [showServiceRepair, setShowServiceRepair] = useState(false);
  const [serviceView, setServiceView] = useState('list');
  const [serviceJobStep, setServiceJobStep] = useState(1);
  const [, setTick] = useState(0);

  return (
    <div data-testid="pos-root">
      <ParentProbes
        {...{ showSerialBatch, setShowSerialBatch, serialBatchQuery, setSerialBatchQuery, serialBatchResult, setSerialBatchResult,
          serialBatchSubView, setSerialBatchSubView, serialBatchReturnQty, serialBatchReturnReason, serialBatchReturnCondition,
          serialBatchRefundMethod, serialBatchInvoiceNo, setSerialBatchInvoiceNo, serialBatchItemCode, setSerialBatchItemCode,
          serialBatchCustomerMobile, setSerialBatchCustomerMobile, serialBatchSelectedItem, setSerialBatchSelectedItem,
          showServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep }}
        bump={() => setTick((t) => t + 1)}
      />
      {/* CALLSITE-VERBATIM-START */}
      {/* ─── SERIAL / BATCH CHECK MODAL ─── */}
      {showSerialBatch && (
        <SerialBatch
          setShowSerialBatch={setShowSerialBatch}
          serialBatchQuery={serialBatchQuery}
          setSerialBatchQuery={setSerialBatchQuery}
          serialBatchResult={serialBatchResult}
          setSerialBatchResult={setSerialBatchResult}
          serialBatchSubView={serialBatchSubView}
          setSerialBatchSubView={setSerialBatchSubView}
          serialBatchReturnQty={serialBatchReturnQty}
          setSerialBatchReturnQty={setSerialBatchReturnQty}
          serialBatchReturnReason={serialBatchReturnReason}
          setSerialBatchReturnReason={setSerialBatchReturnReason}
          serialBatchReturnCondition={serialBatchReturnCondition}
          setSerialBatchReturnCondition={setSerialBatchReturnCondition}
          serialBatchRefundMethod={serialBatchRefundMethod}
          setSerialBatchRefundMethod={setSerialBatchRefundMethod}
          serialBatchInvoiceNo={serialBatchInvoiceNo}
          setSerialBatchInvoiceNo={setSerialBatchInvoiceNo}
          serialBatchItemCode={serialBatchItemCode}
          setSerialBatchItemCode={setSerialBatchItemCode}
          serialBatchCustomerMobile={serialBatchCustomerMobile}
          setSerialBatchCustomerMobile={setSerialBatchCustomerMobile}
          serialBatchSelectedItem={serialBatchSelectedItem}
          setSerialBatchSelectedItem={setSerialBatchSelectedItem}
          currentTerminal={currentTerminal}
          currentSession={currentSession}
          setShowServiceRepair={setShowServiceRepair}
          setServiceView={setServiceView}
          setServiceJobStep={setServiceJobStep}
        />
      )}
      {/* CALLSITE-VERBATIM-END */}
    </div>
  );
}

const HARNESSES = { reference: SerialBatchHarness, extracted: ExtractedSerialBatchHarness };
let Harness = SerialBatchHarness;

// ── fixtures ────────────────────────────────────────────────────────────────────────────
const TERMINAL = { terminalId: 'T1', branchId: 'B1' };
const SESSION = { id: 'S1', branchId: 'B-SESSION' };
const TITLE = 'Serial / Batch Check';
const SUBTITLE = 'Search sold batch or serial items, view invoice details, and convert eligible items to return.';
const IDLE = 'Scan or enter a batch number or invoice to search sold items.';
const NOT_FOUND = 'No sold batch item found.';
const PH = ['Scan or search batch number...', 'Item code / barcode', 'Invoice number', 'Customer mobile'];

const ITEM_A = {
  batchNumber: 'BT-001', itemName: 'Phone X', itemCode: 'PX-1', invoiceNumber: 'INV-100', invoiceDate: '2026-03-05T12:00:00',
  invoiceCreatedAt: '2026-03-05T14:30:00', customerName: 'Ahmed', cashierName: 'Sara', branchName: 'Main', paymentMode: 'Cash',
  soldQty: 3, itemNetAmount: 300, itemTaxAmount: 15, status: 'Sold', expiryDate: '2027-01-10T12:00:00',
};
const ITEM_B = { batchNumber: '', itemName: 'Cable', itemCode: 'CB-2', invoiceNumber: 'INV-101', invoiceDate: null, customerName: null, soldQty: 1, status: 'Returned' };
const hits = (results) => ({ results, total: results.length });

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const tick = async (ms = 0) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };

const renderHarness = (props = {}) => {
  const p = { currentTerminal: TERMINAL, currentSession: SESSION, ...props };
  const H = Harness;
  return render(<H {...p} />);
};

const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const probes = () => screen.getByTestId('probes').textContent;
const click = (id) => fireEvent.click(screen.getByTestId(id));
const overlay = () => screen.getByTestId('pos-root').querySelector(':scope > .fixed');
const panel = () => overlay().children[1];
const header = () => panel().children[0];
const headerButtons = () => [...header().querySelectorAll('button')];
const btn = (name) => within(overlay()).getByRole('button', { name });
const qbtn = (name) => within(overlay()).queryByRole('button', { name });
const icons = (root) => [...root.querySelectorAll('svg.lucide')].map((s) => [...s.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide-icon'));
const open = () => { renderHarness(); click('fn-serial-batch'); };
const dd = (i) => overlay().querySelectorAll('[data-bb-skip-aed-symbol="true"]')[i];
const expand = (i) => fireEvent.click(dd(i).firstChild);
const ddInput = (i) => dd(i).querySelector('input');
const type = (i, v) => fireEvent.change(ddInput(i), { target: { value: v } });
const options = (i) => [...(dd(i).querySelector('.overflow-y-auto')?.children || [])];
const setDd = (i, v) => { expand(i); type(i, v); };
const resultRows = () => [...overlay().querySelectorAll('.space-y-2 > .cursor-pointer')];
const detailCard = (title) => within(overlay()).getByText(title).closest('.rounded-lg');
const detailRows = (title) => [...detailCard(title).children[1].children].map((r) => r.textContent);
const clickSearch = async () => { fireEvent.click(btn('Search')); await flush(); };
const searchWith = async (results) => {
  posBatchCheck.mockResolvedValueOnce(hits(results));
  setDd(0, 'BT');
  await clickSearch();
};
const toConvert = async () => { open(); await searchWith([ITEM_A]); fireEvent.click(resultRows()[0]); fireEvent.click(btn('Convert to Return')); };
const toService = async () => { open(); await searchWith([ITEM_A]); fireEvent.click(resultRows()[0]); fireEvent.click(btn('Create Service Job')); };
const convertRows = () => [...panel().children[1].children[0].querySelectorAll('.flex.gap-2')].map((r) => r.textContent);
const returnControls = () => {
  const card = within(overlay()).getByText('Return Details').parentElement;
  const [reason, condition, refund] = card.querySelectorAll('select');
  return { qty: card.querySelector('input[type="number"]'), reason, condition, refund, card };
};
const refundAmount = () => within(overlay()).getByText('Refund Amount (incl. VAT reversal):').nextSibling.textContent;

/** Clicks the button and asserts nothing observable in the parent or the modal changed. */
const expectInert = (name) => {
  const before = probes();
  const html = overlay().innerHTML;
  fireEvent.click(btn(name));
  expect(probes(), name).toBe(before);
  expect(overlay().innerHTML, name).toBe(html);
};

beforeEach(() => {
  vi.useFakeTimers();
  posBatchCheck.mockReset().mockResolvedValue({ results: [], total: 0 });
  getProductsList.mockReset().mockResolvedValue({ content: [] });
  getSalesInvoicesPage.mockReset().mockResolvedValue({ content: [] });
  searchCustomersAllFields.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(Object.keys(HARNESSES).map((k) => [k]))('%s', (variant) => {
  beforeEach(() => { Harness = HARNESSES[variant]; });

  // ── closed / open ─────────────────────────────────────────────────────────────────────────
  describe('closed / open', () => {
    it('renders nothing and calls no API while closed, with the parent defaults', async () => {
      renderHarness();
      await tick(1000);
      expect(overlay()).toBeNull();
      expect(screen.queryByText(TITLE)).toBeNull();
      [posBatchCheck, getProductsList, getSalesInvoicesPage, searchCustomersAllFields].forEach((fn) => expect(fn).not.toHaveBeenCalled());
      expect([probe('show'), probe('query'), probe('result'), probe('sub'), probe('qty'), probe('reason'), probe('condition'),
        probe('refund'), probe('inv'), probe('code'), probe('mobile'), probe('selected')])
        .toEqual(['false', '', 'null', 'check', '1', '', '', 'Cash Back', '', '', '', 'null']);
    });

    it('is a plain fixed right-side drawer mounted inline: backdrop + panel, no dialog role', () => {
      open();
      const o = overlay();
      expect(o.className).toBe('fixed inset-0 z-50 flex');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(o.children).toHaveLength(2);
      expect(o.children[0].className).toBe('absolute inset-0 bg-black/50');
      expect(panel().className).toBe('relative ml-auto w-full max-w-3xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden');
      // header, search bar, results area, footer
      expect(panel().children).toHaveLength(4);
    });

    it('the POSTouchScreen opener resets query/result/sub-view/filters/selection and mounts the check view', () => {
      open();
      expect(probe('show')).toBe('true');
      expect(within(header()).getByText(TITLE)).toBeTruthy();
      expect(within(header()).getByText(SUBTITLE)).toBeTruthy();
      expect(icons(header())).toEqual(['lucide-hash', 'lucide-x']);
      expect(headerButtons()).toHaveLength(1);
      expect(screen.getByText(IDLE)).toBeTruthy();
    });

    it('the opener does NOT reset return qty / reason / condition / refund method', async () => {
      await toConvert();
      const c = returnControls();
      fireEvent.change(c.qty, { target: { value: '2' } });
      fireEvent.change(c.reason, { target: { value: 'Damaged' } });
      fireEvent.change(c.condition, { target: { value: 'Scrap' } });
      fireEvent.change(c.refund, { target: { value: 'Card Refund' } });
      click('raw-close');
      click('fn-serial-batch');
      expect([probe('sub'), probe('selected'), probe('result'), probe('query')]).toEqual(['check', 'null', 'null', '']);
      expect([probe('qty'), probe('reason'), probe('condition'), probe('refund')]).toEqual(['2', 'Damaged', 'Scrap', 'Card Refund']);
    });

    it('header X, footer Close and the backdrop each close (unmount) without resetting any state', async () => {
      for (const closer of ['x', 'footer', 'backdrop']) {
        cleanup();
        open();
        await searchWith([ITEM_A]);
        if (closer === 'x') fireEvent.click(headerButtons()[0]);
        if (closer === 'footer') fireEvent.click(btn('Close'));
        if (closer === 'backdrop') fireEvent.click(overlay().children[0]);
        expect(probe('show'), closer).toBe('false');
        expect(overlay(), closer).toBeNull();
        expect([probe('query'), probe('result')], closer).toEqual(['BT', 'obj:1:1']);
        click('raw-open');
        expect(resultRows(), closer).toHaveLength(1);
      }
    });

    it('clicking inside the panel does not close', () => {
      open();
      fireEvent.click(panel());
      fireEvent.click(within(overlay()).getByText(IDLE));
      expect(probe('show')).toBe('true');
    });

    it('closing drops the dropdowns\' internal open state', () => {
      open();
      expand(0);
      expect(ddInput(0)).toBeTruthy();
      click('raw-close');
      click('raw-open');
      expect(ddInput(0)).toBeNull();
      expect(dd(0).textContent).toBe(PH[0]);
    });
  });

  // ── check view ───────────────────────────────────────────────────────────────────────────
  describe('check view', () => {
    it('renders four collapsed dropdowns, Search / Reset, the idle state and a Close-only footer', () => {
      open();
      expect([0, 1, 2, 3].map((i) => dd(i).textContent)).toEqual(PH);
      expect([0, 1, 2, 3].map((i) => dd(i).className)).toEqual([
        'relative overflow-visible w-full text-sm', 'relative overflow-visible w-full text-xs',
        'relative overflow-visible w-full text-xs', 'relative overflow-visible w-full text-xs',
      ]);
      expect([...panel().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['', 'Search', 'Reset', 'Close']);
      expect(icons(panel())).toEqual(['lucide-hash', 'lucide-x', 'lucide-chevron-down', 'lucide-chevron-down', 'lucide-chevron-down',
        'lucide-chevron-down', 'lucide-search', 'lucide-rotate-ccw', 'lucide-hash']);
      expect(panel().children[3].textContent).toBe('Close');
      expect(qbtn('Convert to Return')).toBeNull();
    });

    it('empty Search (all four blank or whitespace) → notfound, no API, selection kept', async () => {
      open();
      click('raw-select');
      setDd(0, '   ');
      await clickSearch();
      expect(posBatchCheck).not.toHaveBeenCalled();
      expect(probe('result')).toBe('notfound');
      expect(probe('selected')).toBe('item:PX-1');
      expect(screen.getByText(NOT_FOUND)).toBeTruthy();
      expect(screen.getByText('Try searching by invoice number or item code.')).toBeTruthy();
    });

    it('Search trims all four filters, clears the selection and shows searching until it settles', async () => {
      open();
      click('raw-select');
      const d = deferred();
      posBatchCheck.mockReturnValueOnce(d.promise);
      setDd(0, ' BT ');
      setDd(1, ' PX ');
      setDd(2, ' INV ');
      setDd(3, ' 050 ');
      posBatchCheck.mockClear();
      fireEvent.click(btn('Search'));
      expect(posBatchCheck).toHaveBeenCalledTimes(1);
      expect(posBatchCheck).toHaveBeenCalledWith({ batchNumber: 'BT', invoiceNumber: 'INV', itemCode: 'PX', customerMobile: '050' });
      expect(probe('result')).toBe('searching');
      expect(probe('selected')).toBe('null');
      expect(screen.getByText('Searching...', { selector: 'p' })).toBeTruthy();
      await act(async () => { d.resolve(hits([ITEM_A, ITEM_B])); });
      await flush();
      expect(probe('result')).toBe('obj:2:2');
      expect(resultRows()).toHaveLength(2);
      // the raw filter values stay untrimmed in state
      expect([probe('query'), probe('code'), probe('inv'), probe('mobile')]).toEqual([' BT ', ' PX ', ' INV ', ' 050 ']);
    });

    it('a single non-blank filter is enough; the others are sent as empty strings', async () => {
      open();
      setDd(2, 'INV-9');
      await clickSearch();
      expect(posBatchCheck).toHaveBeenCalledWith({ batchNumber: '', invoiceNumber: 'INV-9', itemCode: '', customerMobile: '' });
    });

    it('total 0, missing total, undefined response and rejection all end in notfound', async () => {
      open();
      for (const outcome of [{ results: [ITEM_A], total: 0 }, { results: [ITEM_A] }, undefined, 'reject']) {
        if (outcome === 'reject') posBatchCheck.mockRejectedValueOnce(new Error('boom'));
        else posBatchCheck.mockResolvedValueOnce(outcome);
        setDd(0, 'BT');
        await clickSearch();
        expect(probe('result')).toBe('notfound');
        expect(screen.getByText(NOT_FOUND)).toBeTruthy();
      }
    });

    it('total > 0 with no results renders a blank results pane', async () => {
      open();
      for (const res of [{ total: 2 }, { results: [], total: 2 }]) {
        posBatchCheck.mockResolvedValueOnce(res);
        setDd(0, 'BT');
        await clickSearch();
        expect(probe('result')).toBe(`obj:2:${(res.results || []).length}`);
        const pane = panel().children[2].querySelector('.overflow-auto.flex-1.p-5');
        expect(pane.innerHTML).toBe('');
        expect(screen.queryByText(IDLE)).toBeNull();
        expect(screen.queryByText(NOT_FOUND)).toBeNull();
      }
    });

    it('no sequencing: the last search to settle wins', async () => {
      open();
      const first = deferred();
      const second = deferred();
      posBatchCheck.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      setDd(0, 'BT');
      fireEvent.click(btn('Search'));
      fireEvent.click(btn('Search'));
      await act(async () => { second.resolve(hits([ITEM_A, ITEM_B])); });
      await flush();
      expect(probe('result')).toBe('obj:2:2');
      await act(async () => { first.resolve(hits([ITEM_B])); });
      await flush();
      expect(probe('result')).toBe('obj:1:1');
    });

    it('a search settling after close still writes the result', async () => {
      open();
      const d = deferred();
      posBatchCheck.mockReturnValueOnce(d.promise);
      setDd(0, 'BT');
      fireEvent.click(btn('Search'));
      click('raw-close');
      await act(async () => { d.resolve(hits([ITEM_A])); });
      await flush();
      expect(probe('result')).toBe('obj:1:1');
    });

    it('Reset clears the four filters, result and selection only', async () => {
      open();
      await searchWith([ITEM_A]);
      setDd(1, 'PX');
      setDd(2, 'INV');
      setDd(3, '050');
      fireEvent.click(resultRows()[0]);
      click('raw-convert');
      const c = returnControls();
      fireEvent.change(c.reason, { target: { value: 'Other' } });
      fireEvent.click(btn('Cancel'));
      fireEvent.click(btn('Reset'));
      expect([probe('query'), probe('code'), probe('inv'), probe('mobile'), probe('result'), probe('selected')]).toEqual(['', '', '', '', 'null', 'null']);
      expect([probe('sub'), probe('reason'), probe('qty'), probe('refund')]).toEqual(['check', 'Other', '1', 'Cash Back']);
      expect(screen.getByText(IDLE)).toBeTruthy();
      expect(posBatchCheck).toHaveBeenCalledTimes(1);
    });

    it('result rows: name, code · batch, status badge, invoice, en-GB date, customer fallback, qty', async () => {
      open();
      await searchWith([ITEM_A, ITEM_B, { ...ITEM_B, itemCode: 'BAD', invoiceDate: 'not-a-date' }]);
      const rows = resultRows();
      expect(rows.map((r) => r.textContent)).toEqual([
        'Phone XPX-1 · BT-001SoldInvoice: INV-100Date: 05 Mar 2026Customer: AhmedQty: 3',
        'CableCB-2ReturnedInvoice: INV-101Date: —Customer: —Qty: 1',
        'CableBADReturnedInvoice: INV-101Date: Invalid DateCustomer: —Qty: 1',
      ]);
      expect(rows[0].className).toBe('bg-white border rounded-lg p-3 shadow-sm cursor-pointer transition-colors border-[#327F74]/20 hover:border-[#327F74]/50');
      expect(rows[0].querySelector('.bg-amber-100').className).toBe('text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 shrink-0');
    });

    it('selecting a row highlights it, narrows the list and opens the detail panel; footer Close disappears', async () => {
      open();
      await searchWith([ITEM_A, ITEM_B]);
      fireEvent.click(resultRows()[0]);
      expect(probe('selected')).toBe('item:PX-1');
      expect(resultRows()[0].className).toContain('border-[#327F74] bg-[#F0FAF8]');
      expect(resultRows()[1].className).toContain('border-[#327F74]/20 hover:border-[#327F74]/50');
      expect(panel().children[2].children[0].className).toContain('lg:w-[45%]');
      expect(panel().children).toHaveLength(3);
      expect(qbtn('Close')).toBeNull();
      fireEvent.click(resultRows()[1]);
      expect(probe('selected')).toBe('item:CB-2');
    });

    it('detail panel: item details, invoice details (CurrencyAmount), Convert / Create Service Job', async () => {
      open();
      await searchWith([ITEM_A]);
      fireEvent.click(resultRows()[0]);
      expect(detailRows('Item Details')).toEqual(['Item Code:PX-1', 'Batch No.:BT-001', 'Expiry:10 Jan 2027', 'Sold Qty:3']);
      expect(detailRows('Invoice Details')).toEqual(['Invoice No.:INV-100', 'Date:05 Mar 2026, 14:30', 'Customer:Ahmed', 'Cashier:Sara',
        'Branch:Main', 'Payment:Cash', 'Item Net:300.00', 'VAT:15.00']);
      expect(detailCard('Invoice Details').querySelectorAll('[data-bb-aed-symbol="true"]')).toHaveLength(2);
      const detail = panel().children[2].children[1];
      expect(icons(detail)).toEqual(['lucide-x', 'lucide-package', 'lucide-file-text', 'lucide-rotate-ccw', 'lucide-wrench']);
      expect([...detail.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['', 'Convert to Return', 'Create Service Job']);
    });

    it('detail fallbacks: missing fields render — and zero amounts', async () => {
      open();
      await searchWith([ITEM_B]);
      fireEvent.click(resultRows()[0]);
      expect(detailRows('Item Details')).toEqual(['Item Code:CB-2', 'Batch No.:—', 'Expiry:—', 'Sold Qty:1']);
      expect(detailRows('Invoice Details')).toEqual(['Invoice No.:INV-101', 'Date:—', 'Customer:—', 'Cashier:—', 'Branch:—', 'Payment:—',
        'Item Net:0.00', 'VAT:0.00']);
    });

    it('the detail X clears the selection only', async () => {
      open();
      await searchWith([ITEM_A]);
      fireEvent.click(resultRows()[0]);
      fireEvent.click(panel().children[2].children[1].querySelector('button'));
      expect(probe('selected')).toBe('null');
      expect(probe('result')).toBe('obj:1:1');
      expect(btn('Close')).toBeTruthy();
    });

    it('Convert to Return / Create Service Job only switch the sub-view', async () => {
      open();
      await searchWith([ITEM_A]);
      fireEvent.click(resultRows()[0]);
      fireEvent.click(btn('Convert to Return'));
      expect([probe('sub'), probe('selected'), probe('result')]).toEqual(['convert', 'item:PX-1', 'obj:1:1']);
      fireEvent.click(btn('Cancel'));
      fireEvent.click(btn('Create Service Job'));
      expect([probe('sub'), probe('selected'), probe('sr-show')]).toEqual(['service', 'item:PX-1', 'false']);
    });

    it('an unrelated parent rerender keeps the open dropdown and its input node', () => {
      open();
      expand(0);
      const input = ddInput(0);
      type(0, 'abc');
      click('bump');
      expect(ddInput(0)).toBe(input);
      expect(input.value).toBe('abc');
    });
  });

  // ── dropdowns ────────────────────────────────────────────────────────────────────────────
  describe('dropdowns', () => {
    it('batch: 400ms debounce, untrimmed query plus the other three filters, renderOption rows', async () => {
      open();
      setDd(2, ' INV ');
      setDd(3, '050');
      await tick(1000);
      posBatchCheck.mockClear();
      posBatchCheck.mockResolvedValue(hits([ITEM_A]));
      setDd(0, ' BT ');
      await tick(399);
      expect(posBatchCheck).not.toHaveBeenCalled();
      await tick(1);
      expect(posBatchCheck).toHaveBeenCalledTimes(1);
      expect(posBatchCheck).toHaveBeenCalledWith({ batchNumber: ' BT ', invoiceNumber: ' INV ', itemCode: '', customerMobile: '050' });
      expect(options(0).map((o) => o.textContent)).toEqual(['BT-001Phone XInv: INV-100Qty: 3']);
      // the dropdown only fetches; it never runs the explicit search
      expect(probe('result')).toBe('null');
    });

    it('item code / invoice / mobile: 300ms default debounce', async () => {
      open();
      setDd(1, 'PX');
      await tick(299);
      expect(getProductsList).not.toHaveBeenCalled();
      await tick(1);
      expect(getProductsList).toHaveBeenCalledTimes(1);
      setDd(2, 'IN');
      await tick(300);
      expect(getSalesInvoicesPage).toHaveBeenCalledTimes(1);
      setDd(3, '05');
      await tick(300);
      expect(searchCustomersAllFields).toHaveBeenCalledTimes(1);
    });

    it('an empty query returns [] without any API call', async () => {
      open();
      [0, 1, 2, 3].forEach(expand);
      await tick(1000);
      [posBatchCheck, getProductsList, getSalesInvoicesPage, searchCustomersAllFields].forEach((fn) => expect(fn).not.toHaveBeenCalled());
      [0, 1, 2, 3].forEach((i) => expect(options(i).map((o) => o.textContent)).toEqual(['Start typing to search...']));
    });

    it('item code lookup: exact getProductsList arguments and terminal → session branch fallback', async () => {
      for (const [props, branch] of [[{}, 'B1'], [{ currentTerminal: { terminalId: 'T1' } }, 'B-SESSION'],
        [{ currentTerminal: null, currentSession: null }, undefined]]) {
        cleanup();
        getProductsList.mockClear();
        renderHarness(props);
        click('fn-serial-batch');
        setDd(1, ' px ');
        await tick(300);
        expect(getProductsList).toHaveBeenCalledTimes(1);
        expect(getProductsList.mock.calls[0]).toEqual([0, 5, ' px ', undefined, null, null, null, true, branch]);
      }
    });

    it('invoice / customer lookups: exact arguments, no branch', async () => {
      open();
      setDd(2, ' INV ');
      await tick(300);
      expect(getSalesInvoicesPage.mock.calls).toEqual([[{ search: ' INV ', size: 5 }]]);
      setDd(3, ' 050 ');
      await tick(300);
      expect(searchCustomersAllFields.mock.calls).toEqual([[' 050 ']]);
      expect(posBatchCheck).not.toHaveBeenCalled();
    });

    it('lookup option rendering', async () => {
      getProductsList.mockResolvedValue({ content: [{ itemName: 'Phone X', itemCode: 'PX-1', barcode: '999' }, { itemName: 'Case', itemCode: 'CS-1' }] });
      getSalesInvoicesPage.mockResolvedValue({ content: [{ invoiceNumber: 'INV-1', customerName: 'Ali' }, { invoiceNumber: 'INV-2' }] });
      searchCustomersAllFields.mockResolvedValue([{ name: 'Ali', mobile: '0501' }, { name: 'Bo', email: 'b@x' }, { name: 'Cy' }]);
      open();
      setDd(1, 'x');
      await tick(300);
      expect(options(1).map((o) => o.textContent)).toEqual(['Phone XPX-1 | 999', 'CaseCS-1 ']);
      setDd(2, 'x');
      await tick(300);
      expect(options(2).map((o) => o.textContent)).toEqual(['INV-1Ali', 'INV-2Walk-in']);
      setDd(3, 'x');
      await tick(300);
      expect(options(3).map((o) => o.textContent)).toEqual(['Ali0501', 'Bob@x', 'Cy']);
    });

    it('every lookup failure / empty shape → [] → "No results found."', async () => {
      posBatchCheck.mockRejectedValue(new Error('x'));
      getProductsList.mockRejectedValue(new Error('x'));
      getSalesInvoicesPage.mockResolvedValue(undefined);
      searchCustomersAllFields.mockResolvedValue(null);
      open();
      [0, 1, 2, 3].forEach((i) => setDd(i, 'q'));
      await tick(400);
      [0, 1, 2, 3].forEach((i) => expect(options(i).map((o) => o.textContent), String(i)).toEqual(['No results found.']));
      posBatchCheck.mockResolvedValue({ total: 3 });
      type(0, 'qq');
      await tick(400);
      expect(options(0).map((o) => o.textContent)).toEqual(['No results found.']);
      expect(dd(0).textContent).not.toContain('Failed to fetch results');
    });

    it('batch select: writes query / invoice / item code, then 50ms later searches with the PRE-selection values', async () => {
      open();
      setDd(3, '050');
      posBatchCheck.mockResolvedValue(hits([ITEM_A]));
      setDd(0, 'BT');
      await tick(400);
      posBatchCheck.mockClear();
      fireEvent.click(options(0)[0]);
      expect([probe('query'), probe('inv'), probe('code'), probe('mobile')]).toEqual(['BT-001', 'INV-100', 'PX-1', '050']);
      expect(ddInput(0)).toBeNull();
      await tick(49);
      expect(posBatchCheck).not.toHaveBeenCalled();
      expect(probe('result')).toBe('null');
      await tick(1);
      expect(posBatchCheck.mock.calls).toEqual([[{ batchNumber: 'BT', invoiceNumber: '', itemCode: '', customerMobile: '050' }]]);
      expect(probe('result')).toBe('obj:1:1');
    });

    it('batch select without invoice / item code leaves those filters untouched', async () => {
      open();
      setDd(2, 'KEEP');
      posBatchCheck.mockResolvedValue(hits([{ batchNumber: 'B9' }]));
      setDd(0, 'B');
      await tick(400);
      fireEvent.click(options(0)[0]);
      expect([probe('query'), probe('inv'), probe('code')]).toEqual(['B9', 'KEEP', '']);
    });

    it('item code select: the field ends up EMPTY (handleSelect overwrites it), search uses the typed text', async () => {
      getProductsList.mockResolvedValue({ content: [{ itemName: 'Phone X', itemCode: 'PX-1', barcode: '999' }] });
      open();
      setDd(1, 'PX');
      await tick(300);
      fireEvent.click(options(1)[0]);
      expect(probe('code')).toBe('');
      await tick(50);
      expect(posBatchCheck.mock.calls).toEqual([[{ batchNumber: '', invoiceNumber: '', itemCode: 'PX', customerMobile: '' }]]);
    });

    it('item code select with a name/code-bearing option keeps that value instead', async () => {
      getProductsList.mockResolvedValue({ content: [{ name: 'Named', barcode: '777' }] });
      open();
      setDd(1, 'x');
      await tick(300);
      fireEvent.click(options(1)[0]);
      expect(probe('code')).toBe('Named');
    });

    it('invoice select: sets the invoice number, then searches with the pre-selection text', async () => {
      getSalesInvoicesPage.mockResolvedValue({ content: [{ invoiceNumber: 'INV-100', customerName: 'Ali' }] });
      open();
      setDd(2, 'INV');
      await tick(300);
      fireEvent.click(options(2)[0]);
      expect(probe('inv')).toBe('INV-100');
      await tick(50);
      expect(posBatchCheck.mock.calls).toEqual([[{ batchNumber: '', invoiceNumber: 'INV', itemCode: '', customerMobile: '' }]]);
    });

    it('customer select: the mobile field ends up holding the customer NAME', async () => {
      searchCustomersAllFields.mockResolvedValue([{ name: 'Ahmed', mobile: '0501' }]);
      open();
      setDd(3, '050');
      await tick(300);
      fireEvent.click(options(3)[0]);
      expect(probe('mobile')).toBe('Ahmed');
      await tick(50);
      expect(posBatchCheck.mock.calls).toEqual([[{ batchNumber: '', invoiceNumber: '', itemCode: '', customerMobile: '050' }]]);
    });

    it('the delayed search still fires after the modal closed', async () => {
      searchCustomersAllFields.mockResolvedValue([{ name: 'Ahmed', mobile: '0501' }]);
      posBatchCheck.mockResolvedValue(hits([ITEM_A]));
      open();
      setDd(3, '050');
      await tick(300);
      fireEvent.click(options(3)[0]);
      click('raw-close');
      await tick(50);
      expect(posBatchCheck).toHaveBeenCalledTimes(1);
      expect(probe('result')).toBe('obj:1:1');
    });

    it('Enter on a single option selects it through the same path', async () => {
      getSalesInvoicesPage.mockResolvedValue({ content: [{ invoiceNumber: 'INV-7' }] });
      open();
      setDd(2, '7');
      await tick(300);
      fireEvent.keyDown(ddInput(2), { key: 'Enter' });
      expect(probe('inv')).toBe('INV-7');
      await tick(50);
      expect(posBatchCheck).toHaveBeenCalledTimes(1);
    });
  });

  // ── convert to return ───────────────────────────────────────────────────────────────────
  describe('convert to return view', () => {
    it('header: back chevron, title and subtitle; three panel sections', async () => {
      await toConvert();
      expect(within(header()).getByText('Convert to Return')).toBeTruthy();
      expect(within(header()).getByText('Process return for this serial/batch item.')).toBeTruthy();
      expect(icons(header())).toEqual(['lucide-chevron-right', 'lucide-hash', 'lucide-x']);
      expect(headerButtons()[0].querySelector('svg').getAttribute('class')).toContain('rotate-180');
      expect(panel().children).toHaveLength(3);
      expect(overlay().querySelectorAll('[data-bb-skip-aed-symbol="true"]')).toHaveLength(0);
    });

    it('original invoice & item rows', async () => {
      await toConvert();
      expect(convertRows()).toEqual(['Original Invoice:INV-100', 'Invoice Date:05 Mar 2026, 14:30', 'Customer:Ahmed', 'Item:Phone X',
        'Item Code:PX-1', 'Batch No.:BT-001', 'Sold Qty:3']);
    });

    it('with no selected item (parent write only) every row is — and the max is 1', () => {
      open();
      click('raw-convert');
      expect(convertRows()).toEqual(['Original Invoice:—', 'Invoice Date:—', 'Customer:—', 'Item:—', 'Item Code:—', 'Batch No.:—', 'Sold Qty:—']);
      const { qty } = returnControls();
      expect(qty.max).toBe('1');
      expect(refundAmount()).toBe('0.00');
      expect(screen.getByText('Return Quantity (max: 1)')).toBeTruthy();
    });

    it('return quantity: clamps to [1, soldQty], parseInt, updates the refund amount', async () => {
      await toConvert();
      const { qty } = returnControls();
      expect([qty.value, qty.min, qty.max]).toEqual(['1', '1', '3']);
      expect(screen.getByText('Return Quantity (max: 3)')).toBeTruthy();
      expect(refundAmount()).toBe('100.00');
      for (const [raw, expected] of [['2', '2'], ['10', '3'], ['0', '1'], ['-4', '1'], ['2.9', '2'], ['', '1']]) {
        fireEvent.change(qty, { target: { value: raw } });
        expect(probe('qty'), raw).toBe(expected);
      }
      fireEvent.change(qty, { target: { value: '3' } });
      expect(refundAmount()).toBe('300.00');
      expect(within(overlay()).getByText('Refund Amount (incl. VAT reversal):').nextSibling.querySelector('[data-bb-aed-symbol="true"]')).toBeTruthy();
    });

    it('return reason / condition / refund method options and writes', async () => {
      await toConvert();
      const { reason, condition, refund } = returnControls();
      expect([...reason.options].map((o) => o.textContent)).toEqual(['Select reason…', 'Damaged', 'Wrong item', 'Customer changed mind',
        'Warranty claim', 'Defective item', 'Expired item', 'Other']);
      expect([...condition.options].map((o) => o.textContent)).toEqual(['Select condition…', 'Resalable', 'Damaged', 'Defective',
        'Warranty claim', 'Scrap', 'Needs service inspection']);
      expect([...refund.options].map((o) => o.textContent)).toEqual(['Cash Back', 'Card Refund', 'Credit Voucher', 'Customer Credit Balance',
        'Exchange Adjustment']);
      expect([reason.value, condition.value, refund.value]).toEqual(['', '', 'Cash Back']);
      fireEvent.change(reason, { target: { value: 'Wrong item' } });
      fireEvent.change(condition, { target: { value: 'Defective' } });
      fireEvent.change(refund, { target: { value: 'Credit Voucher' } });
      expect([probe('reason'), probe('condition'), probe('refund')]).toEqual(['Wrong item', 'Defective', 'Credit Voucher']);
    });

    it('service-inspection warning appears only for that condition and links to the service view', async () => {
      await toConvert();
      const { condition, card } = returnControls();
      expect(card.querySelector('.bg-amber-50')).toBeNull();
      fireEvent.change(condition, { target: { value: 'Needs service inspection' } });
      const warn = card.querySelector('.bg-amber-50');
      expect(warn.textContent).toBe('Item condition requires service inspection. Consider creating a Service Job instead of direct refund.Create Service Job');
      expect(icons(warn)).toEqual(['lucide-triangle-alert']);
      fireEvent.change(condition, { target: { value: 'Scrap' } });
      expect(card.querySelector('.bg-amber-50')).toBeNull();
      fireEvent.change(condition, { target: { value: 'Needs service inspection' } });
      fireEvent.click(btn('Create Service Job'));
      expect([probe('sub'), probe('condition'), probe('sr-show')]).toEqual(['service', 'Needs service inspection', 'false']);
    });

    it('Confirm Return and Confirm & Print are inert', async () => {
      await toConvert();
      expect([...panel().children[2].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Confirm Return', 'Confirm & Print']);
      expect(icons(panel().children[2])).toEqual(['lucide-rotate-ccw', 'lucide-printer']);
      expectInert('Confirm Return');
      expectInert('Confirm & Print');
    });

    it('Cancel and the header back button return to check, keeping selection, results and return fields', async () => {
      await toConvert();
      fireEvent.change(returnControls().qty, { target: { value: '2' } });
      fireEvent.click(btn('Cancel'));
      expect([probe('sub'), probe('selected'), probe('result'), probe('qty')]).toEqual(['check', 'item:PX-1', 'obj:1:1', '2']);
      expect(detailRows('Item Details')[0]).toBe('Item Code:PX-1');
      fireEvent.click(btn('Convert to Return'));
      expect(returnControls().qty.value).toBe('2');
      fireEvent.click(headerButtons()[0]);
      expect(probe('sub')).toBe('check');
      // dropdown internal state was unmounted with the check view
      expect(dd(0).textContent).toBe('BT');
    });

    it('header X closes from convert; a raw reopen returns to convert', async () => {
      await toConvert();
      fireEvent.click(headerButtons()[1]);
      expect(overlay()).toBeNull();
      click('raw-open');
      expect(within(header()).getByText('Convert to Return')).toBeTruthy();
    });
  });

  // ── create service job ──────────────────────────────────────────────────────────────────
  describe('create service job view', () => {
    it('header, pre-filled rows, problem fields, warranty notice', async () => {
      await toService();
      expect(within(header()).getByText('Create Service Job', { selector: 'span' })).toBeTruthy();
      expect(within(header()).getByText('Create a service repair job for this item.')).toBeTruthy();
      expect(icons(header())).toEqual(['lucide-chevron-right', 'lucide-hash', 'lucide-x']);
      const body = panel().children[1];
      expect([...body.children[0].querySelectorAll('.flex.gap-2')].map((r) => r.textContent)).toEqual(['Customer:Ahmed', 'Item:Phone X',
        'Batch No.:BT-001', 'Invoice Ref:INV-100']);
      expect(body.querySelector('textarea').placeholder).toBe('Describe the issue reported by customer...');
      const [category, priority, tech] = body.querySelectorAll('select');
      expect([...category.options].map((o) => o.textContent)).toEqual(['Select…', 'Display issue', 'Battery issue', 'Charging issue',
        'Software issue', 'Speaker/mic issue', 'Network issue', 'Camera issue', 'Physical damage', 'Water damage', 'Other']);
      expect([...priority.options].map((o) => o.textContent)).toEqual(['Normal', 'Urgent', 'High']);
      expect([...tech.options].map((o) => o.textContent)).toEqual(['Select Technician', 'Mohammed Al-Rashid', 'Rajan Kumar', 'Ali Hassan']);
      expect(body.querySelector('input[type="date"]')).toBeTruthy();
      expect(body.querySelectorAll('input, select, textarea')).toHaveLength(5);
      [...body.querySelectorAll('input, select, textarea')].forEach((f) => { expect(f.name).toBe(''); expect(f.getAttribute('value')).toBeNull(); });
      const notice = body.children[2];
      expect(notice.textContent).toBe('Item is Under Warranty. This repair may be eligible for free service. Warranty coverage will be verified by the technician.');
      expect(icons(notice)).toEqual(['lucide-shield']);
    });

    it('with no selected item the pre-filled rows are —', () => {
      open();
      click('raw-convert');
      fireEvent.change(returnControls().condition, { target: { value: 'Needs service inspection' } });
      fireEvent.click(btn('Create Service Job'));
      expect([...panel().children[1].children[0].querySelectorAll('.flex.gap-2')].map((r) => r.textContent)).toEqual(['Customer:—', 'Item:—', 'Batch No.:—', 'Invoice Ref:—']);
    });

    it('uncontrolled fields keep values across parent rerenders but reset when the view unmounts', async () => {
      await toService();
      const ta = panel().querySelector('textarea');
      fireEvent.change(ta, { target: { value: 'Screen cracked' } });
      fireEvent.change(panel().querySelectorAll('select')[1], { target: { value: 'Urgent' } });
      click('bump');
      expect(panel().querySelector('textarea')).toBe(ta);
      expect(ta.value).toBe('Screen cracked');
      fireEvent.click(btn('Cancel'));
      fireEvent.click(btn('Create Service Job'));
      expect(panel().querySelector('textarea').value).toBe('');
      expect(panel().querySelectorAll('select')[1].value).toBe('Normal');
    });

    it('Cancel and header back return to check, keeping the selection', async () => {
      await toService();
      fireEvent.click(btn('Cancel'));
      expect([probe('sub'), probe('selected')]).toEqual(['check', 'item:PX-1']);
      fireEvent.click(btn('Create Service Job'));
      fireEvent.click(headerButtons()[0]);
      expect(probe('sub')).toBe('check');
    });

    it('Create Service Job hands off: close Serial/Batch, open Service & Repair new-job at step 1 — nothing else', async () => {
      await toService();
      click('raw-sr-dirty');
      expect([probe('sr-view'), probe('sr-step')]).toEqual(['detail', '4']);
      fireEvent.change(panel().querySelector('textarea'), { target: { value: 'x' } });
      const footer = panel().children[2];
      expect([...footer.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Create Service Job']);
      expect(icons(footer)).toEqual(['lucide-wrench']);
      const before = { q: probe('query'), r: probe('result'), s: probe('selected'), qty: probe('qty') };
      fireEvent.click(within(footer).getByRole('button', { name: 'Create Service Job' }));
      expect(overlay()).toBeNull();
      expect([probe('show'), probe('sr-show'), probe('sr-view'), probe('sr-step')]).toEqual(['false', 'true', 'new-job', '1']);
      // no data travels; the sub-view is left at 'service'
      expect({ q: probe('query'), r: probe('result'), s: probe('selected'), qty: probe('qty') }).toEqual(before);
      expect(probe('sub')).toBe('service');
      click('raw-open');
      expect(within(header()).getByText('Create Service Job', { selector: 'span' })).toBeTruthy();
      expect(panel().querySelector('textarea').value).toBe('');
    });
  });
});

// ── DOM parity: reference and extracted rendered together, driven through the same script ────
describe('DOM parity (reference vs extracted)', () => {
  beforeEach(() => {
    posBatchCheck.mockResolvedValue(hits([ITEM_A, ITEM_B]));
    getProductsList.mockResolvedValue({ content: [{ itemName: 'Phone X', itemCode: 'PX-1', barcode: '999' }] });
    getSalesInvoicesPage.mockResolvedValue({ content: [{ invoiceNumber: 'INV-100' }] });
    searchCustomersAllFields.mockResolvedValue([{ name: 'Ahmed', mobile: '0501' }]);
  });

  it('identical markup through check, dropdowns, results, detail, convert, warning, service and handoff', async () => {
    const roots = [render(<SerialBatchHarness currentTerminal={TERMINAL} currentSession={SESSION} />).container,
      render(<ExtractedSerialBatchHarness currentTerminal={TERMINAL} currentSession={SESSION} />).container];
    const same = () => expect(roots[0].innerHTML).toBe(roots[1].innerHTML);
    const each = (fn) => roots.forEach((r) => fn(within(r), r));
    const press = (name) => each((w) => fireEvent.click(w.getByRole('button', { name })));
    const pressId = (id) => each((w) => fireEvent.click(w.getByTestId(id)));
    const rdd = (r, i) => r.querySelectorAll('.fixed [data-bb-skip-aed-symbol="true"]')[i];

    same();
    pressId('fn-serial-batch');
    same();
    for (let i = 0; i < 4; i += 1) {
      each((w, r) => { fireEvent.click(rdd(r, i).firstChild); fireEvent.change(rdd(r, i).querySelector('input'), { target: { value: 'q' } }); });
      await tick(400);
      same();
    }
    each((w, r) => fireEvent.click(rdd(r, 0).querySelector('.overflow-y-auto').children[0]));
    await tick(50);
    same();
    press('Search');
    same();
    await flush();
    same();
    each((w, r) => fireEvent.click(r.querySelectorAll('.space-y-2 > .cursor-pointer')[0]));
    same();
    press('Convert to Return');
    same();
    each((w, r) => {
      const [, condition] = r.querySelectorAll('.fixed select');
      fireEvent.change(r.querySelector('.fixed input[type="number"]'), { target: { value: '2' } });
      fireEvent.change(condition, { target: { value: 'Needs service inspection' } });
    });
    same();
    press('Create Service Job');
    same();
    press('Cancel');
    same();
    press('Reset');
    same();
    pressId('raw-select');
    pressId('raw-convert');
    same();
    press('Create Service Job');
    each((w, r) => fireEvent.click(r.querySelector('.fixed .bg-\\[\\#F5C742\\]')));
    same();
    pressId('raw-open');
    same();
  });
});

// ── source contract ───────────────────────────────────────────────────────────────────────
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

/** Free (unbound) identifiers of a JSX/JS snippet, via Babel scope analysis. */
const freeIdentifiers = (code) => {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const out = new Set();
  traverse(ast, {
    ReferencedIdentifier(p) {
      const { name } = p.node;
      if (p.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      if (!p.scope.hasBinding(name, true)) out.add(name);
    },
  });
  return [...out].sort();
};

describe('source contract', () => {
  const PARENT = read('../../POSSales.jsx');
  const CHILD = read('../features/products/SerialBatch.jsx');
  // the child with its header comment stripped, for scans that must ignore prose
  const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
  const TEST = read('./SerialBatch.characterization.test.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const TRADE = read('../TradePOS/TradePOSTouchScreen.jsx');
  const CONSOLE = read('../POSConsole.jsx');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* ─── SERIAL / BATCH CHECK MODAL ─── */}';
  const OPEN = '      {showSerialBatch && (() => {';
  const CLOSE = '      })()}';
  const NEXT_ANCHOR = '      {/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}';
  // sha256 of the 385-line region as it stood in POSSales.jsx immediately before the extraction
  const ORIGINAL_REGION_SHA256 = '3c1d91e8be0a061dbc113f06838279589c442095ffcaedaa0821ba16eabb16c1';

  const between = (text, a, b) => {
    const i = text.indexOf(a);
    const j = text.indexOf(b, i);
    return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
  };
  const REGION = between(TEST, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
  const STATE = between(TEST, '// STATE-VERBATIM-START', '// STATE-VERBATIM-END');
  const CALLSITE = between(TEST, '{/* CALLSITE-VERBATIM-START */}', '{/* CALLSITE-VERBATIM-END */}');
  const IIFE_BODY = REGION.split('\n').slice(2, -1);
  const SIGNATURE_END = '\n}) {\n';
  const CHILD_BODY = CHILD.slice(CHILD.indexOf(SIGNATURE_END) + SIGNATURE_END.length, CHILD.lastIndexOf('\n}\n\nexport default SerialBatch;'));
  const start = LINES.indexOf(ANCHOR);
  const end = LINES.indexOf('      )}', start);
  const PARENT_CALLSITE = LINES.slice(start, end + 1).join('\n');
  const count = (src, s) => src.split(s).length - 1;
  const uses = (src, n) => (src.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length;
  /** The region → child re-indent (8 → 2 inside the IIFE): strip six leading spaces from every non-empty line. */
  const dedent = (s) => s.split('\n').map((l) => (l === '' ? '' : l.replace(/^ {6}/, ''))).join('\n');
  /** Asserts the snippet sits in the verbatim original region AND, re-indented, in the extracted child. */
  const inBoth = (snippet) => {
    expect(REGION).toContain(snippet);
    expect(CHILD_CODE).toContain(dedent(snippet));
  };

  const STATE_NAMES = ['showSerialBatch', 'serialBatchQuery', 'serialBatchResult', 'serialBatchSubView', 'serialBatchReturnQty',
    'serialBatchReturnReason', 'serialBatchReturnCondition', 'serialBatchRefundMethod', 'serialBatchInvoiceNo', 'serialBatchItemCode',
    'serialBatchCustomerMobile', 'serialBatchSelectedItem'];
  const setterOf = (n) => `set${n[0].toUpperCase()}${n.slice(1)}`;
  const BODY_STATE = ['setShowSerialBatch', ...STATE_NAMES.slice(1).flatMap((n) => [n, setterOf(n)])];
  const CROSS = ['currentTerminal', 'currentSession', 'setShowServiceRepair', 'setServiceView', 'setServiceJobStep'];
  const PROPS = [...BODY_STATE, ...CROSS];
  const APIS = ['posBatchCheck', 'getProductsList', 'getSalesInvoicesPage', 'searchCustomersAllFields'];
  const ICONS = ['AlertCircle', 'AlertTriangle', 'ChevronRight', 'FileText', 'Hash', 'Package', 'Printer', 'RotateCcw', 'Search',
    'Shield', 'Wrench', 'X'];
  const COMPONENTS = ['AsyncSearchableDropdown', 'CurrencyAmount'];
  const GLOBALS = ['Date', 'Math', 'parseInt', 'setTimeout', 'undefined'];
  const HANDOFF = "<button onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }} className=\"bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1\"><Wrench className=\"h-3.5 w-3.5\" />Create Service Job</button>";
  const BAG = '    setShowSerialBatch, setSerialBatchQuery, setSerialBatchResult, setSerialBatchSubView,\n'
    + '    setSerialBatchInvoiceNo, setSerialBatchItemCode, setSerialBatchCustomerMobile, setSerialBatchSelectedItem,\n'
    + '    setShowServiceRepair, setServiceView, setShowReturn, setShowAddShippingDialog,\n';

  it('the pre-extraction reference is the original 385-line IIFE region, byte-for-byte', () => {
    const lines = REGION.split('\n');
    expect(lines).toHaveLength(385);
    expect(lines[0]).toBe(ANCHOR);
    expect(lines[1]).toBe(OPEN);
    expect(lines[2]).toBe("        // serialBatchResult: null | 'searching' | 'notfound' | { results, total }");
    expect(lines[383]).toBe('        );');
    expect(lines[384]).toBe(CLOSE);
    expect(lines.filter((l) => l === CLOSE)).toHaveLength(1);
    expect(crypto.createHash('sha256').update(REGION).digest('hex')).toBe(ORIGINAL_REGION_SHA256);
  });

  it('pins the exact call-site boundaries, size and siblings (source anchors, not line numbers)', () => {
    expect(count(PARENT, 'SERIAL / BATCH CHECK MODAL')).toBe(1);
    expect(start).toBeGreaterThan(-1);
    expect(LINES[start + 1]).toBe('      {showSerialBatch && (');
    expect(LINES[start + 2]).toBe('        <SerialBatch');
    expect(LINES[end - 1]).toBe('        />');
    expect(end - start + 1).toBe(33);
    expect(LINES[start - 1]).toBe('');
    expect(LINES[start - 2]).toBe('      </Dialog>');
    expect(PARENT.lastIndexOf('<Dialog open=', PARENT.indexOf(ANCHOR))).toBe(PARENT.lastIndexOf('<Dialog open={showAddCustomerDialog}', PARENT.indexOf(ANCHOR)));
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe(NEXT_ANCHOR);
    expect(LINES[end + 3]).toBe('      {showServiceRepair && (');
  });

  it('the harness call site is byte-identical to POSSales', () => {
    expect(CALLSITE).toBe(PARENT_CALLSITE);
  });

  it('call site: guard kept in the parent, exactly the 28 direct props in order, no spread, no showSerialBatch prop, one call site', () => {
    expect(PARENT_CALLSITE.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    expect(PROPS).toHaveLength(28);
    PROPS.forEach((n) => expect(PARENT_CALLSITE, n).toContain(`          ${n}={${n}}\n`));
    ['{...', '=>', 'key=', '.bind(', ' showSerialBatch='].forEach((s) => expect(PARENT_CALLSITE, s).not.toContain(s));
    expect(count(PARENT, '{showSerialBatch && ')).toBe(1);
    expect(count(PARENT, '{showSerialBatch && (\n        <SerialBatch\n')).toBe(1);
    expect(PARENT).not.toContain(OPEN);
    expect(PARENT.match(/<SerialBatch[\s/>]/g)).toHaveLength(1);
    expect(count(PARENT, "import SerialBatch from './POS/features/products/SerialBatch';")).toBe(1);
    // showSerialBatch is only the declaration + the mount guard in POSSales
    expect(uses(PARENT, 'showSerialBatch')).toBe(2);
  });

  it('child body is the IIFE body verbatim, re-indented from 8 to 2 spaces', () => {
    expect(IIFE_BODY.every((l) => l === '' || l.startsWith('        '))).toBe(true);
    expect(CHILD_BODY).toBe(dedent(IIFE_BODY.join('\n')));
    expect(CHILD_BODY.split('\n')[0]).toBe("  // serialBatchResult: null | 'searching' | 'notfound' | { results, total }");
    ['const results = ', 'const hasResults = ', 'const selectedItem = ', 'const isConvert = ', 'const isService = ',
      'const doBatchSearch = ', 'const resetBatchSearch = ', 'const fmtDate = ', 'const fmtDateTime = ']
      .forEach((d) => expect(count(CHILD_CODE, `\n  ${d}`), d).toBe(1));
  });

  it('child is a module-level component taking exactly the 28 props, no spread, no memo', () => {
    expect(CHILD).toContain(`\nfunction SerialBatch({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n`);
    expect(CHILD.match(/^function /gm)).toHaveLength(1);
    expect(CHILD).toContain('\nexport default SerialBatch;\n');
    expect(CHILD.match(/^export /gm)).toHaveLength(1);
    ['...props', '...rest', 'memo(', 'forwardRef'].forEach((s) => expect(CHILD, s).not.toContain(s));
  });

  it('child is free only in its module imports and globals; it never sees showSerialBatch', () => {
    expect(freeIdentifiers(`(<>\n${REGION}\n</>);`)).toEqual(['showSerialBatch', ...PROPS, ...APIS, ...COMPONENTS, ...ICONS, ...GLOBALS].sort());
    expect(freeIdentifiers(CHILD.replace(/^import .*$/gm, ''))).toEqual([...APIS, ...COMPONENTS, ...ICONS, ...GLOBALS].sort());
    expect(CHILD_CODE).not.toContain('showSerialBatch');
    // every Serial / Batch value except the guard is read by the child
    STATE_NAMES.slice(1).forEach((n) => expect(uses(CHILD_BODY, n), n).toBeGreaterThan(0));
  });

  it('child imports exactly React, the 12 icons, the 4 APIs, AsyncSearchableDropdown and CurrencyAmount', () => {
    expect(CHILD.match(/^import .*$/gm)).toEqual([
      "import React from 'react';",
      `import { ${ICONS.join(', ')} } from 'lucide-react';`,
      "import { posBatchCheck } from '../../../../../api/posApi';",
      "import { getProductsList } from '../../../../../api/productsApi';",
      "import { getSalesInvoicesPage } from '../../../../../api/salesInvoiceApi';",
      "import { searchCustomersAllFields } from '../../../../../api/customerledgerApi';",
      "import AsyncSearchableDropdown from '../../../../../components/AsyncSearchableDropdown';",
      "import { CurrencyAmount } from '../../POSCurrency';",
    ]);
    const fromChild = (rel) => path.resolve(__dirname, '../features/products', rel);
    expect(fromChild('../../../../../api/posApi')).toBe(path.resolve(__dirname, '../../../../api/posApi'));
    expect(fromChild('../../../../../components/AsyncSearchableDropdown')).toBe(path.resolve(__dirname, '../../../../components/AsyncSearchableDropdown'));
    expect(fromChild('../../POSCurrency')).toBe(path.resolve(__dirname, '../POSCurrency'));
  });

  it('exact API call sites and argument shapes — all four APIs moved with the child and nowhere else in POSSales', () => {
    for (const [api, calls] of [['posBatchCheck(', 2], ['getProductsList(', 1], ['getSalesInvoicesPage(', 1], ['searchCustomersAllFields(', 1]]) {
      expect(count(REGION, api), api).toBe(calls);
      expect(count(CHILD_CODE, api), api).toBe(calls);
      expect(count(PARENT, api), api).toBe(0);
    }
    // explicit Search handler (trimmed)
    inBoth('            const res = await posBatchCheck({ batchNumber: q, invoiceNumber: inv, itemCode: ic, customerMobile: mob });\n');
    // AsyncSearchableDropdown.fetchOptions (untrimmed)
    inBoth('                          const res = await posBatchCheck({ batchNumber: query, invoiceNumber: serialBatchInvoiceNo, itemCode: serialBatchItemCode, customerMobile: serialBatchCustomerMobile });\n');
    inBoth('                              const posBranchId = currentTerminal?.branchId || currentSession?.branchId;\n'
      + '                              const res = await getProductsList(0, 5, query, undefined, null, null, null, true, posBranchId);\n');
    inBoth('                              const res = await getSalesInvoicesPage({ search: query, size: 5 });\n');
    inBoth('                              const res = await searchCustomersAllFields(query);\n');
    expect(count(REGION, 'currentTerminal?.branchId || currentSession?.branchId')).toBe(1);
    expect(count(CHILD_CODE, 'currentTerminal?.branchId || currentSession?.branchId')).toBe(1);
    expect(count(CHILD_CODE, 'fetchOptions={async (query) => {')).toBe(4);
    expect(count(CHILD_CODE, 'if (!query) return [];')).toBe(4);
    expect(count(CHILD_CODE, 'catch { return []; }')).toBe(4);
    // fetchOptions call sites vs the doBatchSearch call site
    const fetchStarts = [...CHILD_CODE.matchAll(/fetchOptions=\{async \(query\) => \{/g)].map((m) => m.index);
    const inFetch = (i) => fetchStarts.some((s) => i > s && i < CHILD_CODE.indexOf('renderOption=', s));
    const sites = (name) => [...CHILD_CODE.matchAll(new RegExp(`${name}\\(`, 'g'))].map((m) => inFetch(m.index));
    expect(sites('posBatchCheck')).toEqual([false, true]);
    expect(sites('getProductsList')).toEqual([true]);
    expect(sites('getSalesInvoicesPage')).toEqual([true]);
    expect(sites('searchCustomersAllFields')).toEqual([true]);
  });

  it('async / timing constants: doBatchSearch, trims, 50ms follow-ups, one explicit debounce', () => {
    inBoth(`        const doBatchSearch = async () => {
          const q = serialBatchQuery.trim();
          const inv = serialBatchInvoiceNo.trim();
          const ic = serialBatchItemCode.trim();
          const mob = serialBatchCustomerMobile.trim();
          if (!q && !inv && !ic && !mob) { setSerialBatchResult('notfound'); return; }
          setSerialBatchResult('searching');
          setSerialBatchSelectedItem(null);
          try {
            const res = await posBatchCheck({ batchNumber: q, invoiceNumber: inv, itemCode: ic, customerMobile: mob });
            setSerialBatchResult(res.total > 0 ? res : 'notfound');
          } catch { setSerialBatchResult('notfound'); }
        };`);
    for (const src of [REGION, CHILD_CODE]) {
      expect(count(src, 'setTimeout(() => doBatchSearch(), 50);')).toBe(4);
      expect(count(src, 'setTimeout(')).toBe(4);
      expect(count(src, 'debounceMs={400}')).toBe(1);
      expect(count(src, 'debounceMs=')).toBe(1);
      expect(count(src, 'await ')).toBe(5);
      expect(count(src, 'async ')).toBe(5);
      expect(count(src, 'onClick={doBatchSearch}')).toBe(1);
      expect(count(src, 'onClick={resetBatchSearch}')).toBe(1);
    }
    expect(PARENT).not.toContain('doBatchSearch');
    inBoth("        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';\n");
    inBoth("        const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';\n");
  });

  it('component / icon usage counts are identical in the original region and the child', () => {
    for (const src of [REGION, CHILD_CODE]) {
      expect(count(src, '<AsyncSearchableDropdown')).toBe(4);
      expect(count(src, '<CurrencyAmount ')).toBe(3);
      expect(Object.fromEntries(ICONS.map((n) => [n, count(src, `<${n} `)]))).toEqual({
        AlertCircle: 1, AlertTriangle: 1, ChevronRight: 2, FileText: 1, Hash: 2, Package: 1, Printer: 1, RotateCcw: 3, Search: 1,
        Shield: 1, Wrench: 2, X: 2,
      });
      expect(count(src, '<button')).toBe(15);
      // 13 of the 15 buttons (Confirm Return / Confirm & Print have none) + the backdrop + the result row
      expect(count(src, 'onClick=')).toBe(15);
    }
  });

  it('exact setter writes, including the unchanged Service & Repair handoff, now live only in the child', () => {
    expect(count(REGION, HANDOFF)).toBe(1);
    expect(count(CHILD_CODE, HANDOFF)).toBe(1);
    expect(count(PARENT, HANDOFF)).toBe(0);
    const SETTERS = [...BODY_STATE.filter((n) => n.startsWith('set')), 'setShowServiceRepair', 'setServiceView', 'setServiceJobStep'];
    const EXPECTED = {
      setShowSerialBatch: 4, setSerialBatchQuery: 2, setSerialBatchResult: 5, setSerialBatchSubView: 7, setSerialBatchReturnQty: 1,
      setSerialBatchReturnReason: 1, setSerialBatchReturnCondition: 1, setSerialBatchRefundMethod: 1, setSerialBatchInvoiceNo: 3,
      setSerialBatchItemCode: 3, setSerialBatchCustomerMobile: 2, setSerialBatchSelectedItem: 4,
      setShowServiceRepair: 1, setServiceView: 1, setServiceJobStep: 1,
    };
    expect(Object.fromEntries(SETTERS.map((n) => [n, count(REGION, `${n}(`)]))).toEqual(EXPECTED);
    expect(Object.fromEntries(SETTERS.map((n) => [n, count(CHILD_CODE, `${n}(`)]))).toEqual(EXPECTED);
    SETTERS.forEach((n) => expect(count(PARENT, `${n}(`), n).toBe(0));
    for (const src of [REGION, CHILD_CODE]) {
      expect(count(src, 'setShowSerialBatch(false)')).toBe(4);
      expect(count(src, "setSerialBatchSubView('convert')")).toBe(1);
      expect(count(src, "setSerialBatchSubView('service')")).toBe(2);
      expect(count(src, "setSerialBatchSubView('check')")).toBe(4);
      // setter references passed by value (not called)
      ['onInputChange={setSerialBatchQuery}', 'onInputChange={setSerialBatchItemCode}', 'onInputChange={setSerialBatchInvoiceNo}',
        'onInputChange={setSerialBatchCustomerMobile}'].forEach((s) => expect(count(src, s), s).toBe(1));
      // Confirm Return / Confirm & Print have no handler
      expect(src).toContain('<button className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Confirm Return</button>');
      expect(src).toContain('<button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Confirm &amp; Print</button>');
    }
  });

  it('the child owns no hooks, state, refs, effects, context, memo, portals or subscriptions', () => {
    ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect',
      'Context', 'memo(', 'createPortal', 'ref=', 'Ref.current', 'addEventListener', 'subscribe', '<Dialog', 'onKeyDown', 'autoFocus',
      'fetch(', 'axios', 'key={selectedItem', 'clearTimeout', 'Provider']
      .forEach((s) => {
        expect(REGION, s).not.toContain(s);
        expect(CHILD_CODE, s).not.toContain(s);
      });
    expect(CHILD_CODE).not.toMatch(/\buse[A-Z]/);
  });

  it('has no hidden cart / invoice / feedback / settings / customer / product-entry dependency', () => {
    ['currentInvoice', 'checkoutPayment', 'posSettings', 'xReportData', 'syncPosData', 'showFeedback', 'formatCurrency',
      'selectedCustomer', 'handleProductSelection', 'sessionId', 'currentBusinessDay', 'showServiceRepair', 'serviceView ',
      'serviceJobStep ', 'showPOSConfig', 'renderAED', 'DirhamSymbol']
      .forEach((name) => expect(CHILD_CODE, name).not.toContain(name));
  });

  it('the 12 state declarations are byte-identical to POSSales, contiguous, and declared exactly once', () => {
    expect(STATE).toBe([
      '  // Serial / Batch Check modal',
      '  const [showSerialBatch, setShowSerialBatch] = useState(false);',
      "  const [serialBatchQuery, setSerialBatchQuery] = useState('');",
      '  const [serialBatchResult, setSerialBatchResult] = useState(null);',
      "  const [serialBatchSubView, setSerialBatchSubView] = useState('check');",
      '  const [serialBatchReturnQty, setSerialBatchReturnQty] = useState(1);',
      "  const [serialBatchReturnReason, setSerialBatchReturnReason] = useState('');",
      "  const [serialBatchReturnCondition, setSerialBatchReturnCondition] = useState('');",
      "  const [serialBatchRefundMethod, setSerialBatchRefundMethod] = useState('Cash Back');",
      "  const [serialBatchInvoiceNo, setSerialBatchInvoiceNo] = useState('');",
      "  const [serialBatchItemCode, setSerialBatchItemCode] = useState('');",
      "  const [serialBatchCustomerMobile, setSerialBatchCustomerMobile] = useState('');",
      '  const [serialBatchSelectedItem, setSerialBatchSelectedItem] = useState(null);',
    ].join('\n'));
    expect(PARENT).toContain(`\n${STATE}\n  // Service & Repair view\n`);
    STATE_NAMES.forEach((n) => expect(count(PARENT, `const [${n}, ${setterOf(n)}] = useState(`), n).toBe(1));
    expect(PARENT.match(/const \[(showSerialBatch|serialBatch\w+), /g)).toHaveLength(12);
  });

  it('state ownership: POSSales only — no hook, context, reducer or provider owns Serial / Batch; the only feature file is the child', () => {
    expect(PARENT).not.toMatch(/useSerialBatch|SerialBatchContext|SerialBatchProvider|serialBatchReducer/);
    const hookDir = path.resolve(__dirname, '../features');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const featureFiles = walk(hookDir);
    featureFiles.forEach((f) => expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/useState\([^)]*\)[^\n]*serialBatch|serialBatch\w*\] = useState|useSerialBatch|SerialBatchContext/));
    expect(featureFiles.filter((f) => /serial.?batch/i.test(path.basename(f)))).toEqual([path.resolve(__dirname, '../features/products/SerialBatch.jsx')]);
    expect(fs.existsSync(path.resolve(__dirname, '../features/serialBatch'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, '../features/service/SerialBatch.jsx'))).toBe(false);
  });

  it('POSSales imports: the 4 APIs, AsyncSearchableDropdown and Wrench left with the child; everything else stays', () => {
    [
      "import { createProduct, validateDuplicateProduct, createProductFromPos, validateDuplicateProductFromPos } from '../../api/productsApi';",
      "import { getAllCustomers, createCustomer, validateDuplicateCustomer } from '../../api/customerledgerApi';",
      "import { sendSalesInvoiceEmail, getSalesInvoiceById, getAllSalesInvoices, getNextInvoiceNumber } from '../../api/salesInvoiceApi';",
      '  posCreditBalance, getPosInvoices, lookupPosInvoice,',
      "import { DirhamSymbol, DenominationLabel, CurrencyAmount, DenominationAmount, renderAED, setActiveCurrency } from './POS/POSCurrency';",
      "import SerialBatch from './POS/features/products/SerialBatch';",
    ].forEach((line) => expect(count(PARENT, `\n${line}\n`), line).toBe(1));
    [...APIS, 'AsyncSearchableDropdown', 'Wrench'].forEach((n) => expect(uses(PARENT, n), n).toBe(0));
    ICONS.filter((n) => n !== 'Wrench').forEach((icon) => expect(PARENT, icon).toMatch(new RegExp(`^  ${icon},$`, 'm')));
    ['CurrencyAmount', ...ICONS.filter((n) => n !== 'Wrench')].forEach((n) => expect(uses(PARENT, n), n).toBeGreaterThan(1));
    ['currentTerminal', 'currentSession'].forEach((n) => expect(uses(PARENT.replace(PARENT_CALLSITE, ''), n), n).toBeGreaterThan(10));
    expect(PARENT).toContain('    currentSession, setCurrentSession,\n    currentTerminal, setCurrentTerminal,\n');
  });

  it('writers outside the child: only the POSTouchScreen opener (via the unchanged touch prop bag); no other POSSales write', () => {
    const OPENER = "action: () => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setSerialBatchInvoiceNo(''); setSerialBatchItemCode(''); setSerialBatchCustomerMobile(''); setSerialBatchSelectedItem(null); setShowSerialBatch(true); } },";
    expect(count(TOUCH, OPENER)).toBe(1);
    expect(TEST).toContain(`onClick={() => { ${OPENER.slice('action: () => { '.length, -' } },'.length)} }}`);
    expect(count(PARENT, BAG)).toBe(1);
    expect(count(TOUCH, BAG)).toBe(1);
    const outside = PARENT.replace(PARENT_CALLSITE, '').replace(STATE, '').replace(BAG, '')
      .replace("import SerialBatch from './POS/features/products/SerialBatch';\n", '');
    expect(outside).not.toMatch(/serialBatch|SerialBatch/);
    ['setSerialBatchReturnQty', 'setSerialBatchReturnReason', 'setSerialBatchReturnCondition', 'setSerialBatchRefundMethod']
      .forEach((n) => expect(TOUCH, n).not.toContain(n));
    expect(TOUCH.match(/serialBatch|SerialBatch/g)).toHaveLength(16);
    expect(TOUCH).not.toMatch(/<SerialBatch\b|SerialBatch from/);
    expect(TRADE).not.toMatch(/serialBatch|SerialBatch/);
    expect(CONSOLE).not.toMatch(/serialBatch|SerialBatch/);
  });

  it('architecture pin stays consistent with this extraction', () => {
    const ARCH = read('./POSSalesArchitecture.characterization.test.jsx');
    expect(ARCH).toContain("['serial / batch modal (in SerialBatch)', '{showSerialBatch && (\\n        <SerialBatch'],");
    expect(ARCH).toContain("['SerialBatch', './POS/features/products/SerialBatch', 1],");
  });
});

// keep lint honest about imports used only inside the verbatim region
void [AlertCircle, AlertTriangle, ChevronRight, FileText, Hash, Package, Printer, RotateCcw, Search, Shield, Wrench, X,
  AsyncSearchableDropdown, CurrencyAmount, React, SerialBatch];
