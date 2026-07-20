# Future Enhancements — Research & Design

> **Status: RESEARCH / DESIGN ONLY. No code, schema, or migration in this folder has been implemented.**
> These documents are planning artifacts to be consulted when implementation is scheduled. Nothing here changes the current workflow.

This folder captures deep-dive research and architecture plans for twelve planned initiatives. Each topic has **two** self-contained files:

- a **design document** (`NN-topic.md`) — the architectural reference (**what** and **why**): current behavior, edge cases, options, a recommended architecture, schema/backend/frontend/API impact, security, performance, migration, risks, a step-by-step plan, and open questions.
- a **roadmap** (`NN-topic-roadmap.md`) — the execution plan (**how** and **when**): a codebase-verified baseline table, a phase map, and per-phase breakdowns (objective, scope, files/DB/backend/frontend/API changes, risks, testing checklist, complexity, dependencies, exit criteria), plus a blocking-decisions table and a cross-cutting testing strategy.

The two are kept separate on purpose: the design doc is the stable reference; the roadmap evolves as phases are executed. **The roadmaps are approved for execution but authorize coding only for the phase currently being worked — never ahead of it.** Every roadmap's phases are independently deployable and leave production unchanged until a feature toggle is flipped per tenant.

| # | Topic | Design | Roadmap | One-line goal |
|---|-------|--------|---------|---------------|
| 1 | Branch-Level Inventory | [`01`](./01-branch-level-inventory.md) | [roadmap](./01-branch-level-inventory-roadmap.md) | Make the Inventory module branch-scoped instead of global |
| 2 | User-Based Data Visibility | [`02`](./02-user-based-data-visibility.md) | [roadmap](./02-user-based-data-visibility-roadmap.md) | Let users see only records they created (ownership filtering, **not** RBAC) |
| 3 | Rate Limiting | [`03`](./03-rate-limiting.md) | [roadmap](./03-rate-limiting-roadmap.md) | A complete rate-limiting strategy across auth and APIs |
| 4 | Audit Logs & Activity Tracking | [`04`](./04-audit-logs-activity-tracking.md) | [roadmap](./04-audit-logs-activity-tracking-roadmap.md) | Unify the 3 audit subsystems + close event-coverage gaps (before/after, login, print, export…) |
| 5 | Approval Workflow | [`05`](./05-approval-workflow.md) | [roadmap](./05-approval-workflow-roadmap.md) | Complete (not rebuild) the existing generic LPO approval engine across all document types |
| 6 | Performance Optimization | [`06`](./06-performance-optimization.md) | [roadmap](./06-performance-optimization-roadmap.md) | Prioritized perf plan: report pagination, real cache, N+1, monitoring |
| 7 | Background Jobs & Queue System | [`07`](./07-background-jobs-queue-system.md) | [roadmap](./07-background-jobs-queue-system-roadmap.md) | DB-backed job queue generalizing existing import/print-job patterns |
| 8 | Search & Indexing | [`08`](./08-search-and-indexing.md) | [roadmap](./08-search-and-indexing-roadmap.md) | `pg_trgm`/full-text + global search at 12k+ catalog scale |
| 9 | Notification Framework | [`09`](./09-notification-framework.md) | [roadmap](./09-notification-framework-roadmap.md) | Multi-channel dispatch layer over the existing in-app notifications |
| 10 | Caching Strategy | [`10`](./10-caching-strategy.md) | [roadmap](./10-caching-strategy-roadmap.md) | Replace the unbounded map cache with Caffeine; cache settings/permissions/lookups |
| 11 | Feature Flags | [`11`](./11-feature-flags.md) | [roadmap](./11-feature-flags-roadmap.md) | Runtime, granular flags layered over the existing `*.enabled` property toggles |
| 12 | Backup & Disaster Recovery | [`12`](./12-backup-disaster-recovery.md) | [roadmap](./12-backup-disaster-recovery-roadmap.md) | Per-tenant Postgres + `uploads/` backup, PITR, DR runbook, RTO/RPO |

> Topics 1–3 were from the first research request; topics 4–12 from the second. All share the infrastructure findings below.

## Cross-topic coordination notes (for execution)

The roadmaps were verified against the codebase on 2026-07-11 and share these facts:

- **Next Flyway migration is `V34`** (tree is at `V33__pos_session_card_closing.sql`; the design docs' "V30 latest" is stale). Several roadmaps each propose a `V34__*.sql` — if two land in the same release, renumber sequentially (`V34`, `V35`, …); they are independent.
- **Caffeine cache** is shared work: Topic 06 (Perf) Phases 3–5 and Topic 10 (Caching) are the *same* cache — build it once. Topics 08 (search cache) and 11 (flag eval cache) depend on it.
- **Micrometer/Actuator** is introduced by Topic 06 Phase 1 and reused by Topics 03 (rate-limit metrics) and 10 (cache hit rates).
- **`search_indexes` migration** overlaps Topic 06 Phase 7 and Topic 08 Phase 1 — one migration.
- **Topic-07 job queue** is a dependency for external sends in Topic 09 (notifications) and app-orchestrated backups in Topic 12.
- **Topic-04 audit hooks** are consumed by Topics 05 (approvals), 11 (flag changes), and 12 (backup admin actions).
- **Branch-aware cache/search/ownership keys** must include `branchId` (and `ownerId` once Topic 02 lands) — a recurring leak-prevention requirement across Topics 02, 06, 08, 10.

## Shared context these plans rely on

The codebase already has a mature **branch-scoping infrastructure** that all three topics build on:

- **`security/BranchContextHolder`** — per-request `ThreadLocal<BranchContext>` (activeBranchId, allowedBranchIds, isAllBranches), populated by `config/JwtFilter` from JWT claims + the `X-Branch-Id` request header.
- **`security/BranchScope`** — static read-only accessor (`currentBranchId()`, `applies()`, `assertCanAccess()`).
- **`settings/branch/BranchAccessService`** — the richest helper: `ListScope` records (`currentListScope`/`currentExactScope`), `filterBranchScoped(...)` Java-side filters, `assertTransactionBranchAccessible(...)`, `assertWarehouseMatchesBranch(...)`, `getAllowedBranchIds(...)`.
- **Frontend**: `context/BranchContext.jsx` mirrors the active branch to `sessionStorage.activeBranchId`; `api/axiosConfig.js` interceptor attaches `X-Branch-Id` (or `"ALL"`) to every request.
- **`common/BaseEntity`** — every entity already carries `createdBy` (a **username string**, populated by `config/JpaAuditingConfig`'s `AuditorAware<String>`), `createdAt`, `updatedBy`, `updatedAt`, `isActive`.

Prior art worth reading before implementing topic 1: `docs/branch-outlet-comparison.md`, `docs/branch-outlet-implementation-report.md`, `docs/branch-outlet-verification.md`, and `docs/DATABASE_ARCHITECTURE_REVIEW.md`.

## Key facts discovered during research (apply to all topics)

1. Sales, purchase, and finance modules are **already branch-scoped**; the **Inventory module is deliberately global** today. `BranchScope`/`BranchAccessService` are currently used mainly by `sales/invoice/SalesInvoiceService`.
2. `Product` and `Warehouse` already have a **nullable `branch_id` FK** (`@ManyToOne(LAZY) Branch branch`) — null means "company-wide / All Branches". The plumbing exists but inventory list/stock queries do not yet filter on it.
3. **Per-branch pricing already exists** via the `ProductBranchPricing` side-table (`product_branch_pricing`) — products stay global, prices vary per branch. This "global master + per-branch override" pattern is a strong template for branch-level *stock* without forking the product catalog.
4. `StockMovement` (the inventory source of truth) has **`warehouseId` but no `branchId`** — branch is currently derivable only by joining `warehouses.branch_id`. This is the single most important schema gap for topic 1.
5. `createdBy` is a **username `String`**, not a `userId`. Topic 2 must decide whether to filter on username or add a `created_by_user_id`.
6. Rate limiting today is a single in-memory `security/LoginRateLimiter` (per-IP, login only). Topic 3 generalizes this.
