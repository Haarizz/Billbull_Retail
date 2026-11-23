// Pure permission logic for the User & Role Configuration screen.
//
// A "permission map" is { [moduleKey]: { id?, canView, canCreate, ... } } where a key being
// PRESENT means the role has an explicit row for it. Absent sub-resource keys inherit their
// parent's flags — exactly the rule in backend ModulePermissionService and
// PermissionContext.canAction: an explicit row (even all-false) is authoritative; only when no
// explicit row exists does "<parent>.<page>" fall back to "<parent>".
import { ALL_FLAGS, EMPTY_PERM, MODULES } from './catalog';

export const pickFlags = (p) => ({
  canView:    !!p?.canView,
  canCreate:  !!p?.canCreate,
  canEdit:    !!p?.canEdit,
  canDelete:  !!p?.canDelete,
  canApprove: !!p?.canApprove,
  canExport:  !!p?.canExport,
});

export const sameFlags = (a, b) => ALL_FLAGS.every(f => !!a?.[f] === !!b?.[f]);
export const allOn = (p) => ALL_FLAGS.every(f => !!p?.[f]);
export const anyOn = (p) => ALL_FLAGS.some(f => !!p?.[f]);

export const parentOf = (key) => (key && key.includes('.') ? key.split('.')[0] : null);

/** Server rows → permission map. */
export const toMap = (rows = []) => {
  const map = {};
  rows.forEach(r => { map[r.module] = { id: r.id, ...pickFlags(r) }; });
  return map;
};

/** Effective flags of one key for one role, with where they come from. */
export const effective = (map, key) => {
  const own = map[key];
  if (own) return { ...pickFlags(own), explicit: true, inherited: false };
  const parent = parentOf(key);
  if (parent && map[parent]) return { ...pickFlags(map[parent]), explicit: false, inherited: true };
  return { ...EMPTY_PERM, explicit: false, inherited: !!parent };
};

const childrenOf = (moduleKey) => MODULES.find(m => m.key === moduleKey)?.resources.map(r => r.key) || [];

/**
 * An explicit row the admin did not have before and whose flags equal what the key would
 * inherit anyway is noise (e.g. toggled on then off): drop it so it stays inheriting.
 */
const normalize = (draft, saved, key) => {
  if (!draft[key] || saved[key]) return draft;
  const without = { ...draft };
  delete without[key];
  return sameFlags(draft[key], effective(without, key)) ? without : draft;
};

/**
 * Flip one flag. View off clears every action on the row; any action on forces View on.
 * Turning a top-level module's View off resets its explicit page rules to inherit, so
 * re-enabling the module later restores access cleanly instead of leaving stale denials.
 */
export const toggleFlag = (draft, saved, key, flag) => {
  const base = pickFlags(effective(draft, key));
  const next = { ...base, [flag]: !base[flag] };
  if (flag === 'canView' && !next.canView) ALL_FLAGS.forEach(f => { next[f] = false; });
  if (flag !== 'canView' && next[flag]) next.canView = true;

  let out = { ...draft, [key]: { ...(draft[key] || {}), ...next } };
  if (!parentOf(key) && flag === 'canView' && !next.canView) {
    childrenOf(key).forEach(child => { delete out[child]; });
  }
  out = normalize(out, saved, key);
  return out;
};

/** Grant or revoke every flag on a row. On a module, also revokes/grants its explicit pages. */
export const setRow = (draft, saved, key, value) => {
  const flags = Object.fromEntries(ALL_FLAGS.map(f => [f, value]));
  let out = { ...draft, [key]: { ...(draft[key] || {}), ...flags } };
  if (!parentOf(key)) {
    childrenOf(key).forEach(child => {
      if (!out[child]) return;
      if (value) out[child] = { ...out[child], ...flags };
      else delete out[child];
    });
  }
  return normalize(out, saved, key);
};

/** Single-switch grant (workflow overrides, POS actions, data scope). */
export const setGrant = (draft, saved, key, value) => {
  const flags = Object.fromEntries(ALL_FLAGS.map(f => [f, value]));
  return normalize({ ...draft, [key]: { ...(draft[key] || {}), ...flags } }, saved, key);
};

/** Remove a page's explicit rule so it inherits from its module again. */
export const resetToInherit = (draft, key) => {
  const out = { ...draft };
  delete out[key];
  return out;
};

/**
 * Staged edits → what the API needs plus a reviewable change list.
 * kind: 'added' (new explicit rule), 'changed', 'reset' (explicit rule removed → inherits).
 */
export const diff = (saved, draft) => {
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)]);
  const changes = [];
  keys.forEach(key => {
    const s = saved[key];
    const d = draft[key];
    if (s && !d) {
      changes.push({ key, kind: 'reset', before: pickFlags(s), after: pickFlags(effective(draft, key)) });
    } else if (d && !s) {
      changes.push({ key, kind: 'added', before: pickFlags(effective(saved, key)), after: pickFlags(d) });
    } else if (d && s && !sameFlags(d, s)) {
      changes.push({ key, kind: 'changed', before: pickFlags(s), after: pickFlags(d) });
    }
  });
  changes.sort((a, b) => a.key.localeCompare(b.key));
  return {
    changes,
    upserts: changes.filter(c => c.kind !== 'reset').map(c => ({ module: c.key, ...c.after })),
    resets: changes.filter(c => c.kind === 'reset').map(c => c.key),
  };
};

/** "+create −delete" for one change. */
export const describeFlags = (before, after) => {
  const names = { canView: 'view', canCreate: 'create', canEdit: 'edit', canDelete: 'delete', canApprove: 'approve', canExport: 'export' };
  const parts = ALL_FLAGS.filter(f => !!before?.[f] !== !!after?.[f])
    .map(f => `${after?.[f] ? '+' : '−'}${names[f]}`);
  return parts.join(' ');
};

/** Per-module status line for collapsed rows. */
export const moduleSummary = (map, mod) => {
  const res = mod.resources;
  const visible = res.filter(r => effective(map, r.key).canView).length;
  const custom = res.filter(r => map[r.key]).length;
  const top = effective(map, mod.key);
  const actions = ['canCreate', 'canEdit', 'canDelete', 'canApprove', 'canExport'].filter(f => top[f]).length;
  return { visible, total: res.length, custom, moduleOn: top.canView, actions };
};

/** Headline numbers for a role card. */
export const roleSummary = (map) => {
  const modulesOn = MODULES.filter(m => effective(map, m.key).canView).length;
  return { modulesOn, modulesTotal: MODULES.length };
};

/**
 * A user's effective access across all their roles — ALLOW-wins union with the backend's
 * exact-row rule: if ANY of the user's roles has an explicit row for the key, only explicit
 * rows decide (an explicit deny is not rescued by another role's parent grant); otherwise the
 * parent rows of all roles are consulted. Returns flags plus, per flag, the roles granting it.
 */
export const effectiveForUser = (roleMaps, key) => {
  const roles = Object.keys(roleMaps);
  const explicitRoles = roles.filter(r => roleMaps[r][key]);
  const parent = parentOf(key);
  const deciding = explicitRoles.length > 0
    ? explicitRoles.map(r => [r, roleMaps[r][key]])
    : (parent ? roles.filter(r => roleMaps[r][parent]).map(r => [r, roleMaps[r][parent]]) : []);
  const flags = {};
  const sources = {};
  ALL_FLAGS.forEach(f => {
    sources[f] = deciding.filter(([, row]) => row[f]).map(([r]) => r);
    flags[f] = sources[f].length > 0;
  });
  return { ...flags, sources, mode: explicitRoles.length > 0 ? 'explicit' : (deciding.length ? 'inherited' : 'none') };
};
