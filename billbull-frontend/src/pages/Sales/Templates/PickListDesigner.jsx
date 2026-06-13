import React, { useState, useRef } from "react";
import { ArrowLeft, Save, Printer, Upload, X, Image } from "lucide-react";
const MOCK = {
  company: {
    name: "Al Noor Trading & Contracting LLC",
    address: "P.O. Box 4821, Fujairah, UAE",
    phone: "+971 9 222 1100",
    email: "info@alnoor.ae",
    trn: "100437876500003"
  },
  pick: {
    number: "PK-DXB-000145",
    printDate: "22-May-2026",
    page: "1 / 2",
    deliveryNote: "DO000245",
    salesOrder: "SO000188",
    salesInvoice: "SI000521",
    warehouse: "Main Warehouse",
    branch: "Dubai — DXB Branch"
  },
  customer: {
    name: "ABC Trading LLC",
    code: "CUS000145",
    phone: "+971 50 123 4567",
    deliveryAddress: "Dubai Investment Park,\nWarehouse 14B, Dubai"
  },
  summary: {
    items: 15,
    totalQty: "142 PCS",
    batchControlled: 9,
    zones: 4
  },
  items: [
    { seq: 1, zone: "A01", description: "Brake Pad Premium Grade Heavy Duty", shortDesc: "Ceramic brake pad set", detailedDesc: "Front axle fitment\nLow-dust compound", brand: "Brembo", barcode: "123456789", sku: "SKU-882", qtyRequired: "5 PCS", pickedQty: "5 PCS", batch: "PU29042026-L01-102-1", pickBatch: "PU29042026-L01-102-1", binLocation: "R1-S2-B4" },
    { seq: 2, zone: "A04", description: "Oil Filter Standard 8L", shortDesc: "Standard spin-on oil filter", detailedDesc: "Check gasket before packing", brand: "Mann Filter", barcode: "998877665", sku: "SKU-118", qtyRequired: "8 PCS", pickedQty: "8 PCS", batch: "PU29042026-L01-105-2", pickBatch: "PU29042026-L01-105-2", binLocation: "R2-S1-B3" },
    { seq: 3, zone: "B02", description: "Engine Coolant 5L Bottle", shortDesc: "Ready-mix coolant bottle", detailedDesc: "Pack upright\nAvoid dented containers", brand: "Prestone", barcode: "554433221", sku: "SKU-307", qtyRequired: "12 PCS", pickedQty: "10 PCS", batch: "PU30042026-L02-201-1", pickBatch: "PU30042026-L02-201-1", binLocation: "R1-S3-B2" },
    { seq: 4, zone: "B02", description: "Windshield Wiper Blade 22 inch", shortDesc: "Universal 22 inch blade", detailedDesc: "Left side application", brand: "Bosch", barcode: "776655443", sku: "SKU-441", qtyRequired: "20 PCS", pickedQty: "20 PCS", batch: "PU01052026-L01-089-3", pickBatch: "PU01052026-L01-089-3", binLocation: "R3-S1-B6" },
    { seq: 5, zone: "C03", description: "Spark Plug Iridium Set of 4", shortDesc: "Iridium plug pack", detailedDesc: "Set of four\nVerify heat range", brand: "NGK", barcode: "332211009", sku: "SKU-659", qtyRequired: "10 SET", pickedQty: "10 SET", batch: "PU28042026-L03-112-2", pickBatch: "PU28042026-L03-112-2", binLocation: "R2-S4-B1" }
  ],
  pickRoute: ["A01", "A04", "B02", "Packing Area"]
};
function defaultPickListSettings(name = "Default Pick List") {
  return {
    templateName: name,
    accentColor: "#F5C742",
    fontFamily: "Inter, sans-serif",
    fontSize: 9,
    paperSize: "A4",
    showLogo: true,
    logoUrl: "",
    showCompanyName: true,
    showCompanyAddress: true,
    showCompanyPhone: true,
    showCompanyEmail: false,
    showTRN: true,
    showPickNumber: true,
    showPrintDate: true,
    showPageNumber: true,
    showDeliveryNoteRef: true,
    showSalesOrderRef: true,
    showWarehouse: true,
    showBranchOutlet: true,
    showCustomerName: true,
    showCustomerCode: true,
    showCustomerPhone: true,
    showDeliveryAddress: true,
    showSalesInvoiceRef: true,
    showPriorityBadge: true,
    showSummaryCards: true,
    colSubZone: true,
    colSubBarcode: true,
    colSubSKU: true,
    colSubBrand: true,
    colSubBinLocation: true,
    colSeq: true,
    colDescription: true,
    showShortDescription: true,
    showDetailedDescription: true,
    colQtyRequired: true,
    colBatch: true,
    colPickedQty: true,
    colPickBatch: true,
    showPickRoute: true,
    showBarcodeSection: true,
    showWarehouseNotes: true,
    showPackingVerification: true,
    showSignatureStrip: true,
    showCompanyStamp: false,
    stampUrl: "",
    showFooterBar: true
  };
}
function Toggle({ label, checked, onChange }) {
  return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", cursor: "pointer" }}>
    <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
    <div onClick={() => onChange(!checked)} style={{ width: 36, height: 20, borderRadius: 10, background: checked ? "#F5C742" : "#D1D5DB", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: checked ? 18 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  </label>;
}
function SLabel({ children }) {
  return <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.8, margin: "14px 0 6px" }}>{children}</p>;
}

function ImageUploadField({ label, value, onChange, onRemove, placeholder = "Click to upload" }) {
  const ref = useRef(null);
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 12, color: "#374151", marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {value ? (
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", background: "#FAFAFA" }}>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <img src={value} alt={label} style={{ height: 48, maxWidth: 100, objectFit: "contain", borderRadius: 4, border: "1px solid #E5E7EB", background: "#fff" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, color: "#6B7280", marginBottom: 6 }}>Image uploaded</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => ref.current?.click()}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151", fontWeight: 600 }}
                >
                  <Image size={11} /> Replace
                </button>
                <button
                  onClick={onRemove}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11, border: "1px solid #FCA5A5", borderRadius: 6, background: "#FEF2F2", cursor: "pointer", color: "#DC2626", fontWeight: 600 }}
                >
                  <X size={11} /> Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => ref.current?.click()}
          style={{ border: "2px dashed #E5E7EB", borderRadius: 8, padding: "14px 12px", cursor: "pointer", textAlign: "center", background: "#FAFAFA", transition: "border-color 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#F5C742"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#E5E7EB"}
        >
          <Upload size={16} style={{ margin: "0 auto 4px", display: "block", color: "#9CA3AF" }} />
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{placeholder}</p>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => onChange(ev.target.result);
          reader.readAsDataURL(file);
          e.target.value = "";
        }
      }} />
    </div>
  );
}

function PickListPreview({ s }) {
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
  const tdS = (center = false) => ({
    padding: "5px 7px",
    fontSize: `${f}px`,
    color: "#374151",
    borderBottom: `1px solid ${gold}22`,
    textAlign: center ? "center" : "left",
    verticalAlign: "top"
  });
  const metaItems = [
    s.showPickNumber && ["Pick List No.", MOCK.pick.number],
    s.showPrintDate && ["Print Date", MOCK.pick.printDate],
    s.showPageNumber && ["Page", MOCK.pick.page],
    s.showDeliveryNoteRef && ["Delivery Note", MOCK.pick.deliveryNote],
    s.showSalesOrderRef && ["Sales Order", MOCK.pick.salesOrder],
    s.showWarehouse && ["Warehouse", MOCK.pick.warehouse],
    s.showBranchOutlet && ["Branch / Outlet", MOCK.pick.branch]
  ].filter(Boolean);

  const showPickRouteBarcode = s.showPickRoute || s.showBarcodeSection;
  const bothVisible = s.showPickRoute && s.showBarcodeSection;

  return <div style={{ fontFamily: s.fontFamily, fontSize: `${f}px`, background: "#fff", color: "#333", padding: "28px 32px", position: "relative" }}>

    {/* ── HEADER ── */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16 }}>

      {/* COL 1: Title + Customer (Delivering To) */}
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: `${f + 17}px`, fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px 0", letterSpacing: "-0.5px" }}>
          PICK LIST
        </h1>
        {s.showCustomerName && <div>
          <p style={{ fontWeight: 700, fontSize: `${f - 0.5}px`, marginBottom: 4, color: "#888", letterSpacing: 0.5, textTransform: "uppercase" }}>Delivering To</p>
          <p style={{ fontWeight: 700, fontSize: `${f + 1}px`, marginBottom: 2 }}>{MOCK.customer.name}</p>
          {s.showCustomerCode && <p style={{ color: "#64748b", fontSize: `${f - 0.5}px`, margin: "1px 0" }}>{MOCK.customer.code}</p>}
          {s.showDeliveryAddress && <p style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "#444", margin: 0 }}>{MOCK.customer.deliveryAddress}</p>}
          {s.showCustomerPhone && <p style={{ marginTop: 3, color: "#555" }}>{MOCK.customer.phone}</p>}
        </div>}
      </div>

      {/* COL 2: Doc meta grid */}
      {metaItems.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", alignSelf: "flex-end", paddingBottom: 2 }}>
          {metaItems.map(([label, val], i) => <div key={i}>
            <p style={{ margin: 0, fontSize: `${f - 1}px`, color: "#999", fontWeight: 500 }}>{label}</p>
            <p style={{ margin: "1px 0 0", fontSize: `${f}px`, fontWeight: 700, color: "#1a1a2e" }}>{val}</p>
          </div>)}
        </div>
      )}

      {/* COL 3: Logo + Company */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        {s.showLogo && (
          s.logoUrl
            ? <img src={s.logoUrl} alt="logo" style={{ height: 72, objectFit: "contain" }} />
            : <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${gold}22`, border: `3px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: gold }}>G</span>
              </div>
        )}
        {s.showCompanyName && <div style={{ textAlign: "right", lineHeight: 1.55 }}>
          <p style={{ fontWeight: 700, fontSize: `${f + 3}px`, color: "#1a1a2e", margin: 0 }}>{MOCK.company.name}</p>
          {s.showCompanyAddress && <p style={{ margin: 0, color: "#555", whiteSpace: "pre-line" }}>{MOCK.company.address}</p>}
          {s.showCompanyPhone && <p style={{ margin: 0 }}>{MOCK.company.phone}</p>}
          {s.showCompanyEmail && <p style={{ margin: 0 }}>{MOCK.company.email}</p>}
          {s.showTRN && <p style={{ margin: 0, color: "#666" }}>TRN · {MOCK.company.trn}</p>}
        </div>}
      </div>
    </div>

    {/* ── GOLD SEPARATOR ── */}
    <div style={{ height: 3, background: gold, borderRadius: 2, marginBottom: 14 }} />

    {/* ── INFO CARDS ── */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
      <div style={{ background: `${gold}0d`, border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px" }}>
        <p style={{ fontSize: `${f - 0.5}px`, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 }}>Customer · Delivery</p>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: `${f}px` }}>
          <span style={{ color: "#888", fontWeight: 600 }}>Customer:</span><span style={{ fontWeight: 700, color: "#1a1a2e" }}>{MOCK.customer.name}</span>
          {s.showCustomerCode && <><span style={{ color: "#888" }}>Code:</span><span>{MOCK.customer.code}</span></>}
          {s.showCustomerPhone && <><span style={{ color: "#888" }}>Mobile:</span><span>{MOCK.customer.phone}</span></>}
          {s.showDeliveryAddress && <><span style={{ color: "#888" }}>Delivery:</span><span style={{ lineHeight: 1.5 }}>{MOCK.customer.deliveryAddress.replace("\n", " ")}</span></>}
        </div>
      </div>
      <div style={{ background: `${gold}0d`, border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px" }}>
        <p style={{ fontSize: `${f - 0.5}px`, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 }}>Document References</p>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: `${f}px` }}>
          {s.showDeliveryNoteRef && <><span style={{ color: "#888" }}>Delivery Note:</span><span style={{ fontWeight: 700, color: "#1a1a2e" }}>{MOCK.pick.deliveryNote}</span></>}
          {s.showSalesOrderRef && <><span style={{ color: "#888" }}>Sales Order:</span><span style={{ fontWeight: 700 }}>{MOCK.pick.salesOrder}</span></>}
          {s.showSalesInvoiceRef && <><span style={{ color: "#888" }}>Ref Invoice:</span><span>{MOCK.pick.salesInvoice}</span></>}
          {s.showWarehouse && <><span style={{ color: "#888" }}>Warehouse:</span><span>{MOCK.pick.warehouse}</span></>}
        </div>
        {s.showPriorityBadge && <div style={{ marginTop: 9 }}>
          <span style={{ background: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5", fontSize: `${f - 1}px`, fontWeight: 700, padding: "3px 10px", borderRadius: 12 }}>
            HIGH PRIORITY
          </span>
        </div>}
      </div>
    </div>

    {/* ── SUMMARY CARDS ── */}
    {s.showSummaryCards && <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
      {[
        { label: "Items", value: String(MOCK.summary.items) },
        { label: "Total Qty", value: MOCK.summary.totalQty },
        { label: "Batch Controlled", value: `${MOCK.summary.batchControlled} Items` },
        { label: "Warehouse Zones", value: String(MOCK.summary.zones) }
      ].map((card, i) => <div key={i} style={{ background: `${gold}12`, border: `1px solid ${gold}55`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: `${f + 6}px`, fontWeight: 800, color: "#1a1a2e" }}>{card.value}</p>
        <p style={{ margin: "3px 0 0", fontSize: `${f - 1}px`, color: "#888", fontWeight: 500 }}>{card.label}</p>
      </div>)}
    </div>}

    {/* ── PICK TABLE ── */}
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: `${f}px`, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Pick List Items</p>
      <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${gold}44` }}>
        <thead>
          <tr>
            {s.colSeq && <th style={thS}>#</th>}
            {s.colDescription && <th style={{ ...thS, minWidth: 160 }}>Item / Description</th>}
            {s.colQtyRequired && <th style={{ ...thS, textAlign: "center" }}>Qty Req.</th>}
            {s.colBatch && <th style={thS}>Batch / Lot</th>}
            {s.colPickedQty && <th style={{ ...thS, textAlign: "center", minWidth: 65 }}>Picked Qty</th>}
            {s.colPickBatch && <th style={{ ...thS, minWidth: 110 }}>Pick Batch</th>}
          </tr>
        </thead>
        <tbody>
          {MOCK.items.map((item, idx) => <tr key={item.seq} style={{ background: idx % 2 === 1 ? `${gold}08` : "#fff" }}>
            {s.colSeq && <td style={{ ...tdS(true), fontWeight: 700, color: "#888" }}>{item.seq}</td>}

            {s.colDescription && <td style={tdS()}>
              <p style={{ margin: 0, fontWeight: 700, color: "#1a1a2e", fontSize: `${f}px` }}>{item.description}</p>
              {s.showShortDescription !== false && item.shortDesc && <p style={{ margin: "2px 0 0", color: "#475569", fontSize: `${f - 1}px` }}>{item.shortDesc}</p>}
              {s.showDetailedDescription !== false && item.detailedDesc && <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: `${f - 1}px`, fontStyle: "italic", whiteSpace: "pre-line" }}>{item.detailedDesc}</p>}
              <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
                {s.colSubZone && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: `${f - 1.5}px`, color: "#9CA3AF", fontWeight: 600, width: 42, flexShrink: 0 }}>Zone</span>
                  <span style={{ fontSize: `${f - 1}px`, fontWeight: 700, color: "#92400e", background: `${gold}28`, border: `1px solid ${gold}88`, borderRadius: 4, padding: "0px 6px" }}>{item.zone}</span>
                </div>}
                {s.colSubBarcode && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: `${f - 1.5}px`, color: "#9CA3AF", fontWeight: 600, width: 42, flexShrink: 0 }}>Barcode</span>
                  <span style={{ fontSize: `${f - 1}px`, fontFamily: "monospace", color: "#374151", fontWeight: 600 }}>{item.barcode}</span>
                </div>}
                {s.colSubSKU && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: `${f - 1.5}px`, color: "#9CA3AF", fontWeight: 600, width: 42, flexShrink: 0 }}>SKU</span>
                  <span style={{ fontSize: `${f - 1}px`, fontFamily: "monospace", color: "#1D4ED8", fontWeight: 700 }}>{item.sku}</span>
                </div>}
                {s.colSubBrand && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: `${f - 1.5}px`, color: "#9CA3AF", fontWeight: 600, width: 42, flexShrink: 0 }}>Brand</span>
                  <span style={{ fontSize: `${f - 1}px`, color: "#15803D", fontWeight: 600 }}>{item.brand}</span>
                </div>}
                {s.colSubBinLocation && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: `${f - 1.5}px`, color: "#9CA3AF", fontWeight: 600, width: 42, flexShrink: 0 }}>Bin</span>
                  <span style={{ fontSize: `${f - 1}px`, fontFamily: "monospace", color: "#92400e", fontWeight: 700 }}>{item.binLocation}</span>
                </div>}
              </div>
            </td>}

            {s.colQtyRequired && <td style={{ ...tdS(true), fontWeight: 700, color: "#1a1a2e" }}>{item.qtyRequired}</td>}
            {s.colBatch && <td style={{ ...tdS(), fontFamily: "monospace", fontSize: `${f - 1}px`, color: "#6B7280" }}>{item.batch}</td>}
            {s.colPickedQty && <td style={{ ...tdS(true) }}>
              <p style={{ margin: 0, fontWeight: 700, color: item.pickedQty === item.qtyRequired ? "#15803D" : "#DC2626", fontSize: `${f}px` }}>
                {item.pickedQty}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: `${f - 2}px`, color: "#9CA3AF" }}>
                {item.pickedQty === item.qtyRequired ? "Full" : "Partial"}
              </p>
            </td>}
            {s.colPickBatch && <td style={tdS()}>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: `${f - 1}px`, color: "#374151", fontWeight: 600 }}>{item.pickBatch}</p>
              <p style={{ margin: "2px 0 0", fontSize: `${f - 2}px`, color: "#9CA3AF" }}>Scanned</p>
            </td>}
          </tr>)}
        </tbody>
      </table>
    </div>

    {/* ── PICK ROUTE + BARCODE ── */}
    {showPickRouteBarcode && (
      <div style={{ display: "grid", gridTemplateColumns: bothVisible ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 14 }}>
        {s.showPickRoute && <div style={{ background: `${gold}10`, border: `1.5px solid ${gold}66`, borderRadius: 8, padding: "12px 14px" }}>
          <p style={{ fontSize: `${f}px`, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Suggested Pick Route</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            {MOCK.pickRoute.map((stop, i) => <React.Fragment key={stop}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === MOCK.pickRoute.length - 1 ? "#10B981" : gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: `${f - 0.5}px`, fontWeight: 800, color: "#fff" }}>{i === MOCK.pickRoute.length - 1 ? "✓" : i + 1}</span>
                </div>
                <span style={{ fontSize: `${f}px`, fontWeight: 700, color: "#1a1a2e" }}>{stop}</span>
              </div>
              {i < MOCK.pickRoute.length - 1 && <div style={{ width: 26, display: "flex", justifyContent: "center" }}>
                <span style={{ fontSize: `${f + 2}px`, color: "#9CA3AF", lineHeight: 1 }}>↓</span>
              </div>}
            </React.Fragment>)}
          </div>
        </div>}

        {s.showBarcodeSection && <div style={{ border: `1px solid ${gold}44`, borderRadius: 8, padding: "12px 14px" }}>
          <p style={{ fontSize: `${f}px`, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Barcode Verification</p>
          {[
            { label: "Delivery Note", ref: MOCK.pick.deliveryNote },
            { label: "Pick List", ref: MOCK.pick.number }
          ].map((bc) => <div key={bc.label} style={{ marginBottom: 10 }}>
            <p style={{ fontSize: `${f - 1}px`, color: "#9CA3AF", marginBottom: 4 }}>{bc.label}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 1 }}>
                {Array.from({ length: 32 }).map((_, i) => <div key={i} style={{ width: i % 3 === 0 ? 3 : i % 5 === 0 ? 1 : 2, height: 26, background: i % 7 === 0 ? "#fff" : "#374151" }} />)}
              </div>
              <span style={{ fontSize: `${f - 1}px`, fontFamily: "monospace", color: "#555", whiteSpace: "nowrap" }}>{bc.ref}</span>
            </div>
          </div>)}
        </div>}
      </div>
    )}

    {/* ── WAREHOUSE NOTES ── */}
    {s.showWarehouseNotes && <div style={{ border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
      <p style={{ fontSize: `${f}px`, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Warehouse Notes</p>
      <div style={{ borderBottom: "1px solid #E5E7EB", marginBottom: 8, height: 18 }} />
      <div style={{ borderBottom: "1px solid #E5E7EB", height: 18 }} />
    </div>}

    {/* ── PACKING VERIFICATION ── */}
    {s.showPackingVerification && <div style={{ border: `1px solid ${gold}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
      <p style={{ fontSize: `${f}px`, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Packing Verification</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {["Packed By", "Verified By", "Dispatch Team"].map((role) => <div key={role} style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1px solid #374151", marginBottom: 5, height: 24 }} />
          <p style={{ fontSize: `${f - 0.5}px`, color: "#555", fontWeight: 600 }}>{role}</p>
        </div>)}
      </div>
    </div>}

    {/* ── SIGNATURE STRIP + STAMP ── */}
    {(s.showSignatureStrip || s.showCompanyStamp) && <div style={{ display: "flex", gap: 20, alignItems: "flex-end", marginBottom: 14 }}>
      {s.showSignatureStrip && <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {["Prepared By", "Picked By", "Verified By"].map((role) => <div key={role} style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1.5px solid #374151", marginBottom: 5, height: 32 }} />
          <p style={{ fontSize: `${f - 0.5}px`, color: "#374151", fontWeight: 600 }}>{role}</p>
          <p style={{ fontSize: `${f - 1.5}px`, color: "#9CA3AF" }}>Name / Signature / Date</p>
        </div>)}
      </div>}
      {s.showCompanyStamp && <div style={{ textAlign: "center", flexShrink: 0 }}>
        {s.stampUrl
          ? <img src={s.stampUrl} alt="stamp" style={{ width: 80, height: 80, objectFit: "contain" }} />
          : <div style={{ width: 80, height: 80, borderRadius: "50%", border: `2px dashed ${gold}`, display: "flex", alignItems: "center", justifyContent: "center", background: `${gold}0a` }}>
              <span style={{ fontSize: `${f - 1}px`, color: "#92400e", fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>Company<br />Stamp</span>
            </div>}
        <p style={{ fontSize: `${f - 1}px`, color: "#9CA3AF", marginTop: 4 }}>Official Stamp</p>
      </div>}
    </div>}

    {/* ── FOOTER BAR ── */}
    {s.showFooterBar && <div style={{ background: `${gold}14`, borderTop: `2px solid ${gold}`, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "0 0 4px 4px" }}>
      <span style={{ fontSize: `${f - 1}px`, color: "#888" }}>Generated from Delivery Note {MOCK.pick.deliveryNote}</span>
      <span style={{ fontSize: `${f - 1}px`, color: "#888" }}>System Generated Document</span>
      <span style={{ fontSize: `${f - 1}px`, fontWeight: 700, color: "#1a1a2e" }}>BillBull Retail OS</span>
    </div>}
  </div>;
}
function PickListDesigner({ templateName, initialSettings = {}, onClose, onSave }) {
  const [s, setS] = useState({ ...defaultPickListSettings(templateName), ...initialSettings });
  const [tab, setTab] = useState("style");
  const [zoom, setZoom] = useState(0.7);
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const tabs = [
    { id: "style", label: "Style" },
    { id: "header", label: "Header" },
    { id: "table", label: "Table" },
    { id: "footer", label: "Footer" }
  ];
  return <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#F8F9FA", fontFamily: "Inter, sans-serif" }}>
    {/* Top bar */}
    <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B7280", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <span style={{ color: "#D1D5DB" }}>|</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#111827" }}>{s.templateName}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>Pick List Template Designer</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 13, color: "#374151" }}>
          <Printer size={14} /> Print Preview
        </button>
        <button onClick={() => onSave(s)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "#F5C742", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          <Save size={14} /> Save Template
        </button>
      </div>
    </div>

    {/* Body */}
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Settings panel */}
      <div style={{ width: 280, background: "#fff", borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
          {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 4px", fontSize: 12, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#111827" : "#9CA3AF", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #F5C742" : "2px solid transparent", cursor: "pointer" }}>
            {t.label}
          </button>)}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
          {tab === "style" && <>
            <SLabel>Template Name</SLabel>
            <input value={s.templateName} onChange={(e) => set({ templateName: e.target.value })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }} />

            <SLabel>Accent Color</SLabel>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={s.accentColor} onChange={(e) => set({ accentColor: e.target.value })} style={{ width: 40, height: 36, border: "1px solid #E5E7EB", borderRadius: 7, cursor: "pointer", padding: 2 }} />
              <input value={s.accentColor} onChange={(e) => set({ accentColor: e.target.value })} style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 13, fontFamily: "monospace" }} />
            </div>

            <SLabel>Font Size: {s.fontSize}px</SLabel>
            <input type="range" min={7} max={12} step={0.5} value={s.fontSize} onChange={(e) => set({ fontSize: parseFloat(e.target.value) })} style={{ width: "100%" }} />

            <SLabel>Paper Size</SLabel>
            <select value={s.paperSize} onChange={(e) => set({ paperSize: e.target.value })} style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 13 }}>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </select>

            <SLabel>Sections</SLabel>
            <Toggle label="Summary Cards" checked={s.showSummaryCards} onChange={(v) => set({ showSummaryCards: v })} />
            <Toggle label="Pick Route Suggestion" checked={s.showPickRoute} onChange={(v) => set({ showPickRoute: v })} />
            <Toggle label="Barcode Verification" checked={s.showBarcodeSection} onChange={(v) => set({ showBarcodeSection: v })} />
            <Toggle label="Warehouse Notes" checked={s.showWarehouseNotes} onChange={(v) => set({ showWarehouseNotes: v })} />
            <Toggle label="Packing Verification" checked={s.showPackingVerification} onChange={(v) => set({ showPackingVerification: v })} />
            <Toggle label="Signature Strip" checked={s.showSignatureStrip} onChange={(v) => set({ showSignatureStrip: v })} />
            <Toggle label="Footer Bar" checked={s.showFooterBar} onChange={(v) => set({ showFooterBar: v })} />
          </>}

          {tab === "header" && <>
            <SLabel>Company (Right Column)</SLabel>
            <Toggle label="Logo" checked={s.showLogo} onChange={(v) => set({ showLogo: v })} />
            {s.showLogo && (
              <ImageUploadField
                label="Company Logo"
                value={s.logoUrl}
                onChange={(url) => set({ logoUrl: url })}
                onRemove={() => set({ logoUrl: "" })}
                placeholder="Upload logo image"
              />
            )}
            <Toggle label="Company Name" checked={s.showCompanyName} onChange={(v) => set({ showCompanyName: v })} />
            <Toggle label="Address" checked={s.showCompanyAddress} onChange={(v) => set({ showCompanyAddress: v })} />
            <Toggle label="Phone" checked={s.showCompanyPhone} onChange={(v) => set({ showCompanyPhone: v })} />
            <Toggle label="Email" checked={s.showCompanyEmail} onChange={(v) => set({ showCompanyEmail: v })} />
            <Toggle label="TRN" checked={s.showTRN} onChange={(v) => set({ showTRN: v })} />

            <SLabel>Document Meta (Center Grid)</SLabel>
            <Toggle label="Pick Number" checked={s.showPickNumber} onChange={(v) => set({ showPickNumber: v })} />
            <Toggle label="Print Date" checked={s.showPrintDate} onChange={(v) => set({ showPrintDate: v })} />
            <Toggle label="Page Number" checked={s.showPageNumber} onChange={(v) => set({ showPageNumber: v })} />
            <Toggle label="Delivery Note Ref" checked={s.showDeliveryNoteRef} onChange={(v) => set({ showDeliveryNoteRef: v })} />
            <Toggle label="Sales Order Ref" checked={s.showSalesOrderRef} onChange={(v) => set({ showSalesOrderRef: v })} />
            <Toggle label="Warehouse" checked={s.showWarehouse} onChange={(v) => set({ showWarehouse: v })} />
            <Toggle label="Branch / Outlet" checked={s.showBranchOutlet} onChange={(v) => set({ showBranchOutlet: v })} />

            <SLabel>Customer (Left Column)</SLabel>
            <Toggle label="Customer Name" checked={s.showCustomerName} onChange={(v) => set({ showCustomerName: v })} />
            <Toggle label="Customer Code" checked={s.showCustomerCode} onChange={(v) => set({ showCustomerCode: v })} />
            <Toggle label="Phone" checked={s.showCustomerPhone} onChange={(v) => set({ showCustomerPhone: v })} />
            <Toggle label="Delivery Address" checked={s.showDeliveryAddress} onChange={(v) => set({ showDeliveryAddress: v })} />

            <SLabel>Info Cards</SLabel>
            <Toggle label="Sales Invoice Ref" checked={s.showSalesInvoiceRef} onChange={(v) => set({ showSalesInvoiceRef: v })} />
            <Toggle label="Priority Badge" checked={s.showPriorityBadge} onChange={(v) => set({ showPriorityBadge: v })} />
          </>}

          {tab === "table" && <>
            <SLabel>Table Columns</SLabel>
            <Toggle label="Seq #" checked={s.colSeq} onChange={(v) => set({ colSeq: v })} />
            <Toggle label="Item Name" checked={s.colDescription} onChange={(v) => set({ colDescription: v })} />
            <Toggle label="Short Description" checked={s.showShortDescription !== false} onChange={(v) => set({ showShortDescription: v })} />
            <Toggle label="Detailed Description" checked={s.showDetailedDescription !== false} onChange={(v) => set({ showDetailedDescription: v })} />
            <Toggle label="Qty Required" checked={s.colQtyRequired} onChange={(v) => set({ colQtyRequired: v })} />
            <Toggle label="Batch / Lot" checked={s.colBatch} onChange={(v) => set({ colBatch: v })} />
            <Toggle label="Picked Qty" checked={s.colPickedQty} onChange={(v) => set({ colPickedQty: v })} />
            <Toggle label="Pick Batch" checked={s.colPickBatch} onChange={(v) => set({ colPickBatch: v })} />

            <SLabel>Item Sub-info (line by line below name)</SLabel>
            <Toggle label="Zone" checked={s.colSubZone} onChange={(v) => set({ colSubZone: v })} />
            <Toggle label="Barcode" checked={s.colSubBarcode} onChange={(v) => set({ colSubBarcode: v })} />
            <Toggle label="SKU" checked={s.colSubSKU} onChange={(v) => set({ colSubSKU: v })} />
            <Toggle label="Brand" checked={s.colSubBrand} onChange={(v) => set({ colSubBrand: v })} />
            <Toggle label="Bin Location" checked={s.colSubBinLocation} onChange={(v) => set({ colSubBinLocation: v })} />
          </>}

          {tab === "footer" && <>
            <SLabel>Company Stamp</SLabel>
            <Toggle label="Show Company Stamp" checked={s.showCompanyStamp} onChange={(v) => set({ showCompanyStamp: v })} />
            {s.showCompanyStamp && (
              <ImageUploadField
                label="Stamp Image"
                value={s.stampUrl}
                onChange={(url) => set({ stampUrl: url })}
                onRemove={() => set({ stampUrl: "" })}
                placeholder="Upload stamp image"
              />
            )}
            <SLabel>Footer</SLabel>
            <Toggle label="Footer Bar" checked={s.showFooterBar} onChange={(v) => set({ showFooterBar: v })} />
          </>}
        </div>
      </div>

      {/* Preview */}
      <div style={{ flex: 1, overflow: "auto", background: "#F0F0F0", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6B7280" }}>Zoom:</span>
          {[0.5, 0.65, 0.8, 1].map((z) => <button key={z} onClick={() => setZoom(z)} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #E5E7EB", background: zoom === z ? "#F5C742" : "#fff", cursor: "pointer", fontWeight: zoom === z ? 700 : 400 }}>
            {Math.round(z * 100)}%
          </button>)}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: 794, background: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.12)", borderRadius: 4 }}>
            <PickListPreview s={s} />
          </div>
        </div>
      </div>
    </div>
  </div>;
}
export {
  PickListDesigner,
  defaultPickListSettings
};
