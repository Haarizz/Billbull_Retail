/**
 * P2 (deterministic POS focus) added a focus-target registration to two extracted checkout
 * components. Their characterization pins assert the components are the verbatim POSSales
 * blocks; they keep asserting exactly that against the source with these P2 edits undone.
 *
 * Each entry is [live P2 text, pre-P2 text]. Every live text must occur exactly once, so the
 * undo is exact: anything else that changed in the component still fails the pins.
 */
const EDITS = {
  CheckoutCompleteActions: [
    ["import React, { useRef } from 'react';\n", "import React from 'react';\n"],
    [
      "import { usePosFocusTarget } from '../../input/PosOverlayContext';\n"
      + "import { POS_FOCUS_TARGETS } from '../../input/posFocus';\n"
      + "import { POS_OVERLAY_IDS } from '../../input/posScope';\n",
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
    ["import React, { useRef } from 'react';\n", "import React from 'react';\n"],
    [
      "import { usePosFocusTarget } from '../../input/PosOverlayContext';\n"
      + "import { POS_FOCUS_TARGETS } from '../../input/posFocus';\n"
      + "import { POS_OVERLAY_IDS } from '../../input/posScope';\n",
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
