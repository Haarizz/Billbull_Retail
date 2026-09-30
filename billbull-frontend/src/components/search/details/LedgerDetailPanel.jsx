import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import {
  DetailHeader,
  DetailSection,
  EmptyRow,
  SummaryStat,
} from "./DetailPanelShell";

/**
 * Read-only balance picture for one chart-of-accounts code.
 *
 * <p>Net balance, total debit and total credit are the server's pre-aggregated GL
 * figures (`closingBalance = debitTotal - creditTotal`, the backend's own convention).
 * The transaction list underneath is a bounded, newest-first sample — the totals above
 * are never derived from it.
 *
 * <p>Branch rows with no branch id are the posting engine's unattributed balances. They
 * are shown as "Unattributed" rather than dropped: hiding them would leave the branch
 * rows visibly failing to add up to the account total.
 */

const DASH = "—";

const money = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const amount = (value) =>
  value == null || Number(value) === 0
    ? DASH
    : Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const LedgerDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    accountCode,
    accountName,
    accountType,
    accountGroup,
    debitTotal,
    creditTotal,
    netBalance,
    branchBalances,
    transactions,
  } = detail;

  // Share of the account total, for the bar next to each branch. Presentation only —
  // it is a proportion of figures the server already settled, not a new balance.
  const shareBasis = branchBalances.reduce((acc, b) => acc + Math.abs(b.closingBalance), 0);

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="ledger-detail-panel">
        <DetailHeader
          title={accountName}
          subtitle={[accountCode && `Acc ${accountCode}`, accountGroup].filter(Boolean).join(" • ")}
          badge={accountType || undefined}
        />

        <DetailSection title="Balances">
          <div className="grid grid-cols-3 gap-2">
            <SummaryStat
              label="Net balance"
              value={money(netBalance, currency)}
              testId="ledger-net-balance"
              tone={netBalance < 0 ? "negative" : "positive"}
            />
            <SummaryStat
              label="Total debit"
              value={money(debitTotal, currency)}
              testId="ledger-total-debit"
            />
            <SummaryStat
              label="Total credit"
              value={money(creditTotal, currency)}
              testId="ledger-total-credit"
            />
          </div>
        </DetailSection>

        <DetailSection title="By branch">
          {branchBalances.length === 0 ? (
            <EmptyRow>No branch balances recorded.</EmptyRow>
          ) : (
            <ul className="space-y-1.5" data-testid="ledger-branch-list">
              {branchBalances.map((branch, index) => {
                const share =
                  shareBasis > 0 ? Math.abs(branch.closingBalance) / shareBasis : 0;
                return (
                  <li key={`${branch.branchId ?? "unattributed"}-${index}`}>
                    <div className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span
                        className={
                          branch.branchId == null
                            ? "min-w-0 flex-1 truncate italic text-slate-500"
                            : "min-w-0 flex-1 truncate text-slate-700"
                        }
                      >
                        {branch.branchName}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-slate-800">
                        {money(branch.closingBalance, currency)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#F5C742]"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Recent transactions">
          {transactions.length === 0 ? (
            <EmptyRow>No transactions posted to this account.</EmptyRow>
          ) : (
            <table className="w-full text-[11px]" data-testid="ledger-transaction-table">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 pr-2 font-medium">Voucher</th>
                  <th className="py-1 px-1 text-right font-medium">Debit</th>
                  <th className="py-1 px-1 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, index) => (
                  <tr
                    key={txn.id ?? `${txn.voucherNo}-${index}`}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="whitespace-nowrap py-1.5 pr-2">{txn.transactionDate || DASH}</td>
                    <td className="max-w-[100px] truncate py-1.5 pr-2" title={txn.description || ""}>
                      {txn.voucherNo || DASH}
                    </td>
                    <td className="py-1.5 px-1 text-right tabular-nums">{amount(txn.debitAmount)}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums">
                      {amount(txn.creditAmount)}
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

export default LedgerDetailPanel;
