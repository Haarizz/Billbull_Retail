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
