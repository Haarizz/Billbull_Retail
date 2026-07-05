"use strict";

const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.BILLBULL_PRINT_AGENT_PORT || 19777);
// Surfaced on /health so a till's installed agent build can be identified
// remotely — older builds carry the silent-failure RAW-print bug fixed in 0.2.0.
const VERSION = require("./package.json").version;

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

const printTextToNetworkPrinter = async ({ ipAddress, portNumber = 9100, text }) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ipAddress, port: Number(portNumber) }, () => {
      // Same drain grace as the ESC/POS path below — ending the socket right
      // after write() can truncate the tail (the cut command) on slower
      // controllers.
      socket.write(textToEscPosBuffer(text), () => {
        setTimeout(() => socket.end(), 150);
      });
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

// Runs every probe slip in sequence to the given printer/queue, returning a
// per-slip send-status summary. Printing is what produces the evidence; the
// HTTP response just confirms each job was accepted by the spooler.
const runCapabilityProbe = async ({ printerName, ipAddress, portNumber, connectionType, qrData }) => {
  const jobs = PROBE_JOBS(qrData || null); // null → PROBE_JOBS uses the long multi-line QR
  const results = [];
  for (const [label, cmd] of jobs) {
    const dataBase64 = probeSlip(label, cmd).toString("base64");
    try {
      if (connectionType === "NETWORK_IP" || ipAddress) {
        await printEscPosToNetworkPrinter({ ipAddress, portNumber, dataBase64 });
      } else {
        await printEscPosToPrinterQueue({ printerName, dataBase64, title: `BillBull Probe ${label}` });
      }
      results.push({ probe: label, ok: true, bytes: Buffer.from(dataBase64, "base64").length });
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
const printEscPosToPrinterQueue = async ({ printerName, dataBase64, title = "BillBull ESC/POS Receipt" }) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "billbull-print-"));
  const dataFile = path.join(tempDir, "job.bin");
  const decoded = Buffer.from(String(dataBase64 ?? ""), "base64");
  // Integrity log (RCA checklist §8): record the byte length + SHA-256 of the
  // buffer the agent decoded, so it can be compared against the hash the browser
  // computed at generation time — proving the base64→HTTP→agent hop added/dropped
  // no bytes. WritePrinter's own $written===Length assert (below, in-script)
  // covers the final agent→spooler hop.
  const sha256 = crypto.createHash("sha256").update(decoded).digest("hex");
  console.log(`[escpos] queue="${printerName}" bytes=${decoded.length} sha256=${sha256}`);
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
    // Return the byte length + hash the agent actually wrote so callers can log
    // it alongside their generation-time hash (RCA checklist §8) without a
    // separate /probe/echo round-trip.
    return { ok: true, message: "ESC/POS print job sent successfully.", bytes: decoded.length, sha256 };
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
      sendJson(res, 200, { ok: true, service: "billbull-pos-print-agent", version: VERSION });
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

    // Transmission-integrity check: decode the base64 the browser sent and
    // report the received byte count + SHA-256, WITHOUT printing. The caller
    // compares these against what escPosReceipt.js generated in the browser; if
    // they match, the base64→HTTP→agent hop is byte-perfect and any garbage on
    // paper is the printer firmware, not a corrupted stream. Also echoes the
    // first/last bytes as hex so a malformed leading command is visible.
    if (req.method === "POST" && req.url === "/probe/echo") {
      const body = await readJsonBody(req);
      if (!body?.dataBase64) {
        sendJson(res, 400, { ok: false, message: "dataBase64 is required." });
        return;
      }
      const buf = Buffer.from(String(body.dataBase64), "base64");
      sendJson(res, 200, {
        ok: true,
        receivedBytes: buf.length,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        firstBytesHex: buf.subarray(0, 32).toString("hex"),
        lastBytesHex: buf.subarray(Math.max(0, buf.length - 16)).toString("hex"),
      });
      return;
    }

    // Prints the isolated single-opcode capability slips to the target printer.
    if (req.method === "POST" && req.url === "/probe/capabilities") {
      const body = await readJsonBody(req);
      if (!body?.printerName && !body?.ipAddress) {
        sendJson(res, 400, { ok: false, message: "printerName or ipAddress is required." });
        return;
      }
      const results = await runCapabilityProbe({
        printerName: body.printerName,
        ipAddress: body.ipAddress,
        portNumber: body.portNumber,
        connectionType: body.connectionType,
        qrData: body.qrData,
      });
      sendJson(res, 200, { ok: results.every((r) => r.ok), results });
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

const startServer = () =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      console.log(`[billbull-pos-print-agent] listening on http://${HOST}:${PORT}`);
      resolve({ host: HOST, port: PORT });
    });
  });

module.exports = { startServer, listPrinters, PORT, HOST };

// Running directly (`node server.js` / `npm start`) keeps the original
// headless behavior; the tray entrypoint requires startServer instead so it
// can also drive the systray UI in the same process.
if (require.main === module) {
  startServer().catch((error) => {
    console.error(`[billbull-pos-print-agent] failed to start:`, error?.message || error);
    process.exit(1);
  });
}
