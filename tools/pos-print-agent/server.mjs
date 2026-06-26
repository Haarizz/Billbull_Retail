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

const printTextToPrinter = async ({ printerName, text, title = "BillBull Print Job" }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "billbull-print-"));
  const textFile = path.join(tempDir, "job.txt");
  await fs.writeFile(textFile, text, "utf8");
  const script = `
    Add-Type -AssemblyName System.Drawing
    $printerName = '${escapeSingleQuotes(printerName)}'
    $filePath = '${escapeSingleQuotes(textFile)}'
    $title = '${escapeSingleQuotes(title)}'
    $content = Get-Content -LiteralPath $filePath -Raw
    $font = New-Object System.Drawing.Font('Consolas', 9)
    $brush = [System.Drawing.Brushes]::Black
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printerName
    if (-not $doc.PrinterSettings.IsValid) { throw "Printer not found: $printerName" }
    $doc.DocumentName = $title
    $lines = $content -split "\\r?\\n"
    $index = 0
    $doc.add_PrintPage({
      param($sender, $e)
      $y = 10
      $lineHeight = $font.GetHeight($e.Graphics) + 2
      while ($index -lt $lines.Length) {
        $e.Graphics.DrawString($lines[$index], $font, $brush, 10, $y)
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
