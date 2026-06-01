import api from './axiosConfig';

const BASE = '/api/tasks';

export const getMyTasks = async () => {
    const res = await api.get(BASE);
    return res.data;
};

export const createTask = async (payload) => {
    const res = await api.post(BASE, payload);
    return res.data;
};

export const updateTask = async (id, payload) => {
    const res = await api.put(`${BASE}/${id}`, payload);
    return res.data;
};

export const deleteTask = async (id) => {
    await api.delete(`${BASE}/${id}`);
};
