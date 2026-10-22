/**
 * P2 (deterministic POS focus) added a focus-target registration to two extracted checkout
 * components. Their characterization pins assert the components are the verbatim POSSales
 * blocks; they keep asserting exactly that against the source with these P2 edits undone.
 *
 * P3 (keyboard shortcuts) then registered each component's shortcut actions next to it — New
 * Sale for Enter on COMPLETE, Settle/Cancel for Ctrl+Enter/Esc on CHECKOUT — and those are
 * undone here too.
 *
 * Each entry is [live text, pre-P2 text]. Every live text must occur exactly once, so the
 * undo is exact: anything else that changed in the component still fails the pins.
 */
const EDITS = {
  CheckoutCompleteActions: [
    [
      "  // The controller sends a person's Enter here (never a scanner's), wherever the caret is on\n"
      + '  // this screen except another of its buttons.\n'
      + '  usePosShortcuts({\n'
      + '    scope: POS_SCOPES.COMPLETE,\n'
      + '    owner: POS_OVERLAY_IDS.CHECKOUT_COMPLETE,\n'
      + '    actions: { newSale: onNewSale },\n'
      + '  });\n'
      + '  useNewSaleEnterFallback(newSaleRef, onNewSale);\n',
      '',
    ],
    ["import React, { useRef } from 'react';\n", "import React from 'react';\n"],
    [
      "import { usePosFocusTarget, usePosShortcuts } from '../../input/PosOverlayContext';\n"
      + "import { POS_FOCUS_TARGETS } from '../../input/posFocus';\n"
      + "import { POS_OVERLAY_IDS, POS_SCOPES } from '../../input/posScope';\n"
      + "import { useNewSaleEnterFallback } from './useNewSaleEnterFallback';\n",
      '',
    ],
    [
      "  // New Sale is the COMPLETE screen's focus target: Enter starts the next sale.\n"
      + '  const newSaleRef = useRef(null);\n'
      + '  usePosFocusTarget({ targets: POS_FOCUS_TARGETS.NEW_SALE, ref: newSaleRef, owner: POS_OVERLAY_IDS.CHECKOUT_COMPLETE });\n',
      '',
    ],
    [' ref={newSaleRef}', ''],
  ],
  CheckoutPaymentFooter: [
    [
      '  // Ctrl+Enter is this Settle button and Esc is this Cancel button, under the same conditions:\n'
      + '  // Settle only when it is enabled (onSettle → processPayment keeps its own re-entrancy lock and\n'
      + '  // checkoutKey), Cancel not while a settlement is in flight.\n'
      + '  usePosShortcuts({\n'
      + '    scope: POS_SCOPES.CHECKOUT,\n'
      + '    owner: POS_OVERLAY_IDS.CHECKOUT,\n'
      + '    actions: {\n'
      + '      settle: () => { if (settleReady) onSettle(); },\n'
      + '      cancel: () => { if (!checkoutLoading) onCancel(); },\n'
      + '    },\n'
      + '  });\n',
      '',
    ],
    ["import React, { useRef } from 'react';\n", "import React from 'react';\n"],
    [
      "import { usePosFocusTarget, usePosShortcuts } from '../../input/PosOverlayContext';\n"
      + "import { POS_FOCUS_TARGETS } from '../../input/posFocus';\n"
      + "import { POS_OVERLAY_IDS, POS_SCOPES } from '../../input/posScope';\n",
      '',
    ],
    [
      "  // Settle is the checkout's SETTLE focus target; `ready` is what makes the focus controller\n"
      + '  // choose it over the method bar (fully allocated, server ready, nothing in flight).\n'
      + '  const settleRef = useRef(null);\n'
      + '  const settleReady = canSettle && itemCount > 0 && !checkoutLoading;\n'
      + '  usePosFocusTarget({\n'
      + '    targets: POS_FOCUS_TARGETS.SETTLE, ref: settleRef, owner: POS_OVERLAY_IDS.CHECKOUT, ready: settleReady,\n'
      + '  });\n',
      '',
    ],
    [
      '                {(() => {\n                  return (\n',
      '                {(() => {\n                  const settleReady = canSettle && itemCount > 0 && !checkoutLoading;\n                  return (\n',
    ],
    [' ref={settleRef}', ''],
  ],
};

const count = (src, needle) => src.split(needle).length - 1;

/** The live P2 edits for `component`, for tests that pin them directly. */
export const p2FocusEdits = (component) => EDITS[component].map(([live]) => live);

/** `src` with the P2 focus edits of `component` undone. Throws unless each occurs exactly once. */
export function undoP2FocusEdits(component, src) {
  return EDITS[component].reduce((out, [live, pre]) => {
    const n = count(out, live);
    if (n !== 1) throw new Error(`${component}: P2 focus edit expected once, found ${n}: ${JSON.stringify(live)}`);
    return out.replace(live, () => pre);
  }, src);
}
