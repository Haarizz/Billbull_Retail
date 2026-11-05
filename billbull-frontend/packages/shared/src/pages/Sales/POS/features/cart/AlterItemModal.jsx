import React, { useEffect, useRef, useState } from 'react';
import { Hash, Tag, Percent, X, Delete, CornerDownLeft, ArrowUp, ArrowDown, ArrowRight, Lock, Package, Boxes, Check, Loader2 } from 'lucide-react';
import { DirhamSymbol } from '../../POSCurrency';
import { createBurstTracker } from '../../device/scanner/scanGuard';
import { lineUnitLocked, sameUnit, unitOfLine, unitPriceFor } from './lineUnits';

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
 *
 * <p>`variant="panel"` renders the same editor inline (Cart Focus puts it in place of the last-item
 * card and scan keypad in its middle column) instead of as a centred overlay. Behaviour is shared;
 * only the layout differs.
 *
 * <p>Unit: the packing units the product sells in (piece, box, carton …), loaded through
 * `loadUnits(item)` with server-resolved prices. Picking one re-prices the line per that unit
 * (unless a price is keyed too). In this section the keypad digits pick a unit by its number, and
 * ←/→ step through the list. Locked for batch/serial lines and Sales Order lines.
 */
const MODES = ['qty', 'price', 'discount', 'unit'];

const SECTIONS = {
  qty: { label: 'Quantity', short: 'Qty', key: 'Q', fKey: 'F4', Icon: Hash, fieldLabel: 'New quantity' },
  price: { label: 'Unit Price', short: 'Price', key: 'P', fKey: 'F9', Icon: Tag, fieldLabel: 'New unit price' },
  discount: { label: 'Discount', short: 'Disc', key: 'D', fKey: 'F8', Icon: Percent, fieldLabel: 'Discount' },
  unit: { label: 'Unit', short: 'Unit', key: 'U', fKey: null, Icon: Boxes, fieldLabel: 'Unit no.' },
};

const fmtConversion = (c) => {
  const n = Number(c);
  return Number.isFinite(n) ? String(Number(n.toFixed(3))) : '1';
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

// The dialog opens over the cart row that was tapped, so the trailing tap of a fast double/triple
// tap lands on the backdrop. Backdrop taps inside this window after opening are ignored.
const BACKDROP_GRACE_MS = 450;

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
  variant = 'dialog',
  // (item) => Promise<unit option[]> — the product's sale units, priced. Absent: no Unit section.
  loadUnits,
}) => {
  // Keystroke timing on the field, so a scan can be told apart from a typed value.
  const [burst] = useState(() => createBurstTracker());
  // Drafts for the sections that are not on screen. The visible section's draft is `value`, which
  // POSSales owns (classicNumpadValue) so the keypad state survives a re-render of the template.
  const [drafts, setDrafts] = useState({ qty: '', price: '', discount: '' });
  const draftOf = (m) => (m === mode ? value : drafts[m]);
  const qtyLocked = Boolean(item.batchControlled);

  // Sale units: null while loading, [] when there are none (or they could not be loaded).
  const [units, setUnits] = useState(loadUnits ? null : []);
  const [unitsError, setUnitsError] = useState('');
  const [unitDraft, setUnitDraft] = useState(null);
  useEffect(() => {
    if (!loadUnits) return undefined;
    let cancelled = false;
    Promise.resolve(loadUnits(item))
      .then((list) => { if (!cancelled) setUnits(Array.isArray(list) ? list : []); })
      .catch((err) => {
        if (cancelled) return;
        setUnits([]);
        setUnitsError(err?.response?.data?.message || 'Units could not be loaded.');
      });
    return () => { cancelled = true; };
    // One load per opened line (the dialog is keyed by line id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const currentUnit = unitOfLine(item, units);
  const unitLocked = !loadUnits || lineUnitLocked(item) || (Array.isArray(units) && units.length < 2);
  const chosenUnit = unitDraft && !sameUnit(unitDraft.unit, currentUnit?.unit) ? unitDraft : null;
  const pickUnit = (u) => setUnitDraft(u && !sameUnit(u.unit, currentUnit?.unit) ? u : null);
  const isLocked = (m) => (m === 'qty' && qtyLocked) || (m === 'unit' && unitLocked);
  // Backdrop dismissal needs a press that both starts and ends on the backdrop, after the grace
  // window — so a tap that began on the cart row (before the dialog existed) can never close it.
  const openedAtRef = useRef(0);
  const backdropPressRef = useRef(false);
  useEffect(() => { openedAtRef.current = Date.now(); }, []);
  const onBackdropPointerDown = (e) => {
    backdropPressRef.current = e.target === e.currentTarget
      && Date.now() - openedAtRef.current >= BACKDROP_GRACE_MS;
  };
  const onBackdropClick = (e) => {
    const pressed = backdropPressRef.current;
    backdropPressRef.current = false;
    if (pressed && e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    // A batch/serial line is one unit by definition — never open on a field it cannot change.
    if (qtyLocked && mode === 'qty') onModeChange('price');
    // A product that turns out to sell in one unit only has nothing to pick.
    if (unitLocked && mode === 'unit') onModeChange(qtyLocked ? 'price' : 'qty');
  }, [qtyLocked, unitLocked, mode, onModeChange]);

  const switchMode = (next) => {
    if (next === mode || !MODES.includes(next)) return;
    if (isLocked(next)) return;
    setDrafts((d) => ({ ...d, [mode]: value }));
    onValueChange(drafts[next] || '');
    onModeChange(next);
  };

  const step = (dir) => {
    const usable = MODES.filter((m) => !isLocked(m) || m === mode);
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
    const p = price ?? (chosenUnit ? unitPriceFor(item, chosenUnit) : item.price);
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
      changed: quantity != null || price != null || discount != null || chosenUnit != null,
    };
  })();

  const apply = () => {
    if (!preview.changed) return;
    onApply({ quantity: preview.quantity, price: preview.price, discount: preview.discount, unit: chosenUnit });
  };

  // In the Unit section a digit picks that unit by its number in the list.
  const pickUnitByNumber = (k) => {
    const n = Number(k);
    if (Array.isArray(units) && n >= 1 && n <= units.length) pickUnit(units[n - 1]);
  };
  const stepUnit = (dir) => {
    if (!Array.isArray(units) || units.length === 0) return;
    const shown = chosenUnit || currentUnit;
    const idx = Math.max(0, units.findIndex((u) => sameUnit(u.unit, shown?.unit)));
    pickUnit(units[(idx + dir + units.length) % units.length]);
  };

  const press = (k) => {
    if (mode === 'unit') { pickUnitByNumber(k); return; }
    onValueChange(sanitize(`${value}${k}`));
  };

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
    if (mode === 'unit' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      handled();
      stepUnit(key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (key === 'Delete') { handled(); if (mode === 'unit') setUnitDraft(null); else onValueChange(''); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || key.length !== 1) return;
    const lower = key.toLowerCase();
    if (lower === 'q') { handled(); switchMode('qty'); return; }
    if (lower === 'p') { handled(); switchMode('price'); return; }
    if (lower === 'd') { handled(); switchMode('discount'); return; }
    if (lower === 'u') { handled(); switchMode('unit'); return; }
    if (mode === 'unit') { handled(); pickUnitByNumber(key); return; }
    if (mode === 'discount' && key === '%') { handled(); onDiscountTypeChange('percent'); return; }
    if (mode === 'discount' && lower === 'a') { handled(); onDiscountTypeChange('amount'); return; }
  };

  const lineUnitName = currentUnit?.unit || item.unit || null;
  const currentLabel = (m) => {
    if (m === 'qty') return `× ${item.quantity}`;
    if (m === 'price') return formatCurrency(item.price);
    if (m === 'unit') return units === null && loadUnits ? '…' : (lineUnitName || '—');
    return Number(item.discount) > 0 ? `${Number(item.discount).toFixed(2).replace(/\.00$/, '')}%` : 'None';
  };

  const draftLabel = (m) => {
    if (m === 'unit') return chosenUnit ? chosenUnit.unit : null;
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

  const field = (className) => (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoFocus
      autoComplete="off"
      aria-label={mode === 'unit' ? 'Unit — key its number' : fieldLabel}
      placeholder={mode === 'unit'
        ? ((chosenUnit || currentUnit)?.unit || '—')
        : mode === 'qty' ? String(item.quantity) : mode === 'price' ? Number(item.price).toFixed(2) : String(Number(item.discount) || 0)}
      value={mode === 'unit' ? '' : value}
      onChange={(e) => { if (mode !== 'unit') onValueChange(sanitize(e.target.value)); }}
      className={className}
    />
  );

  // The packing units, as the prototype lays them out: multiplier badge, name, price per unit.
  const baseUnit = Array.isArray(units) ? units.find((u) => u.base) : null;
  const baseLabel = baseUnit?.symbol || baseUnit?.unit || 'pc';
  const shownUnit = chosenUnit || currentUnit;
  const unitList = (
    <div role="radiogroup" aria-label="Packing unit" className="flex flex-col gap-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">Select packing unit</p>
      {units === null && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading units…
        </p>
      )}
      {Array.isArray(units) && units.length < 2 && (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
          {unitsError || 'This item is sold in one unit only.'}
        </p>
      )}
      {Array.isArray(units) && units.length >= 2 && units.map((u, i) => {
        const selected = sameUnit(u.unit, shownUnit?.unit);
        const conv = Number(u.conversion) || 1;
        // The line's own unit shows what the line charges now (it may carry a keyed price).
        const price = sameUnit(u.unit, currentUnit?.unit) ? Number(item.price) || 0 : unitPriceFor(item, u);
        return (
          <button
            key={u.unit}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${u.unit} (${i + 1})`}
            onMouseDown={keepFocus}
            onClick={() => pickUnit(u)}
            className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all ${
              selected
                ? 'border-[#327F74] bg-[#327F74]/5 ring-4 ring-[#327F74]/10'
                : 'border-gray-200 bg-white hover:border-[#327F74]/40 hover:bg-gray-50'
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black tabular-nums ${
              selected ? 'bg-[#327F74] text-white' : 'bg-gray-100 text-gray-600'
            }`}
            >
              {fmtConversion(conv)}×
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[#1E293B]">{u.unit}</span>
              <span className="block truncate text-[11px] text-gray-500">
                {u.base ? (code || 'Base unit') : `${fmtConversion(conv)} × ${baseLabel}`}
                <kbd className="ml-2 rounded border border-gray-200 bg-white px-1 text-[9px] font-semibold text-gray-400">{i + 1}</kbd>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className={`block text-sm font-black tabular-nums ${selected ? 'text-[#327F74]' : 'text-[#1E293B]'}`}>{formatCurrency(price)}</span>
              {!u.base && conv > 0 && (
                <span className="block text-[10px] tabular-nums text-gray-400">{formatCurrency(price / conv)}/{baseLabel}</span>
              )}
            </span>
            {selected && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#327F74] text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const discountToggle = (track, on, off) => mode === 'discount' && (
    <div role="radiogroup" aria-label="Discount type" className={`grid grid-cols-2 gap-1 rounded-xl p-1 ${track}`}>
      {[['percent', <><Percent className="h-3.5 w-3.5" /> Percent</>], ['amount', <><DirhamSymbol /> Amount</>]].map(([t, label]) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={discountType === t}
          onMouseDown={keepFocus}
          onClick={() => onDiscountTypeChange(t)}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${discountType === t ? on : off}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (variant === 'panel') {
    // Inline editor (Cart Focus middle column): dark header with the line and its three fields,
    // keypad below. role="dialog" without aria-modal — a non-modal editor; the cart stays usable.
    return (
      <div
        role="dialog"
        aria-labelledby="alter-item-title"
        onKeyDown={onKeyDown}
        data-pos-scan-suppress={suppressLegacyScan ? 'true' : undefined}
        className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white"
      >
        <div className="bg-linear-to-br from-[#FFF8E7] to-white border-l-4 border-[#F5C742] border-b border-b-[#327F74]/20 px-5 pt-4 pb-5 text-[#1E293B] shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#B8942E]">Alter Item</p>
            <button
              type="button"
              aria-label="Close alter item"
              onMouseDown={keepFocus}
              onClick={onClose}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#F5C742]/40 bg-[#F5C742]/15 text-[#B8942E]">
              <Package className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="alter-item-title" className="truncate text-base font-bold">{item.name}</h2>
              <p className="truncate text-[11px] tabular-nums text-gray-500">
                ×{item.quantity} · {formatCurrency(item.price)} each{code ? ` · ${code}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">{preview.changed ? 'New total' : 'Total'}</p>
              <p className="text-xl font-black tabular-nums text-[#B8942E]">{formatCurrency(preview.total)}</p>
            </div>
          </div>

          <div role="tablist" aria-label="Field to alter" className="grid grid-cols-2 gap-2">
            {MODES.map((m) => {
              const s = SECTIONS[m];
              const isActive = m === mode;
              const locked = isLocked(m);
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
                  className={`flex flex-col items-center justify-center rounded-xl border-2 px-2 py-2.5 transition-colors ${
                    isActive
                      ? 'border-[#F5C742] bg-[#F5C742]/15 text-[#1E293B] shadow-sm'
                      : 'border-[#327F74]/15 bg-white text-[#1E293B] shadow-sm hover:border-[#F5C742]/60 hover:bg-[#FFF8E7]'
                  } ${locked ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  <span className="flex items-center gap-1 text-base font-bold">
                    {locked && <Lock className="h-3.5 w-3.5" />}{s.short}
                  </span>
                  <span className={`mt-0.5 truncate text-[11px] tabular-nums ${isActive ? 'text-[#B8942E]' : 'text-gray-500'}`}>
                    {draft ? `→ ${draft}` : (m === 'discount' && !(Number(item.discount) > 0) ? '—' : currentLabel(m))}
                  </span>
                </button>
              );
            })}
          </div>

          {mode === 'discount' && (
            <div className="mt-3">
              {discountToggle('bg-[#327F74]/10', 'bg-[#F5C742] text-[#1E293B] shadow-sm', 'text-gray-500 hover:text-gray-700')}
            </div>
          )}

          <label className="mt-3 flex items-center gap-3 rounded-xl border-2 border-[#F5C742] bg-white px-4 py-3 shadow-sm">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#B8942E]">{fieldLabel}</span>
            {field('min-w-0 flex-1 bg-transparent text-right font-mono text-2xl font-bold text-[#1E293B] placeholder:text-gray-300 focus:outline-none')}
          </label>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          {mode === 'unit' ? unitList : (
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map((k) => (
              <button
                key={k}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => press(k)}
                className={`h-12 rounded-xl border border-gray-200 text-xl font-bold shadow-sm transition-all hover:border-[#F5C742] hover:bg-[#FFF8E7] active:scale-95 ${
                  k === '.' ? 'bg-[#FFF8E7] text-[#B8942E]' : 'bg-gray-50 text-[#1E293B]'
                }`}
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
          )}
          <div className="mt-auto grid grid-cols-2 gap-2">
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => (mode === 'unit' ? setUnitDraft(null) : onValueChange(''))}
              className="h-12 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-500 transition-colors hover:bg-red-100"
            >
              Clear
            </button>
            <button
              type="button"
              aria-label="Apply changes"
              onMouseDown={keepFocus}
              onClick={apply}
              disabled={!preview.changed}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#327F74] text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#2a6b62] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Alter <CornerDownLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Why a section cannot be changed, shown under its name.
  const lockReason = (m) => {
    if (m === 'qty' && qtyLocked) return 'Batch line';
    if (m === 'unit' && lineUnitLocked(item)) return item.batchControlled ? 'Batch line' : 'Order line';
    if (m === 'unit' && Array.isArray(units)) return unitsError ? 'Unavailable' : 'Single unit';
    return null;
  };

  const delta = preview.total - preview.currentTotal;
  const deltaTone = delta > 0.0005 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : delta < -0.0005 ? 'bg-red-50 text-red-600 ring-red-200'
      : 'bg-gray-100 text-gray-500 ring-gray-200';
  const breakdown = `${preview.q} × ${formatCurrency(preview.p)}${preview.d > 0 ? ` − ${preview.d.toFixed(2).replace(/\.00$/, '')}%` : ''}`;
  const kbd = 'inline-flex min-w-[1.25rem] items-center justify-center rounded-md border border-gray-200 bg-white px-1 py-px font-mono text-[10px] font-semibold text-gray-500 shadow-[0_1px_0_rgba(15,23,42,0.08)]';

  return (
    <div
      className="fixed top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center bg-[#0F172A]/55 backdrop-blur-[2px] p-4"
      data-pos-scan-suppress={suppressLegacyScan ? 'true' : undefined}
      onPointerDown={onBackdropPointerDown}
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onClick={onBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alter-item-title"
        onKeyDown={onKeyDown}
        className="flex w-full max-w-190 max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        {/* Header: the line, and what it becomes */}
        <div className="shrink-0 border-b border-gray-100 bg-linear-to-b from-[#327F74]/6 to-white px-6 pt-5 pb-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#327F74] text-white shadow-sm">
              <Package className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#327F74]">Alter item</p>
              <h2 id="alter-item-title" className="truncate text-lg font-bold leading-tight text-[#1E293B]">{item.name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                {code && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{code}</span>}
                {lineUnitName && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">{lineUnitName}</span>}
                <span className="tabular-nums">{item.quantity} × {formatCurrency(item.price)}</span>
              </p>
            </div>
            <button
              type="button"
              aria-label="Close alter item"
              onMouseDown={keepFocus}
              onClick={onClose}
              className="-mr-2 -mt-1 shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Before → after */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Current total</p>
              <p className={`text-base font-bold tabular-nums ${preview.changed ? 'text-gray-400 line-through decoration-gray-300' : 'text-[#1E293B]'}`}>
                {formatCurrency(preview.currentTotal)}
              </p>
            </div>
            <ArrowRight className={`h-4 w-4 shrink-0 ${preview.changed ? 'text-[#327F74]' : 'text-gray-300'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">New total</p>
              <p className="flex items-baseline gap-2">
                <span className={`text-2xl font-black tabular-nums ${preview.changed ? 'text-[#1E293B]' : 'text-gray-300'}`}>
                  {formatCurrency(preview.total)}
                </span>
                <span className="truncate text-[11px] tabular-nums text-gray-500">{breakdown}</span>
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ring-1 ${deltaTone}`}>
              {preview.changed
                ? `${delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}`
                : 'No changes'}
            </span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          {/* Fields */}
          <div role="tablist" aria-orientation="vertical" aria-label="Field to alter" className="flex flex-col gap-1.5">
            {MODES.map((m) => {
              const s = SECTIONS[m];
              const isActive = m === mode;
              const locked = isLocked(m);
              const draft = locked ? null : draftLabel(m);
              const reason = locked ? lockReason(m) : null;
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
                  className={`relative flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${
                    isActive
                      ? 'bg-[#327F74] text-white shadow-md shadow-[#327F74]/25'
                      : locked
                        ? 'cursor-not-allowed bg-gray-50 text-gray-400'
                        : 'bg-white text-[#1E293B] ring-1 ring-gray-200 hover:bg-gray-50 hover:ring-gray-300'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isActive ? 'bg-white/15 text-white' : locked ? 'bg-gray-100 text-gray-400' : 'bg-[#327F74]/10 text-[#327F74]'
                  }`}
                  >
                    {locked ? <Lock className="h-4 w-4" /> : <s.Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-sm font-bold">
                      {s.label}
                      {!locked && (
                        <kbd className={`rounded-md px-1.5 py-px font-mono text-[10px] font-semibold ${
                          isActive ? 'bg-white/15 text-white/80' : 'bg-gray-100 text-gray-400'
                        }`}
                        >
                          {s.key}
                        </kbd>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-xs tabular-nums">
                      {reason ? (
                        <span>{reason}</span>
                      ) : (
                        <>
                          <span className={draft
                            ? `line-through ${isActive ? 'text-white/50' : 'text-gray-400'}`
                            : (isActive ? 'text-white/80' : 'text-gray-500')}
                          >
                            {currentLabel(m)}
                          </span>
                          {draft && <span className={`font-bold ${isActive ? 'text-[#F5C742]' : 'text-[#327F74]'}`}>→ {draft}</span>}
                        </>
                      )}
                    </span>
                  </span>
                  {draft && !isActive && <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#F5C742] ring-2 ring-white" />}
                </button>
              );
            })}
          </div>

          {/* Entry */}
          <div className="flex flex-col gap-3">
            <label className="block rounded-2xl border-2 border-[#327F74] bg-white px-4 pt-2.5 pb-2 ring-4 ring-[#327F74]/10">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#327F74]">{fieldLabel}</span>
                <span className="text-[11px] tabular-nums text-gray-400">{mode === 'discount' && !(Number(item.discount) > 0) ? 'No discount yet' : `Current ${currentLabel(mode)}`}</span>
              </span>
              {field('mt-0.5 w-full bg-transparent text-right font-mono text-4xl font-bold tracking-tight text-[#1E293B] placeholder:text-gray-300 focus:outline-none')}
            </label>

            {discountToggle('bg-gray-100', 'bg-white text-[#327F74] shadow-sm', 'text-gray-500 hover:text-gray-700')}

            {mode === 'unit' ? <div className="min-h-62">{unitList}</div> : (
            <div className="grid grid-cols-3 gap-2">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => press(k)}
                  className="h-14 rounded-2xl bg-gray-50 text-xl font-bold text-[#1E293B] ring-1 ring-gray-200 transition-all hover:bg-white hover:ring-[#327F74]/40 active:scale-95 active:bg-[#327F74]/10"
                >
                  {k}
                </button>
              ))}
              <button
                type="button"
                aria-label="Backspace"
                onMouseDown={keepFocus}
                onClick={() => onValueChange(value.slice(0, -1))}
                className="flex h-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 ring-1 ring-gray-200 transition-all hover:bg-gray-200 active:scale-95"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>
            )}
          </div>
        </div>

        {/* Actions + keyboard legend */}
        <div className="shrink-0 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[7rem_7rem_1fr]">
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={onClose}
              className="hidden h-14 rounded-2xl bg-white text-sm font-bold text-gray-600 ring-1 ring-gray-200 transition-colors hover:bg-gray-100 sm:block"
            >
              Cancel
            </button>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => (mode === 'unit' ? setUnitDraft(null) : onValueChange(''))}
              className="h-14 rounded-2xl bg-white px-4 text-sm font-bold text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-50"
            >
              Clear
            </button>
            <button
              type="button"
              aria-label="Apply changes"
              onMouseDown={keepFocus}
              onClick={apply}
              disabled={!preview.changed}
              className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-[#F5C742] px-5 text-[#1E293B] shadow-sm transition-colors hover:bg-[#e6b838] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
            >
              <span className="flex items-center gap-2 text-sm font-black">
                Apply changes <CornerDownLeft className="h-4 w-4" />
              </span>
              <span className="text-lg font-black tabular-nums">{preview.changed ? formatCurrency(preview.total) : ''}</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <kbd className={kbd}><ArrowUp className="h-2.5 w-2.5" /></kbd>
              <kbd className={kbd}><ArrowDown className="h-2.5 w-2.5" /></kbd>
              <kbd className={kbd}>Tab</kbd> field
            </span>
            <span className="flex items-center gap-1">
              {MODES.map((m) => <kbd key={m} className={kbd}>{SECTIONS[m].key}</kbd>)}
              <span className="mx-0.5">or</span>
              {MODES.filter((m) => SECTIONS[m].fKey).map((m) => <kbd key={m} className={kbd}>{SECTIONS[m].fKey}</kbd>)} jump
            </span>
            {mode === 'discount' && <span className="flex items-center gap-1"><kbd className={kbd}>←</kbd><kbd className={kbd}>→</kbd> % / amount</span>}
            {mode === 'unit' && <span className="flex items-center gap-1"><kbd className={kbd}>1–9</kbd><kbd className={kbd}>←</kbd><kbd className={kbd}>→</kbd> pick unit</span>}
            <span className="flex items-center gap-1"><kbd className={kbd}>Enter</kbd> apply</span>
            <span className="flex items-center gap-1"><kbd className={kbd}>Esc</kbd> cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlterItemModal;
