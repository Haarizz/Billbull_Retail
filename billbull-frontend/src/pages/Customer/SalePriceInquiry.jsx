import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Mail,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  UserPlus,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { getProductsList } from '../../api/productsApi';
import { createInquiry } from '../../api/customerApi';
import { getEmployees } from '../../api/employeeApi';
import { getBranches } from '../../api/branchApi';
import CurrencyAmount from '../../components/CurrencyAmount';
import { getImageUrl } from '../../utils/urlUtils';

const SEARCH_FIELDS = [
  { key: 'all', label: 'All fields' },
  { key: 'name', label: 'Product name' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'sku', label: 'SKU' },
  { key: 'code', label: 'Item code' },
];

const EMPTY_FORM = {
  customer: '',
  mobile: '',
  email: '',
  address: '',
  branch: '',
  source: 'Walk-in',
  category: '',
  priority: 'medium',
  notes: '',
  assignedTo: '',
  followUpDate: '',
  followUpType: 'Phone Call',
  internalNote: '',
};

const PAGE_SIZE = 30;

const firstNumber = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const getPrimaryBarcode = (product = {}) =>
  product.barcode ||
  product.packings?.find?.(packing => packing?.barcode)?.barcode ||
  '';

const resolveStock = (product = {}) => {
  const stock = firstNumber(
    product.availableStock,
    product.stock,
    product.totalStock,
    product.currentStock,
    product.available
  );
  return Number.isFinite(stock) ? stock : 0;
};

const getStockStatus = (stock) => {
  if (stock <= 0) return 'out-stock';
  if (stock < 10) return 'low-stock';
  return 'in-stock';
};

const normalizeProduct = (product = {}) => {
  const stock = resolveStock(product);
  const barcode = getPrimaryBarcode(product);
  const price = firstNumber(product.retailPrice, product.sellingPrice, product.price);
  const cost = firstNumber(product.cost, product.purchasePrice);
  const image = product.image || product.primaryImage || '';

  return {
    id: product.id,
    productId: product.id,
    productCode: product.code || product.itemCode || '',
    itemCode: product.code || product.itemCode || '',
    barcode,
    image,
    primaryImage: image,
    productName: product.name || 'Unnamed Product',
    localName: product.localName || '',
    description: product.description || product.shortDesc || '',
    sku: product.sku || '',
    category: product.category || product.departmentName || '',
    departmentName: product.departmentName || '',
    brandName: product.brandName || '',
    unit: product.unitName || product.unit || 'PCS',
    status: product.branchStatus || product.status || '',
    stock,
    availableStock: stock,
    stockStatus: getStockStatus(stock),
    quantity: 1,
    price,
    cost,
    standardPrice: price,
  };
};

const buildShareText = (items, form) => {
  const lines = [
    'PRICE INQUIRY NOTE',
    `Customer: ${form.customer || 'Walk-in Customer'}`,
    `Date: ${new Date().toLocaleDateString('en-GB')}`,
    '',
  ];

  items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.productName}`,
      `   Code: ${item.itemCode || item.productCode || '-'}`,
      `   SKU: ${item.sku || '-'}`,
      `   Barcode: ${item.barcode || '-'}`,
      `   Unit: ${item.unit || '-'}`,
      `   Category: ${item.category || '-'}`,
      `   Qty: ${item.quantity}`,
      `   Price: AED ${firstNumber(item.price, item.standardPrice).toFixed(2)}`,
      `   Stock: ${item.availableStock ?? 0}`,
      item.description ? `   Notes: ${item.description}` : '',
      ''
    );
  });

  const total = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * firstNumber(item.price, item.standardPrice),
    0
  );

  lines.push(`Estimated Total: AED ${total.toFixed(2)}`);
  if (form.notes) {
    lines.push('', 'Inquiry Notes:', form.notes);
  }

  return lines.filter(Boolean).join('\n');
};

const matchesField = (product, query, field) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (field === 'name') {
    return `${product.productName || ''} ${product.localName || ''}`.toLowerCase().includes(q);
  }
  if (field === 'barcode') {
    return (product.barcode || '').toLowerCase().includes(q);
  }
  if (field === 'sku') {
    return (product.sku || '').toLowerCase().includes(q);
  }
  if (field === 'code') {
    return `${product.itemCode || ''} ${product.productCode || ''}`.toLowerCase().includes(q);
  }

  return [
    product.productName,
    product.localName,
    product.barcode,
    product.sku,
    product.itemCode,
    product.productCode,
    product.description,
    product.category,
    product.departmentName,
    product.brandName,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
};

const getStockBadgeClass = (status) => {
  if (status === 'out-stock') return 'bg-red-50 text-red-600 border-red-100';
  if (status === 'low-stock') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
};

const ProductDetailPill = ({ label, value, tone = 'slate' }) => {
  if (!value && value !== 0) return null;

  const toneClass =
    tone === 'yellow'
      ? 'bg-yellow-50 text-yellow-800 border-yellow-100'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
        : 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${toneClass}`}>
      {label}: {value}
    </span>
  );
};

const ProductCard = ({ product, onAdd }) => (
  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 transition-all hover:shadow-md hover:ring-yellow-200">
    <div className="flex gap-4">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center">
        {product.primaryImage ? (
          <img
            src={getImageUrl(product.primaryImage)}
            alt={product.productName}
            className="h-full w-full object-cover"
          />
        ) : (
          <Package className="h-8 w-8 text-slate-300" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold text-slate-900">{product.productName}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getStockBadgeClass(product.stockStatus)}`}>
                {product.stockStatus === 'out-stock'
                  ? 'Out of stock'
                  : product.stockStatus === 'low-stock'
                    ? 'Low stock'
                    : 'In stock'}
              </span>
            </div>
            {product.localName ? (
              <p className="mt-1 truncate text-xs text-slate-500">{product.localName}</p>
            ) : null}
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {product.description || 'No description available.'}
            </p>
          </div>

          <div className="shrink-0 rounded-2xl bg-yellow-50 px-4 py-3 ring-1 ring-yellow-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700">Selling price</div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              <CurrencyAmount value={firstNumber(product.price, product.standardPrice)} />
            </div>
            {product.cost > 0 ? (
              <div className="mt-1 text-xs text-slate-500">
                Cost: <CurrencyAmount value={product.cost} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <ProductDetailPill label="Item Code" value={product.itemCode || product.productCode || '-'} />
          <ProductDetailPill label="SKU" value={product.sku || '-'} />
          <ProductDetailPill label="Barcode" value={product.barcode || '-'} />
          <ProductDetailPill label="Brand" value={product.brandName || '-'} />
          <ProductDetailPill label="Department" value={product.departmentName || product.category || '-'} />
          <ProductDetailPill label="Unit" value={product.unit || '-'} />
          <ProductDetailPill label="Stock" value={product.availableStock ?? 0} tone="emerald" />
          <ProductDetailPill label="Status" value={product.status || '-'} tone="yellow" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onAdd(product)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#F5C742] px-4 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:bg-[#E5B732]"
          >
            <Plus className="h-4 w-4" /> Add to inquiry note
          </button>
          <span className="text-xs text-slate-400">
            Live search result from Products / Services
          </span>
        </div>
      </div>
    </div>
  </div>
);

const InquiryItemCard = ({ item, onChangeQty, onRemove }) => (
  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-900">{item.productName}</div>
        <div className="mt-1 text-[11px] text-slate-500">
          {item.itemCode || item.productCode || 'No code'}
          {item.sku ? ` | ${item.sku}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.productId)}
        className="text-slate-400 transition-colors hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <ProductDetailPill label="Barcode" value={item.barcode || '-'} />
      <ProductDetailPill label="Unit" value={item.unit || '-'} />
      <ProductDetailPill label="Stock" value={item.availableStock ?? 0} tone="emerald" />
    </div>

    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeQty(item.productId, -1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-6 text-center text-sm font-semibold text-slate-900">{item.quantity}</span>
        <button
          type="button"
          onClick={() => onChangeQty(item.productId, 1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100 text-slate-800 transition-colors hover:bg-yellow-200"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="text-right">
        <div className="text-[11px] text-slate-400">Line total</div>
        <div className="text-sm font-bold text-slate-900">
          <CurrencyAmount value={(Number(item.quantity) || 0) * firstNumber(item.price, item.standardPrice)} />
        </div>
      </div>
    </div>
  </div>
);

const ConvertInquiryModal = ({
  open,
  form,
  branches,
  employees,
  noteItems,
  saving,
  onClose,
  onChange,
  onSubmit,
}) => {
  if (!open) return null;

  const total = noteItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * firstNumber(item.price, item.standardPrice),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Convert to inquiry</h2>
            <p className="mt-1 text-sm text-slate-500">
              Save this note into Customer Connect and continue follow-up from the inquiry window.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Customer Name *</span>
                <input
                  value={form.customer}
                  onChange={(e) => onChange('customer', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                  placeholder="Walk-in customer or company"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Mobile Number *</span>
                <input
                  value={form.mobile}
                  onChange={(e) => onChange('mobile', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                  placeholder="+971 XX XXX XXXX"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Email</span>
                <input
                  value={form.email}
                  onChange={(e) => onChange('email', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                  placeholder="email@example.com"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Branch *</span>
                <select
                  value={form.branch}
                  onChange={(e) => onChange('branch', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                >
                  <option value="">Select branch</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Address</span>
              <textarea
                value={form.address}
                onChange={(e) => onChange('address', e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none"
                placeholder="Delivery or billing address"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Source *</span>
                <select
                  value={form.source}
                  onChange={(e) => onChange('source', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                >
                  <option>Walk-in</option>
                  <option>Phone Call</option>
                  <option>WhatsApp</option>
                  <option>Website</option>
                  <option>Social Media</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Assigned To *</span>
                <select
                  value={form.assignedTo}
                  onChange={(e) => onChange('assignedTo', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                >
                  <option value="">Select sales rep</option>
                  {employees.map(emp => {
                    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';
                    return (
                      <option key={emp.id || fullName} value={fullName}>
                        {fullName}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Category</span>
                <input
                  value={form.category}
                  onChange={(e) => onChange('category', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                  placeholder="Electronics, Grocery, Household..."
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Priority</span>
                <select
                  value={form.priority}
                  onChange={(e) => onChange('priority', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Follow-up Date</span>
                <input
                  type="date"
                  value={form.followUpDate}
                  onChange={(e) => onChange('followUpDate', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Follow-up Type</span>
                <select
                  value={form.followUpType}
                  onChange={(e) => onChange('followUpType', e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                >
                  <option>Phone Call</option>
                  <option>WhatsApp</option>
                  <option>Email</option>
                  <option>In-person Visit</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => onChange('notes', e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none"
                placeholder="Special price requests, customer expectations, or branch remarks..."
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Internal Note</span>
              <textarea
                value={form.internalNote}
                onChange={(e) => onChange('internalNote', e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 resize-none"
                placeholder="Hand-off notes for the sales rep..."
              />
            </label>
          </div>

          <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Inquiry summary</h3>
                <p className="mt-1 text-xs text-slate-500">Quick review before saving.</p>
              </div>
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-800">
                {noteItems.length} item{noteItems.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {noteItems.map(item => (
                <div key={item.productId} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-800">{item.productName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Qty {item.quantity} | AED {firstNumber(item.price, item.standardPrice).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="text-sm text-slate-500">Estimated Total</span>
              <span className="text-lg font-bold text-slate-900">
                <CurrencyAmount value={total} />
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#F5C742] px-4 py-2 text-sm font-bold text-slate-900 hover:bg-[#E5B732] disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {saving ? 'Creating inquiry...' : 'Create inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SalePriceInquiry = () => {
  const navigate = useNavigate();
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const [query, setQuery] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [totalFound, setTotalFound] = useState(0);
  const [noteItems, setNoteItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [convertOpen, setConvertOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [branchesData, employeesData] = await Promise.all([
          getBranches(),
          getEmployees(),
        ]);
        const branchList = Array.isArray(branchesData) ? branchesData : [];
        const employeeList = Array.isArray(employeesData) ? employeesData : [];

        setBranches(branchList);
        setEmployees(employeeList);
        setForm(prev => ({
          ...prev,
          branch: prev.branch || branchList[0]?.name || '',
          assignedTo: prev.assignedTo || (
            employeeList[0]
              ? `${employeeList[0].firstName || ''} ${employeeList[0].lastName || ''}`.trim() || employeeList[0].name || ''
              : ''
          ),
        }));
      } catch (error) {
        console.error('Failed to load sale price inquiry metadata', error);
        toast.error('Failed to load branches or employees.');
      }
    };

    loadMeta();
  }, []);

  const fetchProducts = useCallback(async (searchText) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    try {
      const response = await getProductsList(0, PAGE_SIZE, searchText, controller.signal);
      const list = Array.isArray(response?.content) ? response.content : [];
      setResults(list.map(normalizeProduct));
      setTotalFound(response?.totalElements || list.length || 0);
      setSearched(true);
    } catch (error) {
      if (error?.name !== 'AbortError' && error?.name !== 'CanceledError') {
        console.error('Failed to search products', error);
        toast.error('Failed to search products.');
      }
    } finally {
      if (abortRef.current === controller) {
        setSearching(false);
      }
    }
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    clearTimeout(debounceRef.current);

    if (!trimmedQuery) {
      if (abortRef.current) abortRef.current.abort();
      setResults([]);
      setTotalFound(0);
      setSearching(false);
      setSearched(false);
      return undefined;
    }

    debounceRef.current = setTimeout(() => {
      fetchProducts(trimmedQuery);
    }, 350);

    return () => clearTimeout(debounceRef.current);
  }, [query, fetchProducts]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const filteredResults = useMemo(
    () => results.filter(product => matchesField(product, query, searchField)),
    [results, query, searchField]
  );

  const noteTotal = useMemo(
    () => noteItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * firstNumber(item.price, item.standardPrice),
      0
    ),
    [noteItems]
  );

  const addToNote = (product) => {
    setNoteItems(prev => {
      const existing = prev.find(item => item.productId === product.productId);
      if (existing) {
        return prev.map(item =>
          item.productId === product.productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    toast.success(`${product.productName} added`);
  };

  const changeQuantity = (productId, delta) => {
    setNoteItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const removeItem = (productId) => {
    setNoteItems(prev => prev.filter(item => item.productId !== productId));
  };

  const handleCopyNote = async () => {
    if (!noteItems.length) return;
    const text = buildShareText(noteItems, form);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Inquiry note copied');
    } catch (error) {
      console.error('Clipboard copy failed', error);
      toast.error('Could not copy note');
    }
  };

  const handleWhatsAppShare = () => {
    if (!noteItems.length) return;
    const text = encodeURIComponent(buildShareText(noteItems, form));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmailShare = () => {
    if (!noteItems.length) return;
    const text = encodeURIComponent(buildShareText(noteItems, form));
    window.open(`mailto:?subject=Sale%20Price%20Inquiry&body=${text}`, '_blank');
  };

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const openConvert = () => {
    if (!noteItems.length) {
      toast.error('Add at least one product first.');
      return;
    }

    setForm(prev => ({
      ...prev,
      category: prev.category || noteItems[0]?.category || '',
    }));
    setConvertOpen(true);
  };

  const handleCreateInquiry = async () => {
    if (!form.customer.trim() || !form.mobile.trim()) {
      toast.error('Customer name and mobile number are required.');
      return;
    }
    if (!form.branch || !form.assignedTo) {
      toast.error('Please select branch and sales representative.');
      return;
    }

    const payload = {
      ...form,
      tags: ['New', 'Price Inquiry Desk'],
      status: 'New',
      items: noteItems.map(item => ({
        productId: item.productId,
        productCode: item.productCode,
        itemCode: item.itemCode,
        barcode: item.barcode,
        image: item.image,
        primaryImage: item.primaryImage,
        productName: item.productName,
        description: item.description,
        sku: item.sku,
        category: item.category,
        unit: item.unit,
        stock: item.stock,
        availableStock: item.availableStock,
        stockStatus: item.stockStatus,
        quantity: item.quantity,
        price: firstNumber(item.price, item.standardPrice),
        standardPrice: firstNumber(item.price, item.standardPrice),
      })),
      notes: [
        form.notes?.trim(),
        `Estimated total: AED ${noteTotal.toFixed(2)}`,
      ].filter(Boolean).join('\n\n'),
    };

    try {
      setSaving(true);
      await createInquiry(payload);
      toast.success('Inquiry created successfully');
      navigate('/customer/inquiries');
    } catch (error) {
      console.error('Failed to create inquiry', error);
      toast.error('Failed to create inquiry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA]">
      <div className="border-b border-slate-200 bg-white">
        <div className="px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Customer Connect</span>
                <span>&gt;</span>
                <span className="font-medium text-slate-900">Sale Price Inquiry</span>
              </div>

              <div className="mt-3 flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/customer/inquiries')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                    Sale Price Inquiry
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Full-width live search for products with direct conversion into Customer Connect inquiries.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyNote}
                disabled={!noteItems.length}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" /> Copy note
              </button>
              <button
                type="button"
                onClick={handleWhatsAppShare}
                disabled={!noteItems.length}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
              <button
                type="button"
                onClick={handleEmailShare}
                disabled={!noteItems.length}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Mail className="h-4 w-4" /> Email
              </button>
              <button
                type="button"
                onClick={openConvert}
                disabled={!noteItems.length}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F5C742] px-4 py-2 text-sm font-bold text-slate-900 hover:bg-[#E5B732] disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" /> Convert to inquiry
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-138px)] xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0">
          <div className="border-b border-slate-200 bg-white px-5 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0 flex-1">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Live Product Search
                </label>
                <div className="relative">
                  <Search className="absolute left-4 top-3.5 h-4 w-4 text-yellow-600" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type product name, barcode, SKU, or item code..."
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-12 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50"
                  />
                  {searching && (
                    <RefreshCw className="absolute right-4 top-3.5 h-4 w-4 animate-spin text-yellow-600" />
                  )}
                </div>
              </div>

              <div className="shrink-0 rounded-2xl bg-yellow-50 px-4 py-3 ring-1 ring-yellow-100">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700">
                  Search status
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  {searching ? 'Searching...' : `${filteredResults.length} shown`}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {searched ? `${totalFound} results from product catalog` : 'Loading product catalog'}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SEARCH_FIELDS.map(field => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => setSearchField(field.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    searchField === field.key
                      ? 'border-yellow-200 bg-yellow-100 text-yellow-800'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 py-5 md:px-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Products / Services</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Results update automatically while you type, using the same live search behavior as product selection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchProducts(query.trim())}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-4 w-4 ${searching ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {!searched && (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl bg-white text-center shadow-sm ring-1 ring-slate-200/80">
                  <ShoppingBag className="mb-3 h-9 w-9 text-yellow-600" />
                  <p className="text-sm font-medium text-slate-600">Preparing live product search...</p>
                </div>
              )}

              {searched && !searching && filteredResults.length === 0 && (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl bg-white text-center shadow-sm ring-1 ring-slate-200/80">
                  <Package className="mb-3 h-9 w-9 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No products matched "{query || 'the current filter'}".</p>
                  <p className="mt-1 text-xs text-slate-400">Try product name, barcode, SKU, or item code.</p>
                </div>
              )}

              {filteredResults.map(product => (
                <ProductCard key={product.productId} product={product} onAdd={addToNote} />
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 xl:border-l xl:border-t-0">
          <div className="xl:sticky xl:top-0">
            <div className="border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Inquiry Note</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Everything added here will be converted into a formal inquiry.
                  </p>
                </div>
                <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-800">
                  {noteItems.length} item{noteItems.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="max-h-[calc(100vh-330px)] space-y-3 overflow-auto px-4 py-4">
              {noteItems.length === 0 ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center rounded-3xl bg-white text-center shadow-sm ring-1 ring-slate-200/80">
                  <Package className="mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No items yet.</p>
                  <p className="mt-1 text-xs text-slate-400">Search a product on the left and add it here.</p>
                </div>
              ) : (
                noteItems.map(item => (
                  <InquiryItemCard
                    key={item.productId}
                    item={item}
                    onChangeQty={changeQuantity}
                    onRemove={removeItem}
                  />
                ))
              )}
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-500">Estimated Total</span>
                <span className="text-2xl font-bold text-slate-900">
                  <CurrencyAmount value={noteTotal} />
                </span>
              </div>
              <button
                type="button"
                onClick={openConvert}
                disabled={!noteItems.length}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F5C742] px-4 py-3 text-sm font-bold text-slate-900 hover:bg-[#E5B732] disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" /> Convert to formal inquiry
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConvertInquiryModal
        open={convertOpen}
        form={form}
        branches={branches}
        employees={employees}
        noteItems={noteItems}
        saving={saving}
        onClose={() => setConvertOpen(false)}
        onChange={updateForm}
        onSubmit={handleCreateInquiry}
      />
    </div>
  );
};

export default SalePriceInquiry;
