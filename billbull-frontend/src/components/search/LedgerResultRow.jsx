import React from "react";

import { cn } from "../ui/utils";
import { StatusChip } from "./details/DetailPanelShell";

/**
 * A ledger account in the global search result list.
 *
 * <p>Ledger-only, and a drop-in for the generic row exactly as the product, customer and
 * vendor rows are: same button, same role/aria-selected, same click-to-select, so keyboard
 * navigation and selection behave as before. It shares their selected treatment so the
 * list reads as one.
 *
 * <p>The search payload is AccountSearchResponse — code, name, type, group, status and
 * whether the account is a group header. It carries no balance and no branch count: those
 * live in the pre-aggregated GL balance rows the detail panel reads for the selected
 * account only, and reading them per result per keystroke is exactly the N+1 the search
 * is built to avoid. So the design's "Bal: … · N branches" line is not drawn rather than
 * guessed. A row from an older mapping without the structured fields falls back to its
 * subtitle and badge.
 */

/** "active" is the normal state of an account; only a departure from it earns a chip. */
const isNotable = (status) => status && String(status).toLowerCase() !== "active";

const titleCase = (text) =>
  String(text).toLowerCase().replace(/(^|\s)([a-z])/g, (_, sep, c) => `${sep}${c.toUpperCase()}`);

const LedgerResultRow = ({ item, active, onSelect }) => {
  const meta = item.meta ?? {};
  const structured = meta.accountCode != null || meta.accountType != null;
  const idLine = structured
    ? [meta.accountCode && `Acc ${meta.accountCode}`, meta.accountType].filter(Boolean).join(" · ")
    : item.subtitle;
  const chips = structured
    ? [
        meta.isGroup ? { key: "group", label: "Group account", tone: "neutral" } : null,
        isNotable(meta.status) ? { key: "status", label: titleCase(meta.status) } : null,
      ].filter(Boolean)
    : meta.badge
      ? [{ key: "badge", label: meta.badge, tone: "neutral" }]
      : [];

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
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-semibold text-indigo-600"
        aria-label="Ledger account"
      >
        L
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
        {chips.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <StatusChip key={chip.key} tone={chip.tone}>
                {chip.label}
              </StatusChip>
            ))}
          </span>
        )}
      </span>
    </button>
  );
};

export default LedgerResultRow;
