import { describe, expect, it } from 'vitest';
import { resolvePurchaseTaxRate } from '../vatMath';

describe('resolvePurchaseTaxRate', () => {
    it('uses the product Purchase Tax over the branch default', () => {
        expect(resolvePurchaseTaxRate({ purchaseTax: 15 }, 5)).toBe(15);
        expect(resolvePurchaseTaxRate({ purchaseTax: '12.5' }, 5)).toBe(12.5);
    });

    it('honours an explicit 0 on the product', () => {
        expect(resolvePurchaseTaxRate({ purchaseTax: 0 }, 5)).toBe(0);
        expect(resolvePurchaseTaxRate({ purchaseTax: '0' }, 5)).toBe(0);
    });

    it('falls back to the branch default when the product has none', () => {
        expect(resolvePurchaseTaxRate({ purchaseTax: null }, 5)).toBe(5);
        expect(resolvePurchaseTaxRate({ purchaseTax: '' }, '7.5')).toBe(7.5);
        expect(resolvePurchaseTaxRate({}, 5)).toBe(5);
    });

    it('does not fall back to the product Sales Tax', () => {
        expect(resolvePurchaseTaxRate({ purchaseTax: null, salesTax: 5, taxRate: 5 }, null)).toBe(0);
    });

    it('returns 0 when neither is configured or the default has not loaded', () => {
        expect(resolvePurchaseTaxRate({ purchaseTax: null }, null)).toBe(0);
        expect(resolvePurchaseTaxRate(null, undefined)).toBe(0);
    });
});
