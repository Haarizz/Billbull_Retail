// Extracted verbatim from POSSales.jsx (Live Session Quick View dialog).
// Behaviour is unchanged; only the location moved. The dialog/X-Report/tick state, loadXReport and
// the dashboard tile all stay in POSSales. onRefresh is loadXReport passed by reference, so the click
// event still arrives as `markGenerated` (generated X-Report path) — do not wrap it.
// The figures are computed inline on every render, exactly as before; keep this component unmemoised.

import React from 'react';
import { Activity, FileText, RefreshCw, X } from 'lucide-react';
import { Dialog, DialogContent } from '../../../../../components/ui/dialog';
import { CurrencyAmount } from '../../POSCurrency';
import { parseUTCDate } from '../../lib/posFormatting';

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
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
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

            const rows = [
              { label: "Today's Sales", value: <CurrencyAmount amount={totalSales} />, accent: '#327F74' },
              { label: 'Transactions', value: txCount, accent: '#6366F1' },
              { label: 'Cash Sales', value: <CurrencyAmount amount={cashSales} />, accent: '#1E293B' },
              { label: 'Card Sales', value: <CurrencyAmount amount={cardSales} />, accent: '#1E293B' },
              { label: 'Wallet Sales', value: <CurrencyAmount amount={walletSales} />, accent: '#1E293B' },
              { label: 'Opening Cash', value: <CurrencyAmount amount={openingCash} />, accent: '#1E293B' },
              { label: 'Cash Drop In', value: <CurrencyAmount amount={dropIn} />, accent: '#327F74' },
              { label: 'Cash Out', value: dropOut > 0 ? <>(<CurrencyAmount amount={dropOut} />)</> : <CurrencyAmount amount={0} />, accent: '#EF4444' },
              { label: 'Expected Cash in Drawer', value: <CurrencyAmount amount={expectedCash} />, accent: '#F5C742' },
            ];

            return (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#F5C742]/15">
                        <Activity className="h-5 w-5 text-[#b8920e]" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-[#1E293B]">Live Session</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {sess?.id ? `Session #${sess.id}` : 'Current session'} · {duration} elapsed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={onRefresh} disabled={xReportLoading} title="Refresh"
                        className="text-gray-400 hover:text-[#327F74] transition-colors mt-0.5 disabled:opacity-40">
                        <RefreshCw className={`h-4 w-4 ${xReportLoading ? 'animate-spin' : ''}`} />
                      </button>
                      <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4">
                    <p>Cashier: <span className="text-[#1E293B] font-medium">{sess?.openedBy || '—'}</span></p>
                    <p>Terminal: <span className="text-[#1E293B] font-medium">{sess?.terminalId || currentTerminal?.terminalId || '—'}</span></p>
                  </div>
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                    {rows.map(row => (
                      <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">{row.label}</span>
                        <span className="text-sm font-bold" style={{ color: row.accent }}>
                          {loading ? <span className="inline-block h-4 w-16 bg-gray-200 rounded animate-pulse" /> : row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-6 pb-6 flex items-center justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={onOpenFullXReport}
                    className="h-10 px-6 text-sm font-semibold rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] flex items-center gap-2 transition-colors"
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
