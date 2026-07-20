# Approval Workflow — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`05-approval-workflow.md`](05-approval-workflow.md) (Approach A — **complete, don't rebuild**: promote the existing `purchase/lpo/workflow` engine to a shared `approval` module operating on an `Approvable` abstraction; reuse the two proven tables; add threshold triggering + notifications + escalation + audit; wire documents behind `approval.<module>.enabled`). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - **Reuse, don't replace.** The `approval_workflow_step` + `approval_history` tables and `ApprovalWorkflowService` logic stay; only signatures generalize.
> - **LPO must never regress** — an LPO adapter preserves exact current behaviour and is the reference test throughout.
> - Each new document type is wired behind `approval.<module>.enabled` (default off), per-tenant, like `rbac.<module>.enabled`.
> - **Block self-approval** by default; enforce maker-checker separation for finance.
> - Approver resolution is **branch-scoped** — a Dubai document routes to Dubai approvers (via `BranchAccessService`).
> - Schema changes are **additive, nullable, Flyway-guarded**.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| Generic engine exists under `purchase/lpo/workflow/` (`ApprovalWorkflowStep`, `ApprovalHistory`, `ApprovalWorkflowService`, controller) | ✅ (per design §1) | Module-agnostic schema (`module`, `stepOrder`, `roleCode`) but service typed to `Lpo`. |
| Shared `common/workflow/ApprovalStatus` enum | ✅ (CLAUDE.md `common.workflow.ApprovalStatus`) | JV maker-checker + stock-take + PI/LPO use it. |
| JV threshold pattern (`financials.jv.approval-threshold-aed`, default 10000) | ✅ (CLAUDE.md + memory `financial_flow_phase8`) | Candidate to converge onto engine A via threshold steps. |
| `NotificationService` exists (in-app) | ✅ (CLAUDE.md `notification/`) | Wire approvals to it (also Topic 09). |
| `@Scheduled` sweep pattern exists (`PosDeviceHealthSweepJob`) | ✅ (CLAUDE.md) | Template for escalation sweep. |
| Next Flyway version | ⚠️ | Docs say "V30"; tree at **V33** → new migration **V34**. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | In-scope module + policy decisions | No | n/a | S |
| 1 | Promote engine to shared package + `Approvable` (LPO adapter) | No (LPO unchanged) | No | M |
| 2 | Additive schema: threshold/escalation/branch columns + indexes | No | n/a | S |
| 3 | Notifications + audit wiring on LPO | Yes (LPO gains alerts) | No | M |
| 4 | Escalation `@Scheduled` sweep | Yes | Config (SLA) | M |
| 5 | Wire first new modules (PI, Purchase/Sales Return, Expense) | Yes (behind toggle) | Yes | L |
| 6 | Approvals inbox + workflow config UI + document timeline | Yes | Follows | L |
| 7 | (Optional) migrate JV threshold onto the generalized engine | Yes | Toggle | M |
| 8 | Expand remaining modules | Yes (behind toggle) | Flip | M (recurring) |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — In-scope module + policy decisions

**Objective.** Decide phase-1 modules, threshold model, approver-resolution model, and self-approval/delegation policy. No code.

**Scope.** Written decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Generalizing without a policy → rework. Mitigation: this phase gates §16 decisions; LPO (already live) validates the engine regardless.

**Testing checklist.**
- [ ] Phase-1 module set confirmed (recommend PI, Purchase/Sales Return, Expense — §16.5).
- [ ] Threshold model: per-module vs. global (§16.2).
- [ ] Approver resolution: role-in-branch vs. named approvers (§16.3).
- [ ] Self-approval + delegation/out-of-office policy (§16.4).
- [ ] Escalation target: next role / branch admin / global admin (§16.6).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §16.2–16.6.

---

## Phase 1 — Promote engine to shared package + `Approvable` (LPO adapter)

**Objective.** Extract the engine into a domain-neutral package operating on an `Approvable` interface; LPO behaves identically via an adapter.

**Scope.** Package move + interface + LPO adapter.

**Files/modules affected.**
- Move `ApprovalWorkflowService`/`ApprovalWorkflowStep`/`ApprovalHistory`/controller from `purchase/lpo/workflow` → new shared `common/approval` (or `workflow`) package.
- New `Approvable` interface: `getModule()`, `getDocumentId()`, `getBranchId()`, `getAmount()` (nullable), `getApprovalStatus()`, `setApprovalStatus()`.
- `Lpo` implements `Approvable`; a thin LPO adapter preserves existing `initializeApproval(lpo)` call sites and endpoints.

**Database changes.** None (tables reused as-is; `module`/`documentId` keys already fit).

**Backend changes.** Generalize method signatures to `Approvable`; logic unchanged. Keep existing LPO endpoints working via thin adapters.

**Frontend changes.** None. **API changes.** None (LPO endpoints preserved).

**Risks.** Generalizing the `Lpo`-typed service regresses LPO (design §14). Mitigation: LPO adapter + a full LPO approval regression test suite before/after the move.

**Testing checklist.**
- [ ] LPO multi-step approve/reject/revert behaves identically (regression suite).
- [ ] `Approvable` implemented by `Lpo`; engine drives it generically in a unit test.
- [ ] `mvn -o test` green; existing LPO endpoints unchanged.

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** Engine in shared package, LPO byte-identical in behaviour, generic path unit-tested.

---

## Phase 2 — Additive schema: threshold/escalation/branch columns + indexes

**Objective.** Add config columns for threshold + escalation + branch-scoping. No behaviour change (columns unused until wired).

**Scope.** One Flyway migration.

**Files/modules affected.** `.../db/migration/V34__approval_threshold_escalation.sql`; `ApprovalWorkflowStep`/`ApprovalHistory` entity fields.

**Database changes.**
- `approval_workflow_step`: `min_amount NUMERIC NULL`, `branch_scoped BOOLEAN NULL`, `escalation_hours INT NULL`, `escalate_to_role VARCHAR NULL` (guarded).
- `approval_history`: `due_at TIMESTAMP NULL`, `escalated BOOLEAN NULL` (guarded).
- Indexes `(module, document_id, status)`, `(status, due_at)` (guarded).
- Existing document tables already carry `ApprovalStatus` (LPO/PI/JV/StockTake) — no change.

**Backend changes.** Entity fields + getters only.

**Frontend/API changes.** None.

**Risks.** Stale-schema on existing tenants (NUMERIC/BOOLEAN/INT nullable = safe). Mitigation: nullable + guarded.

**Testing checklist.**
- [ ] Migration idempotent.
- [ ] Columns + indexes present; existing LPO approval unaffected.
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** S. **Dependencies.** Phase 1.

**Exit criteria.** Columns/indexes present; no behaviour change.

---

## Phase 3 — Notifications + audit wiring on LPO

**Objective.** LPO approvals now notify step approvers and write audit events — proving the cross-cutting wiring on the known-good module.

**Scope.** Engine ↔ `NotificationService` + Topic-04 audit hooks.

**Files/modules affected.** Shared `ApprovalWorkflowService`; `NotificationService`; audit hooks (Topic 04 `logDomainEvent`/approval helper).

**Database changes.** None.

**Backend changes.** On step assignment, resolve step-role holders within the document's branch (`BranchAccessService`) and notify via `NotificationService`. Log every approval mutation to the audit system. `ApprovalHistory` remains the authoritative trail.

**Frontend changes.** Notification bell already exists — verify approval alerts surface (full inbox in Phase 6). **API changes.** None.

**Risks.** Cross-branch mis-notification. Mitigation: branch-scoped recipient resolution; test Dubai LPO notifies only Dubai approvers.

**Testing checklist.**
- [ ] Step-1 assignment notifies role holders in the document's branch only.
- [ ] Approve/reject/revert each write an audit row.
- [ ] No notification leak across branches.
- [ ] LPO behaviour otherwise unchanged.

**Estimated complexity.** M. **Dependencies.** Phase 1; Topic 09 `NotificationService`; Topic 04 hooks.

**Exit criteria.** LPO approvals notify + audit correctly, branch-scoped, with no behaviour regression.

---

## Phase 4 — Escalation `@Scheduled` sweep

**Objective.** Steps pending beyond SLA escalate automatically.

**Scope.** New scheduled sweep + `due_at` population.

**Files/modules affected.** New `ApprovalEscalationSweepJob` (`@Scheduled`, mirroring `PosDeviceHealthSweepJob`); engine sets `due_at = assignedAt + escalation_hours`.

**Database changes.** None (uses Phase-2 columns/indexes).

**Backend changes.** Light periodic query on `(status, due_at)`; escalate overdue PENDING steps to `escalate_to_role` (or next role / branch admin per §16.6); set `escalated=true`; notify.

**Frontend changes.** None yet. **API changes.** None.

**Risks.** Escalation storm on a misconfigured SLA. Mitigation: idempotent (`escalated` flag prevents re-escalation); config-driven SLA; dedup notifications.

**Testing checklist.**
- [ ] Overdue step escalates once; `escalated` prevents repeat.
- [ ] Non-overdue steps untouched.
- [ ] Escalation notification targets the configured role.
- [ ] Sweep query is index-backed and light.

**Estimated complexity.** M. **Dependencies.** Phase 2, Phase 3.

**Exit criteria.** Overdue steps escalate exactly once with correct targeting; no storm.

---

## Phase 5 — Wire first new modules (PI, Purchase/Sales Return, Expense)

**Objective.** Extend approvals to the phase-1 document types behind per-module toggles.

**Scope.** Implement `Approvable` per module + post-approval callbacks + threshold.

**Files/modules affected.**
- `PurchaseInvoice`, `PurchaseReturn`, `SalesReturn`, `ExpenseVoucher` implement `Approvable`.
- Submit paths call `initializeApproval(...)`; post-approval callbacks per module (release/post/apply).
- `application.properties` — `approval.purchaseinvoice.enabled`, `approval.purchasereturn.enabled`, `approval.salesreturn.enabled`, `approval.expense.enabled` (default off).

**Database changes.** None (reuse tables; ensure each doc carries `ApprovalStatus` — add nullable column via a small guarded migration only where missing).

**Backend changes.** Threshold logic (amount ≤ threshold or no steps → auto-approve; else create PENDING steps + notify). Branch-scoped approver resolution. Block self-approval. Post-approval action fires only on final step.

**Frontend changes.** Inbox/timeline in Phase 6. **API changes.** Generalized approval endpoints (Phase 6) or per-module for now.

**Risks.** Post-approval callback firing early/twice. Mitigation: callback only on final-step APPROVED; idempotency guard; per-module regression tests.

**Testing checklist.**
- [ ] Below-threshold doc auto-approves; above-threshold routes to steps.
- [ ] Final approval triggers the module's post-approval action exactly once.
- [ ] Rejection → REJECTED; `revertRejectedToPending` resubmits.
- [ ] Self-approval blocked.
- [ ] Toggle off per module → legacy behaviour (no approval gate).

**Estimated complexity.** L. **Dependencies.** Phases 1–4.

**Exit criteria.** Each phase-1 module approves end-to-end behind its toggle; toggle-off is legacy behaviour.

---

## Phase 6 — Approvals inbox + workflow config UI + document timeline

**Objective.** User-facing approvals: an inbox, admin step configuration, and per-document approval timelines.

**Scope.** Generalized controller + three UI surfaces.

**Files/modules affected.**
- Generalize `ApprovalWorkflowController` → `POST /api/approvals/{module}/{documentId}/approve|reject`, `GET /api/approvals/inbox`, `GET /api/approvals/{module}/{documentId}/history`, config CRUD `/api/approvals/config` (keep LPO endpoints via adapters).
- Frontend: approvals inbox page (pending items for the user's roles/branch), workflow config UI (per-module ordered steps/roles/thresholds/escalation), document-detail approval timeline + role/step-gated action buttons, notification-bell integration.

**Database changes.** None.

**Backend changes.** Inbox query indexed on `(module, status, roleCode, branchId)`; config CRUD gated by `APPROVAL_CONFIG` permission.

**Frontend changes.** Three surfaces above.

**API changes.** New generalized endpoints; LPO endpoints preserved.

**Risks.** Inbox showing items outside the user's role/branch. Mitigation: inbox query filters by role-in-branch; RBAC-gate config UI.

**Testing checklist.**
- [ ] Inbox lists only items the user can action (role + branch).
- [ ] Config UI edits steps/thresholds/escalation; `APPROVAL_CONFIG`-gated.
- [ ] Document timeline shows `ApprovalHistory`; action buttons gated by role/step.
- [ ] `npm run build` + `npm run lint` green.

**Estimated complexity.** L. **Dependencies.** Phase 5.

**Exit criteria.** Approvers work from an inbox; admins configure workflows; documents show live timelines.

---

## Phase 7 — (Optional) migrate JV threshold onto the generalized engine

**Objective.** Converge the finance JV maker-checker onto engine A (threshold-triggered steps), unifying to one engine.

**Scope.** JV `Approvable` + threshold step config.

**Files/modules affected.** `JournalVoucher`/`JournalEntryService` implement `Approvable`; configure a threshold step at `financials.jv.approval-threshold-aed`.

**Database changes.** None.

**Backend changes.** JVs above threshold route through the shared engine instead of the bespoke pattern; below-threshold auto-approve. Preserve maker-checker separation.

**Frontend/API changes.** JV approvals appear in the unified inbox/timeline.

**Risks.** Regressing the proven JV threshold flow (finance-critical). Mitigation: behind a toggle; run the existing JV contract tests (`financial_flow_phase9` memory) against the new path; keep the old path until validated.

**Testing checklist.**
- [ ] JV > threshold requires second-approver via engine; < threshold posts directly.
- [ ] Maker-checker separation enforced (creator can't approve).
- [ ] Existing JV contract tests green on the new path.

**Estimated complexity.** M. **Dependencies.** Phase 5/6. **Optional** — only if unification is chosen (§16.1).

**Exit criteria.** JV approvals run on the shared engine with maker-checker intact and contract tests green.

---

## Phase 8 — Expand remaining modules

**Objective.** Wire the remaining document types (Vendor, Branch, User/Employee, Customer credit-limit, Price/Discount, Stock adjustment) one at a time behind toggles.

**Scope.** Per module: implement `Approvable` + post-approval callback + toggle (repeat Phase 5 pattern).

**Risks.** Multi-actor / inherently-shared documents need policy from Phase 0. Mitigation: per-module toggle, per-module regression tests, roll out singly.

**Testing checklist.** Per module: threshold/auto-approve, final-callback-once, reject/resubmit, self-approval block, toggle-off legacy.

**Estimated complexity.** M (recurring). **Dependencies.** Phases 5–6.

**Exit criteria.** Each added module validated per tenant behind its toggle.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §16) | Needed by | Recommended default |
|---|---|---|
| §16.5 Phase-1 modules | Phase 0/5 | PI, Purchase/Sales Return, Expense |
| §16.2 Per-module vs. global thresholds/chains | Phase 5 | Per-module step config (reuse per-module rows) |
| §16.3 Approver resolution model | Phase 3/5 | Role-in-branch; named approvers later |
| §16.4 Self-approval + delegation policy | Phase 5 | Block self-approval; delegation deferred |
| §16.6 Escalation target | Phase 4 | Configurable `escalate_to_role`, default branch admin |
| §16.1 Absorb JV threshold into engine A | Phase 7 | Yes (unify) — but toggle-gated + contract-tested |

---

## Cross-cutting testing strategy

- **LPO regression suite is the anchor** — the generalized engine must keep LPO byte-identical at Phases 1, 3, 4 (and forever). This is the primary "don't-rebuild-broke-it" guard.
- **Toggle-off legacy invariance** — with `approval.<module>.enabled=false`, a module behaves exactly as before approvals existed. Proven per module at Phase 5/8.
- **Post-approval-callback-once** — a standing test per wired module that the release/post/apply action fires exactly once, only on final-step approval.
- **Branch-scoped approver resolution** — a document in branch X routes/notifies only branch-X approvers.
- **Self-approval block + maker-checker** — creator cannot approve; finance separation enforced.
- **JV contract tests** (existing, `financial_flow_phase9`) gate Phase 7.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 6.
