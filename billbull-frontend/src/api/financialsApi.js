import axiosInstance from './axiosConfig';

/**
 * Fetch Statement of Account (SoA) for a Customer (AR) or Vendor (AP)
 * @param {string} accountType - 'CUSTOMER' or 'VENDOR'
 * @param {string} accountCode - The customer's code or vendor's name
 * @param {string} startDate - format YYYY-MM-DD
 * @param {string} endDate - format YYYY-MM-DD
 * @returns {Promise<Object>} The StatementResponse payload containing balances and entries
 */
export const fetchStatementOfAccount = async (accountType, accountCode, startDate, endDate) => {
    try {
        const response = await axiosInstance.get('/api/financials/statement', {
            params: {
                accountType,
                accountCode,
                startDate,
                endDate
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching Statement of Account:", error);
        throw error;
    }
};

export const fetchARAgingReport = async (asOfDate) => {
    try {
        const response = await axiosInstance.get('/api/financials/reports/ar-aging', {
            params: { asOfDate }
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching AR Aging Report:", error);
        throw error;
    }
};
