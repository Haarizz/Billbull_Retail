import axios from './axiosConfig';

export const getTemplates = async () => {
    try {
        const response = await axios.get('/api/messaging/templates');
        return response.data;
    } catch (error) {
        console.error("Error fetching templates:", error);
        return [];
    }
};

export const createTemplate = async (templateData) => {
    try {
        const response = await axios.post('/api/messaging/templates', templateData);
        return response.data;
    } catch (error) {
        console.error("Error creating template:", error);
        throw error;
    }
};

export const markTemplateUsed = async (id) => {
    try {
        await axios.post(`/api/messaging/templates/${id}/use`);
    } catch (error) {
        console.error("Error updating template usage:", error);
    }
};

export const getMessageLogs = async () => {
    try {
        const response = await axios.get('/api/messaging/logs');
        return response.data;
    } catch (error) {
        console.error("Error fetching message logs:", error);
        return [];
    }
};

export const logMessage = async (logData) => {
    try {
        const response = await axios.post('/api/messaging/logs', logData);
        return response.data;
    } catch (error) {
        console.error("Error logging message:", error);
    }
};

export const updateTemplate = async (id, templateData) => {
    try {
        const response = await axios.put(`/api/messaging/templates/${id}`, templateData);
        return response.data;
    } catch (error) {
        console.error("Error updating template:", error);
        throw error;
    }
};

export const deleteTemplate = async (id) => {
    try {
        await axios.delete(`/api/messaging/templates/${id}`);
    } catch (error) {
        console.error("Error deleting template:", error);
        throw error;
    }
};
