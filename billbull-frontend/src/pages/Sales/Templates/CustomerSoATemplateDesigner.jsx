import React, { useMemo, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  FileText,
  Layout,
  Mail,
  Palette,
  Save
} from "lucide-react";
import toast from "react-hot-toast";
import DocumentPreviewCanvas from "../../../components/DocumentPreviewCanvas";
import { generateEmailHtml, generatePrintHtml } from "../../../utils/printGenerator";
import {
  buildCustomerSoaPrintData,
  normalizePurchaseTemplate
} from "../../../utils/purchasePrintUtils";

const sampleCompany = {
  companyName: "Max",
  address: "Dubai, UAE",
  phone: "+971 4 000 0000",
  email: "accounts@max.test",
  trn: "100000000000000",
  currency: "AED",
  currencySymbol: "AED",
  logoUrl: null
};

const sampleCustomer = {
  name: "Test Customer LLC",
  code: "CUS-1779252566321",
  address: "Business Bay, Dubai, UAE",
  contact: "+971 50 123 4567",
  email: "accounts@test-customer.test",
  trn: "100123456789000"
};

const sampleStatement = {
  accountCode: "CUS-1779252566321",
  accountName: "Test Customer LLC",
  openingBalance: 1000,
  totalDebit: 990,
  totalCredit: 150,
  closingBalance: 1840,
  entries: [
    {
      transactionDate: "2026-05-20",
      type: "OPENING_BALANCE",
      documentNo: "OB-10001",
      description: "Opening Balance",
      reference: "Opening balance",
      debit: 1000,
      credit: 0,
      runningBalance: 1000
    },
    {
      transactionDate: "2026-05-21",
      type: "INVOICE",
      documentNo: "SI-10002",
      description: "Sales Invoice",
      reference: "-",
      debit: 990,
      credit: 0,
      runningBalance: 1990
    },
    {
      transactionDate: "2026-05-22",
      type: "PAYMENT_RECEIVED",
      documentNo: "RV-10003",
      description: "Receipt Voucher (CASH)",
      reference: "-",
      debit: 0,
      credit: 150,
      runningBalance: 1840
    }
  ]
};

export const defaultCustomerSoaTemplateSettings = (name = "Default Customer Statement of Account") => ({
  templateName: name,
  salesDesigner: "soa",
  docType: "customer-soa",
  accentColor: "#F5C742",
  primaryColor: "#F5C742",
  headerBg: "#1e293b",
  borderColor: "#dbe2ea",
  fontFamily: "Inter, sans-serif",
  fontSize: "13",
  paperSize: "A4",
  orientation: "portrait",
  margins: { top: 14, right: 12, bottom: 14, left: 12 },
  showLogo: true,
  showCompanyLogo: true,
  showCompanyName: true,
  showCompanyAddress: true,
  showCompanyPhone: true,
  showCompanyEmail: true,
  showCompanyWebsite: true,
  showTRN: true,
  showBorder: true,
  showBillTo: true,
  showCustomerName: true,
  showCustomerCode: true,
  showCustomerPhone: true,
  showCustomerEmail: true,
  showCustomerTRN: true,
  showQuickSummary: true,
  showOpeningBalance: true,
  showSales: true,
  showReceipts: true,
  showPDC: true,
  showClosingBalance: true,
  showTerms: false,
  showTermsConditions: false,
  footerText: "This is a computer-generated customer statement and does not require a signature.",
  emailSubject: "Customer Statement of Account - {customer}",
  emailBody: "Dear {customer},\n\nPlease find attached your Statement of Account for the period {period}.\n\nIf you have any questions, please feel free to contact us.\n\nBest regards,\n{company}"
});

const readInitialSettings = ({ templateName, initialSettings, editingTemplate }) => {
  const stored = initialSettings || editingTemplate?.settings || {};
  const resolvedName = stored.templateName || templateName || editingTemplate?.name || "Default Customer Statement of Account";

  return {
    ...defaultCustomerSoaTemplateSettings(resolvedName),
    ...stored,
    templateName: resolvedName,
    paperSize: stored.paperSize || stored.pageSize || "A4",
    orientation: String(stored.orientation || "portrait").toLowerCase() === "landscape" ? "landscape" : "portrait",
    margins: {
      ...defaultCustomerSoaTemplateSettings().margins,
      ...(stored.margins || {})
    }
  };
};

const FieldLabel = ({ children }) => (
  <label className="mb-1.5 block text-xs font-semibold text-slate-700">{children}</label>
);

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 accent-[#F5C742]"
    />
  </label>
);

function CustomerSoATemplateDesigner({
  onBack,
  onClose,
  editingTemplate,
  templateName,
  initialSettings,
  onSave
}) {
  const [activeTab, setActiveTab] = useState("design");
  const [settings, setSettings] = useState(() => readInitialSettings({
    templateName,
    initialSettings,
    editingTemplate
  }));

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateMargin = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      margins: {
        ...(prev.margins || {}),
        [key]: Number(value) || 0
      }
    }));
  };

  const close = onBack || onClose;

  const preview = useMemo(() => {
    const template = normalizePurchaseTemplate({
      category: "Customer Statement of Account",
      name: settings.templateName,
      paperSize: settings.paperSize,
      orientation: settings.orientation === "landscape" ? "Landscape" : "Portrait",
      termsContent: settings.footerText,
      displayOptions: {
        showLogo: settings.showLogo,
        showCompanyDetails: true,
        showCustomerDetails: true,
        showTerms: false,
        salesDesigner: "soa",
        salesDesignerSettings: settings
      },
      columns: {}
    }, "Customer Statement of Account");
    const data = buildCustomerSoaPrintData(
      sampleStatement,
      sampleCustomer,
      sampleCompany,
      {
        startDate: "2026-01-01",
        endDate: "2026-06-01",
        generatedOn: "2026-06-01"
      }
    );

    return {
      printHtml: generatePrintHtml(template, data, { companyProfile: sampleCompany }),
      emailHtml: generateEmailHtml(template, data, { companyProfile: sampleCompany })
    };
  }, [settings]);

  const handleSave = () => {
    const payload = {
      ...settings,
      salesDesigner: "soa",
      docType: "customer-soa",
      templateName: settings.templateName || "Customer Statement of Account"
    };

    if (onSave) {
      onSave(payload);
      return;
    }

    toast.success("Customer SOA template saved");
  };

  const tabs = [
    { id: "design", label: "Design", icon: Palette },
    { id: "layout", label: "Layout", icon: Layout },
    { id: "content", label: "Content", icon: AlignLeft },
    { id: "email", label: "Email", icon: Mail }
  ];

  return (
    <div className="flex h-screen flex-col bg-[#F6F7F9]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={close}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#F5C742]" />
              <input
                value={settings.templateName}
                onChange={(event) => updateSetting("templateName", event.target.value)}
                className="min-w-[320px] rounded-md border border-transparent px-2 py-1 text-lg font-semibold text-slate-950 outline-none focus:border-[#F5C742]"
              />
              {editingTemplate?.isDefault && (
                <span className="rounded bg-[#F5C742] px-2 py-0.5 text-xs font-bold text-black">Default</span>
              )}
            </div>
            <p className="text-sm text-slate-500">Customer Statement of Account Template</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-md bg-[#F5C742] px-5 py-2 text-sm font-semibold text-black hover:bg-[#e5b732]"
        >
          <Save className="h-4 w-4" />
          Save Template
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="grid grid-cols-4 border-b border-slate-200">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 px-2 py-3 text-xs font-semibold ${active ? "border-b-2 border-[#F5C742] text-slate-950" : "text-slate-500 hover:text-slate-900"}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeTab === "design" && (
              <div className="space-y-5">
                <div>
                  <FieldLabel>Primary / Accent Color</FieldLabel>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.accentColor}
                      onChange={(event) => {
                        updateSetting("accentColor", event.target.value);
                        updateSetting("primaryColor", event.target.value);
                      }}
                      className="h-10 w-12 rounded border border-slate-200"
                    />
                    <input
                      value={settings.accentColor}
                      onChange={(event) => {
                        updateSetting("accentColor", event.target.value);
                        updateSetting("primaryColor", event.target.value);
                      }}
                      className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Header Background</FieldLabel>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.headerBg}
                      onChange={(event) => updateSetting("headerBg", event.target.value)}
                      className="h-10 w-12 rounded border border-slate-200"
                    />
                    <input
                      value={settings.headerBg}
                      onChange={(event) => updateSetting("headerBg", event.target.value)}
                      className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Border Color</FieldLabel>
                  <input
                    value={settings.borderColor}
                    onChange={(event) => updateSetting("borderColor", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                  />
                </div>

                <div>
                  <FieldLabel>Font Family</FieldLabel>
                  <select
                    value={settings.fontFamily}
                    onChange={(event) => updateSetting("fontFamily", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Times New Roman, serif">Times New Roman</option>
                  </select>
                </div>

                <div>
                  <FieldLabel>Base Font Size</FieldLabel>
                  <select
                    value={String(settings.fontSize)}
                    onChange={(event) => updateSetting("fontSize", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <option value="11">Compact</option>
                    <option value="12">Small</option>
                    <option value="13">Standard</option>
                    <option value="14">Large</option>
                  </select>
                </div>

                <Toggle label="Show Company Logo" checked={settings.showLogo !== false} onChange={(value) => updateSetting("showLogo", value)} />
                <Toggle label="Show Outer Border" checked={settings.showBorder !== false} onChange={(value) => updateSetting("showBorder", value)} />
              </div>
            )}

            {activeTab === "layout" && (
              <div className="space-y-5">
                <div>
                  <FieldLabel>Paper Size</FieldLabel>
                  <select
                    value={settings.paperSize}
                    onChange={(event) => updateSetting("paperSize", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>

                <div>
                  <FieldLabel>Orientation</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {["portrait", "landscape"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateSetting("orientation", option)}
                        className={`h-10 rounded-md border text-sm font-semibold capitalize ${settings.orientation === option ? "border-[#F5C742] bg-[#F5C742]/15 text-slate-950" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel>Margins (mm)</FieldLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {["top", "right", "bottom", "left"].map((side) => (
                      <div key={side}>
                        <span className="mb-1 block text-[11px] capitalize text-slate-500">{side}</span>
                        <input
                          type="number"
                          min="4"
                          max="40"
                          value={settings.margins?.[side] ?? 12}
                          onChange={(event) => updateMargin(side, event.target.value)}
                          className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "content" && (
              <div className="space-y-3">
                <Toggle label="Quick Balance Summary" checked={settings.showQuickSummary !== false} onChange={(value) => updateSetting("showQuickSummary", value)} />
                <Toggle label="Opening Balance" checked={settings.showOpeningBalance !== false} onChange={(value) => updateSetting("showOpeningBalance", value)} />
                <Toggle label="Sales Details" checked={settings.showSales !== false} onChange={(value) => updateSetting("showSales", value)} />
                <Toggle label="Receipt Details" checked={settings.showReceipts !== false} onChange={(value) => updateSetting("showReceipts", value)} />
                <Toggle label="PDC / Cheques" checked={settings.showPDC !== false} onChange={(value) => updateSetting("showPDC", value)} />
                <Toggle label="Closing Balance" checked={settings.showClosingBalance !== false} onChange={(value) => updateSetting("showClosingBalance", value)} />
                <Toggle label="Customer Code" checked={settings.showCustomerCode !== false} onChange={(value) => updateSetting("showCustomerCode", value)} />
                <Toggle label="Customer Phone" checked={settings.showCustomerPhone !== false} onChange={(value) => updateSetting("showCustomerPhone", value)} />
                <Toggle label="Customer Email" checked={settings.showCustomerEmail !== false} onChange={(value) => updateSetting("showCustomerEmail", value)} />
                <Toggle label="Customer TRN" checked={settings.showCustomerTRN !== false} onChange={(value) => updateSetting("showCustomerTRN", value)} />

                <div className="pt-2">
                  <FieldLabel>Footer Text</FieldLabel>
                  <textarea
                    value={settings.footerText || ""}
                    onChange={(event) => updateSetting("footerText", event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {activeTab === "email" && (
              <div className="space-y-5">
                <div>
                  <FieldLabel>Email Subject</FieldLabel>
                  <input
                    value={settings.emailSubject || ""}
                    onChange={(event) => updateSetting("emailSubject", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Variables: {"{customer}"}, {"{period}"}, {"{date}"}, {"{company}"}</p>
                </div>

                <div>
                  <FieldLabel>Email Body</FieldLabel>
                  <textarea
                    value={settings.emailBody || ""}
                    onChange={(event) => updateSetting("emailBody", event.target.value)}
                    rows={10}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Variables: {"{customer}"}, {"{period}"}, {"{date}"}, {"{company}"}, {"{balance}"}</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          <DocumentPreviewCanvas
            printHtml={preview.printHtml}
            emailHtml={preview.emailHtml}
            paperSize={settings.paperSize || "A4"}
            orientation={settings.orientation === "landscape" ? "Landscape" : "Portrait"}
            title="Customer SOA Template Preview"
            subtitle="Print and email preview use the live Customer SOA rendering engine."
          />
        </main>
      </div>
    </div>
  );
}

export { CustomerSoATemplateDesigner };
