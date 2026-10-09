import fs from 'node:fs';
import path from 'node:path';
import React, { useCallback, useEffect, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertTriangle, ChevronRight, Clock, MapPin, Users } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PreviousBusinessDayBlockOverlay from '../features/session/PreviousBusinessDayBlockOverlay';

// Pinned verbatim from the POSSales.jsx R6 previous-business-day overlay before extraction.
const HEADING = 'Previous Business Day Not Closed';
const EXPLANATION = 'POS entry is blocked until a supervisor runs Day Close for the session(s) below.';
const DISMISS = 'Dismiss';
const subtitle = (date) => `Business date ${date} still has open session(s) past operating hours.`;

const BACKDROP_CLASS = 'fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4';
const PANEL_CLASS = 'bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto';
const HEADER_CLASS = 'bg-gradient-to-r from-amber-500 to-orange-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl';
const ICON_WRAP_CLASS = 'w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner';
const HEADING_CLASS = 'text-lg sm:text-2xl font-black tracking-tight mb-1';
const SUBTITLE_CLASS = 'text-white/80 text-xs sm:text-sm font-medium';
const BODY_CLASS = 'p-4 sm:p-8 space-y-3 sm:space-y-4';
const EXPLANATION_CLASS = 'text-xs sm:text-sm text-slate-600';
const LIST_CLASS = 'space-y-2 max-h-64 overflow-y-auto';
const ROW_CLASS = 'w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl p-3 sm:p-4 flex items-center gap-3 shadow-sm transition-all';
const ROW_ICON_WRAP_CLASS = 'w-10 h-10 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl flex items-center justify-center shrink-0';
const ROW_TEXT_CLASS = 'min-w-0 flex-1';
const ROW_TITLE_CLASS = 'text-sm font-bold text-slate-800 truncate';
const ROW_META_CLASS = 'text-xs text-slate-500 flex items-center gap-1 mt-0.5';
const ROW_DOT_CLASS = 'text-slate-300';
const DISMISS_CLASS = 'w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-semibold text-xs hover:bg-slate-50 hover:text-slate-700 transition-all';

const KEY_PREFIX = 'billbull:pos:terminal_id:';

const SESSIONS = [
  { sessionId: 'S-1', terminalId: 'T-001', terminalName: 'Front Till', counterName: 'Counter A', openedBy: 'alice', openedAt: '2026-09-10T18:45:00Z' },
  { sessionId: 'S-2', terminalId: 'T-002', terminalName: null, counterName: '', openedBy: 'bob', openedAt: Date.UTC(2026, 8, 10, 9, 5, 0) },
  { sessionId: 'S-3', terminalId: 'T-003', openedBy: undefined, openedAt: null },
];
const BLOCK = { blocked: true, currentBusinessDate: '2026-09-10', branchId: 'BR-7', openSessions: SESSIONS };

/**
 * The original R6 block, copied from POSSales.jsx before extraction, including its
 * `openSessionsBlock &&` guard and the inline deep-link row handler. The POSSales-owned
 * values arrive as props with their POSSales names; nothing else is changed.
 */
function OriginalPreviousBusinessDayBlock({ openSessionsBlock, dismissOpenSessionsBlock }) {
  return (
    <>
      {openSessionsBlock && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner">
                <AlertTriangle className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">Previous Business Day Not Closed</h2>
              <p className="text-white/80 text-xs sm:text-sm font-medium">
                Business date {openSessionsBlock.currentBusinessDate} still has open session(s) past operating hours.
              </p>
            </div>
            <div className="p-4 sm:p-8 space-y-3 sm:space-y-4">
              <p className="text-xs sm:text-sm text-slate-600">
                POS entry is blocked until a supervisor runs Day Close for the session(s) below.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(openSessionsBlock.openSessions || []).map((s) => (
                  <button
                    key={s.sessionId}
                    type="button"
                    onClick={() => {
                      // Deep-link a supervisor to the terminal that owns this session.
                      localStorage.setItem(
                        `billbull:pos:terminal_id:${openSessionsBlock.branchId || sessionStorage.getItem('activeBranchId') || 'default'}`,
                        s.terminalId
                      );
                      window.location.reload();
                    }}
                    className="w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl p-3 sm:p-4 flex items-center gap-3 shadow-sm transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {s.counterName || 'Counter'} · {s.terminalName || s.terminalId}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Users className="h-3 w-3 shrink-0" />{s.openedBy}
                        <span className="text-slate-300">•</span>
                        <Clock className="h-3 w-3 shrink-0" />
                        {s.openedAt ? new Date(s.openedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={dismissOpenSessionsBlock}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-semibold text-xs hover:bg-slate-50 hover:text-slate-700 transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The post-extraction R6 block, written with the exact expressions POSSales now uses: the
 * guard and the verbatim deep-link handler (storage key, reload) stay in the parent.
 */
function ExtractedPreviousBusinessDayBlock({ openSessionsBlock, dismissOpenSessionsBlock }) {
  return (
    <>
      {openSessionsBlock && (
        <PreviousBusinessDayBlockOverlay
          block={openSessionsBlock}
          onDismiss={dismissOpenSessionsBlock}
          onSelectSession={(s) => {
            // Deep-link a supervisor to the terminal that owns this session.
            localStorage.setItem(
              `billbull:pos:terminal_id:${openSessionsBlock.branchId || sessionStorage.getItem('activeBranchId') || 'default'}`,
              s.terminalId
            );
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

// Behavioural tests run against each POSSales-shaped block (same POSSales input).
const SUBJECTS = [
  ['original R6 block', OriginalPreviousBusinessDayBlock],
  ['PreviousBusinessDayBlockOverlay wired like POSSales', ExtractedPreviousBusinessDayBlock],
];

const backdrop = (container) => container.firstChild;
const panel = (container) => backdrop(container).firstChild;
const header = (container) => panel(container).children[0];
const body = (container) => panel(container).children[1];
const list = (container) => body(container).children[1];
const rows = (container) => Array.from(list(container).children);
const dismissButton = () => screen.getByRole('button', { name: DISMISS });

// ── Storage / reload instrumentation ─────────────────────────────────────────────────────
// jsdom's localStorage and sessionStorage share Storage.prototype; the real methods are kept
// so seeding and snapshots never show up in the recorded event stream.
const realGetItem = Storage.prototype.getItem;
const realSetItem = Storage.prototype.setItem;
const storeName = (store) => (store === localStorage ? 'local' : store === sessionStorage ? 'session' : 'other');
const snapshot = (store) => Object.fromEntries(Object.keys(store).sort().map((k) => [k, realGetItem.call(store, k)]));
const seed = (store, entries) => Object.entries(entries).forEach(([k, v]) => realSetItem.call(store, k, v));

// ── Locale instrumentation ───────────────────────────────────────────────────────────────
// `new Date(x).toLocaleString()` depends on the machine's default locale and time zone (this
// repo's dev machines run en-IN / Asia/Calcutta). The spy replaces the output with a
// deterministic tag of the exact instant, and records how it was called, so assertions never
// depend on the host. The real implementation is exercised separately with a pinned locale.
const realToLocaleString = Date.prototype.toLocaleString;
const localeTag = (date) => {
  const t = date.getTime();
  return `LOCALE[${Number.isNaN(t) ? 'NaN' : date.toISOString()}]`;
};

let events;
let reloadSpy;
let localeCalls;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  events = [];
  localeCalls = [];
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    events.push([storeName(this), 'getItem', key]);
    return realGetItem.call(this, key);
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
    events.push([storeName(this), 'setItem', key, value]);
    return realSetItem.call(this, key, value);
  });
  // jsdom's location.reload is non-configurable, so the whole location object is stubbed.
  reloadSpy = vi.fn(() => { events.push(['reload', snapshot(localStorage)]); });
  vi.stubGlobal('location', { reload: reloadSpy });
  vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function toLocaleString(...args) {
    localeCalls.push({ iso: localeTag(this), args });
    return localeTag(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

/** POSSales-shaped owner: the block and its dismiss callback live in the parent, as in usePosSession. */
function makeHarness(Block) {
  const control = {};
  function Harness({ initialBlock }) {
    const [openSessionsBlock, setOpenSessionsBlock] = useState(initialBlock);
    const dismissOpenSessionsBlock = useCallback(() => setOpenSessionsBlock(null), []);
    useEffect(() => { control.setBlock = setOpenSessionsBlock; }, []);
    return (
      <>
        <div data-testid="business-day-banner" />
        <Block openSessionsBlock={openSessionsBlock} dismissOpenSessionsBlock={dismissOpenSessionsBlock} />
        <div data-testid="session-discovery-dialog" />
      </>
    );
  }
  return { Harness, control };
}

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('mounting (openSessionsBlock guard)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['false', false],
      ['empty string', ''],
    ])('renders nothing when openSessionsBlock is %s', (_name, value) => {
      const { container } = render(<Subject openSessionsBlock={value} dismissOpenSessionsBlock={vi.fn()} />);
      expect(container.innerHTML).toBe('');
      expect(localeCalls).toHaveLength(0);
    });

    // `&&` short-circuit: a falsy number is itself rendered, the overlay is not.
    it.each([
      ['0', 0, '0'],
      ['NaN', NaN, 'NaN'],
    ])('renders the bare value and no overlay when openSessionsBlock is %s', (_name, value, text) => {
      const { container } = render(<Subject openSessionsBlock={value} dismissOpenSessionsBlock={vi.fn()} />);
      expect(container.innerHTML).toBe(text);
    });

    it.each([
      ['an empty object', {}],
      ['blocked: false (the guard ignores the flag)', { blocked: false, currentBusinessDate: '2026-09-10' }],
      ['a non-empty string', 'blocked'],
      ['true', true],
    ])('mounts the overlay for any truthy value — %s', (_name, value) => {
      const { container } = render(<Subject openSessionsBlock={value} dismissOpenSessionsBlock={vi.fn()} />);
      expect(backdrop(container).className).toBe(BACKDROP_CLASS);
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(HEADING);
      expect(rows(container)).toHaveLength(0);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('mounts inline (no portal) while openSessionsBlock is truthy', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(container.children).toHaveLength(1);
      expect(document.body.children).toHaveLength(1);
      expect(container.contains(screen.getByRole('heading', { level: 2 }))).toBe(true);
    });

    it('mounts, updates and unmounts in place as the value changes', () => {
      const { container, rerender } = render(<Subject openSessionsBlock={null} dismissOpenSessionsBlock={vi.fn()} />);
      expect(container.innerHTML).toBe('');
      rerender(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(rows(container)).toHaveLength(3);
      rerender(<Subject openSessionsBlock={{ ...BLOCK, currentBusinessDate: '2026-09-09', openSessions: [SESSIONS[2]] }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(header(container).children[2].textContent).toBe(subtitle('2026-09-09'));
      expect(rows(container)).toHaveLength(1);
      rerender(<Subject openSessionsBlock={null} dismissOpenSessionsBlock={vi.fn()} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('static structure', () => {
    it('keeps the backdrop, panel, header and body structure with exact classes', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(container.children).toHaveLength(1);
      expect(backdrop(container).tagName).toBe('DIV');
      expect(backdrop(container).className).toBe(BACKDROP_CLASS);
      expect(backdrop(container).children).toHaveLength(1);
      expect(panel(container).tagName).toBe('DIV');
      expect(panel(container).className).toBe(PANEL_CLASS);
      expect(Array.from(panel(container).children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        `DIV.${HEADER_CLASS}`,
        `DIV.${BODY_CLASS}`,
      ]);
      expect(Array.from(header(container).children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        `DIV.${ICON_WRAP_CLASS}`,
        `H2.${HEADING_CLASS}`,
        `P.${SUBTITLE_CLASS}`,
      ]);
      expect(Array.from(body(container).children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        `P.${EXPLANATION_CLASS}`,
        `DIV.${LIST_CLASS}`,
        `BUTTON.${DISMISS_CLASS}`,
      ]);
    });

    it('renders the exact heading, subtitle and explanatory text', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      const headings = screen.getAllByRole('heading');
      expect(headings).toHaveLength(1);
      expect(headings[0].tagName).toBe('H2');
      expect(headings[0].textContent).toBe(HEADING);
      expect(headings[0].children).toHaveLength(0);
      const sub = header(container).children[2];
      expect(sub.textContent).toBe(subtitle('2026-09-10'));
      expect(sub.children).toHaveLength(0);
      const explanation = body(container).children[0];
      expect(explanation.textContent).toBe(EXPLANATION);
      expect(explanation.children).toHaveLength(0);
    });

    it('renders the header warning icon', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      const iconWrap = header(container).children[0];
      expect(iconWrap.children).toHaveLength(1);
      const svg = iconWrap.firstChild;
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg).toHaveClass('lucide-triangle-alert', 'h-7', 'w-7', 'sm:h-10', 'sm:w-10', 'text-white');
      expect(svg.getAttribute('class').split(' ')).toEqual(expect.arrayContaining(['lucide', 'lucide-triangle-alert']));
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders the Dismiss button last, as a plain type=button with text only', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      const btn = dismissButton();
      expect(body(container).lastElementChild).toBe(btn);
      expect(btn.className).toBe(DISMISS_CLASS);
      expect(btn).toHaveAttribute('type', 'button');
      expect(btn).not.toHaveAttribute('disabled');
      expect(btn.textContent).toBe(DISMISS);
      expect(btn.children).toHaveLength(0);
    });

    it('has no dialog role, aria-modal, aria labelling, tabindex or data-state', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      for (const el of container.querySelectorAll('*')) {
        for (const attr of ['role', 'aria-modal', 'aria-labelledby', 'aria-describedby', 'aria-label', 'tabindex', 'data-state', 'data-slot', 'id']) {
          expect(el.hasAttribute(attr), `${el.tagName} ${attr}`).toBe(false);
        }
      }
      // Every icon is decorative.
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      }
    });
  });

  describe('subtitle business date (rendered raw, never formatted)', () => {
    it.each([
      ['an ISO date', '2026-09-10', '2026-09-10'],
      ['an arbitrary string', 'yesterday', 'yesterday'],
      ['a full timestamp', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z'],
      ['a number', 20260910, '20260910'],
      ['undefined', undefined, ''],
      ['null', null, ''],
      ['false', false, ''],
    ])('%s', (_name, value, shown) => {
      const { container } = render(<Subject openSessionsBlock={{ currentBusinessDate: value }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(header(container).children[2].textContent).toBe(subtitle(shown));
      expect(localeCalls).toHaveLength(0);
    });
  });

  describe('session rows', () => {
    it('renders one row per open session, in array order', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(rows(container)).toHaveLength(3);
      expect(rows(container).map((r) => r.querySelector('p').textContent)).toEqual([
        'Counter A · Front Till',
        'Counter · T-002',
        'Counter · T-003',
      ]);
      // Rows sit before Dismiss; there are exactly rows + 1 buttons.
      expect(screen.getAllByRole('button').map((b) => b.textContent.startsWith('Counter') ? 'row' : b.textContent)).toEqual(['row', 'row', 'row', DISMISS]);
    });

    it('preserves a reversed order verbatim (no sorting)', () => {
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, openSessions: [...SESSIONS].reverse() }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(rows(container).map((r) => r.querySelector('p').textContent)).toEqual([
        'Counter · T-003',
        'Counter · T-002',
        'Counter A · Front Till',
      ]);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty array', []],
      ['false', false],
    ])('renders an empty list container when openSessions is %s', (_name, value) => {
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, openSessions: value }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(list(container).className).toBe(LIST_CLASS);
      expect(list(container).innerHTML).toBe('');
      expect(screen.getAllByRole('button')).toEqual([dismissButton()]);
    });

    it('keeps each row structure, classes and icons', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      for (const row of rows(container)) {
        expect(row.tagName).toBe('BUTTON');
        expect(row.className).toBe(ROW_CLASS);
        expect(row).toHaveAttribute('type', 'button');
        expect(row).not.toHaveAttribute('disabled');
        expect(Array.from(row.children).map((c) => `${c.tagName.toLowerCase()}.${c.getAttribute('class')}`)).toEqual([
          `div.${ROW_ICON_WRAP_CLASS}`,
          `div.${ROW_TEXT_CLASS}`,
          expect.stringMatching(/^svg\.lucide lucide-chevron-right h-4 w-4 text-slate-400 shrink-0$/),
        ]);
        const pin = row.children[0].firstChild;
        expect(row.children[0].children).toHaveLength(1);
        expect(pin.getAttribute('class')).toBe('lucide lucide-map-pin h-5 w-5');
        const [title, meta] = row.children[1].children;
        expect(row.children[1].children).toHaveLength(2);
        expect(title.tagName).toBe('P');
        expect(title.className).toBe(ROW_TITLE_CLASS);
        expect(title.children).toHaveLength(0);
        expect(meta.tagName).toBe('P');
        expect(meta.className).toBe(ROW_META_CLASS);
        expect(Array.from(meta.children).map((c) => `${c.tagName.toLowerCase()}.${c.getAttribute('class')}`)).toEqual([
          'svg.lucide lucide-users h-3 w-3 shrink-0',
          `span.${ROW_DOT_CLASS}`,
          'svg.lucide lucide-clock h-3 w-3 shrink-0',
        ]);
        expect(meta.children[1].textContent).toBe('•');
      }
    });

    it('keeps the exact text-node sequence of the meta line', () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      const seq = (p) => Array.from(p.childNodes).map((n) => (n.nodeType === 3 ? `#${n.textContent}` : n.tagName.toLowerCase()));
      expect(seq(rows(container)[0].children[1].children[1])).toEqual(['svg', '#alice', 'span', 'svg', '#LOCALE[2026-09-10T18:45:00.000Z]']);
      expect(seq(rows(container)[2].children[1].children[1])).toEqual(['svg', 'span', 'svg', '#—']);
      expect(seq(rows(container)[0].children[1].children[0])).toEqual(['#Counter A', '# · ', '#Front Till']);
    });

    it.each([
      ['counter and terminal names', { counterName: 'C1', terminalName: 'Till', terminalId: 'T-9' }, 'C1 · Till'],
      ['no counter name', { terminalName: 'Till', terminalId: 'T-9' }, 'Counter · Till'],
      ['an empty counter name', { counterName: '', terminalName: 'Till', terminalId: 'T-9' }, 'Counter · Till'],
      ['no terminal name', { counterName: 'C1', terminalId: 'T-9' }, 'C1 · T-9'],
      ['an empty terminal name', { counterName: 'C1', terminalName: '', terminalId: 'T-9' }, 'C1 · T-9'],
      ['neither terminal name nor id', { counterName: 'C1' }, 'C1 · '],
      ['a numeric terminal id', { terminalId: 42 }, 'Counter · 42'],
      ['a zero terminal id (rendered)', { terminalId: 0 }, 'Counter · 0'],
    ])('title line with %s', (_name, fields, expected) => {
      const { container } = render(<Subject openSessionsBlock={{ openSessions: [{ sessionId: 'x', ...fields }] }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(rows(container)[0].children[1].children[0].textContent).toBe(expected);
    });

    it.each([
      ['a name', 'alice', 'alice'],
      ['undefined', undefined, ''],
      ['null', null, ''],
      ['a number', 7, '7'],
    ])('openedBy as %s', (_name, openedBy, shown) => {
      const { container } = render(<Subject openSessionsBlock={{ openSessions: [{ sessionId: 'x', openedBy }] }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(rows(container)[0].children[1].children[1].textContent).toBe(`${shown}•—`);
    });

    it('renders every row as its own accessible button named by its text', () => {
      render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Counter A · Front Till alice•LOCALE[2026-09-10T18:45:00.000Z]' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Counter · T-003 •—' })).toBeInTheDocument();
    });
  });

  describe('openedAt display (locale-sensitive, deterministic via the spy)', () => {
    const renderOpenedAt = (openedAt) => {
      const { container } = render(<Subject openSessionsBlock={{ openSessions: [{ sessionId: 'x', openedBy: 'u', openedAt }] }} dismissOpenSessionsBlock={vi.fn()} />);
      return rows(container)[0].children[1].children[1].textContent.slice('u•'.length);
    };

    it.each([
      ['an ISO instant', '2026-09-10T18:45:00Z', 'LOCALE[2026-09-10T18:45:00.000Z]'],
      ['an offset instant', '2026-09-11T00:15:00+05:30', 'LOCALE[2026-09-10T18:45:00.000Z]'],
      ['a date-only string (parsed as UTC midnight)', '2026-09-10', 'LOCALE[2026-09-10T00:00:00.000Z]'],
      ['an epoch-millis number', Date.UTC(2026, 8, 10, 9, 5, 0), 'LOCALE[2026-09-10T09:05:00.000Z]'],
      ['an unparseable string', 'not-a-date', 'LOCALE[NaN]'],
      ['true (new Date(true) is epoch + 1ms)', true, 'LOCALE[1970-01-01T00:00:00.001Z]'],
    ])('formats %s through new Date(openedAt).toLocaleString() with no arguments', (_name, openedAt, shown) => {
      expect(renderOpenedAt(openedAt)).toBe(shown);
      expect(localeCalls).toEqual([{ iso: shown, args: [] }]);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['0 (epoch is treated as missing)', 0],
      ['false', false],
    ])('renders an em dash and never formats when openedAt is %s', (_name, openedAt) => {
      expect(renderOpenedAt(openedAt)).toBe('—');
      expect(localeCalls).toHaveLength(0);
    });

    it('formats once per row per render, in row order', () => {
      render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      expect(localeCalls).toEqual([
        { iso: 'LOCALE[2026-09-10T18:45:00.000Z]', args: [] },
        { iso: 'LOCALE[2026-09-10T09:05:00.000Z]', args: [] },
      ]);
    });

    it('with the real implementation pinned to en-US / UTC, renders the pinned format', () => {
      Date.prototype.toLocaleString.mockImplementation(function pinned() {
        return realToLocaleString.call(this, 'en-US', { timeZone: 'UTC' });
      });
      // \s also matches the U+202F narrow no-break space newer ICU puts before the day period.
      expect(renderOpenedAt('2026-09-10T18:45:00Z')).toMatch(/^9\/10\/2026, 6:45:00\sPM$/);
      cleanup();
      expect(renderOpenedAt('not-a-date')).toBe('Invalid Date');
    });

    it('with no spy, matches the host default toLocaleString() exactly', () => {
      Date.prototype.toLocaleString.mockRestore();
      const iso = '2026-09-10T18:45:00Z';
      expect(renderOpenedAt(iso)).toBe(new Date(iso).toLocaleString());
    });
  });

  describe('inert areas', () => {
    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['a click on the backdrop', async (container) => userEvent.click(backdrop(container))],
      ['a click on the header', async (container) => userEvent.click(header(container))],
      ['a click on the explanatory text', async (container) => userEvent.click(body(container).children[0])],
      ['a click on the list container', async (container) => userEvent.click(list(container))],
    ])('%s does nothing: no dismiss, no storage access, no reload', async (_name, trigger) => {
      const dismiss = vi.fn();
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={dismiss} />);
      await trigger(container);
      expect(dismiss).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(events).toEqual([]);
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('rendering alone reads no storage and never reloads', () => {
      seed(sessionStorage, { activeBranchId: 'BR-SESSION' });
      render(<Subject openSessionsBlock={{ ...BLOCK, branchId: undefined }} dismissOpenSessionsBlock={vi.fn()} />);
      expect(events).toEqual([]);
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('Dismiss', () => {
    it('calls dismissOpenSessionsBlock directly: once per click, receiving the click event', async () => {
      const dismiss = vi.fn();
      render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={dismiss} />);
      await userEvent.click(dismissButton());
      await userEvent.click(dismissButton());
      expect(dismiss).toHaveBeenCalledTimes(2);
      expect(dismiss.mock.calls[0]).toHaveLength(1);
      expect(dismiss.mock.calls[0][0]).toHaveProperty('type', 'click');
    });

    it('touches no storage and never reloads', async () => {
      seed(localStorage, { [`${KEY_PREFIX}BR-7`]: 'T-OLD' });
      render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      await userEvent.click(dismissButton());
      expect(events).toEqual([]);
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(snapshot(localStorage)).toEqual({ [`${KEY_PREFIX}BR-7`]: 'T-OLD' });
    });

    it('does not unmount by itself when the owner ignores the call', async () => {
      render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={() => {}} />);
      await userEvent.click(dismissButton());
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });

  describe('session-row deep link (terminal-id storage key)', () => {
    const clickRow = async (container, index = 0) => userEvent.click(rows(container)[index]);

    it('with branchId: writes the terminalId under that branch, then reloads — sessionStorage is never read', async () => {
      seed(sessionStorage, { activeBranchId: 'BR-SESSION' });
      const dismiss = vi.fn();
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={dismiss} />);
      await clickRow(container, 1);
      expect(events).toEqual([
        ['local', 'setItem', `${KEY_PREFIX}BR-7`, 'T-002'],
        ['reload', { [`${KEY_PREFIX}BR-7`]: 'T-002' }],
      ]);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(reloadSpy.mock.calls[0]).toHaveLength(0);
      expect(dismiss).not.toHaveBeenCalled();
      expect(snapshot(sessionStorage)).toEqual({ activeBranchId: 'BR-SESSION' });
    });

    it('without branchId: reads sessionStorage.activeBranchId at click time, writes, then reloads', async () => {
      seed(sessionStorage, { activeBranchId: 'BR-SESSION' });
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId: undefined }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container, 0);
      expect(events).toEqual([
        ['session', 'getItem', 'activeBranchId'],
        ['local', 'setItem', `${KEY_PREFIX}BR-SESSION`, 'T-001'],
        ['reload', { [`${KEY_PREFIX}BR-SESSION`]: 'T-001' }],
      ]);
    });

    it('without branchId or activeBranchId: falls back to the "default" key', async () => {
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId: undefined }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container, 2);
      expect(events).toEqual([
        ['session', 'getItem', 'activeBranchId'],
        ['local', 'setItem', `${KEY_PREFIX}default`, 'T-003'],
        ['reload', { [`${KEY_PREFIX}default`]: 'T-003' }],
      ]);
    });

    it.each([
      ['null', null],
      ['empty string', ''],
      ['0', 0],
      ['false', false],
    ])('a falsy branchId (%s) falls through to sessionStorage', async (_name, branchId) => {
      seed(sessionStorage, { activeBranchId: 'BR-SESSION' });
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container);
      expect(events.filter((e) => e[1] === 'setItem')).toEqual([['local', 'setItem', `${KEY_PREFIX}BR-SESSION`, 'T-001']]);
    });

    it('an empty activeBranchId falls through to "default"', async () => {
      seed(sessionStorage, { activeBranchId: '' });
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId: undefined }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container);
      expect(events.filter((e) => e[1] === 'setItem')).toEqual([['local', 'setItem', `${KEY_PREFIX}default`, 'T-001']]);
    });

    it('a numeric branchId is interpolated as-is', async () => {
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId: 42 }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container);
      expect(events.filter((e) => e[1] === 'setItem')).toEqual([['local', 'setItem', `${KEY_PREFIX}42`, 'T-001']]);
    });

    it('ignores an activeBranchId in localStorage (only sessionStorage is consulted)', async () => {
      seed(localStorage, { activeBranchId: 'BR-LOCAL' });
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId: undefined }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container);
      expect(events.filter((e) => e[1] === 'setItem')).toEqual([['local', 'setItem', `${KEY_PREFIX}default`, 'T-001']]);
    });

    it('uses the sessionStorage value current at click time, not at render time', async () => {
      seed(sessionStorage, { activeBranchId: 'BR-AT-RENDER' });
      const { container } = render(<Subject openSessionsBlock={{ ...BLOCK, branchId: undefined }} dismissOpenSessionsBlock={vi.fn()} />);
      seed(sessionStorage, { activeBranchId: 'BR-AT-CLICK-1' });
      await clickRow(container);
      seed(sessionStorage, { activeBranchId: 'BR-AT-CLICK-2' });
      await clickRow(container);
      expect(events.filter((e) => e[1] === 'setItem').map((e) => e[2])).toEqual([
        `${KEY_PREFIX}BR-AT-CLICK-1`,
        `${KEY_PREFIX}BR-AT-CLICK-2`,
      ]);
    });

    it('writes terminalId even when a terminalName is displayed', async () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container, 0);
      expect(realGetItem.call(localStorage, `${KEY_PREFIX}BR-7`)).toBe('T-001');
    });

    it.each([
      ['undefined', undefined, 'undefined'],
      ['null', null, 'null'],
      ['a number', 7, '7'],
    ])('a %s terminalId is still written (coerced by Storage) and reloads', async (_name, terminalId, stored) => {
      const { container } = render(<Subject openSessionsBlock={{ branchId: 'BR-7', openSessions: [{ sessionId: 'x', terminalId }] }} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container);
      expect(events).toEqual([
        ['local', 'setItem', `${KEY_PREFIX}BR-7`, terminalId],
        ['reload', { [`${KEY_PREFIX}BR-7`]: stored }],
      ]);
    });

    it('overwrites an existing key and leaves other keys alone', async () => {
      seed(localStorage, { [`${KEY_PREFIX}BR-7`]: 'T-OLD', [`${KEY_PREFIX}BR-8`]: 'T-OTHER', 'billbull:pos:device_fingerprint': 'fp', token: 'abc' });
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container, 2);
      expect(snapshot(localStorage)).toEqual({
        [`${KEY_PREFIX}BR-7`]: 'T-003',
        [`${KEY_PREFIX}BR-8`]: 'T-OTHER',
        'billbull:pos:device_fingerprint': 'fp',
        token: 'abc',
      });
    });

    it.each([
      ['the pin icon', (row) => row.children[0].firstChild],
      ['the title line', (row) => row.children[1].children[0]],
      ['the clock icon', (row) => row.children[1].children[1].children[2]],
      ['the chevron', (row) => row.children[2]],
    ])('a click on %s inside the row triggers the same deep link', async (_name, pick) => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      await userEvent.click(pick(rows(container)[0]));
      expect(events).toEqual([
        ['local', 'setItem', `${KEY_PREFIX}BR-7`, 'T-001'],
        ['reload', { [`${KEY_PREFIX}BR-7`]: 'T-001' }],
      ]);
    });

    it('re-runs on every click (no latch) and stays mounted', async () => {
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      await clickRow(container, 0);
      await clickRow(container, 1);
      expect(reloadSpy).toHaveBeenCalledTimes(2);
      expect(events).toEqual([
        ['local', 'setItem', `${KEY_PREFIX}BR-7`, 'T-001'],
        ['reload', { [`${KEY_PREFIX}BR-7`]: 'T-001' }],
        ['local', 'setItem', `${KEY_PREFIX}BR-7`, 'T-002'],
        ['reload', { [`${KEY_PREFIX}BR-7`]: 'T-002' }],
      ]);
      expect(rows(container)).toHaveLength(3);
    });

    it('if setItem throws, reload is not reached', async () => {
      Storage.prototype.setItem.mockImplementation(() => { throw new Error('QuotaExceeded'); });
      const errors = [];
      const onError = (e) => { errors.push(e.error?.message); e.preventDefault(); };
      window.addEventListener('error', onError);
      const { container } = render(<Subject openSessionsBlock={BLOCK} dismissOpenSessionsBlock={vi.fn()} />);
      try {
        await clickRow(container);
      } catch {
        // userEvent may surface the listener error; either way the order below holds.
      } finally {
        window.removeEventListener('error', onError);
      }
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('stateful POSSales-shaped harness', () => {
    it('Dismiss clears the owner state and unmounts only the overlay; siblings keep their order', async () => {
      const { Harness } = makeHarness(Subject);
      const { container } = render(<Harness initialBlock={BLOCK} />);
      const [banner, overlay, discovery] = Array.from(container.children);
      expect(banner).toBe(screen.getByTestId('business-day-banner'));
      expect(overlay.className).toBe(BACKDROP_CLASS);
      expect(discovery).toBe(screen.getByTestId('session-discovery-dialog'));
      await userEvent.click(dismissButton());
      expect(Array.from(container.children)).toEqual([banner, discovery]);
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
      expect(events).toEqual([]);
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('re-mounts between the same siblings when the owner sets a new block', async () => {
      const { Harness, control } = makeHarness(Subject);
      const { container } = render(<Harness initialBlock={BLOCK} />);
      await userEvent.click(dismissButton());
      act(() => control.setBlock({ ...BLOCK, currentBusinessDate: '2026-09-09' }));
      expect(Array.from(container.children).map((c) => c.getAttribute('data-testid') || c.className)).toEqual([
        'business-day-banner',
        BACKDROP_CLASS,
        'session-discovery-dialog',
      ]);
      const overlayHeader = container.children[1].firstChild.children[0];
      expect(overlayHeader.children[2].textContent).toBe(subtitle('2026-09-09'));
    });

    it('a row click uses the branchId of the block rendered at click time', async () => {
      const { Harness, control } = makeHarness(Subject);
      render(<Harness initialBlock={BLOCK} />);
      act(() => control.setBlock({ ...BLOCK, branchId: 'BR-NEW' }));
      await userEvent.click(screen.getByRole('button', { name: /^Counter A · Front Till/ }));
      act(() => control.setBlock({ ...BLOCK, branchId: undefined }));
      seed(sessionStorage, { activeBranchId: 'BR-SESSION' });
      await userEvent.click(screen.getByRole('button', { name: /^Counter A · Front Till/ }));
      expect(events).toEqual([
        ['local', 'setItem', `${KEY_PREFIX}BR-NEW`, 'T-001'],
        ['reload', { [`${KEY_PREFIX}BR-NEW`]: 'T-001' }],
        ['session', 'getItem', 'activeBranchId'],
        ['local', 'setItem', `${KEY_PREFIX}BR-SESSION`, 'T-001'],
        ['reload', { [`${KEY_PREFIX}BR-NEW`]: 'T-001', [`${KEY_PREFIX}BR-SESSION`]: 'T-001' }],
      ]);
    });

    it('a row click does not dismiss: the owner state is untouched', async () => {
      const { Harness } = makeHarness(Subject);
      render(<Harness initialBlock={BLOCK} />);
      await userEvent.click(screen.getByRole('button', { name: /^Counter · T-002/ }));
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(HEADING);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PreviousBusinessDayBlockOverlay (child surface)', () => {
  it('always renders when mounted — it has no visibility guard of its own', () => {
    const { container } = render(<PreviousBusinessDayBlockOverlay block={{}} onDismiss={() => {}} onSelectSession={() => {}} />);
    expect(backdrop(container).className).toBe(BACKDROP_CLASS);
    expect(header(container).children[2].textContent).toBe(subtitle(''));
    expect(rows(container)).toHaveLength(0);
  });

  it('hands onDismiss straight to the button: one call per click, receiving the click event', async () => {
    const onDismiss = vi.fn();
    const onSelectSession = vi.fn();
    render(<PreviousBusinessDayBlockOverlay block={BLOCK} onDismiss={onDismiss} onSelectSession={onSelectSession} />);
    await userEvent.click(dismissButton());
    await userEvent.click(dismissButton());
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onDismiss.mock.calls[0]).toHaveLength(1);
    expect(onDismiss.mock.calls[0][0]).toHaveProperty('type', 'click');
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('calls onSelectSession with exactly the clicked session object and nothing else', async () => {
    const onDismiss = vi.fn();
    const onSelectSession = vi.fn();
    const { container } = render(<PreviousBusinessDayBlockOverlay block={BLOCK} onDismiss={onDismiss} onSelectSession={onSelectSession} />);
    await userEvent.click(rows(container)[1]);
    await userEvent.click(rows(container)[2].children[2]);
    expect(onSelectSession).toHaveBeenCalledTimes(2);
    expect(onSelectSession.mock.calls[0]).toHaveLength(1);
    expect(onSelectSession.mock.calls[0][0]).toBe(SESSIONS[1]);
    expect(onSelectSession.mock.calls[1][0]).toBe(SESSIONS[2]);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('owns no storage or reload behaviour of its own', async () => {
    seed(sessionStorage, { activeBranchId: 'BR-SESSION' });
    const { container } = render(<PreviousBusinessDayBlockOverlay block={{ ...BLOCK, branchId: undefined }} onDismiss={vi.fn()} onSelectSession={vi.fn()} />);
    await userEvent.click(rows(container)[0]);
    await userEvent.click(dismissButton());
    expect(events).toEqual([]);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('formats openedAt itself from the raw value it receives', () => {
    render(<PreviousBusinessDayBlockOverlay block={BLOCK} onDismiss={vi.fn()} onSelectSession={vi.fn()} />);
    expect(localeCalls).toEqual([
      { iso: 'LOCALE[2026-09-10T18:45:00.000Z]', args: [] },
      { iso: 'LOCALE[2026-09-10T09:05:00.000Z]', args: [] },
    ]);
  });
});

describe('PreviousBusinessDayBlockOverlay DOM parity', () => {
  const renderedHtml = (Block, props) => {
    const { container } = render(<Block dismissOpenSessionsBlock={() => {}} {...props} />);
    const html = container.innerHTML;
    cleanup();
    return html;
  };
  const INPUTS = [
    ['null', null],
    ['undefined', undefined],
    ['false', false],
    ['empty string', ''],
    ['0', 0],
    ['an empty object', {}],
    ['the representative block', BLOCK],
    ['reversed sessions', { ...BLOCK, openSessions: [...SESSIONS].reverse() }],
    ['null openSessions', { ...BLOCK, openSessions: null }],
    ['a single sparse session', { currentBusinessDate: null, openSessions: [{ sessionId: 'x' }] }],
    ['edge openedAt values', {
      currentBusinessDate: 20260910,
      openSessions: [
        { sessionId: 'a', terminalId: 0, openedAt: 'not-a-date' },
        { sessionId: 'b', counterName: 'C', terminalName: '', terminalId: 'T', openedBy: 7, openedAt: 0 },
        { sessionId: 'c', openedAt: '2026-09-10' },
        { sessionId: 'd', openedAt: true },
      ],
    }],
  ];

  it.each(INPUTS)('renders identical DOM to the pre-extraction block when openSessionsBlock is %s', (_name, value) => {
    const original = renderedHtml(OriginalPreviousBusinessDayBlock, { openSessionsBlock: value });
    const extracted = renderedHtml(ExtractedPreviousBusinessDayBlock, { openSessionsBlock: value });
    expect(extracted).toBe(original);
  });

  it.each([
    ['the host default locale', () => Date.prototype.toLocaleString.mockRestore()],
    ['a pinned en-US / UTC locale', () => Date.prototype.toLocaleString.mockImplementation(function pinned() {
      return realToLocaleString.call(this, 'en-US', { timeZone: 'UTC' });
    })],
  ])('renders identical DOM with real date formatting under %s', (_name, configure) => {
    configure();
    const original = renderedHtml(OriginalPreviousBusinessDayBlock, { openSessionsBlock: BLOCK });
    const extracted = renderedHtml(ExtractedPreviousBusinessDayBlock, { openSessionsBlock: BLOCK });
    expect(original).not.toContain('LOCALE[');
    expect(extracted).toBe(original);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the guard and the deep-link handler stay in POSSales, the markup moved out, and R6 keeps
 * its DOM position between BusinessDayStatusBanner and the session discovery dialog — is
 * asserted against its source.
 */
describe('POSSales wiring (PreviousBusinessDayBlockOverlay boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');
  const CHILD = read('../features/session/PreviousBusinessDayBlockOverlay.jsx');
  const USE_POS_SESSION = read('../features/session/usePosSession.js');
  const KEY_SOURCE = "`billbull:pos:terminal_id:${openSessionsBlock.branchId || sessionStorage.getItem('activeBranchId') || 'default'}`";

  it('keeps the guard and the verbatim deep-link handler in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      {openSessionsBlock && (',
        '        <PreviousBusinessDayBlockOverlay',
        '          block={openSessionsBlock}',
        '          onDismiss={dismissOpenSessionsBlock}',
        '          onSelectSession={(s) => {',
        '            // Deep-link a supervisor to the terminal that owns this session.',
        '            localStorage.setItem(',
        `              ${KEY_SOURCE},`,
        '              s.terminalId',
        '            );',
        '            window.location.reload();',
        '          }}',
        '        />',
        '      )}',
      ].join('\n'),
    );
  });

  it('sits directly after BusinessDayStatusBanner and directly before the session discovery dialog', () => {
    expect(POS_SALES).toMatch(
      /\n {6}<BusinessDayStatusBanner\n {8}openSession=\{currentSession\}\n {8}currentTerminalId=\{currentTerminal\?\.terminalId\}\n {8}onCloseSession=\{handleTradingEndedCloseSession\}\n {8}onOpenDayClose=\{handleTradingEndedOpenDayClose\}\n {8}closureFlowActive=\{businessDayClosureFlowActive\}\n {6}\/>\n\n {6}\{\/\* ─── PREVIOUS BUSINESS DATE STILL OPEN \(BLOCKS POS ENTRY\) ─── \*\/\}\n {6}\{openSessionsBlock && \(\n {8}<PreviousBusinessDayBlockOverlay\n[^<]*?\n {8}\/>\n {6}\)\}\n\n {6}\{\/\* ─── SESSION ROAMING DISCOVERY DIALOG \(Phase 11\) ─── \*\/\}\n {6}\{discoveryResponse && \(\(\) => \{\n {8}const dr = discoveryResponse;\n/,
    );
  });

  it('keeps the root-level overlay order: handover, banner, R6, discovery', () => {
    const at = (needle) => {
      const i = POS_SALES.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      '      {terminalLockedBy && (\n        <div className="fixed inset-0 z-[500]',
      '      <BusinessDayStatusBanner\n',
      '      {openSessionsBlock && (\n        <PreviousBusinessDayBlockOverlay\n',
      '      {discoveryResponse && (() => {\n',
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(HEADING);
    expect(POS_SALES).not.toContain(EXPLANATION);
    expect(POS_SALES).not.toContain('still has open session(s) past operating hours');
    expect(POS_SALES).not.toContain('from-amber-500 to-orange-600 p-5 sm:p-8');
    expect(POS_SALES).not.toContain('new Date(s.openedAt).toLocaleString()');
    expect(POS_SALES).not.toContain('openSessionsBlock.openSessions');
    expect(POS_SALES).not.toContain('openSessionsBlock.currentBusinessDate');
  });

  it('keeps the storage-key logic single, unchanged and uncentralised', () => {
    expect(POS_SALES.split(KEY_SOURCE)).toHaveLength(2);
    expect(POS_SALES.match(/billbull:pos:terminal_id:\$\{/g)).toHaveLength(1);
    // usePosSession keeps its own independent key construction.
    expect(USE_POS_SESSION).toContain('const terminalIdKey = `billbull:pos:terminal_id:${activeBranchId}`;');
    // The terminal-handover overlay stays inline and untouched.
    expect(POS_SALES).toContain('Register as New Terminal (Different Device)');
    expect(POS_SALES).toContain('<h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">Terminal in Active Use</h2>');
  });

  it('keeps callback, storage and state ownership out of the child', () => {
    const code = CHILD.replace(/^\s*\/\/.*$/gm, '');
    for (const token of ['localStorage', 'sessionStorage', 'location', 'reload', 'terminal_id', 'activeBranchId', "'default'", 'openSessionsBlock', 'dismissOpenSessionsBlock']) {
      expect(code, token).not.toContain(token);
    }
    expect(code).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(code).not.toMatch(/useContext|createContext|React\.memo|\bmemo\(/);
    expect(code).not.toMatch(/@radix-ui|components\/ui\/|createPortal/);
    expect(CHILD).toContain('function PreviousBusinessDayBlockOverlay({ block, onDismiss, onSelectSession }) {');
    expect(CHILD).toContain('onClick={onDismiss}');
    expect(CHILD).toContain('onClick={() => onSelectSession(s)}');
    expect(CHILD).toContain("{s.openedAt ? new Date(s.openedAt).toLocaleString() : '—'}");
    expect(CHILD).toContain('{(block.openSessions || []).map((s) => (');
    expect(CHILD).toContain('Business date {block.currentBusinessDate} still has open session(s) past operating hours.');
  });

  it('imports and renders PreviousBusinessDayBlockOverlay exactly once', () => {
    expect(POS_SALES).toContain("import PreviousBusinessDayBlockOverlay from './POS/features/session/PreviousBusinessDayBlockOverlay';");
    expect(POS_SALES.match(/<PreviousBusinessDayBlockOverlay\b/g)).toHaveLength(1);
  });
});
