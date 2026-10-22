/**
 * Shared Sales Return design tokens and vocabularies.
 *
 * The accent is the BillBull brand amber (#F5C742) used across the rest of the app — the
 * screen's earlier teal accent has been retired so Sales Return reads as part of the same
 * product. Both entry points — POS → Actions → Return and Customer & Sales → Sales Return —
 * import from here, so the two screens cannot drift apart visually (§1).
 *
 * Three tokens carry the accent, and which one to use is decided by contrast, not taste:
 *   accent     filled surfaces (buttons, chips) — always pair with `onAccent` text, never white
 *   accentInk  accent-coloured text/icons on a white or light background
 *   accentSoft tinted backgrounds, with `accentBorder` as the matching hairline
 */

export const C = {
   gold: '#F5C742',
   accent: '#F5C742',
   accentHover: '#E9B424',
   accentInk: '#946200',
   accentSoft: '#FFF8E7',
   accentBorder: '#FDE6A9',
   onAccent: '#1E293B',
   amber: '#F59E0B',
   // Warning text ink. Plain `amber` is a fill/icon colour — as text on white it sits near
   // 2:1 contrast, which is unreadable for the warning lines that matter most.
   warnInk: '#B45309',
   dark: '#1E293B',
   slate: '#334155',
   muted: '#64748B',
   border: '#E2E8F0',
   bg: '#F8FAFC',
   white: '#FFFFFF',
   red: '#EF4444',
   green: '#22C55E',
   blue: '#3B82F6',
   purple: '#8B5CF6',
   orange: '#F97316',
};

/** Which surface launched the workflow (§6). Mirrors the backend SalesReturnEntryPoint enum. */
export const ENTRY_POINT = {
   POS: 'POS',
   SALES_RETURN: 'SALES_RETURN',
};

/**
 * Fallback vocabularies used only until GET /api/sales/returns/options resolves, so the
 * first paint is never empty. The backend response replaces these — it is the source of
 * truth, and adding a reason there must not require a frontend change (§12).
 */
export const FALLBACK_CONDITIONS = [
   { value: 'GOOD', label: 'Good', restockable: true },
   { value: 'DAMAGED', label: 'Damaged', restockable: false },
   { value: 'OPENED', label: 'Opened', restockable: false },
   { value: 'DEFECTIVE', label: 'Defective', restockable: false },
   { value: 'EXPIRED', label: 'Expired', restockable: false },
];

export const FALLBACK_REASONS = [
   { value: 'CUSTOMER_RETURN', label: 'Customer Return' },
   { value: 'WRONG_ITEM', label: 'Wrong Item' },
   { value: 'CHANGED_MIND', label: 'Changed Mind' },
   { value: 'DAMAGED_GOODS', label: 'Damaged Goods' },
   { value: 'DEFECTIVE', label: 'Defective' },
   { value: 'EXPIRED', label: 'Expired' },
   { value: 'PRICE_ISSUE', label: 'Price Issue' },
   { value: 'OTHER', label: 'Other' },
];

export const FALLBACK_REFUND_METHODS = [
   { value: 'CASH_REFUND', label: 'Cash Refund', affectsCashDrawer: true },
   { value: 'CARD_REFUND', label: 'Card Refund', affectsCashDrawer: false },
   { value: 'BANK_TRANSFER', label: 'Bank Transfer', affectsCashDrawer: false },
   { value: 'CREDIT_VOUCHER', label: 'Credit Voucher', affectsCashDrawer: false },
   { value: 'CUSTOMER_CREDIT', label: 'Customer Credit', affectsCashDrawer: false },
];

/** Per-line status pill styling for the §10 Sold Items pane. Keys match the backend's status. */
export const LINE_STATUS_STYLE = {
   AVAILABLE: { bg: '#ECFDF5', color: C.green, label: 'Available' },
   PARTIAL: { bg: '#FFFBEB', color: C.warnInk, label: 'Partial' },
   RETURNED: { bg: '#F1F5F9', color: C.muted, label: 'Returned' },
};

/** Scan feedback states for the §10/§11 scan-first workflow. */
export const SCAN_STATE = {
   IDLE: 'idle',
   FOUND: 'found',
   NOT_FOUND: 'notfound',
   MAX_REACHED: 'full',
   BLOCKED: 'blocked',
};
