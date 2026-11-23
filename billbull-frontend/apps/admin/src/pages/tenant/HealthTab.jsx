import { useState } from 'react';
import { errorMessage, platformApi } from '../../api/client';
import { Badge, Button, Card, CopyBlock, Spinner, Table } from '../../ui/kit';
import { fmtBytes, fmtDate } from '../../ui/format';
import { useLoad } from '../../ui/useLoad';

export default function HealthTab({ tenant, onError }) {
  const { data, loading, reload } = useLoad(() => platformApi.healthHistory(tenant.id, 100), [tenant.id, tenant.healthAt]);
  const [agentState, setAgentState] = useState(null);

  const loadAgentState = async () => {
    try {
      setAgentState(await platformApi.agentState(tenant.id));
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title="What the client enforces right now"
        actions={<Button size="sm" variant="secondary" onClick={loadAgentState}>Ask the client</Button>}
      >
        {!agentState ? (
          <p className="text-sm text-slate-500">Reads the state straight from the client&apos;s server, to confirm a change arrived.</p>
        ) : agentState.ok ? <CopyBlock text={JSON.stringify(agentState.state, null, 2)} /> : <p className="text-sm text-red-600">{agentState.result}</p>}
      </Card>
      <Card title="Health history" actions={<Button size="sm" variant="ghost" onClick={reload}>Refresh</Button>}>
        {loading && !data ? <Spinner /> : (
          <Table
            columns={[
              { key: 'checkedAt', label: 'Checked', render: (s) => <span className="whitespace-nowrap">{fmtDate(s.checkedAt)}</span> },
              { key: 'status', label: 'Result', render: (s) => <Badge value={s.status} /> },
              { key: 'latencyMs', label: 'Latency', render: (s) => (s.latencyMs != null ? `${s.latencyMs} ms` : '—') },
              { key: 'flywayVersion', label: 'Migrations', render: (s) => (s.flywayVersion ? `V${s.flywayVersion}` : '—') },
              { key: 'heap', label: 'Heap', render: (s) => (s.heapUsedBytes != null ? `${fmtBytes(s.heapUsedBytes)} / ${fmtBytes(s.heapMaxBytes)}` : '—') },
              { key: 'users', label: 'Users', render: (s) => s.activeUsers ?? '—' },
              { key: 'error', label: 'Problems', className: 'max-w-md text-xs text-red-600', render: (s) => s.error || '' },
            ]}
            rows={data || []}
            empty="No checks yet."
          />
        )}
      </Card>
    </div>
  );
}
