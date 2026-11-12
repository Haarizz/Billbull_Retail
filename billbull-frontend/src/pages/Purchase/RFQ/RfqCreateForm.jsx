import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ChevronRight, Check, FileText, Package, Plus, X, Users, ShieldCheck, Edit3, FilePlus2,
  AlertTriangle, Send, Search, Star, Zap, RefreshCw, CalendarClock, Truck, Wallet, MapPin, Info,
  Mail, Phone, Trophy, Layers, Repeat, PackageCheck, StickyNote, Hash,
} from "lucide-react";
import ProductSelector from "../../../components/ProductSelector";
import { getVendors } from "../../../api/vendorsApi";
import { getWarehouses } from "../../../api/warehouseApi";
import { createRfq, getRfqFormOptions, getVendorSuggestions, updateRfq } from "../../../api/purchase/rfqApi";
import { useBranch } from "@billbull/shared/context/BranchContext";
import { getDefaultProductUnit } from "../../../utils/unitPricing";
import {
  Field, VendorAvatar, PageHeader, Stepper, inputCls, smallInputCls, primaryBtn, secondaryBtn, Spinner,
} from "./RfqShared";
import {
  DEFAULT_PAYMENT_TERMS, DELIVERY_TERMS, QUOTATION_VALIDITY_OPTIONS, TAX_PREFERENCES, WARRANTY_OPTIONS,
  addDaysIso, errorMessage, fmtDate, fmtMoney, pickAutoAllocation, todayIso, withCurrent,
} from "./rfqUtils";

const STEPS = ["RFQ Info", "Items", "Vendors", "Review"];

const blankForm = () => ({
  title: "",
  reference: "",
  deadline: addDaysIso(7),
  expectedDelivery: addDaysIso(14),
  deliveryLocation: "",
  warehouseId: "",
  currency: "AED",
  taxPref: "Tax Inclusive",
  paymentTerms: "",
  deliveryTerms: "DDP",
  quotationValidity: "15 days",
  shippingReqs: "",
  notes: "",
  vendorInstructions: "",
});

const fromDetail = (d) => ({
  title: d.title || "",
  reference: d.reference || "",
  deadline: d.deadline || "",
  expectedDelivery: d.expectedDelivery || "",
  deliveryLocation: d.deliveryLocation || "",
  warehouseId: d.warehouseId ? String(d.warehouseId) : "",
  currency: d.currency || "AED",
  taxPref: d.taxPref || "Tax Inclusive",
  paymentTerms: d.paymentTerms || "",
  deliveryTerms: d.deliveryTerms || "",
  quotationValidity: d.quotationValidity || "",
  shippingReqs: d.shippingReqs || "",
  notes: d.notes || "",
  vendorInstructions: d.vendorInstructions || "",
});

/** What the vendor sees as the delivery address when a warehouse is picked. */
const warehouseLocation = (w) => (w ? [w.name, w.address].filter((s) => String(s || "").trim()).join(", ") : "");

let rowSeq = 0;
const itemRow = (fields) => ({
  key: `row-${Date.now()}-${rowSeq++}`,
  productId: null,
  itemCode: "",
  itemName: "",
  description: "",
  category: "",
  brand: "",
  model: "",
  unit: "PCS",
  units: [],
  qtyNeeded: 1,
  minSpec: "",
  altBrandAllowed: true,
  partialAllowed: true,
  expectedDelivery: "",
  warrantyRequired: "1 Year",
  ...fields,
});

const selectCls = `${inputCls} pr-9 appearance-auto`;
const smallSelectCls = `${smallInputCls} pr-8 appearance-auto`;

export default function RfqCreateForm({ initial = null, onCancel, onSaved }) {
  const isEdit = !!initial;
  const { activeBranch } = useBranch() || {};
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => (initial ? fromDetail(initial) : blankForm()));
  const [items, setItems] = useState(() =>
    initial ? initial.items.map((it) => itemRow({ ...it, units: [], expectedDelivery: it.expectedDelivery || "" })) : []
  );
  const [vendorIds, setVendorIds] = useState(() => (initial ? initial.vendors.map((v) => v.vendorId) : []));
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [options, setOptions] = useState(null);
  const [referenceIsAuto, setReferenceIsAuto] = useState(!isEdit);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoLocation = useRef(initial ? null : "");

  useEffect(() => {
    getVendors().then((list) => setVendors(Array.isArray(list) ? list : [])).catch(() => toast.error("Could not load vendors"));
    getWarehouses(activeBranch?.id || null)
      .then((list) => setWarehouses(Array.isArray(list) ? list : []))
      .catch(() => setWarehouses([]));
  }, [activeBranch?.id]);

  // Pick-lists + the auto reference. Only defaults that the user has not typed over are replaced.
  useEffect(() => {
    let cancelled = false;
    getRfqFormOptions()
      .then((o) => {
        if (cancelled) return;
        setOptions(o);
        if (isEdit) return;
        setForm((p) => {
          const terms = o.paymentTerms?.length ? o.paymentTerms : DEFAULT_PAYMENT_TERMS;
          return {
            ...p,
            reference: p.reference || o.suggestedReference || "",
            currency: p.currency === "AED" && o.baseCurrency ? o.baseCurrency : p.currency,
            paymentTerms: p.paymentTerms || terms.find((t) => /\b30\b/.test(t)) || terms[0] || "",
          };
        });
      })
      .catch(() => {
        if (cancelled || isEdit) return;
        setForm((p) => ({ ...p, paymentTerms: p.paymentTerms || "Net 30 Days" }));
      });
    return () => { cancelled = true; };
  }, [isEdit]);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const updateItem = (key, patch) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const selectedWarehouse = warehouses.find((w) => String(w.id) === String(form.warehouseId));

  const chooseWarehouse = (id) => {
    const w = warehouses.find((x) => String(x.id) === String(id));
    const next = warehouseLocation(w);
    setForm((p) => {
      // Follow the warehouse unless the user typed their own address.
      const followsWarehouse = !p.deliveryLocation || p.deliveryLocation === autoLocation.current;
      return { ...p, warehouseId: id, deliveryLocation: followsWarehouse ? next : p.deliveryLocation };
    });
    autoLocation.current = next;
  };

  const regenerateReference = () => {
    setForm((p) => ({ ...p, reference: options?.suggestedReference || p.reference }));
    setReferenceIsAuto(true);
  };

  const currencyOptions = useMemo(() => {
    const list = options?.currencies?.length ? options.currencies : [{ code: "AED", name: "UAE Dirham" }];
    return list.some((c) => c.code === form.currency) ? list : [{ code: form.currency, name: "" }, ...list];
  }, [options, form.currency]);
  const paymentTermOptions = withCurrent(options?.paymentTerms?.length ? options.paymentTerms : DEFAULT_PAYMENT_TERMS, form.paymentTerms);
  const validityOptions = withCurrent(QUOTATION_VALIDITY_OPTIONS, form.quotationValidity);
  const deliveryTerm = DELIVERY_TERMS.find((t) => t.code === form.deliveryTerms);

  const addProduct = (product) => {
    if (!product?.id) return;
    if (items.some((it) => it.productId === product.id)) {
      toast("That product is already on the RFQ — change its quantity instead.");
      return;
    }
    const unit = getDefaultProductUnit(product) || "PCS";
    const units = [...new Set([unit, ...(product.availableUnits || [])].filter(Boolean))];
    setItems((prev) => [
      ...prev,
      itemRow({
        productId: product.id,
        itemCode: product.code || "",
        itemName: product.name || product.description || "",
        description: product.shortDesc || "",
        category: product.category || product.departmentName || "",
        brand: product.brandName || product.brand?.name || (typeof product.brand === "string" ? product.brand : "") || "",
        unit,
        units,
        expectedDelivery: form.expectedDelivery || "",
      }),
    ]);
  };

  // Ranked vendor suggestions for the chosen products: vendorId -> suggestion
  const productKey = items.map((it) => it.productId).filter(Boolean).sort((a, b) => a - b).join(",");
  const [suggestionList, setSuggestionList] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  useEffect(() => {
    if (!productKey) { setSuggestionList([]); return undefined; }
    let cancelled = false;
    setSuggesting(true);
    getVendorSuggestions(productKey.split(",").map(Number))
      .then((list) => { if (!cancelled) setSuggestionList(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setSuggestionList([]); })
      .finally(() => { if (!cancelled) setSuggesting(false); });
    return () => { cancelled = true; };
  }, [productKey]);
  const suggestions = useMemo(() => new Map(suggestionList.map((s) => [s.vendorId, s])), [suggestionList]);

  const statusOf = (v) => String(v.status || "").toLowerCase();
  const isUsable = (v) => statusOf(v) !== "draft" && !statusOf(v).includes("hold") && !statusOf(v).includes("inactive") && !statusOf(v).includes("block");

  const selectableVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    const score = (v) => suggestions.get(v.id)?.score ?? -1;
    return vendors
      .filter((v) => statusOf(v) !== "draft")
      .filter((v) => vendorFilter !== "suggested" || suggestions.has(v.id))
      .filter((v) => vendorFilter !== "selected" || vendorIds.includes(v.id))
      .filter((v) => !q || [v.name, v.code, v.email, v.category].some((f) => String(f || "").toLowerCase().includes(q)))
      .sort((a, b) => score(b) - score(a)
        || Number(!!b.isPreferred) - Number(!!a.isPreferred)
        || String(a.name).localeCompare(String(b.name)));
  }, [vendors, vendorSearch, vendorFilter, vendorIds, suggestions]);

  const toggleVendor = (id) => setVendorIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  /** Up to 3 best vendors per item (volume, frequency, recency, price, reliability), 10 in total. */
  const autoAllocate = () => {
    const usableIds = new Set(vendors.filter(isUsable).map((v) => v.id));
    const { picks, uncovered } = pickAutoAllocation(items, suggestionList, usableIds, { perItem: 3, max: 10 });
    if (picks.length === 0) {
      toast("No purchase or quote history for these products yet — pick vendors manually.");
      return;
    }
    const added = picks.filter((id) => !vendorIds.includes(id)).length;
    setVendorIds((prev) => [...new Set([...prev, ...picks])]);
    toast.success(`${added ? `Added ${added}` : "Kept"} best-match vendor${picks.length !== 1 ? "s" : ""} (top ${Math.min(3, picks.length)} per item)`
      + (uncovered.length ? ` · ${uncovered.length} item${uncovered.length !== 1 ? "s have" : " has"} no history — add vendors manually` : ""));
  };

  /** Selected vendors that have history per item — shows gaps before sending. */
  const coverage = useMemo(() => items.map((it) => ({
    item: it,
    count: vendorIds.filter((id) => suggestions.get(id)?.productIds?.includes(it.productId)).length,
  })), [items, vendorIds, suggestions]);

  const stepError = (s) => {
    if (s === 1) {
      if (!form.title.trim()) return "Enter an RFQ title.";
      if (!form.deadline) return "Choose the quotation deadline.";
      if (!isEdit && form.deadline < todayIso()) return "The deadline cannot be in the past.";
      if (form.expectedDelivery && form.expectedDelivery < form.deadline) return "Expected delivery cannot be before the deadline.";
    }
    if (s === 2) {
      if (items.length === 0) return "Add at least one product.";
      const bad = items.find((it) => !(Number(it.qtyNeeded) > 0) || !Number.isInteger(Number(it.qtyNeeded)));
      if (bad) return `Enter a whole quantity for ${bad.itemName}.`;
    }
    if (s === 3 && vendorIds.length === 0) return "Select at least one vendor.";
    return null;
  };
  const currentError = stepError(step);

  const save = async (send) => {
    for (const s of [1, 2, 3]) {
      const err = stepError(s);
      if (err) { setStep(s); toast.error(err); return; }
    }
    const payload = {
      ...form,
      warehouseId: form.warehouseId ? Number(form.warehouseId) : null,
      expectedDelivery: form.expectedDelivery || null,
      items: items.map((it) => ({
        productId: it.productId,
        itemName: it.itemName,
        description: it.description,
        category: it.category,
        brand: it.brand,
        model: it.model,
        unit: it.unit,
        qtyNeeded: Number(it.qtyNeeded),
        minSpec: it.minSpec,
        altBrandAllowed: it.altBrandAllowed,
        partialAllowed: it.partialAllowed,
        expectedDelivery: it.expectedDelivery || null,
        warrantyRequired: it.warrantyRequired === "No warranty" ? "" : it.warrantyRequired,
      })),
      vendorIds,
      send,
    };
    setSaving(true);
    try {
      const saved = isEdit ? await updateRfq(initial.id, payload) : await createRfq(payload);
      toast.success(send ? `${saved.rfqNumber} saved and marked as sent` : isEdit ? `${saved.rfqNumber} updated` : `${saved.rfqNumber} saved as draft`);
      onSaved(saved, send);
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the RFQ"));
    } finally {
      setSaving(false);
    }
  };

  const vendorById = (id) => vendors.find((x) => x.id === id) || initial?.vendors.find((x) => x.vendorId === id);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares", isEdit ? initial.rfqNumber : "Create RFQ"]}
        icon={isEdit ? Edit3 : FilePlus2}
        title={isEdit ? `Edit ${initial.rfqNumber}` : "Create New RFQ"}
        onBack={onCancel}
        subtitle="Request for Quotation — choose items, invite vendors and set the commercial terms"
      >
        <Stepper steps={STEPS} current={step - 1} onStepClick={(i) => setStep(i + 1)} />
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-[#F7F7FA]">
        {step === 1 && (
          <div className="max-w-5xl space-y-5">
            <FormSection icon={FileText} title="RFQ Information" subtitle="What you are buying and how you will track it">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="RFQ Title *" className="md:col-span-2">
                  <input value={form.title} onChange={set("title")} placeholder="e.g. Retail Scanner Procurement" className={inputCls} autoFocus />
                </Field>
                <Field label="Internal Reference">
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={form.reference}
                      onChange={(e) => { setReferenceIsAuto(false); set("reference")(e); }}
                      placeholder="e.g. PR-2026-0001" className={`${inputCls} pl-9 pr-24 font-mono`} />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {referenceIsAuto && form.reference && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#327F74] bg-[#327F74]/10 rounded px-1.5 py-0.5">Auto</span>
                      )}
                      {!isEdit && options?.suggestedReference && !referenceIsAuto && (
                        <button type="button" onClick={regenerateReference} title="Use the automatic reference"
                          className="p-1 rounded hover:bg-slate-100 text-slate-500"><RefreshCw className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                  <Hint>{isEdit ? "Your own tracking number for this request." : `Generated from the next RFQ number${options?.nextRfqNumber ? ` (${options.nextRfqNumber})` : ""} — edit it to use your own.`}</Hint>
                </Field>
                <Field label="Quotation Validity">
                  <select value={form.quotationValidity} onChange={set("quotationValidity")} className={selectCls}>
                    {validityOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <Hint>How long vendors must hold their prices after quoting.</Hint>
                </Field>
              </div>
            </FormSection>

            <FormSection icon={CalendarClock} title="Timeline" subtitle="When you need the quotes and the goods">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Quotation Deadline *">
                  <input type="date" min={isEdit ? undefined : todayIso()} value={form.deadline} onChange={set("deadline")} className={inputCls} />
                  <Hint>Vendors cannot submit prices after this date.</Hint>
                </Field>
                <Field label="Expected Delivery Date">
                  <input type="date" min={form.deadline || undefined} value={form.expectedDelivery} onChange={set("expectedDelivery")} className={inputCls} />
                  <Hint>Used as the default "needed by" date for every item.</Hint>
                </Field>
              </div>
            </FormSection>

            <FormSection icon={Truck} title="Delivery" subtitle="Where the goods go and who carries the transport">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Deliver to Warehouse">
                  <select value={form.warehouseId} onChange={(e) => chooseWarehouse(e.target.value)} className={selectCls}>
                    <option value="">— Choose later —</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <Hint>The warehouse that receives the goods (GRN).</Hint>
                </Field>
                <Field label="Delivery Address (shown to vendors)">
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={form.deliveryLocation} onChange={set("deliveryLocation")}
                      placeholder={selectedWarehouse ? warehouseLocation(selectedWarehouse) : "e.g. Warehouse 4, Al Quoz Industrial 3, Dubai"}
                      className={`${inputCls} pl-9`} />
                  </div>
                  <Hint>{selectedWarehouse ? "Filled from the warehouse — change it if goods should go elsewhere." : "Pick a warehouse to fill this in, or type the site address."}</Hint>
                </Field>
                <Field label="Delivery Terms (Incoterms)">
                  <select value={form.deliveryTerms} onChange={set("deliveryTerms")} className={selectCls}>
                    {!deliveryTerm && form.deliveryTerms && <option value={form.deliveryTerms}>{form.deliveryTerms}</option>}
                    <option value="">— Not specified —</option>
                    {DELIVERY_TERMS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                  <Hint>{deliveryTerm?.hint || "Who pays for and carries the risk of transport."}</Hint>
                </Field>
                <Field label="Shipping Requirements">
                  <input value={form.shippingReqs} onChange={set("shippingReqs")} placeholder="e.g. Fragile — palletised, deliver before 10 am" className={inputCls} />
                </Field>
              </div>
            </FormSection>

            <FormSection icon={Wallet} title="Commercial Terms" subtitle="How vendors should price and get paid">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Currency">
                  <select value={form.currency} onChange={set("currency")} className={selectCls}>
                    {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code}{c.name ? ` — ${c.name}` : ""}</option>)}
                  </select>
                  <Hint>Vendors quote in this currency.</Hint>
                </Field>
                <Field label="Payment Terms">
                  <select value={form.paymentTerms} onChange={set("paymentTerms")} className={selectCls}>
                    <option value="">— Not specified —</option>
                    {paymentTermOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Hint>Vendors can propose different terms in their quote.</Hint>
                </Field>
                <Field label="Tax Preference" className="md:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {TAX_PREFERENCES.map((t) => {
                      const active = form.taxPref === t.value;
                      return (
                        <button key={t.value} type="button" onClick={() => setForm((p) => ({ ...p, taxPref: t.value }))}
                          className={`text-left rounded-lg border px-3 py-2.5 transition-all ${active ? "border-[#F5C742] bg-[#FFF8E7] ring-2 ring-[#F5C742]/20" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${active ? "border-[#C99A12]" : "border-slate-300"}`}>
                              {active && <span className="w-2 h-2 rounded-full bg-[#C99A12]" />}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{t.value}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 ml-6">{t.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            </FormSection>

            <FormSection icon={StickyNote} title="Notes" subtitle="Instructions are sent to vendors; internal notes are not">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Vendor Instructions">
                  <textarea rows={3} value={form.vendorInstructions} onChange={set("vendorInstructions")}
                    placeholder="e.g. Quote with original manufacturer warranty; attach datasheets." className={`${inputCls} resize-none`} />
                </Field>
                <Field label="Internal Notes (not shared)">
                  <textarea rows={3} value={form.notes} onChange={set("notes")} className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </FormSection>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#C99A12]" /> Requested Items ({items.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Item name and code come from the product master. Set quantity, unit and the rules vendors must follow.</p>
              </div>
              <button onClick={() => setPickerOpen(true)} className={primaryBtn}><Plus className="w-3.5 h-3.5" /> Add Products</button>
            </div>
            <div className="p-5">
              {items.length === 0 ? (
                <button onClick={() => setPickerOpen(true)}
                  className="w-full py-12 rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-[#F5C742] hover:bg-[#FFF8E7]">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Pick the products you need quotes for from the product master
                </button>
              ) : (
                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <ItemCard key={item.key} index={idx} item={item}
                      onChange={(patch) => updateItem(item.key, patch)}
                      onRemove={() => setItems((p) => p.filter((it) => it.key !== item.key))} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#C99A12]" /> Vendor Allocation ({vendorIds.length} selected)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Best matches first — ranked on volume bought, frequency, recency, price and RFQ response rate.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={autoAllocate} disabled={suggesting || suggestionList.length === 0}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#327F74] text-white text-xs font-semibold hover:bg-[#2a6b61] disabled:opacity-50"
                    title="Select the top 3 vendors for every item">
                    {suggesting ? <Spinner className="w-3 h-3" /> : <Zap className="w-3.5 h-3.5" />} Auto-Allocate
                  </button>
                  {vendorIds.length > 0 && <button type="button" onClick={() => setVendorIds([])} className={secondaryBtn}>Clear</button>}
                </div>
              </div>
              <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-md px-3 h-8 flex-1 min-w-[200px] focus-within:border-[#F5C742]">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <input value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} placeholder="Search vendors…"
                    className="bg-transparent text-xs outline-none flex-1" />
                </div>
                <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
                  {[["all", "All"], ["suggested", `Suggested (${suggestionList.length})`], ["selected", `Selected (${vendorIds.length})`]].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setVendorFilter(k)}
                      className={`px-3 h-8 ${vendorFilter === k ? "bg-[#FFF8E7] text-slate-900 font-semibold" : "bg-white text-slate-500 hover:bg-slate-50"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="p-5 pt-3 space-y-2 max-h-[60vh] overflow-y-auto">
                {selectableVendors.map((v) => (
                  <VendorRow key={v.id} vendor={v} selected={vendorIds.includes(v.id)} usable={isUsable(v)}
                    suggestion={suggestions.get(v.id)} items={items} currency={form.currency} onToggle={() => toggleVendor(v.id)} />
                ))}
                {selectableVendors.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">No vendors match.</p>}
              </div>
            </div>

            <aside className="bg-white rounded-lg border border-slate-200 shadow-sm xl:sticky xl:top-0">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#C99A12]" /> Coverage by item
              </div>
              <div className="p-3 space-y-1.5">
                {coverage.map(({ item, count }) => (
                  <div key={item.key} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-slate-50">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${count >= 2 ? "bg-[#327F74]" : count === 1 ? "bg-amber-400" : "bg-slate-300"}`} />
                    <span className="flex-1 min-w-0 truncate text-slate-700" title={item.itemName}>{item.itemName}</span>
                    <span className={`shrink-0 font-semibold ${count >= 2 ? "text-[#327F74]" : count === 1 ? "text-amber-600" : "text-slate-400"}`}>
                      {count} known
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500 px-2 pt-2 leading-relaxed">
                  "Known" = selected vendors that supplied or quoted the item before. Aim for at least 2–3 per item for a fair comparison.
                </p>
              </div>
            </aside>
          </div>
        )}

        {step === 4 && (
          <ReviewStep form={form} items={items} vendorIds={vendorIds} vendorById={vendorById}
            warehouse={selectedWarehouse} deliveryTerm={deliveryTerm} isEdit={isEdit} initial={initial}
            nextNumber={options?.nextRfqNumber} onEditStep={setStep} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0 bg-white gap-3">
        <button onClick={() => (step > 1 ? setStep((s) => s - 1) : onCancel())} className={secondaryBtn}>
          {step === 1 ? "Cancel" : "Back"}
        </button>
        <div className="flex items-center gap-3">
          {currentError && step < 4 && (
            <span className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{currentError}</span>
          )}
          {step === 4 ? (
            <>
              <button onClick={() => save(false)} disabled={saving} className={secondaryBtn}>
                {saving && <Spinner className="w-3.5 h-3.5" />} {isEdit ? "Save Changes" : "Save as Draft"}
              </button>
              <button onClick={() => save(true)} disabled={saving} className={primaryBtn}>
                <Send className="w-3.5 h-3.5" /> {isEdit ? "Save & Mark Sent" : "Create & Mark Sent"}
              </button>
            </>
          ) : (
            <button onClick={() => !currentError && setStep((s) => s + 1)} disabled={!!currentError} className={primaryBtn}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <ProductSelector
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addProduct}
        actionLabel="Add to RFQ"
        title="Select Products for the RFQ"
        mode="purchase"
      />
    </div>
  );
}

function Hint({ children }) {
  return <p className="text-[11px] text-slate-500 mt-1">{children}</p>;
}

function FormSection({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md bg-[#FFF8E7] text-[#C99A12] flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Switch-style rule toggle with a sentence that says what it means for vendors. */
function RuleToggle({ icon: Icon, label, checked, onChange, onText, offText }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 transition-all ${checked ? "border-[#327F74]/30 bg-[#327F74]/5" : "border-slate-200 bg-white"}`}>
      <span className={`mt-0.5 relative inline-flex w-9 h-5 rounded-full shrink-0 transition-colors ${checked ? "bg-[#327F74]" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900"><Icon className="w-3.5 h-3.5 text-slate-500" /> {label}</span>
        <span className={`block text-[11px] mt-0.5 ${checked ? "text-[#327F74]" : "text-slate-500"}`}>{checked ? onText : offText}</span>
      </span>
    </button>
  );
}

function ItemCard({ index, item, onChange, onRemove }) {
  const units = withCurrent(item.units?.length ? item.units : [item.unit || "PCS"], item.unit);
  const warranty = withCurrent(WARRANTY_OPTIONS, item.warrantyRequired || "No warranty");
  const meta = [item.itemCode, item.brand, item.category].filter(Boolean);
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <span className="w-7 h-7 rounded-md bg-[#F5C742] text-slate-900 text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-snug">{item.itemName}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {meta.map((m, i) => (
              <span key={m + i} className={`text-[10px] px-1.5 py-0.5 rounded border ${i === 0 && item.itemCode ? "font-mono bg-white border-slate-300 text-slate-700" : "bg-white border-slate-200 text-slate-500"}`}>{m}</span>
            ))}
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" aria-label="Remove item">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Required Qty *">
          <input type="number" min="1" step="1" value={item.qtyNeeded}
            onChange={(e) => onChange({ qtyNeeded: e.target.value })} className={smallInputCls} />
        </Field>
        <Field label="Unit">
          <select value={item.unit} onChange={(e) => onChange({ unit: e.target.value })} className={smallSelectCls} disabled={units.length < 2}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Needed By">
          <input type="date" value={item.expectedDelivery} onChange={(e) => onChange({ expectedDelivery: e.target.value })} className={smallInputCls} />
        </Field>
        <Field label="Warranty Required">
          <select value={item.warrantyRequired || "No warranty"} onChange={(e) => onChange({ warrantyRequired: e.target.value })} className={smallSelectCls}>
            {warranty.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="Specifications / Minimum Requirements" className="col-span-2 md:col-span-4">
          <input value={item.minSpec} onChange={(e) => onChange({ minSpec: e.target.value })}
            placeholder="e.g. 1D/2D, USB + Bluetooth, IP54 — vendors see this" className={smallInputCls} />
        </Field>
        <div className="col-span-2 md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <RuleToggle icon={Repeat} label="Alternative brands OK" checked={item.altBrandAllowed}
            onChange={(v) => onChange({ altBrandAllowed: v })}
            onText="Vendors may also offer an equivalent item from another brand."
            offText="Vendors must quote exactly this item — alternatives are refused." />
          <RuleToggle icon={PackageCheck} label="Partial quantity OK" checked={item.partialAllowed}
            onChange={(v) => onChange({ partialAllowed: v })}
            onText={`Vendors may quote less than ${item.qtyNeeded || 0} ${item.unit}.`}
            offText={`Vendors must quote the full ${item.qtyNeeded || 0} ${item.unit} to submit.`} />
        </div>
      </div>
    </div>
  );
}

function VendorRow({ vendor: v, selected, usable, suggestion: s, items, currency, onToggle }) {
  const onHold = String(v.status || "").toLowerCase().includes("hold");
  const best = s?.products?.filter((p) => p.rank === 1).length || 0;
  const itemName = (productId) => items.find((it) => it.productId === productId)?.itemName || "";
  return (
    <button type="button" onClick={onToggle}
      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
        selected ? "border-[#F5C742] bg-[#FFF8E7]" : "border-slate-200 hover:border-slate-300 bg-white"} ${usable ? "" : "opacity-70"}`}>
      <span className={`mt-1.5 w-4 h-4 rounded flex items-center justify-center shrink-0 ${selected ? "bg-[#F5C742]" : "border border-slate-300 bg-white"}`}>
        {selected && <Check className="w-2.5 h-2.5 text-slate-900" />}
      </span>
      <VendorAvatar vendorId={v.id} name={v.name} size="md" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{v.name}</span>
          {v.isPreferred && <Star className="w-3 h-3 fill-[#F5C742] text-[#F5C742] shrink-0" />}
          {onHold && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">On hold — no LPO</span>}
        </div>
        <div className="text-xs text-slate-500 truncate flex items-center gap-2">
          <span>{[v.code, v.category].filter(Boolean).join(" · ")}</span>
          {v.email ? <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" /> {v.email}</span>
            : <span className="inline-flex items-center gap-0.5 text-amber-600"><Mail className="w-3 h-3" /> no email</span>}
        </div>
        {s && (
          <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-slate-600">
            {s.totalQty > 0 && <span><strong className="text-slate-900">{s.totalQty.toLocaleString()}</strong> units bought</span>}
            {s.lpoCount > 0 && <span>{s.lpoCount} LPO line{s.lpoCount !== 1 ? "s" : ""}</span>}
            {s.quoteCount > 0 && <span>{s.quoteCount} quote{s.quoteCount !== 1 ? "s" : ""}</span>}
            {s.lastDate && <span>last {fmtDate(s.lastDate)}</span>}
            {s.invitations > 0 && <span>answered {s.answers}/{s.invitations} RFQs</span>}
            {items.length > 1 && <span>covers {s.productIds.length}/{items.length} items</span>}
          </div>
        )}
        {s && s.products?.length > 0 && items.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {s.products.map((p) => (
              <span key={p.productId} title={`Avg price ${fmtMoney(p.avgLpoPrice ?? p.avgQuotePrice, currency)}`}
                className={`text-[10px] px-1.5 py-0.5 rounded border max-w-[200px] truncate ${p.rank === 1 ? "bg-[#327F74]/10 text-[#327F74] border-[#327F74]/20" : "bg-white text-slate-500 border-slate-200"}`}>
                #{p.rank} {itemName(p.productId)}
              </span>
            ))}
          </div>
        )}
      </div>
      {s && (
        <div className="shrink-0 text-right">
          <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
            s.score >= 60 ? "bg-[#327F74] text-white" : s.score >= 30 ? "bg-[#327F74]/15 text-[#327F74]" : "bg-slate-100 text-slate-600"}`}>
            {best > 0 && <Trophy className="w-3 h-3" />} {Math.round(s.score)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">match</div>
          {items.length === 1 && s.products?.[0] && (
            <div className="text-[10px] text-slate-500 mt-0.5">avg {fmtMoney(s.products[0].avgLpoPrice ?? s.products[0].avgQuotePrice, currency)}</div>
          )}
        </div>
      )}
    </button>
  );
}

function ReviewStep({ form, items, vendorIds, vendorById, warehouse, deliveryTerm, isEdit, initial, nextNumber, onEditStep }) {
  const vendorsNoEmail = vendorIds.filter((id) => !vendorById(id)?.email).length;
  const daysToDeadline = form.deadline ? Math.round((new Date(`${form.deadline}T00:00:00`) - new Date(`${todayIso()}T00:00:00`)) / 86400000) : null;
  const totalUnits = items.reduce((s, it) => s + Number(it.qtyNeeded || 0), 0);
  const checks = [
    { ok: vendorIds.length >= 2, warn: true, text: vendorIds.length >= 2 ? `${vendorIds.length} vendors invited — enough to compare` : "Only 1 vendor — add more for a fair comparison" },
    { ok: vendorsNoEmail === 0, warn: true, text: vendorsNoEmail === 0 ? "Every vendor has an email for the portal invitation" : `${vendorsNoEmail} vendor${vendorsNoEmail !== 1 ? "s have" : " has"} no email — share their link over WhatsApp` },
    { ok: daysToDeadline == null || daysToDeadline >= 2, warn: true, text: daysToDeadline == null ? "No deadline" : `Vendors have ${daysToDeadline} day${daysToDeadline !== 1 ? "s" : ""} to quote` },
    { ok: !!form.deliveryLocation, warn: true, text: form.deliveryLocation ? "Delivery address set" : "No delivery address — vendors cannot price transport" },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start max-w-7xl">
      <div className="space-y-5 min-w-0">
        {/* Hero */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-[#FFF8E7] to-white border-b border-[#FDE6A9] px-5 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-[#a16207]">{isEdit ? initial.rfqNumber : nextNumber || "New RFQ"}</span>
                  {form.reference && <span className="font-mono text-slate-500">· Ref {form.reference}</span>}
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5 break-words">{form.title}</h2>
              </div>
              <button onClick={() => onEditStep(1)} className={secondaryBtn}><Edit3 className="w-3.5 h-3.5" /> Edit info</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <KeyStat label="Items" value={items.length} hint={`${totalUnits.toLocaleString()} units`} />
              <KeyStat label="Vendors" value={vendorIds.length} hint="invited" />
              <KeyStat label="Quote deadline" value={fmtDate(form.deadline)} hint={daysToDeadline != null ? `in ${daysToDeadline} day${daysToDeadline !== 1 ? "s" : ""}` : ""} />
              <KeyStat label="Delivery by" value={fmtDate(form.expectedDelivery)} hint={form.quotationValidity ? `quotes valid ${form.quotationValidity}` : ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            <DetailGroup icon={Truck} title="Delivery" rows={[
              ["Warehouse", warehouse?.name || "Choose later"],
              ["Address", form.deliveryLocation || "—"],
              ["Incoterms", deliveryTerm ? deliveryTerm.label : form.deliveryTerms || "—"],
              ["Shipping", form.shippingReqs || "—"],
            ]} />
            <DetailGroup icon={Wallet} title="Commercial" rows={[
              ["Currency", form.currency],
              ["Payment terms", form.paymentTerms || "—"],
              ["Tax", form.taxPref],
              ["Validity", form.quotationValidity || "—"],
            ]} />
            <DetailGroup icon={StickyNote} title="Notes" rows={[
              ["For vendors", form.vendorInstructions || "—"],
              ["Internal", form.notes || "—"],
            ]} />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-[#C99A12]" /> Items Requested ({items.length})</h3>
            <button onClick={() => onEditStep(2)} className="text-xs text-[#a16207] hover:underline">Edit items</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7FA] text-slate-600 text-xs">
                <tr>
                  {["#", "Item", "Qty", "Needed by", "Warranty", "Vendor rules"].map((h) => <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.key} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="font-medium text-slate-900">{it.itemName}</div>
                      <div className="text-xs text-slate-500 font-mono">{it.itemCode}</div>
                      {it.minSpec && <div className="text-xs text-slate-500 mt-0.5">Spec: {it.minSpec}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-900">{it.qtyNeeded} <span className="text-xs font-normal text-slate-500">{it.unit}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(it.expectedDelivery)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{it.warrantyRequired || "No warranty"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <RuleBadge on={it.altBrandAllowed} onText="Alternatives OK" offText="Exact item only" />
                        <RuleBadge on={it.partialAllowed} onText="Partial qty OK" offText="Full qty only" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vendors */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-[#C99A12]" /> Invited Vendors ({vendorIds.length})</h3>
            <button onClick={() => onEditStep(3)} className="text-xs text-[#a16207] hover:underline">Edit vendors</button>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {vendorIds.map((id) => {
              const v = vendorById(id);
              const name = v?.name || v?.vendorName || `Vendor #${id}`;
              const phone = v?.mobile || v?.primaryPhone || v?.phone;
              return (
                <div key={id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200">
                  <VendorAvatar vendorId={id} name={name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate" title={name}>{name}</div>
                    <div className="flex items-center gap-2 text-[11px] mt-0.5">
                      <span className={`inline-flex items-center gap-0.5 ${v?.email ? "text-[#327F74]" : "text-amber-600"}`}><Mail className="w-3 h-3" /> {v?.email ? "Email" : "No email"}</span>
                      <span className={`inline-flex items-center gap-0.5 ${phone ? "text-[#327F74]" : "text-slate-400"}`}><Phone className="w-3 h-3" /> {phone ? "Phone" : "No phone"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Readiness */}
      <aside className="bg-white rounded-lg border border-slate-200 shadow-sm xl:sticky xl:top-0">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#C99A12]" /> Ready to send?
        </div>
        <ul className="p-4 space-y-3">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2 text-xs">
              {c.ok ? <CheckDot /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
              <span className={c.ok ? "text-slate-700" : "text-amber-800"}>{c.text}</span>
            </li>
          ))}
        </ul>
        <div className="mx-4 mb-4 p-3 rounded-lg bg-[#327F74]/5 border border-[#327F74]/20 text-[11px] text-slate-600 flex gap-2">
          <Info className="w-3.5 h-3.5 text-[#327F74] shrink-0 mt-0.5" />
          <span><strong>Create &amp; Mark Sent</strong> saves the RFQ as sent. Then use <strong>Send to Vendors</strong> on the RFQ to email each vendor its private portal link.</span>
        </div>
      </aside>
    </div>
  );
}

function CheckDot() {
  return <span className="w-4 h-4 rounded-full bg-[#327F74] flex items-center justify-center shrink-0"><Check className="w-2.5 h-2.5 text-white" /></span>;
}

function KeyStat({ label, value, hint }) {
  return (
    <div className="bg-white/80 rounded-lg border border-[#FDE6A9] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-base font-bold text-slate-900 leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

function DetailGroup({ icon: Icon, title, rows }) {
  return (
    <div className="p-4">
      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5 mb-2.5"><Icon className="w-3.5 h-3.5 text-[#C99A12]" /> {title}</div>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-xs">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-900 font-medium break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RuleBadge({ on, onText, offText }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${on ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
      {on ? onText : offText}
    </span>
  );
}
