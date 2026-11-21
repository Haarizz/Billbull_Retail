# POS checkout recovery harness (Phase 0 / M2.2.2, M2.2.3)

Real-browser tests for durable pending checkouts: headless Chrome drives the standalone POS (`/pos/`), the DevTools Fetch domain breaks the checkout request where a real network breaks it, the page is really reloaded, and the database is queried for what actually happened. IndexedDB, reloads and the till code are real; only the network fault is injected (and, in `refused`, the refusal body).

**Only ever point this at a disposable `billbull_m0_*` database.** The script refuses any other name. It posts real sales.

| Scenario | Fault | What must hold |
|---|---|---|
| `lost-response` | server commits, answer reset | record kept UNCERTAIN; after reload the read-only lookup finds the invoice; no re-POST; one invoice |
| `held-response` | answer held, page reloaded | record SENT while held; after reload COMPLETED from the lookup; one invoice |
| `held-request` | request never leaves, page reloaded | server never saw it; nothing re-sent automatically; "Send again" sends the same key and a byte-identical body; one invoice |
| `in-progress` | real worker paused (chaos backend), page reloaded | lookup says in progress; "Send again" answered `CHECKOUT_IN_PROGRESS` and kept; after the worker finishes, one invoice |
| `refused` | `409 SESSION_NOT_OPEN, recorded:false` | released as REFUSED; nothing to recover after reload; no invoice |
| `changed-cart` | answer reset, then the cart is edited | declining the separate-sale prompt sends nothing; the original payload is untouched; confirming gives a new key; one invoice per key |
| `no-indexeddb` | `window.indexedDB` undefined | no checkout request is sent |
| `abandon` | request never leaves, page reloaded | "nothing found" offers no local dismissal; **Abandon on server** closes the record only after the server confirms ABANDONED; a late copy of the original request is refused `CHECKOUT_ABANDONED`; no invoice |
| `two-tabs` | tab A's request held | a second real tab sees "being sent from another tab", offers neither send nor abandon, and settling the same sale there sends nothing and creates no second key; one invoice once A's request goes through |
| `crash` | Chrome process killed (no pagehide) | (1) server committed: recovered read-only after relaunch, nothing re-sent; (2) server never saw it: after the dead tab's lease expires, Send again replays the byte-identical body under the original key; one invoice each |
| `data-loss` | answer reset, then IndexedDB cleared | the till lists the server's recorded sale (with its invoice number) under "Found on the server"; nothing sent; acknowledging hides it |
| `pi-delivery` | PI_FLOW branch, Out for Delivery answer held, page reloaded | recovered from the lookup, no re-POST, one pro-forma invoice |
| `default-delivery` | DEFAULT_SETTLEMENT branch, same | recovered, no re-POST, one posted invoice |

## Running

Requirements: Node 22+, Google Chrome, both apps built (`npm run build && npm run build:pos` in `billbull-frontend`), a clone with an open-able till (stale sessions closed and the Day Close done, see the `email-e2e` notes), and a known password for the till user in the clone only.

```bash
# backend on the clone, then the same-origin server
cd billbull-backend && mvn -o spring-boot:run "-Dspring-boot.run.arguments=--server.port=8081 --spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_m0_x --spring.flyway.locations=filesystem:src/main/resources/db/migration"
node tools/pos-parity/server.cjs ./billbull-frontend 8090 http://127.0.0.1:8081

cd tools/pos-checkout-recovery
export PGPASSWORD=... POS_USER=admin POS_PASSWORD=... POS_BARCODE=0000000100908 POS_SALESPERSON=EMP1257 \
       POS_DB=billbull_m0_x POS_OUT=<dir outside the repo> POS_PROFILE_DIR=<dir outside the repo>
node run.cjs all            # every scenario except in-progress
node run.cjs abandon,two-tabs,crash,data-loss,pi-delivery,default-delivery   # M2.2.3 only
```

`in-progress` needs the backend restarted with a chaos pause before the invoice is saved (the hook arms itself only on a `billbull_m0_` database). An empty key prefix pauses every checkout on that backend, so run this scenario on its own:

```bash
... --pos.checkout.attempt.chaos=|INVOICE_SAVE|before|60000
POS_CHAOS_MS=60000 node run.cjs in-progress
```

Output (`results.json`, `api.json`, screenshots, text dumps) goes to `POS_OUT`. `api.json` holds bearer tokens: keep it outside the repository and delete it afterwards. The first run on a fresh Chrome profile registers a new terminal and transfers the user's open session to it; that first scenario's setup is occasionally slow, so rerun it if it fails before reaching the checkout.

The delivery scenarios switch `pos_settings.delivery_workflow_mode` of branch 1 on the clone and restore it afterwards; set `POS_DELIVERY_PERSON` (default `EMP7361`). `crash` kills and relaunches Chrome on the same profile (the JWT in sessionStorage dies with it, so it signs in again); its second half waits up to 60 s for the dead tab's 30 s lease to expire.
