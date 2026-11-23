// Last Receipt — the session's most recent sale, with Reprint, receipt history and the three
// Share Receipt channels (SMS, WhatsApp, Email).
//
// Presentation only. POSSales owns the snapshot (lastPaidInvoice, or one recovered from the server
// after a reload — see lastReceiptRecovery.js), the reprint body, the share-channel state and
// ReceiptShareModal. This is a plain fixed overlay rather than a Radix Dialog on purpose: a Radix
// modal blocks pointer events outside itself, and the share dialogs open on top of this one.

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Banknote, Check, CloudOff, Copy, CreditCard, History, Landmark, Mail,
  MessageCircle, Printer, Receipt, RefreshCw, Smartphone, User, X,
} from 'lucide-react';
import { DirhamSymbol } from '../../POSCurrency';
import { usePosInputV2, usePosOverlay } from '../../input/PosOverlayContext';
import { POS_OVERLAY_IDS, POS_SCOPES } from '../../input/posScope';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatWhen = (invoice) => {
  const raw = invoice?.createdAt || invoice?.invoiceDate;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const hasTime = Boolean(invoice?.createdAt);
  return d.toLocaleString('en-GB', hasTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};

const tenderIcon = (label) => {
  const l = String(label).toLowerCase();
  if (/card|visa|master|amex/.test(l)) return CreditCard;
  if (/online|bank|transfer/.test(l)) return Landmark;
  if (l.includes('credit')) return User;
  return Banknote;
};

const SHARE_CHANNELS = [
  { key: 'sms', label: 'SMS', Icon: Smartphone, tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 focus-visible:ring-emerald-500' },
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, tone: 'border-green-200 bg-green-50/70 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500' },
  { key: 'email', label: 'Email', Icon: Mail, tone: 'border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 hover:border-blue-300 focus-visible:ring-blue-500' },
];

function Row({ label, children, strong = false, tone = '' }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={strong ? 'font-bold text-[#1E293B]' : 'text-gray-500'}>{label}</span>
      <span className={`font-bold tabular-nums ${tone || 'text-[#1E293B]'}`}>{children}</span>
    </div>
  );
}

function Section({ title, aside, children }) {
  return (
    <section className="px-5 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * @param {boolean}  open
 * @param {object}   receipt        lastPaidInvoice (or a recovered snapshot); null when there is none
 * @param {Array}    paymentRows    paymentBlockRows(receipt.paymentBlock), [] when there is no block
 * @param {boolean}  loading        looking up the session's last sale on the server
 * @param {string}   loadError
 * @param {Function} onRefresh      look the last sale up again
 * @param {Function} onClose
 * @param {Function} onReprint      async; throwing shows the error here and keeps the dialog
 * @param {Function} onShare        (channel: 'sms' | 'whatsapp' | 'email') => void
 * @param {Function} onOpenHistory  opens Reprint Previous Invoices
 * @param {boolean}  shareOpen      a share dialog is on top: it owns Escape
 */
function LastReceiptDialog({
  open,
  receipt,
  paymentRows = [],
  loading = false,
  loadError = '',
  onRefresh,
  onClose,
  onReprint,
  onShare,
  onOpenHistory,
  formatCurrencyStr,
  walkInId = 'walk-in',
  sessionId = null,
  cashierName = '',
  terminalLabel = '',
  shareOpen = false,
}) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [copied, setCopied] = useState(false);

  // Every opening starts clean.
  useEffect(() => {
    if (open) { setPrintError(''); setCopied(false); }
  }, [open, receipt]);

  const close = useCallback(() => {
    if (printing) return;
    onClose?.();
  }, [printing, onClose]);

  // Esc closes — through the POS input controller (V2) or a window listener (legacy). While a
  // share dialog is on top, that dialog owns Escape.
  const posInputV2 = usePosInputV2();
  usePosOverlay({
    id: POS_OVERLAY_IDS.LAST_RECEIPT,
    open: Boolean(open && !shareOpen),
    scope: POS_SCOPES.MODAL,
    onEscape: (e) => { e.preventDefault(); close(); },
  });
  useEffect(() => {
    if (!open || shareOpen || posInputV2) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, shareOpen, posInputV2, close]);

  if (!open) return null;

  const fmt = (v) => formatCurrencyStr(num(v));
  const invoice = receipt?.invoice || null;
  const offline = Boolean(receipt?.offline);
  const hasServerInvoice = !offline && invoice?.id != null && Number.isFinite(Number(invoice.id));
  const documentNo = offline ? (receipt?.offline?.ref ? `Ref ${receipt.offline.ref}` : 'Pending sync') : (receipt?.id || invoice?.invoiceNumber || '');
  const items = Array.isArray(invoice?.items) ? invoice.items.filter((i) => i && !i.voided) : [];
  const itemCount = items.length || (typeof receipt?.items === 'number' ? receipt.items : 0);
  const customer = receipt?.customer;
  const isWalkIn = !customer || customer.id === walkInId;
  const customerName = isWalkIn ? (invoice?.customerName && invoice.customerName !== 'Walk-in Customer' ? invoice.customerName : 'Walk-in Customer') : customer.name;
  const customerContact = [customer?.phone || customer?.mobile || invoice?.customerPhone, customer?.email || invoice?.customerEmail].filter(Boolean).join(' · ');
  const total = num(receipt?.total ?? invoice?.invoiceTotal);
  const paid = num(receipt?.paidAmount ?? total);
  const change = num(receipt?.changeAmount);
  const balance = num(receipt?.creditBalance);
  const tenders = paymentRows.filter((r) => r.label !== 'Total Received' && r.label !== 'Change Returned');
  const discount = num(invoice?.billDiscountAmount);
  const vat = num(invoice?.taxTotal);
  const charges = num(invoice?.shippingCharge) + num(invoice?.deliveryCharge);
  const roundOff = num(invoice?.roundOff);
  const salesperson = invoice?.salespersonName || invoice?.salesperson || '';
  const status = offline
    ? { label: 'Pending sync', cls: 'bg-amber-100 text-amber-800', Icon: CloudOff }
    : balance > 0.004
      ? { label: 'Balance due', cls: 'bg-orange-100 text-orange-700', Icon: AlertTriangle }
      : { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700', Icon: Check };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(documentNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — nothing to do */ }
  };

  const reprint = async () => {
    if (!hasServerInvoice || printing) return;
    setPrinting(true);
    setPrintError('');
    try {
      await onReprint?.();
    } catch (err) {
      setPrintError(`Reprint failed: ${err?.message || 'printer error'}.`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="last-receipt-title"
        className="w-full max-w-[460px] max-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-b from-[#F5C742] to-[#E5B532] px-5 pt-4 pb-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Last Receipt</p>
              {receipt ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 id="last-receipt-title" className="text-white font-black text-lg truncate">{documentNo}</h2>
                  {documentNo && (
                    <button type="button" onClick={copyNumber} aria-label="Copy receipt number" title="Copy receipt number"
                      className="shrink-0 w-6 h-6 rounded-md bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              ) : (
                <h2 id="last-receipt-title" className="text-white font-black text-lg">Most recent sale</h2>
              )}
              {receipt && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${status.cls}`}>
                    <status.Icon className="h-3 w-3" aria-hidden="true" />{status.label}
                  </span>
                  {formatWhen(invoice) && <span className="text-[11px] font-semibold text-white/90">{formatWhen(invoice)}</span>}
                </div>
              )}
            </div>
            <button type="button" onClick={close} aria-label="Close"
              className="shrink-0 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!receipt ? (
          /* Empty / loading state */
          <div className="px-6 py-10 flex flex-col items-center text-center">
            {loading ? (
              <>
                <div className="w-8 h-8 border-[3px] border-amber-100 border-t-[#F5C742] rounded-full animate-spin mb-3" aria-hidden="true" />
                <p className="text-sm font-semibold text-gray-600">Looking up the last sale…</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
                  <Receipt className="h-7 w-7 text-amber-400" aria-hidden="true" />
                </div>
                <p className="text-sm font-bold text-[#1E293B]">{loadError ? 'Could not load the last sale' : 'No sales in this session yet'}</p>
                <p className="text-xs text-gray-500 mt-1 max-w-[280px]">
                  {loadError || 'Completed sales appear here for reprinting and sharing. Earlier receipts are in receipt history.'}
                </p>
                <div className="flex gap-2 mt-5">
                  {onRefresh && (
                    <button type="button" onClick={onRefresh}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">
                      <RefreshCw className="h-3.5 w-3.5" />Check again
                    </button>
                  )}
                  <button type="button" onClick={onOpenHistory}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F5C742] hover:bg-[#E5B532] text-xs font-bold text-[#1E293B]">
                    <History className="h-3.5 w-3.5" />Receipt history
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Amount strip */}
            <div className="bg-[#FFFBEB] border-b border-amber-100/60 px-5 py-3 shrink-0">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/60">Total</p>
                  <p className="text-3xl font-black text-[#1E293B] tabular-nums leading-tight"><DirhamSymbol /> {total.toFixed(2)}</p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-xs text-gray-500">Paid <span className="font-bold text-[#1E293B] tabular-nums">{fmt(paid)}</span></p>
                  {change > 0.004 && <p className="text-xs text-gray-500">Change <span className="font-bold text-emerald-600 tabular-nums">{fmt(change)}</span></p>}
                  {balance > 0.004 && <p className="text-xs text-gray-500">Balance <span className="font-bold text-orange-600 tabular-nums">{fmt(balance)}</span></p>}
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Customer */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-black text-gray-500 shrink-0">
                  {isWalkIn ? <User className="h-4 w-4" /> : String(customerName || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1E293B] truncate">{customerName}</p>
                  <p className="text-xs text-gray-500 truncate">{customerContact || (isWalkIn ? 'No contact on file — type one when sharing' : 'No phone or email on file')}</p>
                </div>
              </div>

              {/* Items */}
              <Section title={`Items (${itemCount})`}>
                {items.length > 0 ? (
                  <ul className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                    {items.map((it, i) => {
                      const qty = num(it.quantity);
                      const price = num(it.price ?? it.unitPrice);
                      const amount = it.netAmount != null ? num(it.netAmount) : qty * price;
                      return (
                        <li key={it.id ?? `${it.itemCode}-${i}`} className="flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1E293B] truncate">{it.itemName || it.productName || it.description || it.itemCode}</p>
                            <p className="text-[11px] text-gray-400 tabular-nums">{qty} × {fmt(price)}{it.unit ? ` · ${it.unit}` : ''}</p>
                          </div>
                          <span className="font-bold text-[#1E293B] tabular-nums shrink-0">{fmt(amount)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400">{itemCount} item(s) — line details are on the printed receipt.</p>
                )}
              </Section>

              {/* Totals */}
              {invoice && (
                <Section title="Totals">
                  <div className="space-y-1">
                    {invoice.subTotal != null && <Row label="Subtotal">{fmt(invoice.subTotal)}</Row>}
                    {discount > 0.004 && <Row label="Discount" tone="text-[#327F74]">−{fmt(discount)}</Row>}
                    {vat > 0.004 && <Row label="VAT">{fmt(vat)}</Row>}
                    {charges > 0.004 && <Row label="Delivery / Shipping">{fmt(charges)}</Row>}
                    {Math.abs(roundOff) > 0.004 && <Row label="Round off">{fmt(roundOff)}</Row>}
                    {num(receipt.depositAmount) > 0.004 && <Row label="Deposit applied" tone="text-[#327F74]">−{fmt(receipt.depositAmount)}</Row>}
                    <div className="h-px bg-gray-100 my-1" />
                    <Row label="Total" strong>{fmt(total)}</Row>
                  </div>
                </Section>
              )}

              {/* Payment */}
              <Section title="Payment">
                <div className="space-y-1">
                  {tenders.length > 0 ? tenders.map((row, i) => {
                    const Icon = tenderIcon(row.label);
                    return (
                      <div key={`${row.label}-${i}`} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-700 font-medium"><Icon className="h-4 w-4 text-gray-400" />{row.label}</span>
                        <span className="font-bold text-[#1E293B] tabular-nums">{fmt(row.amount)}</span>
                      </div>
                    );
                  }) : (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-gray-700 font-medium">
                        {React.createElement(tenderIcon(receipt.paymentMode || 'Cash'), { className: 'h-4 w-4 text-gray-400' })}
                        {receipt.paymentMode || 'Cash'}
                      </span>
                      <span className="font-bold text-[#1E293B] tabular-nums">{fmt(paid)}</span>
                    </div>
                  )}
                  {balance > 0.004 && <Row label="This invoice balance" tone="text-orange-600">{fmt(balance)}</Row>}
                  {balance > 0.004 && receipt.creditUpdatedBalance != null && (
                    <Row label="Customer total outstanding" tone="text-orange-600">{fmt(receipt.creditUpdatedBalance)}</Row>
                  )}
                </div>
              </Section>

              {/* Details */}
              <section className="px-5 py-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {[
                    ['Session', sessionId != null ? `#${sessionId}` : ''],
                    ['Terminal', invoice?.posTerminalId || terminalLabel],
                    ['Cashier', cashierName],
                    ['Salesperson', salesperson],
                    ['Reprints', num(invoice?.reprintCount) > 0 ? String(invoice.reprintCount) : ''],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
                      <dd className="font-semibold text-gray-700 truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
                {receipt.recovered && (
                  <p className="mt-3 text-[11px] text-gray-400">Loaded from the server after the till was reopened — cash tendered and change are not shown.</p>
                )}
                {offline && (
                  <p className="mt-3 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                    Saved offline. Reprint and email are available once it has synced and received its invoice number.
                  </p>
                )}
              </section>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-white shrink-0">
              {printError && <p role="alert" className="text-xs font-medium text-red-600 mb-2">{printError}</p>}
              <div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
                <button type="button" onClick={reprint} disabled={!hasServerInvoice || printing}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F5C742] hover:bg-[#E5B532] disabled:opacity-50 disabled:cursor-not-allowed text-[#1E293B] font-black text-sm transition-colors">
                  {printing
                    ? <><span className="w-4 h-4 border-2 border-[#1E293B]/30 border-t-[#1E293B] rounded-full animate-spin" aria-hidden="true" />Printing…</>
                    : <><Printer className="h-4 w-4" />Reprint Receipt</>}
                </button>
                <button type="button" onClick={onOpenHistory} title="Receipt history"
                  className="flex items-center justify-center gap-1.5 px-3.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">
                  <History className="h-4 w-4" />History
                </button>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Share Receipt</p>
              <div className="grid grid-cols-3 gap-2">
                {SHARE_CHANNELS.map(({ key, label, Icon, tone }) => {
                  const disabled = key === 'email' && !hasServerInvoice;
                  return (
                    <button key={key} type="button" onClick={() => onShare?.(key)} disabled={disabled}
                      title={disabled ? 'Available once the sale has synced' : `Send by ${label}`}
                      className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${tone}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />{label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LastReceiptDialog;
