# Branch-Level Inventory — Phase 12 Per-Tenant Rollout Runbook

> **Phase 12 of the [Branch-Level Inventory roadmap](01-branch-level-inventory-roadmap.md).** Ops runbook for enabling `inventory.branch-scope.enabled` per tenant. **No application code changes** — this is configuration + validation.
>
> **Rehearsal status:** the full enable → validate → rollback cycle was rehearsed end-to-end on the local `testdb` on 2026-07-11 (results in §7). Recommended rollout order: **qa → one low-risk client → broader**.

---

## 1. What this rollout does

Flipping `inventory.branch-scope.enabled` from `false` → `true` for a tenant switches inventory **reads** from company-wide to branch-scoped:
- Branch users see their branch's stock/master-data/reports (+ global `NULL`-branch rows).
- Admins in **All-Branches** still see everything (consolidated) — unchanged.
- POS availability is scoped to the active branch's warehouses.
- Cross-branch transfers enforce Option-A authorization (source send / destination receive).
- The frontend's branch indicators (Phase 11) light up automatically once the status endpoint returns `enabled:true`.

**Phases 1–11 are already deployed and behaviour-neutral.** This runbook only flips the read-path switch, per tenant, after that tenant's data passes the §3 audit.

## 2. Critical safety property (why rollback is instant and lossless)

**Enabling or disabling the flag mutates NO data.** The `branch_id` columns are already populated (Phases 1–6A) and are read either way. The flag only selects *which query runs* (scoped vs. unscoped). Therefore:
- **Rollback = set the flag back to `false` (or remove the override) + restart.** Figures return to exactly the company-wide values. No data migration, no cleanup, no loss.
- Rehearsed on `testdb`: with the flag off after a full toggle-on cycle, valuation, on-hand, and report-row counts returned to the exact pre-enablement control numbers (§7, rollback).

## 3. Per-tenant pre-enablement audit (GATE — run before flipping any tenant)

Run against **that tenant's** database. **Do not enable** until every check passes (or the exception is understood/accepted). All read-only.

```sql
-- A) All branch_id columns present on inventory tables (expect all 10 → 1):
SELECT table_name, count(*) FILTER (WHERE column_name='branch_id') AS has_branch_id
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
  ('stock_movements','inventory_balances','products','warehouses','departments',
   'sub_departments','brands','units','barcode_templates','product_barcodes')
GROUP BY table_name ORDER BY table_name;

-- B) Warehouses: null-branch (global) warehouses must be KNOWN (they're visible to all branches):
SELECT count(*) total, count(branch_id) with_branch, count(*)-count(branch_id) null_branch FROM warehouses;
SELECT id, name, status FROM warehouses WHERE branch_id IS NULL ORDER BY id;

-- C) Orphan stock_movements (warehouse_id with no warehouse) — expect 0:
SELECT count(*) FROM stock_movements sm
WHERE sm.warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id=sm.warehouse_id);

-- D) stock_movements branch backfill coverage (null = global, acceptable if warehouse is global):
SELECT count(*) total, count(branch_id) stamped, count(*)-count(branch_id) null_branch FROM stock_movements;
-- Reconciliation: any movement against a branch-owned warehouse left null? (expect 0)
SELECT count(*) FROM stock_movements sm JOIN warehouses w ON w.id=sm.warehouse_id
WHERE w.branch_id IS NOT NULL AND sm.branch_id IS NULL;

-- E) inventory_balances branch correctness (branch must equal its warehouse's branch) — expect 0 mismatches:
SELECT count(*) FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id
WHERE ib.branch_id IS DISTINCT FROM w.branch_id;

-- F) Per-branch uniqueness indexes present (Phase 6A) — expect 16:
SELECT count(*) FROM pg_indexes WHERE indexname LIKE 'ux_%_global' OR indexname LIKE 'ux_%_branch';

-- G) Branch.defaultWarehouse coverage (§14.7) — capture branches with no default warehouse:
SELECT id, name, code, default_warehouse_id FROM branches ORDER BY id;
```

**Green criteria:** A = all present · C = 0 · D reconciliation = 0 · E = 0 · F = 16. B/G are *informational* (must be known, not necessarily zero). A branch with no default warehouse (G) is **not** an enablement blocker (backfill is warehouse-driven), but should be resolved for POS/purchase default-warehouse UX.

## 4. Capture control numbers (before enabling)

Record these with the flag **off**. They MUST be reproducible after rollback, and the admin-consolidated ones MUST be unchanged by enabling.

```sql
-- C1 Consolidated inventory valuation (admin All-Branches invariant):
SELECT COALESCE(SUM(quantity*unit_cost),0) FROM stock_movements
WHERE quantity>0 AND unit_cost IS NOT NULL AND unit_cost>0;

-- C2 Per-branch on-hand control set (pick 3+ products across 2+ branches for a fuller set):
SELECT w.branch_id, COALESCE(SUM(sm.quantity),0) AS on_hand
FROM stock_movements sm JOIN warehouses w ON w.id=sm.warehouse_id
GROUP BY w.branch_id ORDER BY w.branch_id;

-- C3 SOH report rows: consolidated vs each branch (+global):
SELECT 'consolidated' scope, count(*) rows FROM (SELECT product_id,warehouse_id,batch_number,expiry_date FROM stock_movements GROUP BY 1,2,3,4) x;
-- repeat per branch with: WHERE (branch_id IN (<branchId>) OR branch_id IS NULL)
```

## 5. Enablement procedure

1. **Audit passed** (§3) + **control numbers captured** (§4) for this tenant.
2. In the tenant's profile `application-<tenant>.properties`, add:
   ```
   inventory.branch-scope.enabled=true
   ```
   (Governance keys default to `creation-enabled=true`, `allowed-roles=SUPER_ADMIN,ADMIN,BRANCH_ADMIN` — override per tenant only if required.)
3. **Restart** the tenant's app instance. (No migration runs; `branch_id` already present. Flyway is idempotent.)
4. Verify boot: log shows `Started BillbullBackendApplication`, no errors.
5. Confirm the flag is live: `GET /api/inventory/branch-scope/status` returns `{"enabled": true}` (authenticated). The frontend indicators will appear automatically.
6. Run the §6 post-enablement validation.
7. **Communicate to the client** before/at enablement: on-hand figures change from company-wide to per-branch for branch users (expected). Admins in All-Branches are unaffected.

## 6. Post-enablement validation checklist (per tenant)

- [ ] **Per-branch on-hand** matches the C2 control set (branch user at each branch).
- [ ] **Admin All-Branches** consolidated valuation = **C1** (unchanged).
- [ ] **SOH report** rows per branch = **C3** per-branch counts; `?branchScope=all` returns the consolidated count.
- [ ] **Global (NULL-branch) master data + stock** visible in **every** branch.
- [ ] **POS availability**: a product stocked only in branch A shows reduced/zero available at branch B's till; RESERVED/one-batch-one-unit rules intact; global-warehouse stock available everywhere.
- [ ] **Cross-branch transfer**: create A→B, send (source user), receive (destination user); A on-hand −qty, B +qty, **company total unchanged**; source-only user cannot receive, destination-only cannot send; admin does both.
- [ ] **Per-branch uniqueness**: two branches may reuse a master code; same-branch duplicate rejected; global code stays unique.
- [ ] **Frontend**: branch-context indicator visible; labels reflect the active branch.
- [ ] **Rollback rehearsed** for this tenant (§8) in a maintenance window or confirmed understood.

## 7. Rehearsal results (local `testdb`, 2026-07-11)

| Step | Result |
|---|---|
| Pre-enablement audit (§3) | ✅ all green; 1 note: BR02 has no default warehouse (§14.7, non-blocking) |
| Control numbers | C1 valuation=4550 · C2 br1=36/br2=10 · C3 consolidated=49/br1=48/br2=1 · global depts=127 |
| Full unit+DB suite with flag **ON** | ✅ 332 tests, 0 failures |
| App boot with flag **ON** | ✅ started ~12s, no errors; `/status` registered + secured (403 unauth) |
| Toggle-ON validation | ✅ V1 on-hand br1=36/br2=10 · V2 consolidated=4550 (unchanged) · V3 SOH br1=48/br2=1 · V4 global depts=127 in both branches · V5 transfer company-total unchanged, no double-count |
| **Rollback** (flag OFF) | ✅ valuation→4550, on-hand→46, SOH rows→49 — company-wide figures returned exactly; **no data mutated** |
| Data integrity after cycle | ✅ 101 movements / 3 warehouses / 127 departments (all scratch cleaned) |

## 8. Rollback procedure (instant, lossless)

1. In `application-<tenant>.properties`, set `inventory.branch-scope.enabled=false` (or remove the line).
2. **Restart** the tenant's app instance.
3. Verify `GET /api/inventory/branch-scope/status` → `{"enabled": false}`; frontend indicators disappear.
4. Confirm figures returned to the **C1/C2/C3** control numbers.
- **No data cleanup is required** — enabling/disabling never mutated data; the flag only selects the query. Safe to toggle any number of times.

## 9. Recommended rollout order

1. **qa** — real multi-branch validation, no customer impact. Run §3–§6 here first.
2. **One low-risk client** — after qa sign-off; validate with real customer data + communicate.
3. **Broader rollout** — remaining tenants, each gated by its own §3 audit + §6 validation.

Each tenant is independent and independently reversible (§8). Never enable a tenant whose §3 audit hasn't passed.

## 10. Known follow-ups (do not block rollout; behaviour unchanged where deferred)

1. **`InventoryReportDataService` (`/data/{reportId}`)** branch-scoping — the main reports page data service stays company-wide until scoped (Phase-10 deferral). The reports page shows an informational branch indicator only.
2. **ProductBarcode-creation branch stamping** — new product barcodes are created global (Phase-9A deferral); resolution handles them via global-fallback.
3. **DTO `branchId`/branch-name exposure** — to wire the ready-built Global/Shared badges + transfer branch indicators (Phase-11 deferral).
4. **BR02 default warehouse** (and any tenant branch lacking one, §14.7) — resolve for POS/purchase default-warehouse UX.

## 11. Sign-off

| Gate | Owner | Status |
|---|---|---|
| `testdb` rehearsal (enable/validate/rollback) | engineering | ✅ complete (§7) |
| Per-tenant audit (§3) passes for target tenant | ops + engineering | ☐ per tenant |
| Control numbers captured (§4) | ops | ☐ per tenant |
| Post-enablement validation (§6) | ops + business | ☐ per tenant |
| Client communicated (on-hand becomes per-branch) | business | ☐ per tenant |
| Rollback understood/rehearsed (§8) | ops | ☐ per tenant |
