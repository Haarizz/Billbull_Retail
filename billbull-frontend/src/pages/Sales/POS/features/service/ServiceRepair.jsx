// Extracted verbatim from POSSales.jsx (the Service & Repair Management screen).
// Behaviour is unchanged; only the location moved. The five Service & Repair states and their setters
// stay in POSSales, and the parent keeps the `showServiceRepair &&` mount condition. Every value below is
// passed down under its ORIGINAL POSSales name.
//
// This component owns no state, no effects, no refs, calls no hooks and makes no API calls. The screen is
// placeholder UI: `mockJobs` is empty and most actions are intentionally inert.

import React from 'react';
import { AlertCircle, CheckCircle, ChevronRight, ClipboardList, DollarSign, FileText, Package, PackageCheck, Plus, Printer, RotateCcw, Search, Settings, Shield, Smartphone, Stethoscope, Trash2, Truck, Users, Wrench, X, XCircle } from 'lucide-react';
import { CurrencyAmount, DirhamSymbol, renderAED } from '../../POSCurrency';

function ServiceRepair({
  showServiceRepair,
  setShowServiceRepair,
  serviceView,
  setServiceView,
  serviceJobStep,
  setServiceJobStep,
  serviceDetailTab,
  setServiceDetailTab,
  serviceJobFilter,
  setServiceJobFilter,
}) {
  const mockJobs = [];
  const statusColor = (s) => ({
    'New': 'bg-blue-100 text-blue-700', 'Inspection Pending': 'bg-amber-100 text-amber-700',
    'Under Warranty': 'bg-green-100 text-green-700', 'Warranty Rejected': 'bg-red-100 text-red-600',
    'Waiting for Parts': 'bg-orange-100 text-orange-700', 'Estimate Shared': 'bg-cyan-100 text-cyan-700',
    'Pending Customer Approval': 'bg-purple-100 text-purple-700', 'Approved': 'bg-teal-100 text-teal-700',
    'In Repair': 'bg-sky-100 text-sky-700', 'Ready for Delivery': 'bg-lime-100 text-lime-700',
    'Delivered': 'bg-gray-100 text-gray-600', 'Cancelled': 'bg-red-50 text-red-500'
  }[s] || 'bg-gray-100 text-gray-500');
  const warrantyColor = (w) => w === 'Under Warranty' ? 'text-green-700' : w === 'Warranty Expired' ? 'text-red-600' : 'text-gray-500';
  const filteredJobs = mockJobs.filter(j => {
    if (serviceJobFilter.status !== 'All' && j.status !== serviceJobFilter.status) return false;
    if (serviceJobFilter.customer && !j.customer.toLowerCase().includes(serviceJobFilter.customer.toLowerCase())) return false;
    if (serviceJobFilter.jobNo && !j.no.toLowerCase().includes(serviceJobFilter.jobNo.toLowerCase())) return false;
    if (serviceJobFilter.serial && !j.serial.toLowerCase().includes(serviceJobFilter.serial.toLowerCase())) return false;
    if (serviceJobFilter.technician && !j.tech.toLowerCase().includes(serviceJobFilter.technician.toLowerCase())) return false;
    if (serviceJobFilter.warranty !== 'All' && j.warranty !== serviceJobFilter.warranty) return false;
    return true;
  });
  const kpis = [
    { label: 'Open Jobs', val: '—', icon: <ClipboardList className="h-4 w-4" />, color: 'text-sky-700', bg: 'bg-sky-50' },
    { label: 'Under Warranty', val: '—', icon: <Shield className="h-4 w-4" />, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Pending Approval', val: '—', icon: <AlertCircle className="h-4 w-4" />, color: 'text-purple-700', bg: 'bg-purple-50' },
    { label: 'Ready for Delivery', val: '—', icon: <PackageCheck className="h-4 w-4" />, color: 'text-lime-700', bg: 'bg-lime-50' },
    { label: 'Delivered Today', val: '—', icon: <Truck className="h-4 w-4" />, color: 'text-gray-600', bg: 'bg-gray-50' },
    { label: 'Chargeable', val: '—', icon: <DollarSign className="h-4 w-4" />, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Parts Value', val: '—', icon: <Package className="h-4 w-4" />, color: 'text-[#327F74]', bg: 'bg-teal-50' },
  ];
  const serviceSteps = ['Customer Details', 'Item & Warranty', 'Problem Details', 'Technician & Parts', 'Estimate', 'Service Invoice', 'Delivery'];
  const detailTabs = ['overview', 'warranty', 'diagnosis', 'parts', 'estimate', 'invoice', 'payments', 'delivery', 'activity'];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F7F7FA]">
      {/* Top Bar */}
      <div className="bg-[#1E293B] border-b border-[#327F74]/30 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setShowServiceRepair(false)} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm shrink-0"><ChevronRight className="h-4 w-4 rotate-180" />POS</button>
          <span className="text-gray-600 hidden sm:inline">/</span>
          <span className="text-white flex items-center gap-2 min-w-0"><Wrench className="h-4 w-4 text-[#F5C742] shrink-0" /><span className="truncate">Service &amp; Repair Management</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {serviceView !== 'new-job' && <button onClick={() => { setServiceView('new-job'); setServiceJobStep(1); }} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-1.5 rounded flex items-center gap-1"><Plus className="h-3.5 w-3.5" />New Service Job</button>}
          {serviceView !== 'settings' && <button onClick={() => setServiceView('settings')} className="border border-gray-600 text-gray-300 text-sm px-3 py-1.5 rounded hover:border-gray-400 flex items-center gap-1"><Settings className="h-3.5 w-3.5" />Settings</button>}
          <button onClick={() => setShowServiceRepair(false)} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {/* ─ LIST VIEW ─ */}
      {serviceView === 'list' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4">
            <h1 className="text-xl text-[#1E293B]">Service &amp; Repair Management</h1>
            <p className="text-xs text-gray-500">Manage warranty checks, repair intake, service jobs, spare parts usage, customer approvals, service invoices, and delivery status.</p>
          </div>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
            {kpis.map(k => (
              <div key={k.label} className={`${k.bg} border border-[#327F74]/10 rounded-lg p-3 flex flex-col gap-1`}>
                <div className={`flex items-center gap-1 ${k.color}`}>{k.icon}<span className="text-xs text-gray-500">{k.label}</span></div>
                <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
              </div>
            ))}
          </div>
          {/* Filters */}
          <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-end shadow-sm">
            {[
              { label: 'Job No.', key: 'jobNo', ph: 'SRV-...' },
              { label: 'Customer', key: 'customer', ph: 'Name / Mobile' },
              { label: 'Serial / Batch', key: 'serial', ph: 'Serial No.' },
              { label: 'Technician', key: 'technician', ph: 'Name' },
            ].map(f => (
              <div key={f.label} className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-400">{f.label}</label>
                <input value={serviceJobFilter[f.key]} onChange={e => setServiceJobFilter(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
              </div>
            ))}
            <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Status</label>
              <select value={serviceJobFilter.status} onChange={e => setServiceJobFilter(p => ({ ...p, status: e.target.value }))} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                {['All', 'New', 'Inspection Pending', 'Under Warranty', 'Warranty Rejected', 'Waiting for Parts', 'Estimate Shared', 'Pending Customer Approval', 'Approved', 'In Repair', 'Ready for Delivery', 'Delivered', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Warranty</label>
              <select value={serviceJobFilter.warranty} onChange={e => setServiceJobFilter(p => ({ ...p, warranty: e.target.value }))} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                {['All', 'Under Warranty', 'Warranty Expired', 'No Warranty', 'Warranty Rejected'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <button className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
            <button onClick={() => setServiceJobFilter({ status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' })} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
          </div>
          {/* Table */}
          <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-xs">
              <thead className="bg-[#F7F7FA] border-b border-[#327F74]/10">
                <tr className="text-gray-500">{['Job No.', 'Job Date', 'Customer', 'Item Name', 'Serial/Batch', 'Warranty', 'Problem', 'Technician', 'Est. Amt', 'Status', 'Delivery Date', 'Action'].map((h, i) => <th key={i} className={`px-3 py-2.5 text-left font-medium ${i === 11 ? 'text-center' : ''}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredJobs.map(j => (
                  <tr key={j.no} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                    <td className="px-3 py-2 font-semibold text-[#327F74] cursor-pointer hover:underline" onClick={() => setServiceView('detail')}>{j.no}</td>
                    <td className="px-3 py-2 text-gray-500">{j.date}</td>
                    <td className="px-3 py-2 text-[#1E293B]">{j.customer}</td>
                    <td className="px-3 py-2 text-[#1E293B] max-w-[160px] truncate">{j.item}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{j.serial}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] font-medium ${warrantyColor(j.warranty)}`}>{j.warranty}</span></td>
                    <td className="px-3 py-2 text-gray-500">{j.problem}</td>
                    <td className="px-3 py-2 text-gray-500">{j.tech}</td>
                    <td className="px-3 py-2 text-right">{j.estAmt > 0 ? <CurrencyAmount amount={j.estAmt} /> : '—'}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(j.status)}`}>{j.status}</span></td>
                    <td className="px-3 py-2 text-gray-500">{j.delivery}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setServiceView('detail')} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                        <button className="border border-gray-200 text-gray-500 text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-50">Edit</button>
                        {j.status === 'Ready for Delivery' && <button className="bg-[#F5C742] text-[#1E293B] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#e6b838]">Deliver</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ─ NEW JOB FORM ─ */}
      {serviceView === 'new-job' && (
        <div className="flex-1 overflow-auto">
          {/* Step bar */}
          <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex items-center gap-0 shrink-0 overflow-x-auto">
            {serviceSteps.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0" onClick={() => setServiceJobStep(i + 1)}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${serviceJobStep > i + 1 ? 'bg-[#327F74] text-white' : serviceJobStep === i + 1 ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-100 text-gray-400'}`}>{serviceJobStep > i + 1 ? '✓' : i + 1}</div>
                  <span className={`hidden md:inline text-xs whitespace-nowrap ${serviceJobStep === i + 1 ? 'font-semibold text-[#1E293B]' : 'text-gray-400'}`}>{s}</span>
                </div>
                {i < serviceSteps.length - 1 && <div className="w-6 sm:flex-1 h-px bg-gray-200 mx-1.5 sm:mx-2 shrink-0 sm:shrink" />}
              </React.Fragment>
            ))}
          </div>
          <div className="p-6">
            {/* Step 1: Customer */}
            {serviceJobStep === 1 && (
              <div className="max-w-2xl mx-auto bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">A. Customer Details</p></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[{ l: 'Customer Name', ph: 'Full name' }, { l: 'Mobile Number', ph: '+971 XX XXX XXXX' }, { l: 'Email', ph: 'email@example.com' }, { l: 'Customer Code', ph: 'CUS-XXXXX' }, { l: 'Address', ph: 'Street, City, Emirate' }].map(f => (
                    <div key={f.l} className={f.l === 'Address' ? 'col-span-2' : ''}>
                      <label className="text-xs text-gray-500 block mb-0.5">{f.l}</label>
                      <input placeholder={f.ph} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    </div>
                  ))}
                </div>
                <button className="text-xs text-[#327F74] border border-[#327F74]/30 rounded px-2 py-1 hover:bg-[#327F74]/5 flex items-center gap-1"><Search className="h-3 w-3" />Search Existing Customer</button>
              </div>
            )}
            {/* Step 2: Item & Warranty */}
            {serviceJobStep === 2 && (
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">B. Product / Item Details</p></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[{ l: 'Invoice Number', ph: 'SI-POS-...' }, { l: 'Serial Number', ph: 'SXXXXX-XXXXX' }, { l: 'Batch Number', ph: 'BT-XXXX' }, { l: 'Item Code', ph: 'PRD-...' }, { l: 'Item Name', ph: 'Product name' }, { l: 'Brand', ph: 'Brand name' }, { l: 'Model', ph: 'Model No.' }, { l: 'Category', ph: 'Category' }].map(f => (
                      <div key={f.l}>
                        <label className="text-xs text-gray-500 block mb-0.5">{f.l}</label>
                        <input placeholder={f.ph} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                    ))}
                  </div>
                  <button className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-4 py-2 rounded flex items-center gap-1"><Shield className="h-3.5 w-3.5" />Check Warranty</button>
                </div>
                {/* Warranty result */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-green-800 flex items-center gap-1"><Shield className="h-4 w-4" />Warranty Check Result</p>
                    <span className="text-xs bg-green-100 text-green-700 border border-green-300 rounded px-2 py-0.5">Free Repair Eligible</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                    {[['Warranty Status', 'Under Warranty'], ['Start Date', '12 Mar 2026'], ['Expiry Date', '12 Mar 2027'], ['Warranty Period', '12 Months'], ['Covered', 'Yes'], ['Repair Charge', 'AED 0.00']].map(([k, v]) => (
                      <div key={k} className="flex gap-1"><span className="text-green-600 w-28 shrink-0">{k}:</span><span className="text-green-800 font-medium">{renderAED(v)}</span></div>
                    ))}
                  </div>
                  <p className="text-xs text-green-600 mt-2">1-year manufacturer warranty. Excludes physical/water damage.</p>
                </div>
              </div>
            )}
            {/* Step 3: Problem */}
            {serviceJobStep === 3 && (
              <div className="max-w-2xl mx-auto bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1"><Stethoscope className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">D. Problem / Complaint Details</p></div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Customer Reported Problem</label>
                  <textarea placeholder="Describe the issue..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Problem Category</label>
                    <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option>Select…</option>
                      {['Display issue', 'Battery issue', 'Charging issue', 'Software issue', 'Speaker/mic issue', 'Network issue', 'Camera issue', 'Physical damage', 'Water damage', 'Other'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Physical Condition</label>
                    <input placeholder="Good / Minor scratches / Cracked..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Service Priority</label>
                    <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      <option>Normal</option><option>Urgent</option><option>High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Expected Delivery Date</label>
                    <input type="date" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Accessories Received</p>
                  <div className="flex flex-wrap gap-2">
                    {['Charger', 'Cable', 'Box', 'SIM tray', 'Memory card', 'Cover', 'Other'].map(a => (
                      <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" className="accent-[#327F74]" />{a}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Step 4: Technician & Parts */}
            {serviceJobStep === 4 && (
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 mb-1"><Wrench className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">E. Technician Diagnosis</p></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Technician</label>
                      <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                        <option>Select…</option>
                        {['Mohammed Al-Rashid', 'Rajan Kumar', 'Ali Hassan'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Labour Charge (<DirhamSymbol />)</label>
                      <input type="number" placeholder="0.00" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    </div>
                  </div>
                  {[{ l: 'Problems Found', ph: 'Describe findings...' }, { l: 'Root Cause', ph: 'Identified root cause...' }, { l: 'Recommended Fix', ph: 'Recommended repair steps...' }].map(f => (
                    <div key={f.l}>
                      <label className="text-xs text-gray-500 block mb-0.5">{f.l}</label>
                      <textarea placeholder={f.ph} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><Package className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">F. Parts / Spare Items</p></div>
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Plus className="h-3 w-3" />Add Part</button>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead><tr className="bg-[#F7F7FA] text-gray-500 border-b border-[#327F74]/10">{['Part Code', 'Part Name', 'Stock Avail.', 'Qty', 'Unit Price', 'Disc.', 'VAT', 'Net Amt', ''].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="px-2 py-1.5 text-gray-400 text-[10px]">PRT-0041</td>
                        <td className="px-2 py-1.5 text-[#1E293B]">Display Assembly</td>
                        <td className="px-2 py-1.5"><span className="text-[10px] bg-green-100 text-green-700 rounded px-1">5 avail.</span></td>
                        <td className="px-2 py-1.5"><input type="number" defaultValue={1} className="w-12 border border-[#327F74]/30 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></td>
                        <td className="px-2 py-1.5 text-right"><DirhamSymbol /> 280.00</td>
                        <td className="px-2 py-1.5 text-right">—</td>
                        <td className="px-2 py-1.5 text-right">5%</td>
                        <td className="px-2 py-1.5 text-right font-semibold"><DirhamSymbol /> 294.00</td>
                        <td className="px-2 py-1.5"><button className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button></td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            )}
            {/* Step 5: Estimate */}
            {serviceJobStep === 5 && (
              <div className="max-w-lg mx-auto space-y-4">
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-2">
                  <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">G. Estimate &amp; Customer Approval</p></div>
                  {[['Labour Charge', 'AED 0.00'], ['Parts Total', 'AED 294.00'], ['Discount', '—'], ['VAT (5%)', 'AED 14.70'], ['Total Estimated', 'AED 308.70'], ['Warranty Covered', 'AED 308.70'], ['Customer Payable', 'AED 0.00']].map(([k, v]) => (
                    <div key={k} className={`flex justify-between py-1.5 border-b border-gray-50 last:border-0 ${k === 'Customer Payable' ? 'font-bold text-[#1E293B] border-t-2 border-[#327F74]/20 pt-2' : ''}`}>
                      <span className="text-sm text-gray-500">{k}</span><span className="text-sm">{renderAED(v)}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2">
                  <p className="text-sm font-semibold text-[#1E293B] mb-2">Customer Approval</p>
                  {[['Estimate Shared', 'Yes'], ['Customer Approved', 'Pending'], ['Approval Date', '—']].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs py-1 border-b border-gray-50"><span className="text-gray-500">{k}</span><span className="text-[#1E293B]">{v}</span></div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><CheckCircle className="h-3 w-3" />Mark Approved</button>
                    <button className="border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-50 flex items-center gap-1"><XCircle className="h-3 w-3" />Mark Rejected</button>
                    <button className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Smartphone className="h-3 w-3" />Share Estimate</button>
                  </div>
                </div>
              </div>
            )}
            {/* Step 6: Service Invoice */}
            {serviceJobStep === 6 && (
              <div className="max-w-lg mx-auto space-y-4">
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-2">
                  <div className="flex items-center gap-2 mb-2"><FileText className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">H. Service Invoice</p></div>
                  {[['Service Job No.', '—'], ['Customer', '—'], ['Labour Charge', 'AED 0.00'], ['Parts Amount', 'AED 0.00'], ['VAT', 'AED 0.00'], ['Total Invoice Amount', 'AED 0.00'], ['Warranty Covered', 'AED 0.00'], ['Customer Payable', 'AED 0.00'], ['Advance Paid', 'AED 0.00'], ['Balance Due', 'AED 0.00']].map(([k, v]) => (
                    <div key={k} className={`flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm ${k === 'Customer Payable' ? 'font-bold text-[#327F74]' : ''}`}>
                      <span className="text-gray-500">{k}</span><span>{renderAED(v)}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-3 py-2 rounded flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Generate Invoice</button>
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-3 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print</button>
                    <button className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />Collect Payment</button>
                  </div>
                </div>
              </div>
            )}
            {/* Step 7: Delivery */}
            {serviceJobStep === 7 && (
              <div className="max-w-lg mx-auto space-y-4">
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 mb-1"><Truck className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">I. Delivery / Completion</p></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[{ l: 'Ready for Delivery Date', t: 'date' }, { l: 'Delivered Date', t: 'date' }, { l: 'Delivered By', t: 'text', ph: 'Staff name' }, { l: 'Received By (Customer)', t: 'text', ph: 'Customer name' }].map(f => (
                      <div key={f.l}>
                        <label className="text-xs text-gray-500 block mb-0.5">{f.l}</label>
                        <input type={f.t} placeholder={(f).ph || ''} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Delivery Remarks</label>
                    <textarea placeholder="Any remarks..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Customer Signature</label>
                    <div className="h-16 border border-[#327F74]/30 rounded bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400">Tap to sign</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><PackageCheck className="h-3.5 w-3.5" />Mark Delivered</button>
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-3 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print Delivery Receipt</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Step nav footer */}
          <div className="bg-white border-t border-gray-100 px-3 sm:px-6 py-3 flex flex-wrap justify-between items-center gap-2 shrink-0 sticky bottom-0">
            <div className="flex flex-wrap gap-2">
              {serviceJobStep > 1 && <button onClick={() => setServiceJobStep(s => s - 1)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">← Back</button>}
              <button onClick={() => setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5">Save Draft</button>
              {serviceJobStep < serviceSteps.length ? <button onClick={() => setServiceJobStep(s => s + 1)} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-5 py-2 rounded">Next →</button>
                : <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-5 py-2 rounded flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Complete Job</button>}
            </div>
          </div>
        </div>
      )}

      {/* ─ DETAIL VIEW ─ */}
      {serviceView === 'detail' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 rotate-180" />Back to List</button>
            <span className="text-[#1E293B] font-semibold">Service Job</span>
            <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5">—</span>
            <div className="sm:ml-auto flex flex-wrap gap-2">
              <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print Job Card</button>
              <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-3 py-1.5 rounded flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Create Invoice</button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-0 border-b border-[#327F74]/20 mb-4 overflow-x-auto">
            {detailTabs.map(t => (
              <button key={t} onClick={() => setServiceDetailTab(t)}
                className={`shrink-0 px-4 py-2 text-xs capitalize border-b-2 transition-colors ${serviceDetailTab === t ? 'border-[#F5C742] text-[#1E293B] font-semibold' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {t === 'activity' ? 'Activity Log' : t}
              </button>
            ))}
          </div>
          {serviceDetailTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                <p className="text-sm font-semibold text-[#1E293B] mb-3">Job Timeline</p>
                <div className="space-y-3">
                  {[
                    { label: 'Job Created', time: 'Pending', done: false },
                    { label: 'Warranty Checked', time: 'Pending', done: false },
                    { label: 'Inspection Completed', time: 'Pending', done: false },
                    { label: 'Estimate Shared', time: 'Pending', done: false },
                    { label: 'Customer Approved', time: 'Pending', done: false },
                    { label: 'Repair Started', time: 'Pending', done: false },
                    { label: 'Parts Consumed', time: 'Pending', done: false },
                    { label: 'Invoice Generated', time: 'Pending', done: false },
                    { label: 'Ready for Delivery', time: 'Pending', done: false },
                    { label: 'Delivered', time: 'Pending', done: false },
                  ].map((ev, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ev.done ? 'bg-[#327F74]' : 'bg-gray-100'}`}>
                        {ev.done ? <CheckCircle className="h-3 w-3 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
                      </div>
                      <div><p className={`text-xs ${ev.done ? 'text-[#1E293B] font-medium' : 'text-gray-400'}`}>{ev.label}</p><p className="text-[10px] text-gray-400">{ev.time}</p></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm text-xs space-y-1">
                  <p className="text-sm font-semibold text-[#1E293B] mb-2">Customer &amp; Item</p>
                  {[['Customer', '—'], ['Mobile', '—'], ['Item', '—'], ['Serial', '—'], ['Warranty', '—'], ['Technician', '—'], ['Priority', '—'], ['Expected Delivery', '—']].map(([k, v]) => (
                    <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {serviceDetailTab !== 'overview' && (
            <div className="bg-white border border-[#327F74]/20 rounded-lg p-6 shadow-sm flex items-center justify-center h-48">
              <p className="text-sm text-gray-400 capitalize">{serviceDetailTab} details will appear here</p>
            </div>
          )}
        </div>
      )}

      {/* ─ SETTINGS VIEW ─ */}
      {serviceView === 'settings' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 rotate-180" />Back</button>
            <h1 className="text-xl text-[#1E293B]">Service &amp; Repair Settings</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: '1. Warranty Rules', icon: <Shield className="h-4 w-4 text-[#327F74]" />, fields: ['Default warranty period', 'Warranty by product category', 'Warranty by brand', 'Allow warranty without invoice: Yes/No', 'Warranty validation based on invoice date'] },
              { title: '2. Service Charges', icon: <DollarSign className="h-4 w-4 text-[#327F74]" />, fields: ['Default inspection charge (AED)', 'Default labour charge (AED)', 'Urgent service charge (AED)', 'Minimum repair charge (AED)', 'VAT applicable: Yes/No'] },
              { title: '3. Approval Rules', icon: <CheckCircle className="h-4 w-4 text-[#327F74]" />, fields: ['Manager approval for warranty rejection', 'Customer approval before repair', 'Approval required for high-value parts', 'Approval required for free repair without invoice'] },
              { title: '4. Inventory Consumption', icon: <Package className="h-4 w-4 text-[#327F74]" />, fields: ['Consume parts on estimate approval', 'Consume parts on invoice confirmation', 'Consume parts on delivery', 'Allow negative stock: Yes/No', 'Default warehouse for service parts'] },
              { title: '5. Print Templates', icon: <Printer className="h-4 w-4 text-[#327F74]" />, fields: ['Job card template', 'Estimate receipt template', 'Service invoice template', 'Delivery receipt template', 'Warranty receipt template'] },
              { title: '6. Notification Settings', icon: <Smartphone className="h-4 w-4 text-[#327F74]" />, fields: ['SMS/WhatsApp when job created', 'Estimate shared notification', 'Customer approval received', 'Ready for delivery alert', 'Delivered confirmation'] },
            ].map(section => (
              <div key={section.title} className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">{section.icon}<p className="text-sm font-semibold text-[#1E293B]">{section.title}</p></div>
                <div className="space-y-2">
                  {section.fields.map(f => (
                    <div key={f} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-600">{f}</span>
                      {f.includes('Yes/No') || f.includes('Yes / No') ? (
                        <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-[#327F74]"><span className="inline-block h-4 w-4 rounded-full bg-white translate-x-4" /></div>
                      ) : (
                        <input placeholder="—" className="border border-[#327F74]/20 rounded px-2 py-0.5 text-xs w-28 text-right focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
            <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-5 py-2 rounded flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Save Settings</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceRepair;
