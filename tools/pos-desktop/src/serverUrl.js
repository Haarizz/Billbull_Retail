'use strict';

// Pure helpers for the tenant server address. No Electron imports, so they run under `node --test`.

const POS_PATH = '/pos/';

/**
 * Turn what a cashier typed into a canonical origin ("https://shop.example.com").
 * A bare host gets https://. Paths, queries and fragments are dropped: the app
 * always opens <origin>/pos/. Throws an Error with a user-facing message.
 */
function normalizeServerUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) throw new Error('Enter the BillBull server address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('That is not a valid web address.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The address must start with https:// or http://');
  }
  if (!url.hostname) throw new Error('That is not a valid web address.');
  if (url.username || url.password) throw new Error('Do not put a user name or password in the address.');
  return url.origin;
}

/** True for plain-http origins that are not on this PC or the local network. */
function isInsecureRemote(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'http:') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

function posUrl(origin) {
  return new URL(POS_PATH, origin).toString();
}

/** Does this HTML look like the BillBull POS index page? */
function looksLikePosPage(html) {
  return /<title>\s*BillBull POS\s*<\/title>/i.test(String(html ?? ''));
}

/** Plain-English text for a Chromium network error ("net::ERR_CONNECTION_REFUSED", "ERR_..."). */
function describeNetError(raw) {
  const text = String(raw ?? '');
  const code = (text.match(/ERR_[A-Z0-9_]+/) || [''])[0];
  if (/^ERR_(CERT_|SSL_)/.test(code)) {
    return `The server's security certificate was not accepted (${code}). Check the address uses the right https:// name.`;
  }
  const known = {
    ERR_INTERNET_DISCONNECTED: 'This PC is not connected to the internet.',
    ERR_NAME_NOT_RESOLVED: 'That server name could not be found. Check the spelling.',
    ERR_NAME_RESOLUTION_FAILED: 'That server name could not be found. Check the spelling and the connection.',
    ERR_CONNECTION_REFUSED: 'The server refused the connection. It may be down, or the address or port is wrong.',
    ERR_CONNECTION_TIMED_OUT: 'The server did not answer in time.',
    ERR_TIMED_OUT: 'The server did not answer in time.',
    ERR_CONNECTION_RESET: 'The connection to the server was interrupted.',
    ERR_CONNECTION_CLOSED: 'The connection to the server was interrupted.',
    ERR_ADDRESS_UNREACHABLE: 'The server cannot be reached from this network.',
    ERR_NETWORK_CHANGED: 'The network changed while connecting. Try again.',
    ERR_UNSAFE_PORT: 'That port cannot be used. Check the address.',
  };
  if (known[code]) return `${known[code]} (${code})`;
  return code ? `Could not reach the server (${code}).` : `Could not reach the server${text ? ` (${text})` : ''}.`;
}

module.exports = { POS_PATH, normalizeServerUrl, isInsecureRemote, posUrl, looksLikePosPage, describeNetError };
