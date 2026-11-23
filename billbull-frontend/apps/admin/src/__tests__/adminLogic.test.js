import { describe, expect, it } from 'vitest';
import { hasRole } from '../auth/roles';
import { fmtBytes, parseHosts, timeAgo, toOptionalInt } from '../ui/format';
import { formToBody, tenantToForm } from '../pages/TenantForm';
import { filterTenants } from '../pages/TenantsPage';
import { formToOverrides, overridesToForm } from '../pages/tenant/EntitlementsTab';
import { needsReason } from '../pages/tenant/StatusTab';

describe('platform role hierarchy', () => {
  it('OWNER ⊃ OPERATOR ⊃ VIEWER', () => {
    expect(hasRole({ role: 'OWNER' }, 'OPERATOR')).toBe(true);
    expect(hasRole({ role: 'OPERATOR' }, 'VIEWER')).toBe(true);
    expect(hasRole({ role: 'OPERATOR' }, 'OWNER')).toBe(false);
    expect(hasRole({ role: 'VIEWER' }, 'OPERATOR')).toBe(false);
    expect(hasRole(null, 'VIEWER')).toBe(false);
    expect(hasRole({ role: 'OWNER' }, 'SOMETHING')).toBe(false);
  });
});

describe('module overrides form', () => {
  const modules = ['pos', 'purchases', 'finance'];
  it('round-trips plan / on / off', () => {
    const form = overridesToForm({ pos: false, finance: true }, modules);
    expect(form).toEqual({ pos: 'off', purchases: 'plan', finance: 'on' });
    expect(formToOverrides(form)).toEqual({ pos: false, finance: true });
  });
});

describe('tenant form', () => {
  it('turns blanks into nulls and splits domains', () => {
    const body = formToBody({
      ...tenantToForm(null), code: 'acme', name: ' Acme ', backendPort: '8085',
      domains: 'Acme.billbull.app, acme.billbull.app\nshop.acme.com',
    });
    expect(body).toMatchObject({ code: 'acme', name: 'Acme', backendPort: 8085, appUrl: null, planCode: '' });
    expect(body.domains).toEqual(['acme.billbull.app', 'shop.acme.com']);
  });

  it('loads an existing tenant', () => {
    const f = tenantToForm({ code: 'demo', name: 'Demo', planCode: 'GROWTH', backendPort: 8083, domains: [{ host: 'demo.billbull.app' }] });
    expect(f).toMatchObject({ code: 'demo', planCode: 'GROWTH', backendPort: 8083, domains: 'demo.billbull.app', notes: '' });
  });
});

describe('helpers', () => {
  it('filters tenants by text and status', () => {
    const list = [
      { code: 'demo', name: 'Demo', status: 'ACTIVE', serverLabel: 'VPS1' },
      { code: 'nest', name: 'Nest', status: 'SUSPENDED', serverLabel: 'VPS2' },
    ];
    expect(filterTenants(list, 'vps2', '').map((t) => t.code)).toEqual(['nest']);
    expect(filterTenants(list, '', 'ACTIVE').map((t) => t.code)).toEqual(['demo']);
    expect(filterTenants(list, '  ', '')).toHaveLength(2);
  });

  it('requires a reason only for restrictive statuses', () => {
    expect(needsReason('SUSPENDED')).toBe(true);
    expect(needsReason('READ_ONLY')).toBe(true);
    expect(needsReason('ACTIVE')).toBe(false);
  });

  it('formats', () => {
    expect(toOptionalInt('')).toBeNull();
    expect(toOptionalInt('0')).toBe(0);
    expect(toOptionalInt('-3')).toBeNull();
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(null)).toBe('—');
    expect(timeAgo(null)).toBe('never');
    expect(timeAgo(new Date(Date.now() - 120000).toISOString())).toBe('2 min ago');
    expect(parseHosts(' a.io ,b.io\na.io ')).toEqual(['a.io', 'b.io']);
  });
});
