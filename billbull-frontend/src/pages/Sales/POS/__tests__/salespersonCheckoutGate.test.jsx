import fs from 'node:fs';
import path from 'node:path';
import React, { useCallback, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import POSTouchScreen from '../POSTouchScreen';
import { TradePOSTouchScreen } from '../TradePOS/TradePOSTouchScreen';

/**
 * REGRESSION — clicking Checkout with no verified salesperson must open the scan modal and stop.
 *
 * THE DEFECT THIS PINS: the salesperson gate lived in POSSales.handleCheckout and was asserted
 * there structurally, but POSTouchScreen — the template every branch actually runs — never
 * received handleCheckout. Both of its Checkout buttons called
 * `setCheckoutPhase('payment'); setShowPaymentDialog(true)` inline, so settlement opened with the
 * gate never consulted. The old structural suite could not see this: it checked the guard's text
 * inside POSSales and the scan affordance inside the template, but nothing connected the rendered
 * button to the guarded handler.
 *
 * So these tests are BEHAVIOURAL and start from the real rendered button: the real template, a
 * real click, and the real guard — `useSharedCheckoutGate` below is POSSales.handleCheckout copied
 * verbatim, with `pinsPosSalesGuard` asserting it has not drifted from the source. A future layout
 * that opens settlement on its own fails here even if it copies the condition correctly.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = read('../../POSSales.jsx');
const TOUCH = read('../POSTouchScreen.jsx');

// POSSales.jsx `handleCheckout`, verbatim (comments dropped; enforced by pinsPosSalesGuard).
const useSharedCheckoutGate = ({
  salespersonRequired, salespersonVerified, openSalespersonScanModal,
  setCheckoutPhase, setShowPaymentDialog,
}) => useCallback(() => {
  if (salespersonRequired && !salespersonVerified) {
    openSalespersonScanModal();
    return false;
  }
  setCheckoutPhase('payment');
  setShowPaymentDialog(true);
  return true;
}, [salespersonRequired, salespersonVerified, openSalespersonScanModal,
  setCheckoutPhase, setShowPaymentDialog]);

const codeLines = (src) => src
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('//'));

/** Everything the gate can touch, so "no side effect" is checkable rather than assumed. */
const makeSpies = () => ({
  openSalespersonScanModal: vi.fn(),
  setShowPaymentDialog: vi.fn(),
  setCheckoutPhase: vi.fn(),
  setTenderedAmount: vi.fn(),
  setCheckoutKeypadVisible: vi.fn(),
  setCheckoutKeypadMode: vi.fn(),
  setCheckoutKeypadTarget: vi.fn(),
  posCheckout: vi.fn(),
});

const CART = {
  items: [{
    id: 'p1', name: 'Widget', code: 'W1', price: 10, quantity: 1,
    discount: 0, taxRate: 5, total: 10, unit: 'Pcs',
  }],
  subtotal: 10, totalDiscount: 0, tax: 0.5, total: 10.5, billDiscountAmount: 0,
};

/**
 * The real POSSales wiring in miniature: the shared gate handed to the real template through the
 * same `handleCheckout` prop, with the modal rendered off the same state the gate opens.
 */
const Harness = ({ Template, salespersonRequired, verifiedSalesperson, spies, posTemplate }) => {
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const openSalespersonScanModal = useCallback(() => {
    spies.openSalespersonScanModal();
    setScanModalOpen(true);
  }, [spies]);
  // Exactly the useSalesperson derivation: verified when the feature is off, or when a scan
  // succeeded. A merely displayed/preselected employee is NOT a verification.
  const salespersonVerified = !salespersonRequired || !!verifiedSalesperson;
  const handleCheckout = useSharedCheckoutGate({
    salespersonRequired, salespersonVerified, openSalespersonScanModal,
    setCheckoutPhase: spies.setCheckoutPhase,
    setShowPaymentDialog: spies.setShowPaymentDialog,
  });
  return (
    <>
      {scanModalOpen && <div data-testid="salesperson-scan-modal" />}
      <Template
        currentInvoice={CART}
        posProducts={[]} filteredProducts={[]} productCategories={[]} horizontalCategories={[]}
        customerOptions={[]} filteredCustomerOptions={[]} heldSales={[]}
        selectedCustomerData={{ id: 'c1', name: 'Walk-in Customer' }}
        formatCurrency={(n) => `AED ${Number(n || 0).toFixed(2)}`}
        posTemplate={posTemplate}
        handleCheckout={handleCheckout}
        salespersonRequired={salespersonRequired}
        verifiedSalesperson={verifiedSalesperson}
        openSalespersonScanModal={openSalespersonScanModal}
        // Handed in deliberately, even though the template must not use them: a layout that opened
        // settlement itself would SUCCEED here, so these tests fail on the bypass itself rather
        // than on a missing-prop crash. That is exactly how the original defect behaved in the
        // browser — the real POSSales prop bag supplies both.
        setShowPaymentDialog={spies.setShowPaymentDialog}
        setCheckoutPhase={spies.setCheckoutPhase}
        setTenderedAmount={spies.setTenderedAmount}
        setCheckoutKeypadVisible={spies.setCheckoutKeypadVisible}
        setCheckoutKeypadMode={spies.setCheckoutKeypadMode}
        setCheckoutKeypadTarget={spies.setCheckoutKeypadTarget}
      />
    </>
  );
};

const clickCheckout = () => {
  const buttons = screen.getAllByRole('button')
    .filter(b => /checkout/i.test(b.textContent || ''));
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
};

const expectSettlementOpened = (spies) => {
  expect(spies.setShowPaymentDialog).toHaveBeenCalledWith(true);
  expect(spies.openSalespersonScanModal).not.toHaveBeenCalled();
  expect(screen.queryByTestId('salesperson-scan-modal')).toBeNull();
};

const expectRefusedWithModal = (spies) => {
  // 1. the modal opened, 2. nothing else happened.
  expect(screen.getByTestId('salesperson-scan-modal')).toBeTruthy();
  expect(spies.openSalespersonScanModal).toHaveBeenCalledTimes(1);
  expect(spies.setShowPaymentDialog).not.toHaveBeenCalled();
  expect(spies.setCheckoutPhase).not.toHaveBeenCalled();
  expect(spies.posCheckout).not.toHaveBeenCalled();
  // No half-primed settlement state either: a refused checkout must not seed the tender or
  // reconfigure the keypad for a payment that is not going to be taken.
  expect(spies.setTenderedAmount).not.toHaveBeenCalled();
  expect(spies.setCheckoutKeypadVisible).not.toHaveBeenCalled();
  expect(spies.setCheckoutKeypadMode).not.toHaveBeenCalled();
  expect(spies.setCheckoutKeypadTarget).not.toHaveBeenCalled();
};

const LAYOUTS = [
  ['POSTouchScreen — Classic', POSTouchScreen, 'classic'],
  ['POSTouchScreen — Cart Focus', POSTouchScreen, 'focus'],
  ['TradePOSTouchScreen — compact', TradePOSTouchScreen, 'compact'],
];

describe.each(LAYOUTS)('%s Checkout button', (_name, Template, posTemplate) => {
  let spies;
  beforeEach(() => { spies = makeSpies(); });
  afterEach(cleanup);

  it('REPRODUCTION: required + not verified -> opens the scan modal and stops there', () => {
    render(<Harness Template={Template} posTemplate={posTemplate} spies={spies}
      salespersonRequired verifiedSalesperson={null} />);
    clickCheckout();
    expectRefusedWithModal(spies);
  });

  it('feature OFF -> straight to settlement, exactly as before the feature existed', () => {
    render(<Harness Template={Template} posTemplate={posTemplate} spies={spies}
      salespersonRequired={false} verifiedSalesperson={null} />);
    clickCheckout();
    expectSettlementOpened(spies);
  });

  it('required + verified -> straight to settlement; the scan is never asked for twice', () => {
    render(<Harness Template={Template} posTemplate={posTemplate} spies={spies}
      salespersonRequired verifiedSalesperson={{ id: 'e1', name: 'Asha', employeeCode: 'E-1' }} />);
    clickCheckout();
    expectSettlementOpened(spies);
  });

  it('verified, then cleared (Scan New) -> requires verification again', () => {
    const { rerender } = render(<Harness Template={Template} posTemplate={posTemplate} spies={spies}
      salespersonRequired verifiedSalesperson={{ id: 'e1', name: 'Asha', employeeCode: 'E-1' }} />);
    clickCheckout();
    expectSettlementOpened(spies);

    const second = makeSpies();
    rerender(<Harness Template={Template} posTemplate={posTemplate} spies={second}
      salespersonRequired verifiedSalesperson={null} />);
    clickCheckout();
    expectRefusedWithModal(second);
  });
});

describe('POSTouchScreen cannot open settlement on its own', () => {
  it('does not receive the settlement setters at all', () => {
    // The bug was reachable only because these were in scope. Destructuring them again is the
    // one change that could bring it back, so it is the thing asserted.
    const propBag = TOUCH.slice(TOUCH.indexOf('const POSTouchScreen'), TOUCH.indexOf('} = props;'));
    expect(propBag).not.toContain('setShowPaymentDialog,');
    expect(propBag).not.toContain('setCheckoutPhase,');
    expect(propBag).toContain('handleCheckout,');
  });

  it('opens settlement through handleCheckout and nothing else', () => {
    expect(TOUCH).not.toContain('setShowPaymentDialog(true)');
    expect(TOUCH).not.toContain("setCheckoutPhase('payment')");
    // Both Checkout buttons (Classic and Cart Focus) share one helper.
    expect(TOUCH.match(/onClick=\{startCheckout\}/g) || []).toHaveLength(2);
    expect(TOUCH).toContain('if (handleCheckout?.() === false) return;');
  });
});

describe('every other checkout trigger delegates to the same gate', () => {
  it('pinsPosSalesGuard — the copy above is still POSSales.handleCheckout', () => {
    const source = POS_SALES.slice(
      POS_SALES.indexOf('const handleCheckout = useCallback(() => {'),
      POS_SALES.indexOf('}, [salespersonRequired, salespersonVerified, openSalespersonScanModal]);'));
    expect(codeLines(source)).toEqual(codeLines([
      'const handleCheckout = useCallback(() => {',
      "if (salespersonRequired && !salespersonVerified) {",
      'openSalespersonScanModal();',
      'return false;',
      '}',
      "setCheckoutPhase('payment');",
      'setShowPaymentDialog(true);',
      'return true;',
    ].join('\n')));
  });

  it('the saved-orders Checkout calls the shared gate instead of re-implementing it', () => {
    const handler = POS_SALES.slice(POS_SALES.indexOf('const handleOpenOrderAndCheckout = async () => {'));
    const body = handler.slice(0, handler.indexOf('};') + 2);
    expect(body).toContain('handleCheckout();');
    // It must not open the dialog itself, and must not carry its own copy of the condition.
    expect(body).not.toContain('setShowPaymentDialog(true)');
    expect(body).not.toContain('salespersonVerified');
  });

  it('settlement is opened from exactly one place in POSSales', () => {
    // handleCheckout is the only opener; every other setShowPaymentDialog call closes it or is a
    // reset. A second `(true)` would be a second path that could skip the gate.
    expect(POS_SALES.match(/setShowPaymentDialog\(true\)/g) || []).toHaveLength(1);
  });
});
