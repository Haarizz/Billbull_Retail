import React from 'react';
import {
  hasCurrencySymbolImage,
  resolveCurrencyDisplayCode,
  UAE_DIRHAM_SYMBOL_IMAGE
} from '../utils/countryCurrencyOptions';

const toNumber = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value, decimals = 2) => (
  toNumber(value).toLocaleString('en-AE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
);

export const CurrencySymbol = ({ currency }) => {
  const currencyLabel = resolveCurrencyDisplayCode({
    currency,
    currencySymbol: currency
  });

  if (hasCurrencySymbolImage(currency || currencyLabel)) {
    return (
      <span
        role="img"
        aria-label={currencyLabel}
        className="inline-block align-[-0.08em] mx-[0.06em] h-[0.82em] w-[1.05em] bg-current"
        style={{
          WebkitMaskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
          maskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain'
        }}
      />
    );
  }

  return <span>{currencyLabel}</span>;
};

const CurrencyAmount = ({ value, currency = 'AED', decimals = 2, className = '' }) => (
  <span className={className} data-bb-skip-aed-symbol="true">
    <CurrencySymbol currency={currency} /> {formatAmount(value, decimals)}
  </span>
);

export default CurrencyAmount;
