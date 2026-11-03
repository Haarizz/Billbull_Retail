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
// Backend 403 when a new terminal would exceed the branch cap (PosTerminalService.registerOrRefresh):
// "Maximum number of terminals (N) reached for this branch." The server reports only the limit,
// not how many terminals are in use, so only the limit is shown.
const TERMINAL_LIMIT_PATTERN = /^Maximum number of terminals \((\d+)\) reached\b/i;

export function terminalLimitConfig(limit) {
  return {
    title: 'Terminal Limit Reached',
    message: `Branch terminal limit reached (limit: ${limit}). Archive an unused terminal or increase the branch terminal limit.`,
    // Registering again would hit the same cap, so offer no register button.
    allowRegisterNew: false,
    hint: 'Ask an administrator to archive an unused terminal or raise the limit in Console > Terminals & Counters, then reload this page.',
  };
}

// Server text that suggests an internal error rather than a message written for users.
const INTERNAL_DETAIL_PATTERN = /exception|\bat [\w$.]+\(|\bsql|jdbc|hibernate|\b(org|java|javax|jakarta|com)\.[a-z]|constraint|syntax error|<\/?[a-z!]/i;
const MAX_SERVER_MESSAGE_LENGTH = 200;

// Returns the server message when it is safe to show a user, otherwise null.
export function safeServerMessage(rawMessage) {
  if (typeof rawMessage !== 'string') return null;
  const text = rawMessage.trim();
  if (!text || text.length > MAX_SERVER_MESSAGE_LENGTH || /[\r\n]/.test(text)) return null;
  if (INTERNAL_DETAIL_PATTERN.test(text)) return null;
  return text;
}

export function resolveTerminalUnavailableConfig(rawMessage) {
  const match = typeof rawMessage === 'string' ? rawMessage.match(/^Terminal is (\w+)$/) : null;
  const status = match ? match[1] : null;
  if (TERMINAL_UNAVAILABLE_STATUS_CONFIG[status]) {
    return { status, ...TERMINAL_UNAVAILABLE_STATUS_CONFIG[status] };
  }
  const serverMessage = safeServerMessage(rawMessage);
  const limitMatch = serverMessage ? serverMessage.match(TERMINAL_LIMIT_PATTERN) : null;
  if (limitMatch) {
    return { status: null, ...terminalLimitConfig(Number(limitMatch[1])) };
  }
  if (serverMessage) {
    return { status, ...TERMINAL_UNAVAILABLE_FALLBACK, message: serverMessage };
  }
  return { status, ...TERMINAL_UNAVAILABLE_FALLBACK };
}

// Asked before "Register as New Terminal" wipes this device's terminal identity and reloads.
export const REGISTER_NEW_TERMINAL_CONFIRM = {
  title: 'Register as a new terminal?',
  message: 'This will assign a new independent terminal to this device.',
  confirmLabel: 'Register new terminal',
  tone: 'warning',
};
