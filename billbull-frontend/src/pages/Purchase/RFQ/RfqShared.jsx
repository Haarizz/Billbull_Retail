import React, { useState } from "react";
import {
  X, Minus, Plus, Send, Info, TrendingDown, Loader2, ChevronRight, ArrowLeft, ArrowUpRight, Check, Search,
} from "lucide-react";
import {
  RFQ_STATUS_META, AVAILABILITY_META, vendorColor, vendorInitials, fmtMoney, num, addDaysIso,
  offerItemName, offerItemCode,
} from "./rfqUtils";

/* ── BillBull design tokens (match LPO / GRN screens) ─────────────────────────── */
export const inputCls =
  "w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/25 disabled:bg-slate-50 disabled:text-slate-500";
export const smallInputCls =
  "w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/25 disabled:bg-slate-50";
/** Dropdown that sizes to its options instead of stretching across the column. */
export const fitSelectCls =
  "w-auto max-w-full bg-white border border-slate-300 rounded-md pl-2.5 pr-8 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/25 disabled:bg-slate-50";
export const fitSelectLgCls =
  "w-auto max-w-full bg-white border border-slate-300 rounded-md pl-3 pr-9 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/25 disabled:bg-slate-50";
export const selectCls =
  "h-9 bg-white border border-slate-300 rounded-md px-3 text-sm text-slate-700 focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/25";
export const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md bg-[#F5C742] text-slate-900 text-sm font-bold shadow-sm hover:bg-[#E5B732] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";
export const secondaryBtn =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";
export const tealBtn =
  "inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md bg-[#327F74] text-white text-sm font-bold shadow-sm hover:bg-[#2a6b61] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";
export const tealOutlineBtn =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-[#327F74]/40 bg-white text-sm font-medium text-[#327F74] hover:bg-[#327F74]/10 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";
export const amberOutlineBtn =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-[#F5C742] bg-[#FFF8E7] text-sm font-medium text-[#7B6100] hover:bg-[#FFF3C4] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";
/** Small in-table action chips (View / Responses / Compare). */
export const rowActionBtn =
  "inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-[#F5C742] hover:bg-[#FFF8E7] hover:text-slate-900 transition-colors";
export const theadCls = "bg-[#F7F7FA] text-slate-600 border-b border-slate-200";
export const thCls = "px-4 py-3 text-left text-xs font-semibold whitespace-nowrap";

/**
 * Standard BillBull page header: breadcrumb, optional back button, big title with a yellow icon,
 * a subtitle line, actions on the right and an optional bottom slot (tabs / stepper / filters).
 */
export function PageHeader({ crumbs = [], icon: Icon, title, badge, subtitle, onBack, actions, children }) {
  return (
    <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3 pb-3 shrink-0 shadow-sm relative z-10">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
            {["Vendors & Purchases", ...crumbs].map((c, i, all) => (
              <React.Fragment key={`${c}-${i}`}>
                {i > 0 && <ChevronRight size={12} />}
                <span className={i === all.length - 1 ? "font-medium text-slate-900" : ""}>{c}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {onBack && (
              <button onClick={onBack} aria-label="Back"
                className="h-8 w-8 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2 min-w-0">
              {Icon && <Icon className="text-[#F5C742] shrink-0" size={22} />}
              <span className="truncate">{title}</span>
            </h1>
            {badge}
          </div>
          {subtitle && <div className="text-xs md:text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

const ACCENTS = {
  slate: { border: "border-l-slate-400", text: "text-slate-800", icon: "bg-slate-100 text-slate-500", ring: "border-slate-300 ring-2 ring-slate-100" },
  yellow: { border: "border-l-[#F5C742]", text: "text-[#B8860B]", icon: "bg-[#FFF8E7] text-[#C99A12]", ring: "border-[#F5C742] ring-2 ring-[#F5C742]/20" },
  blue: { border: "border-l-blue-500", text: "text-blue-600", icon: "bg-blue-50 text-blue-500", ring: "border-blue-300 ring-2 ring-blue-100" },
  pink: { border: "border-l-pink-500", text: "text-pink-600", icon: "bg-pink-50 text-pink-500", ring: "border-pink-300 ring-2 ring-pink-100" },
  emerald: { border: "border-l-emerald-500", text: "text-emerald-600", icon: "bg-emerald-50 text-emerald-500", ring: "border-emerald-300 ring-2 ring-emerald-100" },
  teal: { border: "border-l-[#327F74]", text: "text-[#327F74]", icon: "bg-[#327F74]/10 text-[#327F74]", ring: "border-[#327F74]/50 ring-2 ring-[#327F74]/15" },
};

/** GRN-style KPI card with a coloured left edge. Clickable when onClick is given. */
export function StatCard({ label, value, hint, icon: Icon, accent = "slate", active = false, onClick }) {
  const a = ACCENTS[accent] || ACCENTS.slate;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`bg-white p-4 rounded-lg border shadow-sm border-l-4 ${a.border} text-left transition-all ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md" : ""} ${active ? a.ring : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-slate-500 leading-tight">{label}</div>
        {Icon && <span className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${a.icon}`}><Icon className="w-4 h-4" /></span>}
      </div>
      <div className={`mt-1 text-2xl font-bold ${a.text}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </Tag>
  );
}

/** White content card used on every RFQ screen. */
export function SectionCard({ title, subtitle, icon: Icon, action, children, className = "", bodyClassName = "p-5" }) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="w-4 h-4 text-[#C99A12] shrink-0" />}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** LPO-style pill tabs (active = solid brand yellow). */
export function PillTabs({ tabs, active, onChange }) {
  return (
    <div className="flex overflow-x-auto no-scrollbar gap-1.5">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
              isActive ? "bg-[#F5C742] text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}>
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.count > 0 && (
              <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                isActive ? "bg-slate-900/10 text-slate-900" : "bg-pink-100 text-pink-600"}`}>{t.count}</span>
            )}
            {t.external && <ArrowUpRight className="w-3 h-3 opacity-50" />}
          </button>
        );
      })}
    </div>
  );
}

/** Numbered step indicator (RFQ workflow, create form, LPO builder). `current` is 0-based. */
export function Stepper({ steps, current, stopped = false, allDone = false, onStepClick }) {
  return (
    <div className="flex items-center overflow-x-auto no-scrollbar">
      {steps.map((label, idx) => {
        const done = idx < current || (allDone && idx === current);
        const active = idx === current && !done;
        const clickable = !!onStepClick && done;
        return (
          <div key={label} className="flex items-center shrink-0">
            <button type="button" disabled={!clickable} onClick={() => clickable && onStepClick(idx)}
              className={`flex items-center gap-2 rounded-full pr-3 pl-1 py-1 transition-colors ${
                active ? "bg-[#FFF8E7] ring-1 ring-[#FDE6A9]" : ""} ${clickable ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                stopped ? "bg-red-50 text-red-400 border border-red-200"
                  : done ? "bg-[#327F74] text-white" : active ? "bg-[#F5C742] text-slate-900" : "bg-slate-100 text-slate-400"}`}>
                {done && !stopped ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </span>
              <span className={`text-xs whitespace-nowrap ${active ? "text-slate-900 font-semibold" : done ? "text-[#327F74] font-medium" : "text-slate-400"}`}>{label}</span>
            </button>
            {idx < steps.length - 1 && <div className={`w-5 md:w-8 h-0.5 mx-1 rounded ${idx < current ? "bg-[#327F74]" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

/** Search box used above tables. */
export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-[220px] h-9 bg-white border border-slate-300 rounded-md px-3 focus-within:border-[#F5C742] focus-within:ring-2 focus-within:ring-[#F5C742]/25">
      <Search className="w-4 h-4 text-slate-400 shrink-0" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none flex-1 min-w-0" />
      {value && <button onClick={() => onChange("")} aria-label="Clear search"><X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" /></button>}
    </div>
  );
}

export function RfqStatusBadge({ status }) {
  const meta = RFQ_STATUS_META[status] || RFQ_STATUS_META.DRAFT;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      {meta.label}
    </span>
  );
}

export function VendorAvatar({ vendorId, name, size = "sm" }) {
  const sz = size === "sm" ? "w-6 h-6 text-[10px]" : size === "md" ? "w-8 h-8 text-[12px]" : "w-10 h-10 text-[14px]";
  const color = vendorColor(vendorId);
  return (
    <span
      title={name}
      className={`${sz} rounded-full flex items-center justify-center font-semibold shrink-0 ring-2 ring-white`}
      style={{ background: `${color}26`, color }}
    >
      {vendorInitials(name)}
    </span>
  );
}

export function AvailabilityBadge({ availability }) {
  const m = AVAILABILITY_META[availability] || AVAILABILITY_META["in-stock"];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${m.cls}`}>{m.label}</span>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, width = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onMouseDown={onClose}>
      <div
        className={`bg-white rounded-lg border border-slate-200 w-full ${width} max-h-[90vh] flex flex-col shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, footer, width = "w-[480px]" }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/30" onClick={onClose} />
      <div className={`${width} max-w-full bg-white border-l border-slate-200 flex flex-col h-full shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function Spinner({ className = "w-4 h-4" }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

/** "Request better price" drawer. Calls onSend({ offerId, targetPrice, targetQty, message, deadline }). */
export function NegotiationDrawer({ item, vendor, offer, currency, onSend, onClose }) {
  const current = num(offer.unitPrice);
  const [targetPrice, setTargetPrice] = useState(Math.floor(current * 0.95 * 100) / 100);
  const [targetQty, setTargetQty] = useState(num(offer.quotedQty) || num(item?.qtyNeeded));
  const [message, setMessage] = useState(
    `We are reviewing quotations from multiple vendors. We would appreciate a revised price of ${currency} ${(current * 0.95).toFixed(2)} per unit for ${item?.itemName || "the requested item"}.`
  );
  const [deadline, setDeadline] = useState(addDaysIso(3));
  const [saving, setSaving] = useState(false);

  const saving$ = (current - num(targetPrice)) * num(targetQty);
  const pct = current > 0 ? ((current - num(targetPrice)) / current) * 100 : 0;
  const valid = num(targetPrice) > 0 && num(targetPrice) < current;

  const submit = async () => {
    setSaving(true);
    try {
      await onSend({ offerId: offer.id, targetPrice: num(targetPrice), targetQty: num(targetQty), message, deadline });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="Request Better Price"
      subtitle={`${vendor.vendorName} · ${item?.itemName || ""}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button onClick={submit} disabled={!valid || saving} className={tealBtn}>
            {saving ? <Spinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} Record Request
          </button>
        </>
      }
    >
      <div className="p-5 space-y-5">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-2">Current Offer</div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{offerItemName(offer, item) || "—"}</div>
              <div className="text-xs text-slate-500 mt-0.5">{offer.quotedQty} {item?.unit}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">{fmtMoney(current, currency)}</div>
              <div className="text-xs text-slate-400">per unit</div>
            </div>
          </div>
        </div>

        <Field label={`Target Unit Price (${currency})`}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTargetPrice((p) => Math.max(0, Math.round((num(p) - 1) * 100) / 100))}
              className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
              <Minus className="w-3 h-3" />
            </button>
            <input type="number" min="0" step="0.5" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)}
              className={`${inputCls} text-center font-bold`} />
            <button type="button" onClick={() => setTargetPrice((p) => Math.round((num(p) + 1) * 100) / 100)}
              className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {pct > 0 ? (
            <div className="flex items-center gap-2 mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
              <TrendingDown className="w-3.5 h-3.5 shrink-0" />
              <span><strong>{pct.toFixed(1)}% reduction</strong> · saves <strong>{fmtMoney(saving$, currency)}</strong> on {targetQty} units</span>
            </div>
          ) : (
            <p className="text-xs text-red-600 mt-2">The target price must be lower than the current price.</p>
          )}
        </Field>

        <Field label="Target Quantity">
          <input type="number" min="1" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Message to Vendor">
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} />
        </Field>
        <Field label="Response Deadline">
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </Field>

        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            This records the request on the RFQ. Send the message to the vendor yourself (email / WhatsApp), then use
            <strong> Record Reply</strong> once they answer — an accepted or revised price updates the offer automatically.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

/** Records the vendor's answer to a price request. Calls onSave({ outcome, revisedPrice, message }). */
export function NegotiationReplyModal({ negotiation, vendorName, itemName, currency, onSave, onClose }) {
  const [outcome, setOutcome] = useState("REVISED");
  const [revisedPrice, setRevisedPrice] = useState(num(negotiation.targetPrice));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = outcome !== "REVISED" || num(revisedPrice) > 0;

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ outcome, revisedPrice: outcome === "REVISED" ? num(revisedPrice) : null, message });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { key: "ACCEPTED", label: "Accepted target", hint: `Price becomes ${fmtMoney(negotiation.targetPrice, currency)}` },
    { key: "REVISED", label: "Counter offer", hint: "Vendor gave a different price" },
    { key: "DECLINED", label: "Declined", hint: "Price stays as quoted" },
  ];

  return (
    <Modal
      title="Record Vendor Reply"
      subtitle={`${vendorName} · ${itemName}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button onClick={submit} disabled={!valid || saving} className={primaryBtn}>
            {saving && <Spinner className="w-3.5 h-3.5" />} Save Reply
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-center">
          <div>
            <div className="text-[10px] text-slate-500">Quoted</div>
            <div className="text-sm font-bold text-slate-900">{fmtMoney(negotiation.previousPrice, currency)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">Target</div>
            <div className="text-sm font-bold text-[#a16207]">{fmtMoney(negotiation.targetPrice, currency)}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {options.map((o) => (
            <button key={o.key} type="button" onClick={() => setOutcome(o.key)}
              className={`p-2.5 rounded-lg border text-left transition-all ${outcome === o.key ? "border-[#F5C742] bg-[#FFF8E7]" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-xs font-semibold text-slate-900">{o.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{o.hint}</div>
            </button>
          ))}
        </div>
        {outcome === "REVISED" && (
          <Field label={`Revised Unit Price (${currency})`}>
            <input type="number" min="0" step="0.01" value={revisedPrice} onChange={(e) => setRevisedPrice(e.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label="Vendor's message (optional)">
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} />
        </Field>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
      {Icon && <Icon className="w-10 h-10 mb-3 opacity-40" />}
      <p className="text-sm text-slate-600">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
      {action}
    </div>
  );
}
