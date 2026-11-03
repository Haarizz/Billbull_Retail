import { describe, expect, it } from 'vitest';
import {
  changeItemsUnit, lineIdForUnit, lineInUnit, lineUnitLocked, unitOfLine, unitPriceFor,
} from '../features/cart/lineUnits';
import { buildPosCheckoutItems } from '../posUtils';

const PCS = { unit: 'PCS', conversion: 1, base: true, price: 89 };
const BOX = { unit: 'Box of 12', conversion: 12, base: false, price: 1068 };
const CARTON = { unit: 'Carton', conversion: 48, base: false, price: null };
const UNITS = [PCS, BOX, CARTON];

const line = (over = {}) => ({
  id: 7, productId: 7, code: 'SUP-002', name: 'Creatine', price: 89, quantity: 3, discount: 0,
  minPrice: 80, maxPrice: 100, retailPrice: 89, cost: 50, total: 267, ...over,
});

describe('lineUnits', () => {
  it('keys a multiple-unit line apart from the base line', () => {
    expect(lineIdForUnit(7, PCS)).toBe(7);
    expect(lineIdForUnit(7, null)).toBe(7);
    expect(lineIdForUnit(7, BOX)).toBe('7::U:Box of 12');
  });

  it('re-expresses a line in a box: server price, scaled bounds, same quantity', () => {
    const boxed = lineInUnit(line({ priceOverridden: true }), BOX);
    expect(boxed).toMatchObject({
      id: '7::U:Box of 12', productId: 7, unit: 'Box of 12', unitConversion: 12,
      price: 1068, quantity: 3, total: 3204, priceOverridden: false,
      minPrice: 960, maxPrice: 1200, retailPrice: 1068, cost: 600,
    });
    // Back to pieces restores the base bounds from unitBase, not from the scaled ones.
    const back = lineInUnit(boxed, PCS);
    expect(back).toMatchObject({ id: 7, price: 89, minPrice: 80, cost: 50, unitConversion: 1 });
  });

  it('falls back to the line price scaled across units when the server has none', () => {
    expect(unitPriceFor(line(), CARTON)).toBe(4272);
    expect(unitPriceFor(line({ price: 1068, unitConversion: 12 }), CARTON)).toBe(4272);
  });

  it('merges into a line already sold in that unit', () => {
    const items = [line(), lineInUnit(line({ quantity: 2 }), BOX)];
    const { items: next, lineId } = changeItemsUnit(items, 7, BOX);
    expect(lineId).toBe('7::U:Box of 12');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ quantity: 5, total: 5340 });
  });

  it('leaves batch / Sales Order lines alone', () => {
    const items = [line({ batchControlled: true })];
    expect(changeItemsUnit(items, 7, BOX).items).toBe(items);
    expect(lineUnitLocked(line({ salesOrderItemId: 4 }))).toBe(true);
  });

  it("finds the line's current unit, defaulting to the base unit", () => {
    expect(unitOfLine(line(), UNITS)).toBe(PCS);
    expect(unitOfLine(line({ unit: 'box of 12' }), UNITS)).toBe(BOX);
    expect(unitOfLine(line(), [])).toBeNull();
  });

  it('sends the unit at checkout; a plain line still sends Each', () => {
    const [plain, boxed] = buildPosCheckoutItems([line(), lineInUnit(line(), BOX)]);
    expect(plain.unit).toBe('Each');
    expect(boxed).toMatchObject({ unit: 'Box of 12', price: 1068, quantity: 3 });
  });
});
