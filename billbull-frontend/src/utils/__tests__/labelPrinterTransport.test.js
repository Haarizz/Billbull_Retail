import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The one way anything in this app spools ZPL to a Zebra label printer.
 *
 * Two behaviours are load-bearing and neither is obvious from the call sites:
 *
 *  - **Never guess a branch.** Label printers are physical hardware in a specific building. With
 *    "All Branches" selected there is no defensible choice, and picking the first one would spool
 *    labels somewhere else with no error and no way to notice.
 *  - **The transport fork.** Network printers are relayed through the backend's raw socket so they
 *    work from any device; USB/queue printers can only be reached by the machine they are plugged
 *    into, so those go through the local agent. Getting this backwards produces a silent no-op.
 */

const getPosPrinters = vi.fn();
const printPosPrinterEscPos = vi.fn();
const resolvePrinterForContext = vi.fn();
const printEscPosThroughAgent = vi.fn();

vi.mock('../../api/posPrinterApi', () => ({
  getPosPrinters: (...a) => getPosPrinters(...a),
  printPosPrinterEscPos: (...a) => printPosPrinterEscPos(...a),
}));
vi.mock('../localPrintAgent', () => ({
  resolvePrinterForContext: (...a) => resolvePrinterForContext(...a),
  printEscPosThroughAgent: (...a) => printEscPosThroughAgent(...a),
}));

import {
  resolveLabelPrinter, sendZplToLabelPrinter, printZplToBranchLabelPrinter, LabelPrinterError,
} from '../labelPrinterTransport';

const USB = { id: 1, connectionType: 'USB', systemPrinterName: 'ZD220', deviceType: 'LABEL_PRINTER' };
const NET = { id: 2, connectionType: 'NETWORK_IP', ipAddress: '10.0.0.9', portNumber: 9100 };

describe('resolveLabelPrinter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPosPrinters.mockResolvedValue([USB]);
    resolvePrinterForContext.mockReturnValue(USB);
  });

  it('asks for the branch-scoped label printer, never a terminal-scoped one', async () => {
    await resolveLabelPrinter({ branchId: 3, branchLabel: 'Main' });

    expect(getPosPrinters).toHaveBeenCalledWith({ branchId: 3, deviceType: 'LABEL_PRINTER' });
    // terminalId is deliberately absent: label printing is an office operation and must not
    // require the operator to have registered their PC as a till.
    expect(resolvePrinterForContext).toHaveBeenCalledWith([USB], {
      deviceType: 'LABEL_PRINTER', branchId: 3,
    });
  });

  for (const [label, branchId] of [['All Branches', 'ALL'], ['none', null], ['blank', '']]) {
    it(`refuses to guess when the branch is ${label}`, async () => {
      await expect(resolveLabelPrinter({ branchId })).rejects.toThrow(LabelPrinterError);
      // Nothing is even looked up — there is no branch to look one up for.
      expect(getPosPrinters).not.toHaveBeenCalled();
    });
  }

  it('distinguishes "could not load the configuration" from "none is configured"', async () => {
    // The two need different fixes — one is a connectivity problem, the other a setup task — so
    // a failed lookup must not be reported as an absent printer.
    getPosPrinters.mockRejectedValue(new Error('gateway timeout'));
    resolvePrinterForContext.mockReturnValue(null);

    await expect(resolveLabelPrinter({ branchId: 3, branchLabel: 'Main' }))
      .rejects.toThrow(/Could not load the printer configuration for Main/);
  });

  it('tells the admin exactly how to add a printer when none is configured', async () => {
    resolvePrinterForContext.mockReturnValue(null);
    await expect(resolveLabelPrinter({ branchId: 3, branchLabel: 'Main' }))
      .rejects.toThrow(/No label printer is configured for Main/);
  });

  it('rejects a network printer with no address rather than failing at send time', async () => {
    resolvePrinterForContext.mockReturnValue({ ...NET, ipAddress: null });
    await expect(resolveLabelPrinter({ branchId: 3, branchLabel: 'Main' }))
      .rejects.toThrow(/missing an IP address or port/);
  });

  it('rejects a local printer with no system name', async () => {
    resolvePrinterForContext.mockReturnValue({ ...USB, systemPrinterName: '' });
    await expect(resolveLabelPrinter({ branchId: 3, branchLabel: 'Main' }))
      .rejects.toThrow(/no system printer name/);
  });
});

describe('sendZplToLabelPrinter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('relays a network printer through the backend socket', async () => {
    const result = await sendZplToLabelPrinter(NET, '^XA^XZ');

    expect(printPosPrinterEscPos).toHaveBeenCalledWith(2, btoa('^XA^XZ'));
    expect(printEscPosThroughAgent).not.toHaveBeenCalled();
    expect(result).toEqual({ transport: 'network', target: '10.0.0.9:9100' });
  });

  it('sends a USB printer through the local agent', async () => {
    const result = await sendZplToLabelPrinter(USB, '^XA^XZ', { title: 'Labels' });

    expect(printEscPosThroughAgent).toHaveBeenCalledWith(expect.objectContaining({
      printerName: 'ZD220', dataBase64: btoa('^XA^XZ'), connectionType: 'USB', title: 'Labels',
    }));
    expect(printPosPrinterEscPos).not.toHaveBeenCalled();
    expect(result).toEqual({ transport: 'agent', target: 'ZD220' });
  });

  it('carries non-ASCII bytes through base64 intact', async () => {
    // ^CI28 puts the ZPL in UTF-8, so a label can legitimately contain non-Latin-1 characters.
    // A plain btoa would throw on those; the encode/unescape pair is what makes it survive.
    await sendZplToLabelPrinter(USB, '^XA^FDمندوب^FS^XZ');
    const { dataBase64 } = printEscPosThroughAgent.mock.calls[0][0];
    expect(atob(dataBase64)).toContain('Ù'); // a UTF-8 lead byte, not a mangled '?'
  });
});

describe('printZplToBranchLabelPrinter', () => {
  it('resolves then sends in one call', async () => {
    vi.clearAllMocks();
    getPosPrinters.mockResolvedValue([USB]);
    resolvePrinterForContext.mockReturnValue(USB);

    const result = await printZplToBranchLabelPrinter('^XA^XZ', { branchId: 3, title: 'T' });

    expect(printEscPosThroughAgent).toHaveBeenCalled();
    expect(result.transport).toBe('agent');
  });
});
