import React from 'react';
import { Handshake, Tag } from 'lucide-react';
import { PRICE_LEVEL_SOURCE_LABEL } from '../../utils/priceLevels';

/**
 * Shows — and lets the user change — the price level a transaction is priced at.
 *
 * value: the explicitly chosen level id, or '' for "the customer's default".
 * effective: { level, source, notice } from resolveClientLevel.
 * customerPricing: { applied, message, tone } from customerPricingSummary (null = no named customer).
 */
export default function PriceLevelSelect({
  levels = [],
  value,
  onChange,
  effective,
  customerLevelName,
  pending = false,
  error = '',
  customerPricing = null,
  disabled = false,
  compact = false,
  className = '',
}) {
  const levelName = effective?.level?.name || 'Default prices';
  const sourceLabel = PRICE_LEVEL_SOURCE_LABEL[effective?.source] || '';
  const followLabel = customerLevelName ? `Customer default (${customerLevelName})` : 'Customer default';
  const highlighted = effective?.level && !effective.level.systemDefault;

  return (
    <div className={`flex flex-col gap-1 ${className}`} data-testid="price-level-select">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
            highlighted ? 'border-[#F5C742] bg-[#FFF8E7] text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
          title={sourceLabel ? `${levelName} — ${sourceLabel}` : levelName}
          data-testid="price-level-badge"
        >
          <Tag size={12} />
          {levelName}
          {pending ? <span className="font-normal text-slate-500">…</span> : null}
        </span>
        <select
          aria-label="Price level"
          className={`rounded-md border border-slate-200 bg-white text-slate-700 ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'}`}
          value={value == null ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">{followLabel}</option>
          {levels.map((l) => (
            <option key={l.id} value={String(l.id)}>{l.name}</option>
          ))}
        </select>
      </div>
      {customerPricing?.message ? (
        <span
          className={`inline-flex items-center gap-1 text-[11px] ${customerPricing.tone === 'info' ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}
          data-testid="customer-pricing-summary"
        >
          <Handshake size={11} />
          {customerPricing.message}
        </span>
      ) : null}
      {!compact && sourceLabel ? <span className="text-[11px] text-slate-500">{sourceLabel}</span> : null}
      {effective?.notice ? <span className="text-[11px] text-amber-700">{effective.notice}</span> : null}
      {error ? <span className="text-[11px] text-red-600" role="alert">{error}</span> : null}
    </div>
  );
}
