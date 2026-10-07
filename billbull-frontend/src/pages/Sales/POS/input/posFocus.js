import { POS_SCOPES } from './posScope';

/**
 * POS focus targets: which control should hold the caret for the current POS state.
 *
 * Pure: deriveFocusTarget reads explicit state (the resolved input scope, the item keypad mode,
 * whether the customer search is open, whether checkout is fully allocated) and returns one
 * target. Components never decide focus for themselves; they register the element that
 * implements a target (usePosFocusTarget) and the focus controller moves the caret.
 */
export const POS_FOCUS_TARGETS = Object.freeze({
  SEARCH: 'SEARCH',
  QUANTITY: 'QUANTITY',
  DISCOUNT: 'DISCOUNT',
  PRICE: 'PRICE',
  CUSTOMER: 'CUSTOMER',
  PAYMENT_METHOD: 'PAYMENT_METHOD',
  PAYMENT_AMOUNT: 'PAYMENT_AMOUNT',
  SETTLE: 'SETTLE',
  NEW_SALE: 'NEW_SALE',
  NONE: 'NONE',
});

const T = POS_FOCUS_TARGETS;

/** The item keypad modes (posActionMode / classicNumpadMode) and the field each one types into. */
export const ITEM_ENTRY_FOCUS = Object.freeze({ qty: T.QUANTITY, discount: T.DISCOUNT, price: T.PRICE });

/**
 * Targets a pointer interaction re-asserts. In SALE and ITEM_ENTRY the cashier's next keystroke
 * or scan belongs in one field, so a click on a tile, a cart button or the keypad hands the caret
 * straight back to it. Checkout targets are only moved on a transition: a click there is the
 * cashier choosing a control.
 */
export const STICKY_FOCUS_TARGETS = new Set([T.SEARCH, T.QUANTITY, T.DISCOUNT, T.PRICE, T.CUSTOMER]);

/**
 * @param scope          resolved POS input scope (posScope.resolvePosScope)
 * @param itemEntryMode  'qty' | 'discount' | 'price' | 'none' — the item keypad mode
 * @param customerActive the customer search is open in the sale screen
 * @param settleReady    checkout is fully allocated and Settle is enabled
 * @returns one of POS_FOCUS_TARGETS
 *
 *   SALE            → CUSTOMER while the customer search is open, otherwise SEARCH
 *   ITEM_ENTRY      → QUANTITY / DISCOUNT / PRICE
 *   CHECKOUT        → SETTLE when fully allocated, otherwise PAYMENT_METHOD
 *   PAYMENT         → PAYMENT_AMOUNT
 *   COMPLETE        → NEW_SALE
 *   anything else   → NONE: a modal, return, delivery or deposit flow owns its own focus
 */
export function deriveFocusTarget({
  scope,
  itemEntryMode = 'none',
  customerActive = false,
  settleReady = false,
} = {}) {
  switch (scope) {
    case POS_SCOPES.SALE:
      return customerActive ? T.CUSTOMER : T.SEARCH;
    case POS_SCOPES.ITEM_ENTRY:
      return ITEM_ENTRY_FOCUS[itemEntryMode] || T.NONE;
    case POS_SCOPES.CHECKOUT:
      return settleReady ? T.SETTLE : T.PAYMENT_METHOD;
    case POS_SCOPES.PAYMENT:
      return T.PAYMENT_AMOUNT;
    case POS_SCOPES.COMPLETE:
      return T.NEW_SALE;
    default:
      return T.NONE;
  }
}

const elementOf = (record) => {
  const el = record?.ref?.current || null;
  return el && el.isConnected !== false ? el : null;
};

const serves = (record, target, ownerId) => (
  record.active !== false
  && Array.isArray(record.targets) && record.targets.includes(target)
  && (record.owner == null || record.owner === ownerId)
  && Boolean(elementOf(record))
);

/** The registered element implementing `target` for the overlay `ownerId` (newest wins), or null. */
export function findFocusElement(registry, target, ownerId = null) {
  if (!registry || target === T.NONE) return null;
  return elementOf(registry.newest('focus', (r) => serves(r, target, ownerId)));
}

/**
 * Everything the focus controller needs, read from the registry in one place.
 *
 * @param scopeState  posScope.resolvePosScope result
 * @param surface     the template's registered scan surface (carries itemEntryMode)
 */
export function resolveFocusState(registry, scopeState, surface) {
  const ownerId = scopeState.overlay?.id ?? null;
  const settle = registry.newest('focus', (r) => serves(r, T.SETTLE, ownerId));
  const target = deriveFocusTarget({
    scope: scopeState.scope,
    itemEntryMode: surface?.itemEntryMode || 'none',
    customerActive: Boolean(findFocusElement(registry, T.CUSTOMER, null)),
    settleReady: Boolean(settle?.ready),
  });
  return { scope: scopeState.scope, ownerId, target, element: findFocusElement(registry, target, ownerId) };
}
