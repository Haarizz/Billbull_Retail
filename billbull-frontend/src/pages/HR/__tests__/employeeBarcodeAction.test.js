import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { isSalespersonRole, isActiveSalesperson } from '../../../utils/salespersonRoles';

/**
 * Who is offered a printed barcode, and what that barcode is for.
 *
 * The employee barcode exists for ONE purpose: attributing a sale at the till. Offering it for a
 * storekeeper or a delivery person would produce a badge that scans, is rejected by the server,
 * and leaves the cashier holding a card that looks valid — so the action is gated on the same two
 * designations the server accepts.
 *
 * The gate here is presentational. Eligibility is decided server-side on every lookup, so a
 * browser that got this wrong cannot actually attribute a sale to an ineligible employee.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const EMPLOYEES = read('../Emp_Role.jsx/Employees.jsx');

describe('the Print Employee Barcode action', () => {
  it('is offered only for the two salesperson-eligible designations', () => {
    expect(EMPLOYEES).toContain('isSalespersonRole(employee.rawRole || employee.role) && (');
    expect(EMPLOYEES).toContain('Print Employee Barcode');
  });

  it('reads the raw stored role, not the display label', () => {
    // `rawRole` is the value the server stored; the displayed role may have been prettified, and
    // matching on a label would break the moment one is reworded.
    expect(EMPLOYEES).toContain('rawRole: emp.role');
  });
});

describe('the eligibility predicate the UI shares with the server', () => {
  it('accepts both designations, in either spelling the dropdowns produce', () => {
    // `employees.role` is free text whose options come from the RBAC roles table, so the stored
    // value may be the human-readable designation or the raw role key depending on which client
    // wrote it. Both families have to match or a legitimate salesperson loses their badge.
    for (const role of [
      'Salesperson', 'salesperson', 'SALESPERSON',
      'Cashier + Salesperson', 'cashier + salesperson', 'CASHIER_SALESPERSON',
    ]) {
      expect(isSalespersonRole(role), role).toBe(true);
    }
  });

  it('rejects every other designation', () => {
    for (const role of [
      'Cashier', 'Manager', 'Storekeeper', 'Delivery Person',
      'Supervisor', 'Branch Admin', 'Admin', '', null, undefined,
    ]) {
      expect(isSalespersonRole(role), String(role)).toBe(false);
    }
  });

  it('does not mistake a Cashier for a Cashier + Salesperson', () => {
    // The two designations share a prefix, so a substring match would quietly make every cashier
    // eligible — which is the exact bypass the rule forbids.
    expect(isSalespersonRole('Cashier')).toBe(false);
    expect(isSalespersonRole('Cashier + Salesperson')).toBe(true);
  });

  it('requires the employee to be active as well as eligible', () => {
    expect(isActiveSalesperson({ status: 'Active', role: 'Salesperson' })).toBe(true);
    expect(isActiveSalesperson({ status: 'Inactive', role: 'Salesperson' })).toBe(false);
    expect(isActiveSalesperson({ status: 'Active', role: 'Cashier' })).toBe(false);
    expect(isActiveSalesperson({ role: 'Salesperson' })).toBe(false);
  });
});
