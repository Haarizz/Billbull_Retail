import fs from 'node:fs';
import path from 'node:path';
import React, { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  AlertCircle, CheckCircle, ChevronRight, ClipboardList, DollarSign, FileText, Package, PackageCheck, Plus, Printer,
  RotateCcw, Search, Settings, Shield, Smartphone, Stethoscope, Trash2, Truck, Users, Wrench, X, XCircle,
} from 'lucide-react';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CurrencyAmount, DirhamSymbol, renderAED } from '../POSCurrency';
import ServiceRepair from '../features/service/ServiceRepair';

const traverse = traverseModule.default || traverseModule;

/**
 * CHARACTERIZATION — the POSSales.jsx "Service & Repair Management" screen.
 *
 * Pre-extraction region: POSSales.jsx:10380–10854 (475 lines) — the
 * `{/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── *\/}` anchor, then `{showServiceRepair && (() => { ... })()}`.
 * An IIFE that declares mockJobs / statusColor / warrantyColor / filteredJobs / kpis / serviceSteps /
 * detailTabs, then returns ONE hand-rolled full-screen fixed overlay (no Radix Dialog, no portal) with a
 * top bar and four mutually exclusive views: list, new-job, detail, settings. Conditionally MOUNTED:
 * closing unmounts the tree, so every uncontrolled form field loses its value. Siblings: the Serial/Batch
 * modal above, the POS Configure & Customize Panel below.
 *
 * The region is now rendered by POS/features/service/ServiceRepair.jsx. The extraction is a presentation move
 * only: all five Service & Repair useState declarations (and setters) and the `showServiceRepair &&` mount
 * condition stay in POSSales. The child receives exactly the 10 state bindings under their ORIGINAL POSSales
 * names. Only the Stethoscope icon import left POSSales (it had no other POSSales use).
 *
 * Two harnesses; every behavioural describe runs against BOTH:
 *   - `ServiceRepairHarness` (reference): the PRE-EXTRACTION region copied VERBATIM (REGION markers),
 *   - `ExtractedServiceRepairHarness`: the POSSales call site copied VERBATIM (CALLSITE markers).
 * A DOM-parity block renders both side by side through every view / step / tab and compares the HTML.
 * Both harnesses reproduce the parent side exactly: the five useState declarations copied VERBATIM (STATE
 * markers) and the Serial/Batch "Create Service Job" onClick copied verbatim as the ONLY live opener.
 *
 * Direct dependency surface (9 POSSales bindings, derived from the parsed region):
 *   POSSales useState:  setShowServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep,
 *                       serviceDetailTab, setServiceDetailTab, serviceJobFilter, setServiceJobFilter
 *                       (showServiceRepair is only the mount guard; the body never reads it)
 *   module imports:     React (React.Fragment), CurrencyAmount, DirhamSymbol, renderAED (POSCurrency),
 *                       22 lucide icons
 *   globals:            none
 * No API, no hook, no context, no ref, no effect.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - `mockJobs` is `[]`: the table body is always empty, every KPI is '—', and the row actions
 *     (row click / View → detail, Edit, Deliver) are unreachable from the UI.
 *   - The detail view is therefore reachable only by a parent write of serviceView = 'detail'.
 *   - Inert buttons (no onClick): filter Search, Search Existing Customer, Check Warranty, Add Part, the part
 *     row delete, Mark Approved, Mark Rejected, Share Estimate, Generate Invoice, Print, Collect Payment,
 *     Mark Delivered, Print Delivery Receipt, Save Draft, Complete Job, Print Job Card, Create Invoice,
 *     settings Cancel, Save Settings.
 *   - Every form field in new-job and settings is uncontrolled and unnamed: values vanish when the step
 *     changes (the step block unmounts) and when the screen closes.
 *   - Close (POS / X) does NOT reset view, step, tab or filter; a raw reopen shows the previous view.
 *     Only "New Service Job" and the Serial/Batch opener reset the step to 1.
 *   - Cancel / Back / Back to List return to 'list' without resetting step, tab or filter.
 *   - Clicking any step in the step bar jumps straight to it (no validation).
 *   - Settings Yes/No switches are static decorative markup (always "on"), not inputs.
 *   - POSTouchScreen destructures setShowServiceRepair / setServiceView but never calls them.
 */

// ── harness ─────────────────────────────────────────────────────────────────────────────
function ParentProbes({
  showServiceRepair, setShowServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep,
  serviceDetailTab, setServiceDetailTab, serviceJobFilter, setShowSerialBatch, showSerialBatch, bump,
}) {
  return (
    <div data-testid="probes">
      {/* the Serial/Batch "Create Service Job" onClick, verbatim */}
      <button data-testid="sb-create" onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }}>sb</button>
      <button data-testid="raw-open" onClick={() => setShowServiceRepair(true)}>raw-open</button>
      <button data-testid="raw-close" onClick={() => setShowServiceRepair(false)}>raw-close</button>
      <button data-testid="raw-detail" onClick={() => setServiceView('detail')}>raw-detail</button>
      <button data-testid="raw-tab-parts" onClick={() => setServiceDetailTab('parts')}>raw-tab</button>
      <button data-testid="bump" onClick={bump}>bump</button>
      <span data-testid="probe-show">{String(showServiceRepair)}</span>
      <span data-testid="probe-view">{serviceView}</span>
      <span data-testid="probe-step">{String(serviceJobStep)}</span>
      <span data-testid="probe-tab">{serviceDetailTab}</span>
      <span data-testid="probe-filter">{JSON.stringify(serviceJobFilter)}</span>
      <span data-testid="probe-serial">{String(showSerialBatch)}</span>
    </div>
  );
}

// ── reference: the POSSales region, verbatim ────────────────────────────────────────────
function ServiceRepairHarness() {
  const [showSerialBatch, setShowSerialBatch] = useState(true);
  // STATE-VERBATIM-START
  // Service & Repair view
  const [showServiceRepair, setShowServiceRepair] = useState(false);
  const [serviceView, setServiceView] = useState('list');
  const [serviceJobStep, setServiceJobStep] = useState(1);
  const [serviceDetailTab, setServiceDetailTab] = useState('overview');
  const [serviceJobFilter, setServiceJobFilter] = useState({ status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' });
  // STATE-VERBATIM-END
  const [, setTick] = useState(0);

  return (
    <div data-testid="pos-root">
      <ParentProbes
        {...{ showServiceRepair, setShowServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep,
          serviceDetailTab, setServiceDetailTab, serviceJobFilter, setShowSerialBatch, showSerialBatch }}
        bump={() => setTick((t) => t + 1)}
      />
      {/* REGION-VERBATIM-START */}
      {/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}
      {showServiceRepair && (() => {
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
      })()}
      {/* REGION-VERBATIM-END */}
    </div>
  );
}

// ── extracted: the POSSales call site, verbatim, rendering the shipped ServiceRepair ────────
function ExtractedServiceRepairHarness() {
  const [showSerialBatch, setShowSerialBatch] = useState(true);
  // Service & Repair view
  const [showServiceRepair, setShowServiceRepair] = useState(false);
  const [serviceView, setServiceView] = useState('list');
  const [serviceJobStep, setServiceJobStep] = useState(1);
  const [serviceDetailTab, setServiceDetailTab] = useState('overview');
  const [serviceJobFilter, setServiceJobFilter] = useState({ status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' });
  const [, setTick] = useState(0);

  return (
    <div data-testid="pos-root">
      <ParentProbes
        {...{ showServiceRepair, setShowServiceRepair, serviceView, setServiceView, serviceJobStep, setServiceJobStep,
          serviceDetailTab, setServiceDetailTab, serviceJobFilter, setShowSerialBatch, showSerialBatch }}
        bump={() => setTick((t) => t + 1)}
      />
      {/* CALLSITE-VERBATIM-START */}
      {/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}
      {showServiceRepair && (
        <ServiceRepair
          showServiceRepair={showServiceRepair}
          setShowServiceRepair={setShowServiceRepair}
          serviceView={serviceView}
          setServiceView={setServiceView}
          serviceJobStep={serviceJobStep}
          setServiceJobStep={setServiceJobStep}
          serviceDetailTab={serviceDetailTab}
          setServiceDetailTab={setServiceDetailTab}
          serviceJobFilter={serviceJobFilter}
          setServiceJobFilter={setServiceJobFilter}
        />
      )}
      {/* CALLSITE-VERBATIM-END */}
    </div>
  );
}

const HARNESSES = { reference: ServiceRepairHarness, extracted: ExtractedServiceRepairHarness };
let Harness = ServiceRepairHarness;

// ── fixtures / helpers ──────────────────────────────────────────────────────────────────
const TITLE = 'Service & Repair Management';
const DEFAULT_FILTER = { status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' };
const STEPS = ['Customer Details', 'Item & Warranty', 'Problem Details', 'Technician & Parts', 'Estimate', 'Service Invoice', 'Delivery'];
const STEP_HEADINGS = ['A. Customer Details', 'B. Product / Item Details', 'D. Problem / Complaint Details',
  'E. Technician Diagnosis', 'G. Estimate & Customer Approval', 'H. Service Invoice', 'I. Delivery / Completion'];
const TABS = ['overview', 'warranty', 'diagnosis', 'parts', 'estimate', 'invoice', 'payments', 'delivery', 'Activity Log'];

const renderHarness = () => render(<Harness />);
const probe = (id) => screen.getByTestId(`probe-${id}`).textContent;
const probes = () => screen.getByTestId('probes').textContent;
const click = (id) => fireEvent.click(screen.getByTestId(id));
const overlay = () => screen.getByTestId('pos-root').querySelector(':scope > .fixed');
const topBar = () => overlay().children[0];
const view = () => overlay().children[1];
const topButtons = () => [...topBar().querySelectorAll('button')];
const btn = (name) => within(overlay()).getByRole('button', { name });
const qbtn = (name) => within(overlay()).queryByRole('button', { name });
const icons = (root) => [...root.querySelectorAll('svg.lucide')].map((s) => [...s.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide-icon'));
const openList = () => { renderHarness(); click('raw-open'); };
const openNewJob = () => { renderHarness(); click('sb-create'); };
const stepBar = () => view().children[0];
const goStep = (n) => fireEvent.click(stepBar().querySelectorAll('.cursor-pointer')[n - 1]);
const aedHtml = (v) => { const { container, unmount } = render(<span>{renderAED(v)}</span>); const h = container.innerHTML; unmount(); return h; };

/** Clicks the button and asserts nothing observable in the parent or the view changed. */
const expectInert = (name) => {
  const before = probes();
  const html = overlay().innerHTML;
  fireEvent.click(btn(name));
  expect(probes(), name).toBe(before);
  expect(overlay().innerHTML, name).toBe(html);
};

afterEach(() => { cleanup(); });

describe.each(Object.keys(HARNESSES).map((k) => [k]))('%s', (variant) => {
  beforeEach(() => { Harness = HARNESSES[variant]; });

  describe('closed / open', () => {
    it('renders nothing while closed, with the parent defaults', () => {
      renderHarness();
      expect(overlay()).toBeNull();
      expect(screen.queryByText(TITLE)).toBeNull();
      expect(probe('show')).toBe('false');
      expect(probe('view')).toBe('list');
      expect(probe('step')).toBe('1');
      expect(probe('tab')).toBe('overview');
      expect(JSON.parse(probe('filter'))).toEqual(DEFAULT_FILTER);
    });

    it('is a plain full-screen fixed overlay mounted inline: top bar + exactly one view', () => {
      openList();
      const o = overlay();
      expect(o.className).toBe('fixed inset-0 z-50 flex flex-col bg-[#F7F7FA]');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(o.children).toHaveLength(2);
      expect(topBar().className).toBe('bg-[#1E293B] border-b border-[#327F74]/30 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0');
      expect(view().className).toBe('flex-1 overflow-auto p-6');
    });

    it('the Serial/Batch opener closes Serial/Batch and opens the new-job view at step 1', () => {
      renderHarness();
      click('sb-create');
      expect(probe('serial')).toBe('false');
      expect(probe('show')).toBe('true');
      expect(probe('view')).toBe('new-job');
      expect(probe('step')).toBe('1');
      expect(screen.getByText('A. Customer Details')).toBeTruthy();
    });

    it('the Serial/Batch opener resets a previously advanced step', () => {
      openNewJob();
      fireEvent.click(btn('Next →'));
      fireEvent.click(btn('Next →'));
      expect(probe('step')).toBe('3');
      click('raw-close');
      click('sb-create');
      expect(probe('step')).toBe('1');
    });

    it('the POS back button closes and unmounts, keeping view/step/tab/filter', () => {
      openNewJob();
      fireEvent.click(btn('Next →'));
      fireEvent.click(topButtons()[0]);
      expect(probe('show')).toBe('false');
      expect(overlay()).toBeNull();
      expect(probe('view')).toBe('new-job');
      expect(probe('step')).toBe('2');
    });

    it('the X button closes; a raw reopen shows the retained view and step', () => {
      openNewJob();
      goStep(4);
      const buttons = topButtons();
      fireEvent.click(buttons[buttons.length - 1]);
      expect(overlay()).toBeNull();
      click('raw-open');
      expect(screen.getByText('E. Technician Diagnosis')).toBeTruthy();
    });

    it('closing drops uncontrolled field values', () => {
      openNewJob();
      const name = screen.getByPlaceholderText('Full name');
      fireEvent.change(name, { target: { value: 'Ahmed' } });
      expect(name.value).toBe('Ahmed');
      click('raw-close');
      click('raw-open');
      expect(screen.getByPlaceholderText('Full name').value).toBe('');
    });
  });

  describe('top bar', () => {
    it('list view: POS, breadcrumb title, New Service Job, Settings, X', () => {
      openList();
      expect(topButtons().map((b) => b.textContent)).toEqual(['POS', 'New Service Job', 'Settings', '']);
      expect(within(topBar()).getByText(TITLE).className).toBe('truncate');
      expect(icons(topBar())).toEqual(['lucide-chevron-right', 'lucide-wrench', 'lucide-plus', 'lucide-settings', 'lucide-x']);
    });

    it('new-job view hides New Service Job; settings view hides Settings; detail shows both', () => {
      openNewJob();
      expect(topButtons().map((b) => b.textContent)).toEqual(['POS', 'Settings', '']);
      fireEvent.click(btn('Settings'));
      expect(probe('view')).toBe('settings');
      expect(topButtons().map((b) => b.textContent)).toEqual(['POS', 'New Service Job', '']);
      click('raw-detail');
      expect(topButtons().map((b) => b.textContent).slice(0, 4)).toEqual(['POS', 'New Service Job', 'Settings', '']);
    });

    it('New Service Job switches to new-job and resets the step to 1', () => {
      openNewJob();
      goStep(5);
      fireEvent.click(btn('Settings'));
      fireEvent.click(btn('New Service Job'));
      expect(probe('view')).toBe('new-job');
      expect(probe('step')).toBe('1');
    });
  });

  describe('list view', () => {
    it('renders the heading, 7 placeholder KPIs, filters and an empty 12-column table', () => {
      openList();
      expect(within(view()).getByRole('heading', { level: 1 }).textContent).toBe(TITLE);
      expect(screen.getByText(/^Manage warranty checks, repair intake/)).toBeTruthy();
      const kpiGrid = view().children[1];
      expect([...kpiGrid.children].map((c) => c.textContent)).toEqual([
        'Open Jobs—', 'Under Warranty—', 'Pending Approval—', 'Ready for Delivery—', 'Delivered Today—', 'Chargeable—', 'Parts Value—',
      ]);
      expect(icons(kpiGrid)).toEqual(['lucide-clipboard-list', 'lucide-shield', 'lucide-circle-alert', 'lucide-package-check', 'lucide-truck', 'lucide-dollar-sign', 'lucide-package']);
      const table = within(view()).getByRole('table');
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
        'Job No.', 'Job Date', 'Customer', 'Item Name', 'Serial/Batch', 'Warranty', 'Problem', 'Technician', 'Est. Amt', 'Status', 'Delivery Date', 'Action',
      ]);
      expect(table.querySelector('tbody').children).toHaveLength(0);
      expect(qbtn('View')).toBeNull();
      expect(qbtn('Edit')).toBeNull();
      expect(qbtn('Deliver')).toBeNull();
    });

    it('filter fields: four text inputs and the status / warranty selects', () => {
      openList();
      const inputs = [...view().querySelectorAll('input')];
      expect(inputs.map((i) => i.placeholder)).toEqual(['SRV-...', 'Name / Mobile', 'Serial No.', 'Name']);
      const [status, warranty] = view().querySelectorAll('select');
      expect([...status.options].map((o) => o.textContent)).toEqual(['All', 'New', 'Inspection Pending', 'Under Warranty', 'Warranty Rejected',
        'Waiting for Parts', 'Estimate Shared', 'Pending Customer Approval', 'Approved', 'In Repair', 'Ready for Delivery', 'Delivered', 'Cancelled']);
      expect([...warranty.options].map((o) => o.textContent)).toEqual(['All', 'Under Warranty', 'Warranty Expired', 'No Warranty', 'Warranty Rejected']);
      expect(status.value).toBe('All');
      expect(warranty.value).toBe('All');
    });

    it('typing / selecting writes serviceJobFilter by key, preserving the other keys; the table stays empty', () => {
      openList();
      const [jobNo, customer, serial, tech] = view().querySelectorAll('input');
      fireEvent.change(jobNo, { target: { value: 'SRV-1' } });
      fireEvent.change(customer, { target: { value: 'Ali' } });
      fireEvent.change(serial, { target: { value: 'SN9' } });
      fireEvent.change(tech, { target: { value: 'Raj' } });
      const [status, warranty] = view().querySelectorAll('select');
      fireEvent.change(status, { target: { value: 'In Repair' } });
      fireEvent.change(warranty, { target: { value: 'No Warranty' } });
      expect(JSON.parse(probe('filter'))).toEqual({ status: 'In Repair', customer: 'Ali', jobNo: 'SRV-1', serial: 'SN9', technician: 'Raj', warranty: 'No Warranty' });
      expect(probe('filter')).toBe('{"status":"In Repair","customer":"Ali","jobNo":"SRV-1","serial":"SN9","technician":"Raj","warranty":"No Warranty"}');
      expect(jobNo.value).toBe('SRV-1');
      expect(view().querySelector('tbody').children).toHaveLength(0);
    });

    it('filter Search is inert; Reset restores the defaults (in the default key order)', () => {
      openList();
      fireEvent.change(view().querySelectorAll('input')[1], { target: { value: 'Ali' } });
      expectInert('Search');
      fireEvent.click(btn('Reset'));
      expect(probe('filter')).toBe('{"status":"All","customer":"","jobNo":"","serial":"","technician":"","warranty":"All"}');
      expect(view().querySelectorAll('input')[1].value).toBe('');
    });

    it('the filter survives view changes and close/reopen', () => {
      openList();
      fireEvent.change(view().querySelectorAll('input')[0], { target: { value: 'X1' } });
      fireEvent.click(btn('Settings'));
      fireEvent.click(btn('Back'));
      click('raw-close');
      click('raw-open');
      expect(view().querySelectorAll('input')[0].value).toBe('X1');
    });
  });

  describe('new-job view', () => {
    it('renders the 7-step bar with step 1 current and six connectors', () => {
      openNewJob();
      expect(view().className).toBe('flex-1 overflow-auto');
      const items = stepBar().querySelectorAll('.cursor-pointer');
      expect([...items].map((i) => i.textContent)).toEqual(STEPS.map((s, i) => `${i + 1}${s}`));
      expect(stepBar().querySelectorAll('.h-px')).toHaveLength(6);
      expect(items[0].firstChild.className).toContain('bg-[#F5C742] text-[#1E293B]');
      expect(items[1].firstChild.className).toContain('bg-gray-100 text-gray-400');
    });

    it('Next walks every step; completed steps show ✓; the last step swaps Next for Complete Job', () => {
      openNewJob();
      for (let n = 1; n <= 7; n += 1) {
        expect(probe('step')).toBe(String(n));
        expect(screen.getByText(STEP_HEADINGS[n - 1])).toBeTruthy();
        STEP_HEADINGS.filter((_, i) => i !== n - 1).forEach((h) => expect(screen.queryByText(h)).toBeNull());
        const circles = [...stepBar().querySelectorAll('.cursor-pointer')].map((i) => i.firstChild.textContent);
        expect(circles).toEqual(STEPS.map((_, i) => (i + 1 < n ? '✓' : String(i + 1))));
        if (n < 7) fireEvent.click(btn('Next →'));
      }
      expect(qbtn('Next →')).toBeNull();
      expect(qbtn('Complete Job')).toBeTruthy();
    });

    it('Back is hidden on step 1 and decrements otherwise; step-bar clicks jump directly', () => {
      openNewJob();
      expect(qbtn('← Back')).toBeNull();
      goStep(6);
      expect(probe('step')).toBe('6');
      fireEvent.click(btn('← Back'));
      expect(probe('step')).toBe('5');
      goStep(1);
      expect(probe('step')).toBe('1');
      expect(qbtn('← Back')).toBeNull();
    });

    it('Cancel returns to list without resetting the step', () => {
      openNewJob();
      goStep(3);
      fireEvent.click(btn('Cancel'));
      expect(probe('view')).toBe('list');
      expect(probe('step')).toBe('3');
    });

    it('uncontrolled fields reset when their step unmounts', () => {
      openNewJob();
      fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'Sara' } });
      fireEvent.click(btn('Next →'));
      fireEvent.click(btn('← Back'));
      expect(screen.getByPlaceholderText('Full name').value).toBe('');
    });

    it('an unrelated parent rerender keeps the uncontrolled field node and value', () => {
      openNewJob();
      const input = screen.getByPlaceholderText('Full name');
      fireEvent.change(input, { target: { value: 'Omar' } });
      click('bump');
      expect(screen.getByPlaceholderText('Full name')).toBe(input);
      expect(input.value).toBe('Omar');
    });

    it('step 1: customer fields and inert Search Existing Customer', () => {
      openNewJob();
      expect([...view().querySelectorAll('input')].map((i) => i.placeholder)).toEqual(['Full name', '+971 XX XXX XXXX', 'email@example.com', 'CUS-XXXXX', 'Street, City, Emirate']);
      expect(screen.getByPlaceholderText('Street, City, Emirate').parentElement.className).toBe('col-span-2');
      expectInert('Search Existing Customer');
      expectInert('Save Draft');
    });

    it('step 2: item fields, inert Check Warranty and the hard-coded warranty result through renderAED', () => {
      openNewJob();
      goStep(2);
      expect([...view().querySelectorAll('input')].map((i) => i.placeholder)).toEqual(['SI-POS-...', 'SXXXXX-XXXXX', 'BT-XXXX', 'PRD-...', 'Product name', 'Brand name', 'Model No.', 'Category']);
      expectInert('Check Warranty');
      expect(screen.getByText('Free Repair Eligible')).toBeTruthy();
      const rows = [...screen.getByText('Warranty Check Result').closest('.bg-green-50').querySelector('.grid').children];
      expect(rows.map((r) => r.firstChild.textContent)).toEqual(['Warranty Status:', 'Start Date:', 'Expiry Date:', 'Warranty Period:', 'Covered:', 'Repair Charge:']);
      expect(rows.map((r) => r.lastChild.textContent).slice(0, 5)).toEqual(['Under Warranty', '12 Mar 2026', '12 Mar 2027', '12 Months', 'Yes']);
      expect(rows[5].lastChild.innerHTML).toBe(aedHtml('AED 0.00').replace(/^<span>|<\/span>$/g, ''));
      expect(screen.getByText('1-year manufacturer warranty. Excludes physical/water damage.')).toBeTruthy();
    });

    it('step 3: problem fields, category / priority options and seven accessory checkboxes', () => {
      openNewJob();
      goStep(3);
      const [category, priority] = view().querySelectorAll('select');
      expect([...category.options].map((o) => o.textContent)).toEqual(['Select…', 'Display issue', 'Battery issue', 'Charging issue', 'Software issue',
        'Speaker/mic issue', 'Network issue', 'Camera issue', 'Physical damage', 'Water damage', 'Other']);
      expect([...priority.options].map((o) => o.textContent)).toEqual(['Normal', 'Urgent', 'High']);
      expect(view().querySelector('input[type="date"]')).toBeTruthy();
      expect([...view().querySelectorAll('input[type="checkbox"]')].map((c) => c.parentElement.textContent)).toEqual(['Charger', 'Cable', 'Box', 'SIM tray', 'Memory card', 'Cover', 'Other']);
      expect(icons(view())).toContain('lucide-stethoscope');
    });

    it('step 4: technicians, the hard-coded part row and inert Add Part / delete', () => {
      openNewJob();
      goStep(4);
      expect([...view().querySelector('select').options].map((o) => o.textContent)).toEqual(['Select…', 'Mohammed Al-Rashid', 'Rajan Kumar', 'Ali Hassan']);
      expect(screen.getByText(/^Labour Charge \(/).querySelector('.bb-aed-symbol')).toBeTruthy();
      const row = within(view()).getAllByRole('table')[0].querySelector('tbody tr');
      expect([...row.children].map((c) => c.textContent.trim())).toEqual(['PRT-0041', 'Display Assembly', '5 avail.', '', '280.00', '—', '5%', '294.00', '']);
      expect(row.querySelector('input').value).toBe('1');
      expectInert('Add Part');
      const html = overlay().innerHTML;
      fireEvent.click(row.lastChild.querySelector('button'));
      expect(overlay().innerHTML).toBe(html);
    });

    it('step 5: estimate rows via renderAED and inert approval buttons', () => {
      openNewJob();
      goStep(5);
      const card = screen.getByText('G. Estimate & Customer Approval').closest('.bg-white');
      const rows = [...card.querySelectorAll('.justify-between')];
      expect(rows.map((r) => r.firstChild.textContent)).toEqual(['Labour Charge', 'Parts Total', 'Discount', 'VAT (5%)', 'Total Estimated', 'Warranty Covered', 'Customer Payable']);
      expect(rows[1].lastChild.innerHTML).toBe(aedHtml('AED 294.00').replace(/^<span>|<\/span>$/g, ''));
      expect(rows[2].lastChild.textContent).toBe('—');
      expect(rows[6].className).toContain('font-bold');
      ['Mark Approved', 'Mark Rejected', 'Share Estimate'].forEach(expectInert);
    });

    it('step 6: invoice rows and inert Generate Invoice / Print / Collect Payment', () => {
      openNewJob();
      goStep(6);
      const card = screen.getByText('H. Service Invoice').closest('.bg-white');
      expect([...card.querySelectorAll('.justify-between')].map((r) => r.firstChild.textContent)).toEqual(['Service Job No.', 'Customer', 'Labour Charge', 'Parts Amount', 'VAT',
        'Total Invoice Amount', 'Warranty Covered', 'Customer Payable', 'Advance Paid', 'Balance Due']);
      ['Generate Invoice', 'Print', 'Collect Payment'].forEach(expectInert);
    });

    it('step 7: delivery fields and inert Mark Delivered / Print Delivery Receipt / Complete Job', () => {
      openNewJob();
      goStep(7);
      expect([...view().querySelectorAll('input')].map((i) => `${i.type}:${i.placeholder}`)).toEqual(['date:', 'date:', 'text:Staff name', 'text:Customer name']);
      expect(screen.getByText('Tap to sign')).toBeTruthy();
      ['Mark Delivered', 'Print Delivery Receipt', 'Complete Job', 'Save Draft'].forEach(expectInert);
    });
  });

  describe('detail view (parent-write only)', () => {
    it('renders the header, nine tabs and the overview with a 10-step pending timeline', () => {
      openList();
      click('raw-detail');
      expect(screen.getByText('Service Job')).toBeTruthy();
      const tabs = view().children[1];
      expect([...tabs.children].map((t) => t.textContent)).toEqual(TABS);
      expect(tabs.children[0].className).toContain('border-[#F5C742]');
      const timeline = screen.getByText('Job Timeline').nextSibling;
      expect(timeline.children).toHaveLength(10);
      expect(within(timeline).getAllByText('Pending')).toHaveLength(10);
      const info = screen.getByText('Customer & Item').parentElement;
      expect([...info.querySelectorAll('.flex.gap-2')].map((r) => r.textContent)).toEqual(['Customer:—', 'Mobile:—', 'Item:—', 'Serial:—', 'Warranty:—', 'Technician:—', 'Priority:—', 'Expected Delivery:—']);
      ['Print Job Card', 'Create Invoice'].forEach(expectInert);
    });

    it('tabs write serviceDetailTab; non-overview tabs show the placeholder', () => {
      openList();
      click('raw-detail');
      fireEvent.click(btn('Activity Log'));
      expect(probe('tab')).toBe('activity');
      expect(screen.getByText('activity details will appear here')).toBeTruthy();
      fireEvent.click(btn('warranty'));
      expect(probe('tab')).toBe('warranty');
      expect(screen.queryByText('Job Timeline')).toBeNull();
      expect(screen.getByText('warranty details will appear here')).toBeTruthy();
      fireEvent.click(btn('overview'));
      expect(screen.getByText('Job Timeline')).toBeTruthy();
    });

    it('Back to List returns to list and keeps the tab', () => {
      openList();
      click('raw-detail');
      click('raw-tab-parts');
      fireEvent.click(btn('Back to List'));
      expect(probe('view')).toBe('list');
      expect(probe('tab')).toBe('parts');
      click('raw-detail');
      expect(screen.getByText('parts details will appear here')).toBeTruthy();
    });
  });

  describe('settings view', () => {
    it('renders six sections; Yes/No fields are static switches, the rest inputs', () => {
      openList();
      fireEvent.click(btn('Settings'));
      expect(within(view()).getByRole('heading', { level: 1 }).textContent).toBe('Service & Repair Settings');
      const grid = view().children[1];
      expect([...grid.children].map((s) => s.querySelector('p').textContent)).toEqual(['1. Warranty Rules', '2. Service Charges', '3. Approval Rules',
        '4. Inventory Consumption', '5. Print Templates', '6. Notification Settings']);
      expect(icons(grid)).toEqual(['lucide-shield', 'lucide-dollar-sign', 'lucide-circle-check-big', 'lucide-package', 'lucide-printer', 'lucide-smartphone']);
      expect(grid.querySelectorAll('.justify-between')).toHaveLength(29);
      expect(grid.querySelectorAll('input')).toHaveLength(26);
      expect(grid.querySelectorAll('.rounded-full.bg-\\[\\#327F74\\]')).toHaveLength(3);
      expect(grid.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    });

    it('Cancel and Save Settings are inert; Back returns to list', () => {
      openList();
      fireEvent.click(btn('Settings'));
      ['Cancel', 'Save Settings'].forEach(expectInert);
      fireEvent.click(btn('Back'));
      expect(probe('view')).toBe('list');
    });
  });
});

// ── DOM parity: reference and extracted rendered together, driven through the same script ─────
describe('DOM parity (reference vs extracted)', () => {
  it('identical markup for closed, filtered list, every step, every detail tab, settings and reset', () => {
    const roots = [render(<ServiceRepairHarness />).container, render(<ExtractedServiceRepairHarness />).container];
    const each = (fn) => roots.forEach((r) => fn(within(r), r));
    const same = () => expect(roots[0].innerHTML).toBe(roots[1].innerHTML);
    const press = (name) => each((w) => fireEvent.click(w.getByRole('button', { name })));
    const pressId = (id) => each((w) => fireEvent.click(w.getByTestId(id)));

    same();
    pressId('raw-open');
    same();
    each((w, r) => fireEvent.change(r.querySelectorAll('.fixed input')[0], { target: { value: 'SRV' } }));
    each((w, r) => fireEvent.change(r.querySelectorAll('.fixed select')[0], { target: { value: 'Approved' } }));
    same();
    pressId('sb-create');
    for (let n = 1; n <= 7; n += 1) {
      same();
      if (n < 7) press('Next →');
    }
    press('← Back');
    same();
    pressId('raw-detail');
    same();
    TABS.forEach((name) => { press(name); same(); });
    press('Settings');
    same();
    press('Back');
    press('Reset');
    same();
    pressId('raw-close');
    same();
  });
});

// ── source contract ───────────────────────────────────────────────────────────────────────
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

/** Free (unbound) identifiers of a JSX/JS snippet, via Babel scope analysis. */
const freeIdentifiers = (code) => {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const out = new Set();
  traverse(ast, {
    ReferencedIdentifier(p) {
      const { name } = p.node;
      if (p.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      if (!p.scope.hasBinding(name, true)) out.add(name);
    },
  });
  return [...out].sort();
};

describe('source contract', () => {
  const PARENT = read('../../POSSales.jsx');
  const CHILD = read('../features/service/ServiceRepair.jsx');
  // the child with its header comment stripped, for scans that must ignore prose
  const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
  const TEST = read('./ServiceRepair.characterization.test.jsx');
  const TOUCH = read('../POSTouchScreen.jsx');
  const TRADE = read('../TradePOS/TradePOSTouchScreen.jsx');
  const CONSOLE = read('../POSConsole.jsx');
  const LINES = PARENT.split('\n');
  const ANCHOR = '      {/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}';
  const NEXT_ANCHOR = '      {/* POS Configure & Customize Panel */}';

  const between = (text, a, b) => {
    const i = text.indexOf(a);
    const j = text.indexOf(b, i);
    return text.slice(text.indexOf('\n', i) + 1, text.lastIndexOf('\n', j));
  };
  const REGION = between(TEST, '{/* REGION-VERBATIM-START */}', '{/* REGION-VERBATIM-END */}');
  const STATE = between(TEST, '// STATE-VERBATIM-START', '// STATE-VERBATIM-END');
  const CALLSITE = between(TEST, '{/* CALLSITE-VERBATIM-START */}', '{/* CALLSITE-VERBATIM-END */}');
  const IIFE_BODY = REGION.split('\n').slice(2, -1);
  const SIGNATURE_END = '\n}) {\n';
  const CHILD_BODY = CHILD.slice(CHILD.indexOf(SIGNATURE_END) + SIGNATURE_END.length, CHILD.lastIndexOf('\n}\n\nexport default ServiceRepair;'));
  const start = LINES.indexOf(ANCHOR);
  const end = LINES.indexOf('      )}', start);
  const PARENT_CALLSITE = LINES.slice(start, end + 1).join('\n');
  const count = (src, s) => src.split(s).length - 1;

  const OWN_STATE = ['showServiceRepair', 'setShowServiceRepair', 'serviceView', 'setServiceView', 'serviceJobStep',
    'setServiceJobStep', 'serviceDetailTab', 'setServiceDetailTab', 'serviceJobFilter', 'setServiceJobFilter'];
  const REGION_BINDINGS = OWN_STATE.filter((n) => n !== 'showServiceRepair');
  const ICONS = ['AlertCircle', 'CheckCircle', 'ChevronRight', 'ClipboardList', 'DollarSign', 'FileText', 'Package', 'PackageCheck',
    'Plus', 'Printer', 'RotateCcw', 'Search', 'Settings', 'Shield', 'Smartphone', 'Stethoscope', 'Trash2', 'Truck', 'Users', 'Wrench', 'X', 'XCircle'];
  const MODULE = ['React', 'CurrencyAmount', 'DirhamSymbol', 'renderAED', ...ICONS];
  const PROPS = ['showServiceRepair', 'setShowServiceRepair', 'serviceView', 'setServiceView', 'serviceJobStep',
    'setServiceJobStep', 'serviceDetailTab', 'setServiceDetailTab', 'serviceJobFilter', 'setServiceJobFilter'];

  it('pins the exact call-site boundaries, size and siblings', () => {
    expect(count(PARENT, 'SERVICE & REPAIR MANAGEMENT SCREEN')).toBe(1);
    expect(start).toBeGreaterThan(-1);
    expect(LINES[start + 1]).toBe('      {showServiceRepair && (');
    expect(LINES[start + 2]).toBe('        <ServiceRepair');
    expect(LINES[end - 1]).toBe('        />');
    expect(end - start + 1).toBe(15);
    expect(LINES[start - 1]).toBe('');
    // the previous sibling is the SerialBatch call site (extracted after this screen)
    expect(LINES[start - 2]).toBe('      )}');
    expect(LINES.slice(0, start).lastIndexOf('        <SerialBatch')).toBeGreaterThan(LINES.slice(0, start).lastIndexOf('      {/* ─── SERIAL / BATCH CHECK MODAL ─── */}'));
    expect(LINES[end + 1]).toBe('');
    expect(LINES[end + 2]).toBe(NEXT_ANCHOR);
    // the mount condition stays in the parent, exactly once; the IIFE and its tree are gone
    expect(count(PARENT, '{showServiceRepair && ')).toBe(1);
    expect(PARENT).not.toContain('{showServiceRepair && (() => {');
    expect(PARENT).not.toContain('const mockJobs');
    expect(PARENT).not.toContain('Service &amp; Repair Management');
    expect(CHILD_CODE).not.toContain('showServiceRepair &&');
    // exactly one call site, no key / memo wrapper
    expect(count(PARENT, '<ServiceRepair')).toBe(1);
    expect(PARENT).not.toContain('<ServiceRepair key=');
    expect(PARENT).not.toContain('memo(ServiceRepair');
    expect(count(PARENT, "import ServiceRepair from './POS/features/service/ServiceRepair';")).toBe(1);
    expect(PARENT).not.toMatch(/function ServiceRepair\b/);
    expect(PARENT).not.toMatch(/const ServiceRepair\b/);
  });

  it('the harness call site is byte-identical to POSSales', () => {
    expect(CALLSITE).toBe(PARENT_CALLSITE);
  });

  it('call site: guard kept in the parent, exactly the 10 direct props, no spread, no arrows, no key', () => {
    expect(PARENT_CALLSITE.split('\n').slice(0, 3)).toEqual([ANCHOR, '      {showServiceRepair && (', '        <ServiceRepair']);
    expect(PARENT_CALLSITE.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    PROPS.forEach((n) => expect(PARENT_CALLSITE, n).toContain(`          ${n}={${n}}\n`));
    ['{...', '=>', 'key=', '.bind('].forEach((s) => expect(PARENT_CALLSITE, s).not.toContain(s));
    expect([...PROPS].sort()).toEqual([...OWN_STATE].sort());
  });

  it('child body is the IIFE body verbatim, re-indented from 8 to 2 spaces (mockJobs still empty)', () => {
    expect(IIFE_BODY.every((l) => l === '' || l.startsWith('        '))).toBe(true);
    expect(CHILD_BODY).toBe(IIFE_BODY.map((l) => (l === '' ? '' : l.replace(/^ {6}/, ''))).join('\n'));
    expect(CHILD_BODY.split('\n')[0]).toBe('  const mockJobs = [];');
    expect(count(CHILD_CODE, 'mockJobs')).toBe(2);
  });

  it('child is a module-level component taking exactly the 10 props, no spread, no memo', () => {
    expect(CHILD).toContain(`\nfunction ServiceRepair({\n${PROPS.map((n) => `  ${n},\n`).join('')}}) {\n`);
    expect(CHILD.match(/^function /gm)).toHaveLength(1);
    expect(CHILD).toContain('\nexport default ServiceRepair;\n');
    expect(CHILD.match(/^export /gm)).toHaveLength(1);
    ['...props', '...rest', 'memo(', 'forwardRef'].forEach((s) => expect(CHILD, s).not.toContain(s));
  });

  it('child is free only in its module imports; showServiceRepair is received but never read', () => {
    expect(freeIdentifiers(CHILD.replace(/^import .*$/gm, ''))).toEqual([...MODULE].sort());
    expect(CHILD_BODY).not.toContain('showServiceRepair');
    expect(count(CHILD_CODE, 'showServiceRepair')).toBe(1);
  });

  it("child imports exactly React, the 22 icons and POSCurrency's three exports — no API", () => {
    expect(CHILD.match(/^import .*$/gm)).toEqual([
      "import React from 'react';",
      `import { ${ICONS.join(', ')} } from 'lucide-react';`,
      "import { CurrencyAmount, DirhamSymbol, renderAED } from '../../POSCurrency';",
    ]);
    expect(path.resolve(__dirname, '../features/service', '../../POSCurrency')).toBe(path.resolve(__dirname, '../POSCurrency'));
    expect(CHILD_CODE).not.toMatch(/\/api\/|axios|fetch\(/);
    // the parent keeps every import it still uses elsewhere
    expect(PARENT).toContain("import { DirhamSymbol, DenominationLabel, CurrencyAmount, DenominationAmount, renderAED, setActiveCurrency } from './POS/POSCurrency';");
    // (Wrench later left POSSales with the SerialBatch extraction, and Trash2 with the
    // ConfirmAction extraction — each was that icon's last POSSales user)
    ICONS.filter((n) => !['Stethoscope', 'Wrench', 'Trash2'].includes(n)).forEach((icon) => expect(PARENT, icon).toMatch(new RegExp(`^  ${icon},$`, 'm')));
    expect(PARENT).toContain("import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';");
  });

  it('the child owns no hooks, state, refs, effects, context, memo, portals, API or services', () => {
    ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect',
      'Context', 'memo(', 'createPortal', 'ref=', 'await', 'async', 'fetch(', 'axios', 'Api', 'api.', 'Service(',
      'setTimeout', 'addEventListener', '<Dialog', 'onKeyDown', 'autoFocus']
      .forEach((s) => expect(CHILD_CODE, s).not.toContain(s));
    expect(CHILD_CODE).not.toMatch(/\buse[A-Z]/);
  });

  it('POSSales keeps only the Serial/Batch writes; every other setter call left with the region', () => {
    // the Serial/Batch writes themselves now live in the extracted SerialBatch child, unchanged
    const SERIAL_CHILD = read('../features/products/SerialBatch.jsx');
    expect(count(PARENT, 'setShowServiceRepair(')).toBe(0);
    expect(count(PARENT, 'setServiceView(')).toBe(0);
    expect(count(PARENT, 'setServiceJobStep(')).toBe(0);
    expect(count(SERIAL_CHILD, 'setShowServiceRepair(')).toBe(1);
    expect(count(SERIAL_CHILD, 'setServiceView(')).toBe(1);
    expect(count(SERIAL_CHILD, 'setServiceJobStep(')).toBe(1);
    expect(count(PARENT, 'setServiceDetailTab(')).toBe(0);
    expect(count(PARENT, 'setServiceJobFilter(')).toBe(0);
    // reads of the values: declarations + call site only
    ['serviceJobFilter', 'serviceDetailTab'].forEach((n) => expect(count(PARENT, n), n).toBe(count(PARENT_CALLSITE, n) + 1));
  });

  it('architecture pin stays consistent with this extraction', () => {
    const ARCH = read('./POSSalesArchitecture.characterization.test.jsx');
    expect(ARCH).toContain("['service & repair screen (in ServiceRepair)', '{showServiceRepair && (\\n        <ServiceRepair'],");
    expect(ARCH).toContain("['ServiceRepair', './POS/features/service/ServiceRepair', 1],");
  });

  it('the pre-extraction reference is the 475-line IIFE region', () => {
    const lines = REGION.split('\n');
    expect(lines).toHaveLength(475);
    expect(lines[0]).toBe(ANCHOR);
    expect(lines[1]).toBe('      {showServiceRepair && (() => {');
    expect(lines[2]).toBe('        const mockJobs = [];');
    expect(lines[32]).toBe('        return (');
    expect(lines[473]).toBe('        );');
    expect(lines[474]).toBe('      })()}');
  });

  it('the five state declarations are byte-identical to POSSales and are the only Service & Repair state', () => {
    expect(STATE).toBe([
      '  // Service & Repair view',
      '  const [showServiceRepair, setShowServiceRepair] = useState(false);',
      "  const [serviceView, setServiceView] = useState('list');",
      '  const [serviceJobStep, setServiceJobStep] = useState(1);',
      "  const [serviceDetailTab, setServiceDetailTab] = useState('overview');",
      "  const [serviceJobFilter, setServiceJobFilter] = useState({ status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' });",
    ].join('\n'));
    expect(PARENT).toContain(`\n${STATE}\n  // Sales Return.`);
    ['[showServiceRepair, setShowServiceRepair] = useState(', '[serviceView, setServiceView] = useState(', '[serviceJobStep, setServiceJobStep] = useState(',
      '[serviceDetailTab, setServiceDetailTab] = useState(', '[serviceJobFilter, setServiceJobFilter] = useState(']
      .forEach((s) => expect(count(PARENT, s), s).toBe(1));
  });

  it('pins the exact direct dependency surface: 9 POSSales bindings + 26 module imports, no globals', () => {
    expect(freeIdentifiers(`(<>\n${REGION}\n</>);`)).toEqual(['showServiceRepair', ...REGION_BINDINGS, ...MODULE].sort());
    const body = REGION.split('\n').slice(2, -1).join('\n');
    expect(freeIdentifiers(`function __R() {\n${body}\n}`)).toEqual([...REGION_BINDINGS, ...MODULE].sort());
  });

  it('mockJobs stays empty and the derived consts are pinned', () => {
    expect(count(REGION, 'const mockJobs = [];')).toBe(1);
    expect(count(REGION, 'mockJobs')).toBe(2);
    expect(REGION).toContain('        const filteredJobs = mockJobs.filter(j => {');
    expect(count(REGION, "val: '—'")).toBe(7);
    expect(REGION).toContain("        const serviceSteps = ['Customer Details', 'Item & Warranty', 'Problem Details', 'Technician & Parts', 'Estimate', 'Service Invoice', 'Delivery'];");
    expect(REGION).toContain("        const detailTabs = ['overview', 'warranty', 'diagnosis', 'parts', 'estimate', 'invoice', 'payments', 'delivery', 'activity'];");
  });

  it('exact write calls in the region', () => {
    expect(count(REGION, 'setShowServiceRepair(')).toBe(2);
    expect(count(REGION, 'setShowServiceRepair(false)')).toBe(2);
    expect(count(REGION, 'setServiceView(')).toBe(7);
    expect(count(REGION, "setServiceView('list')")).toBe(3);
    expect(count(REGION, "setServiceView('detail')")).toBe(2);
    expect(count(REGION, "setServiceView('settings')")).toBe(1);
    expect(count(REGION, "setServiceView('new-job')")).toBe(1);
    expect(count(REGION, "setServiceView('new-job'); setServiceJobStep(1);")).toBe(1);
    expect(count(REGION, 'setServiceJobStep(')).toBe(4);
    expect(count(REGION, 'setServiceDetailTab(')).toBe(1);
    expect(count(REGION, 'setServiceJobFilter(')).toBe(4);
    expect(count(REGION, 'onClick=')).toBe(14);
  });

  it('the region owns no hooks, state, refs, effects, context, memo, portals, API or services', () => {
    ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect',
      'Context', 'memo(', 'createPortal', 'ref=', 'await', 'async', 'fetch(', 'axios', 'Api', 'api.', 'Service(',
      'setTimeout', 'addEventListener', '<Dialog', 'onKeyDown', 'autoFocus']
      .forEach((s) => expect(REGION, s).not.toContain(s));
  });

  it('has no hidden cart / invoice / session / checkout / feedback / settings / serial-batch dependency', () => {
    ['currentInvoice', 'currentSession', 'currentTerminal', 'checkoutPayment', 'posSettings', 'xReportData', 'syncPosData',
      'showFeedback', 'formatCurrency', 'selectedCustomer', 'SerialBatch', 'serialBatch', 'showPOSConfig']
      .forEach((name) => expect(REGION, name).not.toContain(name));
  });

  it('openers: only the Serial/Batch "Create Service Job" button; POSTouchScreen receives but never calls the setters', () => {
    const SB_OPENER = "<button onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }} className=\"bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1\"><Wrench className=\"h-3.5 w-3.5\" />Create Service Job</button>";
    // the opener moved, verbatim, from POSSales into the extracted SerialBatch child
    const SERIAL_CHILD = read('../features/products/SerialBatch.jsx');
    expect(count(SERIAL_CHILD, SB_OPENER)).toBe(1);
    expect(count(PARENT, SB_OPENER)).toBe(0);
    expect(TEST).toContain("onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }}");
    expect(count(SERIAL_CHILD, 'setShowServiceRepair(true)')).toBe(1);
    expect(count(PARENT, 'setShowServiceRepair(true)')).toBe(0);
    expect(PARENT).toContain('    setShowServiceRepair, setServiceView, setShowReturn, setShowAddShippingDialog,\n');
    expect(TOUCH).toContain('    setShowServiceRepair, setServiceView, setShowReturn, setShowAddShippingDialog,\n');
    expect(count(TOUCH, 'setShowServiceRepair')).toBe(1);
    expect(count(TOUCH, 'setServiceView')).toBe(1);
    expect(TRADE).not.toMatch(/ServiceRepair|serviceView/);
    expect(CONSOLE).not.toMatch(/ServiceRepair|serviceView/);
  });

  it('Stethoscope was the only module import used exclusively by the region, and it left POSSales', () => {
    const uses = (n) => (PARENT.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length;
    // (Wrench later left POSSales with the SerialBatch extraction, and Trash2 with the
    // ConfirmAction extraction — each was that icon's last POSSales user)
    MODULE.filter((n) => !['Stethoscope', 'Wrench', 'Trash2'].includes(n)).forEach((n) => expect(uses(n), n).toBeGreaterThan(1));
    expect(uses('Wrench')).toBe(0);
    expect(uses('Trash2')).toBe(0);
    expect(uses('Stethoscope')).toBe(0);
    expect(REGION).toContain('<Stethoscope ');
    expect(CHILD_BODY).toContain('<Stethoscope ');
  });
});

// keep lint honest about imports used only inside the verbatim region
void [AlertCircle, CheckCircle, ChevronRight, ClipboardList, DollarSign, FileText, Package, PackageCheck, Plus, Printer,
  RotateCcw, Search, Settings, Shield, Smartphone, Stethoscope, Trash2, Truck, Users, Wrench, X, XCircle,
  CurrencyAmount, DirhamSymbol, React, useEffect];
