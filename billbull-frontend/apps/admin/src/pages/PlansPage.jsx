import { useState } from 'react';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasRole } from '../auth/roles';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner, Table, Textarea } from '../ui/kit';
import { toOptionalInt } from '../ui/format';
import { useLoad } from '../ui/useLoad';

const blank = { code: '', name: '', description: '', modules: [], maxUsers: '', maxBranches: '', maxTerminalsPerBranch: '', monthlyPrice: '', currency: 'AED', active: true };

export default function PlansPage() {
  const { user } = useAuth();
  const owner = hasRole(user, 'OWNER');
  const { data, loading, error, reload } = useLoad(() => platformApi.plans(), []);
  const { data: modules } = useLoad(() => platformApi.modules(), []);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');

  const save = async () => {
    const f = editing;
    const body = {
      code: f.code, name: f.name, description: f.description || null, modules: f.modules,
      maxUsers: toOptionalInt(f.maxUsers), maxBranches: toOptionalInt(f.maxBranches), maxTerminalsPerBranch: toOptionalInt(f.maxTerminalsPerBranch),
      monthlyPrice: f.monthlyPrice === '' ? null : Number(f.monthlyPrice), currency: f.currency, active: f.active,
    };
    try {
      if (f.id) await platformApi.updatePlan(f.id, body);
      else await platformApi.createPlan(body);
      setEditing(null);
      reload();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  const toggleModule = (key) => setEditing((f) => ({ ...f, modules: f.modules.includes(key) ? f.modules.filter((m) => m !== key) : [...f.modules, key] }));

  return (
    <div className="space-y-4">
      <PageHeader title="Plans" subtitle="What each subscription includes. Editing a plan re-pushes every client on it."
        actions={owner && <Button variant="accent" onClick={() => { setFormError(''); setEditing({ ...blank }); }}>New plan</Button>} />
      <Alert>{error}</Alert>
      <Card>
        {loading && !data ? <Spinner /> : (
          <Table
            onRowClick={owner ? (p) => { setFormError(''); setEditing({ ...p, modules: [...p.modules], maxUsers: p.maxUsers ?? '', maxBranches: p.maxBranches ?? '', maxTerminalsPerBranch: p.maxTerminalsPerBranch ?? '', monthlyPrice: p.monthlyPrice ?? '' }); } : undefined}
            columns={[
              { key: 'name', label: 'Plan', render: (p) => <div><div className="font-medium">{p.name}</div><div className="font-mono text-xs text-slate-500">{p.code}</div></div> },
              { key: 'modules', label: 'Optional modules', render: (p) => p.modules.join(', ') || <span className="text-slate-400">core only</span> },
              { key: 'limits', label: 'Users · Branches · Terminals/branch', render: (p) => [p.maxUsers, p.maxBranches, p.maxTerminalsPerBranch].map((v) => v ?? '∞').join(' · ') },
              { key: 'price', label: 'Monthly', render: (p) => (p.monthlyPrice != null ? `${p.currency} ${p.monthlyPrice}` : '—') },
              { key: 'tenantCount', label: 'Clients' },
              { key: 'active', label: '', render: (p) => <Badge value={p.active ? 'ACTIVE' : 'ARCHIVED'} label={p.active ? 'Offered' : 'Retired'} /> },
            ]}
            rows={data || []}
          />
        )}
      </Card>
      {editing && (
        <Modal title={editing.id ? `Edit ${editing.code}` : 'New plan'} onClose={() => setEditing(null)} wide
          footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button variant="accent" onClick={save}>Save</Button></>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Code"><Input value={editing.code} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Optional modules (sales, inventory and dashboard are always included)</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {(modules || []).map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.modules.includes(m.key)} onChange={() => toggleModule(m.key)} /> {m.label}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-3">
            {[['maxUsers', 'Max active users'], ['maxBranches', 'Max branches'], ['maxTerminalsPerBranch', 'Max terminals / branch']].map(([k, l]) => (
              <Field key={k} label={l} hint="Blank = unlimited"><Input type="number" min="0" value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} /></Field>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Monthly price"><Input type="number" min="0" step="0.01" value={editing.monthlyPrice} onChange={(e) => setEditing({ ...editing, monthlyPrice: e.target.value })} /></Field>
            <Field label="Currency"><Input value={editing.currency} maxLength={3} onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase() })} /></Field>
            <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Offered to new clients</label>
          </div>
          <Alert>{formError}</Alert>
        </Modal>
      )}
    </div>
  );
}
