import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ENTITY_ROUTE_MAP,
  entitySectionForResult,
  navigateToEntity,
  navigateToSearchResult,
  resolveEntityRoute,
} from '../entityNavigation';

/**
 * entityNavigation is the single source of truth for "which page opens this entity, and
 * under which router-state key". Every mapping here has a matching consumer test beside
 * the destination page; if one of these expectations changes, that page has to change too.
 */
describe('entityNavigation', () => {
  let navigate;

  beforeEach(() => {
    navigate = vi.fn();
  });

  const navigateFor = (result) => {
    const handled = navigateToSearchResult(navigate, result);
    return { handled, call: navigate.mock.calls[0] };
  };

  describe('result -> destination', () => {
    it('sends a customer to the customer page as customerId', () => {
      const { handled, call } = navigateFor({ type: 'customer', id: '3', title: 'Acme Corp Ltd' });
      expect(handled).toBe(true);
      expect(call).toEqual(['/sales/customers', { state: { customerId: '3' } }]);
    });

    it('sends a vendor to the vendor page as vendorId', () => {
      const { handled, call } = navigateFor({ type: 'vendor', id: '21', title: 'TechSupply FZCO' });
      expect(handled).toBe(true);
      expect(call).toEqual(['/purchases/vendors', { state: { vendorId: '21' } }]);
    });

    it('sends a ledger account by account code, on the chart tab', () => {
      const { handled, call } = navigateFor({
        type: 'ledger',
        id: 'acc-1',
        code: '1100',
        title: 'Accounts Receivable',
      });
      expect(handled).toBe(true);
      // The code, not the surrogate id: every ledger read downstream is keyed by code.
      expect(call).toEqual(['/finance/ledger', { state: { accountCode: '1100', tab: 'chart' } }]);
    });

    it('refuses to navigate for a ledger account with no code', () => {
      expect(entitySectionForResult({ type: 'ledger', id: 'acc-1' })).toBeNull();
      expect(navigateToSearchResult(navigate, { type: 'ledger', id: 'acc-1' })).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('sends an employee to the payroll employees page as employeeId', () => {
      const { handled, call } = navigateFor({ type: 'employee', id: '234', title: 'Ahmed' });
      expect(handled).toBe(true);
      expect(call).toEqual(['/payroll/employees', { state: { employeeId: '234' } }]);
    });

    it('still maps the six types the dashboard dropdown already shipped', () => {
      expect(entitySectionForResult({ type: 'product', id: '11' }))
        .toEqual({ section: 'inventory-product-detail', params: { productId: '11' } });
      expect(entitySectionForResult({ type: 'invoice', id: '5' }))
        .toEqual({ section: 'sales-invoice-detail', params: { invoiceId: '5' } });
      expect(entitySectionForResult({ type: 'grn', id: '7' }))
        .toEqual({ section: 'grn-detail', params: { grnId: '7' } });
      expect(entitySectionForResult({ type: 'quotation', id: '9' }))
        .toEqual({ section: 'quotation-detail', params: { quotationId: '9' } });
      expect(entitySectionForResult({ type: 'lpo', id: '2', title: 'LPO-001' })?.section)
        .toBe('lpo-detail');
    });

    it('returns null for an unknown or absent type rather than guessing a route', () => {
      expect(entitySectionForResult({ type: 'spaceship', id: '1' })).toBeNull();
      expect(entitySectionForResult({})).toBeNull();
      expect(entitySectionForResult(null)).toBeNull();
      expect(navigateToSearchResult(navigate, { type: 'spaceship', id: '1' })).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('route map', () => {
    it('keeps every newly added section pointing at a real page path', () => {
      expect(ENTITY_ROUTE_MAP['vendor-detail'].path).toBe('/purchases/vendors');
      expect(ENTITY_ROUTE_MAP['ledger-account-detail'].path).toBe('/finance/ledger');
      expect(ENTITY_ROUTE_MAP['employee-detail'].path).toBe('/payroll/employees');
    });

    it('resolves a raw path section unchanged', () => {
      expect(resolveEntityRoute('/somewhere')).toEqual({ path: '/somewhere', state: {} });
    });

    it('resolves an unknown section to null', () => {
      expect(resolveEntityRoute('not-a-section')).toBeNull();
      expect(navigateToEntity(navigate, 'not-a-section')).toBe(false);
    });

    it('merges extraState so a caller can tag where the navigation came from', () => {
      navigateToEntity(navigate, 'vendor-detail', { vendorId: '21' }, { dashboardSource: true });
      expect(navigate).toHaveBeenCalledWith('/purchases/vendors', {
        state: { vendorId: '21', dashboardSource: true },
      });
    });
  });
});
