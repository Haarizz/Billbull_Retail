/**
 * Single sample invoice used by the Print Templates designer's Test Print /
 * Full Preview, in the SAME shape real checkout invoices carry (invoiceNumber,
 * items[].{itemName,quantity,unitPrice,netAmount,grossAmount}, subTotal,
 * taxTotal, invoiceTotal, customerName, paymentMode, …). Feeding this one shape
 * to buildEscPosReceipt (Template 1) and renderBilingualReceiptCanvas
 * (Template 2) is what lets both templates print through the exact production
 * renderers instead of a template-specific mock.
 *
 * Numbers mirror the designer's previous HTML-only sample (posPrintUtils.js
 * buildThermalSampleHtml) so switching templates doesn't change the numbers
 * the cashier is used to seeing on a test print.
 */
/**
 * @param {boolean} isReturn  build a credit-note sample (negative amounts).
 * @param {boolean} noTax      build a no-tax (plain Sales Invoice) sample: items
 *   carry no tax rate/amount, taxTotal is 0, and the total is the untaxed net.
 *   Used by the POS Receipt designer tab so its preview matches the real no-tax
 *   checkout print (no VAT columns/rows/TRN). Ignored for returns.
 */
export function buildSampleInvoice({ isReturn = false, noTax = false } = {}) {
  const untaxed = noTax && !isReturn;
  const items = isReturn
    ? [
        { itemName: 'Samsung A55', quantity: 1, unitPrice: 1380.0, grossAmount: 1380.0, netAmount: 1380.0, taxAmount: -69.0, taxPercent: 5 },
      ]
    : untaxed
    ? [
        // No taxPercent / taxAmount ⇒ the renderers print no per-line VAT and no
        // VAT/Taxable summary rows (a plain Sales Invoice).
        { itemName: 'Margherita Pizza', quantity: 1, unitPrice: 45.0, grossAmount: 45.0, netAmount: 45.0, sku: '10023' },
        { itemName: 'Coke', quantity: 2, unitPrice: 8.0, grossAmount: 16.0, netAmount: 16.0, sku: '10981' },
        { itemName: 'Caesar Salad', quantity: 1, unitPrice: 28.0, grossAmount: 28.0, netAmount: 28.0, sku: '11532' },
      ]
    : [
        { itemName: 'Margherita Pizza', quantity: 1, unitPrice: 45.0, grossAmount: 45.0, netAmount: 45.0, taxAmount: 2.25, taxPercent: 5, sku: '10023' },
        { itemName: 'Coke', quantity: 2, unitPrice: 8.0, grossAmount: 16.0, netAmount: 16.0, taxAmount: 0.8, taxPercent: 5, sku: '10981' },
        { itemName: 'Caesar Salad', quantity: 1, unitPrice: 28.0, grossAmount: 28.0, netAmount: 28.0, taxAmount: 1.85, taxPercent: 5, sku: '11532' },
      ];

  return {
    invoiceNumber: isReturn ? 'SR-28-042' : 'DI-28-042',
    invoiceDate: '2026-06-24T15:15:00',
    items,
    subTotal: isReturn ? -1380.0 : 89.0,
    discountTotal: 0,
    taxTotal: isReturn ? -69.0 : untaxed ? 0 : 4.9,
    taxInclusive: false,
    serviceChargeAmount: isReturn ? -138.0 : 8.9,
    deliveryCharge: 0,
    // No-tax total = net + service charge only (no VAT): 89.00 + 8.90 = 97.90.
    invoiceTotal: isReturn ? -1449.0 : untaxed ? 97.9 : 102.8,
    customerName: 'Sarah Johnson',
    paymentMode: isReturn ? 'CASH' : 'CASH',
    loyaltyPointsEarned: isReturn ? 0 : 10,
    loyaltyPointsUsed: 0,
    loyaltyBalance: 1250,
  };
}

/**
 * Shared option bag (branch/outlet + toggles) for the sample print, built from
 * the designer's current outlet/logo/QR config and field-toggle state — the
 * same values already used to drive the native preview/print, so Template 1
 * and Template 2 use identical branding for their sample Test Print.
 */
export function buildSampleOpts({ outlet, cfg, currency = 'AED' } = {}) {
  return {
    companyName: outlet.name,
    trn: outlet.trn,
    outletAddress: outlet.address,
    outletPhone: outlet.phone,
    header: cfg.header,
    footer: cfg.footer,
    logoDataUrl: outlet.logoDataUrl,
    stampDataUrl: outlet.qrDataUrl,
    showLogo: cfg.showLogo,
    showTrn: cfg.showTrn,
    showCompanyDetails: cfg.showCompanyDetails,
    showServiceCharge: cfg.showServiceCharge,
    showVatSummary: cfg.showVatSummary,
    showPaymentDetails: cfg.showPaymentDetails,
    showQRCode: cfg.showQRCode,
    qrContent: 'https://billbull.ae/verify/DI-28-042',
    showCustomerDetails: cfg.showCustomerDetails,
    showFooterText: cfg.showFooterText,
    customerPhone: '+971 50 123 4567',
    customerEmail: 'sarah@email.com',
    cashGiven: 150.0,
    changeAmount: 47.2,
    currency,
  };
}
