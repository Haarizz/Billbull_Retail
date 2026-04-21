import api from "./axiosConfig";

export const getEmployees = async () => {
    const res = await api.get("/api/employees/active");
    return res.data;
};

export const getEmployeeNames = async () => {
    const res = await api.get("/api/employees/names");
    return res.data;
};
