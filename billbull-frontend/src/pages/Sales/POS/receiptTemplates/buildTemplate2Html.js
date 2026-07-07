import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxInvoiceReceiptBody, TEMPLATE2_CSS, TEMPLATE2_FONT_LINK } from "./BillBullTaxInvoiceReceipt";

/**
 * Renders Template 2 (Arabic / Bilingual tax invoice) to a standalone HTML
 * string suitable for the shared `printHtml()` pipeline — the exact same pipeline
 * Template 1's Test Print uses. The receipt body is produced by the same React
 * component the Live Preview renders, so preview and print stay in lock-step.
 *
 * @param {object} data  ReceiptData (from mapToTemplate2Data)
 * @returns {string} full HTML document
 */
export function buildTemplate2Html(data) {
  const body = renderToStaticMarkup(React.createElement(TaxInvoiceReceiptBody, { data }));

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="${TEMPLATE2_FONT_LINK}" rel="stylesheet">
<style>
  html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
  body{width:80mm;margin:0 auto}
  ${TEMPLATE2_CSS}
  /* Print path renders the bare receipt (no gray designer wrapper) */
  .bb-receipt{box-shadow:none;width:80mm;margin:0 auto}
</style>
</head><body>${body}</body></html>`;
}
