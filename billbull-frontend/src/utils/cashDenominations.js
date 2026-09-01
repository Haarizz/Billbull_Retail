// The denomination ladder used to RENDER the cash-count screens.
//
// The server is authoritative. `GET /api/pos/denominations` returns the ladder for the drawer's
// currency, and every submitted count is validated against it server-side — a denomination that
// is not legal tender, or a currency with no configured ladder, is rejected there regardless of
// what this file says. The values below are a bundled AED fallback so the count dialog still
// renders if that call fails; they cannot widen what the server will accept.
//
// This file no longer computes money. Counted Cash is Σ(denomination × quantity) performed by
// the backend, because a total the browser calculates and posts is a number nobody can verify.

/** Applies a server ladder fetched from GET /api/pos/denominations. */
let serverLadder = null;
export const setDenominationLadder = (ladder) => {
  serverLadder = (ladder && Array.isArray(ladder.allKeys) && ladder.allKeys.length) ? ladder : null;
};

/** The active ladder: the server's when available, else the bundled AED fallback. */
export const getDenominationLadder = () => serverLadder || {
  currencyCode: 'AED',
  noteKeys: CASH_NOTE_KEYS,
  coinKeys: CASH_COIN_KEYS,
  allKeys: DENOM_KEYS,
};

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
