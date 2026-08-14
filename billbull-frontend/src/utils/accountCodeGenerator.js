/**
 * Client-side mirror of the backend AccountCodeGenerator
 * (financials/chartofaccounts/AccountCodeGenerator.java).
 *
 * Used only for the "Auto NNNN" preview in the account modals — the authoritative
 * allocation happens server-side (blank code on POST /api/ledger/accounts, or
 * GET /api/ledger/accounts/next-code). Keep the two in sync when bands change.
 *
 * Rules:
 *  1. With a parent, children are numbered inside the parent's hundred-block
 *     (6000 -> 6001..6099, 1050 -> 1051..1099).
 *  2. Otherwise (or if that block is full) fall back to the bands the group really
 *     owns — Expenses also owns 6000-6999 and 7500-7999, Income also owns 7000-7499.
 *  3. Always take the FIRST FREE code in a band, never max+1 (max+1 walks straight
 *     out of the band once a code like the seeded 5999 exists, and collides with 6000).
 */

const GROUP_BANDS = {
  assets: [[1000, 1999]],
  asset: [[1000, 1999]],
  liabilities: [[2000, 2999]],
  liability: [[2000, 2999]],
  equity: [[3000, 3999]],
  income: [[4000, 4999], [7000, 7499]],
  revenue: [[4000, 4999], [7000, 7499]],
  expenses: [[5000, 5999], [6000, 6999], [7500, 7999]],
  expense: [[5000, 5999], [6000, 6999], [7500, 7999]]
};

const FALLBACK_BANDS = [[9000, 9999]];

const parseCode = (code) => {
  if (code === null || code === undefined) return null;
  const trimmed = String(code).trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && String(parsed) === trimmed ? parsed : null;
};

const bandsForGroup = (group) =>
  GROUP_BANDS[String(group || '').trim().toLowerCase()] || FALLBACK_BANDS;

const childBandFor = (parentCode) => {
  const parent = parseCode(parentCode);
  if (parent === null) return null;
  const blockStart = Math.floor(parent / 100) * 100;
  return [Math.max(blockStart, parent) + 1, blockStart + 99];
};

const firstFree = ([min, max], used) => {
  for (let candidate = min; candidate <= max; candidate += 1) {
    if (!used.has(candidate)) return candidate;
  }
  return null;
};

/**
 * @returns {string} the next free code, or '' when every candidate band is full
 *                   (the user must then type a code manually).
 */
export const generateNextAccountCode = ({ group, parentCode, existingAccounts = [] }) => {
  const used = new Set(
    existingAccounts
      .map(account => parseCode(account?.code))
      .filter(code => code !== null)
  );

  const parentBand = childBandFor(parentCode);
  if (parentBand) {
    const allocated = firstFree(parentBand, used);
    if (allocated !== null) return String(allocated);
  }

  for (const [min, max] of bandsForGroup(group)) {
    // Skip the band root itself (5000, 6000, …) — those are the group/header accounts.
    const allocated = firstFree([min + 1, max], used);
    if (allocated !== null) return String(allocated);
  }

  return '';
};

export default generateNextAccountCode;
