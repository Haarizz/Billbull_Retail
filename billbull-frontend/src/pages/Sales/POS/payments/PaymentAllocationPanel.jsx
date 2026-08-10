import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Banknote, CreditCard, Landmark, Loader2, RefreshCw, Users } from 'lucide-react';

import { PAYMENT_TYPES } from './paymentModel';
import { remainingAfterAllocation, suggestedNextMethod } from './paymentFlow';
import { allocationTarget } from './paymentSelectors';
import { CurrencyAmount, DirhamSymbol } from '../POSCurrency';
import PaymentAllocationList from './PaymentAllocationList';
import CashPaymentModal from './modals/CashPaymentModal';
import CardPaymentModal from './modals/CardPaymentModal';
import OnlinePaymentModal from './modals/OnlinePaymentModal';
import CreditPaymentModal from './modals/CreditPaymentModal';

/** Hotkeys are the first letter of each method, which is also what the badge shows. */
const METHODS = [
  { type: PAYMENT_TYPES.CASH, label: 'Cash', hotkey: 'c', icon: Banknote, accent: '#16a34a' },
  { type: PAYMENT_TYPES.CARD, label: 'Card', hotkey: 'd', icon: CreditCard, accent: '#2563eb' },
  { type: PAYMENT_TYPES.ONLINE, label: 'Online', hotkey: 'o', icon: Landmark, accent: '#0891b2' },
  { type: PAYMENT_TYPES.CREDIT, label: 'Credit', hotkey: 'r', icon: Users, accent: '#9333ea' },
];

/**
 * The payment panel shared by every settlement flow — POS checkout, delivery-order
 * settlement, layaway deposits: pick a method, enter an amount, confirm, repeat until the
 * remaining balance reaches zero.
 *
 * There is no "mixed payment" mode here, because mixed was never a payment method: a sale
 * settled two ways is simply a sale with two allocations. Removing it removes the decision
 * the cashier used to have to make up-front (am I about to split this?) — they just keep
 * adding tenders until the bill is covered.
 *
 * One component rather than one per screen, so a cashier who learns to take payment at the
 * till already knows how to settle a delivery, and so a rule fixed in one place is fixed
 * everywhere. All payment state lives in the `payment` manager passed in; this component
 * owns only which modal is open.
 *
 * @param methods  restricts the offered tenders (e.g. a delivery balance cannot be settled
 *                 by putting it back on account, so CREDIT is excluded there). Defaults to
 *                 all four.
 * @param compact  denser layout for the smaller settlement dialogs.
 */
export default function PaymentAllocationPanel({
  payment,
  compatibility = null,
  customers = [],
  selectedCustomerId = null,
  selectedCustomerName = null,
  bankAccounts = [],
  bankAccountsLoading = false,
  methods = null,
  compact = false,
  onCustomerCreated = null,
}) {
  // { type, line } — `line` set when editing an existing allocation, null when adding.
  const [activeModal, setActiveModal] = useState(null);
  const methodBarRef = useRef(null);

  const {
    paymentLines, invoiceTotal, remainingBalance, changeAmount, totalAllocated, totalCredit,
    paymentSummary, lineErrors, isOverAllocated, canSettle,
    addLine, updateLine, removeLine,
  } = payment;

  const openAdd = useCallback((type) => setActiveModal({ type, line: null }), []);
  const openEdit = useCallback((line) => setActiveModal({ type: line.paymentType, line }), []);

  /**
   * Closing always returns focus to the method bar, so the next tender is one keystroke
   * away — the cashier never has to reach for the mouse between allocations.
   */
  const closeModal = useCallback(() => {
    setActiveModal(null);
    // Deferred so focus lands after the modal has unmounted and released it.
    requestAnimationFrame(() => methodBarRef.current?.querySelector('button')?.focus());
  }, []);

  const offeredMethods = useMemo(
    () => (methods ? METHODS.filter((m) => methods.includes(m.type)) : METHODS),
    [methods],
  );
  const offeredTypes = useMemo(() => offeredMethods.map((m) => m.type), [offeredMethods]);

  /**
   * Commits a modal's draft. Editing patches the existing allocation in place so its id —
   * and therefore its position in the entry order the receipt prints — is preserved;
   * only a genuinely new tender is appended.
   *
   * When the draft leaves a balance still owed, the next tender's modal opens straight away
   * instead of dropping the cashier back on the panel to pick it. Splitting a bill is the
   * normal case, not an exception, so it should not cost an extra keystroke — and the
   * previous allocations stay exactly as they were, because the line list is the only state.
   * Editing never chains: the cashier came back to fix one line, not to add another.
   */
  const handleConfirm = useCallback((draft) => {
    const editing = activeModal?.line;
    if (editing) updateLine(editing.id, draft);
    else addLine(draft);

    const target = allocationTarget(remainingBalance, editing);
    const next = editing ? null : suggestedNextMethod(
      draft.paymentType,
      remainingAfterAllocation(target, draft.amount),
      offeredTypes,
    );
    if (next) setActiveModal({ type: next, line: null });
    else closeModal();
  }, [activeModal, updateLine, addLine, closeModal, remainingBalance, offeredTypes]);

  // Method hotkeys, live whenever no modal is open and the cashier isn't typing in a field.
  useEffect(() => {
    if (activeModal) return undefined;
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const method = offeredMethods.find((m) => m.hotkey === event.key.toLowerCase());
      if (!method) return;
      event.preventDefault();
      openAdd(method.type);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeModal, openAdd, offeredMethods]);

  const settled = canSettle && paymentLines.length > 0;
  const progressPct = useMemo(() => (
    invoiceTotal > 0 ? Math.min(100, (totalAllocated / invoiceTotal) * 100) : 100
  ), [totalAllocated, invoiceTotal]);

  const modalProps = {
    remaining: remainingBalance,
    editingLine: activeModal?.line,
    offeredTypes,
    onConfirm: handleConfirm,
    onCancel: closeModal,
  };

  return (
    <div className="space-y-3">
      {compatibility && compatibility.status !== 'supported' && (
        <CompatibilityBanner compatibility={compatibility} />
      )}

      {/* ── Payment methods ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Add Payment</p>
          <p className="text-[10px] text-gray-400">Press the highlighted key</p>
        </div>
        <div ref={methodBarRef} className={`grid gap-2 ${
          offeredMethods.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}>
          {offeredMethods.map(({ type, label, hotkey, icon: Icon, accent }) => (
            // Hover/press feedback is drawn from the method's own accent so the tile that
            // lifts is unmistakably the one about to be charged. `group` drives the icon.
            <button key={type} type="button" onClick={() => openAdd(type)}
              className="group relative flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transform-none motion-reduce:transition-none"
              style={{ borderColor: `${accent}40` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.backgroundColor = `${accent}0F`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${accent}40`; e.currentTarget.style.backgroundColor = ''; }}>
              <span className="absolute right-1.5 top-1.5 rounded px-1 text-[9px] font-black uppercase transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: `${accent}1A`, color: accent }}>{hotkey}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 ease-out group-hover:scale-110 motion-reduce:transform-none"
                style={{ backgroundColor: `${accent}1A` }}>
                <Icon className="h-4 w-4" style={{ color: accent }} />
              </div>
              <span className="text-xs font-bold" style={{ color: accent }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Remaining + progress ── */}
      <div className={`rounded-2xl border-2 px-4 py-4 transition-all ${
        settled ? 'border-green-300 bg-green-50'
          : isOverAllocated ? 'border-red-300 bg-red-50'
            : 'border-[#F5C742] bg-[#F5C742]/10'
      }`}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {settled ? 'Fully Allocated' : 'Remaining To Allocate'}
            </p>
            <p className={`text-3xl font-black leading-tight ${
              settled ? 'text-green-700' : isOverAllocated ? 'text-red-600' : 'text-[#1E293B]'
            }`}>
              <DirhamSymbol /> {remainingBalance.toFixed(2)}
            </p>
          </div>
          <p className="text-right text-sm font-bold text-gray-500">
            {totalAllocated.toFixed(2)} <span className="text-gray-400">/ {invoiceTotal.toFixed(2)}</span>
          </p>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/70">
          <div className={`h-full rounded-full transition-all duration-300 ${
            settled ? 'bg-green-500' : isOverAllocated ? 'bg-red-500' : 'bg-[#F5C742]'
          }`} style={{ width: `${progressPct}%` }} />
        </div>

        <dl className={`mt-3 space-y-1 text-sm ${compact ? 'hidden sm:block' : ''}`}>
          <SummaryRow label="Amount Due" value={invoiceTotal} />
          <SummaryRow label="Allocated" value={totalAllocated} strong />
          <SummaryRow label="Remaining" value={remainingBalance} />
          {totalCredit > 0 && (
            <SummaryRow label="Transferred to Accounts Receivable" value={totalCredit} tone="text-purple-700" />
          )}
          {changeAmount > 0 && (
            <SummaryRow label="Change to Return" value={changeAmount} tone="text-blue-700" strong />
          )}
        </dl>

        {paymentSummary && (
          <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Payment Summary</span>
            <span className="text-xs font-black text-[#1E293B]">{paymentSummary}</span>
          </div>
        )}
      </div>

      {/* ── Allocations ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Payment Entries</p>
        <PaymentAllocationList
          lines={paymentLines}
          lineErrors={lineErrors}
          onEdit={openEdit}
          onRemove={removeLine}
        />
      </div>

      {/* ── Modals ── */}
      {activeModal?.type === PAYMENT_TYPES.CASH && <CashPaymentModal {...modalProps} />}
      {activeModal?.type === PAYMENT_TYPES.CARD && <CardPaymentModal {...modalProps} />}
      {activeModal?.type === PAYMENT_TYPES.ONLINE && (
        <OnlinePaymentModal {...modalProps} bankAccounts={bankAccounts} bankAccountsLoading={bankAccountsLoading} />
      )}
      {activeModal?.type === PAYMENT_TYPES.CREDIT && (
        <CreditPaymentModal {...modalProps} customers={customers} defaultCustomerId={selectedCustomerId}
          onCustomerCreated={onCustomerCreated} />
      )}

    </div>
  );
}

function SummaryRow({ label, value, tone = 'text-[#1E293B]', strong = false }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`${tone} ${strong ? 'font-black' : 'font-bold'}`}>
        <CurrencyAmount amount={value} />
      </dd>
    </div>
  );
}

/**
 * Shown when the server has not confirmed it accepts progressive payment allocations.
 * Settlement is blocked while this is up: posting to a server that ignores the field would
 * record the sale with no payment against it.
 */
function CompatibilityBanner({ compatibility }) {
  const checking = compatibility.status === 'checking';
  return (
    <div className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3 ${
      checking ? 'border-gray-200 bg-gray-50' : 'border-red-300 bg-red-50'
    }`}>
      {checking
        ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-gray-400" />
        : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-black ${checking ? 'text-gray-500' : 'text-red-700'}`}>
          {checking ? 'Verifying server compatibility…' : 'Cannot take payment on this terminal'}
        </p>
        {compatibility.message && (
          <p className="mt-0.5 text-xs text-red-700">{compatibility.message}</p>
        )}
      </div>
      {!checking && (
        <button type="button" onClick={compatibility.retry}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
          <RefreshCw className="h-3.5 w-3.5" />Retry
        </button>
      )}
    </div>
  );
}
