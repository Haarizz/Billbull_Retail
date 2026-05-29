import { useState, useRef, useCallback, useEffect } from "react";
import {
  Badge,
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
  TabsTrigger
} from "../../Purchase/Templates/PurchaseTemplateUI";
import toast from "react-hot-toast";
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
const DEFAULT_FIELDS = [
  { id: "company_name", label: "Company Name", sampleValue: "BillBull Retail Ltd", category: "company", x: 20, y: 15, fontSize: 16, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "left", width: 100, enabled: true, locked: false, printLabel: false },
  { id: "company_address", label: "Company Address", sampleValue: "Building 123, Dubai, UAE", category: "company", x: 20, y: 24, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 100, enabled: true, locked: false, printLabel: false },
  { id: "company_phone", label: "Company Phone", sampleValue: "+971 4 123 4567", category: "company", x: 20, y: 31, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: true, locked: false, printLabel: false },
  { id: "company_email", label: "Company Email", sampleValue: "info@billbull.ae", category: "company", x: 20, y: 37, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: true, locked: false, printLabel: false },
  { id: "company_trn", label: "Company TRN", sampleValue: "TRN: 100123456789003", category: "company", x: 20, y: 43, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 80, enabled: true, locked: false, printLabel: false },
  { id: "invoice_title", label: "Document Title", sampleValue: "TAX INVOICE", category: "document", x: 130, y: 20, fontSize: 20, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: false },
  { id: "invoice_no", label: "Invoice Number", sampleValue: "INV-2024-001", category: "document", x: 130, y: 40, fontSize: 10, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "invoice_date", label: "Invoice Date", sampleValue: "20 May 2024", category: "document", x: 130, y: 49, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "due_date", label: "Due Date", sampleValue: "19 Jun 2024", category: "document", x: 130, y: 58, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "payment_terms", label: "Payment Terms", sampleValue: "Net 30", category: "document", x: 130, y: 67, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: true, locked: false, printLabel: true },
  { id: "salesperson", label: "Salesperson", sampleValue: "John Smith", category: "document", x: 130, y: 76, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "right", width: 60, enabled: false, locked: false, printLabel: true },
  { id: "bill_to_label", label: '"Bill To" Heading', sampleValue: "BILL TO", category: "customer", x: 20, y: 60, fontSize: 8, fontFamily: "Inter", bold: true, italic: false, color: "#6b7a8a", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_name", label: "Customer Name", sampleValue: "Acme Corporation", category: "customer", x: 20, y: 67, fontSize: 11, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_address1", "label": "Customer Address 1", "sampleValue": "456 Client Avenue", category: "customer", x: 20, y: 75, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_address2", "label": "Customer Address 2", "sampleValue": "Bur Dubai, Dubai, UAE", category: "customer", x: 20, y: 82, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: true, locked: false, printLabel: false },
  { id: "customer_trn", label: "Customer TRN", sampleValue: "100987654321003", category: "customer", x: 20, y: 103, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#3b4a58", align: "left", width: 90, enabled: true, locked: false, printLabel: true },
  { id: "items_table", label: "Items Table", sampleValue: "[Items Table Block]", category: "items", x: 10, y: 120, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 190, enabled: true, locked: false, printLabel: false },
  { id: "subtotal", label: "Subtotal", sampleValue: "AED 5,000.00", category: "totals", x: 130, y: 220, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: true, locked: false, printLabel: true },
  { id: "tax_amount", label: "VAT Amount", sampleValue: "AED 250.00", category: "totals", x: 130, y: 229, fontSize: 10, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "right", width: 65, enabled: true, locked: false, printLabel: true },
  { id: "grand_total", label: "Grand Total", sampleValue: "AED 5,250.00", category: "totals", x: 130, y: 247, fontSize: 11, fontFamily: "Inter", bold: true, italic: false, color: "#0f1923", align: "right", width: 65, enabled: true, locked: false, printLabel: true },
  { id: "amount_words", label: "Amount in Words", sampleValue: "Five Thousand Two Hundred Fifty Dirhams Only", category: "totals", x: 10, y: 258, fontSize: 9, fontFamily: "Inter", bold: false, italic: true, color: "#3b4a58", align: "left", width: 120, enabled: true, locked: false, printLabel: false },
  { id: "notes", label: "Notes / Remarks", sampleValue: "Payment due within 30 days.", category: "footer", x: 10, y: 270, fontSize: 8, fontFamily: "Inter", bold: false, italic: false, color: "#6b7a8a", align: "left", width: 120, enabled: true, locked: false, printLabel: false },
  { id: "bank_name", label: "Bank Name", sampleValue: "Emirates NBD", category: "footer", x: 10, y: 280, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 90, enabled: true, locked: false, printLabel: true },
  { id: "account_number", label: "Account Number", sampleValue: "1012345678", category: "footer", x: 10, y: 287, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 90, enabled: true, locked: false, printLabel: true },
  { id: "iban", label: "IBAN", sampleValue: "AE07 0330 0000 0102 1450 801", category: "footer", x: 10, y: 294, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 90, enabled: true, locked: false, printLabel: true },
  { id: "qr_code", label: "QR Code", sampleValue: "[QR]", category: "footer", x: 170, y: 272, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "left", width: 28, enabled: true, locked: false, printLabel: false },
  { id: "signature", label: "Authorized Signature", sampleValue: "________________________", category: "footer", x: 130, y: 280, fontSize: 9, fontFamily: "Inter", bold: false, italic: false, color: "#0f1923", align: "center", width: 60, enabled: true, locked: false, printLabel: true }
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
  const [settings, setSettings] = useState({
    ...defaultSettings(mode, templateName ?? (mode === "preprinted" ? "Pre-printed Invoice Template" : "Letterhead Invoice Template")),
    ...initialSettings
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
  const selectedF = selectedField ? settings.fields.find((f) => f.id === selectedField) : null;
  const selectedD = selectedDrawing ? settings.drawings.find((d) => d.id === selectedDrawing) : null;
  const categories = ["all", ...Array.from(new Set(DEFAULT_FIELDS.map((f) => f.category)))];
  const visibleFields = settings.fields.filter((f) => f.enabled && (filterCategory === "all" || f.category === filterCategory));
  const isPreprinted = mode === "preprinted";
  const ghost = drawingInProgress ? (() => {
    const x1 = Math.min(drawingInProgress.startX, drawingInProgress.currentX);
    const y1 = Math.min(drawingInProgress.startY, drawingInProgress.currentY);
    const w = Math.abs(drawingInProgress.currentX - drawingInProgress.startX);
    const h = Math.abs(drawingInProgress.currentY - drawingInProgress.startY);
    return { x1, y1, w, h };
  })() : null;
  const drawToolCursor = drawTool === "select" ? "default" : "crosshair";
  return <div className="fixed inset-0 bg-background z-50 overflow-hidden flex flex-col">

      {
    /* ── Top bar ── */
  }
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {isPreprinted ? <><Printer className="h-5 w-5 text-[#F5C742]" /> Pre-printed Invoice Designer</> : <><FileImage className="h-5 w-5 text-[#F5C742]" /> Letterhead Invoice Designer</>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isPreprinted ? "Upload your pre-printed form and position where each value should be printed" : "Upload your company letterhead and design the invoice layout on top of it"}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className={isPreprinted ? "border-blue-400 text-blue-700 bg-blue-50" : "border-purple-400 text-purple-700 bg-purple-50"}>
            {isPreprinted ? "Pre-printed" : "Letterhead"}
          </Badge>
          <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button className="bg-[#F5C742] hover:bg-[#F5C742]/90 text-black" onClick={handleSave}><Save className="mr-2 h-4 w-4" />Save Template</Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">

        { /* ── Left settings panel ── */ }
        <div className="w-[380px] shadow-[4px_0_24px_rgba(0,0,0,0.08)] bg-white overflow-y-auto flex-shrink-0 relative z-10">
          <ScrollArea className="h-full">
            <div className="p-6">
              <div className="space-y-2 mb-6">
                <Label>Template Name</Label>
                <Input value={settings.templateName} onChange={(e) => update("templateName", e.target.value)} />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="paper">Paper</TabsTrigger>
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="fields">Fields</TabsTrigger>
                  <TabsTrigger value="lines">Lines</TabsTrigger>
                  <TabsTrigger value="style">Style</TabsTrigger>
                </TabsList>

                {
    /* ── Paper tab ── */
  }
                <TabsContent value="paper" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><LayoutGrid className="h-5 w-5" />Paper & Canvas</CardTitle>
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
                          <p className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
                            <RectangleHorizontal className="h-3.5 w-3.5" />
                            Custom paper dimensions
                          </p>
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
                      {isPreprinted && <>
                          <Separator />
                          <div className="flex items-center justify-between p-2 border rounded bg-amber-50">
                            <div>
                              <Label className="font-normal">Print Values Only</Label>
                              <p className="text-xs text-muted-foreground mt-0.5">Skip all labels — print data values only</p>
                            </div>
                            <Switch checked={settings.printOnlyValues} onCheckedChange={(v) => update("printOnlyValues", v)} />
                          </div>
                        </>}
                    </CardContent>
                  </Card>
                </TabsContent>

                {
    /* ── Upload tab ── */
  }
                <TabsContent value="upload" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileImage className="h-5 w-5" />
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
                              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <LayoutGrid className="h-3.5 w-3.5" />
                                Paper size for this scan
                              </p>
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
                            {uploadedImageNaturalDims && <p className="text-[10px] text-slate-500">
                                Image: {uploadedImageNaturalDims.w} × {uploadedImageNaturalDims.h} px
                                {uploadedImageNaturalDims.w > 0 && (() => {
    const s = suggestPaperFromPixels(uploadedImageNaturalDims.w, uploadedImageNaturalDims.h);
    return s ? ` \u2014 matches ${s.size === "Custom" ? "custom" : s.size} ${s.orientation}` : "";
  })()}
                              </p>}
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
                            <p className="text-[10px] text-slate-500">
                              Canvas: <strong>{dims.w} × {dims.h} mm</strong> — fields positioned against these dimensions
                            </p>
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
                    <CardHeader><CardTitle className="text-lg">Canvas View</CardTitle></CardHeader>
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
                <TabsContent value="fields" className="space-y-6">
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
                        <CardContent className="space-y-2">
                          {catFields.map((field) => <div
      key={field.id}
      className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedField === field.id ? "border-[#F5C742] bg-[#F5C742]/5 shadow-sm" : "hover:border-gray-400"} ${!field.enabled ? "opacity-50" : ""}`}
      onClick={() => {
        setSelectedField(field.id);
        setSelectedDrawing(null);
        setActiveTab("style");
      }}
    >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-gray-700">{field.label}</span>
                                <div className="flex items-center gap-1">
                                  <button onClick={(e) => {
      e.stopPropagation();
      updateField(field.id, { locked: !field.locked });
    }} className="p-0.5 rounded hover:bg-gray-100">
                                    {field.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3 text-gray-400" />}
                                  </button>
                                  <Switch checked={field.enabled} onCheckedChange={(v) => updateField(field.id, { enabled: v })} onClick={(e) => e.stopPropagation()} />
                                </div>
                              </div>
                              {field.enabled && <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">X (mm)</Label>
                                    <Input type="number" step="0.5" value={field.x} onChange={(e) => updateField(field.id, { x: +e.target.value })} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Y (mm)</Label>
                                    <Input type="number" step="0.5" value={field.y} onChange={(e) => updateField(field.id, { y: +e.target.value })} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />
                                  </div>
                                </div>}
                            </div>)}
                        </CardContent>
                      </Card>;
  })}
                </TabsContent>

                {
    /* ── Lines tab ── */
  }
                <TabsContent value="lines" className="space-y-6">
                  {
    /* Draw tool picker */
  }
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><Square className="h-5 w-5" />Drawing Tools</CardTitle>
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
                            <p className="text-[10px] text-muted-foreground">Draw as dashed / dotted</p>
                          </div>
                          <Switch checked={selectedD.dashed} onCheckedChange={(v) => updateDrawing(selectedD.id, { dashed: v })} />
                        </div>
                        {selectedD.dashed && <div className="space-y-1">
                            <Label className="text-xs">Dash Pattern (px,gap)</Label>
                            <Input value={selectedD.dashPattern} onChange={(e) => updateDrawing(selectedD.id, { dashPattern: e.target.value })} placeholder="4,2" className="h-8 text-xs" />
                          </div>}
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
                <TabsContent value="style" className="space-y-6">
                  {selectedF ? <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ background: CATEGORY_COLORS[selectedF.category] }} />
                            {selectedF.label}
                          </CardTitle>
                          <CardDescription>Style and position this field</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2"><Label>X Position (mm)</Label><Input type="number" step="0.5" value={selectedF.x} onChange={(e) => updateField(selectedF.id, { x: +e.target.value })} /></div>
                            <div className="space-y-2"><Label>Y Position (mm)</Label><Input type="number" step="0.5" value={selectedF.y} onChange={(e) => updateField(selectedF.id, { y: +e.target.value })} /></div>
                            <div className="space-y-2"><Label>Width (mm)</Label><Input type="number" step="1" value={selectedF.width} onChange={(e) => updateField(selectedF.id, { width: +e.target.value })} /></div>
                            <div className="space-y-2"><Label>Font Size (pt)</Label><Input type="number" step="0.5" value={selectedF.fontSize} onChange={(e) => updateField(selectedF.id, { fontSize: +e.target.value })} /></div>
                          </div>
                          <Separator />
                          <div className="space-y-2">
                            <Label>Font Family</Label>
                            <Select value={selectedF.fontFamily} onValueChange={(v) => updateField(selectedF.id, { fontFamily: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{fontFamilies.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-3">
                            {[
    { key: "bold", Icon: Bold, active: selectedF.bold, toggle: () => updateField(selectedF.id, { bold: !selectedF.bold }) },
    { key: "italic", Icon: Italic, active: selectedF.italic, toggle: () => updateField(selectedF.id, { italic: !selectedF.italic }) }
  ].map(({ key, Icon, active, toggle }) => <Button key={key} type="button" variant={active ? "default" : "outline"} className={active ? "bg-[#F5C742] text-black hover:bg-[#F5C742]/90" : ""} onClick={toggle}>
                                <Icon className="h-4 w-4" />
                              </Button>)}
                            {["left", "center", "right"].map((a) => <Button key={a} type="button" variant={selectedF.align === a ? "default" : "outline"} className={selectedF.align === a ? "bg-[#F5C742] text-black hover:bg-[#F5C742]/90" : ""} onClick={() => updateField(selectedF.id, { align: a })}>
                                {a === "left" ? <AlignLeft className="h-4 w-4" /> : a === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
                              </Button>)}
                          </div>
                          <div className="space-y-2">
                            <Label>Text Color</Label>
                            <div className="flex gap-2">
                              <Input type="color" value={selectedF.color} onChange={(e) => updateField(selectedF.id, { color: e.target.value })} className="w-20 h-10" />
                              <Input value={selectedF.color} onChange={(e) => updateField(selectedF.id, { color: e.target.value })} />
                            </div>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <Label className="font-normal">Print Label Text</Label>
                              <p className="text-xs text-muted-foreground mt-0.5">"Invoice No:" before the value</p>
                            </div>
                            <Switch checked={selectedF.printLabel} onCheckedChange={(v) => updateField(selectedF.id, { printLabel: v })} />
                          </div>
                          <div className="flex items-center justify-between p-2 border rounded">
                            <Label className="font-normal">Lock Position</Label>
                            <Switch checked={selectedF.locked} onCheckedChange={(v) => updateField(selectedF.id, { locked: v })} />
                          </div>
                        </CardContent>
                      </Card>
                      <div className="p-3 bg-gray-50 rounded-lg border text-xs text-gray-600 space-y-1">
                        <p className="font-semibold">Sample Value Preview:</p>
                        <p style={{ fontFamily: selectedF.fontFamily, fontSize: `${selectedF.fontSize}pt`, fontWeight: selectedF.bold ? 700 : 400, fontStyle: selectedF.italic ? "italic" : "normal", color: selectedF.color, textAlign: selectedF.align }}>
                          {selectedF.printLabel ? `${selectedF.label}: ` : ""}{selectedF.sampleValue}
                        </p>
                      </div>
                    </> : <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-3">
                      <Layers className="h-12 w-12" />
                      <p className="font-medium">No field selected</p>
                      <p className="text-sm">Click a field on the canvas or in the Fields tab to edit its style and position</p>
                    </div>}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </div>

        {
    /* ── Canvas area ── */
  }
        <div className="flex-1 overflow-auto bg-slate-200 p-6">

          {
    /* Toolbar above canvas */
  }
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1 bg-white rounded-lg border px-2 py-1">
              <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(1)))} className="p-1 hover:bg-gray-100 rounded"><ZoomOut className="h-4 w-4" /></button>
              <span className="text-xs font-medium w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))} className="p-1 hover:bg-gray-100 rounded"><ZoomIn className="h-4 w-4" /></button>
            </div>

            {
    /* Draw tool quick-select in toolbar */
  }
            <div className="flex items-center bg-white rounded-lg border divide-x overflow-hidden">
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
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${showSampleValues ? "bg-white border-gray-300" : "bg-gray-700 border-gray-700 text-white"}`}
  >
              {showSampleValues ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showSampleValues ? "Sample values on" : "Field names only"}
            </button>

            {drawTool === "select" ? <span className="text-xs text-gray-500 bg-white border rounded-lg px-3 py-1.5">
                <Move className="h-3.5 w-3.5 inline mr-1" />Drag fields to reposition · Click to select
              </span> : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5">
                {drawTool === "h-line" ? "\u2192 Drag left\u2013right to draw a horizontal line" : drawTool === "v-line" ? "\u2193 Drag top\u2013bottom to draw a vertical line" : "\u2B1C Drag to draw a box / border"}
              </span>}

            {(selectedField || selectedDrawing) && <button onClick={() => {
    setSelectedField(null);
    setSelectedDrawing(null);
  }} className="text-xs px-3 py-1.5 bg-white border rounded-lg hover:bg-gray-50">
                ✕ Deselect
              </button>}

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => <span key={cat} className="flex items-center gap-1 text-xs text-gray-600">
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
    const dashStr = el.dashed ? el.dashPattern : "none";
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
    /* Data fields */
  }
                {visibleFields.map((field) => {
    const isSelected = selectedField === field.id;
    const text = showSampleValues ? field.printLabel ? `${field.label}: ${field.sampleValue}` : field.sampleValue : field.label;
    const isTableField = field.id === "items_table";
    const isQR = field.id === "qr_code";
    return <div
      key={field.id}
      onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedField(field.id);
        setSelectedDrawing(null);
        setActiveTab("style");
      }}
      style={{
        position: "absolute",
        left: field.x * scale,
        top: field.y * scale,
        width: field.width * scale,
        cursor: field.locked ? "not-allowed" : drawTool === "select" ? "grab" : "crosshair",
        userSelect: "none",
        zIndex: isSelected ? 20 : 10,
        pointerEvents: drawTool === "select" ? "auto" : "none"
      }}
    >
                      {isSelected && <div style={{ position: "absolute", inset: "-3px", border: `2px solid ${CATEGORY_COLORS[field.category]}`, borderRadius: "3px", pointerEvents: "none", zIndex: -1, boxShadow: `0 0 0 3px ${CATEGORY_COLORS[field.category]}30` }} />}
                      {isTableField ? <div style={{ border: "none", borderRadius: "4px", padding: "6px 8px", background: isSelected ? "rgba(251, 191, 36, 0.12)" : "rgba(251, 191, 36, 0.06)", minHeight: "50px" }}>
                          <div style={{ fontSize: "8px", color: "#b45309", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Items Table</div>
                          {showSampleValues ? <div style={{ fontSize: "8px", color: "#6b7a8a" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1fr", gap: "4px", fontWeight: 600, paddingBottom: "2px", marginBottom: "2px" }}>
                                <span>Description</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "right" }}>Total</span>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1fr", gap: "4px" }}>
                                <span>Samsung Galaxy Tab A8</span><span style={{ textAlign: "right" }}>5</span><span style={{ textAlign: "right" }}>500.00</span><span style={{ textAlign: "right" }}>2,500.00</span>
                              </div>
                            </div> : <div style={{ fontSize: "8px", color: "#b45309" }}>Item rows will be printed here</div>}
                        </div> : isQR ? <div style={{ width: field.width * scale, height: field.width * scale, border: "none", borderRadius: "4px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: isSelected ? "rgba(156, 163, 175, 0.15)" : "rgba(156, 163, 175, 0.08)", gap: "4px" }}>
                          <div style={{ width: "28px", height: "28px", background: "repeating-conic-gradient(#0f1923 0% 25%, #fff 0% 50%) 0 0 / 5px 5px", borderRadius: "2px" }} />
                          <div style={{ fontSize: "7px", color: "#6b7a8a" }}>QR Code</div>
                        </div> : <div style={{ fontSize: `${field.fontSize}pt`, fontFamily: field.fontFamily, fontWeight: field.bold ? 700 : 400, fontStyle: field.italic ? "italic" : "normal", color: showSampleValues ? field.color : CATEGORY_COLORS[field.category], textAlign: field.align, borderBottom: isSelected ? `1px solid ${CATEGORY_COLORS[field.category]}` : "1px dashed transparent", padding: "1px 2px", whiteSpace: "nowrap", overflow: "hidden", lineHeight: 1.3 }}>
                          {text}
                        </div>}
                      {field.locked && <div style={{ position: "absolute", top: -6, right: -6 }}>
                          <Lock style={{ width: "10px", height: "10px", color: "#f59e0b" }} />
                        </div>}
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
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span>Fields enabled: <strong>{settings.fields.filter((f) => f.enabled).length}</strong> of {settings.fields.length}</span>
            <span>Drawing elements: <strong>{settings.drawings.length}</strong></span>
            {selectedF && <span className="text-[#F5C742] font-medium">Field: {selectedF.label} at ({selectedF.x.toFixed(1)}, {selectedF.y.toFixed(1)}) mm</span>}
            {selectedD && <span className="text-[#F5C742] font-medium">Drawing: {selectedD.label} at ({selectedD.x.toFixed(1)}, {selectedD.y.toFixed(1)}) mm</span>}
            {isPreprinted && <span className="text-blue-600">Pre-printed mode: {settings.printOnlyValues ? "values only" : "labels + values"}</span>}
          </div>
        </div>
      </div>
    </div>;
}
export {
  InvoiceOverlayDesigner
};
