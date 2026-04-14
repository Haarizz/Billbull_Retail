import React, { useState, useRef, useEffect } from 'react';
import {
  Tag, ChevronRight, Plus, Upload, Download, Search,
  ChevronDown, RefreshCw, SquarePen, Trash2, Eye,
  CircleCheckBig, CircleX, X, Image as ImageIcon, Globe,
  Package, Calendar, User, Edit, TrendingUp, TrendingDown,
  AlertTriangle
} from 'lucide-react';

// --- API IMPORTS ---
import { getImageUrl } from "../../../utils/urlUtils";
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  exportBrands
} from "../../../api/brandsApi";

const Brand = () => {
  // --- STATE MANAGEMENT ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewingBrand, setViewingBrand] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // --- FILTER STATE ---
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [countryFilter, setCountryFilter] = useState("All Countries");
  const [sortBy, setSortBy] = useState("Name");

  const uniqueCountries = ["All Countries", ...new Set(brands.map(b => b.country).filter(c => c !== "—" && c))];

  // Initial Form State
  const initialFormState = {
    name: "",
    code: "",
    description: "",
    country: "",
    region: "",
    logo: null,
    logoPreview: null,
    tags: [],
    isActive: true,
    // Barcode fields
    prefix: "",
    prefixLength: 2,
    suffixLength: 8,
    auto: false,
    ruleGlobalUnique: true,
    ruleBrandUnique: false,
    ruleManualOverride: false
  };

  const [formData, setFormData] = useState(initialFormState);

  const availableTags = [
    "Premium", "Local Brand", "Imported", "Eco-friendly", "Organic",
    "Branded", "Non-Branded", "Luxury", "Budget-Friendly", "International"
  ];

  // --- API HANDLERS ---

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const data = await getBrands();


      // Map backend fields to UI shape
      const mapped = data.map(b => ({
        id: b.id,
        name: b.name,
        code: b.code,
        description: b.description,
        country: b.country || "—",
        region: b.region || "—",
        // Handle images robustly using the API base URL
        logo: b.logoUrl ? getImageUrl(b.logoUrl) : null,
        initials: b.name.substring(0, 2).toUpperCase(),
        status: b.active ? "Active" : "Inactive",
        tags: b.tags || [],
        products: b.productsCount || 0,
        created: b.createdAt || "—",
        lastUpdated: b.updatedAt || "—",
        // Barcode fields
        prefix: b.prefix || "",
        prefixLength: b.prefixLength || 2,
        suffixLength: b.suffixLength || 8,
        rule: b.rule || "",
        auto: b.auto || false,
        ruleGlobalUnique: b.ruleGlobalUnique !== undefined ? b.ruleGlobalUnique : true,
        ruleBrandUnique: b.ruleBrandUnique || false,
        ruleManualOverride: b.ruleManualOverride || false
      }));
      setBrands(mapped);
    } catch (err) {
      console.error("Failed to load brands", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      alert("Please fill in Brand Name and Code");
      return;
    }

    const payload = {
      name: formData.name,
      code: formData.code,
      description: formData.description,
      country: formData.country,
      region: formData.region,
      active: formData.isActive,
      tags: formData.tags,
      // Barcode fields
      prefix: formData.prefix,
      prefixLength: parseInt(formData.prefixLength) || 2,
      suffixLength: parseInt(formData.suffixLength) || 8,
      auto: formData.auto,
      ruleGlobalUnique: formData.ruleGlobalUnique,
      ruleBrandUnique: formData.ruleBrandUnique,
      ruleManualOverride: formData.ruleManualOverride
    };

    try {
      if (editingId) {
        await updateBrand(editingId, payload, formData.logo);
      } else {
        await createBrand(payload, formData.logo);
      }
      setIsModalOpen(false);
      fetchBrands();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save brand");
    }
  };

  const handleDeleteClick = async (id) => {
    if (window.confirm("Are you sure you want to delete this brand?")) {
      try {
        await deleteBrand(id);
        fetchBrands();
      } catch (err) {
        alert(err.response?.data?.message || "Unable to delete brand");
      }
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportBrands();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'brands.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Failed to export brands:", err);
      alert("Failed to export brands.");
    }
  };

  // --- UI HANDLERS ---

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Auto-populate prefix when code changes (UX feature)
    if (name === "code") {
      setFormData(prev => ({ ...prev, code: value, prefix: value }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setFormData(prev => ({
        ...prev,
        logo: file,
        logoPreview: previewUrl
      }));
    }
  };

  const handleTagToggle = (tag) => {
    setFormData(prev => {
      const newTags = prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag];
      return { ...prev, tags: newTags };
    });
  };

  const handleAddClick = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEditClick = (brand) => {
    setEditingId(brand.id);
    setFormData({
      name: brand.name,
      code: brand.code,
      description: brand.description,
      country: brand.country === '—' ? "" : brand.country,
      region: brand.region === '—' ? "" : brand.region,
      isActive: brand.status === 'Active',
      tags: brand.tags || [],
      logo: null,
      logoPreview: brand.logo,
      // Barcode fields
      prefix: brand.prefix || brand.code || "",
      prefixLength: brand.prefixLength || 2,
      suffixLength: brand.suffixLength || 8,
      auto: brand.auto || false,
      ruleGlobalUnique: brand.ruleGlobalUnique !== undefined ? brand.ruleGlobalUnique : true,
      ruleBrandUnique: brand.ruleBrandUnique || false,
      ruleManualOverride: brand.ruleManualOverride || false
    });
    setIsModalOpen(true);
  };

  const handleViewClick = (brand) => {
    setViewingBrand(brand);
    setIsViewModalOpen(true);
  };

  const openEditFromView = () => {
    if (viewingBrand) {
      handleEditClick(viewingBrand);
      setIsViewModalOpen(false);
    }
  }

  const filteredData = brands
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "All Status" || item.status === (statusFilter === "Active" ? "Active" : "Inactive");
      const matchesCountry = countryFilter === "All Countries" || item.country === countryFilter;

      return matchesSearch && matchesStatus && matchesCountry;
    })
    .sort((a, b) => {
      if (sortBy === "Name") return a.name.localeCompare(b.name);
      if (sortBy === "Date") return new Date(b.created) - new Date(a.created);
      if (sortBy === "Product Count") return b.products - a.products;
      return 0;
    });

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-4 md:p-6 space-y-6 font-sans text-slate-900">

      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Inventory & Registries</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 font-medium">Brands</span>
          </div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Brands</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500">Manage brand master with barcode prefix configuration & product integration</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleAddClick} className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm outline-none">
            <Plus className="h-4 w-4" />
            Add Brand
          </button>
          <button className="inline-flex items-center justify-center text-sm font-medium border bg-white hover:bg-slate-100 h-9 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 outline-none">
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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Brands"
          value={brands.length}
          subValue="Total catalog"
          trend="up"
          icon={Tag}
          iconColor="bg-slate-100 text-slate-600"
        />

        <StatCard
          label="Active Brands"
          value={brands.filter(b => b.status === 'Active').length}
          subValue="Operational"
          trend="up"
          icon={CircleCheckBig}
          iconColor="bg-emerald-50 text-emerald-600"
        />

        <StatCard
          label="Auto-Generated"
          value={brands.filter(b => b.auto).length}
          subValue="Barcode enabled"
          trend="neutral"
          icon={RefreshCw}
          iconColor="bg-amber-50 text-amber-600"
        />

        <StatCard
          label="Total Products"
          value={brands.reduce((acc, curr) => acc + curr.products, 0)}
          subValue="Across all brands"
          trend="up"
          icon={Package}
          iconColor="bg-blue-50 text-blue-600"
        />
      </div>

      <div className="flex flex-col gap-6 rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="p-4 pb-0">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 pl-9 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                placeholder="Search by brand name or code..."
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none focus:ring-2 focus:ring-[#F5C742]/50 cursor-pointer"
              >
                <option>All Status</option>
                <option>Active</option>
                <option>Inactive</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>

            {/* Country Filter */}
            <div className="relative">
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="appearance-none w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none focus:ring-2 focus:ring-[#F5C742]/50 cursor-pointer"
              >
                {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>

            {/* Sort */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none focus:ring-2 focus:ring-[#F5C742]/50 cursor-pointer"
              >
                <option value="Name">Sort by Name</option>
                <option value="Product Count">Sort by Products</option>
                <option value="Date">Sort by Date</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pb-4">
            <p className="text-xs text-slate-500">Showing {filteredData.length} of {brands.length} brands</p>
            <button onClick={fetchBrands} className="inline-flex items-center justify-center text-sm font-medium border bg-white hover:bg-slate-50 h-8 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 outline-none">
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Brand Logo</th>
                <th className="text-left p-3 font-medium text-slate-600">Brand Name</th>
                <th className="text-left p-3 font-medium text-slate-600">Brand Code</th>
                <th className="text-left p-3 font-medium text-slate-600">Barcode Prefix</th>
                <th className="text-left p-3 font-medium text-slate-600">Auto-Generate</th>
                <th className="text-left p-3 font-medium text-slate-600">Country/Region</th>
                <th className="text-left p-3 font-medium text-slate-600">Status</th>
                <th className="text-left p-3 font-medium text-slate-600">Products</th>
                <th className="text-left p-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="9" className="p-12 text-center text-slate-500">Loading brands...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan="9" className="p-12 text-center text-slate-500">No brands found</td></tr>
              ) : (
                filteredData.map((brand) => (
                  <tr key={brand.id} className="hover:bg-slate-50 hover:border-l-4 hover:border-l-[#F5C742] transition-all border-l-4 border-transparent">
                    <td className="p-3">
                      <div className="h-10 w-10 rounded-full border border-slate-200 overflow-hidden flex items-center justify-center bg-white">
                        {brand.logo ? (
                          <img src={brand.logo} alt={brand.name} className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="text-xs font-bold text-[#F5C742] bg-[#FFF4BF] w-full h-full flex items-center justify-center">{brand.initials}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3"><p className="font-medium text-slate-900">{brand.name}</p></td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium border border-slate-200 rounded font-mono">{brand.code}</span>
                    </td>
                    <td className="p-3">
                      {brand.prefix ? (
                        <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-[#FFF4BF] text-amber-800 border-amber-300 font-mono min-h-[24px] min-w-[30px]">{brand.prefix}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {brand.auto ? (
                        <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-slate-50 text-emerald-600 border-slate-200">
                          <CircleCheckBig className="mr-1 h-3 w-3" /> Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-slate-50 text-slate-600 border-slate-200">
                          <CircleX className="mr-1 h-3 w-3" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-900">{brand.country}</span>
                        <span className="text-xs text-slate-500">{brand.region}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${brand.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {brand.status === 'Active' ? <CircleCheckBig className="mr-1 h-3 w-3" /> : <CircleX className="mr-1 h-3 w-3" />}
                        {brand.status}
                      </span>
                    </td>
                    <td className="p-3"><p className="font-semibold text-[#F5C742]">{brand.products}</p></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <ActionButton onClick={() => handleViewClick(brand)} icon={<Eye className="h-4 w-4" />} />
                        <ActionButton onClick={() => handleEditClick(brand)} icon={<SquarePen className="h-4 w-4" />} />
                        <ActionButton onClick={() => handleDeleteClick(brand.id)} icon={<Trash2 className="h-4 w-4" />} color="text-red-600 hover:bg-red-50" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIEW MODAL */}
      {isViewModalOpen && viewingBrand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsViewModalOpen(false)}></div>
          <div className="bg-white z-50 w-full max-w-lg rounded-lg shadow-xl overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Brand Details</h2>
                <p className="text-sm text-slate-500">Complete brand information</p>
              </div>
              <button onClick={() => setIsViewModalOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full border border-slate-100 flex items-center justify-center bg-white overflow-hidden">
                  {viewingBrand.logo ? (
                    <img src={viewingBrand.logo} alt={viewingBrand.name} className="h-full w-full object-contain p-2" />
                  ) : (
                    <span className="text-xl font-bold text-[#F5C742] bg-[#FFF4BF] w-full h-full flex items-center justify-center">{viewingBrand.initials}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{viewingBrand.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 border rounded text-xs font-mono">{viewingBrand.code}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${viewingBrand.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{viewingBrand.status}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-[#F8FAFC] border border-slate-100 rounded-lg">
                  <div className="flex items-center gap-2 mb-1"><Globe className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs text-slate-500">Country</span></div>
                  <p className="text-sm font-semibold">{viewingBrand.country}</p>
                </div>
                <div className="p-3 bg-[#F8FAFC] border border-slate-100 rounded-lg">
                  <div className="flex items-center gap-2 mb-1"><Package className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs text-slate-500">Products</span></div>
                  <p className="text-sm font-semibold">{viewingBrand.products}</p>
                </div>
              </div>
              {/* Barcode info in view modal */}
              {viewingBrand.prefix && (
                <div className="p-3 bg-[#FFF4BF] border border-[#F5C742] rounded-lg">
                  <p className="text-xs font-medium text-slate-600 mb-1">Barcode Prefix</p>
                  <p className="text-sm font-mono font-semibold text-amber-800">{viewingBrand.prefix}</p>
                  <p className="text-xs text-slate-500 mt-1">{viewingBrand.rule} • Auto: {viewingBrand.auto ? 'Enabled' : 'Disabled'}</p>
                  <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                    <p>• Global Unique: {viewingBrand.ruleGlobalUnique ? 'Yes' : 'No'}</p>
                    <p>• Brand Unique: {viewingBrand.ruleBrandUnique ? 'Yes' : 'No'}</p>
                    <p>• Manual Override: {viewingBrand.ruleManualOverride ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              )}
              {viewingBrand.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {viewingBrand.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-1 rounded-full text-xs bg-[#FFF4BF] text-amber-900 border border-[#F5C742]/30">{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 pt-2">
              <button onClick={openEditFromView} className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium"><Edit className="h-3.5 w-3.5" /> Edit</button>
              <button onClick={() => setIsViewModalOpen(false)} className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT/ADD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal */}
          <div className="bg-white z-50 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg shadow-lg flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 relative">
              <p className="text-[11px] font-medium text-[#F5C742] tracking-wide mb-1">
                BRAND SETUP
              </p>
              <h2 className="text-lg font-semibold">
                {editingId ? 'Edit Brand' : 'Add New Brand'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Configure brand details including logo, tags, barcode prefix and regional information.
              </p>
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 text-sm">
              {/* Section A - Basic Information */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-6 w-6 rounded-full bg-[#F5C742]/10 text-[#F5C742] flex items-center justify-center text-xs font-semibold">
                    A
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      Basic Information
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Brand name, code and basic details.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Brand Name *</label>
                    <input
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g., Nike"
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Brand Code *</label>
                    <input
                      name="code"
                      value={formData.code}
                      onChange={handleInputChange}
                      placeholder="e.g., NK"
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 mt-3">
                  <label className="text-xs font-medium">Description (Optional)</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Brief description of the brand..."
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Country (Optional)</label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm outline-none bg-white focus:border-slate-400"
                    >
                      <option value="">Select country</option>
                      <option value="USA">USA</option>
                      <option value="Germany">Germany</option>
                      <option value="Japan">Japan</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Region (Optional)</label>
                    <input
                      name="region"
                      value={formData.region}
                      onChange={handleInputChange}
                      placeholder="e.g., Middle East, Europe"
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Section B – Logo */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-6 w-6 rounded-full bg-[#F5C742]/10 text-[#F5C742] flex items-center justify-center text-xs font-semibold">
                    B
                  </span>
                  <p className="text-xs font-semibold text-slate-700">
                    Brand Logo
                  </p>
                </div>

                <div className="p-4 border border-dashed border-slate-200 rounded-lg bg-slate-50 flex gap-4 items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="h-16 w-16 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden group relative"
                  >
                    {formData.logoPreview ? (
                      <img
                        src={formData.logoPreview}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <p className="font-medium text-slate-900">
                      Logo Guidelines:
                    </p>
                    <p>Square format recommended (1:1 ratio).</p>
                    <p>Maximum file size: 2MB.</p>
                    <p>Supported formats: JPG, PNG, SVG.</p>
                  </div>
                </div>
              </div>

              {/* Section C – Tags */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-6 w-6 rounded-full bg-[#F5C742]/10 text-[#F5C742] flex items-center justify-center text-xs font-semibold">
                    C
                  </span>
                  <p className="text-xs font-semibold text-slate-700">
                    Brand Tags (Optional)
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${formData.tags.includes(tag)
                        ? 'bg-[#F5C742]/20 border-[#F5C742] text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section D – Status */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-6 w-6 rounded-full bg-[#F5C742]/10 text-[#F5C742] flex items-center justify-center text-xs font-semibold">
                    D
                  </span>
                  <p className="text-xs font-semibold text-slate-700">
                    Brand Status
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-slate-800">
                      Status
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Inactive brands cannot be used in new product creation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData(prev => ({ ...prev, isActive: !prev.isActive }))
                    }
                    className="ml-4"
                  >
                    <div
                      className={`h-6 w-11 rounded-full relative transition-colors ${formData.isActive ? 'bg-[#F5C742]' : 'bg-slate-300'
                        }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full bg-white absolute top-0.5 transition-all ${formData.isActive ? 'right-0.5' : 'left-0.5'
                          }`}
                      />
                    </div>
                  </button>
                </div>
              </div>

              {/* Section E – Barcode Prefix Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <div className="h-8 w-8 rounded-lg bg-[#F5C742] flex items-center justify-center text-sm font-bold text-slate-900">E</div>
                  <h3 className="font-semibold">Barcode Prefix Settings</h3>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prefix Value</label>
                    <input
                      name="prefix"
                      value={formData.prefix}
                      onChange={handleInputChange}
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all"
                      placeholder="e.g., NK"
                    />
                    <p className="text-xs text-slate-500">Auto-populated from Brand Code</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prefix Length</label>
                    <input
                      type="number"
                      name="prefixLength"
                      value={formData.prefixLength}
                      onChange={handleInputChange}
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all"
                    />
                    <p className="text-xs text-slate-500">Number of prefix digits</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Suffix Length</label>
                    <input
                      type="number"
                      name="suffixLength"
                      value={formData.suffixLength}
                      onChange={handleInputChange}
                      className="flex h-9 w-full rounded-md border border-slate-200 px-3 py-1 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all"
                    />
                    <p className="text-xs text-slate-500">Random number digits</p>
                  </div>
                </div>
                <div className="p-4 border border-[#F5C742] rounded-lg bg-[#FFF4BF]">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">Final Barcode Format:</p>
                    <p className="text-sm font-mono font-semibold text-slate-900">[First {formData.prefixLength || 2} chars of PREFIX]-[{formData.suffixLength || 8} random digits]</p>
                    <p className="text-lg font-mono font-bold text-[#F5C742]">
                      Example: <span className="text-amber-600">{(formData.prefix || 'NK').substring(0, formData.prefixLength || 2)}</span><span className="text-slate-400">-</span><span className="text-amber-600">{'0'.repeat(formData.suffixLength || 8).split('').map(() => Math.floor(Math.random() * 10)).join('')}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Section F – Auto-Generation Control */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <div className="h-8 w-8 rounded-lg bg-[#F5C742] flex items-center justify-center text-sm font-bold text-slate-900">F</div>
                  <h3 className="font-semibold">Auto-Generation Control</h3>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {formData.auto && <CircleCheckBig className="h-4 w-4 text-[#F5C742]" />}
                      <p className="text-sm font-medium">Enable Auto-Barcode Generation</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-6">Barcode will be auto-generated when product is created under this brand</p>
                  </div>
                  <div
                    onClick={() => setFormData(prev => ({ ...prev, auto: !prev.auto }))}
                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-colors ${formData.auto ? 'bg-[#F5C742]' : 'bg-slate-300'}`}
                  >
                    <div className={`h-5 w-5 rounded-full bg-white absolute top-0.5 shadow transition-all ${formData.auto ? 'right-0.5' : 'left-0.5'}`}></div>
                  </div>
                </div>
              </div>

              {/* Section G – Validation Rules */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <div className="h-8 w-8 rounded-lg bg-[#F5C742] flex items-center justify-center text-sm font-bold text-slate-900">G</div>
                  <h3 className="font-semibold">Validation Rules</h3>
                </div>
                <div className="space-y-3 p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ruleGlobalUnique"
                      checked={formData.ruleGlobalUnique}
                      onChange={handleInputChange}
                      className="h-4 w-4 rounded border-slate-300 accent-[#F5C742]"
                    />
                    <label className="text-sm text-slate-700">Ensure barcode uniqueness across all brands</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ruleBrandUnique"
                      checked={formData.ruleBrandUnique}
                      onChange={handleInputChange}
                      className="h-4 w-4 rounded border-slate-300 accent-[#F5C742]"
                    />
                    <label className="text-sm text-slate-700">Ensure uniqueness inside this brand only</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="ruleManualOverride"
                      checked={formData.ruleManualOverride}
                      onChange={handleInputChange}
                      className="h-4 w-4 rounded border-slate-300 accent-[#F5C742]"
                    />
                    <label className="text-sm text-slate-700">Allow manually overridden barcode (admin only)</label>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-md text-sm font-medium text-slate-900"
              >
                Save Brand
              </button>
            </div>
          </div>
        </div>
      )}

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
  <button className="flex items-center justify-between w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-500">
    <span>{placeholder}</span>
    <ChevronDown className="h-4 w-4 opacity-50" />
  </button>
);

const ActionButton = ({ icon, color, onClick }) => (
  <button onClick={onClick} className={`h-8 w-8 flex items-center justify-center rounded-md hover:bg-slate-100 ${color || "text-slate-900"}`}>{icon}</button>
);

export default Brand;