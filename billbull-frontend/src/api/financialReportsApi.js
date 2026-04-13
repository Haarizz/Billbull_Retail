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
            transactions,
            receiptVouchers,
            journalVouchers,
            expenses,
            taxConfigs,
            taxFilings
        };
    } catch (error) {
        console.error('Error fetching financial reports data:', error);
        throw error;
    }
};

/**
 * Calculate key financial metrics
 */
export const calculateFinancialMetrics = (data) => {
    const { accounts, transactions, expenses } = data;

    // Calculate total revenue (Income accounts)
    const totalRevenue = accounts
        .filter(acc => acc.accountGroup === 'Income' && acc.status !== 'archived')
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);

    // Calculate total expenses
    const totalExpenses = expenses
        .reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

    // Calculate net profit
    const netProfit = totalRevenue - totalExpenses;

    // Calculate total assets
    const totalAssets = accounts
        .filter(acc => acc.accountGroup === 'Assets' && acc.status !== 'archived')
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);

    // Calculate total liabilities
    const totalLiabilities = accounts
        .filter(acc => acc.accountGroup === 'Liabilities' && acc.status !== 'archived')
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);

    // Calculate cash balance (assuming Cash/Bank accounts are in Assets)
    const cashBalance = accounts
        .filter(acc =>
            acc.accountGroup === 'Assets' &&
            acc.status !== 'archived' &&
            (acc.name.toLowerCase().includes('cash') || acc.name.toLowerCase().includes('bank'))
        )
        .reduce((sum, acc) => sum + parseFloat(acc.balanceAmount || 0), 0);

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
 * Filter transactions by date range
 */
export const filterByDateRange = (items, startDate, endDate, dateField = 'transactionDate') => {
    if (!startDate || !endDate) return items;

    const start = new Date(startDate);
    const end = new Date(endDate);

    return items.filter(item => {
        const itemDate = new Date(item[dateField]);
        return itemDate >= start && itemDate <= end;
    });
};

/**
 * Group expenses by category
 */
export const groupExpensesByCategory = (expenses) => {
    const grouped = expenses.reduce((acc, expense) => {
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
    const grouped = expenses.reduce((acc, expense) => {
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
        const monthTransactions = transactions.filter(txn => {
            const txnDate = new Date(txn.transactionDate);
            return txnDate.getMonth() === date.getMonth() &&
                txnDate.getFullYear() === date.getFullYear();
        });

        // Filter expenses for this month
        const monthExpenses = expenses.filter(exp => {
            const expDate = new Date(exp.date || exp.createdAt);
            return expDate.getMonth() === date.getMonth() &&
                expDate.getFullYear() === date.getFullYear();
        });

        const revenue = monthTransactions
            .filter(txn => txn.type === 'Credit' || txn.creditAmount > 0)
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
 * Get account balance distribution
 */
export const getAccountBalanceDistribution = (accounts) => {
    const groups = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity'];

    return groups.map(group => {
        const total = accounts
            .filter(acc => acc.accountGroup === group && acc.status !== 'archived')
            .reduce((sum, acc) => sum + Math.abs(parseFloat(acc.balanceAmount || 0)), 0);

        return {
            name: group,
            value: Math.round(total)
        };
    }).filter(item => item.value > 0);
};

export default {
    getFinancialReportsData,
    calculateFinancialMetrics,
    filterByDateRange,
    groupExpensesByCategory,
    groupExpensesByCostCenter,
    getMonthlyTrends,
    getAccountBalanceDistribution
};
