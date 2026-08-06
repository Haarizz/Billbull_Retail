import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The capability probe is what stands between a version-skewed till and a sale posted with
 * no payment against it, so its failure modes are pinned here rather than left to manual
 * testing: a server that predates the endpoint must read as "unsupported", and an
 * unreachable server must never read as "supported".
 */

const get = vi.fn();
vi.mock('../../../api/axiosConfig', () => ({ default: { get: (...a) => get(...a) } }));

async function loadApi() {
  vi.resetModules();
  return import('../../../api/posApi');
}

afterEach(() => {
  get.mockReset();
});

describe('checkout capability negotiation', () => {
  it('reports allocation support from a current server', async () => {
    get.mockResolvedValue({
      data: {
        paymentAllocations: true,
        legacyPaymentScalars: true,
        maxCardAllocations: 5,
        supportedAllocationTypes: ['CASH', 'CARD', 'ONLINE', 'CREDIT', 'ADVANCE'],
        checkoutApiVersion: 2,
      },
    });
    const { getPosCheckoutCapabilities } = await loadApi();

    const result = await getPosCheckoutCapabilities();

    expect(result.ok).toBe(true);
    expect(result.capabilities.paymentAllocations).toBe(true);
    expect(result.capabilities.checkoutApiVersion).toBe(2);
  });

  it('treats a missing endpoint as proof the server predates allocations', async () => {
    // A 404 is not an error to swallow — it is the answer. That server would accept the
    // checkout and silently ignore the payment.
    get.mockRejectedValue({ response: { status: 404 } });
    const { getPosCheckoutCapabilities } = await loadApi();

    const result = await getPosCheckoutCapabilities();

    expect(result.ok).toBe(true);
    expect(result.capabilities.paymentAllocations).toBe(false);
    expect(result.capabilities.checkoutApiVersion).toBe(1);
  });

  it('does not claim support when the server cannot be reached', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    const { getPosCheckoutCapabilities } = await loadApi();

    const result = await getPosCheckoutCapabilities();

    // ok:false means "unknown", which the hook renders as blocked-with-retry — never as
    // supported. Guessing here is what would lose the tender.
    expect(result.ok).toBe(false);
    expect(result.capabilities).toBeUndefined();
  });

  it('reports an explicit refusal from a server that knows the field but rejects it', async () => {
    get.mockResolvedValue({ data: { paymentAllocations: false, checkoutApiVersion: 1 } });
    const { getPosCheckoutCapabilities } = await loadApi();

    const result = await getPosCheckoutCapabilities();

    expect(result.ok).toBe(true);
    expect(result.capabilities.paymentAllocations).toBe(false);
  });
});
