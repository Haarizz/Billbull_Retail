import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import BusinessDayStatusBanner from '../BusinessDayStatusBanner';
import { useBusinessDayStatus } from '../BusinessDayStatusContext';

// The banner must render purely from what the provider reports, so the provider
// itself (poll + ticker) is replaced by a fixed status here.
vi.mock('../BusinessDayStatusContext', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useBusinessDayStatus: vi.fn() };
});

const SESSION_71 = { sessionId: 71, terminalId: 'T003', terminalName: 'Terminal 3', openedBy: 'cashier1@test.com', status: 'OPEN' };
const SESSION_69 = { sessionId: 69, terminalId: 'T002', terminalName: 'Terminal 2', openedBy: 'admin', status: 'OPEN' };

function closedStatus(sessionsRequiringClosure, extra = {}) {
  return {
    enforced: true,
    phase: 'CLOSED',
    businessDay: { tradingDate: '2026-08-11', phase: 'CLOSED' },
    sessionsRequiringClosure,
    dayCloseRequired: false,
    pendingDayCloseDate: null,
    ...extra,
    secondsUntilClosure: null,
    secondsUntilNextStart: 41273,
    scheduledEndTime: '21:00',
    closureTime: '22:00',
    nextStartTime: '09:00',
  };
}

describe('BusinessDayStatusBanner — trading period ended', () => {
  beforeEach(() => vi.mocked(useBusinessDayStatus).mockReset());

  it('names the state "Trading Period Ended" while sessions are still open', () => {
    vi.mocked(useBusinessDayStatus).mockReturnValue(closedStatus([SESSION_71, SESSION_69]));
    render(<BusinessDayStatusBanner onCloseSession={vi.fn()} />);

    expect(screen.getByText('Trading Period Ended')).toBeInTheDocument();
    expect(screen.queryByText('Business Day Closed')).not.toBeInTheDocument();
  });

  it('offers a Close Session action for every open session, not just this terminal\'s', async () => {
    const onCloseSession = vi.fn();
    vi.mocked(useBusinessDayStatus).mockReturnValue(closedStatus([SESSION_71, SESSION_69]));
    // This browser is Terminal 2 and has no resolved session of its own — the
    // inconsistency that used to hide the action entirely on some terminals.
    render(<BusinessDayStatusBanner currentTerminalId="T002" openSession={null} onCloseSession={onCloseSession} />);

    const buttons = screen.getAllByRole('button', { name: 'Close Session' });
    expect(buttons).toHaveLength(2);

    await userEvent.click(buttons[0]);
    expect(onCloseSession).toHaveBeenCalledWith(SESSION_71);
  });

  it('marks only the current terminal, without hiding the others', () => {
    vi.mocked(useBusinessDayStatus).mockReturnValue(closedStatus([SESSION_71, SESSION_69]));
    render(<BusinessDayStatusBanner currentTerminalId="T002" onCloseSession={vi.fn()} />);

    expect(screen.getAllByText('This terminal')).toHaveLength(1);
    expect(screen.getByText(/Session #69/)).toBeInTheDocument();
    expect(screen.getByText(/Session #71/)).toBeInTheDocument();
  });

  it('stands down entirely while a closure flow is on screen', () => {
    vi.mocked(useBusinessDayStatus).mockReturnValue(closedStatus([SESSION_71]));
    const { container } = render(
      <BusinessDayStatusBanner onCloseSession={vi.fn()} closureFlowActive />,
    );

    // Nothing at all — the denomination/closure UI must never be covered.
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to "Business Day Closed" only when nothing is left open', () => {
    vi.mocked(useBusinessDayStatus).mockReturnValue(closedStatus([]));
    render(<BusinessDayStatusBanner onCloseSession={vi.fn()} />);

    expect(screen.getByText('Business Day Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Session' })).not.toBeInTheDocument();
  });

  // Re-entry after the sessions and X-Reports are done but the Z-Report is not:
  // the state the operator lands in on browser Back, a refresh, or from a second
  // browser. It must offer the next step rather than an empty session list.
  it('asks for the Day Close, with an action, once every session is closed', async () => {
    const onOpenDayClose = vi.fn();
    vi.mocked(useBusinessDayStatus).mockReturnValue(
      closedStatus([], { dayCloseRequired: true, pendingDayCloseDate: '2026-08-11' }),
    );
    render(<BusinessDayStatusBanner onCloseSession={vi.fn()} onOpenDayClose={onOpenDayClose} />);

    expect(screen.getByText('Day Close Required')).toBeInTheDocument();
    expect(screen.queryByText('Business Day Closed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Session' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open Z-Report' }));
    // The pending date travels with the navigation so Day Close opens on the day
    // that actually needs closing, not on today.
    expect(onOpenDayClose).toHaveBeenCalledWith('2026-08-11');
  });

  it('prefers session closure over the Day Close prompt while sessions remain', () => {
    vi.mocked(useBusinessDayStatus).mockReturnValue(
      closedStatus([SESSION_71], { dayCloseRequired: true, pendingDayCloseDate: '2026-08-11' }),
    );
    render(<BusinessDayStatusBanner onCloseSession={vi.fn()} onOpenDayClose={vi.fn()} />);

    expect(screen.getByText('Trading Period Ended')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Z-Report' })).not.toBeInTheDocument();
  });

  it('drops the Day Close prompt once the business day is fully closed', () => {
    vi.mocked(useBusinessDayStatus).mockReturnValue(closedStatus([], { dayCloseRequired: false }));
    render(<BusinessDayStatusBanner onCloseSession={vi.fn()} onOpenDayClose={vi.fn()} />);

    expect(screen.getByText('Business Day Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Z-Report' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Please complete the required Day Close/)).not.toBeInTheDocument();
  });
});
