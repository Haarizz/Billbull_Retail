import { useCallback, useEffect, useState } from 'react';

import { getPosCheckoutCapabilities } from '../../../../api/posApi';

/**
 * Confirms the server understands the payment shape this terminal sends, before it is used.
 *
 * The checkout posts progressive `paymentAllocations`. A server built before that field
 * existed would deserialize the request, ignore the unknown property and post the invoice
 * with **no payment recorded at all** — a silently unpaid sale, discovered at cash-up. So
 * the terminal asks first and refuses to settle if the answer is no or unknown, rather than
 * risking the tender.
 *
 * Probed once when the checkout opens (results are cached for the session) and retryable,
 * so a transient network blip does not strand a cashier mid-sale.
 *
 * @returns {{status: 'checking'|'supported'|'unsupported'|'unknown', message: string|null,
 *            capabilities: object|null, canSettle: boolean, retry: function}}
 */
export function useCheckoutCapabilities(active) {
  const [state, setState] = useState({ status: 'checking', message: null, capabilities: null });

  const probe = useCallback(async () => {
    const result = await getPosCheckoutCapabilities();

    if (!result.ok) {
      setState({
        status: 'unknown',
        message: 'Could not reach the server to verify checkout compatibility. '
          + 'Check the connection and retry before settling — settling now could record a sale with no payment.',
        capabilities: null,
      });
      return;
    }
    if (!result.capabilities?.paymentAllocations) {
      setState({
        status: 'unsupported',
        message: 'This till is newer than the server it is connected to. The server does not accept '
          + 'progressive payment allocations, so settling would post this sale without its payment. '
          + 'Update the server (BillBull backend) before taking payments on this terminal.',
        capabilities: result.capabilities,
      });
      return;
    }
    setState({ status: 'supported', message: null, capabilities: result.capabilities });
  }, []);

  useEffect(() => {
    if (!active) return;
    // Already answered — the contract cannot change mid-session, so don't re-probe.
    if (state.status === 'supported' || state.status === 'unsupported') return;
    probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /** Re-probe after a connection problem, showing the checking state while it runs. */
  const retry = useCallback(() => {
    setState({ status: 'checking', message: null, capabilities: null });
    return probe();
  }, [probe]);

  return {
    ...state,
    /** Settlement is permitted only on a positively confirmed server. */
    canSettle: state.status === 'supported',
    retry,
  };
}

export default useCheckoutCapabilities;
