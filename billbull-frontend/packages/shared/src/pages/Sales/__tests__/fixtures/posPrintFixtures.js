/**
 * Deterministic fixtures for the posPrintUtils characterization suite.
 *
 * Every field name below is one posPrintUtils.js actually reads. Verified against the
 * implementation — nothing invented.
 *
 * DATE POLICY: `createdAt` / `invoiceDate` / `paymentDate` are deliberately OMITTED from
 * the default fixtures. posPrintUtils formats them with toLocaleString('en-GB') /
 * toLocaleDateString('en-GB'), which resolves against the machine's timezone, so any
 * assertion on the rendered value would characterize the test host rather than
 * production. Fixtures that need a date carry the `_DATED` suffix and are only used by
 * tests that normalise the value away.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * resolveInvoiceGrossTotals — the two invoice shapes it branches on
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * SHAPE 1 — "explicit discountTotal" (checkout preview mock invoice, Sales Return).
 * Here invoice.subTotal IS the gross pre-discount amount.
 */
export const INVOICE_EXPLICIT_DISCOUNT_EXCLUSIVE = {
  invoiceNumber: 'SI-POS-000123',
  customerName: 'Fatima Hassan',
  subTotal: 450,            // gross, pre-discount
  discountTotal: 90,        // 80 line + 10 bill
  billDiscountAmount: 10,
  taxTotal: 18,
  taxInclusive: false,
  invoiceTotal: 378,
  paymentMode: 'Cash',
  items: [],
};

export const INVOICE_EXPLICIT_DISCOUNT_INCLUSIVE = {
  ...INVOICE_EXPLICIT_DISCOUNT_EXCLUSIVE,
  subTotal: 472.5,          // VAT-laden gross
  discountTotal: 94.5,
  billDiscountAmount: 0,
  taxTotal: 18,
  taxInclusive: true,
  invoiceTotal: 378,
};

/**
 * SHAPE 2 — persisted SalesInvoice (no discountTotal aggregate exists on the entity).
 * invoice.subTotal is already the TAXABLE base net of per-item discounts, so the gross
 * subtotal has to be rebuilt from each line's own grossAmount.
 */
export const INVOICE_PERSISTED_EXCLUSIVE = {
  invoiceNumber: 'SI-POS-000124',
  customerName: 'Fatima Hassan',
  customerCode: 'CUST-001',
  subTotal: 360,            // TAXABLE base, not gross
  taxTotal: 18,
  billDiscountAmount: 10,
  taxInclusive: false,
  invoiceTotal: 368,
  paymentMode: 'Cash',
  items: [
    {
      itemCode: 'SKU-400', itemName: 'Discounted Widget', quantity: 2,
      unitPrice: 200, grossAmount: 400, netAmount: 320,
      discountPercent: 20, taxPercent: 5, taxAmount: 16,
    },
    {
      itemCode: 'SKU-401', itemName: 'Plain Widget', quantity: 1,
      unitPrice: 50, grossAmount: 50, netAmount: 50,
      discountPercent: 0, taxPercent: 5, taxAmount: 2.5,
    },
  ],
};

/** Same invoice with a voided line — excluded from the gross subtotal, kept on the receipt. */
export const INVOICE_PERSISTED_WITH_VOID = {
  ...INVOICE_PERSISTED_EXCLUSIVE,
  invoiceNumber: 'SI-POS-000125',
  items: [
    ...INVOICE_PERSISTED_EXCLUSIVE.items,
    {
      itemCode: 'SKU-403', itemName: 'Voided Widget', quantity: 1,
      unitPrice: 99, grossAmount: 99, netAmount: 99,
      discountPercent: 0, taxPercent: 5, taxAmount: 4.95,
      voided: true, batchNumber: 'BATCH-B',
    },
  ],
};

export const INVOICE_PERSISTED_INCLUSIVE = {
  ...INVOICE_PERSISTED_EXCLUSIVE,
  invoiceNumber: 'SI-POS-000126',
  subTotal: 360,            // ex-VAT taxable
  taxTotal: 18,
  billDiscountAmount: 0,
  taxInclusive: true,
  items: [
    {
      itemCode: 'SKU-400', itemName: 'Discounted Widget', quantity: 2,
      unitPrice: 236.25, grossAmount: 472.5, netAmount: 378,
      discountPercent: 20, taxPercent: 5, taxAmount: 18,
    },
  ],
};

/** Zero-rated / no-tax sale — drives the hasTax=false branch. */
export const INVOICE_ZERO_TAX = {
  invoiceNumber: 'SI-POS-000127',
  customerName: 'Walk-in Customer',
  customerCode: 'WALK-IN',
  subTotal: 100,
  taxTotal: 0,
  taxInclusive: false,
  invoiceTotal: 100,
  paymentMode: 'Cash',
  items: [
    {
      itemCode: 'SKU-500', itemName: 'Zero Rated Item', quantity: 2,
      unitPrice: 50, grossAmount: 100, netAmount: 100,
      discountPercent: 0, taxPercent: 0, taxAmount: 0,
    },
  ],
};

/** Minimal invoice — every optional field absent. */
export const INVOICE_MINIMAL = {
  invoiceTotal: 10,
  items: [],
};

/** Long free text, to exercise truncation and wrapping at both paper widths. */
export const INVOICE_LONG_TEXT = {
  invoiceNumber: 'SI-POS-000128',
  customerName: 'Al Madina General Trading and Contracting Establishment LLC',
  customerCode: 'CUST-LONG-0001',
  customerAddress: 'Office 1204, Al Reem Tower, Sheikh Zayed Road,\nAl Barsha First, Dubai, United Arab Emirates',
  subTotal: 300,
  taxTotal: 15,
  taxInclusive: false,
  invoiceTotal: 315,
  items: [
    {
      itemCode: 'SKU-LONG-0001',
      itemName: 'Premium Organic Extra Virgin Cold Pressed Olive Oil 500ml Glass Bottle',
      quantity: 1, unitPrice: 300, grossAmount: 300, netAmount: 300,
      discountPercent: 0, taxPercent: 5, taxAmount: 15,
      serialNumber: 'SN-XYZ-99887766',
    },
  ],
};

/** Carries a date, for the tests that normalise it away. */
export const INVOICE_DATED = {
  ...INVOICE_ZERO_TAX,
  invoiceNumber: 'SI-POS-000129',
  createdAt: '2026-09-07T10:30:00Z',
};

/* ────────────────────────────────────────────────────────────────────────────
 * Store / branding options passed to every thermal builder
 * ──────────────────────────────────────────────────────────────────────────── */

export const STORE = {
  companyName: 'BillBull Retail',
  trn: '100123456700003',
  header: 'Main Branch — Dubai',
  footer: 'Thank you for shopping with us',
  showTrn: true,
};

export const STORE_LONG = {
  companyName: 'Al Madina General Trading and Contracting Establishment LLC',
  trn: '100123456700003',
  header: 'Sheikh Zayed Road Branch, Dubai, United Arab Emirates',
  footer: 'Goods once sold are not returnable\nPlease retain this receipt',
  showTrn: true,
};

/* ────────────────────────────────────────────────────────────────────────────
 * Layaway
 * ──────────────────────────────────────────────────────────────────────────── */

export const LAYAWAY = {
  layawayNumber: 'LAY-000042',
  customerName: 'Fatima Hassan',
  customerPhone: '+971 50 123 4567',
  saleTotal: 1500,
  depositAmount: 500,
  depositPaymentMode: 'Cash',
  balanceAmount: 1000,
  remarks: 'Collect before Eid',
  items: [
    { itemName: 'Samsung Galaxy A55', quantity: 1, price: 1380, lineTotal: 1380 },
    { itemName: 'Protective Case', quantity: 2, price: 60, lineTotal: 120 },
  ],
};

export const LAYAWAY_LONG_ITEM = {
  ...LAYAWAY,
  items: [
    {
      itemName: 'Premium Organic Extra Virgin Cold Pressed Olive Oil 500ml Glass Bottle',
      quantity: 3, price: 45, lineTotal: 135,
    },
  ],
};

/* ────────────────────────────────────────────────────────────────────────────
 * Receipt voucher (customer payment)
 * ──────────────────────────────────────────────────────────────────────────── */

export const PAYMENT_VOUCHER = {
  paymentNumber: 'RV-000077',
  customerName: 'Acme Trading LLC',
  customerCode: 'CUST-002',
  paymentMode: 'Bank Transfer',
  bankName: 'ADCB Current',
  referenceNumber: 'TRF-99871',
  amount: 2500,
};

export const PAYMENT_VOUCHER_SETTLED = {
  ...PAYMENT_VOUCHER,
  settledInvoices: [
    { invoiceNumber: 'SI-000101', amount: 1500 },
    { invoiceNumber: 'SI-000102', amount: 1000 },
  ],
};

export const PAYMENT_VOUCHER_APPLIED = {
  ...PAYMENT_VOUCHER,
  appliedInvoice: 'SI-000103',
};

export const VOUCHER_STORE = {
  companyName: 'BillBull Retail',
  trn: '100123456700003',
  address: 'Office 1204,\nSheikh Zayed Road, Dubai',
  phone: '+971 4 123 4567',
  footer: 'Computer generated receipt',
  showTrn: true,
};

/* ────────────────────────────────────────────────────────────────────────────
 * Statement of account
 * ──────────────────────────────────────────────────────────────────────────── */

export const STATEMENT = {
  accountName: 'Acme Trading LLC',
  accountCode: 'CUST-002',
  openingBalance: 1000,
  closingBalance: 1750,
  totalDebit: 2500,
  totalCredit: 1750,
  entries: [
    // Filtered out by the builder — the opening balance has its own row.
    { type: 'OPENING_BALANCE', transactionDate: '2026-09-01', debit: 1000, credit: 0, runningBalance: 1000 },
    {
      type: 'SALES_INVOICE', transactionDate: '2026-09-02',
      description: 'Sale', documentNo: 'SI-000101',
      debit: 1500, credit: 0, runningBalance: 2500,
    },
    {
      type: 'RECEIPT_VOUCHER', transactionDate: '2026-09-05',
      description: 'Payment received RV-000077', documentNo: 'RV-000077',
      debit: 0, credit: 750, runningBalance: 1750,
    },
  ],
};

export const STATEMENT_EMPTY = {
  accountName: 'Acme Trading LLC',
  accountCode: 'CUST-002',
  openingBalance: 0,
  closingBalance: 0,
  totalDebit: 0,
  totalCredit: 0,
  entries: [],
};

/* ────────────────────────────────────────────────────────────────────────────
 * Live cart (pre-payment checkout preview)
 * ──────────────────────────────────────────────────────────────────────────── */

export const CART_DRAFT = {
  invoiceNumber: 'SI-POS-DRAFT',
  invoiceDate: '2026-09-07T10:30:00Z',
  customer: { id: 'CUST-001', code: 'CUST-001', name: 'Fatima Hassan', phone: '+971 50 123 4567', trn: '100999888700003' },
  terminalId: 'TERM-01',
  counterName: 'Counter 1',
  paymentMode: 'Cash',
  subTotal: 360,            // ex-VAT taxable BEFORE the discountTotal subtraction
  taxTotal: 18,
  taxInclusive: false,
  invoiceTotal: 378,
  discountTotal: 0,
  branchName: 'Main Branch',
  items: [
    {
      code: 'SKU-400', name: 'Discounted Widget', quantity: 2,
      price: 200, netAmount: 320, discount: 20, taxRate: 5, taxAmount: 16,
      pinnedBatchNumber: 'BATCH-A',
    },
    {
      code: 'SKU-401', name: 'Plain Widget', quantity: 1,
      price: 50, netAmount: 50, discount: 0, taxRate: 5, taxAmount: 2.5,
    },
  ],
};

/** Customer master rows, for buildPosPrintData's customersList lookup. */
export const CUSTOMERS_LIST = [
  {
    id: 'CUST-001', code: 'CUST-001', name: 'Fatima Hassan',
    address: '12 Jumeirah Beach Road, Dubai', phone: '+971 50 123 4567',
    email: 'fatima@example.ae', trn: '100999888700003',
  },
];
