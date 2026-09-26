import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertTriangle } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import SessionOwnerRequiredDialog from '../features/session/SessionOwnerRequiredDialog';

// Pinned verbatim from the POSSales.jsx R13 session owner required dialog before extraction.
const HEADING = 'Session Owner Required';
const BODY = 'This session can only be closed normally by the cashier who opened it.';
const FORCE_CLOSE_HINT = 'To close this session as a supervisor, please use the Force Close option from the menu.';
const CLOSE_LABEL = 'Close';
const CLOSE_BUTTON_CLASS = 'w-full bg-slate-800 hover:bg-slate-700 text-white';

/**
 * The original R13 block, copied from POSSales.jsx before extraction, including its
 * `showSessionOwnerRequiredDialog &&` guard. POSSales-owned values arrive as props with their
 * POSSales names; nothing else is changed.
 */
function OriginalSessionOwnerRequiredBlock({
  showSessionOwnerRequiredDialog, setShowSessionOwnerRequiredDialog, sessionToClose, currentSession,
}) {
  return (
    <>
      {showSessionOwnerRequiredDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-base font-bold text-white">Session Owner Required</h2>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-600">
              <p>
                This session can only be closed normally by the cashier who opened it.
              </p>

              {(() => {
                const tgt = sessionToClose || currentSession;
                if (!tgt) return null;
                return (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-500">Terminal:</span> <span className="font-semibold text-slate-800">{tgt.terminalName || tgt.terminalId}</span></div>
                    <div><span className="text-slate-500">Session:</span> <span className="font-semibold text-slate-800">{tgt.sessionNo || (tgt.id ? `SESS-${tgt.id}` : '—')}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Cashier:</span> <span className="font-semibold text-slate-800">{tgt.cashier || tgt.openedBy || tgt.userId || '—'}</span></div>
                  </div>
                );
              })()}

              <p className="text-xs">
                To close this session as a supervisor, please use the <strong>Force Close</strong> option from the menu.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <Button
                variant="default"
                className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                onClick={() => setShowSessionOwnerRequiredDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The post-extraction R13 block, written with the exact expressions POSSales now uses: the
 * guard, the `sessionToClose || currentSession` fallback and the close call stay in the parent.
 */
function ExtractedSessionOwnerRequiredBlock({
  showSessionOwnerRequiredDialog, setShowSessionOwnerRequiredDialog, sessionToClose, currentSession,
}) {
  return (
    <>
      {showSessionOwnerRequiredDialog && (
        <SessionOwnerRequiredDialog
          targetSession={sessionToClose || currentSession}
          onClose={() => setShowSessionOwnerRequiredDialog(false)}
        />
      )}
    </>
  );
}

// Behavioural tests run against each POSSales-shaped block (same POSSales inputs).
const SUBJECTS = [
  ['original R13 block', OriginalSessionOwnerRequiredBlock],
  ['SessionOwnerRequiredDialog wired like POSSales', ExtractedSessionOwnerRequiredBlock],
];

const noop = () => {};

const CURRENT = { id: 1, sessionNo: 'SESS-0001', terminalName: 'Till 1', terminalId: 'T-1', cashier: 'Alice' };
const OTHER = { id: 2, sessionNo: 'SESS-0002', terminalName: 'Till 2', terminalId: 'T-2', cashier: 'Bob' };

/** Inputs exactly as POSSales holds them. */
function inputs(overrides = {}) {
  return {
    showSessionOwnerRequiredDialog: true,
    setShowSessionOwnerRequiredDialog: noop,
    sessionToClose: null,
    currentSession: CURRENT,
    ...overrides,
  };
}

const backdrop = (container) => container.firstChild;
const panel = (container) => backdrop(container).firstChild;
const header = (container) => panel(container).children[0];
const body = (container) => panel(container).children[1];
const footer = (container) => panel(container).children[2];
const infoGrid = (container) => body(container).querySelector('.bg-slate-50.grid');
const infoValues = (container) => Array.from(infoGrid(container).children).map((cell) => [
  cell.children[0].textContent, cell.children[1].textContent,
]);

afterEach(() => {
  cleanup();
});

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('mounting', () => {
    it('is conditionally mounted: renders nothing when showSessionOwnerRequiredDialog is false', () => {
      const { container } = render(<Subject {...inputs({ showSessionOwnerRequiredDialog: false })} />);
      expect(container.innerHTML).toBe('');
      expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    });

    it('mounts inline (no portal) when showSessionOwnerRequiredDialog is true', () => {
      const { container } = render(<Subject {...inputs()} />);
      expect(container.contains(screen.getByText(HEADING))).toBe(true);
    });

    it('mounts and unmounts in place as the flag flips', () => {
      const { container, rerender } = render(<Subject {...inputs({ showSessionOwnerRequiredDialog: false })} />);
      expect(container.innerHTML).toBe('');
      rerender(<Subject {...inputs()} />);
      expect(screen.getByText(HEADING)).toBeInTheDocument();
      rerender(<Subject {...inputs({ showSessionOwnerRequiredDialog: false })} />);
      expect(container.innerHTML).toBe('');
    });

    it('still mounts (without session info) when both sessionToClose and currentSession are null', () => {
      const { container } = render(<Subject {...inputs({ currentSession: null })} />);
      expect(screen.getByText(HEADING)).toBeInTheDocument();
      expect(infoGrid(container)).toBeNull();
    });
  });

  describe('heading and text', () => {
    it('renders the exact heading', () => {
      render(<Subject {...inputs()} />);
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(new RegExp(`^${HEADING}$`));
      expect(heading.className).toBe('text-base font-bold text-white');
    });

    it('renders the exact explanatory paragraph and Force Close hint', () => {
      const { container } = render(<Subject {...inputs()} />);
      const paragraphs = body(container).querySelectorAll(':scope > p');
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0].textContent.trim()).toBe(BODY);
      expect(paragraphs[0].className).toBe('');
      expect(paragraphs[1].textContent.trim()).toBe(FORCE_CLOSE_HINT);
      expect(paragraphs[1].className).toBe('text-xs');
      const strong = paragraphs[1].querySelector('strong');
      expect(strong.textContent).toBe('Force Close');
      expect(paragraphs[1].children).toHaveLength(1);
    });
  });

  describe('target session: sessionToClose || currentSession', () => {
    it('shows currentSession when sessionToClose is null', () => {
      const { container } = render(<Subject {...inputs()} />);
      expect(infoValues(container)).toEqual([
        ['Terminal:', 'Till 1'],
        ['Session:', 'SESS-0001'],
        ['Cashier:', 'Alice'],
      ]);
    });

    it('prefers sessionToClose over currentSession', () => {
      const { container } = render(<Subject {...inputs({ sessionToClose: OTHER })} />);
      expect(infoValues(container)).toEqual([
        ['Terminal:', 'Till 2'],
        ['Session:', 'SESS-0002'],
        ['Cashier:', 'Bob'],
      ]);
    });

    it('shows sessionToClose when currentSession is null', () => {
      const { container } = render(<Subject {...inputs({ sessionToClose: OTHER, currentSession: null })} />);
      expect(infoValues(container)[1]).toEqual(['Session:', 'SESS-0002']);
    });

    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['0', 0],
      ['false', false],
    ])('falls through a falsy sessionToClose (%s) to currentSession', (_name, value) => {
      const { container } = render(<Subject {...inputs({ sessionToClose: value })} />);
      expect(infoValues(container)[0]).toEqual(['Terminal:', 'Till 1']);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['0', 0],
      ['empty string', ''],
    ])('renders no info block and no stray text when both resolve falsy (currentSession %s)', (_name, value) => {
      const { container } = render(<Subject {...inputs({ currentSession: value })} />);
      expect(infoGrid(container)).toBeNull();
      expect(Array.from(body(container).children).map((c) => c.tagName)).toEqual(['P', 'P']);
      // JSX drops the inter-element whitespace, so the two paragraphs abut with no separator.
      expect(body(container).textContent).toBe(`${BODY}${FORCE_CLOSE_HINT}`);
    });

    // An empty object is truthy, so the block renders with fallback labels.
    it('renders the info block for an empty object with fallbacks', () => {
      const { container } = render(<Subject {...inputs({ currentSession: {} })} />);
      expect(infoValues(container)).toEqual([
        ['Terminal:', ''],
        ['Session:', '—'],
        ['Cashier:', '—'],
      ]);
    });

    it.each([
      ['terminalName preferred', { terminalName: 'N', terminalId: 'I' }, 'N'],
      ['terminalId when terminalName empty', { terminalName: '', terminalId: 'I' }, 'I'],
      ['terminalId when terminalName missing', { terminalId: 42 }, '42'],
    ])('Terminal: %s', (_name, session, expected) => {
      const { container } = render(<Subject {...inputs({ currentSession: session })} />);
      expect(infoValues(container)[0][1]).toBe(expected);
    });

    it.each([
      ['sessionNo preferred', { sessionNo: 'S-9', id: 9 }, 'S-9'],
      ['SESS-id when sessionNo missing', { id: 9 }, 'SESS-9'],
      ['SESS-id when sessionNo empty', { sessionNo: '', id: 9 }, 'SESS-9'],
      ['em dash when id is 0', { id: 0 }, '—'],
      ['em dash when neither', { terminalName: 'x' }, '—'],
    ])('Session: %s', (_name, session, expected) => {
      const { container } = render(<Subject {...inputs({ currentSession: session })} />);
      expect(infoValues(container)[1][1]).toBe(expected);
    });

    it.each([
      ['cashier preferred', { cashier: 'C', openedBy: 'O', userId: 'U' }, 'C'],
      ['openedBy next', { cashier: '', openedBy: 'O', userId: 'U' }, 'O'],
      ['userId last', { openedBy: null, userId: 7 }, '7'],
      ['em dash when none', { userId: 0 }, '—'],
    ])('Cashier: %s', (_name, session, expected) => {
      const { container } = render(<Subject {...inputs({ currentSession: session })} />);
      expect(infoValues(container)[2][1]).toBe(expected);
    });

    // Counter is not shown here (unlike the Cashier Auth dialog).
    it('shows only Terminal, Session and Cashier — no Counter', () => {
      const { container } = render(<Subject {...inputs({ currentSession: { ...CURRENT, counterName: 'Counter A' } })} />);
      expect(infoGrid(container).children).toHaveLength(3);
      expect(infoGrid(container).textContent).not.toContain('Counter');
    });
  });

  describe('structure, classes, icon and accessibility', () => {
    it('keeps the backdrop, panel and three sections', () => {
      const { container } = render(<Subject {...inputs()} />);
      expect(container.children).toHaveLength(1);
      expect(backdrop(container).tagName).toBe('DIV');
      expect(backdrop(container).className).toBe('fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4');
      expect(backdrop(container).children).toHaveLength(1);
      expect(panel(container).className).toBe('bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden');
      expect(Array.from(panel(container).children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        'DIV.bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-center gap-3',
        'DIV.p-6 space-y-4 text-sm text-slate-600',
        'DIV.px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end',
      ]);
    });

    it('keeps the header nesting: icon tile then heading', () => {
      const { container } = render(<Subject {...inputs()} />);
      const [iconWrap, heading] = header(container).children;
      expect(header(container).children).toHaveLength(2);
      expect(iconWrap.className).toBe('p-2 bg-white/20 rounded-xl');
      expect(iconWrap.children).toHaveLength(1);
      const svg = iconWrap.firstChild;
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg).toHaveClass('lucide-triangle-alert', 'h-5', 'w-5', 'text-white');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(heading.tagName).toBe('H2');
    });

    it('keeps the body order: paragraph, info grid, hint', () => {
      const { container } = render(<Subject {...inputs()} />);
      expect(Array.from(body(container).children).map((c) => c.tagName)).toEqual(['P', 'DIV', 'P']);
    });

    it('keeps the info grid and cell classes', () => {
      const { container } = render(<Subject {...inputs()} />);
      const grid = infoGrid(container);
      expect(grid.className).toBe('bg-slate-50 p-3 rounded-lg border border-slate-100 grid grid-cols-2 gap-2 text-xs');
      expect(Array.from(grid.children).map((c) => c.className)).toEqual(['', '', 'col-span-2']);
      for (const cell of grid.children) {
        expect(cell.children).toHaveLength(2);
        expect(cell.children[0].tagName).toBe('SPAN');
        expect(cell.children[0].className).toBe('text-slate-500');
        expect(cell.children[1].tagName).toBe('SPAN');
        expect(cell.children[1].className).toBe('font-semibold text-slate-800');
        // A literal space text node separates label and value.
        expect(cell.textContent).toBe(`${cell.children[0].textContent} ${cell.children[1].textContent}`);
      }
    });

    it('renders exactly one button — the Close Button primitive', () => {
      const { container } = render(<Subject {...inputs()} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      const [btn] = buttons;
      expect(footer(container).children).toHaveLength(1);
      expect(footer(container).firstChild).toBe(btn);
      expect(btn).toHaveTextContent(new RegExp(`^${CLOSE_LABEL}$`));
      expect(btn).toHaveAttribute('data-slot', 'button');
      expect(btn.className).toBe(cn(buttonVariants({ variant: 'default', className: CLOSE_BUTTON_CLASS })));
      expect(btn).not.toHaveAttribute('type');
      expect(btn).not.toHaveAttribute('disabled');
      expect(btn.children).toHaveLength(0);
      expect(header(container).querySelector('button')).toBeNull();
    });

    it('has no dialog role, aria-modal, aria labelling or tabindex', () => {
      const { container } = render(<Subject {...inputs()} />);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      for (const el of container.querySelectorAll('*')) {
        for (const attr of ['role', 'aria-modal', 'aria-labelledby', 'aria-describedby', 'tabindex']) {
          expect(el.hasAttribute(attr), `${el.tagName} ${attr}`).toBe(false);
        }
      }
    });
  });

  describe('close behaviour', () => {
    it('Close calls setShowSessionOwnerRequiredDialog(false) exactly once, with only that argument', async () => {
      const setShow = vi.fn();
      render(<Subject {...inputs({ setShowSessionOwnerRequiredDialog: setShow })} />);
      await userEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }));
      expect(setShow).toHaveBeenCalledTimes(1);
      expect(setShow).toHaveBeenCalledWith(false);
    });

    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['a click on the backdrop', async (container) => userEvent.click(backdrop(container))],
      ['a click inside the panel', async (container) => userEvent.click(body(container))],
    ])('%s does not close', async (_name, trigger) => {
      const setShow = vi.fn();
      const { container } = render(<Subject {...inputs({ setShowSessionOwnerRequiredDialog: setShow })} />);
      await trigger(container);
      expect(setShow).not.toHaveBeenCalled();
    });

    it('does not touch sessionToClose or currentSession on Close', async () => {
      const sessionToClose = { ...OTHER };
      const currentSession = { ...CURRENT };
      render(<Subject {...inputs({ sessionToClose, currentSession })} />);
      await userEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }));
      expect(sessionToClose).toEqual(OTHER);
      expect(currentSession).toEqual(CURRENT);
    });

    // POSSales-shaped harness: the flag is real state; sessionToClose is left untouched.
    it('unmounts on Close when the flag is real state, leaving sessionToClose set', async () => {
      const log = [];
      function Harness() {
        const [show, setShowRaw] = useState(true);
        const setShow = (v) => { log.push(v); setShowRaw(v); };
        return (
          <>
            <output data-testid="flag">{String(show)}</output>
            <Subject
              showSessionOwnerRequiredDialog={show}
              setShowSessionOwnerRequiredDialog={setShow}
              sessionToClose={OTHER}
              currentSession={CURRENT}
            />
          </>
        );
      }
      render(<Harness />);
      await userEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }));
      expect(log).toEqual([false]);
      expect(screen.getByTestId('flag')).toHaveTextContent('false');
      expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    });
  });
});

describe('SessionOwnerRequiredDialog (child surface)', () => {
  it('always renders when mounted — it has no visibility prop of its own', () => {
    render(<SessionOwnerRequiredDialog targetSession={null} onClose={noop} />);
    expect(screen.getByText(HEADING)).toBeInTheDocument();
  });

  it('renders targetSession as given — it applies no fallback of its own', () => {
    const { container } = render(<SessionOwnerRequiredDialog targetSession={OTHER} onClose={noop} />);
    expect(infoValues(container)[1]).toEqual(['Session:', 'SESS-0002']);
    cleanup();
    const { container: empty } = render(<SessionOwnerRequiredDialog targetSession={undefined} onClose={noop} />);
    expect(infoGrid(empty)).toBeNull();
  });

  it('hands onClose straight to the button: one call per click, receiving the click event', async () => {
    const onClose = vi.fn();
    render(<SessionOwnerRequiredDialog targetSession={CURRENT} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }));
    await userEvent.click(screen.getByRole('button', { name: CLOSE_LABEL }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose.mock.calls[0][0]).toHaveProperty('type', 'click');
  });
});

describe('SessionOwnerRequiredDialog DOM parity', () => {
  const renderedHtml = (Block, props) => {
    const { container } = render(<Block {...props} />);
    const html = container.innerHTML;
    cleanup();
    return html;
  };

  it.each([
    ['hidden', inputs({ showSessionOwnerRequiredDialog: false })],
    ['currentSession only', inputs()],
    ['sessionToClose over currentSession', inputs({ sessionToClose: OTHER })],
    ['sessionToClose only', inputs({ sessionToClose: OTHER, currentSession: null })],
    ['no target session', inputs({ currentSession: null })],
    ['falsy non-null currentSession', inputs({ currentSession: 0 })],
    ['empty object target', inputs({ currentSession: {} })],
    ['fallback labels', inputs({ currentSession: { terminalId: 'T-9', id: 9, openedBy: 'Olga' } })],
  ])('renders identical DOM to the pre-extraction block when %s', (_name, props) => {
    const original = renderedHtml(OriginalSessionOwnerRequiredBlock, props);
    const extracted = renderedHtml(ExtractedSessionOwnerRequiredBlock, props);
    expect(extracted).toBe(original);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the guard, target fallback and close call stay in POSSales, the markup moved out, and R13
 * keeps its DOM position — is asserted against its source.
 */
describe('POSSales wiring (SessionOwnerRequiredDialog boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');
  const CHILD = read('../features/session/SessionOwnerRequiredDialog.jsx');

  it('keeps the guard, the sessionToClose || currentSession fallback and the close call in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      {showSessionOwnerRequiredDialog && (',
        '        <SessionOwnerRequiredDialog',
        '          targetSession={sessionToClose || currentSession}',
        '          onClose={() => setShowSessionOwnerRequiredDialog(false)}',
        '        />',
        '      )}',
      ].join('\n'),
    );
  });

  it('no longer contains the moved markup', () => {
    // The `{/* Session Owner Required Dialog */}` comment stays in POSSales; the heading markup does not.
    expect(POS_SALES).not.toContain(`>${HEADING}</h2>`);
    expect(POS_SALES).not.toContain('This session can only be closed normally by the cashier who opened it.');
    expect(POS_SALES).not.toContain('please use the <strong>Force Close</strong> option from the menu.');
    expect(POS_SALES).not.toContain('from-red-500 to-red-600 px-6 py-4');
  });

  it('keeps state ownership out of the child: no hooks, context, memo, or session names', () => {
    expect(CHILD).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(CHILD).not.toMatch(/useContext|createContext|React\.memo|\bmemo\(/);
    for (const name of ['sessionToClose', 'currentSession', 'showSessionOwnerRequiredDialog', 'setShowSessionOwnerRequiredDialog']) {
      expect(CHILD.replace(/^\s*\/\/.*$/gm, ''), name).not.toContain(name);
    }
    expect(CHILD).toContain('function SessionOwnerRequiredDialog({ targetSession, onClose }) {');
  });

  it('sits immediately after the Start Session dialog and before the Cashier Auth dialog', () => {
    expect(POS_SALES).toMatch(
      /\n {6}<\/Dialog>\n\n {6}\{\/\* Session Owner Required Dialog \*\/\}\n {6}\{showSessionOwnerRequiredDialog && \(\n {8}<SessionOwnerRequiredDialog\n[\s\S]*?\n {8}\/>\n {6}\)\}\n\n {6}\{\/\* Cashier Auth Dialog \*\/\}\n {6}\{showCashierAuthDialog && \(/,
    );
  });

  it('renders SessionOwnerRequiredDialog exactly once', () => {
    expect(POS_SALES.match(/<SessionOwnerRequiredDialog\b/g)).toHaveLength(1);
  });
});
