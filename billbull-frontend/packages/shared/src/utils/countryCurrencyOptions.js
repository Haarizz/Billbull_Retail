import { UAE_DIRHAM_SYMBOL_DATA_URI } from "./dirhamSymbolBase64";

const WORLD_CURRENCY_CODES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD",
  "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN",
  "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUC", "CUP", "CVE", "CZK",
  "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL",
  "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR",
  "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF",
  "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD",
  "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR",
  "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP",
  "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG",
  "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL",
  "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD",
  "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XDR", "XOF", "XPF",
  "XSU", "YER", "ZAR", "ZMW", "ZWG", "ZWL"
];

const ISO_COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR",
  "BS", "BT", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM",
  "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD",
  "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GT", "GU", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
  "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV",
  "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU",
  "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW",
  "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI",
  "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD",
  "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG",
  "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE",
  "YT", "ZA", "ZM", "ZW"
];

const COUNTRY_ALIASES = {
  UAE: "United Arab Emirates",
  "U.A.E.": "United Arab Emirates",
  USA: "United States",
  "U.S.A.": "United States",
  "United States of America": "United States",
  UK: "United Kingdom",
  "U.K.": "United Kingdom",
  KSA: "Saudi Arabia",
  "Saudi Kingdom": "Saudi Arabia"
};

const currencyDisplayNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "currency" })
  : null;

const regionDisplayNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

const CURRENCY_SYMBOL_OVERRIDES = {
  AED: "AED"
};

export const UAE_DIRHAM_SYMBOL_IMAGE = UAE_DIRHAM_SYMBOL_DATA_URI;

const normalizeCurrencyProfileInput = (profileOrCurrency = {}, fallbackProfile = {}) => {
  const primary = typeof profileOrCurrency === "string"
    ? { currency: profileOrCurrency }
    : (profileOrCurrency || {});
  const fallback = typeof fallbackProfile === "string"
    ? { currency: fallbackProfile }
    : (fallbackProfile || {});

  const currency = normalizeCurrencyValue(
    primary.currency ||
    primary.currencyCode ||
    primary.code ||
    fallback.currency ||
    fallback.currencyCode ||
    fallback.code ||
    ""
  ) || "AED";
  const rawSymbol =
    typeof primary.currencySymbol === "string" ? primary.currencySymbol.trim() :
    typeof primary.symbol === "string" ? primary.symbol.trim() :
    typeof fallback.currencySymbol === "string" ? fallback.currencySymbol.trim() :
    typeof fallback.symbol === "string" ? fallback.symbol.trim() :
    "";

  return { currency, rawSymbol };
};

export const getCurrencyDisplayName = (code) => {
  if (!code) {
    return "";
  }

  return currencyDisplayNames?.of(code) || code;
};

export const getCurrencySymbol = (value) => {
  const code = normalizeCurrencyValue(value);
  if (!code || !WORLD_CURRENCY_CODES.includes(code)) {
    return code;
  }

  if (CURRENCY_SYMBOL_OVERRIDES[code]) {
    return CURRENCY_SYMBOL_OVERRIDES[code];
  }

  try {
    const currencyPart = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol"
    }).formatToParts(0).find((part) => part.type === "currency");

    return currencyPart?.value || code;
  } catch {
    return code;
  }
};

export const resolveCurrencyDisplayConfig = (profileOrCurrency = {}, fallbackProfile = {}) => {
  const { currency, rawSymbol } = normalizeCurrencyProfileInput(profileOrCurrency, fallbackProfile);
  const label = rawSymbol || getCurrencySymbol(currency) || currency;
  const hasImage = currency === "AED" && normalizeCurrencyValue(label) === "AED";

  return {
    currency,
    symbol: label,
    label,
    hasImage,
    ariaLabel: currency || label || "Currency"
  };
};

export const hasCurrencySymbolImage = (value) => {
  if (value && typeof value === "object") {
    return resolveCurrencyDisplayConfig(value).hasImage;
  }

  return normalizeCurrencyValue(value) === "AED";
};

export const resolveCurrencyDisplayCode = (companyProfile = {}) =>
  resolveCurrencyDisplayConfig(companyProfile).label;

export const formatCurrencyDisplay = (value, currency = "AED", decimals = 2) => {
  const currencyLabel = resolveCurrencyDisplayCode(
    typeof currency === "string" ? { currency } : currency
  );
  const rawText = value === null || value === undefined ? "" : String(value).trim();
  const escapedCurrencyLabel = currencyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const amountText = rawText
    .replace(new RegExp(escapedCurrencyLabel, "g"), "")
    .replace(/\b[A-Z]{3}\b/g, "")
    .replace(/د\.إ/g, "")
    .trim();
  const normalizedAmount = amountText.replace(/,/g, "");
  const parsedAmount = Number(normalizedAmount);

  if (Number.isFinite(parsedAmount) && normalizedAmount !== "") {
    return `${currencyLabel} ${parsedAmount.toLocaleString("en-AE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}`;
  }

  if (amountText) {
    return `${currencyLabel} ${amountText}`;
  }

  return `${currencyLabel} ${(0).toFixed(decimals)}`;
};

export const getCountryDisplayName = (code) => {
  if (!code) {
    return "";
  }

  return regionDisplayNames?.of(code) || code;
};

export const normalizeCurrencyValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const candidate = trimmed.includes(" - ")
    ? trimmed.split(" - ")[0].trim().toUpperCase()
    : trimmed.toUpperCase();

  return WORLD_CURRENCY_CODES.includes(candidate) ? candidate : trimmed;
};

export const normalizeCountryValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const alias = COUNTRY_ALIASES[trimmed] || COUNTRY_ALIASES[trimmed.toUpperCase()];
  if (alias) {
    return alias;
  }

  const countryCode = trimmed.toUpperCase();
  if (ISO_COUNTRY_CODES.includes(countryCode)) {
    return getCountryDisplayName(countryCode);
  }

  return trimmed;
};

export const getCurrencyOptions = () => (
  WORLD_CURRENCY_CODES
    .map((code) => {
      const name = getCurrencyDisplayName(code);

      return {
        value: code,
        code,
        label: `${code} - ${name}`,
        displayLabel: `${code} - ${name}`
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code))
);

export const getCountryOptions = () => (
  ISO_COUNTRY_CODES
    .map((code) => {
      const name = getCountryDisplayName(code);

      return {
        value: name,
        code,
        label: name,
        displayLabel: name
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label))
);

export const withFallbackOption = (options, value, createOption = null) => {
  if (!value) {
    return options;
  }

  if (options.some((option) => option.value === value)) {
    return options;
  }

  const fallbackOption = createOption
    ? createOption(value)
    : { value, label: value, displayLabel: value };

  return [fallbackOption, ...options];
};
