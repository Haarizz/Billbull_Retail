# BillBull ERP — Complete Manual Frontend Testing Plan
**Version:** 1.0  
**Date:** 2026-06-11  
**Tester:** ___________________  
**Environment:** http://localhost:5173 (frontend) → http://localhost:8080 (backend)  
**DB:** `testdb` @ localhost:5432  

---

## How to Use This Document

- Work through phases **in order** — each phase creates data that the next phase depends on.
- For every test case, fill in **Actual Result**, **Pass/Fail**, and **Issue #** columns.
- Severity codes: **C** = Critical (system down / data loss) · **H** = High (feature broken) · **M** = Medium (wrong output) · **L** = Low (cosmetic/UX)
- Keep a numbered issue log at the end of the document (Issue #001, #002 …).
- Screenshots: name them `TC-{id}_{short_desc}.png` and place in a `/screenshots` folder.

---

## Test Case ID Convention

`TC-{Phase}{Module}-{NN}`  
Example: `TC-1CFG-01` = Phase 1, Config module, test 01.

---

---

# PHASE 1 — COMPANY SETUP & SYSTEM CONFIGURATION

## Module 1.1 — Company Settings

**Page:** Settings → Company Settings  
**API file:** `companyProfileApi.js`  
**Backend:** `CompanyProfileController.java`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-1CFG-01 | Open Settings → Company Settings. Verify default data loaded. | — | Company form loads without error | | | | |
| TC-1CFG-02 | Fill all fields: Name, Address, Phone, Email, Tax/VAT number, Website. Click Save. | Name: BillBull Trading LLC, VAT: 100123456700003 | Success toast; data persists on page reload | | | | |
| TC-1CFG-03 | Upload company logo (PNG < 2 MB). | Any PNG | Logo preview shown; logo appears in print headers | | | | |
| TC-1CFG-04 | Upload oversized file (> 100 MB). | Large file | Validation error; no crash | | | | |
| TC-1CFG-05 | Navigate to any print preview (Sales Invoice). | — | Company name, address, VAT, logo all present | | | | |
| TC-1CFG-06 | Change decimal precision to 3. Save. Open Sales Invoice create form. | Precision = 3 | Unit price field allows 3 decimal places | | | | |

---

## Module 1.2 — Branch / Outlet Management

**Page:** Settings → Branch Setup  
**API:** `branchApi.js`  
**Backend:** `BranchController.java`, `OutletController.java`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-1BRN-01 | Create Branch 1. | Name: Main Branch, Code: MB01 | Branch saved; appears in branch list | | | | |
| TC-1BRN-02 | Create Branch 2. | Name: Warehouse Branch, Code: WB01 | Branch saved | | | | |
| TC-1BRN-03 | Attempt to create branch with duplicate code. | Code: MB01 | Validation error "Code already exists" | | | | |
| TC-1BRN-04 | Switch active branch to Branch 2 (if branch switching UI exists). | — | All subsequent data creation scoped to Branch 2 | | | | |
| TC-1BRN-05 | Switch back to Branch 1. Verify Branch 2 data not visible (if isolated). | — | Branch isolation respected | | | | |

---

## Module 1.3 — User Roles & Permissions

**Page:** Settings → User Role Config  
**API:** `rolePermissionsApi.js`, `usersApi.js`  
**Backend:** `RolePermissionController.java`, `UserController.java`, `RoleController.java`

### 1.3.1 Role Creation

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-1ROLE-01 | Create role: Salesperson. Assign permissions: Sales read+write, Customer read. | Role: Salesperson | Role created; permissions saved | | | | |
| TC-1ROLE-02 | Create role: Storekeeper. Assign: Inventory read+write, Purchase GRN read+write. | Role: Storekeeper | Role created | | | | |
| TC-1ROLE-03 | Create role: Accountant. Assign: Financials full, Sales read, Purchase read. | Role: Accountant | Role created | | | | |
| TC-1ROLE-04 | Create role: HR Manager. Assign: HR full. | Role: HR Manager | Role created | | | | |
| TC-1ROLE-05 | Edit an existing role. Remove one permission. Save. | — | Permission removed; re-login reflects change | | | | |

### 1.3.2 User Creation & Login Testing

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-1USR-01 | Create user, assign role Salesperson. | user: sales1@test.com, pw: Test@1234 | User created; email not exposed in list | | | | |
| TC-1USR-02 | Create user, assign role Storekeeper. | user: store1@test.com | User created | | | | |
| TC-1USR-03 | Create user, assign role Accountant. | user: acct1@test.com | User created | | | | |
| TC-1USR-04 | Login as sales1. Verify sidebar shows only Sales + Customer nav items. | — | Restricted sidebar; no Financials/HR/Purchase | | | | |
| TC-1USR-05 | While logged in as sales1, attempt to navigate directly to `/financials`. | — | 403 or redirect to unauthorized page | | | | |
| TC-1USR-06 | Login as store1. Verify inventory and GRN accessible; Sales Invoice not. | — | Correct access scope | | | | |
| TC-1USR-07 | Login as acct1. Verify Financials accessible; HR not. | — | Correct access scope | | | | |
| TC-1USR-08 | Login as Admin. Deactivate sales1 account. Try logging in as sales1. | — | Login rejected with clear message | | | | |
| TC-1USR-09 | Attempt to delete the last admin user. | — | System prevents deletion ("last admin" guard) | | | | |

---

## Module 1.4 — Notifications

**Page:** Notifications  
**API:** `notificationApi.js`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-1NTF-01 | Perform an action that should trigger a notification (e.g., approve LPO). | — | Notification appears in bell icon for relevant user | | | | |
| TC-1NTF-02 | Click notification. Mark as read. | — | Unread count decrements; item marked read | | | | |
| TC-1NTF-03 | Mark all as read. | — | All cleared; count = 0 | | | | |

---

---

# PHASE 2 — MASTER DATA SETUP

## Module 2.1 — Inventory Masters

**Pages:** Inventory → Departments / Sub-Departments / Brands / Units / Warehouse  
**APIs:** `departmentsApi.js`, `subDepartmentsApi.js`, `brandsApi.js`, `unitsApi.js`, `warehouseApi.js`, `taxApi.js`

### 2.1.1 Departments

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-2DEP-01 | Create Department. | Name: Electronics, Code: ELC | Created; appears in list | | | | |
| TC-2DEP-02 | Create Department. | Name: Groceries, Code: GRC | Created | | | | |
| TC-2DEP-03 | Create Sub-Department under Electronics. | Name: Mobiles, Parent: Electronics | Sub-dept created; parent link correct | | | | |
| TC-2DEP-04 | Duplicate department code. | Code: ELC | Validation error | | | | |
| TC-2DEP-05 | Deactivate a department. Attempt to assign it to a product. | — | Deactivated dept not selectable | | | | |

### 2.1.2 Brands

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-2BRD-01 | Create Brand. | Name: Samsung | Created | | | | |
| TC-2BRD-02 | Create Brand. | Name: Generic | Created | | | | |

### 2.1.3 Units of Measurement

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-2UNT-01 | Create base unit. | Name: Piece, Code: PCS | Created | | | | |
| TC-2UNT-02 | Create unit with hierarchy (e.g., Box = 12 PCS). Use Hierarchy Builder. | Box → 12 × PCS | Hierarchy saved; conversion factor = 12 | | | | |
| TC-2UNT-03 | Delete a unit that is referenced by a product. | — | Deletion blocked with reason | | | | |

### 2.1.4 Warehouses & Bins

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-2WHS-01 | Create Warehouse. | Name: Main Store, Branch: Main Branch | Created | | | | |
| TC-2WHS-02 | Create Warehouse. | Name: Cold Store, Branch: Main Branch | Created | | | | |
| TC-2WHS-03 | Add bin/location inside Main Store (if bin management enabled). | Bin: A-01-01 | Bin created under warehouse | | | | |

### 2.1.5 Tax Groups

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-2TAX-01 | Create tax group. | Name: VAT 5%, Rate: 5% | Created | | | | |
| TC-2TAX-02 | Create tax group. | Name: Zero Rated, Rate: 0% | Created | | | | |

---

---

# PHASE 3 — CUSTOMER MODULE

**Pages:** Customer → Customer, Followups, Messaging  
**API:** `customerApi.js`, `customerledgerApi.js`, `messagingApi.js`  
**Backend:** `CustomerController.java`, `CustomerInquiryController.java`

## Module 3.1 — Customer Creation

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-3CUS-01 | Create individual customer. | Name: Ahmed Al Mansoori, Phone: +971501234567, Credit Limit: 10000 AED | Customer created with auto-generated code | | | | |
| TC-3CUS-02 | Create business customer. | Name: TechPro LLC, VAT: 100987654300003, Credit Limit: 50000 | Created; VAT stored | | | | |
| TC-3CUS-03 | Create customer with duplicate phone number. | Phone: +971501234567 | Warning or validation (duplicate check) | | | | |
| TC-3CUS-04 | Create customer without mandatory fields. | Name: blank | Validation error on required fields | | | | |
| TC-3CUS-05 | Edit customer credit limit. | New limit: 75000 | Change saved; reflected in Sales | | | | |
| TC-3CUS-06 | Deactivate a customer. Try to raise a Sales Invoice for them. | — | Inactive customer cannot be selected in invoice | | | | |

## Module 3.2 — Customer Activities

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-3ACT-01 | Add follow-up note for Ahmed. | Note: "Called, interested in bulk order" | Note saved with timestamp and user | | | | |
| TC-3ACT-02 | View customer history after a Sales Invoice is created (Phase 7). | — | Invoice appears in customer history/activity | | | | |
| TC-3ACT-03 | Send a message via Messaging (if integrated). | — | Message logged or sent | | | | |

---

---

# PHASE 4 — HR & PAYROLL

**Pages:** HR → Employees, Salary Payments, Salary Advances  
**APIs:** `employeeApi.js`, `salaryPaymentApi.js`, `salaryAdvanceApi.js`  
**Backend:** `EmployeeController.java`, `SalaryPaymentController.java`, `SalaryAdvanceController.java`

## Module 4.1 — Employee Onboarding

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-4EMP-01 | Create employee with full details. | Name: Mohammed Khalid, Dept: Sales, Salary: 5000 AED/month, Join Date: 2026-01-01 | Employee record created with unique code | | | | |
| TC-4EMP-02 | Create employee 2. | Name: Fatima Nasser, Dept: Warehouse, Salary: 4000 AED/month | Created | | | | |
| TC-4EMP-03 | Assign system user to employee (link employee → user). | Employee: Mohammed ↔ User: sales1 | Link saved; user profile shows employee data | | | | |
| TC-4EMP-04 | Upload employee document (passport copy). | PDF file | Document saved; downloadable | | | | |
| TC-4EMP-05 | Check employee status transitions (Active → On Leave → Active). | — | Status changes persisted | | | | |

## Module 4.2 — Salary Payment

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-4SAL-01 | Create salary run for month of May 2026. Include all active employees. | Period: May 2026 | Salary records generated; gross = basic + allowances - deductions | | | | |
| TC-4SAL-02 | Approve salary run. | — | Status → Approved; cannot be edited | | | | |
| TC-4SAL-03 | Post salary payment. | Payment date: 2026-05-31 | Payment record created | | | | |
| TC-4SAL-04 | Verify financial impact: Salary Expense Dr, Bank/Cash Cr. | — | Journal entry posted to GL | | | | |
| TC-4SAL-05 | Attempt to post same salary run twice. | — | System rejects duplicate posting | | | | |

## Module 4.3 — Salary Advance

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-4ADV-01 | Create salary advance for Mohammed. | Amount: 1000 AED, Date: 2026-05-15 | Advance record created | | | | |
| TC-4ADV-02 | Approve advance. | — | Status → Approved | | | | |
| TC-4ADV-03 | Verify advance deducted in next salary run. | — | 1000 AED deduction shown in June salary | | | | |
| TC-4ADV-04 | Verify GL posting: Staff Advance Dr, Bank Cr. | — | Journal entry exists | | | | |

---

---

# PHASE 5 — INVENTORY & PRODUCT MANAGEMENT

**Pages:** Inventory → Products, StockTaking, StockTransfer, Barcode  
**APIs:** `productsApi.js`, `stockTakeApi.js`, `stockTransferApi.js`, `barcodeTemplateApi.js`  
**Backend:** `ProductController.java`, `StockTakeController.java`

## Module 5.1 — Product Creation

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-5PRD-01 | Create Product 1 (simple). | Name: Samsung Galaxy A15, Code: SKU-001, Dept: Electronics, Brand: Samsung, Unit: PCS, Cost: 250 AED, Sale Price: 350 AED, Tax: VAT 5% | Product created with auto-generated barcode | | | | |
| TC-5PRD-02 | Create Product 2. | Name: USB-C Cable, Code: SKU-002, Dept: Electronics, Brand: Generic, Unit: PCS, Cost: 5 AED, Sale Price: 12 AED, Tax: Zero Rated | Created | | | | |
| TC-5PRD-03 | Create Product 3 (grocery/expiry). | Name: Mineral Water 500ml, Code: SKU-003, Dept: Groceries, Unit: PCS, Cost: 0.5 AED, Sale Price: 1 AED, Has Expiry: Yes | Created; expiry field active | | | | |
| TC-5PRD-04 | Attempt duplicate product code. | Code: SKU-001 | Validation error | | | | |
| TC-5PRD-05 | Set reorder level for SKU-001. | Reorder qty: 20 | Saved; reorder alert triggers when stock < 20 | | | | |
| TC-5PRD-06 | Assign multiple price levels to SKU-001. | Retail: 350, Wholesale: 320, VIP: 300 | All price levels saved; selectable in invoice | | | | |
| TC-5PRD-07 | Deactivate SKU-002. Try to add to Sales Invoice. | — | Inactive product not selectable | | | | |

## Module 5.2 — Barcode Printing

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-5BAR-01 | Open Barcode Printer. Select SKU-001. Print preview. | Qty: 5 labels | Preview shows correct barcode + product name + price | | | | |
| TC-5BAR-02 | Export/print barcode sheet. | — | PDF generated without error | | | | |

---

---

# PHASE 6 — PURCHASE FLOW

**Pages:** Purchase → Vendor, LPO, GRN, Invoice, Payment  
**APIs:** `vendorsApi.js`, `lpoApi.js`, `grnApi.js`, `purchaseInvoiceApi.js`, `paymentApi.js` (purchase), `directPurchaseApi.js`  
**Backend:** `VendorController.java`, `LpoController.java`, `GrnController.java`, `PurchaseInvoiceController.java`, `PaymentVoucherController.java`

## Module 6.1 — Vendor Setup

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-6VND-01 | Create Vendor. | Name: Global Electronics FZE, VAT: 100111222300003, Credit Days: 30, Currency: AED | Created with vendor code | | | | |
| TC-6VND-02 | Create Vendor 2. | Name: Ali Traders, Credit Days: 0 | Created | | | | |
| TC-6VND-03 | Verify vendor appears in LPO vendor dropdown. | — | Both vendors selectable | | | | |

## Module 6.2 — Local Purchase Order (LPO)

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-6LPO-01 | Create LPO. Add line items. | Vendor: Global Electronics FZE, Items: SKU-001 × 50 @ 250 AED, SKU-002 × 100 @ 5 AED | LPO saved as Draft; LPO number auto-generated | | | | |
| TC-6LPO-02 | Verify LPO total: (50×250) + (100×5) = 13,000 AED. | — | Total = 13,000.00 AED | | | | |
| TC-6LPO-03 | Submit LPO for approval. | — | Status → Pending Approval | | | | |
| TC-6LPO-04 | Approve LPO (login as Admin or approver role). | — | Status → Approved | | | | |
| TC-6LPO-05 | Verify stock has NOT increased yet (pre-GRN). | SKU-001 current stock | Stock = 0 (no receipt yet) | | | | |
| TC-6LPO-06 | Reject an LPO (create separate test LPO). | — | Status → Rejected; cannot be modified | | | | |
| TC-6LPO-07 | Print LPO. Verify company name, vendor, items, totals, signature section. | — | All fields correct on print preview | | | | |
| TC-6LPO-08 | Edit an Approved LPO. | — | System should restrict or require re-approval | | | | |

## Module 6.3 — Goods Receipt Note (GRN)

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-6GRN-01 | Create GRN against LPO-001. Receive full quantities. | SKU-001: 50, SKU-002: 100, Warehouse: Main Store | GRN created; GRN number auto-generated | | | | |
| TC-6GRN-02 | Verify stock increased: SKU-001 = 50, SKU-002 = 100. | — | Stock movement ledger shows receipt of 50 and 100 | | | | |
| TC-6GRN-03 | Verify batch numbers assigned for SKU-003 (expiry product) if applicable. | — | Batch/expiry captured on GRN line | | | | |
| TC-6GRN-04 | Create partial GRN (receive only 30 of 50 SKU-001). | SKU-001: 30 | GRN saved; LPO shows outstanding qty = 20 | | | | |
| TC-6GRN-05 | Try to receive more than LPO quantity. | SKU-001: 60 (LPO qty = 50) | Validation warning or block | | | | |
| TC-6GRN-06 | Print GRN. Verify vendor, items, quantities, warehouse. | — | Print correct | | | | |

## Module 6.4 — Purchase Invoice

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-6INV-01 | Create Purchase Invoice from GRN-001. | Vendor Ref: EXT-INV-001, Date: 2026-06-01 | Invoice created; amounts match GRN | | | | |
| TC-6INV-02 | Verify VAT calculation: (50×250)×5% = 625 AED. | — | Tax line = 625.00 AED; Total = 13,125.00 AED (if only SKU-001 taxable) | | | | |
| TC-6INV-03 | Verify vendor outstanding balance increased by invoice amount. | Vendor: Global Electronics FZE | Outstanding = Invoice total | | | | |
| TC-6INV-04 | Apply trade discount on line item. | 5% discount on SKU-002 | Discount calculated; total adjusted | | | | |
| TC-6INV-05 | Post purchase invoice. Verify GL: Inventory Dr, AP Cr. | — | Journal entry visible in GL | | | | |

## Module 6.5 — Vendor Payment

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-6PAY-01 | Create partial payment against Purchase Invoice. | Amount: 5000 AED, Bank: Main Bank Account | Payment voucher created | | | | |
| TC-6PAY-02 | Verify vendor outstanding reduced: Outstanding = Invoice Total − 5000. | — | Balance updated correctly | | | | |
| TC-6PAY-03 | Create full settlement of remaining balance. | Amount: remaining balance | Outstanding = 0 | | | | |
| TC-6PAY-04 | Verify GL posting: AP Dr, Bank Cr. | — | Journal entry correct | | | | |
| TC-6PAY-05 | Create vendor advance payment (pre-payment before invoice). | Advance: 2000 AED to Ali Traders | Advance recorded; vendor advance balance = 2000 | | | | |
| TC-6PAY-06 | Create purchase invoice for Ali Traders. Apply advance. | Invoice: 3000 AED | Net payable = 1000 AED after advance applied | | | | |

## Module 6.6 — Direct Purchase

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-6DPO-01 | Create Direct Purchase (no LPO). Add SKU-003 (Water). | SKU-003: 200 PCS @ 0.50 AED, Vendor: Ali Traders | Direct purchase saved | | | | |
| TC-6DPO-02 | Approve and post. Verify stock: SKU-003 = 200. | — | Stock ledger shows +200 | | | | |
| TC-6DPO-03 | Verify vendor payable created for Ali Traders. | — | Payable = 100 AED | | | | |

---

---

# PHASE 7 — SALES FLOW

**Pages:** Sales → Quotations, Sales Orders, Delivery Note, Sales Invoice, Payment, Sales Return  
**APIs:** `quotationApi.js`, `salesorderApi.js`, `deliveryNoteApi.js`, `salesInvoiceApi.js`, `salesPaymentApi.js`, `salesReturnApi.js`  
**Backend:** `QuotationController.java`, `SalesOrderController.java`, `DeliveryNoteController.java`, `SalesInvoiceController.java`, `PaymentController.java`, `SalesReturnController.java`

## Module 7.1 — Quotation

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-7QUO-01 | Create Quotation for TechPro LLC. | Items: SKU-001 × 5 @ 350 AED, SKU-002 × 10 @ 12 AED | Quotation saved as Draft; number auto-generated | | | | |
| TC-7QUO-02 | Verify subtotal: (5×350)+(10×12) = 1,870 AED; VAT on SKU-001: 5×350×5%=87.50; Total: 1,957.50 AED. | — | Totals match | | | | |
| TC-7QUO-03 | Apply header-level discount. | 2% on total | Discount applied; total recalculated | | | | |
| TC-7QUO-04 | Convert Quotation to Sales Order. | — | Sales Order created; Quotation status → Converted | | | | |
| TC-7QUO-05 | Attempt to edit a Converted quotation. | — | Edit blocked or requires reversal | | | | |
| TC-7QUO-06 | Print Quotation. Verify all fields. | — | Print correct | | | | |

## Module 7.2 — Sales Order

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-7SO-01 | Verify Sales Order created from Quotation contains correct items/prices. | — | Items match quotation | | | | |
| TC-7SO-02 | Create a new Sales Order directly (no quotation). | Customer: Ahmed Al Mansoori, Items: SKU-003 × 20 @ 1 AED | Order created | | | | |
| TC-7SO-03 | Attempt to order qty > available stock. | SKU-001: 200 (stock=50) | Warning or block on insufficient stock | | | | |
| TC-7SO-04 | Approve Sales Order (if approval workflow). | — | Status → Approved | | | | |

## Module 7.3 — Delivery Note

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-7DN-01 | Create Delivery Note from Sales Order for TechPro. | SKU-001: 5, SKU-002: 10 | DN created; stock deducted | | | | |
| TC-7DN-02 | Verify stock after DN: SKU-001 = 50−5 = 45, SKU-002 = 100−10 = 90. | — | Stock ledger shows deductions | | | | |
| TC-7DN-03 | Attempt to deliver more than ordered/available. | SKU-001: 100 | Validation error | | | | |
| TC-7DN-04 | Print Delivery Note. Verify items, quantities, warehouse. | — | Print correct | | | | |
| TC-7DN-05 | Verify FEFO batch picking for SKU-003 (oldest expiry picked first). | SKU-003: 10 delivered | Batch with earliest expiry deducted first | | | | |

## Module 7.4 — Sales Invoice

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-7INV-01 | Create Sales Invoice from Delivery Note for TechPro. | — | Invoice number auto-generated; amounts match DN | | | | |
| TC-7INV-02 | Verify invoice totals and VAT. | Expected total: 1,957.50 AED (or per actual delivery qty) | Amounts correct | | | | |
| TC-7INV-03 | Verify customer outstanding increased by invoice amount. | Customer: TechPro LLC | Outstanding = Invoice amount | | | | |
| TC-7INV-04 | Apply price level (Wholesale) to invoice. | Price level: Wholesale | SKU-001 priced at 320 AED, not 350 | | | | |
| TC-7INV-05 | Create Direct Sale invoice (Fast Sale — no quotation/order). | Customer: Ahmed, SKU-003 × 10 | Invoice created; stock deducted immediately | | | | |
| TC-7INV-06 | Verify credit limit enforcement: Create invoice exceeding TechPro credit limit. | TechPro limit: 50000 AED, Invoice: 55000 AED | Warning or block on credit limit breach | | | | |
| TC-7INV-07 | Post invoice. Verify GL: AR Dr, Revenue Cr, Tax Payable Cr, COGS Dr, Inventory Cr. | — | All journals present and balanced | | | | |
| TC-7INV-08 | Print Sales Invoice. Verify: company, customer, items, taxes, totals, "Amount in Words", signature. | — | All elements present and correct | | | | |

## Module 7.5 — Customer Payment (Receipt)

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-7PAY-01 | Create receipt for TechPro: partial payment. | Amount: 1000 AED, Method: Cash | Receipt voucher created | | | | |
| TC-7PAY-02 | Verify customer outstanding reduced. | Outstanding = Invoice − 1000 | Balance updated | | | | |
| TC-7PAY-03 | Create customer advance (before invoice). | Customer: Ahmed, Advance: 500 AED | Advance recorded | | | | |
| TC-7PAY-04 | Create Sales Invoice for Ahmed. Apply advance. | Invoice: 200 AED, Advance available: 500 | Net = 0; excess advance remaining = 300 | | | | |
| TC-7PAY-05 | Attempt duplicate payment for same invoice with same receipt number. | — | Duplicate blocked or warned | | | | |
| TC-7PAY-06 | Verify GL: Cash/Bank Dr, AR Cr. | — | Journal entry correct | | | | |
| TC-7PAY-07 | Print Receipt. Verify all fields. | — | Print correct | | | | |

## Module 7.6 — Sales Return

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-7RET-01 | Create Sales Return against TechPro's invoice. | SKU-001: 2 units returned | Return document created | | | | |
| TC-7RET-02 | Verify stock increased: SKU-001 = 45+2 = 47. | — | Stock movement shows +2 return | | | | |
| TC-7RET-03 | Verify customer credit note / outstanding adjustment. | — | Credit note created; AR reduced | | | | |
| TC-7RET-04 | Verify GL reversal: Revenue Dr, AR Cr, Inventory Dr, COGS Cr. | — | Journal entries correct | | | | |
| TC-7RET-05 | Attempt return of more qty than originally invoiced. | Return: 10 (invoice was 5) | Validation error | | | | |

---

---

# PHASE 8 — INVENTORY MOVEMENT VALIDATION

**Pages:** Inventory → Reports, StockTaking, StockTransfer  
**APIs:** `inventoryReportsApi.js`, `stockTakeApi.js`, `stockTransferApi.js`, `stockAvailabilityApi.js`

## Module 8.1 — Stock Ledger Cross-Check

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-8STK-01 | Open Inventory Reports. View Stock Ledger for SKU-001. | — | Every purchase receipt and sales deduction listed with running balance | | | | |
| TC-8STK-02 | Manual reconciliation: GRN qty − Sales qty + Returns = Current Stock. | SKU-001: 50 rcvd − (5 sold − 2 returned) = 47 | Stock report shows 47 | | | | |
| TC-8STK-03 | Verify SKU-002: 100 rcvd − 10 sold = 90. | — | Report shows 90 | | | | |
| TC-8STK-04 | Verify SKU-003: 200 (direct purchase) − 10 (fast sale) − 20 (delivery) = 170. | — | Report shows 170 | | | | |
| TC-8STK-05 | Verify negative stock prevention: try to sell 500 SKU-001 (stock=47). | — | System blocks with "Insufficient Stock" | | | | |
| TC-8STK-06 | Check reorder alert for SKU-001 (reorder level=20, stock=47 — no alert; reduce to 15). | — | Alert appears when stock ≤ reorder level | | | | |

## Module 8.2 — Stock Take (Physical Count)

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-8SKT-01 | Create Stock Take session for Main Store. | Session type: Full Count | Session created; status = Open | | | | |
| TC-8SKT-02 | Enter counted quantities (simulate variance). | SKU-001 counted: 45 (system: 47 → variance −2) | Variance shown correctly | | | | |
| TC-8SKT-03 | Approve stock take. Verify stock adjustment posted. | — | SKU-001 stock = 45; adjustment movement written | | | | |
| TC-8SKT-04 | Verify GL: Inventory Adjustment Expense Dr / Cr, Inventory Cr / Dr. | — | Journal posted | | | | |
| TC-8SKT-05 | Attempt to approve a stock take with zero variances. | All counted = system | Should still complete without error | | | | |

## Module 8.3 — Stock Transfer

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-8TRF-01 | Transfer stock from Main Store to Cold Store. | SKU-003: 50 PCS | Transfer document created | | | | |
| TC-8TRF-02 | Verify Main Store SKU-003 decreased by 50; Cold Store increased by 50. | — | Warehouse-level stock balances correct | | | | |
| TC-8TRF-03 | Attempt transfer of more than available in source warehouse. | Qty > available | Validation error | | | | |

---

---

# PHASE 9 — FINANCIAL MODULE

**Pages:** Financials → Ledger, JV, Receipt Voucher, Payment Voucher, Expenses, Bank Reconciliation, Financial Reports  
**APIs:** `financialsApi.js`, `journalVoucherApi.js`, `receiptVoucherApi.js`, `ledgerApi.js`, `financialReportsApi.js`, `expensesApi.js`  
**Backend:** Multiple financial controllers

## Module 9.1 — Chart of Accounts

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-9COA-01 | Open Financial Config / Chart of Accounts. Verify default COA seeded. | — | Standard accounts present (Cash, AR, AP, Revenue, etc.) | | | | |
| TC-9COA-02 | Create a new expense account. | Code: 6100, Name: Marketing Expense, Type: Expense | Account created; appears in account dropdowns | | | | |
| TC-9COA-03 | Attempt to create account with duplicate code. | Code: 6100 | Validation error | | | | |
| TC-9COA-04 | Deactivate an account. Attempt to post a voucher to it. | — | Inactive account not selectable | | | | |

## Module 9.2 — Journal Vouchers

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-9JV-01 | Create balanced Journal Voucher. | Dr: Marketing Expense 500 / Cr: Cash 500 | JV saved as Draft | | | | |
| TC-9JV-02 | Submit JV < AED 10,000 threshold. | Amount: 500 AED | Status → Posted (no second approver needed) | | | | |
| TC-9JV-03 | Create JV ≥ AED 10,000. Submit. | Amount: 15,000 AED | Status → Pending Second Approval | | | | |
| TC-9JV-04 | Second approver approves the JV. | Login as Admin | Status → Posted | | | | |
| TC-9JV-05 | Attempt to post unbalanced JV (Dr ≠ Cr). | Dr: 1000 / Cr: 900 | Validation error: must balance | | | | |
| TC-9JV-06 | Attempt to post to a closed accounting period. | Period: Closed | Rejection with reason | | | | |
| TC-9JV-07 | Edit a Posted JV. | — | Edit blocked; must reverse and repost | | | | |

## Module 9.3 — Receipt & Payment Vouchers

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-9RCV-01 | Create standalone Receipt Voucher (not from Sales). | Received from: Walk-in, Amount: 300 AED, Account: Cash | Voucher created; GL posted | | | | |
| TC-9PYV-01 | Create standalone Payment Voucher. | Paid to: Miscellaneous, Amount: 150 AED | Voucher created; GL posted | | | | |
| TC-9PYV-02 | Verify: Cannot pay more than available bank/cash balance (if enforced). | — | Warning or block | | | | |

## Module 9.4 — Expenses

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-9EXP-01 | Create expense entry. | Category: Office Supplies, Amount: 200 AED, Date: 2026-06-05 | Expense saved | | | | |
| TC-9EXP-02 | Approve and post expense. | — | GL: Expense Dr, Cash/AP Cr | | | | |
| TC-9EXP-03 | Verify expense appears in P&L report under correct account. | — | Expense reflected in P&L | | | | |

## Module 9.5 — Financial Integration Checks

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-9INT-01 | Open General Ledger. Filter by AR account. Verify TechPro invoice Dr and receipt Cr entries. | — | All AR transactions present | | | | |
| TC-9INT-02 | Open GL for AP account. Verify vendor invoice Cr and payment Dr entries. | — | All AP transactions present | | | | |
| TC-9INT-03 | Verify Trial Balance: Total Debits = Total Credits. | — | No imbalance | | | | |
| TC-9INT-04 | Open P&L. Verify Revenue accounts have sales invoice postings. | — | Revenue shows invoice amounts | | | | |
| TC-9INT-05 | Open Balance Sheet. Verify AR, AP, Inventory, Cash accounts correct. | — | Balance sheet balances (Assets = Liabilities + Equity) | | | | |

## Module 9.6 — Bank Reconciliation

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-9BNK-01 | Open Bank Reconciliation. Select bank account. Import or enter bank statement transactions. | — | Statement lines loaded | | | | |
| TC-9BNK-02 | Match system transactions with bank statement lines. | — | Matched items cleared; unmatched shown | | | | |
| TC-9BNK-03 | Verify reconciled balance matches bank statement closing balance. | — | Reconciliation complete | | | | |

---

---

# PHASE 10 — REPORTS & ANALYTICS

## Module 10.1 — Sales Reports

**Page:** Sales → Reports  
**API:** `salesReportsApi.js`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-10SRP-01 | Open Sales Reports. Select date range covering all test transactions. | Date: 2026-06-01 to 2026-06-30 | Report loads without error | | | | |
| TC-10SRP-02 | Verify total sales matches sum of all Sales Invoices created. | — | Report total = sum of TC-7INV invoices | | | | |
| TC-10SRP-03 | Filter by customer (TechPro). | — | Only TechPro transactions shown | | | | |
| TC-10SRP-04 | Filter by salesperson. | — | Only their sales shown | | | | |
| TC-10SRP-05 | Filter by product (SKU-001). | — | Only SKU-001 sales shown | | | | |
| TC-10SRP-06 | Export to Excel. Verify columns match screen data. | — | Excel file downloads; data matches | | | | |
| TC-10SRP-07 | Export to PDF. Verify formatting. | — | PDF correct | | | | |

## Module 10.2 — Purchase Reports

**Page:** Purchase → Reports  
**API:** `purchaseReportsApi.js`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-10PRP-01 | Open Purchase Reports. Verify LPO/GRN/Invoice totals. | — | Totals match transactions | | | | |
| TC-10PRP-02 | Filter by vendor. | Vendor: Global Electronics FZE | Only their data shown | | | | |
| TC-10PRP-03 | Verify outstanding payables match vendor ledger. | — | Report total = vendor ledger balance | | | | |

## Module 10.3 — Inventory Reports

**Page:** Inventory → Reports  
**API:** `inventoryReportsApi.js`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-10INP-01 | Stock Valuation Report. Verify each product's qty × cost = value. | — | Values match stock × WAC | | | | |
| TC-10INP-02 | Stock Movement Report for SKU-001. All in/out transactions listed. | — | Complete movement history | | | | |
| TC-10INP-03 | Aging Report (if available). Check slow-moving stock. | — | Report loads without error | | | | |
| TC-10INP-04 | Reorder Report: SKU-001 below reorder level. | — | SKU-001 appears in reorder list | | | | |

## Module 10.4 — Financial Reports

**Page:** Financials → Financial Reports  
**API:** `financialReportsApi.js`

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-10FIN-01 | General Ledger — all accounts, full date range. Verify every voucher appears. | — | No missing entries | | | | |
| TC-10FIN-02 | Trial Balance. Verify Dr = Cr. | — | Balanced | | | | |
| TC-10FIN-03 | Profit & Loss. Verify Revenue − COGS − Expenses = Net Profit. | — | Arithmetic correct | | | | |
| TC-10FIN-04 | Balance Sheet. Verify Assets = Liabilities + Equity. | — | Balanced | | | | |
| TC-10FIN-05 | Customer Statement for TechPro. Verify opening balance + invoices − payments = closing. | — | Statement reconciles | | | | |
| TC-10FIN-06 | Vendor Statement for Global Electronics. | — | Statement reconciles | | | | |
| TC-10FIN-07 | Tax Compliance Report. Verify VAT collected and VAT paid. | — | VAT payable = VAT on sales − VAT on purchases | | | | |

## Module 10.5 — HR Reports

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-10HRP-01 | Employee list report. Verify all active employees shown. | — | All employees present | | | | |
| TC-10HRP-02 | Payroll summary for May 2026. | — | Total salary = sum of all employee salaries | | | | |

## Module 10.6 — Dashboards

**Pages:** Dashboard (all variants)

| ID | Test Steps | Test Data | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------|-----------------|---------------|-----|---------|-----|
| TC-10DSH-01 | Open main Dashboard. Verify KPI cards: Total Sales, Outstanding AR, Stock Value. | — | KPIs load and reflect actual transaction data | | | | |
| TC-10DSH-02 | Open Inventory Overview dashboard. | — | Stock values correct | | | | |
| TC-10DSH-03 | Open Vendors & Purchases dashboard. | — | Vendor payables shown | | | | |
| TC-10DSH-04 | Open Customer Sales dashboard. | — | Customer AR/sales shown | | | | |
| TC-10DSH-05 | Apply date filter to dashboard. Verify data updates. | — | Filtered correctly | | | | |

---

---

# PHASE 11 — PRINTING, EXPORT & DOCUMENT TESTING

## Module 11.1 — Document Print Verification

For each document type below, verify all listed elements:

**Checklist Items (mark ✓/✗ for each document):**

| Element | Quotation | Sales Order | Delivery Note | Sales Invoice | LPO | GRN | Purchase Invoice | Receipt | Payment | JV |
|---------|-----------|-------------|---------------|---------------|-----|-----|------------------|---------|---------|-----|
| Company Name | | | | | | | | | | |
| Company Address | | | | | | | | | | |
| Company Logo | | | | | | | | | | |
| VAT/Tax Number | | | | | | | | | | |
| Branch Details | | | | | | | | | | |
| Document Number | | | | | | | | | | |
| Document Date | | | | | | | | | | |
| Customer/Vendor | | | | | | | | | | |
| Item Table (Code, Desc, Qty, Rate, Amount) | | | | | | | | | | |
| Discount Column | | | | | | | | | | |
| Tax Breakdown | | | | | | | | | | |
| Subtotal / Total | | | | | | | | | | |
| Amount in Words | | | | | | | | | | |
| Footer / Terms | | | | | | | | | | |
| Signature Section | | | | | | | | | | |
| Stamp Area | | | | | | | | | | |
| Page Number (multi-page) | | | | | | | | | | |

## Module 11.2 — Export Testing

| ID | Test Steps | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------------|---------------|-----|---------|-----|
| TC-11EXP-01 | Export Sales Report to Excel. Open file. | Columns/data match screen | | | | |
| TC-11EXP-02 | Export Sales Report to PDF. | Formatted correctly; no cut-off text | | | | |
| TC-11EXP-03 | Export Inventory Stock Report to Excel. | Data accurate | | | | |
| TC-11EXP-04 | Export Financial GL to PDF. | Ledger entries present | | | | |
| TC-11EXP-05 | Export Purchase Report to Excel. | Data accurate | | | | |
| TC-11EXP-06 | Print multi-page Sales Invoice (>1 page). | Page numbers correct; header/footer on every page | | | | |

## Module 11.3 — Template Designer Validation

| ID | Test Steps | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------------|---------------|-----|---------|-----|
| TC-11TPL-01 | Open Sales Invoice Template Designer. Drag a field. Save. Print invoice. | Custom layout reflected in print | | | | |
| TC-11TPL-02 | Open LPO Template Designer. Modify footer text. Save. Print LPO. | Footer change reflected | | | | |
| TC-11TPL-03 | Open GRN Template Designer. Verify fields available match GRN data. | All GRN fields accessible | | | | |

---

---

# PHASE 12 — NEGATIVE & EDGE CASE TESTING

## Module 12.1 — Data Validation

| ID | Test Steps | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------------|---------------|-----|---------|-----|
| TC-12VAL-01 | Submit Sales Invoice with zero quantity item. | Validation error: qty must be > 0 | | | | |
| TC-12VAL-02 | Submit Sales Invoice with zero unit price. | Warning or block | | | | |
| TC-12VAL-03 | Set invoice date in the future (next year). | Warning on future date | | | | |
| TC-12VAL-04 | Set invoice date in a closed period. | Rejection with period closed message | | | | |
| TC-12VAL-05 | Enter negative quantity in GRN. | Validation error | | | | |
| TC-12VAL-06 | Create LPO with no line items. | Validation error | | | | |
| TC-12VAL-07 | Create JV with empty narration (if mandatory). | Validation error if mandatory | | | | |
| TC-12VAL-08 | Enter text in numeric price field. | Input rejected; numeric only | | | | |

## Module 12.2 — Referential Integrity

| ID | Test Steps | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------------|---------------|-----|---------|-----|
| TC-12REF-01 | Delete a product (SKU-001) that has sales transactions. | Deletion blocked; reason given | | | | |
| TC-12REF-02 | Delete a vendor that has a Purchase Invoice. | Deletion blocked | | | | |
| TC-12REF-03 | Delete a customer that has Sales Invoices. | Deletion blocked | | | | |
| TC-12REF-04 | Delete a warehouse that has stock. | Deletion blocked | | | | |
| TC-12REF-05 | Attempt to deactivate an account used in a posted JV. | Warning shown | | | | |

## Module 12.3 — Approval & Status Manipulation

| ID | Test Steps | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------------|---------------|-----|---------|-----|
| TC-12APR-01 | Edit an Approved Sales Order. | Edit restricted or re-approval required | | | | |
| TC-12APR-02 | Edit a Posted Sales Invoice. | Edit blocked entirely | | | | |
| TC-12APR-03 | Try to approve an LPO as Salesperson (no approval permission). | 403 / unauthorized | | | | |
| TC-12APR-04 | Call POST /api/sales/invoices directly with a browser tool or postman while logged in as sales1 (no invoice creation perm). | API returns 403 | | | | |
| TC-12APR-05 | Attempt to post a JV to a future fiscal year that hasn't been opened. | Rejection with fiscal year message | | | | |

## Module 12.4 — Cross-Branch Scenarios

| ID | Test Steps | Expected Result | Actual Result | P/F | Issue # | Sev |
|----|-----------|-----------------|---------------|-----|---------|-----|
| TC-12BRN-01 | Create LPO in Branch 1. Switch to Branch 2. Verify LPO not visible. | Branch isolation maintained | | | | |
| TC-12BRN-02 | Try to create GRN for Branch 1 LPO while in Branch 2 context. | Not allowed or restricted | | | | |
| TC-12BRN-03 | Reports filtered by branch show only that branch's transactions. | Branch filter working | | | | |

---

---

# PHASE 13 — FINAL RECONCILIATION

## Module 13.1 — Inventory Reconciliation

| Check | Formula | Expected Value | Actual Value | Match? |
|-------|---------|----------------|--------------|--------|
| SKU-001 Stock | 50 (GRN) − 5 (DN) + 2 (Return) − 2 (Stock Take Adj) | **45** | | |
| SKU-002 Stock | 100 (GRN) − 10 (DN) | **90** | | |
| SKU-003 Stock | 200 (Direct Purchase) − 10 (Fast Sale) − 20 (SO Delivery) − 50 (Transfer to Cold Store) | **120 in Main + 50 in Cold** | | |

**Verify:** Stock reports total = sum of all warehouse balances.

## Module 13.2 — Sales Reconciliation

| Check | Source 1 | Source 2 | Match? | Issue # |
|-------|---------|---------|--------|---------|
| Total Sales Revenue | Sales Report (sum of invoices) | GL Revenue Account balance | | |
| Total AR | Customer Ledger (sum of outstanding) | GL AR Account balance | | |
| Total Receipts | Sales Payment list | GL Cash/Bank Dr from customer receipts | | |
| Sales Returns | Sales Return list total | GL Revenue reversal + AR Cr entries | | |

## Module 13.3 — Purchase Reconciliation

| Check | Source 1 | Source 2 | Match? | Issue # |
|-------|---------|---------|--------|---------|
| Total Purchases | Purchase Invoice list | GL AP Credit entries | | |
| Total AP Outstanding | Vendor Ledger (outstanding) | GL AP Account balance | | |
| Total Payments | Vendor Payment list | GL Cash/Bank Cr to vendors | | |
| Purchase Returns (if any) | Purchase Return list | GL AP Dr + Inventory Cr | | |

## Module 13.4 — Financial Trial Balance Reconciliation

| Check | Expected | Actual | Pass? |
|-------|---------|--------|-------|
| Trial Balance: Total Debits = Total Credits | Equal | | |
| P&L: Revenue − COGS − Expenses = Net Profit | Calculated value | | |
| Balance Sheet: Total Assets = Liabilities + Equity | Equal | | |
| VAT Payable: Sales VAT − Purchase VAT | Calculated value | | |
| Cash Book closing balance = Bank Rec closing balance | Equal | | |

---

---

# ISSUE LOG

| Issue # | TC ID | Module | Description | Severity | Steps to Reproduce | Root Cause | Status | Screenshot |
|---------|-------|--------|-------------|----------|-------------------|------------|--------|------------|
| #001 | | | | | | | Open | |
| #002 | | | | | | | Open | |
| #003 | | | | | | | Open | |

*(Add rows as issues are found)*

---

# TESTING SUMMARY

| Phase | Total TCs | Passed | Failed | Blocked | Pass % |
|-------|-----------|--------|--------|---------|--------|
| Phase 1 — Configuration | | | | | |
| Phase 2 — Master Data | | | | | |
| Phase 3 — Customer | | | | | |
| Phase 4 — HR/Payroll | | | | | |
| Phase 5 — Inventory | | | | | |
| Phase 6 — Purchase | | | | | |
| Phase 7 — Sales | | | | | |
| Phase 8 — Stock Validation | | | | | |
| Phase 9 — Financials | | | | | |
| Phase 10 — Reports | | | | | |
| Phase 11 — Print/Export | | | | | |
| Phase 12 — Edge Cases | | | | | |
| Phase 13 — Reconciliation | | | | | |
| **TOTAL** | | | | | |

---

## Critical Issues Summary (C & H severity)

| Issue # | Module | Description | Assigned To | Target Fix Date |
|---------|--------|-------------|-------------|-----------------|
| | | | | |

---

*Testing completed by: ___________________*  
*Date: ___________________*  
*Reviewed by: ___________________*
