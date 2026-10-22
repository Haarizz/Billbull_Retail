// Prints a cheque onto a pre-printed cheque leaf using a "Cheque" print template designed in
// Financials → Print & Email Templates → Cheque Printing (ChequePrintingDesigner).
//
// Geometry matches the designer exactly: fields are placed by % of the cheque's width/height and
// font sizes are CSS px at 100% zoom, where the designer canvas is widthMm × 3.78 px — i.e. CSS
// px at 96 dpi. The background scan is a positioning aid only and is never printed: the leaf
// already carries the bank's artwork.

import { formatAmountInWords } from "./amountInWords";
import { defaultChequePrintSettings } from "../pages/Financials/ChequePrintingDesigner";

const escapeHtml = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "2026-10-16" → "16 / 10 / 2026", the layout most UAE cheque date boxes expect. */
export const formatChequeDate = (iso) => {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return d && m && y ? `${d} / ${m} / ${y}` : String(iso);
};

export const formatChequeAmount = (amount, currency = "AED") => {
    const n = Number(amount) || 0;
    return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Values for each designer field id, from a cheque returned by /api/pay-cheques. */
export const chequeFieldValues = (cheque) => {
    const book = cheque?.chequeBook || {};
    const currency = book.currency || "AED";
    const refs = (cheque?.allocations || []).filter(a => a.active !== false)
        .map(a => a.reference || a.sourceNumber).filter(Boolean);
    return {
        "payee": cheque?.payeeName || "",
        "date": formatChequeDate(cheque?.chequeDate),
        "amount-digits": `**${formatChequeAmount(cheque?.amount, currency)}**`,
        "amount-words": formatAmountInWords(cheque?.amount, currency),
        "memo": cheque?.memo || (refs.length ? `Payment against ${refs.join(", ")}` : ""),
        "ref": cheque?.chequeNumber || "",
        "account-no": book.accountNumber || "",
    };
};

/** Parses a print template row's displayOptions into designer settings (falls back to defaults). */
export const chequeSettingsFromTemplate = (template) => {
    let settings = template?.displayOptions;
    if (typeof settings === "string") {
        try { settings = JSON.parse(settings); } catch { settings = null; }
    }
    const defaults = defaultChequePrintSettings(template?.name || "Default Cheque Template");
    return settings && Array.isArray(settings.fields) ? { ...defaults, ...settings } : defaults;
};

export const buildChequePrintHtml = (cheque, settings) => {
    const s = settings || defaultChequePrintSettings();
    const values = chequeFieldValues(cheque);
    const w = Number(s.widthMm) || 216;
    const h = Number(s.heightMm) || 96;
    const fields = (s.fields || []).filter(f => f.enabled).map(f => `
        <div style="position:absolute;left:${f.x}%;top:${f.y}%;width:${f.width}%;
            font-family:${escapeHtml(f.fontFamily)};font-size:${Number(f.fontSize) || 11}px;
            font-weight:${f.fontWeight === "bold" ? 700 : 400};font-style:${f.fontStyle === "italic" ? "italic" : "normal"};
            color:${escapeHtml(f.color || "#000")};text-align:${f.textAlign || "left"};
            line-height:1.3;white-space:nowrap;overflow:hidden;">${escapeHtml(values[f.id] ?? "")}</div>`).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>Cheque ${escapeHtml(cheque?.chequeNumber)}</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .leaf { position: relative; width: ${w}mm; height: ${h}mm; overflow: hidden; }
</style></head><body><div class="leaf">${fields}</div></body></html>`;
};
