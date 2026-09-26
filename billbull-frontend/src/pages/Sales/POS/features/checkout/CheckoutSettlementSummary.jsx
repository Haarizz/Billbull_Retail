// Extracted verbatim from POSSales.jsx (checkout PAYMENT phase — settlement summary card).
// Presentation only: Items Total, Shipping, Order Total, Deposit Paid and Balance Due Now /
// Total Payable. The `(depositAmt > 0 || shippingChargeNum > 0)` guard and the
// shippingChargeNum/grandTotal/depositAmt/effectiveDue derivation all stay in POSSales.

import React from 'react';
import { CurrencyAmount } from '../../POSCurrency';

function CheckoutSettlementSummary({
  itemsTotal,
  shippingChargeNum,
  grandTotal,
  depositAmt,
  effectiveDue,
}) {
  return (
                    <div className="bg-white rounded-2xl border border-[#F5C742]/50 p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Settlement Summary</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Items Total</span>
                          <span className="font-semibold text-[#1E293B]"><CurrencyAmount amount={itemsTotal} /></span>
                        </div>
                        {shippingChargeNum > 0 && (
                          <div className="flex justify-between text-gray-600">
                            <span>Shipping</span>
                            <span className="font-semibold text-[#1E293B]"><CurrencyAmount amount={shippingChargeNum} /></span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#1E293B] border-t border-gray-100 pt-1.5">
                          <span className="font-semibold">Order Total</span>
                          <span className="font-semibold"><CurrencyAmount amount={grandTotal} /></span>
                        </div>
                        {depositAmt > 0 && (
                          <div className="flex justify-between text-green-700">
                            <span>Deposit Paid</span>
                            <span className="font-semibold">− <CurrencyAmount amount={depositAmt} /></span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-[#1E293B]">
                          <span className="font-bold">{depositAmt > 0 ? 'Balance Due Now' : 'Total Payable'}</span>
                          <span className="font-black text-[#F5C742]"><CurrencyAmount amount={effectiveDue} /></span>
                        </div>
                      </div>
                    </div>
  );
}

export default CheckoutSettlementSummary;
