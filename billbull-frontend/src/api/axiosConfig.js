import axios from "axios";
import toast from "react-hot-toast";
import { createClientRequestId, logApiError, setCurrentRequestId } from "../utils/clientLogger";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin),
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Rate-limit (429) handling ────────────────────────────────────────────────
// The backend may return 429 with a `Retry-After` header (seconds) and a
// { code: "RATE_LIMITED", retryAfterSeconds } body when a request trips a rate
// limit (see future-enhancements Topic 3). We surface a friendly, throttled toast
// and — only for idempotent GETs — auto-retry ONCE after the advised delay.
// Auth (login) 429s are intentionally NOT handled here: the login page renders its
// own inline lockout message with the countdown.
const RETRY_AFTER_CAP_SECONDS = 60; // never auto-wait longer than this
let lastRateLimitToastAt = 0;

const retryAfterSeconds = (error) => {
  const header = error.response?.headers?.["retry-after"];
  const bodyValue = error.response?.data?.retryAfterSeconds;
  const parsed = Number(header ?? bodyValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, RETRY_AFTER_CAP_SECONDS);
};

const isRateLimited = (error) => error.response?.status === 429;
const isAuthEndpoint = (config) => (config?.url || "").includes("/api/auth/");
const isIdempotentGet = (config) => (config?.method || "get").toLowerCase() === "get";

const notifyRateLimited = (waitSeconds) => {
  // Throttle the toast so a burst of 429s doesn't stack dozens of identical messages.
  const now = Date.now();
  if (now - lastRateLimitToastAt < 4000) return;
  lastRateLimitToastAt = now;
  toast.error(
    `You're going a bit fast — please wait ${waitSeconds}s and try again.`,
    { id: "rate-limited", duration: Math.min(waitSeconds, 8) * 1000 }
  );
};

// 🔐 Attach JWT + active branch on every request
api.interceptors.request.use(
  (config) => {
    config.headers = config.headers || {};
    const requestId = createClientRequestId();
    config.headers["X-Request-Id"] = requestId;
    config.metadata = {
      ...(config.metadata || {}),
      requestId,
      startedAt: Date.now(),
    };

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

api.interceptors.response.use(
  (response) => {
    setCurrentRequestId(response.headers?.["x-request-id"] || response.config?.metadata?.requestId);
    return response;
  },
  async (error) => {
    setCurrentRequestId(error.response?.headers?.["x-request-id"] || error.config?.metadata?.requestId);

    // Rate-limit handling. Skip auth endpoints (login page owns its own messaging).
    if (isRateLimited(error) && !isAuthEndpoint(error.config)) {
      const waitSeconds = retryAfterSeconds(error);
      notifyRateLimited(waitSeconds);

      // Auto-retry ONCE for idempotent GETs after the advised delay. A single retry, gated by a
      // per-request flag, prevents retry storms (a failed retry rejects normally).
      const config = error.config;
      if (config && isIdempotentGet(config) && !config.__rateLimitRetried) {
        config.__rateLimitRetried = true;
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        return api(config);
      }
    }

    logApiError(error);
    return Promise.reject(error);
  }
);

export default api;
