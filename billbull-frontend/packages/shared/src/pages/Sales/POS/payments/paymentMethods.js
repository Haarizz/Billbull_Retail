import { Banknote, CalendarClock, CreditCard, Gift, Landmark, Users } from 'lucide-react';

import { PAYMENT_TYPES } from './paymentModel';

/**
 * The tenders the till offers, in method-bar order. One list for the checkout payment panel and
 * the cart's quick-pay bar, so a tender, its label, colour and hotkey are the same in both.
 *
 * Hotkeys are the first letter of each method, which is also what the badge shows.
 *
 * `hidden` takes a tender off the method bar without removing it from the system: the modal,
 * the model, the selectors and the backend all still handle it, so an allocation already on a
 * sale stays editable and the tender can be brought back by deleting one flag. Deleting the
 * entry instead would strand any line of that type with no way to open it.
 */
export const PAYMENT_METHODS = Object.freeze([
  { type: PAYMENT_TYPES.CASH, label: 'Cash', hotkey: 'c', icon: Banknote, accent: '#16a34a' },
  { type: PAYMENT_TYPES.CARD, label: 'Card', hotkey: 'd', icon: CreditCard, accent: '#2563eb' },
  { type: PAYMENT_TYPES.ONLINE, label: 'Online', hotkey: 'o', icon: Landmark, accent: '#0891b2' },
  { type: PAYMENT_TYPES.CREDIT, label: 'Credit', hotkey: 'r', icon: Users, accent: '#9333ea' },
  // 'v' is free; 'c' and 'd' are already Cash and Card.
  // Temporarily hidden — Credit Voucher redemption is not being offered at the till for now.
  { type: PAYMENT_TYPES.VOUCHER, label: 'Voucher', hotkey: 'v', icon: Gift, accent: '#8B5CF6', hidden: true },
  // Buy Now Pay Later — a third-party provider settles the sale and bills the customer in
  // installments. 'b' is free.
  { type: PAYMENT_TYPES.BNPL, label: 'BNPL', hotkey: 'b', icon: CalendarClock, accent: '#D97706' },
]);

/** The tenders on the method bar (hidden ones left out). */
export const VISIBLE_PAYMENT_METHODS = Object.freeze(PAYMENT_METHODS.filter((m) => !m.hidden));
