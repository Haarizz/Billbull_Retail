// Extracted verbatim from POSSales.jsx (the Serial / Batch Check modal).
// Behaviour is unchanged; only the location moved. All twelve Serial / Batch states and their setters
// stay in POSSales, and the parent keeps the `showSerialBatch &&` mount condition (the body never reads
// showSerialBatch, so it is not passed). currentTerminal/currentSession stay in usePosSession, and the
// three Service & Repair setters are the write-only handoff. Every value below is passed down under its
// ORIGINAL POSSales name.
//
// This component owns no state, no effects, no refs and calls no hooks. It keeps the region's four direct
// lookups (posBatchCheck, getProductsList, getSalesInvoicesPage, searchCustomersAllFields) exactly as they were.

import React from 'react';
import { AlertCircle, AlertTriangle, ChevronRight, FileText, Hash, Package, Printer, RotateCcw, Search, Shield, Wrench, X } from 'lucide-react';
import { posBatchCheck } from '../../../../../api/posApi';
import { getProductsList } from '../../../../../api/productsApi';
import { getSalesInvoicesPage } from '../../../../../api/salesInvoiceApi';
import { searchCustomersAllFields } from '../../../../../api/customerledgerApi';
import AsyncSearchableDropdown from '../../../../../components/AsyncSearchableDropdown';
import { CurrencyAmount } from '../../POSCurrency';

function SerialBatch({
  setShowSerialBatch,
  serialBatchQuery,
  setSerialBatchQuery,
  serialBatchResult,
  setSerialBatchResult,
  serialBatchSubView,
  setSerialBatchSubView,
  serialBatchReturnQty,
  setSerialBatchReturnQty,
  serialBatchReturnReason,
  setSerialBatchReturnReason,
  serialBatchReturnCondition,
  setSerialBatchReturnCondition,
  serialBatchRefundMethod,
  setSerialBatchRefundMethod,
  serialBatchInvoiceNo,
  setSerialBatchInvoiceNo,
  serialBatchItemCode,
  setSerialBatchItemCode,
  serialBatchCustomerMobile,
  setSerialBatchCustomerMobile,
  serialBatchSelectedItem,
  setSerialBatchSelectedItem,
  currentTerminal,
  currentSession,
  setShowServiceRepair,
  setServiceView,
  setServiceJobStep,
}) {
  // serialBatchResult: null | 'searching' | 'notfound' | { results, total }
  const results = serialBatchResult && typeof serialBatchResult === 'object' ? serialBatchResult.results || [] : [];
  const hasResults = results.length > 0;
  const selectedItem = serialBatchSelectedItem;
  const isConvert = serialBatchSubView === 'convert';
  const isService = serialBatchSubView === 'service';
  const doBatchSearch = async () => {
    const q = serialBatchQuery.trim();
    const inv = serialBatchInvoiceNo.trim();
    const ic = serialBatchItemCode.trim();
    const mob = serialBatchCustomerMobile.trim();
    if (!q && !inv && !ic && !mob) { setSerialBatchResult('notfound'); return; }
    setSerialBatchResult('searching');
    setSerialBatchSelectedItem(null);
    try {
      const res = await posBatchCheck({ batchNumber: q, invoiceNumber: inv, itemCode: ic, customerMobile: mob });
      setSerialBatchResult(res.total > 0 ? res : 'notfound');
    } catch { setSerialBatchResult('notfound'); }
  };
  const resetBatchSearch = () => {
    setSerialBatchQuery(''); setSerialBatchInvoiceNo(''); setSerialBatchItemCode('');
    setSerialBatchCustomerMobile(''); setSerialBatchResult(null); setSerialBatchSelectedItem(null);
  };
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowSerialBatch(false)} />
      <div className="relative ml-auto w-full max-w-3xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              {isConvert && <button onClick={() => setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
              {isService && <button onClick={() => setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
              <Hash className="h-4 w-4 text-teal-600" />
              <span className="text-base font-semibold text-[#1E293B]">{isConvert ? 'Convert to Return' : isService ? 'Create Service Job' : 'Serial / Batch Check'}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{isConvert ? 'Process return for this serial/batch item.' : isService ? 'Create a service repair job for this item.' : 'Search sold batch or serial items, view invoice details, and convert eligible items to return.'}</p>
          </div>
          <button onClick={() => setShowSerialBatch(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        {/* ── CHECK VIEW ── */}
        {!isConvert && !isService && (
          <>
            {/* Search */}
            <div className="bg-white border-b border-gray-100 px-5 py-3 space-y-2 shrink-0">
              <AsyncSearchableDropdown
                value={null}
                inputValue={serialBatchQuery}
                onInputChange={setSerialBatchQuery}
                placeholder="Scan or search batch number..."
                fetchOptions={async (query) => {
                  if (!query) return [];
                  try {
                    const res = await posBatchCheck({ batchNumber: query, invoiceNumber: serialBatchInvoiceNo, itemCode: serialBatchItemCode, customerMobile: serialBatchCustomerMobile });
                    if (res && res.results) {
                      return res.results;
                    }
                  } catch { return []; }
                  return [];
                }}
                renderOption={(opt, active) => (
                  <div className="flex justify-between items-center p-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-bold text-sm text-[#1E293B]">{opt.batchNumber}</p>
                      <p className="text-xs text-gray-500">{opt.itemName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xs text-gray-700">Inv: {opt.invoiceNumber}</p>
                      <p className="text-[10px] text-gray-400">Qty: {opt.soldQty}</p>
                    </div>
                  </div>
                )}
                onSelect={(opt) => {
                  if (opt) {
                    setSerialBatchQuery(opt.batchNumber || '');
                    if (opt.invoiceNumber) setSerialBatchInvoiceNo(opt.invoiceNumber);
                    if (opt.itemCode) setSerialBatchItemCode(opt.itemCode);
                    setTimeout(() => doBatchSearch(), 50);
                  }
                }}
                className="w-full text-sm"
                debounceMs={400}
              />
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[140px]">
                  <AsyncSearchableDropdown
                    value={null}
                    inputValue={serialBatchItemCode}
                    onInputChange={setSerialBatchItemCode}
                    placeholder="Item code / barcode"
                    fetchOptions={async (query) => {
                      if (!query) return [];
                      try {
                        const posBranchId = currentTerminal?.branchId || currentSession?.branchId;
                        const res = await getProductsList(0, 5, query, undefined, null, null, null, true, posBranchId);
                        return res?.content || [];
                      } catch { return []; }
                    }}
                    renderOption={(opt) => (
                      <div className="flex flex-col py-1">
                        <span className="font-medium text-xs">{opt.itemName}</span>
                        <span className="text-[10px] text-gray-500">{opt.itemCode} {opt.barcode ? `| ${opt.barcode}` : ''}</span>
                      </div>
                    )}
                    onSelect={(opt) => {
                      if (opt) {
                        setSerialBatchItemCode(opt.itemCode || opt.barcode || '');
                        setTimeout(() => doBatchSearch(), 50);
                      }
                    }}
                    className="w-full text-xs"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <AsyncSearchableDropdown
                    value={null}
                    inputValue={serialBatchInvoiceNo}
                    onInputChange={setSerialBatchInvoiceNo}
                    placeholder="Invoice number"
                    fetchOptions={async (query) => {
                      if (!query) return [];
                      try {
                        const res = await getSalesInvoicesPage({ search: query, size: 5 });
                        return res?.content || [];
                      } catch { return []; }
                    }}
                    renderOption={(opt) => (
                      <div className="flex justify-between py-1">
                        <span className="font-medium text-xs">{opt.invoiceNumber}</span>
                        <span className="text-[10px] text-gray-500">{opt.customerName || 'Walk-in'}</span>
                      </div>
                    )}
                    onSelect={(opt) => {
                      if (opt) {
                        setSerialBatchInvoiceNo(opt.invoiceNumber || '');
                        setTimeout(() => doBatchSearch(), 50);
                      }
                    }}
                    className="w-full text-xs"
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <AsyncSearchableDropdown
                    value={null}
                    inputValue={serialBatchCustomerMobile}
                    onInputChange={setSerialBatchCustomerMobile}
                    placeholder="Customer mobile"
                    fetchOptions={async (query) => {
                      if (!query) return [];
                      try {
                        const res = await searchCustomersAllFields(query);
                        return res || [];
                      } catch { return []; }
                    }}
                    renderOption={(opt) => (
                      <div className="flex flex-col py-1">
                        <span className="font-medium text-xs">{opt.name}</span>
                        <span className="text-[10px] text-gray-500">{opt.mobile || opt.email || ''}</span>
                      </div>
                    )}
                    onSelect={(opt) => {
                      if (opt) {
                        setSerialBatchCustomerMobile(opt.mobile || opt.name || '');
                        setTimeout(() => doBatchSearch(), 50);
                      }
                    }}
                    className="w-full text-xs"
                  />
                </div>
                <button onClick={doBatchSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 shrink-0"><Search className="h-3 w-3" />Search</button>
                <button onClick={resetBatchSearch} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1 shrink-0"><RotateCcw className="h-3 w-3" />Reset</button>
              </div>
            </div>
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
              {/* Results list */}
              <div className={`flex flex-col w-full min-h-0 overflow-hidden ${selectedItem ? 'lg:w-[45%] max-h-[50vh] lg:max-h-none border-b lg:border-b-0 lg:border-r border-[#327F74]/10' : 'lg:w-full'}`}>
                <div className="overflow-auto flex-1 p-5">
                  {serialBatchResult === null && (
                    <div className="flex flex-col items-center justify-center h-48 text-center"><Hash className="h-12 w-12 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Scan or enter a batch number or invoice to search sold items.</p></div>
                  )}
                  {serialBatchResult === 'searching' && (
                    <div className="flex flex-col items-center justify-center h-48 text-center"><div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm text-gray-400">Searching...</p></div>
                  )}
                  {serialBatchResult === 'notfound' && (
                    <div className="flex flex-col items-center justify-center h-48 text-center"><AlertCircle className="h-12 w-12 text-gray-300 mb-3" /><p className="text-sm text-gray-500">No sold batch item found.</p><p className="text-xs text-gray-400 mt-1">Try searching by invoice number or item code.</p></div>
                  )}
                  {hasResults && (
                    <div className="space-y-2">
                      {results.map((item, i) => (
                        <div key={i} onClick={() => setSerialBatchSelectedItem(item)}
                          className={`bg-white border rounded-lg p-3 shadow-sm cursor-pointer transition-colors ${selectedItem === item ? 'border-[#327F74] bg-[#F0FAF8]' : 'border-[#327F74]/20 hover:border-[#327F74]/50'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[#1E293B] text-sm truncate">{item.itemName}</p>
                              <p className="text-xs text-gray-500">{item.itemCode}{item.batchNumber ? ` · ${item.batchNumber}` : ''}</p>
                            </div>
                            <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 shrink-0">{item.status}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-xs">
                            <div><span className="text-gray-400">Invoice: </span><span className="text-[#1E293B]">{item.invoiceNumber}</span></div>
                            <div><span className="text-gray-400">Date: </span><span className="text-[#1E293B]">{fmtDate(item.invoiceDate)}</span></div>
                            <div><span className="text-gray-400">Customer: </span><span className="text-[#1E293B]">{item.customerName || '—'}</span></div>
                            <div><span className="text-gray-400">Qty: </span><span className="text-[#1E293B]">{item.soldQty}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Detail panel */}
              {selectedItem && (
                <div className="flex-1 flex flex-col bg-white overflow-hidden min-h-0">
                  <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                    <span className="text-xs font-semibold text-[#1E293B]">{selectedItem.itemName}</span>
                    <button onClick={() => setSerialBatchSelectedItem(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="overflow-auto flex-1 p-4 space-y-3">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                      <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><Package className="h-3.5 w-3.5 text-[#327F74]" />Item Details</p>
                      <div className="space-y-0.5 text-xs">
                        {[['Item Code', selectedItem.itemCode || '—'], ['Batch No.', selectedItem.batchNumber || '—'], ['Expiry', fmtDate(selectedItem.expiryDate)], ['Sold Qty', selectedItem.soldQty]].map(([k, v]) => (
                          <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                      <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-[#327F74]" />Invoice Details</p>
                      <div className="space-y-0.5 text-xs">
                        {[['Invoice No.', selectedItem.invoiceNumber], ['Date', fmtDateTime(selectedItem.invoiceCreatedAt || selectedItem.invoiceDate)], ['Customer', selectedItem.customerName || '—'], ['Cashier', selectedItem.cashierName || '—'], ['Branch', selectedItem.branchName || '—'], ['Payment', selectedItem.paymentMode || '—'], ['Item Net', <CurrencyAmount amount={selectedItem.itemNetAmount || 0} />], ['VAT', <CurrencyAmount amount={selectedItem.itemTaxAmount || 0} />]].map(([k, v]) => (
                          <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                    <button onClick={() => setSerialBatchSubView('convert')} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><RotateCcw className="h-3 w-3" />Convert to Return</button>
                    <button onClick={() => setSerialBatchSubView('service')} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Wrench className="h-3 w-3" />Create Service Job</button>
                  </div>
                </div>
              )}
            </div>
            {!selectedItem && (
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                <button onClick={() => setShowSerialBatch(false)} className="border border-gray-300 text-gray-500 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            )}
          </>
        )}

        {/* ── CONVERT TO RETURN VIEW ── */}
        {isConvert && (
          <>
            <div className="overflow-auto flex-1 p-5 space-y-4">
              <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                <p className="text-sm font-semibold text-[#1E293B] mb-2">Original Invoice &amp; Item</p>
                {[
                  ['Original Invoice', selectedItem?.invoiceNumber || '—'],
                  ['Invoice Date', selectedItem ? fmtDateTime(selectedItem.invoiceCreatedAt || selectedItem.invoiceDate) : '—'],
                  ['Customer', selectedItem?.customerName || '—'],
                  ['Item', selectedItem?.itemName || '—'],
                  ['Item Code', selectedItem?.itemCode || '—'],
                  ['Batch No.', selectedItem?.batchNumber || '—'],
                  ['Sold Qty', selectedItem?.soldQty ?? '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-36 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                ))}
              </div>
              <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                <p className="text-sm font-semibold text-[#1E293B]">Return Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Return Quantity (max: {selectedItem?.soldQty ?? 1})</label>
                    <input type="number" min={1} max={selectedItem?.soldQty ?? 1} value={serialBatchReturnQty} onChange={e => setSerialBatchReturnQty(Math.min(selectedItem?.soldQty ?? 1, Math.max(1, parseInt(e.target.value) || 1)))} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Return Reason</label>
                    <select value={serialBatchReturnReason} onChange={e => setSerialBatchReturnReason(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option value="">Select reason…</option>
                      {['Damaged', 'Wrong item', 'Customer changed mind', 'Warranty claim', 'Defective item', 'Expired item', 'Other'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Return Condition</label>
                    <select value={serialBatchReturnCondition} onChange={e => setSerialBatchReturnCondition(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option value="">Select condition…</option>
                      {['Resalable', 'Damaged', 'Defective', 'Warranty claim', 'Scrap', 'Needs service inspection'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Refund Method</label>
                    <select value={serialBatchRefundMethod} onChange={e => setSerialBatchRefundMethod(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['Cash Back', 'Card Refund', 'Credit Voucher', 'Customer Credit Balance', 'Exchange Adjustment'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                {serialBatchReturnCondition === 'Needs service inspection' && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Item condition requires service inspection. Consider creating a Service Job instead of direct refund.
                    <button onClick={() => setSerialBatchSubView('service')} className="ml-auto text-[#327F74] underline whitespace-nowrap">Create Service Job</button>
                  </div>
                )}
              </div>
              <div className="bg-[#FFF8DC] border border-[#F5C742]/40 rounded-lg p-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">Refund Amount (incl. VAT reversal):</span>
                <span className="font-bold text-[#1E293B]"><CurrencyAmount amount={((selectedItem?.itemNetAmount || 0) / (selectedItem?.soldQty || 1)) * serialBatchReturnQty} /></span>
              </div>
            </div>
            <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
              <button onClick={() => setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
              <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Confirm Return</button>
              <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Confirm &amp; Print</button>
            </div>
          </>
        )}

        {/* ── CREATE SERVICE JOB VIEW ── */}
        {isService && (
          <>
            <div className="overflow-auto flex-1 p-5 space-y-3">
              <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                <p className="text-sm font-semibold text-[#1E293B] mb-1">Pre-filled from Batch Check</p>
                {[
                  ['Customer', selectedItem?.customerName || '—'],
                  ['Item', selectedItem?.itemName || '—'],
                  ['Batch No.', selectedItem?.batchNumber || '—'],
                  ['Invoice Ref', selectedItem?.invoiceNumber || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                ))}
              </div>
              <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                <p className="text-sm font-semibold text-[#1E293B]">Problem Details</p>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Customer Reported Problem</label>
                  <textarea placeholder="Describe the issue reported by customer..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Problem Category</label>
                    <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option>Select…</option>
                      {['Display issue', 'Battery issue', 'Charging issue', 'Software issue', 'Speaker/mic issue', 'Network issue', 'Camera issue', 'Physical damage', 'Water damage', 'Other'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Service Priority</label>
                    <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option>Normal</option><option>Urgent</option><option>High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Expected Delivery Date</label>
                    <input type="date" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Assign Technician</label>
                    <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option>Select Technician</option>
                      {['Mohammed Al-Rashid', 'Rajan Kumar', 'Ali Hassan'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded p-3 flex items-start gap-2 text-xs text-green-700">
                <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Item is Under Warranty. This repair may be eligible for free service. Warranty coverage will be verified by the technician.
              </div>
            </div>
            <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
              <button onClick={() => setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Create Service Job</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SerialBatch;
