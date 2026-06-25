import React, { useState } from 'react';
import { LayoutGrid, Shield, Printer, FileText, Hash, ChevronRight, Settings, CheckCircle, LayoutTemplate, Columns, Eye, Zap, XCircle, ShoppingCart, Wallet, Plus, Search, CreditCard, Package, Trash2, X, Users, RotateCcw, Wrench, RefreshCw, Info, Unlock, Lock, Star, Monitor, Clock, AlertTriangle, ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { Switch } from '../../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Input } from '../../../components/ui/input';
import { A4LivePreview, ThermalMock, PaperSizePicker } from './POSPrintPreview';
import { buildDocumentPreviewHtml, buildThermalPrintHtml, buildThermalSampleHtml, buildServiceJobA4Html, buildThermalJobCardHtml } from './posPrintUtils';
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
    tplInvoiceQrPlacement, setTplInvoiceQrPlacement,
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
    getAllPosTerminals, renamePosTerminal, setTerminalStatus, setMainPosTerminal, savePosSettings, templateSubTab, setTemplateSubTab,
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
                      invoiceShowBankDetails:tplInvoiceShowBankDetails,invoiceShowQRCode:tplInvoiceShowQRCode,invoiceQrPlacement:tplInvoiceQrPlacement,
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
          {consoleTab==='templates' && (() => {
            // Derive current template config based on active sub-tab
            const tplCfg = {
              receipt: {
                paper: tplReceiptPaper, setPaper: setTplReceiptPaper,
                header: tplReceiptHeader, setHeader: setTplReceiptHeader,
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
                showCreditBalance: false, setShowCreditBalance: ()=>{},
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

            const cfg = tplCfg[templateSubTab] || tplCfg.receipt;

            const fieldToggleSection = (label, items) => (
              <div key={label}>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
                <div className="space-y-1">
                  {items.map(([lbl, val, setter]) => (
                    <div key={lbl} className="flex items-center justify-between py-2.5 px-1">
                      <span className="text-sm text-[#1E293B]">{lbl}</span>
                      <Switch checked={!!val} onCheckedChange={setter} />
                    </div>
                  ))}
                </div>
              </div>
            );

            const handleFullPreview = () => {
              let html;
              if (cfg.paper === 'A4') {
                html = templateSubTab === 'jobcard'
                  ? buildServiceJobA4Html({companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer})
                  : buildDocumentPreviewHtml(templateSubTab==='return'?'Sales Return':'Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer},{
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
                html = buildThermalSampleHtml(cfg.paper,{companyName:tplOutletName,trn:tplOutletTrn,header:cfg.header,footer:cfg.footer,showTrn:cfg.showTrn,showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showServiceCharge:cfg.showServiceCharge,showVatSummary:cfg.showVatSummary,showPaymentDetails:cfg.showPaymentDetails,showQRCode:cfg.showQRCode,showCustomerDetails:cfg.showCustomerDetails,showLoyaltyPoints:cfg.showLoyaltyPoints,showCreditBalance:cfg.showCreditBalance,showFooterText:cfg.showFooterText,logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,isReturn:templateSubTab==='return'});
              }
              const w = window.open('','_blank');
              w && w.document.write(html);
            };

            const handleTestPrint = () => {
              const toggles = {
                showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showTrn:cfg.showTrn,showCustomerDetails:cfg.showCustomerDetails,
                showTerms:cfg.showFooterText,showNotes:cfg.showLoyaltyPoints,showBankDetails:cfg.showCreditBalance,
                showQRCode:cfg.showQRCode,showStamp:cfg.showStamp,showSignature:false,showGrandTotalBanner:cfg.showServiceCharge,
                colItemCode:cfg.colItemCode,colItemImage:cfg.colItemImage,colBarcode:cfg.colBarcode,colBatchNo:cfg.colBatchNo,
                colDiscount:cfg.colDiscount,colVatPct:cfg.colVatPct,colVatAmt:cfg.colVatAmt,
                logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,
              };
              if (cfg.paper === 'A4') {
                const html = templateSubTab === 'jobcard'
                  ? buildServiceJobA4Html({companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer})
                  : buildDocumentPreviewHtml(templateSubTab==='return'?'Sales Return':'Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:cfg.footer},toggles);
                printHtml(html);
              } else if (templateSubTab === 'jobcard') {
                const sampleJob = { jobNumber:'SRV-000028', createdAt: new Date().toISOString(), technicianName:'Mohammed Ali', customerName:'Fatima Hassan', customerPhone:'+971 50 123 4567', deviceName:'Samsung Galaxy A55', serialNumber:'SNSA55-20260312', warranty:'Under Warranty', problemDescription:'Display issue — screen flickering', expectedDate:'29 Jun 2026' };
                printHtml(buildThermalJobCardHtml(cfg.paper, sampleJob, {companyName:tplOutletName,trn:tplOutletTrn,footer:cfg.footer,showTrn:cfg.showTrn}));
              } else {
                printHtml(buildThermalSampleHtml(cfg.paper,{companyName:tplOutletName,trn:tplOutletTrn,header:cfg.header,footer:cfg.footer,showTrn:cfg.showTrn,showLogo:cfg.showLogo,showCompanyDetails:cfg.showCompanyDetails,showServiceCharge:cfg.showServiceCharge,showVatSummary:cfg.showVatSummary,showPaymentDetails:cfg.showPaymentDetails,showQRCode:cfg.showQRCode,showCustomerDetails:cfg.showCustomerDetails,showLoyaltyPoints:cfg.showLoyaltyPoints,showCreditBalance:cfg.showCreditBalance,showFooterText:cfg.showFooterText,logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,isReturn:templateSubTab==='return'}));
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
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-5 p-1.5 flex gap-1">
                  {templateTabs.map(t => (
                    <button key={t.id} onClick={() => setTemplateSubTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${templateSubTab===t.id ? 'bg-[#F5C742]/15 text-[#1E293B] border border-[#F5C742]/40' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                      <span className={templateSubTab===t.id?'text-[#b8920e]':'text-gray-400'}>{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── Two-column: Settings (left) + Live Preview (right) ── */}
                <div className="flex gap-5 items-start">

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
                        <div className="grid grid-cols-2 gap-3">
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
                            <div className="grid grid-cols-2 gap-2">
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
                        </>) : (<>
                          {fieldToggleSection('HEADER', [
                            ['Show Logo', cfg.showLogo, cfg.setShowLogo],
                            ['Show Company Name & Address', cfg.showCompanyDetails, cfg.setShowCompanyDetails],
                            ['Show TRN', cfg.showTrn, cfg.setShowTrn],
                            ...(cfg.paper !== 'A4' ? [] : [['Show Stamp / Seal', cfg.showStamp, cfg.setShowStamp]]),
                          ])}
                          {cfg.paper !== 'A4' && fieldToggleSection('TRANSACTION', [
                            ['Show Service Charge', cfg.showServiceCharge, cfg.setShowServiceCharge],
                            ['Show VAT Summary', cfg.showVatSummary, cfg.setShowVatSummary],
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
                  <div className="shrink-0 w-[360px] sticky top-6">
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

                      {/* Preview body */}
                      <div className="p-4 bg-[#F7F7FA] overflow-y-auto flex flex-col gap-4" style={{ maxHeight: 900 }}>
                        {cfg.paper === 'A4'
                          ? <A4LivePreview
                              category={templateSubTab==='return'?'Sales Return':'Sales Invoice'}
                              companyName={tplOutletName} trn={tplOutletTrn}
                              address={tplOutletAddress} phone={tplOutletPhone}
                              footerNote={cfg.footer} scale={0.42}
                              toggles={{
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
                        receiptHeader:tplReceiptHeader,receiptFooter:tplReceiptFooter,receiptPaper:tplReceiptPaper,
                        receiptShowLogo:tplReceiptShowLogo,receiptShowTrn:tplReceiptShowTrn,receiptShowStamp:tplReceiptShowStamp,receiptShowBarcode:tplReceiptShowBarcode,
                        receiptShowCompanyDetails:tplReceiptShowCompanyDetails,receiptShowCustomerDetails:tplReceiptShowCustomerDetails,
                        receiptColItemCode:tplReceiptColItemCode,receiptColItemImage:tplReceiptColItemImage,receiptColBatchNo:tplReceiptColBatchNo,receiptColDiscount:tplReceiptColDiscount,receiptColVatPct:tplReceiptColVatPct,receiptColVatAmt:tplReceiptColVatAmt,
                        receiptShowGrandTotalBanner:tplReceiptShowGrandTotalBanner,receiptShowTerms:tplReceiptShowTerms,receiptShowNotes:tplReceiptShowNotes,receiptShowBankDetails:tplReceiptShowBankDetails,receiptShowQRCode:tplReceiptShowQRCode,receiptShowSignature:tplReceiptShowSignature,
                        invoiceHeader:tplInvoiceHeader,invoiceFooter:tplInvoiceFooter,invoicePaper:tplInvoicePaper,
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
            const slotUsed = terminalList.length;
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
              const d = new Date(ts);
              const now = new Date();
              const diffMs = now - d;
              const diffMin = Math.floor(diffMs / 60000);
              if (diffMin < 2) return 'Just now';
              if (diffMin < 60) return `${diffMin}m ago`;
              const diffH = Math.floor(diffMin / 60);
              if (diffH < 24) return `${diffH}h ago`;
              return d.toLocaleDateString();
            };

            const parseDeviceInfo = (info) => {
              if (!info) return null;
              // deviceInfo is typically a User-Agent string
              if (info.includes('Chrome')) return 'Chrome';
              if (info.includes('Firefox')) return 'Firefox';
              if (info.includes('Safari') && !info.includes('Chrome')) return 'Safari';
              if (info.includes('Edge')) return 'Edge';
              return info.length > 30 ? info.substring(0, 28) + '…' : info;
            };

            const statusConfig = {
              ACTIVE:   { label: 'Active',   dot: 'bg-green-500', badge: 'bg-green-50 text-green-700',  icon: <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> },
              INACTIVE: { label: 'Inactive', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700',  icon: <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> },
              BLOCKED:  { label: 'Blocked',  dot: 'bg-red-500',   badge: 'bg-red-50 text-red-600',      icon: <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> },
            };

            return (
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
              <div className="grid grid-cols-4 gap-3">
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

              {/* ── Slot usage bar ── */}
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#1E293B]">Terminal Slots</span>
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
                                </div>

                                {/* Meta row */}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Hash className="h-3 w-3 text-gray-300" />
                                    <strong className="text-gray-700">{t.counterName || 'No counter'}</strong>
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
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => startEdit(t)}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-[#327F74] border border-[#327F74]/30 hover:bg-[#327F74]/5 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    <Wrench className="h-3.5 w-3.5" /> Rename
                                  </button>

                                  {/* Cycle status button */}
                                  {t.status === 'ACTIVE' && (
                                    <button
                                      onClick={() => cycleStatus(t)}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 border border-amber-200 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Lock className="h-3.5 w-3.5" /> Deactivate
                                    </button>
                                  )}
                                  {t.status === 'INACTIVE' && (
                                    <>
                                      <button
                                        onClick={() => setTerminalStatus(t.terminalId, 'ACTIVE').then(u => setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? u : x)))}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        <Unlock className="h-3.5 w-3.5" /> Activate
                                      </button>
                                      <button
                                        onClick={() => setTerminalStatus(t.terminalId, 'BLOCKED').then(u => setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? u : x)))}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" /> Block
                                      </button>
                                    </>
                                  )}
                                  {t.status === 'BLOCKED' && (
                                    <button
                                      onClick={() => setTerminalStatus(t.terminalId, 'ACTIVE').then(u => setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? u : x)))}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Unlock className="h-3.5 w-3.5" /> Unblock
                                    </button>
                                  )}

                                  {/* Set as Main POS */}
                                  {!t.isMainPos && t.status === 'ACTIVE' && (
                                    <button
                                      onClick={() => promoteMainPos(t.terminalId)}
                                      className="flex items-center gap-1.5 text-xs font-semibold text-[#b8920e] border border-[#F5C742]/50 hover:bg-[#F5C742]/10 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      <Star className="h-3.5 w-3.5" /> Set Main
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
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
                            <div className="grid grid-cols-2 gap-4">
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
            </div>
            );
          })()}

        </div>
      </div>
    );
});
POSConsole.displayName = 'POSConsole';
export default POSConsole;


