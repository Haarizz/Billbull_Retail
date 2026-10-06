import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import { formatDisplayDate } from "../../../utils/dateUtils";
import { customerStanding } from "./customerStanding";
import {
  DetailSection,
  EmptyRow,
  SectionError,
  SectionForbidden,
  StatusChip,
  initialsOf,
} from "./DetailPanelShell";

/**
 * Read-only receivables picture for one customer.
 *
 * <p>The figures keep the backend's semantics and none is recomputed here:
 *
 * <ul>
 *   <li><b>Outstanding</b> — what is owed now: invoice outstanding + opening outstanding.
 *   <li><b>Total paid</b> — lifetime settled, `totalSales - outstanding`, computed on
 *       the server. The panel does no arithmetic, here or anywhere else.
 *   <li><b>Total sales</b> — opening balance + everything invoiced, lifetime.
 *   <li><b>Opening balance</b> — what the customer owed when the record was created. It is
 *       an account fact rather than a current position, so it sits with the header chips.
 * </ul>
 *
 * All of them are taken across every branch — the summary is keyed by customer code with
 * no branch predicate — which is what the "consolidated" heading says.
 *
 * <p>The design's <b>Balance</b> card is not drawn. The only balance on the record is the
 * opening balance, and labelling it "Balance" would read as Outstanding.
 *
 * <p><b>Overdue</b> is the amount and invoice count past their own `dueDate` and still
 * carrying a positive balance — a date-slice of Outstanding, from the server. The design's
 * "Due amount" strip is labelled "Overdue amount" because that is the figure it carries;
 * a "Due amount" would be Outstanding under a second name.
 *
 * <p><b>Last invoice</b> is the head of the recent-invoice list, labelled as exactly that.
 * It is not a "Last transaction": a union across invoices, receipts, JVs and credit notes
 * would be a figure the reader could not interpret without asking what went into it.
 *
 * <p><b>Activity by branch</b> has no data behind it yet — no per-branch receivables read
 * exists — so the section says so instead of drawing a table of guesses. Mobile, email
 * and credit terms come from the search row (the customer record itself); the summary
 * does not carry them, and a missing one is simply left out.
 */

const DASH = "—";

const money = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const VALUE_TONE = {
  default: "text-slate-900",
  positive: "text-emerald-700",
  warning: "text-[#8A6D09]",
  negative: "text-red-600",
  muted: "text-slate-400",
};

/** Colour for a figure: only a value that is actually non-zero earns a tone. */
const toneIf = (value, tone) => (value != null && Number(value) > 0 ? tone : "default");

/** "PAID" → "Paid": statuses arrive upper-case from the server. */
const titleCase = (text) =>
  String(text)
    .toLowerCase()
    .replace(/(^|[\s_-])([a-z])/g, (_, sep, c) => `${sep === "_" ? " " : sep}${c.toUpperCase()}`);

const FigureCard = ({ label, value, testId, tone = "default", hint }) => (
  // Short POS screens (720p/768p) get a tighter card, as on the product panel.
  <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100 ring-inset [@media(max-height:800px)]:py-1.5">
    <p className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">
      {label}
    </p>
    <p
      data-testid={testId}
      title={typeof value === "string" ? value : undefined}
      className={`mt-1 truncate text-[17px] font-semibold leading-tight tabular-nums ${VALUE_TONE[tone] ?? VALUE_TONE.default}`}
    >
      {value}
    </p>
    {hint && (
      <p className="mt-0.5 truncate text-[10px] text-slate-400" title={hint}>
        {hint}
      </p>
    )}
  </div>
);

const CustomerHeader = ({ name, identifiers, chips }) => (
  <div className="border-b border-slate-100 px-5 py-4 [@media(max-height:800px)]:py-3">
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-semibold tracking-wide text-emerald-700"
      >
        {initialsOf(name, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold leading-tight text-slate-900" title={name}>
          {name}
        </p>
        {identifiers && (
          <p className="mt-1 truncate text-[11px] text-slate-500" title={identifiers}>
            {identifiers}
          </p>
        )}
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <StatusChip key={chip.key} tone={chip.tone}>
                {chip.testId ? <span data-testid={chip.testId}>{chip.label}</span> : chip.label}
              </StatusChip>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

/** The design's horizontal strip under the summary cards: overdue exposure at a glance. */
const OverdueStrip = ({ overdueAmount, overdueInvoiceCount, formatMoney }) => {
  if (overdueAmount == null) {
    return <EmptyRow>No overdue figure available for this customer.</EmptyRow>;
  }
  if (overdueInvoiceCount === 0) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100 ring-inset"
        data-testid="customer-overdue-none"
      >
        <span className="text-[12px] text-slate-600">Overdue amount</span>
        <span className="text-[11px] text-slate-400">Nothing past due.</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100 ring-inset">
      <span className="text-[12px] text-slate-600">Overdue amount</span>
      <span
        data-testid="customer-overdue-amount"
        className="truncate text-center text-[15px] font-semibold tabular-nums text-red-600"
      >
        {formatMoney(overdueAmount)}
      </span>
      <span data-testid="customer-overdue-count" className="text-[11px] font-medium text-red-600">
        {overdueInvoiceCount} overdue invoice{overdueInvoiceCount === 1 ? "" : "s"}
      </span>
    </div>
  );
};

const TH = "py-1.5 px-2 font-medium";
const TD = "py-2 px-2";

const CustomerDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    customerCode,
    customerName,
    status,
    branch,
    mobile,
    email,
    creditLimitAmount,
    creditLimitDays,
    blockCredit,
    openingBalance,
    outstanding,
    totalSales,
    totalPaid,
    overdueAmount,
    overdueInvoiceCount,
    lastInvoiceDate,
    lastInvoiceNumber,
    invoices,
    invoicesForbidden,
    invoicesFailed,
  } = detail;

  // The customer's own currency when the record carries one, otherwise the company's.
  const money_ = (value) => money(value, detail.currency || currency);

  const identifiers = [customerCode, mobile, email, branch].filter(Boolean).join(" · ");

  // Same standing rule as the result row, so a customer reads the same in both places.
  const standing = customerStanding({ status, blockCredit });
  const chips = [
    overdueInvoiceCount > 0 ? { key: "overdue", label: "Overdue", tone: "negative" } : null,
    standing ? { key: "standing", ...standing } : null,
    creditLimitAmount > 0
      ? { key: "credit-limit", label: `Credit limit: ${money_(creditLimitAmount)}`, tone: "neutral" }
      : null,
    creditLimitDays > 0
      ? { key: "credit-days", label: `Credit days: ${creditLimitDays}`, tone: "neutral" }
      : null,
    openingBalance != null
      ? {
          key: "opening",
          label: `Opening balance: ${money_(openingBalance)}`,
          tone: "neutral",
          testId: "customer-opening-balance",
        }
      : null,
  ].filter(Boolean);

  const lastInvoiceShown = formatDisplayDate(lastInvoiceDate, DASH);

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="customer-detail-panel">
        <CustomerHeader name={customerName} identifiers={identifiers} chips={chips} />

        <DetailSection title="Financial summary — consolidated">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <FigureCard
              label="Outstanding"
              value={money_(outstanding)}
              testId="customer-outstanding"
              tone={toneIf(outstanding, "warning")}
            />
            <FigureCard
              label="Total paid"
              value={money_(totalPaid)}
              testId="customer-total-paid"
              tone={toneIf(totalPaid, "positive")}
            />
            <FigureCard
              label="Total sales"
              value={money_(totalSales)}
              testId="customer-total-sales"
            />
            <FigureCard
              label="Last invoice"
              value={lastInvoiceShown}
              testId="customer-last-invoice-date"
              tone={lastInvoiceDate ? "default" : "muted"}
              hint={
                lastInvoiceNumber ||
                (invoicesForbidden ? "No access to invoices" : invoicesFailed ? "Could not load" : undefined)
              }
            />
          </div>
          <div className="mt-2">
            <OverdueStrip
              overdueAmount={overdueAmount}
              overdueInvoiceCount={overdueInvoiceCount}
              formatMoney={money_}
            />
          </div>
        </DetailSection>

        <DetailSection title="Activity by branch">
          <p
            className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400 [@media(max-height:800px)]:py-2"
            data-testid="customer-branch-activity-unavailable"
          >
            Per-branch figures are not recorded for customers yet. The summary above covers
            all branches.
          </p>
        </DetailSection>

        <DetailSection
          title="Recent invoices"
          action={
            lastInvoiceDate ? (
              <span
                className="shrink-0 truncate text-[10px] text-slate-400"
                data-testid="customer-last-invoice"
              >
                Last invoice {lastInvoiceShown}
                {lastInvoiceNumber ? ` · ${lastInvoiceNumber}` : ""}
              </span>
            ) : null
          }
        >
          {invoicesForbidden ? (
            <SectionForbidden>
              You don&apos;t have permission to view this customer&apos;s invoices.
            </SectionForbidden>
          ) : invoicesFailed ? (
            <SectionError>Could not load recent invoices.</SectionError>
          ) : invoices.length === 0 ? (
            <EmptyRow>No invoices raised for this customer.</EmptyRow>
          ) : (
            <table className="w-full table-fixed text-[11px]" data-testid="customer-invoice-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[9px] uppercase tracking-[0.08em] text-slate-400">
                  <th className={`w-[24%] pl-2 ${TH}`}>Invoice</th>
                  <th className={`w-[18%] ${TH}`}>Date</th>
                  {/* Branch gives way first on a narrow pane. */}
                  <th className={`hidden lg:table-cell ${TH}`}>Branch</th>
                  <th className={`text-right ${TH}`}>Total</th>
                  <th className={`text-right ${TH}`}>Balance</th>
                  <th className={`w-[88px] pl-3 ${TH}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, index) => (
                  <tr
                    key={inv.id ?? `${inv.invoiceNumber}-${index}`}
                    className="border-b border-slate-100 text-slate-700 last:border-b-0 even:bg-slate-50/50"
                  >
                    <td
                      className={`truncate pl-2 font-mono text-[10.5px] text-slate-800 ${TD}`}
                      title={inv.invoiceNumber || undefined}
                    >
                      {inv.invoiceNumber || DASH}
                    </td>
                    <td className={`whitespace-nowrap text-slate-500 ${TD}`}>
                      {formatDisplayDate(inv.invoiceDate, DASH)}
                    </td>
                    <td className={`hidden truncate lg:table-cell ${TD}`} title={inv.branchName || undefined}>
                      {inv.branchName || DASH}
                    </td>
                    <td className={`truncate text-right tabular-nums ${TD}`}>
                      {money_(inv.invoiceTotal)}
                    </td>
                    <td
                      className={`truncate text-right tabular-nums ${TD} ${
                        inv.balance > 0 ? "font-medium text-[#8A6D09]" : ""
                      }`}
                    >
                      {money_(inv.balance)}
                    </td>
                    <td className={`pl-3 ${TD}`}>
                      {inv.status ? (
                        <StatusChip className="max-w-full truncate">{titleCase(inv.status)}</StatusChip>
                      ) : (
                        DASH
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DetailSection>
      </div>
    </ScrollArea>
  );
};

export default CustomerDetailPanel;
