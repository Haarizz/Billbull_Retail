// Single source of truth for the cash-drawer denomination ladder.
//
// Every cash-count surface (session-open float, Close Session dialog, X-Report
// denomination table, report view-model) reads from here so the ladders cannot
// drift apart — they previously existed as five hand-maintained copies.
//
// Values are AED. The active currency is configurable (see POSCurrency.js
// setActiveCurrency), so making this currency-aware means turning the two
// exports below into a per-currency lookup keyed on the active code — the call
// sites already consume them as opaque lists and need no further change.

/** Bank notes, largest first — the physical notes a drawer holds. */
export const CASH_NOTE_KEYS = ['1000', '500', '200', '100', '50', '20', '10', '5'];

/**
 * Coins, largest first. 0.10 and 0.05 (10/5 fils) are rarely circulated but are
 * legal tender, and without them any drawer total with a sub-0.25 tail — e.g.
 * 171.90 — is not physically countable and reports a permanent Short variance.
 */
export const CASH_COIN_KEYS = ['1', '0.50', '0.25', '0.10', '0.05'];

/** Full ladder, notes then coins — the order denomination tables render in. */
export const DENOM_KEYS = [...CASH_NOTE_KEYS, ...CASH_COIN_KEYS];

export const DENOM_LABELS = {
  '1000': 'AED 1000', '500': 'AED 500', '200': 'AED 200', '100': 'AED 100',
  '50': 'AED 50', '20': 'AED 20', '10': 'AED 10', '5': 'AED 5',
  '1': 'AED 1 Coin', '0.50': 'AED 0.50 Coin', '0.25': 'AED 0.25 Coin',
  '0.10': 'AED 0.10 Coin', '0.05': 'AED 0.05 Coin',
};

/** A fresh count map with every denomination zeroed. */
export const emptyDenominations = () =>
  DENOM_KEYS.reduce((acc, key) => { acc[key] = 0; return acc; }, {});
