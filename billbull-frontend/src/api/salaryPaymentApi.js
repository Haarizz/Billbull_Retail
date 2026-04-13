import api from "./axiosConfig";

export const salaryPaymentApi = {
  // ================= FETCH =================

  // Get list of employees with their calculated salary details for the current month
  // Expected response: List of objects with { id, name, dept, role, base, allow, deduct, net, status }
  getPayrollList: async (month, year) => {
    const res = await api.get("/api/payroll/list", { params: { month, year } });
    return res.data;
  },

  // Get dashboard statistics (Total Employees, Payable, Pending, Paid count)
  getPayrollStats: async (month, year) => {
    const res = await api.get("/api/payroll/stats", { params: { month, year } });
    return res.data;
  },

  // Get recent transaction history
  getTransactionHistory: async () => {
    const res = await api.get("/api/payroll/transactions");
    return res.data;
  },

  // ================= PROCESS PAYMENTS =================

  // Process a single employee payment
  processPayment: async (payload) => {
    // payload: { employeeId, amount, paymentMethod, date, month, year }
    const res = await api.post("/api/payroll/pay", payload);
    return res.data;
  },

  // Process bulk payments
  processBulkPayment: async (payload) => {
    // payload: { employeeIds: [], paymentMethod, date, month, year }
    const res = await api.post("/api/payroll/pay/bulk", payload);
    return res.data;
  },

  // ================= CREATE NEW RECORD =================
  
  // Manually add a payment record (The "New Payment" modal functionality)
  createPaymentRecord: async (payload) => {
    const res = await api.post("/api/payroll/create-record", payload);
    return res.data;
  }
};