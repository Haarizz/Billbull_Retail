import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrialExpiryModal from '../TrialExpiryModal';
import { TRIAL_NOTICE_PENDING_KEY } from '../../../utils/trialNotice';

const EXPIRES_AT = '2026-09-20T23:59:59+04:00';
const WARNING = 'Your free trial is going to expire this weekend.';

const tick = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-18T09:27:41+04:00'));
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('TrialExpiryModal', () => {
  it('shows the warning and live countdown when a login flagged the notice', () => {
    sessionStorage.setItem(TRIAL_NOTICE_PENDING_KEY, '1');
    render(<TrialExpiryModal expiresAt={EXPIRES_AT} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Free Trial Expiring')).toBeInTheDocument();
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(screen.getByText('Time remaining')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('2 Days 14 Hours 32 Minutes 18 Seconds');

    tick(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('2 Days 14 Hours 32 Minutes 17 Seconds');

    tick(18 * 1000);
    expect(screen.getByRole('timer')).toHaveTextContent('2 Days 14 Hours 31 Minutes 59 Seconds');
  });

  it('renders nothing without a login flag', () => {
    render(<TrialExpiryModal expiresAt={EXPIRES_AT} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([null, undefined])('renders nothing for a client with no trial (expiresAt=%j)', (expiresAt) => {
    sessionStorage.setItem(TRIAL_NOTICE_PENDING_KEY, '1');
    render(<TrialExpiryModal expiresAt={expiresAt} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches to the Trial Expired state when the countdown reaches zero', () => {
    vi.setSystemTime(new Date(new Date(EXPIRES_AT).getTime() - 2000));
    sessionStorage.setItem(TRIAL_NOTICE_PENDING_KEY, '1');
    render(<TrialExpiryModal expiresAt={EXPIRES_AT} />);

    expect(screen.getByRole('timer')).toHaveTextContent('0 Days 0 Hours 0 Minutes 2 Seconds');
    tick(2000);

    expect(screen.getByText('Trial Expired')).toBeInTheDocument();
    expect(screen.getByText('Your free trial has expired.')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/-\d/);

    tick(5000);
    expect(screen.getByText('Trial Expired')).toBeInTheDocument();
  });

  it('shows Trial Expired straight away when the trial has already ended', () => {
    vi.setSystemTime(new Date('2026-09-22T10:00:00+04:00'));
    sessionStorage.setItem(TRIAL_NOTICE_PENDING_KEY, '1');
    render(<TrialExpiryModal expiresAt={EXPIRES_AT} />);
    expect(screen.getByText('Trial Expired')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it.each([
    ['Continue', () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))],
    ['the X close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('dismissing via %s closes it and does not show it again this session', (_label, dismiss) => {
    sessionStorage.setItem(TRIAL_NOTICE_PENDING_KEY, '1');
    render(<TrialExpiryModal expiresAt={EXPIRES_AT} />);

    dismiss();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(TRIAL_NOTICE_PENDING_KEY)).toBeNull();

    cleanup();
    render(<TrialExpiryModal expiresAt={EXPIRES_AT} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
