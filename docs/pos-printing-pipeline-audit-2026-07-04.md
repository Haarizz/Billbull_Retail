# POS Printing Pipeline — End-to-End Technical Audit (2026-07-04)

Scope: complete trace of the printing workflow from the POS UI to the physical printer —
printer detection, selection, invocation, data generation, transmission, encoding, and
thermal-printer compatibility. **Every finding below was verified against the actual codebase
and/or live runtime tests on this Windows 11 workstation** (payload captures, spooler checks,
a fake network printer, and the agent's own PowerShell scripts extracted and executed verbatim).
Nothing in this document is assumed from reading alone unless explicitly marked *(code-read only)*.

---

## 1. Architecture — the four print paths

```
                         ┌──────────────────────────────────────────────────────────────┐
                         │                       POS Frontend (React)                    │
                         │  POSSales.jsx / POSConsole.jsx / CustomerView.jsx             │
                         │  builders: escPosReceipt.js · posPrintUtils.js               │
                         └───────┬───────────────┬───────────────┬───────────────┬──────┘
                                 │ A             │ B             │ C             │ D
                                 ▼               ▼               ▼               ▼
                     POST 127.0.0.1:19777   POST /api/pos/   POST 127.0.0.1:  hidden <iframe>
                     /print/escpos          printers/{id}/   19777/print/     + window.print()
                     (raw ESC/POS b64)      print/escpos     receipt (text)   (HTML)
                                 │               │               │               │
                                 ▼               ▼               ▼               ▼
                     Local Print Agent      Spring backend   Local Print      Chrome print
                     (Node, server.js)      PosPrinterService  Agent (GDI)    pipeline + OS
                                 │               │               │             print dialog
                     powershell.exe          raw TCP socket   powershell.exe        │
                     Add-Type winspool       to printer IP:   System.Drawing        ▼
                     OpenPrinter/            port (5s t/o,    PrintDocument    Windows driver
                     StartDocPrinter(RAW)/   150ms drain)     DrawString       (GDI/XPS)
                     WritePrinter                │               │               │
                                 │               │               ▼               ▼
                                 ▼               │        Windows spooler   physical printer
                          Windows spooler ◄──────┘        (driver renders)
                          (RAW passthrough)                      │
                                 │                               ▼
                                 ▼                        physical printer
                          physical printer
```

| Path | Used by | Payload | Status |
|---|---|---|---|
| **A** ESC/POS → local agent → winspool RAW | POS checkout receipts, reprints, credit notes, layaway slips, X/Z reports on USB / Bluetooth / WINDOWS_QUEUE printers | raw ESC/POS bytes (base64) | **BROKEN — silent false success (P0-1)** |
| **B** ESC/POS → backend relay → TCP | Same documents on NETWORK_IP printers (works from phones/tablets too) | raw ESC/POS bytes (base64) | **Verified byte-identical end-to-end** |
| **C** Plain text → local agent → GDI (or bare TCP) | Customer receipt voucher & statement (CustomerView.jsx), test-print fallback | UTF-8 plain text | Works, but **mojibake for non-ASCII (P1-3)**; network variant has **no cut, no ESC/POS (P1-4)** |
| **D** HTML → hidden iframe → `window.print()` | A4 invoices (`tplInvoicePaper === 'A4'`), fallback preview when no printer configured | HTML | Works (browser dialog; driver-rendered) |

A fifth path proxies Zebra ZPL label jobs through the agent to Zebra Browser Print
(`/print/label/zebra` → `localhost:9101/9100`) *(code-read only)*.

### 1.1 Sequence — POS checkout receipt (thermal, primary flow)

```
Cashier            POSSales.jsx              Backend                Print Agent           Printer
  │  Pay             │                          │                       │                    │
  ├─────────────────►│ processPayment()         │                       │                    │
  │                  ├─ save invoice ──────────►│ (POST /api/sales-invoices/pos-checkout)    │
  │                  │◄─ savedInvoice ──────────┤                       │                    │
  │                  ├─ buildThermalReceiptArtifacts()                  │                    │
  │                  │   ├─ buildEscPosReceiptBase64()  (ESC/POS bytes, browser-side)        │
  │                  │   ├─ buildThermalReceiptHtml()   (unused on this path)                │
  │                  │   └─ buildThermalReceiptText()   (job-audit payload only)             │
  │                  ├─ resolvePrinterForContext(printerConfigs)        │                    │
  │                  ├─ createPrintJob ────────►│ POST /api/pos/print-jobs   (best-effort)   │
  │                  ├─ dispatchPrintJob ──────►│ PUT  .../dispatch          (best-effort)   │
  │                  ├─ if NETWORK_IP: ────────►│ POST /api/pos/printers/{id}/print/escpos   │
  │                  │                          ├─ raw TCP ────────────────────────────────► │
  │                  ├─ else: POST /print/escpos ──────────────────────►│                    │
  │                  │                          │                       ├─ powershell RAW ──►│
  │                  ├─ reportPrintJobResult ──►│ PUT .../result         │                    │
  │                  └─ openCashDrawer('RECEIPT_PRINT')                 │                    │
```

Exactly **one print request per checkout** is issued; no duplicate invocation was found.
The print-job rows (`pos_print_jobs`) are bookkeeping only — the browser is both creator and
executor (documented interim state, spec v2 §10.3); the agent does not poll the queue yet.

---

## 2. Live verification evidence

All artifacts are reproducible; the capture harness used is the repo's own
`tools/pos-print-agent/fake-printer.mjs`.

### 2.1 Generated ESC/POS payload (real builder code, representative invoice)

`buildEscPosReceipt('80mm', …)` produced **1,342 bytes**. First 64 bytes:

```
1b 40 1b 37 09 ff 02 1b 74 10 1b 4d 00 1b 33 24
1b 61 01 1b 45 01 1d 21 00 54 41 58 20 49 4e 56
4f 49 43 45 0a 1d 21 00 1b 45 00 54 68 61 6e 6b
20 79 6f 75 20 66 6f 72 20 73 68 6f 70 70 69 6e
```

Byte-by-byte: `1B 40` = ESC @ (initialize) · `1B 37 09 FF 02` = ESC 7 (heating: 9 dots,
time 255, interval 2 — max-darkness preset for Xprinter/Gprinter-class controllers) ·
`1B 74 10` = ESC t 16 (code page WPC1252) · `1B 4D 00` = Font A · `1B 33 24` = line spacing 36 ·
`1B 61 01` = center · `1B 45 01` = bold on · `1D 21 00` = normal size · `54 41 58 …` = "TAX INVOICE" · `0A` = LF.

Tail: `1b 61 00 1b 64 03 1d 56 01` = align-left, **feed 3 lines, partial cut** — cut and feed are present.
The QR block uses native `GS ( k` model-2 commands (select/size/EC/store/print) — confirmed in the
fake-printer annotated trace. One `ESC @` init, one cut, no duplicates.

### 2.2 Transmission integrity (path B semantics, agent network path)

Sent through the agent to the fake printer on `127.0.0.1:9109`:

```
sha256(sent payload)      77182c57ac710ebf8bb22fa3d3b5ac7b0fb0f84628a8af785949dafc3b04ab01
sha256(received capture)  77182c57ac710ebf8bb22fa3d3b5ac7b0fb0f84628a8af785949dafc3b04ab01
```

**Byte-for-byte identical** — no re-encoding, truncation, insertion, or corruption anywhere in
HTTP → agent → TCP. The backend relay (`PosPrinterService.printEscPos`) is the same pattern in
Java (`Base64.decode` → `socket.write` → `flush` → 150 ms drain) and performs no transformation
*(code-read; same byte-transparent design)*.

### 2.3 Plain-text network path capture

The `/test-print` job that reached the fake printer contained **zero ESC/POS commands** and ended
with a bare `\n` — no init, no density, **no feed, no cut**. Non-ASCII arrives as multi-byte UTF-8,
which a single-byte-codepage thermal controller renders as garbage glyphs.

### 2.4 The GDI text path corrupts every non-ASCII character (reproduced live)

The agent writes the receipt to a temp file with Node (`utf8`, no BOM), then the PowerShell script
reads it with `Get-Content -Raw` — **which defaults to ANSI on Windows PowerShell 5.1**:

```
File written (UTF-8):  Item… — AED 1,425.00 / مؤسسة Test
PowerShell read back:  Itemâ€¦ â€” AED 1,425.00 / Ù…Ø¤Ø³Ø³Ø© Test
```

Note that `…` is a character the app's **own** `buildFixedWidthLine` inserts when truncating long
labels, and `—` is inserted by the statement builder — so this fires even for pure-English data.

### 2.5 P0 — the ESC/POS → Windows-queue path never prints and reports success

The exact script from `printEscPosToPrinterQueue` (server.js:199-251) was extracted verbatim and
executed against a **paused** local queue so the spool job would be observable:

```
stdout:      {"ok":true}                ← the agent treats this as success
TYPE-EXISTS: False                      ← [BillBull.RawPrinter] was never compiled
JOBS:        (empty)                    ← NO spool job was ever created
exit code:   0
```

Full stderr (discarded by the agent because exit code is 0):

```
Add-Type : …cs(3) : Warning as Error: The using directive for
'System.Runtime.InteropServices' appeared previously in this namespace
Add-Type : Cannot add type. Compilation errors occurred.
Unable to find type [BillBull.RawPrinter].   (OpenPrinter, line 31)
Unable to find type [BillBull.RawPrinter].   (ClosePrinter, line 52)
New-Object : Cannot find type [BillBull.RawPrinter+DOCINFOA]…
```

**Root cause chain:**
1. `Add-Type -MemberDefinition` **already includes** `System.Runtime.InteropServices` as a default
   using; the script passes it again via `-UsingNamespace` (server.js:222).
2. The duplicate generates compiler warning CS0105; PS 5.1's Add-Type compiles with
   warnings-as-errors → **the type is never created**.
3. Every subsequent `[BillBull.RawPrinter]::…` call fails with `TypeNotFound` — but those are
   *statement-level* errors under the default `$ErrorActionPreference = 'Continue'`, so execution
   falls through to the final `Write-Output '{"ok":true}'`.
4. PowerShell exits 0 → `runPowerShell` resolves → agent returns
   `{"ok":true,"message":"ESC/POS print job sent successfully."}` → frontend marks the
   `pos_print_jobs` row **SUCCEEDED** → `updatePosPrinterRuntime` marks the printer **ONLINE**.

Confirmed against both the repo agent (fresh start on :19888) and the already-installed agent
running on :19777 — identical false-success behavior.

**Removing `-UsingNamespace System.Runtime.InteropServices` was verified to fix compilation**:
the type loads, `OpenPrinter` succeeds, and the script then fails *loudly* (exit 1) at
`StartDocPrinter` on this machine's virtual printers — which is correct, because v4/XPS-class
drivers (Print to PDF, OneNote) legitimately reject the RAW datatype. Real thermal queues
(vendor v3 or "Generic / Text Only" drivers) accept RAW.

**Impact: every USB / Bluetooth / Windows-queue thermal printer configured in this system prints
nothing at checkout, while the cashier, the print-job audit table, and the device dashboard all
report success.** Since the POS receipt flow is now ESC/POS-only with no fallback
(POSSales.jsx:2939-2949), there is no secondary path that saves the sale receipt. Only
NETWORK_IP printers actually print today.

### 2.6 Printer detection status labels are wrong (reproduced live)

`listPrinters()` (server.js:79-94) enumerates with `Get-Printer` (MSFT_Printer), whose
`PrinterStatus` enum is **flags-based**: `0=Normal, 1=Paused, 2=Error, 4=PendingDeletion,
128=Offline, 512=Busy, 16=PaperOut, …` (dumped live from this machine). But
`PRINTER_STATUS_LABELS` (server.js:68-77) is the **WMI Win32_Printer** table
(`0=Unknown, 2=Normal, 6=Error, 7=Offline`). Observed live:

```
"Microsoft Print to PDF"  PrinterStatus: 0 (= Normal)  →  StatusLabel: "Unknown"
```

Mapping consequences: healthy → "Unknown"; **a printer in Error state → "Normal"** (dangerously
wrong); Offline (128) → unmapped → "Unknown" — offline printers are **never** labeled offline in
the tray menu or the POS devices screen.

---

## 3. Detection, selection, invocation — assessment

**Detection** (`GET /printers` → `listPrintAgentPrinters()` → POSConsole devices tab):
- Enumeration via `Get-Printer` returns all installed queues: local USB, network-mapped, shared,
  and virtual printers. Default detected via `Win32_Printer Default=TRUE` — correct.
- Refresh: on devices-tab open + a manual Refresh button (POSConsole.jsx:929). No stale cache in
  the agent (fresh PowerShell query per call). The frontend caches the *agent base URL* per
  session and a 15 s negative-probe cooldown (localPrintAgent.js:14-18) — sensible.
- Offline filtering: none (see finding P0-2 — labels wrong, so filtering couldn't work anyway).
- Case sensitivity: Windows printer names are case-insensitive at the API level
  (`PrinterSettings`/`OpenPrinter`); the exact string from `Get-Printer` is stored via the
  picker, so mismatch risk is low. Duplicate names cannot exist within one Windows session.

**Selection** (`resolvePrinterForContext`, localPrintAgent.js:323-366): filters
ACTIVE + deviceType + branch, then ranks terminal-scoped default > terminal-scoped >
branch default > any default > name. Deterministic and reasonable. If the configured Windows
queue was deleted: GDI path throws `Printer not found: <name>` (IsValid check, server.js:114) —
good; the RAW path *currently* reports success (P0-1).

**Invocation**: single entry per document type; `printHtml` guards double-fire with `hasPrinted`;
checkout issues exactly one print. The only "double" is intentional bookkeeping
(create/dispatch/report job rows around the actual print, all best-effort non-blocking).

---

## 4. Encoding summary

| Path | Encoding sent | Printer expectation | Verdict |
|---|---|---|---|
| ESC/POS (A/B) | Single-byte, `ESC t 16` (WPC1252); JS chars 0x20–0xFF passed through, NFKD-decomposed accents, everything else → `?` | matches (CP1252 table selected on printer) | ✔ consistent; ✘ non-Latin scripts (Arabic/Malayalam) print as `?????` — verified in capture |
| Agent GDI text (C) | UTF-8 file → **read as ANSI** → drawn via GDI | n/a (driver rasterizes) | ✘ mojibake (P1-3) |
| Agent network text (C) | raw UTF-8 bytes to :9100 | printer's active code page (usually CP437) | ✘ garbles non-ASCII; no cut (P1-4) |
| Browser HTML (D) | full Unicode, Roboto Mono embedded | n/a (driver rasterizes) | ✔ correct for all scripts |

CP1252 nuance: `…` (0x85) and `—` (0x97) *do* exist in WPC1252 but `toPrinterBytes` maps any
char > 0xFF to `?`, so even representable punctuation is lost on the ESC/POS path (cosmetic).

---

## 5. Thermal compatibility & ESC/POS assessment

**The format strategy is correct.** Raw ESC/POS is exactly what 58/80 mm thermal receipt printers
expect, and the builder (escPosReceipt.js) is genuinely good: init, clone-safe density control
(`ESC 7` instead of Epson-only `GS ( E`), font A select, line spacing, bold/size/align commands,
Floyd–Steinberg-dithered `GS v 0` logo raster, native `GS ( k` QR, feed + partial cut. Widths:
58 mm → 384 dots / 32 cols; 80 mm → 576 dots / 42 cols — the fixed-width text layout matches
(verified: every line in the captured stream is ≤ 42 chars, amounts right-aligned at col 42).

Defects found in the generated stream:
- **TOTAL line half-width bug** (escPosReceipt.js:324-326): `CHAR_SIZE(1,2)` = `GS ! 0x01` doubles
  *height only*, but the line is formatted to `width/2` = 21 columns. Captured:
  `<1d>!<01>TOTAL:   AED 1,496.25` — the amount ends mid-paper instead of aligning with the other
  totals. Either use `CHAR_SIZE(2,2)` (double width + height, keep 21 cols) or keep `(1,2)` and
  format to the full 42 cols.
- Non-Latin text destroyed (see §4). If Arabic/Malayalam receipts matter, render those lines
  through the existing dither-raster pipeline or add per-locale code-page tables.
- Text-path-only: multi-line footers are centered as a single string (second line lands
  left-aligned); Payment Mode row missing from `buildThermalReceiptText` (present in ESC/POS &
  HTML variants); ESC/POS date format (`04/07/2026, 11:42:00`) differs from HTML
  (`04 Jul 2026 11:42 AM`). Cosmetic.

---

## 6. Windows print API usage

- **winspool RAW** (`OpenPrinter`/`StartDocPrinter` level-1 RAW/`WritePrinter`) — the right API
  for ESC/POS to installed queues; bypasses GDI so density/QR/cut survive. Broken by P0-1;
  approach itself is sound. Caveat worth handling: v4-class drivers reject datatype RAW
  (verified) — surface that error clearly ("driver does not accept raw jobs — install the
  vendor v3 or Generic/Text-Only driver").
- **System.Drawing PrintDocument** (GDI) for plain text — adequate as a fallback; paper width is
  correctly sized from configured mm (`PaperSize` in 1/100 in, zero margins; server.js:96-127).
- **QZ Tray** — installed as a dependency and reachable only via the dev route `/printer-test`;
  not used by any production flow. It duplicates what the agent does. Remove (below).

Per-job overhead measured on this machine: PowerShell spawn + Add-Type ≈ **0.43 s** (RAW script,
warm; ~1.1 s cold), GDI variant ≈ 0.36 s. Acceptable for POS; if it ever matters, keep one
long-lived PowerShell child in the agent instead of spawning per job. Network paths add ~0 (+150 ms
deliberate drain). Agent health probe is tightly bounded (400 ms timeout, 15 s negative cache).

---

## 7. Findings register

| # | Sev | Finding | Root cause | Fix | Location |
|---|-----|---------|-----------|-----|----------|
| 1 | **P0** | ESC/POS → USB/Bluetooth/Windows-queue printers never print; success reported everywhere (job SUCCEEDED, printer ONLINE) | Duplicate `-UsingNamespace System.Runtime.InteropServices` → Add-Type CS0105 warning-as-error → type never compiles → TypeNotFound statement errors skipped → script still prints `{"ok":true}`, exit 0 | Remove the `-UsingNamespace` argument (namespace is default) **and** add `$ErrorActionPreference='Stop'` at the top of *both* agent scripts so any failure aborts with non-zero exit; optionally verify `written == bytes.Length` | `tools/pos-print-agent/server.js:222` (and :104-147 for the GDI script) |
| 2 | **P0** | Printer status labels wrong: healthy→"Unknown", **Error→"Normal"**, Offline never shown | Label table is for WMI `Win32_Printer.PrinterStatus`, but values come from `Get-Printer` (MSFT_Printer flags enum) | Map the MSFT flags enum (test bit 128→Offline, 2→Error, 1→Paused, 16→PaperOut…), or enumerate via `Win32_Printer` consistently; consider also exposing `WorkOffline` | `tools/pos-print-agent/server.js:68-77` |
| 3 | **P1** | Agent GDI text path mojibakes every non-ASCII char (incl. the `…` the app itself inserts) | Node writes UTF-8 (no BOM); PS 5.1 `Get-Content -Raw` defaults to ANSI | `Get-Content -Raw -Encoding UTF8`, or write the temp file UTF-16LE | `server.js:102` + `:109` |
| 4 | **P1** | Network plain-text prints: no cut, no feed, no density; UTF-8 bytes garble on CP437 printers | `printTextToNetworkPrinter` writes bare text | Route thermal text through the existing `buildEscPosFromPlainText` bridge (frontend), or wrap text with INIT/FEED/CUT in the agent | `server.js:157-166`; callers `CustomerView.jsx:196,352` |
| 5 | **P1** | Customer receipt-voucher & statement prints still use the plain-text path (faint GDI output, mojibake, no cut) while every other receipt was migrated to ESC/POS | Migration gap | Use `buildEscPosFromPlainTextBase64` + `sendEscPosReceiptToConfiguredPrinter` like layaway/X-Z reports | `CustomerView.jsx:167-207, 330-360` |
| 6 | **P2** | TOTAL line prints half-width, amount misaligned | `CHAR_SIZE(1,2)` doubles height only but width halved to 21 cols | Full width with `(1,2)`, or `(2,2)` with 21 cols | `escPosReceipt.js:324-326` |
| 7 | **P2** | Arabic/Malayalam/CJK → `?????` on ESC/POS receipts | Single-byte CP1252 design | Raster-render non-Latin lines (dither pipeline exists) or add code-page tables; at minimum map CP1252-representable punctuation (`…`→0x85, `—`→0x97) instead of `?` | `escPosReceipt.js:79-87` |
| 8 | **P2** | Failed dispatch leaves `pos_print_jobs` rows QUEUED forever; when a real polling agent ships, stale receipts would suddenly print | Sweep only recovers DISPATCHED | Expire stale QUEUED jobs too (age cutoff) | `PosPrintJobTimeoutSweepJob.java` |
| 9 | **P2** | Runtime status inference is string matching on error text (`"not found"`, `"offline"`) | heuristic | Return structured error codes from the agent (`{ok:false, code:'NOT_FOUND'}`) | `localPrintAgent.js:22-28`, agent responses |
| 10 | **P3** | Dead QZ Tray stack shipped to production bundle (`qz-tray` dep, bundled eagerly via the `/printer-test` route import chain; note the `vendor-print` chunk itself is jspdf/html2canvas, not qz-tray) | superseded by the agent | Delete `utils/qzTray.js`, `utils/qzTrayCheck.js`, `utils/qzTrayPrintTest.js`, `api/qzTrayApi.js`, `services/QzService.js`, `components/PrinterTestButton.jsx`, the `/printer-test` route (App.jsx:215), backend `static/tools/qz-tray-test.html`, and the npm dep | frontend + backend statics |
| 11 | **P3** | `ListPrinters.java` scratch file at repo root (javax.print unused anywhere) | leftover | Delete | repo root |
| 12 | **P3** | Agent README still documents "falls back to plain text, then browser print" — the POS flow is ESC/POS-only since the no-fallback change | doc drift | Update README | `tools/pos-print-agent/README.md:130-132` |
| 13 | **P3** | `buildFixedWidthLine` duplicated verbatim in two files | copy | Share one util | `escPosReceipt.js:98` / `posPrintUtils.js:557` |
| 14 | **P3** | Text-receipt cosmetics: multi-line footer centering, missing Payment Mode row, date-format drift vs ESC/POS/HTML | divergence between 3 hand-synced builders | Align when next touched | `posPrintUtils.js:566-687` |

Error handling in general is solid: agent errors propagate as readable messages
(offline/busy/driver/missing-name checked before dispatch in `sendEscPosReceiptToConfiguredPrinter`);
checkout wraps auto-print in try/catch (sale never rolls back on print failure) and offers manual
retry; backend relay returns 502 with host:port detail on socket failure; agent-unreachable is a
clear message with a bounded probe. The one systemic hole is P0-1's false success, which defeats
all of it on the USB path.

Thread safety: agent handles requests concurrently but each job is an isolated PowerShell
process + temp dir — safe. Backend relay opens one socket per request — safe. The job-claim
UPDATE is atomic (`claimForDispatch`), and result reporting is idempotent — good.

---

## 8. Overall assessment

- **Is the app generating correct print data?** Yes. The ESC/POS stream is well-formed,
  complete (init → density → codepage → content → QR → feed → cut), correctly sized for
  58/80 mm, and matches what thermal printers expect. Verified by byte capture and annotated
  command trace.
- **Is the data transmitted unmodified?** Yes on the network paths (SHA-256-identical capture).
  Yes in *design* on the winspool RAW path — but that path currently **never executes** (P0-1).
- **Is the right format used for thermal printers?** Yes — raw ESC/POS, not driver/GDI printing,
  is the correct choice, and the QZ-Tray/driver alternatives were rightly abandoned.
- **Does the system actually print today?** Only on NETWORK_IP printers and the browser/A4 path.
  **USB / Bluetooth / Windows-queue thermal printing is completely broken and silently
  "succeeds"** — fix #1 (a two-line change in `server.js` plus `$ErrorActionPreference='Stop'`)
  must ship, and the rebuilt agent must be **re-deployed to every till** (the installed agent on
  this machine exhibits the same bug, so existing installs are affected).

### Recommended fix order
1. **#1 + #2** — agent `server.js` (raw-path compile fix + fail-loud + status-label map), rebuild
   `BillBullPrintAgent.exe`, redeploy to tills, and re-run a Test Print per till (the Test Print
   currently green-lights broken printers — after the fix it becomes trustworthy).
2. **#3 + #4 + #5** — UTF-8 read fix, network-text cut/wrap, migrate CustomerView to the ESC/POS bridge.
3. **#6 + #7** — receipt polish (TOTAL alignment, punctuation mapping / non-Latin strategy).
4. **#8 – #14** — hygiene (stale-QUEUED sweep, structured errors, dead-code removal, doc sync).

---

## 9. Addendum — fixes applied (2026-07-04, same day)

All P0/P1 findings and most P2/P3 findings were fixed and verified after this audit was written.
Agent version bumped to **0.2.0** (`GET /health` now returns `version`); the rebuilt
`BillBullPrintAgent.exe` must be redeployed to every till.

| # | Status | What shipped | Verified how |
|---|--------|--------------|--------------|
| 1 | **FIXED** | Dropped the duplicate `-UsingNamespace`; both agent print scripts run under `$ErrorActionPreference='Stop'`; `WritePrinter` byte-count check added | Live: RAW job to a missing printer now returns `Printer not found: X`; to a v4-driver queue returns `StartDocPrinter failed for …` (honest failure instead of `ok:true`) |
| 2 | **FIXED** | Labels mapped from the MSFT_Printer flags enum, most-severe-first; `WorkOffline` reports as Offline | Live `/printers`: healthy printers now show `Normal` (were `Unknown`) |
| 3 | **FIXED** | `Get-Content -Raw -Encoding UTF8` | Live: `Item… — / مؤسسة` reads back intact (was `Itemâ€¦ â€”`) |
| 4 | **FIXED** | Network text jobs framed with `ESC @` + `ESC t 16` + feed 3 + partial cut, body sanitized to single-byte CP1252, 150 ms socket drain | Fake-printer capture shows `INIT / codepage 16 / text / feed 3 / cut mode=1` |
| 5 | **FIXED** | CustomerView receipt-voucher + statement handlers now use `buildEscPosFromPlainTextBase64` + `sendEscPosReceiptToConfiguredPrinter` (browser-print fallback kept) | Lint + production build green |
| 6 | **FIXED** | TOTAL formatted to the full 42/32 columns under `CHAR_SIZE(1,2)` | Capture: `TOTAL:` amount right-aligns at col 42 |
| 7 | **PARTIAL** | CP1252 punctuation map added to `toPrinterBytes` (… – — ‘ ’ “ ” • € ™) | Capture: em dash emits `0x97` (was `?`). Non-Latin (Arabic/Malayalam) raster rendering deliberately deferred — still `?` |
| 8 | **FIXED** | `expireStaleQueuedJobs` sweep phase (`pos.printjob.queued-expiry-minutes`, default 60) with guarded atomic UPDATE; `COALESCE(scheduled_for, created_at)` keeps future-scheduled jobs alive | 4 new unit tests; 22/22 print-module tests green |
| 9 | **PARTIAL** | Agent decodes PowerShell CLIXML stderr into one clean message; RAW path uses `Printer not found:` wording the frontend heuristic already matches | Live responses show clean messages. Structured error codes (`{code:'NOT_FOUND'}`) deferred |
| 10 | **FIXED** | Deleted qzTray.js, qzTrayCheck.js, qzTrayPrintTest.js, qzTrayApi.js, QzService.js, PrinterTestButton.jsx, `/printer-test` route, backend qz-tray-test.html; `npm uninstall qz-tray` | No references remain in either module; production build green |
| 11 | **FIXED** | Deleted `ListPrinters.java` + stray `ListPrinters.class` | — |
| 12 | **FIXED** | README fallback claims corrected; 0.2.0 changelog added with redeploy warning | — |
| 13 | **FIXED** | `buildFixedWidthLine` exported from escPosReceipt.js; posPrintUtils.js imports it (duplicate deleted) | Capture harness runs against shared import |
| 14 | **PARTIAL** | Multi-line footers centered per-line; Payment Mode row added to `buildThermalReceiptText` | Capture shows both. Date-format drift between the three builders left as-is |

Remaining (deliberately deferred): non-Latin raster rendering (#7), structured agent error
codes (#9), and the ESC/POS-vs-HTML date-format alignment (#14).

### Test artifacts produced during this audit
- `scratchpad/escpos-receipt-80mm.bin` — generated ESC/POS payload (1,342 bytes)
- `scratchpad/captures/capture-*.bin/.txt` — fake-printer byte captures + annotated traces
- `scratchpad/raw-verify*.cjs` — standalone reproduction of the agent's winspool script,
  paused-queue spool verification, and the verified fix
- No repository code was modified by this audit.
