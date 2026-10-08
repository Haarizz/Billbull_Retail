import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import { formatDisplayDate } from "../../../utils/dateUtils";
import {
  DetailSection,
  EmptyRow,
  SectionError,
  SectionForbidden,
  StatusChip,
  initialsOf,
} from "./DetailPanelShell";

/**
 * Read-only payables picture for one vendor.
 *
 * <p>Not the customer panel with the sign flipped — vendor accounting has its own shape:
 *
 * <ul>
 *   <li><b>Payable</b> — invoice outstanding + opening outstanding. This is the design's
 *       "Outstanding" card, labelled with the vendor term.
 *   <li><b>Opening balance</b> — as entered on the vendor record, with what is left of it
 *       after on-account payments beneath.
 *   <li><b>Total paid</b> — lifetime posted/cleared payment vouchers.
 * </ul>
 *
 * <p>Both panels carry a Total Paid, but they are not the same calculation: a vendor's is
 * the lifetime sum of posted/cleared payment vouchers, a customer's is
 * `totalSales - outstanding`. Vendor and customer accounting are not mirrors of each
 * other, and the panels do not pretend otherwise.
 *
 * <p>The design's <b>Balance</b> card is not drawn: its figure is Payable with the sign
 * flipped, and showing one number twice invites the reader to think they differ. Nor is
 * there a <b>Last transaction</b>; the last card is the last purchase order, labelled as
 * exactly that.
 *
 * <p><b>Invoices past due is a count, and only ever a count.</b> `PurchaseInvoice` stores
 * no per-invoice balance the way `SalesInvoice` does, so there is no honest overdue
 * *amount* to put beside it — the gross `grandTotal` is not a remaining balance, and
 * netting vendor-level payments against particular invoices would attribute money to
 * documents it was never applied to. The count needs none of that: whether an invoice is
 * settled is a fact it already carries in its own `paymentStatus`. So the design's "Due
 * amount" strip carries the count, and the customer panel's overdue amount has no
 * counterpart here. That asymmetry is the data model, not an omission.
 *
 * <p><b>What else is missing, and why.</b> No per-branch breakdown — no per-branch
 * payables read exists, so that section says so rather than drawing a table of guesses.
 * No "since" date or credit limit chip: neither the search row nor the summary carries
 * them. Phone and email come from the search row; the summary does not carry them.
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

/** "PARTIALLY_RECEIVED" → "Partially Received": statuses arrive as enum names. */
const titleCase = (text) =>
  String(text)
    .toLowerCase()
    .replace(/(^|[\s_-])([a-z])/g, (_, sep, c) => `${sep === "_" ? " " : sep}${c.toUpperCase()}`);

/**
 * LpoStatus → chip tone, explicitly. The shared word-matcher would read "Partially
 * Received" as finished (it matches "received"), but a part-received order is still open.
 */
const LPO_STATUS_TONE = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "positive",
  SENT_TO_VENDOR: "neutral",
  PARTIALLY_RECEIVED: "warning",
  COMPLETED: "positive",
  CANCELLED: "negative",
};

const FigureCard = ({ label, value, testId, tone = "default", hint, hintTestId }) => (
  // Short POS screens (720p/768p) get a tighter card, as on the product and customer panels.
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
      <p className="mt-0.5 truncate text-[10px] text-slate-400" title={hint} data-testid={hintTestId}>
        {hint}
      </p>
    )}
  </div>
);

const VendorHeader = ({ name, identifiers, chips }) => (
  <div className="border-b border-slate-100 px-5 py-4 [@media(max-height:800px)]:py-3">
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[11px] font-semibold tracking-wide text-orange-700"
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
                {chip.label}
              </StatusChip>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

/**
 * The design's horizontal strip under the summary cards, carrying the past-due invoice
 * count — the only overdue figure vendor accounting can state (see the note above).
 * Rendered only when something is past due, so the panel never asserts "nothing past due"
 * for a vendor whose invoices may carry no due date to age them by.
 */
const OverdueStrip = ({ count }) =>
  count > 0 ? (
    <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100 ring-inset">
      <span className="text-[12px] text-slate-600">Invoices past due</span>
      <span
        data-testid="vendor-overdue-count"
        className="truncate text-center text-[15px] font-semibold tabular-nums text-red-600"
      >
        {count} {count === 1 ? "invoice" : "invoices"}
      </span>
      <span className="truncate text-[11px] font-medium text-red-600">
        Past due date, not fully paid
      </span>
    </div>
  ) : null;

const TH = "py-1.5 px-2 font-medium";
const TD = "py-2 px-2";

const VendorDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    vendorCode,
    vendorName,
    status,
    branch,
    phone,
    email,
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

  const identifiers = [vendorCode, phone, email, branch].filter(Boolean).join(" · ");

  // Overdue is the server's count, never re-derived here; status is the vendor's own column.
  const chips = [
    overdueInvoiceCount > 0 ? { key: "overdue", label: "Overdue", tone: "negative" } : null,
    status ? { key: "status", label: status } : null,
  ].filter(Boolean);

  const lastLpoShown = formatDisplayDate(lastLpoDate, DASH);

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="vendor-detail-panel">
        <VendorHeader name={vendorName} identifiers={identifiers} chips={chips} />

        <DetailSection title="Financial summary — consolidated">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <FigureCard
              label="Payable"
              value={money_(payableBalance)}
              testId="vendor-payable-balance"
              tone={toneIf(payableBalance, "warning")}
            />
            <FigureCard
              label="Total paid"
              value={money_(totalPaid)}
              testId="vendor-total-paid"
              tone={toneIf(totalPaid, "positive")}
            />
            <FigureCard
              label="Opening balance"
              value={money_(openingBalance)}
              testId="vendor-opening-balance"
              hint={
                openingBalanceOutstanding != null
                  ? `${money_(openingBalanceOutstanding)} still outstanding`
                  : undefined
              }
              hintTestId="vendor-opening-outstanding"
            />
            <FigureCard
              label="Last PO"
              value={lastLpoShown}
              testId="vendor-last-lpo-date"
              tone={lastLpoDate ? "default" : "muted"}
              hint={
                lastLpoNumber ||
                (lposForbidden ? "No access to purchase orders" : lposFailed ? "Could not load" : undefined)
              }
            />
          </div>
          <OverdueStrip count={overdueInvoiceCount} />
        </DetailSection>

        <DetailSection title="Activity by branch">
          <p
            className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400 [@media(max-height:800px)]:py-2"
            data-testid="vendor-branch-activity-unavailable"
          >
            Per-branch figures are not recorded for vendors yet. The summary above covers all
            branches.
          </p>
        </DetailSection>

        <DetailSection
          title="Recent purchase orders"
          action={
            lastLpoDate ? (
              <span
                className="shrink-0 truncate text-[10px] text-slate-400"
                data-testid="vendor-last-lpo"
              >
                Last PO {lastLpoShown}
                {lastLpoNumber ? ` · ${lastLpoNumber}` : ""}
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
            <table className="w-full table-fixed text-[11px]" data-testid="vendor-lpo-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[9px] uppercase tracking-[0.08em] text-slate-400">
                  <th className={`w-[24%] pl-2 ${TH}`}>PO no.</th>
                  <th className={`w-[16%] ${TH}`}>Date</th>
                  {/* Branch gives way first on a narrow pane. */}
                  <th className={`hidden lg:table-cell ${TH}`}>Branch</th>
                  <th className={`text-right ${TH}`}>Amount</th>
                  <th className={`w-[16%] pl-3 ${TH}`}>ETA</th>
                  <th className={`w-[96px] ${TH}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {lpos.map((lpo, index) => (
                  <tr
                    key={lpo.id ?? `${lpo.lpoNumber}-${index}`}
                    className="border-b border-slate-100 text-slate-700 last:border-b-0 even:bg-slate-50/50"
                  >
                    <td
                      className={`truncate pl-2 font-mono text-[10.5px] text-slate-800 ${TD}`}
                      title={lpo.lpoNumber || undefined}
                    >
                      {lpo.lpoNumber || DASH}
                    </td>
                    <td className={`whitespace-nowrap text-slate-500 ${TD}`}>
                      {formatDisplayDate(lpo.lpoDate, DASH)}
                    </td>
                    <td className={`hidden truncate lg:table-cell ${TD}`} title={lpo.branchName || undefined}>
                      {lpo.branchName || DASH}
                    </td>
                    <td className={`truncate text-right tabular-nums ${TD}`}>
                      {money_(lpo.grandTotal)}
                    </td>
                    <td className={`whitespace-nowrap pl-3 text-slate-500 ${TD}`}>
                      {formatDisplayDate(lpo.expectedDeliveryDate, DASH)}
                    </td>
                    <td className={TD}>
                      {lpo.status ? (
                        <StatusChip
                          tone={LPO_STATUS_TONE[String(lpo.status).toUpperCase()]}
                          className="max-w-full truncate"
                        >
                          {titleCase(lpo.status)}
                        </StatusChip>
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

export default VendorDetailPanel;
