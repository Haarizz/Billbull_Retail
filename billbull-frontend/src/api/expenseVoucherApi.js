import axios from './axiosConfig';

export const fetchExpenseVouchers = () =>
    axios.get('/api/expense-vouchers').then(r => r.data);

export const fetchExpenseVoucherById = (id) =>
    axios.get(`/api/expense-vouchers/${id}`).then(r => r.data);

export const createExpenseVoucher = (data) =>
    axios.post('/api/expense-vouchers', data).then(r => r.data);

export const updateExpenseVoucher = (id, data) =>
    axios.put(`/api/expense-vouchers/${id}`, data).then(r => r.data);

export const deleteExpenseVoucher = (id) =>
    axios.delete(`/api/expense-vouchers/${id}`).then(r => r.data);
