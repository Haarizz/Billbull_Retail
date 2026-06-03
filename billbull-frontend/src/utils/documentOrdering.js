const normalizeDocumentValue = (value) => {
  const text = String(value ?? '').trim().toUpperCase();
  return text || null;
};

const extractDocumentSequence = (value) => {
  const normalized = normalizeDocumentValue(value);
  if (!normalized) return null;

  const digits = normalized.replace(/\D+/g, '');
  if (!digits) return null;

  return BigInt(digits);
};

export const compareDocumentValues = (left, right, direction = 'desc') => {
  const leftSequence = extractDocumentSequence(left);
  const rightSequence = extractDocumentSequence(right);

  if (leftSequence !== null || rightSequence !== null) {
    if (leftSequence === null) return 1;
    if (rightSequence === null) return -1;
    if (leftSequence !== rightSequence) {
      const result = leftSequence > rightSequence ? 1 : -1;
      return direction === 'asc' ? result : -result;
    }
  }

  const leftText = normalizeDocumentValue(left);
  const rightText = normalizeDocumentValue(right);
  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;

  const result = leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
};
