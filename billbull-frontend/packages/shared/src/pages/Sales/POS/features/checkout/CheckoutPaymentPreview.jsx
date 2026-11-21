// Extracted verbatim from POSSales.jsx (checkout PAYMENT phase — the INNER content of the LEFT
// "Invoice Preview" column). Presentation only. The column <div> itself stays inline in POSSales so
// React keeps recycling it as the complete-phase card; the preview html, blob URLs, settling state
// and freeze ref are all owned by POSSales/useCheckout and arrive here as read values.
//
// The preview follows the paper the sale prints on (useCheckoutSheetPreview): a sheet paper
// (A4 / A5 / A5 Landscape / Pre-printed) sets showA4CheckoutPreview and passes its page box as
// sheetPageSize; a thermal paper passes 80mm or 58mm as thermalPaperSize. The defaults reproduce
// the original 80mm / A4-frame render. Known behaviour kept as-is: the A4 branch guards on
// checkoutA4Html but renders checkoutA4BlobUrl.

import React from 'react';
import { ShoppingCart } from 'lucide-react';

import { A4ScaledPreview, ThermalScaledPreview } from '../../POSPrintPreview';

function CheckoutPaymentPreview({
  showA4CheckoutPreview,
  checkoutA4Html,
  checkoutA4BlobUrl,
  checkoutPreviewBlobUrl,
  thermalPaperSize = '80mm',
  sheetPageSize,
}) {
  return (
              showA4CheckoutPreview ? (
                checkoutA4Html ? (
                  <A4ScaledPreview src={checkoutA4BlobUrl} fillWidth pageWidth={sheetPageSize?.width} pageHeight={sheetPageSize?.height} />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                    <ShoppingCart className="h-10 w-10 mb-2" />
                    <p className="text-xs">Add items to preview</p>
                  </div>
                )
              ) : checkoutPreviewBlobUrl ? (
                <ThermalScaledPreview src={checkoutPreviewBlobUrl} paperSize={thermalPaperSize} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-xs">Add items to preview</p>
                </div>
              )
  );
}

export default CheckoutPaymentPreview;
