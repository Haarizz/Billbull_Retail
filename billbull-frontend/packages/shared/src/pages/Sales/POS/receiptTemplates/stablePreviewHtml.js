/**
 * Keeps the live checkout preview from reloading when only its clock moved.
 *
 * The checkout preview is rebuilt with `new Date()` on every recompute. Template 3
 * prints the time to the second, so any re-render produced different HTML → a new
 * blob URL → the preview iframe reloaded and jumped back to the top while the
 * cashier was scrolling it. Comparing builds with the time-of-day masked out lets an
 * otherwise identical receipt keep the previous string; any real change (cart,
 * payment, customer, toggles) still produces new HTML, and the time refreshes then.
 *
 * Only the time-of-day is masked — a changed date still counts as a change.
 */
const TIME_OF_DAY = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?\b/g;

const mask = (html) => String(html).replace(TIME_OF_DAY, "--:--");

/**
 * @returns {(html: string) => string} a stabiliser with its own memory of the
 *          last HTML it returned (one per preview surface).
 */
export function createStablePreviewHtml() {
  let last = "";
  let lastMasked = "";
  return (html) => {
    if (!html) return html;
    const masked = mask(html);
    if (last && masked === lastMasked) return last;
    last = html;
    lastMasked = masked;
    return html;
  };
}

/** The checkout thermal preview's stabiliser (one checkout preview per till). */
export const stableCheckoutPreviewHtml = createStablePreviewHtml();
