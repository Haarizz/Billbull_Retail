export const STATEMENT_EXPORT_COLUMNS = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Description', key: 'description', width: 24 },
    { header: 'Debit', key: 'debit', width: 14 },
    { header: 'Credit', key: 'credit', width: 14 },
    { header: 'Balance', key: 'balance', width: 14 }
];

export const formatStatementEntryType = (type) => {
    if (!type) return '-';
    return String(type)
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const asNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const mapStatementEntriesForExport = (statementData) => {
    const entries = Array.isArray(statementData?.entries) ? statementData.entries : [];

    return entries.map(entry => ({
        date: entry.transactionDate || '',
        // QA-018: prefer server-supplied reference / description; fall back to
        // documentNo / type so old back-end builds still produce a useful row.
        reference: entry.reference || entry.documentNo || '-',
        description: entry.description || formatStatementEntryType(entry.type),
        debit: asNumber(entry.debit),
        credit: asNumber(entry.credit),
        balance: asNumber(entry.runningBalance)
    }));
};
