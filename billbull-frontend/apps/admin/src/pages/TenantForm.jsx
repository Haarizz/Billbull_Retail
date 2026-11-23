import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '../ui/kit';
import { parseHosts } from '../ui/format';

export const emptyTenant = {
  code: '', name: '', planCode: '', appUrl: '', agentUrl: '', serverLabel: '', springProfile: '',
  backendPort: '', databaseName: '', contactName: '', contactEmail: '', contactPhone: '', notes: '', domains: '',
};

export const tenantToForm = (t) => ({
  ...emptyTenant,
  ...Object.fromEntries(Object.keys(emptyTenant).map((k) => [k, t?.[k] ?? ''])),
  planCode: t?.planCode || '',
  backendPort: t?.backendPort ?? '',
  domains: (t?.domains || []).map((d) => d.host).join('\n'),
});

/** The request body the platform expects; blanks become null. */
export const formToBody = (f) => ({
  code: f.code.trim(),
  name: f.name.trim(),
  planCode: f.planCode || '',
  appUrl: f.appUrl.trim() || null,
  agentUrl: f.agentUrl.trim() || null,
  serverLabel: f.serverLabel.trim() || null,
  springProfile: f.springProfile.trim() || null,
  backendPort: f.backendPort === '' ? null : Number(f.backendPort),
  databaseName: f.databaseName.trim() || null,
  contactName: f.contactName.trim() || null,
  contactEmail: f.contactEmail.trim() || null,
  contactPhone: f.contactPhone.trim() || null,
  notes: f.notes.trim() || null,
  domains: parseHosts(f.domains),
});

export default function TenantForm({ initial, plans, creating, busy, onSubmit, onCancel }) {
  const [f, setF] = useState(initial || emptyTenant);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const onCode = (e) => {
    const code = e.target.value.toLowerCase();
    setF((prev) => {
      const next = { ...prev, code };
      // Suggest the conventional names while they are untouched.
      if (!prev.appUrl || prev.appUrl === `https://${prev.code}.billbull.app`) next.appUrl = code ? `https://${code}.billbull.app` : '';
      if (!prev.domains || prev.domains === `${prev.code}.billbull.app`) next.domains = code ? `${code}.billbull.app` : '';
      if (!prev.databaseName || prev.databaseName === `billbull_${prev.code.replace(/-/g, '_')}`) next.databaseName = code ? `billbull_${code.replace(/-/g, '_')}` : '';
      if (!prev.springProfile || prev.springProfile === prev.code) next.springProfile = code;
      return next;
    });
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(formToBody(f));
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Code" hint="Lowercase letters, digits, dashes. Must equal the backend's billbull.tenant.code / Spring profile.">
          <Input value={f.code} onChange={onCode} disabled={!creating} required pattern="[a-z0-9][a-z0-9\-]{1,39}" />
        </Field>
        <Field label="Business name"><Input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Plan">
          <Select value={f.planCode} onChange={set('planCode')}>
            <option value="">No plan (everything, unlimited)</option>
            {(plans || []).filter((p) => p.active || p.code === f.planCode).map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
          </Select>
        </Field>
        <Field label="Server" hint="e.g. VPS1 62.72.59.119"><Input value={f.serverLabel} onChange={set('serverLabel')} /></Field>
        <Field label="App URL" hint="Where the client's users sign in."><Input type="url" value={f.appUrl} onChange={set('appUrl')} placeholder="https://client.billbull.app" /></Field>
        <Field label="Agent URL" hint="Blank = same as the App URL."><Input type="url" value={f.agentUrl} onChange={set('agentUrl')} /></Field>
        <Field label="Spring profile"><Input value={f.springProfile} onChange={set('springProfile')} /></Field>
        <Field label="Backend port"><Input type="number" min="1" max="65535" value={f.backendPort} onChange={set('backendPort')} /></Field>
        <Field label="Database name"><Input value={f.databaseName} onChange={set('databaseName')} /></Field>
        <Field label="Domains" hint="One per line; the first is primary.">
          <Textarea value={f.domains} onChange={set('domains')} rows={2} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Contact name"><Input value={f.contactName} onChange={set('contactName')} /></Field>
        <Field label="Contact email"><Input type="email" value={f.contactEmail} onChange={set('contactEmail')} /></Field>
        <Field label="Contact phone"><Input value={f.contactPhone} onChange={set('contactPhone')} /></Field>
      </div>
      <Field label="Internal notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      <div className="flex gap-2">
        <Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : creating ? 'Create client' : 'Save changes'}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
