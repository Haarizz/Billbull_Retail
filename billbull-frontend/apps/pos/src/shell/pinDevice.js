// This till's PIN sign-in credential. Device-level, so it lives in localStorage and survives
// sign-out (see posAccess.TILL_SESSION_KEYS): it identifies the till, not the person.
// Shape: { deviceId, token, branchId, branchName, label }.

export const PIN_DEVICE_KEY = 'billbull:pos:pin_device';

export const readPinDevice = (storage = globalThis.localStorage) => {
  try {
    const value = JSON.parse(storage?.getItem(PIN_DEVICE_KEY));
    return value?.token ? value : null;
  } catch {
    return null;
  }
};

export const savePinDevice = (device, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(PIN_DEVICE_KEY, JSON.stringify({
      deviceId: device.deviceId,
      token: device.token,
      branchId: device.branchId,
      branchName: device.branchName,
      label: device.label,
    }));
    return true;
  } catch {
    return false;
  }
};

export const clearPinDevice = (storage = globalThis.localStorage) => {
  try { storage?.removeItem(PIN_DEVICE_KEY); } catch { /* storage unavailable */ }
};

/** Message for a failed till sign-in: the server's own words for 403/401/429, else a generic one. */
export const describeTillLoginError = (err, fallback = 'Invalid username or password') => {
  const status = err?.response?.status;
  const serverMessage = err?.response?.data?.message;
  if (status === 429) {
    const wait = Number(err.response.headers?.['retry-after']) || Number(err.response.data?.retryAfterSeconds) || 0;
    return serverMessage || (wait > 0 ? `Too many attempts. Try again in ${wait} seconds.` : 'Too many attempts. Wait a moment and try again.');
  }
  if ((status === 401 || status === 403) && serverMessage) return serverMessage;
  if (!err?.response) return 'Can’t reach the server. Check the connection and try again.';
  return fallback;
};
