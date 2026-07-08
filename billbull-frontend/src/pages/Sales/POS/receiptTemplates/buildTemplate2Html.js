import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxInvoiceReceiptBody, TEMPLATE2_CSS, TEMPLATE2_FONT_LINK } from "./BillBullTaxInvoiceReceipt";
import { ROBOTO_MONO_FONT_FACE } from "../../../../utils/receiptFont";

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
  /* Embed Roboto Mono (base64 @font-face) so the Latin type renders correctly on
     offline tills / kiosks where the Google Fonts CDN <link> above can't load —
     same reliability guarantee Template 1's builders have. Arabic (Noto Kufi)
     still comes from the CDN link as a progressive enhancement; it falls back to
     the OS Arabic font (Segoe UI / Tahoma) when offline. */
  ${ROBOTO_MONO_FONT_FACE}
  html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
  /* Fill the host width (the printed 80mm page, or the checkout preview panel
     which is wider than 80mm) rather than a hard 80mm, so the receipt spans the
     full available width instead of leaving an empty right gutter. The printed
     page is physically 80mm so this stays correct on the thermal printer. */
  body{width:100%;margin:0 auto}
  ${TEMPLATE2_CSS}
  /* Guard against horizontal overflow. overflow-wrap:anywhere breaks only
     over-long words (e.g. a long email or code) as a last resort; we do NOT use
     word-break:break-word globally because it shatters short labels like "Name"
     into a vertical stack when a neighbouring nowrap value squeezes the column. */
  *{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}
  /* A long customer name must wrap onto multiple lines instead of forcing the
     label column to collapse (which caused the vertical "N a m e" stacking) and
     instead of pushing the receipt wider than the paper. */
  .bb-receipt .kv2 .val{white-space:normal!important;word-break:break-word}
  .bb-receipt .kv2 .lbl{flex:0 0 auto;min-width:16mm}
  /* Fixed table layout keeps the item columns inside 100% width no matter how
     wide the numbers are, so the item table can't trigger a horizontal scroll.
     Explicit column widths give ITEM the room it needs (it wraps) while the
     numeric columns stay compact — without widths, table-layout:fixed would
     split all four columns evenly and crush the ITEM name. */
  .bb-receipt table.items{table-layout:fixed}
  .bb-receipt table.items td,.bb-receipt table.items th{word-break:break-word;overflow-wrap:anywhere}
  .bb-receipt table.items th:nth-child(1),.bb-receipt table.items td:nth-child(1){width:auto}
  .bb-receipt table.items th:nth-child(2),.bb-receipt table.items td:nth-child(2){width:10%}
  .bb-receipt table.items th:nth-child(3),.bb-receipt table.items td:nth-child(3){width:24%}
  .bb-receipt table.items th:nth-child(4),.bb-receipt table.items td:nth-child(4){width:24%}
  /* Print path renders the bare receipt (no gray designer wrapper) and fills
     the full page/panel width. --paper-width:100% overrides the 80mm token so
     the receipt body and its children stretch edge-to-edge. */
  .bb-receipt{box-shadow:none;width:100%;margin:0 auto;--paper-width:100%}
</style>
</head><body>${body}</body></html>`;
}
