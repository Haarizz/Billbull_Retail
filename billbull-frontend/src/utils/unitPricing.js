const toNumber = (value) => {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const roundAmount = (value, precision = 4) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const getDefaultProductUnit = (product) =>
  product?.unitName || product?.unit || product?.uom || product?.availableUnits?.[0] || 'PCS';

export const getUnitConversionFactor = (unitConversions = {}, unitName, fallback = 1) => {
  if (!unitName) return fallback;
  const numeric = toNumber(unitConversions?.[unitName]);
  return numeric && numeric > 0 ? numeric : fallback;
};

export const getBaseUnitName = (unitConversions = {}, fallbackUnit = '') => {
  const entries = Object.entries(unitConversions || {})
    .map(([unit, factor]) => [unit, toNumber(factor)])
    .filter(([, factor]) => factor && factor > 0);

  const exactBase = entries.find(([, factor]) => factor === 1)?.[0];
  if (exactBase) return exactBase;

  if (entries.length > 0) {
    return entries.sort((a, b) => a[1] - b[1])[0][0];
  }

  return fallbackUnit;
};

export const resolveUnitAmount = ({
  targetUnit,
  amountMap = {},
  unitConversions = {},
  currentUnit = '',
  currentAmount = null,
  fallbackAmount = null,
  precision = 4
}) => {
  if (!targetUnit) return toNumber(fallbackAmount) ?? toNumber(currentAmount) ?? 0;

  const directAmount = toNumber(amountMap?.[targetUnit]);
  if (directAmount != null) {
    return directAmount;
  }

  const fallbackUnit = currentUnit || targetUnit;
  const baseUnit = getBaseUnitName(unitConversions, fallbackUnit);
  const baseFactor = getUnitConversionFactor(unitConversions, baseUnit, 1);
  const targetFactor = getUnitConversionFactor(unitConversions, targetUnit, 1);

  let baseAmount = toNumber(amountMap?.[baseUnit]);

  if (baseAmount == null) {
    const currentNumeric = toNumber(currentAmount);
    if (currentNumeric != null) {
      const currentFactor = getUnitConversionFactor(unitConversions, currentUnit || targetUnit, 1);
      baseAmount = currentFactor > 0 ? currentNumeric / currentFactor : currentNumeric;
    }
  }

  if (baseAmount == null) {
    const fallbackNumeric = toNumber(fallbackAmount);
    if (fallbackNumeric != null) {
      baseAmount = baseFactor > 0 ? fallbackNumeric / baseFactor : fallbackNumeric;
    }
  }

  if (baseAmount == null) return 0;
  return roundAmount(baseAmount * targetFactor, precision);
};
