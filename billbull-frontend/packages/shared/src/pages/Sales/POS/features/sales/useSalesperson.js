import { useCallback, useEffect, useMemo, useState } from 'react';
import { lookupSalespersonByCode } from '../../../../../api/employeeApi';
import { getSalesSettings } from '../../../../../api/salesSettingsApi';
import { getTargetReadiness } from '../../../../../api/employeeTargetsApi';

/**
 * Salesperson attribution for the current POS sale — WHO the sale belongs to, as distinct from the
 * cashier who rang it up. The cashier stays the authenticated session owner; nothing here touches
 * session, terminal or payment state.
 *
 * <p>All of this feature's state lives inside this hook rather than in POSSales.jsx, so the POS
 * orchestrator gains no top-level state, refs or effects and its structural characterization suite
 * is unaffected.
 *
 * <h3>The feature is either ON or completely ABSENT</h3>
 *
 * `SalesPerson → POS` is the single switch. When it is OFF this hook produces nothing at all: no
 * roster is fetched, no attribution is held, and `salespersonPayload` carries nulls, so a checkout
 * is byte-for-byte the pre-feature one. When it is ON, the ONLY way to name a salesperson is a
 * verified barcode scan.
 *
 * <p>There is deliberately no manual picker and no default in either mode. A dropdown was the
 * Phase 1 behaviour; it is gone because a preselection is not a verification — if the cashier's
 * own linked employee could stand in for a scan, every Cashier + Salesperson would bypass the
 * rule the feature exists to enforce. `verifiedSalesperson` — the result of a SUCCESSFUL SERVER
 * LOOKUP — is the only thing that counts, and it is the single source of truth for the header
 * strip, the Actions-panel entry, the checkout gate and the payload.
 *
 * <p>The server enforces the same rule independently, so a frontend slip cannot let a sale
 * through; this hook's job is to stop the UI from *pretending* a sale is ready.
 */
export default function useSalesperson() {
  // ── The tenant switches that turn this feature on ─────────────────────────
  const [salespersonRequired, setSalespersonRequired] = useState(false);
  const [targetRequired, setTargetRequired] = useState(false);

  // ── Phase 2: barcode verification ─────────────────────────────────────────
  const [verifiedSalesperson, setVerifiedSalesperson] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [scanModalOpen, setScanModalOpen] = useState(false);

  // ── Phase 2: advisory target readiness ────────────────────────────────────
  const [readiness, setReadiness] = useState(null);
  // The readiness payload actually being shown in the warning dialog. It is either the advisory
  // one fetched on load, or the authoritative one the server returned with its 409 refusal — the
  // same DTO either way, which is why one dialog renders both.
  const [readinessBlock, setReadinessBlock] = useState(null);
  const [showReadinessWarning, setShowReadinessWarning] = useState(false);

  // The tenant switches. Read once on mount: a change made in Sales → Configure & customize while
  // a till is open takes effect on the server immediately but needs a POS reload to change this
  // UI, which is the documented behaviour. Deliberately no polling — the server is authoritative
  // and a second heartbeat is not worth the complexity.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getSalesSettings();
        if (cancelled) return;
        setSalespersonRequired(!!settings?.salespersonRequiredAtPos);
        setTargetRequired(!!settings?.monthlyTargetRequired);
      } catch (_) {
        // Leave both false: the POS renders its pre-Phase-2 UI, and the server still enforces.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Switching the feature OFF drops any verification already taken, so a sale that is still in
  // the cart cannot carry an attribution the tenant has just stopped collecting — and switching it
  // back ON leaves nothing behind to inherit, so the next sale must be scanned afresh.
  useEffect(() => {
    if (salespersonRequired) return;
    setVerifiedSalesperson(null);
    setVerifyError('');
    setScanModalOpen(false);
  }, [salespersonRequired]);

  /** Advisory readiness. Safe to call repeatedly; never throws to the caller. */
  const refreshReadiness = useCallback(async () => {
    try {
      const result = await getTargetReadiness();
      setReadiness(result || null);
      return result || null;
    } catch (_) {
      // An unreachable readiness endpoint must not block the UI — the checkout gate still runs.
      setReadiness(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!targetRequired) {
      setReadiness(null);
      return;
    }
    refreshReadiness();
  }, [targetRequired, refreshReadiness]);

  /**
   * The employee the sale is attributed to — the VERIFIED one and nothing else, and only while
   * the feature is on.
   *
   * The `salespersonRequired` guard is what stops a stale verification leaking across a settings
   * change: if an admin switches the feature off while this POS is open, the sale in progress
   * stops carrying an attribution immediately, without waiting for the reload that updates the
   * rest of the UI.
   */
  const effectiveSalesperson = useMemo(
    () => (salespersonRequired ? verifiedSalesperson : null),
    [salespersonRequired, verifiedSalesperson]
  );

  /**
   * The two fields every checkout payload must carry. Kept as one projection so the POS checkout
   * builder and the delivery-order builder cannot drift apart.
   *
   * <p>Both are null while the feature is off, so a tenant that never enables it posts exactly
   * the body it posted before the feature existed.
   */
  const salespersonPayload = useMemo(() => ({
    salespersonEmployeeId: effectiveSalesperson ? effectiveSalesperson.id : null,
    salespersonEmployeeCode: effectiveSalesperson ? (effectiveSalesperson.employeeCode || null) : null,
  }), [effectiveSalesperson]);

  /** Is this sale allowed to proceed as far as the frontend can tell? Advisory. */
  const salespersonVerified = !salespersonRequired || !!verifiedSalesperson;
  const targetReady = !targetRequired || (readiness ? readiness.ready !== false : true);

  /**
   * Resolve a scanned (or typed) employee code. The SERVER validates existence, Active status and
   * the two-designation eligibility rule; this only reports what it said.
   *
   * @returns the verified employee on success, null on rejection (with `verifyError` set).
   */
  const verifyByCode = useCallback(async (rawCode) => {
    const code = String(rawCode ?? '').trim();
    if (!code) {
      setVerifyError('Scan or enter an employee barcode.');
      return null;
    }
    setVerifying(true);
    setVerifyError('');
    try {
      const employee = await lookupSalespersonByCode(code);
      setVerifiedSalesperson(employee);
      return employee;
    } catch (err) {
      // The server's reason is the useful one ("not an eligible salesperson", "must be an active
      // employee", "No employee found for barcode ..."). Only fall back when it sent none.
      const reason = err?.response?.data?.message
        || err?.response?.data?.error
        || (err?.response?.status === 404 ? `No employee found for barcode ${code}.` : '')
        || 'Could not verify this employee barcode.';
      setVerifyError(reason);
      return null;
    } finally {
      setVerifying(false);
    }
  }, []);

  /** Show the blocking warning, optionally with the server's own refusal payload. */
  const openReadinessWarning = useCallback((payload = null) => {
    if (payload) setReadinessBlock(payload);
    setShowReadinessWarning(true);
  }, []);

  const closeReadinessWarning = useCallback(() => {
    setShowReadinessWarning(false);
    setReadinessBlock(null);
    // Re-read on dismissal: an admin may have completed the configuration while the dialog sat
    // open, and the cashier should not have to reload the POS to find that out.
    if (targetRequired) refreshReadiness();
  }, [targetRequired, refreshReadiness]);

  const openScanModal = useCallback(() => {
    setVerifyError('');
    setScanModalOpen(true);
  }, []);

  const closeScanModal = useCallback(() => {
    setScanModalOpen(false);
    setVerifyError('');
  }, []);

  /** Drop the verification so the modal returns to its scan state ("Scan New"). */
  const clearVerifiedSalesperson = useCallback(() => {
    setVerifiedSalesperson(null);
    setVerifyError('');
  }, []);

  /** Clear the attribution after a completed sale. */
  const resetSalesperson = useCallback(() => {
    // Verification is per-sale and never carries over: the next customer may be served by someone
    // else, and an inherited verification would be an un-scanned attribution. There is no default
    // to fall back to — the next sale starts unverified and must be scanned.
    setVerifiedSalesperson(null);
    setVerifyError('');
  }, []);

  return {
    salespersonPayload,
    resetSalesperson,
    salespersonRequired,
    targetRequired,
    verifiedSalesperson,
    effectiveSalesperson,
    salespersonVerified,
    verifying,
    verifyError,
    verifyByCode,
    clearVerifiedSalesperson,
    scanModalOpen,
    openScanModal,
    closeScanModal,
    readiness,
    readinessBlock,
    targetReady,
    refreshReadiness,
    showReadinessWarning,
    openReadinessWarning,
    closeReadinessWarning,
  };
}
