import React, { useState, useEffect } from 'react';
import {
  Scale, ChevronRight, Plus, Upload, Download, Search,
  ChevronDown, RefreshCw, SquarePen, Trash2, Eye,
  CircleCheckBig, CircleX, X, Network, Package,
  TrendingUp, TrendingDown, Layers, Box
} from 'lucide-react';

// --- API IMPORTS ---
import {
  getUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  exportUnits
} from "../../../api/unitsApi";
import HierarchyBuilderModal from './HierarchyBuilderModal';
import PaginationFooter from '../../../components/common/PaginationFooter';

const Units = () => {
  // --- STATE MANAGEMENT ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHierarchyModalOpen, setIsHierarchyModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("Name");
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  // Initial Form State
  const initialFormState = {
    name: "",
    symbol: "",
    desc: "",
    baseUnitId: "",
    conversionRate: ""
  };

  const [formData, setFormData] = useState(initialFormState);

  // --- API HANDLERS ---

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const data = await getUnits();
      setUnits(data);
    } catch (err) {
      console.error("Failed to load units", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.symbol) {
      alert("Please fill in Unit Name and Symbol");
      return;
    }

    const payload = {
      name: formData.name,
      symbol: formData.symbol.toUpperCase(),
      description: formData.desc,
      baseUnitId: formData.baseUnitId ? Number(formData.baseUnitId) : null,
      conversionRate: formData.conversionRate ? Number(formData.conversionRate) : null
    };

    try {
      if (editingId) {
        await updateUnit(editingId, payload);
      } else {
        await createUnit(payload);
      }
      setIsModalOpen(false);
      fetchUnits(); // Refresh list from backend
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to save unit");
    }
  };

  const handleDeleteClick = async (id) => {
    if (window.confirm("Are you sure you want to delete this unit?")) {
      try {
        await deleteUnit(id);
        fetchUnits(); // Refresh list from backend
      } catch (err) {
        alert(err?.response?.data?.message || "Cannot delete this unit");
      }
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportUnits();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'units.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Failed to export units:", err);
      alert("Failed to export units.");
    }
  };

  // --- UI HANDLERS ---

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddClick = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEditClick = (unit) => {
    setEditingId(unit.id);
    setFormData({
      name: unit.name,
      symbol: unit.symbol,
      desc: unit.description || "",
      baseUnitId: unit.baseUnitId || "",
      conversionRate: unit.conversionRate || ""
    });
    setIsModalOpen(true);
  };

  // Filter logic (runs on the data returned from backend)
  // Filter & Sort logic (runs on the data returned from backend)
  const filteredData = units
    .filter(item =>
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.symbol?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "Name") return a.name.localeCompare(b.name);
      if (sortBy === "Symbol") return a.symbol.localeCompare(b.symbol);
      if (sortBy === "Usage") return (b.usedIn || 0) - (a.usedIn || 0);
      return 0;
    });

  const LIST_PAGE_SIZE = 30;
  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [searchTerm, sortBy]);
  const pagedUnits = filteredData.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-4 md:p-6 space-y-6 font-sans text-slate-900">

      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Inventory & Registries</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 font-medium">Units</span>
          </div>
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Units</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500">Manage multi-level UoM conversion, packing hierarchy & product integration</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddClick}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Unit
          </button>
          <button
            onClick={() => setIsHierarchyModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors border bg-white hover:text-slate-900 h-9 px-4 py-2 border-[#F5C742] text-[#F5C742] hover:bg-[#FFF4BF]">
            <Network className="h-4 w-4" />
            Manage Hierarchy
          </button>
          <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border bg-white hover:bg-slate-100 h-9 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border bg-white hover:bg-slate-100 h-9 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Stats Cards - Updated UI with 3 Columns */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total Units"
          value={units.length > 0 ? units.length : "-"}
          subValue="Active definitions"
          icon={Scale}
          iconColor="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Most Used Unit"
          value={units.length > 0 ? units.reduce((max, unit) => (unit.usedIn > max.usedIn ? unit : max), units[0]).name : "-"}
          subValue={units.length > 0 ? `${units.reduce((max, unit) => (unit.usedIn > max.usedIn ? unit : max), units[0]).usedIn} products` : "No data"}
          trend="up"
          icon={TrendingUp}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Products Using Units"
          value={units.length > 0 ? units.reduce((acc, curr) => acc + (curr.usedIn || 0), 0) : "-"}
          subValue="Inventory impact"
          trend="up"
          icon={Package}
          iconColor="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="flex flex-col gap-6 rounded-xl border bg-white border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 pb-0">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 pl-9 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                placeholder="Search by name or symbol..."
              />
            </div>
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none focus:ring-2 focus:ring-[#F5C742]/50 cursor-pointer"
              >
                <option value="Name">Sort by Name</option>
                <option value="Symbol">Sort by Symbol</option>
                <option value="Usage">Sort by Usage</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pb-4">
            <p className="text-xs text-slate-500">Showing {filteredData.length} of {units.length} units</p>
            <button
              onClick={fetchUnits}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium border bg-white hover:bg-slate-50 h-8 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="bb-nowrap-table w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Unit Name</th>
                <th className="text-left p-3 font-medium text-slate-600">Symbol</th>
                <th className="text-left p-3 font-medium text-slate-600">Used In Products</th>
                <th className="text-left p-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="4" className="p-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#F5C742]" />
                    Loading units...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan="4" className="p-12 text-center text-slate-500">No units found.</td></tr>
              ) : (
                pagedUnits.map((unit) => (
                  <tr key={unit.id} className="hover:bg-slate-50 hover:border-l-4 hover:border-l-[#F5C742] transition-all border-l-4 border-transparent group">
                    <td className="p-3">
                      <p className="font-medium text-slate-900">{unit.name}</p>
                      <p className="text-xs text-slate-500 line-clamp-1 max-w-xs" title={unit.description}>
                        {unit.baseUnitId ? `Level ${unit.baseUnitName} • ` : 'Foundation Unit • '}
                        {unit.description}
                      </p>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium border-slate-200 font-mono min-h-[24px] text-slate-900">
                        {unit.symbol}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{unit.usedIn || 0}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <ActionButton onClick={() => handleEditClick(unit)} icon={<SquarePen className="h-4 w-4" />} />
                        <ActionButton onClick={() => handleDeleteClick(unit.id)} icon={<Trash2 className="h-4 w-4" />} color="text-red-600 hover:bg-red-50" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationFooter
            page={listPage}
            size={LIST_PAGE_SIZE}
            totalElements={filteredData.length}
            totalPages={Math.ceil(filteredData.length / LIST_PAGE_SIZE)}
            onPageChange={setListPage}
          />
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-lg flex flex-col">

            <div className="flex flex-col gap-2 p-6 pb-4 border-b border-slate-100 relative">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Unit' : 'Add New Unit'}</h2>
              <p className="text-sm text-slate-500">Configure unit details and conversion factors</p>
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <div className="h-8 w-8 rounded-lg bg-[#F5C742] flex items-center justify-center text-sm font-bold text-slate-900">A</div>
                  <h3 className="font-semibold">Basic Unit Details</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Unit Name <span className="text-red-500">*</span></label>
                    <input name="name" value={formData.name} onChange={handleInputChange} className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm outline-none" placeholder="e.g., Carton" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Symbol <span className="text-red-500">*</span></label>
                    <input name="symbol" value={formData.symbol} onChange={handleInputChange} className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm outline-none" placeholder="e.g., CTN" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <textarea name="desc" value={formData.desc} onChange={handleInputChange} className="flex min-h-[80px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none resize-none" placeholder="Brief description..." rows={3}></textarea>
                </div>

                {/* Addition for Hierarchy support */}
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 pt-4">
                  <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
                    <Layers className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold">Conversion & Hierarchy</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Base Unit <span className="text-slate-400 text-xs font-normal">(Leave blank if this is a base unit)</span></label>
                    <select
                      name="baseUnitId"
                      value={formData.baseUnitId}
                      onChange={handleInputChange}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                    >
                      <option value="">-- No Base Unit (Foundation) --</option>
                      {units.filter(u => u.id !== editingId).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Conversion Rate <span className="text-slate-400 text-xs font-normal">(Total base units)</span></label>
                    <input
                      type="number"
                      step="0.0001"
                      name="conversionRate"
                      value={formData.conversionRate}
                      onChange={handleInputChange}
                      disabled={!formData.baseUnitId}
                      className="flex h-10 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none bg-white read-only:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 focus:ring-2 focus:ring-[#F5C742]/50"
                      placeholder={formData.baseUnitId ? "e.g., 100" : "1"}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end border-t border-slate-100 p-6 pt-4 bg-white rounded-b-lg">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 rounded-md text-sm">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-md text-sm font-medium">
                {editingId ? 'Save Changes' : 'Save Unit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <HierarchyBuilderModal
        isOpen={isHierarchyModalOpen}
        onClose={() => setIsHierarchyModalOpen(false)}
        units={units}
      />
    </div>
  );
};

const StatCard = ({ label, value, subValue, trend, icon: Icon, iconColor }) => (
  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconColor}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-xs">
      {trend === 'up' && <span className="text-emerald-600 flex items-center font-medium mr-2"><TrendingUp className="mr-1 h-3 w-3" /> +2.5%</span>}
      {trend === 'down' && <span className="text-red-600 flex items-center font-medium mr-2"><TrendingDown className="mr-1 h-3 w-3" /> -1.2%</span>}
      <span className="text-slate-500">{subValue}</span>
    </div>
  </div>
);

const SelectButton = ({ placeholder }) => (
  <button className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
    <span>{placeholder}</span>
    <ChevronDown className="h-4 w-4 opacity-50" />
  </button>
);

const ActionButton = ({ icon, color = "text-slate-900", onClick }) => (
  <button onClick={onClick} className={`inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 ${color}`}>{icon}</button>
);

export default Units;