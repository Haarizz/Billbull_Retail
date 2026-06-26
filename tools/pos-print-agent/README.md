# BillBull POS Print Agent

Local workstation service for BillBull POS printer execution.

## What it does

- Lists installed Windows printers
- Accepts thermal receipt and test-print jobs on `http://127.0.0.1:19777`
- Sends raw receipt/test jobs to `Network/IP` printers using configured `IP:Port`
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
- `POST /print/label/zebra`

## Notes

- Current implementation is Windows-oriented and prints plain text receipts through either the Windows print queue or a raw network socket.
- Zebra Browser Print still requires Zebra's local Browser Print service to be installed when using Zebra-direct label printing.
