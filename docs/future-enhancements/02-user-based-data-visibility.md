# Topic 2 — User-Based Data Visibility (Ownership Filtering)

> **RESEARCH / DESIGN ONLY — not implemented. No schema or migration in this document has been applied.**

Goal: allow users to see **only the transactions they created**. This is **ownership-based filtering, NOT role-based access control**. Example: User A sees only records created by User A; User B sees only records created by User B. Design it so it can be applied **consistently** across the system, alongside (and orthogonal to) the existing branch scoping.

---

## 1. Current system behavior

- **RBAC exists** (`security/Permission`, `RolePermission`, `ModulePermissionService`, `@EnableMethodSecurity`) — it controls *what actions/modules* a user can access, **not** *which rows*.
- **Branch scoping exists** (`BranchContextHolder` / `BranchScope` / `BranchAccessService`) — it filters rows by **branch**, not by **owner**.
- **Ownership metadata already exists on every entity:** `common/BaseEntity` has `createdBy`, populated automatically by `config/JpaAuditingConfig`'s `AuditorAware<String>` — **which stores the username `String`, not the user id.**
- **No ownership *filtering* exists today.** Two users in the same branch with the same permissions see the *same* list of transactions. Nothing restricts a list to "rows I created".

Key implication: the data needed for ownership filtering (`created_by`) is **already captured on every row** — the feature is primarily a **read-path filter**, not a data-model overhaul.

---

## 2. Challenges and edge cases

1. **`created_by` is a username string, not a stable id.** If a user is renamed, historical rows keep the old username and "orphan" from the current user. **Recommendation: add a stable `created_by_user_id BIGINT` and filter on that**; keep the username for display/audit. (Filtering on username works but is brittle.)
2. **Admins/supervisors must still see everything.** Ownership filtering must be *opt-in per role/user*, with an override (e.g. `VIEW_ALL_RECORDS` permission or a role flag) so managers aren't locked out.
3. **Interaction with branch scoping.** Ownership is an **additional AND** on top of branch scope: a restricted user sees rows where `branch_id ∈ allowed` **AND** `created_by_user_id = me`. The two must compose cleanly.
4. **Shared/collaborative records.** Some workflows have multiple actors (a sale created by A, delivered by B, approved by C). Strict "created_by = me" would hide a record from the person who's meant to act on it next. Need a policy: owner-only, or owner + assignees + last-modifier.
5. **Related/child records.** If a user sees an invoice they created, they must also see its lines, payments, delivery notes, print jobs, etc. — even if a child row was written by the system or another user. Filtering must apply at the **aggregate root**, and children inherit visibility from the root.
6. **Reports and dashboards.** Totals/KPIs must respect ownership for restricted users, or a cashier could infer others' sales from a dashboard total.
7. **Lookups & references.** A user creating a new document may need to *reference* a customer/product created by someone else. Ownership filtering must apply to **transactions**, not necessarily **master data** (customers, products) — otherwise the system becomes unusable.
8. **System-generated rows.** Seeders, schedulers, and background jobs write rows with `created_by = null` or a system principal. Policy needed for null-owner rows (recommend: visible to admins only, or treated as unowned/shared per entity type).
9. **Consistency across ~15 domains.** Applying this ad-hoc per service is error-prone. A **single reusable mechanism** (see §4) is essential.
10. **Legacy rows with null `created_by_user_id`.** Backfill from `created_by` username where resolvable; leave null where not.

---

## 3. Possible implementation approaches

### Approach A — Hibernate `@Filter` (entity-level, declarative) — RECOMMENDED core

- Define a Hibernate `@FilterDef`/`@Filter` (e.g. `ownerFilter` with parameter `ownerId`) on entities (or on `BaseEntity` via a mapped filter) whose column is `created_by_user_id`.
- Enable the filter per request in an interceptor/aspect using the current user id from the security context, **only** when the user lacks the `VIEW_ALL_RECORDS` override.
- **Pros:** applies automatically to all queries against filtered entities (including `findAll`, derived queries, most JPQL) without touching each repository; centrally toggled. **Cons:** Hibernate filters don't apply to native SQL and need care with `find(id)` (they don't filter `EntityManager.find` by primary key — a direct GET-by-id must be guarded separately).

### Approach B — Explicit predicate via a shared helper (mirrors `BranchAccessService`)

- Build an `OwnershipScope` / `OwnershipAccessService` analogous to `BranchAccessService`: `currentOwnerId()`, `appliesToCurrentUser()`, `filterOwned(list, ownerExtractor)`, `ownedScopePredicate()` for pushing `created_by_user_id = :me` into queries.
- Add `...AndCreatedByUserId(...)` repository methods or Spring Data `Specification`s for list endpoints.
- **Pros:** explicit, easy to reason about, consistent with the existing branch pattern, works with native SQL when written in. **Cons:** must be wired into every list endpoint (like branch scoping was) — more touch points, easier to forget one.

### Approach C — Row-level security (RLS) in PostgreSQL

- Postgres RLS policies filter by a session variable (`current_setting('app.user_id')`) set per connection.
- **Pros:** enforced at the DB, impossible to bypass from app code. **Cons:** hard with a pooled `AuditorAware`/Hikari setup (must set the GUC per transaction), complicates admin overrides, heavy operational change, poor fit with the current multi-tenant-by-profile deployment. **Not recommended** as the primary mechanism.

**Recommendation: Approach A as the default automatic net + Approach B's explicit helper for list/report endpoints and GET-by-id guards.** The Hibernate filter catches everything by default; the explicit helper handles native queries, aggregates, and single-record access checks. This layered approach matches how branch scoping already works (automatic context + explicit `BranchAccessService`).

---

## 4. Recommended architecture

**A single, opt-in ownership layer that composes with branch scoping.**

### Building blocks
1. **`created_by_user_id BIGINT NULL` on `BaseEntity`** (new column via `@Column`, populated by an enhanced auditor). Add a second `AuditorAware<Long>` or a JPA entity-listener that stamps the current user id alongside the existing `created_by` username.
2. **`OwnershipContextHolder`** — per-request `ThreadLocal` holding `currentUserId` and `viewAllRecords` (whether the user has the override). Populated in `JwtFilter` from JWT claims (add `userId` — already extracted as `jwtUtil.extractUserId`) and a permission/role check.
3. **`OwnershipScope`** — static accessor mirroring `BranchScope`: `currentUserId()`, `applies()` (true when the user is ownership-restricted), `assertCanAccess(ownerId)`.
4. **`OwnershipAccessService`** — mirrors `BranchAccessService`: `filterOwned(...)`, `ownedListScope()`, repository predicate helpers, `assertRecordOwned(ownerId, label)`.
5. **Hibernate `@Filter ownerFilter`** enabled by an aspect/interceptor when `OwnershipScope.applies()` — the automatic safety net.
6. **`VIEW_ALL_RECORDS` permission** (in `security/Permission` + seeded in `RBACInitializer`) — users/roles with it bypass ownership filtering (admins, supervisors).

### Which entities get ownership filtering
- **Transactional aggregate roots** (opt-in per entity, likely config-driven): Sales Invoice, Quotation, Sales Order, Purchase Invoice/LPO/GRN, Payments, Receipts, Expense Vouchers, Journal Vouchers, Stock Transfers, Stock Takes, POS sessions/sales.
- **NOT filtered (shared reference data):** Products, Customers, Vendors, Departments, Brands, Units, Warehouses, Chart of Accounts, master/config data — everyone can reference them.
- **Children inherit from root** — never filter lines/payments independently.

### Composition with branch
Effective visibility for a restricted user = `branchPredicate AND ownershipPredicate`. Both are optional and independently toggled; a user may be branch-restricted, ownership-restricted, both, or neither.

---

## 5. Database / schema changes (design only — DO NOT create migrations now)

> Additive, nullable, Flyway-guarded — per the project's stale-schema convention.

1. **Add `created_by_user_id BIGINT NULL`** to every table backing an ownership-filtered entity (or, if implemented on `BaseEntity`, to all entity tables). Index it: `idx_<table>_created_by_user (created_by_user_id)`.
   - Consider a **composite index `(branch_id, created_by_user_id)`** on high-volume transactional tables since the two filters are applied together.
2. **Backfill** `created_by_user_id` from `created_by` username: `UPDATE t SET created_by_user_id = u.id FROM users u WHERE t.created_by = u.username AND t.created_by_user_id IS NULL;` (best-effort; unresolvable rows stay null).
3. **Seed `VIEW_ALL_RECORDS` permission** row (data seeder / `RBACInitializer`, not a schema change).
4. Null-owner rows: decide policy per §7 (recommend visible to `VIEW_ALL_RECORDS` holders only).

No columns dropped; `created_by` username retained for display/audit.

---

## 6. Backend changes

- **`BaseEntity`**: add `createdByUserId` field + getter/setter (nullable).
- **Auditing**: add an `AuditorAware<Long>` bean or a `@PrePersist` entity listener that resolves the current user id from the security context and stamps `createdByUserId`. (The username auditor stays as-is.)
- **`JwtFilter`**: populate `OwnershipContextHolder` with `userId` (already available via `jwtUtil.extractUserId`) and the `viewAll` flag (from a role/permission claim or a lookup).
- **New classes**: `OwnershipContextHolder`, `OwnershipScope`, `OwnershipAccessService` (parallel to the branch trio).
- **Hibernate filter**: `@FilterDef`/`@Filter` on `BaseEntity` (or per entity); an aspect enables it on the `EntityManager`/`Session` per request when restricted.
- **List endpoints/services**: for filtered domains, add ownership predicate via `OwnershipAccessService` (or rely on the Hibernate filter) — same touch-point set that branch scoping uses.
- **GET-by-id / edit / delete**: call `OwnershipScope.assertCanAccess(row.getCreatedByUserId())` (Hibernate filter does not guard `find(id)`).
- **Reports/dashboards**: apply ownership scope to aggregates for restricted users.
- **Feature toggle**: `ownership.filtering.enabled` (default false) + per-entity config, mirroring the `rbac.<module>.enabled` toggles, so it can roll out per tenant.

---

## 7. Frontend changes

- **Largely transparent** — lists simply return fewer rows for restricted users. No new plumbing required.
- **UX clarity**: show an indicator when a view is ownership-filtered ("Showing only records you created"). Avoid confusion where a user "can't find" a colleague's document.
- **Admin/supervisor toggle** (optional): for `VIEW_ALL_RECORDS` holders, a "My records / All records" switch on transaction lists.
- **Dashboards**: label KPIs as personal vs. company-wide when restricted.
- **Creation flows**: ensure lookups for master data (customers/products) are **not** ownership-filtered so users can still reference shared entities.

---

## 8. API changes

- **Backward compatible.** Existing list endpoints return an ownership-narrowed set for restricted users; admins/override-holders unaffected.
- Optional explicit param for override-holders: `?ownerScope=mine|all`.
- No new required request fields; ownership is derived server-side from the authenticated principal (never trust a client-supplied owner id for filtering).

---

## 9. Security considerations

- **Never trust client-supplied owner id.** Derive owner from the authenticated principal only (like branch is derived from validated JWT claims).
- **Guard GET-by-id explicitly** — Hibernate `@Filter` does not restrict primary-key `find()`, so a restricted user could otherwise fetch another user's record by guessing an id. Add `assertCanAccess` on single-record reads/writes.
- **Override must be a real permission**, seeded and checked server-side — not a client flag.
- **Composition with branch must be AND, not OR** — a bug that ORs them would leak other users' or other branches' data.
- **Audit**: ownership-restricted access attempts that are denied should flow through `security/AuditLogService` (respecting `rbac.audit.log-denied`).
- **Renames**: filtering on `created_by_user_id` (stable) avoids the security gap where a renamed user loses/gains visibility unexpectedly.

---

## 10. Performance considerations

- Ownership predicate is a single indexed equality (`created_by_user_id = :me`) — cheap. Add the composite `(branch_id, created_by_user_id)` index on hot transactional tables.
- Prefer **DB-pushed predicates** over Java-side `filterOwned` on large lists (consistent with the pagination/perf direction already established in the project).
- Hibernate filter adds a WHERE clause to generated SQL — negligible overhead, but verify it plays well with the existing pagination endpoints (LPO, Payments already server-paginated).
- Reports: ensure ownership predicate is inside the aggregate query, not applied after fetching all rows.

---

## 11. Migration strategy

1. **Phase 0 — additive schema.** Add nullable `created_by_user_id` + indexes; backfill from username. No behavior change.
2. **Phase 1 — stamping.** Enhance auditing to populate `created_by_user_id` on new writes. Deploy; verify population.
3. **Phase 2 — override permission.** Seed `VIEW_ALL_RECORDS`; grant to admin/supervisor roles.
4. **Phase 3 — filtering behind a flag.** Implement `OwnershipContextHolder`/`Scope`/`AccessService` + Hibernate filter; gate with `ownership.filtering.enabled` (default off).
5. **Phase 4 — enable per entity, per tenant.** Turn on for one transactional domain (e.g. POS sales) at one tenant; validate; expand.
6. **Phase 5 — reports/dashboards** respect ownership.
7. Legacy null-owner rows: visible to override-holders; decide per-entity whether restricted users see them (default: no).

Independently reversible via the toggle.

---

## 12. Risks and dependencies

- **Risk: locking users out of records they must act on** (multi-actor workflows). Mitigation: define the ownership policy per workflow (owner-only vs. owner+assignee) before enabling; start with domains that are genuinely single-owner (e.g. a cashier's POS sales).
- **Risk: children hidden from owner** if filtering applied below the root. Mitigation: filter only at aggregate roots; children inherit.
- **Risk: master data accidentally filtered**, making creation impossible. Mitigation: explicit allowlist of ownership-filtered entities; exclude all master/reference data.
- **Risk: GET-by-id leak** (Hibernate filter gap). Mitigation: explicit `assertCanAccess` on single-record access — this is mandatory.
- **Risk: username-based filtering brittleness.** Mitigation: filter on stable `created_by_user_id`.
- **Dependency: JWT already carries user id** (`jwtUtil.extractUserId`) — good, no token change needed.
- **Dependency: correct backfill** — unresolvable usernames (deleted users) stay null; define their visibility.

---

## 13. Step-by-step implementation plan

1. Decide ownership policy per workflow: owner-only vs. owner+assignees (Open question §14).
2. Additive Flyway migration: `created_by_user_id` + indexes + username backfill (guarded).
3. Add `createdByUserId` to `BaseEntity`; add `AuditorAware<Long>`/entity-listener stamping.
4. Add `VIEW_ALL_RECORDS` permission to `security/Permission` + seed in `RBACInitializer`; grant to admin/supervisor.
5. Build `OwnershipContextHolder`, `OwnershipScope`, `OwnershipAccessService`; populate context in `JwtFilter`.
6. Add Hibernate `@FilterDef`/`@Filter` + request aspect to enable it when restricted.
7. Add explicit `assertCanAccess` guards on GET-by-id / edit / delete for filtered domains.
8. Add feature toggle `ownership.filtering.enabled` + per-entity allowlist config.
9. Wire ownership predicate into list/report endpoints for the pilot domain (POS sales).
10. Frontend: "showing only your records" indicators; optional My/All toggle for override-holders.
11. QA at one tenant on the pilot domain; validate composition with branch scoping and admin override.
12. Roll out domain-by-domain, tenant-by-tenant via the toggle.

---

## 14. Open questions / clarifications

1. **Policy per workflow:** strictly owner-only, or owner + assignees + last-modifier? (Critical for multi-actor flows like sales→delivery→approval.)
2. **Which domains** get ownership filtering? (POS sales, quotations, expenses are natural fits; approvals/JVs are inherently multi-actor.)
3. **Override model:** a single `VIEW_ALL_RECORDS` permission, or per-module override (e.g. see-all-sales but only-own-expenses)?
4. **Null-owner (system) rows:** visible to whom? (Recommend override-holders only.)
5. **Supervisor hierarchy:** should a manager see their *team's* records (not just their own and not everyone's)? That would require a user→manager relationship and a hierarchical scope beyond simple ownership.
6. **Interaction with reports:** should company dashboards be hidden entirely for restricted users, or show only their contribution?
7. **Filter on `created_by_user_id` vs. username** — confirm the stable-id approach (recommended) despite the extra column/backfill.
8. **Editing others' records:** can an override-holder edit a restricted user's record, and does that change ownership? (Recommend: no ownership change; `updated_by` records the editor.)
