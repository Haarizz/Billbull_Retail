// Extracted verbatim from POSSales.jsx (checkout PAYMENT phase — right-column header bar).
// Presentation only: Checkout title, item count / invoice no caption, Balance Due / Total Amount
// figure and the header X. invoiceNo/depositAmt/effectiveDue/grandTotal are derived in POSSales;
// the X callback (setShowPaymentDialog(false) only) is supplied by POSSales.

import React from 'react';
import { CreditCard, X } from 'lucide-react';
import { CurrencyAmount } from '../../POSCurrency';

function CheckoutPaymentHeader({
  itemCount,
  invoiceNo,
  depositAmt,
  effectiveDue,
  grandTotal,
  onClose,
}) {
  return (
              <div className="bg-[#F5C742] px-3 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1E293B] flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-[#F5C742]" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base leading-none">Checkout</p>
                    <p className="text-[#1E293B]/60 text-[10px] mt-0.5">{itemCount} item{itemCount !== 1 ? 's' : ''}{invoiceNo ? ` · ${invoiceNo}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[#1E293B]/60 text-[10px]">{depositAmt > 0 ? 'Balance Due' : 'Total Amount'}</p>
                    <p className="text-white font-black text-2xl leading-none"><CurrencyAmount amount={depositAmt > 0 ? effectiveDue : grandTotal} /></p>
                  </div>
                  <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors">
                    <X className="h-5 w-5 text-[#1E293B]" />
                  </button>
                </div>
              </div>
  );
}

export default CheckoutPaymentHeader;
