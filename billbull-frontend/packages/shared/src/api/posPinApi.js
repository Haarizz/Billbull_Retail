import api from "./axiosConfig";

// Till sign-in. The /api/auth/pos/* calls run before anyone is signed in; the PIN ones are only
// accepted with the device token an admin issued to this till (see enablePinSignIn).

/** Username/password sign-in for the till: like /api/auth/login, but honours the employee's POS access switch. */
export const posPasswordLogin = async (username, password) => {
  const res = await api.post("/api/auth/pos/login", { username, password });
  return res.data;
};

/** { deviceId, branchId, branchName, label, staff: [{ employeeId, name, initials, role, avatarUrl }] } */
export const fetchPinStaff = async (deviceToken) => {
  const res = await api.post("/api/auth/pos/pin/staff", { deviceToken });
  return res.data;
};

/** The usual login response plus tillBranchId. */
export const pinLogin = async (deviceToken, employeeId, pin) => {
  const res = await api.post("/api/auth/pos/pin/login", { deviceToken, employeeId, pin });
  return res.data;
};

// Admin / branch admin. Either signed in on the till, or — for the one-time setup on the sign-in
// screen — passing the manager's token explicitly, so the manager is never signed in to the till.

const withToken = (authToken) => (authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined);

/** Checks a manager's credentials for till setup. Returns the login response (token included). */
export const managerCredentialCheck = async (username, password) => {
  const res = await api.post("/api/auth/login", { username, password });
  return res.data;
};

/** Branches the given token can reach: [{ id, name, code, ... }]. */
export const fetchBranchesFor = async (authToken) => {
  const res = await api.get("/api/branches", withToken(authToken));
  return res.data;
};

/** { deviceId, token, branchId, branchName, label } — the token is returned only this once. */
export const enablePinSignIn = async ({ branchId, label, terminalId }, authToken) => {
  const res = await api.post("/api/pos/pin-devices", { branchId, label, terminalId }, withToken(authToken));
  return res.data;
};

export const disablePinSignIn = async (deviceId) => {
  const res = await api.delete(`/api/pos/pin-devices/${deviceId}`);
  return res.data;
};
