import api from "./axiosConfig";

export const getEmployees = async () => {
    const res = await api.get("/api/employees/active");
    return res.data;
};
