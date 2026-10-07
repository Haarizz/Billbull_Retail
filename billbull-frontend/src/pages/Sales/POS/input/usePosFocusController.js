import { useEffect } from 'react';

import { isEditableTarget } from '../../../../utils/editableTarget';
import { isPosScreenBlocked } from '../device/scanner/scanGuard';
import { resolvePosScope } from './posScope';
import { resolveFocusState, STICKY_FOCUS_TARGETS } from './posFocus';

const defaultSchedule = (fn) => {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
};

/**
 * The single POS focus pipeline. Focus moves in exactly two situations:
 *
 *  1. Transition. After a commit that changed the registry (an overlay opened or closed, the
 *     item keypad mode changed, a target element mounted, Settle became ready) the target is
 *     re-derived. If the target, or the element implementing it, changed, the caret moves there:
 *     sale → checkout → payment amount → Settle → New Sale → search. It does not move when the
 *     element already holds focus, holds it inside itself (a dialog whose own field has the
 *     caret), or when the cashier is typing in some other field the previous target did not own.
 *
 *  2. Interaction. A click in SALE or ITEM_ENTRY scope (product tile, +/−, void, hold, keypad,
 *     function button) hands the caret back to the sticky target in the capture phase, before
 *     the button's own handler runs. So the button never keeps focus — a scanner's terminating
 *     Enter cannot activate it again — and a dialog the button opens records the search box,
 *     not the button, as the element to return focus to when it closes.
 *
 * Re-derivation is coalesced to once per commit, after the commit has finished (a microtask,
 * not a timer): every registration and render of the commit is in place when it runs.
 */
export function createPosFocusController({
  registry,
  isDomBlocked = isPosScreenBlocked,
  schedule = defaultSchedule,
  getDocument = () => (typeof document !== 'undefined' ? document : null),
}) {
  let last = { target: null, element: null };
  let queued = false;
  let disposed = false;

  const evaluate = () => {
    const surface = registry.newest('surface');
    const scopeState = resolvePosScope({
      overlays: registry.list('overlay'),
      itemEntryActive: Boolean(surface?.itemEntryActive),
      isDomBlocked,
    });
    return resolveFocusState(registry, scopeState, surface);
  };

  const focusElement = (el) => {
    el.focus({ preventScroll: true });
    // A field that was focused for the next scan starts empty-looking: select what is there so
    // the next keystroke replaces a leftover search rather than appending to it.
    if (typeof el.select === 'function' && el.tagName === 'INPUT') el.select();
  };

  /** Moves focus if the derived target changed since the last evaluation. */
  const reconcile = () => {
    if (disposed) return;
    const doc = getDocument();
    if (!doc) return;
    const state = evaluate();
    const previous = last;
    last = { target: state.target, element: state.element };

    const el = state.element;
    if (!el) return;
    if (previous.target === state.target && previous.element === el) return;

    const active = doc.activeElement;
    if (active === el || (active && el.contains(active))) return;
    // The cashier is typing in a field the previous target did not own (an unregistered field):
    // a transition elsewhere must not pull the caret out of it.
    const ownedBefore = previous.element && (active === previous.element || previous.element.contains(active));
    if (isEditableTarget(active) && !ownedBefore) return;
    focusElement(el);
  };

  const scheduleReconcile = () => {
    if (queued || disposed) return;
    queued = true;
    schedule(() => {
      queued = false;
      reconcile();
    });
  };

  /** Capture-phase click: put the caret back on the sticky target before the handler runs. */
  const onClickCapture = (event) => {
    if (disposed) return;
    const doc = getDocument();
    if (!doc) return;
    const state = evaluate();
    if (!STICKY_FOCUS_TARGETS.has(state.target)) return;
    const el = state.element;
    if (!el) return;
    const clicked = event.target;
    // A click on a field (or anything inside the target itself) is the cashier choosing it.
    if (clicked && (clicked === el || (typeof el.contains === 'function' && el.contains(clicked)))) return;
    if (isEditableTarget(clicked)) return;
    const active = doc.activeElement;
    if (active === el) return;
    if (isEditableTarget(active) && !el.contains(active)) return;
    focusElement(el);
  };

  const dispose = () => {
    disposed = true;
  };

  return { reconcile, schedule: scheduleReconcile, onClickCapture, dispose, evaluate };
}

/**
 * usePosFocusController — owns where the caret goes for one POSSales instance.
 *
 * Inert unless the registry has posFocusV2 on (which requires posInputV2). Then it subscribes to
 * the registry, re-derives focus after every commit that touched it, and attaches one
 * capture-phase click listener for interaction restores. With the flag off nothing is attached
 * and the legacy focus mechanisms in the templates and the payment panel run instead.
 */
export function usePosFocusController(registry) {
  useEffect(() => {
    if (!registry?.focusV2 || typeof window === 'undefined') return undefined;
    const controller = createPosFocusController({ registry });
    const unsubscribe = registry.subscribe(controller.schedule);
    window.addEventListener('click', controller.onClickCapture, true);
    controller.schedule();
    return () => {
      unsubscribe();
      window.removeEventListener('click', controller.onClickCapture, true);
      controller.dispose();
    };
  }, [registry]);
}

export default usePosFocusController;
