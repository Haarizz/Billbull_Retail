import fs from 'node:fs';
import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AlertCircle, Star, X } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { posCreditBalance } from '../../../../api/posApi';
import CustomerPicker from '../CustomerPicker';
import { CurrencyAmount } from '../POSCurrency';
import { toNumber } from '../posUtils';
import CreditBalance from '../features/customers/CreditBalance';

vi.mock('../../../../api/posApi', () => ({ posCreditBalance: vi.fn() }));

/**
 * CHARACTERIZATION — the POSSales.jsx "Credit Balance" modal.
 *
 * The region is now rendered by POS/features/customers/CreditBalance.jsx. The extraction is a
 * presentation move only: the three useStates, the auto-load effect and the
 * `showCreditBalance &&` mount condition all stay in POSSales, and the child receives exactly
 * the 7 bindings below under their ORIGINAL POSSales names. Pre-extraction the region was
 * POSSales.jsx:9853–9961 (109 lines): a hand-rolled fixed overlay (no Radix Dialog, no portal,
 * no key, no nested dialog), conditionally MOUNTED by `showCreditBalance && IIFE`.
 *
 * The harnesses below reproduce the parent-side ownership exactly:
 *   - `useCreditBalanceParent`: the three useState declarations and the auto-load effect
 *     copied VERBATIM (between EFFECT markers),
 *   - `ParentProbes`: the ONLY opener, POSTouchScreen's 'credit-balance' function-button action,
 *   - `CreditBalanceHarness`: the PRE-EXTRACTION region copied VERBATIM (REGION markers),
 *   - `ExtractedCreditBalanceHarness`: the POSSales call site copied VERBATIM (CALLSITE
 *     markers), rendering the shipped component.
 * Every behavioural describe runs against BOTH harnesses. The `source contract` block asserts
 * the child's body is byte-identical to the reference region, and the call site and effect
 * are byte-identical to POSSales, so the suite fails the moment either side drifts.
 *
 * Direct dependency surface of the region (7 POSSales bindings, derived from the JSX):
 *   state:   showCreditBalance, creditBalanceQuery, creditBalanceResult
 *   setters: setShowCreditBalance, setCreditBalanceQuery, setCreditBalanceResult
 *   data:    posCustomers           (POSSales useState:613, loaded by POSSales)
 *   module imports only: posCreditBalance (api), CustomerPicker, CurrencyAmount, toNumber,
 *   lucide Star / X / AlertCircle.
 * NOT read by the region, but coupled to its state from OUTSIDE it:
 *   - the auto-load effect (reads selectedCustomerData, writes query/result),
 *   - touchScreenProps (POSSales.jsx ~7044) hands all three setters to POSTouchScreen.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - `doCreditSearch` is dead code: defined inside the IIFE, never referenced.
 *   - The opener resets query/result, then the effect overwrites query with the POS-selected
 *     customer's id and fetches by `code || id`. Walk-in / no customer => empty state, no fetch.
 *   - The picker path fetches by `c.code || c.mobile || String(customerId)`; mapPosCustomer
 *     never sets `mobile`, so a code-less mapped customer is looked up by its id.
 *   - Picker path has NO cancellation: a late response lands after close, or after a newer
 *     selection (last resolver wins). The effect path IS cancelled on close/customer change.
 *   - The effect re-fires whenever selectedCustomerData changes IDENTITY while open, and
 *     overwrites whatever the cashier picked in the modal.
 *   - Switching the POS customer to walk-in while open leaves the previous result on screen.
 *   - Close does NOT reset query/result (state lives in POSSales); only the opener does.
 *   - "not found" copy says "for the scanned card" regardless of how the search happened.
 *   - Utilisation bar only when creditLimit > 0; pct clamps at 100 but NOT at 0 (negative
 *     outstanding yields a negative width). >=90 red, >=70 amber, else teal.
 *   - No Escape handling, no focus management; backdrop click closes.
 *   - A result object without `found` renders an empty body (no state branch matches).
 */

// ── harness: parent-owned state + verbatim effect + opener ──────────────────────────────
function useCreditBalanceParent(selectedCustomerData) {
  const [showCreditBalance, setShowCreditBalance] = useState(false);
  const [creditBalanceQuery, setCreditBalanceQuery] = useState('');
  const [creditBalanceResult, setCreditBalanceResult] = useState(null);

  // Lint exemption applies to the byte-identical production copy only; POSSales carries the same pattern.
  /* eslint-disable react-hooks/set-state-in-effect */
  // EFFECT-VERBATIM-START
  // Credit Balance function-button modal: auto-load the currently selected POS
  // customer's due/credit balance on open, and refresh if the selection changes
  // while the modal stays open (e.g. after a transaction updates their balance).
  useEffect(() => {
    if (!showCreditBalance || !selectedCustomerData || selectedCustomerData.id === 'walk-in') return;
    const code = selectedCustomerData.code || selectedCustomerData.id;
    if (!code) return;
    setCreditBalanceQuery(selectedCustomerData.id);
    let cancelled = false;
    setCreditBalanceResult('searching');
    posCreditBalance(code)
      .then(res => { if (!cancelled) setCreditBalanceResult(res.found ? res : 'notfound'); })
      .catch(() => { if (!cancelled) setCreditBalanceResult('notfound'); });
    return () => { cancelled = true; };
  }, [showCreditBalance, selectedCustomerData]);
  // EFFECT-VERBATIM-END
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    showCreditBalance, setShowCreditBalance,
    creditBalanceQuery, setCreditBalanceQuery,
    creditBalanceResult, setCreditBalanceResult,
  };
}

function ParentProbes({ setShowCreditBalance, creditBalanceQuery, setCreditBalanceQuery, creditBalanceResult, setCreditBalanceResult }) {
  return (
    <>
      <button
        data-testid="fn-credit-balance"
        onClick={() => { setCreditBalanceQuery(''); setCreditBalanceResult(null); setShowCreditBalance(true); }}
      >
        fn
      </button>
      <button data-testid="raw-open" onClick={() => setShowCreditBalance(true)}>raw</button>
      <button data-testid="raw-set-unfound" onClick={() => setCreditBalanceResult({ customer: null })}>unfound</button>
      <span data-testid="probe-query">{String(creditBalanceQuery)}</span>
      <span data-testid="probe-result">
        {creditBalanceResult && typeof creditBalanceResult === 'object' ? `obj:${creditBalanceResult.customer?.name}` : String(creditBalanceResult)}
      </span>
    </>
  );
}

// ── reference: the pre-extraction POSSales region, verbatim ─────────────────────────────
function CreditBalanceHarness({ posCustomers, selectedCustomerData }) {
  const {
    showCreditBalance, setShowCreditBalance,
    creditBalanceQuery, setCreditBalanceQuery,
    creditBalanceResult, setCreditBalanceResult,
  } = useCreditBalanceParent(selectedCustomerData);

  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ setShowCreditBalance, creditBalanceQuery, setCreditBalanceQuery, creditBalanceResult, setCreditBalanceResult }} />
      {/* REGION-VERBATIM-START */}
      {/* ─── CREDIT BALANCE MODAL ─── */}
      {showCreditBalance && (() => {
        // creditBalanceResult: null | 'searching' | 'notfound' | { found, customer, outstanding, creditLimit, advanceBalance }
        const data = creditBalanceResult && typeof creditBalanceResult === 'object' && creditBalanceResult.found ? creditBalanceResult : null;
        const doCreditSearch = async () => {
          const q = creditBalanceQuery.trim();
          if (!q) { setCreditBalanceResult('notfound'); return; }
          setCreditBalanceResult('searching');
          try {
            const res = await posCreditBalance(q);
            setCreditBalanceResult(res.found ? res : 'notfound');
          } catch { setCreditBalanceResult('notfound'); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreditBalance(false)} />
            <div className="relative bg-[#F7F7FA] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Star className="h-4 w-4 text-violet-600" /><span className="text-base font-semibold text-[#1E293B]">Credit Balance / Advance Check</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Search customer to view outstanding balance, credit limit, and advance (deposit) balance.</p>
                </div>
                <button onClick={() => setShowCreditBalance(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex gap-2 shrink-0 overflow-visible">
                <div className="flex-1">
                  <CustomerPicker
                    customers={posCustomers}
                    value={creditBalanceQuery}
                    onChange={async (customerId) => {
                      setCreditBalanceQuery(customerId || '');
                      if (!customerId) {
                        setCreditBalanceResult(null);
                        return;
                      }
                      const c = posCustomers.find(x => x.id === customerId);
                      if (!c) return;
                      setCreditBalanceResult('searching');
                      try {
                        const res = await posCreditBalance(c.code || c.mobile || String(customerId));
                        setCreditBalanceResult(res.found ? res : 'notfound');
                      } catch { setCreditBalanceResult('notfound'); }
                    }}
                    placeholder="Search or select customer..."
                  />
                </div>
                <button onClick={() => { setCreditBalanceQuery(''); setCreditBalanceResult(null); }} className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50">Clear</button>
              </div>
              <div className="overflow-auto flex-1 p-5">
                {creditBalanceResult === null && <div className="flex flex-col items-center justify-center h-40 text-center"><Star className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Search customer to check balance.</p></div>}
                {creditBalanceResult === 'searching' && <div className="flex flex-col items-center justify-center h-40 text-center"><div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm text-gray-400">Searching...</p></div>}
                {creditBalanceResult === 'notfound' && <div className="flex flex-col items-center justify-center h-40 text-center"><AlertCircle className="h-10 w-10 text-gray-300 mb-3" /><p className="text-sm text-gray-500">No customer found for the scanned card.</p></div>}
                {data && (
                  <div className="space-y-4">
                    {/* Customer Card */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-[#1E293B]">{data.customer.name}</p>
                          <p className="text-xs text-gray-500">{data.customer.code}</p>
                        </div>
                        <span className={`text-xs rounded px-2 py-0.5 ${data.customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{data.customer.status || '—'}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        {[['Mobile', data.customer.mobile || '—'], ['Email', data.customer.email || '—'], ['Type', data.customer.groupType || '—']].map(([k, v]) => (
                          <div key={k}><span className="text-gray-400">{k}:</span><span className="ml-1 text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { label: 'Outstanding', val: <CurrencyAmount amount={toNumber(data.outstanding, 0)} />, sub: 'unpaid invoices', color: 'text-red-600' },
                        { label: 'Credit Limit', val: <CurrencyAmount amount={toNumber(data.creditLimit, 0)} />, sub: 'approved limit', color: 'text-[#327F74]' },
                        { label: 'Advance Balance', val: <CurrencyAmount amount={toNumber(data.advanceBalance, 0)} />, sub: 'available deposit', color: 'text-violet-600' },
                      ].map(k => (
                        <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg p-4 text-center shadow-sm">
                          <p className="text-[11px] text-gray-400 mb-1">{k.label}</p>
                          <p className={`text-lg font-bold ${k.color}`}>{k.val}</p>
                          <p className="text-[10px] text-gray-400">{k.sub}</p>
                        </div>
                      ))}
                    </div>
                    {/* Credit limit utilisation bar */}
                    {toNumber(data.creditLimit, 0) > 0 && (() => {
                      const pct = Math.min(100, (toNumber(data.outstanding, 0) / toNumber(data.creditLimit, 0)) * 100);
                      const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[#327F74]';
                      return (
                        <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Credit utilisation</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                <button onClick={() => setShowCreditBalance(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── shipped: the POSSales call site, verbatim ───────────────────────────────────────────
function ExtractedCreditBalanceHarness({ posCustomers, selectedCustomerData }) {
  const {
    showCreditBalance, setShowCreditBalance,
    creditBalanceQuery, setCreditBalanceQuery,
    creditBalanceResult, setCreditBalanceResult,
  } = useCreditBalanceParent(selectedCustomerData);

  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ setShowCreditBalance, creditBalanceQuery, setCreditBalanceQuery, creditBalanceResult, setCreditBalanceResult }} />
      {/* CALLSITE-VERBATIM-START */}
      {/* ─── CREDIT BALANCE MODAL ─── */}
      {showCreditBalance && (
        <CreditBalance
          showCreditBalance={showCreditBalance}
          setShowCreditBalance={setShowCreditBalance}
          creditBalanceQuery={creditBalanceQuery}
          setCreditBalanceQuery={setCreditBalanceQuery}
          creditBalanceResult={creditBalanceResult}
          setCreditBalanceResult={setCreditBalanceResult}
          posCustomers={posCustomers}
        />
      )}
      {/* CALLSITE-VERBATIM-END */}
    </div>
  );
}

const HARNESSES = { reference: CreditBalanceHarness, extracted: ExtractedCreditBalanceHarness };
let Harness = CreditBalanceHarness;

// ── fixtures ────────────────────────────────────────────────────────────────────────────
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const makeCustomer = (o = {}) => ({ id: '1', code: 'C001', name: 'Alice Trading', phone: '0501111111', balance: 0, ...o });
const CUSTOMERS = [
  makeCustomer(),
  makeCustomer({ id: '2', code: 'C002', name: 'Bob Stores', phone: '0502222222' }),
  makeCustomer({ id: '3', code: '', name: 'Carol NoCode', phone: '' }),
];
const WALK_IN = { id: 'walk-in', name: 'Walk-in Customer' };

const found = (o = {}) => ({
  found: true,
  customer: { name: 'Alice Trading', code: 'C001', status: 'Active', mobile: '0501111111', email: 'a@x.test', groupType: 'Retail', ...(o.customer || {}) },
  outstanding: 250,
  creditLimit: 1000,
  advanceBalance: 40,
  ...o,
  ...(o.customer ? { customer: { name: 'Alice Trading', code: 'C001', status: 'Active', mobile: '0501111111', email: 'a@x.test', groupType: 'Retail', ...o.customer } } : {}),
});

const renderHarness = (props = {}) => {
  const p = { posCustomers: CUSTOMERS, selectedCustomerData: WALK_IN, ...props };
  const H = Harness;
  const utils = render(<H {...p} />);
  const rerender = (next = {}) => utils.rerender(<H {...p} {...next} />);
  return { ...utils, rerender };
};

const TITLE = 'Credit Balance / Advance Check';
const open = () => fireEvent.click(screen.getByTestId('fn-credit-balance'));
const flush = async () => { await act(async () => {}); };
const query = () => screen.getByTestId('probe-query').textContent;
const result = () => screen.getByTestId('probe-result').textContent;
// the picker's clickable shell — works whether it shows the input or a selected name
const openPicker = () => fireEvent.click(document.querySelector('.cursor-text'));
const pickCustomer = (name) => { openPicker(); fireEvent.click(screen.getByText(name).closest('button')); };

beforeEach(() => { posCreditBalance.mockReset(); });
afterEach(() => { cleanup(); });

describe.each([['reference'], ['extracted']])('%s', (variant) => {
  beforeEach(() => { Harness = HARNESSES[variant]; });

  // ── closed / open ───────────────────────────────────────────────────────────────────────
  describe('closed state', () => {
    it('renders nothing and never calls the API while closed', () => {
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      expect(screen.queryByText(TITLE)).toBeNull();
      expect(posCreditBalance).not.toHaveBeenCalled();
      expect(query()).toBe('');
      expect(result()).toBe('null');
    });
  });

  describe('open with no POS customer (walk-in)', () => {
    it('shows header, picker, Clear, empty state and Close — without fetching', () => {
      renderHarness();
      open();
      expect(screen.getByText(TITLE)).toBeInTheDocument();
      expect(screen.getByText('Search customer to view outstanding balance, credit limit, and advance (deposit) balance.')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search or select customer...')).toBeInTheDocument();
      expect(screen.getByText('Search customer to check balance.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(posCreditBalance).not.toHaveBeenCalled();
      expect(query()).toBe('');
    });

    it('also does not fetch when selectedCustomerData is null', () => {
      renderHarness({ selectedCustomerData: null });
      open();
      expect(posCreditBalance).not.toHaveBeenCalled();
      expect(screen.getByText('Search customer to check balance.')).toBeInTheDocument();
    });

    it('is a fixed overlay rendered inline (no portal, no dialog role)', () => {
      const { container } = renderHarness();
      open();
      const overlay = container.querySelector('.fixed.inset-0.z-50');
      expect(overlay).not.toBeNull();
      expect(screen.getByTestId('pos-root').contains(overlay)).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('open with a POS-selected customer (auto-load effect)', () => {
    it('sets query to the customer id, shows Searching..., fetches by code', async () => {
      const d = deferred();
      posCreditBalance.mockReturnValue(d.promise);
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      expect(posCreditBalance).toHaveBeenCalledTimes(1);
      expect(posCreditBalance).toHaveBeenCalledWith('C001');
      expect(query()).toBe('1');
      expect(screen.getByText('Searching...')).toBeInTheDocument();
      // picker shows the selected customer's name (value = id resolved against posCustomers)
      expect(screen.getByText('Alice Trading')).toBeInTheDocument();
      await act(async () => { d.resolve(found()); });
      expect(screen.queryByText('Searching...')).toBeNull();
      expect(screen.getByText('C001')).toBeInTheDocument();
    });

    it('falls back to the id when the customer has no code', async () => {
      posCreditBalance.mockResolvedValue(found());
      renderHarness({ selectedCustomerData: CUSTOMERS[2] });
      open();
      expect(posCreditBalance).toHaveBeenCalledWith('3');
      await flush();
    });

    it('does nothing when neither code nor id is present', () => {
      renderHarness({ selectedCustomerData: { name: 'Ghost', code: '', id: '' } });
      open();
      expect(posCreditBalance).not.toHaveBeenCalled();
      expect(query()).toBe('');
    });

    it('shows the not-found copy when found=false', async () => {
      posCreditBalance.mockResolvedValue({ found: false });
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      expect(result()).toBe('notfound');
      expect(screen.getByText('No customer found for the scanned card.')).toBeInTheDocument();
    });

    it('shows the not-found copy when the request rejects', async () => {
      posCreditBalance.mockRejectedValue(new Error('boom'));
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      expect(screen.getByText('No customer found for the scanned card.')).toBeInTheDocument();
    });

    it('when the selected id is not in posCustomers the picker shows no name but the query is still set', async () => {
      posCreditBalance.mockResolvedValue(found());
      renderHarness({ posCustomers: [], selectedCustomerData: makeCustomer({ id: '99', code: 'Z99' }) });
      open();
      await flush();
      expect(query()).toBe('99');
      expect(posCreditBalance).toHaveBeenCalledWith('Z99');
      expect(screen.getByPlaceholderText('Search or select customer...')).toBeInTheDocument();
    });
  });

  // ── populated rendering ─────────────────────────────────────────────────────────────────
  describe('populated result', () => {
    const openWith = async (res) => {
      posCreditBalance.mockResolvedValue(res);
      const utils = renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      return utils;
    };

    it('renders the customer card, status chip and contact fields', async () => {
      await openWith(found());
      expect(screen.getByText('Active').className).toContain('bg-green-100');
      expect(screen.getByText('0501111111')).toBeInTheDocument();
      expect(screen.getByText('a@x.test')).toBeInTheDocument();
      expect(screen.getByText('Retail')).toBeInTheDocument();
      expect(screen.getByText('Mobile:')).toBeInTheDocument();
      expect(screen.getByText('Email:')).toBeInTheDocument();
      expect(screen.getByText('Type:')).toBeInTheDocument();
    });

    it('falls back to em dashes and a grey chip for missing fields / non-Active status', async () => {
      await openWith(found({ customer: { status: undefined, mobile: '', email: null, groupType: undefined } }));
      const dashes = screen.getAllByText('—');
      expect(dashes).toHaveLength(4);
      expect(dashes[0].className).toContain('bg-gray-100');
    });

    it('renders the three KPI cards with 2-dp currency amounts', async () => {
      await openWith(found({ outstanding: '250.5', creditLimit: 1000, advanceBalance: 'abc' }));
      ['Outstanding', 'Credit Limit', 'Advance Balance'].forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
      ['unpaid invoices', 'approved limit', 'available deposit'].forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
      expect(screen.getByText('250.50')).toBeInTheDocument();
      expect(screen.getByText('1000.00')).toBeInTheDocument();
      expect(screen.getByText('0.00')).toBeInTheDocument();
      expect(screen.getByText('Outstanding').nextSibling.className).toContain('text-red-600');
      expect(screen.getByText('Credit Limit').nextSibling.className).toContain('text-[#327F74]');
      expect(screen.getByText('Advance Balance').nextSibling.className).toContain('text-violet-600');
    });

    const bar = (container) => container.querySelector('.h-2 > div');

    it.each([
      [250, 1000, '25%', 'bg-[#327F74]'],
      [700, 1000, '70%', 'bg-amber-400'],
      [899, 1000, '90%', 'bg-amber-400'],
      [900, 1000, '90%', 'bg-red-500'],
      [5000, 1000, '100%', 'bg-red-500'],
      [-500, 1000, '-50%', 'bg-[#327F74]'],
    ])('utilisation outstanding=%s limit=%s -> %s %s', async (outstanding, creditLimit, label, color) => {
      const { container } = await openWith(found({ outstanding, creditLimit }));
      expect(screen.getByText('Credit utilisation')).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(bar(container).className).toContain(color);
    });

    it('pins the raw width style, including the unclamped fractional value', async () => {
      const { container } = await openWith(found({ outstanding: 1, creditLimit: 3 }));
      expect(screen.getByText('33%')).toBeInTheDocument();
      expect(bar(container).style.width).toBe(`${(1 / 3) * 100}%`);
    });

    it.each([0, -10, 'x', null])('hides the utilisation bar when creditLimit=%s', async (creditLimit) => {
      await openWith(found({ creditLimit }));
      expect(screen.queryByText('Credit utilisation')).toBeNull();
    });

    it('a result object without `found` renders an empty body', async () => {
      renderHarness();
      open();
      fireEvent.click(screen.getByTestId('raw-set-unfound'));
      expect(result()).toBe('obj:undefined');
      expect(screen.queryByText('Search customer to check balance.')).toBeNull();
      expect(screen.queryByText('Searching...')).toBeNull();
      expect(screen.queryByText('No customer found for the scanned card.')).toBeNull();
      expect(screen.queryByText('Credit Limit')).toBeNull();
    });
  });

  // ── picker / search / clear ─────────────────────────────────────────────────────────────
  describe('customer picker interactions', () => {
    it('lists up to 10 posCustomers when opened and filters by typed query', () => {
      renderHarness();
      open();
      openPicker();
      expect(screen.getByText('Alice Trading')).toBeInTheDocument();
      expect(screen.getByText('Bob Stores')).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('Search or select customer...'), { target: { value: 'bob' } });
      expect(screen.queryByText('Alice Trading')).toBeNull();
      expect(screen.getByText('Bob Stores')).toBeInTheDocument();
      // typing alone never fetches and never touches the region query
      expect(posCreditBalance).not.toHaveBeenCalled();
      expect(query()).toBe('');
    });

    it('shows "No customers found" for an empty roster', () => {
      renderHarness({ posCustomers: [] });
      open();
      openPicker();
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });

    it('selecting a customer sets the query and fetches by code', async () => {
      posCreditBalance.mockResolvedValue(found({ customer: { name: 'Bob Stores', code: 'C002' } }));
      renderHarness();
      open();
      pickCustomer('Bob Stores');
      expect(query()).toBe('2');
      expect(result()).toBe('searching');
      expect(posCreditBalance).toHaveBeenCalledWith('C002');
      await flush();
      expect(screen.getByText('C002')).toBeInTheDocument();
    });

    it('selecting a code-less customer fetches by mobile, else by String(id)', async () => {
      posCreditBalance.mockResolvedValue({ found: false });
      renderHarness({ posCustomers: [makeCustomer({ id: '7', code: '', mobile: '0559', name: 'Mob Only' }), CUSTOMERS[2]] });
      open();
      pickCustomer('Mob Only');
      expect(posCreditBalance).toHaveBeenLastCalledWith('0559');
      await flush();
      pickCustomer('Carol NoCode');
      expect(posCreditBalance).toHaveBeenLastCalledWith('3');
      await flush();
      expect(screen.getByText('No customer found for the scanned card.')).toBeInTheDocument();
    });

    it('picker rejection maps to not-found', async () => {
      posCreditBalance.mockRejectedValue(new Error('x'));
      renderHarness();
      open();
      pickCustomer('Alice Trading');
      await flush();
      expect(result()).toBe('notfound');
    });

    it('the picker ✕ clears query and result without fetching', async () => {
      posCreditBalance.mockResolvedValue(found());
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      fireEvent.click(screen.getByText('✕'));
      expect(query()).toBe('');
      expect(result()).toBe('null');
      expect(posCreditBalance).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Search customer to check balance.')).toBeInTheDocument();
    });

    it('Clear resets query and result, and the picker returns to its input', async () => {
      posCreditBalance.mockResolvedValue(found());
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(query()).toBe('');
      expect(result()).toBe('null');
      expect(screen.getByPlaceholderText('Search or select customer...')).toBeInTheDocument();
      expect(posCreditBalance).toHaveBeenCalledTimes(1);
    });

    it('picker path is NOT cancelled: the last response to resolve wins', async () => {
      const a = deferred();
      const b = deferred();
      posCreditBalance.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
      renderHarness();
      open();
      pickCustomer('Alice Trading');
      pickCustomer('Bob Stores');
      expect(query()).toBe('2');
      await act(async () => { b.resolve(found({ customer: { name: 'Bob Stores' } })); });
      expect(result()).toBe('obj:Bob Stores');
      await act(async () => { a.resolve(found({ customer: { name: 'Alice Trading' } })); });
      expect(result()).toBe('obj:Alice Trading');
      expect(query()).toBe('2');
    });
  });

  // ── close / reopen ──────────────────────────────────────────────────────────────────────
  describe('close and reopen', () => {
    it.each([
      ['header X', () => fireEvent.click(screen.getByText(TITLE).closest('.bg-white').querySelector('button'))],
      ['footer Close', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
      ['backdrop', (c) => fireEvent.click(c.querySelector('.absolute.inset-0.bg-black\\/50'))],
    ])('%s unmounts the modal', (_label, doClose) => {
      const { container } = renderHarness();
      open();
      doClose(container);
      expect(screen.queryByText(TITLE)).toBeNull();
    });

    it('clicking inside the panel does not close', () => {
      renderHarness();
      open();
      fireEvent.click(screen.getByText('Search customer to check balance.'));
      expect(screen.getByText(TITLE)).toBeInTheDocument();
    });

    it('Escape does nothing (no keyboard handler)', () => {
      renderHarness();
      open();
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.keyDown(screen.getByText(TITLE), { key: 'Escape' });
      expect(screen.getByText(TITLE)).toBeInTheDocument();
    });

    it('close does not reset query/result — state is parent-owned and survives unmount', async () => {
      posCreditBalance.mockResolvedValue(found({ customer: { name: 'Bob Stores' } }));
      renderHarness();
      open();
      pickCustomer('Bob Stores');
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(query()).toBe('2');
      expect(result()).toBe('obj:Bob Stores');
      fireEvent.click(screen.getByTestId('raw-open'));
      // once in the picker (selected name), once in the customer card
      expect(screen.getAllByText('Bob Stores')).toHaveLength(2);
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    });

    it('the function-button opener resets query/result before showing (walk-in => empty state)', async () => {
      posCreditBalance.mockResolvedValue(found());
      renderHarness();
      open();
      pickCustomer('Alice Trading');
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      open();
      expect(query()).toBe('');
      expect(screen.getByText('Search customer to check balance.')).toBeInTheDocument();
    });

    it('reopening with a POS customer refetches each time', async () => {
      posCreditBalance.mockResolvedValue(found());
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      open();
      await flush();
      expect(posCreditBalance).toHaveBeenCalledTimes(2);
      expect(screen.getByText('C001')).toBeInTheDocument();
    });

    it('closing cancels a pending auto-load (late response is ignored)', async () => {
      const d = deferred();
      posCreditBalance.mockReturnValue(d.promise);
      renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await act(async () => { d.resolve(found()); });
      expect(result()).toBe('searching');
    });

    it('closing does NOT cancel a pending picker lookup (late response lands in parent state)', async () => {
      const d = deferred();
      posCreditBalance.mockReturnValue(d.promise);
      renderHarness();
      open();
      pickCustomer('Bob Stores');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await act(async () => { d.resolve(found({ customer: { name: 'Bob Stores' } })); });
      expect(result()).toBe('obj:Bob Stores');
    });
  });

  // ── parent rerenders / identity ─────────────────────────────────────────────────────────
  describe('parent rerender behaviour while open', () => {
    it('equivalent rerender (same references) keeps result, picker typing and does not refetch', async () => {
      posCreditBalance.mockResolvedValue(found());
      const { rerender } = renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      openPicker();
      const input = screen.getByPlaceholderText('Search or select customer...');
      fireEvent.change(input, { target: { value: 'bo' } });
      rerender();
      await flush();
      expect(posCreditBalance).toHaveBeenCalledTimes(1);
      expect(screen.getByPlaceholderText('Search or select customer...')).toBe(input);
      expect(input.value).toBe('bo');
      expect(screen.getByText('Bob Stores')).toBeInTheDocument();
    });

    it('a new selectedCustomerData identity refetches and overwrites the in-modal pick', async () => {
      posCreditBalance.mockImplementation(async (q) => found({ customer: { name: `R-${q}` } }));
      const { rerender } = renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      pickCustomer('Bob Stores');
      await flush();
      expect(result()).toBe('obj:R-C002');
      rerender({ selectedCustomerData: { ...CUSTOMERS[0] } });
      expect(query()).toBe('1');
      await flush();
      expect(result()).toBe('obj:R-C001');
      expect(posCreditBalance).toHaveBeenCalledTimes(3);
    });

    it('switching the POS customer cancels the previous auto-load', async () => {
      const a = deferred();
      const b = deferred();
      posCreditBalance.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
      const { rerender } = renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      rerender({ selectedCustomerData: CUSTOMERS[1] });
      expect(posCreditBalance).toHaveBeenLastCalledWith('C002');
      await act(async () => { b.resolve(found({ customer: { name: 'Bob Stores' } })); });
      await act(async () => { a.resolve(found({ customer: { name: 'Alice Trading' } })); });
      expect(result()).toBe('obj:Bob Stores');
    });

    it('switching the POS customer to walk-in leaves the previous result on screen', async () => {
      posCreditBalance.mockResolvedValue(found());
      const { rerender } = renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      rerender({ selectedCustomerData: WALK_IN });
      await flush();
      expect(posCreditBalance).toHaveBeenCalledTimes(1);
      expect(query()).toBe('1');
      expect(screen.getByText('C001')).toBeInTheDocument();
    });

    it('a new posCustomers array alone does not refetch but updates the picker', async () => {
      posCreditBalance.mockResolvedValue(found());
      const { rerender } = renderHarness({ selectedCustomerData: CUSTOMERS[0] });
      open();
      await flush();
      rerender({ posCustomers: [makeCustomer({ name: 'Alice Renamed' }), ...CUSTOMERS.slice(1)] });
      await flush();
      expect(posCreditBalance).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Alice Renamed')).toBeInTheDocument();
    });

    it('the overlay DOM node is stable across rerenders and replaced across close/reopen', async () => {
      const { container, rerender } = renderHarness();
      open();
      const overlay = container.querySelector('.fixed.inset-0.z-50');
      rerender();
      expect(container.querySelector('.fixed.inset-0.z-50')).toBe(overlay);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      open();
      expect(container.querySelector('.fixed.inset-0.z-50')).not.toBe(overlay);
    });
  });

  describe('focus', () => {
    it('opening moves no focus; the picker input only autofocuses when it MOUNTS on open', async () => {
      renderHarness();
      const before = document.activeElement;
      open();
      // fireEvent.click does not move focus; the modal itself sets none
      expect(document.activeElement).toBe(before);
      expect(screen.getByPlaceholderText('Search or select customer...')).not.toHaveFocus();
      // no selection: the input is already mounted, so autoFocus flipping true does nothing
      openPicker();
      expect(screen.getByPlaceholderText('Search or select customer...')).not.toHaveFocus();
      posCreditBalance.mockResolvedValue(found());
      fireEvent.click(screen.getByText('Alice Trading').closest('button'));
      await flush();
      // with a selection: opening swaps the name span for a freshly mounted, autofocused input
      openPicker();
      expect(screen.getByPlaceholderText('Search or select customer...')).toHaveFocus();
    });
  });
});

// ── source contract ─────────────────────────────────────────────────────────────────────
describe('source contract', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const PARENT = read('../../POSSales.jsx');
  const CHILD = read('../features/customers/CreditBalance.jsx');
  const TEST = read('./CreditBalance.characterization.test.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* ─── CREDIT BALANCE MODAL ─── */}';
  const start = LINES.indexOf(ANCHOR);
  const end = LINES.indexOf('      )}', start);
  const CALLSITE = LINES.slice(start, end + 1).join('\n');

  const between = (text, a, b) => {
    const i = text.indexOf(a);
    const j = text.indexOf(b, i);
    return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
  };

  // The pre-extraction region (reference copy in this file) and the shipped child's body.
  const REGION = between(TEST, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
  const CHILD_BODY = CHILD.slice(CHILD.indexOf('}) {\n') + '}) {\n'.length, CHILD.lastIndexOf('\n}\n\nexport default CreditBalance;'));

  const PROPS = [
    'showCreditBalance', 'setShowCreditBalance',
    'creditBalanceQuery', 'setCreditBalanceQuery',
    'creditBalanceResult', 'setCreditBalanceResult',
    'posCustomers',
  ];

  it('pins the call-site boundaries, size and siblings', () => {
    expect(start).toBeGreaterThan(-1);
    expect(LINES[start + 1]).toBe('      {showCreditBalance && (');
    expect(LINES[start + 2]).toBe('        <CreditBalance');
    expect(LINES[end - 1]).toBe('        />');
    expect(end - start + 1).toBe(12);
    expect(LINES[start - 1]).toBe('');
    expect(LINES[start - 2]).toBe('      )}');
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe('      {/* ─── LAYAWAYS LIST MODAL ─── */}');
    expect(PARENT.split('CREDIT BALANCE MODAL').length - 1).toBe(1);
    expect(PARENT.split('{showCreditBalance && ').length - 1).toBe(1);
    // The IIFE is gone from the parent; one call site, no key / memo wrapper.
    expect(PARENT).not.toContain('{showCreditBalance && (() => {');
    expect(PARENT.split('<CreditBalance').length - 1).toBe(1);
    expect(PARENT).not.toContain('<CreditBalance key=');
    expect(PARENT).not.toContain('memo(CreditBalance');
    expect(PARENT).toContain("import CreditBalance from './POS/features/customers/CreditBalance';");
  });

  it('the harness call site is byte-identical to POSSales', () => {
    const copy = between(TEST, '{/* CALLSITE-VERBATIM-START */}', '{/* CALLSITE-VERBATIM-END */}');
    expect(copy).toBe(CALLSITE);
  });

  it('the call site passes exactly the 7 bindings, one per line, under their original names', () => {
    PROPS.forEach((name) => expect(CALLSITE, name).toContain(`          ${name}={${name}}\n`));
    expect(CALLSITE.match(/^ {10}[A-Za-z0-9_]+=\{/gm)).toHaveLength(7);
    expect(CALLSITE).not.toContain('{...');
  });

  it('the pre-extraction reference is the 109-line IIFE region', () => {
    const lines = REGION.split('\n');
    expect(lines).toHaveLength(109);
    expect(lines[0]).toBe(ANCHOR);
    expect(lines[1]).toBe('      {showCreditBalance && (() => {');
    expect(lines[107]).toBe('        );');
    expect(lines[108]).toBe('      })()}');
  });

  it('the child body is byte-identical to the reference IIFE body (re-indented one level)', () => {
    const iifeBody = REGION.split('\n').slice(2, -1).map((l) => l.replace(/^ {6}/, '')).join('\n');
    expect(CHILD_BODY).toBe(iifeBody);
  });

  it('the child is a module-level component taking exactly the 7 props, no spread', () => {
    expect(CHILD).toContain(`\nfunction CreditBalance({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n`);
    expect(CHILD).toContain('\nexport default CreditBalance;\n');
    expect(CHILD).not.toContain('...props');
    expect(CHILD).not.toContain('memo(');
  });

  it('the harness effect is byte-identical to the POSSales auto-load effect', () => {
    const copy = between(TEST, '// EFFECT-VERBATIM-START', '// EFFECT-VERBATIM-END');
    const i = PARENT.indexOf("  // Credit Balance function-button modal: auto-load the currently selected POS");
    const j = PARENT.indexOf('  }, [showCreditBalance, selectedCustomerData]);', i);
    expect(i).toBeGreaterThan(-1);
    expect(copy).toBe(PARENT.slice(i, j + '  }, [showCreditBalance, selectedCustomerData]);'.length));
  });

  it('the harness state mirrors the POSSales declarations, which stay parent-owned', () => {
    [
      "  // Credit Balance modal\n  const [showCreditBalance, setShowCreditBalance] = useState(false);\n  const [creditBalanceQuery, setCreditBalanceQuery] = useState('');\n  const [creditBalanceResult, setCreditBalanceResult] = useState(null);",
    ].forEach((s) => expect(PARENT).toContain(s));
    expect(PARENT).toContain('  const [posCustomers, setPosCustomers] = useState([]);');
  });

  it('the harness opener mirrors the only opener (POSTouchScreen credit-balance action)', () => {
    expect(TOUCH).toContain("action: () => { setCreditBalanceQuery(''); setCreditBalanceResult(null); setShowCreditBalance(true); } },");
    expect(TEST).toContain("onClick={() => { setCreditBalanceQuery(''); setCreditBalanceResult(null); setShowCreditBalance(true); }}");
    // POSSales only hands the setters to the touch screen; it never calls setShowCreditBalance(true) itself.
    expect(PARENT).not.toContain('setShowCreditBalance(true)');
    expect(PARENT).toContain('    setShowCreditBalance, setCreditBalanceQuery, setCreditBalanceResult,\n');
  });

  // Free identifiers of the region: strip comments, strings, JSX text, member accesses,
  // object keys and JSX attribute names, then drop region-local bindings and JS keywords.
  const freeIdentifiers = (src) => {
    let s = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');
    s = s.replace(/`[^`]*`/g, (m) => ` ${(m.match(/\$\{[^}]*\}/g) || []).map((x) => x.slice(2, -1)).join(' ')} `);
    s = s.replace(/'[^'\n]*'/g, '""').replace(/"[^"\n]*"/g, '""');
    s = s.replace(/>([^<>{}]*)</g, '><');
    const out = new Set();
    const re = /(\.)?\b([A-Za-z_$][\w$]*)\b(\s*[:=](?![=>]))?/g;
    let m;
    while ((m = re.exec(s))) { if (!m[1] && !m[3]) out.add(m[2]); }
    const LOCAL = ['data', 'doCreditSearch', 'q', 'res', 'customerId', 'c', 'x', 'k', 'v', 'pct', 'color'];
    const SYNTAX = ['const', 'async', 'await', 'return', 'try', 'catch', 'if', 'typeof', 'null', 'false', 'object', 'Math', 'String', 'div', 'span', 'p', 'button'];
    return [...out].filter((t) => !LOCAL.includes(t) && !SYNTAX.includes(t)).sort();
  };

  it('pins the exact direct dependency surface (7 POSSales bindings + module imports)', () => {
    const MODULE = ['AlertCircle', 'CurrencyAmount', 'CustomerPicker', 'Star', 'X', 'posCreditBalance', 'toNumber'];
    expect(freeIdentifiers(REGION)).toEqual([...MODULE, ...PROPS].sort());
    // The IIFE's `showCreditBalance &&` guard stays at the call site, so the child body reads the other 6.
    expect(freeIdentifiers(CHILD_BODY)).toEqual([...MODULE, ...PROPS.filter((n) => n !== 'showCreditBalance')].sort());
    [
      "import { AlertCircle, Star, X } from 'lucide-react';",
      "import { posCreditBalance } from '../../../../../api/posApi';",
      "import CustomerPicker from '../../CustomerPicker';",
      "import { CurrencyAmount } from '../../POSCurrency';",
      "import { toNumber } from '../../posUtils';",
    ].forEach((s) => expect(CHILD).toContain(s));
    expect(CHILD.match(/^import /gm)).toHaveLength(6);
    // CustomerPicker moved with the region: POSSales no longer imports or renders it.
    expect(PARENT).not.toContain('CustomerPicker');
  });

  it('has no hidden cart/checkout/session/delivery/layaway/print/report dependency', () => {
    [
      'cart', 'Cart', 'currentInvoice', 'checkout', 'Checkout', 'payment', 'Payment', 'session', 'Session',
      'delivery', 'Delivery', 'layaway', 'Layaway', 'print', 'Print', 'report', 'Report',
      'selectedCustomerData', 'selectedCustomer', 'customerHistory', 'formatCurrency', 'showFeedback', 'branch', 'company',
    ].forEach((name) => {
      expect(REGION).not.toContain(name);
      expect(CHILD_BODY).not.toContain(name);
    });
  });

  it('owns no hooks, refs, effects, keys or portals', () => {
    ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'createPortal', 'ref=', 'autoFocus', 'onKeyDown', 'addEventListener']
      .forEach((s) => {
        expect(REGION).not.toContain(s);
        expect(CHILD).not.toContain(s);
      });
    // keys only on inner mapped rows, never on the overlay root
    expect(CHILD_BODY.match(/key=\{/g)).toHaveLength(2);
    expect(CHILD).not.toContain('<Dialog');
  });

  it('doCreditSearch is dead code (defined once, never referenced)', () => {
    expect(REGION.split('doCreditSearch').length - 1).toBe(1);
    expect(CHILD.split('doCreditSearch').length - 1).toBe(1);
    expect(PARENT).not.toContain('doCreditSearch');
  });

  it('all callbacks live in the child; the only parent-owned logic is the effect', () => {
    // every handler body only calls the passed setters or posCreditBalance
    const calls = [...CHILD_BODY.matchAll(/\b(set[A-Z]\w*)\(/g)].map((m) => m[1]);
    expect([...new Set(calls)].sort()).toEqual(['setCreditBalanceQuery', 'setCreditBalanceResult', 'setShowCreditBalance']);
    // writes to this state in POSSales: only the effect (the opener lives in POSTouchScreen)
    expect(PARENT.split('setCreditBalanceResult(').length - 1).toBe(3);
    expect(PARENT.split('setCreditBalanceQuery(').length - 1).toBe(1);
    expect(PARENT.split('setShowCreditBalance(').length - 1).toBe(0);
  });

  it('lifecycle did not move: the effect stays keyed on showCreditBalance in POSSales, before the call site', () => {
    const effectStart = PARENT.indexOf('  useEffect(() => {\n    if (!showCreditBalance');
    expect(effectStart).toBeGreaterThan(-1);
    expect(effectStart).toBeLessThan(PARENT.indexOf(CALLSITE));
    // the effect's only non-region input is selectedCustomerData
    const effect = PARENT.slice(effectStart, PARENT.indexOf('  }, [showCreditBalance, selectedCustomerData]);', effectStart));
    expect(effect).toContain('selectedCustomerData');
    expect(effect).not.toContain('posCustomers');
    expect(CHILD).not.toContain('selectedCustomerData');
  });
});

// keep lint honest about imports used only inside the verbatim region
void [AlertCircle, Star, X, CustomerPicker, CurrencyAmount, toNumber, useEffect];
