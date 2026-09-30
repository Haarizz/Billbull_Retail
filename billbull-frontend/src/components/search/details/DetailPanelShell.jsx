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

/** A labelled figure. `value` is rendered as handed over — panels do no arithmetic. */
export const SummaryStat = ({ label, value, testId, tone = "default" }) => (
  <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
    <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </p>
    <p
      data-testid={testId}
      title={typeof value === "string" ? value : undefined}
      className={
        tone === "negative"
          ? "mt-0.5 truncate text-[13px] font-semibold text-red-600"
          : tone === "positive"
            ? "mt-0.5 truncate text-[13px] font-semibold text-emerald-600"
            : "mt-0.5 truncate text-[13px] font-semibold text-slate-800"
      }
    >
      {value}
    </p>
  </div>
);

export const DetailHeader = ({ title, subtitle, badge }) => (
  <div className="border-b border-slate-100 px-5 py-3">
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-800">{title}</p>
      {badge && (
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
          {badge}
        </span>
      )}
    </div>
    {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
  </div>
);

export const DetailSection = ({ title, children, action }) => (
  <section className="px-5 py-3">
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
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
