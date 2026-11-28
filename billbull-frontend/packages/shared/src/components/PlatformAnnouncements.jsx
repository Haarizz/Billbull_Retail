import { useCallback, useEffect, useRef, useState } from "react";
import { getPendingAnnouncements, markAnnouncementSeen } from "../api/platformAnnouncementsApi";

// Announcements BillBull sends from admin.billbull.app (new features, updates, maintenance).
// Each pops up once per user: "Got it" records it on the server, so it never shows again on
// any device.
//
// variant="app" (Retail): checked after sign-in and every few minutes while the tab is visible,
// so a maintenance notice published mid-shift still reaches people who are already working.
//
// variant="till" (standalone POS): checked once, at sign-in, before the first sale, and never
// re-checked, so it can't pop up mid-sale. The button never takes focus and ignores keyboard
// activation: a barcode scanner types like a keyboard and ends each scan with Enter, which would
// otherwise dismiss the notice unread. Only a real click or tap closes it.

const RECHECK_MS = 5 * 60 * 1000;

const KIND = {
  INFO: { label: "Information", icon: "ℹ", tone: "bg-sky-100 text-sky-700" },
  FEATURE: { label: "New feature", icon: "✦", tone: "bg-violet-100 text-violet-700" },
  UPDATE: { label: "Update", icon: "↻", tone: "bg-blue-100 text-blue-700" },
  MAINTENANCE: { label: "Maintenance", icon: "⚒", tone: "bg-amber-100 text-amber-800" },
  ALERT: { label: "Important", icon: "!", tone: "bg-red-100 text-red-700" },
};

export const kindOf = (kind) => KIND[kind] || KIND.INFO;

/** Next queue after fetching: keep the order, never re-add ones dismissed in this tab. */
export const mergeQueue = (current, fetched, dismissed) => {
  const ids = new Set(current.map((a) => a.id));
  const fresh = (fetched || []).filter((a) => !ids.has(a.id) && !dismissed.has(a.id));
  return fresh.length ? [...current, ...fresh] : current;
};

export default function PlatformAnnouncements({ variant = "app" }) {
  const till = variant === "till";
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const dismissed = useRef(new Set());
  const buttonRef = useRef(null);

  const check = useCallback(async () => {
    try {
      const list = await getPendingAnnouncements();
      setQueue((q) => mergeQueue(q, Array.isArray(list) ? list : [], dismissed.current));
    } catch {
      // Older backend, offline till, network blip or a suspended account: announcements are optional.
    }
  }, []);

  useEffect(() => {
    check();
    if (till) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, RECHECK_MS);
    return () => clearInterval(timer);
  }, [check, till]);

  const current = queue[0];

  useEffect(() => {
    if (current && !till) buttonRef.current?.focus();
  }, [current, till]);

  if (!current) return null;

  const dismiss = async (event) => {
    // A keyboard-activated click has detail 0; on the till that is a scanner's Enter, not a person.
    if (till && event?.detail === 0) return;
    setBusy(true);
    dismissed.current.add(current.id);
    try {
      await markAnnouncementSeen(current.id);
    } catch {
      // Still close it for this tab; it may show again after the next sign-in.
    } finally {
      setQueue((q) => q.filter((a) => a.id !== current.id));
      setBusy(false);
    }
  };

  const k = kindOf(current.kind);
  const remaining = queue.length - 1;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bb-announcement-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 bg-[#F5C742]" />
        <div className="flex items-start gap-4 px-6 pb-2 pt-5">
          <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${k.tone}`}>
            {k.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label} · from BillBull</div>
            <h2 id="bb-announcement-title" className="mt-0.5 text-lg font-semibold text-slate-900">{current.title}</h2>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto px-6 pb-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{current.message}</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 bg-[#FFF8E7] px-6 py-3">
          <span className="text-xs text-slate-500">{remaining > 0 ? `${remaining} more after this` : ""}</span>
          <button
            ref={buttonRef}
            type="button"
            onClick={dismiss}
            onMouseDown={till ? (e) => e.preventDefault() : undefined}
            disabled={busy}
            className={`rounded-lg bg-[#F5C742] font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-60 ${till ? "h-12 px-6 text-base" : "px-4 py-2 text-sm"}`}
          >
            {remaining > 0 ? "Got it, next" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
