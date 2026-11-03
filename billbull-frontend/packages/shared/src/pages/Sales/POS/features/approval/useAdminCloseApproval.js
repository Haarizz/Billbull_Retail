// Closing Approval (POS Console → Behavior): an administrator approves a session close
// (X-Report) or a Business Day Close (Z-Report) before it goes through.
//
// The server decides whether approval is needed. The till simply attempts the close; when the
// server answers 403 with code ADMIN_APPROVAL_REQUIRED, the caller hands that refusal to
// `request()`, which opens the dialog. Once an administrator's credentials are accepted the
// single-use grant is parked here and `onApproved` retries the close, which picks the grant up
// through `tokenFor()`. The grant is spent server-side only when the close succeeds, so a close
// that fails for another reason (cash variance, range exclusion) can be retried without the
// administrator typing their password again.
import { useCallback, useRef, useState } from 'react';

import { approvePosDayCloseByAdmin, approvePosSessionCloseByAdmin } from '../../../../../api/posApi';

export const ADMIN_APPROVAL_REQUIRED = 'ADMIN_APPROVAL_REQUIRED';

/** True when an axios error is the server's Closing Approval refusal. */
export const isAdminApprovalRequired = (err) => err?.response?.data?.code === ADMIN_APPROVAL_REQUIRED;

export function useAdminCloseApproval() {
  // { action, targetId, branchId, onApproved } while the dialog is open; null otherwise.
  const [pending, setPending] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // { action, targetId, token } — the last grant obtained. Read at retry time, so a ref.
  const grantRef = useRef(null);

  const tokenFor = useCallback((action, targetId) => {
    const g = grantRef.current;
    return g && g.action === action && g.targetId === targetId ? g.token : undefined;
  }, []);

  const clear = useCallback(() => { grantRef.current = null; }, []);

  /**
   * Open the approval dialog.
   * @param {object} req
   * @param {'SESSION_CLOSE'|'DAY_CLOSE'} req.action
   * @param {number} req.targetId  session id (SESSION_CLOSE) or branch id (DAY_CLOSE)
   * @param {Function} req.onApproved  retries the close; called after the grant is stored
   */
  const request = useCallback((req) => {
    // A refusal means any grant we held for this target is gone (expired or restarted server).
    if (grantRef.current?.action === req.action && grantRef.current?.targetId === req.targetId) {
      grantRef.current = null;
    }
    setUsername('');
    setPassword('');
    setError('');
    setPending(req);
  }, []);

  const cancel = useCallback(() => {
    setPending(null);
    setUsername('');
    setPassword('');
    setError('');
  }, []);

  const submit = useCallback(async () => {
    if (!pending || busy) return;
    if (!username || !password) {
      setError('Enter the administrator username/email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const creds = { usernameOrEmail: username, password };
      const result = pending.action === 'DAY_CLOSE'
        ? await approvePosDayCloseByAdmin(pending.targetId, creds)
        : await approvePosSessionCloseByAdmin(pending.targetId, creds);
      if (!result?.authorized || !result.authorizationToken) {
        setError(result?.message || 'Approval was refused.');
        return;
      }
      grantRef.current = { action: pending.action, targetId: pending.targetId, token: result.authorizationToken };
      const { onApproved } = pending;
      // Credentials are never kept beyond the request that used them.
      setPending(null);
      setUsername('');
      setPassword('');
      onApproved?.();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message;
      setError(typeof msg === 'string' && msg ? msg : 'Approval failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [pending, busy, username, password]);

  return {
    pending, username, setUsername, password, setPassword, error, setError, busy,
    request, cancel, submit, tokenFor, clear,
  };
}

export default useAdminCloseApproval;
