import api from "./axiosConfig";

export const getBranches = async () => {
    const res = await api.get("/api/branches");
    return res.data;
};

export const getDefaultBranch = async () => {
    const res = await api.get("/api/branches/default");
    return res.data;
};

export const getHeadquartersBranch = async () => {
    const res = await api.get("/api/branches/headquarters");
    return res.data;
};

export const createBranch = async (payload) => {
    const res = await api.post("/api/branches", payload);
    return res.data;
};

export const updateBranch = async (id, payload) => {
    const res = await api.put(`/api/branches/${id}`, payload);
    return res.data;
};

export const setDefaultBranch = async (id) => {
    const res = await api.put(`/api/branches/${id}/default`);
    return res.data;
};

export const setHeadquartersBranch = async (id) => {
    const res = await api.put(`/api/branches/${id}/headquarters`);
    return res.data;
};

export const deleteBranch = async (id) => {
    await api.delete(`/api/branches/${id}`);
};

export const switchBranchSession = async (branchId) => {
    const res = await api.post("/api/session/switch-branch", { branchId });
    return res.data;
};

// Branch-Level Inventory Phase 11 — read-only tenant flag so the UI only shows branch labels/
// badges when inventory branch-scoping is actually active (avoids cosmetic drift). Fails soft to
// disabled so the UI stays unchanged if the endpoint is unavailable.
export const getInventoryBranchScopeStatus = async () => {
    try {
        const res = await api.get("/api/inventory/branch-scope/status");
        return Boolean(res?.data?.enabled);
    } catch {
        return false;
    }
};

export const uploadBranchLogo = async (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/api/branches/${id}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
};

export const uploadBranchStamp = async (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/api/branches/${id}/stamp`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
};
