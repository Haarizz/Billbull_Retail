import React from "react";
import { code128Svg } from "../../../../utils/bilingualReceiptCanvas";

/**
 * BillBull Retail OS — 80mm Thermal Tax Invoice Receipt (EN / AR)  [TEMPLATE 2]
 * ----------------------------------------------------------------------------
 * Monochrome, Roboto Mono (Latin) + Noto Kufi Arabic (Arabic) receipt component,
 * sized for 80mm thermal printers. This is Template 2 in the POS print-template
 * registry — the current production receipt remains Template 1 and is untouched.
 *
 * Usage:
 *   <BillBullTaxInvoiceReceipt data={mappedInvoiceData} />
 *
 * The `data` prop must follow the ReceiptData shape produced by
 * `mapToTemplate2Data()` in ./billBullTaxInvoiceData.js. When omitted it falls
 * back to SAMPLE_DATA purely so the component renders standalone in isolation.
 *
 * Fonts: loads Roboto Mono + Noto Kufi Arabic from Google Fonts at runtime for
 * the on-screen preview. The print path (buildTemplate2Html) inlines the same
 * <link> so the printed output matches.
 */

// ---------------------------------------------------------------------------
// Sample data (used ONLY when no `data` prop is supplied — never for POS)
// ---------------------------------------------------------------------------

export const SAMPLE_DATA = {
  business: {
    nameEn: "BILLBULL SUPERMART",
    nameAr: "بيل بُل سوبرمارت",
    tagline: "POWERED BY BILLBULL RETAIL OS",
    addressEnLines: [
      "Shop 12, Al Rams Building, Hamad Bin Abdulla St",
      "Fujairah, United Arab Emirates",
    ],
    addressArLines: [
      "محل 12، مبنى الرمس، شارع حمد بن عبدالله",
      "الفجيرة، الإمارات العربية المتحدة",
    ],
    phone: "+971 9 222 4477",
    trn: "100123456700003",
  },
  meta: {
    invoiceNo: "INV-2026-041882",
    date: "04-Jul-2026",
    time: "14:27:39",
    branch: "Fujairah - Main",
    terminalId: "POS-03",
    cashierName: "Arun K.",
    shiftNo: "SH-0091",
    saleType: "Retail",
  },
  customer: {
    name: "Mohammed Al Suwaidi",
    mobile: "+971 50 123 4567",
    customerCode: "CUST-00847",
    customerTrn: "—",
  },
  balance: {
    previousBalance: 340.0,
    thisInvoice: 189.5,
    creditLimit: 2000.0,
    newBalanceDue: 529.5,
  },
  delivery: {
    lineEn: ["Villa 22, Street 7, Al Faseel", "Fujairah, UAE"],
    lineAr: ["فيلا 22، شارع 7، الفصيل", "الفجيرة، الإمارات"],
    contactNote: "Contact on arrival: +971 50 123 4567",
  },
  items: [
    { nameEn: "Basmati Rice 5kg", nameAr: "أرز بسمتي 5 كجم", sku: "SKU 10023", vatLabel: "VAT 5%", qty: 1, rate: 42.0, amount: 42.0 },
    { nameEn: "Fresh Milk 1L", nameAr: "حليب طازج 1 لتر", sku: "SKU 10981", vatLabel: "VAT 0%", qty: 2, rate: 6.5, amount: 13.0 },
    { nameEn: "Olive Oil 1L", nameAr: "زيت زيتون 1 لتر", sku: "SKU 11532", vatLabel: "VAT 5% · Disc 10%", qty: 1, rate: 38.0, amount: 34.2 },
  ],
  totals: {
    subtotal: 89.2,
    discount: 3.8,
    vat5: 4.41,
    vat0: 0.0,
    deliveryCharge: 0.0,
    roundOff: 0.0,
    totalToPay: 89.81,
  },
  payment: {
    mode: "CARD",
    paidAmount: 100.0,
    changeReturned: 10.19,
    cardRef: "**** 4471",
  },
  loyalty: {
    tier: "GOLD",
    pointsEarned: 18,
    pointsRedeemed: 0,
    pointsBalance: 1246,
    nextRewardAt: 1500,
  },
  vatSummary: {
    standardRateAmount: 4.41,
    zeroRateAmount: 0.0,
    totalVat: 4.41,
  },
  currency: "AED",
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const fmt = (n) => Number(n || 0).toFixed(2);

const KV = ({ en, ar, value, className }) => (
  <div className={`kv2${className ? ` ${className}` : ""}`}>
    <div className="lbl">
      <span className="en">{en}</span>
      {ar && <span className="ar">{ar}</span>}
    </div>
    <div className="val">{value}</div>
  </div>
);

const SectionTitle = ({ en, ar }) => (
  <div className="section-title">
    <span>{en}</span>
    <span className="ar">{ar}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Style block — extracted so both the React preview and the print HTML reuse it
// ---------------------------------------------------------------------------

export const TEMPLATE2_CSS = `
  .bb-receipt, .bb-receipt-wrapper {
    --paper-width: 80mm;
    --ink: #000000;
    --paper: #ffffff;
    --gray: #555555;
  }
  .bb-receipt-wrapper {
    background: #e8e8e8;
    padding: 40px 0;
    display: flex;
    justify-content: center;
    font-family: 'Roboto Mono', monospace;
  }
  .bb-receipt {
    width: var(--paper-width);
    background: var(--paper);
    color: var(--ink);
    padding: 4mm 4mm 6mm 4mm;
    font-family: 'Roboto Mono', monospace;
    font-size: 10.5px;
    line-height: 1.42;
    box-shadow: 0 0 0 1px #ccc, 0 6px 18px rgba(0,0,0,.25);
  }
  .bb-receipt .ar {
    font-family: 'Noto Kufi Arabic', 'Segoe UI', Tahoma, sans-serif;
    direction: rtl;
    unicode-bidi: isolate;
  }
  .bb-receipt .center { text-align: center; }
  .bb-receipt .bold { font-weight: 700; }
  .bb-receipt .upper { text-transform: uppercase; }
  .bb-receipt .muted { color: var(--gray); }
  .bb-receipt .small { font-size: 9px; }
  .bb-receipt .big { font-size: 15px; }
  .bb-receipt .dashed { border-top: 2px dashed var(--ink); margin: 3mm 0; }
  .bb-receipt .dotted-row { border-bottom: 2px dotted var(--ink); margin: 2mm 0 3mm 0; }
  .bb-receipt .logo-mark {
    width: 34px; height: 34px;
    margin: 0 auto 2mm auto;
    border: 2px solid var(--ink);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 14px;
    overflow: hidden;
  }
  .bb-receipt .logo-mark img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .bb-receipt .brand-name { font-size: 17px; font-weight: 700; letter-spacing: 1px; }
  .bb-receipt .brand-name-ar { font-size: 15px; font-weight: 700; margin-top: 0.5mm; }
  .bb-receipt .brand-tagline { font-size: 9px; letter-spacing: 2px; margin-top: 1.5mm; }
  .bb-receipt .addr-block { margin-top: 2mm; font-size: 9.5px; }
  .bb-receipt .addr-block-ar { margin-top: 1mm; font-size: 9.5px; }
  .bb-receipt .kv2 {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
    padding: 0.7mm 0;
  }
  .bb-receipt .kv2 .lbl .en { color: var(--gray); font-size: 10px; }
  .bb-receipt .kv2 .lbl .ar { color: var(--gray); font-size: 10px; display: block; margin-top: 0.2mm; }
  .bb-receipt .kv2 .val { text-align: right; font-weight: 600; white-space: nowrap; padding-top: 0.3mm; }
  .bb-receipt .kv2.bold .lbl .en,
  .bb-receipt .kv2.bold .lbl .ar,
  .bb-receipt .kv2.bold .val { font-weight: 700; }
  .bb-receipt .kv2.small .lbl .en,
  .bb-receipt .kv2.small .lbl .ar,
  .bb-receipt .kv2.small .val { font-size: 9px; }
  .bb-receipt .section-title {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 1px;
    margin-bottom: 2mm;
    border-bottom: 1px solid var(--ink);
    padding-bottom: 1mm;
  }
  .bb-receipt .section-title .ar { font-size: 11px; font-weight: 700; }
  .bb-receipt table.items { width: 100%; border-collapse: collapse; font-size: 10px; }
  .bb-receipt table.items thead th {
    border-bottom: 1.5px solid var(--ink);
    padding-bottom: 1.5mm;
    font-weight: 700; text-align: left; font-size: 9px; letter-spacing: .3px;
  }
  .bb-receipt table.items thead th .ar { display: block; font-size: 9px; font-weight: 700; }
  .bb-receipt table.items th.num, .bb-receipt table.items td.num { text-align: right; }
  .bb-receipt .item-row td { padding-top: 2mm; vertical-align: top; }
  .bb-receipt .item-name { font-weight: 600; }
  .bb-receipt .item-name-ar { font-weight: 600; font-size: 10px; margin-top: 0.3mm; }
  .bb-receipt .item-meta { font-size: 8.8px; color: var(--gray); }
  .bb-receipt .total-to-pay {
    border-top: 2px solid var(--ink);
    border-bottom: 2px solid var(--ink);
    margin-top: 2.5mm;
    padding: 3mm 0;
    text-align: center;
  }
  .bb-receipt .total-to-pay .label-en { font-size: 13px; font-weight: 700; letter-spacing: 1.5px; }
  .bb-receipt .total-to-pay .label-ar { font-size: 14px; font-weight: 700; margin-top: 0.5mm; }
  .bb-receipt .total-to-pay .amount { font-size: 27px; font-weight: 700; letter-spacing: 1px; margin-top: 2mm; }
  .bb-receipt .pay-mode {
    display: inline-block;
    border: 1px solid var(--ink);
    padding: 0.5mm 2mm;
    border-radius: 3px;
    font-size: 9px; font-weight: 700; letter-spacing: .5px;
  }
  .bb-receipt .box { border: 1px dashed var(--ink); padding: 2mm; border-radius: 2px; }
  .bb-receipt .barcode {
    height: 34px; margin: 2mm auto 1mm auto; width: 90%;
    background: repeating-linear-gradient(
      90deg, var(--ink) 0px, var(--ink) 1.5px, transparent 1.5px, transparent 3px,
      var(--ink) 3px, var(--ink) 3.5px, transparent 3.5px, transparent 5px,
      var(--ink) 5px, var(--ink) 6.5px, transparent 6.5px, transparent 7.5px);
  }
  .bb-receipt .qr-img { width: 72px; height: 72px; margin: 0 auto; display: block; object-fit: contain; }
  .bb-receipt .qr {
    width: 64px; height: 64px; margin: 0 auto;
    background:
      repeating-conic-gradient(var(--ink) 0% 25%, transparent 0% 50%) 0 0/8px 8px,
      var(--paper);
    border: 3px solid var(--ink);
  }
  .bb-receipt .footer-msg { font-size: 10.5px; }
  .bb-receipt .footer-msg-ar { font-size: 11px; margin-top: 1mm; }
  .bb-receipt .footer-fine { font-size: 8.5px; color: var(--gray); }
  .bb-receipt .footer-fine-ar { font-size: 9px; color: var(--gray); margin-top: 0.8mm; }
  .bb-receipt .tear {
    height: 8px; margin-top: 2mm;
    background:
      linear-gradient(135deg, var(--paper) 50%, transparent 50%) 0 0/8px 8px,
      linear-gradient(225deg, var(--paper) 50%, transparent 50%) 0 0/8px 8px;
    background-color: #e8e8e8;
  }
  @media print {
    .bb-receipt-wrapper { background: none; padding: 0; }
    .bb-receipt { box-shadow: none; width: 80mm; }
    @page { size: 80mm auto; margin: 0; }
  }
`;

export const TEMPLATE2_FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap";

// ---------------------------------------------------------------------------
// Inner receipt body — shared between the on-screen preview and print HTML.
// Rendered without the outer gray wrapper so it can be embedded either way.
// ---------------------------------------------------------------------------

export const TaxInvoiceReceiptBody = ({ data = SAMPLE_DATA, paperSize = "80mm" }) => {
  const { business, meta, customer, balance, delivery, items, totals, payment, loyalty, vatSummary, currency } = data;

  const showCustomer = customer && (customer.name || customer.mobile || customer.customerCode);
  const showBalance = balance && (balance.previousBalance != null || balance.newBalanceDue != null);
  const showDelivery = delivery && ((delivery.lineEn && delivery.lineEn.length) || (delivery.lineAr && delivery.lineAr.length));
  const showLoyalty = loyalty && (loyalty.tier || loyalty.pointsEarned || loyalty.pointsBalance);

  const totalItems = items.length;
  const totalQty = items.reduce((sum, i) => sum + Number(i.qty || 0), 0);

  // On-screen preview width: 58mm vs 80mm. The print builder overrides
  // --paper-width to 100% (the page is physically sized by @page), so this only
  // affects the designer Live Preview / Full Preview, letting the merchant see
  // the true 58mm proportions before printing.
  const paperVar = String(paperSize).includes("58") ? "58mm" : "80mm";

  return (
    <div className="bb-receipt" style={{ "--paper-width": paperVar }}>
      {/* ================= HEADER / BRAND ================= */}
      <div className="center">
        <div className="logo-mark">
          {business.logoDataUrl ? <img src={business.logoDataUrl} alt="logo" /> : "BB"}
        </div>
        <div className="brand-name">{business.nameEn}</div>
        {business.nameAr && <div className="brand-name-ar ar">{business.nameAr}</div>}
        {business.tagline && <div className="brand-tagline">{business.tagline}</div>}
        <div className="addr-block">
          {(business.addressEnLines || []).map((line, i) => (
            <React.Fragment key={i}>
              {line}
              <br />
            </React.Fragment>
          ))}
          Tel: {business.phone} &nbsp;|&nbsp; TRN: {business.trn}
        </div>
        {(business.addressArLines || []).length > 0 && (
          <div className="addr-block-ar ar">
            {business.addressArLines.map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
            الرقم الضريبي: {business.trn}
          </div>
        )}
      </div>

      <div className="dashed" />

      {/* ================= INVOICE TITLE ================= */}
      <div className="center">
        <div className="big bold upper">Tax Invoice</div>
        <div className="big bold ar">فاتورة ضريبية</div>
      </div>

      <div className="dashed" />

      {/* ================= INVOICE META ================= */}
      <KV en="Invoice No" ar="رقم الفاتورة" value={meta.invoiceNo} />
      <KV en="Date" ar="التاريخ" value={meta.date} />
      {meta.time && <KV en="Time" ar="الوقت" value={meta.time} />}
      {meta.branch && <KV en="Branch" ar="الفرع" value={meta.branch} />}
      {meta.terminalId && <KV en="Terminal ID" ar="رقم الجهاز" value={meta.terminalId} />}
      {meta.cashierName && <KV en="Cashier" ar="الكاشير" value={meta.cashierName} />}
      {meta.shiftNo && <KV en="Shift No" ar="رقم الوردية" value={meta.shiftNo} />}
      {meta.saleType && <KV en="Sale Type" ar="نوع البيع" value={meta.saleType} />}

      <div className="dashed" />

      {/* ================= CUSTOMER INFO ================= */}
      {showCustomer && (
        <>
          <SectionTitle en="CUSTOMER DETAILS" ar="بيانات العميل" />
          <KV en="Name" ar="الاسم" value={customer.name || "—"} />
          {customer.mobile && <KV en="Mobile" ar="الجوال" value={customer.mobile} />}
          {customer.customerCode && <KV en="Customer Code" ar="رمز العميل" value={customer.customerCode} />}
          <KV en="Customer TRN" ar="الرقم الضريبي للعميل" value={customer.customerTrn || "—"} />
          <div className="dashed" />
        </>
      )}

      {/* ================= CUSTOMER BALANCE ================= */}
      {/* 4-field credit-account model: Previous / This Invoice / Amount Paid /
          New Balance Due. `thisInvoice` accepts `invoiceCredit` (the field name
          the real-data mapper emits) and `amountPaid` accepts either name so
          both the designer sample and live checkout render identically. */}
      {showBalance && (
        <>
          <SectionTitle en="ACCOUNT BALANCE" ar="رصيد الحساب" />
          <KV en="Previous Balance" ar="الرصيد السابق" value={`${currency} ${fmt(balance.previousBalance)}`} />
          <KV en="This Invoice" ar="هذه الفاتورة" value={`${currency} ${fmt(balance.thisInvoice ?? balance.invoiceCredit)}`} />
          {(balance.amountPaid != null || balance.creditLimit != null) &&
            (balance.creditLimit != null ? (
              <KV en="Credit Limit" ar="حد الائتمان" value={`${currency} ${fmt(balance.creditLimit)}`} />
            ) : (
              <KV en="Amount Paid" ar="المبلغ المدفوع" value={`${currency} ${fmt(balance.amountPaid)}`} />
            ))}
          <KV className="bold" en="New Balance Due" ar="الرصيد المستحق الجديد" value={`${currency} ${fmt(balance.newBalanceDue)}`} />
          <div className="dashed" />
        </>
      )}

      {/* ================= DELIVERY ADDRESS ================= */}
      {showDelivery && (
        <>
          <SectionTitle en="DELIVERY ADDRESS" ar="عنوان التوصيل" />
          <div>
            {(delivery.lineEn || []).map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
            {delivery.contactNote && <span className="muted">{delivery.contactNote}</span>}
          </div>
          {(delivery.lineAr || []).length > 0 && (
            <div className="ar" style={{ marginTop: "1.5mm" }}>
              {delivery.lineAr.map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </div>
          )}
          <div className="dashed" />
        </>
      )}

      {/* ================= ITEMS ================= */}
      <SectionTitle en="ITEM DETAILS" ar="تفاصيل الأصناف" />
      <table className="items">
        <thead>
          <tr>
            <th>
              ITEM
              <span className="ar">الصنف</span>
            </th>
            <th className="num">
              QTY
              <span className="ar">الكمية</span>
            </th>
            <th className="num">
              RATE
              <span className="ar">السعر</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr className="item-row" key={i}>
              <td>
                <div className="item-name">{item.nameEn}</div>
                {item.nameAr && <div className="item-name-ar ar">{item.nameAr}</div>}
                {(item.sku || item.vatLabel) && (
                  <div className="item-meta">
                    {[item.sku, item.vatLabel].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td className="num">{item.qty}</td>
              <td className="num">{fmt(item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dotted-row" />

      <div className="kv2 small muted">
        <div className="lbl">
          <span className="en">Total Items: {totalItems}</span>
        </div>
        <div className="val">Total Qty: {totalQty}</div>
      </div>

      <div className="dashed" />

      {/* ================= TOTALS ================= */}
      <div className="totals">
        <KV en="Subtotal" ar="المجموع الفرعي" value={`${currency} ${fmt(totals.subtotal)}`} />
        {!!totals.discount && <KV en="Discount" ar="الخصم" value={`- ${currency} ${fmt(totals.discount)}`} />}
        <KV en="VAT @ 5%" ar="ضريبة القيمة المضافة 5٪" value={`${currency} ${fmt(totals.vat5)}`} />
        {!!totals.vat0 && <KV en="VAT @ 0%" ar="ضريبة القيمة المضافة 0٪" value={`${currency} ${fmt(totals.vat0)}`} />}
        {!!totals.deliveryCharge && <KV en="Delivery Charge" ar="رسوم التوصيل" value={`${currency} ${fmt(totals.deliveryCharge)}`} />}
        {!!totals.roundOff && <KV en="Round Off" ar="التقريب" value={`${currency} ${fmt(totals.roundOff)}`} />}
      </div>

      {/* ================= TOTAL TO PAY ================= */}
      <div className="total-to-pay">
        <div className="label-en">TOTAL TO PAY</div>
        <div className="label-ar ar">المبلغ الإجمالي المستحق</div>
        <div className="amount">
          {currency} {fmt(totals.totalToPay)}
        </div>
      </div>

      {/* ================= PAYMENT ================= */}
      {payment && (
        <div style={{ marginTop: "2.5mm" }}>
          <div className="kv2">
            <div className="lbl">
              <span className="en">Payment Mode</span>
              <span className="ar">طريقة الدفع</span>
            </div>
            <div className="val">
              <span className="pay-mode">{payment.mode}</span>
            </div>
          </div>
          <KV en="Paid Amount" ar="المبلغ المدفوع" value={`${currency} ${fmt(payment.paidAmount)}`} />
          {!!payment.changeReturned && (
            <KV className="bold" en="Change Returned" ar="المبلغ المرتجع" value={`${currency} ${fmt(payment.changeReturned)}`} />
          )}
          {payment.cardRef && (
            <div className="kv2 small muted">
              <div className="lbl">
                <span className="en">Card Ref</span>
              </div>
              <div className="val">{payment.cardRef}</div>
            </div>
          )}
        </div>
      )}

      <div className="dashed" />

      {/* ================= LOYALTY ================= */}
      {showLoyalty && (
        <>
          <SectionTitle en="LOYALTY PROGRAM" ar="برنامج الولاء" />
          <div className="box">
            <KV className="bold" en="Member Tier" ar="مستوى العضوية" value={loyalty.tier} />
            <KV en="Points Earned" ar="النقاط المكتسبة" value={`+${loyalty.pointsEarned} pts`} />
            <KV en="Points Redeemed" ar="النقاط المستبدلة" value={`${loyalty.pointsRedeemed} pts`} />
            <KV en="Points Balance" ar="رصيد النقاط" value={`${Number(loyalty.pointsBalance || 0).toLocaleString()} pts`} />
            {!!loyalty.nextRewardAt && (
              <div className="kv2 small muted">
                <div className="lbl">
                  <span className="en">Next reward at</span>
                </div>
                <div className="val">{Number(loyalty.nextRewardAt).toLocaleString()} pts</div>
              </div>
            )}
          </div>
          <div className="dashed" />
        </>
      )}

      {/* ================= VAT SUMMARY ================= */}
      <SectionTitle en="VAT SUMMARY" ar="ملخص الضريبة" />
      <KV className="small" en="Standard (5%)" ar="القياسية (5٪)" value={fmt(vatSummary.standardRateAmount)} />
      <KV className="small" en="Zero-rated (0%)" ar="معدل صفر (0٪)" value={fmt(vatSummary.zeroRateAmount)} />
      <KV className="small bold" en="Total VAT" ar="إجمالي الضريبة" value={fmt(vatSummary.totalVat)} />

      <div className="dashed" />

      {/* ================= FOOTER ================= */}
      <div className="center">
        <div className="footer-msg">{business.footerMsgEn || "Thank you for shopping with us!"}</div>
        <div className="footer-msg-ar ar">{business.footerMsgAr || "شكراً لتسوقكم معنا!"}</div>
        {business.footerFine && (
          <div className="footer-fine" style={{ marginTop: "1.5mm" }}>
            {business.footerFine}
          </div>
        )}
      </div>

      {/* Real, scannable Code 128B symbol of the invoice number (Fix 9) — same
          symbol the ESC/POS raster prints, so on-screen preview == thermal print.
          Falls back to nothing rather than the old decorative CSS placeholder. */}
      {meta.invoiceNo && (
        <div
          className="barcode-svg"
          style={{ margin: "2mm auto 1mm" }}
          dangerouslySetInnerHTML={{ __html: code128Svg(meta.invoiceNo, { height: 44 }) }}
        />
      )}
      <div className="center small">{meta.invoiceNo}</div>

      {/* Stamp (uploaded) replaces the QR — same rule as Template 1. Otherwise a
          real ZATCA QR image. The checkerboard `.qr` placeholder is used only for
          the standalone designer sample (SAMPLE_DATA has neither). */}
      {business.stampDataUrl ? (
        <img src={business.stampDataUrl} alt="stamp" className="qr-img" style={{ marginTop: "3mm", width: "84px", height: "84px" }} />
      ) : business.qrDataUrl ? (
        <>
          <img src={business.qrDataUrl} alt="qr" className="qr-img" style={{ marginTop: "3mm" }} />
          <div className="center footer-fine" style={{ marginTop: "1mm" }}>
            Scan to verify e-invoice / view digital receipt
          </div>
          <div className="center footer-fine-ar ar">امسح للتحقق من الفاتورة الإلكترونية</div>
        </>
      ) : business.qrPlaceholder || data === SAMPLE_DATA ? (
        <>
          <div style={{ marginTop: "3mm" }} className="qr" />
          <div className="center footer-fine" style={{ marginTop: "1mm" }}>
            Scan to verify e-invoice / view digital receipt
          </div>
          <div className="center footer-fine-ar ar">امسح للتحقق من الفاتورة الإلكترونية</div>
        </>
      ) : null}

      <div className="dashed" />

      <div className="center footer-fine">
        BillBull Retail OS · geebu.io
        <br />
        {meta.cashierName ? `Served by ${meta.cashierName}` : "Have a great day!"}
      </div>

      <div className="tear" />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Full component with gray page wrapper + fonts — used by the Live Preview.
// ---------------------------------------------------------------------------

const BillBullTaxInvoiceReceipt = ({ data = SAMPLE_DATA, paperSize = "80mm" }) => (
  <div className="bb-receipt-wrapper">
    <style>{TEMPLATE2_CSS}</style>
    <link href={TEMPLATE2_FONT_LINK} rel="stylesheet" />
    <TaxInvoiceReceiptBody data={data} paperSize={paperSize} />
  </div>
);

export default BillBullTaxInvoiceReceipt;
