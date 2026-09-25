import fs from 'node:fs';
import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckCircle, Printer, X, XCircle } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PosFeedbackToasts from '../features/notifications/PosFeedbackToasts';

// Pinned verbatim from the POSSales.jsx R27 feedback toasts before extraction.
const POSITION = 'fixed bottom-6 left-1/2 -translate-x-1/2';
const CASH_BASE_CLASS = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ';
const RECEIPT_BASE_CLASS = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[220] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ';
const PRINT_BASE_CLASS = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md ';
const SUCCESS_TONE = 'bg-[#327F74] text-white';
const ERROR_TONE = 'bg-red-500 text-white';
const WARNING_TONE = 'bg-amber-500 text-gray-900';
const PRINT_BUTTON_CLASS = 'ml-1 shrink-0 opacity-80 hover:opacity-100';
const ICON_CLASS = {
  check: 'lucide lucide-circle-check-big h-4 w-4 shrink-0',
  cross: 'lucide lucide-circle-x h-4 w-4 shrink-0',
  printer: 'lucide lucide-printer h-4 w-4 shrink-0',
  x: 'lucide lucide-x h-4 w-4',
};

const cashClass = (type) => CASH_BASE_CLASS + (type === 'success' ? SUCCESS_TONE : ERROR_TONE);
const receiptClass = (type) => RECEIPT_BASE_CLASS + (type === 'success' ? SUCCESS_TONE : ERROR_TONE);
const printClass = (type) => PRINT_BASE_CLASS + (type === 'warning' ? WARNING_TONE : ERROR_TONE);

const CASH = { type: 'success', message: 'Cash drop recorded.' };
const RECEIPT = { type: 'success', message: 'Receipt emailed to a@b.co.' };
const PRINT = { type: 'warning', message: 'No printer configured — opened browser print preview.' };

/**
 * The original R27 block, copied from POSSales.jsx before extraction: the three toasts with
 * their guards, comments and the inline print-dismiss handler. The POSSales-owned values
 * arrive as props with their POSSales names; nothing else is changed.
 */
function OriginalFeedbackToasts({ cashDropFeedback, receiptShareFeedback, printFeedback, setPrintFeedback }) {
  return (
    <>
      {/* Cash Drop feedback toast */}
      {cashDropFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${cashDropFeedback.type === 'success' ? 'bg-[#327F74] text-white' : 'bg-red-500 text-white'}`}>
          {cashDropFeedback.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {cashDropFeedback.message}
        </div>
      )}

      {/* Share Receipt feedback toast */}
      {receiptShareFeedback && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[220] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${receiptShareFeedback.type === 'success' ? 'bg-[#327F74] text-white' : 'bg-red-500 text-white'}`}
        >
          {receiptShareFeedback.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {receiptShareFeedback.message}
        </div>
      )}

      {/* Print fallback toast — explains why a browser print-preview just opened
          (no printer configured, or the configured one/agent didn't respond). */}
      {printFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md ${printFeedback.type === 'warning' ? 'bg-amber-500 text-gray-900' : 'bg-red-500 text-white'}`}>
          <Printer className="h-4 w-4 shrink-0" />
          <span>{printFeedback.message}</span>
          <button type="button" onClick={() => setPrintFeedback(null)} className="ml-1 shrink-0 opacity-80 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The post-extraction R27 block, written with the exact expressions POSSales now uses: the
 * three values are handed straight through and the dismiss arrow stays in the parent.
 */
function ExtractedFeedbackToasts({ cashDropFeedback, receiptShareFeedback, printFeedback, setPrintFeedback }) {
  return (
    <PosFeedbackToasts
      cashDropFeedback={cashDropFeedback}
      receiptShareFeedback={receiptShareFeedback}
      printFeedback={printFeedback}
      onDismissPrintFeedback={() => setPrintFeedback(null)}
    />
  );
}

// Behavioural tests run against each POSSales-shaped block (same POSSales input).
const SUBJECTS = [
  ['original R27 block', OriginalFeedbackToasts],
  ['PosFeedbackToasts wired like POSSales', ExtractedFeedbackToasts],
];

// Identify a rendered toast by its unique class signature, never by position.
const kindOf = (el) => {
  const cls = el.getAttribute('class') || '';
  if (cls.includes('z-[220]')) return 'receipt';
  if (cls.includes('max-w-md')) return 'print';
  if (cls.includes('transition-all')) return 'cash';
  return `unknown:${el.tagName}`;
};
const kinds = (container) => Array.from(container.children).map(kindOf);
const toast = (container, kind) => Array.from(container.children).find((c) => kindOf(c) === kind);
const nodeSeq = (el) => Array.from(el.childNodes).map((n) => (n.nodeType === 3 ? `#${n.textContent}` : `${n.tagName.toLowerCase()}.${n.getAttribute('class')}`));
const attrs = (el) => Array.from(el.attributes).map((a) => a.name).sort();
const tokens = (el) => el.getAttribute('class').split(' ');

const COMBOS = [
  ['none visible', {}, []],
  ['cash-drop only', { cashDropFeedback: CASH }, ['cash']],
  ['receipt-share only', { receiptShareFeedback: RECEIPT }, ['receipt']],
  ['print only', { printFeedback: PRINT }, ['print']],
  ['cash-drop + receipt-share', { cashDropFeedback: CASH, receiptShareFeedback: RECEIPT }, ['cash', 'receipt']],
  ['cash-drop + print', { cashDropFeedback: CASH, printFeedback: PRINT }, ['cash', 'print']],
  ['receipt-share + print', { receiptShareFeedback: RECEIPT, printFeedback: PRINT }, ['receipt', 'print']],
  ['all three', { cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT }, ['cash', 'receipt', 'print']],
];

const NULL_PROPS = { cashDropFeedback: null, receiptShareFeedback: null, printFeedback: null };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * POSSales-shaped owner: all three values live in the parent (printFeedback/setPrintFeedback
 * as returned by usePosPrinting). The siblings stand in for the reprint modal before R27, the
 * Reprint Confirm dialog directly after it, and the delivery modals much later in the tree.
 */
function makeHarness(Block) {
  const control = {};
  function Harness({ initial = {} }) {
    const [cashDropFeedback, setCashDropFeedback] = useState(initial.cashDropFeedback ?? null);
    const [receiptShareFeedback, setReceiptShareFeedback] = useState(initial.receiptShareFeedback ?? null);
    const [printFeedback, setPrintFeedback] = useState(initial.printFeedback ?? null);
    useEffect(() => {
      Object.assign(control, { setCashDropFeedback, setReceiptShareFeedback, setPrintFeedback });
    }, []);
    return (
      <>
        <div data-testid="reprint-modal" />
        <Block
          cashDropFeedback={cashDropFeedback}
          receiptShareFeedback={receiptShareFeedback}
          printFeedback={printFeedback}
          setPrintFeedback={setPrintFeedback}
        />
        <div data-testid="reprint-confirm-dialog" />
        <div data-testid="delivery-modal" />
      </>
    );
  }
  return { Harness, control };
}

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  const renderSubject = (props = {}) => render(<Subject {...NULL_PROPS} setPrintFeedback={vi.fn()} {...props} />);

  describe('visibility guards', () => {
    it.each([
      ['cashDropFeedback'],
      ['receiptShareFeedback'],
      ['printFeedback'],
    ])('%s: renders nothing for null, undefined, false and empty string', (prop) => {
      for (const value of [null, undefined, false, '']) {
        const { container } = renderSubject({ [prop]: value });
        expect(container.innerHTML, String(value)).toBe('');
        cleanup();
      }
    });

    // `&&` short-circuit: a falsy number is itself rendered, the toast is not.
    it.each([
      ['cashDropFeedback'],
      ['receiptShareFeedback'],
      ['printFeedback'],
    ])('%s: renders the bare value and no toast for 0 and NaN', (prop) => {
      expect(renderSubject({ [prop]: 0 }).container.innerHTML).toBe('0');
      cleanup();
      expect(renderSubject({ [prop]: NaN }).container.innerHTML).toBe('NaN');
    });

    it('with all three at 0, renders three bare zeros in cash, receipt, print order', () => {
      const { container } = renderSubject({ cashDropFeedback: 0, receiptShareFeedback: 0, printFeedback: 0 });
      expect(container.innerHTML).toBe('000');
      expect(container.childNodes).toHaveLength(3);
    });

    it.each([
      ['cashDropFeedback', 'cash', cashClass(undefined)],
      ['receiptShareFeedback', 'receipt', receiptClass(undefined)],
      ['printFeedback', 'print', printClass(undefined)],
    ])('%s: any truthy value mounts the toast (empty object → error tone, empty message)', (prop, kind, cls) => {
      const { container } = renderSubject({ [prop]: {} });
      expect(kinds(container)).toEqual([kind]);
      expect(toast(container, kind).getAttribute('class')).toBe(cls);
      expect(toast(container, kind).textContent).toBe('');
    });

    it('mounts inline (no portal) and adds no wrapper element', () => {
      const { container } = renderSubject({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      expect(document.body.children).toHaveLength(1);
      expect(container.children).toHaveLength(3);
      for (const child of container.children) expect(child.parentElement).toBe(container);
    });
  });

  describe('cash-drop toast', () => {
    it.each([
      ['success', ICON_CLASS.check, SUCCESS_TONE],
      ['error', ICON_CLASS.cross, ERROR_TONE],
      ['info (not success)', ICON_CLASS.cross, ERROR_TONE],
      ['undefined', ICON_CLASS.cross, ERROR_TONE],
    ])('type %s → exact class, icon and text-node nesting', (label, icon, tone) => {
      const type = label.split(' ')[0] === 'undefined' ? undefined : label.split(' ')[0];
      const { container } = renderSubject({ cashDropFeedback: { type, message: 'Cash out recorded.' } });
      const el = toast(container, 'cash');
      expect(container.children).toHaveLength(1);
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('class')).toBe(CASH_BASE_CLASS + tone);
      expect(attrs(el)).toEqual(['class']);
      expect(nodeSeq(el)).toEqual([`svg.${icon}`, '#Cash out recorded.']);
      expect(el.firstChild).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders the message raw as a single text node (no span), escaping markup', () => {
      const { container } = renderSubject({ cashDropFeedback: { type: 'error', message: '<b>Failed</b> & retry' } });
      const el = toast(container, 'cash');
      expect(el.childNodes[1].nodeType).toBe(3);
      expect(el.textContent).toBe('<b>Failed</b> & retry');
      expect(el.querySelector('b')).toBeNull();
    });

    it.each([
      ['undefined', undefined, 1, ''],
      ['null', null, 1, ''],
      ['a number', 42, 2, '42'],
    ])('message %s', (_name, message, nodes, text) => {
      const { container } = renderSubject({ cashDropFeedback: { type: 'success', message } });
      const el = toast(container, 'cash');
      expect(el.childNodes).toHaveLength(nodes);
      expect(el.textContent).toBe(text);
    });

    it('has no role, no aria-live and no button', () => {
      const { container } = renderSubject({ cashDropFeedback: CASH });
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(container.querySelector('[aria-live]')).toBeNull();
    });
  });

  describe('receipt-share toast', () => {
    it.each([
      ['success', ICON_CLASS.check, SUCCESS_TONE],
      ['error', ICON_CLASS.cross, ERROR_TONE],
      ['warning', ICON_CLASS.cross, ERROR_TONE],
      [undefined, ICON_CLASS.cross, ERROR_TONE],
    ])('type %s → exact class, role, icon and text-node nesting', (type, icon, tone) => {
      const { container } = renderSubject({ receiptShareFeedback: { type, message: 'WhatsApp opened with the receipt message.' } });
      const el = toast(container, 'receipt');
      expect(container.children).toHaveLength(1);
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('class')).toBe(RECEIPT_BASE_CLASS + tone);
      expect(attrs(el)).toEqual(['class', 'role']);
      expect(el.getAttribute('role')).toBe('status');
      expect(nodeSeq(el)).toEqual([`svg.${icon}`, '#WhatsApp opened with the receipt message.']);
    });

    it('is the only status region, with no aria-live/aria-atomic/aria-label of its own', () => {
      const { container } = renderSubject({ ...NULL_PROPS, cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      const statuses = screen.getAllByRole('status');
      expect(statuses).toEqual([toast(container, 'receipt')]);
      expect(statuses[0].textContent).toBe(RECEIPT.message);
      for (const attr of ['aria-live', 'aria-atomic', 'aria-label', 'aria-labelledby', 'tabindex', 'id']) {
        expect(statuses[0].hasAttribute(attr), attr).toBe(false);
      }
    });

    it('has no transition-all and no max-w-md', () => {
      const { container } = renderSubject({ receiptShareFeedback: RECEIPT });
      expect(tokens(toast(container, 'receipt'))).not.toContain('transition-all');
      expect(tokens(toast(container, 'receipt'))).not.toContain('max-w-md');
    });
  });

  describe('print toast', () => {
    it.each([
      ['warning', WARNING_TONE],
      ['error', ERROR_TONE],
      ['success (not warning)', ERROR_TONE],
      ['undefined', ERROR_TONE],
    ])('type %s → exact class, printer icon, span message and dismiss button', (label, tone) => {
      const raw = label.split(' ')[0];
      const type = raw === 'undefined' ? undefined : raw;
      const { container } = renderSubject({ printFeedback: { type, message: 'Printer offline' } });
      const el = toast(container, 'print');
      expect(container.children).toHaveLength(1);
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('class')).toBe(PRINT_BASE_CLASS + tone);
      expect(attrs(el)).toEqual(['class']);
      expect(nodeSeq(el)).toEqual([`svg.${ICON_CLASS.printer}`, 'span.null', 'button.' + PRINT_BUTTON_CLASS]);
      const span = el.children[1];
      expect(attrs(span)).toEqual([]);
      expect(nodeSeq(span)).toEqual(['#Printer offline']);
      const btn = el.children[2];
      expect(attrs(btn)).toEqual(['class', 'type']);
      expect(btn.getAttribute('type')).toBe('button');
      expect(nodeSeq(btn)).toEqual([`svg.${ICON_CLASS.x}`]);
    });

    it('the dismiss button has no accessible name (icon only) and is the only button', () => {
      renderSubject({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toBe('');
      expect(buttons[0]).not.toHaveAttribute('aria-label');
      expect(buttons[0]).not.toHaveAttribute('title');
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
    ])('message %s → an empty span is still rendered', (_name, message) => {
      const { container } = renderSubject({ printFeedback: { type: 'warning', message } });
      const span = toast(container, 'print').children[1];
      expect(span.tagName).toBe('SPAN');
      expect(span.childNodes).toHaveLength(0);
    });

    it('the dismiss button calls setPrintFeedback(null) exactly once per click, with no event', async () => {
      const setPrintFeedback = vi.fn();
      renderSubject({ printFeedback: PRINT, setPrintFeedback });
      await userEvent.click(screen.getByRole('button'));
      expect(setPrintFeedback).toHaveBeenCalledTimes(1);
      expect(setPrintFeedback.mock.calls[0]).toEqual([null]);
      await userEvent.click(screen.getByRole('button').firstChild);
      expect(setPrintFeedback).toHaveBeenCalledTimes(2);
      expect(setPrintFeedback.mock.calls[1]).toEqual([null]);
    });

    it('does not unmount by itself when the owner ignores the call', async () => {
      const { container } = renderSubject({ printFeedback: PRINT, setPrintFeedback: () => {} });
      await userEvent.click(screen.getByRole('button'));
      expect(kinds(container)).toEqual(['print']);
    });

    it.each([
      ['the toast body', (c) => toast(c, 'print')],
      ['the printer icon', (c) => toast(c, 'print').children[0]],
      ['the message span', (c) => toast(c, 'print').children[1]],
    ])('a click on %s does not dismiss', async (_name, pick) => {
      const setPrintFeedback = vi.fn();
      const { container } = renderSubject({ printFeedback: PRINT, setPrintFeedback });
      await userEvent.click(pick(container));
      expect(setPrintFeedback).not.toHaveBeenCalled();
    });

    it('Escape does not dismiss', async () => {
      const setPrintFeedback = vi.fn();
      renderSubject({ printFeedback: PRINT, setPrintFeedback });
      await userEvent.keyboard('{Escape}');
      expect(setPrintFeedback).not.toHaveBeenCalled();
    });
  });

  describe('stacking: z-index, positioning and DOM order', () => {
    it('all three share the exact bottom-centre fixed positioning, and nothing else positions them', () => {
      const { container } = renderSubject({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      for (const el of container.children) {
        expect(el.getAttribute('class').startsWith(`${POSITION} z-[`)).toBe(true);
        const positional = tokens(el).filter((t) => /^(fixed|absolute|relative|sticky|bottom-|top-|left-|right-|inset-|-?translate-|z-)/.test(t));
        expect(positional).toEqual(['fixed', 'bottom-6', 'left-1/2', '-translate-x-1/2', kindOf(el) === 'receipt' ? 'z-[220]' : 'z-[200]']);
        expect(el.getAttribute('style')).toBeNull();
      }
    });

    it('receipt-share is z-[220]; cash-drop and print are z-[200]', () => {
      const { container } = renderSubject({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      const z = (kind) => tokens(toast(container, kind)).filter((t) => t.startsWith('z-'));
      expect(z('cash')).toEqual(['z-[200]']);
      expect(z('receipt')).toEqual(['z-[220]']);
      expect(z('print')).toEqual(['z-[200]']);
    });

    it.each(COMBOS)('%s → renders exactly those toasts in cash, receipt, print order', (_name, props, expected) => {
      const { container } = renderSubject(props);
      expect(kinds(container)).toEqual(expected);
      expect(container.childNodes).toHaveLength(expected.length);
    });

    it('print follows cash-drop in document order when both are visible (same z-index → print paints on top)', () => {
      const { container } = renderSubject({ cashDropFeedback: CASH, printFeedback: PRINT });
      const cash = toast(container, 'cash');
      const print = toast(container, 'print');
      expect(cash.compareDocumentPosition(print) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(cash.nextElementSibling).toBe(print);
    });

    it('receipt-share sits between cash-drop and print when all are visible', () => {
      const { container } = renderSubject({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      expect(toast(container, 'cash').nextElementSibling).toBe(toast(container, 'receipt'));
      expect(toast(container, 'receipt').nextElementSibling).toBe(toast(container, 'print'));
    });
  });

  describe('no timers of its own', () => {
    it('schedules nothing and keeps every toast mounted however long it is left', () => {
      vi.useFakeTimers();
      const { container } = renderSubject({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
      expect(vi.getTimerCount()).toBe(0);
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(kinds(container)).toEqual(['cash', 'receipt', 'print']);
    });
  });

  describe('stateful POSSales-shaped harness', () => {
    const siblingOrder = (container) => Array.from(container.children).map((c) => c.getAttribute('data-testid') || kindOf(c));

    it('sits between the reprint modal and the reprint-confirm dialog, before the delivery modals', () => {
      const { Harness } = makeHarness(Subject);
      const { container } = render(<Harness initial={{ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT }} />);
      expect(siblingOrder(container)).toEqual(['reprint-modal', 'cash', 'receipt', 'print', 'reprint-confirm-dialog', 'delivery-modal']);
    });

    it('with no toasts, leaves only the siblings', () => {
      const { Harness } = makeHarness(Subject);
      const { container } = render(<Harness />);
      expect(siblingOrder(container)).toEqual(['reprint-modal', 'reprint-confirm-dialog', 'delivery-modal']);
    });

    it('dismissing print clears the owner state and unmounts only print; other nodes are preserved', async () => {
      const { Harness } = makeHarness(Subject);
      const { container } = render(<Harness initial={{ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT }} />);
      const cash = toast(container, 'cash');
      const receipt = toast(container, 'receipt');
      await userEvent.click(screen.getByRole('button'));
      expect(siblingOrder(container)).toEqual(['reprint-modal', 'cash', 'receipt', 'reprint-confirm-dialog', 'delivery-modal']);
      expect(toast(container, 'cash')).toBe(cash);
      expect(toast(container, 'receipt')).toBe(receipt);
    });

    it('toggling one toast never remounts the others (DOM node identity is kept)', () => {
      const { Harness, control } = makeHarness(Subject);
      const { container } = render(<Harness initial={{ cashDropFeedback: CASH, printFeedback: PRINT }} />);
      const cash = toast(container, 'cash');
      const print = toast(container, 'print');
      act(() => control.setReceiptShareFeedback(RECEIPT));
      expect(siblingOrder(container)).toEqual(['reprint-modal', 'cash', 'receipt', 'print', 'reprint-confirm-dialog', 'delivery-modal']);
      expect(toast(container, 'cash')).toBe(cash);
      expect(toast(container, 'print')).toBe(print);
      const receipt = toast(container, 'receipt');
      act(() => control.setCashDropFeedback(null));
      expect(toast(container, 'receipt')).toBe(receipt);
      expect(toast(container, 'print')).toBe(print);
      act(() => control.setCashDropFeedback({ type: 'error', message: 'Failed to record cash movement.' }));
      expect(siblingOrder(container)).toEqual(['reprint-modal', 'cash', 'receipt', 'print', 'reprint-confirm-dialog', 'delivery-modal']);
      expect(toast(container, 'print')).toBe(print);
    });

    it('updating a visible toast patches it in place (class and text), keeping the node', () => {
      const { Harness, control } = makeHarness(Subject);
      const { container } = render(<Harness initial={{ cashDropFeedback: CASH, printFeedback: PRINT }} />);
      const cash = toast(container, 'cash');
      const print = toast(container, 'print');
      act(() => control.setCashDropFeedback({ type: 'error', message: 'Select a category before saving.' }));
      act(() => control.setPrintFeedback({ type: 'error', message: 'Print failed' }));
      expect(toast(container, 'cash')).toBe(cash);
      expect(cash.getAttribute('class')).toBe(cashClass('error'));
      expect(nodeSeq(cash)).toEqual([`svg.${ICON_CLASS.cross}`, '#Select a category before saving.']);
      expect(toast(container, 'print')).toBe(print);
      expect(print.getAttribute('class')).toBe(printClass('error'));
      expect(print.children[1].textContent).toBe('Print failed');
    });
  });
});

describe('PosFeedbackToasts (child surface)', () => {
  const renderChild = (props = {}) => render(
    <PosFeedbackToasts {...NULL_PROPS} onDismissPrintFeedback={vi.fn()} {...props} />,
  );

  it('renders nothing at all when none of the three values is set', () => {
    const { container } = renderChild();
    expect(container.innerHTML).toBe('');
  });

  it('adds no wrapper element of its own — the toasts are direct children of the parent slot', () => {
    const { container } = renderChild({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
    expect(kinds(container)).toEqual(['cash', 'receipt', 'print']);
    expect(container.childNodes).toHaveLength(3);
  });

  it('keeps its own guards: each value is independently optional', () => {
    const { container, rerender } = renderChild({ printFeedback: PRINT });
    expect(kinds(container)).toEqual(['print']);
    rerender(<PosFeedbackToasts {...NULL_PROPS} cashDropFeedback={CASH} onDismissPrintFeedback={vi.fn()} />);
    expect(kinds(container)).toEqual(['cash']);
  });

  it('hands onDismissPrintFeedback straight to the button, which receives the click event', async () => {
    const onDismissPrintFeedback = vi.fn();
    renderChild({ printFeedback: PRINT, onDismissPrintFeedback });
    await userEvent.click(screen.getByRole('button'));
    expect(onDismissPrintFeedback).toHaveBeenCalledTimes(1);
    expect(onDismissPrintFeedback.mock.calls[0]).toHaveLength(1);
    expect(onDismissPrintFeedback.mock.calls[0][0]).toHaveProperty('type', 'click');
  });

  it('never calls the dismiss callback on render or from the other toasts', async () => {
    const onDismissPrintFeedback = vi.fn();
    const { container } = renderChild({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, onDismissPrintFeedback });
    await userEvent.click(toast(container, 'cash'));
    await userEvent.click(toast(container, 'receipt'));
    expect(onDismissPrintFeedback).not.toHaveBeenCalled();
  });

  it('owns no timers: nothing is scheduled on mount, update or unmount', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderChild({ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT });
    expect(vi.getTimerCount()).toBe(0);
    rerender(<PosFeedbackToasts {...NULL_PROPS} cashDropFeedback={CASH} onDismissPrintFeedback={vi.fn()} />);
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('PosFeedbackToasts DOM parity', () => {
  const renderedHtml = (Block, props) => {
    const { container } = render(<Block {...NULL_PROPS} setPrintFeedback={() => {}} {...props} />);
    const html = container.innerHTML;
    cleanup();
    return html;
  };

  const PARITY_INPUTS = [
    ...COMBOS.map(([name, props]) => [name, props]),
    ['error tones everywhere', { cashDropFeedback: { type: 'error', message: 'Failed to record cash movement.' }, receiptShareFeedback: { type: 'error', message: 'Share failed.' }, printFeedback: { type: 'error', message: 'Print failed.' } }],
    ['unknown types', { cashDropFeedback: { type: 'info', message: 'a' }, receiptShareFeedback: { type: 'warning', message: 'b' }, printFeedback: { type: 'success', message: 'c' } }],
    ['missing types and messages', { cashDropFeedback: {}, receiptShareFeedback: {}, printFeedback: {} }],
    ['falsy non-null values', { cashDropFeedback: 0, receiptShareFeedback: '', printFeedback: false }],
    ['numeric and markup-like messages', { cashDropFeedback: { type: 'success', message: 42 }, receiptShareFeedback: { type: 'success', message: '<b>x</b> & y' }, printFeedback: { type: 'warning', message: 'EPSON TM-T88VI — StartDocPrinter refused' } }],
  ];

  it.each(PARITY_INPUTS)('renders identical DOM to the pre-extraction block — %s', (_name, props) => {
    const original = renderedHtml(OriginalFeedbackToasts, props);
    const extracted = renderedHtml(ExtractedFeedbackToasts, props);
    expect(extracted).toBe(original);
  });

  it('renders identical DOM inside the POSSales-shaped harness, toasts and siblings alike', () => {
    const html = (Subject) => {
      const { Harness } = makeHarness(Subject);
      const { container } = render(<Harness initial={{ cashDropFeedback: CASH, receiptShareFeedback: RECEIPT, printFeedback: PRINT }} />);
      const out = container.innerHTML;
      cleanup();
      return out;
    };
    expect(html(ExtractedFeedbackToasts)).toBe(html(OriginalFeedbackToasts));
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary — the
 * three values, their timers and the dismiss setter stay in POSSales, the markup moved out, and
 * R27 keeps its DOM position between the reprint modal and the Reprint Confirm dialog (with the
 * delivery modals still much later) — is asserted against its source.
 */
describe('POSSales wiring (PosFeedbackToasts boundary)', () => {
  // EOL-normalised: POSSales.jsx may be checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');
  const CHILD = read('../features/notifications/PosFeedbackToasts.jsx');
  const USE_POS_PRINTING = read('../device/printing/usePosPrinting.js');

  const at = (needle) => {
    const i = POS_SALES.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it('renders the child at the exact R27 location with the three values and the dismiss arrow', () => {
    expect(POS_SALES).toContain(
      [
        '      {/* Cash Drop / Share Receipt / Print fallback feedback toasts */}',
        '      <PosFeedbackToasts',
        '        cashDropFeedback={cashDropFeedback}',
        '        receiptShareFeedback={receiptShareFeedback}',
        '        printFeedback={printFeedback}',
        '        onDismissPrintFeedback={() => setPrintFeedback(null)}',
        '      />',
      ].join('\n'),
    );
  });

  it('sits directly after the reprint modal and directly before the Reprint Confirm popup', () => {
    expect(POS_SALES).toMatch(
      /\n {6}\}\)\(\)\}\n\n {6}\{\/\* Cash Drop \/ Share Receipt \/ Print fallback feedback toasts \*\/\}\n {6}<PosFeedbackToasts\n(?: {8}\w+=\{[^\n]*\}\n){4} {6}\/>\n\n {6}\{\/\* Reprint Confirm Popup \*\/\}\n {6}<Dialog open=\{reprintConfirmOpen\} onOpenChange=\{setReprintConfirmOpen\}>\n/,
    );
  });

  it('keeps the delivery modals after R27, and the barcode/showFeedback toaster outside it', () => {
    const toasts = at('      <PosFeedbackToasts\n');
    expect(at('      {showDeliveryModal && (\n')).toBeGreaterThan(toasts);
    // The capture modal and its nested Add-Address modal now render from NewDeliveryOrder, still
    // from that one guarded call site and still below the toaster.
    expect(at('        <NewDeliveryOrder\n')).toBeGreaterThan(toasts);
    // showFeedback (the barcode scan toaster) stays a POSSales-owned callback handed to POSTouchScreen.
    expect(POS_SALES).toContain('  const showFeedback = useCallback((type, message) => {\n    setBarcodeScanFeedback({ type, message });\n    setTimeout(() => setBarcodeScanFeedback(null), 2500);\n  }, []);');
    expect(POS_SALES).toContain('    barcodeScanFeedback, lastScannedItem, handleBarcodeScan, handleUnifiedEntry,');
    expect(CHILD).not.toContain('showFeedback');
    expect(CHILD).not.toContain('barcodeScanFeedback');
  });

  it('keeps all three values owned by POSSales', () => {
    expect(POS_SALES).toContain('  const [receiptShareFeedback, setReceiptShareFeedback] = useState(null);');
    expect(POS_SALES).toContain('  const [cashDropFeedback, setCashDropFeedback] = useState(null);');
    expect(POS_SALES).toContain('    printFeedback, setPrintFeedback,');
  });

  it('keeps every toast-producing handler, timer and cleanup effect in POSSales / usePosPrinting', () => {
    // Cash-drop: eight setter calls, including its own inline timers, unchanged.
    expect(POS_SALES.match(/setCashDropFeedback\(/g)).toHaveLength(8);
    expect(POS_SALES).toContain("      setCashDropFeedback({ type: 'success', message: cashDropType === 'in' ? 'Cash drop recorded.' : 'Cash out recorded.' });");
    expect(POS_SALES).toContain('    setTimeout(() => setCashDropFeedback(null), 3000);');
    expect(POS_SALES).toContain('      setTimeout(() => setCashDropFeedback(null), 5000);');
    // Receipt-share: three producers plus the 3500ms cleanup effect.
    expect(POS_SALES.match(/setReceiptShareFeedback\(/g)).toHaveLength(4);
    expect(POS_SALES).toContain('  useEffect(() => {\n    if (!receiptShareFeedback) return undefined;\n    const t = setTimeout(() => setReceiptShareFeedback(null), 3500);\n    return () => clearTimeout(t);\n  }, [receiptShareFeedback]);');
    // Print: produced and auto-cleared inside usePosPrinting; POSSales only reads and dismisses.
    expect(USE_POS_PRINTING).toContain('setTimeout(() => setPrintFeedback(null), 6000);');
    expect(USE_POS_PRINTING).toContain('setTimeout(() => setPrintFeedback(null), 10000);');
    expect(POS_SALES.match(/setPrintFeedback/g)).toHaveLength(2);
  });

  it('no longer contains the moved markup', () => {
    for (const gone of [
      '{cashDropFeedback && (',
      '{receiptShareFeedback && (',
      '{printFeedback && (',
      'cashDropFeedback.type',
      'cashDropFeedback.message',
      'receiptShareFeedback.type',
      'receiptShareFeedback.message',
      'printFeedback.type',
      'printFeedback.message',
      'z-[220]',
      // The print toast's full class string; bare `max-w-md` stays in use by other POSSales dialogs.
      'text-sm font-medium max-w-md ${printFeedback',
      '{/* Cash Drop feedback toast */}',
      '{/* Share Receipt feedback toast */}',
      'Print fallback toast',
    ]) {
      expect(POS_SALES, gone).not.toContain(gone);
    }
  });

  it('keeps the child a pure presentational fragment — no hooks, state, timers or business logic', () => {
    const code = CHILD.replace(/^\s*\/\/.*$/gm, '');
    for (const token of [
      'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'createContext',
      'React.memo', 'memo(', 'setTimeout', 'clearTimeout', 'setInterval',
      'setCashDropFeedback', 'setReceiptShareFeedback', 'setPrintFeedback',
      'PosWorkspaceContext', 'createPortal', '@radix-ui', 'components/ui/', 'api/',
    ]) {
      expect(code, token).not.toContain(token);
    }
    expect(code).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(CHILD).toContain('function PosFeedbackToasts({ cashDropFeedback, receiptShareFeedback, printFeedback, onDismissPrintFeedback }) {');
    expect(CHILD).toContain('onClick={onDismissPrintFeedback}');
  });

  it('keeps the child markup in cash-drop, receipt-share, print order inside a bare fragment', () => {
    const cash = CHILD.indexOf('{cashDropFeedback && (');
    const receipt = CHILD.indexOf('{receiptShareFeedback && (');
    const print = CHILD.indexOf('{printFeedback && (');
    expect(cash).toBeGreaterThan(-1);
    expect([cash, receipt, print]).toEqual([...[cash, receipt, print]].sort((a, b) => a - b));
    // A bare fragment: the only wrapper is <>…</>, so nothing new joins the stacking context.
    // The first thing inside it is the cash-drop guard, and the last is the print guard's close.
    expect(CHILD).toContain('  return (\n    <>\n      {/* Cash Drop feedback toast */}\n      {cashDropFeedback && (');
    expect(CHILD).toContain('      )}\n    </>\n  );\n');
    // Nothing but a comment/guard may follow the fragment open — no wrapper element.
    expect(CHILD).not.toMatch(/<>\s*\n\s*<(?!\/)/);
    // Exactly three top-level toast roots, each a <div> at the fragment's own indentation.
    expect(CHILD.match(/^ {8}<div\b/gm)).toHaveLength(3);
    // Counted in the markup only — the file header comment names the same z-indices.
    const markup = CHILD.replace(/^\s*\/\/.*$/gm, '');
    expect(markup.match(/z-\[200\]/g)).toHaveLength(2);
    expect(markup.match(/z-\[220\]/g)).toHaveLength(1);
  });

  it('imports and renders PosFeedbackToasts exactly once', () => {
    expect(POS_SALES).toContain("import PosFeedbackToasts from './POS/features/notifications/PosFeedbackToasts';");
    expect(POS_SALES.match(/<PosFeedbackToasts\b/g)).toHaveLength(1);
  });
});
