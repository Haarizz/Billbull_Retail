/**
 * The one answer to "does this keystroke belong to a field the user is typing in?"
 *
 * Shared by the global Ctrl/Cmd+X search shortcut and every POS keyboard path (scanner wedge,
 * type-anywhere redirect, payment hotkeys), which previously each carried a slightly different
 * tag check and so disagreed about contenteditable, role="textbox" and text nodes.
 *
 * Owned when the target (or, for a caret on a text node, its parent element):
 *  - is an <input>, <textarea> or <select>;
 *  - is, or sits inside, a contenteditable region. `isContentEditable` is inherited in a real
 *    browser but not implemented by jsdom, hence the `closest` walk as well;
 *  - sits inside role="textbox" (rich-text/code editors render a focusable box, not a control);
 *  - sits inside an element marked data-pos-keyboard-owner="true": a POS surface that is not a
 *    form control but takes typed input itself, such as a payment modal keying digits into its
 *    amount.
 */
export const POS_KEYBOARD_OWNER_ATTR = 'data-pos-keyboard-owner';

export function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const el = target.nodeType === 3 ? target.parentElement : target;
  if (!el || typeof el.tagName !== 'string') return false;

  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;

  if (typeof el.closest === 'function') {
    if (el.closest('[contenteditable=""], [contenteditable="true"]')) return true;
    if (el.closest('[role="textbox"]')) return true;
    if (el.closest(`[${POS_KEYBOARD_OWNER_ATTR}="true"]`)) return true;
  }
  return false;
}

export default isEditableTarget;
