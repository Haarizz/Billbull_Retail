# Audit Logs & Activity Tracking — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`04-audit-logs-activity-tracking.md`](04-audit-logs-activity-tracking.md) (Approach A + C hybrid — keep the three specialized writers, add before/after+category columns to `security/AuditLog`, auto-capture CRUD via a masked `EntityListener` behind a toggle, add explicit hooks for missing non-CRUD events, unify at a query layer). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable**; explicit-hook phases are low-risk additions, CRUD auto-capture is gated by `audit.crud.enabled` (default off).
> - Audit is **append-only** — no update/delete endpoints; deletion only via the retention job.
> - **Sensitive data is never written** to `details`/`before_json`/`after_json` — password hashes, tokens, and `EncryptedStringConverter` columns are masked. The mask list is mandatory before any before/after capture ships.
> - Writes stay **async** (existing `AuditLogWriter @Async`) so request latency is never affected; timestamps captured at **event time**, not write time.
> - Schema changes are **additive, nullable, Flyway-guarded**; the three existing audit tables' schemas are not disturbed.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| Three audit subsystems exist (`security/AuditLog`, `financials/audit/FinancialAuditLog`, `pos/audit/PosAuditLog`) | ✅ (CLAUDE.md three-audit note + design §1) | Query layer unifies; tables stay separate. |
| Async writer `AuditLogWriter @Async` exists | ✅ (per design §1) | Reuse for all new writes. |
| `RequestLoggingFilter` already audits mutating requests + 4xx/5xx | ✅ (per design §1) | API-failure coverage is done. |
| `AuditLogRetentionJob` nightly + `audit.retention.months` | ✅ (CLAUDE.md `config/AuditLogRetentionJob`) | Extend to all sources. |
| POS/finance already store before/after (`oldValueJson`/`newValueJson`, `previousState`) | ✅ (per design §1/§2) | `security/AuditLog` gains the general capability. |
| Next Flyway version | ⚠️ | Docs say "V30"; tree at **V33** → new migration **V34**. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Sensitive-field mask inventory + scope decisions | No | n/a | S |
| 1 | Additive schema: before/after/category columns + indexes | No | n/a | S |
| 2 | Explicit non-CRUD hooks (login/print/export/import/approval/settings/user/role/branch) | Yes (more audit rows) | Per-hook config | M |
| 3 | `AuditEntityListener` CRUD auto-capture (dormant) | No (toggle off) | Yes | M |
| 4 | `AuditQueryService` + unified read API | Yes (new endpoints) | No | M |
| 5 | Frontend unified timeline + entity history drawer + export | Yes | No | M |
| 6 | Extend retention to all sources | Yes | Config | S |
| 7 | Enable CRUD auto-capture per tenant | Yes (opt-in) | Flip | S |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Sensitive-field mask inventory + scope decisions

**Objective.** Enumerate every field that must never be audited, and decide which entities get CRUD auto-capture. Nothing ships. This gates before/after work.

**Scope.** Written mask list + entity allowlist + decisions.

**Files/modules affected.** None (audit of entities using `EncryptedStringConverter`, password/token fields).

**Database/Backend/Frontend/API changes.** None.

**Risks.** Missing a sensitive field → secret leaked into audit rows (design §11). Mitigation: this phase is the gate; grep for `EncryptedStringConverter`, `password`, `token`, `secret` and enumerate.

**Testing checklist.**
- [ ] Complete mask list of encrypted/secret columns per entity.
- [ ] CRUD auto-capture entity allowlist decided (all vs. transactional-only — §17.2).
- [ ] Retention window per tenant / regulatory need captured (§17.3).
- [ ] `AUDIT_VIEW` permission scope decided (§17.4).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed mask list + entity allowlist + retention/viewer-permission decisions.

---

## Phase 1 — Additive schema: before/after/category columns + indexes

**Objective.** `security/AuditLog` gains general before/after + category. Zero behaviour change (columns unused yet).

**Scope.** One Flyway migration + `AuditLog` entity fields.

**Files/modules affected.** `.../db/migration/V34__audit_before_after_category.sql`; `security/AuditLog.java`.

**Database changes.**
- `ADD COLUMN before_json TEXT NULL`, `after_json TEXT NULL`, `event_category VARCHAR NULL` on `audit_logs`, guarded.
- Composite indexes `(entity_type, entity_id, access_time)`, `(event_type, access_time)`, guarded.
- Optional read-only view `v_activity_timeline` UNION-ing the three audit tables into the canonical shape (no data movement) — can defer to Phase 4.
- No change to `financial_audit_logs` / `pos_audit_logs`.

**Backend changes.** Entity fields + getters only.

**Frontend/API changes.** None.

**Risks.** Index bloat on a high-volume table. Mitigation: only the two filter-driven composite indexes; measure.

**Testing checklist.**
- [ ] Migration idempotent.
- [ ] Columns + indexes created; existing audit writes unaffected.
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** S. **Dependencies.** Phase 0.

**Exit criteria.** Columns/indexes present; existing audit flows unchanged.

---

## Phase 2 — Explicit non-CRUD hooks

**Objective.** Close the coverage gaps for events that have natural hook points: login/logout/failed-login, password change, print/reprint, export, import, approvals, settings/permission/branch/user changes.

**Scope.** Typed helpers on `AuditLogService` + hooks at each site.

**Files/modules affected.**
- `security/AuditLogService.java` — add `logAuthEvent`, `logPrintEvent`, `logExportEvent`, `logImportEvent`, `logSettingsChange`, `logPermissionChange`.
- Hook sites: `AuthController` (login success/failure/logout, change-password), print services (`document/`, POS print), export services (`exportUtils` server side / `*ExportService`), `ProductImportService`, approval services (Topic 05 `ApprovalWorkflowService`), user/role/branch/settings services.

**Database changes.** None.

**Backend changes.** Explicit `AuditLogService` calls at each hook, async, event-time timestamp, masked details. Failed-login capture reads username-attempted + IP from the raw request (no principal).

**Frontend changes.** None yet (Phase 5). **API changes.** None.

**Risks.** Failed-login auditing enabling username enumeration. Mitigation: store the attempt but keep API responses generic (design §11); never branch responses on username existence.

**Testing checklist.**
- [ ] Login success/failure/logout + password change write audit rows.
- [ ] Failed login captures attempted username + IP without a principal.
- [ ] Print/export/import/approval/settings changes audited.
- [ ] Sensitive fields masked in all new rows.
- [ ] Writes async (no request-latency impact).

**Estimated complexity.** M. **Dependencies.** Phase 1. (Approval hooks coordinate with Topic 05.)

**Exit criteria.** All listed non-CRUD events produce masked, async audit rows on a pilot tenant.

---

## Phase 3 — `AuditEntityListener` CRUD auto-capture (dormant)

**Objective.** Build the Hibernate `EntityListener` that captures insert/update/delete with dirty-field before/after into `security/AuditLog` — gated off by default.

**Scope.** Entity listener + toggle + field whitelist/mask.

**Files/modules affected.**
- New `AuditEntityListener` (`@EntityListeners`) wired onto the Phase-0 entity allowlist.
- `application.properties` — `audit.crud.enabled=false`, `audit.crud.entities=`, `audit.before-after.enabled`, `audit.auth.enabled`.

**Database changes.** None.

**Backend changes.** On persist/update/remove, compute shallow, whitelisted, masked before/after and write via `AuditLogService` (async). Bounded payloads (no lazy-load storms). Entirely inert while `audit.crud.enabled=false`.

**Frontend/API changes.** None.

**Risks.** Diff cost / lazy-load storms / volume multiplication on busy tables (design §4/§12). Mitigation: shallow whitelisted fields only, async, toggle-gated, per-entity allowlist.

**Testing checklist.**
- [ ] Unit: update to a whitelisted field → before/after captured; masked field excluded.
- [ ] No extra queries triggered (shallow snapshot).
- [ ] Toggle off → listener inert (no rows, no overhead).
- [ ] `mvn -o test` green.

**Estimated complexity.** M. **Dependencies.** Phase 1, Phase 0 mask list.

**Exit criteria.** Listener validated with toggle on in a test tenant; inert with toggle off; masking proven.

---

## Phase 4 — `AuditQueryService` + unified read API

**Objective.** One query surface + canonical DTO over all audit sources (via the view/adapters), with rich filters + export.

**Scope.** Read layer + controller.

**Files/modules affected.**
- New `AuditQueryService` (reads `audit_logs` + adapters/view for finance/POS).
- Expand `AuditLogController` — filters (date/user/branch/entityType/action/eventType/free-text) + pagination + CSV/Excel export (reuse POI).

**Database changes.** The `v_activity_timeline` view (if deferred from Phase 1) lands here.

**Backend changes.** Canonical DTO (superset shape from design §6). Endpoints: `GET /api/audit?filters` (paged), `GET /api/audit/entity/{type}/{id}` (timeline), `GET /api/audit/export`. Gated by `AUDIT_VIEW` permission; branch-scoped for non-admins.

**Frontend changes.** None yet (Phase 5). **API changes.** New backward-compatible endpoints.

**Risks.** UNION-view query performance across three tables. Mitigation: filter columns indexed (Phase 1); per-source limits before merge; paginate.

**Testing checklist.**
- [ ] Filters return correct rows across all three sources.
- [ ] Entity timeline merges sources in event-time order.
- [ ] `AUDIT_VIEW` enforced; non-admin branch-scoped.
- [ ] Export produces CSV/Excel.

**Estimated complexity.** M. **Dependencies.** Phase 1 (+ Phase 2/3 data to show).

**Exit criteria.** Unified timeline queryable + exportable, permission-gated + branch-scoped.

---

## Phase 5 — Frontend unified timeline + entity history drawer + export

**Objective.** Surface the unified audit trail to users.

**Scope.** Audit/Activity page + contextual record history.

**Files/modules affected.** New Audit/Activity page (filters, pagination/infinite scroll); entity "history" drawer with before/after diff; export button (reuse `exportUtils`); contextual "Activity" tab on record detail pages (e.g. invoice).

**Database/Backend/API changes.** None (consumes Phase 4).

**Frontend changes.** Timeline UI + diff viewer + export.

**Risks.** Rendering large diffs. Mitigation: shallow whitelisted before/after (already bounded server-side); lazy-load drawer.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green.
- [ ] Timeline filters + pagination work.
- [ ] History drawer shows before/after diff.
- [ ] Export downloads.
- [ ] `AUDIT_VIEW`-gated in UI.

**Estimated complexity.** M. **Dependencies.** Phase 4.

**Exit criteria.** Users can browse, filter, drill into, and export the unified audit trail.

---

## Phase 6 — Extend retention to all sources

**Objective.** The retention job prunes all audit sources consistently.

**Scope.** `AuditLogRetentionJob`.

**Files/modules affected.** `config/AuditLogRetentionJob.java`.

**Database changes.** None (deletes by retention window).

**Backend changes.** Extend the nightly job to prune `financial_audit_logs` and `pos_audit_logs` per `audit.retention.months` (0 = keep forever). Consider monthly partitioning on `audit_logs` if volume grows (design §12).

**Frontend/API changes.** None.

**Risks.** Deleting finance/POS audit that has a regulatory retention need. Mitigation: honor per-source/regulatory windows from Phase 0; default keep-forever if unset.

**Testing checklist.**
- [ ] Retention prunes all three sources beyond the window.
- [ ] `retention.months=0` keeps everything.
- [ ] No live rows deleted inside the window.

**Estimated complexity.** S. **Dependencies.** Phase 0 (retention decision).

**Exit criteria.** Retention covers all sources; regulatory windows respected.

---

## Phase 7 — Enable CRUD auto-capture per tenant

**Objective.** Turn on `audit.crud.enabled` for a pilot tenant; validate volume/perf/masking.

**Scope.** Config + validation.

**Files/modules affected.** Per-tenant `application-<client>.properties` — `audit.crud.enabled=true` + `audit.crud.entities` allowlist.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Audit-volume/perf regression on busy tables. Mitigation: enable for a small entity allowlist first; watch async-writer queue depth + DB growth; expand gradually.

**Testing checklist (before/after flip).**
- [ ] CRUD before/after rows appear for allowlisted entities.
- [ ] No request-latency regression (async).
- [ ] Masking holds on live data.
- [ ] Audit-writer queue not backing up.
- [ ] Rollback (toggle off) stops capture cleanly.

**Estimated complexity.** S. **Dependencies.** Phases 3–6.

**Exit criteria.** Pilot tenant validated; volume/perf acceptable; rollout runbook written; expand entity allowlist gradually.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §17) | Needed by | Recommended default |
|---|---|---|
| §17.1 Consolidate three tables or unify only at query layer | Phase 4 | Unify at query layer (keep three writers) |
| §17.2 Which entities get CRUD before/after | Phase 0/3/7 | Transactional roots first; expand allowlist |
| §17.3 Retention window per tenant/regulatory | Phase 0/6 | Per-tenant; default keep-forever if unset |
| §17.4 Who may view audit (`AUDIT_VIEW` scope) | Phase 0/4 | New `AUDIT_VIEW` permission; branch-scoped for non-admins |
| §17.5 Login/failed-login volume acceptable to keep indefinitely | Phase 2/6 | Keep per retention window; monitor volume |

---

## Cross-cutting testing strategy

- **Mask-list enforcement** — a standing test asserts no encrypted/password/token field ever appears in `details`/`before_json`/`after_json`, across explicit hooks and the entity listener. The single highest-value security guard.
- **Toggle-off invariance** — with `audit.crud.enabled=false` the `EntityListener` is fully inert (no rows, no query overhead). Proven at Phase 3 and 7.
- **Async-latency guard** — a test/benchmark confirming audit writes never block the request thread (queue depth bounded).
- **Event-time correctness** — out-of-order async writes still carry the event-time timestamp, not the write-time.
- **Enumeration-safe auth audit** — failed-login rows captured while API responses stay generic.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 5.
