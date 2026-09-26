import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Loader2, AlertTriangle } from 'lucide-react';
import { useBranch } from '../../../context/BranchContext';
import { useCompany } from '../../../context/CompanyContext';
import { buildZplBatch } from '../../../utils/zebraZpl';
import {
  resolveLabelPrinter, sendZplToLabelPrinter, LabelPrinterError,
} from '../../../utils/labelPrinterTransport';

/**
 * Employee ID barcode — on-screen preview, printed on the Zebra label printer.
 *
 * <h3>What it encodes</h3>
 * {@code Employee.employeeCode}, as CODE128. There is deliberately no second employee identifier:
 * the code is already UNIQUE and NOT NULL in the schema, and CODE128 covers the full ASCII set, so
 * any plausible employee code encodes without transformation. The POS resolves a scan through
 * {@code GET /api/employees/salespersons/by-code/{employeeCode}}, where the SERVER — not the scan —
 * decides whether that employee may act as a salesperson.
 *
 * <h3>How it prints</h3>
 * Through the SAME path product barcodes take: ZPL built by {@code utils/zebraZpl}, spooled by
 * {@code utils/labelPrinterTransport} to the branch's {@code LABEL_PRINTER} — over the local
 * BillBull Print Agent for USB/Bluetooth/Windows-queue printers, or relayed through the backend's
 * raw socket for network ones. No browser print, no hidden iframe, no second Zebra implementation:
 * an employee label is a label, and the label hardware is already proven.
 *
 * <p>HR remains the feature owner — this is reached from Employees &amp; Roles, not from the
 * Inventory barcode screen, and there is no employee BarcodeTemplate row. The layout below is
 * fixed, because product labels need a designer (every shelf differs) and an employee badge does
 * not.
 *
 * <h3>The preview</h3>
 * JsBarcode renders the on-screen SVG; the printer renders the ZPL. Those are two renderers of the
 * same DATA ({@code employeeCode} as CODE128), which is the same arrangement the product barcode
 * screen has always had between its preview and its Zebra output — the preview shows what will be
 * on the label, not a pixel simulation of it.
 */

/** Label stock, in mm. A small self-adhesive label that fits on an ID card or a lanyard holder. */
const LABEL_WIDTH_MM = 50;
const LABEL_HEIGHT_MM = 25;

/** Preview geometry only. The printed size comes from the ZPL above, not from these. */
const BARCODE_WIDTH_MM = LABEL_WIDTH_MM * 0.84;
const BARCODE_HEIGHT_MM = 10;
const CSS_PX_PER_MM = 96 / 25.4;

/** JsBarcode options. Human-readable text stays ON so the code can be keyed in by hand. */
export const EMPLOYEE_BARCODE_OPTIONS = {
  format: 'CODE128',
  width: 2,
  height: 50,
  displayValue: true,
  fontSize: 16,
  textMargin: 2,
  margin: 0,
};

/**
 * Scale the rendered SVG into a mm-sized box, preserving its native aspect ratio.
 * Same approach as {@code fitBarcodeSvgToBox} in BarcodePrinter — growing to fill is what
 * stretches short, wide bars into unreadable smears.
 */
const fitBarcodeSvgToBox = (svg, targetWidthMm, targetHeightMm) => {
  if (!svg?.viewBox?.baseVal) return;
  const nativeW = svg.viewBox.baseVal.width;
  const nativeH = svg.viewBox.baseVal.height;
  if (!nativeW || !nativeH) return;

  const scale = Math.min(
    (targetWidthMm * CSS_PX_PER_MM) / nativeW,
    (targetHeightMm * CSS_PX_PER_MM) / nativeH,
  );
  const finalW = (nativeW * scale) / CSS_PX_PER_MM;
  const finalH = (nativeH * scale) / CSS_PX_PER_MM;

  svg.setAttribute('width', `${finalW}mm`);
  svg.setAttribute('height', `${finalH}mm`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = `${finalW}mm`;
  svg.style.height = `${finalH}mm`;
  svg.style.display = 'block';
  svg.style.margin = '0 auto';
  svg.style.shapeRendering = 'crispEdges';
};

export const renderEmployeeBarcode = (svgEl, employeeCode) => {
  if (!svgEl || !employeeCode) return false;
  try {
    JsBarcode(svgEl, String(employeeCode), EMPLOYEE_BARCODE_OPTIONS);
    fitBarcodeSvgToBox(svgEl, BARCODE_WIDTH_MM, BARCODE_HEIGHT_MM);
    return true;
  } catch (error) {
    console.error('Employee barcode generation failed:', employeeCode, error);
    return false;
  }
};

/**
 * The label as ZPL, built through the shared generator so employee labels get the same fitting,
 * font-scaling and centring rules product labels do.
 *
 * <p>The field ids are the generator's vocabulary, not a description of an employee: {@code
 * company} is the brand line, {@code productName} the employee's name, {@code brand} their role
 * and {@code code} the human-readable employee code. {@code productBarcode} carries the CODE128
 * itself — {@code ^BCN,...,Y} prints the value underneath the bars as well, so the code appears
 * both as a line of text and under the barcode, which is what makes a scuffed label still usable.
 */
export const buildEmployeeLabelZpl = ({ employeeCode, name, role, companyName = 'BillBull' }) =>
  buildZplBatch([{
    labelWidthMm: LABEL_WIDTH_MM,
    labelHeightMm: LABEL_HEIGHT_MM,
    fields: [
      { type: 'text', id: 'company', enabled: !!companyName, value: companyName },
      { type: 'text', id: 'productName', enabled: !!name, value: name || '' },
      { type: 'text', id: 'brand', enabled: !!role, value: role || '' },
      { type: 'text', id: 'code', enabled: !!employeeCode, value: employeeCode || '' },
      { type: 'barcode', id: 'productBarcode', enabled: !!employeeCode, value: employeeCode || '' },
    ],
  }]);

const CARD_CSS = `
  .emp-label {
    box-sizing: border-box;
    width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm;
    padding: 1.5mm 2mm; background: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
  }
  .emp-brand { font-size: 7px; font-weight: bold; letter-spacing: 0.5px; line-height: 1.1; }
  .emp-name { font-size: 9px; font-weight: bold; line-height: 1.15; word-break: break-word; }
  .emp-role { font-size: 6px; text-transform: uppercase; letter-spacing: 0.5px; color: #444; }
  .emp-code { font-size: 6px; font-family: monospace; letter-spacing: 0.5px; }
  .emp-barcode { width: 100%; margin-top: 0.5mm; }
  .emp-barcode svg { max-width: 100%; }
`;

/**
 * @param {object} employee `{ name | firstName/lastName, employeeCode, role }`
 */
export default function EmployeeBarcodeCard({ open, employee, onClose }) {
  const svgRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const { activeBranchId, activeBranch } = useBranch();
  const { company } = useCompany();
  const companyName = company?.companyName || 'BillBull';

  const employeeCode = employee?.employeeCode || '';
  const name = employee?.name
    || [employee?.firstName, employee?.middleName, employee?.lastName]
      .filter(Boolean).join(' ').trim();
  const role = employee?.role || '';

  useEffect(() => {
    if (!open || !employeeCode) return;
    renderEmployeeBarcode(svgRef.current, employeeCode);
  }, [open, employeeCode]);

  // Clear the previous attempt's outcome each time the dialog is reopened, so a stale "sent to
  // ZD220" or a stale error can never be read as describing this employee's label.
  useEffect(() => {
    if (open) { setError(''); setSentTo(''); }
  }, [open, employeeCode]);

  if (!open || !employee) return null;

  const handlePrint = async () => {
    if (!employeeCode || printing) return;
    setPrinting(true);
    setError('');
    setSentTo('');
    try {
      const printer = await resolveLabelPrinter({
        branchId: activeBranchId,
        branchLabel: activeBranch?.name || 'this branch',
      });
      const zpl = buildEmployeeLabelZpl({ employeeCode, name, role, companyName });
      const sent = await sendZplToLabelPrinter(printer, zpl, {
        title: `BillBull Employee Barcode ${employeeCode}`,
      });
      setSentTo(sent.target);
    } catch (err) {
      console.error('Employee barcode print failed', err);
      // A LabelPrinterError already says what to fix (pick a branch, configure a printer);
      // anything else is a transport failure and keeps the underlying message.
      setError(err instanceof LabelPrinterError
        ? err.message
        : `Could not send the label to the printer.\n\n${err?.message || err}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Print Employee Barcode</h3>
          <button onClick={onClose} aria-label="Close employee barcode" className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex justify-center bg-slate-100 px-4 py-6">
          {/* Preview of what goes on the label. The printer renders the ZPL, not this markup. */}
          <style>{CARD_CSS}</style>
          <div className="emp-label" style={{ boxShadow: '0 4px 14px rgba(15,23,42,0.15)' }}>
            <div className="emp-brand">{companyName}</div>
            <div className="emp-name">{name || '—'}</div>
            {role && <div className="emp-role">{role}</div>}
            <div className="emp-code">{employeeCode || '—'}</div>
            <div className="emp-barcode">
              <svg ref={svgRef} data-employee-barcode={employeeCode} aria-label={`Barcode for ${employeeCode}`} />
            </div>
          </div>
        </div>

        {(error || sentTo) && (
          <div className="px-4 pt-3">
            {error ? (
              <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" />
                <p className="whitespace-pre-line text-xs text-red-700">{error}</p>
              </div>
            ) : (
              <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Sent to {sentTo}.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!employeeCode || printing}
            className="flex items-center gap-2 rounded bg-[#F5C742] px-4 py-2 text-xs font-bold text-slate-900 hover:bg-[#e7b936] disabled:bg-slate-200 disabled:text-slate-400"
          >
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {printing ? 'Sending…' : 'Print Label'}
          </button>
        </div>
      </div>
    </div>
  );
}
