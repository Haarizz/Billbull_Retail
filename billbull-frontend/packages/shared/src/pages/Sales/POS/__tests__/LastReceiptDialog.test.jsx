import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LastReceiptDialog from '../features/checkout/LastReceiptDialog';
import { findLatestSessionInvoice, receiptFromStoredInvoice, sessionStartDate } from '../features/checkout/lastReceiptRecovery';

const fmt = (n) => `AED ${Number(n).toFixed(2)}`;
const WALK_IN = { id: 'walk-in', name: 'Walk-in Customer', phone: '' };

const stored = (o = {}) => ({
  id: 42, invoiceNumber: 'INV-2026-0158', invoiceDate: '2026-11-20', createdAt: '2026-11-20T17:20:00',
  customerCode: 'C-7', customerName: 'Fatima Hassan', customerPhone: '+971501112222',
  subTotal: 200, taxTotal: 10, invoiceTotal: 210, amountPaid: 210, balance: 0, paymentMode: 'Cash',
  posSessionId: 68, posTerminalId: 'T-01', status: 'PAID',
  items: [
    { id: 1, itemName: '1 GANG SWITCH', quantity: 2, price: 50, netAmount: 100 },
    { id: 2, itemName: 'VOIDED LINE', quantity: 1, price: 9, netAmount: 9, voided: true },
    { id: 3, itemName: 'PUMP', quantity: 1, price: 100, netAmount: 100 },
  ],
  ...o,
});

const renderDialog = (props = {}) => {
  const p = {
    open: true, receipt: null, onClose: vi.fn(), onReprint: vi.fn(async () => {}), onShare: vi.fn(),
    onOpenHistory: vi.fn(), onRefresh: vi.fn(), formatCurrencyStr: fmt, ...props,
  };
  render(<LastReceiptDialog {...p} />);
  return p;
};

describe('lastReceiptRecovery', () => {
  it('picks the newest completed invoice of the session', () => {
    const list = [
      { id: 1, posSessionId: 68, createdAt: '2026-11-20T10:00:00', status: 'PAID' },
      { id: 3, posSessionId: 68, createdAt: '2026-11-20T12:00:00', status: 'CANCELLED' },
      { id: 2, posSessionId: 68, createdAt: '2026-11-20T11:00:00', status: 'POSTED' },
      { id: 4, posSessionId: 67, createdAt: '2026-11-20T13:00:00', status: 'PAID' },
    ];
    expect(findLatestSessionInvoice(list, 68).id).toBe(2);
    expect(findLatestSessionInvoice(list, 99)).toBeNull();
    expect(findLatestSessionInvoice(null, 68)).toBeNull();
  });

  it('starts the lookup on the day the session opened', () => {
    expect(sessionStartDate({ openedAt: '2026-11-19T22:00:00' })).toBe('2026-11-19');
    expect(sessionStartDate({}, new Date(2026, 10, 20))).toBe('2026-11-20');
  });

  it('rebuilds the snapshot from the stored invoice, matching the customer for contact details', () => {
    const r = receiptFromStoredInvoice(stored({ customerPhone: '' }), {
      listRow: { paymentMode: 'Cash + Visa' },
      customerOptions: [WALK_IN, { id: 7, code: 'C-7', name: 'Fatima Hassan', phone: '0509999999', email: 'f@x.co' }],
      walkIn: WALK_IN,
    });
    expect(r).toMatchObject({ id: 'INV-2026-0158', total: 210, items: 2, paidAmount: 210, creditBalance: 0, paymentMode: 'Cash + Visa', recovered: true, offline: null });
    expect(r.customer).toMatchObject({ id: 7, name: 'Fatima Hassan', phone: '0509999999', email: 'f@x.co' });
  });

  it('a walk-in sale stays walk-in; an unpaid remainder becomes the balance', () => {
    const r = receiptFromStoredInvoice(stored({ customerCode: '', amountPaid: 150, balance: 60 }), { walkIn: WALK_IN });
    expect(r.customer.id).toBe('walk-in');
    expect(r.creditBalance).toBe(60);
  });
});

describe('LastReceiptDialog', () => {
  const receipt = () => receiptFromStoredInvoice(stored(), { walkIn: WALK_IN, customerOptions: [] });

  it('shows the receipt: number, items (voided lines left out), totals and customer', () => {
    renderDialog({ receipt: receipt() });
    expect(screen.getByRole('dialog', { name: 'INV-2026-0158' })).toBeInTheDocument();
    expect(screen.getByText('Items (2)')).toBeInTheDocument();
    expect(screen.getByText('1 GANG SWITCH')).toBeInTheDocument();
    expect(screen.queryByText('VOIDED LINE')).toBeNull();
    expect(screen.getByText('Fatima Hassan')).toBeInTheDocument();
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(screen.getByText(/Loaded from the server/)).toBeInTheDocument();
  });

  it('share buttons hand the channel to POSSales; History opens receipt history', () => {
    const p = renderDialog({ receipt: receipt() });
    fireEvent.click(screen.getByRole('button', { name: /SMS/ }));
    fireEvent.click(screen.getByRole('button', { name: /WhatsApp/ }));
    fireEvent.click(screen.getByRole('button', { name: /Email/ }));
    expect(p.onShare.mock.calls.map((c) => c[0])).toEqual(['sms', 'whatsapp', 'email']);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(p.onOpenHistory).toHaveBeenCalled();
  });

  it('a failed reprint is shown in the dialog, which stays open', async () => {
    const p = renderDialog({ receipt: receipt(), onReprint: vi.fn(async () => { throw new Error('printer offline'); }) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Reprint Receipt/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Reprint failed: printer offline.');
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('an offline sale cannot be reprinted or emailed yet', () => {
    renderDialog({ receipt: { id: 'x', offline: { ref: 'R1' }, total: 5, items: 1, invoice: null, customer: WALK_IN } });
    expect(screen.getByRole('button', { name: /Reprint Receipt/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Email/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /SMS/ })).toBeEnabled();
    expect(screen.getByText('Pending sync')).toBeInTheDocument();
  });

  it('empty state offers a fresh lookup and receipt history', () => {
    const p = renderDialog();
    expect(screen.getByText('No sales in this session yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
    expect(p.onRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Receipt history/ }));
    expect(p.onOpenHistory).toHaveBeenCalled();
  });

  it('Escape closes it, unless a share dialog is on top', () => {
    const p = renderDialog({ receipt: receipt() });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
