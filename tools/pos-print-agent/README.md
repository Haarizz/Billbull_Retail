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

- `/test-print` and `/print/receipt` remain plain-text paths (no ESC/POS control) —
  kept for non-thermal/fallback printers and job-card/layaway slips.
- `/print/escpos` is the only path with real print-quality control (density, heat,
  font selection, dithered logo raster, native QR command). The POS sales receipt
  flow prefers it automatically and falls back to plain text, then to browser/driver
  printing, if the agent or printer rejects the raw job.
- Zebra Browser Print still requires Zebra's local Browser Print service to be installed when using Zebra-direct label printing.
