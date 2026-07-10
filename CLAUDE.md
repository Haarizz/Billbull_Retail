# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Two-module monorepo for the BillBull retail/ERP system, plus a standalone printing helper:

- `billbull-backend/` — Spring Boot 3.5.9 / Java 17 / Maven, PostgreSQL via JPA + Hibernate + Flyway
- `billbull-frontend/` — React 19 + Vite 7 + Tailwind v4, axios, react-router
- `tools/pos-print-agent/` — standalone Node.js Windows tray app (`billbull-pos-print-agent`) that the frontend talks to over local HTTP to drive USB/Bluetooth/Windows-queue thermal printers. Packaged to `dist/BillBullPrintAgent.exe` via `pkg`, optionally wrapped by an Inno Setup installer (`installer/BillBullPrintAgent.iss`). Not part of the Maven/Vite build; versioned and released independently (currently 0.5.3).
- `tools/generate_billbull_documentation.cjs` — one-off documentation generator, not part of the build.
- `docs/` — architecture notes (e.g. `pos-device-architecture-specification-v2-2026-06-30.md`); root also has several deployment/testing markdown/PDF docs (`DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_8_CLIENTS.md`, `ERP_MANUAL_TESTING_PLAN.md`, `QA_TEST_REPORT.md`, etc.) — no root `README.md`, `.cursorrules`, or Copilot instructions exist.

**Multi-tenant deployment**: one Spring profile per client (`application-{client1,client2,client4,client5,client6,demo,geebu,hilite,leroyalflowers,leroyalgifts,prod,qa,royaltools,testing}.properties`), each pointing at its own Postgres database. Base `application.properties` holds dev defaults.

## Common commands

All `mvn` commands assume `cd billbull-backend` first; all `npm` commands assume `cd billbull-frontend`.

**Backend**
- Run app: `mvn spring-boot:run`
- Compile: `mvn -o compile`
- Full test suite: `mvn -o test`
- Single test class: `mvn -o test -Dtest=StockTakeServiceTest`
- Single test method: `mvn -o test -Dtest=StockTakeServiceTest#addBatchUsesOpeningInventoryPrefixForOsSession`
- Package jar: `mvn package`

There is no Maven wrapper — use a system `mvn`.

**Frontend**
- Dev server: `npm run dev`
- Production build: `npm run build`
- Lint: `npm run lint`
- Preview production build: `npm run preview`

**POS print agent** (`tools/pos-print-agent/`)
- Run locally: `node server.js` (headless) or `node tray.js` (with tray icon)
- Build Windows exe: `pkg . --targets node18-win-x64` → `dist/BillBullPrintAgent.exe`

## Backend architecture

**Package-by-feature** under `com.billbull.backend.*`. Top-level packages map to business domains: `inventory`, `sales`, `purchase`, `customer`, `hr`, `financials`, `dashboard`, `auth`, `user`, `role`, `security`, `settings`, `pos`. Each feature folder typically contains the entity, repository, service, controller, and DTOs together.

Cross-cutting / infrastructure packages:
- `common` — `BaseEntity`, `UuidV7` (UUIDv7 primary-key generation), `common.crypto.EncryptedStringConverter` (JPA converter for encrypted string columns), `common.workflow.ApprovalStatus` (shared enum for maker-checker approval flows, e.g. large JVs)
- `config` — `SecurityConfig`, `JwtFilter`, `JwtUtil`, `CorsConfig`, `StaticResourceConfig`, `JpaAuditingConfig`, `DatabaseFixConfig`, `PeriodLockTriggerInstaller`, `StockMovementIdentityConstraintConfig`, seeders (`SystemAccountSeeder`, `FinancialsDefaultSeeder`), scheduled jobs (`AuditLogRetentionJob`, `GlBalanceRebuildJob`). Note: JWT filter/util live here, not under `security`.
- `document` — `DocumentPdfController`, `HtmlPdfService` (HTML→PDF via headless Chromium/Playwright)
- `exception` — `GlobalExceptionHandler`, `ReconciliationException`
- `logging` — `RequestLoggingFilter`, `LogContext`, `ClientLogController` (ingests frontend client-side logs at `/api/client-logs/**`, permitAll)
- `notification` — `Notification`, `NotificationService`, `NotificationEventPublisher`, `NotificationController`
- `tasks` — generic `Task`/`TaskService`/`TaskController` (todo tracking, not domain-specific)
- `util` — `PageResponse`, `PaginationUtil`, `FileUploadUtil`, `DocumentOrderingUtil`
- Package root also has `BillbullBackendApplication` and `DbDiag` (a diagnostic utility)

**Persistence**
- Every persisted entity extends `com.billbull.backend.common.BaseEntity`, which provides `id`, `createdAt/By`, `updatedAt/By`, and an `isActive` flag. Auditing is wired via `@EnableJpaAuditing` (see `config/JpaAuditingConfig.java`).
- Soft-delete is the convention: clear `isActive` rather than physical-deleting. Look for this pattern before adding `delete()` calls.
- Schema is JPA-managed (`spring.jpa.hibernate.ddl-auto=update`) **and** Flyway is active (`spring.flyway.enabled=true`, `baseline-on-migrate=true`, `baseline-version=1`, scripts in `src/main/resources/db/migration`). The two coexist deliberately: Flyway scripts are additive/idempotent (guarded with `to_regclass` checks) and run before Hibernate on every boot; `ddl-auto` stays `update` until each tenant DB is baselined, then flips to `validate` per-tenant. 26 migrations exist (`V1__baseline.sql` through `V30__print_template_lob_oid_repair.sql`; version numbers V2/V4/V5 were retired). New schema changes should generally get a new Flyway migration rather than relying solely on Hibernate auto-DDL, especially for anything touching existing client data.
- Data migrations/seed data run in startup seeders (`config/SystemAccountSeeder.java`, `config/FinancialsDefaultSeeder.java`, `security/RBACInitializer.java`, `security/RolePermissionInitializer.java`).
- Default datasource in `application.properties` is `jdbc:postgresql://localhost:5432/testdb` (dev only — override locally, do not commit changes). JDBC batching is tuned (`batch_size=50`, `order_inserts/updates=true`, `default_batch_fetch_size=50`); Hikari pool sized `max=25/min-idle=5`.

**Stock movement = inventory source of truth.** `purchase/stockmovement/StockMovement` is the append-only ledger for every quantity change (purchase receipts, sales deductions, stock-take adjustments, transfers). Other modules write `StockMovement` rows; on-hand quantities are derived via `StockMovementRepository` aggregates (`SUM(quantity) GROUP BY ...`). Don't bypass this — when adding a new flow that affects stock, post a `StockMovement` and let downstream queries (FIFO/FEFO in `sales/delivery/DeliveryNoteService`, reports in `inventory/reports/`) pick it up.

**Stock-take per-unit batch numbers.** Counted batches in `inventory/stocktake/` use a per-unit storage model: a logical lot of qty=N is N rows in `stock_take_item_batches`, each `quantity=1`, with a distinct `batch_number` ending `-1, -2, ..., -N`. Format: `{ID}-{ddMMyy}-L{NN}-{itemCode}-{unitIndex}` where `ID` is `ST` or `OS`, `L{NN}` is a per-item lot counter. `BatchNumberGenerator` is the single source for building/parsing these strings; `StockTakeLotGroup` collapses unit rows back into a logical lot for the BatchEditor UI. Legacy rows (older `W<wh>-<binCode>` format with `quantity > 1`) coexist untouched.

**Financials module (`financials/`) — 18 subpackages, the largest domain.**
- `generalledger` — GL core: `JournalEntry`/`JournalLine`/`JournalVoucher`, `LedgerEntry`/`LedgerService`, `GlAccountBalance` (materialized running balances, rebuilt by `config/GlBalanceRebuildJob`)
  - `generalledger.postingengine` — `PostingEngineService` is the central auto-posting entry point other modules call into; `PostingRule`/`PostingRuleService` define configurable account-selection rules per transaction type; `DimensionMatrixService`, `PostingErrorCode`/`PostingException` for coded posting guards
  - `generalledger.voucher` — `VoucherSequence`/`VoucherSequenceService`, per-branch/per-voucher-type numbering (same pattern family as stock-take batch numbering)
- `chartofaccounts` — `Account`, `AccountSelectionRules`, `CostCenter`
- `currency` — `Currency`, `ExchangeRate`, `CurrencyService` (multi-currency, AED-anchored)
- `period` — `FiscalYear`, `AccountingPeriod` (+ period locking, see `config/PeriodLockTriggerInstaller`)
- `tax` — `TaxConfiguration`, `TaxFiling`, `TaxService`
- `payment` / `paymentterms` — `PaymentMethod`, `PaymentTerms`
- `receiptvoucher` / `expensevoucher` / `expense` — `ReceiptVoucher` (+`ReceiptPurpose`), `ExpenseVoucher`/`ExpenseVoucherLine`, and a simpler standalone `Expense` (distinct from `expensevoucher`)
- `prepaid` — `PrepaidExpense` amortization
- `fixedasset` — `FixedAsset` depreciation
- `pdc` — Post-Dated Cheques (`PdcEntry`, `PdcStatus`)
- `settlement` — `CardSettlement` (card/POS settlement reconciliation)
- `bankreconciliation` / `reconciliation` — `BankStatement(Line)` + `BankReconciliationService`; a generic `ReconciliationSession`/`ReconciliationService` (throws `exception.ReconciliationException`)
- `statement` — customer/vendor statement of account (`StatementService`, `StatementEntryDTO`)
- `audit` — `FinancialAuditLog`/`FinancialAuditService` — a **finance-specific** audit trail, separate from `security.AuditLog` and `pos.audit.PosAuditLog` (three distinct audit-log subsystems exist in the codebase, one per domain)
- `reports` — `FinancialReportService` producing `TrialBalanceDTO`, `BalanceSheetDTO`, `ProfitLossDTO`, `CashFlowDTO`, `ExpenseAnalysisDTO`, `TaxDashboardDTO`/`TaxReconciliationDTO`, plus `SubLedgerReconciliationService`

Manual journal vouchers above `financials.jv.approval-threshold-aed` (default 10000) require second-approver sign-off before posting — tied to `common.workflow.ApprovalStatus`.

**POS module (`pos/`) — 12+ subpackages, backs the point-of-sale terminal UI.**
- `checkout` — `PosCheckoutController` (sale-completion endpoint)
- `session` — `PosSession`/`PosSessionStatus`, `PosCashMovement` (cash-in/out during a session), `PosSessionScheduler`
- `terminal` / `counter` — `PosTerminal`, `PosCounter` (+ status enums, schedulers/backfill runners)
- `dayclose` — `PosDayClose` (X/Z report source data)
- `cashdrawer` — `PosCashDrawer` (cash-drawer kick-open integration)
- `printer` / `printjob` — `PosPrinter` (backend printer config records) and `PosPrintJob` (queue/audit spine for every print — status/priority/type/payload-format enums, `PosPrintJobTimeoutSweepJob` recovers stuck `DISPATCHED` jobs as `FAILED` after `pos.printjob.dispatch-timeout-minutes`, never auto-requeues)
- `scanner` — `PosScanner` (connection type/input mode/status)
- `held` — `PosHeldSale` (parked/suspended sales)
- `layaway` — `PosLayaway`/`PosLayawayItem`/`PosLayawayPayment`
- `devicemanager` — largest POS subpackage: device discovery (`DiscoveryService`), health sweeps (`PosDeviceHealthSweepJob`, threshold via `pos.device.health-offline-threshold-minutes`), hardware-profile assignment engine, device event logging, config-change events
- `device` — `PosDevice` (status/type/runtime health)
- `search` — `PosSearchService`/`PosLookupService` for barcode/product/customer resolve (`PosResolveResponse`, `PosBatchCheckResponse`)
- `audit` — `PosAuditLog` (POS-specific, see note above)
- `settings` — `PosSettings`
- `receipt` — `ZatcaQrGenerator` (Saudi ZATCA e-invoice QR codes)

**Security**
- JWT-based, stateless sessions. `config/SecurityConfig.java` permits `/api/auth/**`, `/api/client-logs/**`, `/uploads/**`, `/tools/**` and authenticates everything else through `JwtFilter` (registered before `UsernamePasswordAuthenticationFilter`). Defines a `RoleHierarchy` bean (`ROLE_ADMIN > ROLE_BRANCH_ADMIN`) — branch-level restriction for `BRANCH_ADMIN` is enforced separately via `security/BranchScope` + `security/BranchContextHolder`, not through the Spring role hierarchy.
- Method-level security is enabled (`@EnableMethodSecurity`). RBAC is the access model: `security/Permission`, `security/RolePermission` (+`RolePermissionService`/`RolePermissionInitializer`), `security/ModulePermissionService` (module-level access gate), `security/RBACInitializer` (base role/permission bootstrap). Feature toggles in `application.properties` (`rbac.<module>.enabled` for user-management/hr/customer/finance/inventory/purchases/sales/dashboard/notification/tally) gate whole module groups — only `tally` defaults to disabled.
- `security/AdminSafeguardService` guards against removing/locking out the last admin. `security/LoginRateLimiter` throttles brute-force login attempts.
- All audited actions flow through `security/AuditLogService` (general security trail — see the three-audit-subsystem note above). Toggles `rbac.audit.log-allowed` / `rbac.audit.log-denied` control verbosity; `audit.retention.months` (0 = keep forever) drives `config/AuditLogRetentionJob`.

**Bootstrapping order matters.** `RBACInitializer`, `RolePermissionInitializer`, `SystemAccountSeeder`, `FinancialsDefaultSeeder` run at startup and seed required rows. New modules that depend on a permission/role need to register it in the appropriate initializer rather than via runtime data.

**Reporting/export**: Apache POI (`poi`/`poi-ooxml`) for Excel export, Microsoft Playwright (headless Chromium) for HTML→PDF (`document/HtmlPdfService`). Auth uses `jjwt-api/-impl/-jackson` 0.11.5.

## Frontend architecture

- `src/api/` — one file per backend feature (`stockTakeApi.js`, `salesApi.js`, etc.; also domain subfolders like `api/purchase/`). All requests go through the shared `axiosConfig.js` instance, which reads the JWT from `sessionStorage` and attaches `Authorization: Bearer <token>`. New endpoints belong in the matching `api/` file, not inline in components.
- Base URL: `import.meta.env.VITE_API_BASE_URL` if set, otherwise `window.location.origin` (so the build is proxy-ready behind a reverse proxy).
- `src/pages/` mirrors the backend domain split: `Customer/`, `dashboards/`, `Enterprise/`, `Financials/`, `HR/` (`SalaryAdvance/`, `SalaryPayment/`), `Inventory/` (`Barcode/`, `Brand/`, `Department/`, `Product/`, `Reports/`, `StockTaking/`, `StockTransfer/`, `SubDepartment/`, `Units/`, `Warehouse/`), `Purchase/` (`GRN/`, `Invoice/`, `LPO/`, `Payment/`, `Reports/`, `Templates/`, `Vendor/`), `Sales/` (`POS/`, `Reports/`, `Templates/`, `components/`), `Notifications/`, `Settings/`. Page components are typically large and own their own modal/form state. `src/MyProfile/` sits outside `pages/` as a standalone top-level folder.
- `src/context/` — `BranchContext`, `CompanyContext`, `NotificationContext`, `PermissionContext` (branch scoping, tenant/company info, notifications, RBAC permission gates). Auth state lives in `src/context/`/`src/auth/` (`login.jsx`, `PrivateRoute.jsx`, `RoleRoute.jsx`).
- `src/hooks/` — `useHeartbeat`, `useIdleTimeout`, `usePermission`, `usePrintDocument`, `useReportScrollPreserver`, `useShortcuts`.
- `src/components/` — `auth/`, `common/`, `purchase/`, `ui/` (shadcn/Radix-wrapped primitives), `pos/` (`SupervisorTakeoverDialog`, `TerminalStatusBadge`), `print/` (`DocumentA4Preview`).
- `src/layout/Sidebar.jsx` and cross-cutting pieces.
- Tailwind v4 — utility classes inline; no separate config file beyond what's in `vite.config.js` and `index.css`. The amber/yellow palette (`#F5C742`, `bg-[#FFF8E7]`, `border-[#FDE6A9]`) is the brand accent. UI primitives are Radix-based (accordion, dialog, dropdown-menu, select, tabs, tooltip, etc.) wrapped with `class-variance-authority`/`tailwind-merge`; charts via `recharts`.

**Printing/document generation (`src/utils/`) — the richest utility surface, worth knowing before touching any receipt/invoice flow:**
- `escPosReceipt.js` — ESC/POS byte-stream generation for thermal receipts
- `localPrintAgent.js` — bridge to the local `pos-print-agent` (see below)
- `zebraZpl.js` — Zebra label printing (ZPL) via Browser Print
- `bilingualReceiptCanvas.js`, `overlayInvoiceRenderer.js` — canvas-based bilingual (EN/AR) receipt/invoice rendering
- `branchPrintProfile.js`, `printTemplateConfig.js`, `printGenerator.js` — print template resolution
- `financialPrintTemplate.js`, `journalVoucherPrintTemplate.js`, `pickListPrintTemplate.js`, `purchasePrintUtils.js`, `documentTemplateRenderer.js` — domain-specific print templates (see "Print dual-renderer" note: designer live preview and actual print are separate renderers kept in sync by hand)
- `documentSummaryUtils.js`, `documentOrdering.js`, `documentEmailSender.js`, `emailImageInliner.js` — document/email generation (`juice` for CSS-inlined HTML email)
- `receiptFont.js`, `interFontBase64.js`, `dirhamSymbolBase64.js` — embedded font/glyph assets for receipts (AED dirham symbol)
- `exportUtils.js` — Excel (`exceljs`)/PDF (`jspdf`+`jspdf-autotable`) export helpers
- `vatMath.js`, `salesNumbering.js`, `serialNumbering.js`, `salesPricing.js`, `unitPricing.js` — tax/numbering/pricing calculation utilities
- `customerResolution.js`, `statementUtils.js`, `countryCurrencyOptions.js`, `dateUtils.js`, `displayName.js`, `filenameUtils.js`, `urlUtils.js`, `clientLogger.js` (posts to backend `logging.ClientLogController`)
- `utils/supabase/customer-connect-service.ts` — a lone TypeScript file referencing Supabase; verify whether this is a live integration or leftover before relying on it

**POS print agent integration.** `src/utils/localPrintAgent.js` talks to the standalone `tools/pos-print-agent/` app over local HTTP (`http://127.0.0.1:19777`, falling back to `localhost`), probing `/health` with a 400ms timeout and 15s cooldown between retries. Endpoints: `GET /printers`, `POST /test-print`, `POST /print/receipt` (text/GDI fallback), `POST /print/escpos` (raw ESC/POS bytes, base64-encoded — the only path carrying density/heat/font/raster-image thermal commands). Key behaviors:
- **Network/IP printers bypass the agent entirely** — routed straight through the backend (`api/posPrinterApi.printPosPrinterEscPos`, opens a raw socket to the printer's LAN IP), so they work from any device without the agent installed. Only USB/Bluetooth/Windows-queue printers need the local agent.
- SHA-256 integrity check (`logEscPosIntegrity`) compares the browser-generated payload hash against what the agent reports decoding (agent ≥0.5.0), to catch transit corruption.
- Every receipt print creates a `PosPrintJob` audit/queue record via backend calls (`createPrintJob`/`dispatchPrintJob`/`reportPrintJobResult`) as best-effort bookkeeping — must never block the actual print.
- ESC/POS rejection (e.g. a v4/WSD driver refusing raw `StartDocPrinter`) auto-falls-back to the text/GDI `/print/receipt` path, annotated `fallbackUsed: "text"` so callers can surface a "compatibility mode" warning.
- See `docs/pos-device-architecture-specification-v2-2026-06-30.md §10.3` for the fuller interim architecture writeup.

## Conventions worth knowing

- Backend response DTOs are usually plain getter classes alongside the controller (e.g. `StockTakeProductResponse.java`). Inline `public static class` request DTOs inside controllers are common — see `StockTakeController.BatchRequest` for the pattern.
- Entities expose computed views to the frontend via `@Transient` getters that Jackson serializes (e.g. `StockTakeItem.getLotGroups()`). Use this when the frontend needs an aggregated/derived view without a dedicated DTO endpoint.
- Tests use Mockito (`@ExtendWith(MockitoExtension.class)`) with mocked repositories. Builder methods at the bottom of each test class create fixtures; reuse them rather than constructing entities inline.
- The unit suite (Mockito tests) is fully green. The only test that fails on a bare `mvn test` is `BillbullBackendApplicationTests.contextLoads` (a `@SpringBootTest`), and only when no datasource is configured — it needs a reachable DB (pass `-Dspring.datasource.url/username/password` or activate a profile). It is not a code regression.
