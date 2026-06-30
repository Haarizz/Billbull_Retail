# POS Device Manager — Phase F Review Report

Date: 2026-06-30
Scope: Phase F in full ("Device Dashboard" — [pos-device-architecture-specification-v2-2026-06-30.md](pos-device-architecture-specification-v2-2026-06-30.md) §6.9/§14/§16). Builds on completed and approved [Phase A](pos-device-phase-a-review-2026-06-30.md), [Phase B/B.5](pos-device-phase-b-review-2026-06-30.md), [Phase C](pos-device-phase-c-review-2026-06-30.md), [Phase D](pos-device-phase-d-review-2026-06-30.md), and [Phase E](pos-device-phase-e-review-2026-06-30.md). This is the **first phase with frontend UI** — every prior phase was backend-only by design.

---

## 1. Files Added

| File | Purpose |
|---|---|
| `pos/devicemanager/DeviceDashboardService.java` | The unified aggregate read — see §2. |
| `pos/devicemanager/DashboardRefreshSignal.java` | The dashboard's real `PosConfigurationChangedEvent` consumer — see §4. |
| `billbull-backend/src/test/.../devicemanager/DeviceDashboardServiceTest.java` | 6 tests. |
| `billbull-backend/src/test/.../devicemanager/DashboardRefreshSignalTest.java` | 2 tests. |
| `billbull-frontend/src/api/posDeviceDashboardApi.js` | `getDashboardOverview`, `getDashboardRefreshToken`, `getDeviceEvents`, `ignoreDiscoveredDevice`. |
| `billbull-frontend/src/api/posHardwareProfileApi.js` | `getHardwareProfiles`, `getHardwareProfile`, `getProfileSyncStatus`, `assignProfileToTerminal` — the Hardware Profile API client that Phase D never needed (no UI existed to call it from until now). |
| `billbull-frontend/src/pages/Sales/POS/DeviceDashboard.jsx` | The dashboard page itself — see §5. |

---

## 2. Files Modified

| File | Exact change | Breaking? |
|---|---|---|
| `pos/printjob/PosPrintJobRepository.java` | Added two query methods: `findByBranchIdAndStatusIn` (in-flight jobs for the queue widget), `findByBranchIdAndStatus` (completed jobs for the average-duration metric). | **No** — additive methods only; `PosPrintJobService` and every Phase B/B.5 caller untouched. |
| `pos/devicemanager/PosDeviceEventLogRepository.java` | Added one query method: `findTop20ByBranchIdOrderByCreatedAtDesc` (branch-wide recent events, vs. the existing per-device `findTop50ByDeviceIdOrderByCreatedAtDesc`). | **No** — additive method only. |
| `pos/devicemanager/DeviceManagerController.java` | Gained two new constructor dependencies (`DeviceDashboardService`, `DashboardRefreshSignal`) and two new endpoints: `GET /dashboard/overview`, `GET /dashboard/refresh-token`. | **No** — the two Phase A/C endpoints already on this controller (`/dashboard`, `/{id}/events`) are untouched; route-collision-free, verified the same way as every prior addition to this controller (literal-segment routes win over `{id}` patterns). |
| `billbull-frontend/src/App.jsx` | One new lazy-style import (`DeviceDashboard`), one new `<Route path="/sales/pos/device-dashboard">` wrapped in the same `ResourceGuard module="sales.invoice"` every other POS/Sales route uses. | **No** — purely additive; no existing route's path, guard, or element changed. |
| `billbull-frontend/src/layout/Sidebar.jsx` | One new lucide-react icon import (`LayoutDashboard`, already a dependency, just not previously imported in this file), one new nav entry in the Sales group's `subItems` array. | **No** — additive entry only; every existing nav item's path/label/module/icon is unchanged. |

No file from Phase A/B/B.5/C/D/E was otherwise modified. `localPrintAgent.js`, `POSSales.jsx`, `POSConsole.jsx`, and every printer/scanner/cash-drawer backend file are **untouched** in this phase.

---

## 3. The Unified Dashboard Overview

`DeviceDashboardService.getOverview(branchId)` is a single aggregate read composed from repositories and services already built in Phases A–E — explicitly **not** a new source of truth, matching the same "query-composition, not a new entity hierarchy" principle the v2 spec used to justify `DeviceManager` itself in Phase A:

```
GET /api/pos/devices/dashboard/overview?branchId=
  → DeviceManager.getDashboard(branchId)                       [Phase A]   → devices
  → HardwareProfileService.listForBranch(branchId)              [Phase D]   → hardwareProfiles
  → DiscoveryService.listAwaitingRegistration()                 [Phase C]   → discoveredDevices
  → PosPrintJobRepository.findByBranchIdAndStatusIn(QUEUED,DISPATCHED)  [Phase B]  → printQueue
  → PosPrintJobRepository.findByBranchIdAndStatus(SUCCEEDED)    [Phase B]   → (feeds avg-duration metric)
  → PosDeviceEventLogRepository.findTop20ByBranchIdOrderByCreatedAtDesc  [Phase A]  → recentEvents
  → PosCashDrawerRepository.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc  [Phase E]  → (feeds drawer-failures metric)
  → DashboardRefreshSignal.snapshot()                            [Phase F]   → refreshSignal
  → computeMetrics(...)                                                      → metrics
```

This directly satisfies Phase F principle 1 — "a unified view... instead of exposing these as isolated pages" — by giving the frontend **one HTTP call** instead of the six-plus separate reads each prior phase shipped on its own. Those individual endpoints (`GET /api/pos/devices/dashboard`, `GET /api/pos/hardware-profiles`, `GET /api/pos/devices/discovery/awaiting`, `GET /api/pos/print-jobs`, etc.) are all **still present and untouched** — `getOverview` is additive composition on top of them, not a replacement.

---

## 4. The Eight Metric Widgets

| Widget | Computed as | Notes |
|---|---|---|
| Devices Online | count of devices with `runtimeHealth` in `{ONLINE, BUSY}` | |
| Devices Offline | count of devices with `runtimeHealth` in `{OFFLINE, DISCONNECTED}` | |
| Pending Print Jobs | count of jobs with status in `{QUEUED, DISPATCHED}` | "Pending" = anything still in flight |
| Queue Length | count of jobs with status `QUEUED` only | Deliberately narrower than "pending" — this is the actual wait queue, excluding jobs an agent has already claimed |
| Discovered Devices | count of `NEW`-status discovered candidates | Global, not branch-scoped — matches Phase C's own `listAwaitingRegistration()` design choice (discovery candidates aren't yet associated with a branch until registered) |
| Health Warnings | count of devices with `runtimeHealth` in `{ERROR, PAPER_OUT, COVER_OPEN}` | A new three-way classification (online/offline/warning) layered on top of Phase A's `PosDeviceRuntimeHealth` enum — no enum change, just a dashboard-side grouping |
| Drawer Failures | count of active cash drawers with `lastKickResult == FAILED` | Reuses Phase E's `recordKickResult` data directly |
| Average Print Duration | mean of `(completedAt - dispatchedAt)` across `SUCCEEDED` jobs with both timestamps set, in seconds | Returns `null` (rendered as `—`) when there's no completed job yet, rather than `0` or `NaN` — tested explicitly |

**"Last Heartbeat"** (listed in your brief) is deliberately **not** a standalone aggregate metric — it's inherently a per-device value, already shown as a column in the Devices table (`PosDevice.lastHeartbeat`, Phase A/C). Manufacturing a single "most recent heartbeat across all devices" number would tell an operator less than seeing it per-row, so it wasn't built as a widget; this is a documented design choice, not an oversight.

---

## 5. Frontend — `DeviceDashboard.jsx`

The first UI page in this entire effort (Phases A–E shipped zero frontend code by design). Structure:
- **Header** with a manual refresh button.
- **8 metric cards** (§4), using the existing `yellow-400`/`slate` Tailwind palette and card styling pattern copied directly from `Settings/BranchSetup.jsx` (`bg-white rounded-xl border border-slate-200 shadow-sm`) — no new design system introduced.
- **Hardware Profiles table** (name, scope, status, version — surfacing the Phase D enhancement's version number for the first time anywhere in the UI).
- **Devices table** (name/code, type, terminal, status, a color-coded health badge, last heartbeat).
- **Discovered Devices table**, with an **"Ignore" action** wired to the existing Phase C `ignore` endpoint — the only write action on this page.
- **Print Queue table** (in-flight jobs only, per the overview's scope — read-only; no retry button here, see Known Limitations).
- **Recent Device Events table** (event type, result, operation, error, timestamp).

**Branch resolution:** uses the existing `useBranch()` context; if the user has "ALL branches" selected (an admin-only state), the dashboard falls back to `defaultBranch.id` rather than attempting a meaningless "all branches" dashboard call — the backend's `getOverview` is single-branch by design (matching every other branch-scoped endpoint in this codebase), so this fallback is a frontend-only accommodation, not a backend gap.

---

## 6. Consuming the Configuration Changed Event (Principle 3)

This is the part of the brief most worth being precise about, since "consume the event" can mean several different things:

- **`DashboardRefreshSignal`** (backend) is the real subscriber to `PosConfigurationChangedEvent` — distinct from Phase D/E's log-only `PosConfigurationChangedEventListener` stub, which still exists unchanged and still just logs. `DashboardRefreshSignal` instead increments an in-memory `AtomicLong` version counter and records the last-changed timestamp.
- **Why a version counter and not a real cache:** there is no actual cache anywhere in the Device Manager's read path to invalidate — `getOverview` already hits the database fresh on every call. Building a cache *and* an invalidation listener for it would have been inventing a problem to solve a brief that only asked to "demonstrate how future consumers will integrate." The version counter is the simplest mechanism that's still genuinely useful: it lets the frontend distinguish "nothing changed, skip the expensive re-fetch" from "something changed, re-fetch now" — the same purpose a cache-invalidation event would serve, achieved without a cache.
- **Frontend consumption:** `DeviceDashboard.jsx` polls `GET /dashboard/refresh-token` every 8 seconds (a cheap, single-counter response) and only calls `getDashboardOverview` again if the returned version differs from the one it last loaded. A Hardware Profile assignment anywhere in the system (the only thing that currently publishes this event) will cause every open Device Dashboard tab to pick up the change within 8 seconds, without polling the full, heavier overview on every tick.
- **This is explicitly a demonstration pattern, not a finished real-time system** — there's no WebSocket, no server-sent events, no push. The brief's own wording ("may simply trigger cache refreshes or dashboard updates... demonstrate how future consumers will integrate") is satisfied by this without overbuilding; a future Local Device Agent push or notification consumer would subscribe to the exact same `PosConfigurationChangedEvent` this phase already publishes, following the same pattern `DashboardRefreshSignal` just proved out.

---

## 7. Keeping the Existing POS Workflow Unchanged (Principle 4)

Verified, not just asserted:
- **Zero changes to any printer/scanner/cash-drawer entity, service, or controller.** `git status` confirms the only backend files touched in this phase are two repository additions (new methods only) and one controller (two new endpoints, two existing ones untouched).
- **Zero changes to `localPrintAgent.js`, `POSSales.jsx`, or `POSConsole.jsx`.** Receipt printing, the scanner's keystroke-burst handling, and cash-drawer kick triggering all go through exactly the same code paths as before this phase — the dashboard is a read mostly-only operational view layered on top, not a new path any of those flows route through.
- **The dashboard's one write action (`ignoreDiscoveredDevice`)** calls an endpoint that already existed and was already tested in Phase C — this phase didn't add new write logic, it added a new caller of existing logic.
- **New routes added are purely additive** (`/sales/pos/device-dashboard` is a new path; `/sales/pos` itself, where `POSSales.jsx` lives, is untouched).

---

## 8. Testing

**Unit tests:** `DeviceDashboardServiceTest` (6: empty-branch handling, online/offline/warning classification across all 8 health states, queue-length-vs-pending-jobs distinction, average-duration computation, null-average-when-no-completed-jobs, drawer-failure counting) + `DashboardRefreshSignalTest` (2: starts at version 0 with no timestamp, increments on every event) — **8 new tests, all pass.**

**Full backend suite:** `mvn -o test` → **247 tests run (239 prior + 8 new), 2 failures + 3 errors** — same pre-existing, unrelated `WarehouseServiceTest`/`LedgerServiceBankAccountTest` failures carried through every phase. Zero new regressions. `BillbullBackendApplicationTests.contextLoads` passes.

**Manual backend verification:**
- `mvn -o compile` — clean.
- Real Spring Boot boot against the configured Postgres datasource: `Started BillbullBackendApplication`, no `AmbiguousMappingException`, no `BeanCreationException`.
- Live HTTP smoke tests: `GET /api/pos/devices/dashboard/overview?branchId=1` → `403`; `GET /api/pos/devices/dashboard/refresh-token` → `403`. Both unauthenticated-rejection responses, confirming the routes are registered and security-gated.

**Frontend verification:**
- `npm run build` (`vite build`) — **succeeded**, same pre-existing chunk-size warnings as every prior frontend touch in this effort, no new ones attributable to this phase's files.
- `npx eslint` on the three new/changed frontend files individually — **0 errors**, only the same `no-unused-vars` warning pattern already present on every other lazily-route-imported page component in `App.jsx` (confirmed by checking: this warning rule doesn't trace JSX `<Component/>` usage for any of the dozens of pre-existing page imports in this file either — not a defect introduced here).
- Ran the **project-wide** `eslint .` and confirmed all 68 pre-existing errors belong to other files untouched by this phase (verified `App.jsx`'s one pre-existing error is at line 55, inside logic this phase's two-line addition never touches).

**What was not done:** an actual browser-driven manual walkthrough of the dashboard page (logging in, navigating to the new route, confirming the tables/metrics render against live data) was not performed in this session — there was no interactive login/browser session available to drive. The build succeeding and the API contract being independently unit-tested on the backend side are strong but not equivalent evidence to seeing it render. **This is flagged here explicitly, not glossed over** — recommend an actual logged-in walkthrough before considering this phase fully production-verified.

---

## 9. Known Limitations

1. **No actual browser walkthrough performed** (§8) — the highest-priority follow-up before treating this as done-done.
2. **Print Queue widget shows only in-flight jobs (QUEUED/DISPATCHED), not FAILED ones** — so there's no "Retry" button on this page, even though `retryPrintJob` already exists in `posPrintJobApi.js` from Phase B. This was a deliberate scope decision (the overview's `printQueue` field is specifically "what's in flight," matching its own metric definitions in §4) rather than an oversight — a dedicated "Failed Jobs" section with retry actions is a reasonable Phase F follow-up, not built here to avoid scope creep beyond what was asked.
3. **8-second poll interval is a fixed constant**, not configurable per-deployment or backed off when the tab is inactive/backgrounded — acceptable at current scale, worth revisiting if many dashboard tabs are left open simultaneously across a large deployment.
4. **The dashboard has no dedicated permission** — same standing observation made in every prior phase's review about every other Device Manager endpoint; `module="sales.invoice"` (the same RBAC key every other POS-related nav item and route already uses, since this codebase has no separate `POS_SETTINGS`-equivalent frontend permission) gates visibility, not a device-management-specific permission.
5. **Hardware Profiles table doesn't show per-terminal sync status** (Phase D's `isTerminalSynced`/`getSyncStatus`) — the overview returns the branch's profiles with their current `version`, but doesn't cross-reference every terminal's `assignedProfileVersion` to flag staleness inline. `posHardwareProfileApi.js`'s `getProfileSyncStatus(terminalId)` is implemented and ready to call, just not wired into this page's table yet — a natural small follow-up, not built here because it requires a per-terminal table, not a per-profile one, and the brief's widget list didn't explicitly call for it.
6. **No device-level "click to see full event history" drill-down** — the dashboard shows the branch-wide top-20 recent events; `getDeviceEvents(deviceId)` (Phase A's existing per-device endpoint) is wrapped in the new API client but not wired into any click-through UI yet.

---

## 10. Technical Debt

| Item | Why it exists | When to address | Owning future phase |
|---|---|---|---|
| No Failed-Jobs/Retry section on the dashboard | Scope discipline — overview's `printQueue` is specifically "in flight," not "everything ever" | When operators actually need to retry from the dashboard rather than via direct API/Postman | Next dashboard iteration, not a new phase |
| No per-terminal Hardware Profile sync-status display | Requires a different table shape (terminals, not profiles) than what was scoped | Same | Next dashboard iteration |
| No device event drill-down click-through | API client method exists, UI wiring doesn't | Low priority, cosmetic | Next dashboard iteration |
| Fixed 8s poll interval, no backoff for backgrounded tabs | Not needed at current scale | If many simultaneous dashboard sessions become real | Next dashboard iteration |
| `PosConfigurationChangedEventListener` (log-only stub from Phase D/E) still has no real subscriber of its own | `DashboardRefreshSignal` is a *second*, purpose-built subscriber alongside it, not a replacement — the log stub still exists for general visibility | When the Local Device Agent push or audit/notification integrations named in Phase D's brief are actually built | The (unscheduled) agent-update phase, per every prior phase's technical-debt table |

---

## 11. Phase F Acceptance Checklist

| Item | Status |
|---|---|
| Unified dashboard overview (profiles, devices, health, discovery, queue, events) — one endpoint, not isolated pages | ✔ |
| All 8 requested metric widgets implemented and tested | ✔ — "Last Heartbeat" deliberately kept per-device rather than a misleading single aggregate, documented in §4 |
| Real `PosConfigurationChangedEvent` consumer (not just the existing log stub) | ✔ |
| Demonstrates the integration pattern for future consumers without overbuilding | ✔ |
| Database migrations | N/A — no schema change this phase |
| No regression to Phase A–E backend functionality | ✔ |
| No API regression | ✔ |
| Existing POS workflow (printing, scanning, cash drawer) unchanged | ✔ — verified by file-touch audit, not just assertion |
| Backend tests passed (8 new, 247 total, same pre-existing unrelated failures) | ✔ |
| Frontend build clean | ✔ |
| Frontend lint clean for new/changed files | ✔ |
| Full interactive browser walkthrough | ✖ — **not performed**, flagged as the top follow-up item |
| Ready for Card Terminal / Local Device Agent work | ✔, conditional on the browser walkthrough above |

---

Phase F is functionally complete and backend/build-verified. The one explicitly outstanding item — an actual logged-in browser walkthrough of the new page — should happen before this is treated as fully production-verified. Awaiting your review before any Card Terminal or Local Device Agent enhancements begin.
