import React, { useRef } from 'react';
import { LayoutGrid, X } from 'lucide-react';

import { PAYMENT_TYPES } from '../../payments/paymentModel';
import { VISIBLE_PAYMENT_METHODS } from '../../payments/paymentMethods';
import { usePosFocusTarget } from '../../input/PosOverlayContext';
import { POS_FOCUS_TARGETS } from '../../input/posFocus';
import { CART_CURSOR_KEY, CART_ZONE_ATTR } from '../../input/posShortcuts';

/**
 * Makes an element the cart region every template shares: the cart cursor's home (posShortcuts
 * CART_*). Spread the result on the element that holds the cart lines. The region takes the
 * caret on F6 or a click; while it has it, ↑ / ↓ pick a line, Enter checks out, the tender
 * letters open checkout on that tender and Esc returns to the search. The ring shows the cashier
 * the cursor is there.
 */
export function usePosCartZone() {
  const ref = useRef(null);
  usePosFocusTarget({ targets: POS_FOCUS_TARGETS.CART, ref });
  return {
    ref,
    tabIndex: 0,
    role: 'region',
    'aria-label': `Cart (${CART_CURSOR_KEY})`,
    [CART_ZONE_ATTR]: 'true',
  };
}

/** Rail order and the line under each tender's name (the Figma "Quick Checkout" rail). */
const RAIL_ORDER = [PAYMENT_TYPES.CASH, PAYMENT_TYPES.CARD, PAYMENT_TYPES.CREDIT, PAYMENT_TYPES.ONLINE, PAYMENT_TYPES.BNPL];
const RAIL_SUBTITLE = {
  [PAYMENT_TYPES.CASH]: 'Banknotes & coins',
  [PAYMENT_TYPES.CARD]: 'Visa · Mastercard',
  [PAYMENT_TYPES.CREDIT]: 'Customer credit account',
  [PAYMENT_TYPES.ONLINE]: 'Bank transfer · App',
  [PAYMENT_TYPES.BNPL]: 'Tabby · Tamara · Nomad',
};
const RAIL_METHODS = RAIL_ORDER
  .map((type) => VISIBLE_PAYMENT_METHODS.find((m) => m.type === type))
  .filter(Boolean);

/**
 * Quick Checkout rail — the right-hand column of Classic and Cart Focus. One full-height tab per
 * tender: a tap opens checkout with that tender's modal already up, so there is no separate
 * Checkout button. Cash is the default tender (double Enter) and is drawn as the selected tab.
 * The last tab, Add-ons, opens the Functions / History panel in place of the rail.
 *
 * Every tender goes through the template's checkout handler, so the checkout gates (salesperson,
 * mandatory customer, delivery orders) still apply.
 *
 * @param onPick        (paymentType) → checkout with `{ tender: paymentType }`
 * @param onOpenAddons  shows the Functions / History panel
 * @param disabled      the cart is empty: the tenders are inert, Add-ons is not
 * @param note          optional line above the tabs (a layaway deposit already applied)
 */
export function QuickCheckoutRail({ onPick, onOpenAddons, disabled = false, note = null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="quick-checkout-rail">
      {note}
      {RAIL_METHODS.map(({ type, label, hotkey, icon: Icon, accent }) => {
        const selected = type === PAYMENT_TYPES.CASH && !disabled;
        return (
          <button key={type} type="button" disabled={disabled} onClick={() => onPick?.(type)}
            aria-label={`Checkout with ${label} (${hotkey.toUpperCase()})`}
            title={`Checkout with ${label} — ${hotkey.toUpperCase()} with the cursor in the cart (${CART_CURSOR_KEY})`}
            className="group relative flex min-h-[64px] flex-1 items-center gap-3 border-b border-l-4 border-b-gray-100 px-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderLeftColor: selected ? accent : 'transparent',
              backgroundColor: selected ? `${accent}0D` : undefined,
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = `${accent}14`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = selected ? `${accent}0D` : ''; }}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${accent}1A` }}>
              <Icon className="h-5 w-5" style={{ color: accent }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold" style={{ color: selected ? accent : '#1E293B' }}>{label}</span>
              <span className="block truncate text-[10px] text-gray-400">{RAIL_SUBTITLE[type]}</span>
            </span>
            <span className="shrink-0 rounded px-1 text-[9px] font-black uppercase leading-4"
              style={{ backgroundColor: `${accent}1A`, color: accent }}>{hotkey}</span>
            {selected && <span className="absolute right-3 top-3 h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />}
          </button>
        );
      })}
      <button type="button" onClick={onOpenAddons}
        className="flex min-h-[64px] flex-1 items-center gap-3 border-l-4 border-l-transparent px-4 text-left transition-colors hover:bg-gray-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
          <LayoutGrid className="h-5 w-5 text-gray-500" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[#1E293B]">Add-ons</span>
          <span className="block truncate text-[10px] text-gray-400">Functions & tools</span>
        </span>
      </button>
    </div>
  );
}

/** Header over the Functions / History panel while Add-ons is open; ✕ returns to the rail. */
export function AddonsHeader({ onClose }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <LayoutGrid className="h-4 w-4 shrink-0 text-gray-500" />
        <span className="truncate text-xs font-bold uppercase tracking-wide text-[#1E293B]">Add-ons</span>
      </span>
      <button type="button" onClick={onClose} aria-label="Close add-ons"
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-200">
        <X className="h-3.5 w-3.5" />Pay
      </button>
    </div>
  );
}

/** Focus ring for the cart region: inset, so it never shifts the layout. */
export const CART_ZONE_FOCUS_CLASS = 'outline-none focus:ring-2 focus:ring-inset focus:ring-[#F5C742]';

/**
 * Quick checkout from the cart: one button per tender, the same tenders, colours and hotkeys as
 * the checkout method bar. A tap opens checkout with that tender's modal already up — the
 * Checkout button followed by the method, in one step. It goes through the template's checkout
 * handler, so every checkout gate (salesperson, mandatory customer, delivery orders) still applies.
 *
 * @param onPick    (paymentType) → the template's checkout with `{ tender: paymentType }`
 * @param disabled  the cart is empty (as the Checkout button)
 * @param dense     a tighter row for the narrow Classic cart column
 */
export default function QuickCheckoutBar({ onPick, disabled = false, dense = false }) {
  return (
    <div className={`shrink-0 border-t border-gray-100 bg-white ${dense ? 'px-2 py-1.5' : 'px-3 py-2'}`}
      data-testid="quick-checkout-bar">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Quick Pay</p>
        <p className="truncate text-[9px] text-gray-400" title={`${CART_CURSOR_KEY} puts the cursor in the cart; then press a tender's letter`}>
          <kbd className="font-mono font-bold text-gray-500">{CART_CURSOR_KEY}</kbd> cart · letter pays
        </p>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${VISIBLE_PAYMENT_METHODS.length}, minmax(0, 1fr))` }}>
        {VISIBLE_PAYMENT_METHODS.map(({ type, label, hotkey, icon: Icon, accent }) => (
          <button key={type} type="button" disabled={disabled}
            onClick={() => onPick?.(type)}
            aria-label={`Checkout with ${label} (${hotkey.toUpperCase()})`}
            title={`Checkout with ${label} — ${hotkey.toUpperCase()} with the cursor in the cart`}
            className={`group relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${dense ? 'py-1' : 'py-1.5'}`}
            style={{ borderColor: `${accent}40`, backgroundColor: `${accent}0A` }}>
            <span className="absolute right-0.5 top-0.5 rounded px-0.5 text-[8px] font-black uppercase leading-none"
              style={{ backgroundColor: `${accent}1A`, color: accent }}>{hotkey}</span>
            <Icon className={dense ? 'h-3.5 w-3.5' : 'h-4 w-4'} style={{ color: accent }} />
            <span className="max-w-full truncate text-[10px] font-bold leading-tight" style={{ color: accent }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
