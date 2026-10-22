# Standalone POS — real-till hardware checklist

**Status: NOT RUN.** None of the items below have been executed on physical hardware. A person must run each check on a real till, record the outcome, and sign below. Automated runs (see `QA_PARITY.md`) used headless Chrome with no printer, drawer or scanner attached. They do not count toward this gate.

Run every item on the same till twice: once through `https://<tenant-host>/sales/pos` and once through `https://<tenant-host>/pos/`. A row passes only when both behave the same.

**Till / tenant:** ____________ **Date:** ____________ **Tester:** ____________

**Print agent version** (first line of the tray menu, or `http://127.0.0.1:19777/health`): ________. The repo's current version is 0.7.0 (unreleased). It requires pairing, and every printer must be set up on the till as a receipt (ESC/POS) or label (ZPL) printer; see `PRINT_AGENT_SECURITY.md`. ESC/POS integrity hashing (`logEscPosIntegrity` MATCH/MISMATCH) needs ≥ 0.5.0; an older agent logs "n/a".

**Agent 0.6.0+ security checks** (run before the table below):

| # | Check | Result |
|---|---|---|
| A0 | **Printer setup (0.7.0).** Tray → Printers: the receipt printer shows "Receipts (ESC/POS)", the Zebra (if any) "Labels (ZPL)", every other printer "not used by BillBull". POS → Devices → **Load Workstation Printers** shows the same. If the installer's Printers page was skipped, set them here first. | |
| A0b | A printer that is **not** set up (e.g. "Microsoft Print to PDF" chosen as a receipt printer in POS → Devices) refuses with "is not set up for BillBull printing on this PC" and the `--set-printer` command, and does not fall back to text. Choose the real printer again afterwards. | |
| A0c | A receipt whose product name contains `~` and `^` (e.g. a test product "Gift Box~Deluxe", or `x^2`) prints those characters on the receipt printer. | |
| A1 | The tray menu shows `Trusted site: https://<tenant-host>` and nothing else. | |
| A2 | Before pairing, POS → Devices → Local Print Agent says "not paired", and a receipt print fails with "Pair it in POS → Devices". It does **not** fall back to text. | |
| A3 | **Pair this PC**: a code appears in the tray notification and tray menu; entering it shows "Paired". Then open the other path (`/sales/pos` or `/pos/`), which is already paired. | |
| A4 | From another site in the same browser (any https page, DevTools console): `fetch('http://127.0.0.1:19777/printers')` fails, and the agent log shows `[security] 403 AGENT_ORIGIN_NOT_ALLOWED`. | |
| A5 | Tray → **Unpair all browsers**; the next print fails with "revoked". Pair again. | |
| A6 | **Load Workstation Printers** lists the till's printers (device discovery). | |
| A7 | Drawer: with a printer whose driver does not kick on print, no BillBull action opens the drawer through the agent. Items 9 and 10 below are expected to fail until the drawer product decision (`PRINT_AGENT_SECURITY.md`, "The cash drawer"). | |
| A8 | **Printer test page** (POS → Devices → Test) on each printer: a receipt printer prints the ESC/POS test receipt; a **label printer prints a 50 × 25 mm ZPL test label** (company, "LABEL PRINTER TEST", branch / printer, a Code 128 `BB-TEST-01`). The console trace shows `/print/zpl` (agent) or the backend relay with `payloadKind: ZPL`. | |
| A9 | **Label content per printer model:** print a product label whose name contains `^`, `~`, `_` and `\` (e.g. `Test^1~2_3\4`) and an Arabic name. The label shows those characters literally, the layout matches a normal label, and the printer's settings are unchanged afterwards (print its configuration label from the printer's own button before and after; compare darkness, media and network). | |
| A10 | Receipt with a raster logo and QR code still prints on each receipt printer (the backend relay and the agent now refuse unknown commands; a refusal shows "Print job refused: … Nothing was sent to the printer."). | |
| A11 | **Do not** send buzzer, power-off, memory or ZPL device commands to a real printer to "test" the refusals, and do not send a receipt to the Zebra (or a label to the receipt printer) to "test" the protocol check. Those are covered by automated tests against fake printers. | n/a |

| # | Check | /sales/pos | /pos/ | Notes |
|---|---|---|---|---|
| 1 | Opening `/pos/` on a till that already used `/sales/pos` keeps the **same terminal id** (no new registration, no approval prompt). Compare `localStorage['billbull:pos:device_fingerprint']` and the terminal shown in the X-Report header. | | | |
| 2 | Branch: a branch-restricted cashier lands on their branch with no prompt. An admin picks one branch, and "All Branches" is never offered. | n/a | | |
| 3 | Saved scanner profile (`billbull:pos:scanner:*`) applies on `/pos/` without reconfiguring. | | | |
| 4 | **USB** thermal receipt via the agent: ESC/POS path. The console shows `fallbackUsed` absent and SHA-256 MATCH. | | | |
| 5 | **Bluetooth** thermal receipt via the agent. | | | |
| 6 | **Windows-queue** printer: ESC/POS, and where the driver rejects raw jobs, the text fallback with the "compatibility mode" warning (`fallbackUsed: "text"`). | | | |
| 7 | **Network/IP** printer (server-side relay, no agent): receipt prints. | | | |
| 8 | Receipt content identical between the two paths: same template, language (EN/AR), logo, QR, totals. Photograph both. | | | |
| 9 | **Cash drawer** opens on a cash sale. | | | |
| 10 | **Cash drawer** manual kick (Cash Drawer function). | | | |
| 11 | Barcode scanner: rapid consecutive scans on the selling screen in **Classic**, **Compact** and **Cart Focus**. Note: in Compact the search box keeps the last barcode after an add (seen identically on both paths in automated runs); confirm whether a real scanner's next scan still lands correctly. | | | |
| 12 | Scanner focus ownership: scans go to the right field in the Payment modal, Cash modal, Sales Return, Price Check, Salesperson scan, and Customer search. A scan never leaks into another field. | | | |
| 13 | Keyboard shortcuts (payment hotkeys C/D/O/R/B, Enter-to-new-sale, Ctrl+Enter settle) behave the same. | | | |
| 14 | **Session lock (`/pos/` only):** let the login expire, or revoke the token, mid-sale. The till shows "Sign in again to continue". Scanning while locked adds nothing, and nothing is typed into POS fields. Unlocking as the same cashier brings back the same cart. | n/a | | |
| 15 | POS idle lock (existing, from POS settings) still locks and unlocks. | | | |
| 16 | Zebra label printing (where the tenant uses it). | | | |
| 17 | Print-job audit stays best-effort: with the backend print-job endpoint failing (e.g. network blip), the receipt still prints. Check the `pos_print_jobs` row afterwards. | | | |
| 18 | Customer display: not applicable. The current POS has no second-screen window. | n/a | n/a | |
| 19 | Sign-out from the `/pos/` rail returns to `/pos/login`; the POS session stays open and resumes on the next sign-in. | n/a | | |
| 20 | Touch screen: all three layouts fit the till's resolution next to the 64px rail with no horizontal scroll; dialogs are reachable. | | | |

**Result:** ☐ Pass ☐ Fail **Signed:** ____________

A failure on `/pos/` where `/sales/pos` passes blocks the pilot. A failure on both paths is an existing POS defect: log it separately and don't fix it as part of the standalone rollout.
