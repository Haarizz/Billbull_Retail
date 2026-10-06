import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import {
  DetailHeader,
  DetailSection,
  EmptyRow,
  SectionError,
  SectionForbidden,
  SummaryStat,
} from "./DetailPanelShell";

/**
 * Read-only receivables picture for one customer.
 *
 * <p>Four figures, and they are deliberately not collapsed into one "balance":
 *
 * <ul>
 *   <li><b>Opening balance</b> — what the customer owed when the record was created.
 *   <li><b>Outstanding</b> — what is owed now: invoice outstanding + opening outstanding.
 *   <li><b>Total sales</b> — opening balance + everything invoiced, lifetime.
 *   <li><b>Total paid</b> — lifetime settled, `totalSales - outstanding`, computed on
 *       the server. The panel does no arithmetic, here or anywhere else.
 * </ul>
 *
 * Labelling the first of these "Balance" would read as the second, so both keep their
 * own name even though the entity field behind Opening Balance is called `balance`.
 *
 * <p><b>Overdue</b> is the amount and invoice count past their own `dueDate` and still
 * carrying a positive balance — a date-slice of Outstanding, so it can never exceed it.
 * Both come from the server.
 *
 * <p><b>Last Invoice</b> is the date at the head of the recent-invoice list below it,
 * and is labelled as exactly that. It is not a "Last Transaction": a union across
 * invoices, receipts, JVs and credit notes would be a figure the reader could not
 * interpret without asking what went into it.
 *
 * <p><b>What is missing, and why.</b> There is no Due Amount card — it would be
 * Outstanding under a second label, and one number under two names reads as two facts.
 * There is no per-branch breakdown either; that stays deferred rather than shipped with
 * a definition nobody has settled.
 */

const DASH = "—";

const money = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const CustomerDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    customerCode,
    customerName,
    status,
    branch,
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

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="customer-detail-panel">
        <DetailHeader
          title={customerName}
          subtitle={[customerCode, branch].filter(Boolean).join(" • ")}
          badge={status || undefined}
          chips={[
            overdueInvoiceCount > 0
              ? `${overdueInvoiceCount} overdue invoice${overdueInvoiceCount === 1 ? "" : "s"}`
              : null,
            lastInvoiceDate ? `Last invoice ${lastInvoiceDate}` : null,
          ]}
        />

        <DetailSection title="Account">
          <div className="grid grid-cols-2 gap-2">
            <SummaryStat
              label="Outstanding"
              value={money_(outstanding)}
              testId="customer-outstanding"
              tone={outstanding > 0 ? "negative" : "default"}
            />
            <SummaryStat
              label="Total paid"
              value={money_(totalPaid)}
              testId="customer-total-paid"
            />
            <SummaryStat
              label="Opening balance"
              value={money_(openingBalance)}
              testId="customer-opening-balance"
            />
            <SummaryStat
              label="Total sales"
              value={money_(totalSales)}
              testId="customer-total-sales"
            />
          </div>
        </DetailSection>

        {/* Overdue is a slice of Outstanding rather than another balance, so it gets its
            own section instead of a fifth card in the grid above. The amount is only
            rendered when the server sent one — an "AED 0.00" where the field is simply
            absent would be a claim the server never made. */}
        <DetailSection title="Overdue">
          {overdueAmount == null ? (
            <EmptyRow>No overdue figure available for this customer.</EmptyRow>
          ) : overdueInvoiceCount === 0 ? (
            <p
              className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400"
              data-testid="customer-overdue-none"
            >
              Nothing past due.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <SummaryStat
                label="Overdue amount"
                value={money_(overdueAmount)}
                testId="customer-overdue-amount"
                tone="negative"
              />
              <SummaryStat
                label="Invoices past due"
                value={String(overdueInvoiceCount)}
                testId="customer-overdue-count"
                tone="negative"
              />
            </div>
          )}
        </DetailSection>

        <DetailSection
          title="Recent invoices"
          action={
            lastInvoiceDate ? (
              <span className="text-[10px] text-slate-400" data-testid="customer-last-invoice">
                Last invoice {lastInvoiceDate}
                {lastInvoiceNumber ? ` (${lastInvoiceNumber})` : ""}
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
            <table className="w-full text-[11px]" data-testid="customer-invoice-table">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[9px] uppercase tracking-[0.08em] text-slate-400">
                  <th className="py-1 pr-2 font-medium">Invoice</th>
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 px-1 text-right font-medium">Total</th>
                  <th className="py-1 px-1 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, index) => (
                  <tr
                    key={inv.id ?? `${inv.invoiceNumber}-${index}`}
                    className="border-t border-slate-50 text-slate-700"
                  >
                    <td className="max-w-[92px] truncate py-1.5 pr-2" title={inv.status || ""}>
                      {inv.invoiceNumber || DASH}
                      {inv.status && (
                        <span className="ml-1 text-[10px] uppercase text-slate-400">
                          {inv.status}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2">{inv.invoiceDate || DASH}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums">
                      {inv.invoiceTotal == null ? DASH : money_(inv.invoiceTotal)}
                    </td>
                    <td className="py-1.5 px-1 text-right tabular-nums">
                      {inv.balance == null ? DASH : money_(inv.balance)}
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
