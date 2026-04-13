import React, { useState, useEffect } from "react";
import {
  Layers,
  ChevronRight,
  Plus,
  Upload,
  Download,
  Search,
  ChevronDown,
  RefreshCw,
  SquarePen,
  Trash2,
  Eye,
  CircleCheckBig,
  CircleX,
  X,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
} from "lucide-react";

// --- API IMPORTS ---
import {
  getSubDepartments,
  createSubDepartment,
  updateSubDepartment,
  deleteSubDepartment,
  exportSubDepartments
} from "../../../api/subDepartmentsApi";

import { getDepartments } from "../../../api/departmentsApi";

const SubDepartments = () => {
  // --- STATE MANAGEMENT ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false); // New state for view modal
  const [viewData, setViewData] = useState(null); // New state for viewing data
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("Name");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [subDepartments, setSubDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);

  // Initial Form State
  const initialFormState = {
    name: "",
    code: "",
    parentDept: "", // This will store departmentId
    desc: "",
    isActive: true,
    allowOverride: false,
    autoCreateGroups: false,
    restrictTerminals: false,
  };

  const [formData, setFormData] = useState(initialFormState);

  // --- API HANDLERS ---

  useEffect(() => {
    fetchSubDepartments();
    fetchDepartments();
  }, []);

  const fetchSubDepartments = async () => {
    try {
      setLoading(true);
      const data = await getSubDepartments();

      // Map backend data to UI shape
      const mapped = data.map((sd) => ({
        id: sd.id,
        name: sd.name,
        code: sd.code,
        parent: sd.departmentName, // Name for display
        parentCode: sd.departmentCode,
        departmentId: sd.departmentId, // ID for editing/saving
        description: sd.description,
        items: sd.items || 0,
        brands: sd.brands || 0,
        noBarcode: sd.noBarcode || 0,
        status: sd.active ? "Active" : "Inactive",
      }));

      setSubDepartments(mapped);
    } catch (err) {
      console.error("Failed to load sub-departments", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data);
    } catch (err) {
      console.error("Failed to load departments", err);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code || !formData.parentDept) {
      alert("Please fill in Name, Code, and Parent Department");
      return;
    }

    const payload = {
      name: formData.name,
      code: formData.code,
      departmentId: Number(formData.parentDept),
      description: formData.desc,
      active: formData.isActive,
    };

    try {
      if (editingId) {
        await updateSubDepartment(editingId, payload);
      } else {
        await createSubDepartment(payload);
      }
      setIsModalOpen(false);
      fetchSubDepartments();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save sub-department");
    }
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm("Are you sure you want to delete this sub-department?"))
      return;
    try {
      await deleteSubDepartment(id);
      fetchSubDepartments();
    } catch (err) {
      alert(err.response?.data?.message || "Unable to delete sub-department");
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportSubDepartments();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sub_departments.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Failed to export sub-departments:", err);
      alert("Failed to export sub-departments.");
    }
  };

  // --- UI HANDLERS ---

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleAddClick = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEditClick = (subDept) => {
    setEditingId(subDept.id);
    setFormData({
      name: subDept.name,
      code: subDept.code,
      parentDept: subDept.departmentId, // Use the ID for the dropdown
      desc: subDept.description,
      isActive: subDept.status === "Active",
      allowOverride: subDept.allowOverride || false,
      autoCreateGroups: subDept.autoCreateGroups || false,
      restrictTerminals: subDept.restrictTerminals || false,
    });
    setIsModalOpen(true);
  };

  const handleViewClick = (subDept) => {
    setViewData(subDept);
    setIsViewModalOpen(true);
  };

  const filteredData = subDepartments
    .filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.includes(searchTerm) ||
        item.parent.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = deptFilter === "All Departments" || item.parent === deptFilter;
      return matchesSearch && matchesDept;
    })
    .sort((a, b) => {
      if (sortBy === "Name") return a.name.localeCompare(b.name);
      if (sortBy === "Items") return (b.items || 0) - (a.items || 0);
      if (sortBy === "Parent") return a.parent.localeCompare(b.parent);
      if (sortBy === "Code") return a.code.localeCompare(b.code);
      return 0;
    });

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-4 md:p-6 space-y-6 font-sans text-slate-900">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground text-slate-500">
            <span>Inventory & Registries</span>
            <ChevronRight className="h-4 w-4" />
            <span>Departments</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 font-medium">Sub-Departments</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Sub-Departments
            </h1>
          </div>
          <p className="text-sm md:text-base text-slate-500">
            Manage hierarchical product categorization & sub-department master
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddClick}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Sub-Department
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

      {/* Stats Cards - Updated UI */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Sub-Depts"
          value={subDepartments.length}
          subValue="Total categories"
          icon={Layers}
          iconColor="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Active Sub-Depts"
          value={subDepartments.filter((s) => s.status === "Active").length}
          subValue="Operational"
          trend="up"
          icon={CircleCheckBig}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Total Items"
          value={subDepartments.reduce((acc, curr) => acc + (curr.items || 0), 0)}
          subValue="Across sub-depts"
          icon={Package}
          iconColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Empty Sub-Depts"
          value={subDepartments.filter((s) => (s.items || 0) === 0).length}
          subValue="No items assigned"
          trend="down"
          icon={AlertTriangle}
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
                placeholder="Search by name, code, or department..."
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
                <option value="Items">Sort by Items</option>
                <option value="Parent">Sort by Department</option>
                <option value="Code">Sort by Code</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pb-4">
            <p className="text-xs text-slate-500">
              Showing {filteredData.length} sub-departments
            </p>
            <button
              onClick={fetchSubDepartments}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium border bg-white hover:bg-slate-50 h-8 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">
                  Sub-Department Name
                </th>
                <th className="text-left p-3 font-medium text-slate-600">
                  Code
                </th>
                <th className="text-left p-3 font-medium text-slate-600">
                  Parent Department
                </th>
                <th className="text-left p-3 font-medium text-slate-600">
                  Description
                </th>
                <th className="text-left p-3 font-medium text-slate-600">
                  Items
                </th>
                <th className="text-left p-3 font-medium text-slate-600">
                  Analytics
                </th>
                <th className="text-left p-3 font-medium text-slate-600">
                  Status
                </th>
                <th className="text-right p-3 font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#F5C742]" />
                    Loading sub-departments...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-slate-500">
                    No records found
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 hover:border-l-4 hover:border-l-[#F5C742] transition-all border-l-4 border-transparent group"
                  >
                    <td className="p-3">
                      <p className="font-medium text-slate-900">{item.name}</p>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium border-slate-200 font-mono min-h-[24px] min-w-[30px] bg-slate-50 text-slate-600">
                        {item.code}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-slate-900 font-medium">
                          {item.parent}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Code: {item.parentCode}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <p
                        className="text-xs text-slate-500 line-clamp-1 max-w-[200px]"
                        title={item.description}
                      >
                        {item.description}
                      </p>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{item.items}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {item.noBarcode > 0 && (
                          <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 font-medium text-[10px] bg-[#FFF4BF] text-amber-800 border-amber-300">
                            {item.noBarcode} No Barcode
                          </span>
                        )}
                        <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 font-medium text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          {item.brands} Brands
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      {item.status === "Active" ? (
                        <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-slate-50 text-emerald-600 border-slate-200">
                          <CircleCheckBig className="mr-1 h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-slate-50 text-slate-500 border-slate-200">
                          <CircleX className="mr-1 h-3 w-3" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          onClick={() => handleEditClick(item)}
                          icon={<SquarePen className="h-4 w-4" />}
                        />
                        <ActionButton
                          onClick={() => handleDeleteClick(item.id)}
                          icon={<Trash2 className="h-4 w-4" />}
                          color="text-red-600 hover:bg-red-50"
                        />
                        <ActionButton onClick={() => handleViewClick(item)} icon={<Eye className="h-4 w-4" />} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          ></div>
          <div className="bg-white z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-lg flex flex-col">
            <div className="flex flex-col gap-1 border-b p-6 pb-4 relative">
              <h2 className="text-lg font-semibold leading-none">
                {editingId ? "Edit Sub-Department" : "Add New Sub-Department"}
              </h2>
              <p className="text-sm text-slate-500">
                Configure sub-department details and hierarchical relationships
              </p>
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <div className="h-8 w-8 rounded-lg bg-[#F5C742] flex items-center justify-center text-sm font-bold text-slate-900">
                    A
                  </div>
                  <h3 className="font-semibold">Basic Details</h3>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Sub-Department Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none"
                    placeholder="e.g., Fresh Vegetables"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Select Department <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      name="parentDept"
                      value={formData.parentDept}
                      onChange={handleInputChange}
                      className="flex h-9 w-full appearance-none rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none bg-white"
                    >
                      <option value="">Choose parent department</option>

                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>

                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Sub-Department Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none bg-slate-50"
                    placeholder="e.g., 01-01"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Description (Optional)
                  </label>
                  <textarea
                    name="desc"
                    value={formData.desc}
                    onChange={handleInputChange}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none resize-none"
                  ></textarea>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      Status
                    </div>
                  </div>
                  <div
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isActive: !prev.isActive,
                      }))
                    }
                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-colors ${formData.isActive ? "bg-[#F5C742]" : "bg-slate-300"
                      }`}
                  >
                    <div
                      className={`h-5 w-5 rounded-full bg-white absolute top-0.5 shadow transition-all ${formData.isActive ? "right-0.5" : "left-0.5"
                        }`}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end border-t p-6 bg-white rounded-b-lg">
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-9 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-md"
              >
                {editingId ? "Save Changes" : "Save Sub-Department"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Sub-Department Modal */}
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
                  <h2 className="text-lg font-bold text-slate-900">Sub-Department Details</h2>
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
                    <Layers className="h-3 w-3" /> Sub-Department Name
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

              {/* Parent Department */}
              <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <label className="text-xs font-semibold text-blue-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <ChevronRight className="h-3 w-3" /> Parent Department
                </label>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{viewData.parent}</p>
                  <span className="text-xs font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-blue-100">
                    {viewData.parentCode}
                  </span>
                </div>
              </div>

              {/* Description Box */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  Description
                </label>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {viewData.description ? viewData.description : <span className="italic text-slate-400">No description provided for this sub-department.</span>}
                </p>
              </div>

              {/* Stats / Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-100 bg-white shadow-sm text-center">
                  <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
                    <Package className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-bold text-slate-900 leading-none">{viewData.items || 0}</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase mt-1">Total Items</p>
                </div>

                <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-100 bg-white shadow-sm text-center">
                  <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2">
                    <Layers className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-bold text-slate-900 leading-none">{viewData.brands || 0}</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase mt-1">Brands</p>
                </div>

                <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-100 bg-white shadow-sm text-center">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-2 ${viewData.status === "Active" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                    {viewData.status === "Active" ? <CircleCheckBig className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
                  </div>
                  <p className={`text-sm font-bold leading-none ${viewData.status === "Active" ? "text-emerald-700" : "text-red-700"}`}>{viewData.status}</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase mt-1">Status</p>
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


// Replaced with new StatCard component definition
const StatCard = ({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  iconColor,
}) => (
  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${iconColor}`}
      >
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-xs">
      {trend === "up" && (
        <span className="text-emerald-600 flex items-center font-medium mr-2">
          <TrendingUp className="mr-1 h-3 w-3" /> +2.5%
        </span>
      )}
      {trend === "down" && (
        <span className="text-red-600 flex items-center font-medium mr-2">
          <TrendingDown className="mr-1 h-3 w-3" /> -1.2%
        </span>
      )}
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
  <button
    onClick={onClick}
    className={`inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 ${color}`}
  >
    {icon}
  </button>
);

export default SubDepartments;