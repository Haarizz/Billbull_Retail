import React, { useEffect, useMemo, useState } from 'react';
import { getCompanyProfile } from '../api/companyProfileApi';
import { useCompany } from '../context/CompanyContext';
import { normalizeDocumentCompanyProfile } from '../utils/documentTemplateRenderer';
import { resolveCurrencyDisplayCode } from '../utils/countryCurrencyOptions';
import { formatDisplayDate } from '../utils/dateUtils';
import { formatStatementEntryType } from '../utils/statementUtils';

const asNumber = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const firstNonEmpty = (...values) =>
    values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .find(Boolean) || '';

const joinAddress = (...values) =>
    values
        .flatMap((value) => {
            if (Array.isArray(value)) return value;
            if (typeof value === 'string') return value.split('\n');
            return [value];
        })
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .filter(Boolean)
        .join(', ');

const formatAmount = (currency, value) =>
    `${currency} ${Math.abs(asNumber(value)).toLocaleString('en-AE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

const resolvePartyDetails = (party) => {
    const safeParty = party || {};

    return {
        name: firstNonEmpty(safeParty.name, safeParty.companyName, safeParty.localName),
        code: firstNonEmpty(safeParty.code, safeParty.customerCode, safeParty.vendorCode),
        address: firstNonEmpty(
            joinAddress(safeParty.billingAddress, safeParty.shippingAddress, safeParty.address, safeParty.location),
            joinAddress(safeParty.city, safeParty.country)
        ),
        phone: firstNonEmpty(safeParty.contact, safeParty.mobile, safeParty.phone, safeParty.primaryPhone, safeParty.secondaryPhone),
        email: firstNonEmpty(safeParty.email),
        taxId: firstNonEmpty(safeParty.trn, safeParty.taxId)
    };
};

const baseFont = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const styles = {
    page: {
        fontFamily: baseFont,
        color: '#0f172a',
        background: '#ffffff',
        padding: '0',
        fontSize: '12px',
        lineHeight: 1.45
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '28px',
        paddingBottom: '18px',
        borderBottom: '1px solid #dbe2ea'
    },
    titleBlock: {
        flex: 1,
        minWidth: 0
    },
    title: {
        margin: '0 0 6px',
        fontSize: '30px',
        lineHeight: 1.1,
        fontWeight: 700,
        color: '#111827'
    },
    subtitle: {
        margin: '0',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#6b7280'
    },
    metaText: {
        marginTop: '10px',
        fontSize: '12px',
        color: '#475569'
    },
    companyBlock: {
        width: '240px',
        flexShrink: 0,
        textAlign: 'right'
    },
    companyName: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#111827'
    },
    sectionGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        paddingTop: '18px',
        paddingBottom: '18px',
        borderBottom: '1px solid #dbe2ea'
    },
    sectionLabel: {
        marginBottom: '8px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#6b7280'
    },
    sectionValue: {
        margin: '0',
        color: '#334155'
    },
    sectionStrong: {
        margin: '0 0 6px',
        fontSize: '16px',
        fontWeight: 700,
        color: '#111827'
    },
    infoLine: {
        marginTop: '4px',
        color: '#475569'
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '0',
        marginTop: '18px',
        border: '1px solid #dbe2ea',
        borderRadius: '10px',
        overflow: 'hidden'
    },
    summaryCell: {
        padding: '12px 14px',
        background: '#ffffff'
    },
    summaryLabel: {
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#6b7280'
    },
    summaryValue: {
        marginTop: '6px',
        fontSize: '18px',
        fontWeight: 700,
        color: '#111827'
    },
    summarySuffix: {
        marginTop: '2px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#6b7280'
    },
    tableWrap: {
        marginTop: '18px'
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed'
    },
    th: {
        padding: '9px 10px',
        borderTop: '1px solid #dbe2ea',
        borderBottom: '1px solid #dbe2ea',
        background: '#f8fafc',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#64748b'
    },
    td: {
        padding: '10px',
        borderBottom: '1px solid #e5e7eb',
        color: '#334155',
        verticalAlign: 'top',
        wordBreak: 'break-word'
    },
    tfootCell: {
        padding: '11px 10px',
        borderTop: '1px solid #dbe2ea',
        background: '#f8fafc',
        fontWeight: 700,
        color: '#111827'
    },
    footerNote: {
        marginTop: '14px',
        paddingTop: '10px',
        borderTop: '1px solid #dbe2ea',
        fontSize: '11px',
        color: '#94a3b8',
        textAlign: 'center'
    }
};

const SummaryCell = ({ label, amount, currency, suffix = '', withDivider = false }) => (
    <div
        style={{
            ...styles.summaryCell,
            borderLeft: withDivider ? '1px solid #dbe2ea' : 'none'
        }}
    >
        <div style={styles.summaryLabel}>{label}</div>
        <div style={styles.summaryValue}>{formatAmount(currency, amount)}</div>
        {suffix ? <div style={styles.summarySuffix}>{suffix}</div> : null}
    </div>
);

const StatementPrintPreview = ({
    statementData,
    party,
    partyLabel = 'Customer',
    statementLabel = 'Statement of Account',
    startDate,
    endDate,
    debitSummaryLabel,
    creditSummaryLabel,
    debitColumnLabel,
    creditColumnLabel,
    positiveBalanceLabel = 'Dr',
    negativeBalanceLabel = 'Cr',
    emptyMessage = 'No transactions found for the selected period.'
}) => {
    const { company } = useCompany();
    const [fallbackCompany, setFallbackCompany] = useState(null);

    useEffect(() => {
        if (company) return undefined;

        let isMounted = true;

        getCompanyProfile()
            .then((response) => {
                if (isMounted) {
                    setFallbackCompany(response.data);
                }
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
    }, [company]);

    const normalizedCompany = useMemo(
        () => normalizeDocumentCompanyProfile(company || fallbackCompany || {}),
        [company, fallbackCompany]
    );

    const partyDetails = useMemo(() => resolvePartyDetails(party), [party]);
    const currency = resolveCurrencyDisplayCode(normalizedCompany);
    const openingBalance = asNumber(statementData?.openingBalance);
    const totalDebit = asNumber(statementData?.totalDebit);
    const totalCredit = asNumber(statementData?.totalCredit);
    const closingBalance = asNumber(statementData?.closingBalance);
    const entries = Array.isArray(statementData?.entries) ? statementData.entries : [];
    const generatedOn = formatDisplayDate(new Date());
    const closingSuffix = closingBalance >= 0 ? positiveBalanceLabel : negativeBalanceLabel;
    const openingSuffix = openingBalance >= 0 ? positiveBalanceLabel : negativeBalanceLabel;

    if (!statementData) {
        return null;
    }

    return (
        <div className="hidden print:block">
            <style>
                {`
                    @page {
                        margin: 14mm 12mm;
                    }

                    @media print {
                        html, body {
                            overflow: visible !important;
                            height: auto !important;
                        }

                        body::-webkit-scrollbar,
                        *::-webkit-scrollbar {
                            display: none !important;
                        }
                    }
                `}
            </style>

            <div style={styles.page}>
                <div style={styles.header}>
                    <div style={styles.titleBlock}>
                        <div style={styles.subtitle}>{partyLabel} Ledger</div>
                        <h1 style={styles.title}>{statementLabel}</h1>
                        <div style={styles.metaText}>Period: {startDate || '-'} to {endDate || '-'}</div>
                        <div style={{ ...styles.metaText, marginTop: '4px' }}>Generated on: {generatedOn}</div>
                    </div>

                    <div style={styles.companyBlock}>
                        {normalizedCompany.logoUrl ? (
                            <div style={{ marginBottom: '10px' }}>
                                <img
                                    src={normalizedCompany.logoUrl}
                                    alt={normalizedCompany.companyName || 'Company Logo'}
                                    style={{
                                        maxHeight: '58px',
                                        maxWidth: '140px',
                                        objectFit: 'contain',
                                        marginLeft: 'auto',
                                        display: 'block'
                                    }}
                                />
                            </div>
                        ) : null}
                        <div style={styles.companyName}>{normalizedCompany.companyName || 'Company'}</div>
                        {normalizedCompany.address ? <div style={{ ...styles.infoLine, marginTop: '6px' }}>{normalizedCompany.address}</div> : null}
                        {normalizedCompany.phone ? <div style={styles.infoLine}>{normalizedCompany.phone}</div> : null}
                        {normalizedCompany.email ? <div style={styles.infoLine}>{normalizedCompany.email}</div> : null}
                        {normalizedCompany.website ? <div style={styles.infoLine}>{normalizedCompany.website}</div> : null}
                        {normalizedCompany.trn ? <div style={{ ...styles.infoLine, fontWeight: 600 }}>TRN: {normalizedCompany.trn}</div> : null}
                    </div>
                </div>

                <div style={styles.sectionGrid}>
                    <div>
                        <div style={styles.sectionLabel}>{partyLabel}</div>
                        <p style={styles.sectionStrong}>{partyDetails.name || `${partyLabel} not selected`}</p>
                        {partyDetails.code ? <p style={styles.sectionValue}>Code: {partyDetails.code}</p> : null}
                        {partyDetails.address ? <p style={{ ...styles.sectionValue, marginTop: '4px' }}>{partyDetails.address}</p> : null}
                        {partyDetails.phone ? <p style={{ ...styles.sectionValue, marginTop: '4px' }}>Phone: {partyDetails.phone}</p> : null}
                        {partyDetails.email ? <p style={{ ...styles.sectionValue, marginTop: '4px' }}>Email: {partyDetails.email}</p> : null}
                        {partyDetails.taxId ? <p style={{ ...styles.sectionValue, marginTop: '4px' }}>TRN / Tax ID: {partyDetails.taxId}</p> : null}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={styles.sectionLabel}>Balance Summary</div>
                        <p style={{ ...styles.sectionStrong, fontSize: '24px' }}>{formatAmount(currency, closingBalance)}</p>
                        <p style={styles.sectionValue}>Balance Type: {closingSuffix}</p>
                    </div>
                </div>

                <div style={styles.summaryGrid}>
                    <SummaryCell label="Opening Balance" amount={openingBalance} currency={currency} suffix={openingSuffix} />
                    <SummaryCell label={debitSummaryLabel} amount={totalDebit} currency={currency} withDivider />
                    <SummaryCell label={creditSummaryLabel} amount={totalCredit} currency={currency} withDivider />
                    <SummaryCell label="Closing Balance" amount={closingBalance} currency={currency} suffix={closingSuffix} withDivider />
                </div>

                <div style={styles.tableWrap}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ ...styles.th, textAlign: 'left', width: '16%' }}>Date</th>
                                <th style={{ ...styles.th, textAlign: 'left', width: '14%' }}>Type</th>
                                <th style={{ ...styles.th, textAlign: 'left', width: '24%' }}>Document No.</th>
                                <th style={{ ...styles.th, textAlign: 'right', width: '15%' }}>{debitColumnLabel}</th>
                                <th style={{ ...styles.th, textAlign: 'right', width: '15%' }}>{creditColumnLabel}</th>
                                <th style={{ ...styles.th, textAlign: 'right', width: '16%' }}>Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.length > 0 ? (
                                entries.map((entry, index) => (
                                    <tr key={`${entry.documentNo || entry.transactionDate || 'entry'}-${index}`}>
                                        <td style={{ ...styles.td, textAlign: 'left' }}>{entry.transactionDate || '-'}</td>
                                        <td style={{ ...styles.td, textAlign: 'left', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.04em' }}>
                                            {formatStatementEntryType(entry.type)}
                                        </td>
                                        <td style={{ ...styles.td, textAlign: 'left' }}>{entry.documentNo || '-'}</td>
                                        <td style={{ ...styles.td, textAlign: 'right' }}>
                                            {asNumber(entry.debit) > 0
                                                ? asNumber(entry.debit).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                : '-'}
                                        </td>
                                        <td style={{ ...styles.td, textAlign: 'right' }}>
                                            {asNumber(entry.credit) > 0
                                                ? asNumber(entry.credit).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                : '-'}
                                        </td>
                                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, color: '#111827' }}>
                                            {formatAmount(currency, entry.runningBalance || 0)} {asNumber(entry.runningBalance) >= 0 ? positiveBalanceLabel : negativeBalanceLabel}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ ...styles.td, padding: '18px 10px', textAlign: 'center', color: '#94a3b8' }}>
                                        {emptyMessage}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="3" style={{ ...styles.tfootCell, textAlign: 'right' }}>Closing Totals</td>
                                <td style={{ ...styles.tfootCell, textAlign: 'right' }}>
                                    {totalDebit.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ ...styles.tfootCell, textAlign: 'right' }}>
                                    {totalCredit.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ ...styles.tfootCell, textAlign: 'right' }}>
                                    {formatAmount(currency, closingBalance)} {closingSuffix}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style={styles.footerNote}>
                    This is a computer-generated statement and does not require a signature.
                </div>
            </div>
        </div>
    );
};

export default StatementPrintPreview;
