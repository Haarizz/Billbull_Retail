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

// Keydown events a window-level wedge (legacy listener or the V2 input controller) has already
// turned into a scan. The wedge runs in the capture phase, before the barcode box's own
// onKeyDown, which checks this so a single event can never be scanned twice.
const scannedEvents = new WeakSet();
export const markScanHandled = (event) => { if (event) scannedEvents.add(event); };
export const wasScanHandled = (event) => Boolean(event) && scannedEvents.has(event);

// Keydown events the V2 POS input controller has acted on (scan, hotkey, Escape, swallowed
// burst). A legacy listener that is still mounted somewhere checks this, so one keystroke can
// never be executed by both systems.
const posInputHandledEvents = new WeakSet();
export const markPosInputHandled = (event) => { if (event) posInputHandledEvents.add(event); };
export const isPosInputHandled = (event) => Boolean(event) && posInputHandledEvents.has(event);

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
    /** True when a keystroke right now would continue the current scanner-speed run. */
    follows() {
      return Boolean(lastAt) && now() - lastAt <= SCANNER_BURST_GAP_MS;
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
