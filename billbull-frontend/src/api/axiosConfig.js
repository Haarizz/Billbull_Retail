import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin),
  headers: {
    "Content-Type": "application/json",
  },
});

// 🔐 Attach JWT + active branch on every request
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // The active branch is mirrored to sessionStorage by BranchContext so the
    // interceptor stays stateless. "ALL" / null means admin "All Branches".
    const activeBranchId = sessionStorage.getItem("activeBranchId");
    if (activeBranchId && activeBranchId !== "ALL") {
      config.headers["X-Branch-Id"] = activeBranchId;
    } else if (activeBranchId === "ALL") {
      config.headers["X-Branch-Id"] = "ALL";
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
