// Console -> Behavior tab.
//
// Presentation only. Every control edits the same settingsDraft keys the tab always has;
// saving, validation and the draft seed live in usePosBehaviourSettings. The layout is a
// settings page: a section index on the left, and one row per setting (what it decides on
// the left, the control on the right) so the whole policy reads top to bottom.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, Truck, FileText, CheckCircle, Gift, Wallet, Lock,
  Clock, AlertTriangle, KeyRound, ShieldCheck, Undo2, Check, Receipt, Banknote, ChevronRight,
} from 'lucide-react';
import { Switch } from '../../../../../components/ui/switch';

/**
 * Restates the configured Business Day as its three phases, for the settings
 * preview. Presentation only — the backend remains the sole authority on phase and
 * closure; this exists so an admin can see that "21:00" is the scheduled end and
 * "23:00" is the actual closure without having to do the arithmetic themselves.
 *
 * Mirrors PosOperatingHoursCalculator.resolveWindow's wrap-aware duration handling
 * so the preview agrees with enforcement for overnight schedules too.
 */
function businessDayPhasePreview(draft) {
  const start = (draft?.operatingStartTime || '').slice(0, 5);
  const end = (draft?.operatingEndTime || '').slice(0, 5);
  if (!start || !end || start === end) return null;

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null) return null;

  const extensionMinutes = Math.max(0, Number(draft?.businessDayExtensionMinutes) || 0);
  // Wrap past midnight for an overnight schedule, exactly as the backend does.
  const lengthMin = endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
  const closureMin = (startMin + lengthMin + extensionMinutes) % 1440;
  const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  return { start, end, closure: fmt(closureMin), extensionMinutes, startMin, lengthMin };
}

// The draft as it would be seeded from the stored settings. Used when no draft exists yet
// and as the baseline that "edited" markers compare against.
const draftFromSettings = (posSettings) => ({
  requireSupervisorForVoid: !!posSettings?.requireSupervisorForVoid,
  requireSupervisorForDayClose: !!posSettings?.requireSupervisorForDayClose,
  requireAdminApprovalForSessionClose: !!posSettings?.requireAdminApprovalForSessionClose,
  requireAdminApprovalForDayClose: !!posSettings?.requireAdminApprovalForDayClose,
  supervisorApprovalMode: posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN',
  requirePriceOverrideApproval: !!posSettings?.requirePriceOverrideApproval,
  deliveryReturnChargePolicy: posSettings?.deliveryReturnChargePolicy || 'WAIVE',
  deliveryWorkflowMode: posSettings?.deliveryWorkflowMode || 'DEFAULT_SETTLEMENT',
  posFunctionAccessMode: posSettings?.posFunctionAccessMode || 'ALL_USERS',
  // Write-only field — the backend never returns the raw PIN (see supervisorPinSet).
  supervisorPin: '',
  voidMode: posSettings?.voidMode === 'DELETE' ? 'DELETE' : 'VOID',
  productEntryMode: posSettings?.productEntryMode || 'DIRECT_ADD',
  requireCustomer: !!posSettings?.requireCustomer,
  cartViewMode: posSettings?.cartViewMode === 'DETAILED' ? 'DETAILED' : 'MINIMAL',
  cartShowBarcode: posSettings?.cartShowBarcode !== false,
  cartShowProductCode: posSettings?.cartShowProductCode !== false,
  cartShowBatchNumber: posSettings?.cartShowBatchNumber !== false,
  cartShowSerialNumber: !!posSettings?.cartShowSerialNumber,
  cartShowExpiryDate: !!posSettings?.cartShowExpiryDate,
  cashDrawerTriggers: posSettings?.cashDrawerTriggers ?? 'CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN',
  operatingHoursEnabled: !!posSettings?.operatingHoursEnabled,
  operatingStartTime: posSettings?.operatingStartTime || '',
  operatingEndTime: posSettings?.operatingEndTime || '',
  businessDayExtensionMinutes: posSettings?.businessDayExtensionMinutes ?? 0,
  // '' = no branch policy (system default, the historical 12 months).
  creditVoucherExpiryMode: posSettings?.creditVoucherExpiryMode || '',
  creditVoucherExpiryMonths: posSettings?.creditVoucherExpiryMonths ?? 12,
  creditVoucherExpiryDate: posSettings?.creditVoucherExpiryDate || '',
});

const triggerSet = (v) => String(v || '').split(',').map(t => t.trim()).filter(Boolean).sort().join(',');
const isChanged = (key, d, base) => {
  if (key === 'supervisorPin') return !!d.supervisorPin;
  if (key === 'cashDrawerTriggers') return triggerSet(d[key]) !== triggerSet(base[key]);
  return String(d[key] ?? '') !== String(base[key] ?? '');
};

const SECTIONS = [
  { id: 'selling', label: 'Selling', icon: ShoppingCart, keys: ['productEntryMode', 'requireCustomer', 'voidMode'] },
  { id: 'cart', label: 'Cart & Cash Drawer', icon: Wallet, keys: ['cartViewMode', 'cartShowBarcode', 'cartShowProductCode', 'cartShowBatchNumber', 'cartShowSerialNumber', 'cartShowExpiryDate', 'cashDrawerTriggers'] },
  { id: 'delivery', label: 'Delivery', icon: Truck, keys: ['deliveryWorkflowMode', 'deliveryReturnChargePolicy'] },
  { id: 'credit', label: 'Store Credit', icon: Gift, keys: ['creditVoucherExpiryMode', 'creditVoucherExpiryMonths', 'creditVoucherExpiryDate'] },
  { id: 'security', label: 'Approvals & Access', icon: ShieldCheck, keys: ['supervisorApprovalMode', 'supervisorPin', 'requireSupervisorForVoid', 'requirePriceOverrideApproval', 'posFunctionAccessMode', 'requireSupervisorForDayClose', 'requireAdminApprovalForSessionClose', 'requireAdminApprovalForDayClose'] },
  { id: 'businessDay', label: 'Business Day', icon: Clock, keys: ['operatingHoursEnabled', 'operatingStartTime', 'operatingEndTime', 'businessDayExtensionMinutes'] },
];

const DRAWER_TRIGGERS = [
  ['CASH_PAYMENT', 'Cash payment completed'],
  ['CHANGE_RETURN', 'Change returned'],
  ['RECEIPT_PRINT', 'Receipt printed'],
  ['CASH_SETTLEMENT', 'Cash settlement selected'],
  ['CASH_DROP', 'Cash drop'],
  ['CASH_OUT', 'Cash out'],
  ['MANUAL_OPEN', 'Manual supervisor open'],
];

const CART_FIELDS = [
  ['cartShowBarcode', 'Barcode', '6291041500213'],
  ['cartShowProductCode', 'Product Code', 'P-10042'],
  ['cartShowBatchNumber', 'Batch Number', 'B-2611'],
  ['cartShowSerialNumber', 'Serial Number', 'SN 88A31'],
  ['cartShowExpiryDate', 'Expiry Date', 'Exp 12/2027'],
];

/* ─── building blocks ─────────────────────────────────────────────── */

const EditedTag = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FFF8E7] border border-[#FDE6A9] text-[10px] font-bold text-[#b8920e]">
    <span className="w-1.5 h-1.5 rounded-full bg-[#F5C742]" />Edited
  </span>
);

const ScopeTag = ({ children }) => (
  <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{children}</span>
);

// Pill-style single choice. The selected option's hint is shown underneath, so the
// row keeps the explanation without a card per option.
function Choice({ value, options, onChange, disabled }) {
  const selected = options.find(o => o.value === value);
  return (
    <div className="flex flex-col md:items-end gap-1.5 w-full md:w-auto">
      <div role="radiogroup" className="inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 self-start md:self-end">
        {options.map(o => {
          const active = o.value === value;
          return (
            <button key={String(o.value)} type="button" role="radio" aria-checked={active} disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all disabled:cursor-not-allowed ${
                active ? 'bg-white text-[#1E293B] shadow-sm ring-1 ring-[#F5C742]' : 'text-gray-500 hover:text-[#1E293B]'
              }`}>
              {o.label}
            </button>
          );
        })}
      </div>
      {selected?.hint && <p className="text-[11px] text-gray-500 leading-relaxed md:text-right md:max-w-sm">{selected.hint}</p>}
    </div>
  );
}

function SettingRow({ title, description, tag, edited, control, children }) {
  return (
    <div className="px-6 py-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-10">
        <div className="min-w-0 md:max-w-[48%]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-[#1E293B]">{title}</p>
            {tag}
            {edited && <EditedTag />}
          </div>
          {description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>}
        </div>
        {control && <div className="md:shrink-0 flex md:justify-end">{control}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function Section({ id, icon: Icon, title, description, editedCount, children }) {
  return (
    <section id={`behavior-${id}`} className="scroll-mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#FFF8E7] via-white to-white rounded-t-2xl">
        <div className="w-9 h-9 rounded-xl bg-[#F5C742] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[#1E293B]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-[#1E293B] leading-tight">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        {editedCount > 0 && (
          <span className="shrink-0 text-[10px] font-bold text-[#b8920e] bg-[#FFF8E7] border border-[#FDE6A9] rounded-full px-2 py-0.5">
            {editedCount} edited
          </span>
        )}
      </header>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  );
}

const Note = ({ tone = 'info', title, children }) => (
  <div className={`rounded-xl border px-4 py-3 flex items-start gap-2.5 ${
    tone === 'warn' ? 'border-red-200 bg-red-50' : 'border-[#FDE6A9] bg-[#FFF8E7]'
  }`}>
    <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${tone === 'warn' ? 'text-red-500' : 'text-[#b8920e]'}`} />
    <div className="min-w-0">
      {title && <p className={`text-xs font-bold ${tone === 'warn' ? 'text-red-600' : 'text-[#b8920e]'}`}>{title}</p>}
      <div className="text-[11px] text-gray-600 leading-relaxed mt-0.5">{children}</div>
    </div>
  </div>
);

const inputCls = (disabled) =>
  `border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white'}`;

// 24-hour bar: active window, extension and closed time, wrapping past midnight.
function BusinessDayTimeline({ preview }) {
  const pieces = (from, len) => {
    if (len <= 0) return [];
    const s = from % 1440;
    if (s + len <= 1440) return [{ left: s, width: len }];
    return [{ left: s, width: 1440 - s }, { left: 0, width: s + len - 1440 }];
  };
  const pct = (m) => `${(m / 1440) * 100}%`;
  const active = pieces(preview.startMin, preview.lengthMin);
  const ext = pieces(preview.startMin + preview.lengthMin, Math.min(preview.extensionMinutes, 1440 - preview.lengthMin));
  return (
    <div>
      <div className="relative h-7 rounded-lg bg-gray-100 overflow-hidden">
        {active.map((p, i) => (
          <div key={`a${i}`} className="absolute inset-y-0 bg-[#F5C742]" style={{ left: pct(p.left), width: pct(p.width) }} />
        ))}
        {ext.map((p, i) => (
          <div key={`e${i}`} className="absolute inset-y-0 bg-[#F5C742]/40"
            style={{ left: pct(p.left), width: pct(p.width), backgroundImage: 'repeating-linear-gradient(45deg, rgba(184,146,14,.25) 0 4px, transparent 4px 8px)' }} />
        ))}
      </div>
      <div className="relative h-4 mt-1 text-[10px] text-gray-400">
        {[0, 6, 12, 18, 24].map(h => (
          <span key={h} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: pct(h * 60) }}>
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F5C742]" />Active {preview.start} → {preview.end}</span>
        {preview.extensionMinutes > 0 && (
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F5C742]/40" />Extension {preview.end} → {preview.closure}</span>
        )}
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-200" />Closed, new sessions blocked</span>
      </div>
    </div>
  );
}

/* ─── the tab ─────────────────────────────────────────────────────── */

export default function PosBehaviorSettings({
  posSettings, settingsDraft, setSettingsDraft, settingsSaving, handleSaveSettings, beginEditSettings,
}) {
  const base = useMemo(() => draftFromSettings(posSettings), [posSettings]);
  const d = settingsDraft || base;
  const patch = (changes) => setSettingsDraft({ ...d, ...changes });

  const changed = useMemo(() => {
    const set = new Set();
    SECTIONS.forEach(s => s.keys.forEach(k => { if (isChanged(k, d, base)) set.add(k); }));
    return set;
  }, [d, base]);
  const edited = (...keys) => keys.some(k => changed.has(k));
  const editedIn = (id) => SECTIONS.find(s => s.id === id).keys.filter(k => changed.has(k)).length;

  // Highlight the section in view in the index.
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver((entries) => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActiveSection(hit.target.id.replace('behavior-', ''));
    }, { rootMargin: '-15% 0px -70% 0px' });
    SECTIONS.forEach(s => { const el = document.getElementById(`behavior-${s.id}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  const jumpTo = (id) => {
    setActiveSection(id);
    document.getElementById(`behavior-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Business Day schedule lock — server-computed (PosSettingsService), never derived here.
  // The backend refuses the change regardless; disabling the controls just stops an admin
  // typing a value that is about to be rejected. Read from the loaded settings, not the draft.
  const scheduleLocked = !!posSettings?.businessDayScheduleLocked;
  const scheduleLockCount = posSettings?.businessDayScheduleLockingSessionCount ?? 0;
  const scheduleLockReason = posSettings?.businessDayScheduleLockReason
    || 'Business Day timing cannot be changed while a POS session is open or undergoing closure. Close all active sessions before changing the Business Day schedule.';

  // Cash drawer triggers — MANUAL_OPEN is always on (explicit action).
  const drawerKeys = String(d.cashDrawerTriggers || '').split(',').map(t => t.trim()).filter(Boolean);
  const hasTrigger = (key) => drawerKeys.includes(key);
  const toggleTrigger = (key) => {
    const next = hasTrigger(key) ? drawerKeys.filter(t => t !== key) : [...drawerKeys, key];
    patch({ cashDrawerTriggers: next.join(',') });
  };

  const pinSet = !!posSettings?.supervisorPinSet;
  const usesPin = d.supervisorApprovalMode !== 'PASSWORD';
  const pinMissing = usesPin && !pinSet && !d.supervisorPin;
  const pinNeededBy = [
    d.requireSupervisorForVoid && 'Item Removal',
    d.requirePriceOverrideApproval && 'Price Override',
    d.posFunctionAccessMode === 'SUPERVISOR_PASSWORD' && 'Action Button Access',
  ].filter(Boolean);

  const preview = d.operatingHoursEnabled ? businessDayPhasePreview(d) : null;

  const glance = [
    ['Product entry', d.productEntryMode === 'OPEN_ENTRY_DIALOG' ? 'Entry dialog' : 'Direct add'],
    ['Customer', d.requireCustomer ? 'Required' : 'Optional'],
    ['Line removal', d.voidMode === 'DELETE' ? 'Delete' : 'Void'],
    ['Delivery', d.deliveryWorkflowMode === 'PI_FLOW' ? 'PI Flow' : 'Default'],
    ['Approvals by', usesPin ? 'Branch PIN' : 'Password'],
    ['Business Day', d.operatingHoursEnabled && preview ? `${preview.start}–${preview.closure}` : 'Calendar day'],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">

      {/* ── Section index ── */}
      <aside className="min-w-0 lg:sticky lg:top-6 space-y-4">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible bg-white lg:bg-transparent rounded-2xl border lg:border-0 border-gray-200 p-1 lg:p-0">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            const n = editedIn(s.id);
            return (
              <button key={s.id} type="button" onClick={() => jumpTo(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-white lg:shadow-sm lg:border lg:border-gray-200 text-[#1E293B]' : 'text-gray-500 hover:text-[#1E293B] hover:bg-white/60'
                }`}>
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#b8920e]' : 'text-gray-400'}`} />
                <span className="flex-1 text-left">{s.label}</span>
                {n > 0 && <span className="w-2 h-2 rounded-full bg-[#F5C742]" title={`${n} edited`} />}
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">At a glance</p>
          <dl className="space-y-2">
            {glance.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 text-xs">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-semibold text-[#1E293B] text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      {/* ── Settings ── */}
      <div className="space-y-6 min-w-0">

        {/* SELLING */}
        <Section id="selling" icon={ShoppingCart} title="Selling" editedCount={editedIn('selling')}
          description="What the till does while a sale is being rung up.">
          {/* The Item Entry dialog belongs to the Compact (Trade POS) layout; Classic and Cart
              Focus have inline qty/price/discount controls and stay on Direct Add whatever is
              chosen here. Enforced once, in useProductEntry. */}
          <SettingRow title="Product Entry Mode" tag={<ScopeTag>Compact layout only</ScopeTag>} edited={edited('productEntryMode')}
            description="What happens when a product is scanned or picked. Classic and Cart Focus always use Direct Add."
            control={<Choice value={d.productEntryMode} onChange={val => patch({ productEntryMode: val })} options={[
              { value: 'DIRECT_ADD', label: 'Direct Add', hint: 'Instantly adds 1 qty to the cart. Quickest workflow.' },
              { value: 'OPEN_ENTRY_DIALOG', label: 'Entry Dialog', hint: 'Opens a dialog to set qty, price and discount before adding.' },
            ]} />} />

          {/* Mandatory Customer — Checkout refuses a walk-in sale until a customer is selected.
              The backend (PosCheckoutController) enforces the same rule. */}
          <SettingRow title="Customer on Every Sale" edited={edited('requireCustomer')}
            description="Whether each sale must be made to a selected customer, or walk-in sales are allowed."
            control={<Choice value={!!d.requireCustomer} onChange={val => patch({ requireCustomer: val })} options={[
              { value: false, label: 'Optional', hint: 'Walk-in sales are allowed. A customer can be selected when needed.' },
              { value: true, label: 'Required', hint: 'A customer must be selected before Checkout. Walk-in sales are blocked.' },
            ]} />} />

          <SettingRow title="Removing a Cart Line" edited={edited('voidMode')}
            description="What happens to a line when the cashier removes it. Whether that needs approval is set under Approvals & Access."
            control={<Choice value={d.voidMode} onChange={val => patch({ voidMode: val })} options={[
              { value: 'VOID', label: 'Void (recommended)', hint: 'Marked in red with a strike-through; kept on the receipt, audit log and reports.' },
              { value: 'DELETE', label: 'Delete', hint: 'The line is removed entirely and not recorded.' },
            ]} />} />
        </Section>

        {/* CART & CASH DRAWER */}
        <Section id="cart" icon={Wallet} title="Cart & Cash Drawer" editedCount={editedIn('cart')}
          description="How much each cart line shows, and when the drawer kicks open.">
          <SettingRow title="Cart Line Detail" edited={edited('cartViewMode', 'cartShowBarcode', 'cartShowProductCode', 'cartShowBatchNumber', 'cartShowSerialNumber', 'cartShowExpiryDate')}
            description="Minimal keeps the cart clean; Detailed adds the identifiers you pick below to every line."
            control={<Choice value={d.cartViewMode} onChange={val => patch({ cartViewMode: val })} options={[
              { value: 'MINIMAL', label: 'Minimal' },
              { value: 'DETAILED', label: 'Detailed' },
            ]} />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`transition-opacity ${d.cartViewMode === 'DETAILED' ? '' : 'opacity-40 pointer-events-none'}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Shown on each line</p>
                <div className="flex flex-wrap gap-2">
                  {CART_FIELDS.map(([key, label]) => {
                    const on = !!d[key];
                    return (
                      <button key={key} type="button" aria-pressed={on} onClick={() => patch({ [key]: !on })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          on ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {on ? <Check className="h-3 w-3" /> : <span className="w-3 h-3 rounded-full border border-gray-300" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Sample line so the choice is visible before it reaches the till. */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Preview</p>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1E293B] truncate">Ceramic Floor Tile 60×60</p>
                      <p className="text-[11px] text-gray-500">2 × 45.00</p>
                    </div>
                    <p className="text-sm font-bold text-[#1E293B]">90.00</p>
                  </div>
                  {d.cartViewMode === 'DETAILED' && CART_FIELDS.some(([k]) => d[k]) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {CART_FIELDS.filter(([k]) => d[k]).map(([k, , sample]) => (
                        <span key={k} className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-[10px] text-gray-500">{sample}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SettingRow>

          <SettingRow title="Open the Cash Drawer On" edited={edited('cashDrawerTriggers')}
            description="The drawer opens only for the events switched on here.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DRAWER_TRIGGERS.map(([key, label]) => {
                const locked = key === 'MANUAL_OPEN'; // always available — explicit action
                const on = locked || hasTrigger(key);
                return (
                  <label key={key} className={`flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl border transition-colors ${
                    on ? 'border-[#FDE6A9] bg-[#FFF8E7]/60' : 'border-gray-200 bg-white'
                  }`}>
                    <span className="flex items-center gap-2 text-sm text-[#1E293B]">
                      <Banknote className={`h-3.5 w-3.5 ${on ? 'text-[#b8920e]' : 'text-gray-300'}`} />
                      {label}
                      {locked && <span className="text-[10px] text-gray-400">always on</span>}
                    </span>
                    <Switch checked={on} disabled={locked} onCheckedChange={() => toggleTrigger(key)} />
                  </label>
                );
              })}
            </div>
          </SettingRow>
        </Section>

        {/* DELIVERY */}
        <Section id="delivery" icon={Truck} title="Delivery" editedCount={editedIn('delivery')}
          description="When a delivery order becomes a sale, and what a refused delivery costs.">
          {/* Both options send the goods out and end at Delivery Settlement (settle by pay mode,
              or return); they differ only in whether the order is a sale from dispatch or a
              Pro-forma Invoice until it is settled. The backend reads it per branch at dispatch. */}
          <SettingRow title="Delivery Workflow" edited={edited('deliveryWorkflowMode')}
            description="How delivery orders are processed and settled in POS Sales.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  val: 'DEFAULT_SETTLEMENT', label: 'Default Settlement', Icon: CheckCircle,
                  desc: 'A sale from the moment it goes out. The cashier collects payment later in Delivery Settlement.',
                  steps: ['Process Delivery', 'Out for delivery — posted to sales', 'Settle payment or return'],
                },
                {
                  val: 'PI_FLOW', label: 'PI Flow (Pro-forma Invoice)', Icon: FileText,
                  desc: 'Goes out as a Draft Pro-forma Invoice. It becomes the real invoice, and reaches the reports, when settled.',
                  steps: ['Process Delivery — PI printed', 'Draft in Sales Invoices, stock held', 'Settle — PI becomes the invoice'],
                },
              ].map(({ val, label, Icon, desc, steps }) => {
                const active = d.deliveryWorkflowMode === val;
                return (
                  <button key={val} type="button" role="radio" aria-checked={active} onClick={() => patch({ deliveryWorkflowMode: val })}
                    className={`text-left rounded-xl border-2 p-4 transition-all ${active ? 'border-[#F5C742] bg-[#FFF8E7]/50' : 'border-gray-200 hover:border-[#F5C742]/50'}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                        <Icon className={`h-4 w-4 ${active ? 'text-[#1E293B]' : 'text-gray-400'}`} />
                      </div>
                      <p className="text-sm font-bold text-[#1E293B] flex-1">{label}</p>
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${active ? 'border-[#b8920e]' : 'border-gray-300'}`}>
                        {active && <span className="w-2 h-2 rounded-full bg-[#b8920e]" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">{desc}</p>
                    <ol className="mt-3 space-y-1.5">
                      {steps.map((step, i) => (
                        <li key={step} className="flex items-center gap-2 text-[11px] text-gray-600">
                          <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${active ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-200 text-gray-500'}`}>{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
              {d.deliveryWorkflowMode === 'PI_FLOW'
                ? 'With PI Flow, "Process Delivery" prints a Pro-forma Invoice and saves a Draft in Customers & Sales → Sales Invoices. Settling converts it to the final invoice, dated the day it is settled.'
                : 'With Default Settlement, the sale is in the sales reports and sales list as soon as it goes out; Delivery Settlement only collects the payment or returns the goods.'}
              {' '}Orders already out for delivery keep the workflow they left under.
            </p>
          </SettingRow>

          {/* A commercial decision the branch makes once, not something the cashier re-argues
              at the door of every refused delivery. */}
          <SettingRow title="Delivery Charge on a Refused Delivery" edited={edited('deliveryReturnChargePolicy')}
            description="The returned items are always credited. A partial return never waives the charge."
            control={<Choice value={d.deliveryReturnChargePolicy} onChange={val => patch({ deliveryReturnChargePolicy: val })} options={[
              { value: 'WAIVE', label: 'Waive', hint: 'The charge is cancelled with the goods. The order owes nothing and leaves the delivery list.' },
              { value: 'RETAIN', label: 'Keep Payable', hint: 'The trip was made, so the charge stands as a small balance to collect.' },
              { value: 'ASK', label: 'Ask Cashier', hint: 'The return dialog shows a waive toggle, defaulting to waived.' },
            ]} />} />
        </Section>

        {/* STORE CREDIT — a financial policy, so it lives here rather than being chosen per
            return at the till. The backend re-validates and resolves the final expiry date. */}
        <Section id="credit" icon={Gift} title="Store Credit" editedCount={editedIn('credit')}
          description="Credit vouchers issued by a Sales Return.">
          <SettingRow title="Credit Voucher Expiry" edited={edited('creditVoucherExpiryMode', 'creditVoucherExpiryMonths', 'creditVoucherExpiryDate')}
            description="Applies to vouchers issued from now on. Vouchers already issued keep the expiry date printed on them."
            control={<Choice value={d.creditVoucherExpiryMode} onChange={val => patch({ creditVoucherExpiryMode: val })} options={[
              { value: '', label: 'System Default', hint: 'Uses the configured default period (currently 12 months).' },
              { value: 'AUTO', label: 'Months After Issue', hint: 'Each voucher expires a fixed number of months after it is issued.' },
              { value: 'MANUAL', label: 'Fixed Date', hint: 'Every voucher expires on one calendar date.' },
            ]} />}>
            {d.creditVoucherExpiryMode === 'AUTO' && (
              <div className="flex items-center gap-3 flex-wrap rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                <label className="text-xs font-semibold text-[#1E293B]">Valid for</label>
                <input type="number" min={0} max={600}
                  value={d.creditVoucherExpiryMonths ?? ''}
                  onChange={(e) => patch({ creditVoucherExpiryMonths: e.target.value === '' ? '' : Number(e.target.value) })}
                  className={`${inputCls(false)} w-24`} />
                <span className="text-xs text-gray-500">months from the issue date</span>
                <span className="text-[11px] text-gray-400 w-full">Enter 0 for vouchers that never expire — some jurisdictions require this.</span>
              </div>
            )}
            {d.creditVoucherExpiryMode === 'MANUAL' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                  <label className="text-xs font-semibold text-[#1E293B]">All vouchers expire on</label>
                  <input type="date" value={d.creditVoucherExpiryDate || ''}
                    onChange={(e) => patch({ creditVoucherExpiryDate: e.target.value })}
                    className={inputCls(false)} />
                </div>
                <Note>Must be a future date. Once it passes, new vouchers fall back to the default period until this date is updated — so review it before it lapses.</Note>
              </div>
            )}
          </SettingRow>
        </Section>

        {/* APPROVALS & ACCESS */}
        <Section id="security" icon={ShieldCheck} title="Approvals & Access" editedCount={editedIn('security')}
          description="How a supervisor approves, and which operations need one.">
          {pinMissing && pinNeededBy.length > 0 && (
            <div className="px-6 pt-5">
              <Note tone="warn" title="No supervisor PIN is set for this branch">
                {pinNeededBy.join(', ')} {pinNeededBy.length === 1 ? 'asks' : 'ask'} for the branch PIN, so cashiers cannot get
                approval until one is set below.
              </Note>
            </div>
          )}

          {/* Shared by every approval prompt at the till (the policies below, Delivery
              Settlement, Business Day Close), so it is always shown. */}
          <SettingRow title="Approval Credential" tag={<KeyRound className="h-3.5 w-3.5 text-gray-400" />} edited={edited('supervisorApprovalMode', 'supervisorPin')}
            description="How a supervisor authenticates whenever the till asks for approval."
            control={<Choice value={d.supervisorApprovalMode} onChange={val => patch({ supervisorApprovalMode: val })} options={[
              { value: 'PIN', label: 'Branch PIN', hint: 'The supervisor enters the branch supervisor PIN set here.' },
              { value: 'PASSWORD', label: 'Own Password', hint: 'The supervisor signs in with their own username and password. The account must hold a supervisor role.' },
            ]} />}>
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 sm:w-56 shrink-0">
                <Lock className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-[#1E293B]">Branch Supervisor PIN</span>
                {pinSet
                  ? <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">Set</span>
                  : <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 rounded-full px-1.5 py-0.5">Not set</span>}
              </div>
              <input type="password" value={d.supervisorPin}
                onChange={e => patch({ supervisorPin: e.target.value })}
                maxLength={usesPin ? 8 : 64}
                placeholder={pinSet ? 'Leave blank to keep the current PIN' : 'e.g. 1234'}
                className={`${inputCls(false)} w-full sm:max-w-xs`} />
              <p className="text-[11px] text-gray-500 sm:flex-1">
                {usesPin
                  ? 'One PIN shared by all supervisors at this branch.'
                  : 'Not used for Password approvals, but still used for session takeover and cross-branch session transfer.'}
              </p>
            </div>
          </SettingRow>

          <SettingRow title="Approve Item Removal" edited={edited('requireSupervisorForVoid')}
            description="A line's Void / Remove button, and clearing a layaway being converted, ask for supervisor approval first. Lowering a quantity is not gated."
            control={<Switch checked={!!d.requireSupervisorForVoid} onCheckedChange={v => patch({ requireSupervisorForVoid: v })} />} />

          <SettingRow title="Approve Price Override" edited={edited('requirePriceOverrideApproval')}
            description="Selling below an item's minimum price (or cost, when no minimum is set) asks for approval, and checkout re-checks it on the server. When off, below-minimum prices are not checked."
            control={<Switch checked={!!d.requirePriceOverrideApproval} onCheckedChange={v => patch({ requirePriceOverrideApproval: v })} />} />

          {/* Who may use the right-hand Actions panel (Classic and Cart Focus) and the Functions
              slide-over (Compact). One branch-wide rule for all three screen templates, so it
              cannot be weakened by switching layouts. Enforced in POS/lib/posFunctionAccess.js. */}
          <SettingRow title="Action Button Access" tag={<ScopeTag>All screen templates</ScopeTag>} edited={edited('posFunctionAccessMode')}
            description="Who may use the Actions / Functions panel — Returns, Layaways, Coupons, Cash Drawer, Reprint, Delivery Settlement and the rest. Salesperson verification and Lock POS always stay available."
            control={<Choice value={d.posFunctionAccessMode} onChange={val => patch({ posFunctionAccessMode: val })} options={[
              { value: 'ALL_USERS', label: 'All Users', hint: 'Any signed-in user can use every action button.' },
              { value: 'SUPERVISOR_PASSWORD', label: 'With Approval', hint: `Anyone can use them once a supervisor approves each use with ${usesPin ? 'the branch supervisor PIN' : 'their own login'}. Supervisors are not asked.` },
              { value: 'SUPERVISOR_ONLY', label: 'Supervisors Only', hint: 'The signed-in user must hold a supervisor role. For everyone else the buttons are locked, with no approval prompt.' },
            ]} />} />

          <SettingRow title="Who Can Close the Business Day" edited={edited('requireSupervisorForDayClose')}
            description="Who may perform the Business Day (Z Report) close."
            control={<Choice value={!!d.requireSupervisorForDayClose} onChange={val => patch({ requireSupervisorForDayClose: val })} options={[
              { value: false, label: 'All Users', hint: 'Any authenticated POS user.' },
              { value: true, label: 'Supervisors Only', hint: 'The user must be signed in with a supervisor role.' },
            ]} />} />

          {/* Closing Approval — administrator sign-off for X (session) and Z (Business Day) closes. */}
          <SettingRow title="Administrator Sign-off on Closing" edited={edited('requireAdminApprovalForSessionClose', 'requireAdminApprovalForDayClose')}
            description="An administrator (Admin or Branch Admin role) approves the close with their own username and password. No prompt when an administrator is already signed in. Supervisors and managers cannot approve.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['requireAdminApprovalForSessionClose', 'X Report', 'Session close'],
                ['requireAdminApprovalForDayClose', 'Z Report', 'Business Day close'],
              ].map(([key, report, what]) => (
                <label key={key} className={`flex items-center justify-between gap-3 py-3 px-4 rounded-xl border transition-colors ${
                  d[key] ? 'border-[#FDE6A9] bg-[#FFF8E7]/60' : 'border-gray-200 bg-white'
                }`}>
                  <span className="flex items-center gap-2.5">
                    <Receipt className={`h-4 w-4 ${d[key] ? 'text-[#b8920e]' : 'text-gray-300'}`} />
                    <span>
                      <span className="block text-sm font-semibold text-[#1E293B]">{report} — {what}</span>
                      <span className="block text-[11px] text-gray-500">{d[key] ? 'Administrator approval required' : 'No approval needed'}</span>
                    </span>
                  </span>
                  <Switch checked={!!d[key]} onCheckedChange={v => patch({ [key]: v })} />
                </label>
              ))}
            </div>
          </SettingRow>
        </Section>

        {/* BUSINESS DAY */}
        <Section id="businessDay" icon={Clock} title="Business Day" editedCount={editedIn('businessDay')}
          description="How POS sessions are grouped into Trading Dates for Day Close, X and Z Reports.">
          {/* The schedule is frozen while sessions trade against it: an open session's Trading
              Date is immutable, so re-timing the window underneath it would strand it on a
              previous Business Day. The extension stays editable — it cannot move a Trading Date. */}
          {scheduleLocked && (
            <div className="px-6 pt-5">
              <Note title={`Schedule locked${scheduleLockCount > 0 ? ` — ${scheduleLockCount} active session${scheduleLockCount === 1 ? '' : 's'}` : ''}`}>
                {scheduleLockReason} Extension After End Time can still be changed — it shifts only the closing time, never a session's Trading Date.
              </Note>
            </div>
          )}

          <SettingRow title="Business Day Window" edited={edited('operatingHoursEnabled')}
            description={d.operatingHoursEnabled
              ? 'The Business Day runs on the schedule below.'
              : 'Off — the Business Day follows the calendar day.'}
            control={<Switch checked={!!d.operatingHoursEnabled} disabled={scheduleLocked} onCheckedChange={v => patch({ operatingHoursEnabled: v })} />} />

          {d.operatingHoursEnabled && (
            <SettingRow title="Schedule" edited={edited('operatingStartTime', 'operatingEndTime', 'businessDayExtensionMinutes')}
              description="An end time earlier than the start time carries the Business Day past midnight.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Start</label>
                  <input type="time" value={(d.operatingStartTime || '').slice(0, 5)} disabled={scheduleLocked}
                    title={scheduleLocked ? scheduleLockReason : undefined}
                    onChange={e => patch({ operatingStartTime: e.target.value ? `${e.target.value}:00` : '' })}
                    className={`${inputCls(scheduleLocked)} w-full`} />
                  <p className="text-[11px] text-gray-400 mt-1">The Business Day begins.</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Scheduled End</label>
                  <input type="time" value={(d.operatingEndTime || '').slice(0, 5)} disabled={scheduleLocked}
                    title={scheduleLocked ? scheduleLockReason : undefined}
                    onChange={e => patch({ operatingEndTime: e.target.value ? `${e.target.value}:00` : '' })}
                    className={`${inputCls(scheduleLocked)} w-full`} />
                  {/* Worded to correct the most common misreading: this does NOT close the day. */}
                  <p className="text-[11px] text-gray-400 mt-1">Normal hours end. This does <span className="font-semibold">not</span> close the day.</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Extension After End</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" step="15"
                      value={Number.isFinite(d.businessDayExtensionMinutes) ? d.businessDayExtensionMinutes : 0}
                      onChange={e => patch({ businessDayExtensionMinutes: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                      className={`${inputCls(false)} w-24`} />
                    <span className="text-xs text-gray-500">min</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[0, 30, 60, 120, 180].map(preset => (
                      <button key={preset} type="button" onClick={() => patch({ businessDayExtensionMinutes: preset })}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                          (d.businessDayExtensionMinutes || 0) === preset
                            ? 'bg-[#FFF8E7] border-[#FDE6A9] text-[#b8920e] font-semibold'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {preset === 0 ? 'None' : preset < 60 ? `${preset}m` : `${preset / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live restatement of the phases from the values entered — far more reliable than
                  expecting the operator to derive closure time from two fields and a duration. */}
              {preview && (
                <div className="mt-5 rounded-xl border border-gray-200 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">With these settings</p>
                  <BusinessDayTimeline preview={preview} />
                  <ul className="mt-3 space-y-1 text-[11px] text-[#1E293B]">
                    <li className="flex gap-1.5"><ChevronRight className="h-3 w-3 mt-0.5 text-gray-300" /><span><b>{preview.start} → {preview.end}</b> — Business Day active</span></li>
                    {preview.extensionMinutes > 0
                      ? <li className="flex gap-1.5"><ChevronRight className="h-3 w-3 mt-0.5 text-gray-300" /><span><b>{preview.end} → {preview.closure}</b> — extension period, trading continues</span></li>
                      : <li className="flex gap-1.5 text-gray-500"><ChevronRight className="h-3 w-3 mt-0.5 text-gray-300" /><span>No extension — the Business Day closes at {preview.end}</span></li>}
                    <li className="flex gap-1.5"><ChevronRight className="h-3 w-3 mt-0.5 text-gray-300" /><span><b>{preview.closure}</b> — Business Day closes, new sessions blocked until <b>{preview.start}</b> the next day</span></li>
                  </ul>
                </div>
              )}
            </SettingRow>
          )}
        </Section>

        {/* Unsaved-changes bar */}
        {changed.size > 0 && (
          <div className="sticky bottom-4 z-10">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#FFF8E7] border-2 border-[#F5C742] text-[#1E293B] px-5 py-3 shadow-xl">
              <p className="text-sm font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#b8920e]" />
                {changed.size} unsaved change{changed.size === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={beginEditSettings} disabled={settingsSaving}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-[#1E293B] hover:bg-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                  <Undo2 className="h-4 w-4" />Discard
                </button>
                <button type="button" onClick={handleSaveSettings} disabled={settingsSaving}
                  className="flex items-center gap-1.5 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-4 py-1.5 rounded-lg">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
