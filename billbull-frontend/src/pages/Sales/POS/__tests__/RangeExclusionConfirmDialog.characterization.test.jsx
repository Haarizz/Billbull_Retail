import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertTriangle } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent } from '../../../../components/ui/dialog';
import RangeExclusionConfirmDialog from '../features/session/RangeExclusionConfirmDialog';

// Pinned verbatim from the POSSales.jsx R21 session range exclusion dialog before extraction.
const TITLE = 'Sessions Outside Selected Range';
const CONFIRM_LABEL = 'Close Day Anyway';
const CONTENT_CLASS =
  'sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden';

/**
 * The original R21 markup, copied from POSSales.jsx before extraction. The Dialog's `open`
 * expression and inline `onOpenChange` handler are lifted to props unchanged, the Cancel
 * button's `() => setRangeExclusionConfirm(null)` is lifted to `onCancel`, and the confirm
 * button's `() => handleCloseDay(true)` is lifted to `onConfirm`.
 */
function OriginalRangeExclusionMarkup({ open, onOpenChange, rangeExclusionConfirm, onCancel, onConfirm }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1E293B]">Sessions Outside Selected Range</h2>
                <p className="text-xs text-gray-400 mt-0.5">{rangeExclusionConfirm?.message}</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-2 max-h-[50vh] overflow-y-auto">
            {(rangeExclusionConfirm?.excludedSessions || []).map((s) => (
              <div key={s.sessionId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs">
                <span className="text-[#1E293B] font-medium">{s.sessionNo || `SESS-${s.sessionId}`} · {s.cashier || '—'}</span>
                <span className="text-gray-500">{s.status}</span>
              </div>
            ))}
          </div>
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="h-10 px-5 text-sm font-medium text-[#1E293B] bg-[#F5C742] hover:bg-[#e6b838] rounded-xl transition-colors"
            >
              Close Day Anyway
            </button>
          </div>
        </DialogContent>
      </Dialog>
  );
}

// Every behavioural test below runs against both the pre-extraction reference and the extracted component.
const SUBJECTS = [
  ['original R21 markup', OriginalRangeExclusionMarkup],
  ['RangeExclusionConfirmDialog', RangeExclusionConfirmDialog],
];

const noop = () => {};

/** Shape POSSales builds: `{ message: body.message, ...body.details }`. */
const EXCLUSION = {
  message: '2 eligible session(s) fall outside the selected range.',
  startSessionId: 11,
  endSessionId: 12,
  excludedSessions: [
    { sessionId: 9, sessionNo: 'SESS-0009', cashier: 'Alice', status: 'CLOSED' },
    { sessionId: 10, sessionNo: null, cashier: '', status: 'RECONCILED' },
  ],
};

/** Props exactly as POSSales derives them from `rangeExclusionConfirm`. */
function propsFor(rangeExclusionConfirm, overrides = {}) {
  return {
    open: !!rangeExclusionConfirm,
    onOpenChange: noop,
    rangeExclusionConfirm,
    onCancel: noop,
    onConfirm: noop,
    ...overrides,
  };
}

const dialog = () => screen.getByRole('dialog');
const header = () => dialog().querySelector('.px-6.pt-6.pb-4');
const rowsContainer = () => dialog().querySelector('.px-6.py-5.space-y-2');
const rows = () => Array.from(rowsContainer().children);
const footer = () => dialog().querySelector('.px-6.pb-6');
const cancelButton = () => footer().children[0];
const confirmButton = () => footer().children[1];
/** The DialogContent primitive's own close button, hidden by `[&>button:last-child]:hidden`. */
const primitiveCloseButton = () => dialog().querySelector(':scope > button:last-child');

afterEach(() => {
  cleanup();
});

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('open / closed lifecycle', () => {
    it('renders nothing when rangeExclusionConfirm is null', () => {
      render(<Subject {...propsFor(null)} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
      expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    });

    it('renders the dialog into a portal when rangeExclusionConfirm is set', () => {
      const { container } = render(<Subject {...propsFor(EXCLUSION)} />);
      expect(dialog()).toBeInTheDocument();
      expect(container.contains(dialog())).toBe(false);
      expect(dialog()).toHaveAttribute('data-state', 'open');
      expect(dialog()).toHaveAttribute('data-slot', 'dialog-content');
    });

    // The Dialog root is always mounted; Radix alone mounts/unmounts the content from `open`.
    it('opens and closes in place as the parent flips rangeExclusionConfirm', () => {
      const { rerender } = render(<Subject {...propsFor(null)} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      rerender(<Subject {...propsFor(EXCLUSION)} />);
      expect(dialog()).toBeInTheDocument();
      rerender(<Subject {...propsFor(null)} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders no host DOM of its own in the parent container', () => {
      const closed = render(<Subject {...propsFor(null)} />);
      expect(closed.container.innerHTML).toBe('');
      cleanup();
      const open = render(<Subject {...propsFor(EXCLUSION)} />);
      expect(open.container.innerHTML).toBe('');
    });

    // `open` is the only visibility input: any truthy object opens it, even without fields.
    it('opens for an empty object', () => {
      render(<Subject {...propsFor({})} />);
      expect(dialog()).toBeInTheDocument();
    });
  });

  describe('title and text', () => {
    it('renders the exact static title', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      const heading = within(dialog()).getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(new RegExp(`^${TITLE}$`));
      expect(heading.className).toBe('text-base font-bold text-[#1E293B]');
    });

    it('renders the server message verbatim as the explanatory text', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      const subtitle = header().querySelector('p');
      expect(subtitle.textContent).toBe(EXCLUSION.message);
      expect(subtitle.className).toBe('text-xs text-gray-400 mt-0.5');
    });

    it.each([
      ['message missing', {}],
      ['message null', { message: null }],
    ])('renders an empty paragraph when %s', (_name, value) => {
      render(<Subject {...propsFor(value)} />);
      const subtitle = header().querySelector('p');
      expect(subtitle).toBeInTheDocument();
      expect(subtitle.textContent).toBe('');
    });
  });

  describe('excluded session rows', () => {
    it('renders one row per excluded session in array order', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      expect(rows()).toHaveLength(2);
      expect(rows().map((r) => [r.children[0].textContent, r.children[1].textContent])).toEqual([
        ['SESS-0009 · Alice', 'CLOSED'],
        ['SESS-10 · —', 'RECONCILED'],
      ]);
    });

    it.each([
      ['sessionNo present', { sessionId: 3, sessionNo: 'S-3', cashier: 'Bob' }, 'S-3 · Bob'],
      ['sessionNo empty string', { sessionId: 3, sessionNo: '', cashier: 'Bob' }, 'SESS-3 · Bob'],
      ['sessionNo undefined', { sessionId: 3, cashier: 'Bob' }, 'SESS-3 · Bob'],
      ['cashier null', { sessionId: 3, sessionNo: 'S-3', cashier: null }, 'S-3 · —'],
      ['sessionId undefined', { sessionNo: null, cashier: 'Bob' }, 'SESS-undefined · Bob'],
    ])('labels a row with %s as %j', (_name, session, label) => {
      render(<Subject {...propsFor({ excludedSessions: [session] })} />);
      expect(rows()[0].children[0].textContent).toBe(label);
    });

    it('renders a missing status as an empty span', () => {
      render(<Subject {...propsFor({ excludedSessions: [{ sessionId: 1, sessionNo: 'A', cashier: 'B' }] })} />);
      expect(rows()[0].children[1].textContent).toBe('');
    });

    it('keeps the row and span classes', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      const [row] = rows();
      expect(row.tagName).toBe('DIV');
      expect(row.className).toBe('flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs');
      expect(row.children).toHaveLength(2);
      expect(row.children[0].tagName).toBe('SPAN');
      expect(row.children[0].className).toBe('text-[#1E293B] font-medium');
      expect(row.children[1].tagName).toBe('SPAN');
      expect(row.children[1].className).toBe('text-gray-500');
    });

    it.each([
      ['excludedSessions missing', { message: 'm' }],
      ['excludedSessions null', { message: 'm', excludedSessions: null }],
      ['excludedSessions empty', { message: 'm', excludedSessions: [] }],
    ])('renders an empty rows container when %s', (_name, value) => {
      render(<Subject {...propsFor(value)} />);
      expect(rowsContainer()).toBeInTheDocument();
      expect(rowsContainer().children).toHaveLength(0);
    });
  });

  describe('structure, classes and accessibility', () => {
    it('keeps the DialogContent classes, overlay and Radix aria wiring', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      expect(dialog().className).toContain(CONTENT_CLASS);
      expect(dialog()).toHaveAttribute('aria-labelledby');
      expect(dialog()).toHaveAttribute('aria-describedby');
      expect(dialog()).toHaveAttribute('tabindex', '-1');
      expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveAttribute('data-state', 'open');
    });

    it('renders header, rows and footer sections in order, then the primitive close button', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      expect(Array.from(dialog().children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        'DIV.px-6 pt-6 pb-4 border-b border-gray-100',
        'DIV.px-6 py-5 space-y-2 max-h-[50vh] overflow-y-auto',
        'DIV.px-6 pb-6 flex items-center justify-end gap-3',
        expect.stringMatching(/^BUTTON\..*absolute top-4 right-4/),
      ]);
    });

    it('keeps the header nesting: flex row > amber icon tile + title block', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      expect(header().children).toHaveLength(1);
      const flexRow = header().children[0];
      expect(flexRow.className).toBe('flex items-center gap-3');
      expect(flexRow.children).toHaveLength(2);

      const [iconWrap, textBlock] = flexRow.children;
      expect(iconWrap.className).toBe('p-2.5 rounded-xl bg-amber-50');
      expect(iconWrap.children).toHaveLength(1);
      expect(iconWrap.querySelector('svg')).toHaveClass('lucide-triangle-alert', 'h-5', 'w-5', 'text-amber-500');

      expect(textBlock.className).toBe('');
      expect(Array.from(textBlock.children).map((c) => c.tagName)).toEqual(['H2', 'P']);
    });

    it('has no header close X — the only visible buttons are Cancel and Close Day Anyway', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      expect(header().querySelector('button')).toBeNull();
      const buttons = within(dialog()).getAllByRole('button');
      expect(buttons).toEqual([cancelButton(), confirmButton(), primitiveCloseButton()]);
    });

    it('renders the exact Cancel and confirm buttons', () => {
      render(<Subject {...propsFor(EXCLUSION)} />);
      expect(footer().children).toHaveLength(2);

      expect(cancelButton().tagName).toBe('BUTTON');
      expect(cancelButton()).toHaveTextContent(/^Cancel$/);
      expect(cancelButton().className).toBe(
        'h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors',
      );
      expect(cancelButton()).not.toHaveAttribute('type');
      expect(cancelButton()).not.toHaveAttribute('disabled');

      expect(confirmButton().tagName).toBe('BUTTON');
      expect(confirmButton()).toHaveTextContent(new RegExp(`^${CONFIRM_LABEL}$`));
      expect(confirmButton().className).toBe(
        'h-10 px-5 text-sm font-medium text-[#1E293B] bg-[#F5C742] hover:bg-[#e6b838] rounded-xl transition-colors',
      );
      expect(confirmButton()).not.toHaveAttribute('type');
      expect(confirmButton()).not.toHaveAttribute('disabled');
      expect(confirmButton().children).toHaveLength(0);

      expect(primitiveCloseButton()).toHaveAttribute('type', 'button');
      expect(primitiveCloseButton()).toHaveTextContent(/^Close$/);
    });
  });

  describe('callbacks', () => {
    it('Cancel calls onCancel once and never onConfirm or onOpenChange', async () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onCancel, onConfirm, onOpenChange })} />);
      await userEvent.click(cancelButton());
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('Close Day Anyway calls onConfirm once and never onCancel or onOpenChange', async () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onCancel, onConfirm, onOpenChange })} />);
      await userEvent.click(confirmButton());
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    // No disabled/in-flight guard exists on the confirm button: each click fires again.
    it('Close Day Anyway fires once per click with no re-entry guard', async () => {
      const onConfirm = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onConfirm })} />);
      await userEvent.click(confirmButton());
      await userEvent.click(confirmButton());
      expect(onConfirm).toHaveBeenCalledTimes(2);
    });

    it('Escape calls onOpenChange(false) and never onCancel or onConfirm', async () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onCancel, onConfirm, onOpenChange })} />);
      await userEvent.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('the hidden primitive close button calls onOpenChange(false) and never onCancel or onConfirm', () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onCancel, onConfirm, onOpenChange })} />);
      fireEvent.click(primitiveCloseButton());
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('a pointer-down outside the content calls onOpenChange(false) and never onCancel or onConfirm', async () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onCancel, onConfirm, onOpenChange })} />);
      // Radix attaches its outside-pointer listener on a deferred tick after mount.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('clicking inside the content does not call any callback', async () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(EXCLUSION, { onCancel, onConfirm, onOpenChange })} />);
      await userEvent.click(rows()[0]);
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  /**
   * A stateful harness that owns `rangeExclusionConfirm` and wires the Dialog with the exact
   * expressions POSSales uses; `handleCloseDay` is a spy standing in for the POSSales handler.
   */
  describe('wired like POSSales', () => {
    function Harness({ initial, log, handleCloseDay, Component }) {
      const [rangeExclusionConfirm, setRangeExclusionConfirmRaw] = useState(initial);
      const setRangeExclusionConfirm = (v) => {
        log.push(v);
        setRangeExclusionConfirmRaw(v);
      };
      return (
        <>
          <output data-testid="state">{rangeExclusionConfirm === null ? 'null' : 'set'}</output>
          <Component
            open={!!rangeExclusionConfirm}
            onOpenChange={(open) => { if (!open) setRangeExclusionConfirm(null); }}
            rangeExclusionConfirm={rangeExclusionConfirm}
            onCancel={() => setRangeExclusionConfirm(null)}
            onConfirm={() => handleCloseDay(true)}
          />
        </>
      );
    }

    const renderHarness = (Component = Subject) => {
      const log = [];
      const handleCloseDay = vi.fn();
      render(<Harness initial={EXCLUSION} log={log} handleCloseDay={handleCloseDay} Component={Component} />);
      return { log, handleCloseDay };
    };

    it.each([
      ['Cancel', async () => userEvent.click(cancelButton())],
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['primitive close button', async () => fireEvent.click(primitiveCloseButton())],
      ['outside pointer-down', async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
        fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      }],
    ])('%s sets rangeExclusionConfirm to null exactly once, never calls handleCloseDay, and unmounts the dialog', async (_name, trigger) => {
      const { log, handleCloseDay } = renderHarness();
      expect(screen.getByTestId('state')).toHaveTextContent('set');
      await trigger();
      expect(log).toEqual([null]);
      expect(handleCloseDay).not.toHaveBeenCalled();
      expect(screen.getByTestId('state')).toHaveTextContent('null');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Confirm does not clear the state itself — handleCloseDay does on success / re-sets it on a repeat exclusion.
    it('Close Day Anyway calls handleCloseDay(true) exactly once and leaves the dialog open', async () => {
      const { log, handleCloseDay } = renderHarness();
      await userEvent.click(confirmButton());
      expect(handleCloseDay).toHaveBeenCalledTimes(1);
      expect(handleCloseDay).toHaveBeenCalledWith(true);
      expect(log).toEqual([]);
      expect(screen.getByTestId('state')).toHaveTextContent('set');
      expect(dialog()).toBeInTheDocument();
    });

    it('ignores an onOpenChange(true) — the handler only acts on close', () => {
      const seenOnOpenChange = vi.fn();
      function Capture(props) {
        seenOnOpenChange(props.onOpenChange);
        return <Subject {...props} />;
      }
      const { log, handleCloseDay } = renderHarness(Capture);
      act(() => seenOnOpenChange.mock.lastCall[0](true));
      expect(log).toEqual([]);
      expect(handleCloseDay).not.toHaveBeenCalled();
      expect(screen.getByTestId('state')).toHaveTextContent('set');
    });
  });
});

describe('RangeExclusionConfirmDialog DOM parity', () => {
  // Radix ids come from React's useId counter, which keeps advancing across renders.
  const normaliseIds = (html) => html.replace(/radix-[^"\s]+/g, 'radix-ID');

  const renderedBody = (Component, rangeExclusionConfirm) => {
    render(<Component {...propsFor(rangeExclusionConfirm)} />);
    const html = normaliseIds(document.body.innerHTML);
    cleanup();
    return html;
  };

  it.each([
    ['closed', null],
    ['populated', EXCLUSION],
    ['empty object', {}],
    ['null excludedSessions', { message: 'm', excludedSessions: null }],
    ['fallback labels', { message: 'm', excludedSessions: [{ sessionId: 7 }, { sessionId: 8, sessionNo: '', cashier: null, status: 'OPEN' }] }],
  ])('renders document.body identical to the pre-extraction markup when %s', (_name, value) => {
    const original = renderedBody(OriginalRangeExclusionMarkup, value);
    const extracted = renderedBody(RangeExclusionConfirmDialog, value);
    expect(extracted).toBe(original);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the open expression, onOpenChange handler, Cancel state update and handleCloseDay(true)
 * confirm stay in POSSales, the markup moved out, and R21 keeps its DOM position — is
 * asserted against its source.
 */
describe('POSSales wiring (RangeExclusionConfirmDialog boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');

  it('keeps the open expression, onOpenChange handler, Cancel update and handleCloseDay(true) confirm in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      <RangeExclusionConfirmDialog',
        '        open={!!rangeExclusionConfirm}',
        '        onOpenChange={(open) => { if (!open) setRangeExclusionConfirm(null); }}',
        '        rangeExclusionConfirm={rangeExclusionConfirm}',
        '        onCancel={() => setRangeExclusionConfirm(null)}',
        '        onConfirm={() => handleCloseDay(true)}',
        '      />',
      ].join('\n'),
    );
  });

  it('is always mounted — not wrapped in a conditional guard', () => {
    expect(POS_SALES).not.toMatch(/rangeExclusionConfirm\s*&&\s*\(?\s*<RangeExclusionConfirmDialog/);
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(TITLE);
    expect(POS_SALES).not.toContain(CONFIRM_LABEL);
    expect(POS_SALES).not.toContain('<Dialog open={!!rangeExclusionConfirm}');
    expect(POS_SALES).not.toContain('rangeExclusionConfirm?.excludedSessions');
  });

  it('keeps rangeExclusionConfirm state ownership and handleCloseDay in POSSales', () => {
    expect(POS_SALES).toContain('const [rangeExclusionConfirm, setRangeExclusionConfirm] = useState(null);');
    expect(POS_SALES).toContain('const handleCloseDay = async (acknowledgeExclusions = false) => {');
    expect(POS_SALES).toContain('setRangeExclusionConfirm({ message: body.message, ...body.details });');
  });

  it('sits immediately after CloseDayVarianceDialog and before the Lock POS dialog', () => {
    expect(POS_SALES).toMatch(
      /\n {6}<CloseDayVarianceDialog\n[\s\S]*?\n {6}\/>\n\n {6}\{\/\* Session Range Exclusion Confirmation[\s\S]*?\*\/\}\n {6}<RangeExclusionConfirmDialog\n[\s\S]*?\n {6}\/>\n\n {6}\{\/\* Lock POS Dialog \*\/\}\n {6}<LockPosDialog\n {8}open=\{showLockPOS\}/,
    );
  });

  it('renders RangeExclusionConfirmDialog exactly once', () => {
    expect(POS_SALES.match(/<RangeExclusionConfirmDialog\b/g)).toHaveLength(1);
  });
});
