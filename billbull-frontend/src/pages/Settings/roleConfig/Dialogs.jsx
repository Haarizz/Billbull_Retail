import React, { useState } from 'react';
import { ClipboardCheck, PlusCircle, Pencil, Trash2, Copy, RefreshCw, Check, AlertTriangle, Users } from 'lucide-react';
import { Modal, ReasonField, PrimaryButton, GhostButton, Chip } from './ui';
import { labelFor, ROLE_NAME_PATTERN, SINGLE_SWITCH_KEYS } from './catalog';
import { describeFlags } from './permissionModel';

const KIND = {
  added:   { label: 'New rule', tone: 'amber' },
  changed: { label: 'Changed',  tone: 'blue' },
  reset:   { label: 'Inherits', tone: 'slate' },
};

const MIN_REASON = 5;

/** Review staged permission edits, give a reason, save atomically. */
export function ReviewSaveDialog({ role, changes, affectedUsers, onCancel, onConfirm, saving, error }) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= MIN_REASON;
  const describe = (c) => {
    if (SINGLE_SWITCH_KEYS.has(c.key)) return c.after.canView ? 'Granted' : 'Revoked';
    if (c.kind === 'reset') return `Custom rule removed — now follows module (${describeFlags(c.before, c.after) || 'same access'})`;
    return describeFlags(c.before, c.after) || 'Now has its own rule (same access as module)';
  };
  return (
    <Modal
      title={`Review changes — ${role}`}
      icon={ClipboardCheck}
      width="max-w-xl"
      onClose={saving ? () => {} : onCancel}
      footer={(
        <>
          <GhostButton disabled={saving} onClick={onCancel}>Keep editing</GhostButton>
          <PrimaryButton disabled={!ok || saving} onClick={() => onConfirm(reason.trim())}>
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save {changes.length} change{changes.length === 1 ? '' : 's'}</>}
          </PrimaryButton>
        </>
      )}
    >
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <Users size={13} className="text-slate-400 shrink-0" />
        {affectedUsers.length === 0
          ? 'No active users hold this role yet.'
          : <>Affects <strong>{affectedUsers.length}</strong> active user{affectedUsers.length === 1 ? '' : 's'}: {affectedUsers.slice(0, 6).join(', ')}{affectedUsers.length > 6 ? ` +${affectedUsers.length - 6} more` : ''}</>}
      </div>
      <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
        {changes.map(c => (
          <li key={c.key} className="px-3 py-2 flex items-start gap-2">
            <Chip tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Chip>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-700">{labelFor(c.key)}</div>
              <div className="text-[11px] text-slate-500 font-mono">{describe(c)}</div>
            </div>
          </li>
        ))}
      </ul>
      <ReasonField value={reason} onChange={setReason} required autoFocus />
      {!ok && reason.length > 0 && <p className="text-[10px] text-red-500 -mt-2">Please give at least {MIN_REASON} characters.</p>}
      <p className="text-[10px] text-slate-400">All changes are applied together — if one is rejected, none are saved. Signed-in users pick them up within a few minutes or on their next sign-in.</p>
    </Modal>
  );
}

export function AddRoleDialog({ roles, onCancel, onCreate, busy, error }) {
  const [form, setForm] = useState({ name: '', description: '', copyFrom: '', reason: '' });
  const [localError, setLocalError] = useState(null);
  const submit = () => {
    if (!ROLE_NAME_PATTERN.test(form.name)) {
      setLocalError('Role name must start with a letter and use only A–Z, 0–9 and _ (2–50 chars).');
      return;
    }
    setLocalError(null);
    onCreate(form);
  };
  const input = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742]';
  return (
    <Modal title="Add new role" icon={PlusCircle} onClose={busy ? () => {} : onCancel}
      footer={(
        <>
          <GhostButton disabled={busy} onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton disabled={busy || !form.name} onClick={submit}>
            {busy ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><Check size={14} /> Create role</>}
          </PrimaryButton>
        </>
      )}>
      {(localError || error) && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="shrink-0" /> {localError || error}
        </div>
      )}
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Role name</label>
        <input className={input} placeholder="e.g. REGIONAL_MANAGER" value={form.name} autoFocus
          onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase().replace(/\s+/g, '_') })} />
        <p className="text-[10px] text-slate-400 ml-1">Uppercase letters, digits and underscores. Permanent once created.</p>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Description</label>
        <textarea rows={2} className={`${input} resize-none`} placeholder="What this role is responsible for…"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5 flex items-center gap-1.5"><Copy size={11} /> Start from</label>
        <select className={input} value={form.copyFrom} onChange={(e) => setForm({ ...form, copyFrom: e.target.value })}>
          <option value="">Blank — no access</option>
          {roles.map(r => <option key={r.id} value={r.name}>Copy of {r.name}</option>)}
        </select>
      </div>
      <ReasonField value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
    </Modal>
  );
}

export function EditRoleDialog({ role, onCancel, onSave, busy }) {
  const [description, setDescription] = useState(role.description || '');
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Edit role — ${role.name}`} icon={Pencil} onClose={busy ? () => {} : onCancel}
      footer={(
        <>
          <GhostButton disabled={busy} onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton disabled={busy} onClick={() => onSave(description, reason)}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save
          </PrimaryButton>
        </>
      )}>
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Description</label>
        <textarea rows={3} autoFocus value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/20 focus:border-[#F5C742] resize-none" />
        <p className="text-[10px] text-slate-400 ml-1">The role name is permanent — permissions and user assignments reference it.</p>
      </div>
      <ReasonField value={reason} onChange={setReason} />
    </Modal>
  );
}

export function DeleteRoleDialog({ role, ruleCount, onCancel, onDelete, busy }) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= MIN_REASON;
  return (
    <Modal title={`Delete role ${role.name}?`} icon={Trash2} onClose={busy ? () => {} : onCancel}
      footer={(
        <>
          <GhostButton disabled={busy} onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton tone="red" disabled={busy || !ok} onClick={() => onDelete(reason.trim())}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete role
          </PrimaryButton>
        </>
      )}>
      <p className="text-xs text-slate-600">
        Its {ruleCount} permission rule{ruleCount === 1 ? '' : 's'} will be removed. This only succeeds when no active users hold the role.
        The role and its rules stay visible in the audit log.
      </p>
      <ReasonField value={reason} onChange={setReason} required autoFocus />
    </Modal>
  );
}

export function DiscardDialog({ count, roleName, onKeep, onDiscard }) {
  return (
    <Modal title="Discard unsaved changes?" icon={AlertTriangle} onClose={onKeep}
      footer={(
        <>
          <GhostButton onClick={onKeep}>Keep editing</GhostButton>
          <PrimaryButton tone="red" onClick={onDiscard}>Discard {count} change{count === 1 ? '' : 's'}</PrimaryButton>
        </>
      )}>
      <p className="text-xs text-slate-600">You have {count} unsaved change{count === 1 ? '' : 's'} to <strong>{roleName}</strong>. They will be lost.</p>
    </Modal>
  );
}
