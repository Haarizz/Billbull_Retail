// Prints the receipt of an offline sale that is already stored in the outbox.
//
// Printing is separate from the sale. This module reads the persisted outbox row, renders it with
// buildOfflineReceiptText, and hands it to the till's configured receipt printer. It never calls
// checkout or synchronisation and never changes the signed record. The only thing it writes is the
// row's receipt-print bookkeeping (printState, printError, lastPrintAt, printCount) through
// updateOutboxSync. So the automatic print after checkout and the offline panel's "Print receipt" /
// "Print again" work without a server invoice id or a connection, and can be repeated after a
// printer or agent failure.
//
// printState:
//   QUEUED  saved; no print submission finished yet (also after a crash mid-print)
//   SENT    the print agent accepted the job. That means Windows queued it, not that paper came
//           out (a disconnected printer can hold it in the queue), so it is shown as "sent to printer".
//   PRINTED same as SENT; written by builds before this module
//   FAILED  the last submission was refused or failed; printError says why

import { buildEscPosFromPlainTextBase64 } from '../../../../utils/escPosReceipt';
import { getOutbox, updateOutboxSync } from './offlineDb';
import { refreshOutboxCounts } from './offlineRuntime';
import { buildOfflineReceiptText, displayInvoiceFor } from './offlineSale';

export const PRINT_STATES = Object.freeze({ QUEUED: 'QUEUED', SENT: 'SENT', FAILED: 'FAILED' });

/** True when an earlier submission of this receipt reached the printer queue. */
export const wasSentToPrinter = (printState) => printState === 'SENT' || printState === 'PRINTED';

export class OfflineReceiptPrintBusy extends Error {
  constructor(ref) {
    super(`The receipt for ${ref || 'this sale'} is already being sent to the printer.`);
    this.name = 'OfflineReceiptPrintBusy';
  }
}

// Supplied by the POS workspace (useCheckout), which owns the configured printer and the outlet
// header: { print({ invoice, text, escPosBase64, title }), context() → { outletName, outletTrn, cashierName } }.
let registered = null;

/** Registers the till's receipt printer. Returns the unregister function (for an effect cleanup). */
export function registerOfflineReceiptPrinter(printer) {
  registered = printer;
  return () => { if (registered === printer) registered = null; };
}

// Offline sales whose receipt is being submitted right now. Checked and set synchronously, before
// any await, so a double click, the automatic print and a manual retry cannot overlap for one sale.
const inFlight = new Set();
export const isOfflineReceiptPrinting = (rid) => inFlight.has(rid);

const describe = (err) => err?.response?.data?.message || err?.message || String(err || 'printer error');

// Bookkeeping only: a storage hiccup here must never turn a submitted receipt into an error, or hide
// the real print error.
const recordPrint = async (rid, patch) => {
  try { await updateOutboxSync(rid, patch); } catch (err) { console.warn('[offline] could not record the receipt print state', err); }
};

/**
 * Sends the stored receipt of offline sale `rid` to the configured receipt printer.
 * Resolves with the printer result; throws if the receipt could not be submitted.
 * The sale itself is never touched.
 */
export async function printOfflineReceipt(rid) {
  if (!rid) throw new Error('No offline sale was given to print.');
  if (inFlight.has(rid)) throw new OfflineReceiptPrintBusy();
  inFlight.add(rid);
  try {
    const row = await getOutbox(rid);
    if (!row?.record) throw new Error('This offline sale is no longer stored on this till, so its receipt cannot be printed.');
    if (row.syncState === 'SYNCED' || row.invoiceNumber) {
      const invoice = row.invoiceNumber ? `invoice ${row.invoiceNumber}` : 'an invoice';
      throw new Error(`This sale has synchronised as ${invoice}. Reprint the tax invoice instead.`);
    }
    const printer = registered;
    if (!printer) throw new Error('The till screen is not ready to print. Close this panel and try again from the till.');
    const ctx = printer.context?.() || {};
    const text = buildOfflineReceiptText(row.record, ctx);
    const attemptAt = new Date().toISOString();
    let result;
    try {
      result = await printer.print({
        invoice: displayInvoiceFor(row.record, { cashierName: ctx.cashierName }),
        text,
        escPosBase64: buildEscPosFromPlainTextBase64(text),
        title: `Offline receipt ${row.record.ref}`,
      });
    } catch (err) {
      await recordPrint(rid, { printState: PRINT_STATES.FAILED, printError: describe(err).slice(0, 300), lastPrintAt: attemptAt });
      throw err;
    }
    await recordPrint(rid, {
      printState: PRINT_STATES.SENT, printError: null, lastPrintAt: attemptAt, printCount: (row.printCount || 0) + 1,
    });
    return result;
  } finally {
    inFlight.delete(rid);
    void refreshOutboxCounts();
  }
}

/** What the cashier is told when an offline receipt could not be sent. The sale is never in doubt. */
export function offlineReceiptFailureMessage(ref, err) {
  if (err instanceof OfflineReceiptPrintBusy) return err.message;
  return `The sale is saved offline (ref ${ref}) and will synchronise; nothing needs to be rung again. `
    + `The receipt could not be sent to the printer: ${describe(err)}. `
    + `To try again, open Offline selling (the cloud button on the left of the till) and choose "Print receipt" on ${ref}.`;
}
