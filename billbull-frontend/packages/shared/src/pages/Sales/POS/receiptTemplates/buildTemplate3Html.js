import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Template3ReceiptBody, TEMPLATE3_CSS, TEMPLATE3_FONT_LINK } from "./Template3Receipt";

/**
 * Template 3 → standalone HTML for printHtml() (browser-print fallback), the
 * checkout preview iframe and the receipt PDF/email. Same body the Live
 * Preview renders.
 *
 * @param {object} data ReceiptData from mapToTemplate3Data
 * @returns {string} full HTML document
 */
export function buildTemplate3Html(data) {
  const body = renderToStaticMarkup(React.createElement(Template3ReceiptBody, { data }));
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="${TEMPLATE3_FONT_LINK}" rel="stylesheet">
<style>
  html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  ${TEMPLATE3_CSS}
  /* Fill the host (the 80mm page, or the wider checkout preview panel). */
  .bbt3{--paper-width:100%;width:100%}
  @page{size:80mm auto;margin:0}
</style>
</head><body>${body}</body></html>`;
}
