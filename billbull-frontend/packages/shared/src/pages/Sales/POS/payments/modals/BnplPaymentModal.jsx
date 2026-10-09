import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronRight, Clock, Info, Loader2, Plus, Search,
} from 'lucide-react';

import { PAYMENT_TYPES } from '../paymentModel';
import { allocationTarget } from '../paymentSelectors';
import {
  BNPL_PROVIDERS,
  firstPaymentDate,
  formatBnplDate,
  generateBnplReference,
  planChipLabel,
  planFee,
  planInstallmentAmount,
  planTotalPayable,
} from '../bnplProviders';
import { PaymentModalFrame } from './PaymentModalShell';
import { createCustomer } from '../../../../../api/customerledgerApi';

const ACCENT = '#D97706';
const INPUT_CLASS = 'w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#D97706]';

const customerPhone = (c) => c?.phone || c?.mobile || '';

/**
 * Finances a sale through a Buy Now, Pay Later provider.
 *
 * <p>Four steps, in the order the decisions are actually made at the counter: which provider
 * the store is putting this through, who is being financed, on what plan, and finally a
 * review of exactly what the customer is agreeing to before the tender is committed. Each
 * answer narrows the next — the plans shown belong to the chosen provider, and the figures on
 * the review are that plan applied to this basket — so no step can be answered out of context.
 *
 * <p><b>The financing itself happens in the provider's own merchant app, not here.</b> The
 * cashier runs it there, the customer approves it on their phone, and what comes back is an
 * approval reference. Confirming here records that outcome as a tender; it does not call a
 * provider and does not move money on its own.
 *
 * <p>The store is paid the financed amount in full by the provider, so this settles the
 * invoice like a card and never touches the customer's A/R. The plan's fee is what the
 * provider charges the customer for the installments — it is shown so they know what they are
 * agreeing to, and deliberately never added to the invoice.
 */
export default function BnplPaymentModal({
  remaining, editingLine, customers = [], selectedCustomerId = null,
  onCustomerCreated = null, onConfirm, onCancel,
}) {
  // BNPL finances what is left on the bill. There is no amount keypad because there is no
  // partial financing to key: the provider approves an order for a figure, and that figure is
  // the balance the cashier put in front of them.
  const financeAmount = allocationTarget(remaining, editingLine);

  const accountCustomers = useMemo(
    () => customers.filter((c) => c.id !== 'walk-in'),
    [customers],
  );

  /**
   * One piece of state for the whole wizard — which step, and the three answers given so far.
   * They move together (picking a different provider invalidates the plan), so holding them
   * apart is what lets a stale plan survive a provider change.
   *
   * Seeded once, at mount: re-opening a recorded leg for correction lands straight on the
   * review with its own values, rather than making the cashier walk the whole wizard again to
   * fix one field. A fresh tender starts at step one with the sale's customer pre-picked.
   */
  const [wizard, setWizard] = useState(
    () => initialSelection(editingLine, accountCustomers, selectedCustomerId),
  );
  const { step, provider, plan, customer } = wizard;
  const patch = useCallback((changes) => setWizard((w) => ({ ...w, ...changes })), []);

  const [reference, setReference] = useState(() => editingLine?.reference || generateBnplReference());

  const commit = useCallback(() => {
    const due = firstPaymentDate(plan);
    onConfirm({
      paymentType: PAYMENT_TYPES.BNPL,
      // The provider goes in the subtype, which the backend records as "BNPL {provider}" — so
      // the leg buckets as BNPL in every report while still naming who financed it.
      paymentSubtype: provider.name,
      amount: financeAmount,
      reference: reference.trim(),
      customerCode: customer?.code || customer?.id || null,
      customerName: customer?.name || null,
      // Display-only. Nothing downstream settles against the plan: the store's money is the
      // financed amount, whatever the customer's own schedule with the provider turns out be.
      metadata: {
        bnplProviderId: provider.id,
        bnplPlanId: plan?.id || null,
        bnplPlanLabel: plan?.label || null,
        bnplInstallments: plan?.installments || null,
        bnplCadence: plan?.cadence || null,
        bnplFee: planFee(financeAmount, plan),
        bnplTotalPayable: planTotalPayable(financeAmount, plan),
        bnplFirstPayment: due ? formatBnplDate(due) : null,
        bnplCustomerMobile: customerPhone(customer) || null,
      },
    });
  }, [provider, plan, customer, reference, financeAmount, onConfirm]);

  const shared = { step, financeAmount, provider, onCancel };


  if (step === 1) {
    return (
      <ProviderStep
        {...shared}
        onSelect={(p) => patch({ provider: p, plan: null, step: 2 })}
      />
    );
  }

  if (step === 2) {
    return (
      <CustomerStep
        {...shared}
        customers={accountCustomers}
        selected={customer}
        onSelected={(c) => patch({ customer: c })}
        onCustomerCreated={onCustomerCreated}
        onBack={() => patch({ step: 1 })}
        onContinue={() => patch({ step: 3 })}
      />
    );
  }

  if (step === 3) {
    return (
      <PlanStep
        {...shared}
        customer={customer}
        selected={plan}
        onSelect={(p) => patch({ plan: p })}
        onBack={() => patch({ step: 2 })}
        onContinue={() => patch({ step: 4 })}
      />
    );
  }

  return (
    <ReviewStep
      {...shared}
      customer={customer}
      plan={plan}
      reference={reference}
      onReferenceChange={setReference}
      editing={Boolean(editingLine)}
      onBack={() => patch({ step: 3 })}
      onConfirm={commit}
    />
  );
}

/**
 * Where the wizard opens, and with what already answered.
 *
 * Pure and computed once rather than run as an effect: a cashier who lands on the review step
 * must see it on the first paint, not after a render that briefly showed step one.
 */
function initialSelection(editingLine, customers, selectedCustomerId) {
  // A customer already on the sale is the one being financed nine times out of ten, so it
  // starts picked rather than making the cashier find them again.
  const saleCustomer = selectedCustomerId && selectedCustomerId !== 'walk-in'
    ? customers.find((c) => c.id === selectedCustomerId) || null
    : null;

  if (!editingLine) {
    return { step: 1, provider: null, plan: null, customer: saleCustomer };
  }

  const provider = BNPL_PROVIDERS.find((p) => (
    p.id === editingLine.metadata?.bnplProviderId || p.name === editingLine.paymentSubtype
  )) || null;
  if (!provider) {
    // A leg recorded against a provider no longer in the table: re-pick rather than confirm
    // a review built on a provider that has gone.
    return { step: 1, provider: null, plan: null, customer: saleCustomer };
  }

  const recordedCustomer = editingLine.customerCode
    ? customers.find((c) => (c.code || c.id) === editingLine.customerCode)
      || { id: editingLine.customerCode, code: editingLine.customerCode, name: editingLine.customerName }
    : saleCustomer;

  return {
    step: 4,
    provider,
    plan: provider.plans.find((p) => p.id === editingLine.metadata?.bnplPlanId) || null,
    customer: recordedCustomer,
  };
}

/* ── Chrome shared by the four steps ─────────────────────────────────────── */

function BnplFrame({ step, financeAmount, children, footer, onCancel, hint = 'Esc to cancel' }) {
  const dialogRef = useRef(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  };

  return (
    <PaymentModalFrame
      title="Buy Now, Pay Later"
      subtitle={`AED ${financeAmount.toFixed(2)} to finance`}
      icon={Clock}
      accent={ACCENT}
      steps={{ current: step, total: 4 }}
      onCancel={onCancel}
      dialogRef={dialogRef}
      onKeyDown={handleKeyDown}
      hint={hint}
      footer={footer}
    >
      <div className="space-y-4 p-5">{children}</div>
    </PaymentModalFrame>
  );
}

/** The step footer: an optional primary action above a full-width Cancel, as in the design. */
function StepFooter({ primary, onCancel }) {
  return (
    <div className="w-full space-y-2">
      {primary}
      <button type="button" onClick={onCancel}
        className="w-full rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
        Cancel
      </button>
    </div>
  );
}

function PrimaryButton({ label, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full rounded-xl py-3 text-sm font-black transition-all disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
      style={disabled ? undefined : { backgroundColor: '#F5C742', color: '#1E293B' }}>
      {label}
    </button>
  );
}

function BackLink({ label, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="text-xs font-bold text-gray-500 hover:text-[#D97706]">
      ← {label}
    </button>
  );
}

/** Provider identity mark — the coloured initial the design uses in place of a logo. */
function ProviderAvatar({ provider, size = 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-12 w-12 text-lg';
  return (
    <span className={`flex ${dim} shrink-0 items-center justify-center rounded-xl font-black text-white`}
      style={{ backgroundColor: provider.accent }}>
      {provider.name.charAt(0)}
    </span>
  );
}

/* ── Step 1 — which provider ─────────────────────────────────────────────── */

function ProviderStep({ step, financeAmount, onSelect, onCancel }) {
  return (
    <BnplFrame step={step} financeAmount={financeAmount} onCancel={onCancel}
      footer={<StepFooter onCancel={onCancel} />}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Select BNPL Provider</p>
        <p className="text-xs text-gray-500">Choose your preferred installment partner</p>
      </div>

      <div className="space-y-2">
        {BNPL_PROVIDERS.map((p) => {
          // Below the provider's floor there is nothing to walk the customer through: the
          // order would be refused. The row states why rather than failing later.
          const belowMinimum = financeAmount < p.minimumAmount;
          return (
            <button key={p.id} type="button" disabled={belowMinimum}
              onClick={() => onSelect(p)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all ${
                belowMinimum ? 'cursor-not-allowed border-gray-100 opacity-60' : 'hover:shadow-sm'
              }`}
              style={belowMinimum ? undefined : { borderColor: `${p.accent}66` }}>
              <ProviderAvatar provider={p} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-800">{p.name}</span>
                  {belowMinimum
                    ? (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700 bg-amber-100">
                        Min AED {p.minimumAmount.toFixed(0)}
                      </span>
                    )
                    : (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100">
                        Available
                      </span>
                    )}
                </span>
                <span className="block truncate text-[11px] text-gray-500">{p.tagline}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {p.plans.map((plan) => (
                    <span key={plan.id}
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: `${p.accent}1A`, color: p.accent }}>
                      {planChipLabel(plan)}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-[10px] text-amber-700">
          BNPL eligibility is subject to customer credit verification by the provider. Standard
          approval terms apply.
        </p>
      </div>
    </BnplFrame>
  );
}

/* ── Step 2 — who is being financed ──────────────────────────────────────── */

function CustomerStep({
  step, financeAmount, provider, customers, selected,
  onSelected, onCustomerCreated, onBack, onContinue, onCancel,
}) {
  const [tab, setTab] = useState('existing');
  const [search, setSearch] = useState('');

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
    <BnplFrame step={step} financeAmount={financeAmount} onCancel={onCancel}
      footer={(
        <StepFooter onCancel={onCancel}
          primary={(
            <PrimaryButton label="Continue to Plan Selection →" disabled={!selected} onClick={onContinue} />
          )} />
      )}>
      <BackLink label="Back to Providers" onClick={onBack} />

      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <ProviderAvatar provider={provider} size="sm" />
        <p className="text-sm font-black text-slate-800">
          {provider.name} <span className="text-xs font-semibold text-gray-400">· Customer Verification</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TabButton active={tab === 'existing'} onClick={() => setTab('existing')} label="Existing Customer" />
        <TabButton active={tab === 'create'} onClick={() => setTab('create')} icon={Plus} label="New Customer" />
      </div>

      {tab === 'existing' ? (
        <>
          <div className="flex items-center gap-2 rounded-xl border-2 border-gray-200 px-3 py-2 focus-within:border-[#D97706]">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input type="text" autoComplete="off" value={search} placeholder="Search by name or phone…"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); onSelected(filtered[0]); } }}
              className="w-full text-sm outline-none" />
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-gray-400">No customers match.</p>
            )}
            {filtered.map((c) => {
              const active = selected && (selected.id === c.id);
              return (
                <button key={c.id} type="button" onClick={() => onSelected(c)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[#F5C742]/10' : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={active ? { borderColor: '#F5C742' } : undefined}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-500">
                    {(c.name || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#1E293B]">{c.name}</span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {[customerPhone(c), c.code].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                  {active && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <QuickCreateTab onCreated={(c) => { onCustomerCreated?.(); onSelected(c); setTab('existing'); }} />
      )}
    </BnplFrame>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'border-transparent bg-gray-50 text-gray-400 hover:text-gray-600'
      }`}
      style={active ? { borderColor: '#E2E8F0' } : undefined}>
      {Icon && <Icon className="h-4 w-4" />}{label}
    </button>
  );
}

/**
 * Creates the customer through the same endpoint the rest of the app uses — no second
 * creation path, so anything the customer master enforces is enforced here too. The provider
 * verifies against a mobile number, which is why it is required alongside the name.
 */
function QuickCreateTab({ onCreated }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
      });
      onCreated({
        id: String(saved.id),
        code: saved.code || saved.customerCode || '',
        name: saved.name || form.name.trim(),
        phone: saved.mobile || form.mobile.trim(),
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create customer');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}>
      <div>
        <label className="text-[10px] font-bold uppercase text-gray-400">Customer Name</label>
        <input type="text" autoComplete="off" value={form.name} placeholder="Full name"
          onChange={set('name')} className={`mt-1 ${INPUT_CLASS}`} />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase text-gray-400">Mobile</label>
        <input type="text" autoComplete="off" value={form.mobile} placeholder="+971 5X XXX XXXX"
          onChange={set('mobile')} className={`mt-1 ${INPUT_CLASS}`} />
        <p className="mt-1 text-[10px] text-gray-400">
          The provider verifies the customer on this number.
        </p>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase text-gray-400">Email <span className="normal-case text-gray-300">(optional)</span></label>
        <input type="email" autoComplete="off" value={form.email} placeholder="email@example.com"
          onChange={set('email')} className={`mt-1 ${INPUT_CLASS}`} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      <button type="button" onClick={submit} disabled={!valid || saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white disabled:bg-gray-300"
        style={!valid || saving ? undefined : { backgroundColor: ACCENT }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Create &amp; Select
      </button>
    </div>
  );
}

/* ── Step 3 — on what plan ───────────────────────────────────────────────── */

function PlanStep({
  step, financeAmount, provider, customer, selected, onSelect, onBack, onContinue, onCancel,
}) {
  return (
    <BnplFrame step={step} financeAmount={financeAmount} onCancel={onCancel}
      footer={(
        <StepFooter onCancel={onCancel}
          primary={<PrimaryButton label="Review & Confirm →" disabled={!selected} onClick={onContinue} />} />
      )}>
      <BackLink label="Back" onClick={onBack} />

      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <ProviderAvatar provider={provider} size="sm" />
          <div>
            <p className="text-sm font-black text-slate-800">{provider.name}</p>
            <p className="text-[11px] text-gray-500">{customer?.name || 'Walk-in Customer'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Finance Amount</p>
          <p className="text-lg font-black text-slate-800">AED {financeAmount.toFixed(2)}</p>
        </div>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Select Payment Plan</p>

      <div className="space-y-2">
        {provider.plans.map((p) => {
          const active = selected?.id === p.id;
          const fee = planFee(financeAmount, p);
          const due = firstPaymentDate(p);
          return (
            <button key={p.id} type="button" onClick={() => onSelect(p)}
              className={`w-full rounded-xl border-2 px-3 py-3 text-left transition-all ${
                active ? 'bg-[#F5C742]/10' : 'border-gray-100 hover:border-gray-200'
              }`}
              style={active ? { borderColor: '#F5C742' } : undefined}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? 'border-[#F5C742] bg-[#F5C742]' : 'border-gray-300'
                }`} />
                <span className="text-sm font-black text-slate-800">{p.label}</span>
                <span className="text-[11px] text-gray-400">{p.cadence}</span>
                {!p.feePercent && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700">
                    Interest-free
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pl-6 text-[11px]">
                <PlanFact label="Per installment"
                  value={`AED ${planInstallmentAmount(financeAmount, p).toFixed(2)}`} strong />
                <PlanFact label="Total payable"
                  value={`AED ${planTotalPayable(financeAmount, p).toFixed(2)}`} strong />
                {fee > 0 && (
                  <PlanFact label="Processing fee" value={`AED ${fee.toFixed(2)}`} tone="text-amber-600" />
                )}
                <PlanFact label="First payment" value={formatBnplDate(due)} />
              </dl>
            </button>
          );
        })}
      </div>
    </BnplFrame>
  );
}

function PlanFact({ label, value, strong = false, tone = 'text-slate-700' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className={`${tone} ${strong ? 'font-black' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}

/* ── Step 4 — what the customer is agreeing to ───────────────────────────── */

function ReviewStep({
  step, financeAmount, provider, customer, plan, reference, onReferenceChange,
  editing, onBack, onConfirm, onCancel,
}) {
  const fee = planFee(financeAmount, plan);
  const due = firstPaymentDate(plan);
  const canConfirm = reference.trim().length > 0;

  return (
    <BnplFrame step={step} financeAmount={financeAmount} onCancel={onCancel}
      hint="Enter to confirm · Esc to cancel"
      footer={(
        <StepFooter onCancel={onCancel}
          primary={(
            <PrimaryButton
              label={`${editing ? 'Save' : '✓ Confirm'} BNPL · AED ${financeAmount.toFixed(2)}`}
              disabled={!canConfirm} onClick={onConfirm} />
          )} />
      )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ProviderAvatar provider={provider} size="sm" />
          <p className="text-sm font-black text-slate-800">
            {provider.name}
            {plan && <span className="text-xs font-semibold text-gray-400"> · {plan.label}</span>}
          </p>
        </div>
        <BackLink label="Back" onClick={onBack} />
      </div>

      <div className="overflow-hidden rounded-xl border-2 border-gray-100">
        <p className="bg-gray-50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Payment Confirmation
        </p>
        <dl className="divide-y divide-gray-50 px-3">
          <ReviewRow label="Customer" value={customer?.name || 'Walk-in Customer'} />
          {customerPhone(customer) && <ReviewRow label="Mobile" value={customerPhone(customer)} />}
          <ReviewRow label="BNPL Provider" value={provider.name} />
          {plan && <ReviewRow label="Payment Plan" value={`${plan.label} · ${plan.cadence}`} />}
          <ReviewRow label="Finance Amount" value={`AED ${financeAmount.toFixed(2)}`} strong />
          {fee > 0 && <ReviewRow label="Processing Fee" value={`AED ${fee.toFixed(2)}`} tone="text-amber-600" />}
          <ReviewRow label="Total Payable" value={`AED ${planTotalPayable(financeAmount, plan).toFixed(2)}`} strong />
          {plan && (
            <ReviewRow label="Installments"
              value={`${plan.installments} × AED ${planInstallmentAmount(financeAmount, plan).toFixed(2)}`} />
          )}
          {due && <ReviewRow label="First Payment" value={formatBnplDate(due)} />}
        </dl>
      </div>

      {/* The one field that is not derived: what the payout will be reconciled against. */}
      <div>
        <label className="text-[10px] font-bold uppercase text-gray-400">Provider Approval Reference</label>
        <input type="text" autoComplete="off" spellCheck={false} value={reference}
          onChange={(e) => onReferenceChange(e.target.value)}
          className={`mt-1 font-mono uppercase ${INPUT_CLASS}`} />
        <p className="mt-1 text-[10px] text-gray-400">
          Pre-filled with this till&apos;s reference — replace it with the {provider.name} approval
          reference so the payout can be matched to this sale.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-[10px] text-amber-700">
          By confirming, the customer agrees to {provider.name}&apos;s installment terms. The full
          amount will be settled to the merchant by {provider.name}.
        </p>
      </div>
    </BnplFrame>
  );
}

function ReviewRow({ label, value, strong = false, tone = 'text-slate-700' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-right ${tone} ${strong ? 'font-black' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
