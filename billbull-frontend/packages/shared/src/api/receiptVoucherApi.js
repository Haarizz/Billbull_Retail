import api from './axiosConfig';

const BASE_PATH = '/api/sales/receipt-vouchers';

// QA-040: send the designed-template Receipt Voucher email.
export const sendReceiptVoucherEmail = async (
    id,
    { toEmail = '', subject = '', htmlBody = '', inlineAttachments = [] } = {}
) => {
    try {
        const res = await api.post(`${BASE_PATH}/${id}/send-email`, {
            toEmail, subject, htmlBody, inlineAttachments,
        });
        return res.data;
    } catch (err) {
        throw new Error(err?.response?.data || 'Failed to send email');
    }
};

export const getNextReceiptVoucherNumber = async () => {
    const res = await api.get(`${BASE_PATH}/next-number`);
    return res.data.voucherNumber;
};

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
