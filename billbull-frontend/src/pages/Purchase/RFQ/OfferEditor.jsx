import React from "react";
import { X, AlertTriangle, Lock, Info, Plus } from "lucide-react";
import { Field, smallInputCls } from "./RfqShared";
import { WARRANTY_OPTIONS, fmtDate, fmtMoney, num, withCurrent } from "./rfqUtils";

/*
 * One vendor offer for one RFQ item — shared by staff quote entry and the vendor portal.
 *
 * Prices are always stored before VAT (unitPrice). When the RFQ asks for tax-inclusive prices the
 * vendor types the VAT-inclusive price into `grossPrice` and the net price is derived from it.
 */

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;
const netFromGross = (gross, taxPct) => (gross === "" || gross == null ? "" : round(num(gross) / (1 + num(taxPct) / 100), 4));
const grossFromNet = (net, taxPct) => (net === "" || net == null || !(num(net) > 0) ? "" : round(num(net) * (1 + num(taxPct) / 100), 2));

export const AVAILABILITY_OPTIONS = [
  { value: "in-stock", label: "In Stock", hint: "Can ship the quoted quantity from stock" },
  { value: "partial", label: "Partially in stock", hint: "Part from stock, the rest later" },
  { value: "on-order", label: "On Order", hint: "Needs to be ordered / produced first" },
  { value: "out-of-stock", label: "Out of Stock", hint: "Cannot supply" },
];

const COUNTRIES = [
  "United Arab Emirates", "Saudi Arabia", "Oman", "Qatar", "Kuwait", "Bahrain", "India", "China", "Japan", "South Korea",
  "Taiwan", "Malaysia", "Thailand", "Vietnam", "Turkey", "Italy", "Germany", "France", "Spain", "United Kingdom",
  "United States", "Czech Republic", "Poland",
];

let offerSeq = 0;
export const blankOffer = (item, alternative = false, defaults = {}) => ({
  key: `new-${Date.now()}-${offerSeq++}`,
  id: null,
  rfqItemId: item.id,
  brand: alternative ? "" : item.brand || "",
  model: alternative ? "" : item.model || "",
  sku: alternative ? "" : item.itemCode || "",
  description: alternative ? "" : item.itemName || "",
  unitPrice: "",
  grossPrice: "",
  quotedQty: item.qtyNeeded,
  availableStock: item.qtyNeeded,
  availability: "in-stock",
  dispatchDate: "",
  deliveryDate: item.expectedDelivery || "",
  warranty: item.warrantyRequired || "",
  countryOfOrigin: "",
  taxPercent: 5,
  discountPercent: 0,
  shippingCost: 0,
  additionalCost: 0,
  validUntil: defaults.validUntil || "",
  notes: "",
  alternative,
  alternativeReason: "",
  bulkTiers: [],
  ...defaults,
});

/** An offer the vendor cannot supply: zero price/qty, out of stock. */
export const unavailableOffer = (item, note = "Not available.") => ({
  ...blankOffer(item), unitPrice: 0, grossPrice: "", quotedQty: 0, availableStock: 0, availability: "out-of-stock", notes: note,
});

export const toEditable = (o) => ({
  ...o,
  key: `o-${o.id}`,
  grossPrice: grossFromNet(o.unitPrice, o.taxPercent),
  dispatchDate: o.dispatchDate || "",
  deliveryDate: o.deliveryDate || "",
  validUntil: o.validUntil || "",
  bulkTiers: (o.bulkTiers || []).map((t) => ({ ...t, grossPrice: grossFromNet(t.unitPrice, o.taxPercent) })),
});

const nullIfBlank = (v) => (v === "" || v === undefined ? null : v);

/** Request body for a quote save (staff entry and vendor portal share the backend shape). */
export const buildQuotePayload = (action, { paymentTerms, deliveryTerms, validity }, offers) => ({
  action,
  paymentTerms,
  deliveryTerms,
  validity: nullIfBlank(validity),
  offers: offers.map((o) => ({
    id: o.id,
    rfqItemId: o.rfqItemId,
    brand: o.brand,
    model: o.model,
    sku: o.sku,
    description: o.description,
    unitPrice: num(o.unitPrice),
    quotedQty: Math.round(num(o.quotedQty)),
    availableStock: o.availableStock === "" || o.availableStock == null ? null : Math.round(num(o.availableStock)),
    availability: o.availability,
    dispatchDate: nullIfBlank(o.dispatchDate),
    deliveryDate: nullIfBlank(o.deliveryDate),
    warranty: o.warranty,
    countryOfOrigin: o.countryOfOrigin,
    taxPercent: num(o.taxPercent),
    discountPercent: num(o.discountPercent),
    shippingCost: num(o.shippingCost),
    additionalCost: num(o.additionalCost),
    validUntil: nullIfBlank(o.validUntil),
    notes: o.notes,
    alternative: !!o.alternative,
    alternativeReason: o.alternativeReason,
    bulkTiers: (o.bulkTiers || []).filter((t) => num(t.unitPrice) > 0).map((t) => ({
      minQty: Math.round(num(t.minQty)), maxQty: t.maxQty === "" || t.maxQty == null ? null : Math.round(num(t.maxQty)),
      unitPrice: num(t.unitPrice), discountPct: num(t.discountPct), availableStock: Math.round(num(t.availableStock)), leadTimeDays: Math.round(num(t.leadTimeDays)),
    })),
  })),
});

/**
 * Field-level problems with one offer, keyed by field. `submitting` adds the checks that only
 * matter when the quote is sent (prices and full quantities); drafts may be incomplete.
 */
export const offerProblems = (offer, item, submitting = false) => {
  const p = {};
  if (!offer || offer.availability === "out-of-stock") return p;
  const qty = num(offer.quotedQty);
  const needed = num(item?.qtyNeeded);
  if (offer.alternative && item?.altBrandAllowed === false) p.alternative = "The buyer does not accept alternatives for this item.";
  if (offer.alternative && !String(offer.description || "").trim()) p.description = "Name the item you are offering.";
  if (submitting && !(num(offer.unitPrice) > 0)) p.unitPrice = "Enter a unit price.";
  if (submitting && !(qty > 0)) p.quotedQty = "Enter the quantity you can supply.";
  else if (item?.partialAllowed === false && qty < needed) p.quotedQty = `Full quantity required: ${needed} ${item.unit || ""}.`.trim();
  else if (qty > 0 && !Number.isInteger(qty)) p.quotedQty = "Use a whole number.";
  if (num(offer.discountPercent) > 100) p.discountPercent = "Cannot exceed 100%.";
  if (num(offer.taxPercent) > 100) p.taxPercent = "Check the VAT %.";
  const stock = offer.availableStock === "" || offer.availableStock == null ? null : num(offer.availableStock);
  if (offer.availability === "partial" && stock != null && stock >= qty && qty > 0) p.availableStock = "Partial means less than the quoted qty is in stock.";
  if (offer.availability === "in-stock" && stock != null && stock < qty) p.availableStock = `Only ${stock} in stock — choose "Partially in stock" or "On Order".`;
  if (offer.availability === "on-order" && submitting && !offer.dispatchDate) p.dispatchDate = "When can it be dispatched?";
  if (offer.dispatchDate && offer.deliveryDate && offer.deliveryDate < offer.dispatchDate) p.deliveryDate = "Delivery cannot be before dispatch.";
  const tiers = offer.bulkTiers || [];
  tiers.forEach((t, i) => {
    if (num(t.unitPrice) > 0 && t.maxQty !== "" && t.maxQty != null && num(t.maxQty) < num(t.minQty)) p[`tier${i}`] = "Max must be ≥ min.";
  });
  return p;
};

/** Every problem across offers as "Item: message" strings (for a submit guard). */
export const quoteProblems = (offers, items, submitting) => offers.flatMap((o) => {
  const item = items.find((i) => i.id === o.rfqItemId);
  return Object.values(offerProblems(o, item, submitting)).map((m) => `${item?.itemName || "Item"}: ${m}`);
});

export function OfferEditor({ index, offer, item, currency, taxInclusive = false, onChange, onRemove, showErrors = false, readOnly = false }) {
  const unavailable = offer.availability === "out-of-stock";
  const problems = offerProblems(offer, item, showErrors);
  const fullQtyOnly = item?.partialAllowed === false;
  const requested = !offer.alternative;

  const net = num(offer.unitPrice) * num(offer.quotedQty) * (1 - num(offer.discountPercent) / 100);
  const tax = net * (num(offer.taxPercent) / 100);
  const extras = num(offer.shippingCost) + num(offer.additionalCost);
  const total = net + tax + extras;

  const setPrice = (value) => (taxInclusive
    ? onChange({ grossPrice: value, unitPrice: netFromGross(value, offer.taxPercent) })
    : onChange({ unitPrice: value, grossPrice: grossFromNet(value, offer.taxPercent) }));
  const setTax = (value) => (taxInclusive && offer.grossPrice !== ""
    ? onChange({ taxPercent: value, unitPrice: netFromGross(offer.grossPrice, value) })
    : onChange({ taxPercent: value, grossPrice: grossFromNet(offer.unitPrice, value) }));
  const setAvailability = (value) => {
    const patch = { availability: value };
    if (value === "in-stock") patch.availableStock = offer.quotedQty;
    if (value === "partial" && num(offer.availableStock) >= num(offer.quotedQty)) patch.availableStock = "";
    if (value === "on-order") patch.availableStock = 0;
    onChange(patch);
  };
  const setQty = (value) => onChange({
    quotedQty: value,
    ...(offer.availability === "in-stock" ? { availableStock: value } : {}),
  });

  const err = (key) => problems[key] && <p className="text-[11px] text-red-600 mt-1">{problems[key]}</p>;
  const errCls = (key) => (problems[key] ? " border-red-300 focus:border-red-400 focus:ring-red-100" : "");
  const numberInput = (key, label, { step = "0.01", min = "0", max, onValue, value, suffix, prefix, hint } = {}) => (
    <Field label={label}>
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{prefix}</span>}
        <input type="number" inputMode="decimal" min={min} max={max} step={step} value={value ?? offer[key] ?? ""}
          onChange={(e) => (onValue ? onValue(e.target.value) : onChange({ [key]: e.target.value }))}
          className={`${smallInputCls}${prefix ? " pl-10" : ""}${suffix ? " pr-8" : ""}${errCls(key)}`} />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{suffix}</span>}
      </div>
      {err(key) || (hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>)}
    </Field>
  );
  const tiers = offer.bulkTiers || [];
  const setTier = (idx, patch) => onChange({ bulkTiers: tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)) });
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const from = last ? (num(last.maxQty) > 0 ? num(last.maxQty) + 1 : num(last.minQty) + 1) : Math.max(num(item?.qtyNeeded) + 1, 2);
    onChange({ bulkTiers: [...tiers, { minQty: from, maxQty: "", unitPrice: "", grossPrice: "", discountPct: 0, availableStock: 0, leadTimeDays: "" }] });
  };
  const setTierPrice = (idx, value) => setTier(idx, taxInclusive
    ? { grossPrice: value, unitPrice: netFromGross(value, offer.taxPercent) }
    : { unitPrice: value, grossPrice: grossFromNet(value, offer.taxPercent) });
  const warranty = withCurrent(WARRANTY_OPTIONS, offer.warranty || "");
  const priceLabel = taxInclusive ? `Unit Price incl. VAT (${currency}) *` : `Unit Price excl. VAT (${currency}) *`;
  const lateDelivery = item?.expectedDelivery && offer.deliveryDate && offer.deliveryDate > item.expectedDelivery;

  return (
    <div className={`bg-white rounded-lg border border-l-4 shadow-sm ${offer.alternative ? "border-[#327F74]/40 border-l-[#327F74]" : unavailable ? "border-red-200 border-l-red-400" : "border-slate-200 border-l-[#F5C742]"}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-900">Offer {index + 1}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${offer.alternative ? "bg-[#327F74]/10 text-[#327F74] border-[#327F74]/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
            {offer.alternative ? "Alternative item" : "Requested item"}
          </span>
          {unavailable && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Cannot supply</span>}
        </div>
        {!readOnly && <button type="button" onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" aria-label="Remove offer"><X className="w-4 h-4" /></button>}
      </div>

      {problems.alternative && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {problems.alternative}
        </div>
      )}

      {unavailable ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)] gap-3">
          <Field label="Availability">
            <select value={offer.availability} onChange={(e) => setAvailability(e.target.value)} className={smallInputCls}>
              {AVAILABILITY_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="Reason / note for the buyer">
            <input value={offer.notes || ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="e.g. Discontinued by the manufacturer" className={smallInputCls} />
          </Field>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* What is offered */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={requested ? "Item (as requested)" : "Offered item *"} className="sm:col-span-2">
              {requested ? (
                <div className="flex items-center gap-2 h-[34px] px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700">
                  <Lock className="w-3 h-3 text-slate-400 shrink-0" /> <span className="truncate">{item?.itemName}</span>
                </div>
              ) : (
                <>
                  <input value={offer.description || ""} onChange={(e) => onChange({ description: e.target.value })}
                    placeholder="Brand and model of the item you offer" className={`${smallInputCls}${errCls("description")}`} />
                  {err("description")}
                </>
              )}
            </Field>
            <Field label={requested ? "Item code" : "Your item / part code"}>
              {requested ? (
                <div className="flex items-center gap-2 h-[34px] px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700">
                  <Lock className="w-3 h-3 text-slate-400 shrink-0" /> {item?.itemCode || "—"}
                </div>
              ) : (
                <input value={offer.sku || ""} onChange={(e) => onChange({ sku: e.target.value })} placeholder="e.g. DS2208-SR" className={smallInputCls} />
              )}
            </Field>
            {offer.alternative && (
              <Field label="Why this alternative?" className="sm:col-span-3">
                <input value={offer.alternativeReason || ""} onChange={(e) => onChange({ alternativeReason: e.target.value })}
                  placeholder="How it compares with the requested item (spec, brand, price)…" className={smallInputCls} />
              </Field>
            )}
          </div>

          {/* Price & quantity */}
          <div>
            <SectionLabel>Price &amp; quantity</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {taxInclusive
                ? numberInput("grossPrice", priceLabel, { onValue: setPrice, hint: num(offer.unitPrice) > 0 ? `${fmtMoney(offer.unitPrice, currency)} before VAT` : null })
                : numberInput("unitPrice", priceLabel, { onValue: setPrice })}
              {numberInput("taxPercent", "VAT %", { onValue: setTax, max: "100", suffix: "%" })}
              {numberInput("discountPercent", "Discount %", { max: "100", suffix: "%" })}
              <Field label={`Quoted Qty (${item?.unit || "units"}) *`}>
                <input type="number" min={fullQtyOnly ? item?.qtyNeeded : 1} step="1" value={offer.quotedQty ?? ""}
                  onChange={(e) => setQty(e.target.value)} className={`${smallInputCls}${errCls("quotedQty")}`} />
                {err("quotedQty") || (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {fullQtyOnly ? `Full ${item?.qtyNeeded} required` : `Requested ${item?.qtyNeeded} · less is OK`}
                  </p>
                )}
              </Field>
            </div>
          </div>

          {/* Availability & delivery */}
          <div>
            <SectionLabel>Availability &amp; delivery</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Availability">
                <select value={offer.availability} onChange={(e) => setAvailability(e.target.value)} className={smallInputCls}>
                  {AVAILABILITY_OPTIONS.filter((a) => !(fullQtyOnly && a.value === "partial") || offer.availability === "partial")
                    .map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">{AVAILABILITY_OPTIONS.find((a) => a.value === offer.availability)?.hint}</p>
              </Field>
              {offer.availability === "on-order"
                ? <Field label="Stock now"><div className="h-[34px] flex items-center px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-500">None — ordered on request</div></Field>
                : numberInput("availableStock", "Units in stock now", { step: "1", hint: offer.availability === "in-stock" ? "Follows the quoted qty" : "How many ship immediately" })}
              <Field label={offer.availability === "on-order" ? "Ready to dispatch on *" : "Dispatch date"}>
                <input type="date" value={offer.dispatchDate || ""} onChange={(e) => onChange({ dispatchDate: e.target.value })} className={`${smallInputCls}${errCls("dispatchDate")}`} />
                {err("dispatchDate")}
              </Field>
              <Field label="Delivery date">
                <input type="date" min={offer.dispatchDate || undefined} value={offer.deliveryDate || ""} onChange={(e) => onChange({ deliveryDate: e.target.value })} className={`${smallInputCls}${errCls("deliveryDate")}`} />
                {err("deliveryDate") || (lateDelivery
                  ? <p className="text-[11px] text-amber-600 mt-1">After the needed-by date ({fmtDate(item.expectedDelivery)})</p>
                  : item?.expectedDelivery ? <p className="text-[11px] text-slate-500 mt-1">Needed by {fmtDate(item.expectedDelivery)}</p> : null)}
              </Field>
            </div>
          </div>

          {/* Other costs & terms */}
          <div>
            <SectionLabel>Other costs &amp; terms</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {numberInput("shippingCost", `Shipping (${currency}, total)`, { hint: "For the whole line" })}
              {numberInput("additionalCost", `Other charges (${currency})`, { hint: "Packing, installation…" })}
              <Field label="Warranty">
                <select value={offer.warranty || ""} onChange={(e) => onChange({ warranty: e.target.value })} className={smallInputCls}>
                  <option value="">— Select —</option>
                  {warranty.filter(Boolean).map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
                {item?.warrantyRequired && <p className="text-[11px] text-slate-500 mt-1">Requested: {item.warrantyRequired}</p>}
              </Field>
              <Field label="Country of origin">
                <input list="rfq-countries" value={offer.countryOfOrigin || ""} onChange={(e) => onChange({ countryOfOrigin: e.target.value })} placeholder="e.g. China" className={smallInputCls} />
                <datalist id="rfq-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="This offer valid until">
                <input type="date" value={offer.validUntil || ""} onChange={(e) => onChange({ validUntil: e.target.value })} className={smallInputCls} />
                <p className="text-[11px] text-slate-500 mt-1">Leave empty to use the quote validity</p>
              </Field>
              <Field label="Notes for the buyer" className="col-span-2 md:col-span-3">
                <input value={offer.notes || ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Packing, lead time details, conditions…" className={smallInputCls} />
              </Field>
            </div>
          </div>

          {/* Bulk tiers */}
          <div>
            <div className="flex items-center justify-between">
              <SectionLabel>Volume pricing <span className="normal-case font-normal text-slate-400">(optional — lower price for larger orders)</span></SectionLabel>
              {!readOnly && <button type="button" onClick={addTier} className="text-[11px] font-medium text-[#a16207] hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add tier</button>}
            </div>
            {tiers.length > 0 && (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] text-slate-500">
                    <tr>{["From qty", "To qty", taxInclusive ? "Unit price incl. VAT" : "Unit price excl. VAT", "Lead time (days)", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {tiers.map((t, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5"><input type="number" min="1" step="1" value={t.minQty ?? ""} onChange={(e) => setTier(i, { minQty: e.target.value })} className={smallInputCls} /></td>
                        <td className="px-2 py-1.5">
                          <input type="number" min={t.minQty || 1} step="1" value={t.maxQty ?? ""} placeholder="and above" onChange={(e) => setTier(i, { maxQty: e.target.value })} className={`${smallInputCls}${problems[`tier${i}`] ? " border-red-300" : ""}`} />
                        </td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="0.01" value={(taxInclusive ? t.grossPrice : t.unitPrice) ?? ""} onChange={(e) => setTierPrice(i, e.target.value)} className={smallInputCls} /></td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="1" value={t.leadTimeDays ?? ""} placeholder="—" onChange={(e) => setTier(i, { leadTimeDays: e.target.value })} className={smallInputCls} /></td>
                        <td className="px-1 w-8">{!readOnly && <button type="button" onClick={() => onChange({ bulkTiers: tiers.filter((_, x) => x !== i) })} className="p-1 text-slate-400 hover:text-red-500" aria-label="Remove tier"><X className="w-3.5 h-3.5" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tiers.some((_, i) => problems[`tier${i}`]) && <p className="text-[11px] text-red-600 px-2 py-1">A tier's "to" qty is below its "from" qty.</p>}
              </div>
            )}
          </div>

          {/* Line total */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
            {[
              ["Net (after discount)", fmtMoney(net, currency)],
              [`VAT ${num(offer.taxPercent)}%`, fmtMoney(tax, currency)],
              ["Shipping & other", fmtMoney(extras, currency)],
              ["Line total", fmtMoney(total, currency)],
            ].map(([l, v], i) => (
              <div key={l} className={`px-3 py-2 ${i === 3 ? "bg-[#FFF8E7]" : "bg-slate-50"}`}>
                <div className="text-[10px] text-slate-500">{l}</div>
                <div className={`text-sm font-bold ${i === 3 ? "text-slate-900" : "text-slate-700"}`}>{v}</div>
              </div>
            ))}
          </div>
          {taxInclusive && (
            <p className="text-[11px] text-slate-500 flex items-center gap-1"><Info className="w-3 h-3" /> The buyer asked for VAT-inclusive prices; the price before VAT is worked out from the VAT %.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{children}</div>;
}
