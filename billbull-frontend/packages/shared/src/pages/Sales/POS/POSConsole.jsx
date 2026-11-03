import React, { useEffect, useState, useMemo } from 'react';
import { LayoutGrid, Shield, Printer, FileText, Hash, ChevronRight, Settings, CheckCircle, LayoutTemplate, Columns, Eye, Zap, XCircle, Wallet, Plus, Search, CreditCard, Package, Trash2, X, Users, RotateCcw, Wrench, RefreshCw, Info, Unlock, Lock, Star, Monitor, Clock, AlertTriangle, ChevronDown, ChevronUp, Cpu, Layers, MoreHorizontal } from 'lucide-react';
import { UAParser } from 'ua-parser-js';
import { usePermissions } from '../../../context/PermissionContext';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../../../components/ui/tooltip';
import POSCounters from '../POSCounters';
import { usePosHost } from './posHost';
import { Switch } from '../../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Input } from '../../../components/ui/input';
import { A4LivePreview, A4PreviewFrame, ThermalMock, PaperSizePicker } from './POSPrintPreview';
import { buildDocumentPreviewHtml, buildThermalPrintHtml, buildThermalSampleHtml, buildServiceJobA4Html, buildThermalJobCardHtml, buildThermalTestReceiptText, buildPosPrintData, applyTaxAwareDisplayOptions, USE_NEW_POS_PRINT_TEMPLATE } from './posPrintUtils';
import { mergeSavedPosSettings } from './posUtils';
import { printHtml } from '../../../utils/printGenerator';
import { generateDocumentPrintHtml } from '../../../utils/documentTemplateRenderer';
import { generateOverlayInvoiceHtml } from '../../../utils/overlayInvoiceRenderer';
import { isOverlayTemplate, isSheetPaper, pickSheetTemplate, POS_SHEET_FORMATS, sheetFormatLabel, sheetPixelSize } from './device/printing/posSheetTemplates';
import { RECEIPT_TEMPLATES, getReceiptTemplate, DEFAULT_RECEIPT_TEMPLATE_ID } from './receiptTemplates';
import { buildSampleTxn } from './receiptTemplates/billBullTaxInvoiceData';
import { buildSampleInvoice, buildSampleOpts } from './receiptTemplates/sampleInvoice';
import { buildEscPosReceiptBase64 } from '../../../utils/escPosReceipt';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from '../../../utils/localPrintAgent';
import { createPosPrinter, updatePosPrinter, updatePosPrinterRuntime, decommissionPosPrinter } from '../../../api/posPrinterApi';
import { getPosScanners, createPosScanner, decommissionPosScanner } from '../../../api/posScannerApi';
import { getPosCashDrawers, createPosCashDrawer, decommissionPosCashDrawer } from '../../../api/posCashDrawerApi';
import { assignTerminalCounter, archivePosTerminal, restorePosTerminal, decommissionPosTerminal, keepTerminalActive, archiveTerminalNow, setTerminalAutoArchiveExempt, savePosAppearance } from '../../../api/posApi';
import { getActiveCounters } from '../../../api/counterApi';
import { listPrintAgentPrinters, runtimeStatusFromPrintError, runtimeStatusFromPrintSuccess, testConfiguredPrinter } from '../../../utils/localPrintAgent';
import PrintAgentPairing from './device/printing/PrintAgentPairing';
import { buildEscPosTestReceipt } from '../../../utils/escPosReceipt';
import { buildZplTestLabel, zplToBase64 } from '../../../utils/zplText';
import { confirmDialog } from '../../../components/AppConfirmBridge';
import PosBehaviorSettings from './features/settings/PosBehaviorSettings';

/**
 * Renders the real, resolved Back Office "Sales Invoice"/"Sales Return" PrintTemplate
 * through the actual production renderer (generateDocumentPrintHtml), fed with the
 * same sample invoice data used elsewhere in this designer's Test Print — so this
 * live preview shows exactly what checkout will print, not a separate approximation
 * built from this screen's own toggles (which is what A4LivePreview does).
 */
// hasTax=false (POS Receipt sub-tab) builds a no-tax Sales Invoice sample AND
// strips every tax element from the resolved template, so the designer preview
// matches the real no-tax checkout print. Defaults true (Tax Invoice tab).
// The same sample sale rendered through a real template: the overlay renderer for a
// pre-printed form, the document renderer (tax-aware) for A4 / A5 sheets — the same
// split usePosPrinting.buildInvoiceSheetHtml applies at the till.
const buildResolvedTemplateSampleHtml = (template, { isReturn = false, hasTax = true, outlet, footerNote }) => {
  const sampleInvoice = buildSampleInvoice({ isReturn, noTax: !hasTax });
  const data = buildPosPrintData(sampleInvoice, footerNote);
  const options = {
    companyProfile: {
      companyName: outlet.name, trn: outlet.trn, address: outlet.address, phone: outlet.phone,
      currency: 'AED', logoUrl: outlet.logoDataUrl || undefined, stampUrl: outlet.stampDataUrl || undefined,
      showStampInPrint: !!outlet.stampDataUrl,
    },
  };
  if (isOverlayTemplate(template)) return generateOverlayInvoiceHtml(template, data, options);
  return generateDocumentPrintHtml(applyTaxAwareDisplayOptions(template, hasTax), data, options);
};

const ResolvedTemplateA4Preview = ({ template, isReturn, hasTax = true, outlet, footerNote, scale }) => {
  const html = useMemo(
    () => buildResolvedTemplateSampleHtml(template, { isReturn, hasTax, outlet, footerNote }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, isReturn, hasTax, outlet.name, outlet.trn, outlet.address, outlet.phone, outlet.logoDataUrl, outlet.stampDataUrl, footerNote],
  );
  const { width, height } = sheetPixelSize(template);
  // Keep the preview the width an A4 page renders at, whatever the sheet.
  const fitScale = scale * (794 / width);
  return <A4PreviewFrame html={html} scale={fitScale} pageWidth={width} pageHeight={height} />;
};

const POSConsole = React.memo((props) => {
  const { 
    currentTerminal, setCurrentTerminal, setTerminalsLoading, setTerminalList, setEditingTerminalId, setEditTerminalName, setEditCounterName, setTerminalSaving, editTerminalName, editCounterName, terminalList, 
    setCurrentView, consoleTab, setConsoleTab, settingsSaving, setSettingsSaving, posSettings, setPosSettings, settingsSavedFlash, setSettingsSavedFlash, 
    tplOutletName, setTplOutletName, tplOutletTrn, setTplOutletTrn, tplOutletAddress, setTplOutletAddress, tplOutletPhone, setTplOutletPhone, effectiveOutletTrn,
    tplLogoDataUrl, setTplLogoDataUrl, tplStampDataUrl, setTplStampDataUrl, 
    tplReceiptHeader, setTplReceiptHeader, tplReceiptHeaderAr, setTplReceiptHeaderAr, tplReceiptFooter, setTplReceiptFooter, tplReceiptPaper, setTplReceiptPaper,
    tplReceiptShowLogo, tplReceiptShowTrn, tplReceiptShowStamp, tplReceiptShowBarcode, tplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails, 
    tplReceiptColItemCode, tplReceiptColItemImage, tplReceiptColBatchNo, tplReceiptColDiscount, tplReceiptColVatPct, tplReceiptColVatAmt, 
    tplReceiptShowGrandTotalBanner, tplReceiptShowTerms, tplReceiptShowNotes, tplReceiptShowBankDetails, tplReceiptShowQRCode, tplReceiptShowSignature, 
    tplInvoiceHeader, tplInvoiceHeaderAr, setTplInvoiceHeaderAr, tplInvoiceFooter, tplInvoicePaper,
    tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn, tplInvoiceShowCustomerDetails, tplInvoiceShowStamp, tplInvoiceShowSignature, 
    tplInvoiceShowGrandTotalBanner, tplInvoiceShowTerms, tplInvoiceShowNotes, tplInvoiceShowBankDetails, tplInvoiceShowQRCode,
    tplInvoiceQrPlacement, setTplInvoiceQrPlacement,
    tplInvoiceColItemCode, tplInvoiceColItemImage, tplInvoiceColBarcode, tplInvoiceColBatchNo, tplInvoiceColDiscount, tplInvoiceColVatPct, tplInvoiceColVatAmt,
    tplReturnHeader, tplReturnFooter, tplReturnPaper, 
    tplReturnShowLogo, tplReturnShowTrn, tplReturnShowStamp, tplReturnShowCompanyDetails, tplReturnShowCustomerDetails, 
    tplReturnColItemCode, tplReturnColBatchNo, tplReturnColDiscount, tplReturnColVatPct, tplReturnColVatAmt, 
    tplReturnShowGrandTotalBanner, tplReturnShowTerms, tplReturnShowNotes, tplReturnShowQRCode, tplReturnShowSignature, tplReturnShowCreditBalance, 
    tplJobCardFooter, tplJobCardPaper, 
    tplJobCardShowLogo, tplJobCardShowTrn, tplJobCardShowStamp, tplJobCardShowCompanyDetails, tplJobCardShowCustomerDetails, 
    tplJobCardShowSerialNumber, tplJobCardShowWarranty, tplJobCardShowTechnician, tplJobCardShowExpectedDate, tplJobCardShowCustomerSignature, tplJobCardShowTerms,
    receiptTemplateId, setReceiptTemplateId,
    t2ShowLogo, t2ShowCompanyDetails, t2ShowTrn, t2ShowArabic, t2ShowCustomerDetails, t2ShowAccountBalance, t2ShowDelivery,
    t2ShowVatSummary, t2ShowPaymentDetails, t2ShowLoyalty, t2ShowQRCode, t2ShowFooterText, t2ShowBarcode,
    setT2ShowLogo, setT2ShowCompanyDetails, setT2ShowTrn, setT2ShowArabic, setT2ShowCustomerDetails, setT2ShowAccountBalance, setT2ShowDelivery,
    setT2ShowVatSummary, setT2ShowPaymentDetails, setT2ShowLoyalty, setT2ShowQRCode, setT2ShowFooterText, setT2ShowBarcode,
    t2ReceiptShowLogo, t2ReceiptShowCompanyDetails, t2ReceiptShowTrn, t2ReceiptShowArabic, t2ReceiptShowCustomerDetails, t2ReceiptShowAccountBalance, t2ReceiptShowDelivery,
    t2ReceiptShowVatSummary, t2ReceiptShowPaymentDetails, t2ReceiptShowLoyalty, t2ReceiptShowQRCode, t2ReceiptShowFooterText, t2ReceiptShowBarcode,
    setT2ReceiptShowLogo, setT2ReceiptShowCompanyDetails, setT2ReceiptShowTrn, setT2ReceiptShowArabic, setT2ReceiptShowCustomerDetails, setT2ReceiptShowAccountBalance, setT2ReceiptShowDelivery,
    setT2ReceiptShowVatSummary, setT2ReceiptShowPaymentDetails, setT2ReceiptShowLoyalty, setT2ReceiptShowQRCode, setT2ReceiptShowFooterText, setT2ReceiptShowBarcode,
    t2InvoiceShowLogo, t2InvoiceShowCompanyDetails, t2InvoiceShowTrn, t2InvoiceShowArabic, t2InvoiceShowCustomerDetails, t2InvoiceShowAccountBalance, t2InvoiceShowDelivery,
    t2InvoiceShowVatSummary, t2InvoiceShowPaymentDetails, t2InvoiceShowLoyalty, t2InvoiceShowQRCode, t2InvoiceShowFooterText, t2InvoiceShowBarcode,
    setT2InvoiceShowLogo, setT2InvoiceShowCompanyDetails, setT2InvoiceShowTrn, setT2InvoiceShowArabic, setT2InvoiceShowCustomerDetails, setT2InvoiceShowAccountBalance, setT2InvoiceShowDelivery,
    setT2InvoiceShowVatSummary, setT2InvoiceShowPaymentDetails, setT2InvoiceShowLoyalty, setT2InvoiceShowQRCode, setT2InvoiceShowFooterText, setT2InvoiceShowBarcode,
    posTemplate, setPosTemplate, hideCategoriesPanel, setHideCategoriesPanel, hideItemsPanel, setHideItemsPanel, hiddenPanelButtons, togglePanelButton,
    quickCheckoutEnabled = true, setQuickCheckoutEnabled,
    settingsDraft, setSettingsDraft, handleSaveSettings, beginEditSettings,
    printerConfigs, setPrinterConfigs, printersLoading, loadPrinterConfigs,
    scannerConfig, setScannerConfig, saveScannerConfig, scannerConfigSavedFlash,
    getAllPosTerminals, renamePosTerminal, setTerminalStatus, setMainPosTerminal, savePosSettings, templateSubTab, setTemplateSubTab,
    // Phase 3 cutover: real resolved "Sales Invoice"/"Sales Return" PrintTemplate
    // rows (read-only here — see POSSales.jsx for the fetch). Used so this designer's
    // live preview shows the SAME template that actually prints at checkout, instead
    // of a separate approximation built from this screen's own toggles.
    resolvedPosInvoiceTemplate, resolvedPosCreditNoteTemplate, posInvoiceTemplateFamily,
    setTplReceiptShowLogo, setTplReceiptShowCompanyDetails, setTplReceiptShowTrn, setTplReceiptShowCustomerDetails, setTplReceiptShowTerms, setTplReceiptShowNotes, setTplReceiptShowBankDetails, setTplReceiptShowQRCode, setTplReceiptShowStamp, setTplReceiptShowSignature, setTplReceiptShowGrandTotalBanner, setTplReceiptColItemCode, setTplReceiptColItemImage, setTplReceiptShowBarcode, setTplReceiptColBatchNo, setTplReceiptColDiscount, setTplReceiptColVatPct, setTplReceiptColVatAmt,
    setTplInvoiceShowLogo, setTplInvoiceShowCompanyDetails, setTplInvoiceShowTrn, setTplInvoiceShowCustomerDetails, setTplInvoiceShowTerms, setTplInvoiceShowNotes, setTplInvoiceShowBankDetails, setTplInvoiceShowQRCode, setTplInvoiceShowStamp, setTplInvoiceShowSignature, setTplInvoiceShowGrandTotalBanner, setTplInvoiceColItemCode, setTplInvoiceColItemImage, setTplInvoiceColBatchNo, setTplInvoiceColDiscount, setTplInvoiceColVatPct, setTplInvoiceColVatAmt, 
    setTplReturnShowLogo, setTplReturnShowCompanyDetails, setTplReturnShowTrn, setTplReturnShowCustomerDetails, setTplReturnShowTerms, setTplReturnShowNotes, setTplReturnShowQRCode, setTplReturnShowStamp, setTplReturnShowSignature, setTplReturnShowGrandTotalBanner, setTplReturnColItemCode, setTplReturnColBatchNo, setTplReturnColDiscount, setTplReturnColVatPct, setTplReturnColVatAmt, setTplReturnShowCreditBalance,
    setTplJobCardShowLogo, setTplJobCardShowCompanyDetails, setTplJobCardShowTrn, setTplJobCardShowCustomerDetails, setTplJobCardShowSerialNumber, setTplJobCardShowWarranty, setTplJobCardShowTechnician, setTplJobCardShowExpectedDate, setTplJobCardShowCustomerSignature, setTplJobCardShowTerms, setTplJobCardShowStamp,
    editingTerminalId, terminalsLoading, terminalSaving,
    setTplInvoiceHeader, setTplInvoiceFooter, setTplInvoicePaper, setTplInvoiceColBarcode,
    setTplReturnHeader, setTplReturnFooter, setTplReturnPaper,
    setTplJobCardFooter, setTplJobCardPaper,
  } = props;

    // Frontend gating mirrors backend permissions.pos.terminal.<action> exactly — this hides
    // actions the user can't perform, but the backend (ModulePermissionService) is the actual
    // enforcement (see PosTerminalController.requireTerminalAction).
    const { canAction, hasAnyRole } = usePermissions();
    // Terminal & counter administration is a Retail capability; the standalone till hides it.
    const { terminalAdministration } = usePosHost();
    const canTerminalAction = (action) => canAction(`permissions.pos.terminal.${action}`, 'view');
    // The Behavior tab exposes supervisor-approval config (void gate, PIN/password) —
    // restrict it to supervisor-capable roles, mirroring the backend role gate in
    // PosSettingsService.save() (SUPERVISOR_CONFIG_ROLES), and to users who may save it at all
    // (pos.settings edit, PosSettingsController.save) — otherwise the tab would 403 on Save.
    // Layouts and Print Templates are open to every till user (savePosAppearance).
    const canManageBehaviorSettings = hasAnyRole('ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'SUPERVISOR')
      && (hasAnyRole('ADMIN') || canAction('pos.settings', 'edit'));

    // Phase 3 cutover (reworked): POS now resolves the real Back Office "Sales
    const allBtnList = [
      { id:'layaways',label:'Layaways' },{ id:'save-layaway',label:'Save Layaway' },{ id:'save-order',label:'Save as Order' },
      { id:'add-shipping',label:'Add Shipping' },{ id:'add-customer',label:'Add Customer' },{ id:'coupons',label:'Coupons' },
      { id:'promotions',label:'Promotions' },{ id:'last-receipt',label:'Last Receipt' },{ id:'orders',label:'Orders' },
      { id:'return',label:'Return' },{ id:'search-products',label:'Search Products' },{ id:'price-chk',label:'Price Check' },
      { id:'cash-drop',label:'Cash Drawer' },{ id:'credit-balance',label:'Credit Balance' },
      { id:'z-report',label:'Z-Report' },{ id:'reprint',label:'Reprint' },
      { id:'lock-pos',label:'Lock POS' },{ id:'close-session',label:'Close Session' },
    ];
    const printerTypeOptions = [
      { value: 'RECEIPT_PRINTER', label: 'Receipt Printer' },
      { value: 'KITCHEN_PRINTER', label: 'Kitchen Printer' },
      { value: 'LABEL_PRINTER', label: 'Label Printer' },
    ];
    // Full set, including the retired transport — connectionLabel() still needs it so
    // existing client rows render as a name rather than a raw enum constant.
    const connectionOptions = [
      { value: 'WINDOWS_QUEUE', label: 'Windows Queue' },
      { value: 'USB', label: 'USB' },
      { value: 'NETWORK_IP', label: 'Network / IP' },
      { value: 'BLUETOOTH', label: 'Bluetooth' },
      { value: 'ZEBRA_BROWSER_PRINT', label: 'Zebra Browser Print (retired)' },
    ];
    // What an admin may pick for a NEW printer. Zebra Browser Print is retired — it
    // required an HTTPS listener on localhost:9101 whose certificate broke the page's
    // secure state, and printing now goes through the local Print Agent (Windows queue)
    // or the backend relay (network). The enum value itself is deliberately kept so
    // existing rows stay readable and are never silently rewritten.
    const selectableConnectionOptions = connectionOptions.filter((c) => c.value !== 'ZEBRA_BROWSER_PRINT');
    const paperSizeOptions = ['58mm', '80mm', '100x150mm'];
    const printTemplateOptions = ['Receipt', 'Kitchen', 'Label'];

    const createInitialPrinterForm = (type = 'RECEIPT_PRINTER') => ({
      deviceType: type,
      deviceCode: '',
      deviceName: '',
      modelName: '',
      connectionType: 'WINDOWS_QUEUE',
      systemPrinterName: '',
      deviceIdentifier: '',
      ipAddress: '',
      portNumber: type === 'LABEL_PRINTER' ? '' : '9100',
      paperSize: type === 'LABEL_PRINTER' ? '100x150mm' : '80mm',
      printTemplate: type === 'KITCHEN_PRINTER' ? 'Kitchen' : type === 'LABEL_PRINTER' ? 'Label' : 'Receipt',
      defaultPrinter: type !== 'KITCHEN_PRINTER',
      status: 'ACTIVE',
      assignToCurrentTerminal: Boolean(currentTerminal?.terminalId),
      notes: '',
    });

    const [counterList, setCounterList] = useState([]);
    const [viewHistoryTerminalId, setViewHistoryTerminalId] = useState(null);
    const [terminalFilter, setTerminalFilter] = useState('ALL');
    const [terminalSearch, setTerminalSearch] = useState('');
    const [terminalMenuId, setTerminalMenuId] = useState(null);
    // Archive-terminal confirmation dialog (replaces window.prompt/window.confirm)
    const [archiveModalTerminal, setArchiveModalTerminal] = useState(null);
    const [archiveModalReason, setArchiveModalReason] = useState('');
    const [archiveModalBusy, setArchiveModalBusy] = useState(false);
    const [archiveModalError, setArchiveModalError] = useState('');
    const [archiveNowModalTerminal, setArchiveNowModalTerminal] = useState(null);
    const [archiveNowModalBusy, setArchiveNowModalBusy] = useState(false);
    // Decommission-terminal confirmation dialog (replaces window.prompt/window.confirm)
    const [decommissionModalTerminal, setDecommissionModalTerminal] = useState(null);
    const [decommissionModalReason, setDecommissionModalReason] = useState('');
    const [decommissionModalBusy, setDecommissionModalBusy] = useState(false);
    const [decommissionModalError, setDecommissionModalError] = useState('');
    const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
    const [editingPrinter, setEditingPrinter] = useState(null);
    const [printerForm, setPrinterForm] = useState(createInitialPrinterForm());
    const [printerSaving, setPrinterSaving] = useState(false);
    const [printerBusyId, setPrinterBusyId] = useState(null);
    // Debug trace of the most recent printer test, keyed by printer id — surfaced in an
    // on-screen collapsible block so the send payload + agent response can be inspected
    // without opening DevTools. See handlePrinterTest.
    const [printerTestDebug, setPrinterTestDebug] = useState({});
    const [agentPrinters, setAgentPrinters] = useState([]);
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentError, setAgentError] = useState('');

    // Unified Connected Devices list — printers (from parent props) plus scanners
    // and cash drawers fetched here. Card Terminal is intentionally omitted: it
    // has no persistence endpoint yet (design-only per the device architecture spec).
    const [scanners, setScanners] = useState([]);
    const [cashDrawers, setCashDrawers] = useState([]);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [deviceBusyKey, setDeviceBusyKey] = useState(null);
    const [addDeviceOpen, setAddDeviceOpen] = useState(false);
    const [addDeviceForm, setAddDeviceForm] = useState({ deviceType: 'RECEIPT_PRINTER', deviceName: '', connectionType: 'USB', attachedPrinterId: '' });
    const [addDeviceSaving, setAddDeviceSaving] = useState(false);
    const [addDeviceError, setAddDeviceError] = useState('');

    // Add New Device modal option set (mockup). Printer sub-types map to the
    // existing PosPrinter flow; scanner/cash-drawer hit their own endpoints.
    const addDeviceTypeOptions = [
      { value: 'RECEIPT_PRINTER', label: 'Receipt Printer', kind: 'printer' },
      { value: 'KITCHEN_PRINTER', label: 'Kitchen Printer', kind: 'printer' },
      { value: 'LABEL_PRINTER',   label: 'Label Printer',   kind: 'printer' },
      { value: 'SCANNER',         label: 'Barcode Scanner', kind: 'scanner' },
      { value: 'CASH_DRAWER',     label: 'Cash Drawer',     kind: 'drawer' },
    ];
    const addDeviceConnectionOptions = [
      { value: 'USB', label: 'USB' },
      { value: 'COM_PORT', label: 'COM Port' },
      { value: 'NETWORK_IP', label: 'Network / IP' },
      { value: 'BLUETOOTH', label: 'Bluetooth' },
      { value: 'SERIAL', label: 'Serial' },
    ];
    const addDeviceKind = addDeviceTypeOptions.find((t) => t.value === addDeviceForm.deviceType)?.kind || 'printer';

    // Device codes are unique + required server-side; auto-generate a readable one
    // scoped to the terminal so the minimal Add modal doesn't need a code field.
    const generateDeviceCode = (prefix) => {
      const term = (currentTerminal?.terminalId || 'T').toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'T';
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      return `${term}-${prefix}-${rand}`;
    };

    const printerTypeLabel = (value) => printerTypeOptions.find((t) => t.value === value)?.label || value;
    const connectionLabel = (value) => connectionOptions.find((t) => t.value === value)?.label || value;
    const formatPrinterTimestamp = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toLocaleString();
    };
    const scannerEnabled = Boolean(scannerConfig?.enabled) && scannerConfig?.status === 'ACTIVE';

    useEffect(() => {
      if (consoleTab !== 'devices') return;
      loadPrinterConfigs?.();
    }, [consoleTab, loadPrinterConfigs, currentTerminal?.branchId]);

    useEffect(() => {
      if (consoleTab !== 'terminals') return;
      const branchId = currentTerminal?.branchId;
      if (!branchId) return;
      getActiveCounters(branchId).then(data => setCounterList(Array.isArray(data) ? data : [])).catch(() => {});
    }, [consoleTab, currentTerminal?.branchId]);

    const refreshAgentPrinters = async () => {
      setAgentLoading(true);
      setAgentError('');
      try {
        const data = await listPrintAgentPrinters();
        setAgentPrinters(Array.isArray(data) ? data : []);
      } catch (err) {
        setAgentPrinters([]);
        setAgentError(err?.message || 'Print agent unavailable.');
      } finally {
        setAgentLoading(false);
      }
    };

    useEffect(() => {
      if (consoleTab === 'devices') {
        refreshAgentPrinters();
      }
    }, [consoleTab]);

    const loadNonPrinterDevices = async () => {
      const branchId = currentTerminal?.branchId;
      if (!branchId) { setScanners([]); setCashDrawers([]); return; }
      setDevicesLoading(true);
      try {
        const [sc, cd] = await Promise.all([
          getPosScanners({ branchId }).catch(() => []),
          getPosCashDrawers({ branchId }).catch(() => []),
        ]);
        setScanners(Array.isArray(sc) ? sc : []);
        setCashDrawers(Array.isArray(cd) ? cd : []);
      } finally {
        setDevicesLoading(false);
      }
    };

    useEffect(() => {
      if (consoleTab === 'devices') {
        loadNonPrinterDevices();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [consoleTab, currentTerminal?.branchId]);

    const openAddDevice = (deviceType = 'RECEIPT_PRINTER', prefill = {}) => {
      const kind = addDeviceTypeOptions.find((t) => t.value === deviceType)?.kind || 'printer';
      setAddDeviceError('');
      setAddDeviceForm({
        deviceType,
        deviceName: '',
        connectionType: 'USB',
        attachedPrinterId: '',
        systemPrinterName: '',
        ipAddress: '',
        portNumber: '9100',
        ...prefill,
      });
      setAddDeviceOpen(true);
    };

    // Minimal Add modal: create the device row, then hand off to the fuller edit
    // panel for printers so system-printer-name / IP / paper size can be set
    // (a printer can't actually print until those exist). Scanners and drawers
    // are complete after this one step.
    const submitAddDevice = async () => {
      const branchId = currentTerminal?.branchId;
      if (!branchId) { setAddDeviceError('Select a branch/terminal first.'); return; }
      if (!addDeviceForm.deviceName.trim()) { setAddDeviceError('Device name is required.'); return; }
      setAddDeviceSaving(true);
      setAddDeviceError('');
      try {
        const common = {
          deviceName: addDeviceForm.deviceName.trim(),
          branchId,
          branchName: currentTerminal?.branchName || '',
          terminalId: currentTerminal?.terminalId || null,
          counterName: currentTerminal?.counterName || null,
          status: 'ACTIVE',
        };
        if (addDeviceKind === 'scanner') {
          const conn = addDeviceForm.connectionType === 'BLUETOOTH' ? 'BLUETOOTH' : 'USB';
          await createPosScanner({ ...common, deviceCode: generateDeviceCode('SCAN'), connectionType: conn });
          setAddDeviceOpen(false);
          await loadNonPrinterDevices();
        } else if (addDeviceKind === 'drawer') {
          if (!addDeviceForm.attachedPrinterId) { setAddDeviceError('Select the receipt printer this drawer is wired to.'); setAddDeviceSaving(false); return; }
          await createPosCashDrawer({ ...common, deviceCode: generateDeviceCode('DRW'), attachedPrinterId: Number(addDeviceForm.attachedPrinterId) });
          setAddDeviceOpen(false);
          await loadNonPrinterDevices();
        } else {
          // Printer: map the minimal modal's connection onto the printer enum. The
          // backend requires a system printer name (USB/Windows/Bluetooth/Zebra) or
          // IP+port (Network) at CREATE time — see PosPrinterService.requiresSystemPrinterName
          // — so the modal collects that one connection-dependent field up front, then
          // opens the full edit dialog for the rest (paper size, template, etc.).
          const printerConn = ({ USB: 'USB', NETWORK_IP: 'NETWORK_IP', BLUETOOTH: 'BLUETOOTH', COM_PORT: 'USB', SERIAL: 'USB' }[addDeviceForm.connectionType]) || 'WINDOWS_QUEUE';
          const resolvedConn = printerConn;
          if (resolvedConn === 'NETWORK_IP') {
            if (!addDeviceForm.ipAddress.trim() || !addDeviceForm.portNumber) {
              setAddDeviceError('Network printers need an IP address and port.'); setAddDeviceSaving(false); return;
            }
          } else if (!addDeviceForm.systemPrinterName.trim()) {
            setAddDeviceError('Pick or enter the Windows system printer name.'); setAddDeviceSaving(false); return;
          }
          const payload = {
            deviceCode: generateDeviceCode(addDeviceForm.deviceType === 'KITCHEN_PRINTER' ? 'KIT' : addDeviceForm.deviceType === 'LABEL_PRINTER' ? 'LBL' : 'REC'),
            deviceType: addDeviceForm.deviceType,
            deviceName: addDeviceForm.deviceName.trim(),
            branchId,
            branchName: currentTerminal?.branchName || '',
            terminalId: currentTerminal?.terminalId || null,
            terminalName: currentTerminal?.terminalName || currentTerminal?.terminalId || null,
            counterName: currentTerminal?.counterName || null,
            connectionType: resolvedConn,
            systemPrinterName: resolvedConn === 'NETWORK_IP' ? null : addDeviceForm.systemPrinterName.trim(),
            ipAddress: resolvedConn === 'NETWORK_IP' ? addDeviceForm.ipAddress.trim() : null,
            portNumber: resolvedConn === 'NETWORK_IP' ? Number(addDeviceForm.portNumber) : null,
            paperSize: addDeviceForm.deviceType === 'LABEL_PRINTER' ? '100x150mm' : '80mm',
            printTemplate: addDeviceForm.deviceType === 'KITCHEN_PRINTER' ? 'Kitchen' : addDeviceForm.deviceType === 'LABEL_PRINTER' ? 'Label' : 'Receipt',
            defaultPrinter: addDeviceForm.deviceType !== 'KITCHEN_PRINTER',
            status: 'ACTIVE',
          };
          const saved = await createPosPrinter(payload);
          setPrinterConfigs((prev) => {
            const list = Array.isArray(prev) ? prev.filter((item) => item.id !== saved.id) : [];
            return [...list, saved].sort((a, b) => String(a.deviceName || '').localeCompare(String(b.deviceName || '')));
          });
          setAddDeviceOpen(false);
          editPrinter(saved); // open full edit panel to complete printer setup
        }
      } catch (err) {
        setAddDeviceError(err?.response?.data?.message || err?.message || 'Failed to add device.');
      } finally {
        setAddDeviceSaving(false);
      }
    };

    const decommissionScanner = async (scanner) => {
      if (!(await confirmDialog({
        title: 'Remove scanner?',
        message: `Scanner "${scanner.deviceName}" will be removed from this outlet's devices.`,
        confirmLabel: 'Remove scanner',
        tone: 'danger',
      }))) return;
      setDeviceBusyKey(`scanner-${scanner.id}`);
      try {
        await decommissionPosScanner(scanner.id);
        await loadNonPrinterDevices();
      } catch (err) {
        window.alert(err?.response?.data?.message || err?.message || 'Failed to remove scanner.');
      } finally {
        setDeviceBusyKey(null);
      }
    };

    const decommissionDrawer = async (drawer) => {
      if (!(await confirmDialog({
        title: 'Remove cash drawer?',
        message: `Cash drawer "${drawer.deviceName}" will be removed from this outlet's devices.`,
        confirmLabel: 'Remove drawer',
        tone: 'danger',
      }))) return;
      setDeviceBusyKey(`drawer-${drawer.id}`);
      try {
        await decommissionPosCashDrawer(drawer.id);
        await loadNonPrinterDevices();
      } catch (err) {
        window.alert(err?.response?.data?.message || err?.message || 'Failed to remove cash drawer.');
      } finally {
        setDeviceBusyKey(null);
      }
    };

    const openPrinterDialog = (type = 'RECEIPT_PRINTER') => {
      setEditingPrinter(null);
      setPrinterForm(createInitialPrinterForm(type));
      setPrinterDialogOpen(true);
    };

    const editPrinter = (printer) => {
      setEditingPrinter(printer);
      setPrinterForm({
        deviceType: printer.deviceType || 'RECEIPT_PRINTER',
        deviceCode: printer.deviceCode || '',
        deviceName: printer.deviceName || '',
        modelName: printer.modelName || '',
        connectionType: printer.connectionType || 'WINDOWS_QUEUE',
        systemPrinterName: printer.systemPrinterName || '',
        deviceIdentifier: printer.deviceIdentifier || '',
        ipAddress: printer.ipAddress || '',
        portNumber: printer.portNumber == null ? '' : String(printer.portNumber),
        paperSize: printer.paperSize || '80mm',
        printTemplate: printer.printTemplate || 'Receipt',
        defaultPrinter: Boolean(printer.defaultPrinter),
        status: printer.status || 'ACTIVE',
        assignToCurrentTerminal: Boolean(printer.terminalId),
        notes: printer.notes || '',
      });
      setPrinterDialogOpen(true);
    };

    const savePrinter = async () => {
      const branchId = currentTerminal?.branchId;
      if (!branchId) return;
      setPrinterSaving(true);
      try {
        const payload = {
          deviceCode: printerForm.deviceCode,
          deviceType: printerForm.deviceType,
          deviceName: printerForm.deviceName,
          modelName: printerForm.modelName,
          branchId,
          branchName: currentTerminal?.branchName || '',
          terminalId: printerForm.assignToCurrentTerminal ? (currentTerminal?.terminalId || null) : null,
          terminalName: printerForm.assignToCurrentTerminal ? (currentTerminal?.terminalName || currentTerminal?.terminalId || null) : null,
          counterName: printerForm.assignToCurrentTerminal ? (currentTerminal?.counterName || null) : null,
          connectionType: printerForm.connectionType,
          systemPrinterName: printerForm.systemPrinterName,
          deviceIdentifier: printerForm.deviceIdentifier,
          ipAddress: printerForm.ipAddress || null,
          portNumber: printerForm.portNumber ? Number(printerForm.portNumber) : null,
          paperSize: printerForm.paperSize,
          printTemplate: printerForm.printTemplate,
          defaultPrinter: Boolean(printerForm.defaultPrinter),
          status: printerForm.status,
          notes: printerForm.notes,
        };
        const saved = editingPrinter
          ? await updatePosPrinter(editingPrinter.id, payload)
          : await createPosPrinter(payload);
        setPrinterConfigs((prev) => {
          const list = Array.isArray(prev) ? prev.filter((item) => item.id !== saved.id) : [];
          return [...list, saved].sort((a, b) => String(a.deviceName || '').localeCompare(String(b.deviceName || '')));
        });
        setPrinterDialogOpen(false);
        setEditingPrinter(null);
      } catch (err) {
        window.alert(err?.response?.data?.message || err?.message || 'Failed to save printer.');
      } finally {
        setPrinterSaving(false);
      }
    };

    const handlePrinterTest = async (printer) => {
      setPrinterBusyId(printer.id);
      const startedAt = Date.now();
      const testParams = {
        companyName: currentTerminal?.branchName || 'BillBull',
        branchName: currentTerminal?.branchName || '',
        terminalId: currentTerminal?.terminalId || '',
        counterName: currentTerminal?.counterName || '',
        printerName: printer.systemPrinterName || printer.deviceName,
        paperSize: printer.paperSize || '80mm',
      };
      // A label printer speaks ZPL, so it gets a ZPL test label; the backend and the agent
      // check each against its own protocol's command policy.
      const isLabelPrinter = printer.deviceType === 'LABEL_PRINTER';
      const zplBase64 = isLabelPrinter ? zplToBase64(buildZplTestLabel(testParams)) : null;
      const escPosBase64 = isLabelPrinter ? null : buildEscPosTestReceipt(testParams);
      const testText = buildThermalTestReceiptText(testParams);
      // Mirror the routing logic inside testConfiguredPrinter so the debug block can name
      // the endpoint that will actually be hit (agent vs. backend relay vs. Zebra).
      const target = printer.connectionType === 'ZEBRA_BROWSER_PRINT'
        ? 'Browser Print (Zebra ZPL)'
        : (printer.connectionType === 'NETWORK_IP'
            ? `Backend relay → POST /api/pos/printers/${printer.id}/print/escpos`
            : `Local agent → POST http://127.0.0.1:19777/print/${isLabelPrinter ? 'zpl' : 'escpos'}`);
      const payloadBase64 = zplBase64 || escPosBase64;
      const trace = {
        at: new Date().toISOString(),
        endpoint: target,
        connectionType: printer.connectionType,
        systemPrinterName: printer.systemPrinterName || null,
        payloadKind: isLabelPrinter ? 'ZPL (base64)' : 'ESC/POS (base64)',
        payloadBytes: payloadBase64 ? Math.floor((payloadBase64.length * 3) / 4) : 0,
      };
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[printer-test] ${printer.deviceName} → ${target}`);
      // eslint-disable-next-line no-console
      console.info('request', { ...trace, escPosBase64, zplBase64, testText });
      try {
        const result = await testConfiguredPrinter(printer, {
          testText,
          escPosBase64,
          zplBase64,
        });
        // fallbackUsed means the ESC/POS send was rejected (typically a v4/WSD
        // driver refusing datatype RAW) and only the text/GDI fallback printed.
        // Sales receipts fall back the same way now, but surface it here so the
        // operator knows to install the vendor / Generic-Text-Only driver
        // instead of reading a green test as "full quality works".
        const usedFallback = !!result?.fallbackUsed;
        const okTrace = {
          ...trace,
          ok: true,
          durationMs: Date.now() - startedAt,
          response: result,
          payloadKind: usedFallback ? 'Plain text (ESC/POS rejected — text fallback)' : trace.payloadKind,
          escPosError: result?.escPosError || null,
        };
        // eslint-disable-next-line no-console
        console.info('response ✓', okTrace);
        // eslint-disable-next-line no-console
        console.groupEnd();
        setPrinterTestDebug((prev) => ({ ...prev, [printer.id]: okTrace }));
        const runtimeMessage = usedFallback
          ? `Printed via TEXT fallback — printer rejected ESC/POS (${result?.escPosError || 'driver error'}). Sales receipts will also print in text mode; install the vendor or Generic/Text-Only driver for full quality.`
          : (result?.message || 'Printer test sent successfully.');
        const updated = await updatePosPrinterRuntime(printer.id, runtimeStatusFromPrintSuccess(runtimeMessage));
        setPrinterConfigs((prev) => prev.map((item) => item.id === printer.id ? updated : item));
      } catch (err) {
        const errTrace = { ...trace, ok: false, durationMs: Date.now() - startedAt, error: err?.message || String(err) };
        // eslint-disable-next-line no-console
        console.error('response ✗', errTrace);
        // eslint-disable-next-line no-console
        console.groupEnd();
        setPrinterTestDebug((prev) => ({ ...prev, [printer.id]: errTrace }));
        const updated = await updatePosPrinterRuntime(printer.id, runtimeStatusFromPrintError(err)).catch(() => null);
        if (updated) {
          setPrinterConfigs((prev) => prev.map((item) => item.id === printer.id ? updated : item));
        }
        window.alert(err?.message || 'Printer test failed.');
      } finally {
        setPrinterBusyId(null);
      }
    };

    const handlePrinterDecommission = async (printer) => {
      if (!(await confirmDialog({
        title: 'Decommission printer?',
        message: `Printer "${printer.deviceName}" will be decommissioned and removed from the printer list.`,
        confirmLabel: 'Decommission',
        tone: 'danger',
      }))) return;
      setPrinterBusyId(printer.id);
      try {
        await decommissionPosPrinter(printer.id);
        setPrinterConfigs((prev) => prev.filter((item) => item.id !== printer.id));
      } catch (err) {
        window.alert(err?.response?.data?.message || err?.message || 'Failed to decommission printer.');
      } finally {
        setPrinterBusyId(null);
      }
    };

    const handleSaveTemplates = async () => {
      setSettingsSaving(true);
      try {
        const tplConfig = JSON.stringify({
          outletName:tplOutletName,outletTrn:tplOutletTrn,outletAddress:tplOutletAddress,outletPhone:tplOutletPhone,
          logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,
          receiptHeader:tplReceiptHeader,receiptHeaderAr:tplReceiptHeaderAr,receiptFooter:tplReceiptFooter,receiptPaper:tplReceiptPaper,
          receiptShowLogo:tplReceiptShowLogo,receiptShowTrn:tplReceiptShowTrn,receiptShowStamp:tplReceiptShowStamp,receiptShowBarcode:tplReceiptShowBarcode,
          receiptShowCompanyDetails:tplReceiptShowCompanyDetails,receiptShowCustomerDetails:tplReceiptShowCustomerDetails,
          receiptColItemCode:tplReceiptColItemCode,receiptColItemImage:tplReceiptColItemImage,receiptColBatchNo:tplReceiptColBatchNo,receiptColDiscount:tplReceiptColDiscount,receiptColVatPct:tplReceiptColVatPct,receiptColVatAmt:tplReceiptColVatAmt,
          receiptShowGrandTotalBanner:tplReceiptShowGrandTotalBanner,receiptShowTerms:tplReceiptShowTerms,receiptShowNotes:tplReceiptShowNotes,receiptShowBankDetails:tplReceiptShowBankDetails,receiptShowQRCode:tplReceiptShowQRCode,receiptShowSignature:tplReceiptShowSignature,
          invoiceHeader:tplInvoiceHeader,invoiceHeaderAr:tplInvoiceHeaderAr,invoiceFooter:tplInvoiceFooter,invoicePaper:tplInvoicePaper,
          invoiceShowLogo:tplInvoiceShowLogo,invoiceShowCompanyDetails:tplInvoiceShowCompanyDetails,invoiceShowTrn:tplInvoiceShowTrn,
          invoiceShowCustomerDetails:tplInvoiceShowCustomerDetails,invoiceShowStamp:tplInvoiceShowStamp,invoiceShowSignature:tplInvoiceShowSignature,
          invoiceShowGrandTotalBanner:tplInvoiceShowGrandTotalBanner,invoiceShowTerms:tplInvoiceShowTerms,invoiceShowNotes:tplInvoiceShowNotes,
          invoiceShowBankDetails:tplInvoiceShowBankDetails,invoiceShowQRCode:tplInvoiceShowQRCode,invoiceQrPlacement:tplInvoiceQrPlacement,
          invoiceColItemCode:tplInvoiceColItemCode,invoiceColItemImage:tplInvoiceColItemImage,invoiceColBarcode:tplInvoiceColBarcode,
          invoiceColBatchNo:tplInvoiceColBatchNo,invoiceColDiscount:tplInvoiceColDiscount,invoiceColVatPct:tplInvoiceColVatPct,invoiceColVatAmt:tplInvoiceColVatAmt,
          returnHeader:tplReturnHeader,returnFooter:tplReturnFooter,returnPaper:tplReturnPaper,
          returnShowLogo:tplReturnShowLogo,returnShowTrn:tplReturnShowTrn,returnShowStamp:tplReturnShowStamp,
          returnShowCompanyDetails:tplReturnShowCompanyDetails,returnShowCustomerDetails:tplReturnShowCustomerDetails,
          returnColItemCode:tplReturnColItemCode,returnColBatchNo:tplReturnColBatchNo,returnColDiscount:tplReturnColDiscount,returnColVatPct:tplReturnColVatPct,returnColVatAmt:tplReturnColVatAmt,
          returnShowGrandTotalBanner:tplReturnShowGrandTotalBanner,returnShowTerms:tplReturnShowTerms,returnShowNotes:tplReturnShowNotes,returnShowQRCode:tplReturnShowQRCode,returnShowSignature:tplReturnShowSignature,returnShowCreditBalance:tplReturnShowCreditBalance,
          jobCardFooter:tplJobCardFooter,jobCardPaper:tplJobCardPaper,
          jobCardShowLogo:tplJobCardShowLogo,jobCardShowTrn:tplJobCardShowTrn,jobCardShowStamp:tplJobCardShowStamp,
          jobCardShowCompanyDetails:tplJobCardShowCompanyDetails,jobCardShowCustomerDetails:tplJobCardShowCustomerDetails,
          jobCardShowSerialNumber:tplJobCardShowSerialNumber,jobCardShowWarranty:tplJobCardShowWarranty,jobCardShowTechnician:tplJobCardShowTechnician,
          jobCardShowExpectedDate:tplJobCardShowExpectedDate,jobCardShowCustomerSignature:tplJobCardShowCustomerSignature,jobCardShowTerms:tplJobCardShowTerms,
          receiptTemplateId,
          t2ShowLogo,t2ShowCompanyDetails,t2ShowTrn,t2ShowArabic,t2ShowCustomerDetails,t2ShowAccountBalance,t2ShowDelivery,
          t2ShowVatSummary,t2ShowPaymentDetails,t2ShowLoyalty,t2ShowQRCode,t2ShowFooterText,t2ShowBarcode,
          t2ReceiptShowLogo,t2ReceiptShowCompanyDetails,t2ReceiptShowTrn,t2ReceiptShowArabic,t2ReceiptShowCustomerDetails,t2ReceiptShowAccountBalance,t2ReceiptShowDelivery,
          t2ReceiptShowVatSummary,t2ReceiptShowPaymentDetails,t2ReceiptShowLoyalty,t2ReceiptShowQRCode,t2ReceiptShowFooterText,t2ReceiptShowBarcode,
          t2InvoiceShowLogo,t2InvoiceShowCompanyDetails,t2InvoiceShowTrn,t2InvoiceShowArabic,t2InvoiceShowCustomerDetails,t2InvoiceShowAccountBalance,t2InvoiceShowDelivery,
          t2InvoiceShowVatSummary,t2InvoiceShowPaymentDetails,t2InvoiceShowLoyalty,t2InvoiceShowQRCode,t2InvoiceShowFooterText,t2InvoiceShowBarcode,
        });
        const saved = await savePosAppearance({ branchId: posSettings?.branchId, printTemplateConfig: tplConfig });
        setPosSettings(prev => mergeSavedPosSettings(prev, saved));
        setSettingsSavedFlash(true);
        setTimeout(()=>setSettingsSavedFlash(false), 2000);
      } catch(e){ console.warn('Template save failed',e); } finally { setSettingsSaving(false); }
    };

    const tabs = [
      { id:'layout',    label:'Manage Layouts', icon:<LayoutGrid className="h-4 w-4" /> },
      ...(canManageBehaviorSettings ? [{ id:'behavior', label:'Behavior', icon:<Shield className="h-4 w-4" /> }] : []),
      { id:'devices',   label:'Devices',        icon:<Printer className="h-4 w-4" /> },
      { id:'templates', label:'Print Templates',icon:<FileText className="h-4 w-4" /> },
      ...(terminalAdministration ? [{ id:'terminals', label:'Terminals & Counters', icon:<Hash className="h-4 w-4" /> }] : []),
    ];

    const loadTerminals = async () => {
      const branchId = currentTerminal?.branchId;
      if (!branchId) return;
      setTerminalsLoading(true);
      try {
        const data = await getAllPosTerminals(branchId);
        setTerminalList(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn('Failed to load terminals', e);
      } finally {
        setTerminalsLoading(false);
      }
    };

    const startEdit = (t) => {
      setEditingTerminalId(t.terminalId);
      setEditTerminalName(t.terminalName || '');
      setEditCounterName(t.counterName || '');
    };

    const cancelEdit = () => {
      setEditingTerminalId(null);
      setEditTerminalName('');
      setEditCounterName('');
    };

    const saveRename = async (terminalId) => {
      setTerminalSaving(true);
      try {
        const updated = await renamePosTerminal(terminalId, {
          terminalName: editTerminalName,
          counterName: editCounterName,
        });
        setTerminalList(prev => prev.map(t => t.terminalId === terminalId ? updated : t));
        // If this is the active terminal, update session display too
        if (currentTerminal?.terminalId === terminalId) {
          setCurrentTerminal(prev => ({ ...prev, terminalName: updated.terminalName, counterName: updated.counterName }));
        }
        cancelEdit();
      } catch (e) {
        console.warn('Rename failed', e);
      } finally {
        setTerminalSaving(false);
      }
    };

    const toggleTerminalStatus = async (t) => {
      const newStatus = t.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
      try {
        const updated = await setTerminalStatus(t.terminalId, newStatus);
        setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? updated : x));
      } catch (e) {
        console.warn('Status change failed', e);
      }
    };

    const terminalLabel = [
      currentTerminal?.branchName,
      currentTerminal?.terminalName || currentTerminal?.terminalId,
      currentTerminal?.counterName,
    ].filter(Boolean).join(' · ');

    return (
      <div className="min-h-screen bg-[#F7F7FA]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={()=>setCurrentView('dashboard')}
                className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#1E293B] border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <ChevronRight className="h-4 w-4 rotate-180" />Dashboard
              </button>
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-3 rounded-xl">
                  <Settings className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-[#1E293B] leading-none">BillBull Console</h1>
                  <p className="text-xs text-gray-400 mt-0.5">Layouts · Devices · Print Templates</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {terminalLabel && (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-xs font-semibold text-[#1E293B]">{terminalLabel}</span>
                </div>
              )}
              {/* Contextual save button — only when on a tab that has saves */}
              {consoleTab === 'templates' && (
                <button disabled={settingsSaving} onClick={handleSaveTemplates}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Templates'}
                </button>
              )}
              {consoleTab === 'layout' && (
                <button disabled={settingsSaving} onClick={async()=>{
                  setSettingsSaving(true);
                  try {
                    const saved = await savePosAppearance({
                      branchId: posSettings?.branchId,
                      defaultLayout: posTemplate,
                      layoutHideCategoryPanel: hideCategoriesPanel,
                      layoutHideItemsPanel: hideItemsPanel,
                      layoutQuickCheckout: quickCheckoutEnabled,
                      layoutHiddenPanelButtons: [...hiddenPanelButtons].join(','),
                    });
                    setPosSettings(prev => mergeSavedPosSettings(prev, saved));
                    setSettingsSavedFlash(true);
                    setTimeout(()=>setSettingsSavedFlash(false), 2000);
                  } catch(e){ console.warn('Layout save failed',e); } finally { setSettingsSaving(false); }
                }}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Layout'}
                </button>
              )}
              {consoleTab === 'behavior' && (
                <button type="button" onClick={handleSaveSettings} disabled={settingsSaving}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
              )}
              {settingsSavedFlash && (
                <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />Saved
                </span>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 mt-4">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>{ setConsoleTab(t.id); if(t.id==='terminals') loadTerminals(); if(t.id==='behavior') beginEditSettings(); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all ${consoleTab===t.id ? 'border-[#F5C742] text-[#1E293B] bg-[#F5C742]/5' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-8">

          {/* ══ MANAGE LAYOUTS ══ */}
          {consoleTab==='layout' && (
            <div className="space-y-6">

              {/* Layout Template */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><LayoutTemplate className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Layout Template
                </h3>
                <p className="text-xs text-gray-400 mb-4">Choose the POS screen layout for the billing terminal.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {([['classic','Classic','Standard 3-column layout'],['compact','Compact','Minimal sidebar layout'],['focus','Cart Focus','Full-screen cart mode']]).map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>setPosTemplate(val)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${posTemplate===val?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 hover:border-[#F5C742]/40'}`}>
                      <div className={`w-9 h-9 rounded-xl mb-3 flex items-center justify-center ${posTemplate===val?'bg-[#F5C742]':'bg-gray-100'}`}>
                        <Columns className={`h-4 w-4 ${posTemplate===val?'text-[#1E293B]':'text-gray-400'}`} />
                      </div>
                      <p className={`text-sm font-bold ${posTemplate===val?'text-[#1E293B]':'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      {posTemplate===val && <p className="text-[10px] font-bold text-[#b8920e] mt-2 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</p>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel Visibility */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Eye className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Panel Visibility
                </h3>
                <p className="text-xs text-gray-400 mb-4">Show or hide panels in the POS billing screen.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {label:'Categories Bar', desc:'Left category navigation',state:hideCategoriesPanel,set:setHideCategoriesPanel},
                    {label:'Items Panel',    desc:'Product grid with search',state:hideItemsPanel,    set:setHideItemsPanel},
                    // Stored as "enabled"; the list's switches show !state, so it is passed inverted.
                    {label:'Quick Checkout', desc:'Payment tabs (Cash, Card, Credit, Online, BNPL) instead of the Checkout button — Classic & Cart Focus',
                      state:!quickCheckoutEnabled, set:v=>setQuickCheckoutEnabled?.(!v)},
                  ].map(p=>(
                    <div key={p.label} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-[#1E293B]">{p.label}</p>
                        <p className="text-[10px] text-gray-400">{p.desc}</p>
                      </div>
                      <Switch checked={!p.state} onCheckedChange={v=>p.set(!v)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons — not configurable in Cart Focus, which always
                  shows the full functions panel. */}
              {posTemplate !== 'focus' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Zap className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Action Buttons
                </h3>
                <p className="text-xs text-gray-400 mb-4">Toggle which buttons appear in the POS functions panel.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allBtnList.map(btn=>(
                    <div key={btn.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-[#1E293B]">{btn.label}</span>
                      <Switch checked={!hiddenPanelButtons.has(btn.id)} onCheckedChange={()=>togglePanelButton(btn.id)} />
                    </div>
                  ))}
                </div>
              </div>
              )}

            </div>
          )}

          {/* ══ BEHAVIOR ══ */}
          {consoleTab==='behavior' && !canManageBehaviorSettings && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
              <Shield className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-[#1E293B]">Admins/Supervisors Only</p>
              <p className="text-xs text-gray-400 mt-1">You don't have permission to view or change POS behavior settings.</p>
            </div>
          )}
          {consoleTab==='behavior' && canManageBehaviorSettings && (
            <PosBehaviorSettings
              posSettings={posSettings}
              settingsDraft={settingsDraft}
              setSettingsDraft={setSettingsDraft}
              settingsSaving={settingsSaving}
              handleSaveSettings={handleSaveSettings}
              beginEditSettings={beginEditSettings}
            />
          )}

          {/* ══ DEVICES ══ */}
          {consoleTab==='devices' && (
            <div className="space-y-6">
              {(() => {
                const printerList = Array.isArray(printerConfigs) ? printerConfigs : [];
                const loading = printersLoading || devicesLoading;
                const currentBranchName = currentTerminal?.branchName || '';
                const configuredSystemNames = new Set(printerList.map(p => (p.systemPrinterName || '').toLowerCase()).filter(Boolean));
                const onlineCount = printerList.filter(p => p.status === 'ACTIVE' && p.runtimeStatus === 'ONLINE').length;
                const problemCount = printerList.filter(p => p.status === 'ACTIVE' && p.runtimeStatus !== 'ONLINE').length;

                const scopeLine = (d) => {
                  const parts = [];
                  if (d.branchName && currentBranchName && d.branchName !== currentBranchName) parts.push(d.branchName);
                  parts.push(d.terminalId ? (d.terminalName || d.terminalId) : 'All terminals (branch default)');
                  if (d.counterName) parts.push(d.counterName);
                  return parts.join(' · ');
                };
                const isThisTerminal = (d) => !!d.terminalId && d.terminalId === currentTerminal?.terminalId;

                const healthPill = (status, runtimeStatus, hasRuntime) => {
                  let tone = 'bg-gray-100 text-gray-600', dot = 'bg-gray-400', label = status || 'Unknown';
                  if (status === 'ACTIVE' && hasRuntime) {
                    if (runtimeStatus === 'ONLINE') { tone = 'bg-green-50 text-green-700'; dot = 'bg-green-500'; label = 'Online'; }
                    else { tone = 'bg-red-50 text-red-600'; dot = 'bg-red-500'; label = runtimeStatus ? runtimeStatus.charAt(0) + runtimeStatus.slice(1).toLowerCase() : 'Not tested'; }
                  } else if (status === 'ACTIVE') {
                    tone = 'bg-green-50 text-green-700'; dot = 'bg-green-500'; label = 'Active';
                  } else if (status) {
                    label = status.charAt(0) + status.slice(1).toLowerCase();
                  }
                  return (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}
                    </span>
                  );
                };

                const btn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-8 rounded-lg border transition-colors disabled:opacity-50';
                const trashBtn = 'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-transparent text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100 transition-colors disabled:opacity-50';

                const sectionHeader = ({ icon, title, count, hint, addType, addLabel }) => (
                  <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-gray-400">{icon}</span>
                      <p className="text-sm font-bold text-[#1E293B]">{title}</p>
                      <span className="text-[11px] font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 tabular-nums">{count}</span>
                      {hint && <span className="hidden sm:inline text-[11px] text-gray-400 truncate">{hint}</span>}
                    </div>
                    <button type="button" onClick={() => openAddDevice(addType)}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#b8920e] hover:text-[#8a6d0a] px-2 py-1 rounded-lg hover:bg-[#F5C742]/10">
                      <Plus className="h-3.5 w-3.5" />{addLabel}
                    </button>
                  </div>
                );

                const emptyRow = ({ text }) => (
                  <p className="px-5 py-4 text-xs text-gray-400">{text}</p>
                );

                return (
                  <>
                    {/* ── Header ── */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-[#1E293B] leading-tight">Devices</h2>
                        <p className="text-xs text-gray-500 mt-1">
                          Printers, scanners and cash drawers for this branch.
                          {printerList.length > 0 && (
                            <> <span className="text-green-600 font-semibold">{onlineCount} printer{onlineCount === 1 ? '' : 's'} online</span>
                            {problemCount > 0 && <>, <span className="text-red-600 font-semibold">{problemCount} need{problemCount === 1 ? 's' : ''} attention</span></>}.</>
                          )}
                        </p>
                      </div>
                      <button onClick={()=>openAddDevice('RECEIPT_PRINTER')}
                        className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-4 h-10 rounded-xl transition-colors">
                        <Plus className="h-4 w-4" />Add Device
                      </button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">

                      {/* ── Configured devices ── */}
                      <div className="space-y-4 min-w-0">
                        {loading && (
                          <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-center gap-2 text-sm text-gray-500">
                            <RefreshCw className="h-4 w-4 animate-spin" /> Loading devices…
                          </div>
                        )}

                        {/* Printers */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                          {sectionHeader({ icon: <Printer className="h-4 w-4" />, title: 'Printers', count: printerList.length, addType: 'RECEIPT_PRINTER', addLabel: 'Add printer' })}
                          {printerList.length === 0 && !loading ? (
                            <div className="px-5 py-8 text-center">
                              <Printer className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                              <p className="text-sm font-semibold text-gray-500">No printers yet</p>
                              <p className="text-xs text-gray-400 mt-1">Add a receipt or label printer, or pick one detected on this PC.</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {printerList.map(printer => {
                                const runtimeOnline = printer.runtimeStatus === 'ONLINE';
                                const debug = printerTestDebug[printer.id];
                                const testedAt = formatPrinterTimestamp(printer.lastTestedAt);
                                const busy = printerBusyId === printer.id;
                                return (
                                  <div key={`cfg-${printer.id}`} className="px-5 py-4">
                                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${printer.status === 'ACTIVE' && runtimeOnline ? 'bg-[#F5C742]/15 text-[#b8920e]' : 'bg-gray-100 text-gray-400'}`}>
                                          {printer.deviceType === 'LABEL_PRINTER' ? <Package className="h-5 w-5" /> : <Printer className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-bold text-[#1E293B]">{printer.deviceName}</p>
                                            {printer.defaultPrinter && <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Default</span>}
                                            {isThisTerminal(printer) && <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full">This terminal</span>}
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                                            {printerTypeLabel(printer.deviceType)} · {connectionLabel(printer.connectionType)}
                                            {printer.systemPrinterName ? <> · <span className="text-gray-600">{printer.systemPrinterName}</span></> : ''}
                                            {printer.connectionType === 'NETWORK_IP' && printer.ipAddress ? <> · <span className="font-mono">{printer.ipAddress}{printer.portNumber ? `:${printer.portNumber}` : ''}</span></> : ''}
                                          </p>
                                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Monitor className="h-3 w-3 text-gray-300" />{scopeLine(printer)}</p>
                                          {(printer.lastTestResult || testedAt) && (
                                            <p className="text-[11px] text-gray-400 mt-1 truncate" title={printer.lastTestResult || ''}>
                                              <Clock className="inline h-3 w-3 text-gray-300 -mt-0.5 mr-1" />
                                              {testedAt ? `Tested ${testedAt}` : 'Last test'}
                                              {printer.lastTestResult ? <> · <span className="text-gray-500">{printer.lastTestResult}</span></> : ''}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 pl-[54px] md:pl-0">
                                        {healthPill(printer.status, printer.runtimeStatus, true)}
                                        <button type="button" onClick={()=>handlePrinterTest(printer)} disabled={busy || printer.status !== 'ACTIVE'}
                                          className={`${btn} border-[#F5C742]/60 text-[#8a6d0a] bg-[#FFF8E7] hover:bg-[#F5C742]/20`}>
                                          <Zap className="h-3.5 w-3.5" />{busy ? 'Testing…' : 'Test'}
                                        </button>
                                        <button type="button" onClick={()=>editPrinter(printer)} className={`${btn} border-gray-200 text-gray-600 hover:bg-gray-50`}>
                                          <Settings className="h-3.5 w-3.5" />Edit
                                        </button>
                                        <button type="button" onClick={()=>handlePrinterDecommission(printer)} disabled={busy} title="Decommission printer" aria-label="Decommission printer" className={trashBtn}>
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>

                                    {debug && (
                                      <details className="mt-2 md:ml-[54px]">
                                        <summary className={`text-[11px] font-semibold cursor-pointer select-none ${debug.ok ? 'text-green-700' : 'text-red-600'}`}>
                                          {debug.ok ? '✓ Test sent' : '✗ Test failed'}{debug.escPosError ? ' (compatibility mode)' : ''} · details
                                        </summary>
                                        <div className="mt-1.5 rounded-lg bg-gray-50 border border-gray-200 p-2.5 space-y-1 font-mono text-[11px] text-gray-600 break-all">
                                          <div><span className="text-gray-400">endpoint:</span> {debug.endpoint}</div>
                                          <div><span className="text-gray-400">payload:</span> {debug.payloadKind} · {debug.payloadBytes} bytes</div>
                                          <div>
                                            <span className="text-gray-400">result:</span>{' '}
                                            <span className={debug.ok ? 'text-green-600' : 'text-red-600'}>{debug.ok ? 'SUCCESS' : 'FAILED'}</span>
                                            {' '}({debug.durationMs} ms)
                                          </div>
                                          <div>
                                            <span className="text-gray-400">{debug.ok ? 'response:' : 'error:'}</span>{' '}
                                            {debug.ok ? (debug.response?.message || JSON.stringify(debug.response) || 'ok') : debug.error}
                                          </div>
                                          {debug.escPosError && (
                                            <div className="text-amber-600">
                                              <span className="text-gray-400">escpos rejected:</span> {debug.escPosError} — printed via text/GDI fallback instead. Install the vendor or Generic/Text-Only driver for full quality.
                                            </div>
                                          )}
                                          <div className="text-gray-400">sent at {debug.at}</div>
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Scanners — registration-only (a HID keyboard-wedge scanner needs no
                            runtime config; the row exists for Device Manager visibility). */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                          {sectionHeader({ icon: <Search className="h-4 w-4" />, title: 'Barcode scanners', count: scanners.length, hint: 'Optional · USB scanners work without setup', addType: 'SCANNER', addLabel: 'Add scanner' })}
                          {scanners.length === 0 && !loading ? emptyRow({ text: "No scanners registered." }) : (
                            <div className="divide-y divide-gray-100">
                              {scanners.map((scanner) => {
                                const key = `scanner-${scanner.id}`;
                                return (
                                  <div key={`scan-${scanner.id}`} className="px-5 py-3 flex items-center gap-3.5">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-50 text-gray-500"><Search className="h-4 w-4" /></div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-bold text-[#1E293B]">{scanner.deviceName}</p>
                                        {isThisTerminal(scanner) && <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full">This terminal</span>}
                                      </div>
                                      <p className="text-xs text-gray-400 mt-0.5 truncate">{scanner.connectionType === 'BLUETOOTH' ? 'Bluetooth' : 'USB'} · {scopeLine(scanner)}</p>
                                    </div>
                                    {healthPill(scanner.status, null, false)}
                                    <button type="button" onClick={()=>decommissionScanner(scanner)} disabled={deviceBusyKey===key} title="Remove scanner" aria-label="Remove scanner" className={trashBtn}>
                                      {deviceBusyKey===key ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Cash drawers — the kick rides the attached printer's cable. */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                          {sectionHeader({ icon: <Wallet className="h-4 w-4" />, title: 'Cash drawers', count: cashDrawers.length, hint: 'Opens through a receipt printer', addType: 'CASH_DRAWER', addLabel: 'Add drawer' })}
                          {cashDrawers.length === 0 && !loading ? emptyRow({ text: printerList.length ? 'No cash drawers linked.' : 'Add a receipt printer first — the drawer opens through its cable.' }) : (
                            <div className="divide-y divide-gray-100">
                              {cashDrawers.map((drawer) => {
                                const attached = printerList.find((p) => p.id === drawer.attachedPrinterId);
                                const key = `drawer-${drawer.id}`;
                                return (
                                  <div key={`drawer-${drawer.id}`} className="px-5 py-3 flex items-center gap-3.5">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-50 text-gray-500"><Wallet className="h-4 w-4" /></div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-bold text-[#1E293B]">{drawer.deviceName}</p>
                                        {isThisTerminal(drawer) && <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full">This terminal</span>}
                                      </div>
                                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                                        Via <span className="text-gray-600 font-semibold">{attached?.deviceName || `printer #${drawer.attachedPrinterId}`}</span> · {scopeLine(drawer)}
                                        {drawer.lastKickResult ? ` · Last kick: ${drawer.lastKickResult}` : ''}
                                      </p>
                                    </div>
                                    {healthPill(drawer.status, null, false)}
                                    <button type="button" onClick={()=>decommissionDrawer(drawer)} disabled={deviceBusyKey===key} title="Remove cash drawer" aria-label="Remove cash drawer" className={trashBtn}>
                                      {deviceBusyKey===key ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── This workstation: print agent + detected printers ── */}
                      <aside className="bg-white rounded-2xl border border-gray-200 shadow-sm xl:sticky xl:top-4">
                        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-[#1E293B] flex items-center gap-2"><Monitor className="h-4 w-4 text-gray-400" />This workstation</p>
                            <button
                              type="button"
                              onClick={refreshAgentPrinters}
                              disabled={agentLoading}
                              title="Load Workstation Printers"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 px-2.5 h-8 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${agentLoading ? 'animate-spin' : ''}`} />
                              {agentLoading ? 'Checking…' : 'Rescan'}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                            The print agent sees only USB and Windows printers on this PC. LAN printers don't need it — add them as <span className="font-semibold text-gray-500">Network / IP</span> and they work from any device.
                          </p>
                          <PrintAgentPairing onPaired={refreshAgentPrinters} label={currentTerminal?.terminalId || null} />
                          {agentError && <p className="text-xs text-red-500 mt-2">{agentError}</p>}
                        </div>

                        <div className="px-5 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                            Detected printers {agentPrinters.length > 0 && <span className="text-gray-300">· {agentPrinters.length}</span>}
                          </p>
                          {agentPrinters.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">{agentLoading ? 'Looking for printers…' : 'None found. Make sure the print agent is running, then Rescan.'}</p>
                          ) : (
                            <ul className="divide-y divide-gray-100 -mx-1">
                              {agentPrinters.map((p) => {
                                const added = configuredSystemNames.has((p.name || '').toLowerCase());
                                const proto = p.agentProtocol;
                                const protoTag = proto === 'escpos' ? { t: 'Receipt · ESC/POS', c: 'bg-gray-100 text-gray-600' }
                                  : proto === 'zpl' ? { t: 'Label · ZPL', c: 'bg-gray-100 text-gray-600' }
                                  : proto === 'conflict' ? { t: 'Conflict', c: 'bg-red-50 text-red-600' }
                                  : proto === null ? { t: 'Not set up', c: 'bg-amber-50 text-amber-700' }
                                  : null;
                                const statusBad = p.status && !/^(normal|ready|idle)$/i.test(p.status);
                                return (
                                  <li key={`${p.name}-${p.portName || ''}`} className="px-1 py-2.5">
                                    <div className="flex items-start gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-[#1E293B] truncate" title={p.name}>{p.name || 'Unknown printer'}</p>
                                        <p className="text-[11px] text-gray-400 truncate" title={`${p.driverName || ''}${p.portName ? ` · ${p.portName}` : ''}`}>
                                          {p.driverName || 'Driver unknown'}{p.portName ? ` · ${p.portName}` : ''}
                                        </p>
                                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                                          {p.isDefault && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F5C742]/20 text-[#8a6d0a]">Windows default</span>}
                                          {protoTag && <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${protoTag.c}`}>{protoTag.t}</span>}
                                          {statusBad && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 text-red-600">{p.status}</span>}
                                        </div>
                                        {proto === null && <p className="text-[10px] text-amber-700 mt-1 leading-snug">Set it up in the agent's tray menu → Printers before printing.</p>}
                                        {proto === 'conflict' && <p className="text-[10px] text-red-600 mt-1 leading-snug">Conflicting setup on this PC — jobs are refused.</p>}
                                      </div>
                                      {added ? (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-1 rounded-md"><CheckCircle className="h-3 w-3" />Added</span>
                                      ) : (
                                        <button type="button"
                                          onClick={() => openAddDevice(proto === 'zpl' ? 'LABEL_PRINTER' : 'RECEIPT_PRINTER', { deviceName: p.name || '', systemPrinterName: p.name || '', connectionType: 'USB' })}
                                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#8a6d0a] border border-[#F5C742]/60 hover:bg-[#F5C742]/10 px-2 py-1 rounded-md">
                                          <Plus className="h-3 w-3" />Add
                                        </button>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </aside>
                    </div>
                  </>
                );
              })()}

              {/* ── Add New Device (minimal modal → full edit for printers) ── */}
              {addDeviceOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onMouseDown={()=>setAddDeviceOpen(false)}>
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onMouseDown={(e)=>e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-base font-bold text-[#1E293B]">Add New Device</h3>
                      <button onClick={()=>setAddDeviceOpen(false)}><X className="h-5 w-5 text-gray-400" /></button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Type</label>
                        <select value={addDeviceForm.deviceType} onChange={e=>setAddDeviceForm(f => ({ ...f, deviceType: e.target.value, attachedPrinterId: '' }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {addDeviceTypeOptions.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Name / Model</label>
                        <input value={addDeviceForm.deviceName} onChange={e=>setAddDeviceForm(f => ({ ...f, deviceName: e.target.value }))} placeholder="e.g. Epson TM-T82III" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      {addDeviceKind === 'drawer' ? (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Attached Printer</label>
                          <select value={addDeviceForm.attachedPrinterId} onChange={e=>setAddDeviceForm(f => ({ ...f, attachedPrinterId: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                            <option value="">Select receipt printer…</option>
                            {(Array.isArray(printerConfigs) ? printerConfigs : []).filter(p=>p.status==='ACTIVE').map(p=>(
                              <option key={p.id} value={p.id}>{p.deviceName}</option>
                            ))}
                          </select>
                          <p className="text-[11px] text-gray-400 mt-1">The drawer kick rides the printer's cable, so it must be linked to a printer.</p>
                        </div>
                      ) : (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Connection</label>
                          <select value={addDeviceForm.connectionType} onChange={e=>setAddDeviceForm(f => ({ ...f, connectionType: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                            {(addDeviceKind === 'scanner'
                              ? addDeviceConnectionOptions.filter(o => o.value === 'USB' || o.value === 'BLUETOOTH')
                              : addDeviceConnectionOptions
                            ).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      )}
                      {addDeviceKind === 'printer' && addDeviceForm.connectionType === 'NETWORK_IP' && addDeviceForm.deviceType !== 'LABEL_PRINTER' ? (
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">IP Address</label>
                            <input value={addDeviceForm.ipAddress} onChange={e=>setAddDeviceForm(f => ({ ...f, ipAddress: e.target.value }))} placeholder="192.168.1.50" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Port</label>
                            <input value={addDeviceForm.portNumber} onChange={e=>setAddDeviceForm(f => ({ ...f, portNumber: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="9100" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          </div>
                        </div>
                      ) : addDeviceKind === 'printer' ? (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">System Printer Name</label>
                          <input value={addDeviceForm.systemPrinterName} onChange={e=>setAddDeviceForm(f => ({ ...f, systemPrinterName: e.target.value }))} placeholder="Installed Windows printer name" list="bb-add-device-printers" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          <datalist id="bb-add-device-printers">
                            {agentPrinters.map((p) => <option key={p.name} value={p.name} />)}
                          </datalist>
                          <p className="text-[11px] text-gray-400 mt-1">Pick a detected printer above, then finish paper size in the next step. {agentPrinters.length === 0 && 'Click "Load Workstation Printers" to detect installed printers.'}</p>
                        </div>
                      ) : null}
                      {addDeviceError && <p className="text-xs text-red-500">{addDeviceError}</p>}
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-6">
                      <button type="button" onClick={()=>setAddDeviceOpen(false)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">Cancel</button>
                      <button type="button" onClick={submitAddDevice} disabled={addDeviceSaving} className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60">
                        <Plus className="h-4 w-4" />{addDeviceSaving ? 'Adding…' : 'Add Device'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {printerDialogOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="flex items-center justify-between p-6 pb-5 shrink-0">
                      <div>
                        <h3 className="text-base font-bold text-[#1E293B]">{editingPrinter ? 'Edit Printer' : 'Add Printer'}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Store printer configuration in BillBull and test it through the local print agent.</p>
                      </div>
                      <button onClick={()=>setPrinterDialogOpen(false)}><X className="h-5 w-5 text-gray-400" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-4 overflow-y-auto">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Printer Type</label>
                        <select value={printerForm.deviceType} onChange={e=>setPrinterForm(f => ({ ...f, deviceType: e.target.value, connectionType: (f.connectionType === 'ZEBRA_BROWSER_PRINT' ? 'WINDOWS_QUEUE' : f.connectionType), printTemplate: e.target.value === 'KITCHEN_PRINTER' ? 'Kitchen' : e.target.value === 'LABEL_PRINTER' ? 'Label' : 'Receipt', paperSize: e.target.value === 'LABEL_PRINTER' ? '100x150mm' : (f.paperSize === '100x150mm' ? '80mm' : f.paperSize) }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {printerTypeOptions.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Code</label>
                        <input value={printerForm.deviceCode} onChange={e=>setPrinterForm(f => ({ ...f, deviceCode: e.target.value }))} placeholder="e.g. POS-REC-01" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Name</label>
                        <input value={printerForm.deviceName} onChange={e=>setPrinterForm(f => ({ ...f, deviceName: e.target.value }))} placeholder="e.g. Epson TM-T82III Front Counter" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Model</label>
                        <input value={printerForm.modelName} onChange={e=>setPrinterForm(f => ({ ...f, modelName: e.target.value }))} placeholder="e.g. Epson TM-T82III" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Connection Type</label>
                        <select value={printerForm.connectionType} onChange={e=>setPrinterForm(f => ({ ...f, connectionType: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {selectableConnectionOptions.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
                          {/* Legacy rows keep their own value visible so opening the form
                              can't silently rewrite an existing client's configuration. */}
                          {printerForm.connectionType === 'ZEBRA_BROWSER_PRINT' && (
                            <option value="ZEBRA_BROWSER_PRINT">Zebra Browser Print (retired — change to Windows Queue)</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">System Printer Name</label>
                        <input value={printerForm.systemPrinterName} onChange={e=>setPrinterForm(f => ({ ...f, systemPrinterName: e.target.value }))} placeholder="Installed printer / Zebra device name" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" list="bb-agent-printers" />
                        <datalist id="bb-agent-printers">
                          {agentPrinters.map((printer) => <option key={printer.name} value={printer.name} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Identifier</label>
                        <input value={printerForm.deviceIdentifier} onChange={e=>setPrinterForm(f => ({ ...f, deviceIdentifier: e.target.value }))} placeholder="Optional hardware or Browser Print identifier" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      {printerForm.connectionType === 'NETWORK_IP' && (
                        <>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">IP Address</label>
                            <input value={printerForm.ipAddress} onChange={e=>setPrinterForm(f => ({ ...f, ipAddress: e.target.value }))} placeholder="192.168.1.50" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Port</label>
                            <input value={printerForm.portNumber} onChange={e=>setPrinterForm(f => ({ ...f, portNumber: e.target.value }))} placeholder="9100" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          </div>
                        </>
                      )}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Paper Size</label>
                        <select value={printerForm.paperSize} onChange={e=>setPrinterForm(f => ({ ...f, paperSize: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {paperSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Print Template</label>
                        <select value={printerForm.printTemplate} onChange={e=>setPrinterForm(f => ({ ...f, printTemplate: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {printTemplateOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
                          <input type="checkbox" checked={printerForm.assignToCurrentTerminal} onChange={e=>setPrinterForm(f => ({ ...f, assignToCurrentTerminal: e.target.checked }))} />
                          Assign to current terminal
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-[#1E293B]">
                          <input type="checkbox" checked={printerForm.defaultPrinter} onChange={e=>setPrinterForm(f => ({ ...f, defaultPrinter: e.target.checked }))} />
                          Default printer
                        </label>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Status</label>
                          <select value={printerForm.status} onChange={e=>setPrinterForm(f => ({ ...f, status: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742]">
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Notes</label>
                        <textarea value={printerForm.notes} onChange={e=>setPrinterForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes for setup or assignment" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] min-h-[88px]" />
                      </div>
                    </div>
                    <div className="flex gap-2 p-6 pt-5 shrink-0">
                      <button onClick={()=>setPrinterDialogOpen(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
                      <button onClick={savePrinter} disabled={printerSaving} className="flex-1 py-2.5 rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                        <Plus className="h-4 w-4" />{printerSaving ? 'Saving…' : editingPrinter ? 'Save Changes' : 'Add Printer'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ══ PRINT TEMPLATES ══ */}
          {consoleTab==='templates' && (() => {
            // Derive current template config based on active sub-tab
            const tplCfg = {
              receipt: {
                paper: tplReceiptPaper, setPaper: setTplReceiptPaper,
                header: tplReceiptHeader, setHeader: setTplReceiptHeader,
                headerAr: tplReceiptHeaderAr, setHeaderAr: setTplReceiptHeaderAr,
                footer: tplReceiptFooter, setFooter: setTplReceiptFooter,
                showLogo: tplReceiptShowLogo, setShowLogo: setTplReceiptShowLogo,
                showTrn: tplReceiptShowTrn, setShowTrn: setTplReceiptShowTrn,
                showStamp: tplReceiptShowStamp, setShowStamp: setTplReceiptShowStamp,
                showBarcode: tplReceiptShowBarcode, setShowBarcode: setTplReceiptShowBarcode,
                showCompanyDetails: tplReceiptShowCompanyDetails, setShowCompanyDetails: setTplReceiptShowCompanyDetails,
                showCustomerDetails: tplReceiptShowCustomerDetails, setShowCustomerDetails: setTplReceiptShowCustomerDetails,
                showServiceCharge: tplReceiptShowGrandTotalBanner, setShowServiceCharge: setTplReceiptShowGrandTotalBanner,
                showVatSummary: tplReceiptColVatAmt, setShowVatSummary: setTplReceiptColVatAmt,
                showPaymentDetails: tplReceiptColDiscount, setShowPaymentDetails: setTplReceiptColDiscount,
                showQRCode: tplReceiptShowQRCode, setShowQRCode: setTplReceiptShowQRCode,
                qrPlacement: tplInvoiceQrPlacement, setQrPlacement: setTplInvoiceQrPlacement,
                showLoyaltyPoints: tplReceiptShowNotes, setShowLoyaltyPoints: setTplReceiptShowNotes,
                showCreditBalance: tplReceiptShowBankDetails, setShowCreditBalance: setTplReceiptShowBankDetails,
                showFooterText: tplReceiptShowTerms, setShowFooterText: setTplReceiptShowTerms,
                colItemCode: tplReceiptColItemCode, setColItemCode: setTplReceiptColItemCode,
                colItemImage: tplReceiptColItemImage, setColItemImage: setTplReceiptColItemImage,
                colBarcode: tplReceiptColBatchNo, setColBarcode: setTplReceiptColBatchNo,
                colBatchNo: tplReceiptColBatchNo, setColBatchNo: setTplReceiptColBatchNo,
                colDiscount: tplReceiptColDiscount, setColDiscount: setTplReceiptColDiscount,
                colVatPct: tplReceiptColVatPct, setColVatPct: setTplReceiptColVatPct,
                colVatAmt: tplReceiptColVatAmt, setColVatAmt: setTplReceiptColVatAmt,
              },
              invoice: {
                paper: tplInvoicePaper, setPaper: setTplInvoicePaper,
                header: tplInvoiceHeader, setHeader: setTplInvoiceHeader,
                headerAr: tplInvoiceHeaderAr, setHeaderAr: setTplInvoiceHeaderAr,
                footer: tplInvoiceFooter, setFooter: setTplInvoiceFooter,
                showLogo: tplInvoiceShowLogo, setShowLogo: setTplInvoiceShowLogo,
                showTrn: tplInvoiceShowTrn, setShowTrn: setTplInvoiceShowTrn,
                showStamp: tplInvoiceShowStamp, setShowStamp: setTplInvoiceShowStamp,
                showBarcode: tplInvoiceColBarcode, setShowBarcode: setTplInvoiceColBarcode,
                showCompanyDetails: tplInvoiceShowCompanyDetails, setShowCompanyDetails: setTplInvoiceShowCompanyDetails,
                showCustomerDetails: tplInvoiceShowCustomerDetails, setShowCustomerDetails: setTplInvoiceShowCustomerDetails,
                showServiceCharge: tplInvoiceShowGrandTotalBanner, setShowServiceCharge: setTplInvoiceShowGrandTotalBanner,
                showVatSummary: tplInvoiceColVatAmt, setShowVatSummary: setTplInvoiceColVatAmt,
                showPaymentDetails: tplInvoiceColDiscount, setShowPaymentDetails: setTplInvoiceColDiscount,
                showQRCode: tplInvoiceShowQRCode, setShowQRCode: setTplInvoiceShowQRCode,
                qrPlacement: tplInvoiceQrPlacement, setQrPlacement: setTplInvoiceQrPlacement,
                showLoyaltyPoints: tplInvoiceShowNotes, setShowLoyaltyPoints: setTplInvoiceShowNotes,
                showCreditBalance: tplInvoiceShowBankDetails, setShowCreditBalance: setTplInvoiceShowBankDetails,
                showFooterText: tplInvoiceShowTerms, setShowFooterText: setTplInvoiceShowTerms,
                colItemCode: tplInvoiceColItemCode, setColItemCode: setTplInvoiceColItemCode,
                colItemImage: tplInvoiceColItemImage, setColItemImage: setTplInvoiceColItemImage,
                colBarcode: tplInvoiceColBarcode, setColBarcode: setTplInvoiceColBarcode,
                colBatchNo: tplInvoiceColBatchNo, setColBatchNo: setTplInvoiceColBatchNo,
                colDiscount: tplInvoiceColDiscount, setColDiscount: setTplInvoiceColDiscount,
                colVatPct: tplInvoiceColVatPct, setColVatPct: setTplInvoiceColVatPct,
                colVatAmt: tplInvoiceColVatAmt, setColVatAmt: setTplInvoiceColVatAmt,
              },
              return: {
                paper: tplReturnPaper, setPaper: setTplReturnPaper,
                header: tplReturnHeader, setHeader: setTplReturnHeader,
                footer: tplReturnFooter, setFooter: setTplReturnFooter,
                showLogo: tplReturnShowLogo, setShowLogo: setTplReturnShowLogo,
                showTrn: tplReturnShowTrn, setShowTrn: setTplReturnShowTrn,
                showStamp: tplReturnShowStamp, setShowStamp: setTplReturnShowStamp,
                showBarcode: tplReturnShowQRCode, setShowBarcode: setTplReturnShowQRCode,
                showCompanyDetails: tplReturnShowCompanyDetails, setShowCompanyDetails: setTplReturnShowCompanyDetails,
                showCustomerDetails: tplReturnShowCustomerDetails, setShowCustomerDetails: setTplReturnShowCustomerDetails,
                showServiceCharge: tplReturnShowGrandTotalBanner, setShowServiceCharge: setTplReturnShowGrandTotalBanner,
                showVatSummary: tplReturnColVatAmt, setShowVatSummary: setTplReturnColVatAmt,
                showPaymentDetails: tplReturnColDiscount, setShowPaymentDetails: setTplReturnColDiscount,
                showQRCode: tplReturnShowQRCode, setShowQRCode: setTplReturnShowQRCode,
                qrPlacement: tplInvoiceQrPlacement, setQrPlacement: setTplInvoiceQrPlacement,
                showLoyaltyPoints: tplReturnShowNotes, setShowLoyaltyPoints: setTplReturnShowNotes,
                showCreditBalance: tplReturnShowCreditBalance, setShowCreditBalance: setTplReturnShowCreditBalance,
                showFooterText: tplReturnShowTerms, setShowFooterText: setTplReturnShowTerms,
                colItemCode: tplReturnColItemCode, setColItemCode: setTplReturnColItemCode,
                colItemImage: false, setColItemImage: ()=>{},
                colBarcode: false, setColBarcode: ()=>{},
                colBatchNo: tplReturnColBatchNo, setColBatchNo: setTplReturnColBatchNo,
                colDiscount: tplReturnColDiscount, setColDiscount: setTplReturnColDiscount,
                colVatPct: tplReturnColVatPct, setColVatPct: setTplReturnColVatPct,
                colVatAmt: tplReturnColVatAmt, setColVatAmt: setTplReturnColVatAmt,
              },
              jobcard: {
                paper: tplJobCardPaper, setPaper: setTplJobCardPaper,
                header: 'SERVICE JOB CARD', setHeader: ()=>{},
                footer: tplJobCardFooter, setFooter: setTplJobCardFooter,
                showLogo: tplJobCardShowLogo, setShowLogo: setTplJobCardShowLogo,
                showTrn: tplJobCardShowTrn, setShowTrn: setTplJobCardShowTrn,
                showStamp: tplJobCardShowStamp, setShowStamp: setTplJobCardShowStamp,
                showBarcode: false, setShowBarcode: ()=>{},
                showCompanyDetails: tplJobCardShowCompanyDetails, setShowCompanyDetails: setTplJobCardShowCompanyDetails,
                showCustomerDetails: tplJobCardShowCustomerDetails, setShowCustomerDetails: setTplJobCardShowCustomerDetails,
                showSerialNumber: tplJobCardShowSerialNumber, setShowSerialNumber: setTplJobCardShowSerialNumber,
                showWarranty: tplJobCardShowWarranty, setShowWarranty: setTplJobCardShowWarranty,
                showTechnician: tplJobCardShowTechnician, setShowTechnician: setTplJobCardShowTechnician,
                showExpectedDate: tplJobCardShowExpectedDate, setShowExpectedDate: setTplJobCardShowExpectedDate,
                showCustomerSignature: tplJobCardShowCustomerSignature, setShowCustomerSignature: setTplJobCardShowCustomerSignature,
                showQRCode: false, setShowQRCode: ()=>{},
                showLoyaltyPoints: false, setShowLoyaltyPoints: ()=>{},
                showCreditBalance: false, setShowCreditBalance: ()=>{},
                showFooterText: tplJobCardShowTerms, setShowFooterText: setTplJobCardShowTerms,
                showServiceCharge: tplJobCardShowSerialNumber, setShowServiceCharge: setTplJobCardShowSerialNumber,
                showVatSummary: tplJobCardShowWarranty, setShowVatSummary: setTplJobCardShowWarranty,
                showPaymentDetails: tplJobCardShowTechnician, setShowPaymentDetails: setTplJobCardShowTechnician,
                colItemCode: false, setColItemCode: ()=>{},
                colItemImage: false, setColItemImage: ()=>{},
                colBarcode: false, setColBarcode: ()=>{},
                colBatchNo: false, setColBatchNo: ()=>{},
                colDiscount: false, setColDiscount: ()=>{},
                colVatPct: false, setColVatPct: ()=>{},
                colVatAmt: false, setColVatAmt: ()=>{},
              },
            };

            const templateTabs = [
              { id:'receipt', label:'POS Receipt',       hint:'Thermal receipt, no tax',  icon:<Printer className="h-4 w-4" /> },
              { id:'invoice', label:'Tax Invoice',       hint:'VAT invoice with TRN',     icon:<FileText className="h-4 w-4" /> },
              { id:'return',  label:'Return / Credit',   hint:'Credit note for returns',  icon:<RotateCcw className="h-4 w-4" /> },
              { id:'jobcard', label:'Service Job Card',  hint:'Repair intake slip',       icon:<Wrench className="h-4 w-4" /> },
            ];

            const rawCfg = tplCfg[templateSubTab] || tplCfg.receipt;
            // POS Receipt is the no-tax template — TRN/VAT summary are never
            // relevant on it (see hasTax routing at checkout), so they're forced
            // off here once rather than at every Live Preview / Test Print /
            // Full Preview call site that reads cfg.showTrn / cfg.showVatSummary.
            const cfg = templateSubTab === 'receipt'
              ? { ...rawCfg, showTrn: false, showVatSummary: false }
              : rawCfg;
            // The POS Receipt sub-tab is the no-tax document; every other sub-tab
            // (Tax Invoice / Return / Job Card) is taxed. Drives whether the Live
            // Preview / Full Preview / Test Print builders render any tax content,
            // mirroring the real checkout's hasTax routing.
            const hasTaxPreview = templateSubTab !== 'receipt';

            // Template 2 designer state is scoped per sub-tab (POS Receipt vs Tax
            // Invoice) so toggling it on one tab doesn't bleed into the other —
            // mirrors the real checkout's hasTax routing in POSSales.jsx. showTrn /
            // showVatSummary are forced off on the receipt tab — same reasoning as
            // the native `cfg` override above.
            const t2State = templateSubTab === 'receipt'
              ? {
                  showLogo: t2ReceiptShowLogo, setShowLogo: setT2ReceiptShowLogo,
                  showCompanyDetails: t2ReceiptShowCompanyDetails, setShowCompanyDetails: setT2ReceiptShowCompanyDetails,
                  showTrn: false, setShowTrn: setT2ReceiptShowTrn,
                  showArabic: t2ReceiptShowArabic, setShowArabic: setT2ReceiptShowArabic,
                  showCustomerDetails: t2ReceiptShowCustomerDetails, setShowCustomerDetails: setT2ReceiptShowCustomerDetails,
                  showAccountBalance: t2ReceiptShowAccountBalance, setShowAccountBalance: setT2ReceiptShowAccountBalance,
                  showDelivery: t2ReceiptShowDelivery, setShowDelivery: setT2ReceiptShowDelivery,
                  showVatSummary: false, setShowVatSummary: setT2ReceiptShowVatSummary,
                  showPaymentDetails: t2ReceiptShowPaymentDetails, setShowPaymentDetails: setT2ReceiptShowPaymentDetails,
                  showLoyalty: t2ReceiptShowLoyalty, setShowLoyalty: setT2ReceiptShowLoyalty,
                  showQRCode: t2ReceiptShowQRCode, setShowQRCode: setT2ReceiptShowQRCode,
                  showFooterText: t2ReceiptShowFooterText, setShowFooterText: setT2ReceiptShowFooterText,
                  showBarcode: t2ReceiptShowBarcode, setShowBarcode: setT2ReceiptShowBarcode,
                }
              : {
                  showLogo: t2InvoiceShowLogo, setShowLogo: setT2InvoiceShowLogo,
                  showCompanyDetails: t2InvoiceShowCompanyDetails, setShowCompanyDetails: setT2InvoiceShowCompanyDetails,
                  showTrn: t2InvoiceShowTrn, setShowTrn: setT2InvoiceShowTrn,
                  showArabic: t2InvoiceShowArabic, setShowArabic: setT2InvoiceShowArabic,
                  showCustomerDetails: t2InvoiceShowCustomerDetails, setShowCustomerDetails: setT2InvoiceShowCustomerDetails,
                  showAccountBalance: t2InvoiceShowAccountBalance, setShowAccountBalance: setT2InvoiceShowAccountBalance,
                  showDelivery: t2InvoiceShowDelivery, setShowDelivery: setT2InvoiceShowDelivery,
                  showVatSummary: t2InvoiceShowVatSummary, setShowVatSummary: setT2InvoiceShowVatSummary,
                  showPaymentDetails: t2InvoiceShowPaymentDetails, setShowPaymentDetails: setT2InvoiceShowPaymentDetails,
                  showLoyalty: t2InvoiceShowLoyalty, setShowLoyalty: setT2InvoiceShowLoyalty,
                  showQRCode: t2InvoiceShowQRCode, setShowQRCode: setT2InvoiceShowQRCode,
                  showFooterText: t2InvoiceShowFooterText, setShowFooterText: setT2InvoiceShowFooterText,
                  showBarcode: t2InvoiceShowBarcode, setShowBarcode: setT2InvoiceShowBarcode,
                };

            // ── Receipt template selection (Template 1 / Template 2 Arabic …) ──
            // The alternate (component) templates are 80mm thermal receipts, so the
            // selector is offered on both the POS Receipt and Tax Invoice sub-tabs
            // whenever a thermal paper size is selected (not A4). receiptTemplateId
            // is a single global setting — the same choice drives both documents at
            // checkout — so Return / Job Card stay pinned to the native template.
            // A sheet (non-thermal) paper: A4 on every tab, plus A5 Portrait / A5
            // Landscape / Pre-printed on the two sale documents — POS Receipt (no-tax
            // sale) and Tax Invoice (taxed sale). Those three print a Back Office "Sales
            // Invoice" family template, previewed here as it will print.
            const saleSheetTab = templateSubTab === 'invoice' || templateSubTab === 'receipt';
            const isSheet = isSheetPaper(cfg.paper);
            const sheetTemplate = saleSheetTab && isSheet && cfg.paper !== 'A4'
              ? pickSheetTemplate(posInvoiceTemplateFamily, cfg.paper, currentTerminal?.branchId)
              : null;
            const sheetOutlet = { name: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, logoDataUrl: tplLogoDataUrl, stampDataUrl: tplStampDataUrl };
            const templateSelectorAvailable = (templateSubTab === 'receipt' || templateSubTab === 'invoice') && !isSheet;
            const activeTemplate = getReceiptTemplate(templateSelectorAvailable ? receiptTemplateId : DEFAULT_RECEIPT_TEMPLATE_ID);
            const useComponentTemplate = templateSelectorAvailable && activeTemplate.kind === 'component';
            // Build the shared data model once for component templates (preview + print).
            const componentTemplateData = useComponentTemplate
              ? activeTemplate.mapData(
                  {
                    name: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone,
                    // Stamp is passed as stampDataUrl (not qrDataUrl) so it isn't
                    // mislabelled as a scannable QR. The designer has no live ZATCA
                    // QR to render, so the component shows its placeholder when QR
                    // is enabled with no stamp — an honest "QR appears here" hint.
                    logoDataUrl: tplLogoDataUrl, stampDataUrl: t2State.showQRCode ? tplStampDataUrl : null,
                    qrPlaceholder: t2State.showQRCode, footerText: cfg.footer,
                    titleEn: cfg.header, titleAr: cfg.headerAr,
                  },
                  buildSampleTxn(),
                  {
                    // Template 2's own independent Show/Hide toggles drive which
                    // sections the designer preview (and, at checkout, the real
                    // receipt) renders. hasTax=false (POS Receipt tab) drops all
                    // tax content (Taxable/VAT rows, per-line VAT label, Customer
                    // TRN, VAT summary) — same routing as the real checkout.
                    hasTax: hasTaxPreview,
                    showLogo: t2State.showLogo, showCompanyDetails: t2State.showCompanyDetails, showTrn: t2State.showTrn,
                    showArabic: t2State.showArabic, showCustomerDetails: t2State.showCustomerDetails,
                    showAccountBalance: t2State.showAccountBalance, showDelivery: t2State.showDelivery,
                    showVatSummary: t2State.showVatSummary, showPaymentDetails: t2State.showPaymentDetails,
                    showLoyalty: t2State.showLoyalty, showQRCode: t2State.showQRCode,
                    showFooterText: t2State.showFooterText, showBarcode: t2State.showBarcode,
                  },
                )
              : null;

            // Template 2 (Arabic/bilingual) carries its OWN independent toggle
            // set — it renders sections Template 1 doesn't (Account Balance,
            // Delivery, Loyalty, bilingual Arabic). When Template 2 is the active
            // component template, the Show/Hide list swaps to this map and binds
            // to the sub-tab-scoped t2State instead of the shared native `cfg`.
            const t2cfg = t2State;

            const fieldToggleSection = (label, items) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 pt-2.5 pb-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
                <div className="divide-y divide-gray-100">
                  {items.map(([lbl, val, setter, disabled]) => (
                    <div key={lbl} className={`flex items-center justify-between gap-3 py-2${disabled ? ' opacity-50' : ''}`}>
                      <span className="text-[13px] text-[#1E293B] leading-snug">{lbl}</span>
                      <Switch checked={!!val} onCheckedChange={setter} disabled={disabled} aria-label={lbl} />
                    </div>
                  ))}
                </div>
              </div>
            );

            const handleFullPreview = () => {
              // Component-based templates (e.g. Template 2 Arabic) render via the registry.
              if (useComponentTemplate) {
                const w = window.open('', '_blank');
                w && w.document.write(activeTemplate.buildHtml(componentTemplateData));
                return;
              }
              let html;
              if (sheetTemplate) {
                html = buildResolvedTemplateSampleHtml(sheetTemplate, { hasTax: hasTaxPreview, outlet: sheetOutlet, footerNote: cfg.footer });
              } else if (isSheet) {
                html = templateSubTab === 'jobcard'
                  ? buildServiceJobA4Html({companyName:tplOutletName,trn:effectiveOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer})
                  : buildDocumentPreviewHtml(templateSubTab==='return'?'Sales Return':'Sales Invoice',{companyName:tplOutletName,trn:effectiveOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer},{
                      hasTax:hasTaxPreview,
                      showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showTrn:cfg.showTrn,showCustomerDetails:cfg.showCustomerDetails,
                      showTerms:cfg.showFooterText,showNotes:cfg.showLoyaltyPoints,showBankDetails:cfg.showCreditBalance,
                      showQRCode:cfg.showQRCode,showStamp:cfg.showStamp,showSignature:false,showGrandTotalBanner:cfg.showServiceCharge,
                      colItemCode:cfg.colItemCode,colItemImage:cfg.colItemImage,colBarcode:cfg.colBarcode,colBatchNo:cfg.colBatchNo,
                      colDiscount:cfg.colDiscount,colVatPct:cfg.colVatPct,colVatAmt:cfg.colVatAmt,
                      logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,
                    });
              } else if (templateSubTab === 'jobcard') {
                const sampleJob = { jobNumber:'SRV-000028', createdAt: new Date().toISOString(), technicianName:'Mohammed Ali', customerName:'Fatima Hassan', customerPhone:'+971 50 123 4567', deviceName:'Samsung Galaxy A55', serialNumber:'SNSA55-20260312', warranty:'Under Warranty', problemDescription:'Display issue — screen flickering', expectedDate:'29 Jun 2026' };
                html = buildThermalJobCardHtml(cfg.paper, sampleJob, {companyName:tplOutletName,trn:effectiveOutletTrn,footer:cfg.footer,showTrn:cfg.showTrn});
              } else {
                html = buildThermalSampleHtml(cfg.paper,{companyName:tplOutletName,trn:effectiveOutletTrn,header:cfg.header,footer:cfg.footer,hasTax:hasTaxPreview,showTrn:cfg.showTrn,showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showServiceCharge:cfg.showServiceCharge,showVatSummary:cfg.showVatSummary,showPaymentDetails:cfg.showPaymentDetails,showQRCode:cfg.showQRCode,showCustomerDetails:cfg.showCustomerDetails,showLoyaltyPoints:cfg.showLoyaltyPoints,showCreditBalance:cfg.showCreditBalance,showFooterText:cfg.showFooterText,logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,isReturn:templateSubTab==='return',qrPlacement:cfg.qrPlacement});
              }
              const w = window.open('','_blank');
              w && w.document.write(html);
            };

            // Fallback HTML (browser print-preview) for the thermal receipt Test Print —
            // used only when no printer is configured for this terminal, or the silent
            // ESC/POS send fails. Kept as a plain function (not inline) so both the
            // native and component branches below can call the same fallback.
            const printReceiptViaBrowserFallback = () => {
              if (useComponentTemplate) {
                printHtml(activeTemplate.buildHtml(componentTemplateData));
                return;
              }
              printHtml(buildThermalSampleHtml(cfg.paper,{companyName:tplOutletName,trn:effectiveOutletTrn,header:cfg.header,footer:cfg.footer,hasTax:hasTaxPreview,showTrn:cfg.showTrn,showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showServiceCharge:cfg.showServiceCharge,showVatSummary:cfg.showVatSummary,showPaymentDetails:cfg.showPaymentDetails,showQRCode:cfg.showQRCode,showCustomerDetails:cfg.showCustomerDetails,showLoyaltyPoints:cfg.showLoyaltyPoints,showCreditBalance:cfg.showCreditBalance,showFooterText:cfg.showFooterText,logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,isReturn:templateSubTab==='return',qrPlacement:cfg.qrPlacement}));
            };

            const handleTestPrint = async () => {
              // A4 and the Service Job Card always use the browser print pipeline —
              // there is no thermal/ESC-POS equivalent for those, and this task only
              // changes the 58mm/80mm receipt path.
              if (sheetTemplate) {
                printHtml(buildResolvedTemplateSampleHtml(sheetTemplate, { hasTax: hasTaxPreview, outlet: sheetOutlet, footerNote: cfg.footer }));
                return;
              }
              if (isSheet) {
                const toggles = {
                  hasTax:hasTaxPreview,
                  showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showTrn:cfg.showTrn,showCustomerDetails:cfg.showCustomerDetails,
                  showTerms:cfg.showFooterText,showNotes:cfg.showLoyaltyPoints,showBankDetails:cfg.showCreditBalance,
                  showQRCode:cfg.showQRCode,showStamp:cfg.showStamp,showSignature:false,showGrandTotalBanner:cfg.showServiceCharge,
                  colItemCode:cfg.colItemCode,colItemImage:cfg.colItemImage,colBarcode:cfg.colBarcode,colBatchNo:cfg.colBatchNo,
                  colDiscount:cfg.colDiscount,colVatPct:cfg.colVatPct,colVatAmt:cfg.colVatAmt,
                  logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,
                };
                const html = templateSubTab === 'jobcard'
                  ? buildServiceJobA4Html({companyName:tplOutletName,trn:effectiveOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer})
                  : buildDocumentPreviewHtml(templateSubTab==='return'?'Sales Return':'Sales Invoice',{companyName:tplOutletName,trn:effectiveOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer},toggles);
                printHtml(html);
                return;
              }
              if (templateSubTab === 'jobcard') {
                const sampleJob = { jobNumber:'SRV-000028', createdAt: new Date().toISOString(), technicianName:'Mohammed Ali', customerName:'Fatima Hassan', customerPhone:'+971 50 123 4567', deviceName:'Samsung Galaxy A55', serialNumber:'SNSA55-20260312', warranty:'Under Warranty', problemDescription:'Display issue — screen flickering', expectedDate:'29 Jun 2026' };
                printHtml(buildThermalJobCardHtml(cfg.paper, sampleJob, {companyName:tplOutletName,trn:effectiveOutletTrn,footer:cfg.footer,showTrn:cfg.showTrn}));
                return;
              }

              // 58mm/80mm receipt (Template 1 or Template 2): print straight to the
              // configured printer through the SAME silent ESC/POS agent pipeline the
              // real sales checkout uses (see localPrintAgent.js / CustomerView.jsx's
              // printVoucherToConfiguredPrinter) — no browser print-preview dialog.
              // Only fall back to the browser preview when there's genuinely no
              // reachable printer, exactly like the checkout flow already does.
              const printer = resolvePrinterForContext(printerConfigs, {
                deviceType: 'RECEIPT_PRINTER',
                branchId: currentTerminal?.branchId || null,
                terminalId: currentTerminal?.terminalId || null,
              });
              if (!printer) {
                printReceiptViaBrowserFallback();
                return;
              }

              const isReturn = templateSubTab === 'return';
              const sampleInvoice = buildSampleInvoice({ isReturn, noTax: !hasTaxPreview });
              const outlet = { name: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, logoDataUrl: tplLogoDataUrl, qrDataUrl: tplStampDataUrl };
              const escPosOpts = {
                ...buildSampleOpts({ outlet, cfg }),
                isReturn,
                // No-tax (POS Receipt) test print drops all tax content and titles
                // as SALES INVOICE — matches the real no-tax checkout receipt.
                hasTax: hasTaxPreview,
                documentTitle: isReturn ? 'CREDIT NOTE' : (cfg.header || (hasTaxPreview ? 'TAX INVOICE' : 'SALES INVOICE')),
                documentTitleAr: isReturn ? null : (cfg.headerAr || null),
                showCreditBalance: cfg.showCreditBalance,
                creditPreviousBalance: cfg.showCreditBalance ? 245.5 : null,
                creditInvoiceCredit: cfg.showCreditBalance ? sampleInvoice.invoiceTotal : null,
                creditAmountPaid: cfg.showCreditBalance ? 0 : null,
              };
              // Template 2 (Arabic) test print honours its OWN independent toggle
              // set (t2cfg), not the shared native `cfg`, so the Test Print matches
              // the Template 2 Live Preview and the real checkout receipt.
              if (useComponentTemplate) {
                Object.assign(escPosOpts, {
                  showLogo: t2cfg.showLogo,
                  showCompanyDetails: t2cfg.showCompanyDetails,
                  showTrn: t2cfg.showTrn,
                  showArabic: t2cfg.showArabic,
                  showCustomerDetails: t2cfg.showCustomerDetails,
                  showVatSummary: t2cfg.showVatSummary,
                  showPaymentDetails: t2cfg.showPaymentDetails,
                  showLoyaltyPoints: t2cfg.showLoyalty,
                  showDelivery: t2cfg.showDelivery,
                  showFooterText: t2cfg.showFooterText,
                  showBarcode: t2cfg.showBarcode,
                  showQRCode: t2cfg.showQRCode,
                  qrContent: t2cfg.showQRCode ? 'https://billbull.ae/verify/DI-28-042' : null,
                  showCreditBalance: t2cfg.showAccountBalance,
                  creditPreviousBalance: t2cfg.showAccountBalance ? 245.5 : null,
                  creditInvoiceCredit: t2cfg.showAccountBalance ? sampleInvoice.invoiceTotal : null,
                  creditAmountPaid: t2cfg.showAccountBalance ? 0 : null,
                  deliveryAddress: t2cfg.showDelivery ? 'Villa 22, Street 7, Al Faseel, Fujairah, UAE' : null,
                });
              }

              try {
                const dataBase64 = useComponentTemplate
                  ? await activeTemplate.buildEscPosBase64(cfg.paper, sampleInvoice, escPosOpts)
                  : await buildEscPosReceiptBase64(cfg.paper, sampleInvoice, escPosOpts);
                await sendEscPosReceiptToConfiguredPrinter(printer, {
                  dataBase64,
                  receiptText: `${activeTemplate.label} test print — ${sampleInvoice.invoiceNumber}`,
                  title: `BillBull Test Print (${activeTemplate.label})`,
                });
              } catch (err) {
                console.warn('Silent test print failed, falling back to browser print preview', err);
                printReceiptViaBrowserFallback();
              }
            };

            const fieldLabel = 'block text-[11px] font-semibold text-gray-500 mb-1.5';
            const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#F5C742] focus:ring-2 focus:ring-[#F5C742]/20 transition-colors';
            const currentDocLabel = templateTabs.find(t => t.id === templateSubTab)?.label || 'this document';
            // shared=true: one value used by every document; otherwise it belongs to the selected document only.
            const sectionHead = (icon, title, shared, note) => (
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#F5C742]/20 text-[#b8920e] flex items-center justify-center">{icon}</span>
                  <h3 className="text-sm font-bold text-[#1E293B]">{title}</h3>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${shared ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {note || (shared ? 'Shared by all documents' : `${currentDocLabel} only`)}
                </span>
              </div>
            );

            const handleResetDefault = () => {
              setTplReceiptPaper('80mm'); setTplReceiptHeader(''); setTplReceiptFooter('');
              setTplReceiptShowLogo(true); setTplReceiptShowTrn(true); setTplReceiptShowCompanyDetails(true);
              setTplReceiptShowCustomerDetails(true); setTplReceiptShowGrandTotalBanner(true);
              setTplReceiptColVatAmt(true); setTplReceiptColDiscount(true); setTplReceiptShowQRCode(true);
              setTplReceiptShowNotes(true); setTplReceiptShowBankDetails(true); setTplReceiptShowTerms(true);
              setTplReceiptShowStamp(false); setTplReceiptShowBarcode(false);
            };

            return (
              <div className="space-y-5">
                {/* ── Document picker ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {templateTabs.map(t => {
                    const selected = templateSubTab === t.id;
                    const paper = tplCfg[t.id]?.paper;
                    const paperLabel = paper ? (POS_SHEET_FORMATS.includes(paper) ? sheetFormatLabel(paper) : paper) : null;
                    return (
                      <button key={t.id} type="button" onClick={() => setTemplateSubTab(t.id)}
                        className={`text-left rounded-2xl border px-4 py-3 transition-all ${selected ? 'bg-[#FFF8E7] border-[#F5C742] ring-1 ring-[#F5C742]/40 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-100 text-gray-400'}`}>{t.icon}</span>
                          {paperLabel && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selected ? 'bg-white text-[#8a6d0a]' : 'bg-gray-50 text-gray-400'}`}>{paperLabel}</span>}
                        </div>
                        <p className={`mt-2 text-sm font-bold ${selected ? 'text-[#1E293B]' : 'text-gray-600'}`}>{t.label}</p>
                        <p className="text-[11px] text-gray-400 leading-snug">{t.hint}</p>
                      </button>
                    );
                  })}
                </div>

                {/* ── Two-column: Settings (left) + Live Preview (right) ── */}
                <div className="flex flex-col lg:flex-row gap-5 items-start">

                  {/* ── Left: all settings ── */}
                  <div className="flex-1 min-w-0 space-y-4 w-full">

                    {/* Paper & design */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                      {sectionHead(<Printer className="h-3.5 w-3.5" />, 'Paper & design', false)}
                      <div className="p-5 space-y-4">
                        <div>
                          <label className={fieldLabel}>Paper size</label>
                          <PaperSizePicker value={cfg.paper} onChange={cfg.setPaper} options={saleSheetTab ? ['80mm', '58mm', ...POS_SHEET_FORMATS] : undefined} />
                        </div>
                        {templateSelectorAvailable && (
                          <div>
                            <label className={fieldLabel}>Receipt design</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {RECEIPT_TEMPLATES.map(t => (
                                <button key={t.id} type="button" onClick={() => setReceiptTemplateId(t.id)}
                                  className={`flex flex-col items-start px-3.5 py-2.5 rounded-xl border text-left transition-all ${receiptTemplateId===t.id ? 'bg-[#FFF8E7] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                  <span className="text-sm font-semibold">{t.label}</span>
                                  {t.sublabel && <span className={`text-[11px] ${receiptTemplateId===t.id ? 'text-[#8a6d0a]' : 'text-gray-400'}`}>{t.sublabel}</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Which Back Office template an A5 / Pre-printed sheet prints with. */}
                        {saleSheetTab && isSheet && cfg.paper !== 'A4' && (
                          sheetTemplate
                            ? <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">Prints with <span className="font-semibold text-[#1E293B]">{sheetTemplate.name}</span>. Edit it under Sales → Print &amp; Email Templates.</p>
                            : <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                No {sheetFormatLabel(cfg.paper)} Sales Invoice template exists yet, so the default template prints instead. Create one under Sales → Print &amp; Email Templates.
                              </p>
                        )}
                      </div>
                    </div>

                    {/* Business details & logo — shared by every document */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                      {sectionHead(<Users className="h-3.5 w-3.5" />, 'Business details & logo', true)}
                      <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_180px] gap-5">
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={fieldLabel}>Business name</label>
                              <input value={tplOutletName} onChange={e=>setTplOutletName(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                              <label className={fieldLabel}>Phone</label>
                              <input value={tplOutletPhone} onChange={e=>setTplOutletPhone(e.target.value)} className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <label className={fieldLabel}>TRN</label>
                            <input value={tplOutletTrn} onChange={e=>setTplOutletTrn(e.target.value)} placeholder={effectiveOutletTrn ? `${effectiveOutletTrn} (from branch / company profile)` : 'Not set in branch or company profile'} className={inputCls} />
                          </div>
                          <div>
                            <label className={fieldLabel}>Address</label>
                            <textarea value={tplOutletAddress} onChange={e=>setTplOutletAddress(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                          </div>
                        </div>
                        <div>
                          <label className={fieldLabel}>Logo</label>
                          <input id="tpl-logo-upload" type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setTplLogoDataUrl(ev.target.result);r.readAsDataURL(f);}e.target.value='';}} />
                          {tplLogoDataUrl ? (
                            <div className="rounded-xl border border-gray-200 bg-[#F7F7FA] p-3 flex flex-col items-center gap-2">
                              <img src={tplLogoDataUrl} alt="Logo" className="h-20 w-full object-contain" />
                              <div className="flex gap-3 text-xs font-semibold">
                                <button type="button" onClick={()=>document.getElementById('tpl-logo-upload')?.click()} className="text-gray-600 hover:text-[#1E293B]">Replace</button>
                                <button type="button" onClick={()=>setTplLogoDataUrl(null)} className="text-red-500 hover:text-red-600">Remove</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={()=>document.getElementById('tpl-logo-upload')?.click()}
                              className="w-full h-[132px] rounded-xl border-2 border-dashed border-gray-200 hover:border-[#F5C742]/60 hover:bg-[#FFF8E7]/50 flex flex-col items-center justify-center gap-1.5 text-gray-400 transition-colors">
                              <Plus className="h-5 w-5" />
                              <span className="text-xs font-semibold">Upload logo</span>
                              <span className="text-[10px]">PNG or JPG, square works best</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Header & footer text — per document */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                      {sectionHead(<FileText className="h-3.5 w-3.5" />, 'Header & footer text', false)}
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={fieldLabel}>Header text</label>
                          <textarea value={cfg.header} onChange={e=>cfg.setHeader(e.target.value)} rows={3} placeholder={templateSubTab==='jobcard' ? 'Not used on the job card' : 'e.g. Thank you for shopping with us!'} className={`${inputCls} resize-none read-only:bg-gray-50 read-only:text-gray-400`} readOnly={templateSubTab==='jobcard'} />
                          <p className="text-[11px] text-gray-400 mt-1">Printed under the business details at the top.</p>
                        </div>
                        <div>
                          <label className={fieldLabel}>Footer text</label>
                          <textarea value={cfg.footer} onChange={e=>cfg.setFooter(e.target.value)} rows={3} placeholder="e.g. Visit us again soon&#10;www.billbull.ae | @billbull" className={`${inputCls} resize-none`} />
                          <p className="text-[11px] text-gray-400 mt-1">Thank-you note, return policy, website or support number.</p>
                        </div>
                        {useComponentTemplate && cfg.setHeaderAr && (
                          <div className="md:col-span-2">
                            <label className={fieldLabel}>Arabic header <span className="normal-case font-medium text-gray-400">· {activeTemplate?.label || 'bilingual design'} only</span></label>
                            <input dir="rtl" value={cfg.headerAr} onChange={e=>cfg.setHeaderAr(e.target.value)} placeholder="فاتورة ضريبية" className={inputCls} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* QR Code / Promo Image — image shared, position per document */}
                    {templateSubTab !== 'jobcard' && (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                        {sectionHead(<LayoutTemplate className="h-3.5 w-3.5" />, 'QR code / promo image', false, 'Image is shared · position is per document')}
                        <div className="p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
                          <input id="tpl-qr-upload" type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setTplStampDataUrl(ev.target.result);r.readAsDataURL(f);}e.target.value='';}} />
                          {tplStampDataUrl ? (
                            <div className="flex items-center gap-3 flex-1 min-w-0 rounded-xl border border-gray-200 bg-[#F7F7FA] px-3 py-2.5">
                              <img src={tplStampDataUrl} alt="QR" className="h-12 w-12 object-contain rounded bg-white" />
                              <span className="text-sm text-[#1E293B] font-medium flex-1">Image uploaded</span>
                              <button type="button" onClick={()=>document.getElementById('tpl-qr-upload')?.click()} className="text-xs font-semibold text-gray-600 hover:text-[#1E293B]">Replace</button>
                              <button type="button" onClick={()=>setTplStampDataUrl(null)} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove</button>
                            </div>
                          ) : (
                            <button type="button" onClick={()=>document.getElementById('tpl-qr-upload')?.click()}
                              className="flex-1 flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#F5C742]/60 hover:bg-[#FFF8E7]/50 px-4 py-3 text-left transition-colors">
                              <span className="w-10 h-10 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center shrink-0"><Plus className="h-5 w-5" /></span>
                              <span>
                                <span className="block text-sm font-semibold text-gray-600">Upload QR or promo image</span>
                                <span className="block text-[11px] text-gray-400">Google review, WhatsApp, Instagram or website QR</span>
                              </span>
                            </button>
                          )}
                          <div className="shrink-0">
                            <p className={fieldLabel}>Position</p>
                            <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50">
                              {[['before','Before footer'],['after','After footer']].map(([val,lbl])=>(
                                <button key={val} type="button" onClick={()=>cfg.setQrPlacement?.(val)}
                                  className={`px-3 h-8 rounded-lg text-xs font-semibold transition-colors ${((cfg.qrPlacement||'before')===val) ? 'bg-white shadow-sm text-[#1E293B]' : 'text-gray-500 hover:text-gray-700'}`}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show / Hide Fields */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                      {sectionHead(<Eye className="h-3.5 w-3.5" />, 'What to print', false)}
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                        {templateSubTab === 'jobcard' ? (<>
                          {fieldToggleSection('HEADER', [
                            ['Show Logo', cfg.showLogo, cfg.setShowLogo],
                            ['Show Company Name & Address', cfg.showCompanyDetails, cfg.setShowCompanyDetails],
                            ['Show TRN', cfg.showTrn, cfg.setShowTrn],
                          ])}
                          {fieldToggleSection('CUSTOMER', [
                            ['Show Customer Details', cfg.showCustomerDetails, cfg.setShowCustomerDetails],
                          ])}
                          {fieldToggleSection('JOB DETAILS', [
                            ['Serial Number', cfg.showSerialNumber, cfg.setShowSerialNumber],
                            ['Warranty Status', cfg.showWarranty, cfg.setShowWarranty],
                            ['Assigned Technician', cfg.showTechnician, cfg.setShowTechnician],
                            ['Expected Completion Date', cfg.showExpectedDate, cfg.setShowExpectedDate],
                          ])}
                          {fieldToggleSection('FOOTER', [
                            ['Customer Signature Line', cfg.showCustomerSignature, cfg.setShowCustomerSignature],
                            ['Show Footer Custom Text', cfg.showFooterText, cfg.setShowFooterText],
                            ['Show Stamp', cfg.showStamp, cfg.setShowStamp],
                          ])}
                        </>) : useComponentTemplate ? (<>
                          {/* ── Template 2 (Arabic / bilingual) toggle set ── */}
                          {fieldToggleSection('HEADER', [
                            ['Show Logo', t2cfg.showLogo, t2cfg.setShowLogo],
                            ['Show Company Name & Address', t2cfg.showCompanyDetails, t2cfg.setShowCompanyDetails],
                            // POS Receipt is the no-tax template — t2cfg.showTrn is
                            // already forced false above; disable so it reads as
                            // locked rather than merely unchecked.
                            ['Show TRN', t2cfg.showTrn, t2cfg.setShowTrn, templateSubTab === 'receipt'],
                            ['Show Arabic (Bilingual) Text', t2cfg.showArabic, t2cfg.setShowArabic],
                          ])}
                          {fieldToggleSection('CUSTOMER DETAILS', [
                            ['Show Customer Details (Name, Mobile, Email, TRN, Address)', t2cfg.showCustomerDetails, t2cfg.setShowCustomerDetails],
                          ])}
                          {fieldToggleSection('ACCOUNT', [
                            ['Show Account Balance', t2cfg.showAccountBalance, t2cfg.setShowAccountBalance],
                          ])}
                          {fieldToggleSection('DELIVERY', [
                            ['Show Delivery Address', t2cfg.showDelivery, t2cfg.setShowDelivery],
                          ])}
                          {fieldToggleSection('TRANSACTION', [
                            ['Show VAT Summary', t2cfg.showVatSummary, t2cfg.setShowVatSummary, templateSubTab === 'receipt'],
                            ['Show Payment Details (Mode / Paid / Change)', t2cfg.showPaymentDetails, t2cfg.setShowPaymentDetails],
                          ])}
                          {fieldToggleSection('LOYALTY', [
                            ['Show Loyalty Program', t2cfg.showLoyalty, t2cfg.setShowLoyalty],
                          ])}
                          {fieldToggleSection('AFTER PAYMENT', [
                            ['Show QR / Social Image', t2cfg.showQRCode, t2cfg.setShowQRCode],
                          ])}
                          {fieldToggleSection('FOOTER', [
                            ['Show Footer Custom Text', t2cfg.showFooterText, t2cfg.setShowFooterText],
                            ['Show Barcode', t2cfg.showBarcode, t2cfg.setShowBarcode],
                          ])}
                        </>) : (<>
                          {fieldToggleSection('HEADER', [
                            ['Show Logo', cfg.showLogo, cfg.setShowLogo],
                            ['Show Company Name & Address', cfg.showCompanyDetails, cfg.setShowCompanyDetails],
                            // POS Receipt is the no-tax template — cfg.showTrn is
                            // already forced false above; disable so it reads as
                            // locked rather than merely unchecked.
                            ['Show TRN', cfg.showTrn, cfg.setShowTrn, templateSubTab === 'receipt'],
                            ...(!isSheet ? [] : [['Show Stamp / Seal', cfg.showStamp, cfg.setShowStamp]]),
                          ])}
                          {!isSheet && fieldToggleSection('TRANSACTION', [
                            ['Show Service Charge', cfg.showServiceCharge, cfg.setShowServiceCharge],
                            ['Show VAT Summary', cfg.showVatSummary, cfg.setShowVatSummary, templateSubTab === 'receipt'],
                            ['Show Payment Details (Cash / Change / Mode)', cfg.showPaymentDetails, cfg.setShowPaymentDetails],
                          ])}
                          {!isSheet && fieldToggleSection('AFTER PAYMENT', [
                            ['Show QR / Social Image', cfg.showQRCode, cfg.setShowQRCode],
                          ])}
                          {isSheet && fieldToggleSection('DOCUMENT SECTIONS', [
                            ['Show Grand Total Highlight', cfg.showServiceCharge, cfg.setShowServiceCharge],
                            ['Show QR / Stamp', cfg.showQRCode, cfg.setShowQRCode],
                            ['Show Bank Details', cfg.showCreditBalance, cfg.setShowCreditBalance],
                            ['Show Notes / Terms', cfg.showLoyaltyPoints, cfg.setShowLoyaltyPoints],
                          ])}
                          {fieldToggleSection('CUSTOMER DETAILS', [
                            ['Show Customer Details (Name, Mobile, Email, TRN, Address)', cfg.showCustomerDetails, cfg.setShowCustomerDetails],
                            ...(!isSheet ? [
                              ['Show Loyalty Points (Earned / Used / Remaining)', cfg.showLoyaltyPoints, cfg.setShowLoyaltyPoints],
                              ['Show Customer Credit Balance', cfg.showCreditBalance, cfg.setShowCreditBalance],
                            ] : []),
                          ])}
                          {fieldToggleSection('FOOTER', [
                            ['Show Footer Custom Text', cfg.showFooterText, cfg.setShowFooterText],
                          ])}
                          {isSheet && fieldToggleSection('COLUMNS (A4 / A5 only)', [
                            ['Item Code', cfg.colItemCode, cfg.setColItemCode],
                            ['Item Image', cfg.colItemImage, cfg.setColItemImage],
                            ['Barcode', cfg.colBarcode, cfg.setColBarcode],
                            ['Batch Number', cfg.colBatchNo, cfg.setColBatchNo],
                            ['Discount', cfg.colDiscount, cfg.setColDiscount],
                            ['VAT %', cfg.colVatPct, cfg.setColVatPct],
                            ['VAT Amount', cfg.colVatAmt, cfg.setColVatAmt],
                          ])}
                        </>)}
                      </div>
                    </div>

                  </div>

                  {/* ── Right: sticky live preview ── */}
                  <div className="w-full lg:w-[340px] xl:w-[400px] shrink-0 lg:sticky lg:top-4">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Preview header */}
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                          <span className="text-sm font-bold text-[#1E293B]">Preview</span>
                          <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md truncate">
                            {isSheet ? sheetFormatLabel(cfg.paper) : `${cfg.paper} thermal`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={handleFullPreview} title="Open full preview"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 h-8 hover:bg-gray-50 transition-colors">
                            <Eye className="h-3.5 w-3.5" />Full
                          </button>
                          <button onClick={handleTestPrint} title="Send a test print"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8a6d0a] border border-[#F5C742]/60 bg-[#FFF8E7] rounded-lg px-2.5 h-8 hover:bg-[#F5C742]/20 transition-colors">
                            <Printer className="h-3.5 w-3.5" />Test print
                          </button>
                        </div>
                      </div>

                      {/* Preview body */}
                      <div className="p-4 bg-[#F1F2F6] overflow-y-auto flex flex-col gap-4" style={{ maxHeight: 'calc(100vh - 160px)', minHeight: 420 }}>
                        {useComponentTemplate
                          ? (() => {
                              const Preview = activeTemplate.Preview;
                              // Render at natural paper width (80mm ≈ 302px / 58mm ≈
                              // 219px) — no down-scale — so this preview reads at the
                              // same visual width as Template 1's ThermalMock (~330px)
                              // instead of appearing noticeably narrower. The preview
                              // sizes to the chosen paper (58mm vs 80mm) via paperSize.
                              return (
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <Preview data={componentTemplateData} paperSize={cfg.paper} />
                                </div>
                              );
                            })()
                          : sheetTemplate
                          ? <ResolvedTemplateA4Preview
                              template={sheetTemplate}
                              hasTax={hasTaxPreview}
                              outlet={sheetOutlet}
                              footerNote={cfg.footer}
                              scale={0.42}
                            />
                          : isSheet
                          ? (USE_NEW_POS_PRINT_TEMPLATE && (templateSubTab==='return' ? resolvedPosCreditNoteTemplate : resolvedPosInvoiceTemplate))
                            ? <ResolvedTemplateA4Preview
                                template={templateSubTab==='return' ? resolvedPosCreditNoteTemplate : resolvedPosInvoiceTemplate}
                                isReturn={templateSubTab==='return'}
                                hasTax={hasTaxPreview}
                                outlet={{ name: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, logoDataUrl: tplLogoDataUrl, stampDataUrl: tplStampDataUrl }}
                                footerNote={cfg.footer}
                                scale={0.42}
                              />
                            : <A4LivePreview
                              category={templateSubTab==='return'?'Sales Return':'Sales Invoice'}
                              companyName={tplOutletName} trn={effectiveOutletTrn}
                              address={tplOutletAddress} phone={tplOutletPhone}
                              footerNote={cfg.footer} scale={0.42}
                              toggles={{
                                hasTax: hasTaxPreview,
                                showLogo: cfg.showLogo, showCompanyDetails: cfg.showCompanyDetails,
                                showTrn: cfg.showTrn, showCustomerDetails: cfg.showCustomerDetails,
                                showTerms: cfg.showFooterText, showNotes: cfg.showLoyaltyPoints,
                                showBankDetails: cfg.showCreditBalance, showQRCode: cfg.showQRCode,
                                showStamp: cfg.showStamp, showSignature: false,
                                showGrandTotalBanner: cfg.showServiceCharge,
                                colItemCode: cfg.colItemCode, colItemImage: cfg.colItemImage,
                                colBarcode: cfg.colBarcode, colBatchNo: cfg.colBatchNo,
                                colDiscount: cfg.colDiscount, colVatPct: cfg.colVatPct, colVatAmt: cfg.colVatAmt,
                                logoDataUrl: tplLogoDataUrl, stampDataUrl: tplStampDataUrl,
                              }}
                            />
                          : <ThermalMock
                              paperSize={cfg.paper}
                              templateType={templateSubTab}
                              outletName={tplOutletName}
                              outletAddress={tplOutletAddress}
                              outletPhone={tplOutletPhone}
                              outletTrn={effectiveOutletTrn}
                              logoDataUrl={tplLogoDataUrl}
                              stampDataUrl={tplStampDataUrl}
                              headerText={cfg.header}
                              footerText={cfg.footer}
                              showLogo={cfg.showLogo}
                              showTrn={cfg.showTrn}
                              showCompanyDetails={cfg.showCompanyDetails}
                              showServiceCharge={cfg.showServiceCharge}
                              showVatSummary={cfg.showVatSummary}
                              showPaymentDetails={cfg.showPaymentDetails}
                              showQRCode={cfg.showQRCode}
                              showCustomerDetails={cfg.showCustomerDetails}
                              showLoyaltyPoints={cfg.showLoyaltyPoints}
                              showCreditBalance={cfg.showCreditBalance}
                              showFooterText={cfg.showFooterText}
                              qrPlacement={cfg.qrPlacement}
                              showSerialNumber={cfg.showSerialNumber}
                              showWarranty={cfg.showWarranty}
                              showTechnician={cfg.showTechnician}
                              showExpectedDate={cfg.showExpectedDate}
                              showCustomerSignature={cfg.showCustomerSignature}
                            />
                        }
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── Bottom action bar ── */}
                <div className="sticky bottom-0 z-10 -mx-1 px-1">
                  <div className="flex items-center justify-between gap-3 bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-sm px-4 py-3">
                    <button type="button" onClick={handleResetDefault}
                      className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 rounded-xl px-3 h-10 hover:bg-gray-50 transition-colors">
                      <RotateCcw className="h-4 w-4" />Reset POS Receipt to default
                    </button>
                    <div className="flex items-center gap-3">
                      {settingsSavedFlash && <span className="text-xs font-semibold text-green-600 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Saved</span>}
                      <button disabled={settingsSaving} onClick={handleSaveTemplates}
                        className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-6 h-10 rounded-xl transition-colors">
                        <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Templates'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══ TERMINALS ══ */}
          {consoleTab === 'terminals' && terminalAdministration && (() => {
            const maxSlots = posSettings?.maxTerminalsPerBranch ?? 5;

            // Archived (reversible) and Decommissioned (permanent) terminals both free their slot —
            // match the backend's countActiveLimitByBranchId semantics exactly.
            const slotUsed = terminalList.filter(t => t.status !== 'ARCHIVED' && t.status !== 'DECOMMISSIONED').length;
            const slotPct = Math.min(100, Math.round((slotUsed / maxSlots) * 100));
            const slotNearFull = slotUsed >= maxSlots - 1;

            const promoteMainPos = async (terminalId) => {
              try {
                const updated = await setMainPosTerminal(terminalId);
                setTerminalList(prev => prev.map(x => ({
                  ...x,
                  isMainPos: x.terminalId === terminalId,
                })));
              } catch (e) {
                console.warn('Set main POS failed', e);
              }
            };

            const cycleStatus = async (t) => {
              // ACTIVE → INACTIVE → BLOCKED → ACTIVE
              const next = t.status === 'ACTIVE' ? 'INACTIVE' : t.status === 'INACTIVE' ? 'BLOCKED' : 'ACTIVE';
              try {
                const updated = await setTerminalStatus(t.terminalId, next);
                setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? updated : x));
              } catch (e) {
                console.warn('Status change failed', e);
              }
            };

            const formatLastSeen = (ts) => {
              if (!ts) return null;
              let s = String(ts);
              const tIdx = s.indexOf('T');
              if (tIdx !== -1 && !s.endsWith('Z')) {
                const timePart = s.slice(tIdx);
                if (!timePart.includes('+') && !timePart.includes('-')) {
                  s += 'Z';
                }
              }
              const d = parseISO(s);
              if (isNaN(d.getTime())) return null;
              
              const diffMin = (new Date() - d) / 60000;
              if (diffMin < 2) return 'Just now';
              return formatDistanceToNow(d, { addSuffix: true });
            };

            const parseDeviceInfo = (info) => {
              if (!info) return null;
              try {
                const parser = new UAParser(info);
                const result = parser.getResult();
                const os = result.os.name;
                const browser = result.browser.name;
                if (os && browser) return `${os} - ${browser}`;
                if (os) return os;
                if (browser) return browser;
                return info.length > 30 ? info.substring(0, 28) + '…' : info;
              } catch (e) {
                return info.length > 30 ? info.substring(0, 28) + '…' : info;
              }
            };

            const statusConfig = {
              NEW:      { label: 'New',      dot: 'bg-blue-500',  badge: 'bg-blue-50 text-blue-700',   icon: <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> },
              PENDING_REGISTRATION: { label: 'Pending', dot: 'bg-blue-400', badge: 'bg-blue-50 text-blue-600', icon: <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> },
              ACTIVE:   { label: 'Active',   dot: 'bg-green-500', badge: 'bg-green-50 text-green-700',  icon: <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> },
              IDLE:     { label: 'Idle',     dot: 'bg-green-400', badge: 'bg-green-50 text-green-600',  icon: <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> },
              INACTIVE: { label: 'Inactive', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700',  icon: <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> },
              OFFLINE:  { label: 'Offline',  dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600',    icon: <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> },
              BLOCKED:  { label: 'Blocked',  dot: 'bg-red-500',   badge: 'bg-red-50 text-red-600',      icon: <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> },
              STALE:    { label: 'Stale',    dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700', icon: <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> },
              ARCHIVED: { label: 'Archived', dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-500',    icon: <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> },
              DECOMMISSIONED: { label: 'Decommissioned', dot: 'bg-red-800', badge: 'bg-red-50 text-red-800', icon: <span className="w-1.5 h-1.5 rounded-full bg-red-800" /> },
              MAINTENANCE: { label: 'Maintenance', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700', icon: <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> },
            };

            const daysSince = (ts) => {
              if (!ts) return null;
              return Math.floor((new Date() - new Date(ts)) / (1000 * 60 * 60 * 24));
            };

            const handleArchiveTerminal = (terminal) => {
              setArchiveModalReason('');
              setArchiveModalError('');
              setArchiveModalTerminal(terminal);
            };

            const submitArchiveTerminal = async () => {
              if (!archiveModalTerminal) return;
              setArchiveModalBusy(true);
              setArchiveModalError('');
              try {
                const updated = await archivePosTerminal(archiveModalTerminal.id, archiveModalReason.trim() || undefined);
                setTerminalList(prev => prev.map(x => x.terminalId === archiveModalTerminal.terminalId ? { ...x, ...updated } : x));
                setArchiveModalTerminal(null);
              } catch (e) {
                setArchiveModalError(e?.response?.data?.message || 'Archive failed.');
              } finally {
                setArchiveModalBusy(false);
              }
            };

            const handleRestoreTerminal = async (terminal) => {
              try {
                const updated = await restorePosTerminal(terminal.id);
                setTerminalList(prev => prev.map(x => x.terminalId === terminal.terminalId ? { ...x, ...updated } : x));
              } catch (e) {
                window.alert(e?.response?.data?.message || 'Restore failed.');
              }
            };

            // Permanent retirement — no restore path exists for this status, by design.
            const handleDecommissionTerminal = (terminal) => {
              setDecommissionModalReason('');
              setDecommissionModalError('');
              setDecommissionModalTerminal(terminal);
            };

            const submitDecommissionTerminal = async () => {
              if (!decommissionModalTerminal) return;
              setDecommissionModalBusy(true);
              setDecommissionModalError('');
              try {
                const updated = await decommissionPosTerminal(decommissionModalTerminal.id, decommissionModalReason.trim() || undefined);
                setTerminalList(prev => prev.map(x => x.terminalId === decommissionModalTerminal.terminalId ? { ...x, ...updated } : x));
                setDecommissionModalTerminal(null);
              } catch (e) {
                setDecommissionModalError(e?.response?.data?.message || 'Decommission failed.');
              } finally {
                setDecommissionModalBusy(false);
              }
            };

            const handleKeepActive = async (terminal) => {
              try {
                const updated = await keepTerminalActive(terminal.id);
                setTerminalList(prev => prev.map(x => x.terminalId === terminal.terminalId ? { ...x, ...updated } : x));
              } catch (e) {
                window.alert(e?.response?.data?.message || 'Keep Active failed.');
              }
            };

            const handleArchiveNow = (terminal) => {
              setArchiveNowModalTerminal(terminal);
            };

            const submitArchiveNow = async () => {
              if (!archiveNowModalTerminal) return;
              setArchiveNowModalBusy(true);
              try {
                const updated = await archiveTerminalNow(archiveNowModalTerminal.id);
                setTerminalList(prev => prev.map(x => x.terminalId === archiveNowModalTerminal.terminalId ? { ...x, ...updated } : x));
                setArchiveNowModalTerminal(null);
              } catch (e) {
                window.alert(e?.response?.data?.message || 'Archive Now failed.');
              } finally {
                setArchiveNowModalBusy(false);
              }
            };

            const handleToggleExempt = async (terminal) => {
              try {
                const updated = await setTerminalAutoArchiveExempt(terminal.id, !terminal.autoArchiveExempt);
                setTerminalList(prev => prev.map(x => x.terminalId === terminal.terminalId ? { ...x, ...updated } : x));
              } catch (e) {
                window.alert(e?.response?.data?.message || 'Failed to update exemption.');
              }
            };

            const parseArchiveContext = (json) => {
              if (!json) return null;
              try { return JSON.parse(json); } catch (e) { return null; }
            };

            const autoArchiveEnabled = !!posSettings?.terminalAutoArchiveEnabled;
            const autoArchiveAfterDays = posSettings?.terminalArchiveAfterDays ?? 30;
            const autoArchiveNotifyBefore = posSettings?.terminalArchiveNotifyBefore ?? true;
            const autoArchiveWarningDays = posSettings?.terminalArchiveWarningDays ?? 5;
            const autoArchiveConfigInvalid = autoArchiveAfterDays <= 0
              || autoArchiveWarningDays < 0
              || (autoArchiveEnabled && autoArchiveNotifyBefore && autoArchiveWarningDays >= autoArchiveAfterDays);

            const updateAutoArchiveSetting = (patch) => {
              setPosSettings(prev => ({ ...(prev || {}), ...patch }));
            };

            const handleSaveAutoArchiveSettings = async () => {
              if (autoArchiveConfigInvalid) return;
              try {
                const saved = await savePosSettings({ ...(posSettings || {}) });
                setPosSettings(prev => mergeSavedPosSettings(prev, saved));
              } catch (e) {
                window.alert(e?.response?.data?.message || 'Failed to save Terminal Auto Archive settings.');
              }
            };

            const mainTerminal = terminalList.find(t => t.isMainPos) || null;
            const slotFull = slotUsed >= maxSlots;
            const slotTone = slotFull ? 'red' : slotNearFull ? 'amber' : 'ok';

            // Filter chips double as the health summary: one chip per lifecycle group.
            const terminalFilterGroups = [
              { key: 'ALL',            label: 'All',            statuses: null,                                             dot: null },
              { key: 'ACTIVE',         label: 'Active',         statuses: ['ACTIVE', 'IDLE', 'NEW', 'PENDING_REGISTRATION'], dot: 'bg-green-500' },
              { key: 'OFFLINE',        label: 'Offline',        statuses: ['OFFLINE'],                                      dot: 'bg-gray-400' },
              { key: 'STALE',          label: 'Stale',          statuses: ['STALE'],                                        dot: 'bg-orange-500' },
              { key: 'INACTIVE',       label: 'Inactive',       statuses: ['INACTIVE', 'MAINTENANCE'],                      dot: 'bg-amber-400' },
              { key: 'BLOCKED',        label: 'Blocked',        statuses: ['BLOCKED'],                                      dot: 'bg-red-500' },
              { key: 'ARCHIVED',       label: 'Archived',       statuses: ['ARCHIVED'],                                     dot: 'bg-gray-300' },
              { key: 'DECOMMISSIONED', label: 'Decommissioned', statuses: ['DECOMMISSIONED'],                               dot: 'bg-red-800' },
            ].map(g => ({ ...g, count: g.statuses ? terminalList.filter(t => g.statuses.includes(t.status)).length : terminalList.length }));
            const activeFilterGroup = terminalFilterGroups.find(g => g.key === terminalFilter) || terminalFilterGroups[0];
            const searchNeedle = terminalSearch.trim().toLowerCase();
            const visibleTerminals = terminalList.filter(t => {
              if (activeFilterGroup.statuses && !activeFilterGroup.statuses.includes(t.status)) return false;
              if (!searchNeedle) return true;
              return [t.terminalName, t.terminalId, t.counterName, t.registeredBy]
                .some(v => v && String(v).toLowerCase().includes(searchNeedle));
            });

            const updateTerminalRow = (terminalId, updated) =>
              setTerminalList(prev => prev.map(x => x.terminalId === terminalId ? updated : x));

            const iconBtn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-8 rounded-lg border transition-colors';

            return (
            <>
            <div className="space-y-5">

              {/* ── Header ── */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#1E293B] leading-tight">Terminals & Counters</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Every browser or device that opens POS registers itself here. Rename it, assign a counter, pick the Main POS, or retire it.
                  </p>
                </div>
                <button
                  onClick={loadTerminals}
                  disabled={terminalsLoading}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-[#1E293B] bg-white border border-gray-200 rounded-xl px-4 h-10 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${terminalsLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {/* ── Overview: slots · this device · main POS ── */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                {/* Slots */}
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                      Terminal slots
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 cursor-help" tabIndex={0} />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Clearing browser data may remove this terminal's saved identity. When POS is opened again, the browser may register as a new terminal and consume another slot.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    {slotTone !== 'ok' && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${slotTone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                        {slotFull ? 'At capacity' : 'Almost full'}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className={`text-3xl font-black ${slotTone === 'red' ? 'text-red-600' : 'text-[#1E293B]'}`}>{slotUsed}</span>
                    <span className="text-sm font-semibold text-gray-400">/ {maxSlots} used</span>
                  </p>
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${slotTone === 'red' ? 'bg-red-500' : slotTone === 'amber' ? 'bg-amber-400' : 'bg-[#F5C742]'}`}
                      style={{ width: `${slotPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                    {slotFull
                      ? 'New devices can’t register. Archive an unused terminal to free a slot.'
                      : 'Blocked terminals still use a slot; archived ones don’t.'}
                  </p>
                </div>

                {/* This device */}
                <div className="p-5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">This device</span>
                  {currentTerminal ? (
                    <div className="mt-2 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#F5C742]/15 text-[#b8920e] flex items-center justify-center shrink-0">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#1E293B] truncate">{currentTerminal.terminalName || currentTerminal.terminalId}</p>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Hash className="h-3 w-3 text-gray-300" />{currentTerminal.counterName || 'No counter'}
                        </p>
                        <p className="text-[10px] font-mono text-gray-400 mt-1">{currentTerminal.terminalId}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-400">This browser isn't registered as a terminal yet.</p>
                  )}
                </div>

                {/* Main POS */}
                <div className="p-5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Main POS</span>
                  {mainTerminal ? (
                    <div className="mt-2 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#F5C742] text-[#7a4f00] flex items-center justify-center shrink-0">
                        <Star className="h-5 w-5 fill-current" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#1E293B] truncate">{mainTerminal.terminalName || mainTerminal.terminalId}</p>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Hash className="h-3 w-3 text-gray-300" />{mainTerminal.counterName || 'No counter'}
                        </p>
                        <p className="text-[10px] font-mono text-gray-400 mt-1">{mainTerminal.terminalId}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-400">Not set. Use <span className="font-semibold text-gray-500">Set Main</span> on an active terminal.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">

              {/* ── Terminal list column ── */}
              <div className="space-y-3 min-w-0">

                {/* Toolbar: status filters + search */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {terminalFilterGroups.map(g => {
                      const selected = terminalFilter === g.key;
                      const empty = g.count === 0 && !selected;
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => setTerminalFilter(g.key)}
                          disabled={empty}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                            selected
                              ? 'bg-[#1E293B] text-white border-[#1E293B]'
                              : empty
                                ? 'bg-white text-gray-300 border-gray-100 cursor-default'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {g.dot && <span className={`w-1.5 h-1.5 rounded-full ${empty ? 'bg-gray-200' : g.dot}`} />}
                          {g.label}
                          <span className={`tabular-nums ${selected ? 'text-white/70' : empty ? 'text-gray-300' : 'text-gray-400'}`}>{g.count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="h-3.5 w-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={terminalSearch}
                      onChange={e => setTerminalSearch(e.target.value)}
                      placeholder="Search name, ID, counter…"
                      className="w-full h-8 pl-8 pr-3 text-xs border border-gray-200 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40"
                    />
                  </div>
                </div>

              {terminalsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 animate-pulse">
                      <div className="w-11 h-11 rounded-xl bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-48 bg-gray-100 rounded" />
                        <div className="h-2.5 w-32 bg-gray-100 rounded" />
                      </div>
                      <div className="w-20 h-6 bg-gray-100 rounded-full shrink-0" />
                    </div>
                  ))}
                </div>
              ) : terminalList.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-14 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                    <Hash className="h-8 w-8 text-gray-200" />
                  </div>
                  <p className="text-gray-500 font-bold">No terminals loaded</p>
                  <p className="text-xs text-gray-400 mt-1">Click Refresh to load terminals registered for this branch.</p>
                  <button
                    onClick={loadTerminals}
                    className="mt-4 text-sm font-semibold text-[#327F74] border border-[#327F74]/30 px-5 py-2 rounded-xl hover:bg-[#327F74]/5 transition-colors"
                  >
                    Load Terminals
                  </button>
                </div>
              ) : visibleTerminals.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                  <p className="text-sm font-semibold text-gray-500">No terminals match this filter</p>
                  <button
                    onClick={() => { setTerminalFilter('ALL'); setTerminalSearch(''); }}
                    className="mt-3 text-xs font-semibold text-[#327F74] hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm divide-y divide-gray-100">
                  {visibleTerminals.map(t => {
                    const isEditing = editingTerminalId === t.terminalId;
                    const isThisDevice = currentTerminal?.terminalId === t.terminalId;
                    const sc = statusConfig[t.status] || statusConfig.ACTIVE;
                    const browserLabel = parseDeviceInfo(t.deviceInfo);
                    const lastSeenLabel = formatLastSeen(t.lastSeenAt);
                    const isRecentlyActive = t.lastSeenAt && (new Date() - new Date(t.lastSeenAt)) < 5 * 60 * 1000;
                    const isRetired = t.status === 'ARCHIVED' || t.status === 'DECOMMISSIONED';
                    const canRetire = !isRetired && !t.currentOpenSessionId && !isThisDevice;

                    // Secondary / destructive actions live in the "More" menu.
                    const menuItems = [];
                    if (t.status === 'ACTIVE' && canAction('pos.terminals', 'edit')) {
                      // Plain Deactivate isn't one of the named lifecycle actions, so it stays gated
                      // on the base pos.terminals edit permission.
                      menuItems.push({ key: 'deactivate', label: 'Deactivate', icon: <Lock className="h-3.5 w-3.5" />, tone: 'amber', onClick: () => cycleStatus(t) });
                    }
                    if (t.status === 'INACTIVE' && canTerminalAction('block')) {
                      menuItems.push({ key: 'block', label: 'Block', icon: <AlertTriangle className="h-3.5 w-3.5" />, tone: 'red',
                        onClick: () => setTerminalStatus(t.terminalId, 'BLOCKED').then(u => updateTerminalRow(t.terminalId, u)) });
                    }
                    if (t.status === 'ARCHIVED' && t.archiveContextJson) {
                      menuItems.push({ key: 'history', label: viewHistoryTerminalId === t.terminalId ? 'Hide archive history' : 'View archive history', icon: <Info className="h-3.5 w-3.5" />,
                        onClick: () => setViewHistoryTerminalId(prev => prev === t.terminalId ? null : t.terminalId) });
                    }
                    if (t.status !== 'ARCHIVED' && t.status !== 'DECOMMISSIONED' && canTerminalAction('setautoarchiveexempt')) {
                      menuItems.push({ key: 'exempt', label: 'Exempt from auto archive', checked: !!t.autoArchiveExempt, onClick: () => handleToggleExempt(t) });
                    }
                    if (canRetire && canTerminalAction('archive')) {
                      menuItems.push({ key: 'archive', label: 'Archive…', icon: <AlertTriangle className="h-3.5 w-3.5" />, tone: 'orange', divider: true, onClick: () => handleArchiveTerminal(t) });
                    }
                    if ((canRetire || t.status === 'ARCHIVED') && canTerminalAction('decommission')) {
                      menuItems.push({ key: 'decommission', label: 'Decommission…', icon: <XCircle className="h-3.5 w-3.5" />, tone: 'red', divider: !menuItems.some(m => m.divider), onClick: () => handleDecommissionTerminal(t) });
                    }
                    const menuOpen = terminalMenuId === t.terminalId;
                    const toneClass = { amber: 'text-amber-700', red: 'text-red-600', orange: 'text-orange-600' };

                    return (
                      <div
                        key={t.terminalId}
                        className={`relative first:rounded-t-2xl last:rounded-b-2xl ${isThisDevice ? 'bg-[#FFF8E7]/60' : ''}`}
                      >
                        {isThisDevice && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-[#F5C742]" />}

                        {/* ── View mode ── */}
                        {!isEditing && (
                          <div className="px-5 py-4">
                            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">

                              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                {/* Terminal icon */}
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                  isRetired               ? 'bg-gray-100 text-gray-300' :
                                  t.status === 'BLOCKED'  ? 'bg-red-50 text-red-400' :
                                  t.status === 'INACTIVE' ? 'bg-gray-100 text-gray-400' :
                                  t.isMainPos             ? 'bg-[#F5C742] text-[#7a4f00]' :
                                                            'bg-[#F5C742]/15 text-[#b8920e]'
                                }`}>
                                  {t.isMainPos ? <Star className="h-5 w-5 fill-current" /> : <Monitor className="h-5 w-5" />}
                                </div>

                                <div className={`flex-1 min-w-0 ${isRetired ? 'opacity-60' : ''}`}>
                                  {/* Name row */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-black text-[#1E293B]">{t.terminalName || t.terminalId}</span>
                                    <span className="text-[10px] font-mono text-gray-400">{t.terminalId}</span>
                                    {isThisDevice && (
                                      <span className="text-[10px] font-black bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full uppercase tracking-wider">This device</span>
                                    )}
                                    {t.isMainPos && (
                                      <span className="text-[10px] font-bold bg-[#327F74]/10 text-[#327F74] px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Star className="h-2.5 w-2.5 fill-current" /> Main POS
                                      </span>
                                    )}
                                    {isRecentlyActive && t.status === 'ACTIVE' && !isThisDevice && (
                                      <span className="text-[10px] font-bold bg-green-50 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" /> Online
                                      </span>
                                    )}
                                    {t.currentOpenSessionId && (
                                      <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200/50">● Shift open</span>
                                    )}
                                    {t.autoArchiveExempt && !isRetired && (
                                      <span className="text-[10px] font-semibold bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">Never auto-archived</span>
                                    )}
                                  </div>

                                  {/* Meta row */}
                                  <div className="flex items-center gap-x-4 gap-y-1 mt-1.5 flex-wrap">
                                    <span className="flex items-center gap-1 text-xs text-gray-500">
                                      <Hash className="h-3 w-3 text-gray-300" />
                                      {counterList.length > 0 && canTerminalAction('assigncounter') && !isRetired ? (
                                        <select
                                          value={t.counterId ?? ''}
                                          onChange={async (e) => {
                                            const counterId = e.target.value ? Number(e.target.value) : null;
                                            try {
                                              const updated = await assignTerminalCounter(t.id, counterId);
                                              setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? { ...x, counterId: updated.counterId, counterName: updated.counterName } : x));
                                              if (currentTerminal?.terminalId === t.terminalId) {
                                                setCurrentTerminal(prev => ({ ...prev, counterId: updated.counterId, counterName: updated.counterName }));
                                              }
                                            } catch (e) { console.warn('Counter assign failed', e); }
                                          }}
                                          className="text-xs font-semibold border border-transparent hover:border-gray-200 rounded-md px-1.5 py-0.5 text-gray-700 bg-transparent hover:bg-white focus:outline-none focus:border-[#F5C742] cursor-pointer"
                                          title="Assign counter"
                                        >
                                          <option value="">— No Counter —</option>
                                          {counterList.map(c => (
                                            <option key={c.id} value={c.id}>{c.counterName} ({c.counterCode})</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <strong className="text-gray-700">{t.counterName || 'No counter'}</strong>
                                      )}
                                    </span>
                                    {lastSeenLabel && (
                                      <span className="flex items-center gap-1 text-xs text-gray-400">
                                        <Clock className="h-3 w-3 text-gray-300" />{lastSeenLabel}
                                      </span>
                                    )}
                                    {browserLabel && (
                                      <span className="flex items-center gap-1 text-xs text-gray-400">
                                        <Cpu className="h-3 w-3 text-gray-300" />{browserLabel}
                                      </span>
                                    )}
                                    {t.registeredBy && (
                                      <span className="flex items-center gap-1 text-xs text-gray-400">
                                        <Users className="h-3 w-3 text-gray-300" />{t.registeredBy}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right side: status + actions */}
                              <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:justify-end shrink-0 pl-[58px] md:pl-0">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap ${sc.badge}`}>
                                  {sc.icon}{sc.label}
                                </span>

                                {t.status === 'DECOMMISSIONED' ? (
                                  <span className="text-[11px] text-gray-400 italic">Permanently retired</span>
                                ) : (
                                  <>
                                    {t.status === 'INACTIVE' && canAction('pos.terminals', 'edit') && (
                                      <button
                                        onClick={() => setTerminalStatus(t.terminalId, 'ACTIVE').then(u => updateTerminalRow(t.terminalId, u))}
                                        className={`${iconBtn} text-green-700 border-green-200 hover:bg-green-50`}
                                      >
                                        <Unlock className="h-3.5 w-3.5" /> Activate
                                      </button>
                                    )}
                                    {t.status === 'BLOCKED' && canTerminalAction('unblock') && (
                                      <button
                                        onClick={() => setTerminalStatus(t.terminalId, 'ACTIVE').then(u => updateTerminalRow(t.terminalId, u))}
                                        className={`${iconBtn} text-green-700 border-green-200 hover:bg-green-50`}
                                      >
                                        <Unlock className="h-3.5 w-3.5" /> Unblock
                                      </button>
                                    )}
                                    {t.status === 'ARCHIVED' && canTerminalAction('restore') && (
                                      <button
                                        onClick={() => handleRestoreTerminal(t)}
                                        className={`${iconBtn} text-gray-700 border-gray-200 hover:bg-gray-50`}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                                      </button>
                                    )}
                                    {!t.isMainPos && t.status === 'ACTIVE' && canTerminalAction('setmain') && (
                                      <button
                                        onClick={() => promoteMainPos(t.terminalId)}
                                        className={`${iconBtn} text-[#b8920e] border-[#F5C742]/50 hover:bg-[#F5C742]/10`}
                                      >
                                        <Star className="h-3.5 w-3.5" /> Set Main
                                      </button>
                                    )}
                                    {canTerminalAction('rename') && !isRetired && (
                                      <button
                                        onClick={() => startEdit(t)}
                                        className={`${iconBtn} text-[#327F74] border-[#327F74]/30 hover:bg-[#327F74]/5`}
                                      >
                                        <Wrench className="h-3.5 w-3.5" /> Rename
                                      </button>
                                    )}
                                  </>
                                )}

                                {menuItems.length > 0 && (
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => setTerminalMenuId(menuOpen ? null : t.terminalId)}
                                      aria-label="More actions"
                                      aria-expanded={menuOpen}
                                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${menuOpen ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {menuOpen && (
                                      <>
                                        <div className="fixed inset-0 z-40" onClick={() => setTerminalMenuId(null)} />
                                        <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                                          {menuItems.map(item => (
                                            <React.Fragment key={item.key}>
                                              {item.divider && <div className="my-1 border-t border-gray-100" />}
                                              <button
                                                type="button"
                                                onClick={() => { setTerminalMenuId(null); item.onClick(); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-left hover:bg-gray-50 ${toneClass[item.tone] || 'text-gray-700'}`}
                                              >
                                                {'checked' in item ? (
                                                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${item.checked ? 'bg-[#F5C742] border-[#F5C742]' : 'border-gray-300'}`}>
                                                    {item.checked && <CheckCircle className="h-2.5 w-2.5 text-[#1E293B]" />}
                                                  </span>
                                                ) : item.icon}
                                                {item.label}
                                              </button>
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* STALE warning banner */}
                            {t.status === 'STALE' && !t.autoArchiveExempt && (() => {
                              const inactiveDays = daysSince(t.lastActivityAt) ?? daysSince(t.staleAt) ?? 0;
                              const archiveAfterDays = posSettings?.terminalArchiveAfterDays ?? 30;
                              const daysRemaining = Math.max(archiveAfterDays - inactiveDays, 0);
                              return (
                                <div className="mt-3 ml-0 md:ml-[58px] flex flex-wrap items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                                  <span className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Inactive for {inactiveDays} day{inactiveDays === 1 ? '' : 's'} · Archive in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {canTerminalAction('keepactive') && (
                                      <button
                                        onClick={() => handleKeepActive(t)}
                                        className="text-xs font-semibold text-green-700 bg-white border border-green-200 hover:bg-green-50 px-3 py-1 rounded-lg transition-colors"
                                      >
                                        Keep Active
                                      </button>
                                    )}
                                    {canTerminalAction('archive') && (
                                      <button
                                        onClick={() => handleArchiveNow(t)}
                                        className="text-xs font-semibold text-orange-700 bg-white border border-orange-300 hover:bg-orange-100 px-3 py-1 rounded-lg transition-colors"
                                      >
                                        Archive Now
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Archive history detail */}
                            {t.status === 'ARCHIVED' && viewHistoryTerminalId === t.terminalId && (() => {
                              const ctx = parseArchiveContext(t.archiveContextJson);
                              if (!ctx) return null;
                              const rows = [
                                ['Trigger', ctx.trigger],
                                ['Days inactive at archive', ctx.daysInactive],
                                ['Last heartbeat', ctx.lastHeartbeatAt && (formatLastSeen(ctx.lastHeartbeatAt) || ctx.lastHeartbeatAt)],
                                ['Last session', ctx.lastSessionAt && (formatLastSeen(ctx.lastSessionAt) || ctx.lastSessionAt)],
                                ['Last transaction', ctx.lastTransactionAt && (formatLastSeen(ctx.lastTransactionAt) || ctx.lastTransactionAt)],
                                ['Archived at', ctx.archivedAt && (formatLastSeen(ctx.archivedAt) || ctx.archivedAt)],
                              ].filter(([, v]) => v !== undefined && v !== null && v !== '');
                              return (
                                <dl className="mt-3 md:ml-[58px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                  {rows.map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-3">
                                      <dt className="text-gray-400">{k}</dt>
                                      <dd className="font-semibold text-gray-700 text-right">{String(v)}</dd>
                                    </div>
                                  ))}
                                </dl>
                              );
                            })()}
                          </div>
                        )}

                        {/* ── Edit mode ── */}
                        {isEditing && (
                          <div className="px-5 py-4 space-y-4 bg-[#FFF8E7]/40">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-[#F5C742]/20 flex items-center justify-center">
                                <Wrench className="h-4 w-4 text-[#b8920e]" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[#1E293B] leading-none">Edit Terminal</p>
                                <p className="text-[10px] font-mono text-gray-400 mt-0.5">{t.terminalId}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Terminal Name</label>
                                <input
                                  type="text"
                                  autoFocus
                                  value={editTerminalName}
                                  onChange={e => setEditTerminalName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveRename(t.terminalId); if (e.key === 'Escape') cancelEdit(); }}
                                  placeholder="e.g. Cashier Station 1"
                                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Counter Name</label>
                                <input
                                  type="text"
                                  value={editCounterName}
                                  onChange={e => setEditCounterName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveRename(t.terminalId); if (e.key === 'Escape') cancelEdit(); }}
                                  placeholder="e.g. Counter 1"
                                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => saveRename(t.terminalId)}
                                disabled={terminalSaving}
                                className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="h-4 w-4" />
                                {terminalSaving ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-5 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>

              {/* ── Side panel: auto archive + how it works ── */}
              <aside className="space-y-4 xl:sticky xl:top-4">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#1E293B]">Auto archive</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug">Archive terminals that sit unused, freeing their slot.</p>
                    </div>
                    <Switch
                      checked={autoArchiveEnabled}
                      onCheckedChange={v => updateAutoArchiveSetting({ terminalAutoArchiveEnabled: v })}
                      aria-label="Enable auto archive"
                    />
                  </div>

                  <div className={`space-y-3 ${autoArchiveEnabled ? '' : 'opacity-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="terminal-archive-after" className="text-xs font-semibold text-gray-600">Archive after</label>
                      <div className="relative w-28">
                        <input
                          id="terminal-archive-after"
                          type="number"
                          min={1}
                          value={autoArchiveAfterDays}
                          onChange={e => updateAutoArchiveSetting({ terminalArchiveAfterDays: Number(e.target.value) })}
                          className="w-full h-9 pl-3 pr-11 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">days</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                        <Switch
                          checked={autoArchiveNotifyBefore}
                          onCheckedChange={v => updateAutoArchiveSetting({ terminalArchiveNotifyBefore: v })}
                          aria-label="Warn before archiving"
                        />
                        Warn before
                      </label>
                      <div className="relative w-28">
                        <input
                          type="number"
                          min={0}
                          disabled={!autoArchiveNotifyBefore}
                          value={autoArchiveWarningDays}
                          onChange={e => updateAutoArchiveSetting({ terminalArchiveWarningDays: Number(e.target.value) })}
                          aria-label="Warning period (days)"
                          className="w-full h-9 pl-3 pr-11 text-sm text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white disabled:bg-gray-50 disabled:text-gray-300"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">days</span>
                      </div>
                    </div>
                  </div>

                  {autoArchiveConfigInvalid ? (
                    <p className="text-xs text-red-500 font-semibold leading-snug">
                      Archive-after must be more than zero, and the warning period shorter than it.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 leading-snug bg-gray-50 rounded-lg px-3 py-2">
                      {autoArchiveEnabled
                        ? <>Terminals idle for <strong>{autoArchiveAfterDays} day{autoArchiveAfterDays === 1 ? '' : 's'}</strong> are archived{autoArchiveNotifyBefore && autoArchiveWarningDays > 0 ? <>, with a warning <strong>{autoArchiveWarningDays} day{autoArchiveWarningDays === 1 ? '' : 's'}</strong> before</> : ''}. Exempt terminals are skipped.</>
                        : 'Off. Terminals stay until you archive them by hand.'}
                    </p>
                  )}

                  <button
                    onClick={handleSaveAutoArchiveSettings}
                    disabled={autoArchiveConfigInvalid}
                    className="w-full h-9 text-xs font-bold text-[#1E293B] bg-[#F5C742] hover:bg-[#e6b93a] disabled:bg-gray-100 disabled:text-gray-300 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                  <p className="text-sm font-bold text-[#1E293B] flex items-center gap-1.5"><Info className="h-4 w-4 text-gray-400" /> How terminals work</p>
                  <ul className="mt-3 space-y-2 text-xs text-gray-500 leading-snug">
                    <li className="flex gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />Each browser or device that opens POS is registered automatically from a device fingerprint.</li>
                    <li className="flex gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />Clearing browser data can make the same PC register again and take another slot.</li>
                    <li className="flex gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />Blocked terminals keep their slot. Archived terminals free it and can be restored.</li>
                    <li className="flex gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />Decommissioning is permanent and cannot be undone.</li>
                  </ul>
                </div>
              </aside>
              </div>

              {/* ── Counter Management (embedded) ── */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-[#b8920e]" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#1E293B] leading-none">Counter Management</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Create and manage POS counters for this branch</p>
                  </div>
                </div>
                <POSCounters onCounterChange={() => {
                  const branchId = currentTerminal?.branchId;
                  if (branchId) getActiveCounters(branchId).then(data => setCounterList(Array.isArray(data) ? data : [])).catch(() => {});
                }} />
              </div>

            </div>

            {/* ── Archive terminal (with reason) modal ── */}
            {archiveModalTerminal && (
              <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
                  <div className="p-5 border-b border-gray-100 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#1E293B]">Archive Terminal</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-semibold">{archiveModalTerminal.terminalName || archiveModalTerminal.terminalId}</span>
                        {' '}({archiveModalTerminal.terminalId}) will stop counting toward this branch's terminal slot limit.
                        It can be restored later — nothing is deleted.
                      </p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Archive reason <span className="normal-case font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      autoFocus
                      rows={3}
                      value={archiveModalReason}
                      onChange={(e) => { setArchiveModalReason(e.target.value); setArchiveModalError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitArchiveTerminal(); }}
                      placeholder="e.g. Till replaced, device retired…"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                    />
                    {archiveModalError && (
                      <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {archiveModalError}
                      </p>
                    )}
                  </div>
                  <div className="p-5 pt-0 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setArchiveModalTerminal(null)}
                      disabled={archiveModalBusy}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitArchiveTerminal}
                      disabled={archiveModalBusy}
                      className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {archiveModalBusy ? 'Archiving…' : 'Archive Terminal'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Archive Now (STALE warning) confirmation modal ── */}
            {archiveNowModalTerminal && (
              <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">
                  <div className="p-5 border-b border-gray-100 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#1E293B]">Archive Terminal Now?</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-semibold">
                          {archiveNowModalTerminal.terminalName || archiveNowModalTerminal.terminalId}
                        </span>{' '}
                        is stale and will free its slot immediately instead of waiting out the grace period.
                      </p>
                    </div>
                  </div>
                  <div className="p-5 pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setArchiveNowModalTerminal(null)}
                      disabled={archiveNowModalBusy}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitArchiveNow}
                      disabled={archiveNowModalBusy}
                      className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                    >
                      {archiveNowModalBusy ? 'Archiving…' : 'Archive Now'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Decommission terminal (permanent, with reason) modal ── */}
            {decommissionModalTerminal && (
              <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
                  <div className="p-5 border-b border-gray-100 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                      <XCircle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#1E293B]">Decommission Terminal</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-semibold">
                          {decommissionModalTerminal.terminalName || decommissionModalTerminal.terminalId}
                        </span>
                        {' '}({decommissionModalTerminal.terminalId}) will be permanently retired.{' '}
                        <span className="font-semibold text-red-600">This cannot be undone.</span>{' '}
                        The device will need to register as a brand-new terminal, consuming a new
                        terminal slot, to use this branch again.
                      </p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Decommission reason <span className="normal-case font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      autoFocus
                      rows={3}
                      value={decommissionModalReason}
                      onChange={(e) => { setDecommissionModalReason(e.target.value); setDecommissionModalError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitDecommissionTerminal(); }}
                      placeholder="e.g. Hardware retired, branch closed…"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    />
                    {decommissionModalError && (
                      <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {decommissionModalError}
                      </p>
                    )}
                  </div>
                  <div className="p-5 pt-0 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDecommissionModalTerminal(null)}
                      disabled={decommissionModalBusy}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitDecommissionTerminal}
                      disabled={decommissionModalBusy}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <XCircle className="h-4 w-4" />
                      {decommissionModalBusy ? 'Decommissioning…' : 'Decommission Terminal'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            </>
            );
          })()}

        </div>
      </div>
    );
});
POSConsole.displayName = 'POSConsole';
export default POSConsole;
