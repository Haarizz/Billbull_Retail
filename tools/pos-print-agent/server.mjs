import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.BILLBULL_PRINT_AGENT_PORT || 19777);

const BROWSER_PRINT_BASES = [
  "https://localhost:9101",
  "http://localhost:9100",
  "http://127.0.0.1:9100",
  "https://127.0.0.1:9101",
];

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const encodePowerShell = (script) =>
  Buffer.from(script, "utf16le").toString("base64");

const runPowerShell = (script) =>
  new Promise((resolve, reject) => {
    const child = spawn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-EncodedCommand", encodePowerShell(script),
    ], { windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

const escapeSingleQuotes = (value) => String(value ?? "").replace(/'/g, "''");

const listPrinters = async () => {
  const script = `
    $items = Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus
    $items | ConvertTo-Json -Depth 3
  `;
  const raw = await runPowerShell(script);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
};

// mm -> hundredths-of-an-inch, the unit System.Drawing.Printing.PaperSize expects.
const mmToHundredthsInch = (mm) => Math.round(((Number(mm) || 80) / 25.4) * 100);

const printTextToPrinter = async ({ printerName, text, title = "BillBull Print Job", paperWidthMm = 80 }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "billbull-print-"));
  const textFile = path.join(tempDir, "job.txt");
  await fs.writeFile(textFile, text, "utf8");
  const paperWidthHundredths = mmToHundredthsInch(paperWidthMm);
  const script = `
    Add-Type -AssemblyName System.Drawing
    $printerName = '${escapeSingleQuotes(printerName)}'
    $filePath = '${escapeSingleQuotes(textFile)}'
    $title = '${escapeSingleQuotes(title)}'
    $content = Get-Content -LiteralPath $filePath -Raw
    $font = New-Object System.Drawing.Font('Consolas', 9, [System.Drawing.FontStyle]::Bold)
    $brush = [System.Drawing.Brushes]::Black
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printerName
    if (-not $doc.PrinterSettings.IsValid) { throw "Printer not found: $printerName" }
    $doc.DocumentName = $title
    # Explicitly size the page to the configured roll width. Without this the
    # driver's own default page size is used instead (often narrower than the
    # physical roll), and GDI silently clips any DrawString content that falls
    # past that page's right edge rather than wrapping it — that's what was
    # cropping the right side of receipts.
    $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('BillBullReceipt', ${paperWidthHundredths}, 3000)
    # Zero soft margins so the full roll width is usable — matches the zero-margin
    # @page CSS on the HTML print path and the full-dot-width ESC/POS path. The
    # driver still clamps to its own unprintable hard margin, so this can't push
    # ink past the physical print head; it just stops GDI reserving extra room the
    # 42/32-column line width (calibrated for the full physical width) doesn't expect.
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $lines = $content -split "\\r?\\n"
    $index = 0
    $doc.add_PrintPage({
      param($sender, $e)
      $y = $e.MarginBounds.Top
      $lineHeight = $font.GetHeight($e.Graphics) + 2
      while ($index -lt $lines.Length) {
        $e.Graphics.DrawString($lines[$index], $font, $brush, $e.MarginBounds.Left, $y)
        $y += $lineHeight
        $index++
        if ($y + $lineHeight -gt $e.MarginBounds.Bottom) {
          $e.HasMorePages = $true
          return
        }
      }
      $e.HasMorePages = $false
    })
    $doc.Print()
    Write-Output '{"ok":true}'
  `;

  try {
    await runPowerShell(script);
    return { ok: true, message: "Print job sent successfully." };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const printTextToNetworkPrinter = async ({ ipAddress, portNumber = 9100, text }) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ipAddress, port: Number(portNumber) }, () => {
      socket.write(Buffer.from(String(text ?? ""), "utf8"));
      socket.end();
    });

    socket.on("close", () => resolve({ ok: true, message: "Network print job sent successfully." }));
    socket.on("error", (error) => reject(new Error(error?.message || "Unable to reach network printer.")));
  });

// Sends a raw ESC/POS byte buffer straight to a network-attached printer's
// socket (no text re-encoding, no driver involved). Many thermal controllers
// (and Bluetooth-to-serial bridges) need the cut command's bytes to actually
// reach the print head before the socket closes, so we wait for the kernel
// send buffer to drain and give the controller a short grace period before
// tearing the connection down — closing immediately after write() can truncate
// the tail of the job (the cut command itself) on slower controllers.
const printEscPosToNetworkPrinter = async ({ ipAddress, portNumber = 9100, dataBase64 }) =>
  new Promise((resolve, reject) => {
    const buffer = Buffer.from(String(dataBase64 ?? ""), "base64");
    const socket = net.createConnection({ host: ipAddress, port: Number(portNumber) }, () => {
      socket.write(buffer, () => {
        setTimeout(() => socket.end(), 150);
      });
    });

    socket.on("close", () => resolve({ ok: true, message: "ESC/POS print job sent successfully." }));
    socket.on("error", (error) => reject(new Error(error?.message || "Unable to reach network printer.")));
  });

// Sends a raw ESC/POS byte buffer to a Windows-installed printer queue using
// the RAW datatype via the Win32 spooler (OpenPrinter/StartDocPrinter/
// WritePrinter). This bypasses GDI entirely, so it carries our density/heat/
// font/raster-image commands intact regardless of whether the queue is backed
// by USB, Bluetooth (paired as a printer port), or a generic/text driver —
// none of which is possible through System.Drawing.Printing (that path always
// rasterizes through the driver, which is what loses ESC/POS control).
const printEscPosToPrinterQueue = async ({ printerName, dataBase64, title = "BillBull ESC/POS Receipt" }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "billbull-print-"));
  const dataFile = path.join(tempDir, "job.bin");
  await fs.writeFile(dataFile, Buffer.from(String(dataBase64 ?? ""), "base64"));
  const script = `
    Add-Type -Name RawPrinter -Namespace BillBull -MemberDefinition @'
      [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
      public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool ClosePrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
      public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA pDocInfo);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool EndDocPrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool StartPagePrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool EndPagePrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

      [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
      public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
      }
'@ -UsingNamespace System.Runtime.InteropServices

    $printerName = '${escapeSingleQuotes(printerName)}'
    $bytes = [System.IO.File]::ReadAllBytes('${escapeSingleQuotes(dataFile)}')
    $hPrinter = [IntPtr]::Zero
    if (-not [BillBull.RawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
      throw "Unable to open printer: $printerName"
    }
    try {
      $docInfo = New-Object BillBull.RawPrinter+DOCINFOA
      $docInfo.pDocName = '${escapeSingleQuotes(title)}'
      $docInfo.pDataType = "RAW"
      if (-not [BillBull.RawPrinter]::StartDocPrinter($hPrinter, 1, [ref]$docInfo)) {
        throw "StartDocPrinter failed for $printerName"
      }
      try {
        if (-not [BillBull.RawPrinter]::StartPagePrinter($hPrinter)) { throw "StartPagePrinter failed" }
        $written = 0
        if (-not [BillBull.RawPrinter]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) {
          throw "WritePrinter failed for $printerName"
        }
        [BillBull.RawPrinter]::EndPagePrinter($hPrinter) | Out-Null
      } finally {
        [BillBull.RawPrinter]::EndDocPrinter($hPrinter) | Out-Null
      }
    } finally {
      [BillBull.RawPrinter]::ClosePrinter($hPrinter) | Out-Null
    }
    Write-Output '{"ok":true}'
  `;

  try {
    await runPowerShell(script);
    return { ok: true, message: "ESC/POS print job sent successfully." };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const resolveBrowserPrintBase = async () => {
  for (const base of BROWSER_PRINT_BASES) {
    try {
      const resp = await fetch(`${base}/available`);
      if (resp.ok) return base;
    } catch {
      // Keep probing.
    }
  }
  return null;
};

const proxyZebraPrint = async ({ device, zpl }) => {
  const base = await resolveBrowserPrintBase();
  if (!base) {
    throw new Error("Zebra Browser Print is not reachable on this workstation.");
  }
  const response = await fetch(`${base}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, data: zpl }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Browser Print returned HTTP ${response.status}`);
  }
  return { ok: true, message: "Zebra label job sent successfully." };
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, service: "billbull-pos-print-agent" });
      return;
    }

    if (req.method === "GET" && req.url === "/printers") {
      const printers = await listPrinters();
      sendJson(res, 200, { printers });
      return;
    }

    if (req.method === "POST" && (req.url === "/test-print" || req.url === "/print/receipt")) {
      const body = await readJsonBody(req);
      if (!body?.text) {
        sendJson(res, 400, { ok: false, message: "text is required." });
        return;
      }
      let result;
      if (body.connectionType === "NETWORK_IP" || body.ipAddress) {
        if (!body.ipAddress || !body.portNumber) {
          sendJson(res, 400, { ok: false, message: "ipAddress and portNumber are required for network printers." });
          return;
        }
        result = await printTextToNetworkPrinter({
          ipAddress: body.ipAddress,
          portNumber: body.portNumber,
          text: body.text,
        });
      } else {
        if (!body.printerName) {
          sendJson(res, 400, { ok: false, message: "printerName is required for workstation printers." });
          return;
        }
        result = await printTextToPrinter({
          printerName: body.printerName,
          text: body.text,
          title: body.title || "BillBull POS Receipt",
          paperWidthMm: body.paperWidthMm,
        });
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/print/escpos") {
      const body = await readJsonBody(req);
      if (!body?.dataBase64) {
        sendJson(res, 400, { ok: false, message: "dataBase64 is required." });
        return;
      }
      let result;
      if (body.connectionType === "NETWORK_IP" || body.ipAddress) {
        if (!body.ipAddress || !body.portNumber) {
          sendJson(res, 400, { ok: false, message: "ipAddress and portNumber are required for network printers." });
          return;
        }
        result = await printEscPosToNetworkPrinter({
          ipAddress: body.ipAddress,
          portNumber: body.portNumber,
          dataBase64: body.dataBase64,
        });
      } else {
        if (!body.printerName) {
          sendJson(res, 400, { ok: false, message: "printerName is required for workstation printers." });
          return;
        }
        result = await printEscPosToPrinterQueue({
          printerName: body.printerName,
          dataBase64: body.dataBase64,
          title: body.title || "BillBull ESC/POS Receipt",
        });
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/print/label/zebra") {
      const body = await readJsonBody(req);
      if (!body?.device || !body?.zpl) {
        sendJson(res, 400, { ok: false, message: "device and zpl are required." });
        return;
      }
      const result = await proxyZebraPrint(body);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { ok: false, message: "Not found." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error?.message || "Unhandled print-agent error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[billbull-pos-print-agent] listening on http://${HOST}:${PORT}`);
});
