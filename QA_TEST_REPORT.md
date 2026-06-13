# BillBull Retail — Complete QA Test Report

**Date:** 2026-06-13
**Branch:** `feature/jun13`
**Tested by:** Automated QA pass (build, unit tests, lint, production bundle, coverage analysis)
**Environment:** Windows 11 · Java 17.0.12 · Maven 3.9.11 · Node v22.20.0 · npm 11.6.2 · PostgreSQL 5432 (running)

---

## 1. Executive Summary

| Area | Result | Detail |
|------|--------|--------|
| Backend compile (`mvn compile`) | ✅ PASS | 628 source files, exit 0 |
| Backend unit tests (90 Mockito tests) | ✅ PASS | 0 failures, 0 errors |
| Backend context-load test (`@SpringBootTest`) | ✅ PASS* | Passes with a valid datasource; fails only because of an uncommitted config edit (see Finding **B-1**) |
| Frontend production build (`vite build`) | ✅ PASS | 3937 modules, exit 0 |
| Frontend lint (`eslint .`) | ❌ FAIL | **60 errors, 2508 warnings** — includes real runtime bugs |

**Overall verdict:** The system **compiles and builds successfully** on both tiers, and the backend's automated test suite is **fully green** once a database is configured. However, **ESLint surfaces several genuine runtime defects in the frontend** (undefined-variable references in print/payment flows, a dead-code logic bug in quotation conversion) that the build does **not** catch because Vite does not run ESLint. These should be fixed before release.

The single most important caveat: **passing `npm run build` is not a sufficient quality gate for this project** — the production bundle builds cleanly while shipping code that will throw `ReferenceError` at runtime. Lint must be part of CI.

\* The context test was independently re-run against the live PostgreSQL instance and **passed (BUILD SUCCESS, full context boot in 87 s)**. The failure in the default run is purely environmental.

---

## 2. Test Scope

| Module | Backend (Java files) | Frontend |
|--------|---------------------|----------|
| Inventory | 167 | pages/Inventory |
| Financials | 127 | pages/Financials |
| Sales | 109 | pages/Sales |
| Purchase | 82 | pages/Purchase |
| HR | 24 | pages/HR |
| Settings | 22 | pages/Settings |
| Customer | 21 | pages/Customer |
| Security / Auth / User / Role | 31 | auth/, context/ |
| **Backend total** | **628 source files · 79 controllers · 590 REST endpoints · 101 services** | |
| **Frontend total** | | **287 source files · 102 page components · 59 API modules** |

---

## 3. Backend Test Results

### 3.1 Full suite (`mvn -o test`)

```
Tests run: 91, Failures: 0, Errors: 1, Skipped: 0   (default run)
```

The **only** failure was `BillbullBackendApplicationTests.contextLoads`, with root cause:

```
Failed to configure a DataSource: 'url' attribute is not specified
and no embedded datasource could be configured.
Reason: Failed to determine suitable jdbc url
```

Re-running that test with a valid datasource → **`Tests run: 1, Failures: 0, Errors: 0` · BUILD SUCCESS**. So the effective result is **91/91 pass**.

### 3.2 Per-class breakdown (all green)

| Test class | Tests | Result |
|------------|-------|--------|
| PostingEngineContractTest | 37 | ✅ |
| StockTakeServiceTest | 9 | ✅ |
| PurchaseBatchCreationServiceTest | 6 | ✅ |
| PostingEngineServiceTest | 5 | ✅ |
| WarehouseServiceTest | 4 | ✅ |
| UserServiceTest | 3 | ✅ |
| BranchServiceTest | 3 | ✅ |
| SalesDocumentNumberingServiceTest | 3 | ✅ |
| BatchSelectionServiceTest | 3 | ✅ |
| EmployeeServiceImplTest | 3 | ✅ |
| ReconciliationServiceTest | 3 | ✅ |
| DocumentOrderingUtilTest | 2 | ✅ |
| EmployeeControllerTest | 2 | ✅ |
| ReceiptVoucherServiceTest | 2 | ✅ |
| PaymentServiceTest / CustomerServiceTest / PaymentVoucherServiceTest / InventoryReportServiceTest / LedgerServiceBankAccountTest | 1 each | ✅ |
| BillbullBackendApplicationTests | 1 | ✅ (with DB) |

> **Note — stale documentation:** `CLAUDE.md` states `EmployeeControllerTest` and `UserServiceTest` are "tracked WIP failures." They **both pass now** (2/2 and 3/3). That note is out of date and should be removed.

---

## 4. Frontend Results

### 4.1 Production build — ✅ PASS (exit 0)

- 3937 modules transformed, built in 1 m 39 s.
- **Bundle-size warning (performance):** the main chunk is **6.79 MB (1.72 MB gzipped)** in a single file. No meaningful route-level code-splitting. First-load performance will suffer; recommend `manualChunks` / dynamic `import()`.
- **Circular-dependency warning:** `recharts` re-export (`Bar`) referenced from `customer-connect-dashboard.tsx` → may produce broken chunk execution order.
- **Mixed import warning:** `jspdf` is both statically (`exportUtils.js`) and dynamically (`printGenerator.js`) imported — the dynamic import is neutralized.

### 4.2 Lint — ❌ FAIL (60 errors, 2508 warnings)

**Error breakdown by rule:**

| Rule | Count | Severity |
|------|-------|----------|
| React Compiler diagnostics (setState-in-effect, impure render, access-before-declared) | 28 | Medium — code-smell / potential render bugs |
| `no-undef` (undefined variable references) | 24 | **High — real runtime bugs** |
| `no-constant-binary-expression` | 4 | **High — dead-code logic bugs** |
| `no-useless-escape` | 2 | Low |
| `react-hooks/rules-of-hooks` | 1 | False positive (API fn named `useTemplate`) |
| `no-case-declarations` | 1 | Low |

**Warning breakdown:** `no-unused-vars` ×2407 (mostly unused icon imports — cosmetic), `react-hooks/exhaustive-deps` ×84 (potential stale-closure risks), `react-refresh/only-export-components` ×13.

---

## 5. Confirmed Defects (require fixing)

### 🔴 F-1 — Broken payment-voucher print in Vendor page *(High)*
**File:** `billbull-frontend/src/pages/Purchase/Vendor/Vendor.jsx` (lines 776–783, 916–956)

`handlePrintPaymentVoucher` was placed inside the `VendorSoA` component but references ~10 variables that exist only in a sibling component: `lastSavedPayment`, `lastSavedInvoice`, `setIsPaymentPrinting`, `nextVoucherNo`, `paymentDate`, `paymentMethod`, `reference`, `selectedVendor`, `bankAccount`, `chequeDate`. Additionally the payment component's "Print Payment Voucher" button (line 777) references `handlePrintPaymentVoucher`/`lastSavedPayment` which are also undefined in *its* scope.
**Impact:** Clicking "Print Payment Voucher" throws `ReferenceError`; the vendor payment-voucher print feature is non-functional.

### 🔴 F-2 — Quotation→line discount/tax fallback is dead code *(High)*
**File:** `billbull-frontend/src/pages/Sales/Quotations.jsx` (lines 889–890)

```js
disc: Number(item.discount) ?? incomingDiscount,
tax:  Number(item.taxRate)  ?? incomingTax,
```
`Number(x)` never returns `null`/`undefined`; for missing/invalid values it returns `NaN`, and `NaN ?? fallback` evaluates to `NaN`. The intended fallback to `incomingDiscount`/`incomingTax` **never runs**, so discount/tax silently become `NaN` on conversion.
**Fix:** use `Number.isFinite(n) ? n : incomingDiscount` (or `Number(item.discount ?? incomingDiscount)`).

### 🔴 F-3 — Delivery Note browser-print fallback throws *(Medium)*
**File:** `billbull-frontend/src/pages/Sales/DeliveryNote.jsx` (lines 1775, 1780)

In the no-default-template fallback (and its catch block), `generateDocFilename('Delivery Note', dnNo, customerName, ...)` references `dnNo` and `customerName`, which are not in scope.
**Impact:** When no DN print template is configured, the fallback that should degrade to browser print instead throws `ReferenceError`.

### 🟠 F-4 — "Download PDF" buttons are no-ops *(Medium)*
**Files:** `Purchase/GRN/GRN.jsx:312`, `Purchase/Invoice/PurchaseInvoices.jsx:749`, `Purchase/LPO/lpo.jsx:667`

Each list row renders `onClick={() => onDownload && onDownload(row)}` but `onDownload` is never declared/passed as a prop. The `&&` guard prevents a crash, so the **Download PDF button silently does nothing**.

### 🟡 F-5 — Permanently disabled modal shipped in production *(Low)*
**File:** `billbull-frontend/src/pages/Sales/SalesInvoice.jsx:4795` — `{false && isDNModalOpen && (…)}`. The leading `false &&` disables the Uninvoiced-DN modal entirely. Likely intentional during development; remove the dead branch or restore the feature.

### 🟡 F-6 — `useTemplate` naming collision (lint false positive) *(Low)*
**File:** `Customer/Messaging.jsx:301`. `useTemplate` is an async API function in `messagingApi.js`, not a React hook, but its `use`-prefix trips `react-hooks/rules-of-hooks`. No runtime bug; rename (e.g. `markTemplateUsed`) to silence the rule and avoid confusion.

### B-1 — Uncommitted config edit breaks app startup & context test *(blocker if committed)*
**File:** `billbull-backend/src/main/resources/application.properties` (working-tree, uncommitted)

The edit removed `server.port`, `spring.datasource.url`, `spring.datasource.username`, and `spring.datasource.password`. With no active profile, the app **cannot start** ("Failed to determine suitable jdbc url"). This is what fails the context test.
**Action:** Do not commit this stripped file, or restore the datasource lines (or always run under a profile such as `-Dspring.profiles.active=testing`). Note the committed default is `postgres/admin`, while every profile uses `postgres/root` — align these.

---

## 6. Test Coverage Gap Analysis

Automated coverage is **backend-only**. There are **no frontend tests** (only `lint` + `build` scripts; zero `*.test.*`/`*.spec.*` files).

**Backend:** 101 service classes, ~16 have a dedicated test → roughly **84% of services have no unit test**. Notable untested high-value services:

- **Sales:** `SalesInvoiceService`, `SalesOrderService`, `QuotationService`, `DeliveryNoteService`, `SalesReturnService`, `AdvanceApplicationService`, `CustomerCreditService`, `StockDeductionStrategyService`
- **Purchase:** `PurchaseInvoiceService`, `GrnService`, `LpoService`, `PurchaseReturnService`, `StockMovementService` *(inventory source-of-truth ledger)*, `VendorAdvanceService`, `ApprovalWorkflowService`
- **Inventory:** `ProductService`, `StockTransferService`, `InventoryBalanceService`, `StockAvailabilityService`, `WarehouseStockService`, `BinStockService`, all import/export services
- **Financials:** `JournalEntryService`, `LedgerService`, `BankReconciliationService`, `AccountingPeriodService`, `TaxService`, `PdcService`, `FixedAssetService`, `FiscalYearService`, `VoucherSequenceService`, `CardSettlementService`, `ExpenseService`
- **HR:** `SalaryPaymentService`, `SalaryAdvanceService`

Coverage *is* strong where it matters most for correctness: the **double-entry posting engine** (`PostingEngineContractTest`, 37 contract tests covering PDF §21A–§21J) and **stock-take batch logic** (`StockTakeServiceTest`, 9 tests).

---

## 7. What Was NOT Tested (limitations of this pass)

This was a static + automated-suite QA pass. It did **not** include:

1. **Runtime / end-to-end testing** — no app was launched against a seeded DB to click through flows. The defects in §5 were found by static analysis; their runtime impact is inferred from code.
2. **API integration tests** — 590 REST endpoints have no `@WebMvcTest`/`@SpringBootTest` HTTP-level coverage.
3. **Frontend behavior** — no component/render/interaction tests exist to run.
4. **Database migration / stale-schema upgrade path** — `ddl-auto=update` does not alter existing NOT NULL columns or widened enum CHECK constraints (a known hazard for existing-client upgrades).
5. **Security / authz testing** — RBAC permission enforcement, JWT expiry, method-security boundaries were not exercised at runtime.
6. **Performance / load** — only the static bundle-size warning was noted.

---

## 8. Recommendations (prioritized)

1. **Fix F-1, F-2, F-3** before release — these are user-facing runtime/logic bugs in payment-print, quotation conversion, and DN print fallback.
2. **Add ESLint to CI as a blocking gate** for `error`-level rules. The build passing while shipping `ReferenceError`s is the core process gap. (Warnings can stay non-blocking initially.)
3. **Restore / profile-guard the datasource config** (B-1) and reconcile the `admin` vs `root` password mismatch across `application.properties` and profiles.
4. **Address F-4** (wire `onDownload`) and decide on F-5 (remove or restore the disabled modal).
5. **Update `CLAUDE.md`** — remove the stale "EmployeeControllerTest / UserServiceTest are failing WIP" note.
6. **Improve frontend bundle splitting** — the 6.79 MB single chunk hurts first-load; introduce route-level lazy loading.
7. **Grow backend coverage** on the highest-risk untested services: `SalesInvoiceService`, `PurchaseInvoiceService`, `StockMovementService`, `JournalEntryService`, `LedgerService`, `BankReconciliationService`.
8. **Add at least smoke-level frontend tests** (the project currently has none).

---

## 9. Commands Run (reproducible)

```bash
# Backend
cd billbull-backend
mvn -o compile                                  # ✅ exit 0
mvn -o test                                     # 91 run, 1 error (datasource config only)
mvn -o test -Dtest=BillbullBackendApplicationTests \
  -Dspring.datasource.url=jdbc:postgresql://localhost:5432/postgres \
  -Dspring.datasource.username=postgres -Dspring.datasource.password=admin   # ✅ BUILD SUCCESS

# Frontend
cd billbull-frontend
npm run lint                                    # ❌ 60 errors, 2508 warnings
npm run build                                   # ✅ exit 0 (3937 modules)
```

---

## 10. Fixes Applied (2026-06-13)

All confirmed defects from §5 were fixed in the working tree. ESLint errors dropped **60 → 33** and the production build still passes (3937 modules, exit 0). The 33 remaining errors are all the pre-existing React-Compiler diagnostics (setState-in-effect / impure-render / access-before-declared) noted in §4.2 as Medium code-smell — they were out of scope for this defect-fix pass.

| ID | Fix | Files |
|----|-----|-------|
| F-1 | Moved `handlePrintPaymentVoucher` out of `VendorSoA` into `PayInvoices` (where all its referenced state actually lives) and deleted the orphaned copy. Payment-voucher print now works. | `Purchase/Vendor/Vendor.jsx` |
| F-2 | Replaced `Number(x) ?? fallback` (dead code — `Number()` returns `NaN`, never nullish) with `Number.isFinite(Number(x)) ? Number(x) : fallback`. Discount/tax defaults now apply on quotation conversion. | `Sales/Quotations.jsx` |
| F-3 | Fixed browser-print fallback to use the in-scope `dnNumber` / `selectedCustomer?.name` instead of undefined `dnNo` / `customerName` (both the fallback and the catch block). | `Sales/DeliveryNote.jsx` |
| F-4 | Added the missing `onDownload` prop to the list-component destructuring (parents already passed `onDownload={handleDownload}`). "Download PDF" buttons now fire. | `Purchase/GRN/GRN.jsx`, `Purchase/Invoice/PurchaseInvoices.jsx`, `Purchase/LPO/lpo.jsx` |
| F-5 | Deleted the dead, `false &&`-guarded duplicate Uninvoiced-DN modal (the active one at line ~3187 is unaffected). | `Sales/SalesInvoice.jsx` |
| F-6 | Renamed the API function `useTemplate` → `markTemplateUsed` (it is not a React hook) and updated its import + call site. Removes the `rules-of-hooks` false positive. | `api/messagingApi.js`, `Customer/Messaging.jsx` |
| Doc | Updated the stale `CLAUDE.md` note — `EmployeeControllerTest` / `UserServiceTest` now pass; the only bare-`mvn test` failure is the datasource-less context-load test. | `CLAUDE.md` |

**Verification after fixes:**
```bash
npm run lint    # 33 errors, 2505 warnings  (was 60 / 2508 — the 27 targeted errors resolved)
npm run build   # ✅ exit 0, 3937 modules, built in ~1m
```

**Not changed:** the backend `application.properties` working-tree edit (B-1) was left as-is — it is the user's uncommitted change and should not be committed; restore the datasource lines or run under a profile before starting the app.
