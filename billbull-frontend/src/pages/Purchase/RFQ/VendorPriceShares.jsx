import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus, X, Download, Layers, BarChart3, Package, ClipboardList, Clock, Inbox, MessageCircle, Banknote, CheckCircle, Handshake, Eye, Scale,
} from "lucide-react";
import { usePermissions } from "@billbull/shared/context/PermissionContext";
import { useCompany } from "@billbull/shared/context/CompanyContext";
import { useBranch } from "@billbull/shared/context/BranchContext";
import { getRfq, listRfqs } from "../../../api/purchase/rfqApi";
import RfqCreateForm from "./RfqCreateForm";
import RfqDetail from "./RfqDetail";
import QuotationWorkspace from "./QuotationWorkspace";
import AllResponses from "./AllResponses";
import { LpoBuilder, LpoComparison } from "./LpoBuilder";
import {
  RfqStatusBadge, VendorAvatar, EmptyState, PageHeader, StatCard, SearchInput, Spinner,
  primaryBtn, secondaryBtn, tealOutlineBtn, rowActionBtn, selectCls, theadCls, thCls,
} from "./RfqShared";
import { RFQ_MODULE, RFQ_STATUS_META, errorMessage, exportTableToExcel, fmtDate, fmtMoney, isClosed, isPastDate } from "./rfqUtils";

const DETAIL_VIEWS = ["detail", "edit", "workspace", "lpo-builder", "comparison"];

const SUMMARY_CARDS = [
  { key: "all", label: "Total RFQs", icon: ClipboardList, accent: "slate", statuses: null },
  { key: "awaiting", label: "Awaiting Response", icon: Clock, accent: "yellow", statuses: ["SENT", "AWAITING", "PARTIAL"] },
  { key: "received", label: "Responses Received", icon: Inbox, accent: "blue", statuses: ["RECEIVED"] },
  { key: "negotiation", label: "In Negotiation", icon: MessageCircle, accent: "pink", statuses: ["NEGOTIATION"] },
  { key: "ready", label: "Ready for LPO", icon: Banknote, accent: "emerald", statuses: ["EVALUATION", "PARTIAL_ORDERED"] },
  { key: "completed", label: "Completed", icon: CheckCircle, accent: "teal", statuses: ["COMPLETED_LPO", "COMPLETED_NO_LPO"] },
];

/** Vendors & Purchases → Vendor Price Shares (RFQ management). */
export default function VendorPriceShares() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "list";
  const rfqId = params.get("rfq") ? Number(params.get("rfq")) : null;
  const { canCreate, canEdit, canDelete } = usePermissions() || {};
  const mayCreate = canCreate ? canCreate(RFQ_MODULE) : true;
  const mayEdit = canEdit ? canEdit(RFQ_MODULE) : true;
  const mayDelete = canDelete ? canDelete(RFQ_MODULE) : false;

  const [rfqs, setRfqs] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const navigateTo = useCallback((nextView, nextRfqId) => {
    const next = {};
    if (nextView && nextView !== "list") next.view = nextView;
    if (nextRfqId) next.rfq = String(nextRfqId);
    setParams(next);
  }, [setParams]);

  const refreshList = useCallback(async () => {
    try {
      setRfqs(await listRfqs());
    } catch (e) {
      toast.error(errorMessage(e, "Could not load RFQs"));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  // Load the RFQ the URL points at (comparison falls back to the newest RFQ).
  const wantedId = DETAIL_VIEWS.includes(view) ? (rfqId || (view === "comparison" ? rfqs[0]?.id : null)) : null;
  useEffect(() => {
    if (!wantedId) { setDetail(null); return; }
    if (detail?.id === wantedId) return;
    let cancelled = false;
    setDetailLoading(true);
    getRfq(wantedId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) { toast.error(errorMessage(e, "Could not load the RFQ")); navigateTo("list"); } })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedId]);

  /** Every mutation returns the fresh RFQ; keep the detail and the list row in step. */
  const applyDetail = useCallback((d) => {
    setDetail(d);
    refreshList();
  }, [refreshList]);

  const body = (() => {
    if (view === "create") {
      return <RfqCreateForm onCancel={() => navigateTo("list")} onSaved={(saved) => { applyDetail(saved); navigateTo("detail", saved.id); }} />;
    }
    if (view === "responses") {
      return <AllResponses rfqs={rfqs} initialRfqId={rfqId} canEdit={mayEdit}
        onBack={() => (rfqId ? navigateTo("detail", rfqId) : navigateTo("list"))}
        onNavigate={(v, id) => { setDetail(null); navigateTo(v, id); }} />;
    }
    if (DETAIL_VIEWS.includes(view)) {
      if (detailLoading || (wantedId && detail?.id !== wantedId)) {
        return <div className="flex items-center justify-center h-full text-slate-400 gap-2 text-sm"><Spinner className="w-5 h-5" /> Loading RFQ…</div>;
      }
      if (view === "comparison") {
        return <LpoComparison rfqs={rfqs} rfq={detail} onSelectRfq={(id) => navigateTo("comparison", id)}
          onBack={() => (rfqId ? navigateTo("detail", rfqId) : navigateTo("list"))} onNavigate={navigateTo} />;
      }
      if (!detail) return <EmptyState icon={Package} title="RFQ not found" />;
      const back = () => navigateTo("detail", detail.id);
      if (view === "edit") {
        return <RfqCreateForm initial={detail} onCancel={back} onSaved={(saved) => { applyDetail(saved); navigateTo("detail", saved.id); }} />;
      }
      if (view === "workspace") {
        return <QuotationWorkspace rfq={detail} canEdit={mayEdit} onChange={applyDetail} onBack={back} onNavigate={navigateTo} />;
      }
      if (view === "lpo-builder") {
        return <LpoBuilder key={detail.id} rfq={detail} onChange={applyDetail} onBack={back} onNavigate={navigateTo} />;
      }
      return <RfqDetail rfq={detail} canEdit={mayEdit} canDelete={mayDelete} onChange={applyDetail}
        onBack={() => navigateTo("list")} onEdit={() => navigateTo("edit", detail.id)}
        onDeleted={() => { setDetail(null); refreshList(); navigateTo("list"); }} onNavigate={navigateTo} />;
    }
    return <RfqList rfqs={rfqs} loading={listLoading} canCreate={mayCreate} onNavigate={navigateTo} />;
  })();

  return <div className="flex flex-col h-full min-h-[600px] bg-[#F7F7FA] font-sans text-slate-900 overflow-hidden">{body}</div>;
}

function RfqList({ rfqs, loading, canCreate, onNavigate }) {
  const { company } = useCompany() || {};
  const { activeBranch } = useBranch() || {};
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");

  const counts = useMemo(() => Object.fromEntries(SUMMARY_CARDS.map((c) => [
    c.key, c.statuses ? rfqs.filter((r) => c.statuses.includes(r.status)).length : rfqs.length,
  ])), [rfqs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const card = SUMMARY_CARDS.find((c) => c.key === cardFilter);
    return rfqs.filter((r) => {
      if (card?.statuses && !card.statuses.includes(r.status)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.rfqNumber, r.title, r.reference, ...r.vendors.map((v) => v.vendorName)].some((f) => String(f || "").toLowerCase().includes(q));
    });
  }, [rfqs, search, statusFilter, cardFilter]);

  const hasFilters = search || statusFilter !== "all" || cardFilter !== "all";

  const exportXlsx = () => exportTableToExcel("Vendor Price Shares - RFQs",
    ["RFQ Number", "Title", "Reference", "Created", "Deadline", "Items", "Vendors", "Responses", "Best Quote", "Status", "LPOs"],
    filtered.map((r) => [r.rfqNumber, r.title, r.reference, (r.createdAt || "").slice(0, 10), r.deadline, r.itemCount,
      r.vendors.map((v) => v.vendorName).join("; "), `${r.respondedCount}/${r.vendorCount}`, r.bestQuote != null ? Number(r.bestQuote) : "",
      RFQ_STATUS_META[r.status]?.label || r.status, r.lpoNumbers.join("; ")]),
    { companyProfile: company, branch: activeBranch?.name || "" }, [16, 34, 14, 12, 12, 8, 40, 11, 12, 20, 30]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares"]}
        icon={Handshake}
        title="Vendor Price Shares"
        badge={<span className="bg-[#FFF8E7] text-[#7B6100] text-xs px-2 py-0.5 rounded border border-[#FDE6A9] font-medium">{rfqs.length} RFQs</span>}
        subtitle="Request quotations, compare vendor prices, negotiate and convert the best offers into LPOs"
        actions={<>
          <button onClick={() => onNavigate("responses")} className={secondaryBtn}><Layers className="w-4 h-4" /> All Responses</button>
          <button onClick={() => onNavigate("comparison")} disabled={rfqs.length === 0} className={tealOutlineBtn}>
            <BarChart3 className="w-4 h-4" /> LPO Comparison
          </button>
          {canCreate && <button onClick={() => onNavigate("create")} className={primaryBtn}><Plus className="w-4 h-4" /> Create RFQ</button>}
        </>}
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6 space-y-4">
        {/* KPI cards — click to filter */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {SUMMARY_CARDS.map((card) => (
            <StatCard key={card.key} label={card.label} value={counts[card.key]} icon={card.icon} accent={card.accent}
              active={cardFilter === card.key && card.key !== "all"}
              onClick={() => setCardFilter(cardFilter === card.key ? "all" : card.key)} />
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-slate-200 flex-wrap">
            <SearchInput value={search} onChange={setSearch} placeholder="Search RFQ number, title, reference, vendor…" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
              <option value="all">All Statuses</option>
              {Object.entries(RFQ_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {hasFilters && (
              <button onClick={() => { setSearch(""); setStatusFilter("all"); setCardFilter("all"); }} className={`${secondaryBtn} text-slate-500`}>
                <X className="w-4 h-4" /> Clear
              </button>
            )}
            <button onClick={exportXlsx} disabled={filtered.length === 0} className={secondaryBtn}><Download className="w-4 h-4" /> Export</button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400"><Spinner className="w-6 h-6" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Package} title={rfqs.length ? "No RFQs match the filters" : "No RFQs yet"}
              hint={rfqs.length ? "Try clearing the search or status filter." : "Create an RFQ to collect prices from several vendors at once."}
              action={canCreate && rfqs.length === 0 && (
                <button onClick={() => onNavigate("create")} className={`${primaryBtn} mt-4`}><Plus className="w-4 h-4" /> Create your first RFQ</button>
              )} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className={theadCls}>
                  <tr>
                    <th className="px-3 py-3 text-center text-slate-500 w-12 font-medium uppercase">S.No.</th>
                    {["RFQ No.", "Title", "Created", "Deadline", "Items", "Vendors", "Responses", "Best Quote", "Status", "LPOs", ""].map((h, i) => (
                      <th key={h || i} className={`${thCls} ${["Items", "Responses"].includes(h) ? "text-center" : ""} ${h === "Best Quote" ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((rfq, idx) => {
                    const overdue = isPastDate(rfq.deadline) && !isClosed(rfq.status);
                    const allIn = rfq.respondedCount === rfq.vendorCount && rfq.vendorCount > 0;
                    return (
                      <tr key={rfq.id} onClick={() => onNavigate("detail", rfq.id)}
                        className="hover:bg-[#FFFDF5] cursor-pointer transition-colors">
                        <td className="px-3 py-3 text-center text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-[#a16207]">{rfq.rfqNumber}</td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900 font-medium text-sm max-w-[240px] truncate">{rfq.title}</div>
                          {rfq.reference && <div className="text-slate-400 text-[11px]">Ref: {rfq.reference}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(rfq.createdAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={overdue ? "text-red-600 font-medium" : "text-slate-600"}>{fmtDate(rfq.deadline)}</span>
                          {overdue && <div className="text-[10px] text-red-500">Overdue</div>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-900">{rfq.itemCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex -space-x-1.5">
                            {rfq.vendors.slice(0, 4).map((v) => <VendorAvatar key={v.vendorId} vendorId={v.vendorId} name={v.vendorName} size="md" />)}
                            {rfq.vendors.length > 4 && (
                              <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-600 ring-2 ring-white">+{rfq.vendors.length - 4}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-semibold ${allIn ? "text-[#327F74]" : rfq.respondedCount > 0 ? "text-amber-600" : "text-slate-500"}`}>
                              {rfq.respondedCount}/{rfq.vendorCount}
                            </span>
                            <div className="w-12 h-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${allIn ? "bg-[#327F74]" : "bg-amber-400"}`}
                                style={{ width: `${rfq.vendorCount ? (rfq.respondedCount / rfq.vendorCount) * 100 : 0}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {rfq.bestQuote != null ? <span className="text-emerald-700 font-semibold">{fmtMoney(rfq.bestQuote)}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap"><RfqStatusBadge status={rfq.status} /></td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {rfq.lpoNumbers.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {rfq.lpoNumbers.slice(0, 2).map((l) => <span key={l} className="text-[11px] text-[#327F74] font-medium">{l}</span>)}
                              {rfq.lpoNumbers.length > 2 && <span className="text-[10px] text-slate-500">+{rfq.lpoNumbers.length - 2} more</span>}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => onNavigate("detail", rfq.id)} className={rowActionBtn} title="Open RFQ"><Eye className="w-3.5 h-3.5" /> View</button>
                            <button onClick={() => onNavigate("responses", rfq.id)} className={rowActionBtn} title="Vendor responses"><Layers className="w-3.5 h-3.5" /> Responses</button>
                            <button onClick={() => onNavigate("workspace", rfq.id)} className={rowActionBtn} title="Compare quotes"><Scale className="w-3.5 h-3.5" /> Compare</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-200 bg-[#F7F7FA] text-xs text-slate-500">
              Showing {filtered.length} of {rfqs.length} RFQ{rfqs.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
