# Topic — Feature Flags

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: design a feature-flag system for tenant/branch/user/role scoping, beta features, gradual rollout, emergency disable, A/B testing, and config management.

---

## 1. Current system behavior / existing analysis

The project already has **static, property-based feature toggles** — a proto-feature-flag system:
- **~14 `*.enabled` toggles** in `application.properties`: `rbac.enabled`, `rbac.user-management.enabled`, `rbac.hr.enabled`, `rbac.customer.enabled`, `rbac.finance.enabled`, `rbac.inventory/purchases/sales/dashboard/notification/tally.enabled`, plus `rbac.audit.log-allowed/denied`, `spring.flyway.enabled`, etc. Only `tally` defaults off.
- **Per-tenant override mechanism exists:** one Spring profile per client (`application-{client}.properties`) overrides base properties — so features are **already tenant-specific at deploy time**.
- **RBAC/`ModulePermissionService`** gates module access per role — a form of role-scoped feature gating.
- **Thresholds as config:** `financials.jv.approval-threshold-aed` etc.

**What exists = static, deploy-time, tenant-level flags.** **What's missing = dynamic, runtime, granular (branch/user/role/%) flags with a management UI.**

## 2. Missing functionality

- **Runtime toggling** — flags require a property change + redeploy/restart; no live flip.
- **Granularity** — no branch-specific, user-specific, role-specific, or percentage (gradual-rollout) targeting.
- **Beta / A-B / gradual rollout** — no cohort/percentage bucketing.
- **Emergency kill-switch** at runtime (must restart today).
- **Management UI** — flags edited in `.properties` files by ops.
- **Feature dependencies** — no declared prerequisites between flags.
- **Frontend awareness** — the SPA has no unified flag source to show/hide UI.

## 3. Challenges and edge cases

1. **Precedence** across scopes: global < tenant < role < branch < user < percentage. Need deterministic resolution.
2. **Consistency of % rollout** — a user must get a stable bucket (hash on userId) so they don't flip between requests.
3. **Runtime updates** without restart → DB-backed flags + cache with invalidation (Topic 06/10).
4. **Frontend/backend agreement** — both must evaluate the same flag state; expose an evaluated-flags endpoint.
5. **Multi-tenant** — flags live per-tenant DB (fits existing model); some flags may be global defaults.
6. **Safety** — a bad flag change shouldn't break the app; default-safe fallbacks + audit of changes (Topic 04).
7. **Backward compatibility** with existing `*.enabled` properties — must coexist, not break.
8. **Performance** — flag checks happen everywhere; must be O(1) cached.

## 4. Possible implementation approaches

| Option | Fit | Pros | Cons |
|---|---|---|---|
| **DB-backed flag store + evaluation service + cache (RECOMMENDED)** | High | Runtime toggling, granular targeting, per-tenant, management UI, no external infra; layers over existing property toggles | Build effort; must cache well |
| **Spring Cloud Config / Consul** | Medium | Centralized dynamic config | New infra; weak on user/%-targeting |
| **External flag SaaS (LaunchDarkly/Unleash/Flagsmith)** | Medium | Rich targeting, %, A/B, UI, SDKs | External dependency/cost; on-prem tenants; per-tenant setup; Unleash self-host is closest fit |
| **Keep property toggles only** | Low | Zero effort | No runtime/granular control |

**Recommendation:** **DB-backed flag store** with an evaluation service, cache, audit, and management UI — layered so existing `*.enabled` properties remain the **default/fallback**. Consider self-hosted **Unleash** only if a turnkey %-rollout/A-B engine with SDKs is strongly desired.

## 5. Recommended architecture

- **`FeatureFlag`** (definition): `key`, `description`, `defaultEnabled`, `dependsOn` (prerequisite keys), `type` (RELEASE/OPS/EXPERIMENT/PERMISSION).
- **`FeatureFlagRule`** (targeting): `flagKey`, scope (GLOBAL/TENANT/ROLE/BRANCH/USER/PERCENTAGE), `scopeValue`, `enabled`, `rolloutPercent`, `priority`.
- **`FeatureFlagService.isEnabled(key, context)`** where `context` = current user/role/branch (from `BranchContextHolder` + security context). Resolution: evaluate rules by precedence (user > branch > role > % bucket(hash(userId)) > tenant > global default); **fallback to the matching `*.enabled` property** if no rule/definition exists (backward compatible).
- **Cache** evaluated results (Caffeine, Topic 10) with invalidation on flag change; **runtime updates** flip behavior without restart.
- **Audit** every flag change (Topic 04). **Emergency disable** = set a GLOBAL rule `enabled=false` at highest priority.
- **Frontend**: `GET /api/feature-flags/evaluated` returns the resolved flag map for the current user/branch; a `FeatureFlagContext` (like `PermissionContext`) drives UI show/hide and a `useFeatureFlag(key)` hook.

## 6. Database / schema impact (design only)

- New tables `feature_flag`, `feature_flag_rule` (additive, per-tenant, Flyway-guarded). Indexes on `flag_key`, `(flag_key, scope, scope_value)`. No changes to existing config.

## 7. Backend changes

- `FeatureFlagService` + evaluation + Caffeine cache + property fallback.
- `FeatureFlagController` (evaluate + admin CRUD).
- Optional `@FeatureFlag("key")` method guard / `assertEnabled(key)` helper.
- Audit hooks on changes; dependency validation (can't enable a flag whose prerequisite is off).

## 8. Frontend changes

- `FeatureFlagContext` + `useFeatureFlag(key)` hook; gate components/routes/menu items.
- Admin **management UI**: list flags, per-scope rules, % rollout slider, emergency-disable, dependency view.

## 9. API changes

- `GET /api/feature-flags/evaluated` (current context), admin `GET/POST/PUT/DELETE /api/feature-flags` + `/rules`. Backward compatible.

## 10. Security considerations

- Flag admin gated by a `FEATURE_FLAG_ADMIN` permission (RBAC); changes audited (Topic 04).
- Evaluated-flags endpoint must not leak flags/rules the user shouldn't know (return only resolved booleans).
- Permission-type flags must not weaken RBAC (flags gate features, not authorization bypass).

## 11. Performance considerations

- Flag checks are hot → cache evaluated values per (key, user/branch) with short TTL + evict on change (Caffeine, Topic 10).
- Percentage bucketing via stable hash (no per-request randomness).
- Bulk-evaluate flags once per request/session for the frontend.

## 12. Configuration requirements

- Existing `*.enabled` properties become **defaults/fallbacks**. Add `featureflags.enabled` master switch, cache TTL. Per-tenant rules live in DB.

## 13. Migration strategy

1. Add flag tables + service with **property fallback** (behavior identical to today). 2. Import existing `*.enabled` toggles as flag definitions (defaults preserved). 3. Add evaluated endpoint + frontend context. 4. Add management UI + audit. 5. Introduce granular/% rules gradually. Fully backward compatible; `featureflags.enabled=false` reverts to pure property behavior.

## 14. Risks and dependencies

- Risk: misconfigured flag breaks features → default-safe fallback + audit + emergency disable.
- Risk: cache staleness delaying a kill-switch → short TTL + explicit evict on change.
- Risk: precedence confusion → documented, tested resolution order.
- Dependency: caching (Topic 10), audit (Topic 04), RBAC/branch context (existing).

## 15. Step-by-step implementation plan

1. Create `feature_flag`/`feature_flag_rule` tables (Flyway, guarded).
2. Build `FeatureFlagService` with precedence resolution + **property fallback** + Caffeine cache.
3. Seed definitions from existing `*.enabled` toggles (defaults unchanged).
4. Add evaluate endpoint + `FeatureFlagContext`/`useFeatureFlag` on frontend.
5. Build admin management UI + audit + emergency disable.
6. Add branch/user/role/% targeting incrementally.
7. QA precedence + rollout stability per tenant.

## 16. Open questions

1. Adopt self-hosted Unleash, or build the DB-backed store (recommended for reuse/on-prem)?
2. Scope precedence order confirmation (user > branch > role > % > tenant > global)?
3. Should existing `rbac.*.enabled` toggles migrate into the flag system or stay as-is (recommend: import as defaults, keep fallback)?
4. Is A/B experimentation (metrics on variants) actually needed, or just rollout/kill-switch?
5. Which flags are permission-adjacent (must integrate with RBAC vs. pure UI gating)?

## 17. Recommendation

Build a **DB-backed feature-flag store** with a precedence-based `FeatureFlagService` that **falls back to the existing `*.enabled` properties**, so day-one behavior is identical and fully backward compatible. Layer on **granular targeting (tenant/role/branch/user/%)**, an admin **management UI**, **audit**, and an **emergency kill-switch**, backed by the Caffeine cache (Topic 10) for O(1) checks and instant runtime flips. Expose an evaluated-flags endpoint + `FeatureFlagContext` for the SPA (mirroring the existing `PermissionContext`). Reserve external tooling (self-hosted Unleash) for a future need for heavy experimentation.
