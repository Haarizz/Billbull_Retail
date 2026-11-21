# Standalone POS — Offline MVP (M3)

A cashier prepares the Standalone POS while online, keeps selling **cash** sales of eligible items when the server is unreachable, and the till synchronises them through the normal checkout pipeline when the server is back: one official invoice per offline sale, never more.

Off by default. Pilot scope only (see [Limits](#pilot-limits)). Design background: `OFFLINE_POS_AUDIT_REVIEW.html` (V1 crypto, V2 tracks, V4 lease/clock, V6 two-stage ingest, V8 gates).

## Switch it on (per tenant)

```properties
pos.offline.enabled=true
pos.offline.branch-ids=1              # optional allow-list; empty = every branch
pos.offline.signing-key-dir=/etc/billbull/pos-offline-keys   # outside the database; back it up with server secrets
pos.offline.lease-minutes=240         # how long a till may sell offline after preparing
pos.offline.grace-hours=24            # how long after expiry earlier sales still post automatically
pos.offline.max-sales=50              # per lease
pos.offline.max-value-minor=500000    # per lease (AED 5,000.00)
pos.offline.branch-max-value-minor=1500000   # all outstanding leases of a branch together
pos.offline.clock-skew-seconds=300
pos.offline.catalog.max-products=5000
```

Pilot conditions: Electron till (`tools/pos-desktop`), Fast Sale tenant, https (or localhost) origin.

## How it works

| Stage | Where | What |
|---|---|---|
| Enrol (once per till) | Till rail → cloud icon → **Enable offline on this till** (administrator) | The till generates a non-extractable ECDSA P-256 key in WebCrypto and sends only the public SPKI. `POST /api/pos/offline/keys` binds it to the terminal (`pos_offline_terminal_keys`) and returns the tenant's lease key, which the till pins. |
| Prepare (automatic while online) | `offlineRuntime.prepare` | Downloads the catalogue (`GET /api/pos/offline/catalog`: eligible products, base-unit barcodes, list price, tax rate, salesperson roster; no customers, cost or images), asks for a lease (`POST /api/pos/offline/leases`), verifies its ES256 signature with the pinned key, and remembers the boot-time configuration GETs (allow-list in `offlineAdapter.js`). |
| Start offline | Electron → `/pos/` | The service worker (`apps/pos/public/sw.js`, precache from `sw-manifest.json`) serves the shell. On the sign-in screen **Continue offline as …** signs the lease's session owner in without a token. |
| Sell offline | `useCheckout` → `offlineSale.commitOfflineSale` | Pilot rules are checked; the sale is signed (RFC 8785 canonical JSON, SHA-256, P1363) and written in **one** IndexedDB transaction (`durability: 'strict'`) with the sequence counter and hash-chain head. Only the transaction's `complete` event makes it a sale. The success screen shows `SAVED OFFLINE — PENDING SYNC · ref OFF-<terminal>-<seq> (not an invoice no.)`; the receipt is printed from the stored record, marked `OFFLINE — PENDING SYNCHRONIZATION / NOT A TAX INVOICE`. Printing never decides whether the sale stands. |
| Sync | `offlineRuntime.runSync` (Web Lock, one worker) | When the server answers again (and the cashier has signed in again through the till's lock screen), pending records go to `POST /api/pos/offline/sales` in sequence order, unchanged, with their original checkout key. |
| Receive | `PosOfflineIngestService.receive` | Own transaction, lease row locked. Signature verified against the enrolled key; every binding taken from the **server's** lease row (tenant, branch, terminal, session, operator, business date, key, sequence window, count/value caps, expiry, grace) and the request's branch context. Verified records are stored (`pos_offline_sales`) even if they cannot post; unverifiable ones are refused and audited. |
| Post | `PosOfflineIngestService.post` | Re-checks today's rules (eligible product, list price, tax rate, cash arithmetic, totals), then calls the existing `PosCheckoutController.checkout` under the record's key (`off-<recordId>`) as the syncing user. Session guard, Business Day gate, salesperson rules, the M2 attempt journal, stock, GL and session totals all apply unchanged. A resend finds the same key: no second invoice. |
| Settle | Before X-Report / begin-closure / close (`posApi`), or when the lease is near its end | The till syncs, then sends a signed close summary `{lid, count, lastSeq, valueMinor}`. The server closes the lease only if it holds exactly those records and every one is posted (or resolved). |

### The lease (server-issued authorisation)

ES256 compact JWS signed with the tenant key held **outside the database**; the server's own row in `pos_offline_leases` is the authority. Claims: `lid, ten (tenant DB), br, term, sid, kid, op (session owner), bd (trading date), iat, exp, grace, maxSales, maxValue, seqStart, seqEnd, tenders=[CASH], policy, cat (catalogue version), pv`.

Issued only to the **owner of an OPEN session**, on the session's own terminal and branch, to an ACTIVE terminal with an enrolled key, when the Business Day is open and the tenant is in Fast Sale mode; at most one ACTIVE lease per terminal; the branch's total authorised value is capped. Issuance locks the session row (same lock as close/suspend/transfer), so a lease is never issued to a session that is being closed. Sequence windows never overlap between leases of one key.

### Expiry, grace and late arrivals (decision for the pilot)

| Record | Outcome |
|---|---|
| Captured (device time) ≤ `notAfter` + skew, received ≤ `graceUntil` | Posts normally (also after expiry: e.g. rung at 16:55, synced next morning) |
| Captured after `notAfter` + skew | Stored, **HELD** `CAPTURED_AFTER_EXPIRY` |
| Received after `graceUntil` | Stored, **HELD** `ARRIVED_AFTER_GRACE` |
| Over the lease's count or value | Stored, **HELD** `CAP_EXCEEDED` (held records still count toward the cap: it bounds what the till claims to have taken) |
| Outside the lease's sequence window / chain mismatch | Stored, **HELD** |
| Lease abandoned or revoked | Stored, **HELD** `LEASE_ABANDONED` |
| Unsupported tender / product, price or tax drift, totals wrong, checkout refused (session not open, day closed, period locked) | Stored, **BLOCKED** with the reason |
| Bad signature, unknown key, wrong tenant, record not matching its lease, different record under a used id/sequence/key | **REJECTED**, not stored, audited |

The till stops taking new offline sales at `exp` (device clock corrected by the offset measured at issuance, never below the last trusted time). Expiry does **not** discard anything already committed.

### Session and Day Close safety

While a lease is ACTIVE (expired or not): session close, begin-closure, suspend (manual and the idle scheduler), transfer, supervisor takeover, shift handover and the first X-Report are refused with `OFFLINE_LEASE_OUTSTANDING`, and Day Close for that branch-date is refused. Judged from the server's lease register only, never from a count the till reports. Only a matched signed settlement or an administrator's **abandon** (`POST /api/pos/offline/leases/{id}/abandon`, reason required, audited) ends a lease.

### Review

`GET /api/pos/offline/sales/review` lists the branch's HELD / BLOCKED / not-yet-posted records with their reason codes. Every step is in the POS audit log (`OFFLINE_KEY_ENROLLED`, `OFFLINE_LEASE_ISSUED|CLOSED|ABANDONED`, `OFFLINE_SALE_RECEIVED|POSTED|HELD|REJECTED`). Nothing is ever deleted or posted around review.

## Pilot limits

- Cash only; walk-in only; list price only (no discounts, price levels, negotiated or tier prices, overrides); whole quantities in the base unit; no voided lines.
- Not offline: credit, card/online/voucher tenders, returns/exchanges, batch-, serial- or expiry-controlled items, layaways, Sales Orders, delivery/PI, session transfer/takeover, X/Z reports, Day Close, purchases and inventory adjustments.
- Offline stock is not reserved: two tills can both sell the last unit; posting follows the tenant's existing negative-stock setting (a shortfall with the stock check on is BLOCKED for review). No narrow offline-only negative-stock override yet (audit review N12).
- No back-office review screen yet: the review list is an API; resolution (post into a reconciliation session, record as variance) is still a manual supervisor procedure.
- Device time, lease expiry and the business-day end are honest-mode controls; the server-checkable controls are the sequence window and the count/value caps.
- The offline sign-in is the session owner only and has no PIN of its own (decision D12): anyone at the unlocked Windows session can use it until the lease expires.
- Customers' credit, balances and statements are not cached; the customer list is empty offline.
- Branch exposure cap is enforced at issuance but was not exercised by the E2E run.
- The first X-Report gate checks the lease register without taking the session lock (small race; close/begin-closure/suspend/transfer are fully locked).
- Changing the Electron server address strands the outbox of the old origin (not blocked yet). No secondary backup copy of the outbox (decision D11 not implemented).
- Offline drawer opening is not possible (the drawer event has no offline path; use the driver's open-on-print or the key).

## Tests

- `billbull-backend`: `PosOfflineCryptoInteropTest` (shared JCS vectors, a WebCrypto signature verified in Java, ES256 JWS shape), `PosOfflineRulesTest` (lease gates, pre-posting rules).
- `billbull-frontend`: `packages/shared/src/pages/Sales/POS/__tests__/offlineMvp.test.js` (same vectors, commit/refusal/storage failure on fake-indexeddb with real WebCrypto).
- `tools/pos-offline-e2e`: real Electron end-to-end run and server-side scenarios (see its README).
