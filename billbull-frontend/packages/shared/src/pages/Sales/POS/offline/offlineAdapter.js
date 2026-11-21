/**
 * axios adapter for the Standalone POS (M3), installed by apps/pos only.
 *
 * Online, every request goes to the network unchanged; a successful GET on the allow-list below is
 * also remembered in IndexedDB (per user and branch). When the server is unreachable:
 *   - catalogue lookups (product list, barcode resolve, salesperson badge) are answered from the
 *     offline catalogue snapshot (offlineCatalog.js);
 *   - allow-listed GETs are answered from what was remembered;
 *   - everything else fails at once as a network error, so nothing waits on a dead connection and
 *     no write is ever faked.
 *
 * The allow-list holds configuration the till needs to start and sell (settings, terminal, session,
 * tax, permissions, branch/company, print templates). It deliberately excludes customers, invoices,
 * orders, held sales, layaways, balances and statements: no personal or transactional data is kept.
 */
import axios, { AxiosError } from 'axios';
import { getCached, putCached } from './offlineDb';
import { offlineProductList, offlineResolve, offlineSalespersonLookup } from './offlineCatalog';
import { isOffline, markNetworkFailure, markNetworkSuccess } from './offlineRuntime';

export const CACHEABLE_GETS = [
  /^\/api\/auth\/(profile|me)\b/,
  /^\/api\/(user-)?permissions\b/,
  /^\/api\/roles?\/(my|current)/,
  /^\/api\/role-permissions\/(me|my|current)/,
  /^\/api\/branches\b/,
  /^\/api\/inventory\/branch-scope\/status\b/,
  /^\/api\/settings\/branch/,
  /^\/api\/company\b/,
  /^\/api\/settings\/company/,
  /^\/api\/pos\/settings\b/,
  /^\/api\/pos\/terminals\/[^/]+$/,
  /^\/api\/pos\/sessions\/active\b/,
  /^\/api\/pos\/sessions\/day-status\b/,
  /^\/api\/pos\/sessions\/\d+$/,
  /^\/api\/pos\/checkout\/capabilities\b/,
  /^\/api\/pos\/printers\b/,
  /^\/api\/pos\/devices\b/,
  /^\/api\/pos\/cash-movement-categories\b/,
  /^\/api\/pos\/denominations\b/,
  /^\/api\/branch-tax/,
  /^\/api\/tax\/branch/,
  /^\/api\/sales\/settings\b/,
  /^\/api\/sales-settings\b/,
  /^\/api\/departments\b/,
  /^\/api\/print-templates?\b/,
  /^\/api\/document-templates?\b/,
  /^\/api\/employees\/salespersons$/,
  /^\/api\/hr\/targets\/readiness\b/,
  /^\/api\/pos\/hardware-profiles?\b/,
  /^\/api\/price-levels\b/,
  /^\/api\/templates\/(resolve|family)\b/,
  /^\/api\/pos\/sessions\/\d+\/(x-report|sync)$/,
];

/**
 * POSTs whose last answer may be replayed offline. Only terminal register-or-resume: for the same
 * device fingerprint and branch it is idempotent and returns this till's terminal, which the
 * workspace needs to start. Keyed by the request body too. No other write is ever answered offline.
 */
export const REPLAYABLE_POSTS = [/^\/api\/pos\/terminals\/register$/];

const pathOf = (config) => {
  try {
    return new URL(config.url, config.baseURL || window.location.origin).pathname;
  } catch {
    return String(config.url || '').split('?')[0];
  }
};

const fullUri = (instance, config) => {
  try { return instance.getUri(config); } catch { return String(config.url); }
};

const headerOf = (config, name) => {
  const h = config.headers;
  if (!h) return null;
  return typeof h.get === 'function' ? h.get(name) : (h[name] ?? h[name.toLowerCase()] ?? null);
};

const isNetworkError = (err) => !!err && !err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED'
  || err.code === 'ETIMEDOUT' || err.message === 'Network Error');

const ok = (config, data, source) => ({
  data, status: 200, statusText: 'OK', headers: { 'x-bb-offline': source }, config, request: {},
});

const offlineError = (config) => new AxiosError('Network Error (the till is offline)', 'ERR_NETWORK', config, {});

const queryOf = (instance, config) => {
  const u = new URL(fullUri(instance, config), window.location.origin);
  return u.searchParams;
};

/** Answers a catalogue lookup from the snapshot, or returns undefined when not one. */
function fromCatalog(instance, config, path) {
  if (path === '/api/products/list') {
    const q = queryOf(instance, config);
    const page = offlineProductList({ page: q.get('page'), size: q.get('size'), search: q.get('search'), departmentId: q.get('departmentId') });
    return page ? ok(config, page, 'catalog') : undefined;
  }
  if (path === '/api/pos/resolve') {
    const r = offlineResolve(queryOf(instance, config).get('q'));
    return r ? ok(config, r, 'catalog') : undefined;
  }
  const sp = path.match(/^\/api\/employees\/salespersons\/by-code\/([^/]+)$/);
  if (sp) {
    const found = offlineSalespersonLookup(decodeURIComponent(sp[1]));
    if (found === null) return undefined;
    if (found) return ok(config, found, 'catalog');
    const err = new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config, {}, {
      data: { message: 'This employee is not on the offline salesperson list.' }, status: 400, statusText: 'Bad Request', headers: {}, config,
    });
    throw err;
  }
  return undefined;
}

export function installOfflineAdapter(instance) {
  const base = axios.getAdapter(instance.defaults.adapter || axios.defaults.adapter);
  const log = [];
  if (typeof window !== 'undefined') window.__bbOfflineRequestLog = log;

  instance.defaults.adapter = async (config) => {
    const method = String(config.method || 'get').toLowerCase();
    const path = pathOf(config);
    const isGet = method === 'get';
    const cacheable = !config.offlineBypass && (isGet
      ? CACHEABLE_GETS.some((re) => re.test(path))
      : method === 'post' && REPLAYABLE_POSTS.some((re) => re.test(path)));
    const key = cacheable
      ? `${sessionStorage.getItem('user') || ''}|${headerOf(config, 'X-Branch-Id') || ''}|${method}|${fullUri(instance, config)}${isGet ? '' : `|${typeof config.data === 'string' ? config.data : JSON.stringify(config.data ?? null)}`}`
      : null;
    const entry = { method, path, at: Date.now(), offline: isOffline(), outcome: null };
    if (log.length < 500) log.push(entry);

    const serveOffline = async () => {
      if (isGet && !config.offlineBypass) {
        const synth = fromCatalog(instance, config, path);
        if (synth) { entry.outcome = 'catalog'; return synth; }
      }
      if (cacheable) {
        const row = await getCached(key).catch(() => null);
        if (row) { entry.outcome = 'cache'; return ok(config, row.data, 'cache'); }
      }
      entry.outcome = cacheable ? 'cache-miss' : 'refused-offline';
      throw offlineError(config);
    };

    if (isOffline() && !config.offlineBypass) return serveOffline();

    try {
      const res = await base(config);
      markNetworkSuccess();
      entry.outcome = `network ${res.status}`;
      if (cacheable && res.status >= 200 && res.status < 300) {
        void putCached({ key, data: res.data, storedAt: new Date().toISOString() }).catch(() => {});
      }
      return res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      markNetworkFailure();
      if (config.offlineBypass) throw err;
      return serveOffline();
    }
  };
}
