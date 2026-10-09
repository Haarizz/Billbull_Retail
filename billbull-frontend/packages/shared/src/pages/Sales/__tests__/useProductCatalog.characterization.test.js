import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/departmentsApi', () => ({ getDepartments: vi.fn() }));
vi.mock('../../../api/productsApi', () => ({
  getProducts: vi.fn(),
  getProductsList: vi.fn(),
  getFavouriteProducts: vi.fn(),
  getRecentlySoldProducts: vi.fn(),
  getTopSoldProducts: vi.fn(),
  addProductFavourite: vi.fn(),
  removeProductFavourite: vi.fn(),
}));
vi.mock('../../../api/posApi', () => ({ resolvePosEntry: vi.fn() }));

import { getDepartments } from '../../../api/departmentsApi';
import {
  getProducts, getProductsList, getFavouriteProducts, getRecentlySoldProducts, getTopSoldProducts,
  addProductFavourite, removeProductFavourite,
} from '../../../api/productsApi';
import { resolvePosEntry } from '../../../api/posApi';
import { useProductCatalog } from '../POS/features/products/useProductCatalog';

/**
 * CHARACTERIZATION — the product catalog/search boundary.
 *
 * loadPosProducts (~120 lines), the paging state, the categories/favourites derivations,
 * and the two debounced type-ahead effects (Search Products modal, Cart Focus suggestions)
 * lived inline in POSSales.jsx, all writing into one productCacheRef shared with product
 * entry. This extraction moved them verbatim into useProductCatalog, which now allocates
 * and owns that Map — useProductEntry (see useProductEntry.characterization) receives the
 * same ref object unchanged.
 *
 * SCOPE. Cart/entry behaviour is characterized elsewhere (useProductEntry, useCart). This
 * file establishes the CATALOG contract: the fetch/paging/search state machine, the
 * favourites-tab / special-category routing, the resolve-on-empty-search fallback, the
 * fallback-to-getProducts() on hard failure, and that the cache these effects populate is
 * the one useProductEntry's fast path reads.
 *
 * TIMING. Fake timers drive the debounce intervals deterministically. `testing-library`'s
 * `waitFor` polls on real timers and deadlocks under `vi.useFakeTimers()`, so every wait
 * here goes through `tick()`, which advances the virtual clock AND flushes the microtask
 * queue (mocked promise resolutions) inside one `act()`.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A /api/products/list row, the shape mapPosProductListItem eats. */
const dto = (over = {}) => ({
  id: 'p1', code: 'C1', name: 'Widget', barcode: 'BC-1',
  retailPrice: 100, minPrice: null, maxPrice: null, cost: null, stock: 5,
  departmentId: null, departmentName: '', salesTax: null, maxDiscount: 0,
  isBatch: false, isSerial: false, availableInPos: true,
  ...over,
});

const page = (content, over = {}) => ({
  content, page: 0, totalPages: 1, totalElements: content.length, ...over,
});

const TERMINAL = { branchId: 7 };
const SESSION = { branchId: 7 };

// ── Harness ─────────────────────────────────────────────────────────────────

const setup = (initialProps = {}) => renderHook(
  (props) => useProductCatalog(props),
  { initialProps: { currentTerminal: TERMINAL, currentSession: SESSION, barcodeInput: '', posActionMode: 'none', ...initialProps } }
);

/** Advances the fake clock and flushes the resulting microtask queue inside act(). */
const tick = async (ms) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

/** Mounts and lets the initial (undebounced) product load settle. */
const settled = async (initialProps = {}) => {
  const view = setup(initialProps);
  await tick(0);
  return view;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  getDepartments.mockResolvedValue([]);
  getProductsList.mockResolvedValue(page([]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Hook surface / initial state ────────────────────────────────────────────

describe('hook surface', () => {
  it('exposes the grid, search, category, favourite and cache surface POSSales consumes', async () => {
    const view = await settled();
    const r = view.result.current;
    expect(Array.isArray(r.posProducts)).toBe(true);
    expect(typeof r.loadPosProducts).toBe('function');
    expect(typeof r.loadMorePosProducts).toBe('function');
    expect(typeof r.toggleFavourite).toBe('function');
    expect(typeof r.setSearchQuery).toBe('function');
    expect(typeof r.setSelectedCategory).toBe('function');
    expect(r.selectedCategory).toBe('all');
    expect(r.productCacheRef.current).toBeInstanceOf(Map);
    expect(Array.isArray(r.productCategories)).toBe(true);
    expect(Array.isArray(r.horizontalCategories)).toBe(true);
  });

  it('the horizontal (special) tabs are a fixed, stable list', async () => {
    const view = await settled();
    expect(view.result.current.horizontalCategories.map((c) => c.id)).toEqual(['all', 'favourites', 'recently-sold', 'top-sold']);
  });

  it('productCacheRef keeps the same identity across re-renders', async () => {
    const view = await settled();
    const ref1 = view.result.current.productCacheRef;
    view.rerender({ currentTerminal: TERMINAL, currentSession: SESSION, barcodeInput: '', posActionMode: 'none' });
    expect(view.result.current.productCacheRef).toBe(ref1);
  });

  it('loads departments once on mount and builds "All Items" + one category per department', async () => {
    getDepartments.mockResolvedValue([{ id: 5, name: 'Beverages' }, { id: 6, name: 'Snacks' }]);
    const view = await settled();
    expect(view.result.current.productCategories.map((c) => c.id)).toEqual(['all', '5', '6']);
    expect(getDepartments).toHaveBeenCalledTimes(1);
  });

  it('a department with no name falls back to "Department N"', async () => {
    getDepartments.mockResolvedValue([{ id: 9 }]);
    const view = await settled();
    expect(view.result.current.productCategories[1].name).toBe('Department 1');
  });

  it('a failed department load leaves the category list at just "All Items", not throwing', async () => {
    getDepartments.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = await settled();
    expect(view.result.current.productCategories).toHaveLength(1);
  });
});

// ── Initial load / paging ───────────────────────────────────────────────────

describe('loadPosProducts — initial load', () => {
  it('loads on mount, maps the page, and populates the cache', async () => {
    getProductsList.mockResolvedValue(page([dto()], { totalElements: 1, totalPages: 1 }));
    const view = setup();
    expect(view.result.current.posProductsLoading).toBe(true);
    await tick(0);

    expect(view.result.current.posProductsLoading).toBe(false);
    expect(view.result.current.posProducts).toEqual([expect.objectContaining({ id: 'p1', name: 'Widget', price: 100 })]);
    expect(view.result.current.posProductTotalElements).toBe(1);
    expect([...view.result.current.productCacheRef.current.keys()].sort()).toEqual(['bc-1', 'c1', 'p1', 'widget']);
  });

  it('passes the branch id resolved from terminal, falling back to session', async () => {
    await settled({ currentTerminal: null, currentSession: { branchId: 42 } });
    expect(getProductsList).toHaveBeenCalledWith(0, 40, '', expect.any(AbortSignal), null, null, null, true, 42);
  });

  it('an empty page leaves the grid empty without error', async () => {
    getProductsList.mockResolvedValue(page([]));
    const view = await settled();
    expect(view.result.current.posProducts).toEqual([]);
    expect(view.result.current.posProductsError).toBe('');
  });

  it('CHARACTERIZED BEHAVIOUR: a hard failure falls back to the unpaginated getProducts() and clears the error', async () => {
    getProductsList.mockRejectedValue(new Error('network down'));
    getProducts.mockResolvedValue([{ id: 'f1', name: 'Fallback', retailPrice: 20, availableInPos: true }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = await settled();

    expect(view.result.current.posProducts).toEqual([expect.objectContaining({ id: 'f1', name: 'Fallback' })]);
    expect(view.result.current.posProductsError).toBe('');
    expect(view.result.current.posProductTotalPages).toBe(1);
  });

  it('CHARACTERIZED BEHAVIOUR: the fallback filters out products not available in POS', async () => {
    getProductsList.mockRejectedValue(new Error('down'));
    getProducts.mockResolvedValue([
      { id: 'a', name: 'A', retailPrice: 1, availableInPos: true },
      { id: 'b', name: 'B', retailPrice: 1, availableInPos: false },
    ]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = await settled();
    expect(view.result.current.posProducts.map((p) => p.id)).toEqual(['a']);
  });

  it('when both the paginated call and the fallback fail, surfaces the generic error', async () => {
    getProductsList.mockRejectedValue(new Error('down'));
    getProducts.mockRejectedValue(new Error('also down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = await settled();
    expect(view.result.current.posProducts).toEqual([]);
    expect(view.result.current.posProductsError).toBe('Products could not be loaded.');
  });
});

describe('loadMorePosProducts — pagination', () => {
  it('requests the next page and APPENDS rather than replacing', async () => {
    getProductsList.mockResolvedValueOnce(page([dto({ id: 'p1' })], { page: 0, totalPages: 2, totalElements: 2 }));
    const view = await settled();

    getProductsList.mockResolvedValueOnce(page([dto({ id: 'p2' })], { page: 1, totalPages: 2, totalElements: 2 }));
    await act(async () => { view.result.current.loadMorePosProducts(); await Promise.resolve(); });

    expect(view.result.current.posProducts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(getProductsList).toHaveBeenLastCalledWith(1, 40, '', undefined, null, null, null, true, 7);
  });

  it('is a no-op past the last page', async () => {
    getProductsList.mockResolvedValue(page([dto()], { page: 0, totalPages: 1, totalElements: 1 }));
    const view = await settled();
    getProductsList.mockClear();

    await act(async () => { view.result.current.loadMorePosProducts(); });
    expect(getProductsList).not.toHaveBeenCalled();
  });
});

// ── Search: debounce ─────────────────────────────────────────────────────────

describe('grid search — debounce', () => {
  it('does not requery before the 300ms debounce elapses', async () => {
    const view = await settled();
    getProductsList.mockClear();

    act(() => view.result.current.setSearchQuery('widget'));
    await tick(299);
    expect(getProductsList).not.toHaveBeenCalled();
  });

  it('requeries with the trimmed query once the debounce elapses', async () => {
    const view = await settled();
    getProductsList.mockClear();

    act(() => view.result.current.setSearchQuery('  widget  '));
    await tick(300);
    expect(getProductsList).toHaveBeenCalledWith(0, 40, 'widget', expect.any(AbortSignal), null, null, null, true, 7);
  });

  it('rapid keystrokes reset the timer — only the final value is ever queried', async () => {
    const view = await settled();
    getProductsList.mockClear();

    act(() => view.result.current.setSearchQuery('w'));
    await tick(200);
    act(() => view.result.current.setSearchQuery('wi'));
    await tick(200);
    act(() => view.result.current.setSearchQuery('wid'));
    await tick(300);

    const queries = getProductsList.mock.calls.map((c) => c[2]);
    expect(queries).toEqual(['wid']);
  });

  it('clearing the search box reloads the unfiltered grid, not a special tab', async () => {
    const view = await settled();
    act(() => view.result.current.setSearchQuery('x'));
    await tick(300);
    getProductsList.mockClear();

    act(() => view.result.current.setSearchQuery(''));
    await tick(300);
    expect(getProductsList).toHaveBeenCalledWith(0, 40, '', expect.any(AbortSignal), null, null, null, true, 7);
  });

  it('CHARACTERIZED BEHAVIOUR: an empty search with no results falls back to resolvePosEntry and shows a single resolved product', async () => {
    getProductsList.mockResolvedValue(page([]));
    resolvePosEntry.mockResolvedValue({
      type: 'PRODUCT',
      product: { product: { id: 'r1', code: 'R1', name: 'Resolved', isBatch: false, isSerial: false, availableInPos: true }, effectivePricing: { retailPrice: 55 } },
    });
    const view = await settled();
    getProductsList.mockClear();

    act(() => view.result.current.setSearchQuery('R1'));
    await tick(300);
    expect(view.result.current.posProducts).toEqual([expect.objectContaining({ id: 'r1', name: 'Resolved', price: 55 })]);
    expect(view.result.current.posProductTotalElements).toBe(1);
    expect(resolvePosEntry).toHaveBeenCalledWith('R1');
  });

  it('a failed resolve fallback silently keeps the grid empty', async () => {
    getProductsList.mockResolvedValue(page([]));
    resolvePosEntry.mockRejectedValue(new Error('no match'));
    const view = await settled();

    act(() => view.result.current.setSearchQuery('zzz'));
    await tick(300);
    expect(view.result.current.posProductsLoading).toBe(false);
    expect(view.result.current.posProducts).toEqual([]);
  });
});

// ── Categories / special tabs ────────────────────────────────────────────────

describe('category selection', () => {
  it('a numeric department id is sent as departmentId and "all" sends null', async () => {
    const view = await settled();
    getProductsList.mockClear();

    await act(async () => { view.result.current.setSelectedCategory('5'); await Promise.resolve(); });
    expect(getProductsList).toHaveBeenCalledWith(0, 40, '', expect.any(AbortSignal), null, 5, null, true, 7);
  });

  it('favourites/recently-sold/top-sold route to their own endpoints, not getProductsList', async () => {
    getFavouriteProducts.mockResolvedValue(page([dto({ id: 'fav1' })]));
    getRecentlySoldProducts.mockResolvedValue(page([dto({ id: 'rec1' })]));
    getTopSoldProducts.mockResolvedValue(page([dto({ id: 'top1' })]));
    const view = await settled();

    await act(async () => { view.result.current.setSelectedCategory('favourites'); await Promise.resolve(); });
    expect(view.result.current.posProducts[0]?.id).toBe('fav1');
    expect(getFavouriteProducts).toHaveBeenCalledWith(0, 40, expect.any(AbortSignal));

    await act(async () => { view.result.current.setSelectedCategory('recently-sold'); await Promise.resolve(); });
    expect(view.result.current.posProducts[0]?.id).toBe('rec1');

    await act(async () => { view.result.current.setSelectedCategory('top-sold'); await Promise.resolve(); });
    expect(view.result.current.posProducts[0]?.id).toBe('top1');
  });

  it('CHARACTERIZED BEHAVIOUR: a search query overrides a special tab — searching while on Favourites still hits getProductsList', async () => {
    const view = await settled();
    await act(async () => { view.result.current.setSelectedCategory('favourites'); await Promise.resolve(); });
    getProductsList.mockClear();
    getFavouriteProducts.mockClear();

    act(() => view.result.current.setSearchQuery('milk'));
    await tick(300);
    expect(getProductsList).toHaveBeenCalled();
    expect(getFavouriteProducts).not.toHaveBeenCalled();
  });

  it('landing on the favourites tab with results seeds favouriteProductIds from the page', async () => {
    getFavouriteProducts.mockResolvedValue(page([dto({ id: 'fav1' }), dto({ id: 'fav2', code: 'C2', barcode: 'BC-2' })]));
    const view = await settled();

    await act(async () => { view.result.current.setSelectedCategory('favourites'); await Promise.resolve(); });
    expect(view.result.current.favouriteProductIds.has('fav1')).toBe(true);
    expect(view.result.current.favouriteProductIds.has('fav2')).toBe(true);
  });
});

// ── Favourites ────────────────────────────────────────────────────────────────

describe('toggleFavourite', () => {
  it('optimistically adds, then confirms via the API', async () => {
    addProductFavourite.mockResolvedValue({});
    const view = await settled();

    await act(async () => { await view.result.current.toggleFavourite('p1'); });
    expect(view.result.current.favouriteProductIds.has('p1')).toBe(true);
    expect(addProductFavourite).toHaveBeenCalledWith('p1');
  });

  it('reverts the optimistic update when the API call fails', async () => {
    addProductFavourite.mockRejectedValue(new Error('fail'));
    const view = await settled();

    await act(async () => { await view.result.current.toggleFavourite('p1'); });
    expect(view.result.current.favouriteProductIds.has('p1')).toBe(false);
  });

  it('removing a favourite while ON the favourites tab also drops it from the grid', async () => {
    getFavouriteProducts.mockResolvedValue(page([dto({ id: 'fav1' })]));
    removeProductFavourite.mockResolvedValue({});
    const view = await settled();
    await act(async () => { view.result.current.setSelectedCategory('favourites'); await Promise.resolve(); });
    expect(view.result.current.favouriteProductIds.has('fav1')).toBe(true);

    await act(async () => { await view.result.current.toggleFavourite('fav1'); });
    expect(view.result.current.favouriteProductIds.has('fav1')).toBe(false);
    expect(view.result.current.posProducts).toEqual([]);
  });

  it('ignores a toggle already in flight for the same product', async () => {
    let resolveFirst;
    addProductFavourite.mockReturnValue(new Promise((res) => { resolveFirst = res; }));
    const view = await settled();

    let firstCall; let secondCall;
    act(() => { firstCall = view.result.current.toggleFavourite('p1'); });
    act(() => { secondCall = view.result.current.toggleFavourite('p1'); });
    expect(addProductFavourite).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst({}); await firstCall; await secondCall; });
  });
});

// ── Cart Focus suggestions (barcodeInput type-ahead) ────────────────────────

describe('barcodeSuggestions — Cart Focus type-ahead', () => {
  it('is empty and idle for an empty box', async () => {
    const view = await settled({ barcodeInput: '' });
    expect(view.result.current.barcodeSuggestions).toEqual([]);
    expect(view.result.current.barcodeSuggestionsLoading).toBe(false);
  });

  it('suppresses suggestions while the box is repurposed as a numpad', async () => {
    const view = await settled({ barcodeInput: 'abc', posActionMode: 'qty' });
    await tick(300);
    expect(view.result.current.barcodeSuggestions).toEqual([]);
    expect(getProductsList).not.toHaveBeenCalledWith(0, 8, 'abc', expect.anything(), null, null, null, true, 7);
  });

  it('debounces 250ms, queries top-8 matches and caches them', async () => {
    getProductsList.mockImplementation(async (_p, size) => (size === 8 ? page([dto({ id: 'sug1' })]) : page([])));

    const view = await settled({ barcodeInput: 'wi' });
    await tick(250);
    expect(view.result.current.barcodeSuggestions).toEqual([expect.objectContaining({ id: 'sug1' })]);
    expect(view.result.current.productCacheRef.current.get('sug1')).toBeTruthy();
  });
});

// ── Search Products modal ───────────────────────────────────────────────────

describe('Search Products modal', () => {
  it('does nothing while the modal is closed', async () => {
    const view = await settled();
    act(() => view.result.current.setProductSearchQuery('widget'));
    await tick(300);
    expect(view.result.current.productSearchResults).toEqual([]);
  });

  it('debounces 300ms once open and caches the top-30 matches', async () => {
    getProductsList.mockImplementation(async (_p, size) => (size === 30 ? page([dto({ id: 'ps1' })]) : page([])));
    const view = await settled();
    act(() => view.result.current.setShowProductSearch(true));
    act(() => view.result.current.setProductSearchQuery('widget'));
    await tick(300);
    expect(view.result.current.productSearchResults).toEqual([expect.objectContaining({ id: 'ps1' })]);
    expect(view.result.current.productCacheRef.current.get('ps1')).toBeTruthy();
  });

  it('clearing the query clears the results without a network call', async () => {
    const view = await settled();
    act(() => view.result.current.setShowProductSearch(true));
    act(() => view.result.current.setProductSearchQuery('x'));
    await tick(300);
    getProductsList.mockClear();

    act(() => view.result.current.setProductSearchQuery(''));
    await tick(0);
    expect(view.result.current.productSearchResults).toEqual([]);
    expect(getProductsList).not.toHaveBeenCalled();
  });
});

// ── Cross-hook: one authoritative cache ─────────────────────────────────────

describe('cross-hook cache authority', () => {
  it('a product cached by the grid load is immediately visible to a cache.get the way useProductEntry reads it', async () => {
    getProductsList.mockResolvedValue(page([dto({ id: 'p1', code: 'SKU-1', name: 'Widget', barcode: 'BC-1' })]));
    const view = await settled();

    const cache = view.result.current.productCacheRef.current;
    expect(cache.get('bc-1')).toMatchObject({ id: 'p1', name: 'Widget' });
    expect(cache.get('sku-1')).toBe(cache.get('bc-1'));
    expect(cache.get('p1')).toBe(cache.get('bc-1'));
    expect(cache.get('widget')).toBe(cache.get('bc-1'));
  });
});
