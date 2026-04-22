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

export const getCurrencyDisplayName = (code) => {
  if (!code) {
    return "";
  }

  return currencyDisplayNames?.of(code) || code;
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
