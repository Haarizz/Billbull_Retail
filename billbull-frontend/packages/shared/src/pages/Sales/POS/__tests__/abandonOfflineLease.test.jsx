import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../../api/posOfflineApi', () => ({ abandonOfflineLease: vi.fn() }));

import { abandonOfflineLease } from '../../../../api/posOfflineApi';
import AbandonOfflineLeasePanel from '../features/session/AbandonOfflineLeasePanel';
import { parseOutstandingLeaseRefusal } from '../features/session/offlineLeaseRefusal';

const LEASE = '01a20c48-f0e2-75a1-9a16-11da2f51c197';
// Verbatim from PosOfflineLeaseBarrier.assertNoOutstandingLease, as seen on test.billbull.app.
const EXPIRED = `OFFLINE_LEASE_OUTSTANDING: Session #301 cannot be closed while terminal T001-2C4E holds an offline lease (${LEASE}, expired, 0 offline sale(s) received). Bring the till online so it synchronises and settles the lease, or have an administrator abandon it.`;
const VALID = `OFFLINE_LEASE_OUTSTANDING: Session #58 cannot start closing while terminal T001 holds an offline lease (${LEASE}, valid until 2026-11-25T18:00:00Z, 3 offline sale(s) received). Bring the till online so it synchronises and settles the lease, or have an administrator abandon it.`;

describe('parseOutstandingLeaseRefusal', () => {
  it('reads the expired-lease refusal', () => {
    expect(parseOutstandingLeaseRefusal(EXPIRED)).toEqual({
      sessionId: 301, terminalId: 'T001-2C4E', leaseId: LEASE, expired: true, validUntil: null, receivedCount: 0,
    });
  });

  it('reads the still-valid refusal', () => {
    expect(parseOutstandingLeaseRefusal(VALID)).toMatchObject({
      sessionId: 58, terminalId: 'T001', expired: false, validUntil: '2026-11-25T18:00:00Z', receivedCount: 3,
    });
  });

  it('ignores other errors, including the X-Report variant without a lease id', () => {
    expect(parseOutstandingLeaseRefusal('Session is already closed.')).toBeNull();
    expect(parseOutstandingLeaseRefusal('OFFLINE_LEASE_OUTSTANDING: Session #301 has an offline lease that is not settled, so its X-Report cannot be generated yet.')).toBeNull();
    expect(parseOutstandingLeaseRefusal(undefined)).toBeNull();
  });
});

describe('AbandonOfflineLeasePanel', () => {
  beforeEach(() => { abandonOfflineLease.mockReset(); });

  it('renders nothing for non-admins or unrelated errors', () => {
    const { container, rerender } = render(<AbandonOfflineLeasePanel closeError={EXPIRED} canAbandon={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AbandonOfflineLeasePanel closeError="Some other error" canAbandon />);
    expect(container).toBeEmptyDOMElement();
  });

  it('requires a reason and the till confirmation, then abandons on the session branch', async () => {
    abandonOfflineLease.mockResolvedValue({ leaseId: LEASE, status: 'ABANDONED' });
    const onAbandoned = vi.fn();
    const { rerender } = render(
      <AbandonOfflineLeasePanel closeError={EXPIRED} canAbandon branchId={1} onAbandoned={onAbandoned} />,
    );
    fireEvent.click(screen.getByText('Abandon offline lease…'));
    const submit = screen.getByRole('button', { name: 'Abandon lease' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Reason/), { target: { value: '  till dead  ' } });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onAbandoned).toHaveBeenCalledWith({ leaseId: LEASE, status: 'ABANDONED' }));
    expect(abandonOfflineLease).toHaveBeenCalledWith(LEASE, 'till dead', { branchId: 1 });
    // The parent clears the close error; the confirmation must survive that.
    rerender(<AbandonOfflineLeasePanel closeError="" canAbandon branchId={1} onAbandoned={onAbandoned} />);
    expect(screen.getByText(/abandoned\. Press/)).toBeInTheDocument();
  });

  it('warns loudly when the lease is still valid', () => {
    render(<AbandonOfflineLeasePanel closeError={VALID} canAbandon />);
    fireEvent.click(screen.getByText('Abandon offline lease…'));
    expect(screen.getByText(/still valid until 2026-11-25T18:00:00Z/)).toBeInTheDocument();
  });

  it('shows the server refusal and does not report success', async () => {
    abandonOfflineLease.mockRejectedValue({ response: { data: { message: 'Only an administrator or branch administrator can abandon an offline lease.' } } });
    const onAbandoned = vi.fn();
    render(<AbandonOfflineLeasePanel closeError={EXPIRED} canAbandon onAbandoned={onAbandoned} />);
    fireEvent.click(screen.getByText('Abandon offline lease…'));
    fireEvent.change(screen.getByPlaceholderText(/Reason/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon lease' }));
    expect(await screen.findByText(/Only an administrator/)).toBeInTheDocument();
    expect(onAbandoned).not.toHaveBeenCalled();
  });
});
