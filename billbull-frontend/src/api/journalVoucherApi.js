import api from './axiosConfig';

const BASE_PATH = '/api/generalledger/journal-entries';

export const journalVoucherApi = {
    getAll: async () => {
        const token = sessionStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await api.get(BASE_PATH, { headers });
        return response.data;
    },

    getById: async (id) => {
        const response = await api.get(`${BASE_PATH}/${id}`);
        return response.data;
    },

    create: async (journalVoucher) => {
        const response = await api.post(`${BASE_PATH}/manual`, journalVoucher);
        return response.data;
    },

    update: async (id, journalVoucher) => {
        const response = await api.put(`${BASE_PATH}/manual/${id}`, journalVoucher);
        return response.data;
    },

    post: async (id, postedBy) => {
        const response = await api.post(`${BASE_PATH}/${id}/post`, { postedBy });
        return response.data;
    },

    delete: async (id) => {
        await api.delete(`${BASE_PATH}/${id}`);
    },

    submit: async (id, submittedBy) => {
        const response = await api.post(`${BASE_PATH}/${id}/submit`, { submittedBy });
        return response.data;
    },

    approve: async (id, approvedBy) => {
        const response = await api.post(`${BASE_PATH}/${id}/approve`, { approvedBy });
        return response.data;
    },

    reject: async (id, rejectedBy, reason) => {
        const response = await api.post(`${BASE_PATH}/${id}/reject`, { rejectedBy, reason });
        return response.data;
    }
};

export default journalVoucherApi;
