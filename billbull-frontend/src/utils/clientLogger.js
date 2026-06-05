const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin)
).replace(/\/$/, "");

const LOG_ENDPOINT = `${API_BASE_URL}/api/client-logs`;
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "";
const SENSITIVE_KEY = /(password|token|authorization|jwt|secret|otp|pin|card|cvv|api[_-]?key)/i;
const MAX_STRING_LENGTH = 2000;
const MAX_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;

let installed = false;
let currentRequestId = "";
const recentLogs = new Map();

export const createClientRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const setCurrentRequestId = (requestId) => {
  if (requestId) {
    currentRequestId = String(requestId);
  }
};

export const getCurrentRequestId = () => currentRequestId;

export const installGlobalClientLogging = () => {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  window.addEventListener("error", (event) => {
    logClientError("Browser error", event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.isAxiosError) {
      return;
    }
    logClientError("Unhandled promise rejection", event.reason);
  });
};

export const logApiError = (error) => {
  if (!error || error.config?.skipClientLog) {
    return;
  }

  const method = (error.config?.method || "GET").toUpperCase();
  const url = redactUrl(error.config?.url || "");
  const status = error.response?.status;
  const requestId =
    error.response?.headers?.["x-request-id"] ||
    error.config?.headers?.["X-Request-Id"] ||
    currentRequestId;

  setCurrentRequestId(requestId);

  const responseData = error.response?.data || {};
  logClientEvent("error", `API ${method} ${url} failed${status ? ` with ${status}` : ""}`, {
    type: "api-error",
    method,
    url,
    status,
    requestId,
    responseCode: responseData.code,
    responseMessage: responseData.message,
    params: error.config?.params,
  });
};

export const logClientError = (message, error, metadata = {}) => {
  const normalized = normalizeError(error);
  logClientEvent("error", message || normalized.message || "Client error", {
    ...metadata,
    errorName: normalized.name,
    errorMessage: normalized.message,
    stack: normalized.stack,
  });
};

export const logClientEvent = (level, message, metadata = {}) => {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return;
  }

  const requestId = metadata.requestId || currentRequestId || createClientRequestId();
  const payload = {
    level: level || "info",
    message: trim(message || "Client event"),
    source: "frontend",
    url: window.location.href,
    userAgent: navigator.userAgent,
    requestId,
    clientSessionId: getClientSessionId(),
    occurredAt: new Date().toISOString(),
    metadata: sanitize({
      ...metadata,
      clientContext: getClientContext(),
    }),
  };

  if (metadata.stack) {
    payload.stack = trim(metadata.stack);
  }
  if (metadata.componentStack) {
    payload.componentStack = trim(metadata.componentStack);
  }

  const dedupeKey = `${payload.level}:${payload.message}:${payload.metadata?.type || ""}:${payload.metadata?.url || ""}:${payload.metadata?.status || ""}`;
  if (!shouldSend(dedupeKey)) {
    return;
  }

  const body = JSON.stringify(payload);
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(requestId),
    body,
    keepalive: body.length < 60000,
  }).catch(() => {});
};

const buildHeaders = (requestId) => {
  const headers = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
  };

  const token = sessionStorage.getItem("token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const activeBranchId = sessionStorage.getItem("activeBranchId");
  if (activeBranchId) {
    headers["X-Branch-Id"] = activeBranchId;
  }

  return headers;
};

const getClientSessionId = () => {
  const key = "clientLogSessionId";
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = createClientRequestId();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
};

const getClientContext = () => ({
  appVersion: APP_VERSION,
  username: sessionStorage.getItem("user") || "",
  role: sessionStorage.getItem("role") || sessionStorage.getItem("primaryRole") || "",
  activeBranchId: sessionStorage.getItem("activeBranchId") || "",
  path: window.location.pathname,
});

const shouldSend = (key) => {
  const now = Date.now();
  const previous = recentLogs.get(key);
  if (previous && now - previous < 3000) {
    return false;
  }
  recentLogs.set(key, now);

  if (recentLogs.size > 100) {
    for (const [entryKey, timestamp] of recentLogs.entries()) {
      if (now - timestamp > 60000) {
        recentLogs.delete(entryKey);
      }
    }
  }

  return true;
};

const normalizeError = (error) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === "string") {
    return { name: "Error", message: error, stack: "" };
  }
  return {
    name: "Error",
    message: trim(JSON.stringify(sanitize(error))),
    stack: "",
  };
};

const sanitize = (value, depth = 0) => {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return trim(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return normalizeError(value);
  }
  if (depth >= 4) {
    return "[Max depth]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_KEYS)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[Redacted]" : sanitize(item, depth + 1);
    }
    return output;
  }
  return String(value);
};

const trim = (value) => {
  if (value == null) {
    return "";
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH)}...` : text;
};

const redactUrl = (url) => {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url, API_BASE_URL);
    return `${parsed.pathname}${parsed.search ? "?..." : ""}`;
  } catch {
    return String(url).split("?")[0];
  }
};
