# Trade POS Multi-Terminal Validation Plan

The Trade POS is a presentation layer. While the session state logic remains untouched, QA must verify that no frontend state bleeding occurs between parallel browsers/tabs.

## Required Setup
- Terminal A (Browser 1, Logged in as Cashier 1)
- Terminal B (Browser 2, Logged in as Cashier 2)

## Scenario 1: Concurrent Carts
1. Terminal A adds Product X.
2. Terminal B adds Product Y.
**Pass Criteria**: Terminal A cart only shows X. Terminal B cart only shows Y.

## Scenario 2: Checkout Collision
1. Terminal A initiates checkout for an invoice.
2. Terminal B initiates checkout simultaneously.
**Pass Criteria**: Both invoices are assigned unique sequential IDs by the backend. No lockups occur.

## Scenario 3: Printer Isolation
1. Terminal A finishes a sale.
2. Terminal B finishes a sale immediately after.
**Pass Criteria**: Terminal A's receipt routes to Terminal A's assigned printer. Terminal B routes correctly. (Requires BillBull Print Agent).

## Scenario 4: Local Storage Bleed
1. Terminal A searches for a specific customer.
**Pass Criteria**: Terminal B's Customer Dropdown remains empty/unaffected.
