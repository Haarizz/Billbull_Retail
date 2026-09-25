import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertCircle } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TerminalUnavailableOverlay from '../features/session/TerminalUnavailableOverlay';
import { resolveTerminalUnavailableConfig } from '../features/terminal/terminalUnavailable';

// Pinned verbatim from the POSSales.jsx R1 terminal-registration overlay before extraction.
const SUBTITLE = 'This device cannot register a session until this is resolved';
const CONTACT_ADMIN = 'Contact Administrator';
const REGISTER_LABEL = 'Register as New Terminal';
const CONFIRM_MESSAGE = 'This will assign a new independent terminal to this device.\n\nContinue?';

const BACKDROP_CLASS = 'fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4';
const PANEL_CLASS = 'bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto';
const HEADER_CLASS = 'bg-gradient-to-r from-amber-600 to-orange-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl';
const ICON_WRAP_CLASS = 'w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner';
const HEADING_CLASS = 'text-lg sm:text-2xl font-black tracking-tight mb-1';
const SUBTITLE_CLASS = 'text-white/80 text-xs sm:text-sm font-medium';
const BODY_CLASS = 'p-4 sm:p-8 space-y-4 sm:space-y-6';
const MESSAGE_CLASS = 'bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-sm text-slate-700';
const HINT_CLASS = 'text-xs text-slate-500 leading-relaxed';
const REGISTER_BUTTON_CLASS = 'w-full py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm transition-all shadow-md';
const CONTACT_ADMIN_CLASS = 'w-full py-3 sm:py-3.5 rounded-2xl bg-slate-100 text-slate-500 font-semibold text-sm text-center border border-slate-200';

// Per-status copy, pinned literally (not read from TERMINAL_UNAVAILABLE_STATUS_CONFIG) so a
// config edit shows up here as a behaviour change.
const FALLBACK = {
  title: 'Terminal Not Available',
  message: 'This device\'s previously-registered terminal was archived, blocked, decommissioned, or is in maintenance.',
  hint: 'Ask an admin to restore it from Console > Terminals & Counters, or register this device as a brand-new terminal below (consumes a new terminal slot).',
  registerLabel: REGISTER_LABEL,
};
const VARIANTS = [
  ['ARCHIVED', 'Terminal is ARCHIVED', {
    title: 'Terminal Archived',
    message: 'This terminal has been archived by an administrator. It can be restored — your sales history and settings will be preserved — or you can register this device as a new terminal.',
    hint: 'Ask an admin to restore it from Console > Terminals & Counters if you\'d rather keep this device\'s history than register fresh.',
    registerLabel: REGISTER_LABEL,
  }],
  ['BLOCKED', 'Terminal is BLOCKED', {
    title: 'Terminal Blocked',
    message: 'This terminal has been blocked by an administrator. Registering a new terminal is not available while a block is in effect.',
    hint: 'Contact an administrator to resolve this before using this device.',
    registerLabel: null,
  }],
  ['MAINTENANCE', 'Terminal is MAINTENANCE', {
    title: 'Terminal Under Maintenance',
    message: 'This terminal is temporarily unavailable for maintenance. Registering a new terminal is not available until maintenance ends.',
    hint: 'Try again shortly, or contact an administrator.',
    registerLabel: null,
  }],
  ['DECOMMISSIONED', 'Terminal is DECOMMISSIONED', {
    title: 'Terminal Permanently Retired',
    message: 'This terminal has been permanently retired and cannot be restored. Register this device as a new terminal to continue.',
    hint: null,
    registerLabel: REGISTER_LABEL,
  }],
];
// Anything that is not exactly "Terminal is {KNOWN_STATUS}" resolves to the fallback.
const FALLBACK_REASONS = [
  ['an unrelated message', 'Terminal not found'],
  ['an unknown status', 'Terminal is RETIRED'],
  ['a lowercase status', 'Terminal is archived'],
  ['a lowercase prefix', 'terminal is ARCHIVED'],
  ['a trailing period', 'Terminal is ARCHIVED.'],
  ['a leading space', ' Terminal is ARCHIVED'],
  ['a trailing newline', 'Terminal is ARCHIVED\n'],
  ['a two-word status', 'Terminal is ARCHIVED NOW'],
  ['true', true],
  ['a non-zero number', 403],
  ['an object', { status: 'ARCHIVED', message: 'Terminal is ARCHIVED' }],
];

/**
 * The original R1 block, copied from POSSales.jsx before extraction, including its
 * `terminalRegistrationError &&` guard, the IIFE and the inline register-new handler.
 * The POSSales-owned value arrives as a prop with its POSSales name; nothing else is changed.
 */
function OriginalTerminalUnavailableBlock({ terminalRegistrationError }) {
  return (
    <>
      {terminalRegistrationError && (() => {
        const cfg = resolveTerminalUnavailableConfig(terminalRegistrationError);
        return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner">
                <AlertCircle className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">{cfg.title}</h2>
              <p className="text-white/80 text-xs sm:text-sm font-medium">This device cannot register a session until this is resolved</p>
            </div>
            <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-sm text-slate-700">
                {cfg.message}
              </div>
              {cfg.hint && (
                <p className="text-xs text-slate-500 leading-relaxed">{cfg.hint}</p>
              )}
              {cfg.allowRegisterNew ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('This will assign a new independent terminal to this device.\n\nContinue?')) {
                      localStorage.removeItem('billbull:pos:device_fingerprint');
                      Object.keys(localStorage)
                        .filter(k => k.startsWith('billbull:pos:terminal_id'))
                        .forEach(k => localStorage.removeItem(k));
                      window.location.reload();
                    }
                  }}
                  className="w-full py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm transition-all shadow-md"
                >
                  {cfg.registerLabel}
                </button>
              ) : (
                <div className="w-full py-3 sm:py-3.5 rounded-2xl bg-slate-100 text-slate-500 font-semibold text-sm text-center border border-slate-200">
                  Contact Administrator
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </>
  );
}

/**
 * The post-extraction R1 block, written with the exact expressions POSSales now uses: the
 * guard and the verbatim register-new handler stay in the parent.
 */
function ExtractedTerminalUnavailableBlock({ terminalRegistrationError }) {
  return (
    <>
      {terminalRegistrationError && (
        <TerminalUnavailableOverlay
          reason={terminalRegistrationError}
          onRegisterNew={() => {
            if (window.confirm('This will assign a new independent terminal to this device.\n\nContinue?')) {
              localStorage.removeItem('billbull:pos:device_fingerprint');
              Object.keys(localStorage)
                .filter(k => k.startsWith('billbull:pos:terminal_id'))
                .forEach(k => localStorage.removeItem(k));
              window.location.reload();
            }
          }}
        />
      )}
    </>
  );
}

// Behavioural tests run against each POSSales-shaped block (same POSSales input).
const SUBJECTS = [
  ['original R1 block', OriginalTerminalUnavailableBlock],
  ['TerminalUnavailableOverlay wired like POSSales', ExtractedTerminalUnavailableBlock],
];

const backdrop = (container) => container.firstChild;
const panel = (container) => backdrop(container).firstChild;
const header = (container) => panel(container).children[0];
const body = (container) => panel(container).children[1];

// Keys the register-new handler must remove, and look-alikes it must leave alone.
const REMOVED_KEYS = [
  'billbull:pos:device_fingerprint',
  'billbull:pos:terminal_id',
  'billbull:pos:terminal_id:branch-1',
  'billbull:pos:terminal_id:branch-2',
  'billbull:pos:terminal_id_legacy',
];
const KEPT_KEYS = [
  'billbull:pos:device_fingerprint:backup',
  'billbull:pos:device_fingerprint_v2',
  'billbull:pos:terminal',
  'billbull:pos:terminalId',
  'billbull:pos:scanner:branch-1',
  'x:billbull:pos:terminal_id',
  'BILLBULL:POS:TERMINAL_ID',
  'token',
];
const seedStorage = () => {
  [...REMOVED_KEYS, ...KEPT_KEYS].forEach((k) => localStorage.setItem(k, `v:${k}`));
};
const storageSnapshot = () => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
const keptSnapshot = () => Object.fromEntries([...KEPT_KEYS].sort().map((k) => [k, `v:${k}`]));
const fullSnapshot = () => Object.fromEntries([...REMOVED_KEYS, ...KEPT_KEYS].sort().map((k) => [k, `v:${k}`]));

let confirmSpy;
let reloadSpy;
let events;

beforeEach(() => {
  localStorage.clear();
  events = [];
  confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);
  // jsdom's location.reload is non-configurable, so the whole location object is stubbed.
  reloadSpy = vi.fn(() => { events.push(['reload', storageSnapshot()]); });
  vi.stubGlobal('location', { reload: reloadSpy });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('mounting (terminalRegistrationError guard)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['false', false],
      ['empty string', ''],
    ])('renders nothing when terminalRegistrationError is %s', (_name, value) => {
      const { container } = render(<Subject terminalRegistrationError={value} />);
      expect(container.innerHTML).toBe('');
    });

    // `&&` short-circuit: a falsy number is itself rendered, the overlay is not.
    it.each([
      ['0', 0, '0'],
      ['NaN', NaN, 'NaN'],
    ])('renders the bare value and no overlay when terminalRegistrationError is %s', (_name, value, text) => {
      const { container } = render(<Subject terminalRegistrationError={value} />);
      expect(container.innerHTML).toBe(text);
    });

    it('mounts inline (no portal) while terminalRegistrationError is truthy', () => {
      const { container } = render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      expect(container.children).toHaveLength(1);
      expect(document.body.children).toHaveLength(1);
      expect(container.contains(screen.getByRole('heading', { level: 2 }))).toBe(true);
    });

    it('mounts, switches status and unmounts in place as the value changes', () => {
      const { container, rerender } = render(<Subject terminalRegistrationError={null} />);
      expect(container.innerHTML).toBe('');
      rerender(<Subject terminalRegistrationError="Terminal is BLOCKED" />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Terminal Blocked$/);
      rerender(<Subject terminalRegistrationError="Terminal is DECOMMISSIONED" />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Terminal Permanently Retired$/);
      rerender(<Subject terminalRegistrationError={null} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe.each([
    ...VARIANTS,
    ...FALLBACK_REASONS.map(([name, reason]) => [`fallback (${name})`, reason, FALLBACK]),
  ])('status %s', (_status, reason, expected) => {
    it('renders the exact heading and fixed subtitle', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading.textContent).toBe(expected.title);
      expect(heading.className).toBe(HEADING_CLASS);
      const subtitle = header(container).children[2];
      expect(subtitle.tagName).toBe('P');
      expect(subtitle.className).toBe(SUBTITLE_CLASS);
      expect(subtitle.textContent).toBe(SUBTITLE);
    });

    it('renders the exact explanatory message', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      const message = body(container).children[0];
      expect(message.tagName).toBe('DIV');
      expect(message.className).toBe(MESSAGE_CLASS);
      expect(message.textContent).toBe(expected.message);
      expect(message.children).toHaveLength(0);
    });

    it('renders the hint only when the status has one', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      const hints = body(container).querySelectorAll(':scope > p');
      if (expected.hint) {
        expect(hints).toHaveLength(1);
        expect(hints[0].className).toBe(HINT_CLASS);
        expect(hints[0].textContent).toBe(expected.hint);
        expect(body(container).children[1]).toBe(hints[0]);
      } else {
        expect(hints).toHaveLength(0);
      }
    });

    it('never renders the raw terminalRegistrationError text', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      if (typeof reason === 'string') {
        expect(container.textContent).not.toContain(reason.trim());
      }
      expect(container.textContent).not.toContain('[object Object]');
      expect(container.textContent).not.toContain('403');
    });

    it('renders the register-new button or the Contact Administrator panel, never both', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      const last = body(container).lastElementChild;
      if (expected.registerLabel) {
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(1);
        const [btn] = buttons;
        expect(last).toBe(btn);
        expect(btn.textContent).toBe(expected.registerLabel);
        expect(btn.className).toBe(REGISTER_BUTTON_CLASS);
        expect(btn).toHaveAttribute('type', 'button');
        expect(btn).not.toHaveAttribute('disabled');
        expect(btn.children).toHaveLength(0);
        expect(screen.queryByText(CONTACT_ADMIN)).toBeNull();
      } else {
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(last.tagName).toBe('DIV');
        expect(last.className).toBe(CONTACT_ADMIN_CLASS);
        expect(last.textContent).toBe(CONTACT_ADMIN);
        expect(last.children).toHaveLength(0);
        expect(screen.queryByText(REGISTER_LABEL)).toBeNull();
      }
    });

    it('keeps the body order: message, optional hint, action', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      const expectedOrder = [
        `DIV.${MESSAGE_CLASS}`,
        ...(expected.hint ? [`P.${HINT_CLASS}`] : []),
        expected.registerLabel ? `BUTTON.${REGISTER_BUTTON_CLASS}` : `DIV.${CONTACT_ADMIN_CLASS}`,
      ];
      expect(Array.from(body(container).children).map((c) => `${c.tagName}.${c.className}`)).toEqual(expectedOrder);
    });

    // Header, panel and icon do not vary by status — only copy and the action do.
    it('keeps the status-independent backdrop, panel, header and icon', () => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      expect(container.children).toHaveLength(1);
      expect(backdrop(container).tagName).toBe('DIV');
      expect(backdrop(container).className).toBe(BACKDROP_CLASS);
      expect(backdrop(container).children).toHaveLength(1);
      expect(panel(container).className).toBe(PANEL_CLASS);
      expect(Array.from(panel(container).children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        `DIV.${HEADER_CLASS}`,
        `DIV.${BODY_CLASS}`,
      ]);
      expect(Array.from(header(container).children).map((c) => c.tagName)).toEqual(['DIV', 'H2', 'P']);
      const iconWrap = header(container).children[0];
      expect(iconWrap.className).toBe(ICON_WRAP_CLASS);
      expect(iconWrap.children).toHaveLength(1);
      const svg = iconWrap.firstChild;
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg).toHaveClass('lucide-circle-alert', 'h-7', 'w-7', 'sm:h-10', 'sm:w-10', 'text-white');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('renders an identical header icon for every status', () => {
    const icons = [...VARIANTS.map(([, r]) => r), 'Terminal not found'].map((reason) => {
      const { container } = render(<Subject terminalRegistrationError={reason} />);
      const html = header(container).children[0].innerHTML;
      cleanup();
      return html;
    });
    expect(new Set(icons).size).toBe(1);
  });

  describe('no Radix / dialog semantics', () => {
    it('has no dialog role, aria-modal, aria labelling, tabindex or data-state', () => {
      const { container } = render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      for (const el of container.querySelectorAll('*')) {
        for (const attr of ['role', 'aria-modal', 'aria-labelledby', 'aria-describedby', 'tabindex', 'data-state', 'data-slot']) {
          expect(el.hasAttribute(attr), `${el.tagName} ${attr}`).toBe(false);
        }
      }
    });

    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['a click on the backdrop', async (container) => userEvent.click(backdrop(container))],
      ['a click on the header', async (container) => userEvent.click(header(container))],
      ['a click on the message', async (container) => userEvent.click(body(container).children[0])],
    ])('%s does nothing: no confirm, no storage change, no reload, stays mounted', async (_name, trigger) => {
      seedStorage();
      const { container } = render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      await trigger(container);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(storageSnapshot()).toEqual(fullSnapshot());
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('Contact Administrator is inert for statuses without register-new', async () => {
      seedStorage();
      render(<Subject terminalRegistrationError="Terminal is BLOCKED" />);
      await userEvent.click(screen.getByText(CONTACT_ADMIN));
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(storageSnapshot()).toEqual(fullSnapshot());
    });
  });

  describe('register-new handler', () => {
    it.each([
      ['ARCHIVED', 'Terminal is ARCHIVED'],
      ['DECOMMISSIONED', 'Terminal is DECOMMISSIONED'],
      ['fallback', 'Terminal not found'],
    ])('%s: asks window.confirm once with the exact message', async (_name, reason) => {
      render(<Subject terminalRegistrationError={reason} />);
      await userEvent.click(screen.getByRole('button', { name: REGISTER_LABEL }));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledWith(CONFIRM_MESSAGE);
      expect(confirmSpy.mock.calls[0]).toHaveLength(1);
    });

    it('on cancel: removes nothing and does not reload', async () => {
      seedStorage();
      confirmSpy.mockImplementation(() => false);
      render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      await userEvent.click(screen.getByRole('button', { name: REGISTER_LABEL }));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(storageSnapshot()).toEqual(fullSnapshot());
      expect(screen.getByRole('button', { name: REGISTER_LABEL })).toBeInTheDocument();
    });

    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['0', 0],
      ['null', null],
    ])('treats a falsy confirm result (%s) as cancel', async (_name, value) => {
      seedStorage();
      confirmSpy.mockImplementation(() => value);
      render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      await userEvent.click(screen.getByRole('button', { name: REGISTER_LABEL }));
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(storageSnapshot()).toEqual(fullSnapshot());
    });

    it('on confirm: removes exactly the fingerprint and terminal_id* keys, then reloads once', async () => {
      seedStorage();
      confirmSpy.mockImplementation(() => { events.push(['confirm', storageSnapshot()]); return true; });
      render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      await userEvent.click(screen.getByRole('button', { name: REGISTER_LABEL }));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(reloadSpy.mock.calls[0]).toHaveLength(0);
      // Confirm sees untouched storage; reload happens only after every removal.
      expect(events).toEqual([
        ['confirm', fullSnapshot()],
        ['reload', keptSnapshot()],
      ]);
      expect(storageSnapshot()).toEqual(keptSnapshot());
    });

    it('on confirm with no matching keys: still reloads and leaves other keys alone', async () => {
      localStorage.setItem('token', 'abc');
      confirmSpy.mockImplementation(() => true);
      render(<Subject terminalRegistrationError="Terminal is DECOMMISSIONED" />);
      await userEvent.click(screen.getByRole('button', { name: REGISTER_LABEL }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(storageSnapshot()).toEqual({ token: 'abc' });
    });

    it('asks again on every click (no latch)', async () => {
      render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      const btn = screen.getByRole('button', { name: REGISTER_LABEL });
      await userEvent.click(btn);
      await userEvent.click(btn);
      expect(confirmSpy).toHaveBeenCalledTimes(2);
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('does not remove anything or reload on render alone', () => {
      seedStorage();
      render(<Subject terminalRegistrationError="Terminal is ARCHIVED" />);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(storageSnapshot()).toEqual(fullSnapshot());
    });
  });
});

describe('TerminalUnavailableOverlay (child surface)', () => {
  it('always renders when mounted — it has no visibility guard of its own', () => {
    const { container } = render(<TerminalUnavailableOverlay reason={null} onRegisterNew={() => {}} />);
    expect(backdrop(container).className).toBe(BACKDROP_CLASS);
    // A falsy reason resolves to the fallback copy inside the child.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(FALLBACK.title);
  });

  it('hands onRegisterNew straight to the button: one call per click, receiving the click event', async () => {
    const onRegisterNew = vi.fn();
    render(<TerminalUnavailableOverlay reason="Terminal is ARCHIVED" onRegisterNew={onRegisterNew} />);
    const btn = screen.getByRole('button', { name: REGISTER_LABEL });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(onRegisterNew).toHaveBeenCalledTimes(2);
    expect(onRegisterNew.mock.calls[0][0]).toHaveProperty('type', 'click');
  });

  it('owns no confirm, storage or reload behaviour of its own', async () => {
    seedStorage();
    const onRegisterNew = vi.fn();
    render(<TerminalUnavailableOverlay reason="Terminal is ARCHIVED" onRegisterNew={onRegisterNew} />);
    await userEvent.click(screen.getByRole('button', { name: REGISTER_LABEL }));
    expect(onRegisterNew).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(storageSnapshot()).toEqual(fullSnapshot());
  });

  it.each([
    ['BLOCKED', 'Terminal is BLOCKED'],
    ['MAINTENANCE', 'Terminal is MAINTENANCE'],
  ])('%s: renders no button, so never calls onRegisterNew', async (_name, reason) => {
    const onRegisterNew = vi.fn();
    render(<TerminalUnavailableOverlay reason={reason} onRegisterNew={onRegisterNew} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await userEvent.click(screen.getByText(CONTACT_ADMIN));
    expect(onRegisterNew).not.toHaveBeenCalled();
  });
});

describe('TerminalUnavailableOverlay DOM parity', () => {
  const renderedHtml = (Block, props) => {
    const { container } = render(<Block {...props} />);
    const html = container.innerHTML;
    cleanup();
    return html;
  };

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['false', false],
    ['empty string', ''],
    ['0', 0],
    ...VARIANTS.map(([status, reason]) => [status, reason]),
    ...FALLBACK_REASONS.map(([name, reason]) => [`fallback (${name})`, reason]),
  ])('renders identical DOM to the pre-extraction block when terminalRegistrationError is %s', (_name, value) => {
    const original = renderedHtml(OriginalTerminalUnavailableBlock, { terminalRegistrationError: value });
    const extracted = renderedHtml(ExtractedTerminalUnavailableBlock, { terminalRegistrationError: value });
    expect(extracted).toBe(original);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the guard and the register-new handler stay in POSSales, the markup moved out, and R1 keeps
 * its DOM position — is asserted against its source.
 */
describe('POSSales wiring (TerminalUnavailableOverlay boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');
  const CHILD = read('../features/session/TerminalUnavailableOverlay.jsx');
  // As written in JSX source: the confirm message's `\n\n` is a literal escape sequence.
  const CONFIRM_SOURCE = "window.confirm('This will assign a new independent terminal to this device.\\n\\nContinue?')";

  it('keeps the guard and the verbatim register-new handler in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      {terminalRegistrationError && (',
        '        <TerminalUnavailableOverlay',
        '          reason={terminalRegistrationError}',
        '          onRegisterNew={() => {',
        `            if (${CONFIRM_SOURCE}) {`,
        "              localStorage.removeItem('billbull:pos:device_fingerprint');",
        '              Object.keys(localStorage)',
        "                .filter(k => k.startsWith('billbull:pos:terminal_id'))",
        '                .forEach(k => localStorage.removeItem(k));',
        '              window.location.reload();',
        '            }',
        '          }}',
        '        />',
        '      )}',
      ].join('\n'),
    );
  });

  it('sits first inside the root div, after BusinessDayStatusProvider opens and before IdleLockOverlay', () => {
    expect(POS_SALES).toMatch(
      /\n {4}<BusinessDayStatusProvider terminalId=\{currentTerminal\?\.terminalId\} refreshRef=\{businessDayRefreshRef\}>\n {4}<div className=\{currentView === 'touch-screen' \? 'h-screen overflow-hidden bg-\[#F7F7FA\]' : 'min-h-screen bg-\[#F7F7FA\]'\}>\n {6}\{\/\* ─── TERMINAL REGISTRATION REJECTED \(archived \/ blocked \/ decommissioned \/ maintenance\) ─── \*\/\}\n {6}\{terminalRegistrationError && \(\n {8}<TerminalUnavailableOverlay\n[^<]*?\n {8}\/>\n {6}\)\}\n\n {6}\{\/\* ─── IDLE LOCK OVERLAY ─── \*\/\}\n {6}\{isIdleLocked && \(\n {8}<IdleLockOverlay\n[^<]*?\n {6}\{\/\* ─── SUPERVISOR TAKEOVER DIALOG ─── \*\/\}\n {6}\{showTakeoverDialog && currentSession\?\.id && \(\n {8}<SupervisorTakeoverDialog\n/,
    );
  });

  it('no longer contains the moved markup or the IIFE', () => {
    expect(POS_SALES).not.toContain(SUBTITLE);
    expect(POS_SALES).not.toContain(CONTACT_ADMIN);
    expect(POS_SALES).not.toContain('from-amber-600 to-orange-600 p-5 sm:p-8');
    expect(POS_SALES).not.toContain('resolveTerminalUnavailableConfig');
    expect(POS_SALES).not.toMatch(/terminalRegistrationError && \(\(\) => \{/);
  });

  it('leaves the duplicated handler in the terminal-handover overlay untouched', () => {
    expect(POS_SALES).toContain(
      [
        '                  onClick={() => {',
        `                    if (${CONFIRM_SOURCE}) {`,
        "                      localStorage.removeItem('billbull:pos:device_fingerprint');",
        '                      // Clear every branch-scoped terminal_id cached on this device, not just the',
        "                      // active branch's, so no stale pointer survives the fingerprint reset.",
        '                      Object.keys(localStorage)',
        "                        .filter(k => k.startsWith('billbull:pos:terminal_id'))",
        '                        .forEach(k => localStorage.removeItem(k));',
        '                      window.location.reload();',
        '                    }',
        '                  }}',
        '                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-semibold text-xs hover:bg-slate-50 hover:text-slate-700 transition-all"',
        '                >',
        '                  Register as New Terminal (Different Device)',
      ].join('\n'),
    );
    // Exactly two copies: R1's (now passed as onRegisterNew) and the handover overlay's.
    expect(POS_SALES.split(CONFIRM_SOURCE)).toHaveLength(3);
  });

  it('keeps callback and state ownership out of the child', () => {
    const code = CHILD.replace(/^\s*\/\/.*$/gm, '');
    for (const token of ['window.confirm', 'localStorage', 'location', 'reload', 'terminalRegistrationError']) {
      expect(code, token).not.toContain(token);
    }
    expect(code).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(code).not.toMatch(/useContext|createContext|React\.memo|\bmemo\(/);
    expect(code).not.toMatch(/@radix-ui|components\/ui\//);
    expect(CHILD).toContain('function TerminalUnavailableOverlay({ reason, onRegisterNew }) {');
    expect(CHILD).toContain('const cfg = resolveTerminalUnavailableConfig(reason);');
    expect(CHILD).toContain('onClick={onRegisterNew}');
  });

  it('renders TerminalUnavailableOverlay exactly once', () => {
    expect(POS_SALES.match(/<TerminalUnavailableOverlay\b/g)).toHaveLength(1);
  });
});
