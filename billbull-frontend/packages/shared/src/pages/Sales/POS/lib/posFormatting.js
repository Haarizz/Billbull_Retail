// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged; only the location moved.

/** Currency rounding to 2dp. Money comparisons are made at fils precision everywhere. */
export const round2Money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Bare 2dp amount for inline feedback messages (the currency symbol comes from context). */
export const formatMoney2 = (n) => round2Money(n).toFixed(2);

// 'YYYY-MM-DD' for the browser's local calendar day — toISOString() would shift
// the day in negative-UTC zones. Used as the layaway due-date default/floor.
export const todayInputDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const parseUTCDate = (ts) => {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(ts);
  const tIdx = s.indexOf('T');
  if (tIdx !== -1 && !s.endsWith('Z')) {
    const timePart = s.slice(tIdx);
    if (!timePart.includes('+') && !timePart.includes('-')) {
      s += 'Z';
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
