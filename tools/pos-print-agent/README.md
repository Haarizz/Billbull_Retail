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

```bash
npm start
```

## Endpoints

- `GET /health`
- `GET /printers`
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
