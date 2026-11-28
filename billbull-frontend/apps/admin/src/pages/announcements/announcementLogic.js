// Pure helpers for the Announcements page (kept apart so they can be unit-tested).

export const KINDS = [
  { value: 'INFO', label: 'Information', icon: 'ℹ', tone: 'bg-sky-100 text-sky-700' },
  { value: 'FEATURE', label: 'New feature', icon: '✦', tone: 'bg-violet-100 text-violet-700' },
  { value: 'UPDATE', label: 'Update', icon: '↻', tone: 'bg-blue-100 text-blue-700' },
  { value: 'MAINTENANCE', label: 'Maintenance', icon: '⚒', tone: 'bg-amber-100 text-amber-800' },
  { value: 'ALERT', label: 'Important', icon: '!', tone: 'bg-red-100 text-red-700' },
];

export const kindMeta = (kind) => KINDS.find((k) => k.value === kind) || KINDS[0];

export const AUDIENCES = [
  { value: 'EVERYONE', label: 'Whole team' },
  { value: 'ADMINS', label: 'Owners & admins' },
];

export const audienceLabel = (a) => AUDIENCES.find((x) => x.value === a)?.label || a;

export const PHASES = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'LIVE', label: 'Live' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/** `<input type="datetime-local">` value → ISO instant, or null when blank/invalid. */
export const localToIso = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** ISO instant → `<input type="datetime-local">` value in the browser's zone. */
export const isoToLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const emptyDraft = () => ({
  kind: 'FEATURE',
  title: '',
  message: '',
  audience: 'EVERYONE',
  targetAll: true,
  tenantIds: [],
  startsAt: '',
  endsAt: '',
});

export const draftFrom = (a) => ({
  kind: a.kind,
  title: a.title,
  message: a.message,
  audience: a.audience,
  targetAll: a.targetAll,
  tenantIds: [...(a.tenantIds || [])],
  startsAt: isoToLocal(a.startsAt),
  endsAt: isoToLocal(a.endsAt),
});

/** What's wrong with a draft (the server checks the same), or '' when it can be sent. */
export const draftProblem = (d, now = Date.now()) => {
  if (!d.title.trim()) return 'Give it a title.';
  if (d.title.trim().length > 150) return 'Keep the title to 150 characters.';
  if (!d.message.trim()) return 'Write the message.';
  if (d.message.trim().length > 4000) return 'Keep the message to 4000 characters.';
  if (!d.targetAll && d.tenantIds.length === 0) return 'Choose at least one client.';
  const s = localToIso(d.startsAt);
  const e = localToIso(d.endsAt);
  if (d.startsAt && !s) return 'The start time is not valid.';
  if (d.endsAt && !e) return 'The end time is not valid.';
  if (e && new Date(e).getTime() <= now) return 'The end time is already past.';
  if (s && e && new Date(e) <= new Date(s)) return 'The end must be after the start.';
  return '';
};

export const draftToBody = (d) => ({
  kind: d.kind,
  title: d.title.trim(),
  message: d.message.trim(),
  audience: d.audience,
  targetAll: d.targetAll,
  tenantIds: d.targetAll ? [] : d.tenantIds,
  startsAt: localToIso(d.startsAt),
  endsAt: localToIso(d.endsAt),
});

export const matches = (a, query, phase) => {
  if (phase && phase !== 'ALL' && a.phase !== phase) return false;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [a.title, a.message, ...(a.tenantNames || [])].some((s) => String(s || '').toLowerCase().includes(q));
};

export const summarize = (list) => ({
  live: list.filter((a) => a.phase === 'LIVE').length,
  sent: list.length,
  seen: list.reduce((n, a) => n + (a.seenUsers || 0), 0),
  scheduled: list.filter((a) => a.phase === 'SCHEDULED').length,
});
