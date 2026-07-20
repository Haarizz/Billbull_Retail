import React, { useState, useEffect } from 'react';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { GlobalBadge } from '../../../components/inventory/BranchScopeIndicators';
import {
  Layers, ChevronRight, Plus, Upload, Download, Search,
  ChevronDown, RefreshCw, SquarePen, Trash2, Eye,
  CircleCheckBig, CircleX, X, Package, AlertTriangle,
  TrendingUp, TrendingDown
} from 'lucide-react';

// --- API IMPORTS ---
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  exportDepartments
} from "../../../api/departmentsApi";

const Departments = () => {
  // --- STATE MANAGEMENT ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false); // New state for view modal
  const [viewData, setViewData] = useState(null); // New state for viewing data
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("Name");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [departments, setDepartments] = useState([]);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Initial Form State (barcode fields removed — now in Brand module)
  const initialFormState = {
    name: "",
    code: "",
    desc: ""
  };

  const [formData, setFormData] = useState(initialFormState);

  // --- API HANDLERS ---

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const data = await getDepartments();
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching departments:", err);
      alert("Failed to load departments from server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      alert("Please fill in Department Name and Code");
      return;
    }

    try {
      setSaveLoading(true);

      const payload = {
        name: formData.name,
        code: formData.code,
        desc: formData.desc
      };

      if (editingId) {
        await updateDepartment(editingId, payload);
      } else {
        await createDepartment(payload);
      }

      setIsModalOpen(false);
      fetchDepartments();
    } catch (err) {
      console.error("Error saving department:", err);
      alert(err?.response?.data?.message || "Operation failed. Please try again.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteClick = async (id) => {
    if (window.confirm("Are you sure you want to delete this department?")) {
      try {
        await deleteDepartment(id);
        fetchDepartments();
      } catch (err) {
        console.error("Error deleting department:", err);
        alert(err.response?.data?.message || "Failed to delete department.");
      }
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportDepartments();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'departments.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Failed to export departments:", err);
      alert("Failed to export departments.");
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

  const handleEditClick = (dept) => {
    setEditingId(dept.id);
    setFormData({
      name: dept.name || "",
      code: dept.code || "",
      desc: dept.desc || ""
    });
    setIsModalOpen(true);
  };

  const handleViewClick = (dept) => {
    setViewData(dept);
    setIsViewModalOpen(true);
  };

  // Client-side filtering & Sorting
  const filteredDepartments = departments
    .filter(dept => {
      const matchesSearch = (dept.name && dept.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (dept.code && dept.code.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesDept = deptFilter === "All Departments" || dept.name === deptFilter;
      return matchesSearch && matchesDept;
    })
    .sort((a, b) => {
      if (sortBy === "Name") return a.name.localeCompare(b.name);
      if (sortBy === "Items Count") return (b.count || 0) - (a.count || 0);
      if (sortBy === "Code") return a.code.localeCompare(b.code);
      return 0;
    });

  const LIST_PAGE_SIZE = 30;
  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [searchTerm, deptFilter, sortBy]);
  const pagedDepartments = filteredDepartments.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-4 md:p-6 space-y-6 font-sans text-slate-900">

      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground text-slate-500">
            <span>Inventory & Registries</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 font-medium">Departments</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Departments</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500">Manage department master & product categorization</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddClick}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50"
          >
            <Plus className="h-4 w-4" />
            Add Department
          </button>
          <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border bg-white hover:bg-slate-100 h-9 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Bulk Import</span>
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border bg-white hover:bg-slate-100 h-9 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Bulk Export</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Departments"
          value={departments.length}
          subValue="Active catalog"
          trend="up"
          icon={Layers}
          iconColor="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Total Products"
          value={departments.reduce((acc, d) => acc + (d.count || 0), 0)}
          subValue="Across all depts"
          trend="up"
          icon={Package}
          iconColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Avg. Products/Dept"
          value={departments.length > 0 ? Math.round(departments.reduce((acc, d) => acc + (d.count || 0), 0) / departments.length) : 0}
          subValue="Distribution"
          trend="neutral"
          icon={RefreshCw}
          iconColor="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Filters and Table Container */}
      <div className="flex flex-col gap-6 rounded-xl border bg-white border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 pb-0">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 pl-9 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                placeholder="Search by name or code..."
              />
            </div>
            {/* Department Filter */}
            <div className="relative">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="appearance-none w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none focus:ring-2 focus:ring-[#F5C742]/50 cursor-pointer"
              >
                <option>All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none focus:ring-2 focus:ring-[#F5C742]/50 cursor-pointer"
              >
                <option value="Name">Sort by Name</option>
                <option value="Items Count">Sort by Items</option>
                <option value="Code">Sort by Code</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pb-4">
            <p className="text-xs text-slate-500">Showing {filteredDepartments.length} departments</p>
            <button
              onClick={fetchDepartments}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium border bg-white hover:bg-slate-50 h-8 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto w-full">
          <table className="bb-nowrap-table w-full text-sm min-w-[600px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Department Name</th>
                <th className="text-left p-3 font-medium text-slate-600">Code</th>
                <th className="text-left p-3 font-medium text-slate-600">Description</th>
                <th className="text-left p-3 font-medium text-slate-600">Items Count</th>
                <th className="text-left p-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#F5C742]" />
                      <p>Loading departments...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-slate-500">
                    No departments found.
                  </td>
                </tr>
              ) : (
                pagedDepartments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-slate-50 hover:border-l-4 hover:border-l-[#F5C742] transition-all border-l-4 border-transparent group">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{dept.name}</p>
                        <GlobalBadge branchId={dept.branchId} />
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium border-slate-200 font-mono min-h-[24px] min-w-[30px]">{dept.code}</span>
                    </td>
                    <td className="p-3">
                      <p className="text-xs text-slate-500 line-clamp-1 max-w-xs">{dept.desc || "—"}</p>
                    </td>
                    <td className="p-3"><p className="font-semibold">{dept.count || 0}</p></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <ActionButton onClick={() => handleEditClick(dept)} icon={<SquarePen className="h-4 w-4" />} />
                        <ActionButton onClick={() => handleDeleteClick(dept.id)} icon={<Trash2 className="h-4 w-4" />} color="text-red-600 hover:bg-red-50" />
                        <ActionButton onClick={() => handleViewClick(dept)} icon={<Eye className="h-4 w-4" />} />
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
            totalElements={filteredDepartments.length}
            totalPages={Math.ceil(filteredDepartments.length / LIST_PAGE_SIZE)}
            onPageChange={setListPage}
          />
        </div>
      </div>

      {/* Add/Edit Department Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white z-50 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg shadow-lg flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="flex flex-col gap-1 border-b p-6 pb-4 relative">
              <h2 className="text-lg font-semibold leading-none">{editingId ? 'Edit Department' : 'Add New Department'}</h2>
              <p className="text-sm text-slate-500">Configure department details for product categorization</p>
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-6 p-6">

              {/* Section A - Basic Department Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <div className="h-8 w-8 rounded-lg bg-[#F5C742] flex items-center justify-center text-sm font-bold text-slate-900">A</div>
                  <h3 className="font-semibold">Basic Department Details</h3>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Department Name <span className="text-red-500">*</span></label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all"
                    placeholder="e.g., Grocery"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Department Code <span className="text-red-500">*</span></label>
                  <input
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all"
                    placeholder="e.g., 01"
                  />
                  <p className="text-xs text-slate-500">Numeric code for internal identification (e.g., 01, 11, 23)</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <textarea
                    name="desc"
                    value={formData.desc}
                    onChange={handleInputChange}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none resize-none transition-all"
                    placeholder="Brief description of this department..."
                  ></textarea>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end border-t p-6 bg-white rounded-b-lg">
              <button
                onClick={() => setIsModalOpen(false)}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveLoading ? 'Saving...' : 'Save Department'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* View Department Modal */}
      {isViewModalOpen && viewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsViewModalOpen(false)}></div>
          <div className="bg-white z-50 w-full max-w-lg rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">

            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-6 relative">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#F5C742]/10 flex items-center justify-center">
                  <Layers className="h-5 w-5 text-[#DDA61E]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Department Details</h2>
                  <p className="text-sm text-slate-500">Full information for <span className="font-medium text-slate-700">{viewData.name}</span></p>
                </div>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">

              {/* Primary Info */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3 w-3" /> Department Name
                  </label>
                  <p className="text-base font-semibold text-slate-900">{viewData.name}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <SquarePen className="h-3 w-3" /> Code
                  </label>
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-mono font-medium text-slate-700">
                      {viewData.code}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description Box */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  Description
                </label>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {viewData.desc ? viewData.desc : <span className="italic text-slate-400">No description provided for this department.</span>}
                </p>
              </div>

              {/* Stats / Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                  <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Products</p>
                    <p className="text-lg font-bold text-slate-900 leading-none">{viewData.count || 0}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                  <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Activity Status</p>
                    <p className="text-sm font-bold text-emerald-700 leading-none mt-1">Active</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end border-t border-slate-100 p-4 bg-slate-50/50">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium h-9 px-6 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm transition-all hover:shadow"
              >
                Close View
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

// Sub-components

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

const ActionButton = ({ icon, color = "text-slate-900", onClick }) => (
  <button onClick={onClick} className={`inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 p-0 ${color}`}>
    {icon}
  </button>
);

export default Departments;