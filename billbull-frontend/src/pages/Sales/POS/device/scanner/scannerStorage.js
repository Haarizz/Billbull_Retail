// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged; only the location moved.

export const buildPosScannerStorageKey = (branchId, terminalId) => {
  if (!branchId && !terminalId) return null;
  return `billbull:pos:scanner:${branchId ?? 'branch'}:${terminalId || 'shared'}`;
};
