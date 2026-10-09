// Extracted verbatim from POSSales.jsx (checkout COMPLETE phase — summary body).
// Presentation only: Change Due, Accounts Receivable, Payment Summary and the Financial Details
// <details>. The complete-phase root, its guard, closeComplete, the paymentRows/usedMethods
// derivation, the action buttons and ReceiptShareModal all stay in POSSales.

import React from 'react';
import { Banknote, CreditCard, Landmark, User } from 'lucide-react';
import { DirhamSymbol } from '../../POSCurrency';

function CheckoutCompleteSummary({
  lastPaidInvoice,
  paymentRows,
  usedMethods,
  formatCurrencyStr,
}) {
  return (
                <div className="flex-1 overflow-y-auto">
                  {/* Change Due alert */}
                  {(lastPaidInvoice.changeAmount || 0) > 0 && (
                    <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Change Due</span>
                      <span className="text-lg font-black text-emerald-700">
                        <DirhamSymbol /> {(lastPaidInvoice.changeAmount || 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* 3. Accounts Receivable (Compact, aligned) */}
                  {((lastPaidInvoice.creditBalance || 0) > 0 || (lastPaidInvoice.creditUpdatedBalance || 0) > 0) && (
                    <div className="px-6 py-3 border-b border-gray-100">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Accounts Receivable</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600 font-medium">This Invoice</span>
                          <span className="font-bold text-[#1E293B]">
                            <DirhamSymbol /> {(lastPaidInvoice.creditBalance || 0).toFixed(2)}
                          </span>
                        </div>
                        {lastPaidInvoice.creditUpdatedBalance != null && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 font-medium">Customer Outstanding</span>
                            <span className="font-bold text-[#1E293B]">
                              <DirhamSymbol /> {lastPaidInvoice.creditUpdatedBalance.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Payment Summary (Compact) */}
                  {usedMethods.length > 0 && (
                    <div className="px-6 py-3 border-b border-gray-50">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Payment Summary</p>
                      <div className="space-y-1">
                        {usedMethods.map((row, i) => {
                          const lbl = String(row.label).toLowerCase();
                          let Icon = Banknote;
                          if (lbl.includes('card') || lbl.includes('mastercard') || lbl.includes('visa')) Icon = CreditCard;
                          else if (lbl.includes('online') || lbl.includes('bank') || lbl.includes('transfer')) Icon = Landmark;
                          else if (lbl.includes('credit')) Icon = User;

                          return (
                            <div key={`${row.label}-${i}`} className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2 text-gray-700 font-medium">
                                <Icon className="h-4 w-4 text-gray-400" />
                                <span>{row.label}</span>
                              </div>
                              <span className="font-bold text-[#1E293B]">
                                {formatCurrencyStr(row.amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 5. Financial Details (Scrollable when expanded) */}
                  <div className="px-6 py-3">
                    <details className="group rounded-lg bg-gray-50 transition-all">
                      <summary className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-500 uppercase cursor-pointer list-none select-none hover:bg-gray-100 rounded-lg">
                        <span className="group-open:hidden">▼ View Financial Details</span>
                        <span className="hidden group-open:inline">▲ Hide Financial Details</span>
                      </summary>
                      <div className="px-4 py-2 space-y-1.5 border-t border-gray-100 text-sm max-h-[220px] overflow-y-auto mt-1">
                        {lastPaidInvoice.paymentBlock && paymentRows.map((row, i) => (
                          <div key={`detail-${row.label}-${i}`} className="flex justify-between items-end gap-3">
                            <span className="text-gray-500">{row.label}</span>
                            <span className={`font-bold ${row.emphasis ? 'text-emerald-600' : 'text-[#1E293B]'}`}>
                              {formatCurrencyStr(row.amount)}
                            </span>
                          </div>
                        ))}
                        {lastPaidInvoice.paymentBlock?.hasReceivable && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Invoice Total</span>
                            <span className="font-bold text-[#1E293B]">{formatCurrencyStr(lastPaidInvoice.paymentBlock.invoiceTotal)}</span>
                          </div>
                        )}
                        <div className="h-px bg-gray-100 my-1"></div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Sale Amount</span>
                          <span className="font-bold text-[#1E293B]">{formatCurrencyStr(lastPaidInvoice.total)}</span>
                        </div>
                        {lastPaidInvoice.depositAmount > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Deposit Applied</span>
                            <span className="font-bold text-[#327F74]">−{formatCurrencyStr(lastPaidInvoice.depositAmount)}</span>
                          </div>
                        )}
                        {(lastPaidInvoice.creditBalance > 0 && lastPaidInvoice.creditUpdatedBalance != null) && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Customer Total Outstanding</span>
                            <span className="font-bold text-[#1E293B]">{formatCurrencyStr(lastPaidInvoice.creditUpdatedBalance)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Payment Mode</span>
                          <span className="font-bold text-[#1E293B]">{lastPaidInvoice.paymentMode}</span>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
  );
}

export default CheckoutCompleteSummary;
