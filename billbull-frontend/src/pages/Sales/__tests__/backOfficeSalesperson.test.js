import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * STRUCTURAL — back-office salesperson attribution on the Sales Invoice screen.
 *
 * SalesInvoice.jsx is a ~4k-line screen with a wide network surface, so — as
 * POSSalesArchitecture.characterization already does for POSSales — the wiring is asserted
 * against the real source rather than by rendering it.
 *
 * The rule this protects: turning the back-office toggle ON must restrict the picker to ACTIVE,
 * salesperson-eligible employees and bind by employee ID, WITHOUT disturbing the legacy free-text
 * `salesperson` string that existing reports read.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const SRC = read('../SalesInvoice.jsx');

describe('back-office salesperson — OFF', () => {
  it('renders no salesperson picker at all when the toggle is off', () => {
    // The whole field is gated, not just the new variant. The old free-text picker listed EVERY
    // employee, which is precisely what the eligibility rule forbids, so leaving it on the OFF
    // branch would have kept an ineligible-attribution path open indefinitely.
    expect(SRC).toContain('{salespersonEnabled && (');
    expect(SRC).not.toContain('<option key={emp.id} value={emp.name}>{emp.name}</option>');
  });

  it('leaves the legacy salesperson string being saved exactly as before', () => {
    // Hiding the picker changes what can be COLLECTED, never what is STORED: an invoice already
    // carrying a legacy name keeps it, and the field is still written on save.
    expect(SRC).toContain('salesperson: salesperson,');
    expect(SRC).toContain("setSalesperson(invoice.salesperson || 'John Doe');");
  });

  it('sends no employee attribution when the toggle is off', () => {
    expect(SRC).toContain('salespersonEmployeeId: salespersonEnabled && salespersonEmployeeId');
    expect(SRC).toContain("? Number(salespersonEmployeeId) : null,");
  });

  it('only loads the eligible roster when the toggle is on', () => {
    expect(SRC).toContain('if (backOfficeOn) {');
    expect(SRC).toContain('const roster = await getSalespersons()');
  });
});

describe('back-office salesperson — ON', () => {
  it('reads the toggle from sales settings', () => {
    expect(SRC).toContain('settingsData?.salespersonRequiredAtBackOffice');
  });

  it('uses the eligible-only roster, not the unfiltered employee-name feed', () => {
    // getEmployeeNames returns Active AND Inactive and every designation — exactly what must NOT
    // be offered as a salesperson.
    expect(SRC).toContain("import { getEmployeeNames, getSalespersons } from '../../api/employeeApi'");
    expect(SRC).toContain('setSalespersonOptions(Array.isArray(roster?.options) ? roster.options : [])');
  });

  it('binds by employee ID, not by name', () => {
    expect(SRC).toContain('value={salespersonEmployeeId}');
    expect(SRC).toContain('<option key={emp.id} value={emp.id}>');
  });

  it('sends both the id and the code for the server to re-resolve', () => {
    expect(SRC).toContain('salespersonEmployeeId: salespersonEnabled && salespersonEmployeeId');
    expect(SRC).toContain('salespersonEmployeeCode: salespersonEnabled && salespersonEmployeeId');
  });
});

describe('the legacy field is untouched', () => {
  it('still sends the free-text salesperson string', () => {
    expect(SRC).toContain('salesperson: salesperson,');
  });

  it('keeps the legacy string in step when an eligible employee is picked', () => {
    // Existing reports and printed documents read the legacy string; leaving it blank when the
    // new picker is used would silently change what they show.
    expect(SRC).toContain('setSalesperson(picked ? picked.name : \'\')');
  });
});
