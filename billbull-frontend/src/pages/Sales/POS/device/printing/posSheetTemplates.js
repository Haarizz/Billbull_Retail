import { isTaxInvoiceDocument } from '../../../../../utils/documentTaxType';

// Sheet (non-thermal) print formats for POS sale documents.
//
// The POS paper settings (tplInvoicePaper, tplReceiptPaper) used to be 80mm | 58mm | A4. A4
// printed the branch's resolved default "Sales Invoice" template; there was no way
// to print the A5 portrait/landscape variants or a pre-printed form that Back Office
// already designs and prints. Each sheet format here maps onto one member of the
// Back Office "Sales Invoice" template family, so POS prints the exact template Back
// Office edits instead of keeping a second design in step.
//
// 'A4' deliberately keeps its historical meaning — the resolved default template —
// so terminals already configured for A4 print exactly what they printed before.

export const POS_SHEET_FORMATS = [
  { id: 'A4', label: 'A4' },
  { id: 'A5', label: 'A5 Portrait' },
  { id: 'A5L', label: 'A5 Landscape' },
  { id: 'PREPRINTED', label: 'Pre-printed' },
];

export const isSheetPaper = (paper) => POS_SHEET_FORMATS.some((f) => f.id === paper);

/**
 * The paper a sale document prints on. A taxed sale is a Tax Invoice and follows the
 * Tax Invoice tab's paper; a no-tax sale is a POS Receipt and follows the POS Receipt
 * tab's — the same hasTax split every other receipt setting (header, footer, toggles)
 * already makes.
 */
export const paperForDocument = (doc, invoicePaper, receiptPaper) =>
  (isTaxInvoiceDocument(doc) ? invoicePaper : receiptPaper);

export const sheetFormatLabel = (paper) =>
  POS_SHEET_FORMATS.find((f) => f.id === paper)?.label || paper;

const parseOptions = (tpl) => {
  try {
    return typeof tpl?.displayOptions === 'string'
      ? JSON.parse(tpl.displayOptions || '{}')
      : (tpl?.displayOptions || {});
  } catch {
    return {};
  }
};

// Mirrors isOverlayInvoiceTemplate in SalesInvoice.jsx — a template is an overlay
// (pre-printed / letterhead) when its type says so or its designer uses overlay mode.
export const isOverlayTemplate = (tpl) => {
  if (!tpl) return false;
  const type = String(tpl.templateType || '').toUpperCase();
  if (type === 'PREPRINTED' || type === 'LETTERHEAD') return true;
  const opts = parseOptions(tpl);
  return opts.salesDesigner === 'overlay' || opts?.salesDesignerSettings?.mode === 'preprinted';
};

const isPreprintedTemplate = (tpl) => {
  const type = String(tpl.templateType || '').toUpperCase();
  if (type === 'PREPRINTED') return true;
  if (type === 'LETTERHEAD') return false;
  return isOverlayTemplate(tpl);
};

// The row's paper columns are authoritative; the designer settings are a fallback
// for rows whose columns were never populated.
const sheetOf = (tpl) => {
  const settings = parseOptions(tpl).salesDesignerSettings || {};
  return {
    paper: String(tpl.paperSize || settings.paperSize || 'A4').toUpperCase(),
    landscape: String(tpl.orientation || settings.orientation || 'portrait').toLowerCase() === 'landscape',
  };
};

// CSS-pixel page box (96dpi) for previewing a template on its own sheet. A4 keeps
// the 794×1055 frame the POS designer preview has always used.
export const sheetPixelSize = (tpl) => {
  if (!tpl) return { width: 794, height: 1055 };
  const { paper, landscape } = sheetOf(tpl);
  if (paper === 'A5') return landscape ? { width: 794, height: 559 } : { width: 559, height: 794 };
  return landscape ? { width: 1123, height: 794 } : { width: 794, height: 1055 };
};

const MATCHERS = {
  A5: (t) => !isOverlayTemplate(t) && sheetOf(t).paper === 'A5' && !sheetOf(t).landscape,
  A5L: (t) => !isOverlayTemplate(t) && sheetOf(t).paper === 'A5' && sheetOf(t).landscape,
  PREPRINTED: (t) => isPreprintedTemplate(t),
};

/**
 * The family template a sheet format prints with, or null when the family has none
 * (the caller falls back to the default A4 template and says so). Another branch's
 * own row is never used. Among several candidates this branch's own row beats a
 * global one, then the default flag wins.
 */
export const pickSheetTemplate = (family, format, branchId) => {
  const match = MATCHERS[format];
  if (!match || !Array.isArray(family)) return null;
  const visible = (t) => branchId == null || t.branchId == null || String(t.branchId) === String(branchId);
  const candidates = family.filter((t) => t && t.isActive !== false && visible(t) && match(t));
  if (candidates.length === 0) return null;
  const rank = (t) => (t.branchId != null ? 2 : 0) + (t.isDefault ? 1 : 0);
  return [...candidates].sort((a, b) => rank(b) - rank(a))[0];
};
