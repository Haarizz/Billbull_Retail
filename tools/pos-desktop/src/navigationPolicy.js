'use strict';

// Which URLs the POS window may show. Pure, so it is unit-tested without Electron.
//
// The till runs the tenant's own /pos/ page. That page may navigate within its origin and open
// blank same-origin popups (receipt/report print previews use window.open('', '_blank')).
// Everything else, e.g. a WhatsApp share link, opens in the user's normal browser, and anything
// that is not a web/mail/phone link is refused.

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isSameOrigin(url, origin) {
  const parsed = parse(url);
  return Boolean(parsed && origin && parsed.origin === origin);
}

/** 'allow' | 'external' | 'deny' for a top-level navigation inside an app window. */
function classifyNavigation(url, origin) {
  if (isSameOrigin(url, origin)) return 'allow';
  const parsed = parse(url);
  if (parsed && EXTERNAL_PROTOCOLS.has(parsed.protocol)) return 'external';
  return 'deny';
}

/** 'allow' | 'external' | 'deny' for window.open / target=_blank. */
function classifyWindowOpen(url, origin) {
  if (!url || url === 'about:blank') return 'allow';
  return classifyNavigation(url, origin);
}

/** Browser permissions the till page may use. Everything else (camera, location, ...) is denied. */
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

function isPermissionAllowed(permission, requestingUrl, origin) {
  return ALLOWED_PERMISSIONS.has(permission) && isSameOrigin(requestingUrl, origin);
}

module.exports = { classifyNavigation, classifyWindowOpen, isPermissionAllowed, isSameOrigin };
