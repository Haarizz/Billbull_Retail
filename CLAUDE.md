# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Two-module monorepo for the BillBull retail/ERP system:

- `billbull-backend/` — Spring Boot 3.5 / Java 17 / Maven, PostgreSQL via JPA + Hibernate
- `billbull-frontend/` — React 19 + Vite 7 + Tailwind v4, axios, react-router

`tools/` contains a one-off documentation generator (`generate_billbull_documentation.cjs`); it is not part of the build.

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

## Backend architecture

**Package-by-feature** under `com.billbull.backend.*`. Top-level packages map to business domains: `inventory`, `sales`, `purchase`, `customer`, `hr`, `financials`, `dashboard`, `auth`, `user`, `role`, `security`, `settings`. Each feature folder typically contains the entity, repository, service, controller, and DTOs together.

**Persistence**
- Every persisted entity extends `com.billbull.backend.common.BaseEntity`, which provides `id`, `createdAt/By`, `updatedAt/By`, and an `isActive` flag. Auditing is wired via `@EnableJpaAuditing` (see `config/JpaAuditingConfig.java`).
- Soft-delete is the convention: clear `isActive` rather than physical-deleting. Look for this pattern before adding `delete()` calls.
- Schema is JPA-managed (`spring.jpa.hibernate.ddl-auto=update`). **No Flyway/Liquibase migrations.** Schema changes happen via entity edits + a manual restart; data migrations are done in seeders (`config/SystemAccountSeeder.java`, `config/FinancialsDefaultSeeder.java`, `security/RBACInitializer.java`, `security/RolePermissionInitializer.java`) which run at startup.
- Default datasource in `application.properties` is `jdbc:postgresql://localhost:5432/test` with `postgres/admin`. Override locally if needed; do not commit changes.

**Stock movement = inventory source of truth.** `purchase/stockmovement/StockMovement` is the append-only ledger for every quantity change (purchase receipts, sales deductions, stock-take adjustments, transfers). Other modules write `StockMovement` rows; on-hand quantities are derived via `StockMovementRepository` aggregates (`SUM(quantity) GROUP BY ...`). Don't bypass this — when adding a new flow that affects stock, post a `StockMovement` and let downstream queries (FIFO/FEFO in `sales/delivery/DeliveryNoteService`, reports in `inventory/reports/`) pick it up.

**Stock-take per-unit batch numbers.** Counted batches in `inventory/stocktake/` use a per-unit storage model: a logical lot of qty=N is N rows in `stock_take_item_batches`, each `quantity=1`, with a distinct `batch_number` ending `-1, -2, ..., -N`. Format: `{ID}-{ddMMyy}-L{NN}-{itemCode}-{unitIndex}` where `ID` is `ST` or `OS`, `L{NN}` is a per-item lot counter. `BatchNumberGenerator` is the single source for building/parsing these strings; `StockTakeLotGroup` collapses unit rows back into a logical lot for the BatchEditor UI. Legacy rows (older `W<wh>-<binCode>` format with `quantity > 1`) coexist untouched.

**Security**
- JWT-based, stateless sessions. `config/SecurityConfig.java` permits `/api/auth/**` and `/uploads/**` and authenticates everything else through `JwtFilter`.
- Method-level security is enabled (`@EnableMethodSecurity`). RBAC is the access model — see `security/Permission`, `security/RolePermission`, `security/ModulePermissionService`. Feature toggles in `application.properties` (`rbac.<module>.enabled`) gate whole module groups.
- All audited actions flow through `AuditLogService`. Toggles `rbac.audit.log-allowed` / `rbac.audit.log-denied` control verbosity.

**Bootstrapping order matters.** `RBACInitializer`, `RolePermissionInitializer`, `SystemAccountSeeder`, `FinancialsDefaultSeeder` run at startup and seed required rows. New modules that depend on a permission/role need to register it in the appropriate initializer rather than via runtime data.

## Frontend architecture

- `src/api/` — one file per backend feature (`stockTakeApi.js`, `salesApi.js`, etc.). All requests go through the shared `axiosConfig.js` instance, which reads the JWT from `sessionStorage` and attaches `Authorization: Bearer <token>`. New endpoints belong in the matching `api/` file, not inline in components.
- Base URL: `import.meta.env.VITE_API_BASE_URL` if set, otherwise `window.location.origin` (so the build is proxy-ready behind a reverse proxy).
- `src/pages/` mirrors the backend domain split: `Inventory/`, `Sales/`, `Purchase/`, `Customer/`, `HR/`, `Financials/`, `Settings/`. Page components are typically large and own their own modal/form state.
- `src/context/`, `src/hooks/`, `src/components/`, `src/layout/` hold cross-cutting pieces. Auth state lives in `src/context/`/`src/auth/`.
- Tailwind v4 — utility classes inline; no separate config file beyond what's in `vite.config.js` and `index.css`. The amber/yellow palette (`#F5C742`, `bg-[#FFF8E7]`, `border-[#FDE6A9]`) is the brand accent.

## Conventions worth knowing

- Backend response DTOs are usually plain getter classes alongside the controller (e.g. `StockTakeProductResponse.java`). Inline `public static class` request DTOs inside controllers are common — see `StockTakeController.BatchRequest` for the pattern.
- Entities expose computed views to the frontend via `@Transient` getters that Jackson serializes (e.g. `StockTakeItem.getLotGroups()`). Use this when the frontend needs an aggregated/derived view without a dedicated DTO endpoint.
- Tests use Mockito (`@ExtendWith(MockitoExtension.class)`) with mocked repositories. Builder methods at the bottom of each test class create fixtures; reuse them rather than constructing entities inline.
- Existing failing tests in `EmployeeControllerTest` and `UserServiceTest` are tracked WIP for the RBAC/employee-user linkage work — not regressions from unrelated changes. Check git history before assuming a failure is yours.
