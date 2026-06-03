import React, { useState, useEffect } from 'react';
import {
  Warehouse as WarehouseIcon, ChevronRight, Plus, Search, SquarePen, Trash2,
  MapPin, X, Package, Layers, Box, Clock, Activity, TrendingUp, Users, FileText,
  Map, Shield, Printer, AlertTriangle, Lock, Zap, CheckCircle, BarChart3,
  ArrowRight, RefreshCw, Building2, Grid3X3, ScanLine
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getWarehouseStockSummary } from '../../../api/warehouseApi';
import { getBranches } from '../../../api/branchApi';
import { hasRole } from '../../../api/auth';
import { useBranch } from '../../../context/BranchContext';
import { getZones, createZone, updateZone, deleteZone, getLocators, createLocator, updateLocator, deleteLocator, getBins, createBin, updateBin, deleteBin, getBinStock, addBinStock, deleteBinStock } from '../../../api/warehouseLocationApi';
import { getListSerialNumber } from '../../../utils/serialNumbering';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  warehouse: { icon: WarehouseIcon,  color: 'text-[#F5C742]',   bg: 'bg-amber-50',    border: 'border-amber-200',  label: 'Warehouse' },
  zone:      { icon: Layers,          color: 'text-emerald-500', bg: 'bg-emerald-50',  border: 'border-emerald-200', label: 'Zone' },
  locator:   { icon: MapPin,          color: 'text-blue-500',    bg: 'bg-blue-50',     border: 'border-blue-200',   label: 'Locator' },
  bin:       { icon: Box,             color: 'text-orange-500',  bg: 'bg-orange-50',   border: 'border-orange-200', label: 'Bin' },
};

// ─── Tree Node ────────────────────────────────────────────────────────────────
const TreeNode = ({ item, level, type, isSelected, isExpanded, onSelect, onToggle, children }) => {
  const { icon: Icon, color } = TYPE_CONFIG[type];
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 pr-3 cursor-pointer rounded-lg text-xs font-medium transition-all duration-150 group
          ${isSelected
            ? 'bg-[#F5C742] text-slate-900 shadow-sm'
            : 'hover:bg-slate-50 text-slate-600 hover:text-slate-900'}`}
        style={{ paddingLeft: `${level * 14 + 10}px` }}
        onClick={() => onSelect(item, type)}
      >
        {hasChildren
          ? <button onClick={e => { e.stopPropagation(); onToggle(item.id, type); }} className="p-0.5 shrink-0">
              <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          : <span className="w-4 shrink-0" />
        }
        <Icon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-slate-900' : color}`} />
        <span className="truncate flex-1">{item.name || item.code}</span>
      </div>
      {isExpanded && <div className="ml-1">{children}</div>}
    </div>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const isActive = ['Active', 'active', 'ACTIVE'].includes(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase
      ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {isActive ? 'Active' : (status || 'Inactive')}
    </span>
  );
};

// ─── Info Field ───────────────────────────────────────────────────────────────
const InfoField = ({ label, value, accent }) => (
  <div>
    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${accent ? 'text-[#F5C742]' : 'text-slate-400'}`}>{label}</p>
    <p className="text-sm font-semibold text-slate-800">{value || '—'}</p>
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color = 'amber', alert }) => {
  const palettes = {
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'text-[#F5C742]',   text: 'text-slate-900' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-500', text: 'text-slate-900' },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    icon: 'text-blue-500',    text: 'text-slate-900' },
    orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  icon: 'text-orange-500',  text: 'text-slate-900' },
    purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  icon: 'text-purple-500',  text: 'text-slate-900' },
    red:     { bg: 'bg-red-50',     border: 'border-red-200',     icon: 'text-red-500',     text: 'text-red-600'   },
    slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'text-slate-400',   text: 'text-slate-900' },
    cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    icon: 'text-cyan-500',    text: 'text-slate-900' },
  };
  const p = alert ? palettes.red : (palettes[color] || palettes.amber);
  return (
    <div className={`rounded-xl border ${p.border} ${p.bg} p-4 flex flex-col gap-2`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${p.icon}`}>
        <Icon className="h-3.5 w-3.5" />{label}
      </div>
      <p className={`text-2xl font-black ${p.text}`}>{value}</p>
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────
const Modal = ({ isOpen, onClose, title, subtitle, icon: MIcon, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            {MIcon && <div className="p-2 bg-[#F5C742]/10 rounded-lg"><MIcon className="h-5 w-5 text-[#F5C742]" /></div>}
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// ─── Form Field ───────────────────────────────────────────────────────────────
const FormField = ({ label, required, children }) => (
  <div>
    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 focus:border-[#F5C742] transition-all bg-white";
const selectCls = `${inputCls} cursor-pointer`;

// ─── Section Card ─────────────────────────────────────────────────────────────
const SectionCard = ({ title, subtitle, action, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

// ─── Data Table ───────────────────────────────────────────────────────────────
const DataTable = ({ cols, rows, empty }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
        <tr>{cols.map(c => <th key={c.key} className={`px-4 py-3 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap ${c.center ? 'text-center' : 'text-left'}`}>{c.label}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.length === 0
          ? <tr><td colSpan={cols.length} className="px-6 py-12 text-center text-slate-400 text-xs">{empty || 'No data'}</td></tr>
          : rows
        }
      </tbody>
    </table>
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const createWarehouseForm = (branchId = '') => ({
  name: '', type: 'Warehouse', address: '', status: 'Active', capacity: 0, utilization: 0,
  branchId: branchId ? String(branchId) : ''
});

const buildWarehousePayload = (form, fallbackBranchId = null) => ({
  name: (form.name || '').trim(),
  type: form.type || 'Warehouse',
  address: (form.address || '').trim(),
  status: form.status || 'Active',
  capacity: Number.isFinite(Number(form.capacity)) ? Number(form.capacity) : 0,
  utilization: Number.isFinite(Number(form.utilization)) ? Number(form.utilization) : 0,
  branchId: form.branchId ? Number(form.branchId) : fallbackBranchId || null
});

const extractErrorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.response?.data?.error || fallback;

// ─── Main Component ───────────────────────────────────────────────────────────
const Warehouse = () => {
  const { defaultBranch } = useBranch();
  const isAdmin = hasRole('ADMIN');
  const [warehouses, setWarehouses]   = useState([]);
  const [branches, setBranches]       = useState([]);
  const [zones, setZones]             = useState({});
  const [locators, setLocators]       = useState({});
  const [bins, setBins]               = useState({});
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState({ type: null, item: null, parentId: null });
  const [expanded, setExpanded]       = useState({ warehouses: {}, zones: {}, locators: {} });
  const [activeTab, setActiveTab]     = useState('details');
  const [searchTerm, setSearchTerm]   = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [modal, setModal]             = useState({ type: null, editing: null });
  const [form, setForm]               = useState({});

  useEffect(() => { fetchWarehousesAndExpand(); }, []);
  useEffect(() => { fetchBranches(); }, []);
  useEffect(() => {
    if (modal.type === 'warehouse' && !modal.editing && !form.branchId && defaultBranch?.id) {
      setForm(prev => ({ ...prev, branchId: String(defaultBranch.id) }));
    }
  }, [modal.type, modal.editing, form.branchId, defaultBranch?.id]);

  const branchOptions = (() => {
    if (isAdmin) return branches;
    const b = branches.find(b => b.id === defaultBranch?.id);
    if (b) return [b];
    return defaultBranch?.id ? [defaultBranch] : [];
  })();
  const branchSelectionLocked = !isAdmin && branchOptions.length <= 1;

  const fetchWarehousesAndExpand = async () => {
    try {
      setLoading(true);
      const data = await getWarehouses();
      const warehouseList = Array.isArray(data) ? data : [];
      setWarehouses(warehouseList);
      const expW = {}, expZ = {}, expL = {}, allZ = {}, allL = {}, allB = {};
      let firstBin = null, firstBinLocatorId = null;
      for (const wh of warehouseList) {
        expW[wh.id] = true;
        try {
          const zoneData = await getZones(wh.id); allZ[wh.id] = zoneData || [];
          for (const zone of (zoneData || [])) {
            expZ[zone.id] = true;
            try {
              const locData = await getLocators(zone.id); allL[zone.id] = locData || [];
              for (const loc of (locData || [])) {
                expL[loc.id] = true;
                try {
                  const binData = await getBins(loc.id); allB[loc.id] = binData || [];
                  if (!firstBin && binData?.length > 0) { firstBin = binData[0]; firstBinLocatorId = loc.id; }
                } catch { allB[loc.id] = []; }
              }
            } catch { allL[zone.id] = []; }
          }
        } catch { allZ[wh.id] = []; }
      }
      setExpanded({ warehouses: expW, zones: expZ, locators: expL });
      setZones(allZ); setLocators(allL); setBins(allB);
      if (firstBin) setSelected({ type: 'bin', item: firstBin, parentId: firstBinLocatorId });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchBranches    = async () => { try { const d = await getBranches(); setBranches(Array.isArray(d) ? d : []); } catch {} };
  const fetchZones       = async (id) => { try { const d = await getZones(id);    setZones(p => ({ ...p, [id]: d || [] })); } catch { setZones(p => ({ ...p, [id]: [] })); } };
  const fetchLocators    = async (id) => { try { const d = await getLocators(id); setLocators(p => ({ ...p, [id]: d || [] })); } catch { setLocators(p => ({ ...p, [id]: [] })); } };
  const fetchBins        = async (id) => { try { const d = await getBins(id);     setBins(p => ({ ...p, [id]: d || [] })); } catch { setBins(p => ({ ...p, [id]: [] })); } };

  const handleSelect = (item, type, parentId = null) => { setSelected({ type, item, parentId }); setActiveTab('details'); };
  const handleToggle = (id, type) => {
    const key = type + 's';
    setExpanded(p => ({ ...p, [key]: { ...p[key], [id]: !p[key][id] } }));
  };

  const openModal = (type, item = null) => {
    setModal({ type, editing: item });
    if (type === 'warehouse') {
      setForm(item ? { ...item, capacity: item.capacity ?? 0, utilization: item.utilization ?? 0, branchId: item.branchId ? String(item.branchId) : (defaultBranch?.id ? String(defaultBranch.id) : '') } : createWarehouseForm(defaultBranch?.id));
    }
    if (type === 'zone')    setForm(item || { code: '', name: '', description: '', zoneType: 'Storage', status: 'Active' });
    if (type === 'locator') setForm(item || { code: '', name: '', aisleNumber: '', rackNumber: '', status: 'Active' });
    if (type === 'bin')     setForm(item || { code: '', name: '', capacity: 100, binType: 'Standard', status: 'Active' });
  };
  const closeModal = () => { setModal({ type: null, editing: null }); setForm({}); };

  const handleSave = async () => {
    try {
      if (modal.type === 'warehouse') {
        const payload = buildWarehousePayload(form, defaultBranch?.id || null);
        if (!payload.name)     { toast.error('Warehouse name is required'); return; }
        if (!payload.address)  { toast.error('Address is required'); return; }
        if (!payload.branchId) { toast.error('Select a branch first'); return; }
        modal.editing ? await updateWarehouse(modal.editing.id, payload) : await createWarehouse(payload);
        toast.success(modal.editing ? 'Warehouse updated' : 'Warehouse created');
        await fetchWarehousesAndExpand();
      } else if (modal.type === 'zone' && selected.item) {
        const wid = selected.type === 'warehouse' ? selected.item.id : selected.parentId;
        modal.editing ? await updateZone(wid, modal.editing.id, form) : await createZone(wid, form);
        setZones(p => ({ ...p, [wid]: null })); await fetchZones(wid);
      } else if (modal.type === 'locator' && selected.item) {
        const zid = selected.type === 'zone' ? selected.item.id : selected.parentId;
        modal.editing ? await updateLocator(zid, modal.editing.id, form) : await createLocator(zid, form);
        setLocators(p => ({ ...p, [zid]: null })); await fetchLocators(zid);
      } else if (modal.type === 'bin' && selected.item) {
        const lid = selected.type === 'locator' ? selected.item.id : selected.parentId;
        modal.editing ? await updateBin(lid, modal.editing.id, form) : await createBin(lid, form);
        setBins(p => ({ ...p, [lid]: null })); await fetchBins(lid);
      }
      closeModal();
    } catch (e) { toast.error(extractErrorMessage(e, 'Failed to save. Please try again.')); }
  };

  const handleDeleteWarehouse = async (id) => {
    if (!confirm('Delete this warehouse? This cannot be undone.')) return;
    try { await deleteWarehouse(id); fetchWarehousesAndExpand(); if (selected.item?.id === id) setSelected({ type: null, item: null, parentId: null }); }
    catch { toast.error('Failed to delete warehouse.'); }
  };
  const handleDeleteZone = async (warehouseId, zoneId) => {
    if (!confirm('Delete this zone?')) return;
    try { await deleteZone(warehouseId, zoneId); setZones(p => ({ ...p, [warehouseId]: null })); fetchZones(warehouseId); if (selected.item?.id === zoneId) setSelected({ type: null, item: null, parentId: null }); }
    catch { toast.error('Failed to delete zone.'); }
  };
  const handleDeleteLocator = async (zoneId, locatorId) => {
    if (!confirm('Delete this locator?')) return;
    try { await deleteLocator(zoneId, locatorId); setLocators(p => ({ ...p, [zoneId]: null })); fetchLocators(zoneId); if (selected.item?.id === locatorId) setSelected({ type: null, item: null, parentId: null }); }
    catch { toast.error('Failed to delete locator.'); }
  };
  const handleDeleteBin = async (locatorId, binId) => {
    if (!confirm('Delete this bin?')) return;
    try { await deleteBin(locatorId, binId); setBins(p => ({ ...p, [locatorId]: null })); fetchBins(locatorId); if (selected.item?.id === binId) setSelected({ type: null, item: null, parentId: null }); }
    catch { toast.error('Failed to delete bin.'); }
  };

  const tabs = [
    { id: 'details',      label: 'Details',      icon: FileText },
    { id: 'storage-map',  label: 'Storage Map',  icon: Grid3X3 },
    { id: 'permissions',  label: 'Permissions',  icon: Shield },
    { id: 'audit',        label: 'Audit Logs',   icon: Clock },
  ];

  const filteredWarehouses = warehouses.filter(w =>
    w.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!showActiveOnly || w.status === 'Active')
  );

  const totalBins = Object.values(bins).reduce((s, arr) => s + (arr?.length || 0), 0);
  const totalZones = Object.values(zones).reduce((s, arr) => s + (arr?.length || 0), 0);

  return (
    <div className="flex flex-col h-full bg-[#F7F7FA] font-sans">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
              <Building2 className="h-3 w-3" />
              <span>Inventory & Registries</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-slate-600 font-medium">Warehouses & Storage</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
              <span className="p-1.5 bg-[#F5C742]/10 rounded-lg"><WarehouseIcon className="h-5 w-5 text-[#F5C742]" /></span>
              Warehouses & Storage
            </h1>
            <p className="text-xs text-slate-500 mt-1">Manage warehouse hierarchy: zones, locators &amp; bins</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchWarehousesAndExpand}
              className="h-9 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              onClick={() => openModal('warehouse')}
              className="h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" /> New Warehouse
            </button>
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="flex items-center gap-6 mt-4 pt-3 border-t border-slate-100">
          {[
            { label: 'Warehouses', value: warehouses.length, icon: WarehouseIcon, color: 'text-[#F5C742]' },
            { label: 'Zones',      value: totalZones,        icon: Layers,         color: 'text-emerald-500' },
            { label: 'Bins',       value: totalBins,         icon: Box,            color: 'text-orange-500' },
            { label: 'Active',     value: warehouses.filter(w => w.status === 'Active').length, icon: CheckCircle, color: 'text-emerald-500' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
              <span className="text-xs text-slate-500">{s.label}</span>
              <span className="text-xs font-bold text-slate-800">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Detail Tabs (when item selected) ── */}
      {selected.item && (
        <div className="bg-white border-b border-slate-100 px-6 shrink-0">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold border-b-2 -mb-px transition-all
                  ${activeTab === t.id ? 'border-[#F5C742] text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
          {/* Search */}
          <div className="p-4 border-b border-slate-100 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search warehouses, zones, bins…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-[#F7F7FA] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 focus:border-[#F5C742] transition-all"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={e => setShowActiveOnly(e.target.checked)}
                className="rounded text-[#F5C742] focus:ring-[#F5C742]"
              />
              Show active only
            </label>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-[#F5C742] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading structure…</p>
              </div>
            ) : filteredWarehouses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                <WarehouseIcon className="h-10 w-10 opacity-30" />
                <p className="text-xs">No warehouses found</p>
                <button onClick={() => openModal('warehouse')} className="text-xs text-[#F5C742] font-semibold hover:underline">+ Create one</button>
              </div>
            ) : filteredWarehouses.map(wh => (
              <TreeNode key={wh.id} item={wh} level={0} type="warehouse"
                isSelected={selected.type === 'warehouse' && selected.item?.id === wh.id}
                isExpanded={expanded.warehouses[wh.id]}
                onSelect={handleSelect} onToggle={handleToggle}
              >
                {(zones[wh.id] || []).map(zone => (
                  <TreeNode key={zone.id} item={zone} level={1} type="zone"
                    isSelected={selected.type === 'zone' && selected.item?.id === zone.id}
                    isExpanded={expanded.zones[zone.id]}
                    onSelect={(i, t) => handleSelect(i, t, wh.id)} onToggle={handleToggle}
                  >
                    {(locators[zone.id] || []).map(loc => (
                      <TreeNode key={loc.id} item={loc} level={2} type="locator"
                        isSelected={selected.type === 'locator' && selected.item?.id === loc.id}
                        isExpanded={expanded.locators[loc.id]}
                        onSelect={(i, t) => handleSelect(i, t, zone.id)} onToggle={handleToggle}
                      >
                        {(bins[loc.id] || []).map(bin => (
                          <TreeNode key={bin.id} item={bin} level={3} type="bin"
                            isSelected={selected.type === 'bin' && selected.item?.id === bin.id}
                            isExpanded={false}
                            onSelect={(i, t) => handleSelect(i, t, loc.id)} onToggle={() => {}} />
                        ))}
                      </TreeNode>
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </div>

          {/* Sidebar footer */}
          <div className="p-3 border-t border-slate-100 bg-slate-50">
            <button onClick={() => openModal('warehouse')} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-[#F5C742] hover:bg-[#F5C742]/10 rounded-lg transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Warehouse
            </button>
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selected.item ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400 gap-4">
              <div className="p-6 bg-slate-100 rounded-2xl">
                <WarehouseIcon className="h-16 w-16 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-600">Select a node from the sidebar</p>
                <p className="text-sm text-slate-400 mt-1">Click a warehouse, zone, locator, or bin to view details</p>
              </div>
              <button onClick={() => openModal('warehouse')} className="mt-2 flex items-center gap-2 px-4 py-2 bg-[#F5C742] text-slate-900 rounded-lg text-sm font-bold shadow-sm hover:bg-[#E5B732] transition-colors">
                <Plus className="h-4 w-4" /> Create First Warehouse
              </button>
            </div>
          ) : activeTab === 'details' ? (
            selected.type === 'warehouse' ? (
              <WarehouseDetail
                warehouse={selected.item}
                zones={zones[selected.item.id] || []}
                onEdit={() => openModal('warehouse', selected.item)}
                onDelete={() => handleDeleteWarehouse(selected.item.id)}
                onAddZone={() => openModal('zone')}
                onEditZone={z => openModal('zone', z)}
                onDeleteZone={id => handleDeleteZone(selected.item.id, id)}
              />
            ) : selected.type === 'zone' ? (
              <ZoneDetail
                zone={selected.item}
                locators={locators[selected.item.id] || []}
                onEdit={() => openModal('zone', selected.item)}
                onAddLocator={() => openModal('locator')}
                onEditLocator={l => openModal('locator', l)}
                onDeleteLocator={id => handleDeleteLocator(selected.item.id, id)}
              />
            ) : selected.type === 'locator' ? (
              <LocatorDetail
                locator={selected.item}
                bins={bins[selected.item.id] || []}
                onEdit={() => openModal('locator', selected.item)}
                onAddBin={() => openModal('bin')}
                onEditBin={b => openModal('bin', b)}
                onDeleteBin={id => handleDeleteBin(selected.item.id, id)}
              />
            ) : selected.type === 'bin' ? (
              <BinDetail bin={selected.item} onEdit={() => openModal('bin', selected.item)} />
            ) : null
          ) : activeTab === 'storage-map' ? <StorageMapTab />
            : activeTab === 'permissions' ? <PermissionsTab />
            : activeTab === 'audit' ? <AuditTab />
            : null}
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal isOpen={modal.type === 'warehouse'} onClose={closeModal}
        icon={WarehouseIcon}
        title={modal.editing ? 'Edit Warehouse' : 'New Warehouse'}
        subtitle="Define warehouse details and capacity"
      >
        <div className="space-y-4">
          <FormField label="Branch" required>
            <select value={form.branchId || ''} onChange={e => setForm({ ...form, branchId: e.target.value })}
              disabled={branchOptions.length === 0 || branchSelectionLocked} className={selectCls}>
              <option value="">{branchOptions.length === 0 ? 'No branches available' : 'Select branch…'}</option>
              {branchOptions.map(b => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
            </select>
          </FormField>
          <FormField label="Warehouse Name" required>
            <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Main Distribution Center" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type">
              <select value={form.type || 'Warehouse'} onChange={e => setForm({ ...form, type: e.target.value })} className={selectCls}>
                {['Warehouse', 'Distribution', 'Showroom', 'Fulfillment Center', 'Cold Storage'].map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value })} className={selectCls}>
                <option>Active</option><option>Inactive</option>
              </select>
            </FormField>
          </div>
          <FormField label="Address" required>
            <input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} placeholder="e.g. Industrial Area 1, Dubai" />
          </FormField>
          <FormField label="Capacity (sqft)">
            <input type="number" value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} className={inputCls} placeholder="5000" />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">
              {modal.editing ? 'Update Warehouse' : 'Create Warehouse'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modal.type === 'zone'} onClose={closeModal} icon={Layers} title={modal.editing ? 'Edit Zone' : 'New Zone'} subtitle="Add a storage zone to this warehouse">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Zone Code" required>
              <input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="e.g. A" />
            </FormField>
            <FormField label="Zone Name" required>
              <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Zone A" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Zone Type">
              <select value={form.zoneType || 'Storage'} onChange={e => setForm({ ...form, zoneType: e.target.value })} className={selectCls}>
                {['Storage', 'Receiving', 'Shipping', 'Cold Storage', 'Quarantine'].map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value })} className={selectCls}>
                <option>Active</option><option>Inactive</option>
              </select>
            </FormField>
          </div>
          <FormField label="Description">
            <input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Optional notes…" />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">{modal.editing ? 'Update Zone' : 'Create Zone'}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modal.type === 'locator'} onClose={closeModal} icon={MapPin} title={modal.editing ? 'Edit Locator' : 'New Locator'} subtitle="Add a locator (aisle + rack position)">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Locator Code" required>
              <input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="e.g. A001" />
            </FormField>
            <FormField label="Name">
              <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Aisle 1 Rack A" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Aisle">
              <input value={form.aisleNumber || ''} onChange={e => setForm({ ...form, aisleNumber: e.target.value })} className={inputCls} placeholder="e.g. 1" />
            </FormField>
            <FormField label="Rack">
              <input value={form.rackNumber || ''} onChange={e => setForm({ ...form, rackNumber: e.target.value })} className={inputCls} placeholder="e.g. A" />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">{modal.editing ? 'Update Locator' : 'Create Locator'}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modal.type === 'bin'} onClose={closeModal} icon={Box} title={modal.editing ? 'Edit Bin' : 'New Bin'} subtitle="Add a bin to this locator">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bin Code" required>
              <input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="e.g. BIN-01" />
            </FormField>
            <FormField label="Name">
              <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Bin 01" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Capacity">
              <input type="number" value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} className={inputCls} placeholder="100" />
            </FormField>
            <FormField label="Type">
              <select value={form.binType || 'Standard'} onChange={e => setForm({ ...form, binType: e.target.value })} className={selectCls}>
                {['Standard', 'Bulk', 'Pick', 'Pallet'].map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">{modal.editing ? 'Update Bin' : 'Create Bin'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ─── Warehouse Detail ─────────────────────────────────────────────────────────
const WarehouseDetail = ({ warehouse, zones, onEdit, onDelete, onAddZone, onEditZone, onDeleteZone }) => {
  const [stock, setStock] = useState({ totalSkus: 0, totalQty: 0, fastMoving: 0, expiring: 0, reserved: 0, deadStock: 0 });
  useEffect(() => {
    if (warehouse?.id) getWarehouseStockSummary(warehouse.id).then(setStock).catch(() => {});
  }, [warehouse?.id]);
  const available = stock.totalQty - stock.reserved;

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#F5C742]/10 rounded-xl">
              <WarehouseIcon className="h-7 w-7 text-[#F5C742]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-black text-slate-900">{warehouse.name}</h2>
                <StatusBadge status={warehouse.status} />
              </div>
              <p className="text-xs text-slate-500">{warehouse.type || 'Warehouse'} · {warehouse.address || 'No address'}</p>
              {warehouse.branchName && <p className="text-xs text-slate-400 mt-0.5">Branch: {warehouse.branchName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-[#F5C742] hover:text-[#F5C742] rounded-lg transition-all">
              <SquarePen className="h-3.5 w-3.5" /> Edit
            </button>
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-all">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
        {warehouse.capacity > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Capacity Usage</span>
              <span className="font-semibold text-slate-700">{Math.min(100, Math.round(((warehouse.utilization || 0) / warehouse.capacity) * 100))}% of {warehouse.capacity.toLocaleString()} sqft</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F5C742] to-amber-400 transition-all"
                style={{ width: `${Math.min(100, Math.round(((warehouse.utilization || 0) / warehouse.capacity) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stock stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total SKUs"  value={stock.totalSkus.toLocaleString()} icon={Package}       color="amber" />
        <StatCard label="On Hand"     value={stock.totalQty.toLocaleString()}  icon={Box}            color="emerald" />
        <StatCard label="Fast Moving" value={stock.fastMoving.toLocaleString()} icon={Zap}           color="blue" />
        <StatCard label="Expiring"    value={stock.expiring.toLocaleString()}   icon={AlertTriangle} color="orange" alert={stock.expiring > 0} />
        <StatCard label="Reserved"    value={stock.reserved.toLocaleString()}   icon={Lock}          color="purple" />
        <StatCard label="Available"   value={available.toLocaleString()}        icon={CheckCircle}   color={available < 0 ? 'red' : 'cyan'} alert={available < 0} />
      </div>

      {/* Zones table */}
      <SectionCard
        title={`Storage Zones (${zones.length})`}
        subtitle="Logical areas within this warehouse"
        action={
          <button onClick={onAddZone} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">
            <Plus className="h-3.5 w-3.5" /> New Zone
          </button>
        }
      >
        <DataTable
          cols={[
            { key: 'sno', label: 'S.No', center: true },
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: 'Actions', center: true },
          ]}
          rows={zones.map((z, idx) => (
            <tr key={z.id} className="hover:bg-amber-50/30 transition-colors">
              <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
                {getListSerialNumber(idx, { totalElements: zones.length })}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-xs font-bold">{z.code}</span>
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{z.name}</td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold uppercase">{z.zoneType || 'Storage'}</span>
              </td>
              <td className="px-4 py-3"><StatusBadge status={z.status} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-center gap-2">
                  <button onClick={() => onEditZone(z)} className="p-1.5 text-slate-400 hover:text-[#F5C742] hover:bg-amber-50 rounded-md transition-colors"><SquarePen className="h-3.5 w-3.5" /></button>
                  <button onClick={() => onDeleteZone(z.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
          empty="No zones yet — click New Zone to create one"
        />
      </SectionCard>
    </div>
  );
};

// ─── Zone Detail ──────────────────────────────────────────────────────────────
const ZoneDetail = ({ zone, locators, onEdit, onAddLocator, onEditLocator, onDeleteLocator }) => (
  <div className="space-y-5">
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl"><Layers className="h-6 w-6 text-emerald-500" /></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-black text-slate-900">{zone.name}</h2>
              <StatusBadge status={zone.status} />
            </div>
            <p className="text-xs text-slate-500">Code: <span className="font-semibold text-slate-700">{zone.code}</span> · Type: <span className="font-semibold text-slate-700">{zone.zoneType || 'Storage'}</span></p>
            {zone.description && <p className="text-xs text-slate-400 mt-0.5">{zone.description}</p>}
          </div>
        </div>
        <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-[#F5C742] hover:text-[#F5C742] rounded-lg transition-all">
          <SquarePen className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-3">
      <StatCard label="Total Locators" value={locators.length} icon={MapPin} color="blue" />
      <StatCard label="Zone Type"      value={zone.zoneType || 'Storage'} icon={Layers} color="emerald" />
      <StatCard label="Status"         value={zone.status?.toUpperCase() || 'ACTIVE'} icon={Activity} color="amber" />
    </div>

    <SectionCard
      title={`Locators (${locators.length})`}
      subtitle="Aisle and rack positions within this zone"
      action={
        <button onClick={onAddLocator} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Locator
        </button>
      }
    >
      <DataTable
        cols={[
          { key: 'sno', label: 'S.No', center: true },
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'aisle', label: 'Aisle' },
          { key: 'rack', label: 'Rack' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: 'Actions', center: true },
        ]}
        rows={locators.map((l, idx) => (
          <tr key={l.id} className="hover:bg-blue-50/30 transition-colors">
            <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
              {getListSerialNumber(idx, { totalElements: locators.length })}
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-xs font-bold">{l.code}</span>
            </td>
            <td className="px-4 py-3 text-sm font-medium text-slate-800">{l.name || '—'}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{l.aisleNumber || '—'}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{l.rackNumber || '—'}</td>
            <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
            <td className="px-4 py-3">
              <div className="flex justify-center gap-2">
                <button onClick={() => onEditLocator(l)} className="p-1.5 text-slate-400 hover:text-[#F5C742] hover:bg-amber-50 rounded-md transition-colors"><SquarePen className="h-3.5 w-3.5" /></button>
                <button onClick={() => onDeleteLocator(l.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </td>
          </tr>
        ))}
        empty="No locators yet"
      />
    </SectionCard>
  </div>
);

// ─── Bin Layout Card ──────────────────────────────────────────────────────────
const BinLayoutCard = ({ bin }) => {
  const [binStock, setBinStock] = useState([]);
  
  useEffect(() => {
    if (bin?.id) {
      getBinStock(bin.id).then(d => setBinStock(d || [])).catch(() => setBinStock([]));
    }
  }, [bin?.id]);

  const currentQty = binStock.reduce((s, r) => s + (r.quantity || 0), 0);
  const capacity = bin.capacity || 0;
  const capacityPct = capacity ? Math.min(100, Math.round((currentQty / capacity) * 100)) : 0;
  
  const isFull = capacityPct >= 100;
  const bgClass = isFull ? 'bg-red-50 border-red-400' : 'bg-[#FFFBEB] border-[#F5C742]';
  const barColor = isFull ? 'bg-red-500' : capacityPct > 80 ? 'bg-orange-500' : 'bg-emerald-500';

  return (
    <div className={`p-4 rounded-xl border ${bgClass} flex flex-col gap-1 min-w-[150px] shrink-0`}>
      <p className="text-sm font-bold text-slate-800">{bin.code}</p>
      <p className="text-xs text-slate-500">{currentQty} / {capacity}</p>
      <div className="h-1.5 bg-black/5 rounded-full overflow-hidden mt-1.5">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${capacityPct}%` }} />
      </div>
    </div>
  );
};

// ─── Locator Detail ───────────────────────────────────────────────────────────
const LocatorDetail = ({ locator, bins, onEdit, onAddBin, onEditBin, onDeleteBin }) => (
  <div className="space-y-5">
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl"><MapPin className="h-6 w-6 text-blue-500" /></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-black text-slate-900">{locator.name || locator.code}</h2>
              <StatusBadge status={locator.status} />
            </div>
            <p className="text-xs text-slate-500">
              Code: <span className="font-semibold text-slate-700">{locator.code}</span>
              {locator.aisleNumber && <> · Aisle <span className="font-semibold text-slate-700">{locator.aisleNumber}</span></>}
              {locator.rackNumber  && <> · Rack <span className="font-semibold text-slate-700">{locator.rackNumber}</span></>}
            </p>
          </div>
        </div>
        <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-[#F5C742] hover:text-[#F5C742] rounded-lg transition-all">
          <SquarePen className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
    </div>

    <div className="grid grid-cols-4 gap-3">
      <StatCard label="Total Bins" value={bins.length}                    icon={Box}     color="orange" />
      <StatCard label="Aisle"      value={locator.aisleNumber || '—'}     icon={MapPin}  color="blue" />
      <StatCard label="Rack"       value={locator.rackNumber || '—'}      icon={Layers}  color="emerald" />
      <StatCard label="Status"     value={locator.status?.toUpperCase() || 'ACTIVE'} icon={Activity} color="amber" />
    </div>

    {bins.length > 0 && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Bin Layout</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
          {bins.map(b => <BinLayoutCard key={b.id} bin={b} />)}
        </div>
      </div>
    )}

    <SectionCard
      title={`Bins (${bins.length})`}
      subtitle="Storage bins within this locator"
      action={
        <button onClick={onAddBin} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Bin
        </button>
      }
    >
      <DataTable
        cols={[
          { key: 'sno', label: 'S.No', center: true },
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'capacity', label: 'Capacity' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: 'Actions', center: true },
        ]}
          rows={bins.map((b, idx) => (
          <tr key={b.id} className="hover:bg-orange-50/30 transition-colors">
            <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
              {getListSerialNumber(idx, { totalElements: bins.length })}
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-md text-xs font-bold">{b.code}</span>
            </td>
            <td className="px-4 py-3 text-sm font-medium text-slate-800">{b.name || '—'}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{b.capacity || '—'}</td>
            <td className="px-4 py-3">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold uppercase">{b.binType || 'Standard'}</span>
            </td>
            <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
            <td className="px-4 py-3">
              <div className="flex justify-center gap-2">
                <button onClick={() => onEditBin(b)} className="p-1.5 text-slate-400 hover:text-[#F5C742] hover:bg-amber-50 rounded-md transition-colors"><SquarePen className="h-3.5 w-3.5" /></button>
                <button onClick={() => onDeleteBin(b.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </td>
          </tr>
        ))}
        empty="No bins yet"
      />
    </SectionCard>
  </div>
);

// ─── Bin Detail ───────────────────────────────────────────────────────────────
const BinDetail = ({ bin, onEdit }) => {
  const [binStock, setBinStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);

  useEffect(() => {
    if (bin?.id) {
      setStockLoading(true);
      getBinStock(bin.id).then(d => setBinStock(d || [])).catch(() => setBinStock([])).finally(() => setStockLoading(false));
    }
  }, [bin?.id]);

  const currentQty  = binStock.reduce((s, r) => s + (r.quantity || 0), 0);
  const reserved    = binStock.reduce((s, r) => s + (r.reservedQuantity || 0), 0);
  const available   = currentQty - reserved;
  const skuCount    = new Set(binStock.map(r => r.productCode)).size;
  const capacityPct = bin.capacity ? Math.min(100, Math.round((currentQty / bin.capacity) * 100)) : 0;
  const capColor    = capacityPct > 85 ? 'bg-red-500' : capacityPct > 60 ? 'bg-[#F5C742]' : 'bg-emerald-500';

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-50 rounded-xl"><Box className="h-6 w-6 text-orange-500" /></div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-black text-slate-900">{bin.name || bin.code}</h2>
                <StatusBadge status={bin.status} />
                <span className="px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded text-[10px] font-bold uppercase">{bin.binType || 'Standard'}</span>
              </div>
              <p className="text-xs text-slate-500">Bin Code: <span className="font-bold text-slate-700 font-mono">{bin.code}</span> · Max Capacity: <span className="font-semibold text-slate-700">{bin.capacity || '—'}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-lg transition-all">
              <ScanLine className="h-3.5 w-3.5" /> Print Label
            </button>
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-[#F5C742] hover:text-[#F5C742] rounded-lg transition-all">
              <SquarePen className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </div>

        {/* Capacity bar */}
        {bin.capacity > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Capacity Usage</span>
              <span className={`font-bold ${capacityPct > 85 ? 'text-red-500' : 'text-slate-700'}`}>{capacityPct}% · {currentQty}/{bin.capacity}</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${capColor} transition-all duration-500`} style={{ width: `${capacityPct}%` }} />
            </div>
            {capacityPct > 85 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-red-500">
                <AlertTriangle className="h-3 w-3" /> This bin is near capacity
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Current Qty" value={currentQty} icon={Box}        color="amber" />
        <StatCard label="Available"   value={available}  icon={CheckCircle} color={available < 0 ? 'red' : 'emerald'} alert={available < 0} />
        <StatCard label="Reserved"    value={reserved}   icon={Lock}        color="purple" />
        <StatCard label="SKU Count"   value={skuCount}   icon={Layers}      color="blue" />
      </div>

      {/* Stock snapshot */}
      <SectionCard title="Stock Snapshot" subtitle="Current inventory in this bin">
        {stockLoading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="w-6 h-6 border-2 border-[#F5C742] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading stock…</span>
          </div>
        ) : (
          <DataTable
            cols={[
              { key: 'sno', label: '#', center: true },
              { key: 'sku', label: 'SKU' },
              { key: 'desc', label: 'Description' },
              { key: 'batch', label: 'Batch' },
              { key: 'onhand', label: 'On Hand' },
              { key: 'expiry', label: 'Expiry' },
              { key: 'reserved', label: 'Reserved' },
              { key: 'available', label: 'Available' },
            ]}
            rows={binStock.map((s, idx) => {
              const onHand   = s.quantity || 0;
              const res      = s.reservedQuantity || 0;
              const avail    = onHand - res;
              return (
                <tr key={s.stockIdentityKey || `${s.id}-${idx}`} className="hover:bg-amber-50/20 transition-colors">
                  <td className="px-4 py-3 text-center text-slate-400 text-[11px] font-mono">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-slate-800">{s.productCode || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{s.productName || '—'}</td>
                  <td className="px-4 py-3">
                    {s.batchNumber
                      ? <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] rounded font-semibold">{s.batchNumber}</span>
                      : <span className="text-slate-400 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900">{onHand}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{s.expiryDate || '—'}</td>
                  <td className="px-4 py-3 text-xs text-purple-600 font-semibold">{res}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-bold ${avail < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{avail}</span>
                  </td>
                </tr>
              );
            })}
            empty="No stock in this bin"
          />
        )}
      </SectionCard>
    </div>
  );
};

// ─── Placeholder Tabs ─────────────────────────────────────────────────────────
const StorageMapTab = () => (
  <div className="flex flex-col items-center justify-center h-80 bg-white rounded-2xl border border-slate-200 border-dashed gap-4 text-slate-400">
    <div className="p-4 bg-slate-100 rounded-2xl"><Grid3X3 className="h-10 w-10 text-slate-300" /></div>
    <div className="text-center">
      <p className="font-semibold text-slate-600">Storage Map View</p>
      <p className="text-sm mt-1">Graphical bin visualization — coming soon</p>
    </div>
  </div>
);

const PermissionsTab = () => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
      <h3 className="text-sm font-bold text-slate-800">Access Permissions</h3>
    </div>
    <div className="divide-y divide-slate-100">
      {[
        { r: 'Warehouse Manager', v: true, c: true,  e: true,  d: true  },
        { r: 'Stock Controller',  v: true, c: true,  e: true,  d: false },
        { r: 'Picker',            v: true, c: false, e: false, d: false },
      ].map((p, i) => (
        <div key={i} className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[#F5C742]/10 rounded-lg"><Users className="h-4 w-4 text-[#F5C742]" /></div>
            <span className="font-semibold text-slate-800 text-sm">{p.r}</span>
          </div>
          <div className="flex gap-4">
            {['View', 'Create', 'Edit', 'Delete'].map((a, j) => {
              const granted = [p.v, p.c, p.e, p.d][j];
              return (
                <div key={a} className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${granted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {granted ? '✓' : '✕'}
                  </span>
                  <span className="text-xs text-slate-500">{a}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AuditTab = () => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
      <h3 className="text-sm font-bold text-slate-800">Audit Trail</h3>
    </div>
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
      <Clock className="h-10 w-10 text-slate-300" />
      <p className="text-sm">No audit logs available yet</p>
    </div>
  </div>
);

export default Warehouse;
