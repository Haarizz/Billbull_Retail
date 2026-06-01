import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from "./PurchaseTemplateUI";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Download,
  Eye,
  Save,
  Building2,
  Phone,
  Mail,
  Globe,
  Package,
  FileText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Palette,
  MapPin,
  Hash,
  Calendar,
  User,
  Stamp,
  CheckCircle,
  Upload,
  Warehouse,
  Truck,
  ClipboardCheck,
  BarChart3
} from "lucide-react";
const defaultSettings = {
  templateName: "Default GRN Template",
  fontFamily: "DM Sans",
  fontSize: "11",
  fontColor: "#0f1923",
  headerFontSize: "22",
  accentColor: "#F5C742",
  backgroundColor: "#FFFFFF",
  headerBackgroundColor: "#F5C742",
  footerBackgroundColor: "#0f1923",
  tableHeaderColor: "#0f1923",
  companyDetailsAlign: "left",
  vendorDetailsAlign: "left",
  tableHeaderAlign: "left",
  showCompanyLogo: true,
  showCompanyName: true,
  showCompanyAddress: true,
  showCompanyPhone: true,
  showCompanyEmail: true,
  showCompanyWebsite: true,
  showCompanyTaxId: true,
  showCompanyRegNumber: true,
  showGRNNumber: true,
  showGRNDate: true,
  showBranch: true,
  showWarehouse: true,
  showStatusBadge: true,
  showVendorCard: true,
  showVendorName: true,
  showVendorCode: true,
  showVendorContact: true,
  showVendorMobile: true,
  showVendorTRN: true,
  showPOCard: true,
  showLPONumber: true,
  showSupplierInvoice: true,
  showDeliveryNote: true,
  showVehicleNo: true,
  showReceivedBy: true,
  showSummaryBar: true,
  showOrderedQtyPill: true,
  showReceivedQtyPill: true,
  showPendingQtyPill: true,
  showDamagedQtyPill: true,
  showItemsTable: true,
  showLineNumber: true,
  showItemDescription: true,
  showBarcode: true,
  showOrderedQty: true,
  showReceivedQty: true,
  showDamagedQty: true,
  showBatchNo: true,
  showExpiry: true,
  showBinLocation: true,
  showBatchTable: true,
  showDamageTable: true,
  showQCTable: true,
  showInventoryImpact: true,
  showNotes: true,
  notesText: "Items received in two separate truck loads. First load at 09:30 GST, second at 14:15 GST. All LPO items cross-checked with delivery note DN-778. Logitech short delivery acknowledged by driver \u2014 partial delivery note signed.",
  showSignatures: true,
  showPreparedBy: true,
  showWarehouseIncharge: true,
  showQCOfficer: true,
  showVendorRep: true,
  showDocFooter: true,
  showTermsConditions: true,
  termsConditions: "1. Goods received subject to inspection and acceptance.\n2. Any discrepancy must be reported within 24 hours.\n3. This GRN is not a payment authorization.",
  showQRCode: true,
  qrCodeContent: "https://billbull.app/verify/grn",
  showStamp: true,
  stampImage: "",
  showWatermark: false,
  watermarkText: "RECEIVED",
  watermarkOpacity: "0.1",
  showPageNumbers: true,
  paperSize: "A4",
  orientation: "portrait",
  marginTop: "0",
  marginBottom: "0",
  marginLeft: "0",
  marginRight: "0"
};
const fontFamilies = ["DM Sans", "Inter", "Arial", "Helvetica", "Times New Roman", "Georgia", "Roboto", "Open Sans", "Poppins", "Lato", "Montserrat"];
function GRNPreview({ settings: s }) {
  const ITEMS = [
    { n: "01", name: 'Samsung Galaxy Tab A8 10.5"', sku: "SAM-TAB-A8-64G", part: "SM-X200NZAAMEA", cat: "Tablets / Electronics", spec: "64GB, WiFi, Space Grey", barcode: "8806094792195", ord: 80, rec: 80, dmg: 0, batch: "BT-240501", exp: "Dec-2027", bin: "A-01-B3", expWarn: false },
    { n: "02", name: "Apple AirPods Pro 2nd Gen", sku: "APP-AIRP-PRO2", part: "MQTP3ZP/A", cat: "Audio / Accessories", spec: "White, USB-C, Active Noise Cancellation", barcode: "194253401308", ord: 60, rec: 58, dmg: 2, batch: "BT-240483", exp: "Jun-2028", bin: "A-02-C1", expWarn: false },
    { n: "03", name: "Logitech MX Master 3S Mouse", sku: "LOG-MXM-3S-BLK", part: "910-006556", cat: "Peripherals / Input Devices", spec: "Wireless Bluetooth, Black, 8000 DPI", barcode: "097855175687", ord: 110, rec: 100, dmg: 3, batch: "BT-240399", exp: "Mar-2026", bin: "B-04-A2", expWarn: true }
  ];
  const sl = (text) => <div style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: "1.8px", textTransform: "uppercase", color: "#6b7a8a", margin: "20px 0 8px", display: "flex", alignItems: "center", gap: "8px" }}>
      {text}
      <span style={{ flex: 1, height: "1px", background: "#dde2e8", display: "block" }} />
    </div>;
  const kv = (k, v, mono = false) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid #dde2e8", gap: "8px" }}>
      <span style={{ color: "#6b7a8a", whiteSpace: "nowrap", flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 500, color: mono ? "#1040b0" : "#0f1923", textAlign: "right", fontFamily: mono ? "monospace" : "inherit", fontSize: mono ? "11px" : "inherit" }}>{v}</span>
    </div>;
  const passB = <span style={{ background: "#e6f7f0", color: "#0d7a4e", border: "1px solid #9de8c8", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 600 }}>✓ Passed</span>;
  const warnB = <span style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fbbf24", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 600 }}>⚠ Partial</span>;
  const goodB = <span style={{ background: "#e6f7f0", color: "#0d7a4e", border: "1px solid #9de8c8", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 600 }}>✓ Good</span>;
  const nearB = <span style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fbbf24", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 600 }}>⚠ Near Expiry</span>;
  return <div style={{ background: s.backgroundColor, fontFamily: s.fontFamily === "DM Sans" ? "'DM Sans', sans-serif" : s.fontFamily, fontSize: `${s.fontSize}pt`, color: s.fontColor, lineHeight: 1.5, width: s.paperSize === "A4" ? "210mm" : s.paperSize === "Letter" ? "215.9mm" : "148mm", margin: "0 auto", boxShadow: "0 4px 24px rgba(0,0,0,0.12)", borderRadius: "10px", overflow: "hidden", border: "1px solid #dde2e8" }}>
      {s.showWatermark && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", opacity: parseFloat(s.watermarkOpacity), fontSize: "72pt", fontWeight: "bold", color: "#CCCCCC", transform: "rotate(-45deg)" }}>{s.watermarkText}</div>}

      {
    /* Header — gold left + dark-overlay right (same structure as quotation) */
  }
      <div style={{ backgroundColor: s.headerBackgroundColor, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "stretch" }}>
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: "6px", textAlign: s.companyDetailsAlign }}>
          {s.showCompanyLogo && <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <div style={{ width: "38px", height: "38px", background: "rgba(0,0,0,0.15)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Building2 size={20} color="#0f1923" />
              </div>
              {s.showCompanyName && <div>
                  <div style={{ fontSize: `${s.headerFontSize}px`, fontWeight: 600, color: "#0f1923", letterSpacing: "-0.5px" }}>BillBull</div>
                  <div style={{ fontSize: "10px", color: "rgba(0,0,0,0.5)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Retail OS</div>
                </div>}
            </div>}
          <div style={{ fontSize: "11px", color: "rgba(0,0,0,0.6)", lineHeight: 1.7, marginTop: "4px" }}>
            {s.showCompanyAddress && <div><strong style={{ color: "rgba(0,0,0,0.75)" }}>Acme Retail Trading LLC</strong><br />Warehouse District, Industrial Zone, Dubai, UAE</div>}
            {s.showCompanyPhone && <div>+971 4 123 4567</div>}
            {s.showCompanyEmail && <div>grn@billbull.ae</div>}
            {s.showCompanyWebsite && <div>www.billbull.ae</div>}
            {s.showCompanyTaxId && <div><strong style={{ color: "rgba(0,0,0,0.75)" }}>TRN:</strong> 100123456789003</div>}
            {s.showCompanyRegNumber && <div><strong style={{ color: "rgba(0,0,0,0.75)" }}>Reg:</strong> DXB-LLC-2019-0042</div>}
          </div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.12)", padding: "24px 28px", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", minWidth: "260px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "rgba(0,0,0,0.65)", letterSpacing: "3px", textTransform: "uppercase", textAlign: "right", lineHeight: 1.3 }}>
            <div style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(0,0,0,0.45)", marginBottom: "2px" }}>ERP Document</div>
            Goods Receipt<br />Note
          </div>
          <div style={{ width: "100%", marginTop: "10px" }}>
            {s.showGRNNumber && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.7)" }}><span style={{ color: "rgba(0,0,0,0.45)" }}>GRN No</span><span style={{ fontWeight: 500, fontFamily: "monospace" }}>GRN-DXB-000145</span></div>}
            {s.showGRNDate && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.7)" }}><span style={{ color: "rgba(0,0,0,0.45)" }}>GRN Date</span><span style={{ fontWeight: 500, fontFamily: "monospace" }}>29-Apr-2026</span></div>}
            {s.showBranch && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.7)" }}><span style={{ color: "rgba(0,0,0,0.45)" }}>Branch</span><span style={{ fontWeight: 500, fontFamily: "monospace" }}>Dubai Main</span></div>}
            {s.showWarehouse && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0", color: "rgba(0,0,0,0.7)" }}><span style={{ color: "rgba(0,0,0,0.45)" }}>Warehouse</span><span style={{ fontWeight: 500, fontFamily: "monospace" }}>Central Warehouse</span></div>}
          </div>
          {s.showStatusBadge && <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.2)", color: "#0f1923", borderRadius: "20px", padding: "4px 12px", fontSize: "10.5px", fontWeight: 500, marginTop: "8px", alignSelf: "flex-end" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#0d7a4e", display: "inline-block" }} />
              Fully Received
            </div>}
        </div>
      </div>

      <div style={{ padding: "0 24px 24px" }}>
        {
    /* Vendor & PO */
  }
        {(s.showVendorCard || s.showPOCard) && <>
            {sl("Vendor & Purchase Reference")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {s.showVendorCard && <div style={{ background: "#f4f6f8", border: "1px solid #dde2e8", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1.2px", textTransform: "uppercase", color: "#1a56db", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}><Warehouse size={13} />Vendor Details</div>
                  {s.showVendorName && kv("Vendor Name", "XYZ Electronics LLC")}
                  {s.showVendorCode && kv("Vendor Code", "VND-00125", true)}
                  {s.showVendorContact && kv("Contact", "John Al Rashid")}
                  {s.showVendorMobile && kv("Mobile", "+971 50 123 4567", true)}
                  {s.showVendorTRN && kv("TRN", "100987654321003", true)}
                </div>}
              {s.showPOCard && <div style={{ background: "#f4f6f8", border: "1px solid #dde2e8", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1.2px", textTransform: "uppercase", color: "#1a56db", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}><FileText size={13} />Purchase Reference</div>
                  {s.showLPONumber && kv("LPO No", "LPO-00012", true)}
                  {s.showSupplierInvoice && kv("Supplier Invoice", "INV-7788", true)}
                  {s.showDeliveryNote && kv("Delivery Note", "DN-778", true)}
                  {s.showVehicleNo && kv("Vehicle No", "DXB-8822", true)}
                  {s.showReceivedBy && kv("Received By", "Storekeeper \u2014 Ali Hassan")}
                </div>}
            </div>
          </>}

        {
    /* Summary pills */
  }
        {s.showSummaryBar && <>
            {sl("Receiving Summary")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
              {s.showOrderedQtyPill && <div style={{ background: "#e8f0fe", border: "1px solid #93b4f5", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}><span style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#1a56db" }}>Ordered Qty</span><span style={{ fontSize: "28px", fontWeight: 600, lineHeight: 1, color: "#1a56db", fontFamily: "monospace" }}>250</span><span style={{ fontSize: "10px", color: "#6b7a8a" }}>Total units on LPO</span></div>}
              {s.showReceivedQtyPill && <div style={{ background: "#e6f7f0", border: "1px solid #9de8c8", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}><span style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#0d7a4e" }}>Received Qty</span><span style={{ fontSize: "28px", fontWeight: 600, lineHeight: 1, color: "#0d7a4e", fontFamily: "monospace" }}>238</span><span style={{ fontSize: "10px", color: "#6b7a8a" }}>Accepted & entered</span></div>}
              {s.showPendingQtyPill && <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}><span style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#b45309" }}>Pending Qty</span><span style={{ fontSize: "28px", fontWeight: 600, lineHeight: 1, color: "#b45309", fontFamily: "monospace" }}>12</span><span style={{ fontSize: "10px", color: "#6b7a8a" }}>Short delivery</span></div>}
              {s.showDamagedQtyPill && <div style={{ background: "#fde8e8", border: "1px solid #f4a0a0", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}><span style={{ fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#be2d2d" }}>Damaged Qty</span><span style={{ fontSize: "28px", fontWeight: 600, lineHeight: 1, color: "#be2d2d", fontFamily: "monospace" }}>5</span><span style={{ fontSize: "10px", color: "#6b7a8a" }}>Rejected / returned</span></div>}
            </div>
          </>}

        {
    /* Items table */
  }
        {s.showItemsTable && <>
            {sl("Item Details")}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", border: "1px solid #dde2e8", borderRadius: "10px", overflow: "hidden" }}>
              <thead>
                <tr style={{ background: s.tableHeaderColor, color: "#fff" }}>
                  {s.showLineNumber && <th style={{ padding: "9px 10px", textAlign: "center", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", width: "28px" }}>#</th>}
                  {s.showItemDescription && <th style={{ padding: "9px 10px", textAlign: s.tableHeaderAlign, fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Item Description</th>}
                  {s.showBarcode && <th style={{ padding: "9px 10px", textAlign: "center", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Barcode</th>}
                  {s.showOrderedQty && <th style={{ padding: "9px 10px", textAlign: "right", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Ordered</th>}
                  {s.showReceivedQty && <th style={{ padding: "9px 10px", textAlign: "right", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Received</th>}
                  {s.showDamagedQty && <th style={{ padding: "9px 10px", textAlign: "right", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Damaged</th>}
                  {s.showBatchNo && <th style={{ padding: "9px 10px", textAlign: "center", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Batch No</th>}
                  {s.showExpiry && <th style={{ padding: "9px 10px", textAlign: "center", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Expiry</th>}
                  {s.showBinLocation && <th style={{ padding: "9px 10px", textAlign: "left", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>Bin Loc</th>}
                </tr>
              </thead>
              <tbody>
                {ITEMS.map((item, i) => <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc", borderBottom: "1px solid #dde2e8" }}>
                    {s.showLineNumber && <td style={{ padding: "10px", textAlign: "center", color: "#a0aab4", fontSize: "10px" }}>{item.n}</td>}
                    {s.showItemDescription && <td style={{ padding: "10px", verticalAlign: "top" }}><div style={{ fontWeight: 600, fontSize: "12px", color: "#0f1923" }}>{item.name}</div><div style={{ fontFamily: "monospace", fontSize: "10px", color: "#1040b0", marginTop: "1px" }}>SKU: {item.sku} · Part: {item.part}</div><div style={{ fontSize: "10px", color: "#6b7a8a", marginTop: "1px" }}>Category: {item.cat}</div><div style={{ fontSize: "10px", color: "#a0aab4", fontStyle: "italic", marginTop: "1px" }}>{item.spec}</div></td>}
                    {s.showBarcode && <td style={{ padding: "10px", textAlign: "center", verticalAlign: "top" }}><div style={{ display: "inline-block", height: "22px", width: "68px", background: "repeating-linear-gradient(90deg,#1a1a1a 0,#1a1a1a 2px,#fff 2px,#fff 4px,#1a1a1a 4px,#1a1a1a 5px,#fff 5px,#fff 8px,#1a1a1a 8px,#1a1a1a 9px,#fff 9px,#fff 12px,#1a1a1a 12px,#1a1a1a 14px,#fff 14px,#fff 16px,#1a1a1a 16px,#1a1a1a 17px,#fff 17px,#fff 20px,#1a1a1a 20px,#1a1a1a 22px,#fff 22px,#fff 24px,#1a1a1a 24px,#1a1a1a 25px,#fff 25px,#fff 28px)", borderRadius: "2px" }} /><div style={{ fontFamily: "monospace", fontSize: "9px", color: "#6b7a8a", marginTop: "2px" }}>{item.barcode}</div></td>}
                    {s.showOrderedQty && <td style={{ padding: "10px", textAlign: "right", fontFamily: "monospace", color: "#3b4a58" }}>{item.ord}</td>}
                    {s.showReceivedQty && <td style={{ padding: "10px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#0d7a4e" }}>{item.rec}</td>}
                    {s.showDamagedQty && <td style={{ padding: "10px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: item.dmg === 0 ? "#0d7a4e" : item.dmg <= 2 ? "#b45309" : "#be2d2d" }}>{item.dmg}</td>}
                    {s.showBatchNo && <td style={{ padding: "10px", textAlign: "center", fontFamily: "monospace", fontSize: "10.5px", color: "#3b4a58" }}>{item.batch}</td>}
                    {s.showExpiry && <td style={{ padding: "10px", textAlign: "center", fontFamily: "monospace", fontSize: "10.5px", color: item.expWarn ? "#b45309" : "#3b4a58", fontWeight: item.expWarn ? 600 : 400 }}>{item.exp}</td>}
                    {s.showBinLocation && <td style={{ padding: "10px", fontFamily: "monospace", fontSize: "10.5px", color: "#3b4a58" }}>{item.bin}</td>}
                  </tr>)}
              </tbody>
            </table>
          </>}

        {
    /* Batch & Expiry */
  }
        {s.showBatchTable && <>
            {sl("Batch & Expiry Control")}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", border: "1px solid #9de8c8", borderRadius: "10px", overflow: "hidden" }}>
              <thead><tr style={{ background: "#0d7a4e" }}>{["Item", "Batch No", "Qty", "Expiry Date", "Barcode", "Status"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "9px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#fff" }}>{h}</th>)}</tr></thead>
              <tbody>
                {ITEMS.map((item, i) => <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f0fdf8", borderBottom: "1px solid #c3f0dc" }}>
                    <td style={{ padding: "9px 12px" }}>{item.name.split(" ").slice(0, 3).join(" ")}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: "10.5px" }}>{item.batch}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: "10.5px" }}>{item.rec}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: "10.5px", color: item.expWarn ? "#b45309" : "#0f1923", fontWeight: item.expWarn ? 600 : 400 }}>{item.exp}</td>
                    <td style={{ padding: "9px 12px" }}><div style={{ display: "inline-block", height: "18px", width: "54px", background: "repeating-linear-gradient(90deg,#1a1a1a 0,#1a1a1a 2px,#fff 2px,#fff 4px,#1a1a1a 4px,#1a1a1a 5px,#fff 5px,#fff 8px)", borderRadius: "2px" }} /></td>
                    <td style={{ padding: "9px 12px" }}>{item.expWarn ? nearB : goodB}</td>
                  </tr>)}
              </tbody>
            </table>
          </>}

        {
    /* Damage & Shortage */
  }
        {s.showDamageTable && <>
            {sl("Damage & Shortage Report")}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", border: "1px solid #f4a0a0", borderRadius: "10px", overflow: "hidden" }}>
              <thead><tr style={{ background: "#be2d2d" }}>{["Item", "Ordered", "Received", "Shortage", "Damage", "Notes"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "9px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#fff" }}>{h}</th>)}</tr></thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #fcd5d5" }}>
                  <td style={{ padding: "9px 12px" }}>Apple AirPods Pro 2nd Gen</td><td style={{ padding: "9px 12px" }}>60</td><td style={{ padding: "9px 12px" }}>58</td>
                  <td style={{ padding: "9px 12px", color: "#b45309", fontWeight: 600 }}>2</td><td style={{ padding: "9px 12px", color: "#be2d2d", fontWeight: 600 }}>2</td>
                  <td style={{ padding: "9px 12px", color: "#3b4a58", fontSize: "11px" }}>Packaging torn — moisture damage. RMA-0045 raised. Vendor notified.</td>
                </tr>
                <tr>
                  <td style={{ padding: "9px 12px" }}>Logitech MX Master 3S Mouse</td><td style={{ padding: "9px 12px" }}>110</td><td style={{ padding: "9px 12px" }}>100</td>
                  <td style={{ padding: "9px 12px", color: "#b45309", fontWeight: 600 }}>10</td><td style={{ padding: "9px 12px", color: "#be2d2d", fontWeight: 600 }}>3</td>
                  <td style={{ padding: "9px 12px", color: "#3b4a58", fontSize: "11px" }}>3 units cracked casing. 10 units short shipped — partial delivery confirmed by driver.</td>
                </tr>
              </tbody>
            </table>
          </>}

        {
    /* QC */
  }
        {s.showQCTable && <>
            {sl("QC / Inspection Report")}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", border: "1px solid #93b4f5", borderRadius: "10px", overflow: "hidden" }}>
              <thead><tr style={{ background: "#1a56db" }}>{["Item", "QC Status", "Checked By", "Date", "Remarks"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "9px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "#fff" }}>{h}</th>)}</tr></thead>
              <tbody>
                {[
    { item: "Samsung Galaxy Tab A8", status: "pass", checker: "M. Al Kaabi", date: "29-Apr-2026", remark: "All 80 units visually inspected. No defects found." },
    { item: "Apple AirPods Pro 2nd Gen", status: "warn", checker: "M. Al Kaabi", date: "29-Apr-2026", remark: "58/60 passed. 2 units rejected \u2014 moisture ingress. Quarantined." },
    { item: "Logitech MX Master 3S Mouse", status: "warn", checker: "S. Fernandez", date: "29-Apr-2026", remark: "100/110 received. 3 damaged units isolated. Binned at B-04-A2." }
  ].map((row, i) => <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f0f5ff", borderBottom: "1px solid #d0dffb" }}>
                    <td style={{ padding: "9px 12px" }}>{row.item}</td>
                    <td style={{ padding: "9px 12px" }}>{row.status === "pass" ? passB : warnB}</td>
                    <td style={{ padding: "9px 12px" }}>{row.checker}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: "11px" }}>{row.date}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "#3b4a58" }}>{row.remark}</td>
                  </tr>)}
              </tbody>
            </table>
          </>}

        {
    /* Inventory Impact */
  }
        {s.showInventoryImpact && <>
            {sl("Inventory Impact Summary")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[{ label: "Total Items Received", value: "238", sub: "Units entered into live stock", big: true }, { label: "Total Batches Created", value: "3", sub: "Batch records updated in ERP", big: true }, { label: "Warehouse Updated", value: "Central WH", sub: "Bins A-01-B3, A-02-C1, B-04-A2", big: false }].map((card, i) => <div key={i} style={{ background: "#0f1923", borderRadius: "10px", padding: "14px 16px", color: "white", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.5)", letterSpacing: "1px", textTransform: "uppercase" }}>{card.label}</div>
                  <div style={{ fontSize: card.big ? "22px" : "15px", fontWeight: 600, fontFamily: "monospace", color: "#6ee7b7", marginTop: card.big ? 0 : "4px" }}>{card.value}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)" }}>{card.sub}</div>
                </div>)}
            </div>
          </>}

        {
    /* Notes */
  }
        {s.showNotes && <>
            {sl("Warehouse Notes & Remarks")}
            <div style={{ background: "#f4f6f8", border: "1px solid #dde2e8", borderLeft: "4px solid #1a56db", borderRadius: "0 6px 6px 0", padding: "12px 16px", fontSize: "12px", color: "#3b4a58", lineHeight: 1.7 }}>{s.notesText}</div>
          </>}

        {
    /* Terms */
  }
        {s.showTermsConditions && <>
            {sl("Terms & Conditions")}
            <div style={{ background: "#f4f6f8", border: "1px solid #dde2e8", borderRadius: "6px", padding: "12px 16px", fontSize: "11px", color: "#6b7a8a", whiteSpace: "pre-wrap" }}>{s.termsConditions}</div>
          </>}

        {
    /* Signatures */
  }
        {s.showSignatures && <>
            {sl("Authorization & Signatures")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
              {[s.showPreparedBy && { role: "Prepared By", name: "Ali Hassan" }, s.showWarehouseIncharge && { role: "Warehouse Incharge", name: "K. Al Mansouri" }, s.showQCOfficer && { role: "QC Officer", name: "M. Al Kaabi" }, s.showVendorRep && { role: "Vendor Delivery", name: "Driver / Rep" }].filter(Boolean).map((sig, i) => <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ height: "56px", borderBottom: "2px solid #a0aab4", position: "relative", marginBottom: "8px" }}>
                    <span style={{ position: "absolute", bottom: "6px", left: "50%", transform: "translateX(-50%)", fontSize: "9px", color: "#a0aab4", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>Sign Here</span>
                  </div>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: "#0f1923", textTransform: "uppercase", letterSpacing: "0.8px" }}>{sig.role}</div>
                  <div style={{ fontSize: "11px", color: "#6b7a8a", marginTop: "2px" }}>{sig.name}</div>
                </div>)}
            </div>
          </>}

        {
    /* QR + Stamp */
  }
        {(s.showQRCode || s.showStamp) && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "20px" }}>
            <div>
              {s.showQRCode && <div style={{ border: "1px solid #dde2e8", padding: "8px", display: "inline-block", borderRadius: "6px" }}>
                  <div style={{ width: "60px", height: "60px", background: "repeating-conic-gradient(#0f1923 0% 25%, #fff 0% 50%) 0 0 / 6px 6px", borderRadius: "4px" }} />
                  <div style={{ textAlign: "center", fontSize: "9px", color: "#6b7a8a", marginTop: "4px" }}>Scan to verify</div>
                </div>}
            </div>
            {s.showStamp && <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "64px", height: "64px", border: "2px dashed #a0aab4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "9px", color: "#a0aab4", textAlign: "center", letterSpacing: "0.5px", textTransform: "uppercase" }}>Company<br />Stamp</span>
                </div>
              </div>}
          </div>}
      </div>

      {
    /* Doc footer */
  }
      {s.showDocFooter && <div style={{ background: s.footerBackgroundColor, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "10px", color: "#5a7a96" }}>
            <strong style={{ color: "#8ca4bc", fontWeight: 500 }}>GRN-DXB-000145</strong> · BillBull Retail OS v4.2.1<br />
            Generated: 29-Apr-2026 09:42 GST · User: warehouse.admin
          </div>
          <div style={{ fontSize: "10px", color: "#5a7a96", textAlign: "right" }}>
            <strong style={{ color: "#8ca4bc", fontWeight: 500 }}>Central Warehouse — Dubai Main</strong><br />
            {s.showPageNumbers ? "Page 1 of 1 \xB7 " : ""}Confidential — Internal Use Only
          </div>
        </div>}
    </div>;
}
function GRNTemplateDesigner({ templateName, initialSettings, onClose, onSave }) {
  const [settings, setSettings] = useState({
    ...defaultSettings,
    ...templateName ? { templateName } : {},
    ...initialSettings
  });
  const [showPreview, setShowPreview] = useState(true);
  const update = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));
  const handleSave = () => {
    onSave(settings);
    toast.success("GRN template saved successfully");
  };
  const handleExport = () => {
    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(settings, null, 2))}`;
    const a = document.createElement("a");
    a.href = uri;
    a.download = "grn-template.json";
    a.click();
    toast.success("Template exported");
  };
  const AlignmentSelector = ({ label, value, onChange }) => <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {["left", "center", "right"].map((a) => <Button
    key={a}
    type="button"
    variant={value === a ? "default" : "outline"}
    size="sm"
    className={value === a ? "bg-[#F5C742] text-black hover:bg-[#F5C742]/90" : ""}
    onClick={() => onChange(a)}
  >
            {a === "left" ? <AlignLeft className="h-4 w-4" /> : a === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
          </Button>)}
      </div>
    </div>;
  return <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
      {
    /* Top bar — identical to quotation designer */
  }
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">GRN Template Designer</h1>
            <p className="text-sm text-muted-foreground">Customize your Goods Receipt Note print template</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setShowPreview((p) => !p)}>
            <Eye className="mr-2 h-4 w-4" />
            {showPreview ? "Hide" : "Show"} Preview
          </Button>
          <Button className="bg-[#F5C742] hover:bg-[#F5C742]/90 text-black" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Template
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {
    /* Settings panel — w-1/2 always, matches quotation */
  }
        <div className="w-1/2 border-r overflow-y-auto bg-white">
          <ScrollArea className="h-full">
            <div className="p-6">
              <Tabs defaultValue="typography" className="space-y-4">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="typography">Typography</TabsTrigger>
                  <TabsTrigger value="layout">Layout</TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="footer">Footer</TabsTrigger>
                </TabsList>

                {
    /* ── Typography ── */
  }
                <TabsContent value="typography" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Type className="h-5 w-5" />
                        Font Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Font Family</Label>
                        <Select value={settings.fontFamily} onValueChange={(v) => update("fontFamily", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{fontFamilies.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Body Font Size (pt)</Label>
                          <Input type="number" value={settings.fontSize} onChange={(e) => update("fontSize", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Header Font Size (px)</Label>
                          <Input type="number" value={settings.headerFontSize} onChange={(e) => update("headerFontSize", e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Font Color</Label>
                        <div className="flex gap-2">
                          <Input type="color" value={settings.fontColor} onChange={(e) => update("fontColor", e.target.value)} className="w-20 h-10" />
                          <Input value={settings.fontColor} onChange={(e) => update("fontColor", e.target.value)} placeholder="#0f1923" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Palette className="h-5 w-5" />
                        Color Theme
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[
    { label: "Accent Color", k: "accentColor", placeholder: "#F5C742" },
    { label: "Background Color", k: "backgroundColor", placeholder: "#FFFFFF" },
    { label: "Header Background", k: "headerBackgroundColor", placeholder: "#F5C742" },
    { label: "Table Header Row", k: "tableHeaderColor", placeholder: "#0f1923" },
    { label: "Footer Background", k: "footerBackgroundColor", placeholder: "#0f1923" }
  ].map(({ label, k, placeholder }) => <div key={k} className="space-y-2">
                          <Label>{label}</Label>
                          <div className="flex gap-2">
                            <Input type="color" value={settings[k]} onChange={(e) => update(k, e.target.value)} className="w-20 h-10" />
                            <Input value={settings[k]} onChange={(e) => update(k, e.target.value)} placeholder={placeholder} />
                          </div>
                        </div>)}
                    </CardContent>
                  </Card>
                </TabsContent>

                {
    /* ── Layout ── */
  }
                <TabsContent value="layout" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlignCenter className="h-5 w-5" />
                        Section Alignment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <AlignmentSelector label="Company Details" value={settings.companyDetailsAlign} onChange={(v) => update("companyDetailsAlign", v)} />
                      <AlignmentSelector label="Vendor Details" value={settings.vendorDetailsAlign} onChange={(v) => update("vendorDetailsAlign", v)} />
                      <AlignmentSelector label="Table Headers" value={settings.tableHeaderAlign} onChange={(v) => update("tableHeaderAlign", v)} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Paper Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Paper Size</Label>
                          <Select value={settings.paperSize} onValueChange={(v) => update("paperSize", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A4">A4</SelectItem>
                              <SelectItem value="Letter">Letter</SelectItem>
                              <SelectItem value="A5">A5</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Orientation</Label>
                          <Select value={settings.orientation} onValueChange={(v) => update("orientation", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="portrait">Portrait</SelectItem>
                              <SelectItem value="landscape">Landscape</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-4">
                        {["marginTop", "marginBottom", "marginLeft", "marginRight"].map((k) => <div key={k} className="space-y-2">
                            <Label>Margin {k.replace("margin", "")} (mm)</Label>
                            <Input type="number" value={settings[k]} onChange={(e) => update(k, e.target.value)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {
    /* ── Content ── */
  }
                <TabsContent value="content" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Company Details
                      </CardTitle>
                      <CardDescription>Select which company information to display</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showCompanyName", label: "Company Name", icon: Building2 },
    { key: "showCompanyLogo", label: "Company Logo", icon: Building2 },
    { key: "showCompanyAddress", label: "Address", icon: MapPin },
    { key: "showCompanyPhone", label: "Phone", icon: Phone },
    { key: "showCompanyEmail", label: "Email", icon: Mail },
    { key: "showCompanyWebsite", label: "Website", icon: Globe },
    { key: "showCompanyTaxId", label: "Tax ID / TRN", icon: Hash },
    { key: "showCompanyRegNumber", label: "Reg Number", icon: Hash }
  ].map(({ key, label, icon: Icon }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-xs cursor-pointer">{label}</Label>
                            </div>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        GRN Header Fields
                      </CardTitle>
                      <CardDescription>Fields shown in the top-right of the document header</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showGRNNumber", label: "GRN Number", icon: Hash },
    { key: "showGRNDate", label: "GRN Date", icon: Calendar },
    { key: "showBranch", label: "Branch", icon: MapPin },
    { key: "showWarehouse", label: "Warehouse", icon: Warehouse },
    { key: "showStatusBadge", label: "Status Badge", icon: CheckCircle }
  ].map(({ key, label, icon: Icon }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-xs cursor-pointer">{label}</Label>
                            </div>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Warehouse className="h-5 w-5" />
                        Vendor Details
                      </CardTitle>
                      <CardDescription>Fields shown in the vendor info card</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showVendorCard", label: "Show Vendor Card", icon: Warehouse },
    { key: "showVendorName", label: "Vendor Name", icon: User },
    { key: "showVendorCode", label: "Vendor Code", icon: Hash },
    { key: "showVendorContact", label: "Contact Person", icon: User },
    { key: "showVendorMobile", label: "Mobile", icon: Phone },
    { key: "showVendorTRN", label: "TRN", icon: Hash }
  ].map(({ key, label, icon: Icon }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-xs cursor-pointer">{label}</Label>
                            </div>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Purchase Reference
                      </CardTitle>
                      <CardDescription>Fields shown in the purchase reference card</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showPOCard", label: "Show PO Card", icon: FileText },
    { key: "showLPONumber", label: "LPO Number", icon: Hash },
    { key: "showSupplierInvoice", label: "Supplier Invoice", icon: FileText },
    { key: "showDeliveryNote", label: "Delivery Note", icon: Truck },
    { key: "showVehicleNo", label: "Vehicle Number", icon: Truck },
    { key: "showReceivedBy", label: "Received By", icon: User }
  ].map(({ key, label, icon: Icon }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-xs cursor-pointer">{label}</Label>
                            </div>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Receiving Summary
                      </CardTitle>
                      <CardDescription>Qty summary pills shown above the items table</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showSummaryBar", label: "Show Summary Bar" },
    { key: "showOrderedQtyPill", label: "Ordered Qty (Blue)" },
    { key: "showReceivedQtyPill", label: "Received Qty (Green)" },
    { key: "showPendingQtyPill", label: "Pending Qty (Amber)" },
    { key: "showDamagedQtyPill", label: "Damaged Qty (Red)" }
  ].map(({ key, label }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <Label className="text-xs cursor-pointer">{label}</Label>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Items Table Columns
                      </CardTitle>
                      <CardDescription>Select which columns to show in the items table</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showItemsTable", label: "Show Items Table" },
    { key: "showLineNumber", label: "Line Number (#)" },
    { key: "showItemDescription", label: "Item Description" },
    { key: "showBarcode", label: "Barcode" },
    { key: "showOrderedQty", label: "Ordered Qty" },
    { key: "showReceivedQty", label: "Received Qty" },
    { key: "showDamagedQty", label: "Damaged Qty" },
    { key: "showBatchNo", label: "Batch No" },
    { key: "showExpiry", label: "Expiry Date" },
    { key: "showBinLocation", label: "Bin Location" }
  ].map(({ key, label }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <Label className="text-xs cursor-pointer">{label}</Label>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5" />
                        Additional Sections
                      </CardTitle>
                      <CardDescription>Optional supplementary tables and sections</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {[
    { key: "showBatchTable", label: "Batch & Expiry Table" },
    { key: "showDamageTable", label: "Damage & Shortage Report" },
    { key: "showQCTable", label: "QC / Inspection Report" },
    { key: "showInventoryImpact", label: "Inventory Impact Summary" }
  ].map(({ key, label }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <Label className="text-xs cursor-pointer">{label}</Label>
                            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {
    /* ── Footer ── */
  }
                <TabsContent value="footer" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Warehouse Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Show Warehouse Notes</Label>
                        <Switch checked={settings.showNotes} onCheckedChange={(v) => update("showNotes", v)} />
                      </div>
                      {settings.showNotes && <Textarea value={settings.notesText} onChange={(e) => update("notesText", e.target.value)} rows={3} placeholder="Warehouse notes and remarks..." />}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Terms & Conditions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Show Terms & Conditions</Label>
                        <Switch checked={settings.showTermsConditions} onCheckedChange={(v) => update("showTermsConditions", v)} />
                      </div>
                      {settings.showTermsConditions && <Textarea value={settings.termsConditions} onChange={(e) => update("termsConditions", e.target.value)} rows={4} placeholder="Enter terms and conditions..." />}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Signatures
                      </CardTitle>
                      <CardDescription>Signature lines shown at the bottom of the document</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Show Signatures Section</Label>
                        <Switch checked={settings.showSignatures} onCheckedChange={(v) => update("showSignatures", v)} />
                      </div>
                      {settings.showSignatures && <div className="grid grid-cols-2 gap-3 pl-2">
                          {[
    { key: "showPreparedBy", label: "Prepared By" },
    { key: "showWarehouseIncharge", label: "Warehouse Incharge" },
    { key: "showQCOfficer", label: "QC Officer" },
    { key: "showVendorRep", label: "Vendor Rep / Driver" }
  ].map(({ key, label }) => <div key={key} className="flex items-center justify-between p-2 border rounded">
                              <Label className="text-xs cursor-pointer">{label}</Label>
                              <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
                            </div>)}
                        </div>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Stamp className="h-5 w-5" />
                        Stamp & QR Code
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Show Company Stamp</Label>
                        <Switch checked={settings.showStamp} onCheckedChange={(v) => update("showStamp", v)} />
                      </div>
                      {settings.showStamp && <Button variant="outline" className="w-full">
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Stamp Image
                        </Button>}
                      <Separator />
                      <div className="flex items-center justify-between">
                        <Label>Show QR Code</Label>
                        <Switch checked={settings.showQRCode} onCheckedChange={(v) => update("showQRCode", v)} />
                      </div>
                      {settings.showQRCode && <div className="space-y-2">
                          <Label>QR Code Content (URL or Text)</Label>
                          <Input value={settings.qrCodeContent} onChange={(e) => update("qrCodeContent", e.target.value)} placeholder="https://billbull.app/verify/grn" />
                        </div>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Advanced Options</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-2 border rounded">
                        <Label>Show Watermark</Label>
                        <Switch checked={settings.showWatermark} onCheckedChange={(v) => update("showWatermark", v)} />
                      </div>
                      {settings.showWatermark && <div className="grid grid-cols-2 gap-3 pl-4">
                          <div className="space-y-2">
                            <Label>Watermark Text</Label>
                            <Input value={settings.watermarkText} onChange={(e) => update("watermarkText", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Opacity (0–1)</Label>
                            <Input type="number" step="0.1" min="0" max="1" value={settings.watermarkOpacity} onChange={(e) => update("watermarkOpacity", e.target.value)} />
                          </div>
                        </div>}
                      <div className="flex items-center justify-between p-2 border rounded">
                        <Label>Show Page Numbers</Label>
                        <Switch checked={settings.showPageNumbers} onCheckedChange={(v) => update("showPageNumbers", v)} />
                      </div>
                      <div className="flex items-center justify-between p-2 border rounded">
                        <Label>Show Doc Footer Bar</Label>
                        <Switch checked={settings.showDocFooter} onCheckedChange={(v) => update("showDocFooter", v)} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </div>

        {
    /* Preview panel — always rendered, empty-state when hidden (matches quotation) */
  }
        <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
          {showPreview ? <GRNPreview settings={settings} /> : <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <Eye className="h-16 w-16 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-medium">Preview Hidden</h3>
                <p className="text-sm text-muted-foreground">Click "Show Preview" to see your template design</p>
              </div>
            </div>}
        </div>
      </div>
    </div>;
}
export {
  GRNTemplateDesigner
};
