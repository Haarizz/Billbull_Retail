// Checkout error dialog. A refused or failed settlement used to show as a one-line red strip
// above the Settle button, easy to miss and cut short. This shows the full message in a modal
// the cashier has to acknowledge. Purely presentational: the message is useCheckout's
// checkoutError, and dismissing only clears it — the checkout, cart and payment lines stay.

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { usePosInputV2, usePosOverlay } from '../../input/PosOverlayContext';
import { POS_SCOPES } from '../../input/posScope';

function CheckoutErrorDialog({ message, onDismiss }) {
  const open = typeof message === 'string' && message.length > 0;
  const okRef = useRef(null);

  // MODAL scope sits above CHECKOUT, so Ctrl+Enter cannot settle behind the dialog and Esc
  // closes the dialog rather than the checkout. posInputV2 delivers Esc through this
  // registration; otherwise the legacy listener below does.
  const posInputV2 = usePosInputV2();
  usePosOverlay({ open, scope: POS_SCOPES.MODAL, onEscape: () => onDismiss?.() });
  useEffect(() => {
    if (!open || posInputV2) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, posInputV2, onDismiss]);

  // Land on OK so Enter acknowledges the message.
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => okRef.current?.focus?.(), 30);
    return () => window.clearTimeout(timer);
  }, [open, message]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      data-testid="checkout-error-dialog"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="checkout-error-title"
        aria-describedby="checkout-error-message"
        className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex gap-3 px-5 pt-5 pb-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="checkout-error-title" className="text-sm font-semibold text-gray-900">
              Payment could not be settled
            </h2>
            <p
              id="checkout-error-message"
              className="mt-1.5 max-h-[40vh] overflow-y-auto whitespace-pre-line break-words text-[13px] leading-5 text-gray-600"
            >
              {message}
            </p>
          </div>
        </div>
        <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            ref={okRef}
            onClick={() => onDismiss?.()}
            className="min-h-[36px] min-w-[80px] rounded-lg bg-[#F5C742] px-4 text-sm font-semibold text-[#1E293B] transition-colors hover:bg-[#e6b838] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F5C742]/60"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CheckoutErrorDialog;
