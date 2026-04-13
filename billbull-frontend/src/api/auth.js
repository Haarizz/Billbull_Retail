import api from "./axiosConfig";
import { jwtDecode } from "jwt-decode";

// 🔐 Login API
export const login = async (username, password) => {
  const res = await api.post("/api/auth/login", {
    username,
    password,
  });
  return res.data; // { token }
};

// 🔍 Decode JWT
export const getDecodedToken = () => {
  const token = sessionStorage.getItem("token");
  if (!token) return null;

  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

// 🔑 Roles from JWT (PLAIN roles)
export const getRoles = () => {
  const decoded = getDecodedToken();
  return decoded?.roles || [];
};

// ✅ CORRECT role check
export const hasRole = (role) => {
  const roles = getRoles();
  return roles.includes(role);
};

// 🔐 Auth check
export const isAuthenticated = () => {
  return !!sessionStorage.getItem("token");
};

// 🔓 Logout
export const logout = () => {
  sessionStorage.removeItem("token");
};

export const getUsernameFromToken = () => {
  const decoded = getDecodedToken();
  return decoded?.sub || null;
};

// 👤 Get User Profile
export const getUserProfile = async () => {
  const res = await api.get("/api/auth/profile");
  return res.data;
};

// ✏️ Update User Profile
export const updateUserProfile = async (formData) => {
  const res = await api.put("/api/auth/profile", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// 🔒 Change Password
export const changePassword = async (passwordData) => {
  const res = await api.post("/api/auth/change-password", passwordData);
  return res.data;
};