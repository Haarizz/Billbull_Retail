/**
 * Template 3 — "BillBull Retail OS" 80mm receipt (design: New folder/Design
 * BillBull Invoice Template, Figma Make).
 *
 * ONE layout, TWO renderers. `buildTemplate3Blocks(data)` turns the receipt data
 * into an ordered list of display blocks (rows, rules, section titles, the VAT
 * grid…). The HTML twin (Template3Receipt.jsx — Live Preview, checkout preview,
 * browser-print fallback, PDF/email) and the thermal canvas
 * (buildTemplate3EscPos.js — silent ESC/POS print) both just draw this list, so
 * what the cashier previews and what the printer prints cannot drift apart the
 * way two hand-synced renderers do.
 *
 * Data model: Template 3 reuses Template 2's ReceiptData shape
 * (mapToTemplate2Data) and therefore Template 2's Show/Hide toggles, plus a few
 * extras only this design prints (VAT-by-rate grid, "Tax inclusive" line, raw
 * footer lines, reprint flag, raw QR content for the canvas).
 */
import { mapInvoiceToTxn, mapToTemplate2Data } from "./billBullTaxInvoiceData";

const on = (v) => v !== false;
const num = (v) => Number(v) || 0;

export const fmt2 = (n) =>
  num(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Quantities print without trailing zeros: 2, 1.5, 0.375. */
export const fmtQty = (n) => {
  const v = num(n);
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

const pad2 = (n) => String(n).padStart(2, "0");

// ── Data mapping ─────────────────────────────────────────────────────────────

/**
 * Per-rate VAT rows (Tax# / VAT% / BeforeVAT / Incl.VAT / VAT) from the
 * invoice lines. With a single rate the invoice-level figures are used, so the
 * row reconciles exactly with Subtotal/VAT/Total even when a bill-level
 * discount is spread across the lines; only a mixed-rate sale needs the
 * per-line split.
 */
function vatRowsFromInvoice(invoice, txn) {
  const isVoid = (it) => Boolean(it.voided || it.isVoided);
  const items = (invoice.items || []).filter((it) => !isVoid(it));
  const hasLineRate = items.some((it) => it.taxRate != null || it.taxPercent != null || it.vatPercent != null);
  if (!hasLineRate) return null;
  const buckets = new Map();
  for (const it of items) {
    const rate = num(it.taxRate ?? it.taxPercent ?? it.vatPercent);
    const q = num(it.quantity);
    const gross = num(it.grossAmount ?? q * num(it.unitPrice ?? it.price));
    const discPct = num(it.discountPercent ?? it.discount);
    const disc = it.discountAmount != null ? num(it.discountAmount) : gross * (discPct / 100);
    const net = Math.max(0, gross - disc);
    let vat = Number(it.taxAmount);
    if (!Number.isFinite(vat)) {
      vat = invoice.taxInclusive ? net - net / (1 + rate / 100) : net * (rate / 100);
    }
    const before = invoice.taxInclusive ? net - vat : net;
    const b = buckets.get(rate) || { rate, before: 0, vat: 0 };
    b.before += before;
    b.vat += vat;
    buckets.set(rate, b);
  }
  const rows = [...buckets.values()].sort((a, b) => b.rate - a.rate);
  if (rows.length === 1) {
    rows[0].before = num(txn.totals?.taxableAmount);
    rows[0].vat = num(invoice.taxTotal);
  }
  return rows.map((r) => ({ rate: r.rate, before: r.before, vat: r.vat, incl: r.before + r.vat }));
}

/**
 * Production invoice + the shared print opts bag → Template 3 txn. Extends
 * Template 2's mapInvoiceToTxn (so totals/discount/VAT reconstruction stays a
 * single implementation) with the fields only this design prints.
 */
export function mapInvoiceToTemplate3Txn(invoice = {}, opts = {}) {
  const txn = mapInvoiceToTxn(invoice, opts);

  // Design prints "Date: 01-11-2026  Time: 22:09:21". Time only ever comes from
  // the real sale timestamp — invoiceDate is date-only (see mapInvoiceToTxn).
  const stamp = invoice.createdAt || invoice.invoiceDate || null;
  if (stamp) {
    const d = new Date(stamp);
    if (!Number.isNaN(d.getTime())) {
      txn.date = `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
      txn.time = invoice.createdAt ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : "";
    }
  }

  txn.taxInclusive = Boolean(invoice.taxInclusive);
  txn.vatRows = vatRowsFromInvoice(invoice, txn);
  txn.isReprint = Boolean(opts.isReprint);
  txn.qrContent = opts.qrContent || null;

  if (invoice.loyaltyPointsEarned != null || invoice.loyaltyBalance != null) {
    txn.loyalty = {
      pointsEarned: num(invoice.loyaltyPointsEarned),
      pointsRedeemed: num(invoice.loyaltyPointsUsed),
      pointsBalance: invoice.loyaltyBalance != null ? num(invoice.loyaltyBalance) : null,
    };
  }

  if (txn.balance && opts.creditLimit != null && opts.creditLimit !== "") {
    txn.balance = { ...txn.balance, creditLimit: num(opts.creditLimit) };
  }
  return txn;
}

/** Same signature as mapToTemplate2Data (registry `mapData`). */
export function mapToTemplate3Data(outlet = {}, txn = {}, toggles = {}) {
  const base = mapToTemplate2Data(outlet, txn, toggles);
  return {
    ...base,
    taxInclusive: Boolean(txn.taxInclusive),
    vatRows: Array.isArray(txn.vatRows) ? txn.vatRows : null,
    isReprint: Boolean(txn.isReprint),
    // Footer prints line-for-line as typed in Print Templates (Template 2's
    // mapper also splits on commas, which would break sentences apart).
    footerLines: String(outlet.footerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    // Raw QR payload for the thermal canvas (HTML uses business.qrDataUrl).
    qrContent: on(toggles.showQRCode) ? outlet.qrContent || txn.qrContent || null : null,
  };
}

/**
 * The opts bag every ESC/POS builder receives → Template 3 data. Used by the
 * silent print path, so the checkout print, reprints and the designer's Test
 * Print all map the same way.
 */
export function mapEscPosOptsToTemplate3Data(invoice = {}, opts = {}) {
  const txn = mapInvoiceToTemplate3Txn(invoice, opts);
  const showQr = opts.showQRCode !== false;
  const outlet = {
    name: opts.companyName,
    trn: opts.trn,
    address: opts.outletAddress,
    phone: opts.outletPhone,
    logoDataUrl: opts.logoDataUrl,
    stampDataUrl: showQr ? opts.stampDataUrl || null : null,
    qrContent: showQr ? opts.qrContent || null : null,
    footerText: opts.footer,
    titleEn: opts.documentTitle || (opts.isReturn ? "Credit Note" : "Tax Invoice"),
    titleAr: opts.documentTitleAr || undefined,
  };
  const toggles = {
    hasTax: opts.hasTax,
    showLogo: opts.showLogo,
    showCompanyDetails: opts.showCompanyDetails,
    showTrn: opts.showTrn,
    showArabic: opts.showArabic,
    showCustomerDetails: opts.showCustomerDetails,
    showAccountBalance: opts.showCreditBalance,
    showDelivery: opts.showDelivery,
    showVatSummary: opts.showVatSummary,
    showPaymentDetails: opts.showPaymentDetails,
    showLoyalty: opts.showLoyaltyPoints,
    showQRCode: opts.showQRCode,
    showFooterText: opts.showFooterText,
    showBarcode: opts.showBarcode,
  };
  return mapToTemplate3Data(outlet, txn, toggles);
}

// ── Layout ───────────────────────────────────────────────────────────────────
//
// Block types (both renderers implement every one):
//   logo    { src }                     centred image
//   brand   { text }                    large bold centred business name
//   center  { text, ar?, bold?, sm? }   centred, wrapping
//   text    { text, sm? }               left, wrapping
//   ar      { text }                    right-aligned Arabic line
//   row     { l, r, bold?, sm?, rAr? }  label left (wraps), value right
//   wrow    { l, r }                    label left, long value right-aligned & wrapping
//   title   { text }                    centred bold section heading
//   rule    {}                          dashed separator
//   gap     {}                          small vertical space
//   taxGrid { head: [5], rows: [[5]] }  VAT breakdown
//   qr      { dataUrl, content, stampDataUrl, placeholder }
//   barcode { value }                   Code 128 + human-readable text

export function buildTemplate3Blocks(data = {}) {
  const {
    business: b = {}, meta = {}, customer, balance, delivery, items = [],
    totals = {}, payment, loyalty, flags = {}, currency = "AED",
  } = data;
  const showAr = on(flags.showArabic);
  const hasTax = on(flags.hasTax);
  const cur = currency || "AED";
  const out = [];
  const push = (blk) => out.push(blk);
  const rule = () => push({ t: "rule" });
  const money = (n) => `${cur} ${fmt2(n)}`;

  // ── Header ────────────────────────────────────────────────────────────────
  if (on(flags.showLogo) && b.logoDataUrl) push({ t: "logo", src: b.logoDataUrl });
  if (b.nameEn) push({ t: "brand", text: b.nameEn });
  if (showAr && b.nameAr) push({ t: "center", text: b.nameAr, ar: true });
  if (on(flags.showCompanyDetails)) {
    if (meta.branch && meta.branch !== b.nameEn) push({ t: "center", text: meta.branch });
    const addr = (b.addressEnLines || []).join(", ");
    if (addr) push({ t: "center", text: addr });
    if (b.phone) push({ t: "center", text: `TEL: ${b.phone}` });
  }
  if (hasTax && on(flags.showTrn) && b.trn) push({ t: "center", text: `TRN: ${b.trn}` });

  rule();
  push({ t: "row", l: String(b.titleEn || "Tax Invoice").toUpperCase(), r: showAr ? b.titleAr || "" : "", rAr: true });
  if (data.isReprint) push({ t: "center", text: "** REPRINT **", bold: true });
  rule();

  // ── Items ─────────────────────────────────────────────────────────────────
  // code  qty x          unit
  //                 arabic name
  // English name         line amount (qty × unit; discount on its own line)
  items.forEach((it, i) => {
    const sgn = (s) => (it.voided ? `-${s}` : s);
    const gross = num(it.qty) * num(it.rate);
    if (i > 0) push({ t: "gap" });
    push({ t: "row", l: [it.sku, `${fmtQty(it.qty)} x`].filter(Boolean).join("  "), r: sgn(fmt2(it.rate)) });
    if (showAr && it.nameAr) push({ t: "ar", text: it.nameAr });
    push({ t: "row", l: `${it.nameEn || "Item"}${it.voided ? " [VOID]" : ""}`, r: sgn(fmt2(gross)) });
    if (!it.voided && num(it.discountAmount) > 0.004) {
      const pct = num(it.discountPercent);
      push({
        t: "row", sm: true,
        l: pct > 0 ? `  Discount ${fmtQty(pct)}%` : "  Discount",
        r: `-${fmt2(it.discountAmount)}`,
      });
    }
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  rule();
  const qty = items.filter((it) => !it.voided).reduce((s, it) => s + num(it.qty), 0);
  push({ t: "text", text: `  Items : ${fmtQty(qty)}` });
  push({ t: "row", l: "Subtotal", r: fmt2(totals.subtotal) });
  if (num(totals.discount) > 0.004) push({ t: "row", l: "Discount", r: `-${fmt2(totals.discount)}` });
  const vatTotal = num(totals.vat5) + num(totals.vat0);
  // Exclusive VAT is added on top, so it must show for Subtotal → Total to add
  // up. Inclusive VAT is already inside the prices: the "Tax inclusive" line
  // and the VAT grid carry it instead (as in the design).
  if (hasTax && !data.taxInclusive && vatTotal > 0.004) push({ t: "row", l: "VAT", r: fmt2(vatTotal) });
  if (num(totals.deliveryCharge) > 0.004) push({ t: "row", l: "Delivery charge", r: fmt2(totals.deliveryCharge) });
  if (Math.abs(num(totals.roundOff)) >= 0.005) push({ t: "row", l: "Round off", r: fmt2(totals.roundOff) });
  if (num(totals.voidedCount) > 0) {
    push({ t: "row", l: `Voided items (${totals.voidedCount})`, r: `-${fmt2(totals.voidedTotal)}` });
  }
  push({ t: "row", l: "Total", r: fmt2(totals.totalToPay), bold: true });

  if (payment) {
    const pb = payment.paymentBlock;
    if (pb && pb.details?.length) {
      for (const d of pb.details) {
        push({ t: "row", l: d.received === false ? "CREDIT ACCOUNT" : String(d.label || "").toUpperCase(), r: money(d.amount) });
      }
      if (num(pb.changeAmount) > 0) push({ t: "row", l: "Change", r: fmt2(pb.changeAmount), bold: true });
      if (pb.hasReceivable) {
        push({ t: "row", l: "Amount Paid", r: fmt2(pb.totalReceived) });
        push({ t: "row", l: "Amount Due", r: fmt2(pb.transferredToAr) });
      } else if (pb.details.length > 1) {
        push({ t: "row", l: "Total Received", r: fmt2(pb.totalReceived) });
      }
    } else if (payment.mode) {
      push({ t: "row", l: String(payment.mode).toUpperCase(), r: money(payment.paidAmount) });
      if (num(payment.changeReturned) > 0) push({ t: "row", l: "Change", r: fmt2(payment.changeReturned), bold: true });
    }
  }
  if (hasTax && data.taxInclusive) push({ t: "row", l: "Tax inclusive:", r: showAr ? "شامل الضريبة" : "", rAr: true });

  // ── Customer ──────────────────────────────────────────────────────────────
  if (customer) {
    rule();
    push({ t: "title", text: balance ? "CREDIT CUSTOMER" : "CUSTOMER" });
    // Free-text values use `wrow` (value wraps under itself) so a long trade
    // name never runs off the paper.
    if (customer.name) push({ t: "wrow", l: "Customer", r: customer.name });
    // Some tenants store the customer name as its code — printing it twice
    // under "Account No." tells the customer nothing, so skip it then.
    const code = String(customer.customerCode || "");
    if (code && code !== "WALK-IN" && code.trim().toLowerCase() !== String(customer.name || "").trim().toLowerCase()) {
      push({ t: "wrow", l: "Account No.", r: code });
    }
    if (customer.mobile) push({ t: "wrow", l: "Mobile", r: customer.mobile });
    if (customer.email) push({ t: "wrow", l: "Email", r: customer.email });
    if (customer.customerTrn) push({ t: "wrow", l: "TRN", r: customer.customerTrn });
    if (customer.address) push({ t: "wrow", l: "Address", r: customer.address });
  }

  // ── Delivery ──────────────────────────────────────────────────────────────
  if (delivery && (delivery.lineEn?.length || delivery.contactNote)) {
    rule();
    push({ t: "title", text: "DELIVERY DETAILS" });
    if (meta.invoiceNo) push({ t: "row", l: "Order", r: meta.invoiceNo });
    if (delivery.lineEn?.length) push({ t: "wrow", l: "Address", r: delivery.lineEn.join(", ") });
    if (showAr && delivery.lineAr?.length) push({ t: "ar", text: delivery.lineAr.join("، ") });
    if (delivery.contactNote) push({ t: "text", text: delivery.contactNote, sm: true });
  }

  // ── Credit balance ────────────────────────────────────────────────────────
  if (balance) {
    rule();
    push({ t: "title", text: "CREDIT BALANCE DETAILS" });
    push({ t: "row", l: "Previous Balance", r: fmt2(balance.previousBalance) });
    push({ t: "row", l: "This Invoice", r: fmt2(balance.invoiceCredit) });
    if (num(balance.amountPaid) > 0.004) push({ t: "row", l: "Amount Paid", r: fmt2(balance.amountPaid) });
    push({ t: "row", l: "New Balance Due", r: money(balance.newBalanceDue), bold: true });
    if (balance.creditLimit != null) {
      push({ t: "row", l: "Credit Limit", r: fmt2(balance.creditLimit) });
      push({ t: "row", l: "Available Credit", r: fmt2(num(balance.creditLimit) - num(balance.newBalanceDue)) });
    }
  }

  // ── Loyalty ───────────────────────────────────────────────────────────────
  if (loyalty && (loyalty.pointsEarned || loyalty.pointsRedeemed || loyalty.pointsBalance != null)) {
    const pts = (n) => Math.round(num(n)).toLocaleString("en-AE");
    rule();
    push({ t: "title", text: "LOYALTY POINTS" });
    push({ t: "row", l: "Points Earned", r: pts(loyalty.pointsEarned) });
    push({ t: "row", l: "Points Redeemed", r: pts(loyalty.pointsRedeemed) });
    if (loyalty.pointsBalance != null) push({ t: "row", l: "Available Points", r: pts(loyalty.pointsBalance), bold: true });
  }

  // ── VAT breakdown ─────────────────────────────────────────────────────────
  if (hasTax && on(flags.showVatSummary)) {
    let rows = data.vatRows;
    if (!rows || !rows.length) {
      // Designer sample / older txn shape: one row from the invoice totals.
      // The rate comes from the lines' "VAT 5%" labels — dividing VAT by the
      // taxable base gives 5.51 when a charge (delivery/service) carries VAT too.
      const before = num(totals.taxableAmount);
      const vat = vatTotal;
      const labelRates = [...new Set(items
        .map((it) => /([\d.]+)\s*%/.exec(it.vatLabel || "")?.[1])
        .filter(Boolean)
        .map(Number))];
      const rate = labelRates.length === 1
        ? labelRates[0]
        : before > 0 ? Math.round((vat / before) * 100) : 5;
      rows = before > 0 || vat > 0 ? [{ rate, before, vat, incl: before + vat }] : [];
    }
    if (rows.length) {
      rule();
      push({
        t: "taxGrid",
        head: ["Tax#", "VAT%", "BeforeVAT", "Incl.VAT", "VAT"],
        rows: rows.map((r) => ["VAT", fmtQty(r.rate), fmt2(r.before), fmt2(r.incl), fmt2(r.vat)]),
      });
    }
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  const staff = [];
  if (meta.cashierName) staff.push(` Served by: ${meta.cashierName}`);
  if (meta.salespersonName && meta.salespersonName !== meta.cashierName) staff.push(` Salesperson: ${meta.salespersonName}`);
  if (staff.length) {
    rule();
    staff.forEach((s) => push({ t: "text", text: s }));
  }

  // ── Receipt data ──────────────────────────────────────────────────────────
  rule();
  push({ t: "row", l: meta.date ? `Date: ${meta.date}` : "", r: meta.time ? `Time: ${meta.time}` : "" });
  push({ t: "row", l: meta.terminalId ? `POS: ${meta.terminalId}` : "", r: meta.invoiceNo ? `Receipt: ${meta.invoiceNo}` : "" });

  // ── Footer ────────────────────────────────────────────────────────────────
  if (on(flags.showFooterText)) {
    rule();
    const lines = data.footerLines || [];
    if (lines.length) lines.forEach((ln) => push({ t: "center", text: ln }));
    else {
      push({ t: "center", text: "Thank you for shopping" });
      if (showAr) push({ t: "center", text: "شكراً لتسوقكم", ar: true });
    }
    push({ t: "center", text: "Powered by BillBull Retail OS" });
    push({ t: "center", text: "www.billbull.app" });
  }

  // ── QR / stamp ────────────────────────────────────────────────────────────
  if (b.stampDataUrl || b.qrDataUrl || data.qrContent || b.qrPlaceholder) {
    rule();
    push({
      t: "qr",
      stampDataUrl: b.stampDataUrl || null,
      dataUrl: b.qrDataUrl || null,
      content: data.qrContent || null,
      placeholder: Boolean(b.qrPlaceholder),
    });
  }

  // ── Barcode ───────────────────────────────────────────────────────────────
  if (on(flags.showBarcode) && meta.invoiceNo) {
    rule();
    push({ t: "barcode", value: String(meta.invoiceNo) });
  }

  return out;
}
