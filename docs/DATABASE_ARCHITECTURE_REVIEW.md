# BillBull Retail ERP — Enterprise Database Architecture Review

**Reviewer:** Database architecture audit (full-codebase, no-assumptions pass)
**Date:** 2026-06-20
**Scope:** `billbull-backend` — 133 `@Entity` classes, 111 repositories, 112 services, 89 controllers.
**Stack reviewed:** Spring Boot 3.5 / Java 17 / JPA + Hibernate / PostgreSQL, HikariCP, JWT, `ddl-auto=update`.

> Findings below are grounded in the actual source. Every issue cites `file:line` and is paired with an exact SQL fix, JPA fix, and expected impact. Performance percentages are **engineering estimates** for a target of thousands of users / millions of rows, not measured benchmarks — treat them as relative priorities, and confirm with `EXPLAIN ANALYZE` on production-sized data before/after.

---

## 0. Verified architectural facts (the foundation everything rests on)

| Fact | Evidence | Why it matters |
|---|---|---|
| **Multi-tenancy = database-per-tenant** | `application-client1..6.properties`, `application-geebu/hilite.properties` each point at a distinct PG database + port (e.g. `billbull_nest`, `billbull_geebu`). No tenant discriminator column anywhere. | Strong isolation, but **schema drift across tenants** is the central risk: each DB evolves independently under `ddl-auto=update`. |
| **No Flyway / Liquibase** | `pom.xml` has no migration dep; no `db/migration`. `spring.jpa.hibernate.ddl-auto=update` in `application.properties:35`. | Schema is whatever Hibernate diffs at boot. `update` **never drops/alters** columns, enums, or constraints. This is the #1 enterprise blocker (see §1.1). |
| **Runtime schema "patching" at startup** | `config/DatabaseFixConfig.java`, `StockMovementIdentityConstraintConfig.java`, `PeriodLockTriggerInstaller.java` run raw `ALTER TABLE` / `CREATE TRIGGER` on every boot. | This is a hand-rolled migration framework. It works but is unordered, non-versioned, and silently swallows failures (`catch (Exception e) { System.err.println(...) }`). |
| **All Long PKs use `GenerationType.IDENTITY`** | `BaseEntity.java:23-25` and every entity. | IDENTITY disables JDBC batch inserts in Hibernate. Bulk posting (GL lines, stock movements, invoice items) loses batching → more round trips (see §5.3). |
| **GL/ledger PKs are `@Id String` (manually assigned)** | `LedgerEntry.java:13-14`, `Account.java`, `CostCenter.java`. | If the string is a random UUID, B-tree gets random inserts → page splits + bloat on the highest-volume tables. Confirm the generator (see §4.3). |
| **Soft-delete is universal (`is_active`)** | `BaseEntity.java:43-44`; almost every query filters `isActiveTrue`. | But `is_active` is indexed on only **2 of 133** entities (`Product`, `Notification`). Every other soft-deleted list query scans dead rows (see §3). |
| **Money is `Double` in ~half the schema** | 177 `private Double/double` field declarations; POS, Sales (`SalesInvoice`, `SalesInvoiceItem`, `SalesOrder`, `Payment`, `SalesReturn`), `Expense`, `TaxFiling`, `Employee.basicSalary` all use `Double`. | Floating-point money **cannot** represent currency exactly. This is a correctness defect for an ERP, not just a style issue (see §2.1). |

---

## 1. Complete Database Audit Report — issues ranked

Severity: **P0 = correctness/data-loss/security**, **P1 = scale-blocking performance**, **P2 = integrity/maintainability**, **P3 = polish**.

### 1.1 [P0] No versioned migrations + `ddl-auto=update` on a multi-DB fleet
- **What:** Schema changes ship as entity edits. `update` adds tables/columns but never alters types, widens enum `CHECK`s, drops columns, or adds NOT NULL to populated tables. `DatabaseFixConfig` exists *because* of this gap and patches it imperatively.
- **Risk:** A new `NOT NULL` column or a widened enum on an existing tenant DB either fails at boot or silently diverges. Six+ tenant DBs drift apart with no audit trail of what shipped where.
- **Fix:** Adopt **Flyway** (PostgreSQL-friendly, plays well with Spring Boot). Set `ddl-auto=validate` in prod so Hibernate verifies but never mutates. Convert `DatabaseFixConfig` / `StockMovementIdentityConstraintConfig` / `PeriodLockTriggerInstaller` into ordered, versioned `V__*.sql` scripts. See §10 for the migration plan.
- **Impact:** Eliminates the entire class of "stale-schema upgrade" outages; makes the fleet reproducible.

### 1.2 [P0] Money stored as floating point
- **What:** `Double`/`double` used for amounts in POS (`PosSession`, `PosCashMovement`, `PosHeldSale`, `PosLayaway*`, `PosSettings.branchDefaultVatRate`), Sales (`SalesInvoice` ~10 cols `:72-98`, `SalesInvoiceItem` ~8 cols `:27-35`, `SalesOrder` `:45-51`, `SalesOrderItem`, `Payment` `:38-42`, `SalesReturn*`), `Expense.java:43-46`, `TaxFiling.java:36`, `Employee.basicSalary:85`, `InquiryItem`.
- **Risk:** Cent drift accumulates; Z-reports and cash settlements fail to balance; tax totals are off; reconciliation against the (correctly `BigDecimal`) GL **will** drift. The Financials core (`JournalLine`, `GlAccountBalance`, `Quotation`, `ProformaInvoice`) already uses `BigDecimal` — the rest is inconsistent.
- **Fix:** Convert every monetary field to `BigDecimal` with `@Column(precision=15, scale=2)` (rates `scale=4..6`). SQL widens columns to `NUMERIC`. See §2.1 + §9 script `01_money_types.sql`.
- **Impact:** Correctness. Removes a whole category of "books don't tie out" bugs. (Conversion is `double precision → numeric`, lossy in the wrong direction only if values already corrupted; convert early.)

### 1.3 [P0] GL pre-aggregated balance upsert has a lost-update race
- **What:** `PostingEngineService.upsertGlBalances()` does read → `add()` → `save()` on `GlAccountBalance`, but `GlAccountBalanceRepository.findByAccountCodeAndFiscalPeriodIdAndBranchId(...)` has **no `@Lock`** (unlike `VoucherSequenceRepository:21`, `InventoryBalanceRepository:14`, `BatchMasterRepository:101`, `StockMovementRepository:92`, both document-number repos — which all correctly use `PESSIMISTIC_WRITE`).
- **Risk:** Two concurrent postings to the same account/period/branch interleave and one increment is lost → the "fast" balance table silently diverges from `journal_lines`. The nightly `findDriftedAccountCodes()` job detects it after the fact but cannot prevent intraday wrong balances on dashboards.
- **Fix:** Either lock the row (`@Lock(PESSIMISTIC_WRITE)` on a dedicated finder) **or** replace read-modify-write with an atomic `UPDATE ... SET debit_total = debit_total + :dr ...` `@Modifying` query + insert-if-absent. See §5.4.
- **Impact:** Removes silent ledger drift under concurrency — essential at "millions of transactions".

### 1.4 [P0] `User.password` not `@JsonIgnore`; `email` not unique
- **What:** `User.java:31` exposes `password` with a public getter and **no `@JsonIgnore`**. `email` (`:34`) has no unique constraint, yet `AuthController` login falls back to `findByEmailAndIsActiveTrue` — duplicate emails make login non-deterministic.
- **Risk:** Any controller that ever returns a `User` entity (vs. the `UserSafeDto`) leaks the BCrypt hash. Duplicate-email login ambiguity is an auth-integrity bug.
- **Fix:** Add `@JsonIgnore` to `password` (defense-in-depth even though DTOs are used today); add a partial unique index on `lower(email)` where active. See §6.
- **Impact:** Closes a credential-leak footgun and an auth ambiguity.

### 1.5 [P0] JWT signing secret committed in source
- **What:** `application.properties:48` — `jwt.secret=billbull-super-secret-key-32chars-minimum!!`, shared across all tenants, 24h expiry, no rotation.
- **Risk:** Anyone with repo access can forge tokens for **every** tenant.
- **Fix:** Externalize to env/secret manager per tenant; rotate; never commit. `jwt.secret=${JWT_SECRET}`. Document in §6.
- **Impact:** Closes full-auth-bypass exposure.

### 1.6 [P1] Pervasive EAGER fetching → N+1 and cartesian loads
- **What:**
  - `JournalEntry.lines` is `fetch=EAGER` (`JournalEntry.java:93`) **and** `JournalEntry.branch` EAGER (`:49`). `ExpenseVoucher.lines` EAGER.
  - `User.roles` + `User.additionalBranches` both `@ManyToMany(fetch=EAGER)` (`User.java:60,72`) — loaded on **every** `findByUsername` in `JwtFilter` on **every request**.
  - `SalesOrder.branch`, `ProformaInvoice.branch`, `Payment.branch`, `SalesReturn.branch`, `ReconciliationSession.branch`, `PaymentVoucher.branch`, `PurchaseReturn.branch` — EAGER `@ManyToOne`.
  - `SalesReturn.items`, `SalesReturnItem.batches`, `PosLayaway.items`, `StockTakeSession.items`, `StockTakeItem.batches` — EAGER `@OneToMany` collections.
  - **~25 `@ManyToOne` declare no `fetch`** (defaults to EAGER): `Product.brand`/`subDepartment`, all `Product*` one-to-ones, `ProductInventoryPolicy`'s 6 location refs, `SalesOrderAttachment.salesOrder`, `InquiryFollowUp.inquiry`, `StockTakeItemBatch.item`, `InquiryItem.product`, etc.
- **Risk:** Listing N journal entries fires N×(branch + lines) selects; the stock-take EAGER chain can hydrate 50k `stock_take_item_batches` rows for one session (see §1.9). Per-request `User` load drags roles+branches+join-tables every time.
- **Fix:** Default every relationship to `LAZY`; use explicit `JOIN FETCH` (or `@EntityGraph`) only where a query needs the children. See §5.1.
- **Impact:** 50–90% fewer queries on list/report endpoints; per-request auth overhead drops materially.

### 1.7 [P1] "Foreign keys" stored as bare `Long`/`String` → zero referential integrity
- **What:** Dozens of FK-shaped columns are plain scalars with **no** `@ManyToOne` and **no** DB FK constraint. Confirmed cases include: `StockMovement.{productId,warehouseId,zoneId,locatorId,binId,sourceId}`, `InventoryBalance.{productId,warehouseId}`, `BinStock.productId`, `BatchMaster.{productId,warehouseId,zoneId,locatorId,binId}`, `BatchAllocation.{productId,binId,parentAllocationId}`, all POS `branchId`/`posSessionId`, `SalesInvoice.posSessionId`, `*Item.binId`/`salesOrderItemId`, `DeliveryNoteBatchConsumption.{deliveryNoteId,deliveryNoteItemId}`, `PurchaseInvoice.{grnId,lpoId}`, `PaymentVoucher.{invoiceId,lpoId}`, `VendorAdvance.{vendorId,lpoId}`, `Customer.paymentTermsId`, `Vendor.paymentTermsId`, `ApprovalHistory.documentId`, `ProformaInvoice.customerId`, `CustomerInquiry.customerId`, and the GL `accountCode` denormalization.
- **Risk:** Orphans accumulate (stock rows for deleted products, ledger lines for deleted accounts); no cascade; no DB-level guarantee the referenced row exists. Some are *intentional* (polymorphic `sourceId`/`sourceDocumentId`, immutable GL `accountCode` snapshots) — those are defensible and should stay, but be **documented** and indexed.
- **Fix:** For genuine FKs, add DB-level `FOREIGN KEY` constraints (you can keep the scalar column and add the constraint without changing JPA, the least invasive path) and an index. For polymorphic refs, add a composite index on `(type, id)` and a comment. See §2.2 + §9 `03_fk_constraints.sql`.
- **Impact:** Integrity guarantees + faster joins; orphan prevention.

### 1.8 [P1] Missing indexes on high-frequency filter/join/sort columns
- See the dedicated **Missing Index Report (§3)**. Headline gaps: `ledger_entries.(account_code, transaction_date)` (every account statement & trial balance), `is_active` fleet-wide, all child-table FK columns (`*_items.parent_id`), `customers` search columns, audit-log `(username, access_time)`, POS `(branch_id, terminal_id, status)`.

### 1.9 [P1] Stock-take per-unit row model is a table-bloat bomb under EAGER load
- **What:** Per CLAUDE.md + `StockTakeItemBatch`, a counted lot of qty N is **N rows** (`quantity=1` each). Combined with `StockTakeSession.items` EAGER and `StockTakeItem.batches` EAGER, one large session can hydrate tens of thousands of rows into memory in a single fetch.
- **Risk:** OOM / multi-second UI stalls on big counts; `stock_take_item_batches` grows without bound across sessions.
- **Fix:** Make those collections LAZY + paginate the BatchEditor; add a retention/archival policy for completed sessions; consider a `(batch, expiry)` bucketed representation with a `qty` column for the common case (keep per-unit only for serialized goods). See §7 (Inventory Readiness).
- **Impact:** Bounded memory; the difference between a count that completes and one that times out.

### 1.10 [P2] Redundant on-hand caches vs. the `StockMovement` ledger
- **What:** `InventoryBalance` and `BinStock` both cache `SUM(stock_movements.quantity)`; maintained in service code, reconciled nightly.
- **Risk:** Cache divergence on any non-atomic failure; two "sources of truth" for on-hand.
- **Fix:** Keep the caches (they're a valid performance pattern) but make the cache write **same-transaction** with the movement insert (it appears to be — verify), index them, and keep the nightly reconciliation. Document the ledger as the *only* source of truth. See §7.

### 1.11 [P2] `quantity` as `Integer` on the stock ledger
- **What:** `StockMovement.quantity` is `Integer` (`:36`). Many retail/grocery SKUs sell by weight/volume (kg, L).
- **Risk:** No fractional quantities; future ERP growth (FMCG, deli, hardware-by-length) blocked. `SUM(int)` can also overflow for very high-volume SKUs.
- **Fix:** `BigDecimal(precision=18, scale=3)` for quantity ledger-wide. See §7 + §9.

### 1.12 [P2] Audit log unbounded + synchronous in request path
- **What:** `AuditLog` / `FinancialAuditLog` grow forever (no partitioning/retention); `AuditLogService.logAccess` writes inside the request transaction; missing composite indexes for the common `(username, access_time)` / `(branch_id, access_time)` filters; `findByEndpointContaining` does a `LIKE` scan.
- **Risk:** Audit table becomes the largest table, slows writes on the hot path, and audit *reads* full-scan.
- **Fix:** Monthly `RANGE` partitioning on `access_time`; retention job; async write (Spring `@Async`/event) where ordering allows; add the composite indexes. See §6 + §8.

### 1.13 [P2] 88 `repository.findAll()` call sites; several on transactional tables
- **What:** `grep` finds 88 `findAll()` usages. Many are on small config/master tables (fine: `Currency`, `PaymentMethod`, seeders). But `FinancialReportService` loads **all accounts** + all ledger entries per report; `AdminSafeguardService` does `userRepository.findAll().stream()` on every admin mutation; `CustomerService.getAllCustomers()` force-initializes lazy collections in a loop (N+1).
- **Fix:** Replace with `count`/projection/paged queries and DB-side filtering/aggregation. See §4 + §5.

### 1.14 [P3] Double-entry balance not enforced at DB level; String enums in places; dual `branch` (String + FK) migration columns lingering; `EmailConfig.password` plaintext.
- See §2 and §6 for specifics and fixes.

---

## 2. Table-by-Table Review (summary matrix)

Legend: **PK** I=IDENTITY Long, S=manual String. **$**=money-as-Double present. **Idx**=index coverage vs. query needs. **FK?**=bare-Long FKs present.

| Domain / Table | PK | $ | EAGER issue | Bare FK | Idx gap | Notes |
|---|---|---|---|---|---|---|
| `stock_movements` | I | – | – | yes (6) | zone/locator/expiry; `(source_type,source_id)` | ledger SoT; `quantity` Integer; no `branch_id` |
| `inventory_balances` | I | – | – | yes (2) | ok | cache of ledger |
| `bin_stock` | I | – | – | yes | `(bin_id,product_id)` | cache of ledger |
| `batch_master` | I | – | – | yes (5) | ok-ish | per-unit rows |
| `products` + `product_*` | I | some | brand/subDept/one-to-ones EAGER | – | barcode, FK on media | best-indexed table set |
| `pos_sessions`/`pos_*` | I | **yes** | `PosLayaway.items` EAGER | yes | `(branch,terminal,status)` | `supervisorPin` plaintext |
| `stock_take_*` | I | – | items+batches EAGER | yes | status, `(session,product)` | bloat risk §1.9 |
| `sales_invoices`/`_items` | I | **yes** | items LAZY ok | `posSessionId`,`binId` | item FK, itemCode | well-indexed header |
| `sales_orders`/`_items` | I | **yes** | branch EAGER | binId | item FK | |
| `delivery_notes`/`_items` | I | **yes** | – | binId, sourceLineId | item FK, dnNumber | batch consumption table ok |
| `sales_returns*` | I | **yes** | branch+items+batches EAGER | – | – | |
| `quotations`/`proforma` | I | – (BigDecimal ✓) | proforma.branch EAGER | customerId | date,status,validTill,qtnNo | |
| `customers` + children | I | – (BigDecimal ✓) | – | paymentTermsId | code,status,name/mobile/email; child FKs | N+1 in getAllCustomers |
| `lpos`/`grns`/`purchase_invoices` | I | – (BigDecimal ✓) | – | grnId,lpoId,referenceId | grnNo,lpoId,grnId,status | landed-cost ok |
| `payment_vouchers`/`vendor_advances` | I | – (BigDecimal ✓) | PV.branch EAGER | invoiceId,lpoId,vendorId | invoiceId,lpoId | VendorAdvance.status String |
| `vendors` | I | – (BigDecimal ✓) | – | paymentTermsId | – | many no-`length` strings; status String |
| `journal_entries` | I | – (BigDecimal ✓) | lines+branch EAGER | accountCode(line) | `(entry_type,status)` | SINGLE_TABLE; well-indexed otherwise |
| `journal_lines` | I | – (BigDecimal ✓) | – | accountCode | **none — well indexed** | exemplary |
| `ledger_entries` | **S** | – (BigDecimal ✓) | branch EAGER | accountCode | **account_code, transaction_date, reconciled, journalId** | running-balance snapshot per row |
| `gl_account_balances` | I | – (BigDecimal ✓) | – | accountCode | **well indexed** | upsert race §1.3 |
| `accounts`/`cost_centers` | **S** | – | – | – | code(implicit) | manual String PK |
| `expenses`/`tax_filings` | I | **yes** | branch EAGER | – | – | Double money |
| `users` | I | – | roles+branches EAGER | – | email | password not @JsonIgnore |
| `audit_logs`/`financial_audit_logs` | I | – | – | – | `(username,access_time)`, endpoint | unbounded, sync write |
| `user_tasks` | I | – | – | – | `(created_by,is_active)` | no indexes at all |
| `employees` | I | **yes** (basicSalary) | – | – | – | dual branch field |
| `notifications` | I | – | – | targetUsername | **well indexed** | exemplary fan-out |

Full per-entity detail (every field, every relationship, every line ref) is preserved in the domain audit appendices — the matrix above is the actionable digest.

### 2.1 Money-type fix (JPA + SQL pattern)
**JPA** (repeat per field; example `SalesInvoice`):
```java
// before:  private Double invoiceTotal;
// after:
@Column(precision = 15, scale = 2)
private BigDecimal invoiceTotal = BigDecimal.ZERO;
```
**SQL** (Flyway, per column — `USING` makes the cast explicit):
```sql
ALTER TABLE sales_invoices
  ALTER COLUMN invoice_total TYPE NUMERIC(15,2) USING invoice_total::numeric;
```
Rates use `NUMERIC(9,4)`; quantities `NUMERIC(18,3)`. Do this **before** the data grows.

### 2.2 Bare-FK fix (least-invasive: add DB constraint, keep scalar)
```sql
-- example: stock_movements.product_id should reference products(id)
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_sm_product FOREIGN KEY (product_id) REFERENCES products(id);
CREATE INDEX IF NOT EXISTS idx_sm_product_id ON stock_movements(product_id); -- already present here
```
For polymorphic columns (`source_id`, `source_document_id`, `document_id`), **do not** add an FK — add a composite index and a `COMMENT ON COLUMN` documenting the discriminator.

---

## 3. Missing Index Report (apply as Flyway `02_indexes.sql`)

> All use `CREATE INDEX CONCURRENTLY IF NOT EXISTS` in production (no table lock). Partial indexes on `is_active` shrink the index and match the soft-delete query pattern.

```sql
-- ============ SOFT-DELETE (fleet-wide hot filter; add to high-traffic tables) ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_active        ON customers(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_active          ON vendors(is_active);
-- (repeat for sales_orders, delivery_notes, lpos, grns, purchase_invoices, etc. — any list endpoint)

-- ============ GENERAL LEDGER — the biggest win ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_acct_date  ON ledger_entries(account_code, transaction_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_date       ON ledger_entries(transaction_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_journal    ON ledger_entries(journal_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_unrecon    ON ledger_entries(account_code) WHERE is_reconciled = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_je_type_status    ON journal_entries(entry_type, status);

-- ============ CHILD TABLES — FK columns used in JOIN FETCH / cascade ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sii_invoice   ON sales_invoice_items(sales_invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_soi_order     ON sales_order_items(sales_order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dni_dn        ON delivery_note_items(delivery_note_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dni_product   ON delivery_note_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qi_quotation  ON sales_quotation_items(quotation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pii_invoice   ON purchase_invoice_items(invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lpoi_lpo      ON lpo_items(lpo_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grni_grn      ON grn_items(grn_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_cust  ON contact_person(customer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_savedaddr_cust ON saved_address(customer_id);

-- ============ DOCUMENT LOOKUPS / STATUS / DATES ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_status  ON customers(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_mobile  ON customers(mobile);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email   ON customers(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotation_date    ON sales_quotations(date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotation_status  ON sales_quotations(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pinv_lpo          ON purchase_invoices(lpo_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pinv_grn          ON purchase_invoices(grn_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pv_invoice        ON payment_vouchers(invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grn_reference     ON grns(reference_id, source_type);

-- ============ INVENTORY / POS ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_binstock_bin_prod ON bin_stock(bin_id, product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sm_expiry         ON stock_movements(expiry_date) WHERE quantity > 0;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sm_source         ON stock_movements(source_type, source_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sti_session_prod  ON stock_take_items(session_id, product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pos_sess_lookup   ON pos_sessions(branch_id, terminal_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_zone_wh           ON warehouse_zones(warehouse_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locator_zone      ON warehouse_locators(zone_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bin_locator       ON warehouse_bins(locator_id);

-- ============ AUDIT / TASKS ============
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_user_time   ON audit_logs(username, access_time DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_branch_time ON audit_logs(branch_id, access_time DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_creator      ON user_tasks(created_by, is_active);
```
**JPA equivalent** (for new tenant DBs): add the corresponding `@Index` entries to each `@Table(indexes={...})` so `ddl-auto` creates them on fresh DBs too; the SQL handles existing DBs.

**Expected impact:** the GL composite index alone typically turns account-statement / trial-balance queries from full `ledger_entries` scans into index range scans — **order-of-magnitude** improvement on large books. Child-table FK indexes remove the per-row index-less lookups during cascade and `JOIN FETCH`.

---

## 4. Query Optimization Report

### 4.1 [P1] Trial balance / P&L load whole tables into app memory
- `FinancialReportService` calls `accountRepository.findAll()` (all accounts) and fetches all `ledger_entries` for the range, then **filters by cost center in Java** (`stream().filter`).
- **Fix:** Push filtering + aggregation into SQL grouped by `account_code` (and `cost_center`) over the date range; read `gl_account_balances` for period balances instead of re-summing the ledger. Add `idx_ledger_acct_date` (§3).
- **Impact:** Report time scales with *result* size, not total ledger size. Large books: 70–95% faster.

### 4.2 [P1] `CustomerService.getAllCustomers()` N+1
- Loops over `findAll()` and calls `getSavedAddresses().size()` / `getBranchAllocations().size()` per customer → 1 + 2N queries.
- **Fix:** Single query with `LEFT JOIN FETCH` (or `@EntityGraph`) for the needed collections, or bulk-load children with one `WHERE customer_id IN (:ids)` query and stitch in memory. `@BatchSize(50)` already present mitigates but doesn't eliminate.
- **Impact:** From ~2N+1 queries to ~2–3.

### 4.3 [P1] `LedgerEntry` String PK — confirm generator
- PK is `@Id String id` assigned in service. **Action:** verify whether it's a random UUID. If yes, switch to a time-sortable id (ULID/UUIDv7) or a `BIGINT IDENTITY` + separate human code. Random UUID PKs on the highest-volume table cause B-tree fragmentation and bloated indexes.
- **Impact:** Insert throughput + index size on the ledger; meaningful at millions of rows.

### 4.4 [P2] `IDENTITY` PKs disable insert batching
- With `GenerationType.IDENTITY`, Hibernate cannot batch inserts (needs the generated id immediately). High-volume inserts (GL lines, stock movements, invoice items, stock-take units) lose `hibernate.jdbc.batch_size`.
- **Fix (forward-looking):** for the highest-insert tables, switch to a `SEQUENCE` generator with a pooled optimizer (`@GeneratedValue(strategy=SEQUENCE, generator=...)` + `@SequenceGenerator(allocationSize=50)`). Set `spring.jpa.properties.hibernate.jdbc.batch_size=50`, `order_inserts=true`, `order_updates=true`.
- **Impact:** 2–5× faster bulk posting paths.

### 4.5 [P2] Pagination missing on transactional list endpoints
- `PosLayawayRepository.search`, several `findByX` returning `List`, audit-log finders, `VendorRepository.findByIsActiveTrue()`.
- **Fix:** Return `Page<>` + `Pageable` (the codebase already does server-side pagination for LPO/Payments per memory — extend the same pattern).

### 4.6 Good patterns already present (keep)
- `ProductRepository` uses `LEFT JOIN FETCH p.brand/department` + pagination (correct N+1 mitigation).
- `StockMovementRepository` uses windowed native queries for FIFO/LIFO cost and `PESSIMISTIC_WRITE` on the deduction aggregate.
- `gl_account_balances` pre-aggregation + nightly drift check is the right architecture.
- Document-number generators use `PESSIMISTIC_WRITE` (no duplicate-number race — the Sales-domain "race" concern is mitigated by `SalesDocumentNumberSettingRepository:15`).

---

## 5. Transaction & Concurrency Report

### 5.1 Fetch strategy (see §1.6) — the dominant transactional cost.
### 5.2 Locking inventory: correct.
`StockMovementRepository:92`, `BatchMasterRepository:101`, `BatchAllocationRepository:43,68`, `InventoryBalanceRepository:14` all use `PESSIMISTIC_WRITE` around stock deduction/allocation — good. Verify the lock is acquired **before** the read used for the availability decision (it appears to be).
### 5.3 `open-in-view=false` — correct (`application.properties`), prevents lazy-load-in-view surprises. Keep it; it's why explicit `JOIN FETCH` matters.
### 5.4 GL balance upsert — the one real concurrency defect (§1.3). Fix:
```java
// GlAccountBalanceRepository — atomic increment, no read-modify-write
@Modifying
@Query("""
    UPDATE GlAccountBalance b
       SET b.debitTotal = b.debitTotal + :dr,
           b.creditTotal = b.creditTotal + :cr,
           b.closingBalance = b.closingBalance + (:dr - :cr),
           b.lastUpdated = CURRENT_TIMESTAMP
     WHERE b.accountCode = :code AND b.fiscalPeriodId = :pid AND b.branchId = :bid
    """)
int applyDelta(@Param("code") String code, @Param("pid") Long pid,
               @Param("bid") Long bid, @Param("dr") BigDecimal dr, @Param("cr") BigDecimal cr);
```
Service: call `applyDelta(...)`; if it returns `0`, insert the row (catching the unique-constraint violation on the race and retrying the update). The `uk_gl_balance_account_period_branch` unique constraint already exists to make insert-or-update safe.
### 5.5 Double-entry not DB-enforced. Add a deferred constraint or trigger asserting `SUM(debit)=SUM(credit)` per `journal_entry_id` at commit (the period-lock trigger pattern in `PeriodLockTriggerInstaller` shows the team is comfortable with triggers). App-level `balanceGuard` exists but direct SQL bypasses it.

---

## 6. Security Audit Report

| # | Finding | Loc | Sev | Fix |
|---|---|---|---|---|
| S1 | JWT secret committed, shared, no rotation | `application.properties:48` | P0 | `${JWT_SECRET}` per tenant; rotate; 256-bit random |
| S2 | `User.password` no `@JsonIgnore` | `User.java:31` | P0 | add `@JsonIgnore` (DTOs used today, but defense-in-depth) |
| S3 | `email` not unique; login falls back to email | `User.java:34`, `AuthController` | P0 | partial unique index on `lower(email)` |
| S4 | `EmailConfig.password` plaintext at rest | `EmailConfig.java:21` | P1 | encrypt with a KMS/`@Convert` AES converter |
| S5 | `PosSettings.supervisorPin` plaintext | `PosSettings` | P1 | BCrypt the PIN |
| S6 | Audit write synchronous in request txn | `AuditLogService.logAccess` | P2 | async event / `REQUIRES_NEW` already on some paths |
| S7 | `@PreAuthorize` coverage not verified on all 89 controllers | — | P2 | grep all `@RestController`; assert each mutating endpoint calls `modulePermissionService.require*` or has `@PreAuthorize` |
| S8 | Tenant isolation relies on separate datasource + `BranchContextHolder` | config | P2 | confirm every business query is branch-scoped; no cross-branch leak via unfiltered `findAll` |

**SQL injection:** none found. All `@Query` "concatenations" are compile-time literal joins with bound `:params`; `JdbcTemplate` uses `?` placeholders; the one `createNativeQuery("UPDATE " + table ...)` in `BranchMigrationRunner:112` interpolates a **hardcoded whitelist** table name (not user input) — safe, but flag the pattern.

```sql
-- S3: enforce unique active email (case-insensitive)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_users_email_active
  ON users (lower(email)) WHERE is_active = true AND email IS NOT NULL;
```

---

## 7. POS / Inventory / Accounting Readiness Reports

### POS Readiness — **NOT READY** until money types fixed
- **Blocker:** all POS amounts are `Double` (§1.2). Cash reconciliation and Z-reports cannot be trusted. → convert to `BigDecimal`.
- **Blocker:** `supervisorPin` plaintext (§S5).
- **Scale:** `PosLayaway.items` EAGER; `(branch_id,terminal_id,status)` unindexed (hot session lookup). Add index + LAZY.
- **Integrity:** `posSessionId`/`branchId` bare Longs — add FK constraints so a deleted session can't orphan held sales.
- **Good:** terminal device-fingerprint unique index; session model is sound.

### Inventory Readiness — **READY with fixes**
- **Source of truth:** `StockMovement` ledger + `PESSIMISTIC_WRITE` deductions is correct.
- **Fix:** `quantity` → `BigDecimal(18,3)` for fractional units (§1.11); index `expiry_date`/`source` for FEFO; add FK constraints on `product_id/warehouse_id`.
- **Scale:** stock-take per-unit + EAGER chain (§1.9) — make LAZY, paginate, archive old sessions.
- **Caches:** keep `InventoryBalance`/`BinStock` but enforce same-transaction writes + keep nightly drift check.

### Accounting Readiness — **STRONGEST module, two real defects**
- **Good:** `JournalLine`/`GlAccountBalance`/`AccountingPeriod` use `BigDecimal` + good indexes; pre-aggregated balances; DB-level period-lock trigger; voucher-sequence locking; idempotent posting by reference.
- **Defect 1 (P0):** GL balance upsert race (§1.3/§5.4).
- **Defect 2 (P1):** `ledger_entries` missing `(account_code, transaction_date)` index + String/UUID PK (§4.1/4.3). `Expense`/`TaxFiling` use `Double` (§1.2) and reconcile against a `BigDecimal` GL → drift.
- **Hardening:** DB-level debit=credit constraint (§5.5).

---

## 8. Scalability Report (target: thousands of users, millions of rows)

| Dimension | Current | At scale | Action |
|---|---|---|---|
| Schema evolution | `ddl-auto=update` + boot-time `ALTER`s, 6+ drifting DBs | divergence, failed upgrades | **Flyway + `validate`** (§1.1) — top priority |
| GL volume | `journal_lines`/`ledger_entries` unpartitioned | slow scans, vacuum pressure | RANGE partition by fiscal year (template already noted in `JournalEntry` javadoc) once >~5M rows |
| Audit volume | unbounded, sync writes | largest table, write stalls | monthly partition + retention + async |
| Insert throughput | IDENTITY PKs, no batching | round-trip bound | SEQUENCE + pooled allocation + JDBC batch (§4.4) |
| Read fan-out | EAGER everywhere | N+1 explosions | LAZY + JOIN FETCH (§1.6) |
| Stock-take | per-unit rows, EAGER | OOM on big counts | LAZY + paginate + archive (§1.9) |
| Connection pool | Hikari max 25 | fine per-tenant single node; revisit for HA | size per `cores*2 + effective_spindles`; add read replica for reports |
| Reporting | aggregates in app memory | CPU/heap bound | push down to SQL; read from `gl_account_balances` / materialized views |

---

## 9. SQL Fix Scripts (Flyway layout)

```
billbull-backend/src/main/resources/db/migration/
  V1__baseline.sql                 -- captured from current schema (flyway baseline)
  V2__money_types.sql              -- §2.1: every Double money col -> NUMERIC
  V3__missing_indexes.sql          -- §3 (use CONCURRENTLY; run outside txn)
  V4__fk_constraints.sql           -- §2.2 real FKs; composite idx + COMMENT on polymorphic
  V5__stock_quantity_numeric.sql   -- §1.11 stock_movements.quantity -> NUMERIC(18,3)
  V6__security.sql                 -- §6 unique active email; (PIN/email-pw handled in app)
  V7__gl_integrity.sql             -- §5.5 deferred debit=credit constraint/trigger
  V8__audit_partitioning.sql       -- §1.12 partition + retention
```
Scripts §2.1, §3, §6 are written out above verbatim and ready to drop in. `V4` is generated by walking the bare-FK list in §1.7. Keep `DatabaseFixConfig`/`StockMovementIdentityConstraintConfig`/`PeriodLockTriggerInstaller` logic but **move it into versioned scripts** and delete the boot-time runners once all tenants are on Flyway.

---

## 10. Final Refactored Database Design — target state

1. **Migrations:** Flyway-managed; `ddl-auto=validate` in prod, `update` only in local dev. One ordered history per tenant; drift impossible.
2. **Types:** money = `NUMERIC(15,2)`, rates `NUMERIC(9,4)`, quantity `NUMERIC(18,3)` everywhere. Zero `double precision` money columns.
3. **Keys:** Long IDENTITY → SEQUENCE-pooled on the 5 highest-insert tables; ledger/account String PKs → ULID/UUIDv7 (sortable) or BIGINT + human code.
4. **Relationships:** all `LAZY` by default; `JOIN FETCH`/`@EntityGraph` at query sites; DB FK constraints on every genuine FK; documented + indexed composite keys on polymorphic refs.
5. **Indexing:** every soft-delete list filter, every child FK, every report predicate, every login/search field indexed; partial indexes for `is_active`/`reconciled`.
6. **GL:** atomic balance deltas; DB-enforced double-entry; period-lock trigger (already present); ledger partitioned by year at scale.
7. **Audit:** partitioned, retained, async-written, composite-indexed.
8. **Security:** secrets externalized + rotated; `@JsonIgnore` on credentials; unique active email; encrypted SMTP password; hashed POS PIN; verified `@PreAuthorize` coverage.
9. **Reporting:** SQL-side aggregation reading `gl_account_balances` + (optionally) materialized views refreshed on a schedule; a read replica for heavy reports.
10. **Caches:** `InventoryBalance`/`BinStock` retained, same-transaction maintained, nightly-reconciled, indexed.

---

### Priority sequencing
1. **Week 1 (P0):** Flyway adoption + `validate`; money→BigDecimal/NUMERIC (POS + Sales + Expense + TaxFiling + Employee); GL balance atomic upsert; JWT secret externalized; `@JsonIgnore` + unique email.
2. **Week 2–3 (P1):** LAZY-by-default + JOIN FETCH; the §3 index pack; bare→real FK constraints; report query push-down; stock-take LAZY+paginate.
3. **Month 2 (P2):** SEQUENCE/batch on hot inserts; audit partition+retention+async; DB double-entry constraint; ledger PK/partitioning plan; pagination gaps.

> The ER diagram and exhaustive per-field appendices are large; this document is the decision-ready core. The domain audit appendices (every entity, every field, every line reference) were produced during the review and can be appended on request.
