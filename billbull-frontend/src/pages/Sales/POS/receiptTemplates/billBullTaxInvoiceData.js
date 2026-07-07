/**
 * Data mapper for Template 2 (BillBull Arabic / Bilingual Tax Invoice).
 *
 * Both receipt templates consume the SAME underlying POS data model. Template 1
 * renders it via the existing thermal HTML builders; Template 2 renders it via
 * <BillBullTaxInvoiceReceipt>. This module adapts that shared model into the
 * `ReceiptData` shape the Template 2 component expects.
 *
 * `mapToTemplate2Data` never invents data: everything comes from the passed-in
 * `outlet` config (Print Templates → Branch/Outlet Info) and the `txn`
 * transaction object. When the designer is previewing with no live transaction,
 * the caller supplies `buildSampleTxn()` so the layout is exercised — but that
 * sample lives here, NOT inside the presentational component.
 */

const splitLines = (s) =>
  String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * @param {object} outlet  { name, trn, address, phone, logoDataUrl, qrDataUrl, footerText, nameAr, addressAr }
 * @param {object} txn     normalized POS transaction (see buildSampleTxn for shape)
 * @returns {object} ReceiptData for <BillBullTaxInvoiceReceipt data=... />
 */
export function mapToTemplate2Data(outlet = {}, txn = {}) {
  const currency = txn.currency || "AED";
  const footerLines = splitLines(outlet.footerText);

  return {
    currency,
    business: {
      nameEn: outlet.name || "Branch Name",
      nameAr: outlet.nameAr || "",
      tagline: outlet.tagline || "",
      addressEnLines: splitLines(outlet.address),
      addressArLines: splitLines(outlet.addressAr),
      phone: outlet.phone || "",
      trn: outlet.trn || "",
      logoDataUrl: outlet.logoDataUrl || null,
      qrDataUrl: outlet.qrDataUrl || null,
      footerMsgEn: footerLines[0] || "",
      footerFine: footerLines.slice(1).join(" "),
    },
    meta: {
      invoiceNo: txn.invoiceNo || "",
      date: txn.date || "",
      time: txn.time || "",
      branch: txn.branch || outlet.name || "",
      terminalId: txn.terminalId || "",
      cashierName: txn.cashierName || "",
      shiftNo: txn.shiftNo || "",
      saleType: txn.saleType || "",
    },
    customer: txn.customer
      ? {
          name: txn.customer.name || "",
          mobile: txn.customer.mobile || "",
          customerCode: txn.customer.code || "",
          customerTrn: txn.customer.trn || "",
        }
      : null,
    balance: txn.balance || null,
    delivery: txn.delivery
      ? {
          lineEn: splitLines(txn.delivery.addressEn),
          lineAr: splitLines(txn.delivery.addressAr),
          contactNote: txn.delivery.contactNote || "",
        }
      : null,
    items: (txn.items || []).map((it) => ({
      nameEn: it.nameEn || it.name || "",
      nameAr: it.nameAr || "",
      sku: it.sku || it.code || "",
      vatLabel: it.vatLabel || "",
      qty: Number(it.qty || 0),
      rate: Number(it.rate || 0),
      amount: Number(it.amount || 0),
    })),
    totals: {
      subtotal: Number(txn.totals?.subtotal || 0),
      discount: Number(txn.totals?.discount || 0),
      vat5: Number(txn.totals?.vat5 || 0),
      vat0: Number(txn.totals?.vat0 || 0),
      deliveryCharge: Number(txn.totals?.deliveryCharge || 0),
      roundOff: Number(txn.totals?.roundOff || 0),
      totalToPay: Number(txn.totals?.totalToPay || 0),
    },
    payment: txn.payment
      ? {
          mode: txn.payment.mode || "",
          paidAmount: Number(txn.payment.paidAmount || 0),
          changeReturned: Number(txn.payment.changeReturned || 0),
          cardRef: txn.payment.cardRef || "",
        }
      : null,
    loyalty: txn.loyalty || null,
    vatSummary: {
      standardRateAmount: Number(txn.vatSummary?.standardRateAmount ?? txn.totals?.vat5 ?? 0),
      zeroRateAmount: Number(txn.vatSummary?.zeroRateAmount ?? txn.totals?.vat0 ?? 0),
      totalVat: Number(
        txn.vatSummary?.totalVat ?? (Number(txn.totals?.vat5 || 0) + Number(txn.totals?.vat0 || 0))
      ),
    },
  };
}

/**
 * Adapts a real checkout/production invoice (the same shape buildSampleInvoice
 * mirrors — invoiceNumber, items[].{itemName,quantity,unitPrice,netAmount},
 * subTotal, taxTotal, invoiceTotal, customerName, paymentMode, …) plus the
 * escPosOpts-style option bag into the `txn` shape mapToTemplate2Data expects.
 * This is what lets Template 2's HTML preview (checkout iframe) and browser
 * print-fallback show the REAL sale, not just the designer's sample data.
 *
 * @param {object} invoice  production invoice (see buildSampleInvoice)
 * @param {object} opts     same opts bag passed to buildEscPosReceipt/buildTemplate2EscPosBase64
 * @returns {object} txn for mapToTemplate2Data(outlet, txn)
 */
export function mapInvoiceToTxn(invoice = {}, opts = {}) {
  const currency = opts.currency || "AED";
  const invoiceDate = invoice.invoiceDate || invoice.createdAt || null;
  const dt = invoiceDate ? new Date(invoiceDate) : new Date();
  const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const isWalkIn = !invoice.customerName || invoice.customerName === "Walk-in Customer";

  return {
    currency,
    invoiceNo: invoice.invoiceNumber || "",
    date,
    time,
    terminalId: opts.terminalId || "",
    cashierName: opts.cashierName || "",
    saleType: invoice.saleType || "",
    customer: isWalkIn
      ? null
      : {
          name: invoice.customerName || "",
          mobile: opts.customerPhone || invoice.customerPhone || "",
          code: invoice.customerCode || "",
          trn: invoice.customerTrn || "",
        },
    items: (invoice.items || [])
      .filter((it) => !it.voided && !it.isVoided)
      .map((it) => ({
        nameEn: it.itemName || it.nameEn || it.name || "",
        nameAr: it.nameAr || "",
        sku: it.sku || it.itemCode || it.code || "",
        vatLabel: it.taxPercent != null ? `VAT ${it.taxPercent}%` : "",
        qty: Number(it.quantity || 0),
        rate: Number(it.unitPrice || 0),
        amount: Number(it.netAmount ?? it.grossAmount ?? 0),
      })),
    totals: {
      subtotal: Number(invoice.subTotal || 0),
      discount: Number(invoice.discountTotal || 0),
      vat5: Number(invoice.taxTotal || 0),
      vat0: 0,
      deliveryCharge: Number(invoice.deliveryCharge || opts.shippingCharge || 0),
      roundOff: 0,
      totalToPay: Number(invoice.invoiceTotal || 0),
    },
    payment: {
      mode: invoice.paymentMode || "",
      paidAmount: Number(opts.cashGiven ?? invoice.invoiceTotal ?? 0),
      changeReturned: Number(opts.changeAmount || 0),
      cardRef: "",
    },
    vatSummary: {
      standardRateAmount: Number(invoice.taxTotal || 0),
      zeroRateAmount: 0,
      totalVat: Number(invoice.taxTotal || 0),
    },
  };
}

/**
 * Sample transaction used ONLY by the Print Templates designer (preview + test
 * print) when there is no live checkout. Mirrors the sample used by Template 1's
 * `buildThermalSampleHtml` so both templates preview the same numbers.
 */
export function buildSampleTxn() {
  return {
    currency: "AED",
    invoiceNo: "DI-28-042",
    date: "24-Jun-2026",
    time: "03:15 PM",
    terminalId: "POS-01",
    cashierName: "Hari K",
    saleType: "Retail",
    customer: {
      name: "Sarah Johnson",
      mobile: "+971 50 123 4567",
      code: "CUST-00847",
      trn: "",
    },
    items: [
      { nameEn: "Margherita Pizza", nameAr: "بيتزا مارغريتا", sku: "SKU 10023", vatLabel: "VAT 5%", qty: 1, rate: 45.0, amount: 45.0 },
      { nameEn: "Coke", nameAr: "كولا", sku: "SKU 10981", vatLabel: "VAT 5%", qty: 2, rate: 8.0, amount: 16.0 },
      { nameEn: "Caesar Salad", nameAr: "سلطة سيزر", sku: "SKU 11532", vatLabel: "VAT 5%", qty: 1, rate: 28.0, amount: 28.0 },
    ],
    totals: {
      subtotal: 89.0,
      discount: 0.0,
      vat5: 4.9,
      vat0: 0.0,
      deliveryCharge: 0.0,
      roundOff: 0.0,
      totalToPay: 102.8,
    },
    payment: {
      mode: "CASH",
      paidAmount: 150.0,
      changeReturned: 47.2,
      cardRef: "",
    },
    vatSummary: { standardRateAmount: 4.9, zeroRateAmount: 0.0, totalVat: 4.9 },
  };
}
