const DEFAULT_MAX_DOCUMENT_SERIAL_DIGITS = 8;

export const extractTrailingSerialNumber = (value, maxDigits = DEFAULT_MAX_DOCUMENT_SERIAL_DIGITS) => {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const groups = text.match(/\d+/g);
  if (!groups?.length) return null;

  const trailingGroup = groups[groups.length - 1];
  if (maxDigits && trailingGroup.length > maxDigits) return null;

  const normalized = trailingGroup.replace(/^0+/, '') || '0';
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number <= 0) return normalized;

  return number;
};

export const descendingSerialNumber = (index, {
  page = 0,
  size,
  totalElements,
  totalCount,
} = {}) => {
  const safeIndex = Math.max(0, Number(index) || 0);
  const total = Number(totalElements ?? totalCount ?? 0);
  const pageNumber = Math.max(0, Number(page) || 0);
  const pageSize = Math.max(1, Number(size) || total || 1);

  if (total > 0) {
    return Math.max(total - (pageNumber * pageSize) - safeIndex, 1);
  }

  return safeIndex + 1;
};

export const getListSerialNumber = (index, {
  documentNumber,
  maxDocumentSerialDigits = DEFAULT_MAX_DOCUMENT_SERIAL_DIGITS,
  ...pagination
} = {}) => {
  const documentSerial = extractTrailingSerialNumber(documentNumber, maxDocumentSerialDigits);
  return documentSerial ?? descendingSerialNumber(index, pagination);
};

export const withListSerialNumbers = (rows, {
  documentNumberSelector,
  ...pagination
} = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row, index) => ({
    ...row,
    sNo: getListSerialNumber(index, {
      ...pagination,
      totalCount: pagination.totalCount ?? safeRows.length,
      documentNumber: typeof documentNumberSelector === 'function'
        ? documentNumberSelector(row)
        : row?.documentNumber,
    }),
  }));
};
