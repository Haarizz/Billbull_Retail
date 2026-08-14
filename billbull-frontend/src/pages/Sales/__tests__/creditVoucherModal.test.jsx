import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreditVoucherModal from '../SalesReturn/components/CreditVoucherModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * The Credit Voucher card (§24, §26).
 *
 * The property under test throughout is that this component is a *view* of a persisted
 * voucher. It must display what the backend issued, must never substitute a value of its own
 * when one is missing, and must never cause a voucher to be created or changed — print and
 * reprint both hand the same persisted object back to the caller.
 */

const VOUCHER = {
   id: 42,
   voucherNumber: 'CV-2026-000004',
   voucherCode: 'VC-QFPRO-7702',
   barcodeValue: 'VCQFPRO7702',
   customerName: 'Ahmed Al Mansouri',
   sourceInvoiceNumber: 'INV-2026-04812',
   sourceReturnNumber: 'SR-2026-4631',
   originalAmount: 47.25,
   usedAmount: 0,
   remainingAmount: 47.25,
   issueDate: '2026-08-13',
   expiryDate: '2027-08-13',
   status: 'ACTIVE',
   redeemable: true,
   branchName: 'Dubai HQ',
};

describe('CreditVoucherModal', () => {
   beforeEach(() => vi.clearAllMocks());

   it('renders nothing when there is no voucher, no load in flight and no error', () => {
      const { container } = render(<CreditVoucherModal voucher={null} />);
      expect(container).toBeEmptyDOMElement();
   });

   it('shows every persisted field the cashier needs to hand the voucher over', () => {
      render(<CreditVoucherModal voucher={VOUCHER} />);

      expect(screen.getByText('Credit Voucher Generated')).toBeInTheDocument();
      expect(screen.getByText('VC-QFPRO-7702')).toBeInTheDocument();
      expect(screen.getByText('CV-2026-000004')).toBeInTheDocument();
      expect(screen.getByText('Ahmed Al Mansouri')).toBeInTheDocument();
      expect(screen.getByText('INV-2026-04812')).toBeInTheDocument();
      expect(screen.getByText('SR-2026-4631')).toBeInTheDocument();
      expect(screen.getByText('2026-08-13')).toBeInTheDocument();
      expect(screen.getByText('2027-08-13')).toBeInTheDocument();
      expect(screen.getByLabelText('Voucher barcode')).toBeInTheDocument();
      expect(screen.getByText(/Voucher Active · Full balance available/)).toBeInTheDocument();
   });

   it('prefers the branch on the voucher record over nothing at all', () => {
      render(<CreditVoucherModal voucher={VOUCHER} />);
      expect(screen.getByText('Dubai HQ')).toBeInTheDocument();
   });

   it('shows "No expiry" rather than inventing a date when the policy is never-expires', () => {
      render(<CreditVoucherModal voucher={{ ...VOUCHER, expiryDate: null }} />);
      expect(screen.getByText('No expiry')).toBeInTheDocument();
   });

   it('shows the remaining balance, not the face value, once part of the voucher is spent', () => {
      // §8 — a reprint after partial redemption must not tell the customer they still have 100.
      render(<CreditVoucherModal voucher={{
         ...VOUCHER, originalAmount: 100, usedAmount: 40, remainingAmount: 60,
      }} />);

      expect(screen.getByText(/Remaining/)).toBeInTheDocument();
      expect(screen.getByText(/Voucher Active · Partial balance available/)).toBeInTheDocument();
   });

   it('reports the backend\'s own reason when the voucher is not redeemable', () => {
      render(<CreditVoucherModal voucher={{
         ...VOUCHER, redeemable: false, notRedeemableReason: 'This voucher has been cancelled.',
      }} />);

      expect(screen.getByText('This voucher has been cancelled.')).toBeInTheDocument();
      expect(screen.queryByText(/Voucher Active/)).not.toBeInTheDocument();
   });

   it('hands the persisted voucher to the print pipeline, marking reprint separately', async () => {
      const onPrint = vi.fn();
      const user = userEvent.setup();
      render(<CreditVoucherModal voucher={VOUCHER} onPrint={onPrint} />);

      await user.click(screen.getByRole('button', { name: /Print Voucher/ }));
      expect(onPrint).toHaveBeenCalledWith(VOUCHER, { reprint: false });

      await user.click(screen.getByRole('button', { name: /Reprint/ }));
      expect(onPrint).toHaveBeenLastCalledWith(VOUCHER, { reprint: true });

      // §20 — the same persisted object both times. Nothing here mints or mutates a voucher.
      expect(onPrint.mock.calls.every(([v]) => v === VOUCHER)).toBe(true);
   });

   it('disables both print actions while a print is in flight', () => {
      render(<CreditVoucherModal voucher={VOUCHER} printing />);
      expect(screen.getByRole('button', { name: /Printing/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Reprint/ })).toBeDisabled();
   });

   it('closes on Done without touching the voucher', async () => {
      const onClose = vi.fn();
      const onPrint = vi.fn();
      const user = userEvent.setup();
      render(<CreditVoucherModal voucher={VOUCHER} onClose={onClose} onPrint={onPrint} />);

      await user.click(screen.getByRole('button', { name: 'Done' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onPrint).not.toHaveBeenCalled();
   });

   it('says the return is already confirmed while the voucher is still loading', () => {
      render(<CreditVoucherModal voucher={null} loading />);
      expect(screen.getByText('Loading voucher…')).toBeInTheDocument();
      expect(screen.getByText('The return is already confirmed.')).toBeInTheDocument();
   });

   it('states plainly that the voucher could not be loaded, and offers a retry', async () => {
      // §6 — never a fabricated voucher. The cashier is told the return posted, the voucher
      // exists, and this is only a display failure.
      const onRetry = vi.fn();
      const user = userEvent.setup();
      render(<CreditVoucherModal
         voucher={null}
         error={{ returnNumber: 'SR-2026-0017', message: 'Network error.' }}
         onRetry={onRetry} />);

      expect(screen.getByText(/voucher details could not be loaded/i)).toBeInTheDocument();
      expect(screen.getByText('Return SR-2026-0017')).toBeInTheDocument();
      expect(screen.getByText('Network error.')).toBeInTheDocument();
      expect(screen.getByText(/do not raise a second return/i)).toBeInTheDocument();
      expect(screen.queryByText(/Voucher Active/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Retry/ }));
      expect(onRetry).toHaveBeenCalledTimes(1);
   });
});
