# Standalone POS Offline MVP (M3) — Acceptance and Pilot Readiness

Review date: 2026-11-16. Scope: the uncommitted M3 implementation on `feat/email-pdf-attachments` (backend `pos/offline`, V140, frontend `pages/Sales/POS/offline`, `apps/pos` service worker, `tools/pos-offline-e2e`). Design and runbook: [OFFLINE_MVP.md](OFFLINE_MVP.md).

This review changed no code, configuration, migration or database. It is a read-only inspection of the implementation and its tests, taken together with the M3 evidence already recorded.

---

## 1. Final verdict: **CONDITIONAL GO**

The implementation may go to **one controlled pilot on one Electron terminal**, under the restrictions in §5, **after** the six manual checks in §7 pass. The review found no code defect that blocks a restricted pilot. Every failure path that was inspected fails closed:

- Nothing posts outside the normal checkout pipeline.
- Nothing posts twice.
- An offline record is never silently dropped on the server.
- Open exposure is limited to 50 sales and AED 5,000 per lease.

It is not GO yet, for two reasons:

1. **The hardware and network boundary has not been demonstrated physically.** This covers the printer, drawer, network adapter and service-worker update.
2. **A held sale strands the lease.** Nothing in the product can resolve a held sale. The till then refuses to close its own session or run its own X-Report. Ending the lease needs an administrator API call plus a back-office session close. That procedure must be rehearsed once before a cashier depends on it.

It is **not** a recommendation for wider rollout.

---

## 2. What is proven

### 2.1 Real Electron end-to-end (established M3 evidence, not repeated here)

Run by `tools/pos-offline-e2e/run.cjs` against the disposable clone `billbull_m3_offline_20261113`, terminal `T002-CCBF`:

| Step | Result |
|---|---|
| Enrolment, catalogue download | 4,344 eligible products |
| Signed lease issued; ES256 signature verified in the browser against the pinned server key | Yes |
| Server unreachable (the same-origin :8090 server stopped); Electron shell still usable from the service worker | Yes |
| Offline sign-in by the session owner; barcode `0000000100908` scanned; AED 100 cash sale | Yes |
| Sale committed in one strict IndexedDB transaction, signed with the non-extractable P-256 key | Yes |
| Offline receipt marked `OFFLINE — PENDING SYNCHRONIZATION / NOT A TAX INVOICE`, ref `OFF-T002-CCBF-000003` | Yes (print-agent calls answered by the harness, see §3) |
| Electron killed and relaunched offline; pending sale still present | Yes |
| Server back; cashier signed in; sale synchronised as `INV-2026-0165` | Yes |
| Invoice, payment, delivery note, stock movement, journal and ledger rows checked in the database | Yes |
| Same records resent three times | No second invoice, payment, stock movement or journal |

### 2.2 Automated server scenarios (real API, scripted second till)

`tools/pos-offline-e2e/server-scenarios.cjs`, 33/33 passed. A second till is played with its own WebCrypto key and the browser's `jcs.js`. These requirements are covered with real HTTP calls and real posting:

- non-admin enrolment refused
- lease refused to a non-owner and for another branch
- tampered signature, wrong tenant, wrong branch context and record claiming another branch all refused
- card tender, batch-controlled product and below-list price each BLOCKED with nothing posted
- different record under a used sequence refused
- suspend, first X-Report and begin-closure refused while a lease is outstanding
- capture before expiry posts within the grace period; capture after expiry is HELD; arrival after the grace period is HELD; value cap HELD
- no renewal while an expired lease is unsettled
- settlement refused when records are unresolved, missing or the summary is unsigned
- abandonment is admin-only and audited; a later record under an abandoned lease is HELD
- sequences of successive leases do not overlap
- a matched signed settlement closes the lease

Expiry and grace were simulated by editing `not_after` / `grace_until` on the clone, which is valid for server logic. Begin-closure was asserted only as "any 4xx", not specifically `OFFLINE_LEASE_OUTSTANDING`.

### 2.3 Unit and interoperability tests

- Backend: `PosOfflineCryptoInteropTest` (5 tests: shared JCS vectors, a WebCrypto signature verified in Java, JWS shape) and `PosOfflineRulesTest` (10 tests: lease barrier, Day Close barrier, pre-posting rules). 15 new tests pass.
- Frontend: 21 new tests pass, including `offlineMvp.test.js` (commit, refusal and storage failure on fake-indexeddb with real WebCrypto).
- Baselines unchanged and **not attributed to M3**: backend 2,987 tests with the known `SalespersonRoleSeedingTest` failure; frontend with the 9 known HEAD failures in `useDelivery` / `useProductEntry`.
- M2 checkout integrity and concurrency tests pass. M2 was not reopened, and no regression was found.

### 2.4 Code inspection performed in this review

| Question | Finding | Location |
|---|---|---|
| Does every session transition that takes a session out of service check the lease register under the session row lock? | Yes. Close, begin-closure, suspend, takeover, transfer and owner reassignment all call `assertNoBlockingCheckouts` → `PosOfflineLeaseBarrier.assertNoOutstandingLease` after `lockById`. Transfer is reachable only through the guarded `PosSessionService` path. No bulk SQL changes session status. | `PosSessionService.java:834, 968, 1350, 1449, 1506, 1545` |
| Idle scheduler | Skips a session with an outstanding lease, under the same lock. | `PosSessionScheduler.java:103` |
| Can a lease be issued to a session that is closing or closed? | No. Issuance locks the session row and requires OPEN, the owner, the right terminal and branch, an open Business Day, not in the closure workflow, Fast Sale mode and an enrolled key. | `PosOfflineLeaseService.java:162-215` |
| One active lease per terminal | Enforced by a DB unique index as well as in code. | V140 `ux_pos_offline_leases_active_terminal` |
| Day Close | After the "no OPEN / SUSPENDED session" checks, refused while any ACTIVE lease exists for the branch-date. | `PosSessionService.java:2567` |
| Posting route | Only through the existing `PosCheckoutController.checkout` under key `off-<recordId>`, so the M2 attempt journal, session guard, Business Day gate, stock and GL all apply. No second pipeline. | `PosOfflineIngestService.java:285-288` |
| Ingest trust | Signature first; then every binding (tenant, branch, terminal, session, operator, business date, key) is compared with the **server's** lease row; caps use the server's own count of received rows. | `PosOfflineIngestService.java:143-225` |
| Re-check before posting | Tender is cash; tender arithmetic; product still eligible (active, not batch, serial or expiry controlled); price equals today's list price; tax rate equals today's; line total. | `PosOfflineIngestService.businessCheck` |

---

## 3. What is not proven

| Item | Status | Why it matters |
|---|---|---|
| Printing through the real `pos-print-agent` (≥0.7.0: pairing token, printer bound as `escpos`) and a physical thermal printer **while the server is unreachable** | **Not tested.** The harness answered `127.0.0.1:19777` through CDP Fetch. | Pairing, origin allow-list and destination protocol are checked by the agent, not by the harness. Printing never decides whether a sale stands, but the customer needs a receipt. |
| Cash drawer during offline operation | **Not tested.** By design there is no offline drawer event. | The cashier needs a working way to open the drawer: driver open-on-print or the key. |
| Physical network outage (adapter disabled, cable pulled, Wi-Fi off) | **Not tested.** "Offline" was a stopped local server. | DNS, TLS and OS-level failures differ from a refused connection: probe timeouts, `navigator.onLine`, and Electron behaviour on a real tenant `https://` origin. |
| Service-worker cache across a real `/pos/` deploy and restarts | **Not tested.** | A new build deployed while the till holds pending sales must still start offline, keep its IndexedDB, and not serve a broken shell. |
| Session **close** refused while a lease is outstanding (real API) | **Not tested end to end.** Proven by code inspection (same guard as suspend, which is tested E2E). | Primary protection for reconciliation. |
| Transfer, takeover and owner handover refused (real API) | **Not tested end to end.** Proven by code inspection. | Same guard. These operations are excluded from the pilot anyway. |
| Day Close with an offline lease | **Unit test only** (`PosOfflineRulesTest`). | See §4.1: the gate is a second line of defence, because close is already refused while a lease is ACTIVE. The positive path (sync → settle → X-Report → close → Day Close) has not been run end to end. |
| Held-sale administrator procedure | **Not rehearsed.** | See §4.3. The till cannot finish its shift by itself once anything is held. |
| Branch-wide exposure cap | **Not exercised.** Code only. | Not relevant to a single terminal (§4.2). |
| Serial- and expiry-controlled products refused | **Code only.** The batch case is tested E2E. | One predicate excludes all three (`PosOfflineCatalogService.java:116`), so the batch test exercises the same line. |

---

## 4. Risk assessment

### 4.1 Session and Day Close integrity

- **Close, begin-closure, suspend, transfer, takeover and handover are sound.** All of them run under the session row lock that lease issuance also takes. That gives the invariant: **no ACTIVE lease can exist on a CLOSED session.** Only a matched signed settlement or an audited administrator abandonment ends a lease. Expiry does not.
- **Day Close.** Because of that invariant, Day Close (which first requires every session of the date to be CLOSED) can only meet an ACTIVE lease if the invariant were broken. The lease check at `PosSessionService.java:2567` is therefore defence in depth. A unit test is acceptable for that line. What still needs one real run is the **positive** path: online settlement, then X-Report, close and Day Close with no surprises (§7 M5).
- **First X-Report race: real, but not a correctness risk.** `generateXReport` reads the lease register without the session lock (`PosSessionService.java:1971-1980`), so a lease could be issued between that read and the X-Report commit. Inspection shows the consequence is limited:
  - The X-Report does **not** start the closure workflow (that is `closingStartedAt`, set by begin-closure), and checkout does not refuse sales after an X-Report.
  - So the worst case is an X-Report snapshot that omits offline sales posted afterwards. Online sales rung after an X-Report already behave this way.
  - Close and begin-closure remain locked and gated, so nothing posts around the close.
  - In the till flow, `generatePosXReport` settles the lease immediately before the call. Preparation runs only on a till-context change, a reconnect or the Prepare button, so the window is practically closed on one terminal.
  - **Not a blocker.** The pilot restriction "X-Report and closure only from the pilot till" removes the second actor.
- **Abandonment** is admin-only, needs a reason, and is audited (`OFFLINE_LEASE_ABANDONED` with the received count). Records arriving afterwards are HELD `LEASE_ABANDONED`, never posted. **Gap:** the till is never told. Its local lease stays, and `offlineEntryProfile` checks only the operator and expiry. Until the lease's `exp`, the till can still offer "Continue offline" and take sales that will all be HELD. This is the reason for restriction R11.

### 4.2 Exposure limits and multiple tills

What the server **guarantees**:

- **Per lease.** At most 50 records and AED 5,000 can post. Anything beyond is HELD `CAP_EXCEEDED`, counted on the server from stored rows, whatever the till claims.
- **Per terminal.** One ACTIVE lease at a time (DB unique index). No renewal while an expired lease is unsettled. Sequence windows never overlap.

What it does **not** guarantee:

- **The branch cap is soft.**
  - `outstandingAuthorisedValue` is read without a branch-level lock, so two tills on different sessions can both pass the check at the same moment.
  - It counts only leases that have **not expired** (`not_after > now()`). Expired-but-unsettled leases, which can still bring in sales captured before expiry during the 24-hour grace, are not counted.
  - Real branch exposure is therefore bounded by AED 5,000 × the number of enrolled terminals, not by `branch-max-value-minor`.
- **Stock is not reserved.** Two offline tills, or one offline till plus any **online** till in the same branch, can sell the same last unit. At posting, the offline sale goes through the normal POS invoice path, so the tenant's existing stock-check setting decides the outcome. That setting is Sales Settings → stock check (`SalesSettings.stockCheckRequired`, used by `SalesInvoiceService.enforceStockCheck` and the POS warehouse resolution). It applies to the whole tenant, not per branch, and defaults to off.
  - **Stock check off** (posting ignores shortages): the sale posts and stock goes negative.
  - **Stock check on:** the checkout is refused, and the sale is BLOCKED `CHECKOUT_REFUSED`, waiting for review. It stays retryable (§4.3).
  - Either way, nothing is lost and nothing is double-posted by the pipeline. The `PRODUCT_ALLOW_NEGATIVE_STOCK` permission is declared but no posting code reads it, so it is not a control here.
- **Till-side limits are honest-mode.** Expiry, count and value on the till rely on the device clock and an untampered client. The server-side caps are the real control: a tampered client can collect more cash, but those records are HELD, not posted.

**Is one terminal enough?** One Electron terminal **with offline enabled** contains the exposure-cap and two-offline-till risks completely: AED 5,000 / 50 sales per lease, one lease at a time. It does **not** eliminate competition from *online* tills in the same branch: they keep selling from the same unreserved stock while the pilot till is offline. Restriction R7 contains this operationally (no other till sells the pilot SKUs during an outage, stock check on); nothing in the implementation enforces it.

### 4.3 Held and blocked sales

The two states behave very differently:

| Server state | Causes | Can it still post? | Effect on the till |
|---|---|---|---|
| **BLOCKED** | Price or tax drift, product no longer eligible, stock shortfall (only with the stock check on, §4.2), checkout refused (session not open, day closed, period locked), tender or total invalid | **Yes.** "Retry review items" on the till resends it, and the server re-runs the checks and posts under the same key if the cause has been fixed (for example, the list price restored or stock received). | Till row `REVIEW`. |
| **HELD** | Captured after expiry, arrived after the grace period, cap exceeded, sequence outside the window, chain mismatch, lease abandoned | **Never.** `post()` acts only on RECEIVED / BLOCKED. | Till row `REVIEW`. |

Consequences, verified in the code:

1. **Nothing can mark a sale `RESOLVED`.** The state exists in V140 and is accepted by settlement, but no endpoint or service sets it. A lease with any HELD (or unfixable BLOCKED) record can **only** be ended by administrator abandonment.
2. **The till refuses to close its own session or run its own X-Report** while any record of its lease is not `SYNCED` (`offlineRuntime.settleLease` → `releaseOfflineLeaseForClosure` throws). That remains true after the server-side abandonment, because the till keeps its local lease.
3. **The shift must therefore be closed from the back office** (Retail, where the offline runtime is not installed, so the client-side check is inert). The server allows it once the lease is abandoned. This route has not been rehearsed (§7 M6).
4. **After that, offline selling on that terminal stays off.** On the next session, `prepare` tries to settle the old lease first, fails because of the `REVIEW` row, and never asks for a new one. This fails closed and is safe. No supported "reset" exists that keeps the outbox, and deleting the Electron profile destroys the only local copy. For the pilot, **the first unfixable held sale ends offline selling on the pilot terminal** until engineering intervenes.
5. **The cash of a HELD sale is in the drawer without an invoice.** The administrator must bring it into the books explicitly, as an online re-ring of that sale or a recorded cash variance. A HELD record can never post later, so re-ringing a HELD sale cannot duplicate it.
6. **Duplicate risk sits with BLOCKED, not HELD.** A BLOCKED record stays retryable, and `post()` does not check the lease status, so it can still post after abandonment while its session is OPEN. **If someone re-rings a BLOCKED sale and later presses "Retry review items", the customer is invoiced twice.**
   - **First choice: fix and retry.** Remove the cause (restore the list price or tax rate, receive the stock), then press "Retry review items". The sale posts under its original key, exactly once.
   - **Only if it cannot be fixed**, use this order, with no step skipped or reordered:
     1. Stop offline selling on the terminal: switch the till off, or confirm it can no longer sell offline.
     2. Follow R11: `notAfter` has passed, or the till is switched off.
     3. An administrator abandons the lease (`POST /api/pos/offline/leases/{id}/abandon`, with a reason).
     4. Close the original session from the back office.
     5. Only once the original session is **CLOSED**, re-ring the sale in a new session or record the cash variance.

   Re-ringing *before* the original session is closed leaves two live paths to an invoice. The re-ring posts one; the BLOCKED record can still post another the next time anyone retries it. After the close, a retry is refused by the M2 session guard (`CHECKOUT_REFUSED`), so the re-ring is the only invoice.

**Is an API procedure enough instead of a review screen?** Yes, for one terminal, a 50-sale cap and a named administrator. The review list is `GET /api/pos/offline/sales/review` and abandonment is `POST /api/pos/offline/leases/{id}/abandon`. The operational responsibility and the risks are real, though, and must be written into the pilot plan:

- A named administrator owns the review queue and checks it daily.
- That person decides "fix and retry" or "abandon and re-ring / variance" for each record.
- That person closes the shift from the back office.
- Judgement errors are possible: re-ringing a BLOCKED sale while its session is open, or abandoning while the till can still sell.
- The till loses offline capability after an unfixable hold.

### 4.4 Recovery and synchronisation

| Situation | Behaviour (verified) | Guarantee |
|---|---|---|
| App restart with pending sales | Outbox, counter, lease and key reload from IndexedDB; proven in the real Electron run. | Yes, while the Electron profile exists. |
| Retry with the original key and payload | Records are resent unchanged (`record`, `sig`); checkout key `off-<rid>` is part of the signed record. | Yes. |
| Duplicate replay | Same rid and hash → stored state returned; a RECEIVED row re-posts under the same key → M2 journal returns the existing invoice. Proven ×3. | Yes. |
| API unavailable mid-sync | Any error → the batch goes back to `PENDING`; a network error flips the till offline and the probe retries every 5 s. A per-record server exception → `RETRY`, resent. | Yes (at-least-once delivery, exactly-once posting). |
| Server has the record, the till missed the answer | Resend → server answers with the stored state and invoice number → till marks `SYNCED`. | Yes. |
| Record held for review | Till row `REVIEW`, not resent automatically; see §4.3. | Fail-closed; needs an administrator. |
| Local outbox lost (profile deleted, disk failure) **before** sync | Unsynced sales exist only in IndexedDB and on the printed offline receipts. The lease stays ACTIVE and cannot be settled; the administrator abandons it. Cash without invoices is bounded by the lease caps. No secondary copy exists (D11 not implemented). | **No recovery guarantee.** Bounded loss of bookkeeping, not of cash. |
| Electron server address changed | IndexedDB is per origin: the old origin's outbox, key and lease become invisible (not deleted). Switching back restores them. Not blocked by the app. | **No guarantee.** Operational rule R12. |
| Server signing key directory lost | Leases cannot be verified or issued; tills must be re-enrolled. | Back it up with server secrets (`pos.offline.signing-key-dir`). |

---

## 5. Pilot restrictions

The proposed profile is accepted. R11 to R14 are added, each for the technical reason given.

| # | Restriction | Reason |
|---|---|---|
| R1 | One branch: `pos.offline.enabled=true`, `pos.offline.branch-ids=<pilot branch>` in **that tenant's** profile only. `application.properties` is not changed. | Off by default; allow-list. |
| R2 | One physical Electron terminal (`tools/pos-desktop`) enrolled for offline. No second terminal in the branch enrolled. | Branch cap is soft and stock is unreserved (§4.2). |
| R3 | One active POS session on that terminal; the session owner sells offline. | The lease is bound to the owner; offline sign-in is owner-only. |
| R4 | Cash only; walk-in only; list price only; no line or bill discount; whole base-unit quantities. | Enforced on the till and re-checked on the server. |
| R5 | No card, credit, voucher or online tenders; no returns, exchanges, layaways, Sales Orders or delivery offline. | Not supported offline. |
| R6 | Non-batch, non-serial, non-expiry-controlled products only. | Catalogue excludes them; re-checked at posting. |
| R7 | **Stock policy.** (a) Sales Settings → stock check (`stockCheckRequired`) is **on** for the pilot tenant, unless a documented business decision explicitly accepts negative-stock posting. With it off, shortfalls post and drive stock negative. The setting is tenant-wide: it cannot be scoped to the pilot branch, so turning it on changes posting for every branch and channel of that tenant. Decide that before the pilot. (b) No other till, online or offline, sells the pilot SKUs while the pilot till is offline. This is an operating rule; the system does not enforce it. (c) The administrator knows that a stock-shortfall BLOCKED sale is retryable: it posts on "Retry review items" once stock is available. (d) Nobody re-rings a BLOCKED sale while its original session is open and the retry path is still available. (e) Each BLOCKED sale is handled only by fix-and-retry, or by closing the session and then re-ringing (§4.3 item 6). | Offline stock is not reserved, and one offline terminal does not stop online tills selling the same stock (§4.2). Re-ringing a retryable sale can invoice it twice (§4.3). |
| R8 | Lease limits unchanged: 50 sales, AED 5,000, 240 minutes, 24 hours grace. | Server-side cap is the real control. |
| R9 | Reconnect and synchronise within the grace period. The cashier does not end the shift while the till shows pending sales. | After the grace period, records are HELD. |
| R10 | A named administrator reviews `GET /api/pos/offline/sales/review` daily and owns every HELD or BLOCKED record, following the §4.3 rules. | No review screen; `RESOLVED` unreachable. |
| R11 | **Abandon a lease only after its `notAfter` has passed, or with the till physically switched off or offline selling confirmed stopped.** | The till is not told about abandonment and can keep taking sales that will all be HELD (§4.1). |
| R12 | **Do not change the Electron server address** while the offline panel shows any pending, review or rejected records. | The outbox is per origin (§4.4). |
| R13 | **No list-price or tax-rate changes** for pilot-branch items while the till may hold unsynced offline sales. | They turn valid sales into BLOCKED `PRICE_DRIFT` / `TAX_DRIFT`. Reverting the change and pressing Retry recovers them. |
| R14 | X-Report, begin-closure and close for the pilot session are run **from the pilot till**, except the §4.3 back-office close after an abandonment. The Windows session is locked whenever the till is unattended. | Removes the unlocked first-X-Report read (§4.1). Offline sign-in has no PIN (D12). |
| — | **Pilot exit:** the first HELD or unfixable BLOCKED record ends offline selling on that terminal until engineering intervenes. Plan for it. | §4.3 item 4. |

---

## 6. Acceptance checklist

PASS = demonstrated with the stated evidence. NOT TESTED = no execution evidence (code inspection noted where it applies). No item FAILED.

### A. Session and Day Close integrity

| Requirement | Result | Evidence |
|---|---|---|
| Suspend refused while a lease is outstanding | PASS | Server scenario; locked guard `PosSessionService:1449` |
| Idle scheduler does not suspend under a lease | PASS (code) | `PosSessionScheduler:103`; not run E2E |
| Close refused while a lease is outstanding | NOT TESTED (code verified) | Locked guard `PosSessionService:968`; §7 M5 |
| Begin-closure refused | PASS (weak) | Scenario asserts 4xx only; locked guard `:1350` |
| Transfer, takeover and owner handover refused | NOT TESTED (code verified) | Locked guards `:1545`, `:1506`, `:834`; excluded from the pilot |
| First X-Report refused while a lease is outstanding | PASS | Server scenario; unlocked read accepted as non-blocking (§4.1) |
| Day Close refused while a lease is unsettled | PASS (unit only) | `PosOfflineRulesTest`; unreachable while close is gated |
| Day Close after a normal offline day (settle → X → close → Day Close) | NOT TESTED | §7 M5 |
| Settlement only on a matching signed summary | PASS | Scenarios: missing, forged and unresolved refused; matched closes |
| Administrator abandonment, audit | PASS | Scenarios: non-admin 403, admin 200, `OFFLINE_LEASE_ABANDONED` |

### B. Exposure and multiple tills

| Requirement | Result | Evidence |
|---|---|---|
| Per-lease count and value caps enforced by the server | PASS | Scenario `CAP_EXCEEDED`; `leaseUsage` counts stored rows |
| One active lease per terminal | PASS | DB unique index; renewal refused (scenario) |
| Branch-wide cap is a hard limit | **NOT GUARANTEED** | Unlocked read; ignores expired-unsettled leases (§4.2). Contained by R2. |
| No overselling between offline tills | **NOT GUARANTEED** | No reservation; contained by R2 and R7 |

### C. Offline restrictions (server side)

| Requirement | Result | Evidence |
|---|---|---|
| Card tender | PASS | BLOCKED `TENDER_NOT_ALLOWED`, nothing posted |
| Batch-controlled product | PASS | BLOCKED `PRODUCT_NOT_ELIGIBLE` |
| Serial- and expiry-controlled product | PASS (code) | Same predicate as batch (`PosOfflineCatalogService:116`) |
| Below list price | PASS | BLOCKED `PRICE_DRIFT` |
| Captured after expiry | PASS | HELD `CAPTURED_AFTER_EXPIRY` |
| Arrived after the grace period | PASS | HELD `ARRIVED_AFTER_GRACE` |
| Captured before expiry, synced after it (within the grace period) | PASS | POSTED |
| Sale under an abandoned lease | PASS | HELD |
| Tampered record | PASS | REJECTED `SIGNATURE_INVALID`, not stored |
| Wrong tenant / branch | PASS | REJECTED `WRONG_TENANT` / `LEASE_MISMATCH`; wrong context → RETRY, not stored |
| Reused sequence number | PASS | REJECTED `DUPLICATE_CONFLICT` |
| Invalid or mismatched summary | PASS | `SIGNATURE_INVALID`, `OFFLINE_RECORDS_MISSING`, `OFFLINE_RECORDS_UNRESOLVED` |
| Restricted sales never silently posted | PASS | Every case above asserted the invoice count did not change |

### D. Recovery and synchronisation

| Requirement | Result | Evidence |
|---|---|---|
| Pending sale survives app restart | PASS | Real Electron run |
| Retry with the original key and payload | PASS | Code; real run |
| Duplicate replay safe | PASS | Real run, resent ×3 |
| API unavailable during sync | PASS (code, frontend tests) | `doSync` reverts to PENDING |
| Server has the record, client missed the answer | PASS (code; replay run) | Stored state returned |
| Held record handling | PASS (fail-closed); procedure NOT TESTED | §4.3; §7 M6 |
| Recovery after local outbox loss | NO GUARANTEE | §4.4 |
| Server address change | NO GUARANTEE | §4.4; R12 |

### E. Hardware and network boundary

| Requirement | Result |
|---|---|
| Real print agent and physical printer while the server is unreachable | NOT TESTED (§7 M1) |
| Cash drawer during offline operation | NOT TESTED (§7 M2) |
| Physical network isolation | NOT TESTED (§7 M3) |
| Service-worker update across a real deploy and restarts | NOT TESTED (§7 M4) |

---

## 7. Blocking actions before the pilot

### Code defects

**None blocking.** The §4 findings (soft branch cap, unlocked first-X-Report read, `RESOLVED` unreachable, the till unaware of abandonment, no outbox backup) are accepted limitations, each contained by a §5 restriction.

### Manual validation (all six must pass and be recorded with screenshots or photos and the DB rows)

**Environment for M1–M4.** M1–M4 post real invoices, payments, stock movements and journals, so choose where they run carefully.

- **Prefer a staging tenant.** It should have its own database, the same nginx `/pos/` and `/api/` layout as production (`nginx-pos-locations.conf`) and an `https://` origin. Use the **pilot Electron PC** (or an identical build of `tools/pos-desktop`) pointed at that origin, with the real print agent (≥0.7.0, paired) and the real printer and drawer.
- Use a disposable test branch and session where possible.
- **Do not use production merely because the test can be reversed afterwards.** Never assume that voiding an invoice reverses every related record. Payments, stock movements, journals and ledger entries, session and Day Close totals, reports, X-Report snapshots, `pos_offline_*` rows and audit entries can each survive a void.
- If a real tenant is unavoidable, three things are required first:
  - explicit approval from the tenant owner;
  - an isolated test branch and session;
  - a written, verified cleanup and reconciliation procedure covering invoices, payments, stock movements, journals, reports and audit entries, checked against the database afterwards.

Run M5–M6 on a fresh disposable clone (`billbull_m3_*`), never on `testdb` or production.

**M1 — Real printer while the server is unreachable**

1. Install print agent ≥0.7.0.
2. `--set-printer "<queue>" escpos`.
3. Pair it in POS → Devices.
4. Print a normal online receipt.
5. Make the server unreachable (M3 method).
6. Ring an offline cash sale.

Pass when the physical receipt prints the offline banner, the `OFF-…` reference and the totals; Arabic text, if used, is legible; and the sale is in the outbox even if you then switch the printer off and repeat.

**M2 — Cash drawer**

1. Confirm how the drawer opens offline: driver open-on-print, or key.
2. Ring an offline cash sale with change due.

Pass when the cashier can give change without a server. Write the procedure into the cashier sheet.

**M3 — Physical network isolation**

1. With a pending-free till and a valid lease, disable the network adapter, or pull the cable and switch off Wi-Fi.
2. Close and relaunch Electron.
3. Use "Continue offline".
4. Ring two sales.
5. Relaunch again.
6. Restore the network and sign in.

Pass when both sales sync to two invoices with one payment each, the lease settles at X-Report, and the probe recovers without a manual reload.

**M4 — Application update while a sale is pending (staging only)**

*How the update works.* `apps/pos/public/sw.js` is byte-identical between builds, so a deploy does not reinstall the service worker. Instead, after every successful online navigation to `/pos/`, the worker fetches `/pos/sw-manifest.json`. It precaches that build into a cache named `bb-pos-shell-<manifest version>`, and only then deletes the older `bb-pos-shell-*` caches. It never handles `/api/`.

*How static assets and the API are separated.* In the documented deployment, nginx serves `/pos/` from disk (`/var/www/billbull-pos`) and proxies `/api/` to the tenant backend in separate `location` blocks. The till uploads offline sales **only** through `POST /api/pos/offline/sales`. On the staging vhost, two separations are possible:

- **Preferred:** add a temporary rule, `location = /api/pos/offline/sales { return 503; }`, before the `/api/` block, and reload nginx. Sign-in and the shell keep working; uploads are refused before reaching the backend.
- **Alternative:** stop the staging backend service. nginx keeps serving `/pos/` and answers `/api/` with 502.

Either way, the till's upload fails with an HTTP error and the record goes back to `PENDING` (`doSync`); nothing reaches the server. While this rule is active the till may show itself as online, because any HTTP answer counts as reachable (`probeConnectivity`). That is expected here, and no sale is rung during M4. Neither separation has been tried yet: verify it in step 2 before relying on it.

1. On staging, with the till online, make the server unreachable (M3 method). Ring one offline cash sale. Confirm it appears as pending in the till's offline panel, and that `pos_offline_sales` on the staging database has no row for its `rid`.
2. Before restoring the network, apply the upload block on the staging vhost (rule or stopped backend). From another machine, check that `GET /pos/` and `/pos/sw-manifest.json` answer 200, and that `POST /api/pos/offline/sales` answers 503 (or 502).
3. Note the current `version` in `/pos/sw-manifest.json`. Deploy a new `/pos/` build (`npm run build:pos`, installed per `DEPLOYMENT.md`). Confirm the served manifest `version` changed.
4. Restore the till's network and navigate to or reload `/pos/` so it fetches the new shell. If a sign-in is needed to reach the till, do it (with the rule, sign-in works; with the backend stopped, it does not, and the shell alone is enough).
5. Verify the update with observable evidence, not assumption:
   - Through Electron DevTools or the remote-debugging port (as `tools/pos-offline-e2e` uses), Application → Cache Storage shows `bb-pos-shell-<new version>` and no older `bb-pos-shell-*` cache.
   - Application → Service Workers shows the existing worker as `Activated` and controlling `/pos/`. Do **not** expect a new install or activation event: `sw.js` is unchanged between builds, so the update arrives only through the new manifest and the new shell cache.
   - The served `/pos/sw-manifest.json` shows the new `version` (step 3).
   - The `/pos/assets/…` names referenced by the cached `index.html` match the new build.
   - Record screenshots.
   - The sale is still pending in the offline panel, and the staging DB still has no row for it.
6. Disconnect the network physically (M3 method) and restart Electron.
7. Pass when all of the following hold:
   - The shell loads offline from the new cache.
   - The pending record is present with the same `rid`, `seq` and `OFF-…` reference.
   - The DevTools console and network log show no failed or mixed old/new `/pos/assets/` requests.
8. Remove the upload block (or start the backend), restore the network and sign in.
9. Pass when the original record synchronises **exactly once**: one `pos_offline_sales` row, POSTED, for that `rid`, and one invoice, one payment and one stock movement for it. A second "Retry" or relaunch creates nothing further.

**M5 — Full shift and Day Close (disposable clone, API or UI)**

1. Lease issued; offline sale synced.
2. `POST /sessions/{id}/close` **refused** with `OFFLINE_LEASE_OUTSTANDING` while the lease is ACTIVE (closes the E2E gap for close).
3. From the till: X-Report (settles the lease) → begin-closure → close → Day Close for the branch-date succeeds, and the Z totals include the offline invoice.

**M6 — Held-sale drill (fresh disposable clone)**

*Test-only timing.* A real HELD record needs the lease's time limits to pass. Use one of these two methods, both confined to the disposable environment, and record which one was used.

- **Method A (preferred, no data edits):** start the disposable backend with short limits as launch arguments, as `tools/pos-offline-e2e/README.md` does for its other `--pos.offline.*` options: for example `--pos.offline.lease-minutes=15 --pos.offline.grace-hours=0`. Allow enough minutes to sign in offline and ring the sale. `application.properties` is not changed. A sale rung before `notAfter` and synchronised after it is then HELD `ARRIVED_AFTER_GRACE`, and `notAfter` has really passed.
- **Method B (the `server-scenarios.cjs` method):** with SQL on the clone, set the lease's `not_after` **and** `grace_until` in the past, *after* the sale has been rung and before it syncs.

Neither method is an operational procedure: in the pilot, lease times are never edited and R11 applies unchanged.

1. Create a fresh disposable clone (`billbull_m3_*`) and start the disposable backend on it with offline enabled (Method A arguments if used).
2. On the test till, open a session online, let it prepare (lease issued), make the server unreachable, and ring one offline cash sale before `notAfter`.
3. Wait until `notAfter` has passed (Method A), or apply Method B. Restore the network and sign in, so the record syncs and is stored HELD (`ARRIVED_AFTER_GRACE`).
4. Confirm the till's offline panel shows the record for review (`REVIEW`).
5. Confirm the till refuses its own X-Report and session close while the record is unresolved, with the "still waiting to synchronise or need supervisor review" message.
6. Switch the test till off (close Electron and shut down or disconnect the PC).
7. Confirm R11 before abandoning: the lease's `not_after` is in the past (`select not_after, now() from pos_offline_leases where id = '<leaseId>'` on the clone), **and** the till is switched off.
8. As administrator, call `GET /api/pos/offline/sales/review` and confirm the record and its reason code. Then call `POST /api/pos/offline/leases/{leaseId}/abandon` with a reason.
9. Close the shift from the back office (Retail, not the till).
10. Re-ring the HELD sale online (in a new session) or record it as a cash variance at close, following the pilot procedure.
11. Verify all of the following:
    - Exactly one invoice and payment for the sale (the re-ring), or the recorded variance. The HELD record itself has posted nothing.
    - `OFFLINE_LEASE_ABANDONED` in `pos_audit_log`, with the reason and the administrator.
    - The session is CLOSED.
    - After the till is switched on again and a new session opened, it obtains no new offline lease (no new ACTIVE row in `pos_offline_leases` for the terminal).

Also write down who performs steps 8–10 in the pilot.

When M1–M6 pass, the verdict becomes **GO for the §5 pilot**. If any fails, record it against this document and do not start the pilot.
