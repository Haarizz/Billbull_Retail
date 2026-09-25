import { getPosPrinters, printPosPrinterEscPos } from '../api/posPrinterApi';
import { resolvePrinterForContext, printEscPosThroughAgent } from './localPrintAgent';

/**
 * THE way anything in this app spools ZPL to a Zebra label printer.
 *
 * <p>Extracted from {@code BarcodePrinter.handlePrintZebra}, which was the only caller until
 * employee ID barcodes needed the same hardware. Both now go through here, so there is ONE
 * printer-resolution rule, ONE branch-safety rule and ONE transport fork rather than a second
 * Zebra implementation that drifts from the proven one.
 *
 * <h3>Branch safety</h3>
 * Label printers are owned by the BRANCH, not by a POS terminal — label printing is an office
 * operation and must never require the operator to have registered their PC as a till. If the
 * caller has "All Branches" selected there is deliberately NO guess: picking "the first branch"
 * would spool labels to hardware in another building with no error and no way to tell it
 * happened.
 *
 * <h3>Transport fork</h3>
 * The same fork the receipt path uses. Network/IP printers are relayed through the backend's raw
 * socket, so they print from any device with no agent installed. USB/Bluetooth/Windows-queue
 * printers can only be reached by the machine they are physically attached to, so those go
 * through the local BillBull Print Agent. Both carry the ZPL bytes untouched to the RAW spooler —
 * no driver, no rendering, no GDI.
 */

/** Thrown for every "cannot print" outcome, so callers surface one message and never a stack. */
export class LabelPrinterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LabelPrinterError';
  }
}

/**
 * Finds the branch's default ACTIVE label printer and checks it is actually addressable.
 *
 * @param branchId the resolved numeric branch id, or null/'ALL' when none is selected
 * @param branchLabel a human name for the branch, used only in error messages
 * @throws LabelPrinterError when no branch is selected, none is configured, or the configured
 *         one is missing the address details its connection type needs
 */
export const resolveLabelPrinter = async ({ branchId, branchLabel = 'this branch' } = {}) => {
  const resolvedBranchId = (branchId != null && branchId !== 'ALL' && branchId !== '')
    ? Number(branchId)
    : null;
  if (resolvedBranchId == null || Number.isNaN(resolvedBranchId)) {
    throw new LabelPrinterError('Select a branch before printing labels.');
  }

  let printers = [];
  let loadError = null;
  try {
    printers = await getPosPrinters({ branchId: resolvedBranchId, deviceType: 'LABEL_PRINTER' });
  } catch (e) {
    // Held rather than thrown so a lookup failure is not reported as "no printer configured" —
    // those need different fixes.
    loadError = e;
  }

  // terminalId is deliberately omitted: "give me the branch-scoped label printer, and do not
  // narrow this office operation to a POS terminal."
  const printer = resolvePrinterForContext(printers, {
    deviceType: 'LABEL_PRINTER',
    branchId: resolvedBranchId,
  });

  if (!printer && loadError) {
    throw new LabelPrinterError(
      `Could not load the printer configuration for ${branchLabel}.\n\n${loadError.message || loadError}`);
  }
  if (!printer) {
    throw new LabelPrinterError(
      `No label printer is configured for ${branchLabel}.\n\n`
      + 'Add one under POS → Devices → Add Device → Label Printer, '
      + 'leave "assign to this terminal" unchecked, and set it as the default.');
  }
  if (printer.connectionType === 'NETWORK_IP') {
    if (!printer.id || !printer.ipAddress || !printer.portNumber) {
      throw new LabelPrinterError(
        `The label printer configured for ${branchLabel} is missing an IP address or port.`);
    }
  } else if (!printer.systemPrinterName) {
    throw new LabelPrinterError(
      `The label printer configured for ${branchLabel} has no system printer name.`);
  }
  return printer;
};

/**
 * Spools a ZPL document to an already-resolved printer.
 *
 * @param zpl the full ZPL string (one or more ^XA…^XZ labels)
 * @param title the job name shown in the Windows spooler
 */
export const sendZplToLabelPrinter = async (printer, zpl, { title = 'BillBull Labels' } = {}) => {
  // btoa is Latin-1 only; the encodeURIComponent/unescape pair is what carries any non-ASCII
  // byte in the ZPL (the ^CI28 UTF-8 header means there can be some) through it intact.
  const dataBase64 = btoa(unescape(encodeURIComponent(zpl)));
  if (printer.connectionType === 'NETWORK_IP') {
    await printPosPrinterEscPos(printer.id, dataBase64);
    return { transport: 'network', target: `${printer.ipAddress}:${printer.portNumber}` };
  }
  await printEscPosThroughAgent({
    printerName: printer.systemPrinterName,
    dataBase64,
    connectionType: printer.connectionType,
    ipAddress: printer.ipAddress,
    portNumber: printer.portNumber,
    title,
  });
  return { transport: 'agent', target: printer.systemPrinterName };
};

/** Resolve + send in one call, for the common case. */
export const printZplToBranchLabelPrinter = async (zpl, { branchId, branchLabel, title } = {}) => {
  const printer = await resolveLabelPrinter({ branchId, branchLabel });
  return sendZplToLabelPrinter(printer, zpl, { title });
};
