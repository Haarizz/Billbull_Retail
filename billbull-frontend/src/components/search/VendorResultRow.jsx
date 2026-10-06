import React from "react";

import { cn } from "../ui/utils";
import { StatusChip } from "./details/DetailPanelShell";

/**
 * A vendor in the global search result list.
 *
 * <p>Vendor-only, and a drop-in for the generic row exactly as the product and customer
 * rows are: same button, same role/aria-selected, same click-to-select, so keyboard
 * navigation and selection behave as before. It shares their selected treatment so the
 * list reads as one.
 *
 * <p>The search payload is VendorSearchResponse — identity, contact, status and the
 * vendor's assigned branch. It carries no balance and no branch count (those need the
 * summary read the detail panel makes), so the row shows neither and does not guess. Nor
 * does it claim "Overdue": that is known only once the summary has been read. A row from
 * an older mapping without the structured fields falls back to its subtitle and badge.
 */

const VendorResultRow = ({ item, active, onSelect }) => {
  const meta = item.meta ?? {};
  const contactLine = [meta.code, meta.phone ?? meta.email].filter(Boolean).join(" · ");
  const idLine = contactLine || item.subtitle;
  const branchLine = contactLine ? meta.branch : "";
  const status = meta.status ?? meta.badge;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      // Select only: never navigates.
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 border-b border-l-2 border-b-slate-100 px-3 py-2.5 text-left transition-colors last:border-b-0",
        active
          ? "border-l-blue-500 bg-blue-50/80"
          : "border-l-transparent bg-white hover:bg-slate-50"
      )}
    >
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-50 text-[10px] font-semibold text-orange-700"
        aria-label="Vendor"
      >
        V
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            active ? "text-blue-800" : "text-slate-900"
          )}
          title={item.title}
        >
          {item.title}
        </span>
        {idLine && (
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-slate-500">
            {idLine}
          </span>
        )}
        {branchLine && (
          <span className="block truncate text-[11px] leading-snug text-slate-400">
            {branchLine}
          </span>
        )}
        {status && (
          <span className="mt-1.5 block">
            <StatusChip>{status}</StatusChip>
          </span>
        )}
      </span>
    </button>
  );
};

export default VendorResultRow;
