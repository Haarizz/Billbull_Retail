# Standalone POS — real-till hardware checklist

**Status: NOT RUN.** None of the items below have been executed on physical hardware. A person must run each check on a real till, record the outcome, and sign below. Automated runs (see `QA_PARITY.md`) used headless Chrome with no printer, drawer or scanner attached. They do not count toward this gate.

Run every item on the same till twice: once through `https://<tenant-host>/sales/pos` and once through `https://<tenant-host>/pos/`. A row passes only when both behave the same.

**Till / tenant:** ____________ **Date:** ____________ **Tester:** ____________

**Print agent version** (tray → About, or `http://127.0.0.1:19777/health`): ________. The repo's current release is 0.5.3. ESC/POS integrity hashing (`logEscPosIntegrity` MATCH/MISMATCH) needs ≥ 0.5.0; an older agent logs "n/a".

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
