import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertCircle, Shield } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/posApi', () => ({
  verifyPosSupervisorPin: vi.fn(),
  verifySupervisorAuth: vi.fn(),
  verifySessionClosurePermission: vi.fn(),
}));

import { verifyPosSupervisorPin, verifySessionClosurePermission, verifySupervisorAuth } from '../../../../api/posApi';
import { useSupervisorApproval } from '../features/approval/useSupervisorApproval';
import SupervisorPinDialog from '../features/session/SupervisorPinDialog';

/**
 * Characterization of the POSSales.jsx "Supervisor PIN Dialog", now extracted to
 * POS/features/session/SupervisorPinDialog.jsx behind the unchanged showSupervisorPin guard.
 *
 * OriginalSupervisorPinMarkup is the pre-extraction reference: its props are named exactly after the
 * POSSales identifiers the markup read, and the JSX between VERBATIM-START/END is the original
 * POSSales block. The "SupervisorPinDialog source" block enforces that the component body is that
 * same JSX, line for line, modulo the five handler renames.
 */
function OriginalSupervisorPinMarkup({
  showSupervisorPin,
  pendingPriceOverride,
  pendingSupervisorAction,
  pendingLayawayAbortAction,
  supervisorApprovalMode,
  sessionToClose,
  forceCloseReason,
  setForceCloseReason,
  forceCloseAuditAcknowledged,
  setForceCloseAuditAcknowledged,
  supervisorPinEmail,
  setSupervisorPinEmail,
  supervisorPinValue,
  setSupervisorPinValue,
  supervisorPinError,
  setSupervisorPinError,
  handleSupervisorPinSubmit,
  cancelApproval,
}) {
  return (
    <>
      {/* VERBATIM-START */}
      {showSupervisorPin && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-2xl px-5 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/20">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">Supervisor Approval</h2>
                  <p className="text-[11px] text-amber-100 mt-0.5 leading-tight">
                    {pendingPriceOverride?.type === 'BUSINESS_DAY_CLOSED'
                      ? `The Business Day has closed. ${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to authorize this pending transaction only — normal selling stays blocked.`
                      : pendingPriceOverride?.type === 'CHECKOUT'
                      ? `${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to approve the below-minimum price override`
                      : pendingPriceOverride
                      ? `${supervisorApprovalMode === 'PASSWORD' ? 'Enter password' : 'Enter PIN'} to approve price override${pendingPriceOverride.itemName ? ` for ${pendingPriceOverride.itemName}` : ''} (below min ${pendingPriceOverride.minPrice})`
                      : pendingSupervisorAction?.type === 'DAY_CLOSE'
                      ? (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to authorize Business Day Close' : 'Enter PIN to authorize Business Day Close')
                      : pendingSupervisorAction?.type === 'DELIVERY_SETTLEMENT'
                      ? `Supervisor authorization is required to settle this delivery because it was created by another user.`
                      : pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION'
                      ? 'Authorize force closure of this session.'
                      : pendingLayawayAbortAction
                      ? (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to clear layaway cart' : 'Enter PIN to clear layaway cart')
                      : (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to authorize void' : 'Enter PIN to authorize void')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' && sessionToClose && (
                <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                  <p className="text-[9px] text-amber-800/80 font-bold mb-1 uppercase tracking-wide">Target Session</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-amber-700/60">Terminal</span> <span className="font-semibold text-amber-900">{sessionToClose.terminalName || sessionToClose.terminalId}</span></div>
                    <div className="flex justify-between"><span className="text-amber-700/60">Counter</span> <span className="font-semibold text-amber-900">{sessionToClose.counterName || sessionToClose.counter || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-amber-700/60">Session</span> <span className="font-semibold text-amber-900">{sessionToClose.sessionNo || (sessionToClose.id ? `SESS-${sessionToClose.id}` : '—')}</span></div>
                    <div className="flex justify-between"><span className="text-amber-700/60">Cashier</span> <span className="font-semibold text-amber-900">{sessionToClose.cashier || sessionToClose.openedBy || sessionToClose.userId || '—'}</span></div>
                  </div>
                </div>
              )}

              {pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 block">
                      Force Close Reason <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={forceCloseReason}
                      onChange={e => { setForceCloseReason(e.target.value); setSupervisorPinError(''); }}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-white"
                    >
                      <option value="" disabled>Select reason... ▼</option>
                      <option value="Cashier unavailable">Cashier unavailable</option>
                      <option value="Cashier forgot to close session">Cashier forgot to close session</option>
                      <option value="Terminal malfunction">Terminal malfunction</option>
                      <option value="Shift handover">Shift handover</option>
                      <option value="Emergency closure">Emergency closure</option>
                      <option value="Other operational reason">Other operational reason</option>
                    </select>
                  </div>

                  <div className="bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceCloseAuditAcknowledged}
                        onChange={e => { setForceCloseAuditAcknowledged(e.target.checked); setSupervisorPinError(''); }}
                        className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-[11px] font-medium text-amber-900 leading-none">
                        I understand this Force Close will be recorded in the audit trail.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {supervisorApprovalMode === 'PASSWORD' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                      Supervisor Email / Username
                    </label>
                    <input
                      type="text"
                      value={supervisorPinEmail}
                      onChange={e => { setSupervisorPinEmail(e.target.value); setSupervisorPinError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSupervisorPinSubmit(); }}
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                    {supervisorApprovalMode === 'PASSWORD' ? 'Supervisor Password' : 'Supervisor PIN'}
                  </label>
                  <input
                    type="password"
                    value={supervisorPinValue}
                    onChange={e => { setSupervisorPinValue(e.target.value); setSupervisorPinError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSupervisorPinSubmit(); }}
                    autoFocus={supervisorApprovalMode !== 'PASSWORD'}
                    maxLength={supervisorApprovalMode === 'PASSWORD' ? 64 : 8}
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 ${supervisorApprovalMode === 'PASSWORD' ? 'text-sm' : 'text-center text-lg tracking-[0.5em]'}`}
                    placeholder={supervisorApprovalMode === 'PASSWORD' ? '' : '····'}
                  />
                  {supervisorPinError && (
                    <p className="text-[11px] font-medium text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{supervisorPinError}
                    </p>
                  )}
                </div>
              </div>

              {supervisorApprovalMode !== 'PASSWORD' && (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map(k => (
                    <button
                      key={k}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (k === 'C') { setSupervisorPinValue(''); setSupervisorPinError(''); }
                        else if (k === '✓') handleSupervisorPinSubmit();
                        else setSupervisorPinValue(p => (p + k).slice(0, 8));
                      }}
                      className={`py-2 rounded-lg text-sm font-bold transition-colors ${k === '✓' ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                          k === 'C' ? 'bg-red-100 hover:bg-red-200 text-red-600' :
                            'bg-gray-100 hover:bg-gray-200 text-[#1E293B]'
                        }`}
                    >{k}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 shrink-0 space-y-2">
              {supervisorApprovalMode === 'PASSWORD' && (
                <button
                  type="button"
                  onClick={handleSupervisorPinSubmit}
                  disabled={
                    !supervisorPinEmail || !supervisorPinValue ||
                    (pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' && (!forceCloseReason || forceCloseReason === '' || !forceCloseAuditAcknowledged))
                  }
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
                >
                  {pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' ? 'Authorize Force Close' : 'Authorize'}
                </button>
              )}
              <button
                type="button"
                onClick={cancelApproval}
                className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* VERBATIM-END */}
    </>
  );
}

/**
 * The extracted component mounted through the POSSales call site, guard included. The JSX between
 * WIRING-START/END is enforced line-for-line against POSSales, so the shared tests observe exactly
 * what the live parent passes (handleSupervisorPinSubmit and cancelApproval by reference).
 */
function ExtractedSupervisorPinWiring({
  showSupervisorPin,
  pendingPriceOverride,
  pendingSupervisorAction,
  pendingLayawayAbortAction,
  supervisorApprovalMode,
  sessionToClose,
  forceCloseReason,
  setForceCloseReason,
  forceCloseAuditAcknowledged,
  setForceCloseAuditAcknowledged,
  supervisorPinEmail,
  setSupervisorPinEmail,
  supervisorPinValue,
  setSupervisorPinValue,
  supervisorPinError,
  setSupervisorPinError,
  handleSupervisorPinSubmit,
  cancelApproval,
}) {
  return (
    <>
      {/* WIRING-START */}
      {showSupervisorPin && (
        <SupervisorPinDialog
          pendingPriceOverride={pendingPriceOverride}
          pendingSupervisorAction={pendingSupervisorAction}
          pendingLayawayAbortAction={pendingLayawayAbortAction}
          supervisorApprovalMode={supervisorApprovalMode}
          sessionToClose={sessionToClose}
          forceCloseReason={forceCloseReason}
          setForceCloseReason={setForceCloseReason}
          forceCloseAuditAcknowledged={forceCloseAuditAcknowledged}
          setForceCloseAuditAcknowledged={setForceCloseAuditAcknowledged}
          supervisorPinEmail={supervisorPinEmail}
          setSupervisorPinEmail={setSupervisorPinEmail}
          supervisorPinValue={supervisorPinValue}
          setSupervisorPinValue={setSupervisorPinValue}
          supervisorPinError={supervisorPinError}
          setSupervisorPinError={setSupervisorPinError}
          onSubmit={handleSupervisorPinSubmit}
          onCancel={cancelApproval}
        />
      )}
      {/* WIRING-END */}
    </>
  );
}

const SUBJECTS = [
  ['original Supervisor PIN markup', OriginalSupervisorPinMarkup],
  ['SupervisorPinDialog via POSSales wiring', ExtractedSupervisorPinWiring],
];

// ── fixtures ────────────────────────────────────────────────────────────────
const OVERLAY_CLASS = 'fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4';
const PANEL_CLASS = 'bg-white rounded-2xl shadow-2xl w-full max-w-[480px] flex flex-col max-h-[90vh]';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'];
const REASONS = ['Cashier unavailable', 'Cashier forgot to close session', 'Terminal malfunction', 'Shift handover', 'Emergency closure', 'Other operational reason'];
const TARGET = { id: 77, terminalName: 'Till 3', terminalId: 'T-3', counterName: 'Counter A', sessionNo: 'S-0077', cashier: 'bob' };

const noop = () => {};
function propsFor(overrides = {}) {
  return {
    showSupervisorPin: true,
    pendingPriceOverride: null,
    pendingSupervisorAction: null,
    pendingLayawayAbortAction: null,
    supervisorApprovalMode: 'PIN',
    sessionToClose: null,
    forceCloseReason: '',
    setForceCloseReason: noop,
    forceCloseAuditAcknowledged: false,
    setForceCloseAuditAcknowledged: noop,
    supervisorPinEmail: '',
    setSupervisorPinEmail: noop,
    supervisorPinValue: '',
    setSupervisorPinValue: noop,
    supervisorPinError: '',
    setSupervisorPinError: noop,
    handleSupervisorPinSubmit: noop,
    cancelApproval: noop,
    ...overrides,
  };
}

const overlay = () => document.querySelector('.z-\\[300\\]');
const panel = () => overlay().firstElementChild;
const headerText = () => within(overlay()).getByRole('heading', { level: 2 }).nextElementSibling.textContent;
const allButtons = () => Array.from(overlay().querySelectorAll('button'));
const keypad = () => overlay().querySelector('.grid.grid-cols-3');
const keyButton = (k) => Array.from(keypad().querySelectorAll('button')).find((b) => b.textContent === k);
const pinInput = () => overlay().querySelector('input[type="password"]');
const emailInput = () => overlay().querySelector('input[type="text"]');
const reasonSelect = () => overlay().querySelector('select');
const ackCheckbox = () => overlay().querySelector('input[type="checkbox"]');
const cancelButton = () => within(overlay()).getByRole('button', { name: 'Cancel' });
const authorizeButton = () => within(overlay()).queryByRole('button', { name: /^Authorize/ });
const errorLine = () => pinInput().parentElement.querySelector('p');
const iconHtml = (el) => { const c = document.createElement('div'); render(el, { container: c }); return c.innerHTML; };

beforeEach(() => {
  vi.clearAllMocks();
  verifyPosSupervisorPin.mockResolvedValue(true);
  verifySupervisorAuth.mockResolvedValue({ valid: true });
  verifySessionClosurePermission.mockResolvedValue({ authorized: true, authorizationToken: 'grant-1' });
});

afterEach(() => {
  cleanup();
});

// Every behavioural block below (including the real-hook harness) runs against both the pre-extraction
// reference and the extracted component mounted through the exact POSSales call site.
describe.each(SUBJECTS)('%s', (_label, Subject) => {
  const renderMarkup = (overrides) => render(<Subject {...propsFor(overrides)} />);

  // ── 1. mount / lifecycle ────────────────────────────────────────────────────
  describe('1. mount / lifecycle', () => {
    it('renders nothing at all while showSupervisorPin is false (&& guard, not an open prop)', () => {
      const { container } = renderMarkup({ showSupervisorPin: false });
      expect(container.innerHTML).toBe('');
      expect(overlay()).toBeNull();
    });

    it.each([[0], [''], [null], [undefined]])('a falsy guard value %p renders nothing (React skips false/null/undefined/"" but would print 0)', (v) => {
      const { container } = renderMarkup({ showSupervisorPin: v });
      // showSupervisorPin is always a boolean from useState(false); 0 would leak a "0" text node.
      expect(container.innerHTML).toBe(v === 0 ? '0' : '');
    });

    it('is NOT portaled: the fixed overlay is rendered in place inside the parent container', () => {
      const { container } = renderMarkup();
      expect(container.firstElementChild).toBe(overlay());
      expect(container.children).toHaveLength(1);
      expect(overlay().className).toBe(OVERLAY_CLASS);
      expect(panel().className).toBe(PANEL_CLASS);
    });

    it('is a plain div overlay — no Radix Dialog, no role/aria-modal, no focus trap, no data-slot', () => {
      renderMarkup();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('[data-slot]')).toBeNull();
      expect(document.querySelector('[aria-modal]')).toBeNull();
      expect(overlay().hasAttribute('role')).toBe(false);
    });

    it('has no Escape, backdrop-click or X close: only Cancel can dismiss it from inside', async () => {
      const cancelApproval = vi.fn();
      const setSupervisorPinValue = vi.fn();
      renderMarkup({ cancelApproval, setSupervisorPinValue });
      await userEvent.keyboard('{Escape}');
      fireEvent.keyDown(overlay(), { key: 'Escape' });
      fireEvent.click(overlay());
      fireEvent.mouseDown(overlay());
      expect(cancelApproval).not.toHaveBeenCalled();
      expect(setSupervisorPinValue).not.toHaveBeenCalled();
      expect(allButtons().map((b) => b.textContent)).toEqual([...KEYS, 'Cancel']);
    });

    it('unmounts and remounts on every flag flip: a reopened dialog gets fresh DOM nodes', () => {
      const { rerender, container } = renderMarkup();
      const firstInput = pinInput();
      rerender(<Subject {...propsFor({ showSupervisorPin: false })} />);
      expect(container.innerHTML).toBe('');
      expect(firstInput.isConnected).toBe(false);
      rerender(<Subject {...propsFor()} />);
      expect(pinInput()).not.toBe(firstInput);
    });

    it('closing is a pure unmount: the markup itself calls no setter when the flag drops', () => {
      const spies = { setSupervisorPinValue: vi.fn(), setSupervisorPinEmail: vi.fn(), setSupervisorPinError: vi.fn(), cancelApproval: vi.fn(), handleSupervisorPinSubmit: vi.fn() };
      const { rerender } = renderMarkup(spies);
      rerender(<Subject {...propsFor({ ...spies, showSupervisorPin: false })} />);
      for (const s of Object.values(spies)) expect(s).not.toHaveBeenCalled();
    });

    it('renders header, body and footer sections in that order', () => {
      renderMarkup();
      expect(Array.from(panel().children).map((c) => c.className)).toEqual([
        'bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-2xl px-5 py-4 shrink-0',
        'p-4 space-y-3 overflow-y-auto',
        'p-5 border-t border-gray-100 shrink-0 space-y-2',
      ]);
    });
  });

  // ── 2. approval header ──────────────────────────────────────────────────────
  describe('2. approval header branches', () => {
    it('title, Shield icon and subtitle classes are constant across every branch', () => {
      renderMarkup({ pendingSupervisorAction: { type: 'DAY_CLOSE' } });
      const h2 = within(overlay()).getByRole('heading', { level: 2 });
      expect(h2.textContent).toBe('Supervisor Approval');
      expect(h2.className).toBe('text-base font-bold text-white leading-tight');
      expect(h2.nextElementSibling.tagName).toBe('P');
      expect(h2.nextElementSibling.className).toBe('text-[11px] text-amber-100 mt-0.5 leading-tight');
      const iconWrap = h2.parentElement.previousElementSibling;
      expect(iconWrap.className).toBe('p-2 rounded-lg bg-white/20');
      expect(iconWrap.innerHTML).toBe(iconHtml(<Shield className="h-5 w-5 text-white" />));
    });

    const layawayThunk = () => {};
    const BRANCHES = [
      ['BUSINESS_DAY_CLOSED', { pendingPriceOverride: { type: 'BUSINESS_DAY_CLOSED', closedAt: 'x' } },
        'The Business Day has closed. Enter PIN to authorize this pending transaction only — normal selling stays blocked.',
        'The Business Day has closed. Enter password to authorize this pending transaction only — normal selling stays blocked.'],
      ['CHECKOUT', { pendingPriceOverride: { type: 'CHECKOUT' } },
        'Enter PIN to approve the below-minimum price override',
        'Enter password to approve the below-minimum price override'],
      ['price override UPDATE_PRICE with itemName', { pendingPriceOverride: { type: 'UPDATE_PRICE', itemName: 'Widget', minPrice: 10 } },
        'Enter PIN to approve price override for Widget (below min 10)',
        'Enter password to approve price override for Widget (below min 10)'],
      ['price override without itemName', { pendingPriceOverride: { type: 'UPDATE_DISCOUNT', minPrice: 9.5 } },
        'Enter PIN to approve price override (below min 9.5)',
        'Enter password to approve price override (below min 9.5)'],
      ['price override with empty itemName and no minPrice', { pendingPriceOverride: { type: 'ADD_ITEM', itemName: '' } },
        'Enter PIN to approve price override (below min undefined)',
        'Enter password to approve price override (below min undefined)'],
      ['DAY_CLOSE', { pendingSupervisorAction: { type: 'DAY_CLOSE', payload: {} } },
        'Enter PIN to authorize Business Day Close',
        'Enter password to authorize Business Day Close'],
      ['DELIVERY_SETTLEMENT (mode-independent)', { pendingSupervisorAction: { type: 'DELIVERY_SETTLEMENT', retry: noop } },
        'Supervisor authorization is required to settle this delivery because it was created by another user.',
        'Supervisor authorization is required to settle this delivery because it was created by another user.'],
      ['FORCE_CLOSE_SESSION (mode-independent)', { pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' } },
        'Authorize force closure of this session.',
        'Authorize force closure of this session.'],
      ['layaway abort (thunk)', { pendingLayawayAbortAction: layawayThunk },
        'Enter PIN to clear layaway cart',
        'Enter password to clear layaway cart'],
      ['fallback (void / advanced-range unlock / nothing pending)', {},
        'Enter PIN to authorize void',
        'Enter password to authorize void'],
    ];

    it.each(BRANCHES)('%s', (_n, slots, pinText, passwordText) => {
      renderMarkup({ ...slots, supervisorApprovalMode: 'PIN' });
      expect(headerText()).toBe(pinText);
      cleanup();
      renderMarkup({ ...slots, supervisorApprovalMode: 'PASSWORD' });
      expect(headerText()).toBe(passwordText);
    });

    it('any mode other than the exact string "PASSWORD" uses the PIN wording', () => {
      renderMarkup({ supervisorApprovalMode: 'password' });
      expect(headerText()).toBe('Enter PIN to authorize void');
      expect(pinInput().maxLength).toBe(8);
    });

    describe('precedence (first match wins; branches are not merged)', () => {
      it.each([
        ['BUSINESS_DAY_CLOSED over a supervisor action and a layaway abort',
          { pendingPriceOverride: { type: 'BUSINESS_DAY_CLOSED' }, pendingSupervisorAction: { type: 'DAY_CLOSE' }, pendingLayawayAbortAction: noop },
          'The Business Day has closed. Enter PIN to authorize this pending transaction only — normal selling stays blocked.'],
        ['any price override over FORCE_CLOSE_SESSION', { pendingPriceOverride: { type: 'UPDATE_PRICE', itemName: 'A', minPrice: 1 }, pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' } },
          'Enter PIN to approve price override for A (below min 1)'],
        ['DAY_CLOSE over a layaway abort', { pendingSupervisorAction: { type: 'DAY_CLOSE' }, pendingLayawayAbortAction: noop },
          'Enter PIN to authorize Business Day Close'],
        ['FORCE_CLOSE_SESSION over a layaway abort', { pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, pendingLayawayAbortAction: noop },
          'Authorize force closure of this session.'],
        ['an unknown supervisor action type falls through to the layaway branch', { pendingSupervisorAction: { type: 'SOMETHING_ELSE' }, pendingLayawayAbortAction: noop },
          'Enter PIN to clear layaway cart'],
        ['an unknown supervisor action type alone falls through to the void fallback', { pendingSupervisorAction: { type: 'SOMETHING_ELSE' } },
          'Enter PIN to authorize void'],
        ['a truthy non-typed price override object uses the generic price wording', { pendingPriceOverride: {} },
          'Enter PIN to approve price override (below min undefined)'],
      ])('%s', (_n, slots, text) => {
        renderMarkup(slots);
        expect(headerText()).toBe(text);
      });
    });

    it('the header ternary is not evaluated at all while closed (guard short-circuits the whole tree)', () => {
      const reads = { n: 0 };
      const action = { get type() { reads.n += 1; return 'DAY_CLOSE'; } };
      const { rerender } = renderMarkup({ showSupervisorPin: false, pendingSupervisorAction: action });
      expect(reads.n).toBe(0);
      rerender(<Subject {...propsFor({ pendingSupervisorAction: action })} />);
      expect(reads.n).toBeGreaterThan(0);
    });
  });

  // ── force-close body ────────────────────────────────────────────────────────
  describe('2b. FORCE_CLOSE_SESSION body', () => {
    it('target-session card needs BOTH the force-close action and sessionToClose', () => {
      renderMarkup({ pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' } });
      expect(overlay().textContent).not.toContain('Target Session');
      expect(reasonSelect()).not.toBeNull();
      cleanup();
      renderMarkup({ sessionToClose: TARGET });
      expect(overlay().textContent).not.toContain('Target Session');
      expect(reasonSelect()).toBeNull();
      expect(ackCheckbox()).toBeNull();
    });

    it.each([
      ['full record', TARGET, ['Till 3', 'Counter A', 'S-0077', 'bob']],
      ['fallbacks: terminalId, counter, SESS-id, openedBy', { id: 5, terminalId: 'T-9', counter: 'C2', openedBy: 'amy' }, ['T-9', 'C2', 'SESS-5', 'amy']],
      ['fallbacks: userId; missing counter/session → —; missing terminal → empty', { userId: 'u-1' }, ['', '—', '—', 'u-1']],
    ])('target-session values: %s', (_n, sessionToClose, values) => {
      renderMarkup({ pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, sessionToClose });
      const card = Array.from(overlay().querySelectorAll('p')).find((p) => p.textContent === 'Target Session').parentElement;
      expect(card.className).toBe('bg-amber-50/50 p-2.5 rounded-lg border border-amber-100');
      const rows = Array.from(card.querySelectorAll('.grid > div'));
      expect(rows.map((r) => r.firstElementChild.textContent)).toEqual(['Terminal', 'Counter', 'Session', 'Cashier']);
      expect(rows.map((r) => r.lastElementChild.textContent)).toEqual(values);
    });

    it('reason select is controlled, starts on the disabled placeholder, lists the six reasons in order', () => {
      renderMarkup({ pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' } });
      const opts = Array.from(reasonSelect().options);
      expect(opts.map((o) => [o.value, o.textContent, o.disabled])).toEqual([
        ['', 'Select reason... ▼', true],
        ...REASONS.map((r) => [r, r, false]),
      ]);
      expect(reasonSelect().value).toBe('');
      cleanup();
      renderMarkup({ pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, forceCloseReason: 'Shift handover' });
      expect(reasonSelect().value).toBe('Shift handover');
    });

    it('reason change: setForceCloseReason(value) THEN setSupervisorPinError("")', () => {
      const order = [];
      renderMarkup({
        pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' },
        setForceCloseReason: vi.fn((v) => order.push(['reason', v])),
        setSupervisorPinError: vi.fn((v) => order.push(['error', v])),
      });
      fireEvent.change(reasonSelect(), { target: { value: 'Terminal malfunction' } });
      expect(order).toEqual([['reason', 'Terminal malfunction'], ['error', '']]);
    });

    it('audit checkbox: controlled; change → setForceCloseAuditAcknowledged(checked) THEN setSupervisorPinError("")', () => {
      const order = [];
      renderMarkup({
        pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' },
        setForceCloseAuditAcknowledged: vi.fn((v) => order.push(['ack', v])),
        setSupervisorPinError: vi.fn((v) => order.push(['error', v])),
      });
      expect(ackCheckbox().checked).toBe(false);
      expect(ackCheckbox().closest('label').textContent.trim()).toBe('I understand this Force Close will be recorded in the audit trail.');
      fireEvent.click(ackCheckbox());
      expect(order).toEqual([['ack', true], ['error', '']]);
    });
  });

  // ── 3. inputs ───────────────────────────────────────────────────────────────
  describe('3. credential inputs', () => {
    it('PIN mode: one password input, no email, 8-char limit, dot placeholder, centred wide tracking', () => {
      renderMarkup({ supervisorPinValue: '12' });
      expect(overlay().querySelectorAll('input')).toHaveLength(1);
      expect(emailInput()).toBeNull();
      const input = pinInput();
      expect(input.previousElementSibling.textContent.trim()).toBe('Supervisor PIN');
      expect(input.maxLength).toBe(8);
      expect(input.getAttribute('placeholder')).toBe('····');
      expect(input.className).toBe('w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-center text-lg tracking-[0.5em]');
      expect(input.value).toBe('12');
      expect(input.disabled).toBe(false);
      expect(input.hasAttribute('name')).toBe(false);
      expect(input.hasAttribute('autocomplete')).toBe(false);
      expect(input.closest('form')).toBeNull();
    });

    it('PASSWORD mode: email text input before the password input, 64-char limit, empty placeholder, text-sm', () => {
      renderMarkup({ supervisorApprovalMode: 'PASSWORD', supervisorPinEmail: 'm@shop.test', supervisorPinValue: 'pw' });
      const inputs = Array.from(overlay().querySelectorAll('input'));
      expect(inputs.map((i) => i.type)).toEqual(['text', 'password']);
      expect(emailInput().previousElementSibling.textContent.trim()).toBe('Supervisor Email / Username');
      expect(emailInput().value).toBe('m@shop.test');
      expect(emailInput().hasAttribute('maxlength')).toBe(false);
      expect(emailInput().className).toBe('w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400');
      expect(pinInput().previousElementSibling.textContent.trim()).toBe('Supervisor Password');
      expect(pinInput().maxLength).toBe(64);
      expect(pinInput().getAttribute('placeholder')).toBe('');
      expect(pinInput().className).toBe('w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm');
      expect(pinInput().value).toBe('pw');
      expect(keypad()).toBeNull();
    });

    it.each([
      ['PIN input', () => pinInput(), 'setSupervisorPinValue', {}],
      ['email input', () => emailInput(), 'setSupervisorPinEmail', { supervisorApprovalMode: 'PASSWORD' }],
    ])('%s change: setter(e.target.value) THEN setSupervisorPinError("") — plain value, not an updater', (_n, el, setterName, extra) => {
      const order = [];
      renderMarkup({
        ...extra,
        [setterName]: vi.fn((v) => order.push([setterName, v])),
        setSupervisorPinError: vi.fn((v) => order.push(['setSupervisorPinError', v])),
      });
      fireEvent.change(el(), { target: { value: '99' } });
      expect(order).toEqual([[setterName, '99'], ['setSupervisorPinError', '']]);
    });

    it('value is fully controlled: without a parent update the DOM value snaps back', () => {
      renderMarkup({ supervisorPinValue: '1' });
      fireEvent.change(pinInput(), { target: { value: '12' } });
      expect(pinInput().value).toBe('1');
    });

    it('error line renders only for a truthy error, with the AlertCircle icon before the text', () => {
      renderMarkup({ supervisorPinError: '' });
      expect(errorLine()).toBeNull();
      cleanup();
      renderMarkup({ supervisorPinError: 'Incorrect PIN. Please try again.' });
      expect(errorLine().className).toBe('text-[11px] font-medium text-red-500 mt-1 flex items-center gap-1');
      expect(errorLine().innerHTML).toBe(`${iconHtml(<AlertCircle className="h-3 w-3 shrink-0" />)}Incorrect PIN. Please try again.`);
    });

    it('there is no loading/disabled state anywhere: inputs and keypad stay enabled regardless of props', () => {
      renderMarkup({ supervisorPinError: 'x', supervisorPinValue: '12345678' });
      expect(pinInput().disabled).toBe(false);
      for (const b of allButtons()) expect(b.disabled).toBe(false);
    });
  });

  // ── 4. focus ────────────────────────────────────────────────────────────────
  describe('4. focus behaviour', () => {
    it('PIN mode mount focuses the PIN input (autoFocus)', () => {
      renderMarkup();
      expect(document.activeElement).toBe(pinInput());
    });

    it('PASSWORD mode mount focuses the email input, not the password input', () => {
      renderMarkup({ supervisorApprovalMode: 'PASSWORD' });
      expect(document.activeElement).toBe(emailInput());
    });

    it('autoFocus is mount-only: a re-render with new values keeps the same input element and focus', () => {
      const { rerender } = renderMarkup();
      const input = pinInput();
      rerender(<Subject {...propsFor({ supervisorPinValue: '12', supervisorPinError: 'bad' })} />);
      expect(pinInput()).toBe(input);
      expect(document.activeElement).toBe(input);
    });

    it('focus moved elsewhere is NOT reclaimed on re-render', () => {
      const { rerender } = renderMarkup();
      cancelButton().focus();
      rerender(<Subject {...propsFor({ supervisorPinValue: '1' })} />);
      expect(document.activeElement).toBe(cancelButton());
    });

    it('every keypad button prevents mousedown default; Cancel/Authorize do not', () => {
      renderMarkup();
      for (const k of KEYS) expect(fireEvent.mouseDown(keyButton(k))).toBe(false);
      expect(fireEvent.mouseDown(cancelButton())).toBe(true);
      cleanup();
      renderMarkup({ supervisorApprovalMode: 'PASSWORD', supervisorPinEmail: 'a', supervisorPinValue: 'b' });
      expect(fireEvent.mouseDown(authorizeButton())).toBe(true);
    });

    it('clicking keypad buttons leaves focus on the PIN input; clicking Cancel moves it to the button', async () => {
      renderMarkup();
      for (const k of ['1', 'C', '0', '✓']) {
        await userEvent.click(keyButton(k));
        expect(document.activeElement).toBe(pinInput());
      }
      await userEvent.click(cancelButton());
      expect(document.activeElement).toBe(cancelButton());
    });

    it('switching PIN → PASSWORD while open keeps the password input element; the newly mounted email input autofocuses', () => {
      const { rerender } = renderMarkup();
      const input = pinInput();
      rerender(<Subject {...propsFor({ supervisorApprovalMode: 'PASSWORD' })} />);
      expect(pinInput()).toBe(input);
      expect(document.activeElement).toBe(emailInput());
    });

    it('switching the approval branch while open keeps the same input element (header text is not keyed)', () => {
      const { rerender } = renderMarkup();
      const input = pinInput();
      rerender(<Subject {...propsFor({ pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, sessionToClose: TARGET })} />);
      expect(pinInput()).toBe(input);
      expect(document.activeElement).toBe(input);
    });
  });

  // ── 5. submit paths ─────────────────────────────────────────────────────────
  describe('5. submit / cancel paths (spied props)', () => {
    it('keypad renders 1-9, C, 0, ✓ in that order with the three class variants', () => {
      renderMarkup();
      const keys = Array.from(keypad().querySelectorAll('button'));
      expect(keypad().className).toBe('grid grid-cols-3 gap-2');
      expect(keys.map((b) => b.textContent)).toEqual(KEYS);
      for (const b of keys) expect(b.getAttribute('type')).toBe('button');
      expect(keyButton('✓').className).toBe('py-2 rounded-lg text-sm font-bold transition-colors bg-amber-500 hover:bg-amber-600 text-white');
      expect(keyButton('C').className).toBe('py-2 rounded-lg text-sm font-bold transition-colors bg-red-100 hover:bg-red-200 text-red-600');
      expect(keyButton('5').className).toBe('py-2 rounded-lg text-sm font-bold transition-colors bg-gray-100 hover:bg-gray-200 text-[#1E293B]');
    });

    it.each([
      ['1 onto empty', '1', '', '1'],
      ['0 (number key) appends "0"', '0', '12', '120'],
      ['9 at 7 chars fills the 8th', '9', '1234567', '12345679'],
      ['9 at 8 chars is dropped by the slice', '9', '12345678', '12345678'],
      ['5 onto an over-long typed value truncates it to 8', '5', '1234567890', '12345678'],
    ])('digit %s: setSupervisorPinValue(updater); error NOT cleared', (_label, key, prev, next) => {
      const setSupervisorPinValue = vi.fn();
      const setSupervisorPinError = vi.fn();
      renderMarkup({ setSupervisorPinValue, setSupervisorPinError });
      fireEvent.click(keyButton(key));
      expect(setSupervisorPinValue).toHaveBeenCalledTimes(1);
      const [updater] = setSupervisorPinValue.mock.calls[0];
      expect(typeof updater).toBe('function');
      expect(updater(prev)).toBe(next);
      expect(setSupervisorPinError).not.toHaveBeenCalled();
    });

    it('C: setSupervisorPinValue("") THEN setSupervisorPinError(""), no submit', () => {
      const order = [];
      const handleSupervisorPinSubmit = vi.fn();
      renderMarkup({
        setSupervisorPinValue: vi.fn((v) => order.push(['value', v])),
        setSupervisorPinError: vi.fn((v) => order.push(['error', v])),
        handleSupervisorPinSubmit,
      });
      fireEvent.click(keyButton('C'));
      expect(order).toEqual([['value', ''], ['error', '']]);
      expect(handleSupervisorPinSubmit).not.toHaveBeenCalled();
    });

    it('✓ calls handleSupervisorPinSubmit with NO arguments (event not forwarded)', () => {
      const handleSupervisorPinSubmit = vi.fn();
      const setSupervisorPinValue = vi.fn();
      renderMarkup({ handleSupervisorPinSubmit, setSupervisorPinValue });
      fireEvent.click(keyButton('✓'));
      expect(handleSupervisorPinSubmit.mock.calls).toEqual([[]]);
      expect(setSupervisorPinValue).not.toHaveBeenCalled();
    });

    it.each([
      ['PIN input', () => pinInput(), {}],
      ['email input', () => emailInput(), { supervisorApprovalMode: 'PASSWORD' }],
      ['password input', () => pinInput(), { supervisorApprovalMode: 'PASSWORD' }],
    ])('Enter on the %s calls handleSupervisorPinSubmit() with no arguments and does not preventDefault', (_n, el, extra) => {
      const handleSupervisorPinSubmit = vi.fn();
      renderMarkup({ ...extra, handleSupervisorPinSubmit });
      expect(fireEvent.keyDown(el(), { key: 'Enter' })).toBe(true);
      expect(handleSupervisorPinSubmit.mock.calls).toEqual([[]]);
      fireEvent.keyDown(el(), { key: 'a' });
      fireEvent.keyDown(el(), { key: 'NumpadEnter', code: 'NumpadEnter' });
      fireEvent.keyUp(el(), { key: 'Enter' });
      expect(handleSupervisorPinSubmit).toHaveBeenCalledTimes(1);
    });

    it('Enter is not gated: it submits even with an empty value and even when Authorize would be disabled', () => {
      const handleSupervisorPinSubmit = vi.fn();
      renderMarkup({ supervisorApprovalMode: 'PASSWORD', pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, handleSupervisorPinSubmit });
      expect(authorizeButton()).toBeDisabled();
      fireEvent.keyDown(emailInput(), { key: 'Enter' });
      expect(handleSupervisorPinSubmit).toHaveBeenCalledTimes(1);
    });

    it('Authorize (PASSWORD only) passes handleSupervisorPinSubmit by reference: the click event IS forwarded', async () => {
      const handleSupervisorPinSubmit = vi.fn();
      renderMarkup({ supervisorApprovalMode: 'PASSWORD', supervisorPinEmail: 'm', supervisorPinValue: 'p', handleSupervisorPinSubmit });
      expect(authorizeButton().textContent).toBe('Authorize');
      expect(authorizeButton().className).toBe('w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors');
      await userEvent.click(authorizeButton());
      expect(handleSupervisorPinSubmit).toHaveBeenCalledTimes(1);
      expect(handleSupervisorPinSubmit.mock.calls[0]).toHaveLength(1);
      expect(handleSupervisorPinSubmit.mock.calls[0][0].type).toBe('click');
    });

    it('PIN mode has no Authorize button; ✓ is the only click submit', () => {
      renderMarkup({ pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' } });
      expect(authorizeButton()).toBeNull();
    });

    it.each([
      ['no email', { supervisorPinValue: 'p' }, true],
      ['no password', { supervisorPinEmail: 'm' }, true],
      ['email + password', { supervisorPinEmail: 'm', supervisorPinValue: 'p' }, false],
      ['force close, no reason', { supervisorPinEmail: 'm', supervisorPinValue: 'p', pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, forceCloseAuditAcknowledged: true }, true],
      ['force close, not acknowledged', { supervisorPinEmail: 'm', supervisorPinValue: 'p', pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, forceCloseReason: 'Shift handover' }, true],
      ['force close, complete', { supervisorPinEmail: 'm', supervisorPinValue: 'p', pendingSupervisorAction: { type: 'FORCE_CLOSE_SESSION' }, forceCloseReason: 'Shift handover', forceCloseAuditAcknowledged: true }, false],
      ['reason/ack ignored for other actions', { supervisorPinEmail: 'm', supervisorPinValue: 'p', pendingSupervisorAction: { type: 'DAY_CLOSE' } }, false],
    ])('Authorize disabled: %s → %s', (_n, extra, disabled) => {
      const handleSupervisorPinSubmit = vi.fn();
      renderMarkup({ supervisorApprovalMode: 'PASSWORD', handleSupervisorPinSubmit, ...extra });
      expect(authorizeButton().disabled).toBe(disabled);
      expect(authorizeButton().textContent).toBe(extra.pendingSupervisorAction?.type === 'FORCE_CLOSE_SESSION' ? 'Authorize Force Close' : 'Authorize');
      fireEvent.click(authorizeButton());
      expect(handleSupervisorPinSubmit).toHaveBeenCalledTimes(disabled ? 0 : 1);
    });

    it.each([['PIN'], ['PASSWORD']])('Cancel (%s) passes cancelApproval by reference: the click event IS forwarded', async (mode) => {
      const cancelApproval = vi.fn();
      const handleSupervisorPinSubmit = vi.fn();
      renderMarkup({ supervisorApprovalMode: mode, cancelApproval, handleSupervisorPinSubmit });
      expect(cancelButton().className).toBe('w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors');
      await userEvent.click(cancelButton());
      expect(cancelApproval).toHaveBeenCalledTimes(1);
      expect(cancelApproval.mock.calls[0][0].type).toBe('click');
      expect(handleSupervisorPinSubmit).not.toHaveBeenCalled();
    });

    it('footer order: Authorize (PASSWORD only) then Cancel', () => {
      renderMarkup({ supervisorApprovalMode: 'PASSWORD' });
      const footer = panel().lastElementChild;
      expect(Array.from(footer.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Authorize', 'Cancel']);
    });
  });

  // ── 7. render-time closures ─────────────────────────────────────────────────
  describe('7. render-time closures', () => {
    it('Enter, ✓ and Authorize call the handleSupervisorPinSubmit of the LATEST render, never a stale one', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = renderMarkup({ supervisorApprovalMode: 'PASSWORD', supervisorPinEmail: 'm', supervisorPinValue: 'p', handleSupervisorPinSubmit: first });
      rerender(<Subject {...propsFor({ supervisorApprovalMode: 'PASSWORD', supervisorPinEmail: 'm', supervisorPinValue: 'p', handleSupervisorPinSubmit: second })} />);
      fireEvent.keyDown(pinInput(), { key: 'Enter' });
      fireEvent.click(authorizeButton());
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(2);
    });

    it('keypad ✓ and C use the latest-render callbacks too', () => {
      const [s1, s2, v1, v2] = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
      const { rerender } = renderMarkup({ handleSupervisorPinSubmit: s1, setSupervisorPinValue: v1 });
      rerender(<Subject {...propsFor({ handleSupervisorPinSubmit: s2, setSupervisorPinValue: v2 })} />);
      fireEvent.click(keyButton('✓'));
      fireEvent.click(keyButton('C'));
      expect(s1).not.toHaveBeenCalled();
      expect(v1).not.toHaveBeenCalled();
      expect(s2).toHaveBeenCalledTimes(1);
      expect(v2).toHaveBeenCalledWith('');
    });
  });

  // ── harness with the real useSupervisorApproval hook ────────────────────────
  /**
   * Stateful harness: the real hook, the POSSales handleSupervisorPinSubmit wrapper (copied between
   * HANDLER-START/END and enforced against POSSales source), and spies for every continuation.
   */
  function Harness({ mode = 'PIN', onApproval, spies, refs, initialSessionToClose = null }) {
    const approval = useSupervisorApproval();
    const {
      showSupervisorPin,
      supervisorPinValue, setSupervisorPinValue,
      supervisorPinEmail, setSupervisorPinEmail,
      supervisorPinError, setSupervisorPinError,
      pendingPriceOverride,
      pendingLayawayAbortAction,
      pendingSupervisorAction,
      cancelApproval,
      submitSupervisorApproval,
    } = approval;
    const supervisorApprovalMode = mode;
    const currentTerminal = { terminalId: 'T-1' };
    const cashierDisplayName = 'Aisha Khan';
    const currentSession = { id: 42 };
    const [sessionToClose] = useState(initialSessionToClose);
    const [forceCloseReason, setForceCloseReason] = useState('');
    const [forceCloseAuditAcknowledged, setForceCloseAuditAcknowledged] = useState(false);
    // Plain { current } objects owned by the test (POSSales uses useRef); the handler only writes through them.
    const { closureAuthGrantRef, forceCloseContextRef } = refs;
    const {
      setCurrentView, unlockAdvancedRange, applyVoid, addToInvoice, updateItemPrice, updateDiscount,
      processPayment, clearLayawayConversion, handleCloseDay,
    } = spies;

    // HANDLER-START
    const handleSupervisorPinSubmit = () => submitSupervisorApproval({
      supervisorApprovalMode, currentTerminal, cashierDisplayName,
      forceCloseReason, forceCloseAuditAcknowledged, sessionToClose, currentSession,
      closureAuthGrantRef, forceCloseContextRef, setCurrentView,
      unlockAdvancedRange,
      applyVoid, addToInvoice, updateItemPrice, updateDiscount,
      processPayment,
      clearLayawayConversion,
      handleCloseDay,
    });
    // HANDLER-END

    onApproval(approval);

    return (
      <Subject
        showSupervisorPin={showSupervisorPin}
        pendingPriceOverride={pendingPriceOverride}
        pendingSupervisorAction={pendingSupervisorAction}
        pendingLayawayAbortAction={pendingLayawayAbortAction}
        supervisorApprovalMode={supervisorApprovalMode}
        sessionToClose={sessionToClose}
        forceCloseReason={forceCloseReason}
        setForceCloseReason={setForceCloseReason}
        forceCloseAuditAcknowledged={forceCloseAuditAcknowledged}
        setForceCloseAuditAcknowledged={setForceCloseAuditAcknowledged}
        supervisorPinEmail={supervisorPinEmail}
        setSupervisorPinEmail={setSupervisorPinEmail}
        supervisorPinValue={supervisorPinValue}
        setSupervisorPinValue={setSupervisorPinValue}
        supervisorPinError={supervisorPinError}
        setSupervisorPinError={setSupervisorPinError}
        handleSupervisorPinSubmit={handleSupervisorPinSubmit}
        cancelApproval={cancelApproval}
      />
    );
  }

  const makeSpies = () => ({
    setCurrentView: vi.fn(), unlockAdvancedRange: vi.fn(), applyVoid: vi.fn(), addToInvoice: vi.fn(),
    updateItemPrice: vi.fn(), updateDiscount: vi.fn(), processPayment: vi.fn(), clearLayawayConversion: vi.fn(), handleCloseDay: vi.fn(),
  });
  function renderHarness(props = {}) {
    let latestApproval = null;
    const spies = makeSpies();
    const refs = { closureAuthGrantRef: { current: null }, forceCloseContextRef: { current: null } };
    render(<Harness onApproval={(a) => { latestApproval = a; }} spies={spies} refs={refs} {...props} />);
    const hook = () => latestApproval;
    return { hook, spies, refs };
  }
  const deferred = () => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
  };
  const tap = async (...keys) => { for (const k of keys) await act(async () => { fireEvent.click(keyButton(k)); }); };

  describe('6. approval queue semantics (real hook)', () => {
    it('the dialog only reads the queue: opening via requestApproval, keypad entry and ✓ drain the void slot', async () => {
      const { hook, spies } = renderHarness();
      act(() => { hook().requestApproval({ voidItemId: 'line-1' }); });
      expect(headerText()).toBe('Enter PIN to authorize void');
      expect(document.activeElement).toBe(pinInput());
      await tap('1', '2', '3', '4');
      expect(pinInput().value).toBe('1234');
      await tap('✓');
      expect(verifyPosSupervisorPin).toHaveBeenCalledWith('1234');
      expect(spies.applyVoid).toHaveBeenCalledWith('line-1');
      expect(overlay()).toBeNull();
    });

    it('typed input + Enter submits the value from the latest render', async () => {
      const { hook } = renderHarness();
      act(() => { hook().requestApproval({ voidItemId: 'line-1' }); });
      await userEvent.type(pinInput(), '9876{Enter}');
      expect(verifyPosSupervisorPin.mock.calls).toEqual([['9876']]);
    });

    it('a wrong PIN keeps the dialog mounted with the same input; typing clears the error; ✓ retries', async () => {
      verifyPosSupervisorPin.mockResolvedValueOnce(false);
      const { hook, spies } = renderHarness();
      act(() => { hook().requestApproval({ voidItemId: 'line-1' }); });
      const input = pinInput();
      await tap('1', '✓');
      expect(errorLine().textContent).toBe('Incorrect PIN. Please try again.');
      expect(pinInput()).toBe(input);
      expect(pinInput().value).toBe('1');
      await tap('2');
      expect(errorLine().textContent).toBe('Incorrect PIN. Please try again.'); // keypad digits do NOT clear the error
      fireEvent.change(pinInput(), { target: { value: '123' } });
      expect(errorLine()).toBeNull(); // typing does
      await tap('✓');
      expect(verifyPosSupervisorPin).toHaveBeenLastCalledWith('123');
      expect(spies.applyVoid).toHaveBeenCalledTimes(1);
    });

    it('CHARACTERIZED: no in-flight guard — ✓ twice while verification is pending verifies twice', async () => {
      const d = deferred();
      verifyPosSupervisorPin.mockReturnValue(d.promise);
      const { hook, spies } = renderHarness();
      act(() => { hook().requestApproval({ voidItemId: 'line-1' }); });
      await tap('1', '✓', '✓');
      expect(verifyPosSupervisorPin).toHaveBeenCalledTimes(2);
      expect(keyButton('✓').disabled).toBe(false);
      await act(async () => { d.resolve(true); });
      expect(spies.applyVoid).toHaveBeenCalledTimes(2);
    });

    it('Cancel unmounts and clears credentials + void/price slots via cancelApproval', async () => {
      const { hook } = renderHarness();
      act(() => { hook().requestApproval({ priceOverride: { type: 'UPDATE_PRICE', itemName: 'W', minPrice: 5 }, voidItemId: 'l' }); });
      await tap('4');
      act(() => { hook().setSupervisorPinError('x'); });
      await act(async () => { fireEvent.click(cancelButton()); });
      expect(overlay()).toBeNull();
      expect(hook()).toMatchObject({ showSupervisorPin: false, supervisorPinValue: '', supervisorPinEmail: '', supervisorPinError: '', pendingPriceOverride: null, pendingVoidItemId: null });
    });

    it('CHARACTERIZED stale header: a cancelled DAY_CLOSE is still pending, so a later void request shows the Day Close wording and drains both', async () => {
      const { hook, spies } = renderHarness();
      act(() => { hook().requestApproval({ supervisorAction: { type: 'DAY_CLOSE', payload: { acknowledgeExclusions: true } }, resetEmail: true }); });
      await act(async () => { fireEvent.click(cancelButton()); });
      expect(hook().pendingSupervisorAction).toEqual({ type: 'DAY_CLOSE', payload: { acknowledgeExclusions: true } });
      act(() => { hook().requestApproval({ voidItemId: 'line-2' }); });
      expect(headerText()).toBe('Enter PIN to authorize Business Day Close');
      await tap('1', '✓');
      expect(spies.applyVoid).toHaveBeenCalledWith('line-2');
      expect(spies.handleCloseDay).toHaveBeenCalledWith(true);
    });

    it('CHARACTERIZED stale force close: after cancelling FORCE_CLOSE_SESSION a void request shows the force-close body and takes the force-close path', async () => {
      const { hook, spies } = renderHarness({ initialSessionToClose: TARGET });
      act(() => { hook().requestApproval({ supervisorAction: { type: 'FORCE_CLOSE_SESSION' }, resetEmail: true }); });
      await act(async () => { fireEvent.click(cancelButton()); });
      act(() => { hook().requestApproval({ voidItemId: 'line-3' }); });
      expect(headerText()).toBe('Authorize force closure of this session.');
      expect(reasonSelect()).not.toBeNull();
      expect(overlay().textContent).toContain('Target Session');
      await tap('1', '✓');
      expect(errorLine().textContent).toBe('Enter supervisor email/username and password.');
      expect(verifyPosSupervisorPin).not.toHaveBeenCalled();
      expect(spies.applyVoid).not.toHaveBeenCalled();
    });

    it('CHARACTERIZED stale layaway abort: Cancel leaves the thunk queued, so the next void request shows the layaway wording', async () => {
      const thunk = vi.fn();
      const { hook, spies } = renderHarness();
      act(() => { hook().requireLayawayApproval(thunk, false); });
      expect(headerText()).toBe('Enter PIN to clear layaway cart');
      await act(async () => { fireEvent.click(cancelButton()); });
      act(() => { hook().requestApproval({ voidItemId: 'line-4' }); });
      expect(headerText()).toBe('Enter PIN to clear layaway cart');
      await tap('1', '✓');
      expect(spies.applyVoid).toHaveBeenCalledWith('line-4');
      expect(thunk).toHaveBeenCalledTimes(1);
    });

    it('pending-action identity: the layaway thunk run on approval is the exact function queued', async () => {
      const thunk = vi.fn();
      const { hook } = renderHarness();
      act(() => { hook().requireLayawayApproval(thunk, true); });
      expect(hook().pendingLayawayAbortAction).toBe(thunk);
      await tap('7', '✓');
      expect(thunk.mock.calls).toEqual([[]]);
    });

    it('the advanced-range unlock request shows the void fallback wording', async () => {
      const { hook, spies } = renderHarness();
      act(() => { hook().requestApproval({ unlockAdvancedRange: true }); });
      expect(headerText()).toBe('Enter PIN to authorize void');
      await tap('1', '✓');
      expect(spies.unlockAdvancedRange).toHaveBeenCalledTimes(1);
    });

    it('CHARACTERIZED: FORCE_CLOSE_SESSION in PIN mode can never succeed — no email field, the pre-flight demands one', async () => {
      const { hook } = renderHarness({ initialSessionToClose: TARGET });
      act(() => { hook().requestApproval({ supervisorAction: { type: 'FORCE_CLOSE_SESSION' }, resetEmail: true }); });
      expect(emailInput()).toBeNull();
      fireEvent.change(reasonSelect(), { target: { value: 'Shift handover' } });
      fireEvent.click(ackCheckbox());
      await tap('1', '2', '✓');
      expect(errorLine().textContent).toBe('Enter supervisor email/username and password.');
      expect(verifySessionClosurePermission).not.toHaveBeenCalled();
    });

    it('PASSWORD force close: Authorize enables only after email, password, reason and acknowledgement; success writes the refs and closes', async () => {
      const { hook, spies, refs } = renderHarness({ mode: 'PASSWORD', initialSessionToClose: TARGET });
      act(() => { hook().requestApproval({ supervisorAction: { type: 'FORCE_CLOSE_SESSION' }, resetEmail: true }); });
      expect(document.activeElement).toBe(emailInput());
      fireEvent.change(emailInput(), { target: { value: 'm@shop.test' } });
      fireEvent.change(pinInput(), { target: { value: 'pw' } });
      expect(authorizeButton()).toBeDisabled();
      fireEvent.change(reasonSelect(), { target: { value: 'Terminal malfunction' } });
      expect(authorizeButton()).toBeDisabled();
      fireEvent.click(ackCheckbox());
      expect(authorizeButton()).not.toBeDisabled();
      expect(authorizeButton().textContent).toBe('Authorize Force Close');
      await act(async () => { fireEvent.click(authorizeButton()); });
      expect(verifySessionClosurePermission).toHaveBeenCalledWith(77, 'm@shop.test', 'pw');
      expect(refs.closureAuthGrantRef.current).toEqual({ sessionId: 77, token: 'grant-1' });
      expect(refs.forceCloseContextRef.current).toEqual({ sessionId: 77, reason: 'Terminal malfunction', supervisor: 'm@shop.test' });
      expect(spies.setCurrentView).toHaveBeenCalledWith('x-report');
      expect(overlay()).toBeNull();
    });

    it('the Authorize click event forwarded to handleSupervisorPinSubmit is dropped by its zero-arity wrapper', async () => {
      const { hook, spies } = renderHarness({ mode: 'PASSWORD' });
      act(() => { hook().requestApproval({ priceOverride: { type: 'CHECKOUT' }, resetEmail: true }); });
      fireEvent.change(emailInput(), { target: { value: 'm@shop.test' } });
      fireEvent.change(pinInput(), { target: { value: 'pw' } });
      await act(async () => { fireEvent.click(authorizeButton()); });
      expect(verifySupervisorAuth).toHaveBeenCalledWith({ email: 'm@shop.test', password: 'pw', terminalId: 'T-1', lockedBy: 'Aisha Khan' });
      expect(spies.processPayment).toHaveBeenCalledWith({ email: 'm@shop.test', password: 'pw' });
    });

    it('PIN-mode queue: reason/ack change handlers clear an existing error through the hook setter', () => {
      const { hook } = renderHarness({ initialSessionToClose: TARGET });
      act(() => { hook().requestApproval({ supervisorAction: { type: 'FORCE_CLOSE_SESSION' } }); });
      act(() => { hook().setSupervisorPinError('old'); });
      expect(errorLine()).not.toBeNull();
      fireEvent.change(reasonSelect(), { target: { value: 'Emergency closure' } });
      expect(errorLine()).toBeNull();
      expect(reasonSelect().value).toBe('Emergency closure');
    });
  });
});

// ── DOM parity ──────────────────────────────────────────────────────────────
describe('SupervisorPinDialog DOM parity', () => {
  const renderedBody = (element) => {
    render(element);
    const html = document.body.innerHTML;
    cleanup();
    return html;
  };
  const FC = { type: 'FORCE_CLOSE_SESSION' };
  const STATES = [
    ['closed', { showSupervisorPin: false }],
    ['PIN, void fallback, empty', {}],
    ['PIN, typed value and error', { supervisorPinValue: '1234', supervisorPinError: 'Incorrect PIN. Please try again.' }],
    ['PASSWORD, email/password typed', { supervisorApprovalMode: 'PASSWORD', supervisorPinEmail: 'm@shop.test', supervisorPinValue: 'pw' }],
    ['BUSINESS_DAY_CLOSED', { pendingPriceOverride: { type: 'BUSINESS_DAY_CLOSED' } }],
    ['CHECKOUT, PASSWORD', { supervisorApprovalMode: 'PASSWORD', pendingPriceOverride: { type: 'CHECKOUT' } }],
    ['generic price override', { pendingPriceOverride: { type: 'UPDATE_PRICE', itemName: 'Widget', minPrice: 10 } }],
    ['DAY_CLOSE', { pendingSupervisorAction: { type: 'DAY_CLOSE' } }],
    ['DELIVERY_SETTLEMENT', { pendingSupervisorAction: { type: 'DELIVERY_SETTLEMENT' } }],
    ['layaway abort', { pendingLayawayAbortAction: noop }],
    ['force close without target (PIN)', { pendingSupervisorAction: FC }],
    ['force close with target, PASSWORD, complete', { supervisorApprovalMode: 'PASSWORD', pendingSupervisorAction: FC, sessionToClose: TARGET, forceCloseReason: 'Shift handover', forceCloseAuditAcknowledged: true, supervisorPinEmail: 'm', supervisorPinValue: 'p' }],
    ['force close with fallback target fields', { pendingSupervisorAction: FC, sessionToClose: { userId: 'u-1' } }],
  ];

  it.each(STATES)('POSSales wiring renders document.body identical to the pre-extraction markup: %s', (_n, overrides) => {
    const props = propsFor(overrides);
    expect(renderedBody(<ExtractedSupervisorPinWiring {...props} />)).toBe(renderedBody(<OriginalSupervisorPinMarkup {...props} />));
  });

  it.each(STATES.filter(([, o]) => o.showSupervisorPin !== false))('SupervisorPinDialog with its own prop names renders identically: %s', (_n, overrides) => {
    const p = propsFor(overrides);
    const direct = (
      <SupervisorPinDialog
        pendingPriceOverride={p.pendingPriceOverride}
        pendingSupervisorAction={p.pendingSupervisorAction}
        pendingLayawayAbortAction={p.pendingLayawayAbortAction}
        supervisorApprovalMode={p.supervisorApprovalMode}
        sessionToClose={p.sessionToClose}
        forceCloseReason={p.forceCloseReason}
        setForceCloseReason={noop}
        forceCloseAuditAcknowledged={p.forceCloseAuditAcknowledged}
        setForceCloseAuditAcknowledged={noop}
        supervisorPinEmail={p.supervisorPinEmail}
        setSupervisorPinEmail={noop}
        supervisorPinValue={p.supervisorPinValue}
        setSupervisorPinValue={noop}
        supervisorPinError={p.supervisorPinError}
        setSupervisorPinError={noop}
        onSubmit={noop}
        onCancel={noop}
      />
    );
    expect(renderedBody(direct)).toBe(renderedBody(<OriginalSupervisorPinMarkup {...p} />));
  });
});

// ── 8. source anchors ───────────────────────────────────────────────────────
/**
 * POSSales.jsx is not rendered by this project's test setup, so the live boundary is asserted
 * against its source and the extracted component's source.
 */
// EOL-normalised: sources are checked out with CRLF on Windows.
const readSource = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const POS_SALES = readSource('../../POSSales.jsx');
const COMPONENT = readSource('../features/session/SupervisorPinDialog.jsx');
const SELF = fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n');
const trimmedLines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i, start).toBeGreaterThanOrEqual(0);
  expect(j, end).toBeGreaterThan(i);
  return src.slice(i + start.length, j);
};
const block = (src, startLine, endLine) => {
  const i = src.indexOf(startLine);
  expect(i, startLine).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(endLine, i);
  expect(j, endLine).toBeGreaterThan(i);
  return src.slice(i, j + endLine.length);
};
const guardBlock = () => block(POS_SALES, '      {showSupervisorPin && (', '\n      )}');

describe('SupervisorPinDialog source', () => {
  it('the component body is the original JSX line for line, with only the five handler renames', () => {
    const RENAMES = [
      ['handleSupervisorPinSubmit()', 'onSubmit()'],
      ['onClick={handleSupervisorPinSubmit}', 'onClick={onSubmit}'],
      ['onClick={cancelApproval}', 'onClick={onCancel}'],
    ];
    const original = trimmedLines(between(SELF, '{/* VERBATIM-START */}\n', '      {/* VERBATIM-END */}'));
    expect(original[0]).toBe('{showSupervisorPin && (');
    expect(original[original.length - 1]).toBe(')}');
    const counts = RENAMES.map(() => 0);
    const expected = original.slice(1, -1).map((line) => RENAMES.reduce((acc, [from, to], i) => {
      const n = acc.split(from).length - 1;
      counts[i] += n;
      return acc.split(from).join(to);
    }, line));
    expect(counts).toEqual([3, 1, 1]);
    const live = between(COMPONENT, '  return (\n', '\n  );\n}');
    expect(trimmedLines(live)).toEqual(expected);
    expect(trimmedLines(live)).toHaveLength(156);
  });

  it('has exactly the 17-prop surface and imports only React and the two existing icons', () => {
    expect(COMPONENT).toContain([
      'function SupervisorPinDialog({',
      '  pendingPriceOverride,',
      '  pendingSupervisorAction,',
      '  pendingLayawayAbortAction,',
      '  supervisorApprovalMode,',
      '  sessionToClose,',
      '  forceCloseReason,',
      '  setForceCloseReason,',
      '  forceCloseAuditAcknowledged,',
      '  setForceCloseAuditAcknowledged,',
      '  supervisorPinEmail,',
      '  setSupervisorPinEmail,',
      '  supervisorPinValue,',
      '  setSupervisorPinValue,',
      '  supervisorPinError,',
      '  setSupervisorPinError,',
      '  onSubmit,',
      '  onCancel,',
      '}) {',
    ].join('\n'));
    expect(COMPONENT.match(/^import .*$/gm)).toEqual([
      "import React from 'react';",
      "import { AlertCircle, Shield } from 'lucide-react';",
    ]);
    expect(COMPONENT).toContain('export default SupervisorPinDialog;');
  });

  it('callback semantics: Enter/keypad call onSubmit() with no arguments; Authorize and Cancel pass by reference', () => {
    // Counted in the JSX body only — the file's header comment also mentions onSubmit().
    const body = between(COMPONENT, '  return (\n', '\n  );\n}');
    expect(body.match(/onSubmit\(\)/g)).toHaveLength(3);
    expect(body.match(/onKeyDown=\{e => \{ if \(e\.key === 'Enter'\) onSubmit\(\); \}\}/g)).toHaveLength(2);
    expect(body).toContain("else if (k === '✓') onSubmit();");
    expect(body.match(/onClick=\{onSubmit\}/g)).toHaveLength(1);
    expect(body.match(/onClick=\{onCancel\}/g)).toHaveLength(1);
    expect(body.match(/\bon(?:Submit|Cancel)\b/g)).toHaveLength(5);
    // Code only: the header comment explains the rename and names the POSSales handlers.
    const code = COMPONENT.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/=>\s*on(?:Submit|Cancel)\b|on(?:Submit|Cancel)\([^)]/);
    expect(code).not.toMatch(/handleSupervisorPinSubmit|cancelApproval|showSupervisorPin/);
  });

  it('has no hooks, memo, context, effects, refs, focus calls or queue writes; focus markers are unchanged', () => {
    expect(COMPONENT).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(COMPONENT).not.toMatch(/\bmemo\b|createContext|useContext|useRef|useEffect|ref=\{|\.focus\(\)/);
    expect(COMPONENT).not.toMatch(/setPending|requestApproval|requireLayawayApproval|submitSupervisorApproval|pendingVoidItemId|pendingUnlockAdvancedRange|setShowSupervisorPin/);
    expect(COMPONENT.match(/onMouseDown=\{e => e\.preventDefault\(\)\}/g)).toHaveLength(1);
    expect(COMPONENT.match(/autoFocus/g)).toHaveLength(2);
    expect(COMPONENT).toContain('autoFocus={supervisorApprovalMode !== \'PASSWORD\'}');
  });
});

describe('POSSales wiring (SupervisorPinDialog boundary)', () => {
  it('the test copy of the guarded call site is line-for-line identical to POSSales, with all 17 props', () => {
    const copy = between(SELF, '{/* WIRING-START */}\n', '      {/* WIRING-END */}');
    expect(trimmedLines(guardBlock())).toEqual(trimmedLines(copy));
    expect(trimmedLines(guardBlock())).toHaveLength(21);
    expect(guardBlock().match(/^ {10}\w+=\{\w+\}$/gm)).toHaveLength(17);
  });

  it('the test copy of handleSupervisorPinSubmit is identical to POSSales', () => {
    const copy = between(SELF, '// HANDLER-START\n', '  // HANDLER-END');
    const live = block(POS_SALES, '  const handleSupervisorPinSubmit = () => submitSupervisorApproval({', '\n  });');
    expect(trimmedLines(live)).toEqual(trimmedLines(copy));
  });

  it('sits between the checkout-screen IIFE and CashDropDialog, behind its comment, with two blank lines after', () => {
    expect(POS_SALES).toMatch(
      /\n {6}\}\)\(\)\}\n\n {6}\{\/\* Supervisor PIN Dialog \*\/\}\n {6}\{showSupervisorPin && \(\n {8}<SupervisorPinDialog\n(?: {10}\w+=\{\w+\}\n){17} {8}\/>\n {6}\)\}\n\n\n {6}\{\/\* Cash Drop\/Out Dialog \*\/\}\n {6}<CashDropDialog\n/,
    );
    expect(POS_SALES.indexOf('{/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}')).toBeLessThan(POS_SALES.indexOf('{/* Supervisor PIN Dialog */}'));
  });

  it('keeps exactly one showSupervisorPin guard and renders SupervisorPinDialog once; the inline markup is gone', () => {
    expect(POS_SALES).toContain("import SupervisorPinDialog from './POS/features/session/SupervisorPinDialog';");
    expect(POS_SALES.match(/\{showSupervisorPin && \(/g)).toHaveLength(1);
    expect(POS_SALES.match(/<SupervisorPinDialog\b/g)).toHaveLength(1);
    expect(POS_SALES).toContain('    showCashierAuthDialog || showCloseSessionDialog || showSupervisorPin || sessionToClose\n');
    // destructure, businessDayClosureFlowActive, guard — plus one mention in the hook-call comment
    expect(POS_SALES.match(/\bshowSupervisorPin\b/g)).toHaveLength(4);
    expect(POS_SALES).not.toContain('Supervisor Approval</h2>');
    expect(POS_SALES).not.toContain("'Enter PIN to authorize void'");
    expect(POS_SALES).not.toContain('bg-black/50 z-[300]');
  });

  it('handlers stay in POSSales and are only passed by reference', () => {
    expect(POS_SALES.match(/onSubmit=\{handleSupervisorPinSubmit\}/g)).toHaveLength(1);
    expect(POS_SALES.match(/onCancel=\{cancelApproval\}/g)).toHaveLength(1);
    expect(POS_SALES.match(/handleSupervisorPinSubmit\(\)/g)).toBeNull();
    expect(POS_SALES.match(/onClick=\{(?:handleSupervisorPinSubmit|cancelApproval)\}/g)).toBeNull();
    expect(POS_SALES.match(/\bcancelApproval\b/g)).toHaveLength(2); // destructure + onCancel
  });

  it('no approval state moved: the useSupervisorApproval destructure and the other owners are unchanged', () => {
    expect(POS_SALES).toContain([
      '  const {',
      '    showSupervisorPin,',
      '    supervisorPinValue, setSupervisorPinValue,',
      '    supervisorPinEmail, setSupervisorPinEmail,',
      '    supervisorPinError, setSupervisorPinError,',
      '    pendingVoidItemId,',
      '    pendingPriceOverride,',
      '    pendingLayawayAbortAction,',
      '    pendingSupervisorAction,',
      '    requestApproval,',
      '    requireLayawayApproval,',
      '    cancelApproval,',
      '    submitSupervisorApproval,',
      '  } = useSupervisorApproval();',
    ].join('\n'));
    expect(POS_SALES.match(/useSupervisorApproval\(\)/g)).toHaveLength(1);
    expect(POS_SALES).toContain("  const supervisorApprovalMode = posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN';");
    expect(POS_SALES).toContain('  const [sessionToClose, setSessionToClose] = useState(null);');
    expect(POS_SALES).toContain('    forceCloseReason, setForceCloseReason,\n    forceCloseAuditAcknowledged, setForceCloseAuditAcknowledged,\n');
  });
});
