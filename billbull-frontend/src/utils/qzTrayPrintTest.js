import { printRaw } from "./qzTray";

/**
 * Sends a minimal ESC/POS test receipt to the given printer name
 * (as registered in the OS / QZ Tray, e.g. "POS-80C").
 */
export const printQzTestReceipt = async (printerName) => {
  const data = [
    "\x1B\x40",
    "BILLBULL\n",
    "-----------------------\n",
    "HELLO WORLD\n",
    "\n\n\n",
    "\x1D\x56\x00",
  ];

  await printRaw(printerName, data);
};
