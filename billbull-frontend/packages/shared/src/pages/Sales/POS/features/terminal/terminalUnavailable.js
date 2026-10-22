// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged; only the location moved.

// Backend 403 reason strings for terminal-unavailable are always exactly "Terminal is {STATUS}"
// (PosTerminalService.terminalUnavailable) — parsed here so the dialog can branch per-status
// instead of showing one undifferentiated message for every cause. See
// BillBull-POS-Terminal-Archive-Lifecycle-Review.html Part 08/10.
export const TERMINAL_UNAVAILABLE_STATUS_CONFIG = {
  ARCHIVED: {
    title: 'Terminal Archived',
    message: 'This terminal has been archived by an administrator. It can be restored — your sales history and settings will be preserved — or you can register this device as a new terminal.',
    allowRegisterNew: true,
    registerLabel: 'Register as New Terminal',
    hint: 'Ask an admin to restore it from Console > Terminals & Counters if you\'d rather keep this device\'s history than register fresh.',
  },
  BLOCKED: {
    title: 'Terminal Blocked',
    message: 'This terminal has been blocked by an administrator. Registering a new terminal is not available while a block is in effect.',
    allowRegisterNew: false,
    hint: 'Contact an administrator to resolve this before using this device.',
  },
  MAINTENANCE: {
    title: 'Terminal Under Maintenance',
    message: 'This terminal is temporarily unavailable for maintenance. Registering a new terminal is not available until maintenance ends.',
    allowRegisterNew: false,
    hint: 'Try again shortly, or contact an administrator.',
  },
  DECOMMISSIONED: {
    title: 'Terminal Permanently Retired',
    message: 'This terminal has been permanently retired and cannot be restored. Register this device as a new terminal to continue.',
    allowRegisterNew: true,
    registerLabel: 'Register as New Terminal',
    hint: null,
  },
};
export const TERMINAL_UNAVAILABLE_FALLBACK = {
  title: 'Terminal Not Available',
  message: 'This device\'s previously-registered terminal was archived, blocked, decommissioned, or is in maintenance.',
  allowRegisterNew: true,
  registerLabel: 'Register as New Terminal',
  hint: 'Ask an admin to restore it from Console > Terminals & Counters, or register this device as a brand-new terminal below (consumes a new terminal slot).',
};
export function resolveTerminalUnavailableConfig(rawMessage) {
  const match = typeof rawMessage === 'string' ? rawMessage.match(/^Terminal is (\w+)$/) : null;
  const status = match ? match[1] : null;
  return { status, ...(TERMINAL_UNAVAILABLE_STATUS_CONFIG[status] || TERMINAL_UNAVAILABLE_FALLBACK) };
}
