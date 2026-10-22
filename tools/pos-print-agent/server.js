"use strict";

const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createConfig, normalizeOrigin } = require("./lib/config");
const { createTokenStore, createPairingManager, PairingError } = require("./lib/pairing");
const { inspectEscPos, describeRefusal } = require("./lib/escposPolicy");
const { inspectZpl, describeZplRefusal } = require("./lib/zplPolicy");
const { createNetworkPolicy, NetworkPolicyError } = require("./lib/networkPolicy");
const { DestinationError, resolveQueue, resolveNetwork, queueProtocol } = require("./lib/destinations");
const { StartupError, createStarter, closeGracefully, writeStatus, watchForStopRequest } = require("./lib/lifecycle");

const { HOST, PORT, VERSION } = require("./lib/constants");
// Bumped when the HTTP contract changes in a way the frontend must know about.
// 2 = origin allow-list + pairing token (0.6.0). Agents before 0.6.0 report no
// protocol and accept any caller.
const PROTOCOL = 2;

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const readJsonBody = async (req, maxBytes) => {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "AGENT_BODY_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "AGENT_BODY_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new HttpError(400, "AGENT_BAD_REQUEST", "Request body must be a JSON object.");
  }
};

const encodePowerShell = (script) =>
  Buffer.from(script, "utf16le").toString("base64");

// PowerShell in -NonInteractive mode emits stderr as a CLIXML document. Extract
// just the thrown error message so callers (and ultimately the POS UI toast)
// see "Printer not found: X" instead of raw XML plumbing.
const decodePowerShellStderr = (stderr) => {
  const raw = String(stderr || "").trim();
  if (!raw.startsWith("#< CLIXML")) return raw;
  const lines = [...raw.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((m) => m[1]
      .replace(/_x000D_|_x000A_/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
      .trim())
    .filter(Boolean)
    // Drop the position/category noise PowerShell appends after the message itself.
    .filter((l) => !l.startsWith("+") && !l.startsWith("At line:") && !l.startsWith("~"));
  return lines[0] || raw;
};

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
        reject(new Error(decodePowerShellStderr(stderr) || stdout.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

const escapeSingleQuotes = (value) => String(value ?? "").replace(/'/g, "''");

// Get-Printer's PrinterStatus is the MSFT_Printer *flags* enum (0 = Normal,
// then bit flags: 1 Paused, 2 Error, 128 Offline, 16 PaperOut, ...) — NOT the
// old WMI Win32_Printer 0-7 table this agent previously mapped against (which
// showed healthy printers as "Unknown" and Error printers as "Normal").
// Resolved most-severe-first so a printer that is e.g. both Paused and
// TonerLow reads as whatever actually blocks printing. WorkOffline ("Use
// Printer Offline" in Windows) is folded in as Offline because the spooler
// won't hand jobs to the device in that state either.
const PRINTER_STATUS_FLAGS = [
  [128, "Offline"],
  [33554432, "Server Offline"],
  [2, "Error"],
  [4194304, "Door Open"],
  [8, "Paper Jam"],
  [16, "Paper Out"],
  [64, "Paper Problem"],
  [262144, "No Toner"],
  [1048576, "User Intervention Required"],
  [2097152, "Out of Memory"],
  [4096, "Not Available"],
  [4, "Pending Deletion"],
  [1, "Paused"],
  [32, "Manual Feed"],
  [2048, "Output Bin Full"],
  [131072, "Toner Low"],
  [1024, "Printing"],
  [512, "Busy"],
  [16384, "Processing"],
  [8192, "Waiting"],
  [32768, "Initializing"],
  [65536, "Warming Up"],
  [16777216, "Power Save"],
  [67108864, "Driver Update Needed"],
  [256, "IO Active"],
];

const printerStatusLabel = (status, workOffline) => {
  if (workOffline) return "Offline";
  const value = Number(status) || 0;
  if (value === 0) return "Normal";
  for (const [flag, label] of PRINTER_STATUS_FLAGS) {
    if (value & flag) return label;
  }
  return "Unknown";
};

const listPrinters = async () => {
  const script = `
    $default = (Get-CimInstance -ClassName Win32_Printer -Filter "Default=TRUE" | Select-Object -First 1 -ExpandProperty Name)
    $items = Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus, WorkOffline, @{Name="IsDefault"; Expression={$_.Name -eq $default}}
    $items | ConvertTo-Json -Depth 3
  `;
  const raw = await runPowerShell(script);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((printer) => ({
    ...printer,
    IsDefault: Boolean(printer.IsDefault),
    StatusLabel: printerStatusLabel(printer.PrinterStatus, printer.WorkOffline),
  }));
};

// mm -> hundredths-of-an-inch, the unit System.Drawing.Printing.PaperSize expects.
const mmToHundredthsInch = (mm) => Math.round(((Number(mm) || 80) / 25.4) * 100);

const printTextToPrinter = async ({ printerName, text, title = "BillBull Print Job", paperWidthMm = 80 }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "billbull-print-"));
  const textFile = path.join(tempDir, "job.txt");
  await fs.writeFile(textFile, text, "utf8");
  const paperWidthHundredths = mmToHundredthsInch(paperWidthMm);
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Drawing
    $printerName = '${escapeSingleQuotes(printerName)}'
    $filePath = '${escapeSingleQuotes(textFile)}'
    $title = '${escapeSingleQuotes(title)}'
    # -Encoding UTF8 is required: the file is written by Node as UTF-8 without a
    # BOM, and Windows PowerShell 5.1's Get-Content defaults to ANSI in that
    # case — which turned every non-ASCII character (including the … this app's
    # own line-truncation inserts) into mojibake on the printed page.
    $content = Get-Content -LiteralPath $filePath -Raw -Encoding UTF8
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
    # Zero SOFT margins — but .NET's MarginBounds is (PaperSize minus HardMargin
    # minus soft Margins), and HardMarginX/Y (the driver's own unprintable-edge
    # reservation, commonly 2-4mm per side on thermal drivers) is NOT zeroed by
    # this. That gap between the full paper width and MarginBounds.Width is
    # exactly what was clipping the last 1-2 characters off every line on the
    # client's POS-80C — the text was laid out for the FULL configured width,
    # but only got a narrower box to draw into. Fixed below by measuring the
    # actual box GDI gives us and shrinking the font to fit it instead of
    # assuming it always equals the full configured paper width.
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $lines = $content -split "\\r?\\n"
    $index = 0
    $doc.add_PrintPage({
      param($sender, $e)
      # Longest line in the whole job (not just this page) sets the fit — using
      # this page's longest line only would let font size wobble page to page.
      $longestLine = ($lines | Sort-Object Length -Descending | Select-Object -First 1)
      $activeFont = $font
      if ($longestLine) {
        $measured = $e.Graphics.MeasureString($longestLine, $activeFont)
        if ($measured.Width -gt $e.MarginBounds.Width) {
          # Shrink proportionally to the real printable width the driver actually
          # gave us (HardMarginX-adjusted), rather than clipping at DrawString.
          # This keeps every character on the paper — a slightly smaller font on
          # a narrow driver margin beats losing trailing digits off every price.
          $scale = $e.MarginBounds.Width / $measured.Width
          $newSize = [Math]::Max(6, [Math]::Floor($activeFont.Size * $scale * 10) / 10)
          $activeFont = New-Object System.Drawing.Font($activeFont.FontFamily, $newSize, $activeFont.Style)
        }
      }
      $y = $e.MarginBounds.Top
      $lineHeight = $activeFont.GetHeight($e.Graphics) + 2
      while ($index -lt $lines.Length) {
        $e.Graphics.DrawString($lines[$index], $activeFont, $brush, $e.MarginBounds.Left, $y)
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

// CP1252-representable punctuation that NFKD normalization doesn't decompose —
// mapped to the code-page byte instead of being dropped (…, – — ‘ ’ “ ” • € ™).
const CP1252_PUNCTUATION = {
  0x20ac: 0x80, 0x2026: 0x85, 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2122: 0x99,
};

// Frames a plain-text job as a minimal ESC/POS stream for direct-socket
// printing: init + WPC1252 code-page select, single-byte-sanitized body
// (mirrors escPosReceipt.js toPrinterBytes — NFKD-decompose accents, map
// CP1252 punctuation, '?' for anything else so multi-byte UTF-8 never reaches
// a single-byte controller as garbage), then feed + partial cut. Previously
// this path wrote raw UTF-8 with no framing at all, so non-ASCII garbled and
// the roll was never cut on text jobs sent straight to an IP printer.
const textToEscPosBuffer = (text) => {
  const normalized = String(text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const body = Buffer.alloc(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    body[i] = (code >= 0x20 && code <= 0xff) || code === 0x0a || code === 0x0d
      ? code
      : (CP1252_PUNCTUATION[code] ?? 0x3f);
  }
  const init = Buffer.from([0x1b, 0x40, 0x1b, 0x74, 16]); // ESC @ (init), ESC t 16 (WPC1252)
  const tail = Buffer.from([0x0a, 0x1b, 0x64, 0x03, 0x1d, 0x56, 0x01]); // LF, feed 3, partial cut
  return Buffer.concat([init, body, tail]);
};

// Diagnostic capture: dump the EXACT bytes a print job carries to the user's
// Desktop so a failing receipt can be analysed byte-for-byte offline. The
// filename records which physical route the job took (queue vs network) —
// itself a key diagnostic, since a stray config value used to silently reroute
// USB jobs over TCP. Receipts carry customer names, phone numbers and totals,
// so this only runs with "diagnostics": true in config.json.
const captureEscPosBytes = async (decoded, route) => {
  try {
    const capDir = path.join(os.homedir(), "Desktop", "billbull-print-capture");
    await fs.mkdir(capDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(capDir, `escpos-${route}-${stamp}.bin`), decoded);
  } catch (capErr) {
    console.warn("[escpos] capture failed (non-blocking):", capErr?.message || capErr);
  }
};

const NETWORK_CONNECT_TIMEOUT_MS = 10000;

// Sends a byte buffer straight to a network-attached printer's socket (no text
// re-encoding, no driver involved). `address` is the IP the network policy
// already resolved and approved — never a host name, so DNS cannot answer
// differently here. Many thermal controllers (and Bluetooth-to-serial bridges)
// need the cut command's bytes to actually reach the print head before the
// socket closes, so we wait for the kernel send buffer to drain and give the
// controller a short grace period before tearing the connection down — closing
// immediately after write() can truncate the tail of the job (the cut command
// itself) on slower controllers.
const sendToNetworkPrinter = ({ address, port, buffer }) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: address, port: Number(port) }, () => {
      socket.setTimeout(0);
      socket.write(buffer, () => {
        setTimeout(() => socket.end(), 150);
      });
    });
    socket.setTimeout(NETWORK_CONNECT_TIMEOUT_MS, () => socket.destroy(new Error(`Network printer ${address}:${port} did not answer.`)));
    socket.on("close", (hadError) => { if (!hadError) resolve({ ok: true, message: "Network print job sent successfully." }); });
    socket.on("error", (error) => reject(new Error(error?.message || "Unable to reach network printer.")));
  });

// ── Capability probe command builders ──────────────────────────────────────
// These build ISOLATED, single-feature ESC/POS jobs used by /probe/capabilities
// to determine — empirically, on the actual printer — which binary opcodes the
// firmware honours vs. echoes back as text. Each slip prints a plain-text label
// (which every printer renders) then exactly ONE binary command; if the command
// is honoured you see the image/QR, if it is NOT you see its payload bytes
// printed as garbage glyphs directly under the label. That is the definitive
// discriminator between "our bytes are wrong" and "this firmware lacks this
// opcode" — no assumptions.
const PROBE = {
  ESC: 0x1b,
  GS: 0x1d,
};

const probeLabel = (text) => [...Buffer.from(String(text), "latin1"), 0x0a];

// GS v 0 raster of an arbitrary WxH solid-black box. Round 1 used a tiny 48x32
// box (which this printer prints fine); Round 2 uses the REAL receipt logo's
// dimensions to find the actual break point — width 346 (bpr 44) and heights
// both under and over the 255-row single-byte boundary, since some clone
// firmwares mishandle GS v 0 when yH>0 or when bpr is large.
const probeRasterGSv0 = (w = 48, h = 32) => {
  const bpr = Math.ceil(w / 8);
  // Draw a hollow box (border only) so a correct print is visually obvious and
  // a partial/misaligned decode is easy to spot, without a huge all-black area.
  const data = new Array(bpr * h).fill(0x00);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = y < 2 || y >= h - 2 || x < 2 || x >= w - 2;
      if (edge) data[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return [PROBE.GS, 0x76, 0x30, 0x00, bpr & 0xff, (bpr >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, ...data];
};

const probeRasterGSLraster = () => {
  // GS ( L / GS 8 L raster graphics: store + print. Uses fn 112 (store) then
  // fn 50 (print). Newer/Epson-compliant firmware supports this when GS v 0 is
  // absent. Small 48x32 all-black box.
  const w = 48, h = 32;
  const bpr = Math.ceil(w / 8);
  const img = new Array(bpr * h).fill(0xff);
  // pL pH = (data length + 10) low/high; m=48 fn=112 a=48 bx=1 by=1 c=49
  const p = img.length + 10;
  const store = [PROBE.GS, 0x28, 0x4c, p & 0xff, (p >> 8) & 0xff, 48, 112, 48, 1, 1, 49,
    w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, ...img];
  const print = [PROBE.GS, 0x28, 0x4c, 0x02, 0x00, 48, 50]; // fn 50: print buffered
  return [...store, ...print];
};

const probeRasterEscStar = () => {
  // ESC * m=33 (24-dot double density) — the legacy bit-image opcode virtually
  // every clone supports. 48 columns of a 24-dot-tall black bar.
  const w = 48;
  const cols = [];
  for (let i = 0; i < w; i++) cols.push(0xff, 0xff, 0xff);
  return [PROBE.ESC, 0x2a, 33, w & 0xff, (w >> 8) & 0xff, ...cols, 0x0a];
};

const probeQrGSk = (data) => {
  const parts = [];
  const push = (a) => { for (const b of a) parts.push(b); };
  push([PROBE.GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
  push([PROBE.GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x08]);
  push([PROBE.GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);
  const db = Buffer.from(String(data), "utf8");
  const storeLen = db.length + 3;
  push([PROBE.GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30]);
  push([...db]);
  push([PROBE.GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
  return parts;
};

// Wrap one command-under-test as: ESC @ → "TEXT BEFORE" → command → "TEXT AFTER"
// → feed + cut, each on its own slip. This sandwich is the key discriminator
// (per the RCA checklist): "TEXT BEFORE" confirms init worked; the command's
// own output shows whether the opcode is honoured (clean image/QR) or echoed
// (garbage); and — most important — whether "TEXT AFTER" still prints tells us
// if a malformed/misparsed image command CORRUPTED THE REMAINING STREAM (the
// cropped-tail symptom) versus merely failing in isolation. If TEXT AFTER is
// missing or garbled, the opcode desyncs the parser; if it prints clean, the
// failure is contained to the image itself.
const probeSlip = (label, commandBytes) => Buffer.from([
  PROBE.ESC, 0x40,             // ESC @ init
  PROBE.ESC, 0x74, 16,         // ESC t 16 (WPC1252)
  PROBE.ESC, 0x61, 0x00,       // align left
  ...probeLabel(`== ${label} ==`),
  ...probeLabel("TEXT BEFORE"),
  PROBE.ESC, 0x61, 0x01,       // align center for the image/QR
  ...commandBytes,
  0x0a,
  PROBE.ESC, 0x61, 0x00,       // align left
  ...probeLabel("TEXT AFTER"),
  ...probeLabel("(BEFORE+AFTER both present = stream intact; AFTER missing = opcode corrupts stream)"),
  PROBE.ESC, 0x64, 0x04,       // feed 4
  PROBE.GS, 0x56, 0x01,        // partial cut
]);

// Round 1 (opcode support) is settled on the POS-80C: GS v 0 ✓, ESC * ✓,
// GS ( k QR ✓, GS ( L ✗. So the receipt garbage is NOT opcode support — it's a
// PARAMETER the real receipt hits that the tiny probe box did not. Round 2
// isolates that parameter by replicating the real logo's width (346 dots,
// bpr 44) at heights below and above the 255-row single-byte boundary, and the
// real receipt's LONG multi-line QR payload (vs the short probe URL).
const LONG_QR = [
  "Type: TAX INVOICE", "Doc No: INV-2026-0040", "Date: 04/07/2026 04:00",
  "Company: BillBull Trading LLC", "TRN: 100123456700003",
  "Customer: Ahmed", "Customer Phone: 0559860525",
  "Total: AED 2520.00", "VAT: AED 120.00",
].join("\n");

const PROBE_JOBS = (qrData) => [
  ["A. TEXT BASELINE", probeLabel("plain text 0123456789 ABCabc — should print clean")],
  // Real logo width, SHORT (yH=0). If this prints a clean hollow box, width/bpr
  // is fine and the problem is height.
  ["B. GS v 0 W346 H120 (yH=0)", probeRasterGSv0(346, 120)],
  // Real logo width, TALL (>255 rows → yH=1). If THIS is garbage while B is
  // clean, the firmware mishandles GS v 0 when the height high-byte is nonzero
  // — the exact fix is to keep logo height <=255 (or band it).
  ["C. GS v 0 W346 H300 (yH=1)", probeRasterGSv0(346, 300)],
  // Full paper width (576), short — checks the max-width boundary.
  ["D. GS v 0 W576 H120", probeRasterGSv0(576, 120)],
  // The real receipt's long multi-line QR payload (short probe QR already
  // worked; this checks whether a large QR is the failure instead).
  ["E. GS ( k QR (long payload)", probeQrGSk(qrData || LONG_QR)],
];

// Runs every probe slip in sequence through `send` (the same policy-checked
// path receipts take), returning a per-slip send-status summary. Printing is
// what produces the evidence; the HTTP response just confirms each job was
// accepted by the spooler.
const runCapabilityProbe = async ({ qrData }, send) => {
  const jobs = PROBE_JOBS(qrData || null); // null → PROBE_JOBS uses the long multi-line QR
  const results = [];
  for (const [label, cmd] of jobs) {
    const buffer = probeSlip(label, cmd);
    try {
      await send(buffer, `BillBull Probe ${label}`);
      results.push({ probe: label, ok: true, bytes: buffer.length });
    } catch (err) {
      results.push({ probe: label, ok: false, error: err?.message || String(err) });
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return results;
};

// Sends a raw ESC/POS byte buffer to a Windows-installed printer queue using
// the RAW datatype via the Win32 spooler (OpenPrinter/StartDocPrinter/
// WritePrinter). This bypasses GDI entirely, so it carries our density/heat/
// font/raster-image commands intact regardless of whether the queue is backed
// by USB, Bluetooth (paired as a printer port), or a generic/text driver —
// none of which is possible through System.Drawing.Printing (that path always
// rasterizes through the driver, which is what loses ESC/POS control).
const printEscPosToPrinterQueue = async ({ printerName, buffer: decoded, title = "BillBull ESC/POS Receipt" }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "billbull-print-"));
  const dataFile = path.join(tempDir, "job.bin");
  await fs.writeFile(dataFile, decoded);
  const script = `
    $ErrorActionPreference = 'Stop'
    # CharSet MUST be Ansi (not Auto) on the two string-carrying P/Invokes and on
    # DOCINFOA. CharSet.Auto resolves the entry point to the *W (Unicode) export
    # on Windows NT — so StartDocPrinter binds to StartDocPrinterW, which reads
    # DOCINFOW with WIDE (UTF-16) string pointers. But the struct fields are
    # marshalled [MarshalAs(LPStr)] = ANSI, so pDataType="RAW" is passed as the
    # ANSI bytes 52 41 57 00, which StartDocPrinterW reinterprets as the UTF-16
    # string "䅒W" — NOT "RAW". Lenient legacy v3 GDI drivers quietly default an
    # unrecognised-but-non-empty datatype to RAW (so it "worked" on some tills),
    # but stricter thermal drivers (the client's POS-80C) reject it, and
    # StartDocPrinter fails with a generic error — the exact symptom reported.
    # Forcing CharSet.Ansi binds OpenPrinterA/StartDocPrinterA, whose DOCINFOA
    # genuinely expects the ANSI strings we marshal, so "RAW" arrives as "RAW".
    Add-Type -Name RawPrinter -Namespace BillBull -MemberDefinition @'
      [DllImport("winspool.drv", CharSet=CharSet.Ansi, SetLastError=true)]
      public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool ClosePrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", CharSet=CharSet.Ansi, SetLastError=true)]
      public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA pDocInfo);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool EndDocPrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool StartPagePrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool EndPagePrinter(IntPtr hPrinter);
      [DllImport("winspool.drv", SetLastError=true)]
      public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

      [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
      public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
      }
'@
    # NOTE: no -UsingNamespace System.Runtime.InteropServices here. Add-Type
    # -MemberDefinition already emits that using by default; passing it again
    # generates a duplicate-using compiler warning (CS0105) that Windows
    # PowerShell 5.1 treats as an error — the type silently never compiled and,
    # before $ErrorActionPreference='Stop' above, every printer call below was
    # skipped while the script still reported {"ok":true}. See
    # docs/pos-printing-pipeline-audit-2026-07-04.md §2.5.

    # win32ErrorFor() renders a GetLastError() code already captured by the
    # caller. GetLastWin32Error() MUST be read on the same statement as the
    # failing P/Invoke call (see below) — routing it through a function call,
    # or letting any other statement (even a simple if/pipeline) run first,
    # gives the CLR/PowerShell host a chance to make its own interop call in
    # between and clobber the thread's last-error slot. That was silently
    # happening here: every failure was reporting Win32Error 203
    # (ERROR_ENVVAR_NOT_FOUND) — a leftover from an unrelated call — instead of
    # the real StartDocPrinter/WritePrinter failure code, making the specific
    # ACCESS_DENIED(5) / INVALID_DATATYPE(1804) / queue-state diagnosis below
    # impossible to trust.
    function win32ErrorFor([int]$code) {
      $msg = (New-Object System.ComponentModel.Win32Exception($code)).Message
      "Win32Error $code\`: $msg"
    }

    $printerName = '${escapeSingleQuotes(printerName)}'
    $bytes = [System.IO.File]::ReadAllBytes('${escapeSingleQuotes(dataFile)}')

    # Surface the queue's live spooler state before attempting RAW — a printer
    # that is Paused, WorkOffline, or has a jammed/stuck job ahead of this one
    # in queue will fail StartDocPrinter/WritePrinter with the SAME generic
    # symptom as a driver that genuinely rejects the RAW datatype, and the two
    # need completely different fixes (resume the queue vs. change the driver).
    $queueInfo = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
    if ($queueInfo) {
      if ($queueInfo.PrinterStatus -ne 'Normal' -or $queueInfo.WorkOffline) {
        # $WorkOffline is a bool that renders as blank when $false, which made the
        # message read "offline: " — spell it out as Yes/No so a support ticket is
        # unambiguous about whether this is a "Use Printer Offline" toggle or a
        # genuine device Error state.
        $offlineText = if ($queueInfo.WorkOffline) { 'Yes' } else { 'No' }
        throw "Printer queue '$printerName' is not ready (status: $($queueInfo.PrinterStatus), offline: $offlineText) — resume/clear the queue in Windows (right-click the printer -> See what's printing -> Cancel All / uncheck Use Printer Offline), or configure a healthy receipt printer, before retrying"
      }
      $stuckJobs = Get-PrintJob -PrinterName $printerName -ErrorAction SilentlyContinue | Where-Object { $_.JobStatus -match 'Error|PaperOut|Paused|Blocked' }
      if ($stuckJobs) {
        throw "Printer has $($stuckJobs.Count) stuck job(s) blocking the queue (status: $($stuckJobs[0].JobStatus)) — clear the print queue for $printerName and retry"
      }
    }

    $hPrinter = [IntPtr]::Zero
    $openOk = [BillBull.RawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)
    $openErrCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if (-not $openOk) {
      throw "Printer not found: $printerName ($(win32ErrorFor $openErrCode))"
    }
    try {
      $docInfo = New-Object BillBull.RawPrinter+DOCINFOA
      $docInfo.pDocName = '${escapeSingleQuotes(title)}'
      $docInfo.pDataType = "RAW"
      $startDocOk = [BillBull.RawPrinter]::StartDocPrinter($hPrinter, 1, [ref]$docInfo)
      $startDocErrCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      if (-not $startDocOk) {
        $err = win32ErrorFor $startDocErrCode
        # ERROR_INVALID_DATATYPE (1804) is the specific signal that the driver's
        # datatype list genuinely does not include RAW (v4/XPS-class drivers,
        # or a driver where the RAW datatype was removed) — everything else
        # (access denied, spooler/queue state) is an environment problem, not
        # a driver-capability problem, and needs a different fix.
        if ($startDocErrCode -eq 1804) {
          throw "Driver for '$printerName' does not support RAW printing ($err) — reinstall this printer with its vendor driver or 'Generic / Text Only' instead of the current driver"
        }
        throw "StartDocPrinter failed for $printerName ($err)"
      }
      try {
        $startPageOk = [BillBull.RawPrinter]::StartPagePrinter($hPrinter)
        $startPageErrCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if (-not $startPageOk) { throw "StartPagePrinter failed for $printerName ($(win32ErrorFor $startPageErrCode))" }
        $written = 0
        $writeOk = [BillBull.RawPrinter]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)
        $writeErrCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if (-not $writeOk) {
          throw "WritePrinter failed for $printerName ($(win32ErrorFor $writeErrCode))"
        }
        if ($written -ne $bytes.Length) {
          throw "WritePrinter wrote $written of $($bytes.Length) bytes for $printerName"
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

// ── HTTP interface ─────────────────────────────────────────────────────────
//
// Every request passes, in order:
//   1. Peer: the TCP peer must be loopback (the socket is bound to 127.0.0.1;
//      this holds even if HOST is ever changed).
//   2. Host: exactly 127.0.0.1:<port> or localhost:<port>. A DNS-rebinding page
//      reaches this port with its own name in Host (evil.example:19777) and is
//      refused here, before anything else runs.
//   3. Origin: when present it must be on the configured allow-list (exact
//      scheme + host + port). Untrusted origins get 403 and no CORS headers, so
//      the page cannot read anything. Only GET /health and the diagnostics page
//      may omit Origin — every browser fetch sends one, so a missing Origin
//      means curl, a monitor or a top-level navigation.
//   4. Token: everything that prints, lists printers or reports pairing state
//      needs `Authorization: Bearer <token>` issued to that same origin by
//      pairing. CORS is not authentication; this is.
//   5. Destination: network targets pass the LAN policy (private address,
//      printer port). Then the target — a Windows queue, or the resolved
//      address and port — must be set up in config.json "printers", and the
//      protocol it is set up for must be the one the route carries: ESC/POS on
//      /print/escpos, /print/receipt, /test-print and the probes; ZPL on
//      /print/zpl. An unlisted, ambiguous or conflicting destination, or a
//      mismatch, is refused here, before a socket or queue is opened.
//   6. Content: the whole job passes the allow-list of the destination's
//      protocol — ESC/POS (no drawer, buzzer, power-off, NV writes, nothing
//      unknown or truncated) or ZPL (complete BillBull label formats, no
//      tilde, configuration, network or storage commands).
// Configuration (allowed origins, revocation, printer kinds) is never reachable
// over HTTP — only through config.json, the CLI and the tray menu on this PC.

const ROUTES = {
  "GET /health": { auth: "none" },
  "POST /pair/start": { auth: "origin" },
  "POST /pair/complete": { auth: "origin" },
  "GET /auth/status": { auth: "token" },
  "POST /pair/revoke": { auth: "token" },
  "GET /printers": { auth: "token" },
  "POST /test-print": { auth: "token" },
  "POST /print/receipt": { auth: "token" },
  "POST /print/escpos": { auth: "token" },
  "POST /print/zpl": { auth: "token" },
  "POST /probe/echo": { auth: "token", diagnostics: true },
  "POST /probe/capabilities": { auth: "token", diagnostics: true },
  "GET /diagnostics/probe": { auth: "none", diagnostics: true },
};
const ALLOWED_REQUEST_HEADERS = new Set(["authorization", "content-type"]);
const LOOPBACK_PEERS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// Default display for pairing codes when there is no tray: an interactive
// terminal only. A redirected log file is not a screen, so pairing is refused
// rather than writing the code somewhere it outlives the two-minute window.
const consolePairingDisplay = (event) => {
  if (event.done) return true;
  if (!process.stdout.isTTY) return false;
  console.log(`\n[pairing] ${event.origin} wants to pair. Code: ${event.code} (expires in 2 minutes)\n`);
  return true;
};

const sha256Hex = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const isNetworkTarget = (target) =>
  // Route by the EXPLICIT connectionType; only fall back to ipAddress presence
  // when the caller sent no connectionType at all (legacy callers). A stray
  // ipAddress on a USB/queue printer's config must not silently reroute its
  // jobs over TCP — a different physical path than intended.
  target.connectionType === "NETWORK_IP" || (!target.connectionType && Boolean(target.ipAddress));

const requirePrinterName = (target) => {
  if (!target.printerName || typeof target.printerName !== "string") {
    throw new HttpError(400, "AGENT_BAD_REQUEST", "printerName is required for workstation printers.");
  }
};

const TOKEN_MESSAGES = {
  AGENT_AUTH_REQUIRED: "This print agent is not paired with this BillBull site. Pair it in POS → Devices → Local Print Agent.",
  AGENT_TOKEN_EXPIRED: "The pairing with this print agent has expired. Pair it again in POS → Devices → Local Print Agent.",
  AGENT_TOKEN_REVOKED: "The pairing with this print agent was revoked. Pair it again in POS → Devices → Local Print Agent.",
  AGENT_TOKEN_INVALID: "The print agent did not accept this pairing. Pair it again in POS → Devices → Local Print Agent.",
};

const createAgentServer = ({
  config = createConfig(),
  transports = {},
  displayPairingCode = consolePairingDisplay,
  now = Date.now,
} = {}) => {
  const io = {
    listPrinters,
    printText: printTextToPrinter,
    printQueue: printEscPosToPrinterQueue,
    sendNetwork: sendToNetworkPrinter,
    capture: captureEscPosBytes,
    ...transports,
  };
  const store = createTokenStore({ home: config.home, now });
  const pairing = createPairingManager({
    store,
    getTtlDays: () => config.current().tokenTtlDays,
    display: (event) => displayPairingCode(event),
    now,
  });
  let networkPolicyKey = null;
  let networkPolicy = null;
  const policyFor = (cfg) => {
    const key = JSON.stringify(cfg.network);
    if (key !== networkPolicyKey) {
      networkPolicy = createNetworkPolicy(cfg.network);
      networkPolicyKey = key;
    }
    return networkPolicy;
  };

  const server = http.createServer();
  const boundPort = () => server.address()?.port;

  // Diagnostics mode serves probe.html from the agent itself; that page's own
  // origin is trusted only while diagnostics are switched on.
  const trustedOrigins = (cfg) => (cfg.diagnostics
    ? new Set([...cfg.allowedOrigins, `http://127.0.0.1:${boundPort()}`, `http://localhost:${boundPort()}`])
    : cfg.allowedOrigins);

  // The command policy for each raw protocol. Each one is complete on its own:
  // ZPL is never "checked" by the ESC/POS walker or the other way round.
  const POLICIES = {
    escpos: { inspect: inspectEscPos, describe: describeRefusal },
    zpl: { inspect: inspectZpl, describe: describeZplRefusal },
  };

  // The destination a job for `target` may go to: a configured queue (sent to
  // the configured spelling) or a configured network printer (sent to the
  // address the network policy approved). `protocol` is what the route
  // carries; the destination's own setting must match it. Request fields such
  // as "protocol", "format" or "deviceType" are never read.
  const resolveDestination = async (cfg, target, protocol) => {
    try {
      if (isNetworkTarget(target)) {
        const address = await policyFor(cfg).resolveAllowed(target.ipAddress, target.portNumber);
        return resolveNetwork(cfg.destinations, address, Number(target.portNumber), protocol);
      }
      requirePrinterName(target);
      return resolveQueue(cfg.destinations, target.printerName, protocol);
    } catch (err) {
      if (err instanceof DestinationError) {
        console.warn(`[security] refused ${protocol} job: ${err.code} ${JSON.stringify(err.extra?.destination ?? null)}`);
      }
      throw err;
    }
  };

  // Sends policy-checked bytes to a resolved destination. The single path for
  // every raw byte stream: receipts, labels, test prints, probe slips. The
  // destination and the whole job are checked before anything is opened or
  // written; the destination's protocol picks the command policy.
  const sendBytes = async (cfg, target, buffer, title, protocol, resolved = null) => {
    const dest = resolved || await resolveDestination(cfg, target, protocol);
    const policy = POLICIES[dest.protocol];
    const verdict = policy.inspect(buffer);
    if (!verdict.allowed) {
      console.warn(`[security] refused ${dest.protocol} job: ${verdict.command} at ${verdict.offset} (${verdict.category})`);
      throw new HttpError(403, "AGENT_COMMAND_FORBIDDEN", policy.describe(verdict),
        { protocol: dest.protocol, category: verdict.category, command: verdict.command, offset: verdict.offset });
    }
    // Integrity log (RCA checklist §8): byte length + SHA-256 of what the agent
    // decoded, compared by the browser against its generation-time hash.
    const sha256 = sha256Hex(buffer);
    if (dest.kind === "network") {
      console.log(`[${dest.protocol}] network=${dest.address}:${dest.port} bytes=${buffer.length} sha256=${sha256}`);
      if (cfg.diagnostics) await io.capture(buffer, "network");
      const result = await io.sendNetwork({ address: dest.address, port: dest.port, buffer });
      return { ...result, bytes: buffer.length, sha256 };
    }
    console.log(`[${dest.protocol}] queue=${JSON.stringify(dest.printerName)} bytes=${buffer.length} sha256=${sha256}`);
    if (cfg.diagnostics) await io.capture(buffer, "queue");
    const result = await io.printQueue({ printerName: dest.printerName, buffer, title });
    return { ...result, bytes: buffer.length, sha256 };
  };

  // Plain-text jobs. The agent builds the bytes itself (textToEscPosBuffer maps
  // every control character to '?'), so text can never smuggle an ESC/POS
  // command. Text is still a receipt: '^' and '~' reach the printer as typed,
  // so it goes only to a destination set up for ESC/POS — never to a Zebra,
  // which would execute "^XA..." typed into a text job.
  const printText = async ({ cfg, body }) => {
    if (!body.text || typeof body.text !== "string") throw new HttpError(400, "AGENT_BAD_REQUEST", "text is required.");
    const dest = await resolveDestination(cfg, body, "escpos");
    if (dest.kind === "network") {
      return io.sendNetwork({ address: dest.address, port: dest.port, buffer: textToEscPosBuffer(body.text) });
    }
    return io.printText({
      printerName: dest.printerName,
      text: body.text,
      title: body.title || "BillBull POS Receipt",
      paperWidthMm: body.paperWidthMm,
    });
  };

  const handlers = {
    "GET /health": async () => ({ ok: true, service: "billbull-pos-print-agent", version: VERSION, protocol: PROTOCOL }),

    "POST /pair/start": async ({ origin, body }) =>
      ({ ok: true, ...pairing.start({ origin, label: typeof body.label === "string" ? body.label : null }) }),

    "POST /pair/complete": async ({ origin, body }) =>
      ({ ok: true, ...pairing.complete({ origin, pairingId: body.pairingId, code: body.code }) }),

    "GET /auth/status": async ({ token }) =>
      ({ ok: true, paired: true, origin: token.origin, expiresAt: new Date(token.expiresAt).toISOString() }),

    "POST /pair/revoke": async ({ token }) => ({ ok: store.revoke(token.id) }),

    // Each queue carries the kind it is set up for on this PC ("escpos", "zpl",
    // "conflict", or null = not set up), so POS → Devices can say why a printer
    // will be refused. Read-only: nothing over HTTP changes it.
    "GET /printers": async ({ cfg }) => ({
      printers: (await io.listPrinters()).map((p) => ({ ...p, BillBullProtocol: queueProtocol(cfg.destinations, p.Name) })),
    }),

    "POST /test-print": printText,
    "POST /print/receipt": printText,

    "POST /print/escpos": async ({ cfg, body }) => {
      if (!body.dataBase64 || typeof body.dataBase64 !== "string") {
        throw new HttpError(400, "AGENT_BAD_REQUEST", "dataBase64 is required.");
      }
      const buffer = Buffer.from(body.dataBase64, "base64");
      if (!buffer.length) throw new HttpError(400, "AGENT_BAD_REQUEST", "dataBase64 decoded to no bytes.");
      return sendBytes(cfg, body, buffer, body.title || "BillBull ESC/POS Receipt", "escpos");
    },

    // Zebra labels. Same transports as /print/escpos, ZPL command policy.
    "POST /print/zpl": async ({ cfg, body }) => {
      if (!body.dataBase64 || typeof body.dataBase64 !== "string") {
        throw new HttpError(400, "AGENT_BAD_REQUEST", "dataBase64 is required.");
      }
      const buffer = Buffer.from(body.dataBase64, "base64");
      if (!buffer.length) throw new HttpError(400, "AGENT_BAD_REQUEST", "dataBase64 decoded to no bytes.");
      return sendBytes(cfg, body, buffer, body.title || "BillBull Labels", "zpl");
    },

    // Transmission-integrity check: decode the base64 the browser sent and
    // report the received byte count + SHA-256, WITHOUT printing.
    "POST /probe/echo": async ({ body }) => {
      if (!body.dataBase64) throw new HttpError(400, "AGENT_BAD_REQUEST", "dataBase64 is required.");
      const buf = Buffer.from(String(body.dataBase64), "base64");
      return {
        ok: true,
        receivedBytes: buf.length,
        sha256: sha256Hex(buf),
        firstBytesHex: buf.subarray(0, 32).toString("hex"),
        lastBytesHex: buf.subarray(Math.max(0, buf.length - 16)).toString("hex"),
      };
    },

    // Prints the isolated single-opcode capability slips to the target printer.
    "POST /probe/capabilities": async ({ cfg, body }) => {
      if (!body.printerName && !body.ipAddress) {
        throw new HttpError(400, "AGENT_BAD_REQUEST", "printerName or ipAddress is required.");
      }
      const dest = await resolveDestination(cfg, body, "escpos");
      const results = await runCapabilityProbe({ qrData: body.qrData }, (buffer, title) => sendBytes(cfg, body, buffer, title, "escpos", dest));
      return { ok: results.every((r) => r.ok), results };
    },
  };

  const reply = (res, status, payload, { corsOrigin = null, contentType = "application/json; charset=utf-8" } = {}) => {
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    };
    if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
    res.writeHead(status, headers);
    res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
  };

  const handle = async (req, res, state) => {
    const pathname = new URL(req.url, "http://agent.invalid").pathname;
    const cfg = config.current();
    const refuse = (status, code, message) => {
      console.warn(`[security] ${status} ${code} ${req.method} ${JSON.stringify(pathname)} origin=${JSON.stringify(req.headers.origin ?? null)} host=${JSON.stringify(req.headers.host ?? null)}`);
      throw new HttpError(status, code, message);
    };

    if (!LOOPBACK_PEERS.has(req.socket.remoteAddress)) {
      refuse(403, "AGENT_REMOTE_REJECTED", "The print agent only accepts connections from this PC.");
    }

    const host = String(req.headers.host || "").toLowerCase();
    if (host !== `127.0.0.1:${boundPort()}` && host !== `localhost:${boundPort()}`) {
      refuse(421, "AGENT_HOST_REJECTED", "Requests must address the print agent as 127.0.0.1 or localhost.");
    }

    const originHeader = req.headers.origin;
    let origin = null;
    if (originHeader !== undefined) {
      const normalized = normalizeOrigin(originHeader);
      if (!normalized || !trustedOrigins(cfg).has(normalized)) {
        refuse(403, "AGENT_ORIGIN_NOT_ALLOWED",
          "This print agent does not trust this site. Add the BillBull address on this PC with: BillBullPrintAgent.exe --add-origin <address> | more");
      }
      origin = normalized;
      // Echo the exact allow-listed value the browser sent, never anything else.
      state.corsOrigin = originHeader;
    } else if (cfg.diagnostics && req.headers["sec-fetch-site"] === "same-origin") {
      // Browsers omit Origin on same-origin GETs, which is what the agent-served
      // probe page makes. Host is already pinned to 127.0.0.1/localhost above,
      // so this can only be the agent's own origin; a token is still required.
      origin = `http://${host}`;
    }

    if (req.method === "OPTIONS") {
      if (!origin) refuse(403, "AGENT_ORIGIN_REQUIRED", "Preflight requests must carry an Origin.");
      const route = ROUTES[`${req.headers["access-control-request-method"] || ""} ${pathname}`];
      if (!route || (route.diagnostics && !cfg.diagnostics)) refuse(404, "AGENT_NOT_FOUND", "Not found.");
      const requested = String(req.headers["access-control-request-headers"] || "")
        .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
      if (requested.some((h) => !ALLOWED_REQUEST_HEADERS.has(h))) {
        refuse(403, "AGENT_HEADERS_NOT_ALLOWED", "Only Authorization and Content-Type request headers are accepted.");
      }
      const headers = {
        "Access-Control-Allow-Origin": state.corsOrigin,
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        "Cache-Control": "no-store",
        Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
      };
      // Chrome's Private/Local Network Access preflight for a public site
      // calling 127.0.0.1 — answered only for an allow-listed origin.
      if (req.headers["access-control-request-private-network"] === "true") {
        headers["Access-Control-Allow-Private-Network"] = "true";
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const routeKey = `${req.method} ${pathname}`;
    const route = ROUTES[routeKey];
    if (!route || (route.diagnostics && !cfg.diagnostics)) refuse(404, "AGENT_NOT_FOUND", "Not found.");

    if (routeKey === "GET /diagnostics/probe") {
      const html = await fs.readFile(path.join(__dirname, "probe.html"), "utf8");
      reply(res, 200, html, { contentType: "text/html; charset=utf-8" });
      return;
    }

    if (route.auth !== "none" && !origin) {
      refuse(403, "AGENT_ORIGIN_REQUIRED", "Requests must come from a BillBull page.");
    }

    let token = null;
    if (route.auth === "token") {
      const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
      if (!match) refuse(401, "AGENT_AUTH_REQUIRED", TOKEN_MESSAGES.AGENT_AUTH_REQUIRED);
      const verdict = store.verify(match[1], origin);
      if (!verdict.ok) refuse(401, verdict.code, TOKEN_MESSAGES[verdict.code]);
      token = verdict.record;
    }

    let body = {};
    if (req.method === "POST") {
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (type !== "application/json") refuse(415, "AGENT_UNSUPPORTED_MEDIA_TYPE", "Requests must be application/json.");
      body = await readJsonBody(req, cfg.maxBodyBytes);
    }

    reply(res, 200, await handlers[routeKey]({ cfg, origin, token, body }), { corsOrigin: state.corsOrigin });
  };

  server.on("request", (req, res) => {
    const state = { corsOrigin: null };
    handle(req, res, state).catch((error) => {
      const known = error instanceof HttpError || error instanceof PairingError || error instanceof DestinationError;
      const status = known ? error.status : error instanceof NetworkPolicyError ? 400 : 500;
      const code = typeof error.code === "string" && error.code.startsWith("AGENT_") ? error.code : "AGENT_PRINT_FAILED";
      const extra = error instanceof HttpError || error instanceof DestinationError ? error.extra
        : error instanceof PairingError && error.attemptsRemaining !== undefined ? { attemptsRemaining: error.attemptsRemaining } : {};
      if (status >= 500) console.error(`[agent] ${req.method} ${JSON.stringify(req.url)} failed: ${error?.message || error}`);
      if (res.headersSent) {
        res.end();
        return;
      }
      // A refused upload is not drained; close the connection after the reply
      // rather than read megabytes we have already decided to reject.
      if (status === 413) res.setHeader("Connection", "close");
      reply(res, status, { ok: false, code, message: error?.message || "Unhandled print-agent error.", ...extra },
        { corsOrigin: state.corsOrigin });
    });
  });

  server.agent = { config, store, pairing };
  return server;
};

// What a listening agent reports about its setup, once, at startup.
const logStartup = (server) => {
  const { allowedOrigins, destinations, fileProblem } = server.agent.config.current();
  console.log(`[billbull-pos-print-agent] ${VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`[billbull-pos-print-agent] config ${server.agent.config.file}; trusted origins: ${[...allowedOrigins].join(", ") || "(none — run --add-origin)"}`);
  if (fileProblem) console.warn(`[billbull-pos-print-agent] config.json cannot be used (${fileProblem}); every request is refused until it is fixed`);
  if (!destinations.queues.size && !destinations.network.size) {
    console.warn('[billbull-pos-print-agent] no printer is set up for BillBull; every print is refused until one is (tray menu → Printers, or --set-printer "<name>" escpos|zpl)');
  }
};

// Process exit codes when the agent itself (not a CLI command) cannot start.
// 0 and 2 belong to the CLI (see lib/cli.js).
const START_EXIT = Object.freeze({ FAILED: 1, ALREADY_RUNNING: 3, PORT_UNAVAILABLE: 4 });

/**
 * Creates and binds the agent: { host, port, server, starter } once listening.
 * Rejects with a lifecycle StartupError when the port is taken — this headless
 * path does not retry (the tray does).
 */
const startServer = async (options = {}) => {
  const server = createAgentServer(options);
  const starter = createStarter({ server, home: server.agent.config.home, host: HOST, port: PORT, version: VERSION, retryMs: null });
  const state = await starter.start();
  if (state.state !== "running") throw new StartupError(state.code, state.message);
  logStartup(server);
  return { host: HOST, port: PORT, server, starter };
};

module.exports = {
  startServer, createAgentServer, logStartup, listPrinters, textToEscPosBuffer, PORT, HOST, VERSION, PROTOCOL, START_EXIT,
};

// Running directly (`node server.js` / `npm start`) keeps the original
// headless behavior; the tray entrypoint drives the same pieces with a
// systray UI in the same process. Configuration commands (--add-origin,
// --revoke-all, ...) run and exit instead of starting.
if (require.main === module) {
  const { runCli } = require("./lib/cli");
  if (!runCli(process.argv.slice(2))) {
    const startedAt = Date.now();
    startServer().then(({ server, starter }) => {
      const home = server.agent.config.home;
      watchForStopRequest({
        home,
        startedAt,
        onStop: async () => {
          console.log("[billbull-pos-print-agent] stop requested (--stop); finishing in-flight requests");
          starter.stop();
          await closeGracefully(server);
          writeStatus(home, { state: "stopped", reason: "stop requested", version: VERSION, port: PORT });
          process.exit(0);
        },
      });
    }).catch((error) => {
      console.error(`[billbull-pos-print-agent] failed to start: ${error?.message || error}`);
      process.exit(error?.code === "AGENT_ALREADY_RUNNING" ? START_EXIT.ALREADY_RUNNING
        : error instanceof StartupError ? START_EXIT.PORT_UNAVAILABLE : START_EXIT.FAILED);
    });
  }
}
