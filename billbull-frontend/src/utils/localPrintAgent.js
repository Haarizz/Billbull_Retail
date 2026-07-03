import { printZplBatch } from "./zebraZpl";
import { createPrintJob, dispatchPrintJob, reportPrintJobResult } from "../api/posPrintJobApi";

const PRINT_AGENT_BASES = [
  "http://127.0.0.1:19777",
  "http://localhost:19777",
];

let resolvedAgentBase = null;
// Once the agent is found missing, skip re-probing for this long — otherwise every
// single POS sale re-runs the full "not found" probe against both hosts before
// falling back to browser print, which is the opposite of fast for back-to-back sales.
let lastProbeFailedAt = 0;
const PROBE_RETRY_COOLDOWN_MS = 15000;
// Bounds each health-check so a filtered/dropped port (vs. an actively refused one)
// can't turn into a multi-second stall before falling back — fetch() has no default timeout.
const HEALTH_PROBE_TIMEOUT_MS = 400;

const isBlank = (value) => value == null || String(value).trim() === "";

const normalizeStatusFromMessage = (message = "") => {
  const text = String(message || "").toLowerCase();
  if (text.includes("not found")) return "NOT_FOUND";
  if (text.includes("driver")) return "DRIVER_ERROR";
  if (text.includes("offline")) return "OFFLINE";
  return "UNKNOWN";
};

const agentFetch = async (path, init = {}) => {
  const base = await resolvePrintAgentBase();
  if (!base) {
    throw new Error("Print agent not reachable. Start the BillBull POS print agent on this workstation.");
  }
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Print agent error (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
};

export const resolvePrintAgentBase = async () => {
  if (resolvedAgentBase) return resolvedAgentBase;
  if (lastProbeFailedAt && Date.now() - lastProbeFailedAt < PROBE_RETRY_COOLDOWN_MS) return null;
  for (const base of PRINT_AGENT_BASES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
      const resp = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        resolvedAgentBase = base;
        return base;
      }
    } catch {
      // Keep probing candidates.
    }
  }
  lastProbeFailedAt = Date.now();
  return null;
};

// The agent returns Windows/PowerShell PascalCase fields (Name, DriverName,
// PortName, PrinterStatus, IsDefault, StatusLabel — see tools/pos-print-agent/
// server.js listPrinters()). Normalize to the camelCase shape the POS device
// screen consumes (printer.name / driverName / portName), keeping the raw
// fields too so nothing downstream that reads a PascalCase key breaks.
const normalizeAgentPrinter = (printer) => {
  if (!printer || typeof printer !== "object") return printer;
  return {
    ...printer,
    name: printer.name ?? printer.Name ?? "",
    driverName: printer.driverName ?? printer.DriverName ?? "",
    portName: printer.portName ?? printer.PortName ?? "",
    status: printer.status ?? printer.StatusLabel ?? "",
    isDefault: Boolean(printer.isDefault ?? printer.IsDefault),
  };
};

export const listPrintAgentPrinters = async () => {
  const data = await agentFetch("/printers");
  const printers = Array.isArray(data?.printers) ? data.printers : [];
  return printers.map(normalizeAgentPrinter);
};

export const testPrintAgentPrinter = async ({
  printerName,
  text,
  title,
  paperWidthMm,
  connectionType,
  ipAddress,
  portNumber,
  deviceIdentifier,
}) => {
  return agentFetch("/test-print", {
    method: "POST",
    body: JSON.stringify({ printerName, text, title, paperWidthMm, connectionType, ipAddress, portNumber, deviceIdentifier }),
  });
};

export const printReceiptThroughAgent = async ({
  printerName,
  text,
  title,
  paperWidthMm,
  connectionType,
  ipAddress,
  portNumber,
  deviceIdentifier,
}) => {
  return agentFetch("/print/receipt", {
    method: "POST",
    body: JSON.stringify({ printerName, text, title, paperWidthMm, connectionType, ipAddress, portNumber, deviceIdentifier }),
  });
};

// Sends a raw ESC/POS byte stream (base64-encoded) straight to the printer,
// bypassing the Windows print driver. This is the only path that actually
// carries density/heat/font/raster-image commands to the hardware — see
// escPosReceipt.js for why the text and HTML/driver paths can't.
export const printEscPosThroughAgent = async ({
  printerName,
  dataBase64,
  connectionType,
  ipAddress,
  portNumber,
  title,
}) => {
  return agentFetch("/print/escpos", {
    method: "POST",
    body: JSON.stringify({ printerName, dataBase64, connectionType, ipAddress, portNumber, title }),
  });
};

export const testConfiguredPrinter = async (printer, { testText, escPosBase64, labelPayload } = {}) => {
  if (!printer) {
    throw new Error("Printer configuration is missing.");
  }
  if (printer.connectionType === "ZEBRA_BROWSER_PRINT") {
    const labels = Array.isArray(labelPayload) && labelPayload.length
      ? labelPayload
      : [{
          company: printer.branchName || "BillBull",
          productName: "BillBull Printer Test",
          code: printer.deviceCode || printer.deviceName || "BB-TEST",
          productBarcode: printer.deviceCode || "BB-TEST",
          price: "TEST",
        }];
    await printZplBatch(labels, printer.deviceIdentifier || printer.systemPrinterName || null);
    return { ok: true, message: "Test label sent to Zebra printer." };
  }
  if (escPosBase64) {
    try {
      return await printEscPosThroughAgent({
        printerName: printer.systemPrinterName,
        dataBase64: escPosBase64,
        connectionType: printer.connectionType,
        ipAddress: printer.ipAddress,
        portNumber: printer.portNumber,
      });
    } catch (err) {
      console.warn('ESC/POS test print failed, falling back to plain-text test print', err);
    }
  }
  return testPrintAgentPrinter({
    printerName: printer.systemPrinterName,
    text: testText,
    title: "BillBull POS Printer Test",
    paperWidthMm: paperWidthToMm(printer.paperSize),
    connectionType: printer.connectionType,
    ipAddress: printer.ipAddress,
    portNumber: printer.portNumber,
    deviceIdentifier: printer.deviceIdentifier,
  });
};

// Phase B (Device Manager print-job spine): every receipt print is also recorded as a backend
// pos_print_jobs row for audit/queue visibility, in addition to the existing direct call below.
// Job bookkeeping is strictly best-effort and must never block or fail an actual print — until
// the external Local Device Agent executable is updated to poll the job queue itself, the browser
// remains the one actually invoking the agent for receipts. See
// docs/pos-device-architecture-specification-v2-2026-06-30.md §10.3 for the documented interim state.
const trackPrintJobSafely = async (fn, label) => {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[print-job] ${label} failed (non-blocking):`, err);
    return null;
  }
};

export const sendReceiptToConfiguredPrinter = async (printer, { receiptText, title, sourceType, sourceRefId } = {}) => {
  if (!printer) {
    throw new Error("Printer configuration is missing.");
  }
  if (printer.connectionType === "NETWORK_IP") {
    if (isBlank(printer.ipAddress) || !printer.portNumber) {
      throw new Error("Configured network printer does not have an IP address and port.");
    }
  } else if (isBlank(printer.systemPrinterName)) {
    throw new Error("Configured printer does not have a system printer name.");
  }

  const job = printer.id
    ? await trackPrintJobSafely(() => createPrintJob({
        printerId: printer.id,
        jobType: "RECEIPT",
        sourceType: sourceType || null,
        sourceRefId: sourceRefId || null,
        payload: receiptText,
      }), "create print job")
    : null;
  if (job) await trackPrintJobSafely(() => dispatchPrintJob(job.id), "dispatch print job");

  try {
    const result = await printReceiptThroughAgent({
      printerName: printer.systemPrinterName,
      text: receiptText,
      title: title || "BillBull POS Receipt",
      paperWidthMm: paperWidthToMm(printer.paperSize),
      connectionType: printer.connectionType,
      ipAddress: printer.ipAddress,
      portNumber: printer.portNumber,
      deviceIdentifier: printer.deviceIdentifier,
    });
    if (job) await trackPrintJobSafely(() => reportPrintJobResult(job.id, { success: true }), "report print job success");
    return result;
  } catch (err) {
    if (job) {
      await trackPrintJobSafely(
        () => reportPrintJobResult(job.id, { success: false, errorMessage: err?.message || "Print failed." }),
        "report print job failure",
      );
    }
    throw err;
  }
};

export const sendEscPosReceiptToConfiguredPrinter = async (printer, { dataBase64, receiptText, title, sourceType, sourceRefId } = {}) => {
  if (!printer) {
    throw new Error("Printer configuration is missing.");
  }
  if (printer.connectionType === "NETWORK_IP") {
    if (isBlank(printer.ipAddress) || !printer.portNumber) {
      throw new Error("Configured network printer does not have an IP address and port.");
    }
  } else if (isBlank(printer.systemPrinterName)) {
    throw new Error("Configured printer does not have a system printer name.");
  }

  const job = printer.id
    ? await trackPrintJobSafely(() => createPrintJob({
        printerId: printer.id,
        jobType: "RECEIPT",
        sourceType: sourceType || null,
        sourceRefId: sourceRefId || null,
        payload: receiptText || "[ESC/POS binary receipt]",
      }), "create print job")
    : null;
  if (job) await trackPrintJobSafely(() => dispatchPrintJob(job.id), "dispatch print job");

  try {
    const result = await printEscPosThroughAgent({
      printerName: printer.systemPrinterName,
      dataBase64,
      connectionType: printer.connectionType,
      ipAddress: printer.ipAddress,
      portNumber: printer.portNumber,
      title,
    });
    if (job) await trackPrintJobSafely(() => reportPrintJobResult(job.id, { success: true }), "report print job success");
    return result;
  } catch (err) {
    if (job) {
      await trackPrintJobSafely(
        () => reportPrintJobResult(job.id, { success: false, errorMessage: err?.message || "Print failed." }),
        "report print job failure",
      );
    }
    throw err;
  }
};

export const runtimeStatusFromPrintError = (error) => {
  const message = error?.message || "Print failed.";
  return {
    runtimeStatus: normalizeStatusFromMessage(message),
    lastTestResult: message,
  };
};

export const runtimeStatusFromPrintSuccess = (message = "Printer test completed successfully.") => ({
  runtimeStatus: "ONLINE",
  lastTestResult: message,
});

export const resolvePrinterForContext = (printers, {
  deviceType = "RECEIPT_PRINTER",
  branchId = null,
  terminalId = null,
} = {}) => {
  const all = Array.isArray(printers) ? printers : [];
  const normalizedTerminalId = isBlank(terminalId) ? null : String(terminalId).trim().toUpperCase();

  const candidates = all.filter((printer) => {
    if (!printer || printer.status !== "ACTIVE") return false;
    if (deviceType && printer.deviceType !== deviceType) return false;
    if (branchId != null && printer.branchId != null && Number(printer.branchId) !== Number(branchId)) return false;
    return true;
  });

  const scoped = (printer) => {
    const printerTerminal = isBlank(printer.terminalId) ? null : String(printer.terminalId).trim().toUpperCase();
    return {
      printer,
      exactTerminal: normalizedTerminalId && printerTerminal === normalizedTerminalId,
      branchScope: !printerTerminal,
    };
  };

  const ranked = candidates
    .map(scoped)
    .sort((a, b) => {
      if (Number(Boolean(b.exactTerminal && b.printer.defaultPrinter)) !== Number(Boolean(a.exactTerminal && a.printer.defaultPrinter))) {
        return Number(Boolean(b.exactTerminal && b.printer.defaultPrinter)) - Number(Boolean(a.exactTerminal && a.printer.defaultPrinter));
      }
      if (Number(Boolean(b.exactTerminal)) !== Number(Boolean(a.exactTerminal))) {
        return Number(Boolean(b.exactTerminal)) - Number(Boolean(a.exactTerminal));
      }
      if (Number(Boolean(b.branchScope && b.printer.defaultPrinter)) !== Number(Boolean(a.branchScope && a.printer.defaultPrinter))) {
        return Number(Boolean(b.branchScope && b.printer.defaultPrinter)) - Number(Boolean(a.branchScope && a.printer.defaultPrinter));
      }
      if (Number(Boolean(b.printer.defaultPrinter)) !== Number(Boolean(a.printer.defaultPrinter))) {
        return Number(Boolean(b.printer.defaultPrinter)) - Number(Boolean(a.printer.defaultPrinter));
      }
      return String(a.printer.deviceName || "").localeCompare(String(b.printer.deviceName || ""));
    });

  return ranked[0]?.printer || null;
};

export const paperWidthToMm = (paperSize) => {
  const normalized = String(paperSize || "").toLowerCase();
  if (normalized.includes("58")) return 58;
  if (normalized.includes("80")) return 80;
  return 80;
};
