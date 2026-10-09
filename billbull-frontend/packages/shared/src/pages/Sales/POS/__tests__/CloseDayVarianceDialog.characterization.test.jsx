import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertTriangle, X } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent } from '../../../../components/ui/dialog';
import CloseDayVarianceDialog from '../features/session/CloseDayVarianceDialog';

// Pinned verbatim from the POSSales.jsx R20 close-day variance dialog before extraction.
const CASH_TITLE = 'Cash Reconciliation Failed';
const SALES_TITLE = 'Sales Reconciliation Failed';
const SUBTITLE = 'Close day was blocked — review the variance breakdown below';
const CONTENT_CLASS =
  'sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden';

/**
 * The original R20 markup, copied from POSSales.jsx before extraction. The Dialog's `open`
 * expression and inline `onOpenChange` handler are lifted to props unchanged, and the two
 * inline `() => setCloseDayVariance(null)` button handlers are lifted to `onClose`.
 */
function OriginalCloseDayVarianceMarkup({ open, onOpenChange, closeDayVariance, onClose }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">
                    {closeDayVariance?.stage === 'CASH' ? 'Cash Reconciliation Failed' : 'Sales Reconciliation Failed'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Close day was blocked — review the variance breakdown below</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {closeDayVariance?.breakdown && Object.entries(closeDayVariance.breakdown).map(([key, value]) => {
              const isVariance = key === 'variance';
              const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
              const num = Number(value);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg ${isVariance ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}
                >
                  <span className={`text-sm ${isVariance ? 'font-semibold text-red-600' : 'text-gray-600'}`}>{label}</span>
                  <span className={`text-sm font-mono ${isVariance ? 'font-bold text-red-600' : 'text-[#1E293B]'}`}>
                    {Number.isFinite(num) ? num.toFixed(2) : String(value)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
  );
}

// Every behavioural test below runs against both the pre-extraction reference and the extracted component.
const SUBJECTS = [
  ['original R20 markup', OriginalCloseDayVarianceMarkup],
  ['CloseDayVarianceDialog', CloseDayVarianceDialog],
];

const noop = () => {};

const CASH_VARIANCE = {
  stage: 'CASH',
  breakdown: {
    expectedCash: 1250.5,
    countedCash: '1200',
    variance: -50.5,
  },
};

const SALES_VARIANCE = {
  stage: 'SALES',
  breakdown: {
    invoiceTotal: 3000,
    paymentTotal: 2999.999,
    variance: 0.001,
  },
};

/** Props exactly as POSSales derives them from `closeDayVariance`. */
function propsFor(closeDayVariance, overrides = {}) {
  return {
    open: !!closeDayVariance,
    onOpenChange: noop,
    closeDayVariance,
    onClose: noop,
    ...overrides,
  };
}

const dialog = () => screen.getByRole('dialog');
const rowsContainer = () => dialog().querySelector('.px-6.py-5.space-y-3');
const rows = () => Array.from(rowsContainer().children);
const headerCloseButton = () => dialog().querySelector('.border-b.border-gray-100 button');
const footerCloseButton = () => dialog().querySelector('.px-6.pb-6 button');
/** The DialogContent primitive's own close button, hidden by `[&>button:last-child]:hidden`. */
const primitiveCloseButton = () => dialog().querySelector(':scope > button:last-child');

afterEach(() => {
  cleanup();
});

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('open / closed', () => {
    it('renders nothing when closeDayVariance is null', () => {
      render(<Subject {...propsFor(null)} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(SUBTITLE)).not.toBeInTheDocument();
    });

    it('renders the dialog into a portal when closeDayVariance is set', () => {
      const { container } = render(<Subject {...propsFor(CASH_VARIANCE)} />);
      expect(dialog()).toBeInTheDocument();
      expect(container.contains(dialog())).toBe(false);
      expect(dialog()).toHaveAttribute('data-state', 'open');
      expect(dialog()).toHaveAttribute('data-slot', 'dialog-content');
    });

    it('closes when the parent flips open to false', () => {
      const { rerender } = render(<Subject {...propsFor(CASH_VARIANCE)} />);
      expect(dialog()).toBeInTheDocument();
      rerender(<Subject {...propsFor(null)} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('title and text', () => {
    it('shows the cash title for stage CASH', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      const heading = within(dialog()).getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(new RegExp(`^${CASH_TITLE}$`));
      expect(heading).toHaveClass('text-base', 'font-bold', 'text-[#1E293B]');
    });

    // Anything other than the exact string 'CASH' falls through to the sales title.
    it.each([
      ['SALES', { stage: 'SALES', breakdown: {} }],
      ['lowercase cash', { stage: 'cash', breakdown: {} }],
      ['missing stage', { breakdown: {} }],
    ])('shows the sales title for %s', (_name, variance) => {
      render(<Subject {...propsFor(variance)} />);
      expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent(new RegExp(`^${SALES_TITLE}$`));
    });

    it('renders the exact explanatory text', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      const subtitle = within(dialog()).getByText(SUBTITLE);
      expect(subtitle.tagName).toBe('P');
      expect(subtitle).toHaveClass('text-xs', 'text-gray-400', 'mt-0.5');
    });
  });

  describe('breakdown values', () => {
    it('renders one row per breakdown entry in Object.entries order', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      expect(rows().map((r) => r.children[0].textContent)).toEqual(['Expected Cash', 'Counted Cash', 'Variance']);
    });

    // Plain toFixed(2): no currency symbol, no thousands separator, string inputs coerced.
    it('formats finite values with toFixed(2) and no currency symbol', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      expect(rows().map((r) => r.children[1].textContent)).toEqual(['1250.50', '1200.00', '-50.50']);
    });

    it('rounds through toFixed(2)', () => {
      render(<Subject {...propsFor(SALES_VARIANCE)} />);
      expect(rows().map((r) => [r.children[0].textContent, r.children[1].textContent])).toEqual([
        ['Invoice Total', '3000.00'],
        ['Payment Total', '3000.00'],
        ['Variance', '0.00'],
      ]);
    });

    it('does not add a thousands separator to large values', () => {
      render(<Subject {...propsFor({ stage: 'CASH', breakdown: { expectedCash: 1234567.891 } })} />);
      expect(rows()[0].children[1].textContent).toBe('1234567.89');
    });

    // Number(null) is 0 and Number('') is 0, so both read as finite; NaN-producing values print String(value).
    it.each([
      ['null', null, '0.00'],
      ['empty string', '', '0.00'],
      ['boolean true', true, '1.00'],
      ['non-numeric string', 'N/A', 'N/A'],
      ['undefined', undefined, 'undefined'],
      ['Infinity', Infinity, 'Infinity'],
      ['object', { a: 1 }, '[object Object]'],
    ])('renders %s as %j', (_name, value, expected) => {
      render(<Subject {...propsFor({ stage: 'CASH', breakdown: { someValue: value } })} />);
      expect(rows()[0].children[1].textContent).toBe(expected);
    });

    it.each([
      ['expectedCash', 'Expected Cash'],
      ['variance', 'Variance'],
      ['posSalesTotalAED', 'Pos Sales Total A E D'],
      ['already Spaced', 'Already  Spaced'],
      ['snake_case', 'Snake_case'],
    ])('derives the label for key %s as %j', (key, label) => {
      render(<Subject {...propsFor({ stage: 'CASH', breakdown: { [key]: 1 } })} />);
      expect(rows()[0].children[0].textContent).toBe(label);
    });

    it('highlights only the row keyed exactly "variance"', () => {
      render(<Subject {...propsFor({ stage: 'CASH', breakdown: { expectedCash: 1, variance: 2, Variance: 3 } })} />);
      const [plain, variance, capitalised] = rows();

      expect(plain.className).toBe('flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50');
      expect(plain.children[0].className).toBe('text-sm text-gray-600');
      expect(plain.children[1].className).toBe('text-sm font-mono text-[#1E293B]');

      expect(variance.className).toBe('flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100');
      expect(variance.children[0].className).toBe('text-sm font-semibold text-red-600');
      expect(variance.children[1].className).toBe('text-sm font-mono font-bold text-red-600');

      expect(capitalised.className).toBe(plain.className);
    });

    it.each([
      ['breakdown missing', { stage: 'CASH' }],
      ['breakdown null', { stage: 'CASH', breakdown: null }],
      ['breakdown empty', { stage: 'CASH', breakdown: {} }],
    ])('renders an empty rows container when %s', (_name, variance) => {
      render(<Subject {...propsFor(variance)} />);
      expect(rowsContainer()).toBeInTheDocument();
      expect(rowsContainer().children).toHaveLength(0);
    });
  });

  describe('structure, classes and accessibility', () => {
    it('keeps the DialogContent classes, overlay and Radix aria wiring', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      expect(dialog()).toHaveClass(...CONTENT_CLASS.split(' '));
      expect(dialog()).toHaveAttribute('aria-labelledby');
      expect(dialog()).toHaveAttribute('aria-describedby');
      expect(dialog()).toHaveAttribute('tabindex', '-1');
      expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveAttribute('data-state', 'open');
    });

    it('renders header, rows and footer sections in order, then the primitive close button', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      expect(Array.from(dialog().children).map((c) => `${c.tagName}.${c.className}`)).toEqual([
        'DIV.px-6 pt-6 pb-4 border-b border-gray-100',
        'DIV.px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto',
        'DIV.px-6 pb-6 flex items-center justify-end gap-3',
        expect.stringMatching(/^BUTTON\..*absolute top-4 right-4/),
      ]);
    });

    it('keeps the red AlertTriangle icon and the header X icon', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      const iconWrap = dialog().querySelector('.p-2\\.5.rounded-xl.bg-red-50');
      expect(iconWrap.querySelector('svg')).toHaveClass('lucide-triangle-alert', 'h-5', 'w-5', 'text-red-500');
      expect(headerCloseButton().querySelector('svg')).toHaveClass('lucide-x', 'h-5', 'w-5');
    });

    it('renders exactly three buttons: header X, footer Close, hidden primitive close', () => {
      render(<Subject {...propsFor(CASH_VARIANCE)} />);
      const buttons = within(dialog()).getAllByRole('button');
      expect(buttons).toEqual([headerCloseButton(), footerCloseButton(), primitiveCloseButton()]);

      expect(headerCloseButton().className).toBe('text-gray-300 hover:text-gray-500 transition-colors mt-0.5');
      expect(headerCloseButton()).toHaveTextContent(/^$/);
      expect(headerCloseButton()).not.toHaveAttribute('type');
      expect(headerCloseButton()).not.toHaveAttribute('aria-label');

      expect(footerCloseButton().className).toBe(
        'h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors',
      );
      expect(footerCloseButton()).toHaveTextContent(/^Close$/);
      expect(footerCloseButton()).not.toHaveAttribute('type');

      expect(primitiveCloseButton()).toHaveAttribute('type', 'button');
      expect(primitiveCloseButton()).toHaveTextContent(/^Close$/);
    });
  });

  describe('callbacks', () => {
    it('header X calls onClose once and never onOpenChange', async () => {
      const onClose = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(CASH_VARIANCE, { onClose, onOpenChange })} />);
      await userEvent.click(headerCloseButton());
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('footer Close calls onClose once and never onOpenChange', async () => {
      const onClose = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(CASH_VARIANCE, { onClose, onOpenChange })} />);
      await userEvent.click(footerCloseButton());
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('Escape calls onOpenChange(false) and never onClose', async () => {
      const onClose = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(CASH_VARIANCE, { onClose, onOpenChange })} />);
      await userEvent.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('the hidden primitive close button calls onOpenChange(false) and never onClose', () => {
      const onClose = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(CASH_VARIANCE, { onClose, onOpenChange })} />);
      fireEvent.click(primitiveCloseButton());
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a pointer-down outside the content calls onOpenChange(false) and never onClose', async () => {
      const onClose = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(CASH_VARIANCE, { onClose, onOpenChange })} />);
      // Radix attaches its outside-pointer listener on a deferred tick after mount.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('clicking inside the content does not call either callback', async () => {
      const onClose = vi.fn();
      const onOpenChange = vi.fn();
      render(<Subject {...propsFor(CASH_VARIANCE, { onClose, onOpenChange })} />);
      await userEvent.click(rows()[0]);
      expect(onClose).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  /**
   * A stateful harness that owns `closeDayVariance` and wires the Dialog with the exact
   * expressions POSSales uses, so every close path is characterized end-to-end.
   */
  describe('wired like POSSales', () => {
    function Harness({ initial, log, Component }) {
      const [closeDayVariance, setCloseDayVarianceRaw] = useState(initial);
      const setCloseDayVariance = (v) => {
        log.push(v);
        setCloseDayVarianceRaw(v);
      };
      return (
        <>
          <output data-testid="state">{closeDayVariance === null ? 'null' : closeDayVariance.stage}</output>
          <Component
            open={!!closeDayVariance}
            onOpenChange={(open) => { if (!open) setCloseDayVariance(null); }}
            closeDayVariance={closeDayVariance}
            onClose={() => setCloseDayVariance(null)}
          />
        </>
      );
    }

    const renderHarness = () => {
      const log = [];
      render(<Harness initial={CASH_VARIANCE} log={log} Component={Subject} />);
      return log;
    };

    it.each([
      ['header X', async () => userEvent.click(headerCloseButton())],
      ['footer Close', async () => userEvent.click(footerCloseButton())],
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['primitive close button', async () => fireEvent.click(primitiveCloseButton())],
    ])('%s sets closeDayVariance to null exactly once and unmounts the dialog', async (_name, trigger) => {
      const log = renderHarness();
      expect(screen.getByTestId('state')).toHaveTextContent('CASH');
      await trigger();
      expect(log).toEqual([null]);
      expect(screen.getByTestId('state')).toHaveTextContent('null');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ignores an onOpenChange(true) — the handler only acts on close', () => {
      const log = [];
      const seenOnOpenChange = vi.fn();
      function Capture(props) {
        seenOnOpenChange(props.onOpenChange);
        return <Subject {...props} />;
      }
      render(<Harness initial={CASH_VARIANCE} log={log} Component={Capture} />);
      act(() => seenOnOpenChange.mock.lastCall[0](true));
      expect(log).toEqual([]);
      expect(screen.getByTestId('state')).toHaveTextContent('CASH');
    });
  });
});

describe('CloseDayVarianceDialog DOM parity', () => {
  // Radix ids come from React's useId counter, which keeps advancing across renders.
  const normaliseIds = (html) => html.replace(/radix-[^"\s]+/g, 'radix-ID');

  const renderedBody = (Component, closeDayVariance) => {
    render(<Component {...propsFor(closeDayVariance)} />);
    const html = normaliseIds(document.body.innerHTML);
    cleanup();
    return html;
  };

  it.each([
    ['closed', null],
    ['CASH stage', CASH_VARIANCE],
    ['SALES stage', SALES_VARIANCE],
    ['no breakdown', { stage: 'CASH' }],
    ['non-numeric values', { stage: 'X', breakdown: { a: 'N/A', b: undefined, variance: null } }],
  ])('renders document.body identical to the pre-extraction markup when %s', (_name, variance) => {
    const original = renderedBody(OriginalCloseDayVarianceMarkup, variance);
    const extracted = renderedBody(CloseDayVarianceDialog, variance);
    expect(extracted).toBe(original);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the open expression and onOpenChange handler stay in POSSales, the markup moved out, and
 * R20 keeps its DOM position — is asserted against its source.
 */
describe('POSSales wiring (CloseDayVarianceDialog boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');

  it('keeps the open expression, the exact inline onOpenChange handler and the close callback in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      <CloseDayVarianceDialog',
        '        open={!!closeDayVariance}',
        '        onOpenChange={(open) => { if (!open) setCloseDayVariance(null); }}',
        '        closeDayVariance={closeDayVariance}',
        '        onClose={() => setCloseDayVariance(null)}',
        '      />',
      ].join('\n'),
    );
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(SUBTITLE);
    expect(POS_SALES).not.toContain(CASH_TITLE);
    expect(POS_SALES).not.toContain('<Dialog open={!!closeDayVariance}');
  });

  it('keeps closeDayVariance state ownership in POSSales', () => {
    expect(POS_SALES).toContain('const [closeDayVariance, setCloseDayVariance] = useState(null);');
    expect(POS_SALES).toContain('setCloseDayVariance({ stage: body.stage, message: body.message, breakdown: body.breakdown });');
  });

  it('sits after the live session dialog and before the range exclusion dialog', () => {
    expect(POS_SALES).toMatch(
      /\n {8}onOpenFullXReport=\{\(\) => \{\n {10}setShowLiveSessionDialog\(false\);\n {10}setCurrentView\('x-report'\);\n {8}\}\}\n {6}\/>\n\n {6}\{\/\* Close Day Reconciliation Variance Dialog \*\/\}\n {6}<CloseDayVarianceDialog\n[\s\S]*?\n {6}\/>\n\n {6}\{\/\* Session Range Exclusion Confirmation[\s\S]*?\*\/\}\n {6}<RangeExclusionConfirmDialog\n/,
    );
  });

  it('renders CloseDayVarianceDialog exactly once', () => {
    expect(POS_SALES.match(/<CloseDayVarianceDialog\b/g)).toHaveLength(1);
  });
});
