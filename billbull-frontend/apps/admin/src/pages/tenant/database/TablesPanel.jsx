import { useMemo, useState } from 'react';
import { errorMessage, platformApi } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { hasRole } from '../../../auth/roles';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner, Table } from '../../../ui/kit';
import { fmtBytes, timeAgo } from '../../../ui/format';
import { useLoad } from '../../../ui/useLoad';
import { fmtCount, selectStarSql } from './sqlUtils';

const SORTS = {
  size: (a, b) => (b.total_bytes || 0) - (a.total_bytes || 0),
  rows: (a, b) => (b.est_rows || 0) - (a.est_rows || 0),
  dead: (a, b) => (b.dead_rows || 0) - (a.dead_rows || 0),
  seq: (a, b) => (b.seq_scan || 0) - (a.seq_scan || 0),
  name: (a, b) => a.name.localeCompare(b.name),
};

export default function TablesPanel({ tenant, onOpen }) {
  const { data, loading, error, reload } = useLoad(() => platformApi.dbTables(tenant.id), [tenant.id]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('size');
  const [selected, setSelected] = useState(null);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data || []).filter((t) => !f || `${t.schema}.${t.name}`.toLowerCase().includes(f)).sort(SORTS[sort]);
  }, [data, filter, sort]);

  const totals = useMemo(() => (data || []).reduce((acc, t) => ({
    bytes: acc.bytes + (t.total_bytes || 0), rows: acc.rows + (t.est_rows || 0),
  }), { bytes: 0, rows: 0 }), [data]);

  return (
    <Card
      title={data ? `${data.length} tables and views · ${fmtBytes(totals.bytes)} · ~${fmtCount(totals.rows)} rows` : 'Tables'}
      actions={(
        <>
          <span className="w-48"><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" aria-label="Filter tables" /></span>
          <span className="w-40">
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="size">Largest first</option>
              <option value="rows">Most rows</option>
              <option value="dead">Most dead rows</option>
              <option value="seq">Most sequential scans</option>
              <option value="name">Name</option>
            </Select>
          </span>
          <Button size="sm" variant="secondary" onClick={reload}>Refresh</Button>
        </>
      )}
    >
      {error && <Alert>{error}</Alert>}
      {loading && !data ? <Spinner /> : (
        <Table
          rowKey={(t) => `${t.schema}.${t.name}`}
          onRowClick={setSelected}
          columns={[
            { key: 'name', label: 'Table', render: (t) => (
              <span className="font-mono text-xs">{t.schema !== 'public' && <span className="text-slate-400">{t.schema}.</span>}{t.name}
                {t.kind !== 'table' && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{t.kind}</span>}
              </span>
            ) },
            { key: 'est_rows', label: 'Rows (est.)', className: 'text-right', render: (t) => fmtCount(t.live_rows ?? t.est_rows) },
            { key: 'total_bytes', label: 'Total', className: 'text-right', render: (t) => fmtBytes(t.total_bytes) },
            { key: 'index_bytes', label: 'Indexes', className: 'text-right', render: (t) => fmtBytes(t.index_bytes) },
            { key: 'dead_rows', label: 'Dead rows', className: 'text-right', render: (t) => {
              const pct = t.live_rows + t.dead_rows > 0 ? (t.dead_rows * 100) / (t.live_rows + t.dead_rows) : 0;
              return <span className={pct > 20 && t.dead_rows > 1000 ? 'font-medium text-amber-700' : ''}>{fmtCount(t.dead_rows)}</span>;
            } },
            { key: 'scans', label: 'Seq / index scans', className: 'text-right whitespace-nowrap', render: (t) => `${fmtCount(t.seq_scan)} / ${fmtCount(t.idx_scan)}` },
            { key: 'last_vacuum', label: 'Vacuumed', className: 'whitespace-nowrap', render: (t) => (t.kind === 'table' ? timeAgo(t.last_vacuum) : '') },
            { key: 'last_analyze', label: 'Analyzed', className: 'whitespace-nowrap', render: (t) => (t.kind === 'table' ? timeAgo(t.last_analyze) : '') },
          ]}
          rows={rows}
          empty="No tables match."
        />
      )}
      {selected && <TableDetail tenant={tenant} table={selected} onClose={() => setSelected(null)} onOpen={onOpen} />}
    </Card>
  );
}

function TableDetail({ tenant, table, onClose, onOpen }) {
  const { user } = useAuth();
  const operator = hasRole(user, 'OPERATOR');
  const { data, loading, error } = useLoad(() => platformApi.dbTable(tenant.id, table.schema, table.name), [tenant.id, table.schema, table.name]);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState('');
  const isTable = table.kind === 'table' || table.kind === 'partitioned' || table.kind === 'materialized view';

  const maintain = async (action) => {
    setBusy(action);
    try {
      const job = await platformApi.dbMaintenance(tenant.id, { action, schema: table.schema, table: table.name });
      setMsg({ kind: 'success', text: `${job.sql} started in the background. Follow it under Optimise → Maintenance jobs.` });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal wide title={`${table.schema}.${table.name}`} onClose={onClose}
      footer={(
        <>
          {operator && isTable && ['ANALYZE', 'VACUUM_ANALYZE', 'REINDEX'].map((a) => (
            <Button key={a} variant="secondary" size="sm" disabled={!!busy} onClick={() => maintain(a)}
              title={a === 'REINDEX' ? 'Rebuilds every index of this table without blocking writes (REINDEX CONCURRENTLY)' : undefined}>
              {busy === a ? 'Starting…' : a.replace('_', ' + ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
            </Button>
          ))}
          <Button size="sm" onClick={() => { onClose(); onOpen(selectStarSql(table.schema, table.name)); }}>Query in console</Button>
        </>
      )}
    >
      <Alert kind={msg.kind || 'info'}>{msg.text}</Alert>
      {error && <Alert>{error}</Alert>}
      {loading && !data ? <Spinner /> : data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Mini k="Rows" v={fmtCount(table.live_rows ?? table.est_rows)} />
            <Mini k="Total size" v={fmtBytes(table.total_bytes)} />
            <Mini k="Indexes" v={fmtBytes(table.index_bytes)} />
            <Mini k="Dead rows" v={fmtCount(table.dead_rows)} />
          </div>
          {table.comment && <p className="text-sm text-slate-600">{table.comment}</p>}
          <Section title={`Columns (${data.columns.length})`}>
            <Table
              rowKey={(c) => c.name}
              columns={[
                { key: 'name', label: 'Column', render: (c) => <span className={`font-mono text-xs ${c.primary_key ? 'font-semibold text-amber-700' : ''}`}>{c.name}{c.primary_key ? ' 🔑' : ''}</span> },
                { key: 'type', label: 'Type', className: 'font-mono text-xs' },
                { key: 'nullable', label: 'Null', render: (c) => (c.nullable ? 'yes' : 'no') },
                { key: 'default_value', label: 'Default', className: 'font-mono text-xs text-slate-500 max-w-xs truncate' },
              ]}
              rows={data.columns}
            />
          </Section>
          <Section title={`Indexes (${data.indexes.length})`}>
            <Table
              rowKey={(i) => i.name}
              columns={[
                { key: 'name', label: 'Index', render: (i) => (
                  <span className="font-mono text-xs">{i.name} {i.is_primary && <Badge value="OK" label="primary" />} {i.is_unique && !i.is_primary && <Badge value="OPERATOR" label="unique" />} {!i.is_valid && <Badge value="FAILED" label="invalid" />}</span>
                ) },
                { key: 'definition', label: 'Definition', className: 'font-mono text-[11px] text-slate-600' },
                { key: 'size_bytes', label: 'Size', className: 'text-right', render: (i) => fmtBytes(i.size_bytes) },
                { key: 'scans', label: 'Scans', className: 'text-right', render: (i) => <span className={i.scans === 0 && !i.is_primary && !i.is_unique ? 'text-amber-700' : ''}>{fmtCount(i.scans)}</span> },
              ]}
              rows={data.indexes}
              empty="No indexes."
            />
          </Section>
          <Section title={`Constraints (${data.constraints.length})`}>
            <Table
              rowKey={(c) => c.name}
              columns={[
                { key: 'name', label: 'Name', className: 'font-mono text-xs' },
                { key: 'type', label: 'Type' },
                { key: 'definition', label: 'Definition', className: 'font-mono text-[11px] text-slate-600' },
              ]}
              rows={data.constraints}
              empty="No constraints."
            />
          </Section>
          {data.triggers.length > 0 && (
            <Section title={`Triggers (${data.triggers.length})`}>
              <Table
                rowKey={(t) => t.name}
                columns={[
                  { key: 'name', label: 'Trigger', className: 'font-mono text-xs' },
                  { key: 'enabled', label: 'On', render: (t) => (t.enabled ? 'yes' : 'no') },
                  { key: 'definition', label: 'Definition', className: 'font-mono text-[11px] text-slate-600' },
                ]}
                rows={data.triggers}
              />
            </Section>
          )}
          {data.referencedBy.length > 0 && (
            <Section title={`Referenced by (${data.referencedBy.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {data.referencedBy.map((r) => (
                  <span key={`${r.table_name}-${r.name}`} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600" title={r.name}>{r.table_name}</span>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </Modal>
  );
}

function Mini({ k, v }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className="font-medium text-slate-800">{v}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h4 className="mb-1.5 text-sm font-semibold text-slate-800">{title}</h4>
      {children}
    </section>
  );
}
