import { useState } from "react";
import {
  ArrowLeft,
  Save,
  Eye,
  Smartphone,
  Tablet,
  Monitor,
  Upload,
  Download,
  Palette,
  Layout,
  AlignLeft,
  Mail,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Check
} from "lucide-react";
import toast from "react-hot-toast";
const mockSoATemplates = [
  {
    id: 1,
    name: "Classic Statement",
    isDefault: true,
    settings: {
      primaryColor: "#F5C742",
      headerBg: "#1e293b",
      fontFamily: "Inter",
      fontSize: "14",
      showLogo: true,
      showBorder: true,
      showQuickSummary: true,
      showOpeningBalance: true,
      showPurchases: true,
      showPayments: true,
      showPDC: true,
      showClosingBalance: true
    }
  },
  {
    id: 2,
    name: "Modern Blue Statement",
    isDefault: false,
    settings: {
      primaryColor: "#3b82f6",
      headerBg: "#1e40af",
      fontFamily: "Inter",
      fontSize: "14",
      showLogo: true,
      showBorder: true,
      showQuickSummary: true,
      showOpeningBalance: true,
      showPurchases: true,
      showPayments: true,
      showPDC: true,
      showClosingBalance: true
    }
  },
  {
    id: 3,
    name: "Minimal Green Statement",
    isDefault: false,
    settings: {
      primaryColor: "#10b981",
      headerBg: "#065f46",
      fontFamily: "Arial",
      fontSize: "13",
      showLogo: true,
      showBorder: false,
      showQuickSummary: true,
      showOpeningBalance: true,
      showPurchases: true,
      showPayments: true,
      showPDC: false,
      showClosingBalance: true
    }
  }
];
function VendorSoATemplateDesigner({ onBack, editingTemplate, onSave }) {
  const [activeTab, setActiveTab] = useState("design");
  const [previewDevice, setPreviewDevice] = useState("desktop");
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templates, setTemplates] = useState(mockSoATemplates);
  const [currentTemplate, setCurrentTemplate] = useState(editingTemplate || mockSoATemplates[0]);
  const [isNewTemplate, setIsNewTemplate] = useState(!editingTemplate);
  const [templateName, setTemplateName] = useState(currentTemplate.name);
  const [primaryColor, setPrimaryColor] = useState(currentTemplate.settings?.primaryColor ?? "#F5C742");
  const [headerBg, setHeaderBg] = useState(currentTemplate.settings?.headerBg ?? "#1e293b");
  const [fontFamily, setFontFamily] = useState(currentTemplate.settings?.fontFamily ?? "Inter");
  const [fontSize, setFontSize] = useState(currentTemplate.settings?.fontSize ?? "14");
  const [showLogo, setShowLogo] = useState(currentTemplate.settings?.showLogo ?? true);
  const [showBorder, setShowBorder] = useState(currentTemplate.settings?.showBorder ?? true);
  const [pageSize, setPageSize] = useState("A4");
  const [orientation, setOrientation] = useState("portrait");
  const [margins, setMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
  const [showQuickSummary, setShowQuickSummary] = useState(currentTemplate.settings?.showQuickSummary ?? true);
  const [showOpeningBalance, setShowOpeningBalance] = useState(currentTemplate.settings?.showOpeningBalance ?? true);
  const [showPurchases, setShowPurchases] = useState(currentTemplate.settings?.showPurchases ?? true);
  const [showPayments, setShowPayments] = useState(currentTemplate.settings?.showPayments ?? true);
  const [showPDC, setShowPDC] = useState(currentTemplate.settings?.showPDC ?? true);
  const [showClosingBalance, setShowClosingBalance] = useState(currentTemplate.settings?.showClosingBalance ?? true);
  const [footerText, setFooterText] = useState("This is a computer-generated statement and does not require a signature.");
  const [emailSubject, setEmailSubject] = useState("Vendor Statement of Account - {vendor}");
  const [emailBody, setEmailBody] = useState("Dear {vendor},\n\nPlease find attached your Statement of Account for the period {period}.\n\nIf you have any questions, please feel free to contact us.\n\nBest regards,\n{company}");
  const handleSaveTemplate = () => {
    const templateData = {
      id: currentTemplate.id || Date.now(),
      name: templateName,
      isDefault: currentTemplate.isDefault || false,
      settings: {
        primaryColor,
        headerBg,
        fontFamily,
        fontSize,
        showLogo,
        showBorder,
        showQuickSummary,
        showOpeningBalance,
        showPurchases,
        showPayments,
        showPDC,
        showClosingBalance,
        footerText,
        emailSubject,
        emailBody,
        pageSize,
        orientation,
        margins
      }
    };
    if (onSave) {
      onSave({
        ...templateData.settings,
        templateName: templateData.name
      });
      return;
    }
    if (isNewTemplate) {
      setTemplates([...templates, templateData]);
      toast.success("Template created successfully");
    } else {
      setTemplates(templates.map((t) => t.id === templateData.id ? templateData : t));
      toast.success("Template updated successfully");
    }
    setIsNewTemplate(false);
    setCurrentTemplate(templateData);
  };
  const handleCreateNew = () => {
    setIsNewTemplate(true);
    setTemplateName("New SoA Template");
    setPrimaryColor("#F5C742");
    setHeaderBg("#1e293b");
    setFontFamily("Inter");
    setFontSize("14");
    setShowLogo(true);
    setShowBorder(true);
    setShowQuickSummary(true);
    setShowOpeningBalance(true);
    setShowPurchases(true);
    setShowPayments(true);
    setShowPDC(true);
    setShowClosingBalance(true);
    setShowTemplateList(false);
    toast.success("New template created");
  };
  const handleLoadTemplate = (template) => {
    setCurrentTemplate(template);
    setIsNewTemplate(false);
    setTemplateName(template.name);
    setPrimaryColor(template.settings?.primaryColor ?? "#F5C742");
    setHeaderBg(template.settings?.headerBg ?? "#1e293b");
    setFontFamily(template.settings?.fontFamily ?? "Inter");
    setFontSize(template.settings?.fontSize ?? "14");
    setShowLogo(template.settings?.showLogo ?? true);
    setShowBorder(template.settings?.showBorder ?? true);
    setShowQuickSummary(template.settings?.showQuickSummary ?? true);
    setShowOpeningBalance(template.settings?.showOpeningBalance ?? true);
    setShowPurchases(template.settings?.showPurchases ?? true);
    setShowPayments(template.settings?.showPayments ?? true);
    setShowPDC(template.settings?.showPDC ?? true);
    setShowClosingBalance(template.settings?.showClosingBalance ?? true);
    setShowTemplateList(false);
    toast.success(`Template "${template.name}" loaded`);
  };
  const handleSetDefault = (templateId) => {
    setTemplates(templates.map((t) => ({ ...t, isDefault: t.id === templateId })));
    toast.success("Default template updated");
  };
  const handleDeleteTemplate = (templateId) => {
    if (templates.length === 1) {
      toast.error("Cannot delete the last template");
      return;
    }
    setTemplates(templates.filter((t) => t.id !== templateId));
    toast.success("Template deleted");
  };
  const getDeviceWidth = () => {
    switch (previewDevice) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      case "desktop":
        return "100%";
    }
  };
  return <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {
    /* Header */
  }
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
    onClick={onBack}
    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
  >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <input
    type="text"
    value={templateName}
    onChange={(e) => setTemplateName(e.target.value)}
    className="text-lg font-semibold border-none focus:outline-none focus:ring-2 focus:ring-[#F5C742] rounded px-2 py-1"
  />
              {currentTemplate.isDefault && <span className="px-2 py-1 bg-[#F5C742] text-xs font-medium rounded-full">
                  Default Template
                </span>}
              {isNewTemplate && <span className="px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
                  New Template
                </span>}
            </div>
            <p className="text-sm text-gray-500">Vendor Statement of Account Template</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
    onClick={() => setShowTemplateList(!showTemplateList)}
    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2 transition-colors"
  >
            <Settings className="w-4 h-4" />
            Templates ({templates.length})
          </button>
          <button
    onClick={handleCreateNew}
    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2 transition-colors"
  >
            <Plus className="w-4 h-4" />
            New Template
          </button>
          <button className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2 transition-colors">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
    onClick={handleSaveTemplate}
    className="px-6 py-2 bg-[#F5C742] hover:bg-[#e5b732] rounded-lg flex items-center gap-2 transition-colors font-medium"
  >
            <Save className="w-4 h-4" />
            Save Template
          </button>
        </div>
      </div>

      {
    /* Template List Modal */
  }
      {showTemplateList && <div className="absolute top-16 right-6 w-96 bg-white border rounded-xl shadow-xl z-50 max-h-[500px] overflow-auto">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Manage Templates</h3>
            <p className="text-sm text-gray-500">Choose or manage your SoA templates</p>
          </div>
          <div className="p-4 space-y-2">
            {templates.map((template) => <div
    key={template.id}
    className="p-3 border rounded-lg hover:border-[#F5C742] hover:bg-[#F5C742]/5 transition-colors group"
  >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{template.name}</span>
                      {template.isDefault && <span className="px-2 py-0.5 bg-[#F5C742] text-xs rounded-full">
                          Default
                        </span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Color: {template.settings?.primaryColor ?? "N/A"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
    onClick={() => handleLoadTemplate(template)}
    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
    title="Edit"
  >
                      <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                    {!template.isDefault && <button
    onClick={() => handleSetDefault(template.id)}
    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
    title="Set as default"
  >
                        <Check className="w-3.5 h-3.5 text-gray-600" />
                      </button>}
                    {templates.length > 1 && <button
    onClick={() => handleDeleteTemplate(template.id)}
    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
    title="Delete"
  >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </button>}
                  </div>
                </div>
              </div>)}
          </div>
        </div>}

      <div className="flex-1 flex overflow-hidden">
        {
    /* Left Panel - Settings */
  }
        <div className="w-80 bg-white border-r flex flex-col overflow-hidden">
          {
    /* Tabs */
  }
          <div className="border-b flex">
            <button
    onClick={() => setActiveTab("design")}
    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "design" ? "border-b-2 border-[#F5C742] text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
  >
              <Palette className="w-4 h-4" />
              Design
            </button>
            <button
    onClick={() => setActiveTab("layout")}
    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "layout" ? "border-b-2 border-[#F5C742] text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
  >
              <Layout className="w-4 h-4" />
              Layout
            </button>
            <button
    onClick={() => setActiveTab("content")}
    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "content" ? "border-b-2 border-[#F5C742] text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
  >
              <AlignLeft className="w-4 h-4" />
              Content
            </button>
            <button
    onClick={() => setActiveTab("email")}
    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "email" ? "border-b-2 border-[#F5C742] text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
  >
              <Mail className="w-4 h-4" />
              Email
            </button>
          </div>

          {
    /* Tab Content */
  }
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "design" && <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input
    type="color"
    value={primaryColor}
    onChange={(e) => setPrimaryColor(e.target.value)}
    className="w-12 h-10 rounded border cursor-pointer"
  />
                    <input
    type="text"
    value={primaryColor}
    onChange={(e) => setPrimaryColor(e.target.value)}
    className="flex-1 px-3 py-2 border rounded-lg"
  />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Header Background</label>
                  <div className="flex items-center gap-2">
                    <input
    type="color"
    value={headerBg}
    onChange={(e) => setHeaderBg(e.target.value)}
    className="w-12 h-10 rounded border cursor-pointer"
  />
                    <input
    type="text"
    value={headerBg}
    onChange={(e) => setHeaderBg(e.target.value)}
    className="flex-1 px-3 py-2 border rounded-lg"
  />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Font Family</label>
                  <select
    value={fontFamily}
    onChange={(e) => setFontFamily(e.target.value)}
    className="w-full px-3 py-2 border rounded-lg"
  >
                    <option value="Inter">Inter</option>
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Georgia">Georgia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Base Font Size</label>
                  <select
    value={fontSize}
    onChange={(e) => setFontSize(e.target.value)}
    className="w-full px-3 py-2 border rounded-lg"
  >
                    <option value="12">12px - Small</option>
                    <option value="13">13px - Medium-Small</option>
                    <option value="14">14px - Medium</option>
                    <option value="15">15px - Medium-Large</option>
                    <option value="16">16px - Large</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showLogo}
    onChange={(e) => setShowLogo(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm">Show Company Logo</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showBorder}
    onChange={(e) => setShowBorder(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm">Show Border</span>
                  </label>
                </div>
              </div>}

            {activeTab === "layout" && <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Page Size</label>
                  <select
    value={pageSize}
    onChange={(e) => setPageSize(e.target.value)}
    className="w-full px-3 py-2 border rounded-lg"
  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="Letter">Letter (8.5 × 11 in)</option>
                    <option value="Legal">Legal (8.5 × 14 in)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Orientation</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
    onClick={() => setOrientation("portrait")}
    className={`px-4 py-2 border rounded-lg transition-colors ${orientation === "portrait" ? "border-[#F5C742] bg-[#F5C742]/10 text-gray-900" : "border-gray-300 hover:border-gray-400"}`}
  >
                      Portrait
                    </button>
                    <button
    onClick={() => setOrientation("landscape")}
    className={`px-4 py-2 border rounded-lg transition-colors ${orientation === "landscape" ? "border-[#F5C742] bg-[#F5C742]/10 text-gray-900" : "border-gray-300 hover:border-gray-400"}`}
  >
                      Landscape
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3">Margins (mm)</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Top</label>
                      <input
    type="number"
    value={margins.top}
    onChange={(e) => setMargins({ ...margins, top: parseInt(e.target.value) })}
    className="w-full px-3 py-2 border rounded-lg"
  />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Right</label>
                      <input
    type="number"
    value={margins.right}
    onChange={(e) => setMargins({ ...margins, right: parseInt(e.target.value) })}
    className="w-full px-3 py-2 border rounded-lg"
  />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Bottom</label>
                      <input
    type="number"
    value={margins.bottom}
    onChange={(e) => setMargins({ ...margins, bottom: parseInt(e.target.value) })}
    className="w-full px-3 py-2 border rounded-lg"
  />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Left</label>
                      <input
    type="number"
    value={margins.left}
    onChange={(e) => setMargins({ ...margins, left: parseInt(e.target.value) })}
    className="w-full px-3 py-2 border rounded-lg"
  />
                    </div>
                  </div>
                </div>
              </div>}

            {activeTab === "content" && <div className="space-y-6">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Content Sections:</strong> Choose which sections to include in the statement.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showQuickSummary}
    onChange={(e) => setShowQuickSummary(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm font-medium">Quick Balance Summary</span>
                  </label>
                  <p className="text-xs text-gray-500 ml-6">
                    Shows total balance and paid amount cards at the top
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showOpeningBalance}
    onChange={(e) => setShowOpeningBalance(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm font-medium">Opening Balance</span>
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showPurchases}
    onChange={(e) => setShowPurchases(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm font-medium">Purchase Details</span>
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showPayments}
    onChange={(e) => setShowPayments(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm font-medium">Payment Details</span>
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showPDC}
    onChange={(e) => setShowPDC(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm font-medium">PDC (Post-Dated Cheques)</span>
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
    type="checkbox"
    checked={showClosingBalance}
    onChange={(e) => setShowClosingBalance(e.target.checked)}
    className="rounded border-gray-300"
  />
                    <span className="text-sm font-medium">Closing Balance</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Footer Text</label>
                  <textarea
    value={footerText}
    onChange={(e) => setFooterText(e.target.value)}
    placeholder="Enter footer text..."
    rows={3}
    className="w-full px-3 py-2 border rounded-lg"
  />
                </div>
              </div>}

            {activeTab === "email" && <div className="space-y-6">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Email Settings:</strong> Configure default email settings when sending this statement.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email Subject</label>
                  <input
    type="text"
    value={emailSubject}
    onChange={(e) => setEmailSubject(e.target.value)}
    placeholder="e.g., Statement of Account - {vendor}"
    className="w-full px-3 py-2 border rounded-lg"
  />
                  <p className="text-xs text-gray-500 mt-1">
                    Available placeholders: {"{vendor}"}, {"{period}"}, {"{date}"}, {"{company}"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email Body</label>
                  <textarea
    value={emailBody}
    onChange={(e) => setEmailBody(e.target.value)}
    placeholder="Enter default email message..."
    rows={8}
    className="w-full px-3 py-2 border rounded-lg"
  />
                  <p className="text-xs text-gray-500 mt-1">
                    Available placeholders: {"{vendor}"}, {"{period}"}, {"{date}"}, {"{company}"}, {"{balance}"}
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded border-gray-300" />
                    <span className="text-sm">Auto-attach PDF</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded border-gray-300" />
                    <span className="text-sm">Include Company Signature</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded border-gray-300" />
                    <span className="text-sm">Request Read Receipt</span>
                  </label>
                </div>
              </div>}
          </div>
        </div>

        {
    /* Right Panel - Preview */
  }
        <div className="flex-1 flex flex-col bg-gray-50">
          {
    /* Preview Controls */
  }
          <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium">Live Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <button
    onClick={() => setPreviewDevice("mobile")}
    className={`p-2 rounded-lg transition-colors ${previewDevice === "mobile" ? "bg-[#F5C742] text-gray-900" : "hover:bg-gray-100"}`}
  >
                <Smartphone className="w-4 h-4" />
              </button>
              <button
    onClick={() => setPreviewDevice("tablet")}
    className={`p-2 rounded-lg transition-colors ${previewDevice === "tablet" ? "bg-[#F5C742] text-gray-900" : "hover:bg-gray-100"}`}
  >
                <Tablet className="w-4 h-4" />
              </button>
              <button
    onClick={() => setPreviewDevice("desktop")}
    className={`p-2 rounded-lg transition-colors ${previewDevice === "desktop" ? "bg-[#F5C742] text-gray-900" : "hover:bg-gray-100"}`}
  >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>

          {
    /* Preview Area */
  }
          <div className="flex-1 overflow-auto p-8 flex items-start justify-center">
            <div
    className="bg-white shadow-2xl transition-all duration-300"
    style={{
      width: getDeviceWidth(),
      maxWidth: "100%",
      fontFamily,
      fontSize: `${fontSize}px`
    }}
  >
              {
    /* Preview Content */
  }
              <div className="p-8" style={{ border: showBorder ? "1px solid #e5e7eb" : "none" }}>
                {
    /* Header */
  }
                <div
    className="flex items-start justify-between pb-6 mb-6"
    style={{
      backgroundColor: headerBg,
      color: "white",
      padding: "24px",
      marginLeft: "-32px",
      marginRight: "-32px",
      marginTop: "-32px",
      marginBottom: "24px"
    }}
  >
                  <div>
                    {showLogo && <div className="mb-3">
                        <div className="text-2xl font-bold">BillBull</div>
                      </div>}
                    <div className="text-sm opacity-90">
                      <div>123 Business Street</div>
                      <div>Dubai, UAE</div>
                      <div>+971 4 123 4567</div>
                      <div>info@billbull.app</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h1 className="text-2xl font-bold mb-2">STATEMENT OF ACCOUNT</h1>
                    <div className="text-sm opacity-90">
                      <div><strong>Period:</strong> 01 Jan 2024 - 25 Feb 2024</div>
                      <div><strong>Generated:</strong> 25 Feb 2024, 10:30 AM</div>
                    </div>
                  </div>
                </div>

                {
    /* Vendor Info */
  }
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
                    VENDOR INFORMATION
                  </h3>
                  <div className="text-sm p-4 bg-gray-50 rounded-lg">
                    <div className="font-semibold text-base mb-1">Al Mansoori Trading LLC</div>
                    <div className="text-gray-600">456 Vendor Avenue, Abu Dhabi, UAE</div>
                    <div className="text-gray-600">TRN: 123456789012345</div>
                    <div className="text-gray-600">Contact: Ahmed Al Mansoori</div>
                    <div className="text-gray-600">Email: vendor@almansoori.ae | Phone: +971 50 123 4567</div>
                  </div>
                </div>

                {
    /* Quick Summary */
  }
                {showQuickSummary && <div className="grid grid-cols-2 gap-4 mb-6">
                    <div
    className="p-4 rounded-lg text-center"
    style={{ backgroundColor: `${primaryColor}20` }}
  >
                      <div className="text-sm text-gray-600 mb-1">Total Outstanding</div>
                      <div className="text-2xl font-bold" style={{ color: primaryColor }}>
                        AED 45,275.00
                      </div>
                    </div>
                    <div
    className="p-4 rounded-lg text-center"
    style={{ backgroundColor: `${primaryColor}20` }}
  >
                      <div className="text-sm text-gray-600 mb-1">Total Paid</div>
                      <div className="text-2xl font-bold" style={{ color: "#10b981" }}>
                        AED 125,500.00
                      </div>
                    </div>
                  </div>}

                {
    /* Transactions Table */
  }
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: primaryColor }}>
                    TRANSACTION DETAILS
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: `${primaryColor}20`, color: headerBg }}>
                        <th className="text-left p-3 font-semibold">Date</th>
                        <th className="text-left p-3 font-semibold">Reference</th>
                        <th className="text-left p-3 font-semibold">Description</th>
                        <th className="text-right p-3 font-semibold">Debit</th>
                        <th className="text-right p-3 font-semibold">Credit</th>
                        <th className="text-right p-3 font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showOpeningBalance && <tr className="border-b bg-blue-50">
                          <td className="p-3">01 Jan 2024</td>
                          <td className="p-3 font-semibold">Opening Balance</td>
                          <td className="p-3">Balance brought forward</td>
                          <td className="text-right p-3">-</td>
                          <td className="text-right p-3">-</td>
                          <td className="text-right p-3 font-semibold">AED 15,000.00</td>
                        </tr>}
                      {showPurchases && <>
                          <tr className="border-b">
                            <td className="p-3">05 Jan 2024</td>
                            <td className="p-3">LPO-2024-001</td>
                            <td className="p-3">Purchase - Office Supplies</td>
                            <td className="text-right p-3 text-red-600">AED 5,500.00</td>
                            <td className="text-right p-3">-</td>
                            <td className="text-right p-3">AED 20,500.00</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-3">15 Jan 2024</td>
                            <td className="p-3">LPO-2024-008</td>
                            <td className="p-3">Purchase - Equipment</td>
                            <td className="text-right p-3 text-red-600">AED 42,000.00</td>
                            <td className="text-right p-3">-</td>
                            <td className="text-right p-3">AED 62,500.00</td>
                          </tr>
                        </>}
                      {showPayments && <>
                          <tr className="border-b">
                            <td className="p-3">10 Jan 2024</td>
                            <td className="p-3">PV-2024-003</td>
                            <td className="p-3">Payment - Bank Transfer</td>
                            <td className="text-right p-3">-</td>
                            <td className="text-right p-3 text-green-600">AED 15,000.00</td>
                            <td className="text-right p-3">AED 5,500.00</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-3">20 Jan 2024</td>
                            <td className="p-3">PV-2024-012</td>
                            <td className="p-3">Payment - Cheque #123456</td>
                            <td className="text-right p-3">-</td>
                            <td className="text-right p-3 text-green-600">AED 20,000.00</td>
                            <td className="text-right p-3">AED 27,500.00</td>
                          </tr>
                        </>}
                      {showPDC && <tr className="border-b bg-yellow-50">
                          <td className="p-3">28 Feb 2024</td>
                          <td className="p-3">PDC-2024-005</td>
                          <td className="p-3">Post-Dated Cheque (Due)</td>
                          <td className="text-right p-3">-</td>
                          <td className="text-right p-3 text-blue-600">AED 17,775.00</td>
                          <td className="text-right p-3">AED 27,500.00</td>
                        </tr>}
                      {showClosingBalance && <tr className="border-t-2 bg-gray-50">
                          <td className="p-3" />
                          <td className="p-3 font-bold">Closing Balance</td>
                          <td className="p-3">As of 25 Feb 2024</td>
                          <td className="text-right p-3">-</td>
                          <td className="text-right p-3">-</td>
                          <td className="text-right p-3 font-bold text-lg" style={{ color: primaryColor }}>
                            AED 45,275.00
                          </td>
                        </tr>}
                    </tbody>
                  </table>
                </div>

                {
    /* Summary Box */
  }
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 border rounded-lg">
                    <div className="text-xs text-gray-600 mb-1">Total Purchases</div>
                    <div className="font-semibold">AED 47,500.00</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-xs text-gray-600 mb-1">Total Payments</div>
                    <div className="font-semibold text-green-600">AED 35,000.00</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-xs text-gray-600 mb-1">Pending PDC</div>
                    <div className="font-semibold text-blue-600">AED 17,775.00</div>
                  </div>
                </div>

                {
    /* Footer */
  }
                <div className="pt-6 border-t">
                  <p className="text-xs text-gray-600 text-center">{footerText}</p>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    For any queries, please contact us at info@billbull.app or +971 4 123 4567
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>;
}
export {
  VendorSoATemplateDesigner
};
