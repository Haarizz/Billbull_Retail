import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * STRUCTURAL — every POS template honours salesperson verification.
 *
 * The audit found the compact TradePOS template had NO salesperson UI at all, so a branch running
 * it posted every sale as Unassigned and could not have satisfied a mandatory-verification rule.
 * These assertions exist so a future layout cannot silently reintroduce that gap: each template is
 * asserted against its real source, the same way POSSalesArchitecture.characterization does.
 */

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

const TOUCH = read('../POSTouchScreen.jsx');
const TRADE = read('../TradePOS/TradePOSTouchScreen.jsx');
const POS_SALES = read('../../POSSales.jsx');

describe('every POS template renders the salesperson scan affordance', () => {
  for (const [name, src] of [['POSTouchScreen (Classic + Cart Focus)', TOUCH], ['TradePOSTouchScreen (compact)', TRADE]]) {
    it(`${name} accepts the verification props`, () => {
      expect(src).toContain('salespersonRequired');
      expect(src).toContain('verifiedSalesperson');
      expect(src).toContain('openSalespersonScanModal');
    });

    it(`${name} gates the scan UI on the setting, so OFF is unchanged`, () => {
      expect(src).toMatch(/salespersonRequired\s*(\?|&&)/);
    });
  }

  it('POSTouchScreen renders the Salesperson bar in BOTH of its layouts', () => {
    expect(TOUCH.match(/<SalespersonBar/g) || []).toHaveLength(2);
    // Both call sites must carry the verification props — one that did not would render the old
    // manual picker while the other required a scan.
    expect(TOUCH.match(/required=\{salespersonRequired\}/g) || []).toHaveLength(2);
  });

  it('offers no manual picker at all — a scan is the only input', () => {
    // A typed or picked name is not a verification, so manual selection exists on NEITHER branch:
    // when the feature is on the only control is [Scan], and when it is off there is no control.
    // The POS SalespersonSelect dropdown was deleted rather than left unwired — an unused picker
    // sitting in features/sales is an invitation to re-import it.
    expect(TOUCH).not.toContain('SalespersonSelect');
    expect(fs.existsSync(path.resolve(__dirname, '../features/sales/SalespersonSelect.jsx'))).toBe(false);
  });

  it('renders nothing at all when the feature is off', () => {
    // Not a disabled control and not an empty row: with the feature off the cart sits straight
    // under the customer bar, exactly as it did before this feature existed.
    const bar = TOUCH.slice(TOUCH.indexOf('const SalespersonBar'), TOUCH.indexOf('const POSTouchScreen'));
    expect(bar).toContain('if (!required) return null;');
  });
});

describe('Checkout opens the scan modal itself', () => {
  it('refuses an unverified sale by OPENING the modal, not by printing an error', () => {
    // The cashier should never have to find the Scan button first: clicking Checkout with no
    // verified salesperson puts the scan field in front of them. Opening the modal IS the
    // refusal, which is why this returns rather than falling through to the payment phase.
    const handler = POS_SALES.slice(
      POS_SALES.indexOf('const handleCheckout = useCallback('),
      POS_SALES.indexOf('const touchScreenProps'));
    expect(handler).toContain('if (salespersonRequired && !salespersonVerified) {');
    expect(handler).toContain('openSalespersonScanModal();');
    // The guard must precede the phase switch, or the payment screen opens behind the modal.
    expect(handler.indexOf('openSalespersonScanModal()'))
      .toBeLessThan(handler.indexOf("setCheckoutPhase('payment')"));
  });

  it('lets an already-verified sale straight through — the same scan is never asked for twice', () => {
    const handler = POS_SALES.slice(
      POS_SALES.indexOf('const handleCheckout = useCallback('),
      POS_SALES.indexOf('const touchScreenProps'));
    // salespersonVerified is true both when a scan has happened and when the feature is off, so
    // one condition covers "already scanned" and "nothing to scan".
    expect(handler).toContain('!salespersonVerified');
    expect(handler).toContain('setShowPaymentDialog(true)');
  });

  it('applies the same gate to an order picked straight into settlement', () => {
    // The orders list has its own Checkout button; it is a POS sale like any other and cannot be a
    // way around the scan. It no longer carries its own copy of the condition — it calls the one
    // shared handler, so there is a single place the gate can be got wrong.
    const ordersHandler = POS_SALES.slice(POS_SALES.indexOf('const handleOpenOrderAndCheckout = async () => {'));
    expect(ordersHandler.slice(0, 600)).toContain('handleCheckout();');
  });

  it('and the rendered Checkout buttons actually CALL that handler', () => {
    // The gap this suite originally missed: the guard was asserted here, in POSSales, while
    // POSTouchScreen opened the payment dialog inline and never received handleCheckout — so
    // every assertion above passed while the browser walked straight past the gate. Behaviour is
    // covered by salespersonCheckoutGate.test.jsx; this is the structural half.
    expect(POS_SALES).toMatch(/const touchScreenProps = \{\s+handleCheckout,/);
    for (const [name, src] of [['POSTouchScreen', TOUCH], ['TradePOSTouchScreen', TRADE]]) {
      expect(src, name).toContain('handleCheckout');
      // No template may open settlement itself.
      expect(src, name).not.toContain('setShowPaymentDialog(true)');
    }
  });
});

describe('the Actions panel entry', () => {
  it('exists, and only while verification is required', () => {
    expect(TOUCH).toContain("id: 'salesperson'");
    expect(TOUCH).toContain('...(salespersonRequired ? [{');
  });

  it('opens the SAME modal as the header button — not a second source of truth', () => {
    expect(TOUCH).toContain('action: () => openSalespersonScanModal?.()');
    // Exactly one modal instance exists, rendered at the POS root.
    expect(POS_SALES.match(/<SalespersonScanModal/g) || []).toHaveLength(1);
  });

  it('shows the current salesperson on the button when one is verified', () => {
    expect(TOUCH).toContain('`Salesperson: ${verifiedSalesperson.name');
  });
});

describe('scanner safety', () => {
  it('the wedge listener bails out while the salesperson modal is open', () => {
    expect(TOUCH).toContain("document.querySelector('[data-pos-scan-suppress=\"true\"]')");
    // The guard must sit INSIDE the keydown handler, before the buffer is appended to — an
    // employee barcode reaching handleBarcodeScan would be added to the cart as a product.
    const handler = TOUCH.slice(TOUCH.indexOf('const onKeyDown = (event) => {'), TOUCH.indexOf('scannerBufferRef.current += event.key'));
    expect(handler).toContain('data-pos-scan-suppress');
  });

  it('there is still exactly ONE wedge listener — no second scanning system', () => {
    expect(POS_SALES.match(/addEventListener\('keydown'/g) || []).toHaveLength(0);
    expect(TOUCH.match(/window\.addEventListener\('keydown'/g) || []).toHaveLength(1);
  });
});

describe('state ownership', () => {
  it('all verification state comes from useSalesperson, none from POSSales', () => {
    expect(POS_SALES).toContain('} = useSalesperson();');
    // POSSales must declare no salesperson/verification state of its own — this is what keeps
    // the POSSalesArchitecture shape counters unchanged.
    expect(POS_SALES).not.toMatch(/^ {2}const \[verifiedSalesperson/m);
    expect(POS_SALES).not.toMatch(/^ {2}const \[salespersonRequired/m);
    expect(POS_SALES).not.toMatch(/^ {2}const \[targetReadiness/m);
  });

  it('every POS template receives the props through the one shared prop bag', () => {
    expect(POS_SALES).toContain('salespersonRequired, verifiedSalesperson, openSalespersonScanModal,');
  });
});
