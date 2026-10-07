/**
 * POS input scopes: which part of the till owns the keyboard right now.
 *
 * Pure: resolvePosScope reads explicit application state (the overlays registered with the
 * POS input registry, and whether the item keypad is in a qty/discount/price mode) and returns
 * one scope. The DOM is consulted only as a migration fallback, for an overlay that has not
 * been registered yet, and only when no registered overlay is open.
 */

export const POS_SCOPES = Object.freeze({
  SALE: 'SALE',
  ITEM_ENTRY: 'ITEM_ENTRY',
  CHECKOUT: 'CHECKOUT',
  COMPLETE: 'COMPLETE',
  RETURN: 'RETURN',
  DELIVERY: 'DELIVERY',
  DELIVERY_SETTLEMENT: 'DELIVERY_SETTLEMENT',
  LAYAWAY_DEPOSIT: 'LAYAWAY_DEPOSIT',
  PAYMENT: 'PAYMENT',
  MODAL: 'MODAL',
});

/**
 * Higher wins. MODAL → PAYMENT → the full-screen flows → ITEM_ENTRY → SALE. Inside one tier the
 * overlay opened most recently wins, so the order never depends on render or effect timing.
 */
export const POS_SCOPE_PRIORITY = Object.freeze({
  [POS_SCOPES.MODAL]: 5,
  [POS_SCOPES.PAYMENT]: 4,
  [POS_SCOPES.CHECKOUT]: 3,
  [POS_SCOPES.COMPLETE]: 3,
  [POS_SCOPES.RETURN]: 3,
  [POS_SCOPES.DELIVERY]: 3,
  [POS_SCOPES.DELIVERY_SETTLEMENT]: 3,
  [POS_SCOPES.LAYAWAY_DEPOSIT]: 3,
  [POS_SCOPES.ITEM_ENTRY]: 2,
  [POS_SCOPES.SALE]: 1,
});

/**
 * Overlays whose open state lives in POSSales flags rather than in a component of their own.
 * POSSales declares them by id; each id has exactly one scope.
 */
export const POS_OVERLAY_IDS = Object.freeze({
  CHECKOUT: 'checkout',
  CHECKOUT_COMPLETE: 'checkout-complete',
  RETURN: 'return',
  DELIVERY: 'delivery',
  DELIVERY_SETTLEMENT: 'delivery-settlement',
  LAYAWAY_DEPOSIT: 'layaway-deposit',
});

export const DECLARED_OVERLAY_SCOPES = Object.freeze({
  [POS_OVERLAY_IDS.CHECKOUT]: POS_SCOPES.CHECKOUT,
  [POS_OVERLAY_IDS.CHECKOUT_COMPLETE]: POS_SCOPES.COMPLETE,
  [POS_OVERLAY_IDS.RETURN]: POS_SCOPES.RETURN,
  [POS_OVERLAY_IDS.DELIVERY]: POS_SCOPES.DELIVERY,
  [POS_OVERLAY_IDS.DELIVERY_SETTLEMENT]: POS_SCOPES.DELIVERY_SETTLEMENT,
  [POS_OVERLAY_IDS.LAYAWAY_DEPOSIT]: POS_SCOPES.LAYAWAY_DEPOSIT,
});

/**
 * Scopes whose screen carries a PaymentAllocationPanel. The C/D/O/R/B method hotkeys work only
 * here. CHECKOUT is the till; the layaway deposit and delivery settlement render the same panel
 * and have always answered the same keys, so they keep them.
 */
const PAYMENT_HOTKEY_SCOPES = new Set([
  POS_SCOPES.CHECKOUT,
  POS_SCOPES.LAYAWAY_DEPOSIT,
  POS_SCOPES.DELIVERY_SETTLEMENT,
]);

export const acceptsPaymentHotkeys = (scope) => PAYMENT_HOTKEY_SCOPES.has(scope);

/** Scanner input reaches the sale only from SALE scope. ITEM_ENTRY repurposes the keys for a number. */
export const acceptsScanner = (scope) => scope === POS_SCOPES.SALE;

const priorityOf = (overlay) => POS_SCOPE_PRIORITY[overlay.scope] || 0;

/** The overlay that owns the keyboard: highest tier first, then the most recently opened. */
export function topOverlay(overlays) {
  let top = null;
  for (const o of overlays || []) {
    if (!o || o.open === false) continue;
    if (!top || priorityOf(o) > priorityOf(top)
        || (priorityOf(o) === priorityOf(top) && (o.seq || 0) > (top.seq || 0))) {
      top = o;
    }
  }
  return top;
}

/**
 * @param overlays         registered overlays ({ id, scope, open, suppressScan, seq, ... })
 * @param itemEntryActive  the item keypad is in qty/discount/price mode
 * @param isDomBlocked     migration fallback: an unregistered overlay is on screen
 * @returns {{ scope: string, overlay: object|null, scanBlocked: boolean, fallback: boolean }}
 */
export function resolvePosScope({ overlays = [], itemEntryActive = false, isDomBlocked = null } = {}) {
  const open = overlays.filter((o) => o && o.open !== false);
  const top = topOverlay(open);
  if (top) {
    return {
      scope: top.scope,
      overlay: top,
      scanBlocked: open.some((o) => o.suppressScan !== false),
      fallback: false,
    };
  }
  if (typeof isDomBlocked === 'function' && isDomBlocked()) {
    return { scope: POS_SCOPES.MODAL, overlay: null, scanBlocked: true, fallback: true };
  }
  if (itemEntryActive) {
    return { scope: POS_SCOPES.ITEM_ENTRY, overlay: null, scanBlocked: false, fallback: false };
  }
  return { scope: POS_SCOPES.SALE, overlay: null, scanBlocked: false, fallback: false };
}
