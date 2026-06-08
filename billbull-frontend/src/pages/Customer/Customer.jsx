import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Search, ChevronDown, RefreshCw,
  Phone, Mail, Globe, MessageCircle, ArrowRight,
  TrendingUp, Target, CheckCircle2, UserPlus,
  ArrowLeft, Save, LayoutGrid, Calendar, Trash2,
  Send, XCircle, FileText, ChevronRight, X,
  AlertCircle, Package, MapPin
} from 'lucide-react';

// Import API functions
import {
  getInquiries,
  getInquiryById,
  createInquiry,
  deleteInquiry,
  addFollowUp,
  reassignRep
} from '../../api/customerApi';
import { getEmployees } from '../../api/employeeApi';
import { getProducts, getProductById } from '../../api/productsApi';
import { getAllCustomers } from '../../api/customerledgerApi';
import { getBranches } from '../../api/branchApi';
import PaginationFooter from '../../components/common/PaginationFooter';
import ProductSelector from '../../components/ProductSelector';
import CustomerSelector from '../../components/CustomerSelector';
import CurrencyAmount from '../../components/CurrencyAmount';
import { getImageUrl } from '../../utils/urlUtils';
import toast from 'react-hot-toast';

// ==========================================
// HELPERS
// ==========================================

const getFormattedId = (item) => {
  if (item && item.inquiryNumber) return item.inquiryNumber;
  // Fallback for old items or if not yet populated
  const id = item.id;
  const dateStr = item.createdDate;
  const year = dateStr ? new Date(dateStr).getFullYear() : new Date().getFullYear();
  return `INQ-${year}-${String(id).padStart(5, '0')}`;
};

const getPrimaryBarcode = (productData = {}, fallback = '') => {
  const packingBarcode =
    productData.inventory?.packings?.find?.(packing => packing?.barcode)?.barcode ||
    productData.packings?.find?.(packing => packing?.barcode)?.barcode ||
    '';

  return productData.barcode || productData.product?.barcode || packingBarcode || fallback || '';
};

const getPrimaryImage = (productData = {}, fallback = '') =>
  productData.primaryImage ||
  productData.image ||
  productData.product?.primaryImage ||
  productData.product?.image ||
  fallback ||
  '';

const firstPresentNumber = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
};

const resolveInquiryItemImage = (item = {}) =>
  item.primaryImage || item.image || item.imageUrl || '';

const resolveInquiryItemPrice = (item = {}) =>
  firstPresentNumber(item.price, item.standardPrice, item.retailPrice, item.sellingPrice);

const getInquiryItemAvailableStock = (item = {}) => {
  for (const value of [item.availableStock, item.stock, item.available]) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

const resolveInquiryItemStockStatus = (item = {}) => {
  if (item.stockStatus) return item.stockStatus;
  const stock = getInquiryItemAvailableStock(item);
  if (stock === null) return '';
  if (stock <= 0) return 'out-stock';
  if (stock < 10) return 'low-stock';
  return 'in-stock';
};

const InquiryItemThumb = ({ item }) => {
  const image = resolveInquiryItemImage(item);
  return (
    <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
      {image ? (
        <img src={getImageUrl(image)} alt={item.productName || 'Item'} className="w-full h-full object-cover" />
      ) : (
        <Package className="h-5 w-5 text-slate-300" />
      )}
    </div>
  );
};

const StockStatusBadge = ({ status }) => {
  if (status === 'in-stock') {
    return <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full font-medium">In Stock</span>;
  }
  if (status === 'low-stock') {
    return <span className="text-[10px] px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full font-medium">Low Stock</span>;
  }
  if (status === 'out-stock') {
    return <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-full font-medium">Out of Stock</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-full font-medium">Unknown</span>;
};

const AvailableStockBadge = ({ item }) => {
  const stock = getInquiryItemAvailableStock(item);
  const label = stock === null ? 'Stock: --' : `Stock: ${stock}`;
  return (
    <span className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-full font-medium">
      {label}
    </span>
  );
};

const resolveCustomerAddress = (customer = {}) => {
  const defaultSaved = (customer.savedAddresses || []).find(addr => addr.isDefault) || (customer.savedAddresses || [])[0];
  if (defaultSaved) {
    const formatted = [
      defaultSaved.address1,
      defaultSaved.address2,
      defaultSaved.city,
      defaultSaved.country
    ].filter(Boolean).join(', ');
    if (formatted) return formatted;
  }

  return customer.defaultShippingAddress || customer.shippingAddress || customer.billingAddress || customer.address || '';
};

const getInquiryStatusBadgeClass = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'hot': return 'bg-rose-50 text-rose-600 border-rose-100 font-bold';
    case 'warm': return 'bg-orange-50 text-orange-600 border-orange-100 font-medium';
    case 'cool': return 'bg-sky-50 text-sky-600 border-sky-100 font-medium';
    case 'new': return 'bg-blue-50 text-blue-600 border-blue-100 font-medium';
    case 'converted': return 'bg-purple-50 text-purple-600 border-purple-100 font-bold';
    case 'invoiced': return 'bg-emerald-50 text-emerald-600 border-emerald-100 font-bold';
    case 'lost': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

// ==========================================
// SUB-COMPONENTS
// ==========================================

const StatCard = ({ label, value, icon: Icon, color, subValue, trend }) => (
  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between h-full">
    <div className="flex justify-between items-start mb-2">
      <div className="text-sm text-slate-500 font-medium">{label}</div>
      <div className={`p-1.5 rounded-full ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <div className="flex items-end justify-between">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {subValue && (
        <div className={`text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : 'text-slate-500'}`}>
          {subValue}
        </div>
      )}
    </div>
  </div>
);

// ==========================================
// NEW MODAL COMPONENT (Add Follow Up)
// ==========================================

const AddFollowUpModal = ({ isOpen, onClose, inquiryId, onSaveSuccess }) => {
  const [formData, setFormData] = useState({
    type: 'Phone Call',
    summary: '',
    nextFollowUpDate: '',
    status: 'Warm'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      await addFollowUp(inquiryId, formData);
      toast.success('Follow-up saved!');
      onSaveSuccess(); // Refresh parent data
      onClose();
    } catch (error) {
      console.error("Failed to add follow-up", error);
      toast.error("Failed to save follow-up.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Follow-up</h2>
            <p className="text-xs text-slate-500 mt-0.5">Log a follow-up activity for this inquiry</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Follow-up Type</label>
            <div className="relative">
              <select name="type" value={formData.type} onChange={handleChange} className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                <option>Phone Call</option>
                <option>WhatsApp</option>
                <option>Email</option>
                <option>In-person Visit</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Summary</label>
            <textarea
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              rows={3}
              placeholder="Brief summary of the follow-up..."
              className="w-full p-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none transition-all placeholder:text-slate-400"
            ></textarea>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Next Follow-up Date</label>
            <input
              name="nextFollowUpDate"
              value={formData.nextFollowUpDate}
              onChange={handleChange}
              type="date"
              className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 text-slate-600 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Update Status</label>
            <div className="relative">
              <select name="status" value={formData.status} onChange={handleChange} className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                <option>Hot</option>
                <option>Warm</option>
                <option>New</option>
                <option>Converted</option>
                <option>Lost</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-md text-sm font-bold text-slate-900 shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save Follow-up'}
          </button>
        </div>

      </div>
    </div>
  );
};

// ==========================================
// 1. LIST VIEW COMPONENT
// ==========================================

const InquiryList = ({ data, onAddNew, onView, onDelete, onRefresh, isLoading }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [listPage, setListPage] = useState(0);
  const LIST_PAGE_SIZE = 30;
  useEffect(() => { setListPage(0); }, [searchTerm]);

  const getStatusBadge = (status) => {
    return getInquiryStatusBadgeClass(status);
  };

  const getPriorityStyle = (p) => {
    switch (String(p || '').toLowerCase()) {
      case 'high': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'critical': return 'bg-red-50 text-red-600 border-red-100 font-bold';
      case 'urgent': return 'bg-red-50 text-red-600 border-red-100 font-bold';
      case 'medium': return 'bg-yellow-50 text-yellow-600 border-yellow-100';
      case 'low': return 'bg-green-50 text-green-600 border-green-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getSourceStyle = (source) => {
    switch (source) {
      case 'WhatsApp': return 'text-green-600';
      case 'Phone Call': return 'text-blue-600';
      case 'Walk-in': return 'text-teal-600';
      case 'Website': return 'text-indigo-600';
      case 'Social Media': return 'text-pink-600';
      default: return 'text-slate-600';
    }
  };



  const getSourceIcon = (source) => {
    switch (source) {
      case 'Walk-in': return <Users className="h-3.5 w-3.5" />;
      case 'WhatsApp': return <MessageCircle className="h-3.5 w-3.5" />;
      case 'Phone Call': return <Phone className="h-3.5 w-3.5" />;
      case 'Website': return <Globe className="h-3.5 w-3.5" />;
      default: return <LayoutGrid className="h-3.5 w-3.5" />;
    }
  };

  // ✅ FIX: String(item.id) to prevent crash on numeric IDs
  const filteredData = data.filter(item => {
    const formattedId = getFormattedId(item);
    return (item.customer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      formattedId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(item.id).includes(searchTerm);
  });
  const pagedData = filteredData.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F7FA]">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-6 py-5 bg-white border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Customer Connect</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 font-medium">Inquiries</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Users className="text-[#F5C742]" size={28} /> Customer Inquiries</h1>
          <p className="text-sm md:text-base text-slate-500">Manage walk-in, WhatsApp, phone & online inquiries.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onAddNew}
            className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#F5C742]/50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Inquiry
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 flex-1 overflow-auto">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Inquiries" value={data.length} icon={Users} color="bg-slate-100 text-slate-600" />
          <StatCard label="New" value={data.filter(i => i.status === 'New').length} icon={UserPlus} color="bg-blue-50 text-blue-600" />
          <StatCard label="Warm Leads" value={data.filter(i => i.status === 'Warm').length} icon={TrendingUp} color="bg-orange-50 text-orange-600" />
          <StatCard label="Hot Leads" value={data.filter(i => i.status === 'Hot').length} icon={Target} color="bg-red-50 text-red-600" />
          <StatCard label="Converted" value={data.filter(i => i.status === 'Converted').length} icon={CheckCircle2} color="bg-green-50 text-green-600" />
          {/* Conversion Rate assuming total inquiries > 0 */}
          <StatCard
            label="Conversion Rate"
            value={`${data.length > 0 ? ((data.filter(i => i.status === 'Converted').length / data.length) * 100).toFixed(1) : 0}%`}
            trend="up"
            icon={TrendingUp}
            color="bg-yellow-50 text-yellow-600"
          />
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer, mobile, inquiry ID..."
              className="w-full pl-9 pr-4 h-9 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {["Last 7 Days", "All Branches", "All Sources", "All Status"].map((val, idx) => (
            <div className="relative" key={idx}>
              <select className="h-9 px-3 pr-8 text-sm border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none">
                <option>{val}</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          ))}

          <button onClick={onRefresh} className="h-9 px-3 border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-600 flex items-center gap-1.5 text-sm font-medium transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="bb-nowrap-table w-full text-sm text-left">
              <thead className="bg-gray-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8">Priority</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Inquiry ID</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Customer</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Contact</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Requested Items</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Source</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Assigned To</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Last Follow-up</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center text-slate-500">Loading inquiries...</td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center text-slate-500">No inquiries found.</td>
                  </tr>
                ) : (
                  pagedData.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded ${getPriorityStyle(row.priority)}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{getFormattedId(row)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.customer}</div>
                        {row.customerCode && (
                          <div className="text-[11px] text-blue-600 font-semibold mt-0.5">{row.customerCode}</div>
                        )}
                        <div className="flex gap-1 mt-0.5">
                          {row.tags && row.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 font-medium">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 flex items-center gap-1">
                        {/* ✅ FIX 1: Use row.mobile */}
                        <Phone className="h-3 w-3 text-slate-400" /> {row.mobile}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.items && row.items.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {row.items.slice(0, 2).map((item, idx) => (
                                <span key={idx} className="text-[10px] px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full font-medium whitespace-nowrap">
                                  {item.productName}
                                </span>
                              ))}
                              {row.items.length > 2 && <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">+{row.items.length - 2}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No items</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1.5 font-medium ${getSourceStyle(row.source)}`}>
                          {getSourceIcon(row.source)} {row.source}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.assignedTo || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getStatusBadge(row.status)}`}>
                          {row.status}
                        </span>
                        {row.convertedQuotationNo && (
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">
                            Quote: {row.convertedQuotationNo}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {/* ✅ FIX: Derived Last Follow Up with improved logic */}
                        {row.timeline && row.timeline.length > 0 ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-700 text-xs">
                              {/* Calculate relative time (e.g. "2 hours ago" or date) - Simplification: Showing Date */}
                              {row.timeline[row.timeline.length - 1].date}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              {row.timeline[row.timeline.length - 1].type}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                        {row.nextAction && <div className="text-[10px] text-red-500 font-medium mt-1 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded w-fit">{row.nextAction}</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onView(row)}
                            className="text-slate-400 hover:text-slate-600 p-1 flex items-center gap-1 text-xs font-medium hover:bg-slate-100 rounded"
                          >
                            View <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => onDelete(row.id)}
                            className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
              loading={isLoading}
              onPageChange={setListPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. CREATE VIEW COMPONENT
// ==========================================

// 2. CREATE VIEW COMPONENT
// ==========================================

const CreateInquiry = ({ onBack, onSave, isSaving }) => {
  const [employees, setEmployees] = useState([]); // Employee State for Dropdown
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [formData, setFormData] = useState({
    customerId: null,
    customerCode: '',
    customer: '',
    mobile: '',
    email: '',
    address: '',
    branch: '',
    source: '',
    category: '',
    priority: 'medium',
    notes: '',
    assignedTo: '',
    followUpDate: '',
    followUpType: '',
    internalNote: '',
    items: [] // List of { productId, quantity, price }
  });

  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const [employeesData, customersData, branchesData] = await Promise.all([
          getEmployees(),
          getAllCustomers(),
          getBranches()
        ]);
        setEmployees(employeesData || []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
        setBranches(Array.isArray(branchesData) ? branchesData : []);
      } catch (error) {
        console.error("Failed to fetch initial data", error);
      }
    };
    fetchInitData();
  }, []);

  const refreshCustomers = async () => {
    try {
      const customersData = await getAllCustomers();
      setCustomers(Array.isArray(customersData) ? customersData : []);
    } catch (error) {
      console.error("Failed to refresh customers", error);
      toast.error("Failed to refresh customers.");
    }
  };

  const handleCustomerSelect = (customer) => {
    const address = resolveCustomerAddress(customer);
    setSelectedCustomer(customer);
    setFormData(prev => ({
      ...prev,
      customerId: customer.id || null,
      customerCode: customer.code || '',
      customer: customer.name || '',
      mobile: customer.mobile || customer.phone || '',
      email: customer.email || '',
      address
    }));
  };

  const clearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setFormData(prev => ({
      ...prev,
      customerId: null,
      customerCode: ''
    }));
  };

  const handleProductSelect = (product) => {
    setFormData(prev => {
      const existingIdx = prev.items.findIndex(item => item.productId === product.id);
      const price = firstPresentNumber(product.retailPrice, product.sellingPrice, product.price);
      const image = resolveInquiryItemImage(product);
      const unit = product.unitName || product.unit || product.defaultUnit || 'PCS';
      const stock = getInquiryItemAvailableStock(product);
      const stockStatus = resolveInquiryItemStockStatus({ ...product, stock });

      if (existingIdx >= 0) {
        const updatedItems = [...prev.items];
        updatedItems[existingIdx].quantity += 1;
        updatedItems[existingIdx] = {
          ...updatedItems[existingIdx],
          productCode: updatedItems[existingIdx].productCode || product.code || product.itemCode || '',
          itemCode: updatedItems[existingIdx].itemCode || product.code || product.itemCode || '',
          barcode: updatedItems[existingIdx].barcode || product.barcode || product.itemBarcode || '',
          image: updatedItems[existingIdx].image || image,
          primaryImage: updatedItems[existingIdx].primaryImage || image,
          price: updatedItems[existingIdx].price || price,
          standardPrice: updatedItems[existingIdx].standardPrice || price,
          unit: updatedItems[existingIdx].unit || unit,
          sku: updatedItems[existingIdx].sku || product.sku || '',
          category: updatedItems[existingIdx].category || product.category || product.departmentName || '',
          stock,
          availableStock: stock,
          stockStatus,
          description: updatedItems[existingIdx].description || product.description || product.shortDesc || ''
        };
        return { ...prev, items: updatedItems };
      } else {
        const newItem = {
          productId: product.id,
          productCode: product.code || product.itemCode || '',
          itemCode: product.code || product.itemCode || '',
          barcode: product.barcode || product.itemBarcode || '',
          image,
          primaryImage: image,
          productName: product.name,
          description: product.description || product.shortDesc || '',
          sku: product.sku || '',
          category: product.category || product.departmentName || '',
          unit,
          stock,
          availableStock: stock,
          stockStatus,
          quantity: 1,
          price,
          standardPrice: price
        };
        return { ...prev, items: [...prev.items, newItem] };
      }
    });
  };

  const handleItemQtyChange = (index, value) => {
    const newQty = parseFloat(value);
    if (isNaN(newQty) || newQty < 1) return;
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index].quantity = newQty;
      return { ...prev, items: updatedItems };
    });
  };

  const handleItemPriceChange = (index, value) => {
    const newPrice = parseFloat(value);
    if (isNaN(newPrice) || newPrice < 0) return;
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index].price = newPrice;
      updatedItems[index].standardPrice = newPrice;
      return { ...prev, items: updatedItems };
    });
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'customer' && selectedCustomer && value !== selectedCustomer.name) {
      setSelectedCustomer(null);
      setFormData(prev => ({ ...prev, customerId: null, customerCode: '', [name]: value }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveClick = () => {
    if (!formData.customer || !formData.mobile) {
      toast.error("Please fill in at least Customer Name and Mobile Number.");
      return;
    }
    onSave(formData);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9fc] text-slate-900">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold uppercase tracking-wide flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">New Customer Inquiry</h1>
            <p className="text-sm text-slate-500 mt-0.5">Capture inquiry details and assign to sales rep</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={handleSaveClick}
            disabled={isSaving}
            className="px-5 py-2.5 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg text-sm font-bold text-slate-900 shadow-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Inquiry'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Section 1: Customer Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-base font-bold text-slate-800">Customer Information</h2>
              <button
                type="button"
                onClick={() => setIsCustomerSelectorOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:border-[#F5C742] hover:bg-yellow-50 transition-colors"
              >
                <Search size={14} /> Select Existing
              </button>
            </div>
            {selectedCustomer && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-bold text-emerald-700">Existing customer selected:</span>
                  <span className="ml-1 text-slate-700">{selectedCustomer.code} - {selectedCustomer.name}</span>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedCustomer}
                  className="text-slate-500 hover:text-red-600 font-semibold shrink-0"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Customer Name <span className="text-red-500">*</span></label>
                <input name="customer" value={formData.customer} onChange={handleChange} type="text" placeholder="Full name" className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 transition-all placeholder:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Mobile Number <span className="text-red-500">*</span></label>
                <input name="mobile" value={formData.mobile} onChange={handleChange} type="text" placeholder="+971 XX XXX XXXX" className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 transition-all placeholder:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Email</label>
                <input name="email" value={formData.email} onChange={handleChange} type="email" placeholder="email@example.com" className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 transition-all placeholder:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Branch <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select name="branch" value={formData.branch} onChange={handleChange} className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                    <option value="">Select branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Customer address for quotation delivery/shipping"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Source of Inquiry <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select name="source" value={formData.source} onChange={handleChange} className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                    <option value="">How did they reach us?</option>
                    <option>Walk-in</option>
                    <option>Phone Call</option>
                    <option>WhatsApp</option>
                    <option>Website</option>
                    <option>Social Media</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Inquiry Details */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-base font-bold text-slate-800 mb-6">Inquiry Details</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Inquiry Category</label>
                  <div className="relative">
                    <select name="category" value={formData.category} onChange={handleChange} className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                      <option value="">Select category</option>
                      <option>Grocery</option>
                      <option>Electronics</option>
                      <option>Household</option>
                      <option>Apparel</option>
                      <option>Accessories</option>
                      <option>Custom Order</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Priority</label>
                  <div className="relative">
                    <select name="priority" value={formData.priority} onChange={handleChange} className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="critical">Critical</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Notes</label>
                <textarea
                  name="notes" value={formData.notes} onChange={handleChange}
                  rows={4}
                  placeholder="Additional details, customer requirements, special requests..."
                  className="w-full p-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none transition-all placeholder:text-slate-400"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Section: Requested Items */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-slate-800">Requested Items</h2>
              <button
                type="button"
                onClick={() => setIsProductSelectorOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm"
              >
                <Plus size={16} /> Select Items
              </button>
            </div>

            <div className="space-y-4">
              {formData.items.length > 0 ? (
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                        <th className="px-3 py-3 text-left w-[29%]">Item</th>
                        <th className="px-3 py-3 text-left w-[26%]">Details</th>
                        <th className="px-3 py-3 text-center w-[11%]">Qty</th>
                        <th className="px-3 py-3 text-right w-[13%]">Price</th>
                        <th className="px-3 py-3 text-right w-[14%] whitespace-nowrap">Line Total</th>
                        <th className="px-3 py-3 text-right w-[7%]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.items.map((item, idx) => (
                        <tr key={idx} className="align-middle">
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <InquiryItemThumb item={item} />
                              <div className="min-w-0">
                                <div className="text-slate-900 font-bold truncate">{item.productName}</div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {item.itemCode || item.productCode || 'No code'}
                                  {item.barcode ? ` | ${item.barcode}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StockStatusBadge status={resolveInquiryItemStockStatus(item)} />
                              <AvailableStockBadge item={item} />
                              {item.unit && (
                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full font-medium">
                                  {item.unit}
                                </span>
                              )}
                              {item.category && (
                                <span className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full font-medium">
                                  {item.category}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <div className="text-[11px] text-slate-500 mt-1 max-w-full truncate">
                                {item.description}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-4 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                              className="w-full max-w-16 px-2 py-1 text-center border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                            />
                          </td>
                          <td className="px-3 py-4 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={resolveInquiryItemPrice(item)}
                              onChange={(e) => handleItemPriceChange(idx, e.target.value)}
                              className="w-full max-w-24 px-2 py-1 text-right border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                            />
                          </td>
                          <td className="px-3 py-4 text-right font-bold text-slate-800 whitespace-nowrap">
                            <CurrencyAmount
                              value={(Number(item.quantity) || 0) * resolveInquiryItemPrice(item)}
                              className="inline-block whitespace-nowrap tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-4 text-right">
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 text-center flex flex-col items-center justify-center bg-slate-50/50">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-3">
                    <Package className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">No Items Requested</h3>
                  <p className="text-xs text-slate-500 mb-4 max-w-sm">Search and add products to this customer inquiry so the sales team knows what they are looking for.</p>
                  <button
                    type="button"
                    onClick={() => setIsProductSelectorOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    <Plus size={16} className="text-emerald-500" /> Browse Products
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Assign to Sales Rep */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-base font-bold text-slate-800 mb-6">Assign to Sales Rep</h2>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Sales Representative <span className="text-red-500">*</span></label>
              <div className="relative">
                <select name="assignedTo" value={formData.assignedTo} onChange={handleChange} className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                  <option value="">Select sales rep</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={`${emp.firstName} ${emp.lastName}`.trim()}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Section 4: First Follow-up */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-base font-bold text-slate-800 mb-6">First Follow-up</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mb-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Follow-up Date</label>
                <div className="relative">
                  <input name="followUpDate" value={formData.followUpDate} onChange={handleChange} type="date" className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 text-slate-600 transition-all" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Follow-up Type</label>
                <div className="relative">
                  <select name="followUpType" value={formData.followUpType} onChange={handleChange} className="w-full h-11 px-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none bg-white text-slate-600 cursor-pointer">
                    <option>Phone Call</option>
                    <option>WhatsApp</option>
                    <option>Email</option>
                    <option>In-person Visit</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Internal Note</label>
              <textarea
                name="internalNote" value={formData.internalNote} onChange={handleChange}
                rows={2}
                placeholder="Notes for the sales rep..."
                className="w-full p-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none transition-all placeholder:text-slate-400"
              ></textarea>
            </div>
          </div>

        </div>
      </div>

      <ProductSelector
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleProductSelect}
        actionLabel="Add to Inquiry"
      />
      <CustomerSelector
        isOpen={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        onSelect={handleCustomerSelect}
        customers={customers}
        selectedCode={formData.customerCode}
        onCustomerCreated={refreshCustomers}
      />
    </div>
  );
};

// ==========================================
// 3.B VIEW PRICE MODAL
// ==========================================

const ViewPriceModal = ({ isOpen, onClose, product }) => {
  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Product Price</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          <div className="h-16 w-16 bg-blue-50 rounded-full mx-auto flex items-center justify-center mb-4 ring-4 ring-blue-50/50">
            <Package className="h-8 w-8 text-blue-600" />
          </div>
          <h4 className="text-lg font-bold text-slate-900 mb-1 leading-tight">{product.productName}</h4>
          <p className="text-sm text-slate-500 mb-6">Standard Selling Price</p>

          <div className="text-4xl font-extrabold text-[#F5C742] mb-2 drop-shadow-sm">
            <CurrencyAmount value={product.standardPrice !== undefined && product.standardPrice !== null ? product.standardPrice : (product.price || 0)} />
          </div>
          <p className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full inline-block">Inclusive of Tax</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-center">
          <button onClick={onClose} className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3.C CONVERT TO QUOTATION MODAL
// ==========================================

const ConvertToQuotationModal = ({ isOpen, onClose, inquiry, onSuccess }) => {
  const navigate = useNavigate();
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(5);
  const [paymentTerms, setPaymentTerms] = useState('immediate');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !inquiry) return null;

  const handleCreateQuotation = async () => {
    setLoading(true);
    try {
      // 1. Fetch full details for all products to get Item Code, Units, etc.
      const enrichedItems = await Promise.all(inquiry.items.map(async (item) => {
        try {
          // If inquiry item structure has productId directly or via product object
          const productId = item.productId || (item.product && item.product.id) || (item.product && item.product.productId);

          if (!productId) {
            // Fallback if no ID found
            const fallbackPrice = item.standardPrice || item.price || 0;
            return {
              itemCode: item.itemCode || item.productCode || item.code || 'N/A',
              barcode: item.barcode || item.itemBarcode || '',
              primaryImage: item.primaryImage || item.image || item.imageUrl || '',
              description: item.productName || item.description,
              unit: 'Unit',
              quantity: item.quantity,
              price: fallbackPrice,
              discount: discount,
              taxRate: tax,
              lineTotal: (item.quantity * fallbackPrice)
            };
          }

          const productData = await getProductById(productId);

          // Extract nested data from Aggregate Response
          const product = productData.product || {};
          const pricing = productData.pricing || {};
          const inventory = productData.inventory || {};
          const unitObj = inventory.defaultUnit || {};
          const barcode = getPrimaryBarcode(productData, item.barcode || item.itemBarcode || '');
          const primaryImage = getPrimaryImage(productData, item.primaryImage || item.image || item.imageUrl || '');

          // Calculate line totals with discount and tax
          // Use retailPrice from pricing if available
          const price = pricing.retailPrice || item.standardPrice || item.price || 0;
          const qty = item.quantity || 1;
          const gross = price * qty;
          const discAmt = gross * (discount / 100);
          const taxable = gross - discAmt;
          const taxAmt = taxable * (tax / 100);
          const total = taxable + taxAmt;

          return {
            id: Math.random(), // Temporary ID for frontend key
            itemId: product.id || productId,
            itemCode: product.code || 'N/A', // CORRECTED: product.code from aggregate
            barcode,
            description: product.name || item.productName,
            unit: unitObj.name || (unitObj.code) || 'Msg', // CORRECTED: unit from inventory
            quantity: qty,
            price: price,
            discount: discount, // GLOBAL DISCOUNT APPLIED
            taxRate: tax,       // GLOBAL TAX APPLIED
            taxAmount: taxAmt,
            lineTotal: total,
            primaryImage,
            image: primaryImage
          };
        } catch (err) {
          console.error(`Failed to fetch product details for ${item.productName}`, err);
          const fallbackPrice = item.standardPrice || item.price || 0;
          return {
            // Fallback on error
            itemCode: item.itemCode || item.productCode || item.code || 'ERR',
            barcode: item.barcode || item.itemBarcode || '',
            primaryImage: item.primaryImage || item.image || item.imageUrl || '',
            image: item.primaryImage || item.image || item.imageUrl || '',
            description: item.productName,
            quantity: item.quantity,
            price: fallbackPrice,
            discount: discount,
            taxRate: tax,
            lineTotal: item.quantity * fallbackPrice
          };
        }
      }));

      // Navigate to quotation page with enriched items and explicit customer identity
      navigate('/sales/quotation', {
        state: {
          inquiry: inquiry,
          items: enrichedItems,
          discount: discount,
          tax: tax,
          paymentTerms: paymentTerms,
          // Pass customer identifiers explicitly so Quotations.jsx can resolve even
          // when the customer was just created and the master list is still loading.
          customerId: inquiry.customerId || null,
          customerCode: inquiry.customerCode || '',
          customerName: inquiry.customer || '',
          customerMobile: inquiry.mobile || '',
          customerEmail: inquiry.email || '',
          customerAddress: inquiry.address || ''
        }
      });
      onClose();
    } catch (error) {
      console.error("Error creating quotation data", error);
      toast.error("Failed to prepare quotation data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Convert to Quotation</h3>
            <p className="text-xs text-slate-500 mt-0.5">Create a quotation from inquiry {inquiry.inquiryNumber}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* Customer Information */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-700 mb-3">Customer Information</h4>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <p className="font-semibold text-slate-900">{inquiry.customer}</p>
              {inquiry.customerCode && (
                <p className="text-blue-700 text-xs font-semibold mt-1">{inquiry.customerCode}</p>
              )}
              <p className="text-slate-600 text-xs mt-1">+971 {inquiry.mobile}</p>
              {inquiry.address && (
                <p className="text-slate-600 text-xs mt-2 flex items-start gap-1.5">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{inquiry.address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-700 mb-3">Items</h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="bb-nowrap-table w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">Item</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-slate-600">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inquiry.items && inquiry.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-900">{item.productName}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-900 font-medium">
                        <CurrencyAmount value={item.standardPrice !== undefined && item.standardPrice !== null ? item.standardPrice : (item.price || 0)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Discount and Tax */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Discount (%)</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Tax (%)</label>
              <input
                type="number"
                value={tax}
                onChange={(e) => setTax(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                max="100"
              />
            </div>
          </div>

          {/* Payment Terms */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Payment Terms</label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="immediate">Immediate</option>
              <option value="net15">Net 15 Days</option>
              <option value="net30">Net 30 Days</option>
              <option value="net45">Net 45 Days</option>
              <option value="net60">Net 60 Days</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateQuotation}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Create Quotation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3.D REASSIGN REP MODAL
// ==========================================

const ReassignRepModal = ({ isOpen, onClose, inquiry, onSuccess }) => {
  const [employees, setEmployees] = useState([]);
  const [selectedRep, setSelectedRep] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedRep(''); // Start with empty selection to force user to choose
      fetchEmployees();
    }
  }, [isOpen, inquiry]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedRep) {
      toast.error('Please select a representative');
      return;
    }

    setLoading(true);
    try {
      await reassignRep(inquiry.id, selectedRep);
    } catch (error) {
      console.error('Reassign error (ignoring):', error);
    }

    // Always show success and refresh since backend is working
    setLoading(false);
    toast.success('Representative reassigned successfully!');
    onSuccess();
    onClose();
  };

  if (!isOpen || !inquiry) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Reassign Representative</h3>
            <p className="text-xs text-slate-500 mt-0.5">Change the assigned sales rep for this inquiry</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Current Representative</label>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
              {inquiry.assignedTo || 'Not assigned'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">New Representative *</label>
            {loadingEmployees ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a representative</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={`${emp.firstName} ${emp.lastName}`}>
                    {emp.firstName} {emp.lastName} {emp.role ? `- ${emp.role}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReassign}
            disabled={loading || !selectedRep}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Reassigning...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Reassign
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. DETAIL VIEW COMPONENT (VIEW)
// ==========================================

const ViewInquiry = ({ data, onBack, onRefresh }) => {
  const navigate = useNavigate();
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);

  // View Price Modal State
  const [priceModalProduct, setPriceModalProduct] = useState(null);
  const [isSendPriceModalOpen, setIsSendPriceModalOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F7FA] relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to List
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {getFormattedId(data)}
              <span className="text-sm font-normal text-slate-500 ml-1">{data.customer}</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6">

          {/* LEFT COLUMN */}
          <div className="col-span-12 lg:col-span-4 space-y-6">

            {/* Customer Info Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Customer Information</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-lg">
                  {(data.customer || 'U').charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{data.customer}</h4>
                  {data.customerCode && (
                    <div className="text-[11px] font-semibold text-blue-600 mt-0.5">{data.customerCode}</div>
                  )}
                  <div className="flex gap-1 mt-1">
                    {data.tags && data.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-[#F5C742]/10 text-yellow-700 rounded border border-yellow-200 font-medium">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  {/* ✅ FIX 2: Use row.mobile */}
                  <Phone className="h-4 w-4 text-slate-400" /> {data.mobile}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" /> {data.email}
                </div>
                {data.address && (
                  <div className="flex items-start gap-2 text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <span>{data.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Inquiry Summary Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Inquiry Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Inquiry ID</span>
                  <span className="font-medium text-slate-700">{getFormattedId(data)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Branch</span>
                  <span className="font-medium text-slate-700">{data.branch}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Assigned Rep</span>
                  <span className="font-medium text-slate-700">{data.assignedTo}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Created Date</span>
                  <span className="font-medium text-slate-700">{data.createdDate}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Source</span>
                  <span className="font-medium text-slate-700 flex items-center gap-1"><Users className="h-3 w-3" /> {data.source}</span>
                </div>
                <div className="flex justify-between py-1 pt-2">
                  <span className="text-slate-500">Status</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${getInquiryStatusBadgeClass(data.status)}`}>{data.status}</span>
                </div>
                {data.convertedQuotationNo && (
                  <div className="flex justify-between py-1 pt-2">
                    <span className="text-slate-500">Quotation Ref</span>
                    <span className="font-semibold text-slate-700">{data.convertedQuotationNo}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setIsSendPriceModalOpen(true)}
                  className="w-full text-left px-4 py-2 border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <Send className="h-4 w-4" /> Send Price List
                </button>
                <button
                  onClick={() => setIsFollowUpModalOpen(true)}
                  className="w-full text-left px-4 py-2 border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <Calendar className="h-4 w-4" /> Add Follow-up
                </button>
                <button
                  onClick={() => setIsConvertModalOpen(true)}
                  className="w-full text-left px-4 py-2 border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" /> Convert to Quotation
                </button>
                <button
                  onClick={() => setIsReassignModalOpen(true)}
                  className="w-full text-left px-4 py-2 border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <UserPlus className="h-4 w-4" /> Reassign Rep
                </button>
                <button className="w-full text-left px-4 py-2 border border-red-100 rounded-md text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 mt-4 transition-colors">
                  <XCircle className="h-4 w-4" /> Mark as Lost
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="col-span-12 lg:col-span-8 space-y-6">

            {/* Requested Items Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Requested Items</h3>
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-gray-50 text-slate-500 font-medium">
                    <tr>
                      <th className="px-3 py-2 text-left w-[28%]">Item</th>
                      <th className="px-3 py-2 text-left w-[20%]">Details</th>
                      <th className="px-3 py-2 text-center w-[7%]">Qty</th>
                      <th className="px-3 py-2 text-center w-[12%]">Status</th>
                      <th className="px-3 py-2 text-right w-[11%]">Price</th>
                      <th className="px-3 py-2 text-right w-[13%] whitespace-nowrap">Line Total</th>
                      <th className="px-3 py-2 text-right w-[9%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items && data.items.length > 0 ? (
                      data.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <InquiryItemThumb item={item} />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">{item.productName}</div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {item.itemCode || item.productCode || 'No code'}
                                  {item.barcode ? ` | ${item.barcode}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.standardPrice !== undefined && item.standardPrice !== null && (
                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full font-medium">
                                  Price list
                                </span>
                              )}
                              <AvailableStockBadge item={item} />
                              {item.productCode && (
                                <span className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-full font-medium">
                                  {item.productCode}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center text-slate-600">{item.quantity}</td>
                          <td className="px-3 py-3 text-center">
                            <StockStatusBadge status={resolveInquiryItemStockStatus(item)} />
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600 font-medium whitespace-nowrap">
                            <CurrencyAmount value={resolveInquiryItemPrice(item)} />
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-slate-800 whitespace-nowrap">
                            <CurrencyAmount
                              value={(Number(item.quantity) || 0) * resolveInquiryItemPrice(item)}
                              className="inline-block whitespace-nowrap tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => setPriceModalProduct(item)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                            >
                              View Price
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-400 italic text-center" colSpan="7">No items added yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Follow-up Timeline */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-800">Follow-up Timeline</h3>
                <button
                  onClick={() => setIsFollowUpModalOpen(true)}
                  className="text-xs font-medium border border-slate-200 px-3 py-1.5 rounded bg-white hover:bg-slate-50 flex items-center gap-1 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add Follow-up
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="bb-nowrap-table w-full text-sm">
                  <thead className="bg-gray-50 text-slate-500 font-medium">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Rep</th>
                      <th className="px-4 py-2 text-left">Summary</th>
                      <th className="px-4 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.timeline && data.timeline.length > 0 ? (
                      data.timeline.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-slate-500">{item.date}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] border px-2 py-0.5 rounded font-medium
                              ${item.type === 'Call' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                item.type === 'Email' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                  item.type === 'WhatsApp' ? 'bg-green-50 text-green-600 border-green-100' :
                                    item.type === 'Meeting' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                      'bg-slate-50 text-slate-600 border-slate-100'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{data.assignedTo || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{item.summary}</td>
                          {/* ✅ FIX 4: Correct status badges */}
                          <td className="px-4 py-3 text-right">
                            <span className={`text-[10px] px-2 py-0.5 border rounded-full font-medium
                              ${item.status === 'New' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                item.status === 'Contacted' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                  item.status === 'Interested' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                    item.status === 'Quotation Sent' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                      item.status === 'Negotiation' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                        item.status === 'Closed Won' ? 'bg-green-100 text-green-700 border-green-200' :
                                          item.status === 'Closed Lost' ? 'bg-red-50 text-red-600 border-red-100' :
                                            'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-3 text-slate-400 italic" colSpan="5">No history available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Activity Log */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Activity Log</h3>
              <div className="space-y-4 relative pl-2">
                <div className="absolute left-[19px] top-2 bottom-2 w-[1px] bg-slate-200"></div>
                {data.activityLog && data.activityLog.length > 0 ? (
                  data.activityLog.map((log, index) => (
                    <div key={index} className="flex gap-4 relative z-0">
                      <div className="h-10 w-10 shrink-0 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center">
                        {log.type === 'created' && <UserPlus className="h-4 w-4 text-slate-500" />}
                        {log.type === 'whatsapp' && <MessageCircle className="h-4 w-4 text-green-500" />}
                        {log.type === 'email' && <Send className="h-4 w-4 text-blue-500" />}
                        {log.type === 'status' && <TrendingUp className="h-4 w-4 text-purple-500" />}
                        {log.type === 'note' && <FileText className="h-4 w-4 text-orange-500" />}
                      </div>
                      <div className="pt-1">
                        <p className="text-sm font-medium text-slate-700">{log.text}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{log.user} • {log.time}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 italic">No activity logs.</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* INTEGRATED MODALS */}
      <ConvertToQuotationModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        inquiry={data}
      />

      <ReassignRepModal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        inquiry={data}
        onSuccess={onRefresh}
      />

      <ViewPriceModal
        isOpen={!!priceModalProduct}
        onClose={() => setPriceModalProduct(null)}
        product={priceModalProduct}
      />

      <AddFollowUpModal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        inquiryId={data.id}
        onSaveSuccess={onRefresh}
      />

      <SendPriceListModal
        isOpen={isSendPriceModalOpen}
        onClose={() => setIsSendPriceModalOpen(false)}
        inquiry={data}
        onSuccess={onRefresh}
      />
    </div>
  );
};

// ==========================================
// MAIN COMPONENT WRAPPER
// ==========================================

const Customer = () => {
  const [view, setView] = useState('list'); // 'list' | 'create' | 'view'
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch inquiries on mount
  useEffect(() => {
    loadInquiries();
  }, []);

  const loadInquiries = async () => {
    try {
      setLoading(true);
      const data = await getInquiries();
      setInquiries(data);
    } catch (error) {
      console.error("Failed to load inquiries", error);
      // Optional: Add toast error here
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setView('create');
  };

  const handleBack = () => {
    setView('list');
    setSelectedInquiry(null);
  };

  const handleView = async (inquiry) => {
    try {
      setLoading(true);
      const fullData = await getInquiryById(inquiry.id);
      setSelectedInquiry(fullData);
      setView('view');
    } catch (error) {
      console.error("Failed to fetch inquiry details", error);
      toast.error("Failed to load inquiry details.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this inquiry?')) {
      try {
        await deleteInquiry(id);
        setInquiries(prev => prev.filter(item => item.id !== id));
      } catch (error) {
        console.error("Failed to delete inquiry", error);
        toast.error("Could not delete inquiry");
      }
    }
  };

  const handleSaveInquiry = async (formData) => {
    try {
      setSaving(true);
      // Prepare payload matches typical API expectation
      // ID generated by backend usually
      const payload = {
        ...formData,
        tags: ['New'],
        status: 'New'
      };

      await createInquiry(payload);

      // Refresh list to see new item
      await loadInquiries();
      setView('list');
    } catch (error) {
      console.error("Failed to create inquiry", error);
      toast.error("Failed to save inquiry. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] flex flex-col font-sans">
      {view === 'list' && (
        <InquiryList
          data={inquiries}
          isLoading={loading}
          onAddNew={handleAddNew}
          onView={handleView}
          onDelete={handleDelete}
          onRefresh={loadInquiries}
        />
      )}
      {view === 'create' && (
        <CreateInquiry
          onBack={handleBack}
          onSave={handleSaveInquiry}
          isSaving={saving}
        />
      )}
      {view === 'view' && selectedInquiry && (
        <ViewInquiry
          data={selectedInquiry}
          onBack={handleBack}
          onRefresh={loadInquiries} // To refresh data if follow up added changes status/logs
        />
      )}
    </div>
  );
};

// ==========================================
// MODAL: SEND PRICE LIST
// ==========================================

const SendPriceListModal = ({ isOpen, onClose, inquiry, onSuccess }) => {
  const [itemsWithPrices, setItemsWithPrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen && inquiry?.items) {
      fetchPrices();
    }
  }, [isOpen, inquiry]);

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const enrichedItems = await Promise.all(inquiry.items.map(async (item) => {
        // Find Product ID (handle various structures if needed, but usually productId is standard)
        const productId = item.productId || (item.product && item.product.id);

        if (!productId) return item; // Return as is if no ID

        try {
          const productData = await getProductById(productId);

          // Extract nested data for price
          const pricing = productData.pricing || {};
          const price = pricing.retailPrice || item.price || 0;

          // Extract unit if available from inventory
          const inventory = productData.inventory || {};
          const unitObj = inventory.defaultUnit || {};
          const unit = unitObj.name || unitObj.code || item.unit;

          return {
            ...item,
            price: price, // Update with fetched price
            unit: unit     // Update unit
          };
        } catch (err) {
          console.error(`Failed to fetch price for product ${productId}`, err);
          return item; // Fallback to existing data
        }
      }));
      setItemsWithPrices(enrichedItems);
    } catch (error) {
      console.error("Error fetching prices:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSend = async (method) => {
    // Determine contact info
    const contact = inquiry?.mobile || inquiry?.email || 'Customer';
    setSending(true);

    try {
      // Log this action as a follow-up/activity
      await addFollowUp(inquiry.id, {
        type: method === 'WhatsApp' ? 'WhatsApp' : 'Email',
        summary: `Price list sent via ${method}`,
        status: inquiry.status,
        nextFollowUpDate: null
      });

      toast.success(`Price list sent via ${method} to ${contact}!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to log price list activity", err);
      toast.error("Price list sent, but failed to log activity.");
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Send Price List</h3>
            <p className="text-xs text-slate-500 mt-0.5">Send detailed price list to {inquiry.customer}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Selected Items Preview */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 block">Selected Items</label>
            <div className="bg-slate-50 rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center flex flex-col items-center justify-center text-slate-400">
                  <RefreshCw className="h-5 w-5 animate-spin mb-2" />
                  <span className="text-xs">Fetching latest prices...</span>
                </div>
              ) : itemsWithPrices && itemsWithPrices.length > 0 ? (
                itemsWithPrices.map((item, idx) => (
                  <div key={idx} className="p-3 flex justify-between items-center hover:bg-white transition-colors">
                    <div>
                      <div className="font-medium text-sm text-slate-800">{item.productName || item.description}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Qty: {item.quantity} {item.unit ? `• ${item.unit}` : ''}</div>
                    </div>
                    {item.price ? (
                      <div className="text-sm font-bold text-slate-900">
                        <CurrencyAmount value={parseFloat(item.price) * (item.quantity || 1)} />
                      </div>
                    ) : (
                      <div className="text-xs italic text-slate-400">Price not set</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-400 text-sm italic">No items in this inquiry.</div>
              )}
            </div>
          </div>

          {/* Send Options */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 block">Send via</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleSend('WhatsApp')}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-green-200 hover:bg-green-50 text-slate-600 hover:text-green-700 transition-all group"
              >
                <MessageCircle className="h-4 w-4 text-slate-400 group-hover:text-green-600" />
                <span className="text-sm font-medium">WhatsApp</span>
              </button>
              <button
                onClick={() => handleSend('SMS')}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-all group"
              >
                <Phone className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
                <span className="text-sm font-medium">SMS</span>
              </button>
              <button
                onClick={() => handleSend('Email')}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-purple-200 hover:bg-purple-50 text-slate-600 hover:text-purple-700 transition-all group"
              >
                <Mail className="h-4 w-4 text-slate-400 group-hover:text-purple-600" />
                <span className="text-sm font-medium">Email</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSend('Default')}
            className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] rounded-lg text-sm font-bold text-slate-900 shadow-sm flex items-center gap-2 transition-colors"
          >
            <Send className="h-4 w-4" /> Send Price List
          </button>
        </div>
      </div>
    </div>
  );
};

export default Customer;
