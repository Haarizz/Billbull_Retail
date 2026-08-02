# Trade POS Functional Regression Matrix

This matrix maps every core Trade POS requirement to the existing business handler in `POSSales.jsx` and provides a manual testing strategy for QA.

## 1. Product Catalog

| Feature | Expected Behaviour | Existing Handler | Verification Method | Manual Result | Status |
|---|---|---|---|---|---|
| Product Search | Typing filters the visible catalog | `setSearchQuery` | Type 'Apple'. Verify grid updates. | Pending QA | Verification Required |
| Barcode Scan | Scanned item instantly added | `handleUnifiedEntry` | Scan valid UPC. Verify 1 qty added. | Pending QA | Verification Required |
| Category Filter | Pills filter grid | `setSelectedCategory` | Click 'Fruits'. Verify grid updates. | Pending QA | Verification Required |
| Product Selection | Click adds 1 unit to cart | `addToInvoice` | Click a product card. | Pending QA | Verification Required |

## 2. Cart

| Feature | Expected Behaviour | Existing Handler | Verification Method | Manual Result | Status |
|---|---|---|---|---|---|
| Remove Product | Item voided or removed | `setSelectedFocusItemId` / `DEL` | Select row, click DEL, click Enter. | Pending QA | Verification Required |
| Update Quantity | Qty updates and line total recalculates | `updateQuantity` | Select row, click QTY, type 5, Enter. | Pending QA | Verification Required |
| Discount | Discount applied per item | `updateDiscount` | Select row, click DISCOUNT, type 10, Enter. | Pending QA | Verification Required |
| Price Override | Base price overridden | `updateItemPrice` | Select row, click PRICE, type 50, Enter. | Pending QA | Verification Required |

## 3. Customer

| Feature | Expected Behaviour | Existing Handler | Verification Method | Manual Result | Status |
|---|---|---|---|---|---|
| Customer Search | Dropdown appears with matches | `setCustomerSearchQuery` | Type name in Customer Search bar. | Pending QA | Verification Required |
| Customer Selection | Card displays customer info | `setSelectedCustomer` | Click a dropdown option. | Pending QA | Verification Required |
| Customer Removal | 'X' button clears customer | `setSelectedCustomer(null)` | Click 'X' on Customer Card. | Pending QA | Verification Required |
| Quick Creation | Opens legacy modal | `openQuickCustomerModal` | Click "Create New Customer" in dropdown. | Pending QA | Verification Required |

## 4. Checkout

| Feature | Expected Behaviour | Existing Handler | Verification Method | Manual Result | Status |
|---|---|---|---|---|---|
| Empty Cart Validation | Pay button disabled | `N/A (UI disabled)` | Ensure cart is empty. Verify Pay button greyed. | Pending QA | Verification Required |
| Hold Invoice | Cart clears, invoice saved | `holdInvoice` | Click Hold button in Action Panel. | Pending QA | Verification Required |
| Settlement | Settlement modal opens | `handleCheckout` | Click Pay. Verify settlement appears. | Pending QA | Verification Required |
| Completion | Invoice finalizes, receipt prints | Legacy Settlement | Finish payment in settlement modal. | Pending QA | Verification Required |
