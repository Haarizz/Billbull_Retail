// Pure helpers for the error-log pages (unit-tested in __tests__/errorLogic.test.js).

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'];
export const SOURCES = [
  ['SERVER', 'Server request'],
  ['CLIENT', 'Browser'],
  ['JOB', 'Background job'],
  ['LOG', 'Logged during a request'],
];
export const WINDOWS = [
  [24, 'Last 24 hours'],
  [168, 'Last 7 days'],
  [720, 'Last 30 days'],
  [0, 'Any time'],
];

export const STATUS_HELP = {
  OPEN: 'Needs attention.',
  ACKNOWLEDGED: 'Someone is on it.',
  RESOLVED: 'Fixed — reopens automatically if it happens again.',
  IGNORED: 'Known and accepted; stays hidden from the default view.',
};

export const DEFAULT_FILTERS = {
  status: 'OPEN,ACKNOWLEDGED',
  severity: '',
  module: '',
  category: '',
  source: '',
  q: '',
  sinceHours: 168,
  includeBusinessRules: false,
  sort: 'recent',
  page: 0,
};

/** Filters → query params for GET /api/errors: blanks dropped, a fixed tenant added. */
export function filtersToParams(filters, tenantId) {
  const p = {};
  Object.entries({ ...DEFAULT_FILTERS, ...filters }).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    p[k] = typeof v === 'string' ? v.trim() : v;
  });
  // The client picker on the all-clients page; a page fixed to one client wins over it.
  if (p.tenantFilter) p.tenantId = Number(p.tenantFilter);
  delete p.tenantFilter;
  if (tenantId) p.tenantId = tenantId;
  return p;
}

/** Bars for the 14-day occurrence strip: every day present, zero-filled, oldest first. */
export function dailySeries(rows, days = 14, today = new Date()) {
  const counts = new Map((rows || []).map((r) => [r.day, Number(r.n) || 0]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, n: counts.get(key) || 0 });
  }
  return out;
}

const SOURCE_LABEL = Object.fromEntries(SOURCES);
export const sourceLabel = (s) => SOURCE_LABEL[s] || s || '—';

/** The text to show under a title: the message the user (or log) saw, root cause first. */
export const shownMessage = (g) => g?.rootCauseMessage || g?.message || '';
