/**
 * Which employee designations may act as a salesperson — the client-side mirror of the backend's
 * `SalespersonEligibility`.
 *
 * <p>This is PRESENTATION ONLY. It decides whether to offer the Print Employee Barcode action and
 * which rows the target-readiness banner counts — never whether a sale is allowed. Every
 * attribution is re-resolved and re-validated server-side, so a browser that lied about a role
 * gets a 400, not an attribution.
 *
 * <p>`Employee.role` is free text whose dropdown borrows its options from the RBAC `roles` table,
 * so the stored value may be the human-readable designation ("Cashier + Salesperson") or the raw
 * role key ("CASHIER_SALESPERSON") depending on which client wrote it. Both families are listed,
 * exactly as the backend set does — keep the two in step if a spelling is ever added.
 */

/** The two eligible designations, as the UI spells them. */
export const SALESPERSON_DESIGNATIONS = Object.freeze([
  'Salesperson',
  'Cashier + Salesperson',
]);

const ROLE_KEYS = new Set([
  'salesperson',
  'sales person',
  'cashier + salesperson',
  'cashier + sales person',
  'cashier+salesperson',
  'cashier+sales person',
  'cashier_salesperson',
  'cashier_sales_person',
]);

/** Lower-cases, trims and collapses internal whitespace, as the backend's normaliser does. */
export const normalizeRole = (role) =>
  String(role ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Role-only check. Says nothing about employment status. */
export const isSalespersonRole = (role) => ROLE_KEYS.has(normalizeRole(role));

/** Status-only check, matching the spelling used across the HR screens. */
export const isActiveEmployee = (employee) =>
  String(employee?.status ?? '').trim().toLowerCase() === 'active';

/** The full rule: Active AND one of the two eligible designations. */
export const isActiveSalesperson = (employee) =>
  isActiveEmployee(employee) && isSalespersonRole(employee?.role ?? employee?.rawRole);
