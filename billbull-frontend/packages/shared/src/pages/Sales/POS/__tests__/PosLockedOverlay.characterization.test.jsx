import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lock } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import LockPosDialog from '../features/session/LockPosDialog';
import PosLockedOverlay from '../features/session/PosLockedOverlay';

// Pinned verbatim from the POSSales.jsx R22 POS locked overlay before extraction.
const HEADING = 'POS Terminal Locked';
const BODY = 'Enter your PIN to unlock';
const OVERLAY_CLASS = 'fixed inset-0 z-[100] bg-[#1E293B] flex flex-col items-center justify-center gap-6';

/**
 * The original R22 overlay markup, copied from POSSales.jsx before extraction. The Input
 * `value`/`onChange` and the Unlock button's inline handler are lifted to props unchanged.
 */
function OriginalPosLockedMarkup({ unlockPin, onUnlockPinChange, onUnlock }) {
  return (
        <div className="fixed inset-0 z-[100] bg-[#1E293B] flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#F5C742]/10 border-2 border-[#F5C742] flex items-center justify-center">
            <Lock className="h-10 w-10 text-[#F5C742]" />
          </div>
          <h2 className="text-white text-2xl font-bold">POS Terminal Locked</h2>
          <p className="text-gray-400 text-sm">Enter your PIN to unlock</p>
          <div className="w-64 space-y-3">
            <Input type="password" placeholder="Enter PIN..." value={unlockPin} onChange={onUnlockPinChange}
              className="text-center text-lg bg-white/10 border-white/20 text-white placeholder-gray-500" />
            <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold"
              onClick={onUnlock}>
              Unlock
            </Button>
          </div>
        </div>
  );
}

const SUBJECTS = [
  ['original R22 overlay markup', OriginalPosLockedMarkup],
  ['PosLockedOverlay', PosLockedOverlay],
];

const noop = () => {};
const propsFor = (overrides = {}) => ({ unlockPin: '', onUnlockPinChange: noop, onUnlock: noop, ...overrides });

afterEach(() => {
  cleanup();
});

describe.each(SUBJECTS)('%s', (_label, Subject) => {
  describe('markup', () => {
    it('renders inline in the parent (no portal) with the fixed z-[100] container', () => {
      const { container } = render(<Subject {...propsFor()} />);
      expect(container.firstChild.className).toBe(OVERLAY_CLASS);
      expect(container.firstChild.querySelector('svg')).toHaveClass('lucide-lock', 'h-10', 'w-10', 'text-[#F5C742]');
      expect(document.body.children).toHaveLength(1);
    });

    it('renders the exact heading, body, input and Unlock button', () => {
      render(<Subject {...propsFor({ unlockPin: '42' })} />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(new RegExp(`^${HEADING}$`));
      expect(screen.getByText(BODY)).toHaveClass('text-gray-400', 'text-sm');
      const input = screen.getByPlaceholderText('Enter PIN...');
      expect(input).toHaveAttribute('type', 'password');
      expect(input).not.toHaveAttribute('maxlength');
      expect(input).toHaveValue('42');
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Unlock']);
    });
  });

  describe('callbacks', () => {
    it('typing calls onUnlockPinChange with the change event', () => {
      const onUnlockPinChange = vi.fn();
      render(<Subject {...propsFor({ onUnlockPinChange })} />);
      const input = screen.getByPlaceholderText('Enter PIN...');
      fireEvent.change(input, { target: { value: '7' } });
      expect(onUnlockPinChange).toHaveBeenCalledTimes(1);
      expect(onUnlockPinChange.mock.calls[0][0].target).toBe(input);
    });

    it('Unlock calls onUnlock once per click with no guard', async () => {
      const onUnlock = vi.fn();
      render(<Subject {...propsFor({ onUnlock })} />);
      await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      expect(onUnlock).toHaveBeenCalledTimes(2);
    });
  });
});

/** Stateful harness mirroring POSSales: owns all four states, logs setters in call order. */
function Harness({ initial, log, DialogComponent = LockPosDialog, OverlayComponent = PosLockedOverlay }) {
  const [showLockPOS, setShowLockPOSRaw] = useState(initial.showLockPOS);
  const [lockPOSPin, setLockPOSPinRaw] = useState(initial.lockPOSPin);
  const [posLocked, setPosLockedRaw] = useState(initial.posLocked);
  const [unlockPin, setUnlockPinRaw] = useState(initial.unlockPin);
  const wrap = (name, raw) => (v) => { log.push([name, v]); raw(v); };
  const setShowLockPOS = wrap('setShowLockPOS', setShowLockPOSRaw);
  const setLockPOSPin = wrap('setLockPOSPin', setLockPOSPinRaw);
  const setPosLocked = wrap('setPosLocked', setPosLockedRaw);
  const setUnlockPin = wrap('setUnlockPin', setUnlockPinRaw);
  return (
    <>
      <output data-testid="state">{JSON.stringify({ showLockPOS, lockPOSPin, posLocked, unlockPin })}</output>
      <DialogComponent
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

      {posLocked && (
        <OverlayComponent
          unlockPin={unlockPin}
          onUnlockPinChange={e => setUnlockPin(e.target.value)}
          onUnlock={() => {
            if (unlockPin === lockPOSPin) {
              setPosLocked(false);
              setUnlockPin('');
              setLockPOSPin('');
            } else {
              setUnlockPin('');
            }
          }}
        />
      )}
    </>
  );
}

describe.each(SUBJECTS)('wired like POSSales — %s', (_label, Subject) => {
  const renderHarness = (initial) => {
    const log = [];
    render(<Harness initial={initial} log={log} OverlayComponent={Subject} />);
    return log;
  };
  const state = () => JSON.parse(screen.getByTestId('state').textContent);
  const overlay = () => screen.queryByText(HEADING);
  const LOCKED = { showLockPOS: false, lockPOSPin: '1234', posLocked: true, unlockPin: '' };

  it('typing updates unlockPin through onUnlockPinChange', async () => {
    const log = renderHarness(LOCKED);
    await userEvent.type(screen.getByPlaceholderText('Enter PIN...'), '12');
    expect(log).toEqual([['setUnlockPin', '1'], ['setUnlockPin', '12']]);
  });

  // Invariant 7
  it.each(['9999', '123', '12345'])('failed unlock with %j: setUnlockPin(\'\') only, still locked', async (attempt) => {
    const log = renderHarness({ ...LOCKED, unlockPin: attempt });
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(log).toEqual([['setUnlockPin', '']]);
    expect(state()).toEqual({ ...LOCKED, unlockPin: '' });
    expect(overlay()).toBeInTheDocument();
  });

  // Invariant 8
  it('successful unlock: setPosLocked(false), setUnlockPin(\'\'), setLockPOSPin(\'\') and the overlay unmounts', async () => {
    const log = renderHarness({ ...LOCKED, unlockPin: '1234' });
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(log).toEqual([['setPosLocked', false], ['setUnlockPin', ''], ['setLockPOSPin', '']]);
    expect(state()).toEqual({ showLockPOS: false, lockPOSPin: '', posLocked: false, unlockPin: '' });
    expect(overlay()).not.toBeInTheDocument();
  });

  // Invariant 9 — end-to-end through the real Lock POS dialog.
  it('after locking via the dialog, an empty unlock PIN does NOT unlock (lockPOSPin is preserved)', async () => {
    const log = renderHarness({ showLockPOS: true, lockPOSPin: '', posLocked: false, unlockPin: '' });
    const dlg = screen.getByRole('dialog');
    await userEvent.type(dlg.querySelector('input'), '1234');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Lock Terminal' }));
    expect(state()).toEqual({ showLockPOS: false, lockPOSPin: '1234', posLocked: true, unlockPin: '' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    log.length = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(log).toEqual([['setUnlockPin', '']]);
    expect(state()).toEqual({ showLockPOS: false, lockPOSPin: '1234', posLocked: true, unlockPin: '' });
    expect(overlay()).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Enter PIN...'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(overlay()).not.toBeInTheDocument();
    expect(state()).toEqual({ showLockPOS: false, lockPOSPin: '', posLocked: false, unlockPin: '' });
  });
});

// Invariant 10
describe('PosLockedOverlay does not receive lockPOSPin', () => {
  it('is rendered with exactly unlockPin, onUnlockPinChange and onUnlock', () => {
    const seen = vi.fn();
    function Capture(props) {
      seen(props);
      return <PosLockedOverlay {...props} />;
    }
    render(<Harness initial={{ showLockPOS: false, lockPOSPin: '1234', posLocked: true, unlockPin: '' }} log={[]} OverlayComponent={Capture} />);
    expect(Object.keys(seen.mock.lastCall[0]).sort()).toEqual(['onUnlock', 'onUnlockPinChange', 'unlockPin']);
    expect(Object.values(seen.mock.lastCall[0])).not.toContain('1234');
  });
});

// Invariant 11
describe('PosLockedOverlay DOM parity', () => {
  it.each(['', '1', '123456'])('renders DOM identical to the pre-extraction markup with unlockPin %j', (unlockPin) => {
    const { container: extracted } = render(<PosLockedOverlay {...propsFor({ unlockPin })} />);
    const { container: original } = render(<OriginalPosLockedMarkup {...propsFor({ unlockPin })} />);
    expect(extracted.innerHTML).toBe(original.innerHTML);
  });
});

describe('PosLockedOverlay source', () => {
  const SOURCE = fs.readFileSync(path.resolve(__dirname, '../features/session/PosLockedOverlay.jsx'), 'utf8');

  it('has no hooks, context, memo, local state, portal or unlock comparison', () => {
    expect(SOURCE).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(SOURCE).not.toMatch(/\bmemo\b|createContext|useContext|createPortal/);
    expect(SOURCE).not.toMatch(/lockPOSPin|===/);
    expect(SOURCE).toContain('z-[100]');
  });
});

// Invariant 12
describe('POSSales wiring (PosLockedOverlay boundary)', () => {
  const POS_SALES = fs.readFileSync(path.resolve(__dirname, '../../POSSales.jsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the posLocked guard and the exact original unlock handler in POSSales', () => {
    expect(POS_SALES).toContain(
      [
        '      {/* POS Locked Overlay */}',
        '      {posLocked && (',
        '        <PosLockedOverlay',
        '          unlockPin={unlockPin}',
        '          onUnlockPinChange={e => setUnlockPin(e.target.value)}',
        '          onUnlock={() => {',
        '            if (unlockPin === lockPOSPin) {',
        '              setPosLocked(false);',
        "              setUnlockPin('');",
        "              setLockPOSPin('');",
        '            } else {',
        "              setUnlockPin('');",
        '            }',
        '          }}',
        '        />',
        '      )}',
      ].join('\n'),
    );
  });

  it('does not pass lockPOSPin to PosLockedOverlay', () => {
    const block = POS_SALES.match(/<PosLockedOverlay\b[\s\S]*?\n {8}\/>/)[0];
    expect(block).not.toMatch(/lockPOSPin=/);
    expect(block).not.toMatch(/\{\.\.\./);
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(HEADING);
    expect(POS_SALES).not.toContain(BODY);
  });

  it('keeps order: RangeExclusionConfirmDialog → LockPosDialog → PosLockedOverlay → Credit Card Balance Dialog', () => {
    expect(POS_SALES).toMatch(
      /\n {6}<RangeExclusionConfirmDialog\n[\s\S]*?\n {6}\/>\n\n {6}\{\/\* Lock POS Dialog \*\/\}\n {6}<LockPosDialog\n[\s\S]*?\n {6}\/>\n\n {6}\{\/\* POS Locked Overlay \*\/\}\n {6}\{posLocked && \(\n {8}<PosLockedOverlay\n[\s\S]*?\n {8}\/>\n {6}\)\}\n\n {6}\{\/\* Credit Card Balance Dialog \*\/\}/,
    );
  });

  it('keeps PosLockedOverlay after BusinessDayStatusBanner in source', () => {
    const banner = POS_SALES.indexOf('<BusinessDayStatusBanner');
    expect(banner).toBeGreaterThan(-1);
    expect(POS_SALES.indexOf('<PosLockedOverlay')).toBeGreaterThan(banner);
  });

  it('keeps posLocked / unlockPin state in POSSales and renders the overlay once', () => {
    expect(POS_SALES).toContain('const [posLocked, setPosLocked] = useState(false);');
    expect(POS_SALES).toContain("const [unlockPin, setUnlockPin] = useState('');");
    expect(POS_SALES.match(/<PosLockedOverlay\b/g)).toHaveLength(1);
  });
});
