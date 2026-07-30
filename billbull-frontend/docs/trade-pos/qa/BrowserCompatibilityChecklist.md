# Trade POS Browser Compatibility Checklist

QA must verify layout stability and functionality on the following engines. 
*Note: Due to hardware-level scanner interception, Google Chrome is the only officially supported browser for the POS.*

## 1. Google Chrome (v110+) - PRIMARY
- [ ] Verify standard Flex/Grid layout renders properly at 1080p.
- [ ] Verify hardware barcode scanner global listener (`handleUnifiedEntry`) captures raw text buffer without dropping characters.
- [ ] Verify `window.print()` properly invokes the browser's native PDF generation without freezing the main thread.
- [ ] Verify Cart auto-scroll-to-bottom behaviour works.

## 2. Microsoft Edge (Chromium)
- [ ] Verify identical layout rendering.
- [ ] Verify keyboard input on Numpad using physical keyboard.

## 3. Safari (iPad / Tablet)
- [ ] Verify layout collapses into mobile-friendly stacked view.
- [ ] Verify Bottom Navigation tabs toggle correctly between Quick Picks and Invoice.
- [ ] Verify Numpad buttons have sufficient touch target areas (> 44x44px).
- [ ] Verify no zoom-on-input occurs when focusing the Customer Search bar.

## 4. Mozilla Firefox (Best Effort)
- [ ] Verify flexbox height scaling (Firefox historically struggles with `min-h-0` inside nested flex columns). Ensure Cart Panel scrolls instead of overflowing the page.
