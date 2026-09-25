// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// THE CATALOG/SEARCH BOUNDARY. Everything from "which products does the grid show"
// to "here is the current page of mapped products" lives here:
//
//     category / favourites tab / grid search box
//              |  loadPosProducts        (paginated fetch, special-tab routing, resolve fallback)
//              |  loadMorePosProducts    (page++ append)
//              |  toggleFavourite        (optimistic favourite add/remove)
//              |  Search Products modal  (dedicated debounced multi-result lookup)
//              |  Cart Focus suggestions (debounced type-ahead while scanning/typing)
//              v  posProducts / productCacheRef (read by useProductEntry and the grid JSX)
//
// PRODUCT CACHE OWNERSHIP. productCacheRef used to be filled by four call sites split
// across POSSales: the two suggestion effects below, loadPosProducts's own success/
// fallback paths, and useProductEntry's own resolve-by-scan path. Of those, only the
// last is genuinely product-entry's (it caches whatever the backend resolves for a
// scan that wasn't already in the cache) — the other three are catalog fetches. The
// ref itself is created here and handed to useProductEntry unchanged: there is still
// exactly one Map, still exactly one identity, and useProductEntry still writes into
// it directly on its own resolve path. Nothing about the fast-path cache read or the
// scan-time write changed; only where the ref is allocated moved.
//
// WHAT STAYED IN POSSales, and why:
//
//   filteredProducts     Currently a trivial `= posProducts` alias with no catalog
//                         logic of its own (a hook that historically applied
//                         client-side filtering the grid no longer needs). Kept as a
//                         one-line passthrough in POSSales rather than round-tripped
//                         through this hook for no behavioural reason.
//   Price Check modal /  Both read/write their own local state (priceCheckQuery,
//   Serial-Batch lookup  serialBatchItemCode, ...) via getProductsList/resolvePosEntry
//                         calls declared inline in JSX closures. Neither reads
//                         posProducts, productCategories or productCacheRef — they are
//                         self-contained lookup tools, not part of the grid's
//                         load/search/paginate lifecycle, so moving them here would be
//                         relocating unrelated code, not extracting a boundary.
//   syncPosData           POS-wide orchestration (customers + products + X-report +
//                         held sales) that happens to clear productCacheRef.current as
//                         one step. It stays in POSSales, calling loadPosProducts and
//                         reaching into the returned productCacheRef exactly as before.
//
// Nothing was normalised while moving: the debounce intervals (300ms / 300ms / 250ms),
// the resolve-fallback-when-empty behaviour, the favourites-tab background ID capture,
// and the eslint-disabled exhaustive-deps arrays are preserved as they were.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Heart, Package, TrendingUp } from 'lucide-react';

import { getDepartments } from '../../../../../api/departmentsApi';
import {
  addProductFavourite, getFavouriteProducts, getProducts, getProductsList,
  getRecentlySoldProducts, getTopSoldProducts, removeProductFavourite,
} from '../../../../../api/productsApi';
import { resolvePosEntry } from '../../../../../api/posApi';
import { CATEGORY_ICONS, POS_PRODUCT_PAGE_SIZE } from '../../posConstants';
import { cachePosProduct, mapPosProductAggregateItem, mapPosProductListItem } from '../../posUtils';
import { SPECIAL_CATEGORIES } from './productConstants';

/**
 * @param {object}   args
 * @param {object}   args.currentTerminal  POS terminal — branchId for the product-list query
 * @param {object}   args.currentSession   POS session — branchId fallback
 * @param {string}   args.barcodeInput     Cart Focus scan/search box value (product-entry-owned)
 * @param {string}   args.posActionMode    'none' unless the Cart Focus box is repurposed as a numpad
 */
export function useProductCatalog({ currentTerminal, currentSession, barcodeInput, posActionMode }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [favouriteProductIds, setFavouriteProductIds] = useState(new Set());
  const [favouriteTogglePending, setFavouriteTogglePending] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [posProducts, setPosProducts] = useState([]);
  const [posProductPage, setPosProductPage] = useState(0);
  const [posProductTotalPages, setPosProductTotalPages] = useState(0);
  const [posProductTotalElements, setPosProductTotalElements] = useState(0);
  const [posProductsLoading, setPosProductsLoading] = useState(false);
  const [posProductsLoadingMore, setPosProductsLoadingMore] = useState(false);
  const [posProductsError, setPosProductsError] = useState('');
  const [posDepartments, setPosDepartments] = useState([]);
  const productCacheRef = useRef(new Map());

  // Live autocomplete for the Cart Focus scan/search box — shows a "select item"
  // dropdown of matching products as the cashier types, so a name/code/barcode
  // search works even when the Items Panel is hidden.
  const [barcodeSuggestions, setBarcodeSuggestions] = useState([]);
  const [barcodeSuggestionsLoading, setBarcodeSuggestionsLoading] = useState(false);

  // Search Products modal — dedicated multi-result lookup by item code, barcode, or
  // product name (substring match anywhere, backed by the same server-side LIKE
  // search as the items grid) so cashiers can find and add items even when the Items
  // Panel is hidden in Cart Focus.
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  const productCategories = useMemo(() => ([
    {
      id: 'all',
      name: 'All Items',
      icon: Package,
      departmentId: null,
      count: selectedCategory === 'all' ? posProductTotalElements : null
    },
    ...posDepartments.map((department, index) => ({
      id: String(department.id),
      name: department.name || department.departmentName || `Department ${index + 1}`,
      icon: CATEGORY_ICONS[index % CATEGORY_ICONS.length],
      departmentId: department.id,
      count: selectedCategory === String(department.id) ? posProductTotalElements : null
    }))
  ]), [posDepartments, posProductTotalElements, selectedCategory]);

  const horizontalCategories = useMemo(() => ([
    { id: 'all', name: 'All Items', icon: Package },
    { id: 'favourites', name: 'Favourites ❤️', icon: Heart },
    { id: 'recently-sold', name: 'Recently Sold', icon: Clock },
    { id: 'top-sold', name: 'Top Sold', icon: TrendingUp },
  ]), []);

  useEffect(() => {
    let cancelled = false;
    getDepartments()
      .then(data => {
        if (!cancelled) setPosDepartments(Array.isArray(data) ? data : []);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load POS departments', error);
        setPosDepartments([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search Products modal — live, debounced lookup as the cashier types. Reuses the
  // paginated product list endpoint, which already matches item code, SKU, barcode,
  // and product name anywhere in the string (not just a prefix).
  useEffect(() => {
    if (!showProductSearch) return undefined;
    const query = productSearchQuery.trim();
    if (!query) {
      setProductSearchResults([]);
      setProductSearchLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setProductSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
        const data = await getProductsList(0, 30, query, controller.signal, null, null, null, true, posBranchId);
        const mapped = Array.isArray(data?.content) ? data.content.map(mapPosProductListItem) : [];
        mapped.forEach(product => cachePosProduct(productCacheRef.current, product));
        setProductSearchResults(mapped);
      } catch (error) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        console.error('Product search failed', error);
        setProductSearchResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [productSearchQuery, showProductSearch]);

  // Cart Focus scan/search box — live "select item" suggestions as the cashier
  // types. Suppressed while the same field is repurposed as a qty/discount/price
  // numpad (posActionMode !== 'none'), where its value is a number, not a search.
  useEffect(() => {
    const query = barcodeInput.trim();
    if (posActionMode !== 'none' || !query) {
      setBarcodeSuggestions([]);
      setBarcodeSuggestionsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setBarcodeSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
        const data = await getProductsList(0, 8, query, controller.signal, null, null, null, true, posBranchId);
        const mapped = Array.isArray(data?.content) ? data.content.map(mapPosProductListItem) : [];
        mapped.forEach(product => cachePosProduct(productCacheRef.current, product));
        setBarcodeSuggestions(mapped);
      } catch (error) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        setBarcodeSuggestions([]);
      } finally {
        setBarcodeSuggestionsLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [barcodeInput, posActionMode]);

  const loadPosProducts = useCallback(async (page = 0, append = false, signal = undefined) => {
    const hasSearch = Boolean(debouncedSearchQuery);
    const isSpecial = !hasSearch && SPECIAL_CATEGORIES.has(selectedCategory);

    if (append) {
      setPosProductsLoadingMore(true);
    } else {
      setPosProductsLoading(true);
      setPosProductsError('');
      setPosProducts([]);
    }

    try {
      let data;

      if (isSpecial) {
        if (selectedCategory === 'favourites') {
          data = await getFavouriteProducts(page, POS_PRODUCT_PAGE_SIZE, signal);
        } else if (selectedCategory === 'recently-sold') {
          data = await getRecentlySoldProducts(page, POS_PRODUCT_PAGE_SIZE, signal);
        } else if (selectedCategory === 'top-sold') {
          data = await getTopSoldProducts(page, POS_PRODUCT_PAGE_SIZE, signal);
        }
      } else {
        const departmentId = (hasSearch || selectedCategory === 'all') ? null : Number(selectedCategory);
        const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
        data = await getProductsList(
          page,
          POS_PRODUCT_PAGE_SIZE,
          debouncedSearchQuery,
          signal,
          null,
          Number.isFinite(departmentId) ? departmentId : null,
          null,
          true,
          posBranchId
        );
      }

      const mapped = Array.isArray(data?.content)
        ? data.content.map(mapPosProductListItem)
        : [];

      mapped.forEach(product => cachePosProduct(productCacheRef.current, product));

      // When searching, fall back to resolve endpoint if no products found
      if (mapped.length === 0 && !append && debouncedSearchQuery && !isSpecial) {
        try {
          const resolved = await resolvePosEntry(debouncedSearchQuery);
          if (signal?.aborted) return;
          if (resolved?.type === 'PRODUCT' && resolved.product) {
            const resolvedProduct = mapPosProductAggregateItem(resolved.product, debouncedSearchQuery);
            if (resolved.pinnedBatchNumber) resolvedProduct._pinnedBatch = resolved.pinnedBatchNumber;
            cachePosProduct(productCacheRef.current, resolvedProduct);
            setPosProducts([resolvedProduct]);
            setPosProductPage(0);
            setPosProductTotalPages(1);
            setPosProductTotalElements(1);
            return;
          }
        } catch {
          // silent — keep empty grid
        }
      }

      // Load favourite IDs in background when switching to favourites tab
      if (selectedCategory === 'favourites' && mapped.length > 0) {
        setFavouriteProductIds(new Set(mapped.map(p => p.id)));
      }

      setPosProducts(prev => append ? [...prev, ...mapped] : mapped);
      setPosProductPage(data?.page ?? page);
      setPosProductTotalPages(data?.totalPages ?? 0);
      setPosProductTotalElements(data?.totalElements ?? mapped.length);
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      console.error('Failed to load POS products', error);
      if (!append) {
        try {
          const fallbackProducts = await getProducts();
          if (signal?.aborted) return;
          const fallbackMapped = Array.isArray(fallbackProducts)
            ? fallbackProducts.map(product => mapPosProductAggregateItem(product)).filter(p => p.availableInPos !== false)
            : [];

          fallbackMapped.forEach(product => cachePosProduct(productCacheRef.current, product));
          setPosProducts(fallbackMapped);
          setPosProductPage(0);
          setPosProductTotalPages(1);
          setPosProductTotalElements(fallbackMapped.length);
          setPosProductsError('');
          return;
        } catch (fallbackError) {
          if (fallbackError?.name === 'CanceledError' || fallbackError?.code === 'ERR_CANCELED') return;
          console.error('Fallback POS product load failed', fallbackError);
          setPosProducts([]);
        }
      }
      setPosProductsError('Products could not be loaded.');
    } finally {
      if (append) {
        setPosProductsLoadingMore(false);
      } else {
        setPosProductsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, selectedCategory]);

  useEffect(() => {
    const controller = new AbortController();
    loadPosProducts(0, false, controller.signal);
    return () => controller.abort();
  }, [loadPosProducts]);

  const loadMorePosProducts = () => {
    if (posProductsLoading || posProductsLoadingMore || posProductPage + 1 >= posProductTotalPages) return;
    loadPosProducts(posProductPage + 1, true);
  };

  const toggleFavourite = useCallback(async (productId) => {
    if (favouriteTogglePending.has(productId)) return;
    setFavouriteTogglePending(prev => new Set([...prev, productId]));
    const isFav = favouriteProductIds.has(productId);
    // Optimistic update
    setFavouriteProductIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(productId); else next.add(productId);
      return next;
    });
    try {
      if (isFav) {
        await removeProductFavourite(productId);
        // Remove from grid if currently on favourites tab
        if (selectedCategory === 'favourites') {
          setPosProducts(prev => prev.filter(p => p.id !== productId));
        }
      } else {
        await addProductFavourite(productId);
      }
    } catch {
      // Revert optimistic update on failure
      setFavouriteProductIds(prev => {
        const next = new Set(prev);
        if (isFav) next.add(productId); else next.delete(productId);
        return next;
      });
    } finally {
      setFavouriteTogglePending(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, [favouriteProductIds, favouriteTogglePending, selectedCategory]);

  return {
    // Grid state + paging.
    posProducts, posProductPage, posProductTotalPages, posProductTotalElements,
    posProductsLoading, posProductsLoadingMore, posProductsError,
    loadPosProducts, loadMorePosProducts,
    // Search.
    searchQuery, setSearchQuery, debouncedSearchQuery,
    // Categories / departments.
    posDepartments, productCategories, horizontalCategories, selectedCategory, setSelectedCategory,
    // Favourites.
    favouriteProductIds, toggleFavourite,
    // The single authoritative product cache — shared with useProductEntry.
    productCacheRef,
    // Cart Focus type-ahead suggestions.
    barcodeSuggestions, barcodeSuggestionsLoading, setBarcodeSuggestions,
    // Search Products modal.
    showProductSearch, setShowProductSearch,
    productSearchQuery, setProductSearchQuery,
    productSearchResults, setProductSearchResults, productSearchLoading,
  };
}

export default useProductCatalog;
