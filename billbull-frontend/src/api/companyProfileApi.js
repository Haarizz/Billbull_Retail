import api from './axiosConfig';

const BASE = '/api/settings/company-profile';

/** Fetch the singleton company profile for this client. */
export const getCompanyProfile = () => api.get(BASE);

/** Update company details (name, address, TRN, etc.). */
export const updateCompanyProfile = (data) => api.put(BASE, data);

/**
 * Upload a new company logo.
 * @param {File} file - The image file to upload.
 */
export const uploadCompanyLogo = (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`${BASE}/logo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

/**
 * Upload a new company stamp.
 * @param {File} file - The image file to upload.
 */
export const uploadCompanyStamp = (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`${BASE}/stamp`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};
