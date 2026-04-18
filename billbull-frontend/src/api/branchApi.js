import api from "./axiosConfig";

export const getBranches = async () => {
    const res = await api.get("/api/branches");
    return res.data;
};

export const getDefaultBranch = async () => {
    const res = await api.get("/api/branches/default");
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

export const deleteBranch = async (id) => {
    await api.delete(`/api/branches/${id}`);
};
