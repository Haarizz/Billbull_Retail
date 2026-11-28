// Pure helpers for the database console. The client's server is the authority on what may run
// (see the agent's SqlGuard); these only make the editor pleasant.

/**
 * Splits editor text into statements on top-level semicolons, skipping '…', "…", $tag$…$tag$,
 * -- and /* *\/ comments. Each entry keeps its offsets so the statement under the cursor can be found.
 */
export function splitStatements(text) {
  const s = String(text || '');
  const out = [];
  let start = 0;
  let i = 0;
  const push = (end) => {
    const raw = s.slice(start, end);
    if (raw.trim()) out.push({ start, end, text: raw.trim() });
    start = end + 1;
  };
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '-' && n === '-') {
      while (i < s.length && s[i] !== '\n') i += 1;
    } else if (c === '/' && n === '*') {
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        if (s[i] === '/' && s[i + 1] === '*') { depth += 1; i += 2; } else if (s[i] === '*' && s[i + 1] === '/') { depth -= 1; i += 2; } else i += 1;
      }
    } else if (c === "'" || c === '"') {
      i += 1;
      while (i < s.length) {
        if (s[i] === c) {
          if (s[i + 1] === c) { i += 2; continue; }
          break;
        }
        i += 1;
      }
      i += 1;
    } else if (c === '$' && (i === 0 || !/[A-Za-z0-9_$]/.test(s[i - 1]))) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i));
      if (m) {
        const end = s.indexOf(m[0], i + m[0].length);
        i = end < 0 ? s.length : end + m[0].length;
      } else i += 1;
    } else if (c === ';') {
      push(i);
      i += 1;
    } else {
      i += 1;
    }
  }
  push(s.length);
  return out;
}

/** The selection if there is one, else the statement the cursor is in (or just after). */
export function statementAt(text, selStart = 0, selEnd = selStart) {
  const s = String(text || '');
  if (selEnd > selStart) {
    const sel = s.slice(selStart, selEnd).trim();
    if (sel) return sel;
  }
  const parts = splitStatements(s);
  if (parts.length === 0) return '';
  const hit = parts.find((p) => selStart >= p.start && selStart <= p.end + 1);
  if (hit) return hit.text;
  const before = parts.filter((p) => p.end < selStart);
  return (before[before.length - 1] || parts[0]).text;
}

const READ_WORDS = new Set(['select', 'with', 'explain', 'show', 'values', 'table']);

export const firstKeyword = (sql) => {
  const stripped = String(sql || '').replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const m = /^[\s(]*([a-z_]+)/i.exec(stripped);
  return m ? m[1].toLowerCase() : '';
};

/** True when read mode will certainly refuse it, so the UI can suggest write mode. */
export const needsWriteMode = (sql) => {
  const k = firstKeyword(sql);
  return !!k && !READ_WORDS.has(k);
};

/** Mirrors the agent's "destructive" rule so the confirm step appears before the round trip. */
export const looksDestructive = (sql) => {
  const k = firstKeyword(sql);
  const low = String(sql || '').toLowerCase();
  return k === 'drop' || k === 'truncate'
    || ((k === 'delete' || k === 'update') && !/\bwhere\b/.test(low))
    || /^\s*alter\s+table\b[\s\S]*\bdrop\b/.test(low);
};

const PLAIN_IDENT = /^[a-z_][a-z0-9_]*$/;
const RESERVED = new Set(['user', 'order', 'group', 'table', 'select', 'from', 'where', 'limit', 'offset', 'all', 'check', 'default', 'desc', 'asc', 'end', 'to', 'grant', 'primary', 'references', 'when', 'case', 'column', 'constraint', 'analyse', 'analyze']);

export const quoteIdent = (name) => {
  const s = String(name ?? '');
  return PLAIN_IDENT.test(s) && !RESERVED.has(s) ? s : `"${s.replace(/"/g, '""')}"`;
};

export const qualified = (schema, name) => (schema && schema !== 'public' ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name));

export const selectStarSql = (schema, name, limit = 100) => `SELECT *\nFROM ${qualified(schema, name)}\nLIMIT ${limit};`;

/** CREATE INDEX for a foreign key that has none. `columns` arrives already quoted by the server. */
export const fkIndexSql = (item) => {
  const cols = String(item.columns || '');
  const base = `idx_${item.table_name}_${cols.replace(/"/g, '').replace(/[^a-z0-9]+/gi, '_')}`.toLowerCase().slice(0, 63).replace(/_+$/, '');
  return `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdent(base)}\n  ON ${qualified(item.schema, item.table_name)} (${cols});`;
};

export const dropIndexSql = (schema, indexName) => `DROP INDEX CONCURRENTLY IF EXISTS ${qualified(schema, indexName)};`;

/** For a duplicate set, keep the first index and drop the rest. */
export const duplicateFixSql = (item) => String(item.index_names || '')
  .split(',').map((x) => x.trim()).filter(Boolean).slice(1)
  .map((n) => dropIndexSql(item.schema, n)).join('\n');

const formulaStart = /^[=+\-@\t\r]/;

/** RFC 4180 CSV; text that a spreadsheet would run as a formula gets a leading apostrophe. */
export function toCsv(columns, rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && formulaStart.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.name)).join(',');
  return [head, ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtCount = (n) => (n == null ? '—' : Number(n).toLocaleString());

export const fmtMs = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
};

export const fmtSeconds = (s) => (s == null ? '—' : fmtMs(Math.round(Number(s) * 1000)));

/** Ready-made read-only queries for the Snippets menu. */
export const SNIPPETS = [
  { label: 'Largest tables', sql: `SELECT n.nspname AS schema, c.relname AS table_name,\n       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,\n       pg_size_pretty(pg_indexes_size(c.oid)) AS indexes,\n       c.reltuples::bigint AS est_rows\nFROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace\nWHERE c.relkind = 'r' AND n.nspname = 'public'\nORDER BY pg_total_relation_size(c.oid) DESC\nLIMIT 25;` },
  { label: 'Row counts (exact, slow)', sql: `SELECT relname AS table_name, n_live_tup AS live_rows, n_dead_tup AS dead_rows\nFROM pg_stat_user_tables\nORDER BY n_live_tup DESC;` },
  { label: 'Long-running queries', sql: `SELECT pid, now() - query_start AS running_for, state, wait_event, left(query, 200) AS query\nFROM pg_stat_activity\nWHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()\nORDER BY query_start;` },
  { label: 'Blocked sessions', sql: `SELECT pid, pg_blocking_pids(pid) AS blocked_by, now() - query_start AS waiting_for, left(query, 200) AS query\nFROM pg_stat_activity\nWHERE cardinality(pg_blocking_pids(pid)) > 0;` },
  { label: 'Index usage per table', sql: `SELECT relname AS table_name, seq_scan, idx_scan,\n       round(100.0 * idx_scan / nullif(seq_scan + idx_scan, 0), 1) AS idx_pct, n_live_tup AS live_rows\nFROM pg_stat_user_tables\nORDER BY seq_scan DESC\nLIMIT 30;` },
  { label: 'Flyway migrations (latest 20)', sql: `SELECT installed_rank, version, description, success, installed_on, execution_time\nFROM flyway_schema_history\nORDER BY installed_rank DESC\nLIMIT 20;` },
  { label: 'Columns of a table', sql: `SELECT column_name, data_type, is_nullable, column_default\nFROM information_schema.columns\nWHERE table_schema = 'public' AND table_name = 'products'\nORDER BY ordinal_position;` },
  { label: 'Recent sales invoices', sql: `SELECT *\nFROM sales_invoices\nORDER BY created_at DESC\nLIMIT 50;` },
  { label: 'Active users', sql: `SELECT id, username, email, is_active, created_at\nFROM users\nORDER BY created_at DESC\nLIMIT 100;` },
  { label: 'Server settings', sql: `SELECT name, setting, unit, short_desc\nFROM pg_settings\nWHERE name IN ('shared_buffers','work_mem','maintenance_work_mem','effective_cache_size','max_connections','random_page_cost')\nORDER BY name;` },
];

// --- per-tab query history (sessionStorage: it may hold literal values, so it dies with the tab) ---

const historyKey = (tenantId) => `billbull.platform.dbHistory.${tenantId}`;

export function loadHistory(tenantId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(historyKey(tenantId)) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function pushHistory(tenantId, entry, max = 30) {
  const list = [entry, ...loadHistory(tenantId).filter((h) => h.sql !== entry.sql || h.mode !== entry.mode)].slice(0, max);
  try {
    sessionStorage.setItem(historyKey(tenantId), JSON.stringify(list));
  } catch {
    // storage unavailable: history lasts until reload
  }
  return list;
}
