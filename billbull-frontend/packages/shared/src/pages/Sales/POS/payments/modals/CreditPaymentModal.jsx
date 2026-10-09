import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote, CheckCircle2, CreditCard, Info, Landmark, Loader2, Plus, Search, Users,
} from 'lucide-react';

import { AMOUNT_TOLERANCE, PAYMENT_TYPES, toAmount } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import { DirhamSymbol } from '../../POSCurrency';
import { PaymentModalFrame } from './PaymentModalShell';
import { createCustomer } from '../../../../../api/customerledgerApi';

const ACCENT = '#9333ea';

/** The tenders that can collect the received-now part of a credit sale. */
const MODES = [
  { type: PAYMENT_TYPES.CASH, label: 'Cash', icon: Banknote },
  { type: PAYMENT_TYPES.CARD, label: 'Card', icon: CreditCard },
  { type: PAYMENT_TYPES.ONLINE, label: 'Online Transfer', icon: Landmark },
];

const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'JCB', 'Apple Pay', 'Google Pay', 'Samsung Pay', 'Other'];

/** A customer row may arrive from either the POS mapper or a raw create response. */
const customerPhone = (c) => c?.phone || c?.mobile || '';
const customerBalance = (c) => Number(c?.balance ?? c?.outstanding ?? 0) || 0;

/**
 * Settles a bill part in money, part on the customer's account.
 *
 * The cashier keys what the customer *handed over*; the receivable is whatever the invoice
 * leaves after it. That is the opposite of asking for the credit amount directly, and it is
 * the right way round: the received figure is the one the cashier actually knows at the
 * counter, and deriving the other from it means the two can never be keyed inconsistently.
 *
 * One confirmation therefore commits up to two allocations — the tender that collected the
 * money and the balance posted to A/R — so a part-paid credit sale takes one dialog instead
 * of two, and the credit line always closes the bill.
 *
 * Two steps, because the two questions are unrelated: *whose* account is this going on, and
 * *how much* of the bill goes there. Answering them in one crowded dialog is what made the
 * old version easy to mis-key — the cashier could confirm an amount with no customer picked
 * and only find out from the error line. Step one now has to be answered before step two
 * exists.
 *
 * A walk-in cannot carry a balance, which is why the picker excludes them.
 */
export default function CreditPaymentModal({
  remaining, editingLine, customers, defaultCustomerId,
  bankAccounts = [], bankAccountsLoading = false,
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
      // Remounts on a customer change so the amount and tender fields start clean rather
      // than carrying the previous customer's half-filled entry.
      key={selected.id || selected.code}
      selected={selected}
      target={target}
      editingLine={editingLine}
      bankAccounts={bankAccounts}
      bankAccountsLoading={bankAccountsLoading}
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
      steps={{ current: 1, total: 2 }}
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

/* ── Step 2 — what was received now, and what goes on the account ────────── */

/**
 * The amount tiles, the tender that collected the received part, and the balance the account
 * carries.
 *
 * A received amount is money, so it needs a tender of its own — cash, card or transfer, with
 * the same bank / card-type detail those tenders collect anywhere else. It is committed as an
 * ordinary allocation of that type; "Advance" is only what the entry row calls it, marking
 * where it was keyed. Nothing here touches the customer-advance ledger (see `paymentModel`),
 * which stays a Customer-module workflow.
 */
function ConfirmStep({
  selected, target, editingLine, bankAccounts, bankAccountsLoading,
  onChangeCustomer, onConfirm, onCancel,
}) {
  const dialogRef = useRef(null);

  // Editing an existing credit line reopens with the money already collected against it, so
  // "received" starts at whatever the target leaves rather than at zero.
  const [received, setReceived] = useState(
    editingLine ? trimAmount(Math.max(0, round2(target - editingLine.amount))) : '',
  );
  const [mode, setMode] = useState(null);
  const [cardBrand, setCardBrand] = useState('');
  const [cardBankId, setCardBankId] = useState('');
  const [reference, setReference] = useState('');
  const [onlineBankId, setOnlineBankId] = useState('');
  const [remarks, setRemarks] = useState(editingLine?.metadata?.remarks || '');

  useEffect(() => { dialogRef.current?.focus(); }, []);

  const receivedAmount = toAmount(received);
  const exceedsTotal = receivedAmount > target + AMOUNT_TOLERANCE;
  const balance = Math.max(0, round2(target - Math.min(receivedAmount, target)));
  const existingReceivable = customerBalance(selected);
  const postsToAr = balance > AMOUNT_TOLERANCE;

  const bankOption = (id) => bankAccounts.find((a) => String(a.id) === String(id)) || null;
  // "{code} - {name}" is what the backend resolves the receiving CoA row from.
  const bankLabel = (acc) => (acc ? `${acc.code || acc.accountCode || ''} - ${acc.name}`.trim() : null);

  const error = (() => {
    if (exceedsTotal) return `Received cannot exceed the invoice total ${target.toFixed(2)}.`;
    if (receivedAmount <= 0) return null;
    if (!mode) return 'Select how the received amount was paid.';
    if (mode === PAYMENT_TYPES.CARD && !cardBrand) return 'Select a card type.';
    if (mode === PAYMENT_TYPES.ONLINE && !onlineBankId) return 'Select the receiving bank account.';
    return null;
  })();

  // Nothing to commit when the bill is neither collected nor put on account.
  const confirmDisabled = Boolean(error) || (receivedAmount <= 0 && !postsToAr);

  const handleConfirm = () => {
    if (confirmDisabled) return;
    const note = remarks.trim() || null;
    const drafts = [];

    if (receivedAmount > 0) {
      // An ordinary tender of the chosen type, flagged so the entry row can show where it was
      // taken ("Advance · Card") without inventing a payment type for it.
      const base = {
        amount: receivedAmount,
        metadata: { creditAdvance: true, ...(note ? { remarks: note } : {}) },
      };
      if (mode === PAYMENT_TYPES.CASH) {
        drafts.push({ ...base, paymentType: PAYMENT_TYPES.CASH });
      } else if (mode === PAYMENT_TYPES.CARD) {
        const acc = bankOption(cardBankId);
        drafts.push({
          ...base,
          paymentType: PAYMENT_TYPES.CARD,
          paymentSubtype: cardBrand,
          reference: reference.trim() || null,
          bankAccountId: acc ? cardBankId : null,
          bankAccountName: bankLabel(acc),
        });
      } else {
        const acc = bankOption(onlineBankId);
        drafts.push({
          ...base,
          paymentType: PAYMENT_TYPES.ONLINE,
          paymentSubtype: acc?.name || null,
          reference: reference.trim() || null,
          bankAccountId: onlineBankId,
          bankAccountName: bankLabel(acc),
        });
      }
    }

    if (postsToAr) {
      drafts.push({
        paymentType: PAYMENT_TYPES.CREDIT,
        amount: balance,
        customerCode: selected.code || selected.id,
        customerName: selected.name,
        metadata: note ? { remarks: note } : null,
      });
    }

    onConfirm(drafts);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter') {
      // Enter picks an option inside a <select>; everywhere else it commits.
      if (event.target.tagName === 'SELECT') return;
      event.preventDefault();
      handleConfirm();
    }
  };

  return (
    <PaymentModalFrame
      title="Credit Sale"
      subtitle={`Invoice ${target.toFixed(2)} · ${selected.name}`}
      icon={Users}
      accent={ACCENT}
      steps={{ current: 2, total: 2 }}
      onCancel={onCancel}
      dialogRef={dialogRef}
      onKeyDown={handleKeyDown}
      hint="Enter to confirm · Esc to cancel"
      footer={(
        <div className="w-full space-y-2">
          <button type="button" onClick={handleConfirm} disabled={confirmDisabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-300"
            style={confirmDisabled ? undefined : { backgroundColor: ACCENT }}>
            <CheckCircle2 className="h-4 w-4" />
            {editingLine ? 'Save Credit' : 'Save & Continue'}
          </button>
          <button type="button" onClick={onCancel}
            className="w-full rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      )}
    >
      <div className="space-y-3 p-4">
        {/* Who carries the balance, and what they already owe — the existing A/R sits beside
            the name because it is the one fact that decides whether more credit is wise. */}
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
            {existingReceivable > 0 && (
              <span className="shrink-0 text-right">
                <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-400">Existing A/R</span>
                <span className="block text-sm font-black text-red-500">
                  <DirhamSymbol /> {existingReceivable.toFixed(2)}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border-2 border-gray-100 p-3">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Advance Payment</p>

          <div className="grid grid-cols-3 gap-2">
            <AmountTile label="Invoice Total" value={target.toFixed(2)} />
            <div className="rounded-xl border-2 px-3 py-2 focus-within:border-[#9333ea]"
              style={{ borderColor: `${ACCENT}55` }}>
              <label htmlFor="credit-received"
                className="block text-center text-[9px] font-bold uppercase tracking-widest text-gray-400">
                Received
              </label>
              <input id="credit-received" type="text" inputMode="decimal" autoComplete="off" autoFocus
                value={received} placeholder="0.00"
                // Digits and one decimal point only: a stray letter would silently read as
                // zero and put the whole bill on account.
                onChange={(e) => setReceived(sanitizeAmountInput(e.target.value))}
                className="mt-0.5 w-full bg-transparent text-center text-lg font-black text-[#1E293B] outline-none" />
            </div>
            <AmountTile label="Balance" value={balance.toFixed(2)} tone="amber" />
          </div>

          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-[11px] font-semibold text-amber-800">
              {postsToAr
                ? `AED ${balance.toFixed(2)} will be posted to Customer Receivables (A/R) for ${selected.name}.`
                : 'Nothing goes to A/R — the invoice is fully received.'}
            </p>
          </div>

          {/* The tender selector only appears once money is involved: a pure credit sale has
              no payment mode to pick, and three dead tiles would only invite a stray click. */}
          {receivedAmount > 0 && (
            <div className="mt-3 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Payment Mode</p>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map(({ type, label, icon: Icon }) => (
                  <button key={type} type="button" onClick={() => setMode(type)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[11px] font-bold transition-all ${
                      mode === type
                        ? 'border-transparent bg-[#9333ea] text-white'
                        : 'border-gray-200 text-gray-600 hover:border-[#9333ea]/50'
                    }`}>
                    <Icon className="h-4 w-4" />{label}
                  </button>
                ))}
              </div>

              {mode === PAYMENT_TYPES.CARD && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <BankSelect label="Bank" hint="(opt)" value={cardBankId} onChange={setCardBankId}
                      accounts={bankAccounts} loading={bankAccountsLoading} placeholder="— Select —" />
                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-400">Card Type</label>
                      <select value={cardBrand} onChange={(e) => setCardBrand(e.target.value)} className={SELECT_CLASS}>
                        <option value="">— Select —</option>
                        {CARD_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <ReferenceInput value={reference} onChange={setReference} placeholder="e.g. TXN-123456" />
                </>
              )}

              {mode === PAYMENT_TYPES.ONLINE && (
                <>
                  <BankSelect label="Bank Account" value={onlineBankId} onChange={setOnlineBankId}
                    accounts={bankAccounts} loading={bankAccountsLoading} placeholder="— Select receiving account —" />
                  <ReferenceInput value={reference} onChange={setReference} placeholder="e.g. WIRE-2024-001" />
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase text-gray-400">Remarks (optional)</label>
          <input type="text" autoComplete="off" value={remarks} placeholder="Reference or note…"
            onChange={(e) => setRemarks(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#9333ea]" />
        </div>

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            {error}
          </div>
        )}
      </div>
    </PaymentModalFrame>
  );
}

function AmountTile({ label, value, tone = 'plain' }) {
  const amber = tone === 'amber';
  return (
    <div className={`rounded-xl border-2 px-3 py-2 text-center ${
      amber ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'
    }`}>
      <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <span className={`mt-0.5 block text-lg font-black ${amber ? 'text-amber-600' : 'text-[#1E293B]'}`}>
        <DirhamSymbol /> {value}
      </span>
    </div>
  );
}

function BankSelect({ label, hint = null, value, onChange, accounts, loading, placeholder }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase text-gray-400">
        {label}
        {hint && <span className="ml-1 font-semibold normal-case text-gray-300">{hint}</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
        <option value="">
          {loading ? 'Loading bank accounts…' : accounts.length === 0 ? 'No bank accounts configured' : placeholder}
        </option>
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.id}>{acc.name} ({acc.code || acc.accountCode || '-'})</option>
        ))}
      </select>
    </div>
  );
}

function ReferenceInput({ value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase text-gray-400">Reference No. (optional)</label>
      <input type="text" autoComplete="off" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#9333ea]" />
    </div>
  );
}

const SELECT_CLASS = 'mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#9333ea]';

/** Keeps digits and at most one decimal point, so the field can never read as NaN. */
function sanitizeAmountInput(raw) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** "20" rather than "20.00" for a whole amount, matching what a cashier would have keyed. */
function trimAmount(n) {
  return n > 0 ? String(Number(n.toFixed(2))) : '';
}
