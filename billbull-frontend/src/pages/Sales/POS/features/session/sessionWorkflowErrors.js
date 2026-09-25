// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged; only the location moved.
//
// A pure predicate with three callers in two owners: usePosSession (Continue Session at
// terminal registration), useCheckout (settle payment) and POSSales (cash movement). It
// lives in a module rather than in either owner so none of them reaches it through the
// temporal dead zone of another.

/** True when an axios error is the backend's close-workflow refusal. */
export const isClosureWorkflowError = (err) => {
  const msg = err?.response?.data?.message || err?.response?.data;
  return err?.response?.status === 409 && typeof msg === 'string'
    && msg.includes('SESSION_CLOSING_WORKFLOW');
};
