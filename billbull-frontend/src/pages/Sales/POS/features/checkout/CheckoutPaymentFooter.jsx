// Extracted verbatim from POSSales.jsx (checkout PAYMENT phase — right-column settlement footer).
// Presentation only: Change Due, the checkoutError banner and the Cancel / Settle action row.
// canSettle and effectiveDue are derived in POSSales. The Cancel callback (close, clear error,
// cancelCheckoutTenders) and the zero-argument Settle callback (`() => processPayment()`) are
// supplied by POSSales; this component must never receive processPayment itself.

import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { DirhamSymbol } from '../../POSCurrency';

function CheckoutPaymentFooter({
  changeDue,
  checkoutError,
  canSettle,
  itemCount,
  checkoutLoading,
  effectiveDue,
  onCancel,
  onSettle,
}) {
  return (
              <div className="bg-white border-t-2 border-[#F5C742]/30 px-3 sm:px-5 py-4 shrink-0">
                {/* Change due — the only figure the cashier still needs at this point
                    (total/paid/remaining already live in the allocation panel above). */}
                {changeDue > 0 && (
                  <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Change Due</span>
                    <span className="text-lg font-black text-blue-700 tabular-nums">
                      <DirhamSymbol /> {changeDue.toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Error display */}
                {checkoutError && (
                  <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {checkoutError}
                  </div>
                )}
                {/* Action buttons */}
                {(() => {
                  const settleReady = canSettle && itemCount > 0 && !checkoutLoading;
                  return (
                    <div className="flex items-stretch gap-3">
                      <button type="button" onClick={onCancel}
                        aria-label="Cancel checkout"
                        className="flex-none w-28 sm:w-36 min-h-[64px] rounded-xl border-2 border-gray-300 bg-white text-gray-600 font-bold text-base transition-all duration-200 ease-out hover:bg-gray-100 hover:border-gray-400 hover:text-gray-800 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300 motion-reduce:transform-none">
                        Cancel
                      </button>
                      <button type="button" onClick={onSettle} disabled={!settleReady}
                        aria-label={`Settle payment of ${effectiveDue.toFixed(2)}`}
                        className={`flex-1 min-w-0 min-h-[64px] px-5 rounded-xl font-black flex items-center justify-center gap-3 transition-all duration-200 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F5C742]/60 motion-reduce:transform-none ${
                          settleReady
                            ? 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] shadow-lg shadow-[#F5C742]/30 hover:shadow-xl hover:shadow-[#F5C742]/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                        {checkoutLoading
                          ? <><div className="w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin shrink-0" /><span className="text-lg">Processing…</span></>
                          : <>
                              <CheckCircle className="h-6 w-6 shrink-0" />
                              <span className="text-base sm:text-lg truncate">Settle Payment</span>
                              {/* The amount sits in its own pill so it stays readable at a
                                  glance and never gets truncated with the label. */}
                              <span className={`shrink-0 rounded-lg px-3 py-1 text-lg sm:text-2xl tabular-nums ${settleReady ? 'bg-white/40' : 'bg-white/50'}`}>
                                <DirhamSymbol /> {effectiveDue.toFixed(2)}
                              </span>
                            </>
                        }
                      </button>
                    </div>
                  );
                })()}
              </div>
  );
}

export default CheckoutPaymentFooter;
