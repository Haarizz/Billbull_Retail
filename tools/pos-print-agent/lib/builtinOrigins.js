"use strict";

// Every BillBull client site is trusted by the agent itself, on top of
// config.json's allowedOrigins, so a till never needs --add-origin for a
// tenant and a new tenant needs no agent rebuild. A trusted site still has to
// pair (code shown on the till) before it can print; trust only lets it ask.
//
// Rule: exactly https://<one-label>.billbull.app on the default port. No
// deeper subdomains (https://evil.acme.billbull.app), no http, no other port,
// no lookalike suffix (https://acme.billbull.app.evil.example). BillBull
// controls the billbull.app DNS zone, so only BillBull can serve such a site.
const BILLBULL_TENANT_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.billbull\.app$/;

/** Shown wherever trusted sites are listed. */
const BUILTIN_LABEL = "https://<client>.billbull.app";

/** True for a normalized origin (see config.normalizeOrigin) that is a BillBull client site. */
const isBuiltinOrigin = (origin) => typeof origin === "string" && BILLBULL_TENANT_ORIGIN.test(origin);

module.exports = { isBuiltinOrigin, BUILTIN_LABEL };
