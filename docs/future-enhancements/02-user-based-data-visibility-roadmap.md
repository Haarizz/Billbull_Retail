# User-Based Data Visibility (Ownership Filtering) — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`02-user-based-data-visibility.md`](02-user-based-data-visibility.md) (Approach A Hibernate `@Filter` as automatic net + Approach B explicit helper for lists/reports/GET-by-id). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable** and leaves production behaviour unchanged until `ownership.filtering.enabled` is flipped per tenant.
> - Schema changes are **additive, nullable, type-guarded** per the stale-schema convention (`project_stale_schema_upgrade_hazard`). No column dropped/narrowed/NOT-NULL; `created_by` username retained.
> - Ownership composes with branch as **AND, never OR** — a bug that ORs them leaks other users' or other branches' data.
> - Filtering applies **only at aggregate roots**; children inherit visibility from the root and are never filtered independently.
> - **Master/reference data is never ownership-filtered** (products, customers, vendors, COA, departments/brands/units/warehouses) — filtering them makes creation impossible.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| `BaseEntity.createdBy` is a **username String**, not an id | ✅ | Confirmed in design §1 + README §5; `JpaAuditingConfig` `AuditorAware<String>` stamps username. Roadmap adds stable `created_by_user_id`. |
| Branch trio (`BranchContextHolder`/`BranchScope`/`BranchAccessService`) exists to mirror for ownership | ✅ | `settings/branch/BranchAccessService.java` present with `ListScope`, `currentListScope()`, `canAccessBranch()`. Ownership classes parallel these. |
| JWT already carries user id (`jwtUtil.extractUserId`) | ⚠️ confirm in Phase 0 | Design §6 asserts it; verify the claim is populated before relying on it in `JwtFilter`. |
| Next Flyway version | ⚠️ | Design docs reference "V30"; tree is at **V33**. New migration is **V34** (coordinate numbering if topics land concurrently). |
| RBAC `Permission`/`RBACInitializer` seeding path for `VIEW_ALL_RECORDS` | ✅ (per design §6) | Confirm the seeder signature in Phase 2. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Pre-flight: policy decisions + JWT/claim audit | No | n/a | S |
| 1 | Additive schema: `created_by_user_id` + indexes + backfill | No | n/a | S |
| 2 | Stamping + `VIEW_ALL_RECORDS` permission seed | No (data + permission) | No | M |
| 3 | Ownership context/scope/service trio + Hibernate filter (dormant) | No (dormant) | Yes (off) | M |
| 4 | GET-by-id / edit / delete guards for pilot domain | Yes (behind toggle) | Yes | M |
| 5 | List-endpoint ownership predicate — pilot domain (POS sales) | Yes (behind toggle) | Yes | M |
| 6 | Reports & dashboards respect ownership | Yes (behind toggle) | Yes | M |
| 7 | Frontend "your records" indicators + My/All toggle | Yes (cosmetic) | Follows toggle | S |
| 8 | Per-tenant, per-domain rollout | Yes (opt-in) | Flip | S |
| 9 | Expand domain-by-domain | Yes (opt-in) | Flip | M (recurring) |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+ (one engineer, incl. tests).

---

## Phase 0 — Pre-flight: policy decisions + JWT/claim audit

**Objective.** Resolve the two decisions that shape the whole build (ownership policy per workflow; override model) and confirm the JWT carries what we need. No code ships.

**Scope.** Written decisions + a read-only claim audit.

**Files/modules affected.** None (audit of `config/JwtFilter`, `JwtUtil`, `JpaAuditingConfig`).

**Database changes.** None. Diagnostics: count rows per candidate table whose `created_by` **won't** resolve to a `users.username` (unresolvable backfill), and count null-`created_by` (system) rows.

**Backend changes.** None.

**Frontend changes.** None.

**API changes.** None.

**Risks.** Building before the policy (§14.1 owner-only vs. owner+assignee) is set → rework in multi-actor domains. Mitigation: this phase is the gate; the pilot domain (POS sales) is deliberately single-owner so Phase 4–5 can proceed even if multi-actor policy is still open.

**Testing checklist.**
- [ ] `jwtUtil.extractUserId` returns a real user id from a live token (not null).
- [ ] Unresolvable-`created_by` row counts captured per candidate table.
- [ ] Null-`created_by` (system) row policy decided (recommend: override-holders only).
- [ ] Ownership policy per pilot domain confirmed = owner-only.

**Estimated complexity.** S.

**Dependencies.** None.

**Exit criteria.** Signed decisions on §14.1 (policy), §14.3 (override model), §14.4 (null-owner visibility); confirmation the JWT carries user id.

---

## Phase 1 — Additive schema: `created_by_user_id` + indexes + backfill

**Objective.** Land the stable owner column and populate it. Zero behaviour change.

**Scope.** One Flyway migration + `BaseEntity` field.

**Files/modules affected.**
- `.../db/migration/V34__created_by_user_id.sql` (new).
- `common/BaseEntity.java` — add nullable `createdByUserId` + getter/setter.

**Database changes.**
- `ADD COLUMN created_by_user_id BIGINT NULL` on ownership-filtered tables (or all `BaseEntity` tables if implemented on the base — decide scope in Phase 0; recommend all, cheap and future-proof), guarded.
- Index `idx_<table>_created_by_user (created_by_user_id)`; composite `(branch_id, created_by_user_id)` on high-volume transactional tables (both filters apply together).
- Backfill: `UPDATE t SET created_by_user_id = u.id FROM users u WHERE t.created_by = u.username AND t.created_by_user_id IS NULL;` (best-effort; unresolvable rows stay null).
- Column stays **nullable** forever.

**Backend changes.** `BaseEntity` field only, no logic.

**Frontend changes.** None.

**API changes.** None.

**Risks.** Backfill scope/perf across many tables. Mitigation: guarded, batched where large (Phase 0 sizing); unresolvable rows tolerated as null.

**Testing checklist.**
- [ ] Migration idempotent; re-run is a no-op.
- [ ] Backfill populates rows whose `created_by` matches a username; leaves others null.
- [ ] `mvn -o compile` + Hibernate boots clean.
- [ ] Existing queries unaffected (unit suite green).

**Estimated complexity.** S.

**Dependencies.** Phase 0.

**Exit criteria.** Column + indexes present on staging; backfill counts match Phase 0 prediction; no behaviour change.

---

## Phase 2 — Stamping + `VIEW_ALL_RECORDS` permission seed

**Objective.** New writes carry `created_by_user_id`; the override permission exists and is granted to admins/supervisors. Still no filtering.

**Scope.** Auditing + RBAC seed.

**Files/modules affected.**
- `config/JpaAuditingConfig.java` — add `AuditorAware<Long>` bean **or** a `@PrePersist` entity listener stamping the current user id (username auditor stays as-is).
- `security/Permission` + `security/RBACInitializer.java` — add + seed `VIEW_ALL_RECORDS`; grant to admin/supervisor roles.

**Database changes.** None (permission is seeded data).

**Backend changes.** Stamping only + permission bootstrap. Null-safe: unauthenticated/system writes stamp null.

**Frontend changes.** None.

**API changes.** None.

**Risks.** Missing the stamp on a write path that bypasses JPA auditing. Mitigation: prefer the entity-listener on `BaseEntity` (catches all persists) over per-service wiring; reconciliation query flags new null-owner rows written by an authenticated principal.

**Testing checklist.**
- [ ] Unit: new entity persisted under an authenticated principal → `createdByUserId` set.
- [ ] Unit: system/unauthenticated write → null, no throw.
- [ ] `VIEW_ALL_RECORDS` seeded idempotently; admin/supervisor roles hold it.
- [ ] Existing `RBACInitializer` bootstrap still green.

**Estimated complexity.** M.

**Dependencies.** Phase 1.

**Exit criteria.** Soak window on staging: 100% of authenticated writes carry a correct owner id; permission present and granted; no filtering yet.

---

## Phase 3 — Ownership context/scope/service trio + Hibernate filter (dormant)

**Objective.** Build `OwnershipContextHolder`, `OwnershipScope`, `OwnershipAccessService`, the Hibernate `@Filter`, and the toggle — all dormant. Nothing enforces yet.

**Scope.** New classes mirroring the branch trio + config.

**Files/modules affected.**
- New: `OwnershipContextHolder`, `OwnershipScope`, `OwnershipAccessService` (parallel to `BranchContextHolder`/`BranchScope`/`BranchAccessService`).
- `config/JwtFilter.java` — populate ownership context (userId + `viewAll` flag from permission/role).
- `common/BaseEntity` (or per entity) — `@FilterDef`/`@Filter ownerFilter(ownerId)`.
- An aspect/interceptor enabling the filter on the `Session` when `OwnershipScope.applies()`.
- `application.properties` — `ownership.filtering.enabled=false` + per-entity allowlist config.

**Database changes.** None.

**Backend changes.** Context population + dormant filter + resolver that returns the ownership predicate **only when toggle on and user lacks override**. No list/GET wiring yet.

**Frontend changes.** None.

**API changes.** None.

**Risks.** Hibernate `@Filter` gotchas: does not apply to native SQL and does **not** filter `EntityManager.find(id)` — so it is a *net*, not a guarantee. Documented here so Phase 4 adds explicit GET-by-id guards. Mitigation: treat the filter as defence-in-depth, explicit predicate/guard as the real enforcement.

**Testing checklist.**
- [ ] Unit: toggle off → resolver reports "unscoped"; override-holder → "unscoped"; restricted user → owner predicate.
- [ ] Filter enabled on Session only when restricted (aspect unit test).
- [ ] `mvn -o test` green; grep confirms no list/GET caller yet.

**Estimated complexity.** M.

**Dependencies.** Phase 2.

**Exit criteria.** Trio + filter + toggle merged, unit-tested, dormant; no runtime behaviour change.

---

## Phase 4 — GET-by-id / edit / delete guards for pilot domain

**Objective.** Single-record access to pilot-domain (POS sales) records is guarded by ownership — closing the Hibernate-filter `find(id)` gap. Behind the toggle.

**Scope.** Pilot-domain controllers/services single-record paths.

**Files/modules affected.**
- POS sales GET-by-id / edit / delete endpoints (`pos/checkout` / sales-invoice read paths for POS sales).

**Database changes.** None.

**Backend changes.** Add `OwnershipScope.assertCanAccess(row.getCreatedByUserId())` on single-record read/write when toggle on + restricted. Override-holders bypass. Composes with the existing branch `assertTransactionBranchAccessible` (both must pass).

**Frontend changes.** None.

**API changes.** GET-by-id returns 403/404 for a non-owned pilot record under toggle (choose 404 to avoid id-enumeration leakage).

**Risks.** **GET-by-id leak** is the headline security risk of this whole feature (design §9/§12). Mitigation: this phase is mandatory before any list scoping is enabled; test explicitly that a restricted user cannot fetch another user's record by id.

**Testing checklist.**
- [ ] Restricted user GET own record → 200; GET other's → 404 (toggle on).
- [ ] Override-holder GET any → 200.
- [ ] Toggle off → unchanged (any accessible record fetchable).
- [ ] Edit/delete of non-owned record blocked for restricted user.
- [ ] Branch AND ownership both enforced (non-owned + other-branch → still blocked).

**Estimated complexity.** M.

**Dependencies.** Phase 3.

**Exit criteria.** No GET-by-id leak demonstrable for the pilot domain under toggle; override-holders unaffected.

---

## Phase 5 — List-endpoint ownership predicate — pilot domain (POS sales)

**Objective.** Pilot-domain lists return only the current user's records (restricted users), composing with branch.

**Scope.** Pilot-domain list/search services.

**Files/modules affected.**
- POS sales list/search service + repository (add `...AndCreatedByUserId(...)` or `Specification`, DB-pushed).

**Database changes.** None (uses Phase-1 indexes).

**Backend changes.** Push `created_by_user_id = :me` into the list query when toggle on + restricted; rely on the Hibernate filter as backup. Compose with the existing branch `ListScope` predicate as **AND**. Children (sale lines/payments) inherit — never filtered independently.

**Frontend changes.** None yet (indicator in Phase 7).

**API changes.** Pilot list narrowed for restricted users under toggle; optional `?ownerScope=mine|all` for override-holders. Owner derived server-side only — never trust a client owner id.

**Risks.** Composing predicates wrong (OR instead of AND) → cross-user/branch leak. Mitigation: a dedicated composition test asserting both narrow simultaneously; prefer DB predicate over Java-side `filterOwned` on large lists (per `pagination_perf`).

**Testing checklist.**
- [ ] Restricted user sees only own pilot records (+ branch scope).
- [ ] Override-holder sees all (subject to branch).
- [ ] Toggle off → identical to today.
- [ ] Branch AND owner both applied (control set across 2 users × 2 branches).
- [ ] Children of an owned root fully visible even if child written by system/another user.

**Estimated complexity.** M.

**Dependencies.** Phase 3, Phase 4.

**Exit criteria.** Pilot list correctly ownership+branch scoped on a control set; index-backed; no OR-leak.

---

## Phase 6 — Reports & dashboards respect ownership

**Objective.** Aggregates/KPIs reflect only the restricted user's contribution; override-holders see company-wide.

**Scope.** Pilot-domain report/dashboard aggregates.

**Files/modules affected.**
- Dashboard/report services touching pilot-domain totals.

**Database changes.** None.

**Backend changes.** Push ownership predicate **inside** the aggregate query (not post-fetch) when restricted. Preserve unscoped path for override-holders.

**Frontend changes.** Label KPIs personal vs. company-wide when restricted (copy in Phase 7).

**API changes.** Report/dashboard numbers narrow for restricted users under toggle.

**Risks.** A cashier inferring others' sales from an un-scoped total (design §6.6). Mitigation: ownership predicate inside the SQL aggregate; test the total equals sum of only-owned rows.

**Testing checklist.**
- [ ] Restricted dashboard total = sum of own rows only.
- [ ] Override-holder total = company-wide (unchanged).
- [ ] Toggle off → unchanged.

**Estimated complexity.** M.

**Dependencies.** Phase 5.

**Exit criteria.** Restricted aggregates match a hand-computed owned-only control number; override path unchanged.

---

## Phase 7 — Frontend "your records" indicators + My/All toggle

**Objective.** Make ownership filtering legible; give override-holders a My/All switch.

**Scope.** Pilot-domain list + dashboard UI.

**Files/modules affected.** Pilot-domain list pages + dashboard; ensure master-data lookups (customers/products) are **not** ownership-filtered so creation stays possible.

**Database changes.** None. **Backend changes.** None (consumes `?ownerScope`).

**Frontend changes.**
- "Showing only records you created" indicator on restricted lists.
- My/All toggle for override-holders (wired to `?ownerScope`).
- Dashboard KPI labels personal vs. company-wide.

**API changes.** None.

**Risks.** Users "can't find" a colleague's document and think it's a bug. Mitigation: the indicator is the fix; gate copy on the tenant toggle state.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green.
- [ ] Indicator shows for restricted user; hidden for override-holder.
- [ ] My/All toggle flips the list for override-holders.
- [ ] Master-data lookups return all (not owner-filtered) in a creation flow.

**Estimated complexity.** S.

**Dependencies.** Phases 5–6.

**Exit criteria.** UI accurately reflects scope in both toggle states; creation flows unimpeded.

---

## Phase 8 — Per-tenant, per-domain rollout (pilot)

**Objective.** Enable ownership filtering for POS sales at one pilot tenant; validate composition with branch + override.

**Scope.** Config + validation.

**Files/modules affected.** Per-tenant `application-<client>.properties` — `ownership.filtering.enabled=true` + pilot-domain allowlist.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Locking a user out of a record they must act on (multi-actor). Mitigation: pilot is single-owner POS sales; reversible via toggle.

**Testing checklist (before flip).**
- [ ] Restricted cashier sees only own sales; supervisor sees all.
- [ ] GET-by-id leak absent.
- [ ] Branch AND ownership both hold.
- [ ] Master data referenceable.
- [ ] Rollback rehearsed (toggle off → all-visible).

**Estimated complexity.** S.

**Dependencies.** Phases 4–7.

**Exit criteria.** Pilot validated + signed off; rollout runbook written.

---

## Phase 9 — Expand domain-by-domain

**Objective.** Extend ownership filtering to additional single-owner-friendly domains (quotations, expenses), one at a time.

**Scope.** Per new domain: repeat Phases 4–6 (guards, list predicate, aggregates) behind the per-entity allowlist.

**Risks.** Multi-actor domains (sales→delivery→approval, JVs) need the §14.1 policy resolved first; do not add them until owner+assignee policy is decided. Approvals/JVs are inherently multi-actor — likely **excluded**.

**Testing checklist.** Per domain: guard/list/aggregate tests as Phases 4–6; multi-actor policy honored where applicable.

**Estimated complexity.** M (recurring, per domain).

**Dependencies.** Phase 8; §14.1 policy for any multi-actor domain.

**Exit criteria.** Each added domain validated per tenant; multi-actor domains gated on policy sign-off.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §14) | Needed by | Recommended default |
|---|---|---|
| §14.1 Policy: owner-only vs. owner+assignees+last-modifier | Phase 9 (multi-actor domains); pilot is owner-only | Owner-only for single-actor domains; owner+assignee for multi-actor — decide per domain |
| §14.3 Override model: single `VIEW_ALL_RECORDS` vs. per-module | Phase 2 | Single permission first; per-module later if needed |
| §14.4 Null-owner (system) row visibility | Phase 0/2 | Override-holders only |
| §14.2 Which domains get filtering | Phase 5 (pilot) / Phase 9 | POS sales pilot; then quotations, expenses; exclude approvals/JVs |
| §14.5 Supervisor-sees-team (hierarchy) | Deferred | Out of scope v1 (needs user→manager relation) |
| §14.7 Filter on stable id vs. username | Phase 1 | Stable `created_by_user_id` (recommended) |
| §14.8 Override-holder editing others' records changes ownership? | Phase 4 | No ownership change; `updated_by` records editor |

---

## Cross-cutting testing strategy

- **Toggle-off invariance** — every backend phase (3–6, 9) proves byte-identical output with `ownership.filtering.enabled=false`. This is what makes each phase independently deployable.
- **AND-composition test** — a standing test asserting branch and ownership narrow simultaneously (never OR), across 2 users × 2 branches. The single highest-value regression guard (leak prevention).
- **GET-by-id leak test** — restricted user cannot fetch a non-owned record by id (Hibernate-filter gap coverage), per filtered domain.
- **Children-inherit test** — an owned root's children are fully visible regardless of who/what wrote them.
- **Master-data-not-filtered test** — customer/product lookups return all rows in a creation flow.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 7.
