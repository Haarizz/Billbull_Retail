// Extracted verbatim from POSSales.jsx (checkout PAYMENT phase — the INNER content of the LEFT
// "Invoice Preview" column). Presentation only. The column <div> itself stays inline in POSSales so
// React keeps recycling it as the complete-phase card; the preview html, blob URLs, settling state
// and freeze ref are all owned by POSSales/useCheckout and arrive here as the four read values.
// Known behaviours kept as-is: showA4CheckoutPreview is hard-coded false upstream, and the dormant A4
// branch guards on checkoutA4Html but renders checkoutA4BlobUrl.

import React from 'react';
import { ShoppingCart } from 'lucide-react';

import { A4ScaledPreview, ThermalScaledPreview } from '../../POSPrintPreview';

function CheckoutPaymentPreview({
  showA4CheckoutPreview,
  checkoutA4Html,
  checkoutA4BlobUrl,
  checkoutPreviewBlobUrl,
}) {
  return (
              showA4CheckoutPreview ? (
                checkoutA4Html ? (
                  <A4ScaledPreview src={checkoutA4BlobUrl} fillWidth />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                    <ShoppingCart className="h-10 w-10 mb-2" />
                    <p className="text-xs">Add items to preview</p>
                  </div>
                )
              ) : checkoutPreviewBlobUrl ? (
                // User request: always use 80mm print preview in the checkout window.
                <ThermalScaledPreview src={checkoutPreviewBlobUrl} paperSize="80mm" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-xs">Add items to preview</p>
                </div>
              )
  );
}

export default CheckoutPaymentPreview;
