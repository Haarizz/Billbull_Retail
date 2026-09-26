import fs from 'node:fs';
import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AlertCircle, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/posApi', () => ({ resolvePosEntry: vi.fn() }));
vi.mock('../../../../api/productsApi', () => ({ getProductsList: vi.fn() }));

import { resolvePosEntry } from '../../../../api/posApi';
import { getProductsList } from '../../../../api/productsApi';
import AsyncSearchableDropdown from '../../../../components/AsyncSearchableDropdown';
import { getImageUrl } from '../../../../utils/urlUtils';
import { DirhamSymbol } from '../POSCurrency';
import { toNumber, mapPosProductListItem, mapPosProductAggregateItem } from '../posUtils';
import PriceCheck from '../features/products/PriceCheck';

const traverse = traverseModule.default || traverseModule;

// jsdom has no scrollIntoView; AsyncSearchableDropdown calls it on ArrowUp/ArrowDown.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

/**
 * CHARACTERIZATION — the POSSales.jsx "Price Check" modal.
 *
 * The region is now rendered by POS/features/products/PriceCheck.jsx. The extraction is a
 * presentation move only: the three Price Check useState declarations (and setters), usePosSession
 * (currentTerminal, currentSession), useProductEntry (handleProductSelection) and the
 * `showPriceCheck &&` mount condition all stay in POSSales. The child receives exactly the 9
 * bindings below under their ORIGINAL POSSales names, and keeps the region's two direct lookups
 * (resolvePosEntry, getProductsList) — POSSales no longer imports either for this modal.
 *
 * Pre-extraction region: POSSales.jsx:9585–9764 (180 lines) — `{/* ─── PRICE CHECK MODAL ─── *\/}`
 * anchor, then `{showPriceCheck && (() => { ... })()}`. An IIFE that declares six derived pricing
 * consts and an async `doSearch`, then returns ONE hand-rolled fixed overlay: no Radix Dialog, no
 * portal, no key, no ref, no hooks, no nested dialog. Conditionally MOUNTED: closing unmounts the
 * whole tree, including AsyncSearchableDropdown's internal state (open flag, options, highlighted
 * index). Siblings: the Legacy Layaways <Dialog> above, the SEARCH PRODUCTS MODAL call site below.
 *
 * Two harnesses; every behavioural describe runs against BOTH:
 *   - `PriceCheckHarness` (reference): the PRE-EXTRACTION region copied VERBATIM (REGION markers),
 *   - `ExtractedPriceCheckHarness`: the POSSales call site copied VERBATIM (CALLSITE markers),
 *     rendering the shipped component.
 * The `source contract` block asserts the child's body is the reference IIFE body re-indented,
 * and the call site is byte-identical to POSSales.
 * Both reproduce the parent side exactly: the three useState declarations copied VERBATIM (STATE
 * markers), POSTouchScreen's 'price-chk' action as the ONLY opener, handleProductSelection as a
 * spy (POSSales gets it from useProductEntry), currentTerminal/currentSession as plain props
 * (POSSales gets them from usePosSession). APIs are mocked at the module boundary.
 *
 * Direct dependency surface (9 POSSales bindings, derived from the parsed region):
 *   POSSales useState:  showPriceCheck, setShowPriceCheck, priceCheckQuery, setPriceCheckQuery,
 *                       priceCheckResult, setPriceCheckResult
 *   usePosSession:      currentTerminal, currentSession   (read-only: branch header on product lookups)
 *   useProductEntry:    handleProductSelection            (the only write/orchestration hand-off)
 *   module imports:     resolvePosEntry (posApi), getProductsList (productsApi), toNumber,
 *                       mapPosProductListItem, mapPosProductAggregateItem (posUtils),
 *                       AsyncSearchableDropdown, DirhamSymbol, lucide Search/X/AlertCircle/ShoppingCart/Plus
 *   globals:            Array, undefined
 *
 * `priceCheckResult` is a tagged union: null (idle) | 'searching' | 'notfound' | mapped product.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - Two independent lookup paths: the Search button (`doSearch`, page size 1, TRIMMED query) and
 *     the dropdown's `fetchOptions` (page size 10, UNTRIMMED query, 300ms debounce inside
 *     AsyncSearchableDropdown). Enter in the dropdown never runs doSearch.
 *   - A resolver that throws goes straight to 'notfound' / [] — the product-list fallback is skipped.
 *   - No error UI: every failure renders the 'notfound' state (dropdown: "No results found.").
 *   - doSearch has no cancellation / sequencing: the LAST promise to settle wins, and a lookup that
 *     settles after the modal closed still writes priceCheckResult (a raw reopen shows it).
 *   - The dropdown's debounced fetch uses the fetchOptions closure from the render in which the
 *     debounce started, so a terminal change mid-debounce queries the OLD branch.
 *   - Close (X / footer / backdrop) does NOT reset query/result; only the opener, Clear and Add to
 *     Cart do. No Escape handling at modal level; no autofocus on mount.
 *   - `salesTax: null` (what the mappers emit when tax is missing) gives VAT 0%, not the 5%
 *     fallback: toNumber(null, 5) === 0 because Number(null) is finite.
 *   - Add to Cart calls handleProductSelection(foundProduct) with ONE argument, ignores the return
 *     value ({ ok:false } is silent) and always closes + resets.
 *   - The dropdown row shows the raw `{price} AED` (no toFixed / currency component).
 */

// ── harness ─────────────────────────────────────────────────────────────────────────────
const probeState = { result: undefined, renders: 0 };
const fmtResult = (r) => (r === null ? 'null' : typeof r === 'string' ? r : `obj:${r.id}`);

function ParentProbes({ setShowPriceCheck, setPriceCheckQuery, setPriceCheckResult, priceCheckQuery, priceCheckResult, bump }) {
  useEffect(() => { probeState.result = priceCheckResult; });
  return (
    <>
      <button
        data-testid="fn-price-check"
        onClick={() => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); }}
      >
        fn
      </button>
      <button data-testid="raw-open" onClick={() => setShowPriceCheck(true)}>raw-open</button>
      <button data-testid="raw-close" onClick={() => setShowPriceCheck(false)}>raw-close</button>
      <button data-testid="bump" onClick={bump}>bump</button>
      <span data-testid="probe-query">{priceCheckQuery}</span>
      <span data-testid="probe-result">{fmtResult(priceCheckResult)}</span>
    </>
  );
}

// ── reference: the POSSales region, verbatim ────────────────────────────────────────────
function PriceCheckHarness({ currentTerminal, currentSession, handleProductSelection }) {
  // STATE-VERBATIM-START
  // Price Check modal
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState('');
  const [priceCheckResult, setPriceCheckResult] = useState(null);
  // STATE-VERBATIM-END
  const [, setTick] = useState(0);
  useEffect(() => { probeState.renders += 1; });

  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ setShowPriceCheck, setPriceCheckQuery, setPriceCheckResult, priceCheckQuery, priceCheckResult }} bump={() => setTick((t) => t + 1)} />
      {/* REGION-VERBATIM-START */}
      {/* ─── PRICE CHECK MODAL ─── */}
      {showPriceCheck && (() => {
        const foundProduct = priceCheckResult && priceCheckResult !== 'searching' && priceCheckResult !== 'notfound' ? priceCheckResult : null;
        const vatRate = foundProduct ? toNumber(foundProduct.salesTax, 5) : 5;
        const basePrice = foundProduct ? toNumber(foundProduct.price, 0) : 0;
        const discountPct = foundProduct ? toNumber(foundProduct.defaultDiscount, 0) : 0;
        const discountedPrice = basePrice * (1 - discountPct / 100);
        const finalPrice = discountedPrice * (1 + vatRate / 100);
        const doSearch = async () => {
          const q = priceCheckQuery.trim();
          if (!q) { setPriceCheckResult('notfound'); return; }
          setPriceCheckResult('searching');
          try {
            // Try unified resolver first (handles barcode, batch, product code)
            const resolved = await resolvePosEntry(q);
            if (resolved?.type === 'PRODUCT' && resolved.product) {
              setPriceCheckResult(mapPosProductAggregateItem(resolved.product, q));
              return;
            }
            // Fallback: name/keyword search via product list
            const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
            const searchData = await getProductsList(0, 1, q, undefined, null, null, null, true, posBranchId);
            if (Array.isArray(searchData?.content) && searchData.content.length > 0) {
              setPriceCheckResult(mapPosProductListItem(searchData.content[0]));
              return;
            }
            setPriceCheckResult('notfound');
          } catch { setPriceCheckResult('notfound'); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowPriceCheck(false)} />
            <div className="relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-6 py-4 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2.5"><Search className="h-5 w-5 text-cyan-600" /><span className="text-lg font-bold text-[#1E293B]">Price Check</span></div>
                  <p className="text-sm text-gray-500 mt-1">Scan or search an item to check price, stock, barcode, and product details.</p>
                </div>
                <button onClick={() => setShowPriceCheck(false)} className="text-gray-400 hover:text-[#1E293B] transition-colors"><X className="h-6 w-6" /></button>
              </div>
              {/* Search */}
              <div className="bg-white border-b border-gray-100 px-6 py-4 flex gap-3 shrink-0">
                <div className="relative flex-1">
                  <AsyncSearchableDropdown
                    value={null}
                    inputValue={priceCheckQuery}
                    onInputChange={setPriceCheckQuery}
                    placeholder="Scan barcode or type item name / code..."
                    fetchOptions={async (query) => {
                      if (!query) return [];
                      try {
                        const resolved = await resolvePosEntry(query);
                        if (resolved?.type === 'PRODUCT' && resolved.product) {
                          return [mapPosProductAggregateItem(resolved.product, query)];
                        }
                        const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
                        const searchData = await getProductsList(0, 10, query, undefined, null, null, null, true, posBranchId);
                        if (Array.isArray(searchData?.content)) {
                          return searchData.content.map(p => mapPosProductListItem(p));
                        }
                      } catch { return []; }
                      return [];
                    }}
                    renderOption={(opt, active) => (
                      <div className="flex items-center gap-3 p-2">
                        {opt.image ? (
                          <img src={opt.image.startsWith('data:') || opt.image.startsWith('http') ? opt.image : `data:image/jpeg;base64,${opt.image}`} alt="" className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0"><Search className="h-5 w-5 text-gray-400" /></div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-sm text-gray-900 leading-tight truncate">{opt.name}</p>
                          <p className="text-xs text-gray-500 leading-tight truncate">{opt.code} {opt.barcode ? `| ${opt.barcode}` : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-[#327F74] text-sm">{opt.price} AED</p>
                          <p className="text-[10px] text-gray-500">Stock: {opt.stock}</p>
                        </div>
                      </div>
                    )}
                    onSelect={(opt) => {
                      if (opt) {
                        setPriceCheckQuery(opt.name || opt.code || '');
                        setPriceCheckResult(opt);
                      }
                    }}
                    className="w-full text-base"
                    debounceMs={300}
                  />
                </div>
                <button onClick={doSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0"><Search className="h-4 w-4" />Search</button>
                <button onClick={() => { setPriceCheckQuery(''); setPriceCheckResult(null); }} className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shrink-0">Clear</button>
              </div>
              <div className="overflow-auto flex-1 p-6">
                {priceCheckResult === null && (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                    <Search className="h-12 w-12 text-gray-300 mb-4" />
                    <p className="text-sm font-medium text-gray-500">Scan a barcode or type an item name to check price and availability.</p>
                  </div>
                )}
                {priceCheckResult === 'searching' && (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                    <div className="w-10 h-10 border-4 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin mb-4" />
                    <p className="text-sm font-medium text-gray-500">Searching...</p>
                  </div>
                )}
                {priceCheckResult === 'notfound' && (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                    <AlertCircle className="h-12 w-12 text-red-300 mb-4" />
                    <p className="text-sm font-medium text-gray-500">No item found for the scanned barcode or search keyword.</p>
                  </div>
                )}
                {foundProduct && (
                  <div className="space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-2xl p-5 flex flex-col md:flex-row gap-6 shadow-sm">
                      {/* Left: Image & Details */}
                      <div className="flex flex-col sm:flex-row flex-1 gap-5">
                        <div className="w-28 h-28 shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                          {foundProduct.image
                            ? <img src={foundProduct.image} className="w-full h-full object-cover" alt={foundProduct.name} />
                            : <ShoppingCart className="w-8 h-8 text-gray-300" />}
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-3">
                          <div>
                            <h3 className="text-lg font-bold text-[#1E293B] leading-tight">{foundProduct.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{foundProduct.departmentName || 'General Department'}</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-1">
                            <div className="flex flex-col"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Item Code</span><span className="font-mono text-[#1E293B] font-semibold mt-0.5">{foundProduct.code}</span></div>
                            <div className="flex flex-col"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Barcode</span><span className="font-mono text-[#1E293B] font-semibold mt-0.5">{foundProduct.barcode}</span></div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Pricing & Stock */}
                      <div className="md:w-64 shrink-0 bg-gray-50 rounded-xl p-4 flex flex-col justify-center border border-gray-100 relative">
                        <div className="absolute -top-3 right-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm border ${foundProduct.stock > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {foundProduct.stock > 0 ? `${foundProduct.stock} in Stock` : 'Out of Stock'}
                          </span>
                        </div>

                        <div className="text-center mt-3 mb-4">
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Selling Price</p>
                          <div className="text-3xl font-black text-[#327F74] flex items-center justify-center gap-1">
                            <DirhamSymbol /> {finalPrice.toFixed(2)}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1.5 font-medium">VAT {vatRate}% Included</p>
                        </div>

                        <div className="space-y-1.5 pt-3 border-t border-gray-200">
                          <div className="flex justify-between text-[11px] font-semibold">
                            <span className="text-gray-500">Base Price:</span>
                            <span className="text-[#1E293B]"><DirhamSymbol /> {basePrice.toFixed(2)}</span>
                          </div>
                          {discountPct > 0 && (
                            <div className="flex justify-between text-[11px] text-orange-600 font-bold">
                              <span>Discount ({discountPct}%):</span>
                              <span>−<DirhamSymbol /> {(basePrice - discountedPrice).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 border-t border-gray-200 px-3 sm:px-6 py-4 flex flex-wrap justify-end gap-3 shrink-0">
                <button onClick={() => setShowPriceCheck(false)} className="bg-white border border-gray-300 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Close</button>
                {foundProduct && (
                  <button onClick={() => { handleProductSelection(foundProduct); setShowPriceCheck(false); setPriceCheckQuery(''); setPriceCheckResult(null); }}
                    className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors">
                    <Plus className="h-4 w-4" />Add to Cart
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── extracted: the POSSales call site, verbatim, rendering the shipped PriceCheck ─────────
function ExtractedPriceCheckHarness({ currentTerminal, currentSession, handleProductSelection }) {
  // Price Check modal
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState('');
  const [priceCheckResult, setPriceCheckResult] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => { probeState.renders += 1; });

  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ setShowPriceCheck, setPriceCheckQuery, setPriceCheckResult, priceCheckQuery, priceCheckResult }} bump={() => setTick((t) => t + 1)} />
      {/* CALLSITE-VERBATIM-START */}
      {/* ─── PRICE CHECK MODAL ─── */}
      {showPriceCheck && (
        <PriceCheck
          showPriceCheck={showPriceCheck}
          setShowPriceCheck={setShowPriceCheck}
          priceCheckQuery={priceCheckQuery}
          setPriceCheckQuery={setPriceCheckQuery}
          priceCheckResult={priceCheckResult}
          setPriceCheckResult={setPriceCheckResult}
          currentTerminal={currentTerminal}
          currentSession={currentSession}
          handleProductSelection={handleProductSelection}
        />
      )}
      {/* CALLSITE-VERBATIM-END */}
    </div>
  );
}

const HARNESSES = { reference: PriceCheckHarness, extracted: ExtractedPriceCheckHarness };
let Harness = PriceCheckHarness;

// ── fixtures ────────────────────────────────────────────────────────────────────────────
const TERMINAL = { terminalId: 'T1', branchId: 'B1' };
const SESSION = { id: 'S1', branchId: 'B-SESSION' };
const TITLE = 'Price Check';
const SUBTITLE = 'Scan or search an item to check price, stock, barcode, and product details.';
const PLACEHOLDER = 'Scan barcode or type item name / code...';
const IDLE = 'Scan a barcode or type an item name to check price and availability.';
const NOT_FOUND = 'No item found for the scanned barcode or search keyword.';

// resolver aggregate: price 100, discount 10%, VAT 5% -> 90 -> 94.50
const aggregate = (o = {}) => ({
  product: { id: 'p1', code: 'C1', name: 'Widget', barcode: 'BC-1', department: { id: 'd1', name: 'Tools' }, maxDiscount: 10 },
  effectivePricing: { retailPrice: 100 },
  stock: 7,
  tax: { salesTax: 5 },
  ...o,
});
const resolved = (o) => ({ type: 'PRODUCT', product: aggregate(o) });
// list DTO: price 20, no discount, VAT 15% -> 23.00, out of stock, no department
const listDto = (o = {}) => ({ id: 'L1', code: 'L-1', name: 'Listed', barcode: 'LB', retailPrice: 20, stock: 0, salesTax: 15, maxDiscount: 0, departmentName: '', ...o });
const page = (content) => ({ content, page: 0, totalPages: 1, totalElements: content.length });

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const tick = async (ms = 0) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };

let handleProductSelection;

const renderHarness = (props = {}) => {
  const p = { currentTerminal: TERMINAL, currentSession: SESSION, handleProductSelection, ...props };
  const H = Harness;
  const utils = render(<H {...p} />);
  const rerender = (next = {}) => utils.rerender(<H {...p} {...next} />);
  return { ...utils, rerender };
};

const openFn = () => fireEvent.click(screen.getByTestId('fn-price-check'));
const isOpen = () => screen.queryByText(TITLE) !== null;
const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const ddRoot = () => document.querySelector('[data-bb-skip-aed-symbol="true"]');
const expand = () => fireEvent.click(ddRoot().firstChild);
const ddInput = () => screen.queryByPlaceholderText(PLACEHOLDER);
const type = (v) => fireEvent.change(ddInput(), { target: { value: v } });
const options = () => [...(ddRoot().querySelector('.overflow-y-auto')?.children || [])];
const btn = (name) => screen.getByRole('button', { name });
const qbtn = (name) => screen.queryByRole('button', { name });
const clickSearch = async () => { fireEvent.click(btn('Search')); await flush(); };
const overlay = () => screen.getByText(TITLE).closest('.fixed');
const headerClose = () => overlay().querySelector('.border-b button');
const sellingPrice = () => screen.getByText('Selling Price').nextSibling.textContent;

/** Types into the expanded dropdown and lets the Search button run doSearch. */
const searchVia = async (query) => {
  expand();
  type(query);
  await clickSearch();
};

beforeEach(() => {
  vi.useFakeTimers();
  probeState.result = undefined;
  probeState.renders = 0;
  resolvePosEntry.mockReset().mockResolvedValue({ type: 'NOT_FOUND' });
  getProductsList.mockReset().mockResolvedValue(page([]));
  handleProductSelection = vi.fn(() => ({ ok: true }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each([['reference'], ['extracted']])('%s', (variant) => {
  beforeEach(() => { Harness = HARNESSES[variant]; });

  // ── closed / open ─────────────────────────────────────────────────────────────────────────
  describe('closed / open', () => {
    it('renders nothing and calls no API while closed', async () => {
      renderHarness();
      await tick(1000);
      expect(isOpen()).toBe(false);
      expect(ddRoot()).toBeNull();
      expect(resolvePosEntry).not.toHaveBeenCalled();
      expect(getProductsList).not.toHaveBeenCalled();
    });

    it('the POSTouchScreen opener resets query + result and mounts the modal', () => {
      renderHarness();
      openFn();
      expect(isOpen()).toBe(true);
      expect(screen.getByText(SUBTITLE)).toBeTruthy();
      expect(probe('query')).toBe('');
      expect(probe('result')).toBe('null');
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
      expect(qbtn('Search')).toBeTruthy();
      expect(qbtn('Clear')).toBeTruthy();
      expect(qbtn('Add to Cart')).toBeNull();
    });

    it('is a plain fixed overlay mounted inline (no portal, no dialog role, backdrop + panel)', () => {
      renderHarness();
      openFn();
      const o = overlay();
      expect(o.className).toBe('fixed inset-0 z-50 flex items-center justify-center p-4');
      expect(screen.getByTestId('pos-root').contains(o)).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(o.children).toHaveLength(2);
      expect(o.children[0].className).toBe('absolute inset-0 bg-black/50');
      expect(o.children[1].className).toBe('relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden');
      // header, search bar, body, footer
      expect(o.children[1].children).toHaveLength(4);
    });

    it('closing unmounts the whole tree', () => {
      renderHarness();
      openFn();
      fireEvent.click(screen.getByTestId('raw-close'));
      expect(isOpen()).toBe(false);
      expect(ddRoot()).toBeNull();
      expect(screen.queryByText(IDLE)).toBeNull();
    });
  });

  // ── initial state ─────────────────────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('shows the idle prompt, a collapsed dropdown with no input and nothing focused', async () => {
      renderHarness();
      openFn();
      expect(screen.getByText(IDLE)).toBeTruthy();
      expect(screen.queryByText('Searching...')).toBeNull();
      expect(screen.queryByText(NOT_FOUND)).toBeNull();
      expect(ddInput()).toBeNull();
      expect(ddRoot().textContent).toContain(PLACEHOLDER);
      expect(document.activeElement).toBe(document.body);
      await tick(1000);
      expect(resolvePosEntry).not.toHaveBeenCalled();
    });

    it('a raw reopen (no opener reset) shows the retained query and result', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      await searchVia('wid');
      fireEvent.click(screen.getByTestId('raw-close'));
      fireEvent.click(screen.getByTestId('raw-open'));
      expect(screen.getByText('Widget')).toBeTruthy();
      expect(ddRoot().textContent).toContain('wid');
      expect(ddInput()).toBeNull();
    });
  });

  // ── Search button (doSearch) ──────────────────────────────────────────────────────────────
  describe('search button lookup', () => {
    it('an empty query goes straight to notfound without any API call', async () => {
      renderHarness();
      openFn();
      await clickSearch();
      expect(probe('result')).toBe('notfound');
      expect(screen.getByText(NOT_FOUND)).toBeTruthy();
      expect(resolvePosEntry).not.toHaveBeenCalled();
      expect(getProductsList).not.toHaveBeenCalled();
    });

    it('a whitespace-only query is also notfound without any API call', async () => {
      renderHarness();
      openFn();
      await searchVia('   ');
      expect(probe('result')).toBe('notfound');
      expect(resolvePosEntry).not.toHaveBeenCalled();
    });

    it('flips to searching synchronously and shows the spinner while pending', async () => {
      const d = deferred();
      resolvePosEntry.mockReturnValue(d.promise);
      renderHarness();
      openFn();
      expand();
      type('wid');
      fireEvent.click(btn('Search'));
      expect(probe('result')).toBe('searching');
      expect(screen.getByText('Searching...')).toBeTruthy();
      expect(screen.queryByText(IDLE)).toBeNull();
      expect(qbtn('Add to Cart')).toBeNull();
      d.resolve(resolved());
      await flush();
      expect(screen.queryByText('Searching...')).toBeNull();
    });

    it('resolver PRODUCT hit: trimmed query, aggregate mapping with the query as barcode, no list call', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      await searchVia('  wid ');
      expect(resolvePosEntry.mock.calls).toEqual([['wid']]);
      expect(getProductsList).not.toHaveBeenCalled();
      expect(probeState.result).toEqual(mapPosProductAggregateItem(aggregate(), 'wid'));
      expect(probeState.result.barcode).toBe('wid');
      expect(probe('result')).toBe('obj:p1');
    });

    it.each([
      ['a non-PRODUCT type', { type: 'BATCH', product: aggregate() }],
      ['PRODUCT without a product', { type: 'PRODUCT', product: null }],
      ['null', null],
    ])('resolver %s falls back to getProductsList(0, 1, q, undefined, null, null, null, true, terminal branch)', async (_label, res) => {
      resolvePosEntry.mockResolvedValue(res);
      getProductsList.mockResolvedValue(page([listDto(), listDto({ id: 'L2' })]));
      renderHarness();
      openFn();
      await searchVia(' lis ');
      expect(getProductsList.mock.calls).toEqual([[0, 1, 'lis', undefined, null, null, null, true, 'B1']]);
      expect(probeState.result).toEqual(mapPosProductListItem(listDto()));
    });

    it.each([
      ['terminal branch wins', TERMINAL, SESSION, 'B1'],
      ['no terminal -> session branch', null, SESSION, 'B-SESSION'],
      ['terminal without branchId -> session branch', { terminalId: 'T1' }, SESSION, 'B-SESSION'],
      ['neither -> undefined', null, null, undefined],
    ])('branch header: %s', async (_label, currentTerminal, currentSession, expected) => {
      renderHarness({ currentTerminal, currentSession });
      openFn();
      await searchVia('x');
      expect(getProductsList.mock.calls[0][8]).toBe(expected);
      // the branch is only a lookup header: nothing is gated on terminal / session
      expect(probe('result')).toBe('notfound');
    });

    it.each([
      ['empty content', page([])],
      ['non-array content', { content: null }],
      ['no response', undefined],
    ])('list fallback with %s is notfound', async (_label, data) => {
      getProductsList.mockResolvedValue(data);
      renderHarness();
      openFn();
      await searchVia('x');
      expect(probe('result')).toBe('notfound');
      expect(screen.getByText(NOT_FOUND)).toBeTruthy();
    });

    it('a throwing resolver is notfound and SKIPS the list fallback (no error UI)', async () => {
      resolvePosEntry.mockRejectedValue(new Error('boom'));
      getProductsList.mockResolvedValue(page([listDto()]));
      renderHarness();
      openFn();
      await searchVia('x');
      expect(getProductsList).not.toHaveBeenCalled();
      expect(probe('result')).toBe('notfound');
      expect(screen.queryByText(/boom|error|failed/i)).toBeNull();
    });

    it('a throwing list fallback is notfound', async () => {
      getProductsList.mockRejectedValue(new Error('boom'));
      renderHarness();
      openFn();
      await searchVia('x');
      expect(probe('result')).toBe('notfound');
    });

    it('no sequencing: the LAST lookup to settle wins, even if it was started first', async () => {
      const first = deferred();
      const second = deferred();
      resolvePosEntry.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      renderHarness();
      openFn();
      expand();
      type('one');
      fireEvent.click(btn('Search'));
      type('two');
      fireEvent.click(btn('Search'));
      second.resolve(resolved({ product: { ...aggregate().product, id: 'p2', name: 'Second' } }));
      await flush();
      expect(probe('result')).toBe('obj:p2');
      first.resolve(resolved());
      await flush();
      expect(probe('result')).toBe('obj:p1');
      expect(screen.getByText('Widget')).toBeTruthy();
    });

    it('no cancellation: a lookup settling after close still writes the result; a raw reopen shows it', async () => {
      const d = deferred();
      resolvePosEntry.mockReturnValue(d.promise);
      renderHarness();
      openFn();
      expand();
      type('wid');
      fireEvent.click(btn('Search'));
      fireEvent.click(screen.getByTestId('raw-close'));
      expect(probe('result')).toBe('searching');
      d.resolve(resolved());
      await flush();
      expect(isOpen()).toBe(false);
      expect(probe('result')).toBe('obj:p1');
      fireEvent.click(screen.getByTestId('raw-open'));
      expect(screen.getByText('Widget')).toBeTruthy();
      // the opener is what clears it
      fireEvent.click(screen.getByTestId('raw-close'));
      openFn();
      expect(screen.getByText(IDLE)).toBeTruthy();
    });
  });

  // ── dropdown lookup (fetchOptions) ────────────────────────────────────────────────────────
  describe('dropdown lookup', () => {
    it('expanding renders an autofocused input; the empty-term fetch makes no API call', async () => {
      renderHarness();
      openFn();
      expand();
      expect(document.activeElement).toBe(ddInput());
      await tick(300);
      expect(resolvePosEntry).not.toHaveBeenCalled();
      expect(ddRoot().textContent).toContain('Start typing to search...');
    });

    it('typing writes priceCheckQuery immediately and does NOT touch the result', () => {
      renderHarness();
      openFn();
      expand();
      type('wid');
      expect(probe('query')).toBe('wid');
      expect(ddInput().value).toBe('wid');
      expect(probe('result')).toBe('null');
      expect(screen.getByText(IDLE)).toBeTruthy();
    });

    it('debounces 300ms, then resolves with the UNTRIMMED query and renders one aggregate option', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      expand();
      type(' wid');
      await tick(299);
      expect(resolvePosEntry).not.toHaveBeenCalled();
      await tick(1);
      expect(resolvePosEntry.mock.calls).toEqual([[' wid']]);
      expect(getProductsList).not.toHaveBeenCalled();
      expect(options()).toHaveLength(1);
      const text = options()[0].textContent;
      expect(text).toContain('Widget');
      // the untrimmed query becomes the barcode
      expect(text).toContain('C1 |  wid');
      expect(text).toContain('100 AED');
      expect(text).toContain('Stock: 7');
      // the row reads the raw number: no toFixed
      expect(text).not.toContain('100.00');
    });

    it('falls back to getProductsList(0, 10, query, ..., true, branch) and maps every row', async () => {
      getProductsList.mockResolvedValue(page([listDto(), listDto({ id: 'L2', name: 'Other', barcode: '' })]));
      renderHarness({ currentTerminal: null });
      openFn();
      expand();
      type('lis');
      await tick(300);
      expect(getProductsList.mock.calls).toEqual([[0, 10, 'lis', undefined, null, null, null, true, 'B-SESSION']]);
      expect(options().map((o) => o.querySelector('p').textContent)).toEqual(['Listed', 'Other']);
      // a barcode-less DTO is defaulted to its code by the mapper
      expect(options()[1].textContent).toContain('L-1 | L-1');
    });

    it.each([
      ['a throwing resolver (no list fallback)', () => resolvePosEntry.mockRejectedValue(new Error('x')), 0],
      ['a throwing list', () => getProductsList.mockRejectedValue(new Error('x')), 1],
      ['non-array content', () => getProductsList.mockResolvedValue({ content: 'nope' }), 1],
    ])('%s yields "No results found." and never the dropdown error message', async (_label, arrange, listCalls) => {
      arrange();
      renderHarness();
      openFn();
      expand();
      type('x');
      await tick(300);
      expect(getProductsList).toHaveBeenCalledTimes(listCalls);
      expect(ddRoot().textContent).toContain('No results found.');
      expect(ddRoot().textContent).not.toContain('Failed to fetch results');
      expect(probe('result')).toBe('null');
    });

    it('option image: http URLs used as-is, missing image shows the Search placeholder icon', async () => {
      getProductsList.mockResolvedValue(page([listDto({ image: 'img/a.png' }), listDto({ id: 'L2' })]));
      renderHarness();
      openFn();
      expand();
      type('x');
      await tick(300);
      const src = getImageUrl('img/a.png');
      expect(src.startsWith('http')).toBe(true);
      expect(options()[0].querySelector('img').getAttribute('src')).toBe(src);
      expect(options()[1].querySelector('img')).toBeNull();
      expect(options()[1].querySelector('svg')).toBeTruthy();
    });

    it('selecting an option sets query to its name and result to the option; never adds to cart', async () => {
      getProductsList.mockResolvedValue(page([listDto(), listDto({ id: 'L2', name: 'Other' })]));
      renderHarness();
      openFn();
      expand();
      type('x');
      await tick(300);
      fireEvent.click(options()[1]);
      expect(probe('query')).toBe('Other');
      expect(probe('result')).toBe('obj:L2');
      expect(probeState.result).toEqual(mapPosProductListItem(listDto({ id: 'L2', name: 'Other' })));
      expect(ddInput()).toBeNull();
      expect(ddRoot().textContent).toContain('Other');
      expect(handleProductSelection).not.toHaveBeenCalled();
      expect(isOpen()).toBe(true);
      expect(qbtn('Add to Cart')).toBeTruthy();
    });

    it('Enter selects the first option; ArrowDown moves the highlight', async () => {
      getProductsList.mockResolvedValue(page([listDto(), listDto({ id: 'L2', name: 'Other' })]));
      renderHarness();
      openFn();
      expand();
      type('x');
      await tick(300);
      fireEvent.keyDown(ddInput(), { key: 'Enter' });
      expect(probe('result')).toBe('obj:L1');
      expand();
      await tick(300);
      fireEvent.keyDown(ddInput(), { key: 'ArrowDown' });
      fireEvent.keyDown(ddInput(), { key: 'ArrowDown' });
      fireEvent.keyDown(ddInput(), { key: 'Enter' });
      expect(probe('result')).toBe('obj:L2');
    });

    it('Enter with no options does nothing: doSearch is NOT bound to Enter', async () => {
      renderHarness();
      openFn();
      expand();
      type('zzz');
      await tick(300);
      resolvePosEntry.mockClear();
      getProductsList.mockClear();
      fireEvent.keyDown(ddInput(), { key: 'Enter' });
      await flush();
      expect(probe('result')).toBe('null');
      expect(resolvePosEntry).not.toHaveBeenCalled();
      expect(isOpen()).toBe(true);
    });

    it('the pending debounce keeps the branch captured when it started (stale fetchOptions closure)', async () => {
      const { rerender } = renderHarness();
      openFn();
      expand();
      type('x');
      await tick(100);
      rerender({ currentTerminal: { terminalId: 'T2', branchId: 'B2' } });
      await tick(200);
      expect(getProductsList.mock.calls[0][8]).toBe('B1');
      // the Search button closes over the CURRENT render
      await clickSearch();
      expect(getProductsList.mock.calls[1][8]).toBe('B2');
    });
  });

  // ── populated result + pricing ────────────────────────────────────────────────────────────
  describe('populated result and pricing', () => {
    it('renders name, department, code, barcode, stock badge and VAT-inclusive discounted price', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      await searchVia('wid');
      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Widget');
      expect(screen.getByText('Tools')).toBeTruthy();
      expect(screen.getByText('Item Code').nextSibling.textContent).toBe('C1');
      expect(screen.getByText('Barcode').nextSibling.textContent).toBe('wid');
      const badge = screen.getByText('7 in Stock');
      expect(badge.className).toContain('bg-green-50');
      expect(sellingPrice()).toContain('94.50');
      expect(screen.getByText('VAT 5% Included')).toBeTruthy();
      expect(screen.getByText('Base Price:').nextSibling.textContent).toContain('100.00');
      const discount = screen.getByText('Discount (10%):');
      expect(discount.nextSibling.textContent).toContain('10.00');
      expect(discount.nextSibling.textContent.startsWith('−')).toBe(true);
      expect(screen.queryByText(IDLE)).toBeNull();
      expect(screen.queryByText(NOT_FOUND)).toBeNull();
    });

    it('no discount row at 0%, "General Department" fallback, Out of Stock badge, ShoppingCart placeholder', async () => {
      getProductsList.mockResolvedValue(page([listDto()]));
      renderHarness();
      openFn();
      await searchVia('lis');
      expect(screen.getByText('General Department')).toBeTruthy();
      expect(screen.queryByText(/Discount \(/)).toBeNull();
      expect(sellingPrice()).toContain('23.00');
      expect(screen.getByText('VAT 15% Included')).toBeTruthy();
      expect(screen.getByText('Out of Stock').className).toContain('bg-red-50');
      expect(overlay().querySelector('.w-28 img')).toBeNull();
      expect(overlay().querySelector('.w-28 svg')).toBeTruthy();
    });

    it('a product image renders as <img alt=name>', async () => {
      getProductsList.mockResolvedValue(page([listDto({ image: 'img/a.png' })]));
      renderHarness();
      openFn();
      await searchVia('lis');
      const img = overlay().querySelector('.w-28 img');
      expect(img.getAttribute('src')).toBe(getImageUrl('img/a.png'));
      expect(img.getAttribute('alt')).toBe('Listed');
    });

    it.each([
      ['salesTax null -> VAT 0% (toNumber(null, 5) is 0)', { salesTax: null }, '0', '20.00'],
      ['negative stock -> Out of Stock', { stock: -2, salesTax: 5 }, '5', '21.00'],
      ['fractional discount', { maxDiscount: 12.5, retailPrice: 80, salesTax: 5 }, '5', '73.50'],
    ])('%s', async (_label, over, vat, price) => {
      getProductsList.mockResolvedValue(page([listDto(over)]));
      renderHarness();
      openFn();
      await searchVia('lis');
      expect(screen.getByText(`VAT ${vat}% Included`)).toBeTruthy();
      expect(sellingPrice()).toContain(price);
    });

    it('a stock of 0 or less shows Out of Stock', async () => {
      getProductsList.mockResolvedValue(page([listDto({ stock: -2 })]));
      renderHarness();
      openFn();
      await searchVia('lis');
      expect(screen.getByText('Out of Stock')).toBeTruthy();
    });
  });

  // ── cart-affecting action ─────────────────────────────────────────────────────────────────
  describe('Add to Cart', () => {
    it('only appears for a found product (not idle / searching / notfound)', async () => {
      const d = deferred();
      resolvePosEntry.mockReturnValueOnce(d.promise);
      renderHarness();
      openFn();
      expect(qbtn('Add to Cart')).toBeNull();
      expand();
      type('x');
      fireEvent.click(btn('Search'));
      expect(qbtn('Add to Cart')).toBeNull();
      d.resolve(null);
      await flush();
      expect(probe('result')).toBe('notfound');
      expect(qbtn('Add to Cart')).toBeNull();
    });

    it('calls handleProductSelection(foundProduct) with ONE argument, then closes and resets', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      await searchVia('wid');
      const found = probeState.result;
      fireEvent.click(btn('Add to Cart'));
      expect(handleProductSelection).toHaveBeenCalledTimes(1);
      expect(handleProductSelection.mock.calls[0]).toHaveLength(1);
      expect(handleProductSelection.mock.calls[0][0]).toBe(found);
      expect(isOpen()).toBe(false);
      expect(probe('query')).toBe('');
      expect(probe('result')).toBe('null');
    });

    it.each([
      ['{ ok:false }', { ok: false, reason: 'blocked' }],
      ['deferred (Item Entry dialog)', { ok: true, deferred: true }],
      ['undefined', undefined],
    ])('ignores the %s return value: still closes and resets, no feedback UI', async (_label, ret) => {
      handleProductSelection.mockReturnValue(ret);
      getProductsList.mockResolvedValue(page([listDto()]));
      renderHarness();
      openFn();
      await searchVia('lis');
      fireEvent.click(btn('Add to Cart'));
      expect(isOpen()).toBe(false);
      expect(probe('result')).toBe('null');
      expect(screen.queryByText('blocked')).toBeNull();
    });
  });

  // ── close / clear ─────────────────────────────────────────────────────────────────────────
  describe('close and clear', () => {
    it.each([
      ['header X', () => fireEvent.click(headerClose())],
      ['footer Close', () => fireEvent.click(btn('Close'))],
      ['backdrop', () => fireEvent.click(overlay().children[0])],
    ])('%s closes WITHOUT resetting query or result', async (_label, close) => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      await searchVia('wid');
      close();
      expect(isOpen()).toBe(false);
      expect(probe('query')).toBe('wid');
      expect(probe('result')).toBe('obj:p1');
      expect(handleProductSelection).not.toHaveBeenCalled();
    });

    it('clicking inside the panel does not close', () => {
      renderHarness();
      openFn();
      fireEvent.click(overlay().children[1]);
      fireEvent.click(screen.getByText(IDLE));
      expect(isOpen()).toBe(true);
    });

    it('Clear resets query + result, keeps the modal open, and collapses nothing else', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      renderHarness();
      openFn();
      await searchVia('wid');
      expect(ddInput()).not.toBeNull();
      fireEvent.click(btn('Clear'));
      expect(isOpen()).toBe(true);
      expect(probe('query')).toBe('');
      expect(probe('result')).toBe('null');
      expect(screen.getByText(IDLE)).toBeTruthy();
      // the dropdown owns its open flag: Clear leaves it expanded, with an empty input
      expect(ddInput().value).toBe('');
      expect(resolvePosEntry).toHaveBeenCalledTimes(1);
    });

    it('close + reopen remounts the dropdown: collapsed, options gone', async () => {
      getProductsList.mockResolvedValue(page([listDto()]));
      renderHarness();
      openFn();
      expand();
      type('x');
      await tick(300);
      expect(options()).toHaveLength(1);
      fireEvent.click(btn('Close'));
      fireEvent.click(screen.getByTestId('raw-open'));
      expect(ddInput()).toBeNull();
      expect(ddRoot().querySelector('.overflow-y-auto')).toBeNull();
    });
  });

  // ── keyboard / focus ──────────────────────────────────────────────────────────────────────
  describe('keyboard and focus', () => {
    it('no modal-level Escape: Escape collapses only the dropdown', async () => {
      renderHarness();
      openFn();
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.keyDown(overlay(), { key: 'Escape' });
      expect(isOpen()).toBe(true);
      expand();
      fireEvent.keyDown(ddInput(), { key: 'Escape' });
      expect(ddInput()).toBeNull();
      expect(isOpen()).toBe(true);
    });

    it('mousedown outside the dropdown collapses it, the modal stays open', () => {
      renderHarness();
      openFn();
      expand();
      fireEvent.mouseDown(screen.getByText(IDLE));
      expect(ddInput()).toBeNull();
      expect(isOpen()).toBe(true);
    });

    it('mid-string edits keep the same input node (caret-safe controlled input)', () => {
      renderHarness();
      openFn();
      expand();
      const node = ddInput();
      type('abcd');
      node.setSelectionRange(1, 1);
      type('abXcd');
      expect(ddInput()).toBe(node);
      expect(node.value).toBe('abXcd');
      expect(document.activeElement).toBe(node);
    });
  });

  // ── parent rerender while open ────────────────────────────────────────────────────────────
  describe('parent rerender while open', () => {
    it('an unrelated parent state change keeps the input node, value, options and result', async () => {
      getProductsList.mockResolvedValue(page([listDto()]));
      renderHarness();
      openFn();
      expand();
      type('x');
      await tick(300);
      const node = ddInput();
      const before = probeState.renders;
      fireEvent.click(screen.getByTestId('bump'));
      expect(probeState.renders).toBeGreaterThan(before);
      expect(ddInput()).toBe(node);
      expect(node.value).toBe('x');
      expect(options()).toHaveLength(1);
      // a rerender does not refetch (effect deps are [searchTerm, isOpen])
      await tick(1000);
      expect(getProductsList).toHaveBeenCalledTimes(1);
    });

    it('a terminal/session prop change keeps the displayed result and is picked up by the next search', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      const { rerender } = renderHarness();
      openFn();
      await searchVia('wid');
      rerender({ currentTerminal: null, currentSession: { id: 'S2', branchId: 'B9' } });
      expect(screen.getByText('Widget')).toBeTruthy();
      expect(probe('result')).toBe('obj:p1');
      resolvePosEntry.mockResolvedValue(null);
      await clickSearch();
      expect(getProductsList.mock.calls[0][8]).toBe('B9');
    });

    it('a new handleProductSelection identity is the one Add to Cart calls', async () => {
      resolvePosEntry.mockResolvedValue(resolved());
      const { rerender } = renderHarness();
      openFn();
      await searchVia('wid');
      const next = vi.fn();
      rerender({ handleProductSelection: next });
      fireEvent.click(btn('Add to Cart'));
      expect(handleProductSelection).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
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
  const CHILD = read('../features/products/PriceCheck.jsx');
  // the child with its header comment stripped, for scans that must ignore prose
  const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
  const TEST = read('./PriceCheck.characterization.test.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const TRADE = read('../TradePOS/TradePOSTouchScreen.jsx');
  const CONSOLE = read('../POSConsole.jsx');
  const ENTRY = read('../features/products/useProductEntry.js');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* ─── PRICE CHECK MODAL ─── */}';
  const start = LINES.indexOf(ANCHOR);
  const end = LINES.indexOf('      )}', start);
  const PARENT_CALLSITE = LINES.slice(start, end + 1).join('\n');

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
  const CHILD_BODY = CHILD.slice(CHILD.indexOf(SIGNATURE_END) + SIGNATURE_END.length, CHILD.lastIndexOf('\n}\n\nexport default PriceCheck;'));
  const count = (src, s) => src.split(s).length - 1;

  const OWN_STATE = ['showPriceCheck', 'setShowPriceCheck', 'priceCheckQuery', 'setPriceCheckQuery', 'priceCheckResult', 'setPriceCheckResult'];
  const PARENT_BINDINGS = [...OWN_STATE, 'currentTerminal', 'currentSession', 'handleProductSelection'];
  const PROPS = ['showPriceCheck', 'setShowPriceCheck', 'priceCheckQuery', 'setPriceCheckQuery', 'priceCheckResult', 'setPriceCheckResult', 'currentTerminal', 'currentSession', 'handleProductSelection'];
  const MODULE = ['AlertCircle', 'AsyncSearchableDropdown', 'DirhamSymbol', 'Plus', 'Search', 'ShoppingCart', 'X',
    'getProductsList', 'mapPosProductAggregateItem', 'mapPosProductListItem', 'resolvePosEntry', 'toNumber'];
  const GLOBALS = ['Array', 'undefined'];

  it('pins the exact call-site boundaries, size and siblings', () => {
    expect(count(PARENT, 'PRICE CHECK MODAL')).toBe(1);
    expect(start).toBeGreaterThan(-1);
    expect(LINES[start + 1]).toBe('      {showPriceCheck && (');
    expect(LINES[start + 2]).toBe('        <PriceCheck');
    expect(LINES[end - 1]).toBe('        />');
    expect(end - start + 1).toBe(14);
    expect(LINES[start - 1]).toBe('');
    expect(LINES[start - 2]).toBe('      </Dialog>');
    expect(LINES[start - 8]).toBe('      {/* Legacy Layaways Dialog (kept for backward compat) */}');
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe('      {/* ─── SEARCH PRODUCTS MODAL ─── */}');
    // the mount condition stays in the parent, exactly once; the IIFE and its tree are gone
    expect(count(PARENT, '{showPriceCheck && ')).toBe(1);
    expect(PARENT).not.toContain('{showPriceCheck && (() => {');
    expect(PARENT).not.toContain('Scan or search an item to check price, stock, barcode, and product details.');
    expect(CHILD_CODE).not.toContain('showPriceCheck &&');
    // exactly one call site, no key / memo wrapper
    expect(count(PARENT, '<PriceCheck')).toBe(1);
    expect(PARENT).not.toContain('<PriceCheck key=');
    expect(PARENT).not.toContain('memo(PriceCheck');
    expect(PARENT).toContain("import PriceCheck from './POS/features/products/PriceCheck';");
    expect(PARENT).not.toMatch(/function PriceCheck\b/);
    expect(PARENT).not.toMatch(/const PriceCheck\b/);
  });

  it('the harness call site is byte-identical to POSSales', () => {
    expect(CALLSITE).toBe(PARENT_CALLSITE);
  });

  it('the pre-extraction reference is the 180-line IIFE region', () => {
    const lines = REGION.split('\n');
    expect(lines).toHaveLength(180);
    expect(lines[0]).toBe(ANCHOR);
    expect(lines[1]).toBe('      {showPriceCheck && (() => {');
    expect(lines[2]).toBe("        const foundProduct = priceCheckResult && priceCheckResult !== 'searching' && priceCheckResult !== 'notfound' ? priceCheckResult : null;");
    expect(lines[29]).toBe('        return (');
    expect(lines[178]).toBe('        );');
    expect(lines[179]).toBe('      })()}');
  });

  it('the three state declarations are byte-identical to POSSales and are the only Price Check state', () => {
    expect(STATE).toBe([
      '  // Price Check modal',
      '  const [showPriceCheck, setShowPriceCheck] = useState(false);',
      "  const [priceCheckQuery, setPriceCheckQuery] = useState('');",
      '  const [priceCheckResult, setPriceCheckResult] = useState(null);',
    ].join('\n'));
    expect(PARENT).toContain(`\n${STATE}\n  // Credit Balance modal\n`);
    expect(count(PARENT, 'PriceCheck] = useState')).toBe(1);
    expect(count(PARENT, 'PriceCheckQuery] = useState')).toBe(1);
    expect(count(PARENT, 'PriceCheckResult] = useState')).toBe(1);
    // the extracted harness declares the same state
    expect(count(TEST, `\n${STATE.split('\n').slice(1).join('\n')}\n`)).toBe(2);
    // the child declares none of it
    expect(CHILD).not.toContain('useState');
  });

  it('pins the exact direct dependency surface: 9 POSSales bindings + 12 module imports + 2 globals', () => {
    expect(freeIdentifiers(`(<>\n${REGION}\n</>);`)).toEqual([...PARENT_BINDINGS, ...MODULE, ...GLOBALS].sort());
  });

  it('child body is the IIFE body verbatim, re-indented from 8 to 2 spaces', () => {
    expect(IIFE_BODY.every((l) => l === '' || l.startsWith('        '))).toBe(true);
    expect(CHILD_BODY).toBe(IIFE_BODY.map((l) => (l === '' ? '' : l.replace(/^ {6}/, ''))).join('\n'));
  });

  it('child is a module-level component taking exactly the 9 props, no spread, no memo', () => {
    expect(CHILD).toContain(`\nfunction PriceCheck({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n`);
    expect([...PROPS].sort()).toEqual([...PARENT_BINDINGS].sort());
    expect(CHILD.match(/^function /gm)).toHaveLength(1);
    expect(CHILD).toContain('\nexport default PriceCheck;\n');
    expect(CHILD.match(/^export /gm)).toHaveLength(1);
    ['...props', '...rest', 'memo(', 'forwardRef'].forEach((s) => expect(CHILD, s).not.toContain(s));
  });

  it('child is free only in its module imports + globals; showPriceCheck is received but never read', () => {
    const withoutImports = CHILD.replace(/^import .*$/gm, '');
    expect(freeIdentifiers(withoutImports)).toEqual([...MODULE, ...GLOBALS].sort());
    expect(CHILD_BODY).not.toContain('showPriceCheck');
    expect(count(CHILD_CODE, 'showPriceCheck')).toBe(1);
  });

  it("child imports exactly React, the five icons and the region's module dependencies", () => {
    expect(CHILD.match(/^import .*$/gm)).toEqual([
      "import React from 'react';",
      "import { AlertCircle, Plus, Search, ShoppingCart, X } from 'lucide-react';",
      "import { resolvePosEntry } from '../../../../../api/posApi';",
      "import { getProductsList } from '../../../../../api/productsApi';",
      "import AsyncSearchableDropdown from '../../../../../components/AsyncSearchableDropdown';",
      "import { DirhamSymbol } from '../../POSCurrency';",
      "import { toNumber, mapPosProductListItem, mapPosProductAggregateItem } from '../../posUtils';",
    ]);
    // the imported paths are the same modules POSSales imported them from
    const fromChild = (rel) => path.resolve(__dirname, '../features/products', rel);
    expect(fromChild('../../../../../api/posApi')).toBe(path.resolve(__dirname, '../../../../api/posApi'));
    expect(fromChild('../../../../../api/productsApi')).toBe(path.resolve(__dirname, '../../../../api/productsApi'));
    expect(fromChild('../../../../../components/AsyncSearchableDropdown')).toBe(path.resolve(__dirname, '../../../../components/AsyncSearchableDropdown'));
    expect(fromChild('../../POSCurrency')).toBe(path.resolve(__dirname, '../POSCurrency'));
    expect(fromChild('../../posUtils')).toBe(path.resolve(__dirname, '../posUtils'));
    // the modules the parent still uses elsewhere stay imported there
    // (getProductsList and AsyncSearchableDropdown later left POSSales with the SerialBatch extraction, their last POSSales user)
    expect(PARENT).toContain("import { createProduct, validateDuplicateProduct, createProductFromPos, validateDuplicateProductFromPos } from '../../api/productsApi';");
    expect(PARENT).not.toMatch(/\bAsyncSearchableDropdown\b/);
    expect(PARENT).toContain("import { DirhamSymbol, DenominationLabel, CurrencyAmount, DenominationAmount, renderAED, setActiveCurrency } from './POS/POSCurrency';");
    expect(PARENT).toContain("import { toNumber, mapPosProductAggregateItem, mapPosCustomer, getPriceFloor, mergeSavedPosSettings } from './POS/posUtils';");
    ['AlertCircle', 'Plus', 'Search', 'ShoppingCart', 'X'].forEach((icon) => expect(PARENT).toMatch(new RegExp(`^  ${icon},$`, 'm')));
  });

  it('exactly the existing API calls moved with the child; POSSales makes no Price Check lookup', () => {
    for (const src of [REGION, CHILD_BODY]) {
      expect(count(src, 'resolvePosEntry(')).toBe(2);
      expect(count(src, 'getProductsList(')).toBe(2);
      expect(src).toContain('await getProductsList(0, 1, q, undefined, null, null, null, true, posBranchId)');
      expect(src).toContain('await getProductsList(0, 10, query, undefined, null, null, null, true, posBranchId)');
      expect(count(src, 'const posBranchId = currentTerminal?.branchId || currentSession?.branchId;')).toBe(2);
    }
    // no other API is reached from the child
    expect(CHILD_CODE.match(/\/api\//g)).toHaveLength(2);
    // resolvePosEntry / mapPosProductListItem had no other POSSales use: they left with the region
    expect(PARENT).not.toMatch(/\bresolvePosEntry\b/);
    expect(PARENT).not.toMatch(/\bmapPosProductListItem\b/);
    // the parent's other getProductsList call (the Serial / Batch item-code lookup) left with the SerialBatch extraction
    expect(count(PARENT, 'getProductsList(')).toBe(0);
    expect(count(read('../features/products/SerialBatch.jsx'), 'getProductsList(')).toBe(1);
    expect(PARENT).not.toContain('getProductsList(0, 1, q,');
    expect(PARENT).not.toContain('getProductsList(0, 10, query,');
  });

  it('owner of each parent binding: POSSales useState, usePosSession, useProductEntry', () => {
    expect(PARENT).toContain('    currentSession, setCurrentSession,\n    currentTerminal, setCurrentTerminal,\n');
    expect(PARENT).toContain('  } = usePosSession({ posSettings, handlersRef: sessionLifecycleHandlersRef });');
    expect(PARENT).toContain('    handleUnifiedEntry, handleBarcodeScan, handleProductSelection, handleEditItem,\n');
    expect(count(PARENT, 'usePosSession(')).toBe(1);
    expect(count(PARENT, 'useProductEntry(')).toBe(1);
    expect(ENTRY).toContain('  const handleProductSelection = useCallback((product, options = {}) => {');
    const body = ENTRY.slice(ENTRY.indexOf('  const handleProductSelection = useCallback('), ENTRY.indexOf('  handleProductSelectionRef.current = handleProductSelection;'));
    expect(body).toContain("if (!product) return { ok: false, reason: 'No product selected' };");
    expect(body).toContain('const { quantity = 1, batch = null, serial = null, expiry = null } = options;');
    expect(body).toContain('return addToInvoiceRef.current(product, quantity, batch, serial, expiry);');
    expect(body).toContain('return { ok: true, deferred: true };');
  });

  it('the region and the child own no hooks, state, refs, effects, context, memo, keys, portals, listeners, focus or key handling', () => {
    ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect',
      'usePosSession', 'useProductEntry', 'Context', 'memo(', 'createPortal', 'ref=', 'key=', 'onKeyDown', 'onKeyUp',
      'addEventListener', '.focus(', 'autoFocus', '<Dialog', 'Escape', 'AbortController', 'signal', 'setTimeout', 'clearTimeout']
      .forEach((s) => {
        expect(REGION, s).not.toContain(s);
        expect(CHILD_CODE, s).not.toContain(s);
      });
    for (const src of [REGION, CHILD_BODY]) {
      expect(count(src, 'async ')).toBe(2);
      expect(count(src, '<AsyncSearchableDropdown')).toBe(1);
    }
  });

  it('exact write calls: setShowPriceCheck x4, setPriceCheckQuery x3, setPriceCheckResult x9, handleProductSelection x1', () => {
    for (const src of [REGION, CHILD_BODY]) {
      expect(count(src, 'setShowPriceCheck(')).toBe(4);
      expect(count(src, 'setShowPriceCheck(false)')).toBe(4);
      expect(count(src, 'setPriceCheckQuery(')).toBe(3);
      expect(count(src, 'onInputChange={setPriceCheckQuery}')).toBe(1);
      expect(count(src, 'setPriceCheckResult(')).toBe(9);
      expect(count(src, 'handleProductSelection(')).toBe(1);
      expect(src).toContain("handleProductSelection(foundProduct); setShowPriceCheck(false); setPriceCheckQuery(''); setPriceCheckResult(null);");
      // terminal / session are read nowhere else: no gating, validation or pricing
      expect(count(src, 'currentTerminal')).toBe(2);
      expect(count(src, 'currentSession')).toBe(2);
    }
    // the child adds exactly one mention each: its prop signature
    expect(count(CHILD_CODE, 'currentTerminal')).toBe(3);
    expect(count(CHILD_CODE, 'currentSession')).toBe(3);
  });

  it('has no hidden cart / invoice / scanner / checkout / feedback / settings dependency', () => {
    ['currentInvoice', 'setCurrentInvoice', 'recalculateInvoice', 'addToInvoice', 'productCacheRef', 'posProducts',
      'barcodeInput', 'scannerConfig', 'handleBarcodeScan', 'handleUnifiedEntry', 'posSettings', 'checkout', 'Checkout',
      'payment', 'Payment', 'showFeedback', 'formatCurrency', 'selectedCustomer', 'productSearch', 'ProductSearch',
      'posActionMode', 'xReport', 'zReport', 'layaway', 'delivery', 'creditBalance', 'serialBatch']
      .forEach((name) => {
        expect(REGION, name).not.toContain(name);
        expect(CHILD_CODE, name).not.toContain(name);
      });
  });

  it('call site: guard kept in the parent, 9 direct props, no spread, no wrapper arrows, no key, no unrelated props', () => {
    expect(PARENT_CALLSITE.split('\n').slice(0, 3)).toEqual([ANCHOR, '      {showPriceCheck && (', '        <PriceCheck']);
    PROPS.forEach((n) => expect(PARENT_CALLSITE, n).toContain(`          ${n}={${n}}\n`));
    expect(PARENT_CALLSITE.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    ['{...', '=>', 'key=', '.bind('].forEach((s) => expect(PARENT_CALLSITE, s).not.toContain(s));
    // currentTerminal / currentSession / handleProductSelection are passed straight through
    expect(PARENT_CALLSITE).toContain('          currentTerminal={currentTerminal}\n');
    expect(PARENT_CALLSITE).toContain('          currentSession={currentSession}\n');
    expect(PARENT_CALLSITE).toContain('          handleProductSelection={handleProductSelection}\n');
  });

  it('openers: POSTouchScreen owns the only one; POSSales only forwards setters; TradePOS and POSConsole open nothing', () => {
    expect(TOUCH).toContain("action: () => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); } },");
    expect(TEST).toContain("onClick={() => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); }}");
    expect(count(TOUCH, 'setShowPriceCheck(')).toBe(1);
    expect(TOUCH).not.toMatch(/PriceCheck from|<PriceCheck\b/);
    expect(PARENT).toContain('    setShowCouponsDialog, setShowPromotionsDialog, setShowPriceCheck, setPriceCheckQuery,\n    setPriceCheckResult, setShowProductSearch, setProductSearchQuery, setProductSearchResults,\n');
    // the setter calls left with the region: POSSales no longer calls any of them
    expect(count(PARENT, 'setShowPriceCheck(')).toBe(0);
    expect(count(PARENT, 'setPriceCheckQuery(')).toBe(0);
    expect(count(PARENT, 'setPriceCheckResult(')).toBe(0);
    // every read of the state is either the call site or the declarations
    expect(count(PARENT, 'priceCheckResult')).toBe(count(PARENT_CALLSITE, 'priceCheckResult') + 1);
    expect(count(PARENT, 'priceCheckQuery')).toBe(count(PARENT_CALLSITE, 'priceCheckQuery') + 1);
    expect(count(PARENT, 'showPriceCheck')).toBe(count(PARENT_CALLSITE, 'showPriceCheck') + 1);
    expect(TRADE).not.toMatch(/PriceCheck/);
    expect(CONSOLE).not.toContain('setShowPriceCheck');
    expect(CONSOLE).toContain("{ id:'price-chk',label:'Price Check' }");
  });

  it('architecture pin stays consistent with this extraction', () => {
    const ARCH = read('./POSSalesArchitecture.characterization.test.jsx');
    expect(ARCH).toContain("['price check modal (in PriceCheck)', '{showPriceCheck && (\\n        <PriceCheck'],");
    expect(ARCH).toContain("['PriceCheck', './POS/features/products/PriceCheck', 1],");
  });
});

// keep lint honest about imports used only inside the verbatim region
void [AlertCircle, Plus, Search, ShoppingCart, X, React, AsyncSearchableDropdown, DirhamSymbol, toNumber];
