// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// PRINT ORCHESTRATION + DEVICE BOUNDARY. This is categories (2)-(4) of the print stack:
// template resolution, printer resolution/dispatch, and the print-feedback surface.
//
// It deliberately does NOT contain document generation (category 1). The receipt/A4/
// ESC-POS builders stay where they are and are already covered by their own
// characterization suites; this hook orchestrates them, it does not reimplement them.
//
// WHAT STAYED IN POSSales, AND WHY:
//   * buildThermalReceiptArtifacts — an ~290-line builder whose useCallback dependency
//     array names 80+ template flags (every tpl*/t2* value). Passing that surface across
//     this boundary would be a worse abstraction than leaving it. It is pure document
//     generation and is already characterized.
//   * The tpl*/t2* template flags themselves — each is read 14-16 times across the
//     designer JSX and the POSConsole prop bag, so they are general POS configuration,
//     not print-owned state. They arrive here as inputs.
//   * The seven print consumers (checkout, reprint, delivery, layaway, settlement,
//     X/Z reports) — they are business handlers that now call into this small API.
import { useCallback, useMemo, useState } from 'react';

import { applyTaxAwareDisplayOptions, buildPosA4Template, USE_NEW_POS_PRINT_TEMPLATE } from '../../posPrintUtils';
import { isTaxInvoiceDocument } from '../../../../../utils/documentTaxType';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from '../../../../../utils/localPrintAgent';

/**
 * @param {object}   args
 * @param {Array}    args.printerConfigs                 configured POS printers
 * @param {object|null} args.currentTerminal
 * @param {object|null} args.resolvedPosInvoiceTemplate   DB-resolved invoice template
 * @param {object|null} args.resolvedPosCreditNoteTemplate
 * @param {object}   args.invoiceTemplateOptions   the tplInvoice* designer flags, assembled
 *                                                 by POSSales (they are shared config)
 * @param {string}   args.tplInvoiceFooter
 */
export function usePosPrinting({
  printerConfigs,
  currentTerminal,
  resolvedPosInvoiceTemplate,
  resolvedPosCreditNoteTemplate,
  invoiceTemplateOptions,
  tplInvoiceFooter,
} = {}) {
  const [printFeedback, setPrintFeedback] = useState(null);

  const resolveInvoiceA4Template = useCallback((footerNote, opts, hasTax = true) => {
    if (USE_NEW_POS_PRINT_TEMPLATE && resolvedPosInvoiceTemplate) {
      return applyTaxAwareDisplayOptions(resolvedPosInvoiceTemplate, hasTax);
    }
    // Fallback path (flag off or DB template unresolved): the fabricated in-memory
    // template must be tax-aware too, so a no-tax A4 never leaks VAT columns/rows
    // or TRN regardless of which template source is in play.
    return applyTaxAwareDisplayOptions(buildPosA4Template(footerNote, opts), hasTax);
  }, [resolvedPosInvoiceTemplate]);

  const resolveCreditNoteA4Template = useCallback((footerNote, opts) => {
    if (USE_NEW_POS_PRINT_TEMPLATE && resolvedPosCreditNoteTemplate) return resolvedPosCreditNoteTemplate;
    return buildPosA4Template(footerNote, opts, 'Sales Return');
  }, [resolvedPosCreditNoteTemplate]);

  /**
   * The A4 template for a given document, with the designer flags and footer already
   * applied and the tax-awareness derived from the document itself.
   *
   * Six call sites previously repeated the identical 18-flag literal inline:
   *   resolveInvoiceA4Template(tplInvoiceFooter, { showLogo: …, colVatAmt: … },
   *                            isTaxInvoiceDocument(doc))
   * This is exactly that expression, named once. No argument or ordering changed.
   */
  const resolveInvoiceA4TemplateFor = useCallback(
    (doc) => resolveInvoiceA4Template(tplInvoiceFooter, invoiceTemplateOptions, isTaxInvoiceDocument(doc)),
    [resolveInvoiceA4Template, tplInvoiceFooter, invoiceTemplateOptions],
  );

  const notifyPrintFallback = useCallback((message) => {
    setPrintFeedback({ type: 'error', message });
    setTimeout(() => setPrintFeedback(null), 6000);
  }, []);

  // ESC/POS-first: raw ESC/POS is the only path with real density/heat/font/
  // logo control, so it's always attempted first. If the Windows queue's driver
  // rejects the raw job (v4/WSD-class drivers refuse datatype RAW), the agent
  // layer falls back to the text/GDI path so the customer still gets a receipt —
  // and that downgrade is surfaced as a visible amber "compatibility mode" toast
  // (never silent), telling the operator to install the vendor or Generic/
  // Text-Only driver. A missing printer or a send that fails in BOTH modes still
  // throws. notifyPrintFallback reports hard failures via the dismissible toast.
  const printThermalReceiptWithConfiguredPrinter = useCallback(async ({
    full,
    text,
    escPosBase64,
    title = 'BillBull POS Receipt',
  }) => {
    const printer = resolvePrinterForContext(printerConfigs, {
      deviceType: 'RECEIPT_PRINTER',
      branchId: full.branchId || currentTerminal?.branchId || null,
      terminalId: full.posTerminalId || currentTerminal?.terminalId || null,
    });
    if (!printer) {
      throw new Error('No receipt printer is configured for this terminal. Set one up in Settings → Devices.');
    }
    if (!escPosBase64) {
      throw new Error('Could not build the ESC/POS receipt for this sale.');
    }
    const result = await sendEscPosReceiptToConfiguredPrinter(printer, { dataBase64: escPosBase64, receiptText: text, title });
    if (result?.fallbackUsed) {
      setPrintFeedback({
        type: 'warning',
        message: `Receipt printed in text compatibility mode — "${printer.deviceName || printer.systemPrinterName}" rejected raw ESC/POS (${result.escPosError || 'driver error'}). Install the printer's vendor driver or "Generic / Text Only" for full print quality.`,
      });
      setTimeout(() => setPrintFeedback(null), 10000);
      return { mode: 'agent-text-fallback', printer };
    }
    return { mode: 'agent-escpos', printer };
  }, [currentTerminal?.branchId, currentTerminal?.terminalId, printerConfigs]);

  return useMemo(() => ({
    printFeedback, setPrintFeedback,
    notifyPrintFallback,
    printThermalReceiptWithConfiguredPrinter,
    resolveInvoiceA4Template,
    resolveCreditNoteA4Template,
    resolveInvoiceA4TemplateFor,
  }), [
    printFeedback, notifyPrintFallback, printThermalReceiptWithConfiguredPrinter,
    resolveInvoiceA4Template, resolveCreditNoteA4Template, resolveInvoiceA4TemplateFor,
  ]);
}

export default usePosPrinting;
