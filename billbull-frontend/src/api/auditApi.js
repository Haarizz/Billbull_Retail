import api from "./axiosConfig";

export const getAuditTrail = async (sourceDocumentType, sourceDocumentId) => {
    const res = await api.get(`/api/financials/audit/${encodeURIComponent(sourceDocumentType)}/${encodeURIComponent(sourceDocumentId)}`);
    return res.data;
};
