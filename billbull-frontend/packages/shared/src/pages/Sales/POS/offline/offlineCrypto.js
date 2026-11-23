/**
 * WebCrypto for offline selling: the till's own ECDSA P-256 signing key and verification of the
 * server's ES256 lease. Signatures are raw IEEE P1363 (r || s), which is what WebCrypto produces
 * and what the backend verifies with SHA256withECDSAinP1363Format.
 *
 * The private key is generated non-extractable: page script (including injected script) cannot
 * export it, only use it while it runs. It is stored as a CryptoKey object in IndexedDB.
 */
import { canonicalBytes } from './jcs';

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto is not available (the till must run on https or localhost).');
  return s;
};

const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

export const toBase64 = (bytes) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
};
export const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromBase64Url = (text) => {
  const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const sha256Hex = async (bytes) => {
  const digest = new Uint8Array(await subtle().digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** A new non-extractable signing pair, plus its public key as base64 SPKI for enrolment. */
export async function generateSigningKey() {
  const pair = await subtle().generateKey(ALG, false, ['sign', 'verify']);
  const spki = toBase64(new Uint8Array(await subtle().exportKey('spki', pair.publicKey)));
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, spki };
}

/** Signs the RFC 8785 canonical form of `value`. Returns { sig (base64url P1363), sha256 }. */
export async function signCanonical(privateKey, value) {
  const bytes = canonicalBytes(value);
  const [sig, sha256] = await Promise.all([
    subtle().sign(SIGN, privateKey, bytes),
    sha256Hex(bytes),
  ]);
  return { sig: toBase64Url(new Uint8Array(sig)), sha256 };
}

export const importSpki = (spkiBase64) => subtle().importKey('spki', fromBase64Url(spkiBase64), ALG, false, ['verify']);

/**
 * Verifies an ES256 compact JWS with the pinned server key and returns its claims, or throws.
 * Catches local corruption or casual edits only: the server never trusts the till's copy and
 * always loads the lease by id at ingest.
 */
export async function verifyLeaseJws(jws, serverSpki) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed lease');
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  if (header.alg !== 'ES256') throw new Error('Unexpected lease algorithm');
  const key = await importSpki(serverSpki);
  const ok = await subtle().verify(SIGN, key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('The offline lease signature does not verify');
  return { header, claims: JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) };
}
