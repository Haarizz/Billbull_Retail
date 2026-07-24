import api from "./axiosConfig";

// Branch-level Tax Configuration (Tax Enabled / Tax Mode / Branch Default VAT Rate).
// Tax is a branch-wide ERP configuration, not a POS-specific setting — this is the only
// place it's edited. Sales/POS screens read it via getBranchTaxSummary() in taxApi.js and
// pass taxEnabled/branchDefaultVatRate into vatMath.js:resolveLineTaxRate() so the Tax
// Enabled kill switch is honored on every computed line; the backend's single source of
// truth is BranchTaxResolutionService.

export const getBranchTaxConfiguration = async () => {
  const res = await api.get("/api/branches/tax-configuration");
  return res.data;
};

export const getBranchTaxConfigurationForBranch = async (branchId) => {
  const res = await api.get(`/api/branches/${branchId}/tax-configuration`);
  return res.data;
};

export const saveBranchTaxConfiguration = async (branchId, config) => {
  const res = await api.put(`/api/branches/${branchId}/tax-configuration`, config);
  return res.data;
};
