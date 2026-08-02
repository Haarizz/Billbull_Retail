import api from './axiosConfig';

// Back-office "POS Reports" module — read-only browser over already-generated, immutable
// X-Report / Z-Report snapshots (see backend PosReportsController). List calls return
// summary metadata only; the full stored report JSON is fetched only when a report is
// opened (getPosReportXDetail / getPosReportZDetail).

const buildListParams = (filters = {}, page = 0, size = 20) => {
    const params = { page, size };
    if (filters.branchId && !['All', 'ALL'].includes(String(filters.branchId))) params.branchId = filters.branchId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.reportNumber) params.reportNumber = filters.reportNumber;
    if (filters.generatedBy) params.generatedBy = filters.generatedBy;
    return params;
};

export const getPosXReports = async (filters = {}, page = 0, size = 20) => {
    const params = buildListParams(filters, page, size);
    if (filters.terminalId) params.terminalId = filters.terminalId;
    if (filters.counterId) params.counterId = filters.counterId;
    if (filters.cashier) params.cashier = filters.cashier;
    if (filters.sessionId) params.sessionId = filters.sessionId;
    const res = await api.get('/api/pos/reports/x', { params });
    return res.data;
};

export const getPosZReports = async (filters = {}, page = 0, size = 20) => {
    const params = buildListParams(filters, page, size);
    const res = await api.get('/api/pos/reports/z', { params });
    return res.data;
};

export const getPosReportXDetail = async (id) => {
    const res = await api.get(`/api/pos/reports/x/${id}`);
    return res.data;
};

export const getPosReportZDetail = async (id) => {
    const res = await api.get(`/api/pos/reports/z/${id}`);
    return res.data;
};

export const checkPosReportPrintable = async () => {
    await api.post('/api/pos/reports/print-check');
};

export const checkPosReportExportable = async () => {
    await api.post('/api/pos/reports/export-check');
};
