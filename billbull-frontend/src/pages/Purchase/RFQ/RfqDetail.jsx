import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Send, Mail, MessageSquare, Copy, Check, Package, Users, Layers, BarChart3, ShoppingCart, Activity,
  CheckCircle, FileText, Eye, ArrowUpRight, RefreshCw, TrendingUp, History, Edit3, Trash2, Reply, ClipboardEdit,
  AlertTriangle, ExternalLink, Phone, Shield, Link2, LogIn, Scale, CalendarClock, Truck, Info, StickyNote, X,
} from "lucide-react";
import { changeRfqStatus, deleteRfq, recordNegotiationReply, sendRfq, vendorPortalLink } from "../../../api/purchase/rfqApi";
import { useCompany } from "@billbull/shared/context/CompanyContext";
import QuoteEntryDrawer from "./QuoteEntryDrawer";
import {
  RfqStatusBadge, VendorAvatar, Modal, NegotiationReplyModal, EmptyState, PageHeader, PillTabs, Stepper, StatCard, SectionCard,
  primaryBtn, secondaryBtn, tealOutlineBtn, amberOutlineBtn, inputCls, Spinner,
} from "./RfqShared";
import {
  MANUAL_STATUSES, NEGOTIATION_STATUS_META, RESPONSE_STATUS_META, RFQ_STATUS_META, STATUSES_NEEDING_REASON, WORKFLOW_STEPS,
  buildVendorMessage, errorMessage, fmtDate, fmtDateTime, fmtMoney, hasResponded, isClosed, isComparable, isPastDate, mailtoLink, num,
  offersForItem, whatsappLink,
} from "./rfqUtils";

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "items", label: "Requested Items", icon: Package },
  { id: "vendors", label: "Vendors & Quotes", icon: Users },
  { id: "responses", label: "All Responses", icon: Layers, external: true },
  { id: "comparison", label: "Price Comparison", icon: TrendingUp, external: true },
  { id: "negotiations", label: "Negotiations", icon: MessageSquare },
  { id: "lpo", label: "LPO & Orders", icon: ShoppingCart },
  { id: "activity", label: "Activity History", icon: Activity },
];

export default function RfqDetail({ rfq, canEdit, canDelete, onChange, onBack, onEdit, onDeleted, onNavigate }) {
  const [tab, setTab] = useState("overview");
  const [showSend, setShowSend] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [quoteVendor, setQuoteVendor] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const closed = isClosed(rfq.status);
  const editable = canEdit && !closed;
  const currency = rfq.currency || "AED";
  const openNegs = rfq.negotiations.filter((n) => n.status === "REQUESTED").length;

  const openTab = (id) => {
    if (id === "responses") onNavigate("responses", rfq.id);
    else if (id === "comparison") onNavigate("comparison", rfq.id);
    else setTab(id);
  };

  const remove = async () => {
    if (!window.confirm(`Delete draft ${rfq.rfqNumber}? This cannot be undone.`)) return;
    try {
      await deleteRfq(rfq.id);
      toast.success(`${rfq.rfqNumber} deleted`);
      onDeleted();
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the RFQ"));
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        crumbs={["Vendor Price Shares", rfq.rfqNumber]}
        icon={FileText}
        title={rfq.title}
        badge={<RfqStatusBadge status={rfq.status} />}
        onBack={onBack}
        subtitle={
          <span className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="font-mono font-semibold text-[#a16207]">{rfq.rfqNumber}</span>
            <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {rfq.items.length} item{rfq.items.length !== 1 ? "s" : ""}</span>
            <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {rfq.vendors.length} vendor{rfq.vendors.length !== 1 ? "s" : ""}</span>
            <span className={`inline-flex items-center gap-1 ${isPastDate(rfq.deadline) && !closed ? "text-red-600 font-medium" : ""}`}>
              <CalendarClock className="w-3.5 h-3.5" /> Deadline {fmtDate(rfq.deadline)}
            </span>
          </span>
        }
        actions={<>
          {rfq.status === "DRAFT" && canEdit && <button onClick={onEdit} className={secondaryBtn}><Edit3 className="w-4 h-4" /> Edit</button>}
          {rfq.status === "DRAFT" && canDelete && <button onClick={remove} className={`${secondaryBtn} hover:text-red-600 hover:border-red-200`}><Trash2 className="w-4 h-4" /> Delete</button>}
          <button onClick={() => onNavigate("workspace", rfq.id)} className={amberOutlineBtn}><Scale className="w-4 h-4" /> Quote Workspace</button>
          {editable && <button onClick={() => setShowSend(true)} className={tealOutlineBtn}><Send className="w-4 h-4" /> Send to Vendors</button>}
          {canEdit && <button onClick={() => setShowStatus(true)} className={primaryBtn}><RefreshCw className="w-4 h-4" /> Update Status</button>}
        </>}
      >
        <div className="space-y-3">
          <WorkflowProgress status={rfq.status} />
          <PillTabs active={tab} onChange={openTab}
            tabs={TABS.map((t) => ({ ...t, count: t.id === "negotiations" ? openNegs : undefined }))} />
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        {tab === "overview" && <OverviewTab rfq={rfq} onTab={openTab} />}
        {tab === "items" && <ItemsTab rfq={rfq} />}
        {tab === "vendors" && <VendorsTab rfq={rfq} editable={editable} onRecordQuote={setQuoteVendor} onSend={() => setShowSend(true)} />}
        {tab === "negotiations" && <NegotiationsTab rfq={rfq} editable={editable} onReply={setReplyTarget} />}
        {tab === "lpo" && <LpoTab rfq={rfq} editable={editable} onBuild={() => onNavigate("lpo-builder", rfq.id)} />}
        {tab === "activity" && <ActivityTab rfq={rfq} />}
      </div>

      {showSend && <SendModal rfq={rfq} onChange={onChange} onClose={() => setShowSend(false)} />}
      {showStatus && <StatusModal rfq={rfq} onChange={onChange} onClose={() => setShowStatus(false)} />}
      {quoteVendor && (
        <QuoteEntryDrawer rfq={rfq} vendor={quoteVendor} onSaved={(d) => { onChange(d); setQuoteVendor(d.vendors.find((v) => v.id === quoteVendor.id) || null); }}
          onClose={() => setQuoteVendor(null)} />
      )}
      {replyTarget && (
        <NegotiationReplyModal
          negotiation={replyTarget.negotiation}
          vendorName={replyTarget.vendorName}
          itemName={replyTarget.itemName}
          currency={currency}
          onClose={() => setReplyTarget(null)}
          onSave={async (payload) => {
            try {
              onChange(await recordNegotiationReply(rfq.id, replyTarget.negotiation.id, payload));
              toast.success("Vendor reply recorded");
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

function WorkflowProgress({ status }) {
  const current = WORKFLOW_STEPS.findIndex((s) => s.keys.includes(status));
  const stopped = ["CANCELLED", "REJECTED", "EXPIRED"].includes(status);
  const allDone = current === WORKFLOW_STEPS.length - 1 && status !== "PARTIAL_ORDERED";
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Stepper steps={WORKFLOW_STEPS.map((s) => s.label)} current={Math.max(current, 0)} stopped={stopped} allDone={allDone} />
      {stopped && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {RFQ_STATUS_META[status].label}
        </span>
      )}
    </div>
  );
}

/** Thin wrapper so the tabs below keep their simple `title / action` API. */
function Card({ title, action, children, className = "", icon }) {
  return <SectionCard title={title} action={action} icon={icon} className={className}>{children}</SectionCard>;
}

function DetailField({ label, value, wide = false }) {
  return (
    <div className={wide ? "col-span-2 md:col-span-3" : ""}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}

function OverviewTab({ rfq, onTab }) {
  const responded = rfq.vendors.filter((v) => hasResponded(v.responseStatus)).length;
  const openNegs = rfq.negotiations.filter((n) => n.status === "REQUESTED").length;
  const awarded = rfq.items.filter((i) => i.awardedOfferId).length;
  const metrics = [
    { label: "Requested Items", value: rfq.items.length, icon: Package, accent: "yellow", tab: "items" },
    { label: "Responses Received", value: `${responded}/${rfq.vendors.length}`, icon: CheckCircle, accent: "emerald", tab: "vendors" },
    { label: "Open Negotiations", value: openNegs, icon: MessageSquare, accent: "pink", tab: "negotiations" },
    { label: "Items Awarded", value: `${awarded}/${rfq.items.length}`, icon: ShoppingCart, accent: "teal", tab: "lpo" },
  ];
  const notes = [
    ["Shipping Requirements", rfq.shippingReqs, Truck],
    ["Vendor Instructions", rfq.vendorInstructions, Info],
    ["Internal Notes", rfq.notes, StickyNote],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-4 max-w-7xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} icon={m.icon} accent={m.accent} onClick={() => onTab(m.tab)} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4">
          <Card title="RFQ Details" icon={FileText}>
            <div className="space-y-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2.5">General</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                  <DetailField label="RFQ Number" value={<span className="font-mono">{rfq.rfqNumber}</span>} />
                  <DetailField label="Reference" value={rfq.reference || "—"} />
                  <DetailField label="Created By" value={rfq.createdBy || "—"} />
                  <DetailField label="Created" value={fmtDateTime(rfq.createdAt)} />
                  <DetailField label="Sent" value={rfq.sentAt ? fmtDateTime(rfq.sentAt) : "Not yet"} />
                  <DetailField label="Submission Deadline" value={fmtDate(rfq.deadline)} />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2.5">Delivery</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                  <DetailField label="Expected Delivery" value={fmtDate(rfq.expectedDelivery)} />
                  <DetailField label="Warehouse" value={rfq.warehouseName || "—"} />
                  <DetailField label="Delivery Location" value={rfq.deliveryLocation || "—"} />
                  <DetailField label="Branch" value={rfq.branchName || "—"} wide />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2.5">Commercial Terms</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                  <DetailField label="Currency" value={rfq.currency} />
                  <DetailField label="Payment Terms" value={rfq.paymentTerms || "—"} />
                  <DetailField label="Delivery Terms" value={rfq.deliveryTerms || "—"} />
                  <DetailField label="Tax Preference" value={rfq.taxPref || "—"} />
                  <DetailField label="Quotation Validity" value={rfq.quotationValidity || "—"} />
                </div>
              </div>
            </div>
          </Card>
          {notes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {notes.map(([label, text, Icon]) => (
                <div key={label} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5"><Icon className="w-3.5 h-3.5 text-[#C99A12]" /> {label}</div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Vendor Responses" icon={Users}
            action={<button onClick={() => onTab("vendors")} className="text-xs font-medium text-[#a16207] hover:underline flex items-center gap-1">Manage <ArrowUpRight className="w-3 h-3" /></button>}>
            <div className="-my-2">
              {rfq.vendors.map((v) => {
                const st = RESPONSE_STATUS_META[v.responseStatus] || RESPONSE_STATUS_META.PENDING;
                return (
                  <div key={v.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                    <VendorAvatar vendorId={v.vendorId} name={v.vendorName} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate" title={v.vendorName}>{v.vendorName}</div>
                      <div className="text-xs text-slate-500">
                        {v.submittedAt ? `Responded ${fmtDateTime(v.submittedAt)}` : "Not yet responded"}
                        {v.offers.length > 0 && ` · ${v.offers.length} offer${v.offers.length !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          {rfq.lpos.length > 0 && (
            <Card title="LPOs Created" icon={ShoppingCart}>
              {rfq.lpos.map((l) => (
                <div key={l.lpoNumber} className="flex items-center gap-2 text-sm py-1">
                  <CheckCircle className="w-4 h-4 text-[#327F74]" /><span className="text-[#327F74] font-semibold">{l.lpoNumber}</span>
                  <span className="text-xs text-slate-500 truncate">{l.vendorName} · {fmtDateTime(l.createdOn)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemsTab({ rfq }) {
  const currency = rfq.currency || "AED";
  return (
    <div className="space-y-3 max-w-6xl">
      {rfq.items.map((item, idx) => {
        const offers = offersForItem(rfq, item.id).filter((c) => isComparable(c.offer));
        const best = offers.length ? Math.min(...offers.map((c) => num(c.offer.unitPrice))) : null;
        return (
          <div key={item.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-[#FFF8E7] flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-[#a16207]">{idx + 1}</div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.itemName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{[item.itemCode, item.category].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-900">{item.qtyNeeded} {item.unit}</div>
                {best != null && <div className="text-xs text-emerald-600">Best: {fmtMoney(best, currency)}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs border-t border-slate-100 pt-3 text-slate-500">
              <div>Item Code: <span className="text-slate-900">{item.itemCode || "—"}</span></div>
              <div>Needed by: <span className="text-slate-900">{fmtDate(item.expectedDelivery)}</span></div>
              <div>Warranty: <span className="text-slate-900">{item.warrantyRequired || "—"}</span></div>
              <div>Alt brand: <span className={item.altBrandAllowed ? "text-emerald-600" : "text-red-600"}>{item.altBrandAllowed ? "Allowed" : "Not allowed"}</span></div>
              <div>Partial: <span className={item.partialAllowed ? "text-emerald-600" : "text-red-600"}>{item.partialAllowed ? "Allowed" : "Not allowed"}</span></div>
              <div>Ordered: <span className={item.qtyOrdered > 0 ? "text-[#327F74] font-semibold" : "text-slate-400"}>{item.qtyOrdered}/{item.qtyNeeded}</span></div>
            </div>
            {item.minSpec && <div className="mt-2 text-xs text-slate-500">Min spec: <span className="text-slate-800">{item.minSpec}</span></div>}
            <div className="mt-3 pt-3 border-t border-slate-100">
              {offers.length === 0 ? <span className="text-xs text-slate-400">No offers received yet</span> : (
                <div className="flex flex-wrap gap-2">
                  {offers.map(({ vendor, offer }) => (
                    <span key={offer.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200">
                      <VendorAvatar vendorId={vendor.vendorId} name={vendor.vendorName} />
                      <span className="text-[10px] text-slate-500">{vendor.vendorCode || vendor.vendorName}</span>
                      <span className="text-[10px] font-semibold text-slate-900">{fmtMoney(offer.unitPrice, currency)}</span>
                      {num(offer.unitPrice) === best && <span className="text-[9px] text-emerald-600">Best</span>}
                      {item.awardedOfferId === offer.id && <span className="text-[9px] text-white bg-[#327F74] px-1 rounded">Awarded</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VendorsTab({ rfq, editable, onRecordQuote, onSend }) {
  return (
    <div className="space-y-3 max-w-6xl">
      {rfq.status === "DRAFT" && editable && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#FFF8E7] border border-[#FDE6A9] text-xs text-slate-700">
          <span>This RFQ is still a draft. Send it to the vendors, then record each quotation here as it arrives.</span>
          <button onClick={onSend} className={primaryBtn}><Send className="w-3.5 h-3.5" /> Send</button>
        </div>
      )}
      {rfq.vendors.map((v) => {
        const st = RESPONSE_STATUS_META[v.responseStatus] || RESPONSE_STATUS_META.PENDING;
        const quotedItems = new Set(v.offers.filter((o) => num(o.unitPrice) > 0).map((o) => o.rfqItemId)).size;
        return (
          <div key={v.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <VendorAvatar vendorId={v.vendorId} name={v.vendorName} size="lg" />
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-semibold text-slate-900">{v.vendorName}</div>
                <div className="text-xs text-slate-500">{[v.vendorCode, v.email, v.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
                <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${v.portalLastAccessAt ? "text-[#327F74]" : "text-slate-400"}`}>
                  <Shield className="w-3 h-3" />
                  {v.portalLastAccessAt ? `Vendor portal: last signed in ${fmtDateTime(v.portalLastAccessAt)}` : "Vendor portal: not opened yet"}
                </div>
              </div>
              <div className="text-right mr-2">
                <div className={`text-xs font-semibold ${st.cls}`}>{st.label}{v.version ? ` · v${v.version}` : ""}</div>
                <div className="text-[10px] text-slate-500">{quotedItems}/{rfq.items.length} items quoted{v.submittedAt ? ` · ${fmtDateTime(v.submittedAt)}` : ""}</div>
              </div>
              {editable && (
                <button onClick={() => onRecordQuote(v)} className={hasResponded(v.responseStatus) ? tealOutlineBtn : primaryBtn}>
                  <ClipboardEdit className="w-3.5 h-3.5" /> {hasResponded(v.responseStatus) ? "Update Quote" : "Record Quote"}
                </button>
              )}
            </div>
            {(v.paymentTerms || v.deliveryTerms || v.validity) && hasResponded(v.responseStatus) && (
              <div className="grid grid-cols-3 gap-3 text-xs border-t border-slate-100 pt-3 mt-3 text-slate-500">
                <div>Payment: <span className="text-slate-900">{v.paymentTerms || "—"}</span></div>
                <div>Delivery: <span className="text-slate-900">{v.deliveryTerms || "—"}</span></div>
                <div>Quote valid until: <span className="text-slate-900">{fmtDate(v.validity)}</span></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NegotiationsTab({ rfq, editable, onReply }) {
  const currency = rfq.currency || "AED";
  if (rfq.negotiations.length === 0) {
    return <EmptyState icon={MessageSquare} title="No price negotiations yet" hint="Use Negotiate in the Quote Workspace to ask a vendor for a better price." />;
  }
  return (
    <div className="space-y-4 max-w-5xl">
      {[...rfq.negotiations].reverse().map((neg) => {
        const vendor = rfq.vendors.find((v) => v.vendorId === neg.vendorId);
        const item = rfq.items.find((i) => i.id === neg.rfqItemId);
        const meta = NEGOTIATION_STATUS_META[neg.status] || NEGOTIATION_STATUS_META.REQUESTED;
        const diff = neg.revisedPrice != null ? num(neg.revisedPrice) - num(neg.previousPrice) : null;
        const pct = diff !== null && num(neg.previousPrice) ? (diff / num(neg.previousPrice)) * 100 : null;
        return (
          <div key={neg.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex items-center gap-3">
                <VendorAvatar vendorId={neg.vendorId} name={vendor?.vendorName} size="md" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">{vendor?.vendorName || "Vendor"}</div>
                  <div className="text-xs text-slate-500">{item?.itemName}{neg.deadline ? ` · reply by ${fmtDate(neg.deadline)}` : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
                {neg.status === "REQUESTED" && editable && (
                  <button onClick={() => onReply({ negotiation: neg, vendorName: vendor?.vendorName, itemName: item?.itemName })}
                    className={amberOutlineBtn}>
                    <Reply className="w-3 h-3" /> Record Reply
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 bg-slate-50 rounded-lg p-3 mb-4 text-center">
              <div><div className="text-[10px] text-slate-500">Quoted Price</div><div className="text-sm font-bold text-slate-900">{fmtMoney(neg.previousPrice, currency)}</div></div>
              <div><div className="text-[10px] text-slate-500">Target Price</div><div className="text-sm font-bold text-[#a16207]">{fmtMoney(neg.targetPrice, currency)}</div></div>
              <div>
                <div className="text-[10px] text-slate-500">Final Price</div>
                <div className={`text-sm font-bold ${neg.revisedPrice != null ? (diff < 0 ? "text-emerald-600" : "text-red-500") : "text-slate-400"}`}>
                  {neg.revisedPrice != null ? fmtMoney(neg.revisedPrice, currency) : "—"}
                </div>
                {pct !== null && <div className={`text-[10px] ${diff < 0 ? "text-emerald-600" : "text-red-500"}`}>{diff < 0 ? "▼" : "▲"} {Math.abs(pct).toFixed(1)}%</div>}
              </div>
            </div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-2">History</div>
            <div className="space-y-2">
              {(neg.history || []).map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F5C742]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-900 capitalize">{ev.type}</span>
                      {ev.price != null && <span className="text-xs text-[#a16207]">{fmtMoney(ev.price, currency)}</span>}
                      <span className="text-[10px] text-slate-400 ml-auto">{fmtDateTime(ev.at)}</span>
                    </div>
                    {ev.message && <p className="text-xs text-slate-500 mt-0.5">{ev.message}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LpoTab({ rfq, editable, onBuild }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">LPO & Purchase Orders</h3>
          <p className="text-xs text-slate-500 mt-0.5">Ordered quantities and what is still left to buy</p>
        </div>
        {editable && <button onClick={onBuild} className={primaryBtn}><ShoppingCart className="w-3.5 h-3.5" /> Prepare LPO</button>}
      </div>
      {rfq.lpos.length > 0 && (
        <Card title="Created LPOs">
          {rfq.lpos.map((l) => (
            <button key={l.lpoNumber} onClick={() => navigate("/purchases/lpo", { state: { lpoNumber: l.lpoNumber } })}
              className="w-full flex items-center gap-2 text-xs py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-left">
              <CheckCircle className="w-3.5 h-3.5 text-[#327F74]" />
              <span className="text-[#327F74] font-semibold">{l.lpoNumber}</span>
              <span className="text-slate-500 flex-1">{l.vendorName} · {fmtDateTime(l.createdOn)}</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          ))}
        </Card>
      )}
      <Card title="Item Order Status">
        <div className="space-y-3">
          {rfq.items.map((item) => {
            const pct = item.qtyNeeded > 0 ? Math.min(100, (item.qtyOrdered / item.qtyNeeded) * 100) : 0;
            const remaining = item.qtyNeeded - item.qtyOrdered;
            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-900 font-medium">{item.itemName}</span>
                  <span className={remaining <= 0 ? "text-[#327F74]" : item.qtyOrdered > 0 ? "text-amber-600" : "text-slate-500"}>
                    {item.qtyOrdered}/{item.qtyNeeded} {item.unit} — {remaining > 0 ? `${remaining} remaining` : "Fully ordered"}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#327F74" : "#F59E0B" }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

const ACTIVITY_ICONS = {
  created: FileText, updated: Edit3, sent: Send, vendor_added: Users, quote_submitted: CheckCircle, quote_declined: AlertTriangle, portal_opened: LogIn, invitation_emailed: Mail,
  negotiation_requested: MessageSquare, negotiation_declined: MessageSquare, price_revised: TrendingUp, status_changed: RefreshCw,
  lpo_created: ShoppingCart, item_awarded: CheckCircle, award_removed: Eye,
};

function ActivityTab({ rfq }) {
  if (rfq.activity.length === 0) return <EmptyState icon={History} title="No activity recorded yet" />;
  return (
    <div className="space-y-2 max-w-4xl">
      {rfq.activity.map((ev, idx) => {
        const Icon = ACTIVITY_ICONS[ev.type] || Activity;
        const tint = ev.actorType === "vendor" || ev.actorType === "vendor_portal" ? "#327F74" : ev.actorType === "system" ? "#64748b" : "#C99A12";
        const who = ev.actorType === "vendor_portal" ? `${ev.actor} · via vendor portal`
          : ev.actorType === "vendor" ? `Recorded by ${ev.actor} (vendor reply)` : ev.actor;
        return (
          <div key={ev.id} className={`flex items-start gap-3 relative ${idx < rfq.activity.length - 1 ? "pb-3" : ""}`}>
            {idx < rfq.activity.length - 1 && <div className="absolute left-[14px] top-7 bottom-0 w-px bg-slate-200" />}
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${tint}1f` }}>
              <Icon className="w-3.5 h-3.5" style={{ color: tint }} />
            </div>
            <div className="flex-1 bg-white rounded-lg border border-slate-100 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-900">{ev.description}</span>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtDateTime(ev.at)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-500">{who}</span>
                {ev.oldValue && <span className="text-[10px] text-red-400 line-through">{ev.oldValue}</span>}
                {ev.newValue && <span className="text-[10px] text-emerald-600">→ {ev.newValue}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Send the RFQ: email every vendor its personal portal link from the server, and/or share the
 * link yourself over WhatsApp / copy-paste. Each vendor only ever sees its own link and prices.
 */
function SendModal({ rfq, onChange, onClose }) {
  const { company } = useCompany() || {};
  const companyName = company?.companyName || "Procurement Team";
  const [copied, setCopied] = useState(null);
  const [saving, setSaving] = useState(null);
  const [results, setResults] = useState(null);
  const [previewId, setPreviewId] = useState(rfq.vendors[0]?.id);
  const [showPreview, setShowPreview] = useState(false);
  const subject = `Request for Quotation ${rfq.rfqNumber} — ${rfq.title}`;
  const withEmail = rfq.vendors.filter((v) => v.email).length;
  const withPhone = rfq.vendors.filter((v) => v.phone).length;
  const noContact = rfq.vendors.filter((v) => !v.email && !v.phone).length;
  const opened = rfq.vendors.filter((v) => v.portalLastAccessAt).length;
  const messageFor = (v) => (v ? buildVendorMessage(rfq, v, companyName, vendorPortalLink(v.portalToken)) : "");
  const previewVendor = rfq.vendors.find((v) => v.id === previewId) || rfq.vendors[0];
  const isDraft = rfq.status === "DRAFT";

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  const send = async (emailVendors) => {
    setSaving(emailVendors ? "email" : "mark");
    try {
      const res = await sendRfq(rfq.id, {
        channel: emailVendors ? "email (portal invitation)" : "manual / WhatsApp",
        emailVendors,
        portalBaseUrl: window.location.origin,
      });
      onChange(res.rfq);
      if (emailVendors) {
        setResults(res.emails);
        const ok = res.emails.filter((r) => r.sent).length;
        if (ok === res.emails.length) toast.success(`Invitations emailed to ${ok} vendor${ok !== 1 ? "s" : ""}`);
        else toast.error(`${res.emails.length - ok} invitation(s) could not be emailed — see the list`);
      } else {
        toast.success(isDraft ? "RFQ marked as sent" : "Re-send recorded");
        onClose();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  const actionCls = "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap";
  const enabledCls = "border-slate-200 bg-white text-slate-700 hover:border-[#F5C742] hover:bg-[#FFF8E7]";
  const disabledCls = "border-slate-100 bg-slate-50 text-slate-300 pointer-events-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onMouseDown={onClose}>
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 bg-gradient-to-r from-[#FFF8E7] to-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-10 h-10 rounded-lg bg-[#F5C742] flex items-center justify-center shrink-0 shadow-sm"><Send className="w-5 h-5 text-slate-900" /></span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Send RFQ to Vendors</h3>
                <p className="text-xs text-slate-600 mt-0.5 truncate">
                  <span className="font-mono font-semibold text-[#a16207]">{rfq.rfqNumber}</span> · {rfq.title} · quotes due {fmtDate(rfq.deadline)}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white" aria-label="Close"><X className="w-4 h-4 text-slate-500" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <SendStat icon={Users} label="Vendors" value={rfq.vendors.length} />
            <SendStat icon={Mail} label="Can be emailed" value={withEmail} tone={withEmail === rfq.vendors.length ? "teal" : "amber"} />
            <SendStat icon={Phone} label="WhatsApp-ready" value={withPhone} />
            <SendStat icon={LogIn} label="Opened portal" value={opened} tone={opened ? "teal" : "slate"} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* How it works */}
          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-slate-100">
            {[
              [Link2, "Private link", "Each vendor gets its own portal link — vendors never see each other or each other's prices."],
              [Shield, "One-time code", "Opening the link emails a 6-digit code to the address on the vendor record."],
              [ClipboardEdit, "Vendor quotes", "Prices land straight in this RFQ, ready to compare. You can still record quotes yourself."],
            ].map(([Icon, title, text], i) => (
              <div key={title} className="flex items-start gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[#327F74]/10 text-[#327F74] flex items-center justify-center shrink-0 text-xs font-bold">{i + 1}</span>
                <div>
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1"><Icon className="w-3.5 h-3.5 text-[#327F74]" /> {title}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Vendors */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendors</h4>
              {noContact > 0 && (
                <span className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {noContact} without email or phone — copy their link</span>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {rfq.vendors.map((v) => {
                const link = vendorPortalLink(v.portalToken);
                const result = results?.find((r) => r.rfqVendorId === v.id);
                const resp = RESPONSE_STATUS_META[v.responseStatus] || RESPONSE_STATUS_META.PENDING;
                return (
                  <div key={v.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <VendorAvatar vendorId={v.vendorId} name={v.vendorName} size="md" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate" title={v.vendorName}>{v.vendorName}</div>
                        <div className="flex items-center gap-3 text-[11px] mt-0.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 ${v.email ? "text-slate-600" : "text-amber-600"}`}><Mail className="w-3 h-3" /> {v.email || "No email"}</span>
                          <span className={`inline-flex items-center gap-1 ${v.phone ? "text-slate-600" : "text-slate-400"}`}><Phone className="w-3 h-3" /> {v.phone || "No phone"}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] font-semibold ${resp.cls}`}>{resp.label}</span>
                          {v.portalLastAccessAt && <span className="text-[10px] text-[#327F74]">· Opened portal {fmtDateTime(v.portalLastAccessAt)}</span>}
                          {result && (
                            <span title={result.error || ""} className={`text-[10px] px-1.5 py-0.5 rounded border ${result.sent ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                              {result.sent ? "Invitation emailed" : `Not emailed: ${result.error}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <button onClick={() => link && copy(`link-${v.id}`, link)} disabled={!link} title="Copy this vendor's portal link"
                        className={`${actionCls} ${link ? enabledCls : disabledCls}`}>
                        {copied === `link-${v.id}` ? <Check className="w-3.5 h-3.5 text-[#327F74]" /> : <Link2 className="w-3.5 h-3.5" />} {copied === `link-${v.id}` ? "Copied" : "Copy link"}
                      </button>
                      <a href={v.phone ? whatsappLink(v.phone, messageFor(v)) : undefined} target="_blank" rel="noreferrer"
                        title={v.phone ? "Open WhatsApp with the invitation" : "No phone number on the vendor record"}
                        className={`${actionCls} ${v.phone ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : disabledCls}`}>
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                      <a href={v.email ? mailtoLink(v.email, subject, messageFor(v)) : undefined}
                        title={v.email ? "Open in your own email app" : "No email on the vendor record"}
                        className={`${actionCls} ${v.email ? enabledCls : disabledCls}`}>
                        <ExternalLink className="w-3.5 h-3.5" /> Mail app
                      </a>
                      <button onClick={() => copy(v.id, messageFor(v))} title="Copy the full invitation text"
                        className={`${actionCls} ${enabledCls}`}>
                        {copied === v.id ? <Check className="w-3.5 h-3.5 text-[#327F74]" /> : <Copy className="w-3.5 h-3.5" />} {copied === v.id ? "Copied" : "Copy text"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message preview */}
            <div className="mt-4 rounded-lg border border-slate-200">
              <button type="button" onClick={() => setShowPreview((s) => !s)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Preview invitation message</span>
                <span className="text-slate-400">{showPreview ? "Hide" : "Show"}</span>
              </button>
              {showPreview && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-slate-500">As sent to</span>
                    <select value={previewVendor?.id} onChange={(e) => setPreviewId(Number(e.target.value))}
                      className="h-7 bg-white border border-slate-300 rounded-md px-2 text-xs max-w-[320px]">
                      {rfq.vendors.map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-1">Subject: <span className="text-slate-800 font-medium">{subject}</span></div>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-sans text-xs text-slate-700 max-h-64 overflow-y-auto">
                    {messageFor(previewVendor)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-wrap">
          <button onClick={onClose} className={secondaryBtn}>Close</button>
          <span className="text-[11px] text-slate-500 mr-auto hidden md:inline">
            {withEmail < rfq.vendors.length ? `${rfq.vendors.length - withEmail} vendor(s) won't get an email — share their link instead.` : "Every vendor will receive an email."}
          </span>
          <button onClick={() => send(false)} disabled={!!saving} className={secondaryBtn} title="Use after sharing the links yourself">
            {saving === "mark" ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {isDraft ? "Mark as Sent" : "Record Re-send"}
          </button>
          <button onClick={() => send(true)} disabled={!!saving || withEmail === 0} className={primaryBtn}>
            {saving === "email" ? <Spinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} Email {withEmail} Invitation{withEmail !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function SendStat({ icon: Icon, label, value, tone = "slate" }) {
  const tones = { slate: "text-slate-900", teal: "text-[#327F74]", amber: "text-amber-600" };
  return (
    <div className="bg-white/80 rounded-lg border border-[#FDE6A9] px-3 py-2 flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-[#C99A12] shrink-0" />
      <div>
        <div className={`text-base font-bold leading-none ${tones[tone]}`}>{value}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function StatusModal({ rfq, onChange, onClose }) {
  const [selected, setSelected] = useState(rfq.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const needsReason = STATUSES_NEEDING_REASON.includes(selected);

  const save = async () => {
    if (needsReason && !reason.trim()) { toast.error("Please give a reason"); return; }
    setSaving(true);
    try {
      onChange(await changeRfqStatus(rfq.id, selected, reason));
      toast.success(`Status updated to ${RFQ_STATUS_META[selected].label}`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Change RFQ Status"
      subtitle="Completed w/ LPO is set automatically when LPOs cover every item."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button onClick={save} disabled={saving || selected === rfq.status} className={primaryBtn}>{saving && <Spinner className="w-3.5 h-3.5" />} Update Status</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {MANUAL_STATUSES.map((s) => {
          const meta = RFQ_STATUS_META[s];
          return (
            <button key={s} onClick={() => setSelected(s)}
              className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${selected === s ? "border-[#F5C742] bg-[#FFF8E7]" : "border-slate-200 hover:border-slate-300"}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
              <span className="text-slate-900 text-left">{meta.label}</span>
              {selected === s && <Check className="w-3 h-3 text-[#a16207] ml-auto" />}
            </button>
          );
        })}
      </div>
      {needsReason && (
        <div className="mt-4">
          <label className="block text-[11px] text-slate-500 mb-1.5">Reason *</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} resize-none`} />
        </div>
      )}
    </Modal>
  );
}
