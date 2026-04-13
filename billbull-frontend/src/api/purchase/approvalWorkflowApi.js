import api from '../axiosConfig';

export const approvalWorkflowApi = {
    getSteps: (module, tenantId = 'DEFAULT') =>
        api.get(`/api/approval-workflows/${module}?tenantId=${tenantId}`),

    updateSteps: (module, steps, tenantId = 'DEFAULT') =>
        api.post(`/api/approval-workflows/${module}?tenantId=${tenantId}`, steps),

    approve: (id, remarks) =>
        api.post(`/api/lpos/${id}/approve`, { remarks }),

    reject: (id, remarks) =>
        api.post(`/api/lpos/${id}/reject`, { remarks }),

    submit: (id) =>
        api.post(`/api/lpos/${id}/submit`),

    revert: (id) =>
        api.post(`/api/lpos/${id}/revert`)
};
