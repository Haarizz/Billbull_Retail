import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Confirming a CREDIT_VOUCHER Sales Return must end with the cashier looking at the voucher.
 *
 * The bug this covers: the return posted and the backend issued the voucher, but the only
 * evidence the cashier ever saw was a toast. Asserting "a success toast mentioning a voucher
 * number was shown" is exactly the assertion that would have passed while the feature was
 * broken, so every test here asserts on the rendered voucher card instead.
 *
 * Both entry points run this same component (POS passes entryPoint="POS" and a posContext;
 * the register passes entryPoint="SALES_RETURN"), so both are driven below.
 */

vi.mock('../../../api/salesReturnApi', () => ({
   searchReturnInvoices: vi.fn(),
   getReturnEligibility: vi.fn(),
   getReturnOptions: vi.fn(),
   saveSalesReturn: vi.fn(),
   updateSalesReturnStatus: vi.fn(),
}));
vi.mock('../../../api/creditVoucherApi', () => ({ getCreditVoucherByReturn: vi.fn() }));
vi.mock('../../../api/posPrinterApi', () => ({ getPosPrinters: vi.fn() }));
vi.mock('../../../utils/salesReturnPrint', () => ({
   printSalesReturnReceipt: vi.fn(),
   printCreditVoucher: vi.fn(),
}));
vi.mock('sonner', () => ({
   toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import SalesReturnScreen from '../SalesReturn/SalesReturnScreen';
import { ENTRY_POINT } from '../SalesReturn/constants';
import {
   searchReturnInvoices, getReturnEligibility, getReturnOptions,
   saveSalesReturn, updateSalesReturnStatus,
} from '../../../api/salesReturnApi';
import { getCreditVoucherByReturn } from '../../../api/creditVoucherApi';
import { getPosPrinters } from '../../../api/posPrinterApi';
import { printCreditVoucher } from '../../../utils/salesReturnPrint';

const ELIGIBILITY = {
   eligible: true,
   invoiceNumber: 'INV-2026-0172',
   receiptNumber: 'RCP-00482',
   customerCode: 'WALKIN',
   customerName: 'Walk-in Customer',
   branchId: 3,
   branchName: 'Hilite Branch',
   taxInclusive: true,
   blockedRefundMethods: {},
   lines: [{
      itemCode: '10593',
      itemName: 'Water Tank Polycon',
      barcode: '10593',
      unit: 'PCS',
      soldQty: 1,
      availableQty: 1,
      unitPrice: 3500,
      lineDiscount: 700,
      lineVat: 133.33,
      lineTotal: 2800,
      taxRate: 5,
   }],
};

const SAVED_DRAFT = { id: 55, returnNumber: 'SR-2026-0017', refundMethod: 'CREDIT_VOUCHER' };

const VOUCHER = {
   id: 42,
   voucherNumber: 'CV-2026-000004',
   voucherCode: 'VC-QFPRO-7702',
   barcodeValue: 'VCQFPRO7702',
   customerName: 'Walk-in Customer',
   sourceInvoiceNumber: 'INV-2026-0172',
   sourceReturnNumber: 'SR-2026-0017',
   originalAmount: 2800,
   usedAmount: 0,
   remainingAmount: 2800,
   issueDate: '2026-08-14',
   expiryDate: '2027-08-14',
   status: 'ACTIVE',
   redeemable: true,
};

/** Drives the workflow up to (but not including) Confirm, settling on Credit Voucher. */
async function setUpReturn(user, props = {}) {
   render(<SalesReturnScreen entryPoint={ENTRY_POINT.SALES_RETURN} {...props} />);

   // Invoice: a single exact match auto-selects, which is the scan-a-receipt path.
   const search = await screen.findByPlaceholderText(/invoice|receipt|scan/i);
   await user.type(search, 'INV-2026-0172{Enter}');
   await screen.findByText('Water Tank Polycon');

   // Add the sold line to the return by "scanning" it.
   const scan = screen.getByLabelText('Scan an item to return');
   await user.type(scan, '10593{Enter}');

   // §12 — condition defaults to Good; a reason must be chosen explicitly.
   await user.click(await screen.findByRole('button', { name: 'Customer Return' }));
   await user.click(screen.getByRole('button', { name: /Credit Voucher/ }));
}

describe('Sales Return → Credit Voucher', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      getReturnOptions.mockResolvedValue(null);
      searchReturnInvoices.mockResolvedValue([
         { invoiceNumber: 'INV-2026-0172', receiptNumber: 'RCP-00482' },
      ]);
      getReturnEligibility.mockResolvedValue(ELIGIBILITY);
      saveSalesReturn.mockResolvedValue(SAVED_DRAFT);
      getPosPrinters.mockResolvedValue([{ id: 1, deviceName: 'Counter Printer' }]);
      printCreditVoucher.mockResolvedValue({ deviceName: 'Counter Printer' });
   });

   it('opens the voucher card with the persisted voucher after a confirmed return', async () => {
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({
         ...SAVED_DRAFT, status: 'APPROVED', issuedVoucher: VOUCHER,
      });

      await setUpReturn(user);
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));

      // The card itself, not the toast, is the assertion.
      expect(await screen.findByText('Credit Voucher Generated')).toBeInTheDocument();
      expect(screen.getByText('VC-QFPRO-7702')).toBeInTheDocument();
      expect(screen.getByText('CV-2026-000004')).toBeInTheDocument();
      expect(screen.getByText('SR-2026-0017')).toBeInTheDocument();
      expect(screen.getByText('2027-08-14')).toBeInTheDocument();
      expect(screen.getByLabelText('Voucher barcode')).toBeInTheDocument();

      // §20 — exactly one return posted, exactly one approval. Nothing re-issued.
      expect(saveSalesReturn).toHaveBeenCalledTimes(1);
      expect(updateSalesReturnStatus).toHaveBeenCalledTimes(1);
      expect(getCreditVoucherByReturn).not.toHaveBeenCalled();
   });

   it('works identically from the POS entry point', async () => {
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({
         ...SAVED_DRAFT, status: 'APPROVED', issuedVoucher: VOUCHER,
      });

      await setUpReturn(user, {
         entryPoint: ENTRY_POINT.POS,
         posContext: { branchId: 3, terminalId: 'T2', counterName: 'Counter 2', sessionId: 77 },
      });
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));

      expect(await screen.findByText('Credit Voucher Generated')).toBeInTheDocument();
      expect(screen.getByText('VC-QFPRO-7702')).toBeInTheDocument();
   });

   it('notifies completion without the host having to close the screen', async () => {
      // Regression guard for the original defect: the POS host closed the return modal from
      // onComplete, unmounting this screen and the voucher card with it. onComplete must fire,
      // and the voucher card must still be on screen afterwards.
      const user = userEvent.setup();
      const onComplete = vi.fn();
      updateSalesReturnStatus.mockResolvedValue({
         ...SAVED_DRAFT, status: 'APPROVED', issuedVoucher: VOUCHER,
      });

      await setUpReturn(user, { onComplete });
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));

      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      expect(screen.getByText('Credit Voucher Generated')).toBeInTheDocument();
   });

   it('falls back to the by-return lookup when the approval names no voucher', async () => {
      // §5 — read the voucher the return already issued; never create a second one.
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({ ...SAVED_DRAFT, status: 'APPROVED' });
      getCreditVoucherByReturn.mockResolvedValue(VOUCHER);

      await setUpReturn(user);
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));

      expect(await screen.findByText('VC-QFPRO-7702')).toBeInTheDocument();
      expect(getCreditVoucherByReturn).toHaveBeenCalledWith('SR-2026-0017');
      expect(saveSalesReturn).toHaveBeenCalledTimes(1);
   });

   it('shows an honest error, not a fabricated voucher, when the lookup fails', async () => {
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({ ...SAVED_DRAFT, status: 'APPROVED' });
      getCreditVoucherByReturn.mockRejectedValue(new Error('Network error.'));

      await setUpReturn(user);
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));

      expect(await screen.findByText(/voucher details could not be loaded/i)).toBeInTheDocument();
      expect(screen.getByText('Return SR-2026-0017')).toBeInTheDocument();
      expect(screen.queryByText('VC-QFPRO-7702')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Voucher barcode')).not.toBeInTheDocument();
   });

   it('retries the lookup without re-posting the return', async () => {
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({ ...SAVED_DRAFT, status: 'APPROVED' });
      getCreditVoucherByReturn
         .mockRejectedValueOnce(new Error('Network error.'))
         .mockResolvedValueOnce(VOUCHER);

      await setUpReturn(user);
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));
      await screen.findByText(/voucher details could not be loaded/i);

      await user.click(screen.getByRole('button', { name: /Retry/ }));

      expect(await screen.findByText('VC-QFPRO-7702')).toBeInTheDocument();
      // The return was posted once, and only the read was retried.
      expect(saveSalesReturn).toHaveBeenCalledTimes(1);
      expect(updateSalesReturnStatus).toHaveBeenCalledTimes(1);
   });

   it('prints and reprints the persisted voucher through the existing pipeline', async () => {
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({
         ...SAVED_DRAFT, status: 'APPROVED', issuedVoucher: VOUCHER,
      });

      await setUpReturn(user);
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));
      await screen.findByText('Credit Voucher Generated');

      await user.click(screen.getByRole('button', { name: /Print Voucher/ }));
      await waitFor(() => expect(printCreditVoucher).toHaveBeenCalledTimes(1));
      expect(printCreditVoucher.mock.calls[0][0]).toBe(VOUCHER);
      expect(printCreditVoucher.mock.calls[0][1]).toMatchObject({ isReprint: false });

      await user.click(screen.getByRole('button', { name: /Reprint/ }));
      await waitFor(() => expect(printCreditVoucher).toHaveBeenCalledTimes(2));
      expect(printCreditVoucher.mock.calls[1][0]).toBe(VOUCHER);
      expect(printCreditVoucher.mock.calls[1][1]).toMatchObject({ isReprint: true });

      // §20/§25 — printing goes through the existing pipeline and re-issues nothing.
      expect(saveSalesReturn).toHaveBeenCalledTimes(1);
      expect(updateSalesReturnStatus).toHaveBeenCalledTimes(1);
      expect(getPosPrinters).toHaveBeenCalled();
   });

   it('leaves the return posted when the voucher card is dismissed', async () => {
      // §19 — closing the card is not an undo.
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({
         ...SAVED_DRAFT, status: 'APPROVED', issuedVoucher: VOUCHER,
      });

      await setUpReturn(user);
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));
      await screen.findByText('Credit Voucher Generated');

      // Scoped to the dialog: the screen behind it also has a Done button (its "leave the
      // completed return" action), which is a different thing entirely.
      const dialog = screen.getByRole('dialog', { name: /credit voucher/i });
      await user.click(within(dialog).getByRole('button', { name: 'Done' }));

      await waitFor(() =>
         expect(screen.queryByText('Credit Voucher Generated')).not.toBeInTheDocument());
      expect(screen.getByText(/SR-2026-0017 confirmed/)).toBeInTheDocument();
      expect(saveSalesReturn).toHaveBeenCalledTimes(1);
   });

   it('does not open the voucher card for a non-voucher refund', async () => {
      const user = userEvent.setup();
      updateSalesReturnStatus.mockResolvedValue({
         ...SAVED_DRAFT, refundMethod: 'CARD_REFUND', status: 'APPROVED',
      });

      const { container } = render(<SalesReturnScreen entryPoint={ENTRY_POINT.SALES_RETURN} />);
      expect(container).toBeTruthy();

      const search = await screen.findByPlaceholderText(/invoice|receipt|scan/i);
      await user.type(search, 'INV-2026-0172{Enter}');
      await screen.findByText('Water Tank Polycon');
      await user.type(screen.getByLabelText('Scan an item to return'), '10593{Enter}');
      await user.click(await screen.findByRole('button', { name: 'Customer Return' }));
      await user.click(screen.getByRole('button', { name: /Card Refund/ }));
      await user.click(screen.getByRole('button', { name: /Confirm Sales Return/ }));

      await waitFor(() => expect(updateSalesReturnStatus).toHaveBeenCalled());
      expect(screen.queryByText('Credit Voucher Generated')).not.toBeInTheDocument();
      expect(getCreditVoucherByReturn).not.toHaveBeenCalled();
   });
});
