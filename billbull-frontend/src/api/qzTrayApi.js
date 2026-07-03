import { detectQzTray, listQzPrinters, printRaw } from "../utils/qzTray";

/**
 * Client-side "API" for the QZ Tray desktop bridge. Unlike the other
 * files in this folder, this does not call the backend — QZ Tray runs
 * locally on the POS terminal and is reached over its own websocket.
 */

export const checkQzTrayInstalled = async () => {
  return detectQzTray();
};

export const getQzPrinters = async () => {
  return listQzPrinters();
};

export const printQzRaw = async (printerName, data, options) => {
  return printRaw(printerName, data, options);
};
