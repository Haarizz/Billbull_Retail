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
 * Read-only payables picture for one vendor.
 *
 * <p>Not the customer panel with the sign flipped — vendor accounting has its own shape:
 *
 * <ul>
 *   <li><b>Payable</b> — invoice outstanding + opening outstanding.
 *   <li><b>Opening balance</b> — as entered on the vendor record, shown beside what is
 *       left of it after on-account payments.
 *   <li><b>Total paid</b> — lifetime posted/cleared payment vouchers.
 * </ul>
 *
 * <p>Both panels carry a Total Paid, but they are not the same calculation: a vendor's is
 * the lifetime sum of posted/cleared payment vouchers, a customer's is
 * `totalSales - outstanding`. Vendor and customer accounting are not mirrors of each
 * other, and the panels do not pretend otherwise.
 *
 * <p><b>Invoices past due is a count, and only ever a count.</b> `PurchaseInvoice` stores
 * no per-invoice balance the way `SalesInvoice` does, so there is no honest overdue
 * *amount* to put beside it — the gross `grandTotal` is not a remaining balance, and
 * netting vendor-level payments against particular invoices would attribute money to
 * documents it was never applied to. The count needs none of that: whether an invoice is
 * settled is a fact it already carries in its own `paymentStatus`. So this panel says how
 * many invoices are past due and never how much, and the customer panel's overdue amount
 * has no counterpart here. That asymmetry is the data model, not an omission.
 *
 * <p><b>What else is missing, and why.</b> No Due Amount card — it would be Payable under
 * a second label. No per-branch breakdown; that stays deferred.
 */

const DASH = "—";

const money = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const VendorDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    vendorCode,
    vendorName,
    status,
    branch,
    openingBalance,
    openingBalanceOutstanding,
    payableBalance,
    totalPaid,
    overdueInvoiceCount,
    lastLpoDate,
    lastLpoNumber,
    lpos,
    lposForbidden,
    lposFailed,
  } = detail;

  const money_ = (value) => money(value, detail.currency || currency);

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="vendor-detail-panel">
        <DetailHeader
          title={vendorName}
          subtitle={[vendorCode, branch].filter(Boolean).join(" • ")}
          badge={status || undefined}
        />

        <DetailSection title="Account">
          <div className="grid grid-cols-3 gap-2">
            <SummaryStat
              label="Payable"
              value={money_(payableBalance)}
              testId="vendor-payable-balance"
              tone={payableBalance > 0 ? "negative" : "default"}
            />
            <SummaryStat
              label="Opening balance"
              value={money_(openingBalance)}
              testId="vendor-opening-balance"
            />
            <SummaryStat label="Total paid" value={money_(totalPaid)} testId="vendor-total-paid" />
          </div>
          {openingBalanceOutstanding != null && (
            <p className="mt-2 text-[10px] text-slate-400" data-testid="vendor-opening-outstanding">
              {money_(openingBalanceOutstanding)} of the opening balance is still outstanding.
            </p>
          )}
          {/* A count with no amount beside it, deliberately — see the note at the top of
              this file. Rendered only when there is something past due, so the panel never
              asserts "0 invoices past due" for a vendor whose invoices it cannot age. */}
          {overdueInvoiceCount > 0 && (
            <p className="mt-2 text-[10px] font-medium text-red-600" data-testid="vendor-overdue-count">
              {overdueInvoiceCount} {overdueInvoiceCount === 1 ? "invoice is" : "invoices are"} past
              due.
            </p>
          )}
        </DetailSection>

        <DetailSection
          title="Recent purchase orders"
          action={
            lastLpoDate ? (
              <span className="text-[10px] text-slate-400" data-testid="vendor-last-lpo">
                Last LPO {lastLpoDate}
                {lastLpoNumber ? ` (${lastLpoNumber})` : ""}
              </span>
            ) : null
          }
        >
          {lposForbidden ? (
            <SectionForbidden>
              You don&apos;t have permission to view this vendor&apos;s purchase orders.
            </SectionForbidden>
          ) : lposFailed ? (
            <SectionError>Could not load recent purchase orders.</SectionError>
          ) : lpos.length === 0 ? (
            <EmptyRow>No purchase orders raised on this vendor.</EmptyRow>
          ) : (
            <table className="w-full text-[11px]" data-testid="vendor-lpo-table">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 pr-2 font-medium">LPO</th>
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 pr-2 font-medium">Status</th>
                  <th className="py-1 px-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lpos.map((lpo, index) => (
                  <tr
                    key={lpo.id ?? `${lpo.lpoNumber}-${index}`}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="max-w-[92px] truncate py-1.5 pr-2">{lpo.lpoNumber || DASH}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2">{lpo.lpoDate || DASH}</td>
                    <td className="max-w-[80px] truncate py-1.5 pr-2 text-[10px] uppercase text-slate-500">
                      {lpo.status || DASH}
                    </td>
                    <td className="py-1.5 px-1 text-right tabular-nums">
                      {lpo.grandTotal == null ? DASH : money_(lpo.grandTotal)}
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

export default VendorDetailPanel;
