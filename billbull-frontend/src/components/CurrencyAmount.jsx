import React, { useContext } from 'react';
import CompanyContext from '../context/CompanyContext';
import {
  resolveCurrencyDisplayConfig,
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

const useCurrencyDisplayConfig = ({ currency, currencySymbol, preferExplicitCurrency = false } = {}) => {
  const companyContext = useContext(CompanyContext);
  const explicitProfile = { currency, currencySymbol };
  const companyProfile = companyContext?.company || null;
  const primaryProfile = preferExplicitCurrency ? explicitProfile : companyProfile;
  const fallbackProfile = preferExplicitCurrency ? companyProfile : explicitProfile;

  return resolveCurrencyDisplayConfig(primaryProfile || fallbackProfile || {}, fallbackProfile || {});
};

export const CurrencySymbol = ({ currency, currencySymbol, preferExplicitCurrency = false }) => {
  const currencyConfig = useCurrencyDisplayConfig({ currency, currencySymbol, preferExplicitCurrency });

  if (currencyConfig.hasImage) {
    return (
      <span
        role="img"
        aria-label={currencyConfig.ariaLabel}
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

  return <span>{currencyConfig.label}</span>;
};

const CurrencyAmount = ({
  value,
  currency,
  currencySymbol,
  preferExplicitCurrency = false,
  decimals = 2,
  className = '',
  ...props
}) => (
  <span className={className} data-bb-skip-aed-symbol="true" {...props}>
    <CurrencySymbol
      currency={currency}
      currencySymbol={currencySymbol}
      preferExplicitCurrency={preferExplicitCurrency}
    />
    {` ${formatAmount(value, decimals)}`}
  </span>
);

export default CurrencyAmount;
