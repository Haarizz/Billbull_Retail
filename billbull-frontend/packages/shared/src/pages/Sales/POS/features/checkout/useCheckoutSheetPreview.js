// Sheet checkout preview (A4 / A5 Portrait / A5 Landscape / Pre-printed).
//
// The checkout preview follows the paper the sale will print on — paperForSale: the Tax
// Invoice tab's paper for a taxed sale, the POS Receipt tab's otherwise. On a sheet paper
// it renders through the SAME buildInvoiceSheetHtml the real print uses (quietly: no
// "template missing" toast per keystroke), fed by the draft-cart printData, so preview and
// print agree. Thermal papers (80mm / 58mm) keep the thermal preview POSSales builds.
//
// The sheet renderer is async (it inlines images), so the html lives in state. While the
// sale is settling the last html is kept, matching the thermal preview's freeze. Nothing is
// built while the checkout overlay is closed.

import { useEffect, useMemo, useState } from 'react';

import { isTaxInvoiceDocument } from '../../../../../utils/documentTaxType';
import { buildDraftPrintDataFromCart, USE_NEW_POS_PRINT_TEMPLATE } from '../../posPrintUtils';
import { inScanOrder } from '../../posUtils';
import { isSheetPaper, pickSheetTemplate, sheetPixelSize } from '../../device/printing/posSheetTemplates';

export const thermalPreviewPaper = (paper) => (String(paper || '').includes('58') ? '58mm' : '80mm');

export default function useCheckoutSheetPreview({
  open,
  settling,
  currentInvoice,
  customer,
  invoiceNo,
  shippingCharge,
  paymentMode,
  currentTerminal,
  currentSession,
  currency,
  paperForSale,
  buildInvoiceSheetHtml,
  templateFamily,
  tpl: {
    receiptPaper, invoiceFooter, invoiceHeader, receiptHeader, invoiceShowStamp,
    outletName, outletTrn, outletAddress, outletPhone, logoDataUrl, stampDataUrl, companyLogoUrl,
  },
}) {
  const paper = currentInvoice ? paperForSale(currentInvoice) : receiptPaper;
  const isSheet = isSheetPaper(paper);
  const branchId = currentTerminal?.branchId || currentSession?.branchId || null;

  const pageSize = useMemo(() => {
    if (!isSheet || paper === 'A4') return sheetPixelSize(null);
    return sheetPixelSize(pickSheetTemplate(templateFamily, paper, branchId));
  }, [isSheet, paper, templateFamily, branchId]);

  const [builtHtml, setBuiltHtml] = useState('');
  const active = isSheet && open && !!currentInvoice?.items?.length;

  useEffect(() => {
    if (!active || settling) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const hasTax = isTaxInvoiceDocument(currentInvoice);
        const draftData = buildDraftPrintDataFromCart({
          invoiceNumber: invoiceNo || '',
          invoiceDate: new Date().toISOString(),
          customer,
          saleType: currentInvoice.saleType || '',
          terminalId: currentTerminal?.terminalId || '',
          counterName: currentTerminal?.counterName || '',
          paymentMode,
          subTotal: currentInvoice.subtotal || 0,
          taxTotal: currentInvoice.tax || 0,
          taxInclusive: !!currentInvoice.taxInclusive,
          invoiceTotal: (currentInvoice.total || 0) + (Number(shippingCharge) || 0),
          discountTotal: currentInvoice.totalDiscount || 0,
          branchName: currentTerminal?.branchName || currentSession?.branchName || '',
          items: inScanOrder(currentInvoice.items).map(it => ({
            itemCode: it.code || it.productId || it.id || '',
            itemName: it.name || '',
            description: it.description || '',
            quantity: it.quantity || 0,
            unitPrice: it.price || 0,
            netAmount: it.total || 0,
            discountPercent: it.discount || 0,
            taxPercent: it.taxRate,
            taxAmount: it.taxAmount,
            batchNumber: it.pinnedBatchNumber || it.batchNumber || '',
            // Product thumbnail for the Image column; the posted invoice gets it from the
            // product's primary media, so the preview must forward the cart line's copy.
            image: it.image || '',
            voided: !!it.isVoided,
          })),
        }, invoiceFooter, hasTax ? invoiceHeader : receiptHeader);
        const options = {
          companyProfile: {
            companyName: outletName, trn: outletTrn, address: outletAddress, phone: outletPhone,
            currency: currency || 'AED',
            logoUrl: logoDataUrl || companyLogoUrl || undefined,
            stampUrl: stampDataUrl || undefined,
            showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!stampDataUrl : invoiceShowStamp,
          },
        };
        const out = await buildInvoiceSheetHtml(currentInvoice, draftData, options, paper, { quiet: true });
        if (!cancelled) setBuiltHtml(out || '');
      } catch (e) {
        console.warn('Sheet checkout preview failed:', e);
        if (!cancelled) setBuiltHtml('');
      }
    })();
    return () => { cancelled = true; };
  }, [active, settling, paper, currentInvoice, customer, invoiceNo, shippingCharge, paymentMode,
    currentTerminal, currentSession, currency, buildInvoiceSheetHtml, invoiceFooter, invoiceHeader, receiptHeader,
    invoiceShowStamp, outletName, outletTrn, outletAddress, outletPhone, logoDataUrl, stampDataUrl, companyLogoUrl]);

  return { paper, isSheet, pageSize, html: active ? builtHtml : '', thermalPaper: thermalPreviewPaper(paper) };
}
