import { describe, expect, it } from 'vitest';
import {
  diff, effective, effectiveForUser, resetToInherit, setGrant, setRow, toMap, toggleFlag, describeFlags,
} from '../permissionModel';

const row = (module, flags = {}, id = 1) => ({
  id, module, canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false, ...flags,
});

describe('effective', () => {
  it('inherits a page from its module only when the page has no explicit rule', () => {
    const map = toMap([row('sales', { canView: true, canCreate: true }), row('sales.invoice', { canView: true }, 2)]);
    expect(effective(map, 'sales.quotation')).toMatchObject({ canView: true, canCreate: true, inherited: true });
    expect(effective(map, 'sales.invoice')).toMatchObject({ canView: true, canCreate: false, explicit: true });
  });
});

describe('toggleFlag', () => {
  it('toggling an inherited page materialises an explicit rule seeded from the module', () => {
    const saved = toMap([row('sales', { canView: true, canCreate: true })]);
    const draft = toggleFlag(saved, saved, 'sales.quotation', 'canEdit');
    expect(draft['sales.quotation']).toMatchObject({ canView: true, canCreate: true, canEdit: true });
  });

  it('an action forces View on; View off clears actions', () => {
    const saved = {};
    let d = toggleFlag(saved, saved, 'notification', 'canCreate');
    expect(d.notification).toMatchObject({ canView: true, canCreate: true });
    d = toggleFlag(d, saved, 'notification', 'canView');
    expect(d.notification).toBeUndefined(); // all-false and never saved → dropped as noise
  });

  it('turning a module off resets its explicit pages to inherit', () => {
    const saved = toMap([row('sales', { canView: true }), row('sales.invoice', { canView: true, canEdit: true }, 2)]);
    const d = toggleFlag(saved, saved, 'sales', 'canView');
    expect(d['sales.invoice']).toBeUndefined();
    expect(d.sales.canView).toBe(false);
  });

  it('toggling a page back to its inherited values drops the new explicit rule', () => {
    const saved = toMap([row('sales', { canView: true })]);
    let d = toggleFlag(saved, saved, 'sales.order', 'canCreate');
    d = toggleFlag(d, saved, 'sales.order', 'canCreate');
    expect(d['sales.order']).toBeUndefined();
    expect(diff(saved, d).changes).toHaveLength(0);
  });
});

describe('diff', () => {
  it('splits staged edits into upserts and resets with before/after values', () => {
    const saved = toMap([
      row('sales', { canView: true }),
      row('sales.invoice', { canView: true, canDelete: true }, 2),
      row('sales.order', { canView: true }, 3),
    ]);
    let d = resetToInherit(saved, 'sales.invoice');
    d = toggleFlag(d, saved, 'sales.order', 'canApprove');
    d = setGrant(d, saved, 'permissions.journal.approve', true);

    const { changes, upserts, resets } = diff(saved, d);
    expect(resets).toEqual(['sales.invoice']);
    expect(upserts.map(u => u.module).sort()).toEqual(['permissions.journal.approve', 'sales.order']);
    const reset = changes.find(c => c.key === 'sales.invoice');
    expect(reset.before.canDelete).toBe(true);
    expect(reset.after.canDelete).toBe(false);
    expect(describeFlags(reset.before, reset.after)).toBe('−delete');
  });

  it('setRow on a module cascades to its explicit pages', () => {
    const saved = toMap([row('hr', { canView: true }), row('hr.payroll', { canView: true }, 2)]);
    const d = setRow(saved, saved, 'hr', true);
    expect(d['hr.payroll'].canExport).toBe(true);
    expect(setRow(saved, saved, 'hr', false)['hr.payroll']).toBeUndefined();
  });
});

describe('effectiveForUser', () => {
  it('unions grants across roles and names the granting roles', () => {
    const maps = {
      SALES: toMap([row('sales', { canView: true, canCreate: true })]),
      ACCOUNTANT: toMap([row('sales', { canView: true, canExport: true })]),
    };
    const e = effectiveForUser(maps, 'sales.invoice');
    expect(e.canCreate).toBe(true);
    expect(e.canExport).toBe(true);
    expect(e.sources.canView.sort()).toEqual(['ACCOUNTANT', 'SALES']);
    expect(e.mode).toBe('inherited');
  });

  it('an explicit page rule in any role decides — a parent grant elsewhere does not rescue it', () => {
    const maps = {
      SALES: toMap([row('sales.invoice', { canView: true })]),
      MANAGER: toMap([row('sales', { canView: true, canDelete: true })]),
    };
    const e = effectiveForUser(maps, 'sales.invoice');
    expect(e.mode).toBe('explicit');
    expect(e.canDelete).toBe(false);
  });
});
