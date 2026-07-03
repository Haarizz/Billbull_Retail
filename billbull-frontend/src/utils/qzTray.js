import qz from "qz-tray";

let activeConnectionPromise = null;

const isWebSocketOpen = () => {
  try {
    return qz.websocket.isActive();
  } catch {
    return false;
  }
};

/**
 * Ensures a single shared QZ Tray websocket connection, reusing an
 * in-flight connect call instead of racing multiple connect attempts.
 */
export const connectQz = async () => {
  if (isWebSocketOpen()) return true;

  if (!activeConnectionPromise) {
    activeConnectionPromise = qz.websocket
      .connect()
      .finally(() => {
        activeConnectionPromise = null;
      });
  }

  await activeConnectionPromise;
  return true;
};

export const disconnectQz = async () => {
  if (isWebSocketOpen()) {
    await qz.websocket.disconnect();
  }
};

/**
 * Detects whether the QZ Tray desktop app is installed/running by
 * attempting a websocket handshake. Resolves to a status object rather
 * than throwing, so callers can render install/start prompts inline.
 */
export const detectQzTray = async () => {
  if (isWebSocketOpen()) {
    return { installed: true, connected: true, error: null };
  }

  try {
    await connectQz();
    return { installed: true, connected: true, error: null };
  } catch (err) {
    return {
      installed: false,
      connected: false,
      error: err?.message || "QZ Tray is not installed or not running.",
    };
  }
};

export const listQzPrinters = async () => {
  await connectQz();
  const printers = await qz.printers.find();
  console.log(printers);
  return printers;
};

export const findQzPrinter = async (name) => {
  await connectQz();
  return qz.printers.find(name);
};

/**
 * Sends raw ESC/POS data to the given printer. `data` follows the
 * qz-tray raw-command array format (strings / hex escape sequences).
 */
export const printRaw = async (printerName, data, options = {}) => {
  await connectQz();
  const printer = await findQzPrinter(printerName);
  const config = qz.configs.create(printer, options);
  await qz.print(config, data);
};

export default qz;
