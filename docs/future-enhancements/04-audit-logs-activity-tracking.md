# Topic — Audit Logs & Activity Tracking

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: design a complete, unified audit-logging and activity-tracking system, analyzing the current implementation and closing its gaps.

---

## 1. Current system behavior

The codebase has **three separate audit subsystems**, one per domain (as documented in CLAUDE.md), plus a request-logging filter:

1. **`security/AuditLog`** (table `audit_logs`) — the richest and most general. Fields: `userId`, `username`, `role`, `endpoint`, `httpMethod`, `action` (ALLOWED/DENIED), `ipAddress`, `userAgent`, `denialReason`, `accessTime`, `requestId`, `branchId`, `eventType`, `entityType`, `entityId`, `details` (TEXT), `httpStatus`, `durationMs`, `clientHost`. Indexed on `(username, access_time)` and `(branch_id, access_time)`.
   - Written **asynchronously** via `AuditLogService` → `AuditLogWriter` (`@Async` on the shared task-executor pool) so DB writes never block the request.
   - Methods: `logAllowedAccess`, `logDeniedAccess`, `logDomainEvent(entityType, entityId, action, detail)`, `logApiRequestEvent(request, status, durationMs)`, `logClientIssueEvent(...)`.
   - Retention driven by `config/AuditLogRetentionJob` (nightly `0 30 3 * * *`), gated by `audit.retention.months` (0 = keep forever).
2. **`financials/audit/FinancialAuditLog`** — finance-specific: `entityType`, `entityId`, `action` (CREATED/POSTED/UPDATED/DELETED/REVERSED), `userId`, `username`, `timestamp`, `details`, `previousState` (before-snapshot for reversals), `requestId`, `branchId`, `clientHost`.
3. **`pos/audit/PosAuditLog`** — POS-specific: `sessionId`, `terminalId`, `branchId`, `userId`, `action` (enum `PosAuditAction`), `entityType`, `entityId`, `description`, **`oldValueJson`**, **`newValueJson`**, `createdAt`.

**Request-level capture already exists:** `logging/RequestLoggingFilter` records every request's method/target/status/duration/user/branch/clientHost, logs 4xx/5xx distinctly, and calls `auditLogService.logApiRequestEvent(...)` for mutating requests. `LogContext`/MDC carries `requestId`, `userId`, `username`, `roles`, `branchId`.

**Auth events:** `LoginRateLimiter` throttles logins but does **not** currently write structured audit rows for login/logout/failed-login.

---

## 2. Existing implementation analysis

**Strengths:**
- Async, non-blocking writes (`AuditLogWriter`) — the right performance pattern, already in place.
- `security/AuditLog` already carries almost every field the requirement asks for: who (`userId`/`username`/`role`), branch, IP, user agent, timestamp, entity, HTTP status, duration, request id, free-text details.
- POS audit already stores **before/after** as `oldValueJson`/`newValueJson`; finance stores `previousState`. The "before/after values" capability exists in two of three subsystems.
- Retention job + config toggle already exists.
- `RequestLoggingFilter` gives near-complete **API failure** and **mutating-request** coverage for free.

**Weaknesses / fragmentation:**
- **Three schemas, three services, no unified query surface.** A single "activity timeline" for an entity requires querying three tables with different column names.
- `security/AuditLog` has no first-class **before/after** columns (only free-text `details`); finance and POS each solved it differently.
- **Domain events are opt-in** — `logDomainEvent` must be called explicitly by each service. Coverage of Create/Update/Delete/Void/Approve/etc. is therefore inconsistent across modules.

---

## 3. Missing functionality (by required event type)

| Event | Captured today? | Gap |
|---|---|---|
| Create / Update / Delete | Partial | Only where a service explicitly calls `logDomainEvent`; not automatic |
| Void | Partial | POS voids covered via PosAuditLog; other voids inconsistent |
| Login / Logout | **No structured audit** | `AuthController` doesn't write AuditLog rows |
| Failed Login | Throttled but **not audited** | `LoginRateLimiter` doesn't emit an audit event |
| Password Reset / Change | **No** | `change-password` writes no audit row |
| Print / Reprint | Partial | POS print jobs tracked as `PosPrintJob`; general document prints not audited |
| Export / Import | **Mostly no** | Excel/PDF export + product import not consistently audited |
| Approval Actions | Partial | LPO approvals recorded in `ApprovalHistory`; not in a unified audit |
| Stock Adjustments / Transfers | Partial | StockMovement is the ledger, but not surfaced as audit events |
| Settings / Permission / Branch changes | **Inconsistent** | Not systematically audited |
| User Management | **Inconsistent** | Create/disable/role-change not systematically audited |
| Payment Actions | Partial | Finance audit covers postings; UI-level payment actions vary |
| API Failures | **Yes** | `RequestLoggingFilter` already covers 4xx/5xx |
| System Events (jobs, seeders) | **No** | Scheduled jobs don't emit audit rows |
| **Before/After values** | Partial | Only POS + finance; not general |
| Search & filtering UI | Partial | `AuditLogController` exists; needs richer filters |
| Export of audit logs | **No** | No audit-log export endpoint |

---

## 4. Challenges and edge cases

1. **Consolidation vs. rewrite.** Three audit tables exist for good domain reasons; forcing one table risks regressions. A **unified read/query layer over a canonical event model** is safer than merging tables.
2. **Automatic vs. explicit capture.** Fully automatic CRUD auditing (Hibernate interceptor/Envers) captures everything but is noisy and heavy; explicit `logDomainEvent` is precise but easy to forget. Need a hybrid.
3. **Before/after diffing cost.** Computing diffs on large entities (with lazy associations) can trigger extra queries and serialize large blobs. Must snapshot shallow, whitelisted fields.
4. **Sensitive data.** Password hashes, tokens, `EncryptedStringConverter` columns must never be written into `details`/`oldValue`/`newValue`.
5. **Volume.** `RequestLoggingFilter` already audits every mutating request; adding domain + before/after could multiply audit volume on the busiest tables.
6. **Async ordering.** Async writes can land out of order; timestamps must be captured at event time, not write time.
7. **Login auditing without a session.** Failed logins have no authenticated principal — must capture username-attempted + IP from the raw request.
8. **Multi-tenant.** Each tenant is a separate DB (profile-per-client), so audit stays naturally isolated per tenant.

---

## 5. Possible implementation approaches

- **A — Unify behind a canonical `AuditEvent` model + query service (RECOMMENDED).** Keep the three write tables (or migrate them behind one), but expose a single `AuditQueryService` and a canonical DTO so the UI/timeline sees one shape. Add missing `before/after` (JSON) columns to `security/AuditLog` so it becomes the general default; keep POS/finance specializations.
- **B — Hibernate Envers.** Automatic entity versioning/history tables. Pro: zero-touch CRUD history with before/after. Con: heavy schema (`_AUD` tables per entity), doesn't capture non-CRUD events (login, print, export), harder to filter/report, large migration. Use selectively at most.
- **C — Hibernate `Interceptor`/`EntityListener`** to auto-capture insert/update/delete with dirty-field diffs into `security/AuditLog`. Pro: automatic before/after for all entities. Con: needs field whitelisting and sensitive-field masking.
- **D — Explicit-only (status quo, extended).** Add `logDomainEvent`/before-after calls everywhere missing. Pro: precise, minimal infra. Con: coverage gaps persist.

**Recommendation: A + C hybrid.** Canonical query layer (A) for a unified timeline + export; a Hibernate `EntityListener` (C) with a field-whitelist and sensitive-mask to auto-capture Create/Update/Delete before/after into `security/AuditLog`; explicit `logDomainEvent` for non-CRUD events (login, print, export, approvals, settings) — many of which already have hooks.

---

## 6. Recommended architecture

- **Canonical event shape** (superset of today's fields): `eventType`, `action`, `entityType`, `entityId`, `actorUserId/username/role`, `branchId`, `ipAddress`, `userAgent`, `clientHost`, `requestId`, `timestamp`, `httpStatus`, `durationMs`, `beforeJson`, `afterJson`, `details`.
- **Write paths:**
  - Requests/API failures → `RequestLoggingFilter` (already there).
  - CRUD before/after → shared `AuditEntityListener` writing to `security/AuditLog` (via `AuditLogService`, async).
  - Domain/non-CRUD events → explicit `AuditLogService.logDomainEvent(...)` at the natural hooks (`AuthController` login/logout/failed, `change-password`, print services, export/import services, approval services, settings/user/role/branch services).
  - POS & finance keep their specialized writers **and** mirror a canonical row (or are surfaced by the query layer via adapters).
- **Read path:** `AuditQueryService` + `AuditLogController` with rich filters (date range, user, branch, entityType, action, eventType, free-text) + pagination + export.
- **Retention:** extend existing `AuditLogRetentionJob` to cover all sources; keep `audit.retention.months` config.

---

## 7. Database / schema impact (design only)

- Add to `audit_logs` (nullable, additive, Flyway-guarded): `before_json TEXT`, `after_json TEXT`, `event_category VARCHAR`. No drops.
- Consider composite indexes for common filters: `(entity_type, entity_id, access_time)`, `(event_type, access_time)`.
- Optionally a read-only DB **view** `v_activity_timeline` UNION-ing the three audit tables into the canonical shape for the query layer (no data movement).
- No change to `financial_audit_logs` / `pos_audit_logs` schemas required.

---

## 8. Backend changes

- Add `AuditEntityListener` (Hibernate `@EntityListeners`) with field whitelist + sensitive-field mask; wire onto audited entities (opt-in list).
- Extend `AuditLogService` with `logAuthEvent`, `logPrintEvent`, `logExportEvent`, `logImportEvent`, `logSettingsChange`, `logPermissionChange`, `logCrud(before, after)`.
- Add audit hooks at: `AuthController` (login success/failure/logout, password change), print services (`document/`, POS print), export (`*ExportService`, `exportUtils` server side), `ProductImportService`, `ApprovalWorkflowService`, user/role/branch/settings services.
- `AuditQueryService` + expanded `AuditLogController` filters + CSV/Excel export endpoint (reuse POI).
- Extend `AuditLogRetentionJob` to prune all sources.

## 9. Frontend changes

- Audit/Activity page: unified timeline with filters (date, user, branch, module, action, entity), pagination/infinite scroll, and an entity "history" drawer (before/after diff view).
- Export button (CSV/Excel) reusing `exportUtils`.
- Show audit trail contextually on record detail pages (e.g. invoice → "Activity" tab).

## 10. API changes

- `GET /api/audit?filters...` (paged), `GET /api/audit/entity/{type}/{id}` (timeline), `GET /api/audit/export`. Backward compatible additions.

## 11. Security considerations

- Audit endpoints gated by an `AUDIT_VIEW` permission (RBAC) and branch-scoped for non-admins.
- Never log secrets/PII beyond policy; mask encrypted columns, passwords, tokens.
- Audit is append-only — no update/delete endpoints; deletion only via retention job.
- Failed-login auditing must not enable username enumeration (store attempt, keep responses generic).

## 12. Performance considerations

- Keep writes **async** (already the case) to protect request latency.
- Whitelist before/after fields to bound payload size and avoid lazy-load storms.
- Batch/queue audit writes under load; index for the actual filter columns.
- Retention/partitioning (monthly) on `audit_logs` if volume grows (mirrors the finance `GlAccountBalance`/partition notes in the DB review).

## 13. Configuration requirements

- Reuse `audit.retention.months`; add `audit.crud.enabled`, `audit.crud.entities=`, `audit.before-after.enabled`, `audit.auth.enabled` toggles (default conservative), following the existing `*.enabled` convention (14 toggles already exist).

## 14. Migration strategy

1. Additive columns on `audit_logs` (before/after/category). 2. Add auth/print/export/import/approval hooks (explicit, low risk). 3. Introduce `AuditEntityListener` behind `audit.crud.enabled=false`; enable per tenant after validation. 4. Ship unified query UI + export. 5. Extend retention. Fully reversible via toggles.

## 15. Risks and dependencies

- Risk: audit volume/perf regression → mitigated by async + whitelist + retention.
- Risk: sensitive-data leakage → mask lists mandatory.
- Risk: three-subsystem drift → canonical query layer + adapters.
- Dependency: async executor sizing; retention/partition ops.

## 16. Step-by-step implementation plan

1. Add nullable before/after/category columns + indexes (Flyway, guarded).
2. Extend `AuditLogService` with typed helpers; add auth/password/print/export/import/approval/settings/user/role/branch hooks.
3. Build `AuditEntityListener` (whitelist + mask) behind `audit.crud.enabled`.
4. Build `AuditQueryService` + rich `AuditLogController` + export.
5. Frontend unified timeline + entity history drawer + export.
6. Extend retention to all sources; add config toggles.
7. QA per tenant; enable CRUD auditing gradually.

## 17. Open questions

1. Consolidate the three tables, or keep them and unify only at the query layer? (Recommend the latter.)
2. Which entities get automatic CRUD before/after auditing (all vs. transactional only)?
3. Retention window per tenant / regulatory requirement?
4. Who may view audit logs (new `AUDIT_VIEW` permission scope)?
5. Are login/logout/failed-login volumes acceptable to store indefinitely?

## 18. Recommendation

Adopt **Approach A + C**: keep the three specialized writers, add before/after + category columns to `security/AuditLog`, capture CRUD automatically via a masked `EntityListener` (toggle-gated), add explicit hooks for the non-CRUD events that are currently missing (login/print/export/import/settings/permission/branch/user), and expose everything through a single `AuditQueryService`/UI with export and extended retention. This maximizes reuse of the strong async infrastructure already present and closes the coverage gaps with the least risk.
