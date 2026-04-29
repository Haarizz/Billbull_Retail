import React, { useEffect, useState } from 'react';
import {
    Activity,
    AlertCircle,
    BarChart3,
    Calendar,
    CheckCircle,
    Clock,
    DollarSign,
    Download,
    FileSpreadsheet,
    FileText,
    PieChart,
    Scale,
    Target,
    TrendingDown,
    TrendingUp,
    Wallet
} from 'lucide-react';
import { generateReportFilename } from '../../utils/filenameUtils';
import { usePrintDocument } from '../../hooks/usePrintDocument';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart as RechartsPie,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

import * as backendApi from '../../api/financialReportsBackendApi';
import { 
    getFinancialReportsData, 
    calculateFinancialMetrics, 
    calculateBalanceSheetDetails,
    calculateCashFlowDetails,
    calculateExpenseAnalysisDetails,
    calculateTaxSummary,
    getMonthlyTrends 
} from '../../api/financialReportsApi';
import toast from 'react-hot-toast';

const REPORT_KEYS = [
    'trialBalance',
    'profitLoss',
    'balanceSheet',
    'cashFlow',
    'expenseAnalysis',
    'taxDashboard',
    'taxReconciliation'
];

const createReportStatus = () => REPORT_KEYS.reduce((acc, key) => {
    acc[key] = { loading: true, error: null };
    return acc;
}, {});

const COLORS = ['#3B82F6', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const FinancialReports = () => {
    const { print } = usePrintDocument();
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('thisMonth');

    const [referenceData, setReferenceData] = useState({
        taxConfigs: [],
        taxFilings: []
    });
    const [referenceStatus, setReferenceStatus] = useState({ loading: true, error: null });
    const [reportStatus, setReportStatus] = useState(createReportStatus());
    const [trendStatus, setTrendStatus] = useState({
        profit: { loading: true, error: null },
        cashFlow: { loading: true, error: null }
    });

    const [trialBalance, setTrialBalance] = useState(null);
    const [profitLoss, setProfitLoss] = useState(null);
    const [balanceSheet, setBalanceSheet] = useState(null);
    const [cashFlow, setCashFlow] = useState(null);
    const [expenseAnalysis, setExpenseAnalysis] = useState(null);
    const [taxDashboard, setTaxDashboard] = useState(null);
    const [taxReconciliation, setTaxReconciliation] = useState(null);
    const [monthlyTrends, setMonthlyTrends] = useState([]);
    const [cashFlowTrends, setCashFlowTrends] = useState([]);

    const getDateRange = () => {
        const now = new Date();
        let start;
        let end;

        switch (dateRange) {
            case 'lastMonth':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            case 'thisQuarter': {
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                end = now;
                break;
            }
            case 'thisYear':
                start = new Date(now.getFullYear(), 0, 1);
                end = now;
                break;
            case 'thisMonth':
            default:
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = now;
                break;
        }

        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        };
    };

    const toNumber = (value) => Number(value ?? 0);

    const formatCurrency = (amount) => `AED ${toNumber(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

    const getCashBalanceFromBalanceSheet = (sheet) => {
        if (!sheet?.assetItems?.length) return 0;

        return sheet.assetItems.reduce((sum, item) => {
            const category = String(item.category || '').toLowerCase();
            const accountName = String(item.accountName || '').toLowerCase();
            const isCashAccount =
                category.includes('cash') ||
                accountName.includes('cash') ||
                accountName.includes('bank');

            return isCashAccount ? sum + toNumber(item.amount) : sum;
        }, 0);
    };

    const buildAccountDistribution = () => ([
        { name: 'Assets', value: Math.abs(toNumber(balanceSheet?.totalAssets)) },
        { name: 'Liabilities', value: Math.abs(toNumber(balanceSheet?.totalLiabilities)) },
        { name: 'Equity', value: Math.abs(toNumber(balanceSheet?.totalEquity)) },
        { name: 'Income', value: Math.abs(toNumber(profitLoss?.totalRevenue)) },
        { name: 'Expenses', value: Math.abs(toNumber(profitLoss?.totalExpenses)) }
    ].filter((item) => item.value > 0));

    const buildMonthlyRanges = (anchorDate, months = 6) => {
        const anchor = new Date(anchorDate);
        const ranges = [];

        for (let index = months - 1; index >= 0; index -= 1) {
            const monthStart = new Date(anchor.getFullYear(), anchor.getMonth() - index, 1);
            const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() - index + 1, 0);

            ranges.push({
                month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                startDate: monthStart.toISOString().split('T')[0],
                endDate: monthEnd.toISOString().split('T')[0]
            });
        }

        return ranges;
    };

    const fetchMonthlyProfitLossTrends = async (anchorDate) => {
        const ranges = buildMonthlyRanges(anchorDate, 6);
        const results = await Promise.allSettled(
            ranges.map((range) => backendApi.getProfitLoss(range.startDate, range.endDate))
        );

        const rejected = results.find((result) => result.status === 'rejected');
        if (rejected) {
            throw rejected.reason;
        }

        return ranges.map((range, index) => {
            const report = results[index].value;
            const revenue = toNumber(report?.totalRevenue);
            const expenses = toNumber(report?.totalExpenses);

            return {
                month: range.month,
                revenue,
                expenses,
                profit: toNumber(report?.netProfit ?? (revenue - expenses))
            };
        });
    };

    const fetchMonthlyCashFlowTrends = async (anchorDate) => {
        const ranges = buildMonthlyRanges(anchorDate, 6);
        const results = await Promise.allSettled(
            ranges.map((range) => backendApi.getCashFlow(range.startDate, range.endDate))
        );

        const rejected = results.find((result) => result.status === 'rejected');
        if (rejected) {
            throw rejected.reason;
        }

        return ranges.map((range, index) => {
            const report = results[index].value;
            return {
                month: range.month,
                operating: toNumber(report?.totalOperating),
                investing: toNumber(report?.totalInvesting),
                financing: toNumber(report?.totalFinancing),
                netCashFlow: toNumber(report?.netCashFlow)
            };
        });
    };

    const fetchData = async () => {
        setLoading(true);
        setReferenceStatus({ loading: true, error: null });
        setReportStatus(createReportStatus());
        setTrendStatus({
            profit: { loading: true, error: null },
            cashFlow: { loading: true, error: null }
        });

        setTrialBalance(null);
        setProfitLoss(null);
        setBalanceSheet(null);
        setCashFlow(null);
        setExpenseAnalysis(null);
        setTaxDashboard(null);
        setTaxReconciliation(null);
        setMonthlyTrends([]);
        setCashFlowTrends([]);

        const { startDate, endDate } = getDateRange();

        try {
            const reportRequests = {
                trialBalance: backendApi.getTrialBalance(startDate, endDate),
                profitLoss: backendApi.getProfitLoss(startDate, endDate),
                balanceSheet: backendApi.getBalanceSheet(endDate),
                cashFlow: backendApi.getCashFlow(startDate, endDate),
                expenseAnalysis: backendApi.getExpenseAnalysis(startDate, endDate),
                taxDashboard: backendApi.getTaxDashboard(startDate, endDate),
                taxReconciliation: backendApi.getTaxReconciliation(startDate, endDate)
            };

            const reportSetters = {
                trialBalance: setTrialBalance,
                profitLoss: setProfitLoss,
                balanceSheet: setBalanceSheet,
                cashFlow: setCashFlow,
                expenseAnalysis: setExpenseAnalysis,
                taxDashboard: setTaxDashboard,
                taxReconciliation: setTaxReconciliation
            };

            const [referenceResult, reportResults, profitTrendResult, cashTrendResult] = await Promise.all([
                getFinancialReportsData(startDate, endDate)
                    .then((value) => ({ status: 'fulfilled', value }))
                    .catch((reason) => ({ status: 'rejected', reason })),
                Promise.allSettled(REPORT_KEYS.map((key) => reportRequests[key])),
                fetchMonthlyProfitLossTrends(endDate)
                    .then((value) => ({ status: 'fulfilled', value }))
                    .catch((reason) => ({ status: 'rejected', reason })),
                fetchMonthlyCashFlowTrends(endDate)
                    .then((value) => ({ status: 'fulfilled', value }))
                    .catch((reason) => ({ status: 'rejected', reason }))
            ]);

            if (referenceResult.status === 'fulfilled') {
                setReferenceData({
                    taxConfigs: referenceResult.value.taxConfigs || [],
                    taxFilings: referenceResult.value.taxFilings || []
                });
                setReferenceStatus({ loading: false, error: null });
            } else {
                setReferenceData({ taxConfigs: [], taxFilings: [] });
                setReferenceStatus({
                    loading: false,
                    error: referenceResult.reason?.message || 'Reference data unavailable.'
                });
            }

            const nextReportStatus = createReportStatus();
            REPORT_KEYS.forEach((key, index) => {
                const result = reportResults[index];
                if (result.status === 'fulfilled' && result.value) {
                    reportSetters[key](result.value);
                    nextReportStatus[key] = { loading: false, error: null };
                } else {
                    reportSetters[key](null);
                    nextReportStatus[key] = {
                        loading: false,
                        error: result.status === 'rejected' ? (result.reason?.message || `${key} unavailable`) : null
                    };
                }
            });

            // --- FALLBACK LOGIC ---
            // If backend reports are missing or mostly zero, use client-side aggregation
            if (referenceResult.status === 'fulfilled') {
                const metrics = calculateFinancialMetrics(referenceResult.value, startDate, endDate);
                const taxSummary = calculateTaxSummary(referenceResult.value, startDate, endDate);
                const bsDetails = calculateBalanceSheetDetails(referenceResult.value, endDate);
                const cfDetails = calculateCashFlowDetails(referenceResult.value, startDate, endDate);
                const expDetails = calculateExpenseAnalysisDetails(referenceResult.value, startDate, endDate);
                
                setProfitLoss(prev => {
                    if (!prev || toNumber(prev.totalRevenue) === 0) {
                        return {
                            ...prev,
                            startDate,
                            endDate,
                            totalRevenue: metrics.totalRevenue,
                            totalExpenses: metrics.totalExpenses,
                            netProfit: metrics.netProfit,
                            grossProfit: metrics.totalRevenue, // Heuristic
                            totalOperatingExpenses: metrics.totalExpenses,
                            revenueItems: referenceResult.value.transactions
                                .filter(t => parseFloat(t.creditAmount) > 0)
                                .map(t => ({ accountName: t.accountName, amount: t.creditAmount, accountCode: t.accountCode, category: 'Sales/Revenue' })),
                            operatingExpenseItems: referenceResult.value.expenses
                                .map(e => ({ accountName: e.category, amount: e.amount, accountCode: e.voucherNo, category: 'Operating' }))
                        };
                    }
                    return prev;
                });

                setBalanceSheet(prev => {
                    if (!prev || toNumber(prev.totalAssets) === 0) {
                        return bsDetails;
                    }
                    return prev;
                });

                setCashFlow(prev => {
                    if (!prev || toNumber(prev.netCashFlow) === 0) {
                        return cfDetails;
                    }
                    return prev;
                });

                setExpenseAnalysis(prev => {
                    if (!prev || (prev.byCategory || []).length === 0) {
                        return expDetails;
                    }
                    return prev;
                });

                setTaxDashboard(prev => {
                    if (!prev || toNumber(prev.outputTax) === 0) {
                        return taxSummary;
                    }
                    return prev;
                });

                // Fix Report Status if we now have fallback data
                if (metrics.totalRevenue > 0 || metrics.totalAssets > 0) {
                    nextReportStatus.profitLoss = { loading: false, error: null };
                    nextReportStatus.balanceSheet = { loading: false, error: null };
                }
                if (cfDetails.netCashFlow !== 0 || cfDetails.operatingActivities.length > 0) {
                    nextReportStatus.cashFlow = { loading: false, error: null };
                }
                if (expDetails.byCategory.length > 0) {
                    nextReportStatus.expenseAnalysis = { loading: false, error: null };
                }
                if (taxSummary.outputTax > 0) {
                    nextReportStatus.taxDashboard = { loading: false, error: null };
                }
            }

            setReportStatus(nextReportStatus);

            if (profitTrendResult.status === 'fulfilled' && profitTrendResult.value?.length > 0) {
                setMonthlyTrends(profitTrendResult.value);
                setTrendStatus((prev) => ({
                    ...prev,
                    profit: { loading: false, error: null }
                }));
            } else if (referenceResult.status === 'fulfilled') {
                // Fallback for trends
                const trends = getMonthlyTrends(referenceResult.value.transactions, referenceResult.value.expenses, 6);
                setMonthlyTrends(trends);
                setTrendStatus((prev) => ({
                    ...prev,
                    profit: { loading: false, error: null }
                }));
            } else {
                setTrendStatus((prev) => ({
                    ...prev,
                    profit: {
                        loading: false,
                        error: profitTrendResult.reason?.message || 'Monthly P&L trend unavailable.'
                    }
                }));
            }

            if (cashTrendResult.status === 'fulfilled' && cashTrendResult.value) {
                setCashFlowTrends(cashTrendResult.value);
                setTrendStatus((prev) => ({
                    ...prev,
                    cashFlow: { loading: false, error: null }
                }));
            } else {
                setTrendStatus((prev) => ({
                    ...prev,
                    cashFlow: {
                        loading: false,
                        error: cashTrendResult.reason?.message || 'Monthly cash flow trend unavailable.'
                    }
                }));
            }
        } catch (error) {
            console.error('Error fetching financial reports:', error);
            toast.error('Failed to load financial reports.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateRange]);

    const handlePrint = () => {
        const reportName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
        const title = generateDocFilename('Financial Report', reportName, 'BillBull', dateRange.from || new Date(), company?.currency || 'AED');
        print(title);
    };

    const buildProfitLossRows = () => {
        if (!profitLoss) return [];

        const rows = [['Section', 'Account Code', 'Account Name', 'Category', 'Amount']];
        const pushSection = (title, items = [], totalLabel, totalAmount) => {
            rows.push([title, '', '', '', '']);
            items.forEach((item) => {
                rows.push([
                    '',
                    item.accountCode || '',
                    `"${item.accountName || ''}"`,
                    `"${item.category || ''}"`,
                    toNumber(item.amount)
                ]);
            });
            rows.push(['', '', `"${totalLabel}"`, '', toNumber(totalAmount)]);
        };

        pushSection('Revenue', profitLoss.revenueItems, 'Total Revenue', profitLoss.totalRevenue);
        pushSection('COGS', profitLoss.cogsItems, 'Total COGS', profitLoss.totalCogs);
        rows.push(['', '', '"Gross Profit"', '', toNumber(profitLoss.grossProfit)]);
        pushSection(
            'Operating Expenses',
            profitLoss.operatingExpenseItems,
            'Total Operating Expenses',
            profitLoss.totalOperatingExpenses
        );
        pushSection('Other Income', profitLoss.otherIncomeItems, 'Total Other Income', profitLoss.totalOtherIncome);
        rows.push(['', '', '"Net Profit"', '', toNumber(profitLoss.netProfit)]);

        return rows;
    };

    const buildBalanceSheetRows = () => {
        if (!balanceSheet) return [];

        const rows = [['Section', 'Account Code', 'Account Name', 'Category', 'Amount']];
        const pushSection = (title, items = [], totalLabel, totalAmount) => {
            rows.push([title, '', '', '', '']);
            items.forEach((item) => {
                rows.push([
                    '',
                    item.accountCode || '',
                    `"${item.accountName || ''}"`,
                    `"${item.category || ''}"`,
                    toNumber(item.amount)
                ]);
            });
            rows.push(['', '', `"${totalLabel}"`, '', toNumber(totalAmount)]);
        };

        pushSection('Assets', balanceSheet.assetItems, 'Total Assets', balanceSheet.totalAssets);
        pushSection('Liabilities', balanceSheet.liabilityItems, 'Total Liabilities', balanceSheet.totalLiabilities);
        pushSection('Equity', balanceSheet.equityItems, 'Total Equity', balanceSheet.totalEquity);
        rows.push([
            '',
            '',
            '"Liabilities + Equity"',
            '',
            toNumber(balanceSheet.totalLiabilities) + toNumber(balanceSheet.totalEquity)
        ]);

        return rows;
    };

    const buildCashFlowRows = () => {
        if (!cashFlow) return [];

        const rows = [['Section', 'Account Code', 'Account Name', 'Bucket', 'Amount']];
        const pushSection = (title, items = [], totalAmount) => {
            rows.push([title, '', '', '', '']);
            items.forEach((item) => {
                rows.push([
                    '',
                    item.accountCode || '',
                    `"${item.accountName || ''}"`,
                    `"${item.category || ''}"`,
                    toNumber(item.amount)
                ]);
            });
            rows.push(['', '', `"Total ${title}"`, '', toNumber(totalAmount)]);
        };

        pushSection('Operating', cashFlow.operatingActivities, cashFlow.totalOperating);
        pushSection('Investing', cashFlow.investingActivities, cashFlow.totalInvesting);
        pushSection('Financing', cashFlow.financingActivities, cashFlow.totalFinancing);
        rows.push(['', '', '"Net Cash Flow"', '', toNumber(cashFlow.netCashFlow)]);

        return rows;
    };

    const buildExpenseRows = () => {
        if (!expenseAnalysis) return [];

        const rows = [['Type', 'Group/Date', 'Voucher No', 'Account Code', 'Account Name', 'Cost Center', 'Amount']];
        (expenseAnalysis.byCategory || []).forEach((item) => {
            rows.push(['Category', `"${item.groupName || ''}"`, '', '', '', '', toNumber(item.amount)]);
        });
        (expenseAnalysis.byCostCenter || []).forEach((item) => {
            rows.push(['Cost Center', `"${item.groupName || ''}"`, '', '', '', '', toNumber(item.amount)]);
        });
        (expenseAnalysis.detailLines || []).forEach((item) => {
            rows.push([
                'Detail',
                item.transactionDate || '',
                item.voucherNo || '',
                item.accountCode || '',
                `"${item.accountName || ''}"`,
                `"${item.costCenter || ''}"`,
                toNumber(item.amount)
            ]);
        });
        rows.push(['', '', '', '', '"Total Expenses"', '', toNumber(expenseAnalysis.totalExpenses)]);
        return rows;
    };

    const buildTaxRows = () => {
        if (!taxDashboard && !taxReconciliation) return [];

        const rows = [['Section', 'Label', 'Value']];
        if (taxDashboard) {
            rows.push(['Summary', 'Output Tax', toNumber(taxDashboard.outputTax)]);
            rows.push(['Summary', 'Input Tax', toNumber(taxDashboard.inputTax)]);
            rows.push(['Summary', 'Taxable Sales Base', toNumber(taxDashboard.taxableSalesBase)]);
            rows.push(['Summary', 'Taxable Purchase Base', toNumber(taxDashboard.taxablePurchaseBase)]);
            rows.push(['Summary', 'Net Tax Payable', toNumber(taxDashboard.netTaxPayable)]);
        }
        rows.push([]);
        rows.push(['Audit', 'Document Number', 'Type', 'Base Amount', 'Tax Amount', 'Account Name']);
        (taxReconciliation?.lines || []).forEach((line) => {
            rows.push([
                '',
                line.documentNumber || '',
                line.type || '',
                toNumber(line.baseAmount),
                toNumber(line.taxAmount),
                `"${line.accountName || ''}"`
            ]);
        });
        return rows;
    };

    const handleExportCSV = () => {
        let rows = [];

        if (activeTab === 'overview') {
            if (!profitLoss || !balanceSheet || !taxDashboard) {
                toast.error('Overview export is unavailable until all report summaries load.');
                return;
            }
            rows = [
                ['Metric', 'Amount'],
                ['Revenue', toNumber(profitLoss?.totalRevenue)],
                ['Expenses', toNumber(profitLoss?.totalExpenses)],
                ['Net Profit', toNumber(profitLoss?.netProfit)],
                ['Cash Balance', getCashBalanceFromBalanceSheet(balanceSheet)],
                ['Output Tax', toNumber(taxDashboard?.outputTax)],
                ['Net Tax Payable', toNumber(taxDashboard?.netTaxPayable)],
                [],
                ['Month', 'Revenue', 'Expenses', 'Profit']
            ];
            monthlyTrends.forEach((item) => {
                rows.push([item.month, item.revenue, item.expenses, item.profit]);
            });
        } else if (activeTab === 'trialBalance' && trialBalance) {
            rows = [['Account Code', 'Account Name', 'Group', 'Debit', 'Credit']];
            (trialBalance.lines || []).forEach((line) => {
                rows.push([
                    line.accountCode,
                    `"${line.accountName || ''}"`,
                    `"${line.accountGroup || ''}"`,
                    toNumber(line.debitBalance),
                    toNumber(line.creditBalance)
                ]);
            });
            rows.push(['TOTAL', '', '', toNumber(trialBalance.totalDebit), toNumber(trialBalance.totalCredit)]);
        } else if (activeTab === 'profitLoss') {
            rows = buildProfitLossRows();
        } else if (activeTab === 'balanceSheet') {
            rows = buildBalanceSheetRows();
        } else if (activeTab === 'cashFlow') {
            rows = buildCashFlowRows();
        } else if (activeTab === 'expenses') {
            rows = buildExpenseRows();
        } else if (activeTab === 'tax') {
            rows = buildTaxRows();
        }

        if (!rows.length) {
            toast.error(`CSV export is unavailable for ${activeTab}.`);
            return;
        }

        const csvContent = `data:text/csv;charset=utf-8,${rows.map((row) => row.join(',')).join('\n')}`;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        const reportName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
        const fileName = generateDocFilename('Financial Report', reportName, 'BillBull', dateRange.from || new Date(), company?.currency || 'AED');
        link.setAttribute('download', `${fileName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Export successful');
    };

    const LoadingState = ({ label = 'Loading report...' }) => (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm text-center text-slate-500 text-sm animate-pulse">
            {label}
        </div>
    );

    const ErrorState = ({ title = 'Report unavailable', message = 'No data available for this section.' }) => (
        <div className="bg-white p-6 rounded-lg border border-red-200 shadow-sm">
            <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-red-500 mt-0.5" />
                <div>
                    <h3 className="text-sm font-bold text-red-700">{title}</h3>
                    <p className="text-xs text-slate-500 mt-1">{message}</p>
                </div>
            </div>
        </div>
    );

    const SummaryCards = () => {
        const cards = [
            {
                label: 'Total Revenue',
                value: profitLoss?.totalRevenue,
                available: !reportStatus.profitLoss.error && !!profitLoss,
                caption: 'Posted revenue',
                icon: TrendingUp,
                iconClass: 'bg-emerald-50 text-emerald-600',
                valueClass: 'text-slate-800'
            },
            {
                label: 'Total Expenses',
                value: profitLoss?.totalExpenses,
                available: !reportStatus.profitLoss.error && !!profitLoss,
                caption: 'Posted expenses',
                icon: TrendingDown,
                iconClass: 'bg-red-50 text-red-600',
                valueClass: 'text-slate-800'
            },
            {
                label: 'Net Profit',
                value: profitLoss?.netProfit,
                available: !reportStatus.profitLoss.error && !!profitLoss,
                caption: toNumber(profitLoss?.netProfit) >= 0 ? 'Profitable' : 'Loss position',
                icon: DollarSign,
                iconClass: 'bg-slate-50 text-slate-600',
                valueClass: toNumber(profitLoss?.netProfit) >= 0 ? 'text-emerald-600' : 'text-red-600'
            },
            {
                label: 'Cash Balance',
                value: getCashBalanceFromBalanceSheet(balanceSheet),
                available: !reportStatus.balanceSheet.error && !!balanceSheet,
                caption: 'Cash and bank assets',
                icon: Wallet,
                iconClass: 'bg-slate-50 text-slate-600',
                valueClass: 'text-slate-800'
            },
            {
                label: 'Output Tax',
                value: taxDashboard?.outputTax,
                available: !reportStatus.taxDashboard.error && !!taxDashboard,
                caption: 'Collected on sales',
                icon: FileText,
                iconClass: 'bg-rose-50 text-rose-600',
                valueClass: 'text-slate-800'
            },
            {
                label: 'Net Tax Payable',
                value: taxDashboard?.netTaxPayable,
                available: !reportStatus.taxDashboard.error && !!taxDashboard,
                caption: 'Output minus input tax',
                icon: BarChart3,
                iconClass: 'bg-blue-50 text-blue-600',
                valueClass: toNumber(taxDashboard?.netTaxPayable) >= 0 ? 'text-red-600' : 'text-emerald-600'
            }
        ];

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                {cards.map((card) => (
                    <div key={card.label} className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">{card.label}</p>
                            {card.available ? (
                                <h3 className={`text-2xl font-bold ${card.valueClass}`}>{formatCurrency(card.value)}</h3>
                            ) : (
                                <h3 className="text-lg font-bold text-slate-400">Unavailable</h3>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">{card.caption}</p>
                        </div>
                        <div className={`p-3 rounded-lg ${card.iconClass}`}>
                            <card.icon size={20} />
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const TrialBalanceTab = () => {
        if (reportStatus.trialBalance.loading) return <LoadingState label="Loading Trial Balance..." />;
        if (reportStatus.trialBalance.error || !trialBalance) {
            return (
                <ErrorState
                    title="Trial Balance unavailable"
                    message={reportStatus.trialBalance.error || 'Trial Balance data could not be loaded.'}
                />
            );
        }

        return (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Scale size={20} className="text-blue-600" />
                            Trial Balance
                        </h3>
                        <span className="text-xs text-slate-400">As of {trialBalance.asOfDate}</span>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Code</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Debit (AED)</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Credit (AED)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(trialBalance.lines || []).map((line, index) => (
                                    <tr key={`${line.accountCode || index}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2 text-xs text-slate-600 font-mono">{line.accountCode}</td>
                                        <td className="px-4 py-2 text-xs text-slate-700 font-semibold">{line.accountName}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500">{line.accountGroup || '-'}</td>
                                        <td className="px-4 py-2 text-right text-xs text-blue-600 font-medium">
                                            {toNumber(line.debitBalance) > 0 ? formatCurrency(line.debitBalance) : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-right text-xs text-red-600 font-medium">
                                            {toNumber(line.creditBalance) > 0 ? formatCurrency(line.creditBalance) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr className="font-bold">
                                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-800">TOTAL</td>
                                    <td className="px-4 py-3 text-right text-xs text-blue-700">{formatCurrency(trialBalance.totalDebit)}</td>
                                    <td className="px-4 py-3 text-right text-xs text-red-700">{formatCurrency(trialBalance.totalCredit)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-xs font-bold ${trialBalance.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {trialBalance.balanced ? (
                            <><CheckCircle size={16} /> Trial Balance is balanced.</>
                        ) : (
                            <><AlertCircle size={16} /> Trial Balance has a discrepancy.</>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const OverviewTab = () => {
        const accountDistribution = buildAccountDistribution();

        return (
            <div className="space-y-6">
                <SummaryCards />

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Activity size={16} className="text-blue-600" />
                        Revenue vs Expenses (Last 6 Months)
                    </h3>
                    {trendStatus.profit.loading ? (
                        <LoadingState label="Loading monthly P&L trend..." />
                    ) : trendStatus.profit.error ? (
                        <ErrorState title="P&L trend unavailable" message={trendStatus.profit.error} />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={monthlyTrends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} name="Revenue" />
                                <Line type="monotone" dataKey="expenses" stroke="#F43F5E" strokeWidth={2} name="Expenses" />
                                <Line type="monotone" dataKey="profit" stroke="#3B82F6" strokeWidth={2} name="Profit" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <PieChart size={16} className="text-purple-600" />
                            Expenses by Category
                        </h3>
                        {reportStatus.expenseAnalysis.loading ? (
                            <LoadingState label="Loading expense analysis..." />
                        ) : reportStatus.expenseAnalysis.error || !expenseAnalysis ? (
                            <ErrorState
                                title="Expense chart unavailable"
                                message={reportStatus.expenseAnalysis.error || 'Expense analysis data unavailable.'}
                            />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <RechartsPie>
                                    <Pie
                                        data={(expenseAnalysis.byCategory || []).slice(0, 8).map((item) => ({
                                            category: item.groupName,
                                            total: toNumber(item.amount)
                                        }))}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                                        outerRadius={80}
                                        dataKey="total"
                                    >
                                        {(expenseAnalysis.byCategory || []).slice(0, 8).map((entry, index) => (
                                            <Cell key={`${entry.groupName || index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                </RechartsPie>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <BarChart3 size={16} className="text-orange-600" />
                            Account Balance Distribution
                        </h3>
                        {reportStatus.balanceSheet.loading || reportStatus.profitLoss.loading ? (
                            <LoadingState label="Loading balance distribution..." />
                        ) : reportStatus.balanceSheet.error || reportStatus.profitLoss.error || !accountDistribution.length ? (
                            <ErrorState
                                title="Balance distribution unavailable"
                                message="Balance Sheet and P&L totals are required for this chart."
                            />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={accountDistribution}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#64748b" />
                                    <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                    <Bar dataKey="value" fill="#3B82F6" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ProfitLossTab = () => {
        if (reportStatus.profitLoss.loading) return <LoadingState label="Loading Profit & Loss..." />;
        if (reportStatus.profitLoss.error || !profitLoss) {
            return (
                <ErrorState
                    title="Profit & Loss unavailable"
                    message={reportStatus.profitLoss.error || 'Profit & Loss data could not be loaded.'}
                />
            );
        }

        const renderSection = (title, items, totalLabel, totalAmount, colorClass) => (
            <div className="mb-6">
                <div className={`px-4 py-2 rounded-t-lg border-b-2 ${colorClass.header}`}>
                    <h4 className={`text-sm font-bold ${colorClass.title}`}>{title}</h4>
                </div>
                <div className="border border-slate-200 rounded-b-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-[#F7F7FA] border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(items || []).map((item, index) => (
                                <tr key={`${item.accountCode || item.accountName || index}`} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2 text-xs text-slate-700">
                                        {item.accountName}
                                        {item.accountCode ? <span className="ml-2 text-[10px] text-slate-400 font-mono">{item.accountCode}</span> : null}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-slate-500">{item.category || '-'}</td>
                                    <td className={`px-4 py-2 text-right text-xs font-medium ${colorClass.amount}`}>{formatCurrency(item.amount)}</td>
                                </tr>
                            ))}
                            <tr className={`${colorClass.footer} font-bold`}>
                                <td colSpan={2} className="px-4 py-3 text-xs text-slate-800">{totalLabel}</td>
                                <td className={`px-4 py-3 text-right text-xs ${colorClass.total}`}>{formatCurrency(totalAmount)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );

        return (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Profit & Loss Statement</h3>
                        <span className="text-xs text-slate-400">
                            {profitLoss.startDate} to {profitLoss.endDate}
                        </span>
                    </div>

                    {renderSection('REVENUE', profitLoss.revenueItems, 'Total Revenue', profitLoss.totalRevenue, {
                        header: 'bg-emerald-50 border-emerald-400',
                        title: 'text-emerald-700',
                        amount: 'text-emerald-600',
                        footer: 'bg-emerald-50',
                        total: 'text-emerald-700'
                    })}

                    {renderSection('COST OF GOODS SOLD', profitLoss.cogsItems, 'Total COGS', profitLoss.totalCogs, {
                        header: 'bg-amber-50 border-amber-400',
                        title: 'text-amber-700',
                        amount: 'text-amber-600',
                        footer: 'bg-amber-50',
                        total: 'text-amber-700'
                    })}

                    <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-bold text-blue-700">Gross Profit</span>
                        <span className="text-sm font-black text-blue-800">{formatCurrency(profitLoss.grossProfit)}</span>
                    </div>

                    {renderSection(
                        'OPERATING EXPENSES',
                        profitLoss.operatingExpenseItems,
                        'Total Operating Expenses',
                        profitLoss.totalOperatingExpenses,
                        {
                            header: 'bg-red-50 border-red-400',
                            title: 'text-red-700',
                            amount: 'text-red-600',
                            footer: 'bg-red-50',
                            total: 'text-red-700'
                        }
                    )}

                    {renderSection('OTHER INCOME', profitLoss.otherIncomeItems, 'Total Other Income', profitLoss.totalOtherIncome, {
                        header: 'bg-cyan-50 border-cyan-400',
                        title: 'text-cyan-700',
                        amount: 'text-cyan-600',
                        footer: 'bg-cyan-50',
                        total: 'text-cyan-700'
                    })}

                    <div className={`p-5 rounded-xl border ${toNumber(profitLoss.netProfit) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} flex items-center justify-between`}>
                        <div>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${toNumber(profitLoss.netProfit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {toNumber(profitLoss.netProfit) >= 0 ? 'Net Profit' : 'Net Loss'}
                            </p>
                            <p className={`text-2xl font-black ${toNumber(profitLoss.netProfit) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {formatCurrency(Math.abs(toNumber(profitLoss.netProfit)))}
                            </p>
                        </div>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black ${toNumber(profitLoss.netProfit) >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {toNumber(profitLoss.netProfit) >= 0 ? '\u2191' : '\u2193'}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const BalanceSheetTab = () => {
        if (reportStatus.balanceSheet.loading) return <LoadingState label="Loading Balance Sheet..." />;
        if (reportStatus.balanceSheet.error || !balanceSheet) {
            return (
                <ErrorState
                    title="Balance Sheet unavailable"
                    message={reportStatus.balanceSheet.error || 'Balance Sheet data could not be loaded.'}
                />
            );
        }

        const liabilitiesPlusEquity = toNumber(balanceSheet.totalLiabilities) + toNumber(balanceSheet.totalEquity);

        const renderRows = (items, colorClass, totalLabel, totalAmount) => (
            <div className="border border-slate-200 rounded-b-lg overflow-hidden">
                <table className="w-full">
                    <tbody className="divide-y divide-slate-100">
                        {(items || []).map((item, index) => (
                            <tr key={`${item.accountCode || item.accountName || index}`} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2 text-xs text-slate-700">
                                    {item.accountName}
                                    {item.accountCode ? <span className="ml-2 text-[10px] text-slate-400 font-mono">{item.accountCode}</span> : null}
                                </td>
                                <td className={`px-4 py-2 text-right text-xs font-medium ${colorClass}`}>{formatCurrency(item.amount)}</td>
                            </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold">
                            <td className="px-4 py-3 text-xs text-slate-800">{totalLabel}</td>
                            <td className={`px-4 py-3 text-right text-xs ${colorClass}`}>{formatCurrency(totalAmount)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );

        return (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Balance Sheet</h3>
                        <span className="text-xs text-slate-400">As of {balanceSheet.asOfDate}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <div className="bg-blue-50 px-4 py-2 rounded-t-lg border-b-2 border-blue-400">
                                <h4 className="text-sm font-bold text-blue-700">ASSETS</h4>
                            </div>
                            {renderRows(balanceSheet.assetItems, 'text-blue-600', 'Total Assets', balanceSheet.totalAssets)}
                        </div>

                        <div>
                            <div className="bg-red-50 px-4 py-2 rounded-t-lg border-b-2 border-red-400">
                                <h4 className="text-sm font-bold text-red-700">LIABILITIES</h4>
                            </div>
                            {renderRows(balanceSheet.liabilityItems, 'text-red-600', 'Total Liabilities', balanceSheet.totalLiabilities)}

                            <div className="bg-purple-50 px-4 py-2 border-b-2 border-purple-400 border-t-2 border-t-slate-200 rounded-t-lg mt-4">
                                <h4 className="text-sm font-bold text-purple-700">EQUITY</h4>
                            </div>
                            {renderRows(balanceSheet.equityItems, 'text-purple-600', 'Total Equity', balanceSheet.totalEquity)}
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-700">Total Liabilities + Equity:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(liabilitiesPlusEquity)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-2">
                            <span className="font-bold text-slate-700">Total Assets:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(balanceSheet.totalAssets)}</span>
                        </div>
                        <div className={`mt-3 pt-3 border-t-2 flex items-center gap-2 text-xs ${balanceSheet.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                            {balanceSheet.balanced ? (
                                <><CheckCircle size={16} /> <span className="font-bold">Balance Sheet is balanced.</span></>
                            ) : (
                                <><AlertCircle size={16} /> <span className="font-bold">Balance Sheet has a discrepancy.</span></>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const CashFlowTab = () => {
        if (reportStatus.cashFlow.loading) return <LoadingState label="Loading Cash Flow..." />;
        if (reportStatus.cashFlow.error || !cashFlow) {
            return (
                <ErrorState
                    title="Cash Flow unavailable"
                    message={reportStatus.cashFlow.error || 'Cash Flow data could not be loaded.'}
                />
            );
        }

        const cashFlowRows = [
            ...(cashFlow.operatingActivities || []).map((item) => ({ ...item, section: 'Operating' })),
            ...(cashFlow.investingActivities || []).map((item) => ({ ...item, section: 'Investing' })),
            ...(cashFlow.financingActivities || []).map((item) => ({ ...item, section: 'Financing' }))
        ];

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Operating Cash Flow</p>
                            <h3 className={`text-2xl font-bold ${toNumber(cashFlow.totalOperating) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(cashFlow.totalOperating)}
                            </h3>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Investing Cash Flow</p>
                            <h3 className={`text-2xl font-bold ${toNumber(cashFlow.totalInvesting) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(cashFlow.totalInvesting)}
                            </h3>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg text-red-600">
                            <TrendingDown size={20} />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Financing Cash Flow</p>
                            <h3 className={`text-2xl font-bold ${toNumber(cashFlow.totalFinancing) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(cashFlow.totalFinancing)}
                            </h3>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
                            <Wallet size={20} />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Net Cash Flow</p>
                            <h3 className={`text-2xl font-bold ${toNumber(cashFlow.netCashFlow) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(cashFlow.netCashFlow)}
                            </h3>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                            <DollarSign size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700">Cash Flow Trend</h3>
                        <span className="text-xs text-slate-400">
                            {cashFlow.startDate} to {cashFlow.endDate}
                        </span>
                    </div>
                    {trendStatus.cashFlow.loading ? (
                        <LoadingState label="Loading monthly cash flow trend..." />
                    ) : trendStatus.cashFlow.error ? (
                        <ErrorState title="Cash Flow trend unavailable" message={trendStatus.cashFlow.error} />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={cashFlowTrends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
                                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Area type="monotone" dataKey="operating" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.35} name="Operating" />
                                <Area type="monotone" dataKey="investing" stackId="2" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.25} name="Investing" />
                                <Area type="monotone" dataKey="financing" stackId="3" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.25} name="Financing" />
                                <Line type="monotone" dataKey="netCashFlow" stroke="#0F172A" strokeWidth={2} name="Net Cash Flow" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Cash Flow Statement Lines</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Section</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bucket</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {cashFlowRows.map((item, index) => (
                                    <tr key={`${item.accountCode || item.accountName || index}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.section}</td>
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">
                                            {item.accountName}
                                            {item.accountCode ? <span className="ml-2 text-[10px] text-slate-400 font-mono">{item.accountCode}</span> : null}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.category || '-'}</td>
                                        <td className={`px-4 py-3 text-right text-xs font-medium ${toNumber(item.amount) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {formatCurrency(item.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const ExpenseAnalysisTab = () => {
        if (reportStatus.expenseAnalysis.loading) return <LoadingState label="Loading expense analysis..." />;
        if (reportStatus.expenseAnalysis.error || !expenseAnalysis) {
            return (
                <ErrorState
                    title="Expense Analysis unavailable"
                    message={reportStatus.expenseAnalysis.error || 'Expense Analysis data could not be loaded.'}
                />
            );
        }

        const byCategory = (expenseAnalysis.byCategory || []).map((item) => ({
            category: item.groupName,
            total: toNumber(item.amount)
        }));
        const byCostCenter = (expenseAnalysis.byCostCenter || []).map((item) => ({
            costCenter: item.groupName,
            total: toNumber(item.amount)
        }));

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <PieChart size={16} className="text-purple-600" />
                            Expenses by Category
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <RechartsPie>
                                <Pie
                                    data={byCategory.slice(0, 8)}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={100}
                                    dataKey="total"
                                >
                                    {byCategory.slice(0, 8).map((entry, index) => (
                                        <Cell key={`${entry.category || index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                            </RechartsPie>
                        </ResponsiveContainer>
                    </div>

                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Target size={16} className="text-orange-600" />
                            Expenses by Cost Center
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={byCostCenter.slice(0, 10)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="costCenter" tick={{ fontSize: 10 }} stroke="#64748b" angle={-45} textAnchor="end" height={80} />
                                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Bar dataKey="total" fill="#F59E0B" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Top Expenses</h3>
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full">
                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Voucher No</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost Center</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(expenseAnalysis.detailLines || []).slice(0, 15).map((item, index) => (
                                    <tr key={`${item.voucherNo || item.accountCode || index}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{item.transactionDate || '-'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">{item.voucherNo || '-'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">
                                            {item.accountName || '-'}
                                            {item.accountCode ? <span className="ml-2 text-[10px] text-slate-400 font-mono">{item.accountCode}</span> : null}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{item.costCenter || 'Unassigned'}</td>
                                        <td className="px-4 py-3 text-right text-xs text-red-600 font-bold">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const TaxDashboardTab = () => {
        const taxConfigs = referenceData.taxConfigs || [];
        const taxFilings = referenceData.taxFilings || [];
        const pendingFilings = taxFilings.filter((item) => item.status === 'PENDING' || item.status === 'DRAFT');
        const completedFilings = taxFilings.filter((item) => item.status === 'FILED');

        return (
            <div className="space-y-6">
                {reportStatus.taxDashboard.loading ? (
                    <LoadingState label="Loading tax dashboard..." />
                ) : reportStatus.taxDashboard.error || !taxDashboard ? (
                    <ErrorState
                        title="Tax summary unavailable"
                        message={reportStatus.taxDashboard.error || 'Tax dashboard data could not be loaded.'}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500 font-medium mb-1">Output Tax</p>
                                <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(taxDashboard.outputTax)}</h3>
                                <p className="text-[10px] text-slate-400 mt-1">Tax collected on sales</p>
                            </div>
                            <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
                                <FileText size={20} />
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500 font-medium mb-1">Input Tax</p>
                                <h3 className="text-2xl font-bold text-emerald-600">{formatCurrency(taxDashboard.inputTax)}</h3>
                                <p className="text-[10px] text-slate-400 mt-1">Recoverable purchase tax</p>
                            </div>
                            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
                                <Clock size={20} />
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500 font-medium mb-1">Taxable Sales Base</p>
                                <h3 className="text-2xl font-bold text-blue-600">{formatCurrency(taxDashboard.taxableSalesBase)}</h3>
                                <p className="text-[10px] text-slate-400 mt-1">Net taxable revenue</p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                                <BarChart3 size={20} />
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500 font-medium mb-1">Net Tax Payable</p>
                                <h3 className={`text-2xl font-bold ${toNumber(taxDashboard.netTaxPayable) >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {formatCurrency(taxDashboard.netTaxPayable)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-1">{taxDashboard.period}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                                <CheckCircle size={20} />
                            </div>
                        </div>
                    </div>
                )}

                {reportStatus.taxReconciliation.loading ? (
                    <LoadingState label="Loading tax reconciliation..." />
                ) : reportStatus.taxReconciliation.error || !taxReconciliation ? (
                    <ErrorState
                        title="Tax reconciliation unavailable"
                        message={reportStatus.taxReconciliation.error || 'Tax reconciliation data could not be loaded.'}
                    />
                ) : (
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-slate-700">Tax Reconciliation</h3>
                            <span className="text-xs text-slate-400">{taxReconciliation.period}</span>
                        </div>
                        <div className="overflow-x-auto border border-slate-100 rounded-lg">
                            <table className="w-full">
                                <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Document No</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Base Amount</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(taxReconciliation.lines || []).map((line, index) => (
                                        <tr key={`${line.documentNumber || index}`} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-xs text-slate-600 font-mono">{line.documentNumber || '-'}</td>
                                            <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{line.type || '-'}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600">{line.accountName || '-'}</td>
                                            <td className="px-4 py-3 text-right text-xs text-slate-800 font-medium">{formatCurrency(line.baseAmount)}</td>
                                            <td className="px-4 py-3 text-right text-xs text-red-600 font-bold">{formatCurrency(line.taxAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700">Reference Tax Setup</h3>
                        <span className="text-xs text-slate-400">Reference only, not used for financial totals</span>
                    </div>
                    {referenceStatus.loading ? (
                        <LoadingState label="Loading tax reference data..." />
                    ) : referenceStatus.error ? (
                        <ErrorState title="Reference tax data unavailable" message={referenceStatus.error} />
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Tax Configurations</p>
                                        <p className="text-xl font-bold text-slate-800">{taxConfigs.length}</p>
                                    </div>
                                    <FileText size={18} className="text-slate-500" />
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Pending Filings</p>
                                        <p className="text-xl font-bold text-yellow-600">{pendingFilings.length}</p>
                                    </div>
                                    <Clock size={18} className="text-yellow-600" />
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Completed Filings</p>
                                        <p className="text-xl font-bold text-emerald-600">{completedFilings.length}</p>
                                    </div>
                                    <CheckCircle size={18} className="text-emerald-600" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Tax Configurations</h4>
                                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                                        <table className="w-full">
                                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax Type</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Frequency</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {taxConfigs.map((config, index) => (
                                                    <tr key={`${config.type || index}`} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{config.type}</td>
                                                        <td className="px-4 py-3 text-xs text-slate-600">{config.rate}%</td>
                                                        <td className="px-4 py-3 text-xs text-slate-600">{config.frequency}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Tax Filings</h4>
                                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                                        <table className="w-full">
                                            <thead className="bg-[#F7F7FA] border-b border-slate-100">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Period</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Due Date</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {taxFilings.map((filing, index) => (
                                                    <tr key={`${filing.period || index}`} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3 text-xs text-slate-700 font-semibold">{filing.period}</td>
                                                        <td className="px-4 py-3 text-xs text-slate-600">{filing.dueDate}</td>
                                                        <td className="px-4 py-3 text-xs text-slate-600">{filing.status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500 font-medium animate-pulse">Loading Financial Reports...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-[#F5C742]" size={28} />
                        Financial Reports
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Comprehensive financial analysis and reporting dashboard</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                    >
                        <FileSpreadsheet size={16} className="text-emerald-600" /> Export CSV
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
                    >
                        <Download size={16} className="text-blue-600" /> Print PDF
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600">Period:</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'].map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${dateRange === range
                                    ? 'bg-[#F5C742] text-slate-900'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {range === 'thisMonth' && 'This Month'}
                                {range === 'lastMonth' && 'Last Month'}
                                {range === 'thisQuarter' && 'This Quarter'}
                                {range === 'thisYear' && 'This Year'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-1 mb-6 flex gap-1 overflow-x-auto">
                {[
                    { id: 'overview', label: 'Overview', icon: Activity },
                    { id: 'trialBalance', label: 'Trial Balance', icon: Scale },
                    { id: 'profitLoss', label: 'P&L', icon: TrendingUp },
                    { id: 'balanceSheet', label: 'Balance Sheet', icon: Wallet },
                    { id: 'cashFlow', label: 'Cash Flow', icon: DollarSign },
                    { id: 'expenses', label: 'Expense Analysis', icon: PieChart },
                    { id: 'tax', label: 'Tax Dashboard', icon: FileText }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            <div>
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'trialBalance' && <TrialBalanceTab />}
                {activeTab === 'profitLoss' && <ProfitLossTab />}
                {activeTab === 'balanceSheet' && <BalanceSheetTab />}
                {activeTab === 'cashFlow' && <CashFlowTab />}
                {activeTab === 'expenses' && <ExpenseAnalysisTab />}
                {activeTab === 'tax' && <TaxDashboardTab />}
            </div>
        </div>
    );
};

export default FinancialReports;
