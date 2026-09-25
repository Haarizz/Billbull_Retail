import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Employee ID barcode label.
 *
 * Two things are load-bearing here and both are about NOT inventing a parallel mechanism:
 *
 *  1. the value encoded is `employeeCode` and nothing else — it is what the POS barcode lookup
 *     resolves, and a second identifier would mean two sources of truth for who an employee is;
 *  2. it prints as ZPL on the branch's LABEL_PRINTER, through the same generator and the same
 *     transport product barcodes use — not through a browser/iframe print, which produces an
 *     office page rather than a label and bypasses the proven hardware path entirely.
 */

const resolveLabelPrinter = vi.fn();
const sendZplToLabelPrinter = vi.fn();

const useBranch = vi.fn();
const useCompany = vi.fn();

// Only the two I/O functions are stubbed. LabelPrinterError is the REAL class, because the
// component branches on `instanceof` — a stand-in defined here would be a different class and the
// branch would silently take the wrong path in the test while working in production.
vi.mock('../../../utils/labelPrinterTransport', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveLabelPrinter: (...a) => resolveLabelPrinter(...a),
  sendZplToLabelPrinter: (...a) => sendZplToLabelPrinter(...a),
}));
vi.mock('../../../context/BranchContext', () => ({ useBranch: () => useBranch() }));
vi.mock('../../../context/CompanyContext', () => ({ useCompany: () => useCompany() }));

import { LabelPrinterError } from '../../../utils/labelPrinterTransport';
import EmployeeBarcodeCard, {
  EMPLOYEE_BARCODE_OPTIONS, renderEmployeeBarcode, buildEmployeeLabelZpl,
} from '../Emp_Role.jsx/EmployeeBarcodeCard';

const EMPLOYEE = { name: 'Manager One', employeeCode: 'EMP9664', role: 'Salesperson' };
const PRINTER = { id: 4, connectionType: 'USB', systemPrinterName: 'ZD220', deviceType: 'LABEL_PRINTER' };

const clickPrint = () => fireEvent.click(screen.getByRole('button', { name: /print label/i }));

describe('EmployeeBarcodeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBranch.mockReturnValue({ activeBranchId: 3, activeBranch: { name: 'Main Branch' } });
    useCompany.mockReturnValue({ company: { companyName: 'BillBull' } });
    resolveLabelPrinter.mockResolvedValue(PRINTER);
    sendZplToLabelPrinter.mockResolvedValue({ transport: 'agent', target: 'ZD220' });
  });

  it('renders nothing when closed', () => {
    const { container } = render(<EmployeeBarcodeCard open={false} employee={EMPLOYEE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without an employee', () => {
    const { container } = render(<EmployeeBarcodeCard open employee={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the name, code and role on the label preview', () => {
    render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={vi.fn()} />);
    expect(screen.getByText('Manager One')).toBeTruthy();
    expect(screen.getByText('EMP9664')).toBeTruthy();
    expect(screen.getByText('Salesperson')).toBeTruthy();
    expect(screen.getByText('BillBull')).toBeTruthy();
  });

  it('encodes the employee code — no second identifier', () => {
    const { container } = render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={vi.fn()} />);
    const svg = container.querySelector('svg[data-employee-barcode]');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('data-employee-barcode')).toBe('EMP9664');
  });

  // JsBarcode's SVG renderer measures its human-readable text through a canvas 2D context, which
  // jsdom does not implement — so the rendered <rect> geometry genuinely cannot be asserted in
  // this environment (the call throws internally and the component logs it). What IS assertable
  // here is that the correct value reaches JsBarcode with the correct options; the drawn output
  // is covered by the browser click-through instead.
  it('refuses to encode an absent code rather than drawing a placeholder', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(renderEmployeeBarcode(svg, '')).toBe(false);
    expect(renderEmployeeBarcode(svg, null)).toBe(false);
    expect(renderEmployeeBarcode(svg, undefined)).toBe(false);
    expect(renderEmployeeBarcode(null, 'EMP9664')).toBe(false);
    // A label with a blank or placeholder barcode is worse than no label: it scans to nothing at
    // the till while looking valid on the badge.
    expect(svg.querySelectorAll('rect')).toHaveLength(0);
  });

  it('uses CODE128 with the human-readable text on', () => {
    // Readable text matters: a damaged or unreadable label must still let the cashier key the
    // code in by hand rather than stranding the sale.
    expect(EMPLOYEE_BARCODE_OPTIONS.format).toBe('CODE128');
    expect(EMPLOYEE_BARCODE_OPTIONS.displayValue).toBe(true);
  });

  it('builds a name from firstName/lastName when no display name is supplied', () => {
    render(<EmployeeBarcodeCard open onClose={vi.fn()}
      employee={{ firstName: 'Cashier', lastName: 'Two', employeeCode: 'EMP0002' }} />);
    expect(screen.getByText('Cashier Two')).toBeTruthy();
  });

  it('disables Print when the employee has no code to encode', () => {
    render(<EmployeeBarcodeCard open onClose={vi.fn()}
      employee={{ name: 'No Code', employeeCode: '' }} />);
    expect(screen.getByRole('button', { name: /print label/i }).disabled).toBe(true);
  });

  // ── the ZPL label path ─────────────────────────────────────────────────

  describe('the ZPL it generates', () => {
    const zpl = () => buildEmployeeLabelZpl({
      employeeCode: 'EMP9664', name: 'Manager One', role: 'Salesperson', companyName: 'BillBull',
    });

    it('is a single well-formed label', () => {
      expect(zpl().match(/\^XA/g)).toHaveLength(1);
      expect(zpl().trim().endsWith('^XZ')).toBe(true);
    });

    it('carries the employee code as a CODE128 barcode with its text underneath', () => {
      // ^BC is Code 128; the third parameter Y prints the interpretation line, which is what
      // makes the code readable off the label when the bars will not scan.
      expect(zpl()).toMatch(/\^BCN,\d+,Y,N,N\^FDEMP9664\^FS/);
    });

    it('prints the brand, name, role and code as text', () => {
      const out = zpl();
      expect(out).toContain('^FDBillBull^FS');
      expect(out).toContain('^FDManager One^FS');
      expect(out).toContain('^FDSalesperson^FS');
      expect(out).toContain('^FDEMP9664^FS');
    });
  });

  describe('printing', () => {
    it('spools ZPL to the branch label printer — not a browser print', async () => {
      const appended = [];
      const realAppend = document.body.appendChild.bind(document.body);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        appended.push(node);
        return realAppend(node);
      });

      render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={vi.fn()} />);
      clickPrint();

      await waitFor(() => expect(sendZplToLabelPrinter).toHaveBeenCalled());
      expect(resolveLabelPrinter).toHaveBeenCalledWith({ branchId: 3, branchLabel: 'Main Branch' });
      const [printer, zpl] = sendZplToLabelPrinter.mock.calls[0];
      expect(printer).toBe(PRINTER);
      expect(zpl).toContain('^FDEMP9664^FS');
      // The old implementation printed an ID card through a hidden iframe. Nothing of that path
      // may remain — an office page is not a label and does not reach the label hardware.
      expect(appended.some((n) => n.tagName === 'IFRAME')).toBe(false);
    });

    it('confirms where the label went', async () => {
      render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={vi.fn()} />);
      clickPrint();
      // "Nothing happened" and "it printed in the back office" look identical from the desk, so
      // the destination is named.
      await waitFor(() => expect(screen.getByText(/Sent to ZD220/)).toBeTruthy());
    });

    it('shows the printer-resolution reason rather than a stack', async () => {
      // No branch selected, no printer configured: both are things the user can fix, and the
      // transport already phrases them. The component must not flatten that into "print failed".
      resolveLabelPrinter.mockRejectedValue(
        new LabelPrinterError('Select a branch before printing labels.'));

      render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={vi.fn()} />);
      clickPrint();

      await waitFor(() => expect(screen.getByText('Select a branch before printing labels.')).toBeTruthy());
      expect(sendZplToLabelPrinter).not.toHaveBeenCalled();
    });

    it('reports a transport failure without leaving the button stuck', async () => {
      sendZplToLabelPrinter.mockRejectedValue(new Error('Print agent is not running'));

      render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={vi.fn()} />);
      clickPrint();

      await waitFor(() => expect(screen.getByText(/Print agent is not running/)).toBeTruthy());
      // Retryable: a label that failed because the agent was closed should print once it is open.
      expect(screen.getByRole('button', { name: /print label/i }).disabled).toBe(false);
    });
  });

  it('closes without printing when dismissed', () => {
    const onClose = vi.fn();
    render(<EmployeeBarcodeCard open employee={EMPLOYEE} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(sendZplToLabelPrinter).not.toHaveBeenCalled();
  });
});
