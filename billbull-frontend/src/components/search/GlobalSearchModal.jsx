import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon, AlertCircleIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../ui/utils";

import {
  GLOBAL_SEARCH_CATEGORIES,
  MODAL_SEARCH_RESULT_LIMIT,
  PREVIEW_PER_CATEGORY,
  SEARCH_CATEGORY,
  SEARCH_DEBOUNCE_MS,
  globalSearch,
  globalSearchPreview,
  isCategorySupported,
} from "../../api/globalSearchApi";
import { navigateToSearchResult } from "../../utils/entityNavigation";
import { usePermissions } from "../../context/PermissionContext";
import CompanyContext from "../../context/CompanyContext";
import useGlobalSearchShortcut from "../../hooks/useGlobalSearchShortcut";
import useEntityDetail from "../../hooks/useEntityDetail";
import { resolveCurrencyDisplayCode } from "../../utils/countryCurrencyOptions";
import ProductDetailPanel from "./details/ProductDetailPanel";
import LedgerDetailPanel from "./details/LedgerDetailPanel";
import CustomerDetailPanel from "./details/CustomerDetailPanel";
import VendorDetailPanel from "./details/VendorDetailPanel";
import EmployeeDetailPanel from "./details/EmployeeDetailPanel";
import ProductResultRow from "./ProductResultRow";
import CustomerResultRow from "./CustomerResultRow";
import VendorResultRow from "./VendorResultRow";
import LedgerResultRow from "./LedgerResultRow";
import EmployeeResultRow from "./EmployeeResultRow";
import {
  DetailError,
  DetailForbidden,
  DetailSkeleton,
  StatusChip,
} from "./details/DetailPanelShell";

const PLACEHOLDER =
  "Search by name, code, SKU, barcode, mobile, account number, branch...";

// The square type tile at the head of every result row. Neutral by design: in the
// result list the colour belongs to the status chip, so the tile stays a quiet
// identifier rather than competing with it.
const TYPE_BADGE = {
  product: { short: "P", label: "Product" },
  customer: { short: "C", label: "Customer" },
  invoice: { short: "INV", label: "Invoice" },
  lpo: { short: "LPO", label: "LPO" },
  grn: { short: "GRN", label: "GRN" },
  quotation: { short: "QTN", label: "Quotation" },
  vendor: { short: "V", label: "Vendor" },
  ledger: { short: "L", label: "Ledger account" },
  employee: { short: "E", label: "Employee" },
};

/**
 * Which tab a result type counts towards. Documents (invoice/LPO/GRN/quotation) have no
 * tab of their own — they only ever appear under "All" — so they are absent here and
 * contribute to nothing but the "All" total.
 */
const TYPE_CATEGORY = {
  product: SEARCH_CATEGORY.PRODUCTS,
  customer: SEARCH_CATEGORY.CUSTOMERS,
  vendor: SEARCH_CATEGORY.VENDORS,
  ledger: SEARCH_CATEGORY.LEDGER,
  employee: SEARCH_CATEGORY.EMPLOYEES,
};

/** The key a count tally belongs to, so a stale tally is never shown against a new query. */
const COUNTS_PREVIEW_KEY = Symbol.for("billbull.global-search.preview");
const countsKeyFor = (term) => (term.trim() === "" ? COUNTS_PREVIEW_KEY : term.trim());

/**
 * The detail panel for each type that has one. Types absent from this map keep the
 * truthful "details are coming next" placeholder rather than implying a view that does
 * not exist.
 *
 * <p>Employee shows identity and monthly target achievement; payroll only on an explicit
 * reveal by an `hr.payroll` user. See EmployeeDetailPanel for the reasoning.
 */
const DETAIL_PANELS = {
  product: ProductDetailPanel,
  ledger: LedgerDetailPanel,
  customer: CustomerDetailPanel,
  vendor: VendorDetailPanel,
  employee: EmployeeDetailPanel,
};

/**
 * Types with their own result row. Each is a drop-in for the generic row below (same
 * role, aria-selected and click-to-select); every other type keeps the generic row.
 */
const RICH_ROWS = {
  product: ProductResultRow,
  customer: CustomerResultRow,
  vendor: VendorResultRow,
  ledger: LedgerResultRow,
  employee: EmployeeResultRow,
};

const KeyHint = ({ keys, children }) => (
  <span className="flex items-center gap-1.5">
    {keys.map((k) => (
      <kbd
        key={k}
        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
      >
        {k}
      </kbd>
    ))}
    <span className="text-[11px] text-slate-500">{children}</span>
  </span>
);

/**
 * BillBull global search + details checker.
 *
 * Mounted exactly once, at application level (App.jsx), inside the authenticated
 * tree. All of its state is local, so opening and closing it never touches the
 * route or the page rendered underneath.
 *
 * The right-hand pane renders a per-entity detail panel for every type in
 * DETAIL_PANELS; a type without one keeps an honest placeholder rather than
 * implying a view that does not exist.
 *
 * <p>It is a details <em>checker</em> first: selecting a row — by click, by arrow key or
 * by Enter — shows that entity inside the modal and leaves the route alone. Nothing about
 * choosing a result navigates. The one way out of the modal and into a page is an
 * explicit action inside a detail panel (today only the employee panel has one), and it
 * says so on its own label.
 *
 * Open state is self-managed (and driven by Ctrl/Cmd+X) when no `open` prop is
 * given, so App.jsx can mount it with no wiring; passing `open`/`onOpenChange`
 * controls it externally, which is what the tests do.
 */
const GlobalSearchModal = ({ open: controlledOpen, onOpenChange: controlledOnOpenChange }) => {
  const navigate = useNavigate();
  const { canView } = usePermissions();
  // Read through the context directly rather than useCompany(): the currency label is
  // cosmetic, and the modal must render wherever it is mounted rather than throwing if
  // it ends up outside CompanyProvider.
  const company = useContext(CompanyContext)?.company;
  const currency = resolveCurrencyDisplayCode(company || {});

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const onOpenChange = useCallback(
    (next) => {
      if (isControlled) controlledOnOpenChange?.(next);
      else setUncontrolledOpen(next);
    },
    [isControlled, controlledOnOpenChange]
  );

  useGlobalSearchShortcut(() => onOpenChange(true));

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(SEARCH_CATEGORY.ALL);
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  /**
   * Per-tab result counts, tallied from an "All" run and tagged with the term that
   * produced them. Only an "All" run sees every category at once, so a tab's count can
   * only come from there; `key` is what stops a tally from an earlier term being shown
   * against the current one. Switching tabs does not change the term, which is why the
   * counts survive it.
   */
  const [counts, setCounts] = useState({ key: null, byCategory: {} });

  const inputRef = useRef(null);
  const searchRequestRef = useRef(null);

  const categorySupported = isCategorySupported(category);
  const selected = results[selectedIndex] ?? null;

  // Details follow the selection, not Enter: arrow keys and clicks go through the same
  // path. The hook owns the debounce, the abort, the staleness guard and the cache, so
  // a held ArrowDown walks the list without a request per row, and a response belonging
  // to a row the user has already moved off is discarded rather than rendered under the
  // new one. `enabled` drops everything the moment the modal closes.
  const detail = useEntityDetail(selected, { enabled: open });
  const DetailPanel = selected ? DETAIL_PANELS[selected.type] : null;

  // Only offer categories the user may actually view. This is UX only — it keeps
  // a restricted user from firing requests that would 403 and toast; the backend
  // remains the authorization boundary.
  const categories = useMemo(
    () =>
      GLOBAL_SEARCH_CATEGORIES.filter(
        (c) => !c.permission || canView(c.permission)
      ),
    [canView]
  );

  const resetState = useCallback(() => {
    searchRequestRef.current?.abort();
    searchRequestRef.current = null;
    setQuery("");
    setCategory(SEARCH_CATEGORY.ALL);
    setResults([]);
    setSelectedIndex(0);
    setLoading(false);
    setError(null);
    setCounts({ key: null, byCategory: {} });
  }, []);

  /** Tallies a completed "All" result set into per-tab counts. A narrower run sees only
   *  its own category, so it is never allowed to overwrite the tally. */
  const tallyCounts = useCallback((activeCategory, term, rows) => {
    if (activeCategory !== SEARCH_CATEGORY.ALL) return;
    const byCategory = { [SEARCH_CATEGORY.ALL]: rows.length };
    rows.forEach((r) => {
      const c = TYPE_CATEGORY[r.type];
      if (c) byCategory[c] = (byCategory[c] ?? 0) + 1;
    });
    setCounts({ key: countsKeyFor(term), byCategory });
  }, []);

  // --- Search ---------------------------------------------------------------

  const runSearch = useCallback(
    async (term, activeCategory) => {
      // Drop the in-flight request: without this a slow earlier keystroke can
      // land after — and overwrite — a newer result set.
      searchRequestRef.current?.abort();

      if (!term.trim() || !isCategorySupported(activeCategory)) {
        searchRequestRef.current = null;
        setResults([]);
        setSelectedIndex(0);
        setLoading(false);
        setError(null);
        return;
      }

      const controller = new AbortController();
      searchRequestRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const res = await globalSearch(term, {
          signal: controller.signal,
          category: activeCategory,
          canView,
          // Raised from the shared default so the "All" tab can show every
          // category at once rather than the first few filling the list.
          maxResults: MODAL_SEARCH_RESULT_LIMIT,
          // Paint each source as it lands rather than holding the list hostage
          // to the slowest endpoint.
          onPartial: (partial) => {
            if (controller.signal.aborted || partial.length === 0) return;
            setResults(partial);
          },
        });
        if (controller.signal.aborted) return;
        const rows = res.success ? res.data || [] : [];
        setResults(rows);
        setSelectedIndex(0);
        tallyCounts(activeCategory, term, rows);
      } catch {
        if (controller.signal.aborted) return;
        // A search failure must never escape to the app-level ErrorBoundary.
        setResults([]);
        setError("Search is unavailable right now. Please try again.");
      } finally {
        if (searchRequestRef.current === controller) {
          searchRequestRef.current = null;
          setLoading(false);
        }
      }
    },
    [canView, tallyCounts]
  );

  /**
   * The empty-query preview: a couple of rows from each visible category, so the modal
   * opens on something to inspect rather than on a blank pane.
   *
   * <p>Not "search with an empty term" — each source has its own bounded `preview=true`
   * endpoint, and a blank `q` on the search endpoints still returns nothing. The whole
   * preview is at most PREVIEW_PER_CATEGORY per category, and only the row that ends up
   * selected fetches details.
   */
  const runPreview = useCallback(
    async (activeCategory) => {
      searchRequestRef.current?.abort();

      if (!isCategorySupported(activeCategory)) {
        searchRequestRef.current = null;
        setResults([]);
        setSelectedIndex(0);
        setLoading(false);
        setError(null);
        return;
      }

      const controller = new AbortController();
      searchRequestRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const res = await globalSearchPreview({
          signal: controller.signal,
          category: activeCategory,
          canView,
          perCategory: PREVIEW_PER_CATEGORY,
          onPartial: (partial) => {
            if (controller.signal.aborted || partial.length === 0) return;
            setResults(partial);
          },
        });
        if (controller.signal.aborted) return;
        const rows = res.success ? res.data || [] : [];
        setResults(rows);
        setSelectedIndex(0);
        tallyCounts(activeCategory, "", rows);
      } catch {
        if (controller.signal.aborted) return;
        // A preview is a convenience: it fails quietly back to the typing prompt rather
        // than putting an error where the user has not asked for anything yet.
        setResults([]);
      } finally {
        if (searchRequestRef.current === controller) {
          searchRequestRef.current = null;
          setLoading(false);
        }
      }
    },
    [canView, tallyCounts]
  );

  useEffect(() => {
    if (!open) return undefined;
    const term = query.trim();
    // Nothing is being typed, so there is no keystroke to debounce away — and the
    // preview is cached, so clearing the box back to empty restores it without a
    // request. Deliberately not routed through the search pipeline: an empty `q` must
    // never come to mean "return everything".
    if (term === "") {
      runPreview(category);
      return undefined;
    }
    const t = setTimeout(() => runSearch(term, category), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, query, category, runSearch, runPreview]);

  // Drop anything in flight when the modal closes or unmounts.
  useEffect(() => {
    if (open) {
      // Focus lands after Radix finishes its open animation/focus trap.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    resetState();
    return undefined;
  }, [open, resetState]);

  useEffect(() => () => searchRequestRef.current?.abort(), []);

  // --- Interaction ----------------------------------------------------------

  /**
   * Selects a row. That is all it does: the details pane follows the selection, the
   * route does not move and the modal stays open. Click, ArrowUp/ArrowDown and Enter all
   * land here, which is what the footer's "Enter — select" has always claimed.
   */
  const selectResult = useCallback(
    (index) => {
      if (index < 0) return;
      setSelectedIndex(index);
    },
    []
  );

  /**
   * Leaves the modal for an entity's own page. Deliberately NOT bound to Enter or to a
   * row click — a details checker that navigates on selection drops the user into a
   * list page, and for some types into an edit form, on a keystroke that reads as
   * "look at this one". The only caller is an explicit, labelled action inside a detail
   * panel (today: "Open employee record").
   */
  const openResult = useCallback(
    (result) => {
      if (!result) return;
      const navigated = navigateToSearchResult(navigate, result);
      if (!navigated) {
        setError("This result type cannot be opened yet.");
        return;
      }
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  /**
   * Switching category drops the current rows immediately rather than leaving
   * them on screen until the new request lands. Unlike a query edit — where
   * keeping the previous rows visible while typing is the point — the old rows
   * belong to a different entity type, so showing them under the new tab is
   * simply wrong.
   */
  const changeCategory = useCallback(
    (next) => {
      // Abort the previous category's request as well as clearing its rows. Without
      // this, a request issued under the old tab stays live through the 200ms debounce
      // and its onPartial — which only checks its own signal — paints that tab's rows
      // under the new one. Clearing `results` alone does not prevent it.
      searchRequestRef.current?.abort();
      searchRequestRef.current = null;
      setCategory(next);
      setResults([]);
      setSelectedIndex(0);
      setError(null);
      // The next request — a search, or the new tab's preview — is already queued, so go
      // straight to the skeleton rather than flashing an empty state over the cleared list.
      setLoading(isCategorySupported(next));
    },
    [query]
  );

  const cycleCategory = useCallback(
    (direction) => {
      const index = categories.findIndex((c) => c.id === category);
      const next =
        (index + direction + categories.length) % categories.length;
      changeCategory(categories[next]?.id ?? SEARCH_CATEGORY.ALL);
    },
    [categories, category, changeCategory]
  );

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length
      );
    } else if (event.key === "Enter") {
      // Select, never open. See selectResult/openResult above.
      event.preventDefault();
      selectResult(selectedIndex);
    } else if (event.key === "Tab") {
      // The design assigns Tab to category switching rather than focus traversal.
      event.preventDefault();
      cycleCategory(event.shiftKey ? -1 : 1);
    }
    // Escape is handled by Radix Dialog, which calls onOpenChange(false).
  };

  // --- Render ---------------------------------------------------------------

  // Before anything is typed the list holds the preview, so "no results" only ever
  // describes a query. An empty preview falls back to the typing prompt instead.
  const isPreview = query.trim() === "";
  const showEmptyState =
    !loading && !error && categorySupported && !isPreview && results.length === 0;
  const showTypingPrompt =
    !loading && !error && categorySupported && isPreview && results.length === 0;

  /**
   * The count beside a tab, or undefined when it is not known for the current term.
   *
   * <p>The active tab always knows its own count — it is the list on screen. Every other
   * tab's count can only come from an "All" run, so it shows while the tally still
   * belongs to this term and disappears rather than going stale when it does not. No
   * extra request is issued to fill one in.
   */
  const countsCurrent = counts.key === countsKeyFor(query);
  const tabCount = (id) => {
    if (loading && results.length === 0) return undefined;
    if (id === category) return results.length;
    return countsCurrent ? counts.byCategory[id] : undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Header, tabs and footer stay put; only the two body columns scroll. max-h keeps
        // the whole thing inside the viewport on a short screen; the width cap is what a
        // 1080p screen shows, and below it the modal keeps a 1rem gutter each side.
        className="top-[6vh] flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-[1120px] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[1120px]"
        // Esc is the documented way out and the footer says so; a corner X on top of the
        // search field is the one piece of chrome the design does without.
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        aria-label="Global search"
      >
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">
          Search products, customers and documents across BillBull.
        </DialogDescription>

        {/* Search input */}
        <div className="flex shrink-0 items-center gap-3 px-5 py-4">
          <SearchIcon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER}
            aria-label="Search BillBull"
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">
            Esc
          </kbd>
        </div>

        <Separator />

        {/* Category bar. The underline sits on the strip's own bottom border rather
            than on a pill, which is what keeps the row reading as one surface. */}
        <div
          role="tablist"
          aria-label="Search categories"
          className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-4"
        >
          {categories.map((c) => {
            const active = category === c.id;
            const count = tabCount(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  changeCategory(c.id);
                }}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-[#F5C742] text-[#786009]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {c.label}
                {count != null && (
                  // aria-hidden keeps each tab's accessible name the plain category
                  // label; the count is a visual cue, not part of what the tab is.
                  <span
                    aria-hidden="true"
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                      active ? "bg-[#FFF4BF] text-[#8A6D09]" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        {/* The only part that scrolls. It keeps its designed height and shrinks (rather
            than pushing the footer off) when the viewport cannot fit it. */}
        <div className="grid h-[640px] min-h-0 grid-cols-1 overflow-hidden sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* Left — results */}
          <div className="min-w-0 overflow-hidden border-slate-100 sm:border-r">
            <ScrollArea className="h-full" fitWidth>
              <div className="p-2">
                {!categorySupported && (
                  <p className="px-3 py-8 text-center text-[13px] text-slate-500">
                    Search for this category is not available yet.
                  </p>
                )}

                {categorySupported && error && (
                  <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                    <AlertCircleIcon className="size-5 text-red-400" aria-hidden="true" />
                    <p role="alert" className="text-[13px] text-red-600">
                      {error}
                    </p>
                  </div>
                )}

                {categorySupported && !error && loading && results.length === 0 && (
                  <div className="space-y-2 p-2" data-testid="global-search-loading">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-md" />
                    ))}
                  </div>
                )}

                {showTypingPrompt && (
                  <p className="px-3 py-8 text-center text-[13px] text-slate-500">
                    Start typing to search.
                  </p>
                )}

                {showEmptyState && (
                  <p className="px-3 py-8 text-center text-[13px] text-slate-500">
                    No results found.
                  </p>
                )}

                {results.map((item, index) => {
                  const RichRow = RICH_ROWS[item.type];
                  if (RichRow) {
                    return (
                      <RichRow
                        key={`${item.type}-${item.id}`}
                        item={item}
                        active={index === selectedIndex}
                        onSelect={() => selectResult(index)}
                      />
                    );
                  }
                  const badge = TYPE_BADGE[item.type] ?? { short: "?", label: item.type };
                  const active = index === selectedIndex;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      // Select only. A row is not a link: opening the entity's page is
                      // an explicit action inside the detail panel, never a side effect
                      // of looking at a result.
                      onClick={() => selectResult(index)}
                      className={cn(
                        // The marker is a left border rather than a pseudo-element so it
                        // occupies real width on every row — an active row must not be a
                        // pixel wider than the ones around it.
                        "flex w-full items-start gap-2.5 rounded-md border-l-[3px] px-2.5 py-2.5 text-left transition-colors",
                        active
                          ? "border-[#F5C742] bg-[#FFF8E7]"
                          : "border-transparent hover:bg-slate-50"
                      )}
                    >
                      <span
                        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-semibold text-slate-500"
                        aria-label={badge.label}
                      >
                        {badge.short}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900">
                            {item.title}
                          </span>
                          {item.meta?.rightTag && (
                            <span className="shrink-0 text-[11px] font-medium text-slate-600">
                              {item.meta.rightTag}
                            </span>
                          )}
                        </span>
                        {item.subtitle && (
                          <span className="mt-0.5 block truncate text-[11px] leading-snug text-slate-500">
                            {item.subtitle}
                          </span>
                        )}
                        {item.meta?.badge && (
                          <span className="mt-1.5 block">
                            <StatusChip>{item.meta.badge}</StatusChip>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right — details. min-w-0 + overflow-hidden are what keep a long name, a wide
              summary card or a table inside the pane instead of spilling past the modal. */}
          <div className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden sm:flex">
            {!selected && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-50">
                    <SearchIcon className="size-5 text-slate-300" aria-hidden="true" />
                  </div>
                  <p className="text-[13px] font-medium text-slate-600">Select a result</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Full details will appear here
                  </p>
                </div>
              </div>
            )}

            {selected && !DetailPanel && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="text-center">
                  <p className="text-[13px] font-medium text-slate-600">{selected.title}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Details are coming next.</p>
                </div>
              </div>
            )}

            {/* Keyed by the selected row so a panel never renders the previous entity's
                data for a frame while the new request is in flight. */}
            {selected && DetailPanel && (
              <div key={`${selected.type}-${selected.id}`} className="h-full min-h-0 min-w-0 overflow-hidden">
                {detail.status === "loading" && <DetailSkeleton />}
                {detail.status === "error" && detail.forbidden && <DetailForbidden />}
                {detail.status === "error" && !detail.forbidden && (
                  <DetailError message={detail.error} />
                )}
                {detail.status === "success" && (
                  <DetailPanel
                    detail={detail.data}
                    currency={currency}
                    // Only the employee panel takes an action; the others ignore it, and
                    // none is added here just to have one. This is the single deliberate
                    // way out of the modal — selection itself never navigates — and it
                    // stays secondary to the details it sits under.
                    onOpen={selected.type === "employee" ? () => openResult(selected) : undefined}
                    // Only the employee panel reads it, to decide whether payroll may be
                    // offered at all. UX only; the payroll endpoint enforces it again.
                    canView={selected.type === "employee" ? canView : undefined}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Keyboard hints */}
        <div className="flex shrink-0 flex-wrap items-center gap-4 px-4 py-2.5">
          <KeyHint keys={["↑↓"]}>navigate</KeyHint>
          <KeyHint keys={["Enter"]}>select</KeyHint>
          <KeyHint keys={["Tab"]}>switch category</KeyHint>
          <KeyHint keys={["Ctrl+X", "⌘+X"]}>open anywhere</KeyHint>
          <KeyHint keys={["Esc"]}>close</KeyHint>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GlobalSearchModal;
