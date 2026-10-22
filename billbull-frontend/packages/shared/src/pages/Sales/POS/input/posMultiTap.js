/**
 * A multi-tap recogniser: tells a single tap from a double or triple one, and reports each
 * sequence exactly once.
 *
 * Taps that follow each other within `thresholdMs` belong to one sequence. The sequence resolves
 * - when `thresholdMs` passes with no further tap (with the count so far), or
 * - at once on the `maxTaps`-th tap, since no longer sequence exists to wait for.
 * Nothing is reported before then, so a double tap never also runs the single-tap action, and a
 * triple never runs the single or the double one.
 *
 * `cancel()` drops a sequence in progress without reporting it (another key arrived, the screen
 * changed). Pure apart from the injected clock and timer, so it is tested without a browser.
 */
export function createMultiTap({
  thresholdMs,
  maxTaps = 3,
  onResolve,
  setTimer = (fn, ms) => window.setTimeout(fn, ms),
  clearTimer = (id) => window.clearTimeout(id),
}) {
  let count = 0;
  let timer = null;

  const stopTimer = () => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const resolve = () => {
    const taps = count;
    stopTimer();
    count = 0;
    if (taps > 0) onResolve(taps);
  };

  return {
    /** One tap. Returns the tap's position in its sequence (1, 2, 3 …). */
    tap() {
      count += 1;
      const position = count;
      stopTimer();
      if (count >= maxTaps) resolve();
      else timer = setTimer(resolve, thresholdMs);
      return position;
    },
    /** True while a sequence is waiting to learn whether another tap follows. */
    pending() {
      return count > 0;
    },
    cancel() {
      stopTimer();
      count = 0;
    },
  };
}

export default createMultiTap;
