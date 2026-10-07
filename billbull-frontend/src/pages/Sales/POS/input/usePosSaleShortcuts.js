import { usePosShortcuts } from './PosOverlayContext';
import { POS_SCOPES } from './posScope';
import { resolveShortcutLine } from './posShortcuts';

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
 * @param onCheckout     (quickCash|null) → opens checkout through handleCheckout
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
}) {
  const target = () => resolveShortcutLine({ items, selectedId, lastEnteredId });
  const actions = {
    // The Checkout and Hold buttons are disabled on an empty cart; so are their keys.
    checkout: (quickCash) => { if (items.length > 0) onCheckout?.(quickCash); },
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
  if (onCustomer) actions.customer = onCustomer;
  if (onSearch) actions.search = onSearch;
  usePosShortcuts({ scope: POS_SCOPES.SALE, actions });
}

export default usePosSaleShortcuts;
