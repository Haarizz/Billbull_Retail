import React from 'react';
import { AlertTriangle, Handshake, Layers, Minus, Plus, Trash2 } from 'lucide-react';
import { CurrencyAmount } from '../../POSCurrency';
import { getCartPriceWarning, isCustomerPricedLine, tierMarkerOf } from '../../posUtils';
import { computeLineTaxTotals, resolveLineTaxRate } from '../../../../../utils/vatMath';

// Accent colours cycled by line number. Each entry spells out full class names so
// Tailwind can see them at build time.
const CART_LINE_ACCENTS = [
  { bar: 'border-l-[#327F74]', badge: 'bg-[#327F74]', amount: 'text-[#327F74]', ring: 'ring-[#327F74]' },
  { bar: 'border-l-blue-700', badge: 'bg-blue-700', amount: 'text-blue-800', ring: 'ring-blue-700' },
  { bar: 'border-l-violet-700', badge: 'bg-violet-700', amount: 'text-violet-800', ring: 'ring-violet-700' },
  { bar: 'border-l-orange-700', badge: 'bg-orange-700', amount: 'text-orange-800', ring: 'ring-orange-700' },
  { bar: 'border-l-cyan-700', badge: 'bg-cyan-700', amount: 'text-cyan-800', ring: 'ring-cyan-700' },
];

/**
 * Fields shown under the item name when POS settings set cartViewMode = DETAILED.
 * Returns [{ label, value }] for fields that are both enabled and present on the line.
 */
const getCartLineDetails =(item, posSettings) => {
  if (posSettings?.cartViewMode !== 'DETAILED' || !item || item.isVoided) return [];
  const out = [];
  const add = (enabled, label, value) => {
    if (enabled && value != null && String(value).trim() !== '') out.push({ label, value: String(value) });
  };
  add(posSettings?.cartShowBarcode, 'Barcode', item.barcode);
  add(posSettings?.cartShowProductCode, 'Code', item.code);
  add(posSettings?.cartShowBatchNumber, 'Batch', item.pinnedBatchNumber || item.batchNumber);
  add(posSettings?.cartShowSerialNumber, 'Serial', item.serialNumber || item.serial);
  add(posSettings?.cartShowExpiryDate, 'Expiry', item.expiryDate || item.expiry);
  return out;
};

const fallbackFormat = (v) => `AED ${Number(v || 0).toFixed(2)}`;

/**
 * One cart line as a card: numbered colour badge, name + code, qty stepper, unit
 * price, line total, and VAT / base / discount / price-source chips. Shared by the
 * Classic, Cart Focus and Compact screen templates.
 */
export const CartLineCard = React.memo(({
  item,
  index = 0,
  selected = false,
  posSettings,
  formatCurrency = fallbackFormat,
  onClick,
  onDoubleClick,
  onUpdateQuantity,
  onRemove,
  canRemoveVoided = true,
}) => {
  if (!item) return null;

  const isVoided = !!item.isVoided;
  const accent = CART_LINE_ACCENTS[index % CART_LINE_ACCENTS.length];
  const isSelected = !isVoided && selected;
  const showStepper = !isVoided && !item.batchControlled && !!onUpdateQuantity;

  const taxRate = Number(item.taxRate ?? resolveLineTaxRate(item, posSettings?.branchDefaultVatRate, posSettings?.taxEnabled !== false)) || 0;
  const { taxableAmount: base, taxAmount: vat } = computeLineTaxTotals({
    netAfterDiscount: item.total,
    taxPercent: taxRate,
    vatMode: posSettings?.taxInclusive ? 'INCLUSIVE' : 'EXCLUSIVE',
  });

  const details = getCartLineDetails(item, posSettings);
  const detailed = posSettings?.cartViewMode === 'DETAILED';
  const code = item.code || item.barcode;
  const priceWarning = getCartPriceWarning(item);
  const tierMarker = tierMarkerOf(item);

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  return (
    <div
      data-cart-line-id={item.id}
      className={`@container group rounded-xl border border-l-4 px-3 py-2.5 shadow-sm transition-all cursor-pointer ${isVoided ? 'bg-red-50/70 border-red-200 border-l-red-400' : `bg-white border-gray-200 ${accent.bar} hover:shadow-md`} ${isSelected ? `ring-2 ${accent.ring}` : ''}`}
      onClick={() => onClick && onClick(item)}
      onDoubleClick={() => onDoubleClick && onDoubleClick(item)}
    >
      {/* Row 1 — line number, name, code, remove */}
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isVoided ? 'bg-red-400' : accent.badge}`}>{index + 1}</span>
        <div className="flex-1 min-w-0">
          {/* Voided line: muted red + [VOID] tag + negative amounts (no
              strike-through). Excluded from the total; disclosed in the totals. */}
          <p className={`text-[13px] font-semibold break-words line-clamp-2 leading-tight ${isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>
            {item.name}
            {Number(item.unitConversion) > 1 && <span className="ml-1 inline-block rounded bg-[#327F74]/10 px-1 text-[9px] font-bold text-[#327F74]">{item.unit}</span>}
            {isVoided && <span className="ml-1 text-[9px] font-bold text-red-500">[VOID]</span>}
          </p>
          {!isVoided && item.nameAr && <p className="text-[10px] text-gray-400 leading-tight break-words" dir="rtl">{item.nameAr}</p>}
          {!isVoided && (detailed ? (
            details.map(d => (
              <p key={d.label} className="text-[9px] font-mono text-gray-500 leading-tight break-all">
                <span className="text-gray-400">{d.label}:</span> <span className="text-[#327F74] font-semibold">{d.value}</span>
              </p>
            ))
          ) : (
            <>
              {code && <p className="text-[10px] font-mono text-gray-400 leading-tight truncate">{code}</p>}
              {item.pinnedBatchNumber && (
                <span className="inline-block mt-0.5 px-1 py-px rounded bg-[#327F74]/10 text-[8px] font-mono font-bold text-[#327F74]">⛓ {item.pinnedBatchNumber}</span>
              )}
            </>
          ))}
        </div>
        {onRemove && (
          <button type="button" aria-label="Remove item" title="Remove item"
            disabled={isVoided && !canRemoveVoided}
            onClick={stop(() => onRemove(item.id))}
            className={`shrink-0 p-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isVoided ? 'text-red-400' : 'text-red-300 hover:text-red-500 hover:bg-red-50'}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Row 2 — qty stepper, unit price, line total */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          {showStepper && (
            <button type="button" aria-label="Decrease quantity" onClick={stop(() => onUpdateQuantity(item.id, item.quantity - 1))}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-[#F5C742]/30 flex items-center justify-center text-gray-600 transition-colors">
              <Minus className="h-3 w-3" />
            </button>
          )}
          <span className={`text-sm font-bold min-w-[1.5rem] text-center tabular-nums ${isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>{isVoided ? `- ${item.quantity}` : item.quantity}</span>
          {showStepper && (
            <button type="button" aria-label="Increase quantity" onClick={stop(() => onUpdateQuantity(item.id, item.quantity + 1))}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-[#F5C742]/30 flex items-center justify-center text-gray-600 transition-colors">
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className={`flex items-center gap-0.5 shrink-0 text-[11px] tabular-nums whitespace-nowrap ${isVoided ? 'text-red-500' : 'text-gray-500'}`}>
          {priceWarning && (
            <AlertTriangle title={priceWarning.message} className={`h-3 w-3 shrink-0 ${priceWarning.level === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
          )}
          <span className="truncate">{isVoided ? <CurrencyAmount amount={item.price} prefix="- " /> : formatCurrency(item.price)}</span>
          <span className="text-gray-300 shrink-0">/{item.unit || 'ea'}</span>
        </span>
        <span className={`ml-auto shrink-0 text-sm @min-[19rem]:text-base font-extrabold tabular-nums whitespace-nowrap ${isVoided ? 'text-red-500' : accent.amount}`}>
          {isVoided ? <CurrencyAmount amount={item.total} prefix="- " /> : formatCurrency(item.total)}
        </span>
      </div>

      {/* Row 3 — VAT, base, discount and price-source chips */}
      {!isVoided && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {taxRate > 0 && (
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              VAT {taxRate}% · {formatCurrency(vat)}
            </span>
          )}
          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
            Base {formatCurrency(base)}
          </span>
          {item.discount > 0 && (
            <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">
              −{item.discount}% disc
            </span>
          )}
          {isCustomerPricedLine(item) && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" data-testid="customer-price-marker">
              <Handshake className="h-3 w-3" /> Customer price
            </span>
          )}
          {tierMarker && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700" data-testid="tier-price-marker">
              <Layers className="h-3 w-3" /> {tierMarker}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

CartLineCard.displayName = 'CartLineCard';

export default CartLineCard;
