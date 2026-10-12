# BillBull POS Print Agent

Local workstation service for BillBull POS printer execution.

## What it does

- Lists installed Windows printers
- Accepts thermal receipt and test-print jobs on `http://127.0.0.1:19777`
- Sends raw receipt/test jobs to `Network/IP` printers on the shop LAN using configured `IP:Port`
- Sends raw ESC/POS byte streams (density/heat/font/raster-image commands) directly
  to the printer, bypassing the Windows print driver entirely — see `/print/escpos`

## Security (0.6.0+, printer setup 0.7.0+)

The agent only serves BillBull sites it has been told to trust, and only browsers that
have been paired with it. Full trust model, rollout and rollback:
`docs/standalone-pos/PRINT_AGENT_SECURITY.md`. In short:

- **Host** must be `127.0.0.1:19777` or `localhost:19777` (stops DNS rebinding).
- **Origin** must be on the allow-list in `%APPDATA%\BillBull\PrintAgent\config.json`,
  exact scheme/host/port, set by the installer or `--add-origin`. No wildcard CORS.
- **Token**: everything except `/health` and pairing needs `Authorization: Bearer <token>`,
  issued by pairing (a 6-digit code shown in the tray, typed into BillBull → POS →
  Devices). Stored as hashes in `tokens.json`; revoke from the tray or `--revoke-all`.
- **Printers (0.7.0)**: the agent prints only to printers set up on this PC, each bound
  to the language it speaks — `escpos` (receipt printers) or `zpl` (Zebra label printers)
  — in `config.json` `"printers"` (`lib/destinations.js`). The setting comes from the
  tray menu (Printers), the installer or `--set-printer`; never from a web page or the
  request. A job goes ahead only if its route matches the printer's setting
  (`/print/escpos`, `/print/receipt`, `/test-print` and the probes → `escpos`;
  `/print/zpl` → `zpl`). An unlisted printer, a misspelt or ambiguous name, a conflicting
  setup or a mismatch is refused before anything is opened (403/409, nothing sent).
- **Commands**: the job is then checked against the allow-list of the printer's
  protocol. `lib/escposPolicy.js`: drawer pulses, buzzer, power-off, printer-memory
  writes, unknown and truncated commands are refused for every caller; `^` and `~` are
  ordinary receipt text ("Gift Box~Deluxe" prints). `lib/zplPolicy.js`: only complete
  BillBull label formats; tilde commands, printer settings, network, storage and
  unknown commands are refused. A refused job sends nothing (403 `AGENT_COMMAND_FORBIDDEN`).
- **Network targets**: private LAN addresses on ports 9100-9109 only (`lib/networkPolicy.js`),
  and then the resolved address and port must be a set-up printer.

Configuration commands (run and exit; a running agent picks them up immediately):

```
BillBullPrintAgent.exe --add-origin https://<tenant>.billbull.app
BillBullPrintAgent.exe --remove-origin <address>
BillBullPrintAgent.exe --list-origins | --list-pairings
BillBullPrintAgent.exe --revoke-all
BillBullPrintAgent.exe --diagnostics on|off
BillBullPrintAgent.exe --set-printer "POS-80C" escpos
BillBullPrintAgent.exe --set-printer "ZDesigner ZD220-203dpi ZPL" zpl
BillBullPrintAgent.exe --remove-printer "POS-80C"
BillBullPrintAgent.exe --set-network-printer 192.168.1.60:9100 zpl
BillBullPrintAgent.exe --remove-network-printer 192.168.1.60:9100
BillBullPrintAgent.exe --list-printers
BillBullPrintAgent.exe --status [--wait <ms>]     # exit 0 if this version is running, else 1
BillBullPrintAgent.exe --stop                     # exit 0 when stopped, 5 if still running
```

**Where the output goes.** The packaged exe is a windowed program: typed at a plain
Command Prompt it shows nothing, not even errors, and an interactive `cmd` does not
wait for it. Use one of:

- `BillBullPrintAgent.exe --list-printers | more`: a pipe shows the output
- `--out <file>` on any command: writes the result to that file (what the installer reads)
- `%APPDATA%\BillBull\PrintAgent\logs\cli.log`: every command with its exit code and
  result (tray → **Open log folder**)

Exit codes: 0 success, 2 refused (unknown command, invalid origin/kind/name, damaged
`config.json`). The installer depends on these. `start /wait "" BillBullPrintAgent.exe …`
gives the real `%ERRORLEVEL%`. Running from source (`node server.js --list-printers`)
prints to the terminal as usual. No command prints a token.

The printer name is the Windows queue name, exactly as Windows shows it (case does not
matter). Network printers are an IP address and port, not a host name. Setting a printer
replaces any earlier setting for it, so these commands never leave a conflict behind.

For local development: `node server.js --add-origin http://localhost:5173` (Retail
dev server) and/or `http://localhost:5174` (`npm run dev:pos`), or set
`BILLBULL_PRINT_AGENT_ORIGINS`. Then pair from POS → Devices. When `node server.js`
runs in a terminal, the pairing code is printed there. Set up the printer you test with
(`node server.js --set-printer "<name>" escpos`), or every print is refused.
Never run `--stop` on a developer PC that has the agent installed: it ends every
`BillBullPrintAgent.exe` in your Windows session, including the installed one.
`BILLBULL_PRINT_AGENT_HOME` points the agent and the CLI at another folder, so a
development setup need not touch the PC's own `%APPDATA%` configuration.

## Tests

```bash
npm test
```

Starts real agents on ephemeral loopback ports, with temporary config folders, a fake
Windows queue and two loopback fake printer sockets (one set up as a receipt printer,
one as a Zebra). No test reaches a physical printer or reads the PC's own configuration.
`test/protocolBinding.test.js` covers the destination rules; `test/destinations.test.js`
the setup table and the CLI. `test/lifecycle.test.js` covers port conflicts, startup
status, stop requests, `--stop`/`--status` (with fake process listing and kill, never
real ones) and the CLI on a copied config folder. `test/fixtures.test.js` reads
real receipts and labels from `billbull-backend/src/test/resources/printer-payloads/`
(generated by the frontend's `printerPayloadFixtures.test.js`), so run it from a full
repository checkout.

## Start

Headless (no tray icon, plain `node`):

```bash
npm start
```

With a system tray icon (status, printer list with default marker, quit):

```bash
npm run start:tray
```

## Building the standalone .exe

```bash
npm install
npm run build
```

Produces `dist/BillBullPrintAgent.exe` — a self-contained Windows binary (bundles the
Node runtime via [`pkg`](https://github.com/vercel/pkg)) that starts the HTTP agent
and shows a system tray icon. No Node.js install is required on the till; just run the
exe (optionally register it to run at login via the Startup folder or Task Scheduler).

The tray menu lists every printer returned by `GET /printers`, marking the Windows
default printer with a `★` and showing its `StatusLabel` and what BillBull prints on it.
Each printer has a submenu: **Receipt printer (ESC/POS)**, **Zebra label printer
(ZPL)** or **Not used by BillBull** — the same setting as `--set-printer`. Network
printers set up with `--set-network-printer` are listed below. "Refresh" re-queries
Windows; "Quit" stops the agent and its HTTP server.

Entrypoints: `server.js` is the plain HTTP agent (used by both `npm start` and the
tray build); `tray.js` layers the [`trayicon`](https://www.npmjs.com/package/trayicon)
systray UI on top of it and is what `npm run build` packages. Both are CommonJS —
`pkg` does not reliably bundle ESM (`import`) entrypoints, which is why these are
`.js`/`require()` rather than `.mjs`.

## Installing on a client till

`dist/BillBullPrintAgent.exe` alone is a bare binary — copying it manually and
double-clicking it works for a quick test, but for a real store rollout use the
Inno Setup installer in `installer/`, which gives the client a normal Windows
install/uninstall experience (Start Menu entry, autostart at login, Add/Remove
Programs entry).

### One-time setup (on your build machine)

1. Install [Inno Setup 6](https://jrsoftware.org/isdl.php) (free) — this gives you
   the `iscc` compiler used below. Only needed on whichever machine builds the
   installer, not on client machines.

### Building the installer

For a quick local build, `npm run build:installer` produces
`installer/output/BillBullPrintAgentSetup.exe`. It **overwrites** `dist/` and
`installer/output/` in this folder, so never run it here when those hold a release you
still need (on 2026-10-12 they held the only copy of the 0.5.3-era rollback installer).

A release is built from a clean copy into a new, empty folder. The steps are in
`docs/standalone-pos/PRINT_AGENT_SECURITY.md` → "Building a release" (copy, `npm ci`,
`pkg`, `make-windowed.js`, `ISCC.exe /O<release folder>`). Record the SHA-256 of both
exes. The setup file is the single thing handed to a till.

### What the installer does on the client machine

- Installs to `%LOCALAPPDATA%\Programs\BillBull\PrintAgent\BillBullPrintAgent.exe`
  (per-user, **no admin rights required** — a cashier/store manager can run it
  without IT elevating them).
- Adds a Start Menu shortcut and an uninstaller (visible in Windows' "Apps" /
  Add-Remove-Programs list as "BillBull Print Agent").
- Offers a checkbox (checked by default) to add a Startup-folder shortcut, so the
  agent launches automatically — with its tray icon — every time that Windows user
  logs in.
- **Before replacing files** it stops the running agent (`--stop` from the new exe: a
  0.7.0 agent finishes its requests and exits; older agents are ended after 6 s). If the
  agent cannot be stopped, setup changes nothing and exits with code 7, showing why.
- **After installing** it starts the new agent (also on `/VERYSILENT`) and waits up to
  20 s for it to answer. If it does not, setup shows the reason and exits with code 10.
  Unattended installs should add `/SUPPRESSMSGBOXES /LOG="<file>"`.
- Upgrades never touch `config.json` or `tokens.json`: trusted sites, printer setup and
  pairings carry over.
- Asks for the BillBull address (`/ORIGIN=`) and, from 0.7.0, the receipt printer and
  the Zebra label printer by their Windows names (`/RECEIPTPRINTER=`, `/LABELPRINTER=`).
  Empty fields keep what the PC already has; the tray menu can set them later.
- Uninstalling stops any running `BillBullPrintAgent.exe` process first, then
  removes the installed files, the Startup shortcut and `%APPDATA%\BillBull\PrintAgent`.

### Caveats to tell the client

- **Unsigned binary**: neither `BillBullPrintAgent.exe` nor the installer is
  code-signed, so Windows SmartScreen will show a "Windows protected your PC"
  warning on first run. The client clicks "More info" → "Run anyway". This is
  cosmetic (no functional impact) but worth mentioning up front so it isn't
  mistaken for malware — getting rid of the warning requires purchasing a code
  signing certificate, which is a separate decision.
- **Per-till install**: the agent listens on `127.0.0.1:19777` (localhost only —
  see `server.js`), so it must be installed on every physical till/workstation
  that prints receipts, not once per store/network.
- **Windows only**: `server.js` shells out to `powershell`/`Get-Printer`/the
  Win32 spooler APIs; there's no macOS/Linux build target.

## Endpoints

Every route except `/health` and `/pair/*` needs a paired token (see Security).

- `GET /health` → `{ ok, service, version, protocol }` (`protocol: 2` = pairing required)
- `POST /pair/start` → `{ pairingId, expiresInSeconds }`; the code appears on this PC only
- `POST /pair/complete` `{ pairingId, code }` → `{ token, expiresAt }`
- `GET /auth/status`, `POST /pair/revoke`
- `GET /printers` — each entry includes `IsDefault` (matches the Windows default
  printer), `StatusLabel` (human-readable form of the WMI `PrinterStatus` code) and
  `BillBullProtocol` (0.7.0+: `"escpos"`, `"zpl"`, `"conflict"`, or `null` = not set up).
  Read-only; there is no HTTP route that changes printer setup.
- `POST /test-print`
- `POST /print/receipt`
- `POST /print/escpos` — `{ printerName | (ipAddress, portNumber), connectionType, dataBase64 }`.
  `dataBase64` is a base64-encoded raw ESC/POS byte stream (built client-side by
  `escPosReceipt.js`). For `NETWORK_IP` printers the bytes are written straight to
  the TCP socket. For any printer with a `printerName` (USB, Bluetooth-paired, or
  Windows-queue), the agent writes the bytes via the Win32 spooler's `RAW` datatype
  (`OpenPrinter`/`StartDocPrinter`/`WritePrinter`), which skips GDI rendering so the
  density/heat/font commands actually reach the printer firmware.
- `POST /print/zpl` — same body as `/print/escpos`; `dataBase64` is a UTF-8 ZPL label
  stream (built by `zebraZpl.js` / `zplText.js`), checked by the ZPL allow-list and sent
  through the same RAW spooler or TCP path.
- Diagnostics only (`--diagnostics on`; 404 otherwise):
- `GET /diagnostics/probe` — serves `probe.html` from the agent.
- `POST /probe/echo` — `{ dataBase64 }` → `{ receivedBytes, sha256, firstBytesHex, lastBytesHex }`.
  Decodes the base64 and reports its byte count + hash **without printing**, so the
  caller can prove the browser→HTTP→agent hop is byte-perfect (compare against the
  hash computed in the browser). Diagnostic only.
- `POST /probe/capabilities` — `{ printerName | (ipAddress, portNumber), qrData? }`.
  Prints one isolated slip per binary opcode (`GS v 0`, `GS ( L`, `ESC *`, `GS ( k`
  QR) so you can see on paper which the firmware honours vs. echoes as garbage.
  Use `probe.html` as the front-end: open `http://127.0.0.1:19777/diagnostics/probe`
  and pair it (step 0).

## Notes

- `/test-print` and `/print/receipt` remain plain-text paths — kept for non-thermal/
  fallback printers. On Windows-queue printers they render through GDI (no ESC/POS
  control); on `NETWORK_IP` printers the text is now wrapped in minimal ESC/POS
  framing (init + WPC1252 code-page select, trailing feed + partial cut) so the
  roll actually gets cut and non-ASCII is sanitized to single-byte instead of
  arriving as raw UTF-8.
- `/print/escpos` is the only path with real print-quality control (density, heat,
  font selection, dithered logo raster, native QR command). The POS sales receipt
  flow is **ESC/POS-only** — there is no automatic plain-text or browser/driver
  fallback; a failed send surfaces as an error to the cashier so a degraded print
  can't silently replace the real one.
- Zebra labels print as raw ZPL through `/print/zpl` (USB/queue) or the backend relay
  (network). The Zebra Browser Print proxy (`/print/label/zebra`) was removed in 0.6.0.
  From 0.7.0 the Zebra's queue must be set up as `zpl` on each PC that prints labels.
- Destination errors (all 4xx, so BillBull never falls back to text):
  `AGENT_DESTINATION_NOT_CONFIGURED` (403, the message names the setup command),
  `AGENT_DESTINATION_AMBIGUOUS` (403, the name only resembles a set-up printer),
  `AGENT_DESTINATION_CONFLICT` (409, the setup lists it inconsistently),
  `AGENT_PROTOCOL_MISMATCH` (409, `{ protocol, destinationProtocol }`), and
  `AGENT_BAD_REQUEST` (400) for a printer name with a comma, control character,
  edge spaces or non-canonical Unicode.

## Changelog

### 0.7.0 (2026-10-12)

Lifecycle hardening (same version, unreleased):

- **Safe upgrades:** the installer stops the running agent before replacing files and
  aborts (exit 7) if it cannot. It starts and verifies the new agent afterwards, also when
  silent (exit 10 if it is not running). Uninstall uses the same `--stop`. New CLI
  `--stop` (stop request, then a session-scoped `taskkill` for agents before 0.7.0)
  and `--status [--wait]`.
- **Port conflicts are visible:** the agent counts as running only after it binds. On a
  conflict it names the occupant (same version: "already running", exit 3; another
  version; another program), never ends it, shows **NOT RUNNING** with **Retry now** in
  the tray, retries every 15 s and records the reason in `agent-status.json` and
  `logs\agent.log`. Headless `node server.js` exits 3 or 4 instead.
- **Logs:** `%APPDATA%\BillBull\PrintAgent\logs\agent.log` (the packaged agent's
  console) and `cli.log` (every command), capped, with tokens and codes redacted. Tray →
  **Open log folder**.
- **CLI:** `--out <file>`; unknown options are refused with exit 2 (they used to start a
  second agent); a damaged `config.json` is refused instead of being silently reset by
  the next command. The agent trusts nothing until the file is fixed, and the tray and
  `--list-printers` say so.

**Every PC must have its printers set up after upgrading** — until then every print is
refused with `AGENT_DESTINATION_NOT_CONFIGURED`. Nothing in 0.5.x or 0.6.0 recorded which
printer is a receipt printer and which a Zebra, so nothing is migrated automatically.

- **Printers bound to their protocol:** `config.json` `"printers": { "escpos": { "queues",
  "network" }, "zpl": { … } }`, written by the tray menu, the installer's new Printers
  page (`/RECEIPTPRINTER=`, `/LABELPRINTER=`) and `--set-printer` /
  `--set-network-printer`. The destination's setting picks the command policy; the route
  must agree with it or the job is refused (`AGENT_PROTOCOL_MISMATCH`). Request fields
  never choose the protocol. This closes the gap where ZPL hidden in an ESC/POS raster
  could reach a Zebra on a Windows queue.
- **Fail closed:** unlisted printers, names that only resemble a set-up printer (Unicode
  case or width folding), printers listed as both kinds or under an unknown kind, and a
  `config.json` that repeats a key are all refused. Queue names are matched
  case-insensitively for ASCII letters and the job goes to the configured spelling.
- **Removed the ZPL heuristic from the ESC/POS walker.** `^` and `~` are text to a
  receipt printer, so receipts such as "Gift Box~Deluxe" print again (they were refused
  as `FOREIGN_PROTOCOL`). The backend relay made the same change; it already chose the
  policy from the stored printer's type.
- `/print/receipt`, `/test-print` and `/probe/capabilities` also require an ESC/POS
  printer (text typed as `^XA…` must not reach a Zebra).
- `GET /printers` reports each queue's setup (`BillBullProtocol`); POS → Devices shows it.

### 0.6.0 (2026-10-11)

Security release. **The frontend change that pairs with the agent must be deployed
before any till is upgraded**: a 0.6.0 agent refuses the older frontend's unauthenticated
requests. See `docs/standalone-pos/PRINT_AGENT_SECURITY.md` for the rollout.

- **Trusted sites only:** replaces `Access-Control-Allow-Origin: *` with an exact origin
  allow-list (`config.json`, installer page, `--add-origin`). Untrusted origins get 403
  and no CORS headers. The `Host` header is pinned to `127.0.0.1`/`localhost`, which
  stops DNS rebinding.
- **Pairing tokens:** printing, printer discovery and the probe endpoints need a token
  issued by pairing (6-digit code shown in the tray). Tokens are bound to their origin,
  stored hashed, expire after 180 days, and can be revoked from the tray or `--revoke-all`.
- **Command allow-list:** `/print/escpos` and the probe slips are parsed command by command.
  Drawer pulses (`ESC p`, `DLE DC4 1`, Star-mode `BEL`/`FS`), buzzer, power-off, printer
  memory writes, unknown commands and jobs that end mid-command are refused before any
  byte is sent. Image/QR data is skipped by length, so logos do not false-positive.
- **ZPL allow-list and `POST /print/zpl`:** labels get their own route and policy
  (`lib/zplPolicy.js`): one or more complete `^XA … ^XZ` formats using only the commands
  BillBull's label builders emit, with exact parameter grammars; tilde commands
  (`~JR`, `~DY`, …), `^JU`/`^MD`/`^NS`/`^ID`/… and anything unknown or incomplete are
  refused. `/print/escpos` now also refuses ZPL found in receipt text, QR or barcode data.
- **LAN policy:** network targets must be private LAN addresses on ports 9100-9109 (as
  the backend's `PrinterNetworkPolicy`), with a 10 s connect timeout.
- **Removed** the unused `/print/label/zebra` proxy. `/probe/*` and the Desktop byte
  capture (which saved customer data on every print) now need `--diagnostics on`.
- Request bodies are limited to 4 MB, must be `application/json`, and must be a JSON object.
- Tray: shows the version, trusted sites, paired-browser count, pending pairing code,
  and "Unpair all browsers".
- Installer: version corrected (it said 0.4.0), asks for the BillBull address (`/ORIGIN=`
  for silent installs), and removes `%APPDATA%\BillBull\PrintAgent` on uninstall.

### 0.5.0 (2026-07-04)

Adds **capability-probe tooling** to diagnose the "garbage before receipt / missing
logo+QR / Arabic as ?????" reports on the client's POS-80C, without guessing at the
cause. Agent 0.4.0's RAW fix means genuine ESC/POS binary now reaches this printer
for the first time (previously it silently fell back to plain-text GDI, which is why
text-only slips print clean but the full receipt does not) — so we need to know
empirically which binary opcodes the firmware actually decodes.

- **`/probe/echo`**: decodes the received base64 and returns byte count + SHA-256
  (no print), to prove the base64→HTTP→agent stream is byte-identical to what the
  browser generated. If the hashes match, on-paper garbage is a firmware opcode
  limitation, not stream corruption.
- **`/probe/capabilities`**: prints one isolated slip per binary opcode
  (`GS v 0`, `GS ( L`, `ESC *`, `GS ( k` QR), each preceded by a plain-text label.
  A clean image/QR = supported; garbage glyphs under the label = that opcode is
  echoed as text (unsupported). All four slips' length framing is spec-verified so
  a probe "garbage" result is the printer, never a malformed probe command.
- **`probe.html`**: open on the till (browser can reach `127.0.0.1:19777`) to run
  the integrity test and print the probe slips from one page.

### 0.4.0 (2026-07-04)

Fixes the "text compatibility mode" fallback still firing on genuine ESC/POS
thermal printers (e.g. EZ-P003 / "POS-80C"). **All tills must be updated.**

- **Fixed RAW ESC/POS rejected on real thermal drivers (`StartDocPrinter failed`):**
  the winspool P/Invoke block declared `OpenPrinter`/`StartDocPrinter`/`DOCINFOA`
  with `CharSet=CharSet.Auto`, which resolves to the `*W` (Unicode) exports on
  Windows NT. `StartDocPrinterW` reads `DOCINFOW` with **wide** string pointers,
  but the struct fields are `[MarshalAs(LPStr)]` = **ANSI** — so `pDataType="RAW"`
  reached the spooler as the corrupted UTF-16 string `"䅒W"` instead of `"RAW"`.
  Lenient legacy v3 GDI drivers quietly defaulted that to RAW (so it "worked" on
  some tills), but stricter thermal drivers rejected it and `StartDocPrinter`
  failed, forcing the GDI text fallback — which is what produced the plain-text,
  right-clipped receipt that didn't match the template. Declarations are now
  `CharSet=CharSet.Ansi` (binding `OpenPrinterA`/`StartDocPrinterA`/`DOCINFOA`),
  so the ANSI `"RAW"` we marshal is what the spooler receives. Verified: RAW now
  opens successfully even on virtual v3 drivers; genuine v4/XPS drivers still
  fail loudly with the specific 1804 "does not support RAW" message.
- **GDI text-fallback right-edge clipping:** the fallback now measures the real
  printable box the driver gives (`MarginBounds`, which subtracts the driver's
  non-zero `HardMarginX`) and shrinks the font to fit rather than laying text out
  for the full configured width and letting GDI clip the trailing characters.

### 0.2.0 (2026-07-04)

Ships the fixes from `docs/pos-printing-pipeline-audit-2026-07-04.md`. **All tills
must be updated to this build** — 0.1.0 never actually printed ESC/POS jobs to
USB/Bluetooth/Windows-queue printers while still reporting success.

- **Fixed silent no-print on `/print/escpos` to Windows queues (P0):** the winspool
  `Add-Type` P/Invoke block passed `-UsingNamespace System.Runtime.InteropServices`,
  which is already a default using for `-MemberDefinition`; the duplicate is a
  compiler warning that Windows PowerShell 5.1 treats as an error, so the type never
  compiled and every printer call was silently skipped while the script still
  emitted `{"ok":true}`. Both print scripts now also run under
  `$ErrorActionPreference = 'Stop'` and verify `WritePrinter` wrote every byte, so
  any failure returns a real error instead of false success.
- **Fixed printer status labels (P0):** labels now map `Get-Printer`'s MSFT_Printer
  *flags* enum (0 = Normal, 128 = Offline, 2 = Error, …) instead of the old WMI
  Win32_Printer table, which showed healthy printers as "Unknown" and Error printers
  as "Normal". `WorkOffline` ("Use Printer Offline") also reports as Offline.
- **Fixed mojibake on the GDI text path:** the job file is written as UTF-8 but was
  read back as ANSI (`Get-Content -Raw` default on PS 5.1); it now reads
  `-Encoding UTF8`.
- Network plain-text jobs are framed with init/code-page/feed/cut (see Notes above)
  and get the same 150 ms socket drain as the ESC/POS path.
- PowerShell CLIXML stderr is decoded to a clean one-line error message
  (e.g. `Printer not found: X`) instead of raw XML.
- `GET /health` now reports the agent `version` so a till's installed build can be
  verified remotely.
