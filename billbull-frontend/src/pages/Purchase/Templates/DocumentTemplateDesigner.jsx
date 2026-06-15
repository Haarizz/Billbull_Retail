import React, { useContext, useState } from "react";
import {
  ArrowLeft,
  Save,
  Printer,
  Info,
  Palette,
  Type,
  Layout,
  Building2,
  User,
  FileText,
  Table,
  CreditCard,
  AlignLeft,
  Eye,
  Check
} from "lucide-react";
import { Badge, Button } from "./PurchaseTemplateUI";
import toast from "react-hot-toast";
import CompanyContext from "../../../context/CompanyContext";
import {
  resolveCurrencyDisplayConfig,
  UAE_DIRHAM_SYMBOL_IMAGE
} from "../../../utils/countryCurrencyOptions";
function docTypeLabel(t) {
  return {
    quotation: "Quotation",
    "sales-order": "Sales Order",
    "sales-invoice": "Sales Invoice",
    "proforma-invoice": "Proforma Invoice",
    "credit-note": "Credit Note",
    grn: "Goods Receipt Note",
    "delivery-note": "Delivery Note",
    lpo: "Local Purchase Order",
    "purchase-invoice": "Purchase Invoice",
    "purchase-return": "Purchase Return",
    "debit-note": "Debit Note"
  }[t];
}
function docTypeCode(t) {
  return {
    quotation: "QUO",
    "sales-order": "SO",
    "sales-invoice": "SI",
    "proforma-invoice": "PI",
    "credit-note": "CN",
    grn: "GRN",
    "delivery-note": "DN",
    lpo: "LPO",
    "purchase-invoice": "PVI",
    "purchase-return": "PRN",
    "debit-note": "DN"
  }[t];
}
const CURRENCY_UNITS = {
  AED: { main: "Dirhams", sub: "Fils" },
  USD: { main: "Dollars", sub: "Cents" },
  EUR: { main: "Euros", sub: "Cents" },
  GBP: { main: "Pounds", sub: "Pence" },
  INR: { main: "Rupees", sub: "Paise" }
};

function amountInWords(n, currencyCode = "AED") {
  const units = CURRENCY_UNITS[String(currencyCode || "").toUpperCase()] || {
    main: String(currencyCode || "Units"),
    sub: "Cents"
  };
  return `${Math.floor(n).toLocaleString("en-AE")} ${units.main} and ${Math.round(n % 1 * 100)} ${units.sub} Only`;
}

function CurrencyPreviewToken({ currencyConfig, currencyDisplay = "symbol" }) {
  if (!currencyConfig) return null;

  if (currencyDisplay === "code") {
    return <span>{currencyConfig.currency || currencyConfig.label}</span>;
  }

  if (currencyConfig.hasImage) {
    return <span
      role="img"
      aria-label={currencyConfig.ariaLabel}
      style={{
        display: "inline-block",
        verticalAlign: "-0.08em",
        margin: "0 0.06em",
        width: "1.05em",
        height: "0.82em",
        backgroundColor: "currentColor",
        WebkitMaskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
        maskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain"
      }}
    />;
  }

  return <span>{currencyConfig.label}</span>;
}
function defaultSettings(docType) {
  const isInv = docType === "sales-invoice" || docType === "proforma-invoice" || docType === "purchase-invoice";
  const isCN = docType === "credit-note" || docType === "debit-note" || docType === "purchase-return";
  const isGRN = docType === "grn";
  const isDN = docType === "delivery-note";
  const isLPO = docType === "lpo";
  return {
    docType,
    templateName: `Default ${docTypeLabel(docType)}`,
    layoutStyle: "classic",
    accentColor: "#F5C742",
    headerBg: "#1a1a2e",
    headerTextColor: "#ffffff",
    tableHeaderBg: "#f8fafc",
    tableHeaderText: "#1a1a2e",
    totalRowBg: "#f8fafc",
    borderColor: "#e2e8f0",
    grandTotalColor: "#1a1a2e",
    fontFamily: "Inter, sans-serif",
    fontSize: 9,
    paperSize: "A4",
    logoUrl: "",
    stampUrl: "",
    showRowLines: true,
    showLogo: true,
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showCompanyWebsite: true,
    showTRN: true,
    showCRN: false,
    showBillTo: true,
    showShipTo: isDN || isGRN,
    showCustomerCode: true,
    showCustomerPhone: true,
    showCustomerEmail: !isGRN && !isDN,
    showCustomerTRN: isInv || isCN,
    showDocNumber: true,
    showDocDate: true,
    showDueDate: isInv || isCN,
    showValidUntil: docType === "quotation",
    showSalesperson: !isGRN,
    showPaymentTerms: isInv || docType === "quotation" || docType === "sales-order",
    showCurrency: true,
    currencyDisplay: "symbol",
    showPOReference: docType !== "quotation",
    showDeliveryTerms: isDN || docType === "sales-order",
    showLocationStore: docType === "quotation" || docType === "sales-order",
    showWarehouseStore: isDN,
    showQuotationRef: isDN,
    showSalesOrderRef: isDN,
    showSalesInvoiceRef: isDN,
    showGrandTotalBanner: !isGRN && !isDN,
    colNo: true,
    colProductImage: !isGRN && !isDN,
    colItemCode: true,
    colDescription: true,
    showShortDescription: true,
    showDetailedDescription: true,
    colUOM: true,
    colQty: true,
    colUnitPrice: !isGRN && !isDN,
    colTaxableAmount: isInv || isCN || docType === "quotation",
    colDiscount: !isGRN && !isDN,
    colVAT: isInv || isCN,
    colVATAmount: isInv || isCN,
    colLineTotal: !isGRN && !isDN,
    colBarcode: false,
    colSKU: false,
    colBatchNumber: false,
    colBrand: false,
    colBinLocation: false,
    showTaxableTotal: isInv || isCN || docType === "quotation",
    showSubtotal: !isGRN && !isDN,
    showDiscountTotal: !isGRN && !isDN,
    showVATTotal: isInv || isCN || docType === "proforma-invoice",
    showGrandTotal: !isGRN && !isDN,
    showAmountInWords: isInv || isCN,
    showBankDetails: isInv || isCN,
    bankName: "Emirates NBD",
    bankAccount: "1012345678",
    bankIBAN: "AE07 0330 0000 0102 1450 801",
    bankSWIFT: "EBILAEAD",
    showTerms: true,
    termsText: isInv ? "1. Payment is due within the terms stated above.\n2. Late payments attract 2% monthly interest.\n3. Goods remain property of seller until full payment received." : docType === "quotation" ? "1. This quotation is valid for 30 days from the date of issue.\n2. Prices are subject to change without prior notice.\n3. Delivery subject to stock availability." : isLPO ? "1. This purchase order is binding upon confirmation by vendor.\n2. Goods must match specifications and be delivered by the stated date.\n3. Any substitutions require prior written approval." : isCN ? "1. This debit/return note is issued per agreed terms.\n2. The corresponding credit will be applied against outstanding balances.\n3. For disputes contact accounts@company.ae." : "Terms & conditions apply.",
    showCompanyStamp: true,
    showQRCode: isInv,
    showNotes: true,
    notesLabel: "Notes",
    showWatermark: false,
    watermarkText: "ORIGINAL",
    showPageNumbers: true
  };
}
const MOCK = {
  company: { name: "GEEBU Enterprise Platforms LLC", address: "Suite No. 103 \xB7 Office No. 33\nAl Mamkhool \xB7 Dubai \xB7 U.A.E", phone: "+971 529 125 865", email: "crteam@geebu.io", website: "www.geebu.io", trn: "100047547540457", crn: "DED-2022-112345" },
  customer: { name: "GEEBU Enterprise Platforms Private Limited", code: "CUS-0042", billAddress: "Advent Complex \xB7 3rd Floor \xB7 Suite No. 307\nPinnacle Business Park\nP.O. Box 670525\nThrissur \xB7 Kerala \xB7 India\nGSTIN: 144AMGO 0990191918\nGSM: 80175 86 43 28\nbiz@geebu.io", shipAddress: "Warehouse 8, Industrial Area 12, Sharjah, UAE", phone: "+971 4 321 9876", email: "biz@geebu.io", trn: "144AMGO0990191918" },
  doc: { number: "QTN-199194-1881", date: "2026-04-26", validUntil: "2026-05-14", dueDate: "2026-05-14", salesperson: "Mr. Nazam", paymentTerms: "Net 30 Days", currency: "AED", poRef: "INC-099919", location: "OXG-01", deliveryTerms: "DAP \u2013 Customer Warehouse", warehouse: "Warehouse 3 \u2014 Main Store, Fujairah", quotationNo: "QUO-2026-000041", salesOrderNo: "SO-2026-001782", salesInvoiceNo: "SI-2026-004291" },
  items: [
    { no: 1, code: "JASEWAY-0001", name: "JASEWAY POS Machine", desc: 'i5-10th (10351GT) / 8 GB RAM / 256\nGB SSD / LCD 10"\nCapacitive touch screen\nBuilt-in Wifi\n+ Cash Drawer\n+ Thermal Receipt Printer', uom: "PCS", qty: 12, price: 1500, disc: 0, vat: 5, barcode: "6291041500213", sku: "JSW-POS-001-BLK", batch: "BTH-2025-0441", brand: "JASEWAY", binLocation: "A-01 / R-03 / B-07" },
    { no: 2, code: "POZONE-001", name: "POZONE PP610 Thermal Printer", desc: 'i5-10th (10351GT) / 8 GB RAM / 256\nGB SSD / LCD 10"\nTouch Panel\nCapacitive touch screen\nBuilt-in Wifi\nColour: Black\n+ Cash Drawer\n+ Thermal Receipt Printer', uom: "PCS", qty: 5, price: 7325, disc: 10, vat: 5, barcode: "6291041500220", sku: "PZN-PP610-WHT", batch: "BTH-2025-0512", brand: "POZONE", binLocation: "B-02 / R-01 / B-12" }
  ]
};
function ClassicPreview({ s, currencyConfig }) {
  const items = MOCK.items;
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price * (1 - i.disc / 100), 0);
  const discTotal = items.reduce((sum, i) => sum + i.qty * i.price * (i.disc / 100), 0);
  const mockFooterDiscount = 500; // sample footer (bill-level) discount for preview
  const vatTotal = items.reduce((sum, i) => sum + i.qty * i.price * (1 - i.disc / 100) * (i.vat / 100), 0);
  const grandTotal = subtotal - mockFooterDiscount + vatTotal;
  const currencyMode = s.currencyDisplay === "code" ? "code" : "symbol";
  const f = s.fontSize;
  const b = s.borderColor;
  const thS = {
    background: s.tableHeaderBg,
    color: s.tableHeaderText,
    padding: "6px 8px",
    fontWeight: 700,
    fontSize: `${f - 0.5}px`,
    textAlign: "center",
    whiteSpace: "nowrap"
  };
  const tdS = (right = false, center = false, bold = false, _last = false) => ({
    padding: "5px 8px",
    fontSize: `${f}px`,
    textAlign: right ? "right" : center ? "center" : "left",
    borderBottom: `1px solid ${b}18`,
    fontWeight: bold ? 600 : 400,
    verticalAlign: "top"
  });
  return <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px", position: "relative", minHeight: 1067, display: "flex", flexDirection: "column" }}>

      {/* ── BODY: grows to fill page ── */}
      <div style={{ flex: 1 }}>

      {
    /* ── HEADER: 3 columns — Bill To | Doc Info | Logo + Company ── */
  }
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16 }}>

        {
    /* COL 1: Title + Bill To + Ship To */
  }
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: `${f + 17}px`, fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px 0", letterSpacing: "-0.5px" }}>
            {docTypeLabel(s.docType)}
          </h1>
          {s.showBillTo && <div style={{ marginBottom: s.showShipTo ? 12 : 0 }}>
              <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, marginBottom: 4, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Bill To</p>
              <p style={{ fontWeight: 700, fontSize: `${f + 1}px`, marginBottom: 2 }}>{MOCK.customer.name}</p>
              {s.showCustomerCode && <p style={{ marginTop: 1, color: "#555" }}>Code: {MOCK.customer.code}</p>}
              <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "#444", margin: 0 }}>{MOCK.customer.billAddress}</p>
              {s.showCustomerPhone && <p style={{ marginTop: 3, color: "#555" }}>{MOCK.customer.phone}</p>}
              {s.showCustomerEmail && <p style={{ margin: 0, color: "#555" }}>{MOCK.customer.email}</p>}
              {s.showCustomerTRN && <p style={{ margin: 0, color: "#666" }}>TRN: {MOCK.customer.trn}</p>}
            </div>}
          {s.showShipTo && <div>
              <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, marginBottom: 4, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Ship To</p>
              <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "#444", margin: 0 }}>{MOCK.customer.shipAddress}</p>
            </div>}
        </div>

        {
    /* COL 2: Doc info — label on top, value below, arranged in a 2-column grid */
  }
        {(() => {
    const metaItems = [
      s.showDocNumber && ["Quote Number", MOCK.doc.number],
      s.showDocDate && ["Date", MOCK.doc.date],
      s.showDueDate && ["Due Date", MOCK.doc.dueDate],
      s.showValidUntil && ["Valid Until", MOCK.doc.validUntil],
      s.showPOReference && ["P.O. Number", MOCK.doc.poRef],
      s.showLocationStore && ["Location / Store", MOCK.doc.location],
      s.showWarehouseStore && ["Warehouse / Store", MOCK.doc.warehouse],
      s.showSalesperson && ["Account Executive", MOCK.doc.salesperson],
      s.showPaymentTerms && ["Payment Terms", MOCK.doc.paymentTerms],
      s.showCurrency && ["Currency", <CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} />],
      s.showDeliveryTerms && ["Delivery Terms", MOCK.doc.deliveryTerms],
      s.showQuotationRef && ["Quotation No.", MOCK.doc.quotationNo],
      s.showSalesOrderRef && ["SO No.", MOCK.doc.salesOrderNo],
      s.showSalesInvoiceRef && ["SI No.", MOCK.doc.salesInvoiceNo]
    ].filter(Boolean);
    if (!metaItems.length) return null;
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", paddingTop: 64, paddingBottom: 2 }}>
              {metaItems.map(([label, val], i) => <div key={i}>
                  <p style={{ margin: 0, fontSize: `${f - 1}px`, color: "#999", fontWeight: 500 }}>{label}</p>
                  <p style={{ margin: "1px 0 0", fontSize: `${f}px`, fontWeight: 700, color: "#1a1a2e" }}>{val}</p>
                </div>)}
            </div>;
  })()}

        {
    /* COL 3: Logo + Company */
  }
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          {s.showLogo && (s.logoUrl ? <img src={s.logoUrl} alt="logo" style={{ height: 72, objectFit: "contain" }} /> : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${s.accentColor}22`, border: `3px solid ${s.accentColor}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: s.accentColor }}>G</span>
                </div>)}
          {(s.showCompanyName || s.showCompanyAddress || s.showCompanyPhone || s.showCompanyEmail || s.showCompanyWebsite || s.showTRN || s.showCRN) && <div style={{ textAlign: "right", lineHeight: 1.55 }}>
              {s.showCompanyName && <p style={{ fontWeight: 700, fontSize: `${f + 3}px`, color: "#1a1a2e", margin: 0 }}>{MOCK.company.name}</p>}
              {s.showCompanyAddress && <p style={{ margin: 0, color: "#555", whiteSpace: "pre-line" }}>{MOCK.company.address}</p>}
              {s.showCompanyPhone && <p style={{ margin: 0 }}>{MOCK.company.phone}</p>}
              {s.showCompanyEmail && <p style={{ margin: 0 }}>{MOCK.company.email}</p>}
              {s.showCompanyWebsite && <p style={{ margin: 0, color: "#666" }}>{MOCK.company.website}</p>}
              {s.showTRN && <p style={{ margin: 0, color: "#666" }}>TRN · {MOCK.company.trn}</p>}
              {s.showCRN && <p style={{ margin: 0, color: "#666" }}>CR · {MOCK.company.crn}</p>}
            </div>}
        </div>
      </div>

      {
    /* ── GRAND TOTAL BANNER ── */
  }
      {s.showGrandTotalBanner && <div style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0 14px" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: `${f}px`, color: "#888", margin: "0 0 2px", fontWeight: 600, letterSpacing: 1 }}>Grand Total</p>
            <p style={{ fontSize: `${f + 22}px`, fontWeight: 800, color: s.grandTotalColor, margin: 0, letterSpacing: "-1px", lineHeight: 1 }}>
              <CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} />{" "}
              {grandTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>}

      {
    /* ── ITEMS TABLE ── */
  }
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: `${f}px` }}>
        <thead>
          <tr>
            {s.colNo && <th style={{ ...thS, width: 22 }}>#</th>}
            {s.colProductImage && <th style={{ ...thS, width: 52 }}>Image</th>}
            {s.colItemCode && <th style={{ ...thS }}>Product / Services</th>}
            {s.colDescription && <th style={{ ...thS, width: "30%" }}>Description of Product / Services</th>}
            {s.colUOM && <th style={{ ...thS }}>UOM</th>}
            {s.colQty && <th style={{ ...thS }}>Qty</th>}
            {s.colUnitPrice && <th style={{ ...thS }}>Unit Price</th>}
            {s.colTaxableAmount && <th style={{ ...thS }}>Taxable Amount</th>}
            {s.colDiscount && <th style={{ ...thS }}>Disc %</th>}
            {s.colVAT && <th style={{ ...thS }}>VAT %</th>}
            {s.colVATAmount && <th style={{ ...thS }}>VAT Amount</th>}
            {s.colLineTotal && <th style={{ ...thS, borderRight: "none" }}>Line Total</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
    const netUnit = item.price * (1 - item.disc / 100);
    const taxable = item.qty * netUnit;
    const vatAmt = taxable * (item.vat / 100);
    const lineTotal = taxable + vatAmt;
    const [shortDescriptionLine, ...detailedDescriptionLines] = item.desc.split("\n").filter(Boolean);
    const visibleDescriptionLines = [
      s.showShortDescription !== false ? shortDescriptionLine : null,
      ...(s.showDetailedDescription !== false ? detailedDescriptionLines : [])
    ].filter(Boolean);
    return <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                {s.colNo && <td style={{ ...tdS(false, true), fontWeight: 600 }}>{item.no}</td>}
                {s.colProductImage && <td style={tdS()}>
                    <div style={{ width: 42, height: 42, background: `${s.accentColor}22`, borderRadius: 4, border: `1px solid ${s.accentColor}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18 }}>📦</span>
                    </div>
                  </td>}
                {s.colItemCode && <td style={tdS()}>
                    <p style={{ fontWeight: 700, margin: "0 0 1px" }}>{item.name}</p>
                    <p style={{ margin: 0, color: "#666", fontSize: `${f - 1}px`, fontFamily: "monospace" }}>{item.code}</p>
                    {(s.colBarcode || s.colSKU || s.colBatchNumber || s.colBrand) && <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
                        {s.colBrand && <span style={{ fontSize: `${f - 1.5}px`, color: "#64748b" }}>
                            <span style={{ color: "#94a3b8" }}>Brand: </span>{item.brand}
                          </span>}
                        {s.colSKU && <span style={{ fontSize: `${f - 1.5}px`, color: "#64748b" }}>
                            <span style={{ color: "#94a3b8" }}>SKU: </span>{item.sku}
                          </span>}
                        {s.colBarcode && <span style={{ fontSize: `${f - 1.5}px`, color: "#64748b", fontFamily: "monospace" }}>
                            <span style={{ color: "#94a3b8", fontFamily: "inherit" }}>Barcode: </span>{item.barcode}
                          </span>}
                        {s.colBatchNumber && <span style={{ fontSize: `${f - 1.5}px`, color: "#64748b" }}>
                            <span style={{ color: "#94a3b8" }}>Batch: </span>{item.batch}
                          </span>}
                      </div>}
                    {s.colBinLocation && <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, background: `${s.accentColor}18`, border: `1px solid ${s.accentColor}55`, borderRadius: 4, padding: "2px 7px" }}>
                        <span style={{ fontSize: `${f - 1.5}px`, color: "#78350f", fontWeight: 600, letterSpacing: 0.3 }}>Bin:</span>
                        <span style={{ fontSize: `${f - 1}px`, color: "#92400e", fontWeight: 700, fontFamily: "monospace", letterSpacing: 0.5 }}>{item.binLocation}</span>
                      </div>}
                  </td>}
                {s.colDescription && <td style={tdS()}>
                    {visibleDescriptionLines.length > 0 && <p style={{ whiteSpace: "pre-line", margin: 0, lineHeight: 1.6, color: "#444" }}>{visibleDescriptionLines.map((line, li) => <span key={li} style={{ display: "block" }}>{"\xB7 "}{line}</span>)}</p>}
                    {item.disc > 0 && <p style={{ margin: "4px 0 0", color: "#e11d48", fontSize: `${f - 1}px`, fontWeight: 600 }}>
                        Discount N/A @ {item.disc}%
                      </p>}
                  </td>}
                {s.colUOM && <td style={tdS(false, true)}>{item.uom}</td>}
                {s.colQty && <td style={tdS(false, true)}>{item.qty.toFixed(2)}</td>}
                {s.colUnitPrice && <td style={tdS(true)}>{item.price.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>}
                {s.colTaxableAmount && <td style={tdS(true)}>{taxable.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>}
                {s.colDiscount && <td style={tdS(false, true)}>
                    {item.disc > 0 ? <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>{(item.qty * item.price * item.disc / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}</p>
                        <p style={{ margin: 0, color: "#888", fontSize: `${f - 1}px` }}>@ {item.disc}%</p>
                      </div> : "\u2014"}
                  </td>}
                {s.colVAT && <td style={tdS(false, true)}>@ vat {item.vat}%</td>}
                {s.colVATAmount && <td style={tdS(true)}>{vatAmt.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>}
                {s.colLineTotal && <td style={{ ...tdS(true, false, true, true) }}>{lineTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>}
              </tr>;
  })}
        </tbody>
      </table>

      </div>{/* end flex:1 body */}

      {/* ── FOOTER GROUP: pushed to bottom ── */}
      <div style={{ marginTop: "auto" }}>

      {
    /* ── TOTALS ── */
  }
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <table style={{ minWidth: 260, borderCollapse: "collapse", fontSize: `${f}px` }}>
          <tbody>
            {s.showSubtotal && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#888", textAlign: "right" }}>Sub Total</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, width: 100 }}><CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} /></td>
                <td style={{ padding: "3px 0 3px 12px", textAlign: "right", fontWeight: 700, width: 110 }}>
                  {subtotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </td>
              </tr>}
            {s.showDiscountTotal !== false && discTotal > 0 && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#e11d48", textAlign: "right" }}>Discount</td>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#e11d48", width: 100 }}><CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} /></td>
                <td style={{ padding: "3px 0 3px 12px", textAlign: "right", color: "#e11d48", fontWeight: 700, width: 110 }}>
                  - {discTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </td>
              </tr>}
            {s.showDiscountTotal !== false && mockFooterDiscount > 0 && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#e11d48", textAlign: "right" }}>Footer Discount</td>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#e11d48", width: 100 }}><CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} /></td>
                <td style={{ padding: "3px 0 3px 12px", textAlign: "right", color: "#e11d48", fontWeight: 700, width: 110 }}>
                  - {mockFooterDiscount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </td>
              </tr>}
            {s.showTaxableTotal && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#888", textAlign: "right" }}>Taxable Amount</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, width: 100 }}><CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} /></td>
                <td style={{ padding: "3px 0 3px 12px", textAlign: "right", fontWeight: 700, width: 110 }}>
                  {(subtotal - discTotal - mockFooterDiscount).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </td>
              </tr>}
            {s.showVATTotal && <tr>
                <td style={{ padding: "3px 16px 3px 0", color: "#888", textAlign: "right" }}>Total VAT</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, width: 100 }}><CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} /></td>
                <td style={{ padding: "3px 0 3px 12px", textAlign: "right", fontWeight: 700, width: 110 }}>
                  {vatTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </td>
              </tr>}
            {s.showGrandTotal && <tr style={{ background: s.totalRowBg }}>
                <td style={{ padding: "6px 16px 6px 0", fontWeight: 700, textAlign: "right", fontSize: `${f + 1}px` }}>Total</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, width: 100, fontSize: `${f + 1}px` }}><CurrencyPreviewToken currencyConfig={currencyConfig} currencyDisplay={currencyMode} /></td>
                <td style={{ padding: "6px 0 6px 12px", textAlign: "right", fontWeight: 800, fontSize: `${f + 2}px`, width: 110 }}>
                  {grandTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </td>
              </tr>}
          </tbody>
        </table>
      </div>

      {
    /* ── AMOUNT IN WORDS (immediately after grand total) ── */
  }
      {s.showAmountInWords && <p style={{ fontSize: `${f}px`, color: "#374151", marginBottom: 14, textAlign: "right" }}>
          In Words: {amountInWords(grandTotal, currencyConfig?.currency)}
        </p>}

      {
    /* ── BANK DETAILS ── */
  }
      {s.showBankDetails && <div style={{ marginBottom: 12, background: "#f0f9ff", border: `1px solid #bae6fd`, borderRadius: 6, padding: "10px 14px", fontSize: `${f}px` }}>
          <p style={{ fontWeight: 700, marginBottom: 6, color: "#075985" }}>Bank Details</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px" }}>
            {[["Bank", s.bankName], ["Account", s.bankAccount], ["IBAN", s.bankIBAN], ["SWIFT / BIC", s.bankSWIFT]].map(([l, v]) => <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>{l}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>)}
          </div>
        </div>}

      {
    /* ── TERMS & CONDITIONS (below bank details) ── */
  }
      {s.showTerms && <div style={{ marginBottom: 12, background: "#fffbeb", border: `1px solid #fde68a`, borderRadius: 6, padding: "10px 14px", fontSize: `${f}px` }}>
          <p style={{ fontWeight: 700, marginBottom: 6, color: "#92400e" }}>Terms & Conditions</p>
          <p style={{ whiteSpace: "pre-line", lineHeight: 1.7, color: "#374151", margin: 0 }}>{s.termsText}</p>
        </div>}

      {
    /* ── NOTES ── */
  }
      {s.showNotes && <div style={{ marginBottom: 14 }}>
          <p style={{ fontWeight: 700, fontSize: `${f}px`, marginBottom: 3 }}>{s.notesLabel}</p>
          <p style={{ color: "#94a3b8", fontSize: `${f - 0.5}px`, margin: 0 }}>&mdash;</p>
        </div>}

      {
    /* ── COMPANY STAMP + QR ── */
  }
      {(s.showCompanyStamp || s.showQRCode) && <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 12 }}>
          {s.showCompanyStamp && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {s.stampUrl ? <img src={s.stampUrl} alt="stamp" style={{ width: 90, height: 90, objectFit: "contain" }} /> : <div style={{
    width: 90,
    height: 90,
    borderRadius: "50%",
    border: `2px dashed ${s.accentColor}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: `${s.accentColor}0d`
  }}>
                    <span style={{ fontSize: `${f - 1}px`, color: s.accentColor, fontWeight: 700, textAlign: "center", lineHeight: 1.4 }}>
                      Company<br />Stamp
                    </span>
                  </div>}
              <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Official Stamp</span>
            </div>}
          {s.showQRCode && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 52, height: 52, background: "#1a1a2e", borderRadius: 4 }} />
              <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Scan to verify</span>
            </div>}
        </div>}

      {
    /* ── PAGE NUMBER ── */
  }
      {s.showPageNumbers && <p style={{ textAlign: "right", fontSize: `${f - 2}px`, color: "#cbd5e1", marginTop: 8 }}>Page 1 of 1</p>}

      </div>{/* end footer group */}

      {
    /* ── WATERMARK (absolute, outside flow) ── */
  }
      {s.showWatermark && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", opacity: 0.06, transform: "rotate(-35deg)", fontSize: 90, fontWeight: 900, color: s.accentColor, letterSpacing: 8 }}>
          {s.watermarkText}
        </div>}
    </div>;
}
function SectionLabel({ icon, label }) {
  return <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1.5 px-0.5">
      {icon}{label}
    </div>;
}
function Row({ label, children }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 py-1.5 pr-1 border-b border-slate-100 last:border-0">
      <span className="min-w-0 text-[11px] text-slate-700 leading-tight">{label}</span>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>;
}
function Toggle({ value, onChange }) {
  return <button
    type="button"
    role="switch"
    aria-checked={!!value}
    onClick={() => onChange(!value)}
    className={`relative inline-flex h-4 w-8 shrink-0 items-center overflow-hidden rounded-full transition-colors ${value ? "bg-[#F5C742]" : "bg-slate-200"}`}
  >
      <span className={`block h-3 w-3 shrink-0 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>;
}
function ImageUpload({ value, onChange, label, shape = "rect" }) {
  const id = React.useId();
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result);
    reader.readAsDataURL(file);
  }
  return <div className="py-1.5 border-b border-slate-100">
      <p className="text-[10px] text-slate-500 mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        {value ? <div className={`shrink-0 overflow-hidden bg-slate-100 border border-slate-200 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>
            <img src={value} alt="preview" className="w-full h-full object-contain" />
          </div> : <div className={`shrink-0 bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>
            {shape === "circle" ? "Stamp" : "Logo"}
          </div>}
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="cursor-pointer text-[10px] text-[#b08a00] font-medium hover:underline">
            {value ? "Change" : "Upload"} image
          </label>
          <input id={id} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {value && <button onClick={() => onChange("")} className="text-[10px] text-slate-400 hover:text-red-500 text-left">Remove</button>}
        </div>
      </div>
    </div>;
}
function ColorPick({ value, onChange }) {
  return <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded border border-slate-200 cursor-pointer overflow-hidden relative">
        <input
    type="color"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="absolute inset-0 opacity-0 cursor-pointer w-8 h-8 -translate-x-1 -translate-y-1"
  />
        <div className="w-full h-full" style={{ background: value }} />
      </div>
      <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-16 text-[10px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 focus:outline-none"
  />
    </div>;
}
function Sel({ value, onChange, options }) {
  return <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
  >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>;
}
function DocumentTemplateDesigner({ docType, templateName, initialSettings, onClose, onSave }) {
  const companyContext = useContext(CompanyContext);
  const previewCurrencyConfig = resolveCurrencyDisplayConfig(
    companyContext?.company || {},
    { currency: MOCK.doc.currency }
  );
  const [s, setS] = useState({
    ...defaultSettings(docType),
    templateName: templateName ?? `Default ${docTypeLabel(docType)}`,
    ...initialSettings
  });
  const [tab, setTab] = useState("style");
  const [zoom, setZoom] = useState(0.6);
  function upd(key, val) {
    setS((prev) => ({ ...prev, [key]: val }));
  }
  const TABS = [
    { id: "style", label: "Style", icon: <Palette className="h-3 w-3" /> },
    { id: "company", label: "Company", icon: <Building2 className="h-3 w-3" /> },
    { id: "customer", label: "Customer", icon: <User className="h-3 w-3" /> },
    { id: "doc-info", label: "Doc Info", icon: <FileText className="h-3 w-3" /> },
    { id: "table", label: "Table", icon: <Table className="h-3 w-3" /> },
    { id: "footer", label: "Footer", icon: <CreditCard className="h-3 w-3" /> }
  ];
  return <div className="flex flex-col min-h-screen bg-[#F0F0F3]">

      {
    /* ── TOP BAR ── */
  }
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: s.accentColor }} />
            <span className="text-xs font-semibold text-slate-800">{s.templateName}</span>
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">{docTypeLabel(docType)}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {
    /* Zoom */
  }
          <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1">
            <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.05).toFixed(2)))} className="text-slate-400 hover:text-slate-700 text-xs w-4">−</button>
            <span className="text-[10px] text-slate-600 w-9 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.05).toFixed(2)))} className="text-slate-400 hover:text-slate-700 text-xs w-4">+</button>
          </div>
          <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1.5 px-3" onClick={() => toast("Print preview ready")}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button
    size="sm"
    className="text-[11px] h-7 gap-1.5 px-3 bg-[#F5C742] text-slate-900 hover:bg-[#e8b830] border-0"
    onClick={() => {
      onSave(s);
      toast.success("Template saved!");
    }}
  >
            <Save className="h-3.5 w-3.5" /> Save Template
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {
    /* ── LEFT SETTINGS PANEL ── */
  }
        <div className="w-[268px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

          {
    /* Template name field */
  }
          <div className="px-3 py-2 border-b border-slate-100">
            <input
    value={s.templateName}
    onChange={(e) => upd("templateName", e.target.value)}
    className="w-full text-[11px] font-semibold border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-[#F5C742]"
    placeholder="Template name"
  />
          </div>

          {
    /* Tab bar */
  }
          <div className="flex border-b border-slate-200 overflow-x-auto shrink-0">
            {TABS.map((t) => <button
    key={t.id}
    onClick={() => setTab(t.id)}
    className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-[#F5C742] text-slate-900 bg-[#FFFBF0]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
  >
                {t.icon}{t.label}
              </button>)}
          </div>

          {
    /* Scrollable settings */
  }
          <div className="flex-1 overflow-y-auto px-3 py-1.5">

            {
    /* ── STYLE TAB ── */
  }
            {tab === "style" && <>
              <SectionLabel icon={<Layout className="h-3 w-3" />} label="Layout Style" />
              <Row label="Template Style">
                <Sel value={s.layoutStyle} onChange={(v) => upd("layoutStyle", v)} options={[
    { value: "classic", label: "Classic (ERPNext)" },
    { value: "corporate", label: "Corporate (Dark Header)" }
  ]} />
              </Row>
              <Row label="Paper Size">
                <Sel value={s.paperSize} onChange={(v) => upd("paperSize", v)} options={[
    { value: "A4", label: "A4" },
    { value: "Letter", label: "Letter" },
    { value: "A5", label: "A5" }
  ]} />
              </Row>

              <SectionLabel icon={<Palette className="h-3 w-3" />} label="Colors" />
              <Row label="Accent / Highlight"><ColorPick value={s.accentColor} onChange={(v) => upd("accentColor", v)} /></Row>
              <Row label="Grand Total Color"><ColorPick value={s.grandTotalColor} onChange={(v) => upd("grandTotalColor", v)} /></Row>
              <Row label="Table Header BG"><ColorPick value={s.tableHeaderBg} onChange={(v) => upd("tableHeaderBg", v)} /></Row>
              <Row label="Table Header Text"><ColorPick value={s.tableHeaderText} onChange={(v) => upd("tableHeaderText", v)} /></Row>
              <Row label="Totals Row BG"><ColorPick value={s.totalRowBg} onChange={(v) => upd("totalRowBg", v)} /></Row>
              <Row label="Border Color"><ColorPick value={s.borderColor} onChange={(v) => upd("borderColor", v)} /></Row>

              <SectionLabel icon={<Type className="h-3 w-3" />} label="Typography" />
              <Row label="Font Family">
                <Sel value={s.fontFamily} onChange={(v) => upd("fontFamily", v)} options={[
    { value: "Inter, sans-serif", label: "Inter" },
    { value: "Arial, sans-serif", label: "Arial" },
    { value: "Georgia, serif", label: "Georgia" },
    { value: "Helvetica, sans-serif", label: "Helvetica" },
    { value: "Times New Roman, serif", label: "Times New Roman" }
  ]} />
              </Row>
              <Row label="Font Size (px)">
                <input
    type="number"
    min={7}
    max={13}
    value={s.fontSize}
    onChange={(e) => upd("fontSize", +e.target.value)}
    className="w-12 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 text-center focus:outline-none"
  />
              </Row>

              <SectionLabel icon={<Eye className="h-3 w-3" />} label="Extras" />
              <Row label="Grand Total Banner"><Toggle value={s.showGrandTotalBanner} onChange={(v) => upd("showGrandTotalBanner", v)} /></Row>
              <Row label="Watermark"><Toggle value={s.showWatermark} onChange={(v) => upd("showWatermark", v)} /></Row>
              {s.showWatermark && <Row label="Watermark Text">
                  <input
    value={s.watermarkText}
    onChange={(e) => upd("watermarkText", e.target.value)}
    className="w-24 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none"
  />
                </Row>}
              <Row label="Page Numbers"><Toggle value={s.showPageNumbers} onChange={(v) => upd("showPageNumbers", v)} /></Row>
            </>}

            {
    /* ── COMPANY TAB ── */
  }
            {tab === "company" && <>
              <SectionLabel icon={<Building2 className="h-3 w-3" />} label="Company Header" />
              <Row label="Logo"><Toggle value={s.showLogo} onChange={(v) => upd("showLogo", v)} /></Row>
              {s.showLogo && <ImageUpload value={s.logoUrl} onChange={(v) => upd("logoUrl", v)} label="Company Logo" shape="rect" />}
              <Row label="Company Name"><Toggle value={s.showCompanyName} onChange={(v) => upd("showCompanyName", v)} /></Row>
              <Row label="Address"><Toggle value={s.showCompanyAddress} onChange={(v) => upd("showCompanyAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCompanyPhone} onChange={(v) => upd("showCompanyPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCompanyEmail} onChange={(v) => upd("showCompanyEmail", v)} /></Row>
              <Row label="Website"><Toggle value={s.showCompanyWebsite} onChange={(v) => upd("showCompanyWebsite", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showTRN} onChange={(v) => upd("showTRN", v)} /></Row>
              <Row label="CR Number"><Toggle value={s.showCRN} onChange={(v) => upd("showCRN", v)} /></Row>
            </>}

            {
    /* ── CUSTOMER TAB ── */
  }
            {tab === "customer" && <>
              <SectionLabel icon={<User className="h-3 w-3" />} label="Address Sections" />
              <Row label="Bill To"><Toggle value={s.showBillTo} onChange={(v) => upd("showBillTo", v)} /></Row>
              <Row label="Ship To"><Toggle value={s.showShipTo} onChange={(v) => upd("showShipTo", v)} /></Row>
              <SectionLabel icon={<User className="h-3 w-3" />} label="Customer Fields" />
              <Row label="Customer Code"><Toggle value={s.showCustomerCode} onChange={(v) => upd("showCustomerCode", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCustomerPhone} onChange={(v) => upd("showCustomerPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCustomerEmail} onChange={(v) => upd("showCustomerEmail", v)} /></Row>
              <Row label="Customer TRN"><Toggle value={s.showCustomerTRN} onChange={(v) => upd("showCustomerTRN", v)} /></Row>
            </>}

            {
    /* ── DOC INFO TAB ── */
  }
            {tab === "doc-info" && <>
              <SectionLabel icon={<FileText className="h-3 w-3" />} label="Document Meta Fields" />
              <Row label="Document Number"><Toggle value={s.showDocNumber} onChange={(v) => upd("showDocNumber", v)} /></Row>
              <Row label="Date"><Toggle value={s.showDocDate} onChange={(v) => upd("showDocDate", v)} /></Row>
              <Row label="Due Date"><Toggle value={s.showDueDate} onChange={(v) => upd("showDueDate", v)} /></Row>
              <Row label="Valid Until"><Toggle value={s.showValidUntil} onChange={(v) => upd("showValidUntil", v)} /></Row>
              <Row label="Salesperson / Account Exec"><Toggle value={s.showSalesperson} onChange={(v) => upd("showSalesperson", v)} /></Row>
              <Row label="Payment Terms"><Toggle value={s.showPaymentTerms} onChange={(v) => upd("showPaymentTerms", v)} /></Row>
              <Row label="Currency"><Toggle value={s.showCurrency} onChange={(v) => upd("showCurrency", v)} /></Row>
              <Row label="Show as Currency Code (e.g. AED)"><Toggle value={s.currencyDisplay === "code"} onChange={(v) => upd("currencyDisplay", v ? "code" : "symbol")} /></Row>
              <Row label="PO / Reference"><Toggle value={s.showPOReference} onChange={(v) => upd("showPOReference", v)} /></Row>
              <Row label="Location / Store"><Toggle value={s.showLocationStore} onChange={(v) => upd("showLocationStore", v)} /></Row>
              <Row label="Warehouse / Store"><Toggle value={s.showWarehouseStore} onChange={(v) => upd("showWarehouseStore", v)} /></Row>
              <Row label="Delivery Terms"><Toggle value={s.showDeliveryTerms} onChange={(v) => upd("showDeliveryTerms", v)} /></Row>
              <SectionLabel icon={<FileText className="h-3 w-3" />} label="Document References" />
              <Row label="Quotation No."><Toggle value={s.showQuotationRef} onChange={(v) => upd("showQuotationRef", v)} /></Row>
              <Row label="SO No."><Toggle value={s.showSalesOrderRef} onChange={(v) => upd("showSalesOrderRef", v)} /></Row>
              <Row label="SI No."><Toggle value={s.showSalesInvoiceRef} onChange={(v) => upd("showSalesInvoiceRef", v)} /></Row>
            </>}

            {
    /* ── TABLE TAB ── */
  }
            {tab === "table" && <>
              <SectionLabel icon={<Table className="h-3 w-3" />} label="Table Columns" />
              <Row label="Row Separator Lines"><Toggle value={s.showRowLines !== false} onChange={(v) => upd("showRowLines", v)} /></Row>
              <Row label="# Line No."><Toggle value={s.colNo} onChange={(v) => upd("colNo", v)} /></Row>
              <Row label="Product Image"><Toggle value={s.colProductImage} onChange={(v) => upd("colProductImage", v)} /></Row>
              <Row label="Item Code / Name"><Toggle value={s.colItemCode} onChange={(v) => upd("colItemCode", v)} /></Row>

              <SectionLabel icon={<AlignLeft className="h-3 w-3" />} label="Item Sub-info (below name)" />
              <Row label="Brand"><Toggle value={s.colBrand} onChange={(v) => upd("colBrand", v)} /></Row>
              <Row label="SKU"><Toggle value={s.colSKU} onChange={(v) => upd("colSKU", v)} /></Row>
              <Row label="Barcode"><Toggle value={s.colBarcode} onChange={(v) => upd("colBarcode", v)} /></Row>
              <Row label="Batch Number"><Toggle value={s.colBatchNumber} onChange={(v) => upd("colBatchNumber", v)} /></Row>
              <Row label="Bin Location (Zone / Locator / Bin)"><Toggle value={s.colBinLocation} onChange={(v) => upd("colBinLocation", v)} /></Row>

              <SectionLabel icon={<Table className="h-3 w-3" />} label="Other Columns" />
              <Row label="Description"><Toggle value={s.colDescription} onChange={(v) => upd("colDescription", v)} /></Row>
              <Row label="Short Description"><Toggle value={s.showShortDescription !== false} onChange={(v) => upd("showShortDescription", v)} /></Row>
              <Row label="Detailed Description"><Toggle value={s.showDetailedDescription !== false} onChange={(v) => upd("showDetailedDescription", v)} /></Row>
              <Row label="UOM"><Toggle value={s.colUOM} onChange={(v) => upd("colUOM", v)} /></Row>
              <Row label="Quantity"><Toggle value={s.colQty} onChange={(v) => upd("colQty", v)} /></Row>
              <Row label="Unit Price"><Toggle value={s.colUnitPrice} onChange={(v) => upd("colUnitPrice", v)} /></Row>
              <Row label="Taxable Amount"><Toggle value={s.colTaxableAmount} onChange={(v) => upd("colTaxableAmount", v)} /></Row>
              <Row label="Discount %"><Toggle value={s.colDiscount} onChange={(v) => upd("colDiscount", v)} /></Row>
              <Row label="VAT %"><Toggle value={s.colVAT} onChange={(v) => upd("colVAT", v)} /></Row>
              <Row label="VAT Amount"><Toggle value={s.colVATAmount} onChange={(v) => upd("colVATAmount", v)} /></Row>
              <Row label="Line Total"><Toggle value={s.colLineTotal} onChange={(v) => upd("colLineTotal", v)} /></Row>

              <SectionLabel icon={<CreditCard className="h-3 w-3" />} label="Totals Block" />
              <Row label="Taxable Amount"><Toggle value={s.showTaxableTotal} onChange={(v) => upd("showTaxableTotal", v)} /></Row>
              <Row label="Sub Total"><Toggle value={s.showSubtotal} onChange={(v) => upd("showSubtotal", v)} /></Row>
              <Row label="Discount Total"><Toggle value={s.showDiscountTotal !== false} onChange={(v) => upd("showDiscountTotal", v)} /></Row>
              <Row label="VAT Total"><Toggle value={s.showVATTotal} onChange={(v) => upd("showVATTotal", v)} /></Row>
              <Row label="Grand Total"><Toggle value={s.showGrandTotal} onChange={(v) => upd("showGrandTotal", v)} /></Row>
              <Row label="Amount in Words"><Toggle value={s.showAmountInWords} onChange={(v) => upd("showAmountInWords", v)} /></Row>
            </>}

            {
    /* ── FOOTER TAB ── */
  }
            {tab === "footer" && <>
              <SectionLabel icon={<CreditCard className="h-3 w-3" />} label="Bank Details" />
              <Row label="Show Bank Details"><Toggle value={s.showBankDetails} onChange={(v) => upd("showBankDetails", v)} /></Row>
              {s.showBankDetails && <div className="space-y-1 py-1">
                  {["bankName", "bankAccount", "bankIBAN", "bankSWIFT"].map((k) => <div key={k}>
                      <p className="text-[9px] text-slate-400 mb-0.5 capitalize">{k.replace("bank", "Bank ")}</p>
                      <input
    value={s[k]}
    onChange={(e) => upd(k, e.target.value)}
    className="w-full text-[10px] border border-slate-200 rounded px-2 py-1 bg-slate-50 focus:outline-none"
  />
                    </div>)}
                </div>}

              <SectionLabel icon={<AlignLeft className="h-3 w-3" />} label="Terms & Conditions" />
              <Row label="Show Terms"><Toggle value={s.showTerms} onChange={(v) => upd("showTerms", v)} /></Row>
              {s.showTerms && <textarea
    value={s.termsText}
    onChange={(e) => upd("termsText", e.target.value)}
    rows={5}
    className="w-full text-[10px] border border-slate-200 rounded px-2 py-1.5 bg-slate-50 mt-1 resize-none focus:outline-none"
  />}

              <SectionLabel icon={<FileText className="h-3 w-3" />} label="Notes Section" />
              <Row label="Show Notes"><Toggle value={s.showNotes} onChange={(v) => upd("showNotes", v)} /></Row>
              {s.showNotes && <Row label="Notes Label">
                  <input
    value={s.notesLabel}
    onChange={(e) => upd("notesLabel", e.target.value)}
    className="w-24 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none"
  />
                </Row>}

              <SectionLabel icon={<Check className="h-3 w-3" />} label="Stamp & Verification" />
              <Row label="Company Stamp"><Toggle value={s.showCompanyStamp} onChange={(v) => upd("showCompanyStamp", v)} /></Row>
              {s.showCompanyStamp && <ImageUpload value={s.stampUrl} onChange={(v) => upd("stampUrl", v)} label="Stamp Image" shape="circle" />}
              <Row label="QR Code (verify)"><Toggle value={s.showQRCode} onChange={(v) => upd("showQRCode", v)} /></Row>
            </>}

          </div>{
    /* end scrollable */
  }
        </div>{
    /* end left panel */
  }

        {
    /* ── RIGHT PREVIEW ── */
  }
        <div className="flex-1 overflow-auto bg-slate-300 p-6">

          {
    /* Hint bar */
  }
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-white/70 px-3 py-1.5 rounded-full border border-slate-200">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              Live preview — toggle settings on the left to update instantly
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-white">{s.paperSize}</Badge>
              <Badge variant="outline" className="text-[10px] bg-white capitalize">{s.layoutStyle}</Badge>
            </div>
          </div>

          {
    /* A4 canvas */
  }
          <div style={{ transformOrigin: "top center", transform: `scale(${zoom})`, width: 794, marginLeft: "auto", marginRight: "auto", marginBottom: `${-(794 * (1 - zoom) * 1.414)}px` }}>
            <div style={{ width: 794, minHeight: 1123, background: "#fff", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
              <ClassicPreview s={s} currencyConfig={previewCurrencyConfig} />
            </div>
          </div>

        </div>
      </div>
    </div>;
}
export {
  DocumentTemplateDesigner,
  docTypeLabel
};
