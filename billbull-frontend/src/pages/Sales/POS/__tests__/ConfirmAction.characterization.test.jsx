import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import React, { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/posApi', () => ({
  cancelLayaway: vi.fn(), createLayaway: vi.fn(), getLayaway: vi.fn(), getLayaways: vi.fn(),
}));

import { cancelLayaway, getLayaways } from '../../../../api/posApi';
import { useLayaway } from '../features/layaway/useLayaway';
import { useHeldSales } from '../features/heldSales/useHeldSales';
import RealConfirmAction from '../features/notifications/ConfirmAction';

const traverse = traverseModule.default || traverseModule;

/**
 * REGRESSION (POST-EXTRACTION) — the "Confirm Action" modal, now POS/features/notifications/ConfirmAction.jsx.
 *
 * THE EXTRACTION HAS HAPPENED. This suite was the pre-extraction characterization of the POSSales.jsx region
 * and is now its regression suite: it still carries the ORIGINAL 41-line region verbatim (REGION markers,
 * sha256-pinned) as the reference implementation, and proves the extracted component renders byte-identical
 * markup and behaves identically through every characterized flow.
 *
 * The original region was the CONFIRM ACTION MODAL anchor comment followed by the guarded overlay (41 lines).
 * In POSSales that inner JSX is now a <ConfirmAction confirmAction setConfirmAction /> call site under the
 * same anchor and the same parent-owned guard; the siblings are unchanged — the Layaways List call site
 * above, the Save Layaway IIFE below.
 *
 * The modal itself is unchanged: a single hand-rolled fixed overlay
 * (z-[700]): backdrop + card with warning icon, title, message, optional error, Cancel and Delete buttons.
 * No Radix Dialog, no portal, no key, no ref, no hooks, no effects, no timers, no API calls, no context.
 * Conditionally MOUNTED on `confirmAction` truthiness.
 *
 * Direct dependency surface (derived from the parsed region):
 *   POSSales useState:  confirmAction (guard + 9 reads), setConfirmAction (2 writes)
 *   module imports:     lucide AlertTriangle, RefreshCw, Trash2 — all three are now imported by the child;
 *                       Trash2 had NO other POSSales use and was removed from the POSSales import block,
 *                       while AlertTriangle and RefreshCw are shared with other regions and stay there.
 *   globals:            none
 * `confirmAction` shape: null | { title, message, onConfirm, busy?, error? } — produced ONLY by the two
 * feature hooks that receive setConfirmAction as an argument:
 *   - useLayaway.handleCancelLayaway   (live: LayawaysList "Delete" / "Cancel" buttons)
 *   - useHeldSales.deleteHeldBill      (returned to POSSales and threaded into the touch prop bag, but
 *                                       POSTouchScreen only destructures it — no UI invokes it today)
 * The region never calls an API; the hooks' onConfirm closures call cancelLayaway, reload, re-sync
 * (syncPosDataRef) and write busy / error / null back through setConfirmAction.
 *
 * Harnesses (every behavioural describe runs against BOTH):
 *   - `ConfirmActionHarness` (reference): the ORIGINAL region copied VERBATIM (REGION markers) — test-only,
 *     the frozen pre-extraction behaviour every assertion is also run against.
 *   - `ExtractedConfirmActionHarness`: the REAL call site (EXTRACTED-CALLSITE markers, byte-compared against
 *     POSSales) rendering the REAL POS/features/notifications/ConfirmAction component.
 * Both reproduce the parent side through `useParentSide`: the POSSales state declaration copied VERBATIM
 * (STATE markers) and the REAL useLayaway / useHeldSales hooks wired with setConfirmAction and a
 * syncPosDataRef spy, exactly as POSSales wires them. posApi is mocked at the module boundary.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - The confirm button label is hard-coded "Delete" / "Deleting…" whatever the title ("Cancel Layaway" too).
 *   - `onClick={confirmAction.onConfirm}` passes the click event straight through; an object without
 *     onConfirm renders an inert Delete button.
 *   - Backdrop click closes only when `!confirmAction.busy`; Cancel is not guarded in its handler, only by
 *     `disabled={confirmAction.busy}`. Clicking the card never closes. No Escape handling, no focus
 *     management, no role/aria dialog semantics.
 *   - Retrying after an error spreads `prev`, so the OLD error stays visible while busy.
 *   - If confirmAction is nulled from outside while onConfirm is in flight and the call then FAILS, the hook's
 *     `prev => ({ ...prev, busy: false, error })` resurrects a modal with no title, no message and an inert
 *     Delete button. A success in the same situation stays closed.
 *   - Replacing confirmAction with a new object while open re-renders in place (no key → no remount).
 *   - Missing title / message render empty <h3> / <p>; an empty-string error renders no error block.
 */

// ── fixtures ──────────────────────────────────────────────────────────────────────────────
const SESSION = { id: 42, branchId: 7 };
const TERMINAL = { branchId: 7 };
const LAYAWAYS = [
  { id: 'L1', layawayNumber: 'LAY-0001', hold: false, posSessionId: 42, saleTotal: 100, items: [] },
  { id: 'H1', layawayNumber: 'HOLD-0009', hold: true, posSessionId: 42, saleTotal: 50, items: [{}] },
];
const onConfirmSpy = vi.fn();
const syncSpy = vi.fn();
const BASIC = { title: 'Delete Thing', message: 'Really delete it?', onConfirm: onConfirmSpy };
const apiError = (status, message) => Object.assign(new Error('boom'), { response: { status, data: message ? { message } : {} } });
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// ── parent side (shared by both harnesses) ────────────────────────────────────────────────
function useParentSide() {
  // STATE-VERBATIM-START
  // Confirmation modal (replaces window.confirm for delete/cancel actions)
  const [confirmAction, setConfirmAction] = useState(null); // { title, message, onConfirm, busy }
  // STATE-VERBATIM-END
  const syncPosDataRef = useRef(syncSpy);
  const layaway = useLayaway({
    currentSession: SESSION, currentTerminal: TERMINAL, posSettings: null,
    recalculateInvoice: vi.fn(), setCurrentInvoice: vi.fn(), customerOptions: [], setSelectedCustomer: vi.fn(),
    setConfirmAction, syncPosDataRef,
  });
  const held = useHeldSales({
    sessionId: SESSION.id, currentSession: SESSION, currentTerminal: TERMINAL, currentInvoice: { items: [] },
    selectedCustomerData: null, posSettings: null, cartItemsToPayload: vi.fn(), clearInvoice: vi.fn(),
    setConfirmAction, syncPosDataRef, startLayawayConversion: layaway.startLayawayConversion,
  });
  return { confirmAction, setConfirmAction, layaway, held };
}

const fmtState = (c) => (c === null ? 'null' : JSON.stringify({
  title: c.title, message: c.message, busy: c.busy, error: c.error, fn: typeof c.onConfirm,
}));

function ParentProbes({ confirmAction, setConfirmAction, layaway, held }) {
  return (
    <div data-testid="probes">
      <button data-testid="raw-open" onClick={() => setConfirmAction(BASIC)}>raw-open</button>
      <button data-testid="raw-open-busy" onClick={() => setConfirmAction({ ...BASIC, busy: true })}>raw-open-busy</button>
      <button data-testid="raw-open-error" onClick={() => setConfirmAction({ ...BASIC, error: 'Nope.' })}>raw-open-error</button>
      <button data-testid="raw-open-empty-error" onClick={() => setConfirmAction({ ...BASIC, error: '' })}>raw-open-empty-error</button>
      <button data-testid="raw-open-bare" onClick={() => setConfirmAction({})}>raw-open-bare</button>
      <button data-testid="raw-open-no-confirm" onClick={() => setConfirmAction({ title: 'T', message: 'M' })}>raw-open-no-confirm</button>
      <button data-testid="raw-replace" onClick={() => setConfirmAction({ title: 'Other Title', message: 'Other message', onConfirm: onConfirmSpy })}>raw-replace</button>
      <button data-testid="raw-close" onClick={() => setConfirmAction(null)}>raw-close</button>
      <button data-testid="load-layaways" onClick={() => layaway.loadLayaways()}>load-layaways</button>
      <button data-testid="cancel-L1" onClick={() => layaway.handleCancelLayaway('L1')}>cancel-L1</button>
      <button data-testid="cancel-unknown" onClick={() => layaway.handleCancelLayaway('ZZ')}>cancel-unknown</button>
      <button data-testid="delete-H1" onClick={() => held.deleteHeldBill('H1')}>delete-H1</button>
      <span data-testid="probe-state">{fmtState(confirmAction)}</span>
      <span data-testid="probe-layaways">{String(layaway.layawaysList.length)}</span>
      <span data-testid="probe-busy-id">{String(layaway.layawayBusyId)}</span>
      <span data-testid="probe-held">{String(held.heldSales.length)}</span>
    </div>
  );
}

// ── reference: the POSSales region, verbatim ──────────────────────────────────────────────
function ConfirmActionHarness() {
  const { confirmAction, setConfirmAction, layaway, held } = useParentSide();
  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ confirmAction, setConfirmAction, layaway, held }} />
      {/* REGION-VERBATIM-START */}
      {/* ─── CONFIRM ACTION MODAL ─── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !confirmAction.busy && setConfirmAction(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-[#1E293B] mb-1">{confirmAction.title}</h3>
              <p className="text-sm text-gray-500">{confirmAction.message}</p>
              {confirmAction.error && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                  {confirmAction.error}
                </div>
              )}
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={confirmAction.busy}
                className="flex-1 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={confirmAction.onConfirm}
                disabled={confirmAction.busy}
                className="flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {confirmAction.busy ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Deleting…</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5" />Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── the real extracted component under test ───────────────────────────────────────────────
// Rebound to compiled mutants by the mutation safeguards only.
let ConfirmAction = RealConfirmAction;

function ExtractedConfirmActionHarness() {
  const { confirmAction, setConfirmAction, layaway, held } = useParentSide();
  return (
    <div data-testid="pos-root">
      <ParentProbes {...{ confirmAction, setConfirmAction, layaway, held }} />
      {/* EXTRACTED-CALLSITE-START */}
      {/* ─── CONFIRM ACTION MODAL ─── */}
      {confirmAction && (
        <ConfirmAction
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
        />
      )}
      {/* EXTRACTED-CALLSITE-END */}
    </div>
  );
}

const HARNESSES = { reference: ConfirmActionHarness, extracted: ExtractedConfirmActionHarness };

// ── helpers ───────────────────────────────────────────────────────────────────────────────
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const state = () => (probe('state') === 'null' ? null : JSON.parse(probe('state')));
const press = (id) => fireEvent.click(screen.getByTestId(id));
const overlay = () => screen.getByTestId('pos-root').querySelector(':scope > .fixed');
const backdrop = () => overlay().children[0];
const card = () => overlay().children[1];
const cancelBtn = () => within(overlay()).getByRole('button', { name: 'Cancel' });
const confirmBtn = () => within(overlay()).getAllByRole('button')[1];

beforeEach(() => {
  onConfirmSpy.mockReset();
  syncSpy.mockReset();
  cancelLayaway.mockReset().mockResolvedValue({});
  getLayaways.mockReset().mockResolvedValue(LAYAWAYS);
});
afterEach(() => { cleanup(); ConfirmAction = RealConfirmAction; });

describe.each(Object.keys(HARNESSES))('Confirm Action modal (%s)', (which) => {
  const renderHarness = async () => {
    const H = HARNESSES[which];
    const out = render(<H />);
    await flush(); // useHeldSales loads on mount
    return out;
  };

  describe('closed / open', () => {
    it('is not mounted while confirmAction is null', async () => {
      await renderHarness();
      expect(state()).toBeNull();
      expect(overlay()).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
      expect(document.querySelector('.z-\\[700\\]')).toBeNull();
    });

    it('mounts inline (no portal) with title, message, warning icon, Cancel and Delete', async () => {
      const { container } = await renderHarness();
      press('raw-open');
      const o = overlay();
      expect(container.contains(o)).toBe(true);
      expect(o.className).toBe('fixed inset-0 z-[700] flex items-center justify-center');
      expect(o.children).toHaveLength(2);
      expect(backdrop().className).toBe('absolute inset-0 bg-black/50 backdrop-blur-sm');
      expect(card().className).toContain('relative bg-white rounded-2xl shadow-2xl w-full max-w-sm');
      expect(within(o).getByRole('heading', { level: 3 }).textContent).toBe('Delete Thing');
      expect(o.querySelector('p.text-sm.text-gray-500').textContent).toBe('Really delete it?');
      expect(o.querySelector('.bg-red-100 svg').getAttribute('class')).toContain('lucide-triangle-alert');
      expect(within(o).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Delete']);
      expect(o.querySelector('.bg-red-50.border-red-200')).toBeNull();
      expect(o.querySelector('.animate-spin')).toBeNull();
    });

    it('has no dialog semantics, no focus move and no Escape handling', async () => {
      await renderHarness();
      press('raw-open');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(overlay().querySelector('[aria-modal]')).toBeNull();
      expect(document.activeElement).not.toBe(cancelBtn());
      expect(document.activeElement).not.toBe(confirmBtn());
      fireEvent.keyDown(overlay(), { key: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(state().title).toBe('Delete Thing');
      expect(overlay()).not.toBeNull();
    });

    it('renders empty title / message for a bare object without crashing, and Delete is inert', async () => {
      await renderHarness();
      press('raw-open-bare');
      expect(overlay().querySelector('h3').textContent).toBe('');
      expect(overlay().querySelector('p.text-sm.text-gray-500').textContent).toBe('');
      expect(() => fireEvent.click(confirmBtn())).not.toThrow();
      expect(state()).toEqual({ fn: 'undefined' });
    });

    it('replacing confirmAction while open re-renders in place (same DOM node, no remount)', async () => {
      await renderHarness();
      press('raw-open');
      const before = overlay();
      press('raw-replace');
      expect(overlay()).toBe(before);
      expect(overlay().querySelector('h3').textContent).toBe('Other Title');
      expect(overlay().querySelector('p.text-sm.text-gray-500').textContent).toBe('Other message');
    });
  });

  describe('closing', () => {
    it('Cancel clears confirmAction and unmounts', async () => {
      await renderHarness();
      press('raw-open');
      fireEvent.click(cancelBtn());
      expect(state()).toBeNull();
      expect(overlay()).toBeNull();
      expect(onConfirmSpy).not.toHaveBeenCalled();
    });

    it('backdrop click closes when not busy', async () => {
      await renderHarness();
      press('raw-open');
      fireEvent.click(backdrop());
      expect(state()).toBeNull();
      expect(overlay()).toBeNull();
    });

    it('backdrop click closes after an error (busy undefined)', async () => {
      await renderHarness();
      press('raw-open-error');
      fireEvent.click(backdrop());
      expect(state()).toBeNull();
    });

    it('clicks inside the card (title, message, icon, card) never close', async () => {
      await renderHarness();
      press('raw-open');
      fireEvent.click(card());
      fireEvent.click(overlay().querySelector('h3'));
      fireEvent.click(overlay().querySelector('p'));
      fireEvent.click(overlay().querySelector('.bg-red-100'));
      expect(state().title).toBe('Delete Thing');
    });

    it('while busy: backdrop ignored, both buttons disabled, Cancel and Delete do nothing', async () => {
      await renderHarness();
      press('raw-open-busy');
      expect(cancelBtn().disabled).toBe(true);
      expect(confirmBtn().disabled).toBe(true);
      fireEvent.click(backdrop());
      fireEvent.click(cancelBtn());
      fireEvent.click(confirmBtn());
      expect(state()).toEqual({ title: 'Delete Thing', message: 'Really delete it?', busy: true, fn: 'function' });
      expect(onConfirmSpy).not.toHaveBeenCalled();
    });

    it('raw close from outside unmounts even while busy', async () => {
      await renderHarness();
      press('raw-open-busy');
      press('raw-close');
      expect(overlay()).toBeNull();
    });
  });

  describe('confirm button', () => {
    it('not busy: Trash2 + "Delete", enabled; busy: spinning RefreshCw + "Deleting…"', async () => {
      await renderHarness();
      press('raw-open');
      expect(confirmBtn().textContent).toBe('Delete');
      expect(confirmBtn().disabled).toBe(false);
      expect(cancelBtn().disabled).toBe(false);
      expect(confirmBtn().querySelector('svg').getAttribute('class')).toContain('lucide-trash2');
      expect(confirmBtn().querySelector('svg').getAttribute('class')).toContain('h-3.5 w-3.5');
      press('raw-open-busy');
      expect(confirmBtn().textContent).toBe('Deleting…');
      const spin = confirmBtn().querySelector('svg');
      expect(spin.getAttribute('class')).toContain('lucide-refresh-cw');
      expect(spin.getAttribute('class')).toContain('h-3.5 w-3.5 animate-spin');
      expect(confirmBtn().className).toBe('flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5');
      expect(cancelBtn().className).toBe('flex-1 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40');
    });

    it('Delete calls onConfirm exactly once with the click event, and does not close or set busy itself', async () => {
      await renderHarness();
      press('raw-open');
      fireEvent.click(confirmBtn());
      expect(onConfirmSpy).toHaveBeenCalledTimes(1);
      expect(onConfirmSpy.mock.calls[0]).toHaveLength(1);
      expect(onConfirmSpy.mock.calls[0][0].type).toBe('click');
      expect(state()).toEqual({ title: 'Delete Thing', message: 'Really delete it?', fn: 'function' });
      fireEvent.click(confirmBtn());
      expect(onConfirmSpy).toHaveBeenCalledTimes(2);
    });

    it('an object without onConfirm renders an inert, enabled Delete button', async () => {
      await renderHarness();
      press('raw-open-no-confirm');
      expect(confirmBtn().disabled).toBe(false);
      fireEvent.click(confirmBtn());
      expect(state()).toEqual({ title: 'T', message: 'M', fn: 'undefined' });
    });
  });

  describe('error block', () => {
    it('renders error text in the red block', async () => {
      await renderHarness();
      press('raw-open-error');
      const err = overlay().querySelector('.mt-3');
      expect(err.className).toBe('mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium');
      expect(err.textContent).toBe('Nope.');
      expect(err.parentElement.className).toBe('p-6 text-center');
    });

    it('an empty-string error renders no block', async () => {
      await renderHarness();
      press('raw-open-empty-error');
      expect(overlay().querySelector('.mt-3')).toBeNull();
    });
  });

  describe('cross-feature: useLayaway.handleCancelLayaway (live writer)', () => {
    const openL1 = async () => { press('load-layaways'); await flush(); press('cancel-L1'); };

    it('opens with the layaway title / message; label still reads "Delete"', async () => {
      await renderHarness();
      await openL1();
      expect(state()).toEqual({ title: 'Cancel Layaway', message: 'Cancel LAY-0001? Reserved stock will be released.', fn: 'function' });
      expect(overlay().querySelector('h3').textContent).toBe('Cancel Layaway');
      expect(confirmBtn().textContent).toBe('Delete');
    });

    it('falls back to "this layaway" when the id is not in the loaded list', async () => {
      await renderHarness();
      press('cancel-unknown');
      expect(overlay().querySelector('p').textContent).toBe('Cancel this layaway? Reserved stock will be released.');
    });

    it('confirm: busy immediately, cancelLayaway(id, sessionId), reload, re-sync, then unmount', async () => {
      const d = deferred();
      cancelLayaway.mockReturnValue(d.promise);
      await renderHarness();
      await openL1();
      getLayaways.mockClear();
      fireEvent.click(confirmBtn());
      expect(state().busy).toBe(true);
      expect(confirmBtn().textContent).toBe('Deleting…');
      expect(cancelBtn().disabled).toBe(true);
      expect(probe('busy-id')).toBe('L1');
      expect(cancelLayaway).toHaveBeenCalledWith('L1', 42);
      fireEvent.click(confirmBtn()); // disabled — no second call
      fireEvent.click(backdrop());
      expect(cancelLayaway).toHaveBeenCalledTimes(1);
      await act(async () => { d.resolve({}); });
      await flush();
      expect(getLayaways).toHaveBeenCalledWith({ branchId: 7 });
      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(state()).toBeNull();
      expect(overlay()).toBeNull();
      expect(probe('busy-id')).toBe('null');
    });

    it('403: permission message, busy false, buttons re-enabled, title kept', async () => {
      cancelLayaway.mockRejectedValue(apiError(403, 'server says no'));
      await renderHarness();
      await openL1();
      fireEvent.click(confirmBtn());
      await flush();
      expect(state()).toEqual({
        title: 'Cancel Layaway', message: 'Cancel LAY-0001? Reserved stock will be released.', busy: false,
        error: 'You do not have permission to cancel a layaway (supervisor required).', fn: 'function',
      });
      expect(overlay().querySelector('.mt-3').textContent).toBe('You do not have permission to cancel a layaway (supervisor required).');
      expect(confirmBtn().disabled).toBe(false);
      expect(cancelBtn().disabled).toBe(false);
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('other failures: server message, else the default text', async () => {
      cancelLayaway.mockRejectedValueOnce(apiError(500, 'Layaway locked')).mockRejectedValueOnce(apiError(500));
      await renderHarness();
      await openL1();
      fireEvent.click(confirmBtn());
      await flush();
      expect(overlay().querySelector('.mt-3').textContent).toBe('Layaway locked');
      fireEvent.click(confirmBtn());
      await flush();
      expect(overlay().querySelector('.mt-3').textContent).toBe('Failed to cancel layaway.');
    });

    it('retry after an error keeps the OLD error visible while busy, then closes on success', async () => {
      const d = deferred();
      cancelLayaway.mockRejectedValueOnce(apiError(500, 'first failure')).mockReturnValueOnce(d.promise);
      await renderHarness();
      await openL1();
      fireEvent.click(confirmBtn());
      await flush();
      fireEvent.click(confirmBtn());
      expect(state().busy).toBe(true);
      expect(overlay().querySelector('.mt-3').textContent).toBe('first failure');
      expect(confirmBtn().textContent).toBe('Deleting…');
      await act(async () => { d.resolve({}); });
      await flush();
      expect(overlay()).toBeNull();
    });

    it('closed from outside mid-flight, then FAILS: resurrects a titleless modal with an inert Delete', async () => {
      const d = deferred();
      cancelLayaway.mockReturnValue(d.promise);
      await renderHarness();
      await openL1();
      fireEvent.click(confirmBtn());
      press('raw-close');
      expect(overlay()).toBeNull();
      await act(async () => { d.reject(apiError(403)); });
      await flush();
      expect(state()).toEqual({ busy: false, error: 'You do not have permission to cancel a layaway (supervisor required).', fn: 'undefined' });
      expect(overlay().querySelector('h3').textContent).toBe('');
      expect(overlay().querySelector('.mt-3').textContent).toBe('You do not have permission to cancel a layaway (supervisor required).');
      fireEvent.click(confirmBtn());
      expect(cancelLayaway).toHaveBeenCalledTimes(1);
      fireEvent.click(backdrop());
      expect(overlay()).toBeNull();
    });

    it('closed from outside mid-flight, then SUCCEEDS: stays closed', async () => {
      const d = deferred();
      cancelLayaway.mockReturnValue(d.promise);
      await renderHarness();
      await openL1();
      fireEvent.click(confirmBtn());
      press('raw-close');
      await act(async () => { d.resolve({}); });
      await flush();
      expect(overlay()).toBeNull();
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-feature: useHeldSales.deleteHeldBill (hook writer, no live UI caller)', () => {
    it('opens with the held-bill title; confirm cancels, reloads held sales, re-syncs, closes', async () => {
      await renderHarness();
      expect(probe('held')).toBe('1');
      press('delete-H1');
      expect(state()).toEqual({ title: 'Delete Held Bill', message: 'Delete HOLD-0009? Reserved stock will be released.', fn: 'function' });
      getLayaways.mockClear();
      fireEvent.click(confirmBtn());
      expect(confirmBtn().textContent).toBe('Deleting…');
      await flush();
      expect(cancelLayaway).toHaveBeenCalledWith('H1', 42);
      expect(getLayaways).toHaveBeenCalledWith({ branchId: 7, status: 'ACTIVE' });
      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(overlay()).toBeNull();
    });

    it('403 shows the held-bill permission message', async () => {
      cancelLayaway.mockRejectedValue(apiError(403));
      await renderHarness();
      press('delete-H1');
      fireEvent.click(confirmBtn());
      await flush();
      expect(overlay().querySelector('.mt-3').textContent).toBe('You do not have permission to delete a held bill (supervisor required).');
    });
  });
});

// ── DOM parity ────────────────────────────────────────────────────────────────────────────
describe('DOM parity (original region vs extracted component)', () => {
  it('identical markup through open, error, busy, replace, cross-feature flows and close', async () => {
    const d = deferred();
    // one call per root per press: two rejections, then two in-flight calls sharing one deferred
    cancelLayaway.mockRejectedValueOnce(apiError(403)).mockRejectedValueOnce(apiError(403))
      .mockReturnValueOnce(d.promise).mockReturnValueOnce(d.promise);
    const roots = [render(<ConfirmActionHarness />).container, render(<ExtractedConfirmActionHarness />).container];
    await flush();
    const same = () => expect(roots[0].innerHTML).toBe(roots[1].innerHTML);
    const each = (fn) => roots.forEach((r) => fn(within(r), r));
    const pressId = (id) => each((w) => fireEvent.click(w.getByTestId(id)));
    const pressConfirm = () => each((w, r) => fireEvent.click(r.querySelectorAll(':scope > [data-testid="pos-root"] > .fixed button')[1]));

    same();
    for (const id of ['raw-open', 'raw-open-error', 'raw-open-empty-error', 'raw-open-busy', 'raw-open-bare', 'raw-open-no-confirm', 'raw-replace', 'raw-close']) {
      pressId(id);
      same();
    }
    pressId('load-layaways');
    await flush();
    pressId('cancel-L1');
    same();
    pressConfirm();
    await flush();
    same();
    pressConfirm();
    same();
    await act(async () => { d.resolve({}); });
    await flush();
    same();
    pressId('delete-H1');
    same();
    each((w, r) => fireEvent.click(r.querySelector(':scope > [data-testid="pos-root"] > .fixed > div')));
    same();
  });
});

// ── source contract ───────────────────────────────────────────────────────────────────────
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

/** Free (unbound) identifiers of a JSX/JS snippet, via Babel scope analysis. */
const freeIdentifiers = (code) => {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const out = new Set();
  traverse(ast, {
    ReferencedIdentifier(p) {
      const { name } = p.node;
      if (p.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      if (!p.scope.hasBinding(name, true)) out.add(name);
    },
  });
  return [...out].sort();
};

const TEST_FILE = './ConfirmAction.characterization.test.jsx';
const between = (text, a, b) => {
  const i = text.indexOf(a);
  const j = text.indexOf(b, i);
  return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
};

describe('source contract', () => {
  const PARENT = read('../../POSSales.jsx');
  const CHILD = read('../features/notifications/ConfirmAction.jsx');
  const TEST = read(TEST_FILE);
  const TOUCH = read('../POSTouchScreen.jsx');
  const TRADE = read('../TradePOS/TradePOSTouchScreen.jsx');
  const CONSOLE = read('../POSConsole.jsx');
  const LAYAWAYS_LIST = read('../features/layaway/LayawaysList.jsx');
  const USE_LAYAWAY = read('../features/layaway/useLayaway.js');
  const USE_HELD = read('../features/heldSales/useHeldSales.js');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* ─── CONFIRM ACTION MODAL ─── */}';
  const OPEN = '      {confirmAction && (';
  const CLOSE = '      )}';
  const PREV_ANCHOR = '      {/* ─── LAYAWAYS LIST MODAL ─── */}';
  const NEXT_ANCHOR = '      {/* ─── SAVE LAYAWAY MODAL ─── */}';
  const IMPORT = "import ConfirmAction from './POS/features/notifications/ConfirmAction';";
  // sha256 of the ORIGINAL 41-line region, as it stood in POSSales.jsx at the characterization
  // checkpoint. The region now lives in the child, so this pins the REFERENCE COPY carried by this
  // suite (REGION markers) — it must never drift, because every parity assertion is measured
  // against it. Changing it means the frozen pre-extraction behaviour changed.
  const ORIGINAL_REGION_SHA256 = '7edac06bf27e8dd86427fce1b5c19c9647399a7a613c3b340ca4a2eb396f2444';

  const REGION = between(TEST, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
  const STATE = between(TEST, '// STATE-VERBATIM-START', '// STATE-VERBATIM-END');
  const CALLSITE = between(TEST, '{/* EXTRACTED-CALLSITE-START */}', '{/* EXTRACTED-CALLSITE-END */}');
  const start = LINES.indexOf(ANCHOR);
  const end = start + 6; // the call site is 7 lines: anchor, guard, <ConfirmAction, 2 props, />, )}
  const INNER = REGION.split('\n').slice(2, -1);
  const CHILD_FN = CHILD.slice(CHILD.indexOf('function ConfirmAction({'), CHILD.indexOf('\n\nexport default ConfirmAction;'));
  const CHILD_BODY = CHILD_FN.split('\n').slice(5, -2).join('\n');
  const count = (src, s) => src.split(s).length - 1;
  const uses = (src, n) => (src.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length;
  const dedent4 = (s) => s.split('\n').map((l) => (l === '' ? '' : l.replace(/^ {4}/, ''))).join('\n');
  const ICONS = ['AlertTriangle', 'RefreshCw', 'Trash2'];
  const PROPS = ['confirmAction', 'setConfirmAction'];

  it('the reference copy is the original 41-line region, byte-for-byte (sha256-pinned)', () => {
    const lines = REGION.split('\n');
    expect(lines).toHaveLength(41);
    expect(lines[0]).toBe(ANCHOR);
    expect(lines[1]).toBe(OPEN);
    expect(lines[2]).toBe('        <div className="fixed inset-0 z-[700] flex items-center justify-center">');
    expect(lines[39]).toBe('        </div>');
    expect(lines[40]).toBe(CLOSE);
    expect(crypto.createHash('sha256').update(REGION).digest('hex')).toBe(ORIGINAL_REGION_SHA256);
  });

  it('the original inline region is GONE from POSSales — the overlay JSX moved, it was not copied', () => {
    expect(count(PARENT, REGION)).toBe(0);
    expect(PARENT).not.toContain('z-[700]');
    expect(PARENT).not.toContain('bg-black/50 backdrop-blur-sm');
    expect(PARENT).not.toContain('Deleting…');
    expect(PARENT).not.toMatch(/confirmAction\.\w+/); // no field is read in POSSales any more
  });

  it('POSSales renders the child at the same anchor: guard kept, exactly the 2 props, one call site', () => {
    expect(LINES.slice(start, end + 1).join('\n')).toBe(CALLSITE);
    expect(CALLSITE.split('\n')).toEqual([
      ANCHOR,
      OPEN,
      '        <ConfirmAction',
      '          confirmAction={confirmAction}',
      '          setConfirmAction={setConfirmAction}',
      '        />',
      CLOSE,
    ]);
    expect(count(PARENT, 'CONFIRM ACTION MODAL')).toBe(1);
    expect(count(PARENT, OPEN)).toBe(1);
    expect(PARENT.match(/<ConfirmAction[\s/>]/g)).toHaveLength(1);
    expect(count(PARENT, IMPORT)).toBe(1);
    // exactly two props, one per line, no spread, no inline arrow, no derived flag
    const body = CALLSITE.split('\n').slice(2, -1).join('\n');
    expect(body.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    PROPS.forEach((p) => expect(body, p).toContain(`${p}={${p}}`));
    expect(body).not.toContain('{...');
    expect(body).not.toContain('=>');
    expect(body).not.toContain('showConfirmAction');
    expect(body).not.toContain('key=');
  });

  it('pins the exact boundaries and siblings (source anchors, not line numbers)', () => {
    expect(LINES[start - 1]).toBe('');
    expect(LINES[start - 2]).toBe('      )}');
    expect(LINES[start - 3]).toBe('        />');
    expect(LINES[start - 4]).toBe('          setShowSaveLayaway={setShowSaveLayaway}');
    // the preceding sibling is exactly the Layaways List call site: anchor → guard → <LayawaysList … /> → )}
    const prevBlock = PARENT.slice(PARENT.indexOf(PREV_ANCHOR), PARENT.indexOf(ANCHOR));
    expect(prevBlock.startsWith(`${PREV_ANCHOR}\n      {showLayawaysList && (\n        <LayawaysList\n`)).toBe(true);
    expect(prevBlock.endsWith('        />\n      )}\n\n')).toBe(true);
    expect(prevBlock.match(/^ {6}\{/gm)).toHaveLength(2);
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe(NEXT_ANCHOR);
    expect(LINES[end + 3]).toBe('      {showSaveLayaway && (() => {');
  });

  it('the state declaration is byte-identical to POSSales and declared exactly once', () => {
    expect(STATE).toBe([
      '  // Confirmation modal (replaces window.confirm for delete/cancel actions)',
      '  const [confirmAction, setConfirmAction] = useState(null); // { title, message, onConfirm, busy }',
    ].join('\n'));
    expect(count(PARENT, `\n${STATE}\n`)).toBe(1);
    expect(PARENT.match(/const \[confirmAction, /g)).toHaveLength(1);
    expect(CHILD).not.toContain('useState');
  });

  it('the region is free only in confirmAction, setConfirmAction and three lucide icons — no globals', () => {
    expect(freeIdentifiers(`(<>\n${REGION}\n</>);`)).toEqual([...PROPS, ...ICONS].sort());
    expect(freeIdentifiers(CHILD_FN)).toEqual(ICONS);
  });

  it('neither the region nor the child owns hooks, state, refs, effects, context, portals, timers, APIs or keyboard handling', () => {
    const FORBIDDEN = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect',
      'Context', 'memo(', 'createPortal', 'ref=', '.current', 'addEventListener', 'subscribe', '<Dialog', 'onKeyDown',
      'autoFocus', 'setTimeout', 'setInterval', 'fetch(', 'axios', 'await', 'async', 'key=', 'Provider', 'role=', 'aria-'];
    FORBIDDEN.forEach((s) => expect(REGION, s).not.toContain(s));
    expect(REGION).not.toMatch(/\buse[A-Z]/);
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    FORBIDDEN.forEach((s) => expect(CHILD_CODE, s).not.toContain(s));
    expect(CHILD_CODE).not.toMatch(/\buse[A-Z]/);
    expect(CHILD_CODE).not.toMatch(/\/api\//);
  });

  it('exact reads, writes and handlers — identical in the original region and in the child', () => {
    for (const src of [REGION, CHILD_FN]) {
      expect(uses(src, 'confirmAction')).toBe(10); // guard/prop + 9 reads
      expect(count(src, 'setConfirmAction(')).toBe(2);
      expect(count(src, 'setConfirmAction(null)')).toBe(2);
      expect(count(src, '<button')).toBe(2);
      expect(count(src, 'onClick=')).toBe(3);
      expect(count(src, 'disabled={confirmAction.busy}')).toBe(2);
      expect(src).toContain('<div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !confirmAction.busy && setConfirmAction(null)} />');
      expect(src).toContain('onClick={() => setConfirmAction(null)}\n');
      expect(src).toContain('onClick={confirmAction.onConfirm}\n');
      expect(src).toContain('<><RefreshCw className="h-3.5 w-3.5 animate-spin" />Deleting…</>');
      expect(src).toContain('<><Trash2 className="h-3.5 w-3.5" />Delete</>');
      expect(src.match(/confirmAction\.\w+/g).map((m) => m.split('.')[1]).sort()).toEqual(
        ['busy', 'busy', 'busy', 'busy', 'error', 'error', 'message', 'onConfirm', 'title'],
      );
      expect(Object.fromEntries(ICONS.map((n) => [n, count(src, `<${n} `)]))).toEqual({ AlertTriangle: 1, RefreshCw: 1, Trash2: 1 });
    }
  });

  it('writers: only the two feature hooks (by argument); POSSales itself writes nothing but the call site', () => {
    expect(uses(PARENT, 'confirmAction')).toBe(1 + 1 + 2); // declaration + guard + prop name/value
    expect(uses(PARENT, 'setConfirmAction')).toBe(1 + 2 + 2); // declaration + 2 hook args + prop name/value
    expect(count(PARENT, '    setConfirmAction, syncPosDataRef,\n  });')).toBe(1);
    expect(count(PARENT, '    cartItemsToPayload, clearInvoice, setConfirmAction,\n')).toBe(1);
    expect(count(USE_LAYAWAY, 'setConfirmAction(')).toBe(4);
    expect(count(USE_HELD, 'setConfirmAction(')).toBe(4);
    for (const src of [TOUCH, TRADE, CONSOLE, LAYAWAYS_LIST]) expect(src).not.toMatch(/confirmAction|ConfirmAction\b/);
  });

  it('the held-bill writer has no live UI caller: POSTouchScreen only destructures deleteHeldBill', () => {
    expect(uses(TOUCH, 'deleteHeldBill')).toBe(1);
    expect(TOUCH).toContain('holdInvoice, recallInvoice, heldSales, holdBusy, deleteHeldBill,');
    expect(uses(TRADE, 'deleteHeldBill')).toBe(0);
    expect(uses(LAYAWAYS_LIST, 'handleCancelLayaway')).toBeGreaterThan(1);
  });

  it('imports: Trash2 moved to the child; AlertTriangle and RefreshCw stay shared in POSSales too', () => {
    expect(CHILD).toContain("import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';");
    expect(CHILD.match(/^import /gm)).toHaveLength(2); // React + lucide, nothing else
    expect(uses(PARENT, 'Trash2')).toBe(0); // was exclusive to this region, so it left with it
    for (const icon of ['AlertTriangle', 'RefreshCw']) {
      expect(PARENT, icon).toMatch(new RegExp(`^  ${icon},$`, 'm'));
      expect(uses(PARENT, icon), icon).toBeGreaterThan(1);
    }
  });

  it('the extraction landed in POS/features/notifications and added exactly one file', () => {
    const CHILD_PATH = path.resolve(__dirname, '../features/notifications/ConfirmAction.jsx');
    expect(fs.existsSync(CHILD_PATH)).toBe(true);
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    expect(walk(path.resolve(__dirname, '../features')).filter((f) => /^ConfirmAction/i.test(path.basename(f)))).toEqual([CHILD_PATH]);
    // one component, default-exported, no Modal suffix anywhere
    expect(CHILD.match(/^function /gm)).toHaveLength(1);
    expect(CHILD).toContain('export default ConfirmAction;');
    expect(CHILD).not.toMatch(/ConfirmActionModal/);
    // it sits beside the existing notifications boundary that established the folder
    expect(fs.existsSync(path.resolve(__dirname, '../features/notifications/PosFeedbackToasts.jsx'))).toBe(true);
  });

  it('the child body is the original inner JSX re-indented 8 → 4, taking exactly the 2 props', () => {
    expect(INNER.every((l) => l === '' || l.startsWith('        '))).toBe(true);
    expect(CHILD_BODY).toBe(dedent4(INNER.join('\n')));
    expect(CHILD_FN.startsWith(`function ConfirmAction({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n  return (\n`)).toBe(true);
    expect(CHILD_FN.endsWith('\n  );\n}')).toBe(true);
  });

  it('the cross-suite pins that reference this region match the extracted shape', () => {
    const ARCH = read('./POSSalesArchitecture.characterization.test.jsx');
    const LL = read('./LayawaysList.characterization.test.jsx');
    expect(ARCH).toContain("['confirm action modal', '{confirmAction && ('],");
    expect(ARCH).toContain("['ConfirmAction', './POS/features/notifications/ConfirmAction', 1],");
    expect(LL).toContain("expect(PARENT).toContain('      {/* ─── CONFIRM ACTION MODAL ─── */}\\n      {confirmAction && (');");
    expect(CALLSITE).toContain(`${ANCHOR}\n${OPEN}`);
  });
});

// ── mutation safeguards ───────────────────────────────────────────────────────────────────
// Compiles mutated copies of the REAL child file (esbuild, in a child node process — esbuild cannot
// load under jsdom) and proves the behavioural checks reject each mutation, while the unmutated
// compile passes all. This is what stops a later "tidy-up" of ConfirmAction.jsx from changing behaviour.
describe('mutation safeguards', () => {
  const SOURCE = read('../features/notifications/ConfirmAction.jsx')
    .replace(/^import .*\n/gm, '')
    .replace(/export default ConfirmAction;\n?$/, '');
  const MUTANTS = {
    control: (s) => s,
    backdropIgnoresBusy: (s) => s.replace('onClick={() => !confirmAction.busy && setConfirmAction(null)}', 'onClick={() => setConfirmAction(null)}'),
    cancelNotDisabled: (s) => s.replace(/(onClick=\{\(\) => setConfirmAction\(null\)\}\n)\s*disabled=\{confirmAction\.busy\}\n/, '$1'),
    confirmWrapped: (s) => s.replace('onClick={confirmAction.onConfirm}', 'onClick={() => confirmAction.onConfirm && confirmAction.onConfirm()}'),
    noErrorBlock: (s) => s.replace('{confirmAction.error && (', '{false && ('),
    busyLabel: (s) => s.replace('Deleting…', 'Deleting...'),
    zIndex: (s) => s.replace('z-[700]', 'z-50'),
  };
  const compiled = {};

  beforeAll(() => {
    const sources = {};
    for (const [name, mutate] of Object.entries(MUTANTS)) {
      const src = mutate(SOURCE);
      if (name !== 'control') expect(src, `${name} mutation must apply`).not.toBe(SOURCE);
      sources[name] = src;
    }
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
    for (const [name, code] of Object.entries(codes)) {
      compiled[name] = new Function('React', 'AlertTriangle', 'RefreshCw', 'Trash2', `${code}\nreturn ConfirmAction;`)(React, AlertTriangle, RefreshCw, Trash2);
    }
  }, 30000);

  const renderProto = async () => { render(<ExtractedConfirmActionHarness />); await flush(); };
  const passes = async (check) => {
    try { await check(); return true; } catch { return false; } finally { cleanup(); }
  };
  const CHECKS = {
    backdropBusy: async () => {
      await renderProto(); press('raw-open-busy');
      fireEvent.click(backdrop());
      expect(overlay()).not.toBeNull();
    },
    cancelBusy: async () => {
      await renderProto(); press('raw-open-busy');
      fireEvent.click(cancelBtn());
      expect(overlay()).not.toBeNull();
    },
    confirmEvent: async () => {
      await renderProto(); press('raw-open');
      fireEvent.click(confirmBtn());
      expect(onConfirmSpy.mock.calls[0][0].type).toBe('click');
    },
    errorShown: async () => {
      await renderProto(); press('raw-open-error');
      expect(overlay().querySelector('.mt-3').textContent).toBe('Nope.');
    },
    busyText: async () => {
      await renderProto(); press('raw-open-busy');
      expect(confirmBtn().textContent).toBe('Deleting…');
    },
    stacking: async () => {
      await renderProto(); press('raw-open');
      expect(overlay().className).toBe('fixed inset-0 z-[700] flex items-center justify-center');
    },
  };
  const failingChecks = async (mutant) => {
    ConfirmAction = compiled[mutant];
    const failed = [];
    for (const [name, check] of Object.entries(CHECKS)) {
      onConfirmSpy.mockReset();
      if (!(await passes(check))) failed.push(name);
    }
    return failed;
  };

  it.each([
    ['control', []],
    ['backdropIgnoresBusy', ['backdropBusy']],
    ['cancelNotDisabled', ['cancelBusy']],
    ['confirmWrapped', ['confirmEvent']],
    ['noErrorBlock', ['errorShown']],
    ['busyLabel', ['busyText']],
    ['zIndex', ['stacking']],
  ])('%s -> failing checks %j', async (mutant, expected) => {
    expect(await failingChecks(mutant)).toEqual(expected);
  });
});

// keep lint honest about imports used only inside the verbatim reference region
void [AlertTriangle, RefreshCw, Trash2, React];
