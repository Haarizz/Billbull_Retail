# Trade POS Known Limitations & Technical Debt

## Intentional Limitations
- **Suspend Workflow**: Disabled. The legacy system relies on `guardedClearInvoice` which effectively destroys the cart rather than suspending it. This button is intentionally greyed out until a real suspend backend API is built.
- **Cash In Workflow**: Disabled. The legacy POS only supports the `Cash Drop` (Cash Out) modal.
- **Customer Warnings**: Hardcoded to intercept `status === 'Blocked'` and `openingBalance > creditLimit`. More robust warnings require business logic changes in `POSSales`.

## Remaining Technical Debt
1. **Prop Drilling in `POSSales`**: `POSSales.jsx` is still over 8,000 lines long and houses all state. Future phases should look at migrating `POSSales` into React Contexts (e.g., `CartContext`, `CustomerContext`).
2. **Missing Tests**: The React components lack Jest/RTL unit tests.
3. **Hardcoded Colors**: The UI Fidelity Pass utilized specific hex codes (e.g., `#F5C742`, `#1E293B`) directly in Tailwind classes rather than standardizing them in `tailwind.config.js`.
