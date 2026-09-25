// Extracted verbatim from POSSales.jsx (the Credit Balance / Advance Check modal).
// Behaviour is unchanged; only the location moved. The three pieces of state (showCreditBalance,
// creditBalanceQuery, creditBalanceResult) and the auto-load effect stay in POSSales, and the
// parent keeps the `showCreditBalance &&` mount condition. Every value below is passed down under
// its ORIGINAL POSSales name.
//
// This component owns no state, no effects, no refs, and calls no hooks. It calls
// posCreditBalance directly, exactly as the inline region did.

import React from 'react';
import { AlertCircle, Star, X } from 'lucide-react';

import { posCreditBalance } from '../../../../../api/posApi';
import CustomerPicker from '../../CustomerPicker';
import { CurrencyAmount } from '../../POSCurrency';
import { toNumber } from '../../posUtils';

function CreditBalance({
  showCreditBalance,
  setShowCreditBalance,
  creditBalanceQuery,
  setCreditBalanceQuery,
  creditBalanceResult,
  setCreditBalanceResult,
  posCustomers,
}) {
  // creditBalanceResult: null | 'searching' | 'notfound' | { found, customer, outstanding, creditLimit, advanceBalance }
  const data = creditBalanceResult && typeof creditBalanceResult === 'object' && creditBalanceResult.found ? creditBalanceResult : null;
  const doCreditSearch = async () => {
    const q = creditBalanceQuery.trim();
    if (!q) { setCreditBalanceResult('notfound'); return; }
    setCreditBalanceResult('searching');
    try {
      const res = await posCreditBalance(q);
      setCreditBalanceResult(res.found ? res : 'notfound');
    } catch { setCreditBalanceResult('notfound'); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreditBalance(false)} />
      <div className="relative bg-[#F7F7FA] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2"><Star className="h-4 w-4 text-violet-600" /><span className="text-base font-semibold text-[#1E293B]">Credit Balance / Advance Check</span></div>
            <p className="text-xs text-gray-500 mt-0.5">Search customer to view outstanding balance, credit limit, and advance (deposit) balance.</p>
          </div>
          <button onClick={() => setShowCreditBalance(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex gap-2 shrink-0 overflow-visible">
          <div className="flex-1">
            <CustomerPicker
              customers={posCustomers}
              value={creditBalanceQuery}
              onChange={async (customerId) => {
                setCreditBalanceQuery(customerId || '');
                if (!customerId) {
                  setCreditBalanceResult(null);
                  return;
                }
                const c = posCustomers.find(x => x.id === customerId);
                if (!c) return;
                setCreditBalanceResult('searching');
                try {
                  const res = await posCreditBalance(c.code || c.mobile || String(customerId));
                  setCreditBalanceResult(res.found ? res : 'notfound');
                } catch { setCreditBalanceResult('notfound'); }
              }}
              placeholder="Search or select customer..."
            />
          </div>
          <button onClick={() => { setCreditBalanceQuery(''); setCreditBalanceResult(null); }} className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50">Clear</button>
        </div>
        <div className="overflow-auto flex-1 p-5">
          {creditBalanceResult === null && <div className="flex flex-col items-center justify-center h-40 text-center"><Star className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Search customer to check balance.</p></div>}
          {creditBalanceResult === 'searching' && <div className="flex flex-col items-center justify-center h-40 text-center"><div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm text-gray-400">Searching...</p></div>}
          {creditBalanceResult === 'notfound' && <div className="flex flex-col items-center justify-center h-40 text-center"><AlertCircle className="h-10 w-10 text-gray-300 mb-3" /><p className="text-sm text-gray-500">No customer found for the scanned card.</p></div>}
          {data && (
            <div className="space-y-4">
              {/* Customer Card */}
              <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-[#1E293B]">{data.customer.name}</p>
                    <p className="text-xs text-gray-500">{data.customer.code}</p>
                  </div>
                  <span className={`text-xs rounded px-2 py-0.5 ${data.customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{data.customer.status || '—'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {[['Mobile', data.customer.mobile || '—'], ['Email', data.customer.email || '—'], ['Type', data.customer.groupType || '—']].map(([k, v]) => (
                    <div key={k}><span className="text-gray-400">{k}:</span><span className="ml-1 text-[#1E293B]">{v}</span></div>
                  ))}
                </div>
              </div>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: 'Outstanding', val: <CurrencyAmount amount={toNumber(data.outstanding, 0)} />, sub: 'unpaid invoices', color: 'text-red-600' },
                  { label: 'Credit Limit', val: <CurrencyAmount amount={toNumber(data.creditLimit, 0)} />, sub: 'approved limit', color: 'text-[#327F74]' },
                  { label: 'Advance Balance', val: <CurrencyAmount amount={toNumber(data.advanceBalance, 0)} />, sub: 'available deposit', color: 'text-violet-600' },
                ].map(k => (
                  <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg p-4 text-center shadow-sm">
                    <p className="text-[11px] text-gray-400 mb-1">{k.label}</p>
                    <p className={`text-lg font-bold ${k.color}`}>{k.val}</p>
                    <p className="text-[10px] text-gray-400">{k.sub}</p>
                  </div>
                ))}
              </div>
              {/* Credit limit utilisation bar */}
              {toNumber(data.creditLimit, 0) > 0 && (() => {
                const pct = Math.min(100, (toNumber(data.outstanding, 0) / toNumber(data.creditLimit, 0)) * 100);
                const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[#327F74]';
                return (
                  <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Credit utilisation</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
          <button onClick={() => setShowCreditBalance(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

export default CreditBalance;
