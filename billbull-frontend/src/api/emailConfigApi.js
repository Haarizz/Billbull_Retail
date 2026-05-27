import api from './axiosConfig';

const BASE = '/api/settings/email-config';

export const getEmailConfig = () => api.get(BASE);

export const saveEmailConfig = (data) => api.put(BASE, data);

export const sendTestEmail = (toEmail) =>
    api.post(`${BASE}/test`, { toEmail });
