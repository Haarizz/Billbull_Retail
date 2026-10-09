/**
 * POS Receipt Template Registry
 * -----------------------------
 * Scalable registry that lets the Print Templates designer switch which receipt
 * template drives the Live Preview and Test Print, without hardcoding a
 * two-template conditional. To add Template 3/4/etc., append an entry here — the
 * selector tabs and rendering logic iterate over this list, so no other code
 * changes are required.
 *
 * Entry shape:
 *   {
 *     id:        stable string id (persisted / used in selector)
 *     label:     short label shown on the selector tab
 *     kind:      'native'  -> rendered by the existing in-designer engine
 *                            (ThermalMock preview + buildThermalSampleHtml print).
 *                            The registry does NOT re-implement this; POSConsole
 *                            keeps its current path for `native` so Template 1 is
 *                            byte-for-byte unchanged.
 *                'component'-> rendered by a React component + HTML builder below.
 *     paper:     supported paper (informational)
 *     Preview:   (component kind) React component taking { data }
 *     buildHtml: (component kind) (data) => full HTML string for printHtml()
 *                            — used for Full Preview and as the browser-print
 *                            FALLBACK when no thermal printer is configured.
 *     mapData:   (component kind) (outlet, txn) => data for Preview/buildHtml
 *     buildEscPosBase64: (paperSize, invoice, opts) => Promise<string base64> —
 *                            SILENT thermal print path (58mm/80mm only), sent
 *                            straight to the configured printer via the local
 *                            agent — no browser print dialog. Omit on an entry
 *                            that has no silent path yet; the caller falls back
 *                            to buildHtml()/printHtml() when this is absent.
 *   }
 *
 * IMPORTANT: `native` (Template 1) is the current production receipt and is the
 * default. Selecting another template only affects the designer preview / test
 * print — it does not alter the checkout print flow.
 */
import BillBullTaxInvoiceReceipt from "./BillBullTaxInvoiceReceipt";
import { buildTemplate2Html } from "./buildTemplate2Html";
import { mapToTemplate2Data } from "./billBullTaxInvoiceData";
import { buildTemplate2EscPosBase64 } from "./buildTemplate2EscPos";

export const RECEIPT_TEMPLATES = [
  {
    id: "native",
    label: "Template 1",
    sublabel: "Classic",
    kind: "native",
    paper: "58mm / 80mm",
  },
  {
    id: "billbull-ar",
    label: "Template 2",
    sublabel: "Arabic",
    kind: "component",
    paper: "80mm",
    Preview: BillBullTaxInvoiceReceipt,
    buildHtml: buildTemplate2Html,
    mapData: mapToTemplate2Data,
    buildEscPosBase64: buildTemplate2EscPosBase64,
  },
];

export const DEFAULT_RECEIPT_TEMPLATE_ID = "native";

export function getReceiptTemplate(id) {
  return (
    RECEIPT_TEMPLATES.find((t) => t.id === id) ||
    RECEIPT_TEMPLATES.find((t) => t.id === DEFAULT_RECEIPT_TEMPLATE_ID)
  );
}
