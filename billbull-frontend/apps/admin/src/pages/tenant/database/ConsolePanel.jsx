import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, platformApi } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { hasRole } from '../../../auth/roles';
import { Alert, Button, Card, Input, Select, Spinner } from '../../../ui/kit';
import { fmtDate } from '../../../ui/format';
import { useLoad } from '../../../ui/useLoad';
import CapabilityHint from './CapabilityHint';
import { useStepUp } from './stepUp';
import {
  SNIPPETS, downloadText, firstKeyword, fmtCount, fmtMs, loadHistory, looksDestructive, needsWriteMode,
  pushHistory, quoteIdent, selectStarSql, statementAt, toCsv,
} from './sqlUtils';

const ROW_LIMITS = [100, 500, 1000, 5000, 20000];
const TIMEOUTS = [15, 30, 60, 120, 300, 600];

export default function ConsolePanel({ tenant, caps, draft }) {
  const { user } = useAuth();
  const owner = hasRole(user, 'OWNER');
  const operator = hasRole(user, 'OPERATOR');
  const editor = useRef(null);
  const stepUp = useStepUp();
  const [sql, setSql] = useState('SELECT *\nFROM products\nLIMIT 100;');
  const [mode, setMode] = useState('READ');
  const [maxRows, setMaxRows] = useState(500);
  const [timeout, setTimeoutSeconds] = useState(30);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState(() => loadHistory(tenant.id));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!draft.nonce) return;
    setSql(draft.sql);
    if (draft.mode === 'WRITE' && !owner) {
      setMode('READ');
      setNotice('That fix changes the database. Only an OWNER can run it; copy it to them.');
    } else {
      setMode(draft.mode);
      setNotice(draft.mode === 'WRITE' ? 'Loaded in write mode. Review it, give a reason and run a preview first.' : '');
    }
    setTimeout(() => editor.current?.focus(), 0);
  }, [draft.nonce, draft.sql, draft.mode, owner]);

  const limits = ROW_LIMITS.filter((n) => n <= (caps.maxRows || 5000));
  const timeouts = TIMEOUTS.filter((n) => n <= (caps.maxTimeoutSeconds || 120));
  const canRun = caps.console && operator && (mode === 'READ' || (caps.writes && owner));

  const currentStatement = () => {
    const ta = editor.current;
    return statementAt(sql, ta?.selectionStart ?? 0, ta?.selectionEnd ?? 0);
  };

  const insertAtCursor = (text) => {
    const ta = editor.current;
    if (!ta) {
      setSql((s) => s + text);
      return;
    }
    const { selectionStart: a, selectionEnd: b } = ta;
    const next = sql.slice(0, a) + text + sql.slice(b);
    setSql(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a + text.length;
    }, 0);
  };

  const run = async (kind) => {
    const stmt = currentStatement();
    if (!stmt) return;
    setNotice('');
    if (kind === 'run' && mode === 'READ' && needsWriteMode(stmt)) {
      setResult({ clientError: `${firstKeyword(stmt).toUpperCase()} changes the database. Read mode only runs queries${owner ? ' — switch to Write mode.' : '; an OWNER can run it in Write mode.'}` });
      return;
    }
    let confirmDestructive = false;
    if (kind === 'run' && mode === 'WRITE') {
      if (reason.trim().length < 10) {
        setResult({ clientError: 'Say why you are changing data (10+ characters). It goes into both audit logs.' });
        return;
      }
      if (looksDestructive(stmt)) {
        const typed = window.prompt(`This drops, truncates or changes every row of a table on ${tenant.name}.\n\nType the client code "${tenant.code}" to ${preview ? 'preview' : 'run'} it.`);
        if (typed?.trim() !== tenant.code) return;
        confirmDestructive = true;
      }
    }
    setBusy(kind);
    try {
      if (kind === 'run') {
        const body = {
          sql: stmt,
          mode,
          maxRows,
          timeoutSeconds: timeout,
          dryRun: mode === 'WRITE' ? preview : undefined,
          confirmDestructive,
          reason: mode === 'WRITE' ? reason.trim() : undefined,
        };
        const r = await stepUp.run((code) => platformApi.dbQuery(tenant.id, { ...body, code }), `Changing ${tenant.name}'s data`);
        if (r === null) return;
        setResult({ ...r, sql: stmt });
        setPlan(null);
        setHistory(pushHistory(tenant.id, { sql: stmt, mode, at: new Date().toISOString(), ok: r.ok }));
      } else {
        const r = await platformApi.dbExplain(tenant.id, { sql: stmt, analyze: kind === 'analyze', timeoutSeconds: timeout });
        setPlan({ ...r, sql: stmt });
      }
    } catch (e) {
      setResult({ clientError: errorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canRun && !busy) run(e.shiftKey ? 'explain' : 'run');
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insertAtCursor('  ');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <SchemaBrowser tenantId={tenant.id} onTable={(s, n) => setSql(selectStarSql(s, n))} onColumn={(c) => insertAtCursor(quoteIdent(c))} />

      <div className="min-w-0 space-y-4">
        {!caps.console && <CapabilityHint what="console" />}
        {notice && <Alert kind="info">{notice}</Alert>}

        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md ring-1 ring-slate-300" role="group" aria-label="Mode">
              <button type="button" onClick={() => setMode('READ')}
                className={`rounded-l-md px-3 py-1.5 text-sm ${mode === 'READ' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                Read only
              </button>
              <button type="button" onClick={() => owner && setMode('WRITE')} disabled={!owner}
                title={owner ? 'INSERT / UPDATE / DELETE / DDL' : 'Only an OWNER can change data'}
                className={`rounded-r-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'WRITE' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                Write
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">Rows
              <span className="w-24"><Select value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))}>{limits.map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}</Select></span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">Timeout
              <span className="w-24"><Select value={timeout} onChange={(e) => setTimeoutSeconds(Number(e.target.value))}>{timeouts.map((n) => <option key={n} value={n}>{n} s</option>)}</Select></span>
            </label>
            <span className="w-44">
              <Select value="" onChange={(e) => { const s = SNIPPETS[Number(e.target.value)]; if (s) setSql(s.sql); }} aria-label="Snippets">
                <option value="">Snippets…</option>
                {SNIPPETS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
              </Select>
            </span>
            <span className="w-44">
              <Select value="" onChange={(e) => { const h = history[Number(e.target.value)]; if (h) { setSql(h.sql); if (h.mode === 'WRITE' && owner) setMode('WRITE'); } }} aria-label="History">
                <option value="">History ({history.length})…</option>
                {history.map((h, i) => <option key={`${h.at}-${i}`} value={i}>{h.mode === 'WRITE' ? '✎ ' : ''}{h.sql.replace(/\s+/g, ' ').slice(0, 70)}</option>)}
              </Select>
            </span>
          </div>

          <textarea
            ref={editor}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            rows={10}
            aria-label="SQL"
            className={`block w-full resize-y rounded-md border bg-slate-950 p-3 font-mono text-[13px] leading-relaxed text-slate-100 caret-amber-300 focus:outline-none focus:ring-2 ${mode === 'WRITE' ? 'border-red-500 focus:ring-red-300' : 'border-slate-700 focus:ring-amber-300'}`}
          />

          {mode === 'WRITE' && (
            <div className="mt-3 space-y-3 rounded-md border border-red-200 bg-red-50/60 p-3">
              {!caps.writes ? <CapabilityHint what="writes" /> : (
                <>
                  <p className="text-sm text-red-800">
                    Write mode changes {tenant.name}&apos;s live data. Each statement is recorded with your name and reason on the platform and in the client&apos;s own audit log.
                    Running for real needs a code from your authenticator app.
                  </p>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. ticket #123: fix wrong VAT on invoice SI-1042" aria-label="Reason" />
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} className="h-4 w-4 accent-slate-900" />
                      Preview only (roll back)
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant={mode === 'WRITE' && !preview ? 'danger' : 'accent'} disabled={!canRun || !!busy} onClick={() => run('run')}>
              {busy === 'run' ? 'Running…' : mode === 'WRITE' ? (preview ? 'Preview' : 'Run & commit') : 'Run'}
            </Button>
            <Button variant="secondary" disabled={!caps.console || !operator || !!busy} onClick={() => run('explain')}>{busy === 'explain' ? 'Planning…' : 'Explain'}</Button>
            <Button variant="secondary" disabled={!caps.console || !operator || !!busy} onClick={() => run('analyze')} title="Runs the query in a read-only transaction and reports real timings">
              {busy === 'analyze' ? 'Analyzing…' : 'Explain analyze'}
            </Button>
            <span className="text-xs text-slate-500">Runs the selection, or the statement under the cursor. Ctrl/⌘+Enter runs, +Shift explains.</span>
          </div>
        </Card>

        {plan && <PlanView plan={plan} onClose={() => setPlan(null)} />}
        {result && <ResultView result={result} tenant={tenant} />}
        {stepUp.modal}
      </div>
    </div>
  );
}

function SchemaBrowser({ tenantId, onTable, onColumn }) {
  const { data, loading, error, reload } = useLoad(() => platformApi.dbTables(tenantId), [tenantId]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState({});
  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data || []).filter((t) => !f || t.name.toLowerCase().includes(f)).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, filter]);

  const toggle = async (t) => {
    const key = `${t.schema}.${t.name}`;
    if (open[key]) {
      setOpen((o) => ({ ...o, [key]: undefined }));
      return;
    }
    setOpen((o) => ({ ...o, [key]: 'loading' }));
    try {
      const d = await platformApi.dbTable(tenantId, t.schema, t.name);
      setOpen((o) => ({ ...o, [key]: d.columns || [] }));
    } catch {
      setOpen((o) => ({ ...o, [key]: [] }));
    }
  };

  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden lg:flex lg:flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 p-3">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${data ? data.length : ''} tables`} aria-label="Filter tables" />
        <button type="button" onClick={reload} className="text-xs text-slate-500 hover:text-slate-800" title="Reload">↻</button>
      </div>
      <div className="max-h-80 overflow-auto p-1 text-sm lg:max-h-none lg:flex-1">
        {loading && !data && <Spinner />}
        {error && <div className="p-2 text-xs text-red-600">{error}</div>}
        {list.map((t) => {
          const key = `${t.schema}.${t.name}`;
          const cols = open[key];
          return (
            <div key={key}>
              <div className="group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-amber-50">
                <button type="button" onClick={() => toggle(t)} className="w-4 text-xs text-slate-400" aria-label={`Columns of ${t.name}`}>{cols ? '▾' : '▸'}</button>
                <button type="button" onClick={() => onTable(t.schema, t.name)} className="min-w-0 flex-1 truncate text-left font-mono text-xs text-slate-700" title={`${key} — ${t.kind}, ~${fmtCount(t.est_rows)} rows`}>
                  {t.schema !== 'public' ? `${t.schema}.` : ''}{t.name}
                </button>
                <span className="text-[10px] text-slate-400">{t.kind === 'table' ? fmtCount(t.est_rows) : t.kind}</span>
              </div>
              {cols === 'loading' && <div className="pl-7 text-xs text-slate-400">Loading…</div>}
              {Array.isArray(cols) && cols.map((c) => (
                <button key={c.name} type="button" onClick={() => onColumn(c.name)} className="flex w-full items-center gap-2 rounded py-0.5 pl-7 pr-2 text-left text-xs hover:bg-slate-50" title={c.comment || ''}>
                  <span className={`truncate font-mono ${c.primary_key ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{c.name}</span>
                  <span className="ml-auto truncate text-[10px] text-slate-400">{c.type}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** "line 3, column 7" for an error position (1-based character offset into the statement). */
const lineCol = (sql, position) => {
  if (!position) return '';
  const before = String(sql || '').slice(0, position - 1).split('\n');
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
};

function ResultView({ result, tenant }) {
  const [copied, setCopied] = useState('');
  if (result.clientError) return <Alert>{result.clientError}</Alert>;
  if (!result.ok) {
    const e = result.error || {};
    return (
      <Alert>
        <div className="font-medium">{e.message}</div>
        {e.detail && <div className="mt-1">Detail: {e.detail}</div>}
        {e.hint && <div className="mt-1">Hint: {e.hint}</div>}
        <div className="mt-1 text-xs opacity-80">
          {e.sqlState && <>SQLSTATE {e.sqlState}</>}{e.position ? ` · at ${lineCol(result.sql, e.position)}` : ''} · {fmtMs(result.durationMs)}
          {result.mode === 'WRITE' && ' · nothing was changed'}
        </div>
      </Alert>
    );
  }

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  };

  const hasRows = Array.isArray(result.columns);
  const summary = hasRows
    ? `${fmtCount(result.rowCount)} row${result.rowCount === 1 ? '' : 's'}${result.truncated ? ' (more not shown — raise the row limit or add LIMIT/WHERE)' : ''}`
    : `${fmtCount(result.updateCount)} row${result.updateCount === 1 ? '' : 's'} affected`;
  const tag = result.mode === 'WRITE' ? (result.committed ? 'Committed' : 'Rolled back (preview)') : null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return (
    <Card
      title={(
        <span className="flex flex-wrap items-center gap-2">
          {summary}
          {tag && <span className={`rounded-full px-2 py-0.5 text-xs ${result.committed ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}`}>{tag}</span>}
          <span className="text-xs font-normal text-slate-500">{result.statement} · {fmtMs(result.durationMs)}</span>
        </span>
      )}
      actions={hasRows && result.rows.length > 0 && (
        <>
          <Button size="sm" variant="secondary" onClick={() => copy('csv', toCsv(result.columns, result.rows))}>{copied === 'csv' ? 'Copied' : 'Copy CSV'}</Button>
          <Button size="sm" variant="secondary" onClick={() => copy('json', JSON.stringify(result.rows.map((r) => Object.fromEntries(result.columns.map((c, i) => [c.name, r[i]]))), null, 2))}>
            {copied === 'json' ? 'Copied' : 'Copy JSON'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => downloadText(`${tenant.code}-query-${stamp}.csv`, toCsv(result.columns, result.rows))}>Download CSV</Button>
        </>
      )}
    >
      {result.cellsClipped && <div className="mb-2 text-xs text-amber-700">Some long values were cut at 4,000 characters.</div>}
      {hasRows ? <ResultGrid columns={result.columns} rows={result.rows} /> : (
        <p className="text-sm text-slate-600">
          {result.mode === 'WRITE' && !result.committed
            ? 'Nothing was saved. Untick "Preview only" and run again to commit.'
            : 'Done.'}
        </p>
      )}
    </Card>
  );
}

function ResultGrid({ columns, rows }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400">No rows.</p>;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium text-slate-400">#</th>
            {columns.map((c, i) => (
              <th key={`${c.name}-${i}`} className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700 whitespace-nowrap">
                {c.name} <span className="font-normal text-slate-400">{c.type}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r, ri) => (
            <tr key={ri} className="odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/60">
              <td className="border-r border-slate-100 px-2 py-1 text-right text-slate-400">{ri + 1}</td>
              {r.map((v, ci) => (
                <td key={ci} className={`max-w-xs truncate border-r border-slate-100 px-2 py-1 ${typeof v === 'number' ? 'text-right' : ''}`} title={v == null ? 'NULL' : String(v)}>
                  {v == null ? <span className="italic text-slate-400">NULL</span> : typeof v === 'boolean' ? String(v) : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanView({ plan, onClose }) {
  if (!plan.ok) {
    return <Alert>{plan.error?.message}{plan.error?.hint ? ` — ${plan.error.hint}` : ''}</Alert>;
  }
  const lines = String(plan.plan || '').split('\n');
  const seq = lines.some((l) => /Seq Scan/.test(l));
  return (
    <Card title={`Query plan${plan.analyze ? ' (executed, read-only)' : ''} · ${fmtMs(plan.durationMs)}`} actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      {seq && <p className="mb-2 text-xs text-amber-700">Seq Scan reads the whole table. On a large table, an index on the filtered or joined columns usually helps.</p>}
      <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
        {lines.map((l, i) => (
          <div key={i} className={/Seq Scan/.test(l) ? 'text-amber-300' : /actual time|Execution Time|Planning Time/.test(l) ? 'text-sky-200' : ''}>{l || ' '}</div>
        ))}
      </pre>
      <p className="mt-2 text-xs text-slate-400">Run at {fmtDate(new Date().toISOString())}</p>
    </Card>
  );
}
