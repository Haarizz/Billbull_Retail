// Pure helpers behind the till's "who's signing in" picker: layout by head count, distinct
// initials, avatar colours, role chips, search, and the per-till "recent" list. Nothing here
// touches PINs or tokens: the picker only chooses whose PIN pad to open.

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const TILE_MAX = 8;
export const CARD_MAX = 24;

/** 'tiles' (large, up to 8), 'cards' (compact, 9–24) or 'directory' (search-first list, 25+). */
export const layoutFor = (count) => (count <= TILE_MAX ? 'tiles' : count <= CARD_MAX ? 'cards' : 'directory');

// ---------------------------------------------------------------------------
// Initials
// ---------------------------------------------------------------------------

const words = (name) => String(name || '').trim().split(/\s+/).filter(Boolean);
const letters = (word) => word.replace(/[^\p{L}\p{N}]/gu, '');

/** Candidate initials for one name, best first. */
function initialsCandidates(name) {
  const parts = words(name).map(letters).filter(Boolean);
  if (parts.length === 0) return ['?'];
  const first = parts[0];
  if (parts.length === 1) {
    return [first.slice(0, 2), first.slice(0, 3)].map((s) => s.toUpperCase());
  }
  const last = parts[parts.length - 1];
  return [
    first[0] + last[0], //               Store 1 -> S1
    first.slice(0, 2) + last[0], //      Store 1 -> ST1, Supervisor 1 -> SU1
    first[0] + last.slice(0, 2), //      Aisha Khan -> AKH
    first.slice(0, 3), //                Store -> STO
  ].map((s) => s.toUpperCase());
}

/**
 * employeeId -> initials, unique across the list wherever the names allow. People whose first
 * pick clashes all move to a longer form together (S1 + S1 -> ST1 + SU1), so nobody keeps the
 * ambiguous one. True namesakes keep the same initials; their avatar colours still differ.
 */
export function distinctInitials(staff) {
  const candidates = new Map(staff.map((p) => [p.employeeId, initialsCandidates(p.name)]));
  const result = new Map();
  let pending = staff.map((p) => p.employeeId);
  for (let level = 0; pending.length > 0 && level < 4; level += 1) {
    const pick = (id) => {
      const list = candidates.get(id);
      return list[Math.min(level, list.length - 1)];
    };
    const counts = new Map();
    pending.forEach((id) => counts.set(pick(id), (counts.get(pick(id)) || 0) + 1));
    const taken = new Set(result.values());
    const next = [];
    pending.forEach((id) => {
      const value = pick(id);
      if (counts.get(value) === 1 && !taken.has(value)) result.set(id, value);
      else next.push(id);
    });
    pending = next;
  }
  pending.forEach((id) => result.set(id, candidates.get(id)[0]));
  return result;
}

// ---------------------------------------------------------------------------
// Avatar colours
// ---------------------------------------------------------------------------

// Dark, saturated backgrounds that hold white or brand-yellow text at 4.5:1 or better.
export const AVATAR_COLORS = [
  { bg: '#1C2838', fg: '#F5C742' }, // navy (brand)
  { bg: '#0F5E5A', fg: '#FFFFFF' }, // teal
  { bg: '#5B2A6E', fg: '#FFFFFF' }, // plum
  { bg: '#9A3B26', fg: '#FFFFFF' }, // brick
  { bg: '#2F5D34', fg: '#FFFFFF' }, // forest
  { bg: '#1F4E8C', fg: '#FFFFFF' }, // ocean
  { bg: '#8A5A00', fg: '#FFFFFF' }, // amber
  { bg: '#475569', fg: '#FFFFFF' }, // slate
  { bg: '#A23B5E', fg: '#FFFFFF' }, // rose
  { bg: '#3F3D8F', fg: '#FFFFFF' }, // indigo
];

/** Same employee, same colour, on every till and every visit. */
export function avatarColor(employeeId) {
  let n = Number(employeeId);
  if (!Number.isFinite(n)) {
    n = 0;
    for (const ch of String(employeeId ?? '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return AVATAR_COLORS[Math.abs(Math.trunc(n)) % AVATAR_COLORS.length];
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const KNOWN_GROUPS = [
  { key: 'cashier', label: 'Cashiers', match: /cashier/i },
  { key: 'supervisor', label: 'Supervisors', match: /supervisor/i },
  { key: 'manager', label: 'Managers', match: /manager/i },
];

/** { key, label } of the chip a role belongs to. */
export function roleGroup(role) {
  const text = String(role || '').trim();
  const known = KNOWN_GROUPS.find((g) => g.match.test(text));
  if (known) return { key: known.key, label: known.label };
  if (!text) return { key: 'other', label: 'Other' };
  return { key: `role:${text.toLowerCase()}`, label: text };
}

/** Chips in a stable order: All, Cashiers, Supervisors, Managers, then other roles A–Z, Other last. */
export function roleChips(staff) {
  const groups = new Map();
  staff.forEach((p) => {
    const g = roleGroup(p.role);
    const entry = groups.get(g.key) || { ...g, count: 0 };
    entry.count += 1;
    groups.set(g.key, entry);
  });
  const rank = (key) => {
    const known = KNOWN_GROUPS.findIndex((g) => g.key === key);
    if (known >= 0) return known;
    return key === 'other' ? 99 : 50;
  };
  const sorted = [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
  return [{ key: 'all', label: 'All', count: staff.length }, ...sorted];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const fold = (value) => String(value ?? '').toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Name (anywhere) or employee code (anywhere), case- and accent-insensitive. */
export function matchesQuery(person, query) {
  const q = fold(query).trim();
  if (!q) return true;
  return fold(person.name).includes(q) || fold(person.employeeCode).includes(q);
}

export function filterStaff(staff, { query = '', role = 'all' } = {}) {
  return staff.filter((p) => (role === 'all' || roleGroup(p.role).key === role) && matchesQuery(p, query));
}

// ---------------------------------------------------------------------------
// Recent on this till
// ---------------------------------------------------------------------------

export const RECENT_MAX = 4;
export const recentKey = (deviceId) => `billbull:pos:recent_pin_signins:${deviceId ?? 'default'}`;

/**
 * Employee ids that last signed in with a PIN on this till, newest first. Device-level like the
 * till's PIN key, so it lives in localStorage and survives sign-out. Holds ids only: names come
 * from the server's current staff list, so someone who lost access simply drops out.
 */
export function readRecent(deviceId, storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(recentKey(deviceId)));
    return Array.isArray(value) ? value.filter((id) => id != null).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberSignIn(deviceId, employeeId, storage = globalThis.localStorage) {
  if (employeeId == null) return;
  try {
    const next = [employeeId, ...readRecent(deviceId, storage).filter((id) => String(id) !== String(employeeId))]
      .slice(0, RECENT_MAX);
    storage?.setItem(recentKey(deviceId), JSON.stringify(next));
  } catch {
    /* storage blocked: the till simply has no recent list */
  }
}

/** Recent ids resolved against the current list, skipping anyone already shown above them. */
export function recentPeople(staff, recentIds, excludeId) {
  const byId = new Map(staff.map((p) => [String(p.employeeId), p]));
  return recentIds
    .filter((id) => String(id) !== String(excludeId))
    .map((id) => byId.get(String(id)))
    .filter(Boolean);
}
