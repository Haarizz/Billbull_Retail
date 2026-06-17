// src/api/ledgerApi.js
import api from "./axiosConfig";

// ================= ACCOUNTS =================

export const getAccounts = async () => {
  const res = await api.get("/api/ledger/accounts");
  return res.data;
};

export const getBankAccounts = async () => {
  const res = await api.get("/api/ledger/accounts/bank-accounts");
  return res.data;
};

// Backend handles both Create and Update via POST based on ID presence
export const createAccount = async (payload) => {
  const res = await api.post("/api/ledger/accounts", payload);
  return res.data;
};

export const updateAccount = async (payload) => {
  const res = await api.post("/api/ledger/accounts", payload);
  return res.data;
};

export const archiveAccount = async (id) => {
  const res = await api.post(`/api/ledger/accounts/${id}/archive`);
  return res.data;
};

export const unarchiveAccount = async (id) => {
  const res = await api.post(`/api/ledger/accounts/${id}/unarchive`);
  return res.data;
};

// ================= COST CENTERS =================

export const getCostCenters = async () => {
  const res = await api.get("/api/ledger/cost-centers");
  return res.data;
};

export const createCostCenter = async (payload) => {
  const res = await api.post("/api/ledger/cost-centers", payload);
  return res.data;
};

export const updateCostCenter = async (payload) => {
  const res = await api.post("/api/ledger/cost-centers", payload);
  return res.data;
};

export const archiveCostCenter = async (id) => {
  const res = await api.post(`/api/ledger/cost-centers/${id}/archive`);
  return res.data;
};

export const unarchiveCostCenter = async (id) => {
  const res = await api.post(`/api/ledger/cost-centers/${id}/unarchive`);
  return res.data;
};

// ================= TRANSACTIONS (GENERAL LEDGER) =================

export const getTransactions = async () => {
  const res = await api.get("/api/ledger/transactions");
  return res.data;
};

export const createTransaction = async (payload) => {
  const res = await api.post("/api/ledger/transactions", payload);
  return res.data;
};

// ================= OPENING BALANCES =================
export const saveOpeningBalances = async (payload) => {
  const res = await api.post("/api/ledger/accounts/opening-balance", payload);
  return res.data;
};

export const getOpeningBalanceLocks = async () => {
  const res = await api.get("/api/ledger/accounts/opening-balance-locks");
  return res.data;
};

// ================= BANK RECONCILIATION =================
export const finalizeReconciliation = async (payload) => {
  const res = await api.post("/api/reconciliation/finalize", payload);
  return res.data;
};

// ──────────────── Bank Statement Reconciliation ────────────────
export const getBankStatements = async (branchId) => {
  const params = branchId ? { branchId } : {};
  const res = await api.get("/api/bank-reconciliation/statements", { params });
  return res.data;
};

export const createBankStatement = async (payload) => {
  const res = await api.post("/api/bank-reconciliation/statements", payload);
  return res.data;
};

export const importBankStatementLines = async (statementId, lines) => {
  const res = await api.post(`/api/bank-reconciliation/statements/${statementId}/lines`, lines);
  return res.data;
};

export const matchStatementLine = async (statementLineId, journalLineId) => {
  const res = await api.post(`/api/bank-reconciliation/lines/${statementLineId}/match`, null, {
    params: { journalLineId },
  });
  return res.data;
};

export const autoMatchStatement = async (statementId) => {
  const res = await api.post(`/api/bank-reconciliation/statements/${statementId}/auto-match`);
  return res.data;
};

export const postBankCharge = async (statementLineId, branchId) => {
  const params = branchId ? { branchId } : {};
  const res = await api.post(`/api/bank-reconciliation/lines/${statementLineId}/post-charge`, null, { params });
  return res.data;
};

export const postBankInterest = async (statementLineId, branchId) => {
  const params = branchId ? { branchId } : {};
  const res = await api.post(`/api/bank-reconciliation/lines/${statementLineId}/post-interest`, null, { params });
  return res.data;
};

export const getReconciliationSummary = async (statementId) => {
  const res = await api.get(`/api/bank-reconciliation/statements/${statementId}/summary`);
  return res.data;
};

export const markStatementReconciled = async (statementId) => {
  const res = await api.post(`/api/bank-reconciliation/statements/${statementId}/reconcile`);
  return res.data;
};

// ──────────────── PDC (Post-Dated Cheques) ────────────────
export const getPdcEntries = async (params) => {
  const res = await api.get("/api/pdc", { params });
  return res.data;
};

export const createPdcEntry = async (payload) => {
  const res = await api.post("/api/pdc", payload);
  return res.data;
};

export const updatePdcStatus = async (id, newStatus) => {
  const res = await api.post(`/api/pdc/${id}/status`, null, { params: { newStatus } });
  return res.data;
};

// ──────────────── GL Special Vouchers ────────────────
export const postContraVoucher = async (payload) => {
  const res = await api.post("/api/ledger/contra-voucher", payload);
  return res.data;
};

export const postEquityInjection = async (payload) => {
  const res = await api.post("/api/ledger/equity-injection", payload);
  return res.data;
};

export const postVatSettlement = async (payload) => {
  const res = await api.post("/api/ledger/vat-settlement", payload);
  return res.data;
};

export const postVatPayment = async (payload) => {
  const res = await api.post("/api/ledger/vat-payment", payload);
  return res.data;
};
