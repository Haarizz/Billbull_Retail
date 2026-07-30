# Trade POS Printer Validation Plan

The Trade POS UI uses the same underlying Print mechanisms from `POSSales`. QA must perform the following manual hardware verifications.

## 1. Thermal Receipt Printing
- [ ] Verify standard 80mm paper width scaling.
- [ ] Verify Company Logo renders crisply (not distorted).
- [ ] Verify Invoice Barcode/QR Code prints and scans correctly.
- [ ] Verify Arabic text layout is correct (if applicable for region).
- [ ] Verify item names gracefully wrap to the next line without truncating totals.

## 2. A4 Tax Invoice Printing
- [ ] Verify PDF generation triggers correctly.
- [ ] Verify Company and Customer Tax Identifiers (TRN/VAT) are present.
- [ ] Verify multi-page pagination works for invoices > 40 items.

## 3. Failure Handling
- [ ] **Printer Offline**: Turn printer off, attempt settlement. Verify POS handles failure gracefully without crashing the UI.
- [ ] **Queue Recovery**: Turn printer on. Verify Print Agent recovers and prints the queued receipt.
- [ ] **Manual Retry**: Verify the "Print Previous Receipt" function works from the POS dashboard.
