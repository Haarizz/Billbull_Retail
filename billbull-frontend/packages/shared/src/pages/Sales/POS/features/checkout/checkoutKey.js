/**
 * Checkout idempotency keys for POST /api/pos/checkout: key creation, the canonical form of the
 * sale a key is bound to, and what a failed request means for its key. Pure functions only. The
 * lifecycle (persist, send, resolve, recover) is checkoutOperation.js, which every caller uses.
 *
 * The server records at most one sale per key and answers a repeated key with the sale it already
 * recorded, so a retry after a dropped connection cannot invoice the customer twice. Since Phase 0 /
 * M2.2.1 it requires a key on every checkout (409 CHECKOUT_KEY_REQUIRED otherwise). Since M2.2.2 the
 * key and the exact payload it was sent with are persisted in IndexedDB before the request goes out,
 * so a reload no longer loses them. See docs/standalone-pos/PHASE0_CHECKOUT_INTEGRITY_PLAN.html.
 */

/** A fresh key. The backend only needs it unique per sale attempt (<= 100 chars). */
export const newCheckoutKey = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
);

/** Fields of a checkout request that are not part of the sale: the key itself and the credentials. */
const CREDENTIAL_FIELDS = ['supervisorOverridePin', 'supervisorOverrideEmail', 'supervisorOverridePassword', 'supervisorOverrideEmployeeId'];
const NOT_THE_SALE = ['checkoutKey', ...CREDENTIAL_FIELDS];

/**
 * The sale a key is bound to, exactly as it will be sent: the key and the supervisor credentials
 * removed (credentials are how a refused attempt is retried, not part of the sale; the server's
 * request hash ignores them too, PosCheckoutRequestHasher), then a JSON round trip, which drops
 * `undefined` exactly as axios' serialization does. This is what is persisted and replayed.
 */
export const saleOf = (payload) => {
  const sale = { ...(payload || {}) };
  NOT_THE_SALE.forEach((k) => { delete sale[k]; });
  return JSON.parse(JSON.stringify(sale));
};

/** The supervisor credentials of a request, never persisted. Only the ones actually present. */
export const credentialsOf = (payload) => {
  const out = {};
  CREDENTIAL_FIELDS.forEach((k) => {
    if (payload && payload[k] !== undefined && payload[k] !== null && payload[k] !== '') out[k] = payload[k];
  });
  return out;
};

/** JSON with object keys sorted at every level, so equal sales always give equal strings. */
export const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  return `{${Object.keys(value).sort()
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

// SHA-256 in plain JS. crypto.subtle only exists in a secure context, and a till may be served over
// plain http on a LAN address, so the integrity value must not depend on it.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (lower-case hex) of the UTF-8 bytes of a string. */
export const sha256Hex = (text) => {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
};

/** Integrity value of a persisted sale. Local only: the server computes its own canonical hash. */
export const PAYLOAD_HASH_ALGORITHM = 'sha256/stable-json-v1';
export const payloadHash = (sale) => sha256Hex(stableStringify(sale));

/**
 * Server answers that leave the outcome undecided. The key must be kept for the retry: the sale is
 * still being recorded, was partly recorded, or was taken over by another worker.
 */
const UNRESOLVED_CODES = new Set(['CHECKOUT_IN_PROGRESS', 'CHECKOUT_STALLED', 'CHECKOUT_ATTEMPT_SUPERSEDED']);

/**
 * What a failed checkout request means for its key.
 *
 * - 'uncertain': no answer, a timeout (408), a gateway or server error (5xx), or an answer saying
 *   the attempt is undecided (IN_PROGRESS, STALLED, SUPERSEDED, INCONSISTENT). The sale may have
 *   been recorded, so the operation stays pending and the same key and payload are used again.
 * - 'keyConflict': 409 CHECKOUT_KEY_REUSED. The key belongs to a different request. Needs an
 *   explicit decision by the cashier; never replaced by a fresh key automatically.
 * - 'abandoned': 409 CHECKOUT_ABANDONED. The key is terminally abandoned on the server (M2.2.3).
 * - 'refused': an answer that proves THIS request recorded nothing. It does not prove that an earlier
 *   request under the same key cannot still arrive, so checkoutOperation.js only resolves an operation
 *   on it when no earlier request of that operation is unaccounted for. Only these, each checked against the
 *   server code (PosCheckoutController.checkout):
 *     * any body with `recorded: false` (the session guard, SESSION_BUSY, CHECKOUT_KEY_REQUIRED);
 *     * 401: refused by the JWT filter before the controller runs;
 *     * 423 BUSINESS_DAY_CLOSED: the Business Day gate, before any write;
 *     * 409 target-readiness body (`ready: false` + `missing`): the salesperson gate, before any write;
 *     * 403 naming pos_price_override: thrown while building the invoice, before the claim.
 * - 'unverified': any other answer (a 400 validation error, the close-workflow 409, which the
 *   server also raises after the invoice is saved, ...). It may have come after a write that was
 *   then compensated, or not. The operation is checked with the read-only status lookup before it
 *   is released (checkoutOperation.js).
 */
export const classifyCheckoutFailure = (err) => {
  const res = err?.response;
  if (!res) return 'uncertain';
  const status = res.status;
  if (status === 408 || status >= 500) return 'uncertain';
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  // M2.2.3: the key was explicitly abandoned on the server. Terminal: nothing is or will be recorded.
  if (data.code === 'CHECKOUT_ABANDONED') return 'abandoned';
  if (data.code === 'CHECKOUT_KEY_REUSED') return 'keyConflict';
  if (UNRESOLVED_CODES.has(data.code)) return 'uncertain';
  // Raised as a plain 409 ResponseStatusException, so it only shows in the message.
  const message = typeof data.message === 'string' ? data.message : typeof res.data === 'string' ? res.data : '';
  if (message.includes('CHECKOUT_ATTEMPT_INCONSISTENT')) return 'uncertain';
  if (data.recorded === false) return 'refused';
  if (status === 401) return 'refused';
  if (status === 423 && data.code === 'BUSINESS_DAY_CLOSED') return 'refused';
  if (status === 409 && data.ready === false && Array.isArray(data.missing)) return 'refused';
  if (status === 403 && message.includes('pos_price_override')) return 'refused';
  return 'unverified';
};
