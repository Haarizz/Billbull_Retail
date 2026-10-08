import React from "react";

import { cn } from "../ui/utils";
import { StatusChip } from "./details/DetailPanelShell";

/**
 * An employee in the global search result list.
 *
 * <p>A drop-in for the generic row exactly as the customer and vendor rows are: same
 * button, same role/aria-selected, same click-to-select, and the same light-blue selected
 * treatment, so the list reads as one surface.
 *
 * <p>Renders from the search projection only (`EmployeeSearchResponse`): code,
 * designation, branch, department and employment status. The chip is the employment
 * status ("Active", "Inactive", …) and is never dressed up as attendance — BillBull has no
 * attendance source, so there is no "Present" to show. A row from an older mapping without
 * the structured fields falls back to its subtitle.
 */

const EmployeeResultRow = ({ item, active, onSelect }) => {
  const e = item.employee ?? {};
  const idLine = [e.employeeCode, e.role].filter(Boolean).join(" · ") || item.subtitle;
  const placeLine = [e.branch, e.department].filter(Boolean).join(" · ");
  const status = e.status ?? item.meta?.badge;

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
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-rose-50 text-[10px] font-semibold text-rose-700"
        aria-label="Employee"
      >
        E
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
        {placeLine && (
          <span className="block truncate text-[10px] leading-snug text-slate-400">
            {placeLine}
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

export default EmployeeResultRow;
