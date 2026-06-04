import { useState, useRef, useCallback, useEffect } from "react";
import {
  Badge,
  Button,
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
  TabsTrigger
} from "../../Purchase/Templates/PurchaseTemplateUI";
import toast from "react-hot-toast";
import { UAE_DIRHAM_SYMBOL_IMAGE } from "../../../utils/countryCurrencyOptions";
import {
  ArrowLeft,
  Download,
  Save,
  Upload,
  Eye,
  EyeOff,
  Move,
  FileImage,
  LayoutGrid,
  Printer,
  Bold,
  Italic,
  Lock,
  Unlock,
  RotateCcw,
  Plus,
  Minus,
  ZoomIn,
  ZoomOut,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Info,
  CheckSquare,
  Square,
  Layers,
  Minus as HLineIcon,
  SeparatorVertical,
  RectangleHorizontal,
  MousePointer2,
  Trash2,
  Copy
} from "lucide-react";
// Local, density-matched card primitives (theme: light border + subtle shadow,
// tight padding) so the whole module reads like the standard document designer
// instead of the airy shadow-md/p-6 defaults.
const Card = ({ className = "", ...props }) => <div className={`rounded-lg bg-white border border-slate-200 shadow-sm ${className}`} {...props} />;
const CardHeader = ({ className = "", ...props }) => <div className={`px-3.5 pt-3 pb-2 ${className}`} {...props} />;
const CardContent = ({ className = "", ...props }) => <div className={`px-3.5 pb-3.5 pt-0 ${className}`} {...props} />;
const CardTitle = ({ className = "", ...props }) => <h3 className={`text-[13px] font-semibold text-slate-800 ${className}`} {...props} />;
const CardDescription = ({ className = "", ...props }) => <div className={`text-[11px] text-slate-500 leading-snug ${className}`} {...props} />;
const PAPER_DIMS = {
  "A4-portrait": { w: 210, h: 297 },
  "A4-landscape": { w: 297, h: 210 },
  "Letter-portrait": { w: 215.9, h: 279.4 },
  "Letter-landscape": { w: 279.4, h: 215.9 },
  "A5-portrait": { w: 148, h: 210 },
  "A5-landscape": { w: 210, h: 148 }
};
const makeLine = (type, x, y, w, h) => ({
  id: `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type,
  label: type === "h-line" ? "Horizontal Line" : type === "v-line" ? "Vertical Line" : "Border / Box",
  x,
  y,
  width: w,
  height: h,
  color: "#0f1923",
  thickness: 1,
  dashed: false,
  dashPattern: "4,2",
  fillColor: "#ffffff",
  fillOpacity: 0,
  locked: false
});
// Image-style fields render as a placeholder box on the canvas and pull a real
// image (logo / stamp) or generated graphic (QR) from the company profile at print time.
const IMAGE_FIELD_LABELS = {
  company_logo: "Logo",
  company_stamp: "Stamp",
  qr_code: "QR Code"
};
const isImageField = (id) => Object.prototype.hasOwnProperty.call(IMAGE_FIELD_LABELS, id);

// Configurable columns for the items table block — full parity with the
// standard (FULL) Sales Invoice designer's table columns. `flex` drives the
// relative auto-width when a column is enabled.
const OVERLAY_TABLE_COLUMNS = [
  { key: "lineNo", label: "#", align: "center", flex: 0.4 },
  { key: "image", label: "Image", align: "center", flex: 0.8 },
  { key: "code", label: "Item Code", align: "left", flex: 1.1 },
  { key: "name", label: "Product / Service", align: "left", flex: 2 },
  { key: "description", label: "Description", align: "left", flex: 2.4 },
  { key: "brand", label: "Brand", align: "left", flex: 1 },
  { key: "sku", label: "SKU", align: "left", flex: 1 },
  { key: "barcode", label: "Barcode", align: "left", flex: 1.2 },
  { key: "batchNumber", label: "Batch No", align: "left", flex: 1.2 },
  { key: "location", label: "Location / Bin", align: "left", flex: 1 },
  { key: "unit", label: "UOM", align: "center", flex: 0.7 },
  { key: "qty", label: "Qty", align: "right", flex: 0.7 },
  { key: "price", label: "Unit Price", align: "right", flex: 1 },
  { key: "taxableAmount", label: "Taxable", align: "right", flex: 1 },
  { key: "disc", label: "Discount", align: "right", flex: 0.9 },
  { key: "taxPercent", label: "VAT %", align: "right", flex: 0.7 },
  { key: "taxAmt", label: "VAT Amount", align: "right", flex: 1 },
  { key: "total", label: "Line Total", align: "right", flex: 1 }
];
const DEFAULT_TABLE_COLUMNS = { lineNo: true, name: true, description: true, qty: true, price: true, taxAmt: true, total: true };
const TOTALS_NUMERIC_IDS = new Set(['taxable_total', 'subtotal', 'discount_total', 'tax_amount', 'delivery_charge', 'round_off', 'grand_total']);
// Sample item row used to render a realistic preview inside the designer canvas.
const SAMPLE_TABLE_ROW = {
  lineNo: "1", image: "", code: "JSW-POS-001", name: "JASEWAY POS Machine",
  description: "i5 / 8GB / 256GB SSD / 10\" LCD", brand: "JASEWAY", sku: "JSW-POS-001-BLK",
  barcode: "6291041500213", batchNumber: "BTH-2025-0441", location: "WH-3 / B-12",
  unit: "PCS", qty: "12.00", price: "1,500.00", taxableAmount: "18,000.00", disc: "0.00",
  taxPercent: "5%", taxAmt: "900.00", total: "18,900.00"
};
const DEFAULT_FIELDS = [
  // ── Company header ──
  { id: "company_logo", label: "Company Logo", sampleValue: "[Logo]", category: "company", x: 20, y: 12, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 30, enabled: false, locked: false, printLabel: false },
  { id: "company_name", label: "Company Name", sampleValue: "BillBull Retail Ltd", category: "company", x: 20, y: 15, fontSize: 16, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "left", width: 100, enabled: true, locked: false, printLabel: false },
  { id: "company_address", label: "Company Address", sampleValue: "Building 123, Dubai, UAE", category: "company", x: 20, y: 24, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 100, enabled: true, locked: false, printLabel: false },
  { id: "company_phone", label: "Company Phone", sampleValue: "+971 4 123 4567", category: "company", x: 20, y: 31, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: true, locked: false, printLabel: false },
  { id: "company_email", label: "Company Email", sampleValue: "info@billbull.ae", category: "company", x: 20, y: 37, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: true, locked: false, printLabel: false },
  { id: "company_website", label: "Company Website", sampleValue: "www.billbull.ae", category: "company", x: 20, y: 43, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: false, locked: false, printLabel: false },
  { id: "company_trn", label: "Company TRN", sampleValue: "TRN: 100123456789003", category: "company", x: 20, y: 49, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: true, locked: false, printLabel: false },
  { id: "company_cr", label: "Company CR Number", sampleValue: "CR: DED-2022-112345", category: "company", x: 20, y: 55, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: false, locked: false, printLabel: false },
  // ── Document info ──
  { id: "invoice_title", label: "Document Title", sampleValue: "TAX INVOICE", category: "document", x: 130, y: 20, fontSize: 20, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: false },
  { id: "invoice_no", label: "Invoice Number", sampleValue: "INV-2024-001", category: "document", x: 130, y: 40, fontSize: 10, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "invoice_date", label: "Invoice Date", sampleValue: "20 May 2024", category: "document", x: 130, y: 49, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "due_date", label: "Due Date", sampleValue: "19 Jun 2024", category: "document", x: 130, y: 58, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "valid_until", label: "Valid Until", sampleValue: "30 Jun 2024", category: "document", x: 130, y: 67, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "payment_terms", label: "Payment Terms", sampleValue: "Net 30", category: "document", x: 130, y: 76, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "salesperson", label: "Salesperson", sampleValue: "John Smith", category: "document", x: 130, y: 85, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "currency", label: "Currency", sampleValue: "AED", category: "document", x: 130, y: 94, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "po_reference", label: "PO / Reference", sampleValue: "PO-99817", category: "document", x: 130, y: 103, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "location_store", label: "Location / Store", sampleValue: "DXB-01", category: "document", x: 130, y: 112, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "warehouse", label: "Warehouse / Store", sampleValue: "Main Store, Fujairah", category: "document", x: 130, y: 121, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "delivery_terms", label: "Delivery Terms", sampleValue: "DAP - Customer Warehouse", category: "document", x: 130, y: 130, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  // ── Customer / Bill To & Ship To ──
  { id: "bill_to_label", label: '"Bill To" Heading', sampleValue: "BILL TO", category: "customer", x: 20, y: 62, fontSize: 8, fontFamily: "Inter", bold: true, italic: false, color: "#6b7a8a", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_name", label: "Customer Name", sampleValue: "Acme Corporation", category: "customer", x: 20, y: 69, fontSize: 11, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_address1", label: "Customer Address 1", sampleValue: "456 Client Avenue", category: "customer", x: 20, y: 77, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_address2", label: "Customer Address 2", sampleValue: "Bur Dubai, Dubai, UAE", category: "customer", x: 20, y: 84, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_code", label: "Customer Code", sampleValue: "CUS-0042", category: "customer", x: 20, y: 91, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: false, locked: false, printLabel: true },
  { id: "customer_phone", label: "Customer Phone", sampleValue: "+971 50 123 4567", category: "customer", x: 20, y: 97, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: false, locked: false, printLabel: true },
  { id: "customer_email", label: "Customer Email", sampleValue: "ap@acme.com", category: "customer", x: 20, y: 103, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: false, locked: false, printLabel: true },
  { id: "customer_trn", label: "Customer TRN", sampleValue: "100987654321003", category: "customer", x: 20, y: 109, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: true, locked: false, printLabel: true },
  { id: "ship_to_label", label: '"Ship To" Heading', sampleValue: "SHIP TO", category: "customer", x: 110, y: 62, fontSize: 8, fontFamily: "Inter", bold: true, italic: false, color: "#6b7a8a", align: "left", width: 80, enabled: false, locked: false, printLabel: false },
  { id: "ship_to_address", label: "Shipping Address", sampleValue: "Warehouse 8, Industrial Area, Sharjah", category: "customer", x: 110, y: 69, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: false, locked: false, printLabel: false },
  // ── Items table ──
  { id: "items_table", label: "Items Table", sampleValue: "[Items Table Block]", category: "items", x: 10, y: 140, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 190, enabled: true, locked: false, printLabel: false, columns: { ...DEFAULT_TABLE_COLUMNS }, showHeader: true, zebra: false },
  // ── Totals ──
  { id: "taxable_total", label: "Taxable Amount", sampleValue: "AED 5,000.00", category: "totals", x: 130, y: 211, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: false, locked: false, printLabel: true },
  { id: "subtotal", label: "Subtotal", sampleValue: "AED 5,000.00", category: "totals", x: 130, y: 220, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: true, locked: false, printLabel: true },
  { id: "discount_total", label: "Discount", sampleValue: "AED 0.00", category: "totals", x: 130, y: 229, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: false, locked: false, printLabel: true },
  { id: "tax_amount", label: "VAT Amount", sampleValue: "AED 250.00", category: "totals", x: 130, y: 238, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: true, locked: false, printLabel: true },
  { id: "delivery_charge", label: "Delivery Charge", sampleValue: "AED 0.00", category: "totals", x: 130, y: 247, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: false, locked: false, printLabel: true },
  { id: "round_off", label: "Round Off", sampleValue: "AED 0.00", category: "totals", x: 130, y: 256, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: false, locked: false, printLabel: true },
  { id: "grand_total", label: "Grand Total", sampleValue: "AED 5,250.00", category: "totals", x: 130, y: 266, fontSize: 11, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "right", width: 65, enabled: true, locked: false, printLabel: true },
  { id: "amount_words", label: "Amount in Words", sampleValue: "Five Thousand Two Hundred Fifty Dirhams Only", category: "totals", x: 10, y: 256, fontSize: 9, fontFamily: "Inter", bold: false, italic: true, color: "#3b4a58", align: "left", width: 120, enabled: true, locked: false, printLabel: false },
  // ── Footer ──
  { id: "terms", label: "Terms & Conditions", sampleValue: "Goods sold are not returnable. Payment due within 30 days.", category: "footer", x: 10, y: 268, fontSize: 8, fontFamily: "Inter", bold: false, italic: false, color: "#6b7a8a", align: "left", width: 120, enabled: false, locked: false, printLabel: false },
  { id: "notes", label: "Notes / Remarks", sampleValue: "Thank you for your business.", category: "footer", x: 10, y: 278, fontSize: 8, fontFamily: "Inter", bold: false, italic: false, color: "#6b7a8a", align: "left", width: 120, enabled: true, locked: false, printLabel: false },
  { id: "bank_name", label: "Bank Name", sampleValue: "Emirates NBD", category: "footer", x: 10, y: 285, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 90, enabled: false, locked: false, printLabel: true },
  { id: "account_number", label: "Account Number", sampleValue: "1012345678", category: "footer", x: 10, y: 291, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 90, enabled: false, locked: false, printLabel: true },
  { id: "iban", label: "IBAN", sampleValue: "AE07 0330 0000 0102 1450 801", category: "footer", x: 10, y: 297, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 90, enabled: false, locked: false, printLabel: true },
  { id: "company_stamp", label: "Company Stamp", sampleValue: "[Stamp]", category: "footer", x: 150, y: 255, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "center", width: 30, enabled: false, locked: false, printLabel: false },
  { id: "qr_code", label: "QR Code", sampleValue: "[QR]", category: "footer", x: 175, y: 272, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 24, enabled: true, locked: false, printLabel: false },
  { id: "signature", label: "Authorized Signature", sampleValue: "________________________", category: "footer", x: 130, y: 285, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "center", width: 60, enabled: true, locked: false, printLabel: true }
];
const CATEGORY_COLORS = {
  company: "#8b5cf6",
  document: "#1a56db",
  customer: "#0d7a4e",
  items: "#b45309",
  totals: "#be2d2d",
  footer: "#6b7a8a"
};
const CATEGORY_LABELS = {
  company: "Company",
  document: "Document Info",
  customer: "Customer / Bill To",
  items: "Items Table",
  totals: "Totals",
  footer: "Footer"
};
const fontFamilies = ["Inter", "Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Roboto", "Open Sans", "Poppins"];
// Merge saved field overrides (position/style/enabled) onto the current full
// DEFAULT_FIELDS set so templates created before new fields existed still pick
// up the added fields, while honouring any per-field tweaks the user saved.
const mergeFields = (savedFields, mode) => {
  // Pre-printed stationery already carries the company header, so company
  // fields default OFF (the user can still turn them on per template).
  const withModeDefault = (f) => ({
    ...f,
    enabled: mode === "preprinted" && f.category === "company" ? false : f.enabled
  });
  if (!Array.isArray(savedFields) || savedFields.length === 0) {
    return DEFAULT_FIELDS.map(withModeDefault);
  }
  const savedById = new Map(savedFields.map((f) => [f.id, f]));
  const merged = DEFAULT_FIELDS.map((def) => {
    const saved = savedById.get(def.id);
    if (!saved) return withModeDefault(def);
    const out = { ...def, ...saved };
    if (def.id === "items_table") {
      out.columns = { ...DEFAULT_TABLE_COLUMNS, ...(saved.columns || {}) };
      out.showHeader = saved.showHeader !== false;
      out.zebra = Boolean(saved.zebra);
    }
    return out;
  });
  // Preserve any custom/unknown saved fields that aren't in DEFAULT_FIELDS.
  const knownIds = new Set(DEFAULT_FIELDS.map((f) => f.id));
  savedFields.forEach((f) => {
    if (!knownIds.has(f.id)) merged.push({ ...f });
  });
  return merged;
};
const defaultSettings = (mode, name) => ({
  templateName: name,
  mode,
  backgroundImage: "",
  paperSize: "A4",
  orientation: "portrait",
  customWidth: 210,
  customHeight: 297,
  fields: DEFAULT_FIELDS.map((f) => ({
    ...f,
    enabled: mode === "preprinted" && f.category === "company" ? false : f.enabled
  })),
  drawings: [],
  showGrid: true,
  gridSize: 5,
  snapToGrid: true,
  printOnlyValues: mode === "preprinted"
});
function InvoiceOverlayDesigner({ mode, templateName, initialSettings, onClose, onSave }) {
  const [settings, setSettings] = useState(() => {
    const base = defaultSettings(mode, templateName ?? (mode === "preprinted" ? "Pre-printed Invoice Template" : "Letterhead Invoice Template"));
    const merged = { ...base, ...initialSettings };
    merged.fields = mergeFields(initialSettings?.fields, mode);
    return merged;
  });
  const [selectedField, setSelectedField] = useState(null);
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [showSampleValues, setShowSampleValues] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [activeTab, setActiveTab] = useState("paper");
  const [filterCategory, setFilterCategory] = useState("all");
  const [dragging, setDragging] = useState(null);
  const [drawTool, setDrawTool] = useState("select");
  const [drawingInProgress, setDrawingInProgress] = useState(null);
  const [draggingDrawing, setDraggingDrawing] = useState(null);
  const canvasRef = useRef(null);
  const innerRef = useRef(null);
  const paperKey = `${settings.paperSize}-${settings.orientation}`;
  const dims = settings.paperSize === "Custom" ? settings.orientation === "portrait" ? { w: settings.customWidth, h: settings.customHeight } : { w: settings.customHeight, h: settings.customWidth } : PAPER_DIMS[paperKey] ?? { w: 210, h: 297 };
  const CANVAS_W_PX = 600;
  const scale = CANVAS_W_PX / dims.w;
  const CANVAS_H_PX = dims.h * scale;
  const updateField = (id, patch) => setSettings((s) => ({ ...s, fields: s.fields.map((f) => f.id === id ? { ...f, ...patch } : f) }));
  const updateDrawing = (id, patch) => setSettings((s) => ({ ...s, drawings: s.drawings.map((d) => d.id === id ? { ...d, ...patch } : d) }));
  const deleteDrawing = (id) => {
    setSettings((s) => ({ ...s, drawings: s.drawings.filter((d) => d.id !== id) }));
    if (selectedDrawing === id) setSelectedDrawing(null);
  };
  const duplicateDrawing = (id) => {
    const el = settings.drawings.find((d) => d.id === id);
    if (!el) return;
    const clone = { ...el, id: `draw_${Date.now()}`, x: el.x + 5, y: el.y + 5 };
    setSettings((s) => ({ ...s, drawings: [...s.drawings, clone] }));
    setSelectedDrawing(clone.id);
  };
  const update = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
  const snap = (val) => settings.snapToGrid ? Math.round(val / settings.gridSize) * settings.gridSize : Math.round(val * 10) / 10;
  const handleFieldMouseDown = useCallback((e, fieldId) => {
    e.stopPropagation();
    if (drawTool !== "select") return;
    const field = settings.fields.find((f) => f.id === fieldId);
    if (!field || field.locked) return;
    setSelectedField(fieldId);
    setSelectedDrawing(null);
    setDragging({ id: fieldId, startMouseX: e.clientX, startMouseY: e.clientY, startFieldX: field.x, startFieldY: field.y });
  }, [settings.fields, drawTool]);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = (e.clientX - dragging.startMouseX) / zoom / scale;
      const dy = (e.clientY - dragging.startMouseY) / zoom / scale;
      updateField(dragging.id, { x: snap(Math.max(0, dragging.startFieldX + dx)), y: snap(Math.max(0, dragging.startFieldY + dy)) });
    };
    const onUp = () => setDragging(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, zoom, scale, settings.snapToGrid, settings.gridSize]);
  const handleDrawingMouseDown = useCallback((e, id) => {
    e.stopPropagation();
    if (drawTool !== "select") return;
    const el = settings.drawings.find((d) => d.id === id);
    if (!el || el.locked) return;
    setSelectedDrawing(id);
    setSelectedField(null);
    setDraggingDrawing({ id, startMouseX: e.clientX, startMouseY: e.clientY, startX: el.x, startY: el.y });
  }, [settings.drawings, drawTool]);
  useEffect(() => {
    if (!draggingDrawing) return;
    const onMove = (e) => {
      const dx = (e.clientX - draggingDrawing.startMouseX) / zoom / scale;
      const dy = (e.clientY - draggingDrawing.startMouseY) / zoom / scale;
      updateDrawing(draggingDrawing.id, { x: snap(Math.max(0, draggingDrawing.startX + dx)), y: snap(Math.max(0, draggingDrawing.startY + dy)) });
    };
    const onUp = () => setDraggingDrawing(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [draggingDrawing, zoom, scale, settings.snapToGrid, settings.gridSize]);
  const getCanvasMM = (e) => {
    const inner = innerRef.current;
    if (!inner) return { x: 0, y: 0 };
    const rect = inner.getBoundingClientRect();
    const px = (e.clientX - rect.left) / zoom;
    const py = (e.clientY - rect.top) / zoom;
    return { x: snap(Math.max(0, px / scale)), y: snap(Math.max(0, py / scale)) };
  };
  const handleCanvasMouseDown = (e) => {
    if (drawTool === "select") {
      setSelectedField(null);
      setSelectedDrawing(null);
      return;
    }
    const { x, y } = getCanvasMM(e);
    setDrawingInProgress({ startX: x, startY: y, currentX: x, currentY: y });
  };
  useEffect(() => {
    if (!drawingInProgress || drawTool === "select") return;
    const onMove = (e) => {
      const inner = innerRef.current;
      if (!inner) return;
      const rect = inner.getBoundingClientRect();
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const cx = snap(Math.max(0, px / scale));
      const cy = snap(Math.max(0, py / scale));
      setDrawingInProgress((prev) => prev ? { ...prev, currentX: cx, currentY: cy } : null);
    };
    const onUp = (e) => {
      if (!drawingInProgress) return;
      const inner = innerRef.current;
      if (!inner) return;
      const rect = inner.getBoundingClientRect();
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const endX = snap(Math.max(0, px / scale));
      const endY = snap(Math.max(0, py / scale));
      const x1 = Math.min(drawingInProgress.startX, endX);
      const y1 = Math.min(drawingInProgress.startY, endY);
      const x2 = Math.max(drawingInProgress.startX, endX);
      const y2 = Math.max(drawingInProgress.startY, endY);
      let el = null;
      if (drawTool === "h-line" && x2 - x1 >= 2) {
        el = makeLine("h-line", x1, drawingInProgress.startY, x2 - x1, 0);
      } else if (drawTool === "v-line" && y2 - y1 >= 2) {
        el = makeLine("v-line", drawingInProgress.startX, y1, 0, y2 - y1);
      } else if (drawTool === "border" && x2 - x1 >= 2 && y2 - y1 >= 2) {
        el = makeLine("border", x1, y1, x2 - x1, y2 - y1);
      }
      if (el) {
        setSettings((s) => ({ ...s, drawings: [...s.drawings, el] }));
        setSelectedDrawing(el.id);
        setSelectedField(null);
        setActiveTab("lines");
      }
      setDrawingInProgress(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [drawingInProgress, drawTool, zoom, scale, settings.snapToGrid, settings.gridSize]);
  const [resizingTable, setResizingTable] = useState(null); // { startMouseY, startHeight }
  useEffect(() => {
    if (!resizingTable) return;
    const onMove = (e) => {
      const dy = (e.clientY - resizingTable.startMouseY) / zoom / scale;
      const newH = Math.max(20, snap(resizingTable.startHeight + dy));
      updateField('items_table', { tableHeight: newH });
    };
    const onUp = () => setResizingTable(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [resizingTable, zoom, scale, settings.snapToGrid, settings.gridSize]);

  const [uploadedImageNaturalDims, setUploadedImageNaturalDims] = useState(null);
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      update("backgroundImage", dataUrl);
      const img = new window.Image();
      img.onload = () => {
        setUploadedImageNaturalDims({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  const suggestPaperFromPixels = (pw, ph) => {
    const ratios = [
      { size: "A4", wmm: 210, hmm: 297 },
      { size: "Letter", wmm: 215.9, hmm: 279.4 },
      { size: "A5", wmm: 148, hmm: 210 }
    ];
    for (const { size, wmm, hmm } of ratios) {
      const ratio = pw / ph;
      const portraitRatio = wmm / hmm;
      const landscapeRatio = hmm / wmm;
      if (Math.abs(ratio - portraitRatio) < 0.04) return { size, orientation: "portrait", wmm, hmm };
      if (Math.abs(ratio - landscapeRatio) < 0.04) return { size, orientation: "landscape", wmm: hmm, hmm: wmm };
    }
    const pxPerMm = pw > ph ? pw / 297 : ph / 297;
    const wCalc = Math.round(pw / pxPerMm);
    const hCalc = Math.round(ph / pxPerMm);
    return { size: "Custom", orientation: pw >= ph ? "landscape" : "portrait", wmm: Math.min(wCalc, hCalc), hmm: Math.max(wCalc, hCalc) };
  };
  const handleSave = () => {
    onSave(settings);
    toast.success("Template saved successfully");
  };
  const handleExport = () => {
    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(settings, null, 2))}`;
    const a = document.createElement("a");
    a.href = uri;
    a.download = `${settings.templateName.replace(/\s+/g, "_")}.json`;
    a.click();
    toast.success("Template exported");
  };
  const selectedF = selectedField ? (settings.fields.find((f) => f.id === selectedField) ?? null) : null;
  const selectedD = selectedDrawing ? settings.drawings.find((d) => d.id === selectedDrawing) : null;
  const categories = ["all", ...Array.from(new Set(DEFAULT_FIELDS.map((f) => f.category)))];
  // Always include ALL fields so no canvas div is ever removed from the DOM
  // (prevents Acrobat-extension removeChild crashes when toggling enabled).
  // CSS display:none hides disabled / category-filtered fields instead.
  const visibleFields = settings.fields;
  const isFieldVisible = (f) => f.enabled && (filterCategory === "all" || f.category === filterCategory);
  const isPreprinted = mode === "preprinted";
  const ghost = drawingInProgress ? (() => {
    const x1 = Math.min(drawingInProgress.startX, drawingInProgress.currentX);
    const y1 = Math.min(drawingInProgress.startY, drawingInProgress.currentY);
    const w = Math.abs(drawingInProgress.currentX - drawingInProgress.startX);
    const h = Math.abs(drawingInProgress.currentY - drawingInProgress.startY);
    return { x1, y1, w, h };
  })() : null;
  const drawToolCursor = drawTool === "select" ? "default" : "crosshair";
  return <div className="fixed inset-0 bg-[#F0F0F3] z-50 overflow-hidden flex flex-col notranslate" translate="no">

      {
    /* ── Top bar ── */
  }
      <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs transition-colors flex-shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" />Back
          </button>
          <span className="text-slate-200">|</span>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#FFF8E7] border border-[#FDE6A9] flex items-center justify-center flex-shrink-0">
              {isPreprinted ? <Printer className="h-4 w-4 text-[#9a7a00]" /> : <FileImage className="h-4 w-4 text-[#9a7a00]" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-tight truncate text-slate-800">
                {isPreprinted ? "Pre-printed Invoice Designer" : "Letterhead Invoice Designer"}
              </h1>
              <div className="text-[11px] text-slate-500 truncate leading-tight">
                {isPreprinted ? "Position values onto your pre-printed stationery" : "Lay the invoice out on top of your letterhead"}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <Badge variant="outline" className={`text-[10px] py-0 px-2 h-5 ${isPreprinted ? "border-blue-300 text-blue-700 bg-blue-50" : "border-purple-300 text-purple-700 bg-purple-50"}`}>
            {isPreprinted ? "Pre-printed" : "Letterhead"}
          </Badge>
          <span className="text-slate-200">|</span>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5 px-3" onClick={handleExport}><Download className="h-3.5 w-3.5" />Export</Button>
          <Button size="sm" className="h-7 text-[11px] gap-1.5 px-3 bg-[#F5C742] text-slate-900 hover:bg-[#e8b830] border-0" onClick={handleSave}><Save className="h-3.5 w-3.5" />Save Template</Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">

        { /* ── Left settings panel ── */ }
        <div className="w-[360px] border-r border-slate-200 bg-white flex flex-col flex-shrink-0 relative z-10 overflow-hidden">
          { /* Template name + tab bar (fixed header) */ }
          <div className="px-4 pt-3.5 pb-0 border-b border-slate-200">
            <div className="space-y-1.5 mb-3">
              <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Template Name</Label>
              <Input value={settings.templateName} onChange={(e) => update("templateName", e.target.value)} className="h-9 text-[13px] font-medium" />
            </div>
            <div className="flex overflow-x-auto -mb-px">
              {[
    { value: "paper", label: "Paper", Icon: LayoutGrid },
    { value: "upload", label: "Upload", Icon: Upload },
    { value: "fields", label: "Fields", Icon: Layers },
    { value: "lines", label: "Lines", Icon: RectangleHorizontal },
    { value: "style", label: "Style", Icon: AlignLeft }
  ].map(({ value, label, Icon }) => <button
    key={value}
    onClick={() => setActiveTab(value)}
    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === value ? "border-[#F5C742] text-slate-900 bg-[#FFFBF0]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
  >
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>)}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">

                {
    /* ── Paper tab ── */
  }
                <TabsContent value="paper" className="space-y-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-[#9a7a00]" />Paper & Canvas</CardTitle>
                      <CardDescription>Set the paper dimensions to match your physical form</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Paper Size</Label>
                          <Select value={settings.paperSize} onValueChange={(v) => update("paperSize", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                              <SelectItem value="Letter">Letter (215.9 × 279.4 mm)</SelectItem>
                              <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                              <SelectItem value="Custom">Custom Size…</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Orientation</Label>
                          <Select
    value={settings.orientation}
    onValueChange={(v) => update("orientation", v)}
    disabled={settings.paperSize === "Custom"}
  >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="portrait">Portrait</SelectItem>
                              <SelectItem value="landscape">Landscape</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {settings.paperSize === "Custom" && <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
                            <RectangleHorizontal className="h-3.5 w-3.5" />
                            Custom paper dimensions
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Width (mm)</Label>
                              <Input
    type="number"
    min="10"
    max="2000"
    step="0.5"
    value={settings.customWidth}
    onChange={(e) => update("customWidth", Math.max(10, +e.target.value))}
    className="h-8 text-sm"
  />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Height (mm)</Label>
                              <Input
    type="number"
    min="10"
    max="2000"
    step="0.5"
    value={settings.customHeight}
    onChange={(e) => update("customHeight", Math.max(10, +e.target.value))}
    className="h-8 text-sm"
  />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {[
    { label: "A3 Portrait", w: 297, h: 420 },
    { label: "A3 Landscape", w: 420, h: 297 },
    { label: "B5", w: 176, h: 250 },
    { label: "Legal", w: 215.9, h: 355.6 },
    { label: "Half Letter", w: 139.7, h: 215.9 }
  ].map((preset) => <button
    key={preset.label}
    onClick={() => setSettings((s) => ({ ...s, customWidth: preset.w, customHeight: preset.h }))}
    className="text-[10px] px-2 py-0.5 border border-amber-300 rounded hover:bg-amber-100 text-amber-800"
  >
                                {preset.label}
                              </button>)}
                          </div>
                        </div>}

                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
                        Canvas: <strong>{dims.w} × {dims.h} mm</strong> — coordinates in mm from top-left
                      </div>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 border rounded">
                          <Label className="font-normal">Show Grid</Label>
                          <Switch checked={settings.showGrid} onCheckedChange={(v) => update("showGrid", v)} />
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded">
                          <Label className="font-normal">Snap to Grid</Label>
                          <Switch checked={settings.snapToGrid} onCheckedChange={(v) => update("snapToGrid", v)} />
                        </div>
                        {settings.showGrid && <div className="space-y-2">
                            <Label>Grid Size (mm)</Label>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => update("gridSize", Math.max(1, settings.gridSize - 1))}><Minus className="h-3 w-3" /></Button>
                              <span className="w-12 text-center text-sm font-medium">{settings.gridSize} mm</span>
                              <Button variant="outline" size="sm" onClick={() => update("gridSize", Math.min(20, settings.gridSize + 1))}><Plus className="h-3 w-3" /></Button>
                            </div>
                          </div>}
                      </div>
                      <>
                          <Separator />
                          <div className="flex items-center justify-between p-2 border rounded bg-amber-50">
                            <div>
                              <Label className="font-normal">Print Values Only</Label>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {settings.printOnlyValues ? 'Only data values are printed (no field labels)' : 'Field labels + values are both printed'}
                              </div>
                            </div>
                            <Switch checked={!!settings.printOnlyValues} onCheckedChange={(v) => update("printOnlyValues", v)} />
                          </div>
                        </>
                      <Separator />
                      <div className="flex items-center justify-between p-2 border rounded bg-slate-50">
                        <div>
                          <Label className="font-normal">Continued on Next Page</Label>
                          <div className="text-xs text-muted-foreground mt-0.5">Show "Continued on Page N" at the bottom of each non-last page</div>
                        </div>
                        <Switch checked={!!settings.showContinuationText} onCheckedChange={(v) => update("showContinuationText", v)} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {
    /* ── Upload tab ── */
  }
                <TabsContent value="upload" className="space-y-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileImage className="h-4 w-4 text-[#9a7a00]" />
                        {isPreprinted ? "Pre-printed Form Image" : "Letterhead Image"}
                      </CardTitle>
                      <CardDescription>
                        {isPreprinted ? "Upload a scan of your blank pre-printed invoice form" : "Upload your company letterhead \u2014 it appears as the canvas background"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center gap-2 text-gray-500">
                          <Upload className="h-8 w-8" />
                          <span className="text-sm font-medium">Click to upload or drag & drop</span>
                          <span className="text-xs">PNG, JPG, WEBP — max 10 MB</span>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                      {settings.backgroundImage && <div className="space-y-3">
                          <div className="relative rounded-lg overflow-hidden border">
                            <img src={settings.backgroundImage} alt="Background preview" className="w-full h-32 object-contain bg-gray-50" />
                            <div className="absolute top-2 right-2">
                              <Button size="sm" variant="destructive" onClick={() => {
    update("backgroundImage", "");
    setUploadedImageNaturalDims(null);
  }}>Remove</Button>
                            </div>
                          </div>

                          {
    /* Paper size from image */
  }
                          <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <LayoutGrid className="h-3.5 w-3.5" />
                                Paper size for this scan
                              </div>
                              {uploadedImageNaturalDims && (() => {
    const suggestion = suggestPaperFromPixels(uploadedImageNaturalDims.w, uploadedImageNaturalDims.h);
    if (!suggestion) return null;
    const alreadyMatches = settings.paperSize === suggestion.size && (suggestion.size === "Custom" || settings.orientation === suggestion.orientation);
    if (alreadyMatches) return null;
    return <button
      onClick={() => {
        setSettings((s) => ({
          ...s,
          paperSize: suggestion.size,
          orientation: suggestion.orientation,
          customWidth: suggestion.wmm,
          customHeight: suggestion.hmm
        }));
        toast.success(`Paper size set to ${suggestion.size === "Custom" ? `${suggestion.wmm}\xD7${suggestion.hmm} mm` : suggestion.size} ${suggestion.orientation}`);
      }}
      className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
    >
                                    Apply detected: {suggestion.size === "Custom" ? `${suggestion.wmm}\xD7${suggestion.hmm} mm` : suggestion.size} {suggestion.orientation}
                                  </button>;
  })()}
                            </div>
                            {uploadedImageNaturalDims && <div className="text-[10px] text-slate-500">
                                Image: {uploadedImageNaturalDims.w} × {uploadedImageNaturalDims.h} px
                                {uploadedImageNaturalDims.w > 0 && (() => {
    const s = suggestPaperFromPixels(uploadedImageNaturalDims.w, uploadedImageNaturalDims.h);
    return s ? ` \u2014 matches ${s.size === "Custom" ? "custom" : s.size} ${s.orientation}` : "";
  })()}
                              </div>}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Paper Size</Label>
                                <Select value={settings.paperSize} onValueChange={(v) => update("paperSize", v)}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                                    <SelectItem value="Letter">Letter (215.9 × 279.4 mm)</SelectItem>
                                    <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                                    <SelectItem value="Custom">Custom…</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Orientation</Label>
                                <Select
    value={settings.orientation}
    onValueChange={(v) => update("orientation", v)}
    disabled={settings.paperSize === "Custom"}
  >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="portrait">Portrait</SelectItem>
                                    <SelectItem value="landscape">Landscape</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {settings.paperSize === "Custom" && <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Width (mm)</Label>
                                  <Input
    type="number"
    min="10"
    step="0.5"
    value={settings.customWidth}
    onChange={(e) => update("customWidth", Math.max(10, +e.target.value))}
    className="h-8 text-xs"
  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Height (mm)</Label>
                                  <Input
    type="number"
    min="10"
    step="0.5"
    value={settings.customHeight}
    onChange={(e) => update("customHeight", Math.max(10, +e.target.value))}
    className="h-8 text-xs"
  />
                                </div>
                              </div>}
                            <div className="text-[10px] text-slate-500">
                              Canvas: <strong>{dims.w} × {dims.h} mm</strong> — fields positioned against these dimensions
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                            <CheckSquare className="h-4 w-4 flex-shrink-0" />
                            Background uploaded — drag fields to position them
                          </div>
                        </div>}
                      {!settings.backgroundImage && <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded border border-amber-200">
                          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <div><strong>Tip:</strong> Scan at 150–300 DPI for best alignment. After upload, set the paper size to match your physical form dimensions.</div>
                        </div>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Canvas View</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-normal">Show Sample Values</Label>
                        <Switch checked={showSampleValues} onCheckedChange={setShowSampleValues} />
                      </div>
                      <div className="space-y-2">
                        <Label>Zoom</Label>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(1)))}><ZoomOut className="h-3 w-3" /></Button>
                          <span className="w-14 text-center text-sm font-medium">{Math.round(zoom * 100)}%</span>
                          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}><ZoomIn className="h-3 w-3" /></Button>
                          <Button variant="outline" size="sm" onClick={() => setZoom(0.85)}><RotateCcw className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {
    /* ── Fields tab ── */
  }
                <TabsContent value="fields" className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {categories.map((cat) => <button
    key={cat}
    onClick={() => setFilterCategory(cat)}
    className={`px-2 py-1 text-xs rounded-full border transition-colors ${filterCategory === cat ? "bg-[#F5C742] border-[#F5C742] text-black font-semibold" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}
  >
                        {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                      </button>)}
                  </div>
                  {(filterCategory === "all" ? Object.keys(CATEGORY_LABELS) : [filterCategory]).map((cat) => {
    const catFields = settings.fields.filter((f) => f.category === cat && (filterCategory === "all" || filterCategory === cat));
    if (catFields.length === 0) return null;
    return <Card key={cat}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                            {CATEGORY_LABELS[cat]}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5 pt-0">
                          {catFields.map((field) => {
    const isSel = selectedField === field.id;
    return <div
      key={field.id}
      className={`rounded-lg border transition-all ${isSel ? "border-[#F5C742] bg-[#F5C742]/5 shadow-sm" : field.enabled ? "border-gray-200 hover:border-gray-300" : "border-gray-100 bg-gray-50/60"}`}
    >
                              { /* compact header row */ }
                              <div
      className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer"
      onClick={() => {
        setSelectedField(field.id);
        setSelectedDrawing(null);
      }}
    >
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: field.enabled ? CATEGORY_COLORS[field.category] : "#cbd5e1" }} />
                                <span className={`text-xs font-medium flex-1 truncate ${field.enabled ? "text-gray-700" : "text-gray-400"}`}>{field.label}</span>
                                <span
                                  className="w-11 text-right text-[10px] text-muted-foreground tabular-nums hidden sm:inline-block"
                                  style={{ visibility: field.enabled && !isSel ? "visible" : "hidden" }}
                                >
                                  {field.x},{field.y}
                                </span>
                                <span className="h-3 w-3 flex-shrink-0" style={{ visibility: field.locked ? "visible" : "hidden" }}>
                                  <Lock className="h-3 w-3 text-amber-500" />
                                </span>
                                <button
      title={field.locked ? "Unlock position" : "Lock position"}
      onClick={(e) => {
        e.stopPropagation();
        updateField(field.id, { locked: !field.locked });
      }}
      className="p-0.5 rounded hover:bg-gray-100 flex-shrink-0"
    >
                                  {field.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3 text-gray-400" />}
                                </button>
                                <Switch checked={field.enabled} onCheckedChange={(v) => updateField(field.id, { enabled: v })} onClick={(e) => e.stopPropagation()} />
                              </div>

                              { /* inline editor — always mounted, hidden via CSS to prevent Acrobat-extension removeChild errors */ }
                              <div className="px-2.5 pb-2.5 pt-1.5 border-t border-dashed border-gray-200" style={{ display: isSel && field.enabled ? undefined : "none" }} onClick={(e) => e.stopPropagation()}>
                                  <div className={isImageField(field.id) ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-4 gap-1.5"}>
                                    <div className="space-y-0.5">
                                      <Label className="text-[10px] text-muted-foreground">X mm</Label>
                                      <Input type="number" step="0.5" value={field.x} onChange={(e) => updateField(field.id, { x: +e.target.value })} className="h-7 text-xs px-1.5" />
                                    </div>
                                    <div className="space-y-0.5">
                                      <Label className="text-[10px] text-muted-foreground">Y mm</Label>
                                      <Input type="number" step="0.5" value={field.y} onChange={(e) => updateField(field.id, { y: +e.target.value })} className="h-7 text-xs px-1.5" />
                                    </div>
                                    <div className="space-y-0.5">
                                      <Label className="text-[10px] text-muted-foreground">{isImageField(field.id) ? "Size" : "W mm"}</Label>
                                      <Input type="number" step="1" value={field.width} onChange={(e) => updateField(field.id, { width: +e.target.value })} className="h-7 text-xs px-1.5" />
                                    </div>
                                    {!isImageField(field.id) && <div className="space-y-0.5">
                                      <Label className="text-[10px] text-muted-foreground">Font</Label>
                                      <Input type="number" step="0.5" value={field.fontSize} onChange={(e) => updateField(field.id, { fontSize: +e.target.value })} className="h-7 text-xs px-1.5" />
                                    </div>}
                                  </div>

                                  {field.id === "items_table" && (() => {
    const cols = field.columns || DEFAULT_TABLE_COLUMNS;
    const enabledCount = OVERLAY_TABLE_COLUMNS.filter((c) => cols[c.key]).length;
    return <div className="mt-2.5">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <Label className="text-[11px] font-semibold text-gray-700">Table Columns</Label>
                                        <span className="text-[10px] text-muted-foreground">{enabledCount}/{OVERLAY_TABLE_COLUMNS.length}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-1">
                                        {OVERLAY_TABLE_COLUMNS.map((col) => {
      const on = Boolean(cols[col.key]);
      return <button
        key={col.key}
        onClick={() => updateField("items_table", { columns: { ...cols, [col.key]: !on } })}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors text-left ${on ? "border-[#F5C742] bg-[#F5C742]/10 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
      >
                                            {on ? <CheckSquare className="h-3 w-3 text-[#9a7a00] flex-shrink-0" /> : <Square className="h-3 w-3 flex-shrink-0" />}
                                            <span className="truncate">{col.label}</span>
                                          </button>;
    })}
                                      </div>
                                      <div className="flex items-center justify-between mt-2 px-2 py-1.5 border rounded">
                                        <Label className="text-[11px] font-normal">Column Headers</Label>
                                        <Switch checked={field.showHeader !== false} onCheckedChange={(v) => updateField("items_table", { showHeader: v })} />
                                      </div>
                                      <div className="flex items-center justify-between mt-1.5 px-2 py-1.5 border rounded">
                                        <Label className="text-[11px] font-normal">Zebra Striping</Label>
                                        <Switch checked={Boolean(field.zebra)} onCheckedChange={(v) => updateField("items_table", { zebra: v })} onClick={(e) => e.stopPropagation()} />
                                      </div>
                                      <div className="mt-2 pt-2 border-t border-dashed border-gray-200 space-y-1.5">
                                        <Label className="text-[11px] font-semibold text-blue-700">Continuation Pages</Label>
                                        <div className="flex items-center justify-between px-2 py-1.5 border rounded">
                                          <Label className="text-[11px] font-normal">Repeat column header</Label>
                                          <Switch checked={field.repeatHeaderOnContinuation !== false} onCheckedChange={(v) => updateField("items_table", { repeatHeaderOnContinuation: v })} onClick={(e) => e.stopPropagation()} />
                                        </div>
                                        <div className="space-y-0.5">
                                          <Label className="text-[10px] text-muted-foreground">Table Y on page 2+ (mm)</Label>
                                          <Input type="number" step="1" value={field.continuationY ?? ""} placeholder={`${field.y ?? 0} (same as p1)`} onChange={(e) => updateField("items_table", { continuationY: e.target.value !== "" ? +e.target.value : undefined })} className="h-7 text-xs px-1.5" />
                                        </div>
                                      </div>
                                    </div>;
  })()}

                                  {!isImageField(field.id) && field.id !== "items_table" && <button
      onClick={() => setActiveTab("style")}
      className="mt-2 w-full text-[11px] text-[#9a7a00] hover:text-[#7a6000] font-medium text-left"
    >
                                      Font, color & alignment ›
                                    </button>}
                                </div>
                            </div>;
  })}
                        </CardContent>
                      </Card>;
  })}
                </TabsContent>

                {
    /* ── Lines tab ── */
  }
                <TabsContent value="lines" className="space-y-3">
                  {
    /* Draw tool picker */
  }
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Square className="h-4 w-4 text-[#9a7a00]" />Drawing Tools</CardTitle>
                      <CardDescription>Select a tool, then drag on the canvas to draw</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
    { id: "select", label: "Select", icon: MousePointer2, desc: "Move & edit" },
    { id: "h-line", label: "Horizontal Line", icon: HLineIcon, desc: "Drag left\u2192right" },
    { id: "v-line", label: "Vertical Line", icon: SeparatorVertical, desc: "Drag top\u2192bottom" },
    { id: "border", label: "Box / Border", icon: RectangleHorizontal, desc: "Drag to draw box" }
  ].map((tool) => {
    const Icon = tool.icon;
    const active = drawTool === tool.id;
    return <button
      key={tool.id}
      onClick={() => setDrawTool(tool.id)}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${active ? "border-[#F5C742] bg-[#F5C742]/10 font-semibold" : "border-gray-200 hover:border-gray-400"}`}
    >
                              <Icon className={`h-5 w-5 ${active ? "text-[#9a7a00]" : "text-gray-500"}`} />
                              <span className="text-xs font-medium">{tool.label}</span>
                              <span className="text-[10px] text-muted-foreground">{tool.desc}</span>
                            </button>;
  })}
                      </div>
                      {drawTool !== "select" && <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 p-2 rounded border border-blue-200">
                          <Info className="h-4 w-4 flex-shrink-0" />
                          <strong>{drawTool === "h-line" ? "Horizontal Line" : drawTool === "v-line" ? "Vertical Line" : "Border"} mode active</strong> — drag on the canvas
                        </div>}
                    </CardContent>
                  </Card>

                  {
    /* Drawn elements list */
  }
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Drawing Elements ({settings.drawings.length})</span>
                        {settings.drawings.length > 0 && <Button
    size="sm"
    variant="ghost"
    className="text-red-500 text-xs h-6"
    onClick={() => {
      setSettings((s) => ({ ...s, drawings: [] }));
      setSelectedDrawing(null);
    }}
  >
                            Clear All
                          </Button>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {settings.drawings.length === 0 ? <div className="text-center py-6 text-muted-foreground text-sm">
                          <Square className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No drawing elements yet. Select a tool above and drag on the canvas.
                        </div> : <div className="space-y-2">
                          {settings.drawings.map((el) => {
    const isSelected = selectedDrawing === el.id;
    const TypeIcon = el.type === "h-line" ? HLineIcon : el.type === "v-line" ? SeparatorVertical : RectangleHorizontal;
    return <div
      key={el.id}
      className={`p-3 border rounded-lg cursor-pointer transition-all ${isSelected ? "border-[#F5C742] bg-[#F5C742]/5" : "hover:border-gray-400"} ${el.locked ? "opacity-60" : ""}`}
      onClick={() => {
        setSelectedDrawing(el.id);
        setSelectedField(null);
      }}
    >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <TypeIcon className="h-4 w-4 text-gray-500" />
                                    <div>
                                      <div className="text-xs font-semibold">{el.label}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {el.type === "border" ? `${el.width.toFixed(0)}\xD7${el.height.toFixed(0)} mm at (${el.x.toFixed(0)}, ${el.y.toFixed(0)})` : el.type === "h-line" ? `${el.width.toFixed(0)} mm wide at y=${el.y.toFixed(0)}` : `${el.height.toFixed(0)} mm tall at x=${el.x.toFixed(0)}`}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-4 h-4 rounded border" style={{ background: el.color }} />
                                    <button onClick={(e) => {
      e.stopPropagation();
      updateDrawing(el.id, { locked: !el.locked });
    }} className="p-0.5 hover:bg-gray-100 rounded">
                                      {el.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3 text-gray-400" />}
                                    </button>
                                    <button onClick={(e) => {
      e.stopPropagation();
      duplicateDrawing(el.id);
    }} className="p-0.5 hover:bg-gray-100 rounded">
                                      <Copy className="h-3 w-3 text-gray-400" />
                                    </button>
                                    <button onClick={(e) => {
      e.stopPropagation();
      deleteDrawing(el.id);
    }} className="p-0.5 hover:bg-red-100 rounded">
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                    </button>
                                  </div>
                                </div>
                              </div>;
  })}
                        </div>}
                    </CardContent>
                  </Card>

                  {
    /* Selected drawing element editor */
  }
                  {selectedD && <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Edit: {selectedD.label}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {
    /* Position inputs */
  }
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">X (mm)</Label>
                            <Input type="number" step="0.5" value={selectedD.x} onChange={(e) => updateDrawing(selectedD.id, { x: +e.target.value })} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Y (mm)</Label>
                            <Input type="number" step="0.5" value={selectedD.y} onChange={(e) => updateDrawing(selectedD.id, { y: +e.target.value })} className="h-8 text-xs" />
                          </div>
                          {(selectedD.type === "h-line" || selectedD.type === "border") && <div className="space-y-1">
                              <Label className="text-xs">Width (mm)</Label>
                              <Input type="number" step="1" value={selectedD.width} onChange={(e) => updateDrawing(selectedD.id, { width: Math.max(1, +e.target.value) })} className="h-8 text-xs" />
                            </div>}
                          {(selectedD.type === "v-line" || selectedD.type === "border") && <div className="space-y-1">
                              <Label className="text-xs">Height (mm)</Label>
                              <Input type="number" step="1" value={selectedD.height} onChange={(e) => updateDrawing(selectedD.id, { height: Math.max(1, +e.target.value) })} className="h-8 text-xs" />
                            </div>}
                          <div className="space-y-1">
                            <Label className="text-xs">Thickness (px)</Label>
                            <Input type="number" step="0.5" min="0.5" max="20" value={selectedD.thickness} onChange={(e) => updateDrawing(selectedD.id, { thickness: +e.target.value })} className="h-8 text-xs" />
                          </div>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <Label className="text-xs">Line Color</Label>
                          <div className="flex gap-2">
                            <Input type="color" value={selectedD.color} onChange={(e) => updateDrawing(selectedD.id, { color: e.target.value })} className="w-16 h-9" />
                            <Input value={selectedD.color} onChange={(e) => updateDrawing(selectedD.id, { color: e.target.value })} className="h-9 text-xs" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <Label className="text-xs font-medium">Dashed Line</Label>
                            <div className="text-[10px] text-muted-foreground">Draw as dashed / dotted</div>
                          </div>
                          <Switch checked={selectedD.dashed} onCheckedChange={(v) => updateDrawing(selectedD.id, { dashed: v })} />
                        </div>
                        {selectedD.type === "border" && <>
                            <Separator />
                            <div className="space-y-2">
                              <Label className="text-xs">Fill Color</Label>
                              <div className="flex gap-2">
                                <Input type="color" value={selectedD.fillColor} onChange={(e) => updateDrawing(selectedD.id, { fillColor: e.target.value })} className="w-16 h-9" />
                                <Input value={selectedD.fillColor} onChange={(e) => updateDrawing(selectedD.id, { fillColor: e.target.value })} className="h-9 text-xs" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Fill Opacity ({Math.round(selectedD.fillOpacity * 100)}%)</Label>
                              <input
    type="range"
    min="0"
    max="1"
    step="0.05"
    value={selectedD.fillOpacity}
    onChange={(e) => updateDrawing(selectedD.id, { fillOpacity: +e.target.value })}
    className="w-full h-2 accent-[#F5C742]"
  />
                            </div>
                          </>}
                        <Separator />
                        <div className="flex items-center justify-between p-2 border rounded">
                          <Label className="text-xs font-normal">Lock Position</Label>
                          <Switch checked={selectedD.locked} onCheckedChange={(v) => updateDrawing(selectedD.id, { locked: v })} />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => duplicateDrawing(selectedD.id)}>
                            <Copy className="h-3 w-3 mr-1" />Duplicate
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteDrawing(selectedD.id)}>
                            <Trash2 className="h-3 w-3 mr-1" />Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>}
                </TabsContent>

                {
    /* ── Style tab (field style editor) ── */
  }
                <TabsContent value="style" className="space-y-3">
                  {/* Always mount both branches; show/hide via CSS to prevent Acrobat-extension removeChild errors */}
                  <div style={{ display: selectedF ? undefined : "none" }}>
                  {selectedF ? <>
                      {selectedF.id === "items_table" && <Card>
                          <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2"><LayoutGrid className="h-4 w-4" />Table Columns</CardTitle>
                            <CardDescription>Choose which columns print in the items table</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-1.5">
                              {OVERLAY_TABLE_COLUMNS.map((col) => {
    const cols = selectedF.columns || DEFAULT_TABLE_COLUMNS;
    const on = Boolean(cols[col.key]);
    return <button
      key={col.key}
      onClick={() => updateField("items_table", { columns: { ...cols, [col.key]: !on } })}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-xs transition-colors text-left ${on ? "border-[#F5C742] bg-[#F5C742]/10 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
    >
                                  {on ? <CheckSquare className="h-3.5 w-3.5 text-[#9a7a00] flex-shrink-0" /> : <Square className="h-3.5 w-3.5 flex-shrink-0" />}
                                  <span className="truncate">{col.label}</span>
                                </button>;
  })}
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between p-2 border rounded">
                              <Label className="text-xs font-normal">Show Column Headers</Label>
                              <Switch checked={selectedF.showHeader !== false} onCheckedChange={(v) => updateField("items_table", { showHeader: v })} />
                            </div>
                            <div className="flex items-center justify-between p-2 border rounded">
                              <Label className="text-xs font-normal">Zebra Striping</Label>
                              <Switch checked={Boolean(selectedF.zebra)} onCheckedChange={(v) => updateField("items_table", { zebra: v })} />
                            </div>
                            <div className="flex items-center justify-between p-2 border rounded">
                              <Label className="text-xs font-normal">Row Separator Lines</Label>
                              <Switch checked={selectedF.showRowLines !== false} onCheckedChange={(v) => updateField("items_table", { showRowLines: v })} />
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {OVERLAY_TABLE_COLUMNS.filter((c) => (selectedF.columns || DEFAULT_TABLE_COLUMNS)[c.key]).length} of {OVERLAY_TABLE_COLUMNS.length} columns enabled. Drag the ▬ handle on the canvas to set table height.
                            </div>
                          </CardContent>
                        </Card>}

                      {/* ── Continuation-page settings (items_table only) ── */}
                      {selectedF.id === "items_table" && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-[#9a7a00]" />Multi-Page / Continuation</CardTitle>
                            <CardDescription>Control how the items table behaves when it overflows to the next page</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Table height on page 1 (mm)</Label>
                              <div className="flex gap-2 items-center">
                                <Input type="number" step="1" min="20" value={selectedF.tableHeight || ""} placeholder="Drag ▬ on canvas" onChange={(e) => updateField("items_table", { tableHeight: e.target.value ? +e.target.value : undefined })} className="h-8 text-xs" />
                                {selectedF.tableHeight > 0 && (
                                  <span className="text-[10px] text-orange-600 whitespace-nowrap">
                                    ~{Math.max(1, Math.floor(selectedF.tableHeight / ((selectedF.fontSize || 9) * 0.353 + 4)))} rows
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">Or drag the brown ▬ handle at the bottom of the table block on the canvas.</div>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <Label className="text-xs font-normal">Repeat column header on continuation pages</Label>
                                <div className="text-[10px] text-muted-foreground mt-0.5">Show #, Item Name, Qty… row at top of page 2+</div>
                              </div>
                              <Switch checked={selectedF.repeatHeaderOnContinuation !== false} onCheckedChange={(v) => updateField("items_table", { repeatHeaderOnContinuation: v })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Table Y on continuation pages (mm)</Label>
                              <Input type="number" step="1" value={selectedF.continuationY ?? ""} placeholder={`Same as page 1 (${selectedF.y ?? 0} mm)`} onChange={(e) => updateField("items_table", { continuationY: e.target.value !== "" ? +e.target.value : undefined })} className="h-8 text-xs" />
                              <div className="text-[10px] text-muted-foreground">Where items start on page 2 onwards. Use a smaller Y so items start higher on the blank continuation page. A blue dashed line appears on the canvas when set.</div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[selectedF.category] }} />
                            {selectedF.label}
                          </CardTitle>
                          <CardDescription>Style and position this field</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* ── Enable/Disable ── */}
                          <div className="flex items-center justify-between px-2 py-1.5 border border-slate-200 rounded-md bg-slate-50">
                            <div>
                              <Label className="text-xs font-medium">Field Enabled</Label>
                              <div className="text-[10px] text-muted-foreground mt-0.5">Show or hide this field on the document</div>
                            </div>
                            <Switch checked={selectedF.enabled !== false} onCheckedChange={(v) => updateField(selectedF.id, { enabled: v })} />
                          </div>
                          {/* ── Label text ── */}
                          {!isImageField(selectedF.id) && (
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Label Text</Label>
                              <Input value={selectedF.label} onChange={(e) => updateField(selectedF.id, { label: e.target.value })} className="h-8 text-xs" placeholder="e.g. In Words:" />
                              <div className="text-[10px] text-muted-foreground">Renames this field everywhere: canvas, Fields list, and the prefix printed when "Print Label Text" is on.</div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">X Position (mm)</Label><Input type="number" step="0.5" value={selectedF.x} onChange={(e) => updateField(selectedF.id, { x: +e.target.value })} className="h-8 text-xs" /></div>
                            <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Y Position (mm)</Label><Input type="number" step="0.5" value={selectedF.y} onChange={(e) => updateField(selectedF.id, { y: +e.target.value })} className="h-8 text-xs" /></div>
                            <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Width (mm)</Label><Input type="number" step="1" value={selectedF.width} onChange={(e) => updateField(selectedF.id, { width: +e.target.value })} className="h-8 text-xs" /></div>
                            <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Font Size (pt)</Label><Input type="number" step="0.5" value={selectedF.fontSize} onChange={(e) => updateField(selectedF.id, { fontSize: +e.target.value })} className="h-8 text-xs" /></div>
                          </div>
                          <Separator />
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Font Family</Label>
                            <Select value={selectedF.fontFamily} onValueChange={(v) => updateField(selectedF.id, { fontFamily: v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{fontFamilies.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-1.5">
                            {[
    { key: "bold", Icon: Bold, active: selectedF.bold, toggle: () => updateField(selectedF.id, { bold: !selectedF.bold }) },
    { key: "italic", Icon: Italic, active: selectedF.italic, toggle: () => updateField(selectedF.id, { italic: !selectedF.italic }) }
  ].map(({ key, Icon, active, toggle }) => <Button key={key} type="button" size="sm" variant={active ? "default" : "outline"} className={`h-8 w-9 p-0 ${active ? "bg-[#F5C742] text-slate-900 hover:bg-[#e8b830]" : ""}`} onClick={toggle}>
                                <Icon className="h-3.5 w-3.5" />
                              </Button>)}
                            <div className="w-px bg-slate-200 mx-0.5" />
                            {["left", "center", "right"].map((a) => <Button key={a} type="button" size="sm" variant={selectedF.align === a ? "default" : "outline"} className={`h-8 w-9 p-0 ${selectedF.align === a ? "bg-[#F5C742] text-slate-900 hover:bg-[#e8b830]" : ""}`} onClick={() => updateField(selectedF.id, { align: a })}>
                                {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
                              </Button>)}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Text Color</Label>
                            <div className="flex gap-2">
                              <Input type="color" value={selectedF.color} onChange={(e) => updateField(selectedF.id, { color: e.target.value })} className="w-12 h-8 p-1" />
                              <Input value={selectedF.color} onChange={(e) => updateField(selectedF.id, { color: e.target.value })} className="h-8 text-xs" />
                            </div>
                          </div>
                          {/* ── Custom print text ── */}
                          {!isImageField(selectedF.id) && selectedF.id !== "items_table" && <>
                            <Separator />
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">Custom Print Text</Label>
                              <Input value={selectedF.customText || ""} onChange={(e) => updateField(selectedF.id, { customText: e.target.value || undefined })} placeholder={selectedF.sampleValue || "Use invoice data value…"} className="h-8 text-xs" />
                              <div className="text-[10px] text-muted-foreground">Override what prints for this field. Leave empty to use the live invoice value.</div>
                            </div>
                          </>}
                          <Separator />
                          <div className="flex items-center justify-between px-2 py-1.5 border border-slate-200 rounded-md">
                            <div>
                              <Label className="text-xs font-normal">Print Label Text</Label>
                              <div className="text-[10px] text-muted-foreground mt-0.5">"Invoice No:" before the value</div>
                            </div>
                            <Switch checked={selectedF.printLabel} onCheckedChange={(v) => updateField(selectedF.id, { printLabel: v })} />
                          </div>
                          <div className="flex items-center justify-between px-2 py-1.5 border border-slate-200 rounded-md">
                            <Label className="text-xs font-normal">Lock Position</Label>
                            <Switch checked={selectedF.locked} onCheckedChange={(v) => updateField(selectedF.id, { locked: v })} />
                          </div>
                        </CardContent>
                      </Card>
                      <div className="p-2.5 bg-[#FFFBF0] rounded-lg border border-[#FDE6A9] text-xs text-slate-600 space-y-1">
                        <div className="font-semibold text-[11px] text-[#9a7a00] uppercase tracking-wide">Sample Value Preview</div>
                        <div style={{ fontFamily: selectedF.fontFamily, fontSize: `${selectedF.fontSize}pt`, fontWeight: selectedF.bold ? 700 : 400, fontStyle: selectedF.italic ? "italic" : "normal", color: selectedF.color, textAlign: selectedF.align }}>
                          {selectedF.printLabel ? `${selectedF.label}: ` : ""}{selectedF.customText || selectedF.sampleValue}
                        </div>
                      </div>
                    </> : null}
                  </div>
                  <div style={{ display: selectedF ? "none" : undefined }} className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-3">
                    <Layers className="h-12 w-12" />
                    <div className="font-medium text-sm">No field selected</div>
                    <div className="text-sm">Click a field on the canvas or in the Fields tab to edit its style and position</div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </div>

        {
    /* ── Canvas area ── */
  }
        <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-100 to-slate-200 p-6">

          {
    /* Toolbar above canvas */
  }
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1 bg-white rounded-lg border shadow-sm px-2 py-1">
              <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(1)))} className="p-1 hover:bg-gray-100 rounded"><ZoomOut className="h-4 w-4" /></button>
              <span className="text-xs font-medium w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))} className="p-1 hover:bg-gray-100 rounded"><ZoomIn className="h-4 w-4" /></button>
            </div>

            {
    /* Draw tool quick-select in toolbar */
  }
            <div className="flex items-center bg-white rounded-lg border shadow-sm divide-x overflow-hidden">
              {[
    { id: "select", Icon: MousePointer2, title: "Select & Move" },
    { id: "h-line", Icon: HLineIcon, title: "Horizontal Line" },
    { id: "v-line", Icon: SeparatorVertical, title: "Vertical Line" },
    { id: "border", Icon: RectangleHorizontal, title: "Box / Border" }
  ].map(({ id, Icon, title }) => <button
    key={id}
    title={title}
    onClick={() => {
      setDrawTool(id);
      if (id !== "select") setActiveTab("lines");
    }}
    className={`p-2 transition-colors ${drawTool === id ? "bg-[#F5C742] text-black" : "hover:bg-gray-100 text-gray-600"}`}
  >
                  <Icon className="h-4 w-4" />
                </button>)}
            </div>

            <button
    onClick={() => setShowSampleValues((s) => !s)}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border shadow-sm transition-colors ${showSampleValues ? "bg-white border-gray-300" : "bg-gray-800 border-gray-800 text-white"}`}
  >
              {showSampleValues ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showSampleValues ? "Sample values" : "Field names"}
            </button>

            {drawTool === "select" ? <span className="text-xs text-gray-500 bg-white border shadow-sm rounded-lg px-3 py-1.5 hidden lg:inline-flex items-center">
                <Move className="h-3.5 w-3.5 inline mr-1" />Drag to reposition · Click to select
              </span> : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-300 shadow-sm rounded-lg px-3 py-1.5">
                {drawTool === "h-line" ? "\u2192 Drag left\u2013right to draw a horizontal line" : drawTool === "v-line" ? "\u2193 Drag top\u2013bottom to draw a vertical line" : "\u2B1C Drag to draw a box / border"}
              </span>}

            {(selectedField || selectedDrawing) && <button onClick={() => {
    setSelectedField(null);
    setSelectedDrawing(null);
  }} className="text-xs px-3 py-1.5 bg-white border shadow-sm rounded-lg hover:bg-gray-50">
                ✕ Deselect
              </button>}

            <div className="ml-auto flex items-center gap-2.5 bg-white border shadow-sm rounded-lg px-3 py-1.5 flex-wrap">
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => <span key={cat} className="flex items-center gap-1 text-[11px] text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                  {label}
                </span>)}
            </div>
          </div>

          {
    /* The canvas */
  }
          <div className="flex justify-center">
            <div
    ref={canvasRef}
    className="relative shadow-2xl"
    style={{ width: CANVAS_W_PX * zoom, height: CANVAS_H_PX * zoom, cursor: dragging || draggingDrawing ? "grabbing" : drawToolCursor }}
    onMouseDown={handleCanvasMouseDown}
    onClick={() => {
      if (drawTool === "select") {
        setSelectedField(null);
        setSelectedDrawing(null);
      }
    }}
  >
              <div ref={innerRef} style={{ width: CANVAS_W_PX, height: CANVAS_H_PX, transform: `scale(${zoom})`, transformOrigin: "top left", position: "relative" }}>

                {
    /* Paper background */
  }
                <div style={{ position: "absolute", inset: 0, background: settings.backgroundImage ? `url(${settings.backgroundImage}) center center / cover no-repeat` : "#fff", border: "1px solid #ccc" }} />

                {
    /* Grid */
  }
                {settings.showGrid && <div style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: 0.25,
    backgroundImage: `linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)`,
    backgroundSize: `${settings.gridSize * scale}px ${settings.gridSize * scale}px`
  }} />}

                {
    /* Ruler */
  }
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "16px", pointerEvents: "none" }}>
                  {Array.from({ length: Math.ceil(dims.w / 10) + 1 }, (_, i) => i * 10).map((mm) => <div key={mm} style={{ position: "absolute", left: mm * scale, top: 0, fontSize: "7px", color: "#94a3b8", transform: "translateX(-50%)" }}>
                      {mm > 0 && mm}
                    </div>)}
                </div>

                {
    /* Drawing elements */
  }
                {settings.drawings.map((el) => {
    const isSel = selectedDrawing === el.id;
    const selColor = "#F5C742";
    return <div
      key={el.id}
      onMouseDown={(e) => handleDrawingMouseDown(e, el.id)}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDrawing(el.id);
        setSelectedField(null);
        setActiveTab("lines");
      }}
      style={{
        position: "absolute",
        left: el.x * scale,
        top: el.y * scale,
        zIndex: isSel ? 25 : 5,
        cursor: el.locked ? "not-allowed" : drawTool === "select" ? "move" : "crosshair",
        pointerEvents: drawTool === "select" ? "auto" : "none"
      }}
    >
                      {el.type === "h-line" && <div style={{
      width: el.width * scale,
      height: Math.max(el.thickness * 2, 8),
      display: "flex",
      alignItems: "center",
      outline: isSel ? `2px solid ${selColor}` : "none",
      outlineOffset: "2px"
    }}>
                          <div style={{
      width: "100%",
      height: 0,
      borderTop: `${el.thickness}px ${el.dashed ? "dashed" : "solid"} ${el.color}`
    }} />
                        </div>}
                      {el.type === "v-line" && <div style={{
      height: el.height * scale,
      width: Math.max(el.thickness * 2, 8),
      display: "flex",
      justifyContent: "center",
      outline: isSel ? `2px solid ${selColor}` : "none",
      outlineOffset: "2px"
    }}>
                          <div style={{
      height: "100%",
      width: 0,
      borderLeft: `${el.thickness}px ${el.dashed ? "dashed" : "solid"} ${el.color}`
    }} />
                        </div>}
                      {el.type === "border" && <div style={{
      width: el.width * scale,
      height: el.height * scale,
      border: `${el.thickness}px ${el.dashed ? "dashed" : "solid"} ${el.color}`,
      backgroundColor: el.fillOpacity > 0 ? el.fillColor + Math.round(el.fillOpacity * 255).toString(16).padStart(2, "0") : "transparent",
      outline: isSel ? `2px solid ${selColor}` : "none",
      outlineOffset: "2px",
      boxSizing: "border-box"
    }} />}

                      {
      /* Selection handles for border */
    }
                      {isSel && el.type === "border" && <>
                          {[
      { left: "-4px", top: "-4px" },
      { left: "50%", top: "-4px", marginLeft: "-4px" },
      { right: "-4px", top: "-4px" },
      { left: "-4px", top: "50%", marginTop: "-4px" },
      { right: "-4px", top: "50%", marginTop: "-4px" },
      { left: "-4px", bottom: "-4px" },
      { left: "50%", bottom: "-4px", marginLeft: "-4px" },
      { right: "-4px", bottom: "-4px" }
    ].map((pos, i) => <div key={i} style={{ position: "absolute", width: "8px", height: "8px", background: "#fff", border: `2px solid ${selColor}`, borderRadius: "2px", ...pos }} />)}
                        </>}
                    </div>;
  })}

                {
    /* Ghost element being drawn */
  }
                {ghost && drawTool !== "select" && <div style={{ position: "absolute", left: ghost.x1 * scale, top: ghost.y1 * scale, pointerEvents: "none", zIndex: 30 }}>
                    {drawTool === "h-line" && <div style={{ width: ghost.w * scale, height: 8, display: "flex", alignItems: "center" }}>
                        <div style={{ width: "100%", borderTop: "1.5px dashed #F5C742" }} />
                      </div>}
                    {drawTool === "v-line" && <div style={{ height: ghost.h * scale, width: 8, display: "flex", justifyContent: "center" }}>
                        <div style={{ height: "100%", borderLeft: "1.5px dashed #F5C742" }} />
                      </div>}
                    {drawTool === "border" && ghost.w > 2 && ghost.h > 2 && <div style={{ width: ghost.w * scale, height: ghost.h * scale, border: "1.5px dashed #F5C742", background: "rgba(245, 199, 66, 0.06)", boxSizing: "border-box" }} />}
                  </div>}

                {
    /* Alignment guide lines — crosshair at the selected field/drawing position */
  }
                {(() => {
    const af = selectedF || (selectedD ? { x: selectedD.x, y: selectedD.y, width: selectedD.width || 0 } : null);
    if (!af || drawTool !== "select") return null;
    const guideColor = "rgba(59,130,246,0.55)";
    const labelStyle = {
      position: "absolute", background: "rgba(59,130,246,0.82)", color: "#fff",
      fontSize: "6px", padding: "1px 3px", borderRadius: "2px", whiteSpace: "nowrap", pointerEvents: "none"
    };
    return <>
      {/* horizontal line at field's top edge */}
      <div style={{ position: "absolute", left: 0, right: 0, top: af.y * scale, height: 0, borderTop: `1px dashed ${guideColor}`, pointerEvents: "none", zIndex: 8 }}>
        <span style={{ ...labelStyle, left: 2, top: -10 }}>{af.y.toFixed(1)} mm</span>
      </div>
      {/* vertical line at field's left edge */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: af.x * scale, width: 0, borderLeft: `1px dashed ${guideColor}`, pointerEvents: "none", zIndex: 8 }}>
        <span style={{ ...labelStyle, top: 2, left: 3 }}>{af.x.toFixed(1)} mm</span>
      </div>
      {/* vertical line at field's right edge */}
      {af.width > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: (af.x + af.width) * scale, width: 0, borderLeft: `1px dashed ${guideColor}`, opacity: 0.55, pointerEvents: "none", zIndex: 8 }}>
        <span style={{ ...labelStyle, top: 18, left: 3 }}>{(af.x + af.width).toFixed(1)}</span>
      </div>}
    </>;
  })()}

                {
    /* Data fields */
  }
                {visibleFields.map((field) => {
    const isSelected = selectedField === field.id;
    const displayText = field.customText?.trim() || field.sampleValue;
    const text = showSampleValues ? field.printLabel ? `${field.label}: ${displayText}` : displayText : field.label;
    const isTotalsNumeric = TOTALS_NUMERIC_IDS.has(field.id) && showSampleValues && field.printLabel && !field.customText?.trim();
    const numericSampleText = isTotalsNumeric ? (displayText || '').replace(/^[A-Z]{2,4}\s+/, '') : '';
    const isTableField = field.id === "items_table";
    const isImg = isImageField(field.id);
    const isQR = field.id === "qr_code";
    const tableCols = isTableField ? OVERLAY_TABLE_COLUMNS.filter((c) => (field.columns || DEFAULT_TABLE_COLUMNS)[c.key]) : [];
    const tableGrid = tableCols.map((c) => `${c.flex}fr`).join(" ");
    const tableHeightPx = isTableField && field.tableHeight > 0 ? field.tableHeight * scale : null;
    const fieldVisible = isFieldVisible(field);
    return <div
      key={field.id}
      onMouseDown={(e) => fieldVisible ? handleFieldMouseDown(e, field.id) : undefined}
      onClick={(e) => {
        if (!fieldVisible) return;
        e.stopPropagation();
        setSelectedField(field.id);
        setSelectedDrawing(null);
        setActiveTab("style");
      }}
      style={{
        display: fieldVisible ? undefined : "none",
        position: "absolute",
        left: field.x * scale,
        top: field.y * scale,
        width: field.width * scale,
        ...(tableHeightPx ? { height: tableHeightPx, overflow: "hidden" } : {}),
        cursor: field.locked ? "not-allowed" : drawTool === "select" ? "grab" : "crosshair",
        userSelect: "none",
        zIndex: isSelected ? 20 : 10,
        pointerEvents: drawTool === "select" ? "auto" : "none"
      }}
    >
                      {isSelected && <div style={{ position: "absolute", inset: "-3px", border: `2px solid ${CATEGORY_COLORS[field.category]}`, borderRadius: "3px", pointerEvents: "none", zIndex: -1, boxShadow: `0 0 0 3px ${CATEGORY_COLORS[field.category]}30` }} />}
                      {isTableField ? <div style={{ border: "none", borderRadius: "4px", padding: "4px 6px", background: isSelected ? "rgba(251, 191, 36, 0.12)" : "rgba(251, 191, 36, 0.06)", minHeight: "44px", fontFamily: field.fontFamily }}>
                          {tableCols.length === 0 ? <div style={{ fontSize: "8px", color: "#b45309" }}>No columns enabled — pick columns in the Style panel</div> : showSampleValues ? <div style={{ fontSize: "7px", color: "#3b4a58" }}>
                              {field.showHeader !== false && <div style={{ display: "grid", gridTemplateColumns: tableGrid, gap: "3px", fontWeight: 700, color: "#0f1923", borderBottom: "1px solid #cbd5e1", paddingBottom: "2px", marginBottom: "2px" }}>
                                  {tableCols.map((c) => <span key={c.key} style={{ textAlign: c.align, whiteSpace: "nowrap", overflow: "hidden" }}>{c.label}</span>)}
                                </div>}
                              {[0, 1].map((r) => <div key={r} style={{ display: "grid", gridTemplateColumns: tableGrid, gap: "3px", padding: "1px 0", background: field.zebra && r % 2 === 1 ? "rgba(0,0,0,0.03)" : "transparent" }}>
                                  {tableCols.map((c) => <span key={c.key} style={{ textAlign: c.align, whiteSpace: "nowrap", overflow: "hidden" }}>
                                      {c.key === "image" ? <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#cbd5e1", borderRadius: "1px" }} /> : c.key === "lineNo" ? r + 1 : SAMPLE_TABLE_ROW[c.key] || ""}
                                    </span>)}
                                </div>)}
                            </div> : <div style={{ fontSize: "8px", color: "#b45309" }}>{tableCols.length} columns · item rows print here</div>}
                        </div> : isImg ? <div style={{ width: field.width * scale, height: field.width * scale, border: `1px dashed ${isSelected ? CATEGORY_COLORS[field.category] : "#cbd5e1"}`, borderRadius: "4px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: isSelected ? "rgba(156, 163, 175, 0.15)" : "rgba(156, 163, 175, 0.06)", gap: "3px" }}>
                          {isQR ? <div style={{ width: "60%", height: "60%", background: "repeating-conic-gradient(#0f1923 0% 25%, #fff 0% 50%) 0 0 / 5px 5px", borderRadius: "2px" }} /> : <FileImage style={{ width: "40%", height: "40%", color: "#94a3b8" }} />}
                          <div style={{ fontSize: "6px", color: "#6b7a8a" }}>{IMAGE_FIELD_LABELS[field.id]}</div>
                        </div> : <>
                        <div style={{ display: isTotalsNumeric ? "flex" : "none", alignItems: "baseline", width: "100%", fontSize: `${field.fontSize}pt`, fontFamily: field.fontFamily, fontStyle: field.italic ? "italic" : "normal", color: showSampleValues ? field.color : CATEGORY_COLORS[field.category], borderBottom: isSelected ? `1px solid ${CATEGORY_COLORS[field.category]}` : "1px dashed transparent", lineHeight: 1.3, overflow: "hidden" }}>
                            <span style={{ flex: 1, textAlign: field.align || "right", whiteSpace: "nowrap", overflow: "hidden", paddingRight: `${2 * scale}px`, fontWeight: 400, color: "#6b7a8a" }}>{field.label}</span>
                            <img src={UAE_DIRHAM_SYMBOL_IMAGE} alt="AED" style={{ height: "0.85em", width: "auto", flexShrink: 0, verticalAlign: "-0.07em", marginRight: `${2 * scale}px` }} />
                            <span style={{ width: `${22 * scale}px`, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", fontWeight: field.bold ? 700 : 400 }}>{numericSampleText}</span>
                          </div>
                        <div style={{ display: isTotalsNumeric ? "none" : undefined, fontSize: `${field.fontSize}pt`, fontFamily: field.fontFamily, fontWeight: field.bold ? 700 : 400, fontStyle: field.italic ? "italic" : "normal", color: showSampleValues ? field.color : CATEGORY_COLORS[field.category], textAlign: field.align, borderBottom: isSelected ? `1px solid ${CATEGORY_COLORS[field.category]}` : "1px dashed transparent", padding: "1px 2px", whiteSpace: "nowrap", overflow: "hidden", lineHeight: 1.3 }}>
                          {text}
                        </div>
                        </>}
                      <div style={{ position: "absolute", top: -6, right: -6, display: field.locked ? undefined : "none" }}>
                          <Lock style={{ width: "10px", height: "10px", color: "#f59e0b" }} />
                        </div>
                      {/* Table resize handle — drag to set tableHeight */}
                      {isTableField && isSelected && drawTool === "select" && !field.locked && (
                        <div
                          style={{ position: "absolute", bottom: -8, left: 0, right: 0, height: 14, cursor: "ns-resize", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30, pointerEvents: "auto" }}
                          title="Drag to set table height (rows per page)"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const curH = field.tableHeight > 0 ? field.tableHeight : Math.max(40, (dims.h - field.y) * 0.6);
                            setResizingTable({ startMouseY: e.clientY, startHeight: curH });
                          }}
                        >
                          <div style={{ width: 40, height: 5, borderRadius: 3, background: "#b45309", opacity: 0.85, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                        </div>
                      )}
                      {/* Continuation-Y dashed indicator */}
                      {isTableField && isSelected && field.continuationY > 0 && (
                        <div style={{ position: "absolute", left: 0, right: 0, top: (field.continuationY - field.y) * scale, borderTop: "1.5px dashed #1a56db", pointerEvents: "none", zIndex: 28 }}>
                          <span style={{ position: "absolute", left: 2, top: -9, fontSize: "7px", color: "#1a56db", background: "rgba(255,255,255,0.85)", padding: "0 2px", borderRadius: 2 }}>page 2+ start</span>
                        </div>
                      )}
                    </div>;
  })}

                {
    /* Paper label */
  }
                <div style={{ position: "absolute", bottom: "4px", right: "6px", fontSize: "8px", color: "#94a3b8", pointerEvents: "none" }}>
                  {settings.paperSize} {settings.orientation} — {dims.w} × {dims.h} mm
                </div>
              </div>
            </div>
          </div>

          {
    /* Bottom info bar */
  }
          <div className="mt-4 mx-auto w-fit max-w-full flex items-center gap-3 text-xs text-gray-600 flex-wrap bg-white/80 backdrop-blur-sm border shadow-sm rounded-lg px-3 py-1.5">
            <span><strong className="text-gray-800">{settings.fields.filter((f) => f.enabled).length}</strong>/{settings.fields.length} fields</span>
            <span className="w-px h-3.5 bg-gray-200" />
            <span><strong className="text-gray-800">{settings.drawings.length}</strong> drawings</span>
            {(selectedF || selectedD) && <span className="w-px h-3.5 bg-gray-200" />}
            {selectedF && <span className="text-[#9a7a00] font-medium">{selectedF.label} · ({selectedF.x.toFixed(1)}, {selectedF.y.toFixed(1)}) mm</span>}
            {selectedD && <span className="text-[#9a7a00] font-medium">{selectedD.label} · ({selectedD.x.toFixed(1)}, {selectedD.y.toFixed(1)}) mm</span>}
            <span className="w-px h-3.5 bg-gray-200" /><span className="text-blue-600">{settings.printOnlyValues ? "Values only" : "Labels + values"}</span>
            {(() => {
              const tf = settings.fields.find((f) => f.id === "items_table");
              if (!tf) return null;
              if (tf.tableHeight > 0) {
                const est = Math.max(1, Math.floor(tf.tableHeight / ((tf.fontSize || 9) * 0.353 + 4)));
                return <><span className="w-px h-3.5 bg-gray-200" /><span className="text-orange-600">~{est} rows/pg</span></>;
              }
              if (settings.itemsPerPage > 0) {
                return <><span className="w-px h-3.5 bg-gray-200" /><span className="text-emerald-600">{settings.itemsPerPage} rows/pg (manual)</span></>;
              }
              return null;
            })()}
          </div>
        </div>
      </div>
    </div>;
}
export {
  InvoiceOverlayDesigner
};
