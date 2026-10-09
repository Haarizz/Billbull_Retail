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

// 💾 Store a successful login response for the tab (sessionStorage — closing the tab signs out).
// Shared by the Retail and standalone POS login screens so both keep the same session keys.
export const persistLoginSession = (data) => {
  sessionStorage.setItem("token", data.token);
  sessionStorage.setItem("role", data.primaryRole || data.role);
  sessionStorage.setItem("primaryRole", data.primaryRole || data.role);
  sessionStorage.setItem("user", data.username);
  sessionStorage.setItem("fullName", data.fullName || data.username);
};

// 🚫 The message a login screen shows for a failed attempt. A 429 is the brute-force lockout / rate
// limit: surface the advised wait (Retry-After header or retryAfterSeconds in the body). The text
// stays generic otherwise — the backend never reveals whether the username exists.
export const describeLoginError = (err) => {
  if (err?.response?.status === 429) {
    const waitSeconds =
      Number(err.response.headers?.["retry-after"]) ||
      Number(err.response.data?.retryAfterSeconds) ||
      0;
    return waitSeconds > 0
      ? `Too many login attempts. Please wait ${waitSeconds} seconds before trying again.`
      : "Too many login attempts. Please wait a moment before trying again.";
  }
  return "Invalid username or password";
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
// Presence alone is not authentication: an expired token sits in sessionStorage forever, so
// PrivateRoute kept rendering the POS while every request came back rejected. Decoding `exp`
// here sends a stale session to /login instead of leaving the cashier on a screen whose
// buttons all fail. A malformed token decodes to null and is treated as logged-out.
export const isAuthenticated = () => {
  const decoded = getDecodedToken();
  if (!decoded) return false;
  if (typeof decoded.exp !== "number") return true; // no expiry claim — let the server decide
  return decoded.exp * 1000 > Date.now();
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