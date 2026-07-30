# Trade POS Architecture

The Trade POS module is a modern, responsive React presentation shell that acts as a unified facade over the legacy `POSSales.jsx` monolithic business logic.

## Core Tenets
1. **Presentation Layer Only**: The Trade POS components (`TradePOSTouchScreen`, `TradeMainCanvas`, etc.) contain **ZERO** business logic. They do not calculate taxes, manage state, handle API calls, or dictate business rules.
2. **Backwards Compatibility**: It sits directly alongside the legacy Compact POS template and consumes the exact same `touchScreenProps` from `POSSales.jsx`.
3. **Prop Isolation (Phase 6)**: To ensure optimal performance, `TradePOSTouchScreen.jsx` acts as the Coordinator. It extracts the raw `props` from `POSSales` and groups them into strictly memoized domain props (`catalogProps`, `cartProps`, `actionPanelProps`).

## Event Flow Example: Quantity Update
1. User clicks **Qty** in `TradeActionPanel`.
2. `TradeActionPanel` fires `setClassicNumpadMode('qty')`.
3. State is updated in `POSSales.jsx`.
4. User types "5" on Numpad. `setClassicNumpadValue` updates state in `POSSales`.
5. User clicks **ENTER**.
6. `handleNumpadEnter` (owned by `TradePOSTouchScreen`) fires `updateQuantity(selectedFocusItemId, 5)`.
7. `POSSales.jsx` calculates totals, tax, and rebuilds the `currentInvoice`.
8. React reconciles, `currentInvoice` prop changes, triggering re-render of `TradeCartPanel`.
