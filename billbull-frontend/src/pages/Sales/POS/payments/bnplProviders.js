/**
 * The Buy Now, Pay Later providers a till may finance a sale through, their installment
 * plans, and the arithmetic behind every figure the cashier and the customer are shown.
 *
 * Why a table rather than an integration: BillBull does not talk to the providers. The
 * cashier runs the financing in the provider's own merchant app, and the approved order is
 * then recorded here as a tender. So what this file describes is what the *cashier* has to
 * choose between and what the *receipt* has to say — not an API surface.
 *
 * The one rule that governs all of it: **the merchant is paid the financed amount in full.**
 * A plan's fee is what the *provider* charges the *customer* for spreading the payments; it
 * never touches this invoice, never changes what the store banks, and is shown only so the
 * customer knows what they are agreeing to before they agree to it.
 *
 * Pure data + pure functions, no React and no I/O, so the plan maths is directly testable.
 */

/**
 * `minimumAmount` is the provider's floor for financing a basket (AED). It is advisory — the
 * provider is the authority and may refuse for its own reasons — but showing it stops a
 * cashier walking a customer through a plan that was never going to be approved.
 *
 * `feePercent` is the customer-facing fee for the plan. `perMonth` marks a rate quoted per
 * month rather than once for the whole plan (a 12-month plan at 1.9% p.m. is not 1.9%).
 */
export const BNPL_PROVIDERS = Object.freeze([
  {
    id: 'tabby',
    name: 'Tabby',
    tagline: 'Pay in 4, interest-free',
    accent: '#14b8a6',
    minimumAmount: 0,
    plans: [
      { id: 'tabby-4', label: 'Pay in 4', installments: 4, cadence: 'Every 2 weeks', feePercent: 0 },
      { id: 'tabby-6', label: 'Pay in 6', installments: 6, cadence: 'Monthly', feePercent: 2 },
    ],
  },
  {
    id: 'tamara',
    name: 'Tamara',
    tagline: 'Split into 3 or 4 payments',
    accent: '#34d399',
    minimumAmount: 100,
    plans: [
      { id: 'tamara-3', label: 'Pay in 3', installments: 3, cadence: 'Monthly', feePercent: 0 },
      { id: 'tamara-4', label: 'Pay in 4', installments: 4, cadence: 'Every 2 weeks', feePercent: 1.5 },
    ],
  },
  {
    id: 'nomad',
    name: 'Nomad',
    tagline: 'Flexible monthly financing',
    accent: '#a78bfa',
    minimumAmount: 200,
    plans: [
      { id: 'nomad-3', label: 'Pay in 3', installments: 3, cadence: 'Monthly', feePercent: 0 },
      { id: 'nomad-12', label: '12 Months', installments: 12, cadence: 'Monthly', feePercent: 1.9, perMonth: true },
    ],
  },
]);

/** Look-up by id, or null. */
export function findBnplProvider(id) {
  return BNPL_PROVIDERS.find((p) => p.id === id) || null;
}

/** The chip a plan shows on the provider list: "Pay in 4 · 0%", "Pay in 6 · 2% fee". */
export function planChipLabel(plan) {
  if (!plan) return '';
  if (!plan.feePercent) return `${plan.label} · 0%`;
  return plan.perMonth
    ? `${plan.label} · ${plan.feePercent}% p.m.`
    : `${plan.label} · ${plan.feePercent}% fee`;
}

/**
 * What the provider charges the customer for this plan. A per-month rate is charged for each
 * month of the plan, which is why it is multiplied out — quoting 1.9% p.m. as a flat 1.9%
 * would understate a 12-month plan by an order of magnitude on the customer's own receipt.
 */
export function planFee(amount, plan) {
  const financed = Number(amount) || 0;
  if (!plan || !plan.feePercent || financed <= 0) return 0;
  const months = plan.perMonth ? plan.installments : 1;
  return round2(financed * (plan.feePercent / 100) * months);
}

/** What the customer ends up paying the provider: the financed amount plus its fee. */
export function planTotalPayable(amount, plan) {
  return round2((Number(amount) || 0) + planFee(amount, plan));
}

/** The single per-installment figure quoted to the customer: total payable / installments. */
export function planInstallmentAmount(amount, plan) {
  if (!plan || !plan.installments) return 0;
  return round2(planTotalPayable(amount, plan) / plan.installments);
}

/**
 * Splits `amount` into `installments` payments that add back up to exactly `amount`.
 *
 * The remainder from the division goes onto the *first* installment, which is the convention
 * every BNPL provider uses: the customer pays the odd fils today rather than discovering an
 * extra fils on the last payment months later. Rounding each installment independently would
 * leave the schedule off by a fils or two against the amount actually financed.
 *
 * @returns {number[]} one amount per installment, or [] for a nonsensical request
 */
export function installmentSchedule(amount, installments) {
  const total = Math.round((Number(amount) || 0) * 100);
  const n = Math.floor(Number(installments) || 0);
  if (total <= 0 || n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + remainder : base) / 100);
}

/**
 * When the customer's first installment falls due: one cycle after the sale.
 *
 * Deliberately derived rather than typed. The provider sets the real date and the customer
 * sees it in their own app, so the only thing this has to be is *honest about the cycle* —
 * which is why it moves by the plan's own cadence instead of a fixed date that would drift
 * from what the plan actually says.
 */
export function firstPaymentDate(plan, from = new Date()) {
  if (!plan) return null;
  const due = new Date(from.getTime());
  if (plan.cadence === 'Every 2 weeks') due.setDate(due.getDate() + 14);
  else due.setMonth(due.getMonth() + 1);
  return due;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "01 Oct 2026" — the date format the rest of the POS receipts use. */
export function formatBnplDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The till's own reference for a financed leg, pre-filled on the review step.
 *
 * It is BillBull's transaction reference, not the provider's — the cashier overwrites it with
 * the provider's approval reference when they have one, which is what the payout is actually
 * reconciled against. Generated rather than left blank so a leg is never recorded with no
 * reference at all, which would leave it untraceable in both directions.
 */
export function generateBnplReference() {
  const digits = Math.floor(Math.random() * 90000000) + 10000000;
  return `BNPL-${digits}`;
}

/** "Pay in 4 · 4 x 23.36" — the one-line plan summary shown on the allocation row. */
export function planSummary(plan, amount) {
  if (!plan) return null;
  const per = planInstallmentAmount(amount, plan);
  if (per <= 0) return plan.label;
  return `${plan.label} · ${plan.installments} x ${per.toFixed(2)}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
