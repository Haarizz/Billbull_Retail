import React from 'react';
import { Label } from '../../../components/ui/label';
import { UAE_DIRHAM_SYMBOL_IMAGE } from '../../../utils/countryCurrencyOptions';

export const DirhamSymbol = ({ className = '' }) => (
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

export const DenominationLabel = ({ value, className = '' }) => (
  <Label className={`w-20 flex-none text-[#1E293B] ${className}`}>
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <DirhamSymbol className="shrink-0" />
      <span>{value}:</span>
    </span>
  </Label>
);

export const CurrencyAmount = ({ amount, className = '' }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
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

export const renderAED = (v) => {
  if (typeof v !== 'string') return v;
  if (v.startsWith('(AED ')) return <>(<DirhamSymbol />{v.slice(5, -1)})</>;
  if (v.startsWith('AED ')) return <><DirhamSymbol />{v.slice(4)}</>;
  return v;
};

export const formatCurrencyStr = (amount) => 'AED ' + Number(amount || 0).toFixed(2);


