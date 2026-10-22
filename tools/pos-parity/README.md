# POS parity harness

Runs the same till scenario through the embedded POS (`/sales/pos`) and the standalone POS (`/pos/`) and diffs what each sends to the backend. The method, scope and recorded results are in `docs/standalone-pos/QA_PARITY.md`.

**Only ever point this at a disposable database** (a restored copy of a QA tenant), never a live tenant. The scenarios open sessions, post sales, returns and GL entries.

Requirements: Node 22+ (global `WebSocket`), Google Chrome (set `CHROME_PATH` if it isn't in the default Windows location), both apps built.

```bash
# 1. disposable DB, e.g. pg_dump -Fc qa_tenant > qa.dump; createdb pos_parity; pg_restore -d pos_parity qa.dump
# 2. backend on it (any free port)
cd billbull-backend && mvn spring-boot:run "-Dspring-boot.run.arguments=--server.port=8081 --spring.datasource.url=jdbc:postgresql://localhost:5432/pos_parity"
# 3. both builds, served same-origin like the production vhost
cd billbull-frontend && npm run build && npm run build:pos
node tools/pos-parity/server.cjs ./billbull-frontend 8090 http://localhost:8081

# 4. scenarios (one Chrome profile = one till device; reuse it for both modes)
cd tools/pos-parity
export POS_USER=... POS_PASSWORD=... POS_PROFILE=till1 POS_LAYOUT=focus
POS_BARCODES=<barcode1>,<barcode2> POS_SALESPERSON=<employee code> node run.cjs sale standalone
POS_BARCODES=<barcode1>,<barcode2> POS_SALESPERSON=<employee code> node run.cjs sale embedded
POS_RETURN_INVOICE=<invoice from the standalone sale> node run.cjs return standalone
POS_RETURN_INVOICE=<invoice from the embedded sale>   node run.cjs return embedded
POS_CLOSE_COUNT='{"1000":5,"200":1}' node run.cjs close standalone

# 5. compare (on Git Bash, prefix with MSYS_NO_PATHCONV=1 so /api/... is not rewritten)
node compare.cjs out/sale/focus/embedded/api.json out/sale/focus/standalone/api.json /api/pos/checkout
node compare.cjs out/return/default/embedded/api.json out/return/default/standalone/api.json /api/sales/returns
psql -d pos_parity -v a=<invoice A> -v b=<invoice B> -f db-effects.sql
```

Each step writes a screenshot and a text dump to `out/<scenario>/<layout>/<mode>/`, plus `api.json` with every `/api` request and its status (login bodies redacted). `out/` and `.chrome-profiles/` are git-ignored. Delete them after a run, because `api.json` contains bearer tokens.

The layout under test is whatever `PosSettings.defaultLayout` says for the branch. Change it in the Console (Manage Layouts) or in the disposable database between runs, and set `POS_LAYOUT` to label the output.
