import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ChevronLeft, ChevronRight, Check, Info, ShoppingCart, CheckCircle, History, BarChart3, AlertTriangle, ExternalLink,
} from "lucide-react";
import { createLposFromRfq } from "../../../api/purchase/rfqApi";
import { getWarehouses } from "../../../api/warehouseApi";
import {
  RfqStatusBadge, VendorAvatar, EmptyState, PageHeader, Stepper, primaryBtn, secondaryBtn, inputCls, Spinner,
} from "./RfqShared";
import {
  errorMessage, fmtDate, fmtMoney, isClosed, isComparable, landedUnitCost, num, offersForItem, previousPriceFor,
  offerItemName, offerItemCode, offerRuleIssue,
} from "./rfqUtils";

const STEPS = ["select", "review", "confirm"];

/** Pick one offer per item, review the per-vendor LPO plan, then create draft LPOs. */
export function LpoBuilder({ rfq, onChange, onBack, onNavigate }) {
  const navigate = useNavigate();
  const currency = rfq.currency || "AED";
  const [step, setStep] = useState("select");
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState(rfq.warehouseId ? String(rfq.warehouseId) : "");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState([]);

  // itemId -> { offerId, qty }; pre-filled from awards
  const [selections, setSelections] = useState(() => {
    const init = {};
    rfq.items.forEach((item) => {
      if (!item.awardedOfferId || item.qtyOrdered >= item.qtyNeeded) return;
      const found = offersForItem(rfq, item.id).find((c) => c.offer.id === item.awardedOfferId);
      if (found) init[item.id] = { offerId: found.offer.id, qty: Math.min(item.qtyNeeded - item.qtyOrdered, num(found.offer.quotedQty)) };
    });
    return init;
  });

  useEffect(() => {
    getWarehouses().then((l) => setWarehouses(Array.isArray(l) ? l : [])).catch(() => setWarehouses([]));
  }, []);

  const toggle = (item, offer) => setSelections((prev) => {
    if (prev[item.id]?.offerId === offer.id) {
      const next = { ...prev };
      delete next[item.id];
      return next;
    }
    return { ...prev, [item.id]: { offerId: offer.id, qty: Math.max(1, Math.min(item.qtyNeeded - item.qtyOrdered, num(offer.quotedQty) || item.qtyNeeded)) } };
  });

  const grouped = useMemo(() => {
    const map = new Map();
    Object.entries(selections).forEach(([itemId, sel]) => {
      const item = rfq.items.find((i) => i.id === Number(itemId));
      const found = item && offersForItem(rfq, item.id).find((c) => c.offer.id === sel.offerId);
      if (!found) return;
      const cur = map.get(found.vendor.id) || { vendor: found.vendor, lines: [] };
      cur.lines.push({ item, offer: found.offer, qty: num(sel.qty) });
      map.set(found.vendor.id, cur);
    });
    return [...map.values()];
  }, [selections, rfq]);

  const problems = useMemo(() => {
    const out = [];
    grouped.forEach(({ lines }) => lines.forEach(({ item, qty }) => {
      const remaining = item.qtyNeeded - item.qtyOrdered;
      if (!(qty > 0) || !Number.isInteger(qty)) out.push(`${item.itemName}: enter a whole quantity above zero.`);
      else if (qty > remaining) out.push(`${item.itemName}: only ${remaining} ${item.unit} remain to be ordered.`);
    }));
    if (!warehouseId) out.push("Choose the delivery warehouse.");
    return out;
  }, [grouped, warehouseId]);

  const create = async () => {
    if (problems.length) { toast.error(problems[0]); return; }
    setSaving(true);
    try {
      const lines = grouped.flatMap(({ lines: l }) => l.map(({ item, offer, qty }) => ({ itemId: item.id, offerId: offer.id, qty })));
      const before = new Set(rfq.lpos.map((l) => l.lpoNumber));
      const detail = await createLposFromRfq(rfq.id, { warehouseId: Number(warehouseId), lines });
      setCreated(detail.lpos.filter((l) => !before.has(l.lpoNumber)));
      onChange(detail);
      setStep("confirm");
      toast.success("Draft LPOs created");
    } catch (e) {
      toast.error(errorMessage(e, "Could not create the LPOs"));
    } finally {
      setSaving(false);
    }
  };

  const openItems = rfq.items.filter((i) => i.qtyOrdered < i.qtyNeeded);
  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares", rfq.rfqNumber, "Prepare LPO"]}
        icon={ShoppingCart}
        title="Prepare Multi-Vendor LPO"
        onBack={onBack}
        subtitle={<><span className="font-mono font-semibold text-[#a16207]">{rfq.rfqNumber}</span> · {rfq.title}</>}
        actions={<Stepper steps={STEPS.map((s) => s.charAt(0).toUpperCase() + s.slice(1))} current={stepIdx} allDone={step === "confirm"} />}
      />

      {isClosed(rfq.status) && step !== "confirm" ? (
        <EmptyState icon={AlertTriangle} title={`This RFQ is closed (${rfq.status.replace(/_/g, " ").toLowerCase()}).`} hint="No more LPOs can be created from it." />
      ) : step === "select" ? (
        <div className="flex-1 overflow-auto p-5 space-y-4 bg-[#F7F7FA]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">Pick one offer per item. Awarded offers are pre-selected. Each vendor gets its own draft LPO.</p>
            <button onClick={() => setStep("review")} disabled={grouped.length === 0} className={primaryBtn}>
              Review LPOs ({Object.keys(selections).length} items) <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {openItems.length === 0 && <EmptyState icon={CheckCircle} title="Every item on this RFQ is fully ordered." />}
          {openItems.map((item) => {
            const candidates = offersForItem(rfq, item.id).filter((c) => isComparable(c.offer));
            const best = candidates.length ? Math.min(...candidates.map((c) => landedUnitCost(c.offer))) : null;
            const sel = selections[item.id];
            const remaining = item.qtyNeeded - item.qtyOrdered;
            return (
              <div key={item.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.itemName}</div>
                    <div className="text-xs text-slate-500">{item.itemCode} · {remaining} of {item.qtyNeeded} {item.unit} still to order</div>
                  </div>
                  {sel && <span className="text-[10px] text-[#327F74] bg-[#327F74]/10 px-2 py-0.5 rounded border border-[#327F74]/30">Selected</span>}
                </div>
                {candidates.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No priced offers received for this item.</p>
                ) : (
                  <div className="space-y-2">
                    {candidates.map(({ vendor, offer }) => {
                      const isSelected = sel?.offerId === offer.id;
                      const isBest = best != null && landedUnitCost(offer) === best;
                      return (
                        <div key={offer.id} onClick={() => toggle(item, offer)} role="button" tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && toggle(item, offer)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all flex-wrap ${
                            isSelected ? "border-[#F5C742] bg-[#FFF8E7]" : "border-slate-200 hover:border-slate-300"}`}>
                          <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${isSelected ? "bg-[#F5C742]" : "border border-slate-300"}`}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-slate-900" />}
                          </span>
                          <VendorAvatar vendorId={vendor.vendorId} name={vendor.vendorName} />
                          <div className="flex-1 min-w-[160px]">
                            <div className="text-xs font-medium text-slate-900">{vendor.vendorName}</div>
                            <div className="text-[10px] text-slate-500">{[offerItemName(offer, item), offerItemCode(offer, item)].filter(Boolean).join(" · ")}{offer.alternative ? " (Alternative)" : ""}</div>
                            {offerRuleIssue(item, offer) && <div className="text-[10px] font-semibold text-red-600">{offerRuleIssue(item, offer)}</div>}
                          </div>
                          <Metric label="Unit" value={fmtMoney(offer.unitPrice, currency)} strong={isBest} />
                          <Metric label="Landed" value={fmtMoney(landedUnitCost(offer), currency)} />
                          <Metric label="Qty" value={offer.quotedQty} />
                          <Metric label="Delivery" value={fmtDate(offer.deliveryDate)} />
                          {isBest && <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200">Best landed</span>}
                          {isSelected && (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] text-slate-500">Order qty:</span>
                              <input type="number" min="1" max={remaining} step="1" value={sel.qty}
                                onChange={(e) => setSelections((p) => ({ ...p, [item.id]: { ...p[item.id], qty: e.target.value === "" ? "" : Number(e.target.value) } }))}
                                className="w-16 bg-white border border-[#F5C742] rounded px-2 py-1 text-xs text-center focus:outline-none" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : step === "review" ? (
        <div className="flex-1 overflow-auto p-5 space-y-5 bg-[#F7F7FA]">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[#FFF8E7] border border-[#FDE6A9]">
            <Info className="w-4 h-4 text-[#a16207] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700">
              One <strong>draft</strong> LPO will be created per vendor, referencing {rfq.rfqNumber}. They go through the normal LPO approval flow.
              Each LPO line keeps the VAT % the vendor quoted (carried on to the GRN and purchase invoice); a line with no quoted VAT uses the product's purchase tax.
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 max-w-md">
            <label className="block text-[11px] text-slate-500 mb-1.5">Deliver to Warehouse *</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputCls}>
              <option value="">— Select warehouse —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="text-sm font-semibold text-slate-900">{grouped.length} LPO{grouped.length !== 1 ? "s" : ""} to create</div>
          {grouped.map(({ vendor, lines }) => {
            let sub = 0; let tax = 0; let ship = 0;
            lines.forEach(({ offer, qty }) => {
              const net = num(offer.unitPrice) * qty * (1 - num(offer.discountPercent) / 100);
              sub += net; tax += net * num(offer.taxPercent) / 100; ship += num(offer.shippingCost);
            });
            return (
              <div key={vendor.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <VendorAvatar vendorId={vendor.vendorId} name={vendor.vendorName} size="md" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{vendor.vendorName}</div>
                      <div className="text-xs text-slate-500">{lines.length} item{lines.length !== 1 ? "s" : ""}{vendor.paymentTerms ? ` · ${vendor.paymentTerms}` : ""}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-slate-900">{fmtMoney(sub + tax + ship, currency)}</div>
                    <div className="text-[10px] text-slate-500">LPO value incl. quoted VAT</div>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Item", "Offered Item", "Qty", "Unit Price", "Discount", "Tax", "Line Total"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(({ item, offer, qty }) => {
                      const net = num(offer.unitPrice) * qty * (1 - num(offer.discountPercent) / 100);
                      return (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="px-3 py-2.5"><div className="text-slate-900 font-medium">{item.itemName}</div><div className="text-[10px] text-slate-500">{item.itemCode}</div></td>
                          <td className="px-3 py-2.5 text-slate-600"><div>{offerItemName(offer, item) || "—"}</div><div className="text-[10px] text-slate-500">{offerItemCode(offer, item)}</div></td>
                          <td className="px-3 py-2.5 text-slate-600">{qty} {item.unit}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{fmtMoney(offer.unitPrice, currency)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{num(offer.discountPercent)}%</td>
                          <td className="px-3 py-2.5 text-slate-600">{num(offer.taxPercent)}%</td>
                          <td className="px-3 py-2.5 font-bold text-slate-900">{fmtMoney(net * (1 + num(offer.taxPercent) / 100), currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2 text-[11px] text-slate-500 text-right">
                  Sub {fmtMoney(sub, currency)} · Tax {fmtMoney(tax, currency)}{ship ? ` · Shipping ${fmtMoney(ship, currency)} (not added to the LPO)` : ""}
                </div>
              </div>
            );
          })}
          {problems.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-0.5">
              {problems.map((p) => <div key={p}>• {p}</div>)}
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep("select")} className={secondaryBtn}><ChevronLeft className="w-3.5 h-3.5" /> Back to Selection</button>
            <button onClick={create} disabled={saving || problems.length > 0 || grouped.length === 0} className={primaryBtn}>
              {saving ? <Spinner className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              Create {grouped.length} Draft LPO{grouped.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-5">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#327F74]/15 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-[#327F74]" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Draft LPOs Created</h2>
            <p className="text-sm text-slate-500 mb-6 text-center">
              {created.length} purchase order{created.length !== 1 ? "s" : ""} created from {rfq.rfqNumber}. RFQ status: <RfqStatusBadge status={rfq.status} />
            </p>
            <div className="w-full max-w-md space-y-2 mb-8">
              {created.map((l) => (
                <button key={l.lpoNumber} onClick={() => navigate("/purchases/lpo", { state: { lpoNumber: l.lpoNumber } })}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-white border border-[#327F74]/30 hover:bg-[#327F74]/5 text-left">
                  <VendorAvatar vendorId={l.vendorId} name={l.vendorName} />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-900">{l.lpoNumber}</div>
                    <div className="text-[10px] text-slate-500">{l.vendorName}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[#327F74]" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onBack} className={secondaryBtn}>Back to RFQ</button>
              <button onClick={() => navigate("/purchases/lpo")} className={primaryBtn}>Open LPO & Approvals</button>
              {rfq.items.some((i) => i.qtyOrdered < i.qtyNeeded) && (
                <button onClick={() => { setSelections({}); setStep("select"); }} className={secondaryBtn}>Order remaining items</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, strong }) {
  return (
    <div className="text-center min-w-[64px]">
      <div className={`text-xs ${strong ? "font-bold text-emerald-600" : "font-semibold text-slate-900"}`}>{value}</div>
      <div className="text-[9px] text-slate-500">{label}</div>
    </div>
  );
}

/** Per-item comparison of the current quotes against earlier quotes and LPO purchase prices. */
export function LpoComparison({ rfqs, rfq, onSelectRfq, onBack, onNavigate }) {
  const [openHistory, setOpenHistory] = useState(null);
  const currency = rfq?.currency || "AED";

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares", "LPO Comparison"]}
        icon={BarChart3}
        title="LPO Price Comparison"
        onBack={onBack}
        subtitle="Current quotations against earlier quotes and purchase orders"
        actions={rfq && !isClosed(rfq.status) && (
          <button onClick={() => onNavigate("lpo-builder", rfq.id)} className={primaryBtn}><ShoppingCart className="w-4 h-4" /> Prepare LPO</button>
        )}
      >
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <label className="text-[10px] text-slate-500 block mb-1">Select RFQ</label>
            <select value={rfq?.id || ""} onChange={(e) => onSelectRfq(Number(e.target.value))} className={inputCls}>
              {!rfq && <option value="">— Select —</option>}
              {rfqs.map((r) => <option key={r.id} value={r.id}>{r.rfqNumber} — {r.title}</option>)}
            </select>
          </div>
          {rfq && (
            <div className="flex items-center gap-3 pb-2 text-xs text-slate-500">
              <RfqStatusBadge status={rfq.status} />
              <span>{rfq.vendors.filter((v) => ["SUBMITTED", "REVISED", "REVISION_REQUESTED"].includes(v.responseStatus)).length} priced responses</span>
            </div>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 space-y-4 bg-[#F7F7FA]">
        {!rfq ? (
          <EmptyState icon={BarChart3} title="Select an RFQ to compare" />
        ) : rfq.items.map((item) => {
          const candidates = offersForItem(rfq, item.id).filter((c) => num(c.offer.unitPrice) > 0);
          const comparable = candidates.filter((c) => isComparable(c.offer));
          const best = comparable.length ? Math.min(...comparable.map((c) => num(c.offer.unitPrice))) : null;
          const worst = comparable.length ? Math.max(...comparable.map((c) => num(c.offer.unitPrice))) : null;
          const history = rfq.priceHistory?.[item.id] || [];
          return (
            <div key={item.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-sm font-semibold text-slate-900">{item.itemName}</span>
                  <span className="ml-2 text-xs text-slate-500">{item.itemCode} · {item.qtyNeeded} {item.unit} needed</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {best != null && (
                    <span className="text-slate-500">Best: <span className="text-emerald-600 font-bold">{fmtMoney(best, currency)}</span>
                      {worst !== best && <span className="ml-1 text-slate-400">— Highest: {fmtMoney(worst, currency)}</span>}</span>
                  )}
                  {history.length > 0 && (
                    <button onClick={() => setOpenHistory(openHistory === item.id ? null : item.id)} className="flex items-center gap-1 text-slate-500 hover:text-slate-800">
                      <History className="w-3 h-3" /> {openHistory === item.id ? "Hide" : "View"} History ({history.length})
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Vendor", "Offered Item", "Spec", "Qty", "Stock", "Unit Price", "Disc", "Tax", "Shipping", "Landed Total", "Delivery", "Warranty", ""].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.length === 0 ? (
                      <tr><td colSpan={13} className="px-4 py-4 text-center text-slate-400">No offers received for this item</td></tr>
                    ) : candidates.map(({ vendor, offer }) => {
                      const isBest = best != null && isComparable(offer) && num(offer.unitPrice) === best;
                      const prev = previousPriceFor(history, vendor.vendorId);
                      const diff = prev ? num(offer.unitPrice) - num(prev.price) : null;
                      const pct = diff !== null && num(prev.price) ? (diff / num(prev.price)) * 100 : null;
                      return (
                        <tr key={offer.id} className={`border-b border-slate-100 ${isBest ? "bg-emerald-50/40" : ""}`}>
                          <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><VendorAvatar vendorId={vendor.vendorId} name={vendor.vendorName} /><span className="text-slate-900 whitespace-nowrap">{vendor.vendorName}</span></div></td>
                          <td className="px-3 py-2.5"><div className="text-slate-900">{offerItemName(offer, item) || "—"}</div><div className="text-[10px] text-slate-500">{offerItemCode(offer, item)}</div></td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${offer.alternative ? "bg-[#327F74]/10 text-[#327F74]" : "bg-emerald-50 text-emerald-700"}`}>
                              {offer.alternative ? "Alternative" : "As requested"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-600">{offer.quotedQty}</td>
                          <td className="px-3 py-2.5 text-center text-slate-600">{offer.availableStock ?? "—"}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className={`font-bold ${isBest ? "text-emerald-600" : "text-slate-900"}`}>{fmtMoney(offer.unitPrice, currency)}</div>
                            {pct !== null && Number.isFinite(pct) && (
                              <div className={`text-[9px] ${diff > 0 ? "text-red-500" : diff < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                                {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {Math.abs(pct).toFixed(1)}% <span className="text-slate-400">vs {prev.source === "LPO" ? "last LPO" : "last quote"}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{num(offer.discountPercent)}%</td>
                          <td className="px-3 py-2.5 text-slate-600">{num(offer.taxPercent)}%</td>
                          <td className="px-3 py-2.5 text-slate-600">{fmtMoney(offer.shippingCost, currency)}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{fmtMoney(landedUnitCost(offer) * num(offer.quotedQty), currency)}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(offer.deliveryDate)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{offer.warranty || "—"}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {item.awardedOfferId === offer.id ? <span className="text-[9px] bg-[#327F74] text-white px-2 py-0.5 rounded-full">Awarded</span>
                              : isBest ? <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">Lowest</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {openHistory === item.id && (
                <div className="border-t border-slate-200 p-4 bg-slate-50 grid md:grid-cols-2 gap-4">
                  {["QUOTE", "LPO"].map((src) => {
                    const rows = history.filter((h) => h.source === src);
                    return (
                      <div key={src}>
                        <div className={`text-[10px] font-semibold mb-2 ${src === "LPO" ? "text-[#327F74]" : "text-[#a16207]"}`}>
                          {src === "LPO" ? "Purchase History (LPOs)" : "Previous Quotations"}
                        </div>
                        {rows.length === 0 ? <p className="text-xs text-slate-400">None found.</p> : rows.map((h, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs border-b border-slate-100 py-1.5">
                            <span className="text-slate-500 w-24">{fmtDate(h.date)}</span>
                            <span className="text-slate-600 flex-1 truncate">{h.vendorName}</span>
                            <span className="text-slate-900 font-semibold">{fmtMoney(h.price, currency)}</span>
                            <span className="text-slate-400">×{h.qty}</span>
                            <span className="text-[10px] text-slate-500">{h.documentNumber}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
