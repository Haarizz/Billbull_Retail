# BillBull Standalone POS — Autonomous Execution Plan for Claude Code

**Prepared:** 9 October 2026  
**Purpose:** One end-to-end execution brief. Claude Code should inspect the live repository, checkpoint the existing work, create a dedicated branch, implement the standalone POS client, validate it, and leave clear operational handoff materials. Do not turn this into another series of prompts that requires the user to approve each small step.

---

## 1. Executive assignment

Implement **BillBull POS as a separate browser application** with its own app shell, build target, and deployment path, reusing the existing POS implementation and shared code wherever appropriate.

The standalone POS must use:

- the **same existing BillBull API/backend**;
- the **same tenant database** already selected by the tenant's existing origin/nginx vhost/backend profile;
- the existing terminal, branch, business-day, session, cart, checkout, payments, returns, layaway, held-sales, delivery-settlement, reports, templates, customer display, and device/printing workflows;
- the existing three POS layouts: **Classic**, **Compact**, and **Cart Focus**.

Preferred deployed URL: `https://<tenant-host>/pos/` on the **same origin** as Retail. The existing embedded route `/sales/pos` must remain operational throughout implementation, QA, hardware validation, and pilot. Do not remove it in this task.

### Explicitly out of scope

- A second backend or POS microservice.
- A second database, data copy, tenant schema, or data migration.
- Offline operation, IndexedDB/sync queue, or offline sale support.
- A desktop `.exe`, Electron/Tauri shell, or native rewrite.
- A redesign of POS workflows or a broad bug-fix campaign.
- Decommissioning the embedded POS route before an accepted migration/pilot.
- Production tenant cutover or live hardware testing that cannot be performed safely from the repository. Prepare the exact runbook and configuration needed for those gates instead.

**Do not stop after writing an audit or plan.** Work through every repository-executable phase in this document without asking for confirmation between phases. If a genuinely external gate remains (such as access to a real till or a trading-week pilot), finish all code/tests/configuration/runbooks that can be completed, identify the gate precisely, and do not claim the gate passed.

---

## 2. Architecture target

Target shape:

```text
Tenant browser origin
├── /                 Retail SPA (existing)
├── /sales/pos         Embedded POS rollback path (keep during rollout)
├── /pos/              Standalone POS SPA (new independent build/shell)
├── /api/**             Existing tenant-specific Spring Boot instance
└── /uploads/**         Existing shared tenant path

Browser /pos/ → same-origin /api/** → existing tenant Spring instance → same tenant DB
```

The tenant is resolved today through the origin's nginx vhost and its proxy to that tenant's Spring Boot profile/database. Keep that mechanism. `config/clientConfig.js` is for cosmetic/landing overrides; the POS application should not need Retail's route/landing logic to resolve a tenant.

Target repository shape is an additive workspace with an `apps/pos/` application and a deliberately small `packages/shared/` package for modules that truly have two callers. Keep the current Retail frontend in its current directory during this migration; do not rename it to `apps/retail` as incidental cleanup. Reconcile this target against the live repository layout before changing package manifests. If the existing repository root makes a different minimal workspace structure necessary, document the reason and keep the same architectural boundaries.

### App responsibilities

The standalone app needs a thin, POS-specific app shell containing only what a till needs:

- `index.html`, Vite configuration, entry point, app root and POS styles/tokens;
- POS login using the existing auth API;
- a POS authorization gate using a dedicated till permission if the live backend confirms that the planned permission is not already implemented;
- a boot gate for company, branch, terminal/device identity, POS settings, business day, and session readiness;
- a till workspace rendering the existing extracted POS features, including all three templates;
- a POS-suitable error/recovery surface that does not silently discard an in-progress cart;
- customer-display support if the existing workflow opens it in a separate window;
- no Retail sidebar, dashboard, notification centre, back-office routes, or POS-administration/correction pages.

The Console, reports, layaways, held sales, returns, delivery, and device functions should remain in-workspace overlays/screens as the existing UX dictates, not be reimplemented as a second set of unrelated routes.

### Provider/context rule

Do not introduce `PosWorkspaceContext` as a shortcut during ordinary extraction. First inspect the current hook/component ownership and call hierarchy. If the standalone app genuinely needs a workspace provider, implement it only at the app-composition layer where it can correctly own/compose the required state. Never expect a hook called inside a component to consume a provider rendered later by that same component. Do not move lifecycle-sensitive ownership just to make the diagram look tidy.

---

## 3. Where the project stands (last known context — verify live)

This work began with a very large, router-independent POS surface inside `POSSales.jsx`, embedded in the Retail SPA. The POS backend already has a coherent set of `/api/pos/**` controllers and uses the tenant's existing database. The primary remaining work is frontend separation, shared-module boundaries, app shell/auth/bootstrap/deployment, and proof of parity—not inventing a new POS domain backend.

### Domain/state extraction already reported complete

These hooks/modules were previously extracted from the original POS monolith; verify the current repository rather than recreating them:

- `usePosBehaviourSettings`
- `useHeldSales`
- `useLayaway`
- `useDelivery`
- `usePosPrinting`
- `useTemplateSettings`
- `buildThermalReceiptArtifacts`
- `useCheckout`
- `useCart`
- `useProductEntry`
- `useProductCatalog`
- `useSupervisorApproval`
- `usePosSession`
- `useSessionClosure`
- payment presentation/allocation modules
- session workflow error definitions and report view-model helpers

### UI/component boundaries already reported extracted

Verify that each exists and is correctly wired; do not redo completed work:

- Checkout/payment parts: `CheckoutPaymentHeader`, `CheckoutSettlementSummary`, `PaymentAllocationPanel`, `CheckoutRemarks`, `CheckoutPaymentFooter`, `CheckoutPaymentPreview`, `CheckoutCompleteSummary`, `CheckoutCompleteActions`.
- `NewDeliveryOrder`
- `LayawaysList`
- `CreditBalance`
- `ProductSearch`
- `PriceCheck`
- `ServiceRepair`
- `SerialBatch`
- `ConfirmAction`
- `CouponsDialog`
- `PosFeedbackToasts`

Recent recorded work included the extraction commits for these UI boundaries and POS keyboard/input refactoring. One previously recorded full-suite baseline has three pre-existing `useDelivery` characterization failures. These notes are historical, not a substitute for live repository inspection.

### Current known baseline, to re-establish

An authoritative frontend baseline file was previously used:

`POS/__tests__/known-baseline-failures-after-useCheckout-harness-repair.txt`

The recorded permitted failures were exactly:

1. `useDelivery > initial state starts with an empty roster, list and validation state`
2. `useDelivery > settle modal open does nothing when the modal closes`
3. `useDelivery > settle modal open resets the filters, selection and payment lines, then loads`

The historical full-suite totals changed as tests were added. Do **not** hard-code a stale total as the current baseline. Record current test counts and compare the current exact failure set before edits. Do not edit or regenerate the authoritative baseline just to make a new run pass.

### Historical reports to reconcile, not trust blindly

Earlier planning material described the recommended target as `apps/pos`, `packages/shared`, same-origin `/pos/`, an app-specific Vite base `/pos/`, a dedicated `pos.till.operate` permission, and eight phases from characterization through eventual embedded-route retirement. Use the live tree as the authority when a historical path, line count, branch name, test count, or status differs.

---

## 4. Git safety: required sequence before implementation

This part is mandatory. There may be uncommitted work unrelated to POS standalone. Preserve it.

### 4.1 Inventory and protect the starting tree

Before edits, run and record:

```bash
git status --short --branch
git branch --show-current
git log -8 --oneline --decorate
git diff --stat
git diff --cached --stat
git ls-files --others --exclude-standard
```

Inspect tracked and untracked diffs in detail. Classify each changed path as:

1. intended current work that the user asked to checkpoint;
2. environment/client-local configuration;
3. secret-bearing or deployment-specific material;
4. unrelated work that should be preserved without being mixed into the standalone implementation.

Do not print secret values into the terminal transcript, commit message, document, or final report. Inspect sensitive files without echoing credential values.

### 4.2 Commit the current branch's existing work first

The user explicitly asked to checkpoint current changes on the current branch before starting standalone work.

- Commit the intended existing changes to the **current branch** in one or more coherent commits with accurate messages.
- Stage explicit paths after reviewing them. Do not blindly run `git add .` / `git add -A` before inspecting the diff.
- Do not amend old commits, rewrite history, force-push, reset, clean, or delete untracked files.
- Never commit real secrets, passwords, JWT signing keys, private keys, production tokens, database credentials, tenant-private property values, `.env` secrets, or generated credential material. If a changed config contains secrets, preserve it locally, commit a safe redacted/example form only if it is independently needed, and document that exception. Do not silently drop the user's configuration change.
- If unrelated non-secret source changes are part of the current working tree and the user asked to commit current changes, checkpoint them in a separate, clearly named commit rather than smuggling them into a standalone implementation commit.
- Verify every commit with `git show --stat --oneline HEAD` and confirm the tree status. Do not proceed if any existing user work has been lost.

### 4.3 Create the standalone branch from that checkpoint

Create a new branch after the current changes have been checkpointed. Preferred branch name:

`feat/standalone-pos`

If that name already exists, do not reset, delete, or overwrite it. Choose a unique related name, e.g. `feat/standalone-pos-20261009` or `feat/standalone-pos-2`, and report it. Do not assume an old branch named `feature/posclient` is correct or safe to reuse.

Confirm the new branch is based on the just-verified checkpoint commit. Keep it local; do not push unless specifically requested.

Before the first standalone edit, save a readable status/checkpoint note in the final report or project docs with:

- starting branch and HEAD hash;
- checkpoint commit(s);
- new branch and its base hash;
- starting uncommitted changes that could not safely be committed and how they were preserved;
- test/build baseline results and the exact pre-existing failure set.

---

## 5. End-to-end phases to execute without user-by-user prompting

Perform the phases in dependency order. You may make multiple commits within a phase. Each commit should leave the tree buildable where practical. Do not pause between phases to ask permission unless a destructive or production-only decision cannot safely be inferred.

### Phase 0 — Live audit and safety net

1. Inspect the repository layout, Node/package manager versions, `package.json` scripts, Vite config, ESLint configuration, test runner configuration, current contexts/providers, auth/token behavior, POS route and all existing POS modules.
2. Reconcile the historical extraction list above with the actual source tree; identify what is complete, partial, duplicated, or not present.
3. Run the current baseline test suite and build using repository-approved commands. Use the worker limit needed for a stable run; do not overlap the full suite with a build.
4. Confirm the three known `useDelivery` failure identities if they remain the only baseline failures. If the baseline has changed, investigate first and record the actual state rather than forcing the old baseline.
5. Check whether characterization coverage already exists for financial correctness. Add only missing tests before moving money/printing modules. Required coverage, where missing:
   - a fixture matrix for inclusive/exclusive VAT, mixed rates, zero-rated/exempt items, line/order discounts, quantities, rounding and returns;
   - golden snapshots of totals and exact `posCheckout` request bodies;
   - payment allocation/partial/split tender and credit-limit branches;
   - X/Z report view-models and denomination totals from fixed fixtures;
   - receipt HTML and ESC/POS output hashes for representative document types/languages.
6. Capture reproducible outputs (commands, counts, failure set, build) in a project doc under `docs/standalone-pos/`.

Do not rewrite an existing test just to get a clean baseline. Preserve documented defects separately from the standalone task.

### Phase 1 — Workspace and honest shared package boundary

Create the workspace/build foundation needed for two frontends without relocating the entire Retail app as incidental cleanup.

Target:

```text
<repo-root>/
├── billbull-frontend/       # existing Retail app remains here initially
├── apps/pos/                # new standalone POS app
├── packages/shared/         # only genuinely shared modules
└── billbull-backend/        # existing backend remains unchanged in shape
```

Adapt this only if the live repository root differs. Keep paths and scripts aligned with the actual checkout.

Rules for `packages/shared`:

- A module belongs there only when both Retail and standalone POS genuinely import it.
- No Retail sidebar, back-office pages, app routes, or POS app shell in the shared package.
- Keep one source of truth for money/tax/pricing, request transport and interceptors, APIs, receipt/document rendering, ESC/POS/ZPL, local print-agent protocol, required shared UI primitives, common contexts/hooks, and shared Sales Return as appropriate.
- Provide an explicit package export map; do not make arbitrary internal paths public.
- Add an enforced lint/import boundary: POS may not import directly from Retail's app tree, and shared may not import from either app. Avoid brittle path rules that fail to resolve monorepo packages correctly.
- Do not leave duplicate originals or permanent re-export shims after a module is moved. Move one dependency group at a time, update Retail imports in the same commit, run Retail tests/build, and verify runtime imports.
- Keep `packages/shared` honest; a file should not move there solely because POS might use it later.
- Use the existing React version, package manager, UI tokens, and lockfile strategy. Do not create conflicting React installations or duplicate singleton contexts across bundles.

Move modules in risk-conscious dependency groups: money/pricing first; report/session helpers; print/render/device protocol; API/HTTP/auth transport and branch/company data; shared UI primitives/hooks; shared Sales Return. The exact order may change based on actual dependency cycles, but every move needs parity tests and Retail build/suite validation.

Do not accidentally move POS administration into the POS app. Terminal/counter administration, correction approvals, denomination corrections, cash-movement review, POS audit/analytics and other maker-checker back-office screens remain in Retail. The till may self-register/resume its terminal through existing supported endpoints but must not gain administrative capabilities.

### Phase 2 — Backend/auth hardening only where required

The target is still the **same backend**. First audit whether these items already exist; implement only what is necessary and not already provided.

1. **Dedicated POS permission:** if there is no equivalent permission, add `pos.till.operate` to the existing permission initializer/seeder, gate standalone access on it, and grant it to the existing roles that are already entitled to operate POS. Avoid taking access away from current authorized users. Add backend tests for permission seeding/authorization if backend code changes.
2. **Same-origin production:** the preferred `/pos/` route does not require new production CORS hosts. Add only the local POS development origin (planned `http://localhost:5174`) if needed by the actual dev setup. Do not add broad wildcard CORS as a shortcut.
3. **Terminal attribution:** assess the existing axios client and request audit path. Add `X-Terminal-Id` only if it can be supplied reliably after terminal bootstrap and does not break existing endpoint behavior. Do not send an incorrect or stale terminal id on login/bootstrap requests.
4. **Token persistence / all-day till behavior:** audit existing JWT lifetime, token storage and idle-lock behavior. Do not extend the JWT indefinitely or change global Retail token semantics casually. If persistent POS login is required to survive a closed/reopened tab, implement a narrowly scoped, secure POS solution and tests; prefer an appropriate refresh/session mechanism over casually copying long-lived credentials into browser storage. If the live security design cannot be safely completed from available requirements, keep the established auth behavior and document the exact limitation rather than introducing an unsafe shortcut. Ensure idle lock protects an unattended till without silently discarding an in-progress cart.
5. **Branch scoping:** the POS path must operate against exactly one branch. Disable the `All Branches` selection in the POS-specific branch boot flow. Preserve backend `BranchScope` enforcement and the existing `X-Branch-Id` mechanism.
6. **Bootstrap endpoint:** optional, not a default task. Do not add `/api/pos/bootstrap` unless measured cold-start behavior proves the existing requests are an operational problem and the aggregate can be tested without changing business semantics.
7. Do not add new POS domain endpoints, a second service, new database, or data schema merely to make frontend separation easier.

Every backend change must be additive where feasible, have automated tests, preserve the embedded route, and be validated against an isolated/disposable database/profile—not a live tenant DB.

### Phase 3 — Finish only the decomposition necessary for independent composition

The hook extraction and UI extraction series has already done substantial work. Do not blindly repeat it or spend the entire task extracting every tiny modal.

- Audit which `POSSales.jsx` responsibilities still prevent rendering POS under a standalone shell: lifecycle/bootstrap, parent-only effects, use of Retail contexts, prop bags, external callbacks, and screen templates.
- Preserve ownership already established in extracted hooks/components.
- Keep checkout success ordering intact. The payment-confirmed boundary and post-success background finalization ordering are load-bearing; do not turn fire-and-forget work into awaited work or reorder it.
- Keep the existing POS keyboard/scanner/input focus rules intact.
- Keep printing and print-job audit best-effort semantics intact; a print audit failure must not block a successful print.
- Keep business-day, session closure, supervisor approval and variance authorization behavior identical.
- Extract only remaining high-coupling responsibilities that make the standalone composition impossible or untestable; use source characterization and focused tests before each such change.
- Record the current `POSSales.jsx` line count and updated count per implementation milestone, but do not optimize line count at the cost of ownership or behavior.
- Do not add workspace context during this phase unless the actual component ancestry requires it and the context ownership/design is proven. If needed for Phase 4, create it at the correct parent app composition layer and test that the embedded host keeps working.

Gate: authenticated runtime smoke test in the existing embedded `/sales/pos` route—login, boot terminal/session, sell/tender, print, return, close—before moving to standalone rendering.

### Phase 4 — Implement `apps/pos` as a real independent browser app

Create a separate Vite build/app shell; don't create a page that merely renders `POSSales` while still depending on Retail `App.jsx`/Sidebar/provider stack.

Expected output (adapt paths/names only after source audit):

```text
apps/pos/
├── index.html
├── vite.config.js
└── src/
    ├── main.jsx
    ├── PosApp.jsx
    ├── shell/
    │   ├── PosLogin.jsx
    │   ├── RequirePosAccess.jsx
    │   ├── PosBootGate.jsx
    │   └── PosErrorBoundary.jsx
    ├── workspace/          # composition/provider only if correctly justified
    └── routes-or-views/    # tiny route table, not a second Retail router
```

The precise folder names are not mandates; the functional outcomes below are.

#### Build and paths

- Set Vite `base: '/pos/'` for the deployed bundle.
- Keep Retail's existing build/output path unchanged.
- POS build output must be separate so the two build commands cannot overwrite each other's `dist` files.
- Production API requests remain same-origin relative `/api/**` (do not accidentally generate `/pos/api/**`). Preserve the existing `VITE_API_BASE_URL` mechanism for local development if it is still the supported contract.
- Use only one React runtime/singletons for shared contexts.
- Do not hardcode tenant hostname, backend port, client name, credentials, or tenant database identifiers in the POS app.

#### Minimal route model

- `/login`: POS login screen, using existing `/api/auth/login` and profile/claims mechanisms.
- `/`: one POS workspace, guarded by authentication, POS permission and successful boot state.
- `/customer-display`: preserve the second-screen path if it is part of current behavior and can be opened independently.
- unknown paths: redirect to the POS workspace or login according to auth/boot state.

POS is a till UI, not another back-office home. No Retail sidebar or back-office routes.

#### Boot order

Use/recompose existing ownership; do not invent a second terminal/session lifecycle implementation.

1. Establish authentication and permissions.
2. Read/create device fingerprint using current storage keys and registration contract.
3. Register or resume the terminal.
4. Load POS settings.
5. Load company/branch/tax information.
6. Determine exactly one branch; auto-select only when the existing rules permit it, otherwise show a full-screen branch chooser.
7. Resolve active business day and session; resume when available or show the existing Open Session flow.
8. Render the configured POS workspace.

Handle loading/error/retry transitions so the application never renders a partially booted till that can submit unsafe requests.

#### App providers and screen templates

Mount only the providers POS actually uses: company, branch, permission, business-day status and any justified POS-workspace composition provider. Do not mount the Retail notification centre or sidebar.

Preserve all three existing layouts in one app:

- Classic: existing `POSTouchScreen` classic layout.
- Compact: existing `TradePOSTouchScreen` layout.
- Cart Focus: existing focus mode of the POS touch screen.

Use the existing `PosSettings.defaultLayout` / `posTemplate` resolution. Lazy-load sibling template bundles if it reduces initial POS bundle weight without changing behavior. Do not split layouts into three separately deployed apps.

Retain POS Console and current modal-overlay flows. Retain customer display support. The POS app must reuse existing workspace/features—not copy business logic into new components.

#### Error and idle-lock behavior

- A POS error boundary must offer a till-appropriate recovery path; do not silently reload and lose a cart.
- The idle lock should be a till lock/re-auth flow compatible with current policy, not an unexpected logout. Preserve active cart state on lock.
- Do not introduce new storage/token shortcuts or unsafe diagnostic dumps.

### Phase 5 — Build, auth, runtime, parity, and deployment

#### Automated gates

- Add scripts for POS development, build, and preview using the repo's actual package manager conventions.
- Keep Retail scripts operational and unchanged in meaning.
- Test the POS app shell, login/permission gate, boot gate, and route fallback.
- Verify `base: '/pos/'`, asset URL generation and API URLs with build-level/source-level tests where feasible.
- Verify all existing POS characterization suites continue to pass; preserve the current exact baseline failure set.
- Test shared package imports and enforce no `apps/pos` → Retail-tree imports and no `packages/shared` → app imports.
- Run all frontend tests, full frontend suite, Retail build, standalone POS build, ESLint/boundary rules.
- If backend code changes, run targeted backend tests plus the full backend suite/build supported by the repository. Do not treat a successful frontend build as proof of backend permission correctness.

#### 30-transaction QA parity harness

Create a repeatable test/QA script and runbook. Use only a disposable/QA tenant with a restorable snapshot—never production data for parity experiments.

1. Capture a fixed 30-transaction script against existing embedded POS, including mixed VAT, discounts, multi-unit products, cash/card/split tender, credit/BNPL/voucher paths that are currently enabled, returns, layaway flows, and delivery settlement as applicable.
2. Record outbound request payloads and relevant responses.
3. Restore the same QA database snapshot.
4. Run the same script through `/pos/`.
5. Compare payloads field-by-field, excluding only values that are explicitly non-deterministic (e.g. request IDs, checkout idempotency key if they must differ, timestamps). Explain every exclusion.
6. Compare database effects, including invoices/lines, stock movements and aggregates, journal lines/GL balance, customer ledger/balance, POS session/cash movements and print-job records where applicable.
7. Compare receipt HTML and ESC/POS hashes.
8. Repeat for Classic, Compact and Cart Focus.

No unexplained payload, financial, stock, GL, customer-balance, session or print-output difference is acceptable.

#### Deployment output

Implement and document:

- standalone POS production build command and artifact directory;
- local dev command (planned POS port `5174`, but verify actual conflict/allowlist);
- generic nginx location for `/pos/`, positioned before the generic `location /` fallback;
- `/pos/index.html` no-store/no-cache policy and immutable caching for content-hashed `/pos/assets/`;
- existing `/api/` and `/uploads/` proxy rules unchanged;
- copy/deploy steps to install the POS bundle at `/var/www/billbull/pos/` or the verified equivalent;
- rollback by returning tills/bookmarks to `/sales/pos` and/or removing only the `/pos/` location, without a backend/database change;
- deployment-document updates (including the existing client update instructions if they exist in the current tree).

Do not alter live server/nginx tenant configs, issue certificates, restart tenant backends, or point production tills at `/pos/` without explicit production rollout authorization. Provide ready-to-review snippets and commands, not an unsupported claim that production deployment happened.

### Phase 6 — Hardware/operator readiness gate

Create a real-till checklist that covers:

- POS terminal fingerprint and terminal assignment preserved on the same origin;
- saved branch and scanner profiles preserved;
- USB/Bluetooth/Windows-queue ESC/POS receipt output;
- ESC/POS fallback path to text where relevant;
- network printer path (server-side relay);
- cash drawer open on cash sale and manual kick;
- barcode scan ownership/focus behavior in all relevant dialogs/payment states;
- Zebra label printing where used;
- print-job audit remaining best-effort;
- print-agent version recorded (historically, parity hashing required agent ≥0.5.0; check the current actual minimum/release in source/docs).

Do not mark hardware validation complete unless a person actually runs it on physical devices and records the outcome.

### Phase 7 — One-tenant pilot readiness (not an automatic production cutover)

Prepare a pilot checklist and daily reconciliation sheet for one volunteer tenant:

- all tills initially retain `/sales/pos` rollback access;
- migrate only after a successful hardware gate and clean three-template parity;
- operate for a full trading week;
- reconcile each day's Z-report and investigate every unexplained variance;
- watch failed/stuck print jobs and scanner/terminal registration issues;
- rollback immediately by pointing the tills back to `/sales/pos` if unexplained financial or operational divergence appears.

The agent cannot autonomously declare a full trading-week pilot complete without real usage evidence. Leave this as a clearly labelled human gate.

### Phase 8 — Keep decommissioning separate and gated

Do not delete or disable `/sales/pos`, `POSSales.jsx`, `pages/Sales/POS/**`, `posFirstMode`, or legacy landing overrides as part of initial standalone implementation.

Create a separate future cleanup issue/runbook. Decommission only after every intended tenant has migrated and the pilot has been signed off. If the user explicitly authorizes decommission later, do that in a separate commit with its own build/test and rollback plan. Moving the existing Retail folder to `apps/retail` is optional cleanup and must not be bundled with initial app creation.

---

## 6. Non-negotiable behavior and architecture constraints

1. Same API/backend and same tenant database. No second backend, DB, POS domain service or data mirror.
2. `/sales/pos` remains available as fallback through implementation and pilot.
3. One source of truth for financial, tax, rounding, reporting and receipt/printing algorithms. Do not duplicate these into `apps/pos`.
4. Retail and POS must not import each other's app-shell code. Both may import the deliberate shared package.
5. POS uses only till-operating capabilities; back-office POS administration remains Retail-owned.
6. Preserve current cashier workflow and behavior while changing delivery structure.
7. Preserve checkout success-boundary ordering, idempotency key handling, and fire-and-forget post-success finalization.
8. Preserve business-day rules, session lifecycle, supervisor approvals/variance flows and terminal identity.
9. Preserve scanner timing, focus ownership, payment modal protections and keyboard behavior.
10. Preserve printing payload bytes, template selection, ESC/POS fallback and job-audit non-blocking semantics.
11. No offline mode or desktop executable.
12. Never mask baseline failures, weaken characterization, rewrite the authoritative baseline to fit new results, or fix unrelated defects under the guise of extraction.
13. Do not stage/commit secrets; do not overwrite, stash, or discard unrelated local work without first preserving and documenting it.

---

## 7. Completion criteria — what “done” means here

The implementation phase is complete when all repository-executable items below are done:

### App/build

- [ ] A separate `apps/pos` (or justified equivalent) exists, with its own entry point, app shell, Vite config, and independent production build/output.
- [ ] The POS bundle is buildable for `/pos/` and does not overwrite Retail `dist`.
- [ ] Login, permission guard, boot gate, branch/session flow and error/idle handling are implemented using existing API/domain logic.
- [ ] Classic, Compact and Cart Focus all render in the standalone app.
- [ ] Customer display and all existing till overlays/features remain reachable as before where applicable.
- [ ] There is no Retail sidebar, back-office route tree or direct app-to-app import dependency.

### Shared boundary

- [ ] Shared modules have one authoritative copy and explicit exports.
- [ ] Money, tax, cart, checkout, reports and print parity fixtures cover the critical behavior that will be moved or shared.
- [ ] An enforced import boundary prevents cross-app imports.
- [ ] No duplicate backend/database/API stack was created.

### Security/bootstrap

- [ ] POS permission is least-privilege and seeded without breaking existing POS-capable roles (or the live system's equivalent is documented and tested).
- [ ] Branch selection cannot choose `All Branches` in the till.
- [ ] API calls resolve to the tenant's existing `/api/` route.
- [ ] Token/idle-lock limitations are explicitly resolved or honestly documented; no unsafe long-lived-token shortcut.
- [ ] Terminal ID/bootstrap behavior is correct and audited.

### QA/deployment

- [ ] Targeted, related, Sales/frontend full suite and any required backend tests run.
- [ ] Both Retail and POS builds pass.
- [ ] Exact failure-set comparison is recorded; no new failures are accepted without explicit investigation and approval.
- [ ] QA parity harness/runbook exists for the 30-transaction script across all three templates.
- [ ] Generic nginx/deploy/caching/rollback documentation exists and is syntax-reviewed.
- [ ] Hardware checklist and pilot runbook exist, clearly distinguishing unexecuted human-only gates.
- [ ] Embedded route remains intact and tested.

### Git/reporting

- [ ] Existing work was checkpoint-committed on the original branch, with secrets excluded and preserved locally if any were present.
- [ ] A new standalone branch was created from that checkpoint; all standalone work is on it.
- [ ] The standalone implementation has meaningful, reviewable commits per milestone; no force push.
- [ ] Working tree has no unexplained changes or lost user work.
- [ ] Final report contains exact branch/base hashes, commits, changed files, tests/builds, baseline diff, limitations, and operator-only next steps.

**Important definition:** source code and deploy-ready artifacts can be completed in this assignment. Physical hardware certification, a full trading-week pilot, tenant cutover, and decommissioning are evidence-based operational gates and must remain pending until actually performed and approved.

---

## 8. Required validation procedure

First inspect available scripts in the current package manifests; use the exact repository-supported commands. Do not assume a test runner or npm workspace syntax if it differs.

Minimum sequence after changes:

1. targeted tests for any new/relocated modules;
2. shared package tests (especially money/tax/printing and API boundaries);
3. relevant POS feature suites;
4. embedded Retail route architecture/behavior suites;
5. frontend full suite on a clean run;
6. exact comparison against the pre-change authoritative failure set;
7. backend targeted tests and full backend test/build if backend source changes;
8. Retail production build;
9. standalone POS production build;
10. ESLint plus workspace boundary checks;
11. production bundle path/API URL inspection (`/pos/assets/...`, `/api/...`, never accidental `/pos/api/...`);
12. final `git diff --check`, status review, diff review, and commit audit.

Do not overlap the clean full test suite with heavy builds. If the default worker count produces shifting collection timeouts/`STACK_TRACE_ERROR` or machine-contention failures, rerun cleanly with a reasonable worker limit and report both attempts accurately. Use counts for the current checkout; the exact baseline failure identities matter more than historical totals.

Never claim a physical till, live tenant, production nginx, or full trading-week pilot was validated if it was not.

---

## 9. Required deliverables

Claude should finish with these code and documentation outcomes (names may be adapted to repository conventions while retaining contents):

### Code

- Standalone POS app and independent build target.
- Shared package with explicit exports and tested shared modules.
- POS-specific app shell/login/permission/boot/error handling.
- All three templates and existing POS features accessible.
- Minimal, tested permission/auth/terminal-attribution changes only where required.
- No second backend/database; no removal of embedded POS.

### Repository documentation

Create/update `docs/standalone-pos/` with:

- `STATUS.md` — what exists now, what changed, and current completion checklist;
- `ARCHITECTURE.md` — app/shared/backend/database boundaries and provider/bootstrap order;
- `DEVELOPMENT.md` — run/build/test commands for Retail and POS;
- `DEPLOYMENT.md` — `/pos/` build, same-origin nginx config, caching, deploy and rollback;
- `QA_PARITY.md` — the 30-transaction QA matrix, database/payload/output diff method, and three-template test;
- `HARDWARE_CHECKLIST.md` — real till checks, outcomes left pending unless actually run;
- `PILOT_AND_ROLLBACK.md` — one-tenant full-week pilot, daily Z-report reconciliation, operational rollback; no premature retirement;
- `GIT_CHECKPOINT.md` — starting branch/HEAD, commits made, new branch/base hash, files intentionally left local due to secrets, and preservation of uncommitted work.

Keep docs concise and accurate. Avoid contradictory old line counts or pretending a stage is complete when only a template/runbook exists.

---

## 10. Final response format

At completion, report:

1. **Git checkpoint:** original branch, checkpoint commit(s), new branch, base hash, and whether local sensitive/unrelated changes remain.
2. **Current architecture found:** how the repository actually resolves tenant/API/database and what app/workspace structure now exists.
3. **Implemented:** app shell, build target, shared package boundary, auth/permissions, bootstrap, templates, deployment docs; list exact files/directories.
4. **What was not done and why:** only truly external/human gates or documented blockers—not work deferred merely to ask the user another question.
5. **Validation:** commands and exact results for targeted suites, full suites, exact baseline failure diff, backend tests if applicable, Retail build, POS build, lint/boundary checks.
6. **Parity evidence:** which automated fixtures/harnesses were run, and clearly distinguish automated QA from real till tests.
7. **Deployment:** exact example nginx/deploy instructions and rollback path; explicitly state whether any production server was untouched.
8. **Remaining human gates:** hardware, full trading-week pilot, tenant cutover, eventual embedded-route removal.
9. **Git status:** confirm no user changes were lost and no secrets were committed.

Do not finish by merely proposing the next step. Complete the repository-executable work, commit the milestones on the new branch, and provide the final evidence report.
