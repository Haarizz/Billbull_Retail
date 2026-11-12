import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ChevronLeft, ChevronRight, ChevronDown, Award, MessageSquare, Package, AlertTriangle, CheckCircle, Clock,
  Truck, TrendingDown, BarChart3, Layers, ShoppingCart, ArrowRight, Reply, Scale,
} from "lucide-react";
import { awardRfqItem, recordNegotiationReply, requestBetterPrice } from "../../../api/purchase/rfqApi";
import {
  RfqStatusBadge, VendorAvatar, AvailabilityBadge, NegotiationDrawer, NegotiationReplyModal, PageHeader, secondaryBtn, tealBtn,
} from "./RfqShared";
import {
  NEGOTIATION_STATUS_META, RESPONSE_STATUS_META, errorMessage, fmtDate, fmtMoney, isClosed, isComparable,
  landedUnitCost, num, offersForItem, recommendOffer,
  offerItemName, offerItemCode, offerRuleIssue,
} from "./rfqUtils";

/** Item-by-item comparison of vendor quotes: award, negotiate, then go to the LPO builder. */
export default function QuotationWorkspace({ rfq, canEdit, onChange, onBack, onNavigate }) {
  const [selectedItemId, setSelectedItemId] = useState(rfq.items[0]?.id);
  const [negotiateTarget, setNegotiateTarget] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const currency = rfq.currency || "AED";
  const closed = isClosed(rfq.status);
  const editable = canEdit && !closed;

  const selectedItem = rfq.items.find((i) => i.id === selectedItemId);
  const awardedCount = rfq.items.filter((i) => i.awardedOfferId).length;

  const awardedValue = useMemo(() => rfq.items.reduce((sum, item) => {
    if (!item.awardedOfferId) return sum;
    const found = offersForItem(rfq, item.id).find((c) => c.offer.id === item.awardedOfferId);
    const qty = Math.min(item.qtyNeeded - item.qtyOrdered, num(found?.offer.quotedQty));
    return sum + (found ? num(found.offer.unitPrice) * Math.max(0, qty) : 0);
  }, 0), [rfq]);

  const columns = useMemo(() => {
    if (!selectedItem) return [];
    return rfq.vendors.flatMap((vendor) => {
      const priced = ["SUBMITTED", "REVISION_REQUESTED", "REVISED"].includes(vendor.responseStatus);
      const offers = priced ? (vendor.offers || []).filter((o) => o.rfqItemId === selectedItem.id) : [];
      if (offers.length === 0) return [{ vendor, offer: null }];
      return offers.map((offer) => ({ vendor, offer }));
    });
  }, [rfq, selectedItem]);

  const lowestPrice = useMemo(() => {
    const prices = columns.filter((c) => c.offer && isComparable(c.offer)).map((c) => num(c.offer.unitPrice));
    return prices.length ? Math.min(...prices) : null;
  }, [columns]);

  const recommendation = useMemo(
    () => (selectedItem ? recommendOffer(selectedItem, offersForItem(rfq, selectedItem.id)) : null),
    [rfq, selectedItem]
  );

  const run = async (fn, success) => {
    setBusy(true);
    try {
      const detail = await fn();
      onChange(detail);
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const award = (offer, vendor) => {
    const removing = selectedItem.awardedOfferId === offer.id;
    run(() => awardRfqItem(rfq.id, selectedItem.id, removing ? null : offer.id),
      removing ? `Award removed for ${selectedItem.itemName}` : `${selectedItem.itemName} awarded to ${vendor.vendorName}`).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares", rfq.rfqNumber, "Quote Workspace"]}
        icon={Scale}
        title="Quotation Workspace"
        badge={<RfqStatusBadge status={rfq.status} />}
        onBack={onBack}
        subtitle={<><span className="font-mono font-semibold text-[#a16207]">{rfq.rfqNumber}</span> · {rfq.title} · {rfq.items.length} items · {rfq.vendors.length} vendors · Deadline {fmtDate(rfq.deadline)}</>}
        actions={<>
          <button onClick={() => onNavigate("responses", rfq.id)} className={secondaryBtn}><Layers className="w-4 h-4" /> All Responses</button>
          <button onClick={() => onNavigate("lpo-builder", rfq.id)} disabled={closed} className={tealBtn}><ShoppingCart className="w-4 h-4" /> LPO Builder</button>
        </>}
      />

      {/* Summary bar */}
      <div className="flex items-center gap-6 px-4 md:px-6 py-3 bg-white border-b border-slate-200 flex-wrap">
        <SummaryStat icon={CheckCircle} tint="bg-[#327F74]/15 text-[#327F74]" value={`${awardedCount}/${rfq.items.length}`} label="Items Awarded" />
        <div className="w-px h-8 bg-slate-200" />
        <SummaryStat icon={Clock} tint="bg-amber-50 text-amber-500" value={rfq.items.length - awardedCount} label="Pending" />
        <div className="w-px h-8 bg-slate-200" />
        <SummaryStat icon={BarChart3} tint="bg-[#F5C742]/20 text-[#a16207]" value={fmtMoney(awardedValue, currency)} label="Awarded Value (before tax)" />
        <div className="flex-1" />
        {awardedCount > 0 && !closed && (
          <button onClick={() => onNavigate("lpo-builder", rfq.id)} className={tealBtn}>
            <ShoppingCart className="w-3.5 h-3.5" /> Create LPO ({awardedCount} item{awardedCount !== 1 ? "s" : ""}) <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Items */}
        <div className="w-[280px] shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Requested Items ({rfq.items.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {rfq.items.map((item) => {
              const candidates = offersForItem(rfq, item.id).filter((c) => isComparable(c.offer));
              const quotedVendors = new Set(candidates.map((c) => c.vendor.id)).size;
              const low = candidates.length ? Math.min(...candidates.map((c) => num(c.offer.unitPrice))) : null;
              const awardedVendor = item.awardedOfferId
                ? rfq.vendors.find((v) => (v.offers || []).some((o) => o.id === item.awardedOfferId)) : null;
              const selected = item.id === selectedItemId;
              return (
                <button key={item.id} onClick={() => setSelectedItemId(item.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-100 border-l-2 transition-all group ${
                    selected ? "bg-[#327F74]/5 border-l-[#327F74]" : "hover:bg-slate-50 border-l-transparent"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      awardedVendor ? "bg-[#327F74]/15" : quotedVendors ? "bg-amber-50" : "bg-slate-50"}`}>
                      {awardedVendor ? <CheckCircle className="w-3.5 h-3.5 text-[#327F74]" />
                        : quotedVendors ? <BarChart3 className="w-3.5 h-3.5 text-amber-500" /> : <Clock className="w-3.5 h-3.5 text-slate-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold leading-tight truncate ${selected ? "text-[#327F74]" : "text-slate-900"}`}>{item.itemName}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{item.itemCode} · {item.qtyNeeded} {item.unit}{item.qtyOrdered ? ` · ${item.qtyOrdered} ordered` : ""}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          quotedVendors >= rfq.vendors.length ? "bg-emerald-50 text-emerald-700" : quotedVendors ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-400"}`}>
                          {quotedVendors}/{rfq.vendors.length} quoted
                        </span>
                        {low != null && <span className="text-[10px] font-semibold text-[#327F74]">from {fmtMoney(low, currency)}</span>}
                      </div>
                      {awardedVendor && <div className="text-[10px] text-[#327F74] font-medium truncate mt-1">→ {awardedVendor.vendorName}</div>}
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-1 ${selected ? "text-[#327F74]" : "text-slate-300"}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vendor columns */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedItem ? (
            <>
              <div className="px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] text-slate-400 font-mono">{selectedItem.itemCode}</span>
                      {selectedItem.altBrandAllowed && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">Alt brand OK</span>}
                      {selectedItem.partialAllowed && <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded">Partial OK</span>}
                    </div>
                    <h2 className="text-sm font-semibold text-slate-900">{selectedItem.itemName}</h2>
                    {selectedItem.minSpec && <p className="text-xs text-slate-500 mt-0.5">Spec: {selectedItem.minSpec}</p>}
                    {recommendation?.pick && (
                      <p className="text-[11px] text-[#327F74] mt-1.5 flex items-center gap-1">
                        <Award className="w-3 h-3" /> Recommended: <strong>{recommendation.pick.vendor.vendorName}</strong> — {recommendation.reason}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-slate-400">Qty Needed</div>
                    <div className="text-lg font-bold text-slate-900">{selectedItem.qtyNeeded}</div>
                    <div className="text-[10px] text-slate-400">{selectedItem.unit}</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-5">
                <div className="flex gap-4 min-h-[400px] items-stretch">
                  {columns.map(({ vendor, offer }) => {
                    const negotiation = offer
                      ? [...rfq.negotiations].reverse().find((n) => n.offerId === offer.id) : null;
                    return (
                      <VendorQuoteColumn
                        key={`${vendor.id}-${offer?.id ?? "none"}`}
                        vendor={vendor}
                        offer={offer}
                        item={selectedItem}
                        currency={currency}
                        isLowest={offer && lowestPrice != null && isComparable(offer) && num(offer.unitPrice) === lowestPrice}
                        isAwarded={offer && selectedItem.awardedOfferId === offer.id}
                        negotiation={negotiation}
                        editable={editable && !busy}
                        onAward={() => award(offer, vendor)}
                        onNegotiate={() => setNegotiateTarget({ vendor, offer })}
                        onReply={() => setReplyTarget({ vendor, negotiation })}
                      />
                    );
                  })}
                  {columns.length === 0 && <div className="text-sm text-slate-400 m-auto">No vendors on this RFQ.</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select an item to compare quotes</div>
          )}
        </div>
      </div>

      {negotiateTarget && selectedItem && (
        <NegotiationDrawer
          item={selectedItem}
          vendor={negotiateTarget.vendor}
          offer={negotiateTarget.offer}
          currency={currency}
          onClose={() => setNegotiateTarget(null)}
          onSend={(payload) => run(() => requestBetterPrice(rfq.id, payload), `Price request recorded for ${negotiateTarget.vendor.vendorName}`)}
        />
      )}
      {replyTarget && selectedItem && (
        <NegotiationReplyModal
          negotiation={replyTarget.negotiation}
          vendorName={replyTarget.vendor.vendorName}
          itemName={selectedItem.itemName}
          currency={currency}
          onClose={() => setReplyTarget(null)}
          onSave={(payload) => run(() => recordNegotiationReply(rfq.id, replyTarget.negotiation.id, payload), "Vendor reply recorded")}
        />
      )}
    </div>
  );
}

function SummaryStat({ icon: Icon, tint, value, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-6 h-6 rounded flex items-center justify-center ${tint}`}><Icon className="w-3.5 h-3.5" /></div>
      <div>
        <div className="text-xs font-bold text-slate-900">{value}</div>
        <div className="text-[10px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function VendorQuoteColumn({ vendor, offer, item, currency, isLowest, isAwarded, negotiation, editable, onAward, onNegotiate, onReply }) {
  const [showTiers, setShowTiers] = useState(false);
  const status = RESPONSE_STATUS_META[vendor.responseStatus] || RESPONSE_STATUS_META.PENDING;
  const negMeta = negotiation ? NEGOTIATION_STATUS_META[negotiation.status] : null;

  return (
    <div className={`flex flex-col w-[240px] shrink-0 rounded-lg border-2 transition-all ${
      isAwarded ? "border-[#327F74] bg-[#327F74]/5 shadow-md" : isLowest ? "border-[#F5C742]/70 bg-[#FFF8E7]" : "border-slate-200 bg-white"}`}>
      <div className={`sticky top-0 z-10 px-4 py-3 border-b rounded-t-[6px] ${isAwarded ? "border-[#327F74]/30 bg-[#327F74] text-white" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center gap-2.5">
          <VendorAvatar vendorId={vendor.vendorId} name={vendor.vendorName} size="md" />
          <div className="min-w-0">
            <div className={`text-xs font-semibold leading-tight truncate ${isAwarded ? "text-white" : "text-slate-900"}`}>{vendor.vendorName}</div>
            <div className={`text-[10px] ${isAwarded ? "text-white/80" : status.cls}`}>{status.label}{vendor.version ? ` · v${vendor.version}` : ""}</div>
          </div>
        </div>
        {isAwarded && <div className="flex items-center gap-1 mt-1.5 text-[10px] font-semibold"><CheckCircle className="w-3 h-3" /> Awarded</div>}
        {isLowest && !isAwarded && <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#a16207] font-semibold"><TrendingDown className="w-3 h-3" /> Lowest Price</div>}
      </div>

      {!offer ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-2 text-center">
          <Clock className="w-8 h-8 text-slate-200" />
          <div className="text-xs font-medium text-slate-400">No quote for this item</div>
          <div className="text-[10px] text-slate-400">
            {vendor.responseStatus === "PENDING" ? "Awaiting response" : vendor.responseStatus === "IN_PROGRESS" ? "Quote being entered" : vendor.responseStatus === "DECLINED" ? "Vendor declined" : "Item not quoted"}
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 space-y-3">
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">Offered Item</div>
            <div className="text-xs font-semibold text-slate-900">{offerItemName(offer, item) || "As requested"}{offerItemCode(offer, item) && <span className="font-normal text-slate-500"> · {offerItemCode(offer, item)}</span>}</div>
            {offer.alternative && (
              <div className="flex items-start gap-1 mt-1 p-1.5 bg-amber-50 border border-amber-100 rounded">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0 mt-px" />
                <span className="text-[10px] text-amber-700 leading-tight">{offer.alternativeReason || "Alternative item"}</span>
              </div>
            )}
            {offerRuleIssue(item, offer) && (
              <div className="flex items-start gap-1 mt-1 p-1.5 bg-red-50 border border-red-100 rounded">
                <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0 mt-px" />
                <span className="text-[10px] text-red-700 leading-tight">{offerRuleIssue(item, offer)} — breaks this RFQ item&apos;s rules</span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-lg border border-slate-100 p-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-[10px] text-slate-400 mb-0.5">Unit Price</div>
                <div className={`text-xl font-bold ${isLowest ? "text-[#327F74]" : "text-slate-900"}`}>{fmtMoney(offer.unitPrice, currency)}</div>
                {negotiation?.revisedPrice != null && num(negotiation.previousPrice) > num(offer.unitPrice) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-slate-400 line-through">{fmtMoney(negotiation.previousPrice, currency)}</span>
                    <span className="text-[10px] text-emerald-600 font-medium">
                      -{(((num(negotiation.previousPrice) - num(offer.unitPrice)) / num(negotiation.previousPrice)) * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">Landed / unit</div>
                <div className="text-xs font-semibold text-slate-700">{fmtMoney(landedUnitCost(offer), currency)}</div>
                <div className="text-[10px] text-slate-400">{offer.quotedQty} {item.unit}</div>
              </div>
            </div>
            {(num(offer.discountPercent) > 0 || num(offer.taxPercent) > 0 || num(offer.shippingCost) > 0) && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 flex-wrap">
                {num(offer.discountPercent) > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">-{num(offer.discountPercent)}% disc</span>}
                {num(offer.taxPercent) > 0 && <span className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">+{num(offer.taxPercent)}% VAT</span>}
                {num(offer.shippingCost) > 0 && <span className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">+{fmtMoney(offer.shippingCost, currency)} ship</span>}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <AvailabilityBadge availability={offer.availability} />
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Truck className="w-3 h-3 shrink-0" /> Deliver by <span className="font-medium text-slate-700">{fmtDate(offer.deliveryDate)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Package className="w-3 h-3 shrink-0" /> Warranty: <span className="font-medium text-slate-700">{offer.warranty || "—"}</span>
            </div>
            {offer.countryOfOrigin && <div className="text-[10px] text-slate-400">Origin: {offer.countryOfOrigin}</div>}
            {vendor.paymentTerms && <div className="text-[10px] text-slate-400">Payment: {vendor.paymentTerms}</div>}
          </div>
          {offer.bulkTiers?.length > 0 && (
            <div>
              <button onClick={() => setShowTiers((t) => !t)} className="flex items-center gap-1 text-[10px] text-[#327F74] hover:underline">
                <ChevronDown className={`w-3 h-3 transition-transform ${showTiers ? "rotate-180" : ""}`} />
                {offer.bulkTiers.length} bulk tier{offer.bulkTiers.length !== 1 ? "s" : ""}
              </button>
              {showTiers && (
                <div className="mt-1.5 space-y-1">
                  {offer.bulkTiers.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded border border-slate-100 text-[10px]">
                      <span className="text-slate-500">{t.minQty}–{t.maxQty ?? "∞"} {item.unit}</span>
                      <span className="font-semibold text-[#327F74]">{fmtMoney(t.unitPrice, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {offer.notes && <div className="text-[10px] text-slate-500 bg-slate-50 rounded p-2 border border-slate-100 leading-relaxed">{offer.notes}</div>}
          {negMeta && (
            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-[10px] font-medium ${negMeta.cls}`}>
              <MessageSquare className="w-3 h-3 shrink-0" /> {negMeta.label}
              <span className="ml-auto font-bold">{fmtMoney(negotiation.revisedPrice ?? negotiation.targetPrice, currency)}</span>
            </div>
          )}
        </div>
      )}

      {offer && editable && (
        <div className="p-3 pt-0 space-y-2">
          <button onClick={onAward} disabled={!isComparable(offer)}
            className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${
              isAwarded ? "bg-[#327F74] text-white hover:bg-[#2a6b61]" : "bg-white border border-[#327F74]/40 text-[#327F74] hover:bg-[#327F74]/10"}`}>
            {isAwarded ? <CheckCircle className="w-3.5 h-3.5" /> : <Award className="w-3.5 h-3.5" />}
            {isAwarded ? "Awarded (click to undo)" : "Award Item"}
          </button>
          {negotiation?.status === "REQUESTED" ? (
            <button onClick={onReply} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 hover:bg-amber-100">
              <Reply className="w-3.5 h-3.5" /> Record Reply
            </button>
          ) : (
            <button onClick={onNegotiate} disabled={!isComparable(offer)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 hover:border-[#F5C742] hover:text-[#a16207] disabled:opacity-40">
              <MessageSquare className="w-3.5 h-3.5" /> {negotiation ? "Negotiate Again" : "Negotiate"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
