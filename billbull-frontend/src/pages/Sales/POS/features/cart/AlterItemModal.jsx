import React, { useEffect, useState } from 'react';
import { Hash, Tag, Percent, X, Delete, CornerDownLeft, ArrowUp, ArrowDown, Lock } from 'lucide-react';
import { DirhamSymbol } from '../../POSCurrency';
import { createBurstTracker } from '../../device/scanner/scanGuard';

/**
 * Alter Item — one dialog for a cart line's Quantity, Unit Price and Discount (Classic and Cart
 * Focus layouts).
 *
 * <p>Opened by clicking a cart row, the Add Qty / Price / Disc % action buttons, or the F4 / F9 /
 * F8 sale shortcuts. The three sections hold independent drafts, so the cashier can change qty,
 * price and discount in one pass and confirm once. An empty draft means "leave as is".
 *
 * <p>Input-scope contract: this dialog is the item keypad (classicNumpadMode), so it stays
 * in the ITEM_ENTRY scope rather than registering as a MODAL overlay. The focus controller then
 * keeps the caret on `inputRef` (the QUANTITY / DISCOUNT / PRICE target), the scanner is held off
 * the sale, and the SALE shortcuts (Enter-to-checkout, +/−, Delete) stand down. For that reason the
 * root deliberately avoids the `.fixed.inset-0` class pair: isPosScreenBlocked() treats it as an
 * unregistered overlay, which would flip the scope to MODAL and leave the field without an owner.
 * Under the legacy input path (posInputV2 off) there is no scope, so `suppressLegacyScan` marks the
 * dialog for the legacy wedge listener instead.
 *
 * <p>A barcode scanned into the field (a scanner-speed burst ended by Enter) is refused rather than
 * applied: a 13-digit EAN must never become a unit price or a quantity. The draft is cleared and
 * `onScanRefused` tells the cashier.
 *
 * <p>Every button cancels its mousedown, so the caret never leaves the field and the keyboard
 * keeps working after a pointer tap: digits type, ↑/↓ or Tab move between sections, ←/→ switch
 * % / amount on Discount, Q / P / D (or F4 / F9 / F8) jump to a section, Enter applies, Esc cancels.
 */
const MODES = ['qty', 'price', 'discount'];

const SECTIONS = {
  qty: {
    label: 'Quantity', key: 'Q', Icon: Hash, fieldLabel: 'New quantity',
    active: 'border-blue-400 bg-blue-50/70 ring-4 ring-blue-100',
    icon: 'bg-blue-600 text-white', text: 'text-blue-700',
  },
  price: {
    label: 'Unit Price', key: 'P', Icon: Tag, fieldLabel: 'New unit price',
    active: 'border-purple-400 bg-purple-50/70 ring-4 ring-purple-100',
    icon: 'bg-purple-600 text-white', text: 'text-purple-700',
  },
  discount: {
    label: 'Discount', key: 'D', Icon: Percent, fieldLabel: 'Discount',
    active: 'border-[#F5C742] bg-[#FFF8E7] ring-4 ring-[#F5C742]/25',
    icon: 'bg-[#F5C742] text-[#1E293B]', text: 'text-[#B8942E]',
  },
};

// Same section keys as the sale-screen shortcuts (posShortcuts.SALE_FUNCTION_KEYS).
const FUNCTION_KEY_MODES = { F4: 'qty', F8: 'discount', F9: 'price' };

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const sanitize = (raw) => {
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('').slice(0, 3)}` : head;
};

// Every button keeps the caret in the field: a tap must never move focus onto the button,
// where the next Enter would press it again instead of confirming the value.
const keepFocus = (e) => e.preventDefault();

const AlterItemModal = ({
  item,
  mode,
  onModeChange,
  value,
  onValueChange,
  discountType,
  onDiscountTypeChange,
  inputRef,
  onApply,
  onClose,
  formatCurrency,
  suppressLegacyScan = false,
  onScanRefused,
}) => {
  // Keystroke timing on the field, so a scan can be told apart from a typed value.
  const [burst] = useState(() => createBurstTracker());
  // Drafts for the sections that are not on screen. The visible section's draft is `value`, which
  // POSSales owns (classicNumpadValue) so the keypad state survives a re-render of the template.
  const [drafts, setDrafts] = useState({ qty: '', price: '', discount: '' });
  const draftOf = (m) => (m === mode ? value : drafts[m]);
  const qtyLocked = Boolean(item.batchControlled);

  useEffect(() => {
    // A batch/serial line is one unit by definition — never open on a field it cannot change.
    if (qtyLocked && mode === 'qty') onModeChange('price');
  }, [qtyLocked, mode, onModeChange]);

  const switchMode = (next) => {
    if (next === mode || !MODES.includes(next)) return;
    if (next === 'qty' && qtyLocked) return;
    setDrafts((d) => ({ ...d, [mode]: value }));
    onValueChange(drafts[next] || '');
    onModeChange(next);
  };

  const step = (dir) => {
    const usable = MODES.filter((m) => !(m === 'qty' && qtyLocked));
    const idx = usable.indexOf(mode);
    switchMode(usable[(idx + dir + usable.length) % usable.length]);
  };

  // ── What the line becomes ────────────────────────────────────────────────────────────────
  const preview = (() => {
    const qtyDraft = num(draftOf('qty'));
    const priceDraft = num(draftOf('price'));
    const discDraft = num(draftOf('discount'));
    const quantity = qtyDraft != null && qtyDraft > 0 && !qtyLocked ? Math.round(qtyDraft) : null;
    const price = priceDraft != null && priceDraft > 0 ? priceDraft : null;
    const q = quantity ?? item.quantity;
    const p = price ?? item.price;
    const gross = q * p;
    let discount = null;
    if (discDraft != null && draftOf('discount') !== '') {
      discount = discountType === 'amount'
        ? (gross > 0 ? Math.min((discDraft / gross) * 100, 100) : 0)
        : Math.min(discDraft, 100);
    }
    const d = discount ?? (Number(item.discount) || 0);
    return {
      quantity, price, discount, q, p, d,
      total: gross * (1 - d / 100),
      currentTotal: item.quantity * item.price * (1 - (Number(item.discount) || 0) / 100),
      changed: quantity != null || price != null || discount != null,
    };
  })();

  const apply = () => {
    if (!preview.changed) return;
    onApply({ quantity: preview.quantity, price: preview.price, discount: preview.discount });
  };

  const press = (k) => onValueChange(sanitize(`${value}${k}`));

  const onKeyDown = (e) => {
    const { key } = e;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    if (key === 'Escape') { handled(); onClose(); return; }
    if (key === 'Enter') {
      handled();
      const scanEnter = burst.isScanEnter();
      burst.reset();
      if (scanEnter) { onValueChange(''); onScanRefused?.(); return; }
      apply();
      return;
    }
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) burst.key();
    if (FUNCTION_KEY_MODES[key]) { handled(); switchMode(FUNCTION_KEY_MODES[key]); return; }
    if (key === 'ArrowDown' || (key === 'Tab' && !e.shiftKey)) { handled(); step(1); return; }
    if (key === 'ArrowUp' || (key === 'Tab' && e.shiftKey)) { handled(); step(-1); return; }
    if (mode === 'discount' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      handled();
      onDiscountTypeChange(discountType === 'percent' ? 'amount' : 'percent');
      return;
    }
    if (key === 'Delete') { handled(); onValueChange(''); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || key.length !== 1) return;
    const lower = key.toLowerCase();
    if (lower === 'q') { handled(); switchMode('qty'); return; }
    if (lower === 'p') { handled(); switchMode('price'); return; }
    if (lower === 'd') { handled(); switchMode('discount'); return; }
    if (mode === 'discount' && key === '%') { handled(); onDiscountTypeChange('percent'); return; }
    if (mode === 'discount' && lower === 'a') { handled(); onDiscountTypeChange('amount'); return; }
  };

  const currentLabel = (m) => {
    if (m === 'qty') return `× ${item.quantity}`;
    if (m === 'price') return formatCurrency(item.price);
    return Number(item.discount) > 0 ? `${Number(item.discount).toFixed(2).replace(/\.00$/, '')}%` : 'None';
  };

  const draftLabel = (m) => {
    const raw = draftOf(m);
    if (raw === '' || raw == null) return null;
    if (m === 'qty') return qtyLocked ? null : `× ${Math.round(num(raw) || 0)}`;
    if (m === 'price') return formatCurrency(num(raw) || 0);
    return discountType === 'amount' ? formatCurrency(num(raw) || 0) : `${raw}%`;
  };

  const active = SECTIONS[mode] || SECTIONS.qty;
  const code = item.barcode || item.itemCode || item.code || item.sku;
  const fieldLabel = mode === 'discount'
    ? (discountType === 'percent' ? 'Discount %' : 'Discount amount')
    : active.fieldLabel;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center bg-[#0F172A]/55 backdrop-blur-[2px] p-4"
      data-pos-scan-suppress={suppressLegacyScan ? 'true' : undefined}
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alter-item-title"
        onKeyDown={onKeyDown}
        className="w-full max-w-180 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 border-b border-gray-100 px-5 pt-4 pb-3">
          <span className="absolute left-0 top-4 bottom-3 w-1 rounded-r bg-[#327F74]" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#327F74]">Alter Item</p>
            <h2 id="alter-item-title" className="truncate text-base font-bold text-[#1E293B]">{item.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
              {code && <span className="font-mono">{code}</span>}
              <span>{item.quantity} × {formatCurrency(item.price)}</span>
              <span className="font-semibold text-[#1E293B]">= {formatCurrency(preview.currentTotal)}</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Close alter item"
            onMouseDown={keepFocus}
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* Sections */}
          <div role="tablist" aria-orientation="vertical" aria-label="Field to alter" className="flex flex-col gap-2">
            {MODES.map((m) => {
              const s = SECTIONS[m];
              const isActive = m === mode;
              const locked = m === 'qty' && qtyLocked;
              const draft = draftLabel(m);
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={s.label}
                  disabled={locked}
                  onMouseDown={keepFocus}
                  onClick={() => switchMode(m)}
                  className={`group flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                    isActive ? s.active : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  } ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? s.icon : 'bg-gray-100 text-gray-500'}`}>
                    {locked ? <Lock className="h-4 w-4" /> : <s.Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-center justify-between text-sm font-bold ${isActive ? s.text : 'text-[#1E293B]'}`}>
                      {s.label}
                      <kbd className="rounded border border-gray-200 bg-white px-1 text-[9px] font-semibold text-gray-400">{s.key}</kbd>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] tabular-nums">
                      <span className={draft ? 'text-gray-400 line-through' : 'text-gray-500'}>{currentLabel(m)}</span>
                      {draft && <span className={`font-bold ${s.text}`}>→ {draft}</span>}
                      {locked && <span className="text-gray-400">· batch line</span>}
                    </span>
                  </span>
                </button>
              );
            })}

            {/* New line total */}
            <div className="mt-auto rounded-xl bg-[#1E293B] px-3 py-2.5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">New line total</p>
              <p className="text-lg font-black tabular-nums text-[#F5C742]">{formatCurrency(preview.total)}</p>
              <p className="text-[10px] tabular-nums text-white/60">
                {preview.q} × {formatCurrency(preview.p)}{preview.d > 0 ? ` − ${preview.d.toFixed(2).replace(/\.00$/, '')}%` : ''}
              </p>
            </div>
          </div>

          {/* Entry */}
          <div className="flex flex-col gap-2">
            {mode === 'discount' && (
              <div role="radiogroup" aria-label="Discount type" className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
                {[['percent', <><Percent className="h-3.5 w-3.5" /> Percent</>], ['amount', <><DirhamSymbol /> Amount</>]].map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={discountType === t}
                    onMouseDown={keepFocus}
                    onClick={() => onDiscountTypeChange(t)}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                      discountType === t ? 'bg-white text-[#1E293B] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <label className={`flex items-center gap-2 rounded-xl border-2 bg-gray-50 px-3 py-2 focus-within:bg-white ${active.active.split(' ')[0]}`}>
              <span className={`shrink-0 text-[10px] font-black uppercase tracking-wide ${active.text}`}>{fieldLabel}</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                autoFocus
                autoComplete="off"
                aria-label={fieldLabel}
                placeholder={mode === 'qty' ? String(item.quantity) : mode === 'price' ? Number(item.price).toFixed(2) : String(Number(item.discount) || 0)}
                value={value}
                onChange={(e) => onValueChange(sanitize(e.target.value))}
                className="min-w-0 flex-1 bg-transparent text-right font-mono text-2xl font-bold text-[#1E293B] placeholder:text-gray-300 focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-3 gap-1.5">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => press(k)}
                  className="h-12 rounded-xl border border-gray-200 bg-white text-lg font-bold text-[#1E293B] shadow-[0_1px_0_rgba(15,23,42,0.06)] transition-all hover:border-[#F5C742] hover:bg-[#FFF8E7] active:scale-95"
                >
                  {k}
                </button>
              ))}
              <button
                type="button"
                aria-label="Backspace"
                onMouseDown={keepFocus}
                onClick={() => onValueChange(value.slice(0, -1))}
                className="flex h-12 items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 active:scale-95"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-[1fr_2fr] gap-1.5">
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => onValueChange('')}
                className="h-12 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
              >
                Clear
              </button>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={apply}
                disabled={!preview.changed}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F5C742] text-sm font-black text-[#1E293B] shadow-sm transition-colors hover:bg-[#e6b838] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply changes <CornerDownLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-gray-50/80 px-5 py-2 text-[10px] text-gray-500 rounded-b-2xl">
          <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" /><ArrowDown className="h-3 w-3" /> / Tab switch field</span>
          <span><b className="text-gray-600">Q P D</b> or <b className="text-gray-600">F4 F9 F8</b> jump</span>
          {mode === 'discount' && <span><b className="text-gray-600">← →</b> % / amount</span>}
          <span><b className="text-gray-600">Enter</b> apply</span>
          <span><b className="text-gray-600">Esc</b> cancel</span>
        </div>
      </div>
    </div>
  );
};

export default AlterItemModal;
