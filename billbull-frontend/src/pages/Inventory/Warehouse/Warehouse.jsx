import React, { useState, useEffect } from 'react';
import { Warehouse as WarehouseIcon, ChevronRight, Plus, Search, SquarePen, Trash2, MapPin, X, Package, Layers, Box, Clock, Activity, TrendingUp, Users, FileText, Map, Shield, Printer, AlertTriangle, Lock, Zap, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getWarehouseStockSummary } from '../../../api/warehouseApi';
import { getBranches } from '../../../api/branchApi';
import { hasRole } from '../../../api/auth';
import { useBranch } from '../../../context/BranchContext';
import { getZones, createZone, updateZone, deleteZone, getLocators, createLocator, updateLocator, deleteLocator, getBins, createBin, updateBin, deleteBin, getBinStock, addBinStock, deleteBinStock } from '../../../api/warehouseLocationApi';

const TreeNode = ({ item, level, type, isSelected, isExpanded, onSelect, onToggle, children }) => {
  const icons = { warehouse: WarehouseIcon, zone: Layers, locator: MapPin, bin: Box };
  const Icon = icons[type];
  const hasChildren = React.Children.count(children) > 0;
  const colors = { warehouse: 'text-[#F5C742]', zone: 'text-emerald-500', locator: 'text-blue-500', bin: 'text-orange-500' };
  return (
    <div>
      <div className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg text-xs font-medium transition-colors ${isSelected ? 'bg-[#F5C742] text-slate-900' : 'hover:bg-slate-100 text-slate-700'}`} style={{ paddingLeft: `${level * 16 + 12}px` }} onClick={() => onSelect(item, type)}>
        {hasChildren ? <button onClick={e => { e.stopPropagation(); onToggle(item.id, type); }} className="p-0.5"><ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></button> : <span className="w-5" />}
        <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-slate-900' : colors[type]}`} />
        <span className="truncate">{item.name || item.code}</span>
      </div>
      {isExpanded && children}
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon }) => (
  <div className="bg-[#FFFBEB] rounded-lg border border-[#F5C742]/30 p-4">
    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
      <Icon className="h-4 w-4 text-[#F5C742]" />
      {label}
    </div>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const StatusBadge = ({ status }) => {
  const isActive = status === 'Active' || status === 'active' || status === 'ACTIVE';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      {isActive ? '● ACTIVE' : status || 'Active'}
    </span>
  );
};

const Modal = ({ isOpen, onClose, title, subtitle, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div><h3 className="text-lg font-semibold text-slate-900">{title}</h3>{subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}</div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const createWarehouseForm = (branchId = '') => ({
  name: '',
  type: 'Warehouse',
  address: '',
  status: 'Active',
  capacity: 0,
  utilization: 0,
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

const extractErrorMessage = (error, fallbackMessage) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  fallbackMessage;

const Warehouse = () => {
  const { defaultBranch } = useBranch();
  const isAdmin = hasRole('ADMIN');
  const [warehouses, setWarehouses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [zones, setZones] = useState({});
  const [locators, setLocators] = useState({});
  const [bins, setBins] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({ type: null, item: null, parentId: null });
  const [expanded, setExpanded] = useState({ warehouses: {}, zones: {}, locators: {} });
  const [activeTab, setActiveTab] = useState('details');
  const [searchTerm, setSearchTerm] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [modal, setModal] = useState({ type: null, editing: null });
  const [form, setForm] = useState({});

  useEffect(() => { fetchWarehousesAndExpand(); }, []);
  useEffect(() => { fetchBranches(); }, []);

  useEffect(() => {
    if (modal.type === 'warehouse' && !modal.editing && !form.branchId && defaultBranch?.id) {
      setForm(prev => ({ ...prev, branchId: String(defaultBranch.id) }));
    }
  }, [modal.type, modal.editing, form.branchId, defaultBranch?.id]);

  const branchOptions = (() => {
    if (isAdmin) {
      return branches;
    }

    const scopedBranch = branches.find(branch => branch.id === defaultBranch?.id);
    if (scopedBranch) {
      return [scopedBranch];
    }

    return defaultBranch?.id ? [defaultBranch] : [];
  })();
  const branchSelectionLocked = !isAdmin && branchOptions.length <= 1;

  // Fetch all warehouses and auto-expand the tree
  const fetchWarehousesAndExpand = async () => {
    try {
      setLoading(true);
      const data = await getWarehouses();
      const warehouseList = Array.isArray(data) ? data : [];
      setWarehouses(warehouseList);

      // Auto-expand all warehouses and fetch their children
      const expandedWarehouses = {};
      const expandedZones = {};
      const expandedLocators = {};
      const allZones = {};
      const allLocators = {};
      const allBins = {};

      // Track first bin to auto-select
      let firstBin = null;
      let firstBinLocatorId = null;

      for (const wh of warehouseList) {
        expandedWarehouses[wh.id] = true;
        try {
          const zoneData = await getZones(wh.id);
          allZones[wh.id] = zoneData || [];

          for (const zone of (zoneData || [])) {
            expandedZones[zone.id] = true;
            try {
              const locatorData = await getLocators(zone.id);
              allLocators[zone.id] = locatorData || [];

              for (const loc of (locatorData || [])) {
                expandedLocators[loc.id] = true;
                try {
                  const binData = await getBins(loc.id);
                  allBins[loc.id] = binData || [];
                  // Capture the first bin for auto-selection
                  if (!firstBin && binData && binData.length > 0) {
                    firstBin = binData[0];
                    firstBinLocatorId = loc.id;
                  }
                } catch (e) { allBins[loc.id] = []; }
              }
            } catch (e) { allLocators[zone.id] = []; }
          }
        } catch (e) { allZones[wh.id] = []; }
      }

      setExpanded({ warehouses: expandedWarehouses, zones: expandedZones, locators: expandedLocators });
      setZones(allZones);
      setLocators(allLocators);
      setBins(allBins);

      // Auto-select the first bin
      if (firstBin) {
        setSelected({ type: 'bin', item: firstBin, parentId: firstBinLocatorId });
      }
    } catch (e) {
      console.error('Failed to fetch warehouses:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const data = await getBranches();
      setBranches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch branches:', e);
    }
  };

  const fetchZones = async (warehouseId) => {
    try { const data = await getZones(warehouseId); setZones(p => ({ ...p, [warehouseId]: data || [] })); }
    catch (e) { setZones(p => ({ ...p, [warehouseId]: [] })); }
  };

  const fetchLocators = async (zoneId) => {
    try { const data = await getLocators(zoneId); setLocators(p => ({ ...p, [zoneId]: data || [] })); }
    catch (e) { setLocators(p => ({ ...p, [zoneId]: [] })); }
  };

  const fetchBins = async (locatorId) => {
    try { const data = await getBins(locatorId); setBins(p => ({ ...p, [locatorId]: data || [] })); }
    catch (e) { setBins(p => ({ ...p, [locatorId]: [] })); }
  };

  const handleSelect = async (item, type, parentId = null) => {
    setSelected({ type, item, parentId }); setActiveTab('details');
  };

  const handleToggle = async (id, type) => {
    const key = type + 's';
    setExpanded(p => ({ ...p, [key]: { ...p[key], [id]: !p[key][id] } }));
  };

  const openModal = (type, item = null) => {
    setModal({ type, editing: item });
    if (type === 'warehouse') {
      if (item) {
        setForm({
          ...item,
          capacity: item.capacity ?? 0,
          utilization: item.utilization ?? 0,
          branchId: item.branchId ? String(item.branchId) : (defaultBranch?.id ? String(defaultBranch.id) : '')
        });
      } else {
        setForm(createWarehouseForm(defaultBranch?.id));
      }
    }
    if (type === 'zone') setForm(item || { code: '', name: '', description: '', zoneType: 'Storage', status: 'Active' });
    if (type === 'locator') setForm(item || { code: '', name: '', aisleNumber: '', rackNumber: '', status: 'Active' });
    if (type === 'bin') setForm(item || { code: '', name: '', capacity: 100, binType: 'Standard', status: 'Active' });
  };

  const closeModal = () => { setModal({ type: null, editing: null }); setForm({}); };

  const handleSave = async () => {
    try {
      if (modal.type === 'warehouse') {
        const payload = buildWarehousePayload(form, defaultBranch?.id || null);
        if (!payload.name) {
          toast.error('Warehouse name is required');
          return;
        }
        if (!payload.address) {
          toast.error('Warehouse address is required');
          return;
        }
        if (!payload.branchId) {
          toast.error('Select a branch before saving the warehouse');
          return;
        }

        if (modal.editing) {
          await updateWarehouse(modal.editing.id, payload);
          toast.success('Warehouse updated');
        } else {
          await createWarehouse(payload);
          toast.success('Warehouse created');
        }
        await fetchWarehousesAndExpand();
      } else if (modal.type === 'zone' && selected.item) {
        const warehouseId = selected.type === 'warehouse' ? selected.item.id : selected.parentId;
        modal.editing ? await updateZone(warehouseId, modal.editing.id, form) : await createZone(warehouseId, form);
        setZones(p => ({ ...p, [warehouseId]: null })); await fetchZones(warehouseId);
      } else if (modal.type === 'locator' && selected.item) {
        const zoneId = selected.type === 'zone' ? selected.item.id : selected.parentId;
        modal.editing ? await updateLocator(zoneId, modal.editing.id, form) : await createLocator(zoneId, form);
        setLocators(p => ({ ...p, [zoneId]: null })); await fetchLocators(zoneId);
      } else if (modal.type === 'bin' && selected.item) {
        const locatorId = selected.type === 'locator' ? selected.item.id : selected.parentId;
        modal.editing ? await updateBin(locatorId, modal.editing.id, form) : await createBin(locatorId, form);
        setBins(p => ({ ...p, [locatorId]: null })); await fetchBins(locatorId);
      }
      closeModal();
    } catch (e) {
      console.error('Failed to save:', e);
      toast.error(extractErrorMessage(e, 'Failed to save. Please try again.'));
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (!confirm('Delete this warehouse?')) return;
    try { await deleteWarehouse(id); fetchWarehousesAndExpand(); if (selected.item?.id === id) setSelected({ type: null, item: null, parentId: null }); }
    catch (e) { alert('Failed to delete warehouse.'); }
  };

  const handleDeleteZone = async (warehouseId, zoneId) => {
    if (!confirm('Delete this zone?')) return;
    try { await deleteZone(warehouseId, zoneId); setZones(p => ({ ...p, [warehouseId]: null })); fetchZones(warehouseId); if (selected.item?.id === zoneId) setSelected({ type: null, item: null, parentId: null }); }
    catch (e) { alert('Failed to delete zone.'); }
  };

  const handleDeleteLocator = async (zoneId, locatorId) => {
    if (!confirm('Delete this locator?')) return;
    try { await deleteLocator(zoneId, locatorId); setLocators(p => ({ ...p, [zoneId]: null })); fetchLocators(zoneId); if (selected.item?.id === locatorId) setSelected({ type: null, item: null, parentId: null }); }
    catch (e) { alert('Failed to delete locator.'); }
  };

  const handleDeleteBin = async (locatorId, binId) => {
    if (!confirm('Delete this bin?')) return;
    try { await deleteBin(locatorId, binId); setBins(p => ({ ...p, [locatorId]: null })); fetchBins(locatorId); if (selected.item?.id === binId) setSelected({ type: null, item: null, parentId: null }); }
    catch (e) { alert('Failed to delete bin.'); }
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'storage-map', label: 'Storage Map', icon: Map },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'audit', label: 'Audit Logs', icon: Clock }
  ];

  const filteredWarehouses = warehouses.filter(w => w.name?.toLowerCase().includes(searchTerm.toLowerCase()) && (!showActiveOnly || w.status === 'Active'));

  return (
    <div className="flex flex-col h-full bg-[#F7F7FA] font-sans">
      {/* Full-width Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-slate-500 mb-1">Inventory &amp; Registries → Warehouses &amp; Storage</div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <WarehouseIcon className="text-[#F5C742]" size={28} />
              Warehouses &amp; Storages
            </h1>
            <p className="text-sm text-slate-500 mt-1">Create, maintain, and optimize warehouse structure: zones, locators &amp; bins</p>
          </div>
          <button onClick={() => openModal('warehouse')} className="h-9 px-4 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-md text-sm font-bold flex items-center gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" />New Warehouse
          </button>
        </div>
      </div>

      {/* Tabs - Full Width */}
      {selected.item && (
        <div className="bg-white border-b border-slate-100 px-6">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors ${activeTab === t.id ? 'border-[#F5C742] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col h-64 lg:h-auto">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" placeholder="Find warehouse, zone, bin..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 text-xs bg-[#F7F7FA] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 mt-3 cursor-pointer">
              <input type="checkbox" checked={showActiveOnly} onChange={e => setShowActiveOnly(e.target.checked)} className="rounded text-[#F5C742] focus:ring-[#F5C742]" />
              Show only active
            </label>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? <div className="text-center py-8 text-slate-400 text-xs">Loading...</div> :
              filteredWarehouses.length === 0 ? <div className="text-center py-8 text-slate-400 text-xs">No warehouses found</div> :
                filteredWarehouses.map(wh => (
                  <TreeNode key={wh.id} item={wh} level={0} type="warehouse" isSelected={selected.type === 'warehouse' && selected.item?.id === wh.id} isExpanded={expanded.warehouses[wh.id]} onSelect={handleSelect} onToggle={handleToggle}>
                    {(zones[wh.id] || []).map(zone => (
                      <TreeNode key={zone.id} item={zone} level={1} type="zone" isSelected={selected.type === 'zone' && selected.item?.id === zone.id} isExpanded={expanded.zones[zone.id]} onSelect={(item, type) => handleSelect(item, type, wh.id)} onToggle={handleToggle}>
                        {(locators[zone.id] || []).map(loc => (
                          <TreeNode key={loc.id} item={loc} level={2} type="locator" isSelected={selected.type === 'locator' && selected.item?.id === loc.id} isExpanded={expanded.locators[loc.id]} onSelect={(item, type) => handleSelect(item, type, zone.id)} onToggle={handleToggle}>
                            {(bins[loc.id] || []).map(bin => (
                              <TreeNode key={bin.id} item={bin} level={3} type="bin" isSelected={selected.type === 'bin' && selected.item?.id === bin.id} isExpanded={false} onSelect={(item, type) => handleSelect(item, type, loc.id)} onToggle={() => { }} />
                            ))}
                          </TreeNode>
                        ))}
                      </TreeNode>
                    ))}
                  </TreeNode>
                ))
            }
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!selected.item ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 min-h-[300px]">
              <WarehouseIcon className="h-16 w-16 mb-4" />
              <p className="text-sm">Select a warehouse, zone, locator, or bin from the sidebar</p>
            </div>
          ) : activeTab === 'details' ? (
            selected.type === 'warehouse' ? <WarehouseDetail warehouse={selected.item} zones={zones[selected.item.id] || []} onEdit={() => openModal('warehouse', selected.item)} onDelete={() => handleDeleteWarehouse(selected.item.id)} onAddZone={() => openModal('zone')} onEditZone={z => openModal('zone', z)} onDeleteZone={id => handleDeleteZone(selected.item.id, id)} /> :
              selected.type === 'zone' ? <ZoneDetail zone={selected.item} locators={locators[selected.item.id] || []} onEdit={() => openModal('zone', selected.item)} onAddLocator={() => openModal('locator')} onEditLocator={l => openModal('locator', l)} onDeleteLocator={id => handleDeleteLocator(selected.item.id, id)} /> :
                selected.type === 'locator' ? <LocatorDetail locator={selected.item} bins={bins[selected.item.id] || []} onEdit={() => openModal('locator', selected.item)} onAddBin={() => openModal('bin')} onEditBin={b => openModal('bin', b)} onDeleteBin={id => handleDeleteBin(selected.item.id, id)} /> :
                  selected.type === 'bin' ? <BinDetail bin={selected.item} onEdit={() => openModal('bin', selected.item)} /> : null
          ) : activeTab === 'storage-map' ? <StorageMapTab /> : activeTab === 'permissions' ? <PermissionsTab /> : activeTab === 'audit' ? <AuditTab /> : null}
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={modal.type === 'warehouse'} onClose={closeModal} title={modal.editing ? 'Edit Warehouse' : 'Create New Warehouse'} subtitle="Add a new warehouse location">
        <div className="space-y-4">
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Branch *</label><select value={form.branchId || ''} onChange={e => setForm({ ...form, branchId: e.target.value })} disabled={branchOptions.length === 0 || branchSelectionLocked} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"><option value="">{branchOptions.length === 0 ? 'No branches available' : 'Select branch'}</option>{branchOptions.map(branch => (<option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` (${branch.code})` : ''}</option>))}</select>{branchOptions.length === 0 && <p className="mt-1 text-[11px] text-slate-400">Create a branch or assign one to your user before creating warehouses.</p>}</div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Warehouse Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="e.g. Main Distribution Center" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Type</label><select value={form.type || 'Warehouse'} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"><option>Warehouse</option><option>Distribution</option><option>Showroom</option><option>Fulfillment Center</option><option>Cold Storage</option></select></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Address *</label><input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="Industrial Area 1, Dubai" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Capacity (sqft)</label><input type="number" value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="5000" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label><select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"><option>Active</option><option>Inactive</option></select></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancel</button><button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-md">{modal.editing ? 'Update' : 'Create Warehouse'}</button></div>
        </div>
      </Modal>

      <Modal isOpen={modal.type === 'zone'} onClose={closeModal} title={modal.editing ? 'Edit Zone' : 'Create New Zone'} subtitle="Add a storage zone">
        <div className="space-y-4">
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Zone Code *</label><input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. A" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Zone Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. Zone A" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Type</label><select value={form.zoneType || 'Storage'} onChange={e => setForm({ ...form, zoneType: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"><option>Storage</option><option>Receiving</option><option>Shipping</option><option>Cold Storage</option><option>Quarantine</option></select></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label><select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"><option>Active</option><option>Inactive</option></select></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancel</button><button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-md">{modal.editing ? 'Update' : 'Create Zone'}</button></div>
        </div>
      </Modal>

      <Modal isOpen={modal.type === 'locator'} onClose={closeModal} title={modal.editing ? 'Edit Locator' : 'Create New Locator'} subtitle="Add a locator to the zone">
        <div className="space-y-4">
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Locator Code *</label><input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. A001" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Name</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. Aisle 1 Rack A" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Aisle</label><input value={form.aisleNumber || ''} onChange={e => setForm({ ...form, aisleNumber: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. 1" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Rack</label><input value={form.rackNumber || ''} onChange={e => setForm({ ...form, rackNumber: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. A" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancel</button><button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-md">{modal.editing ? 'Update' : 'Create Locator'}</button></div>
        </div>
      </Modal>

      <Modal isOpen={modal.type === 'bin'} onClose={closeModal} title={modal.editing ? 'Edit Bin' : 'Create New Bin'} subtitle="Add a bin to the locator">
        <div className="space-y-4">
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Bin Code *</label><input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. BIN01" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Name</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="e.g. Bin 01" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Capacity</label><input type="number" value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" placeholder="100" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Type</label><select value={form.binType || 'Standard'} onChange={e => setForm({ ...form, binType: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"><option>Standard</option><option>Bulk</option><option>Pick</option><option>Pallet</option></select></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancel</button><button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-slate-900 bg-[#F5C742] hover:bg-[#E5B732] rounded-md">{modal.editing ? 'Update' : 'Create Bin'}</button></div>
        </div>
      </Modal>
    </div>
  );
};

// ==================== DETAIL COMPONENTS ====================

const WarehouseDetail = ({ warehouse, zones, onEdit, onDelete, onAddZone, onEditZone, onDeleteZone }) => {
  const [stockSummary, setStockSummary] = useState({ totalSkus: 0, totalQty: 0, fastMoving: 0, expiring: 0, reserved: 0, deadStock: 0 });

  useEffect(() => {
    if (warehouse?.id) {
      getWarehouseStockSummary(warehouse.id)
        .then(data => setStockSummary(data))
        .catch(err => console.error('Failed to load stock summary:', err));
    }
  }, [warehouse?.id]);

  return (
    <div className="space-y-6">
      {/* Stock Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-lg border border-amber-200 p-4">
          <div className="flex items-center gap-2 text-xs text-amber-600 mb-1">
            <Package className="h-4 w-4" />
            Total SKUs
          </div>
          <p className="text-2xl font-bold text-slate-900">{stockSummary.totalSkus.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-lg border border-emerald-200 p-4">
          <div className="flex items-center gap-2 text-xs text-emerald-600 mb-1">
            <Box className="h-4 w-4" />
            On Hand Qty
          </div>
          <p className="text-2xl font-bold text-slate-900">{stockSummary.totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg border border-blue-200 p-4">
          <div className="flex items-center gap-2 text-xs text-blue-600 mb-1">
            <Zap className="h-4 w-4" />
            Fast Moving
          </div>
          <p className="text-2xl font-bold text-slate-900">{stockSummary.fastMoving.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-white rounded-lg border border-orange-200 p-4">
          <div className="flex items-center gap-2 text-xs text-orange-600 mb-1">
            <AlertTriangle className="h-4 w-4" />
            Expiring
          </div>
          <p className="text-2xl font-bold text-slate-900">{stockSummary.expiring.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg border border-purple-200 p-4">
          <div className="flex items-center gap-2 text-xs text-purple-600 mb-1">
            <Lock className="h-4 w-4" />
            Reserved
          </div>
          <p className="text-2xl font-bold text-slate-900">{stockSummary.reserved.toLocaleString()}</p>
        </div>
        <div className={`bg-gradient-to-br from-cyan-50 to-white rounded-lg border ${stockSummary.totalQty - stockSummary.reserved < 0 ? 'border-red-400 from-red-50' : 'border-cyan-200'} p-4`}>
          <div className={`flex items-center gap-2 text-xs ${stockSummary.totalQty - stockSummary.reserved < 0 ? 'text-red-600 font-bold' : 'text-cyan-600'} mb-1`}>
            <CheckCircle className="h-4 w-4" />
            Available
          </div>
          <p className={`text-2xl font-bold ${stockSummary.totalQty - stockSummary.reserved < 0 ? 'text-red-600' : 'text-slate-900'}`}>{(stockSummary.totalQty - stockSummary.reserved).toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
            <Clock className="h-4 w-4" />
            Dead Stock
          </div>
          <p className="text-2xl font-bold text-slate-900">{stockSummary.deadStock.toLocaleString()}</p>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">General Information</h3>
          <div className="flex gap-4">
            <button onClick={onEdit} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><SquarePen className="h-3.5 w-3.5" />Edit</button>
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-500 font-semibold"><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div><p className="text-xs text-[#F5C742] mb-1">Warehouse Name</p><p className="font-semibold text-slate-900">{warehouse.name}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Type</p><p className="font-semibold text-slate-900 uppercase">{warehouse.type || 'WAREHOUSE'}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Status</p><StatusBadge status={warehouse.status} /></div>
          <div><p className="text-xs text-slate-500 mb-1">Branch</p><p className="font-semibold text-slate-900">{warehouse.branchName || '-'}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Address</p><p className="font-semibold text-slate-900">{warehouse.address || '-'}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Capacity</p><p className="font-semibold text-slate-900">{warehouse.capacity ? `${warehouse.capacity} sqft` : '-'}</p></div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Storage Zones ({zones.length})</h3>
          <button onClick={onAddZone} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><Plus className="h-3.5 w-3.5" />New Zone</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr><th className="px-6 py-3 text-left whitespace-nowrap">Code</th><th className="px-6 py-3 text-left whitespace-nowrap">Name</th><th className="px-6 py-3 text-left whitespace-nowrap">Type</th><th className="px-6 py-3 text-left whitespace-nowrap">Status</th><th className="px-6 py-3 text-center whitespace-nowrap">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zones.map(z => (
                <tr key={z.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{z.code}</td>
                  <td className="px-6 py-3 text-slate-600">{z.name}</td>
                  <td className="px-6 py-3 text-slate-600">{z.zoneType || 'Storage'}</td>
                  <td className="px-6 py-3"><StatusBadge status={z.status} /></td>
                  <td className="px-6 py-3 flex justify-center gap-3">
                    <button onClick={() => onEditZone(z)} className="text-slate-400 hover:text-[#F5C742]"><SquarePen className="h-4 w-4" /></button>
                    <button onClick={() => onDeleteZone(z.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {zones.length === 0 && <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400">No zones created yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ZoneDetail = ({ zone, locators, onEdit, onAddLocator, onEditLocator, onDeleteLocator }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Locators" value={locators.length} icon={MapPin} />
      <StatCard label="Zone Type" value={zone.zoneType || 'Storage'} icon={Layers} />
      <StatCard label="Status" value={zone.status?.toUpperCase() || 'ACTIVE'} icon={Activity} />
    </div>
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">Zone Information</h3>
        <button onClick={onEdit} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><SquarePen className="h-3.5 w-3.5" />Edit</button>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div><p className="text-xs text-[#F5C742] mb-1">Zone Code</p><p className="font-semibold text-slate-900">{zone.code}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Name</p><p className="font-semibold text-slate-900">{zone.name}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Type</p><p className="font-semibold text-slate-900">{zone.zoneType || 'Storage'}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Status</p><StatusBadge status={zone.status} /></div>
        <div className="col-span-2"><p className="text-xs text-slate-500 mb-1">Description</p><p className="font-semibold text-slate-900">{zone.description || '-'}</p></div>
      </div>
    </div>
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">Locators ({locators.length})</h3>
        <button onClick={onAddLocator} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><Plus className="h-3.5 w-3.5" />New Locator</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr><th className="px-6 py-3 text-left whitespace-nowrap">Code</th><th className="px-6 py-3 text-left whitespace-nowrap">Name</th><th className="px-6 py-3 text-left whitespace-nowrap">Aisle</th><th className="px-6 py-3 text-left whitespace-nowrap">Rack</th><th className="px-6 py-3 text-left whitespace-nowrap">Status</th><th className="px-6 py-3 text-center whitespace-nowrap">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {locators.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-medium text-slate-900">{l.code}</td>
                <td className="px-6 py-3 text-slate-600">{l.name || '-'}</td>
                <td className="px-6 py-3 text-slate-600">{l.aisleNumber || '-'}</td>
                <td className="px-6 py-3 text-slate-600">{l.rackNumber || '-'}</td>
                <td className="px-6 py-3"><StatusBadge status={l.status} /></td>
                <td className="px-6 py-3 flex justify-center gap-3">
                  <button onClick={() => onEditLocator(l)} className="text-slate-400 hover:text-[#F5C742]"><SquarePen className="h-4 w-4" /></button>
                  <button onClick={() => onDeleteLocator(l.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {locators.length === 0 && <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">No locators created yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const LocatorDetail = ({ locator, bins, onEdit, onAddBin, onEditBin, onDeleteBin }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Bins" value={bins.length} icon={Box} />
      <StatCard label="Aisle" value={locator.aisleNumber || '-'} icon={MapPin} />
      <StatCard label="Rack" value={locator.rackNumber || '-'} icon={Layers} />
      <StatCard label="Status" value={locator.status?.toUpperCase() || 'ACTIVE'} icon={Activity} />
    </div>
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">Locator Information</h3>
        <button onClick={onEdit} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><SquarePen className="h-3.5 w-3.5" />Edit</button>
      </div>
      <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <div><p className="text-xs text-[#F5C742] mb-1">Locator Code</p><p className="font-semibold text-slate-900">{locator.code}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Name</p><p className="font-semibold text-slate-900">{locator.name || '-'}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Aisle</p><p className="font-semibold text-slate-900">{locator.aisleNumber || '-'}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Rack</p><p className="font-semibold text-slate-900">{locator.rackNumber || '-'}</p></div>
        <div><p className="text-xs text-slate-500 mb-1">Status</p><StatusBadge status={locator.status} /></div>
      </div>
    </div>
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">Bins ({bins.length})</h3>
        <button onClick={onAddBin} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><Plus className="h-3.5 w-3.5" />New Bin</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr><th className="px-6 py-3 text-left whitespace-nowrap">Code</th><th className="px-6 py-3 text-left whitespace-nowrap">Name</th><th className="px-6 py-3 text-left whitespace-nowrap">Capacity</th><th className="px-6 py-3 text-left whitespace-nowrap">Type</th><th className="px-6 py-3 text-left whitespace-nowrap">Status</th><th className="px-6 py-3 text-center whitespace-nowrap">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bins.map(b => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-medium text-slate-900">{b.code}</td>
                <td className="px-6 py-3 text-slate-600">{b.name || '-'}</td>
                <td className="px-6 py-3 text-slate-600">{b.capacity || '-'}</td>
                <td className="px-6 py-3 text-slate-600">{b.binType || 'Standard'}</td>
                <td className="px-6 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-6 py-3 flex justify-center gap-3">
                  <button onClick={() => onEditBin(b)} className="text-slate-400 hover:text-[#F5C742]"><SquarePen className="h-4 w-4" /></button>
                  <button onClick={() => onDeleteBin(b.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {bins.length === 0 && <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">No bins created yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const BinDetail = ({ bin, onEdit }) => {
  const [binStock, setBinStock] = React.useState([]);
  const [stockLoading, setStockLoading] = React.useState(false);

  React.useEffect(() => {
    if (bin?.id) {
      setStockLoading(true);
      getBinStock(bin.id)
        .then(data => setBinStock(data || []))
        .catch(() => setBinStock([]))
        .finally(() => setStockLoading(false));
    }
  }, [bin?.id]);

  const currentQty = binStock.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const skuCount = new Set(binStock.map(s => s.productCode)).size;
  const capacityUsage = bin.capacity ? Math.round((currentQty / bin.capacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Bin Code" value={bin.code} icon={Box} />
        <StatCard label="Max Qty" value={bin.capacity || '-'} icon={Package} />
        <StatCard label="Current Qty" value={currentQty} icon={TrendingUp} />
        <StatCard label="SKU Count" value={skuCount} icon={Layers} />
      </div>
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Bin Information</h3>
          <div className="flex gap-4">
            <button className="flex items-center gap-1 text-xs text-slate-600 font-semibold"><Printer className="h-3.5 w-3.5" />Print Barcode</button>
            <button onClick={onEdit} className="flex items-center gap-1 text-xs text-[#F5C742] font-semibold"><SquarePen className="h-3.5 w-3.5" />Edit</button>
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <div><p className="text-xs text-[#F5C742] mb-1">Bin Code</p><p className="text-xl font-bold text-slate-900">{bin.code}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Max Qty</p><p className="font-semibold text-slate-900">{bin.capacity || '-'}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Current Qty</p><p className="font-semibold text-[#F5C742]">{currentQty}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">SKU Count</p><p className="font-semibold text-slate-900">{skuCount}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Status</p><StatusBadge status={bin.status} /></div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Capacity Usage</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${capacityUsage > 85 ? 'bg-red-500' : capacityUsage > 60 ? 'bg-[#F5C742]' : 'bg-emerald-500'}`} style={{ width: `${Math.min(capacityUsage, 100)}%` }} />
              </div>
              <span className="text-sm font-semibold text-slate-900">{capacityUsage}%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Current Stock Snapshot</h3>
        </div>
        {stockLoading ? (
          <div className="p-8 text-center text-slate-400">Loading stock...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left whitespace-nowrap">SKU</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap">DESCRIPTION</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap">BATCH</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap">ON HAND</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap">EXPIRY</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap">RESERVED</th>
                  <th className="px-6 py-3 text-left whitespace-nowrap">AVAILABLE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {binStock.map((s, idx) => {
                  const onHand = s.quantity || 0;
                  const reserved = s.reservedQuantity || 0;
                  const available = onHand - reserved;
                  return (
                    <tr key={s.stockIdentityKey || `${s.id || 'row'}-${idx}`} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium text-slate-900">{s.productCode || '-'}</td>
                      <td className="px-6 py-3 text-slate-600">{s.productName || '-'}</td>
                      <td className="px-6 py-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">{s.batchNumber || '-'}</span></td>
                      <td className="px-6 py-3 font-medium text-slate-900">{onHand}</td>
                      <td className="px-6 py-3 text-slate-600">{s.expiryDate || '-'}</td>
                      <td className="px-6 py-3 text-slate-600">{reserved}</td>
                      <td className="px-6 py-3 font-medium text-slate-900">
                        <span className={available < 0 ? 'text-red-500 font-bold' : ''}>
                          {available}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {binStock.length === 0 && (
                  <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400">No stock in this bin</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== PLACEHOLDER TABS ====================

const StorageMapTab = () => (
  <div className="flex flex-col items-center justify-center h-96 bg-white rounded-lg border border-slate-200">
    <WarehouseIcon className="h-16 w-16 text-slate-300 mb-4" />
    <h3 className="font-semibold text-slate-800 mb-2">Storage Map View</h3>
    <p className="text-slate-500 text-sm">Graphical visualization coming soon</p>
  </div>
);

const PermissionsTab = () => (
  <div className="bg-white rounded-lg border border-slate-200">
    <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-800">Access Permissions</h3></div>
    <div className="divide-y divide-slate-100">
      {[{ r: 'Warehouse Manager', v: true, c: true, e: true, d: true }, { r: 'Stock Controller', v: true, c: true, e: true, d: false }, { r: 'Picker', v: true, c: false, e: false, d: false }].map((p, i) => (
        <div key={i} className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><Users className="h-4 w-4 text-[#F5C742]" /><span className="font-semibold text-slate-900 text-sm">{p.r}</span></div>
          <div className="flex gap-6">{['View', 'Create', 'Edit', 'Delete'].map((a, j) => <div key={a} className="flex items-center gap-1"><span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${[p.v, p.c, p.e, p.d][j] ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>✓</span><span className="text-xs text-slate-600">{a}</span></div>)}</div>
        </div>
      ))}
    </div>
  </div>
);

const AuditTab = () => (
  <div className="bg-white rounded-lg border border-slate-200">
    <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-800">Audit Trail</h3></div>
    <div className="p-6 text-center text-slate-400 text-sm">No audit logs available yet</div>
  </div>
);

export default Warehouse;
