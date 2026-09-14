# BillBull — Transactional Data Cleanup Audit

**Scope of analysis:** live PostgreSQL 18 schema `public` (171 tables, 169 FK constraints, 3 triggers, 157 sequences), cross-checked against 168 JPA entity classes under `com.billbull.backend.*`.
**Reference DB inspected:** `testdb` (the dev datasource in `application.properties`). The classification is schema-driven, so it applies to every tenant DB; row counts below are `testdb`'s.
**Coverage:** 69 KEEP + 102 CLEAR = 171 tables. Every table in the schema is classified; no table is unaccounted for.

**Status:** the companion script was executed end-to-end against `testdb` inside a rolled-back transaction — 102 DELETEs, 0 errors, all 35 validation checks PASS, database verified unchanged afterwards.

---

## SECTION A — Tables to KEEP (master / configuration) — 69 tables

| Table | Rows | Why it is master |
|---|---:|---|
| `products` | 12,187 | Item master |
| `product_barcodes` | 12,191 | Barcode master per packing |
| `product_packings` | 12,191 | UOM/pack definitions |
| `product_pricing` | 12,187 | Master price list |
| `product_branch_pricing` | 38 | Branch price overrides |
| `product_tax` | 12,182 | Per-item tax mapping |
| `product_inventory_policy` | 12,187 | Reorder/default-location policy |
| `product_media` | 18 | Item images |
| `user_favourite_products` | 2 | User UI preference |
| `brands`, `brand_tags` | 2, 1 | Brand master + tag collection |
| `departments`, `sub_departments` | 132, 1 | Category hierarchy |
| `units` | 26 | UOM master (self-referencing parent unit) |
| `customers` | 2,367 | Customer master — *derived columns reset, see §F* |
| `contact_person`, `saved_address`, `customer_document` | 0, 2, 0 | Customer master children |
| `customer_branch_allocations` | 4 | Customer↔branch visibility |
| `opening_invoice` | 1 | Migrated opening balances — *outstanding restored, see §F* |
| `vendors` | 394 | Vendor master — *`balance` reset to `opening_balance`* |
| `vendor_branch_allocations` | 9 | Vendor↔branch visibility |
| `warehouses`, `warehouse_zones`, `warehouse_locators`, `warehouse_bins` | 7, 8, 9, 10 | Location hierarchy |
| `branches`, `outlets` | 21, 21 | Org structure |
| `company_profile`, `email_config` | 1, 1 | Tenant configuration |
| `users`, `user_roles`, `user_branches`, `roles`, `role_permissions` | 28, 9, 3, 11, 349 | Identity + RBAC (seeded by `RBACInitializer`/`RolePermissionInitializer`) |
| `employees` | 9 | HR master |
| `accounts` | 83 | Chart of accounts (seeded by `SystemAccountSeeder`) |
| `cost_centers` | 1 | Dimension master |
| `currencies`, `exchange_rates` | 1, 0 | Currency + rate reference data |
| `fiscal_years`, `accounting_periods` | 3, 36 | Accounting calendar — *closed periods reopened, see §F* |
| `payment_methods`, `payment_terms` | 0, 5 | Payment master |
| `posting_rules` | 0 | Auto-posting account-selection rules |
| `tax_configurations`, `tax_configuration_accounts`, `branch_tax_configuration` | 1, 2, 2 | Tax master |
| `pos_terminals`, `pos_counters`, `pos_printers`, `pos_scanners`, `pos_devices`, `pos_cash_drawers` | 13, 7, 5, 0, 5, 0 | POS hardware registration — *session refs nulled, see §F* |
| `pos_hardware_profile`, `pos_hardware_profile_device` | 0, 0 | Device profile definitions |
| `pos_cash_movement_categories` | 4 | Cash-in/out reason master |
| `pos_settings`, `inventory_settings`, `sales_settings`, `purchase_settings` | 1, 0, 1, 0 | Module configuration |
| `sales_document_number_settings`, `purchase_document_number_settings` | 8, 4 | Numbering **config** — prefix/label kept, `next_number` reset |
| `print_templates`, `barcode_templates`, `message_templates` | 25, 8, 0 | Template definitions |
| `approval_workflow_steps` | 0 | LPO workflow **definition** (vs. `approval_history` = instances) |
| `audit_logs` | 65,580 | Security audit trail — see §C |
| `flyway_schema_history` | 89 | Migration state — **never touch** |

---

## SECTION B — Tables to CLEAR (102 tables)

Cleanup order is the phase number; within a phase, listed deletion order is FK-safe.

| Table | Type | Reason for clearing | FK dependencies | Order |
|---|---|---|---|---|
| `pos_layaway_payments` | txn detail | Layaway instalments | → `pos_layaways` | 1 |
| `pos_layaway_items` | txn detail | Layaway lines | → `pos_layaways` | 1 |
| `pos_layaways` (15) | txn header | Parked credit sales (BNPL equivalent) | — | 1 |
| `pos_held_sales` | txn header | Suspended carts | — | 1 |
| `pos_cash_movements` (11) | txn | Cash in/out during session | → `pos_sessions` | 1 |
| `pos_session_denomination_corrections` | txn | Drawer count corrections | — | 1 |
| `pos_correction_audit_entries` / `_overlays` / `_requests` | txn | Post-sale correction workflow | — | 1 |
| `pos_transaction_corrections` | txn | Applied corrections | — | 1 |
| `pos_session_transfer_log` (17) | history | Session hand-over trail | — | 1 |
| `pos_session_terminal_history` (76) | history | Session↔terminal history | — | 1 |
| `pos_x_report_snapshots` (63) | report data | X-report snapshots | — | 1 |
| `pos_report_sequences` (50) | counter | Per-day X/Z numbering | — | 1 |
| `pos_print_jobs` (153) | queue/audit | Print queue + audit spine | — | 1 |
| `pos_stock_reservations` (19) | derived | Cart stock holds | — | 1 |
| `pos_device_event_log` (569) | telemetry | Device event stream | — | 1 |
| `pos_device_health_snapshot` | telemetry | Health sweep output | — | 1 |
| `pos_discovered_device` | telemetry | Rebuilt by `DiscoveryService` | — | 1 |
| `pos_audit_log` (402) | audit | POS business-action trail | — | 1 |
| `pos_business_day_override` | txn | Trading-day extensions | — | 1 |
| `pos_day_closes` (25) | txn | Z-report source — **immutability trigger, see §D** | — | 1 |
| `pos_sessions` (73) | txn header | Till sessions | — | 1 |
| `pos_business_dates` (2) | state | Re-seeds to today per branch | — | 1 |
| `delivery_note_batch_consumptions` (185) | txn detail | FIFO/FEFO batch consumption | — | 2 |
| `delivery_note_items` (192) | txn detail | — | → `delivery_notes`, `products` | 2 |
| `delivery_notes` (166) | txn header | **Must precede `sales_invoices`** | → `sales_invoices`, `warehouses`, `branches` | 2 |
| `sales_return_item_batches` (1) | txn detail | — | → `sales_return_items` | 2 |
| `sales_return_items` (16) | txn detail | — | → `sales_returns` | 2 |
| `sales_returns` (16) | txn header | — | → `branches` | 2 |
| `credit_voucher_transactions` (8) | ledger | Voucher redemption ledger | → `credit_vouchers` | 2 |
| `credit_vouchers` (6) | txn | Issued from returns → transactional, not a promo master | → `branches` | 2 |
| `advance_applications` (17) | allocation | Advance receipt → invoice application | — | 2 |
| `sales_receipt_vouchers` (209) | txn | Customer receipts (RV) | → `branches` | 2 |
| `sales_payments` (179) | txn | Customer payments | → `branches` | 2 |
| `sales_invoice_history_events` (311) | history | Invoice event stream | — | 2 |
| `sales_invoice_items` (237) | txn detail | — | → `sales_invoices` | 2 |
| `sales_invoices` (190) | txn header | — | → `branches`, `employees` | 2 |
| `sales_order_attachments` / `sales_order_items` (13) / `sales_orders` (13) | txn | Order cycle | → `sales_orders`, `warehouses` | 2 |
| `sales_quotation_attachments` / `_revisions` (5) / `_items` (15) / `sales_quotations` (12) | txn | Quotations carry pricing commitments → transactional | → `sales_quotations` | 2 |
| `proforma_invoice_items` (2) / `proforma_invoices` (2) | txn | — | → `proforma_invoices`, `warehouses` | 2 |
| `inquiry_followups` (8) / `inquiry_items` (2) / `customer_inquiries` (2) | CRM txn | Lead pipeline — see §C | → `customer_inquiries`, `products` | 2 |
| `invoice_payments` (2) | txn | Vendor payments against PI | → `purchase_invoices` | 3 |
| `invoice_landed_costs` (5) | txn detail | — | → `purchase_invoices` | 3 |
| `purchase_invoice_item_serials` | txn detail | — | → `purchase_invoice_items` | 3 |
| `purchase_invoice_items` (36) | txn detail | — | → `purchase_invoices` | 3 |
| `payment_vouchers` (7) | txn | **Must precede `purchase_invoices`** | → `purchase_invoices`, `branches` | 3 |
| `purchase_invoices` (30) | txn header | — | → `grns`, `lpos`, `vendors`, warehouse chain | 3 |
| `purchase_return_items` / `purchase_returns` | txn | — | → `purchase_returns`, `branches` | 3 |
| `grn_item_serials` / `grn_items` (9) / `grns` (8) | txn | Goods receipts | → `grns`, `lpos`, `vendors` | 3 |
| `lpo_items` (25) / `lpos` (12) | txn | Purchase orders | → `lpos`, `vendors`, warehouse chain | 3 |
| `vendor_advances` | txn | Vendor advances | — | 3 |
| `approval_history` | txn | LPO approval **instances** | — | 3 |
| `batch_print_queue` | queue | Label print queue | → `batch_master` | 4 |
| `batch_allocation` (45) | txn detail | Batch consumption allocations | → `batch_master` | 4 |
| `batch_master` (80) | inventory identity | Lots created by receipts/stock-take | → `products`, `warehouses` | 4 |
| `serial_master` | inventory identity | Serials created by receipts | — | 4 |
| `bin_stock` | derived | Per-bin on-hand state | → `products`, `warehouse_bins` | 4 |
| `stock_take_unit_scans` (19) | txn detail | — | → `stock_take_expected_units`, `_sessions` | 4 |
| `stock_take_expected_units` (194) | txn detail | — | → `stock_take_sessions` | 4 |
| `stock_take_item_batches` (45) | txn detail | Per-unit counted batches | → `stock_take_items` | 4 |
| `stock_take_items` (23) / `stock_take_sessions` (12) | txn | Stock-take sessions | → `stock_take_sessions` | 4 |
| `stock_transfer_items` (8) / `stock_transfers` (8) | txn | Inter-warehouse transfers | → `stock_transfers`, warehouse chain | 4 |
| `stock_movements` (211) | **ledger** | The append-only inventory source of truth | → `products`, `warehouses`, `branches` | 4 |
| `inventory_balances` (14) | derived cache | `SUM(stock_movements.quantity)` per product/warehouse | → `products`, `warehouses`, `branches` | 4 |
| `financial_audit_logs` (757) | audit | Finance business-event trail | — | 5 |
| `tax_filings` (1) | txn | Filed returns | → `tax_configurations` (kept) | 5 |
| `bank_statement_lines` / `bank_statements` | txn | Imported statements | → `bank_statements`, `branches` | 5 |
| `reconciliation_sessions` | txn | Reconciliation runs | → `branches` | 5 |
| `card_settlements` | txn | Card/POS settlement records | — | 5 |
| `pdc_entries` | txn | Post-dated cheques | — | 5 |
| `expense_voucher_lines` / `expense_vouchers` / `expenses` | txn | Expense postings | → `expense_vouchers`, `branches` | 5 |
| `prepaid_expenses` | register | Amortisation schedules — see §C | → `branches` | 5 |
| `fixed_assets` | register | Depreciation schedules — see §C | → `branches` | 5 |
| `journal_lines` (1,604) | txn detail | GL lines — **deferred balance trigger, see §D** | → `journal_entries`, `branches`, `outlets` | 5 |
| `journal_entries` (535) | txn header | GL entries | → `branches` | 5 |
| `ledger_entries` (1,611) | ledger | Sub-ledger postings | → `branches` | 5 |
| `gl_account_balances` (116) | derived cache | `SUM(journal_lines)` per account/period | — | 5 |
| `voucher_sequences` (18) | counter | Per branch/FY voucher numbering | — | 5 |
| `salary_repayment_schedules` / `salary_advance` / `salary_payments` | txn | Payroll transactions | → `salary_advance` | 6 |
| `notifications` (267) | generated | Transaction-driven notifications | — | 7 |
| `message_logs` (3) | generated | Sent-message log (templates kept) | — | 7 |
| `user_tasks` | generated | Todo records | — | 7 |

---

## SECTION C — Ambiguous tables requiring explicit confirmation

| Table | Rows | Question | Recommendation in the script |
|---|---:|---|---|
| `audit_logs` | 65,580 | `security.AuditLog` is the **technical/security** audit trail (logins, permission grants/denials), distinct from `pos_audit_log` and `financial_audit_logs`, which are business trails. Purging it destroys security-compliance evidence unrelated to transactions. | **NOT cleared.** A commented-out `DELETE` is provided; requires compliance sign-off. `audit.retention.months` already ages it out. |
| `fixed_assets` | 0 | Is this a permanent asset *register* (master) or a set of depreciation *schedules* (transactional)? Its postings are being deleted either way. | Cleared. Comment the line out if the client wants the asset register retained — then their opening NBV must be re-posted manually. |
| `prepaid_expenses` | 0 | Same question for amortisation schedules. | Cleared; same override. |
| `customer_inquiries` + `inquiry_items` + `inquiry_followups` | 2 / 2 / 8 | CRM leads are pipeline data, not financial transactions. An open lead may still be wanted. | Cleared, with a comment marking the three lines for easy removal. |
| `exchange_rates` | 0 | Rate history is dated reference data, but it is also "historical". | **Kept** — rates are needed to value any re-entered opening balances. |
| `accounting_periods` / `fiscal_years` | 36 / 3 | The calendar is configuration, but 12 periods are `Closed`, and `trg_period_lock` rejects any posting dated inside a closed period. | Rows kept; `status` flipped `Closed`→`Open`. One `UPDATE`, easy to comment out. |
| `opening_invoice` | 1 | Migrated customer opening balances — master-ish, but `outstanding` is decremented by receipts we are deleting. | Kept, with `outstanding` restored — see §F. |
| `pos_business_dates` | 2 | Operational state, not config. Holds business dates of 2026-08-01 / 2026-08-23; leaving them would misdate fresh sales. | Cleared — `PosBusinessDateService.seed()` re-creates it at `clock.now()` on first POS use. |
| `serial_master`, `batch_master` | 0 / 80 | Named "master" but populated by GRN/purchase receipt, and every row points at stock that no longer exists. | Cleared. |
| `credit_vouchers` | 6 | Could be read as a promotion master; it is not — vouchers are issued by sales returns. | Cleared. |
| `user_tasks` | 0 | Generic todo tracker, not domain-specific. | Cleared (empty anyway). |

---

## SECTION D — Dependency graph and constraint mechanics

**FK topology.** All 169 FKs are `ON DELETE NO ACTION`. There are no cascades, no self-referencing transactional chains (the only self-FK is `units → units`, a master table), and no circular dependencies among cleared tables. So a plain child-before-parent ordering is sufficient — **no FK disabling is needed or used.**

Cross-domain edges that dictate ordering (each one is why a table sits where it does):

```
sales_invoices ──< delivery_notes          delete delivery_notes FIRST
purchase_invoices ──< payment_vouchers     delete payment_vouchers FIRST
purchase_invoices ──< invoice_payments, invoice_landed_costs
lpos ──< grns ──< purchase_invoices        delete PI → GRN → LPO
journal_entries ──< journal_lines
batch_master ──< batch_allocation, batch_print_queue
stock_take_sessions ──< stock_take_expected_units ──< stock_take_unit_scans
pos_sessions ──< pos_cash_movements
customer_inquiries ──< inquiry_items, inquiry_followups
```

Cleared tables also reference **kept** parents (`products`, `vendors`, `customers`, `branches`, `warehouses`, `employees`). Those edges only require that we never delete the parent — which we don't.

**Triggers (3 in the schema):**

| Trigger | Table | Events | Effect on this cleanup |
|---|---|---|---|
| `trg_pos_day_close_immutable` | `pos_day_closes` | BEFORE DELETE OR UPDATE | **Blocks the delete.** Unconditionally raises `DAY_CLOSE_IMMUTABLE`. Disabled for this one table inside the transaction and re-enabled before commit — a rollback reverts the disable, so the guard can never be left off. |
| `trg_double_entry_balance` | `journal_lines` | CONSTRAINT trigger, AFTER I/U/D, DEFERRABLE INITIALLY DEFERRED | **No action needed.** Deleting all lines of an entry yields `SUM(debit)=SUM(credit)=0`; the function comments explicitly handle this ("An entry fully deleted yields 0 = 0 and passes"). Deferred, so it evaluates at COMMIT when the table is already empty. |
| `trg_period_lock` | `journal_entries`, `ledger_entries` | BEFORE INSERT OR UPDATE only | **No action needed** for deletes. It *will* reject future postings dated in a closed period, which is why closed periods are reopened. |

**Transactional DDL.** PostgreSQL supports transactional DDL, so `ALTER TABLE ... DISABLE TRIGGER` participates in the transaction and rolls back cleanly. This is why the rehearsal mode is genuinely safe.

**`session_replication_role = replica`** (the usual "disable all FK checks" trick) is deliberately **not** used: it would silently permit orphans, and this schema does not need it.

---

## SECTION E — The script

`billbull_transactional_reset.sql`, run in three passes:

1. **Rehearsal** — run as-is. Section 0 dry-run counts, Section 1 deletes inside one transaction, Section 2 validates *inside that still-open transaction*, then `ROLLBACK`. Nothing changes.
2. **Commit** — swap the final `ROLLBACK` for `COMMIT`, re-run.
3. **Sequences** — run Section 1B alone, only after pass 2 committed.

### Why sequences are a separate pass — a real hazard found during rehearsal

`setval()` **is not transactional in PostgreSQL.** The first draft reset sequences inside the transaction. Running the rehearsal restored all 190 sales invoices via `ROLLBACK` — but left `sales_invoices_id_seq`, `stock_movements_id_seq` and `journal_entries_id_seq` sitting at 1. The next insert would have collided with an existing id. (This was reproduced on `testdb` and repaired; the dev database is verified consistent — 0 sequences behind `MAX(id)`.)

The fix, all three parts of it:

- Sequence resets moved **out** of the transaction into Section 1B.
- Section 1B opens with a guard that counts surviving transactional rows and raises if any remain, so it refuses to fire on a rehearsal.
- The guard lives **inside the same `DO` block** as the resets. As a separate statement, `psql` without `-v ON_ERROR_STOP=1` printed the error and then ran the reset anyway — verified, and fixed.

`realign_sequences.sql` ships alongside as the recovery tool: it pushes every `<table>.id` sequence to `MAX(id)+1` and is safe to run at any time.

### Reset vs. preserve

| Reset to 1 | Preserved |
|---|---|
| Identity sequences of all 102 cleared tables (explicit hard-coded array — no master table can appear in it) | Every master identity sequence (`products_id_seq`, `customers_id_seq`, `vendors_id_seq`, …) — master ids must stay stable because kept rows reference them |
| `seq_journal_lines`, `seq_sales_invoice_items` (standalone Hibernate `@SequenceGenerator`s, `allocationSize=50`, realigned at boot by `config/DatabaseFixConfig`) | `flyway_schema_history` |
| `sales_document_number_settings.next_number`, `purchase_document_number_settings.next_number` → 1 | The numbering **configuration** itself: `prefix`, `label`, `auto_numbering_enabled` |
| `voucher_sequences`, `pos_report_sequences` rows deleted (recreated on demand per branch/FY) | — |

Resetting document counters is safe **only because every document that consumed a number is deleted in the same run.** Never apply the counter reset without the deletes — that is exactly how duplicate document numbers get created.

---

## SECTION F — Derived and accumulated state

Determined by reading the services that maintain each value, not by guessing from column names.

| Value | Classification | Treatment |
|---|---|---|
| `inventory_balances.on_hand_qty / total_value / avg_cost` | Derived cache over `stock_movements` (`InventoryBalanceService.refresh`) | Rows deleted. Consistent at zero; rebuilds per product/warehouse on the first movement. No manual rebuild needed. |
| `gl_account_balances.*` | Derived cache over `journal_lines` (drift-checked by `GlBalanceRebuildJob`) | Rows deleted. Consistent at zero. |
| `bin_stock.quantity / reserved_quantity` | Per-bin on-hand state | Rows deleted. |
| `products.total_quantity_sold`, `products.last_sold_at` | Sales accumulators on a master row | Columns zeroed/nulled; 14 rows affected in `testdb`. |
| `customers.balance` | **Not** sales outstanding. `ReceiptVoucherService.syncCustomerOpeningBalance()` maintains it as `SUM(opening_invoice.outstanding)`. | `opening_invoice.outstanding` restored to `COALESCE(NULLIF(opening_balance_amount,0), NULLIF(outstanding,0), amount, 0)` — matching `resolveOpeningBalanceAmount()`'s precedence — then `customers.balance` recomputed as the sum. Opening balances survive the reset intact. |
| `customers.total_sales` | Recomputed on every list call as `balance + SUM(invoice totals)` (`CustomerService:107`) | Stored column zeroed so no stale value can be rendered before the first refresh. |
| `customers.current_balance` | `@Transient`, computed per request | Nothing to do. |
| `vendors.balance` | Transaction-derived running balance | Set to `COALESCE(opening_balance, 0)`. |
| `vendors.opening_balance` | Migrated master value | Preserved. |
| `pos_terminals.current_open_session_id`, `locked_session_id`, `locked_at`, `locked_reason` | Pointers into deleted sessions (no FK, so they would dangle silently) | Nulled. Terminal registration, fingerprint and hardware profile preserved. |
| `pos_cash_drawers.last_kick_at / last_kick_result` | Device telemetry | Nulled; drawer config preserved. |
| `pos_business_dates.current_business_date` | Operational state advanced by Day Close | Rows deleted; re-seeded to today per branch on first POS use. |
| `accounting_periods.status` | Configuration, but enforced by `trg_period_lock` | 12 `Closed` → `Open`, so fresh postings are accepted. |

**Loyalty points / reward points / BNPL / coupon usage / promotion usage / webhook logs:** no such tables exist in this schema. The nearest equivalents are `pos_layaways` (instalment sales) and `credit_vouchers` (store credit), both cleared.

---

## SECTION G — Post-cleanup validation (built into the script, Section 2)

Verified passing on the rehearsal — 35 checks, 0 failures:

- **2.1** — 15 grouped emptiness checks across sales, returns, orders/quotations, purchases, POS sessions/day closes, cash movements, payments/receipts, deliveries, inventory movements and lots, accounting postings, expenses/assets/PDC/settlements, layaways, payroll, transactional audit trails, and numbering state. All returned `0 / PASS`.
- **2.2** — 20 master tables confirmed populated: products 12,187 · customers 2,367 · vendors 394 · warehouses 7 · branches 21 · POS terminals 13 · users 28 · roles 11 · role_permissions 349 · chart of accounts 83 · pricing 12,187 · barcodes 12,191 · templates 25 · etc. All `PASS`.
- **2.3** — orphan sweep across **all 169 FK constraints** via generated anti-joins. Zero orphans.
- **2.4** — six derived-state consistency checks (product accumulators, customer balance vs. opening invoices, customer total_sales, vendor balance, dangling terminal session refs, document counters). All `0`.
- **2.5** — confirms `trg_pos_day_close_immutable` is re-enabled (`tgenabled = 'O'`).
- **1B.2** — sequence spot check (meaningful only after the real run; correctly reports `NOT RESET` during a rehearsal).

---

## SECTION H — Deliberately not cleared, and why

| Table | Why it stays |
|---|---|
| `audit_logs` (65,580) | Security/compliance evidence — logins and permission decisions, not business transactions. Different subsystem from `pos_audit_log` and `financial_audit_logs`, both of which *are* cleared. Commented-out `DELETE` provided. |
| `flyway_schema_history` | Deleting it makes Flyway replay or re-baseline migrations against a live schema. |
| `exchange_rates` | Dated reference data needed to value re-entered opening balances. |
| `opening_invoice` | Customer opening balances are migrated master data, not trading history. Restored to unpaid state. |
| `approval_workflow_steps` | Workflow *definition*; only `approval_history` (the instances) is cleared. |
| `posting_rules`, `payment_methods`, `payment_terms`, `print_templates`, `barcode_templates`, `message_templates` | Configuration that the posting engine and print pipeline need to function on day one. |
| `pos_hardware_profile`, `pos_hardware_profile_device` | Device profile assignments — configuration, not events. |
| `accounting_periods`, `fiscal_years` | Calendar configuration; only `status` is touched. |

---

## Post-run operational checklist

1. Restart the backend. Idempotent startup work re-runs on its own: `DatabaseFixConfig` realigns the two Hibernate sequences, `PeriodLockTriggerInstaller` reinstalls the period-lock triggers, and `SystemAccountSeeder` / `FinancialsDefaultSeeder` / `RBACInitializer` / `RolePermissionInitializer` re-add anything missing.
2. Confirm each branch's business date reads as today before the first sale.
3. Re-enter opening stock through a stock-take `OS` session or opening GRNs, so `stock_movements` is rebuilt as the single source of truth.
4. Post opening balances (customer / vendor / bank) as fresh journal entries if a non-zero opening trial balance is wanted.
5. Multi-tenant note: this is one database per client profile. Run the script per tenant DB, and re-run the Section 0 dry run each time — table presence and row counts differ across tenants (the script skips absent tables).
