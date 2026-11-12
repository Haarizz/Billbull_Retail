import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Store, Mail, Shield, ShieldCheck, CheckCircle, AlertTriangle, Package, Plus, X, Save, Send, Ban, LogOut, Info, Clock,
  MessageSquare, Lock, CalendarClock, MapPin, Truck, FileText, Building2, EyeOff, KeyRound, Wallet, Percent,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  clearPortalSession, getInvite, getPortalRfq, loadPortalSession, portalLogout, replyToPriceRequest, requestPortalCode,
  savePortalQuote, savePortalSession, verifyPortalCode,
} from "../../../../api/purchase/vendorPortalApi";
import { OfferEditor, blankOffer, buildQuotePayload, offerProblems, quoteProblems, toEditable, unavailableOffer } from "../OfferEditor";
import {
  Field, Modal, Spinner, inputCls, primaryBtn, secondaryBtn, smallInputCls, tealBtn, tealOutlineBtn,
} from "../RfqShared";
import {
  DEFAULT_PAYMENT_TERMS, DELIVERY_TERMS, NEGOTIATION_STATUS_META, RESPONSE_STATUS_META, errorMessage, fmtDate, fmtDateTime, fmtMoney, num,
  todayIso, validityDays, withCurrent,
} from "../rfqUtils";

/** The backend sends the branch's email sender name, which is often "BillBull — <Company>"; show just the buyer. */
function buyerName(companyName) {
  const name = String(companyName || "").replace(/^\s*BillBull\s*[—–-]\s*/i, "").trim();
  return name || "BillBull";
}

/** Public page vendors reach from their invitation link: /vendor-portal/:token */
export default function VendorPortal() {
  const { token } = useParams();
  const [session, setSession] = useState(() => loadPortalSession(token));

  const signOut = useCallback(async () => {
    if (session) await portalLogout(session.sessionToken);
    clearPortalSession(token);
    setSession(null);
  }, [session, token]);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-[#F7F7FA] text-slate-900 font-sans">
      {session ? (
        <PortalWorkspace session={session} onExpired={() => { clearPortalSession(token); setSession(null); }} onSignOut={signOut} />
      ) : (
        <SignIn token={token} onSignedIn={(s) => { savePortalSession(token, s); setSession(s); }} />
      )}
    </div>
  );
}

/** BillBull-branded top bar shared by the sign-in and the workspace. */
function PortalTopBar({ buyer, right }) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="w-full px-4 md:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#F5C742] flex items-center justify-center shrink-0 shadow-sm">
            <Store className="w-5 h-5 text-slate-900" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold text-slate-900">BillBull <span className="font-medium text-slate-400">·</span> <span className="font-semibold text-[#a16207]">Vendor Portal</span></div>
            {buyer && <div className="text-xs text-slate-500 truncate max-w-[60vw] md:max-w-[520px]" title={buyer}>Quotation requested by {buyer}</div>}
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}

function SignIn({ token, onSignedIn }) {
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState("start");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getInvite(token).then(setInvite).catch((e) => setError(errorMessage(e, "This link is not valid.")));
  }, [token]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await requestPortalCode(token);
      setStep("code");
      setResendIn(r.resendInSeconds || 60);
      setMessage({ ok: true, text: `We emailed a 6-digit code to ${r.maskedEmail}. It is valid for 10 minutes.` });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e, "Could not send the code.") });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    try {
      onSignedIn(await verifyPortalCode(token, code));
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e, "That code is not correct.") });
      if (e?.response?.status === 429) { setCode(""); setStep("start"); }
    } finally {
      setBusy(false);
    }
  };

  const buyer = invite ? buyerName(invite.companyName) : null;

  return (
    <div className="min-h-full flex flex-col">
      <PortalTopBar buyer={buyer} />
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        {error ? (
          <div className="w-full max-w-md bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Link not available</h1>
            <p className="text-sm text-slate-600 mt-1">{error}</p>
            <p className="text-xs text-slate-500 mt-3">Please use the latest link the buyer sent you, or contact them.</p>
          </div>
        ) : !invite ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner className="w-5 h-5" /> Loading your invitation…</div>
        ) : (
          <div className="w-full max-w-4xl min-w-0 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
            {/* Invitation summary */}
            <div className="bg-[#FFF8E7] border-b md:border-b-0 md:border-r border-[#FDE6A9] p-6 md:p-8 flex flex-col">
              <span className="self-start inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#7B6100] bg-[#F5C742]/30 rounded-full px-2.5 py-1">
                <FileText className="w-3.5 h-3.5" /> Request for Quotation
              </span>
              <h1 className="text-2xl font-bold text-slate-900 mt-4 leading-tight">{invite.title}</h1>
              <div className="mt-1 font-mono text-sm font-semibold text-[#a16207]">{invite.rfqNumber}</div>

              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-[#C99A12] mt-0.5 shrink-0" />
                  <div><dt className="text-xs text-slate-500">Buyer</dt><dd className="font-medium text-slate-900">{buyer}</dd></div>
                </div>
                <div className="flex items-start gap-3">
                  <Store className="w-4 h-4 text-[#C99A12] mt-0.5 shrink-0" />
                  <div><dt className="text-xs text-slate-500">Invited vendor</dt><dd className="font-medium text-slate-900">{invite.vendorName}</dd></div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarClock className="w-4 h-4 text-[#C99A12] mt-0.5 shrink-0" />
                  <div><dt className="text-xs text-slate-500">Submission deadline</dt><dd className="font-medium text-slate-900">{fmtDate(invite.deadline)}</dd></div>
                </div>
              </dl>

              <ul className="mt-auto pt-8 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#327F74]" /> This link is personal to your company</li>
                <li className="flex items-center gap-2"><EyeOff className="w-4 h-4 text-[#327F74]" /> Other vendors never see your prices</li>
                <li className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#327F74]" /> Sign-in uses a one-time code sent by email</li>
              </ul>
            </div>

            {/* Sign-in steps */}
            <div className="p-6 md:p-8 flex flex-col">
              <h2 className="text-lg font-bold text-slate-900">Sign in to quote</h2>
              <p className="text-sm text-slate-500 mt-0.5">Two quick steps to open your quotation workspace.</p>

              <div className="flex items-center gap-2 mt-5 mb-6">
                <StepDot n={1} label="Get code" state={step === "start" ? "active" : "done"} />
                <div className={`flex-1 h-0.5 rounded ${step === "code" ? "bg-[#327F74]" : "bg-slate-200"}`} />
                <StepDot n={2} label="Enter code" state={step === "code" ? "active" : "todo"} />
              </div>

              {!invite.open ? (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  <Lock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" /> {invite.notice}
                </div>
              ) : step === "start" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <Mail className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-slate-700">
                      {invite.maskedEmail
                        ? <>We will email a one-time code to <strong className="text-slate-900">{invite.maskedEmail}</strong>, the address registered for your company.</>
                        : <>No email address is registered for your company. Please ask the buyer to add one.</>}
                    </div>
                  </div>
                  <button onClick={sendCode} disabled={busy || !invite.maskedEmail} className={`${primaryBtn} w-full h-11 text-base`}>
                    {busy ? <Spinner className="w-4 h-4" /> : <Mail className="w-4 h-4" />} Email me a code
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">6-digit code</span>
                    <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} maxLength={6} placeholder="••••••"
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
                      className="mt-1.5 w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-2xl text-center tracking-[0.5em] font-mono focus:outline-none focus:border-[#F5C742] focus:ring-4 focus:ring-[#F5C742]/25" />
                  </label>
                  <button onClick={verify} disabled={busy || code.length !== 6} className={`${primaryBtn} w-full h-11 text-base`}>
                    {busy ? <Spinner className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />} Verify & Open Portal
                  </button>
                  <button onClick={sendCode} disabled={busy || resendIn > 0}
                    className="w-full text-sm text-slate-500 hover:text-slate-900 disabled:opacity-60 disabled:hover:text-slate-500">
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : "Send a new code"}
                  </button>
                </div>
              )}

              {message && (
                <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg border text-sm ${
                  message.ok ? "bg-[#327F74]/5 border-[#327F74]/20 text-[#327F74]" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {message.ok ? <CheckCircle className="w-4 h-4 mt-px shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-px shrink-0" />} {message.text}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <footer className="py-4 text-center text-xs text-slate-400">Powered by BillBull · Secure vendor quotation portal</footer>
    </div>
  );
}

function StepDot({ n, label, state }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
        state === "done" ? "bg-[#327F74] text-white" : state === "active" ? "bg-[#F5C742] text-slate-900" : "bg-slate-100 text-slate-400"}`}>
        {state === "done" ? <CheckCircle className="w-4 h-4" /> : n}
      </span>
      <span className={`text-sm ${state === "active" ? "font-semibold text-slate-900" : state === "done" ? "text-[#327F74] font-medium" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

function PortalWorkspace({ session, onExpired, onSignOut }) {
  const [rfq, setRfq] = useState(null);
  const [offers, setOffers] = useState([]);
  const [terms, setTerms] = useState({ paymentTerms: "", deliveryTerms: "", validity: "" });
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [saving, setSaving] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const absorb = useCallback((data) => {
    setRfq(data);
    setOffers((data.response.offers || []).map(toEditable));
    const days = validityDays(data.quotationValidity);
    const defaultValidity = data.deadline && days ? addDays(data.deadline, days) : "";
    setTerms({
      paymentTerms: data.response.paymentTerms || data.paymentTerms || "",
      deliveryTerms: data.response.deliveryTerms || data.deliveryTerms || "",
      validity: data.response.validity || defaultValidity,
    });
    setSelectedItemId((cur) => cur ?? data.items[0]?.id);
    setDirty(false);
  }, []);

  const handleError = useCallback((e, fallback) => {
    if (e?.response?.status === 401) { toast.error("Your session has ended. Please sign in again."); onExpired(); return; }
    toast.error(errorMessage(e, fallback));
  }, [onExpired]);

  useEffect(() => {
    getPortalRfq(session.sessionToken).then(absorb).catch((e) => handleError(e, "Could not load the request"));
  }, [session.sessionToken, absorb, handleError]);

  // Warn before leaving with unsaved prices.
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const currency = rfq?.currency || "AED";
  const taxInclusive = rfq?.taxPref === "Tax Inclusive";
  const editable = !!rfq?.canEditQuote;
  const items = rfq?.items || [];
  const selectedIdx = items.findIndex((i) => i.id === selectedItemId);
  const selectedItem = items[selectedIdx];
  const itemOffers = offers.filter((o) => o.rfqItemId === selectedItemId);
  const openRequests = (rfq?.priceRequests || []).filter((p) => p.status === "REQUESTED");
  const status = rfq ? RESPONSE_STATUS_META[rfq.response.responseStatus] || RESPONSE_STATUS_META.PENDING : null;

  const totals = useMemo(() => {
    const priced = offers.filter((o) => num(o.unitPrice) > 0 && o.availability !== "out-of-stock");
    let net = 0; let tax = 0; let extras = 0;
    priced.forEach((o) => {
      const n = num(o.unitPrice) * num(o.quotedQty) * (1 - num(o.discountPercent) / 100);
      net += n; tax += n * (num(o.taxPercent) / 100); extras += num(o.shippingCost) + num(o.additionalCost);
    });
    return { count: priced.length, net, tax, extras, total: net + tax + extras };
  }, [offers]);

  const itemState = useCallback((item) => {
    const its = offers.filter((o) => o.rfqItemId === item.id);
    if (its.length === 0) return "todo";
    if (its.every((o) => o.availability === "out-of-stock")) return "unavailable";
    if (its.some((o) => Object.keys(offerProblems(o, item, true)).length)) return "issue";
    return its.some((o) => num(o.unitPrice) > 0) ? "priced" : "todo";
  }, [offers]);

  const itemsAnswered = items.filter((i) => ["priced", "unavailable"].includes(itemState(i))).length;
  const problems = useMemo(() => (rfq ? quoteProblems(offers, rfq.items, true) : []), [offers, rfq]);

  const change = (fn) => { setOffers(fn); setDirty(true); };
  const update = (key, patch) => change((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const setTerm = (key, value) => { setTerms((t) => ({ ...t, [key]: value })); setDirty(true); };
  const offerDefaults = { validUntil: terms.validity || "" };

  const save = async (action) => {
    if (action === "SUBMIT") {
      if (totals.count === 0) { toast.error("Add a price for at least one item before submitting."); return; }
      if (problems.length) { setShowErrors(true); setReviewOpen(false); toast.error(problems.length === 1 ? problems[0] : `${problems.length} things to fix before submitting`); return; }
    }
    if (action === "DECLINE" && !window.confirm("Decline this request? Any prices you entered will be removed.")) return;
    setSaving(action);
    try {
      absorb(await savePortalQuote(session.sessionToken, buildQuotePayload(action, terms, offers)));
      setReviewOpen(false);
      toast.success(action === "SUBMIT" ? "Quotation submitted — thank you!" : action === "DECLINE" ? "You have declined this request" : "Draft saved");
    } catch (e) {
      handleError(e, "Could not save your quotation");
    } finally {
      setSaving(null);
    }
  };

  const openReview = () => {
    if (totals.count === 0) { toast.error("Add a price for at least one item before submitting."); return; }
    if (problems.length) { setShowErrors(true); toast.error(problems.length === 1 ? problems[0] : `${problems.length} things to fix before submitting`); return; }
    setReviewOpen(true);
  };

  if (!rfq) {
    return (
      <div className="min-h-full flex flex-col">
        <PortalTopBar />
        <div className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-400"><Spinner className="w-5 h-5" /> Loading your quotation…</div>
      </div>
    );
  }

  const buyer = buyerName(rfq.companyName);
  const daysLeft = rfq.deadline ? Math.ceil((new Date(`${rfq.deadline}T23:59:59`) - new Date()) / 86400000) : null;
  const overdue = daysLeft != null && daysLeft < 0;
  const deliveryTerm = DELIVERY_TERMS.find((t) => t.code === rfq.deliveryTerms);
  const paymentOptions = withCurrent(withCurrent(DEFAULT_PAYMENT_TERMS, rfq.paymentTerms), terms.paymentTerms);
  const goItem = (delta) => {
    const next = items[selectedIdx + delta];
    if (next) { setSelectedItemId(next.id); window.scrollTo?.({ top: 0, behavior: "smooth" }); }
  };

  return (
    <div className="min-h-full flex flex-col">
      <PortalTopBar buyer={buyer} right={
        <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
          <div className="hidden md:block text-right leading-tight">
            <div className="font-semibold text-slate-800 max-w-[260px] truncate" title={rfq.response.vendorName}>{rfq.response.vendorName}</div>
            <div className="flex items-center justify-end gap-1"><Clock className="w-3 h-3" /> Session ends {fmtDateTime(rfq.sessionExpiresAt)}</div>
          </div>
          <button onClick={onSignOut} className={secondaryBtn}><LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span></button>
        </div>
      } />

      {/* RFQ header */}
      <div className="bg-white border-b border-slate-200">
        <div className="w-full px-4 md:px-6 py-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-semibold text-[#a16207]">{rfq.rfqNumber}</span>
                <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 border bg-white border-current/30 ${status.cls}`}>
                  {status.label}{rfq.response.version ? ` · v${rfq.response.version}` : ""}
                </span>
                {dirty && editable && <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Unsaved changes</span>}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FileText className="text-[#F5C742] shrink-0" size={26} /> {rfq.title}</h1>
              <p className="text-sm text-slate-500">{buyer} invites <strong className="text-slate-700">{rfq.response.vendorName}</strong> to quote for {items.length} item{items.length !== 1 ? "s" : ""}.</p>
            </div>
            <div className={`shrink-0 rounded-lg border px-4 py-3 text-center min-w-[150px] ${overdue ? "bg-red-50 border-red-200" : daysLeft != null && daysLeft <= 2 ? "bg-amber-50 border-amber-200" : "bg-[#FFF8E7] border-[#FDE6A9]"}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quote by</div>
              <div className="text-lg font-bold text-slate-900">{fmtDate(rfq.deadline)}</div>
              <div className={`text-xs font-medium ${overdue ? "text-red-600" : "text-slate-600"}`}>
                {daysLeft == null ? "" : overdue ? "Deadline passed" : daysLeft === 0 ? "Due today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
            <TermTile icon={MapPin} label="Deliver to" value={rfq.deliveryLocation || "To be confirmed"} />
            <TermTile icon={CalendarClock} label="Needed by" value={fmtDate(rfq.expectedDelivery)} />
            <TermTile icon={Truck} label="Delivery terms" value={deliveryTerm ? deliveryTerm.code : rfq.deliveryTerms || "—"} hint={deliveryTerm?.hint} />
            <TermTile icon={Wallet} label="Payment terms" value={rfq.paymentTerms || "Open"} />
            <TermTile icon={Percent} label="Prices" value={taxInclusive ? "Including VAT" : rfq.taxPref === "Tax Exempt" ? "VAT exempt" : "Excluding VAT"} hint={`Currency ${currency}`} />
            <TermTile icon={Clock} label="Hold prices for" value={rfq.quotationValidity || "—"} />
          </div>

          {(!editable && rfq.editBlockedReason) || rfq.vendorInstructions || rfq.shippingReqs || openRequests.length > 0 ? (
            <div className="mt-4 space-y-2">
              {!editable && rfq.editBlockedReason && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <Lock className="w-4 h-4 mt-px shrink-0" /> {rfq.editBlockedReason}
                </div>
              )}
              {(rfq.vendorInstructions || rfq.shippingReqs) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FFF8E7] border border-[#FDE6A9] text-sm text-slate-700">
                  <Info className="w-4 h-4 text-[#C99A12] mt-px shrink-0" />
                  <div className="space-y-0.5">
                    {rfq.vendorInstructions && <div><span className="font-semibold text-slate-900">Buyer instructions: </span>{rfq.vendorInstructions}</div>}
                    {rfq.shippingReqs && <div><span className="font-semibold text-slate-900">Shipping: </span>{rfq.shippingReqs}</div>}
                  </div>
                </div>
              )}
              {openRequests.map((p) => {
                const item = items.find((i) => i.id === p.rfqItemId);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-pink-50 border border-pink-200 text-sm flex-wrap">
                    <MessageSquare className="w-4 h-4 text-pink-600 shrink-0" />
                    <div className="flex-1 min-w-[200px] text-slate-700">
                      <strong className="text-slate-900">Price request for {item?.itemName}:</strong> the buyer asks for {fmtMoney(p.targetPrice, currency)} per unit
                      (you quoted {fmtMoney(p.previousPrice, currency)}){p.deadline ? `, reply by ${fmtDate(p.deadline)}` : ""}.
                      {p.message && <div className="text-slate-600 mt-0.5 italic">“{p.message}”</div>}
                    </div>
                    <button onClick={() => setReplyTarget({ request: p, item })} className={tealBtn}>Respond</button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 w-full px-4 md:px-6 py-5 flex flex-col lg:flex-row gap-5 items-start">
        {/* Sidebar */}
        <aside className="w-full lg:w-80 shrink-0 space-y-4 lg:sticky lg:top-20">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-[#C99A12]" /> Requested Items</span>
              <span className="text-xs text-slate-500">{itemsAnswered}/{items.length} answered</span>
            </div>
            <div className="h-1 bg-slate-100">
              <div className="h-full bg-[#327F74] transition-all" style={{ width: `${items.length ? (itemsAnswered / items.length) * 100 : 0}%` }} />
            </div>
            <div className="p-2 space-y-1 max-h-[45vh] overflow-y-auto">
              {items.map((item, idx) => {
                const st = ITEM_STATE[itemState(item)];
                const active = selectedItemId === item.id;
                return (
                  <button key={item.id} onClick={() => setSelectedItemId(item.id)}
                    className={`w-full text-left p-3 rounded-md border transition-colors ${active ? "border-[#F5C742] bg-[#FFF8E7]" : "border-transparent hover:bg-slate-50"}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 ${active ? "bg-[#F5C742] text-slate-900" : "bg-slate-100 text-slate-500"}`}>{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug text-slate-900">{item.itemName}</div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-xs text-slate-500 truncate">{item.qtyNeeded} {item.unit}{item.itemCode ? ` · ${item.itemCode}` : ""}</span>
                          <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-px whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-[#C99A12]" /> Your Terms</div>
              <p className="text-[11px] text-slate-500 mt-0.5">Pre-filled with what the buyer asked for — change them if yours differ.</p>
            </div>
            <div className="p-4 space-y-3">
              <Field label="Payment terms you offer">
                <select disabled={!editable} value={terms.paymentTerms} onChange={(e) => setTerm("paymentTerms", e.target.value)} className={smallInputCls}>
                  <option value="">— Select —</option>
                  {paymentOptions.map((t) => <option key={t} value={t}>{t}{t === rfq.paymentTerms ? " (requested)" : ""}</option>)}
                </select>
              </Field>
              <Field label="Delivery terms you offer">
                <select disabled={!editable} value={terms.deliveryTerms} onChange={(e) => setTerm("deliveryTerms", e.target.value)} className={smallInputCls}>
                  <option value="">— Select —</option>
                  {!DELIVERY_TERMS.some((t) => t.code === terms.deliveryTerms) && terms.deliveryTerms && <option value={terms.deliveryTerms}>{terms.deliveryTerms}</option>}
                  {DELIVERY_TERMS.map((t) => <option key={t.code} value={t.code}>{t.label}{t.code === rfq.deliveryTerms ? " (requested)" : ""}</option>)}
                </select>
                {DELIVERY_TERMS.find((t) => t.code === terms.deliveryTerms) && (
                  <p className="text-[11px] text-slate-500 mt-1">{DELIVERY_TERMS.find((t) => t.code === terms.deliveryTerms).hint}</p>
                )}
              </Field>
              <Field label="Quotation valid until">
                <input disabled={!editable} type="date" min={todayIso()} value={terms.validity} onChange={(e) => setTerm("validity", e.target.value)} className={smallInputCls} />
                {rfq.quotationValidity && <p className="text-[11px] text-slate-500 mt-1">Buyer asks you to hold prices for {rfq.quotationValidity}.</p>}
              </Field>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 border-l-4 border-l-[#F5C742] shadow-sm p-4">
            <div className="text-sm font-semibold text-slate-900">Quotation total</div>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600"><dt>Net (before VAT)</dt><dd>{fmtMoney(totals.net, currency)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>VAT</dt><dd>{fmtMoney(totals.tax, currency)}</dd></div>
              <div className="flex justify-between text-slate-600"><dt>Shipping &amp; other</dt><dd>{fmtMoney(totals.extras, currency)}</dd></div>
              <div className="flex justify-between pt-1.5 mt-1.5 border-t border-slate-100 text-base font-bold text-slate-900"><dt>Total</dt><dd>{fmtMoney(totals.total, currency)}</dd></div>
            </dl>
            <div className="text-xs text-slate-500 mt-1">{totals.count} priced offer{totals.count !== 1 ? "s" : ""} · {itemsAnswered}/{items.length} items answered</div>
            {showErrors && problems.length > 0 && (
              <ul className="mt-3 space-y-1 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md p-2 max-h-32 overflow-y-auto">
                {problems.map((p) => <li key={p} className="flex gap-1"><AlertTriangle className="w-3 h-3 shrink-0 mt-px" /> {p}</li>)}
              </ul>
            )}
            {editable && (
              <div className="mt-3 space-y-2">
                <button onClick={openReview} disabled={!!saving} className={`${primaryBtn} w-full h-10`}>
                  <Send className="w-4 h-4" /> Review &amp; Submit
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => save("SAVE")} disabled={!!saving} className={secondaryBtn}>
                    {saving === "SAVE" ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />} Save draft
                  </button>
                  <button onClick={() => save("DECLINE")} disabled={!!saving} className={`${secondaryBtn} hover:text-red-600 hover:border-red-200`}>
                    {saving === "DECLINE" ? <Spinner className="w-4 h-4" /> : <Ban className="w-4 h-4" />} Decline all
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Selected item */}
        <section className="flex-1 min-w-0 space-y-4 w-full">
          {selectedItem && (
            <>
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#a16207]">Item {selectedIdx + 1} of {items.length}</div>
                    <h2 className="text-lg font-bold text-slate-900 mt-0.5">{selectedItem.itemName}</h2>
                    <div className="text-sm text-slate-500 mt-0.5">{[selectedItem.itemCode, selectedItem.brand, selectedItem.category].filter(Boolean).join(" · ")}</div>
                    {selectedItem.description && <p className="text-sm text-slate-600 mt-2">{selectedItem.description}</p>}
                  </div>
                  <div className="text-right shrink-0 bg-[#FFF8E7] border border-[#FDE6A9] rounded-lg px-4 py-2">
                    <div className="text-xl font-bold text-slate-900">{selectedItem.qtyNeeded} <span className="text-sm font-semibold">{selectedItem.unit}</span></div>
                    <div className="text-[11px] text-[#7B6100] font-medium">Requested qty</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100 border-t border-slate-100">
                  {[
                    ["Needed by", fmtDate(selectedItem.expectedDelivery || rfq.expectedDelivery)],
                    ["Warranty required", selectedItem.warrantyRequired || "None specified"],
                    ["Alternative brands", selectedItem.altBrandAllowed ? "Welcome" : "Not accepted", selectedItem.altBrandAllowed],
                    ["Partial quantity", selectedItem.partialAllowed ? "Accepted" : "Full qty only", selectedItem.partialAllowed],
                  ].map(([label, value, ok]) => (
                    <div key={label} className="bg-white px-4 py-3">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className={`text-sm font-medium mt-0.5 flex items-center gap-1 ${ok === undefined ? "text-slate-900" : ok ? "text-emerald-600" : "text-red-600"}`}>
                        {ok === true && <CheckCircle className="w-3.5 h-3.5" />}{ok === false && <Ban className="w-3.5 h-3.5" />}{value}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedItem.minSpec && (
                  <div className="px-5 py-3 border-t border-slate-100 text-sm text-slate-600"><span className="font-medium text-slate-900">Minimum specification:</span> {selectedItem.minSpec}</div>
                )}
              </div>

              {editable && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => change((p) => [...p.filter((o) => !(o.rfqItemId === selectedItem.id && o.availability === "out-of-stock")), blankOffer(selectedItem, false, offerDefaults)])} className={primaryBtn}>
                    <Plus className="w-4 h-4" /> {itemOffers.some((o) => !o.alternative && o.availability !== "out-of-stock") ? "Add another price" : "Quote this item"}
                  </button>
                  {selectedItem.altBrandAllowed ? (
                    <button onClick={() => change((p) => [...p.filter((o) => !(o.rfqItemId === selectedItem.id && o.availability === "out-of-stock")), blankOffer(selectedItem, true, offerDefaults)])} className={tealOutlineBtn}>
                      <Plus className="w-4 h-4" /> Offer an alternative
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> The buyer only accepts the exact item</span>
                  )}
                  <button onClick={() => change((p) => [...p.filter((o) => o.rfqItemId !== selectedItem.id), unavailableOffer(selectedItem, "Not available.")])}
                    className={`${secondaryBtn} hover:text-red-600 hover:border-red-200 ml-auto`}><X className="w-4 h-4" /> Can't supply</button>
                </div>
              )}

              {itemOffers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg bg-white">
                  <Package className="w-9 h-9 mb-2 opacity-40" />
                  <p className="text-sm font-medium text-slate-600">You have not quoted this item yet</p>
                  {editable && <p className="text-xs mt-1">Use <strong>Quote this item</strong>, or <strong>Can't supply</strong> if you don't stock it.</p>}
                </div>
              )}
              <fieldset disabled={!editable} className="space-y-4 min-w-0">
                {itemOffers.map((offer, i) => (
                  <OfferEditor key={offer.key} index={i} offer={offer} item={selectedItem} currency={currency} taxInclusive={taxInclusive}
                    showErrors={showErrors} readOnly={!editable}
                    onChange={(patch) => update(offer.key, patch)} onRemove={() => editable && change((p) => p.filter((o) => o.key !== offer.key))} />
                ))}
              </fieldset>

              {(rfq.priceRequests || []).filter((p) => p.rfqItemId === selectedItem.id && p.status !== "REQUESTED").map((p) => {
                const meta = NEGOTIATION_STATUS_META[p.status];
                return (
                  <div key={p.id} className="flex items-center gap-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                    <Clock className="w-4 h-4 text-slate-400" /> Price request {fmtDateTime(p.requestedAt)} — target {fmtMoney(p.targetPrice, currency)}
                    <span className={`ml-auto px-1.5 py-0.5 rounded border text-[10px] font-semibold ${meta?.cls || ""}`}>{meta?.label}</span>
                    {p.revisedPrice != null && <strong className="text-slate-900">{fmtMoney(p.revisedPrice, currency)}</strong>}
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button onClick={() => goItem(-1)} disabled={selectedIdx <= 0} className={secondaryBtn}><ChevronLeft className="w-4 h-4" /> Previous item</button>
                {selectedIdx < items.length - 1 ? (
                  <button onClick={() => goItem(1)} className={secondaryBtn}>Next item <ChevronRight className="w-4 h-4" /></button>
                ) : editable ? (
                  <button onClick={openReview} className={primaryBtn}><Send className="w-4 h-4" /> Review &amp; Submit</button>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Shield className="w-3.5 h-3.5" /> Your prices are visible only to {buyer} — never to other vendors.
      </footer>

      {reviewOpen && (
        <SubmitReview rfq={rfq} offers={offers} terms={terms} totals={totals} currency={currency} saving={saving === "SUBMIT"}
          onClose={() => setReviewOpen(false)} onSubmit={() => save("SUBMIT")} />
      )}

      {replyTarget && (
        <PriceReplyModal request={replyTarget.request} item={replyTarget.item} currency={currency}
          onClose={() => setReplyTarget(null)}
          onSave={async (payload) => {
            try {
              absorb(await replyToPriceRequest(session.sessionToken, replyTarget.request.id, payload));
              toast.success("Your answer was sent to the buyer");
              setReplyTarget(null);
            } catch (e) {
              handleError(e, "Could not send your answer");
            }
          }} />
      )}
    </div>
  );
}

const ITEM_STATE = {
  todo: { label: "Not quoted", cls: "bg-slate-50 text-slate-500 border-slate-200" },
  priced: { label: "Priced", cls: "bg-[#327F74]/10 text-[#327F74] border-[#327F74]/20" },
  unavailable: { label: "Can't supply", cls: "bg-red-50 text-red-600 border-red-200" },
  issue: { label: "Check", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TermTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white px-3 py-2.5 min-w-0" title={hint || undefined}>
      <div className="text-[11px] text-slate-500 flex items-center gap-1"><Icon className="w-3.5 h-3.5 text-[#C99A12]" /> {label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate" title={String(value)}>{value}</div>
      {hint && <div className="text-[10px] text-slate-400 truncate">{hint}</div>}
    </div>
  );
}

/** Final check before the quotation goes to the buyer. */
function SubmitReview({ rfq, offers, terms, totals, currency, saving, onClose, onSubmit }) {
  const deliveryTerm = DELIVERY_TERMS.find((t) => t.code === terms.deliveryTerms);
  return (
    <Modal width="max-w-3xl" title="Review your quotation" subtitle={`${rfq.rfqNumber} · ${rfq.title}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={secondaryBtn}>Keep editing</button>
        <button onClick={onSubmit} disabled={saving} className={primaryBtn}>
          {saving ? <Spinner className="w-4 h-4" /> : <Send className="w-4 h-4" />} Submit to {buyerName(rfq.companyName)}
        </button>
      </>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Item", "Offer", "Qty", "Unit price", "Delivery", "Line total"].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rfq.items.map((item) => {
                const its = offers.filter((o) => o.rfqItemId === item.id);
                if (its.length === 0) {
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{item.itemName}</td>
                      <td colSpan={5} className="px-3 py-2 text-slate-400 italic">Not quoted</td>
                    </tr>
                  );
                }
                return its.map((o, i) => {
                  const net = num(o.unitPrice) * num(o.quotedQty) * (1 - num(o.discountPercent) / 100);
                  const line = net * (1 + num(o.taxPercent) / 100) + num(o.shippingCost) + num(o.additionalCost);
                  const out = o.availability === "out-of-stock";
                  return (
                    <tr key={o.key} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-900">{i === 0 ? item.itemName : ""}</td>
                      <td className="px-3 py-2 text-slate-600">{out ? <span className="text-red-600">Can't supply</span> : o.alternative ? `Alternative: ${o.description}` : "As requested"}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{out ? "—" : `${o.quotedQty} ${item.unit}`}</td>
                      <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{out ? "—" : fmtMoney(o.unitPrice, currency)}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{out ? "—" : fmtDate(o.deliveryDate)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{out ? "—" : fmtMoney(line, currency)}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
            <div className="font-semibold text-slate-900 mb-1">Your terms</div>
            <div className="flex justify-between"><span className="text-slate-500">Payment</span><span className="text-slate-900">{terms.paymentTerms || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Delivery</span><span className="text-slate-900">{deliveryTerm?.label || terms.deliveryTerms || "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Valid until</span><span className="text-slate-900">{fmtDate(terms.validity)}</span></div>
          </div>
          <div className="rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-slate-600">Net</span><span>{fmtMoney(totals.net, currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">VAT</span><span>{fmtMoney(totals.tax, currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Shipping &amp; other</span><span>{fmtMoney(totals.extras, currency)}</span></div>
            <div className="flex justify-between pt-1 border-t border-[#FDE6A9] text-sm font-bold text-slate-900"><span>Total</span><span>{fmtMoney(totals.total, currency)}</span></div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 flex items-center gap-1"><Info className="w-3 h-3" /> You can still revise and resubmit until the deadline; the buyer sees each version.</p>
      </div>
    </Modal>
  );
}

function PriceReplyModal({ request, item, currency, onSave, onClose }) {
  const [outcome, setOutcome] = useState("ACCEPTED");
  const [price, setPrice] = useState(num(request.targetPrice));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = outcome !== "REVISED" || (num(price) > 0 && num(price) < num(request.previousPrice));
  const options = [
    { key: "ACCEPTED", label: `Accept ${fmtMoney(request.targetPrice, currency)}`, hint: "Your quote is updated to the target price" },
    { key: "REVISED", label: "Counter offer", hint: "Offer a different price" },
    { key: "DECLINED", label: "Keep my price", hint: `Stay at ${fmtMoney(request.previousPrice, currency)}` },
  ];
  return (
    <Modal title="Respond to Price Request" subtitle={item?.itemName} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
        <button disabled={!valid || busy} className={primaryBtn}
          onClick={async () => { setBusy(true); try { await onSave({ outcome, revisedPrice: outcome === "REVISED" ? num(price) : null, message }); } finally { setBusy(false); } }}>
          {busy && <Spinner className="w-4 h-4" />} Send Answer
        </button>
      </>}>
      <div className="space-y-4">
        {request.message && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">Buyer: “{request.message}”</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {options.map((o) => (
            <button key={o.key} onClick={() => setOutcome(o.key)}
              className={`p-3 rounded-lg border text-left transition-colors ${outcome === o.key ? "border-[#F5C742] bg-[#FFF8E7] ring-2 ring-[#F5C742]/20" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-sm font-semibold text-slate-900">{o.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{o.hint}</div>
            </button>
          ))}
        </div>
        {outcome === "REVISED" && (
          <Field label={`Your new unit price (${currency})`}>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
            {!valid && <p className="text-xs text-red-600 mt-1">Enter a price below your current {fmtMoney(request.previousPrice, currency)}.</p>}
          </Field>
        )}
        <Field label="Message to the buyer (optional)">
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} />
        </Field>
      </div>
    </Modal>
  );
}
