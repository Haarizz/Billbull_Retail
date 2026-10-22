import api from './axiosConfig';

const BASE_PATH = '/api/sales/receipt-vouchers';

// QA-040: send the designed-template Receipt Voucher email.
export const sendReceiptVoucherEmail = async (
    id,
    { toEmail = '', subject = '', htmlBody = '', inlineAttachments = [], pdfHtml } = {}
) => {
    try {
        const res = await api.post(`${BASE_PATH}/${id}/send-email`, {
            toEmail, subject, htmlBody, inlineAttachments, pdfHtml,
        });
        return res.data;
    } catch (err) {
        // Plain-text bodies from the send-email handlers; JSON { message } from the global handler.
        const data = err?.response?.data;
        throw new Error((typeof data === 'string' && data) || data?.message || 'Failed to send email');
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
