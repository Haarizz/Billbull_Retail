import { useState } from 'react';
import { errorMessage, platformApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasRole } from '../../auth/roles';
import { Alert, Button, Card, Field, Input, Select } from '../../ui/kit';
import { toOptionalInt } from '../../ui/format';
import { useLoad } from '../../ui/useLoad';

const LIMITS = [
  ['maxUsers', 'Active users'],
  ['maxBranches', 'Branches'],
  ['maxTerminalsPerBranch', 'POS terminals per branch'],
];

/** Module overrides as the form holds them: 'plan' | 'on' | 'off'. */
export const overridesToForm = (overrides, modules) =>
  Object.fromEntries(modules.map((m) => [m, overrides?.[m] === true ? 'on' : overrides?.[m] === false ? 'off' : 'plan']));

export const formToOverrides = (form) =>
  Object.fromEntries(Object.entries(form).filter(([, v]) => v !== 'plan').map(([k, v]) => [k, v === 'on']));

export default function EntitlementsTab({ tenant, onChange, onError }) {
  const { user } = useAuth();
  const canEdit = hasRole(user, 'OPERATOR');
  const { data: plans } = useLoad(() => platformApi.plans(), []);
  const { data: modules } = useLoad(() => platformApi.modules(), []);
  const moduleKeys = (modules || []).map((m) => m.key);
  const [planCode, setPlanCode] = useState(tenant.planCode || '');
  const [overrides, setOverrides] = useState(null);
  const [limits, setLimits] = useState(() => Object.fromEntries(LIMITS.map(([k]) => [k, tenant.limitOverrides?.[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const form = overrides || overridesToForm(tenant.moduleOverrides, moduleKeys);
  const plan = (plans || []).find((p) => p.code === planCode);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await platformApi.changeEntitlements(tenant.id, {
        planCode,
        moduleOverrides: formToOverrides(form),
        maxUsers: toOptionalInt(limits.maxUsers),
        maxBranches: toOptionalInt(limits.maxBranches),
        maxTerminalsPerBranch: toOptionalInt(limits.maxTerminalsPerBranch),
      });
      setOverrides(null);
      onChange(updated, 'Entitlements saved.');
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert kind="info">
        Sales, inventory, dashboard and user management are always included. Turning a module off hides it and blocks its API on the
        client&apos;s server; no data is deleted, and turning it back on restores it as it was.
      </Alert>
      <Card title="Plan">
        <div className="max-w-md">
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)} disabled={!canEdit} aria-label="Plan">
            <option value="">No plan (everything, unlimited)</option>
            {(plans || []).map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code}){p.active ? '' : ' — retired'}</option>)}
          </Select>
          {plan && <p className="mt-2 text-xs text-slate-500">{plan.description}</p>}
        </div>
      </Card>
      <Card title="Modules">
        <div className="divide-y divide-slate-100">
          {(modules || []).map((m) => {
            const planIncludes = !planCode || (plan?.modules || []).includes(m.key);
            const value = form[m.key] || 'plan';
            const effective = value === 'plan' ? planIncludes : value === 'on';
            return (
              <div key={m.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{m.label}</div>
                  <div className="text-xs text-slate-500">Plan: {planIncludes ? 'included' : 'not included'} · Effective: <b className={effective ? 'text-emerald-700' : 'text-slate-500'}>{effective ? 'on' : 'off'}</b></div>
                </div>
                <div className="w-44">
                  <Select value={value} disabled={!canEdit} aria-label={`${m.label} override`}
                    onChange={(e) => setOverrides({ ...form, [m.key]: e.target.value })}>
                    <option value="plan">Follow plan</option>
                    <option value="on">Always on</option>
                    <option value="off">Always off</option>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Limits">
        <div className="grid gap-4 md:grid-cols-3">
          {LIMITS.map(([k, label]) => (
            <Field key={k} label={label} hint={`Blank = plan (${plan?.[k] ?? 'unlimited'}). 0 = unlimited.`}>
              <Input type="number" min="0" value={limits[k]} disabled={!canEdit}
                onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Limits stop new users, branches and terminals beyond the number; nothing that already exists is removed.</p>
      </Card>
      {canEdit && <Button variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save and push to client'}</Button>}
    </div>
  );
}
