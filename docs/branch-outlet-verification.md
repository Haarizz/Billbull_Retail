# Branch / Outlet — Verification Checklist

Maps the implementation status against the spec in `BillBull_Branch_Outlet_Developer_Guide.pdf` §12.

## Database

- [x] `branches` table exists with all required columns (HQ flag, type enum, full address, email, fax, TRN, logo_url, sort_order)
- [x] `branch_id` FK added to every master-data table that needs it (Product, Vendor, Customer, Employee, CostCenter)
- [x] `branch_id` FK added to every transaction table (Quotation, SalesInvoice, SalesOrder, ProformaInvoice, DeliveryNote, SalesReturn, sales Payment, Lpo, GRN, PurchaseInvoice, purchase PaymentVoucher, JournalEntry, Expense, ReceiptVoucher, ReconciliationSession, LedgerEntry)
- [x] Single-column index on `branch_id` for every table above
- [x] `BranchMigrationRunner` backfills HQ to every existing row where `branch_id IS NULL`
- [x] `NOT NULL` constraints **deliberately not applied** — keep nullable to allow legacy/cross-branch shared rows (e.g. company-wide Products)
- [ ] **Deferred:** drop legacy `String branch` text columns on Customer, Employee, CostCenter, ReceiptVoucher (still referenced by ~10 services)

## Backend

- [x] `BranchScope` + `BranchContextHolder` thread-local plumbing
- [x] JWT carries `branchId`, `branchIds`, `isAllBranches` claims
- [x] `JwtFilter` honors `X-Branch-Id` request header, validates against allowed list
- [x] Branch switch endpoint: `POST /api/session/switch-branch`
- [x] HQ endpoint: `GET /api/branches/headquarters`
- [x] All transaction `create` operations stamp `branch` from session (request body branch is ignored)
- [x] All `update` operations enforce branch **immutability** (admin switching active branch can't move a saved transaction)
- [x] List endpoints filtered via `BranchAccessService.filterBranchScoped*` so admins on All see everything, restricted users see only their branch
- [x] Print/email branch-header resolution uses originating transaction's branch
- [x] Headquarters fallback for "All Branches" reports (`buildReportHeaderProfile`)
- [x] Audit log entries on Branch create / update / setDefault / setHeadquarters / delete
- [ ] **Deferred:** branch-specific document numbering sequences (spec §5.1.5 — optional)
- [ ] **Deferred:** email "From" branch branding in `DocumentEmailSender`

## Frontend

- [x] `BranchContext` global state with `activeBranchId`, `isAllBranches`, `switchBranch`
- [x] `axios` interceptor injects `X-Branch-Id` on every request
- [x] Global `BranchSelector` component in nav (Enterprise Console)
- [x] Branch column added to all major list views (14 modules)
- [x] List pages refetch on `billbull:branch-changed` event
- [x] Branch field on transaction creation forms — controlled by session, restricted users can't change it
- [x] Branch filter on every report — via the global selector (HQ header when set to All Branches)
- [ ] **Deferred:** dedicated per-report branch filter dropdown inside the report params panel
- [x] Enterprise Console sidebar group with Branches, Administration, Data Management

## Testing (manual)

For each module, verify:

- [ ] Login as Admin → BranchSelector shows "All Branches" + all branches; list endpoints return rows from every branch
- [ ] Switch to a specific branch → list auto-refetches and only that branch's rows appear
- [ ] Edit an existing transaction → DB `branch_id` is unchanged regardless of active branch
- [ ] Reprint a Branch A transaction while admin is active on Branch B → header shows **Branch A's** name/address/TRN/logo
- [ ] "All Branches" report → header shows **Headquarters** branding
- [ ] Login as a branch-restricted user → only their branch's data, no "All Branches" option in selector
- [ ] Direct `curl` with `X-Branch-Id: <other branch>` as restricted user → 403 or filtered out
- [ ] Inter-branch stock transfer creates correct paired stock-out + stock-in records — **deferred**
- [ ] Index performance validated on realistic data volume

## Deferred items

Tracked but not yet implemented:

1. ~~Multi-branch user support — `user_branches` junction table (spec §2.3)~~ ✅ **DONE** — users have `additionalBranches` set, JWT carries the union, BranchAccessService honors it, UserService exposes `assignAdditionalBranches`, Employees → Assign Branches modal in UI.
2. ~~Inter-branch stock transfer paired records — spec §5.4~~ ✅ **Already implemented** — `StockTransferService.markSent` writes `STOCK_TRANSFER_OUT` movement; `markReceived` writes `STOCK_TRANSFER_IN`. The spec mandate is on the stock-movement ledger (which is correct), not on duplicate `StockTransfer` headers.
3. **Per-report `GROUP BY branch_id` aggregation** — spec §8.2. **Partial**: the report endpoints accept `branchId` and filter accordingly; when "All Branches" is requested, all records pool in. **Missing**: per-row branch breakdown column on aggregated reports. Implementing this requires per-report design changes (each of the ~20 report methods in `SalesReportDataService` has its own grouping semantics — there's no safe one-line fix). Recommended approach: add one report at a time as the business asks for consolidated reporting on it.
4. **Drop legacy `String branch` columns** — Customer, Employee, CostCenter, ReceiptVoucher. ~10 services still call the String getter. Needs a focused planned slice.
5. ~~Email From branding~~ ✅ **DONE** — `DocumentEmailSender.send(...,Long branchId)` overload sets From display to `"{Company} — {Branch}"` and reply-to to the branch email; SalesInvoiceController passes invoice's branchId.
6. **SalesInvoice email-button wiring (UI)** — backend ready; frontend button still a stub. ~30 min when needed.
7. **Branch-specific document numbering** — optional per §5.1.5
8. **Cache key includes `branch_id`** — only relevant once report caching is introduced

## Verification commands

```bash
# Backend compile
cd billbull-backend && mvn -o compile

# Backend boot (watch for BranchMigrationRunner log lines)
mvn spring-boot:run

# Spot-check: every transaction table got branch_id populated
psql -d test -c "SELECT 'sales_invoices' AS t, branch_id, COUNT(*) FROM sales_invoices GROUP BY branch_id
                 UNION ALL SELECT 'purchase_invoices', branch_id, COUNT(*) FROM purchase_invoices GROUP BY branch_id
                 UNION ALL SELECT 'journal_entries', branch_id, COUNT(*) FROM journal_entries GROUP BY branch_id
                 UNION ALL SELECT 'ledger_entries', branch_id, COUNT(*) FROM ledger_entries GROUP BY branch_id;"

# Frontend lint (now configured for eslint v9)
cd billbull-frontend && npm run lint

# Frontend dev
npm run dev
```
