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
};

const clientOverrides = {
  "royaltools.billbull.app": {
    landing: { defaultRoute: "/sales/pos" },
    sidebar: { defaultCollapsed: true },
    posFirstMode: true,
  },
  "leroyalflowers.billbull.app": {
    landing: { defaultRoute: "/sales/pos" },
    sidebar: { defaultCollapsed: true },
    posFirstMode: true,
  },
  "leroyalgifts.billbull.app": {
    landing: { defaultRoute: "/sales/pos" },
    sidebar: { defaultCollapsed: true },
    posFirstMode: true,
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
