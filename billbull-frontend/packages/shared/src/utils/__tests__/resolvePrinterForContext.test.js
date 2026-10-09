import { describe, expect, it } from 'vitest';

import { resolvePrinterForContext } from '../localPrintAgent';

// Printer scope resolution, per the branch-scoped-registry architecture:
//
//   branch    = ownership (branch_id NOT NULL)
//   terminal  = OPTIONAL narrowing (terminal_id nullable)
//   deviceType = role, not scope
//
// The rule these tests pin down is candidate ELIGIBILITY, which is decided before
// any ranking: a printer scoped to a terminal is physically at that terminal, so it
// must never be selected from any other context — including a context with no
// terminal at all, such as Inventory barcode labels or a back-office thermal
// invoice. Ranking alone cannot express that; a terminal-scoped default would
// otherwise outrank a branch-scoped non-default and quietly spool to another PC.

const printer = (over = {}) => ({
  id: 1,
  deviceName: 'Printer',
  deviceType: 'LABEL_PRINTER',
  status: 'ACTIVE',
  branchId: 1,
  terminalId: null,
  defaultPrinter: false,
  connectionType: 'WINDOWS_QUEUE',
  systemPrinterName: 'Queue',
  ...over,
});

describe('resolvePrinterForContext — Inventory (no terminal supplied)', () => {
  it('selects the branch-scoped default label printer', () => {
    const branchDefault = printer({ id: 10, deviceName: 'Zebra Branch', defaultPrinter: true });
    const branchOther = printer({ id: 11, deviceName: 'Zebra Spare' });

    const resolved = resolvePrinterForContext([branchOther, branchDefault], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved.id).toBe(10);
  });

  it('falls back to a branch-scoped non-default when no default exists', () => {
    const only = printer({ id: 12, deviceName: 'Zebra Only' });

    const resolved = resolvePrinterForContext([only], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved.id).toBe(12);
  });

  it('never selects a terminal-scoped printer, even one marked default', () => {
    // The exact leak the eligibility rule exists to close: before it, this
    // terminal-scoped default won on the bare defaultPrinter tie-break and
    // Inventory spooled labels to a Zebra plugged into a till.
    const terminalDefault = printer({ id: 20, deviceName: 'Zebra @ T1', terminalId: 'T1', defaultPrinter: true });

    const resolved = resolvePrinterForContext([terminalDefault], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved).toBeNull();
  });

  it('prefers the branch printer over any terminal-scoped printer in the same branch', () => {
    const terminalA = printer({ id: 20, deviceName: 'Zebra A', terminalId: 'T1', defaultPrinter: true });
    const terminalB = printer({ id: 21, deviceName: 'Zebra B', terminalId: 'T2', defaultPrinter: true });
    const branchScoped = printer({ id: 22, deviceName: 'Zebra Shared' });

    const resolved = resolvePrinterForContext([terminalA, terminalB, branchScoped], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved.id).toBe(22);
  });

  it('does not cross branches', () => {
    const otherBranch = printer({ id: 30, branchId: 2, defaultPrinter: true });

    const resolved = resolvePrinterForContext([otherBranch], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved).toBeNull();
  });

  it('does not cross roles', () => {
    const receipt = printer({ id: 40, deviceType: 'RECEIPT_PRINTER', defaultPrinter: true });
    const kitchen = printer({ id: 41, deviceType: 'KITCHEN_PRINTER', defaultPrinter: true });

    const resolved = resolvePrinterForContext([receipt, kitchen], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved).toBeNull();
  });

  it('ignores decommissioned printers', () => {
    const dead = printer({ id: 50, status: 'DECOMMISSIONED', defaultPrinter: true });

    const resolved = resolvePrinterForContext([dead], {
      deviceType: 'LABEL_PRINTER',
      branchId: 1,
    });

    expect(resolved).toBeNull();
  });
});

describe('resolvePrinterForContext — POS (terminal supplied)', () => {
  const receipt = (over = {}) => printer({ deviceType: 'RECEIPT_PRINTER', ...over });

  it('prefers this terminal default over the branch default', () => {
    const branchDefault = receipt({ id: 60, deviceName: 'Epson Branch', defaultPrinter: true });
    const terminalDefault = receipt({ id: 61, deviceName: 'Epson @ T1', terminalId: 'T1', defaultPrinter: true });

    const resolved = resolvePrinterForContext([branchDefault, terminalDefault], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 1,
      terminalId: 'T1',
    });

    expect(resolved.id).toBe(61);
  });

  it('prefers this terminal over the branch default even when not marked default', () => {
    const branchDefault = receipt({ id: 62, deviceName: 'Epson Branch', defaultPrinter: true });
    const terminalPlain = receipt({ id: 63, deviceName: 'Epson @ T1', terminalId: 'T1' });

    const resolved = resolvePrinterForContext([branchDefault, terminalPlain], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 1,
      terminalId: 'T1',
    });

    expect(resolved.id).toBe(63);
  });

  it('falls back to the branch default when this terminal has none', () => {
    const branchDefault = receipt({ id: 64, deviceName: 'Epson Branch', defaultPrinter: true });
    const otherTerminal = receipt({ id: 65, deviceName: 'Epson @ T2', terminalId: 'T2', defaultPrinter: true });

    const resolved = resolvePrinterForContext([otherTerminal, branchDefault], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 1,
      terminalId: 'T1',
    });

    expect(resolved.id).toBe(64);
  });

  it('never selects another terminal’s printer', () => {
    const otherTerminal = receipt({ id: 66, deviceName: 'Epson @ T2', terminalId: 'T2', defaultPrinter: true });

    const resolved = resolvePrinterForContext([otherTerminal], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 1,
      terminalId: 'T1',
    });

    expect(resolved).toBeNull();
  });

  it('matches terminal ids case-insensitively', () => {
    const terminalPrinter = receipt({ id: 67, terminalId: 't1' });

    const resolved = resolvePrinterForContext([terminalPrinter], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 1,
      terminalId: 'T1',
    });

    expect(resolved.id).toBe(67);
  });

  it('treats a blank terminalId on a printer as branch scope', () => {
    const blankScope = receipt({ id: 68, terminalId: '   ', defaultPrinter: true });

    const resolved = resolvePrinterForContext([blankScope], {
      deviceType: 'RECEIPT_PRINTER',
      branchId: 1,
      terminalId: 'T1',
    });

    expect(resolved.id).toBe(68);
  });
});

describe('resolvePrinterForContext — role separation on a shared workstation', () => {
  it('routes receipt and label roles to different printers', () => {
    const epson = printer({
      id: 70, deviceType: 'RECEIPT_PRINTER', terminalId: 'T1',
      defaultPrinter: true, systemPrinterName: 'EPSON TM-T20',
    });
    const zebra = printer({
      id: 71, deviceType: 'LABEL_PRINTER', terminalId: null,
      defaultPrinter: true, systemPrinterName: 'ZDesigner ZD421',
    });
    const configured = [epson, zebra];

    const forReceipt = resolvePrinterForContext(configured, {
      deviceType: 'RECEIPT_PRINTER', branchId: 1, terminalId: 'T1',
    });
    const forLabel = resolvePrinterForContext(configured, {
      deviceType: 'LABEL_PRINTER', branchId: 1,
    });

    expect(forReceipt.systemPrinterName).toBe('EPSON TM-T20');
    expect(forLabel.systemPrinterName).toBe('ZDesigner ZD421');
  });
});
