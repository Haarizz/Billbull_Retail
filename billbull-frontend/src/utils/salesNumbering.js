export const getDocumentNumberingSetting = (settings, documentType) => {
  const rows = Array.isArray(settings?.documentNumbering) ? settings.documentNumbering : [];
  return rows.find(row => row.documentType === documentType) || null;
};

export const isAutoNumberingEnabled = (settings, documentType) => {
  const row = getDocumentNumberingSetting(settings, documentType);
  return row?.autoNumberingEnabled ?? true;
};
