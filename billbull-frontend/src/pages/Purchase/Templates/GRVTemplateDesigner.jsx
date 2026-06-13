import React, { useState } from "react";
import { ArrowLeft, Save, Printer, Info } from "lucide-react";
import { Badge, Button } from "./PurchaseTemplateUI";
import toast from "react-hot-toast";
const MOCK = {
  company: {
    name: "Al Noor Trading & Contracting LLC",
    address: "P.O. Box 4821, Fujairah, UAE",
    phone: "+971 9 222 1100",
    email: "info@alnoor.ae",
    trn: "100437876500003",
    crn: "CR: 12345-2019"
  },
  grv: {
    number: "SRN-2025-000384",
    date: "23 May 2025",
    receivedAt: "Main Warehouse, Fujairah",
    status: "Pending Inspection",
    salesOrderRef: "SO-2025-003812"
  },
  customer: {
    name: "Horizon Retail Group LLC",
    address: "P.O. Box 1120, Dubai, UAE",
    phone: "+971 4 555 7890",
    email: "accounts@horizonretail.ae",
    trn: "100987231250003",
    code: "HRGP-0091"
  },
  returnReason: "Customer received damaged goods on delivery \u2014 10 units of Item A defective. Customer requesting full replacement and return of packaging surcharge.",
  refs: {
    salesInvoice: "SI-2025-006204",
    salesInvoiceDate: "15 May 2025",
    salesOrder: "SO-2025-003812",
    salesOrderDriver: "Delivery Note: DN-2025-0814",
    salesOrderRef: "Returned by: Ali A. Al Rashid",
    receivedByWarehouse: "Warehouse \u2014 Gate 2",
    receivedByDriver: "Received by: Ali A. Al Rashid"
  },
  items: [
    {
      no: 1,
      name: "Industrial Safety Gloves \u2014 XL",
      shortDesc: "Cut-resistant industrial safety gloves",
      detailedDesc: "Palm coating worn through on returned units",
      sku: "ISG-XL-001",
      batch: "BTH-2025-0441",
      tag: "Damaged on arrival",
      qtyOrig: 50,
      qtyReturn: 10,
      unit: "PCS",
      unitPrice: 85,
      condition: "Damaged",
      disposition: "Scrap",
      returnValue: 850
    },
    {
      no: 2,
      name: "Packaging surcharge reversal",
      shortDesc: "Invoice adjustment line",
      detailedDesc: "Packaging charge reversed with returned goods",
      sku: "",
      batch: "",
      tag: "Adjustment",
      qtyOrig: 1,
      qtyReturn: 1,
      unit: "EA",
      unitPrice: 40,
      condition: "N/A",
      disposition: "Adjustment",
      returnValue: 40
    }
  ],
  inspection: {
    status: "Pending QC sign-off",
    assignedTo: "Quality Control Dept",
    physicalCondition: "Outer carton crushed \u2014 10 units visibly deformed",
    photoAttached: "4 images \u2014 Ref: IMG-SRN-0384",
    stockMovement: "Returned items held in quarantine bin\nStock NOT restocked pending QC decision"
  },
  creditNote: {
    number: "CN-2025-001847",
    amount: 892.5,
    date: "23 May 2025",
    status: "Open"
  },
  summary: { subtotal: 890, discount: 0, taxable: 890, vat: 44.5, total: 934.5 },
  termsDefault: "Returned goods are to remain in quarantine until QC inspection is complete. Restocking or scrapping requires QC manager sign-off. A credit note has been raised and may be applied against outstanding invoices upon approval. Customer has been notified of receipt. For disputes or queries, contact: accounts@alnoor.ae",
  footer: { printed: "23 May 2025, 10:48 AM", user: "warehouse@alnoor.ae" }
};
function aed(n) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}
function amountInWords(n) {
  return `${Math.floor(n).toLocaleString("en-AE")} AED and ${Math.round(n % 1 * 100)} Fils only`;
}
function defaultSettings() {
  return {
    templateName: "Default GRV Template",
    accentColor: "#F5C742",
    fontFamily: "Inter, sans-serif",
    fontSize: 9,
    paperSize: "A4",
    showLogo: true,
    logoUrl: "",
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: true,
    showTRN: true,
    showCRN: true,
    showGRVNumber: true,
    showReturnDate: true,
    showReceivedAt: true,
    showStatusBadge: true,
    showSalesOrderRef: true,
    showCustomerName: true,
    showCustomerAddress: true,
    showCustomerPhone: true,
    showCustomerEmail: false,
    showCustomerTRN: false,
    showCustomerCode: true,
    showReturnReason: true,
    showReferenceSection: true,
    showSalesInvoiceRef: true,
    colNo: true,
    colDescription: true,
    showShortDescription: true,
    showDetailedDescription: true,
    colSKU: true,
    colBatch: true,
    colQtyOriginal: true,
    colQtyReturn: true,
    colUnit: true,
    colUnitPrice: true,
    colCondition: true,
    colDisposition: true,
    colReturnValue: true,
    showInspectionSection: true,
    showInspectionStatus: true,
    showPhysicalCondition: true,
    showStockMovement: true,
    showSubtotal: true,
    showDiscount: true,
    showTaxableAmount: true,
    showVATTotal: true,
    showTotalReturn: true,
    showAmountInWords: true,
    showCreditNoteSection: true,
    showTerms: true,
    termsText: MOCK.termsDefault,
    showSignatureStrip: true,
    showCompanyStamp: true,
    stampUrl: "",
    showQRCode: false,
    showFooterBar: true
  };
}
function GRVPreview({ s }) {
  const f = s.fontSize;
  const gold = s.accentColor;
  const thS = {
    padding: "5px 7px",
    fontSize: `${f - 0.5}px`,
    fontWeight: 700,
    color: "#1a1a2e",
    background: gold,
    textAlign: "left",
    whiteSpace: "nowrap"
  };
  const tdS = (right = false, center = false) => ({
    padding: "5px 7px",
    fontSize: `${f}px`,
    color: "#374151",
    borderBottom: `1px solid ${gold}22`,
    textAlign: right ? "right" : center ? "center" : "left",
    verticalAlign: "top"
  });
  const metaItems = [
    s.showGRVNumber && ["GRV Number", MOCK.grv.number],
    s.showReturnDate && ["Return Date", MOCK.grv.date],
    s.showReceivedAt && ["Received At", MOCK.grv.receivedAt],
    s.showSalesOrderRef && ["Sales Order Ref", MOCK.grv.salesOrderRef]
  ].filter(Boolean);
  return <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#1a1a2e", padding: "28px 32px", position: "relative" }}>

      {
    /* ── HEADER: 3 columns — same structure as quotation ClassicPreview ── */
  }
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16 }}>

        {
    /* COL 1: Title + Customer (Returning) */
  }
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: `${f + 17}px`, fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px 0", letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>
            Goods Return Voucher
          </h1>
          {s.showStatusBadge && <div style={{ marginBottom: 10 }}>
              <span style={{ background: `${gold}22`, color: "#92400e", border: `1px solid ${gold}88`, fontSize: `${f - 1}px`, fontWeight: 600, padding: "2px 10px", borderRadius: 12 }}>
                {MOCK.grv.status}
              </span>
            </div>}
          {s.showCustomerName && <div>
              <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, marginBottom: 4, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Customer (Returning)</p>
              <p style={{ fontWeight: 700, fontSize: `${f + 1}px`, marginBottom: 2 }}>{MOCK.customer.name}</p>
              {s.showCustomerCode && <p style={{ color: "#64748b", fontSize: `${f - 0.5}px`, margin: "1px 0" }}>{MOCK.customer.code}</p>}
              {s.showCustomerAddress && <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "#444", margin: 0 }}>{MOCK.customer.address}</p>}
              {s.showCustomerPhone && <p style={{ marginTop: 3, color: "#555" }}>{MOCK.customer.phone}</p>}
              {s.showCustomerEmail && <p style={{ marginTop: 1, color: "#555" }}>{MOCK.customer.email}</p>}
              {s.showCustomerTRN && <p style={{ marginTop: 1, color: "#64748b", fontSize: `${f - 0.5}px` }}>TRN: {MOCK.customer.trn}</p>}
            </div>}
        </div>

        {
    /* COL 2: Doc info — label on top, value below, 2-column grid */
  }
        {metaItems.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", alignSelf: "flex-end", paddingBottom: 2 }}>
            {metaItems.map(([label, val], i) => <div key={i}>
                <p style={{ margin: 0, fontSize: `${f - 1}px`, color: "#999", fontWeight: 500 }}>{label}</p>
                <p style={{ margin: "1px 0 0", fontSize: `${f}px`, fontWeight: 700, color: "#1a1a2e" }}>{val}</p>
              </div>)}
          </div>}

        {
    /* COL 3: Logo + Company (right-aligned) */
  }
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          {s.showLogo && (s.logoUrl ? <img src={s.logoUrl} alt="logo" style={{ height: 72, objectFit: "contain" }} /> : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${gold}22`, border: `3px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: gold }}>G</span>
                </div>)}
          {s.showCompanyName && <div style={{ textAlign: "right", lineHeight: 1.55 }}>
              <p style={{ fontWeight: 700, fontSize: `${f + 3}px`, color: "#1a1a2e", margin: 0 }}>{MOCK.company.name}</p>
              {s.showCompanyAddress && <p style={{ margin: 0, color: "#555", whiteSpace: "pre-line" }}>{MOCK.company.address}</p>}
              {s.showCompanyPhone && <p style={{ margin: 0 }}>{MOCK.company.phone}</p>}
              {s.showCompanyEmail && <p style={{ margin: 0 }}>{MOCK.company.email}</p>}
              {s.showTRN && <p style={{ margin: 0, color: "#666" }}>TRN · {MOCK.company.trn}</p>}
              {s.showCRN && <p style={{ margin: 0, color: "#666" }}>{MOCK.company.crn}</p>}
            </div>}
        </div>
      </div>

      {
    /* ── RETURN REASON BAR ── */
  }
      {s.showReturnReason && <div style={{ background: `${gold}16`, border: `1.5px solid ${gold}66`, borderLeft: `4px solid ${gold}`, borderRadius: 4, padding: "8px 14px", fontSize: `${f}px`, color: "#374151", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontWeight: 800, color: "#92400e", fontSize: `${f - 0.5}px`, letterSpacing: 0.5, textTransform: "uppercase" }}>Return Reason</span>
            <span style={{ background: `${gold}33`, color: "#78350f", fontSize: `${f - 1.5}px`, fontWeight: 600, padding: "1px 7px", borderRadius: 10, border: `1px solid ${gold}55` }}>Sales Return note</span>
          </div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{MOCK.returnReason}</p>
        </div>}

      {
    /* ── REFERENCE SECTION ── */
  }
      {s.showReferenceSection && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14, fontSize: `${f}px` }}>
          <div style={{ background: `${gold}0d`, border: `1px solid ${gold}33`, borderRadius: 5, padding: "9px 11px" }}>
            <p style={{ fontWeight: 700, fontSize: `${f - 1}px`, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>Our Company (Receiving)</p>
            <p style={{ fontWeight: 700, marginBottom: 2 }}>{MOCK.company.name}</p>
            <p style={{ color: "#555", margin: 0 }}>{MOCK.company.address}</p>
            <p style={{ margin: "2px 0 0" }}>Tel: {MOCK.company.phone}</p>
          </div>
          {s.showSalesInvoiceRef && <div style={{ background: "#f8fafc", borderRadius: 5, padding: "9px 11px" }}>
              <p style={{ fontWeight: 700, fontSize: `${f - 1}px`, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>Sales Invoice Ref</p>
              <p style={{ color: "#1d4ed8", fontWeight: 700, margin: "0 0 1px" }}>{MOCK.refs.salesInvoice}</p>
              <p style={{ color: "#64748b", margin: 0 }}>Dated {MOCK.refs.salesInvoiceDate}</p>
              <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: `${f - 0.5}px` }}>Sales Order Rev.: {MOCK.refs.salesOrder}</p>
              <p style={{ color: "#64748b", margin: 0, fontSize: `${f - 0.5}px` }}>{MOCK.refs.receivedByWarehouse}</p>
            </div>}
          <div style={{ background: "#f8fafc", borderRadius: 5, padding: "9px 11px" }}>
            <p style={{ fontWeight: 700, fontSize: `${f - 1}px`, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>Customer (Returning)</p>
            <p style={{ fontWeight: 700, marginBottom: 2 }}>{MOCK.customer.name}</p>
            <p style={{ color: "#555", margin: 0 }}>VAT: {MOCK.customer.trn}</p>
            <p style={{ color: "#555", margin: 0 }}>{MOCK.customer.address}</p>
            <p style={{ margin: "2px 0 0" }}>{MOCK.customer.code}</p>
          </div>
        </div>}

      {
    /* ── LINE ITEMS TABLE ── */
  }
      <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Returned Items — Condition &amp; Disposition</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: `${f}px` }}>
        <thead>
          <tr>
            {s.colNo && <th style={{ ...thS, width: 22 }}>#</th>}
            {s.colDescription && <th style={{ ...thS }}>Item / Description</th>}
            {s.colQtyOriginal && <th style={{ ...thS, textAlign: "right" }}>Qty Orig</th>}
            {s.colQtyReturn && <th style={{ ...thS, textAlign: "right" }}>Qty Rtn</th>}
            {s.colUnit && <th style={{ ...thS, textAlign: "center" }}>Unit</th>}
            {s.colUnitPrice && <th style={{ ...thS, textAlign: "right" }}>Unit Price</th>}
            {s.colCondition && <th style={{ ...thS, textAlign: "center" }}>Condition</th>}
            {s.colDisposition && <th style={{ ...thS, textAlign: "center" }}>Disposition</th>}
            {s.colReturnValue && <th style={{ ...thS, textAlign: "right", background: `color-mix(in srgb, ${gold} 80%, #a0871b)` }}>Return Value</th>}
          </tr>
        </thead>
        <tbody>
          {MOCK.items.map((item, i) => <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : `${gold}07` }}>
              {s.colNo && <td style={{ ...tdS(false, true), fontWeight: 600 }}>{item.no}</td>}
              {s.colDescription && <td style={tdS()}>
                  <p style={{ fontWeight: 700, margin: "0 0 1px" }}>{item.name}</p>
                  {s.showShortDescription !== false && item.shortDesc && <p style={{ margin: 0, color: "#475569", fontSize: `${f - 1}px` }}>{item.shortDesc}</p>}
                  {s.showDetailedDescription !== false && item.detailedDesc && <p style={{ margin: "1px 0 0", color: "#94a3b8", fontSize: `${f - 1}px`, fontStyle: "italic" }}>{item.detailedDesc}</p>}
                  {s.colSKU && item.sku && <p style={{ margin: 0, color: "#64748b", fontSize: `${f - 1}px` }}>SKU: {item.sku}</p>}
                  {s.colBatch && item.batch && <p style={{ margin: 0, color: "#64748b", fontSize: `${f - 1}px` }}>Batch: {item.batch}</p>}
                  {item.tag && <span style={{ display: "inline-block", marginTop: 2, fontSize: `${f - 1.5}px`, fontWeight: 600, color: item.tag === "Adjustment" ? "#6366f1" : "#dc2626", background: item.tag === "Adjustment" ? "#eef2ff" : "#fef2f2", border: `1px solid ${item.tag === "Adjustment" ? "#c7d2fe" : "#fecaca"}`, borderRadius: 10, padding: "0 6px" }}>
                      {item.tag}
                    </span>}
                </td>}
              {s.colQtyOriginal && <td style={tdS(true)}>{item.qtyOrig.toFixed(2)}</td>}
              {s.colQtyReturn && <td style={{ ...tdS(true), fontWeight: 700, color: "#dc2626" }}>{item.qtyReturn.toFixed(2)}</td>}
              {s.colUnit && <td style={tdS(false, true)}>{item.unit}</td>}
              {s.colUnitPrice && <td style={tdS(true)}>AED {item.unitPrice.toFixed(2)}</td>}
              {s.colCondition && <td style={tdS(false, true)}>
                  <span style={{ background: item.condition === "Damaged" ? "#fef2f2" : "#f0fdf4", color: item.condition === "Damaged" ? "#dc2626" : "#16a34a", border: `1px solid ${item.condition === "Damaged" ? "#fecaca" : "#bbf7d0"}`, borderRadius: 10, fontSize: `${f - 1.5}px`, fontWeight: 600, padding: "1px 7px" }}>{item.condition}</span>
                </td>}
              {s.colDisposition && <td style={tdS(false, true)}>
                  <span style={{ background: `${gold}18`, color: "#78350f", border: `1px solid ${gold}55`, borderRadius: 10, fontSize: `${f - 1.5}px`, fontWeight: 600, padding: "1px 7px" }}>{item.disposition}</span>
                </td>}
              {s.colReturnValue && <td style={{ ...tdS(true), fontWeight: 700, color: "#1a1a2e", background: `${gold}10` }}>AED {item.returnValue.toFixed(2)}</td>}
            </tr>)}
        </tbody>
      </table>

      {
    /* ── INSPECTION + SUMMARY ── */
  }
      {s.showInspectionSection && <div style={{ marginBottom: 14 }}>
          <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 7 }}>Goods Inspection &amp; Quality Check</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              {s.showInspectionStatus && <div style={{ background: `${gold}0d`, border: `1px solid ${gold}33`, borderRadius: 5, padding: "8px 11px", marginBottom: 8 }}>
                  <p style={{ fontWeight: 700, fontSize: `${f - 1}px`, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Inspection Status</p>
                  <span style={{ background: `${gold}22`, color: "#92400e", border: `1px solid ${gold}77`, fontSize: `${f - 1}px`, fontWeight: 600, padding: "2px 10px", borderRadius: 12 }}>{MOCK.inspection.status}</span>
                  <p style={{ color: "#555", fontSize: `${f - 0.5}px`, marginTop: 4, marginBottom: 0 }}>Assigned to: {MOCK.inspection.assignedTo}</p>
                </div>}
              {s.showPhysicalCondition && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 5, padding: "8px 11px" }}>
                  <p style={{ fontWeight: 700, fontSize: `${f - 1}px`, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Physical Condition on Receipt</p>
                  <p style={{ color: "#dc2626", fontWeight: 600, margin: "0 0 3px" }}>{MOCK.inspection.physicalCondition}</p>
                  <p style={{ color: "#64748b", fontSize: `${f - 0.5}px`, margin: 0 }}>Photos attached: {MOCK.inspection.photoAttached}</p>
                </div>}
            </div>
            <div>
              {s.showStockMovement && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 5, padding: "8px 11px", marginBottom: 8 }}>
                  <p style={{ fontWeight: 700, fontSize: `${f - 1}px`, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Stock Movement on Return</p>
                  <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 2px", whiteSpace: "pre-line", lineHeight: 1.6 }}>{MOCK.inspection.stockMovement}</p>
                </div>}
              {
    /* Return Value Summary */
  }
              <div>
                <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Return Value Summary</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: `${f}px` }}>
                  <tbody>
                    {s.showSubtotal && <tr>
                        <td style={{ padding: "3px 0", color: "#64748b" }}>Subtotal (excl. VAT)</td>
                        <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{aed(MOCK.summary.subtotal)}</td>
                      </tr>}
                    {s.showDiscount && <tr>
                        <td style={{ padding: "3px 0", color: "#64748b" }}>Discount on return</td>
                        <td style={{ padding: "3px 0", textAlign: "right" }}>{aed(MOCK.summary.discount)}</td>
                      </tr>}
                    {s.showTaxableAmount && <tr>
                        <td style={{ padding: "3px 0", color: "#64748b" }}>Taxable amount</td>
                        <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{aed(MOCK.summary.taxable)}</td>
                      </tr>}
                    {s.showVATTotal && <tr>
                        <td style={{ padding: "3px 0", color: "#64748b" }}>VAT (5%)</td>
                        <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{aed(MOCK.summary.vat)}</td>
                      </tr>}
                    {s.showTotalReturn && <tr style={{ background: `${gold}18` }}>
                        <td style={{ padding: "7px 8px 7px 6px", fontWeight: 700, fontSize: `${f + 1}px` }}>Total return value</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 800, fontSize: `${f + 4}px`, color: "#1a1a2e" }}>
                          {aed(MOCK.summary.total)}
                        </td>
                      </tr>}
                  </tbody>
                </table>
                {s.showAmountInWords && <p style={{ fontSize: `${f - 0.5}px`, color: "#64748b", marginTop: 5, fontStyle: "italic" }}>
                    {amountInWords(MOCK.summary.total)}
                  </p>}
              </div>
            </div>
          </div>
        </div>}

      {
    /* ── CREDIT NOTE LINKED ── */
  }
      {s.showCreditNoteSection && <div style={{ background: `${gold}0d`, border: `1.5px solid ${gold}55`, borderRadius: 5, padding: "9px 14px", marginBottom: 14, fontSize: `${f}px` }}>
          <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, color: "#64748b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Credit Note Linked</p>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 1px", fontWeight: 700, color: "#1d4ed8" }}>{MOCK.creditNote.number}</p>
              <p style={{ margin: 0, color: "#64748b", fontSize: `${f - 0.5}px` }}>Issued {MOCK.creditNote.date}</p>
            </div>
            <div>
              <p style={{ margin: "0 0 1px", fontWeight: 700 }}>AED {MOCK.creditNote.amount.toFixed(2)}</p>
              <p style={{ margin: 0, color: "#64748b", fontSize: `${f - 0.5}px` }}>Credit amount</p>
            </div>
            <span style={{ background: `${gold}22`, color: "#92400e", border: `1px solid ${gold}88`, fontSize: `${f - 1}px`, fontWeight: 600, padding: "2px 10px", borderRadius: 12 }}>
              {MOCK.creditNote.status}
            </span>
          </div>
        </div>}

      {
    /* ── TERMS & NOTES ── */
  }
      {s.showTerms && <div style={{ marginBottom: 14, fontSize: `${f}px` }}>
          <p style={{ fontWeight: 700, marginBottom: 4, color: "#1a1a2e" }}>Notes &amp; Instructions</p>
          <p style={{ color: "#374151", lineHeight: 1.7, margin: 0 }}>{s.termsText}</p>
        </div>}

      {
    /* ── STAMP + QR ── */
  }
      {(s.showCompanyStamp || s.showQRCode) && <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 14 }}>
          {s.showCompanyStamp && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {s.stampUrl ? <img src={s.stampUrl} alt="stamp" style={{ width: 88, height: 88, objectFit: "contain" }} /> : <div style={{ width: 88, height: 88, borderRadius: "50%", border: `2px dashed ${gold}`, background: `${gold}0d`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: `${f - 1}px`, color: "#92400e", fontWeight: 700, textAlign: "center", lineHeight: 1.4 }}>Company<br />Stamp</span>
                  </div>}
              <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Official Stamp</span>
            </div>}
          {s.showQRCode && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 52, height: 52, background: "#1a1a2e", borderRadius: 4 }} />
              <span style={{ fontSize: `${f - 2}px`, color: "#94a3b8" }}>Scan to verify</span>
            </div>}
        </div>}

      {
    /* ── SIGNATURE STRIP ── */
  }
      {s.showSignatureStrip && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 0 }}>
          {["Received By\n(Warehouse)", "QC Inspector", "Approved By\n(Manager)", "Customer\nAcknowledgement"].map((label) => <div key={label} style={{ textAlign: "center" }}>
              <div style={{ borderTop: `1.5px solid ${gold}`, paddingTop: 6, fontSize: `${f - 0.5}px`, color: "#64748b", fontWeight: 600, whiteSpace: "pre-line", lineHeight: 1.4 }}>{label}</div>
            </div>)}
        </div>}

      {
    /* ── FOOTER BAR ── */
  }
      {s.showFooterBar && <div style={{ margin: "14px -32px -28px", background: gold, padding: "8px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: `${f - 1}px`, color: "rgba(26,26,46,0.75)" }}>
          <span>BillBull ERP · Printed: {MOCK.footer.printed} · User: {MOCK.footer.user} · {MOCK.grv.number}</span>
          <span>This is a computer-generated document · Page 1 of 1</span>
        </div>}
    </div>;
}
function SLabel({ label }) {
  return <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1.5 px-0.5">{label}</div>;
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
function ColorPick({ value, onChange }) {
  return <label className="flex items-center gap-1.5 cursor-pointer">
      <span className="w-5 h-5 rounded border border-slate-200 block" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      <span className="text-[10px] text-slate-500 font-mono">{value}</span>
    </label>;
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
        {value ? <div className={`shrink-0 overflow-hidden bg-slate-100 border border-slate-200 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}><img src={value} className="w-full h-full object-contain" alt="" /></div> : <div className={`shrink-0 bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400 ${shape === "circle" ? "rounded-full w-10 h-10" : "rounded w-16 h-10"}`}>{shape === "circle" ? "Stamp" : "Logo"}</div>}
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="cursor-pointer text-[10px] text-[#b08a00] font-medium hover:underline">{value ? "Change" : "Upload"} image</label>
          <input id={id} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {value && <button onClick={() => onChange("")} className="text-[10px] text-slate-400 hover:text-red-500 text-left">Remove</button>}
        </div>
      </div>
    </div>;
}
function GRVTemplateDesigner({ templateName, initialSettings, onClose, onSave }) {
  const [s, setS] = useState({
    ...defaultSettings(),
    templateName: templateName ?? "Default GRV Template",
    ...initialSettings
  });
  const [tab, setTab] = useState("style");
  const [zoom, setZoom] = useState(0.55);
  function upd(key, val) {
    setS((prev) => ({ ...prev, [key]: val }));
  }
  const TABS = [
    { id: "style", label: "Style" },
    { id: "header", label: "Header" },
    { id: "table", label: "Table" },
    { id: "footer", label: "Footer" }
  ];
  return <div className="flex flex-col min-h-screen bg-[#F0F0F3]">

      {
    /* Top bar */
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
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">GRV</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
    /* Settings panel */
  }
        <div className="w-[268px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <input
    value={s.templateName}
    onChange={(e) => upd("templateName", e.target.value)}
    className="w-full text-[11px] font-semibold border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-[#F5C742]"
    placeholder="Template name"
  />
          </div>
          <div className="flex border-b border-slate-200 shrink-0">
            {TABS.map((t) => <button
    key={t.id}
    onClick={() => setTab(t.id)}
    className={`flex-1 px-2 py-2 text-[10px] font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#F5C742] text-slate-900 bg-[#FFFBF0]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
  >
                {t.label}
              </button>)}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1.5">

            {tab === "style" && <>
              <SLabel label="Colors" />
              <Row label="Accent Color"><ColorPick value={s.accentColor} onChange={(v) => upd("accentColor", v)} /></Row>
              <SLabel label="Typography" />
              <Row label="Font Family">
                <select value={s.fontFamily} onChange={(e) => upd("fontFamily", e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none">
                  {[["Inter, sans-serif", "Inter"], ["Arial, sans-serif", "Arial"], ["Helvetica, sans-serif", "Helvetica"], ["Georgia, serif", "Georgia"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
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
              <SLabel label="Paper" />
              <Row label="Paper Size">
                <select value={s.paperSize} onChange={(e) => upd("paperSize", e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none">
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </Row>
            </>}

            {tab === "header" && <>
              <SLabel label="Company (right column)" />
              <Row label="Logo"><Toggle value={s.showLogo} onChange={(v) => upd("showLogo", v)} /></Row>
              {s.showLogo && <ImageUpload value={s.logoUrl} onChange={(v) => upd("logoUrl", v)} label="Company Logo" shape="rect" />}
              <Row label="Company Name"><Toggle value={s.showCompanyName} onChange={(v) => upd("showCompanyName", v)} /></Row>
              <Row label="Address"><Toggle value={s.showCompanyAddress} onChange={(v) => upd("showCompanyAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCompanyPhone} onChange={(v) => upd("showCompanyPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCompanyEmail} onChange={(v) => upd("showCompanyEmail", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showTRN} onChange={(v) => upd("showTRN", v)} /></Row>
              <Row label="CR Number"><Toggle value={s.showCRN} onChange={(v) => upd("showCRN", v)} /></Row>

              <SLabel label="Doc Info (middle column)" />
              <Row label="GRV Number"><Toggle value={s.showGRVNumber} onChange={(v) => upd("showGRVNumber", v)} /></Row>
              <Row label="Return Date"><Toggle value={s.showReturnDate} onChange={(v) => upd("showReturnDate", v)} /></Row>
              <Row label="Received At"><Toggle value={s.showReceivedAt} onChange={(v) => upd("showReceivedAt", v)} /></Row>
              <Row label="Status Badge"><Toggle value={s.showStatusBadge} onChange={(v) => upd("showStatusBadge", v)} /></Row>
              <Row label="Sales Order Ref"><Toggle value={s.showSalesOrderRef} onChange={(v) => upd("showSalesOrderRef", v)} /></Row>

              <SLabel label="Customer (left column)" />
              <Row label="Customer Name"><Toggle value={s.showCustomerName} onChange={(v) => upd("showCustomerName", v)} /></Row>
              <Row label="Customer Code"><Toggle value={s.showCustomerCode} onChange={(v) => upd("showCustomerCode", v)} /></Row>
              <Row label="Address"><Toggle value={s.showCustomerAddress} onChange={(v) => upd("showCustomerAddress", v)} /></Row>
              <Row label="Phone"><Toggle value={s.showCustomerPhone} onChange={(v) => upd("showCustomerPhone", v)} /></Row>
              <Row label="Email"><Toggle value={s.showCustomerEmail} onChange={(v) => upd("showCustomerEmail", v)} /></Row>
              <Row label="TRN (VAT Number)"><Toggle value={s.showCustomerTRN} onChange={(v) => upd("showCustomerTRN", v)} /></Row>

              <SLabel label="Sections" />
              <Row label="Return Reason Bar"><Toggle value={s.showReturnReason} onChange={(v) => upd("showReturnReason", v)} /></Row>
              <Row label="Reference Section"><Toggle value={s.showReferenceSection} onChange={(v) => upd("showReferenceSection", v)} /></Row>
              <Row label="Sales Invoice Ref"><Toggle value={s.showSalesInvoiceRef} onChange={(v) => upd("showSalesInvoiceRef", v)} /></Row>
            </>}

            {tab === "table" && <>
              <SLabel label="Table Columns" />
              <Row label="# Line No."><Toggle value={s.colNo} onChange={(v) => upd("colNo", v)} /></Row>
              <Row label="Item / Description"><Toggle value={s.colDescription} onChange={(v) => upd("colDescription", v)} /></Row>
              <Row label="Short Description"><Toggle value={s.showShortDescription !== false} onChange={(v) => upd("showShortDescription", v)} /></Row>
              <Row label="Detailed Description"><Toggle value={s.showDetailedDescription !== false} onChange={(v) => upd("showDetailedDescription", v)} /></Row>
              <Row label="SKU (below name)"><Toggle value={s.colSKU} onChange={(v) => upd("colSKU", v)} /></Row>
              <Row label="Batch (below name)"><Toggle value={s.colBatch} onChange={(v) => upd("colBatch", v)} /></Row>
              <Row label="Qty Original"><Toggle value={s.colQtyOriginal} onChange={(v) => upd("colQtyOriginal", v)} /></Row>
              <Row label="Qty Return"><Toggle value={s.colQtyReturn} onChange={(v) => upd("colQtyReturn", v)} /></Row>
              <Row label="Unit"><Toggle value={s.colUnit} onChange={(v) => upd("colUnit", v)} /></Row>
              <Row label="Unit Price"><Toggle value={s.colUnitPrice} onChange={(v) => upd("colUnitPrice", v)} /></Row>
              <Row label="Condition"><Toggle value={s.colCondition} onChange={(v) => upd("colCondition", v)} /></Row>
              <Row label="Disposition"><Toggle value={s.colDisposition} onChange={(v) => upd("colDisposition", v)} /></Row>
              <Row label="Return Value"><Toggle value={s.colReturnValue} onChange={(v) => upd("colReturnValue", v)} /></Row>

              <SLabel label="Inspection & Quality" />
              <Row label="Inspection Section"><Toggle value={s.showInspectionSection} onChange={(v) => upd("showInspectionSection", v)} /></Row>
              {s.showInspectionSection && <>
                <Row label="Inspection Status"><Toggle value={s.showInspectionStatus} onChange={(v) => upd("showInspectionStatus", v)} /></Row>
                <Row label="Physical Condition"><Toggle value={s.showPhysicalCondition} onChange={(v) => upd("showPhysicalCondition", v)} /></Row>
                <Row label="Stock Movement"><Toggle value={s.showStockMovement} onChange={(v) => upd("showStockMovement", v)} /></Row>
              </>}

              <SLabel label="Return Value Summary" />
              <Row label="Subtotal (excl. VAT)"><Toggle value={s.showSubtotal} onChange={(v) => upd("showSubtotal", v)} /></Row>
              <Row label="Discount"><Toggle value={s.showDiscount} onChange={(v) => upd("showDiscount", v)} /></Row>
              <Row label="Taxable Amount"><Toggle value={s.showTaxableAmount} onChange={(v) => upd("showTaxableAmount", v)} /></Row>
              <Row label="VAT Total"><Toggle value={s.showVATTotal} onChange={(v) => upd("showVATTotal", v)} /></Row>
              <Row label="Total Return Value"><Toggle value={s.showTotalReturn} onChange={(v) => upd("showTotalReturn", v)} /></Row>
              <Row label="Amount in Words"><Toggle value={s.showAmountInWords} onChange={(v) => upd("showAmountInWords", v)} /></Row>

              <SLabel label="Credit Note" />
              <Row label="Credit Note Linked"><Toggle value={s.showCreditNoteSection} onChange={(v) => upd("showCreditNoteSection", v)} /></Row>
            </>}

            {tab === "footer" && <>
              <SLabel label="Notes & Instructions" />
              <Row label="Show Notes"><Toggle value={s.showTerms} onChange={(v) => upd("showTerms", v)} /></Row>
              {s.showTerms && <textarea
    value={s.termsText}
    onChange={(e) => upd("termsText", e.target.value)}
    rows={5}
    className="w-full text-[10px] border border-slate-200 rounded px-2 py-1.5 bg-slate-50 mt-1 resize-none focus:outline-none"
  />}

              <SLabel label="Stamp & Verification" />
              <Row label="Company Stamp"><Toggle value={s.showCompanyStamp} onChange={(v) => upd("showCompanyStamp", v)} /></Row>
              {s.showCompanyStamp && <ImageUpload value={s.stampUrl} onChange={(v) => upd("stampUrl", v)} label="Stamp Image (upload PNG/SVG)" shape="circle" />}
              <Row label="QR Code (verify)"><Toggle value={s.showQRCode} onChange={(v) => upd("showQRCode", v)} /></Row>

              <SLabel label="Sign-off" />
              <Row label="Signature Strip (4 cols)"><Toggle value={s.showSignatureStrip} onChange={(v) => upd("showSignatureStrip", v)} /></Row>
              <Row label="Footer Bar"><Toggle value={s.showFooterBar} onChange={(v) => upd("showFooterBar", v)} /></Row>
            </>}

          </div>
        </div>

        {
    /* Preview */
  }
        <div className="flex-1 overflow-auto bg-slate-300 p-6">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-white/70 px-3 py-1.5 rounded-full border border-slate-200">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              Live preview — toggle settings on the left to update instantly
            </div>
            <Badge variant="outline" className="text-[10px] bg-white">{s.paperSize}</Badge>
          </div>
          <div style={{ transformOrigin: "top center", transform: `scale(${zoom})`, width: 794, marginLeft: "auto", marginRight: "auto", marginBottom: `${-(794 * (1 - zoom) * 1.414)}px` }}>
            <div style={{ width: 794, minHeight: 1123, background: "#fff", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
              <GRVPreview s={s} />
            </div>
          </div>
        </div>
      </div>
    </div>;
}
export {
  GRVTemplateDesigner
};
