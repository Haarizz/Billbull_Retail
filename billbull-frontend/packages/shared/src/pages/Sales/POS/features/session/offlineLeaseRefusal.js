// Reads the server's OFFLINE_LEASE_OUTSTANDING refusal (PosOfflineLeaseBarrier.assertNoOutstandingLease)
// so the Close Session dialog can offer the administrator-only "abandon lease" step that the
// message itself asks for. The message format is owned by that backend method:
//
//   OFFLINE_LEASE_OUTSTANDING: Session #301 cannot be closed while terminal T001-2C4E holds an
//   offline lease (01a20c48-…, expired, 0 offline sale(s) received). Bring the till online …
//
// Anything that does not match returns null, and the dialog shows the plain message as before.

const PATTERN = new RegExp(
  '^OFFLINE_LEASE_OUTSTANDING:\\s*Session #(\\d+)\\b.*?\\bterminal (\\S+) holds an offline lease \\('
  + '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}), '
  + '(expired|valid until ([^,]+)), (\\d+) offline sale',
  's',
);

/**
 * @param {unknown} message the close error as shown in the dialog
 * @returns {null | { sessionId: number, terminalId: string, leaseId: string, expired: boolean,
 *                    validUntil: string|null, receivedCount: number }}
 */
export function parseOutstandingLeaseRefusal(message) {
  if (typeof message !== 'string') return null;
  const m = PATTERN.exec(message.trim());
  if (!m) return null;
  return {
    sessionId: Number(m[1]),
    terminalId: m[2],
    leaseId: m[3].toLowerCase(),
    expired: m[4] === 'expired',
    validUntil: m[5] ? m[5].trim() : null,
    receivedCount: Number(m[6]),
  };
}

/** Roles the server accepts for abandonment (PosOfflineLeaseService.ADMIN_ROLES). */
export const LEASE_ABANDON_ROLES = ['ADMIN', 'ROLE_ADMIN', 'SUPER_ADMIN', 'ROLE_SUPER_ADMIN', 'BRANCH_ADMIN', 'ROLE_BRANCH_ADMIN'];
