import { useEffect, useState } from 'react';
import { errorMessage, platformApi } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { hasRole } from '../../../auth/roles';
import { Alert, Badge, Button, Card, Spinner, Stat, Table } from '../../../ui/kit';
import { fmtBytes, fmtDate, timeAgo } from '../../../ui/format';
import { useLoad } from '../../../ui/useLoad';
import { dropIndexSql, duplicateFixSql, fkIndexSql, fmtCount, fmtMs, qualified, selectStarSql } from './sqlUtils';

export default function OptimisePanel({ tenant, onOpen }) {
  const { user } = useAuth();
  const operator = hasRole(user, 'OPERATOR');
  const owner = hasRole(user, 'OWNER');
  const { data, loading, error, reload } = useLoad(() => platformApi.dbInsights(tenant.id), [tenant.id]);
  const jobs = useLoad(() => platformApi.dbJobs(tenant.id), [tenant.id]);
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const running = (jobs.data || []).some((j) => j.status === 'RUNNING' || j.status === 'QUEUED');
  const { reload: reloadJobs } = jobs;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(reloadJobs, 3000);
    return () => clearInterval(t);
  }, [running, reloadJobs]);

  const maintain = async (action, schema, table) => {
    setMsg({ kind: '', text: '' });
    try {
      const job = await platformApi.dbMaintenance(tenant.id, { action, schema, table });
      setMsg({ kind: 'success', text: `Started: ${job.sql}` });
      reloadJobs();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  };

  /** Fixes that change the schema open in the console in write mode (OWNER) so they can be reviewed. */
  const fix = (sql) => onOpen(sql, owner ? 'WRITE' : 'READ');
  const fixLabel = owner ? 'Fix in console' : 'Show fix';

  if (loading && !data) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const cache = data.cache || {};
  const xidPct = cache.xid_age != null ? (cache.xid_age / 2_000_000_000) * 100 : null;
  const findings = (data.missingForeignKeyIndexes?.length || 0) + (data.duplicateIndexes?.length || 0)
    + (data.invalidIndexes?.length || 0) + (data.vacuumNeeded?.length || 0) + (data.sequences?.length || 0);
  const errors = Object.entries(data.errors || {});

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Table cache hit" value={cache.table_hit_pct != null ? `${cache.table_hit_pct}%` : '—'} tone={cache.table_hit_pct < 95 ? 'amber' : 'green'} />
        <Stat label="Index cache hit" value={cache.index_hit_pct != null ? `${cache.index_hit_pct}%` : '—'} tone={cache.index_hit_pct < 95 ? 'amber' : 'green'} />
        <Stat label="Wraparound used" value={xidPct != null ? `${xidPct.toFixed(2)}%` : '—'} tone={xidPct > 50 ? 'red' : xidPct > 25 ? 'amber' : 'green'} />
        <Stat label="Things to look at" value={findings} tone={findings ? 'amber' : 'green'} />
      </div>

      <Alert kind={msg.kind || 'info'}>{msg.text}</Alert>
      {errors.length > 0 && <Alert kind="warn">Some checks could not run: {errors.map(([k, v]) => `${k}: ${v}`).join('; ')}</Alert>}
      <p className="text-xs text-slate-500">
        Usage figures count from {data.statsReset ? fmtDate(data.statsReset) : 'the last PostgreSQL restart'}. An index unused over a quiet week may still matter at month end; check before dropping.
        {' '}<button type="button" className="text-sky-700 hover:underline" onClick={reload}>Re-check</button>
      </p>

      {operator && (
        <Card title="Maintenance" actions={<Button size="sm" variant="secondary" onClick={reloadJobs}>Refresh</Button>}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={running} onClick={() => maintain('ANALYZE')}>Analyze whole database</Button>
            <Button variant="secondary" size="sm" disabled={running} onClick={() => maintain('VACUUM_ANALYZE')}>Vacuum + analyze whole database</Button>
            <span className="self-center text-xs text-slate-500">Plain VACUUM / ANALYZE never lock out the till; they run in the background, one at a time.</span>
          </div>
          <Table
            rowKey={(j) => j.id}
            columns={[
              { key: 'sql', label: 'Job', className: 'font-mono text-xs' },
              { key: 'status', label: 'Status', render: (j) => <Badge value={j.status === 'RUNNING' || j.status === 'QUEUED' ? 'ONBOARDING' : j.status} label={j.status} /> },
              { key: 'requestedBy', label: 'By', className: 'text-xs' },
              { key: 'requestedAt', label: 'Started', className: 'whitespace-nowrap text-xs', render: (j) => timeAgo(j.startedAt || j.requestedAt) },
              { key: 'durationMs', label: 'Took', className: 'text-xs', render: (j) => fmtMs(j.durationMs) },
              { key: 'message', label: 'Result', className: 'text-xs text-slate-600' },
            ]}
            rows={jobs.data || []}
            empty="No maintenance run since the client's backend last started."
          />
        </Card>
      )}

      <Finding
        title="Foreign keys without an index"
        why="Joins and deletes on the parent table scan the whole child table. Indexing the foreign key column(s) is almost always worth it on tables with more than a few thousand rows."
        rows={data.missingForeignKeyIndexes}
        columns={[
          { key: 'table_name', label: 'Table', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.table_name)}</span> },
          { key: 'columns', label: 'Columns', className: 'font-mono text-xs' },
          { key: 'est_rows', label: 'Rows', className: 'text-right', render: (r) => fmtCount(r.est_rows) },
          { key: 'fix', label: '', render: (r) => <Button size="sm" variant="secondary" onClick={() => fix(fkIndexSql(r))}>{fixLabel}</Button> },
        ]}
        rowKey={(r) => r.constraint_name + r.table_name}
        footer={data.missingForeignKeyIndexes?.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => fix(data.missingForeignKeyIndexes.filter((r) => r.est_rows >= 1000).map(fkIndexSql).join('\n\n') || fkIndexSql(data.missingForeignKeyIndexes[0]))}>
            All with 1,000+ rows in one script
          </Button>
        )}
      />

      <Finding
        title="Duplicate indexes"
        why="Two indexes with the same columns cost disk and slow every write, for no gain. Keep one."
        rows={data.duplicateIndexes}
        columns={[
          { key: 'table_name', label: 'Table', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.table_name)}</span> },
          { key: 'index_names', label: 'Indexes', className: 'font-mono text-xs' },
          { key: 'size_bytes', label: 'Size', className: 'text-right', render: (r) => fmtBytes(r.size_bytes) },
          { key: 'fix', label: '', render: (r) => <Button size="sm" variant="secondary" onClick={() => fix(duplicateFixSql(r))}>{fixLabel}</Button> },
        ]}
        rowKey={(r) => r.index_names}
      />

      <Finding
        title="Invalid indexes"
        why="Left behind by a failed CREATE INDEX CONCURRENTLY. They are kept up to date on every write but never used. Drop and recreate them."
        rows={data.invalidIndexes}
        columns={[
          { key: 'index_name', label: 'Index', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.index_name)}</span> },
          { key: 'table_name', label: 'Table', className: 'font-mono text-xs' },
          { key: 'fix', label: '', render: (r) => <Button size="sm" variant="secondary" onClick={() => fix(`${dropIndexSql(r.schema, r.index_name)}\n-- then recreate it from its definition (Tables → ${r.table_name})`)}>{fixLabel}</Button> },
        ]}
        rowKey={(r) => r.index_name}
      />

      <Finding
        title="Tables that need a vacuum"
        why="Over 10% of the rows are dead (left by updates and deletes). Autovacuum is behind; a manual VACUUM ANALYZE frees the space for reuse and refreshes the planner's statistics."
        rows={data.vacuumNeeded}
        columns={[
          { key: 'table_name', label: 'Table', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.table_name)}</span> },
          { key: 'dead_rows', label: 'Dead', className: 'text-right', render: (r) => `${fmtCount(r.dead_rows)} (${r.dead_pct}%)` },
          { key: 'last_vacuum', label: 'Last vacuum', className: 'text-xs', render: (r) => timeAgo(r.last_vacuum) },
          { key: 'fix', label: '', render: (r) => operator && <Button size="sm" variant="secondary" disabled={running} onClick={() => maintain('VACUUM_ANALYZE', r.schema, r.table_name)}>Vacuum now</Button> },
        ]}
        rowKey={(r) => r.table_name}
      />

      <Finding
        title="Stale planner statistics"
        why="Many rows changed since the last ANALYZE, so PostgreSQL may pick slow plans for these tables."
        rows={data.neverAnalyzed}
        columns={[
          { key: 'table_name', label: 'Table', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.table_name)}</span> },
          { key: 'changed_since_analyze', label: 'Changed rows', className: 'text-right', render: (r) => `${fmtCount(r.changed_since_analyze)} of ${fmtCount(r.live_rows)}` },
          { key: 'fix', label: '', render: (r) => operator && <Button size="sm" variant="secondary" disabled={running} onClick={() => maintain('ANALYZE', r.schema, r.table_name)}>Analyze now</Button> },
        ]}
        rowKey={(r) => r.table_name}
      />

      <Finding
        title="Heavy sequential scans"
        why="These tables are read end to end far more often than through an index. Find the query that does it (slow queries below, or Explain in the console) and index the columns it filters or joins on."
        rows={data.sequentialScans}
        columns={[
          { key: 'table_name', label: 'Table', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.table_name)}</span> },
          { key: 'seq_scan', label: 'Seq scans', className: 'text-right', render: (r) => fmtCount(r.seq_scan) },
          { key: 'seq_tup_read', label: 'Rows read', className: 'text-right', render: (r) => fmtCount(r.seq_tup_read) },
          { key: 'idx_scan', label: 'Index scans', className: 'text-right', render: (r) => fmtCount(r.idx_scan) },
          { key: 'live_rows', label: 'Rows', className: 'text-right', render: (r) => fmtCount(r.live_rows) },
          { key: 'fix', label: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => onOpen(selectStarSql(r.schema, r.table_name, 20))}>Open</Button> },
        ]}
        rowKey={(r) => r.table_name}
      />

      <Finding
        title="Sequences more than half used"
        why="When a sequence reaches its maximum, inserts into its table fail. Move the column and sequence to bigint well before that."
        rows={data.sequences}
        columns={[
          { key: 'name', label: 'Sequence', render: (r) => <span className="font-mono text-xs">{qualified(r.schema, r.name)}</span> },
          { key: 'data_type', label: 'Type' },
          { key: 'used_pct', label: 'Used', className: 'text-right', render: (r) => `${r.used_pct}%` },
        ]}
        rowKey={(r) => r.name}
      />

      <Finding
        title="Unused indexes"
        why="Never used to read since statistics began, but updated on every insert and update. Large ones are candidates to drop. Unique and constraint indexes are not listed."
        rows={data.unusedIndexes}
        quiet
        columns={[
          { key: 'index_name', label: 'Index', render: (r) => <span className="font-mono text-xs">{r.index_name}</span> },
          { key: 'table_name', label: 'Table', className: 'font-mono text-xs' },
          { key: 'size_bytes', label: 'Size', className: 'text-right', render: (r) => fmtBytes(r.size_bytes) },
          { key: 'fix', label: '', render: (r) => <Button size="sm" variant="secondary" onClick={() => fix(dropIndexSql(r.schema, r.index_name))}>{fixLabel}</Button> },
        ]}
        rowKey={(r) => r.index_name}
      />

      <SlowQueries data={data.slowQueries} onOpen={onOpen} />
    </div>
  );
}

function Finding({ title, why, rows, columns, rowKey, footer, quiet }) {
  const [open, setOpen] = useState(false);
  const list = rows || [];
  const shown = open ? list : list.slice(0, 8);
  const count = list.length;
  return (
    <Card
      title={(
        <span className="flex items-center gap-2">
          {title}
          <Badge value={count === 0 ? 'OK' : quiet ? 'UNKNOWN' : 'DEGRADED'} label={count === 0 ? 'none' : String(count)} />
        </span>
      )}
      actions={footer}
    >
      <p className="mb-2 text-xs text-slate-500">{why}</p>
      {count > 0 && (
        <>
          <Table columns={columns} rows={shown} rowKey={rowKey} />
          {count > 8 && (
            <button type="button" className="mt-2 text-xs text-sky-700 hover:underline" onClick={() => setOpen(!open)}>
              {open ? 'Show fewer' : `Show all ${count}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function SlowQueries({ data, onOpen }) {
  if (!data) return null;
  if (!data.available) {
    return (
      <Card title="Slowest queries">
        <p className="text-sm text-slate-600">{data.hint}</p>
      </Card>
    );
  }
  return (
    <Card title="Slowest queries (by total time)">
      <Table
        rowKey={(q) => q.query}
        columns={[
          { key: 'query', label: 'Query', render: (q) => <code className="line-clamp-3 block max-w-2xl whitespace-pre-wrap break-all text-[11px] text-slate-700">{q.query}</code> },
          { key: 'calls', label: 'Calls', className: 'text-right', render: (q) => fmtCount(q.calls) },
          { key: 'total_ms', label: 'Total', className: 'text-right whitespace-nowrap', render: (q) => fmtMs(Math.round(Number(q.total_ms))) },
          { key: 'mean_ms', label: 'Mean', className: 'text-right whitespace-nowrap', render: (q) => `${q.mean_ms} ms` },
          { key: 'open', label: '', render: (q) => <Button size="sm" variant="ghost" onClick={() => onOpen(`-- Replace $1, $2 … with real values, then Explain\n${q.query}`)}>Open</Button> },
        ]}
        rows={data.queries || []}
        empty="No statistics yet."
      />
    </Card>
  );
}
