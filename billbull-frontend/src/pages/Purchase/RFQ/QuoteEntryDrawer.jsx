import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Package, Plus, X, Save, Send, Ban, Info, History, TrendingUp, TrendingDown } from "lucide-react";
import { saveVendorQuote } from "../../../api/purchase/rfqApi";
import { Drawer, Field, smallInputCls, primaryBtn, secondaryBtn, tealOutlineBtn, Spinner, VendorAvatar } from "./RfqShared";
import { RESPONSE_STATUS_META, errorMessage, fmtDate, fmtMoney, num } from "./rfqUtils";

import { OfferEditor, blankOffer, toEditable, buildQuotePayload, unavailableOffer, quoteProblems } from "./OfferEditor";

export { OfferEditor, blankOffer, toEditable, buildQuotePayload, unavailableOffer };

/** Staff enter (or update) one vendor's quotation for the RFQ. */
export default function QuoteEntryDrawer({ rfq, vendor, onSaved, onClose }) {
  const [selectedItemId, setSelectedItemId] = useState(rfq.items[0]?.id);
  const [offers, setOffers] = useState(() => (vendor.offers || []).map(toEditable));
  const [paymentTerms, setPaymentTerms] = useState(vendor.paymentTerms || rfq.paymentTerms || "");
  const [deliveryTerms, setDeliveryTerms] = useState(vendor.deliveryTerms || rfq.deliveryTerms || "");
  const [validity, setValidity] = useState(vendor.validity || "");
  const [saving, setSaving] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const currency = rfq.currency || "AED";
  const taxInclusive = rfq.taxPref === "Tax Inclusive";

  const selectedItem = rfq.items.find((i) => i.id === selectedItemId);
  const itemOffers = offers.filter((o) => o.rfqItemId === selectedItemId);
  const history = (rfq.priceHistory?.[selectedItemId] || []).filter((h) => h.vendorId === vendor.vendorId);

  const itemState = (itemId) => {
    const its = offers.filter((o) => o.rfqItemId === itemId);
    if (its.length === 0) return { label: "Not Quoted", cls: "text-slate-400" };
    if (its.every((o) => o.availability === "out-of-stock")) return { label: "Unavailable", cls: "text-red-500" };
    const item = rfq.items.find((i) => i.id === itemId);
    const qty = its.filter((o) => !o.alternative).reduce((s, o) => s + num(o.quotedQty), 0) || Math.max(...its.map((o) => num(o.quotedQty)));
    return qty >= num(item?.qtyNeeded) ? { label: "Quoted", cls: "text-[#327F74]" } : { label: "Partial", cls: "text-amber-600" };
  };

  const update = (key, patch) => setOffers((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const remove = (key) => setOffers((prev) => prev.filter((o) => o.key !== key));
  const add = (alternative) => selectedItem && setOffers((prev) => [...prev, blankOffer(selectedItem, alternative)]);
  const markUnavailable = () => {
    if (!selectedItem) return;
    setOffers((prev) => [
      ...prev.filter((o) => o.rfqItemId !== selectedItemId),
      unavailableOffer(selectedItem, "Not available from vendor stock."),
    ]);
  };

  const totals = useMemo(() => {
    const priced = offers.filter((o) => num(o.unitPrice) > 0 && o.availability !== "out-of-stock");
    return { count: priced.length, value: priced.reduce((s, o) => s + num(o.unitPrice) * num(o.quotedQty), 0) };
  }, [offers]);

  const submit = async (action) => {
    if (action === "SUBMIT" && totals.count === 0) {
      toast.error("Add at least one offer with a price before submitting.");
      return;
    }
    if (action === "SUBMIT") {
      const problems = quoteProblems(offers, rfq.items, true);
      if (problems.length) {
        setShowErrors(true);
        toast.error(problems.length === 1 ? problems[0] : `${problems.length} things to fix — see the highlighted fields`);
        return;
      }
    }
    if (action === "DECLINE" && !window.confirm(`Record that ${vendor.vendorName} declined to quote? Any offers entered will be removed.`)) return;
    setSaving(action);
    try {
      const payload = buildQuotePayload(action, { paymentTerms, deliveryTerms, validity }, offers);
      const detail = await saveVendorQuote(rfq.id, vendor.id, payload);
      toast.success(action === "SUBMIT" ? `Quotation from ${vendor.vendorName} recorded` : action === "DECLINE" ? "Recorded as declined" : "Draft saved");
      onSaved(detail);
      if (action !== "SAVE") onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the quotation"));
    } finally {
      setSaving(null);
    }
  };

  const status = RESPONSE_STATUS_META[vendor.responseStatus] || RESPONSE_STATUS_META.PENDING;

  return (
    <Drawer
      width="w-[1080px]"
      title={`Record Quotation — ${vendor.vendorName}`}
      subtitle={`${rfq.rfqNumber} · ${rfq.title}`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="text-xs text-slate-500">
            {totals.count} priced offer{totals.count !== 1 ? "s" : ""} · {fmtMoney(totals.value, currency)} before tax
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => submit("DECLINE")} disabled={!!saving} className={`${secondaryBtn} hover:text-red-600`}>
              {saving === "DECLINE" ? <Spinner className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />} Vendor Declined
            </button>
            <button onClick={() => submit("SAVE")} disabled={!!saving} className={secondaryBtn}>
              {saving === "SAVE" ? <Spinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />} Save Draft
            </button>
            <button onClick={() => submit("SUBMIT")} disabled={!!saving} className={primaryBtn}>
              {saving === "SUBMIT" ? <Spinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} Submit Quotation
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* Items */}
        <div className="w-64 shrink-0 border-r border-slate-200 overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <VendorAvatar vendorId={vendor.vendorId} name={vendor.vendorName} />
            <span className={`text-[10px] font-semibold ${status.cls}`}>{status.label}{vendor.version ? ` · v${vendor.version}` : ""}</span>
          </div>
          <div className="p-2 space-y-1.5">
            {rfq.items.map((item, idx) => {
              const st = itemState(item.id);
              const count = offers.filter((o) => o.rfqItemId === item.id).length;
              return (
                <button key={item.id} onClick={() => setSelectedItemId(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedItemId === item.id ? "border-[#F5C742] bg-[#FFF8E7]" : "border-slate-100 hover:border-slate-300 bg-slate-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-[#C99A12]">#{idx + 1} <span className={`ml-1 uppercase ${st.cls}`}>{st.label}</span></span>
                    {count > 0 && <span className="text-[9px] text-slate-500">{count} offer{count !== 1 ? "s" : ""}</span>}
                  </div>
                  <div className="text-xs font-medium text-slate-900 leading-tight">{item.itemName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{item.qtyNeeded} {item.unit}{item.itemCode ? ` · ${item.itemCode}` : ""}</div>
                </button>
              );
            })}
          </div>
          <div className="p-3 border-t border-slate-200 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quotation Terms</div>
            <Field label="Payment Terms"><input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={smallInputCls} /></Field>
            <Field label="Delivery Terms"><input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} className={smallInputCls} /></Field>
            <Field label="Valid Until"><input type="date" value={validity} onChange={(e) => setValidity(e.target.value)} className={smallInputCls} /></Field>
          </div>
        </div>

        {/* Offer editor */}
        <div className="flex-1 overflow-y-auto bg-[#F7F7FA]">
          {selectedItem ? (
            <div className="p-5 space-y-4">
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{selectedItem.itemName}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">{[selectedItem.itemCode, selectedItem.category].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">{selectedItem.qtyNeeded} {selectedItem.unit}</div>
                    <div className="text-[10px] text-slate-500">Requested</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3 text-slate-600">
                  <div>Item Code: <span className="text-slate-900">{selectedItem.itemCode || "—"}</span></div>
                  <div>Needed by: <span className="text-slate-900">{fmtDate(selectedItem.expectedDelivery)}</span></div>
                  <div>Warranty: <span className="text-slate-900">{selectedItem.warrantyRequired || "—"}</span></div>
                  <div>Alt brand: <span className={selectedItem.altBrandAllowed ? "text-emerald-600" : "text-red-600"}>{selectedItem.altBrandAllowed ? "Allowed" : "Not allowed"}</span></div>
                  <div>Partial qty: <span className={selectedItem.partialAllowed ? "text-emerald-600" : "text-red-600"}>{selectedItem.partialAllowed ? "Allowed" : "Not allowed"}</span></div>
                </div>
                {selectedItem.minSpec && <div className="mt-2 text-xs text-slate-600">Min spec: {selectedItem.minSpec}</div>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => add(false)} className={primaryBtn}><Plus className="w-3.5 h-3.5" /> Add Offer</button>
                {selectedItem.altBrandAllowed && (
                  <button onClick={() => add(true)} className={tealOutlineBtn}>
                    <Plus className="w-3.5 h-3.5" /> Add Alternative
                  </button>
                )}
                <button onClick={markUnavailable} className={secondaryBtn}><X className="w-3.5 h-3.5" /> Mark Unavailable</button>
              </div>

              {itemOffers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 border border-dashed border-slate-300 rounded-lg bg-white">
                  <Package className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">No offer for this item yet</p>
                  <button onClick={() => add(false)} className="mt-2 text-xs text-[#a16207] hover:underline">+ Add the vendor's offer</button>
                </div>
              )}

              {itemOffers.map((offer, i) => (
                <OfferEditor key={offer.key} index={i} offer={offer} item={selectedItem} currency={currency} taxInclusive={taxInclusive} showErrors={showErrors}
                  onChange={(patch) => update(offer.key, patch)} onRemove={() => remove(offer.key)} />
              ))}

              {history.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h4 className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> This vendor's earlier prices for this product
                  </h4>
                  {history.map((h, idx) => {
                    const current = num(itemOffers[0]?.unitPrice);
                    const diff = current ? current - num(h.price) : null;
                    const pct = diff !== null && num(h.price) ? (diff / num(h.price)) * 100 : null;
                    return (
                      <div key={idx} className="flex items-center gap-4 text-xs border-b border-slate-100 py-1.5 last:border-0">
                        <span className="text-slate-500 w-24">{fmtDate(h.date)}</span>
                        <span className="text-slate-500 flex-1">{h.source === "LPO" ? "LPO" : "Quote"} {h.documentNumber}</span>
                        <span className="text-slate-900 font-semibold">{fmtMoney(h.price, currency)}</span>
                        {pct !== null && Number.isFinite(pct) && (
                          <span className={`flex items-center gap-0.5 ${diff > 0 ? "text-red-500" : diff < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                            {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                            {Math.abs(pct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#327F74]/5 border border-[#327F74]/20 text-xs text-slate-600">
                <Info className="w-3.5 h-3.5 text-[#327F74] shrink-0 mt-0.5" />
                Enter prices exactly as the vendor quoted them (email, WhatsApp or PDF). Submitting again later records a new revision.
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select an item</div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
