// Pure helpers for the Live Clients page (kept out of the component so they can be unit-tested).

export const REFRESH_MS = 30_000;

export const APP_LABEL = {
  RETAIL: 'Retail web',
  POS: 'POS till',
  POS_DESKTOP: 'POS desktop app',
  OTHER: 'Other',
};

export const CONNECTION_LABEL = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  OUTDATED: 'Needs update',
  UNREACHABLE: 'Unreachable',
  AUTH_FAILED: 'Auth failed',
  AGENT_OFF: 'Agent off',
  NOT_CONFIGURED: 'Not connected',
  ERROR: 'Error',
};

/** Rows that can't report presence at all (vs. reporting "nobody online"). */
export const isProblem = (row) => !['ONLINE', 'OFFLINE'].includes(row?.connection);

/** "Chrome on Windows", "Safari on iPhone", "BillBull POS app on Windows". */
export function describeDevice(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return { browser: 'Unknown', os: 'unknown device', mobile: false, label: 'Unknown device' };
  let os = 'unknown OS';
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'Mac';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let browser = 'Browser';
  if (/Electron\//.test(ua)) browser = 'BillBull POS app';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/^(curl|axios|PostmanRuntime|python|Java)/i.test(ua)) browser = 'API client';
  const mobile = /Mobile|iPhone|Android/.test(ua) && !/iPad/.test(ua);
  return { browser, os, mobile, label: `${browser} on ${os}` };
}

export const initials = (name) =>
  String(name || '?')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

const deviceMatches = (d, q) =>
  [d.username, d.fullName, d.ip, d.branchName, ...(d.roles || [])].some((v) => String(v || '').toLowerCase().includes(q));

/** Client rows for a tab ('all' | 'online' | 'offline' | 'problems') and a search over clients and logins. */
export function filterClients(rows, { view = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (view === 'online' && r.connection !== 'ONLINE') return false;
    if (view === 'offline' && r.connection === 'ONLINE') return false;
    if (view === 'problems' && !isProblem(r)) return false;
    if (!q) return true;
    if (String(r.name || '').toLowerCase().includes(q) || String(r.code || '').toLowerCase().includes(q)) return true;
    return (r.devices || []).some((d) => deviceMatches(d, q));
  });
}

/** True when a search matched one of the client's logins (so the page opens that client). */
export const matchesDevice = (row, query) => {
  const q = query.trim().toLowerCase();
  return !!q && (row.devices || []).some((d) => deviceMatches(d, q));
};

export const SORTS = {
  active: { label: 'Most active', fn: (a, b) => b.devicesOnline - a.devicesOnline || cmpTime(b.lastActivityAt, a.lastActivityAt) || cmpName(a, b) },
  recent: { label: 'Last activity', fn: (a, b) => cmpTime(b.lastActivityAt, a.lastActivityAt) || cmpName(a, b) },
  name: { label: 'Name', fn: (a, b) => cmpName(a, b) },
  sales: { label: 'Invoices today', fn: (a, b) => (b.sales?.invoicesToday ?? -1) - (a.sales?.invoicesToday ?? -1) || cmpName(a, b) },
};

export const sortClients = (rows, key = 'active') => [...(rows || [])].sort((SORTS[key] || SORTS.active).fn);

function cmpTime(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta - tb;
}

function cmpName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''));
}

/** Devices for a client: online first, newest activity first; offline ones only when asked. */
export function orderDevices(devices, showEarlier) {
  const list = [...(devices || [])].sort((a, b) => Number(b.online) - Number(a.online) || cmpTime(b.lastSeenAt, a.lastSeenAt));
  return showEarlier ? list : list.filter((d) => d.online);
}

/** "Just now" under a minute, otherwise the shared timeAgo wording. */
export const sinceLabel = (iso, timeAgo, now = Date.now()) => {
  if (!iso) return '—';
  const s = (now - new Date(iso).getTime()) / 1000;
  return s < 60 ? 'Just now' : timeAgo(iso, now);
};

export const clockTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** SVG polyline points for a series of {devices}; flat at the bottom when empty. */
export function sparkPoints(series, width, height, pad = 2) {
  const values = (series || []).map((p) => Number(p.devices) || 0);
  if (values.length === 0) return '';
  if (values.length === 1) values.push(values[0]);
  const max = Math.max(1, ...values);
  const step = (width - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(height - pad - (v / max) * (height - pad * 2)).toFixed(1)}`)
    .join(' ');
}
