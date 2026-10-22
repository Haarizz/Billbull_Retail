# Standalone POS — QA parity

Goal: show that `/pos/` sends the same requests and produces the same financial, stock, GL, customer, session and print effects as `/sales/pos`, in every layout. Both apps run the same POS workspace code; parity testing checks that the new shell, branch gate, session lock and build didn't change anything.

**Only use a disposable QA tenant restored from a snapshot.** Never use production data.

## Method

1. Restore a QA snapshot into a disposable database and start a backend on it (`tools/pos-parity/README.md`).
2. Build both apps. Serve them same-origin with `tools/pos-parity/server.cjs`, which mirrors the production vhost: `/`, `/pos/`, `/api`, `/uploads`.
3. Run the 30-transaction script below through **`/sales/pos`**, recording every `/api` request and response. The harness does this automatically for the scripted scenarios. A manual run uses DevTools → Network → *Save all as HAR*.
4. Restore the **same** snapshot.
5. Run the same script through **`/pos/`**.
6. Compare:
   - **Payloads, field by field** (`compare.cjs`). The only allowed differences are listed under "Explained exclusions" below.
   - **Database effects** (`db-effects.sql`, extended per scenario): invoice headers and lines, stock movements, journal lines per account (SI / RV / CN), customer ledger and balance, POS session, cash movements and denominations, and print-job rows.
   - **Print output:** receipt HTML and the ESC/POS base64 (or its SHA-256, which `logEscPosIntegrity` already logs) for each document.
7. Repeat for **Classic**, **Compact** and **Cart Focus** (`PosSettings.defaultLayout`).

Any unexplained payload, financial, stock, GL, customer-balance, session or print-output difference fails the gate.

### Explained exclusions

| Field | Why it differs |
|---|---|
| `checkoutKey` (`/api/pos/checkout`) | Per-sale idempotency key (random UUID). Two different sales must have different keys. |
| `X-Request-Id` header value | Random per request, used for log correlation. |
| `linkedInvoice`, `linkedReceiptNumber`, `items[].invoiceItemId` (`/api/sales/returns`) | Each run returns its own original sale. |
| Invoice / return / voucher / journal numbers, ids, timestamps | Server-assigned sequences and clock. Identical when both runs start from the same restored snapshot. |
| `deviceInfo` (`/api/pos/terminals/register`) | Free-text user agent and screen size of the device running the test. |

## The 30-transaction script

Run every row in each layout, and in both apps on the same snapshot. "Enabled" rows depend on the tenant's settings. Skip a disabled feature and record it as N/A.

| # | Scenario | Tender | Notes |
|---|---|---|---|
| 1 | Two standard-rated (5%) items, inclusive VAT | Cash, exact | baseline |
| 2 | Same items, tenant/branch in exclusive VAT mode | Cash, change due | |
| 3 | Mixed rates: 5% + zero-rated + exempt lines | Cash | |
| 4 | Line discount % on one line | Card | |
| 5 | Line discount amount + bill discount | Cash | |
| 6 | Qty 3 of one item, qty 1 of another | Cash | |
| 7 | Multi-unit product sold in a non-base unit (pack/carton) | Cash | |
| 8 | Fractional quantity (weight item) | Cash | rounding |
| 9 | Price override within floor | Cash | |
| 10 | Price below floor → supervisor approval | Cash | approval flow |
| 11 | Split tender cash + card | Cash + Card | |
| 12 | Online / bank transfer | Online | |
| 13 | Registered customer on credit within limit | Credit | customer ledger |
| 14 | Credit over limit → override permission | Credit | |
| 15 | BNPL, if enabled | BNPL | |
| 16 | Voucher / credit-voucher redemption, if enabled | Voucher + Cash | |
| 17 | Coupon / promotion applied | Cash | |
| 18 | Batch-tracked item (batch chosen) | Cash | stock by batch |
| 19 | Serial-tracked item | Cash | |
| 20 | Hold sale → recall → complete | Cash | held sales |
| 21 | Save as order → deliver later | — | |
| 22 | New delivery order with shipping charge | Credit | delivery |
| 23 | Delivery settlement collected in cash | Cash | delivery settle |
| 24 | Layaway created with deposit | Cash | layaway |
| 25 | Layaway payment + completion | Card | |
| 26 | Full return of #1, cash refund | Cash refund | sales return |
| 27 | Partial return of #6 to credit voucher | Credit voucher | |
| 28 | Cash drop and cash out during session | — | cash movements |
| 29 | Reprint duplicate receipt (permission) | — | print job, reprint audit |
| 30 | X-Report, then Close Session with exact count; next day Z-Report | — | session, denominations, variance 0 |

## Automated runs executed (2026-10-09)

These ran in this repository's environment through `tools/pos-parity`. The backend was the real Spring Boot app on a **throwaway restore of `testdb`** (dropped afterwards), served same-origin like production, and driven by headless Chrome with real keyboard and mouse events (barcode wedge at scanner speed, payment hotkeys). One Chrome profile served as one till device for both apps.

| Scenario | Classic | Compact | Cart Focus |
|---|---|---|---|
| Sale: 2 inclusive-VAT items, salesperson scan, cash exact (row 1) | ✅ both apps | ✅ both apps | ✅ both apps (run twice) |
| Return of that sale, cash refund (row 26, one line) | — | — | ✅ both apps (run twice) |
| X-Report + Close Session, exact count (row 30, close only) | — | — | ✅ standalone (run twice) |

Results:

- **Checkout payload:** 44 fields per request. In all three layouts the only difference was `checkoutKey`. Application headers matched (`Authorization`, `X-Branch-Id: 1`, `X-Request-Id`), and every response was 200.
- **Invoice effects:** identical headers (PAID, Cash, sub-total 190.48, VAT 9.52, total 200.00, inclusive, branch 1, same session and terminal) and identical lines (item, qty, price, tax, net, recognised revenue and COGS) for all six sales.
- **Stock:** identical `DELIVERY_NOTE` movements (−1 / −1 in warehouse 1) for all six.
- **GL:** identical journal lines for all six. Sales invoice: AR 1100 Dr 200.00; revenue 4001 Cr 190.48; VAT 2100 Cr 9.52; COGS 5001 Dr 2.00; inventory 1200 Cr 2.00. Receipt voucher: cash 1001 Dr 200.00; AR 1100 Cr 200.00.
- **Returns:** 34 fields per request. The only differences were the linked invoice, receipt key and line id, all explained. The return records matched (APPROVED, CASH_REFUND, 100.00 / VAT 4.76) and so did the credit notes (AR 1100 Cr 100.00; VAT 2100 Dr 4.76; revenue 4001 Dr 95.24). Neither app wrote a restock movement for a "Good" return. This is existing behaviour, identical in both apps.
- **Session:** sales from both apps landed in the same open session on the same terminal, because same-origin sharing of the device fingerprint works. The X-Report expected cash matched the count (variance 0.00), and the close succeeded (`pos_sessions.status = CLOSED`).
- **Print jobs:** 0 rows for every sale in both apps. The tenant had no auto-print printer configured and no print agent was running, so print output was **not** compared. That stays a hardware gate (`HARDWARE_CHECKLIST.md`).
- **Errors:** no uncaught page errors in any run.

Observations recorded and not changed, since both apps behave identically:
- In **Compact**, the search box keeps the scanned barcode after an add, so a second wedge scan is appended to it. The harness clears the box between scans in both modes. Check this with a real scanner (hardware checklist).
- In this tenant's Classic settings both side panels are hidden, which also hides the scan box. The parity run unhid them in the disposable database.

### Still to run (human / QA environment)

- Rows 2–25 and 27–29 in all three layouts, on a QA snapshot that has the needed features enabled: card/online/BNPL/voucher tenders, credit customers, batch/serial stock, layaway, delivery, cash movements, reprint permission.
- Receipt HTML and ESC/POS hash comparison with a printer configured (row 29 plus every sale).
- Z-Report (row 30, second part) after all terminals close.

Until those pass with no unexplained differences, the parity gate is **partially passed**: the shell, branch, session and checkout path are proven equal; the rest of the matrix is pending.
