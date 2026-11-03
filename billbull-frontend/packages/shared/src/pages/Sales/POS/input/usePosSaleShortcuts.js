import { usePosShortcuts } from './PosOverlayContext';
import { POS_SCOPES } from './posScope';
import { CART_ZONE_ATTR, resolveShortcutLine, stepCartLine } from './posShortcuts';

/** Cart rows carry data-cart-line-id; keep the line the cursor moved to on screen. */
const scrollCartLineIntoView = (id) => {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => {
    const zone = document.querySelector(`[${CART_ZONE_ATTR}]`);
    const row = zone && Array.from(zone.querySelectorAll('[data-cart-line-id]'))
      .find((el) => el.getAttribute('data-cart-line-id') === String(id));
    row?.scrollIntoView?.({ block: 'nearest' });
  });
};

/**
 * The SALE-scope shortcut actions every template shares (posShortcuts.js). The template passes
 * its own way of doing each thing; this hook adds the rules that must not differ between
 * templates — which line a line shortcut targets, and when an action is a safe no-op — and
 * registers the result with the POS input controller. No listener here: the controller owns the
 * keys.
 *
 * @param items          the cart lines
 * @param selectedId     the cart line the cashier selected, if any
 * @param lastEnteredId  the cart line most recently entered (useProductEntry)
 * @param onCheckout     (quickCash|{ tender }|null) → opens checkout through handleCheckout
 *                       (posShortcuts.checkoutOptions turns the argument into its options)
 * @param onSelect       (lineId) → selects a cart line (the cart cursor's ↑ / ↓). Without it
 *                       the template has no cart cursor, and F6 / the cart keys stay inert.
 * @param onHold         the template's Hold action
 * @param onQuantity     (lineId, quantity) → updateQuantity
 * @param onRemove       (lineId) → the guarded remove/void (supervisor rules included)
 * @param onMode         ('qty'|'discount'|'price', line|null) → the template's item edit mode
 * @param onCustomer     opens the customer search (optional: a child may register it instead)
 * @param onSearch       closes whatever would keep the caret from search (optional)
 */
export function usePosSaleShortcuts({
  items = [],
  selectedId = null,
  lastEnteredId = null,
  onCheckout,
  onHold,
  onQuantity,
  onRemove,
  onMode,
  onCustomer = null,
  onSearch = null,
  onSelect = null,
}) {
  const target = () => resolveShortcutLine({ items, selectedId, lastEnteredId });
  const actions = {
    // The Checkout and Hold buttons are disabled on an empty cart; so are their keys.
    checkout: (quickCash) => { if (items.length > 0) onCheckout?.(quickCash); },
    // A tender hotkey with the cart cursor in the cart: checkout, that tender's modal up.
    tender: (method) => { if (items.length > 0) onCheckout?.({ tender: method }); },
    hold: () => { if (items.length > 0) onHold?.(); },
    qtyStep: (delta) => {
      const line = target();
      if (!line) return;
      const quantity = line.quantity + delta;
      // − stops at 1. Taking a line to 0 removes it without the void/supervisor rules; removal
      // is Delete's job, which goes through them.
      if (quantity < 1) return;
      onQuantity?.(line.id, quantity);
    },
    remove: () => {
      const line = target();
      if (line) onRemove?.(line.id);
    },
    mode: (mode) => onMode?.(mode, target()),
  };
  if (onSelect) {
    const select = (id) => {
      if (id == null) return;
      onSelect(id);
      scrollCartLineIntoView(id);
    };
    // F6 into the cart: the cursor lands on the line the line shortcuts already target, else
    // the newest line, so +, − and Delete keep acting on the same line they did a moment ago.
    actions.cartEnter = () => {
      const line = target();
      select(line ? line.id : stepCartLine({ items, currentId: null, delta: 1 }));
    };
    actions.cartMove = (delta) => select(stepCartLine({ items, currentId: target()?.id ?? null, delta }));
  }
  if (onCustomer) actions.customer = onCustomer;
  if (onSearch) actions.search = onSearch;
  usePosShortcuts({ scope: POS_SCOPES.SALE, actions });
}

export default usePosSaleShortcuts;
