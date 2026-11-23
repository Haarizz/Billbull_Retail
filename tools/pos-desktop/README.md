# BillBull POS desktop app

A Windows app (`BillBullPOS.exe`) that opens the tenant's standalone till at `https://<server>/pos/`
in its own window. It does not bundle the till: the UI still comes from the server, so every
frontend deploy reaches the tills with nothing to reinstall. The page keeps the same origin as in
the browser, so the backend CORS rules and the print agent's origin allow-list and pairing work
unchanged. Receipt printers still need the print agent (`tools/pos-print-agent`) on USB/Bluetooth/
Windows-queue tills.

What the app adds over a browser tab:

- **First-run setup**: asks for the server address, checks that `<address>/pos/` is the BillBull
  POS, and remembers it. Change it later with **Ctrl+Shift+S** (or Alt → Till → Server address…).
- **Locked-down window**: no address bar; navigation stays on the tenant origin; other web links
  (e.g. WhatsApp share) open in the normal browser; `file://` and other schemes are refused;
  camera/location/notification permissions are denied; the till page gets no Node access and
  one app call (below). Blank print-preview popups (`window.open('', '_blank')`) still work.
- **Print preview**: Electron has no print preview of its own, so `window.print()` opens the
  Windows dialog with "This app doesn't support print preview". The till's `printHtml` therefore
  calls `window.billbullDesktop.printPreview(html)` for A4/A5/report prints instead; the app
  renders the HTML to a PDF (honouring its `@page` size; `80mm auto` receipts become one page as
  long as the content) and opens it in Chromium's PDF viewer, whose Print button prints it. The
  call is accepted only from the main window's top frame on the configured server and can do
  nothing but open that preview. Fast thermal receipt prints skip it; a failure falls back to the
  normal print. Temporary files go in `%TEMP%\billbull-pos-print` and are removed afterwards.
- **Offline page** when the server can't be reached, with automatic retry every 15 s.
- **Crash recovery**: reloads after a renderer crash; asks Wait/Reload when the page hangs.
- **Unsaved-sale guard**: closing while the till blocks unload asks Stay/Leave.
- **Full screen** (F11) and **zoom** (Ctrl +/−/0) are remembered per PC. F5 / Ctrl+R reload.
  Ctrl+Shift+I opens developer tools.

Settings are in `%APPDATA%\BillBull POS\settings.json` and are kept on upgrade and uninstall.

## Build

```sh
npm install
npm test               # unit tests for URL/navigation/permission/print-preview rules (no Electron needed)
npm start              # run from source
npm run build          # -> dist/BillBullPOS-Setup-<version>.exe (NSIS, per-user install)
npm run build:dir      # -> dist/win-unpacked/BillBullPOS.exe without an installer
```

When running from a VS Code terminal, clear `ELECTRON_RUN_AS_NODE` first (VS Code sets it, which
makes Electron start as plain Node: `TypeError: Cannot read properties of undefined (reading
'enableSandbox')`). Bash: `env -u ELECTRON_RUN_AS_NODE npm start`; PowerShell:
`Remove-Item Env:ELECTRON_RUN_AS_NODE; npm start`.

The icon (yellow bull from the BillBull logo on a dark tile) is generated, not hand-drawn:
`npm run icon` rebuilds `build/icon.ico`, `build/icon.png` and `src/assets/icon.png` from
`billbull-frontend/packages/shared/src/assets/billBullLogo.png`.

`BILLBULL_POS_USER_DATA=<folder>` runs the app with a separate settings folder (for testing).

## Not done yet

- **Code signing**: the installer is unsigned, so Windows SmartScreen warns on first run.
- **Auto-update of the shell**: not needed for till changes (those come from the server); a new
  shell version is installed by running the new setup over the old one.
- **Print agent bundling**: the agent is still installed separately.
