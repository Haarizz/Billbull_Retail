import fs from 'node:fs';
import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowDown, ArrowUp, CheckCircle, X } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent } from '../../../../components/ui/dialog';
import CashDropDialog from '../features/session/CashDropDialog';

// Pinned verbatim from the POSSales.jsx R18 Cash Drop/Out dialog before extraction.
const TITLE = 'Cash Drop / Out';
const SUBTITLE = 'Record cash movements other than sales';
const CONTENT_CLASS = 'sm:max-w-md border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden';
const SELECT_CLASS = 'w-full h-11 pl-4 pr-10 text-sm font-medium text-[#1E293B] border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40 cursor-pointer';
const INPUT_CLASS = 'w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40';

/**
 * The original R18 Cash Drop/Out dialog markup, copied from POSSales.jsx before extraction.
 * State reads and handler expressions are lifted to props unchanged.
 */
function OriginalCashDropMarkup({
  open,
  onOpenChange,
  cashDropType,
  onCashDropTypeChange,
  cashDropAmount,
  onCashDropAmountChange,
  cashDropCategories,
  cashDropCategoryRequired,
  cashDropCategoryId,
  onCashDropCategoryIdChange,
  cashDropDescription,
  onCashDropDescriptionChange,
  onClose,
  onRecord,
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${cashDropType === 'in' ? 'bg-[#327F74]/10' : 'bg-red-50'}`}>
                  {cashDropType === 'in'
                    ? <ArrowDown className="h-5 w-5 text-[#327F74]" />
                    : <ArrowUp className="h-5 w-5 text-red-500" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Cash Drop / Out</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Record cash movements other than sales</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Type dropdown */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <div className="relative">
                <select
                  value={cashDropType}
                  onChange={onCashDropTypeChange}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium text-[#1E293B] border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40 cursor-pointer"
                >
                  <option value="in">Cash Drop (IN) - Add cash to drawer</option>
                  <option value="out">Cash Out - Pay for expenses</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Amount (AED)</label>
              <input
                type="number"
                value={cashDropAmount}
                onChange={onCashDropAmountChange}
                placeholder="0.00"
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40"
              />
            </div>

            {/* Category (Phase 2 — optional unless the branch requires it) */}
            {(cashDropCategories.length > 0 || cashDropCategoryRequired) && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Category{cashDropCategoryRequired ? ' *' : ' (optional)'}
                </label>
                <select
                  value={cashDropCategoryId}
                  onChange={onCashDropCategoryIdChange}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium text-[#1E293B] border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40 cursor-pointer"
                >
                  <option value="">{cashDropCategoryRequired ? 'Select a category...' : 'Uncategorized'}</option>
                  {cashDropCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description / Purpose</label>
              <input
                type="text"
                value={cashDropDescription}
                onChange={onCashDropDescriptionChange}
                placeholder={cashDropType === 'in' ? 'e.g., Cash from admin safe' : 'e.g., Office supplies, Cleaning'}
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onRecord}
              className={`h-10 px-6 text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors ${cashDropType === 'in'
                  ? 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
            >
              <CheckCircle className="h-4 w-4" />
              Record {cashDropType === 'in' ? 'Cash Drop' : 'Cash Out'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
  );
}

const SUBJECTS = [
  ['original R18 Cash Drop/Out markup', OriginalCashDropMarkup],
  ['CashDropDialog', CashDropDialog],
];

const noop = () => {};
const CATEGORIES = [{ id: 7, name: 'Petty cash' }, { id: 'c-9', name: 'Cleaning' }];

function propsFor(overrides = {}) {
  return {
    open: true,
    onOpenChange: noop,
    cashDropType: 'in',
    onCashDropTypeChange: noop,
    cashDropAmount: '',
    onCashDropAmountChange: noop,
    cashDropCategories: [],
    cashDropCategoryRequired: false,
    cashDropCategoryId: '',
    onCashDropCategoryIdChange: noop,
    cashDropDescription: '',
    onCashDropDescriptionChange: noop,
    onClose: noop,
    onRecord: noop,
    ...overrides,
  };
}

const dialog = () => screen.getByRole('dialog');
const buttons = () => Array.from(dialog().querySelectorAll('button'));
const headerXButton = () => buttons()[0];
const cancelButton = () => within(dialog()).getByRole('button', { name: 'Cancel' });
const recordButton = () => within(dialog()).getByRole('button', { name: /^Record / });
/** The DialogContent primitive's own close button — CSS-hidden via [&>button:last-child]:hidden, still in the DOM. */
const radixCloseButton = () => within(dialog()).getByRole('button', { name: 'Close' });
const selects = () => Array.from(dialog().querySelectorAll('select'));
const typeSelect = () => selects()[0];
const categorySelect = () => (selects().length > 1 ? selects()[1] : null);
const amountInput = () => dialog().querySelector('input[type="number"]');
const descriptionInput = () => dialog().querySelector('input[type="text"]');
const labels = () => Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent);
const flushRadixOutsideListener = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(() => {
  cleanup();
});

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('open / closed lifecycle', () => {
    it('renders nothing when open is false', () => {
      const { container } = render(<Subject {...propsFor({ open: false })} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(container.innerHTML).toBe('');
      expect(document.body.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    });

    it('renders the dialog into a portal when open', () => {
      const { container } = render(<Subject {...propsFor()} />);
      expect(dialog()).toHaveAttribute('data-state', 'open');
      expect(dialog()).toHaveAttribute('data-slot', 'dialog-content');
      expect(container.contains(dialog())).toBe(false);
      expect(container.innerHTML).toBe('');
    });

    it('opens and closes in place as the parent flips open (always mounted)', () => {
      const { rerender } = render(<Subject {...propsFor({ open: false })} />);
      rerender(<Subject {...propsFor({ open: true })} />);
      expect(dialog()).toBeInTheDocument();
      rerender(<Subject {...propsFor({ open: false })} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      rerender(<Subject {...propsFor({ open: true })} />);
      expect(dialog()).toBeInTheDocument();
    });
  });

  describe('markup', () => {
    it('applies the exact DialogContent classes, including the built-in close hider', () => {
      render(<Subject {...propsFor()} />);
      for (const cls of CONTENT_CLASS.split(' ')) expect(dialog()).toHaveClass(cls);
    });

    it('renders the header title, subtitle and direction icon for "in"', () => {
      render(<Subject {...propsFor({ cashDropType: 'in' })} />);
      const h2 = within(dialog()).getByRole('heading', { level: 2 });
      expect(h2).toHaveTextContent(TITLE);
      expect(h2.className).toBe('text-base font-bold text-[#1E293B]');
      const sub = screen.getByText(SUBTITLE);
      expect(sub.tagName).toBe('P');
      expect(sub.className).toBe('text-xs text-gray-400 mt-0.5');
      const iconWrap = h2.parentElement.previousElementSibling;
      expect(iconWrap.className).toBe('p-2.5 rounded-xl bg-[#327F74]/10');
      expect(iconWrap.querySelector('svg')).toHaveClass('lucide-arrow-down', 'h-5', 'w-5', 'text-[#327F74]');
      expect(dialog().querySelector('.lucide-arrow-up')).toBeNull();
      // No DialogTitle/DialogDescription primitives are used.
      expect(dialog().querySelector('[data-slot="dialog-title"]')).toBeNull();
      expect(dialog().querySelector('[data-slot="dialog-description"]')).toBeNull();
    });

    it('renders the direction icon and colours for "out"', () => {
      render(<Subject {...propsFor({ cashDropType: 'out' })} />);
      const iconWrap = within(dialog()).getByRole('heading', { level: 2 }).parentElement.previousElementSibling;
      expect(iconWrap.className).toBe('p-2.5 rounded-xl bg-red-50');
      expect(iconWrap.querySelector('svg')).toHaveClass('lucide-arrow-up', 'h-5', 'w-5', 'text-red-500');
      expect(dialog().querySelector('.lucide-arrow-down')).toBeNull();
    });

    it('renders the header X, Cancel, Record and the hidden Radix close in that DOM order', () => {
      render(<Subject {...propsFor()} />);
      expect(buttons()).toEqual([headerXButton(), cancelButton(), recordButton(), radixCloseButton()]);
      expect(headerXButton().className).toBe('text-gray-300 hover:text-gray-500 transition-colors mt-0.5');
      expect(headerXButton().querySelector('svg')).toHaveClass('lucide-x', 'h-5', 'w-5');
      expect(headerXButton()).not.toHaveAttribute('type');
      expect(headerXButton()).not.toHaveAttribute('aria-label');
      expect(cancelButton().className).toBe('h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors');
      expect(cancelButton()).not.toHaveAttribute('type');
      expect(recordButton()).not.toHaveAttribute('type');
      expect(recordButton()).not.toBeDisabled();
      expect(recordButton().querySelector('svg')).toHaveClass('lucide-circle-check-big', 'h-4', 'w-4');
    });

    it.each([
      ['in', 'Record Cash Drop', 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'],
      ['out', 'Record Cash Out', 'bg-red-500 hover:bg-red-600 text-white'],
    ])('Record button for %s reads %j with its colour classes', (type, text, colour) => {
      render(<Subject {...propsFor({ cashDropType: type })} />);
      expect(recordButton()).toHaveTextContent(new RegExp(`^${text}$`));
      expect(recordButton()).toHaveClass('h-10', 'px-6', 'text-sm', 'font-semibold', 'rounded-xl', 'flex', 'items-center', 'gap-2', 'transition-colors', ...colour.split(' '));
    });

    it('renders the type select with its two options and chevron', () => {
      render(<Subject {...propsFor()} />);
      expect(typeSelect().className).toBe(SELECT_CLASS);
      expect(Array.from(typeSelect().options).map((o) => [o.value, o.textContent])).toEqual([
        ['in', 'Cash Drop (IN) - Add cash to drawer'],
        ['out', 'Cash Out - Pay for expenses'],
      ]);
      const chevron = typeSelect().nextElementSibling;
      expect(chevron.className).toBe('pointer-events-none absolute right-3 top-1/2 -translate-y-1/2');
      expect(chevron.querySelector('path')).toHaveAttribute('d', 'M19 9l-7 7-7-7');
    });

    it.each([
      ['in', 'e.g., Cash from admin safe'],
      ['out', 'e.g., Office supplies, Cleaning'],
    ])('renders amount and description inputs (placeholder for %s)', (type, placeholder) => {
      render(<Subject {...propsFor({ cashDropType: type })} />);
      expect(amountInput()).toHaveAttribute('placeholder', '0.00');
      expect(amountInput().className).toBe(INPUT_CLASS);
      expect(descriptionInput()).toHaveAttribute('placeholder', placeholder);
      expect(descriptionInput().className).toBe(INPUT_CLASS);
    });
  });

  describe('category section', () => {
    it('is absent with no categories and not required', () => {
      render(<Subject {...propsFor({ cashDropCategories: [], cashDropCategoryRequired: false })} />);
      expect(categorySelect()).toBeNull();
      expect(labels()).toEqual(['Type', 'Amount (AED)', 'Description / Purpose']);
    });

    it('renders as optional when categories exist and not required', () => {
      render(<Subject {...propsFor({ cashDropCategories: CATEGORIES, cashDropCategoryRequired: false })} />);
      expect(labels()).toEqual(['Type', 'Amount (AED)', 'Category (optional)', 'Description / Purpose']);
      expect(categorySelect().className).toBe(SELECT_CLASS);
      expect(Array.from(categorySelect().options).map((o) => [o.value, o.textContent])).toEqual([
        ['', 'Uncategorized'], ['7', 'Petty cash'], ['c-9', 'Cleaning'],
      ]);
    });

    it('renders as required even with no categories', () => {
      render(<Subject {...propsFor({ cashDropCategories: [], cashDropCategoryRequired: true })} />);
      expect(labels()).toEqual(['Type', 'Amount (AED)', 'Category *', 'Description / Purpose']);
      expect(Array.from(categorySelect().options).map((o) => [o.value, o.textContent])).toEqual([['', 'Select a category...']]);
    });

    it('renders as required with categories', () => {
      render(<Subject {...propsFor({ cashDropCategories: CATEGORIES, cashDropCategoryRequired: true })} />);
      expect(Array.from(categorySelect().options).map((o) => o.textContent)).toEqual(['Select a category...', 'Petty cash', 'Cleaning']);
    });

    it('reflects the selected category id', () => {
      render(<Subject {...propsFor({ cashDropCategories: CATEGORIES, cashDropCategoryId: 'c-9' })} />);
      expect(categorySelect()).toHaveValue('c-9');
    });
  });

  describe('controlled fields and callbacks', () => {
    it('reflects every controlled value', () => {
      render(<Subject {...propsFor({ cashDropType: 'out', cashDropAmount: '12.5', cashDropDescription: 'Tea', cashDropCategories: CATEGORIES, cashDropCategoryId: '7' })} />);
      expect(typeSelect()).toHaveValue('out');
      expect(amountInput()).toHaveValue(12.5);
      expect(descriptionInput()).toHaveValue('Tea');
      expect(categorySelect()).toHaveValue('7');
    });

    it.each([
      ['type select', 'onCashDropTypeChange', () => fireEvent.change(typeSelect(), { target: { value: 'out' } }), () => typeSelect()],
      ['amount input', 'onCashDropAmountChange', () => fireEvent.change(amountInput(), { target: { value: '5' } }), () => amountInput()],
      ['category select', 'onCashDropCategoryIdChange', () => fireEvent.change(categorySelect(), { target: { value: 'c-9' } }), () => categorySelect()],
      ['description input', 'onCashDropDescriptionChange', () => fireEvent.change(descriptionInput(), { target: { value: 'x' } }), () => descriptionInput()],
    ])('%s passes the raw change event to %s only', (_name, key, trigger, target) => {
      const spies = {
        onOpenChange: vi.fn(), onCashDropTypeChange: vi.fn(), onCashDropAmountChange: vi.fn(),
        onCashDropCategoryIdChange: vi.fn(), onCashDropDescriptionChange: vi.fn(), onClose: vi.fn(), onRecord: vi.fn(),
      };
      render(<Subject {...propsFor({ ...spies, cashDropCategories: CATEGORIES })} />);
      trigger();
      for (const [k, spy] of Object.entries(spies)) expect(spy).toHaveBeenCalledTimes(k === key ? 1 : 0);
      const [event, ...rest] = spies[key].mock.calls[0];
      expect(rest).toEqual([]);
      expect(event.type).toBe('change');
      expect(event.target).toBe(target());
    });

    it.each([
      ['header X', 'onClose', () => userEvent.click(headerXButton())],
      ['Cancel', 'onClose', () => userEvent.click(cancelButton())],
      ['Record', 'onRecord', () => userEvent.click(recordButton())],
    ])('%s calls only %s with the click event — never onOpenChange', async (_name, key, trigger) => {
      const spies = { onOpenChange: vi.fn(), onClose: vi.fn(), onRecord: vi.fn() };
      render(<Subject {...propsFor(spies)} />);
      await trigger();
      for (const [k, spy] of Object.entries(spies)) expect(spy).toHaveBeenCalledTimes(k === key ? 1 : 0);
      expect(spies[key].mock.calls[0]).toHaveLength(1);
      expect(spies[key].mock.calls[0][0].type).toBe('click');
    });

    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['outside pointer-down', async () => {
        await flushRadixOutsideListener();
        fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      }],
      ['hidden Radix close', async () => fireEvent.click(radixCloseButton())],
    ])('%s calls onOpenChange(false) only', async (_name, trigger) => {
      const spies = { onOpenChange: vi.fn(), onClose: vi.fn(), onRecord: vi.fn() };
      render(<Subject {...propsFor(spies)} />);
      await trigger();
      expect(spies.onOpenChange).toHaveBeenCalledTimes(1);
      expect(spies.onOpenChange).toHaveBeenCalledWith(false);
      expect(spies.onClose).not.toHaveBeenCalled();
      expect(spies.onRecord).not.toHaveBeenCalled();
    });
  });

  /**
   * Stateful harness wired with the exact POSSales handler bodies and the POSSales
   * category-loading effect (kept in the parent); setters are logged in call order.
   */
  describe('wired like POSSales', () => {
    function Harness({ log, handleCashDrop, getSelectableCategories, initial }) {
      const [showCashDropDialog, setShowCashDropDialogRaw] = useState(initial.open);
      const [cashDropType, setCashDropTypeRaw] = useState(initial.type);
      const [cashDropAmount, setCashDropAmountRaw] = useState(initial.amount);
      const [cashDropDescription, setCashDropDescriptionRaw] = useState(initial.description);
      const [cashDropCategoryId, setCashDropCategoryIdRaw] = useState('');
      const [cashDropCategories, setCashDropCategories] = useState([]);
      const [cashDropCategoryRequired, setCashDropCategoryRequired] = useState(false);
      const wrap = (name, raw) => (v) => { log.push([name, v]); raw(v); };
      const setShowCashDropDialog = wrap('setShowCashDropDialog', setShowCashDropDialogRaw);
      const setCashDropType = wrap('setCashDropType', setCashDropTypeRaw);
      const setCashDropAmount = wrap('setCashDropAmount', setCashDropAmountRaw);
      const setCashDropDescription = wrap('setCashDropDescription', setCashDropDescriptionRaw);
      const setCashDropCategoryId = wrap('setCashDropCategoryId', setCashDropCategoryIdRaw);

      useEffect(() => {
        if (!showCashDropDialog) return;
        const movementType = cashDropType === 'in' ? 'DROP_IN' : 'DROP_OUT';
        setCashDropCategoryId('');
        getSelectableCategories(movementType)
          .then((data) => {
            setCashDropCategories(data?.categories || []);
            setCashDropCategoryRequired(Boolean(data?.categoryRequired));
          })
          .catch(() => { setCashDropCategories([]); setCashDropCategoryRequired(false); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [showCashDropDialog, cashDropType]);

      return (
        <>
          <output data-testid="state">{JSON.stringify({ showCashDropDialog, cashDropType, cashDropAmount, cashDropDescription, cashDropCategoryId })}</output>
          <button type="button" data-testid="reopen" onClick={() => setShowCashDropDialog(true)}>reopen</button>
          <Subject
            open={showCashDropDialog}
            onOpenChange={setShowCashDropDialog}
            cashDropType={cashDropType}
            onCashDropTypeChange={e => setCashDropType(e.target.value)}
            cashDropAmount={cashDropAmount}
            onCashDropAmountChange={e => setCashDropAmount(e.target.value)}
            cashDropCategories={cashDropCategories}
            cashDropCategoryRequired={cashDropCategoryRequired}
            cashDropCategoryId={cashDropCategoryId}
            onCashDropCategoryIdChange={e => setCashDropCategoryId(e.target.value)}
            cashDropDescription={cashDropDescription}
            onCashDropDescriptionChange={e => setCashDropDescription(e.target.value)}
            onClose={() => setShowCashDropDialog(false)}
            onRecord={handleCashDrop}
          />
        </>
      );
    }

    const renderHarness = async ({ categories = CATEGORIES, categoryRequired = false, initial = {} } = {}) => {
      const log = [];
      const handleCashDrop = vi.fn();
      const getSelectableCategories = vi.fn(() => Promise.resolve({ categories, categoryRequired }));
      await act(async () => {
        render(
          <Harness
            log={log}
            handleCashDrop={handleCashDrop}
            getSelectableCategories={getSelectableCategories}
            initial={{ open: true, type: 'in', amount: '', description: '', ...initial }}
          />,
        );
      });
      return { log, handleCashDrop, getSelectableCategories };
    };
    const state = () => JSON.parse(screen.getByTestId('state').textContent);

    it('controlled inputs round-trip the raw target values into parent state', async () => {
      const { log } = await renderHarness();
      log.length = 0;
      await userEvent.type(amountInput(), '42');
      await userEvent.type(descriptionInput(), 'ab');
      await userEvent.selectOptions(categorySelect(), 'c-9');
      expect(log).toEqual([
        ['setCashDropAmount', '4'], ['setCashDropAmount', '42'],
        ['setCashDropDescription', 'a'], ['setCashDropDescription', 'ab'],
        ['setCashDropCategoryId', 'c-9'],
      ]);
      expect(state()).toMatchObject({ cashDropAmount: '42', cashDropDescription: 'ab', cashDropCategoryId: 'c-9' });
      expect(categorySelect()).toHaveValue('c-9');
    });

    it('changing the type sets cashDropType, and the parent effect refetches and resets the category', async () => {
      const { log, getSelectableCategories } = await renderHarness();
      await userEvent.selectOptions(categorySelect(), '7');
      log.length = 0;
      await act(async () => { fireEvent.change(typeSelect(), { target: { value: 'out' } }); });
      expect(log).toEqual([['setCashDropType', 'out'], ['setCashDropCategoryId', '']]);
      expect(getSelectableCategories.mock.calls.map((c) => c[0])).toEqual(['DROP_IN', 'DROP_OUT']);
      expect(state()).toMatchObject({ cashDropType: 'out', cashDropCategoryId: '' });
      expect(recordButton()).toHaveTextContent(/^Record Cash Out$/);
    });

    it('required category with no categories still shows the required select', async () => {
      await renderHarness({ categories: [], categoryRequired: true });
      expect(labels()).toContain('Category *');
    });

    it('Record calls handleCashDrop directly with the click event, touching no state', async () => {
      const { log, handleCashDrop } = await renderHarness({ initial: { amount: '10' } });
      log.length = 0;
      await userEvent.click(recordButton());
      expect(handleCashDrop).toHaveBeenCalledTimes(1);
      expect(handleCashDrop.mock.calls[0]).toHaveLength(1);
      expect(handleCashDrop.mock.calls[0][0].type).toBe('click');
      expect(log).toEqual([]);
      expect(dialog()).toBeInTheDocument();
    });

    it.each([
      ['header X', async () => userEvent.click(headerXButton())],
      ['Cancel', async () => userEvent.click(cancelButton())],
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['outside click', async () => {
        await flushRadixOutsideListener();
        fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      }],
      ['hidden Radix close', async () => fireEvent.click(radixCloseButton())],
    ])('%s: setShowCashDropDialog(false) only — form state is kept', async (_name, trigger) => {
      const { log, handleCashDrop } = await renderHarness({ initial: { type: 'out', amount: '25', description: 'Taxi' } });
      await userEvent.selectOptions(categorySelect(), '7');
      log.length = 0;
      await trigger();
      expect(log).toEqual([['setShowCashDropDialog', false]]);
      expect(handleCashDrop).not.toHaveBeenCalled();
      expect(state()).toEqual({ showCashDropDialog: false, cashDropType: 'out', cashDropAmount: '25', cashDropDescription: 'Taxi', cashDropCategoryId: '7' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('reopening keeps type/amount/description; only the parent effect resets the category id', async () => {
      const { log } = await renderHarness({ initial: { type: 'out', amount: '25', description: 'Taxi' } });
      await userEvent.selectOptions(categorySelect(), '7');
      await userEvent.click(cancelButton());
      log.length = 0;
      await act(async () => { fireEvent.click(screen.getByTestId('reopen')); });
      expect(log).toEqual([['setShowCashDropDialog', true], ['setCashDropCategoryId', '']]);
      expect(typeSelect()).toHaveValue('out');
      expect(amountInput()).toHaveValue(25);
      expect(descriptionInput()).toHaveValue('Taxi');
      expect(categorySelect()).toHaveValue('');
    });
  });
});

describe('CashDropDialog DOM parity', () => {
  const normaliseIds = (html) => html.replace(/radix-[^"\s]+/g, 'radix-ID');
  const renderedBody = (Component, props) => {
    render(<Component {...propsFor(props)} />);
    const html = normaliseIds(document.body.innerHTML);
    cleanup();
    return html;
  };

  it.each([
    ['closed', { open: false }],
    ['open, in, empty, no categories', { cashDropType: 'in' }],
    ['open, out, filled fields', { cashDropType: 'out', cashDropAmount: '99.5', cashDropDescription: 'Supplies' }],
    ['open, optional categories, one selected', { cashDropCategories: CATEGORIES, cashDropCategoryId: '7' }],
    ['open, required, no categories', { cashDropCategoryRequired: true }],
    ['open, required with categories', { cashDropType: 'out', cashDropCategories: CATEGORIES, cashDropCategoryRequired: true, cashDropCategoryId: 'c-9' }],
  ])('renders document.body identical to the pre-extraction markup when %s', (_name, props) => {
    expect(renderedBody(CashDropDialog, props)).toBe(renderedBody(OriginalCashDropMarkup, props));
  });
});

describe('CashDropDialog source', () => {
  const SOURCE = fs.readFileSync(path.resolve(__dirname, '../features/session/CashDropDialog.jsx'), 'utf8');

  it('has no hooks, context, memo, timers, API calls or category loading', () => {
    expect(SOURCE).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(SOURCE).not.toMatch(/\bmemo\b|createContext|useContext/);
    expect(SOURCE).not.toMatch(/setTimeout|setInterval|getSelectableCategories|addPosCashMovement|sessionStorage|\/api\//);
  });

  it('keeps the raw Dialog wiring and the direct button handlers', () => {
    expect(SOURCE).toContain('<Dialog open={open} onOpenChange={onOpenChange}>');
    expect(SOURCE.match(/onClick=\{onClose\}/g)).toHaveLength(2);
    expect(SOURCE).toContain('onClick={onRecord}');
    expect(SOURCE).not.toMatch(/if \(!open\)/);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the R18 boundary is asserted
 * against its source.
 */
describe('POSSales wiring (CashDropDialog boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const POS_SALES = fs.readFileSync(path.resolve(__dirname, '../../POSSales.jsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the exact original handler bodies in POSSales, between the same neighbours', () => {
    expect(POS_SALES).toContain(
      [
        '          onSubmit={handleSupervisorPinSubmit}',
        '          onCancel={cancelApproval}',
        '        />',
        '      )}',
        '',
        '',
        '      {/* Cash Drop/Out Dialog */}',
        '      <CashDropDialog',
        '        open={showCashDropDialog}',
        '        onOpenChange={setShowCashDropDialog}',
        '        cashDropType={cashDropType}',
        '        onCashDropTypeChange={e => setCashDropType(e.target.value)}',
        '        cashDropAmount={cashDropAmount}',
        '        onCashDropAmountChange={e => setCashDropAmount(e.target.value)}',
        '        cashDropCategories={cashDropCategories}',
        '        cashDropCategoryRequired={cashDropCategoryRequired}',
        '        cashDropCategoryId={cashDropCategoryId}',
        '        onCashDropCategoryIdChange={e => setCashDropCategoryId(e.target.value)}',
        '        cashDropDescription={cashDropDescription}',
        '        onCashDropDescriptionChange={e => setCashDropDescription(e.target.value)}',
        '        onClose={() => setShowCashDropDialog(false)}',
        '        onRecord={handleCashDrop}',
        '      />',
        '',
        '      {/* Live Session Quick View — dashboard tile popup showing current session',
      ].join('\n'),
    );
  });

  it('is always mounted — no showCashDropDialog && guard', () => {
    expect(POS_SALES).not.toMatch(/showCashDropDialog\s*&&/);
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(SUBTITLE);
    expect(POS_SALES).not.toContain('Cash Drop (IN) - Add cash to drawer');
    expect(POS_SALES).not.toContain('<Dialog open={showCashDropDialog}');
  });

  it('keeps state ownership, handleCashDrop and the category-loading effect in POSSales', () => {
    expect(POS_SALES).toContain('const [showCashDropDialog, setShowCashDropDialog] = useState(false);');
    expect(POS_SALES).toContain("const [cashDropType, setCashDropType] = useState('in');");
    expect(POS_SALES).toContain("const [cashDropAmount, setCashDropAmount] = useState('');");
    expect(POS_SALES).toContain("const [cashDropDescription, setCashDropDescription] = useState('');");
    expect(POS_SALES).toContain("const [cashDropCategoryId, setCashDropCategoryId] = useState('');");
    expect(POS_SALES).toContain('const [cashDropCategories, setCashDropCategories] = useState([]);');
    expect(POS_SALES).toContain('const [cashDropCategoryRequired, setCashDropCategoryRequired] = useState(false);');
    expect(POS_SALES).toContain('  const handleCashDrop = async () => {');
    expect(POS_SALES).toContain(
      [
        '  useEffect(() => {',
        '    if (!showCashDropDialog) return;',
        "    const movementType = cashDropType === 'in' ? 'DROP_IN' : 'DROP_OUT';",
        "    const activeBranchIdRaw = sessionStorage.getItem('activeBranchId');",
        "    const branchId = activeBranchIdRaw && activeBranchIdRaw !== 'ALL' ? activeBranchIdRaw : undefined;",
        "    setCashDropCategoryId('');",
        '    getSelectableCategories(movementType, branchId)',
        '      .then((data) => {',
        '        setCashDropCategories(data?.categories || []);',
        '        setCashDropCategoryRequired(Boolean(data?.categoryRequired));',
        '      })',
        '      .catch(() => { setCashDropCategories([]); setCashDropCategoryRequired(false); });',
        '  }, [showCashDropDialog, cashDropType]);',
      ].join('\n'),
    );
  });

  it('renders CashDropDialog exactly once', () => {
    expect(POS_SALES.match(/<CashDropDialog\b/g)).toHaveLength(1);
  });
});
