import { useCallback, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { platformApi } from '../../../api/client';
import { Alert, Badge, Button, Card, Spinner, Stat, Table } from '../../../ui/kit';
import { fmtBytes, fmtDate, fmtUptime } from '../../../ui/format';
import { useLoad } from '../../../ui/useLoad';
import { fmtCount, selectStarSql } from './sqlUtils';
import ConsolePanel from './ConsolePanel';
import TablesPanel from './TablesPanel';
import OptimisePanel from './OptimisePanel';
import ActivityPanel from './ActivityPanel';
import BackupsPanel from './BackupsPanel';

const SUB_TABS = [
  ['overview', 'Overview'],
  ['console', 'SQL console'],
  ['tables', 'Tables'],
  ['optimise', 'Optimise'],
  ['activity', 'Activity'],
  ['backups', 'Backups'],
];

/**
 * The database console for one client. Everything goes through the platform → the client's signed
 * agent → its own database; the client's server decides what is switched on (capabilities).
 */
export default function DatabaseTab({ tenant }) {
  const base = `/tenants/${tenant.id}/database`;
  const navigate = useNavigate();
  const overview = useLoad(() => platformApi.dbOverview(tenant.id), [tenant.id]);
  const [draft, setDraft] = useState({ sql: '', mode: 'READ', nonce: 0 });

  const openInConsole = useCallback((sql, mode = 'READ') => {
    setDraft((d) => ({ sql, mode, nonce: d.nonce + 1 }));
    navigate(`${base}/console`);
  }, [base, navigate]);

  const caps = overview.data?.capabilities || {};

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        {SUB_TABS.map(([path, label]) => (
          <NavLink
            key={path}
            to={`${base}/${path}`}
            className={({ isActive }) => `rounded-full px-3 py-1 text-sm ${isActive ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          {overview.data && (
            <>
              <CapBadge on={caps.console} label="Console" />
              <CapBadge on={caps.writes} label="Writes" />
              <CapBadge on={caps.backups} label="Backups" />
            </>
          )}
        </div>
      </nav>

      {overview.error && <Alert>{overview.error}</Alert>}

      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPanel state={overview} onOpen={openInConsole} />} />
        <Route path="console" element={<ConsolePanel tenant={tenant} caps={caps} draft={draft} />} />
        <Route path="tables" element={<TablesPanel tenant={tenant} onOpen={openInConsole} />} />
        <Route path="optimise" element={<OptimisePanel tenant={tenant} caps={caps} onOpen={openInConsole} />} />
        <Route path="activity" element={<ActivityPanel tenant={tenant} caps={caps} />} />
        <Route path="backups" element={<BackupsPanel tenant={tenant} caps={caps} />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </div>
  );
}

function CapBadge({ on, label }) {
  return <Badge value={on ? 'OK' : 'NOT_CONFIGURED'} label={`${label} ${on ? 'on' : 'off'}`} />;
}

function OverviewPanel({ state, onOpen }) {
  const { data, loading, reload } = state;
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  const db = data.database || {};
  const conn = data.connections || {};
  const stats = data.stats || {};
  const obj = data.objects || {};
  const started = db.started_at ? Math.round((Date.parse(db.now) - Date.parse(db.started_at)) / 1000) : null;
  const xidPct = db.xid_age != null ? (db.xid_age / 2_000_000_000) * 100 : null;
  const errors = Object.entries(data.errors || {});
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Database size" value={fmtBytes(db.size_bytes)} />
        <Stat label="Connections" value={`${fmtCount(conn.this_database)} / ${fmtCount(conn.max_connections)}`}
          tone={conn.max_connections && conn.server_total / conn.max_connections > 0.8 ? 'red' : undefined} />
        <Stat label="Cache hit" value={stats.cache_hit_pct != null ? `${stats.cache_hit_pct}%` : '—'}
          tone={stats.cache_hit_pct != null && stats.cache_hit_pct < 95 ? 'amber' : 'green'} />
        <Stat label="Tables · indexes" value={`${fmtCount(obj.tables)} · ${fmtCount(obj.indexes)}`} />
      </div>

      {errors.length > 0 && <Alert kind="warn">Some figures could not be read: {errors.map(([k, v]) => `${k}: ${v}`).join('; ')}</Alert>}
      {db.login_is_superuser && (
        <Alert kind="warn">
          This client&apos;s backend signs in to PostgreSQL as a <b>superuser</b> ({db.login_role}). The console blocks the known ways out
          of the database, but a dedicated, non-superuser role per client is the real fix (see docs/superadmin/SECURITY.md).
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Server" actions={<Button size="sm" variant="secondary" onClick={reload}>Refresh</Button>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <Row k="Database" v={<span className="font-mono">{db.name}</span>} />
            <Row k="PostgreSQL" v={db.server_version} />
            <Row k="Up for" v={fmtUptime(started)} />
            <Row k="Login role" v={<span className="font-mono">{db.login_role}</span>} />
            <Row k="Time zone" v={db.timezone} />
            <Row k="Schema version" v={data.flyway ? `V${data.flyway.version}${data.flyway.failed ? ` · ${data.flyway.failed} failed` : ''}` : '—'} />
            <Row k="Active / idle in txn" v={`${fmtCount(conn.active)} / ${fmtCount(conn.idle_in_transaction)}`} />
            <Row k="Commits / rollbacks" v={`${fmtCount(stats.xact_commit)} / ${fmtCount(stats.xact_rollback)}`} />
            <Row k="Deadlocks · temp files" v={`${fmtCount(stats.deadlocks)} · ${fmtCount(stats.temp_files)} (${fmtBytes(stats.temp_bytes)})`} />
            <Row k="Transaction ID age" v={xidPct != null ? `${fmtCount(db.xid_age)} (${xidPct.toFixed(1)}% to wraparound)` : '—'} />
            <Row k="Table · index data" v={`${fmtBytes(obj.table_bytes)} · ${fmtBytes(obj.index_bytes)}`} />
            <Row k="Stats since" v={fmtDate(stats.stats_reset) === '—' ? 'server start' : fmtDate(stats.stats_reset)} />
          </dl>
        </Card>
        <Card title="Largest tables">
          <Table
            rowKey={(r) => `${r.schema}.${r.name}`}
            columns={[
              { key: 'name', label: 'Table', render: (r) => <button type="button" className="font-mono text-xs text-sky-700 hover:underline" onClick={() => onOpen(selectStarSql(r.schema, r.name))}>{r.name}</button> },
              { key: 'est_rows', label: 'Rows (est.)', className: 'text-right', render: (r) => fmtCount(r.est_rows) },
              { key: 'total_bytes', label: 'Size', className: 'text-right', render: (r) => fmtBytes(r.total_bytes) },
            ]}
            rows={data.largestTables || []}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Key settings">
          <Table
            rowKey={(r) => r.name}
            columns={[
              { key: 'name', label: 'Setting', className: 'font-mono text-xs', render: (r) => <span title={r.short_desc}>{r.name}</span> },
              { key: 'setting', label: 'Value', render: (r) => `${r.setting}${r.unit ? ` ${r.unit}` : ''}` },
            ]}
            rows={data.settings || []}
          />
        </Card>
        <Card title="Extensions">
          <Table
            rowKey={(r) => r.name}
            columns={[{ key: 'name', label: 'Extension', className: 'font-mono text-xs' }, { key: 'version', label: 'Version' }]}
            rows={data.extensions || []}
          />
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="min-w-0 truncate text-slate-800">{v ?? '—'}</dd>
    </>
  );
}
