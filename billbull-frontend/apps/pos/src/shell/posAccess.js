// Till entry rules. Pure functions so the shell's decisions are unit-testable.

// `sales.pos` ("POS Sales" in Roles & Permissions) is the till permission: the backend requires it
// on checkout, held sales, layaways, delivery settlement and session open (PosTillPermission).
// `sales.invoice` is required too because the till reads invoices through /api/sales/invoices
// (receipt print, history preview, next number), which checks it. The embedded /sales/pos route
// applies the same two keys. See docs/standalone-pos/PERMISSIONS.md.
export const TILL_PERMISSIONS = Object.freeze(['sales.pos', 'sales.invoice']);

export const canOperateTill = (canView) => TILL_PERMISSIONS.every((module) => canView(module) === true);

const toBranchId = (value) => {
  if (value === null || value === undefined || value === 'ALL' || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * The till runs against exactly one branch — never "All Branches".
 *
 * @returns {{ status: 'ready', branchId: number }   — a single branch is already active
 *         | { status: 'select', branchId: number }  — the only possible branch; activate it
 *         | { status: 'choose', options: object[] } — the user must pick one
 *         | { status: 'none' }}                     — no branch available to this user
 */
export function resolveTillBranch({ activeBranchId, branches, canSwitchBranches, defaultBranch }) {
  const options = (branches || []).filter((b) => b && b.id != null);
  const active = toBranchId(activeBranchId);

  if (!canSwitchBranches) {
    // Branch-restricted users are pinned to their own branch by BranchProvider and the backend
    // (BranchScope); there is nothing to choose.
    if (active != null) return { status: 'ready', branchId: active };
    return defaultBranch?.id != null ? { status: 'ready', branchId: defaultBranch.id } : { status: 'none' };
  }

  // Users who may switch: keep an already-active single branch they can still see, otherwise
  // auto-select only when exactly one branch exists, else ask.
  if (active != null && options.some((b) => b.id === active)) return { status: 'ready', branchId: active };
  if (options.length === 1) return { status: 'select', branchId: options[0].id };
  if (options.length === 0) return { status: 'none' };
  return { status: 'choose', options };
}

// Keys a sign-out clears so the next cashier on this tab starts clean. Device-level keys
// (billbull:pos:device_fingerprint, billbull:pos:terminal_id:*, scanner profiles) live in
// localStorage and are deliberately kept: they identify the till, not the person.
export const TILL_SESSION_KEYS = Object.freeze(['token', 'role', 'primaryRole', 'user', 'fullName', 'activeBranchId']);

export const clearTillSession = (storage = sessionStorage) => {
  TILL_SESSION_KEYS.forEach((key) => storage.removeItem(key));
};
