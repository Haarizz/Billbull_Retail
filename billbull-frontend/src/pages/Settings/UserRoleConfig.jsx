import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings2, AlertTriangle, X, Pencil, Trash2, RefreshCw, LayoutGrid, KeyRound, Database,
  History, UserCheck, ShieldCheck, Users, Undo2, Save, Lock, Check,
} from 'lucide-react';
import { rolePermissionsApi } from '@billbull/shared/api/rolePermissionsApi';
import { usePermissions } from '@billbull/shared/context/PermissionContext';
import { usersApi } from '../../api/usersApi';
import { SYSTEM_ROLES, getRoleMeta, MODULES, SINGLE_SWITCH_KEYS, SCOPE_GRANTS } from './roleConfig/catalog';
import {
  toMap, diff, toggleFlag, setRow, setGrant, resetToInherit, roleSummary, effective,
} from './roleConfig/permissionModel';
import AccessMatrix from './roleConfig/AccessMatrix';
import GrantsTab from './roleConfig/GrantsTab';
import DataScopeTab from './roleConfig/DataScopeTab';
import EffectiveAccessTab from './roleConfig/EffectiveAccessTab';
import AccessAuditLog from './roleConfig/AccessAuditLog';
import RolePanel from './roleConfig/RolePanel';
import {
  ReviewSaveDialog, AddRoleDialog, EditRoleDialog, DeleteRoleDialog, DiscardDialog,
} from './roleConfig/Dialogs';
import { apiError, Chip } from './roleConfig/ui';

const PAGE_TABS = [
  { key: 'roles',     label: 'Roles & Permissions',   icon: ShieldCheck },
  { key: 'effective', label: 'Effective User Access', icon: UserCheck },
  { key: 'audit',     label: 'Audit Log',             icon: History, module: 'userManagement.audit' },
];

const ROLE_TABS = [
  { key: 'matrix',    label: 'Module Access',          sub: 'Visibility & actions',     icon: LayoutGrid },
  { key: 'approvals', label: 'Approvals & Overrides',  sub: 'Rules & restrictions',     icon: KeyRound },
  { key: 'scope',     label: 'Data Scope',             sub: 'Which records',            icon: Database },
  { key: 'history',   label: 'History',                sub: 'Changes to this role',     icon: History, module: 'userManagement.audit' },
];

const SCOPE_KEYS = new Set(SCOPE_GRANTS.map(s => s.key));
/** Which role sub-tab a permission key is edited on (for the unsaved-count badges). */
const tabOf = (key) => (SCOPE_KEYS.has(key) ? 'scope' : SINGLE_SWITCH_KEYS.has(key) ? 'approvals' : 'matrix');

const UserRoleConfig = () => {
  const { refreshPermissions, canView, ownershipFilteringEnabled } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = PAGE_TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'roles';

  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [selectedName, setSelectedName] = useState(null);
  const [roleTab, setRoleTab] = useState('matrix');
  const [draft, setDraft] = useState({});

  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [pendingRole, setPendingRole] = useState(null); // role switch awaiting discard confirmation

  const [dialog, setDialog] = useState(null); // 'add' | 'edit' | 'delete'
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);

  // ── Load everything once: roles, users, every role's rules (one request each) ──
  const loadAll = useCallback(async (keepRole) => {
    setLoading(true);
    try {
      const [r, rows, u] = await Promise.all([
        usersApi.getAllRoles(),
        rolePermissionsApi.getAll(),
        usersApi.getAll().catch(() => []),
      ]);
      setRoles(r);
      setAllRows(rows);
      setUsers(u);
      setSelectedName(prev => {
        const want = keepRole || prev;
        return r.some(x => x.name === want) ? want : (r[0]?.name || null);
      });
    } catch (err) {
      setGlobalError(apiError(err, 'Failed to load roles and permissions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const roleMaps = useMemo(() => {
    const grouped = {};
    allRows.forEach(row => { (grouped[row.roleName] ||= []).push(row); });
    return Object.fromEntries(roles.map(r => [r.name, toMap(grouped[r.name] || [])]));
  }, [allRows, roles]);

  const saved = useMemo(() => roleMaps[selectedName] || {}, [roleMaps, selectedName]);
  useEffect(() => { setDraft(saved); }, [saved]);

  const { changes, upserts, resets } = useMemo(() => diff(saved, draft), [saved, draft]);
  const dirtyCount = changes.length;

  const userCounts = useMemo(() => {
    const counts = {};
    users.forEach(u => { if (u.active !== false) (u.roles || []).forEach(n => { counts[n] = (counts[n] || 0) + 1; }); });
    return counts;
  }, [users]);

  const selectedRole = roles.find(r => r.name === selectedName) || null;
  const isAdminRole = selectedName === 'ADMIN';
  const affectedUsers = useMemo(
    () => users.filter(u => u.active !== false && (u.roles || []).includes(selectedName)).map(u => u.username),
    [users, selectedName],
  );

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirtyCount) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  // ── Draft edits (nothing is sent until Save) ──
  const onToggle = useCallback((key, flag) => setDraft(d => toggleFlag(d, saved, key, flag)), [saved]);
  const onSetRow = useCallback((key, value) => setDraft(d => setRow(d, saved, key, value)), [saved]);
  const onReset = useCallback((key) => setDraft(d => resetToInherit(d, key)), []);
  const onGrant = useCallback((key, value) => setDraft(d => setGrant(d, saved, key, value)), [saved]);

  const selectRole = (name) => {
    if (name === selectedName) return;
    if (dirtyCount) { setPendingRole(name); return; }
    setSelectedName(name);
  };

  const setPageTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'roles') next.delete('tab'); else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const openRole = (name) => { setPageTab('roles'); selectRole(name); };

  const openReview = useCallback(() => { setSaveError(null); setReviewOpen(true); }, []);

  // Ctrl/Cmd+S opens the review dialog while there are unsaved edits.
  useEffect(() => {
    if (pageTab !== "roles" || !dirtyCount || reviewOpen) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); openReview(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageTab, dirtyCount, reviewOpen, openReview]);

  // ── Save ──
  const save = async (reason) => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await rolePermissionsApi.applyChangeSet(selectedName, { upserts, resets }, reason);
      setAllRows(prev => [...prev.filter(r => r.roleName !== selectedName), ...result]);
      setReviewOpen(false);
      setNotice(`Saved ${dirtyCount} change${dirtyCount === 1 ? '' : 's'} to ${selectedName}.`);
      setTimeout(() => setNotice(null), 4000);
      refreshPermissions();
    } catch (err) {
      setSaveError(apiError(err, 'Save failed — nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Role CRUD ──
  const runDialog = async (fn) => {
    setDialogBusy(true);
    setDialogError(null);
    try { await fn(); setDialog(null); }
    catch (err) { setDialogError(apiError(err, 'The request failed')); if (dialog !== 'add') { setGlobalError(apiError(err, 'The request failed')); setDialog(null); } }
    finally { setDialogBusy(false); }
  };

  const createRole = (form) => runDialog(async () => {
    const created = await usersApi.createRole({ name: form.name, description: form.description }, form.reason);
    if (form.copyFrom) await rolePermissionsApi.copy(form.copyFrom, created.name, form.reason);
    await loadAll(created.name);
    refreshPermissions();
  });

  const updateRole = (description, reason) => runDialog(async () => {
    const updated = await usersApi.updateRole(selectedRole.id, description, reason);
    setRoles(prev => prev.map(r => (r.id === updated.id ? updated : r)));
  });

  const deleteRole = (reason) => runDialog(async () => {
    await usersApi.deleteRole(selectedRole.id, reason);
    const remaining = roles.filter(r => r.id !== selectedRole.id);
    setRoles(remaining);
    setAllRows(prev => prev.filter(r => r.roleName !== selectedRole.name));
    setSelectedName(remaining[0]?.name || null);
  });

  const summary = roleSummary(draft);
  const grantsOn = Object.keys(draft).filter(k => SINGLE_SWITCH_KEYS.has(k) && draft[k].canView).length;
  const customPages = MODULES.flatMap(m => m.resources).filter(r => draft[r.key]).length;
  const hiddenModules = MODULES.filter(m => !effective(draft, m.key).canView).map(m => m.label);

  return (
    // Full-height workspace: on desktop the page fills the app's content area exactly and only the
    // role list and the active tab scroll — no page scroll fighting an inner table scroll. On
    // phones/tablets it falls back to natural page flow.
    <div className="bg-[#F7F7FA] font-sans flex flex-col min-h-full lg:h-full">
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 md:px-6 md:pt-4 md:pb-4">

        {/* Header + page tabs share one band */}
        <div className="shrink-0 flex flex-col xl:flex-row xl:items-end gap-x-6 gap-y-1 border-b border-slate-200">
          <div className="min-w-0 flex-1 pb-2">
            <div className="text-[11px] text-slate-500">Settings &rarr; User & Role Configuration</div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Settings2 className="text-[#F5C742]" size={22} /> User & Role Configuration
            </h1>
            <p className="hidden md:block text-xs text-slate-500">
              Decide what each role can see, do and approve, and which records it reaches. Every change is audited.
            </p>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]" role="tablist">
            {PAGE_TABS.filter(t => !t.module || canView(t.module)).map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={pageTab === t.key}
                onClick={() => setPageTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors
                  ${pageTab === t.key ? 'border-[#F5C742] text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                <t.icon size={15} className={pageTab === t.key ? 'text-[#d9a52a]' : ''} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {globalError && (
          <div className="shrink-0 flex items-center justify-between gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2"><AlertTriangle size={16} className="shrink-0" /> {globalError}</div>
            <button onClick={() => setGlobalError(null)} className="text-red-400 hover:text-red-600" aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}

        {pageTab === 'effective' && (
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <EffectiveAccessTab users={users} roleMaps={roleMaps} onOpenRole={openRole} />
          </div>
        )}

        {pageTab === 'audit' && (
          <div className="flex-1 min-h-0 flex flex-col"><AccessAuditLog embedded /></div>
        )}

        {pageTab === 'roles' && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
            <RolePanel
              roles={roles}
              selectedName={selectedName}
              onSelect={selectRole}
              onAdd={() => { setDialogError(null); setDialog('add'); }}
              userCounts={userCounts}
              roleMaps={{ ...roleMaps, ...(selectedName ? { [selectedName]: draft } : {}) }}
              dirtyRole={dirtyCount ? selectedName : null}
              loading={loading}
            />

            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              {!selectedRole ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                  {loading ? <><RefreshCw size={14} className="inline animate-spin mr-1" /> Loading…</> : 'Select a role to configure permissions'}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* Role header — one compact line */}
                  <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-2">
                    <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getRoleMeta(selectedRole.name).badge}`}>{selectedRole.name}</span>
                      {SYSTEM_ROLES.has(selectedRole.name) && <Chip><Lock size={9} /> System</Chip>}
                      <span className="text-[11px] text-slate-500 truncate max-w-[22rem]">{selectedRole.description || 'No description'}</span>
                      <button onClick={() => setDialog('edit')} className="text-slate-300 hover:text-slate-600" title="Edit description" aria-label="Edit role description"><Pencil size={13} /></button>
                      {!SYSTEM_ROLES.has(selectedRole.name) && (
                        <button onClick={() => setDialog('delete')} className="text-slate-300 hover:text-red-500" title="Delete role" aria-label="Delete role"><Trash2 size={13} /></button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      {[
                        { v: `${summary.modulesOn}/${summary.modulesTotal}`, l: 'modules', t: hiddenModules.length ? `Hidden: ${hiddenModules.join(', ')}` : 'All modules visible' },
                        { v: customPages, l: 'custom pages', t: 'Pages with their own rule' },
                        { v: grantsOn, l: 'overrides', t: 'Approvals, overrides and scope switches granted' },
                        { v: userCounts[selectedRole.name] || 0, l: (userCounts[selectedRole.name] || 0) === 1 ? 'user' : 'users', t: affectedUsers.join(', ') || 'No active users' },
                      ].map(s => (
                        <span key={s.l} title={s.t} className="text-[11px] text-slate-500 px-2 py-1 rounded-md bg-slate-50 border border-slate-100 whitespace-nowrap">
                          <strong className="text-slate-800">{s.v}</strong> {s.l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {isAdminRole && (
                    <div className="shrink-0 px-4 sm:px-5 py-1.5 flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100">
                      <AlertTriangle size={12} className="shrink-0" />
                      <span><strong>ADMIN role</strong> — restricting it may lock administrators out. Access to role configuration itself is protected.</span>
                    </div>
                  )}

                  {/* Role sub-tabs */}
                  <div className="shrink-0 px-2 sm:px-3 pt-1.5 border-b border-slate-100 flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]" role="tablist">
                    {ROLE_TABS.filter(t => !t.module || canView(t.module)).map(t => {
                      const n = changes.filter(c => tabOf(c.key) === t.key).length;
                      return (
                        <button key={t.key} role="tab" aria-selected={roleTab === t.key} onClick={() => setRoleTab(t.key)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b-2 -mb-px text-left whitespace-nowrap
                            ${roleTab === t.key ? 'border-[#F5C742] bg-amber-50/40' : 'border-transparent hover:bg-slate-50'}`}>
                          <t.icon size={14} className={roleTab === t.key ? 'text-[#d9a52a]' : 'text-slate-400'} />
                          <span>
                            <span className={`block text-xs font-semibold ${roleTab === t.key ? 'text-slate-800' : 'text-slate-600'}`}>
                              {t.label}{n > 0 && <span className="ml-1 text-[9px] font-bold text-white bg-blue-500 rounded-full px-1.5">{n}</span>}
                            </span>
                            <span className="block text-[9px] text-slate-400">{t.sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active tab — the only part that scrolls */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    {roleTab === 'matrix' && (
                      <AccessMatrix saved={saved} draft={draft} onToggle={onToggle} onSetRow={onSetRow} onReset={onReset} isAdminRole={isAdminRole} />
                    )}
                    {roleTab === 'approvals' && (
                      <div className="flex-1 min-h-0 overflow-auto"><GrantsTab saved={saved} draft={draft} onGrant={onGrant} /></div>
                    )}
                    {roleTab === 'scope' && (
                      <div className="flex-1 min-h-0 overflow-auto">
                        <DataScopeTab role={selectedRole} saved={saved} draft={draft} onGrant={onGrant}
                          ownershipFilteringEnabled={ownershipFilteringEnabled} users={users} />
                      </div>
                    )}
                    {roleTab === 'history' && (
                      <div className="flex-1 min-h-0 flex flex-col p-3">
                        <AccessAuditLog key={selectedRole.name} embedded initialFilters={{ roleName: selectedRole.name }} />
                      </div>
                    )}
                  </div>

                  {/* Docked save footer — part of the card, so it never covers a row */}
                  <SaveFooter
                    dirtyCount={dirtyCount}
                    roleName={selectedName}
                    affectedCount={affectedUsers.length}
                    tabCounts={ROLE_TABS.map(t => ({ ...t, n: changes.filter(c => tabOf(c.key) === t.key).length })).filter(t => t.n > 0)}
                    onJump={setRoleTab}
                    onDiscard={() => setDraft(saved)}
                    onReview={openReview}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save confirmation — a toast, so it doesn't push the layout */}
      {notice && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 text-sm text-emerald-800 bg-white border border-emerald-200 shadow-lg rounded-lg px-4 py-2.5" role="status">
          <ShieldCheck size={15} className="text-emerald-600" /> {notice} Recorded in the audit log.
        </div>
      )}

      {reviewOpen && (
        <ReviewSaveDialog role={selectedName} changes={changes} affectedUsers={affectedUsers}
          onCancel={() => setReviewOpen(false)} onConfirm={save} saving={saving} error={saveError} />
      )}
      {pendingRole && (
        <DiscardDialog count={dirtyCount} roleName={selectedName}
          onKeep={() => setPendingRole(null)}
          onDiscard={() => { setDraft(saved); setSelectedName(pendingRole); setPendingRole(null); }} />
      )}
      {dialog === 'add' && (
        <AddRoleDialog roles={roles} busy={dialogBusy} error={dialogError} onCancel={() => setDialog(null)} onCreate={createRole} />
      )}
      {dialog === 'edit' && selectedRole && (
        <EditRoleDialog role={selectedRole} busy={dialogBusy} onCancel={() => setDialog(null)} onSave={updateRole} />
      )}
      {dialog === 'delete' && selectedRole && (
        <DeleteRoleDialog role={selectedRole} ruleCount={Object.keys(saved).length} busy={dialogBusy}
          onCancel={() => setDialog(null)} onDelete={deleteRole} />
      )}
    </div>
  );
};

/**
 * Bottom bar of the role card. Always present (so the layout never jumps): quiet "all saved"
 * when clean, amber with the change count, per-tab jump links and the save actions when dirty.
 */
function SaveFooter({ dirtyCount, roleName, affectedCount, tabCounts, onJump, onDiscard, onReview }) {
  if (!dirtyCount) {
    return (
      <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-4 sm:px-5 py-2 flex items-center gap-2 text-[11px] text-slate-400">
        <Check size={12} className="text-emerald-500" />
        All changes saved. Edits are staged here and saved together, with a reason, to the audit log.
      </div>
    );
  }
  return (
    <div className="shrink-0 border-t-2 border-[#F5C742] bg-amber-50 px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2" role="region" aria-label="Unsaved changes">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800">
          {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'} to {roleName}
        </div>
        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1"><Users size={11} /> Affects {affectedCount} active user{affectedCount === 1 ? '' : 's'}</span>
          {tabCounts.map(t => (
            <button key={t.key} onClick={() => onJump(t.key)} className="text-blue-600 hover:underline">
              {t.n} in {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onDiscard} className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
          <Undo2 size={14} /> Discard
        </button>
        <button onClick={onReview} title="Ctrl+S"
          className="px-4 py-1.5 rounded-lg text-sm font-bold bg-[#F5C742] hover:bg-[#e5b732] text-slate-900 shadow-sm flex items-center gap-1.5">
          <Save size={14} /> Review &amp; save <kbd className="hidden md:inline text-[9px] font-semibold text-slate-700/70 border border-slate-700/20 rounded px-1">Ctrl S</kbd>
        </button>
      </div>
    </div>
  );
}

export default UserRoleConfig;
