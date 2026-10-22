# Standalone POS — architecture

The standalone POS is a second browser app for the till. It uses the same backend, the same tenant database and the same POS workspace code as the embedded route. The till is a separate build and shell, not a second system.

```text
Tenant origin (existing nginx vhost → existing Spring Boot profile → existing tenant DB)
├── /                 Retail SPA            billbull-frontend/src        → billbull-frontend/dist
├── /sales/pos        Embedded POS (kept as the rollback path during rollout and pilot)
├── /pos/             Standalone POS SPA    billbull-frontend/apps/pos   → billbull-frontend/apps/pos/dist
├── /api/**           unchanged proxy to the tenant's Spring Boot instance
└── /uploads/**       unchanged proxy

Browser /pos/ → same-origin /api/** → same tenant Spring instance → same tenant DB
```

The tenant is still resolved by the origin's nginx vhost and its proxy to that tenant's backend. Nothing in the POS app names a tenant, host, port or database. In production, API calls are `window.location.origin + /api/...`, because `.env.production` leaves `VITE_API_BASE_URL` empty.

## Workspace layout

The workspace lives **inside `billbull-frontend/`**, not at the repo root. The plan's target shape had `apps/` and `packages/` at the repo root. The live deploy path forced this change: every tenant update runs `cd billbull-frontend && npm install && npm run build`, and the Docker build uses `billbull-frontend` as its context. Keeping the workspace inside that folder preserves both. It also gives one `node_modules`, so there is exactly one React runtime and one copy of each shared context. The architectural boundaries are the same as in the plan.

```text
billbull-frontend/
├── package.json            workspace root ("workspaces": ["packages/*", "apps/*"]) + Retail app
├── src/                    Retail app (unchanged location)
├── packages/shared/        @billbull/shared — modules both apps use
│   ├── package.json        explicit "exports" map (generated, see below)
│   └── src/                mirrors the old src/ layout (api/, utils/, components/, context/, pages/Sales/POS/…)
├── apps/pos/               @billbull/pos — the standalone till
│   ├── index.html, vite.config.js
│   └── src/  main.jsx, PosApp.jsx, shell/, workspace/
└── scripts/workspaceBoundaries.mjs   boundary checker + export-map generator
```

### Why `packages/shared/src` mirrors the old `src/` layout

The move was a set of pure renames (`git` shows 358 × R100). Because the layout is mirrored, every relative import inside the moved code is byte-identical. The same holds for the POS characterization tests, which read sources by `__dirname`-relative path and some of which pin exact import strings or line numbers. Directories can be renamed later (for example `pages/Sales/POS` → `pos/`) as separate cleanup. Doing it during this migration would have rewritten hundreds of pinned test literals.

### What is in `@billbull/shared`

The shared package holds exactly the runtime import closure of the POS workspace plus what both app shells mount:

- the POS workspace: `pages/Sales/POSSales.jsx` and `pages/Sales/POS/**` (all three layouts, Console, reports, payments, devices/printing, input/scanner);
- Sales Return (`pages/Sales/SalesReturn/**`), reached from the till;
- the API modules, money/tax/print/ESC-POS/print-agent utilities, UI primitives, `components/pos/**`, and the Company / Branch / Permission contexts that the closure imports;
- the app-level pieces both apps mount: `index.css`, `AedSymbolRenderer`, `AppAlertBridge`, `api/auth`, `utils/clientLogger`, and the logo;
- the tests and fixtures that only exercise those modules (100 files).

Each of these modules has two callers: the embedded `/sales/pos` route in Retail and the standalone app. Retail-only code stayed in `src/`, including back-office pages, the sidebar, and utilities only Retail pages use, such as `utils/unitPricing.js`. One extraction was needed to keep the closure honest: `utils/pickListPrintTemplate.js` imported its defaults from the back-office `PickListDesigner` page, so the defaults moved into `utils/pickListDefaults.js`.

`POSCounters.jsx` sits in shared because the POS Console embeds it. The standalone host hides it (see host capabilities below).

### Boundary rules (enforced)

| From → To | Allowed? |
|---|---|
| Retail `src/` → `@billbull/shared/<key>` | yes, only keys in the export map |
| POS `apps/pos/src/` → `@billbull/shared/<key>` | yes, only keys in the export map |
| Any relative import that crosses Retail / POS / shared | **no** |
| shared → `@billbull/shared` (self by name) | **no** (use relative imports) |
| anything → `@billbull/pos` | **no** |

The rules live in `scripts/workspaceBoundaries.mjs`, which resolves each specifier to a file. It doesn't pattern-match path strings, so `../` depth can't fool it. Enforcement:

- `scripts/__tests__/workspaceBoundaries.test.js` is part of `npm test`, the hard gate. It also asserts that the export map exactly equals what Retail and POS import: nothing public that no app uses, and nothing imported that isn't public.
- The ESLint rule `workspace-boundaries/no-cross-boundary-imports` gives editor feedback.
- `npm run check:boundaries` runs the check from the CLI. `npm run shared:exports` regenerates the export map after you add an import.

One test-only export exists: `pages/Sales/__tests__/fixtures/posCartFixtures`. It is used by a Retail characterization test (`posCartTotals`) that also exercises the Retail-only `unitPricing`.

## The standalone app

```text
BrowserRouter basename=/pos
└─ CompanyProvider → BranchProvider          (same order as Retail; shared contexts expect it)
   ├─ AedSymbolRenderer, AppAlertBridge, toasters   (same app-level helpers the POS relies on in Retail)
   └─ routes
      ├─ /login   PosLogin
      ├─ /        RequireAuth
      │           └─ PermissionProvider
      │              └─ SessionLock            (401 / token exp → same-user re-login over the mounted till)
      │                 └─ PosErrorBoundary    (no automatic reload)
      │                    └─ RequirePosAccess (sales.pos + sales.invoice)
      │                       └─ PosBootGate   (exactly one branch)
      │                          └─ TillWorkspace = PosHostContext(STANDALONE) + rail + POSSales
      └─ *        → /
```

Not mounted: the Retail sidebar, dashboards, NotificationProvider/notification centre, global search (Ctrl+X), and back-office routes. A till user who types a Retail path under `/pos/` lands back on the till.

There is no customer-display route. The current POS has no second-screen window, so there is nothing to preserve.

### Boot order and who owns each step

| Step | Owner |
|---|---|
| 1. Authentication | `RequireAuth` (checked once at mount) + `PosLogin` |
| 2. Permissions | `PermissionProvider` + `RequirePosAccess` |
| 3. Exactly one branch (never "All Branches") | `PosBootGate` → existing `BranchContext.switchBranch` |
| 4. Device fingerprint, terminal register/resume | POSSales / `usePosSession` (unchanged) |
| 5. POS settings, layout, tax config | POSSales (unchanged) |
| 6. Business day, session resume / Open Session | POSSales, `usePosSession`, `useSessionClosure` (unchanged) |
| 7. Classic / Compact / Cart Focus | POSSales via `PosSettings.defaultLayout` (unchanged) |

Steps 4–7 deliberately stay inside the existing workspace hooks, so there is no second terminal or session lifecycle. The workspace already refuses to sell until a terminal and session exist, using `TerminalUnavailableOverlay`, the Start Session flow, and `PreviousBusinessDayBlockOverlay`. The shell's gates latch once satisfied: a later permission poll or branch reload never unmounts a sale in progress.

No `PosWorkspaceContext` was introduced. POSSales already owns its state, and the shell only composes providers above it.

### Host capabilities

`@billbull/shared/pages/Sales/POS/posHost` is a static context with no state. The embedded route keeps the default (`terminalAdministration: true`). The standalone app passes `STANDALONE_POS_HOST`, which hides the POS Console's **Terminals & Counters** tab (terminal archive/decommission, auto-archive policy, counter CRUD). That administration stays in Retail: Enterprise → POS Administration, or the embedded Console. Layouts, Behavior (already permission-gated), Devices and Print Templates stay available on the till, since hardware setup happens there. The backend authorizes every call either way.

## Auth, session and terminal decisions

- **Till permission.** The live equivalent of the planned `pos.till.operate` already exists: `sales.pos` ("POS Sales" in Roles & Permissions). The till and the embedded `/sales/pos` route both require `sales.pos` **and** `sales.invoice`. The second key is there because the till reads invoices through `/api/sales/invoices`. The backend requires `sales.pos` view (`PosTillPermission`) on every till endpoint: checkout, held sales, layaways, deliveries, the whole session lifecycle including day close, POS search, and the till's product panels. Session, invoice, drawer and printer reads and writes are also limited to the caller's branches. Before the permission audit, those endpoints checked only authentication. The third pass extends the same pattern to device administration (`pos.counters`, `pos.scanners`, `pos.hardwareprofiles`, `pos.devices`, `pos.printers`, `pos.settings`), to held sales, layaways, cash movements and settings, and to the server's printer socket. A drawer pulse needs the caller's own open session, and the socket only dials private-LAN printer ports. Roles with no costing screen get product responses without cost. No new permission was added. Both keys fall back to the `sales` parent when no explicit row exists, so every seeded role that could use the embedded POS still can. Full model, matrix and rollout check: [PERMISSIONS.md](PERMISSIONS.md).
- **Branch.** The till never runs under "All Branches". Branch-restricted users are pinned to their branch. Admins keep a still-valid single active branch, auto-select when only one branch exists, or choose on a full-screen picker. `X-Branch-Id` and backend `BranchScope` are unchanged. The till drops any inherited `activeBranchId` at sign-in and sign-out.
- **Token lifetime.** Unchanged. The JWT stays in `sessionStorage`, so closing the tab signs out, the same as Retail. Nothing new is stored and no token is extended. A 401, or reaching the token's `exp`, raises a same-user re-login over the still-mounted workspace instead of Retail's redirect to `/login`, so the cart survives. While locked, a key guard registered before any POS listener stops lock-screen keystrokes from reaching the scanner wedge and payment hotkeys. Another user must sign out, which discards the screen explicitly. **Limitation:** the till does not survive a closed tab or browser restart. A persistent till login would need a refresh-token design in the backend and is out of scope.
- **Idle lock.** The existing POS idle lock (`IdleLockOverlay`, driven by POS settings) is unchanged.
- **Terminal attribution (`X-Terminal-Id`).** Not added. Nothing in the backend reads such a header (only `X-Branch-Id` and `X-Forwarded-For` are read). Terminal ids already travel in the bodies and paths of the POS calls that need them (`/terminals/{id}/heartbeat`, `sessions/active?terminalId=…`, checkout). A new header would need backend consumers to mean anything.
- **CORS.** Unchanged. Production is same-origin. The POS dev server proxies `/api` and `/uploads` (see DEVELOPMENT.md), so the backend needs no entry for port 5174.
- **Bootstrap endpoint.** Not added. The cold start, measured in the runtime smoke, is the same set of requests the embedded POS makes.

## Shared changes made for the standalone host (Retail behaviour unchanged)

- `api/axiosConfig.setSessionExpiredHandler(fn)`: a host may take over the 401 path. With no handler registered, the Retail default is unchanged.
- `api/auth.persistLoginSession` and `api/auth.describeLoginError`: the login storage keys and error wording, now shared by both login screens.
- `pages/Sales/POS/posHost`: the host capability context described above.
- `index.css` declares `@source "."`, so any app that imports it also gets the shared package's Tailwind classes.

`POSSales.jsx` itself was not edited. It is 10,690 lines before and after, so no line-pinned characterization test moved.
