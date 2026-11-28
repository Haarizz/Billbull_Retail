import { describe, expect, it } from 'vitest';
import { describeDevice, filterClients, initials, matchesDevice, orderDevices, sinceLabel, sortClients, sparkPoints } from '../pages/live/liveLogic';

const rows = [
  { tenantId: 1, name: 'Royal Tools', code: 'royaltools', connection: 'ONLINE', devicesOnline: 3, lastActivityAt: '2026-11-28T10:00:00Z', sales: { invoicesToday: 5 },
    devices: [{ username: 'cashier1', fullName: 'Anu K', ip: '5.31.21.4', online: true }] },
  { tenantId: 2, name: 'Geebu', code: 'geebu', connection: 'OFFLINE', devicesOnline: 0, lastActivityAt: '2026-11-28T11:00:00Z', sales: { invoicesToday: 9 }, devices: [] },
  { tenantId: 3, name: 'Demo', code: 'demo', connection: 'UNREACHABLE', devicesOnline: 0, devices: [] },
];

describe('describeDevice', () => {
  it('names browser and OS', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36').label).toBe('Chrome on Windows');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0').label).toBe('Edge on Windows');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'))
      .toMatchObject({ label: 'Safari on iPhone', mobile: true });
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/131.0 Mobile Safari/604.1').label).toBe('Chrome on iPhone');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) BillBullPOS/1.2 Chrome/128.0 Electron/32.1.0 Safari/537.36').label).toBe('BillBull POS app on Windows');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/133.0').label).toBe('Firefox on Mac');
    expect(describeDevice(null).label).toBe('Unknown device');
  });
});

describe('client list', () => {
  it('filters by tab and searches clients and logins', () => {
    expect(filterClients(rows, { view: 'online' }).map((r) => r.tenantId)).toEqual([1]);
    expect(filterClients(rows, { view: 'offline' }).map((r) => r.tenantId)).toEqual([2, 3]);
    expect(filterClients(rows, { view: 'problems' }).map((r) => r.tenantId)).toEqual([3]);
    expect(filterClients(rows, { query: 'GEE' }).map((r) => r.tenantId)).toEqual([2]);
    expect(filterClients(rows, { query: 'anu' }).map((r) => r.tenantId)).toEqual([1]);
    expect(filterClients(rows, { query: '5.31' }).map((r) => r.tenantId)).toEqual([1]);
    expect(matchesDevice(rows[0], 'cashier')).toBe(true);
    expect(matchesDevice(rows[0], 'royal')).toBe(false);
    expect(matchesDevice(rows[0], '  ')).toBe(false);
  });

  it('sorts', () => {
    expect(sortClients(rows, 'active').map((r) => r.tenantId)).toEqual([1, 2, 3]);
    expect(sortClients(rows, 'recent').map((r) => r.tenantId)).toEqual([2, 1, 3]);
    expect(sortClients(rows, 'name').map((r) => r.tenantId)).toEqual([3, 2, 1]);
    expect(sortClients(rows, 'sales').map((r) => r.tenantId)).toEqual([2, 1, 3]);
  });

  it('orders devices online first and hides offline ones unless asked', () => {
    const devices = [
      { deviceKey: 'a', online: false, lastSeenAt: '2026-11-28T11:00:00Z' },
      { deviceKey: 'b', online: true, lastSeenAt: '2026-11-28T09:00:00Z' },
      { deviceKey: 'c', online: true, lastSeenAt: '2026-11-28T10:00:00Z' },
    ];
    expect(orderDevices(devices, false).map((d) => d.deviceKey)).toEqual(['c', 'b']);
    expect(orderDevices(devices, true).map((d) => d.deviceKey)).toEqual(['c', 'b', 'a']);
  });
});

describe('small formatters', () => {
  it('initials, since labels and sparkline points', () => {
    expect(initials('Helenz Fitness World')).toBe('HF');
    expect(initials('')).toBe('?');
    const now = Date.parse('2026-11-28T10:00:00Z');
    expect(sinceLabel('2026-11-28T09:59:30Z', () => 'x', now)).toBe('Just now');
    expect(sinceLabel('2026-11-28T09:50:00Z', () => '10 min ago', now)).toBe('10 min ago');
    expect(sinceLabel(null, () => 'x', now)).toBe('—');
    expect(sparkPoints([], 100, 20)).toBe('');
    expect(sparkPoints([{ devices: 0 }, { devices: 4 }], 100, 20, 0)).toBe('0.0,20.0 100.0,0.0');
    expect(sparkPoints([{ devices: 2 }], 100, 20, 0)).toBe('0.0,0.0 100.0,0.0');
  });
});
