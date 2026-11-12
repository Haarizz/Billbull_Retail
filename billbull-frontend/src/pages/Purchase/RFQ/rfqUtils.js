import { exportToExcel } from "@billbull/shared/utils/exportUtils";

// Shared helpers for the Vendor Price Shares (RFQ) screens.

export const RFQ_MODULE = "purchases.rfq";

export const RFQ_STATUS_META = {
  DRAFT:            { label: "Draft",               color: "#64748b", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.35)" },
  SENT:             { label: "Sent",                color: "#a16207", bg: "rgba(245,199,66,0.14)",  border: "rgba(245,199,66,0.45)" },
  AWAITING:         { label: "Awaiting Responses",  color: "#b45309", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)" },
  PARTIAL:          { label: "Partially Responded", color: "#b45309", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)" },
  RECEIVED:         { label: "Responses Received",  color: "#2563eb", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)" },
  EVALUATION:       { label: "Under Evaluation",    color: "#7c3aed", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.35)" },
  NEGOTIATION:      { label: "Negotiation",         color: "#db2777", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.35)" },
  PARTIAL_ORDERED:  { label: "Partially Ordered",   color: "#059669", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.35)" },
  COMPLETED_LPO:    { label: "Completed w/ LPO",    color: "#327F74", bg: "rgba(50,127,116,0.14)",  border: "rgba(50,127,116,0.4)" },
  COMPLETED_NO_LPO: { label: "Completed (No LPO)",  color: "#475569", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.35)" },
  CANCELLED:        { label: "Cancelled",           color: "#dc2626", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)" },
  REJECTED:         { label: "Rejected",            color: "#dc2626", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)" },
  EXPIRED:          { label: "Expired",             color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.35)" },
};

export const CLOSED_STATUSES = ["COMPLETED_LPO", "COMPLETED_NO_LPO", "CANCELLED", "REJECTED", "EXPIRED"];
export const isClosed = (status) => CLOSED_STATUSES.includes(status);

/** Statuses a user may set by hand (COMPLETED_LPO is reached by creating LPOs). */
export const MANUAL_STATUSES = [
  "DRAFT", "SENT", "AWAITING", "PARTIAL", "RECEIVED", "EVALUATION", "NEGOTIATION",
  "COMPLETED_NO_LPO", "CANCELLED", "REJECTED", "EXPIRED",
];
export const STATUSES_NEEDING_REASON = ["CANCELLED", "REJECTED", "EXPIRED"];

export const WORKFLOW_STEPS = [
  { keys: ["DRAFT"], label: "Draft" },
  { keys: ["SENT", "AWAITING"], label: "Sent" },
  { keys: ["PARTIAL", "RECEIVED"], label: "Responses" },
  { keys: ["EVALUATION", "NEGOTIATION"], label: "Comparison" },
  { keys: ["PARTIAL_ORDERED", "COMPLETED_LPO", "COMPLETED_NO_LPO"], label: "LPO / Done" },
];

export const RESPONSE_STATUS_META = {
  PENDING:            { label: "Pending",            cls: "text-slate-500" },
  IN_PROGRESS:        { label: "In Progress",        cls: "text-amber-600" },
  SUBMITTED:          { label: "Submitted",          cls: "text-emerald-600" },
  REVISION_REQUESTED: { label: "Revision Requested", cls: "text-pink-600" },
  REVISED:            { label: "Revised",            cls: "text-blue-600" },
  DECLINED:           { label: "Declined",           cls: "text-red-600" },
};

export const hasResponded = (status) =>
  ["SUBMITTED", "REVISION_REQUESTED", "REVISED", "DECLINED"].includes(status);
export const hasPricedResponse = (status) =>
  ["SUBMITTED", "REVISION_REQUESTED", "REVISED"].includes(status);

export const NEGOTIATION_STATUS_META = {
  REQUESTED: { label: "Awaiting Reply",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ACCEPTED:  { label: "Accepted",        cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  DECLINED:  { label: "Declined",        cls: "bg-red-50 text-red-700 border-red-200" },
  REVISED:   { label: "Counter Offered", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  EXPIRED:   { label: "Expired",         cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

export const AVAILABILITY_META = {
  "in-stock":     { label: "In Stock",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-600" },
  partial:        { label: "Partial",      cls: "bg-amber-50 text-amber-700 border-amber-200",       text: "text-amber-600" },
  "on-order":     { label: "On Order",     cls: "bg-blue-50 text-blue-700 border-blue-200",          text: "text-blue-600" },
  "out-of-stock": { label: "Out of Stock", cls: "bg-red-50 text-red-700 border-red-200",             text: "text-red-600" },
};

const AVATAR_COLORS = ["#327F74", "#C99A12", "#F59E0B", "#8B5CF6", "#2563EB", "#DB2777", "#0891B2", "#65A30D"];

export const vendorColor = (vendorId) => AVATAR_COLORS[Math.abs(Number(vendorId) || 0) % AVATAR_COLORS.length];

export const vendorInitials = (name = "") => {
  const words = String(name).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtMoney = (value, currency = "AED") => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency || "AED"} ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtDate = (value) => {
  if (!value) return "—";
  const s = String(value);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const addDaysIso = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const isPastDate = (iso) => !!iso && iso < todayIso();

/* ── RFQ wizard pick-lists ─────────────────────────────────────────────────── */

/** Used when the tenant has no payment terms set up in Finance. */
export const DEFAULT_PAYMENT_TERMS = [
  "Cash on Delivery", "Advance Payment", "Net 7 Days", "Net 15 Days", "Net 30 Days", "Net 45 Days", "Net 60 Days", "Net 90 Days",
];

/** Incoterms 2020 — who pays for and carries the risk of transport. */
export const DELIVERY_TERMS = [
  { code: "DDP", label: "DDP — Delivered Duty Paid", hint: "Vendor delivers to your door, duties and taxes paid" },
  { code: "DAP", label: "DAP — Delivered at Place", hint: "Vendor delivers to your door; you clear import duties" },
  { code: "DPU", label: "DPU — Delivered at Place Unloaded", hint: "Vendor delivers and unloads at your site" },
  { code: "CIP", label: "CIP — Carriage & Insurance Paid To", hint: "Vendor pays carriage and insurance to the named place" },
  { code: "CPT", label: "CPT — Carriage Paid To", hint: "Vendor pays carriage to the named place" },
  { code: "CIF", label: "CIF — Cost, Insurance & Freight", hint: "Sea freight: vendor pays freight and insurance to your port" },
  { code: "CFR", label: "CFR — Cost & Freight", hint: "Sea freight: vendor pays freight to your port" },
  { code: "FOB", label: "FOB — Free on Board", hint: "Sea freight: you take over once loaded at the vendor's port" },
  { code: "FCA", label: "FCA — Free Carrier", hint: "Vendor hands over to your carrier" },
  { code: "EXW", label: "EXW — Ex Works", hint: "You collect from the vendor's premises" },
];

export const QUOTATION_VALIDITY_OPTIONS = ["7 days", "15 days", "30 days", "45 days", "60 days", "90 days"];

export const WARRANTY_OPTIONS = ["No warranty", "3 Months", "6 Months", "1 Year", "2 Years", "3 Years", "5 Years"];

export const TAX_PREFERENCES = [
  { value: "Tax Inclusive", hint: "Vendors quote prices that already include VAT" },
  { value: "Tax Exclusive", hint: "Vendors quote prices before VAT; VAT is added on top" },
  { value: "Tax Exempt", hint: "No VAT applies to this purchase" },
];

/** Adds the current value to a list of options when it is not in it (legacy / edited RFQs). */
export const withCurrent = (options, current) =>
  current && !options.includes(current) ? [current, ...options] : options;

/** Days in a "15 days" style validity string (null when it has no number). */
export const validityDays = (validity) => {
  const m = String(validity || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * Auto-Allocate: picks the strongest vendors for every item from the ranked suggestions.
 * Round-robin over items — first each item's best vendor, then each item's second best, and so
 * on — so every item is covered before any item gets a third quote. Only vendors in `usableIds`
 * are picked. Returns { picks: vendorId[], uncovered: item[] }.
 */
export const pickAutoAllocation = (items, suggestions, usableIds, { perItem = 3, max = 10 } = {}) => {
  const usable = (suggestions || []).filter((s) => usableIds.has(s.vendorId));
  const ranked = (items || []).filter((it) => it.productId).map((it) => ({
    item: it,
    vendors: usable
      .map((s) => ({ s, p: (s.products || []).find((p) => p.productId === it.productId) }))
      .filter((x) => x.p || (suggestionHasProduct(x.s, it.productId)))
      .sort((a, b) => num(b.p?.score) - num(a.p?.score) || num(b.s.score) - num(a.s.score))
      .map((x) => x.s.vendorId),
  }));
  const picks = [];
  for (let round = 0; round < perItem && picks.length < max; round += 1) {
    for (const r of ranked) {
      const id = r.vendors[round];
      if (id != null && !picks.includes(id)) picks.push(id);
      if (picks.length >= max) break;
    }
  }
  const uncovered = ranked.filter((r) => r.vendors.length === 0).map((r) => r.item);
  return { picks, uncovered };
};

const suggestionHasProduct = (s, productId) => (s.productIds || []).includes(productId);

export const errorMessage = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;

/** Per-unit landed cost: price after discount, plus tax, plus shipping spread over the quoted quantity. */
export const landedUnitCost = (offer) => {
  if (!offer) return 0;
  const price = num(offer.unitPrice);
  const qty = Math.max(1, num(offer.quotedQty));
  const afterDiscount = price * (1 - num(offer.discountPercent) / 100);
  const withTax = afterDiscount * (1 + num(offer.taxPercent) / 100);
  return withTax + (num(offer.shippingCost) + num(offer.additionalCost)) / qty;
};

/** Total landed cost for a quantity (defaults to the quoted quantity). */
export const landedTotal = (offer, qty) => {
  if (!offer) return 0;
  const q = qty ?? num(offer.quotedQty);
  const afterDiscount = num(offer.unitPrice) * q * (1 - num(offer.discountPercent) / 100);
  const tax = afterDiscount * (num(offer.taxPercent) / 100);
  return afterDiscount + tax + num(offer.shippingCost) + num(offer.additionalCost);
};

/** Offers worth comparing: priced and not out of stock. */
export const isComparable = (offer) => num(offer?.unitPrice) > 0 && offer?.availability !== "out-of-stock";

/**
 * Whether an offer respects the item's RFQ rules: no alternative when "Alternative brands OK" is
 * off, and the full quantity when "Partial quantity OK" is off.
 */
export const offerMeetsItemRules = (item, offer) => {
  if (!item || !offer) return true;
  if (offer.alternative && item.altBrandAllowed === false) return false;
  if (item.partialAllowed === false && num(offer.quotedQty) < num(item.qtyNeeded)) return false;
  return true;
};

/** Why an offer breaks the item's rules (null when it is fine). */
export const offerRuleIssue = (item, offer) => {
  if (!item || !offer) return null;
  if (offer.alternative && item.altBrandAllowed === false) return "Alternative not accepted";
  if (item.partialAllowed === false && isComparable(offer) && num(offer.quotedQty) < num(item.qtyNeeded)) return "Short quantity — full qty required";
  return null;
};

/**
 * Picks the recommended offer for one item from candidates [{ offer, vendor }]:
 * lowest landed unit cost among offers that cover the full quantity; falls back to the
 * cheapest partial offer. Offers that break the item's alternative / partial-quantity rules are
 * never recommended. Returns { pick, reason } (pick null when nothing is usable).
 */
export const recommendOffer = (item, candidates) => {
  const usable = (candidates || []).filter((c) => isComparable(c.offer) && offerMeetsItemRules(item, c.offer));
  if (usable.length === 0) return { pick: null, reason: "No usable offer received" };
  const needed = num(item?.qtyNeeded);
  const full = usable.filter((c) => num(c.offer.quotedQty) >= needed);
  const pool = full.length ? full : usable;
  const pick = [...pool].sort((a, b) => landedUnitCost(a.offer) - landedUnitCost(b.offer))[0];
  const reasons = ["Lowest landed cost"];
  if (full.length) reasons.push("Full quantity"); else reasons.push("Partial quantity only");
  if (!pick.offer.alternative) reasons.push("Matches requested spec");
  if (pick.offer.deliveryDate) reasons.push(`Delivery ${fmtDate(pick.offer.deliveryDate)}`);
  return { pick, reason: reasons.join(" · ") };
};

/** The price the vendor most recently gave for this vendor+product before this RFQ (quotes or LPOs). */
export const previousPriceFor = (history = [], vendorId) => {
  const rows = history.filter((h) => h.vendorId === vendorId && num(h.price) > 0);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
};

/** Plain-text RFQ invitation for one vendor (used for email / WhatsApp / copy). */
export const buildVendorMessage = (rfq, vendor, companyName = "BillBull Procurement Team", portalLink = null) => {
  const lines = [
    `Dear ${vendor?.vendorName || "Supplier"},`,
    "",
    "We invite you to submit your best quotation for the following request.",
    "",
    `RFQ Number: ${rfq.rfqNumber}`,
    `Title: ${rfq.title}`,
    `Submission Deadline: ${fmtDate(rfq.deadline)}`,
    rfq.expectedDelivery ? `Expected Delivery: ${fmtDate(rfq.expectedDelivery)}` : null,
    rfq.deliveryLocation ? `Delivery Location: ${rfq.deliveryLocation}` : null,
    rfq.paymentTerms ? `Payment Terms: ${rfq.paymentTerms}` : null,
    rfq.deliveryTerms ? `Delivery Terms: ${rfq.deliveryTerms}` : null,
    "",
    "Items:",
    ...(rfq.items || []).map((it, i) => {
      return `${i + 1}. ${it.itemName}${it.itemCode ? ` [${it.itemCode}]` : ""} — ${it.qtyNeeded} ${it.unit || ""}`.trim()
        + (it.minSpec ? `\n   Min spec: ${it.minSpec}` : "")
        + (it.altBrandAllowed ? "" : "\n   Alternative brands not accepted");
    }),
    rfq.vendorInstructions ? `\nInstructions:\n${rfq.vendorInstructions}` : null,
    "",
    portalLink
      ? `Please submit your prices in our secure vendor portal:\n${portalLink}\nYou will receive a one-time code at your registered email address. This link is personal to your company — please do not forward it.`
      : "Please reply with unit price, available quantity, delivery date, warranty and quotation validity.",
    "",
    "Kind regards,",
    companyName,
  ];
  return lines.filter((l) => l !== null).join("\n");
};

export const mailtoLink = (email, subject, body) =>
  `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const whatsappLink = (phone, body) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
};

/** Index helpers over an RFQ detail payload. */
export const buildIndexes = (rfq) => {
  const itemById = new Map((rfq?.items || []).map((i) => [i.id, i]));
  const offerById = new Map();
  const vendorByOfferId = new Map();
  (rfq?.vendors || []).forEach((v) => (v.offers || []).forEach((o) => {
    offerById.set(o.id, o);
    vendorByOfferId.set(o.id, v);
  }));
  return { itemById, offerById, vendorByOfferId };
};

/** Offers for one item as [{ vendor, offer }] from vendors whose quote counts (submitted / revised). */
export const offersForItem = (rfq, itemId) => {
  const out = [];
  (rfq?.vendors || []).forEach((vendor) => {
    if (!hasPricedResponse(vendor.responseStatus)) return;
    (vendor.offers || []).forEach((offer) => {
      if (offer.rfqItemId === itemId) out.push({ vendor, offer });
    });
  });
  return out;
};

/**
 * Exports a simple table to a branded .xlsx via the shared exportToExcel helper.
 * header: column titles; rows: arrays in the same order; widths: optional per-column widths.
 */
export const exportTableToExcel = (title, header, rows, meta = {}, widths = []) => {
  const columns = header.map((h, i) => ({ header: h, key: `c${i}`, width: widths[i] || Math.min(40, Math.max(12, h.length + 4)) }));
  const data = rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v ?? ""])));
  return exportToExcel(data, columns, title, meta);
};

/** Offered item name: what the vendor typed, else legacy brand/model, else the requested item. */
export const offerItemName = (offer, item) =>
  offer?.description || [offer?.brand, offer?.model].filter(Boolean).join(" ") || item?.itemName || "";

/** Offered item code: the vendor's code, else (same item) the requested item's code. */
export const offerItemCode = (offer, item) => offer?.sku || (!offer?.alternative ? item?.itemCode : "") || "";
