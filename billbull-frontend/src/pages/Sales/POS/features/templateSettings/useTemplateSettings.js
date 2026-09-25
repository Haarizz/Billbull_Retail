// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// The POS print-template / designer settings domain: 123 pieces of state that share one
// lifecycle. They are persisted together as the `printTemplateConfig` JSON blob on
// PosSettings, hydrated together by applyPrintTemplateConfig() below, and serialised back
// together by POSConsole's designer Save.
//
// GROUPING. These are returned FLAT, under their existing names, on purpose. Every value
// and setter is already consumed individually by the POSConsole prop bag and the designer
// JSX; regrouping them into template.invoice.showLogo shapes would turn a contained
// extraction into a repo-wide rename of ~250 references. The coherent boundary here is the
// SHARED LIFECYCLE (one blob in, one blob out), not a nested shape.
//
// NOT INCLUDED, deliberately:
//   * resolvedPosInvoiceTemplate / resolvedPosCreditNoteTemplate — same `tpl` prefix in
//     spirit but a different source (server-resolved PrintTemplate rows, not this blob)
//     and a different lifecycle. They stay in POSSales and feed usePosPrinting directly.
//   * buildThermalReceiptArtifacts and the print builders — this hook exists so a later
//     extraction can hand them an intentional settings object; it does not absorb them.
//
// Nothing was normalised while moving: every default, every `!= null` guard and every
// absent coercion is exactly as it was.
import { useMemo, useState } from 'react';

import { DEFAULT_RECEIPT_TEMPLATE_ID } from '../../receiptTemplates';

/**
 * @param {object} args
 * @param {Array}  args.branches  branch list, for the outlet-TRN fallback
 * @param {object} args.company   company profile, for the outlet-TRN fallback
 */
export function useTemplateSettings({ branches, company } = {}) {
  const [tplReceiptHeader, setTplReceiptHeader] = useState('Thank you for shopping with us!');
  // Template 2's Arabic title override for the POS Receipt tab (no-tax checkout
  // path). Template 1's header field above already covers English for both.
  const [tplReceiptHeaderAr, setTplReceiptHeaderAr] = useState('فاتورة مبيعات');
  const [tplReceiptFooter, setTplReceiptFooter] = useState('Returns accepted within 7 days with receipt.');
  const [tplReceiptPaper, setTplReceiptPaper] = useState('80mm');
  const [tplReceiptShowLogo, setTplReceiptShowLogo] = useState(true);
  const [tplReceiptShowTrn, setTplReceiptShowTrn] = useState(true);
  const [tplReceiptShowBarcode, setTplReceiptShowBarcode] = useState(true);
  const [tplInvoiceHeader, setTplInvoiceHeader] = useState('TAX INVOICE');
  // Template 2's Arabic title override for the Tax Invoice tab — default matches
  // Template 2's current hardcoded Arabic title so hasTax=true output is unchanged.
  const [tplInvoiceHeaderAr, setTplInvoiceHeaderAr] = useState('فاتورة ضريبية');
  const [tplInvoiceFooter, setTplInvoiceFooter] = useState('All prices inclusive of VAT at 5%.');
  const [tplInvoicePaper, setTplInvoicePaper] = useState('A4');
  const [tplReturnHeader, setTplReturnHeader] = useState('SALES RETURN / CREDIT NOTE');
  const [tplReturnFooter, setTplReturnFooter] = useState('Refund processed within 3–5 business days.');
  const [tplReturnPaper, setTplReturnPaper] = useState('A4');
  // Phase 3 cutover (USE_NEW_POS_PRINT_TEMPLATE): resolved branch-scoped PrintTemplate
  // rows, fetched once per session when the flag is on. buildPosA4Template's fabricated
  // in-memory template remains the fallback whenever these are null — see


  // Effective-template resolvers used by every A4 print call site: prefer the real,
  // branch-scoped PrintTemplate (Phase 3 cutover) when the flag is on and one resolved
  // successfully; otherwise fall back to buildPosA4Template's fabricated in-memory
  // template exactly as before. footerNote/opts/category match buildPosA4Template's
  // own signature so calling code doesn't need to branch. hasTax defaults to true
  // (the historical always-Tax-Invoice behavior) — callers that know the actual
  // sale's tax state pass it explicitly to get the Tax Invoice/Sales Invoice split
  // that buildPosPrintData's title already applies to the printed data.
  const [tplJobCardFooter, setTplJobCardFooter] = useState('We are not responsible for data loss during repair.');
  const [tplJobCardPaper, setTplJobCardPaper] = useState('A4');
  const [tplOutletName, setTplOutletName] = useState('BillBull Trading LLC');
  const [tplOutletTrn, setTplOutletTrn] = useState('');
  const [tplOutletAddress, setTplOutletAddress] = useState('Shop 12, Dubai Mall, Downtown Dubai');
  const [tplOutletPhone, setTplOutletPhone] = useState('+971 4 123 4567');
  const [tplLogoDataUrl, setTplLogoDataUrl] = useState(null);
  const [tplStampDataUrl, setTplStampDataUrl] = useState(null);

  // Company TRN printed in EVERY POS receipt/A4 header. The POS Print Templates tab
  // keeps its own free-text TRN field (tplOutletTrn) that ships with a sample value;
  // merchants routinely clear it, and the POS was the one print surface that never
  // fell back to the real company record — so every POS print (80mm + A4, sale,
  // reprint, delivery order, delivery settlement) silently lost the company TRN.
  // Mirror branchPrintProfile.buildDocumentHeaderProfile's rule instead: the active
  // branch's TRN wins when set, the company profile's TRN fills the gap.
  const effectiveOutletTrn = useMemo(() => {
    const typed = (tplOutletTrn || '').trim();
    if (typed) return typed;
    const activeBranchIdRaw = sessionStorage.getItem('activeBranchId');
    const branch = activeBranchIdRaw && activeBranchIdRaw !== 'ALL'
      ? (branches || []).find(b => String(b?.id) === String(activeBranchIdRaw))
      : null;
    return (branch?.trnNumber || company?.trn || '').trim();
  }, [tplOutletTrn, branches, company]);
  const [tplReceiptShowStamp, setTplReceiptShowStamp] = useState(false);
  const [tplInvoiceShowLogo, setTplInvoiceShowLogo] = useState(true);
  const [tplInvoiceShowCompanyDetails, setTplInvoiceShowCompanyDetails] = useState(true);
  const [tplInvoiceShowTrn, setTplInvoiceShowTrn] = useState(true);
  const [tplInvoiceShowCustomerDetails, setTplInvoiceShowCustomerDetails] = useState(true);
  const [tplInvoiceShowTerms, setTplInvoiceShowTerms] = useState(true);
  const [tplInvoiceShowNotes, setTplInvoiceShowNotes] = useState(true);
  const [tplInvoiceShowBankDetails, setTplInvoiceShowBankDetails] = useState(false);
  const [tplInvoiceShowQRCode, setTplInvoiceShowQRCode] = useState(false);
  const [tplInvoiceShowStamp, setTplInvoiceShowStamp] = useState(false);
  // QR / stamp / footer-image placement on the receipt: 'before' | 'after' the footer text.
  const [tplInvoiceQrPlacement, setTplInvoiceQrPlacement] = useState('before');
  const [tplInvoiceShowSignature, setTplInvoiceShowSignature] = useState(false);
  const [tplInvoiceShowGrandTotalBanner, setTplInvoiceShowGrandTotalBanner] = useState(true);
  const [tplInvoiceColItemCode, setTplInvoiceColItemCode] = useState(true);
  const [tplInvoiceColItemImage, setTplInvoiceColItemImage] = useState(false);
  const [tplInvoiceColBarcode, setTplInvoiceColBarcode] = useState(false);
  const [tplInvoiceColBatchNo, setTplInvoiceColBatchNo] = useState(true);
  const [tplInvoiceColDiscount, setTplInvoiceColDiscount] = useState(true);
  const [tplInvoiceColVatPct, setTplInvoiceColVatPct] = useState(true);
  const [tplInvoiceColVatAmt, setTplInvoiceColVatAmt] = useState(true);
  // Receipt A4 extras
  const [tplReceiptShowCompanyDetails, setTplReceiptShowCompanyDetails] = useState(true);
  const [tplReceiptShowCustomerDetails, setTplReceiptShowCustomerDetails] = useState(true);
  const [tplReceiptColItemCode, setTplReceiptColItemCode] = useState(true);
  const [tplReceiptColItemImage, setTplReceiptColItemImage] = useState(false);
  const [tplReceiptColBatchNo, setTplReceiptColBatchNo] = useState(true);
  const [tplReceiptColDiscount, setTplReceiptColDiscount] = useState(true);
  const [tplReceiptColVatPct, setTplReceiptColVatPct] = useState(true);
  const [tplReceiptColVatAmt, setTplReceiptColVatAmt] = useState(true);
  const [tplReceiptShowGrandTotalBanner, setTplReceiptShowGrandTotalBanner] = useState(true);
  const [tplReceiptShowTerms, setTplReceiptShowTerms] = useState(true);
  const [tplReceiptShowNotes, setTplReceiptShowNotes] = useState(false);
  const [tplReceiptShowBankDetails, setTplReceiptShowBankDetails] = useState(false);
  const [tplReceiptShowQRCode, setTplReceiptShowQRCode] = useState(false);
  const [tplReceiptShowSignature, setTplReceiptShowSignature] = useState(false);
  // Return A4 extras
  const [tplReturnShowLogo, setTplReturnShowLogo] = useState(true);
  const [tplReturnShowTrn, setTplReturnShowTrn] = useState(true);
  const [tplReturnShowStamp, setTplReturnShowStamp] = useState(false);
  const [tplReturnShowCompanyDetails, setTplReturnShowCompanyDetails] = useState(true);
  const [tplReturnShowCustomerDetails, setTplReturnShowCustomerDetails] = useState(true);
  const [tplReturnColItemCode, setTplReturnColItemCode] = useState(true);
  const [tplReturnColBatchNo, setTplReturnColBatchNo] = useState(true);
  const [tplReturnColDiscount, setTplReturnColDiscount] = useState(true);
  const [tplReturnColVatPct, setTplReturnColVatPct] = useState(true);
  const [tplReturnColVatAmt, setTplReturnColVatAmt] = useState(true);
  const [tplReturnShowGrandTotalBanner, setTplReturnShowGrandTotalBanner] = useState(true);
  const [tplReturnShowTerms, setTplReturnShowTerms] = useState(true);
  const [tplReturnShowNotes, setTplReturnShowNotes] = useState(false);
  const [tplReturnShowQRCode, setTplReturnShowQRCode] = useState(false);
  const [tplReturnShowSignature, setTplReturnShowSignature] = useState(false);
  const [tplReturnShowCreditBalance, setTplReturnShowCreditBalance] = useState(false);
  // Job Card A4 extras
  const [tplJobCardShowLogo, setTplJobCardShowLogo] = useState(true);
  const [tplJobCardShowTrn, setTplJobCardShowTrn] = useState(true);
  const [tplJobCardShowStamp, setTplJobCardShowStamp] = useState(false);
  const [tplJobCardShowCompanyDetails, setTplJobCardShowCompanyDetails] = useState(true);
  const [tplJobCardShowCustomerDetails, setTplJobCardShowCustomerDetails] = useState(true);
  const [tplJobCardShowSerialNumber, setTplJobCardShowSerialNumber] = useState(true);
  const [tplJobCardShowWarranty, setTplJobCardShowWarranty] = useState(true);
  const [tplJobCardShowTechnician, setTplJobCardShowTechnician] = useState(true);
  const [tplJobCardShowExpectedDate, setTplJobCardShowExpectedDate] = useState(true);
  const [tplJobCardShowCustomerSignature, setTplJobCardShowCustomerSignature] = useState(true);
  const [tplJobCardShowTerms, setTplJobCardShowTerms] = useState(true);
  // Which receipt template (Template 1 "native" vs Template 2 "billbull-ar")
  // drives the actual checkout print — persisted alongside the rest of
  // printTemplateConfig so the Print Templates designer's saved selection is
  // what the till prints at checkout, not just the designer's own test print.
  const [receiptTemplateId, setReceiptTemplateId] = useState(DEFAULT_RECEIPT_TEMPLATE_ID);

  // ── Template 2 (Arabic/bilingual) Show/Hide toggles ─────────────────────────
  // Template 2 renders its own sections (Account Balance, Delivery, Loyalty,
  // bilingual Arabic text) that Template 1 doesn't have, so it carries its OWN
  // independent toggle state rather than reusing Template 1's. Selecting
  // Template 2 in the designer swaps the toggle list AND its saved values.
  // Persisted alongside the rest of printTemplateConfig. Defaults preserve the
  // current Template 2 output (everything on except QR, which stays opt-in).
  const [t2ShowLogo, setT2ShowLogo] = useState(true);
  const [t2ShowCompanyDetails, setT2ShowCompanyDetails] = useState(true);
  const [t2ShowTrn, setT2ShowTrn] = useState(true);
  const [t2ShowArabic, setT2ShowArabic] = useState(true);
  const [t2ShowCustomerDetails, setT2ShowCustomerDetails] = useState(true);
  const [t2ShowAccountBalance, setT2ShowAccountBalance] = useState(true);
  const [t2ShowDelivery, setT2ShowDelivery] = useState(true);
  const [t2ShowVatSummary, setT2ShowVatSummary] = useState(true);
  const [t2ShowPaymentDetails, setT2ShowPaymentDetails] = useState(true);
  const [t2ShowLoyalty, setT2ShowLoyalty] = useState(true);
  const [t2ShowQRCode, setT2ShowQRCode] = useState(false);
  const [t2ShowFooterText, setT2ShowFooterText] = useState(true);
  const [t2ShowBarcode, setT2ShowBarcode] = useState(true);

  // ── Template 2 toggles, split per sub-tab ────────────────────────────────
  // The single t2Show* set above still drives the Print Templates designer
  // (both sub-tabs' Live Preview/Test Print, wired through POSConsole's tplCfg)
  // and stays untouched so that plumbing doesn't need to change. At real
  // checkout, Template 2 needs an INDEPENDENT toggle set per sub-tab (POS
  // Receipt vs Tax Invoice) so a no-tax sale doesn't inherit the tax-invoice
  // tab's Show/Hide choices. Same fields, same defaults as t2Show* above.
  const [t2ReceiptShowLogo, setT2ReceiptShowLogo] = useState(true);
  const [t2ReceiptShowCompanyDetails, setT2ReceiptShowCompanyDetails] = useState(true);
  const [t2ReceiptShowTrn, setT2ReceiptShowTrn] = useState(true);
  const [t2ReceiptShowArabic, setT2ReceiptShowArabic] = useState(true);
  const [t2ReceiptShowCustomerDetails, setT2ReceiptShowCustomerDetails] = useState(true);
  const [t2ReceiptShowAccountBalance, setT2ReceiptShowAccountBalance] = useState(true);
  const [t2ReceiptShowDelivery, setT2ReceiptShowDelivery] = useState(true);
  const [t2ReceiptShowVatSummary, setT2ReceiptShowVatSummary] = useState(true);
  const [t2ReceiptShowPaymentDetails, setT2ReceiptShowPaymentDetails] = useState(true);
  const [t2ReceiptShowLoyalty, setT2ReceiptShowLoyalty] = useState(true);
  const [t2ReceiptShowQRCode, setT2ReceiptShowQRCode] = useState(false);
  const [t2ReceiptShowFooterText, setT2ReceiptShowFooterText] = useState(true);
  const [t2ReceiptShowBarcode, setT2ReceiptShowBarcode] = useState(true);

  const [t2InvoiceShowLogo, setT2InvoiceShowLogo] = useState(true);
  const [t2InvoiceShowCompanyDetails, setT2InvoiceShowCompanyDetails] = useState(true);
  const [t2InvoiceShowTrn, setT2InvoiceShowTrn] = useState(true);
  const [t2InvoiceShowArabic, setT2InvoiceShowArabic] = useState(true);
  const [t2InvoiceShowCustomerDetails, setT2InvoiceShowCustomerDetails] = useState(true);
  const [t2InvoiceShowAccountBalance, setT2InvoiceShowAccountBalance] = useState(true);
  const [t2InvoiceShowDelivery, setT2InvoiceShowDelivery] = useState(true);
  const [t2InvoiceShowVatSummary, setT2InvoiceShowVatSummary] = useState(true);
  const [t2InvoiceShowPaymentDetails, setT2InvoiceShowPaymentDetails] = useState(true);
  const [t2InvoiceShowLoyalty, setT2InvoiceShowLoyalty] = useState(true);
  const [t2InvoiceShowQRCode, setT2InvoiceShowQRCode] = useState(false);
  const [t2InvoiceShowFooterText, setT2InvoiceShowFooterText] = useState(true);
  const [t2InvoiceShowBarcode, setT2InvoiceShowBarcode] = useState(true);

  /**
   * Seeds template state from the persisted `printTemplateConfig` blob.
   *
   * Moved verbatim out of the POS init effect. The `!= null` guard on every field is what
   * makes a partial or older blob fall through to the declared defaults rather than
   * writing undefined, and it is preserved per field.
   *
   * @param {object} tpl the parsed printTemplateConfig object
   */
  const applyPrintTemplateConfig = (tpl) => {
    if (!tpl) return;
    if (tpl.outletName != null) setTplOutletName(tpl.outletName);
    if (tpl.outletTrn != null) setTplOutletTrn(tpl.outletTrn);
    if (tpl.outletAddress != null) setTplOutletAddress(tpl.outletAddress);
    if (tpl.outletPhone != null) setTplOutletPhone(tpl.outletPhone);
    if (tpl.logoDataUrl != null) setTplLogoDataUrl(tpl.logoDataUrl);
    if (tpl.stampDataUrl != null) setTplStampDataUrl(tpl.stampDataUrl);
    if (tpl.receiptHeader != null) setTplReceiptHeader(tpl.receiptHeader);
    if (tpl.receiptHeaderAr != null) setTplReceiptHeaderAr(tpl.receiptHeaderAr);
    if (tpl.receiptFooter != null) setTplReceiptFooter(tpl.receiptFooter);
    if (tpl.receiptPaper != null) setTplReceiptPaper(tpl.receiptPaper);
    if (tpl.receiptShowLogo != null) setTplReceiptShowLogo(tpl.receiptShowLogo);
    if (tpl.receiptShowTrn != null) setTplReceiptShowTrn(tpl.receiptShowTrn);
    if (tpl.receiptShowStamp != null) setTplReceiptShowStamp(tpl.receiptShowStamp);
    if (tpl.receiptShowBarcode != null) setTplReceiptShowBarcode(tpl.receiptShowBarcode);
    if (tpl.receiptShowCompanyDetails != null) setTplReceiptShowCompanyDetails(tpl.receiptShowCompanyDetails);
    if (tpl.receiptShowCustomerDetails != null) setTplReceiptShowCustomerDetails(tpl.receiptShowCustomerDetails);
    if (tpl.receiptColItemCode != null) setTplReceiptColItemCode(tpl.receiptColItemCode);
    if (tpl.receiptColItemImage != null) setTplReceiptColItemImage(tpl.receiptColItemImage);
    if (tpl.receiptColBatchNo != null) setTplReceiptColBatchNo(tpl.receiptColBatchNo);
    if (tpl.receiptColDiscount != null) setTplReceiptColDiscount(tpl.receiptColDiscount);
    if (tpl.receiptColVatPct != null) setTplReceiptColVatPct(tpl.receiptColVatPct);
    if (tpl.receiptColVatAmt != null) setTplReceiptColVatAmt(tpl.receiptColVatAmt);
    if (tpl.receiptShowGrandTotalBanner != null) setTplReceiptShowGrandTotalBanner(tpl.receiptShowGrandTotalBanner);
    if (tpl.receiptShowTerms != null) setTplReceiptShowTerms(tpl.receiptShowTerms);
    if (tpl.receiptShowNotes != null) setTplReceiptShowNotes(tpl.receiptShowNotes);
    if (tpl.receiptShowBankDetails != null) setTplReceiptShowBankDetails(tpl.receiptShowBankDetails);
    if (tpl.receiptShowQRCode != null) setTplReceiptShowQRCode(tpl.receiptShowQRCode);
    if (tpl.receiptShowSignature != null) setTplReceiptShowSignature(tpl.receiptShowSignature);
    if (tpl.invoiceHeader != null) setTplInvoiceHeader(tpl.invoiceHeader);
    if (tpl.invoiceHeaderAr != null) setTplInvoiceHeaderAr(tpl.invoiceHeaderAr);
    if (tpl.invoiceFooter != null) setTplInvoiceFooter(tpl.invoiceFooter);
    if (tpl.invoicePaper != null) setTplInvoicePaper(tpl.invoicePaper);
    if (tpl.invoiceShowLogo != null) setTplInvoiceShowLogo(tpl.invoiceShowLogo);
    if (tpl.invoiceShowCompanyDetails != null) setTplInvoiceShowCompanyDetails(tpl.invoiceShowCompanyDetails);
    if (tpl.invoiceShowTrn != null) setTplInvoiceShowTrn(tpl.invoiceShowTrn);
    if (tpl.invoiceShowCustomerDetails != null) setTplInvoiceShowCustomerDetails(tpl.invoiceShowCustomerDetails);
    if (tpl.invoiceShowStamp != null) setTplInvoiceShowStamp(tpl.invoiceShowStamp);
    if (tpl.invoiceShowSignature != null) setTplInvoiceShowSignature(tpl.invoiceShowSignature);
    if (tpl.invoiceShowGrandTotalBanner != null) setTplInvoiceShowGrandTotalBanner(tpl.invoiceShowGrandTotalBanner);
    if (tpl.invoiceShowTerms != null) setTplInvoiceShowTerms(tpl.invoiceShowTerms);
    if (tpl.invoiceShowNotes != null) setTplInvoiceShowNotes(tpl.invoiceShowNotes);
    if (tpl.invoiceShowBankDetails != null) setTplInvoiceShowBankDetails(tpl.invoiceShowBankDetails);
    if (tpl.invoiceShowQRCode != null) setTplInvoiceShowQRCode(tpl.invoiceShowQRCode);
    if (tpl.invoiceQrPlacement != null) setTplInvoiceQrPlacement(tpl.invoiceQrPlacement);
    if (tpl.invoiceColItemCode != null) setTplInvoiceColItemCode(tpl.invoiceColItemCode);
    if (tpl.invoiceColItemImage != null) setTplInvoiceColItemImage(tpl.invoiceColItemImage);
    if (tpl.invoiceColBarcode != null) setTplInvoiceColBarcode(tpl.invoiceColBarcode);
    if (tpl.invoiceColBatchNo != null) setTplInvoiceColBatchNo(tpl.invoiceColBatchNo);
    if (tpl.invoiceColDiscount != null) setTplInvoiceColDiscount(tpl.invoiceColDiscount);
    if (tpl.invoiceColVatPct != null) setTplInvoiceColVatPct(tpl.invoiceColVatPct);
    if (tpl.invoiceColVatAmt != null) setTplInvoiceColVatAmt(tpl.invoiceColVatAmt);
    if (tpl.returnHeader != null) setTplReturnHeader(tpl.returnHeader);
    if (tpl.returnFooter != null) setTplReturnFooter(tpl.returnFooter);
    if (tpl.returnPaper != null) setTplReturnPaper(tpl.returnPaper);
    if (tpl.returnShowLogo != null) setTplReturnShowLogo(tpl.returnShowLogo);
    if (tpl.returnShowTrn != null) setTplReturnShowTrn(tpl.returnShowTrn);
    if (tpl.returnShowStamp != null) setTplReturnShowStamp(tpl.returnShowStamp);
    if (tpl.returnShowCompanyDetails != null) setTplReturnShowCompanyDetails(tpl.returnShowCompanyDetails);
    if (tpl.returnShowCustomerDetails != null) setTplReturnShowCustomerDetails(tpl.returnShowCustomerDetails);
    if (tpl.returnColItemCode != null) setTplReturnColItemCode(tpl.returnColItemCode);
    if (tpl.returnColBatchNo != null) setTplReturnColBatchNo(tpl.returnColBatchNo);
    if (tpl.returnColDiscount != null) setTplReturnColDiscount(tpl.returnColDiscount);
    if (tpl.returnColVatPct != null) setTplReturnColVatPct(tpl.returnColVatPct);
    if (tpl.returnColVatAmt != null) setTplReturnColVatAmt(tpl.returnColVatAmt);
    if (tpl.returnShowGrandTotalBanner != null) setTplReturnShowGrandTotalBanner(tpl.returnShowGrandTotalBanner);
    if (tpl.returnShowTerms != null) setTplReturnShowTerms(tpl.returnShowTerms);
    if (tpl.returnShowNotes != null) setTplReturnShowNotes(tpl.returnShowNotes);
    if (tpl.returnShowQRCode != null) setTplReturnShowQRCode(tpl.returnShowQRCode);
    if (tpl.returnShowSignature != null) setTplReturnShowSignature(tpl.returnShowSignature);
    if (tpl.returnShowCreditBalance != null) setTplReturnShowCreditBalance(tpl.returnShowCreditBalance);
    if (tpl.jobCardFooter != null) setTplJobCardFooter(tpl.jobCardFooter);
    if (tpl.jobCardPaper != null) setTplJobCardPaper(tpl.jobCardPaper);
    if (tpl.jobCardShowLogo != null) setTplJobCardShowLogo(tpl.jobCardShowLogo);
    if (tpl.jobCardShowTrn != null) setTplJobCardShowTrn(tpl.jobCardShowTrn);
    if (tpl.jobCardShowStamp != null) setTplJobCardShowStamp(tpl.jobCardShowStamp);
    if (tpl.jobCardShowCompanyDetails != null) setTplJobCardShowCompanyDetails(tpl.jobCardShowCompanyDetails);
    if (tpl.jobCardShowCustomerDetails != null) setTplJobCardShowCustomerDetails(tpl.jobCardShowCustomerDetails);
    if (tpl.jobCardShowSerialNumber != null) setTplJobCardShowSerialNumber(tpl.jobCardShowSerialNumber);
    if (tpl.jobCardShowWarranty != null) setTplJobCardShowWarranty(tpl.jobCardShowWarranty);
    if (tpl.jobCardShowTechnician != null) setTplJobCardShowTechnician(tpl.jobCardShowTechnician);
    if (tpl.jobCardShowExpectedDate != null) setTplJobCardShowExpectedDate(tpl.jobCardShowExpectedDate);
    if (tpl.jobCardShowCustomerSignature != null) setTplJobCardShowCustomerSignature(tpl.jobCardShowCustomerSignature);
    if (tpl.jobCardShowTerms != null) setTplJobCardShowTerms(tpl.jobCardShowTerms);
    if (tpl.receiptTemplateId != null) setReceiptTemplateId(tpl.receiptTemplateId);
    // Template 2 (Arabic) independent Show/Hide toggles
    if (tpl.t2ShowLogo != null) setT2ShowLogo(tpl.t2ShowLogo);
    if (tpl.t2ShowCompanyDetails != null) setT2ShowCompanyDetails(tpl.t2ShowCompanyDetails);
    if (tpl.t2ShowTrn != null) setT2ShowTrn(tpl.t2ShowTrn);
    if (tpl.t2ShowArabic != null) setT2ShowArabic(tpl.t2ShowArabic);
    if (tpl.t2ShowCustomerDetails != null) setT2ShowCustomerDetails(tpl.t2ShowCustomerDetails);
    if (tpl.t2ShowAccountBalance != null) setT2ShowAccountBalance(tpl.t2ShowAccountBalance);
    if (tpl.t2ShowDelivery != null) setT2ShowDelivery(tpl.t2ShowDelivery);
    if (tpl.t2ShowVatSummary != null) setT2ShowVatSummary(tpl.t2ShowVatSummary);
    if (tpl.t2ShowPaymentDetails != null) setT2ShowPaymentDetails(tpl.t2ShowPaymentDetails);
    if (tpl.t2ShowLoyalty != null) setT2ShowLoyalty(tpl.t2ShowLoyalty);
    if (tpl.t2ShowQRCode != null) setT2ShowQRCode(tpl.t2ShowQRCode);
    if (tpl.t2ShowFooterText != null) setT2ShowFooterText(tpl.t2ShowFooterText);
    if (tpl.t2ShowBarcode != null) setT2ShowBarcode(tpl.t2ShowBarcode);
    // Template 2 toggles, split per sub-tab (POS Receipt vs Tax Invoice)
    if (tpl.t2ReceiptShowLogo != null) setT2ReceiptShowLogo(tpl.t2ReceiptShowLogo);
    if (tpl.t2ReceiptShowCompanyDetails != null) setT2ReceiptShowCompanyDetails(tpl.t2ReceiptShowCompanyDetails);
    if (tpl.t2ReceiptShowTrn != null) setT2ReceiptShowTrn(tpl.t2ReceiptShowTrn);
    if (tpl.t2ReceiptShowArabic != null) setT2ReceiptShowArabic(tpl.t2ReceiptShowArabic);
    if (tpl.t2ReceiptShowCustomerDetails != null) setT2ReceiptShowCustomerDetails(tpl.t2ReceiptShowCustomerDetails);
    if (tpl.t2ReceiptShowAccountBalance != null) setT2ReceiptShowAccountBalance(tpl.t2ReceiptShowAccountBalance);
    if (tpl.t2ReceiptShowDelivery != null) setT2ReceiptShowDelivery(tpl.t2ReceiptShowDelivery);
    if (tpl.t2ReceiptShowVatSummary != null) setT2ReceiptShowVatSummary(tpl.t2ReceiptShowVatSummary);
    if (tpl.t2ReceiptShowPaymentDetails != null) setT2ReceiptShowPaymentDetails(tpl.t2ReceiptShowPaymentDetails);
    if (tpl.t2ReceiptShowLoyalty != null) setT2ReceiptShowLoyalty(tpl.t2ReceiptShowLoyalty);
    if (tpl.t2ReceiptShowQRCode != null) setT2ReceiptShowQRCode(tpl.t2ReceiptShowQRCode);
    if (tpl.t2ReceiptShowFooterText != null) setT2ReceiptShowFooterText(tpl.t2ReceiptShowFooterText);
    if (tpl.t2ReceiptShowBarcode != null) setT2ReceiptShowBarcode(tpl.t2ReceiptShowBarcode);
    if (tpl.t2InvoiceShowLogo != null) setT2InvoiceShowLogo(tpl.t2InvoiceShowLogo);
    if (tpl.t2InvoiceShowCompanyDetails != null) setT2InvoiceShowCompanyDetails(tpl.t2InvoiceShowCompanyDetails);
    if (tpl.t2InvoiceShowTrn != null) setT2InvoiceShowTrn(tpl.t2InvoiceShowTrn);
    if (tpl.t2InvoiceShowArabic != null) setT2InvoiceShowArabic(tpl.t2InvoiceShowArabic);
    if (tpl.t2InvoiceShowCustomerDetails != null) setT2InvoiceShowCustomerDetails(tpl.t2InvoiceShowCustomerDetails);
    if (tpl.t2InvoiceShowAccountBalance != null) setT2InvoiceShowAccountBalance(tpl.t2InvoiceShowAccountBalance);
    if (tpl.t2InvoiceShowDelivery != null) setT2InvoiceShowDelivery(tpl.t2InvoiceShowDelivery);
    if (tpl.t2InvoiceShowVatSummary != null) setT2InvoiceShowVatSummary(tpl.t2InvoiceShowVatSummary);
    if (tpl.t2InvoiceShowPaymentDetails != null) setT2InvoiceShowPaymentDetails(tpl.t2InvoiceShowPaymentDetails);
    if (tpl.t2InvoiceShowLoyalty != null) setT2InvoiceShowLoyalty(tpl.t2InvoiceShowLoyalty);
    if (tpl.t2InvoiceShowQRCode != null) setT2InvoiceShowQRCode(tpl.t2InvoiceShowQRCode);
    if (tpl.t2InvoiceShowFooterText != null) setT2InvoiceShowFooterText(tpl.t2InvoiceShowFooterText);
    if (tpl.t2InvoiceShowBarcode != null) setT2InvoiceShowBarcode(tpl.t2InvoiceShowBarcode);
  };


  /**
   * The template-domain values buildThermalReceiptArtifacts reads — the explicit
   * projection that replaced its 83-entry closure dependency array. Exactly the fields
   * the builder references, nothing else: no setters, no unrelated POS settings.
   */
  // NOTE, deliberate: this dependency list mirrors the builder's ORIGINAL useCallback
  // array verbatim, which omitted tplReceiptShowBankDetails even though the body reads it
  // (see the CHARACTERIZED STALENESS test). Adding it here would make that flag take
  // effect sooner than it does today — a behaviour change, and a defect fix, both out of
  // scope for this extraction.
  const receiptArtifactTemplateSettings = useMemo(() => ({
    t2InvoiceShowAccountBalance, t2InvoiceShowArabic, t2InvoiceShowBarcode,
    t2InvoiceShowCompanyDetails, t2InvoiceShowCustomerDetails, t2InvoiceShowDelivery,
    t2InvoiceShowFooterText, t2InvoiceShowLogo, t2InvoiceShowLoyalty,
    t2InvoiceShowPaymentDetails, t2InvoiceShowQRCode, t2InvoiceShowTrn,
    t2InvoiceShowVatSummary, t2ReceiptShowAccountBalance, t2ReceiptShowArabic,
    t2ReceiptShowBarcode, t2ReceiptShowCompanyDetails, t2ReceiptShowCustomerDetails,
    t2ReceiptShowDelivery, t2ReceiptShowFooterText, t2ReceiptShowLogo,
    t2ReceiptShowLoyalty, t2ReceiptShowPaymentDetails, t2ReceiptShowQRCode,
    tplInvoiceColDiscount, tplInvoiceColVatAmt, tplInvoiceFooter,
    tplInvoiceHeader, tplInvoiceHeaderAr, tplInvoicePaper,
    tplInvoiceQrPlacement, tplInvoiceShowBankDetails, tplInvoiceShowCompanyDetails,
    tplInvoiceShowCustomerDetails, tplInvoiceShowGrandTotalBanner, tplInvoiceShowLogo,
    tplInvoiceShowNotes, tplInvoiceShowQRCode, tplInvoiceShowTerms,
    tplInvoiceShowTrn, tplLogoDataUrl, tplOutletAddress,
    tplOutletName, tplOutletPhone, tplReceiptColDiscount,
    tplReceiptFooter, tplReceiptHeader, tplReceiptHeaderAr,
    tplReceiptShowBankDetails, tplReceiptShowBarcode, tplReceiptShowCompanyDetails,
    tplReceiptShowCustomerDetails, tplReceiptShowLogo, tplReceiptShowNotes,
    tplReceiptShowQRCode, tplReceiptShowTerms, tplStampDataUrl,
    receiptTemplateId, effectiveOutletTrn,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    t2InvoiceShowAccountBalance, t2InvoiceShowArabic, t2InvoiceShowBarcode,
    t2InvoiceShowCompanyDetails, t2InvoiceShowCustomerDetails, t2InvoiceShowDelivery,
    t2InvoiceShowFooterText, t2InvoiceShowLogo, t2InvoiceShowLoyalty,
    t2InvoiceShowPaymentDetails, t2InvoiceShowQRCode, t2InvoiceShowTrn,
    t2InvoiceShowVatSummary, t2ReceiptShowAccountBalance, t2ReceiptShowArabic,
    t2ReceiptShowBarcode, t2ReceiptShowCompanyDetails, t2ReceiptShowCustomerDetails,
    t2ReceiptShowDelivery, t2ReceiptShowFooterText, t2ReceiptShowLogo,
    t2ReceiptShowLoyalty, t2ReceiptShowPaymentDetails, t2ReceiptShowQRCode,
    tplInvoiceColDiscount, tplInvoiceColVatAmt, tplInvoiceFooter,
    tplInvoiceHeader, tplInvoiceHeaderAr, tplInvoicePaper,
    tplInvoiceQrPlacement, tplInvoiceShowBankDetails, tplInvoiceShowCompanyDetails,
    tplInvoiceShowCustomerDetails, tplInvoiceShowGrandTotalBanner, tplInvoiceShowLogo,
    tplInvoiceShowNotes, tplInvoiceShowQRCode, tplInvoiceShowTerms,
    tplInvoiceShowTrn, tplLogoDataUrl, tplOutletAddress,
    tplOutletName, tplOutletPhone, tplReceiptColDiscount,
    tplReceiptFooter, tplReceiptHeader, tplReceiptHeaderAr,
    tplReceiptShowBarcode, tplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails,
    tplReceiptShowLogo, tplReceiptShowNotes, tplReceiptShowQRCode,
    tplReceiptShowTerms, tplStampDataUrl, receiptTemplateId,
    effectiveOutletTrn,
  ]);

  return {
    tplReceiptHeader, setTplReceiptHeader,
    tplReceiptHeaderAr, setTplReceiptHeaderAr,
    tplReceiptFooter, setTplReceiptFooter,
    tplReceiptPaper, setTplReceiptPaper,
    tplReceiptShowLogo, setTplReceiptShowLogo,
    tplReceiptShowTrn, setTplReceiptShowTrn,
    tplReceiptShowBarcode, setTplReceiptShowBarcode,
    tplInvoiceHeader, setTplInvoiceHeader,
    tplInvoiceHeaderAr, setTplInvoiceHeaderAr,
    tplInvoiceFooter, setTplInvoiceFooter,
    tplInvoicePaper, setTplInvoicePaper,
    tplReturnHeader, setTplReturnHeader,
    tplReturnFooter, setTplReturnFooter,
    tplReturnPaper, setTplReturnPaper,
    tplJobCardFooter, setTplJobCardFooter,
    tplJobCardPaper, setTplJobCardPaper,
    tplOutletName, setTplOutletName,
    tplOutletTrn, setTplOutletTrn,
    tplOutletAddress, setTplOutletAddress,
    tplOutletPhone, setTplOutletPhone,
    tplLogoDataUrl, setTplLogoDataUrl,
    tplStampDataUrl, setTplStampDataUrl,
    tplReceiptShowStamp, setTplReceiptShowStamp,
    tplInvoiceShowLogo, setTplInvoiceShowLogo,
    tplInvoiceShowCompanyDetails, setTplInvoiceShowCompanyDetails,
    tplInvoiceShowTrn, setTplInvoiceShowTrn,
    tplInvoiceShowCustomerDetails, setTplInvoiceShowCustomerDetails,
    tplInvoiceShowTerms, setTplInvoiceShowTerms,
    tplInvoiceShowNotes, setTplInvoiceShowNotes,
    tplInvoiceShowBankDetails, setTplInvoiceShowBankDetails,
    tplInvoiceShowQRCode, setTplInvoiceShowQRCode,
    tplInvoiceShowStamp, setTplInvoiceShowStamp,
    tplInvoiceQrPlacement, setTplInvoiceQrPlacement,
    tplInvoiceShowSignature, setTplInvoiceShowSignature,
    tplInvoiceShowGrandTotalBanner, setTplInvoiceShowGrandTotalBanner,
    tplInvoiceColItemCode, setTplInvoiceColItemCode,
    tplInvoiceColItemImage, setTplInvoiceColItemImage,
    tplInvoiceColBarcode, setTplInvoiceColBarcode,
    tplInvoiceColBatchNo, setTplInvoiceColBatchNo,
    tplInvoiceColDiscount, setTplInvoiceColDiscount,
    tplInvoiceColVatPct, setTplInvoiceColVatPct,
    tplInvoiceColVatAmt, setTplInvoiceColVatAmt,
    tplReceiptShowCompanyDetails, setTplReceiptShowCompanyDetails,
    tplReceiptShowCustomerDetails, setTplReceiptShowCustomerDetails,
    tplReceiptColItemCode, setTplReceiptColItemCode,
    tplReceiptColItemImage, setTplReceiptColItemImage,
    tplReceiptColBatchNo, setTplReceiptColBatchNo,
    tplReceiptColDiscount, setTplReceiptColDiscount,
    tplReceiptColVatPct, setTplReceiptColVatPct,
    tplReceiptColVatAmt, setTplReceiptColVatAmt,
    tplReceiptShowGrandTotalBanner, setTplReceiptShowGrandTotalBanner,
    tplReceiptShowTerms, setTplReceiptShowTerms,
    tplReceiptShowNotes, setTplReceiptShowNotes,
    tplReceiptShowBankDetails, setTplReceiptShowBankDetails,
    tplReceiptShowQRCode, setTplReceiptShowQRCode,
    tplReceiptShowSignature, setTplReceiptShowSignature,
    tplReturnShowLogo, setTplReturnShowLogo,
    tplReturnShowTrn, setTplReturnShowTrn,
    tplReturnShowStamp, setTplReturnShowStamp,
    tplReturnShowCompanyDetails, setTplReturnShowCompanyDetails,
    tplReturnShowCustomerDetails, setTplReturnShowCustomerDetails,
    tplReturnColItemCode, setTplReturnColItemCode,
    tplReturnColBatchNo, setTplReturnColBatchNo,
    tplReturnColDiscount, setTplReturnColDiscount,
    tplReturnColVatPct, setTplReturnColVatPct,
    tplReturnColVatAmt, setTplReturnColVatAmt,
    tplReturnShowGrandTotalBanner, setTplReturnShowGrandTotalBanner,
    tplReturnShowTerms, setTplReturnShowTerms,
    tplReturnShowNotes, setTplReturnShowNotes,
    tplReturnShowQRCode, setTplReturnShowQRCode,
    tplReturnShowSignature, setTplReturnShowSignature,
    tplReturnShowCreditBalance, setTplReturnShowCreditBalance,
    tplJobCardShowLogo, setTplJobCardShowLogo,
    tplJobCardShowTrn, setTplJobCardShowTrn,
    tplJobCardShowStamp, setTplJobCardShowStamp,
    tplJobCardShowCompanyDetails, setTplJobCardShowCompanyDetails,
    tplJobCardShowCustomerDetails, setTplJobCardShowCustomerDetails,
    tplJobCardShowSerialNumber, setTplJobCardShowSerialNumber,
    tplJobCardShowWarranty, setTplJobCardShowWarranty,
    tplJobCardShowTechnician, setTplJobCardShowTechnician,
    tplJobCardShowExpectedDate, setTplJobCardShowExpectedDate,
    tplJobCardShowCustomerSignature, setTplJobCardShowCustomerSignature,
    tplJobCardShowTerms, setTplJobCardShowTerms,
    receiptTemplateId, setReceiptTemplateId,
    t2ShowLogo, setT2ShowLogo,
    t2ShowCompanyDetails, setT2ShowCompanyDetails,
    t2ShowTrn, setT2ShowTrn,
    t2ShowArabic, setT2ShowArabic,
    t2ShowCustomerDetails, setT2ShowCustomerDetails,
    t2ShowAccountBalance, setT2ShowAccountBalance,
    t2ShowDelivery, setT2ShowDelivery,
    t2ShowVatSummary, setT2ShowVatSummary,
    t2ShowPaymentDetails, setT2ShowPaymentDetails,
    t2ShowLoyalty, setT2ShowLoyalty,
    t2ShowQRCode, setT2ShowQRCode,
    t2ShowFooterText, setT2ShowFooterText,
    t2ShowBarcode, setT2ShowBarcode,
    t2ReceiptShowLogo, setT2ReceiptShowLogo,
    t2ReceiptShowCompanyDetails, setT2ReceiptShowCompanyDetails,
    t2ReceiptShowTrn, setT2ReceiptShowTrn,
    t2ReceiptShowArabic, setT2ReceiptShowArabic,
    t2ReceiptShowCustomerDetails, setT2ReceiptShowCustomerDetails,
    t2ReceiptShowAccountBalance, setT2ReceiptShowAccountBalance,
    t2ReceiptShowDelivery, setT2ReceiptShowDelivery,
    t2ReceiptShowVatSummary, setT2ReceiptShowVatSummary,
    t2ReceiptShowPaymentDetails, setT2ReceiptShowPaymentDetails,
    t2ReceiptShowLoyalty, setT2ReceiptShowLoyalty,
    t2ReceiptShowQRCode, setT2ReceiptShowQRCode,
    t2ReceiptShowFooterText, setT2ReceiptShowFooterText,
    t2ReceiptShowBarcode, setT2ReceiptShowBarcode,
    t2InvoiceShowLogo, setT2InvoiceShowLogo,
    t2InvoiceShowCompanyDetails, setT2InvoiceShowCompanyDetails,
    t2InvoiceShowTrn, setT2InvoiceShowTrn,
    t2InvoiceShowArabic, setT2InvoiceShowArabic,
    t2InvoiceShowCustomerDetails, setT2InvoiceShowCustomerDetails,
    t2InvoiceShowAccountBalance, setT2InvoiceShowAccountBalance,
    t2InvoiceShowDelivery, setT2InvoiceShowDelivery,
    t2InvoiceShowVatSummary, setT2InvoiceShowVatSummary,
    t2InvoiceShowPaymentDetails, setT2InvoiceShowPaymentDetails,
    t2InvoiceShowLoyalty, setT2InvoiceShowLoyalty,
    t2InvoiceShowQRCode, setT2InvoiceShowQRCode,
    t2InvoiceShowFooterText, setT2InvoiceShowFooterText,
    t2InvoiceShowBarcode, setT2InvoiceShowBarcode,
    effectiveOutletTrn,
    receiptArtifactTemplateSettings,
    applyPrintTemplateConfig,
  };
}

export default useTemplateSettings;
