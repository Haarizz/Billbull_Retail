/**
 * RFC 8785 (JSON Canonicalization Scheme) for offline records: objects, arrays, strings, booleans,
 * null and safe integers only. Every amount in an offline record is integer minor units and every
 * rate integer basis points, so no floating-point number is ever signed.
 *
 * Byte-identical with the backend's OfflineJcs.java; both are run against the shared vectors in
 * billbull-backend/src/test/resources/pos-offline/jcs-vectors.json.
 *
 * - object members sorted by key as UTF-16 code units (Array.prototype.sort's default order);
 * - strings exactly as JSON.stringify writes them (it already follows RFC 8785 for strings);
 * - no whitespace;
 * - a non-integer number, an unsafe integer, undefined, a function or a lone surrogate throws.
 */
export function canonicalize(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) throw new TypeError(`Offline records carry safe integers only, got ${value}`);
      return String(value);
    case 'string':
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
        throw new TypeError('Lone surrogate in string');
      }
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
      const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Unsupported value in offline record: ${typeof value}`);
  }
}

export const canonicalBytes = (value) => new TextEncoder().encode(canonicalize(value));
