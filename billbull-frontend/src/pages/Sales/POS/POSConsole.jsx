import React from 'react';
import { LayoutGrid, Shield, Printer, FileText, Hash, ChevronRight, Settings, CheckCircle, LayoutTemplate, Columns, Eye, Zap, XCircle, ShoppingCart, Wallet, Plus, Search, CreditCard, Package, Trash2, X, Users, RotateCcw, Wrench, RefreshCw, Info, Unlock, Lock } from 'lucide-react';
import { Switch } from '../../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Input } from '../../../components/ui/input';
import { A4LivePreview, ThermalMock, ImageUploadBox, PaperSizePicker } from './POSPrintPreview';
import { buildDocumentPreviewHtml, buildThermalPrintHtml, buildServiceJobA4Html } from './posPrintUtils';
import { printHtml } from '../../../utils/printGenerator';

const POSConsole = React.memo((props) => {
  const { 
    currentTerminal, setCurrentTerminal, setTerminalsLoading, setTerminalList, setEditingTerminalId, setEditTerminalName, setEditCounterName, setTerminalSaving, editTerminalName, editCounterName, terminalList, 
    setCurrentView, consoleTab, setConsoleTab, settingsSaving, setSettingsSaving, posSettings, setPosSettings, settingsSavedFlash, setSettingsSavedFlash, 
    tplOutletName, setTplOutletName, tplOutletTrn, setTplOutletTrn, tplOutletAddress, setTplOutletAddress, tplOutletPhone, setTplOutletPhone, 
    tplLogoDataUrl, setTplLogoDataUrl, tplStampDataUrl, setTplStampDataUrl, 
    tplReceiptHeader, setTplReceiptHeader, tplReceiptFooter, setTplReceiptFooter, tplReceiptPaper, setTplReceiptPaper, 
    tplReceiptShowLogo, tplReceiptShowTrn, tplReceiptShowStamp, tplReceiptShowBarcode, tplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails, 
    tplReceiptColItemCode, tplReceiptColItemImage, tplReceiptColBatchNo, tplReceiptColDiscount, tplReceiptColVatPct, tplReceiptColVatAmt, 
    tplReceiptShowGrandTotalBanner, tplReceiptShowTerms, tplReceiptShowNotes, tplReceiptShowBankDetails, tplReceiptShowQRCode, tplReceiptShowSignature, 
    tplInvoiceHeader, tplInvoiceFooter, tplInvoicePaper, 
    tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn, tplInvoiceShowCustomerDetails, tplInvoiceShowStamp, tplInvoiceShowSignature, 
    tplInvoiceShowGrandTotalBanner, tplInvoiceShowTerms, tplInvoiceShowNotes, tplInvoiceShowBankDetails, tplInvoiceShowQRCode, 
    tplInvoiceColItemCode, tplInvoiceColItemImage, tplInvoiceColBarcode, tplInvoiceColBatchNo, tplInvoiceColDiscount, tplInvoiceColVatPct, tplInvoiceColVatAmt, 
    tplReturnHeader, tplReturnFooter, tplReturnPaper, 
    tplReturnShowLogo, tplReturnShowTrn, tplReturnShowStamp, tplReturnShowCompanyDetails, tplReturnShowCustomerDetails, 
    tplReturnColItemCode, tplReturnColBatchNo, tplReturnColDiscount, tplReturnColVatPct, tplReturnColVatAmt, 
    tplReturnShowGrandTotalBanner, tplReturnShowTerms, tplReturnShowNotes, tplReturnShowQRCode, tplReturnShowSignature, 
    tplJobCardFooter, tplJobCardPaper, 
    tplJobCardShowLogo, tplJobCardShowTrn, tplJobCardShowStamp, tplJobCardShowCompanyDetails, tplJobCardShowCustomerDetails, 
    tplJobCardShowSerialNumber, tplJobCardShowWarranty, tplJobCardShowTechnician, tplJobCardShowExpectedDate, tplJobCardShowCustomerSignature, tplJobCardShowTerms, 
    posTemplate, setPosTemplate, hideCategoriesPanel, setHideCategoriesPanel, hideItemsPanel, setHideItemsPanel, hiddenPanelButtons, togglePanelButton, 
    settingsDraft, setSettingsDraft, handleSaveSettings, beginEditSettings, 
    consoleDevices, setConsoleDevices, showAddDevice, setShowAddDevice, newDevType, setNewDevType, newDevName, setNewDevName, newDevPort, setNewDevPort, newDevIp, setNewDevIp, 
    getAllPosTerminals, renamePosTerminal, setTerminalStatus, savePosSettings, templateSubTab, setTemplateSubTab, 
    setTplReceiptShowLogo, setTplReceiptShowCompanyDetails, setTplReceiptShowTrn, setTplReceiptShowCustomerDetails, setTplReceiptShowTerms, setTplReceiptShowNotes, setTplReceiptShowBankDetails, setTplReceiptShowQRCode, setTplReceiptShowStamp, setTplReceiptShowSignature, setTplReceiptShowGrandTotalBanner, setTplReceiptColItemCode, setTplReceiptColItemImage, setTplReceiptShowBarcode, setTplReceiptColBatchNo, setTplReceiptColDiscount, setTplReceiptColVatPct, setTplReceiptColVatAmt, 
    setTplInvoiceShowLogo, setTplInvoiceShowCompanyDetails, setTplInvoiceShowTrn, setTplInvoiceShowCustomerDetails, setTplInvoiceShowTerms, setTplInvoiceShowNotes, setTplInvoiceShowBankDetails, setTplInvoiceShowQRCode, setTplInvoiceShowStamp, setTplInvoiceShowSignature, setTplInvoiceShowGrandTotalBanner, setTplInvoiceColItemCode, setTplInvoiceColItemImage, setTplInvoiceColBatchNo, setTplInvoiceColDiscount, setTplInvoiceColVatPct, setTplInvoiceColVatAmt, 
    setTplReturnShowLogo, setTplReturnShowCompanyDetails, setTplReturnShowTrn, setTplReturnShowCustomerDetails, setTplReturnShowTerms, setTplReturnShowNotes, setTplReturnShowQRCode, setTplReturnShowStamp, setTplReturnShowSignature, setTplReturnShowGrandTotalBanner, setTplReturnColItemCode, setTplReturnColBatchNo, setTplReturnColDiscount, setTplReturnColVatPct, setTplReturnColVatAmt, 
    setTplJobCardShowLogo, setTplJobCardShowCompanyDetails, setTplJobCardShowTrn, setTplJobCardShowCustomerDetails, setTplJobCardShowSerialNumber, setTplJobCardShowWarranty, setTplJobCardShowTechnician, setTplJobCardShowExpectedDate, setTplJobCardShowCustomerSignature, setTplJobCardShowTerms, setTplJobCardShowStamp,
    editingTerminalId, terminalsLoading, terminalSaving,
    setTplInvoiceHeader, setTplInvoiceFooter, setTplInvoicePaper, setTplInvoiceColBarcode,
    setTplReturnHeader, setTplReturnFooter, setTplReturnPaper,
    setTplJobCardFooter, setTplJobCardPaper,
  } = props;

    const allBtnList = [
      { id:'add-qty',label:'Add Qty' },{ id:'remove',label:'Remove Item' },{ id:'discount',label:'Discount' },
      { id:'layaways',label:'Layaways' },{ id:'save-layaway',label:'Save Layaway' },{ id:'save-order',label:'Save as Order' },
      { id:'add-shipping',label:'Add Shipping' },{ id:'add-customer',label:'Add Customer' },{ id:'coupons',label:'Coupons' },
      { id:'promotions',label:'Promotions' },{ id:'last-receipt',label:'Last Receipt' },{ id:'orders',label:'Orders' },
      { id:'return',label:'Return' },{ id:'price-chk',label:'Price Check' },
      { id:'cash-drop',label:'Cash Drawer' },{ id:'credit-balance',label:'Credit Balance' },
      { id:'z-report',label:'Z-Report' },{ id:'serial-batch',label:'Serial/Batch Check' },{ id:'reprint',label:'Reprint' },
      { id:'lock-pos',label:'Lock POS' },{ id:'close-session',label:'Close Session' },
    ];
    const devTypes = ['Receipt Printer','Kitchen Printer','Label Printer','Barcode Scanner','Cash Drawer','Card Terminal','Customer Display'];
    const portTypes = ['USB','COM Port','Network / IP','Bluetooth','Serial'];

    const tabs = [
      { id:'layout',    label:'Manage Layouts', icon:<LayoutGrid className="h-4 w-4" /> },
      { id:'behavior',  label:'Behavior',       icon:<Shield className="h-4 w-4" /> },
      { id:'devices',   label:'Devices',        icon:<Printer className="h-4 w-4" /> },
      { id:'templates', label:'Print Templates',icon:<FileText className="h-4 w-4" /> },
      { id:'terminals', label:'Terminals',      icon:<Hash className="h-4 w-4" /> },
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
                      receiptHeader:tplReceiptHeader,receiptFooter:tplReceiptFooter,receiptPaper:tplReceiptPaper,
                      receiptShowLogo:tplReceiptShowLogo,receiptShowTrn:tplReceiptShowTrn,receiptShowStamp:tplReceiptShowStamp,receiptShowBarcode:tplReceiptShowBarcode,
                      receiptShowCompanyDetails:tplReceiptShowCompanyDetails,receiptShowCustomerDetails:tplReceiptShowCustomerDetails,
                      receiptColItemCode:tplReceiptColItemCode,receiptColItemImage:tplReceiptColItemImage,receiptColBatchNo:tplReceiptColBatchNo,receiptColDiscount:tplReceiptColDiscount,receiptColVatPct:tplReceiptColVatPct,receiptColVatAmt:tplReceiptColVatAmt,
                      receiptShowGrandTotalBanner:tplReceiptShowGrandTotalBanner,receiptShowTerms:tplReceiptShowTerms,receiptShowNotes:tplReceiptShowNotes,receiptShowBankDetails:tplReceiptShowBankDetails,receiptShowQRCode:tplReceiptShowQRCode,receiptShowSignature:tplReceiptShowSignature,
                      invoiceHeader:tplInvoiceHeader,invoiceFooter:tplInvoiceFooter,invoicePaper:tplInvoicePaper,
                      invoiceShowLogo:tplInvoiceShowLogo,invoiceShowCompanyDetails:tplInvoiceShowCompanyDetails,invoiceShowTrn:tplInvoiceShowTrn,
                      invoiceShowCustomerDetails:tplInvoiceShowCustomerDetails,invoiceShowStamp:tplInvoiceShowStamp,invoiceShowSignature:tplInvoiceShowSignature,
                      invoiceShowGrandTotalBanner:tplInvoiceShowGrandTotalBanner,invoiceShowTerms:tplInvoiceShowTerms,invoiceShowNotes:tplInvoiceShowNotes,
                      invoiceShowBankDetails:tplInvoiceShowBankDetails,invoiceShowQRCode:tplInvoiceShowQRCode,
                      invoiceColItemCode:tplInvoiceColItemCode,invoiceColItemImage:tplInvoiceColItemImage,invoiceColBarcode:tplInvoiceColBarcode,
                      invoiceColBatchNo:tplInvoiceColBatchNo,invoiceColDiscount:tplInvoiceColDiscount,invoiceColVatPct:tplInvoiceColVatPct,invoiceColVatAmt:tplInvoiceColVatAmt,
                      returnHeader:tplReturnHeader,returnFooter:tplReturnFooter,returnPaper:tplReturnPaper,
                      returnShowLogo:tplReturnShowLogo,returnShowTrn:tplReturnShowTrn,returnShowStamp:tplReturnShowStamp,
                      returnShowCompanyDetails:tplReturnShowCompanyDetails,returnShowCustomerDetails:tplReturnShowCustomerDetails,
                      returnColItemCode:tplReturnColItemCode,returnColBatchNo:tplReturnColBatchNo,returnColDiscount:tplReturnColDiscount,returnColVatPct:tplReturnColVatPct,returnColVatAmt:tplReturnColVatAmt,
                      returnShowGrandTotalBanner:tplReturnShowGrandTotalBanner,returnShowTerms:tplReturnShowTerms,returnShowNotes:tplReturnShowNotes,returnShowQRCode:tplReturnShowQRCode,returnShowSignature:tplReturnShowSignature,
                      jobCardFooter:tplJobCardFooter,jobCardPaper:tplJobCardPaper,
                      jobCardShowLogo:tplJobCardShowLogo,jobCardShowTrn:tplJobCardShowTrn,jobCardShowStamp:tplJobCardShowStamp,
                      jobCardShowCompanyDetails:tplJobCardShowCompanyDetails,jobCardShowCustomerDetails:tplJobCardShowCustomerDetails,
                      jobCardShowSerialNumber:tplJobCardShowSerialNumber,jobCardShowWarranty:tplJobCardShowWarranty,jobCardShowTechnician:tplJobCardShowTechnician,
                      jobCardShowExpectedDate:tplJobCardShowExpectedDate,jobCardShowCustomerSignature:tplJobCardShowCustomerSignature,jobCardShowTerms:tplJobCardShowTerms,
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
          <div className="flex gap-1 mt-4">
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
                <div className="grid grid-cols-3 gap-3">
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
                <div className="grid grid-cols-2 gap-2">
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

              {/* Action Buttons */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Zap className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Action Buttons
                </h3>
                <p className="text-xs text-gray-400 mb-4">Toggle which buttons appear in the Cart Focus functions panel.</p>
                <div className="grid grid-cols-2 gap-2">
                  {allBtnList.map(btn=>(
                    <div key={btn.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-[#1E293B]">{btn.label}</span>
                      <Switch checked={!hiddenPanelButtons.has(btn.id)} onCheckedChange={()=>togglePanelButton(btn.id)} />
                    </div>
                  ))}
                </div>
              </div>

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
                  <div className="grid grid-cols-2 gap-3 mb-1">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Approval Method</label>
                      <div className="grid grid-cols-2 gap-2">
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
                <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-2 gap-3 mb-4">
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
                  <div className="grid grid-cols-2 gap-2">
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
                  <p className="text-xs text-gray-400 mt-0.5">Manage printers, scanners, cash drawers and card terminals.</p>
                </div>
                <button onClick={()=>setShowAddDevice(true)}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                  <Plus className="h-4 w-4" />Add Device
                </button>
              </div>

              <div className="space-y-3">
                {consoleDevices.map(dev=>{
                  const devIcon = {
                    'Receipt Printer':<Printer className="h-5 w-5" />,'Kitchen Printer':<Printer className="h-5 w-5" />,
                    'Label Printer':<Printer className="h-5 w-5" />,'Barcode Scanner':<Search className="h-5 w-5" />,
                    'Cash Drawer':<Wallet className="h-5 w-5" />,'Card Terminal':<CreditCard className="h-5 w-5" />,
                    'Customer Display':<Eye className="h-5 w-5" />,
                  };
                  return (
                    <div key={dev.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${dev.status==='Online'?'bg-[#F5C742]/15 text-[#b8920e]':'bg-gray-100 text-gray-400'}`}>
                        {devIcon[dev.type]||<Package className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1E293B]">{dev.name}</p>
                        <p className="text-xs text-gray-400">{dev.type} · {dev.port}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${dev.status==='Online'?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dev.status==='Online'?'bg-green-500':'bg-red-500'}`}/>{dev.status}
                      </span>
                      <button className="text-xs border border-[#F5C742]/50 text-[#b8920e] px-3 py-1.5 rounded-lg hover:bg-[#F5C742]/10 font-semibold transition-colors">Test</button>
                      <button onClick={()=>setConsoleDevices(d=>d.filter(x=>x.id!==dev.id))} className="text-gray-300 hover:text-red-500 transition-colors ml-1"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
                {consoleDevices.length===0 && (
                  <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                    <Printer className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No devices configured</p>
                    <p className="text-xs text-gray-300 mt-1">Click "Add Device" to get started.</p>
                  </div>
                )}
              </div>

              {/* Quick-add cards */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Add</p>
                <div className="grid grid-cols-4 gap-3">
                  {[['Receipt Printer',<Printer className="h-5 w-5"/>],['Barcode Scanner',<Search className="h-5 w-5"/>],['Cash Drawer',<Wallet className="h-5 w-5"/>],['Card Terminal',<CreditCard className="h-5 w-5"/>]].map(([label,icon])=>(
                    <button key={label} type="button" onClick={()=>{setNewDevType(label);setShowAddDevice(true);}}
                      className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#F5C742]/60 p-4 text-center flex flex-col items-center gap-2 transition-all hover:bg-[#F5C742]/5">
                      <div className="w-10 h-10 rounded-xl bg-[#F5C742]/10 flex items-center justify-center text-[#b8920e]">{icon}</div>
                      <p className="text-xs font-semibold text-gray-600">{label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Device dialog */}
              {showAddDevice && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-base font-bold text-[#1E293B]">Add New Device</h3>
                      <button onClick={()=>setShowAddDevice(false)}><X className="h-5 w-5 text-gray-400" /></button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Type</label>
                        <select value={newDevType} onChange={e=>setNewDevType(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {devTypes.map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Name / Model</label>
                        <input value={newDevName} onChange={e=>setNewDevName(e.target.value)} placeholder="e.g. Epson TM-T82III" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Connection</label>
                        <select value={newDevPort} onChange={e=>setNewDevPort(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {portTypes.map(p=><option key={p}>{p}</option>)}
                        </select>
                      </div>
                      {newDevPort==='Network / IP' && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">IP Address</label>
                          <input value={newDevIp} onChange={e=>setNewDevIp(e.target.value)} placeholder="192.168.1.x" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={()=>setShowAddDevice(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
                      <button onClick={()=>{
                        if(newDevName.trim()){setConsoleDevices(d=>[...d,{id:`d${Date.now()}`,type:newDevType,name:newDevName,port:newDevPort,status:'Offline'}]);setNewDevName('');setShowAddDevice(false);}
                      }} className="flex-1 py-2.5 rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        <Plus className="h-4 w-4" />Add Device
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PRINT TEMPLATES ══ */}
          {consoleTab==='templates' && (
            <div className="space-y-5">

              {/* ── Outlet / Company Info ── */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1E293B] leading-none">Outlet / Company Info</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Appears on all document types</p>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex gap-8">
                    <div className="flex-1 grid grid-cols-2 gap-x-5 gap-y-4">
                      {[{l:'Company Name',v:tplOutletName,s:setTplOutletName},{l:'TRN',v:tplOutletTrn,s:setTplOutletTrn},{l:'Address',v:tplOutletAddress,s:setTplOutletAddress},{l:'Phone',v:tplOutletPhone,s:setTplOutletPhone}].map(f=>(
                        <div key={f.l}>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{f.l}</label>
                          <input value={f.v} onChange={e=>f.s(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                        </div>
                      ))}
                    </div>
                    <div className="shrink-0 flex flex-col gap-4 justify-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Branding</p>
                      <div className="flex gap-4">
                        <ImageUploadBox label="Logo" value={tplLogoDataUrl} onChange={setTplLogoDataUrl} hint="PNG · SVG · JPG" />
                        <ImageUploadBox label="Stamp" value={tplStampDataUrl} onChange={setTplStampDataUrl} hint="PNG · SVG · JPG" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Template picker + detail panel ── */}
              <div className="flex gap-4 items-start">

                {/* Left nav — template types */}
                <div className="shrink-0 w-48 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Templates</p>
                  </div>
                  <div className="p-2 space-y-1">
                    {[
                      {id:'receipt',   label:'Receipt',          icon:<Printer className="h-4 w-4" />},
                      {id:'invoice',   label:'Tax Invoice',      icon:<FileText className="h-4 w-4" />},
                      {id:'return',    label:'Return / CN',      icon:<RotateCcw className="h-4 w-4" />},
                      {id:'jobcard',   label:'Service Job Card', icon:<Wrench className="h-4 w-4" />},
                    ].map(item=>(
                      <button key={item.id} onClick={()=>setTemplateSubTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-all ${templateSubTab===item.id?'bg-[#F5C742]/15 text-[#1E293B]':'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                        <span className={templateSubTab===item.id?'text-[#b8920e]':'text-gray-400'}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right detail panel */}
                <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                  {/* ── Receipt ── */}
                  {templateSubTab==='receipt' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Printer className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Receipt</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">POS sale confirmation slip</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplReceiptPaper} onChange={setTplReceiptPaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplReceiptPaper==='A4'?'w-[560px]':tplReceiptPaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplReceiptPaper} Preview</span>
                        {tplReceiptPaper==='A4'
                          ? <A4LivePreview category="Sales Invoice" companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplReceiptFooter} scale={0.655}
                              toggles={{ showLogo:tplReceiptShowLogo, showCompanyDetails:tplReceiptShowCompanyDetails, showTrn:tplReceiptShowTrn, showCustomerDetails:tplReceiptShowCustomerDetails, showTerms:tplReceiptShowTerms, showNotes:tplReceiptShowNotes, showBankDetails:tplReceiptShowBankDetails, showQRCode:tplReceiptShowQRCode, showStamp:tplReceiptShowStamp, showSignature:tplReceiptShowSignature, showGrandTotalBanner:tplReceiptShowGrandTotalBanner, colItemCode:tplReceiptColItemCode, colItemImage:tplReceiptColItemImage, colBarcode:tplReceiptShowBarcode, colBatchNo:tplReceiptColBatchNo, colDiscount:tplReceiptColDiscount, colVatPct:tplReceiptColVatPct, colVatAmt:tplReceiptColVatAmt, logoDataUrl:tplLogoDataUrl, stampDataUrl:tplStampDataUrl }} />
                          : <ThermalMock paperSize={tplReceiptPaper} lines={[tplOutletName,tplReceiptShowTrn?`TRN: ${tplOutletTrn}`:'','─────────────',tplReceiptHeader||'','INV: SI-POS-000001','22 Jun 2026  10:30 AM','─────────────','Samsung A55 x1 . AED 1,380','iPhone Case x2 ... AED 45','─────────────','Subtotal ...... AED 1,425','VAT 5% ........... AED 71','─────────────','TOTAL: AED 1,496.25','─────────────',tplReceiptFooter]} />
                        }
                        <button onClick={()=>printHtml(tplReceiptPaper==='A4'
                          ? buildDocumentPreviewHtml('Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplReceiptFooter})
                          : buildThermalPrintHtml(tplReceiptPaper,{companyName:tplOutletName,trn:tplOutletTrn,header:tplReceiptHeader,footer:tplReceiptFooter,showTrn:tplReceiptShowTrn})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Header Text</label>
                            <input value={tplReceiptHeader} onChange={e=>setTplReceiptHeader(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Footer Text</label>
                            <input value={tplReceiptFooter} onChange={e=>setTplReceiptFooter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        {tplReceiptPaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplReceiptShowLogo,s:setTplReceiptShowLogo},{l:'Show Company Name & Address',v:tplReceiptShowCompanyDetails,s:setTplReceiptShowCompanyDetails},{l:'Show TRN',v:tplReceiptShowTrn,s:setTplReceiptShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details (Bill To)',v:tplReceiptShowCustomerDetails,s:setTplReceiptShowCustomerDetails}]},
                              {label:'Items Table',    items:[{l:'Item Code',v:tplReceiptColItemCode,s:setTplReceiptColItemCode},{l:'Item Image',v:tplReceiptColItemImage,s:setTplReceiptColItemImage},{l:'Batch Number',v:tplReceiptColBatchNo,s:setTplReceiptColBatchNo},{l:'Discount Column',v:tplReceiptColDiscount,s:setTplReceiptColDiscount},{l:'VAT % Column',v:tplReceiptColVatPct,s:setTplReceiptColVatPct},{l:'VAT Amount Column',v:tplReceiptColVatAmt,s:setTplReceiptColVatAmt},{l:'Barcode Column',v:tplReceiptShowBarcode,s:setTplReceiptShowBarcode}]},
                              {label:'Footer & Summary',items:[{l:'Show Grand Total Banner',v:tplReceiptShowGrandTotalBanner,s:setTplReceiptShowGrandTotalBanner},{l:'Show Terms & Conditions',v:tplReceiptShowTerms,s:setTplReceiptShowTerms},{l:'Show Notes',v:tplReceiptShowNotes,s:setTplReceiptShowNotes},{l:'Show Bank Details',v:tplReceiptShowBankDetails,s:setTplReceiptShowBankDetails},{l:'Show QR Code',v:tplReceiptShowQRCode,s:setTplReceiptShowQRCode},{l:'Show Stamp',v:tplReceiptShowStamp,s:setTplReceiptShowStamp},{l:'Show Authorized Signature',v:tplReceiptShowSignature,s:setTplReceiptShowSignature}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplReceiptShowLogo,s:setTplReceiptShowLogo},{l:'Show TRN',v:tplReceiptShowTrn,s:setTplReceiptShowTrn},{l:'Show Stamp',v:tplReceiptShowStamp,s:setTplReceiptShowStamp},{l:'Show Barcode / QR',v:tplReceiptShowBarcode,s:setTplReceiptShowBarcode}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                  {/* ── Tax Invoice ── */}
                  {templateSubTab==='invoice' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Tax Invoice</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">VAT-compliant customer invoice</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplInvoicePaper} onChange={setTplInvoicePaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplInvoicePaper==='A4'?'w-[560px]':tplInvoicePaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplInvoicePaper} Preview</span>
                        {tplInvoicePaper==='A4'
                          ? <A4LivePreview category="Sales Invoice" companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplInvoiceFooter} scale={0.655}
                              toggles={{ showLogo:tplInvoiceShowLogo, showCompanyDetails:tplInvoiceShowCompanyDetails, showTrn:tplInvoiceShowTrn, showCustomerDetails:tplInvoiceShowCustomerDetails, showTerms:tplInvoiceShowTerms, showNotes:tplInvoiceShowNotes, showBankDetails:tplInvoiceShowBankDetails, showQRCode:tplInvoiceShowQRCode, showStamp:tplInvoiceShowStamp, showSignature:tplInvoiceShowSignature, showGrandTotalBanner:tplInvoiceShowGrandTotalBanner, colItemCode:tplInvoiceColItemCode, colItemImage:tplInvoiceColItemImage, colBarcode:tplInvoiceColBarcode, colBatchNo:tplInvoiceColBatchNo, colDiscount:tplInvoiceColDiscount, colVatPct:tplInvoiceColVatPct, colVatAmt:tplInvoiceColVatAmt, logoDataUrl:tplLogoDataUrl, stampDataUrl:tplStampDataUrl }} />
                          : <ThermalMock paperSize={tplInvoicePaper} lines={[tplInvoiceHeader||'TAX INVOICE',tplOutletName,`TRN: ${tplOutletTrn}`,tplOutletAddress,'─────────────','INV: SI-POS-000001','22 Jun 2026','Cust: Fatima Hassan','─────────────','Samsung A55 x1 . AED 1,380','VAT 5% ............. AED 69','─────────────','TOTAL: AED 1,449.00','─────────────',tplInvoiceFooter]} />
                        }
                        <button onClick={()=>printHtml(tplInvoicePaper==='A4'
                          ? buildDocumentPreviewHtml('Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplInvoiceFooter})
                          : buildThermalPrintHtml(tplInvoicePaper,{companyName:tplOutletName,trn:tplOutletTrn,header:tplInvoiceHeader,footer:tplInvoiceFooter,showTrn:true})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Header Title</label>
                            <input value={tplInvoiceHeader} onChange={e=>setTplInvoiceHeader(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Footer Note / Terms</label>
                            <input value={tplInvoiceFooter} onChange={e=>setTplInvoiceFooter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        {tplInvoicePaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplInvoiceShowLogo,s:setTplInvoiceShowLogo},{l:'Show Company Name & Address',v:tplInvoiceShowCompanyDetails,s:setTplInvoiceShowCompanyDetails},{l:'Show TRN',v:tplInvoiceShowTrn,s:setTplInvoiceShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details (Bill To)',v:tplInvoiceShowCustomerDetails,s:setTplInvoiceShowCustomerDetails}]},
                              {label:'Items Table',    items:[{l:'Item Code',v:tplInvoiceColItemCode,s:setTplInvoiceColItemCode},{l:'Item Image',v:tplInvoiceColItemImage,s:setTplInvoiceColItemImage},{l:'Barcode Column',v:tplInvoiceColBarcode,s:setTplInvoiceColBarcode},{l:'Batch Number',v:tplInvoiceColBatchNo,s:setTplInvoiceColBatchNo},{l:'Discount Column',v:tplInvoiceColDiscount,s:setTplInvoiceColDiscount},{l:'VAT % Column',v:tplInvoiceColVatPct,s:setTplInvoiceColVatPct},{l:'VAT Amount Column',v:tplInvoiceColVatAmt,s:setTplInvoiceColVatAmt}]},
                              {label:'Footer & Summary',items:[{l:'Show Grand Total Banner',v:tplInvoiceShowGrandTotalBanner,s:setTplInvoiceShowGrandTotalBanner},{l:'Show Terms & Conditions',v:tplInvoiceShowTerms,s:setTplInvoiceShowTerms},{l:'Show Notes',v:tplInvoiceShowNotes,s:setTplInvoiceShowNotes},{l:'Show Bank Details',v:tplInvoiceShowBankDetails,s:setTplInvoiceShowBankDetails},{l:'Show QR Code',v:tplInvoiceShowQRCode,s:setTplInvoiceShowQRCode},{l:'Show Stamp',v:tplInvoiceShowStamp,s:setTplInvoiceShowStamp},{l:'Show Authorized Signature',v:tplInvoiceShowSignature,s:setTplInvoiceShowSignature}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplInvoiceShowLogo,s:setTplInvoiceShowLogo},{l:'Show TRN',v:tplInvoiceShowTrn,s:setTplInvoiceShowTrn},{l:'Show Stamp',v:tplInvoiceShowStamp,s:setTplInvoiceShowStamp},{l:'Show Barcode / QR',v:tplInvoiceShowQRCode,s:setTplInvoiceShowQRCode}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                  {/* ── Return / Credit Note ── */}
                  {templateSubTab==='return' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><RotateCcw className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Return / Credit Note</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">Refund and credit note document</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplReturnPaper} onChange={setTplReturnPaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplReturnPaper==='A4'?'w-[560px]':tplReturnPaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplReturnPaper} Preview</span>
                        {tplReturnPaper==='A4'
                          ? <A4LivePreview category="Sales Return" companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplReturnFooter} scale={0.655}
                              toggles={{ showLogo:tplReturnShowLogo, showCompanyDetails:tplReturnShowCompanyDetails, showTrn:tplReturnShowTrn, showCustomerDetails:tplReturnShowCustomerDetails, showTerms:tplReturnShowTerms, showNotes:tplReturnShowNotes, showBankDetails:false, showQRCode:tplReturnShowQRCode, showStamp:tplReturnShowStamp, showSignature:tplReturnShowSignature, showGrandTotalBanner:tplReturnShowGrandTotalBanner, colItemCode:tplReturnColItemCode, colBatchNo:tplReturnColBatchNo, colDiscount:tplReturnColDiscount, colVatPct:tplReturnColVatPct, colVatAmt:tplReturnColVatAmt, logoDataUrl:tplLogoDataUrl, stampDataUrl:tplStampDataUrl }} />
                          : <ThermalMock paperSize={tplReturnPaper} lines={[tplReturnHeader||'SALES RETURN',tplOutletName,'─────────────','Return: SR-POS-000042','Orig: SI-POS-000108','22 Jun 2026','Cust: Fatima Hassan','─────────────','Samsung A55 x1 -AED 1,380','VAT Rev ......... -AED 69','─────────────','REFUND: AED 1,449.00','─────────────',tplReturnFooter]} />
                        }
                        <button onClick={()=>printHtml(tplReturnPaper==='A4'
                          ? buildDocumentPreviewHtml('Sales Return',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplReturnFooter})
                          : buildThermalPrintHtml(tplReturnPaper,{companyName:tplOutletName,trn:tplOutletTrn,header:tplReturnHeader,footer:tplReturnFooter,showTrn:true})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Header Title</label>
                            <input value={tplReturnHeader} onChange={e=>setTplReturnHeader(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Footer Note</label>
                            <input value={tplReturnFooter} onChange={e=>setTplReturnFooter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        {tplReturnPaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplReturnShowLogo,s:setTplReturnShowLogo},{l:'Show Company Name & Address',v:tplReturnShowCompanyDetails,s:setTplReturnShowCompanyDetails},{l:'Show TRN',v:tplReturnShowTrn,s:setTplReturnShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details (Bill To)',v:tplReturnShowCustomerDetails,s:setTplReturnShowCustomerDetails}]},
                              {label:'Items Table',    items:[{l:'Item Code',v:tplReturnColItemCode,s:setTplReturnColItemCode},{l:'Batch Number',v:tplReturnColBatchNo,s:setTplReturnColBatchNo},{l:'Discount Column',v:tplReturnColDiscount,s:setTplReturnColDiscount},{l:'VAT % Column',v:tplReturnColVatPct,s:setTplReturnColVatPct},{l:'VAT Amount Column',v:tplReturnColVatAmt,s:setTplReturnColVatAmt}]},
                              {label:'Footer & Summary',items:[{l:'Show Grand Total Banner',v:tplReturnShowGrandTotalBanner,s:setTplReturnShowGrandTotalBanner},{l:'Show Terms & Conditions',v:tplReturnShowTerms,s:setTplReturnShowTerms},{l:'Show Notes',v:tplReturnShowNotes,s:setTplReturnShowNotes},{l:'Show QR Code',v:tplReturnShowQRCode,s:setTplReturnShowQRCode},{l:'Show Stamp',v:tplReturnShowStamp,s:setTplReturnShowStamp},{l:'Show Authorized Signature',v:tplReturnShowSignature,s:setTplReturnShowSignature}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplReturnShowLogo,s:setTplReturnShowLogo},{l:'Show TRN',v:tplReturnShowTrn,s:setTplReturnShowTrn},{l:'Show Stamp',v:tplReturnShowStamp,s:setTplReturnShowStamp}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                  {/* ── Service Job Card ── */}
                  {templateSubTab==='jobcard' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Wrench className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Service Job Card</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">Repair and service tracking document</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplJobCardPaper} onChange={setTplJobCardPaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplJobCardPaper==='A4'?'w-[560px]':tplJobCardPaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplJobCardPaper} Preview</span>
                        {tplJobCardPaper==='A4'
                          ? <ServiceJobA4Preview companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplJobCardFooter} scale={0.655} />
                          : <ThermalMock paperSize={tplJobCardPaper} lines={['SERVICE JOB CARD',tplOutletName,'─────────────','Job: SRV-000028','22 Jun 2026','Tech: Mohammed Ali','─────────────','Cust: Fatima Hassan','Item: Samsung A55','S/N: SNSA55-20260312','Problem: Display issue','Warranty: Under Warranty','─────────────','Cust. Signature: _____','─────────────',tplJobCardFooter]} />
                        }
                        <button onClick={()=>printHtml(tplJobCardPaper==='A4'
                          ? buildServiceJobA4Html({companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplJobCardFooter})
                          : buildThermalPrintHtml(tplJobCardPaper,{companyName:tplOutletName,trn:tplOutletTrn,header:'SERVICE JOB CARD',footer:tplJobCardFooter,showTrn:true})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Terms / Footer</label>
                          <textarea value={tplJobCardFooter} onChange={e=>setTplJobCardFooter(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors resize-none" />
                        </div>
                        {tplJobCardPaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplJobCardShowLogo,s:setTplJobCardShowLogo},{l:'Show Company Name & Address',v:tplJobCardShowCompanyDetails,s:setTplJobCardShowCompanyDetails},{l:'Show TRN',v:tplJobCardShowTrn,s:setTplJobCardShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details',v:tplJobCardShowCustomerDetails,s:setTplJobCardShowCustomerDetails}]},
                              {label:'Job Details',    items:[{l:'Serial Number',v:tplJobCardShowSerialNumber,s:setTplJobCardShowSerialNumber},{l:'Warranty Status',v:tplJobCardShowWarranty,s:setTplJobCardShowWarranty},{l:'Assigned Technician',v:tplJobCardShowTechnician,s:setTplJobCardShowTechnician},{l:'Expected Completion Date',v:tplJobCardShowExpectedDate,s:setTplJobCardShowExpectedDate}]},
                              {label:'Footer',         items:[{l:'Show Terms & Conditions',v:tplJobCardShowTerms,s:setTplJobCardShowTerms},{l:'Customer Signature Line',v:tplJobCardShowCustomerSignature,s:setTplJobCardShowCustomerSignature},{l:'Show Stamp',v:tplJobCardShowStamp,s:setTplJobCardShowStamp}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplJobCardShowLogo,s:setTplJobCardShowLogo},{l:'Show TRN',v:tplJobCardShowTrn,s:setTplJobCardShowTrn},{l:'Show Stamp',v:tplJobCardShowStamp,s:setTplJobCardShowStamp}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                </div>
              </div>

            </div>
          )}

          {/* ══ TERMINALS ══ */}
          {consoleTab === 'terminals' && (
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Terminal & Counter Management</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Rename terminals, set counter names, and block unused terminals for this branch.
                  </p>
                </div>
                <button
                  onClick={loadTerminals}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#1E293B] border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </div>

              {/* Info banner — explain how terminals are created */}
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">How terminals are registered: </span>
                  Each browser/device that opens POS Sales is auto-registered as a terminal using a device fingerprint.
                  Use this panel to give each terminal a meaningful name and counter number, or block terminals that are no longer in use.
                </div>
              </div>

              {/* Current terminal highlight */}
              {currentTerminal && (
                <div className="flex items-center gap-3 bg-[#F5C742]/10 border border-[#F5C742]/40 rounded-xl px-5 py-3">
                  <div className="w-2 h-2 rounded-full bg-[#F5C742] animate-pulse" />
                  <span className="text-sm text-[#7a6000] font-semibold">
                    This device is registered as&nbsp;
                    <span className="font-black text-[#1E293B]">{currentTerminal.terminalName || currentTerminal.terminalId}</span>
                    &nbsp;— Counter:&nbsp;
                    <span className="font-black text-[#1E293B]">{currentTerminal.counterName || '—'}</span>
                  </span>
                </div>
              )}

              {/* Terminal list */}
              {terminalsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-40 bg-gray-100 rounded" />
                        <div className="h-2.5 w-24 bg-gray-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : terminalList.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-14 text-center">
                  <Hash className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No terminals loaded</p>
                  <p className="text-xs text-gray-300 mt-1">Click Refresh to load terminals for this branch.</p>
                  <button
                    onClick={loadTerminals}
                    className="mt-4 text-sm font-semibold text-[#327F74] border border-[#327F74]/30 px-4 py-2 rounded-xl hover:bg-[#327F74]/5 transition-colors"
                  >
                    Load Terminals
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {terminalList.map(t => {
                    const isEditing = editingTerminalId === t.terminalId;
                    const isThisDevice = currentTerminal?.terminalId === t.terminalId;
                    const isBlocked = t.status === 'BLOCKED';

                    return (
                      <div
                        key={t.terminalId}
                        className={`bg-white rounded-2xl border shadow-sm transition-all ${
                          isThisDevice ? 'border-[#F5C742]/60 ring-1 ring-[#F5C742]/30' :
                          isBlocked    ? 'border-gray-100 opacity-60' : 'border-gray-200'
                        }`}
                      >
                        {/* View mode */}
                        {!isEditing && (
                          <div className="flex items-center gap-4 px-5 py-4">
                            {/* Icon */}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                              isBlocked ? 'bg-gray-100 text-gray-400' : 'bg-[#F5C742]/15 text-[#b8920e]'
                            }`}>
                              <Hash className="h-5 w-5" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-[#1E293B]">
                                  {t.terminalName || t.terminalId}
                                </span>
                                <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">
                                  {t.terminalId}
                                </span>
                                {isThisDevice && (
                                  <span className="text-[10px] font-black bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    This device
                                  </span>
                                )}
                                {t.isMainPos && (
                                  <span className="text-[10px] font-bold bg-[#327F74]/10 text-[#327F74] px-2 py-0.5 rounded-full">
                                    Main POS
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                                <span>Counter: <strong className="text-gray-600">{t.counterName || '—'}</strong></span>
                                <span>Registered by: <strong className="text-gray-600">{t.registeredBy || '—'}</strong></span>
                                {t.lastSeenAt && (
                                  <span>Last seen: <strong className="text-gray-600">{new Date(t.lastSeenAt).toLocaleString()}</strong></span>
                                )}
                              </div>
                            </div>

                            {/* Status badge */}
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 ${
                              isBlocked
                                ? 'bg-red-50 text-red-600'
                                : 'bg-green-50 text-green-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isBlocked ? 'bg-red-500' : 'bg-green-500'}`} />
                              {isBlocked ? 'Blocked' : 'Active'}
                            </span>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => startEdit(t)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-[#327F74] border border-[#327F74]/30 hover:bg-[#327F74]/5 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Wrench className="h-3.5 w-3.5" /> Rename
                              </button>
                              <button
                                onClick={() => toggleTerminalStatus(t)}
                                className={`flex items-center gap-1.5 text-xs font-semibold border px-3 py-1.5 rounded-lg transition-colors ${
                                  isBlocked
                                    ? 'text-green-700 border-green-200 hover:bg-green-50'
                                    : 'text-red-600 border-red-200 hover:bg-red-50'
                                }`}
                              >
                                {isBlocked ? <><Unlock className="h-3.5 w-3.5" /> Unblock</> : <><Lock className="h-3.5 w-3.5" /> Block</>}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Edit mode */}
                        {isEditing && (
                          <div className="px-5 py-4 space-y-4">
                            <p className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                              <Wrench className="h-4 w-4 text-[#F5C742]" />
                              Rename Terminal — <span className="font-mono text-gray-400 font-normal">{t.terminalId}</span>
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">Terminal Name</label>
                                <input
                                  type="text"
                                  value={editTerminalName}
                                  onChange={e => setEditTerminalName(e.target.value)}
                                  placeholder="e.g. Cashier Station 1"
                                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">Counter Name</label>
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
                                {terminalSaving ? 'Saving…' : 'Save'}
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

              {/* Summary footer */}
              {terminalList.length > 0 && (
                <div className="flex items-center gap-6 text-xs text-gray-400 pt-2">
                  <span>{terminalList.length} terminal{terminalList.length !== 1 ? 's' : ''} total</span>
                  <span className="text-green-600 font-semibold">
                    {terminalList.filter(t => t.status === 'ACTIVE').length} active
                  </span>
                  <span className="text-red-500 font-semibold">
                    {terminalList.filter(t => t.status === 'BLOCKED').length} blocked
                  </span>
                  <span className="text-[#b8920e] font-semibold">
                    {terminalList.filter(t => t.isMainPos).length} main POS
                  </span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
});
POSConsole.displayName = 'POSConsole';
export default POSConsole;


