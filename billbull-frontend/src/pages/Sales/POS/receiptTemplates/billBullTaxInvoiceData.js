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
 * Template 2 Show/Hide toggle flags. Every flag defaults ON (undefined ⇒ shown)
 * so existing callers that don't pass toggles keep the full receipt. A section
 * whose flag is explicitly `false` is either dropped from the data model
 * (data-gated: customer/balance/delivery/loyalty ⇒ null) or flagged off on the
 * returned `flags` object (always-present: header parts, VAT, payment, footer
 * text, barcode, and the Arabic bilingual text).
 */
const on = (v) => v !== false;

/**
 * @param {object} outlet   { name, trn, address, phone, logoDataUrl, qrDataUrl, footerText, nameAr, addressAr }
 * @param {object} txn      normalized POS transaction (see buildSampleTxn for shape)
 * @param {object} toggles  Template 2 Show/Hide flags (see above); all default ON
 * @returns {object} ReceiptData for <BillBullTaxInvoiceReceipt data=... />
 */
export function mapToTemplate2Data(outlet = {}, txn = {}, toggles = {}) {
  const currency = txn.currency || "AED";
  const footerLines = splitLines(outlet.footerText);

  return {
    currency,
    // Show/Hide flags for always-present sections + bilingual Arabic text,
    // consumed by <TaxInvoiceReceiptBody>. Data-gated sections below are nulled.
    flags: {
      showLogo: on(toggles.showLogo),
      showCompanyDetails: on(toggles.showCompanyDetails),
      showTrn: on(toggles.showTrn),
      showArabic: on(toggles.showArabic),
      showVatSummary: on(toggles.showVatSummary),
      showPaymentDetails: on(toggles.showPaymentDetails),
      showFooterText: on(toggles.showFooterText),
      showBarcode: on(toggles.showBarcode),
    },
    business: {
      nameEn: outlet.name || "Branch Name",
      nameAr: outlet.nameAr || "",
      tagline: outlet.tagline || "",
      addressEnLines: splitLines(outlet.address),
      addressArLines: splitLines(outlet.addressAr),
      phone: outlet.phone || "",
      trn: outlet.trn || "",
      logoDataUrl: outlet.logoDataUrl || null,
      titleEn: outlet.titleEn || "Tax Invoice",
      titleAr: outlet.titleAr || "فاتورة ضريبية",
      // QR / stamp gated by the Show QR toggle so hiding it drops the whole
      // QR block (real ZATCA QR, uploaded stamp, and placeholder alike).
      qrDataUrl: on(toggles.showQRCode) ? outlet.qrDataUrl || null : null,
      stampDataUrl: on(toggles.showQRCode) ? outlet.stampDataUrl || null : null,
      // Designer-only hint: render the placeholder QR box when QR is enabled but
      // there's no live ZATCA QR/stamp image to show (no real invoice to encode).
      qrPlaceholder: on(toggles.showQRCode) && !!outlet.qrPlaceholder,
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
    customer: on(toggles.showCustomerDetails) && txn.customer
      ? {
          name: txn.customer.name || "",
          mobile: txn.customer.mobile || "",
          customerCode: txn.customer.code || "",
          customerTrn: txn.customer.trn || "",
        }
      : null,
    balance: on(toggles.showAccountBalance) ? txn.balance || null : null,
    delivery: on(toggles.showDelivery) && txn.delivery
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
      discountPercent: Number(it.discountPercent || 0),
      discountAmount: Number(it.discountAmount || 0),
      qty: Number(it.qty || 0),
      rate: Number(it.rate || 0),
      amount: Number(it.amount || 0),
      voided: Boolean(it.voided || it.isVoided),
    })),
    totals: {
      subtotal: Number(txn.totals?.subtotal || 0),
      discount: Number(txn.totals?.discount || 0),
      // Ex-VAT taxable base after discount. Falls back to subtotal - discount
      // when the caller (e.g. an older txn shape) doesn't supply it explicitly.
      taxableAmount: Number(
        txn.totals?.taxableAmount ?? (Number(txn.totals?.subtotal || 0) - Number(txn.totals?.discount || 0))
      ),
      vat5: Number(txn.totals?.vat5 || 0),
      vat0: Number(txn.totals?.vat0 || 0),
      deliveryCharge: Number(txn.totals?.deliveryCharge || 0),
      roundOff: Number(txn.totals?.roundOff || 0),
      totalToPay: Number(txn.totals?.totalToPay || 0),
      // Informational voided-lines disclosure (excluded from totalToPay).
      voidedCount: Number(txn.totals?.voidedCount || 0),
      voidedTotal: Number(txn.totals?.voidedTotal || 0),
    },
    payment: on(toggles.showPaymentDetails) && txn.payment
      ? {
          mode: txn.payment.mode || "",
          paidAmount: Number(txn.payment.paidAmount || 0),
          changeReturned: Number(txn.payment.changeReturned || 0),
          cardRef: txn.payment.cardRef || "",
          mixedCashGiven: txn.payment.mixedCashGiven != null ? Number(txn.payment.mixedCashGiven) : null,
          mixedCardGiven: txn.payment.mixedCardGiven != null ? Number(txn.payment.mixedCardGiven) : null,
          mixedCardType: txn.payment.mixedCardType || "",
        }
      : null,
    loyalty: on(toggles.showLoyalty) ? txn.loyalty || null : null,
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
  const createdAt = invoice.createdAt || null;
  const invoiceDate = invoice.invoiceDate || null;
  // createdAt carries the real sale timestamp; invoiceDate is often date-only
  // (no time component). Deriving "time" from a date-only value parses it as
  // UTC midnight, which then prints shifted by the viewer's UTC offset (e.g.
  // 00:00 UTC shows as 04:00 in Dubai) — so time must only ever come from a
  // real timestamp, never from invoiceDate.
  const dt = createdAt ? new Date(createdAt) : invoiceDate ? new Date(invoiceDate) : new Date();
  const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = createdAt
    ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "";

  const isWalkIn = !invoice.customerName || invoice.customerName === "Walk-in Customer";

  // Voided lines are kept on the receipt (audit trail) with a [VOID] tag +
  // negative amounts, but excluded from every financial reconstruction below.
  const allItems = invoice.items || [];
  const isVoid = (it) => Boolean(it.voided || it.isVoided);
  const items = allItems.filter((it) => !isVoid(it));

  // ── Subtotal / Discount / Taxable reconstruction ───────────────────────────
  // Mirror buildThermalReceiptHtml's two invoice shapes: the checkout mock (has
  // an explicit discountTotal, subTotal is gross pre-discount) vs a persisted
  // backend invoice (subTotal is already the taxable base; reconstruct discount
  // from each line's grossAmount). Without this the printed Subtotal was wrong
  // for real backend invoices.
  let subtotal, discount, taxable;
  if (invoice.discountTotal != null) {
    subtotal = Number(invoice.subTotal || 0);
    discount = Number(invoice.discountTotal) || 0;
    const netAfterDiscount = subtotal - discount;
    // Under INCLUSIVE VAT, netAfterDiscount is still tax-laden — extract VAT
    // via the already-computed taxTotal (exact, rate-agnostic) instead of
    // treating it directly as the ex-VAT taxable base. See posPrintUtils.js's
    // resolveInvoiceGrossTotals for the matching fix.
    const taxTotalForExtraction = Number(invoice.taxTotal || 0) || 0;
    taxable = invoice.taxInclusive
      ? Math.max(0, netAfterDiscount - taxTotalForExtraction)
      : netAfterDiscount;
  } else {
    taxable = Number(invoice.subTotal || 0);
    const grossSubtotal = items.reduce((sum, it) => {
      const q = Number(it.quantity || 0);
      const gross = Number(it.grossAmount ?? q * Number(it.unitPrice ?? it.price ?? 0));
      return sum + (Number.isFinite(gross) ? gross : 0);
    }, 0);
    const lineDiscount = Math.max(0, grossSubtotal - taxable);
    discount = lineDiscount + (Number(invoice.billDiscountAmount || 0) || 0);
    subtotal = grossSubtotal > 0 ? grossSubtotal : taxable;
  }

  // ── Per-rate VAT split (Standard 5% vs Zero-rated) from the line tax data ──
  // Posted backend invoice items carry the rate under `taxRate`; the checkout
  // mock uses `taxPercent`. Read all three so standard-rated lines aren't
  // misclassified as zero-rated (which left Standard=0 / Zero-rated=full VAT).
  let vatStandard = 0;
  let vatZero = 0;
  const hasLineRate = items.some((it) => it.taxRate != null || it.taxPercent != null || it.vatPercent != null);
  if (hasLineRate) {
    for (const it of items) {
      const rate = Number(it.taxRate ?? it.taxPercent ?? it.vatPercent ?? 0) || 0;
      // Prefer stored per-line VAT; derive from rate × net when absent so the
      // buckets reconcile with taxTotal.
      let amt = Number(it.taxAmount);
      if (!Number.isFinite(amt)) {
        const q = Number(it.quantity || 0);
        const gross = Number(it.grossAmount ?? q * Number(it.unitPrice ?? it.price ?? 0)) || 0;
        const discPct = Number(it.discountPercent ?? it.discount ?? 0) || 0;
        const disc = it.discountAmount != null ? Number(it.discountAmount) || 0 : gross * (discPct / 100);
        const net = Math.max(0, gross - disc);
        amt = invoice.taxInclusive ? net - net / (1 + rate / 100) : net * (rate / 100);
      }
      if (rate > 0) vatStandard += amt;
      else vatZero += amt;
    }
  } else {
    vatStandard = Number(invoice.taxTotal || 0);
  }
  const totalVat = Number(invoice.taxTotal ?? vatStandard + vatZero);

  const deliveryCharge = Number(invoice.deliveryCharge || opts.shippingCharge || 0);

  // ── Account balance (credit account) — same 4-field model the ESC/POS canvas
  // renderer uses (Previous / Invoice Credit / Amount Paid / New Balance). Only
  // emitted when the caller enabled the credit block AND a previous balance was
  // supplied, so cash/card walk-in sales don't sprout an empty section.
  let balance = null;
  if (opts.showCreditBalance && opts.creditPreviousBalance != null) {
    const prev = Number(opts.creditPreviousBalance) || 0;
    const invCredit = opts.creditInvoiceCredit != null ? Number(opts.creditInvoiceCredit) : Number(invoice.invoiceTotal || 0);
    const amtPaid = opts.creditAmountPaid != null ? Number(opts.creditAmountPaid) : 0;
    const updated = opts.creditUpdatedBalance != null ? Number(opts.creditUpdatedBalance) : prev + invCredit - amtPaid;
    balance = {
      previousBalance: prev,
      invoiceCredit: invCredit,
      amountPaid: amtPaid,
      newBalanceDue: updated,
    };
  }

  // ── Delivery address (EN only for now — Arabic address deferred) ───────────
  const deliveryAddrEn = opts.deliveryAddress || invoice.shippingAddress || "";
  const delivery = deliveryAddrEn
    ? { addressEn: deliveryAddrEn, addressAr: "", contactNote: opts.customerPhone ? `Contact on arrival: ${opts.customerPhone}` : "" }
    : null;

  return {
    currency,
    invoiceNo: invoice.invoiceNumber || "",
    date,
    time,
    branch: opts.branchName || invoice.branchName || "",
    terminalId: opts.terminalId || "",
    cashierName: opts.cashierName || "",
    saleType: invoice.salesType || invoice.saleType || opts.saleType || "",
    customer: isWalkIn
      ? null
      : {
          name: invoice.customerName || "",
          mobile: opts.customerPhone || invoice.customerPhone || "",
          code: invoice.customerCode || invoice.customerId || "",
          trn: invoice.customerTrn || "",
        },
    balance,
    delivery,
    items: allItems.map((it) => {
      // Checkout mock items carry the rate as `taxPercent` (see mockInvoice
      // mapping above); persisted/reloaded backend invoice items carry it as
      // `taxRate` instead — without this fallback, the reprint path silently
      // dropped the per-item "VAT X%" meta line (rate came back NaN -> "").
      const rate = Number(it.taxPercent ?? it.taxRate ?? it.vatPercent ?? null);
      // Per-line discount — mirror the ESC/POS canvas renderer so the checkout
      // preview shows the same "Disc X%" meta + "Discount: -amount" line the
      // printed receipt does. discountAmount preferred; else gross × discount%.
      const qty = Number(it.quantity || 0);
      const gross = Number(it.grossAmount ?? qty * Number(it.unitPrice ?? it.price ?? 0)) || 0;
      const discPct = Number(it.discountPercent ?? it.discount ?? 0) || 0;
      const lineTotal = Number(it.netAmount ?? it.grossAmount ?? 0) || 0;
      const discAmt = it.discountAmount != null
        ? Number(it.discountAmount) || 0
        : (discPct > 0 ? gross * (discPct / 100) : Math.max(0, gross - lineTotal));
      return {
        nameEn: it.itemName || it.nameEn || it.name || "",
        // Arabic name lives on the persisted invoice item as `localName`; the
        // checkout mock also carries it through. `nameAr` kept as a fallback.
        nameAr: it.localName || it.nameAr || it.arabicName || "",
        sku: it.sku || it.itemCode || it.code || "",
        vatLabel: Number.isFinite(rate) ? `VAT ${rate}%` : "",
        discountPercent: discPct,
        discountAmount: discAmt,
        qty,
        rate: Number(it.unitPrice || 0),
        amount: lineTotal,
        voided: isVoid(it),
      };
    }),
    totals: {
      subtotal,
      discount,
      taxableAmount: taxable,
      vat5: vatStandard,
      vat0: vatZero,
      deliveryCharge,
      roundOff: Number(invoice.roundOff || invoice.roundOffAmount || 0),
      totalToPay: Number(invoice.invoiceTotal || 0),
      // Informational voided-lines disclosure (excluded from totalToPay).
      voidedCount: allItems.filter(isVoid).length,
      voidedTotal: allItems.filter(isVoid).reduce(
        (s, it) => s + (Number(it.netAmount ?? it.lineTotal ?? (Number(it.quantity || 0) * Number(it.unitPrice ?? it.price ?? 0))) || 0),
        0,
      ),
    },
    payment: {
      mode: invoice.paymentMode || "",
      paidAmount: Number(opts.cashGiven ?? invoice.invoiceTotal ?? 0),
      changeReturned: Number(opts.changeAmount || 0),
      cardRef: opts.cardRef || invoice.cardRef || "",
      // Mixed (cash + card) split — how much was tendered on each tender. Null
      // unless a genuine mixed payment supplied both portions.
      mixedCashGiven: opts.mixedCashGiven != null ? Number(opts.mixedCashGiven) : null,
      mixedCardGiven: opts.mixedCardGiven != null ? Number(opts.mixedCardGiven) : null,
      mixedCardType: opts.mixedCardType || "",
    },
    vatSummary: {
      standardRateAmount: vatStandard,
      zeroRateAmount: vatZero,
      totalVat,
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
    branch: "Fujairah - Main",
    terminalId: "POS-01",
    cashierName: "Hari K",
    saleType: "Retail / Delivery",
    customer: {
      name: "Sarah Johnson",
      mobile: "+971 50 123 4567",
      code: "CUST-00847",
      trn: "",
    },
    // Account balance + delivery blocks so the designer Live Preview exercises
    // EVERY section the live checkout receipt can render (kept in lock-step with
    // the enriched mapInvoiceToTxn output — see the checkout preview).
    balance: {
      previousBalance: 340.0,
      invoiceCredit: 102.8,
      amountPaid: 0.0,
      newBalanceDue: 442.8,
    },
    delivery: {
      addressEn: "Villa 22, Street 7, Al Faseel, Fujairah, UAE",
      addressAr: "",
      contactNote: "Contact on arrival: +971 50 123 4567",
    },
    items: [
      { nameEn: "Margherita Pizza", nameAr: "بيتزا مارغريتا", sku: "10023", vatLabel: "VAT 5%", qty: 1, rate: 45.0, amount: 45.0 },
      { nameEn: "Coke", nameAr: "كولا", sku: "10981", vatLabel: "VAT 5%", qty: 2, rate: 8.0, amount: 16.0 },
      { nameEn: "Caesar Salad", nameAr: "سلطة سيزر", sku: "11532", vatLabel: "VAT 5%", qty: 1, rate: 28.0, amount: 28.0 },
    ],
    totals: {
      subtotal: 89.0,
      discount: 0.0,
      taxableAmount: 89.0,
      vat5: 4.9,
      vat0: 0.0,
      deliveryCharge: 8.9,
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
