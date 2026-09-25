import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lock } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import LockPosDialog from '../features/session/LockPosDialog';

// Pinned verbatim from the POSSales.jsx R22 Lock POS dialog before extraction.
const TITLE = 'Lock POS';
const DESCRIPTION = 'Enter a PIN to lock the POS terminal. Staff will need to enter this PIN to continue.';
const LABEL = 'Set PIN (4–6 digits)';
const LOCK_LABEL = 'Lock Terminal';

/**
 * The original R22 Lock POS dialog markup, copied from POSSales.jsx before extraction. The
 * `open` expression, inline `onOpenChange`, Input `value`/`onChange`, Cancel and Lock Terminal
 * handlers are lifted to props unchanged.
 */
function OriginalLockPosMarkup({ open, onOpenChange, pin, onPinChange, onCancel, onLock }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm border-0 shadow-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-[#F5C742]" /> Lock POS</DialogTitle>
            <DialogDescription>Enter a PIN to lock the POS terminal. Staff will need to enter this PIN to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Set PIN (4–6 digits)</label>
            <Input type="password" placeholder="Enter PIN…" value={pin} onChange={onPinChange} maxLength={6} className="h-11 text-center text-xl tracking-widest border-gray-200" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onCancel} className="border-gray-200">Cancel</Button>
            <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold" onClick={onLock}>
              <Lock className="h-4 w-4 mr-2" />Lock Terminal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

const SUBJECTS = [
  ['original R22 Lock POS markup', OriginalLockPosMarkup],
  ['LockPosDialog', LockPosDialog],
];

const noop = () => {};

function propsFor(overrides = {}) {
  return { open: true, onOpenChange: noop, pin: '', onPinChange: noop, onCancel: noop, onLock: noop, ...overrides };
}

const dialog = () => screen.getByRole('dialog');
const pinInput = () => dialog().querySelector('input');
const cancelButton = () => within(dialog()).getByRole('button', { name: 'Cancel' });
const lockButton = () => within(dialog()).getByRole('button', { name: LOCK_LABEL });
/** The DialogContent primitive's own X close button (visible here — no hiding class). */
const radixCloseButton = () => within(dialog()).getByRole('button', { name: 'Close' });
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
    });

    it('renders the dialog into a portal when open', () => {
      const { container } = render(<Subject {...propsFor()} />);
      expect(dialog()).toHaveAttribute('data-state', 'open');
      expect(container.contains(dialog())).toBe(false);
      expect(container.innerHTML).toBe('');
    });

    it('opens and closes in place as the parent flips open (always mounted)', () => {
      const { rerender } = render(<Subject {...propsFor({ open: false })} />);
      rerender(<Subject {...propsFor({ open: true })} />);
      expect(dialog()).toBeInTheDocument();
      rerender(<Subject {...propsFor({ open: false })} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('markup', () => {
    it('renders the exact title, description and label', () => {
      render(<Subject {...propsFor()} />);
      expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent(new RegExp(`^ ?${TITLE}$`));
      expect(dialog().querySelector('h2 svg')).toHaveClass('lucide-lock', 'h-5', 'w-5', 'text-[#F5C742]');
      expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
      const label = screen.getByText(LABEL);
      expect(label.tagName).toBe('LABEL');
      expect(label.className).toBe('text-xs font-semibold text-gray-600 uppercase tracking-wide');
    });

    it('renders a controlled password input with maxLength 6', () => {
      render(<Subject {...propsFor({ pin: '12' })} />);
      expect(pinInput()).toHaveAttribute('type', 'password');
      expect(pinInput()).toHaveAttribute('placeholder', 'Enter PIN…');
      expect(pinInput()).toHaveAttribute('maxlength', '6');
      expect(pinInput()).toHaveValue('12');
      expect(pinInput()).toHaveClass('h-11', 'text-center', 'text-xl', 'tracking-widest', 'border-gray-200');
    });

    it('renders Cancel, Lock Terminal (with icon) and the Radix X close button in that order', () => {
      render(<Subject {...propsFor()} />);
      const buttons = within(dialog()).getAllByRole('button');
      expect(buttons).toEqual([cancelButton(), lockButton(), radixCloseButton()]);
      expect(lockButton().querySelector('svg')).toHaveClass('lucide-lock', 'h-4', 'w-4', 'mr-2');
      expect(lockButton()).not.toBeDisabled();
    });
  });

  describe('callbacks', () => {
    it('typing calls onPinChange with the change event', () => {
      const onPinChange = vi.fn();
      render(<Subject {...propsFor({ onPinChange })} />);
      fireEvent.change(pinInput(), { target: { value: '9' } });
      expect(onPinChange).toHaveBeenCalledTimes(1);
      expect(onPinChange.mock.calls[0][0].target).toBe(pinInput());
    });

    it.each([
      ['Cancel', 'onCancel', async () => userEvent.click(cancelButton())],
      ['Lock Terminal', 'onLock', async () => userEvent.click(lockButton())],
    ])('%s calls only %s — never onOpenChange', async (_name, key, trigger) => {
      const spies = { onOpenChange: vi.fn(), onCancel: vi.fn(), onLock: vi.fn(), onPinChange: vi.fn() };
      render(<Subject {...propsFor(spies)} />);
      await trigger();
      for (const [k, spy] of Object.entries(spies)) {
        expect(spy).toHaveBeenCalledTimes(k === key ? 1 : 0);
      }
    });

    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['outside pointer-down', async () => {
        await flushRadixOutsideListener();
        fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      }],
      ['Radix X close', async () => fireEvent.click(radixCloseButton())],
    ])('%s calls onOpenChange(false) only', async (_name, trigger) => {
      const spies = { onOpenChange: vi.fn(), onCancel: vi.fn(), onLock: vi.fn() };
      render(<Subject {...propsFor(spies)} />);
      await trigger();
      expect(spies.onOpenChange).toHaveBeenCalledTimes(1);
      expect(spies.onOpenChange).toHaveBeenCalledWith(false);
      expect(spies.onCancel).not.toHaveBeenCalled();
      expect(spies.onLock).not.toHaveBeenCalled();
    });
  });

  /** Stateful harness wired with the exact POSSales handler bodies; setters are logged in call order. */
  describe('wired like POSSales', () => {
    function Harness({ initialPin, log }) {
      const [showLockPOS, setShowLockPOSRaw] = useState(true);
      const [lockPOSPin, setLockPOSPinRaw] = useState(initialPin);
      const [posLocked, setPosLockedRaw] = useState(false);
      const setShowLockPOS = (v) => { log.push(['setShowLockPOS', v]); setShowLockPOSRaw(v); };
      const setLockPOSPin = (v) => { log.push(['setLockPOSPin', v]); setLockPOSPinRaw(v); };
      const setPosLocked = (v) => { log.push(['setPosLocked', v]); setPosLockedRaw(v); };
      return (
        <>
          <output data-testid="state">{JSON.stringify({ showLockPOS, lockPOSPin, posLocked })}</output>
          <Subject
            open={showLockPOS}
            onOpenChange={v => {
              if (!v) {
                setShowLockPOS(false);
                setLockPOSPin('');
              }
            }}
            pin={lockPOSPin}
            onPinChange={e => setLockPOSPin(e.target.value)}
            onCancel={() => setShowLockPOS(false)}
            onLock={() => {
              if (lockPOSPin.length >= 4) {
                setPosLocked(true);
                setShowLockPOS(false);
              }
            }}
          />
        </>
      );
    }

    const renderHarness = (initialPin) => {
      const log = [];
      render(<Harness initialPin={initialPin} log={log} />);
      return log;
    };
    const state = () => JSON.parse(screen.getByTestId('state').textContent);

    it('typing updates lockPOSPin through onPinChange', async () => {
      const log = renderHarness('');
      await userEvent.type(pinInput(), '12');
      expect(log).toEqual([['setLockPOSPin', '1'], ['setLockPOSPin', '12']]);
      expect(pinInput()).toHaveValue('12');
    });

    // Invariant 1
    it('Cancel: setShowLockPOS(false) only — lockPOSPin is left unchanged', async () => {
      const log = renderHarness('1234');
      await userEvent.click(cancelButton());
      expect(log).toEqual([['setShowLockPOS', false]]);
      expect(state()).toEqual({ showLockPOS: false, lockPOSPin: '1234', posLocked: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Invariants 2–4
    it.each([
      ['Escape', async () => userEvent.keyboard('{Escape}')],
      ['outside click', async () => {
        await flushRadixOutsideListener();
        fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]'));
      }],
      ['Radix X close', async () => fireEvent.click(radixCloseButton())],
    ])('%s: setShowLockPOS(false) then setLockPOSPin(\'\')', async (_name, trigger) => {
      const log = renderHarness('1234');
      await trigger();
      expect(log).toEqual([['setShowLockPOS', false], ['setLockPOSPin', '']]);
      expect(state()).toEqual({ showLockPOS: false, lockPOSPin: '', posLocked: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Invariant 5
    it.each(['', '1', '123'])('Lock with %j (< 4 chars): no state change, dialog stays open', async (pin) => {
      const log = renderHarness(pin);
      await userEvent.click(lockButton());
      expect(log).toEqual([]);
      expect(state()).toEqual({ showLockPOS: true, lockPOSPin: pin, posLocked: false });
      expect(dialog()).toBeInTheDocument();
    });

    // Invariant 6
    it.each(['1234', '123456', 'abcd'])('Lock with %j (>= 4 chars): setPosLocked(true) then setShowLockPOS(false), pin kept', async (pin) => {
      const log = renderHarness(pin);
      await userEvent.click(lockButton());
      expect(log).toEqual([['setPosLocked', true], ['setShowLockPOS', false]]);
      expect(state()).toEqual({ showLockPOS: false, lockPOSPin: pin, posLocked: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('LockPosDialog DOM parity', () => {
  const normaliseIds = (html) => html.replace(/radix-[^"\s]+/g, 'radix-ID');
  const renderedBody = (Component, props) => {
    render(<Component {...propsFor(props)} />);
    const html = normaliseIds(document.body.innerHTML);
    cleanup();
    return html;
  };

  it.each([
    ['closed', { open: false }],
    ['open, empty pin', { open: true, pin: '' }],
    ['open, partial pin', { open: true, pin: '12' }],
    ['open, full pin', { open: true, pin: '123456' }],
  ])('renders document.body identical to the pre-extraction markup when %s', (_name, props) => {
    expect(renderedBody(LockPosDialog, props)).toBe(renderedBody(OriginalLockPosMarkup, props));
  });
});

describe('LockPosDialog source', () => {
  const SOURCE = fs.readFileSync(path.resolve(__dirname, '../features/session/LockPosDialog.jsx'), 'utf8');

  it('has no hooks, context, memo or local state', () => {
    expect(SOURCE).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(SOURCE).not.toMatch(/\bmemo\b|createContext|useContext/);
  });

  it('keeps <Dialog open={open} onOpenChange={onOpenChange}> and the Input controlled by pin', () => {
    expect(SOURCE).toContain('<Dialog open={open} onOpenChange={onOpenChange}>');
    expect(SOURCE).toContain('value={pin} onChange={onPinChange}');
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the R22 boundary is asserted
 * against its source.
 */
describe('POSSales wiring (LockPosDialog boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const POS_SALES = fs.readFileSync(path.resolve(__dirname, '../../POSSales.jsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the exact original handler bodies in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      {/* Lock POS Dialog */}',
        '      <LockPosDialog',
        '        open={showLockPOS}',
        '        onOpenChange={v => {',
        '          if (!v) {',
        '            setShowLockPOS(false);',
        "            setLockPOSPin('');",
        '          }',
        '        }}',
        '        pin={lockPOSPin}',
        '        onPinChange={e => setLockPOSPin(e.target.value)}',
        '        onCancel={() => setShowLockPOS(false)}',
        '        onLock={() => {',
        '          if (lockPOSPin.length >= 4) {',
        '            setPosLocked(true);',
        '            setShowLockPOS(false);',
        '          }',
        '        }}',
        '      />',
      ].join('\n'),
    );
  });

  it('is always mounted — no showLockPOS && guard', () => {
    expect(POS_SALES).not.toMatch(/showLockPOS\s*&&/);
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(DESCRIPTION);
    expect(POS_SALES).not.toContain(LABEL);
    expect(POS_SALES).not.toContain('<Dialog open={showLockPOS}');
  });

  it('keeps state ownership in POSSales and setShowLockPOS in touchScreenProps', () => {
    expect(POS_SALES).toContain("const [showLockPOS, setShowLockPOS] = useState(false);");
    expect(POS_SALES).toContain("const [lockPOSPin, setLockPOSPin] = useState('');");
    expect(POS_SALES).toMatch(/\n {2}const touchScreenProps = \{[\s\S]*?\bsetShowLockPOS\b[\s\S]*?\n {2}\};/);
  });

  it('renders LockPosDialog exactly once', () => {
    expect(POS_SALES.match(/<LockPosDialog\b/g)).toHaveLength(1);
  });
});
