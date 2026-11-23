import { jwtDecode } from "jwt-decode";

/**
 * Reads `#token=…&expires=…` from a support link opened by BillBull's control plane. Only a
 * support token (one carrying the `sst` session claim) that has not expired is accepted; the
 * backend still verifies its signature and session on every request.
 */
export function readSupportFragment(hash) {
  const params = new URLSearchParams((hash || "").replace(/^#/, ""));
  const token = params.get("token");
  if (!token) return null;
  try {
    const claims = jwtDecode(token);
    if (!claims?.sst || !claims?.sub) return null;
    if (claims.exp && claims.exp * 1000 <= Date.now()) return null;
    return { token, claims, expires: params.get("expires") };
  } catch {
    return null;
  }
}
