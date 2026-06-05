# Branch & Outlet Management: Specification vs. Implementation

This document provides a side-by-side comparison between the official specification (`BillBull_Branch_Outlet_Developer_Guide.pdf`) and the actual implemented state (as detailed in `branch-outlet-implementation-report.md`).

## 1. Database Schema

| Feature | PDF Specification | Implemented State | Status |
| :--- | :--- | :--- | :--- |
| **`branches` table** | Create central table with specific columns and `is_headquarters` flag. | `branches` table created with all required columns. | ✅ **Fully Implemented** |
| **`branch_id` Foreign Keys** | Add to all master data and transaction tables. | Added to all required tables (Group A with Navigable View, Group B with pure FK). | ✅ **Fully Implemented** |
| **`user_branches` Junction** | Use junction table for users to support multiple branches. | Implemented via `User.additionalBranches`. | ✅ **Fully Implemented** |
| **NOT NULL Constraints** | Apply `NOT NULL` constraints on `branch_id` after data seeding. | Kept nullable to allow legacy cross-branch shared rows (e.g., shared products). | ⚠️ **Deliberately Deferred** |
| **Legacy Columns** | N/A | Legacy `String branch` columns kept on Customer, Employee, CostCenter, ReceiptVoucher to prevent breaking existing services. | ⚠️ **Deferred for cleanup** |
| **Composite Indexes** | Use composite indexes (e.g., `branch_id`, `status`, `created_at`) for high volume. | Single column `branch_id` index applied. Composite indexes deferred until volume demands it (>100k rows). | ⚠️ **Deferred** |

## 2. Backend & API Layer

| Feature | PDF Specification | Implemented State | Status |
| :--- | :--- | :--- | :--- |
| **Session / JWT Context** | Embed branch context (`branchId`, `branchIds`, `isAllBranches`) in JWT. | `JwtUtil` handles JWT claims successfully. | ✅ **Fully Implemented** |
| **Global Query Middleware** | Use `BranchScope` to automatically append `branch_id` filters to queries. | `BranchScope` and `BranchAccessService` filter lists. | ✅ **Fully Implemented** |
| **API Header** | Use `X-Branch-Id` header for API requests. | `JwtFilter` processes this header. | ✅ **Fully Implemented** |
| **Branch Switching** | Endpoint to switch branch without re-logging in. | `POST /api/session/switch-branch` is available. | ✅ **Fully Implemented** |
| **Transaction Immutability** | `branch_id` is locked and immutable after initial save. | Enforced in services via `applyBranchSnapshot` (no-op on updates). | ✅ **Fully Implemented** |

## 3. Transactional Modules

| Feature | PDF Specification | Implemented State | Status |
| :--- | :--- | :--- | :--- |
| **Branch Assignment Rule** | Active session branch assigned on creation. | Done uniformly across all 14 transactional modules. | ✅ **Fully Implemented** |
| **Inter-Branch Transfers** | Requires two records: stock-out and stock-in. | Handled automatically at the ledger level via paired `STOCK_TRANSFER_OUT` and `STOCK_TRANSFER_IN` movements. | ✅ **Fully Implemented** |
| **Document Numbering** | May be branch-specific (e.g., BR01/INV/...). | Currently global numbering; branch-specific sequences deferred. | ⚠️ **Deferred** |

## 4. Print Templates & Email

| Feature | PDF Specification | Implemented State | Status |
| :--- | :--- | :--- | :--- |
| **Print Headers** | Must reflect the originating transaction's branch, regardless of the person reprinting. | Achieved via `buildDocumentHeaderProfile({ branchId: <transaction's branch> })`. | ✅ **Fully Implemented** |
| **All Branches Header** | Fall back to Headquarters branding if "All Branches" is selected. | Supported via `buildReportHeaderProfile`. | ✅ **Fully Implemented** |
| **Email Branding** | 'From' name and Reply-to address match the branch. | Overload created `DocumentEmailSender.send(..., branchId)`. | ✅ **Fully Implemented** |
| **Email Button UI** | N/A | Backend is ready, but SalesInvoice email-button UI wiring is a stub. | ⚠️ **Deferred** (frontend) |

## 5. Reports & Frontend

| Feature | PDF Specification | Implemented State | Status |
| :--- | :--- | :--- | :--- |
| **Global Branch State** | `BranchContext` in state management. | Implemented via React context and Axios interceptors. | ✅ **Fully Implemented** |
| **Branch Selector UI** | Top navigation bar component with role-based visibility. | `BranchSelector` handles Admin (All) and Restricted (assigned only) views. | ✅ **Fully Implemented** |
| **Report Filtering** | Filter parameter for all reports. | All 20+ reports accept `branchId`. Dedicated per-report dropdown is deferred in favor of the global selector. | ✅ **Mostly Implemented** |
| **Aggregation Strategy** | "All Branches" reports must include a `GROUP BY branch_id` to show branch-wise subtotals. | Records pool correctly for "All", but per-row branch breakdown columns require per-report rewrites. | ⚠️ **Deferred** |
| **Cache Keys** | Include `branch_id` in caching keys. | Not applicable as there is no report caching layer present yet. | ⏩ **N/A** |

---
**Summary:**
The core infrastructure for the branch/outlet features (isolation, immutability, print logic, JWT/session handling) is fully aligned with the PDF specification. The deviations are strategic deferrals—primarily keeping database constraints nullable for backward compatibility, deferring complex `GROUP BY` report rewrites, and holding off on multi-column indexes until they are proven necessary by volume.
