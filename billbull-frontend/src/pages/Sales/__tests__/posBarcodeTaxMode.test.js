import { describe, it, expect } from 'vitest';

import { computePosCartTotals, mapPosProductAggregateItem, mergeSavedPosSettings } from '../POS/posUtils';
import { resolveLineTaxRate, computeLineTaxTotals, VAT_MODES } from '../../../utils/vatMath';

/**
 * Barcode-scan vs manual-selection tax-mode parity.
 *
 * In POS the VAT mode is cart-global and read-only — it comes from the branch's
 * Tax Configuration (posSettings.taxInclusive), never from the line being added.
 * Every entry path (grid click, barcode scan, batch/serial scan, quick product)
 * funnels through handleProductSelection -> addToInvoice -> recalculateInvoice,
 * and recalculateInvoice delegates to computePosCartTotals with the live
 * posSettings. These tests pin that contract:
 *   - a scanned line is byte-identical to a manually-selected line
 *   - totals follow the active mode
 *   - nothing an add/scan does can flip the mode
 */

const INCLUSIVE = { taxInclusive: true, taxEnabled: true, branchDefaultVatRate: 5 };
const EXCLUSIVE = { taxInclusive: false, taxEnabled: true, branchDefaultVatRate: 5 };

const round = (n) => Math.round(n * 100) / 100;

/** The line shape addToInvoice builds — note there is no tax-mode field on it. */
const buildLine = (product, quantity, posSettings) => ({
  id: product.id,
  productId: product.id,
  name: product.name,
  barcode: product.barcode || product.code || product.id,
  price: Number(product.price) || 0,
  quantity,
  discount: Number(product.defaultDiscount) || 0,
  taxRate: resolveLineTaxRate(product, posSettings?.branchDefaultVatRate, posSettings?.taxEnabled !== false),
});

const PRODUCT = { id: 'p1', name: 'Widget', code: 'W1', barcode: '8901234567890', price: 105, salesTax: 5 };

describe('POS barcode scan — tax mode preservation', () => {
  describe('line construction is identical for scan and manual selection', () => {
    it.each([
      ['VAT Inclusive', INCLUSIVE],
      ['VAT Exclusive', EXCLUSIVE],
    ])('%s: a scanned line equals a manually selected line', (_label, posSettings) => {
      // Manual: the product object comes straight from the POS product grid.
      const manual = buildLine(PRODUCT, 1, posSettings);
      // Scan: the same product arrives via the backend resolver and is mapped.
      const scanned = buildLine(
        mapPosProductAggregateItem(
          {
            product: { id: PRODUCT.id, code: PRODUCT.code, name: PRODUCT.name },
            effectivePricing: { retailPrice: PRODUCT.price },
            tax: { salesTax: PRODUCT.salesTax },
          },
          PRODUCT.barcode,
        ),
        1,
        posSettings,
      );

      expect(scanned.price).toBe(manual.price);
      expect(scanned.taxRate).toBe(manual.taxRate);
      expect(scanned.discount).toBe(manual.discount);
      // The cart line carries no tax-mode field at all — there is nothing on it
      // that could override the cashier's selected mode.
      expect(Object.keys(scanned)).not.toContain('taxInclusive');
      expect(Object.keys(scanned)).not.toContain('vatMode');
    });

    it('resolves the same tax rate regardless of the active mode', () => {
      expect(buildLine(PRODUCT, 1, INCLUSIVE).taxRate).toBe(buildLine(PRODUCT, 1, EXCLUSIVE).taxRate);
    });

    it('honours the branch default rate when the product has none, in both modes', () => {
      const noTax = { ...PRODUCT, salesTax: null };
      expect(buildLine(noTax, 1, INCLUSIVE).taxRate).toBe(5);
      expect(buildLine(noTax, 1, EXCLUSIVE).taxRate).toBe(5);
    });

    it('honours the Tax Enabled kill switch in both modes', () => {
      expect(buildLine(PRODUCT, 1, { ...INCLUSIVE, taxEnabled: false }).taxRate).toBe(0);
      expect(buildLine(PRODUCT, 1, { ...EXCLUSIVE, taxEnabled: false }).taxRate).toBe(0);
    });
  });

  describe('totals follow the active mode', () => {
    it('VAT Inclusive: 105 @ 5% → taxable 100, VAT 5, total 105', () => {
      const t = computePosCartTotals([buildLine(PRODUCT, 1, INCLUSIVE)], 0, INCLUSIVE);
      expect(t.taxInclusive).toBe(true);
      expect(round(t.subtotal)).toBe(105);
      expect(round(t.tax)).toBe(5);
      expect(round(t.total)).toBe(105);
    });

    it('VAT Exclusive: 105 @ 5% → taxable 105, VAT 5.25, total 110.25', () => {
      const t = computePosCartTotals([buildLine(PRODUCT, 1, EXCLUSIVE)], 0, EXCLUSIVE);
      expect(t.taxInclusive).toBe(false);
      expect(round(t.subtotal)).toBe(105);
      expect(round(t.tax)).toBe(5.25);
      expect(round(t.total)).toBe(110.25);
    });

    it('agrees with the shared vatMath used by the back-office sales documents', () => {
      const line = buildLine(PRODUCT, 1, INCLUSIVE);
      const incl = computeLineTaxTotals({ netAfterDiscount: 105, taxPercent: line.taxRate, vatMode: VAT_MODES.INCLUSIVE });
      const excl = computeLineTaxTotals({ netAfterDiscount: 105, taxPercent: line.taxRate, vatMode: VAT_MODES.EXCLUSIVE });

      expect(round(computePosCartTotals([line], 0, INCLUSIVE).tax)).toBe(round(incl.taxAmount));
      expect(round(computePosCartTotals([line], 0, EXCLUSIVE).tax)).toBe(round(excl.taxAmount));
      expect(round(computePosCartTotals([line], 0, INCLUSIVE).total)).toBe(round(incl.total));
      expect(round(computePosCartTotals([line], 0, EXCLUSIVE).total)).toBe(round(excl.total));
    });

    it('applies a line discount off the entered price in both modes', () => {
      const line = { ...buildLine(PRODUCT, 2, INCLUSIVE), discount: 10 }; // 210 gross, 21 off
      const incl = computePosCartTotals([line], 0, INCLUSIVE);
      expect(round(incl.totalDiscount)).toBe(21);
      expect(round(incl.total)).toBe(189);
      expect(round(incl.tax)).toBe(9); // 189 - 189/1.05

      const excl = computePosCartTotals([line], 0, EXCLUSIVE);
      expect(round(excl.totalDiscount)).toBe(21);
      expect(round(excl.tax)).toBe(9.45);
      expect(round(excl.total)).toBe(198.45);
    });

    it('excludes voided lines from the total but reports them separately, in both modes', () => {
      const items = [buildLine(PRODUCT, 1, INCLUSIVE), { ...buildLine(PRODUCT, 1, INCLUSIVE), id: 'p2', isVoided: true }];
      for (const settings of [INCLUSIVE, EXCLUSIVE]) {
        const t = computePosCartTotals(items, 0, settings);
        expect(t.voidedCount).toBe(1);
        expect(round(t.voidedTotal)).toBe(105);
        expect(round(t.subtotal)).toBe(105);
      }
    });
  });

  describe('mixed scan/edit scenarios never change the mode', () => {
    const scan = (items, product, qty, settings) => {
      const existing = items.find(i => i.id === product.id);
      const next = existing
        ? items.map(i => (i.id === product.id ? { ...i, quantity: i.quantity + qty } : i))
        : [buildLine(product, qty, settings), ...items];
      return computePosCartTotals(next, 0, settings);
    };

    it.each([
      ['VAT Inclusive', INCLUSIVE, true],
      ['VAT Exclusive', EXCLUSIVE, false],
    ])('%s: survives multiple scans, a rescan merge and a qty edit', (_label, settings, expectedMode) => {
      const other = { id: 'p2', name: 'Gadget', code: 'G1', barcode: '111', price: 50, salesTax: 5 };

      let cart = scan([], PRODUCT, 1, settings);
      expect(cart.taxInclusive).toBe(expectedMode);

      cart = scan(cart.items, other, 2, settings);
      expect(cart.taxInclusive).toBe(expectedMode);
      expect(cart.items).toHaveLength(2);

      // Rescanning the first product merges into its existing line (no new row).
      cart = scan(cart.items, PRODUCT, 1, settings);
      expect(cart.items).toHaveLength(2);
      expect(cart.items.find(i => i.id === PRODUCT.id).quantity).toBe(2);
      expect(cart.taxInclusive).toBe(expectedMode);

      // Cart edit: change a quantity directly.
      const edited = cart.items.map(i => (i.id === other.id ? { ...i, quantity: 5 } : i));
      cart = computePosCartTotals(edited, 0, settings);
      expect(cart.taxInclusive).toBe(expectedMode);
      expect(round(cart.subtotal)).toBe(2 * 105 + 5 * 50);
    });

    it('scanning after a mode switch re-prices the whole cart under the new mode (cart-global mode)', () => {
      // POS models VAT mode as a single per-bill flag (PosCheckoutRequest.taxInclusive
      // / SalesInvoice.taxInclusive), so a mode change is not per-item — it applies
      // to every line on the open bill. This test documents that intended behaviour.
      const cart = [buildLine(PRODUCT, 1, EXCLUSIVE)];
      expect(round(computePosCartTotals(cart, 0, EXCLUSIVE).total)).toBe(110.25);

      const afterSwitch = [buildLine(PRODUCT, 1, INCLUSIVE), ...cart.map(i => ({ ...i, id: 'p1b' }))];
      const t = computePosCartTotals(afterSwitch, 0, INCLUSIVE);
      expect(t.taxInclusive).toBe(true);
      expect(round(t.total)).toBe(210); // both lines inclusive, no VAT added on top
    });
  });

  describe('saving POS settings must not drop the branch tax configuration', () => {
    // Regression: switching the POS screen template (POS Configure > Apply & Close)
    // saved the PosSettings row and assigned the response straight to state. That
    // row has no tax fields — they belong to BranchTaxConfiguration and are merged
    // in client-side — so the cart silently flipped from Inclusive/5% to
    // Exclusive/0% until a page reload re-merged them.
    const SAVED_ROW = { id: 1, defaultLayout: 'COMPACT', layoutHideCategoryPanel: true };

    it('preserves taxInclusive / taxEnabled / branchDefaultVatRate across a save', () => {
      const next = mergeSavedPosSettings(INCLUSIVE, SAVED_ROW);
      expect(next.taxInclusive).toBe(true);
      expect(next.taxEnabled).toBe(true);
      expect(next.branchDefaultVatRate).toBe(5);
      expect(next.defaultLayout).toBe('COMPACT');
      expect(next.layoutHideCategoryPanel).toBe(true);
    });

    it('keeps the cart priced Inclusive after a layout save', () => {
      const afterSave = mergeSavedPosSettings(INCLUSIVE, SAVED_ROW);
      const before = computePosCartTotals([buildLine(PRODUCT, 1, INCLUSIVE)], 0, INCLUSIVE);
      const after = computePosCartTotals([buildLine(PRODUCT, 1, afterSave)], 0, afterSave);
      expect(after.taxInclusive).toBe(before.taxInclusive);
      expect(round(after.total)).toBe(round(before.total));
      expect(round(after.tax)).toBe(round(before.tax));
    });

    it('still lets the server row win for non-tax fields, and tolerates a null save', () => {
      expect(mergeSavedPosSettings({ ...INCLUSIVE, voidMode: 'VOID' }, { voidMode: 'DELETE' }).voidMode).toBe('DELETE');
      expect(mergeSavedPosSettings(INCLUSIVE, null).taxInclusive).toBe(true);
      expect(mergeSavedPosSettings(null, SAVED_ROW).defaultLayout).toBe('COMPACT');
    });

    it('accepts an explicit tax value from a prev state that has one, including false', () => {
      // Exclusive is a real configured value, not an absent one — it must survive too.
      expect(mergeSavedPosSettings(EXCLUSIVE, SAVED_ROW).taxInclusive).toBe(false);
      expect(mergeSavedPosSettings({ ...EXCLUSIVE, taxEnabled: false }, SAVED_ROW).taxEnabled).toBe(false);
    });
  });

  describe('the cart total is the figure checkout, receipt and invoice all consume', () => {
    it.each([
      ['VAT Inclusive', INCLUSIVE, 105, 5],
      ['VAT Exclusive', EXCLUSIVE, 110.25, 5.25],
    ])('%s: totals object carries the mode for the downstream payload', (_l, settings, expectedTotal, expectedTax) => {
      const t = computePosCartTotals([buildLine(PRODUCT, 1, settings)], 0, settings);
      // POSSales sends `taxInclusive: posSettings?.taxInclusive === true` on the
      // checkout/print payloads; it must equal what the cart was priced with.
      expect(t.taxInclusive).toBe(settings.taxInclusive === true);
      expect(round(t.total)).toBe(expectedTotal);
      expect(round(t.tax)).toBe(expectedTax);
    });

    it('subtracts a bill-level discount flat in both modes', () => {
      expect(round(computePosCartTotals([buildLine(PRODUCT, 1, INCLUSIVE)], 5, INCLUSIVE).total)).toBe(100);
      expect(round(computePosCartTotals([buildLine(PRODUCT, 1, EXCLUSIVE)], 5, EXCLUSIVE).total)).toBe(105.25);
    });
  });
});
