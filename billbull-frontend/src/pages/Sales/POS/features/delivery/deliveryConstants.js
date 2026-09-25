// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged; only the location moved.

import { PAYMENT_TYPES } from '../../payments/paymentModel';

/** Tenders offered when settling a delivery balance. CREDIT is excluded: putting the amount
 *  back on the customer's account is not a settlement, it is leaving the balance outstanding. */
export const DELIVERY_SETTLE_METHODS = [
  PAYMENT_TYPES.CASH, PAYMENT_TYPES.CARD, PAYMENT_TYPES.ONLINE,
];
