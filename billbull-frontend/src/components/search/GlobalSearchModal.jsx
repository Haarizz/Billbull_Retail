import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon, AlertCircleIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
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
import {
  DetailError,
  DetailForbidden,
  DetailSkeleton,
} from "./details/DetailPanelShell";

const PLACEHOLDER =
  "Search by name, code, SKU, barcode, mobile, account number, branch...";

// Matches the type badges the dashboard dropdown already uses, so a product
// looks the same wherever it is searched from.
const TYPE_BADGE = {
  product: { short: "P", label: "Product", className: "bg-[#FFF4BF] text-[#786009]" },
  customer: { short: "C", label: "Customer", className: "bg-blue-50 text-blue-700" },
  invoice: { short: "INV", label: "Invoice", className: "bg-emerald-50 text-emerald-700" },
  lpo: { short: "LPO", label: "LPO", className: "bg-purple-50 text-purple-700" },
  grn: { short: "GRN", label: "GRN", className: "bg-orange-50 text-orange-700" },
  quotation: { short: "QTN", label: "Quotation", className: "bg-teal-50 text-teal-700" },
  vendor: { short: "V", label: "Vendor", className: "bg-indigo-50 text-indigo-700" },
  ledger: { short: "L", label: "Ledger account", className: "bg-violet-50 text-violet-700" },
  employee: { short: "E", label: "Employee", className: "bg-rose-50 text-rose-700" },
};

/**
 * The detail panel for each type that has one. Types absent from this map keep the
 * truthful "details are coming next" placeholder rather than implying a view that does
 * not exist.
 *
 * <p>Employee is present but identity-only, by decision rather than by stage: no salary,
 * payroll, attendance, leave or performance data appears in global search. See
 * EmployeeDetailPanel for the reasoning.
 */
const DETAIL_PANELS = {
  product: ProductDetailPanel,
  ledger: LedgerDetailPanel,
  customer: CustomerDetailPanel,
  vendor: VendorDetailPanel,
  employee: EmployeeDetailPanel,
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
        setResults(res.success ? res.data || [] : []);
        setSelectedIndex(0);
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
    [canView]
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
        setResults(res.success ? res.data || [] : []);
        setSelectedIndex(0);
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
    [canView]
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Header, tabs and footer stay put; only the two body columns scroll. max-h keeps
        // the whole thing inside the viewport on a short screen.
        className="top-[10%] flex max-h-[80vh] w-full max-w-3xl translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onKeyDown={handleKeyDown}
        aria-label="Global search"
      >
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">
          Search products, customers and documents across BillBull.
        </DialogDescription>

        {/* Search input */}
        <div className="flex shrink-0 items-center gap-3 px-4 py-3">
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
          {/* mr-6 clears the dialog's own absolutely-positioned close button, which
              otherwise sits on top of this hint. */}
          <kbd className="mr-6 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            Esc
          </kbd>
        </div>

        <Separator />

        {/* Category bar */}
        <div role="tablist" aria-label="Search categories" className="flex shrink-0 items-center gap-1 px-3 py-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={() => {
                changeCategory(c.id);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                category === c.id
                  ? "bg-[#FFF8E7] text-[#786009]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <Separator />

        {/* Body */}
        {/* The only part that scrolls. It keeps its designed height and shrinks (rather
            than pushing the footer off) when the viewport cannot fit it. */}
        <div className="grid h-[420px] min-h-0 grid-cols-1 overflow-hidden sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
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
                  const badge = TYPE_BADGE[item.type] ?? {
                    short: "?",
                    label: item.type,
                    className: "bg-slate-100 text-slate-600",
                  };
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === selectedIndex}
                      // Select only. A row is not a link: opening the entity's page is
                      // an explicit action inside the detail panel, never a side effect
                      // of looking at a result.
                      onClick={() => selectResult(index)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                        index === selectedIndex ? "bg-[#FFF8E7]" : "hover:bg-slate-50"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
                          badge.className
                        )}
                        aria-label={badge.label}
                      >
                        {badge.short}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-slate-800">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="block truncate text-[11px] text-slate-500">
                            {item.subtitle}
                          </span>
                        )}
                        {item.meta?.badge && (
                          <Badge
                            variant="secondary"
                            className="mt-1 bg-slate-100 text-[10px] font-normal text-slate-600"
                          >
                            {item.meta.badge}
                          </Badge>
                        )}
                      </span>
                      {item.meta?.rightTag && (
                        <span className="shrink-0 text-[11px] font-medium text-slate-600">
                          {item.meta.rightTag}
                        </span>
                      )}
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
