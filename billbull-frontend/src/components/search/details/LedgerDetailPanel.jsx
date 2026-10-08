import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import { formatDisplayDate } from "../../../utils/dateUtils";
import { DetailSection, EmptyRow, StatusChip } from "./DetailPanelShell";

/**
 * Read-only balance picture for one chart-of-accounts code.
 *
 * <p>Net balance, total debit and total credit are the server's pre-aggregated GL
 * figures (`closingBalance = debitTotal - creditTotal`, the backend's own convention), so
 * a positive net balance is a debit balance and a negative one a credit balance. Colour
 * follows the Ledger page rather than the design's palette: debit and Dr balances read
 * emerald, credit and Cr balances red — the same figure must not change colour between
 * the two screens. The transaction list underneath is a bounded, newest-first sample —
 * the totals above are never derived from it.
 *
 * <p>Branch rows with no branch id are the posting engine's unattributed balances. They
 * are shown as "Unattributed" rather than dropped: hiding them would leave the branch
 * rows visibly failing to add up to the account total. Both reads are branch-scoped
 * server-side, so the headings say "accessible" — for a restricted user the figures are
 * their branches only, not the company.
 *
 * <p><b>Balance column.</b> Each ledger entry stores the account's running balance as it
 * stood right after that posting — an unsigned amount plus its side ("Dr"/"Cr") — and the
 * Ledger page renders that pair as-is. So does this panel; it never recomputes one. That
 * stored figure is account-wide, not per branch.
 *
 * <p><b>Not drawn.</b> Accounts have no currency of their own; every GL figure is in the
 * company's base currency, which is what the header's currency names.
 */

const DASH = "—";

const number = (value) =>
  Math.abs(Number(value)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const money = (value, currency) =>
  value == null ? DASH : `${currency} ${Number(value) < 0 ? "-" : ""}${number(value)}`;

/** The net balance keeps its sign visibly, both ways — "+" is a debit balance here. */
const signedMoney = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value) > 0 ? "+" : Number(value) < 0 ? "-" : ""}${number(value)}`;

/** One side of a posting: blank when the entry did not touch that side. */
const sideAmount = (value, currency) =>
  value == null || Number(value) === 0 ? null : money(value, currency);

const VALUE_TONE = {
  default: "text-slate-900",
  debit: "text-emerald-700",
  credit: "text-red-600",
  muted: "text-slate-400",
};

/** Only a figure that is actually non-zero earns a side colour. */
const sideTone = (value, tone) => (Number(value) !== 0 ? tone : "muted");

/** closingBalance = debit - credit, so its sign is its side. */
const balanceTone = (value) =>
  Number(value) > 0 ? "debit" : Number(value) < 0 ? "credit" : "default";

const balanceSide = (value) =>
  Number(value) > 0 ? "Debit balance" : Number(value) < 0 ? "Credit balance" : "Nil balance";

const titleCase = (text) =>
  String(text).toLowerCase().replace(/(^|\s)([a-z])/g, (_, sep, c) => `${sep}${c.toUpperCase()}`);

/** "Asset" vs "Assets" is the same fact twice; only a group that adds something is shown. */
const sameWord = (a, b) =>
  String(a ?? "").trim().toLowerCase().replace(/s$/, "") ===
  String(b ?? "").trim().toLowerCase().replace(/s$/, "");

const FigureCard = ({ label, value, testId, tone = "default", hint, hintTestId }) => (
  // Short POS screens (720p/768p) get a tighter card, as on the other panels.
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
      <p className="mt-0.5 truncate text-[10px] text-slate-400" data-testid={hintTestId}>
        {hint}
      </p>
    )}
  </div>
);

const TH = "py-1.5 px-2 text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400";
const TD = "truncate py-2 px-2 [@media(max-height:800px)]:py-1.5";

const LedgerDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    accountCode,
    accountName,
    accountType,
    accountGroup,
    status,
    isGroup,
    debitTotal,
    creditTotal,
    netBalance,
    branchBalances,
    transactions,
  } = detail;

  const identifiers = [
    accountCode && `Account ${accountCode}`,
    accountType,
    currency && `Currency: ${currency}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const chips = [
    accountGroup && !sameWord(accountGroup, accountType)
      ? { key: "group", label: accountGroup, tone: "neutral" }
      : null,
    isGroup ? { key: "header", label: "Group account", tone: "neutral" } : null,
    status && String(status).toLowerCase() !== "active"
      ? { key: "status", label: titleCase(status) }
      : null,
  ].filter(Boolean);

  // Share of the account total, for the bar beside each branch. Presentation only — a
  // proportion of figures the server already settled, not a new balance. Taken over
  // absolute balances, since branches of one account can sit on opposite sides.
  const shareBasis = branchBalances.reduce((acc, b) => acc + Math.abs(b.closingBalance), 0);

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="ledger-detail-panel">
        <div className="border-b border-slate-100 px-5 py-4 [@media(max-height:800px)]:py-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 min-w-10 max-w-20 shrink-0 items-center justify-center truncate rounded-lg bg-indigo-50 px-1.5 text-[11px] font-semibold tabular-nums text-indigo-600"
            >
              {accountCode || "L"}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[16px] font-semibold leading-tight text-slate-900"
                title={accountName}
              >
                {accountName}
              </p>
              {identifiers && (
                <p
                  className="mt-1 truncate text-[11px] text-slate-500"
                  title={identifiers}
                  data-testid="ledger-identifiers"
                >
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

        <DetailSection title="Consolidated summary">
          <div className="grid grid-cols-3 gap-2">
            <FigureCard
              label="Net balance"
              value={signedMoney(netBalance, currency)}
              testId="ledger-net-balance"
              tone={balanceTone(netBalance)}
              hint={balanceSide(netBalance)}
              hintTestId="ledger-net-balance-side"
            />
            <FigureCard
              label="Total debit"
              value={money(debitTotal, currency)}
              testId="ledger-total-debit"
              tone="debit"
            />
            <FigureCard
              label="Total credit"
              value={money(creditTotal, currency)}
              testId="ledger-total-credit"
              tone="credit"
            />
          </div>
        </DetailSection>

        <DetailSection title="Balance by branch">
          {branchBalances.length === 0 ? (
            <EmptyRow>No branch balances recorded.</EmptyRow>
          ) : (
            <table
              className="w-full table-fixed border-collapse text-[11px]"
              data-testid="ledger-branch-list"
            >
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className={TH}>Branch</th>
                  <th className={TH}>Balance</th>
                  <th className={TH}>Total debit</th>
                  <th className={TH}>Total credit</th>
                  <th className={`${TH} text-right`} title="Share of the absolute branch balances">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {branchBalances.map((branch, index) => {
                  const share =
                    shareBasis > 0 ? Math.abs(branch.closingBalance) / shareBasis : null;
                  const pct = share == null ? null : Math.round(share * 100);
                  const balance = money(branch.closingBalance, currency);
                  const debit = money(branch.debitTotal, currency);
                  const credit = money(branch.creditTotal, currency);
                  return (
                    <tr
                      key={`${branch.branchId ?? "unattributed"}-${index}`}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td
                        className={`${TD} ${
                          branch.branchId == null ? "italic text-slate-500" : "text-slate-800"
                        }`}
                        title={branch.branchName}
                      >
                        {branch.branchName}
                      </td>
                      <td
                        className={`${TD} tabular-nums ${VALUE_TONE[balanceTone(branch.closingBalance)]}`}
                        title={balance}
                      >
                        {balance}
                      </td>
                      <td className={`${TD} tabular-nums ${VALUE_TONE[sideTone(branch.debitTotal, "debit")]}`} title={debit}>
                        {debit}
                      </td>
                      <td className={`${TD} tabular-nums ${VALUE_TONE[sideTone(branch.creditTotal, "credit")]}`} title={credit}>
                        {credit}
                      </td>
                      <td className="py-2 px-2 [@media(max-height:800px)]:py-1.5">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
                            {pct == null ? DASH : `${pct}%`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DetailSection>

        <DetailSection title="Recent transactions — all accessible branches">
          {transactions.length === 0 ? (
            <EmptyRow>No transactions posted to this account.</EmptyRow>
          ) : (
            <table
              className="w-full table-fixed border-collapse text-[11px]"
              data-testid="ledger-transaction-table"
            >
              <colgroup>
                <col className="w-[13%]" />
                <col />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className={TH}>Date</th>
                  <th className={TH}>Description</th>
                  <th className={TH}>Branch</th>
                  <th className={TH}>Debit</th>
                  <th className={TH}>Credit</th>
                  <th
                    className={`${TH} text-right`}
                    title="The account's running balance as recorded right after each posting"
                  >
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, index) => {
                  const debit = sideAmount(txn.debitAmount, currency);
                  const credit = sideAmount(txn.creditAmount, currency);
                  const balance =
                    txn.runningBalance == null
                      ? DASH
                      : [money(txn.runningBalance, currency), txn.balanceType]
                          .filter(Boolean)
                          .join(" ");
                  const describe = [txn.description, txn.voucherNo].filter(Boolean).join(" · ");
                  return (
                    <tr
                      key={txn.id ?? `${txn.voucherNo}-${index}`}
                      className="border-b border-slate-100 text-slate-700 last:border-b-0"
                    >
                      <td className={`${TD} text-slate-500`}>
                        {formatDisplayDate(txn.transactionDate, DASH)}
                      </td>
                      <td className={TD} title={describe || undefined}>
                        {txn.description ? (
                          <>
                            <span className="text-slate-800">{txn.description}</span>
                            {txn.voucherNo && (
                              <span className="ml-1.5 text-[10px] text-slate-400">
                                {txn.voucherNo}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-800">{txn.voucherNo || DASH}</span>
                        )}
                      </td>
                      <td className={TD} title={txn.branchName || undefined}>
                        {txn.branchName ? (
                          <span className="inline-block max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] text-slate-600">
                            {txn.branchName}
                          </span>
                        ) : (
                          <span className="text-slate-300">{DASH}</span>
                        )}
                      </td>
                      <td
                        className={`${TD} tabular-nums ${debit ? VALUE_TONE.debit : "text-slate-300"}`}
                        title={debit || undefined}
                      >
                        {debit ?? DASH}
                      </td>
                      <td
                        className={`${TD} tabular-nums ${credit ? VALUE_TONE.credit : "text-slate-300"}`}
                        title={credit || undefined}
                      >
                        {credit ?? DASH}
                      </td>
                      <td
                        className={`${TD} text-right font-medium tabular-nums text-slate-900`}
                        title={balance}
                      >
                        {balance}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DetailSection>
      </div>
    </ScrollArea>
  );
};

export default LedgerDetailPanel;
