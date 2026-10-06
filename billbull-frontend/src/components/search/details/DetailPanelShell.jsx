import React from "react";
import { AlertCircleIcon, LockIcon } from "lucide-react";

import { Skeleton } from "../../ui/skeleton";

/**
 * The states every detail panel shares: loading, permission-denied, error.
 *
 * <p>Kept as one component so the panels cannot drift on the thing that matters most
 * here — a 403 reads as "you may not see this", never as "this is broken" or, worse,
 * as an empty panel of zeros.
 */

export const DetailSkeleton = () => (
  <div className="space-y-4 p-5" data-testid="entity-detail-loading">
    <Skeleton className="h-5 w-2/3 rounded" />
    <Skeleton className="h-3 w-1/3 rounded" />
    <div className="grid grid-cols-3 gap-2 pt-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
    <Skeleton className="h-28 w-full rounded-md" />
  </div>
);

export const DetailForbidden = () => (
  <div
    className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
    data-testid="entity-detail-forbidden"
  >
    <div className="flex size-10 items-center justify-center rounded-full bg-slate-50">
      <LockIcon className="size-4 text-slate-400" aria-hidden="true" />
    </div>
    <p className="text-[13px] font-medium text-slate-600">
      You don&apos;t have permission to view these details.
    </p>
  </div>
);

export const DetailError = ({ message = "Could not load details." }) => (
  <div
    className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
    data-testid="entity-detail-error"
  >
    <AlertCircleIcon className="size-5 text-red-400" aria-hidden="true" />
    <p role="alert" className="text-[13px] text-red-600">
      {message}
    </p>
  </div>
);

/**
 * The tone a status word carries. Shared by the result rows and the detail headers so a
 * product that reads "In stock" in the list reads the same green in the panel — the
 * design treats the status chip as one component, not two that happen to look alike.
 *
 * <p>Unknown words fall back to neutral slate rather than guessing: a wrongly-green
 * "Blocked" is worse than an uncoloured one.
 */
export const statusTone = (text) => {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return "neutral";
  if (/\b(in stock|active|ok|paid|received|approved|posted|completed|cleared|open)\b/.test(t))
    return "positive";
  if (/\b(low stock|overdue|pending|partial|on hold|hold|due|reserved)\b/.test(t)) return "warning";
  if (/\b(out of stock|cancelled|canceled|rejected|failed|expired)\b/.test(t)) return "negative";
  return "neutral";
};

const TONE_CLASS = {
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-[#FFF4BF] text-[#8A6D09]",
  negative: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
};

/**
 * A status pill. `tone` defaults to whatever {@link statusTone} makes of the text, so a
 * caller only overrides it when the word alone does not carry the meaning.
 */
export const StatusChip = ({ children, tone, className }) => (
  <span
    className={[
      "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-medium",
      TONE_CLASS[tone ?? statusTone(children)] ?? TONE_CLASS.neutral,
      className || "",
    ].join(" ")}
  >
    {children}
  </span>
);

/** The initials shown in an entity's avatar: up to three letters from its name. */
export const initialsOf = (text, max = 3) =>
  String(text ?? "")
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

/** A labelled figure. `value` is rendered as handed over — panels do no arithmetic. */
export const SummaryStat = ({ label, value, testId, tone = "default" }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <p className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">
      {label}
    </p>
    <p
      data-testid={testId}
      title={typeof value === "string" ? value : undefined}
      className={
        tone === "negative"
          ? "mt-1 truncate text-[15px] font-semibold text-red-600"
          : tone === "positive"
            ? "mt-1 truncate text-[15px] font-semibold text-emerald-600"
            : "mt-1 truncate text-[15px] font-semibold text-slate-900"
      }
    >
      {value}
    </p>
  </div>
);

/**
 * The identity block at the top of every detail panel: avatar, name, the identifying
 * line, then the status/figure chips.
 *
 * <p>`badge` stays the status chip but now sits first in the chip row rather than as a
 * corner tag, so the status reads alongside the other facts about the entity instead of
 * floating away from them. `chips` carries the rest — each entry is a string, or
 * {label, tone}. Empty entries are dropped, so a panel can list a chip whose figure the
 * server did not return without leaving a blank pill behind.
 */
export const DetailHeader = ({ title, subtitle, badge, chips = [] }) => (
  <div className="border-b border-slate-100 px-5 py-4">
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold tracking-wide text-slate-500"
      >
        {initialsOf(title)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-slate-900">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
        {(badge || chips.filter(Boolean).length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {badge && <StatusChip>{badge}</StatusChip>}
            {chips.filter(Boolean).map((chip, i) => {
              const label = typeof chip === "string" ? chip : chip.label;
              const tone = typeof chip === "string" ? "neutral" : chip.tone ?? "neutral";
              return label ? (
                <StatusChip key={`${label}-${i}`} tone={tone}>
                  {label}
                </StatusChip>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  </div>
);

export const DetailSection = ({ title, children, action }) => (
  <section className="px-5 py-3">
    <div className="mb-2.5 flex items-center gap-2">
      <h3 className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {title}
      </h3>
      {/* The rule carries the heading across the pane the way the design does. It is
          decoration, so it stays out of the accessibility tree. */}
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-slate-100" />
      {action}
    </div>
    {children}
  </section>
);

/**
 * A section that the user may not see, inside a panel they may.
 *
 * <p>Panels are assembled from more than one permission — a customer's record and its
 * invoices are separate grants — so a denial is scoped to the section rather than
 * blanking the pane. Distinct from {@link EmptyRow}: "you may not see this" and "there
 * is nothing here" are different facts and must not look alike.
 */
export const SectionForbidden = ({ children = "You don't have permission to view this." }) => (
  <p
    className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500"
    data-testid="entity-detail-section-forbidden"
  >
    <LockIcon className="size-3 shrink-0 text-slate-400" aria-hidden="true" />
    {children}
  </p>
);

/** A section whose read failed, inside a panel that otherwise loaded. */
export const SectionError = ({ children = "Could not load this section." }) => (
  <p
    className="rounded-md border border-dashed border-red-200 px-3 py-4 text-center text-[11px] text-red-600"
    data-testid="entity-detail-section-error"
  >
    {children}
  </p>
);

export const EmptyRow = ({ children }) => (
  <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
    {children}
  </p>
);
