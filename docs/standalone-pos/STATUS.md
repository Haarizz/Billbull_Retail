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
- [x] No database, API stack or Spring profile was added. The only backend changes are the permission audit's checks on existing endpoints: the till permission (`PosTillPermission`), branch scope, and device administration for drawers and printers. The third pass (2026-10-10) adds no schema either: device-administration keys on counters, scanners, hardware profiles, the device registry and print jobs; the drawer-pulse rule and printer network policy on server-relayed printing; branch scope on held sales, layaways, cash movements and settings; and cost masking on the open product reads.

### Security / bootstrap
- [x] Till permission: the existing `sales.pos` plus `sales.invoice`, on both `/pos/` and `/sales/pos`. Permission audit (2026-10-09): the POS APIs had checked only authentication, so they now require `sales.pos` view and the caller's branch scope; drawer and printer setup needs `pos.devices` / `pos.printers`. Third pass (2026-10-10): counter, scanner, hardware-profile and device setup need their `pos.*` keys; POS settings save needs `pos.settings` edit; a drawer pulse through the server needs the till, the printer's branch and the caller's own open session; the server dials only private-LAN printers on ports 9100–9109; held sales, layaways, cash movements and settings are branch-scoped; roles with no costing screen no longer receive product cost. See [PERMISSIONS.md](PERMISSIONS.md) for the endpoint matrix, and run all six of its pre-rollout checks on each tenant.
- [x] "All Branches" can't be chosen on the till.
- [x] API calls go to the tenant's existing same-origin `/api/` (checked in the built bundle and through nginx).
- [x] Token and idle behaviour documented. No long-lived-token shortcut. Limitation: a closed tab signs the till out, as in Retail.
- [x] Terminal identity: unchanged ownership. Verified that `/pos/` and `/sales/pos` share the same terminal and session on one origin. `X-Terminal-Id` was deliberately not added (nothing reads it).

### QA / deployment
- [x] Targeted tests, POS suites, full frontend suite (see Validation). Permission audit: `PosTillPermissionEnforcementTest` (backend role matrix), `PosApiAuthorizationHardeningTest` (sessions, day close, invoice lookups, drawers, printers, POS search, invoice helpers, HTTP 403), `PosCustomerBranchScopeTest` (customer and invoice scope) and `posRouteGuard.test.jsx` (embedded route), each checked with a negative control. Third pass: `PosHardwareControlAuthorizationTest` (18, with a real local printer socket), `PosBranchIsolationTest` (16), `ProductCostExposureTest` (4, serialized JSON over MockMvc), `EscPosDrawerKickTest` (5); 28 negative controls, each caught by the intended test; 28 HTTP checks against a real backend on a disposable clone.
- [x] Printer command security, all paths (2026-10-11, uncommitted, undeployed): every printer-output path inventoried (`PRINT_AGENT_SECURITY.md`, "Every printer-output path"). The backend relay now applies an ESC/POS allow-list as strict as the agent's (drawer pulses still go to `PosDrawerKickAuthorizer`) and a ZPL allow-list for label printers, chosen by the stored printer type; the agent gained `POST /print/zpl` with its own ZPL policy; the ZPL builder's field-data injection (`^`/`~` in product names) is fixed with `^FH` hex escapes. Tests: agent 103 (was 66), backend `PrinterCommandPolicyTest` (13), `PrinterPayloadFixturesTest` (12), 3 new end-to-end cases in `PosHardwareControlAuthorizationTest` (21), frontend `printerPayloadFixtures.test.js` (14, real builder output shared with the backend and agent) plus label-routing cases; 7 negative controls, each caught and each file restored byte-identical. Full suites: frontend 6366 pass / 9 fail and backend unit failures in `WarehouseServiceTest`, `PosSessionServiceTest`, `BusinessDayContinuationGateTest`, `PosDayStatusServiceTest` — **all identical on a clean-HEAD worktree**; the remaining backend failures are the DB-backed `@SpringBootTest` classes, run deliberately against an unreachable datasource. Not run on any physical printer.
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
| Backend | Extraction: no backend source changed, and the real Spring Boot app ran unmodified in the runtime smoke. Permission audit (2026-10-09): full `mvn -o test` ran 2199 tests. Its only failures were 8 in `WarehouseServiceTest` (a Mockito strict-stubbing mismatch in `WarehouseService.resolveBranchForWrite`), which exercises nothing the audit changed. Hardening pass (2026-10-10): full `mvn -o test` ran 2232 tests. `PosSessionTransferControllerTest` failed on the new checks (test setup, fixed; 7/7 pass). The 8 `WarehouseServiceTest` failures reproduce on clean HEAD `43f705a8`. Frontend: full suite 6317/6338; the 21 failures reduce to 9 run serially (`useProductEntry` 6, `useDelivery` 3), and those 9 reproduce on clean HEAD. `build`, `build:pos` and `check:boundaries` pass. Third pass (2026-10-10), full `mvn -o test` against the disposable clone `billbull_sec_p3`: 2275 tests, only the same 8 `WarehouseServiceTest` failures (their dependencies, `WarehouseService` and `BranchAccessService`, are unchanged); all 11 DB-backed classes pass. Frontend `vitest run`: 6338 tests, 9 failed, the same baseline set (`useProductEntry` 6, `useDelivery` 3). Lint: 87 errors, none in a changed file. `build`, `build:pos` and `check:boundaries` pass. |

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
| Print agent 0.7.0 release (0.6.0 origin allow-list, pairing and command allow-lists; 0.7.0 printer protocols, safe upgrade/stop/restart, port-conflict reporting) | **BLOCKED.** Code and automated tests done, and the installer compiles (Inno Setup 6.7.3). It has not been installed, upgraded over a running agent, rolled back or deployed: that needs a disposable Windows machine, which the build PC does not have. There is no verified rollback installer yet (two 0.5.3 candidates, neither installed). The frontend deploys before any till upgrades, backend and frontend together, then one test till per tenant | `PRINT_AGENT_SECURITY.md` (Install, upgrade and recovery; Rollback) |
| Label and receipt prints on real printers after the command policies | Needs one print per printer model (`HARDWARE_CHECKLIST.md` A8–A10) | `HARDWARE_CHECKLIST.md` |
| Software drawer opening through the agent | Product decision (backend-signed grants are the proposed design) | `PRINT_AGENT_SECURITY.md`, "The cash drawer" |
| Rest of the 30-transaction parity matrix and print-output comparison | Needs a QA snapshot with those features and a configured printer | `QA_PARITY.md` |
| Production deploy / nginx change / tenant cutover | Needs explicit rollout authorization; no server was touched | `DEPLOYMENT.md` |
| One-tenant, full-trading-week pilot | Needs real trading | `PILOT_AND_ROLLBACK.md` (not started) |
| Removing `/sales/pos` | Only after every tenant's pilot is signed off; separate change | `PILOT_AND_ROLLBACK.md` |
| Persistent till login across tab close | Needs a backend refresh-token design; the existing security model is kept | `ARCHITECTURE.md` |

Pre-existing behaviours noticed and left alone, since they're identical on both paths: Compact keeps the scanned barcode in its search box, and one tenant's Classic setting hides both side panels including the scan box. Both are noted in `QA_PARITY.md` and the hardware checklist.
