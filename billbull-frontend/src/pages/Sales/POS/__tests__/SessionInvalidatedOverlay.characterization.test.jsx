import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SessionInvalidatedOverlay from '../features/session/SessionInvalidatedOverlay';

// Pinned verbatim from the POSSales.jsx overlay (Phase 12) before extraction.
const HEADING = 'Session No Longer Available';
const FALLBACK =
  'Your active POS session has been transferred to another terminal or closed remotely. This terminal can no longer continue using that session.';

describe('SessionInvalidatedOverlay', () => {
  it('renders the exact heading', () => {
    render(<SessionInvalidatedOverlay sessionInvalidReason="x" onReturnToDashboard={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(new RegExp(`^${HEADING}$`));
  });

  it('renders sessionInvalidReason when present', () => {
    const reason = 'Session 71 was taken over by Terminal 3.';
    render(<SessionInvalidatedOverlay sessionInvalidReason={reason} onReturnToDashboard={() => {}} />);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });

  // The fallback is a `||`, so every falsy reason — not just undefined — shows it.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
  ])('renders the exact fallback sentence when the reason is %s', (_label, reason) => {
    render(<SessionInvalidatedOverlay sessionInvalidReason={reason} onReturnToDashboard={() => {}} />);
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('renders exactly one "Return to Dashboard" button', () => {
    render(<SessionInvalidatedOverlay sessionInvalidReason="x" onReturnToDashboard={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Return to Dashboard' })).toHaveLength(1);
  });

  it('invokes the supplied callback exactly once per click', async () => {
    const onReturnToDashboard = vi.fn();
    render(<SessionInvalidatedOverlay sessionInvalidReason="x" onReturnToDashboard={onReturnToDashboard} />);
    await userEvent.click(screen.getByRole('button', { name: 'Return to Dashboard' }));
    expect(onReturnToDashboard).toHaveBeenCalledTimes(1);
  });

  it('keeps the fixed full-screen top-layer container', () => {
    const { container } = render(
      <SessionInvalidatedOverlay sessionInvalidReason="x" onReturnToDashboard={() => {}} />,
    );
    expect(container.firstChild).toHaveClass('fixed', 'inset-0', 'z-[9999]');
  });
});

/**
 * POSSales.jsx is not rendered by this project's test setup, so the extraction boundary —
 * the guard stays in POSSales, the markup moved out, and the overlay remains the last
 * element before the root closes — is asserted against its source.
 */
describe('POSSales wiring (SessionInvalidatedOverlay boundary)', () => {
  // EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const POS_SALES = read('../../POSSales.jsx');

  it('keeps the sessionInvalidated guard in POSSales and renders the overlay inside it', () => {
    expect(POS_SALES).toMatch(
      /\{sessionInvalidated && \(\s*<SessionInvalidatedOverlay\s+sessionInvalidReason=\{sessionInvalidReason\}\s+onReturnToDashboard=\{\(\) => \{\s*acknowledgeSessionInvalidation\(\);\s*setCurrentView\('dashboard'\);\s*\}\}\s*\/>\s*\)\}/,
    );
  });

  it('no longer contains the moved markup', () => {
    expect(POS_SALES).not.toContain(HEADING);
    expect(POS_SALES).not.toContain(FALLBACK);
  });

  it('remains the final element before the root closes', () => {
    expect(POS_SALES).toMatch(
      /<SessionInvalidatedOverlay[\s\S]*?\/>\s*\)\}\s*<\/div>\s*<\/BusinessDayStatusProvider>\s*\);\s*\}\s*$/,
    );
  });
});
