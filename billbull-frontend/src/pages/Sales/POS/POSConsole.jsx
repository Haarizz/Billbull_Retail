import React, { useEffect, useState, useMemo } from 'react';
import { LayoutGrid, Shield, Printer, FileText, Hash, ChevronRight, Settings, CheckCircle, LayoutTemplate, Columns, Eye, Zap, XCircle, ShoppingCart, Wallet, Plus, Search, CreditCard, Package, Trash2, X, Users, RotateCcw, Wrench, RefreshCw, Info, Unlock, Lock, Star, Monitor, Clock, AlertTriangle, ChevronDown, ChevronUp, Cpu, Layers } from 'lucide-react';
import { UAParser } from 'ua-parser-js';
import { usePermissions } from '../../../context/PermissionContext';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../../../components/ui/tooltip';
import POSCounters from '../POSCounters';
import { Switch } from '../../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Input } from '../../../components/ui/input';
import { A4LivePreview, A4PreviewFrame, ThermalMock, PaperSizePicker } from './POSPrintPreview';
import { buildDocumentPreviewHtml, buildThermalPrintHtml, buildThermalSampleHtml, buildServiceJobA4Html, buildThermalJobCardHtml, buildThermalTestReceiptText, buildPosPrintData, applyTaxAwareDisplayOptions, USE_NEW_POS_PRINT_TEMPLATE } from './posPrintUtils';
import { printHtml } from '../../../utils/printGenerator';
import { generateDocumentPrintHtml } from '../../../utils/documentTemplateRenderer';
import { RECEIPT_TEMPLATES, getReceiptTemplate, DEFAULT_RECEIPT_TEMPLATE_ID } from './receiptTemplates';
import { buildSampleTxn } from './receiptTemplates/billBullTaxInvoiceData';
import { buildSampleInvoice, buildSampleOpts } from './receiptTemplates/sampleInvoice';
import { buildEscPosReceiptBase64 } from '../../../utils/escPosReceipt';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from '../../../utils/localPrintAgent';
import { createPosPrinter, updatePosPrinter, updatePosPrinterRuntime, decommissionPosPrinter } from '../../../api/posPrinterApi';
import { getPosScanners, createPosScanner, decommissionPosScanner } from '../../../api/posScannerApi';
import { getPosCashDrawers, createPosCashDrawer, decommissionPosCashDrawer } from '../../../api/posCashDrawerApi';
import { assignTerminalCounter, archivePosTerminal, restorePosTerminal, decommissionPosTerminal, keepTerminalActive, archiveTerminalNow, setTerminalAutoArchiveExempt } from '../../../api/posApi';
import { getActiveCounters } from '../../../api/counterApi';
import { listPrintAgentPrinters, runtimeStatusFromPrintError, runtimeStatusFromPrintSuccess, testConfiguredPrinter } from '../../../utils/localPrintAgent';
import { buildEscPosTestReceipt } from '../../../utils/escPosReceipt';

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
const ResolvedTemplateA4Preview = ({ template, isReturn, hasTax = true, outlet, footerNote, scale }) => {
  const html = useMemo(() => {
    const sampleInvoice = buildSampleInvoice({ isReturn, noTax: !hasTax });
    const data = buildPosPrintData(sampleInvoice, footerNote);
    const taxAwareTemplate = applyTaxAwareDisplayOptions(template, hasTax);
    const options = {
      companyProfile: {
        companyName: outlet.name, trn: outlet.trn, address: outlet.address, phone: outlet.phone,
        currency: 'AED', logoUrl: outlet.logoDataUrl || undefined, stampUrl: outlet.stampDataUrl || undefined,
        showStampInPrint: !!outlet.stampDataUrl,
      },
    };
    return generateDocumentPrintHtml(taxAwareTemplate, data, options);
  }, [template, isReturn, hasTax, outlet.name, outlet.trn, outlet.address, outlet.phone, outlet.logoDataUrl, outlet.stampDataUrl, footerNote]);
  return <A4PreviewFrame html={html} scale={scale} />;
};

const POSConsole = React.memo((props) => {
  const { 
    currentTerminal, setCurrentTerminal, setTerminalsLoading, setTerminalList, setEditingTerminalId, setEditTerminalName, setEditCounterName, setTerminalSaving, editTerminalName, editCounterName, terminalList, 
    setCurrentView, consoleTab, setConsoleTab, settingsSaving, setSettingsSaving, posSettings, setPosSettings, settingsSavedFlash, setSettingsSavedFlash, 
    tplOutletName, setTplOutletName, tplOutletTrn, setTplOutletTrn, tplOutletAddress, setTplOutletAddress, tplOutletPhone, setTplOutletPhone, 
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
    settingsDraft, setSettingsDraft, handleSaveSettings, beginEditSettings, 
    printerConfigs, setPrinterConfigs, printersLoading, loadPrinterConfigs,
    scannerConfig, setScannerConfig, saveScannerConfig, scannerConfigSavedFlash,
    getAllPosTerminals, renamePosTerminal, setTerminalStatus, setMainPosTerminal, savePosSettings, templateSubTab, setTemplateSubTab,
    // Phase 3 cutover: real resolved "Sales Invoice"/"Sales Return" PrintTemplate
    // rows (read-only here — see POSSales.jsx for the fetch). Used so this designer's
    // live preview shows the SAME template that actually prints at checkout, instead
    // of a separate approximation built from this screen's own toggles.
    resolvedPosInvoiceTemplate, resolvedPosCreditNoteTemplate,
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
    const { canAction } = usePermissions();
    const canTerminalAction = (action) => canAction(`permissions.pos.terminal.${action}`, 'view');

    // Phase 3 cutover (reworked): POS now resolves the real Back Office "Sales
    const allBtnList = [
      { id:'add-qty',label:'Add Qty' },{ id:'remove',label:'Remove Item' },{ id:'discount',label:'Discount' },
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
    const connectionOptions = [
      { value: 'WINDOWS_QUEUE', label: 'Windows Queue' },
      { value: 'USB', label: 'USB' },
      { value: 'NETWORK_IP', label: 'Network / IP' },
      { value: 'BLUETOOTH', label: 'Bluetooth' },
      { value: 'ZEBRA_BROWSER_PRINT', label: 'Zebra Browser Print' },
    ];
    const paperSizeOptions = ['58mm', '80mm', '100x150mm'];
    const printTemplateOptions = ['Receipt', 'Kitchen', 'Label'];

    const createInitialPrinterForm = (type = 'RECEIPT_PRINTER') => ({
      deviceType: type,
      deviceCode: '',
      deviceName: '',
      modelName: '',
      connectionType: type === 'LABEL_PRINTER' ? 'ZEBRA_BROWSER_PRINT' : 'WINDOWS_QUEUE',
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

    const openAddDevice = (deviceType = 'RECEIPT_PRINTER') => {
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
          const resolvedConn = addDeviceForm.deviceType === 'LABEL_PRINTER' ? 'ZEBRA_BROWSER_PRINT' : printerConn;
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
      if (!window.confirm(`Remove scanner "${scanner.deviceName}"?`)) return;
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
      if (!window.confirm(`Remove cash drawer "${drawer.deviceName}"?`)) return;
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
      const escPosBase64 = buildEscPosTestReceipt(testParams);
      const testText = buildThermalTestReceiptText(testParams);
      // Mirror the routing logic inside testConfiguredPrinter so the debug block can name
      // the endpoint that will actually be hit (agent vs. backend relay vs. Zebra).
      const target = printer.connectionType === 'ZEBRA_BROWSER_PRINT'
        ? 'Browser Print (Zebra ZPL)'
        : (printer.connectionType === 'NETWORK_IP'
            ? `Backend relay → POST /api/pos/printers/${printer.id}/print/escpos`
            : 'Local agent → POST http://127.0.0.1:19777/print/escpos');
      const trace = {
        at: new Date().toISOString(),
        endpoint: target,
        connectionType: printer.connectionType,
        systemPrinterName: printer.systemPrinterName || null,
        payloadKind: 'ESC/POS (base64)',
        payloadBytes: escPosBase64 ? Math.floor((escPosBase64.length * 3) / 4) : 0,
      };
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[printer-test] ${printer.deviceName} → ${target}`);
      // eslint-disable-next-line no-console
      console.info('request', { ...trace, escPosBase64, testText });
      try {
        const result = await testConfiguredPrinter(printer, {
          testText,
          escPosBase64,
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
      if (!window.confirm(`Decommission printer "${printer.deviceName}"?`)) return;
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

    const tabs = [
      { id:'layout',    label:'Manage Layouts', icon:<LayoutGrid className="h-4 w-4" /> },
      { id:'behavior',  label:'Behavior',       icon:<Shield className="h-4 w-4" /> },
      { id:'devices',   label:'Devices',        icon:<Printer className="h-4 w-4" /> },
      { id:'templates', label:'Print Templates',icon:<FileText className="h-4 w-4" /> },
      { id:'terminals', label:'Terminals & Counters', icon:<Hash className="h-4 w-4" /> },
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
                <button disabled={settingsSaving} onClick={async()=>{
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
                    const saved = await savePosSettings({ ...(posSettings||{}), printTemplateConfig: tplConfig });
                    setPosSettings(saved);
                    setSettingsSavedFlash(true);
                    setTimeout(()=>setSettingsSavedFlash(false), 2000);
                  } catch(e){ console.warn('Template save failed',e); } finally { setSettingsSaving(false); }
                }}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Templates'}
                </button>
              )}
              {consoleTab === 'layout' && (
                <button disabled={settingsSaving} onClick={async()=>{
                  setSettingsSaving(true);
                  try {
                    const saved = await savePosSettings({
                      ...(posSettings||{}),
                      defaultLayout: posTemplate,
                      layoutHideCategoryPanel: hideCategoriesPanel,
                      layoutHideItemsPanel: hideItemsPanel,
                      layoutHiddenPanelButtons: [...hiddenPanelButtons].join(','),
                    });
                    setPosSettings(saved);
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
          {consoleTab==='behavior' && (() => {
            const d = settingsDraft || {
              requireSupervisorForVoid: !!posSettings?.requireSupervisorForVoid,
              supervisorApprovalMode: posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN',
              supervisorPin: posSettings?.supervisorPin || '',
              voidMode: posSettings?.voidMode === 'DELETE' ? 'DELETE' : 'VOID',
              cartViewMode: posSettings?.cartViewMode === 'DETAILED' ? 'DETAILED' : 'MINIMAL',
              cartShowBarcode: posSettings?.cartShowBarcode !== false,
              cartShowProductCode: posSettings?.cartShowProductCode !== false,
              cartShowBatchNumber: posSettings?.cartShowBatchNumber !== false,
              cartShowSerialNumber: !!posSettings?.cartShowSerialNumber,
              cartShowExpiryDate: !!posSettings?.cartShowExpiryDate,
              cashDrawerTriggers: posSettings?.cashDrawerTriggers ?? 'CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN',
            };
            const patch = (changes) => setSettingsDraft({ ...d, ...changes });
            const credLabel = d.supervisorApprovalMode === 'PASSWORD' ? 'Supervisor Password' : 'Supervisor PIN';

            // Cash drawer trigger config — MANUAL_OPEN is always on (explicit action).
            const drawerTriggerKeys = String(d.cashDrawerTriggers || '').split(',').map(t => t.trim()).filter(Boolean);
            const hasTrigger = (key) => drawerTriggerKeys.includes(key);
            const toggleTrigger = (key) => {
              const next = hasTrigger(key)
                ? drawerTriggerKeys.filter(t => t !== key)
                : [...drawerTriggerKeys, key];
              patch({ cashDrawerTriggers: next.join(',') });
            };
            const cartFieldToggles = [
              ['cartShowBarcode', 'Barcode'],
              ['cartShowProductCode', 'Product Code'],
              ['cartShowBatchNumber', 'Batch Number'],
              ['cartShowSerialNumber', 'Serial Number'],
              ['cartShowExpiryDate', 'Expiry Date'],
            ];
            const drawerTriggers = [
              ['CASH_PAYMENT', 'Successful Cash Payment Completion'],
              ['RECEIPT_PRINT', 'Receipt Printing'],
              ['CHANGE_RETURN', 'Change Return Transaction'],
              ['CASH_SETTLEMENT', 'Cash Settlement Selection'],
              ['CASH_DROP', 'Cash Drop'],
              ['CASH_OUT', 'Cash Out'],
              ['MANUAL_OPEN', 'Manual Supervisor Open'],
            ];
            return (
            <div className="space-y-6">

              {/* Item Removal / Supervisor approval */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Shield className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Item Removal
                </h3>
                <p className="text-xs text-gray-400 mb-4">Control how cashiers remove items from a bill.</p>

                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl mb-3">
                  <div>
                    <p className="text-sm font-medium text-[#1E293B]">Require Supervisor Authorization for Item Removal</p>
                    <p className="text-[10px] text-gray-400">Cashier cannot remove items without supervisor approval.</p>
                  </div>
                  <Switch checked={d.requireSupervisorForVoid} onCheckedChange={v=>patch({ requireSupervisorForVoid: v })} />
                </div>

                {d.requireSupervisorForVoid && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Approval Method</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[['PIN','PIN'],['PASSWORD','Password']].map(([val,lbl])=>(
                          <button key={val} type="button" onClick={()=>patch({ supervisorApprovalMode: val })}
                            className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${d.supervisorApprovalMode===val?'border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B]':'border-gray-200 text-gray-500 hover:border-[#F5C742]/40'}`}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">{credLabel}</label>
                      <input
                        type="password"
                        value={d.supervisorPin}
                        onChange={e=>patch({ supervisorPin: e.target.value })}
                        maxLength={d.supervisorApprovalMode==='PIN' ? 8 : 64}
                        placeholder={d.supervisorApprovalMode==='PIN' ? 'e.g. 1234' : 'Manager password'}
                        className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Void behavior */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><XCircle className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Removal Behavior
                </h3>
                <p className="text-xs text-gray-400 mb-4">Decide what happens to a line when the cashier removes it.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ['VOID','Void (recommended)','Mark in red + strike-through, keep on receipt, audit log & reports.'],
                    ['DELETE','Delete','Remove the line entirely. Not recorded.'],
                  ].map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>patch({ voidMode: val })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${d.voidMode===val?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 hover:border-[#F5C742]/40'}`}>
                      <p className={`text-sm font-bold ${d.voidMode===val?'text-[#1E293B]':'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      {d.voidMode===val && <p className="text-[10px] font-bold text-[#b8920e] mt-2 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</p>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart display */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><ShoppingCart className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Cart Display
                </h3>
                <p className="text-xs text-gray-400 mb-4">Choose how much detail each cart line shows the cashier.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {[
                    ['MINIMAL','Minimal','Item name, qty & price only. Fastest, cleanest cart.'],
                    ['DETAILED','Detailed','Show extra item identifiers per line (configured below).'],
                  ].map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>patch({ cartViewMode: val })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${d.cartViewMode===val?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 hover:border-[#F5C742]/40'}`}>
                      <p className={`text-sm font-bold ${d.cartViewMode===val?'text-[#1E293B]':'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      {d.cartViewMode===val && <p className="text-[10px] font-bold text-[#b8920e] mt-2 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</p>}
                    </button>
                  ))}
                </div>
                <div className={`transition-opacity ${d.cartViewMode==='DETAILED' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Fields to display per line</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cartFieldToggles.map(([key,label])=>(
                      <div key={key} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-[#1E293B]">{label}</span>
                        <Switch checked={!!d[key]} onCheckedChange={v=>patch({ [key]: v })} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cash drawer control */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Wallet className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Cash Drawer Control
                </h3>
                <p className="text-xs text-gray-400 mb-4">The drawer opens only for the events you enable here.</p>
                <div className="grid grid-cols-1 gap-2">
                  {drawerTriggers.map(([key,label])=>{
                    const locked = key === 'MANUAL_OPEN'; // always available — explicit action
                    return (
                      <div key={key} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-[#1E293B]">{label}{locked && <span className="ml-2 text-[10px] text-gray-400">(always on)</span>}</span>
                        <Switch checked={locked || hasTrigger(key)} disabled={locked} onCheckedChange={()=>toggleTrigger(key)} />
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
            );
          })()}

          {/* ══ DEVICES ══ */}
          {consoleTab==='devices' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Connected Devices</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Manage printers, scanners and cash drawers for this branch and terminal.</p>
                </div>
                <button onClick={()=>openAddDevice('RECEIPT_PRINTER')}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                  <Plus className="h-4 w-4" />Add Device
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-[#1E293B]">Local Print Agent</p>
                  <p className="text-xs text-gray-400 mt-0.5">Detects USB / Windows-queue printers installed on this specific PC — it only ever sees printers plugged into this workstation, not other devices. For a printer with a network/LAN port, add it below as "Network / IP" instead — that works from any device (phone, tablet, other PCs) with no agent needed.</p>
                  {agentError && <p className="text-xs text-red-500 mt-2">{agentError} — start it by running "npm start" in tools/pos-print-agent on this PC.</p>}
                </div>
                <button
                  type="button"
                  onClick={refreshAgentPrinters}
                  disabled={agentLoading}
                  className="shrink-0 flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${agentLoading ? 'animate-spin' : ''}`} />
                  {agentLoading ? 'Checking…' : 'Load Workstation Printers'}
                </button>
              </div>

              {agentPrinters.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Detected On This Workstation</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {agentPrinters.map((printer) => (
                      <div key={`${printer.name}-${printer.portName || ''}`} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#1E293B]">{printer.name || 'Unknown printer'}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            {printer.isDefault && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F5C742]/20 text-[#b8920e]">Default</span>}
                            {printer.status && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{printer.status}</span>}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">{printer.driverName || 'Driver unknown'}{printer.portName ? ` · ${printer.portName}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {(Array.isArray(printerConfigs) ? printerConfigs : []).map(printer=>{
                  const printerIcon = {
                    RECEIPT_PRINTER:<Printer className="h-5 w-5" />,
                    KITCHEN_PRINTER:<Printer className="h-5 w-5" />,
                    LABEL_PRINTER:<Package className="h-5 w-5" />,
                  };
                  const runtimeOnline = printer.runtimeStatus === 'ONLINE';
                  return (
                    <div key={`cfg-${printer.id}`} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${runtimeOnline ? 'bg-[#F5C742]/15 text-[#b8920e]' : 'bg-gray-100 text-gray-400'}`}>
                        {printerIcon[printer.deviceType]||<Printer className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-[#1E293B]">{printer.deviceName}</p>
                          {printer.defaultPrinter && <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Default</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {printerTypeLabel(printer.deviceType)} · {connectionLabel(printer.connectionType)}
                          {printer.systemPrinterName ? ` · ${printer.systemPrinterName}` : ''}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Branch: {printer.branchName || currentTerminal?.branchName || 'Current branch'}
                          {printer.terminalId ? ` · Terminal: ${printer.terminalName || printer.terminalId}` : ' · Branch default'}
                          {printer.counterName ? ` · Counter: ${printer.counterName}` : ''}
                        </p>
                        {printer.lastTestResult && <p className="text-xs text-gray-500 mt-1 truncate">{printer.lastTestResult}</p>}
                        {formatPrinterTimestamp(printer.lastTestedAt) && (
                          <p className="text-xs text-gray-400 mt-1">Last tested: {formatPrinterTimestamp(printer.lastTestedAt)}</p>
                        )}
                        {printerTestDebug[printer.id] && (
                          <details className="mt-2">
                            <summary className="text-[11px] font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700">
                              {printerTestDebug[printer.id].ok ? '✓' : '✗'} Test send details
                            </summary>
                            <div className="mt-1.5 rounded-lg bg-gray-50 border border-gray-200 p-2.5 space-y-1 font-mono text-[11px] text-gray-600 break-all">
                              <div><span className="text-gray-400">endpoint:</span> {printerTestDebug[printer.id].endpoint}</div>
                              <div><span className="text-gray-400">payload:</span> {printerTestDebug[printer.id].payloadKind} · {printerTestDebug[printer.id].payloadBytes} bytes</div>
                              <div>
                                <span className="text-gray-400">result:</span>{' '}
                                <span className={printerTestDebug[printer.id].ok ? 'text-green-600' : 'text-red-600'}>
                                  {printerTestDebug[printer.id].ok ? 'SUCCESS' : 'FAILED'}
                                </span>
                                {' '}({printerTestDebug[printer.id].durationMs} ms)
                              </div>
                              <div>
                                <span className="text-gray-400">{printerTestDebug[printer.id].ok ? 'response:' : 'error:'}</span>{' '}
                                {printerTestDebug[printer.id].ok
                                  ? (printerTestDebug[printer.id].response?.message || JSON.stringify(printerTestDebug[printer.id].response) || 'ok')
                                  : printerTestDebug[printer.id].error}
                              </div>
                              {printerTestDebug[printer.id].escPosError && (
                                <div className="text-amber-600">
                                  <span className="text-gray-400">escpos rejected:</span> {printerTestDebug[printer.id].escPosError} — printed via text/GDI fallback instead. Install the vendor or Generic/Text-Only driver for full quality.
                                </div>
                              )}
                              <div className="text-gray-400">sent at {printerTestDebug[printer.id].at}</div>
                            </div>
                          </details>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${printer.status==='ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${printer.status==='ACTIVE' ? 'bg-blue-500' : 'bg-gray-400'}`}/>{printer.status}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${runtimeOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${runtimeOnline ? 'bg-green-500' : 'bg-red-500'}`}/>{printer.runtimeStatus || 'UNKNOWN'}
                      </span>
                      <button type="button" onClick={()=>editPrinter(printer)} className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-semibold transition-colors">Edit</button>
                      <button type="button" onClick={()=>handlePrinterTest(printer)} disabled={printerBusyId === printer.id || printer.status !== 'ACTIVE'} className="text-xs border border-[#F5C742]/50 text-[#b8920e] px-3 py-1.5 rounded-lg hover:bg-[#F5C742]/10 font-semibold transition-colors disabled:opacity-60">
                        {printerBusyId === printer.id ? 'Testing…' : 'Test'}
                      </button>
                      <button type="button" onClick={()=>handlePrinterDecommission(printer)} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 font-semibold transition-colors">
                        Decommission
                      </button>
                    </div>
                  );
                })}

                {/* Barcode scanners — registration-only (a HID keyboard-wedge scanner
                    needs no runtime config; the row exists for Device Manager visibility). */}
                {scanners.map((scanner) => (
                  <div key={`scan-${scanner.id}`} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[#F5C742]/15 text-[#b8920e]">
                      <Search className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#1E293B]">{scanner.deviceName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Barcode Scanner · {scanner.connectionType === 'BLUETOOTH' ? 'Bluetooth' : 'USB'}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Branch: {scanner.branchName || currentTerminal?.branchName || 'Current branch'}
                        {scanner.terminalId ? ` · Terminal: ${scanner.terminalId}` : ' · Branch default'}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${scanner.status==='ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${scanner.status==='ACTIVE' ? 'bg-blue-500' : 'bg-gray-400'}`}/>{scanner.status}
                    </span>
                    <button type="button" onClick={()=>decommissionScanner(scanner)} disabled={deviceBusyKey===`scanner-${scanner.id}`} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 font-semibold transition-colors disabled:opacity-60">
                      {deviceBusyKey===`scanner-${scanner.id}` ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ))}

                {/* Cash drawers — the kick rides the attached printer's cable. */}
                {cashDrawers.map((drawer) => {
                  const attached = (Array.isArray(printerConfigs) ? printerConfigs : []).find((p) => p.id === drawer.attachedPrinterId);
                  return (
                    <div key={`drawer-${drawer.id}`} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[#F5C742]/15 text-[#b8920e]">
                        <Wallet className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1E293B]">{drawer.deviceName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Cash Drawer · Kick via {attached?.deviceName || `printer #${drawer.attachedPrinterId}`}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Branch: {drawer.branchName || currentTerminal?.branchName || 'Current branch'}
                          {drawer.terminalId ? ` · Terminal: ${drawer.terminalId}` : ' · Branch default'}
                          {drawer.lastKickResult ? ` · Last kick: ${drawer.lastKickResult}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${drawer.status==='ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${drawer.status==='ACTIVE' ? 'bg-blue-500' : 'bg-gray-400'}`}/>{drawer.status}
                      </span>
                      <button type="button" onClick={()=>decommissionDrawer(drawer)} disabled={deviceBusyKey===`drawer-${drawer.id}`} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 font-semibold transition-colors disabled:opacity-60">
                        {deviceBusyKey===`drawer-${drawer.id}` ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  );
                })}

                {!printersLoading && !devicesLoading
                  && (!printerConfigs || printerConfigs.length===0)
                  && scanners.length===0 && cashDrawers.length===0 && (
                  <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                    <Printer className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No devices configured</p>
                    <p className="text-xs text-gray-300 mt-1">Add a printer, scanner, or cash drawer to get started.</p>
                  </div>
                )}
                {(printersLoading || devicesLoading) && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
                    Loading devices…
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Add</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { value: 'RECEIPT_PRINTER', label: 'Receipt Printer', icon: <Printer className="h-5 w-5" /> },
                    { value: 'LABEL_PRINTER',   label: 'Label Printer',   icon: <Package className="h-5 w-5" /> },
                    { value: 'SCANNER',         label: 'Barcode Scanner', icon: <Search className="h-5 w-5" /> },
                    { value: 'CASH_DRAWER',     label: 'Cash Drawer',     icon: <Wallet className="h-5 w-5" /> },
                  ].map(({ value, label, icon })=>(
                    <button key={value} type="button" onClick={()=>openAddDevice(value)}
                      className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#F5C742]/60 p-4 text-center flex flex-col items-center gap-2 transition-all hover:bg-[#F5C742]/5">
                      <div className="w-10 h-10 rounded-xl bg-[#F5C742]/10 flex items-center justify-center text-[#b8920e]">
                        {icon}
                      </div>
                      <p className="text-xs font-semibold text-gray-600">{label}</p>
                    </button>
                  ))}
                </div>
              </div>

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
                        <select value={printerForm.deviceType} onChange={e=>setPrinterForm(f => ({ ...f, deviceType: e.target.value, connectionType: e.target.value === 'LABEL_PRINTER' ? 'ZEBRA_BROWSER_PRINT' : (f.connectionType === 'ZEBRA_BROWSER_PRINT' ? 'WINDOWS_QUEUE' : f.connectionType), printTemplate: e.target.value === 'KITCHEN_PRINTER' ? 'Kitchen' : e.target.value === 'LABEL_PRINTER' ? 'Label' : 'Receipt', paperSize: e.target.value === 'LABEL_PRINTER' ? '100x150mm' : (f.paperSize === '100x150mm' ? '80mm' : f.paperSize) }))} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
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
                          {connectionOptions.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
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
              { id:'receipt', label:'POS Receipt',       icon:<Printer className="h-3.5 w-3.5" /> },
              { id:'invoice', label:'Tax Invoice',       icon:<FileText className="h-3.5 w-3.5" /> },
              { id:'return',  label:'Return / Credit',   icon:<RotateCcw className="h-3.5 w-3.5" /> },
              { id:'jobcard', label:'Service Job Card',  icon:<Wrench className="h-3.5 w-3.5" /> },
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
            const templateSelectorAvailable = (templateSubTab === 'receipt' || templateSubTab === 'invoice') && cfg.paper !== 'A4';
            const activeTemplate = getReceiptTemplate(templateSelectorAvailable ? receiptTemplateId : DEFAULT_RECEIPT_TEMPLATE_ID);
            const useComponentTemplate = templateSelectorAvailable && activeTemplate.kind === 'component';
            // Build the shared data model once for component templates (preview + print).
            const componentTemplateData = useComponentTemplate
              ? activeTemplate.mapData(
                  {
                    name: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone,
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
              <div key={label}>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
                <div className="space-y-1">
                  {items.map(([lbl, val, setter, disabled]) => (
                    <div key={lbl} className={`flex items-center justify-between py-2.5 px-1${disabled ? ' opacity-50' : ''}`}>
                      <span className="text-sm text-[#1E293B]">{lbl}</span>
                      <Switch checked={!!val} onCheckedChange={setter} disabled={disabled} />
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
              if (cfg.paper === 'A4') {
                html = templateSubTab === 'jobcard'
                  ? buildServiceJobA4Html({companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer})
                  : buildDocumentPreviewHtml(templateSubTab==='return'?'Sales Return':'Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer},{
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
                html = buildThermalJobCardHtml(cfg.paper, sampleJob, {companyName:tplOutletName,trn:tplOutletTrn,footer:cfg.footer,showTrn:cfg.showTrn});
              } else {
                html = buildThermalSampleHtml(cfg.paper,{companyName:tplOutletName,trn:tplOutletTrn,header:cfg.header,footer:cfg.footer,hasTax:hasTaxPreview,showTrn:cfg.showTrn,showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showServiceCharge:cfg.showServiceCharge,showVatSummary:cfg.showVatSummary,showPaymentDetails:cfg.showPaymentDetails,showQRCode:cfg.showQRCode,showCustomerDetails:cfg.showCustomerDetails,showLoyaltyPoints:cfg.showLoyaltyPoints,showCreditBalance:cfg.showCreditBalance,showFooterText:cfg.showFooterText,logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,isReturn:templateSubTab==='return',qrPlacement:cfg.qrPlacement});
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
              printHtml(buildThermalSampleHtml(cfg.paper,{companyName:tplOutletName,trn:tplOutletTrn,header:cfg.header,footer:cfg.footer,hasTax:hasTaxPreview,showTrn:cfg.showTrn,showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showServiceCharge:cfg.showServiceCharge,showVatSummary:cfg.showVatSummary,showPaymentDetails:cfg.showPaymentDetails,showQRCode:cfg.showQRCode,showCustomerDetails:cfg.showCustomerDetails,showLoyaltyPoints:cfg.showLoyaltyPoints,showCreditBalance:cfg.showCreditBalance,showFooterText:cfg.showFooterText,logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,isReturn:templateSubTab==='return',qrPlacement:cfg.qrPlacement}));
            };

            const handleTestPrint = async () => {
              // A4 and the Service Job Card always use the browser print pipeline —
              // there is no thermal/ESC-POS equivalent for those, and this task only
              // changes the 58mm/80mm receipt path.
              if (cfg.paper === 'A4') {
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
                  ? buildServiceJobA4Html({companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer})
                  : buildDocumentPreviewHtml(templateSubTab==='return'?'Sales Return':'Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer},toggles);
                printHtml(html);
                return;
              }
              if (templateSubTab === 'jobcard') {
                const sampleJob = { jobNumber:'SRV-000028', createdAt: new Date().toISOString(), technicianName:'Mohammed Ali', customerName:'Fatima Hassan', customerPhone:'+971 50 123 4567', deviceName:'Samsung Galaxy A55', serialNumber:'SNSA55-20260312', warranty:'Under Warranty', problemDescription:'Display issue — screen flickering', expectedDate:'29 Jun 2026' };
                printHtml(buildThermalJobCardHtml(cfg.paper, sampleJob, {companyName:tplOutletName,trn:tplOutletTrn,footer:cfg.footer,showTrn:cfg.showTrn}));
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
              const outlet = { name: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, logoDataUrl: tplLogoDataUrl, qrDataUrl: tplStampDataUrl };
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

            const handleResetDefault = () => {
              setTplReceiptPaper('80mm'); setTplReceiptHeader(''); setTplReceiptFooter('');
              setTplReceiptShowLogo(true); setTplReceiptShowTrn(true); setTplReceiptShowCompanyDetails(true);
              setTplReceiptShowCustomerDetails(true); setTplReceiptShowGrandTotalBanner(true);
              setTplReceiptColVatAmt(true); setTplReceiptColDiscount(true); setTplReceiptShowQRCode(true);
              setTplReceiptShowNotes(true); setTplReceiptShowBankDetails(true); setTplReceiptShowTerms(true);
              setTplReceiptShowStamp(false); setTplReceiptShowBarcode(false);
            };

            return (
              <div>
                {/* ── Template type tab bar ── */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-5 p-1.5 flex flex-wrap gap-1">
                  {templateTabs.map(t => (
                    <button key={t.id} onClick={() => setTemplateSubTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${templateSubTab===t.id ? 'bg-[#F5C742]/15 text-[#1E293B] border border-[#F5C742]/40' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                      <span className={templateSubTab===t.id?'text-[#b8920e]':'text-gray-400'}>{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── Two-column: Settings (left) + Live Preview (right) ── */}
                <div className="flex flex-col lg:flex-row gap-5 items-start">

                  {/* ── Left: all settings ── */}
                  <div className="flex-1 min-w-0 space-y-4">

                    {/* Branch / Outlet Info */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h3 className="text-sm font-bold text-[#1E293B] leading-none">Branch / Outlet Info</h3>
                          <p className="text-[11px] text-gray-400 mt-0.5">printed on all templates</p>
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Branch Name</label>
                            <input value={tplOutletName} onChange={e=>setTplOutletName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">TRN</label>
                            <input value={tplOutletTrn} onChange={e=>setTplOutletTrn(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Phone</label>
                          <input value={tplOutletPhone} onChange={e=>setTplOutletPhone(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Address (multi-line)</label>
                          <textarea value={tplOutletAddress} onChange={e=>setTplOutletAddress(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors resize-none" />
                        </div>
                      </div>
                    </div>

                    {/* Header Customization */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Settings className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <h3 className="text-sm font-bold text-[#1E293B]">Header Customization</h3>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Company / Branch Logo</label>
                          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-[#F5C742]/50 transition-colors cursor-pointer group" onClick={()=>document.getElementById('tpl-logo-upload')?.click()}>
                            <input id="tpl-logo-upload" type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setTplLogoDataUrl(ev.target.result);r.readAsDataURL(f);}e.target.value='';}} />
                            {tplLogoDataUrl
                              ? <><img src={tplLogoDataUrl} alt="Logo" className="h-10 w-10 object-contain rounded-lg" /><span className="text-sm text-[#1E293B] font-medium">Logo uploaded</span><button type="button" onClick={e=>{e.stopPropagation();setTplLogoDataUrl(null);}} className="ml-auto text-xs text-red-400 hover:text-red-600 font-semibold">Remove</button></>
                              : <><div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300"><Users className="h-5 w-5" /></div><span className="text-sm text-gray-400">Upload Logo (PNG, JPG — recommended square)</span></>
                            }
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Paper Size</label>
                          <PaperSizePicker value={cfg.paper} onChange={cfg.setPaper} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Header Custom Text (multi-line)</label>
                          <textarea value={cfg.header} onChange={e=>cfg.setHeader(e.target.value)} rows={2} placeholder="e.g. Thank you for dining with us!" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors resize-none" readOnly={templateSubTab==='jobcard'} />
                          <p className="text-[10px] text-gray-400 mt-1">Supports: branch name, address, phone, TRN, cashier, table/order ref — use branch info section above for those.</p>
                        </div>
                        {useComponentTemplate && cfg.setHeaderAr && (
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Header Text (Arabic) — Template 2 only</label>
                            <input dir="rtl" value={cfg.headerAr} onChange={e=>cfg.setHeaderAr(e.target.value)} placeholder="فاتورة ضريبية" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                            <p className="text-[10px] text-gray-400 mt-1">Arabic title shown alongside the English header above on the bilingual (Template 2) receipt.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Customization */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <h3 className="text-sm font-bold text-[#1E293B]">Footer Customization</h3>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Footer Custom Text (multi-line)</label>
                          <textarea value={cfg.footer} onChange={e=>cfg.setFooter(e.target.value)} rows={3} placeholder="e.g. Visit us again soon&#10;www.billbull.ae | @billbull" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors resize-none" />
                          <p className="text-[10px] text-gray-400 mt-1">Supports: thank you message, return policy, offer, website, support number.</p>
                        </div>
                      </div>
                    </div>

                    {/* QR Code / Social Image */}
                    {templateSubTab !== 'jobcard' && (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                          <h3 className="text-sm font-bold text-[#1E293B]">QR Code / Social Image</h3>
                        </div>
                        <div className="p-5 space-y-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">QR / Image</label>
                            {tplStampDataUrl ? (
                              <div className="flex items-center gap-3 border border-[#F5C742]/50 bg-[#F5C742]/5 rounded-xl px-4 py-3">
                                <img src={tplStampDataUrl} alt="QR" className="h-10 w-10 object-contain rounded" />
                                <span className="text-sm text-[#1E293B] font-medium flex-1">Upload QR Code or Promo Image (PNG, JPG) uploaded</span>
                                <button type="button" onClick={()=>setTplStampDataUrl(null)} className="text-xs text-red-400 hover:text-red-600 font-semibold flex items-center gap-1"><X className="h-3 w-3" />Remove</button>
                              </div>
                            ) : (
                              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:border-[#F5C742]/50 transition-colors cursor-pointer" onClick={()=>document.getElementById('tpl-qr-upload')?.click()}>
                                <input id="tpl-qr-upload" type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setTplStampDataUrl(ev.target.result);r.readAsDataURL(f);}e.target.value='';}} />
                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300"><FileText className="h-5 w-5" /></div>
                                <span className="text-sm text-gray-400">Upload QR Code or Promo Image (PNG, JPG)</span>
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1.5">Use for: Google Review QR, WhatsApp QR, Instagram QR, website QR, or promotional image.</p>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">QR / Image Position</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {[['before','Before Footer Text'],['after','After Footer Text']].map(([val,lbl])=>(
                                <button key={val} type="button"
                                  onClick={()=>cfg.setQrPlacement?.(val)}
                                  className={`py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${((cfg.qrPlacement||'before')===val) ? 'border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B]' : 'border-gray-200 text-gray-500 hover:border-[#F5C742]/40'}`}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show / Hide Fields */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Eye className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <h3 className="text-sm font-bold text-[#1E293B]">Show / Hide Fields</h3>
                      </div>
                      <div className="p-5 space-y-5">
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
                            ['Show Customer Details', t2cfg.showCustomerDetails, t2cfg.setShowCustomerDetails],
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
                            ...(cfg.paper !== 'A4' ? [] : [['Show Stamp / Seal', cfg.showStamp, cfg.setShowStamp]]),
                          ])}
                          {cfg.paper !== 'A4' && fieldToggleSection('TRANSACTION', [
                            ['Show Service Charge', cfg.showServiceCharge, cfg.setShowServiceCharge],
                            ['Show VAT Summary', cfg.showVatSummary, cfg.setShowVatSummary, templateSubTab === 'receipt'],
                            ['Show Payment Details (Cash / Change / Mode)', cfg.showPaymentDetails, cfg.setShowPaymentDetails],
                          ])}
                          {cfg.paper !== 'A4' && fieldToggleSection('AFTER PAYMENT', [
                            ['Show QR / Social Image', cfg.showQRCode, cfg.setShowQRCode],
                          ])}
                          {cfg.paper === 'A4' && fieldToggleSection('DOCUMENT SECTIONS', [
                            ['Show Grand Total Highlight', cfg.showServiceCharge, cfg.setShowServiceCharge],
                            ['Show QR / Stamp', cfg.showQRCode, cfg.setShowQRCode],
                            ['Show Bank Details', cfg.showCreditBalance, cfg.setShowCreditBalance],
                            ['Show Notes / Terms', cfg.showLoyaltyPoints, cfg.setShowLoyaltyPoints],
                          ])}
                          {fieldToggleSection('CUSTOMER DETAILS', [
                            ['Show Customer Details (Name, Mobile, Email, TRN, Address)', cfg.showCustomerDetails, cfg.setShowCustomerDetails],
                            ...(cfg.paper !== 'A4' ? [
                              ['Show Loyalty Points (Earned / Used / Remaining)', cfg.showLoyaltyPoints, cfg.setShowLoyaltyPoints],
                              ['Show Customer Credit Balance', cfg.showCreditBalance, cfg.setShowCreditBalance],
                            ] : []),
                          ])}
                          {fieldToggleSection('FOOTER', [
                            ['Show Footer Custom Text', cfg.showFooterText, cfg.setShowFooterText],
                          ])}
                          {cfg.paper === 'A4' && fieldToggleSection('COLUMNS (A4 only)', [
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
                  <div className="w-full lg:w-[260px] xl:w-[360px] sticky top-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Preview header */}
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400" />
                          <span className="text-sm font-bold text-[#1E293B]">Live Preview</span>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">
                          {cfg.paper === 'A4' ? 'A4 document' : `${cfg.paper} thermal`}
                        </span>
                      </div>

                      {/* ── Receipt template selector (Template 1 / Template 2 …) ── */}
                      {templateSelectorAvailable && (
                        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
                          {RECEIPT_TEMPLATES.map(t => (
                            <button key={t.id} type="button" onClick={() => setReceiptTemplateId(t.id)}
                              className={`flex-1 min-w-[110px] flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${receiptTemplateId===t.id ? 'bg-[#F5C742]/15 border-[#F5C742]/50 text-[#1E293B]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                              <span>{t.label}</span>
                              {t.sublabel && <span className={`text-[10px] font-medium ${receiptTemplateId===t.id ? 'text-[#b8920e]' : 'text-gray-400'}`}>{t.sublabel}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Preview body */}
                      <div className="p-4 bg-[#F7F7FA] overflow-y-auto flex flex-col gap-4" style={{ maxHeight: 900 }}>
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
                          : cfg.paper === 'A4'
                          ? (USE_NEW_POS_PRINT_TEMPLATE && (templateSubTab==='return' ? resolvedPosCreditNoteTemplate : resolvedPosInvoiceTemplate))
                            ? <ResolvedTemplateA4Preview
                                template={templateSubTab==='return' ? resolvedPosCreditNoteTemplate : resolvedPosInvoiceTemplate}
                                isReturn={templateSubTab==='return'}
                                hasTax={hasTaxPreview}
                                outlet={{ name: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, logoDataUrl: tplLogoDataUrl, stampDataUrl: tplStampDataUrl }}
                                footerNote={cfg.footer}
                                scale={0.42}
                              />
                            : <A4LivePreview
                              category={templateSubTab==='return'?'Sales Return':'Sales Invoice'}
                              companyName={tplOutletName} trn={tplOutletTrn}
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
                              outletTrn={tplOutletTrn}
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

                      {/* Preview footer buttons */}
                      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                        <button onClick={handleFullPreview}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors">
                          <Eye className="h-3.5 w-3.5" />Full Preview
                        </button>
                        <button onClick={handleTestPrint}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors">
                          <Printer className="h-3.5 w-3.5" />Test Print
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── Bottom action bar ── */}
                <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-200">
                  <button type="button" onClick={handleResetDefault}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <RotateCcw className="h-4 w-4" />Reset to Default
                  </button>
                  <button disabled={settingsSaving} onClick={async()=>{
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
                      const saved = await savePosSettings({ ...(posSettings||{}), printTemplateConfig: tplConfig });
                      setPosSettings(saved);
                      setSettingsSavedFlash(true);
                      setTimeout(()=>setSettingsSavedFlash(false), 2000);
                    } catch(e){ console.warn('Template save failed',e); } finally { setSettingsSaving(false); }
                  }}
                    className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-6 py-2.5 rounded-xl transition-colors">
                    <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Templates'}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ══ TERMINALS ══ */}
          {consoleTab === 'terminals' && (() => {
            const maxSlots = posSettings?.maxTerminalsPerBranch ?? 5;

            const activeCount = terminalList.filter(t => t.status === 'ACTIVE').length;
            const blockedCount = terminalList.filter(t => t.status === 'BLOCKED').length;
            const inactiveCount = terminalList.filter(t => t.status === 'INACTIVE').length;
            const offlineCount = terminalList.filter(t => t.status === 'OFFLINE').length;
            const staleCount = terminalList.filter(t => t.status === 'STALE').length;
            const archivedCount = terminalList.filter(t => t.status === 'ARCHIVED').length;
            const decommissionedCount = terminalList.filter(t => t.status === 'DECOMMISSIONED').length;
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
              ACTIVE:   { label: 'Active',   dot: 'bg-green-500', badge: 'bg-green-50 text-green-700',  icon: <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> },
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
                setPosSettings(saved);
              } catch (e) {
                window.alert(e?.response?.data?.message || 'Failed to save Terminal Auto Archive settings.');
              }
            };

            return (
            <>
            <div className="space-y-5">

              {/* ── Header row ── */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Terminal & Counter Management</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Rename terminals, set counter names, manage status, and designate your main POS.
                  </p>
                </div>
                <button
                  onClick={loadTerminals}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#1E293B] border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </div>

              {/* ── Stats bar ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total', value: terminalList.length, sub: `of ${maxSlots} slots`, color: 'text-[#1E293B]', bg: 'bg-white' },
                  { label: 'Active',   value: activeCount,   sub: 'online & ready',   color: 'text-green-700', bg: 'bg-green-50' },
                  { label: 'Inactive', value: inactiveCount, sub: 'temporarily off',   color: 'text-amber-700', bg: 'bg-amber-50' },
                  { label: 'Blocked',  value: blockedCount,  sub: 'access denied',     color: 'text-red-600',   bg: 'bg-red-50'   },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} border border-gray-100 rounded-2xl px-4 py-3 shadow-sm`}>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] font-bold text-gray-500 mt-0.5">{s.label}</p>
                    <p className="text-[10px] text-gray-400">{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* ── Terminal Health Summary ── */}
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
                <p className="text-xs font-bold text-[#1E293B] mb-3">Terminal Health</p>
                <div className="flex items-center gap-5 flex-wrap text-sm">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> <strong>{activeCount}</strong> Active</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" /> <strong>{offlineCount}</strong> Offline</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> <strong>{staleCount}</strong> Stale</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> <strong>{archivedCount}</strong> Archived</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-800" /> <strong>{decommissionedCount}</strong> Decommissioned</span>
                </div>
              </div>

              {/* ── Terminal Auto Archive settings ── */}
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#1E293B]">Terminal Auto Archive</p>
                    <p className="text-xs text-gray-400 mt-0.5">Automatically archive terminals that have been inactive for too long, freeing their slot.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={autoArchiveEnabled}
                      onChange={e => updateAutoArchiveSetting({ terminalAutoArchiveEnabled: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-[#F5C742] focus:ring-[#F5C742]"
                    />
                    <span className="text-xs font-semibold text-gray-600">Enable</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Archive after (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={autoArchiveAfterDays}
                      onChange={e => updateAutoArchiveSetting({ terminalArchiveAfterDays: Number(e.target.value) })}
                      className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoArchiveNotifyBefore}
                        onChange={e => updateAutoArchiveSetting({ terminalArchiveNotifyBefore: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-[#F5C742] focus:ring-[#F5C742]"
                      />
                      Notify before archive
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={!autoArchiveNotifyBefore}
                      value={autoArchiveWarningDays}
                      onChange={e => updateAutoArchiveSetting({ terminalArchiveWarningDays: Number(e.target.value) })}
                      placeholder="Warning period (days)"
                      className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white disabled:bg-gray-50 disabled:text-gray-300"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleSaveAutoArchiveSettings}
                      disabled={autoArchiveConfigInvalid}
                      className="w-full h-10 text-xs font-bold text-[#1E293B] bg-[#F5C742] hover:bg-[#e6b93a] disabled:bg-gray-100 disabled:text-gray-300 rounded-xl transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
                {autoArchiveConfigInvalid && (
                  <p className="text-xs text-red-500 font-semibold">
                    Warning period must be less than archive-after days, and archive-after days must be greater than zero.
                  </p>
                )}
              </div>

              {/* ── Slot usage bar ── */}
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
                    Terminal Slots
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 cursor-help" tabIndex={0} />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Clearing browser data may remove this terminal's saved identity. When POS is opened again, the browser may register as a new terminal and consume another slot.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                  <span className={`text-xs font-bold ${slotNearFull ? 'text-red-500' : 'text-gray-500'}`}>
                    {slotUsed} / {maxSlots} used{slotNearFull && slotUsed < maxSlots ? ' — almost full' : slotUsed >= maxSlots ? ' — at capacity' : ''}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${slotUsed >= maxSlots ? 'bg-red-500' : slotNearFull ? 'bg-amber-400' : 'bg-[#F5C742]'}`}
                    style={{ width: `${slotPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Each browser/device that opens POS is auto-registered. Blocked terminals still occupy a slot.
                </p>
              </div>

              {/* ── Info banner ── */}
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5 text-sm text-blue-700">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">How terminals are registered: </span>
                  Each browser/device that opens POS Sales is auto-registered as a terminal using a device fingerprint.
                  Use this panel to rename terminals, assign counters, set the Main POS, or block terminals no longer in use.
                </div>
              </div>

              {/* ── Current terminal highlight ── */}
              {currentTerminal && (
                <div className="flex items-center gap-3 bg-[#F5C742]/10 border border-[#F5C742]/40 rounded-xl px-5 py-3">
                  <Monitor className="h-4 w-4 text-[#b8920e] shrink-0" />
                  <span className="text-sm text-[#7a6000] font-semibold">
                    This device is registered as&nbsp;
                    <span className="font-black text-[#1E293B]">{currentTerminal.terminalName || currentTerminal.terminalId}</span>
                    &nbsp;·&nbsp;Counter:&nbsp;
                    <span className="font-black text-[#1E293B]">{currentTerminal.counterName || '—'}</span>
                    &nbsp;·&nbsp;
                    <span className="font-mono text-[10px] text-[#b8920e]">{currentTerminal.terminalId}</span>
                  </span>
                </div>
              )}

              {/* ── Terminal list ── */}
              {terminalsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-48 bg-gray-100 rounded" />
                        <div className="h-2.5 w-32 bg-gray-100 rounded" />
                        <div className="h-2 w-56 bg-gray-50 rounded" />
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
                  <p className="text-xs text-gray-300 mt-1">Click Refresh to load terminals registered for this branch.</p>
                  <button
                    onClick={loadTerminals}
                    className="mt-4 text-sm font-semibold text-[#327F74] border border-[#327F74]/30 px-5 py-2 rounded-xl hover:bg-[#327F74]/5 transition-colors"
                  >
                    Load Terminals
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {terminalList.map(t => {
                    const isEditing = editingTerminalId === t.terminalId;
                    const isThisDevice = currentTerminal?.terminalId === t.terminalId;
                    const sc = statusConfig[t.status] || statusConfig.ACTIVE;
                    const browserLabel = parseDeviceInfo(t.deviceInfo);
                    const lastSeenLabel = formatLastSeen(t.lastSeenAt);
                    const isRecentlyActive = t.lastSeenAt && (new Date() - new Date(t.lastSeenAt)) < 5 * 60 * 1000;

                    return (
                      <div
                        key={t.terminalId}
                        className={`bg-white rounded-2xl border shadow-sm transition-all ${
                          isThisDevice          ? 'border-[#F5C742]/60 ring-1 ring-[#F5C742]/30' :
                          t.status === 'BLOCKED'  ? 'border-red-100 opacity-70' :
                          t.status === 'INACTIVE' ? 'border-gray-100 opacity-80' : 'border-gray-200'
                        }`}
                      >
                        {/* ── View mode ── */}
                        {!isEditing && (
                          <div className="px-5 py-4">
                            <div className="flex items-start gap-4">

                              {/* Terminal icon */}
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                t.status === 'BLOCKED'  ? 'bg-red-50 text-red-400' :
                                t.status === 'INACTIVE' ? 'bg-gray-100 text-gray-400' :
                                t.isMainPos             ? 'bg-[#F5C742] text-[#7a4f00]' :
                                                          'bg-[#F5C742]/15 text-[#b8920e]'
                              }`}>
                                {t.isMainPos ? <Star className="h-5 w-5 fill-current" /> : <Monitor className="h-5 w-5" />}
                              </div>

                              {/* Main info */}
                              <div className="flex-1 min-w-0">
                                {/* Name row */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-black text-[#1E293B]">
                                    {t.terminalName || t.terminalId}
                                  </span>
                                  <span className="text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">
                                    {t.terminalId}
                                  </span>
                                  {isThisDevice && (
                                    <span className="text-[10px] font-black bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full uppercase tracking-wider">
                                      This device
                                    </span>
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
                                    <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200/50 flex items-center gap-1">
                                      ● Shift Open
                                    </span>
                                  )}
                                </div>

                                {/* Meta row */}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Hash className="h-3 w-3 text-gray-300" />
                                    {counterList.length > 0 && canTerminalAction('assigncounter') ? (
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
                                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 bg-white focus:outline-none focus:border-[#F5C742]"
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
                                  {t.registeredBy && (
                                    <span className="flex items-center gap-1 text-xs text-gray-400">
                                      <Users className="h-3 w-3 text-gray-300" />
                                      {t.registeredBy}
                                    </span>
                                  )}
                                  {browserLabel && (
                                    <span className="flex items-center gap-1 text-xs text-gray-400">
                                      <Cpu className="h-3 w-3 text-gray-300" />
                                      {browserLabel}
                                    </span>
                                  )}
                                  {lastSeenLabel && (
                                    <span className="flex items-center gap-1 text-xs text-gray-400">
                                      <Clock className="h-3 w-3 text-gray-300" />
                                      {lastSeenLabel}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Right side: status + actions */}
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                {/* Status badge */}
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${sc.badge}`}>
                                  {sc.icon}{sc.label}
                                </span>

                                {/* Action buttons */}
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  {canTerminalAction('rename') && (
                                    <button
                                      onClick={() => startEdit(t)}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-[#327F74] border border-[#327F74]/30 hover:bg-[#327F74]/5 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Wrench className="h-3.5 w-3.5" /> Rename
                                    </button>
                                  )}

                                  {/* Cycle status button — plain Deactivate isn't one of the named
                                      lifecycle actions, so it stays gated on the base pos.terminals
                                      edit permission rather than a dedicated permissions.pos.terminal.* key. */}
                                  {t.status === 'ACTIVE' && canAction('pos.terminals', 'edit') && (
                                    <button
                                      onClick={() => cycleStatus(t)}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 border border-amber-200 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Lock className="h-3.5 w-3.5" /> Deactivate
                                    </button>
                                  )}
                                  {t.status === 'INACTIVE' && (
                                    <>
                                      {canAction('pos.terminals', 'edit') && (
                                        <button
                                          onClick={() => setTerminalStatus(t.terminalId, 'ACTIVE').then(u => setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? u : x)))}
                                          className="flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          <Unlock className="h-3.5 w-3.5" /> Activate
                                        </button>
                                      )}
                                      {canTerminalAction('block') && (
                                        <button
                                          onClick={() => setTerminalStatus(t.terminalId, 'BLOCKED').then(u => setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? u : x)))}
                                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5" /> Block
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {t.status === 'BLOCKED' && canTerminalAction('unblock') && (
                                    <button
                                      onClick={() => setTerminalStatus(t.terminalId, 'ACTIVE').then(u => setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? u : x)))}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Unlock className="h-3.5 w-3.5" /> Unblock
                                    </button>
                                  )}

                                  {/* Set as Main POS */}
                                  {!t.isMainPos && t.status === 'ACTIVE' && canTerminalAction('setmain') && (
                                    <button
                                      onClick={() => promoteMainPos(t.terminalId)}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-[#b8920e] border border-[#F5C742]/50 hover:bg-[#F5C742]/10 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Star className="h-3.5 w-3.5" /> Set Main
                                    </button>
                                  )}

                                  {/* Archive / Restore / Decommission */}
                                  {t.status === 'DECOMMISSIONED' ? (
                                    <span className="text-xs text-gray-400 italic px-1">Permanently retired — cannot be restored</span>
                                  ) : t.status === 'ARCHIVED' ? (
                                    <>
                                      {canTerminalAction('restore') && (
                                        <button
                                          onClick={() => handleRestoreTerminal(t)}
                                          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          <Unlock className="h-3.5 w-3.5" /> Restore
                                        </button>
                                      )}
                                      {t.archiveContextJson && (
                                        <button
                                          onClick={() => setViewHistoryTerminalId(prev => prev === t.terminalId ? null : t.terminalId)}
                                          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          <Info className="h-3.5 w-3.5" /> View History
                                        </button>
                                      )}
                                      {canTerminalAction('decommission') && (
                                        <button
                                          onClick={() => handleDecommissionTerminal(t)}
                                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          <XCircle className="h-3.5 w-3.5" /> Decommission
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    !t.currentOpenSessionId && !isThisDevice && (
                                      <>
                                        {canTerminalAction('archive') && (
                                          <button
                                            onClick={() => handleArchiveTerminal(t)}
                                            className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 border border-orange-200 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors"
                                          >
                                            <AlertTriangle className="h-3.5 w-3.5" /> Archive
                                          </button>
                                        )}
                                        {canTerminalAction('decommission') && (
                                          <button
                                            onClick={() => handleDecommissionTerminal(t)}
                                            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> Decommission
                                          </button>
                                        )}
                                      </>
                                    )
                                  )}
                                </div>

                                {/* Exempt from Auto Archive */}
                                {t.status !== 'ARCHIVED' && canTerminalAction('setautoarchiveexempt') && (
                                  <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 cursor-pointer mt-0.5">
                                    <input
                                      type="checkbox"
                                      checked={!!t.autoArchiveExempt}
                                      onChange={() => handleToggleExempt(t)}
                                      className="h-3 w-3 rounded border-gray-300 text-[#F5C742] focus:ring-[#F5C742]"
                                    />
                                    Exempt from Auto Archive
                                  </label>
                                )}
                              </div>
                            </div>

                            {/* STALE warning banner */}
                            {t.status === 'STALE' && !t.autoArchiveExempt && (() => {
                              const inactiveDays = daysSince(t.lastActivityAt) ?? daysSince(t.staleAt) ?? 0;
                              const archiveAfterDays = posSettings?.terminalArchiveAfterDays ?? 30;
                              const daysRemaining = Math.max(archiveAfterDays - inactiveDays, 0);
                              return (
                                <div className="mt-3 flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
                                  <span className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Inactive for {inactiveDays} day{inactiveDays === 1 ? '' : 's'} · Archive in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {canTerminalAction('keepactive') && (
                                      <button
                                        onClick={() => handleKeepActive(t)}
                                        className="text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1 rounded-lg transition-colors"
                                      >
                                        Keep Active
                                      </button>
                                    )}
                                    {canTerminalAction('archive') && (
                                      <button
                                        onClick={() => handleArchiveNow(t)}
                                        className="text-xs font-semibold text-orange-700 border border-orange-300 hover:bg-orange-100 px-3 py-1 rounded-lg transition-colors"
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
                              return (
                                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-600 space-y-1">
                                  <p><strong>Trigger:</strong> {ctx.trigger}</p>
                                  <p><strong>Days inactive at archive:</strong> {ctx.daysInactive}</p>
                                  {ctx.lastHeartbeatAt && <p><strong>Last heartbeat:</strong> {formatLastSeen(ctx.lastHeartbeatAt) || ctx.lastHeartbeatAt}</p>}
                                  {ctx.lastSessionAt && <p><strong>Last session:</strong> {formatLastSeen(ctx.lastSessionAt) || ctx.lastSessionAt}</p>}
                                  {ctx.lastTransactionAt && <p><strong>Last transaction:</strong> {formatLastSeen(ctx.lastTransactionAt) || ctx.lastTransactionAt}</p>}
                                  {ctx.archivedAt && <p><strong>Archived at:</strong> {formatLastSeen(ctx.archivedAt) || ctx.archivedAt}</p>}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* ── Edit mode ── */}
                        {isEditing && (
                          <div className="px-5 py-4 space-y-4">
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
                                  value={editTerminalName}
                                  onChange={e => setEditTerminalName(e.target.value)}
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
                                  placeholder="e.g. Counter 1"
                                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-3 pt-1">
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
                                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-5 py-2 rounded-xl hover:bg-gray-50 transition-colors"
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

              {/* ── Summary footer ── */}
              {terminalList.length > 0 && !terminalsLoading && (
                <div className="flex items-center gap-6 text-xs text-gray-400 pt-1 px-1">
                  <span className="font-semibold text-[#1E293B]">{terminalList.length} terminal{terminalList.length !== 1 ? 's' : ''}</span>
                  <span className="text-green-600 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{activeCount} active</span>
                  {inactiveCount > 0 && <span className="text-amber-600 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />{inactiveCount} inactive</span>}
                  {blockedCount > 0 && <span className="text-red-500 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{blockedCount} blocked</span>}
                  <span className="text-[#b8920e] font-semibold flex items-center gap-1"><Star className="h-3 w-3 fill-current" />{terminalList.filter(t => t.isMainPos).length} main POS</span>
                </div>
              )}

              {/* ── Counter Management (embedded) ── */}
              <div className="border-t border-gray-200 pt-6 mt-2">
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
