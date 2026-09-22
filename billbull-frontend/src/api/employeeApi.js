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
