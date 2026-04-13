// src/api/financialReportsBackendApi.js
// API calls for server-side financial report endpoints (Phase 2 backend)
import api from "./axiosConfig";

// ==================== FINANCIAL REPORTS ====================

export const getTrialBalance = async (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/trial-balance", { params });
    return res.data;
};

export const getProfitLoss = async (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/profit-loss", { params });
    return res.data;
};

export const getBalanceSheet = async (asOfDate) => {
    const params = {};
    if (asOfDate) params.asOfDate = asOfDate;
    const res = await api.get("/api/financials/reports/balance-sheet", { params });
    return res.data;
};

export const getCashFlow = async (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/cash-flow", { params });
    return res.data;
};

export const getExpenseAnalysis = async (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/expense-analysis", { params });
    return res.data;
};

export const getTaxDashboard = async (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/tax-dashboard", { params });
    return res.data;
};

export const getLedgerStatement = async (accountCode, startDate, endDate) => {
    const params = { accountCode };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/ledger-statement", { params });
    return res.data;
};

// ==================== COA TREE ====================

export const getAccountTree = async () => {
    const res = await api.get("/api/ledger/accounts/tree");
    return res.data;
};

// ==================== POSTING RULES ====================

export const getPostingRules = async () => {
    const res = await api.get("/api/financials/posting-rules");
    return res.data;
};

export const getPostingRulesByType = async (transactionType) => {
    const res = await api.get(`/api/financials/posting-rules/by-type/${transactionType}`);
    return res.data;
};

export const createPostingRule = async (rule) => {
    const res = await api.post("/api/financials/posting-rules", rule);
    return res.data;
};

export const updatePostingRule = async (id, rule) => {
    const res = await api.put(`/api/financials/posting-rules/${id}`, rule);
    return res.data;
};

export const deletePostingRule = async (id) => {
    await api.delete(`/api/financials/posting-rules/${id}`);
};

// ==================== PAYMENT METHODS ====================

export const getPaymentMethods = async () => {
    const res = await api.get("/api/financials/payment-methods");
    return res.data;
};

export const getActivePaymentMethods = async () => {
    const res = await api.get("/api/financials/payment-methods/active");
    return res.data;
};

export const createPaymentMethod = async (method) => {
    const res = await api.post("/api/financials/payment-methods", method);
    return res.data;
};

export const updatePaymentMethod = async (id, method) => {
    const res = await api.put(`/api/financials/payment-methods/${id}`, method);
    return res.data;
};

export const deletePaymentMethod = async (id) => {
    await api.delete(`/api/financials/payment-methods/${id}`);
};
