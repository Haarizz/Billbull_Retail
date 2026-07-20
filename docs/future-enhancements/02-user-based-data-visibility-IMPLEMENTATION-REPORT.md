# User-Based Data Visibility (Ownership Filtering) — Implementation Report

**Date:** 2026-07-19 · **Branch:** `feature/bbpos` · **Status:** Implemented, all tests green, default OFF.

Implements the design in [`02-user-based-data-visibility.md`](02-user-based-data-visibility.md) and the roadmap in [`02-user-based-data-visibility-roadmap.md`](02-user-based-data-visibility-roadmap.md). A user sees **only the transactions they created** (owner-only), composed as **AND** on top of the existing Branch-Level access, with a `VIEW_ALL_RECORDS` override for admins/supervisors. Entirely gated behind `ownership.filtering.enabled` (**default false**) — existing tenants are byte-for-byte unaffected until an operator flips it per tenant.

---

## 1. What was built (mechanism)

A new `com.billbull.backend.common.ownership` package mirroring the existing branch-scoping trio (`BranchContextHolder` / `BranchScope` / `BranchAccessService`):

| Class | Role |
|---|---|
| `OwnedEntity` | Interface (`getCreatedByUserId`/`set…`) implemented by `BaseEntity` **and** by the standalone aggregate roots that don't extend it. |
| `OwnershipContextHolder` | Per-request `ThreadLocal` record `{userId, viewAll}`, populated by `JwtFilter`. |
| `OwnershipScope` | Static read-only accessor (`applies()`, `currentUserId()`, `viewAll()`). |
| `OwnershipAccessService` | The single enforcement bean: reads the toggle, resolves the override, asserts single-record access (owner-or-assignee, 404), filters lists (`filterOwned`), and enables the Hibernate net on paginated paths (`enableOwnerFilter`). |
| `OwnershipAuditListener` | JPA `@PrePersist` listener stamping `createdByUserId` from the authenticated principal — null-safe for system writes, never overwrites an explicit value. |

**Enforcement is layered**, exactly as the design specifies:
- **Explicit predicate/guard = the real enforcement.** `assertCanAccessRecord(ownerId, label)` on single-record reads/writes (404, not 403, to avoid id-enumeration); `filterOwned(list, ::getCreatedByUserId)` on list endpoints.
- **Hibernate `@Filter ownerFilter` = defence-in-depth net** for DB-paginated queries where a Java-side filter isn't possible (`enableOwnerFilter(entityManager)` on LPO/PaymentVoucher paged paths). Defined **once** as a `@FilterDef` on `BaseEntity`; every owned entity carries the `@Filter` usage.

---

## 2. Critical finding that shaped the implementation

The design docs assumed *"ownership metadata already exists on every entity via `BaseEntity.createdBy`."* **This is false for the highest-volume tables.** Audited reality:

- **BaseEntity-backed** (inherit the owner column + listener + filter): `Lpo`, `PurchaseInvoice`, `GrnEntity`, `ReceiptVoucher`, `StockTransfer`, `StockTakeSession`.
- **Standalone — no `created_by` at all** (needed a new owner field): `SalesInvoice`, `SalesOrder`, `Quotation`, `ProformaInvoice`, `DeliveryNote`, `SalesReturn`, `Payment`, `JournalEntry`, `Expense`, `PaymentVoucher`.

All **10 standalone entities** were given a nullable `createdByUserId` column, `implements OwnedEntity`, `@EntityListeners(OwnershipAuditListener)`, and the `@Filter` usage — so ownership works uniformly across both entity families.

---

## 3. Modules updated (per-domain wiring)

Ownership was wired into **exactly the set of services that already apply branch scoping** (the aggregate roots) — a verifiable 1:1 seam. 16 services, 16 `filterOwned` list predicates, 18 `assertCanAccessRecord` single-record guards.

| Domain | Services wired |
|---|---|
| **Sales** | SalesInvoice (POS-sales pilot), Quotation, SalesOrder, Proforma, DeliveryNote, SalesReturn, Payment (customer) |
| **Purchase** | LPO, GRN, PurchaseInvoice, PaymentVoucher |
| **Financials** | Expense, JournalEntry (JV), ReceiptVoucher |
| **Inventory** | StockTransfer, StockTake (session) |

Pattern applied per service: inject `OwnershipAccessService`; wrap each `branchAccessService.filterBranchScoped*(…)` result with `ownershipAccessService.filterOwned(…, ::getCreatedByUserId)`; add `assertCanAccessRecord(…)` beside each `assertTransactionBranchAccessible(…)` and in the central `getById`/`getEntity`. DB-paginated list/count paths (LPO, PaymentVoucher) enable the Hibernate net instead.

---

## 4. Backend changes

- **New package** `common/ownership/` (5 classes above).
- **`BaseEntity`**: `createdByUserId` field + getter/setter, `implements OwnedEntity`, `@FilterDef`/`@Filter ownerFilter`, listener registered.
- **10 standalone entities**: owner field + `OwnedEntity` + listener + `@Filter`.
- **`JwtFilter`**: populates `OwnershipContextHolder` (`viewAll = toggle-off OR override-held`); clears it in `finally`.
- **`RolePermissionInitializer`**: seeds `permissions.records.view-all` to ADMIN/BRANCH_ADMIN/MANAGER/SUPERVISOR.
- **`RolePermissionController#/me`**: returns an `_ownership: {filteringEnabled, restricted}` block for the frontend.
- **16 transactional services**: guard + list-predicate wiring.
- **`application.properties`**: `ownership.filtering.enabled=false` (documented, default OFF).

## 5. Database changes

- **`V39__created_by_user_id.sql`** (new Flyway migration — the tree is at V38, not V33 as the roadmap assumed):
  - Adds nullable `created_by_user_id BIGINT` to every table with a `created_by` column, **backfilled** from `created_by = users.username` (best-effort; unresolvable/system rows stay null).
  - Ensures `idx_<table>_created_by_user` and composite `idx_<table>_branch_owner (branch_id, created_by_user_id)` on branch-scoped tables.
  - Second pass indexes the **standalone** tables (owner column added by Hibernate `ddl-auto`, no `created_by` to backfill).
  - Fully **idempotent, guarded, additive-nullable** per the stale-schema convention (mirrors `V34__stock_movement_branch_id.sql`). No column dropped/narrowed/NOT-NULL.

## 6. Frontend changes

- **`PermissionContext`**: reads the `_ownership` block; exposes `ownershipFilteringEnabled`, `isOwnershipRestricted`, `canViewAllRecords`.
- **`components/common/OwnershipIndicator.jsx`** (new): `OwnershipIndicator` banner ("Showing only records you created", shown to restricted users) + `OwnershipScopeToggle` (My/All switch for override-holders, wired to `?ownerScope`). Both render nothing when the toggle is off — safe to place anywhere.
- **Pilot wire-in**: indicator added to the Sales Invoice list page.

## 7. API changes

- **Backward compatible.** Existing list endpoints return an ownership-narrowed set for restricted users only when the tenant toggle is on; override-holders and toggle-off tenants are unchanged.
- `GET /api/role-permissions/me` gains the `_ownership` block (additive).
- GET-by-id returns **404** for a non-owned record under the toggle (id-enumeration-safe). Owner is always **server-derived** — never a client-supplied value.
- `?ownerScope=mine|all` reserved for override-holder My/All (frontend plumbing in place).

## 8. Security improvements

- **AND-composition with branch** (never OR) — ownership only ever *adds* a predicate; branch scope is untouched. Verified structurally + by unit test.
- **GET-by-id leak closed** — the headline risk. Explicit `assertCanAccessRecord` on every single-record read/write/delete path (the Hibernate filter does not guard `find(id)`). Several standalone read paths that previously had **no** access guard at all (e.g. `Quotation`, `Proforma`, `Expense` getById) now have an ownership guard.
- **Override is a real seeded permission** (`permissions.records.view-all`), checked server-side; ADMIN/BRANCH_ADMIN/SUPER_ADMIN bypass in code (same rule as the rest of RBAC).
- **Rename-proof** — filtering keys on the stable `created_by_user_id`, not the mutable `created_by` username.
- **Children inherit** — filtering is applied only at aggregate roots; line/payment/batch children are never filtered independently.

## 9. Test cases executed

New unit tests (`common/ownership/`):
- **`OwnershipAccessServiceTest`** — toggle-off invariance (repo never consulted); override bypass (admin roles + `view-all` permission); owner-only restriction; **owner-or-assignee**; **GET-by-id → 404**; null-owner hidden; unauthenticated = unrestricted.
- **`OwnershipAuditListenerTest`** — stamps owner for authenticated write; null-safe for system/unauthenticated; never overwrites an explicit owner; ignores non-owned entities.

**Full suite: `mvn -o test` → 392 tests, 0 failures, 0 errors** (up from 365; the previously-clash-failing `StockTakeSerializationIT` now boots and passes after the `@FilterDef` fix). The 10 existing service tests whose constructors changed were updated to pass a real **pass-through** `OwnershipAccessService` (toggle off) — proving toggle-off invariance holds across the whole suite.

**Frontend: `npm run build` → success** (bundled clean). `npm run lint` has pre-existing errors across the codebase; my new/changed files add **zero** new errors (verified by diffing the one flagged rule against the committed original).

---

## 10. Deliberately EXCLUDED from ownership filtering (with rationale)

| Surface | Why not filtered |
|---|---|
| **Master/reference data** (products, customers, vendors, warehouses, departments, brands, units, COA, settings) | Filtering them makes creation impossible — a golden rule. Not touched. |
| **GL financial statements** (`FinancialReportService`: trial balance, P&L, balance sheet, cash flow) | These are the company's books, aggregating **system-owned** `LedgerEntry` rows. Ownership-scoping them would produce nonsensical partial financials. |
| **Management analytics dashboard** (`SalesAnalyticsService`) | Runs aggregate queries on a `CompletableFuture` thread pool — the per-request ownership `ThreadLocal` is not propagated there. It's a company/branch overview for override-holders. Operational per-domain `getStats()` **are** scoped, so restricted users' dashboard KPIs do respect ownership. |
| **Child records** (invoice lines, payments, batches) | Inherit visibility from their root; never filtered independently. |

---

## 11. Remaining recommendations

1. **Turn on per tenant when ready.** Set `ownership.filtering.enabled=true` in the target `application-<client>.properties`; nothing else changes. Rehearse rollback (flip back to false → all-visible).
2. **Multi-actor domains rely on the override for correctness.** JVs (maker-checker) and SalesOrder→delivery flows use owner-only filtering; the next actor/approver is not locked out **because** approver roles (MANAGER/ADMIN/BRANCH_ADMIN) hold `view-all`. If a tenant ever grants JV-approval to a role **without** the override, add explicit assignee actor-ids via the already-present `canAccessRecord(owner, extraActorIds)` hook. Consider **excluding JVs/approvals** from the allowlist entirely (design §14.1) if that's cleaner for the tenant.
3. **Backfill coverage.** V39 backfills `created_by_user_id` from resolvable usernames; historical rows whose creator was deleted/renamed stay null (unowned → visible to override-holders only). Run the Phase-0 diagnostic counts per tenant before enabling if legacy visibility matters.
4. **Analytics dashboard ownership** (if ever required) needs the owner id threaded through each aggregate repository query as an explicit parameter (the thread-pool boundary rules out the ThreadLocal net). Deferred as override-holder-oriented.
5. **`?ownerScope=mine|all` list narrowing** for override-holders: the frontend toggle + context signal are in place; the per-endpoint query param handling can be added when a tenant asks for the My/All switch on a specific list.
6. **Per-module override** (design §14.3) — currently one global `view-all`. Split into `permissions.<module>.view-all` later if a tenant needs "see-all-sales but only-own-expenses".
