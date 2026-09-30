import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// --- Module mocks ------------------------------------------------------------

const productFetch = vi.fn();
const ledgerFetch = vi.fn();
const customerFetch = vi.fn();
const vendorFetch = vi.fn();

vi.mock('../../api/entityDetailApi', async () => {
  class EntityDetailForbiddenError extends Error {
    constructor(message = 'Forbidden') {
      super(message);
      this.name = 'EntityDetailForbiddenError';
      this.forbidden = true;
    }
  }
  return {
    EntityDetailForbiddenError,
    ENTITY_DETAIL_FETCHERS: {
      product: (...args) => productFetch(...args),
      ledger: (...args) => ledgerFetch(...args),
      customer: (...args) => customerFetch(...args),
      vendor: (...args) => vendorFetch(...args),
    },
  };
});

import useEntityDetail, { ENTITY_DETAIL_DEBOUNCE_MS } from '../useEntityDetail';
import { EntityDetailForbiddenError } from '../../api/entityDetailApi';

// --- Helpers -----------------------------------------------------------------

const PRODUCT = { type: 'product', id: '11', code: 'WKB-2024' };
const OTHER_PRODUCT = { type: 'product', id: '12', code: 'MSE-2024' };
const CUSTOMER = { type: 'customer', id: '3' };
const VENDOR = { type: 'vendor', id: '21' };
// Employee is the type that genuinely has no panel — it stands in for "unsupported"
// now that Customer and Vendor have one.
const EMPLOYEE = { type: 'employee', id: '234' };

/** A promise plus the handles to settle it, so a test can control request ordering. */
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * Fires the debounce timer and lets the resulting promise chain settle.
 *
 * <p>`waitFor` polls on a real timer, which never advances under fake timers, so the
 * flush is done explicitly here instead.
 */
const advancePastDebounce = async () => {
  await act(async () => {
    vi.advanceTimersByTime(ENTITY_DETAIL_DEBOUNCE_MS + 10);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useEntityDetail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    productFetch.mockReset();
    ledgerFetch.mockReset();
    customerFetch.mockReset();
    vendorFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fetches after the debounce and exposes the payload', async () => {
    productFetch.mockResolvedValue({ name: 'Wireless Keyboard Pro' });

    const { result } = renderHook(() => useEntityDetail(PRODUCT, { enabled: true }));

    expect(result.current.status).toBe('loading');
    expect(productFetch).not.toHaveBeenCalled();

    await advancePastDebounce();

    await settle();
    expect(result.current.status).toBe('success');
    expect(result.current.data).toEqual({ name: 'Wireless Keyboard Pro' });
    expect(productFetch).toHaveBeenCalledTimes(1);
  });

  it('issues no request while the selection keeps moving', async () => {
    productFetch.mockResolvedValue({ name: 'x' });

    const { rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: PRODUCT } }
    );

    // Three rows walked past faster than the debounce — the key-repeat case.
    await act(async () => { vi.advanceTimersByTime(60); });
    rerender({ selected: OTHER_PRODUCT });
    await act(async () => { vi.advanceTimersByTime(60); });
    rerender({ selected: PRODUCT });

    expect(productFetch).not.toHaveBeenCalled();

    await advancePastDebounce();
    expect(productFetch).toHaveBeenCalledTimes(1);
  });

  it('aborts the previous request when the selection changes', async () => {
    const first = deferred();
    productFetch.mockImplementationOnce(() => first.promise).mockResolvedValue({ name: 'second' });

    const { result, rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: PRODUCT } }
    );

    await advancePastDebounce();
    const firstSignal = productFetch.mock.calls[0][1].signal;
    expect(firstSignal.aborted).toBe(false);

    rerender({ selected: OTHER_PRODUCT });
    expect(firstSignal.aborted).toBe(true);

    await advancePastDebounce();
    await settle();
    expect(result.current.status).toBe('success');
    expect(result.current.data).toEqual({ name: 'second' });
  });

  it('ignores a stale response that lands after the selection moved on', async () => {
    const stale = deferred();
    productFetch.mockImplementationOnce(() => stale.promise).mockResolvedValue({ name: 'current' });

    const { result, rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: PRODUCT } }
    );
    await advancePastDebounce();

    rerender({ selected: OTHER_PRODUCT });
    await advancePastDebounce();
    await settle();
    expect(result.current.data).toEqual({ name: 'current' });

    // The first request finally answers — for a row that is no longer selected.
    await act(async () => {
      stale.resolve({ name: 'stale' });
      await Promise.resolve();
    });

    expect(result.current.data).toEqual({ name: 'current' });
  });

  it('serves a repeated selection from the session cache without a second request', async () => {
    productFetch.mockResolvedValue({ name: 'Wireless Keyboard Pro' });

    const { result, rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: PRODUCT } }
    );
    await advancePastDebounce();
    await settle();
    expect(result.current.status).toBe('success');

    rerender({ selected: OTHER_PRODUCT });
    await advancePastDebounce();
    rerender({ selected: PRODUCT });

    // A cache hit renders immediately — no loading flash, no second debounce.
    expect(result.current.status).toBe('success');
    expect(result.current.data).toEqual({ name: 'Wireless Keyboard Pro' });
    expect(productFetch).toHaveBeenCalledTimes(2); // one per distinct product
  });

  it('keys the cache by type as well as id', async () => {
    productFetch.mockResolvedValue({ name: 'product 11' });
    ledgerFetch.mockResolvedValue({ accountName: 'ledger 11' });

    const { result, rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: { type: 'product', id: '11' } } }
    );
    await advancePastDebounce();
    await settle();
    expect(result.current.data).toEqual({ name: 'product 11' });

    rerender({ selected: { type: 'ledger', id: '11' } });
    await advancePastDebounce();
    await settle();
    expect(result.current.data).toEqual({ accountName: 'ledger 11' });
  });

  it('reports a 403 as a distinct forbidden state', async () => {
    productFetch.mockRejectedValue(new EntityDetailForbiddenError());

    const { result } = renderHook(() => useEntityDetail(PRODUCT, { enabled: true }));
    await advancePastDebounce();

    await settle();
    expect(result.current.status).toBe('error');
    expect(result.current.forbidden).toBe(true);
    expect(result.current.error).toMatch(/permission/i);
  });

  it('treats a bare axios 403 as forbidden too', async () => {
    productFetch.mockRejectedValue({ response: { status: 403 } });

    const { result } = renderHook(() => useEntityDetail(PRODUCT, { enabled: true }));
    await advancePastDebounce();

    await settle();
    expect(result.current.forbidden).toBe(true);
  });

  it('reports an ordinary failure as an error, not as a permission problem', async () => {
    productFetch.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEntityDetail(PRODUCT, { enabled: true }));
    await advancePastDebounce();

    await settle();
    expect(result.current.status).toBe('error');
    expect(result.current.forbidden).toBe(false);
  });

  it('stays idle for a type with no detail panel and issues no request', async () => {
    const { result } = renderHook(() => useEntityDetail(EMPLOYEE, { enabled: true }));
    await advancePastDebounce();

    expect(result.current.status).toBe('idle');
    expect(result.current.supported).toBe(false);
    expect(productFetch).not.toHaveBeenCalled();
    expect(ledgerFetch).not.toHaveBeenCalled();
    expect(customerFetch).not.toHaveBeenCalled();
    expect(vendorFetch).not.toHaveBeenCalled();
  });

  // --- Customer / Vendor -----------------------------------------------------

  it('never leaves customer data on screen after switching to a vendor', async () => {
    customerFetch.mockResolvedValue({ entityType: 'customer', customerName: 'Acme Corp Ltd' });
    const pendingVendor = deferred();
    vendorFetch.mockReturnValue(pendingVendor.promise);

    const { result, rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: CUSTOMER } }
    );
    await advancePastDebounce();
    await settle();
    expect(result.current.data.customerName).toBe('Acme Corp Ltd');

    // While the vendor request is still in flight the pane must read as loading, not
    // keep showing the customer's figures under the vendor's name.
    rerender({ selected: VENDOR });
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();

    await act(async () => {
      pendingVendor.resolve({ entityType: 'vendor', vendorName: 'TechSupply FZCO' });
    });
    await advancePastDebounce();
    await settle();
    expect(result.current.data.vendorName).toBe('TechSupply FZCO');
  });

  it('never leaves vendor data on screen after switching to a customer', async () => {
    vendorFetch.mockResolvedValue({ entityType: 'vendor', vendorName: 'TechSupply FZCO' });
    customerFetch.mockResolvedValue({ entityType: 'customer', customerName: 'Acme Corp Ltd' });

    const { result, rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: VENDOR } }
    );
    await advancePastDebounce();
    await settle();
    expect(result.current.data.vendorName).toBe('TechSupply FZCO');

    rerender({ selected: CUSTOMER });
    expect(result.current.data).toBeNull();
    await advancePastDebounce();
    await settle();
    expect(result.current.data).toEqual({ entityType: 'customer', customerName: 'Acme Corp Ltd' });
  });

  it('debounces a walk through customer and vendor rows into one request', async () => {
    customerFetch.mockResolvedValue({ entityType: 'customer' });
    vendorFetch.mockResolvedValue({ entityType: 'vendor' });

    const { rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: CUSTOMER } }
    );
    // Arrow-key run: three stops, none of them settled on.
    rerender({ selected: VENDOR });
    rerender({ selected: { type: 'customer', id: '4' } });
    rerender({ selected: VENDOR });

    expect(customerFetch).not.toHaveBeenCalled();
    expect(vendorFetch).not.toHaveBeenCalled();

    await advancePastDebounce();
    await settle();

    expect(customerFetch).not.toHaveBeenCalled();
    expect(vendorFetch).toHaveBeenCalledTimes(1);
  });

  it('serves a repeated vendor selection from the session cache', async () => {
    vendorFetch.mockResolvedValue({ entityType: 'vendor', vendorName: 'TechSupply FZCO' });
    customerFetch.mockResolvedValue({ entityType: 'customer' });

    const { rerender } = renderHook(
      ({ selected }) => useEntityDetail(selected, { enabled: true }),
      { initialProps: { selected: VENDOR } }
    );
    await advancePastDebounce();
    await settle();
    expect(vendorFetch).toHaveBeenCalledTimes(1);

    rerender({ selected: CUSTOMER });
    await advancePastDebounce();
    await settle();

    rerender({ selected: VENDOR });
    await advancePastDebounce();
    await settle();

    expect(vendorFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a denied customer summary as forbidden, not as a failure', async () => {
    customerFetch.mockRejectedValue(new EntityDetailForbiddenError());

    const { result } = renderHook(() => useEntityDetail(CUSTOMER, { enabled: true }));
    await advancePastDebounce();
    await settle();

    expect(result.current.status).toBe('error');
    expect(result.current.forbidden).toBe(true);
  });

  it('stays idle with nothing selected', async () => {
    const { result } = renderHook(() => useEntityDetail(null, { enabled: true }));
    await advancePastDebounce();
    expect(result.current.status).toBe('idle');
    expect(productFetch).not.toHaveBeenCalled();
  });

  it('aborts, clears and drops the cache when the modal closes', async () => {
    productFetch.mockResolvedValue({ name: 'Wireless Keyboard Pro' });

    const { result, rerender } = renderHook(
      ({ enabled }) => useEntityDetail(PRODUCT, { enabled }),
      { initialProps: { enabled: true } }
    );
    await advancePastDebounce();
    await settle();
    expect(result.current.status).toBe('success');

    rerender({ enabled: false });
    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();

    // Reopening refetches rather than showing a figure that may have moved since.
    rerender({ enabled: true });
    await advancePastDebounce();
    await settle();
    expect(result.current.status).toBe('success');
    expect(productFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight request on unmount', async () => {
    productFetch.mockImplementation(() => deferred().promise);

    const { unmount } = renderHook(() => useEntityDetail(PRODUCT, { enabled: true }));
    await advancePastDebounce();

    const signal = productFetch.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
