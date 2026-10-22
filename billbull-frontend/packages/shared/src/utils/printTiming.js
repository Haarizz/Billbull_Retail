// Lightweight stage timer for the print critical path.
//
// Printing crosses four systems (browser → backend → local agent → printer), so a
// "printing feels slow" report is unactionable without knowing WHICH leg is slow.
// This emits one collapsed console group per print with a per-stage breakdown, and
// is deliberately console-only: no state, no network, no React, nothing that could
// itself add latency to the path it is measuring.
//
// Enable/disable at runtime from the browser console (persisted in localStorage):
//   localStorage.setItem('bb.printTiming', '1')   // on
//   localStorage.removeItem('bb.printTiming')     // off
// Timings are ALWAYS collected (performance.now() is effectively free); the flag
// only controls whether the summary is printed.

const isEnabled = () => {
  try {
    return localStorage.getItem("bb.printTiming") === "1";
  } catch {
    return false;
  }
};

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Starts a timer. Call `.mark(stage)` at each boundary and `.end()` when the
 * printer has the bytes. Every method is failure-proof — a timing bug must never
 * be able to break a print.
 */
export const startPrintTimer = (label) => {
  const t0 = now();
  let last = t0;
  const stages = [];

  const mark = (stage) => {
    try {
      const t = now();
      stages.push([stage, t - last, t - t0]);
      last = t;
    } catch { /* timing must never break printing */ }
  };

  const end = (outcome = "ok") => {
    try {
      const total = now() - t0;
      if (isEnabled()) {
        console.groupCollapsed(`[print-timing] ${label} — ${total.toFixed(0)}ms (${outcome})`);
        for (const [stage, delta, cumulative] of stages) {
          console.log(`  ${stage.padEnd(28)} ${delta.toFixed(1).padStart(8)}ms   (t+${cumulative.toFixed(0)}ms)`);
        }
        console.groupEnd();
      }
      return total;
    } catch {
      return 0;
    }
  };

  return { mark, end };
};
