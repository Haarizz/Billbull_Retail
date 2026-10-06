/**
 * Whether a POS overlay currently owns the screen, so a keyboard-wedge scan must not reach the
 * sale behind it.
 *
 * Every POS dialog/overlay in this codebase (checkout, payment modals, return, delivery,
 * layaway, session dialogs) is rendered as a `fixed inset-0` layer, and modals that must never
 * see a scan additionally carry data-pos-scan-suppress. Shared by the Classic/Cart Focus wedge
 * listener (POSTouchScreen) and the compact template's sticky focus (useStickyScanFocus) so the
 * two cannot drift on what "blocked" means.
 */
export const isPosScreenBlocked = () => {
  if (typeof document === 'undefined') return true;
  if (document.querySelector('.fixed.inset-0')) return true;
  if (document.querySelector('[data-pos-scan-suppress="true"]')) return true;
  return false;
};

/** Inter-key gap (ms) at or below which keystrokes are treated as one scanner burst. */
export const SCANNER_BURST_GAP_MS = 35;
/** Minimum characters for a burst to count as a scan rather than quick typing. */
export const SCANNER_BURST_MIN_CHARS = 4;

/**
 * Tracks keystroke timing on one input so an Enter can be classified as the end of a scanner
 * burst rather than something a person typed. A wedge scanner emits its characters a few ms
 * apart; no cashier types four characters with every gap under SCANNER_BURST_GAP_MS.
 */
export function createBurstTracker(now = () => Date.now()) {
  let lastAt = 0;
  let length = 0;
  return {
    /** Record one printable keystroke. */
    key() {
      const t = now();
      length = (lastAt && t - lastAt <= SCANNER_BURST_GAP_MS) ? length + 1 : 1;
      lastAt = t;
    },
    /** True when an Enter right now terminates a scanner-speed burst. */
    isScanEnter() {
      return length >= SCANNER_BURST_MIN_CHARS && now() - lastAt <= SCANNER_BURST_GAP_MS * 3;
    },
    reset() {
      lastAt = 0;
      length = 0;
    },
  };
}
