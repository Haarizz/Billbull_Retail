import React from 'react';
import { Label } from '../../../components/ui/label';
import { UAE_DIRHAM_SYMBOL_IMAGE, getCurrencySymbol } from '../../../utils/countryCurrencyOptions';

// Currency code for the active company; set once at app/POS load via
// setActiveCurrency so the AED-named on-screen renderers below stay
// backward-compatible (default AED → dirham image) while honouring a configured
// non-AED currency (USD/EUR/INR/… → text symbol).
let ACTIVE_CURRENCY = 'AED';
export const setActiveCurrency = (code) => { if (code) ACTIVE_CURRENCY = String(code).toUpperCase(); };

// True when the active currency is AED (renders the dirham symbol image).
const isAed = (code) => (code || ACTIVE_CURRENCY) === 'AED';

export const DirhamSymbol = ({ className = '', currency }) => {
  const code = currency || ACTIVE_CURRENCY;
  if (!isAed(code)) {
    // Non-AED: render the configured currency's text symbol ($, €, ₹, …).
    return (
      <span className={className} data-bb-currency-symbol="true" role="img" aria-label={code}>
        {getCurrencySymbol(code)}
      </span>
    );
  }
  return (
    <span
      className={`bb-aed-symbol ${className}`}
      data-bb-currency-symbol="true"
      data-bb-aed-symbol="true"
      role="img"
      aria-label="AED"
      style={{
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
        maskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
};

export const DenominationLabel = ({ value, className = '' }) => (
  <Label className={`w-20 flex-none text-[#1E293B] ${className}`}>
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <DirhamSymbol className="shrink-0" />
      <span>{value}:</span>
    </span>
  </Label>
);

// `prefix` (e.g. "- ") renders before the currency symbol — used to show a
// voided line's amount as negative without changing the underlying value.
export const CurrencyAmount = ({ amount, className = '', prefix = '' }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
    {prefix ? <span className="shrink-0">{prefix}</span> : null}
    <DirhamSymbol className="shrink-0" />
    <span>{Number(amount || 0).toFixed(2)}</span>
  </span>
);

export const DenominationAmount = ({ amount, className = '' }) => (
  <span className={`w-28 flex-none inline-flex items-center justify-end gap-1 whitespace-nowrap text-sm ${className}`}>
    <span>=</span>
    <CurrencyAmount amount={amount} />
  </span>
);

// Replaces a leading currency-code token ("AED 100" / "(AED 100)" — or the active
// currency code, e.g. "USD 100") with the rendered symbol. Currency-agnostic so a
// non-AED company shows the correct symbol on screen.
export const renderAED = (v) => {
  if (typeof v !== 'string') return v;
  const codes = Array.from(new Set([ACTIVE_CURRENCY, 'AED']));
  for (const code of codes) {
    if (v.startsWith(`(${code} `)) return <>(<DirhamSymbol currency={code} />{v.slice(code.length + 2, -1)})</>;
    if (v.startsWith(`${code} `)) return <><DirhamSymbol currency={code} />{v.slice(code.length + 1)}</>;
  }
  return v;
};

export const CurrencyAmountStr = ({ amount }) => `${ACTIVE_CURRENCY} ${Number(amount || 0).toFixed(2)}`;
export const formatCurrencyStr = (amount) => `${ACTIVE_CURRENCY} ` + Number(amount || 0).toFixed(2);


