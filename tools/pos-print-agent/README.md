# BillBull POS Print Agent

Local workstation service for BillBull POS printer execution.

## What it does

- Lists installed Windows printers
- Accepts thermal receipt and test-print jobs on `http://127.0.0.1:19777`
- Sends raw receipt/test jobs to `Network/IP` printers using configured `IP:Port`
- Sends raw ESC/POS byte streams (density/heat/font/raster-image commands) directly
  to the printer, bypassing the Windows print driver entirely — see `/print/escpos`
- Proxies Zebra Browser Print jobs when needed

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
default printer with a `★` and showing its `StatusLabel`. "Refresh printers" re-queries
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

```bash
npm install
npm run build:installer
```

This runs `npm run build` (produces `dist/BillBullPrintAgent.exe`) and then compiles
`installer/BillBullPrintAgent.iss`, producing:

```
installer/output/BillBullPrintAgentSetup.exe
```

That single file is what you hand to a client / put on a USB stick / host for
download — it needs nothing else to run.

### What the installer does on the client machine

- Installs to `%LOCALAPPDATA%\Programs\BillBull\PrintAgent\BillBullPrintAgent.exe`
  (per-user, **no admin rights required** — a cashier/store manager can run it
  without IT elevating them).
- Adds a Start Menu shortcut and an uninstaller (visible in Windows' "Apps" /
  Add-Remove-Programs list as "BillBull Print Agent").
- Offers a checkbox (checked by default) to add a Startup-folder shortcut, so the
  agent launches automatically — with its tray icon — every time that Windows user
  logs in. No till reboot required after install; it also offers to launch
  immediately on the final wizard page.
- Uninstalling stops any running `BillBullPrintAgent.exe` process first, then
  removes the installed files and the Startup shortcut.

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

- `GET /health`
- `GET /printers` — each entry includes `IsDefault` (matches the Windows default
  printer) and `StatusLabel` (human-readable form of the WMI `PrinterStatus` code)
- `POST /test-print`
- `POST /print/receipt`
- `POST /print/escpos` — `{ printerName | (ipAddress, portNumber), connectionType, dataBase64 }`.
  `dataBase64` is a base64-encoded raw ESC/POS byte stream (built client-side by
  `escPosReceipt.js`). For `NETWORK_IP` printers the bytes are written straight to
  the TCP socket. For any printer with a `printerName` (USB, Bluetooth-paired, or
  Windows-queue), the agent writes the bytes via the Win32 spooler's `RAW` datatype
  (`OpenPrinter`/`StartDocPrinter`/`WritePrinter`), which skips GDI rendering so the
  density/heat/font commands actually reach the printer firmware.
- `POST /print/label/zebra`

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
- Zebra Browser Print still requires Zebra's local Browser Print service to be installed when using Zebra-direct label printing.

## Changelog

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
