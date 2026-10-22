import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getPrintAgentStatus: vi.fn(),
  startPrintAgentPairing: vi.fn(),
  completePrintAgentPairing: vi.fn(),
  unpairPrintAgent: vi.fn(),
  resetPrintAgentProbe: vi.fn(),
}));
vi.mock('../../../../../../utils/localPrintAgent', () => api);

import PrintAgentPairing from '../PrintAgentPairing';

beforeEach(() => vi.clearAllMocks());

describe('PrintAgentPairing', () => {
  it('pairs with the code shown by the agent, then reports paired', async () => {
    api.getPrintAgentStatus
      .mockResolvedValueOnce({ state: 'unpaired', version: '0.6.0', message: 'This browser is not paired with the print agent on this PC.' })
      .mockResolvedValueOnce({ state: 'paired', version: '0.6.0', message: 'Paired with the print agent on this PC.' });
    api.startPrintAgentPairing.mockResolvedValue({ pairingId: 'p1', expiresInSeconds: 120 });
    api.completePrintAgentPairing.mockResolvedValue({ expiresAt: null });
    const onPaired = vi.fn();

    render(<PrintAgentPairing onPaired={onPaired} label="T-01" />);
    fireEvent.click(await screen.findByRole('button', { name: /pair this pc/i }));
    expect(api.startPrintAgentPairing).toHaveBeenCalledWith({ label: 'T-01' });

    const input = await screen.findByLabelText(/6-digit code/i);
    fireEvent.change(input, { target: { value: '12 34-56x' } });
    expect(input.value).toBe('123456');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onPaired).toHaveBeenCalled());
    expect(api.completePrintAgentPairing).toHaveBeenCalledWith({ pairingId: 'p1', code: '123456' });
    expect(await screen.findByText(/Paired with the print agent/)).toBeTruthy();
  });

  it('shows the agent error for a wrong code and keeps the form open while attempts remain', async () => {
    api.getPrintAgentStatus.mockResolvedValue({ state: 'unpaired', message: 'not paired' });
    api.startPrintAgentPairing.mockResolvedValue({ pairingId: 'p1', expiresInSeconds: 120 });
    api.completePrintAgentPairing.mockRejectedValue(Object.assign(new Error('That code is not the one shown by the print agent.'), { attemptsRemaining: 4 }));

    render(<PrintAgentPairing />);
    fireEvent.click(await screen.findByRole('button', { name: /pair this pc/i }));
    fireEvent.change(await screen.findByLabelText(/6-digit code/i), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByText(/not the one shown/)).toBeTruthy();
    expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy();
  });

  it('an outdated agent offers no pairing, only a re-check', async () => {
    api.getPrintAgentStatus.mockResolvedValue({ state: 'outdated', version: '0.5.3', message: 'This PC runs print agent 0.5.3 ...' });
    render(<PrintAgentPairing />);
    expect(await screen.findByRole('button', { name: /check again/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pair this pc/i })).toBeNull();
  });
});
