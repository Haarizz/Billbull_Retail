// src/api/financialReportsBackendApi.js
// API calls for server-side financial report endpoints (Phase 2 backend)
import api from "./axiosConfig";

// ==================== FINANCIAL REPORTS ====================

export const getTrialBalance = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/trial-balance", { params });
    return res.data;
};

export const getProfitLoss = async (startDate, endDate, branchId, costCenter) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    if (costCenter && costCenter !== "All") params.costCenter = costCenter;
    const res = await api.get("/api/financials/reports/profit-loss", { params });
    return res.data;
};

export const getBalanceSheet = async (asOfDate, branchId) => {
    const params = {};
    if (asOfDate) params.asOfDate = asOfDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/balance-sheet", { params });
    return res.data;
};

export const getCashFlow = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/cash-flow", { params });
    return res.data;
};

export const getExpenseAnalysis = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/expense-analysis", { params });
    return res.data;
};

export const getTaxDashboard = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/tax-dashboard", { params });
    return res.data;
};

export const getTaxReconciliation = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/tax-reconciliation", { params });
    return res.data;
};

export const getARAgingReport = async (asOfDate) => {
    const params = {};
    if (asOfDate) params.asOfDate = asOfDate;
    const res = await api.get("/api/financials/reports/ar-aging", { params });
    return res.data;
};

export const getAPAgingReport = async (asOfDate) => {
    const params = {};
    if (asOfDate) params.asOfDate = asOfDate;
    const res = await api.get("/api/financials/reports/ap-aging", { params });
    return res.data;
};

export const getLedgerStatement = async (accountCode, startDate, endDate) => {
    const params = { accountCode };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await api.get("/api/financials/reports/ledger-statement", { params });
    return res.data;
};

export const getVatReturnReport = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/vat-return", { params });
    return res.data;
};

export const getDetailedTrialBalance = async (startDate, endDate, branchId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/detailed-trial-balance", { params });
    return res.data;
};

export const getCommitmentReport = async (branchId) => {
    const params = {};
    if (branchId && branchId !== "All") params.branchId = branchId;
    const res = await api.get("/api/financials/reports/commitment", { params });
    return res.data;
};

export const getSubLedgerReconciliation = async () => {
    const res = await api.get("/api/financials/reports/reconciliation");
    return res.data;
};

// ==================== GL SPECIAL VOUCHERS ====================

export const postVatSettlement = async (payload) => {
    const res = await api.post("/api/ledger/vat-settlement", payload);
    return res.data;
};

export const postVatPayment = async (payload) => {
    const res = await api.post("/api/ledger/vat-payment", payload);
    return res.data;
};

export const postContraVoucher = async (payload) => {
    const res = await api.post("/api/ledger/contra-voucher", payload);
    return res.data;
};

export const postEquityInjection = async (payload) => {
    const res = await api.post("/api/ledger/equity-injection", payload);
    return res.data;
};

export const saveOpeningBalances = async (payload, asOfDate) => {
    const params = {};
    if (asOfDate) params.asOfDate = asOfDate;
    const res = await api.post("/api/ledger/accounts/opening-balance", payload, { params });
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
