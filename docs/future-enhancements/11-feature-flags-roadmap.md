# Feature Flags — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`11-feature-flags.md`](11-feature-flags.md) (build a **DB-backed feature-flag store** with a precedence-based `FeatureFlagService` that **falls back to the existing `*.enabled` properties** so day-one behaviour is identical; layer on granular targeting, a management UI, audit, and an emergency kill-switch, backed by Caffeine for O(1) checks; reserve self-hosted Unleash for future heavy experimentation). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - **Property fallback is sacred.** When no DB rule/definition exists, evaluation returns exactly the matching `*.enabled` property — day-one behaviour is byte-identical, and `featureflags.enabled=false` reverts to pure property behaviour.
> - **Default-safe** — a misconfigured or missing flag falls back to its safe default; a bad flag change must never break the app.
> - **Precedence is deterministic and tested** — user > branch > role > % bucket(hash(userId)) > tenant > global default. A stable hash means a user never flips buckets between requests.
> - **Flags gate features, not authorization** — permission-type flags must never weaken RBAC.
> - Schema changes are **additive, per-tenant, Flyway-guarded**; the evaluated-flags endpoint returns only resolved booleans (never leaks rule internals).

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| ~14 static `*.enabled` property toggles (`rbac.*`, `spring.flyway.enabled`, etc.); only `tally` off | ✅ (CLAUDE.md + design §1) | These become the fallback/default layer. |
| Per-tenant profile override (`application-{client}.properties`) | ✅ (CLAUDE.md) | Flags are already tenant-specific at deploy time. |
| `PermissionContext` exists on frontend to mirror for `FeatureFlagContext` | ✅ (CLAUDE.md `context/PermissionContext`) | `FeatureFlagContext` + `useFeatureFlag` parallel it. |
| Caffeine cache available for O(1) checks | ⚠️ dependency | Needs Topic 10 Phase 1 (or a temporary local cache). |
| Audit hooks for flag changes | ⚠️ dependency | Ties Topic 04 (`logSettingsChange`/`logDomainEvent`). |
| Next Flyway version | ⚠️ | Docs say "V30"; tree at **V33** → new migration **V34**. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Precedence + scope + migration-policy decisions | No | n/a | S |
| 1 | Schema + `FeatureFlagService` with property fallback (identical behaviour) | No | Yes (master switch) | M |
| 2 | Seed definitions from existing `*.enabled` toggles | No (defaults preserved) | No | S |
| 3 | Evaluated-flags endpoint + `FeatureFlagContext`/`useFeatureFlag` | Yes (frontend gating available) | No | M |
| 4 | Management UI + audit + emergency kill-switch | Yes | Follows | L |
| 5 | Granular targeting (tenant/role/branch/user/%) | Yes | Per-rule | M |
| 6 | Caffeine-backed evaluation cache + tuning | No (perf) | Config | S |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Precedence + scope + migration-policy decisions

**Objective.** Confirm precedence order, whether existing `rbac.*` toggles migrate into the system, whether A/B experimentation is needed, and which flags are permission-adjacent. No code.

**Scope.** Written decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Ambiguous precedence → non-deterministic evaluation. Mitigation: this phase locks the order before Phase 1.

**Testing checklist.**
- [ ] Precedence order confirmed (user > branch > role > % > tenant > global) (§16.2).
- [ ] Existing `rbac.*.enabled` migrate as defaults + keep fallback? (§16.3).
- [ ] A/B experimentation needed, or just rollout/kill-switch? (§16.4).
- [ ] Which flags are permission-adjacent (RBAC-integrated vs. pure UI gating)? (§16.5).
- [ ] Unleash vs. build (§16.1) — default build.

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §16.1–16.5.

---

## Phase 1 — Schema + `FeatureFlagService` with property fallback

**Objective.** Land the flag store + evaluation service whose behaviour is **identical to today** because it falls back to `*.enabled` properties when no rule exists.

**Scope.** Schema + service + master switch.

**Files/modules affected.**
- `.../db/migration/V34__feature_flags.sql` (new): `feature_flag` (key, description, default_enabled, depends_on, type), `feature_flag_rule` (flag_key, scope, scope_value, enabled, rollout_percent, priority) — additive, guarded; indexes on `flag_key`, `(flag_key, scope, scope_value)`.
- New `FeatureFlag`/`FeatureFlagRule` entities; `FeatureFlagService.isEnabled(key, context)` with precedence resolution + **property fallback**.
- `application.properties` — `featureflags.enabled` master switch, cache TTL.

**Database changes.** Two additive tables + indexes.

**Backend changes.** Evaluation: rules by precedence → % bucket(hash(userId)) → tenant → **fallback to matching `*.enabled` property** if no rule/definition. Context = user/role/branch from `BranchContextHolder` + security context. Default-safe on any gap. With no rules seeded, every check returns the property value — behaviour identical.

**Frontend/API changes.** None yet.

**Risks.** A resolution bug flipping a flag off/on unexpectedly. Mitigation: exhaustive precedence unit tests; property fallback proven identical; `featureflags.enabled=false` bypasses entirely.

**Testing checklist.**
- [ ] Migration idempotent; tables + indexes created.
- [ ] With no rules: `isEnabled(key)` returns exactly the `*.enabled` property value for every existing toggle.
- [ ] Precedence resolution unit-tested across all scopes.
- [ ] % bucket stable for a given userId across calls.
- [ ] `featureflags.enabled=false` → pure property behaviour.
- [ ] `mvn -o test` green.

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** Service + schema merged; behaviour byte-identical to property-only; precedence + stable-bucket proven.

---

## Phase 2 — Seed definitions from existing `*.enabled` toggles

**Objective.** Import the ~14 existing toggles as flag definitions with their current defaults — no behaviour change.

**Scope.** Seeder.

**Files/modules affected.** A flag seeder (like `RBACInitializer`) creating `feature_flag` rows for each `*.enabled` key with `default_enabled` = current value (`tally` off, rest on).

**Database changes.** Seed data only.

**Backend changes.** Seed on startup, idempotent. No rules created → evaluation still equals property value.

**Frontend/API changes.** None.

**Risks.** Seeded default diverging from the property. Mitigation: seed `default_enabled` directly from the property value; a test asserting parity.

**Testing checklist.**
- [ ] Each `*.enabled` toggle has a `feature_flag` row with matching default.
- [ ] Seeding idempotent.
- [ ] Evaluation unchanged (definitions present, no rules).

**Estimated complexity.** S. **Dependencies.** Phase 1.

**Exit criteria.** Existing toggles represented as definitions; behaviour unchanged.

---

## Phase 3 — Evaluated-flags endpoint + `FeatureFlagContext`/`useFeatureFlag`

**Objective.** Give the SPA a unified flag source for show/hide — mirroring `PermissionContext`.

**Scope.** Endpoint + frontend context/hook.

**Files/modules affected.** `GET /api/feature-flags/evaluated` (resolved boolean map for current user/branch); frontend `FeatureFlagContext` + `useFeatureFlag(key)` hook; gate components/routes/menu items.

**Database changes.** None.

**Backend changes.** Bulk-evaluate flags once per request/session; return **only resolved booleans** (never rules/definitions the user shouldn't see).

**Frontend changes.** Context + hook; begin gating UI on flags.

**API changes.** `GET /api/feature-flags/evaluated` (new).

**Risks.** Leaking flag/rule internals via the endpoint. Mitigation: return only booleans; a test that no rule metadata is exposed.

**Testing checklist.**
- [ ] Endpoint returns resolved booleans for the current context; no rule internals.
- [ ] `useFeatureFlag(key)` gates a component correctly.
- [ ] Frontend/backend agree on the same flag state.
- [ ] `npm run build` + `npm run lint` green.

**Estimated complexity.** M. **Dependencies.** Phase 1.

**Exit criteria.** SPA gates UI from a unified evaluated-flags source consistent with the backend.

---

## Phase 4 — Management UI + audit + emergency kill-switch

**Objective.** Admins manage flags at runtime, changes are audited, and an emergency disable exists.

**Scope.** Admin CRUD + UI + audit + kill-switch.

**Files/modules affected.** `FeatureFlagController` (evaluate + admin CRUD `GET/POST/PUT/DELETE /api/feature-flags` + `/rules`); management UI (list flags, per-scope rules, % rollout slider, emergency-disable, dependency view); audit hooks (Topic 04); dependency validation.

**Database changes.** None.

**Backend changes.** Admin CRUD gated by `FEATURE_FLAG_ADMIN` permission; every change audited (Topic 04); dependency validation (can't enable a flag whose prerequisite is off). Emergency disable = a GLOBAL rule `enabled=false` at highest priority (instant kill without restart).

**Frontend changes.** Management UI.

**API changes.** Admin flag/rule endpoints.

**Risks.** A bad flag change breaking features. Mitigation: default-safe fallback + audit + emergency disable; dependency validation.

**Testing checklist.**
- [ ] Admin CRUD gated by `FEATURE_FLAG_ADMIN`.
- [ ] Every change audited.
- [ ] Emergency GLOBAL disable overrides all lower-priority rules instantly (post-cache-evict).
- [ ] Dependency validation blocks enabling a flag with an off prerequisite.
- [ ] `npm run build` + `npm run lint` green.

**Estimated complexity.** L. **Dependencies.** Phase 1/3; Topic 04 (audit).

**Exit criteria.** Runtime flag management with audit, dependency safety, and a working emergency kill-switch.

---

## Phase 5 — Granular targeting (tenant/role/branch/user/%)

**Objective.** Enable the granular targeting the property system can't do — gradual rollout, cohorts, per-branch/user.

**Scope.** Rule authoring + evaluation across scopes.

**Files/modules affected.** `FeatureFlagRule` authoring in the UI; evaluation already supports scopes (Phase 1) — validate each end-to-end.

**Database changes.** None.

**Backend changes.** Exercise all scopes: GLOBAL/TENANT/ROLE/BRANCH/USER/PERCENTAGE; % via stable hash. Introduce granular rules gradually.

**Frontend changes.** Rule editor per scope; % slider.

**API changes.** None new.

**Risks.** % rollout instability (user flipping buckets). Mitigation: stable hash(userId); a test that the same user stays in-bucket across requests.

**Testing checklist.**
- [ ] Each scope rule evaluated per precedence.
- [ ] % rollout: same user consistently in/out of the cohort.
- [ ] Branch/user/role targeting works with the real context.
- [ ] Precedence conflicts resolve deterministically.

**Estimated complexity.** M. **Dependencies.** Phase 4.

**Exit criteria.** Granular + % targeting validated; rollout stable per user.

---

## Phase 6 — Caffeine-backed evaluation cache + tuning

**Objective.** Make flag checks O(1) with short TTL + evict-on-change; instant kill-switch propagation.

**Scope.** Evaluation cache.

**Files/modules affected.** `FeatureFlagService` evaluation cache (Caffeine, per (key, user/branch), short TTL, evict on flag change) — reuses Topic 10 Caffeine manager.

**Database changes.** None.

**Backend changes.** Cache evaluated values; **evict on any flag/rule change** so a kill-switch takes effect immediately (short TTL as backstop). Metrics via Micrometer.

**Frontend/API changes.** None.

**Risks.** Cache staleness delaying a kill-switch. Mitigation: explicit evict on change + short TTL (design §14).

**Testing checklist.**
- [ ] Flag check served from cache (hit-rate visible).
- [ ] Flag change evicts cache → kill-switch effective immediately.
- [ ] Per (key, user/branch) keying (no cross-user/branch bleed).

**Estimated complexity.** S. **Dependencies.** Phase 1; Topic 10 (Caffeine).

**Exit criteria.** Flag checks O(1) + cached; kill-switch propagates immediately on change.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §16) | Needed by | Recommended default |
|---|---|---|
| §16.1 Unleash vs. build DB-backed store | Phase 0/1 | Build (reuse/on-prem fit) |
| §16.2 Precedence order | Phase 1 | user > branch > role > % > tenant > global |
| §16.3 Migrate `rbac.*` toggles or keep as-is | Phase 0/2 | Import as defaults, keep property fallback |
| §16.4 A/B experimentation needed? | Phase 5 | Rollout/kill-switch first; A/B deferred |
| §16.5 Permission-adjacent flags (RBAC integration) | Phase 0/4 | Flags gate features only; never bypass RBAC |

---

## Cross-cutting testing strategy

- **Property-fallback invariance** — a standing test that, with no rules seeded, `isEnabled(key)` equals the `*.enabled` property for every existing toggle, and `featureflags.enabled=false` fully reverts. The core "day-one identical" guard.
- **Precedence determinism** — every scope combination resolves to one deterministic result; documented + table-tested.
- **Stable % bucketing** — the same userId stays in/out of a cohort across requests (hash-based, no per-request randomness).
- **Kill-switch immediacy** — a GLOBAL disable + cache evict takes effect without restart and overrides all lower-priority rules.
- **No-leak endpoint** — `/evaluated` returns only booleans, never rule/definition internals.
- **RBAC-not-weakened** — permission-adjacent flags never grant access RBAC would deny.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phases 3–4.
