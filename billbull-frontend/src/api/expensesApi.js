import axios from './axiosConfig';

export const fetchExpenses = async () => {
    const response = await axios.get('/api/expenses');
    return response.data;
};

export const createExpense = async (expenseData) => {
    const response = await axios.post('/api/expenses', expenseData);
    return response.data;
};

export const updateExpense = async (id, expenseData) => {
    const response = await axios.put(`/api/expenses/${id}`, expenseData);
    return response.data;
};

export const deleteExpense = async (id) => {
    const response = await axios.delete(`/api/expenses/${id}`);
    return response.data;
};
