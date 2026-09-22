import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSalespersons } from '../../../../../api/employeeApi';

/**
 * Salesperson attribution for the current POS sale — WHO the sale belongs to, as distinct from the
 * cashier who rang it up. The cashier stays the authenticated session owner; nothing here touches
 * session, terminal or payment state.
 *
 * <p>All of this feature's state lives inside this hook rather than in POSSales.jsx, so the POS
 * orchestrator gains no top-level state, refs or effects and its structural characterization suite
 * is unaffected.
 *
 * <p>The list and the caller's default arrive from ONE request: the backend returns the active
 * employees plus `defaultEmployeeId`, which is the caller's own linked employee when they have one
 * and it is Active. When there is no linked employee the sale simply starts Unassigned — there is
 * no fallback guess.
 */
export default function useSalesperson() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [salespersonEmployeeId, setSalespersonEmployeeId] = useState(null);
  const [defaultEmployeeId, setDefaultEmployeeId] = useState(null);
  // The default is applied once per POS mount. Without this, clearing the selection deliberately
  // would be undone the next time the options list settled.
  const defaultAppliedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getSalespersons();
        if (cancelled) return;
        const list = Array.isArray(data?.options) ? data.options : [];
        setOptions(list);
        setDefaultEmployeeId(data?.defaultEmployeeId ?? null);
        if (!defaultAppliedRef.current) {
          defaultAppliedRef.current = true;
          const fallback = data?.defaultEmployeeId ?? null;
          if (fallback != null && list.some(o => String(o.id) === String(fallback))) {
            setSalespersonEmployeeId(fallback);
          }
        }
      } catch (_) {
        if (!cancelled) {
          // Attribution is optional — a failed lookup must never block selling.
          setOptions([]);
          setError('Could not load salespersons');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedSalesperson = useMemo(
    () => options.find(o => String(o.id) === String(salespersonEmployeeId)) || null,
    [options, salespersonEmployeeId]
  );

  /**
   * The two fields every checkout payload must carry. Kept as one projection so the POS checkout
   * builder and the delivery-order builder cannot drift apart.
   */
  const salespersonPayload = useMemo(() => ({
    salespersonEmployeeId: selectedSalesperson ? selectedSalesperson.id : null,
    salespersonEmployeeCode: selectedSalesperson ? (selectedSalesperson.employeeCode || null) : null,
  }), [selectedSalesperson]);

  /** Back to the session default (or Unassigned) after a completed sale. */
  const resetSalesperson = useCallback(() => {
    setSalespersonEmployeeId(prev => {
      if (defaultEmployeeId != null
          && options.some(o => String(o.id) === String(defaultEmployeeId))) {
        return defaultEmployeeId;
      }
      return prev != null ? null : prev;
    });
  }, [defaultEmployeeId, options]);

  return {
    salespersonOptions: options,
    salespersonLoading: loading,
    salespersonError: error,
    salespersonEmployeeId,
    setSalespersonEmployeeId,
    selectedSalesperson,
    salespersonPayload,
    resetSalesperson,
  };
}
