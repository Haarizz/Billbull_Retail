# Notification Framework — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`09-notification-framework.md`](09-notification-framework.md) (Approach A — **extend, don't replace**: keep the in-app `Notification` framework as the core record/inbox; add a thin dispatcher + channel SPI + preferences + templates; route external channels through the Topic-07 job queue for retry/status; add SMS/WhatsApp/Push later; optional SSE for real-time). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - **Extend the existing `Notification`/`NotificationService`** — the in-app record and inbox stay; new layers wrap them.
> - Recipient resolution is **branch-scoped and RBAC-aware** — never notify across branches inadvertently.
> - **External sends go through the Topic-07 job queue** (retry + delivery status); they never block a request.
> - **High-volume alerts (low-stock across 12k products) must be digested/deduped/throttled** — flooding is a design-level failure.
> - **CRITICAL/security notices bypass opt-out**; everything else honors preferences + quiet hours.
> - Schema changes are **additive, Flyway-guarded**; provider secrets use the existing encrypted-config pattern.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| In-app framework exists (`Notification`, `NotificationService`, `NotificationEventPublisher`, controller) | ✅ (CLAUDE.md `notification/` + design §1) | Core record/inbox reused. |
| Frontend `NotificationContext` + `useHeartbeat` polling + bell | ✅ (per design §1) | SSE optional replacement later. |
| Email infra present but separate (`EmailConfigService`, `DocumentEmailSender`, `juice`/`emailImageInliner`) | ✅ (per design §1) | `EmailChannel` wraps it. |
| Encrypted-config pattern (`EncryptedStringConverter`) for secrets | ✅ (CLAUDE.md `common.crypto`) | Provider secrets stored here. |
| Topic-07 job queue for external retry | ⚠️ dependency | Needs Topic 07 Phase 1+ (or a temporary `@Async` fallback). |
| Next Flyway version | ⚠️ | Docs say "V30"; tree at **V33** → new migration **V34**. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Channel/targeting/digest decisions | No | n/a | S |
| 1 | Dispatcher + channel SPI + `InAppChannel` (reuse existing) | No (in-app unchanged) | No | M |
| 2 | Additive schema: preferences/templates/delivery tables | No | n/a | S |
| 3 | `EmailChannel` via Topic-07 queue + delivery status | Yes (behind toggle) | Yes | M |
| 4 | First event source: approval notifications (Topic 05) | Yes | Follows | S |
| 5 | Low-stock/payment/inventory/failed-job/reminder hooks + digest/dedup | Yes | Per-hook | L |
| 6 | Preferences UI + richer inbox | Yes | Follows | M |
| 7 | (Optional) SSE real-time delivery | Yes | Config | M |
| 8 | (Later) SMS/WhatsApp/Push channels | Yes | Config | L |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Channel/targeting/digest decisions

**Objective.** Decide phase-1 channels, whether targeting is stored or resolved at send, real-time now vs. later, default preferences, and digest strategy. No code.

**Scope.** Written decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Building fan-out before the digest strategy is set → alert floods in Phase 5. Mitigation: this phase gates §16.

**Testing checklist.**
- [ ] Phase-1 channels: in-app + email only, or SMS/WhatsApp soon (§16.1).
- [ ] Targeting stored on notification vs. resolved at send (§16.6).
- [ ] Real-time via SSE now or keep polling (§16.3).
- [ ] Default preferences + CRITICAL-override policy (§16.4).
- [ ] Digest strategy for high-volume alerts (§16.5).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §16.1/§16.3/§16.4/§16.5/§16.6.

---

## Phase 1 — Dispatcher + channel SPI + `InAppChannel` (reuse existing)

**Objective.** Introduce the dispatch layer with the in-app channel wrapping today's `NotificationService`. Behaviour unchanged (in-app still writes the same rows).

**Scope.** `NotificationDispatcher` + `NotificationChannel` SPI + `InAppChannel`.

**Files/modules affected.** New `NotificationDispatcher` (event → recipients → channels), `NotificationChannel` interface, `InAppChannel` (delegates to `NotificationService`); recipient resolution using RBAC + `BranchAccessService`.

**Database changes.** None.

**Backend changes.** Existing `createForUser`/`createForUsers` call sites can route through the dispatcher (or stay direct initially). Dispatcher resolves recipients by username/role-in-branch/branch. Only `InAppChannel` registered — output identical to today.

**Frontend changes.** None. **API changes.** None.

**Risks.** Recipient resolution notifying across branches. Mitigation: branch-scoped resolution + a test (Dubai event → Dubai recipients only).

**Testing checklist.**
- [ ] Dispatcher with `InAppChannel` produces the same in-app rows as `NotificationService` directly.
- [ ] Role-in-branch resolution returns only branch-correct recipients.
- [ ] `mvn -o test` green; existing notification flows unchanged.

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** Dispatch layer live with in-app channel; zero behaviour change; branch-scoped resolution proven.

---

## Phase 2 — Additive schema: preferences/templates/delivery tables

**Objective.** Land preference/template/delivery tables. No behaviour change (unused until later phases).

**Scope.** One Flyway migration.

**Files/modules affected.** `.../db/migration/V34__notification_dispatch.sql`; new entities.

**Database changes.**
- `notification_preference` (user × category × channel + quiet hours + digest), `notification_template` (event × channel × locale EN/AR), `notification_delivery` (channel, status QUEUED/SENT/FAILED, attempts, error) — additive, guarded.
- Optional nullable `target_role`, `target_branch_id`, `channel` on `notifications` if §0 chose stored targeting.
- Indexes `(target_username, is_read, created_at)` (inbox), `(status, attempts)` (delivery).

**Backend changes.** Entities + getters only.

**Frontend/API changes.** None.

**Risks.** Stale-schema on existing tenants. Mitigation: additive + nullable + guarded.

**Testing checklist.**
- [ ] Migration idempotent; tables + indexes created.
- [ ] Existing notification inbox queries unaffected.
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** S. **Dependencies.** Phase 1.

**Exit criteria.** Tables present; in-app behaviour unchanged.

---

## Phase 3 — `EmailChannel` via Topic-07 queue + delivery status

**Objective.** Add email as a second channel, sent asynchronously with retry + delivery status. Behind `notifications.email.enabled`.

**Scope.** `EmailChannel` + template rendering + delivery tracking.

**Files/modules affected.** New `EmailChannel` (wraps existing mail infra); template rendering (reuse `emailImageInliner`/`juice`, EN/AR); enqueue via Topic-07 job queue; write `notification_delivery` status.

**Database changes.** None (uses Phase-2 tables).

**Backend changes.** Dispatcher picks Email channel when preferences/priority say so; `EmailChannel` enqueues a background job (retry/backoff/status via Topic 07); CRITICAL bypasses opt-out. Falls back to in-app on send failure.

**Frontend changes.** Delivery indicators (Phase 6). **API changes.** None new.

**Risks.** Email send blocking a request, or provider secrets exposed. Mitigation: always via job queue (never inline); secrets via encrypted config; if Topic 07 not yet live, use a temporary bounded `@Async` fallback.

**Testing checklist.**
- [ ] Email routed through the job queue; request never blocks.
- [ ] Delivery status recorded (QUEUED→SENT/FAILED); retry on transient failure.
- [ ] CRITICAL emails bypass opt-out; non-critical honor preferences.
- [ ] Provider secrets encrypted at rest.
- [ ] Toggle off → in-app only.

**Estimated complexity.** M. **Dependencies.** Phase 1/2; Topic 07 (queue).

**Exit criteria.** Email delivered async with retry + status, preference-aware, CRITICAL-override; toggle-off = in-app only.

---

## Phase 4 — First event source: approval notifications (Topic 05)

**Objective.** Wire the first real event (approval step assignment) through the dispatcher — validates end-to-end fan-out.

**Scope.** Approval → dispatcher hook.

**Files/modules affected.** Topic-05 `ApprovalWorkflowService` step-assignment hook → `NotificationDispatcher` (in-app now, email if enabled).

**Database changes.** None.

**Backend changes.** On step assignment, dispatch to step-role holders in the document's branch across enabled channels.

**Frontend changes.** Bell already surfaces in-app (richer inbox in Phase 6). **API changes.** None.

**Risks.** Duplicate/cross-branch approval notifications. Mitigation: branch-scoped resolution (Phase 1); dedup per event.

**Testing checklist.**
- [ ] Approval step assignment notifies branch-role holders in-app (+ email if enabled).
- [ ] No cross-branch notification.
- [ ] No duplicate per assignment.

**Estimated complexity.** S. **Dependencies.** Phase 1 (+ Phase 3 for email); Topic 05.

**Exit criteria.** Approval notifications delivered via dispatcher, branch-scoped, deduped.

---

## Phase 5 — Low-stock/payment/inventory/failed-job/reminder hooks + digest/dedup

**Objective.** Connect the remaining event sources, with mandatory digest/dedup/throttle for high-volume ones.

**Scope.** Event hooks + digest engine.

**Files/modules affected.** Low-stock threshold sweep (`@Scheduled`), payment/inventory alert hooks, failed-job hook (Topic 07), scheduled reminders, system events (Topic 04) → dispatcher; a digest/dedup/throttle layer.

**Database changes.** None (or a small digest-state helper if needed).

**Backend changes.** High-volume alerts (low-stock across 12k products) batched into digests / deduped / throttled per §16.5; per-hook toggles.

**Frontend changes.** None new. **API changes.** None.

**Risks.** **Alert floods** — the headline risk (design §14). Mitigation: digest/dedup/throttle is mandatory before enabling low-stock; test with a large synthetic low-stock set.

**Testing checklist.**
- [ ] Low-stock across many products produces a digest, not a flood.
- [ ] Payment/inventory/failed-job/reminder events dispatch correctly.
- [ ] Dedup prevents repeat alerts for the same condition.
- [ ] Per-hook toggles gate each source.

**Estimated complexity.** L. **Dependencies.** Phase 1/3; Topics 04/07 for event sources.

**Exit criteria.** All event sources wired; high-volume alerts digested/deduped/throttled (flood-tested); per-hook toggles.

---

## Phase 6 — Preferences UI + richer inbox

**Objective.** Let users control channels/categories/quiet-hours; enrich the inbox with delivery indicators.

**Scope.** Preferences page + inbox enhancements.

**Files/modules affected.** `GET/PUT /api/notifications/preferences`, `GET /api/notifications/history`, template admin CRUD; frontend preferences page (channels per category, quiet hours) + richer inbox (filters by category/priority — mostly exists — + delivery indicators).

**Database changes.** None.

**Backend changes.** Preferences service + history endpoint; template admin.

**Frontend changes.** Preferences page + inbox filters/indicators.

**API changes.** New preference/history/template endpoints (backward compatible).

**Risks.** Users opting out of important non-CRITICAL alerts. Mitigation: sensible defaults (§16.4); CRITICAL bypass.

**Testing checklist.**
- [ ] Preferences persist + honored at dispatch.
- [ ] Quiet hours respected (non-CRITICAL held/suppressed).
- [ ] Inbox shows delivery status per channel.
- [ ] `npm run build` + `npm run lint` green.

**Estimated complexity.** M. **Dependencies.** Phase 2/3.

**Exit criteria.** Users manage preferences; inbox reflects multi-channel delivery.

---

## Phase 7 — (Optional) SSE real-time delivery

**Objective.** Replace/augment `useHeartbeat` polling with server-push for instant in-app delivery.

**Scope.** SSE endpoint + client subscription.

**Files/modules affected.** `GET /api/notifications/stream` (SSE); frontend subscription (polling fallback retained).

**Database/Backend changes.** SSE endpoint; cap connection counts.

**Frontend changes.** SSE subscription augmenting/replacing polling.

**API changes.** New SSE endpoint.

**Risks.** Connection-count exhaustion. Mitigation: cap connections; keep polling fallback.

**Testing checklist.**
- [ ] New in-app notification pushed instantly via SSE.
- [ ] Polling fallback works when SSE unavailable.
- [ ] Connection cap enforced.

**Estimated complexity.** M. **Dependencies.** Phase 1. **Optional** — only if §16.3 chose real-time now.

**Exit criteria.** Real-time in-app delivery with polling fallback; connection limits enforced.

---

## Phase 8 — (Later) SMS/WhatsApp/Push channels

**Objective.** Add external channels when providers are chosen.

**Scope.** New `NotificationChannel` implementations.

**Files/modules affected.** `SmsChannel`/`WhatsAppChannel`/`PushChannel` (enqueue via Topic-07 queue; provider secrets via encrypted config).

**Database changes.** None (reuse `notification_delivery`).

**Backend changes.** Per-channel send + delivery status; per-tenant provider config.

**Frontend changes.** Channel options in preferences.

**API changes.** None new.

**Risks.** Provider cost/abuse. Mitigation: rate-limit/dedup external sends (Topic 03); honor unsubscribe except CRITICAL.

**Testing checklist.** Per channel: send + delivery status, preference-gated, CRITICAL-override, rate-limited.

**Estimated complexity.** L. **Dependencies.** Phase 3 pattern; provider choice (§16.2). **Later** — only when providers chosen.

**Exit criteria.** Each external channel delivers with status, preference-gated, rate-limited.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §16) | Needed by | Recommended default |
|---|---|---|
| §16.1 Phase-1 channels | Phase 0/3 | In-app + email |
| §16.5 Digest strategy for high-volume alerts | Phase 5 | Batched digest + dedup + throttle (mandatory) |
| §16.4 Default preferences + CRITICAL override | Phase 3/6 | Sensible defaults; CRITICAL bypasses opt-out |
| §16.6 Targeting stored vs. resolved at send | Phase 1/2 | Resolve at send (role-in-branch) |
| §16.3 SSE real-time now? | Phase 7 | Keep polling; SSE optional |
| §16.2 SMS/WhatsApp providers | Phase 8 | Deferred until chosen |

---

## Cross-cutting testing strategy

- **Branch-scoped-recipient test** — a standing test that an event in branch X notifies only branch-X recipients (RBAC + branch). The core mis-targeting guard.
- **Flood test** — a large synthetic low-stock set produces a single digest, not N notifications. The core volume guard (Phase 5 gate).
- **In-app invariance** — with only `InAppChannel` registered (Phase 1), output is byte-identical to today's `NotificationService`.
- **External-async test** — email/SMS never block a request (always via Topic-07 queue); delivery status recorded; retry on transient failure.
- **CRITICAL-override test** — CRITICAL notices reach opted-out users; non-critical honor preferences + quiet hours.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 6.
