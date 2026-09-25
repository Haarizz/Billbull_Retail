import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CheckCircle, Tag } from 'lucide-react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Button } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { CurrencyAmount } from '../POSCurrency';
import RealCouponsDialog from '../features/sales/CouponsDialog';

/**
 * REGRESSION — the extracted POS/features/sales/CouponsDialog. POST-EXTRACTION.
 *
 * The region below (REGION-VERBATIM) is the ORIGINAL inline POSSales.jsx:9121-9191 block, kept
 * here verbatim as the pinned behavioural reference. Every behavioural describe runs against
 * BOTH that pinned inline reference AND the real extracted component, so the suite proves the
 * move was behaviour-preserving and keeps proving it.
 *
 * SOURCE BOUNDARY (the region this component was extracted from, pinned below)
 *   POSSales.jsx:9121-9191 as it stood BEFORE the extraction — 71 lines, sha256(LF-normalised)
 *   56ef848f0ac47f2650f01d95ff108a6c296155761b3b8bd828b7024c6799b342
 *   9121  the `Coupons Dialog` comment
 *   9122  <Dialog open={showCouponsDialog} onOpenChange={...}>
 *   9191  the closing </Dialog>
 *   It now lives in POS/features/sales/CouponsDialog.jsx; POSSales keeps the `Coupons Dialog`
 *   comment above an UNCONDITIONAL <CouponsDialog ... /> call site. Neighbours are untouched:
 *   the Reprint Confirm Popup still sits immediately before it and the Promotions Dialog
 *   immediately after.
 *   The component is ALWAYS MOUNTED — `open={showCouponsDialog}` on a Radix Dialog, not a
 *   `{showCouponsDialog && ...}` conditional mount, and the call site carries no mount guard
 *   either. That is a real ownership fact: the dialog body re-renders with the parent on every
 *   POSSales render even while closed.
 *
 * DEPENDENCY SURFACE — 13 POSSales bindings, all free identifiers in the region:
 *   state    showCouponsDialog, couponCode, appliedCoupon, couponDiscount, currentInvoice
 *   setters  setShowCouponsDialog, setCouponCode, setAppliedCoupon, setCouponDiscount,
 *            setCurrentInvoice
 *   helpers  recalculateInvoice (useCart), showFeedback (POSSales:638 useCallback),
 *            formatCurrency    (POSSales:1915, an arrow returning <CurrencyAmount amount=... />)
 *   module imports only: ui/dialog (Dialog, DialogContent, DialogHeader, DialogTitle,
 *            DialogDescription, DialogFooter), ui/button Button, ui/input Input,
 *            ui/label Label, lucide `Tag` and `CheckCircle`.
 *
 * HOOKS / LIFECYCLE: none. No useState, useEffect, useRef, useMemo, useCallback, context,
 * portal of its own, timer or subscription is declared inside the region. The two
 * `COUPON_RULES` arrays are re-created on every render; the render-body IIFE at 9127 is a
 * plain expression, not a component, so it holds no state across renders.
 *
 * API / SERVICE CALLS: none. The region performs no network I/O at all.
 *
 * STATE OWNERSHIP — all four coupon useStates are declared together at POSSales.jsx:706-709
 * and MUST stay in the parent:
 *   - showCouponsDialog / couponCode are read ONLY by this region,
 *   - appliedCoupon / couponDiscount are ALSO read by the sibling Promotions Dialog
 *     (POSSales.jsx:9201, 9204, 9205, 9210, 9219), so moving them into the extracted child
 *     would break that neighbour. They stay parent-owned; the child receives them as props.
 *   - `setShowCouponsDialog` is additionally handed to POSTouchScreen through
 *     `touchScreenProps` (POSSales.jsx:7043).
 *
 * CROSS-FEATURE HANDOFFS: the region writes the CART through
 * `setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt))` — a functional
 * update, so it is safe to call from a child, but it is a genuine cart mutation and the
 * characterization pins the exact call shape (`prev.items`, second positional argument).
 *
 * THE ONLY OPENER: POSTouchScreen.jsx:206, the `coupons` function button,
 * `action: () => setShowCouponsDialog(true)`. It resets NOTHING — see quirks.
 *
 * KNOWN QUIRKS pinned as-is (extraction must preserve, do NOT fix here):
 *   Q1  COUPON_RULES is declared TWICE — once inside the body IIFE (with `label`) and once
 *       inside the footer button's onClick (without `label`). Two independent literals.
 *   Q2  The two apply paths emit DIFFERENT success copy for the same coupon. The IIFE/Enter
 *       path formats the percentage through a percent/AED ternary; the footer path hardcodes
 *       a `%` suffix. Both currently render "10% off" because every rule is `percent` — the
 *       `'AED '` branch is DEAD CODE.
 *   Q3  Enter on an UNKNOWN code silently does nothing (`if (!matched) return;`), while the
 *       footer button reports `Unknown coupon code: X`. Same input, two behaviours.
 *   Q4  `applyAndClose` (the IIFE's Enter handler) is never wired to any button; the footer
 *       button duplicates its logic instead of calling it.
 *   Q5  Neither apply path clears `couponCode`. Only `onOpenChange(false)` does — so Escape
 *       and the overlay clear the field, but Cancel and both apply paths leave it set.
 *   Q6  The opener does not reset `couponCode`, so a code left behind by Cancel/apply is
 *       still in the box the next time the dialog opens.
 *   Q7  "Remove" clears appliedCoupon/couponDiscount/couponCode and recalculates with 0, but
 *       emits NO feedback and leaves the dialog open.
 *   Q8  The discount base is `currentInvoice.subtotal || 0` — pre-tax, and 0 when subtotal is
 *       absent, which silently applies a 0.00 coupon rather than refusing.
 *   Q9  `setCouponDiscount` and the cart recalculation are two separate stores of the same
 *       number; nothing keeps them in sync afterwards.
 *   Q10 Applying a second coupon overwrites the first — `recalculateInvoice` is always called
 *       with the NEW discount against the raw items, never compounded.
 *   Q11 The footer Apply button is disabled on empty `couponCode` only; whitespace is not
 *       trimmed and no rule can ever match a padded code.
 *
 * MECHANICAL MOVE: the extraction was purely syntactic. `PROTOTYPE_SOURCE` below is the pinned
 * region body re-indented one level inside a module-level function taking exactly the 13 props;
 * the source contract asserts the real CouponsDialog.jsx body is EXACTLY that text, and every
 * behavioural describe runs against both the pinned inline region and the real component.
 *
 * EXTRACTED component: POS/features/sales/CouponsDialog.jsx — `CouponsDialog` with the 13 props
 * above under their original POSSales names, no spread, no memo, no local state. Its body is
 * byte-identical to the pinned region (dedented one level), which the source contract asserts.
 */

const PROPS = [
  'showCouponsDialog', 'setShowCouponsDialog',
  'couponCode', 'setCouponCode',
  'appliedCoupon', 'setAppliedCoupon',
  'couponDiscount', 'setCouponDiscount',
  'currentInvoice', 'setCurrentInvoice',
  'recalculateInvoice', 'formatCurrency', 'showFeedback',
];

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

// ── injected POSSales helpers ───────────────────────────────────────────────────────────
// `formatCurrency` is POSSales.jsx:1915 verbatim. `recalculateInvoice` and `showFeedback` are
// recording stubs: the region only forwards to them, and their real behaviour is already
// characterized by useCart / PosFeedbackToasts.
const recalculateInvoice = vi.fn((items, billDiscountAmount = 0) => ({
  items, billDiscountAmount, subtotal: 200, tax: 0, total: 999, recalculated: true,
}));
const showFeedback = vi.fn();
const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;

const INITIAL_INVOICE = Object.freeze({
  items: [{ id: 'i1', name: 'Widget' }], subtotal: 200, tax: 0, total: 999, billDiscountAmount: 0,
});

// ── harness: parent-owned state, verbatim POSSales declarations ─────────────────────────
function useCouponsParent(initialInvoice) {
  // STATE-VERBATIM-START
  const [showCouponsDialog, setShowCouponsDialog] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  // STATE-VERBATIM-END
  const [currentInvoice, setCurrentInvoice] = useState(initialInvoice);
  return {
    showCouponsDialog, setShowCouponsDialog,
    couponCode, setCouponCode,
    appliedCoupon, setAppliedCoupon,
    couponDiscount, setCouponDiscount,
    currentInvoice, setCurrentInvoice,
  };
}

function ParentProbes({
  showCouponsDialog, setShowCouponsDialog,
  couponCode, setCouponCode,
  appliedCoupon, setAppliedCoupon,
  couponDiscount, setCouponDiscount,
  currentInvoice,
}) {
  return (
    <>
      {/* The ONLY opener — POSTouchScreen.jsx:206 `coupons` function button, verbatim action. */}
      <button data-testid="fn-coupons" onClick={() => setShowCouponsDialog(true)}>fn</button>
      <button data-testid="raw-set-code" onClick={() => setCouponCode('MEMBER15')}>code</button>
      <button data-testid="raw-set-applied" onClick={() => { setAppliedCoupon('SAVE10'); setCouponDiscount(20); }}>applied</button>
      <span data-testid="probe-open">{String(showCouponsDialog)}</span>
      <span data-testid="probe-code">{couponCode}</span>
      <span data-testid="probe-applied">{String(appliedCoupon)}</span>
      <span data-testid="probe-discount">{String(couponDiscount)}</span>
      <span data-testid="probe-invoice">{`${String(currentInvoice.billDiscountAmount)}|${String(currentInvoice.recalculated)}`}</span>
    </>
  );
}

// ── reference: the CURRENT inline POSSales region, verbatim ─────────────────────────────
function InlineCouponsHarness({ invoice = INITIAL_INVOICE }) {
  const parent = useCouponsParent(invoice);
  const {
    showCouponsDialog, setShowCouponsDialog,
    couponCode, setCouponCode,
    appliedCoupon, setAppliedCoupon,
    couponDiscount, setCouponDiscount,
    currentInvoice, setCurrentInvoice,
  } = parent;

  return (
    <div data-testid="pos-root">
      <ParentProbes {...parent} />
      {/* REGION-VERBATIM-START */}
      {/* Coupons Dialog */}
      <Dialog open={showCouponsDialog} onOpenChange={v => { if (!v) { setShowCouponsDialog(false); setCouponCode(''); } }}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-pink-500" /> Apply Coupon</DialogTitle>
            <DialogDescription>Enter a coupon code to apply a discount to the current sale.</DialogDescription>
          </DialogHeader>
          {(() => {
            const COUPON_RULES = [
              { code: 'SAVE10', label: 'SAVE10 — 10% off', type: 'percent', value: 10 },
              { code: 'WELCOME20', label: 'WELCOME20 — 20% off first purchase', type: 'percent', value: 20 },
              { code: 'MEMBER15', label: 'MEMBER15 — 15% for members', type: 'percent', value: 15 },
            ];
            const matched = COUPON_RULES.find(r => r.code === couponCode);
            const applyAndClose = () => {
              if (!matched) return;
              const subtotal = currentInvoice.subtotal || 0;
              const discountAmt = matched.type === 'percent' ? subtotal * matched.value / 100 : matched.value;
              setAppliedCoupon(matched.code);
              setCouponDiscount(discountAmt);
              setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));
              setShowCouponsDialog(false);
              showFeedback('success', `Coupon ${matched.code} applied — ${matched.type === 'percent' ? matched.value + '%' : 'AED ' + matched.value} off`);
            };
            return (
              <div className="space-y-3 py-2">
                <Label>Coupon Code</Label>
                <Input placeholder="e.g. SAVE10, WELCOME20..." value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') applyAndClose(); }} />
                {appliedCoupon && (
                  <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" />Coupon "{appliedCoupon}" applied — {formatCurrency(couponDiscount)} off</span>
                    <button type="button" className="text-red-400 hover:text-red-600 text-[10px] font-bold" onClick={() => {
                      setAppliedCoupon(null); setCouponDiscount(0);
                      setCurrentInvoice(prev => recalculateInvoice(prev.items, 0));
                      setCouponCode('');
                    }}>Remove</button>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-semibold">Available Coupons</p>
                  {COUPON_RULES.map(c => (
                    <button key={c.code} type="button" onClick={() => setCouponCode(c.code)}
                      className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${couponCode === c.code ? 'bg-pink-100 border-pink-300 text-pink-800' : 'bg-pink-50 hover:bg-pink-100 border-pink-100 text-pink-700'}`}>{c.label}</button>
                  ))}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCouponsDialog(false)}>Cancel</Button>
            <Button className="bg-pink-500 hover:bg-pink-600 text-white" disabled={!couponCode} onClick={() => {
              const COUPON_RULES = [
                { code: 'SAVE10', type: 'percent', value: 10 },
                { code: 'WELCOME20', type: 'percent', value: 20 },
                { code: 'MEMBER15', type: 'percent', value: 15 },
              ];
              const matched = COUPON_RULES.find(r => r.code === couponCode);
              if (!matched) { showFeedback('error', `Unknown coupon code: ${couponCode}`); return; }
              const subtotal = currentInvoice.subtotal || 0;
              const discountAmt = matched.type === 'percent' ? subtotal * matched.value / 100 : matched.value;
              setAppliedCoupon(matched.code); setCouponDiscount(discountAmt);
              setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));
              setShowCouponsDialog(false);
              showFeedback('success', `Coupon ${matched.code} applied — ${matched.value}% off`);
            }}>
              Apply Coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── the REAL extracted component ────────────────────────────────────────────────────────
// Rebound to compiled mutants by the mutation safeguards only.
let CouponsDialog = RealCouponsDialog;

function ExtractedCouponsHarness({ invoice = INITIAL_INVOICE }) {
  const parent = useCouponsParent(invoice);
  return (
    <div data-testid="pos-root">
      <ParentProbes {...parent} />
      {/* EXTRACTED-CALLSITE-START */}
      {/* Coupons Dialog */}
      <CouponsDialog
        showCouponsDialog={parent.showCouponsDialog}
        setShowCouponsDialog={parent.setShowCouponsDialog}
        couponCode={parent.couponCode}
        setCouponCode={parent.setCouponCode}
        appliedCoupon={parent.appliedCoupon}
        setAppliedCoupon={parent.setAppliedCoupon}
        couponDiscount={parent.couponDiscount}
        setCouponDiscount={parent.setCouponDiscount}
        currentInvoice={parent.currentInvoice}
        setCurrentInvoice={parent.setCurrentInvoice}
        recalculateInvoice={recalculateInvoice}
        formatCurrency={formatCurrency}
        showFeedback={showFeedback}
      />
      {/* EXTRACTED-CALLSITE-END */}
    </div>
  );
}

// ── expected component source, derived from the pinned region copy in THIS file ─────────
const TEST_SRC = read('./CouponsDialog.characterization.test.jsx');
const between = (text, a, b) => {
  const i = text.indexOf(a);
  const j = text.indexOf(b, i);
  return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
};
const REGION_COPY = between(TEST_SRC, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
// Drop the leading `Coupons Dialog` comment (it stays at the call site) and dedent by two
// spaces, so the <Dialog> lands at the four-space column a `return (` body wants.
const PROTOTYPE_BODY = REGION_COPY.split('\n').slice(1).map((l) => l.replace(/^ {2}/, '')).join('\n');
const PROTOTYPE_SOURCE = `function CouponsDialog({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n  return (\n${PROTOTYPE_BODY}\n  );\n}\n`;

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
      'DialogFooter', 'Button', 'Input', 'Label', 'Tag', 'CheckCircle',
      `${code}\nreturn CouponsDialog;`,
    )(React, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Label, Tag, CheckCircle);
  }
  return out;
};

// The REAL component's source, imports and default export stripped, so the mutation safeguards
// mutate and compile the SHIPPED text rather than a paper prototype.
const COMPONENT_SRC = read('../features/sales/CouponsDialog.jsx');
const EXTRACTED_SOURCE = COMPONENT_SRC
  .slice(COMPONENT_SRC.indexOf('function CouponsDialog({'))
  .replace(/\nexport default CouponsDialog;\n$/, '');

afterEach(() => {
  cleanup();
  recalculateInvoice.mockClear();
  showFeedback.mockClear();
  CouponsDialog = RealCouponsDialog;
});

// ── DOM helpers ─────────────────────────────────────────────────────────────────────────
const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const press = (id) => fireEvent.click(screen.getByTestId(id));
const openDialog = () => press('fn-coupons');
const dialog = () => document.querySelector('[role="dialog"]');
const codeInput = () => screen.getByPlaceholderText('e.g. SAVE10, WELCOME20...');
const chip = (label) => screen.getByRole('button', { name: label });
const applyBtn = () => screen.getByRole('button', { name: 'Apply Coupon' });
const cancelBtn = () => within(dialog()).getByRole('button', { name: 'Cancel' });
const removeBtn = () => screen.getByRole('button', { name: 'Remove' });
const type = (value) => fireEvent.change(codeInput(), { target: { value } });

const HARNESSES = [
  ['inline region', InlineCouponsHarness],
  ['prototype component', ExtractedCouponsHarness],
];

// ── behaviour, run against BOTH harnesses ───────────────────────────────────────────────
describe.each(HARNESSES)('%s', (_name, Harness) => {
  const mount = (props) => render(<Harness {...props} />);

  describe('mount + open/close', () => {
    it('renders no dialog while closed, but is always mounted (no conditional mount)', () => {
      mount();
      expect(dialog()).toBeNull();
      expect(probe('open')).toBe('false');
      expect(screen.queryByText('Apply Coupon')).toBeNull();
    });

    it('the touch-screen function button opens it and resets nothing (Q6)', () => {
      mount();
      press('raw-set-code');
      openDialog();
      expect(dialog()).not.toBeNull();
      expect(codeInput()).toHaveValue('MEMBER15');
    });

    it('renders the header, description, label and the three available coupons', () => {
      mount();
      openDialog();
      expect(screen.getByRole('heading', { name: 'Apply Coupon' })).toBeInTheDocument();
      expect(screen.getByText('Enter a coupon code to apply a discount to the current sale.')).toBeInTheDocument();
      expect(screen.getByText('Coupon Code')).toBeInTheDocument();
      expect(screen.getByText('Available Coupons')).toBeInTheDocument();
      ['SAVE10 — 10% off', 'WELCOME20 — 20% off first purchase', 'MEMBER15 — 15% for members']
        .forEach((l) => expect(chip(l)).toBeInTheDocument());
    });

    it('Escape closes AND clears the code (onOpenChange path, Q5)', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
      expect(probe('open')).toBe('false');
      expect(probe('code')).toBe('');
    });

    it('Cancel closes but LEAVES the code behind (Q5)', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.click(cancelBtn());
      expect(probe('open')).toBe('false');
      expect(probe('code')).toBe('SAVE10');
      expect(showFeedback).not.toHaveBeenCalled();
      expect(recalculateInvoice).not.toHaveBeenCalled();
    });
  });

  describe('code entry', () => {
    it('uppercases every keystroke', () => {
      mount();
      openDialog();
      type('save10');
      expect(probe('code')).toBe('SAVE10');
      expect(codeInput()).toHaveValue('SAVE10');
    });

    it('a chip click fills the code and highlights only that chip', () => {
      mount();
      openDialog();
      fireEvent.click(chip('WELCOME20 — 20% off first purchase'));
      expect(probe('code')).toBe('WELCOME20');
      expect(chip('WELCOME20 — 20% off first purchase').className).toContain('bg-pink-100 border-pink-300 text-pink-800');
      expect(chip('SAVE10 — 10% off').className).toContain('bg-pink-50 hover:bg-pink-100 border-pink-100 text-pink-700');
    });

    it('the footer Apply button is disabled only while the code is empty (Q11)', () => {
      mount();
      openDialog();
      expect(applyBtn()).toBeDisabled();
      type('  ');
      expect(applyBtn()).toBeEnabled();
    });
  });

  describe('Enter key apply path (the IIFE applyAndClose)', () => {
    it('applies a known code: coupon, discount, cart recalc, close, success toast', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('applied')).toBe('SAVE10');
      expect(probe('discount')).toBe('20');
      expect(recalculateInvoice).toHaveBeenCalledTimes(1);
      expect(recalculateInvoice).toHaveBeenCalledWith(INITIAL_INVOICE.items, 20);
      expect(probe('invoice')).toBe('20|true');
      expect(probe('open')).toBe('false');
      expect(showFeedback).toHaveBeenCalledWith('success', 'Coupon SAVE10 applied — 10% off');
    });

    it('leaves the code in the box after applying (Q5)', () => {
      mount();
      openDialog();
      type('MEMBER15');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('code')).toBe('MEMBER15');
    });

    it('an UNKNOWN code on Enter is a silent no-op — no toast, no close (Q3)', () => {
      mount();
      openDialog();
      type('NOPE');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('open')).toBe('true');
      expect(probe('applied')).toBe('null');
      expect(showFeedback).not.toHaveBeenCalled();
      expect(recalculateInvoice).not.toHaveBeenCalled();
    });

    it('only Enter applies — other keys do nothing', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.keyDown(codeInput(), { key: 'a' });
      fireEvent.keyDown(codeInput(), { key: 'Tab' });
      expect(probe('open')).toBe('true');
      expect(probe('applied')).toBe('null');
    });

    it('computes 20% off the SUBTOTAL, not the total (Q8)', () => {
      mount();
      openDialog();
      type('WELCOME20');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('discount')).toBe('40');
      expect(recalculateInvoice).toHaveBeenCalledWith(INITIAL_INVOICE.items, 40);
    });

    it('a missing subtotal silently applies a zero discount (Q8)', () => {
      mount({ invoice: { items: [{ id: 'z' }], total: 999, billDiscountAmount: 0 } });
      openDialog();
      type('SAVE10');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('applied')).toBe('SAVE10');
      expect(probe('discount')).toBe('0');
      expect(recalculateInvoice).toHaveBeenCalledWith([{ id: 'z' }], 0);
      expect(showFeedback).toHaveBeenCalledWith('success', 'Coupon SAVE10 applied — 10% off');
    });
  });

  describe('footer Apply Coupon path', () => {
    it('applies a known code with the footer wording (Q2)', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.click(applyBtn());
      expect(probe('applied')).toBe('SAVE10');
      expect(probe('discount')).toBe('20');
      expect(recalculateInvoice).toHaveBeenCalledWith(INITIAL_INVOICE.items, 20);
      expect(probe('open')).toBe('false');
      expect(showFeedback).toHaveBeenCalledWith('success', 'Coupon SAVE10 applied — 10% off');
    });

    it('reports an UNKNOWN code as an error and stays open (Q3)', () => {
      mount();
      openDialog();
      type('NOPE');
      fireEvent.click(applyBtn());
      expect(showFeedback).toHaveBeenCalledWith('error', 'Unknown coupon code: NOPE');
      expect(probe('open')).toBe('true');
      expect(probe('applied')).toBe('null');
      expect(recalculateInvoice).not.toHaveBeenCalled();
    });

    it('a padded code never matches (Q11)', () => {
      mount();
      openDialog();
      type(' SAVE10 ');
      fireEvent.click(applyBtn());
      expect(showFeedback).toHaveBeenCalledWith('error', 'Unknown coupon code:  SAVE10 ');
    });
  });

  describe('applied banner + Remove', () => {
    it('shows the banner with the formatted discount once a coupon is applied', () => {
      mount();
      press('raw-set-applied');
      openDialog();
      const banner = screen.getByText(/Coupon "SAVE10" applied/).closest('div');
      expect(banner.className).toContain('bg-green-50');
      expect(banner.textContent).toContain('Coupon "SAVE10" applied — ');
      expect(banner.textContent).toContain('20.00');
      expect(banner.querySelector('[data-bb-currency-symbol="true"]')).not.toBeNull();
    });

    it('hides the banner while no coupon is applied', () => {
      mount();
      openDialog();
      expect(screen.queryByText(/applied —/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    });

    it('Remove clears coupon, discount and code, recalculates with 0, stays open and is silent (Q7)', () => {
      mount();
      press('raw-set-applied');
      openDialog();
      type('SAVE10');
      fireEvent.click(removeBtn());
      expect(probe('applied')).toBe('null');
      expect(probe('discount')).toBe('0');
      expect(probe('code')).toBe('');
      expect(recalculateInvoice).toHaveBeenCalledTimes(1);
      expect(recalculateInvoice).toHaveBeenCalledWith(INITIAL_INVOICE.items, 0);
      expect(probe('invoice')).toBe('0|true');
      expect(probe('open')).toBe('true');
      expect(showFeedback).not.toHaveBeenCalled();
    });

    it('a second coupon overwrites the first, never compounds (Q10)', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.click(applyBtn());
      openDialog();
      type('MEMBER15');
      fireEvent.click(applyBtn());
      expect(probe('applied')).toBe('MEMBER15');
      expect(probe('discount')).toBe('30');
      expect(recalculateInvoice).toHaveBeenLastCalledWith(INITIAL_INVOICE.items, 30);
    });
  });

  describe('cart write shape', () => {
    it('writes the cart with a FUNCTIONAL update reading prev.items', () => {
      mount();
      openDialog();
      type('SAVE10');
      fireEvent.click(applyBtn());
      // recalculateInvoice saw the PREVIOUS invoice's items, i.e. the updater ran against prev.
      expect(recalculateInvoice.mock.calls[0][0]).toBe(INITIAL_INVOICE.items);
      expect(recalculateInvoice.mock.calls[0]).toHaveLength(2);
    });

    it('never touches the cart when nothing is applied', () => {
      mount();
      openDialog();
      fireEvent.click(cancelBtn());
      expect(recalculateInvoice).not.toHaveBeenCalled();
    });
  });
});

// ── DOM parity between the inline region and the prototype ──────────────────────────────
describe('DOM parity', () => {
  const snapshot = (Harness, steps) => {
    const { unmount } = render(<Harness />);
    steps();
    const html = dialog() ? dialog().outerHTML : '<<closed>>';
    unmount();
    cleanup();
    recalculateInvoice.mockClear();
    showFeedback.mockClear();
    return html;
  };
  const SCENARIOS = {
    closed: () => {},
    'freshly opened': () => { openDialog(); },
    'code typed': () => { openDialog(); type('SAVE10'); },
    'chip selected': () => { openDialog(); fireEvent.click(chip('MEMBER15 — 15% for members')); },
    'coupon applied banner': () => { press('raw-set-applied'); openDialog(); },
  };

  it.each(Object.keys(SCENARIOS))('renders identical DOM — %s', (name) => {
    const a = snapshot(InlineCouponsHarness, SCENARIOS[name]);
    const b = snapshot(ExtractedCouponsHarness, SCENARIOS[name]);
    const strip = (s) => s.replace(/(id|aria-labelledby|aria-describedby)="radix-[^"]*"/g, '$1="radix"');
    expect(strip(b)).toBe(strip(a));
  });
});

// ── source contract ─────────────────────────────────────────────────────────────────────
describe('source contract', () => {
  const PARENT = read('../../POSSales.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* Coupons Dialog */}';
  const start = LINES.indexOf(ANCHOR);
  const CALLSITE = LINES.slice(start, LINES.indexOf('      />', start) + 1).join('\n');
  // The pre-extraction inline region, pinned verbatim in THIS file (REGION-VERBATIM).
  const REGION = REGION_COPY;

  // Call-site prop order as written in POSSales — state, then setters, then helpers.
  const CALLSITE_PROPS = [
    'showCouponsDialog', 'couponCode', 'appliedCoupon', 'couponDiscount', 'currentInvoice',
    'setShowCouponsDialog', 'setCouponCode', 'setAppliedCoupon', 'setCouponDiscount',
    'setCurrentInvoice', 'recalculateInvoice', 'showFeedback', 'formatCurrency',
  ];
  const EXPECTED_CALLSITE = [
    ANCHOR,
    '      <CouponsDialog',
    ...CALLSITE_PROPS.map((n) => `        ${n}={${n}}`),
    '      />',
  ].join('\n');

  const region = (anchor) => {
    const s = LINES.indexOf(anchor);
    return LINES.slice(s, LINES.indexOf('      </Dialog>', s) + 1).join('\n');
  };
  const sha = (text) => crypto.createHash('sha256').update(`${text}\n`).digest('hex');

  it('pins the pre-extraction region — 71 lines, original boundary and content hash', () => {
    expect(REGION.split('\n')).toHaveLength(71);
    expect(REGION.split('\n')[0]).toBe(ANCHOR);
    expect(REGION.split('\n')[1]).toBe("      <Dialog open={showCouponsDialog} onOpenChange={v => { if (!v) { setShowCouponsDialog(false); setCouponCode(''); } }}>");
    expect(REGION.split('\n')[2]).toBe('        <DialogContent className="max-w-sm bg-white">');
    expect(REGION.split('\n')[70]).toBe('      </Dialog>');
    expect(sha(REGION)).toBe('56ef848f0ac47f2650f01d95ff108a6c296155761b3b8bd828b7024c6799b342');
  });

  it('the shipped component IS the pinned region body under exactly the 13 props', () => {
    // A purely mechanical move: byte-for-byte the region, dedented one level, no redesign.
    expect(EXTRACTED_SOURCE).toBe(PROTOTYPE_SOURCE);
    expect(EXTRACTED_SOURCE).toContain(`function CouponsDialog({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n  return (\n`);
    expect(EXTRACTED_SOURCE).not.toContain('...props');
    expect(EXTRACTED_SOURCE).not.toContain('{...');
    expect(EXTRACTED_SOURCE).not.toContain('memo(');
    expect(PROPS).toHaveLength(13);
  });

  it('the component file default-exports CouponsDialog and imports only the region UI', () => {
    expect(COMPONENT_SRC).toContain('export default CouponsDialog;\n');
    expect(COMPONENT_SRC).toContain("import { CheckCircle, Tag } from 'lucide-react';");
    expect(COMPONENT_SRC).toContain("import { Button } from '../../../../../components/ui/button';");
    expect(COMPONENT_SRC).toContain("import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../../../components/ui/dialog';");
    expect(COMPONENT_SRC).toContain("import { Input } from '../../../../../components/ui/input';");
    expect(COMPONENT_SRC).toContain("import { Label } from '../../../../../components/ui/label';");
    // Nothing else was dragged along: no api, no context, no sibling feature module.
    const imports = COMPONENT_SRC.split('\n').filter((l) => l.startsWith('import '));
    expect(imports).toHaveLength(6); // react + lucide + 4 ui primitives
    expect(imports.filter((l) => /\/api\/|Context|features\//.test(l))).toEqual([]);
  });

  it('the component declares no hooks, refs, effects, context, portal, timer or API call', () => {
    [
      'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useMemo', 'useCallback',
      'useContext', 'createPortal', 'setTimeout', 'setInterval', 'addEventListener',
      'await ', 'async ', 'Api.', 'fetch(', 'axios',
    ].forEach((token) => expect(EXTRACTED_SOURCE, token).not.toContain(token));
  });

  it('the component is ALWAYS mounted — no conditional mount, no key/memo', () => {
    expect(EXTRACTED_SOURCE).toContain('<Dialog open={showCouponsDialog}');
    expect(EXTRACTED_SOURCE).not.toContain('{showCouponsDialog && ');
    // The only IIFE is the render-body expression INSIDE the dialog, not the mount.
    expect(EXTRACTED_SOURCE.split('(() => {').length - 1).toBe(1);
    expect(EXTRACTED_SOURCE).toContain('        {(() => {');
    // The only `key` is the available-coupons list key; the mount carries none.
    expect(EXTRACTED_SOURCE.split(' key=').length - 1).toBe(1);
    expect(EXTRACTED_SOURCE).toContain('<button key={c.code} type="button"');
  });

  it('POSSales imports CouponsDialog from POS/features/sales/CouponsDialog exactly once', () => {
    const IMPORT = "import CouponsDialog from './POS/features/sales/CouponsDialog';";
    expect(PARENT).toContain(`${IMPORT}\n`);
    expect(PARENT.split(IMPORT).length - 1).toBe(1);
  });

  it('the parent call site is UNCONDITIONAL and passes exactly the 13 props', () => {
    expect(CALLSITE).toBe(EXPECTED_CALLSITE);
    expect([...CALLSITE_PROPS].sort()).toEqual([...PROPS].sort());
    // Every prop is forwarded under its ORIGINAL POSSales name, no renames, no derivation.
    CALLSITE_PROPS.forEach((n) => expect(CALLSITE).toContain(`        ${n}={${n}}`));
    expect(CALLSITE.split('={').length - 1).toBe(13);
    // No mount guard was introduced anywhere around it.
    expect(PARENT).not.toContain('{showCouponsDialog && ');
    expect(PARENT).not.toContain('showCouponsDialog ? <CouponsDialog');
    expect(CALLSITE).not.toContain('{...');
    expect(CALLSITE).not.toContain('&&');
  });

  it('there is exactly ONE CouponsDialog call site and one anchor comment', () => {
    expect(PARENT.split('<CouponsDialog').length - 1).toBe(1);
    expect(PARENT.split(ANCHOR).length - 1).toBe(1);
  });

  it('the 71-line dialog JSX is no longer inline in POSSales', () => {
    expect(PARENT).not.toContain(REGION);
    [
      '<Dialog open={showCouponsDialog}',
      'const COUPON_RULES = [',
      'const applyAndClose = () => {',
      'Unknown coupon code:',
      'Available Coupons',
      'e.g. SAVE10, WELCOME20...',
      'recalculateInvoice(prev.items, discountAmt)',
    ].forEach((token) => expect(PARENT, token).not.toContain(token));
  });

  it('the immediate neighbours are untouched', () => {
    const reprint = region('      {/* Reprint Confirm Popup */}');
    const promotions = region('      {/* Promotions Dialog */}');
    expect(reprint.split('\n')).toHaveLength(26);
    expect(sha(reprint)).toBe('acf14106a827419ce1389b149fe971cac6e9cb073c60fa723699028f77d1e3cd');
    expect(promotions.split('\n')).toHaveLength(39);
    expect(sha(promotions)).toBe('056496812d31fe18ddd3af6adb17f4f4f11a024ac2d60228b195e071c1109399');
    // …and they still bracket the new call site, in the original order.
    expect(LINES[start - 1]).toBe('');
    expect(LINES[start - 2]).toBe('      </Dialog>'); // Reprint Confirm Popup
    expect(LINES[start - 3]).toBe('        </DialogContent>');
    const end = LINES.indexOf('      />', start);
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe('      {/* Promotions Dialog */}');
  });

  it('the UI imports the child now owns are still used by POSSales, so none were removed', () => {
    // Nothing became unused: every primitive the child imports has other POSSales regions.
    [
      'import { Dialog,',
      'import { Button }',
      'import { Input }',
      'import { Label }',
    ].forEach((token) => expect(PARENT, token).toContain(token));
    expect(PARENT).toContain('Tag,');
    expect(PARENT).toContain('CheckCircle');
    expect(PARENT.split('<Tag ').length - 1).toBeGreaterThanOrEqual(2);
    expect(PARENT.split('<CheckCircle').length - 1).toBeGreaterThanOrEqual(1);
    expect(PARENT.split('<Label').length - 1).toBeGreaterThanOrEqual(1);
    expect(PARENT.split('<Input').length - 1).toBeGreaterThanOrEqual(1);
  });

  it('the four coupon useStates are declared together in POSSales and stay parent-owned', () => {
    const DECLS = '  const [showCouponsDialog, setShowCouponsDialog] = useState(false);\n'
      + "  const [couponCode, setCouponCode] = useState('');\n"
      + '  const [appliedCoupon, setAppliedCoupon] = useState(null);\n'
      + '  const [couponDiscount, setCouponDiscount] = useState(0);';
    expect(PARENT).toContain(`${DECLS}\n`);
    expect(between(TEST_SRC, '// STATE-VERBATIM-START', '// STATE-VERBATIM-END')).toBe(DECLS);
    // …and the child owns none of it.
    expect(EXTRACTED_SOURCE).not.toContain('useState');
  });

  it('appliedCoupon / couponDiscount are also read by the sibling Promotions Dialog', () => {
    const PROMO = region('      {/* Promotions Dialog */}');
    expect(PROMO).toContain('{appliedCoupon && (');
    expect(PROMO).toContain('{formatCurrency(couponDiscount)} off applied');
    // …therefore they could not move into the extracted child.
  });

  it('POSTouchScreen is the only opener and hands the setter through touchScreenProps', () => {
    expect(TOUCH).toContain('action: () => setShowCouponsDialog(true) },');
    expect(TOUCH.split('setShowCouponsDialog(true)').length - 1).toBe(1);
    expect(PARENT).toContain('    setShowCouponsDialog, setShowPromotionsDialog, setShowPriceCheck, setPriceCheckQuery,\n');
    expect(PARENT).not.toContain('setShowCouponsDialog(true)');
  });

  it('every free identifier in the region is one of the 13 props', () => {
    const IMPORTS = [
      'Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription',
      'DialogFooter', 'Button', 'Input', 'Label', 'Tag', 'CheckCircle',
    ];
    expect(PROPS.filter((p) => !REGION.includes(p))).toEqual([]);
    expect(IMPORTS.filter((c) => !REGION.includes(c))).toEqual([]);
    // Nothing else from POSSales' scope leaked into the child.
    [
      'posSettings', 'selectedCustomerData', 'currentSession', 'currentTerminal', 'clearInvoice',
      'syncPosData', 'setShippingCharge', 'paymentManager', 'currentInvoiceRef', 'navigate',
    ].forEach((token) => expect(EXTRACTED_SOURCE, token).not.toContain(token));
  });

  it('pins Q1 — COUPON_RULES is declared twice, only the first carrying `label`', () => {
    expect(EXTRACTED_SOURCE.split('const COUPON_RULES = [').length - 1).toBe(2);
    expect(EXTRACTED_SOURCE.split("code: 'SAVE10'").length - 1).toBe(2);
    expect(EXTRACTED_SOURCE.split('label:').length - 1).toBe(3);
  });

  it('pins Q2/Q4 — divergent success copy and the unused applyAndClose', () => {
    expect(EXTRACTED_SOURCE).toContain("`Coupon ${matched.code} applied — ${matched.type === 'percent' ? matched.value + '%' : 'AED ' + matched.value} off`");
    expect(EXTRACTED_SOURCE).toContain('`Coupon ${matched.code} applied — ${matched.value}% off`');
    expect(EXTRACTED_SOURCE).toContain('const applyAndClose = () => {');
    // referenced exactly once more, by the Enter handler — never by a button
    expect(EXTRACTED_SOURCE.split('applyAndClose').length - 1).toBe(2);
    expect(EXTRACTED_SOURCE).toContain("onKeyDown={e => { if (e.key === 'Enter') applyAndClose(); }}");
  });

  it('pins Q8/Q9 — subtotal base and the two parallel discount stores', () => {
    expect(EXTRACTED_SOURCE.split('const subtotal = currentInvoice.subtotal || 0;').length - 1).toBe(2);
    expect(EXTRACTED_SOURCE.split('setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));').length - 1).toBe(2);
    expect(EXTRACTED_SOURCE).toContain('setCurrentInvoice(prev => recalculateInvoice(prev.items, 0));');
  });
});

// ── mutation safeguards ─────────────────────────────────────────────────────────────────
// Compiles mutated copies of the SHIPPED component source (esbuild, in a child node process —
// esbuild cannot load under jsdom) and proves the behavioural checks above reject each mutation,
// while the unmutated compile passes all of them.
describe('mutation safeguards', () => {
  const MUTANTS = {
    control: (s) => s,
    noUppercase: (s) => s.replace('e.target.value.toUpperCase()', 'e.target.value'),
    noEnterHandler: (s) => s.replace("onKeyDown={e => { if (e.key === 'Enter') applyAndClose(); }}", ''),
    enterAcceptsUnknown: (s) => s.replace('if (!matched) return;', 'if (!matched) { setShowCouponsDialog(false); return; }'),
    footerSilentOnUnknown: (s) => s.replace("if (!matched) { showFeedback('error', `Unknown coupon code: ${couponCode}`); return; }", 'if (!matched) { return; }'),
    applyNeverDisabled: (s) => s.replace('disabled={!couponCode}', 'disabled={false}'),
    removeKeepsCode: (s) => s.replace(/\n *setCouponCode\(''\);(?=\n *\}\}>Remove)/, ''),
    cancelClearsCode: (s) => s.replace('onClick={() => setShowCouponsDialog(false)}>Cancel', "onClick={() => { setShowCouponsDialog(false); setCouponCode(''); }}>Cancel"),
    discountFromTotal: (s) => s.replace(/const subtotal = currentInvoice\.subtotal \|\| 0;/g, 'const subtotal = currentInvoice.total || 0;'),
    feedbackWording: (s) => s.replace(/applied — /g, 'applied - '),
  };
  let compiled = {};

  beforeAll(() => {
    const sources = {};
    for (const [name, mutate] of Object.entries(MUTANTS)) {
      const src = mutate(EXTRACTED_SOURCE);
      if (name !== 'control') expect(src, `${name} mutation must apply`).not.toBe(EXTRACTED_SOURCE);
      sources[name] = src;
    }
    compiled = compileAll(sources);
  }, 30000);

  const renderProto = () => render(<ExtractedCouponsHarness />);
  const CHECKS = {
    uppercase: () => {
      renderProto(); openDialog(); type('save10');
      expect(probe('code')).toBe('SAVE10');
    },
    enterApplies: () => {
      renderProto(); openDialog(); type('SAVE10');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('applied')).toBe('SAVE10');
    },
    enterIgnoresUnknown: () => {
      renderProto(); openDialog(); type('NOPE');
      fireEvent.keyDown(codeInput(), { key: 'Enter' });
      expect(probe('open')).toBe('true');
    },
    footerUnknownError: () => {
      renderProto(); openDialog(); type('NOPE');
      fireEvent.click(applyBtn());
      expect(showFeedback).toHaveBeenCalledWith('error', 'Unknown coupon code: NOPE');
    },
    applyDisabled: () => {
      renderProto(); openDialog();
      expect(applyBtn()).toBeDisabled();
    },
    removeClearsCode: () => {
      renderProto(); press('raw-set-applied'); openDialog(); type('SAVE10');
      fireEvent.click(removeBtn());
      expect(probe('code')).toBe('');
    },
    cancelKeepsCode: () => {
      renderProto(); openDialog(); type('SAVE10');
      fireEvent.click(cancelBtn());
      expect(probe('code')).toBe('SAVE10');
    },
    discountBase: () => {
      renderProto(); openDialog(); type('SAVE10');
      fireEvent.click(applyBtn());
      expect(probe('discount')).toBe('20');
    },
    successCopy: () => {
      renderProto(); openDialog(); type('SAVE10');
      fireEvent.click(applyBtn());
      expect(showFeedback).toHaveBeenCalledWith('success', 'Coupon SAVE10 applied — 10% off');
    },
  };
  const EXPECTED = {
    control: [],
    noUppercase: ['uppercase'],
    noEnterHandler: ['enterApplies'],
    enterAcceptsUnknown: ['enterIgnoresUnknown'],
    footerSilentOnUnknown: ['footerUnknownError'],
    applyNeverDisabled: ['applyDisabled'],
    removeKeepsCode: ['removeClearsCode'],
    cancelClearsCode: ['cancelKeepsCode'],
    discountFromTotal: ['discountBase'],
    feedbackWording: ['successCopy'],
  };

  const passes = (check) => {
    try {
      check();
      return true;
    } catch {
      return false;
    } finally {
      cleanup();
      recalculateInvoice.mockClear();
      showFeedback.mockClear();
    }
  };

  it.each(Object.keys(MUTANTS))('%s — the suite reacts exactly as expected', (mutant) => {
    CouponsDialog = compiled[mutant];
    const failed = Object.entries(CHECKS).filter(([, check]) => !passes(check)).map(([n]) => n);
    expect(failed.sort()).toEqual([...EXPECTED[mutant]].sort());
  });
});
