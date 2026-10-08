import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Zap } from 'lucide-react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { CurrencyAmount } from '../POSCurrency';

/**
 * CHARACTERIZATION — the still-INLINE POSSales.jsx "Promotions Dialog" region.
 * PRE-EXTRACTION. This file makes ZERO production changes; POSSales.jsx is untouched.
 *
 * (1) EXACT CURRENT SOURCE BOUNDARY
 *   POSSales.jsx:9249-9287 — 39 lines.
 *     9249  the `Promotions Dialog` comment
 *     9250  <Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>
 *     9251  <DialogContent className="max-w-md bg-white">
 *     9287  the closing </Dialog>
 *   The region is reproduced VERBATIM below between REGION-VERBATIM-START/END and is the
 *   pinned behavioural reference for this whole suite.
 *
 * (2) STABLE SOURCE PIN
 *   sha256 of the 39 LF-normalised lines (trailing newline included):
 *     056496812d31fe18ddd3af6adb17f4f4f11a024ac2d60228b195e071c1109399
 *   sha256 of lines 9250-9287 only (the JSX, leading comment excluded):
 *     2b56cc5ba93c74fec5d09587187ceb007f4f23cf43b3708e30caaf724423de6d
 *   The `source contract` describe asserts BOTH against the live POSSales.jsx, so any drift in
 *   the inline region fails this suite immediately.
 *
 * (3) IMMEDIATE NEIGHBOURS
 *   BEFORE — the already-extracted `Coupons Dialog` comment + <CouponsDialog ... /> call site
 *            (POSSales.jsx:9190-9205), separated by one blank line.
 *   AFTER  — the `Save as Order Dialog` comment + its inline
 *            <Dialog open={showSaveOrderDialog} ...> (POSSales.jsx:9247-…), one blank line on.
 *   Both neighbours are siblings in the same top-level JSX fragment; nothing nests the region.
 *
 * (4) PARENT-OWNED STATE READ BY THE REGION
 *   showPromotionsDialog   POSSales.jsx:714  useState(false)
 *   appliedCoupon          POSSales.jsx:712  useState(null)  — SHARED with CouponsDialog
 *   couponDiscount         POSSales.jsx:713  useState(0)     — SHARED with CouponsDialog
 *   currentInvoice         POSSales.jsx:609  destructured from useCart() — SHARED widely
 *   Only `currentInvoice.billDiscountAmount` is read off the invoice; no other field.
 *
 * (5) SETTERS / STATE WRITERS USED
 *   setShowPromotionsDialog — twice: as `onOpenChange` directly (9225) and as
 *   `() => setShowPromotionsDialog(false)` on the "Got it" button (9259). Nothing else is
 *   written. The region writes NO cart state, NO coupon state, NO invoice.
 *
 * (6) OTHER PARENT BINDINGS USED
 *   formatCurrency — POSSales.jsx:1944, `(amount) => <CurrencyAmount amount={amount} />`.
 *   Called exactly twice in the source (9236 with `couponDiscount`, 9245 with
 *   `currentInvoice.billDiscountAmount`).
 *   Module-level imports only, no locals: ui/dialog (Dialog, DialogContent, DialogHeader,
 *   DialogTitle, DialogDescription, DialogFooter), ui/button Button, ui/badge Badge,
 *   lucide-react Zap.
 *
 * (7) HOOKS / REFS / EFFECTS / CONTEXT / PORTALS / TIMERS / SUBSCRIPTIONS / LIFECYCLE
 *   NONE are declared inside the region. No useState, useEffect, useRef, useMemo,
 *   useCallback, useContext, createPortal, setTimeout, setInterval, addEventListener.
 *   No IIFE, no `key`, no local variable of any kind. It is a pure render expression of its
 *   six bindings.
 *   LIFECYCLE FACT: the region is ALWAYS MOUNTED — Radix `open={showPromotionsDialog}`, not a
 *   `{showPromotionsDialog && ...}` conditional mount. Its body therefore re-evaluates with
 *   the parent on every POSSales render even while the dialog is closed. (The portal and
 *   focus-trap lifecycle belongs to Radix's <Dialog>, not to the region.)
 *
 * (8) DIRECT API / SERVICE CALLS
 *   NONE. No network I/O, no api module import, no await, no async, no promise.
 *   There is nothing to mock and no loading/error state to characterize: "loading" and
 *   "failure" branches DO NOT EXIST for this region, which the source contract asserts.
 *   The characterized branches are therefore the four render states: coupon, bill-discount,
 *   both, and empty.
 *
 * (9) COMPONENTS / ICONS USED EXCLUSIVELY BY THE REGION
 *   `Zap` (lucide) is used ONLY here in POSSales.jsx — twice, at 9228 and 9252 — so on
 *   extraction the `Zap,` entry in the POSSales lucide import (POSSales.jsx:104) becomes dead
 *   and moves to the child. Asserted in the source contract.
 *   `Badge` is NOT exclusive (5 `<Badge` occurrences in POSSales) and must stay imported there.
 *   Dialog/Button primitives are shared throughout POSSales.
 *
 * (10) CROSS-FEATURE CALLBACKS AND HANDOFFS
 *   NONE outbound. The region never calls into another feature.
 *   INBOUND, the only opener: POSTouchScreen.jsx:316, the `promotions` function button,
 *   `action: () => setShowPromotionsDialog(true)`. `setShowPromotionsDialog` reaches
 *   POSTouchScreen through `touchScreenProps` (POSSales.jsx:7109) and stays parent-owned.
 *   The read-only coupling to the Coupons feature is via `appliedCoupon`/`couponDiscount`,
 *   which the extracted CouponsDialog also receives as props — so those two useStates MUST
 *   remain in POSSales and be passed down; they cannot move into this child.
 *
 * (11) EXISTING QUIRKS AND DEFECTS THAT MUST REMAIN UNCHANGED
 *   Q1  A coupon HIDES a concurrent manual bill discount. The Bill Discount banner is guarded
 *       by `&& !appliedCoupon`, so a sale with BOTH an applied coupon and a separate
 *       `currentInvoice.billDiscountAmount > 0` shows only the coupon row.
 *   Q2  The coupon row's amount comes from parent `couponDiscount`, NOT from
 *       `currentInvoice.billDiscountAmount`. Those are two independent stores of the same
 *       number (see CouponsDialog Q9) and this dialog shows the `couponDiscount` copy even
 *       when the cart disagrees.
 *   Q3  A zero bill discount renders the EMPTY state, not a "0.00 off" row — `> 0`, so 0 and
 *       any negative value fall through to "No active promotions for this sale."
 *   Q4  `onOpenChange={setShowPromotionsDialog}` hands Radix's raw boolean to the setter. It
 *       resets nothing, and it is the only close path besides "Got it".
 *   Q5  The dialog is strictly READ-ONLY: no remove, no edit, no re-apply. "Got it" only
 *       closes. Removing a coupon is only possible from the Coupons dialog.
 *   Q6  The empty state's hint text hard-codes the sibling feature's name ("Use the Coupons
 *       button to apply a discount code."), so renaming that button silently makes this copy
 *       wrong.
 *   Q7  `currentInvoice.billDiscountAmount` is read with no null guard on `currentInvoice`.
 *       Safe today only because useCart always owns an object.
 *   Q8  Both banners hard-code `Active` badges; neither reflects any real promotion engine —
 *       there is no promotions service behind this screen at all.
 *   Q9  Always mounted (see 7), so the whole body evaluates on every parent render.
 *   None of the above is fixed here. Extraction must preserve every one of them.
 *
 * (12) PROPOSED COMPONENT LOCATION / NAME
 *   POS/features/sales/PromotionsDialog.jsx — default-exported `PromotionsDialog`, alongside
 *   the already-extracted CouponsDialog whose state it reads.
 *
 * (13) PROPOSED PROPS — exactly 6, under their original POSSales names, no spread, no memo:
 *   showPromotionsDialog, setShowPromotionsDialog, appliedCoupon, couponDiscount,
 *   currentInvoice, formatCurrency
 *
 * (14) MECHANICALLY EXTRACTABLE WITHOUT BEHAVIOURAL CHANGE? YES.
 *   No hooks, no lifecycle ownership, no refs, no effects, no orchestration, no context, no
 *   API. Every free identifier is one of the six props. `PROTOTYPE_SOURCE` below is the pinned
 *   region dedented one level inside `function PromotionsDialog({ ...6 props })`; this suite
 *   runs every behavioural assertion against BOTH the inline region and that compiled
 *   prototype, adds a DOM-parity check across all meaningful states, and mutation-tests the
 *   prototype source to prove the assertions actually bite.
 */

const PROPS = [
  'showPromotionsDialog', 'setShowPromotionsDialog',
  'appliedCoupon', 'couponDiscount',
  'currentInvoice', 'formatCurrency',
];

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

// `formatCurrency` is POSSales.jsx:1944 verbatim, wrapped so its calls are recorded.
const formatCurrencyCalls = vi.fn();
const formatCurrency = (amount) => {
  formatCurrencyCalls(amount);
  return <CurrencyAmount amount={amount} />;
};

const INVOICE = (billDiscountAmount = 0) => Object.freeze({
  items: [{ id: 'i1', name: 'Widget' }], subtotal: 200, tax: 0, total: 200, billDiscountAmount,
});

// ── harness: parent-owned state, verbatim POSSales declarations ─────────────────────────
function usePromotionsParent({ invoice, coupon, discount }) {
  // STATE-VERBATIM-START — POSSales.jsx:712-714
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [showPromotionsDialog, setShowPromotionsDialog] = useState(false);
  // STATE-VERBATIM-END
  // `currentInvoice` is owned by useCart in production (POSSales.jsx:609); here it is a fixed
  // parent value, which is all the region needs — it never writes it.
  const [currentInvoice] = useState(invoice);
  const seed = () => { setAppliedCoupon(coupon ?? null); setCouponDiscount(discount ?? 0); };
  return {
    appliedCoupon, setAppliedCoupon, couponDiscount, setCouponDiscount,
    showPromotionsDialog, setShowPromotionsDialog, currentInvoice, seed,
  };
}

function ParentProbes({ showPromotionsDialog, setShowPromotionsDialog, seed }) {
  return (
    <>
      {/* The ONLY opener — POSTouchScreen.jsx:316 `promotions` function button, verbatim action. */}
      <button data-testid="fn-promotions" onClick={() => setShowPromotionsDialog(true)}>fn</button>
      <button data-testid="seed" onClick={seed}>seed</button>
      <span data-testid="probe-open">{String(showPromotionsDialog)}</span>
    </>
  );
}

// ── reference: the CURRENT inline POSSales region, verbatim ─────────────────────────────
function InlinePromotionsHarness({ invoice = INVOICE(), coupon = null, discount = 0 }) {
  const parent = usePromotionsParent({ invoice, coupon, discount });
  const {
    showPromotionsDialog, setShowPromotionsDialog,
    appliedCoupon, couponDiscount, currentInvoice,
  } = parent;

  return (
    <div data-testid="pos-root">
      <ParentProbes {...parent} />
      {/* REGION-VERBATIM-START */}
      {/* Promotions Dialog */}
      <Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /> Active Promotions</DialogTitle>
            <DialogDescription>Current promotions available for this sale</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {appliedCoupon && (
              <div className="p-3 rounded-xl border bg-green-50 border-green-200 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1E293B]">Coupon: {appliedCoupon}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Bill discount — {formatCurrency(couponDiscount)} off applied</p>
                </div>
                <Badge className="bg-green-500 text-white text-[10px]">Active</Badge>
              </div>
            )}
            {(currentInvoice.billDiscountAmount > 0) && !appliedCoupon && (
              <div className="p-3 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1E293B]">Bill Discount</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(currentInvoice.billDiscountAmount)} off applied to this sale</p>
                </div>
                <Badge className="bg-amber-500 text-white text-[10px]">Active</Badge>
              </div>
            )}
            {!appliedCoupon && !(currentInvoice.billDiscountAmount > 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                <Zap className="h-8 w-8 opacity-30" />
                <p className="text-sm">No active promotions for this sale.</p>
                <p className="text-xs text-center">Use the Coupons button to apply a discount code.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-white" onClick={() => setShowPromotionsDialog(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── candidate: the prototype component, compiled from the SAME source bytes ─────────────
// Reassigned by the mutation safeguards; the default binding is the unmutated prototype.
let PromotionsDialog;

function PrototypePromotionsHarness({ invoice = INVOICE(), coupon = null, discount = 0 }) {
  const parent = usePromotionsParent({ invoice, coupon, discount });
  return (
    <div data-testid="pos-root">
      <ParentProbes {...parent} />
      {/* PROPOSED-CALLSITE-START — the call site the extraction would write */}
      {/* Promotions Dialog */}
      <PromotionsDialog
        showPromotionsDialog={parent.showPromotionsDialog}
        setShowPromotionsDialog={parent.setShowPromotionsDialog}
        appliedCoupon={parent.appliedCoupon}
        couponDiscount={parent.couponDiscount}
        currentInvoice={parent.currentInvoice}
        formatCurrency={formatCurrency}
      />
      {/* PROPOSED-CALLSITE-END */}
    </div>
  );
}

// ── prototype source, derived from the pinned region copy in THIS file ──────────────────
const TEST_SRC = read('./PromotionsDialog.characterization.test.jsx');
const between = (text, a, b) => {
  const i = text.indexOf(a);
  const j = text.indexOf(b, i);
  return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
};
const REGION_COPY = between(TEST_SRC, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
// Drop the leading `Promotions Dialog` comment (it would stay at the call site) and dedent by
// two spaces, so the <Dialog> lands at the four-space column a `return (` body wants.
const PROTOTYPE_BODY = REGION_COPY.split('\n').slice(1).map((l) => l.replace(/^ {2}/, '')).join('\n');
const PROTOTYPE_SOURCE = `function PromotionsDialog({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n  return (\n${PROTOTYPE_BODY}\n  );\n}\n`;

const compileAll = (sources) => {
  const script = [
    "const { transformSync } = require('esbuild');",
    "const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));",
    'const out = {};',
    "for (const [k, v] of Object.entries(input)) out[k] = transformSync(v, { loader: 'jsx', jsx: 'transform' }).code;",
    'process.stdout.write(JSON.stringify(out));',
  ].join('\n');
  const codes = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    input: JSON.stringify(sources), cwd: path.resolve(__dirname, '../../../../..'), encoding: 'utf8',
  }));
  const out = {};
  for (const [name, code] of Object.entries(codes)) {
    out[name] = new Function(
      'React', 'Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription',
      'DialogFooter', 'Button', 'Badge', 'Zap',
      `${code}\nreturn PromotionsDialog;`,
    )(React, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Badge, Zap);
  }
  return out;
};

let COMPILED = {};

beforeAll(() => {
  COMPILED = compileAll({ control: PROTOTYPE_SOURCE, ...MUTATED() });
  PromotionsDialog = COMPILED.control;
}, 60000);

afterEach(() => {
  cleanup();
  formatCurrencyCalls.mockClear();
  PromotionsDialog = COMPILED.control;
});

// ── DOM helpers ─────────────────────────────────────────────────────────────────────────
const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const press = (id) => fireEvent.click(screen.getByTestId(id));
const openDialog = () => press('fn-promotions');
const dialog = () => document.querySelector('[role="dialog"]');
const gotItBtn = () => screen.getByRole('button', { name: 'Got it' });
const text = () => (dialog() ? dialog().textContent : '');
// Radix's DialogContent always renders its own sr-only "Close" button; the region contributes
// only the footer's "Got it".
const dialogButtons = () => within(dialog()).getAllByRole('button').map((b) => b.textContent.trim()).sort();

const HARNESSES = [
  ['inline region', InlinePromotionsHarness],
  ['prototype component', PrototypePromotionsHarness],
];

// ── behaviour, run against BOTH harnesses ───────────────────────────────────────────────
describe.each(HARNESSES)('%s', (_name, Harness) => {
  const mount = (props) => render(<Harness {...props} />);

  describe('mount + open/close', () => {
    it('renders nothing visible while closed, yet is always mounted (no conditional mount)', () => {
      mount();
      expect(probe('open')).toBe('false');
      expect(dialog()).toBeNull();
      // The opener exists in the harness and the region consumed no render guard of its own.
      expect(screen.getByTestId('fn-promotions')).toBeTruthy();
    });

    it('the POSTouchScreen promotions button opens it', () => {
      mount();
      openDialog();
      expect(probe('open')).toBe('true');
      expect(dialog()).not.toBeNull();
    });

    it('shows the fixed title and description', () => {
      mount();
      openDialog();
      expect(text()).toContain('Active Promotions');
      expect(text()).toContain('Current promotions available for this sale');
    });

    it('"Got it" closes it — and is the only action in the footer', () => {
      mount();
      openDialog();
      expect(gotItBtn()).toBeTruthy();
      fireEvent.click(gotItBtn());
      expect(probe('open')).toBe('false');
      expect(dialog()).toBeNull();
    });

    it('Escape closes it through onOpenChange (Q4 — the raw boolean reaches the setter)', () => {
      mount();
      openDialog();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(probe('open')).toBe('false');
    });

    it('evaluates its body on every parent render even while CLOSED (Q9 — always mounted)', () => {
      // Not a conditional mount: the region's JSX — including the formatCurrency call inside
      // the coupon row — is constructed on every POSSales render, open or not.
      mount({ coupon: 'SAVE10', discount: 20 });
      expect(formatCurrencyCalls).not.toHaveBeenCalled(); // no coupon seeded yet
      press('seed');
      expect(probe('open')).toBe('false');
      expect(dialog()).toBeNull();
      expect(formatCurrencyCalls).toHaveBeenCalledWith(20);
    });

    it('re-opening preserves the same state — the region resets nothing (Q4)', () => {
      mount({ coupon: 'SAVE10', discount: 20 });
      press('seed');
      openDialog();
      expect(text()).toContain('Coupon: SAVE10');
      fireEvent.click(gotItBtn());
      openDialog();
      expect(text()).toContain('Coupon: SAVE10');
    });
  });

  describe('empty branch', () => {
    it('no coupon and no bill discount → the empty state', () => {
      mount();
      openDialog();
      expect(text()).toContain('No active promotions for this sale.');
      expect(text()).toContain('Use the Coupons button to apply a discount code.'); // Q6
      expect(text()).not.toContain('Bill Discount');
      expect(screen.queryByText('Active')).toBeNull();
    });

    it('a ZERO bill discount still renders the empty state, not a 0.00 row (Q3)', () => {
      mount({ invoice: INVOICE(0) });
      openDialog();
      expect(text()).toContain('No active promotions for this sale.');
      expect(screen.queryByText('Bill Discount')).toBeNull();
    });

    it('a NEGATIVE bill discount also falls through to the empty state (Q3)', () => {
      mount({ invoice: INVOICE(-5) });
      openDialog();
      expect(text()).toContain('No active promotions for this sale.');
      expect(screen.queryByText('Bill Discount')).toBeNull();
    });

    it('calls formatCurrency ZERO times in the empty branch', () => {
      mount();
      openDialog();
      expect(formatCurrencyCalls).not.toHaveBeenCalled();
    });
  });

  describe('applied-coupon branch', () => {
    it('renders the coupon row with the raw code and an Active badge', () => {
      mount({ coupon: 'WELCOME20', discount: 40 });
      press('seed');
      openDialog();
      expect(text()).toContain('Coupon: WELCOME20');
      expect(text()).toContain('off applied');
      expect(screen.getByText('Active')).toBeTruthy();
      expect(text()).not.toContain('No active promotions for this sale.');
    });

    it('the amount comes from couponDiscount, NOT currentInvoice.billDiscountAmount (Q2)', () => {
      // A deliberately DRIFTED pair: the cart says 99, the coupon store says 40.
      mount({ invoice: INVOICE(99), coupon: 'WELCOME20', discount: 40 });
      press('seed');
      // Discard the pre-seed render's calls: before `seed` there is no coupon, so the harness
      // legitimately passes through the bill-discount branch once.
      formatCurrencyCalls.mockClear();
      openDialog();
      // The call COUNT is not 1 — the region is always mounted, so its body re-evaluates on
      // every parent render (Q9). What is pinned is the ARGUMENT: only couponDiscount.
      expect(formatCurrencyCalls.mock.calls.length).toBeGreaterThan(0);
      expect(new Set(formatCurrencyCalls.mock.calls.map(([a]) => a))).toEqual(new Set([40]));
      expect(text()).toContain('40.00');
      expect(text()).not.toContain('99.00');
    });

    it('a coupon HIDES a concurrent manual bill discount (Q1)', () => {
      mount({ invoice: INVOICE(35), coupon: 'SAVE10', discount: 20 });
      press('seed');
      openDialog();
      expect(text()).toContain('Coupon: SAVE10');
      expect(screen.queryByText('Bill Discount')).toBeNull();
      expect(screen.getAllByText('Active')).toHaveLength(1);
      expect(text()).not.toContain('35.00');
    });

    it('a zero couponDiscount still renders the row, showing 0.00 (Q8 — no engine behind it)', () => {
      mount({ coupon: 'FREEBIE', discount: 0 });
      press('seed');
      openDialog();
      expect(text()).toContain('Coupon: FREEBIE');
      expect(text()).toContain('0.00');
      expect(text()).not.toContain('No active promotions for this sale.');
    });

    it('is read-only — no Remove / Apply / edit control exists (Q5)', () => {
      mount({ coupon: 'SAVE10', discount: 20 });
      press('seed');
      openDialog();
      ['Remove', 'Apply', 'Apply Coupon', 'Cancel', 'Clear'].forEach((label) => {
        expect(screen.queryByRole('button', { name: label })).toBeNull();
      });
      // Exactly one region-owned button inside the dialog: the footer's "Got it".
      expect(dialogButtons()).toEqual(['Close', 'Got it']);
    });
  });

  describe('bill-discount branch', () => {
    it('no coupon but a positive bill discount → the amber Bill Discount row', () => {
      mount({ invoice: INVOICE(35) });
      openDialog();
      expect(screen.getByText('Bill Discount')).toBeTruthy();
      expect(text()).toContain('off applied to this sale');
      expect(text()).toContain('35.00');
      expect(screen.getByText('Active')).toBeTruthy();
      expect(text()).not.toContain('No active promotions for this sale.');
      expect(text()).not.toContain('Coupon:');
    });

    it('formats exactly the invoice amount and nothing else', () => {
      mount({ invoice: INVOICE(12.5) });
      openDialog();
      expect(formatCurrencyCalls.mock.calls.length).toBeGreaterThan(0);
      expect(new Set(formatCurrencyCalls.mock.calls.map(([a]) => a))).toEqual(new Set([12.5]));
      expect(text()).toContain('12.50');
    });

    it('a non-numeric-but-truthy bill discount still passes the `> 0` gate (Q7 — no coercion guard)', () => {
      mount({ invoice: INVOICE('7') });
      openDialog();
      expect(screen.getByText('Bill Discount')).toBeTruthy();
      expect(text()).toContain('7.00');
    });
  });
});

// ── DOM parity: inline region vs prototype, across every meaningful state ───────────────
describe('DOM parity', () => {
  const snapshot = (Harness, props, steps) => {
    const { unmount } = render(<Harness {...props} />);
    steps();
    const html = dialog() ? dialog().outerHTML : '<<closed>>';
    unmount();
    cleanup();
    formatCurrencyCalls.mockClear();
    return html;
  };
  const SCENARIOS = {
    closed: [{}, () => {}],
    'empty state': [{}, () => { openDialog(); }],
    'zero bill discount': [{ invoice: INVOICE(0) }, () => { openDialog(); }],
    'bill discount only': [{ invoice: INVOICE(35) }, () => { openDialog(); }],
    'coupon only': [{ coupon: 'SAVE10', discount: 20 }, () => { press('seed'); openDialog(); }],
    'coupon + bill discount (Q1)': [
      { invoice: INVOICE(35), coupon: 'SAVE10', discount: 20 },
      () => { press('seed'); openDialog(); },
    ],
    'drifted coupon amount (Q2)': [
      { invoice: INVOICE(99), coupon: 'WELCOME20', discount: 40 },
      () => { press('seed'); openDialog(); },
    ],
    'reopened after Got it': [
      { coupon: 'SAVE10', discount: 20 },
      () => { press('seed'); openDialog(); fireEvent.click(gotItBtn()); openDialog(); },
    ],
  };

  it.each(Object.keys(SCENARIOS))('renders identical DOM — %s', (name) => {
    const [props, steps] = SCENARIOS[name];
    const a = snapshot(InlinePromotionsHarness, props, steps);
    const b = snapshot(PrototypePromotionsHarness, props, steps);
    const strip = (s) => s.replace(/(id|aria-labelledby|aria-describedby)="radix-[^"]*"/g, '$1="radix"');
    expect(strip(b)).toBe(strip(a));
  });
});

// ── source contract: the inline region is still exactly what this suite characterized ───
describe('source contract', () => {
  const PARENT = read('../../POSSales.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const FUNCS = read('../lib/posFunctionButtons.jsx');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* Promotions Dialog */}';
  const START = LINES.indexOf(ANCHOR);
  const END = LINES.indexOf('      </Dialog>', START);
  const LIVE_REGION = LINES.slice(START, END + 1).join('\n');
  const sha = (t) => crypto.createHash('sha256').update(`${t}\n`).digest('hex');

  it('finds the region exactly once, at the pinned boundary', () => {
    expect(START).toBeGreaterThan(-1);
    expect(LINES.indexOf(ANCHOR, START + 1)).toBe(-1);
    expect(START + 1).toBe(9311); // 1-indexed line 9311 (P2 overlay declarations: +30; P2.6 scanner-field import: +1; P3 shortcuts: +11)
    expect(END + 1).toBe(9349);
    expect(LIVE_REGION.split('\n')).toHaveLength(39);
  });

  it('pins the region content — 39 lines and the exact sha256', () => {
    const l = LIVE_REGION.split('\n');
    expect(l[0]).toBe(ANCHOR);
    expect(l[1]).toBe('      <Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>');
    expect(l[2]).toBe('        <DialogContent className="max-w-md bg-white">');
    expect(l[38]).toBe('      </Dialog>');
    expect(sha(LIVE_REGION)).toBe('056496812d31fe18ddd3af6adb17f4f4f11a024ac2d60228b195e071c1109399');
    expect(sha(l.slice(1).join('\n'))).toBe('2b56cc5ba93c74fec5d09587187ceb007f4f23cf43b3708e30caaf724423de6d');
  });

  it('the verbatim copy in THIS file is byte-identical to the live region', () => {
    expect(REGION_COPY).toBe(LIVE_REGION);
  });

  it('the immediate neighbours are the extracted CouponsDialog call site and Save as Order', () => {
    expect(LINES[START - 1]).toBe('');
    expect(LINES[START - 2]).toBe('      />');
    expect(LINES.slice(0, START).lastIndexOf('      {/* Coupons Dialog */}')).toBeGreaterThan(-1);
    expect(LINES.slice(0, START)).toContain('      <CouponsDialog');
    expect(LINES[END + 1]).toBe('');
    expect(LINES[END + 2]).toBe('      {/* Save as Order Dialog */}');
  });

  it('the region declares no hooks, refs, effects, context, portal, timer or API call', () => {
    [
      'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useMemo', 'useCallback',
      'useContext', 'createPortal', 'setTimeout', 'setInterval', 'addEventListener',
      'await ', 'async ', 'Api.', 'fetch(', 'axios', '.then(', 'const ', 'let ',
    ].forEach((token) => expect(LIVE_REGION, token).not.toContain(token));
    // No IIFE and no list rendering, so no `key` and no render-body local scope either.
    expect(LIVE_REGION).not.toContain('(() => {');
    expect(LIVE_REGION).not.toContain(' key=');
    expect(LIVE_REGION).not.toContain('.map(');
  });

  it('the region is ALWAYS MOUNTED — Radix `open=`, never a conditional mount', () => {
    expect(LIVE_REGION).toContain('<Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>');
    expect(PARENT).not.toContain('{showPromotionsDialog && ');
  });

  it('the dependency surface is exactly the 6 proposed props', () => {
    expect(PROPS).toHaveLength(6);
    PROPS.forEach((p) => expect(LIVE_REGION, p).toContain(p));
    // Every expression container in the region, in source order — the COMPLETE binding surface.
    const EXPRESSIONS = [
      '{showPromotionsDialog}',
      '{setShowPromotionsDialog}',
      '{appliedCoupon && (',
      '{appliedCoupon}',
      '{formatCurrency(couponDiscount)}',
      '{(currentInvoice.billDiscountAmount > 0) && !appliedCoupon && (',
      '{formatCurrency(currentInvoice.billDiscountAmount)}',
      '{!appliedCoupon && !(currentInvoice.billDiscountAmount > 0) && (',
      '{() => setShowPromotionsDialog(false)}',
    ];
    EXPRESSIONS.forEach((e) => expect(LIVE_REGION, e).toContain(e));
    // No other POSSales binding leaks in: no cart writer, no session, no terminal, no
    // customer, no settings, no api, and none of the coupon setters.
    [
      'setCurrentInvoice', 'recalculateInvoice', 'showFeedback', 'setAppliedCoupon',
      'setCouponDiscount', 'couponCode', 'currentSession', 'currentTerminal', 'posSettings',
      'selectedCustomerData', 'clearInvoice', 'syncPosData', 'activeCurrency',
    ].forEach((n) => expect(LIVE_REGION, n).not.toContain(n));
  });

  it('`Zap` is used ONLY by this region in POSSales — it becomes the child\'s import', () => {
    const zapLines = LINES.map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('Zap'));
    expect(zapLines.map(([n]) => n)).toEqual([104, 9315, 9339]);
    expect(LINES[103]).toBe('  Zap,'); // the lucide import entry, line 104
    expect(LIVE_REGION.split('<Zap ').length - 1).toBe(2);
  });

  it('`Badge` is NOT exclusive and must stay imported by POSSales', () => {
    expect(PARENT.split('<Badge').length - 1).toBeGreaterThan(2);
  });

  it('appliedCoupon / couponDiscount are SHARED with the extracted CouponsDialog', () => {
    // They cannot move into the extracted child — the sibling call site reads them too.
    expect(PARENT).toContain('        appliedCoupon={appliedCoupon}');
    expect(PARENT).toContain('        couponDiscount={couponDiscount}');
    expect(PARENT).toContain('  const [appliedCoupon, setAppliedCoupon] = useState(null);');
    expect(PARENT).toContain('  const [couponDiscount, setCouponDiscount] = useState(0);');
  });

  it('setShowPromotionsDialog is owned by POSSales and handed to the templates', () => {
    expect(PARENT).toContain('  const [showPromotionsDialog, setShowPromotionsDialog] = useState(false);');
    expect(PARENT).toContain('setShowCouponsDialog, setShowPromotionsDialog, setShowPriceCheck, setPriceCheckQuery,');
    expect(FUNCS).toContain("action: () => setShowPromotionsDialog(true) }");
    // The ONLY opener in the whole POS surface — one shared definition, every template.
    expect(FUNCS.split('setShowPromotionsDialog(true)').length - 1).toBe(1);
    expect(TOUCH).not.toContain('setShowPromotionsDialog(true)');
  });

  it('NO production change has been made — no PromotionsDialog component or import exists yet', () => {
    expect(PARENT).not.toContain('<PromotionsDialog');
    expect(PARENT).not.toContain("from './POS/features/sales/PromotionsDialog'");
    expect(fs.existsSync(path.resolve(__dirname, '../features/sales/PromotionsDialog.jsx'))).toBe(false);
  });

  it('the prototype IS the pinned region under exactly the 6 props, nothing more', () => {
    expect(PROTOTYPE_SOURCE).toBe(
      `function PromotionsDialog({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n  return (\n${PROTOTYPE_BODY}\n  );\n}\n`,
    );
    expect(PROTOTYPE_SOURCE).not.toContain('...props');
    expect(PROTOTYPE_SOURCE).not.toContain('{...');
    expect(PROTOTYPE_SOURCE).not.toContain('memo(');
    // Dedent-only: the region body survives the move byte-for-byte modulo two leading spaces.
    expect(PROTOTYPE_BODY).toBe(LIVE_REGION.split('\n').slice(1).map((l) => l.replace(/^ {2}/, '')).join('\n'));
  });
});

// ── mutation safeguards: prove the assertions above actually bite ───────────────────────
const MUTANTS = {
  couponStopsHidingBillDiscount: (s) => s.replace('{(currentInvoice.billDiscountAmount > 0) && !appliedCoupon && (', '{(currentInvoice.billDiscountAmount > 0) && ('),
  couponAmountFromInvoice: (s) => s.replace('{formatCurrency(couponDiscount)}', '{formatCurrency(currentInvoice.billDiscountAmount)}'),
  zeroDiscountShowsRow: (s) => s.replace('{(currentInvoice.billDiscountAmount > 0) && !appliedCoupon && (', '{(currentInvoice.billDiscountAmount >= 0) && !appliedCoupon && ('),
  emptyStateAlsoWhenDiscounted: (s) => s.replace('{!appliedCoupon && !(currentInvoice.billDiscountAmount > 0) && (', '{!appliedCoupon && ('),
  gotItDoesNotClose: (s) => s.replace('onClick={() => setShowPromotionsDialog(false)}', 'onClick={() => {}}'),
  onOpenChangeDropped: (s) => s.replace('onOpenChange={setShowPromotionsDialog}', 'onOpenChange={() => {}}'),
  couponLabelCopy: (s) => s.replace('Coupon: {appliedCoupon}', 'Coupon {appliedCoupon}'),
  billDiscountLabelCopy: (s) => s.replace('>Bill Discount</p>', '>Bill discount</p>'),
  emptyCopy: (s) => s.replace('No active promotions for this sale.', 'No active promotions.'),
  couponsHintDropped: (s) => s.replace('Use the Coupons button to apply a discount code.', 'Nothing to show.'),
  activeBadgeCopy: (s) => s.replace(/>Active<\/Badge>/g, '>ACTIVE</Badge>'),
  extraFooterButton: (s) => s.replace('\n        </DialogFooter>', '\n          <Button onClick={() => {}}>Remove</Button>\n        </DialogFooter>'),
};

const MUTATED = () => {
  const out = {};
  for (const [name, mutate] of Object.entries(MUTANTS)) out[name] = mutate(PROTOTYPE_SOURCE);
  return out;
};

describe('mutation safeguards', () => {
  it('every mutation actually applies to the prototype source', () => {
    for (const [name, mutate] of Object.entries(MUTANTS)) {
      expect(mutate(PROTOTYPE_SOURCE), `${name} must change the source`).not.toBe(PROTOTYPE_SOURCE);
    }
  });

  const renderProto = (props) => render(<PrototypePromotionsHarness {...props} />);
  const CHECKS = {
    q1CouponHidesBillDiscount: () => {
      renderProto({ invoice: INVOICE(35), coupon: 'SAVE10', discount: 20 });
      press('seed'); openDialog();
      expect(screen.queryByText('Bill Discount')).toBeNull();
      expect(screen.getAllByText('Active')).toHaveLength(1);
    },
    q2AmountFromCouponDiscount: () => {
      renderProto({ invoice: INVOICE(99), coupon: 'WELCOME20', discount: 40 });
      press('seed'); openDialog();
      expect(formatCurrencyCalls).toHaveBeenCalledWith(40);
      expect(text()).toContain('40.00');
    },
    q3ZeroDiscountIsEmpty: () => {
      renderProto({ invoice: INVOICE(0) });
      openDialog();
      expect(screen.queryByText('Bill Discount')).toBeNull();
      expect(text()).toContain('No active promotions for this sale.');
    },
    emptyStateHiddenWhenDiscounted: () => {
      renderProto({ invoice: INVOICE(35) });
      openDialog();
      expect(text()).not.toContain('No active promotions for this sale.');
      expect(screen.getByText('Bill Discount')).toBeTruthy();
    },
    gotItCloses: () => {
      renderProto();
      openDialog();
      fireEvent.click(gotItBtn());
      expect(probe('open')).toBe('false');
    },
    escapeCloses: () => {
      renderProto();
      openDialog();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(probe('open')).toBe('false');
    },
    couponRowCopy: () => {
      renderProto({ coupon: 'SAVE10', discount: 20 });
      press('seed'); openDialog();
      expect(text()).toContain('Coupon: SAVE10');
    },
    billDiscountRowCopy: () => {
      renderProto({ invoice: INVOICE(35) });
      openDialog();
      expect(screen.getByText('Bill Discount')).toBeTruthy();
    },
    emptyCopyExact: () => {
      renderProto();
      openDialog();
      expect(text()).toContain('No active promotions for this sale.');
    },
    couponsHintPresent: () => {
      renderProto();
      openDialog();
      expect(text()).toContain('Use the Coupons button to apply a discount code.');
    },
    activeBadgeExact: () => {
      renderProto({ invoice: INVOICE(35) });
      openDialog();
      expect(screen.getByText('Active')).toBeTruthy();
    },
    readOnlySingleButton: () => {
      renderProto({ coupon: 'SAVE10', discount: 20 });
      press('seed'); openDialog();
      expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
      expect(dialogButtons()).toEqual(['Close', 'Got it']);
    },
  };

  const EXPECTED = {
    control: [],
    couponStopsHidingBillDiscount: ['q1CouponHidesBillDiscount'],
    couponAmountFromInvoice: ['q2AmountFromCouponDiscount'],
    zeroDiscountShowsRow: ['q3ZeroDiscountIsEmpty'],
    emptyStateAlsoWhenDiscounted: ['emptyStateHiddenWhenDiscounted'],
    gotItDoesNotClose: ['gotItCloses'],
    onOpenChangeDropped: ['escapeCloses'],
    couponLabelCopy: ['couponRowCopy'],
    billDiscountLabelCopy: ['billDiscountRowCopy', 'emptyStateHiddenWhenDiscounted'],
    emptyCopy: ['emptyCopyExact', 'q3ZeroDiscountIsEmpty'],
    couponsHintDropped: ['couponsHintPresent'],
    activeBadgeCopy: ['activeBadgeExact', 'q1CouponHidesBillDiscount'],
    extraFooterButton: ['readOnlySingleButton'],
  };

  const passes = (check) => {
    try {
      check();
      return true;
    } catch {
      return false;
    } finally {
      cleanup();
      formatCurrencyCalls.mockClear();
    }
  };

  it.each(['control', ...Object.keys(MUTANTS)])('%s — the suite reacts exactly as expected', (mutant) => {
    PromotionsDialog = COMPILED[mutant];
    const failed = Object.entries(CHECKS).filter(([, c]) => !passes(c)).map(([n]) => n);
    expect(failed.sort()).toEqual([...EXPECTED[mutant]].sort());
  });
});
