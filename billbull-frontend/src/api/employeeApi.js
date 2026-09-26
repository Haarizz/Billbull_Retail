import api from "./axiosConfig";

export const getEmployees = async () => {
    const res = await api.get("/api/employees/active");
    return res.data;
};

export const getEmployeeNames = async () => {
    const res = await api.get("/api/employees/names");
    return res.data;
};

export const getDeliveryPersons = async () => {
    const res = await api.get("/api/employees/delivery-persons");
    return res.data;
};

/**
 * Candidates for the POS salesperson selector.
 *
 * Returns { options: [{ id, employeeCode, name }], defaultEmployeeId }.
 * `defaultEmployeeId` is the caller's own linked employee when they have one and it is Active,
 * otherwise null — the POS preselects it rather than guessing.
 */
export const getSalespersons = async () => {
    const res = await api.get("/api/employees/salespersons");
    return res.data;
};

/**
 * Resolve a scanned employee barcode to an eligible salesperson.
 *
 * The barcode value IS the employee code — there is no second employee identifier. The SERVER
 * decides eligibility (exists / Active / Salesperson or Cashier + Salesperson) and answers 400
 * with a specific reason otherwise, so nothing here may be treated as verification on its own.
 *
 * Returns `{ id, employeeCode, name, role, status, targetMonth, targetAmount, commissionRate }`.
 * `commissionRate: null` means "not configured" — it is NOT the same as 0%.
 */
export const lookupSalespersonByCode = async (employeeCode, { month } = {}) => {
    const params = {};
    if (month) params.month = month;
    const res = await api.get(
        `/api/employees/salespersons/by-code/${encodeURIComponent(String(employeeCode).trim())}`,
        { params },
    );
    return res.data;
};
