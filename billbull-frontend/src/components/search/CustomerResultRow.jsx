import React from "react";

import { cn } from "../ui/utils";
import { StatusChip } from "./details/DetailPanelShell";
import { customerStanding } from "./details/customerStanding";

/**
 * A customer in the global search result list.
 *
 * <p>Customer-only, and a drop-in for the generic row exactly as ProductResultRow is: same
 * button, same role/aria-selected, same click-to-select, so keyboard navigation and
 * selection behave as before. It shares the product row's selected treatment so the two
 * read as one list.
 *
 * <p>The search payload is the customer record itself, so the row shows identity and
 * account standing only. It carries no balance, no overdue figure and no branch count —
 * those need the summary read the detail panel makes — and the row does not guess them.
 * A row from an older mapping without the structured fields falls back to its subtitle and
 * badge strings.
 */

const CustomerResultRow = ({ item, active, onSelect }) => {
  const meta = item.meta ?? {};
  const contactLine = [meta.code, meta.mobile ?? meta.email].filter(Boolean).join(" · ");
  const idLine = contactLine || item.subtitle;
  const detailLine = contactLine
    ? [meta.branch, meta.groupType].filter(Boolean).join(" · ")
    : "";
  const standing = customerStanding(meta);

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
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-[10px] font-semibold text-emerald-700"
        aria-label="Customer"
      >
        C
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
        {detailLine && (
          <span className="block truncate text-[11px] leading-snug text-slate-400">
            {detailLine}
          </span>
        )}
        {(standing || meta.badge) && (
          <span className="mt-1.5 block">
            <StatusChip tone={standing?.tone}>{standing?.label ?? meta.badge}</StatusChip>
          </span>
        )}
      </span>
    </button>
  );
};

export default CustomerResultRow;
