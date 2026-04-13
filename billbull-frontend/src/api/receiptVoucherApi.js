import api from './axiosConfig';

const BASE_PATH = '/api/sales/receipt-vouchers';

export const receiptVoucherApi = {
    getAll: async () => {
        const response = await api.get(BASE_PATH);
        return response.data;
    },

    getById: async (id) => {
        const response = await api.get(`${BASE_PATH}/${id}`);
        return response.data;
    },

    create: async (formData) => {
        // formData is a FormData object containing 'data' and 'file'
        const response = await api.post(BASE_PATH, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    },

    update: async (id, formData) => {
        const response = await api.put(`${BASE_PATH}/${id}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    },

    delete: async (id) => {
        await api.delete(`${BASE_PATH}/${id}`);
    }
};
