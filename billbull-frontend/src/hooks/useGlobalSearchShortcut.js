import { useEffect, useRef } from 'react';

import { isEditableTarget } from '../utils/editableTarget';

/**
 * Returns true when the event target is somewhere the user is editing text, so
 * Ctrl/Cmd+X must keep its native "cut" meaning.
 *
 * The definition lives in utils/editableTarget.js and is shared with every POS
 * keyboard path, so the app has one notion of "a field owns this keystroke".
 * This name is kept for existing importers.
 */
export const isTextEntryTarget = isEditableTarget;

/**
 * Global Ctrl+X (Windows/Linux) / Cmd+X (macOS) shortcut that opens BillBull's
 * global search.
 *
 * Deliberately NOT built on useShortcuts.js: that hook calls preventDefault()
 * unconditionally and has no text-entry guard, so routing this binding through
 * it would break cut in every input in the app. It also has nine existing
 * consumers, so its behaviour is left untouched.
 *
 * preventDefault() is called only on the keystrokes this hook actually handles.
 *
 * @param {(event: KeyboardEvent) => void} onTrigger
 * @param {{ enabled?: boolean }} [options]
 */
const useGlobalSearchShortcut = (onTrigger, { enabled = true } = {}) => {
  // Kept in a ref so a caller passing an inline arrow does not re-register the
  // listener on every render.
  const handlerRef = useRef(onTrigger);

  useEffect(() => {
    handlerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      // Another handler already claimed this keystroke.
      if (event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      // Ctrl+Alt+X / Option combinations are a different binding, not ours.
      if (event.altKey) return;
      if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'x') return;
      // Never shadow the native cut while the user is editing text.
      if (isTextEntryTarget(event.target)) return;

      event.preventDefault();
      handlerRef.current?.(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
};

export default useGlobalSearchShortcut;
