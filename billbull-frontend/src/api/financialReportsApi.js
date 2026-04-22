// src/api/financialReportsApi.js
import { getAccounts, getCostCenters, getTransactions } from './ledgerApi';
import { receiptVoucherApi } from './receiptVoucherApi';
import { journalVoucherApi } from './journalVoucherApi';
import { fetchExpenses } from './expensesApi';
import { getTaxConfigs, getTaxFilings } from './taxApi';

/**
 * Aggregates all financial data for reporting
 */
export const getFinancialReportsData = async (startDate, endDate) => {
    try {
        const [
            accounts,
            costCenters,
            transactions,
            receiptVouchers,
            journalVouchers,
            expenses,
            taxConfigs,
            taxFilings
        ] = await Promise.all([
            getAccounts(),
            getCostCenters(),
            getTransactions(),
            receiptVoucherApi.getAll(),
            journalVoucherApi.getAll(),
            fetchExpenses(),
            getTaxConfigs(),
            getTaxFilings()
        ]);

        return {
            accounts,
            costCenters,
            transactions: filterByDateRange(transactions, startDate, endDate, 'transactionDate'),
            receiptVouchers,
            journalVouchers,
            expenses: filterByDateRange(expenses, startDate, endDate, 'date'),
            taxConfigs,
            taxFilings: filterByDateRange(taxFilings, startDate, endDate, 'periodEndDate')
        };
    } catch (error) {
        console.error('Error fetching financial reports data:', error);
        throw error;
    }
};

/**
 * Calculate key financial metrics from raw data
 */
export const calculateFinancialMetrics = (data, startDate, endDate) => {
    const accounts = data?.accounts || [];
    const transactions = data?.transactions || [];
    const expenses = data?.expenses || [];
    
    // Filter transactions and expenses if not already filtered
    const filteredTransactions = filterByDateRange(transactions, startDate, endDate, 'transactionDate');
    const filteredExpenses = filterByDateRange(expenses, startDate, endDate, 'date');

    // Calculate total revenue from credit-side ledger movement.
    const totalRevenue = filteredTransactions
        .reduce((sum, txn) => sum + parseFloat(txn.creditAmount || 0), 0);

    // Calculate total expenses
    const totalExpenses = filteredExpenses
        .reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

    // Calculate net profit
    const netProfit = totalRevenue - totalExpenses;

    // Calculate total assets
    const totalAssets = accounts
        .filter(acc => (acc.accountGroup === 'Assets' || acc.type === 'ASSET') && acc.status !== 'archived')
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || acc.balance || 0), 0);

    // Calculate total liabilities
    const totalLiabilities = accounts
        .filter(acc => (acc.accountGroup === 'Liabilities' || acc.type === 'LIABILITY') && acc.status !== 'archived')
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || acc.balance || 0), 0);

    // Calculate cash balance (assuming Cash/Bank accounts are in Assets)
    const cashBalance = accounts
        .filter(acc =>
            (acc.accountGroup === 'Assets' || acc.type === 'ASSET') &&
            acc.status !== 'archived' &&
            ((acc.name || '').toLowerCase().includes('cash') || (acc.name || '').toLowerCase().includes('bank'))
        )
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || acc.balance || 0), 0);

    return {
        totalRevenue,
        totalExpenses,
        netProfit,
        totalAssets,
        totalLiabilities,
        cashBalance,
        equity: totalAssets - totalLiabilities
    };
};

/**
 * Calculate tax summary from raw data
 */
export const calculateTaxSummary = (data, startDate, endDate) => {
    const transactions = data?.transactions || [];
    const filteredTransactions = filterByDateRange(transactions, startDate, endDate, 'transactionDate');

    // Simple heuristic: look for transactions involving tax accounts or having tax fields
    const outputTax = filteredTransactions
        .filter(txn => {
            const accName = (txn.accountName || '').toLowerCase();
            return accName.includes('vat output') || accName.includes('tax output') || accName.includes('tax collected');
        })
        .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.creditAmount || 0) - parseFloat(txn.debitAmount || 0)), 0);

    const inputTax = filteredTransactions
        .filter(txn => {
            const accName = (txn.accountName || '').toLowerCase();
            return accName.includes('vat input') || accName.includes('tax input') || accName.includes('tax paid');
        })
        .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.debitAmount || 0) - parseFloat(txn.creditAmount || 0)), 0);

    return {
        outputTax,
        inputTax,
        netTaxPayable: outputTax - inputTax,
        taxableSalesBase: outputTax / 0.05,
        taxablePurchaseBase: inputTax / 0.05
    };
};

/**
 * Filter transactions by date range
 */
export const filterByDateRange = (items, startDate, endDate, dateField = 'transactionDate') => {
    if (!startDate || !endDate) return items;

    const start = new Date(startDate);
    const end = new Date(endDate);

    return (items || []).filter(item => {
        const itemDate = new Date(item[dateField]);
        return itemDate >= start && itemDate <= end;
    });
};

/**
 * Group expenses by category
 */
export const groupExpensesByCategory = (expenses) => {
    const grouped = (expenses || []).reduce((acc, expense) => {
        const category = expense.category || 'Uncategorized';
        if (!acc[category]) {
            acc[category] = { category, total: 0, count: 0 };
        }
        acc[category].total += parseFloat(expense.amount || 0);
        acc[category].count += 1;
        return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.total - a.total);
};

/**
 * Group expenses by cost center
 */
export const groupExpensesByCostCenter = (expenses) => {
    const grouped = (expenses || []).reduce((acc, expense) => {
        const costCenter = expense.costCenter || 'Unassigned';
        if (!acc[costCenter]) {
            acc[costCenter] = { costCenter, total: 0, count: 0 };
        }
        acc[costCenter].total += parseFloat(expense.amount || 0);
        acc[costCenter].count += 1;
        return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.total - a.total);
};

/**
 * Get monthly revenue and expense trends
 */
export const getMonthlyTrends = (transactions, expenses, months = 6) => {
    const trends = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        // Filter transactions for this month
        const monthTransactions = (transactions || []).filter(txn => {
            const txnDate = new Date(txn.transactionDate);
            return txnDate.getMonth() === date.getMonth() &&
                txnDate.getFullYear() === date.getFullYear();
        });

        // Filter expenses for this month
        const monthExpenses = (expenses || []).filter(exp => {
            const expDate = new Date(exp.date || exp.createdAt);
            return expDate.getMonth() === date.getMonth() &&
                expDate.getFullYear() === date.getFullYear();
        });

        const revenue = monthTransactions
            .reduce((sum, txn) => sum + parseFloat(txn.creditAmount || 0), 0);

        const expenseTotal = monthExpenses
            .reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

        trends.push({
            month: monthName,
            revenue: Math.round(revenue),
            expenses: Math.round(expenseTotal),
            profit: Math.round(revenue - expenseTotal)
        });
    }

    return trends;
};

/**
 * Calculate detailed Balance Sheet structure
 */
export const calculateBalanceSheetDetails = (data, endDate) => {
    const accounts = data?.accounts || [];
    
    const mapToItem = (a) => ({
        accountName: a.name,
        accountCode: a.code,
        amount: Math.abs(parseFloat(a.balanceAmount || a.balance || 0)),
        category: a.subGroup || a.accountGroup
    });

    const assetItems = accounts
        .filter(a => (a.accountGroup === 'Assets' || a.type === 'ASSET') && a.status !== 'archived')
        .map(mapToItem);

    const liabilityItems = accounts
        .filter(a => (a.accountGroup === 'Liabilities' || a.type === 'LIABILITY') && a.status !== 'archived')
        .map(mapToItem);

    const equityItems = accounts
        .filter(a => (a.accountGroup === 'Equity' || a.type === 'EQUITY') && a.status !== 'archived')
        .map(mapToItem);

    const totalAssets = assetItems.reduce((sum, i) => sum + i.amount, 0);
    const totalLiabilities = liabilityItems.reduce((sum, i) => sum + i.amount, 0);
    const totalEquity = equityItems.reduce((sum, i) => sum + i.amount, 0);

    return {
        asOfDate: endDate || new Date().toISOString().split('T')[0],
        assetItems,
        liabilityItems,
        equityItems,
        totalAssets,
        totalLiabilities,
        totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
    };
};

/**
 * Calculate detailed Cash Flow structure (Heuristic)
 */
export const calculateCashFlowDetails = (data, startDate, endDate) => {
    const transactions = data?.transactions || [];
    const filteredTxns = filterByDateRange(transactions, startDate, endDate, 'transactionDate');

    // Heuristic categorization
    const operating = filteredTxns.filter(t => 
        ['Income', 'Expenses', 'Revenue', 'Sales', 'Purchase'].some(k => (t.accountName || '').includes(k))
    );
    const investing = filteredTxns.filter(t => 
        ['Asset', 'Fixed Asset', 'Investment'].some(k => (t.accountName || '').includes(k))
    );
    const financing = filteredTxns.filter(t => 
        ['Equity', 'Capital', 'Loan', 'Liability'].some(k => (t.accountName || '').includes(k))
    );

    const calcTotal = (txns) => txns.reduce((sum, t) => sum + (parseFloat(t.debitAmount || 0) - parseFloat(t.creditAmount || 0)), 0);

    const totalOperating = calcTotal(operating);
    const totalInvesting = calcTotal(investing);
    const totalFinancing = calcTotal(financing);

    const mapToActivity = (t) => ({
        accountName: t.accountName,
        accountCode: t.accountCode,
        amount: Math.abs(parseFloat(t.debitAmount || t.creditAmount || 0)),
        category: t.type,
        transactionDate: t.transactionDate
    });

    return {
        startDate,
        endDate,
        totalOperating,
        totalInvesting,
        totalFinancing,
        netCashFlow: totalOperating + totalInvesting + totalFinancing,
        operatingActivities: operating.map(mapToActivity),
        investingActivities: investing.map(mapToActivity),
        financingActivities: financing.map(mapToActivity)
    };
};

/**
 * Calculate detailed Expense Analysis structure
 */
export const calculateExpenseAnalysisDetails = (data, startDate, endDate) => {
    const expenses = data?.expenses || [];
    const filteredExpenses = filterByDateRange(expenses, startDate, endDate, 'date');

    const byCategoryRaw = groupExpensesByCategory(filteredExpenses);
    const byCostCenterRaw = groupExpensesByCostCenter(filteredExpenses);

    return {
        byCategory: byCategoryRaw.map(c => ({ groupName: c.category, amount: c.total })),
        byCostCenter: byCostCenterRaw.map(c => ({ groupName: c.costCenter, amount: c.total })),
        detailLines: filteredExpenses.map(e => ({
            transactionDate: e.date || e.createdAt,
            voucherNo: e.voucherNo,
            accountName: e.category,
            accountCode: e.id,
            costCenter: e.costCenter,
            amount: e.amount
        }))
    };
};

/**
 * Get account balance distribution
 */
export const getAccountBalanceDistribution = (accounts) => {
    const groups = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity'];

    return groups.map(group => {
        const total = (accounts || [])
            .filter(acc => (acc.accountGroup === group || acc.type === group.toUpperCase()) && acc.status !== 'archived')
            .reduce((sum, acc) => sum + Math.abs(parseFloat(acc.balanceAmount || acc.balance || 0)), 0);

        return {
            name: group,
            value: Math.round(total)
        };
    }).filter(item => item.value > 0);
};

export default {
    getFinancialReportsData,
    calculateFinancialMetrics,
    calculateBalanceSheetDetails,
    calculateCashFlowDetails,
    calculateExpenseAnalysisDetails,
    calculateTaxSummary,
    filterByDateRange,
    groupExpensesByCategory,
    groupExpensesByCostCenter,
    getMonthlyTrends,
    getAccountBalanceDistribution
};
