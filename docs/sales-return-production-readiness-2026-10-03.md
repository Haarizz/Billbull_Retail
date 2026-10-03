# Sales Return — Production Readiness & Deployment Audit

**Date:** 2026-10-03
**Branch:** `feature/posclient` @ `031ac383`
**Scope of this document:** verification only. No Sales Return redesign, no accounting change, no
historical remediation was performed.

---

## 1. Executive status

**The Sales Return work itself is READY.** V111 and V112 were validated against a real populated
PostgreSQL database and proved additive, idempotent, correctly ordered and non-destructive. Every
Sales Return, reporting, Day Close and statement test passes. The single-calculation-source design
holds: Day Close performs no sales arithmetic of its own.

**One release-gating item is NOT in the Sales Return code.** The working tree adds a hard-coded
local datasource and a plaintext password to the committed base `application.properties`, and
`application-prod.properties` is the only profile that defines no datasource of its own. Deployed
together, `--spring.profiles.active=prod` would silently connect to `localhost/testdb`. This must
be resolved before the tree is committed or deployed. See §14.

**This release must not be deployed as "the Sales Return release."** The working tree contains four
further unshipped feature streams (footer discount V108, product categories V109, WhatsApp V110,
inventory balance scheduler) and their migrations are interleaved below V111. Deploying V111/V112
necessarily deploys V108–V110. See §2.

**Verdict: CONDITIONAL GO** — conditional on §14's configuration fix and an explicit decision to
ship the bundled unrelated features. Defect 10 remains `BLOCKED — FINANCE DECISION REQUIRED`.

### What was executed vs. what was read

Stated plainly so the evidence is not over-read:

| Verification | Method |
|---|---|
| Migration ordering, idempotency, non-destructiveness | **Executed** against a pg_dump copy of a populated tenant DB |
| No historical backfill; Day Close immutability | **Executed** — SQL assertions + a passing negative control |
| Backend suite (2128 tests), frontend suite (5647 tests), lint, build | **Executed**, with a clean-HEAD baseline for comparison |
| Baseline failure attribution | **Executed** in a clean `git worktree` at HEAD |
| §4 lifecycle, §5 branch isolation, §6 status isolation, §7 refund classification | **Test-suite + code evidence.** No live transaction was driven through a running POS terminal |
| §10 frontend display correctness | **Code reading**, not UI-driven |

---

## 2. Git / change audit

155 changed paths. Classification:

**Sales Return** — `sales/returns/**` (incl. new `credit/`, `reporting/`, `SalesReturnRestockPlan(ner)`,
`SalesReturnSettlementSplit`), `InvoiceBalanceService`, `StatementService`, `CreditVoucherService`,
`PostingEngineService`, frontend `pages/Sales/SalesReturn/**`, `utils/salesReturnPrint.js`.

**Reporting** — `SalesReportDataService`, `SalesAnalyticsService`, `PosSessionService`,
`PosReportDetail`, `posReportViewModel.js`, `reportExcelBuilders.js`, `SalesReportsFull.tsx`.

**Day Close / V112** — `PosDayClose.java`, `V112__pos_day_close_reporting_net_sales.sql`,
`pos/dayclose/PosDayCloseReportingSnapshotTest`.

**Tests** — ~40 new/modified classes backend, ~10 frontend.

**Unrelated / pre-existing — deploys with this release whether or not it is reviewed:**
- Footer discount line allocation — `FooterDiscountAllocator`, `InvoiceFooterDiscountShares`, **V108**
- Product categories — `inventory/category/**`, `QuickAddProductModal`, **V109**
- WhatsApp integration — `settings/whatsapp/**`, `WhatsAppSettings.jsx`, **V110**, and a new
  `permitAll` route `/api/whatsapp/webhook`
- `InventoryBalanceRefreshScheduler`
- Quotation / Proforma / SalesOrder changes
- 5 untracked `POS_SALES_RETURN_*.html` audit documents at the repo root

No unrelated developer work was deleted or overwritten.

### Hygiene scan

| Check | Result |
|---|---|
| Debug statements newly added | **None.** Two files contain `printStackTrace`/`System.out`, both pre-existing and unmodified by this diff |
| `console.log` in changed frontend source | None |
| Hard-coded dates | None |
| Hard-coded branch or tenant IDs | None |
| Temporary files / scratch SQL | `db/analysis/` and `docs/*.sql` are untracked analysis artifacts — intentional, not wired into Flyway (`spring.flyway.locations=classpath:db/migration` only) |
| Credentials / test DB settings | **FINDING — see §14** |
| New unauthenticated endpoint | `/api/whatsapp/webhook` — correct: HMAC `X-Hub-Signature-256` verification with a hard 401 reject, plus the `hub.verify_token` GET handshake. Must be public because Meta calls it |
| Fabricated financial records | None. `mockPOSPaymentData` in `SalesReportsFull.tsx` is a misleading name for a `let … = []` populated from real backend rows; pre-existing |

---

## 3. Database / migration audit

### Ordering and numbering

`V108 → V109 → V110 → V111 → V112`, each taking the next free number above the highest applied.
No script was renumbered into a retired gap (V2/V4/V5/V98), so `spring.flyway.out-of-order`
staying unset is safe. Verified applied in order on a real tenant:

```
installed_rank 108 | version 111 | sales return credit applications  | success
installed_rank 109 | version 112 | pos day close reporting net sales | success
```

### V111 — `sales_return_credit_applications`

Additive and idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, and `pg_constraint` existence guards around both the status CHECK
and the FK. Adds `sales_invoices.return_credited` and `sales_return_items.invoice_item_id`, both
nullable with no backfill. The partial unique index
`ux_srca_return_invoice_applied (return_number, invoice_number) WHERE status = 'APPLIED'` is the
structural idempotency guard behind the approval row lock.

### V112 — Day Close reporting columns

Eight nullable columns, every one wrapped in an `information_schema.columns` existence check
inside a `to_regclass` guard. No `DEFAULT`, no `NOT NULL`, no `UPDATE`. Entity mapping matches the
DDL exactly (`NUMERIC(19,4)` ↔ `precision=19, scale=4`; `VARCHAR(20)` ↔ `length=20`).

`gross_sales` and `net_sales` are deliberately **not** redefined. Their historical meanings — POS
line gross before discount, and the pre-returns taxable base — remain load-bearing for every
existing row, so the reporting basis was given its own explicitly named columns instead.

### Executed validation

**(a) Realistic upgrade path — the one that matters.** A `pg_dump`/`pg_restore` copy of a populated
tenant (42 `pos_day_closes`, 20 `sales_returns`, 210 `sales_invoices`, 280 `stock_movements`,
1893 `ledger_entries`) was rolled back to a V110 state, then migrated with
**`ddl-auto=none`**:

```
Migrating schema "public" to version "111 - sales return credit applications"
Migrating schema "public" to version "112 - pos day close reporting net sales"
Successfully applied 2 migrations to schema "public", now at version v112 (00:00.156s)
Started BillbullBackendApplication in 29.024 seconds
```

Both scripts run with Hibernate DDL fully disabled, and the application boots afterwards.

**(b) No destructive behaviour.** An md5 over the **pre-migration column set only** (so that new
columns do not falsely register as change) was taken before and after:

| Table | Rows | Before | After |
|---|---|---|---|
| `pos_day_closes` | 42 | `e4c8b3a2…da506` | `e4c8b3a2…da506` |
| `sales_returns` | 20 | `a360124a…c54c2` | `a360124a…c54c2` |
| `sales_invoices` | 210 | `2cb60b8a…f207c` | `2cb60b8a…f207c` |
| `stock_movements` | 280 | `9503b55e…841e7` | `9503b55e…841e7` |
| `ledger_entries` | 1893 | `76c423e5…74440` | `76c423e5…74440` |
| `sales_return_items` | 22 | `97786605…663f1b` | `97786605…663f1b` |

**Identical on all six.**

**Negative control (so the result above is meaningful):** a deliberate 1-cent
`UPDATE ledger_entries SET debit_amount = debit_amount + 0.01` on a single row moved the hash
`76c423e5…74440` → `55930f32…d7faa`. The comparison does detect change.

**(c) No backfill.** On the 42 historical `pos_day_closes` rows:

```
total=42  non_null_net_sales=0  non_null_gross=0  non_null_basis=0  non_null_return_value=0
sales_invoices.return_credited   non_null=0
sales_return_items.invoice_item_id non_null=0
sales_return_credit_applications rows=0
```

Old rows return `persistedReporting = null`, exactly as specified.

**(d) Backfill is structurally impossible, not merely avoided.** V112's safety argument rests on
`pos_day_closes` immutability. Verified live:

```
trigger: trg_pos_day_close_immutable
UPDATE pos_day_closes SET reporting_net_sales = 999 WHERE id = (SELECT MIN(id) …);
ERROR:  DAY_CLOSE_IMMUTABLE: pos_day_closes rows cannot be modified or deleted once created.
```

### Finding — a truly empty database cannot be built by Flyway alone (pre-existing)

Against a brand-new empty database with `ddl-auto=none`, migration fails **at V15**, far below this
release:

```
Script V15__serial_master.sql failed
Message : ERROR: relation "sales_invoice_items" does not exist
```

`V1__baseline.sql` does not create the full schema; later scripts assume tables that Hibernate's
`ddl-auto=update` creates. **Consequence for deployment:** Flyway is an additive layer on top of
Hibernate, not a standalone schema builder. An existing tenant upgrades correctly with
`ddl-auto=none` (proved in (a)); **provisioning a new tenant still requires `ddl-auto=update`.**
Not introduced by this release, and not a V111/V112 defect — but it invalidates any deployment plan
that assumes `ddl-auto=none` can stand up a fresh database.

---

## 4. Day Close production audit — exactly one calculation source

Flow verified by reading the path end to end:

```
POS business day → Z Report → NetSalesReportingBlock → closeDay → pos_day_closes
```

`NetSalesReportingBlock.of(...)` is the **only** implementation of the arithmetic. The X-Report
(`PosSessionService:2003`) and Z-Report (`:2340`) both publish it via `toSummaryMap()`. `closeDay`
(`:2623`) recovers it with `fromSummaryMap(summary)` and copies the fields **by key**:

```java
NetSalesReportingBlock reporting = NetSalesReportingBlock.fromSummaryMap(summary);
if (reporting != null) {
    dayClose.setReportingGrossSales(reporting.grossSales());
    …
    dayClose.setReportingNetSalesBasis(reporting.basis());
}
```

No second `gross − returns`, no second `gross − tax` anywhere in the Day Close path. A null block
leaves the columns NULL rather than writing a zero.

All eight persisted fields confirmed present and mapped. The required invariants hold **by
construction**, not by coincidence:

- `reporting_net_sales = reporting_gross_sales − reporting_return_value` — `gross.subtract(retValue)`
- `reporting_net_tax = reporting_sales_tax − reporting_return_tax` — `tax.subtract(retTax)`
- `reporting_net_sales_ex_tax = (gross − salesTax) − (returnValue − returnTax)` — never a
  VAT-inclusive return netted off an ex-VAT figure
- `reporting_net_sales_basis = VAT_INCLUSIVE` — written from
  `SalesReturnReportingTotals.NET_SALES_BASIS`, stored per row so a future basis change is
  detectable rather than silently restating old rows

Evidence: `PosDayCloseReportingSnapshotTest` (11 tests), `PosDayCloseIntegrationTest` (2),
`PosSessionServiceTest` (172) — all pass.

---

## 5. Sales Return lifecycle (§4 scenario)

**Method: test-suite and code evidence. No live transaction was driven through a running terminal.**

The brief's scenario (invoice 1,000 VAT-inclusive, paid 800, return 500) resolves through
`SalesReturnSettlementSplit.of(returnValue, invoiceOutstanding)`:

```
unpaidPortion = min(returnValue, invoiceOutstanding) = min(500, 200) = 200
paidPortion   = returnValue − unpaidPortion          = 500 − 200     = 300
```

Matching the expected `unpaidPortion = 200`, `paidPortion = 300`. `SalesReturnSettlementSplitTest`
asserts this shape directly in `caseC_returnExceedsOutstanding_splitsAtTheOutstanding`
(outstanding 2,000 / return 5,000 → unpaid 2,000, paid 3,000) and asserts
`returnValue == unpaidPortion + paidPortion` plus non-negativity across a parameterised sweep.

| Expectation | Status | Evidence |
|---|---|---|
| Return APPROVED, `returnValue = 500` | Verified | `SalesReturnApprovalSplitTest` (16) |
| Invoice outstanding falls by the unpaid portion only | Verified | `InvoiceBalanceService.recomputeInvoiceBalance` folds `sales_return_credit_applications` into the invoice balance; `InvoiceBalanceServiceTest` |
| Inventory restored exactly once | Verified | `SalesReturnRestockPlanner` + `SalesReturnRestockPlannerTest` (18); restock is now an explicit `restocksInventory` parameter into the posting engine rather than re-derived |
| Return journal + settlement journal | Verified | `SalesReturnApprovalPostingTest` (10); the new `createJournalFromSalesReturnRefundSettlement` posts Dr AR / Cr Bank-or-Merchant-Clearing |
| Customer Statement `RETURN_CREDIT` / `RETURN_REFUND`, net AR −200 | Verified | `StatementServiceTest` (9); brought-forward reads `sumAppliedBeforeDate` on the allocation ledger |
| Sales Report returns 500, net sales −500, VAT-inclusive | Verified | `SalesReportVatTest` (4), `SalesReturnCrossReportReconciliationTest` (10) |
| POS X/Z returns 500, net sales reflects it | Verified | `SalesReturnCrossReportReconciliationTest`, `PosSessionServiceTest` |
| Day Close snapshot agrees with the Z-Report | Verified **by construction** — the columns are copied from the Z-Report's own block | `PosDayCloseReportingSnapshotTest` (11) |

A live two-branch POS smoke test remains the one piece of §4–§6 that only a staging environment can
give; it is listed in §15 as a pre-production gate.

---

## 6. Branch, status and date isolation

**Branch.** Every returns aggregate carries an explicit branch predicate
(`AND (:branchId IS NULL OR r.branch.id = :branchId)`) — `findDayReturnSnapshot`,
`getTotalReturnsBetweenDates`, `countApprovedBetweenDates`, `findDailyReturnsTrend`,
`findByReturnDateAndBranchWithItems`. Selecting Branch A cannot return Branch B's returns, so the
`Returns = 3,000` cross-contamination case is structurally excluded.
`SalesReturnBranchAttributionTest` (9) passes; a cross-branch return is refused outright so that one
branch cannot carry a reversal for a sale another made.

Note: the Back Office Sales Report applies branch scope **in Java** (`matchesReturnBranch`) after
loading the date range, not in SQL. Correct, but see §13.

**Status.** `SalesReturnReportingService.isReportable` admits `APPROVED` only, with no legacy
tolerance for a null status, and the service filters even when the caller supplies its own dataset —
so no caller can opt out. Three repository queries were tightened in this release:

- `findDayReturnSnapshot`: `status <> CANCELLED` → `status = APPROVED` (a DRAFT return was being
  badged on the POS card)
- `getTotalReturnsBetweenDates`: no status predicate → `= APPROVED` (a cancelled return permanently
  inflated the Dashboard Returns KPI)
- `findDailyReturnsTrend`: no status predicate → `= APPROVED`

Evidence: `SalesReturnReportingClassificationTest` (14), `SalesReturnCrossReportReconciliationTest` (10).

**Date.** One resolver, `SalesReturnService.resolveAuthoritativeBusinessDate`, mirroring the
invoice rule: `COALESCE(session.tradingDate, session.sessionDate, branch Business Day)`, with
`BusinessDayWindowService` — the same authority POS session management and Day Close use — as the
fallback, reading the configured POS timezone rather than the server's. `returnDate` and
`tradingDate` are stamped to the same value, so reporting keyed on either lands on the same day.
No second timezone implementation was introduced.

---

## 7. Refund classification

Buckets key on `sales_returns.refund_method`, never on the UI's free-text `returnAction`. The
settled figure is `Σ refundAmount` (the server-derived paid portion), while `value()` stays the
document total that nets off sales — so a part-paid invoice does not report an AR allocation as
money paid out.

`refundsPaidOut()` = CASH + CARD + BANK + legacy residue. Credit vouchers and customer credit are
excluded, because no money moves for either — including them is what made a Z-Report drawer look
short by an amount no cashier had taken. Legacy rows land in `legacyPaidOut` / `legacyLedgerCredit`;
a row neither reading can classify lands in `unclassified()` and is **never** reported as cash out.

`CUSTOMER_CREDIT` with a paid portion remains blocked (`SalesReturnService:981`,
`SalesReturnEligibilityService:363`). **Decision 7 was not implemented.**
Evidence: `SalesReturnRefundSettlementTest` (6), `SalesReturnCashRefundServiceTest` (9).

---

## 8. API contract

| Endpoint | Result |
|---|---|
| `GET /api/pos/sessions/z-report` | Existing keys unchanged; `reporting*` keys added via `putAll(toSummaryMap())` |
| `GET /api/pos/sessions/day-close/summary` | Additive |
| `GET /api/pos/reports/z/{id}` | New `persistedReporting` object, `null` for historical rows |

`netSalesBasis` is published in the payload, so a consumer can assert the basis rather than assume
it. The collision-prone names are prefixed (`reportingGrossSales`, `reportingNetSalesExTax`)
precisely because the bare `grossSales` and `netSalesExTax` keys carry a different, historical
meaning that is left intact.

`PosReportDetail.persistedReporting(...)` returns `null` when `hasReportingSnapshot()` is false, so
a historical snapshot is distinguishable from a day that genuinely reported zero, and nothing
reinterprets a historical `gross_sales`/`net_sales` as the new basis. **Backward compatible for
existing consumers** — no field was removed, renamed or redefined.

---

## 9. Frontend verification

**Method: code reading.**

All reporting figures are read from the backend; no authoritative total is recomputed client-side.
`posReportViewModel.js:449` prefers the persisted columns and falls back to the report JSON:

```js
const netSalesInclTax = Number(
  persistedReporting?.reportingNetSales ?? zSummary.reportingNetSales ?? 0);
```

For a post-V112 snapshot the two are the same number by construction. For a historical snapshot
`persistedReporting` is absent and the stored JSON is served exactly as generated.

| Specific risk | Result |
|---|---|
| Subtracts returns a second time | **Not present** — a targeted scan for returns subtracted off a reporting net found no occurrence |
| Uses `totalRefunds` as Sales Returns | **Not present** — rendered as "Total Refunds (Tender)" / "(In-session)", a tender figure. `posReportViewModel.js:202/493` document that the tile previously showed `totalRefunds` and no longer does |
| Mixes VAT-inclusive and VAT-exclusive | **Not present** — ex-VAT consumers read `reportingNetSalesExTax`, which nets tax off both sides |
| Uses historical gross/net as the new reporting values | **Not present** — `persistedReporting` is `null` for historical rows and nothing substitutes `gross_sales`/`net_sales` |

Surfaces checked: POS X Report, POS Z Report, Day Close, Sales Reports, Dashboard, Analytics,
Excel export (`reportExcelBuilders.js` lines 55–57 read `reportingReturnValue`,
`reportingNetSalesExTax`, `reportingNetSales`), and print views.

---

## 10. Financial safety — Defect 10 untouched

Isolating code (not comment) changes in `PostingEngineService` gives exactly two:

1. `restocksInventory` changed from internally derived to a parameter, so the restock planner is
   the single authority on whether goods came back.
2. A new `createJournalFromSalesReturnRefundSettlement` — `Dr Accounts Receivable /
   Cr Bank | Merchant Clearing`.

The new settlement journal **touches no revenue account at all**, which is correct: revenue was
already reversed by the return journal, so settling the paid portion is purely a balance-sheet
movement.

```
4001 Sales Revenue    — unchanged
4002 Sales Returns    — unchanged
2051 Deferred Revenue — unchanged
```

Recognised-revenue returns still post to **4001**. No redirection to 4002. No P&L change. No
historical journal migration. The only account-constant line in the diff is a Javadoc comment.

**Defect 10 remains `BLOCKED — FINANCE DECISION REQUIRED`.** Decisions 1, 3 and 7 untouched.

---

## 11. Historical-data safety

No `@Modifying` or native statement in the new or changed backend code touches `sales_returns`,
`sales_invoices`, `ledger_entries`, `journal_entries` or `pos_day_closes`. The single bulk `UPDATE`
introduced anywhere in the tree is:

```sql
UPDATE Product p SET p.category = :newName WHERE LOWER(TRIM(p.category)) = LOWER(TRIM(:oldName))
```

— a category-rename cascade belonging to the unrelated product-categories feature (V109). Not a
financial table.

Confirmed absent: historical `pos_day_closes` backfill (and DB-blocked besides, §3(d)), historical
balance correction, historical journal migration. Existing reporting discrepancies remain
untouched, as intended. The only schema change is V111/V112 DDL.

---

## 12. Test results

### Backend — `mvn -o test` against a live PostgreSQL datasource

```
Tests run: 2128, Failures: 2, Errors: 6, Skipped: 0
```

**All 8 are in `WarehouseServiceTest`, and all 8 are baseline failures.** Proven, not assumed: a
clean `git worktree` at `031ac383` with none of the working-tree changes reproduces them exactly.

```
clean HEAD: Tests run: 8, Failures: 2, Errors: 6
```

Cause: strict-stubbing mismatch entirely internal to the inventory warehouse pair — the test stubs
`currentUserHasRole("ADMIN","BRANCH_ADMIN")` while `WarehouseService:188` calls
`currentUserHasRole("ADMIN","SUPER_ADMIN")`. Introduced by the most recent commit, `031ac383`
*fix(inventory): stop BRANCH_ADMIN seeing every branch's warehouses*. **Unrelated to Sales Return,
and left unfixed as out of scope — but it is a red build on `main`'s next merge and needs an owner.**

**Zero failures in any in-scope suite.** Selected: `SalesReturnApprovalSplitTest` 16,
`SalesReturnSettlementSplitTest` 13, `SalesReturnRestockPlannerTest` 18,
`SalesReturnCreationGuardTest` 15, `SalesReturnApprovalPostingTest` 10,
`SalesReturnConcurrencyTest` 11, `SalesReturnReportingClassificationTest` 14,
`SalesReturnCrossReportReconciliationTest` 10, `SalesReturnBranchAttributionTest` 9,
`PosDayCloseReportingSnapshotTest` 11, `PosSessionServiceTest` 172, `StatementServiceTest` 9,
`SalesReportVatTest` 4 — all green.

### Frontend — `npm test`

```
Test Files  8 failed | 100 passed (108)
Tests      16 failed | 5631 passed (5647)
```

Baseline at clean HEAD for the same files: **9 failures.** Breakdown of the 16:

| Count | Classification | Detail |
|---|---|---|
| 9 | **Baseline** | `useDelivery.characterization` (3), `useProductEntry.characterization` (6) — identical at clean HEAD |
| 5 | **New — expected drift** | Source-shape characterization pins on `POSSales.jsx`: `POSSalesArchitecture` ("declares 231 top-level useState pairs" — the suite's own name says *update deliberately*), `PriceCheck`, `PromotionsDialog` (2), `SerialBatch` import-list pins |
| 2 | **Flaky** | `salesReturnVoucherFlow` ("persisted voucher after a confirmed return") and `GlobalSearchModal` ("loading state while a search is in flight") — both **timeouts** (`Test timed out in 5000ms`) under concurrent load. Re-run in isolation: **2 files passed, 76/76 tests passed.** Not fixed, not hidden — classified on evidence |

The 5 new failures are pins that must be re-baselined deliberately as part of this release; none
asserts behaviour. **No new functional frontend failure exists.**

### Lint and build

| | Working tree | Clean HEAD |
|---|---|---|
| `npm run lint` | 84 errors, 4365 warnings | 86 errors, 4327 warnings |
| `npm run build` | **PASS** (1m 17s) | — |

Two fewer errors than baseline; +38 warnings. Large pre-existing lint debt, no new errors.
Production build succeeds (chunk-size warning only).

---

## 13. Performance / query audit

**No N+1.** Every returns report query uses an explicit `LEFT JOIN FETCH r.items`, so items never
lazy-load per row. The statement/AR queries deliberately omit the fetch — the ledger needs header
amounts only.

**Branch and date predicates** are present on all five aggregates (§6). The Z-Report / Day Close hot
path uses `findByReturnDateAndBranchWithItems(date, branchId)` — both predicates in SQL.

**No unnecessary entity loading.** Dashboard and Analytics use `SUM`/`COUNT` projections, not entity
graphs. `SalesReturnReportingTotals` accumulates in one pass over an already-fetched list.

**No duplicate calculation.** This is the release's central design win: one `NetSalesReportingBlock.of`
feeding the Sales Report, X-Report, Z-Report and Day Close.

Three scale observations, **all pre-existing and none a blocker**:

1. **`findDayReturnSnapshot` cannot use an index.** Its predicate is
   `COALESCE(r.tradingDate, r.returnDate) = :date` — a function over two columns, so Postgres must
   sequentially scan `sales_returns`. This runs on POS day-card load. Recommended (post-release):
   `CREATE INDEX idx_sales_return_business_date ON sales_returns ((COALESCE(trading_date, return_date)));`
2. **No composite `(branch_id, return_date)` index.** Only separate single-column indexes exist, so
   the hot path relies on a bitmap AND. Adequate now; worth adding at scale.
3. **`findForReportsAll()` is unbounded** — reached only when both date bounds are null, and the
   Back Office Sales Report then applies branch scope in Java rather than SQL. A shared pattern with
   invoices, orders and deliveries in the same service, not specific to returns.

The shared reporting service introduces **no new expensive pattern**: it consumes datasets the
callers already loaded and adds one indexed per-day query.

---

## 14. Production configuration audit — RELEASE GATE

No secrets were modified and no credential value is reproduced here.

### FINDING 1 (release-gating): local datasource and plaintext password added to base properties

The working tree adds to the committed `billbull-backend/src/main/resources/application.properties`:

```
+server.port=8080
+spring.datasource.url=jdbc:postgresql://localhost:5432/testdb
+spring.datasource.username=postgres
+spring.datasource.password=<plaintext>
```

`CLAUDE.md` states explicitly that this default is "dev only — override locally, **do not commit
changes**."

This matters more than a stray local edit, because of how the profiles resolve:

| Profile | Defines its own `spring.datasource.url`? |
|---|---|
| alfahad, client1, client2, client4, client5, client6, demo, geebu, hilite, leroyalflowers, leroyalgifts, qa, royaltools, testing | yes |
| **prod** | **no** |

`application-prod.properties` contains only `show-sql`, two logging levels, a slow-request
threshold, an audit flag and `jwt.secret`. It has **no datasource**. So with these lines committed,
`--spring.profiles.active=prod` **falls through to the base file and connects to
`localhost:5432/testdb` using a plaintext password.** On a host where that database happens to
exist, the application starts and writes to the wrong database rather than failing loudly.

**Required before commit or deploy — one of:**
1. Revert these four lines and keep the local datasource outside version control
   (`application-local.properties`, env vars, or IDE run config); **or**
2. Give `application-prod.properties` an explicit datasource; **or**
3. If `prod` is not a real deployment profile — every live tenant has its own — delete it or
   document it as unused, so it cannot be selected by accident.

**I deliberately did not apply a fix.** Options 2 and 3 need production values and a deployment
decision I must not invent, and option 1 would break the developer's working local environment and
the very test runs this audit depends on. This is a human decision, not a silent edit.

### FINDING 2: `ddl-auto` is `update`, not `none`

The brief asks to verify production uses `ddl-auto=none`. **It does not.** No profile sets
`ddl-auto`; all 15 inherit `spring.jpa.hibernate.ddl-auto=update` from the base file.

This is a documented, deliberate convention, not a regression: `CLAUDE.md` and the base file both
record that `ddl-auto` stays `update` until each tenant DB is baselined, then flips to `validate`
per tenant. Flyway runs before Hibernate on every boot and its scripts are additive and idempotent,
which is what makes coexistence safe. §3's finding reinforces why the flip cannot simply be made
globally today: Flyway alone cannot build a schema from empty.

**V111 and V112 themselves are fully compatible with `ddl-auto=none`** — proved in §3(a). No change
is needed for this release; the discrepancy with the brief's expectation is reported rather than
"fixed", since flipping it globally would be an unscoped change with real risk.

### FINDING 3: no health endpoint for checklist step 6

`spring-boot-starter-actuator` is on the classpath, but `GET /actuator/health` returned an empty
response on the validated instance. Deployment step 8 needs a concrete substitute — see §16.

### Remainder

| Item | Status |
|---|---|
| Flyway | Enabled, `baseline-on-migrate=true`, `baseline-version=1`, `locations=classpath:db/migration`, `validate-on-migrate=false`. Per existing convention. `db/analysis/` is correctly outside the scanned path |
| POS business timezone | Resolved through `BusinessDayWindowService`, per branch, reading the configured POS timezone. One implementation |
| Branch configuration | No hard-coded branch IDs |
| Logging | No new debug output. `prod` sets `show-sql=false` and raises Hibernate SQL logging thresholds |
| CORS | `CorsConfig` uses an explicit `setAllowedOrigins` allow-list — no wildcard |
| API base URL | `VITE_API_BASE_URL` empty in `.env.production` with `window.location.origin` fallback — correct behind the nginx reverse proxy |
| Frontend env | **Note (pre-existing, committed):** `.env.production` sets `VITE_USE_NEW_POS_PRINT_TEMPLATE=true` while the comment directly above it reads "Local/dev-only for now — do not set in .env.production." Not changed by this release; worth an explicit decision since it alters POS print template resolution in production |
| Report/export config | POI and Playwright unchanged |

---

## 15. Production-readiness decision

| Area | Status | Evidence |
|---|---|---|
| Sales Return transaction | READY | 100+ targeted tests green; split arithmetic asserted |
| POS Sales Return | READY | Shared flow; `SalesReturnCreationGuardTest`, concurrency tests |
| Back Office Sales Return | READY | Same service path |
| Sales Report | READY | `SalesReturnCrossReportReconciliationTest`, `SalesReportVatTest` |
| POS X Report | READY | Shared `NetSalesReportingBlock`; reconciliation tests |
| POS Z Report | READY | Shared block; `PosSessionServiceTest` (172) |
| Day Close persistence | READY | V112 validated on a populated DB; `PosDayCloseReportingSnapshotTest` |
| Inventory reporting | READY | Restock planner tests; stock movement ledger untouched |
| Customer Statement | READY | `StatementServiceTest`; allocation-ledger brought-forward |
| VAT reporting | READY | Basis published and persisted; ex-VAT derived on both sides |
| Financial / GL current model | READY | 4001/4002/2051 unchanged; settlement journal is balance-sheet only |
| Branch isolation | READY | SQL predicates on all aggregates |
| Status isolation | READY | APPROVED-only, no null tolerance, enforced centrally |
| Historical data safety | READY | Six-table md5 identical, with a passing negative control |
| API compatibility | READY | Purely additive; historical rows null |
| Frontend display | READY | Backend-authoritative; no double subtraction |
| **Production configuration** | **BLOCKED** | **§14 Finding 1 — base-properties credential + prod datasource fallback** |
| Defect 10 | BLOCKED | Finance |
| Historical remediation | NOT DONE | Intentionally excluded |
| `WarehouseServiceTest` (8) | BASELINE FAILURE | Pre-existing at `031ac383`; needs an owner |
| Frontend shape pins (5) | ACTION | Re-baseline deliberately |

**Decision: CONDITIONAL GO.**

Mandatory before deployment:
1. Resolve §14 Finding 1.
2. Decide explicitly whether V108–V110 (footer discount, product categories, WhatsApp) ship with
   this release — they are inseparable from V111/V112 by migration ordering.
3. Re-baseline the 5 frontend shape characterization pins.

Strongly recommended:
4. A live two-branch staging smoke test (§5/§6) — the one gap test-suite evidence cannot close.
5. Assign the `WarehouseServiceTest` baseline failure.
6. Decide on `VITE_USE_NEW_POS_PRINT_TEMPLATE` in `.env.production`.

---

## 16. Deployment checklist

Validated procedure. **Not executed against production.**

```
1.  Backup the tenant database
      pg_dump -U <user> -h <host> -d <tenant_db> -Fc -f pre_v112_<tenant>_<date>.dump
      Verify the dump restores into a scratch database before continuing.

2.  Confirm the pre-deploy Flyway version
      SELECT version, description, success
        FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
      Expect the highest applied version to be 110. Note it for the rollback record.
      (Order by installed_rank, not version — version is a varchar and sorts '99' above '112'.)

3.  Resolve §14 Finding 1 before building the artifact.
      Confirm the shipped application.properties carries no local datasource or password, and
      that the target profile defines its own datasource.

4.  Deploy the backend artifact
      mvn package      (from billbull-backend/)

5.  Start the application with the tenant profile — never 'prod' unless §14 is resolved
      java -jar billbull-backend.jar --spring.profiles.active=<tenant>

6.  Verify Flyway applied V111 and V112
      Logs:  Migrating schema "public" to version "111 - sales return credit applications"
             Migrating schema "public" to version "112 - pos day close reporting net sales"
             Successfully applied 2 migrations to schema "public", now at version v112
      SQL:   SELECT version, success FROM flyway_schema_history
                WHERE version IN ('111','112');     -- expect 2 rows, success = true

7.  Verify application startup
      Logs:  Started BillbullBackendApplication in <n> seconds
      No APPLICATION FAILED TO START, no UnsatisfiedDependencyException.

8.  Verify the service answers
      NOTE: /actuator/health returned empty on the validated instance (§14 Finding 3).
      Use instead:  curl -i -X POST <base>/api/auth/login -H 'Content-Type: application/json' -d '{}'
      A 400 confirms the app is up and routing. A connection refusal or 502 does not.

9.  Verify the database schema
      SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pos_day_closes' AND column_name LIKE 'reporting%';   -- expect 8
      SELECT to_regclass('public.sales_return_credit_applications');             -- expect non-null

10. Confirm no historical backfill occurred
      SELECT COUNT(*) AS total, COUNT(reporting_net_sales) AS filled FROM pos_day_closes;
      'filled' must equal the number of days closed AFTER this deploy — 0 immediately after it.

11. Deploy the frontend
      npm run build   (from billbull-frontend/), then publish dist/ behind nginx.

12. Smoke test Sales Return
      Raise a return against a part-paid invoice. Confirm: status APPROVED; invoice outstanding
      falls by the unpaid portion only; stock restored exactly once; return and settlement
      journals present; the statement shows RETURN_CREDIT and RETURN_REFUND.

13. Smoke test the X Report
      Return value and Net Sales reflect the return; drawer figures exclude credit-voucher and
      customer-credit returns.

14. Smoke test the Z Report
      netSalesBasis = VAT_INCLUSIVE; reportingNetSales = reportingGrossSales - reportingReturnValue.

15. Smoke test Day Close
      Close the day, then:
        SELECT reporting_gross_sales, reporting_return_value, reporting_net_sales,
               reporting_net_sales_basis
          FROM pos_day_closes ORDER BY id DESC LIMIT 1;
      net_sales must equal gross_sales - return_value; basis must read VAT_INCLUSIVE; the row
      must agree with the Z Report just issued.

16. Open a historical Z Report (a pre-deploy day)
      It must render from its stored JSON with persistedReporting = null, and must NOT present
      gross_sales or net_sales as the new reporting basis.

17. Verify logs
      No Flyway warnings, no posting-engine PostingException, no SalesReturn business-date warnings.
```

---

## 17. Rollback assessment

### Application rollback — SAFE

**The previous backend and frontend can run against the V112 schema.** All V111/V112 additions are
nullable columns, a new table and new indexes. The prior application version never references them,
and nothing it does read was redefined — `gross_sales` and `net_sales` keep the exact meanings every
historical row was written under, which is precisely why they were not reused.

Two consequences to accept, neither a data-integrity problem:

- Days closed by the new version keep populated `reporting_*` columns. The old version ignores them.
  No value is lost; it simply is not displayed.
- Rows written to `sales_return_credit_applications` remain. The old code does not read them, so an
  invoice whose balance the new code reduced via an allocation row will have its balance derived by
  the old rule instead. **Reconcile AR after any rollback that followed live return approvals.**

Frontend rollback is clean: `reporting*` and `persistedReporting` are additive, and the old bundle
simply does not request them.

### Database rollback — NOT RECOMMENDED, and no down migration is provided

Because V112 is additive, **the correct rollback is to leave the schema in place** and roll back only
the application. Deliberately no destructive down migration was written:

- Dropping the eight `reporting_*` columns would discard the authoritative Net Sales of every day
  closed under the new version — data that cannot be regenerated, because `pos_day_closes` is
  immutable at the DB level (`trg_pos_day_close_immutable`, verified in §3(d)) and cannot be
  re-closed.
- Dropping `sales_return_credit_applications` would destroy the record of which invoice each return
  credit reduced — the fact every AR surface actually needs.
- The additive columns impose no constraint, default or trigger on the old code path, so there is no
  functional reason to remove them.

If the schema genuinely must be reverted, restore the step-1 `pg_dump` into a fresh database and
repoint the application. That is a financial-period restore and needs the same Finance sign-off as
any rewrite of closed periods.

**Summary: application rollback is safe while retaining the additive V112 columns.**

---

## 18. Known issues

| # | Issue | Severity | Owner |
|---|---|---|---|
| 1 | Local datasource + plaintext password in base `application.properties`; `prod` profile has no datasource and falls through to it | **RELEASE GATE** | This release |
| 2 | `WarehouseServiceTest` — 2 failures / 6 errors, pre-existing at `031ac383` | High (red build) | Inventory |
| 3 | 5 frontend source-shape pins fail after `POSSales.jsx` edits | Medium | This release — re-baseline |
| 4 | Four unrelated feature streams (V108–V110 + scheduler) ship inseparably with V111/V112 | Medium — needs a decision | Release manager |
| 5 | Flyway cannot build a schema from empty (fails at V15); new tenants need `ddl-auto=update` | Medium (docs) | Platform |
| 6 | `findDayReturnSnapshot` predicate `COALESCE(trading_date, return_date)` is unindexable | Low — scale | Post-release |
| 7 | No `/actuator/health` despite actuator on the classpath | Low | Platform |
| 8 | `.env.production` sets `VITE_USE_NEW_POS_PRINT_TEMPLATE=true` against its own comment | Low — needs a decision | POS |
| 9 | `mockPOSPaymentData` misleadingly named; holds real backend rows | Cosmetic | Backlog |
| 10 | 2 frontend tests time out under concurrent load; pass in isolation | Flake | Backlog |
| 11 | 9 baseline frontend characterization failures (`useDelivery`, `useProductEntry`) | Pre-existing | Backlog |

---

## 19. Finance decision blocker

**Defect 10 — `BLOCKED — FINANCE DECISION REQUIRED`.**

A Sales Return against recognised revenue debits **4001 Sales Revenue** rather than
**4002 Sales Returns**, so returns are netted against revenue instead of accumulating in the
contra-revenue account. This release **deliberately preserves that behaviour.**

Nothing was changed: no redirection to 4002, no P&L handling change, no historical journal
migration, no historical financial correction. Verified by isolating the code changes in
`PostingEngineService` (§10) — the only account-constant line in the diff is a Javadoc comment.

Finance must decide (a) whether recognised-revenue returns should post to 4002 going forward, and
(b) whether historical journals are restated or left. Both are out of engineering scope until that
decision exists. Note that (b) touches closed periods and `pos_day_closes` is immutable by DB
trigger, so any restatement is an explicit, audited project rather than a migration.

Decisions 1, 3 and 7 remain untouched. Customer Credit (Decision 7) is **not** implemented:
`CUSTOMER_CREDIT` with a paid portion is still blocked.
