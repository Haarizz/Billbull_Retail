# Topic — Approval Workflow (Complete the Existing Framework)

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: complete the approval workflows already partially built. **Do NOT design a new engine from scratch** — the project already has a generic, module-aware approval framework. Identify what exists, what's pending, and how to finish it.

---

## 1. Current system behavior / existing implementation analysis

Two distinct approval mechanisms already exist:

### A. Generic multi-step approval framework (`purchase/lpo/workflow/`) — the real engine
Despite living under `purchase/lpo`, this is **module-agnostic by design**:
- **`ApprovalWorkflowStep`** (config table): `tenantId`, **`module`** (e.g. "LPO"), **`stepOrder`**, **`roleCode`**, `displayName`, `isMandatory`, `activeFlag`. → defines an ordered chain of role-based approval steps per module.
- **`ApprovalHistory`** (per-document trail): `tenantId`, `documentId`, `module`, `stepOrder`, `roleCode`, `displayName`, `approvedBy`, `approvedAt`, `status` (`StepStatus`: PENDING/APPROVED/REJECTED/CANCELLED), `remarks`, `createdAt`.
- **`ApprovalWorkflowService`**: `initializeApproval(lpo)`, `processApproval(...)`, `processRejection(...)`, `revertToDraft(...)`, `revertRejectedToPending(...)`. Role-aware multi-step progression with remarks.
- **`ApprovalWorkflowController`** + `ApprovalHistoryResponse` (UI-facing).

**This is a reusable, multi-level, role-based, per-module approval engine.** It is currently **wired only to LPO** (its method signatures take `Lpo`).

### B. Threshold-based maker-checker for Journal Vouchers (`financials/`)
- Uses the shared `common/workflow/ApprovalStatus` enum (DRAFT, PENDING_APPROVAL, PARTIALLY_APPROVED, APPROVED, REJECTED).
- Manual JVs above `financials.jv.approval-threshold-aed` (default 10000) require second-approver sign-off before posting (`JournalEntryService`/`JournalVoucher`).

### C. Ad-hoc status enums
- `inventory/stocktake/` uses `ApprovalStatus` for stock-take approval (expiry write-off journal hooked to approval).
- `purchase/invoice/PurchaseInvoice` and `purchase/lpo/Lpo` carry `ApprovalStatus`.

**Summary:** The building blocks (generic step engine + shared status enum + a threshold pattern) all exist. What's missing is **wiring them to the other document types** and a **config/notification/escalation layer**.

---

## 2. Missing functionality (per requested workflow)

| Workflow | Status today | Missing |
|---|---|---|
| Purchase Approval (LPO) | **Implemented** (engine A) | Config UI for steps; notifications; escalation |
| Purchase Invoice Approval | Partial (has `ApprovalStatus`) | Not wired to engine A |
| Purchase Return Approval | **No** | Wire to engine A |
| Sales Return Approval | **No** | Wire to engine A |
| Price Change Approval | **No** | New; ties to `ProductBranchPricing`/pricing |
| Discount Approval | Partial (POS `maxDiscount` guard on product) | No approval flow above threshold |
| Stock Adjustment Approval | Partial (stock-take uses `ApprovalStatus`) | Generalize to engine A |
| Inventory Approval | **No** | Define scope |
| Expense Approval | **No** | Wire `expensevoucher`/`expense` to engine A + threshold |
| Payment Approval | Partial (finance JV threshold) | Payment/receipt vouchers not gated |
| New Employee / Activation / User Creation Approval | **No** | Wire HR/user create to engine A |
| Branch Creation Approval | **No** | Wire branch create to engine A |
| Customer Credit Approval | Partial (credit-limit guard exists) | No approval flow to raise limit |
| Vendor Approval | **No** | Wire vendor create to engine A |
| Journal Voucher | **Implemented** (pattern B, threshold) | Could migrate to engine A for multi-step |

---

## 3. Challenges and edge cases

1. **Two paradigms** (step-chain A vs. threshold B). Decide: generalize engine A to support **threshold-triggered** steps (only require approval when amount > X), so both paradigms converge.
2. **`documentId`/`module` coupling** — engine methods take `Lpo`. Generalizing needs an interface (`Approvable`: getId/getModule/getBranchId/getAmount/getStatus) so any document can drive the same engine.
3. **Role hierarchy** — steps reference `roleCode`; must align with existing RBAC roles (`security/Permission`, `RolePermissionInitializer`) and the `ROLE_ADMIN > ROLE_BRANCH_ADMIN` hierarchy.
4. **Branch scoping** — approvers should be resolved within the document's branch; a Dubai LPO should route to Dubai approvers.
5. **Concurrent approvals** — two approvers acting on the same step; need optimistic locking on `ApprovalHistory`.
6. **Self-approval** — block the creator from approving their own document (unless explicitly allowed).
7. **Escalation / SLA** — no escalation exists; needs a scheduled sweep.
8. **Reject → resubmit** — engine A has `revertRejectedToPending`/`revertToDraft`; ensure every wired module uses them consistently.
9. **Notifications** — approvers must be alerted; the `Notification` framework exists but isn't wired to approvals.
10. **Audit** — approval actions should feed the audit system (Topic 04) and are already partly in `ApprovalHistory`.

---

## 4. Possible implementation approaches

- **A — Generalize engine A into a shared `approval` module (RECOMMENDED).** Extract `ApprovalWorkflowService` from `purchase/lpo/workflow` into a domain-neutral `common/approval` (or `workflow`) package, operating on an `Approvable` interface + `(module, documentId)` keys (already the schema shape). Wire each document type by implementing `Approvable` and calling `initializeApproval` on submit. Add optional **threshold triggering** so it subsumes pattern B.
- **B — Keep two systems.** Leave JV threshold as-is; extend engine A only to new step-based flows. Simpler now, more divergence later.
- **C — Adopt an external BPM engine (Flowable/Camunda).** Powerful but massive over-engineering for this codebase's conventions; **not recommended**.

**Recommendation: A.** Reuse the existing tables (`approval_workflow_step`, `approval_history`) as-is, promote the service to a shared package, add an `Approvable` abstraction, add threshold + notification + escalation. Minimal schema change, maximal reuse.

---

## 5. Recommended architecture

- **`Approvable` interface**: `getModule()`, `getDocumentId()`, `getBranchId()`, `getAmount()` (nullable), `getApprovalStatus()`, `setApprovalStatus()`.
- **`ApprovalWorkflowService`** (promoted): `initializeApproval(Approvable)`, `processApproval/Rejection`, `revert*` — unchanged logic, generalized signatures.
- **Step config** per `(module)`: ordered `roleCode` steps, `isMandatory`, plus new optional `minAmount` (threshold trigger) and `branchScoped` flag.
- **Resolution**: on submit, if amount ≤ threshold or no steps → auto-approve; else create `ApprovalHistory` PENDING rows for each active step, notify step-1 approvers (by role, within branch).
- **Progression**: each approval advances `stepOrder`; final step → status APPROVED (triggers the document's post-approval action, e.g. LPO release, JV posting, stock-take write-off). Rejection → REJECTED with remarks; resubmit via `revertRejectedToPending`.
- **Notifications** via existing `NotificationService` (targeted to users holding the step's role in the branch).
- **Escalation**: scheduled sweep (`@Scheduled`, like `PosDeviceHealthSweepJob`) escalates steps pending > SLA to the next role / admin.
- **Audit**: every action logged via Topic-04 hooks + retained in `ApprovalHistory`.

## 6. Database / schema impact (design only)

- Additive nullable columns on `approval_workflow_step`: `min_amount NUMERIC`, `branch_scoped BOOLEAN`, `escalation_hours INT`, `escalate_to_role VARCHAR`.
- Additive on `approval_history`: `due_at TIMESTAMP`, `escalated BOOLEAN`. Index `(module, document_id, status)`, `(status, due_at)`.
- Optionally a `module` reference registry table for the config UI (or keep as a code enum).
- No changes to existing document tables beyond ensuring each carries `ApprovalStatus` (LPO/PI/JV/StockTake already do).

## 7. Backend changes

- Promote workflow classes to a shared `approval` package; introduce `Approvable`.
- Implement `Approvable` on: PurchaseInvoice, PurchaseReturn, SalesReturn, ExpenseVoucher, Payment/ReceiptVoucher, StockTake/StockAdjustment, Vendor, Branch, User/Employee, Customer credit-limit change, Price change.
- Add threshold logic + branch-scoped approver resolution.
- Wire notifications + escalation sweep.
- Post-approval callbacks per module (release/post/apply).

## 8. Frontend changes

- **Approvals inbox** page: pending items assigned to the current user's roles/branch, with approve/reject + remarks.
- **Workflow config UI** (admin): per-module ordered steps, roles, thresholds, escalation.
- Document detail: approval timeline (from `ApprovalHistory`), current step, action buttons gated by role/step.
- Notification bell integration for approval requests.

## 9. API changes

- Generalize `ApprovalWorkflowController` to `POST /api/approvals/{module}/{documentId}/approve|reject`, `GET /api/approvals/inbox`, `GET /api/approvals/{module}/{documentId}/history`, config CRUD under `/api/approvals/config`. Keep existing LPO endpoints working (thin adapters).

## 10. Security considerations

- Approver must hold the step's `roleCode` and access to the document's branch (`BranchAccessService`).
- Block self-approval by default; enforce maker-checker separation for finance (already the JV intent).
- All approval mutations audited; RBAC-gate config UI (`APPROVAL_CONFIG` permission).

## 11. Performance considerations

- Approval writes are low-volume; negligible cost. Escalation sweep is a light periodic query on `(status, due_at)`.
- Inbox query indexed on `(module, status, roleCode, branchId)`.

## 12. Configuration requirements

- Reuse `financials.jv.approval-threshold-aed`; add per-module thresholds in step config. Toggle `approval.<module>.enabled` per module (matches `rbac.<module>.enabled` convention). Escalation SLA config.

## 13. Migration strategy

1. Promote engine to shared package (LPO adapter preserves behavior). 2. Add nullable config/escalation columns. 3. Wire notifications + audit to LPO first (validate). 4. Add escalation sweep. 5. Wire additional modules one at a time behind `approval.<module>.enabled` (default off). 6. Build config UI + approvals inbox. Fully reversible per-module.

## 14. Risks and dependencies

- Risk: generalizing the `Lpo`-typed service could regress LPO → mitigate with an LPO adapter + tests.
- Risk: role/branch approver resolution mismatches → validate against RBAC roles.
- Dependency: Notification framework (exists), audit hooks (Topic 04), RBAC roles.

## 15. Step-by-step implementation plan

1. Extract `Approvable` + promote `ApprovalWorkflowService` to shared package; keep LPO working via adapter.
2. Add nullable threshold/escalation/branch columns + indexes.
3. Wire `NotificationService` on step assignment; add audit hooks.
4. Add escalation `@Scheduled` sweep.
5. Implement `Approvable` per module behind `approval.<module>.enabled`, add post-approval callbacks.
6. Build approvals inbox + workflow config UI + document timeline.
7. Optionally migrate JV threshold flow onto the generalized engine.
8. QA per module per tenant.

## 16. Open questions

1. Should engine A absorb the JV threshold pattern (unify to one engine)? (Recommended.)
2. Per-module vs. global approval thresholds and step chains?
3. Approver resolution: by role-in-branch only, or named approvers per branch?
4. Self-approval and delegation (out-of-office) policy?
5. Which modules are in-scope for phase 1 (recommend PI, Purchase/Sales Return, Expense)?
6. Escalation target: next role, branch admin, or global admin?

## 17. Recommendation

**Complete, don't rebuild.** Promote the existing `purchase/lpo/workflow` engine to a shared `approval` module operating on an `Approvable` abstraction, keep its two proven tables, and add threshold triggering, notifications (via the existing `NotificationService`), escalation (via a `@Scheduled` sweep), and audit integration. Wire document types incrementally behind `approval.<module>.enabled` toggles. This reuses everything already built and delivers all the requested workflows with minimal schema change and low regression risk.
