# Topic — Notification Framework

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: design a centralized, multi-channel notification system, extending what already exists.

---

## 1. Current system behavior / existing analysis

A working **in-app notification framework already exists** (`notification/`):
- **`Notification`** (extends `BaseEntity`, table-backed): `title`, `message`, `type` (INFO/WARNING/SUCCESS/ERROR), `category` (INVENTORY/SALES/PURCHASE/FINANCE/HR/SYSTEM), `priority` (LOW/MEDIUM/HIGH/CRITICAL), `targetUsername`, `isRead`, `readAt`, `actionUrl`, `referenceId`, `referenceType`, `expiresAt`.
- **`NotificationService`**: `getMyNotifications(paged)`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `dismiss`, `createForUser(...)`, `createForUsers(list, ...)`, `cleanupOldNotifications` (`@Scheduled`).
- **`NotificationEventPublisher`**, `NotificationController`, `NotificationResponse`.
- Frontend: `context/NotificationContext`, `hooks/useHeartbeat` (polling), a notification bell (the dashboard shows a "9+" badge).
- **Email capability present but separate:** `spring-boot-starter-mail`, `settings/email/EmailConfigService`, `settings/email/DocumentEmailSender`, `sales/quotation/QuotationEmailService`, `utils/documentEmailSender.js` + `emailImageInliner`/`juice` on the frontend. Email is used for documents, **not wired into the notification framework.**

## 2. Missing functionality

- **Single channel only** (in-app). No unified dispatch to **email**, and no **SMS/WhatsApp/Push** (explicitly "future").
- **No delivery abstraction** — notifications aren't routed by channel or user preference.
- **No user notification preferences** (which categories/channels a user wants).
- **No templates** for notification content (email uses ad-hoc HTML builders).
- **No retry/delivery-status** tracking for external channels.
- **No wiring to key events:** approvals (Topic 05), low-stock alerts, payment/inventory alerts, failed background jobs (Topic 07), scheduled reminders. Currently `createForUser` must be called manually.
- **Polling, not push** — `useHeartbeat` polls; no WebSocket/SSE for real-time.
- **Read/unread + history exist**, but no cross-channel history/status.

## 3. Challenges and edge cases

1. **Channel fan-out + preferences** — one event → many channels filtered by user prefs and priority (e.g. CRITICAL always emails).
2. **Targeting** — currently `targetUsername`; needs role-based and branch-based targeting (e.g. "all BRANCH_ADMINs in Dubai").
3. **External delivery reliability** — email/SMS can fail → retry/backoff + status (ties to Topic 07 jobs).
4. **Templating + i18n** (EN/AR) — reuse existing bilingual/email-inlining utilities.
5. **Rate/volume** — low-stock across 12k products could flood; needs digest/dedup/throttling.
6. **Real-time delivery** — polling adds latency/load; WebSocket/SSE improves UX but adds infra.
7. **Multi-tenant** — per-tenant email config already in `EmailConfigService`; SMS/WhatsApp providers would be per-tenant too.
8. **Do-not-disturb / quiet hours**, unsubscribe, and CRITICAL overrides.

## 4. Possible implementation approaches

- **A — Extend the existing framework into a channel-dispatch model (RECOMMENDED).** Keep `Notification` as the in-app record; add a **`NotificationDispatcher`** that, per event, resolves recipients (user/role/branch) + preferences, then fans out to registered **`NotificationChannel`** implementations (InApp, Email now; SMS/WhatsApp/Push later). External sends go through the background job queue (Topic 07) for retry/status.
- **B — Adopt a third-party notification service** (e.g. Novu, Courier). Powerful (templates, prefs, channels, digests) but external dependency + per-tenant setup; likely overkill and conflicts with self-hosted/on-prem tenants.
- **C — Keep separate systems** (in-app + ad-hoc email). Status quo; no unification.

**Recommendation: A.** Build a thin dispatch/preferences/template layer around the existing `Notification` + email infrastructure, route external channels through the Topic-07 job queue, and add channels incrementally.

## 5. Recommended architecture

- **Event → `NotificationDispatcher`**: input = event (type, category, priority, payload, target spec). Resolve recipients (by username / role-in-branch / branch), load per-user **preferences**, pick channels.
- **Channels** (`NotificationChannel` interface): `InAppChannel` (writes `Notification` — exists), `EmailChannel` (wraps existing mail infra), future `SmsChannel`/`WhatsAppChannel`/`PushChannel`. External channels **enqueue background jobs** (Topic 07) for retry + delivery status.
- **Templates**: `NotificationTemplate` (per event type + channel + locale EN/AR), rendered with payload; reuse `emailImageInliner`/`juice` for email.
- **Preferences**: `NotificationPreference` per user × category × channel (+ quiet hours, digest). CRITICAL bypasses opt-out.
- **Delivery record**: `NotificationDelivery` (channel, status QUEUED/SENT/FAILED, attempts, error) for external channels.
- **Real-time (optional)**: add SSE/WebSocket for instant in-app delivery; keep polling as fallback.
- **Event sources**: approvals (Topic 05), low-stock (inventory threshold sweep), payment/inventory alerts, failed jobs (Topic 07), scheduled reminders (`@Scheduled`), system events (Topic 04).

## 6. Database / schema impact (design only)

- New (additive, Flyway-guarded): `notification_preference`, `notification_template`, `notification_delivery`. Add nullable `target_role`, `target_branch_id`, `channel` columns to `notifications` if role/branch targeting is stored on the record. Indexes on `(target_username, is_read, created_at)` (in-app inbox) and `(status, attempts)` (delivery). No drops.

## 7. Backend changes

- `NotificationDispatcher` + `NotificationChannel` SPI; `InAppChannel` (reuse `NotificationService`), `EmailChannel` (reuse mail infra), external channels enqueue jobs.
- Recipient resolution (user/role/branch via RBAC + `BranchAccessService`).
- Template rendering + preferences service; delivery-status tracking.
- Event hooks: approvals, low-stock sweep, payments, failed jobs, reminders, system events.
- Optional SSE/WebSocket endpoint for real-time.

## 8. Frontend changes

- Extend the existing bell/`NotificationContext`: richer inbox (filters by category/priority, mark-read/dismiss — mostly exists), preferences page (channels per category, quiet hours), delivery indicators.
- Optional SSE subscription to replace/augment `useHeartbeat` polling.

## 9. API changes

- Existing notification endpoints kept. Add `GET/PUT /api/notifications/preferences`, `GET /api/notifications/history`, template admin CRUD, optional `GET /api/notifications/stream` (SSE). Backward compatible.

## 10. Security considerations

- Recipient resolution must respect branch scope (don't notify across branches inadvertently) and RBAC.
- External channel provider secrets stored via existing encrypted-config pattern (`EncryptedStringConverter`/`EmailConfigService`).
- Rate-limit/dedup external sends (Topic 03) to avoid spam/abuse and cost.
- Unsubscribe honored except for CRITICAL/security notices.

## 11. Performance considerations

- External sends async via job queue (Topic 07) — never block requests.
- Digest/dedup/throttle high-volume alerts (low-stock) to avoid floods.
- SSE reduces polling load vs. `useHeartbeat`; cap connection counts.
- Index inbox queries; paginate history (already paged).

## 12. Configuration requirements

- `notifications.email.enabled`, `notifications.sms.enabled` (future), provider configs (per tenant, encrypted), digest windows, quiet-hours defaults, `notifications.realtime.enabled` (SSE). Toggle convention as existing.

## 13. Migration strategy

1. Add dispatcher + preferences/templates/delivery tables (in-app unchanged). 2. Wire `EmailChannel` through job queue for one event (e.g. approvals). 3. Add event hooks (low-stock, payments, failed jobs, reminders). 4. Add preferences UI. 5. Optional SSE real-time. 6. Add SMS/WhatsApp/Push channels later. Reversible via channel/event toggles.

## 14. Risks and dependencies

- Risk: alert floods → digest/dedup/throttle mandatory.
- Risk: external delivery failures → retry + status + fallback to in-app.
- Risk: cross-branch mis-targeting → scope-aware recipient resolution.
- Dependency: background jobs (Topic 07) for external retry; caching (Topic 06); rate limiting (Topic 03); existing mail + encrypted-config infra.

## 15. Step-by-step implementation plan

1. Build `NotificationDispatcher` + `NotificationChannel` SPI; register `InAppChannel` (reuse existing service).
2. Add preferences/templates/delivery tables + services.
3. Implement `EmailChannel` routed through the job queue with delivery status.
4. Wire first event source (approval notifications, Topic 05).
5. Add low-stock/payment/inventory/failed-job/reminder hooks with dedup/digest.
6. Preferences UI + richer inbox; optional SSE real-time.
7. Add SMS/WhatsApp/Push channels when providers are chosen.

## 16. Open questions

1. Channel priorities for phase 1 — in-app + email only, or SMS/WhatsApp soon?
2. Provider choices for SMS/WhatsApp (per tenant)?
3. Real-time via SSE/WebSocket now, or keep polling?
4. Default preferences and CRITICAL-override policy?
5. Digest strategy for high-volume alerts (immediate vs. batched)?
6. Role/branch targeting stored on the notification or resolved at send time?

## 17. Recommendation

**Extend, don't replace.** Keep the solid in-app `Notification` framework as the core record and inbox, and add a thin **dispatcher + channel SPI + preferences + templates** layer on top. Wire **email** first (reusing the existing mail + bilingual-inlining infrastructure) through the **Topic-07 background queue** for retry and delivery status, then connect the key event sources (approvals, low-stock, payments, failed jobs, reminders). Add SMS/WhatsApp/Push as additional channels later. Consider SSE for real-time in-app delivery to relieve the current polling `useHeartbeat`.
