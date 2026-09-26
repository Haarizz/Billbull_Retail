import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lock } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import IdleLockOverlay from '../features/session/IdleLockOverlay';

// Pinned verbatim from the POSSales.jsx R2 idle lock overlay before extraction.
const HEADING = 'Session Locked';
const BODY = 'This terminal was locked due to inactivity.';
const RESUME = 'Resume My Session';
const TAKEOVER = 'Supervisor Takeover';

/**
 * The original R2 markup, copied from POSSales.jsx before extraction, with the two inline
 * callbacks lifted to props. Used as the reference for a rendered-DOM parity check.
 */
function OriginalIdleLockMarkup({ onResume, onSupervisorTakeover }) {
  return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 text-center p-8 space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Session Locked</h2>
            <p className="text-sm text-gray-500">This terminal was locked due to inactivity.</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={onResume}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600"
              >
                Resume My Session
              </button>
              <button
                onClick={onSupervisorTakeover}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50"
              >
                Supervisor Takeover
              </button>
            </div>
          </div>
        </div>
  );
}

const noop = () => {};

describe('IdleLockOverlay', () => {
  it('renders DOM identical to the pre-extraction markup', () => {
    const { container: extracted } = render(<IdleLockOverlay onResume={noop} onSupervisorTakeover={noop} />);
    const { container: original } = render(<OriginalIdleLockMarkup onResume={noop} onSupervisorTakeover={noop} />);
    expect(extracted.innerHTML).toBe(original.innerHTML);
  });

  it('renders the exact heading and body text', () => {
    render(<IdleLockOverlay onResume={noop} onSupervisorTakeover={noop} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(new RegExp(`^${HEADING}$`));
    expect(screen.getByText(BODY)).toHaveClass('text-sm', 'text-gray-500');
  });

  it('renders exactly the two action buttons, in order, with no type attribute', () => {
    render(<IdleLockOverlay onResume={noop} onSupervisorTakeover={noop} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([RESUME, TAKEOVER]);
    buttons.forEach((b) => expect(b).not.toHaveAttribute('type'));
  });

  it('keeps the fixed full-screen z-[600] container and the lock icon', () => {
    const { container } = render(<IdleLockOverlay onResume={noop} onSupervisorTakeover={noop} />);
    expect(container.firstChild).toHaveClass('fixed', 'inset-0', 'z-[600]', 'bg-slate-900/90', 'backdrop-blur-md');
    expect(container.querySelector('svg.h-8.w-8.text-amber-600')).not.toBeNull();
  });

  it('invokes onResume exactly once per click and not onSupervisorTakeover', async () => {
    const onResume = vi.fn();
    const onSupervisorTakeover = vi.fn();
    render(<IdleLockOverlay onResume={onResume} onSupervisorTakeover={onSupervisorTakeover} />);
    await userEvent.click(screen.getByRole('button', { name: RESUME }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSupervisorTakeover).not.toHaveBeenCalled();
  });

  it('invokes onSupervisorTakeover exactly once per click and not onResume', async () => {
    const onResume = vi.fn();
    const onSupervisorTakeover = vi.fn();
    render(<IdleLockOverlay onResume={onResume} onSupervisorTakeover={onSupervisorTakeover} />);
    await userEvent.click(screen.getByRole('button', { name: TAKEOVER }));
    expect(onSupervisorTakeover).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  // The POSSales wiring below calls setIsIdleLocked(false) then setShowTakeoverDialog(true).
  it('preserves unlock-then-open-takeover sequencing when wired like POSSales', async () => {
    const calls = [];
    const setIsIdleLocked = (v) => calls.push(['setIsIdleLocked', v]);
    const setShowTakeoverDialog = (v) => calls.push(['setShowTakeoverDialog', v]);
    render(
      <IdleLockOverlay
        onResume={() => setIsIdleLocked(false)}
        onSupervisorTakeover={() => { setIsIdleLocked(false); setShowTakeoverDialog(true); }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: RESUME }));
    expect(calls).toEqual([['setIsIdleLocked', false]]);
    calls.length = 0;
    await userEvent.click(screen.getByRole('button', { name: TAKEOVER }));
    expect(calls).toEqual([
      ['setIsIdleLocked', false],
      ['setShowTakeoverDialog', true],
    ]);
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the guard stays in POSSales, the markup moved out, and R2 keeps its DOM position — is
 * asserted against its source.
 */
describe('POSSales wiring (IdleLockOverlay boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');

  it('keeps the isIdleLocked guard in POSSales with the exact original callback bodies', () => {
    expect(POS_SALES).toMatch(
      /\{isIdleLocked && \(\s*<IdleLockOverlay\s+onResume=\{\(\) => setIsIdleLocked\(false\)\}\s+onSupervisorTakeover=\{\(\) => \{ setIsIdleLocked\(false\); setShowTakeoverDialog\(true\); \}\}\s*\/>\s*\)\}/,
    );
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(BODY);
    expect(POS_SALES).not.toContain(RESUME);
    expect(POS_SALES).not.toContain('z-[600]');
  });

  it('sits immediately after the terminal-registration overlay and before SupervisorTakeoverDialog', () => {
    expect(POS_SALES).toMatch(
      /\{terminalRegistrationError && \(\s*<TerminalUnavailableOverlay\n[^<]*?\n {8}\/>\n {6}\)\}\s*\{\/\* ─── IDLE LOCK OVERLAY ─── \*\/\}\s*\{isIdleLocked && \(\s*<IdleLockOverlay[\s\S]*?\/>\s*\)\}\s*\{\/\* ─── SUPERVISOR TAKEOVER DIALOG ─── \*\/\}\s*\{showTakeoverDialog && currentSession\?\.id && \(\s*<SupervisorTakeoverDialog/,
    );
  });

  it('renders IdleLockOverlay exactly once', () => {
    expect(POS_SALES.match(/<IdleLockOverlay\b/g)).toHaveLength(1);
  });
});
