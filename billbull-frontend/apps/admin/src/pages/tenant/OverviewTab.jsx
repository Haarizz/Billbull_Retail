import { useState } from 'react';
import { errorMessage, platformApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasRole } from '../../auth/roles';
import { Button, Card } from '../../ui/kit';
import { fmtBytes, fmtDate, fmtUptime } from '../../ui/format';
import { useLoad } from '../../ui/useLoad';
import TenantForm, { tenantToForm } from '../TenantForm';

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 last:border-0">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right text-slate-800">{children ?? '—'}</dd>
  </div>
);

export default function OverviewTab({ tenant, onChange, onError }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: plans } = useLoad(() => platformApi.plans(), []);
  const h = tenant.health;

  const save = async (body) => {
    setBusy(true);
    try {
      const updated = await platformApi.updateTenant(tenant.id, body);
      setEditing(false);
      onChange(updated, 'Saved.');
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return <Card title="Edit client"><TenantForm initial={tenantToForm(tenant)} plans={plans} busy={busy} onSubmit={save} onCancel={() => setEditing(false)} /></Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Details" actions={hasRole(user, 'OPERATOR') && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}>
        <dl className="text-sm">
          <Row label="Plan">{tenant.planName ? `${tenant.planName} (${tenant.planCode})` : 'No plan'}</Row>
          <Row label="Server">{tenant.serverLabel}</Row>
          <Row label="Spring profile">{tenant.springProfile}</Row>
          <Row label="Backend port">{tenant.backendPort}</Row>
          <Row label="Database">{tenant.databaseName}</Row>
          <Row label="Agent URL">{tenant.agentUrl}</Row>
          <Row label="Agent secret set">{fmtDate(tenant.agentSecretSetAt)}</Row>
          <Row label="Domains">{(tenant.domains || []).map((d) => d.host).join(', ') || null}</Row>
          <Row label="Contact">{[tenant.contactName, tenant.contactEmail, tenant.contactPhone].filter(Boolean).join(' · ') || null}</Row>
          <Row label="Created">{`${fmtDate(tenant.createdAt)}${tenant.createdBy ? ` by ${tenant.createdBy}` : ''}`}</Row>
        </dl>
        {tenant.notes && <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{tenant.notes}</p>}
      </Card>
      <Card title="Latest health report">
        {!h ? <p className="text-sm text-slate-400">No health report yet. Use “Check health”.</p> : (
          <dl className="text-sm">
            <Row label="Checked">{fmtDate(h.checkedAt)}</Row>
            <Row label="Latency">{h.latencyMs != null ? `${h.latencyMs} ms` : null}</Row>
            <Row label="Uptime">{fmtUptime(h.uptimeSeconds)}</Row>
            <Row label="Build">{h.artifactSha256 ? <span className="font-mono text-xs">{h.artifactSha256.slice(0, 12)} · {h.artifactTime}</span> : h.appVersion}</Row>
            <Row label="Migrations">{h.flywayVersion ? `V${h.flywayVersion}${h.flywayPending ? `, ${h.flywayPending} pending` : ''}${h.flywayFailed ? `, ${h.flywayFailed} FAILED` : ''}` : null}</Row>
            <Row label="Database size">{fmtBytes(h.dbSizeBytes)}</Row>
            <Row label="Active users">{h.activeUsers}</Row>
            <Row label="Branches">{h.branches}</Row>
            <Row label="POS terminals">{h.terminals}</Row>
            <Row label="Open till sessions">{h.openSessions}</Row>
            <Row label="Invoices (30 days)">{h.invoices30d}</Row>
            <Row label="Last invoice">{h.lastInvoiceAt}</Row>
            <Row label="Heap">{h.heapUsedBytes != null ? `${fmtBytes(h.heapUsedBytes)} of ${fmtBytes(h.heapMaxBytes)}` : null}</Row>
            <Row label="Disk free">{h.diskFreeBytes != null ? `${fmtBytes(h.diskFreeBytes)} of ${fmtBytes(h.diskTotalBytes)}` : null}</Row>
            <Row label="Tenant enforces">{h.reportedStatus ? `${h.reportedStatus} · config v${h.reportedConfigVersion}` : null}</Row>
            {h.error && <Row label="Problems"><span className="text-red-600">{h.error}</span></Row>}
          </dl>
        )}
      </Card>
    </div>
  );
}
