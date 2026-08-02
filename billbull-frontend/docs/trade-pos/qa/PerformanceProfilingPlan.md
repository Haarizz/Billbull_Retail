# Trade POS Performance Profiling Plan

This document outlines the strict profiling procedures required to validate the Phase 6 memoization optimizations.

## Tooling Required
- Google Chrome
- React DevTools Extension (Profiler tab)

## Procedure 1: Search Typing Isolation
1. Start Profiler recording.
2. Focus the Product Search input.
3. Type "Test Search" rapidly.
4. Stop Profiler.
**Pass Criteria**: Only `TradeSearchBar`, `TradeProductGrid`, and `TradeMainCanvas` should show render commits. `TradeCartPanel` and `TradeActionPanel` **must not** render.

## Procedure 2: Numpad Isolation
1. Select an item in the cart.
2. Start Profiler recording.
3. Rapidly type digits on the Numpad (e.g. `1 2 3 4`).
4. Stop Profiler.
**Pass Criteria**: Only `TradeActionPanel` should render on every keystroke. `TradeMainCanvas` and `TradeCartPanel` **must not** render.

## Procedure 3: Cart Update
1. Start Profiler recording.
2. Click **ENTER** on the Numpad to submit a quantity change.
3. Stop Profiler.
**Pass Criteria**: `POSSales` will re-render to calculate totals. `TradeCartPanel` will re-render. `TradeHeader` **must not** re-render (since session data didn't change).

## Acceptance Criteria
- Render times for purely presentational keystrokes (Search, Numpad) must remain under `16ms` (to guarantee 60fps responsiveness).
- No unnecessary full-tree reconciliation allowed.
