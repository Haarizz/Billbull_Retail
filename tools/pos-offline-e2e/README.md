# Standalone POS offline acceptance (M3)

Real-system checks for the offline MVP (`docs/standalone-pos/OFFLINE_MVP.md`). **Only point them at a disposable `billbull_m3_*` clone**; both scripts refuse any other name and post real sales.

| Script | Drives | Proves |
|---|---|---|
| `run.cjs` | the real Electron shell (`tools/pos-desktop`) over CDP, its real IndexedDB and service worker, the real backend | prepare online → server unreachable → Electron starts offline → scan → cash sale committed to IndexedDB → offline receipt printed → Electron restarted offline → pending sale recovered → server back → sign in → synchronised → one invoice, one payment, stock, journals, ledger → three resends create nothing |
| `server-scenarios.cjs` | a second till played by the script (its own WebCrypto P-256 key, the browser's `jcs.js`), real API | enrolment/lease authorisation, tampering, wrong tenant/branch, unsupported tender/product, price drift, duplicates, value cap, session gates, expiry + grace, settlement (refused and matched), abandonment, audit |

"Internet disconnected" = the same-origin server the till loads from (`tools/pos-parity/server.cjs` on :8090, the stand-in for the tenant's nginx) is stopped: the till can reach neither its shell nor the API. Print-agent calls (`127.0.0.1|localhost:19777`) are answered by the harness through CDP Fetch and their ESC/POS payload captured; the real agent is never driven.

## Running

```bash
# clone (see the local-tenant-databases notes): pg_dump testdb | pg_restore into billbull_m3_<x>; set a test
# password for admin and cashier1@test.com; close stale sessions; sales_settings.monthly_target_required=false
cd billbull-backend && mvn -o spring-boot:run "-Dspring-boot.run.arguments=--server.port=8081 \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_m3_<x> \
  --spring.flyway.locations=filesystem:src/main/resources/db/migration \
  --pos.offline.enabled=true --pos.offline.signing-key-dir=<dir outside the repo>"
cd billbull-frontend && npm run build:pos

export PGPASSWORD=… POS_DB=billbull_m3_<x> POS_PASSWORD=… POS_OUT=<dir outside the repo> POS_PROFILE=<dir outside the repo>
node tools/pos-offline-e2e/run.cjs              # evidence.json + screenshots + print-N.txt in POS_OUT
node tools/pos-offline-e2e/server-scenarios.cjs # server-scenarios.json in POS_OUT
```

`run.cjs` starts and stops the :8090 server and Electron itself (`POS_KEEP=1` leaves them running for inspection). It adds a receipt printer row for the new terminal on the clone. Re-running on the same `POS_PROFILE` reuses the till, its key and lease (the next sale gets the next sequence number).
