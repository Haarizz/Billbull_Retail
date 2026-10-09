import { renderBilingualReceiptCanvas } from "../../../../utils/bilingualReceiptCanvas";
import { buildEscPosDocumentFromCanvasBase64 } from "../../../../utils/escPosReceipt";

/**
 * Silent thermal print path for Template 2 (Arabic/bilingual tax invoice).
 *
 * Template 2's Live Preview / browser Test Print (buildTemplate2Html) renders
 * the React component to HTML — fine for on-screen preview, but Arabic can only
 * reach the POS-80C class of thermal printers as a raster image (no Arabic code
 * page), so silent printing can't reuse that HTML. Instead this reuses
 * `renderBilingualReceiptCanvas` (utils/bilingualReceiptCanvas.js) — a canvas
 * renderer already built for exactly this bilingual layout, sharing the same
 * RECEIPT_LABELS dictionary as the HTML preview so wording matches — and packs
 * the finished canvas into one ESC/POS document via buildEscPosDocumentFromCanvas.
 *
 * @param {string} paperSize '58mm' | '80mm'
 * @param {object} invoice   production invoice shape (see buildSampleInvoice)
 * @param {object} opts      same opts bag buildEscPosReceipt takes
 * @returns {Promise<string>} base64 ESC/POS document
 */
export async function buildTemplate2EscPosBase64(paperSize, invoice, opts = {}) {
  const canvas = await renderBilingualReceiptCanvas(paperSize, invoice, opts);
  return buildEscPosDocumentFromCanvasBase64(canvas, { paperSize });
}
