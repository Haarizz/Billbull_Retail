import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, Loader2, Plus, Search, Users } from 'lucide-react';

import { PAYMENT_TYPES, toAmount } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import { confirmActionLabel, remainingAfterAllocation } from '../paymentFlow';
import { DirhamSymbol } from '../../POSCurrency';
import PaymentModalShell, { PaymentModalFrame, applyAmountKey } from './PaymentModalShell';
import { createCustomer } from '../../../../../api/customerledgerApi';

const ACCENT = '#9333ea';

/** A customer row may arrive from either the POS mapper or a raw create response. */
const customerPhone = (c) => c?.phone || c?.mobile || '';
const customerBalance = (c) => Number(c?.balance ?? c?.outstanding ?? 0) || 0;

/**
 * Puts part (or all) of the bill on the customer's account.
 *
 * Unlike the other tenders this collects no money — it records what the customer still
 * owes, so it requires a named account customer and nothing else. A walk-in cannot carry a
 * balance, which is why the picker excludes them.
 *
 * Two steps, because the two questions are unrelated: *whose* account is this going on, and
 * *how much* of the bill goes there. Answering them in one crowded dialog is what made the
 * old version easy to mis-key — the cashier could confirm an amount with no customer picked
 * and only find out from the error line. Step one now has to be answered before step two
 * exists.
 */
export default function CreditPaymentModal({
  remaining, editingLine, offeredTypes, customers, defaultCustomerId,
  onCustomerCreated = null, onConfirm, onCancel,
}) {
  const target = allocationTarget(remaining, editingLine);

  const accountCustomers = useMemo(
    () => customers.filter((c) => c.id !== 'walk-in'),
    [customers],
  );

  /**
   * The chosen customer is held as an object rather than an id: a customer created here is
   * not in `customers` until the parent reloads its list, and a selection that vanishes on
   * the next render would drop the cashier back to step one.
   */
  const [selected, setSelected] = useState(() => {
    if (editingLine?.customerCode) {
      const match = accountCustomers.find((c) => (c.code || c.id) === editingLine.customerCode);
      if (match) return match;
    }
    if (defaultCustomerId && defaultCustomerId !== 'walk-in') {
      return accountCustomers.find((c) => c.id === defaultCustomerId) || null;
    }
    return null;
  });

  const [amount, setAmount] = useState(
    editingLine ? String(editingLine.amount) : (target > 0 ? target.toFixed(2) : ''),
  );
  const [remarks, setRemarks] = useState(editingLine?.metadata?.remarks || '');

  if (!selected) {
    return (
      <CustomerStep
        customers={accountCustomers}
        onSelect={setSelected}
        onCustomerCreated={onCustomerCreated}
        onCancel={onCancel}
      />
    );
  }

  return (
    <ConfirmStep
      selected={selected}
      target={target}
      amount={amount}
      setAmount={setAmount}
      remarks={remarks}
      setRemarks={setRemarks}
      editingLine={editingLine}
      offeredTypes={offeredTypes}
      onChangeCustomer={() => setSelected(null)}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/* ── Step 1 — who is this charged to ─────────────────────────────────────── */

function CustomerStep({ customers, onSelect, onCustomerCreated, onCancel }) {
  const [tab, setTab] = useState('search');
  const dialogRef = useRef(null);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }, [onCancel]);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  return (
    <PaymentModalFrame
      title="Credit Sale"
      subtitle="Select or create a customer"
      icon={Users}
      accent={ACCENT}
      onCancel={onCancel}
      dialogRef={dialogRef}
      onKeyDown={handleKeyDown}
      hint="Esc to cancel"
      footer={(
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      )}
    >
      <div className="p-5 pt-4">
        <div className="mb-4 flex border-b border-gray-100">
          <TabButton active={tab === 'search'} onClick={() => setTab('search')} icon={Search} label="Search Existing" />
          <TabButton active={tab === 'create'} onClick={() => setTab('create')} icon={Plus} label="Quick Create" />
        </div>
        {tab === 'search'
          ? <SearchExistingTab customers={customers} onSelect={onSelect} />
          : <QuickCreateTab onCreated={(c) => { onCustomerCreated?.(); onSelect(c); }} />}
      </div>
    </PaymentModalFrame>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 border-b-2 pb-2.5 text-sm font-bold transition-colors ${
        active ? 'border-[#9333ea] text-[#9333ea]' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}>
      <Icon className="h-4 w-4" />{label}
    </button>
  );
}

function SearchExistingTab({ customers, onSelect }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice(0, 25);
    return customers.filter((c) => (
      (c.name || '').toLowerCase().includes(q)
      || (c.code || '').toLowerCase().includes(q)
      || customerPhone(c).toLowerCase().includes(q)
    )).slice(0, 25);
  }, [customers, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border-2 border-gray-200 px-3 py-2 focus-within:border-[#9333ea]">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input ref={inputRef} type="text" autoComplete="off" value={search}
          placeholder="Name, mobile, customer code…"
          onChange={(e) => setSearch(e.target.value)}
          // Enter picks the top match, so a search can be completed without the mouse.
          onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); onSelect(filtered[0]); } }}
          className="w-full text-sm outline-none" />
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-gray-400">No account customers match.</p>
        )}
        {filtered.map((c) => (
          <div key={c.id}
            className="flex items-center gap-3 rounded-xl border-2 border-gray-100 px-3 py-2.5 transition-colors hover:border-[#9333ea]/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#9333ea]/10 text-sm font-black text-[#9333ea]">
              {(c.name || '?').charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[#1E293B]">{c.name}</span>
              <span className="block truncate text-[11px] text-gray-400">
                {[c.code, customerPhone(c)].filter(Boolean).join(' · ') || '—'}
              </span>
            </span>
            <button type="button" onClick={() => onSelect(c)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[#9333ea]/30 px-3 py-1.5 text-xs font-bold text-[#9333ea] hover:bg-[#9333ea]/5">
              <CheckCircle2 className="h-3.5 w-3.5" />Select
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Creates the customer through the same endpoint the rest of the app uses — no second
 * creation path, so anything the customer master enforces is enforced here too. Only name
 * and mobile are asked for; everything else is optional and can be completed later in
 * Customer management.
 */
function QuickCreateTab({ onCreated }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', trn: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const valid = form.name.trim().length > 0 && form.mobile.trim().length > 0;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await createCustomer({
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || null,
        trn: form.trn.trim() || null,
        defaultShippingAddress: form.address.trim() || null,
      });
      onCreated({
        id: String(saved.id),
        code: saved.code || saved.customerCode || '',
        name: saved.name || form.name.trim(),
        phone: saved.mobile || form.mobile.trim(),
        balance: Number(saved.currentBalance ?? saved.balance ?? 0) || 0,
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create customer');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}>
      <Field label="Customer Name" required>
        <input ref={nameRef} type="text" autoComplete="off" value={form.name} placeholder="Full name"
          onChange={set('name')} className={INPUT_CLASS} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile" required>
          <input type="text" autoComplete="off" value={form.mobile} placeholder="+971 5X XXX XXXX"
            onChange={set('mobile')} className={INPUT_CLASS} />
        </Field>
        <Field label="Email" hint="(opt)">
          <input type="email" autoComplete="off" value={form.email} placeholder="email@example.com"
            onChange={set('email')} className={INPUT_CLASS} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="TRN" hint="(opt)">
          <input type="text" autoComplete="off" value={form.trn} placeholder="Tax Reg. No."
            onChange={set('trn')} className={INPUT_CLASS} />
        </Field>
        <Field label="Address" hint="(opt)">
          <input type="text" autoComplete="off" value={form.address} placeholder="City, country"
            onChange={set('address')} className={INPUT_CLASS} />
        </Field>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      <button type="button" onClick={submit} disabled={!valid || saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-300"
        style={!valid || saving ? undefined : { backgroundColor: ACCENT }}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Creating…' : 'Next: Advance Payment →'}
      </button>
    </div>
  );
}

const INPUT_CLASS = 'mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#9333ea]';

function Field({ label, required = false, hint = null, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1 font-semibold normal-case text-gray-300">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* ── Step 2 — how much goes on the account ───────────────────────────────── */

function ConfirmStep({
  selected, target, amount, setAmount, remarks, setRemarks,
  editingLine, offeredTypes, onChangeCustomer, onConfirm, onCancel,
}) {
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  
  const numeric = toAmount(amount);
  const exceedsRemaining = numeric > target + 0.005;
  const balance = Math.max(0, target - Math.min(numeric, target));
  const existingReceivable = customerBalance(selected);
  const confirmDisabled = numeric <= 0 || exceedsRemaining;
  const confirmLabel = confirmActionLabel({
    currentType: PAYMENT_TYPES.CREDIT,
    remainingAfter: remainingAfterAllocation(target, numeric),
    offeredTypes,
    editing: Boolean(editingLine),
  });

  const handleConfirm = () => {
    onConfirm({
      paymentType: PAYMENT_TYPES.CREDIT,
      amount: numeric,
      customerCode: selected.code || selected.id,
      customerName: selected.name,
      metadata: remarks.trim() ? { remarks: remarks.trim() } : null,
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter') {
      if (event.target.tagName === 'SELECT') return;
      event.preventDefault();
      if (!confirmDisabled) handleConfirm();
      return;
    }
  };

  const CustomerCard = (
    <div className="rounded-xl border-2 border-gray-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Customer Information</span>
        <button type="button" onClick={onChangeCustomer}
          className="text-xs font-bold text-[#9333ea] hover:underline">Change</button>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#9333ea]/10 text-sm font-black text-[#9333ea]">
          {(selected.name || '?').charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-[#1E293B]">{selected.name}</span>
          <span className="block truncate text-[11px] text-gray-400">
            {[selected.code, customerPhone(selected)].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      </div>
    </div>
  );

  const PrimaryAmountBox = (
    <div className="flex items-center justify-between rounded-xl border-2 px-4 py-3 bg-[#9333ea]/5" style={{ borderColor: ACCENT }}>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#9333ea]">Posted to Receivable</div>
        <div className="mt-0.5 text-2xl font-black text-[#1E293B]">
          <DirhamSymbol /> {amount || '0'}
        </div>
      </div>
      {!isEditingAmount && (
        <button type="button" onClick={() => setIsEditingAmount(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#9333ea] shadow-sm border border-[#9333ea]/20 hover:bg-[#9333ea]/10 transition-colors">
          <span className="text-[14px]">✏️</span> Edit
        </button>
      )}
    </div>
  );

  const ReferencesList = (
    <div className="space-y-1.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">Invoice Total</span>
        <span className="text-xs font-bold text-[#1E293B]"><DirhamSymbol /> {target.toFixed(2)}</span>
      </div>
      {balance > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">Unpaid Balance</span>
          <span className="text-xs font-bold text-amber-600"><DirhamSymbol /> {balance.toFixed(2)}</span>
        </div>
      )}
      {existingReceivable > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200/60 pt-1.5 mt-1.5">
          <span className="text-xs font-semibold text-gray-500">Existing A/R</span>
          <span className="text-xs font-bold text-red-500"><DirhamSymbol /> {existingReceivable.toFixed(2)}</span>
        </div>
      )}
    </div>
  );

  const RemarksInput = (
    <div>
      <label className="text-[10px] font-bold uppercase text-gray-400">Remarks (optional)</label>
      <input type="text" autoComplete="off" value={remarks} placeholder="Reference or note…"
        onChange={(e) => setRemarks(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#9333ea]" />
    </div>
  );

  if (isEditingAmount) {
    return (
      <PaymentModalShell
        title="Credit Sale"
        subtitle={`Invoice ${target.toFixed(2)} · ${selected.name}`}
        icon={Users}
        accent={ACCENT}
        amount={amount}
        amountLabel="Posted to Receivable"
        onAmountKey={(k) => setAmount((cur) => applyAmountKey(cur, k))}
        onAmountSet={setAmount}
        error={exceedsRemaining ? `Credit cannot exceed the remaining ${target.toFixed(2)}.` : null}
        confirmLabel={confirmLabel}
        confirmDisabled={confirmDisabled}
        onConfirm={handleConfirm}
        onCancel={onCancel}
      >
        <div className="space-y-3 pt-2">
          {CustomerCard}
          {ReferencesList}
          {RemarksInput}
        </div>
      </PaymentModalShell>
    );
  }

  return (
    <PaymentModalFrame
      title="Credit Sale"
      subtitle={`Invoice ${target.toFixed(2)} · ${selected.name}`}
      icon={Users}
      accent={ACCENT}
      onCancel={onCancel}
      onKeyDown={handleKeyDown}
      footer={(
        <>
          <button type="button" onClick={onCancel}
            className="rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={confirmDisabled}
            className="flex-1 rounded-xl py-3 text-sm font-black text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-300"
            style={confirmDisabled ? undefined : { backgroundColor: ACCENT }}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3 p-4">
        {CustomerCard}
        {PrimaryAmountBox}
        {ReferencesList}
        {RemarksInput}

        {exceedsRemaining && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Credit cannot exceed the remaining {target.toFixed(2)}.
          </div>
        )}
      </div>
    </PaymentModalFrame>
  );
}
