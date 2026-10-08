import React from "react";

import { cn } from "../ui/utils";
import { StatusChip } from "./details/DetailPanelShell";
import { productStockStatus } from "./details/productStockStatus";

/**
 * A product in the global search result list.
 *
 * <p>Product-only on purpose: the other entity types keep the generic row in
 * GlobalSearchModal until they get their own redesign. It is a drop-in for that row —
 * same button, same role/aria-selected, same click-to-select — so keyboard navigation
 * and selection behave exactly as before.
 *
 * <p>Everything shown comes off the mapped search result. A row from an older mapping
 * without the structured fields falls back to its subtitle and badge strings.
 */
const ProductResultRow = ({ item, active, onSelect }) => {
  const meta = item.meta ?? {};
  const stock = meta.stock != null && Number.isFinite(Number(meta.stock)) ? Number(meta.stock) : null;
  const status = productStockStatus(stock, meta.reorderLevel);

  const identifiers = [item.code, meta.sku && meta.sku !== item.code ? meta.sku : null]
    .filter(Boolean)
    .join(" · ");
  const idLine = identifiers || item.subtitle;
  const detailLine = [
    identifiers && meta.category ? meta.category : null,
    stock != null ? `${stock.toLocaleString()} on hand` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      // Select only, exactly like the generic row: never navigates.
      onClick={onSelect}
      className={cn(
        // A real left border rather than a pseudo-element, so the selected row is not a
        // pixel wider than its neighbours.
        "flex w-full items-start gap-2.5 border-b border-l-2 border-b-slate-100 px-3 py-2.5 text-left transition-colors last:border-b-0",
        active
          ? "border-l-blue-500 bg-blue-50/80"
          : "border-l-transparent bg-white hover:bg-slate-50"
      )}
    >
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[10px] font-semibold text-blue-600"
        aria-label="Product"
      >
        P
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] font-medium",
              active ? "text-blue-800" : "text-slate-900"
            )}
          >
            {item.title}
          </span>
          {meta.rightTag && (
            <span className="shrink-0 text-[11px] text-slate-500">{meta.rightTag}</span>
          )}
        </span>
        {idLine && (
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-slate-500">
            {idLine}
          </span>
        )}
        {detailLine && (
          <span className="block truncate text-[11px] leading-snug text-slate-400">
            {detailLine}
          </span>
        )}
        {(status || (!detailLine && meta.badge)) && (
          <span className="mt-1.5 block">
            <StatusChip>{status ?? meta.badge}</StatusChip>
          </span>
        )}
      </span>
    </button>
  );
};

export default ProductResultRow;
