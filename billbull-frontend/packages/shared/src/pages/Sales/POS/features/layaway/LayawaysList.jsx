// Extracted verbatim from POSSales.jsx (the Layaways List drawer).
// Behaviour is unchanged; only the location moved. The layaway feature hook is still called in
// POSSales and every value below is passed down under its ORIGINAL POSSales name: 18 come
// straight from that hook's destructure, and setShowSaveLayaway is the one parent-owned POSSales
// setter this region always wrote to.
//
// All cross-feature orchestration - cart rebuild, customer selection, active-layaway bookkeeping
// and the POS data resync - stays inside the hook, behind startLayawayConversion and
// handleCancelLayaway, which this component treats as opaque callbacks.
//
// This component owns no state, no effects, no refs, and calls no hooks or APIs.

import React from 'react';
import { AlertTriangle, Archive, Pause, Plus, RefreshCw, RotateCcw, Search, X, XCircle, Zap } from 'lucide-react';

import { CurrencyAmount } from '../../POSCurrency';
import { STATUS_ENUM_TO_LABEL } from '../../posConstants';

function LayawaysList({
  showLayawaysList,
  setShowLayawaysList,
  layawaysFilterStatus,
  setLayawaysFilterStatus,
  layawaysFilterCustomer,
  setLayawaysFilterCustomer,
  layawaysFilterNo,
  setLayawaysFilterNo,
  selectedLayawayId,
  setSelectedLayawayId,
  layawaysList,
  layawaysLoading,
  layawaysError,
  selectedLayawayDetail,
  layawayBusyId,
  loadLayaways,
  startLayawayConversion,
  handleCancelLayaway,
  setShowSaveLayaway,
}) {
  if (!showLayawaysList) return null;
  /* REGION-VERBATIM-START */
        // Server filters the list; map entity rows to the view shape the table uses.
        const filtered = (layawaysList || []).map(l => {
          const eff = l.effectiveStatus || l.status;
          const created = l.createdAt ? new Date(l.createdAt) : null;
          return {
            id: l.layawayNumber,
            entityId: l.id,
            date: created ? created.toLocaleDateString() : '—',
            time: created ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            customer: l.customerName || l.customerCode || '—',
            cashier: l.cashierName || '—',
            items: (l.items || []).length,
            saleAmt: l.saleTotal || 0,
            deposit: l.depositAmount || 0,
            balance: l.balanceAmount || 0,
            due: l.dueDate || '—',
            status: STATUS_ENUM_TO_LABEL[eff] || eff,
            isOpen: eff === 'ACTIVE' || eff === 'PARTIALLY_PAID' || eff === 'READY_TO_CONVERT',
            hold: !!l.hold,
            raw: l,
          };
        });
        const selected = filtered.find(l => l.entityId === selectedLayawayId) || null;
        const statusColor = (s) => ({ Active: 'bg-green-100 text-green-700', 'Partially Paid': 'bg-blue-100 text-blue-700', 'Ready to Convert': 'bg-[#F5C742]/20 text-amber-700', 'Converted to Sale': 'bg-gray-100 text-gray-600', Cancelled: 'bg-red-100 text-red-600', Expired: 'bg-red-50 text-red-500' }[s] || 'bg-gray-100 text-gray-500');
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowLayawaysList(false)} />
            <div className="relative ml-auto w-full max-w-5xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Pause className="h-4 w-4 text-amber-500" /><span className="text-base font-semibold text-[#1E293B]">Layaways</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">View and manage all sales reserved using Save Layaway.</p>
                </div>
                <button onClick={() => setShowLayawaysList(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Filters */}
              <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Layaway No.</label><input value={layawaysFilterNo} onChange={e => setLayawaysFilterNo(e.target.value)} placeholder="LAY-..." className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Customer</label><input value={layawaysFilterCustomer} onChange={e => setLayawaysFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Status</label>
                  <select value={layawaysFilterStatus} onChange={e => setLayawaysFilterStatus(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                    {['All', 'Active', 'Partially Paid', 'Ready to Convert', 'Converted to Sale', 'Cancelled', 'Expired'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <button onClick={() => loadLayaways()} className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
                <button onClick={() => { setLayawaysFilterStatus('All'); setLayawaysFilterCustomer(''); setLayawaysFilterNo(''); setTimeout(loadLayaways, 0); }} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                <button onClick={() => { setShowLayawaysList(false); setShowSaveLayaway(true); }} className="mt-auto ml-auto bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Plus className="h-3 w-3" />New Layaway</button>
              </div>
              <div className="flex flex-col lg:flex-row flex-1 min-h-0">
                <div className={`flex flex-col w-full min-h-0 overflow-hidden ${selected ? 'lg:w-[55%] max-h-[50vh] lg:max-h-none' : 'lg:w-full'} lg:border-r border-b lg:border-b-0 border-[#327F74]/10`}>
                  <div className="overflow-auto flex-1">
                    {layawaysLoading ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><RefreshCw className="h-8 w-8 text-gray-300 mb-3 animate-spin" /><p className="text-sm text-gray-400">Loading layaways…</p></div>
                    ) : layawaysError ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><AlertTriangle className="h-8 w-8 text-red-300 mb-3" /><p className="text-sm text-red-500">{layawaysError}</p></div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><Archive className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">No layaways found.</p></div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-xs">
                        <thead className="sticky top-0 bg-[#F7F7FA] z-10 border-b border-[#327F74]/10">
                          <tr className="text-gray-500">{['Layaway No.', 'Date & Time', 'Customer', 'Cashier', 'Items', 'Sale Amt', 'Deposit', 'Balance', 'Due Date', 'Status', 'Action'].map((h, i) => <th key={i} className={`px-3 py-2 text-left font-medium ${i >= 4 && i <= 7 ? 'text-right' : ''} ${i === 10 ? 'text-center' : ''}`}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {filtered.map(l => (
                            <tr key={l.entityId} onClick={() => setSelectedLayawayId(l.entityId === selectedLayawayId ? null : l.entityId)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors ${l.status === 'Expired' ? 'bg-red-50/30' : ''} ${l.entityId === selectedLayawayId ? 'bg-[#FFF8DC] border-l-2 border-l-[#F5C742]' : 'hover:bg-white'}`}>
                              <td className="px-3 py-2 font-semibold text-[#1E293B] whitespace-nowrap">
                                {l.id}
                                {l.hold && <span className="ml-1.5 text-[9px] uppercase tracking-wide rounded px-1 py-0.5 bg-purple-100 text-purple-700">Hold</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.date}</td>
                              <td className="px-3 py-2 text-[#1E293B] max-w-[160px] truncate">{l.customer}</td>
                              <td className="px-3 py-2 text-gray-500">{l.cashier}</td>
                              <td className="px-3 py-2 text-right">{l.items}</td>
                              <td className="px-3 py-2 text-right font-semibold"><CurrencyAmount amount={l.saleAmt} /></td>
                              <td className="px-3 py-2 text-right text-green-700"><CurrencyAmount amount={l.deposit} /></td>
                              <td className="px-3 py-2 text-right text-red-600"><CurrencyAmount amount={l.balance} /></td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.due}</td>
                              <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(l.status)}`}>{l.status}</span></td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={e => { e.stopPropagation(); setSelectedLayawayId(l.entityId); }} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                                  {l.isOpen && <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-[10px] px-1.5 py-0.5 rounded" onClick={e => { e.stopPropagation(); startLayawayConversion(l.entityId); }}>Convert</button>}
                                  {l.isOpen && <button disabled={layawayBusyId === l.entityId} className="border border-red-300 text-red-600 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-40" onClick={e => { e.stopPropagation(); handleCancelLayaway(l.entityId); }}>{layawayBusyId === l.entityId ? '…' : 'Delete'}</button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                </div>
                {selected && (
                  <div className="w-full lg:w-[45%] flex flex-col bg-white overflow-hidden min-h-0">
                    <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                      <span className="text-xs font-semibold text-[#1E293B]">{selected.id}</span>
                      <button onClick={() => setSelectedLayawayId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="overflow-auto flex-1 p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {[['Customer', selected.customer], ['Cashier', selected.cashier], ['Sale Amount', <CurrencyAmount amount={selected.saleAmt} />], ['Deposit Paid', <CurrencyAmount amount={selected.deposit} />], ['Balance Due', <CurrencyAmount amount={selected.balance} />], ['Due Date', selected.due], ['Status', selected.status], ['Created', selected.date + ' ' + selected.time]].map(([k, v]) => (
                          <div key={k} className="flex gap-1"><span className="text-gray-400 w-24 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                        ))}
                      </div>
                      {selected.raw?.remarks && (
                        <div className="text-[11px] text-gray-500 bg-[#F7F7FA] rounded p-2"><span className="font-semibold text-[#1E293B]">Remarks: </span>{selected.raw.remarks}</div>
                      )}
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-xs font-semibold text-[#1E293B] mb-1">Reserved Items</p>
                        {(!selectedLayawayDetail || selectedLayawayDetail.id !== selected.entityId) ? (
                          <p className="text-[11px] text-gray-400 py-2">Loading items…</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400">{['Item', 'Qty', 'Rate', 'Amount'].map(h => <th key={h} className={`py-0.5 text-left ${h !== 'Item' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                            <tbody>
                              {(selectedLayawayDetail.items || []).map((it, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-1 text-[#1E293B]">{it.itemName}{it.pinnedBatchNumber && <span className="ml-1 text-[9px] text-amber-600">[{it.pinnedBatchNumber}]</span>}</td>
                                  <td className="py-1 text-right text-[#1E293B]">{it.quantity}</td>
                                  <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={it.price || 0} /></td>
                                  <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={(it.price || 0) * (it.quantity || 0) * (1 - (it.discount || 0) / 100)} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                      {selected.isOpen && <button onClick={() => startLayawayConversion(selected.entityId)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Zap className="h-3 w-3" />Convert to Sale</button>}
                      {selected.isOpen && <button disabled={layawayBusyId === selected.entityId} onClick={() => handleCancelLayaway(selected.entityId)} className="border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-50 flex items-center gap-1 disabled:opacity-40"><XCircle className="h-3 w-3" />{layawayBusyId === selected.entityId ? 'Cancelling…' : 'Cancel'}</button>}
                      {selected.raw?.convertedInvoiceNumber && <span className="text-[11px] text-gray-500 self-center">Converted → {selected.raw.convertedInvoiceNumber}</span>}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-2.5 flex justify-end shrink-0">
                <button onClick={() => setShowLayawaysList(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
  /* REGION-VERBATIM-END */
}

export default LayawaysList;
