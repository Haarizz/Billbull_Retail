import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useCompany } from "@billbull/shared/context/CompanyContext";
import { useBranch } from "@billbull/shared/context/BranchContext";
import {
  ChevronLeft, ChevronDown, ChevronRight, Search, Package, Award, AlertTriangle, ShoppingCart, Download, Layers,
} from "lucide-react";
import { awardRfqItem, listRfqResponses, requestBetterPrice } from "../../../api/purchase/rfqApi";
import {
  VendorAvatar, NegotiationDrawer, EmptyState, PageHeader, SearchInput, primaryBtn, secondaryBtn, amberOutlineBtn, selectCls, Spinner,
} from "./RfqShared";
import {
  AVAILABILITY_META, NEGOTIATION_STATUS_META, RESPONSE_STATUS_META, errorMessage, exportTableToExcel, fmtDate, fmtMoney,
  isClosed, isComparable, landedTotal, landedUnitCost, num, recommendOffer,
  offerItemName, offerItemCode, offerRuleIssue,
} from "./rfqUtils";

/** Every vendor offer across RFQs, grouped by item, with best-offer hints, negotiation and LPO selection. */
export default function AllResponses({ rfqs, initialRfqId, canEdit, onBack, onNavigate }) {
  const { company } = useCompany() || {};
  const { activeBranch } = useBranch() || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rfqFilter, setRfqFilter] = useState(initialRfqId ? String(initialRfqId) : "all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [groupByItem, setGroupByItem] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Map()); // offerId -> row
  const [negotiateRow, setNegotiateRow] = useState(null);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listRfqResponses(rfqFilter === "all" ? null : Number(rfqFilter)));
    } catch (e) {
      toast.error(errorMessage(e, "Could not load responses"));
    } finally {
      setLoading(false);
    }
  }, [rfqFilter]);

  useEffect(() => { load(); }, [load]);

  const currencyOf = (rfqId) => rfqs.find((r) => r.id === rfqId)?.currency || "AED";

  const vendorsInRows = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(r.vendorId, r.vendorName));
    return [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (vendorFilter !== "all" && String(r.vendorId) !== vendorFilter) return false;
      if (!q) return true;
      return [r.item.itemName, r.item.itemCode, r.vendorName, r.offer.brand, r.offer.model, r.offer.description, r.offer.sku, r.rfqNumber]
        .some((f) => String(f || "").toLowerCase().includes(q));
    });
  }, [rows, vendorFilter, search]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = `${r.rfqId}::${r.item.id}`;
      const cur = map.get(key) || { key, rfqId: r.rfqId, rfqNumber: r.rfqNumber, rfqStatus: r.rfqStatus, item: r.item, rows: [] };
      cur.rows.push(r);
      map.set(key, cur);
    });
    return [...map.values()];
  }, [filtered]);

  const bestByKey = useMemo(() => {
    const out = new Map();
    groups.forEach((g) => {
      const comparable = g.rows.filter((r) => isComparable(r.offer));
      if (!comparable.length) return;
      out.set(g.key, {
        price: Math.min(...comparable.map((r) => num(r.offer.unitPrice))),
        landed: Math.min(...comparable.map((r) => landedUnitCost(r.offer))),
      });
    });
    return out;
  }, [groups]);

  const toggleSelect = (row) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(row.offer.id)) {
      next.delete(row.offer.id);
      return next;
    }
    // one offer per item: replace any other offer for the same item
    [...next.values()].forEach((r) => { if (r.rfqId === row.rfqId && r.item.id === row.item.id) next.delete(r.offer.id); });
    next.set(row.offer.id, row);
    return next;
  });

  const prepareLpo = async () => {
    const picked = [...selected.values()];
    const rfqIds = new Set(picked.map((r) => r.rfqId));
    if (rfqIds.size !== 1) {
      toast.error("Select offers from a single RFQ to prepare its LPOs.");
      return;
    }
    const rfqId = picked[0].rfqId;
    setPreparing(true);
    try {
      for (const r of picked) {
        if (r.item.awardedOfferId !== r.offer.id) await awardRfqItem(rfqId, r.item.id, r.offer.id);
      }
      onNavigate("lpo-builder", rfqId);
    } catch (e) {
      toast.error(errorMessage(e, "Could not award the selected offers"));
    } finally {
      setPreparing(false);
    }
  };

  const exportXlsx = () => {
    exportTableToExcel("Vendor Responses",
      ["RFQ", "Item Code", "Item", "Qty Needed", "Vendor", "Offered Item", "Offered Item Code", "Alternative", "Quoted Qty", "Stock", "Availability",
        "Unit Price", "Discount %", "Tax %", "Shipping", "Landed Total", "Delivery", "Warranty", "Response"],
      filtered.map((r) => [r.rfqNumber, r.item.itemCode, r.item.itemName, r.item.qtyNeeded, r.vendorName, offerItemName(r.offer, r.item), offerItemCode(r.offer, r.item),
        r.offer.alternative ? "Yes" : "No", r.offer.quotedQty, r.offer.availableStock, r.offer.availability, Math.round(num(r.offer.unitPrice) * 100) / 100,
        num(r.offer.discountPercent), num(r.offer.taxPercent), num(r.offer.shippingCost), Math.round(landedTotal(r.offer) * 100) / 100,
        r.offer.deliveryDate || "", r.offer.warranty || "", r.responseStatus]),
      { companyProfile: company, branch: activeBranch?.name || "" });
  };

  const renderRow = (r, showItem) => {
    const currency = currencyOf(r.rfqId);
    const best = bestByKey.get(`${r.rfqId}::${r.item.id}`);
    const isBestPrice = best && isComparable(r.offer) && num(r.offer.unitPrice) === best.price;
    const isBestValue = best && isComparable(r.offer) && landedUnitCost(r.offer) === best.landed;
    const isSel = selected.has(r.offer.id);
    const isOpen = expanded.has(r.offer.id);
    const status = RESPONSE_STATUS_META[r.responseStatus] || RESPONSE_STATUS_META.PENDING;
    const neg = r.negotiationStatus ? NEGOTIATION_STATUS_META[r.negotiationStatus] : null;
    const editable = canEdit && !isClosed(r.rfqStatus);
    return (
      <React.Fragment key={r.offer.id}>
        <tr className={`border-b border-slate-100 hover:bg-slate-50 ${isSel ? "bg-[#327F74]/5" : ""}`}>
          <td className="px-3 py-2.5">
            <input type="checkbox" checked={isSel} disabled={!editable || !isComparable(r.offer)} onChange={() => toggleSelect(r)} aria-label="Select for LPO" />
          </td>
          {showItem && (
            <>
              <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-[#a16207] font-mono">{r.rfqNumber}</td>
              <td className="px-3 py-2.5"><div className="text-xs text-slate-900 font-medium max-w-[160px] truncate">{r.item.itemName}</div><div className="text-[10px] text-slate-500">{r.item.qtyNeeded} {r.item.unit}</div></td>
            </>
          )}
          <td className="px-3 py-2.5">
            <button onClick={() => setExpanded((p) => { const n = new Set(p); n.has(r.offer.id) ? n.delete(r.offer.id) : n.add(r.offer.id); return n; })}
              className="flex items-center gap-1.5 text-left">
              {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              <VendorAvatar vendorId={r.vendorId} name={r.vendorName} />
              <span className="text-xs text-slate-900 whitespace-nowrap">{r.vendorName}</span>
            </button>
          </td>
          <td className="px-3 py-2.5">
            <div className="text-xs text-slate-900 max-w-[180px] truncate" title={offerItemName(r.offer, r.item)}>{offerItemName(r.offer, r.item) || "—"}</div>
            <div className="text-[10px] text-slate-500">{offerItemCode(r.offer, r.item)}</div>
            {r.offer.alternative && <div className="text-[9px] text-[#327F74]">Alternative</div>}
            {offerRuleIssue(r.item, r.offer) && <div className="text-[9px] font-semibold text-red-600">{offerRuleIssue(r.item, r.offer)}</div>}
          </td>
          <td className="px-3 py-2.5 text-center text-xs text-slate-600">{r.offer.quotedQty}</td>
          <td className="px-3 py-2.5 text-center">
            <span className={`text-xs ${(AVAILABILITY_META[r.offer.availability] || AVAILABILITY_META["in-stock"]).text}`}>{r.offer.availableStock ?? "—"}</span>
          </td>
          <td className="px-3 py-2.5 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${isBestPrice ? "text-emerald-600" : "text-slate-900"}`}>{fmtMoney(r.offer.unitPrice, currency)}</span>
              {isBestPrice && <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200">Best</span>}
              {isBestValue && !isBestPrice && <span className="text-[9px] bg-[#FFF8E7] text-[#a16207] px-1.5 py-0.5 rounded-full border border-[#FDE6A9]">Value</span>}
            </div>
          </td>
          <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtMoney(landedTotal(r.offer), currency)}</td>
          <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(r.offer.deliveryDate)}</td>
          <td className="px-3 py-2.5 text-xs text-slate-600">{r.offer.warranty || "—"}</td>
          <td className="px-3 py-2.5 whitespace-nowrap">
            <div className={`text-[10px] font-semibold ${status.cls}`}>{status.label}</div>
            {neg && <span className={`text-[9px] px-1 py-0.5 rounded border ${neg.cls}`}>{neg.label}</span>}
          </td>
          <td className="px-3 py-2.5 whitespace-nowrap">
            <div className="flex items-center gap-1">
              <button onClick={() => setNegotiateRow(r)} disabled={!editable || !isComparable(r.offer) || r.negotiationStatus === "REQUESTED"}
                className="px-2 py-1 rounded bg-pink-50 text-pink-600 text-[10px] font-medium hover:bg-pink-100 disabled:opacity-40">Negotiate</button>
              <button onClick={() => toggleSelect(r)} disabled={!editable || !isComparable(r.offer)}
                className={`px-2 py-1 rounded text-[10px] font-medium disabled:opacity-40 ${isSel ? "bg-[#327F74] text-white" : "bg-[#327F74]/10 text-[#327F74] hover:bg-[#327F74]/20"}`}>
                {isSel ? "✓ LPO" : "+ LPO"}
              </button>
            </div>
          </td>
        </tr>
        {isOpen && (
          <tr className="border-b border-slate-100 bg-slate-50">
            <td colSpan={showItem ? 13 : 11} className="px-8 py-3">
              <div className="grid grid-cols-4 gap-3 text-xs text-slate-600">
                <div>Item Code: <span className="text-slate-900">{offerItemCode(r.offer, r.item) || "—"}</span></div>
                <div>Discount: <span className="text-slate-900">{num(r.offer.discountPercent)}%</span></div>
                <div>Tax: <span className="text-slate-900">{num(r.offer.taxPercent)}%</span></div>
                <div>Dispatch: <span className="text-slate-900">{fmtDate(r.offer.dispatchDate)}</span></div>
                <div>Origin: <span className="text-slate-900">{r.offer.countryOfOrigin || "—"}</span></div>
                <div>Payment: <span className="text-slate-900">{r.paymentTerms || "—"}</span></div>
                <div>Valid until: <span className="text-slate-900">{fmtDate(r.offer.validUntil)}</span></div>
                {r.offer.notes && <div className="col-span-4">Notes: <span className="text-slate-900">{r.offer.notes}</span></div>}
                {r.offer.alternativeReason && <div className="col-span-4">Why alternative: <span className="text-slate-900">{r.offer.alternativeReason}</span></div>}
              </div>
              {r.offer.bulkTiers?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.offer.bulkTiers.map((t, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-white border border-slate-200 text-[10px]">
                      {t.minQty}{t.maxQty ? `–${t.maxQty}` : "+"} units: <strong>{fmtMoney(t.unitPrice, currency)}</strong>
                    </span>
                  ))}
                </div>
              )}
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const header = (showItem) => (
    <tr className="border-b border-slate-200 bg-white">
      <th className="px-3 py-2 w-8" />
      {[...(showItem ? ["RFQ", "Item"] : []), "Vendor", "Offered Item", "Qty", "Stock", "Unit Price", "Landed Total", "Delivery", "Warranty", "Status", ""].map((h) => (
        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
      ))}
    </tr>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares", "All Responses"]}
        icon={Layers}
        title="All Vendor Responses"
        onBack={onBack}
        subtitle="Compare quotations across vendors and items in one view"
        actions={<>
          {selected.size > 0 && (
            <button onClick={prepareLpo} disabled={preparing} className={primaryBtn}>
              {preparing ? <Spinner className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />} Prepare LPO ({selected.size})
            </button>
          )}
          <button onClick={exportXlsx} disabled={filtered.length === 0} className={secondaryBtn}><Download className="w-4 h-4" /> Export</button>
        </>}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search items, vendors, brands, RFQ…" />
          <select value={rfqFilter} onChange={(e) => { setRfqFilter(e.target.value); setSelected(new Map()); }}
            className={`${selectCls} min-w-[180px]`}>
            <option value="all">All RFQs</option>
            {rfqs.map((r) => <option key={r.id} value={r.id}>{r.rfqNumber} — {r.title}</option>)}
          </select>
          <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}
            className={`${selectCls} min-w-[160px]`}>
            <option value="all">All Vendors</option>
            {vendorsInRows.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button onClick={() => setGroupByItem((g) => !g)}
            className={groupByItem ? amberOutlineBtn : secondaryBtn}>
            <Layers className="w-4 h-4" /> Group by Item
          </button>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span>{filtered.length} offers from {new Set(filtered.map((r) => r.vendorId)).size} vendors</span>
          {selected.size > 0 && <span className="text-[#327F74] font-medium">{selected.size} offer{selected.size !== 1 ? "s" : ""} selected for LPO</span>}
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400"><Spinner className="w-6 h-6" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="No quotations recorded yet" hint="Open an RFQ and use Record Quote when a vendor replies." />
        ) : groupByItem ? (
          <div className="p-4 space-y-4">
            <BestOfferSummary groups={groups} currencyOf={currencyOf} />
            {groups.map((g) => {
              const prices = g.rows.filter((r) => isComparable(r.offer)).map((r) => num(r.offer.unitPrice));
              const currency = currencyOf(g.rfqId);
              return (
                <div key={g.key} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[#a16207]">{g.rfqNumber}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-sm font-semibold text-slate-900">{g.item.itemName}</span>
                      <span className="text-xs text-slate-500">{g.item.itemCode}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{g.item.qtyNeeded} {g.item.unit} needed</span>
                      <span>{g.rows.length} offer{g.rows.length !== 1 ? "s" : ""}</span>
                      {prices.length > 1 && Math.min(...prices) !== Math.max(...prices) && (
                        <span>Range: <span className="text-emerald-600 font-semibold">{fmtMoney(Math.min(...prices), currency)}</span> — {fmtMoney(Math.max(...prices), currency)}</span>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs"><thead>{header(false)}</thead><tbody>{g.rows.map((r) => renderRow(r, false))}</tbody></table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs"><thead className="sticky top-0 z-10">{header(true)}</thead><tbody className="bg-white">{filtered.map((r) => renderRow(r, true))}</tbody></table>
          </div>
        )}
      </div>

      {negotiateRow && (
        <NegotiationDrawer
          item={negotiateRow.item}
          vendor={{ vendorName: negotiateRow.vendorName }}
          offer={negotiateRow.offer}
          currency={currencyOf(negotiateRow.rfqId)}
          onClose={() => setNegotiateRow(null)}
          onSend={async (payload) => {
            try {
              await requestBetterPrice(negotiateRow.rfqId, payload);
              toast.success(`Price request recorded for ${negotiateRow.vendorName}`);
              load();
            } catch (e) {
              toast.error(errorMessage(e));
              throw e;
            }
          }}
        />
      )}
    </div>
  );
}

function BestOfferSummary({ groups, currencyOf }) {
  const recs = groups.map((g) => ({
    g,
    ...recommendOffer(g.item, g.rows.map((r) => ({ offer: r.offer, vendor: { vendorName: r.vendorName, vendorId: r.vendorId } }))),
  }));
  if (recs.length === 0) return null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Award className="w-4 h-4 text-[#C99A12]" />
        <h3 className="text-sm font-semibold text-slate-900">Best Offer Recommendations</h3>
        <span className="text-[10px] text-slate-500">Lowest landed cost, preferring offers that cover the full quantity</span>
      </div>
      <div className="space-y-1">
        {recs.map(({ g, pick, reason }) => (
          <div key={g.key} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="flex-1 min-w-0 text-xs text-slate-600 truncate"><span className="text-[#a16207] font-mono mr-2">{g.rfqNumber}</span>{g.item.itemName}</div>
            {pick ? (
              <>
                <VendorAvatar vendorId={pick.vendor.vendorId} name={pick.vendor.vendorName} />
                <span className="text-xs font-semibold text-slate-900 whitespace-nowrap">{pick.vendor.vendorName}</span>
                <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">{fmtMoney(pick.offer.unitPrice, currencyOf(g.rfqId))}</span>
                <span className="text-[10px] text-slate-500 max-w-[260px] truncate hidden lg:inline">{reason}</span>
              </>
            ) : (
              <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {reason}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
