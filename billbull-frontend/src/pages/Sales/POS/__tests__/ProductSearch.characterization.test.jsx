import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AlertCircle, Package, Search, X } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/departmentsApi', () => ({ getDepartments: vi.fn() }));
vi.mock('../../../../api/productsApi', () => ({
  getProducts: vi.fn(),
  getProductsList: vi.fn(),
  getFavouriteProducts: vi.fn(),
  getRecentlySoldProducts: vi.fn(),
  getTopSoldProducts: vi.fn(),
  addProductFavourite: vi.fn(),
  removeProductFavourite: vi.fn(),
}));
vi.mock('../../../../api/posApi', () => ({ resolvePosEntry: vi.fn() }));

import { getDepartments } from '../../../../api/departmentsApi';
import { getProductsList } from '../../../../api/productsApi';
import { CurrencyAmount } from '../POSCurrency';
import { mapPosProductListItem } from '../posUtils';
import { useProductCatalog } from '../features/products/useProductCatalog';
import ShippedProductSearch from '../features/products/ProductSearch';

/**
 * CHARACTERIZATION — the POSSales.jsx "Search Products" modal.
 *
 * The region is now rendered by POS/features/products/ProductSearch.jsx. The extraction is a
 * presentation move only: useProductCatalog (all search state, debounce, AbortController, branch
 * resolution, productCacheRef), useProductEntry (handleProductSelection), showFeedback,
 * formatCurrency and the `showProductSearch &&` mount condition all stay in POSSales. The child
 * receives exactly the 9 bindings below under their ORIGINAL POSSales names.
 *
 * Pre-extraction region: POSSales.jsx:9765–9851, `{/* ─── SEARCH PRODUCTS MODAL ─── *\/}` ..
 * matching `      )}` — 87 lines (anchor + `{showProductSearch && (` + one JSX tree). A
 * hand-rolled fixed overlay: no Radix Dialog, no portal, no IIFE, no key on the root, no nested
 * dialog. Conditionally MOUNTED: closing unmounts the whole tree (the input DOM node is recreated
 * on reopen). Sits between the PRICE CHECK call site (`      )}`, extracted to PriceCheck.jsx) and the CREDIT BALANCE MODAL
 * call site.
 *
 * Two harnesses; every behavioural describe runs against BOTH:
 *   - `ProductSearchHarness` (reference): the PRE-EXTRACTION region copied VERBATIM (REGION markers),
 *   - `ExtractedProductSearchHarness`: the POSSales call site copied VERBATIM (CALLSITE markers),
 *     rendering the shipped component.
 * The `source contract` block asserts the child's body is byte-identical to the reference region
 * and the call site is byte-identical to POSSales; `mutation safeguards` compiles mutated copies
 * of the shipped child and proves the behavioural checks reject them.
 *
 * Both harnesses reproduce the parent side exactly:
 *   - the REAL useProductCatalog hook (APIs mocked) supplies all search state + the debounced
 *     search effect — nothing about that state lives in POSSales,
 *   - `formatCurrency` copied verbatim from POSSales (`(amount) => <CurrencyAmount .../>`),
 *   - `handleProductSelection` / `showFeedback` injected as spies (POSSales gets them from
 *     useProductEntry and its own stable useCallback respectively),
 *   - `ParentProbes`: the ONLY opener, POSTouchScreen's 'search-products' function-button
 *     action, plus raw open/close probes.
 *
 * Direct dependency surface (9 POSSales bindings, derived from the JSX):
 *   useProductCatalog: showProductSearch, setShowProductSearch, productSearchQuery,
 *                      setProductSearchQuery, productSearchResults, productSearchLoading
 *   useProductEntry:   handleProductSelection
 *   POSSales-owned:    showFeedback (useCallback), formatCurrency (plain per-render arrow)
 *   module imports:    lucide Search / X / AlertCircle / Package
 * NOT read by the region: setProductSearchResults (only POSTouchScreen's opener uses it),
 * productCacheRef (the hook's effect writes it; never reaches the JSX).
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - No distinct error UI: a failed search logs and renders the "No products match" state.
 *   - Loading flips to true synchronously on each keystroke, BEFORE the 300ms debounce.
 *   - Aborting an in-flight request (new keystroke) lets the aborted call's `finally` clear
 *     loading, so during the next debounce window the modal flashes "No products match"
 *     for the NEW query (results were not cleared — they were already [] in that scenario).
 *   - The results grid branch does not check the query; it is guarded only by the hook
 *     effect clearing results when the query becomes blank.
 *   - Close does NOT reset query/results; only the POSTouchScreen opener does. A raw reopen
 *     re-runs the search for the retained query.
 *   - Selecting a result does NOT close the modal or clear the query; every click re-adds.
 *   - `{ ok:false }` -> error toast (reason || default); `{ deferred }` -> no toast (Item Entry
 *     dialog mode); anything else (incl. undefined / null / {ok:true}) -> success toast.
 *   - The search effect's deps are [query, open] only: a branch change while a debounce is
 *     pending still queries with the branch captured when the effect ran.
 *   - No Escape handling, no Enter-to-select, no keyboard navigation; backdrop click closes;
 *     the input has autoFocus on every mount.
 *   - mapPosProductListItem defaults a missing barcode to the code, so a barcode-less product
 *     shows "CODE | CODE".
 */

// ── harness ─────────────────────────────────────────────────────────────────────────────
function ParentProbes({ setShowProductSearch, setProductSearchQuery, setProductSearchResults, productSearchQuery, productSearchResults, productSearchLoading }) {
  return (
    <>
      <button
        data-testid="fn-search-products"
        onClick={() => { setProductSearchQuery(''); setProductSearchResults([]); setShowProductSearch(true); }}
      >
        fn
      </button>
      <button data-testid="raw-open" onClick={() => setShowProductSearch(true)}>raw-open</button>
      <button data-testid="raw-close" onClick={() => setShowProductSearch(false)}>raw-close</button>
      <span data-testid="probe-query">{productSearchQuery}</span>
      <span data-testid="probe-results">{productSearchResults.map((p) => p.id).join(',')}</span>
      <span data-testid="probe-loading">{String(productSearchLoading)}</span>
    </>
  );
}

// ── reference: the pre-extraction POSSales region, verbatim ─────────────────────────────
function ProductSearchHarness({ currentTerminal, currentSession, handleProductSelection, showFeedback }) {
  const {
    showProductSearch, setShowProductSearch,
    productSearchQuery, setProductSearchQuery,
    productSearchResults, setProductSearchResults, productSearchLoading,
  } = useProductCatalog({ currentTerminal, currentSession, barcodeInput: '', posActionMode: 'none' });
  // FORMAT-VERBATIM-START
  const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;
  // FORMAT-VERBATIM-END

  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ setShowProductSearch, setProductSearchQuery, setProductSearchResults, productSearchQuery, productSearchResults, productSearchLoading }} />
      {/* REGION-VERBATIM-START */}
      {/* ─── SEARCH PRODUCTS MODAL ─── */}
      {showProductSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowProductSearch(false)} />
          <div className="relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-white border-b border-[#327F74]/20 px-6 py-4 flex items-start justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2.5"><Search className="h-5 w-5 text-cyan-600" /><span className="text-lg font-bold text-[#1E293B]">Search Products</span></div>
                <p className="text-sm text-gray-500 mt-1">Search by item code, barcode, or product name — matches anywhere in the name.</p>
              </div>
              <button onClick={() => setShowProductSearch(false)} className="text-gray-400 hover:text-[#1E293B] transition-colors"><X className="h-6 w-6" /></button>
            </div>
            <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={productSearchQuery}
                  onChange={e => setProductSearchQuery(e.target.value)}
                  placeholder="Type an item code, barcode, or any part of a product name..."
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5C742] focus:bg-white"
                />
              </div>
            </div>
            <div className="overflow-auto flex-1 p-6">
              {!productSearchQuery.trim() && (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                  <Search className="h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-sm font-medium text-gray-500">Start typing to search the product catalogue.</p>
                </div>
              )}
              {productSearchQuery.trim() && productSearchLoading && (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                  <div className="w-10 h-10 border-4 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin mb-4" />
                  <p className="text-sm font-medium text-gray-500">Searching...</p>
                </div>
              )}
              {productSearchQuery.trim() && !productSearchLoading && productSearchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                  <AlertCircle className="h-12 w-12 text-red-300 mb-4" />
                  <p className="text-sm font-medium text-gray-500">No products match "{productSearchQuery.trim()}".</p>
                </div>
              )}
              {!productSearchLoading && productSearchResults.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {productSearchResults.map(product => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        const res = handleProductSelection(product, { quantity: 1 });
                        if (res && res.ok === false) {
                          showFeedback('error', res.reason || 'Could not add this item.');
                          return;
                        }
                        if (res?.deferred) return;
                        showFeedback('success', `${product.name} added`);
                      }}
                      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-[#F5C742] hover:shadow-md transition-all text-left"
                    >
                      <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                        {product.image
                          ? <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
                          : <Package className="w-5 h-5 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1E293B] leading-tight truncate">{product.name}</p>
                        <p className="text-[11px] font-mono text-gray-400 truncate">{product.code}{product.barcode ? ` | ${product.barcode}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[#327F74]">{formatCurrency(product.price)}</p>
                        <p className={`text-[10px] font-bold ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                          {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end shrink-0">
              <button onClick={() => setShowProductSearch(false)} className="bg-white border border-gray-300 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── shipped: the POSSales call site, verbatim ───────────────────────────────────────────
// `ProductSearch` is the shipped child; only the mutation safeguards rebind it to compiled mutants.
let ProductSearch = ShippedProductSearch;

function ExtractedProductSearchHarness({ currentTerminal, currentSession, handleProductSelection, showFeedback }) {
  const {
    showProductSearch, setShowProductSearch,
    productSearchQuery, setProductSearchQuery,
    productSearchResults, setProductSearchResults, productSearchLoading,
  } = useProductCatalog({ currentTerminal, currentSession, barcodeInput: '', posActionMode: 'none' });
  const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;

  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ setShowProductSearch, setProductSearchQuery, setProductSearchResults, productSearchQuery, productSearchResults, productSearchLoading }} />
      {/* CALLSITE-VERBATIM-START */}
      {/* ─── SEARCH PRODUCTS MODAL ─── */}
      {showProductSearch && (
        <ProductSearch
          showProductSearch={showProductSearch}
          setShowProductSearch={setShowProductSearch}
          productSearchQuery={productSearchQuery}
          setProductSearchQuery={setProductSearchQuery}
          productSearchResults={productSearchResults}
          productSearchLoading={productSearchLoading}
          handleProductSelection={handleProductSelection}
          showFeedback={showFeedback}
          formatCurrency={formatCurrency}
        />
      )}
      {/* CALLSITE-VERBATIM-END */}
    </div>
  );
}

const HARNESSES = { reference: ProductSearchHarness, extracted: ExtractedProductSearchHarness };
let Harness = ProductSearchHarness;

// ── fixtures ────────────────────────────────────────────────────────────────────────────
const dto = (o = {}) => ({
  id: 'p1', code: 'C1', name: 'Widget', barcode: 'BC-1',
  retailPrice: 100, minPrice: null, maxPrice: null, cost: null, stock: 5,
  departmentId: null, departmentName: '', salesTax: null, maxDiscount: 0,
  isBatch: false, isSerial: false, availableInPos: true,
  ...o,
});
const page = (content) => ({ content, page: 0, totalPages: 1, totalElements: content.length });

const TERMINAL = { terminalId: 'T1', branchId: 'B1' };
const SESSION = { id: 'S1', branchId: 'B-SESSION' };
const TITLE = 'Search Products';
const PLACEHOLDER = 'Type an item code, barcode, or any part of a product name...';
const START = 'Start typing to search the product catalogue.';

// Search calls use page size 30; the grid's mount load uses POS_PRODUCT_PAGE_SIZE (40).
const searchCalls = () => getProductsList.mock.calls.filter((c) => c[1] === 30);

// A pending search response that rejects like axios when its signal aborts.
let pendings = [];
const pendingSearch = () => (_p, _s, _q, signal) => new Promise((resolve, reject) => {
  const entry = { resolve, reject };
  pendings.push(entry);
  signal?.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })));
});

const tick = async (ms = 0) => { await act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); await Promise.resolve(); }); };

let handleProductSelection;
let showFeedback;

const renderHarness = (props = {}) => {
  const p = { currentTerminal: TERMINAL, currentSession: SESSION, handleProductSelection, showFeedback, ...props };
  const H = Harness;
  const utils = render(<H {...p} />);
  const rerender = (next = {}) => utils.rerender(<H {...p} {...next} />);
  return { ...utils, rerender };
};

const openFn = () => fireEvent.click(screen.getByTestId('fn-search-products'));
const input = () => screen.getByPlaceholderText(PLACEHOLDER);
const type = (v) => fireEvent.change(input(), { target: { value: v } });
const isOpen = () => screen.queryByText(TITLE) !== null;
const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const resultButtons = () => [...document.querySelectorAll('.grid button')];

/** Opens, types, and resolves a search with the given DTOs. */
const searchWith = async (query, dtos) => {
  getProductsList.mockImplementation((pg, size) => (size === 30 ? Promise.resolve(page(dtos)) : Promise.resolve(page([]))));
  type(query);
  await tick(300);
  await tick();
};

beforeEach(() => {
  vi.useFakeTimers();
  pendings = [];
  getDepartments.mockReset().mockResolvedValue([]);
  getProductsList.mockReset().mockResolvedValue(page([]));
  handleProductSelection = vi.fn(() => ({ ok: true }));
  showFeedback = vi.fn();
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
    it('renders nothing and never searches while closed', async () => {
      renderHarness();
      await tick(1000);
      expect(isOpen()).toBe(false);
      expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
      expect(searchCalls()).toHaveLength(0);
    });

    it('the function-button opener resets query + results and mounts the modal', async () => {
      renderHarness();
      openFn();
      expect(isOpen()).toBe(true);
      expect(probe('query')).toBe('');
      expect(probe('results')).toBe('');
      expect(screen.getByText('Search by item code, barcode, or product name — matches anywhere in the name.')).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    });

    it('is a plain fixed overlay mounted inline (no portal, no dialog role)', () => {
      renderHarness();
      openFn();
      const overlay = input().closest('.fixed');
      expect(overlay.className).toBe('fixed inset-0 z-50 flex items-center justify-center p-4');
      expect(screen.getByTestId('pos-root').contains(overlay)).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(overlay.children).toHaveLength(2);
      expect(overlay.children[0].className).toBe('absolute inset-0 bg-black/50');
    });
  });

  // ── initial state ─────────────────────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('shows the start prompt, an empty focused input, no spinner, no results, no search', async () => {
      renderHarness();
      openFn();
      expect(input().value).toBe('');
      expect(document.activeElement).toBe(input());
      expect(screen.getByText(START)).toBeTruthy();
      expect(screen.queryByText('Searching...')).toBeNull();
      expect(resultButtons()).toHaveLength(0);
      await tick(1000);
      expect(searchCalls()).toHaveLength(0);
    });

    it('whitespace-only query still shows the start prompt and never searches', async () => {
      renderHarness();
      openFn();
      type('   ');
      expect(input().value).toBe('   ');
      expect(screen.getByText(START)).toBeTruthy();
      await tick(1000);
      expect(searchCalls()).toHaveLength(0);
      expect(probe('loading')).toBe('false');
    });
  });

  // ── search input + loading ────────────────────────────────────────────────────────────────
  describe('search input and loading', () => {
    it('typing writes the hook-owned query and flips loading synchronously, before the debounce', () => {
      renderHarness();
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('wid');
      expect(probe('query')).toBe('wid');
      expect(input().value).toBe('wid');
      expect(probe('loading')).toBe('true');
      expect(screen.getByText('Searching...')).toBeTruthy();
      expect(screen.queryByText(START)).toBeNull();
      expect(searchCalls()).toHaveLength(0);
    });

    it('debounces 300ms, then queries page 0 size 30 with the TRIMMED query and the terminal branch', async () => {
      renderHarness();
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('  wid ');
      await tick(299);
      expect(searchCalls()).toHaveLength(0);
      await tick(1);
      expect(searchCalls()).toHaveLength(1);
      const [pg, size, q, signal, a, b, c, flag, branch] = searchCalls()[0];
      expect([pg, size, q, a, b, c, flag, branch]).toEqual([0, 30, 'wid', null, null, null, true, 'B1']);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(screen.getByText('Searching...')).toBeTruthy();
    });

    it('falls back to the session branch when the terminal has none', async () => {
      renderHarness({ currentTerminal: null });
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('x');
      await tick(300);
      expect(searchCalls()[0][8]).toBe('B-SESSION');
    });

    it('rapid typing only fires one search for the last value', async () => {
      renderHarness();
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('w'); await tick(100);
      type('wi'); await tick(100);
      type('wid'); await tick(300);
      expect(searchCalls().map((c) => c[2])).toEqual(['wid']);
    });

    it('clearing the query returns to the start prompt and clears results + loading', async () => {
      renderHarness();
      openFn();
      await searchWith('wid', [dto()]);
      expect(resultButtons()).toHaveLength(1);
      type('');
      await tick();
      expect(screen.getByText(START)).toBeTruthy();
      expect(probe('results')).toBe('');
      expect(probe('loading')).toBe('false');
      expect(resultButtons()).toHaveLength(0);
    });

    it('while a new query is loading, previous results are hidden behind the spinner', async () => {
      renderHarness();
      openFn();
      await searchWith('wid', [dto()]);
      getProductsList.mockImplementation(pendingSearch());
      type('widg');
      expect(probe('results')).toBe('p1');
      expect(resultButtons()).toHaveLength(0);
      expect(screen.getByText('Searching...')).toBeTruthy();
    });

    it('aborting an in-flight search clears loading via its finally: "No products match" flashes for the new query', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderHarness();
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('ab');
      await tick(300);
      expect(searchCalls()).toHaveLength(1);
      type('abc');
      expect(searchCalls()[0][3].aborted).toBe(true);
      await tick();
      expect(probe('loading')).toBe('false');
      expect(screen.getByText('No products match "abc".')).toBeTruthy();
      // canceled errors are swallowed silently
      expect(err).not.toHaveBeenCalled();
      await tick(300);
      expect(searchCalls().map((c) => c[2])).toEqual(['ab', 'abc']);
    });
  });

  // ── empty / error / populated ───────────────────────────────────────────────────────────────
  describe('empty, error and populated results', () => {
    it('empty response renders the no-match state with the trimmed query', async () => {
      renderHarness();
      openFn();
      await searchWith('  zzz  ', []);
      expect(screen.getByText('No products match "zzz".')).toBeTruthy();
      expect(screen.queryByText('Searching...')).toBeNull();
      expect(resultButtons()).toHaveLength(0);
    });

    it('a response without content is treated as empty', async () => {
      renderHarness();
      openFn();
      getProductsList.mockImplementation((pg, size) => Promise.resolve(size === 30 ? {} : page([])));
      type('q');
      await tick(300); await tick();
      expect(screen.getByText('No products match "q".')).toBeTruthy();
    });

    it('a failed search has NO distinct error UI: it logs and renders the no-match state', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderHarness();
      openFn();
      await searchWith('wid', [dto()]);
      getProductsList.mockImplementation((pg, size) => (size === 30 ? Promise.reject(new Error('boom')) : Promise.resolve(page([]))));
      type('widx');
      await tick(300); await tick();
      expect(err).toHaveBeenCalledWith('Product search failed', expect.any(Error));
      expect(probe('results')).toBe('');
      expect(probe('loading')).toBe('false');
      expect(screen.getByText('No products match "widx".')).toBeTruthy();
      expect(screen.queryByText(/error|failed/i)).toBeNull();
    });

    it('renders one button per mapped result in response order, keyed by id', async () => {
      renderHarness();
      openFn();
      await searchWith('w', [dto(), dto({ id: 'p2', code: 'C2', name: 'Gadget', barcode: 'BC-2', retailPrice: 7.5, stock: 20 })]);
      const rows = resultButtons();
      expect(rows).toHaveLength(2);
      expect(rows.map((b) => b.getAttribute('type'))).toEqual(['button', 'button']);
      expect(rows[0].textContent).toContain('Widget');
      expect(rows[0].textContent).toContain('C1 | BC-1');
      expect(rows[1].textContent).toContain('Gadget');
      expect(rows[1].textContent).toContain('C2 | BC-2');
      expect(screen.queryByText(START)).toBeNull();
      expect(screen.queryByText(/No products match/)).toBeNull();
      expect(document.querySelector('.grid').className).toBe('grid grid-cols-1 sm:grid-cols-2 gap-2.5');
    });

    it('prices render through formatCurrency (CurrencyAmount)', async () => {
      renderHarness();
      openFn();
      await searchWith('w', [dto({ retailPrice: 12.5 })]);
      const priceEl = resultButtons()[0].querySelector('.text-\\[\\#327F74\\]');
      const { container } = render(<CurrencyAmount amount={12.5} />);
      expect(priceEl.innerHTML).toBe(container.innerHTML);
    });

    it('stock badge: >10 green, 1..10 amber, <=0 red "Out of stock"', async () => {
      renderHarness();
      openFn();
      await searchWith('w', [
        dto({ id: 'a', stock: 11 }), dto({ id: 'b', stock: 10 }), dto({ id: 'c', stock: 1 }),
        dto({ id: 'd', stock: 0 }), dto({ id: 'e', stock: -3 }),
      ]);
      const badges = resultButtons().map((b) => b.querySelector('p.text-\\[10px\\]'));
      expect(badges.map((x) => x.textContent)).toEqual(['11 in stock', '10 in stock', '1 in stock', 'Out of stock', 'Out of stock']);
      expect(badges.map((x) => x.className.split(' ').pop())).toEqual(['text-green-600', 'text-amber-600', 'text-amber-600', 'text-red-500', 'text-red-500']);
    });

    it('image vs placeholder icon; barcode-less product shows the code twice (mapper default)', async () => {
      renderHarness();
      openFn();
      await searchWith('w', [dto({ image: 'uploads/w.png' }), dto({ id: 'p2', code: 'C2', name: 'NoImg', barcode: '' })]);
      const [withImg, noImg] = resultButtons();
      const img = withImg.querySelector('img');
      expect(img.getAttribute('alt')).toBe('Widget');
      expect(img.getAttribute('src')).toBe(mapPosProductListItem(dto({ image: 'uploads/w.png' })).image);
      expect(noImg.querySelector('img')).toBeNull();
      expect(noImg.querySelector('svg')).not.toBeNull();
      expect(noImg.textContent).toContain('C2 | C2');
    });

    it('a product with neither code nor barcode shows an empty code line', async () => {
      renderHarness();
      openFn();
      await searchWith('w', [dto({ code: '', barcode: '' })]);
      expect(resultButtons()[0].querySelector('p.font-mono').textContent).toBe('');
    });
  });

  // ── selection ─────────────────────────────────────────────────────────────────────────────
  describe('selecting a result', () => {
    const selectFirst = async (ret, dtos = [dto()]) => {
      handleProductSelection.mockImplementation(() => ret);
      renderHarness();
      openFn();
      await searchWith('wid', dtos);
      fireEvent.click(resultButtons()[0]);
    };

    it('calls handleProductSelection(product, { quantity: 1 }) with the mapped hook result, then toasts success', async () => {
      await selectFirst({ ok: true });
      expect(handleProductSelection).toHaveBeenCalledTimes(1);
      expect(handleProductSelection.mock.calls[0]).toEqual([mapPosProductListItem(dto()), { quantity: 1 }]);
      expect(showFeedback).toHaveBeenCalledTimes(1);
      expect(showFeedback).toHaveBeenCalledWith('success', 'Widget added');
      expect(handleProductSelection.mock.invocationCallOrder[0]).toBeLessThan(showFeedback.mock.invocationCallOrder[0]);
    });

    it('passes the mapped product object (full mapper key set)', async () => {
      const seen = [];
      await selectFirst({ ok: true });
      seen.push(handleProductSelection.mock.calls[0][0]);
      expect(seen[0].id).toBe('p1');
      expect(Object.keys(seen[0])).toEqual(Object.keys(mapPosProductListItem(dto())));
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['{}', {}],
      ['{ ok: true }', { ok: true }],
      ['{ deferred: false }', { deferred: false }],
    ])('return %s -> success toast', async (_l, ret) => {
      await selectFirst(ret);
      expect(showFeedback.mock.calls).toEqual([['success', 'Widget added']]);
    });

    it('{ ok: false, reason } -> error toast with the reason, no success', async () => {
      await selectFirst({ ok: false, reason: 'supervisor-approval-required' });
      expect(showFeedback.mock.calls).toEqual([['error', 'supervisor-approval-required']]);
    });

    it('{ ok: false } without reason -> default error copy', async () => {
      await selectFirst({ ok: false });
      expect(showFeedback.mock.calls).toEqual([['error', 'Could not add this item.']]);
    });

    it('{ ok: false, deferred: true } -> error wins over deferred', async () => {
      await selectFirst({ ok: false, deferred: true, reason: '' });
      expect(showFeedback.mock.calls).toEqual([['error', 'Could not add this item.']]);
    });

    it('{ ok: true, deferred: true } (OPEN_ENTRY_DIALOG mode) -> no toast at all', async () => {
      await selectFirst({ ok: true, deferred: true });
      expect(showFeedback).not.toHaveBeenCalled();
    });

    it('the modal stays open with query + results intact; repeat clicks re-invoke', async () => {
      await selectFirst({ ok: true });
      expect(isOpen()).toBe(true);
      expect(input().value).toBe('wid');
      expect(resultButtons()).toHaveLength(1);
      fireEvent.click(resultButtons()[0]);
      expect(handleProductSelection).toHaveBeenCalledTimes(2);
      expect(showFeedback).toHaveBeenCalledTimes(2);
    });

    it('selecting a later row passes that row product', async () => {
      handleProductSelection.mockReturnValue({ ok: true });
      renderHarness();
      openFn();
      await searchWith('w', [dto(), dto({ id: 'p2', name: 'Gadget' })]);
      fireEvent.click(resultButtons()[1]);
      expect(handleProductSelection.mock.calls[0][0].id).toBe('p2');
      expect(showFeedback).toHaveBeenCalledWith('success', 'Gadget added');
    });

    it('a throwing handler propagates and no toast is emitted', async () => {
      handleProductSelection.mockImplementation(() => { throw new Error('boom'); });
      renderHarness();
      openFn();
      await searchWith('w', [dto()]);
      const onErr = vi.fn((e) => e.preventDefault());
      window.addEventListener('error', onErr);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try { fireEvent.click(resultButtons()[0]); } catch { /* React may rethrow */ }
      window.removeEventListener('error', onErr);
      errSpy.mockRestore();
      expect(showFeedback).not.toHaveBeenCalled();
    });
  });

  // ── keyboard / close ──────────────────────────────────────────────────────────────────────
  describe('keyboard and close', () => {
    it('Escape does nothing (no key handling anywhere in the region)', async () => {
      renderHarness();
      openFn();
      fireEvent.keyDown(input(), { key: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(isOpen()).toBe(true);
    });

    it('Enter / ArrowDown do not select a result', async () => {
      renderHarness();
      openFn();
      await searchWith('w', [dto()]);
      fireEvent.keyDown(input(), { key: 'ArrowDown' });
      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(handleProductSelection).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input());
    });

    it('header X closes', () => {
      renderHarness();
      openFn();
      fireEvent.click(input().closest('.relative.bg-\\[\\#F7F7FA\\]').querySelector('button'));
      expect(isOpen()).toBe(false);
    });

    it('footer Close closes', () => {
      renderHarness();
      openFn();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(isOpen()).toBe(false);
    });

    it('backdrop click closes; clicks inside the panel do not', () => {
      renderHarness();
      openFn();
      fireEvent.click(screen.getByText(START));
      fireEvent.click(input());
      expect(isOpen()).toBe(true);
      fireEvent.click(document.querySelector('.bg-black\\/50'));
      expect(isOpen()).toBe(false);
    });

    it('closing during the debounce cancels the pending search', async () => {
      renderHarness();
      openFn();
      type('wid');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await tick(1000);
      expect(searchCalls()).toHaveLength(0);
    });

    it('closing during an in-flight search aborts it; loading ends false', async () => {
      renderHarness();
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('wid');
      await tick(300);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(searchCalls()[0][3].aborted).toBe(true);
      await tick();
      expect(probe('loading')).toBe('false');
      expect(probe('results')).toBe('');
    });
  });

  // ── close / reopen ────────────────────────────────────────────────────────────────────────
  describe('close and reopen', () => {
    it('close retains query + results in the hook; a raw reopen shows the old query and re-searches', async () => {
      renderHarness();
      openFn();
      await searchWith('wid', [dto()]);
      fireEvent.click(screen.getByTestId('raw-close'));
      expect(probe('query')).toBe('wid');
      expect(probe('results')).toBe('p1');
      fireEvent.click(screen.getByTestId('raw-open'));
      expect(input().value).toBe('wid');
      expect(screen.getByText('Searching...')).toBeTruthy();
      await tick(300); await tick();
      expect(searchCalls().map((c) => c[2])).toEqual(['wid', 'wid']);
      expect(resultButtons()).toHaveLength(1);
    });

    it('the function-button opener resets to a clean start state', async () => {
      renderHarness();
      openFn();
      await searchWith('wid', [dto()]);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      openFn();
      expect(input().value).toBe('');
      expect(screen.getByText(START)).toBeTruthy();
      expect(resultButtons()).toHaveLength(0);
      await tick(1000);
      expect(searchCalls()).toHaveLength(1);
    });

    it('reopen remounts the tree: new input node, autofocused again', () => {
      renderHarness();
      openFn();
      const first = input();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      first.ownerDocument.body.focus();
      openFn();
      expect(input()).not.toBe(first);
      expect(first.isConnected).toBe(false);
      expect(document.activeElement).toBe(input());
    });
  });

  // ── parent rerender while open ────────────────────────────────────────────────────────────
  describe('parent rerender while open', () => {
    it('keeps the same DOM nodes, value, focus and caret across a rerender with new callback identities', async () => {
      const { rerender } = renderHarness();
      openFn();
      await searchWith('widget', [dto()]);
      const node = input();
      const row = resultButtons()[0];
      node.focus();
      node.setSelectionRange(2, 4);
      const hps = vi.fn(() => ({ ok: true }));
      const fb = vi.fn();
      rerender({ handleProductSelection: hps, showFeedback: fb });
      expect(input()).toBe(node);
      expect(resultButtons()[0]).toBe(row);
      expect(document.activeElement).toBe(node);
      expect([node.selectionStart, node.selectionEnd]).toEqual([2, 4]);
      fireEvent.click(resultButtons()[0]);
      expect(handleProductSelection).not.toHaveBeenCalled();
      expect(hps).toHaveBeenCalledTimes(1);
      expect(fb).toHaveBeenCalledWith('success', 'Widget added');
    });

    it('a parent rerender does not re-run the search', async () => {
      const { rerender } = renderHarness();
      openFn();
      await searchWith('wid', [dto()]);
      rerender({ currentTerminal: { terminalId: 'T1', branchId: 'B1' } });
      rerender({ currentSession: { id: 'S2', branchId: 'B9' } });
      await tick(1000);
      expect(searchCalls()).toHaveLength(1);
    });

    it('a branch change during the debounce still queries with the branch captured when the effect ran', async () => {
      const { rerender } = renderHarness();
      openFn();
      getProductsList.mockImplementation(pendingSearch());
      type('wid');
      rerender({ currentTerminal: { terminalId: 'T2', branchId: 'B2' } });
      await tick(300);
      expect(searchCalls()[0][8]).toBe('B1');
    });

    it('caret position is preserved while typing (controlled input, no remount)', () => {
      renderHarness();
      openFn();
      const node = input();
      type('abcd');
      node.setSelectionRange(1, 1);
      type('abXcd');
      expect(input()).toBe(node);
      expect(node.value).toBe('abXcd');
    });
  });
});

// ── source contract ───────────────────────────────────────────────────────────────────────
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const CHILD_PATH = '../features/products/ProductSearch.jsx';

describe('source contract', () => {
  const PARENT = read('../../POSSales.jsx');
  const CHILD = read(CHILD_PATH);
  // the child with its header comment stripped, for scans that must ignore prose
  const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
  const TEST = read('./ProductSearch.characterization.test.jsx');
  const HOOK = read('../features/products/useProductCatalog.js');
  const ENTRY = read('../features/products/useProductEntry.js');
  const TOUCH = read('../POSTouchScreen.jsx');
  const CONSOLE = read('../POSConsole.jsx');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* ─── SEARCH PRODUCTS MODAL ─── */}';
  const start = LINES.indexOf(ANCHOR);
  const end = LINES.indexOf('      )}', start);
  const CALLSITE = LINES.slice(start, end + 1).join('\n');

  const between = (text, a, b) => {
    const i = text.indexOf(a);
    const j = text.indexOf(b, i);
    return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
  };

  // The pre-extraction region (reference copy in this file) and the shipped child's JSX body.
  const REGION = between(TEST, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
  const CHILD_BODY = CHILD.slice(CHILD.indexOf('}) {\n  return (\n') + '}) {\n  return (\n'.length, CHILD.lastIndexOf('\n  );\n}\n\nexport default ProductSearch;'));

  const PROPS = [
    'showProductSearch', 'setShowProductSearch',
    'productSearchQuery', 'setProductSearchQuery',
    'productSearchResults', 'productSearchLoading',
    'handleProductSelection', 'showFeedback', 'formatCurrency',
  ];
  const MODULE = ['AlertCircle', 'Package', 'Search', 'X'];

  it('pins the exact boundaries, size and siblings', () => {
    expect(start).toBeGreaterThan(-1);
    expect(LINES[start + 1]).toBe('      {showProductSearch && (');
    expect(LINES[start + 2]).toBe('        <ProductSearch');
    expect(LINES[end - 1]).toBe('        />');
    expect(end - start + 1).toBe(14);
    expect(LINES[start - 1]).toBe('');
    // upper sibling: the Price Check call site (extracted to PriceCheck.jsx)
    expect(LINES[start - 2]).toBe('      )}');
    expect(LINES[start - 3]).toBe('        />');
    expect(LINES[start - 4]).toBe('          handleProductSelection={handleProductSelection}');
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe('      {/* ─── CREDIT BALANCE MODAL ─── */}');
    expect(PARENT.split('SEARCH PRODUCTS MODAL').length - 1).toBe(1);
    // the mount condition stays in the parent, exactly once
    expect(PARENT.split('{showProductSearch && ').length - 1).toBe(1);
    expect(CHILD_CODE).not.toContain('showProductSearch &&');
    // one call site, no key / memo wrapper, the inline tree is gone from the parent
    expect(PARENT.split('<ProductSearch').length - 1).toBe(1);
    expect(PARENT).not.toContain('<ProductSearch key=');
    expect(PARENT).not.toContain('memo(ProductSearch');
    expect(PARENT).not.toContain('Search by item code, barcode, or product name');
    expect(PARENT).toContain("import ProductSearch from './POS/features/products/ProductSearch';");
    expect(CALLSITE).not.toContain('(() => {');
  });

  it('the harness call site is byte-identical to POSSales', () => {
    expect(between(TEST, '{/* CALLSITE-VERBATIM-START */}', '{/* CALLSITE-VERBATIM-END */}')).toBe(CALLSITE);
  });

  it('the call site passes exactly the 9 bindings, one per line, directly under their original names', () => {
    PROPS.forEach((name) => expect(CALLSITE, name).toContain(`          ${name}={${name}}\n`));
    expect(CALLSITE.match(/^ {10}[A-Za-z0-9_]+=\{/gm)).toHaveLength(9);
    expect(CALLSITE).not.toContain('{...');
    expect(CALLSITE).not.toContain('setProductSearchResults');
    // handleProductSelection is passed straight through — no wrapper arrow, no bind
    expect(CALLSITE).toContain('          handleProductSelection={handleProductSelection}\n');
    expect(CALLSITE).not.toContain('=>');
  });

  it('the pre-extraction reference is the 87-line region', () => {
    const lines = REGION.split('\n');
    expect(lines).toHaveLength(87);
    expect(lines[0]).toBe(ANCHOR);
    expect(lines[1]).toBe('      {showProductSearch && (');
    expect(lines[2]).toBe('        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">');
    expect(lines[85]).toBe('        </div>');
    expect(lines[86]).toBe('      )}');
    expect(REGION).not.toContain('(() => {');
  });

  it('the child body is byte-identical to the reference JSX tree (re-indented from 8 to 4 spaces)', () => {
    const tree = REGION.split('\n').slice(2, -1).map((l) => l.replace(/^ {4}/, '')).join('\n');
    expect(CHILD_BODY).toBe(tree);
  });

  it('the child is a module-level component taking exactly the 9 props, no spread, no memo', () => {
    expect(CHILD).toContain(`\nfunction ProductSearch({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n  return (\n`);
    expect(CHILD.match(/^function /gm)).toHaveLength(1);
    expect(CHILD).toContain('\nexport default ProductSearch;\n');
    expect(CHILD.match(/^export /gm)).toHaveLength(1);
    ['...props', '...rest', 'memo(', 'forwardRef', 'setProductSearchResults'].forEach((s) => expect(CHILD, s).not.toContain(s));
  });

  it('the child imports only React and the four lucide icons (no hooks, no API, no context)', () => {
    expect(CHILD.match(/^import .*$/gm)).toEqual([
      "import React from 'react';",
      "import { AlertCircle, Package, Search, X } from 'lucide-react';",
    ]);
    ['useProductCatalog', 'useProductEntry', 'useCart', 'useCheckout', 'usePosSession', '/api/', 'Api', 'useContext', 'Context']
      .forEach((s) => expect(CHILD_CODE, s).not.toContain(s));
    // the icons are still used elsewhere in POSSales, so the parent keeps its imports
    MODULE.forEach((icon) => expect(PARENT).toMatch(new RegExp(`^  ${icon},$`, 'm')));
  });

  it('the harness formatCurrency is byte-identical to POSSales', () => {
    const copy = between(TEST, '// FORMAT-VERBATIM-START', '// FORMAT-VERBATIM-END');
    expect(PARENT).toContain(`\n${copy}\n`);
    expect(PARENT.split('const formatCurrency = ').length - 1).toBe(1);
    // the extracted harness declares the same formatter
    expect(TEST.split(`\n${copy}\n`).length - 1).toBe(2);
  });

  // Free identifiers of the region: strip comments, strings, JSX text, member accesses,
  // object keys and JSX attribute names, then drop region-local bindings and JS keywords.
  const freeIdentifiers = (src) => {
    let s = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');
    s = s.replace(/`[^`]*`/g, (m) => ` ${(m.match(/\$\{[^}]*\}/g) || []).map((x) => x.slice(2, -1)).join(' ')} `);
    s = s.replace(/'[^'\n]*'/g, '""').replace(/"[^"\n]*"/g, '""');
    s = s.replace(/>([^<>{}]*)</g, '><');
    const out = new Set();
    const re = /(\.)?\b([A-Za-z_$][\w$]*)\b(\s*[:=](?![=>]))?/g;
    let m;
    while ((m = re.exec(s))) { if (!m[1] && !m[3]) out.add(m[2]); }
    const LOCAL = ['e', 'product', 'res'];
    const SYNTAX = ['const', 'return', 'if', 'false', 'autoFocus', 'div', 'span', 'p', 'button', 'input', 'img'];
    return [...out].filter((t) => !LOCAL.includes(t) && !SYNTAX.includes(t)).sort();
  };

  it('pins the exact direct dependency surface (9 POSSales bindings + 4 lucide icons)', () => {
    expect(freeIdentifiers(REGION)).toEqual([...MODULE, ...PROPS].sort());
    // The `showProductSearch &&` guard stays at the call site, so the child body reads the other 8.
    expect(freeIdentifiers(CHILD_BODY)).toEqual([...MODULE, ...PROPS].filter((n) => n !== 'showProductSearch').sort());
    // setProductSearchResults is destructured in POSSales but only forwarded to POSTouchScreen
    expect(REGION).not.toContain('setProductSearchResults');
    expect(CHILD).not.toContain('setProductSearchResults');
  });

  it('six bindings come from useProductCatalog; handleProductSelection from useProductEntry; the rest are POSSales-owned', () => {
    const catalog = between(PARENT, '  // ── Product catalog / search ─', '  } = useProductCatalog(');
    ['showProductSearch', 'setShowProductSearch', 'productSearchQuery', 'setProductSearchQuery', 'productSearchResults', 'productSearchLoading']
      .forEach((n) => expect(catalog).toMatch(new RegExp(`\\b${n}\\b`)));
    expect(PARENT).toContain('    handleUnifiedEntry, handleBarcodeScan, handleProductSelection, handleEditItem,\n');
    expect(PARENT).toContain('  const showFeedback = useCallback((type, message) => {');
    expect(PARENT).toContain('  const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;');
    // both hooks are still called exactly once, in POSSales
    expect(PARENT.split('useProductCatalog(').length - 1).toBe(1);
    expect(PARENT.split('useProductEntry(').length - 1).toBe(1);
    expect(PARENT).toContain("import { useProductCatalog } from './POS/features/products/useProductCatalog';");
    expect(PARENT).toContain("import { useProductEntry } from './POS/features/products/useProductEntry';");
    // hook ownership of every piece of search state
    [
      '  const [showProductSearch, setShowProductSearch] = useState(false);',
      "  const [productSearchQuery, setProductSearchQuery] = useState('');",
      '  const [productSearchResults, setProductSearchResults] = useState([]);',
      '  const [productSearchLoading, setProductSearchLoading] = useState(false);',
      '  }, [productSearchQuery, showProductSearch]);',
    ].forEach((s) => expect(HOOK).toContain(s));
    // setProductSearchLoading never leaves the hook
    expect(HOOK).not.toMatch(/return \{[\s\S]*setProductSearchLoading[\s\S]*\};\n\}/);
    expect(PARENT).not.toContain('setProductSearchLoading');
    expect(CHILD).not.toContain('setProductSearchLoading');
    expect(PARENT).not.toContain('useState(false);\n  const [productSearch');
  });

  it('POSSales never writes search state itself: the only opener is POSTouchScreen', () => {
    // the setter calls moved into the child with the region; POSSales now only forwards setters
    expect(PARENT.split('setShowProductSearch(').length - 1).toBe(0);
    expect(PARENT.split('setProductSearchQuery(').length - 1).toBe(0);
    expect(PARENT.split('setProductSearchResults(').length - 1).toBe(0);
    expect(PARENT).toContain('    setPriceCheckResult, setShowProductSearch, setProductSearchQuery, setProductSearchResults,\n');
    expect(TOUCH).toContain("action: () => { setProductSearchQuery(''); setProductSearchResults([]); setShowProductSearch(true); } },");
    expect(TEST).toContain("onClick={() => { setProductSearchQuery(''); setProductSearchResults([]); setShowProductSearch(true); }}");
    // POSConsole only lists the button id for layout config; it opens nothing
    expect(CONSOLE).not.toContain('setShowProductSearch');
    expect(TOUCH).not.toContain('ProductSearch from');
  });

  it('owns no hooks, refs, effects, portals, context, keyboard or focus management beyond autoFocus', () => {
    ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect', 'memo(', 'createPortal', 'ref=', 'ref={', 'onKeyDown', 'onKeyUp', 'addEventListener', '.focus(', '<Dialog', 'Escape', 'productCacheRef']
      .forEach((s) => {
        expect(REGION, s).not.toContain(s);
        expect(CHILD, s).not.toContain(s);
      });
    for (const src of [REGION, CHILD]) {
      expect(src.split('autoFocus').length - 1).toBe(1);
      expect(src.match(/key=\{/g)).toEqual(['key={']);
      expect(src).toContain('key={product.id}');
    }
  });

  it('the region calls exactly: setShowProductSearch x3, setProductSearchQuery x1, handleProductSelection x1, showFeedback x2', () => {
    for (const src of [REGION, CHILD_BODY]) {
      const count = (n) => src.split(`${n}(`).length - 1;
      expect(count('setShowProductSearch')).toBe(3);
      expect(src.split('setShowProductSearch(false)').length - 1).toBe(3);
      expect(count('setProductSearchQuery')).toBe(1);
      expect(count('handleProductSelection')).toBe(1);
      expect(src).toContain('const res = handleProductSelection(product, { quantity: 1 });');
      expect(count('showFeedback')).toBe(2);
      expect(count('formatCurrency')).toBe(1);
    }
  });

  it('has no hidden cart/entry-mode/scanner/checkout/customer/delivery/layaway/session/print dependency', () => {
    [
      'currentInvoice', 'addToInvoice', 'cart', 'Cart', 'productEntryMode', 'ProductEntryMode', 'posSettings', 'barcodeInput', 'scan', 'Scan',
      'checkout', 'Checkout', 'payment', 'Payment', 'customer', 'Customer', 'delivery', 'Delivery', 'layaway', 'Layaway',
      'session', 'Session', 'terminal', 'Terminal', 'print', 'Print', 'report', 'Report', 'branch', 'Branch', 'posActionMode',
      'searchQuery', 'posProducts', 'getProductsList', 'resolvePosEntry',
    ].forEach((name) => {
      expect(REGION, name).not.toContain(name);
      expect(CHILD_BODY, name).not.toContain(name);
    });
  });

  it('entry-mode behaviour is encapsulated in handleProductSelection (deferred = Item Entry dialog)', () => {
    const body = ENTRY.slice(ENTRY.indexOf('  const handleProductSelection = useCallback('), ENTRY.indexOf('  handleProductSelectionRef.current = handleProductSelection;'));
    expect(body).toContain('return addToInvoiceRef.current(product, quantity, batch, serial, expiry);');
    expect(body).toContain('return { ok: true, deferred: true };');
    expect(body).toContain("if (!product) return { ok: false, reason: 'No product selected' };");
  });

  it('boundary realised: one JSX root returned by a module-level component, guarded by showProductSearch in the parent', () => {
    expect(CHILD_BODY.startsWith('    <div ')).toBe(true);
    expect(CHILD_BODY.endsWith('\n    </div>')).toBe(true);
    expect(CHILD_BODY.match(/^ {4}<\/?div/gm)).toEqual(['    <div', '    </div']);
    // the component is not declared inside POSSales
    expect(PARENT).not.toMatch(/function ProductSearch\b/);
    expect(PARENT).not.toMatch(/const ProductSearch\b/);
  });
});

// ── mutation safeguards ─────────────────────────────────────────────────────────────────────
// Compiles mutated copies of the SHIPPED child (esbuild, in a child node process — esbuild cannot
// load under jsdom) and proves the behavioural checks reject each mutation, while the unmutated
// compile passes all of them.
describe('mutation safeguards', () => {
  const CHILD = read(CHILD_PATH);
  const MUTANTS = {
    control: (s) => s,
    quantity2: (s) => s.replace('handleProductSelection(product, { quantity: 1 })', 'handleProductSelection(product, { quantity: 2 })'),
    noAutoFocus: (s) => s.replace(/^ *autoFocus\n/m, ''),
    noDeferred: (s) => s.replace(/^ *if \(res\?\.deferred\) return;\n/m, ''),
    stockThreshold: (s) => s.replace('product.stock > 10 ?', 'product.stock > 9 ?'),
  };
  const compiled = {};

  beforeAll(() => {
    const sources = {};
    for (const [name, mutate] of Object.entries(MUTANTS)) {
      const src = mutate(CHILD);
      if (name !== 'control') expect(src, `${name} mutation must apply`).not.toBe(CHILD);
      sources[name] = src.replace(/^import .*$/gm, '').replace('export default ProductSearch;', '');
    }
    const script = [
      "const { transformSync } = require('esbuild');",
      "const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));",
      'const out = {};',
      "for (const [k, v] of Object.entries(input)) out[k] = transformSync(v, { loader: 'jsx', jsx: 'transform' }).code;",
      'process.stdout.write(JSON.stringify(out));',
    ].join('\n');
    const codes = JSON.parse(execFileSync(process.execPath, ['-e', script], {
      input: JSON.stringify(sources), cwd: path.resolve(__dirname, '../../../../..'), encoding: 'utf8',
    }));
    for (const [name, code] of Object.entries(codes)) {
      compiled[name] = new Function('React', 'AlertCircle', 'Package', 'Search', 'X', `${code}\nreturn ProductSearch;`)(React, AlertCircle, Package, Search, X);
    }
  }, 30000);

  beforeEach(() => { Harness = ExtractedProductSearchHarness; });
  afterEach(() => { ProductSearch = ShippedProductSearch; });

  const passes = async (check) => {
    try { await check(); return true; } catch { return false; } finally { cleanup(); }
  };
  const CHECKS = {
    quantityOne: async () => {
      renderHarness(); openFn();
      await searchWith('wid', [dto()]);
      fireEvent.click(resultButtons()[0]);
      expect(handleProductSelection.mock.calls[0][1]).toEqual({ quantity: 1 });
    },
    autoFocus: async () => {
      renderHarness(); openFn();
      expect(document.activeElement).toBe(input());
    },
    deferredNoToast: async () => {
      handleProductSelection.mockImplementation(() => ({ ok: true, deferred: true }));
      renderHarness(); openFn();
      await searchWith('wid', [dto()]);
      fireEvent.click(resultButtons()[0]);
      expect(showFeedback).not.toHaveBeenCalled();
    },
    stockBadge: async () => {
      renderHarness(); openFn();
      await searchWith('w', [dto({ id: 'a', stock: 11 }), dto({ id: 'b', stock: 10 })]);
      const badges = resultButtons().map((b) => b.querySelector('p.text-\\[10px\\]').className.split(' ').pop());
      expect(badges).toEqual(['text-green-600', 'text-amber-600']);
    },
  };
  const failingChecks = async (mutant) => {
    ProductSearch = compiled[mutant];
    const failed = [];
    for (const [name, check] of Object.entries(CHECKS)) {
      handleProductSelection.mockReset().mockImplementation(() => ({ ok: true }));
      showFeedback.mockReset();
      if (!(await passes(check))) failed.push(name);
    }
    return failed;
  };

  it.each([
    ['control', []],
    ['quantity2', ['quantityOne']],
    ['noAutoFocus', ['autoFocus']],
    ['noDeferred', ['deferredNoToast']],
    ['stockThreshold', ['stockBadge']],
  ])('%s -> failing checks %j', async (mutant, expected) => {
    expect(await failingChecks(mutant)).toEqual(expected);
  });
});

// keep lint honest about imports used only inside the verbatim region
void [AlertCircle, Package, Search, X, React];
