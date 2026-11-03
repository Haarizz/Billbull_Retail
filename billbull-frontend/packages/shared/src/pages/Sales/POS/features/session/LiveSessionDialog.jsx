// Live Session quick view (dashboard tile popup). The dialog/X-Report/tick state, loadXReport and
// the dashboard tile all stay in POSSales. onRefresh is loadXReport passed by reference, so the click
// event still arrives as `markGenerated` (generated X-Report path) — do not wrap it.
// The figures are computed inline on every render; keep this component unmemoised.

import React from 'react';
import { Activity, Banknote, CreditCard, FileText, Monitor, RefreshCw, User, Wallet, X } from 'lucide-react';
import { Dialog, DialogContent } from '../../../../../components/ui/dialog';
import { CurrencyAmount } from '../../POSCurrency';
import { parseUTCDate } from '../../lib/posFormatting';

const Skeleton = ({ className = 'h-4 w-16' }) => (
  <span className={`inline-block ${className} bg-gray-200 rounded animate-pulse align-middle`} />
);

function LiveSessionDialog({
  open,
  onOpenChange,
  xReportData,
  xReportLoading,
  currentSession,
  currentTerminal,
  sessionNowMs,
  onRefresh,
  onClose,
  onOpenFullXReport,
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          {(() => {
            const xSummary = xReportData?.summary || {};
            const sess = xReportData?.session || currentSession;
            const totalSales = Number(xSummary.totalSales ?? 0);
            const txCount = Number(xSummary.invoiceCount ?? 0);
            const openingCash = Number(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
            const cashSales = Number(xSummary.cashSales ?? 0);
            const cardSales = Number(xSummary.cardSales ?? 0);
            const walletSales = Number(xSummary.walletSales ?? 0);
            const dropIn = Number(xSummary.cashDropIn ?? 0);
            const dropOut = Number(xSummary.cashDropOut ?? 0);
            const expectedCash = Number(xSummary.expectedCash ?? 0);
            const sessionStart = sess?.openedAt ? parseUTCDate(sess.openedAt) : (sess?.startTime ? parseUTCDate(sess.startTime) : null);
            const diffMin = sessionStart ? Math.floor((sessionNowMs - sessionStart.getTime()) / 60000) : 0;
            const durH = Math.floor(diffMin / 60);
            const durM = diffMin % 60;
            const duration = sessionStart ? (durH > 0 ? `${durH}h ${durM}m` : `${durM}m`) : '—';
            const loading = xReportLoading || xReportData === null;

            const avgSale = txCount > 0 && Number.isFinite(totalSales / txCount) ? totalSales / txCount : null;
            const tenders = [
              { label: 'Cash', figure: 'Cash Sales', amount: cashSales, color: '#327F74', Icon: Banknote },
              { label: 'Card', figure: 'Card Sales', amount: cardSales, color: '#6366F1', Icon: CreditCard },
              { label: 'Wallet', figure: 'Wallet Sales', amount: walletSales, color: '#E0A80D', Icon: Wallet },
            ];
            const tenderTotal = tenders.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
            const share = (amount) => (tenderTotal > 0 && amount > 0 ? (amount / tenderTotal) * 100 : 0);

            const drawerLines = [
              { label: 'Opening Cash', sign: '', amount: openingCash, tone: 'text-[#1E293B]' },
              { label: 'Cash Sales', figure: 'Drawer Cash Sales', sign: '+', amount: cashSales, tone: 'text-[#327F74]' },
              { label: 'Cash Drop In', sign: '+', amount: dropIn, tone: 'text-[#327F74]' },
              { label: 'Cash Out', sign: '−', amount: dropOut > 0 ? dropOut : 0, tone: 'text-red-500' },
            ];

            const figure = (name, value, skeleton) => (
              <span data-figure={name}>{loading ? <Skeleton className={skeleton} /> : value}</span>
            );

            return (
              <>
                <div className="px-6 pt-5 pb-4 bg-gradient-to-b from-[#FFF8E7] to-white border-b border-[#FDE6A9]/70">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 shrink-0 rounded-xl bg-[#F5C742] flex items-center justify-center shadow-sm">
                        <Activity className="h-5 w-5 text-[#1E293B]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-[#1E293B] leading-tight">Live Session</h2>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-700">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            </span>
                            LIVE
                          </span>
                        </div>
                        <p data-session-line="" className="text-xs text-gray-500 mt-1">
                          {sess?.id ? `Session #${sess.id}` : 'Current session'} · {duration} elapsed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={onRefresh} disabled={xReportLoading} title="Refresh" type="button" aria-label="Refresh figures"
                        className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-500 hover:text-[#327F74] hover:bg-white transition-colors disabled:opacity-40">
                        <RefreshCw className={`h-4 w-4 ${xReportLoading ? 'animate-spin' : ''}`} />
                      </button>
                      <button onClick={onClose} type="button" aria-label="Close live session"
                        className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white transition-colors">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-2.5 py-1 text-gray-500">
                      <User className="h-3.5 w-3.5" />
                      Cashier <span data-info="cashier" className="font-semibold text-[#1E293B]">{sess?.openedBy || '—'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-2.5 py-1 text-gray-500">
                      <Monitor className="h-3.5 w-3.5" />
                      Terminal <span data-info="terminal" className="font-semibold text-[#1E293B]">{sess?.terminalId || currentTerminal?.terminalId || '—'}</span>
                    </span>
                  </div>
                </div>

                <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                  {/* Sales hero */}
                  <div className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Today&apos;s Sales</p>
                      <p className="mt-1 text-3xl font-extrabold text-[#327F74] tabular-nums">
                        {figure("Today's Sales", <CurrencyAmount amount={totalSales} />, 'h-8 w-36')}
                      </p>
                    </div>
                    <div className="text-right border-l border-gray-100 pl-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Transactions</p>
                      <p className="mt-1 text-3xl font-extrabold text-[#1E293B] tabular-nums">
                        {figure('Transactions', txCount, 'h-8 w-10')}
                      </p>
                      {!loading && avgSale !== null && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Avg <CurrencyAmount amount={avgSale} />
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Payment mix */}
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Payment mix</p>
                    <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden flex" aria-hidden="true">
                      {!loading && tenders.map((t) => (
                        <div key={t.label} style={{ width: `${share(t.amount)}%`, backgroundColor: t.color }} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      {tenders.map(({ label, figure: name, amount, color, Icon }) => (
                        <div key={label} className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Icon className="h-3.5 w-3.5" style={{ color }} />
                            {label}
                            {!loading && tenderTotal > 0 && (
                              <span className="ml-auto text-[10px] font-semibold text-gray-400">{Math.round(share(amount))}%</span>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-bold text-[#1E293B] tabular-nums truncate">
                            {figure(name, <CurrencyAmount amount={amount} />)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cash drawer */}
                  <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    <p className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cash drawer</p>
                    <div className="px-4 pb-2">
                      {drawerLines.map((line) => (
                        <div key={line.label} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-gray-600">{line.label}</span>
                          <span className={`font-semibold tabular-nums ${line.tone}`}>
                            {line.sign && !loading && <span className="mr-1">{line.sign}</span>}
                            {figure(line.figure || line.label, <CurrencyAmount amount={line.amount} />)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between bg-[#1E293B] px-4 py-3">
                      <span className="text-sm font-medium text-white/80">Expected Cash in Drawer</span>
                      <span className="text-lg font-extrabold text-[#F5C742] tabular-nums">
                        {figure('Expected Cash in Drawer', <CurrencyAmount amount={expectedCash} />, 'h-5 w-24')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-end gap-3">
                  <button
                    onClick={onClose}
                    type="button"
                    className="h-10 px-5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={onOpenFullXReport}
                    type="button"
                    className="h-10 px-6 text-sm font-semibold rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] flex items-center gap-2 transition-colors shadow-sm"
                  >
                    <FileText className="h-4 w-4" />
                    Full X-Report
                  </button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
  );
}

export default LiveSessionDialog;
