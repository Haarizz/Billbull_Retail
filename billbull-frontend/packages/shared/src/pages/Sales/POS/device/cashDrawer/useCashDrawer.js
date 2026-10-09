// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged: the same trigger vocabulary, the same MANUAL_OPEN bypass,
// and the same window CustomEvent are used.
import { useCallback } from 'react';

/** The DOM event a hardware bridge / print agent listens for to pulse the drawer. */
export const CASH_DRAWER_EVENT = 'pos:open-cash-drawer';

/**
 * Cash drawer control.
 *
 * Opens the physical drawer only for events enabled in POS settings
 * (cashDrawerTriggers). Trigger keys must match the backend vocabulary in
 * PosSettings.cashDrawerTriggers (CASH_PAYMENT, RECEIPT_PRINT, CHANGE_RETURN,
 * CASH_SETTLEMENT, CASH_DROP, CASH_OUT, MANUAL_OPEN).
 *
 * @param {object|null} posSettings the live POS settings object
 * @returns {{ isDrawerTriggerEnabled: (trigger: string) => boolean,
 *             openCashDrawer: (trigger: string) => void }}
 */
export function useCashDrawer(posSettings) {
  const isDrawerTriggerEnabled = useCallback((trigger) => {
    const raw = posSettings?.cashDrawerTriggers;
    if (raw == null) return false;
    return String(raw).split(',').map(t => t.trim()).includes(trigger);
  }, [posSettings]);

  const openCashDrawer = useCallback((trigger) => {
    // MANUAL_OPEN is an explicit cashier action — always allowed.
    if (trigger !== 'MANUAL_OPEN' && !isDrawerTriggerEnabled(trigger)) return;
    // No web API to pulse a physical drawer; the driver/agent listens for this.
    // Surface the kick so hardware integrations (or future bridge) can react.
    window.dispatchEvent(new CustomEvent(CASH_DRAWER_EVENT, { detail: { trigger } }));
  }, [isDrawerTriggerEnabled]);

  return { isDrawerTriggerEnabled, openCashDrawer };
}

export default useCashDrawer;
