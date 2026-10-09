# Standalone POS — status (2026-10-09)

Branch `feat/standalone-pos`, based on `d3a4dbd8` (see `GIT_CHECKPOINT.md`). Local only, not pushed, not deployed.

## What exists now

- **`/pos/` standalone till:** `billbull-frontend/apps/pos`, its own Vite build (`npm run build:pos` → `apps/pos/dist`, base `/pos/`). It uses the same backend, tenant database and POS workspace as `/sales/pos`. Classic, Compact and Cart Focus are all selected by the existing `PosSettings.defaultLayout`.
- **`@billbull/shared`:** `billbull-frontend/packages/shared`, the POS workspace plus every module it and the app shells need, moved byte-for-byte (358 pure renames) with an explicit, generated export map.
- **Enforced boundaries:** no cross-app relative imports, no unexported shared keys, nothing imports the POS app. Enforced by a test in `npm test` and an ESLint rule.
- **Embedded `/sales/pos`:** unchanged and still the rollback path. `POSSales.jsx` was not edited (10,690 lines before and after).
- **Docs:** this folder. **Harness:** `tools/pos-parity/`.

Why the workspace sits inside `billbull-frontend/` rather than at the repo root, the provider and boot order, and every auth/terminal/CORS decision are in `ARCHITECTURE.md`.

## Completion checklist

### App / build
- [x] Separate app (`apps/pos`) with its own entry, shell, Vite config and production output.
- [x] Builds for `/pos/` (`/pos/assets/...`) and never touches Retail `dist/`.
- [x] Login, till-permission gate, one-branch boot gate, error boundary, session-expiry lock. Idle lock is the existing POS one, unchanged.
- [x] Classic, Compact and Cart Focus render, and each completed a real sale in the standalone app (runtime smoke).
- [x] POS Console and all in-workspace overlays reachable. "Terminals & Counters" administration is hidden on the till and stays in Retail. No customer display exists to carry over.
- [x] No Retail sidebar, back-office routes, notification centre or global search; no app-to-app imports.

### Shared boundary
- [x] One authoritative copy of each shared module; explicit exports, exactly in sync with usage (tested).
- [x] Money/tax/cart/checkout/report/print characterization suites exist and moved with their code. No financial or print module changed behaviour, so none needed new parity fixtures.
- [x] Import boundary enforced (test + ESLint rule), with a negative control: a planted violation fails it.
- [x] No backend, database, API stack or Spring profile was added.

### Security / bootstrap
- [x] Till permission: the existing `sales.pos` plus the embedded route's `sales.invoice`. No backend change was needed (see ARCHITECTURE.md).
- [x] "All Branches" can't be chosen on the till.
- [x] API calls go to the tenant's existing same-origin `/api/` (checked in the built bundle and through nginx).
- [x] Token and idle behaviour documented. No long-lived-token shortcut. Limitation: a closed tab signs the till out, as in Retail.
- [x] Terminal identity: unchanged ownership. Verified that `/pos/` and `/sales/pos` share the same terminal and session on one origin. `X-Terminal-Id` was deliberately not added (nothing reads it).

### QA / deployment
- [x] Targeted tests, POS suites, full frontend suite (see Validation). No backend source changed, so no backend tests were needed.
- [x] Retail and POS production builds pass.
- [x] Exact failure-set comparison recorded: identical to the pre-change baseline.
- [x] 30-transaction parity runbook and harness exist (`QA_PARITY.md`, `tools/pos-parity`). **Partially executed:** sale × 3 layouts × 2 apps, return × 2 apps, close.
- [x] nginx snippet, caching, deploy and rollback docs. The snippet passed `nginx -t` and live route/header checks on nginx 1.26.3.
- [x] Hardware checklist and pilot runbook exist; both clearly **not run**.
- [x] Embedded route intact: exercised in the same runtime smoke.

### Git / reporting
- [x] Starting tree inventoried. The only change was a credential-bearing local config, preserved uncommitted.
- [x] New branch from the verified starting HEAD; all work is on it.
- [x] Reviewable milestone commits; no force push, nothing pushed.
- [x] No unexplained changes; the two pre-existing local files are untouched.

## Validation (final)

Run from `billbull-frontend` on the final code:

| Check | Result |
|---|---|
| `npx vitest run` (default workers) | 6,335 tests; 10 failed = the 9 baseline + `ServiceRepair` DOM parity, a 6.2 s **timeout** under load. It passes in isolation, twice, and is a known parallel-load flake on HEAD. An earlier default run also timed out two other known flakes (`GlobalSearchModal` loading state, which passes with `--no-file-parallelism`). |
| `npx vitest run --maxWorkers=4` | **1,088 files · 6,335 tests · 6,326 passed · 9 failed. The failure set is identical to the baseline** (3 `useDelivery` + 6 `useProductEntry`, all pre-existing). |
| New/related suites | `apps/pos` (5 files, 28 tests), `scripts` boundary (11 tests), shared `axiosSessionExpired` + `posHost` + console/architecture characterizations: all pass. |
| `npm run build` (Retail) | passes. CSS 274.71 kB, against 274.09 kB at baseline: the extra 0.6 kB is the POS shell's own utility classes, purely additive. JS chunk size unchanged (7,876.75 kB). |
| `npm run build:pos` | passes. `index.html` references `/pos/assets/…`; API base is `window.location.origin`; no `/pos/api`, `localhost:5174` or `localhost:8080` in the bundle. CSS covers every class the shared and POS sources use (checked against the Retail CSS). |
| `npx eslint .` | 87 errors = baseline 87, **0 new**. Warnings 4,636 against 4,582: all the repo-wide `no-unused-vars` false positive on JSX component imports in the new files. |
| `npm run check:boundaries` | 0 violations |
| `git diff --check` | clean |
| Backend | No backend source changed, so the backend suite wasn't required. The real Spring Boot app ran unmodified in the runtime smoke. |

## Runtime evidence

These are real backend runs on throwaway restores of `testdb` (dropped afterwards), driven by headless Chrome. They do **not** count toward the hardware gate. Details are in `QA_PARITY.md`.

- Sign-in → permissions → branch → terminal register/resume → settings → session start, on both paths.
- One device served both paths: the same terminal (`T002-5A2E`) and the same open session were used from `/sales/pos` and `/pos/`.
- A cash sale in Classic, Compact and Cart Focus in both apps. Checkout payloads matched on all 44 fields except the per-sale `checkoutKey`. Invoice, line, stock and GL effects were identical.
- Sales return in both apps: payloads matched except the referenced sale; returns and credit-note GL were identical.
- X-Report + Close Session from `/pos/`: balanced, session CLOSED.

## Not done, and why (human or external gates)

| Item | Why | Where |
|---|---|---|
| Physical till validation (printers, drawer, scanner, Zebra, print agent) | Needs real devices | `HARDWARE_CHECKLIST.md` (not run) |
| Rest of the 30-transaction parity matrix and print-output comparison | Needs a QA snapshot with those features and a configured printer | `QA_PARITY.md` |
| Production deploy / nginx change / tenant cutover | Needs explicit rollout authorization; no server was touched | `DEPLOYMENT.md` |
| One-tenant, full-trading-week pilot | Needs real trading | `PILOT_AND_ROLLBACK.md` (not started) |
| Removing `/sales/pos` | Only after every tenant's pilot is signed off; separate change | `PILOT_AND_ROLLBACK.md` |
| Persistent till login across tab close | Needs a backend refresh-token design; the existing security model is kept | `ARCHITECTURE.md` |

Pre-existing behaviours noticed and left alone, since they're identical on both paths: Compact keeps the scanned barcode in its search box, and one tenant's Classic setting hides both side panels including the scan box. Both are noted in `QA_PARITY.md` and the hardware checklist.
