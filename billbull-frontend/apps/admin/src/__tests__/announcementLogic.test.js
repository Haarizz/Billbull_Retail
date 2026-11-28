import { describe, expect, it } from 'vitest';
import {
  draftFrom, draftProblem, draftToBody, emptyDraft, isoToLocal, kindMeta, localToIso, matches, summarize,
} from '../pages/announcements/announcementLogic';

const NOW = new Date('2026-11-28T10:00:00Z').getTime();

describe('announcement draft', () => {
  it('needs a title, a message and, for chosen clients, at least one', () => {
    const d = emptyDraft();
    expect(draftProblem(d, NOW)).toMatch(/title/);
    d.title = 'Hello';
    expect(draftProblem(d, NOW)).toMatch(/message/);
    d.message = 'Body';
    expect(draftProblem(d, NOW)).toBe('');
    d.targetAll = false;
    expect(draftProblem(d, NOW)).toMatch(/client/);
    d.tenantIds = [3];
    expect(draftProblem(d, NOW)).toBe('');
  });

  it('rejects a past end and an end before the start', () => {
    const d = { ...emptyDraft(), title: 't', message: 'm' };
    expect(draftProblem({ ...d, endsAt: '2020-01-01T00:00' }, NOW)).toMatch(/past/);
    expect(draftProblem({ ...d, startsAt: '2030-01-02T00:00', endsAt: '2030-01-01T00:00' }, NOW)).toMatch(/after the start/);
  });

  it('sends trimmed text, ISO times and no client ids when sent to everyone', () => {
    const body = draftToBody({ ...emptyDraft(), title: ' T ', message: ' M ', tenantIds: [1], startsAt: '', endsAt: '2030-01-01T00:00' });
    expect(body.title).toBe('T');
    expect(body.message).toBe('M');
    expect(body.tenantIds).toEqual([]);
    expect(body.startsAt).toBeNull();
    expect(body.endsAt).toBe(new Date('2030-01-01T00:00').toISOString());
  });

  it('round-trips local input times', () => {
    const iso = localToIso('2030-05-06T07:08');
    expect(isoToLocal(iso)).toBe('2030-05-06T07:08');
    expect(isoToLocal(null)).toBe('');
    expect(localToIso('nonsense')).toBeNull();
  });

  it('edits start from the saved announcement', () => {
    const d = draftFrom({ kind: 'ALERT', title: 't', message: 'm', audience: 'ADMINS', targetAll: false, tenantIds: [4], startsAt: null, endsAt: null });
    expect(d).toMatchObject({ kind: 'ALERT', audience: 'ADMINS', targetAll: false, tenantIds: [4], startsAt: '', endsAt: '' });
  });
});

describe('announcement list', () => {
  const list = [
    { title: 'Refresh please', message: 'New build', phase: 'LIVE', seenUsers: 14, tenantNames: [] },
    { title: 'Maintenance', message: 'Down Sunday', phase: 'ARCHIVED', seenUsers: 3, tenantNames: ['Geebu'] },
    { title: 'Later', message: 'x', phase: 'SCHEDULED', seenUsers: 0 },
  ];

  it('filters by status and searches title, message and client names', () => {
    expect(list.filter((a) => matches(a, '', 'LIVE')).length).toBe(1);
    expect(list.filter((a) => matches(a, 'geebu', 'ALL')).length).toBe(1);
    expect(list.filter((a) => matches(a, 'SUNDAY', null)).length).toBe(1);
  });

  it('summarises live, sent and times seen', () => {
    expect(summarize(list)).toEqual({ live: 1, sent: 3, seen: 17, scheduled: 1 });
  });

  it('falls back to information for an unknown kind', () => {
    expect(kindMeta('PARTY').value).toBe('INFO');
  });
});
