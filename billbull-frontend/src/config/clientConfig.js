/**
 * Centralized client-specific UI configuration.
 *
 * Client identity is resolved from window.location.hostname because
 * BillBull is deployed as a single shared frontend served across
 * multiple client subdomains. Nginx and Kubernetes Ingress preserve
 * the hostname, making this a stable deployment identifier.
 *
 * Do not perform hostname checks elsewhere in the application.
 */
const defaultConfig = {
  landing: {
    // null means "no override" — callers fall back to their own default logic
    // (role-based redirect in login.jsx, "/dashboard" in App.jsx).
    defaultRoute: null,
  },
  sidebar: {
    defaultCollapsed: false,
  },
  posFirstMode: false,
  trial: {
    // ISO-8601 instant the free trial ends. null means "not on a trial" — no
    // expiry warning is shown after login (see TrialExpiryModal).
    expiresAt: null,
  },
};

// End of this weekend (Sunday 20 Sep 2026, 23:59:59) in the tenants' Business
// Day zone, Asia/Dubai (fixed UTC+04:00, no DST).
const FREE_TRIAL = { expiresAt: "2026-09-20T23:59:59+04:00" };

const clientOverrides = {
  "royaltools.billbull.app": {
    landing: { defaultRoute: "/sales/pos" },
    sidebar: { defaultCollapsed: true },
    posFirstMode: true,
    trial: FREE_TRIAL,
  },
  "leroyalflowers.billbull.app": {
    landing: { defaultRoute: "/sales/pos" },
    sidebar: { defaultCollapsed: true },
    posFirstMode: true,
    trial: FREE_TRIAL,
  },
  "leroyalgifts.billbull.app": {
    landing: { defaultRoute: "/sales/pos" },
    sidebar: { defaultCollapsed: true },
    posFirstMode: true,
    trial: FREE_TRIAL,
  },
};

export function resolveClientConfig(hostname) {
  const override = clientOverrides[hostname] || {};
  return {
    ...defaultConfig,
    ...override,
    landing: { ...defaultConfig.landing, ...override.landing },
    sidebar: { ...defaultConfig.sidebar, ...override.sidebar },
  };
}

export const clientConfig = resolveClientConfig(window.location.hostname);
