import fs from 'node:fs';
import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CurrencyAmount } from '../POSCurrency';
import { parseUTCDate } from '../lib/posFormatting';
import LiveSessionDialog from '../features/session/LiveSessionDialog';

// parseUTCDate is wrapped (real implementation) so render-time evaluation can be counted.
vi.mock('../lib/posFormatting', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, parseUTCDate: vi.fn(actual.parseUTCDate) };
});

/**
 * Characterization of the POS "Live Session" quick-view dialog (POS/features/session/LiveSessionDialog.jsx),
 * opened from the POSSales dashboard tile. The 2026-11 redesign changed the markup (sales hero, payment
 * mix, cash-drawer breakdown) but not the behaviour: same props, same figures and fallbacks, same
 * refresh/close/X-Report wiring, same render-time calculation. Figures are located by data-figure.
 *
 * The component mounted through the POSSales call site. The JSX between WIRING-START/END
 * is enforced line-for-line against POSSales, so the spies in the shared tests observe exactly what
 * the live parent passes (loadXReport by reference, the close and Full X-Report bodies).
 */
function ExtractedLiveSessionWiring({
  showLiveSessionDialog,
  setShowLiveSessionDialog,
  xReportData,
  xReportLoading,
  currentSession,
  currentTerminal,
  sessionNowMs,
  loadXReport,
  setCurrentView,
}) {
  return (
    // WIRING-START
      <LiveSessionDialog
        open={showLiveSessionDialog}
        onOpenChange={setShowLiveSessionDialog}
        xReportData={xReportData}
        xReportLoading={xReportLoading}
        currentSession={currentSession}
        currentTerminal={currentTerminal}
        sessionNowMs={sessionNowMs}
        onRefresh={loadXReport}
        onClose={() => setShowLiveSessionDialog(false)}
        onOpenFullXReport={() => {
          setShowLiveSessionDialog(false);
          setCurrentView('x-report');
        }}
      />
    // WIRING-END
  );
}

const SUBJECTS = [
  ['LiveSessionDialog via POSSales wiring', ExtractedLiveSessionWiring],
];

// ── fixtures ────────────────────────────────────────────────────────────────
const CONTENT_CLASS = 'sm:max-w-xl border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden';
// Every figure, in DOM order. Cash sales shows twice: in the payment mix and as a drawer line.
const FIGURES = [
  "Today's Sales", 'Transactions', 'Cash Sales', 'Card Sales', 'Wallet Sales',
  'Opening Cash', 'Drawer Cash Sales', 'Cash Drop In', 'Cash Out', 'Expected Cash in Drawer',
];

// 2026-09-14 09:05:30 UTC; the naive openedAt below is parsed as 08:00:00 UTC → 65.5 min.
const NOW = Date.UTC(2026, 8, 14, 9, 5, 30);
const SESSION = { id: 42, status: 'OPEN', openedAt: '2026-09-14T08:00:00', openedBy: 'alice', terminalId: 'T-SESS', openingCash: 150 };
const TERMINAL = { terminalId: 'T-TERM' };
const SUMMARY = {
  totalSales: 1234.5, invoiceCount: 17, openingCash: 200, cashSales: 800, cardSales: 400.25,
  walletSales: 34.25, cashDropIn: 50, cashDropOut: 75.5, expectedCash: 974.5,
};
const X_REPORT = { summary: SUMMARY, session: { ...SESSION, id: 43, openedBy: 'bob', terminalId: 'T-XR' } };

const noop = () => {};
function propsFor(overrides = {}) {
  return {
    showLiveSessionDialog: true,
    setShowLiveSessionDialog: noop,
    xReportData: X_REPORT,
    xReportLoading: false,
    currentSession: SESSION,
    currentTerminal: TERMINAL,
    sessionNowMs: NOW,
    loadXReport: noop,
    setCurrentView: noop,
    ...overrides,
  };
}

const dialog = () => screen.getByRole('dialog');
const buttons = () => Array.from(dialog().querySelectorAll('button'));
const refreshButton = () => within(dialog()).getByTitle('Refresh');
const headerXButton = () => buttons()[1];
const footerCloseButton = () => buttons()[2];
const fullXReportButton = () => within(dialog()).getByRole('button', { name: 'Full X-Report' });
/** The DialogContent primitive's own close button — CSS-hidden via [&>button:last-child]:hidden, still in the DOM. */
const radixCloseButton = () => buttons()[4];
const sessionLine = () => dialog().querySelector('[data-session-line]');
const figureEls = () => Array.from(dialog().querySelectorAll('[data-figure]'));
const rowValue = (label) => dialog().querySelector(`[data-figure="${label}"]`);
const rowText = (label) => rowValue(label).textContent;
const infoValue = (prefix) => dialog().querySelector(`[data-info="${prefix.replace(':', '').toLowerCase()}"]`).textContent;
const flushRadixOutsideListener = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
/** Reference DOM of a bare <CurrencyAmount amount={amount} />, rendered the same way as the dialog. */
const currencyHtml = (amount) => {
  const container = document.createElement('div');
  render(<CurrencyAmount amount={amount} />, { container });
  return container.innerHTML;
};

beforeEach(() => {
  vi.mocked(parseUTCDate).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Every behavioural block below runs against the component mounted through the exact
// POSSales call site.
describe.each(SUBJECTS)('%s', (_label, Subject) => {
  // ── 1. mount / lifecycle ────────────────────────────────────────────────────
  describe('1. mount / lifecycle', () => {
    it('renders nothing (no portal, no overlay) while showLiveSessionDialog is false', () => {
      const { container } = render(<Subject {...propsFor({ showLiveSessionDialog: false })} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(container.innerHTML).toBe('');
      expect(document.body.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    });

    it('portals DialogContent out of the parent container when open', () => {
      const { container } = render(<Subject {...propsFor()} />);
      expect(dialog()).toHaveAttribute('data-state', 'open');
      expect(dialog()).toHaveAttribute('data-slot', 'dialog-content');
      expect(container.contains(dialog())).toBe(false);
      expect(container.innerHTML).toBe('');
      expect(document.body.querySelector('[data-slot="dialog-overlay"]')).not.toBeNull();
    });

    it('opens and closes in place as the parent flips the flag (always mounted, no && guard)', () => {
      const { rerender } = render(<Subject {...propsFor({ showLiveSessionDialog: false })} />);
      rerender(<Subject {...propsFor({ showLiveSessionDialog: true })} />);
      expect(dialog()).toBeInTheDocument();
      rerender(<Subject {...propsFor({ showLiveSessionDialog: false })} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      rerender(<Subject {...propsFor({ showLiveSessionDialog: true })} />);
      expect(dialog()).toBeInTheDocument();
    });

    it('keeps the Radix close button in the DOM as the last child, hidden only by CSS', () => {
      render(<Subject {...propsFor()} />);
      expect(dialog().lastElementChild).toBe(radixCloseButton());
      expect(radixCloseButton().querySelector('.sr-only')).toHaveTextContent('Close');
      for (const cls of CONTENT_CLASS.split(' ')) expect(dialog()).toHaveClass(cls);
    });
  });

  // ── markup ──────────────────────────────────────────────────────────────────
  describe('1b. layout / content structure', () => {
    it('has three sections (header, body, footer) followed by the Radix close', () => {
      render(<Subject {...propsFor()} />);
      const children = Array.from(dialog().children);
      expect(children).toHaveLength(4);
      expect(children[0]).toContainElement(within(dialog()).getByRole('heading', { level: 2 }));
      expect(children[1]).toContainElement(rowValue("Today's Sales"));
      expect(children[2]).toContainElement(fullXReportButton());
      expect(children[3].tagName).toBe('BUTTON');
    });

    it('renders the h2 title, LIVE badge and session line (no DialogTitle/Description primitives)', () => {
      render(<Subject {...propsFor()} />);
      const h2 = within(dialog()).getByRole('heading', { level: 2 });
      expect(h2).toHaveTextContent(/^Live Session$/);
      expect(h2.nextElementSibling).toHaveTextContent(/^LIVE$/);
      expect(sessionLine().tagName).toBe('P');
      expect(dialog().querySelector('svg.lucide-activity')).not.toBeNull();
      expect(dialog().querySelector('[data-slot="dialog-title"]')).toBeNull();
      expect(dialog().querySelector('[data-slot="dialog-description"]')).toBeNull();
    });

    it('renders Refresh, header X, Close, Full X-Report and the hidden Radix close in that DOM order', () => {
      render(<Subject {...propsFor()} />);
      expect(buttons()).toHaveLength(5);
      expect(buttons()[0]).toBe(refreshButton());
      expect(buttons()[3]).toBe(fullXReportButton());
      expect(refreshButton()).toHaveAttribute('aria-label', 'Refresh figures');
      expect(refreshButton().querySelector('svg')).toHaveClass('lucide-refresh-cw', 'h-4', 'w-4');
      expect(headerXButton()).toHaveAttribute('aria-label', 'Close live session');
      expect(headerXButton().querySelector('svg')).toHaveClass('lucide-x');
      expect(footerCloseButton()).toHaveTextContent(/^Close$/);
      expect(fullXReportButton().querySelector('svg')).toHaveClass('lucide-file-text');
      for (const b of buttons().slice(0, 4)) expect(b).toHaveAttribute('type', 'button');
    });

    it('renders every figure once, in fixed order, grouped as sales hero, payment mix and cash drawer', () => {
      render(<Subject {...propsFor()} />);
      expect(figureEls().map((el) => el.dataset.figure)).toEqual(FIGURES);
      expect(within(dialog()).getByText('Payment mix')).toBeInTheDocument();
      expect(within(dialog()).getByText('Cash drawer')).toBeInTheDocument();
      expect(within(dialog()).getByText('Expected Cash in Drawer')).toBeInTheDocument();
    });

    it('signs the drawer lines: opening unsigned, cash sales and drop-in +, cash out −', () => {
      render(<Subject {...propsFor()} />);
      const line = (figure) => rowValue(figure).parentElement.textContent;
      expect(line('Opening Cash')).toBe('200.00');
      expect(line('Drawer Cash Sales')).toBe('+800.00');
      expect(line('Cash Drop In')).toBe('+50.00');
      expect(line('Cash Out')).toBe('−75.50');
    });

    it('shows the payment mix shares and average sale once loaded', () => {
      render(<Subject {...propsFor()} />);
      // 800 / 400.25 / 34.25 of 1234.50 → 65% / 32% / 3%
      expect(dialog().textContent).toContain('Cash65%');
      expect(dialog().textContent).toContain('Card32%');
      expect(dialog().textContent).toContain('Wallet3%');
      // 1234.50 / 17 = 72.62
      expect(dialog().textContent).toContain('Avg 72.62');
    });

    it('hides shares, average and drawer signs while loading or with no tender', () => {
      render(<Subject {...propsFor({ xReportLoading: true })} />);
      expect(dialog().textContent).not.toMatch(/%|Avg|\+|−/);
      cleanup();
      render(<Subject {...propsFor({ xReportData: { summary: {} } })} />);
      expect(dialog().textContent).not.toMatch(/%|Avg/);
    });
  });

  // ── 2. display inputs ───────────────────────────────────────────────────────
  describe('2. display inputs and figures', () => {
    it('renders every figure through CurrencyAmount (Transactions is a raw number)', () => {
      render(<Subject {...propsFor()} />);
      expect(rowValue("Today's Sales").innerHTML).toBe(currencyHtml(1234.5));
      expect(rowValue('Transactions').innerHTML).toBe('17');
      expect(rowValue('Cash Sales').innerHTML).toBe(currencyHtml(800));
      expect(rowValue('Card Sales').innerHTML).toBe(currencyHtml(400.25));
      expect(rowValue('Wallet Sales').innerHTML).toBe(currencyHtml(34.25));
      expect(rowValue('Opening Cash').innerHTML).toBe(currencyHtml(200));
      expect(rowValue('Cash Drop In').innerHTML).toBe(currencyHtml(50));
      expect(rowValue('Drawer Cash Sales').innerHTML).toBe(currencyHtml(800));
      expect(rowValue('Cash Out').innerHTML).toBe(currencyHtml(75.5));
      expect(rowValue('Expected Cash in Drawer').innerHTML).toBe(currencyHtml(974.5));
      expect(figureEls().map((el) => el.textContent)).toEqual([
        '1234.50', '17', '800.00', '400.25', '34.25', '200.00', '800.00', '50.00', '75.50', '974.50',
      ]);
    });

    it.each([
      ['positive → amount (shown with a − sign)', 75.5, '75.50'],
      ['zero → CurrencyAmount 0', 0, '0.00'],
      ['negative → CurrencyAmount 0 (value dropped)', -20, '0.00'],
      ['numeric string → Number()', '12', '12.00'],
    ])('Cash Out: %s', (_n, cashDropOut, text) => {
      render(<Subject {...propsFor({ xReportData: { summary: { cashDropOut } } })} />);
      expect(rowText('Cash Out')).toBe(text);
    });

    it.each([
      ['summary.openingCash wins', { openingCash: 200 }, { openingCash: 150 }, '200.00'],
      ['summary 0 is kept (?? not ||)', { openingCash: 0 }, { openingCash: 150 }, '0.00'],
      ['summary null → currentSession.openingCash', { openingCash: null }, { openingCash: 150 }, '150.00'],
      ['summary missing → currentSession.openingCash', {}, { openingCash: 150 }, '150.00'],
      ['both missing → 0', {}, {}, '0.00'],
    ])('Opening Cash fallback: %s', (_n, summary, session, text) => {
      render(<Subject {...propsFor({ xReportData: { summary, session: { id: 1 } }, currentSession: { ...SESSION, ...session, openingCash: session.openingCash } })} />);
      expect(rowText('Opening Cash')).toBe(text);
    });

    it('opening-cash fallback reads currentSession even when xReportData.session is present', () => {
      render(<Subject {...propsFor({ xReportData: { summary: {}, session: { id: 9, openingCash: 999 } }, currentSession: { id: 1, openingCash: 5 } })} />);
      expect(rowText('Opening Cash')).toBe('5.00');
    });

    it('empty/absent summary renders zeros; non-numeric Transactions renders NaN; non-numeric money renders 0.00', () => {
      render(<Subject {...propsFor({ xReportData: { summary: { invoiceCount: 'abc', totalSales: 'abc' } }, currentSession: null })} />);
      expect(rowText('Transactions')).toBe('NaN');
      expect(rowText("Today's Sales")).toBe('0.00');
      cleanup();
      render(<Subject {...propsFor({ xReportData: {}, currentSession: null })} />);
      expect(figureEls().map((el) => el.textContent)).toEqual(['0.00', '0', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00']);
    });

    describe('loading state = xReportLoading || xReportData === null', () => {
      const skeletonCount = () => dialog().querySelectorAll('[data-figure] > span.animate-pulse').length;

      it.each([
        ['loading with data', { xReportLoading: true }, 10, true],
        ['not loading, data null', { xReportData: null }, 10, false],
        ['loading, data null', { xReportLoading: true, xReportData: null }, 10, true],
        ['not loading, data undefined (strict === null → figures shown)', { xReportData: undefined }, 0, false],
        ['not loading, data present', {}, 0, false],
      ])('%s', (_n, overrides, skeletons, refreshDisabled) => {
        render(<Subject {...propsFor(overrides)} />);
        expect(skeletonCount()).toBe(skeletons);
        if (skeletons) expect(rowValue('Transactions').textContent).toBe('');
        // Refresh disabled/spinner follow xReportLoading only — never xReportData === null.
        expect(refreshButton().disabled).toBe(refreshDisabled);
        expect(refreshButton().querySelector('svg').classList.contains('animate-spin')).toBe(refreshDisabled);
        // Header/session line and cashier/terminal are never skeletoned.
        expect(sessionLine().textContent).toMatch(/ elapsed$/);
      });

      it('spinner source is `h-4 w-4 ${...}` (lucide trims the idle trailing space) / "h-4 w-4 animate-spin" when loading', () => {
        render(<Subject {...propsFor()} />);
        expect(refreshButton().querySelector('svg').getAttribute('class')).toBe('lucide lucide-refresh-cw h-4 w-4');
        cleanup();
        render(<Subject {...propsFor({ xReportLoading: true })} />);
        expect(refreshButton().querySelector('svg').getAttribute('class')).toBe('lucide lucide-refresh-cw h-4 w-4 animate-spin');
      });
    });

    describe('session source: sess = xReportData?.session || currentSession (whole-object fallback)', () => {
      it.each([
        ['xReportData.session wins', X_REPORT, SESSION, TERMINAL, 'Session #43', 'bob', 'T-XR'],
        ['no xReportData → currentSession', null, SESSION, TERMINAL, 'Session #42', 'alice', 'T-SESS'],
        ['xReportData without session → currentSession', { summary: SUMMARY }, SESSION, TERMINAL, 'Session #42', 'alice', 'T-SESS'],
        ['session without terminalId → currentTerminal.terminalId', { summary: {}, session: { id: 7 } }, SESSION, TERMINAL, 'Session #7', '—', 'T-TERM'],
        ['no id/openedBy/terminal anywhere → fallbacks', { summary: {}, session: { id: 0 } }, SESSION, null, 'Current session', '—', '—'],
        ['nothing at all', null, null, null, 'Current session', '—', '—'],
      ])('%s', (_n, xReportData, currentSession, currentTerminal, idText, cashier, terminal) => {
        render(<Subject {...propsFor({ xReportData, currentSession, currentTerminal })} />);
        expect(sessionLine().textContent.startsWith(`${idText} · `)).toBe(true);
        expect(infoValue('Cashier:')).toBe(cashier);
        expect(infoValue('Terminal:')).toBe(terminal);
      });

      it('cashier/terminal render as labelled chips', () => {
        render(<Subject {...propsFor()} />);
        expect(dialog().querySelector('[data-info="cashier"]').parentElement.textContent).toBe('Cashier bob');
        expect(dialog().querySelector('[data-info="terminal"]').parentElement.textContent).toBe('Terminal T-XR');
      });
    });

    describe('elapsed duration', () => {
      const at = (minutesAfter) => Date.UTC(2026, 8, 14, 8, 0, 0) + minutesAfter * 60000;
      it.each([
        ['0 min', at(0), '0m'],
        ['59.99 min floors to 59m', at(59.99), '59m'],
        ['exactly 60 min', at(60), '1h 0m'],
        ['65.5 min', at(65.5), '1h 5m'],
        ['25h 1m (no day unit)', at(25 * 60 + 1), '25h 1m'],
        ['30s before start (clock skew) → -1m', at(-0.5), '-1m'],
        ['exactly 2h before start → -120 % 60 is -0, rendered "0m"', at(-120), '0m'],
        ['125 min before start → durH -3, durM -5 → "-5m"', at(-125), '-5m'],
      ])('%s → %s', (_n, sessionNowMs, duration) => {
        render(<Subject {...propsFor({ xReportData: null, sessionNowMs })} />);
        expect(sessionLine().textContent).toBe(`Session #42 · ${duration} elapsed`);
      });

      it('session line is exactly "<id> · <duration> elapsed"', () => {
        render(<Subject {...propsFor()} />);
        expect(sessionLine().textContent).toBe('Session #43 · 1h 5m elapsed');
      });

      it.each([
        ['openedAt wins over startTime', { openedAt: '2026-09-14T08:00:00', startTime: '2026-09-14T09:00:00' }, '1h 5m'],
        ['startTime used when openedAt absent', { startTime: '2026-09-14T09:00:00' }, '5m'],
        ['neither → "—" (diffMin 0)', {}, '—'],
        ['unparseable openedAt → "—"', { openedAt: 'not-a-date' }, '—'],
        ['naive ISO is UTC (Z appended)', { openedAt: '2026-09-14T09:00:00' }, '5m'],
        ['explicit offset respected', { openedAt: '2026-09-14T13:00:00+04:00' }, '5m'],
        ['epoch number accepted', { openedAt: Date.UTC(2026, 8, 14, 9, 0, 0) }, '5m'],
      ])('session start: %s', (_n, fields, duration) => {
        render(<Subject {...propsFor({ xReportData: null, currentSession: { id: 42, ...fields } })} />);
        expect(sessionLine().textContent).toBe(`Session #42 · ${duration} elapsed`);
      });

      it('start fallback does NOT cross objects: xReportData.session without openedAt ignores currentSession.openedAt', () => {
        render(<Subject {...propsFor({ xReportData: { summary: {}, session: { id: 43 } } })} />);
        expect(sessionLine().textContent).toBe('Session #43 · — elapsed');
      });

      it('shows no clock time or date anywhere — only the elapsed duration', () => {
        render(<Subject {...propsFor()} />);
        expect(dialog().textContent).not.toMatch(/\d{1,2}:\d{2}|2026|AM|PM/);
      });
    });
  });

  // ── callbacks wired as in POSSales (spies) ──────────────────────────────────
  describe('6. callback wiring (spied props)', () => {
    const spies = () => ({ setShowLiveSessionDialog: vi.fn(), loadXReport: vi.fn(), setCurrentView: vi.fn() });

    it('Refresh hands the raw click event to loadXReport as its only argument', async () => {
      const s = spies();
      render(<Subject {...propsFor(s)} />);
      await userEvent.click(refreshButton());
      expect(s.loadXReport).toHaveBeenCalledTimes(1);
      expect(s.loadXReport.mock.calls[0]).toHaveLength(1);
      const [evt] = s.loadXReport.mock.calls[0];
      expect(evt.type).toBe('click');
      expect(evt.currentTarget === null || evt.target).toBeTruthy();
      expect(Boolean(evt)).toBe(true);
      expect(s.setShowLiveSessionDialog).not.toHaveBeenCalled();
      expect(s.setCurrentView).not.toHaveBeenCalled();
    });

    it('Refresh is inert while xReportLoading (disabled)', async () => {
      const s = spies();
      render(<Subject {...propsFor({ ...s, xReportLoading: true })} />);
      await userEvent.click(refreshButton());
      fireEvent.click(refreshButton());
      expect(s.loadXReport).not.toHaveBeenCalled();
    });

    it('Refresh stays clickable while xReportData is null but not loading', async () => {
      const s = spies();
      render(<Subject {...propsFor({ ...s, xReportData: null })} />);
      await userEvent.click(refreshButton());
      expect(s.loadXReport).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['header X', () => headerXButton()],
      ['footer Close', () => footerCloseButton()],
    ])('%s calls setShowLiveSessionDialog(false) with exactly [false] — no event', async (_n, btn) => {
      const s = spies();
      render(<Subject {...propsFor(s)} />);
      await userEvent.click(btn());
      expect(s.setShowLiveSessionDialog.mock.calls).toEqual([[false]]);
      expect(s.loadXReport).not.toHaveBeenCalled();
      expect(s.setCurrentView).not.toHaveBeenCalled();
    });

    it('Full X-Report closes first, then setCurrentView("x-report")', async () => {
      const order = [];
      const s = {
        setShowLiveSessionDialog: vi.fn((v) => order.push(['setShowLiveSessionDialog', v])),
        setCurrentView: vi.fn((v) => order.push(['setCurrentView', v])),
        loadXReport: vi.fn(),
      };
      render(<Subject {...propsFor(s)} />);
      await userEvent.click(fullXReportButton());
      expect(order).toEqual([['setShowLiveSessionDialog', false], ['setCurrentView', 'x-report']]);
      expect(s.loadXReport).not.toHaveBeenCalled();
    });

    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['outside pointer-down', async () => {
        await flushRadixOutsideListener();
        fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      }],
      ['hidden Radix close', async () => fireEvent.click(radixCloseButton())],
    ])('%s routes through onOpenChange → setShowLiveSessionDialog(false) only', async (_n, trigger) => {
      const s = spies();
      render(<Subject {...propsFor(s)} />);
      await trigger();
      expect(s.setShowLiveSessionDialog.mock.calls).toEqual([[false]]);
      expect(s.loadXReport).not.toHaveBeenCalled();
      expect(s.setCurrentView).not.toHaveBeenCalled();
    });
  });

  // ── 7. render-time calculation timing ───────────────────────────────────────
  describe('7. render-time calculation timing', () => {
    const countingReport = () => {
      const probe = { reads: 0 };
      probe.data = { get summary() { probe.reads += 1; return SUMMARY; }, session: SESSION };
      return probe;
    };

    it('the IIFE is evaluated by the owning render even while CLOSED (JSX children are eager)', () => {
      const probe = countingReport();
      const { container, rerender } = render(<Subject {...propsFor({ showLiveSessionDialog: false, xReportData: probe.data })} />);
      expect(container.innerHTML).toBe('');
      expect(probe.reads).toBe(1);
      expect(parseUTCDate).toHaveBeenCalledTimes(1);
      expect(parseUTCDate).toHaveBeenLastCalledWith(SESSION.openedAt);
      rerender(<Subject {...propsFor({ showLiveSessionDialog: false, xReportData: probe.data })} />);
      expect(probe.reads).toBe(2);
      expect(parseUTCDate).toHaveBeenCalledTimes(2);
    });

    it('exactly one evaluation per owning render while OPEN as well', () => {
      const probe = countingReport();
      const { rerender } = render(<Subject {...propsFor({ xReportData: probe.data })} />);
      const afterMount = probe.reads;
      expect(afterMount).toBe(1);
      rerender(<Subject {...propsFor({ xReportData: probe.data, sessionNowMs: NOW + 60000 })} />);
      expect(probe.reads).toBe(2);
      expect(parseUTCDate).toHaveBeenCalledTimes(2);
    });

    it('parseUTCDate is not called when no start field exists (short-circuit)', () => {
      render(<Subject {...propsFor({ xReportData: null, currentSession: { id: 1 }, showLiveSessionDialog: false })} />);
      expect(parseUTCDate).not.toHaveBeenCalled();
    });

    it('duration reflects the sessionNowMs of the SAME render, committed synchronously', () => {
      const { rerender } = render(<Subject {...propsFor({ sessionNowMs: NOW })} />);
      expect(sessionLine().textContent).toBe('Session #43 · 1h 5m elapsed');
      rerender(<Subject {...propsFor({ sessionNowMs: NOW + 3 * 60000 })} />);
      expect(sessionLine().textContent).toBe('Session #43 · 1h 8m elapsed');
    });

    it('an always-mounted, non-memo child re-evaluates on every unrelated parent re-render (extraction timing reference)', () => {
      const probe = countingReport();
      function Child(props) { return <Subject {...props} />; }
      function Parent() {
        const [n, setN] = useState(0);
        return (
          <>
            <button type="button" data-testid="bump" onClick={() => setN(n + 1)}>{n}</button>
            <Child {...propsFor({ showLiveSessionDialog: false, xReportData: probe.data })} />
          </>
        );
      }
      render(<Parent />);
      expect(probe.reads).toBe(1);
      fireEvent.click(screen.getByTestId('bump'));
      expect(screen.getByTestId('bump')).toHaveTextContent('1');
      expect(probe.reads).toBe(2);
    });
  });

  // ── harness with the real POSSales loadXReport / tick / tile / view-effect ──
  /**
   * Stateful harness. Bodies between the *-START/END markers are copied from POSSales.jsx and
   * enforced line-for-line by the source block below. API functions are injected.
   */
  function Harness({ api, log, initial, exposeRef }) {
    const { getPosXReport, generatePosXReport } = api;
    const [currentView, setCurrentViewRaw] = useState(initial.currentView ?? 'pos');
    const [currentSession] = useState(initial.currentSession ?? SESSION);
    const [currentTerminal] = useState(initial.currentTerminal ?? TERMINAL);
    const [sessionToClose] = useState(initial.sessionToClose ?? null);
    const [sessionNowMs, setSessionNowMs] = useState(() => Date.now());
    const [xReportData, setXReportDataRaw] = useState(initial.xReportData ?? null);
    const [xReportLoading, setXReportLoadingRaw] = useState(false);
    const [showLiveSessionDialog, setShowLiveSessionDialogRaw] = useState(initial.open ?? false);
    const isSessionActive = initial.isSessionActive ?? true;
    const wrap = (name, raw) => (v) => { log.push([name, v]); raw(v); };
    const setCurrentView = wrap('setCurrentView', setCurrentViewRaw);
    const setXReportData = wrap('setXReportData', setXReportDataRaw);
    const setXReportLoading = wrap('setXReportLoading', setXReportLoadingRaw);
    const setShowLiveSessionDialog = wrap('setShowLiveSessionDialog', setShowLiveSessionDialogRaw);

    // LOADXREPORT-START
    const loadXReport = async (markGenerated = false) => {
      const targetSession = sessionToClose || currentSession;
      if (!targetSession?.id || typeof targetSession.id !== 'number') return;
      setXReportLoading(true);
      try {
        const data = markGenerated
          ? await generatePosXReport(targetSession.id)
          : await getPosXReport(targetSession.id);
        setXReportData(data);
      } catch (err) {
        console.warn('X-Report load failed', err);
      } finally {
        setXReportLoading(false);
      }
    };
    // LOADXREPORT-END
    if (exposeRef) exposeRef.current = { loadXReport };

    // TICK-START
    useEffect(() => {
      const isActive = currentSession?.status === 'OPEN' || currentSession?.status === 'active';
      if (!isActive || !currentSession?.openedAt) {
        setSessionNowMs(Date.now());
        return undefined;
      }
      setSessionNowMs(Date.now());
      const timer = window.setInterval(() => setSessionNowMs(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }, [currentSession?.id, currentSession?.openedAt, currentSession?.status]);
    // TICK-END

    // The two X-Report branches of the POSSales [currentView] effect (z-report branch omitted).
    useEffect(() => {
      if (currentView === 'x-report') loadXReport(true);
      if (currentView === 'dashboard' && (currentSession?.status === 'active' || currentSession?.status === 'OPEN')) {
        loadXReport();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentView]);

    return (
      <>
        <output data-testid="state">{JSON.stringify({ currentView, showLiveSessionDialog, xReportLoading, xReportData })}</output>
        <button
          type="button"
          data-testid="tile"
          // TILE-START
          onClick={() => {
            if (!isSessionActive) return;
            setShowLiveSessionDialog(true);
            loadXReport();
          }}
          // TILE-END
        >
          tile
        </button>
        <button type="button" data-testid="wrapped-refresh" onClick={() => loadXReport()}>wrapped</button>
        <Subject
          showLiveSessionDialog={showLiveSessionDialog}
          setShowLiveSessionDialog={setShowLiveSessionDialog}
          xReportData={xReportData}
          xReportLoading={xReportLoading}
          currentSession={currentSession}
          currentTerminal={currentTerminal}
          sessionNowMs={sessionNowMs}
          loadXReport={loadXReport}
          setCurrentView={setCurrentView}
        />
      </>
    );
  }

  const deferred = () => {
    let resolve; let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  async function renderHarness(initial = {}, apiOverrides = {}) {
    const log = [];
    const exposeRef = { current: null };
    const api = {
      getPosXReport: vi.fn(async (id) => ({ summary: { ...SUMMARY, invoiceCount: 1 }, session: { ...SESSION, id }, kind: 'read' })),
      generatePosXReport: vi.fn(async (id) => ({ summary: { ...SUMMARY, invoiceCount: 2 }, session: { ...SESSION, id }, kind: 'generated' })),
      ...apiOverrides,
    };
    await act(async () => {
      render(<Harness api={api} log={log} initial={initial} exposeRef={exposeRef} />);
    });
    return { log, api, exposeRef };
  }
  const hState = () => JSON.parse(screen.getByTestId('state').textContent);

  describe('4. loadXReport event semantics (real body)', () => {
    it('A. loadXReport() with no argument → getPosXReport only (read-only path)', async () => {
      const { api, exposeRef, log } = await renderHarness();
      await act(async () => { await exposeRef.current.loadXReport(); });
      expect(api.getPosXReport.mock.calls).toEqual([[42]]);
      expect(api.generatePosXReport).not.toHaveBeenCalled();
      expect(log.map((e) => e[0])).toEqual(['setXReportLoading', 'setXReportData', 'setXReportLoading']);
      expect(hState().xReportData.kind).toBe('read');
    });

    it.each([
      ['event-like object', { type: 'click' }],
      ['empty object', {}],
      ['true', true],
      ['non-zero number', 1],
      ['non-empty string', 'x'],
    ])('B. loadXReport(%s) (truthy) → generatePosXReport only', async (_n, arg) => {
      const { api, exposeRef } = await renderHarness();
      await act(async () => { await exposeRef.current.loadXReport(arg); });
      expect(api.generatePosXReport.mock.calls).toEqual([[42]]);
      expect(api.getPosXReport).not.toHaveBeenCalled();
      expect(hState().xReportData.kind).toBe('generated');
    });

    it.each([
      ['undefined', undefined], ['false', false], ['null', null], ['0', 0], ['empty string', ''],
    ])('loadXReport(%s) (falsy) → read-only path', async (_n, arg) => {
      const { api, exposeRef } = await renderHarness();
      await act(async () => { await exposeRef.current.loadXReport(arg); });
      expect(api.getPosXReport).toHaveBeenCalledTimes(1);
      expect(api.generatePosXReport).not.toHaveBeenCalled();
    });

    it('targets sessionToClose over currentSession', async () => {
      const { api, exposeRef } = await renderHarness({ sessionToClose: { id: 99 } });
      await act(async () => { await exposeRef.current.loadXReport({ type: 'click' }); });
      expect(api.generatePosXReport.mock.calls).toEqual([[99]]);
    });

    it.each([
      ['no session', { id: undefined }],
      ['id 0', { id: 0 }],
      ['string id', { id: '42' }],
    ])('guard: %s → no API call and no state writes', async (_n, sess) => {
      const { api, exposeRef, log } = await renderHarness({ currentSession: { ...SESSION, ...sess } });
      await act(async () => { await exposeRef.current.loadXReport({ type: 'click' }); });
      expect(api.getPosXReport).not.toHaveBeenCalled();
      expect(api.generatePosXReport).not.toHaveBeenCalled();
      expect(log).toEqual([]);
    });

    it('failure: warns, keeps previous xReportData, resets loading', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const err = new Error('boom');
      const { exposeRef, log } = await renderHarness({ xReportData: { summary: {}, kept: true } }, { generatePosXReport: vi.fn(async () => { throw err; }) });
      await act(async () => { await exposeRef.current.loadXReport({ type: 'click' }); });
      expect(warn).toHaveBeenCalledWith('X-Report load failed', err);
      expect(log).toEqual([['setXReportLoading', true], ['setXReportLoading', false]]);
      expect(hState().xReportData).toEqual({ summary: {}, kept: true });
    });
  });

  describe('4C. Live Session Refresh forwards the click event unchanged', () => {
    it('clicking Refresh takes the GENERATED path (generatePosXReport), not the read-only path', async () => {
      const { api } = await renderHarness({ open: true, xReportData: X_REPORT });
      await act(async () => { await userEvent.click(refreshButton()); });
      expect(api.generatePosXReport.mock.calls).toEqual([[42]]);
      expect(api.getPosXReport).not.toHaveBeenCalled();
      expect(rowText('Transactions')).toBe('2');
    });

    it('the "natural" wrapper onClick={() => loadXReport()} would be behaviour-changing (read-only path)', async () => {
      const { api } = await renderHarness({ open: true, xReportData: X_REPORT });
      // Radix modal marks outside content aria-hidden/pointer-events none; fire directly.
      await act(async () => { fireEvent.click(screen.getByTestId('wrapped-refresh')); });
      expect(api.getPosXReport.mock.calls).toEqual([[42]]);
      expect(api.generatePosXReport).not.toHaveBeenCalled();
    });

    it('Refresh shows skeletons + spinner while pending, then new figures', async () => {
      const d = deferred();
      await renderHarness({ open: true, xReportData: X_REPORT }, { generatePosXReport: vi.fn(() => d.promise) });
      await act(async () => { fireEvent.click(refreshButton()); });
      expect(refreshButton()).toBeDisabled();
      expect(rowValue('Transactions').querySelector('.animate-pulse')).not.toBeNull();
      await act(async () => { d.resolve({ summary: { invoiceCount: 5 }, session: SESSION }); });
      expect(refreshButton()).not.toBeDisabled();
      expect(rowText('Transactions')).toBe('5');
    });
  });

  describe('5. open path (dashboard tile)', () => {
    it('tile: setShowLiveSessionDialog(true) THEN loadXReport() on the read-only path', async () => {
      const { api, log } = await renderHarness();
      await act(async () => { fireEvent.click(screen.getByTestId('tile')); });
      expect(log).toEqual([
        ['setShowLiveSessionDialog', true],
        ['setXReportLoading', true],
        ['setXReportData', expect.objectContaining({ kind: 'read' })],
        ['setXReportLoading', false],
      ]);
      expect(api.getPosXReport.mock.calls).toEqual([[42]]);
      expect(api.generatePosXReport).not.toHaveBeenCalled();
      expect(dialog()).toBeInTheDocument();
    });

    it('tile with inactive session does nothing', async () => {
      const { api, log } = await renderHarness({ isSessionActive: false });
      await act(async () => { fireEvent.click(screen.getByTestId('tile')); });
      expect(log).toEqual([]);
      expect(api.getPosXReport).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opening does not clear stale xReportData: skeletons while loading, stale figures never flash', async () => {
      const d = deferred();
      await renderHarness({ xReportData: { summary: { invoiceCount: 3 }, session: SESSION } }, { getPosXReport: vi.fn(() => d.promise) });
      await act(async () => { fireEvent.click(screen.getByTestId('tile')); });
      expect(rowValue('Transactions').querySelector('.animate-pulse')).not.toBeNull();
      expect(hState().xReportData.summary.invoiceCount).toBe(3);
      await act(async () => { d.resolve({ summary: { invoiceCount: 4 }, session: SESSION }); });
      expect(rowText('Transactions')).toBe('4');
    });

    it('Full X-Report → currentView x-report → view effect calls loadXReport(true) (generated path)', async () => {
      const { api } = await renderHarness({ open: true, xReportData: X_REPORT });
      await act(async () => { await userEvent.click(fullXReportButton()); });
      expect(hState()).toMatchObject({ currentView: 'x-report', showLiveSessionDialog: false });
      expect(api.generatePosXReport.mock.calls).toEqual([[42]]);
      expect(api.getPosXReport).not.toHaveBeenCalled();
    });

    it('returning to dashboard with an active session reloads on the read-only path', async () => {
      const { api } = await renderHarness({ currentView: 'dashboard' });
      expect(api.getPosXReport).toHaveBeenCalledTimes(1);
      expect(api.generatePosXReport).not.toHaveBeenCalled();
    });
  });

  describe('3. one-second tick', () => {
    it('advances the displayed elapsed duration while the dialog stays open', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: NOW });
      await renderHarness({ open: true, xReportData: X_REPORT });
      expect(sessionLine().textContent).toBe('Session #43 · 1h 5m elapsed');
      act(() => { vi.advanceTimersByTime(29_000); });
      expect(sessionLine().textContent).toBe('Session #43 · 1h 5m elapsed');
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(sessionLine().textContent).toBe('Session #43 · 1h 6m elapsed');
      act(() => { vi.advanceTimersByTime(54 * 60_000); });
      expect(sessionLine().textContent).toBe('Session #43 · 2h 0m elapsed');
      expect(dialog()).toBeInTheDocument();
    });

    it('ticks while closed too (the interval is owned by the parent, independent of the dialog)', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: NOW });
      await renderHarness({ open: false, xReportData: X_REPORT });
      vi.mocked(parseUTCDate).mockClear();
      // one owning render per tick → one closed-state evaluation per tick
      // (separate acts: a single act would batch the three updates into one render)
      for (let i = 0; i < 3; i += 1) act(() => { vi.advanceTimersByTime(1_000); });
      expect(parseUTCDate).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('no interval when currentSession lacks openedAt: a startTime-only session shows a frozen duration', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: NOW });
      const session = { id: 42, status: 'OPEN', startTime: '2026-09-14T09:00:00' };
      await renderHarness({ open: true, currentSession: session, xReportData: { summary: {}, session } });
      expect(sessionLine().textContent).toBe('Session #42 · 5m elapsed');
      act(() => { vi.advanceTimersByTime(10 * 60_000); });
      expect(sessionLine().textContent).toBe('Session #42 · 5m elapsed');
    });
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
const COMPONENT = readSource('../features/session/LiveSessionDialog.jsx');
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
const posBlock = (startLine, endLine) => block(POS_SALES, startLine, endLine);

describe('LiveSessionDialog source', () => {
  it('passes onRefresh to the Refresh button by reference, so the click event is still forwarded', () => {
    expect(COMPONENT).toContain('<button onClick={onRefresh} disabled={xReportLoading} title="Refresh"');
    expect(COMPONENT.match(/onClick=\{onRefresh\}/g)).toHaveLength(1);
    expect(COMPONENT.match(/\{onRefresh\}|onRefresh\(|=>\s*onRefresh/g)).toEqual(['{onRefresh}']);
    expect(COMPONENT.match(/onClick=\{onClose\}/g)).toHaveLength(2);
    expect(COMPONENT.match(/onClick=\{onOpenFullXReport\}/g)).toHaveLength(1);
    expect(COMPONENT.match(/onClick=/g)).toHaveLength(4);
  });

  it('has the raw prop surface and imports helpers/primitives/icons from their existing modules', () => {
    expect(COMPONENT).toContain([
      'function LiveSessionDialog({',
      '  open,',
      '  onOpenChange,',
      '  xReportData,',
      '  xReportLoading,',
      '  currentSession,',
      '  currentTerminal,',
      '  sessionNowMs,',
      '  onRefresh,',
      '  onClose,',
      '  onOpenFullXReport,',
      '}) {',
    ].join('\n'));
    expect(COMPONENT).toMatch(/import \{[^}]*\bActivity\b[^}]*\bFileText\b[^}]*\bRefreshCw\b[^}]*\bX \} from 'lucide-react';/);
    expect(COMPONENT).toContain("import { Dialog, DialogContent } from '../../../../../components/ui/dialog';");
    expect(COMPONENT).toContain("import { CurrencyAmount } from '../../POSCurrency';");
    expect(COMPONENT).toContain("import { parseUTCDate } from '../../lib/posFormatting';");
    expect(COMPONENT).toContain('export default LiveSessionDialog;');
  });

  it('is always mounted, unmemoised, hook/effect/context-free, with the calculation inline in DialogContent', () => {
    expect(COMPONENT).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(COMPONENT).not.toMatch(/\bmemo\b|createContext|useContext/);
    expect(COMPONENT).not.toMatch(/open\s*&&|if \(!open\)|open \?/);
    expect(COMPONENT).toMatch(/\[&>button:last-child\]:hidden">\n {10}\{\(\(\) => \{\n {12}const xSummary = xReportData\?\.summary \|\| \{\};/);
    expect(COMPONENT.match(/const xSummary = /g)).toHaveLength(1);
  });
});

describe('POSSales wiring (LiveSessionDialog boundary)', () => {
  it('the test copy of the LiveSessionDialog call site is line-for-line identical to POSSales', () => {
    const copy = between(SELF, '// WIRING-START\n', '    // WIRING-END');
    const live = posBlock('      <LiveSessionDialog\n', '\n      />');
    expect(trimmedLines(live)).toEqual(trimmedLines(copy));
    expect(trimmedLines(live)).toHaveLength(15);
  });

  it('the test copy of loadXReport is identical to POSSales', () => {
    const copy = between(SELF, '// LOADXREPORT-START\n', '  // LOADXREPORT-END');
    const live = posBlock('  const loadXReport = async (markGenerated = false) => {', '\n  };');
    expect(trimmedLines(live)).toEqual(trimmedLines(copy));
  });

  it('the test copy of the one-second tick effect is identical to POSSales', () => {
    const copy = between(SELF, '// TICK-START\n', '  // TICK-END');
    const live = posBlock("    const isActive = currentSession?.status === 'OPEN' || currentSession?.status === 'active';", '[currentSession?.id, currentSession?.openedAt, currentSession?.status]);');
    expect(trimmedLines(`useEffect(() => {\n${live}`)).toEqual(trimmedLines(copy));
  });

  it('the Live Session tile handler is identical to POSSales', () => {
    const copy = between(SELF, '// TILE-START\n', '        // TILE-END');
    expect(POS_SALES).toContain([
      '        {/* Live Session Tile — quick-view popup of current session sales/cash figures */}',
      '        <Card',
      "          className={`${posDashboardTileClass}${isSessionActive ? '' : ' opacity-50 cursor-not-allowed'}`}",
    ].join('\n'));
    const live = posBlock('          onClick={() => {\n            if (!isSessionActive) return;\n            setShowLiveSessionDialog(true);', '\n          }}');
    expect(trimmedLines(live)).toEqual(trimmedLines(copy));
  });

  it('pins the view-effect X-Report branches the harness copies', () => {
    expect(POS_SALES).toContain("    if (currentView === 'x-report') loadXReport(true);");
    expect(POS_SALES).toContain([
      "    if (currentView === 'dashboard' && (currentSession?.status === 'active' || currentSession?.status === 'OPEN')) {",
      '      loadXReport();',
      '    }',
    ].join('\n'));
  });

  it('Refresh receives loadXReport by reference; exactly three by-reference handlers exist in POSSales', () => {
    expect(POS_SALES).toContain('        onRefresh={loadXReport}\n');
    expect(POS_SALES.match(/onRefresh=\{loadXReport\}/g)).toHaveLength(1);
    expect(POS_SALES.match(/onClick=\{loadXReport\}/g)).toHaveLength(2); // the two X-Report view buttons
    expect(POS_SALES).not.toMatch(/(?:onClick|onRefresh)=\{\(\w*\) => loadXReport\(\)\}/);
    expect(POS_SALES).not.toContain('title="Refresh"\n                        className="text-gray-400 hover:text-[#327F74]');
  });

  it('pins every loadXReport call site: one generated call, five read-only calls', () => {
    expect(POS_SALES.match(/loadXReport\(true\)/g)).toHaveLength(1);
    expect(POS_SALES.match(/loadXReport\(\)/g)).toHaveLength(5);
    expect(POS_SALES.match(/loadXReport\([^)]/g)).toEqual(['loadXReport(t']);
  });

  it('renders LiveSessionDialog exactly once, always mounted, with the inline markup and calculation removed', () => {
    expect(POS_SALES).toContain("import LiveSessionDialog from './POS/features/session/LiveSessionDialog';");
    expect(POS_SALES.match(/<LiveSessionDialog\b/g)).toHaveLength(1);
    expect(POS_SALES).not.toMatch(/showLiveSessionDialog\s*&&/);
    expect(POS_SALES).not.toContain('<Dialog open={showLiveSessionDialog}');
    // The dashboard tile and the X-Report view keep their own copies; the dialog's third copy moved out.
    expect(POS_SALES.match(/const xSummary = xReportData\?\.summary \|\| \{\};/g)).toHaveLength(2);
    expect(POS_SALES).not.toContain("{ label: 'Expected Cash in Drawer', value: <CurrencyAmount amount={expectedCash} />, accent: '#F5C742' },");
  });

  it('keeps state ownership in POSSales', () => {
    expect(POS_SALES).toContain('const [showLiveSessionDialog, setShowLiveSessionDialog] = useState(false);');
    expect(POS_SALES).toContain('const [sessionNowMs, setSessionNowMs] = useState(() => Date.now());');
    expect(POS_SALES).toContain('const [xReportData, setXReportData] = useState(null);');
    expect(POS_SALES).toContain('const [xReportLoading, setXReportLoading] = useState(false);');
    expect(POS_SALES).toContain('  sessionClosureLoadersRef.current = { loadXReport, loadDaySummary, syncPosData };');
    // tile (true), onClose and onOpenFullXReport — the two inline close bodies collapsed into onClose.
    expect(POS_SALES.match(/setShowLiveSessionDialog\(/g)).toHaveLength(3);
  });

  it('sits between CashDropDialog and CloseDayVarianceDialog, behind the unchanged comment', () => {
    expect(POS_SALES).toMatch(
      /\n {8}onRecord=\{handleCashDrop\}\n {6}\/>\n\n {6}\{\/\* Live Session Quick View — dashboard tile popup showing current session\n {10}sales\/cash figures, sourced from the same X-Report summary the full\n {10}X-Report page uses so the numbers never disagree\. \*\/\}\n {6}<LiveSessionDialog\n[\s\S]*?\n {6}\/>\n\n {6}\{\/\* Close Day Reconciliation Variance Dialog \*\/\}\n {6}<CloseDayVarianceDialog\n/,
    );
  });
});
