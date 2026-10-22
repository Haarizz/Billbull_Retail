import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The real PermissionProvider decides; only its two data sources are stubbed.
const permissionRows = vi.hoisted(() => ({ current: {} }));
vi.mock('@billbull/shared/api/auth', () => ({
  isAuthenticated: () => true,
  getRoles: () => [],
}));
vi.mock('@billbull/shared/api/rolePermissionsApi', () => ({
  rolePermissionsApi: { getMyPermissions: () => Promise.resolve(permissionRows.current) },
}));

const { PermissionProvider } = await import('@billbull/shared/context/PermissionContext');
const { default: ResourceGuard } = await import('../ResourceGuard');

const grant = (view, create = false, edit = false) => ({ view, create, edit, delete: edit, approve: false, export: false });

// Merged /api/role-permissions/me payloads for the audited roles.
const ROLES = {
  tillCashier: { 'sales.pos': grant(true, true), 'sales.invoice': grant(true) },
  invoiceClerk: { 'sales.invoice': grant(true, true, true) },
  salesWithTillDenied: { sales: grant(true, true, true), 'sales.pos': grant(false) },
  seededSales: { sales: grant(true, true, true), pos: grant(true) },
  hr: { hr: grant(true, true, true) },
};

// Mirrors the /sales/pos element in App.jsx; the source pin below keeps the two in step.
const renderEmbeddedTill = async (rows) => {
  permissionRows.current = rows;
  render(
    <MemoryRouter>
      <PermissionProvider>
        <ResourceGuard module="sales.pos">
          <ResourceGuard module="sales.invoice">
            <div>till</div>
          </ResourceGuard>
        </ResourceGuard>
      </PermissionProvider>
    </MemoryRouter>,
  );
  await screen.findByText(/till|Access Restricted/);
  return screen.queryByText('till') !== null;
};

afterEach(cleanup);

describe('embedded /sales/pos route guard', () => {
  it('requires sales.pos and sales.invoice, the same keys as the standalone till', () => {
    const app = readFileSync(resolve(__dirname, '../../../App.jsx'), 'utf8');
    const route = app.slice(app.indexOf('path="/sales/pos"'), app.indexOf('<POSSales />'));
    expect(route).toContain('<ResourceGuard module="sales.pos">');
    expect(route).toContain('<ResourceGuard module="sales.invoice">');
  });

  it('admits the till cashier and the seeded SALES role', async () => {
    expect(await renderEmbeddedTill(ROLES.tillCashier)).toBe(true);
    cleanup();
    expect(await renderEmbeddedTill(ROLES.seededSales)).toBe(true);
  });

  it('turns away users without the till permission, matching the backend', async () => {
    expect(await renderEmbeddedTill(ROLES.invoiceClerk)).toBe(false);
    cleanup();
    expect(await renderEmbeddedTill(ROLES.salesWithTillDenied)).toBe(false);
    cleanup();
    expect(await renderEmbeddedTill(ROLES.hr)).toBe(false);
  });
});
