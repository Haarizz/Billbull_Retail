// Extracted verbatim from POSSales.jsx (checkout PAYMENT phase — right-column scroll body, Remarks card).
// Presentation only. checkoutRemarks state is owned by useCheckout; POSSales passes the value and the
// raw setter through unchanged. Known behaviours kept as-is: remarks are not part of the checkout
// payload, and the label is not associated with the input.

import React from 'react';

function CheckoutRemarks({
  checkoutRemarks,
  setCheckoutRemarks,
}) {
  return (
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Remarks / Reference</label>
                    <input value={checkoutRemarks} onChange={e => setCheckoutRemarks(e.target.value)}
                      placeholder="Tap to enter note…"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />
                  </div>
  );
}

export default CheckoutRemarks;
