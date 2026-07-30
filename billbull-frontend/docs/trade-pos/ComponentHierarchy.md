# Trade POS Component Hierarchy

```text
POSSales.jsx (Business Layer / State Owner)
 └─ TradePOSTouchScreen.jsx (Coordinator / Memoizer)
     │
     ├─ <header> TradeHeader.jsx
     │
     ├─ <main> (Flex Layout)
     │   │
     │   ├─ <section> TradeMainCanvas.jsx
     │   │   ├─ TradeSearchBar.jsx
     │   │   ├─ TradeCategoryFilter.jsx
     │   │   └─ TradeProductGrid.jsx -> TradeProductCard.jsx
     │   │
     │   ├─ <section> TradeCartPanel.jsx
     │   │   ├─ TradeCartList.jsx -> TradeInvoiceRow.jsx
     │   │   └─ TradeSummary.jsx
     │   │
     │   └─ <aside> TradeActionPanel.jsx
     │
     └─ <nav> (Mobile Bottom Navigation)
```

## Directory Structure
- `layout/`: Top level architectural containers (Header, MainCanvas)
- `catalog/`: Search, Grid, and Product Cards
- `cart/`: Invoice list, rows, and summary calculations display
- `actions/`: The Numpad and modifier keys
- `ui/`: Reusable, generic Tailwind primitive wrappers (`TradeCard`, `TradeBadge`, `TradeEmptyState`)
