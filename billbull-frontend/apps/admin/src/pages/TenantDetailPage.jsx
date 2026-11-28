import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Badge, Button, PageHeader, Spinner } from '../ui/kit';
import { timeAgo } from '../ui/format';
import { useLoad } from '../ui/useLoad';
import OverviewTab from './tenant/OverviewTab';
import EntitlementsTab from './tenant/EntitlementsTab';
import StatusTab from './tenant/StatusTab';
import HealthTab from './tenant/HealthTab';
import TenantErrorsTab from './tenant/TenantErrorsTab';
import SupportTab from './tenant/SupportTab';
import ProvisioningTab from './tenant/ProvisioningTab';
import TenantAuditTab from './tenant/TenantAuditTab';
import TenantBackupsTab from './tenant/TenantBackupsTab';
import DatabaseTab from './tenant/database/DatabaseTab';

const TABS = [
  ['overview', 'Overview'],
  ['plan', 'Plan & modules'],
  ['status', 'Status'],
  ['health', 'Health'],
  ['errors', 'Errors'],
  ['support', 'Support access'],
  ['backups', 'Backups'],
  ['database', 'Database'],
  ['provisioning', 'Provisioning'],
  ['audit', 'Audit'],
];

export default function TenantDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: tenant, loading, error, reload, setData } = useLoad(() => platformApi.tenant(id), [id]);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState('');

  const act = async (label, fn) => {
    setBusy(label);
    setNotice({ kind: '', text: '' });
    try {
      const r = await fn();
      if (r && r.id && r.code) setData(r);
      setNotice({ kind: 'success', text: r?.lastAction || `${label}: done` });
      if (!(r && r.id && r.code)) await reload();
    } catch (e) {
      setNotice({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  if (loading && !tenant) return <Spinner />;
  if (!tenant) return <Alert>{error || 'Client not found'}</Alert>;
  const operator = hasRole(user, 'OPERATOR');

  /** Child tabs report what happened through this; a returned tenant replaces the page's copy. */
  const onChange = (updated, text) => {
    if (updated && updated.id) setData(updated);
    setNotice({ kind: 'success', text: updated?.lastAction ? `${text} ${updated.lastAction}` : text });
  };
  const onError = (text) => setNotice({ kind: 'error', text });

  return (
    <div className="space-y-4">
      <PageHeader
        title={(
          <span className="flex flex-wrap items-center gap-2">
            {tenant.name} <Badge value={tenant.status} /> <Badge value={tenant.healthStatus || 'UNKNOWN'} />
          </span>
        )}
        subtitle={(
          <span>
            <span className="font-mono">{tenant.code}</span>
            {tenant.appUrl && <> · <a href={tenant.appUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">{tenant.appUrl}</a></>}
            {' '}· health {timeAgo(tenant.healthAt)} · {tenant.syncPending ? 'sync pending' : 'in sync'}
          </span>
        )}
        actions={operator && (
          <>
            <Button variant="secondary" disabled={!!busy} onClick={() => act('Health check', () => platformApi.checkHealth(id))}>
              {busy === 'Health check' ? 'Checking…' : 'Check health'}
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => act('Sync', () => platformApi.syncTenant(id))}>
              {busy === 'Sync' ? 'Pushing…' : 'Push state now'}
            </Button>
          </>
        )}
      />
      <Alert kind={notice.kind || 'info'}>{notice.text}</Alert>
      {tenant.lastSyncError && tenant.syncPending && <Alert kind="warn">Last sync failed: {tenant.lastSyncError}</Alert>}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([path, label]) => (
          <NavLink
            key={path}
            to={`/tenants/${id}/${path}`}
            className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${isActive ? 'border-amber-400 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewTab tenant={tenant} onChange={onChange} onError={onError} />} />
        <Route path="plan" element={<EntitlementsTab tenant={tenant} onChange={onChange} onError={onError} />} />
        <Route path="status" element={<StatusTab tenant={tenant} onChange={onChange} onError={onError} />} />
        <Route path="health" element={<HealthTab tenant={tenant} onError={onError} />} />
        <Route path="errors" element={<TenantErrorsTab tenant={tenant} />} />
        <Route path="support" element={<SupportTab tenant={tenant} onError={onError} />} />
        <Route path="backups" element={<TenantBackupsTab tenant={tenant} />} />
        <Route path="database/*" element={<DatabaseTab tenant={tenant} />} />
        <Route path="provisioning" element={<ProvisioningTab tenant={tenant} onChange={onChange} onError={onError} />} />
        <Route path="audit" element={<TenantAuditTab tenant={tenant} />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </div>
  );
}
