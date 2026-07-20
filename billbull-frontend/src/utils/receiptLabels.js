// Bilingual (EN/AR) label dictionary for the thermal receipt / tax invoice
// template. Single source shared by BOTH renderers — the canvas/ESC-POS one
// (bilingualReceiptCanvas.js) and the HTML preview twin (posPrintUtils.js) —
// so wording can never drift between what the cashier previews and what the
// printer cuts. Keys are stable identifiers; each entry is { en, ar }.
//
// Arabic strings are the standard UAE retail-receipt phrasings that match the
// approved 80mm bilingual template (billbull-tax-invoice-80mm-bilingual).
export const RECEIPT_LABELS = {
  TAX_INVOICE:       { en: 'TAX INVOICE',            ar: 'فاتورة ضريبية' },
  CREDIT_NOTE:       { en: 'CREDIT NOTE',            ar: 'إشعار دائن' },
  REPRINT:           { en: '*** COPY / REPRINT ***', ar: 'نسخة / إعادة طباعة' },
  TRN:               { en: 'TRN',                    ar: 'الرقم الضريبي' },
  TEL:               { en: 'Tel',                    ar: 'هاتف' },

  INVOICE_NO:        { en: 'Invoice No',             ar: 'رقم الفاتورة' },
  DATE:              { en: 'Date',                   ar: 'التاريخ' },
  TIME:              { en: 'Time',                   ar: 'الوقت' },
  BRANCH:            { en: 'Branch',                 ar: 'الفرع' },
  TERMINAL:          { en: 'Terminal ID',            ar: 'رقم الجهاز' },
  CASHIER:           { en: 'Cashier',                ar: 'الكاشير' },
  COUNTER:           { en: 'Counter',                ar: 'الكاونتر' },
  SALE_TYPE:         { en: 'Sale Type',              ar: 'نوع البيع' },

  CUSTOMER_DETAILS:  { en: 'CUSTOMER DETAILS',       ar: 'بيانات العميل' },
  NAME:              { en: 'Name',                   ar: 'الاسم' },
  MOBILE:            { en: 'Mobile',                 ar: 'الجوال' },
  EMAIL:             { en: 'Email',                  ar: 'البريد الإلكتروني' },
  CUSTOMER_CODE:     { en: 'Customer Code',          ar: 'رمز العميل' },
  CUSTOMER_TRN:      { en: 'Customer TRN',           ar: 'الرقم الضريبي للعميل' },
  WALK_IN:           { en: 'Walk-in Customer',       ar: 'عميل نقدي' },

  ACCOUNT_BALANCE:   { en: 'ACCOUNT BALANCE',        ar: 'رصيد الحساب' },
  PREVIOUS_BALANCE:  { en: 'Previous Balance',       ar: 'الرصيد السابق' },
  INVOICE_CREDIT:    { en: 'Invoice Credit',         ar: 'رصيد الفاتورة' },
  AMOUNT_PAID:       { en: 'Amount Paid',            ar: 'المبلغ المدفوع' },
  NEW_BALANCE:       { en: 'Updated Balance',        ar: 'الرصيد المستحق الجديد' },

  DELIVERY_ADDRESS:  { en: 'DELIVERY ADDRESS',       ar: 'عنوان التوصيل' },

  ITEM_DETAILS:      { en: 'ITEM DETAILS',           ar: 'تفاصيل الأصناف' },
  ITEM:              { en: 'ITEM',                   ar: 'الصنف' },
  QTY:               { en: 'QTY',                    ar: 'الكمية' },
  RATE:              { en: 'RATE',                   ar: 'السعر' },
  AMT:               { en: 'AMT',                    ar: 'المبلغ' },
  DISCOUNT_LINE:     { en: 'Discount',               ar: 'خصم' },
  VOID_TAG:          { en: 'VOID',                   ar: 'ملغى' },
  VOIDED_ITEMS:      { en: 'Voided Items',           ar: 'الأصناف الملغاة' },
  TOTAL_ITEMS:       { en: 'Total Items',            ar: 'عدد الأصناف' },
  TOTAL_QTY:         { en: 'Total Qty',              ar: 'إجمالي الكمية' },

  SUBTOTAL:          { en: 'Subtotal',               ar: 'المجموع الفرعي' },
  DISCOUNT:          { en: 'Discount',               ar: 'الخصم' },
  TAXABLE:           { en: 'Taxable Amount',         ar: 'المبلغ الخاضع للضريبة' },
  VAT:               { en: 'VAT',                    ar: 'ضريبة القيمة المضافة' },
  VAT_INCL:          { en: 'VAT (incl.)',            ar: 'الضريبة (شاملة)' },
  SERVICE_CHARGE:    { en: 'Service Charge',         ar: 'رسوم الخدمة' },
  DELIVERY_CHARGE:   { en: 'Delivery Charge',        ar: 'رسوم التوصيل' },
  SHIPPING:          { en: 'Shipping',               ar: 'الشحن' },
  ROUND_OFF:         { en: 'Round Off',              ar: 'التقريب' },

  TOTAL_TO_PAY:      { en: 'TOTAL TO PAY',           ar: 'المبلغ الإجمالي المستحق' },
  DEPOSIT_PAID:      { en: 'Deposit Paid',           ar: 'العربون المدفوع' },
  BALANCE_DUE:       { en: 'Balance Due',            ar: 'الرصيد المستحق' },

  PAYMENT_MODE:      { en: 'Payment Mode',           ar: 'طريقة الدفع' },
  CASH_RECEIVED:     { en: 'Cash Received',          ar: 'المبلغ النقدي المستلم' },
  CASH_PAID:         { en: 'Cash Paid',              ar: 'المبلغ النقدي المدفوع' },
  CARD_PAID:         { en: 'Card Paid',              ar: 'المبلغ المدفوع بالبطاقة' },
  CHANGE:            { en: 'Change Returned',        ar: 'المبلغ المرتجع' },

  LOYALTY:           { en: 'LOYALTY PROGRAM',        ar: 'برنامج الولاء' },
  POINTS_EARNED:     { en: 'Points Earned',          ar: 'النقاط المكتسبة' },
  POINTS_USED:       { en: 'Points Redeemed',        ar: 'النقاط المستبدلة' },
  POINTS_BALANCE:    { en: 'Points Balance',         ar: 'رصيد النقاط' },

  VAT_SUMMARY:       { en: 'VAT SUMMARY',            ar: 'ملخص الضريبة' },
  VAT_STANDARD:      { en: 'Standard (5%)',          ar: 'القياسية (5٪)' },
  VAT_ZERO:          { en: 'Zero-rated (0%)',        ar: 'معدل صفر (0٪)' },
  TOTAL_VAT:         { en: 'Total VAT',              ar: 'إجمالي الضريبة' },

  THANK_YOU:         { en: 'Thank you for shopping with us!', ar: 'شكراً لتسوقكم معنا!' },
  SCAN_VERIFY:       { en: 'Scan to verify',         ar: 'امسح للتحقق من الفاتورة' },
};

// Font stacks — no CDN dependency: Windows tills always have Segoe UI / Tahoma
// (full Arabic shaping); Noto Kufi Arabic is used when the OS/browser has it.
export const RECEIPT_FONT_EN = "'Roboto Mono', Consolas, 'Courier New', monospace";
export const RECEIPT_FONT_AR = "'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif";
