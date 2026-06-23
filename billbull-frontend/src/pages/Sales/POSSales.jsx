import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import { ScrollArea } from '../../components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Switch } from '../../components/ui/switch';
import { UAE_DIRHAM_SYMBOL_IMAGE } from '../../utils/countryCurrencyOptions';
import { getProductsList } from '../../api/productsApi';
import { getDepartments } from '../../api/departmentsApi';
import { getAllCustomers } from '../../api/customerledgerApi';
import { sendSalesInvoiceEmail, getSalesInvoiceById } from '../../api/salesInvoiceApi';
import { saveSalesPayment } from '../../api/salesPaymentApi';
import { receiptVoucherApi } from '../../api/receiptVoucherApi';
import { fetchStatementOfAccount } from '../../api/financialsApi';
import {
  registerPosTerminal, getPosSettings, savePosSettings, verifyPosSupervisorPin, openPosSession, getActivePosSession,
  closePosSession, addPosCashMovement, getPosXReport, getPosZReport, posCheckout,
  getAllPosTerminals, renamePosTerminal, setTerminalStatus, resolvePosEntry,
  createLayaway, getLayaways, getLayaway, cancelLayaway, convertLayaway,
  holdSale, getHeldSales, recallHeldSale,
  posCreditBalance, posBatchCheck, getPosInvoices, lookupPosInvoice,
  getPosCustomerHistory,
} from '../../api/posApi';
import { saveSalesReturn, updateSalesReturnStatus, getReturnableBatches } from '../../api/salesReturnApi';
import { getImageUrl } from '../../utils/urlUtils';
import { getSalesAnalytics } from '../../api/salesReportsApi';
import { generateDocumentPrintHtml } from '../../utils/documentTemplateRenderer';
import { printHtml, generateReportA4Html, downloadPdfViaServer } from '../../utils/printGenerator';
import QRCode from 'qrcode';
import { exportToPDF, exportToExcel } from '../../utils/exportUtils';
import {
  Calculator,
  ShoppingCart,
  Receipt,
  CreditCard,
  Banknote,
  Smartphone,
  Package,
  Plus,
  Minus,
  Trash2,
  Search,
  Percent,
  FileBarChart,
  FileText,
  Printer,
  RotateCcw,
  Pause,
  Play,
  DollarSign,
  ArrowDown,
  ArrowUp,
  Users,
  User,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet,
  Archive,
  CheckCircle,
  XCircle,
  Dumbbell,
  Shirt,
  Droplets,
  Cookie,
  Headphones,
  X,
  Coffee,
  Lock,
  Unlock,
  Settings,
  Star,
  ChevronDown,
  LayoutGrid,
  LayoutTemplate,
  Columns,
  UserPlus,
  Tag,
  Zap,
  Eye,
  Download,
  ChevronRight,
  BarChart2,
  AlertTriangle,
  AlertCircle,
  Hash,
  Shield,
  Info,
  UserCheck,
  Wrench,
  ClipboardList,
  Stethoscope,
  PackageCheck,
  Truck,
  PieChart,
  Activity,
  RefreshCw,
  Filter,
  Calendar,
  MapPin,
  ArrowRightCircle,
  BadgeDollarSign,
  LayoutDashboard,
  Phone,
  Upload
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

const DirhamSymbol = ({ className = '' }) => (
  <span
    className={`bb-aed-symbol ${className}`}
    data-bb-currency-symbol="true"
    data-bb-aed-symbol="true"
    role="img"
    aria-label="AED"
    style={{
      backgroundColor: 'currentColor',
      WebkitMaskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
      maskImage: `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain'
    }}
  />
);

const DenominationLabel = ({ value, className = '' }) => (
  <Label className={`w-20 flex-none text-[#1E293B] ${className}`}>
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <DirhamSymbol className="shrink-0" />
      <span>{value}:</span>
    </span>
  </Label>
);

const CurrencyAmount = ({ amount, className = '' }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
    <DirhamSymbol className="shrink-0" />
    <span>{Number(amount || 0).toFixed(2)}</span>
  </span>
);

const DenominationAmount = ({ amount, className = '' }) => (
  <span className={`w-28 flex-none inline-flex items-center justify-end gap-1 whitespace-nowrap text-sm ${className}`}>
    <span>=</span>
    <CurrencyAmount amount={amount} />
  </span>
);

const renderAED = (v) => {
  if (typeof v !== 'string') return v;
  if (v.startsWith('(AED ')) return <>(<DirhamSymbol />{v.slice(5, -1)})</>;
  if (v.startsWith('AED ')) return <><DirhamSymbol />{v.slice(4)}</>;
  return v;
};

const POS_PRODUCT_PAGE_SIZE = 40;
const WALK_IN_CUSTOMER = {
  id: 'walk-in',
  code: '',
  name: 'Walk-in Customer',
  phone: '',
  balance: 0,
  membershipId: '',
  tier: '',
  loyaltyPoints: 0
};

const CATEGORY_ICONS = [Package, Dumbbell, Shirt, Droplets, Headphones, Cookie, Coffee, Tag, LayoutGrid];

// Layaway status: backend enum <-> human label used in the filter dropdown / table.
const STATUS_LABEL_TO_ENUM = {
  'Active': 'ACTIVE',
  'Partially Paid': 'PARTIALLY_PAID',
  'Ready to Convert': 'READY_TO_CONVERT',
  'Converted to Sale': 'CONVERTED',
  'Cancelled': 'CANCELLED',
  'Expired': 'EXPIRED',
};
const STATUS_ENUM_TO_LABEL = {
  ACTIVE: 'Active',
  PARTIALLY_PAID: 'Partially Paid',
  READY_TO_CONVERT: 'Ready to Convert',
  CONVERTED: 'Converted to Sale',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapPosProductListItem = (d = {}) => ({
  id: d.id,
  code: d.code || '',
  name: d.name || d.shortDesc || 'Unnamed Product',
  nameAr: d.localName || '',
  barcode: d.barcode || d.packings?.find(p => p?.barcode)?.barcode || d.code || '',
  price: toNumber(d.retailPrice ?? d.maxPrice ?? d.minPrice ?? d.onlinePrice ?? 0),
  stock: toNumber(d.stock ?? 0),
  image: d.image ? getImageUrl(d.image) : null,
  departmentId: d.departmentId || null,
  departmentName: d.departmentName || '',
  productType: d.productType || '',
  salesTax: toNumber(d.salesTax, 5),
  defaultDiscount: toNumber(d.maxDiscount ?? d.defaultDiscount, 0),
});

const mapPosProductAggregateItem = (entry = {}, scannedBarcode = '') => {
  const product = entry.product || entry;
  const pricing = entry.effectivePricing || entry.activeBranchPrice || entry.pricing || product.pricing || {};
  return mapPosProductListItem({
    id: product.id,
    code: product.code,
    name: product.name,
    localName: product.localName,
    barcode: scannedBarcode || product.barcode,
    retailPrice: pricing.retailPrice,
    maxPrice: pricing.maxPrice,
    minPrice: pricing.minPrice,
    onlinePrice: pricing.onlinePrice,
    stock: entry.stock ?? product.stock,
    image: entry.primaryImage || entry.image,
    departmentId: product.department?.id,
    departmentName: product.department?.name,
    productType: product.productType,
    salesTax: entry.tax?.salesTax || product.tax?.salesTax,
    maxDiscount: product.maxDiscount,
  });
};

const mapPosCustomer = (customer = {}) => ({
  id: String(customer.id ?? customer.code ?? customer.customerCode ?? ''),
  code: customer.code || customer.customerCode || '',
  name: customer.name || customer.customerName || customer.fullName || 'Unnamed Customer',
  phone: customer.phone || customer.mobile || customer.mobileNo || '',
  email: customer.email || '',
  balance: toNumber(customer.currentBalance ?? customer.balance ?? 0),
  membershipId: customer.membershipId || customer.code || customer.customerCode || '',
  tier: customer.priceList || customer.groupType || customer.group || '',
  loyaltyPoints: toNumber(customer.loyaltyPoints ?? 0)
});

const cachePosProduct = (cache, product) => {
  if (!cache || !product) return;
  [product.id, product.code, product.barcode, product.name]
    .filter(Boolean)
    .forEach(key => cache.set(String(key).toLowerCase(), product));
};







// ─── CustomerPicker ───────────────────────────────────────────────────────────
// Fast typeahead for large customer lists — never renders all items at once
const CustomerPicker = React.memo(({ customers, value, onChange, placeholder = 'Type name, code or phone…' }) => {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  const selected = React.useMemo(() => customers.find(c => c.id === value) || null, [customers, value]);

  const results = React.useMemo(() => {
    const lq = q.trim().toLowerCase();
    if (!lq) return customers.slice(0, 10);
    return customers.filter(c =>
      (c.name && c.name.toLowerCase().includes(lq)) ||
      (c.code && c.code.toLowerCase().includes(lq)) ||
      (c.phone && String(c.phone).includes(lq))
    ).slice(0, 12);
  }, [customers, q]);

  React.useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div
        className="w-full h-10 px-3 flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-[#327F74]/30 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected && !open ? (
          <>
            <span className="flex-1 text-sm font-medium text-[#1E293B] truncate">{selected.name}</span>
            <button className="ml-2 text-gray-400 hover:text-gray-600 text-xs" onClick={e => { e.stopPropagation(); onChange(null); setQ(''); }}>✕</button>
          </>
        ) : (
          <input
            type="text"
            autoFocus={open}
            className="flex-1 text-sm outline-none bg-transparent"
            placeholder={placeholder}
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
          />
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {results.length === 0
              ? <div className="px-3 py-4 text-sm text-gray-400 text-center">No customers found</div>
              : results.map(c => (
                <button
                  key={c.id}
                  className="w-full px-3 py-2.5 text-left hover:bg-[#F7F7FA] flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(c.id); setQ(''); setOpen(false); }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#1E293B] truncate">{c.name}</div>
                    {c.code && <div className="text-xs text-gray-400 font-mono">{c.code}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                    {(c.balance || 0) > 0 && <div className="text-xs font-semibold text-orange-500">Bal: {(c.balance||0).toFixed(2)}</div>}
                  </div>
                </button>
              ))
            }
          </div>
          {!q.trim() && customers.length > 10 && (
            <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
              Showing 10 of {customers.length} — type to search
            </div>
          )}
        </div>
      )}
    </div>
  );
});
CustomerPicker.displayName = 'CustomerPicker';

// ─── CustomerView ─────────────────────────────────────────────────────────────
// React.memo: never re-renders due to parent cart/session state changes.
// Lazy-mounts form tabs. Uses debounced search. CustomerPicker replaces Select.
const CUST_PAGE_SIZE = 30;
const CUST_AVATAR_COLORS = ['bg-[#327F74]','bg-violet-500','bg-blue-500','bg-rose-500','bg-amber-500','bg-emerald-500','bg-indigo-500','bg-pink-500'];
const getCustInitials = (name = '') => name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const getCustAvatarColor = (name = '') => CUST_AVATAR_COLORS[name.charCodeAt(0) % CUST_AVATAR_COLORS.length];

const CustomerView = React.memo(({ customerOptions, posCustomersLoading, setCurrentView }) => {
  const [custTab, setCustTab]             = React.useState('list');
  const [custSearch, setCustSearch]       = React.useState('');
  const [custBalanceFilter, setCustBalanceFilter] = React.useState('all');
  const [custPage, setCustPage]           = React.useState(1);
  const [visited, setVisited]             = React.useState({ list: true, receipt: false, advance: false, statement: false });
  const [receiptCust, setReceiptCust]     = React.useState(null);
  const [advanceCust, setAdvanceCust]     = React.useState(null);
  const [statementCust, setStatementCust] = React.useState(null);

  // Receipt form state
  const [receiptAmount, setReceiptAmount]   = React.useState('');
  const [receiptMethod, setReceiptMethod]   = React.useState('');
  const [receiptRef, setReceiptRef]         = React.useState('');
  const [receiptBusy, setReceiptBusy]       = React.useState(false);
  const [receiptSuccess, setReceiptSuccess] = React.useState(null);

  // Advance form state
  const [advAmount, setAdvAmount]     = React.useState('');
  const [advMethod, setAdvMethod]     = React.useState('');
  const [advNotes, setAdvNotes]       = React.useState('');
  const [advBusy, setAdvBusy]         = React.useState(false);
  const [advSuccess, setAdvSuccess]   = React.useState(null);

  // Statement form state
  const [stmtFromDate, setStmtFromDate]   = React.useState('');
  const [stmtToDate, setStmtToDate]       = React.useState('');
  const [stmtData, setStmtData]           = React.useState(null);
  const [stmtEntries, setStmtEntries]     = React.useState([]);
  const [stmtBusy, setStmtBusy]           = React.useState(false);
  const [stmtError, setStmtError]         = React.useState(null);

  const handleTabChange = React.useCallback((id) => {
    setCustTab(id);
    setVisited(v => v[id] ? v : { ...v, [id]: true });
  }, []);

  const jumpToStatement = React.useCallback((custId) => {
    setStatementCust(custId);
    handleTabChange('statement');
  }, [handleTabChange]);

  const handleRecordPayment = React.useCallback(async () => {
    const selected = customerOptions.find(c => c.id === receiptCust);
    if (!selected) return alert('Please select a customer.');
    if (!receiptAmount || Number(receiptAmount) <= 0) return alert('Enter a valid payment amount.');
    if (!receiptMethod) return alert('Please select a payment method.');
    setReceiptBusy(true);
    setReceiptSuccess(null);
    try {
      await saveSalesPayment({
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentType: 'RECEIVED',
        customerCode: selected.code,
        customerName: selected.name,
        amount: Number(receiptAmount),
        paymentMode: receiptMethod,
        referenceNumber: receiptRef || null,
        status: 'COMPLETED',
      });
      setReceiptSuccess(`Payment of ${Number(receiptAmount).toFixed(2)} recorded for ${selected.name}.`);
      setReceiptAmount('');
      setReceiptMethod('');
      setReceiptRef('');
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data || 'Failed to record payment.');
    } finally {
      setReceiptBusy(false);
    }
  }, [receiptCust, receiptAmount, receiptMethod, receiptRef, customerOptions]);

  const handleReceiveAdvance = React.useCallback(async () => {
    const selected = customerOptions.find(c => c.id === advanceCust);
    if (!selected) return alert('Please select a customer.');
    if (!advAmount || Number(advAmount) <= 0) return alert('Enter a valid advance amount.');
    if (!advMethod) return alert('Please select a payment method.');
    setAdvBusy(true);
    setAdvSuccess(null);
    try {
      const payload = {
        date: new Date().toISOString().slice(0, 10),
        memberName: selected.name,
        customerCode: selected.code,
        category: 'Advance Received',
        amount: Number(advAmount),
        paymentMode: advMethod,
        notes: advNotes || null,
        status: 'Completed',
        purpose: 'ADVANCE_RECEIVED',
      };
      const fd = new FormData();
      fd.append('data', JSON.stringify(payload));
      await receiptVoucherApi.create(fd);
      setAdvSuccess(`Advance of ${Number(advAmount).toFixed(2)} received for ${selected.name}.`);
      setAdvAmount('');
      setAdvMethod('');
      setAdvNotes('');
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data || 'Failed to record advance.');
    } finally {
      setAdvBusy(false);
    }
  }, [advanceCust, advAmount, advMethod, advNotes, customerOptions]);

  const handleViewStatement = React.useCallback(async () => {
    const selected = customerOptions.find(c => c.id === statementCust);
    if (!selected) return alert('Please select a customer.');
    setStmtBusy(true);
    setStmtError(null);
    setStmtData(null);
    setStmtEntries([]);
    try {
      const from = stmtFromDate || '2000-01-01';
      const to   = stmtToDate   || new Date().toISOString().slice(0, 10);
      const data = await fetchStatementOfAccount('CUSTOMER', selected.code, from, to);
      setStmtData(data);
      setStmtEntries(data?.entries || data?.lines || []);
    } catch (e) {
      setStmtError(e?.response?.data?.message || 'Failed to load statement.');
    } finally {
      setStmtBusy(false);
    }
  }, [statementCust, stmtFromDate, stmtToDate, customerOptions]);

  const realCustomers = React.useMemo(
    () => customerOptions.filter(c => c.id !== WALK_IN_CUSTOMER.id),
    [customerOptions]
  );
  const totalOutstanding = React.useMemo(
    () => realCustomers.reduce((s, c) => s + (c.balance || 0), 0),
    [realCustomers]
  );
  const withBalance = React.useMemo(
    () => realCustomers.filter(c => (c.balance || 0) > 0).length,
    [realCustomers]
  );

  // 150 ms debounce keeps the input instant while filtering stays cheap
  const [deferredSearch, setDeferredSearch] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDeferredSearch(custSearch), 150);
    return () => clearTimeout(t);
  }, [custSearch]);

  const filtered = React.useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return realCustomers.filter(c => {
      const hit = !q || [c.name, c.code, c.membershipId, c.phone, c.email]
        .some(v => v && String(v).toLowerCase().includes(q));
      const bal = c.balance || 0;
      const balOk = custBalanceFilter === 'all' ? true : custBalanceFilter === 'with' ? bal > 0 : bal <= 0;
      return hit && balOk;
    });
  }, [realCustomers, deferredSearch, custBalanceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CUST_PAGE_SIZE));
  const safePage   = Math.min(custPage, totalPages);
  const pageStart  = (safePage - 1) * CUST_PAGE_SIZE;
  const pageRows   = React.useMemo(() => filtered.slice(pageStart, pageStart + CUST_PAGE_SIZE), [filtered, pageStart]);

  const receiptSelected = React.useMemo(() => realCustomers.find(c => c.id === receiptCust) || null, [realCustomers, receiptCust]);

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <tr key={i}>
          <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0" /><div className="space-y-1.5"><div className="h-3 w-32 bg-gray-200 rounded animate-pulse" /><div className="h-2.5 w-16 bg-gray-100 rounded animate-pulse" /></div></div></td>
          <td className="px-4 py-3"><div className="h-3 w-20 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-3 w-14 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-3 text-right"><div className="h-3 w-16 bg-gray-200 rounded animate-pulse ml-auto" /></td>
          <td className="px-4 py-3 text-right"><div className="h-6 w-24 bg-gray-200 rounded animate-pulse ml-auto" /></td>
        </tr>
      ))}
    </>
  );

  return (
    <div className="min-h-full bg-[#F7F7FA]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 text-xs mb-1">
              <span className="text-gray-500 hover:text-[#327F74] cursor-pointer" onClick={() => setCurrentView('dashboard')}>Dashboard</span>
              <ChevronRight className="h-3 w-3 text-gray-400" />
              <span className="text-[#327F74] font-medium">Customer Management</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
              <Users className="h-6 w-6 text-[#327F74]" /> Customer Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">View statements, receive payments, and manage customer advances</p>
          </div>
          <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#327F74] border border-gray-200 hover:border-[#327F74]/40 px-4 py-2 rounded-lg transition-all">
            <ChevronRight className="h-4 w-4 rotate-180" /> Back to Dashboard
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Customers',       val: posCustomersLoading ? '…' : realCustomers.length,  icon: <Users className="h-4 w-4" />,      color: 'bg-[#327F74]/5 border-[#327F74]/20',  text: 'text-[#327F74]',   ic: 'text-[#327F74]' },
            { label: 'Outstanding Balance',    val: posCustomersLoading ? '…' : <span className="inline-flex items-center gap-0.5"><DirhamSymbol />{totalOutstanding.toFixed(2)}</span>, icon: <DollarSign className="h-4 w-4" />, color: 'bg-[#F5C742]/10 border-[#F5C742]/30', text: 'text-[#9A7B00]', ic: 'text-[#9A7B00]' },
            { label: 'Accounts with Balance',  val: posCustomersLoading ? '…' : withBalance,           icon: <AlertCircle className="h-4 w-4" />, color: 'bg-orange-50 border-orange-200',       text: 'text-orange-600',  ic: 'text-orange-500' },
            { label: 'Zero Balance',           val: posCustomersLoading ? '…' : realCustomers.length - withBalance, icon: <CheckCircle className="h-4 w-4" />, color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-600', ic: 'text-emerald-500' },
          ].map(k => (
            <div key={k.label} className={`${k.color} rounded-xl p-3 border`}>
              <div className="flex items-center gap-2 mb-1"><span className={k.ic}>{k.icon}</span><span className="text-xs text-gray-500">{k.label}</span></div>
              <div className={`text-xl font-bold ${k.text} flex items-center gap-1`}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav + Content */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="flex gap-1">
          {[
            { id: 'list',      label: 'Customer List',      icon: <Users className="h-4 w-4" /> },
            { id: 'receipt',   label: 'Customer Receipt',   icon: <Receipt className="h-4 w-4" /> },
            { id: 'advance',   label: 'Receive Advance',    icon: <Wallet className="h-4 w-4" /> },
            { id: 'statement', label: 'Customer Statement', icon: <FileText className="h-4 w-4" /> },
          ].map(t => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${custTab === t.id ? 'border-[#327F74] text-[#327F74]' : 'border-transparent text-gray-500 hover:text-[#1E293B]'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Customer List */}
        <div style={{ display: custTab === 'list' ? 'block' : 'none' }}>
          <div className="py-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={custSearch}
                  onChange={e => { setCustSearch(e.target.value); setCustPage(1); }}
                  placeholder="Search by name, code, membership, phone…"
                  className="w-full pl-9 pr-4 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 bg-white" />
              </div>
              <select value={custBalanceFilter} onChange={e => { setCustBalanceFilter(e.target.value); setCustPage(1); }}
                className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#327F74]/30">
                <option value="all">All Accounts</option>
                <option value="with">With Balance</option>
                <option value="zero">Zero Balance</option>
              </select>
              <button className="ml-auto h-9 px-4 text-sm font-medium bg-[#327F74] hover:bg-[#2a6b61] text-white rounded-lg flex items-center gap-2 transition-colors" onClick={() => handleTabChange('receipt')}>
                <Plus className="h-4 w-4" /> Add Customer
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F7F7FA] border-b border-gray-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Membership</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {posCustomersLoading ? <SkeletonRows /> : pageRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center"><Search className="h-7 w-7 text-gray-400" /></div>
                        <p className="text-sm font-medium text-gray-500">{deferredSearch ? `No results for "${custSearch}"` : 'No customers found'}</p>
                        {deferredSearch && <button onClick={() => setCustSearch('')} className="text-xs text-[#327F74] underline">Clear search</button>}
                      </div>
                    </td></tr>
                  ) : pageRows.map(customer => (
                    <tr key={customer.id} className="hover:bg-[#F7F7FA]/70 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${getCustAvatarColor(customer.name)}`}>{getCustInitials(customer.name)}</div>
                          <div>
                            <div className="font-semibold text-[#1E293B]">{customer.name}</div>
                            {customer.code && <div className="text-xs text-gray-400 font-mono">{customer.code}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.membershipId ? <span className="text-xs font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded">{customer.membershipId}</span> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600"><Phone className="h-3 w-3 text-gray-400 shrink-0" />{customer.phone || <span className="text-gray-400">—</span>}</div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.tier ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${customer.tier === 'Gold' ? 'bg-[#F5C742]/15 text-[#9A7B00]' : customer.tier === 'Silver' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700'}`}>{customer.tier}</span> : <span className="text-xs text-gray-400">Standard</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(customer.balance || 0) > 0 ? <span className="font-semibold text-orange-600 inline-flex items-center gap-0.5"><DirhamSymbol />{(customer.balance||0).toFixed(2)}</span> : <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Cleared</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => { setReceiptCust(customer.id); handleTabChange('receipt'); }} className="text-xs font-medium text-[#327F74] border border-[#327F74]/30 hover:bg-[#327F74]/5 px-3 py-1.5 rounded-lg transition-colors">View</button>
                          <button onClick={() => jumpToStatement(customer.id)} className="text-xs font-medium text-white bg-[#327F74] hover:bg-[#2a6b61] px-3 py-1.5 rounded-lg transition-colors">Statement</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-[#F7F7FA]/60">
                <span className="text-xs text-gray-500">
                  {posCustomersLoading ? 'Loading…' : filtered.length === 0 ? '0 customers' : `${pageStart+1}–${Math.min(pageStart+CUST_PAGE_SIZE, filtered.length)} of ${filtered.length} customer${filtered.length!==1?'s':''}`}
                  {deferredSearch && !posCustomersLoading && <span className="ml-1 text-[#327F74]">(filtered)</span>}
                </span>
                <div className="flex items-center gap-1 text-xs">
                  <button disabled={safePage<=1} onClick={()=>setCustPage(p=>Math.max(1,p-1))} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Prev</button>
                  {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
                    const p=totalPages<=7?i+1:safePage<=4?i+1:safePage>=totalPages-3?totalPages-6+i:safePage-3+i;
                    return <button key={p} onClick={()=>setCustPage(p)} className={`w-8 h-7 rounded-lg text-xs font-medium transition-colors ${p===safePage?'bg-[#327F74] text-white':'border border-gray-200 hover:bg-white text-gray-600'}`}>{p}</button>;
                  })}
                  <button disabled={safePage>=totalPages} onClick={()=>setCustPage(p=>Math.min(totalPages,p+1))} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next →</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt — lazy mount */}
        <div style={{ display: custTab === 'receipt' ? 'block' : 'none' }}>
          {visited.receipt && (
            <div className="py-5 max-w-2xl">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#327F74]/5 to-transparent">
                  <div className="p-2 bg-[#327F74]/10 rounded-lg"><Receipt className="h-5 w-5 text-[#327F74]" /></div>
                  <div><h2 className="text-base font-semibold text-[#1E293B]">Record Customer Payment</h2><p className="text-xs text-gray-500">Receive payment against a customer outstanding balance</p></div>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Select Customer <span className="text-red-500">*</span></label>
                    <CustomerPicker customers={realCustomers} value={receiptCust} onChange={setReceiptCust} />
                  </div>
                  {receiptSelected && (
                    <div className={`rounded-lg px-4 py-3 flex items-center gap-3 text-sm ${(receiptSelected.balance||0)>0?'bg-orange-50 border border-orange-100':'bg-emerald-50 border border-emerald-100'}`}>
                      <AlertCircle className={`h-4 w-4 shrink-0 ${(receiptSelected.balance||0)>0?'text-orange-500':'text-emerald-500'}`} />
                      <div><span className="font-semibold">{receiptSelected.name}</span>{' — Outstanding: '}{(receiptSelected.balance||0)>0?<span className="font-bold text-orange-600 inline-flex items-center gap-0.5"><DirhamSymbol />{(receiptSelected.balance||0).toFixed(2)}</span>:<span className="text-emerald-600 font-semibold">Cleared</span>}</div>
                    </div>
                  )}
                  {receiptSuccess && (
                    <div className="rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 shrink-0" />{receiptSuccess}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Payment Amount (<DirhamSymbol />)</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><DirhamSymbol /></span><Input type="number" placeholder="0.00" className="pl-8 h-10 border-gray-200" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Payment Method</label>
                      <Select value={receiptMethod} onValueChange={setReceiptMethod}><SelectTrigger className="h-10 border-gray-200"><SelectValue placeholder="Select method…" /></SelectTrigger><SelectContent><SelectItem value="Cash">💵 Cash</SelectItem><SelectItem value="Card">💳 Card</SelectItem><SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem><SelectItem value="Cheque">🧾 Cheque</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Reference / Notes</label>
                    <Input placeholder="Cheque no., transfer ref, or notes…" className="h-10 border-gray-200" value={receiptRef} onChange={e => setReceiptRef(e.target.value)} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1 bg-[#327F74] hover:bg-[#2a6b61] text-white h-10" disabled={receiptBusy} onClick={handleRecordPayment}><CheckCircle className="h-4 w-4 mr-2" /> {receiptBusy ? 'Saving…' : 'Record Payment'}</Button>
                    <Button variant="outline" className="border-gray-200 text-gray-600 h-10" disabled><Printer className="h-4 w-4 mr-2" /> Print Receipt</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advance — lazy mount */}
        <div style={{ display: custTab === 'advance' ? 'block' : 'none' }}>
          {visited.advance && (
            <div className="py-5 max-w-2xl">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#F5C742]/10 to-transparent">
                  <div className="p-2 bg-[#F5C742]/15 rounded-lg"><Wallet className="h-5 w-5 text-[#9A7B00]" /></div>
                  <div><h2 className="text-base font-semibold text-[#1E293B]">Receive Advance Payment</h2><p className="text-xs text-gray-500">Accept advance deposit for future purchases</p></div>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Select Customer <span className="text-red-500">*</span></label>
                    <CustomerPicker customers={realCustomers} value={advanceCust} onChange={setAdvanceCust} />
                  </div>
                  {advSuccess && (
                    <div className="rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 shrink-0" />{advSuccess}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Advance Amount (<DirhamSymbol />)</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><DirhamSymbol /></span><Input type="number" placeholder="0.00" className="pl-8 h-10 border-gray-200" value={advAmount} onChange={e => setAdvAmount(e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Payment Method</label>
                      <Select value={advMethod} onValueChange={setAdvMethod}><SelectTrigger className="h-10 border-gray-200"><SelectValue placeholder="Select method…" /></SelectTrigger><SelectContent><SelectItem value="Cash">💵 Cash</SelectItem><SelectItem value="Card">💳 Card</SelectItem><SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem><SelectItem value="Cheque">🧾 Cheque</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Purpose / Notes</label>
                    <Input placeholder="e.g. Advance for custom order, layaway deposit…" className="h-10 border-gray-200" value={advNotes} onChange={e => setAdvNotes(e.target.value)} />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />Advance payments are credited to the customer account and applied against future invoices.
                  </div>
                  <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold h-10" disabled={advBusy} onClick={handleReceiveAdvance}><Wallet className="h-4 w-4 mr-2" /> {advBusy ? 'Saving…' : 'Receive Advance'}</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Statement — lazy mount */}
        <div style={{ display: custTab === 'statement' ? 'block' : 'none' }}>
          {visited.statement && (
            <div className="py-5 max-w-3xl space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-transparent">
                  <div className="p-2 bg-indigo-100 rounded-lg"><FileText className="h-5 w-5 text-indigo-600" /></div>
                  <div><h2 className="text-base font-semibold text-[#1E293B]">Generate Customer Statement</h2><p className="text-xs text-gray-500">View transaction history, outstanding balance, and payment summary</p></div>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Select Customer <span className="text-red-500">*</span></label>
                    <CustomerPicker customers={realCustomers} value={statementCust} onChange={setStatementCust} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">From Date</label><Input type="date" className="h-10 border-gray-200" value={stmtFromDate} onChange={e => setStmtFromDate(e.target.value)} /></div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">To Date</label><Input type="date" className="h-10 border-gray-200" value={stmtToDate} onChange={e => setStmtToDate(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 bg-[#F7F7FA] rounded-lg p-4">
                    {[
                      {label:'Opening Balance', value: stmtData ? Number(stmtData.openingBalance ?? 0).toFixed(2) : '0.00'},
                      {label:'Total Invoiced',  value: stmtData ? Number(stmtData.totalInvoiced ?? stmtData.totalDebits ?? 0).toFixed(2) : '0.00'},
                      {label:'Total Paid',      value: stmtData ? Number(stmtData.totalPaid ?? stmtData.totalCredits ?? 0).toFixed(2) : '0.00'},
                    ].map(s=>(
                      <div key={s.label} className="text-center">
                        <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                        <p className="text-sm font-bold text-[#1E293B] inline-flex items-center gap-0.5"><DirhamSymbol />{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {stmtError && <div className="rounded-lg px-4 py-3 bg-red-50 border border-red-100 text-sm text-red-600">{stmtError}</div>}
                  <div className="flex gap-3 pt-1">
                    <Button className="flex-1 bg-[#327F74] hover:bg-[#2a6b61] text-white h-10" disabled={stmtBusy} onClick={handleViewStatement}><FileText className="h-4 w-4 mr-2" /> {stmtBusy ? 'Loading…' : 'View Statement'}</Button>
                    <Button variant="outline" className="border-gray-200 text-gray-600 h-10" disabled><Download className="h-4 w-4 mr-2" /> Export PDF</Button>
                    <Button variant="outline" className="border-gray-200 text-gray-600 h-10" disabled><Printer className="h-4 w-4 mr-2" /> Print</Button>
                  </div>
                  {stmtEntries.length > 0 && (
                    <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-[#F7F7FA] border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Date</th>
                          <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Description</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Debit</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Credit</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Balance</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {stmtEntries.map((e, i) => (
                            <tr key={i} className="hover:bg-[#F7F7FA]/50">
                              <td className="px-4 py-2 text-gray-500">{e.date || e.entryDate || '—'}</td>
                              <td className="px-4 py-2 text-[#1E293B]">{e.description || e.reference || e.type || '—'}</td>
                              <td className="px-4 py-2 text-right text-red-600">{(e.debit||e.debitAmount||0) > 0 ? <span className="inline-flex items-center gap-0.5"><DirhamSymbol />{Number(e.debit||e.debitAmount||0).toFixed(2)}</span> : '—'}</td>
                              <td className="px-4 py-2 text-right text-emerald-600">{(e.credit||e.creditAmount||0) > 0 ? <span className="inline-flex items-center gap-0.5"><DirhamSymbol />{Number(e.credit||e.creditAmount||0).toFixed(2)}</span> : '—'}</td>
                              <td className="px-4 py-2 text-right font-semibold text-[#1E293B]"><span className="inline-flex items-center gap-0.5"><DirhamSymbol />{Number(e.balance||e.runningBalance||0).toFixed(2)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
});
CustomerView.displayName = 'CustomerView';
// ── Print template helpers (module-level so component identity is stable) ────

const stripForPreview = (html) => {
  let out = String(html||'').replace(/<script[\s\S]*?<\/script>/gi,'');
  out = out.replace(/(html\s*,\s*\n?\s*body\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g,'$1width:100%');
  out = out.replace(/(html\s*,\s*\n?\s*body\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g,'$1min-height:0');
  out = out.replace(/(\s\.document-shell\s*\{[^}]*?)(width\s*:\s*[\d.]+mm)/g,'$1width:100%');
  out = out.replace(/(\s\.document-shell\s*\{[^}]*?)(min-height\s*:\s*[\d.]+mm)/g,'$1min-height:0');
  out = out.replace(/(\s\.document-footer-group\s*\{[^}]*?)(margin-top\s*:\s*auto)/g,'$1margin-top:16px');
  const reset = `<style id="__pr__">html,body{min-height:0!important;height:auto!important;background:#fff!important}.document-shell{min-height:0!important;height:auto!important}.document-footer-group{margin-top:16px!important}.content-stack{flex:none!important}#footer-push-spacer,#footer-inner-spacer{display:none!important}</style>`;
  return out.replace(/<\/head>/i, reset+'</head>');
};

const buildDocumentPreviewHtml = (category, { companyName, trn, address, phone, footerNote }, toggles = {}) => {
  const isReturn = category === 'Sales Return';
  const t = toggles;
  const salesDesignerSettings = {
    showLogo:              t.showLogo             !== false,
    showCompanyAddress:    t.showCompanyDetails    !== false,
    showTRN:               t.showTrn               !== false,
    showCustomerDetails:   t.showCustomerDetails   !== false,
    showTerms:             t.showTerms             !== false && !!footerNote,
    showNotes:             t.showNotes             !== false,
    showBankDetails:       !!t.showBankDetails,
    showQRCode:            !!t.showQRCode,
    showQR:                !!t.showQRCode,
    showCompanyStamp:      !!t.showStamp,
    showStamp:             !!t.showStamp,
    showSignatures:        !!t.showSignature,
    showSignatureStrip:    !!t.showSignature,
    showGrandTotalBanner:  t.showGrandTotalBanner  !== false,
    showSummaryBar:        t.showGrandTotalBanner  !== false,
    showSubtotal:          true,
    showVATTotal:          true,
    showGrandTotal:        true,
    primaryColor:          '#F5C742',
    accentColor:           '#F5C742',
    logoUrl:               t.logoDataUrl  || undefined,
    companyLogoUrl:        t.logoDataUrl  || undefined,
    stampUrl:              t.stampDataUrl || undefined,
    stampImage:            t.stampDataUrl || undefined,
  };
  const columns = JSON.stringify({
    productId:      t.colItemCode     !== false,
    image:          !!t.colItemImage,
    description:    true,
    qty:            true,
    unitPrice:      true,
    taxableAmount:  true,
    barcode:        !!t.colBarcode,
    batchNumber:    t.colBatchNo      !== false,
    discount:       t.colDiscount     !== false,
    taxPercent:     t.colVatPct       !== false,
    tax:            t.colVatAmt       !== false,
    total:          true,
  });
  const displayOptions = JSON.stringify({
    showLogo:            t.showLogo            !== false,
    showCompanyDetails:  t.showCompanyDetails  !== false,
    showCustomerDetails: t.showCustomerDetails !== false,
    showTerms:           t.showTerms           !== false && !!footerNote,
    showBankDetails:     !!t.showBankDetails,
    showQRCode:          !!t.showQRCode,
    primaryColor:        '#F5C742',
    accentColor:         '#F5C742',
    salesDesignerSettings,
  });
  const template = {
    category,
    paperSize: 'A4',
    orientation: 'Portrait',
    termsContent: footerNote || '',
    columns,
    displayOptions,
    salesDesignerSettings,
  };
  const items = isReturn
    ? [{ code:'SGAL-A55', name:'Samsung Galaxy A55', desc:'128GB · Black', qty:1, price:1380, disc:0, tax:5, taxAmt:69, total:1449, batchNumber:'SGAL-120526' }]
    : [
        { code:'SGAL-A55', name:'Samsung Galaxy A55', desc:'128GB · Black', qty:1, price:1380, disc:0, tax:5, taxAmt:69, total:1449, batchNumber:'SGAL-120526' },
        { code:'IPH-CASE', name:'iPhone Leather Case', desc:'Brown · Genuine leather', qty:2, price:22.5, disc:0, tax:5, taxAmt:2.25, total:47.25, batchNumber:'' },
      ];
  const data = {
    title: isReturn ? 'CREDIT NOTE' : 'TAX INVOICE',
    docNo: isReturn ? 'SR-POS-000042' : 'SI-POS-000001',
    date: '22 Jun 2026',
    customer: { name:'Fatima Hassan', address:'Dubai, UAE', phone:'+971 50 123 4567' },
    items,
    totals: isReturn
      ? { subTotal:1380, tax:69, grandTotal:1449, discountAmount:0, billDiscountAmount:0 }
      : { subTotal:1425, tax:71.25, grandTotal:1496.25, discountAmount:0, billDiscountAmount:0 },
    meta: { notes: t.showNotes !== false ? (footerNote || 'Sample note line') : '', paymentTerm:'', dueDate:'', salesPerson:'', location: companyName || '' }
  };
  const options = { companyProfile:{ companyName: companyName || 'Your Company', trn: trn || '', address: address || '', phone: phone || '', currency:'AED', logoUrl: t.logoDataUrl || undefined, stampUrl: t.stampDataUrl || undefined } };
  try { return stripForPreview(generateDocumentPrintHtml(template, data, options)); }
  catch (e) {
    console.warn('A4 preview generation failed:', e);
    return `<html><body style="padding:20px;font-family:Arial,sans-serif;color:#666;text-align:center;padding-top:60px"><p>Preview unavailable</p></body></html>`;
  }
};

const buildThermalPrintHtml = (paperSize, { companyName, trn, header, footer, showTrn }) => {
  const w = paperSize==='58mm' ? '58mm' : '80mm';
  const pw = paperSize==='58mm' ? '50mm' : '72mm';
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn?`<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>`:''}
${header?`<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>`:''}
<div class="d"></div>
<div>INV: SI-POS-000001</div><div>22 Jun 2026  10:30 AM</div>
<div>Cust: Fatima Hassan</div>
<div class="d"></div>
<div class="row"><span>Samsung A55 x1</span><span>AED 1,380</span></div>
<div class="row"><span>iPhone Case x2</span><span>AED 45</span></div>
<div class="d"></div>
<div class="row"><span>Subtotal</span><span>AED 1,425</span></div>
<div class="row"><span>VAT 5%</span><span>AED 71.25</span></div>
<div class="row b" style="font-size:13px"><span>TOTAL</span><span>AED 1,496.25</span></div>
<div class="d"></div>
${footer?`<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>`:''}
</body></html>`;
};

// Encodes UAE FTA ZATCA Phase-1 QR data as base64 TLV (mirrors ZatcaQrGenerator.java).
const buildZatcaTlvBase64 = (sellerName, trn, isoTimestamp, totalWithVat, vatTotal) => {
  const enc = new TextEncoder();
  const tlvField = (tag, value) => {
    const bytes = enc.encode(String(value || ''));
    return [tag, bytes.length, ...bytes];
  };
  const bytes = new Uint8Array([
    ...tlvField(0x01, sellerName || ''),
    ...tlvField(0x02, trn && trn.trim() ? trn.trim() : 'N/A'),
    ...tlvField(0x03, isoTimestamp || new Date().toISOString()),
    ...tlvField(0x04, parseFloat(totalWithVat || 0).toFixed(2)),
    ...tlvField(0x05, parseFloat(vatTotal || 0).toFixed(2)),
  ]);
  return btoa(String.fromCharCode(...bytes));
};

const buildThermalReceiptHtml = (paperSize, invoice, { companyName, trn, header, footer, showTrn, isReprint = false, zatcaQrDataUrl = null }) => {
  const w = paperSize === '58mm' ? '58mm' : '80mm';
  const pw = paperSize === '58mm' ? '50mm' : '72mm';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const items = (invoice.items || []).filter(it => !it.voided);
  const subTotal = invoice.subTotal || 0;
  const taxTotal = invoice.taxTotal || 0;
  const grandTotal = invoice.invoiceTotal || 0;
  const payMode = invoice.paymentMode || '';
  const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const invTime = invoice.createdAt ? new Date(invoice.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  const customer = invoice.customerName || 'Walk-in Customer';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{margin:0;size:${w} auto}*{margin:0;padding:0;box-sizing:border-box}
body{width:${pw};margin:0 auto;font-family:'Courier New',monospace;font-size:11px;line-height:1.5;padding:4px 0}
.c{text-align:center}.b{font-weight:bold}.d{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between}
</style></head><body>
<div class="c b" style="font-size:13px">${esc(companyName)}</div>
${showTrn ? `<div class="c" style="font-size:9px">TRN: ${esc(trn)}</div>` : ''}
${header ? `<div class="c" style="font-size:9px;margin:3px 0">${esc(header)}</div>` : ''}
${isReprint ? '<div class="c b" style="font-size:9px;margin:2px 0">*** COPY / REPRINT ***</div>' : ''}
<div class="d"></div>
<div>INV: ${esc(invoice.invoiceNumber || '')}</div>
<div>${esc(invDate)}${invTime ? '  ' + esc(invTime) : ''}</div>
<div>Cust: ${esc(customer)}</div>
${payMode ? `<div>Pay: ${esc(payMode)}</div>` : ''}
<div class="d"></div>
${items.map(it => {
  const qty = it.quantity || 0;
  const price = it.unitPrice || it.price || 0;
  const total = it.netAmount || it.lineTotal || (qty * price);
  const batch = it.batchNumber || it.pinnedBatchNumber || '';
  return `<div class="row"><span>${esc(it.itemName || it.productName || '')} x${qty}</span><span>AED ${fmt(total)}</span></div>${batch ? `<div style="font-size:9px;color:#555;padding-left:2px">Batch: ${esc(batch)}</div>` : ''}`;
}).join('')}
<div class="d"></div>
<div class="row"><span>Subtotal</span><span>AED ${fmt(subTotal)}</span></div>
<div class="row"><span>VAT</span><span>AED ${fmt(taxTotal)}</span></div>
<div class="row b" style="font-size:13px"><span>TOTAL</span><span>AED ${fmt(grandTotal)}</span></div>
<div class="d"></div>
${zatcaQrDataUrl ? `<div class="c" style="margin:6px 0"><img src="${zatcaQrDataUrl}" style="width:80px;height:80px" alt="ZATCA QR" /><div style="font-size:8px;color:#555;margin-top:2px">Scan to verify</div></div>` : ''}
${footer ? `<div class="c" style="font-size:9px;margin-top:4px">${esc(footer)}</div>` : ''}
</body></html>`;
};

const buildServiceJobA4Html = ({ companyName, trn, address, phone, footerNote }) => {
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const abbr = n => esc(n||'BB').substring(0,2).toUpperCase();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:9px;color:#222;background:#fff;padding:20px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:2.5px solid #F5C742}
.logo{width:52px;height:52px;background:linear-gradient(135deg,#F5C742,#e6b838);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff}
.dt{font-size:13px;font-weight:900;color:#1E293B;letter-spacing:.5px;margin-left:10px;align-self:center}
.co{text-align:right;font-size:8px;color:#555;line-height:1.5}.co-n{font-size:12px;font-weight:700;color:#1E293B}
.meta{display:flex;gap:6px;margin-bottom:12px}.mb{flex:1;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:5px 7px}
.ml{font-size:7px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px}.mv{font-size:8.5px;color:#1E293B;font-weight:600}
.srow{display:flex;gap:6px;margin-bottom:8px}.sbox{flex:1;border:1px solid #E5E7EB;border-radius:6px;padding:6px 8px}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:7px;font-weight:700;background:#F0FDF4;color:#16A34A}
.sig{border-top:1px solid #D1D5DB;margin-top:30px;font-size:7px;color:#9CA3AF;padding-top:3px;text-align:center}
.fn{margin-top:10px;padding:6px 10px;background:#FFFBEB;border-left:3px solid #F5C742;font-size:8px;color:#666;line-height:1.4}
@page{size:A4 portrait;margin:15mm}
</style></head><body>
<div class="hdr">
  <div style="display:flex;align-items:center"><div class="logo">${abbr(companyName)}</div><div class="dt">SERVICE JOB CARD</div></div>
  <div class="co"><div class="co-n">${esc(companyName||'Your Company')}</div><div>TRN: ${esc(trn)}</div><div>${esc(address)}</div><div>${esc(phone)}</div></div>
</div>
<div class="meta">
  <div class="mb"><div class="ml">Job No</div><div class="mv">SRV-000028</div></div>
  <div class="mb"><div class="ml">Date</div><div class="mv">22 Jun 2026</div></div>
  <div class="mb"><div class="ml">Technician</div><div class="mv">Mohammed Ali</div></div>
</div>
<div class="srow">
  <div class="sbox"><div class="ml">Customer</div><div class="mv">Fatima Hassan</div><div style="font-size:8px;color:#555;margin-top:2px">+971 50 123 4567</div></div>
  <div class="sbox"><div class="ml">Device / Item</div><div class="mv">Samsung Galaxy A55</div><div style="font-size:8px;color:#555;margin-top:2px">Serial: SNSA55-20260312</div></div>
</div>
<div style="border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;margin-bottom:10px">
  <div class="ml" style="margin-bottom:4px">Problem Description</div>
  <div style="font-size:8.5px;color:#1E293B">Display issue — screen flickering when brightness above 70%.</div>
  <div style="margin-top:6px"><span class="badge">Under Warranty</span></div>
</div>
<div style="border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px;margin-bottom:10px">
  <div class="ml" style="margin-bottom:4px">Service Notes / Work Done</div>
  <div style="font-size:8px;color:#bbb;font-style:italic">To be filled after diagnosis...</div>
</div>
<div class="sig">Customer Signature ___________________</div>
${footerNote?`<div class="fn">${esc(footerNote)}</div>`:''}
</body></html>`;
};


const buildPosPrintData = (full, footerNote = '') => ({
  title: 'TAX INVOICE',
  docNo: full.invoiceNumber || '',
  date: full.invoiceDate || '',
  customer: {
    name: full.customerName || 'Walk-in Customer',
    address: full.customerAddress || '',
    phone: full.customerPhone || '',
    email: full.customerEmail || '',
    trn: full.customerTrn || '',
  },
  items: (full.items || []).filter(it => !it.voided).map(it => ({
    code: it.itemCode || '',
    name: it.itemName || it.productName || '',
    desc: it.description || '',
    qty: it.quantity || 0,
    price: it.unitPrice || it.price || 0,
    disc: it.discountPercent || 0,
    tax: it.taxPercent || it.taxRate || 5,
    taxAmt: it.taxAmount || 0,
    total: it.netAmount || it.lineTotal || 0,
    batchNumber: it.batchNumber || '',
    image: it.image || '',
  })),
  totals: {
    subTotal: full.subTotal || 0,
    tax: full.taxTotal || 0,
    grandTotal: full.invoiceTotal || 0,
    discountAmount: full.discountTotal || 0,
    billDiscountAmount: full.billDiscountAmount || 0,
    footerDiscountAmount: full.footerDiscountAmount || 0,
  },
  meta: {
    notes: footerNote,
    paymentMode: full.paymentMode || '',
    location: full.branchName || '',
    salesPerson: full.posCounterName || '',
  },
});

const buildPosA4Template = (footerNote = '', opts = {}) => {
  const ds = {
    showLogo:             opts.showLogo             !== false,
    showCompanyName:      opts.showCompanyDetails   !== false,
    showCompanyAddress:   opts.showCompanyDetails   !== false,
    showTRN:              opts.showTrn              !== false,
    showBillTo:           opts.showCustomerDetails  !== false,
    showCustomerName:     opts.showCustomerDetails  !== false,
    showTerms:            opts.showTerms            !== false,
    showNotes:            opts.showNotes            !== false,
    showBankDetails:      !!opts.showBankDetails,
    showQRCode:           !!opts.showQRCode,
    showCompanyStamp:     !!opts.showStamp,
    showSignatures:       !!opts.showSignature,
    showGrandTotalBanner: opts.showGrandTotalBanner !== false,
    colItemCode:          opts.colItemCode          !== false,
    colProductImage:      !!opts.colItemImage,
    colBarcode:           !!opts.colBarcode,
    colBatchNumber:       !!opts.colBatchNo,
    colDiscount:          opts.colDiscount          !== false,
    colVAT:               opts.colVatPct            !== false,
    colVATAmount:         opts.colVatAmt            !== false,
    primaryColor: '#F5C742',
    accentColor:  '#F5C742',
  };
  return {
    category: 'Sales Invoice',
    paperSize: 'A4',
    orientation: 'Portrait',
    termsContent: footerNote,
    displayOptions: JSON.stringify({
      showLogo:            ds.showLogo,
      showCompanyDetails:  ds.showCompanyName,
      showCustomerDetails: ds.showBillTo,
      showTerms:           ds.showTerms,
      showBankDetails:     ds.showBankDetails,
      showQRCode:          ds.showQRCode,
      primaryColor:        '#F5C742',
      accentColor:         '#F5C742',
      salesDesignerSettings: ds,
    }),
  };
};

const ThermalMock = ({ paperSize='80mm', lines=[] }) => (
  <div className="mx-auto border border-dashed border-gray-300 rounded-xl p-3 bg-white font-mono text-center space-y-0.5 shadow-sm" style={{ width: paperSize==='58mm' ? 190 : 240 }}>
    {lines.map((l,i)=><p key={i} className={`text-[9px] leading-tight ${i===0?'font-black text-gray-800':l.startsWith('─')?'text-gray-300':l.startsWith('TOTAL')||l.startsWith('REFUND')||l.startsWith('JOB')?'font-black text-gray-800':'text-gray-500'}`}>{l}</p>)}
  </div>
);

const useA4BlobUrl = (html) => {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [html]);
  return url;
};

const A4PreviewFrame = ({ html, scale }) => {
  const url = useA4BlobUrl(html);
  const s = scale ?? 0.455;
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white w-full" style={{ height: Math.round(1055 * s) }}>
      <div style={{ width:794, transformOrigin:'top left', transform:`scale(${s})`, position:'absolute', top:0, left:0 }}>
        {url && <iframe src={url} style={{ width:794, height:1055, border:'none', display:'block' }} title="A4 preview" />}
      </div>
    </div>
  );
};

const A4LivePreview = ({ category, companyName, trn, address, phone, footerNote, scale, toggles }) => {
  const html = useMemo(
    () => buildDocumentPreviewHtml(category, { companyName, trn, address, phone, footerNote }, toggles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, companyName, trn, address, phone, footerNote, JSON.stringify(toggles)]
  );
  return <A4PreviewFrame html={html} scale={scale} />;
};

const ServiceJobA4Preview = ({ companyName, trn, address, phone, footerNote, scale }) => {
  const html = useMemo(
    () => stripForPreview(buildServiceJobA4Html({ companyName, trn, address, phone, footerNote })),
    [companyName, trn, address, phone, footerNote]
  );
  return <A4PreviewFrame html={html} scale={scale} />;
};

const PaperSizePicker = ({ value, onChange }) => (
  <div className="flex gap-1.5">
    {['80mm','58mm','A4'].map(s=>(
      <button type="button" key={s} onClick={()=>onChange(s)}
        className={`px-3 py-1 rounded-lg border text-xs font-bold transition-all ${value===s?'border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B]':'border-gray-200 text-gray-400 hover:border-gray-300'}`}>{s}
      </button>
    ))}
  </div>
);

const ImageUploadBox = ({ label, value, onChange, hint }) => {
  const inputRef = React.useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className="relative w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#F5C742] bg-gray-50 hover:bg-[#F5C742]/5 flex items-center justify-center overflow-hidden transition-all group">
        {value
          ? <img src={value} alt={label} className="w-full h-full object-contain p-1.5" />
          : <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-[#b8920e]">
              <Upload className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase">Upload</span>
            </div>
        }
      </button>
      {value
        ? <button type="button" onClick={() => onChange(null)} className="text-[9px] text-red-400 hover:text-red-600 font-semibold">Remove</button>
        : hint && <span className="text-[9px] text-gray-300 text-center">{hint}</span>
      }
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export default function POSSales() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [analyticsDateTo, setAnalyticsDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [analyticsBranch, setAnalyticsBranch] = useState('All');
  const [analyticsCustomer, setAnalyticsCustomer] = useState('');
  const [analyticsPayMode, setAnalyticsPayMode] = useState('All');
  const [analyticsTab, setAnalyticsTab] = useState('pipeline');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const [posSettings, setPosSettings] = useState(null);
  // Behavior-settings editor (Console → Behavior tab)
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavedFlash, setSettingsSavedFlash] = useState(false);
  const [currentTerminal, setCurrentTerminal] = useState(null);
  const [posInitLoading, setPosInitLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  // Supervisor PIN dialog for void
  const [showSupervisorPin, setShowSupervisorPin] = useState(false);
  const [supervisorPinValue, setSupervisorPinValue] = useState('');
  const [supervisorPinError, setSupervisorPinError] = useState('');
  const [pendingVoidItemId, setPendingVoidItemId] = useState(null);
  // Action pending supervisor approval during layaway conversion (Clear / Remove / Void)
  const [pendingLayawayAbortAction, setPendingLayawayAbortAction] = useState(null);
  // true = action is a full cart clear (should also reset layaway conversion state)
  const [pendingLayawayAbortIsFullClear, setPendingLayawayAbortIsFullClear] = useState(false);
  // X-Report / Z-Report live data
  const [xReportData, setXReportData] = useState(null);
  const [xReportLoading, setXReportLoading] = useState(false);
  const [zReportData, setZReportData] = useState(null);
  const [zReportLoading, setZReportLoading] = useState(false);
  const [zReportDate, setZReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [showStartSessionDialog, setShowStartSessionDialog] = useState(false);
  const [showCloseSessionDialog, setShowCloseSessionDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCashDropDialog, setShowCashDropDialog] = useState(false);

  // Session opening/closing states
  const [openingCash, setOpeningCash] = useState('');
  const [denominations, setDenominations] = useState({
    '1000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, '0.50': 0, '0.25': 0
  });
  const [closingDenominations, setClosingDenominations] = useState({
    '1000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, '0.50': 0, '0.25': 0
  });
  const [closeSessionTab, setCloseSessionTab] = useState('cash');
  const [cardSettlementAmount, setCardSettlementAmount] = useState('');
  const [cardSettlementRef, setCardSettlementRef] = useState('');
  const [xReportVarianceRemarks, setXReportVarianceRemarks] = useState('');
  const [xReportCardBatchNo, setXReportCardBatchNo] = useState('');
  const [xReportCardVerified, setXReportCardVerified] = useState(false);
  const [xReportChecklist, setXReportChecklist] = useState({cashCount: false, varianceReviewed: false, cardSettlement: false, holdBills: false, supervisorApproval: false, sessionClosed: false});
  const [xReportCashierName, setXReportCashierName] = useState('Ahmad Al-Farsi');
  const [xReportSupervisorName, setXReportSupervisorName] = useState('');
  const [xReportClosingRemarks, setXReportClosingRemarks] = useState('');

  // Cart Focus Col 3 tab
  const [rightPanelTab, setRightPanelTab] = useState('functions');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryDriver, setDeliveryDriver] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  // Delivery modal
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryModalTab, setDeliveryModalTab] = useState('existing');
  const [deliveryCustomerId, setDeliveryCustomerId] = useState('');
  const [deliveryNewName, setDeliveryNewName] = useState('');
  const [deliveryNewMobile, setDeliveryNewMobile] = useState('');
  const [deliveryNewEmail, setDeliveryNewEmail] = useState('');
  // Delivery settle modal
  const [showDeliverySettleModal, setShowDeliverySettleModal] = useState(false);
  const [deliverySettleSearch, setDeliverySettleSearch] = useState('');
  const [deliverySettlePersonFilter, setDeliverySettlePersonFilter] = useState('All Persons');
  const [deliverySettleSelected, setDeliverySettleSelected] = useState(null);
  const [deliverySettlePayMode, setDeliverySettlePayMode] = useState('Cash');
  const [customerHistory, setCustomerHistory] = useState([]);
  const [customerHistoryLoading, setCustomerHistoryLoading] = useState(false);

  // Checkout pay mode
  const [checkoutPayMode, setCheckoutPayMode] = useState('cash');
  const [mixedCashAmount, setMixedCashAmount] = useState('');
  const [mixedCardAmount, setMixedCardAmount] = useState('');
  const [mixedCardType, setMixedCardType] = useState('');
  // Checkout keypad
  const [checkoutKeypadValue, setCheckoutKeypadValue] = useState('');
  const [checkoutKeypadMode, setCheckoutKeypadMode] = useState('numeric');
  const [checkoutKeypadTarget, setCheckoutKeypadTarget] = useState('tender');
  const [checkoutKeypadVisible, setCheckoutKeypadVisible] = useState(false);
  const [checkoutCardType, setCheckoutCardType] = useState('');
  const [checkoutCardRef, setCheckoutCardRef] = useState('');
  const [checkoutRemarks, setCheckoutRemarks] = useState('');
  const [checkoutCreditCustomerSearch, setCheckoutCreditCustomerSearch] = useState('');
  const [checkoutCreditCustomer, setCheckoutCreditCustomer] = useState(null);
  const [checkoutCreditDueDate, setCheckoutCreditDueDate] = useState('2026-06-28');
  const [checkoutCreditTerms, setCheckoutCreditTerms] = useState('30');
  // E-bill options (embedded in checkout)
  const [checkoutEbillPrint, setCheckoutEbillPrint] = useState(true);
  const [checkoutEbillSms, setCheckoutEbillSms] = useState(false);
  const [checkoutEbillWhatsapp, setCheckoutEbillWhatsapp] = useState(false);
  const [checkoutEbillEmail, setCheckoutEbillEmail] = useState(false);
  const [checkoutEbillPhone, setCheckoutEbillPhone] = useState('');
  const [checkoutEbillEmailAddr, setCheckoutEbillEmailAddr] = useState('');
  // Receipt sharing — 'payment' shows the checkout form, 'complete' shows the
  // payment-done screen in the SAME overlay (avoids simultaneous unmount+mount).
  const [checkoutPhase, setCheckoutPhase] = useState('payment'); // 'payment' | 'complete'
  const [receiptSharePhone, setReceiptSharePhone] = useState('');
  const [receiptShareEmail, setReceiptShareEmail] = useState('');
  const [lastPaidInvoice, setLastPaidInvoice] = useState(null);

  // Touch screen POS states
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentInvoice, setCurrentInvoice] = useState({
    items: [],
    subtotal: 0,
    totalDiscount: 0,
    tax: 0,
    total: 0,
    billDiscountAmount: 0,
  });
  const currentInvoiceRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [posProducts, setPosProducts] = useState([]);
  const [posProductPage, setPosProductPage] = useState(0);
  const [posProductTotalPages, setPosProductTotalPages] = useState(0);
  const [posProductTotalElements, setPosProductTotalElements] = useState(0);
  const [posProductsLoading, setPosProductsLoading] = useState(false);
  const [posProductsLoadingMore, setPosProductsLoadingMore] = useState(false);
  const [posProductsError, setPosProductsError] = useState('');
  const [posDepartments, setPosDepartments] = useState([]);
  const productCacheRef = useRef(new Map());
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [selectedCustomer, setSelectedCustomer] = useState(WALK_IN_CUSTOMER.id);
  const [posCustomers, setPosCustomers] = useState([]);
  const [posCustomersLoading, setPosCustomersLoading] = useState(false);
  const [posCustomersError, setPosCustomersError] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');

  // Enhanced payment states
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [selectedCardType, setSelectedCardType] = useState('');
  const [showCustomerSelector, setShowCustomerSelector] = useState(false);
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState('');

  // POS Config panel states
  const [showPOSConfig, setShowPOSConfig] = useState(false);
  const [hideCategoriesPanel, setHideCategoriesPanel] = useState(false);
  const [hideItemsPanel, setHideItemsPanel] = useState(false);
  const [posTemplate, setPosTemplate] = useState('classic');

  // Cart Focus mode: barcode scan + keypad panel
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeScanFeedback, setBarcodeScanFeedback] = useState(null);
  const barcodeInputRef = useRef(null);
  const [invoiceCounter, setInvoiceCounter] = useState(0);
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [posActionMode, setPosActionMode] = useState('none');
  // Classic layout inline numpad
  const [classicNumpadMode, setClassicNumpadMode] = useState('none');
  const [classicNumpadValue, setClassicNumpadValue] = useState('');
  const [classicDiscountType, setClassicDiscountType] = useState('percent');
  const [selectedFocusItemId, setSelectedFocusItemId] = useState(null);
  const [discountInputType, setDiscountInputType] = useState('percent');

  // Right-panel action dialogs
  const [showLockPOS, setShowLockPOS] = useState(false);
  const [lockPOSPin, setLockPOSPin] = useState('');
  const [posLocked, setPosLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [showCreditCardBalance, setShowCreditCardBalance] = useState(false);
  const [creditCardNumber, setCreditCardNumber] = useState('');
  const [creditCardResult, setCreditCardResult] = useState(null);
  const [showLastReceiptDialog, setShowLastReceiptDialog] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintSelectedInvoice, setReprintSelectedInvoice] = useState(null);
  const [reprintConfirmOpen, setReprintConfirmOpen] = useState(false);
  const [reprintFilterDateFrom, setReprintFilterDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reprintFilterDateTo, setReprintFilterDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [reprintFilterInvoiceNo, setReprintFilterInvoiceNo] = useState('');
  const [reprintFilterCustomer, setReprintFilterCustomer] = useState('');
  const [reprintFilterCashier, setReprintFilterCashier] = useState('');
  const [reprintFilterPayMode, setReprintFilterPayMode] = useState('All');
  const [reprintFilterStatus, setReprintFilterStatus] = useState('All');
  const [reprintInvoices, setReprintInvoices] = useState([]);
  const [reprintLoading, setReprintLoading] = useState(false);
  const [reprintError, setReprintError] = useState(null);
  const [reprintPrinting, setReprintPrinting] = useState(false);
  const [cashDropFeedback, setCashDropFeedback] = useState(null);
  const [showCouponsDialog, setShowCouponsDialog] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [showPromotionsDialog, setShowPromotionsDialog] = useState(false);
  const [showSaveOrderDialog, setShowSaveOrderDialog] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [savedOrders, setSavedOrders] = useState([]);
  const [showLayawaysDialog, setShowLayawaysDialog] = useState(false);
  const [layawayDeposit, setLayawayDeposit] = useState('');
  const [layawayCustomerNote, setLayawayCustomerNote] = useState('');
  // Price Check modal
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState('');
  const [priceCheckResult, setPriceCheckResult] = useState(null);
  // Credit Balance modal
  const [showCreditBalance, setShowCreditBalance] = useState(false);
  const [creditBalanceQuery, setCreditBalanceQuery] = useState('');
  const [creditBalanceResult, setCreditBalanceResult] = useState(null);
  // Layaways list modal
  const [showLayawaysList, setShowLayawaysList] = useState(false);
  const [layawaysFilterStatus, setLayawaysFilterStatus] = useState('All');
  const [layawaysFilterCustomer, setLayawaysFilterCustomer] = useState('');
  const [layawaysFilterNo, setLayawaysFilterNo] = useState('');
  const [selectedLayawayId, setSelectedLayawayId] = useState(null);
  const [layawaysList, setLayawaysList] = useState([]);
  const [layawaysLoading, setLayawaysLoading] = useState(false);
  const [layawaysError, setLayawaysError] = useState(null);
  const [selectedLayawayDetail, setSelectedLayawayDetail] = useState(null);
  const [layawayBusyId, setLayawayBusyId] = useState(null);
  // Conversion: when a layaway is loaded into the cart for settlement, remember
  // which layaway it came from (mark-converted after checkout) and the deposit
  // already collected (pre-credited against the balance to settle).
  const [activeLayawayId, setActiveLayawayId] = useState(null);
  const [activeLayawayDeposit, setActiveLayawayDeposit] = useState(0);
  // Save Layaway
  const [saveLayawayBusy, setSaveLayawayBusy] = useState(false);
  const [saveLayawayError, setSaveLayawayError] = useState(null);
  // Hold (persisted, session-scoped)
  const [heldSales, setHeldSales] = useState([]);
  const [holdBusy, setHoldBusy] = useState(false);
  // Save Layaway modal
  const [showSaveLayaway, setShowSaveLayaway] = useState(false);
  const [saveLayawayDepositReq, setSaveLayawayDepositReq] = useState(true);
  const [saveLayawayDeposit, setSaveLayawayDeposit] = useState('');
  const [saveLayawayPayMode, setSaveLayawayPayMode] = useState('Cash');
  const [saveLayawayDueDate, setSaveLayawayDueDate] = useState('2026-06-28');
  const [saveLayawayRemarks, setSaveLayawayRemarks] = useState('');
  const [saveLayawayReserveStock, setSaveLayawayReserveStock] = useState(true);
  const [saveLayawayPrintReceipt, setSaveLayawayPrintReceipt] = useState(true);
  const [saveLayawaySendSms, setSaveLayawaySendSms] = useState(false);
  // Serial / Batch Check modal
  const [showSerialBatch, setShowSerialBatch] = useState(false);
  const [serialBatchQuery, setSerialBatchQuery] = useState('');
  const [serialBatchResult, setSerialBatchResult] = useState(null);
  const [serialBatchSubView, setSerialBatchSubView] = useState('check');
  const [serialBatchReturnQty, setSerialBatchReturnQty] = useState(1);
  const [serialBatchReturnReason, setSerialBatchReturnReason] = useState('');
  const [serialBatchReturnCondition, setSerialBatchReturnCondition] = useState('');
  const [serialBatchRefundMethod, setSerialBatchRefundMethod] = useState('Cash Back');
  const [serialBatchInvoiceNo, setSerialBatchInvoiceNo] = useState('');
  const [serialBatchItemCode, setSerialBatchItemCode] = useState('');
  const [serialBatchCustomerMobile, setSerialBatchCustomerMobile] = useState('');
  const [serialBatchSelectedItem, setSerialBatchSelectedItem] = useState(null);
  // Service & Repair view
  const [showServiceRepair, setShowServiceRepair] = useState(false);
  const [serviceView, setServiceView] = useState('list');
  const [serviceJobStep, setServiceJobStep] = useState(1);
  const [serviceDetailTab, setServiceDetailTab] = useState('overview');
  const [serviceJobFilter, setServiceJobFilter] = useState({ status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' });
  // Return / Sales Return modal
  const [showReturn, setShowReturn] = useState(false);
  const [returnStep, setReturnStep] = useState(1);
  const [returnInvoiceQuery, setReturnInvoiceQuery] = useState('');
  const [returnCustomerMobile, setReturnCustomerMobile] = useState('');
  const [returnDateFrom, setReturnDateFrom] = useState('');
  const [returnInvoiceFound, setReturnInvoiceFound] = useState(null);
  const [returnInvoiceLoading, setReturnInvoiceLoading] = useState(false);
  const [returnInvoiceError, setReturnInvoiceError] = useState('');
  const [returnableItems, setReturnableItems] = useState([]);
  const [returnItemsLoading, setReturnItemsLoading] = useState(false);
  const [returnSelectedItems, setReturnSelectedItems] = useState({});
  const [returnReasons, setReturnReasons] = useState({});
  const [returnItemConditions, setReturnItemConditions] = useState({});
  const [returnRefundMethod, setReturnRefundMethod] = useState('Cash Back');
  const [returnVoucherExpiry, setReturnVoucherExpiry] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 2);
    return d.toISOString().split('T')[0];
  });
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnSavedId, setReturnSavedId] = useState(null);
  const [showAddShippingDialog, setShowAddShippingDialog] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [shippingCost, setShippingCost] = useState('15');
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');


  // Configure: which right-panel buttons are visible
  // BillBull Console
  const [consoleTab, setConsoleTab] = useState('layout');
  const [templateSubTab, setTemplateSubTab] = useState('receipt');
  const [terminalList, setTerminalList] = useState([]);
  const [terminalsLoading, setTerminalsLoading] = useState(false);
  const [editingTerminalId, setEditingTerminalId] = useState(null);
  const [editTerminalName, setEditTerminalName] = useState('');
  const [editCounterName, setEditCounterName] = useState('');
  const [terminalSaving, setTerminalSaving] = useState(false);
  const [consoleDevices, setConsoleDevices] = useState([
    { id: 'd1', type: 'Receipt Printer', name: 'Epson TM-T82III',        port: 'USB',          status: 'Online' },
    { id: 'd2', type: 'Barcode Scanner', name: 'Honeywell Voyager 1202g', port: 'USB',          status: 'Online' },
    { id: 'd3', type: 'Cash Drawer',     name: 'APG Vasario 1616',        port: 'Kick-out',     status: 'Online' },
    { id: 'd4', type: 'Card Terminal',   name: 'Ingenico Move 5000',      port: 'Bluetooth',    status: 'Offline' },
  ]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevType, setNewDevType] = useState('Receipt Printer');
  const [newDevName, setNewDevName] = useState('');
  const [newDevPort, setNewDevPort] = useState('USB');
  const [newDevIp, setNewDevIp] = useState('');
  const [tplReceiptHeader, setTplReceiptHeader] = useState('Thank you for shopping with us!');
  const [tplReceiptFooter, setTplReceiptFooter] = useState('Returns accepted within 7 days with receipt.');
  const [tplReceiptPaper, setTplReceiptPaper] = useState('80mm');
  const [tplReceiptShowLogo, setTplReceiptShowLogo] = useState(true);
  const [tplReceiptShowTrn, setTplReceiptShowTrn] = useState(true);
  const [tplReceiptShowBarcode, setTplReceiptShowBarcode] = useState(true);
  const [tplInvoiceHeader, setTplInvoiceHeader] = useState('TAX INVOICE');
  const [tplInvoiceFooter, setTplInvoiceFooter] = useState('All prices inclusive of VAT at 5%.');
  const [tplInvoicePaper, setTplInvoicePaper] = useState('A4');
  const [tplReturnHeader, setTplReturnHeader] = useState('SALES RETURN / CREDIT NOTE');
  const [tplReturnFooter, setTplReturnFooter] = useState('Refund processed within 3–5 business days.');
  const [tplReturnPaper, setTplReturnPaper] = useState('A4');
  const [tplJobCardFooter, setTplJobCardFooter] = useState('We are not responsible for data loss during repair.');
  const [tplJobCardPaper, setTplJobCardPaper] = useState('A4');
  const [tplOutletName, setTplOutletName] = useState('BillBull Trading LLC');
  const [tplOutletTrn, setTplOutletTrn] = useState('100123456700003');
  const [tplOutletAddress, setTplOutletAddress] = useState('Shop 12, Dubai Mall, Downtown Dubai');
  const [tplOutletPhone, setTplOutletPhone] = useState('+971 4 123 4567');
  const [tplLogoDataUrl, setTplLogoDataUrl] = useState(null);
  const [tplStampDataUrl, setTplStampDataUrl] = useState(null);
  const [tplReceiptShowStamp, setTplReceiptShowStamp] = useState(false);
  const [tplInvoiceShowLogo, setTplInvoiceShowLogo] = useState(true);
  const [tplInvoiceShowCompanyDetails, setTplInvoiceShowCompanyDetails] = useState(true);
  const [tplInvoiceShowTrn, setTplInvoiceShowTrn] = useState(true);
  const [tplInvoiceShowCustomerDetails, setTplInvoiceShowCustomerDetails] = useState(true);
  const [tplInvoiceShowTerms, setTplInvoiceShowTerms] = useState(true);
  const [tplInvoiceShowNotes, setTplInvoiceShowNotes] = useState(true);
  const [tplInvoiceShowBankDetails, setTplInvoiceShowBankDetails] = useState(false);
  const [tplInvoiceShowQRCode, setTplInvoiceShowQRCode] = useState(false);
  const [tplInvoiceShowStamp, setTplInvoiceShowStamp] = useState(false);
  const [tplInvoiceShowSignature, setTplInvoiceShowSignature] = useState(false);
  const [tplInvoiceShowGrandTotalBanner, setTplInvoiceShowGrandTotalBanner] = useState(true);
  const [tplInvoiceColItemCode, setTplInvoiceColItemCode] = useState(true);
  const [tplInvoiceColItemImage, setTplInvoiceColItemImage] = useState(false);
  const [tplInvoiceColBarcode, setTplInvoiceColBarcode] = useState(false);
  const [tplInvoiceColBatchNo, setTplInvoiceColBatchNo] = useState(true);
  const [tplInvoiceColDiscount, setTplInvoiceColDiscount] = useState(true);
  const [tplInvoiceColVatPct, setTplInvoiceColVatPct] = useState(true);
  const [tplInvoiceColVatAmt, setTplInvoiceColVatAmt] = useState(true);
  // Receipt A4 extras
  const [tplReceiptShowCompanyDetails, setTplReceiptShowCompanyDetails] = useState(true);
  const [tplReceiptShowCustomerDetails, setTplReceiptShowCustomerDetails] = useState(true);
  const [tplReceiptColItemCode, setTplReceiptColItemCode] = useState(true);
  const [tplReceiptColItemImage, setTplReceiptColItemImage] = useState(false);
  const [tplReceiptColBatchNo, setTplReceiptColBatchNo] = useState(true);
  const [tplReceiptColDiscount, setTplReceiptColDiscount] = useState(true);
  const [tplReceiptColVatPct, setTplReceiptColVatPct] = useState(true);
  const [tplReceiptColVatAmt, setTplReceiptColVatAmt] = useState(true);
  const [tplReceiptShowGrandTotalBanner, setTplReceiptShowGrandTotalBanner] = useState(true);
  const [tplReceiptShowTerms, setTplReceiptShowTerms] = useState(true);
  const [tplReceiptShowNotes, setTplReceiptShowNotes] = useState(false);
  const [tplReceiptShowBankDetails, setTplReceiptShowBankDetails] = useState(false);
  const [tplReceiptShowQRCode, setTplReceiptShowQRCode] = useState(false);
  const [tplReceiptShowSignature, setTplReceiptShowSignature] = useState(false);
  // Return A4 extras
  const [tplReturnShowLogo, setTplReturnShowLogo] = useState(true);
  const [tplReturnShowTrn, setTplReturnShowTrn] = useState(true);
  const [tplReturnShowStamp, setTplReturnShowStamp] = useState(false);
  const [tplReturnShowCompanyDetails, setTplReturnShowCompanyDetails] = useState(true);
  const [tplReturnShowCustomerDetails, setTplReturnShowCustomerDetails] = useState(true);
  const [tplReturnColItemCode, setTplReturnColItemCode] = useState(true);
  const [tplReturnColBatchNo, setTplReturnColBatchNo] = useState(true);
  const [tplReturnColDiscount, setTplReturnColDiscount] = useState(true);
  const [tplReturnColVatPct, setTplReturnColVatPct] = useState(true);
  const [tplReturnColVatAmt, setTplReturnColVatAmt] = useState(true);
  const [tplReturnShowGrandTotalBanner, setTplReturnShowGrandTotalBanner] = useState(true);
  const [tplReturnShowTerms, setTplReturnShowTerms] = useState(true);
  const [tplReturnShowNotes, setTplReturnShowNotes] = useState(false);
  const [tplReturnShowQRCode, setTplReturnShowQRCode] = useState(false);
  const [tplReturnShowSignature, setTplReturnShowSignature] = useState(false);
  // Job Card A4 extras
  const [tplJobCardShowLogo, setTplJobCardShowLogo] = useState(true);
  const [tplJobCardShowTrn, setTplJobCardShowTrn] = useState(true);
  const [tplJobCardShowStamp, setTplJobCardShowStamp] = useState(false);
  const [tplJobCardShowCompanyDetails, setTplJobCardShowCompanyDetails] = useState(true);
  const [tplJobCardShowCustomerDetails, setTplJobCardShowCustomerDetails] = useState(true);
  const [tplJobCardShowSerialNumber, setTplJobCardShowSerialNumber] = useState(true);
  const [tplJobCardShowWarranty, setTplJobCardShowWarranty] = useState(true);
  const [tplJobCardShowTechnician, setTplJobCardShowTechnician] = useState(true);
  const [tplJobCardShowExpectedDate, setTplJobCardShowExpectedDate] = useState(true);
  const [tplJobCardShowCustomerSignature, setTplJobCardShowCustomerSignature] = useState(true);
  const [tplJobCardShowTerms, setTplJobCardShowTerms] = useState(true);

  const [hiddenPanelButtons, setHiddenPanelButtons] = useState(new Set());
  const togglePanelButton = (id) => setHiddenPanelButtons(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });


  // Rich customer selector states
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Cash drop/out states
  const [cashDropType, setCashDropType] = useState('in');
  const [cashDropAmount, setCashDropAmount] = useState('');
  const [cashDropDescription, setCashDropDescription] = useState('');


  const productCategories = useMemo(() => ([
    {
      id: 'all',
      name: 'All Items',
      icon: Package,
      departmentId: null,
      count: selectedCategory === 'all' ? posProductTotalElements : null
    },
    ...posDepartments.map((department, index) => ({
      id: String(department.id),
      name: department.name || department.departmentName || `Department ${index + 1}`,
      icon: CATEGORY_ICONS[index % CATEGORY_ICONS.length],
      departmentId: department.id,
      count: selectedCategory === String(department.id) ? posProductTotalElements : null
    }))
  ]), [posDepartments, posProductTotalElements, selectedCategory]);

  const customerOptions = useMemo(() => [WALK_IN_CUSTOMER, ...posCustomers], [posCustomers]);

  const selectedCustomerData = useMemo(
    () => customerOptions.find(c => c.id === selectedCustomer) || WALK_IN_CUSTOMER,
    [customerOptions, selectedCustomer]
  );

  useEffect(() => {
    const code = selectedCustomerData?.code;
    if (!code || selectedCustomerData?.id === WALK_IN_CUSTOMER.id) {
      setCustomerHistory([]);
      return;
    }
    let cancelled = false;
    setCustomerHistoryLoading(true);
    getPosCustomerHistory(code)
      .then(data => { if (!cancelled) setCustomerHistory(data || []); })
      .catch(() => { if (!cancelled) setCustomerHistory([]); })
      .finally(() => { if (!cancelled) setCustomerHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCustomerData?.code]);

  const filteredCustomerOptions = useMemo(() => {
    const query = customerSearchQuery.trim().toLowerCase();
    const list = query
      ? customerOptions.filter(c =>
          [c.name, c.code, c.membershipId, c.phone]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(query))
        )
      : customerOptions;
    return list.slice(0, 30);
  }, [customerOptions, customerSearchQuery]);

  const checkoutCreditCustomerOptions = useMemo(() => {
    const query = checkoutCreditCustomerSearch.trim().toLowerCase();
    const list = customerOptions.filter(c => c.id !== WALK_IN_CUSTOMER.id);
    if (!query) return list.slice(0, 30);
    return list.filter(c =>
      [c.name, c.code, c.membershipId, c.phone]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    ).slice(0, 30);
  }, [checkoutCreditCustomerSearch, customerOptions]);

  const creditCustomerData = useMemo(
    () => customerOptions.find(c => c.id === checkoutCreditCustomer) || null,
    [checkoutCreditCustomer, customerOptions]
  );

  useEffect(() => { currentInvoiceRef.current = currentInvoice; }, [currentInvoice]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setPosCustomersLoading(true);
    setPosCustomersError('');
    getAllCustomers()
      .then(data => {
        if (cancelled) return;
        const mapped = Array.isArray(data)
          ? data.map(mapPosCustomer).filter(c => c.id && c.id !== WALK_IN_CUSTOMER.id)
          : [];
        setPosCustomers(mapped);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load POS customers', error);
        setPosCustomers([]);
        setPosCustomersError('Customers could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setPosCustomersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDepartments()
      .then(data => {
        if (!cancelled) setPosDepartments(Array.isArray(data) ? data : []);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load POS departments', error);
        setPosDepartments([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── POS initialization: load settings + register terminal + resume session ──
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        // Load POS settings
        const settings = await getPosSettings().catch(() => null);
        if (!cancelled && settings) {
          setPosSettings(settings);
          // Seed layout state from persisted settings
          if (settings.defaultLayout) setPosTemplate(settings.defaultLayout);
          if (settings.layoutHideCategoryPanel != null) setHideCategoriesPanel(settings.layoutHideCategoryPanel);
          if (settings.layoutHideItemsPanel != null) setHideItemsPanel(settings.layoutHideItemsPanel);
          if (settings.layoutHiddenPanelButtons) {
            setHiddenPanelButtons(new Set(settings.layoutHiddenPanelButtons.split(',').filter(Boolean)));
          }
          // Seed print template state from persisted JSON blob
          if (settings.printTemplateConfig) {
            try {
              const tpl = JSON.parse(settings.printTemplateConfig);
              if (tpl.outletName != null) setTplOutletName(tpl.outletName);
              if (tpl.outletTrn != null) setTplOutletTrn(tpl.outletTrn);
              if (tpl.outletAddress != null) setTplOutletAddress(tpl.outletAddress);
              if (tpl.outletPhone != null) setTplOutletPhone(tpl.outletPhone);
              if (tpl.logoDataUrl != null) setTplLogoDataUrl(tpl.logoDataUrl);
              if (tpl.stampDataUrl != null) setTplStampDataUrl(tpl.stampDataUrl);
              if (tpl.receiptHeader != null) setTplReceiptHeader(tpl.receiptHeader);
              if (tpl.receiptFooter != null) setTplReceiptFooter(tpl.receiptFooter);
              if (tpl.receiptPaper != null) setTplReceiptPaper(tpl.receiptPaper);
              if (tpl.receiptShowLogo != null) setTplReceiptShowLogo(tpl.receiptShowLogo);
              if (tpl.receiptShowTrn != null) setTplReceiptShowTrn(tpl.receiptShowTrn);
              if (tpl.receiptShowStamp != null) setTplReceiptShowStamp(tpl.receiptShowStamp);
              if (tpl.receiptShowBarcode != null) setTplReceiptShowBarcode(tpl.receiptShowBarcode);
              if (tpl.invoiceHeader != null) setTplInvoiceHeader(tpl.invoiceHeader);
              if (tpl.invoiceFooter != null) setTplInvoiceFooter(tpl.invoiceFooter);
              if (tpl.invoicePaper != null) setTplInvoicePaper(tpl.invoicePaper);
              if (tpl.invoiceShowLogo != null) setTplInvoiceShowLogo(tpl.invoiceShowLogo);
              if (tpl.invoiceShowCompanyDetails != null) setTplInvoiceShowCompanyDetails(tpl.invoiceShowCompanyDetails);
              if (tpl.invoiceShowTrn != null) setTplInvoiceShowTrn(tpl.invoiceShowTrn);
              if (tpl.invoiceShowCustomerDetails != null) setTplInvoiceShowCustomerDetails(tpl.invoiceShowCustomerDetails);
              if (tpl.invoiceShowStamp != null) setTplInvoiceShowStamp(tpl.invoiceShowStamp);
              if (tpl.invoiceShowSignature != null) setTplInvoiceShowSignature(tpl.invoiceShowSignature);
              if (tpl.invoiceShowGrandTotalBanner != null) setTplInvoiceShowGrandTotalBanner(tpl.invoiceShowGrandTotalBanner);
              if (tpl.invoiceShowTerms != null) setTplInvoiceShowTerms(tpl.invoiceShowTerms);
              if (tpl.invoiceShowNotes != null) setTplInvoiceShowNotes(tpl.invoiceShowNotes);
              if (tpl.invoiceShowBankDetails != null) setTplInvoiceShowBankDetails(tpl.invoiceShowBankDetails);
              if (tpl.invoiceShowQRCode != null) setTplInvoiceShowQRCode(tpl.invoiceShowQRCode);
              if (tpl.invoiceColItemCode != null) setTplInvoiceColItemCode(tpl.invoiceColItemCode);
              if (tpl.invoiceColItemImage != null) setTplInvoiceColItemImage(tpl.invoiceColItemImage);
              if (tpl.invoiceColBarcode != null) setTplInvoiceColBarcode(tpl.invoiceColBarcode);
              if (tpl.invoiceColBatchNo != null) setTplInvoiceColBatchNo(tpl.invoiceColBatchNo);
              if (tpl.invoiceColDiscount != null) setTplInvoiceColDiscount(tpl.invoiceColDiscount);
              if (tpl.invoiceColVatPct != null) setTplInvoiceColVatPct(tpl.invoiceColVatPct);
              if (tpl.invoiceColVatAmt != null) setTplInvoiceColVatAmt(tpl.invoiceColVatAmt);
              if (tpl.returnHeader != null) setTplReturnHeader(tpl.returnHeader);
              if (tpl.returnFooter != null) setTplReturnFooter(tpl.returnFooter);
              if (tpl.returnPaper != null) setTplReturnPaper(tpl.returnPaper);
              if (tpl.returnShowLogo != null) setTplReturnShowLogo(tpl.returnShowLogo);
              if (tpl.returnShowTrn != null) setTplReturnShowTrn(tpl.returnShowTrn);
              if (tpl.returnShowStamp != null) setTplReturnShowStamp(tpl.returnShowStamp);
              if (tpl.jobCardFooter != null) setTplJobCardFooter(tpl.jobCardFooter);
              if (tpl.jobCardPaper != null) setTplJobCardPaper(tpl.jobCardPaper);
              if (tpl.jobCardShowLogo != null) setTplJobCardShowLogo(tpl.jobCardShowLogo);
              if (tpl.jobCardShowTrn != null) setTplJobCardShowTrn(tpl.jobCardShowTrn);
              if (tpl.jobCardShowStamp != null) setTplJobCardShowStamp(tpl.jobCardShowStamp);
            } catch (e) { /* stale/malformed config — fall through to defaults */ }
          }
        }

        // Generate device fingerprint (browser-based, stable across refreshes)
        const nav = window.navigator;
        const fp = btoa([nav.userAgent, screen.width, screen.height, screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|')).slice(0, 64);
        const deviceInfo = `${nav.userAgent.split('(')[1]?.split(')')[0] || 'Unknown'} – ${screen.width}×${screen.height}`;

        const regResult = await registerPosTerminal({ deviceFingerprint: fp, deviceInfo }).catch(() => null);
        if (!cancelled && regResult?.terminal) {
          setCurrentTerminal(regResult.terminal);

          // Try to resume an existing open session for this terminal
          const termId = regResult.terminal.terminalId;
          const active = await getActivePosSession(termId).catch(() => null);
          if (!cancelled && active?.id) {
            setCurrentSession(active);
          }
        }
      } catch (e) {
        console.warn('POS init error', e);
      } finally {
        if (!cancelled) setPosInitLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Auto-load report data when entering report views
  useEffect(() => {
    if (currentView === 'x-report') loadXReport();
    if (currentView === 'z-report') loadZReport(zReportDate);
    // Refresh dashboard stats whenever returning to dashboard with an active session
    if (currentView === 'dashboard' && (currentSession?.status === 'active' || currentSession?.status === 'OPEN')) {
      loadXReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Auto-load terminals when console Terminals tab is active and terminal becomes available
  useEffect(() => {
    if (currentView === 'console' && consoleTab === 'terminals' && currentTerminal?.branchId && terminalList.length === 0 && !terminalsLoading) {
      const branchId = currentTerminal.branchId;
      setTerminalsLoading(true);
      getAllPosTerminals(branchId)
        .then(data => setTerminalList(Array.isArray(data) ? data : []))
        .catch(e => console.warn('Failed to load terminals', e))
        .finally(() => setTerminalsLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, consoleTab, currentTerminal]);

  const loadPosProducts = useCallback(async (page = 0, append = false, signal = undefined) => {
    // While the user is searching/scanning, ignore the selected category so a
    // product from any category can be found (e.g. browsing "Electronics" but
    // searching for a "Groceries" item). The category filter only constrains
    // plain browsing with no active search term.
    const hasSearch = Boolean(debouncedSearchQuery);
    const departmentId = (hasSearch || selectedCategory === 'all') ? null : Number(selectedCategory);
    if (append) {
      setPosProductsLoadingMore(true);
    } else {
      setPosProductsLoading(true);
      setPosProductsError('');
      setPosProducts([]);
    }

    try {
      const data = await getProductsList(
        page,
        POS_PRODUCT_PAGE_SIZE,
        debouncedSearchQuery,
        signal,
        null,
        Number.isFinite(departmentId) ? departmentId : null,
        null
      );
      const mapped = Array.isArray(data?.content)
        ? data.content.map(mapPosProductListItem)
        : [];

      mapped.forEach(product => cachePosProduct(productCacheRef.current, product));

      // If the text search returned nothing but the user is searching for something
      // (likely a batch/serial/barcode), fall back to the resolve endpoint so the
      // product still appears in the grid rather than showing "No items found".
      if (mapped.length === 0 && !append && debouncedSearchQuery) {
        try {
          const resolved = await resolvePosEntry(debouncedSearchQuery);
          if (signal?.aborted) return; // search changed while resolving
          if (resolved?.type === 'PRODUCT' && resolved.product) {
            const resolvedProduct = mapPosProductAggregateItem(resolved.product, debouncedSearchQuery);
            // Carry the pinned batch so the product card click can use it.
            if (resolved.pinnedBatchNumber) resolvedProduct._pinnedBatch = resolved.pinnedBatchNumber;
            cachePosProduct(productCacheRef.current, resolvedProduct);
            setPosProducts([resolvedProduct]);
            setPosProductPage(0);
            setPosProductTotalPages(1);
            setPosProductTotalElements(1);
            return;
          }
        } catch {
          // silent — keep empty grid
        }
      }

      setPosProducts(prev => append ? [...prev, ...mapped] : mapped);
      setPosProductPage(data?.page ?? page);
      setPosProductTotalPages(data?.totalPages ?? 0);
      setPosProductTotalElements(data?.totalElements ?? mapped.length);
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      console.error('Failed to load POS products', error);
      if (!append) setPosProducts([]);
      setPosProductsError('Products could not be loaded.');
    } finally {
      if (append) {
        setPosProductsLoadingMore(false);
      } else {
        setPosProductsLoading(false);
      }
    }
  }, [debouncedSearchQuery, selectedCategory]);

  useEffect(() => {
    const controller = new AbortController();
    loadPosProducts(0, false, controller.signal);
    return () => controller.abort();
  }, [loadPosProducts]);

  const loadMorePosProducts = () => {
    if (posProductsLoading || posProductsLoadingMore || posProductPage + 1 >= posProductTotalPages) return;
    loadPosProducts(posProductPage + 1, true);
  };

  const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;
  const formatCurrencyStr = (amount) => `AED ${Number(amount || 0).toFixed(2)}`;

  const calculateDenominationTotal = (denom) => {
    return Object.entries(denom).reduce((total, [note, count]) => {
      return total + (parseFloat(note) * count);
    }, 0);
  };

  const handleStartSession = async () => {
    const total = calculateDenominationTotal(denominations);
    try {
      const terminalId = currentTerminal?.terminalId || `T001-${Date.now()}`;
      const counterName = currentTerminal?.counterName || 'Main Counter';
      const session = await openPosSession({ terminalId, counterName, openingCash: total });
      setCurrentSession(session);
    } catch (err) {
      // Fallback to in-memory session if backend unavailable
      console.warn('Session API unavailable, falling back to local session', err);
      setCurrentSession({
        id: `SES-${Date.now()}`,
        openingCash: total,
        openingDenominations: { ...denominations },
        openedAt: new Date().toISOString(),
        status: 'OPEN'
      });
    }
    setShowStartSessionDialog(false);
    setCurrentView('touch-screen');
  };

  const handleCloseSession = async () => {
    if (currentSession) {
      try {
        if (currentSession.id && typeof currentSession.id === 'number') {
          const closingTotal = calculateDenominationTotal(closingDenominations);
          const closed = await closePosSession(currentSession.id, { closingCash: closingTotal });
          setCurrentSession(closed);
        } else {
          setCurrentSession({ ...currentSession, status: 'CLOSED' });
        }
      } catch (err) {
        console.warn('Close session API error', err);
        setCurrentSession({ ...currentSession, status: 'CLOSED' });
      }
      setShowCloseSessionDialog(false);
      setCurrentView('x-report');
    }
  };

  const addToInvoice = (product, quantity = 1, pinnedBatchNumber = null) => {
    const qtyToAdd = Math.max(1, Number(quantity) || 1);
    const unitPrice = toNumber(product.price, 0);
    setCurrentInvoice(prev => {
      // A pinned-batch line represents one specific scanned unit, so it always
      // gets its own cart row (with a composite id) and never stacks onto an
      // existing line. Non-pinned lines still merge by product id as before.
      const existingItem = pinnedBatchNumber
        ? null
        : prev.items.find(item => item.id === product.id);
      let newItems;

      if (existingItem) {
        newItems = prev.items.map(item =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + qtyToAdd,
                total: (item.quantity + qtyToAdd) * item.price * (1 - item.discount / 100)
              }
            : item
        );
      } else {
        // Add new item to the TOP of the list. Pinned lines use a composite id
        // so every existing item.id-keyed cart op (qty/discount/remove/void/
        // React key) keeps targeting exactly one row. productId carries the real
        // product id; the checkout payload reads item.code for the item code.
        newItems = [{
          id: pinnedBatchNumber ? `${product.id}::${pinnedBatchNumber}` : product.id,
          productId: product.id,
          name: product.name,
          nameAr: product.nameAr || '',
          barcode: product.barcode || product.code || product.id,
          code: product.code || '',
          image: product.image || null,
          price: unitPrice,
          quantity: qtyToAdd,
          discount: toNumber(product.defaultDiscount, 0),
          taxRate: toNumber(product.salesTax, 5),
          total: unitPrice * qtyToAdd * (1 - toNumber(product.defaultDiscount, 0) / 100),
          pinnedBatchNumber: pinnedBatchNumber || null,
        }, ...prev.items];
      }

      return recalculateInvoice(newItems);
    });
  };

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromInvoice(itemId);
      return;
    }
    
    setCurrentInvoice(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId 
          ? { 
              ...item, 
              quantity: newQuantity,
              total: newQuantity * item.price * (1 - item.discount / 100)
            }
          : item
      );
      return recalculateInvoice(newItems);
    });
  };

  const updateDiscount = (itemId, discount) => {
    setCurrentInvoice(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId 
          ? { 
              ...item, 
              discount,
              total: item.quantity * item.price * (1 - discount / 100)
            }
          : item
      );
      return recalculateInvoice(newItems);
    });
  };

  const updateItemPrice = (itemId, newPrice) => {
    if (newPrice <= 0) return;
    setCurrentInvoice(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId
          ? { ...item, price: newPrice, total: item.quantity * newPrice * (1 - item.discount / 100) }
          : item
      );
      return recalculateInvoice(newItems);
    });
  };

  const removeFromInvoice = (itemId) => {
    setCurrentInvoice(prev => {
      const newItems = prev.items.filter(item => item.id !== itemId);
      return recalculateInvoice(newItems);
    });
  };

  const voidFromInvoice = (itemId) => {
    // If item is already voided, un-void it (toggle back) without PIN
    const item = currentInvoice.items.find(i => i.id === itemId);
    if (item?.isVoided) {
      setCurrentInvoice(prev => {
        const newItems = prev.items.map(i => i.id === itemId ? { ...i, isVoided: false } : i);
        return recalculateInvoice(newItems);
      });
      return;
    }
    // If supervisor approval required (globally), show PIN dialog.
    // During a layaway conversion this also guards the layaway abort flow.
    if (posSettings?.requireSupervisorForVoid) {
      if (activeLayawayId) {
        requireLayawayApproval(() => applyVoid(itemId), false);
        return;
      }
      setPendingVoidItemId(itemId);
      setSupervisorPinValue('');
      setSupervisorPinError('');
      setShowSupervisorPin(true);
      return;
    }
    applyVoid(itemId);
  };

  const applyVoid = (itemId) => {
    // DELETE mode physically removes the line; VOID mode (default) keeps it
    // marked so it stays visible on the receipt / audit log / reports.
    if (posSettings?.voidMode === 'DELETE') {
      removeFromInvoice(itemId);
      return;
    }
    setCurrentInvoice(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId ? { ...item, isVoided: true } : item
      );
      return recalculateInvoice(newItems);
    });
  };

  // Supervisor approval mode: PIN (numeric keypad) or PASSWORD (manager login).
  const supervisorApprovalMode = posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN';

  const handleSupervisorPinSubmit = async () => {
    // ARCHFIX S5: the PIN is verified server-side (BCrypt) — it is no longer shipped to the client.
    let valid = false;
    try {
      valid = supervisorPinValue ? await verifyPosSupervisorPin(supervisorPinValue) : false;
    } catch {
      setSupervisorPinError('Could not verify approval. Please try again.');
      return;
    }
    if (valid) {
      setShowSupervisorPin(false);
      if (pendingVoidItemId) {
        applyVoid(pendingVoidItemId);
        setPendingVoidItemId(null);
      }
      if (pendingLayawayAbortAction) {
        const action = pendingLayawayAbortAction;
        const isFullClear = pendingLayawayAbortIsFullClear;
        setPendingLayawayAbortAction(null);
        setPendingLayawayAbortIsFullClear(false);
        action();
        // Full clear aborts the conversion; void/remove keeps layaway active.
        if (isFullClear) {
          setActiveLayawayId(null);
          setActiveLayawayDeposit(0);
        }
      }
      setSupervisorPinValue('');
      setSupervisorPinError('');
    } else {
      setSupervisorPinError(
        supervisorApprovalMode === 'PASSWORD'
          ? 'Incorrect password. Please try again.'
          : 'Incorrect PIN. Please try again.'
      );
    }
  };

  // Gate Clear / Remove / Void actions behind supervisor approval when a layaway
  // conversion is in progress, so reserved items can't be silently dumped.
  const requireLayawayApproval = (action, isFullClear = false) => {
    setPendingLayawayAbortAction(() => action);
    setPendingLayawayAbortIsFullClear(isFullClear);
    setSupervisorPinValue('');
    setSupervisorPinError('');
    setShowSupervisorPin(true);
  };

  const guardedClearInvoice = () => {
    if (activeLayawayId && posSettings?.requireSupervisorForVoid) {
      requireLayawayApproval(clearInvoice, true);
      return;
    }
    if (activeLayawayId) {
      // No supervisor PIN required, but still need to reset the layaway state.
      setActiveLayawayId(null);
      setActiveLayawayDeposit(0);
    }
    clearInvoice();
  };

  const guardedRemoveFromInvoice = (itemId) => {
    if (activeLayawayId && posSettings?.requireSupervisorForVoid) {
      requireLayawayApproval(() => removeFromInvoice(itemId), false);
      return;
    }
    removeFromInvoice(itemId);
  };

  // ── Behavior settings (Console → Behavior tab) ─────────────────────────────
  const beginEditSettings = () => {
    setSettingsDraft({
      requireSupervisorForVoid: !!posSettings?.requireSupervisorForVoid,
      supervisorApprovalMode: posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN',
      supervisorPin: posSettings?.supervisorPin || '',
      voidMode: posSettings?.voidMode === 'DELETE' ? 'DELETE' : 'VOID',
      cartViewMode: posSettings?.cartViewMode === 'DETAILED' ? 'DETAILED' : 'MINIMAL',
      cartShowBarcode: posSettings?.cartShowBarcode !== false,
      cartShowProductCode: posSettings?.cartShowProductCode !== false,
      cartShowBatchNumber: posSettings?.cartShowBatchNumber !== false,
      cartShowSerialNumber: !!posSettings?.cartShowSerialNumber,
      cartShowExpiryDate: !!posSettings?.cartShowExpiryDate,
      cashDrawerTriggers: posSettings?.cashDrawerTriggers ?? 'CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN',
    });
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    try {
      const payload = { ...(posSettings || {}), ...settingsDraft };
      const saved = await savePosSettings(payload);
      setPosSettings(saved || payload);
      setSettingsDraft(null);
      setSettingsSavedFlash(true);
      setTimeout(() => setSettingsSavedFlash(false), 2000);
    } catch (err) {
      console.warn('Failed to save POS settings', err);
      // Keep optimistic local copy so the cashier UI still honors the change.
      setPosSettings(prev => ({ ...(prev || {}), ...settingsDraft }));
      setSettingsDraft(null);
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadXReport = async () => {
    if (!currentSession?.id || typeof currentSession.id !== 'number') return;
    setXReportLoading(true);
    try {
      const data = await getPosXReport(currentSession.id);
      setXReportData(data);
    } catch (err) {
      console.warn('X-Report load failed', err);
    } finally {
      setXReportLoading(false);
    }
  };

  const loadZReport = async (date) => {
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    if (!branchId) return;
    setZReportLoading(true);
    try {
      const data = await getPosZReport(branchId, date || zReportDate);
      setZReportData(data);
    } catch (err) {
      console.warn('Z-Report load failed', err);
    } finally {
      setZReportLoading(false);
    }
  };

  const recalculateInvoice = (items, billDiscountAmount = 0) => {
    const activeItems = items.filter(i => !i.isVoided);
    const subtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalDiscount = activeItems.reduce((sum, item) => sum + (item.price * item.quantity * item.discount / 100), 0);
    // Per-line tax using each item's own rate (falls back to 5 if not set).
    const tax = activeItems.reduce((sum, item) => {
      const net = item.price * item.quantity * (1 - item.discount / 100);
      return sum + net * (toNumber(item.taxRate, 5) / 100);
    }, 0);
    const total = Math.max(0, subtotal - totalDiscount - billDiscountAmount + tax);

    return { items, subtotal, totalDiscount, tax, total, billDiscountAmount };
  };

  const clearInvoice = () => {
    setCurrentInvoice({
      items: [],
      subtotal: 0,
      totalDiscount: 0,
      tax: 0,
      total: 0,
      billDiscountAmount: 0,
    });
  };

  // Map live cart lines to the backend item shape shared by checkout + layaway.
  // (Voided lines are dropped — a layaway only reserves what's actually being sold.)
  const cartItemsToPayload = useCallback((items) => {
    const isDeleteMode = posSettings?.voidMode === 'DELETE';
    return items
      .filter(item => !isDeleteMode || !item.isVoided)
      .map(item => ({
        itemCode: item.code || item.productId || item.id,
        itemName: item.name,
        quantity: item.quantity,
        unit: 'Each',
        price: item.price,
        discount: item.discount || 0,
        taxRate: toNumber(item.taxRate, 5),
        batchNumber: item.isVoided ? null : (item.pinnedBatchNumber || null),
        voided: !!item.isVoided,
      }));
  }, [posSettings?.voidMode]);

  // ── Hold (persisted, session-scoped) ───────────────────────────────────────
  const sessionId = currentSession?.id && typeof currentSession.id === 'number' ? currentSession.id : null;

  const loadHeldSales = useCallback(async () => {
    if (!sessionId) { setHeldSales([]); return; }
    try {
      setHeldSales(await getHeldSales(sessionId));
    } catch (err) {
      console.warn('Held sales load failed', err);
    }
  }, [sessionId]);

  useEffect(() => { loadHeldSales(); }, [loadHeldSales]);

  const holdInvoice = async () => {
    if (currentInvoice.items.length === 0 || holdBusy) return;
    if (!sessionId) { alert('Open a POS session before holding a bill.'); return; }
    setHoldBusy(true);
    try {
      await holdSale({
        sessionId,
        branchId: currentTerminal?.branchId || currentSession?.branchId || null,
        terminalId: currentTerminal?.terminalId || null,
        customerCode: selectedCustomerData?.id !== WALK_IN_CUSTOMER.id
          ? (selectedCustomerData?.code || selectedCustomerData?.id) : 'WALK-IN',
        customerName: selectedCustomerData?.name || 'Walk-in Customer',
        cartJson: JSON.stringify(currentInvoice),
        total: currentInvoice.total,
        itemCount: currentInvoice.items.length,
      });
      clearInvoice();
      await loadHeldSales();
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to hold the bill.');
    } finally {
      setHoldBusy(false);
    }
  };

  const recallInvoice = async (id) => {
    try {
      const held = await recallHeldSale(id);
      if (held?.cartJson) {
        const cart = JSON.parse(held.cartJson);
        setCurrentInvoice(recalculateInvoice(cart.items || []));
      }
      await loadHeldSales();
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to recall the held bill.');
    }
  };

  // ── Layaways ────────────────────────────────────────────────────────────────
  const loadLayaways = useCallback(async () => {
    setLayawaysLoading(true);
    setLayawaysError(null);
    try {
      const params = {};
      const branchId = currentTerminal?.branchId || currentSession?.branchId;
      if (branchId) params.branchId = branchId;
      if (layawaysFilterStatus && layawaysFilterStatus !== 'All') {
        params.status = STATUS_LABEL_TO_ENUM[layawaysFilterStatus] || layawaysFilterStatus;
      }
      if (layawaysFilterCustomer.trim()) params.customer = layawaysFilterCustomer.trim();
      if (layawaysFilterNo.trim()) params.number = layawaysFilterNo.trim();
      setLayawaysList(await getLayaways(params));
    } catch (err) {
      setLayawaysError(err?.response?.data?.message || 'Failed to load layaways.');
      setLayawaysList([]);
    } finally {
      setLayawaysLoading(false);
    }
  }, [currentTerminal, currentSession, layawaysFilterStatus, layawaysFilterCustomer, layawaysFilterNo]);

  // Load list + detail when the modal opens / selection changes.
  useEffect(() => {
    if (showLayawaysList) loadLayaways();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLayawaysList]);

  // Fetch real POS invoices when the reprint modal opens.
  useEffect(() => {
    if (showReprintModal) fetchReprintInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReprintModal]);

  useEffect(() => {
    if (!selectedLayawayId) { setSelectedLayawayDetail(null); return; }
    let cancelled = false;
    getLayaway(selectedLayawayId)
      .then(d => { if (!cancelled) setSelectedLayawayDetail(d); })
      .catch(() => { if (!cancelled) setSelectedLayawayDetail(null); });
    return () => { cancelled = true; };
  }, [selectedLayawayId]);

  const saveCurrentLayaway = async (print = false) => {
    if (currentInvoice.items.length === 0 || saveLayawayBusy) return;
    const isWalkIn = !selectedCustomerData || selectedCustomerData.id === WALK_IN_CUSTOMER.id;
    if (isWalkIn) { setSaveLayawayError('A customer is required to save a layaway.'); return; }
    setSaveLayawayBusy(true);
    setSaveLayawayError(null);
    try {
      const saved = await createLayaway({
        customerCode: selectedCustomerData.code || selectedCustomerData.id,
        customerName: selectedCustomerData.name,
        customerPhone: selectedCustomerData.phone || null,
        branchId: currentTerminal?.branchId || currentSession?.branchId || null,
        branchName: currentTerminal?.branchName || currentSession?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        sessionId,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        depositRequired: saveLayawayDepositReq,
        depositAmount: saveLayawayDepositReq ? (parseFloat(saveLayawayDeposit) || 0) : 0,
        depositPaymentMode: saveLayawayDepositReq ? saveLayawayPayMode : null,
        dueDate: saveLayawayDueDate || null,
        remarks: saveLayawayRemarks || null,
        reserveStockRequested: saveLayawayReserveStock,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        items: cartItemsToPayload(currentInvoice.items),
      });
      if (print) {
        try { window.print(); } catch { /* print is best-effort */ }
      }
      clearInvoice();
      setShowSaveLayaway(false);
      setSaveLayawayDeposit('');
      setSaveLayawayRemarks('');
      // Surface it immediately if the list is open behind the modal.
      loadLayaways();
      return saved;
    } catch (err) {
      setSaveLayawayError(err?.response?.data?.message || err?.response?.data || 'Failed to save layaway.');
    } finally {
      setSaveLayawayBusy(false);
    }
  };

  // Convert: load the layaway's items + customer into the live cart, pre-credit the
  // deposit, and tag the cart so checkout marks the layaway converted afterwards.
  const startLayawayConversion = async (layawayId) => {
    try {
      const ly = await getLayaway(layawayId);
      if (ly.status && ly.status !== 'ACTIVE' && ly.status !== 'PARTIALLY_PAID' && ly.status !== 'READY_TO_CONVERT') {
        alert(`This layaway is ${ly.status.toLowerCase().replace(/_/g, ' ')} and cannot be converted.`);
        return;
      }
      const items = (ly.items || []).map(it => ({
        id: it.pinnedBatchNumber ? `${it.itemCode}::${it.pinnedBatchNumber}` : it.itemCode,
        productId: it.itemCode,
        name: it.itemName,
        barcode: it.itemCode,
        code: it.itemCode,
        image: null,
        price: it.price || 0,
        quantity: it.quantity || 0,
        discount: it.discount || 0,
        taxRate: it.taxRate != null ? it.taxRate : 5,
        total: (it.price || 0) * (it.quantity || 0) * (1 - (it.discount || 0) / 100),
        pinnedBatchNumber: it.pinnedBatchNumber || null,
        isVoided: !!it.voided,
      }));
      // Compute bill discount needed so the cart total matches the stored saleTotal exactly.
      const tempInvoice = recalculateInvoice(items, 0);
      const storedTotal = ly.saleTotal || 0;
      const storedBillDiscount = ly.billDiscountAmount || 0;
      // Prefer the stored billDiscountAmount; if the recalculated total still doesn't
      // match saleTotal (e.g. items were saved differently), derive the diff as extra discount.
      const derivedBillDiscount = Math.max(0, tempInvoice.subtotal - tempInvoice.totalDiscount + tempInvoice.tax - storedTotal);
      const billDiscountAmount = storedBillDiscount > 0 ? storedBillDiscount : derivedBillDiscount;
      setCurrentInvoice(recalculateInvoice(items, billDiscountAmount));
      // Select the layaway's customer if we have it loaded.
      const match = customerOptions.find(c =>
        (c.code && c.code === ly.customerCode) || c.id === ly.customerCode);
      if (match) setSelectedCustomer(match.id);
      setActiveLayawayId(ly.id);
      setActiveLayawayDeposit(ly.depositAmount || 0);
      setShowLayawaysList(false);
      setSelectedLayawayId(null);
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to load layaway for conversion.');
    }
  };

  const handleCancelLayaway = async (layawayId) => {
    if (!window.confirm('Cancel this layaway? Reserved stock will be released.')) return;
    setLayawayBusyId(layawayId);
    try {
      await cancelLayaway(layawayId);
      if (selectedLayawayId === layawayId) setSelectedLayawayId(null);
      await loadLayaways();
    } catch (err) {
      const status = err?.response?.status;
      alert(status === 403
        ? 'You do not have permission to cancel a layaway (supervisor required).'
        : (err?.response?.data?.message || 'Failed to cancel layaway.'));
    } finally {
      setLayawayBusyId(null);
    }
  };

  // ── Cash drawer control ────────────────────────────────────────────────────
  // Opens the physical drawer only for events enabled in POS settings
  // (cashDrawerTriggers). Trigger keys must match the backend vocabulary in
  // PosSettings.cashDrawerTriggers (CASH_PAYMENT, RECEIPT_PRINT, CHANGE_RETURN,
  // CASH_SETTLEMENT, CASH_DROP, CASH_OUT, MANUAL_OPEN).
  const isDrawerTriggerEnabled = useCallback((trigger) => {
    const raw = posSettings?.cashDrawerTriggers;
    if (raw == null) return false;
    return String(raw).split(',').map(t => t.trim()).includes(trigger);
  }, [posSettings]);

  const openCashDrawer = useCallback((trigger) => {
    // MANUAL_OPEN is an explicit cashier action — always allowed.
    if (trigger !== 'MANUAL_OPEN' && !isDrawerTriggerEnabled(trigger)) return;
    // No web API to pulse a physical drawer; the driver/agent listens for this.
    // Surface the kick so hardware integrations (or future bridge) can react.
    window.dispatchEvent(new CustomEvent('pos:open-cash-drawer', { detail: { trigger } }));
  }, [isDrawerTriggerEnabled]);

  // ── Detailed cart view ──────────────────────────────────────────────────────
  // When cartViewMode = DETAILED, surface the per-field details enabled in POS
  // settings for each cart line. Returns [{ label, value }] for fields that are
  // both enabled and have a value on the line.
  const cartViewDetailed = posSettings?.cartViewMode === 'DETAILED';
  const cartLineDetails = useCallback((item) => {
    if (!cartViewDetailed || item?.isVoided) return [];
    const out = [];
    const add = (enabled, label, value) => {
      if (enabled && value != null && String(value).trim() !== '') {
        out.push({ label, value: String(value) });
      }
    };
    add(posSettings?.cartShowBarcode, 'Barcode', item.barcode);
    add(posSettings?.cartShowProductCode, 'Code', item.code);
    add(posSettings?.cartShowBatchNumber, 'Batch', item.pinnedBatchNumber || item.batchNumber);
    add(posSettings?.cartShowSerialNumber, 'Serial', item.serialNumber || item.serial);
    add(posSettings?.cartShowExpiryDate, 'Expiry', item.expiryDate || item.expiry);
    return out;
  }, [cartViewDetailed, posSettings]);

  const processPayment = async () => {
    if (currentInvoice.items.length === 0 || checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const grandTotal = currentInvoice.total;
      const tenderedNum = parseFloat(tenderedAmount) || 0;
      const mixedCashNum = parseFloat(mixedCashAmount) || 0;
      const mixedCardNum = parseFloat(mixedCardAmount) || 0;
      const depositSnapshot = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
      const effectiveDueAmt = Math.max(0, grandTotal - depositSnapshot);

      // Build payment mode string
      let paymentMode = checkoutPayMode === 'cash' ? 'Cash'
        : checkoutPayMode === 'card' ? (checkoutCardType || 'Card')
        : checkoutPayMode === 'credit' ? 'Credit'
        : 'Cash + Card';
      let combinedPaymentMode = checkoutPayMode === 'mixed' ? `Cash + ${mixedCardType || 'Card'}` : null;
      let amountTendered = checkoutPayMode === 'cash' ? tenderedNum
        : checkoutPayMode === 'card' ? grandTotal
        : checkoutPayMode === 'credit' ? 0
        : mixedCashNum + mixedCardNum;

      // Layaway conversion: the deposit was collected at layaway creation (not yet
      // posted), so it's pre-credited here as already-paid tender. The cashier only
      // collects the remaining balance now; recorded payment = deposit + balance.
      if (activeLayawayId && activeLayawayDeposit > 0) {
        amountTendered += activeLayawayDeposit;
      }

      const customer = selectedCustomerData;
      // Voided lines are still sent (flagged) so they remain on the receipt,
      // audit log and reports. The backend excludes them from totals & stock.
      const items = currentInvoice.items
        .map(item => ({
          itemCode: item.code || item.productId || item.id,
          itemName: item.name,
          quantity: item.quantity,
          unit: 'Each',
          price: item.price,
          discount: item.discount || 0,
          taxRate: toNumber(item.taxRate, 5),
          batchNumber: item.isVoided ? null : (item.pinnedBatchNumber || null),
          voided: !!item.isVoided,
        }));

      const payload = {
        customerCode: customer.id !== 'walk-in' ? (customer.code || customer.id) : 'WALK-IN',
        customerName: customer.name,
        paymentMode,
        combinedPaymentMode,
        amountTendered,
        cashAmount: checkoutPayMode === 'mixed' ? mixedCashNum : (checkoutPayMode === 'cash' ? amountTendered : 0),
        cardAmount: checkoutPayMode === 'mixed' ? mixedCardNum : (checkoutPayMode === 'card' ? grandTotal : 0),
        cardReference: checkoutCardRef || null,
        cardType: checkoutCardType || mixedCardType || null,
        sessionId: currentSession?.id || null,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        branchId: currentTerminal?.branchId || null,
        branchName: currentTerminal?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        shippingAddress: deliveryAddress || null,
        driverName: (deliveryDriver && deliveryDriver !== 'Unassigned') ? deliveryDriver : null,
        deliveryNotes: deliveryNotes || null,
        items,
      };

      const savedInvoice = await posCheckout(payload);

      const changeDue = checkoutPayMode === 'cash' ? Math.max(0, tenderedNum - effectiveDueAmt) : 0;

      // Cash drawer — open on cash settlement / completion, and again if change is due.
      const cashTaken = checkoutPayMode === 'cash' || (checkoutPayMode === 'mixed' && mixedCashNum > 0);
      if (cashTaken) {
        openCashDrawer('CASH_SETTLEMENT');
        openCashDrawer('CASH_PAYMENT');
      }
      if (changeDue > 0) openCashDrawer('CHANGE_RETURN');

      const paid = {
        id: savedInvoice.invoiceNumber,
        total: savedInvoice.invoiceTotal,
        items: currentInvoice.items.length,
        invoice: savedInvoice,
        changeAmount: changeDue,
        customer,
        paymentMode,
        depositAmount: depositSnapshot,
        paidAmount: checkoutPayMode === 'cash' ? tenderedNum
          : checkoutPayMode === 'mixed' ? mixedCashNum + mixedCardNum
          : effectiveDueAmt,
      };

      // If this checkout settled a layaway, stamp it converted (releases its
      // reservations; the sale above re-reserved its own batches). Best-effort —
      // the sale already posted, so a failure here just leaves the layaway open.
      if (activeLayawayId) {
        try {
          await convertLayaway(activeLayawayId, {
            invoiceId: savedInvoice.id,
            invoiceNumber: savedInvoice.invoiceNumber,
          });
        } catch (convErr) {
          console.warn('Layaway mark-converted failed', convErr);
        }
        setActiveLayawayId(null);
        setActiveLayawayDeposit(0);
      }

      setLastPaidInvoice(paid);
      setInvoiceCounter(c => c + 1);
      clearInvoice();
      setReceivedAmount('');
      setTenderedAmount('');
      setSelectedCardType('');
      setSelectedCreditCustomer('');
      setLastScannedItem(null);
      setMixedCashAmount('');
      setMixedCardAmount('');
      setMixedCardType('');
      setCheckoutPayMode('cash');
      setCheckoutKeypadValue('');
      setCheckoutCardType('');
      setCheckoutCardRef('');
      setCheckoutRemarks('');
      setCheckoutCreditCustomer(null);
      setCheckoutCreditCustomerSearch('');
      // Transition the checkout overlay to the "complete" screen in-place
      // (avoids simultaneous overlay unmount + Dialog mount which triggers a
      // removeChild DOM error in React 18 StrictMode development).
      setCheckoutPhase('complete');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data || err?.message || 'Checkout failed. Please try again.';
      setCheckoutError(typeof msg === 'string' ? msg : 'Checkout failed. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };
  
  const handleKeypadInput = (value) => {
    if (value === 'C') {
      setTenderedAmount('');
    } else if (value === '←') {
      setTenderedAmount(tenderedAmount.slice(0, -1));
    } else if (value === '.') {
      if (!tenderedAmount.includes('.')) {
        setTenderedAmount(tenderedAmount + '.');
      }
    } else {
      setTenderedAmount(tenderedAmount + value);
    }
  };

  const handleCashDrop = async () => {
    const amount = parseFloat(cashDropAmount) || 0;
    if (amount <= 0) return;
    const movementType = cashDropType === 'in' ? 'DROP_IN' : 'DROP_OUT';
    openCashDrawer(cashDropType === 'in' ? 'CASH_DROP' : 'CASH_OUT');
    try {
      if (currentSession?.id && typeof currentSession.id === 'number') {
        await addPosCashMovement(currentSession.id, {
          movementType,
          amount,
          description: cashDropDescription || (cashDropType === 'in' ? 'Cash Drop In' : 'Cash Out'),
        });
      }
      setCashDropFeedback({ type: 'success', message: cashDropType === 'in' ? 'Cash drop recorded.' : 'Cash out recorded.' });
    } catch (err) {
      console.warn('Cash movement API error', err);
      setCashDropFeedback({ type: 'error', message: 'Failed to record cash movement.' });
    }
    setCashDropAmount('');
    setCashDropDescription('');
    setShowCashDropDialog(false);
    setTimeout(() => setCashDropFeedback(null), 3000);
  };

  const fetchReprintInvoices = async () => {
    setReprintLoading(true);
    setReprintError(null);
    try {
      const data = await getPosInvoices({
        dateFrom: reprintFilterDateFrom,
        dateTo: reprintFilterDateTo,
        branchId: currentTerminal?.branchId || null,
      });
      setReprintInvoices(data || []);
    } catch (err) {
      setReprintError('Failed to load invoices.');
      setReprintInvoices([]);
    } finally {
      setReprintLoading(false);
    }
  };

  const handleReprintConfirm = async () => {
    if (!reprintSelectedInvoice) return;
    setReprintPrinting(true);
    try {
      const inv = reprintInvoices.find(i => i.invoiceNumber === reprintSelectedInvoice);
      if (inv?.id) {
        const full = await getSalesInvoiceById(inv.id);
        openCashDrawer('RECEIPT_PRINT');
        if (tplInvoicePaper === 'A4') {
          const template = buildPosA4Template(tplInvoiceFooter, { showLogo:tplInvoiceShowLogo, showCompanyDetails:tplInvoiceShowCompanyDetails, showTrn:tplInvoiceShowTrn, showCustomerDetails:tplInvoiceShowCustomerDetails, showTerms:tplInvoiceShowTerms, showNotes:tplInvoiceShowNotes, showBankDetails:tplInvoiceShowBankDetails, showQRCode:tplInvoiceShowQRCode, showStamp:tplInvoiceShowStamp, showSignature:tplInvoiceShowSignature, showGrandTotalBanner:tplInvoiceShowGrandTotalBanner, colItemCode:tplInvoiceColItemCode, colItemImage:tplInvoiceColItemImage, colBarcode:tplInvoiceColBarcode, colBatchNo:tplInvoiceColBatchNo, colDiscount:tplInvoiceColDiscount, colVatPct:tplInvoiceColVatPct, colVatAmt:tplInvoiceColVatAmt });
          const data = buildPosPrintData(full, tplInvoiceFooter);
          const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
          printHtml(generateDocumentPrintHtml(template, data, options));
        } else {
          const tlvR = buildZatcaTlvBase64(tplOutletName, tplOutletTrn, full.invoiceDate ? new Date(full.invoiceDate).toISOString() : new Date().toISOString(), full.invoiceTotal, full.taxTotal);
          const qrDataUrlR = tplInvoiceShowQRCode ? await QRCode.toDataURL(tlvR, { errorCorrectionLevel: 'M', width: 160 }) : null;
          printHtml(buildThermalReceiptHtml(tplInvoicePaper, full, { companyName: tplOutletName, trn: tplOutletTrn, header: tplInvoiceHeader, footer: tplInvoiceFooter, showTrn: true, isReprint: true, zatcaQrDataUrl: qrDataUrlR }));
        }
      }
    } catch (err) {
      console.warn('Reprint error', err);
    } finally {
      setReprintPrinting(false);
      setReprintConfirmOpen(false);
    }
  };

  const filteredProducts = posProducts;

  const showFeedback = (type, message) => {
    setBarcodeScanFeedback({ type, message });
    setTimeout(() => setBarcodeScanFeedback(null), 2500);
  };

  /**
   * Unified search/scan handler. One input both filters the grid (as you type)
   * and — on Enter / scanner submit — resolves the value to a single action:
   *   • exact barcode / code / SKU  → add product to cart
   *   • exact batch / serial number → add product, pinning that scanned unit
   *   • exact customer id/mobile/etc → set the customer
   *   • no exact match              → leave the text in the grid filter
   * Supports an "N*VALUE" / "NxVALUE" quantity prefix.
   */
  const handleUnifiedEntry = useCallback(async (raw, { fromGrid = false } = {}) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return;

    // Parse quantity prefix: "3*VALUE" or "3xVALUE"
    let qty = 1;
    let value = trimmed;
    const prefixMatch = trimmed.match(/^(\d+)[*x](.+)$/i);
    if (prefixMatch) {
      qty = Math.max(1, parseInt(prefixMatch[1], 10));
      value = prefixMatch[2].trim();
    }

    const clearInputs = () => {
      setBarcodeInput('');
      if (fromGrid) setSearchQuery('');
    };

    // Fast path: a previously-seen product in the in-memory cache (no batch pin).
    const cached = productCacheRef.current.get(value.toLowerCase());
    if (cached) {
      addToInvoice(cached, qty);
      setLastScannedItem({ name: cached.name, nameAr: cached.nameAr || '', barcode: cached.barcode || cached.id, qty, total: cached.price * qty });
      showFeedback('success', qty > 1 ? `${cached.name} ×${qty} added` : `${cached.name} added`);
      clearInputs();
      return;
    }

    let result;
    try {
      result = await resolvePosEntry(value);
    } catch (error) {
      console.error('Failed to resolve POS entry', error);
      showFeedback('error', `Lookup failed: ${value}`);
      return;
    }

    if (result?.type === 'CUSTOMER' && result.customer) {
      const c = result.customer;
      setSelectedCustomer(String(c.id ?? c.code));
      showFeedback('customer', `Customer set: ${c.name || c.code}`);
      clearInputs();
      return;
    }

    if (result?.type === 'PRODUCT' && result.product) {
      const product = mapPosProductAggregateItem(result.product, value);
      cachePosProduct(productCacheRef.current, product);
      const pinnedBatchNumber = result.pinnedBatchNumber || null;
      // A pinned batch is one physical unit — force qty 1 for that line.
      const effectiveQty = pinnedBatchNumber ? 1 : qty;
      // Prevent the same physical batch unit from being added twice.
      if (pinnedBatchNumber && currentInvoiceRef.current?.items?.some(i => i.pinnedBatchNumber === pinnedBatchNumber)) {
        showFeedback('error', `Batch ${pinnedBatchNumber} is already in the cart`);
        clearInputs();
        return;
      }
      addToInvoice(product, effectiveQty, pinnedBatchNumber);
      setLastScannedItem({
        name: product.name,
        nameAr: product.nameAr || '',
        barcode: pinnedBatchNumber || product.barcode || product.id,
        qty: effectiveQty,
        total: product.price * effectiveQty,
      });
      showFeedback('success', pinnedBatchNumber
        ? `${product.name} — batch ${pinnedBatchNumber}`
        : (effectiveQty > 1 ? `${product.name} ×${effectiveQty} added` : `${product.name} added`));
      clearInputs();
      return;
    }

    // No exact match. From the grid input we keep the text so the grid filters;
    // from a dedicated scan we surface a not-found message.
    if (fromGrid) {
      showFeedback('error', `No exact match — showing results for "${value}"`);
    } else {
      showFeedback('error', `No product found: ${value}`);
      setBarcodeInput('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back-compat alias: existing scan/keypad call sites add-to-cart.
  const handleBarcodeScan = handleUnifiedEntry;

  const resetFocusMode = () => {
    setPosActionMode('none');
    setSelectedFocusItemId(null);
    setBarcodeInput('');
  };

  // ─── Sales Analytics ───────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getSalesAnalytics({ from: analyticsDateFrom, to: analyticsDateTo });
      setAnalyticsData(data);
    } catch (e) {
      console.error('Sales analytics fetch failed', e);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsDateFrom, analyticsDateTo]);

  useEffect(() => {
    if (currentView === 'sales-analytics' && !analyticsData) {
      fetchAnalytics();
    }
  }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderSalesAnalytics = () => {
    const kpi = analyticsData?.kpi;
    const pl  = analyticsData?.pipeline;
    const fmt = (v) => v == null ? '—' : `AED ${Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtN = (v) => v == null ? '—' : String(v);

    const kpis = [
      { label: 'Total Sales',            value: kpi ? fmt(kpi.totalSales)        : '—', sub: kpi ? `${kpi.invoiceCount} invoices` : '—', trend: 'up',  icon: <TrendingUp className="h-5 w-5" />,    color: '#327F74' },
      { label: 'Total Receivables',      value: kpi ? fmt(kpi.totalReceivables)  : '—', sub: 'Outstanding balance',                       trend: 'neu', icon: <Wallet className="h-5 w-5" />,        color: '#F59E0B' },
      { label: 'Pending Quotations',     value: fmtN(kpi?.pendingQuotations),             sub: 'Pending approval / active',                trend: 'neu', icon: <FileText className="h-5 w-5" />,      color: '#6366F1' },
      { label: 'Open Sales Orders',      value: fmtN(kpi?.openSalesOrders),               sub: 'Confirmed & in progress',                  trend: 'neu', icon: <ShoppingCart className="h-5 w-5" />,  color: '#8B5CF6' },
      { label: 'Pending Proforma',       value: fmtN(kpi?.pendingProforma),               sub: 'Draft proforma invoices',                  trend: 'neu', icon: <FileBarChart className="h-5 w-5" />,  color: '#0EA5E9' },
      { label: 'Pending Delivery Notes', value: fmtN(kpi?.pendingDeliveryNotes),          sub: 'Draft / dispatched',                       trend: 'neu', icon: <Truck className="h-5 w-5" />,         color: '#F97316' },
      { label: 'Overdue Invoices',       value: fmtN(kpi?.overdueInvoices),               sub: 'Unpaid >30 days',                          trend: kpi?.overdueInvoices > 0 ? 'warn' : 'neu', icon: <AlertTriangle className="h-5 w-5" />, color: '#EF4444' },
      { label: 'Sales Returns Value',    value: kpi ? fmt(kpi.salesReturnsValue) : '—', sub: 'Period total',                              trend: 'neu', icon: <RotateCcw className="h-5 w-5" />,     color: '#EC4899' },
      { label: 'Credit Notes Value',     value: kpi ? fmt(kpi.creditNotesValue)  : '—', sub: 'Period total',                              trend: 'neu', icon: <CreditCard className="h-5 w-5" />,    color: '#14B8A6' },
    ];

    const pipelineStages = [
      { stage: 'Quotation',     count: pl?.quotations       ?? 0, value: pl?.quotationsValue    ?? 0, icon: <FileText className="h-4 w-4" />,     color: '#6366F1' },
      { stage: 'Sales Order',   count: pl?.salesOrders      ?? 0, value: pl?.salesOrdersValue   ?? 0, icon: <ShoppingCart className="h-4 w-4" />, color: '#8B5CF6' },
      { stage: 'Proforma Inv.', count: pl?.proformaInvoices ?? 0, value: pl?.proformaValue      ?? 0, icon: <FileBarChart className="h-4 w-4" />, color: '#0EA5E9' },
      { stage: 'Delivery Note', count: pl?.deliveryNotes    ?? 0, value: pl?.deliveryNotesValue ?? 0, icon: <Truck className="h-4 w-4" />,        color: '#F97316' },
      { stage: 'Sales Invoice', count: pl?.invoices         ?? 0, value: pl?.invoicesValue      ?? 0, icon: <Receipt className="h-4 w-4" />,      color: '#327F74' },
      { stage: 'Receipt',       count: pl?.receipts         ?? 0, value: pl?.receiptsValue      ?? 0, icon: <CheckCircle className="h-4 w-4" />,  color: '#22C55E' },
    ];

    const agingData = (analyticsData?.agingBuckets ?? []);
    const topOverdue = [];
    const topCustomers = (analyticsData?.topCustomers ?? []);
    const salesTrendData = (analyticsData?.salesTrend ?? []);
    const paymentSplitData = (analyticsData?.paymentBreakdown ?? []).map((p, i) => ({
      name: p.name, value: p.value,
      fill: ['#F5C742','#327F74','#6366F1','#EC4899','#0EA5E9'][i % 5],
    }));
    const branchSalesData = (analyticsData?.branchSales ?? []).map(b => ({ branch: b.name, sales: b.value, returns: 0 }));
    const returnReasonData = [];

    const tabs = [
      { id: 'pipeline',    label: 'Sales Pipeline'        },
      { id: 'receivables', label: 'Receivables'           },
      { id: 'customers',   label: 'Customer Analytics'    },
      { id: 'invoices',    label: 'Invoice & POS'         },
      { id: 'returns',     label: 'Returns & Credit Notes' },
    ];

    const GOLD = '#F5C742';

    return (
      <div className="min-h-screen bg-[#F7F7FA]">
        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView('dashboard')}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1E293B] transition-colors"
            >
              ← Dashboard
            </button>
            <span className="text-gray-300">/</span>
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-2 rounded-lg">
                <BarChart2 className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg text-[#1E293B] leading-none">Customers & Sales Analytics</h1>
                <p className="text-xs text-gray-400 mt-0.5">BillBull Retail OS · Sales performance dashboard</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAnalyticsData(null); fetchAnalytics(); }}
              disabled={analyticsLoading}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#1E293B] border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#1E293B] border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-colors">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Filter Bar ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-[#F5C742]" />
                <span className="text-sm text-gray-500">Filters</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Date From</label>
                <input type="date" value={analyticsDateFrom} onChange={e => setAnalyticsDateFrom(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#1E293B] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Date To</label>
                <input type="date" value={analyticsDateTo} onChange={e => setAnalyticsDateTo(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#1E293B] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Branch</label>
                <select value={analyticsBranch} onChange={e => setAnalyticsBranch(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#1E293B] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40">
                  {['All','Dubai Mall','Deira City','Ibn Battuta','Mirdif City','Online'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Payment Mode</label>
                <select value={analyticsPayMode} onChange={e => setAnalyticsPayMode(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#1E293B] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40">
                  {['All','Cash','Card','Credit','Mixed'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Customer</label>
                <input type="text" placeholder="Search customer…" value={analyticsCustomer} onChange={e => setAnalyticsCustomer(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#1E293B] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 w-48" />
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={analyticsLoading}
                className="px-4 py-1.5 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm rounded-lg transition-colors ml-auto disabled:opacity-50"
              >
                {analyticsLoading ? 'Loading…' : 'Apply Filters'}
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                  setAnalyticsDateFrom(firstDay.toISOString().slice(0, 10));
                  setAnalyticsDateTo(today.toISOString().slice(0, 10));
                  setAnalyticsBranch('All');
                  setAnalyticsPayMode('All');
                  setAnalyticsCustomer('');
                }}
                className="px-4 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* ── Loading bar ── */}
          {analyticsLoading && (
            <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#F5C742] animate-pulse rounded-full" style={{ width: '60%' }} />
            </div>
          )}

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-3 xl:grid-cols-9 gap-3">
            {kpis.map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg" style={{ background: k.color + '18', color: k.color }}>
                    {k.icon}
                  </div>
                  {k.trend === 'up'   && <TrendingUp   className="h-4 w-4 text-green-500" />}
                  {k.trend === 'down' && <TrendingDown  className="h-4 w-4 text-red-500"   />}
                  {k.trend === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                </div>
                <p className="text-xs text-gray-400 leading-tight">{k.label}</p>
                <p className="text-base text-[#1E293B] truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>{renderAED(k.value)}</p>
                <p className="text-[10px] text-gray-400 leading-tight">{renderAED(k.sub)}</p>
              </div>
            ))}
          </div>

          {/* ── Tab Nav ── */}
          <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm w-fit">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setAnalyticsTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${analyticsTab === t.id ? 'bg-[#F5C742] text-[#1E293B]' : 'text-gray-500 hover:text-[#1E293B] hover:bg-gray-50'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ══ PIPELINE TAB ══ */}
          {analyticsTab === 'pipeline' && (
            <div className="space-y-6">
              {/* Pipeline flow */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <ArrowRightCircle className="h-5 w-5 text-[#F5C742]" />
                  Sales Pipeline Overview
                </h2>
                <div className="flex items-stretch gap-0">
                  {pipelineStages.map((s, i) => (
                    <React.Fragment key={i}>
                      <div className="flex-1 rounded-xl border-2 p-4 text-center" style={{ borderColor: s.color + '40', background: s.color + '08' }}>
                        <div className="flex justify-center mb-2">
                          <div className="p-2 rounded-full" style={{ background: s.color + '20', color: s.color }}>
                            {s.icon}
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{s.stage}</p>
                        <p className="text-2xl" style={{ color: s.color }}>{s.count}</p>
                        <p className="text-[11px] text-gray-500 mt-1"><DirhamSymbol /> {s.value.toLocaleString()}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.round(s.count / 23 * 100)}%`, background: s.color }} />
                        </div>
                      </div>
                      {i < pipelineStages.length - 1 && (
                        <div className="flex items-center px-1 text-gray-200">
                          <ChevronRight className="h-5 w-5" />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Sales trend area chart */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[#1E293B] flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#F5C742]" />
                    Monthly Sales Trend
                  </h2>
                  <span className="text-xs text-gray-400">Jan – Jun 2026</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={salesTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={GOLD} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={GOLD} stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="gradPOS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#327F74" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#327F74" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales" name="Total Sales" stroke={GOLD} strokeWidth={2} fill="url(#gradSales)" />
                    <Area type="monotone" dataKey="pos"   name="POS Sales"   stroke="#327F74" strokeWidth={2} fill="url(#gradPOS)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Branch sales bar */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#F5C742]" />
                  Sales by Branch / Outlet
                </h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={branchSalesData} margin={{ top: 0, right: 20, left: 10, bottom: 0 }} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" vertical={false} />
                    <XAxis dataKey="branch" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Bar dataKey="sales"   name="Sales"   fill={GOLD}     radius={[4,4,0,0]} />
                    <Bar dataKey="returns" name="Returns" fill="#F87171"   radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══ RECEIVABLES TAB ══ */}
          {analyticsTab === 'receivables' && (
            <div className="space-y-6">
              {/* Aging summary */}
              <div className="grid grid-cols-4 gap-4">
                {agingData.map((a, i) => {
                  const colors = ['#22C55E','#F59E0B','#F97316','#EF4444'];
                  return (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">{a.range}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: colors[i] }}>{a.count} inv.</span>
                      </div>
                      <p className="text-xl text-[#1E293B]"><DirhamSymbol /> {a.amount.toLocaleString()}</p>
                      <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${a.pct}%`, background: colors[i] }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">{a.pct}% of total receivables</p>
                    </div>
                  );
                })}
              </div>

              {/* Receivables area chart */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-[#F5C742]" />
                  Outstanding vs Overdue Receivables Trend
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={salesTrendData.map((d,i) => ({ ...d, outstanding: [48320,44200,51800,39400,46600,48320][i], overdue: [22130,18400,26100,17200,20400,22130][i] }))} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#0EA5E9" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="gradOver" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="outstanding" name="Outstanding" stroke="#0EA5E9" strokeWidth={2} fill="url(#gradOut)"  />
                    <Area type="monotone" dataKey="overdue"     name="Overdue"     stroke="#EF4444" strokeWidth={2} fill="url(#gradOver)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top overdue customers table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Top Overdue Customers
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Customer','Mobile','Overdue Amount','Days Overdue','Action'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topOverdue.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3 text-[#1E293B]">{c.name}</td>
                        <td className="py-3 px-3 text-gray-500">{c.mobile}</td>
                        <td className="py-3 px-3 text-red-600"><DirhamSymbol /> {c.amount.toLocaleString()}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${c.days > 90 ? 'bg-red-100 text-red-700' : c.days > 60 ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                            {c.days} days
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <button className="text-xs text-[#327F74] hover:underline">Send Reminder</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ CUSTOMERS TAB ══ */}
          {analyticsTab === 'customers' && (
            <div className="space-y-6">
              {/* Customer summary stats */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Total Customers',    value: analyticsData?.customerMetrics ? String(analyticsData.customerMetrics.totalCustomers) : '—', icon: <Users className="h-4 w-4" />,     color: '#327F74' },
                  { label: 'New This Period',     value: '—', icon: <UserPlus className="h-4 w-4" />,  color: '#22C55E' },
                  { label: 'Active Customers',    value: analyticsData?.customerMetrics ? String(analyticsData.customerMetrics.activeCustomers) : '—', icon: <UserCheck className="h-4 w-4" />, color: '#6366F1' },
                  { label: 'Inactive (90+ days)', value: '—', icon: <User className="h-4 w-4" />,      color: '#94A3B8' },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                    <div className="p-3 rounded-xl" style={{ background: s.color + '15', color: s.color }}>
                      {s.icon}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p className="text-2xl text-[#1E293B]">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top customers table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[#1E293B] flex items-center gap-2">
                    <Star className="h-5 w-5 text-[#F5C742]" />
                    Top Customers by Sales Value
                  </h2>
                  <button className="text-xs text-[#327F74] hover:underline">View All</button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['#','Customer','Invoices','Total Sales','Outstanding','Purchase Trend'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomers.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: i < 3 ? GOLD + '30' : '#F1F5F9', color: i < 3 ? '#B8860B' : '#94A3B8' }}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#1E293B]">{c.name}</td>
                        <td className="py-3 px-3 text-gray-500">{c.invoices}</td>
                        <td className="py-3 px-3 text-[#1E293B]"><DirhamSymbol /> {c.sales.toLocaleString()}</td>
                        <td className="py-3 px-3">
                          {c.outstanding > 0
                            ? <span className="text-amber-600"><DirhamSymbol /> {c.outstanding.toLocaleString()}</span>
                            : <span className="text-green-500">Cleared</span>}
                        </td>
                        <td className="py-3 px-3">
                          {/* Tiny sparkline bars */}
                          <div className="flex items-end gap-0.5 h-6">
                            {[0.5,0.7,0.4,0.9,0.8,1.0].map((v, j) => (
                              <div key={j} className="w-2 rounded-sm" style={{ height: `${v*100}%`, background: '#327F74', opacity: 0.4 + v * 0.6 }} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Customer purchase trend bar chart */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#F5C742]" />
                  Customer Purchase Trend (Monthly)
                </h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={salesTrendData.map(d => ({ month: d.month, new: Math.round(d.sales / 2800), returning: Math.round(d.sales / 1400) }))} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="new"       name="New Customers"       fill="#22C55E" radius={[4,4,0,0]} />
                    <Bar dataKey="returning" name="Returning Customers" fill={GOLD}    radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══ INVOICES TAB ══ */}
          {analyticsTab === 'invoices' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Invoice & POS trend */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-[#F5C742]" />
                    Sales Invoice Trend
                  </h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={salesTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={GOLD}    stopOpacity={0.3} />
                          <stop offset="95%" stopColor={GOLD}    stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <ReTooltip formatter={(v) => [`AED ${v.toLocaleString()}`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                      <Area type="monotone" dataKey="sales" name="Invoiced" stroke={GOLD} strokeWidth={2} fill="url(#gradInv)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Payment split pie */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-[#F5C742]" />
                    Payment Mode Split
                  </h2>
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={160} height={160}>
                      <RePieChart>
                        <Pie data={paymentSplitData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value">
                          {paymentSplitData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                        <ReTooltip formatter={(v) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {paymentSplitData.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: p.fill }} />
                          <span className="text-sm text-gray-600">{p.name}</span>
                          <span className="text-sm text-[#1E293B] ml-auto pl-4">{p.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* POS trend + avg invoice */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Average Invoice Value', value: kpi ? fmt(kpi.avgInvoiceValue)  : '—', sub: 'Per invoice', icon: <DollarSign className="h-4 w-4" />, color: '#327F74' },
                  { label: 'Total Invoices Issued',  value: kpi ? fmtN(kpi.invoiceCount)   : '—', sub: 'In period',   icon: <FileText className="h-4 w-4" />,   color: '#6366F1' },
                  { label: 'POS Transactions',       value: '—', sub: '—', icon: <ShoppingCart className="h-4 w-4" />, color: GOLD },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl" style={{ background: s.color + '15', color: s.color }}>
                      {s.icon}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p className="text-xl text-[#1E293B]">{renderAED(s.value)}</p>
                      <p className="text-[11px] text-gray-400">{s.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* POS sales trend */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-[#F5C742]" />
                  POS Sales Trend
                </h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={salesTrendData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v) => [`AED ${v.toLocaleString()}`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Bar dataKey="pos" name="POS Sales" fill="#327F74" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══ RETURNS TAB ══ */}
          {analyticsTab === 'returns' && (
            <div className="space-y-6">
              {/* Returns KPI row */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Sales Return Value',   value: analyticsData?.returnMetrics ? fmt(analyticsData.returnMetrics.salesReturnsValue) : '—', sub: '—', icon: <RotateCcw className="h-4 w-4" />,  color: '#EC4899' },
                  { label: 'Credit Notes Value',   value: '—', sub: '—', icon: <CreditCard className="h-4 w-4" />, color: '#14B8A6' },
                  { label: 'Total Return Txns',    value: analyticsData?.returnMetrics ? fmtN(analyticsData.returnMetrics.returnCount) : '—', sub: '—', icon: <Package className="h-4 w-4" />,    color: '#F97316' },
                  { label: 'Return %',             value: analyticsData?.returnMetrics ? `${analyticsData.returnMetrics.returnPct.toFixed(1)}%` : '—', sub: 'of sales', icon: <Percent className="h-4 w-4" />,    color: '#6366F1' },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                    <div className="p-3 rounded-xl" style={{ background: s.color + '15', color: s.color }}>
                      {s.icon}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p className="text-xl text-[#1E293B]">{renderAED(s.value)}</p>
                      <p className="text-[11px] text-gray-400">{s.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Return vs Sales trend */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[#F5C742]" />
                  Returns vs Sales Trend
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={salesTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gS2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={GOLD}    stopOpacity={0.2} />
                        <stop offset="95%" stopColor={GOLD}    stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="gR2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#EC4899" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#EC4899" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales"   name="Sales"   stroke={GOLD}    strokeWidth={2} fill="url(#gS2)" />
                    <Area type="monotone" dataKey="returns" name="Returns" stroke="#EC4899" strokeWidth={2} fill="url(#gR2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Return reason analysis */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#F5C742]" />
                    Return Reason Analysis
                  </h2>
                  <div className="space-y-3">
                    {returnReasonData.map((r, i) => {
                      const maxCount = Math.max(...returnReasonData.map(x => x.count));
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-600">{r.reason}</span>
                            <span className="text-sm text-[#1E293B]">{r.count} ({Math.round(r.count / returnReasonData.reduce((s, x) => s + x.count, 0) * 100)}%)</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${r.count / maxCount * 100}%`, background: ['#EC4899','#F97316','#F59E0B','#6366F1','#14B8A6'][i] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#F5C742]" />
                    Credit Notes Detail
                  </h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Credit Note #','Customer','Amount','Status'].map(h => (
                          <th key={h} className="text-left py-2 px-2 text-xs text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-xs text-gray-400">No credit notes to display</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  };

  const posDashboardTileClass = "cursor-pointer border border-transparent bg-white shadow-sm transition-all hover:border-[#F5C742] hover:shadow-lg";

  // Dashboard View
  const renderDashboard = () => (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl text-[#1E293B] mb-2">Point of Sale</h1>
        <p className="text-gray-600">Retail POS dashboard and session management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Start/Continue Session Tile */}
        <Card
          className={posDashboardTileClass}
          onClick={() => {
            if (posInitLoading) return;
            if (currentSession?.status === 'active' || currentSession?.status === 'OPEN') {
              setCurrentView('touch-screen');
            } else {
              setShowStartSessionDialog(true);
            }
          }}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg">
                {posInitLoading ? (
                  <div className="h-8 w-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                ) : (currentSession?.status === 'active' || currentSession?.status === 'OPEN') ? (
                  <Play className="h-8 w-8 text-white" />
                ) : (
                  <Unlock className="h-8 w-8 text-white" />
                )}
              </div>
              {(currentSession?.status === 'active' || currentSession?.status === 'OPEN') && (
                <Badge className="bg-green-500">Active</Badge>
              )}
            </div>
            <CardTitle className="mt-4">
              {posInitLoading ? 'Connecting...' : (currentSession?.status === 'active' || currentSession?.status === 'OPEN') ? 'Continue Session' : 'Start Session'}
            </CardTitle>
            <CardDescription>
              {posInitLoading ? 'Checking terminal & session status...' : (currentSession?.status === 'active' || currentSession?.status === 'OPEN')
                ? 'Resume your active POS session'
                : 'Open cash drawer and start new session'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentSession?.status === 'active' || currentSession?.status === 'OPEN' && (
              <div className="text-sm space-y-1">
                <p className="text-gray-600">Opening Cash: {formatCurrency(currentSession.openingCash)}</p>
                <p className="text-gray-600">Started: {currentSession.openedAt ? new Date(currentSession.openedAt).toLocaleTimeString() : currentSession.startTime ? new Date(currentSession.startTime).toLocaleTimeString() : '—'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Z-Report Tile */}
        <Card 
          className={posDashboardTileClass}
          onClick={() => setCurrentView('z-report')}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <FileBarChart className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">Z-Report</CardTitle>
            <CardDescription>
              Generate end-of-day summary report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Consolidated report of all closed sessions
            </p>
          </CardContent>
        </Card>

        {/* X-Report / Close Session Tile */}
        <Card 
          className={`${posDashboardTileClass} ${
            currentSession?.status !== 'active' && currentSession?.status !== 'OPEN' ? 'opacity-50' : ''
          }`}
          onClick={() => {
            if (currentSession?.status === 'active' || currentSession?.status === 'OPEN') {
              setShowCloseSessionDialog(true);
            }
          }}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#E63946] to-[#ff6b6b] p-4 rounded-lg w-fit">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">X-Report / Close Session</CardTitle>
            <CardDescription>
              Close current session and generate report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {currentSession?.status === 'active' || currentSession?.status === 'OPEN' 
                ? 'End session with denomination count' 
                : 'No active session to close'}
            </p>
          </CardContent>
        </Card>

        {/* Customer Tile */}
        <Card 
          className={posDashboardTileClass}
          onClick={() => setCurrentView('customer')}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <Users className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">Customer</CardTitle>
            <CardDescription>
              Manage customer transactions and statements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              View statements, receive payments, manage advances
            </p>
          </CardContent>
        </Card>

        {/* Cash Drop / Out Tile */}
        <Card
          className={posDashboardTileClass}
          onClick={() => setShowCashDropDialog(true)}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <Archive className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">Cash Drop / Out</CardTitle>
            <CardDescription>
              Record cash movements and expenses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Add cash drops or record cash payouts
            </p>
          </CardContent>
        </Card>

        {/* BillBull Console Tile */}
        <Card
          className={posDashboardTileClass}
          onClick={() => setCurrentView('console')}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <Settings className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">BillBull Console</CardTitle>
            <CardDescription>
              POS settings, devices &amp; outlet configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Manage layout, printers and print templates
            </p>
          </CardContent>
        </Card>

        {/* Sales Analytics Tile */}
        <Card
          className={posDashboardTileClass}
          onClick={() => setCurrentView('sales-analytics')}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <BarChart2 className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">Sales Analytics</CardTitle>
            <CardDescription>
              Customers &amp; Sales performance dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Pipeline, receivables, customer trends &amp; returns
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      {(currentSession?.status === 'active' || currentSession?.status === 'OPEN') && (() => {
        const xSummary = xReportData?.summary || {};
        const statTotalSales = xSummary.totalSales ?? 0;
        const statTxCount = xSummary.invoiceCount ?? 0;
        const statOpeningCash = xSummary.openingCash ?? currentSession?.openingCash ?? 0;
        const statCashSales = xSummary.cashSales ?? 0;
        const statDropIn = xSummary.cashDropIn ?? 0;
        const statDropOut = xSummary.cashDropOut ?? 0;
        const statExpectedCash = xSummary.expectedCash ?? (statOpeningCash + statCashSales + statDropIn - statDropOut);

        const sessionStart = currentSession?.openedAt ? new Date(currentSession.openedAt) : null;
        const nowMs = Date.now();
        const diffMin = sessionStart ? Math.floor((nowMs - sessionStart.getTime()) / 60000) : 0;
        const durH = Math.floor(diffMin / 60);
        const durM = diffMin % 60;
        const sessionDuration = sessionStart ? (durH > 0 ? `${durH}h ${durM}m` : `${durM}m`) : '—';

        const loading = xReportLoading;

        const statCards = [
          {
            label: "Today's Sales",
            value: loading ? null : <CurrencyAmount amount={statTotalSales} />,
            sub: loading ? 'Loading...' : `${statTxCount} transaction${statTxCount !== 1 ? 's' : ''}`,
            icon: <TrendingUp className="h-5 w-5" />,
            accent: '#327F74',
            bg: 'from-[#327F74]/10 to-[#327F74]/5',
          },
          {
            label: 'Transactions',
            value: loading ? null : <span>{statTxCount}</span>,
            sub: loading ? 'Loading...' : statTxCount === 0 ? 'No sales yet' : 'Completed this session',
            icon: <ShoppingCart className="h-5 w-5" />,
            accent: '#6366F1',
            bg: 'from-[#6366F1]/10 to-[#6366F1]/5',
          },
          {
            label: 'Cash in Drawer',
            value: loading ? null : <CurrencyAmount amount={statExpectedCash} />,
            sub: loading ? 'Loading...' : `Float: AED ${Number(statOpeningCash).toFixed(2)}`,
            icon: <Wallet className="h-5 w-5" />,
            accent: '#F5C742',
            bg: 'from-[#F5C742]/15 to-[#F5C742]/5',
          },
          {
            label: 'Session Duration',
            value: <span>{sessionDuration}</span>,
            sub: sessionStart ? `Started ${sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—',
            icon: <Clock className="h-5 w-5" />,
            accent: '#F59E0B',
            bg: 'from-[#F59E0B]/10 to-[#F59E0B]/5',
          },
        ];

        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            {statCards.map((card, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-br ${card.bg} px-5 pt-5 pb-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
                    <div className="p-2 rounded-xl" style={{ background: card.accent + '22', color: card.accent }}>
                      {card.icon}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-[#1E293B] min-h-[2rem] flex items-center">
                    {loading && card.label !== 'Session Duration' ? (
                      <span className="inline-block h-6 w-24 bg-gray-200 rounded animate-pulse" />
                    ) : card.value}
                  </div>
                </div>
                <div className="px-5 py-2.5 border-t border-gray-100">
                  <p className="text-xs text-gray-500">{card.sub}</p>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );


  // BillBull Console
  const renderConsole = () => {
    const allBtnList = [
      { id:'add-qty',label:'Add Qty' },{ id:'remove',label:'Remove Item' },{ id:'discount',label:'Discount' },
      { id:'layaways',label:'Layaways' },{ id:'save-layaway',label:'Save Layaway' },{ id:'save-order',label:'Save ' },
      { id:'add-shipping',label:'Add Shipping' },{ id:'add-customer',label:'Add Customer' },{ id:'coupons',label:'Coupons' },
      { id:'promotions',label:'Promotions' },{ id:'return',label:'Return' },{ id:'price-chk',label:'Price Check' },
      { id:'cash-drop',label:'Cash Drawer' },{ id:'last-receipt',label:'Last Receipt' },{ id:'credit-balance',label:'Credit Balance' },
      { id:'z-report',label:'Z-Report' },{ id:'serial-batch',label:'Serial/Batch Check' },{ id:'reprint',label:'Reprint' },
      { id:'lock-pos',label:'Lock POS' },{ id:'close-session',label:'Close Session' },
    ];
    const devTypes = ['Receipt Printer','Kitchen Printer','Label Printer','Barcode Scanner','Cash Drawer','Card Terminal','Customer Display'];
    const portTypes = ['USB','COM Port','Network / IP','Bluetooth','Serial'];

    const tabs = [
      { id:'layout',    label:'Manage Layouts', icon:<LayoutGrid className="h-4 w-4" /> },
      { id:'behavior',  label:'Behavior',       icon:<Shield className="h-4 w-4" /> },
      { id:'devices',   label:'Devices',        icon:<Printer className="h-4 w-4" /> },
      { id:'templates', label:'Print Templates',icon:<FileText className="h-4 w-4" /> },
      { id:'terminals', label:'Terminals',      icon:<Hash className="h-4 w-4" /> },
    ];

    const loadTerminals = async () => {
      const branchId = currentTerminal?.branchId;
      if (!branchId) return;
      setTerminalsLoading(true);
      try {
        const data = await getAllPosTerminals(branchId);
        setTerminalList(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn('Failed to load terminals', e);
      } finally {
        setTerminalsLoading(false);
      }
    };

    const startEdit = (t) => {
      setEditingTerminalId(t.terminalId);
      setEditTerminalName(t.terminalName || '');
      setEditCounterName(t.counterName || '');
    };

    const cancelEdit = () => {
      setEditingTerminalId(null);
      setEditTerminalName('');
      setEditCounterName('');
    };

    const saveRename = async (terminalId) => {
      setTerminalSaving(true);
      try {
        const updated = await renamePosTerminal(terminalId, {
          terminalName: editTerminalName,
          counterName: editCounterName,
        });
        setTerminalList(prev => prev.map(t => t.terminalId === terminalId ? updated : t));
        // If this is the active terminal, update session display too
        if (currentTerminal?.terminalId === terminalId) {
          setCurrentTerminal(prev => ({ ...prev, terminalName: updated.terminalName, counterName: updated.counterName }));
        }
        cancelEdit();
      } catch (e) {
        console.warn('Rename failed', e);
      } finally {
        setTerminalSaving(false);
      }
    };

    const toggleTerminalStatus = async (t) => {
      const newStatus = t.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
      try {
        const updated = await setTerminalStatus(t.terminalId, newStatus);
        setTerminalList(prev => prev.map(x => x.terminalId === t.terminalId ? updated : x));
      } catch (e) {
        console.warn('Status change failed', e);
      }
    };

    const terminalLabel = [
      currentTerminal?.branchName,
      currentTerminal?.terminalName || currentTerminal?.terminalId,
      currentTerminal?.counterName,
    ].filter(Boolean).join(' · ');

    return (
      <div className="min-h-screen bg-[#F7F7FA]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={()=>setCurrentView('dashboard')}
                className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#1E293B] border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
                <ChevronRight className="h-4 w-4 rotate-180" />Dashboard
              </button>
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-3 rounded-xl">
                  <Settings className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-[#1E293B] leading-none">BillBull Console</h1>
                  <p className="text-xs text-gray-400 mt-0.5">Layouts · Devices · Print Templates</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {terminalLabel && (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <span className="text-xs font-semibold text-[#1E293B]">{terminalLabel}</span>
                </div>
              )}
              {/* Contextual save button — only when on a tab that has saves */}
              {consoleTab === 'templates' && (
                <button disabled={settingsSaving} onClick={async()=>{
                  setSettingsSaving(true);
                  try {
                    const tplConfig = JSON.stringify({
                      outletName:tplOutletName,outletTrn:tplOutletTrn,outletAddress:tplOutletAddress,outletPhone:tplOutletPhone,
                      logoDataUrl:tplLogoDataUrl,stampDataUrl:tplStampDataUrl,
                      receiptHeader:tplReceiptHeader,receiptFooter:tplReceiptFooter,receiptPaper:tplReceiptPaper,
                      receiptShowLogo:tplReceiptShowLogo,receiptShowTrn:tplReceiptShowTrn,receiptShowStamp:tplReceiptShowStamp,receiptShowBarcode:tplReceiptShowBarcode,
                      receiptShowCompanyDetails:tplReceiptShowCompanyDetails,receiptShowCustomerDetails:tplReceiptShowCustomerDetails,
                      receiptColItemCode:tplReceiptColItemCode,receiptColItemImage:tplReceiptColItemImage,receiptColBatchNo:tplReceiptColBatchNo,receiptColDiscount:tplReceiptColDiscount,receiptColVatPct:tplReceiptColVatPct,receiptColVatAmt:tplReceiptColVatAmt,
                      receiptShowGrandTotalBanner:tplReceiptShowGrandTotalBanner,receiptShowTerms:tplReceiptShowTerms,receiptShowNotes:tplReceiptShowNotes,receiptShowBankDetails:tplReceiptShowBankDetails,receiptShowQRCode:tplReceiptShowQRCode,receiptShowSignature:tplReceiptShowSignature,
                      invoiceHeader:tplInvoiceHeader,invoiceFooter:tplInvoiceFooter,invoicePaper:tplInvoicePaper,
                      invoiceShowLogo:tplInvoiceShowLogo,invoiceShowCompanyDetails:tplInvoiceShowCompanyDetails,invoiceShowTrn:tplInvoiceShowTrn,
                      invoiceShowCustomerDetails:tplInvoiceShowCustomerDetails,invoiceShowStamp:tplInvoiceShowStamp,invoiceShowSignature:tplInvoiceShowSignature,
                      invoiceShowGrandTotalBanner:tplInvoiceShowGrandTotalBanner,invoiceShowTerms:tplInvoiceShowTerms,invoiceShowNotes:tplInvoiceShowNotes,
                      invoiceShowBankDetails:tplInvoiceShowBankDetails,invoiceShowQRCode:tplInvoiceShowQRCode,
                      invoiceColItemCode:tplInvoiceColItemCode,invoiceColItemImage:tplInvoiceColItemImage,invoiceColBarcode:tplInvoiceColBarcode,
                      invoiceColBatchNo:tplInvoiceColBatchNo,invoiceColDiscount:tplInvoiceColDiscount,invoiceColVatPct:tplInvoiceColVatPct,invoiceColVatAmt:tplInvoiceColVatAmt,
                      returnHeader:tplReturnHeader,returnFooter:tplReturnFooter,returnPaper:tplReturnPaper,
                      returnShowLogo:tplReturnShowLogo,returnShowTrn:tplReturnShowTrn,returnShowStamp:tplReturnShowStamp,
                      returnShowCompanyDetails:tplReturnShowCompanyDetails,returnShowCustomerDetails:tplReturnShowCustomerDetails,
                      returnColItemCode:tplReturnColItemCode,returnColBatchNo:tplReturnColBatchNo,returnColDiscount:tplReturnColDiscount,returnColVatPct:tplReturnColVatPct,returnColVatAmt:tplReturnColVatAmt,
                      returnShowGrandTotalBanner:tplReturnShowGrandTotalBanner,returnShowTerms:tplReturnShowTerms,returnShowNotes:tplReturnShowNotes,returnShowQRCode:tplReturnShowQRCode,returnShowSignature:tplReturnShowSignature,
                      jobCardFooter:tplJobCardFooter,jobCardPaper:tplJobCardPaper,
                      jobCardShowLogo:tplJobCardShowLogo,jobCardShowTrn:tplJobCardShowTrn,jobCardShowStamp:tplJobCardShowStamp,
                      jobCardShowCompanyDetails:tplJobCardShowCompanyDetails,jobCardShowCustomerDetails:tplJobCardShowCustomerDetails,
                      jobCardShowSerialNumber:tplJobCardShowSerialNumber,jobCardShowWarranty:tplJobCardShowWarranty,jobCardShowTechnician:tplJobCardShowTechnician,
                      jobCardShowExpectedDate:tplJobCardShowExpectedDate,jobCardShowCustomerSignature:tplJobCardShowCustomerSignature,jobCardShowTerms:tplJobCardShowTerms,
                    });
                    const saved = await savePosSettings({ ...(posSettings||{}), printTemplateConfig: tplConfig });
                    setPosSettings(saved);
                    setSettingsSavedFlash(true);
                    setTimeout(()=>setSettingsSavedFlash(false), 2000);
                  } catch(e){ console.warn('Template save failed',e); } finally { setSettingsSaving(false); }
                }}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Templates'}
                </button>
              )}
              {consoleTab === 'layout' && (
                <button disabled={settingsSaving} onClick={async()=>{
                  setSettingsSaving(true);
                  try {
                    const saved = await savePosSettings({
                      ...(posSettings||{}),
                      defaultLayout: posTemplate,
                      layoutHideCategoryPanel: hideCategoriesPanel,
                      layoutHideItemsPanel: hideItemsPanel,
                      layoutHiddenPanelButtons: [...hiddenPanelButtons].join(','),
                    });
                    setPosSettings(saved);
                    setSettingsSavedFlash(true);
                    setTimeout(()=>setSettingsSavedFlash(false), 2000);
                  } catch(e){ console.warn('Layout save failed',e); } finally { setSettingsSaving(false); }
                }}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Layout'}
                </button>
              )}
              {consoleTab === 'behavior' && (
                <button type="button" onClick={handleSaveSettings} disabled={settingsSaving}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors">
                  <CheckCircle className="h-4 w-4" />{settingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
              )}
              {settingsSavedFlash && (
                <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />Saved
                </span>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-4">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>{ setConsoleTab(t.id); if(t.id==='terminals') loadTerminals(); if(t.id==='behavior') beginEditSettings(); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all ${consoleTab===t.id ? 'border-[#F5C742] text-[#1E293B] bg-[#F5C742]/5' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-8">

          {/* ══ MANAGE LAYOUTS ══ */}
          {consoleTab==='layout' && (
            <div className="space-y-6">

              {/* Layout Template */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><LayoutTemplate className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Layout Template
                </h3>
                <p className="text-xs text-gray-400 mb-4">Choose the POS screen layout for the billing terminal.</p>
                <div className="grid grid-cols-3 gap-3">
                  {([['classic','Classic','Standard 3-column layout'],['compact','Compact','Minimal sidebar layout'],['focus','Cart Focus','Full-screen cart mode']]).map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>setPosTemplate(val)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${posTemplate===val?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 hover:border-[#F5C742]/40'}`}>
                      <div className={`w-9 h-9 rounded-xl mb-3 flex items-center justify-center ${posTemplate===val?'bg-[#F5C742]':'bg-gray-100'}`}>
                        <Columns className={`h-4 w-4 ${posTemplate===val?'text-[#1E293B]':'text-gray-400'}`} />
                      </div>
                      <p className={`text-sm font-bold ${posTemplate===val?'text-[#1E293B]':'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      {posTemplate===val && <p className="text-[10px] font-bold text-[#b8920e] mt-2 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</p>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel Visibility */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Eye className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Panel Visibility
                </h3>
                <p className="text-xs text-gray-400 mb-4">Show or hide panels in the POS billing screen.</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {label:'Categories Bar', desc:'Left category navigation',state:hideCategoriesPanel,set:setHideCategoriesPanel},
                    {label:'Items Panel',    desc:'Product grid with search',state:hideItemsPanel,    set:setHideItemsPanel},
                  ].map(p=>(
                    <div key={p.label} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-[#1E293B]">{p.label}</p>
                        <p className="text-[10px] text-gray-400">{p.desc}</p>
                      </div>
                      <Switch checked={!p.state} onCheckedChange={v=>p.set(!v)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Zap className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Action Buttons
                </h3>
                <p className="text-xs text-gray-400 mb-4">Toggle which buttons appear in the Cart Focus functions panel.</p>
                <div className="grid grid-cols-2 gap-2">
                  {allBtnList.map(btn=>(
                    <div key={btn.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-[#1E293B]">{btn.label}</span>
                      <Switch checked={!hiddenPanelButtons.has(btn.id)} onCheckedChange={()=>togglePanelButton(btn.id)} />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ══ BEHAVIOR ══ */}
          {consoleTab==='behavior' && (() => {
            const d = settingsDraft || {
              requireSupervisorForVoid: !!posSettings?.requireSupervisorForVoid,
              supervisorApprovalMode: posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN',
              supervisorPin: posSettings?.supervisorPin || '',
              voidMode: posSettings?.voidMode === 'DELETE' ? 'DELETE' : 'VOID',
              cartViewMode: posSettings?.cartViewMode === 'DETAILED' ? 'DETAILED' : 'MINIMAL',
              cartShowBarcode: posSettings?.cartShowBarcode !== false,
              cartShowProductCode: posSettings?.cartShowProductCode !== false,
              cartShowBatchNumber: posSettings?.cartShowBatchNumber !== false,
              cartShowSerialNumber: !!posSettings?.cartShowSerialNumber,
              cartShowExpiryDate: !!posSettings?.cartShowExpiryDate,
              cashDrawerTriggers: posSettings?.cashDrawerTriggers ?? 'CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN',
            };
            const patch = (changes) => setSettingsDraft({ ...d, ...changes });
            const credLabel = d.supervisorApprovalMode === 'PASSWORD' ? 'Supervisor Password' : 'Supervisor PIN';

            // Cash drawer trigger config — MANUAL_OPEN is always on (explicit action).
            const drawerTriggerKeys = String(d.cashDrawerTriggers || '').split(',').map(t => t.trim()).filter(Boolean);
            const hasTrigger = (key) => drawerTriggerKeys.includes(key);
            const toggleTrigger = (key) => {
              const next = hasTrigger(key)
                ? drawerTriggerKeys.filter(t => t !== key)
                : [...drawerTriggerKeys, key];
              patch({ cashDrawerTriggers: next.join(',') });
            };
            const cartFieldToggles = [
              ['cartShowBarcode', 'Barcode'],
              ['cartShowProductCode', 'Product Code'],
              ['cartShowBatchNumber', 'Batch Number'],
              ['cartShowSerialNumber', 'Serial Number'],
              ['cartShowExpiryDate', 'Expiry Date'],
            ];
            const drawerTriggers = [
              ['CASH_PAYMENT', 'Successful Cash Payment Completion'],
              ['RECEIPT_PRINT', 'Receipt Printing'],
              ['CHANGE_RETURN', 'Change Return Transaction'],
              ['CASH_SETTLEMENT', 'Cash Settlement Selection'],
              ['CASH_DROP', 'Cash Drop'],
              ['CASH_OUT', 'Cash Out'],
              ['MANUAL_OPEN', 'Manual Supervisor Open'],
            ];
            return (
            <div className="space-y-6">

              {/* Item Removal / Supervisor approval */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Shield className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Item Removal
                </h3>
                <p className="text-xs text-gray-400 mb-4">Control how cashiers remove items from a bill.</p>

                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl mb-3">
                  <div>
                    <p className="text-sm font-medium text-[#1E293B]">Require Supervisor Authorization for Item Removal</p>
                    <p className="text-[10px] text-gray-400">Cashier cannot remove items without supervisor approval.</p>
                  </div>
                  <Switch checked={d.requireSupervisorForVoid} onCheckedChange={v=>patch({ requireSupervisorForVoid: v })} />
                </div>

                {d.requireSupervisorForVoid && (
                  <div className="grid grid-cols-2 gap-3 mb-1">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Approval Method</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[['PIN','PIN'],['PASSWORD','Password']].map(([val,lbl])=>(
                          <button key={val} type="button" onClick={()=>patch({ supervisorApprovalMode: val })}
                            className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${d.supervisorApprovalMode===val?'border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B]':'border-gray-200 text-gray-500 hover:border-[#F5C742]/40'}`}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">{credLabel}</label>
                      <input
                        type="password"
                        value={d.supervisorPin}
                        onChange={e=>patch({ supervisorPin: e.target.value })}
                        maxLength={d.supervisorApprovalMode==='PIN' ? 8 : 64}
                        placeholder={d.supervisorApprovalMode==='PIN' ? 'e.g. 1234' : 'Manager password'}
                        className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Void behavior */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><XCircle className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Removal Behavior
                </h3>
                <p className="text-xs text-gray-400 mb-4">Decide what happens to a line when the cashier removes it.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['VOID','Void (recommended)','Mark in red + strike-through, keep on receipt, audit log & reports.'],
                    ['DELETE','Delete','Remove the line entirely. Not recorded.'],
                  ].map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>patch({ voidMode: val })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${d.voidMode===val?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 hover:border-[#F5C742]/40'}`}>
                      <p className={`text-sm font-bold ${d.voidMode===val?'text-[#1E293B]':'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      {d.voidMode===val && <p className="text-[10px] font-bold text-[#b8920e] mt-2 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</p>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart display */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><ShoppingCart className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Cart Display
                </h3>
                <p className="text-xs text-gray-400 mb-4">Choose how much detail each cart line shows the cashier.</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    ['MINIMAL','Minimal','Item name, qty & price only. Fastest, cleanest cart.'],
                    ['DETAILED','Detailed','Show extra item identifiers per line (configured below).'],
                  ].map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>patch({ cartViewMode: val })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${d.cartViewMode===val?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 hover:border-[#F5C742]/40'}`}>
                      <p className={`text-sm font-bold ${d.cartViewMode===val?'text-[#1E293B]':'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      {d.cartViewMode===val && <p className="text-[10px] font-bold text-[#b8920e] mt-2 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</p>}
                    </button>
                  ))}
                </div>
                <div className={`transition-opacity ${d.cartViewMode==='DETAILED' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Fields to display per line</p>
                  <div className="grid grid-cols-2 gap-2">
                    {cartFieldToggles.map(([key,label])=>(
                      <div key={key} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-[#1E293B]">{label}</span>
                        <Switch checked={!!d[key]} onCheckedChange={v=>patch({ [key]: v })} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cash drawer control */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-bold text-[#1E293B] mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#F5C742]/20 flex items-center justify-center"><Wallet className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  Cash Drawer Control
                </h3>
                <p className="text-xs text-gray-400 mb-4">The drawer opens only for the events you enable here.</p>
                <div className="grid grid-cols-1 gap-2">
                  {drawerTriggers.map(([key,label])=>{
                    const locked = key === 'MANUAL_OPEN'; // always available — explicit action
                    return (
                      <div key={key} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-[#1E293B]">{label}{locked && <span className="ml-2 text-[10px] text-gray-400">(always on)</span>}</span>
                        <Switch checked={locked || hasTrigger(key)} disabled={locked} onCheckedChange={()=>toggleTrigger(key)} />
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
            );
          })()}

          {/* ══ DEVICES ══ */}
          {consoleTab==='devices' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Connected Devices</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Manage printers, scanners, cash drawers and card terminals.</p>
                </div>
                <button onClick={()=>setShowAddDevice(true)}
                  className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                  <Plus className="h-4 w-4" />Add Device
                </button>
              </div>

              <div className="space-y-3">
                {consoleDevices.map(dev=>{
                  const devIcon = {
                    'Receipt Printer':<Printer className="h-5 w-5" />,'Kitchen Printer':<Printer className="h-5 w-5" />,
                    'Label Printer':<Printer className="h-5 w-5" />,'Barcode Scanner':<Search className="h-5 w-5" />,
                    'Cash Drawer':<Wallet className="h-5 w-5" />,'Card Terminal':<CreditCard className="h-5 w-5" />,
                    'Customer Display':<Eye className="h-5 w-5" />,
                  };
                  return (
                    <div key={dev.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${dev.status==='Online'?'bg-[#F5C742]/15 text-[#b8920e]':'bg-gray-100 text-gray-400'}`}>
                        {devIcon[dev.type]||<Package className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1E293B]">{dev.name}</p>
                        <p className="text-xs text-gray-400">{dev.type} · {dev.port}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${dev.status==='Online'?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dev.status==='Online'?'bg-green-500':'bg-red-500'}`}/>{dev.status}
                      </span>
                      <button className="text-xs border border-[#F5C742]/50 text-[#b8920e] px-3 py-1.5 rounded-lg hover:bg-[#F5C742]/10 font-semibold transition-colors">Test</button>
                      <button onClick={()=>setConsoleDevices(d=>d.filter(x=>x.id!==dev.id))} className="text-gray-300 hover:text-red-500 transition-colors ml-1"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
                {consoleDevices.length===0 && (
                  <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                    <Printer className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No devices configured</p>
                    <p className="text-xs text-gray-300 mt-1">Click "Add Device" to get started.</p>
                  </div>
                )}
              </div>

              {/* Quick-add cards */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Add</p>
                <div className="grid grid-cols-4 gap-3">
                  {[['Receipt Printer',<Printer className="h-5 w-5"/>],['Barcode Scanner',<Search className="h-5 w-5"/>],['Cash Drawer',<Wallet className="h-5 w-5"/>],['Card Terminal',<CreditCard className="h-5 w-5"/>]].map(([label,icon])=>(
                    <button key={label} type="button" onClick={()=>{setNewDevType(label);setShowAddDevice(true);}}
                      className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#F5C742]/60 p-4 text-center flex flex-col items-center gap-2 transition-all hover:bg-[#F5C742]/5">
                      <div className="w-10 h-10 rounded-xl bg-[#F5C742]/10 flex items-center justify-center text-[#b8920e]">{icon}</div>
                      <p className="text-xs font-semibold text-gray-600">{label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Device dialog */}
              {showAddDevice && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-base font-bold text-[#1E293B]">Add New Device</h3>
                      <button onClick={()=>setShowAddDevice(false)}><X className="h-5 w-5 text-gray-400" /></button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Type</label>
                        <select value={newDevType} onChange={e=>setNewDevType(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {devTypes.map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Device Name / Model</label>
                        <input value={newDevName} onChange={e=>setNewDevName(e.target.value)} placeholder="e.g. Epson TM-T82III" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Connection</label>
                        <select value={newDevPort} onChange={e=>setNewDevPort(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]">
                          {portTypes.map(p=><option key={p}>{p}</option>)}
                        </select>
                      </div>
                      {newDevPort==='Network / IP' && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">IP Address</label>
                          <input value={newDevIp} onChange={e=>setNewDevIp(e.target.value)} placeholder="192.168.1.x" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={()=>setShowAddDevice(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
                      <button onClick={()=>{
                        if(newDevName.trim()){setConsoleDevices(d=>[...d,{id:`d${Date.now()}`,type:newDevType,name:newDevName,port:newDevPort,status:'Offline'}]);setNewDevName('');setShowAddDevice(false);}
                      }} className="flex-1 py-2.5 rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        <Plus className="h-4 w-4" />Add Device
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PRINT TEMPLATES ══ */}
          {consoleTab==='templates' && (
            <div className="space-y-5">

              {/* ── Outlet / Company Info ── */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1E293B] leading-none">Outlet / Company Info</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Appears on all document types</p>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex gap-8">
                    <div className="flex-1 grid grid-cols-2 gap-x-5 gap-y-4">
                      {[{l:'Company Name',v:tplOutletName,s:setTplOutletName},{l:'TRN',v:tplOutletTrn,s:setTplOutletTrn},{l:'Address',v:tplOutletAddress,s:setTplOutletAddress},{l:'Phone',v:tplOutletPhone,s:setTplOutletPhone}].map(f=>(
                        <div key={f.l}>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{f.l}</label>
                          <input value={f.v} onChange={e=>f.s(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                        </div>
                      ))}
                    </div>
                    <div className="shrink-0 flex flex-col gap-4 justify-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Branding</p>
                      <div className="flex gap-4">
                        <ImageUploadBox label="Logo" value={tplLogoDataUrl} onChange={setTplLogoDataUrl} hint="PNG · SVG · JPG" />
                        <ImageUploadBox label="Stamp" value={tplStampDataUrl} onChange={setTplStampDataUrl} hint="PNG · SVG · JPG" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Template picker + detail panel ── */}
              <div className="flex gap-4 items-start">

                {/* Left nav — template types */}
                <div className="shrink-0 w-48 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Templates</p>
                  </div>
                  <div className="p-2 space-y-1">
                    {[
                      {id:'receipt',   label:'Receipt',          icon:<Printer className="h-4 w-4" />},
                      {id:'invoice',   label:'Tax Invoice',      icon:<FileText className="h-4 w-4" />},
                      {id:'return',    label:'Return / CN',      icon:<RotateCcw className="h-4 w-4" />},
                      {id:'jobcard',   label:'Service Job Card', icon:<Wrench className="h-4 w-4" />},
                    ].map(item=>(
                      <button key={item.id} onClick={()=>setTemplateSubTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-all ${templateSubTab===item.id?'bg-[#F5C742]/15 text-[#1E293B]':'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                        <span className={templateSubTab===item.id?'text-[#b8920e]':'text-gray-400'}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right detail panel */}
                <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                  {/* ── Receipt ── */}
                  {templateSubTab==='receipt' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Printer className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Receipt</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">POS sale confirmation slip</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplReceiptPaper} onChange={setTplReceiptPaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplReceiptPaper==='A4'?'w-[560px]':tplReceiptPaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplReceiptPaper} Preview</span>
                        {tplReceiptPaper==='A4'
                          ? <A4LivePreview category="Sales Invoice" companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplReceiptFooter} scale={0.655}
                              toggles={{ showLogo:tplReceiptShowLogo, showCompanyDetails:tplReceiptShowCompanyDetails, showTrn:tplReceiptShowTrn, showCustomerDetails:tplReceiptShowCustomerDetails, showTerms:tplReceiptShowTerms, showNotes:tplReceiptShowNotes, showBankDetails:tplReceiptShowBankDetails, showQRCode:tplReceiptShowQRCode, showStamp:tplReceiptShowStamp, showSignature:tplReceiptShowSignature, showGrandTotalBanner:tplReceiptShowGrandTotalBanner, colItemCode:tplReceiptColItemCode, colItemImage:tplReceiptColItemImage, colBarcode:tplReceiptShowBarcode, colBatchNo:tplReceiptColBatchNo, colDiscount:tplReceiptColDiscount, colVatPct:tplReceiptColVatPct, colVatAmt:tplReceiptColVatAmt, logoDataUrl:tplLogoDataUrl, stampDataUrl:tplStampDataUrl }} />
                          : <ThermalMock paperSize={tplReceiptPaper} lines={[tplOutletName,tplReceiptShowTrn?`TRN: ${tplOutletTrn}`:'','─────────────',tplReceiptHeader||'','INV: SI-POS-000001','22 Jun 2026  10:30 AM','─────────────','Samsung A55 x1 . AED 1,380','iPhone Case x2 ... AED 45','─────────────','Subtotal ...... AED 1,425','VAT 5% ........... AED 71','─────────────','TOTAL: AED 1,496.25','─────────────',tplReceiptFooter]} />
                        }
                        <button onClick={()=>printHtml(tplReceiptPaper==='A4'
                          ? buildDocumentPreviewHtml('Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplReceiptFooter})
                          : buildThermalPrintHtml(tplReceiptPaper,{companyName:tplOutletName,trn:tplOutletTrn,header:tplReceiptHeader,footer:tplReceiptFooter,showTrn:tplReceiptShowTrn})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Header Text</label>
                            <input value={tplReceiptHeader} onChange={e=>setTplReceiptHeader(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Footer Text</label>
                            <input value={tplReceiptFooter} onChange={e=>setTplReceiptFooter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        {tplReceiptPaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplReceiptShowLogo,s:setTplReceiptShowLogo},{l:'Show Company Name & Address',v:tplReceiptShowCompanyDetails,s:setTplReceiptShowCompanyDetails},{l:'Show TRN',v:tplReceiptShowTrn,s:setTplReceiptShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details (Bill To)',v:tplReceiptShowCustomerDetails,s:setTplReceiptShowCustomerDetails}]},
                              {label:'Items Table',    items:[{l:'Item Code',v:tplReceiptColItemCode,s:setTplReceiptColItemCode},{l:'Item Image',v:tplReceiptColItemImage,s:setTplReceiptColItemImage},{l:'Batch Number',v:tplReceiptColBatchNo,s:setTplReceiptColBatchNo},{l:'Discount Column',v:tplReceiptColDiscount,s:setTplReceiptColDiscount},{l:'VAT % Column',v:tplReceiptColVatPct,s:setTplReceiptColVatPct},{l:'VAT Amount Column',v:tplReceiptColVatAmt,s:setTplReceiptColVatAmt},{l:'Barcode Column',v:tplReceiptShowBarcode,s:setTplReceiptShowBarcode}]},
                              {label:'Footer & Summary',items:[{l:'Show Grand Total Banner',v:tplReceiptShowGrandTotalBanner,s:setTplReceiptShowGrandTotalBanner},{l:'Show Terms & Conditions',v:tplReceiptShowTerms,s:setTplReceiptShowTerms},{l:'Show Notes',v:tplReceiptShowNotes,s:setTplReceiptShowNotes},{l:'Show Bank Details',v:tplReceiptShowBankDetails,s:setTplReceiptShowBankDetails},{l:'Show QR Code',v:tplReceiptShowQRCode,s:setTplReceiptShowQRCode},{l:'Show Stamp',v:tplReceiptShowStamp,s:setTplReceiptShowStamp},{l:'Show Authorized Signature',v:tplReceiptShowSignature,s:setTplReceiptShowSignature}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplReceiptShowLogo,s:setTplReceiptShowLogo},{l:'Show TRN',v:tplReceiptShowTrn,s:setTplReceiptShowTrn},{l:'Show Stamp',v:tplReceiptShowStamp,s:setTplReceiptShowStamp},{l:'Show Barcode / QR',v:tplReceiptShowBarcode,s:setTplReceiptShowBarcode}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                  {/* ── Tax Invoice ── */}
                  {templateSubTab==='invoice' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Tax Invoice</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">VAT-compliant customer invoice</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplInvoicePaper} onChange={setTplInvoicePaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplInvoicePaper==='A4'?'w-[560px]':tplInvoicePaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplInvoicePaper} Preview</span>
                        {tplInvoicePaper==='A4'
                          ? <A4LivePreview category="Sales Invoice" companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplInvoiceFooter} scale={0.655}
                              toggles={{ showLogo:tplInvoiceShowLogo, showCompanyDetails:tplInvoiceShowCompanyDetails, showTrn:tplInvoiceShowTrn, showCustomerDetails:tplInvoiceShowCustomerDetails, showTerms:tplInvoiceShowTerms, showNotes:tplInvoiceShowNotes, showBankDetails:tplInvoiceShowBankDetails, showQRCode:tplInvoiceShowQRCode, showStamp:tplInvoiceShowStamp, showSignature:tplInvoiceShowSignature, showGrandTotalBanner:tplInvoiceShowGrandTotalBanner, colItemCode:tplInvoiceColItemCode, colItemImage:tplInvoiceColItemImage, colBarcode:tplInvoiceColBarcode, colBatchNo:tplInvoiceColBatchNo, colDiscount:tplInvoiceColDiscount, colVatPct:tplInvoiceColVatPct, colVatAmt:tplInvoiceColVatAmt, logoDataUrl:tplLogoDataUrl, stampDataUrl:tplStampDataUrl }} />
                          : <ThermalMock paperSize={tplInvoicePaper} lines={[tplInvoiceHeader||'TAX INVOICE',tplOutletName,`TRN: ${tplOutletTrn}`,tplOutletAddress,'─────────────','INV: SI-POS-000001','22 Jun 2026','Cust: Fatima Hassan','─────────────','Samsung A55 x1 . AED 1,380','VAT 5% ............. AED 69','─────────────','TOTAL: AED 1,449.00','─────────────',tplInvoiceFooter]} />
                        }
                        <button onClick={()=>printHtml(tplInvoicePaper==='A4'
                          ? buildDocumentPreviewHtml('Sales Invoice',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplInvoiceFooter})
                          : buildThermalPrintHtml(tplInvoicePaper,{companyName:tplOutletName,trn:tplOutletTrn,header:tplInvoiceHeader,footer:tplInvoiceFooter,showTrn:true})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Header Title</label>
                            <input value={tplInvoiceHeader} onChange={e=>setTplInvoiceHeader(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Footer Note / Terms</label>
                            <input value={tplInvoiceFooter} onChange={e=>setTplInvoiceFooter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        {tplInvoicePaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplInvoiceShowLogo,s:setTplInvoiceShowLogo},{l:'Show Company Name & Address',v:tplInvoiceShowCompanyDetails,s:setTplInvoiceShowCompanyDetails},{l:'Show TRN',v:tplInvoiceShowTrn,s:setTplInvoiceShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details (Bill To)',v:tplInvoiceShowCustomerDetails,s:setTplInvoiceShowCustomerDetails}]},
                              {label:'Items Table',    items:[{l:'Item Code',v:tplInvoiceColItemCode,s:setTplInvoiceColItemCode},{l:'Item Image',v:tplInvoiceColItemImage,s:setTplInvoiceColItemImage},{l:'Barcode Column',v:tplInvoiceColBarcode,s:setTplInvoiceColBarcode},{l:'Batch Number',v:tplInvoiceColBatchNo,s:setTplInvoiceColBatchNo},{l:'Discount Column',v:tplInvoiceColDiscount,s:setTplInvoiceColDiscount},{l:'VAT % Column',v:tplInvoiceColVatPct,s:setTplInvoiceColVatPct},{l:'VAT Amount Column',v:tplInvoiceColVatAmt,s:setTplInvoiceColVatAmt}]},
                              {label:'Footer & Summary',items:[{l:'Show Grand Total Banner',v:tplInvoiceShowGrandTotalBanner,s:setTplInvoiceShowGrandTotalBanner},{l:'Show Terms & Conditions',v:tplInvoiceShowTerms,s:setTplInvoiceShowTerms},{l:'Show Notes',v:tplInvoiceShowNotes,s:setTplInvoiceShowNotes},{l:'Show Bank Details',v:tplInvoiceShowBankDetails,s:setTplInvoiceShowBankDetails},{l:'Show QR Code',v:tplInvoiceShowQRCode,s:setTplInvoiceShowQRCode},{l:'Show Stamp',v:tplInvoiceShowStamp,s:setTplInvoiceShowStamp},{l:'Show Authorized Signature',v:tplInvoiceShowSignature,s:setTplInvoiceShowSignature}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplInvoiceShowLogo,s:setTplInvoiceShowLogo},{l:'Show TRN',v:tplInvoiceShowTrn,s:setTplInvoiceShowTrn},{l:'Show Stamp',v:tplInvoiceShowStamp,s:setTplInvoiceShowStamp},{l:'Show Barcode / QR',v:tplInvoiceShowQRCode,s:setTplInvoiceShowQRCode}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                  {/* ── Return / Credit Note ── */}
                  {templateSubTab==='return' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><RotateCcw className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Return / Credit Note</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">Refund and credit note document</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplReturnPaper} onChange={setTplReturnPaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplReturnPaper==='A4'?'w-[560px]':tplReturnPaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplReturnPaper} Preview</span>
                        {tplReturnPaper==='A4'
                          ? <A4LivePreview category="Sales Return" companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplReturnFooter} scale={0.655}
                              toggles={{ showLogo:tplReturnShowLogo, showCompanyDetails:tplReturnShowCompanyDetails, showTrn:tplReturnShowTrn, showCustomerDetails:tplReturnShowCustomerDetails, showTerms:tplReturnShowTerms, showNotes:tplReturnShowNotes, showBankDetails:false, showQRCode:tplReturnShowQRCode, showStamp:tplReturnShowStamp, showSignature:tplReturnShowSignature, showGrandTotalBanner:tplReturnShowGrandTotalBanner, colItemCode:tplReturnColItemCode, colBatchNo:tplReturnColBatchNo, colDiscount:tplReturnColDiscount, colVatPct:tplReturnColVatPct, colVatAmt:tplReturnColVatAmt, logoDataUrl:tplLogoDataUrl, stampDataUrl:tplStampDataUrl }} />
                          : <ThermalMock paperSize={tplReturnPaper} lines={[tplReturnHeader||'SALES RETURN',tplOutletName,'─────────────','Return: SR-POS-000042','Orig: SI-POS-000108','22 Jun 2026','Cust: Fatima Hassan','─────────────','Samsung A55 x1 -AED 1,380','VAT Rev ......... -AED 69','─────────────','REFUND: AED 1,449.00','─────────────',tplReturnFooter]} />
                        }
                        <button onClick={()=>printHtml(tplReturnPaper==='A4'
                          ? buildDocumentPreviewHtml('Sales Return',{companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplReturnFooter})
                          : buildThermalPrintHtml(tplReturnPaper,{companyName:tplOutletName,trn:tplOutletTrn,header:tplReturnHeader,footer:tplReturnFooter,showTrn:true})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Header Title</label>
                            <input value={tplReturnHeader} onChange={e=>setTplReturnHeader(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Footer Note</label>
                            <input value={tplReturnFooter} onChange={e=>setTplReturnFooter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        {tplReturnPaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplReturnShowLogo,s:setTplReturnShowLogo},{l:'Show Company Name & Address',v:tplReturnShowCompanyDetails,s:setTplReturnShowCompanyDetails},{l:'Show TRN',v:tplReturnShowTrn,s:setTplReturnShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details (Bill To)',v:tplReturnShowCustomerDetails,s:setTplReturnShowCustomerDetails}]},
                              {label:'Items Table',    items:[{l:'Item Code',v:tplReturnColItemCode,s:setTplReturnColItemCode},{l:'Batch Number',v:tplReturnColBatchNo,s:setTplReturnColBatchNo},{l:'Discount Column',v:tplReturnColDiscount,s:setTplReturnColDiscount},{l:'VAT % Column',v:tplReturnColVatPct,s:setTplReturnColVatPct},{l:'VAT Amount Column',v:tplReturnColVatAmt,s:setTplReturnColVatAmt}]},
                              {label:'Footer & Summary',items:[{l:'Show Grand Total Banner',v:tplReturnShowGrandTotalBanner,s:setTplReturnShowGrandTotalBanner},{l:'Show Terms & Conditions',v:tplReturnShowTerms,s:setTplReturnShowTerms},{l:'Show Notes',v:tplReturnShowNotes,s:setTplReturnShowNotes},{l:'Show QR Code',v:tplReturnShowQRCode,s:setTplReturnShowQRCode},{l:'Show Stamp',v:tplReturnShowStamp,s:setTplReturnShowStamp},{l:'Show Authorized Signature',v:tplReturnShowSignature,s:setTplReturnShowSignature}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplReturnShowLogo,s:setTplReturnShowLogo},{l:'Show TRN',v:tplReturnShowTrn,s:setTplReturnShowTrn},{l:'Show Stamp',v:tplReturnShowStamp,s:setTplReturnShowStamp}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                  {/* ── Service Job Card ── */}
                  {templateSubTab==='jobcard' && (<>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#F5C742]/20 flex items-center justify-center"><Wrench className="h-3.5 w-3.5 text-[#b8920e]" /></div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1E293B] leading-none">Service Job Card</h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">Repair and service tracking document</p>
                        </div>
                      </div>
                      <PaperSizePicker value={tplJobCardPaper} onChange={setTplJobCardPaper} />
                    </div>
                    <div className="flex min-h-[420px]">
                      <div className={`shrink-0 bg-[#F7F7FA] border-r border-gray-100 flex flex-col gap-3 p-5 transition-all ${tplJobCardPaper==='A4'?'w-[560px]':tplJobCardPaper==='80mm'?'w-[280px]':'w-[250px]'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{tplJobCardPaper} Preview</span>
                        {tplJobCardPaper==='A4'
                          ? <ServiceJobA4Preview companyName={tplOutletName} trn={tplOutletTrn} address={tplOutletAddress} phone={tplOutletPhone} footerNote={tplJobCardFooter} scale={0.655} />
                          : <ThermalMock paperSize={tplJobCardPaper} lines={['SERVICE JOB CARD',tplOutletName,'─────────────','Job: SRV-000028','22 Jun 2026','Tech: Mohammed Ali','─────────────','Cust: Fatima Hassan','Item: Samsung A55','S/N: SNSA55-20260312','Problem: Display issue','Warranty: Under Warranty','─────────────','Cust. Signature: _____','─────────────',tplJobCardFooter]} />
                        }
                        <button onClick={()=>printHtml(tplJobCardPaper==='A4'
                          ? buildServiceJobA4Html({companyName:tplOutletName,trn:tplOutletTrn,address:tplOutletAddress,phone:tplOutletPhone,footerNote:tplJobCardFooter})
                          : buildThermalPrintHtml(tplJobCardPaper,{companyName:tplOutletName,trn:tplOutletTrn,header:'SERVICE JOB CARD',footer:tplJobCardFooter,showTrn:true})
                        )} className="flex items-center gap-1.5 text-xs font-bold text-[#b8920e] bg-[#F5C742]/10 hover:bg-[#F5C742]/20 border border-[#F5C742]/30 rounded-lg px-3 py-1.5 transition-colors self-start mt-auto">
                          <Printer className="h-3 w-3" />Test Print
                        </button>
                      </div>
                      <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[560px]">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Terms / Footer</label>
                          <textarea value={tplJobCardFooter} onChange={e=>setTplJobCardFooter(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] bg-gray-50 focus:bg-white transition-colors resize-none" />
                        </div>
                        {tplJobCardPaper === 'A4' ? (
                          <div className="space-y-4">
                            {[
                              {label:'Company Header', items:[{l:'Show Logo',v:tplJobCardShowLogo,s:setTplJobCardShowLogo},{l:'Show Company Name & Address',v:tplJobCardShowCompanyDetails,s:setTplJobCardShowCompanyDetails},{l:'Show TRN',v:tplJobCardShowTrn,s:setTplJobCardShowTrn}]},
                              {label:'Customer',       items:[{l:'Show Customer Details',v:tplJobCardShowCustomerDetails,s:setTplJobCardShowCustomerDetails}]},
                              {label:'Job Details',    items:[{l:'Serial Number',v:tplJobCardShowSerialNumber,s:setTplJobCardShowSerialNumber},{l:'Warranty Status',v:tplJobCardShowWarranty,s:setTplJobCardShowWarranty},{l:'Assigned Technician',v:tplJobCardShowTechnician,s:setTplJobCardShowTechnician},{l:'Expected Completion Date',v:tplJobCardShowExpectedDate,s:setTplJobCardShowExpectedDate}]},
                              {label:'Footer',         items:[{l:'Show Terms & Conditions',v:tplJobCardShowTerms,s:setTplJobCardShowTerms},{l:'Customer Signature Line',v:tplJobCardShowCustomerSignature,s:setTplJobCardShowCustomerSignature},{l:'Show Stamp',v:tplJobCardShowStamp,s:setTplJobCardShowStamp}]},
                            ].map(group=>(
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {group.items.map(t=>(
                                    <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                      <span className="text-sm text-[#1E293B]">{t.l}</span>
                                      <Switch checked={t.v} onCheckedChange={t.s} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Display Options</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[{l:'Show Logo',v:tplJobCardShowLogo,s:setTplJobCardShowLogo},{l:'Show TRN',v:tplJobCardShowTrn,s:setTplJobCardShowTrn},{l:'Show Stamp',v:tplJobCardShowStamp,s:setTplJobCardShowStamp}].map(t=>(
                                <div key={t.l} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                                  <span className="text-sm text-[#1E293B]">{t.l}</span>
                                  <Switch checked={t.v} onCheckedChange={t.s} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>)}

                </div>
              </div>

            </div>
          )}

          {/* ══ TERMINALS ══ */}
          {consoleTab === 'terminals' && (
            <div className="space-y-6">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Terminal & Counter Management</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Rename terminals, set counter names, and block unused terminals for this branch.
                  </p>
                </div>
                <button
                  onClick={loadTerminals}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#1E293B] border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </div>

              {/* Info banner — explain how terminals are created */}
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">How terminals are registered: </span>
                  Each browser/device that opens POS Sales is auto-registered as a terminal using a device fingerprint.
                  Use this panel to give each terminal a meaningful name and counter number, or block terminals that are no longer in use.
                </div>
              </div>

              {/* Current terminal highlight */}
              {currentTerminal && (
                <div className="flex items-center gap-3 bg-[#F5C742]/10 border border-[#F5C742]/40 rounded-xl px-5 py-3">
                  <div className="w-2 h-2 rounded-full bg-[#F5C742] animate-pulse" />
                  <span className="text-sm text-[#7a6000] font-semibold">
                    This device is registered as&nbsp;
                    <span className="font-black text-[#1E293B]">{currentTerminal.terminalName || currentTerminal.terminalId}</span>
                    &nbsp;— Counter:&nbsp;
                    <span className="font-black text-[#1E293B]">{currentTerminal.counterName || '—'}</span>
                  </span>
                </div>
              )}

              {/* Terminal list */}
              {terminalsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-40 bg-gray-100 rounded" />
                        <div className="h-2.5 w-24 bg-gray-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : terminalList.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-14 text-center">
                  <Hash className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No terminals loaded</p>
                  <p className="text-xs text-gray-300 mt-1">Click Refresh to load terminals for this branch.</p>
                  <button
                    onClick={loadTerminals}
                    className="mt-4 text-sm font-semibold text-[#327F74] border border-[#327F74]/30 px-4 py-2 rounded-xl hover:bg-[#327F74]/5 transition-colors"
                  >
                    Load Terminals
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {terminalList.map(t => {
                    const isEditing = editingTerminalId === t.terminalId;
                    const isThisDevice = currentTerminal?.terminalId === t.terminalId;
                    const isBlocked = t.status === 'BLOCKED';

                    return (
                      <div
                        key={t.terminalId}
                        className={`bg-white rounded-2xl border shadow-sm transition-all ${
                          isThisDevice ? 'border-[#F5C742]/60 ring-1 ring-[#F5C742]/30' :
                          isBlocked    ? 'border-gray-100 opacity-60' : 'border-gray-200'
                        }`}
                      >
                        {/* View mode */}
                        {!isEditing && (
                          <div className="flex items-center gap-4 px-5 py-4">
                            {/* Icon */}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                              isBlocked ? 'bg-gray-100 text-gray-400' : 'bg-[#F5C742]/15 text-[#b8920e]'
                            }`}>
                              <Hash className="h-5 w-5" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-[#1E293B]">
                                  {t.terminalName || t.terminalId}
                                </span>
                                <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">
                                  {t.terminalId}
                                </span>
                                {isThisDevice && (
                                  <span className="text-[10px] font-black bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    This device
                                  </span>
                                )}
                                {t.isMainPos && (
                                  <span className="text-[10px] font-bold bg-[#327F74]/10 text-[#327F74] px-2 py-0.5 rounded-full">
                                    Main POS
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                                <span>Counter: <strong className="text-gray-600">{t.counterName || '—'}</strong></span>
                                <span>Registered by: <strong className="text-gray-600">{t.registeredBy || '—'}</strong></span>
                                {t.lastSeenAt && (
                                  <span>Last seen: <strong className="text-gray-600">{new Date(t.lastSeenAt).toLocaleString()}</strong></span>
                                )}
                              </div>
                            </div>

                            {/* Status badge */}
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 ${
                              isBlocked
                                ? 'bg-red-50 text-red-600'
                                : 'bg-green-50 text-green-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isBlocked ? 'bg-red-500' : 'bg-green-500'}`} />
                              {isBlocked ? 'Blocked' : 'Active'}
                            </span>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => startEdit(t)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-[#327F74] border border-[#327F74]/30 hover:bg-[#327F74]/5 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Wrench className="h-3.5 w-3.5" /> Rename
                              </button>
                              <button
                                onClick={() => toggleTerminalStatus(t)}
                                className={`flex items-center gap-1.5 text-xs font-semibold border px-3 py-1.5 rounded-lg transition-colors ${
                                  isBlocked
                                    ? 'text-green-700 border-green-200 hover:bg-green-50'
                                    : 'text-red-600 border-red-200 hover:bg-red-50'
                                }`}
                              >
                                {isBlocked ? <><Unlock className="h-3.5 w-3.5" /> Unblock</> : <><Lock className="h-3.5 w-3.5" /> Block</>}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Edit mode */}
                        {isEditing && (
                          <div className="px-5 py-4 space-y-4">
                            <p className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                              <Wrench className="h-4 w-4 text-[#F5C742]" />
                              Rename Terminal — <span className="font-mono text-gray-400 font-normal">{t.terminalId}</span>
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">Terminal Name</label>
                                <input
                                  type="text"
                                  value={editTerminalName}
                                  onChange={e => setEditTerminalName(e.target.value)}
                                  placeholder="e.g. Cashier Station 1"
                                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600">Counter Name</label>
                                <input
                                  type="text"
                                  value={editCounterName}
                                  onChange={e => setEditCounterName(e.target.value)}
                                  placeholder="e.g. Counter 1"
                                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40 bg-white"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-3 pt-1">
                              <button
                                onClick={() => saveRename(t.terminalId)}
                                disabled={terminalSaving}
                                className="flex items-center gap-2 bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-5 py-2 rounded-xl transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="h-4 w-4" />
                                {terminalSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-5 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary footer */}
              {terminalList.length > 0 && (
                <div className="flex items-center gap-6 text-xs text-gray-400 pt-2">
                  <span>{terminalList.length} terminal{terminalList.length !== 1 ? 's' : ''} total</span>
                  <span className="text-green-600 font-semibold">
                    {terminalList.filter(t => t.status === 'ACTIVE').length} active
                  </span>
                  <span className="text-red-500 font-semibold">
                    {terminalList.filter(t => t.status === 'BLOCKED').length} blocked
                  </span>
                  <span className="text-[#b8920e] font-semibold">
                    {terminalList.filter(t => t.isMainPos).length} main POS
                  </span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
  };

  // Touch Screen POS Interface
  const renderTouchScreen = () => (
    <div className="h-screen flex flex-col bg-[#F7F7FA]">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => setCurrentView('dashboard')}
              className="border-[#F5C742] text-[#F5C742] hover:bg-[#F5C742] hover:text-white"
            >
              ← Dashboard
            </Button>
            <div>
              <p className="text-[#1E293B]">Session: {currentSession?.id}</p>
              <p className="text-sm text-gray-600">
                {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPOSConfig(true)}
              className="border-[#327F74]/40 text-[#327F74]"
            >
              <Settings className="h-4 w-4 mr-1" />
              Configure
            </Button>
          </div>
        </div>
      </div>


      {/* Cart Focus: three-equal-column layout — saffron gradient + white theme */}
      {posTemplate === 'focus' ? (
        <div className="flex-1 flex overflow-hidden bg-white">

          {/* ══ COL 1: Cart / Bill ══════════════════════════════ */}
          <div className="flex-1 flex flex-col border-r-2 border-[#327F74]/30 min-w-0 bg-white">

            {/* Customer bar */}
            <div className="bg-[#F5C742] px-3 py-2.5 flex-shrink-0 relative border-b border-[#327F74]/30">
              <button type="button" onClick={() => setShowCustomerDropdown(v => !v)}
                className="w-full flex items-center justify-between gap-2 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    {selectedCustomerData?.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate leading-none">{selectedCustomerData?.name}</p>
                    {selectedCustomerData?.tier
                      ? <p className="text-[10px] text-white/80 mt-0.5">{selectedCustomerData.tier} · {selectedCustomerData.loyaltyPoints} pts</p>
                      : <p className="text-[10px] text-white/70 mt-0.5">Walk-in</p>}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-white/70 flex-shrink-0 transition-transform ${showCustomerDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showCustomerDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-[#327F74]/30 shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-[#327F74]/10">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input autoFocus type="text" placeholder="Search customer..." value={customerSearchQuery}
                        onChange={e => setCustomerSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-[#327F74]/30 rounded focus:outline-none focus:border-[#327F74]" />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {posCustomersLoading && (
                      <div className="px-3 py-3 text-xs text-gray-400">Loading customers...</div>
                    )}
                    {!posCustomersLoading && filteredCustomerOptions.map(customer => (
                      <button key={customer.id} type="button"
                        onClick={() => { setSelectedCustomer(customer.id); setShowCustomerDropdown(false); setCustomerSearchQuery(''); }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F5C742]/10 transition-colors text-left border-b border-[#327F74]/10 ${selectedCustomer === customer.id ? 'bg-[#F5C742]/10' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">{customer.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E293B] truncate">{customer.name}</p>
                          {customer.membershipId && <p className="text-[10px] text-gray-400">{customer.membershipId} {customer.tier ? `· ${customer.tier}` : ''}</p>}
                        </div>
                      </button>
                    ))}
                    {!posCustomersLoading && filteredCustomerOptions.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400">
                        {posCustomersError || 'No customers found'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cart table header */}
            <div className="bg-[#F5C742]/10 border-b border-[#327F74]/20 flex-shrink-0 grid grid-cols-12 gap-1 px-3 py-2">
              <span className="col-span-6 text-[10px] font-bold uppercase tracking-wide text-gray-500">Item</span>
              <span className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 text-center">Qty</span>
              <span className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 text-right">Rate</span>
              <span className="col-span-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 text-right">Amt</span>
              <span className="col-span-1"></span>
            </div>

            {/* Cart rows */}
            <div className="flex-1 overflow-y-auto">
              {currentInvoice.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300">
                  <ShoppingCart className="h-14 w-14 mb-3" />
                  <p className="text-sm font-medium text-gray-400">Scan a barcode to begin</p>
                </div>
              ) : (
                currentInvoice.items.map((item, idx) => {
                  return (
                    <div key={item.id} onClick={() => { if (posActionMode !== 'none' && !item.isVoided) setSelectedFocusItemId(item.id); }}
                      className={`grid grid-cols-12 gap-1 px-3 py-2 border-b border-[#327F74]/20 items-start ${item.isVoided ? 'bg-red-50/70 opacity-60' : selectedFocusItemId === item.id ? 'ring-2 ring-[#F5C742] bg-[#F5C742]/10' : idx % 2 === 1 ? 'bg-[#F5C742]/10' : 'bg-white'} ${posActionMode !== 'none' && !item.isVoided ? 'cursor-pointer' : ''}`}>
                      <div className="col-span-6 min-w-0">
                        <p className={`text-xs font-semibold leading-tight truncate ${item.isVoided ? 'line-through text-red-400' : 'text-[#1E293B]'}`}>{item.name}</p>
                        {item.isVoided
                          ? <p className="text-[9px] font-bold text-red-500">VOIDED</p>
                          : item.nameAr ? <p className="text-[10px] text-gray-400 leading-tight truncate" dir="rtl">{item.nameAr}</p> : null}
                        {!item.isVoided && (cartViewDetailed ? (
                          <div className="mt-0.5 space-y-px">
                            {cartLineDetails(item).map(d => (
                              <p key={d.label} className="text-[8px] font-mono text-gray-500 leading-tight truncate">
                                <span className="text-gray-400">{d.label}:</span> <span className="text-[#327F74] font-semibold">{d.value}</span>
                              </p>
                            ))}
                          </div>
                        ) : (
                          <>
                            <p className="text-[9px] font-mono text-[#F5C742] mt-0.5">{item.barcode || item.code || item.id}</p>
                            {item.pinnedBatchNumber && (
                              <span className="inline-block mt-0.5 px-1 py-px rounded bg-[#327F74]/10 text-[8px] font-mono font-bold text-[#327F74]">⛓ {item.pinnedBatchNumber}</span>
                            )}
                          </>
                        ))}
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-0.5 pt-0.5">
                        {!item.isVoided && <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity - 1); }}
                          className="w-5 h-5 rounded bg-gray-100 hover:bg-[#F5C742] hover:text-white text-gray-600 text-xs font-bold flex items-center justify-center transition-colors">−</button>}
                        <span className={`text-xs font-bold w-5 text-center ${item.isVoided ? 'text-red-400 line-through' : 'text-[#1E293B]'}`}>{item.quantity}</span>
                        {!item.isVoided && <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity + 1); }}
                          className="w-5 h-5 rounded bg-gray-100 hover:bg-[#F5C742] hover:text-white text-gray-600 text-xs font-bold flex items-center justify-center transition-colors">+</button>}
                      </div>
                      <span className={`col-span-2 text-[10px] text-right pt-1 ${item.isVoided ? 'text-red-300 line-through' : 'text-gray-400'}`}>{formatCurrency(item.price)}</span>
                      <span className={`col-span-1 text-xs font-bold text-right pt-1 ${item.isVoided ? 'text-red-400 line-through' : 'text-[#F5C742]'}`}>{formatCurrency(item.total)}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); voidFromInvoice(item.id); }}
                        className={`col-span-1 flex justify-center pt-1 transition-colors ${item.isVoided ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart footer — items count + invoice counter */}
            <div className="bg-[#F5C742] px-4 py-3 flex-shrink-0 border-t border-[#327F74]/30">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-white/70 tracking-wide">Items</p>
                    <p className="text-xl font-black text-white">{currentInvoice.items.reduce((s, i) => s + i.quantity, 0)}</p>
                  </div>
                  <div className="w-px bg-white/30"></div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-white/70 tracking-wide">Invoice #</p>
                    <p className="text-xl font-black text-white">{invoiceCounter + 1}</p>
                  </div>
                </div>
                <button type="button" onClick={guardedClearInvoice} disabled={currentInvoice.items.length === 0}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-30 transition-colors">
                  <X className="h-3.5 w-3.5" />Clear
                </button>
              </div>
            </div>
          </div>

          {/* ══ COL 2: Barcode Scan + Last Item + Keypad + Total ═ */}
          <div className="flex-1 flex flex-col border-r-2 border-[#327F74]/30 min-w-0 bg-white">

            {/* Barcode input */}
            <div className="bg-[#F5C742] px-4 py-3 flex-shrink-0 border-b border-[#327F74]/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 mb-2">
                {posActionMode === 'qty' ? 'Enter Quantity' : posActionMode === 'discount' ? 'Enter Discount' : 'Barcode / Loyalty Card'}
              </p>
              <div className="relative">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (posActionMode === 'qty' && selectedFocusItemId) {
                        const qty = parseInt(barcodeInput, 10);
                        if (qty > 0) updateQuantity(selectedFocusItemId, qty);
                        resetFocusMode();
                      } else if (posActionMode === 'discount' && selectedFocusItemId) {
                        const val = parseFloat(barcodeInput) || 0;
                        if (discountInputType === 'percent') {
                          updateDiscount(selectedFocusItemId, Math.min(val, 100));
                        } else {
                          const item = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                          if (item) {
                            const pct = Math.min((val / (item.price * item.quantity)) * 100, 100);
                            updateDiscount(selectedFocusItemId, pct);
                          }
                        }
                        resetFocusMode();
                      } else {
                        handleBarcodeScan(barcodeInput);
                      }
                    }
                  }}
                  placeholder="Scan  or  3 × BARCODE  for qty…"
                  className="w-full bg-white/20 border border-white/30 text-white placeholder-white/50 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-white focus:bg-white/30 pr-20"
                  autoFocus
                />
                <button type="button" onClick={() => handleBarcodeScan(barcodeInput)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white hover:bg-[#F5C742]/10 text-[#F5C742] text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                  ADD
                </button>
              </div>
              {barcodeScanFeedback && (
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                  barcodeScanFeedback.type === 'success' ? 'bg-green-500/20 text-white' :
                  barcodeScanFeedback.type === 'customer' ? 'bg-blue-500/20 text-white' : 'bg-red-500/20 text-white'
                }`}>
                  {barcodeScanFeedback.type === 'success' && <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                  {barcodeScanFeedback.type === 'customer' && <User className="h-3.5 w-3.5 flex-shrink-0" />}
                  {barcodeScanFeedback.type === 'error' && <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                  {barcodeScanFeedback.message}
                </div>
              )}
            </div>

            {/* Last scanned item — single item only */}
            <div className="px-4 py-3 border-b border-[#327F74]/20 flex-shrink-0 bg-[#F5C742]/10 min-h-[88px] flex items-center">
              {lastScannedItem ? (
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-xl bg-[#F5C742] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <CheckCircle className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1E293B] leading-tight truncate">{lastScannedItem.name}</p>
                    {lastScannedItem.nameAr && <p className="text-[11px] text-gray-400 leading-tight truncate" dir="rtl">{lastScannedItem.nameAr}</p>}
                    <p className="text-[10px] font-mono text-[#F5C742] mt-0.5">{lastScannedItem.barcode}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-[#F5C742]">{formatCurrency(lastScannedItem.total)}</p>
                    <p className="text-xs text-gray-400">×{lastScannedItem.qty}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-300 w-full">
                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-[#327F74]/30 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-[#F5C742]/70" />
                  </div>
                  <p className="text-xs text-gray-400">Last scanned item appears here</p>
                </div>
              )}
            </div>

            {/* Numpad — larger */}
            <div className="flex-1 flex flex-col justify-between p-4 bg-white">
              {posActionMode !== 'none' && (
                <div className="mb-3 rounded-xl bg-[#F5C742]/10 border border-[#327F74]/30 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#F5C742] mb-1">
                    {posActionMode === 'qty' ? 'Qty Mode' : 'Discount Mode'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedFocusItemId
                      ? `Item: ${currentInvoice.items.find(i => i.id === selectedFocusItemId)?.name}`
                      : 'Click a cart item to select it'}
                  </p>
                  {posActionMode === 'discount' && selectedFocusItemId && (
                    <div className="flex gap-1.5 mt-2">
                      <button type="button" onClick={() => setDiscountInputType('percent')}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-colors ${discountInputType === 'percent' ? 'bg-[#F5C742] text-white border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                        % Percent
                      </button>
                      <button type="button" onClick={() => setDiscountInputType('amount')}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-colors ${discountInputType === 'amount' ? 'bg-[#F5C742] text-white border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                        <DirhamSymbol /> Amount
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={resetFocusMode} className="mt-1.5 text-[10px] text-gray-400 hover:text-red-400 underline">Cancel</button>
                </div>
              )}
              {/* Display */}
              <div className="bg-[#F5C742]/10 border-2 border-[#327F74]/30 rounded-xl px-4 py-3 mb-3 text-right font-mono text-2xl text-[#1E293B] min-h-[56px] flex items-center justify-end overflow-hidden">
                <span className="truncate">{barcodeInput || <span className="text-gray-300 text-base font-sans">scan or enter qty×barcode</span>}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 flex-1">
                {['7','8','9','4','5','6','1','2','3'].map(k => (
                  <button key={k} type="button" onClick={() => setBarcodeInput(prev => prev + k)}
                    className="text-xl font-bold text-[#1E293B] bg-gray-50 hover:bg-[#F5C742] hover:text-white active:scale-95 rounded-xl border border-[#327F74]/20 hover:border-[#F5C742] transition-all shadow-sm">
                    {k}
                  </button>
                ))}
                <button type="button" onClick={() => setBarcodeInput(prev => prev + '*')}
                  className="text-xl font-bold text-[#F5C742] bg-[#F5C742]/10 hover:bg-[#F5C742] hover:text-white active:scale-95 rounded-xl border-2 border-[#327F74]/30 hover:border-[#F5C742] transition-all shadow-sm">
                  ×
                </button>
                <button type="button" onClick={() => setBarcodeInput(prev => prev + '0')}
                  className="text-xl font-bold text-[#1E293B] bg-gray-50 hover:bg-[#F5C742] hover:text-white active:scale-95 rounded-xl border border-[#327F74]/20 hover:border-[#F5C742] transition-all shadow-sm">
                  0
                </button>
                <button type="button" onClick={() => setBarcodeInput(prev => prev.slice(0, -1))}
                  className="text-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 rounded-xl border border-[#327F74]/20 transition-all shadow-sm">⌫
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button type="button" onClick={() => { setBarcodeInput(''); if (posActionMode !== 'none') resetFocusMode(); }}
                  className="h-12 text-sm font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors">
                  Clear
                </button>
                <button type="button" onClick={() => {
                  if (posActionMode === 'qty' && selectedFocusItemId) {
                    const qty = parseInt(barcodeInput, 10);
                    if (qty > 0) updateQuantity(selectedFocusItemId, qty);
                    resetFocusMode();
                  } else if (posActionMode === 'discount' && selectedFocusItemId) {
                    const val = parseFloat(barcodeInput) || 0;
                    if (discountInputType === 'percent') {
                      updateDiscount(selectedFocusItemId, Math.min(val, 100));
                    } else {
                      const item = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                      if (item) {
                        const pct = Math.min((val / (item.price * item.quantity)) * 100, 100);
                        updateDiscount(selectedFocusItemId, pct);
                      }
                    }
                    resetFocusMode();
                  } else {
                    handleBarcodeScan(barcodeInput);
                  }
                }}
                  className="h-12 text-sm font-bold text-white bg-[#F5C742] hover:opacity-90 rounded-xl transition-all shadow-sm">
                  Enter ↵
                </button>
              </div>
            </div>

            {/* Invoice total — big, in middle column footer */}
            <div className="bg-[#F5C742] px-4 py-4 flex-shrink-0 flex items-center justify-between gap-4 border-t border-[#327F74]/30">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Invoice Total</p>
                {currentInvoice.totalDiscount > 0 && (
                  <p className="text-xs text-white/80 font-medium">Disc: −{formatCurrency(currentInvoice.totalDiscount)}</p>
                )}
              </div>
              <p className="text-3xl font-black text-white tabular-nums">
                {formatCurrency(currentInvoice.total)}
              </p>
            </div>
          </div>

          {/* ══ COL 3: Tabbed Panel ════════════════════════════ */}
          <div className="flex-1 flex flex-col min-w-0 bg-white border-l-2 border-[#327F74]/30">

            {/* Tab bar */}
            <div className="flex flex-shrink-0 border-b-2 border-[#327F74]/20 bg-white">
              {([['functions', 'Functions'], ['history', 'History']]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setRightPanelTab(id)}
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wide transition-all border-b-2 -mb-[2px] ${
                    rightPanelTab === id
                      ? 'border-[#327F74] text-[#327F74] bg-[#327F74]/5'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Functions tab ── */}
            {rightPanelTab === 'functions' && (
              <div className="flex-1 overflow-y-auto p-3">
                {(() => {
                  const allBtns = [
                    { id: 'add-qty',    label: 'Add Qty',      icon: <Plus className="h-5 w-5" />,        color: `bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 ${posActionMode === 'qty' ? 'ring-2 ring-[#F5C742] bg-blue-100' : ''}`,     action: () => { setPosActionMode(m => m === 'qty' ? 'none' : 'qty'); setBarcodeInput(''); setSelectedFocusItemId(null); } },
                    { id: 'remove',     label: 'Remove Item',  icon: <Trash2 className="h-5 w-5" />,      color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600',          action: () => { const last = currentInvoice.items[0]; if (last) guardedRemoveFromInvoice(last.id); } },
                    { id: 'discount',   label: 'Discount',     icon: <Percent className="h-5 w-5" />,     color: `bg-[#FEF9E7] hover:bg-[#F5C742]/20 border-[#F5C742]/40 text-[#B8942E] ${posActionMode === 'discount' ? 'ring-2 ring-[#F5C742] bg-[#F5C742]/20' : ''}`, action: () => { setPosActionMode(m => m === 'discount' ? 'none' : 'discount'); setBarcodeInput(''); setSelectedFocusItemId(null); setDiscountInputType('percent'); } },
                    { id: 'layaways',   label: 'Layaways',     icon: <Pause className="h-5 w-5" />,       color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700',  action: () => setShowLayawaysList(true) },
                    { id: 'save-layaway', label: 'Save Layaway', icon: <Archive className="h-5 w-5" />,  color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700',  action: () => setShowSaveLayaway(true) },
                    { id: 'save-order', label: 'Save ',icon: <FileText className="h-5 w-5" />,   color: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700', action: () => setShowSaveOrderDialog(true) },
                    { id: 'add-shipping', label: 'Add Shipping', icon: <TrendingUp className="h-5 w-5" />, color: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700',   action: () => setShowAddShippingDialog(true) },
                    { id: 'add-customer', label: 'Add Customer', icon: <UserPlus className="h-5 w-5" />, color: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700',          action: () => setShowAddCustomerDialog(true) },
                    { id: 'coupons',    label: 'Coupons',      icon: <Tag className="h-5 w-5" />,         color: 'bg-pink-50 hover:bg-pink-100 border-pink-200 text-pink-700',      action: () => setShowCouponsDialog(true) },
                    { id: 'promotions', label: 'Promotions',   icon: <Zap className="h-5 w-5" />,         color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800', action: () => setShowPromotionsDialog(true) },
                    { id: 'return',     label: 'Return',       icon: <RotateCcw className="h-5 w-5" />,   color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700', action: () => { setReturnStep(1); setReturnInvoiceQuery(''); setReturnInvoiceFound(null); setReturnSelectedItems({}); setReturnReasons({}); setShowReturn(true); } },
                    { id: 'price-chk',  label: 'Price Check',  icon: <Search className="h-5 w-5" />,      color: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-700',      action: () => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); } },
                    { id: 'cash-drop',  label: 'Cash Drawer',  icon: <DollarSign className="h-5 w-5" />,  color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700', action: () => setShowCashDropDialog(true) },
                    { id: 'last-receipt', label: 'Last Receipt', icon: <Receipt className="h-5 w-5" />,  color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600',      action: () => setShowLastReceiptDialog(true) },
                    { id: 'credit-balance', label: 'Credit Balance', icon: <CreditCard className="h-5 w-5" />, color: 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700', action: () => { setCreditBalanceQuery(''); setCreditBalanceResult(null); setShowCreditBalance(true); } },
                    { id: 'serial-batch', label: 'Serial/Batch Check', icon: <Hash className="h-5 w-5" />, color: 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700', action: () => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setSerialBatchInvoiceNo(''); setSerialBatchItemCode(''); setSerialBatchCustomerMobile(''); setSerialBatchSelectedItem(null); setShowSerialBatch(true); } },
                    { id: 'z-report',   label: 'Z-Report',     icon: <FileBarChart className="h-5 w-5" />, color: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700',        action: () => setCurrentView('z-report') },
                    { id: 'reprint',    label: 'Reprint',      icon: <Printer className="h-5 w-5" />,     color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600',     action: () => setShowReprintModal(true) },
                    { id: 'lock-pos',   label: 'Lock POS',     icon: <Lock className="h-5 w-5" />,        color: 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700', action: () => setShowLockPOS(true) },
                    { id: 'close-session', label: 'Close Session', icon: <XCircle className="h-5 w-5" />, color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-600',         action: () => setShowCloseSessionDialog(true) },
                    { id: 'delivery',       label: 'Delivery',       icon: <Truck className="h-5 w-5" />,        color: 'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action: () => { setDeliveryModalTab('existing'); setDeliveryCustomerId(''); setShowDeliveryModal(true); } },
                    { id: 'delivery-settle',label: 'Delivery Settle', icon: <PackageCheck className="h-5 w-5" />, color: 'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action: () => { setDeliverySettleSearch(''); setDeliverySettlePersonFilter('All Persons'); setDeliverySettleSelected(null); setDeliverySettlePayMode('Cash'); setShowDeliverySettleModal(true); } },
                  ];
                  const visible = allBtns.filter(b => !hiddenPanelButtons.has(b.id));
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {visible.map(btn => (
                          <button key={btn.id} type="button" onClick={btn.action}
                            className={`flex flex-col items-center justify-center gap-1.5 h-[72px] rounded-xl border transition-colors ${btn.color}`}>
                            {btn.icon}
                            <span className="text-[10px] font-semibold leading-tight text-center px-1">{btn.label}</span>
                          </button>
                        ))}
                      </div>
                      {heldSales.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#F5C742] mb-2">Held Bills</p>
                          <div className="flex flex-wrap gap-1.5">
                            {heldSales.map((h) => (
                              <button key={h.id} type="button" onClick={() => recallInvoice(h.id)}
                                className="px-3 py-1.5 text-xs font-bold text-amber-800 bg-[#F5C742]/10 hover:bg-amber-100 rounded-lg border border-[#327F74]/30 transition-colors">
                                {h.label} · {formatCurrency(h.total)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── History tab ── */}
            {rightPanelTab === 'history' && (
              <div className="flex-1 overflow-y-auto">
                {/* Customer header */}
                <div className="px-3 py-2 bg-[#327F74]/5 border-b border-[#327F74]/20 flex-shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#327F74]">
                    {selectedCustomerData?.id === WALK_IN_CUSTOMER.id ? 'Walk-in - no history' : selectedCustomerData?.name}
                  </p>
                  {selectedCustomerData?.tier && (
                    <p className="text-[10px] text-gray-400">{selectedCustomerData.tier} · {selectedCustomerData.loyaltyPoints} pts</p>
                  )}
                </div>

                {selectedCustomerData?.id === WALK_IN_CUSTOMER.id ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-300 gap-2">
                    <User className="h-8 w-8" />
                    <p className="text-xs text-gray-400">Select a customer to view history</p>
                  </div>
                ) : customerHistoryLoading ? (
                  <div className="flex items-center justify-center h-24 text-gray-400 text-xs gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading…
                  </div>
                ) : customerHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-300 gap-2">
                    <Receipt className="h-8 w-8" />
                    <p className="text-xs text-gray-400">No previous purchases</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#327F74]/10">
                    {customerHistory.map(inv => {
                      const mode = inv.paymentMode || 'Cash';
                      const fmtDate = inv.invoiceDate
                        ? new Date(inv.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—';
                      return (
                        <div key={inv.id} className="px-3 py-2.5 hover:bg-[#327F74]/5 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#1E293B] leading-tight">{inv.invoiceNumber}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate} · {inv.itemCount} items</p>
                              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                mode === 'Cash' ? 'bg-[#F5C742]/10 text-[#B8942E] border-[#F5C742]/30' :
                                mode === 'Card' ? 'bg-[#327F74]/10 text-[#327F74] border-[#327F74]/30' :
                                'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>{mode}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <span className="text-sm font-black text-[#327F74]">{formatCurrency(inv.invoiceTotal)}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                inv.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-200' :
                                inv.status === 'PARTIALLY_PAID' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                'bg-gray-50 text-gray-500 border-gray-200'
                              }`}>{inv.status?.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Checkout button — always visible */}
            <div className="p-4 flex-shrink-0 border-t-2 border-[#327F74]/40">
              {activeLayawayId && activeLayawayDeposit > 0 && (
                <div className="flex justify-between text-xs text-green-700 font-semibold mb-2 px-1">
                  <span>Layaway Deposit Applied</span>
                  <span>−{formatCurrency(activeLayawayDeposit)}</span>
                </div>
              )}
              <button type="button"
                onClick={() => {
                  const balanceDue = activeLayawayId && activeLayawayDeposit > 0
                    ? Math.max(0, currentInvoice.total - activeLayawayDeposit)
                    : currentInvoice.total;
                  setCheckoutPhase('payment');
                  setShowPaymentDialog(true);
                  setTenderedAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
                  setCheckoutKeypadVisible(false); setCheckoutKeypadMode('numeric'); setCheckoutKeypadTarget('tender');
                }}
                disabled={currentInvoice.items.length === 0}
                className="w-full rounded-2xl bg-[#F5C742] hover:opacity-90 active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black flex flex-col items-center justify-center gap-0.5 transition-all shadow-lg shadow-[#F5C742]/30 py-5">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-6 w-6" />
                  <span className="text-xl tracking-wide">CHECKOUT</span>
                </div>
                {currentInvoice.total > 0 && (
                  activeLayawayId && activeLayawayDeposit > 0 ? (
                    <span className="text-sm font-semibold text-white/80">
                      Balance {formatCurrency(Math.max(0, currentInvoice.total - activeLayawayDeposit))}
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-white/80">{formatCurrency(currentInvoice.total)}</span>
                  )
                )}
              </button>
            </div>
          </div>

        </div>
      ) : (

      /* ═══════════════════════════════════════════════════════════
         CLASSIC LAYOUT  —  3-column: Cart | Categories+Items | Functions
         ═══════════════════════════════════════════════════════════ */
      <div className="flex-1 flex overflow-hidden bg-[#F7F7FA]">

        {/* ══ COL 1: CART ════════════════════════════════════════ */}
        <div className="w-[360px] shrink-0 flex flex-col border-r-2 border-[#F5C742]/30 bg-white">

          {/* Customer bar — gold, matches Cart Focus */}
          <div className="bg-[#F5C742] px-3 py-2.5 shrink-0 relative border-b border-[#e6b838]">
            <button type="button" onClick={() => setShowCustomerDropdown(v => !v)}
              className="w-full flex items-center justify-between gap-2 text-left">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate leading-none">{selectedCustomerData?.name}</p>
                  {selectedCustomerData?.tier
                    ? <p className="text-[10px] text-white/80 mt-0.5">{selectedCustomerData.tier} · {selectedCustomerData.loyaltyPoints} pts</p>
                    : <p className="text-[10px] text-white/70 mt-0.5">Walk-in</p>}
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-white/70 shrink-0 transition-transform ${showCustomerDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-[#F5C742]/30 shadow-xl overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input autoFocus type="text" placeholder="Search customer..." value={customerSearchQuery}
                      onChange={e => setCustomerSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-[#F5C742]" />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {posCustomersLoading && (
                    <div className="px-3 py-3 text-xs text-gray-400">Loading customers...</div>
                  )}
                  {!posCustomersLoading && filteredCustomerOptions.map(customer => (
                    <button key={customer.id} type="button"
                      onClick={() => { setSelectedCustomer(customer.id); setShowCustomerDropdown(false); setCustomerSearchQuery(''); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F5C742]/10 text-left border-b border-gray-50 ${selectedCustomer === customer.id ? 'bg-[#F5C742]/10' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center shrink-0 text-white text-xs font-bold">{customer.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1E293B] truncate">{customer.name}</p>
                        {customer.membershipId && <p className="text-[10px] text-gray-400">{customer.membershipId}{customer.tier ? ` · ${customer.tier}` : ''}</p>}
                      </div>
                    </button>
                  ))}
                  {!posCustomersLoading && filteredCustomerOptions.length === 0 && (
                    <div className="px-3 py-3 text-xs text-gray-400">
                      {posCustomersError || 'No customers found'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cart column header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white shrink-0">
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5 text-[#F5C742]" />
              <span className="text-xs font-bold text-[#1E293B] uppercase tracking-wide">Cart</span>
              {currentInvoice.items.length > 0 && <span className="text-[10px] font-bold bg-[#F5C742]/20 text-[#b8920e] px-1.5 py-0.5 rounded-full">{currentInvoice.items.length}</span>}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 font-mono">INV-{String(invoiceCounter + 1).padStart(4,'0')}</span>
              <button type="button" onClick={guardedClearInvoice} disabled={currentInvoice.items.length === 0}
                className="ml-1 text-gray-300 hover:text-red-400 disabled:opacity-30 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Cart table header */}
          <div className="grid grid-cols-12 gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
            <span className="col-span-5 text-[9px] font-bold uppercase tracking-wide text-gray-400">Item</span>
            <span className="col-span-2 text-[9px] font-bold uppercase tracking-wide text-gray-400 text-center">Qty</span>
            <span className="col-span-2 text-[9px] font-bold uppercase tracking-wide text-gray-400 text-right">Rate</span>
            <span className="col-span-2 text-[9px] font-bold uppercase tracking-wide text-gray-400 text-right pr-2">Amt</span>
            <span className="col-span-1"></span>
          </div>

          {/* Cart item rows */}
          <div className="flex-1 overflow-y-auto">
            {currentInvoice.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                <ShoppingCart className="h-10 w-10" />
                <p className="text-xs font-medium">Cart is empty</p>
                <p className="text-[10px]">Tap items to add</p>
              </div>
            ) : (
              currentInvoice.items.map((item, idx) => (
                <div key={item.id}
                  className={`grid grid-cols-12 gap-1 items-center px-3 py-2 border-b border-gray-50 transition-colors cursor-pointer group ${item.isVoided ? 'bg-red-50/70 opacity-60' : selectedFocusItemId === item.id ? 'bg-[#F5C742]/10 border-l-2 border-l-[#F5C742]' : idx % 2 === 0 ? 'bg-white hover:bg-[#F5C742]/5' : 'bg-gray-50/60 hover:bg-[#F5C742]/5'}`}
                  onClick={() => !item.isVoided && setSelectedFocusItemId(item.id === selectedFocusItemId ? null : item.id)}>
                  <div className="col-span-5 min-w-0 pr-1">
                    <p className={`text-[11px] font-semibold truncate leading-tight ${item.isVoided ? 'line-through text-red-400' : 'text-[#1E293B]'}`}>{item.name}</p>
                    {item.isVoided && <p className="text-[9px] text-red-500 font-bold">VOIDED</p>}
                    {!item.isVoided && (cartViewDetailed ? (
                      cartLineDetails(item).map(d => (
                        <p key={d.label} className="text-[8px] font-mono text-gray-500 leading-tight truncate">
                          <span className="text-gray-400">{d.label}:</span> <span className="text-[#327F74] font-semibold">{d.value}</span>
                        </p>
                      ))
                    ) : (
                      item.pinnedBatchNumber && (
                        <span className="inline-block px-1 py-px rounded bg-[#327F74]/10 text-[8px] font-mono font-bold text-[#327F74]">⛓ {item.pinnedBatchNumber}</span>
                      )
                    ))}
                    {!item.isVoided && item.discount > 0 && <p className="text-[9px] text-green-600">−{item.discount}% disc</p>}
                  </div>
                  <div className="col-span-2 flex items-center justify-center gap-0.5">
                    {!item.isVoided && <>
                      <button type="button" onClick={e => { e.stopPropagation(); updateQuantity(item.id, item.quantity - 1); }}
                        className="w-5 h-5 rounded bg-gray-100 hover:bg-[#F5C742]/20 flex items-center justify-center text-gray-500 transition-colors">
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                    </>}
                    <span className={`text-xs font-bold w-5 text-center ${item.isVoided ? 'text-red-400 line-through' : 'text-[#1E293B]'}`}>{item.quantity}</span>
                    {!item.isVoided && <button type="button" onClick={e => { e.stopPropagation(); updateQuantity(item.id, item.quantity + 1); }}
                      className="w-5 h-5 rounded bg-gray-100 hover:bg-[#F5C742]/20 flex items-center justify-center text-gray-500 transition-colors">
                      <Plus className="h-2.5 w-2.5" />
                    </button>}
                  </div>
                  <span className={`col-span-2 text-[10px] text-right ${item.isVoided ? 'text-red-300 line-through' : 'text-gray-500'}`}>{item.price.toFixed(0)}</span>
                  <span className={`col-span-2 text-[11px] font-bold text-right pr-2 ${item.isVoided ? 'text-red-400 line-through' : 'text-[#1E293B]'}`}>{formatCurrency(item.total)}</span>
                  <button type="button" onClick={e => { e.stopPropagation(); voidFromInvoice(item.id); }}
                    className={`col-span-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all ${item.isVoided ? 'opacity-100 text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart totals */}
          <div className="border-t-2 border-[#F5C742]/30 bg-white shrink-0">
            <div className="px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span><span>{formatCurrency(currentInvoice.subtotal)}</span>
              </div>
              {currentInvoice.totalDiscount > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Discount</span><span>−{formatCurrency(currentInvoice.totalDiscount)}</span>
                </div>
              )}
              {currentInvoice.billDiscountAmount > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Bill Discount</span><span>−{formatCurrency(currentInvoice.billDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-500">
                <span>{(() => {
                  const rates = [...new Set(currentInvoice.items.filter(i=>!i.isVoided).map(i=>toNumber(i.taxRate,5)))];
                  return rates.length === 1 ? `VAT (${rates[0]}%)` : 'VAT';
                })()}</span><span>{formatCurrency(currentInvoice.tax)}</span>
              </div>
              {activeLayawayId && activeLayawayDeposit > 0 && (
                <div className="flex justify-between text-xs text-green-600 font-semibold border-t border-green-100 pt-1 mt-1">
                  <span>Deposit Paid</span><span>−{formatCurrency(activeLayawayDeposit)}</span>
                </div>
              )}
            </div>
            <div className="bg-[#F5C742] px-3 py-2.5 flex items-center justify-between">
              <div>
                {activeLayawayId && activeLayawayDeposit > 0 ? (
                  <>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-wide">Balance Due</p>
                    <p className="text-xl font-black text-white leading-none">{formatCurrency(Math.max(0, currentInvoice.total - activeLayawayDeposit))}</p>
                    <p className="text-[10px] text-white/70">Total: {formatCurrency(currentInvoice.total)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-wide">Total</p>
                    <p className="text-xl font-black text-white leading-none">{formatCurrency(currentInvoice.total)}</p>
                  </>
                )}
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={holdInvoice} disabled={currentInvoice.items.length === 0 || holdBusy || !sessionId}
                  title={!sessionId ? 'Open a POS session to hold a bill' : ''}
                  className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-40">
                  <Pause className="h-3 w-3" />Hold
                </button>
                <button type="button" onClick={guardedClearInvoice} disabled={currentInvoice.items.length === 0}
                  className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-40">
                  <X className="h-3 w-3" />Clear
                </button>
              </div>
            </div>
            {/* Held recall pills */}
            {heldSales.length > 0 && (
              <div className="px-3 py-1.5 bg-amber-50 border-t border-[#F5C742]/20 flex flex-wrap gap-1">
                {heldSales.map((h) => (
                  <button key={h.id} type="button" onClick={() => recallInvoice(h.id)}
                    className="px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-[#F5C742]/20 hover:bg-amber-200 rounded-full border border-[#F5C742]/30 transition-colors">
                    {h.label} · {formatCurrency(h.total)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══ COL 2: CATEGORIES + ITEMS ══════════════════════════ */}
        <div className="flex-1 flex overflow-hidden min-w-0">

          {/* Category sidebar */}
          {!hideCategoriesPanel && (
            <div className="w-[120px] shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
              <div className="p-2 space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-300 px-1 pt-1 pb-0.5">Categories</p>
                {productCategories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all text-center ${selectedCategory === cat.id ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${selectedCategory === cat.id ? 'bg-[#F5C742] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <cat.icon className="h-4 w-4" />
                    </div>
                    <span className={`text-[9px] font-bold leading-tight ${selectedCategory === cat.id ? 'text-[#1E293B]' : 'text-gray-500'}`}>{cat.name}</span>
                    <span className={`text-[8px] ${selectedCategory === cat.id ? 'text-[#b8920e]' : 'text-gray-300'}`}>
                      {cat.count === null || cat.count === undefined ? '' : cat.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Items area */}
          {!hideItemsPanel && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F7FA]">
              {/* Search bar */}
              <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
                {/* Unified search + scan: type to filter the grid, Enter / scan to add */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      placeholder="Scan or search — item, barcode, batch, customer…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUnifiedEntry(searchQuery, { fromGrid: true }); }}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#F5C742]" />
                  </div>
                  <button type="button" onClick={() => handleUnifiedEntry(searchQuery, { fromGrid: true })}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#F5C742]/40 bg-[#F5C742]/10 text-[#B8942E] hover:bg-[#F5C742]/20">
                    Add
                  </button>
                </div>
                {barcodeScanFeedback && (
                  <div className={`mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                    barcodeScanFeedback.type === 'success' ? 'bg-green-500/15 text-green-700' :
                    barcodeScanFeedback.type === 'customer' ? 'bg-blue-500/15 text-blue-700' : 'bg-red-500/15 text-red-700'
                  }`}>
                    {barcodeScanFeedback.type === 'success' && <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                    {barcodeScanFeedback.type === 'customer' && <User className="h-3.5 w-3.5 flex-shrink-0" />}
                    {barcodeScanFeedback.type === 'error' && <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                    {barcodeScanFeedback.message}
                  </div>
                )}
                {/* Category pill strip */}
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5">
                  {productCategories.map(cat => (
                    <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.id)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${selectedCategory === cat.id ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-500 hover:border-[#F5C742]/50 bg-white'}`}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product grid — 5-per-row compact tiles */}
              <div className="flex-1 overflow-y-auto p-2.5">
                {posProductsError && (
                  <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {posProductsError}
                  </div>
                )}
                <div className="grid grid-cols-5 gap-2">
                  {filteredProducts.map(product => (
                    <button key={product.id} type="button" onClick={() => {
                        const pin = product._pinnedBatch || null;
                        if (pin && currentInvoiceRef.current?.items?.some(i => i.pinnedBatchNumber === pin)) {
                          showFeedback('error', `Batch ${pin} is already in the cart`);
                          return;
                        }
                        addToInvoice(product, 1, pin);
                        if (pin) setSearchQuery('');
                      }}
                      className="group bg-white rounded-xl border border-gray-200 hover:border-[#F5C742] hover:shadow-md transition-all text-left overflow-hidden active:scale-95">
                      {/* Image area */}
                      <div className="aspect-square bg-gradient-to-br from-[#F7F7FA] to-gray-100 flex items-center justify-center relative border-b border-gray-100">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-7 w-7 text-[#F5C742] opacity-40 group-hover:opacity-70 transition-opacity" />
                        )}
                        {product.stock <= 5 && product.stock > 0 && (
                          <span className="absolute top-1 right-1 text-[8px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded">LOW</span>
                        )}
                        {product.stock === 0 && (
                          <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-[9px] font-black text-red-500">OUT</span>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-1.5">
                        <p className="text-[10px] font-semibold text-[#1E293B] leading-tight line-clamp-2">{product.name}</p>
                        <p className="text-[8px] font-mono text-gray-400 mt-0.5 truncate">{product.barcode || product.id}</p>
                        <div className="flex items-center justify-between gap-1 mt-1">
                          <p className="text-[11px] font-black text-[#F5C742]">{formatCurrency(product.price)}</p>
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${product.stock > 10 ? 'bg-green-50 text-green-600' : product.stock > 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                            {product.stock}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {posProductsLoading && (
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div key={index} className="h-48 animate-pulse rounded-xl border border-gray-200 bg-white">
                        <div className="h-32 rounded-t-xl bg-gray-100" />
                        <div className="space-y-2 p-2">
                          <div className="h-3 rounded bg-gray-100" />
                          <div className="h-2 w-2/3 rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!posProductsLoading && filteredProducts.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-300">
                    <Package className="h-10 w-10 mb-2" />
                    <p className="text-xs">No items found</p>
                  </div>
                )}
                {!posProductsLoading && posProductPage + 1 < posProductTotalPages && (
                  <div className="flex justify-center py-3">
                    <button
                      type="button"
                      onClick={loadMorePosProducts}
                      disabled={posProductsLoadingMore}
                      className="rounded-lg border border-[#F5C742]/50 bg-white px-4 py-2 text-xs font-bold text-[#b8920e] hover:bg-[#F5C742]/10 disabled:opacity-50"
                    >
                      {posProductsLoadingMore ? 'Loading...' : `Load more (${filteredProducts.length}/${posProductTotalElements})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══ COL 3: FUNCTIONS (Cart Focus style) ════════════════ */}
        <div className="w-[250px] shrink-0 bg-white border-l-2 border-[#F5C742]/30 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-gray-100 shrink-0">
            {(['functions','history']).map(tab => (
              <button key={tab} type="button" onClick={() => setRightPanelTab(tab)}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${rightPanelTab === tab ? 'border-b-2 border-[#327F74] text-[#327F74]' : 'border-b-2 border-transparent text-gray-400 hover:text-gray-600'}`}>
                {tab === 'functions' ? 'Actions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Functions tab — with inline numpad for Disc%, Add Qty, Price */}
          {rightPanelTab === 'functions' && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* ── Inline numpad panel ── */}
              {classicNumpadMode !== 'none' && (() => {
                const selectedItem = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                const modeLabel = classicNumpadMode === 'qty' ? 'Set Quantity' : classicNumpadMode === 'discount' ? 'Set Discount' : 'Set Price';
                const modeColor = classicNumpadMode === 'qty' ? 'text-blue-600' : classicNumpadMode === 'discount' ? 'text-[#B8942E]' : 'text-purple-600';
                const handleNumpadEnter = () => {
                  if (!selectedFocusItemId) return;
                  const val = parseFloat(classicNumpadValue) || 0;
                  if (classicNumpadMode === 'qty') {
                    if (val > 0) updateQuantity(selectedFocusItemId, Math.round(val));
                  } else if (classicNumpadMode === 'discount') {
                    if (classicDiscountType === 'percent') {
                      updateDiscount(selectedFocusItemId, Math.min(val, 100));
                    } else {
                      const it = currentInvoice.items.find(i => i.id === selectedFocusItemId);
                      if (it) updateDiscount(selectedFocusItemId, Math.min((val / (it.price * it.quantity)) * 100, 100));
                    }
                  } else if (classicNumpadMode === 'price') {
                    updateItemPrice(selectedFocusItemId, val);
                  }
                  setClassicNumpadMode('none');
                  setClassicNumpadValue('');
                };
                return (
                  <div className="bg-white border-b border-gray-200 p-2.5 shrink-0">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-wide ${modeColor}`}>{modeLabel}</span>
                      <button type="button" onClick={() => { setClassicNumpadMode('none'); setClassicNumpadValue(''); setSelectedFocusItemId(null); }}
                        className="text-[10px] text-gray-400 hover:text-red-500 font-bold">✕ Cancel</button>
                    </div>
                    {/* Item context */}
                    {selectedItem ? (
                      <div className="bg-[#F5C742]/10 border border-[#F5C742]/30 rounded-lg px-2 py-1.5 mb-2">
                        <p className="text-[10px] font-semibold text-[#1E293B] truncate">{selectedItem.name}</p>
                        <p className="text-[9px] text-gray-400">
                          {classicNumpadMode === 'qty' && `Current qty: ${selectedItem.quantity}`}
                          {classicNumpadMode === 'discount' && `Current disc: ${selectedItem.discount}%`}
                          {classicNumpadMode === 'price' && `Current price: ${formatCurrency(selectedItem.price)}`}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2">
                        <p className="text-[10px] text-amber-600 font-semibold">← Select a cart row first</p>
                      </div>
                    )}
                    {/* Discount type toggle */}
                    {classicNumpadMode === 'discount' && (
                      <div className="flex gap-1 mb-2">
                        <button type="button" onClick={() => setClassicDiscountType('percent')}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-colors ${classicDiscountType === 'percent' ? 'bg-[#F5C742] text-[#1E293B] border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                          % Percent
                        </button>
                        <button type="button" onClick={() => setClassicDiscountType('amount')}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-colors ${classicDiscountType === 'amount' ? 'bg-[#F5C742] text-[#1E293B] border-[#F5C742]' : 'bg-white text-gray-500 border-gray-200'}`}>
                          <DirhamSymbol /> Amt
                        </button>
                      </div>
                    )}
                    {/* Display */}
                    <div className="bg-gray-50 border-2 border-[#F5C742]/40 rounded-xl px-3 py-2 text-right font-mono mb-2 min-h-[38px] flex items-center justify-end">
                      {classicNumpadValue
                        ? <span className="text-lg text-[#1E293B]">{classicNumpadValue}</span>
                        : <span className="text-gray-300 text-sm font-sans">0</span>}
                    </div>
                    {/* Number pad */}
                    <div className="grid grid-cols-3 gap-1 mb-1">
                      {['7','8','9','4','5','6','1','2','3'].map(k => (
                        <button key={k} type="button" onClick={() => setClassicNumpadValue(v => v + k)}
                          className="h-9 rounded-lg bg-gray-50 hover:bg-[#F5C742]/20 border border-gray-200 text-sm text-[#1E293B] font-bold transition-colors active:scale-95">
                          {k}
                        </button>
                      ))}
                      <button type="button" onClick={() => setClassicNumpadValue(v => v + '.')}
                        className="h-9 rounded-lg bg-gray-50 hover:bg-[#F5C742]/20 border border-gray-200 text-sm text-gray-500 font-bold transition-colors">.</button>
                      <button type="button" onClick={() => setClassicNumpadValue(v => v + '0')}
                        className="h-9 rounded-lg bg-gray-50 hover:bg-[#F5C742]/20 border border-gray-200 text-sm text-[#1E293B] font-bold transition-colors active:scale-95">0</button>
                      <button type="button" onClick={() => setClassicNumpadValue(v => v.slice(0, -1))}
                        className="h-9 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-sm text-gray-500 font-bold transition-colors">⌫</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button type="button" onClick={() => setClassicNumpadValue('')}
                        className="h-9 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-xs text-red-600 font-bold transition-colors">
                        Clear
                      </button>
                      <button type="button" onClick={handleNumpadEnter} disabled={!selectedFocusItemId || !classicNumpadValue}
                        className="h-9 rounded-lg bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-40 text-[#1E293B] text-xs font-black transition-colors">
                        Enter ↵
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── Action button grid ── */}
              <div className="p-2 flex-1 overflow-y-auto">
                {(() => {
                  const openNumpad = (mode) => {
                    setClassicNumpadMode(m => m === mode ? 'none' : mode);
                    setClassicNumpadValue('');
                    if (classicNumpadMode !== mode) setSelectedFocusItemId(null);
                  };
                  const allBtns = [
                    { id:'add-qty',    label:'Add Qty',      icon:<Plus className="h-4 w-4"/>,        color:`bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 ${classicNumpadMode==='qty'?'ring-2 ring-[#F5C742] bg-blue-100':''}`,     action:()=>openNumpad('qty') },
                    { id:'discount',   label:'Disc %',       icon:<Percent className="h-4 w-4"/>,     color:`bg-[#FEF9E7] hover:bg-[#F5C742]/20 border-[#F5C742]/40 text-[#B8942E] ${classicNumpadMode==='discount'?'ring-2 ring-[#F5C742]':''}`, action:()=>openNumpad('discount') },
                    { id:'price',      label:'Price',        icon:<Tag className="h-4 w-4"/>,         color:`bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 ${classicNumpadMode==='price'?'ring-2 ring-[#F5C742] bg-purple-100':''}`, action:()=>openNumpad('price') },
                    { id:'remove',     label:'Remove',       icon:<Trash2 className="h-4 w-4"/>,      color:'bg-red-50 hover:bg-red-100 border-red-200 text-red-600',       action:()=>{const l=currentInvoice.items[0];if(l)guardedRemoveFromInvoice(l.id);} },
                    { id:'layaways',   label:'Layaways',     icon:<Pause className="h-4 w-4"/>,       color:'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700', action:()=>setShowLayawaysList(true) },
                    { id:'return',     label:'Return',       icon:<RotateCcw className="h-4 w-4"/>,   color:'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700', action:()=>{setReturnStep(1);setReturnInvoiceQuery('');setReturnInvoiceFound(null);setReturnSelectedItems({});setReturnReasons({});setShowReturn(true);} },
                    { id:'price-chk',  label:'Price Chk',   icon:<Search className="h-4 w-4"/>,      color:'bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-700',      action:()=>{setPriceCheckQuery('');setPriceCheckResult(null);setShowPriceCheck(true);} },
                    { id:'credit-balance',label:'Credit Bal',icon:<CreditCard className="h-4 w-4"/>, color:'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700', action:()=>{setCreditBalanceQuery('');setCreditBalanceResult(null);setShowCreditBalance(true);} },
                    { id:'serial-batch',label:'Serial/Batch',icon:<Hash className="h-4 w-4"/>,       color:'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700',      action:()=>{setSerialBatchQuery('');setSerialBatchResult(null);setSerialBatchSubView('check');setSerialBatchInvoiceNo('');setSerialBatchItemCode('');setSerialBatchCustomerMobile('');setSerialBatchSelectedItem(null);setShowSerialBatch(true);} },
                    { id:'save-layaway', label:'Save Layaway',   icon:<Archive className="h-4 w-4"/>,    color:'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700',   action:()=>setShowSaveLayaway(true) },
                    { id:'reprint',      label:'Reprint Inv.',  icon:<Printer className="h-4 w-4"/>,    color:'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600',       action:()=>setShowReprintModal(true) },
                    { id:'cash-drop',    label:'Cash Drop',     icon:<DollarSign className="h-4 w-4"/>, color:'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700', action:()=>setShowCashDropDialog(true) },
                    { id:'service',      label:'Service &amp; Repair', icon:<Wrench className="h-4 w-4"/>,  color:'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/30 text-[#327F74]', action:()=>{ setShowServiceRepair(true); setServiceView('list'); } },
                    { id:'z-report',     label:'Z-Report',      icon:<FileBarChart className="h-4 w-4"/>,color:'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700',          action:()=>setCurrentView('z-report') },
                    { id:'lock-pos',     label:'Lock POS',      icon:<Lock className="h-4 w-4"/>,       color:'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',  action:()=>setShowLockPOS(true) },
                    { id:'close-session',  label:'Close Session',   icon:<XCircle className="h-4 w-4"/>,      color:'bg-red-50 hover:bg-red-100 border-red-200 text-red-600',           action:()=>setShowCloseSessionDialog(true) },
                    { id:'delivery',       label:'Delivery',        icon:<Truck className="h-4 w-4"/>,         color:'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action:()=>{ setDeliveryModalTab('existing'); setDeliveryCustomerId(''); setShowDeliveryModal(true); } },
                    { id:'delivery-settle',label:'Delivery Settle', icon:<PackageCheck className="h-4 w-4"/>,  color:'bg-[#327F74]/10 hover:bg-[#327F74]/20 border-[#327F74]/40 text-[#327F74]', action:()=>{ setDeliverySettleSearch(''); setDeliverySettlePersonFilter('All Persons'); setDeliverySettleSelected(null); setDeliverySettlePayMode('Cash'); setShowDeliverySettleModal(true); } },
                  ];
                  const visible = allBtns.filter(b => !hiddenPanelButtons.has(b.id));
                  return (
                    <div className="grid grid-cols-2 gap-1.5">
                      {visible.map(btn => (
                        <button key={btn.id} type="button" onClick={btn.action}
                          className={`flex flex-col items-center justify-center gap-1 h-[60px] rounded-xl border transition-colors ${btn.color}`}>
                          {btn.icon}
                          <span className="text-[9px] font-bold leading-tight text-center px-0.5">{btn.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* History tab */}
          {rightPanelTab === 'history' && (
            <div className="flex-1 overflow-y-auto p-2.5">
              {selectedCustomerData?.id === WALK_IN_CUSTOMER.id ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-1">
                  <User className="h-8 w-8" /><p className="text-xs">Select customer</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-[#F5C742]/10 rounded-xl border border-[#F5C742]/30">
                    <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center text-xs font-black text-white">{selectedCustomerData?.name?.charAt(0)}</div>
                    <div>
                      <p className="text-xs font-bold text-[#1E293B]">{selectedCustomerData?.name}</p>
                      <p className="text-[9px] text-gray-400">{selectedCustomerData?.loyaltyPoints} pts</p>
                    </div>
                  </div>
                  {customerHistoryLoading ? (
                    <div className="flex items-center justify-center h-16 text-gray-400 text-xs gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />Loading…
                    </div>
                  ) : customerHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-16 text-gray-300 gap-1">
                      <Receipt className="h-5 w-5" /><p className="text-xs">No previous purchases</p>
                    </div>
                  ) : customerHistory.map(inv => {
                    const fmtDate = inv.invoiceDate
                      ? new Date(inv.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : '—';
                    return (
                      <div key={inv.id} className="flex items-center justify-between px-2.5 py-2 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                        <div>
                          <p className="font-semibold text-[#1E293B]">{inv.invoiceNumber}</p>
                          <p className="text-[9px] text-gray-400">{fmtDate} · {inv.itemCount} items</p>
                        </div>
                        <span className="font-bold text-[#327F74]">{formatCurrency(inv.invoiceTotal)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Checkout button — always visible */}
          <div className="p-2.5 border-t-2 border-[#F5C742]/30 shrink-0">
            {activeLayawayId && activeLayawayDeposit > 0 && (
              <div className="flex justify-between text-[10px] text-green-700 font-semibold mb-1.5 px-1">
                <span>Deposit Applied</span><span>−{formatCurrencyStr(activeLayawayDeposit)}</span>
              </div>
            )}
            <button type="button" onClick={() => { setCheckoutPhase('payment'); setShowPaymentDialog(true); setTenderedAmount(currentInvoice.total > 0 ? currentInvoice.total.toFixed(2) : ''); setCheckoutKeypadVisible(false); setCheckoutKeypadMode('numeric'); setCheckoutKeypadTarget('tender'); }}
              disabled={currentInvoice.items.length === 0}
              className="w-full h-12 rounded-xl bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-40 disabled:cursor-not-allowed text-[#1E293B] font-black text-sm flex items-center justify-center gap-2 transition-all shadow-sm shadow-[#F5C742]/30">
              <CreditCard className="h-4 w-4" />
              {currentInvoice.items.length > 0
                ? (activeLayawayId && activeLayawayDeposit > 0
                    ? `Checkout · Balance ${formatCurrencyStr(Math.max(0, currentInvoice.total - activeLayawayDeposit))}`
                    : `Checkout · ${formatCurrencyStr(currentInvoice.total)}`)
                : 'Checkout'}
            </button>
          </div>
        </div>

      </div>
      )}
    </div>
  );

  // ── Report company profile helper ────────────────────────────────────────────
  const reportCompanyProfile = () => ({
    companyName: tplOutletName || 'BillBull ERP',
    trn: tplOutletTrn || '',
    address: tplOutletAddress || '',
    phone: tplOutletPhone || '',
    currency: 'AED',
  });

  // ── Z-Report: build A4 view-model for print/PDF ───────────────────────────
  const buildZReportViewModel = () => {
    const zSummary = zReportData?.summary || {};
    const zSessions = zReportData?.sessions || [];
    const zInvoices = zReportData?.invoices || [];
    const totalSalesV  = Number(zSummary.totalSales  ?? 0);
    const cashSalesV   = Number(zSummary.cashSales   ?? 0);
    const cardSalesV   = Number(zSummary.cardSales   ?? 0);
    const creditSalesV = Number(zSummary.creditSales ?? 0);
    const totalTaxV    = Number(zSummary.totalTax    ?? 0);
    const salesExTaxV  = Number(zSummary.salesAmountExTax ?? 0);
    const discountV    = Number(zSummary.totalDiscount    ?? 0);
    const itemsSoldV   = zSummary.totalItemsSold ?? 0;
    const invoiceCount = zSummary.invoiceCount   ?? 0;
    const sessionCount = zSummary.sessionCount   ?? zSessions.length;
    const openingCash  = zSessions.reduce((s, ss) => s + Number(ss.openingCash ?? 0), 0);
    const expectedCash = openingCash + cashSalesV;
    const fmt = (n) => `AED ${Number(n).toFixed(2)}`;
    const zId = zSessions[0]?.id;
    const reportNo = zId ? `ZR-${String(zId).padStart(9,'0')}` : `ZR-${zReportDate?.replace(/-/g,'')}-001`;

    const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
    const creditTotal    = creditInvoices.reduce((s, inv) => s + (Number(inv.invoiceTotal) || 0), 0);
    const invNums        = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();

    return {
      reportTitle: 'Z-Report / End-of-Day Closing Report',
      note: `Report No: ${reportNo}  |  Business Date: ${zReportDate || new Date().toISOString().slice(0,10)}  |  Sessions: ${sessionCount}`,
      kpis: [
        { label: 'Gross Sales',     value: fmt(totalSalesV),   hint: 'Before discounts' },
        { label: 'Cash Sales',      value: fmt(cashSalesV),    hint: 'Cash payments' },
        { label: 'Card Sales',      value: fmt(cardSalesV),    hint: 'Card payments' },
        { label: 'VAT Amount (5%)', value: fmt(totalTaxV),     hint: '5% VAT' },
        { label: 'Expected Cash',   value: fmt(expectedCash),  hint: 'Opening + cash sales' },
        { label: 'Total Invoices',  value: String(invoiceCount), hint: `${sessionCount} session(s)` },
      ],
      sections: [
        {
          title: '1. Sales Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Gross Sales',              fmt(totalSalesV)],
            ['Total Discount',           discountV > 0 ? `(${fmt(discountV)})` : fmt(0)],
            ['Net Sales Before VAT',     fmt(salesExTaxV)],
            ['VAT Amount (5%)',          fmt(totalTaxV)],
            ['Net Sales Including VAT',  fmt(totalSalesV)],
          ],
        },
        {
          title: '2. Invoice / Transaction Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [['Total Sales Invoices', String(invoiceCount), fmt(totalSalesV)]],
        },
        {
          title: '3. Payment / Tender Summary', type: 'table',
          cols: ['Payment Mode', 'Count', 'Amount'],
          rows: [
            ['Cash',   String(zSummary.cashInvoiceCount   ?? '—'), fmt(cashSalesV)],
            ['Card',   String(zSummary.cardInvoiceCount   ?? '—'), fmt(cardSalesV)],
            ['Credit', String(zSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
          ],
          footer: ['Total Collected', String(invoiceCount), fmt(totalSalesV)],
        },
        {
          title: '4. Cash Drawer Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Opening Cash / Float',       fmt(openingCash)],
            ['Cash Sales',                  fmt(cashSalesV)],
            ['Expected Cash in Drawer',     fmt(expectedCash)],
          ],
        },
        {
          title: '5. Card / Bank Settlement Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Total Card Sales',               fmt(cardSalesV)],
            ['Net Card Settlement Expected',    fmt(cardSalesV)],
          ],
        },
        {
          title: '6. VAT / Tax Summary', type: 'table',
          cols: ['Tax Type', 'Taxable Amount', 'Tax Amount', 'Total Amount'],
          rows: [['VAT 5%', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)]],
          footer: ['Total', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)],
        },
        {
          title: '7. Discount Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)]],
        },
        {
          title: '8. Item Movement Summary', type: 'table',
          cols: ['Description', 'Quantity', 'Amount'],
          rows: [
            ['Total Items Sold', String(itemsSoldV), fmt(totalSalesV)],
            ['Net Quantity Sold', String(itemsSoldV), fmt(totalSalesV)],
          ],
        },
        {
          title: '10. Cashier / Session Wise Summary', type: 'table',
          cols: ['Cashier', 'Invoice Count', 'Net Sales', 'Cash', 'Card', 'Credit'],
          rows: zSessions.length > 0
            ? zSessions.map(s => [s.openedBy || '—', String(s.invoiceCount || 0), fmt(s.totalSales ?? 0), fmt(s.totalCashSales ?? 0), fmt(s.totalCardSales ?? 0), fmt(s.totalCreditSales ?? 0)])
            : [['—', '0', fmt(0), fmt(0), fmt(0), fmt(0)]],
          footer: ['Total', String(invoiceCount), fmt(totalSalesV), fmt(cashSalesV), fmt(cardSalesV), fmt(creditSalesV)],
        },
        {
          title: '11. Customer Credit Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Credit Sales',                   String(creditInvoices.length), fmt(creditTotal)],
            ['Outstanding Created Today',       String(creditInvoices.length), fmt(creditTotal)],
          ],
        },
        {
          title: '12. Opening & Closing Invoice Numbers', type: 'table',
          cols: ['Document Type', 'Starting No.', 'Ending No.'],
          rows: [['Sales Invoice', invNums[0] || '—', invNums[invNums.length - 1] || '—']],
        },
        {
          title: '13. Final Day Close Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Total Net Sales Inc. VAT',    fmt(totalSalesV)],
            ['Total Discount',              fmt(discountV)],
            ['Total Collection',            fmt(totalSalesV)],
            ['Opening Cash / Float',        fmt(openingCash)],
            ['Expected Cash in Drawer',     fmt(expectedCash)],
            ['Cash Sales',                  fmt(cashSalesV)],
          ],
        },
      ],
    };
  };

  // ── Z-Report: Excel flat rows ─────────────────────────────────────────────
  const buildZReportExcelSections = () => {
    const zSummary = zReportData?.summary || {};
    const zSessions = zReportData?.sessions || [];
    const zInvoices = zReportData?.invoices || [];
    const fmt = (n) => Number(Number(n).toFixed(2));
    const totalSalesV  = fmt(zSummary.totalSales  ?? 0);
    const cashSalesV   = fmt(zSummary.cashSales   ?? 0);
    const cardSalesV   = fmt(zSummary.cardSales   ?? 0);
    const creditSalesV = fmt(zSummary.creditSales ?? 0);
    const totalTaxV    = fmt(zSummary.totalTax    ?? 0);
    const salesExTaxV  = fmt(zSummary.salesAmountExTax ?? 0);
    const discountV    = fmt(zSummary.totalDiscount    ?? 0);
    const itemsSold    = zSummary.totalItemsSold ?? 0;
    const invoiceCount = zSummary.invoiceCount   ?? 0;
    const openingCash  = fmt(zSessions.reduce((s, ss) => s + Number(ss.openingCash ?? 0), 0));
    const expectedCash = fmt(openingCash + cashSalesV);
    const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
    const creditTotal  = fmt(creditInvoices.reduce((s, inv) => s + Number(inv.invoiceTotal || 0), 0));
    const invNums      = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();

    return [
      // Sales summary rows tagged with section header
      { Section: 'Sales Summary',          Description: 'Gross Sales',             Count: '',         Amount: totalSalesV },
      { Section: '',                        Description: 'Total Discount',           Count: '',         Amount: discountV },
      { Section: '',                        Description: 'Net Sales Before VAT',     Count: '',         Amount: salesExTaxV },
      { Section: '',                        Description: 'VAT Amount (5%)',          Count: '',         Amount: totalTaxV },
      { Section: '',                        Description: 'Net Sales Including VAT',  Count: '',         Amount: totalSalesV },
      { Section: 'Payment / Tender',        Description: 'Cash',                     Count: zSummary.cashInvoiceCount ?? 0,   Amount: cashSalesV },
      { Section: '',                        Description: 'Card',                     Count: zSummary.cardInvoiceCount ?? 0,   Amount: cardSalesV },
      { Section: '',                        Description: 'Credit',                   Count: zSummary.creditInvoiceCount ?? 0, Amount: creditSalesV },
      { Section: '',                        Description: 'Total Collected',          Count: invoiceCount, Amount: totalSalesV },
      { Section: 'Cash Drawer',             Description: 'Opening Cash / Float',    Count: '',         Amount: openingCash },
      { Section: '',                        Description: 'Cash Sales',               Count: '',         Amount: cashSalesV },
      { Section: '',                        Description: 'Expected Cash in Drawer',  Count: '',         Amount: expectedCash },
      { Section: 'VAT / Tax',               Description: 'VAT 5% — Taxable Amount', Count: '',         Amount: salesExTaxV },
      { Section: '',                        Description: 'VAT 5% — Tax Amount',     Count: '',         Amount: totalTaxV },
      { Section: '',                        Description: 'Total Inc. VAT',           Count: '',         Amount: totalSalesV },
      { Section: 'Discount',                Description: 'Total Discount',           Count: '',         Amount: discountV },
      { Section: 'Item Movement',           Description: 'Total Items Sold',         Count: String(itemsSold), Amount: totalSalesV },
      { Section: 'Customer Credit',         Description: 'Credit Sales',             Count: creditInvoices.length, Amount: creditTotal },
      { Section: 'Invoice Range',           Description: 'First Invoice',            Count: invNums[0] || '—', Amount: '' },
      { Section: '',                        Description: 'Last Invoice',             Count: invNums[invNums.length - 1] || '—', Amount: '' },
      ...zSessions.map((s, i) => ({
        Section: i === 0 ? 'Cashier Wise' : '',
        Description: s.openedBy || '—',
        Count: s.invoiceCount || 0,
        Amount: fmt(s.totalSales ?? 0),
      })),
    ];
  };

  // ── X-Report: build A4 view-model for print/PDF ───────────────────────────
  const buildXReportViewModel = () => {
    const xSummary  = xReportData?.summary  || {};
    const xInvoices = xReportData?.invoices || [];
    const sess = xReportData?.session || currentSession;
    const fmt = (n) => `AED ${Number(n).toFixed(2)}`;
    const openingCashVal  = Number(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
    const cashSalesV      = Number(xSummary.cashSales    ?? 0);
    const cardSalesV      = Number(xSummary.cardSales    ?? 0);
    const creditSalesV    = Number(xSummary.creditSales  ?? 0);
    const totalSalesV     = Number(xSummary.totalSales   ?? 0);
    const totalTaxV       = Number(xSummary.totalTax     ?? 0);
    const salesExTaxV     = Number(xSummary.salesAmountExTax ?? 0);
    const discountV       = Number(xSummary.totalDiscount ?? 0);
    const cashDropIn      = Number(xSummary.cashDropIn   ?? 0);
    const cashDropOut     = Number(xSummary.cashDropOut  ?? 0);
    const invoiceCount    = xSummary.invoiceCount ?? currentSession?.invoiceCount ?? 0;
    const expectedCashVal = Number(xSummary.expectedCash ?? (openingCashVal + cashSalesV + cashDropIn - cashDropOut));
    const actualCash      = calculateDenominationTotal(closingDenominations);
    const cashVariance    = actualCash - expectedCashVal;
    const varStatus       = actualCash === 0 ? 'Pending Count' : Math.abs(cashVariance) < 0.01 ? 'Balanced' : cashVariance < 0 ? 'Short' : 'Excess';
    const sessId = sess?.id || currentSession?.id;
    const reportNo = sessId ? `XR-${String(sessId).padStart(9,'0')}` : '—';
    const denomKeys   = ['1000','500','200','100','50','20','10','5','1','0.50','0.25'];
    const denomLabels = {'1000':'AED 1000','500':'AED 500','200':'AED 200','100':'AED 100','50':'AED 50','20':'AED 20','10':'AED 10','5':'AED 5','1':'AED 1 Coin','0.50':'AED 0.50 Coin','0.25':'AED 0.25 Coin'};

    const cardInvoices   = xInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('card'));
    const refundTotal    = Number(sess?.totalRefunds ?? 0);
    const netCardSettle  = Math.max(0, cardSalesV - refundTotal);
    const itemsSoldCount = xInvoices.reduce((s, inv) => s + (inv.items?.length || 0), 0);
    const totalVoids     = sess?.totalVoids ?? 0;

    return {
      reportTitle: 'X-Report / Session Close Report',
      note: `Report No: ${reportNo}  |  Cashier: ${sess?.openedBy || '—'}  |  Session: SESS-${String(sessId || 0).padStart(6,'0')}  |  Date: ${sess?.sessionDate || new Date().toISOString().slice(0,10)}`,
      kpis: [
        { label: 'Opening Cash',       value: fmt(openingCashVal),  hint: 'Float' },
        { label: 'Total Sales',        value: fmt(totalSalesV),     hint: 'Inc. VAT' },
        { label: 'Cash Sales',         value: fmt(cashSalesV),      hint: 'Cash payments' },
        { label: 'Card Sales',         value: fmt(cardSalesV),      hint: 'Card payments' },
        { label: 'Expected Cash',      value: fmt(expectedCashVal), hint: 'Opening + cash sales' },
        { label: 'Actual Cash Counted',value: fmt(actualCash),      hint: 'Denomination count' },
        { label: 'Cash Variance',      value: fmt(Math.abs(cashVariance)), hint: varStatus },
      ],
      sections: [
        {
          title: '1. Denomination Count', type: 'table',
          cols: ['Denomination', 'Quantity', 'Total Amount'],
          rows: denomKeys.map(k => [denomLabels[k], String(closingDenominations[k] || 0), fmt((closingDenominations[k] || 0) * parseFloat(k))]),
          footer: ['Total Cash Counted', '', fmt(actualCash)],
        },
        {
          title: '2. Cash Drawer Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Opening Cash / Float',      fmt(openingCashVal)],
            ['Cash Sales',                 fmt(cashSalesV)],
            ['Cash Drop In',               fmt(cashDropIn)],
            ['Cash Drop Out',              fmt(cashDropOut)],
            ['Expected Cash in Drawer',    fmt(expectedCashVal)],
            ['Actual Cash Counted',        fmt(actualCash)],
          ],
          footer: ['Cash Variance (' + varStatus + ')', fmt(Math.abs(cashVariance))],
        },
        {
          title: '3. Payment / Tender Summary', type: 'table',
          cols: ['Payment Mode', 'Count', 'Amount'],
          rows: [
            ['Cash',   String(xSummary.cashInvoiceCount   ?? '—'), fmt(cashSalesV)],
            ['Card',   String(xSummary.cardInvoiceCount   ?? '—'), fmt(cardSalesV)],
            ['Credit', String(xSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
          ],
          footer: ['Total', String(invoiceCount), fmt(totalSalesV)],
        },
        {
          title: '4. Card / Bank Settlement Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Card Sales',          String(cardInvoices.length), fmt(cardSalesV)],
            ['Card Refunds',        String(totalVoids),          refundTotal > 0 ? `(${fmt(refundTotal)})` : fmt(0)],
            ['Net Card Settlement', String(Math.max(0, cardInvoices.length - totalVoids)), fmt(netCardSettle)],
          ],
        },
        {
          title: '5. Invoice / Transaction Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Total Invoices',   String(invoiceCount),    fmt(totalSalesV)],
            ['Cash Invoices',    String(xSummary.cashInvoiceCount   ?? '—'), fmt(cashSalesV)],
            ['Card Invoices',    String(xSummary.cardInvoiceCount   ?? '—'), fmt(cardSalesV)],
            ['Credit Invoices',  String(xSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
          ],
        },
        {
          title: '6. VAT / Tax Summary', type: 'table',
          cols: ['Tax Type', 'Taxable Amount', 'Tax Amount', 'Total Amount'],
          rows: [['VAT 5%', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)]],
          footer: ['Total', fmt(salesExTaxV), fmt(totalTaxV), fmt(totalSalesV)],
        },
        {
          title: '7. Discount Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)]],
        },
        {
          title: '8. Return / Refund Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Total Refunds',  String(totalVoids), fmt(refundTotal)],
            ['Card Refunds',   String(totalVoids), fmt(refundTotal)],
            ['Cash Refunds',   '0',                fmt(0)],
          ],
        },
        {
          title: '9. Item Movement Summary', type: 'table',
          cols: ['Description', 'Quantity', 'Amount'],
          rows: [['Total Items Sold', String(itemsSoldCount || xSummary.totalItemsSold || 0), fmt(totalSalesV)]],
        },
        {
          title: '10. Void / Cancelled Items', type: 'table',
          cols: ['Description', 'Count'],
          rows: [['Voided / Cancelled', String(totalVoids)]],
        },
      ],
    };
  };

  // ── X-Report: Excel flat rows ─────────────────────────────────────────────
  const buildXReportExcelRows = () => {
    const xSummary  = xReportData?.summary  || {};
    const xInvoices = xReportData?.invoices || [];
    const sess = xReportData?.session || currentSession;
    const fmt = (n) => Number(Number(n).toFixed(2));
    const openingCashVal  = fmt(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
    const cashSalesV      = fmt(xSummary.cashSales   ?? 0);
    const cardSalesV      = fmt(xSummary.cardSales   ?? 0);
    const creditSalesV    = fmt(xSummary.creditSales ?? 0);
    const totalSalesV     = fmt(xSummary.totalSales  ?? 0);
    const totalTaxV       = fmt(xSummary.totalTax    ?? 0);
    const salesExTaxV     = fmt(xSummary.salesAmountExTax ?? 0);
    const discountV       = fmt(xSummary.totalDiscount ?? 0);
    const cashDropIn      = fmt(xSummary.cashDropIn  ?? 0);
    const cashDropOut     = fmt(xSummary.cashDropOut ?? 0);
    const invoiceCount    = xSummary.invoiceCount ?? currentSession?.invoiceCount ?? 0;
    const expectedCash    = fmt(xSummary.expectedCash ?? (openingCashVal + cashSalesV + cashDropIn - cashDropOut));
    const actualCash      = fmt(calculateDenominationTotal(closingDenominations));
    const variance        = fmt(actualCash - expectedCash);
    const refundTotal     = fmt(sess?.totalRefunds ?? 0);
    const totalVoids      = sess?.totalVoids ?? 0;
    const denomKeys       = ['1000','500','200','100','50','20','10','5','1','0.50','0.25'];
    const denomLabels     = {'1000':'AED 1000','500':'AED 500','200':'AED 200','100':'AED 100','50':'AED 50','20':'AED 20','10':'AED 10','5':'AED 5','1':'AED 1 Coin','0.50':'AED 0.50 Coin','0.25':'AED 0.25 Coin'};

    return [
      ...denomKeys.map((k, i) => ({
        Section: i === 0 ? 'Denomination Count' : '',
        Description: denomLabels[k],
        Count: closingDenominations[k] || 0,
        Amount: fmt((closingDenominations[k] || 0) * parseFloat(k)),
      })),
      { Section: 'Cash Drawer',     Description: 'Opening Cash / Float',       Count: '',  Amount: openingCashVal },
      { Section: '',                Description: 'Cash Sales',                  Count: '',  Amount: cashSalesV },
      { Section: '',                Description: 'Cash Drop In',                Count: '',  Amount: cashDropIn },
      { Section: '',                Description: 'Cash Drop Out',               Count: '',  Amount: cashDropOut },
      { Section: '',                Description: 'Expected Cash in Drawer',     Count: '',  Amount: expectedCash },
      { Section: '',                Description: 'Actual Cash Counted',         Count: '',  Amount: actualCash },
      { Section: '',                Description: 'Cash Variance',               Count: '',  Amount: variance },
      { Section: 'Payment Tender',  Description: 'Cash',                        Count: xSummary.cashInvoiceCount   ?? 0, Amount: cashSalesV },
      { Section: '',                Description: 'Card',                        Count: xSummary.cardInvoiceCount   ?? 0, Amount: cardSalesV },
      { Section: '',                Description: 'Credit',                      Count: xSummary.creditInvoiceCount ?? 0, Amount: creditSalesV },
      { Section: '',                Description: 'Total',                       Count: invoiceCount, Amount: totalSalesV },
      { Section: 'VAT / Tax',       Description: 'VAT 5% — Taxable Amount',    Count: '',  Amount: salesExTaxV },
      { Section: '',                Description: 'VAT 5% — Tax Amount',        Count: '',  Amount: totalTaxV },
      { Section: '',                Description: 'Total Inc. VAT',              Count: '',  Amount: totalSalesV },
      { Section: 'Discount',        Description: 'Total Discount',              Count: '',  Amount: discountV },
      { Section: 'Return / Refund', Description: 'Total Refunds',               Count: totalVoids, Amount: refundTotal },
      { Section: 'Card Settlement', Description: 'Net Card Settlement',         Count: Math.max(0, (xSummary.cardInvoiceCount ?? 0) - totalVoids), Amount: fmt(Math.max(0, cardSalesV - refundTotal)) },
      { Section: 'Invoice Count',   Description: 'Total Invoices',              Count: invoiceCount, Amount: totalSalesV },
      ...xInvoices.slice(0, 200).map((inv, i) => ({
        Section: i === 0 ? 'Invoice List' : '',
        Description: inv.invoiceNumber || `Invoice #${i+1}`,
        Count: inv.paymentMode || '—',
        Amount: fmt(inv.invoiceTotal || 0),
      })),
    ];
  };

  // ── Report print/export handlers ──────────────────────────────────────────
  const handleZReportPrint = () => {
    if (!zReportData) { alert('Please generate the Z-Report first.'); return; }
    const vm  = buildZReportViewModel();
    const cp  = reportCompanyProfile();
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] });
    printHtml(html);
  };

  const handleZReportPreview = () => {
    if (!zReportData) { alert('Please generate the Z-Report first.'); return; }
    const vm  = buildZReportViewModel();
    const cp  = reportCompanyProfile();
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleZReportExportPDF = async () => {
    if (!zReportData) { alert('Please generate the Z-Report first.'); return; }
    const vm  = buildZReportViewModel();
    const cp  = reportCompanyProfile();
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] });
    const filename = `Z-Report_${zReportDate || new Date().toISOString().slice(0,10)}`;
    try { await downloadPdfViaServer(html, filename); } catch {
      const { downloadPdf } = await import('../../utils/printGenerator');
      await downloadPdf(html, filename);
    }
  };

  const handleZReportExportExcel = async () => {
    if (!zReportData) { alert('Please generate the Z-Report first.'); return; }
    const rows = buildZReportExcelSections();
    const cols = [
      { header: 'Section',     key: 'Section',      width: 22 },
      { header: 'Description', key: 'Description',  width: 32 },
      { header: 'Count',       key: 'Count',        width: 12 },
      { header: 'Amount (AED)',key: 'Amount',        width: 18 },
    ];
    const cp = reportCompanyProfile();
    await exportToExcel(rows, cols, `Z-Report_${zReportDate || new Date().toISOString().slice(0,10)}`, {
      companyProfile: cp,
      branch: cp.companyName,
      dateFrom: zReportDate,
      dateTo: zReportDate,
    });
  };

  const handleXReportPrint = () => {
    const vm  = buildXReportViewModel();
    const cp  = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0,10) }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    printHtml(html);
  };

  const handleXReportPreview = () => {
    const vm  = buildXReportViewModel();
    const cp  = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0,10) }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleXReportExportPDF = async () => {
    const vm  = buildXReportViewModel();
    const cp  = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0,10) }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    const filename = `X-Report_${sess?.id ? `SESS-${String(sess.id).padStart(6,'0')}` : new Date().toISOString().slice(0,10)}`;
    try { await downloadPdfViaServer(html, filename); } catch {
      const { downloadPdf } = await import('../../utils/printGenerator');
      await downloadPdf(html, filename);
    }
  };

  const handleXReportExportExcel = async () => {
    const rows = buildXReportExcelRows();
    const cols = [
      { header: 'Section',     key: 'Section',      width: 22 },
      { header: 'Description', key: 'Description',  width: 32 },
      { header: 'Count',       key: 'Count',        width: 16 },
      { header: 'Amount (AED)',key: 'Amount',        width: 18 },
    ];
    const cp   = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    await exportToExcel(rows, cols, `X-Report_${sess?.id ? `SESS-${String(sess.id).padStart(6,'0')}` : new Date().toISOString().slice(0,10)}`, {
      companyProfile: cp,
      branch: cp.companyName,
      dateFrom: sess?.sessionDate,
      dateTo: sess?.sessionDate,
    });
  };

  // Z-Report View
  const renderZReport = () => {
    const zSummary = zReportData?.summary || {};
    const zTotalSales = zSummary.totalSales ?? 0;
    const zCashSales = zSummary.cashSales ?? 0;
    const zCardSales = zSummary.cardSales ?? 0;
    const zCreditSales = zSummary.creditSales ?? 0;
    const zInvoiceCount = zSummary.invoiceCount ?? 0;
    const zTotalTax = zSummary.totalTax ?? 0;
    const zSalesExTax = zSummary.salesAmountExTax ?? 0;
    const zTotalDiscount = zSummary.totalDiscount ?? 0;
    const zTotalItemsSold = zSummary.totalItemsSold ?? 0;
    const zSessions = zReportData?.sessions || [];
    const zOpeningCash = zSessions.reduce((sum, s) => sum + (s.openingCash ?? 0), 0);
    const zExpectedCash = zOpeningCash + zCashSales;
    const zSessionCount = zSummary.sessionCount ?? zSessions.length;

    const zrFilterBar = (
      <div className="flex flex-wrap gap-2 items-end bg-white border border-[#327F74]/20 rounded-lg p-3 mb-4 shadow-sm">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-gray-500">Business Date</label>
          <input
            type="date"
            value={zReportDate}
            onChange={e => setZReportDate(e.target.value)}
            className="border border-[#327F74]/30 rounded px-2 py-1 text-xs text-[#1E293B] bg-[#F7F7FA] focus:outline-none focus:ring-1 focus:ring-[#327F74]"
          />
        </div>
        <button
          onClick={() => loadZReport(zReportDate)}
          disabled={zReportLoading}
          className="mt-auto bg-[#327F74] hover:bg-[#286660] disabled:opacity-50 text-white text-xs px-4 py-2 rounded flex items-center gap-1"
        >
          {zReportLoading
            ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Loading...</>
            : <><Search className="h-3 w-3" />Generate</>
          }
        </button>
      </div>
    );

    const zrInfoCard = (
      <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm p-4 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 text-xs">
            {[
              ['Report Date', zReportDate || new Date().toLocaleDateString()],
              ['Sessions', String(zSessionCount)],
              ['Report Type', 'Z-Report (End-of-Day)'],
            ].map(([k,v]) => (
              <div key={k} className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
            ))}
          </div>
          <div className="space-y-1 text-xs">
            {[
              ['Total Invoices', String(zInvoiceCount)],
              ['Total Sales', formatCurrencyStr(zTotalSales)],
              ['Cash Sales', formatCurrencyStr(zCashSales)],
              ['Card Sales', formatCurrencyStr(zCardSales)],
            ].map(([k,v]) => (
              <div key={k} className="flex gap-2"><span className="text-gray-500 w-36 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    );

    const zrKpiCards = (
      <div className="grid grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Gross Sales', value: <CurrencyAmount amount={zTotalSales} />, sub: 'Before discounts', icon: <TrendingUp className="h-4 w-4" /> },
          { label: 'Cash Sales', value: <CurrencyAmount amount={zCashSales} />, sub: 'Cash payments', icon: <Banknote className="h-4 w-4" /> },
          { label: 'Card Sales', value: <CurrencyAmount amount={zCardSales} />, sub: 'Card payments', icon: <CreditCard className="h-4 w-4" /> },
          { label: 'VAT Amount', value: <CurrencyAmount amount={zTotalTax} />, sub: '5% VAT', icon: <FileBarChart className="h-4 w-4" /> },
          { label: 'Expected Cash', value: <CurrencyAmount amount={zExpectedCash} />, sub: 'Opening + cash sales', icon: <Wallet className="h-4 w-4" /> },
          { label: 'Total Invoices', value: String(zInvoiceCount), sub: `${zSessionCount} session(s)`, icon: <FileText className="h-4 w-4" /> },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[#327F74]">{k.icon}<span className="text-xs text-gray-500">{k.label}</span></div>
            <div className="text-base font-bold text-[#1E293B]">{k.value}</div>
            {k.sub && <span className="text-xs text-gray-400">{k.sub}</span>}
          </div>
        ))}
      </div>
    );

    const ZRTable = ({ title, icon, cols, rows, footerRow }) => (
      <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
          <span className="text-[#327F74]">{icon}</span>
          <span className="text-sm text-[#1E293B]">{title}</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F7F7FA] text-gray-500">
              {cols.map((c,i) => <th key={i} className={`px-4 py-2 text-left font-medium border-b border-[#327F74]/10 ${i>0 && cols.length>2 ? 'text-right' : i===cols.length-1 && cols.length===2 ? 'text-right' : ''}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,ri) => (
              <tr key={ri} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                {r.map((cell,ci) => <td key={ci} className={`px-4 py-2 text-[#1E293B] ${ci>0 && cols.length>2 ? 'text-right' : ci===cols.length-1 && cols.length===2 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
              </tr>
            ))}
            {footerRow && (
              <tr className="bg-[#F7F7FA] border-t border-[#327F74]/20">
                {footerRow.map((cell,ci) => <td key={ci} className={`px-4 py-2 font-semibold text-[#1E293B] ${ci>0 && cols.length>2 ? 'text-right' : ci===cols.length-1 && cols.length===2 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );

    return (
    <div className="bg-[#F7F7FA] min-h-full p-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#F7F7FA] pb-3 border-b border-[#327F74]/10 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <span className="hover:text-[#327F74] cursor-pointer" onClick={() => setCurrentView('dashboard')}>Dashboard</span>
              <ChevronRight className="h-3 w-3" />
              <span>POS</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-[#327F74]">Z-Report</span>
            </div>
            <h1 className="text-xl text-[#1E293B]">Z-Report / End-of-Day Closing Report</h1>
            <p className="text-xs text-gray-500 mt-0.5">Consolidated POS closing summary for daily sales, collections, tax, cash drawer, returns, and audit verification.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleZReportPreview} disabled={!zReportData} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><Eye className="h-3 w-3" />Preview</button>
            <button onClick={handleZReportPrint} disabled={!zReportData} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><Printer className="h-3 w-3" />Print</button>
            <button onClick={handleZReportExportPDF} disabled={!zReportData} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><FileText className="h-3 w-3" />Export PDF</button>
            <button onClick={handleZReportExportExcel} disabled={!zReportData} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><Download className="h-3 w-3" />Export Excel</button>
            <button
              onClick={() => { if (window.confirm(`Close business day ${zReportDate}? This will finalize all sessions for the day.`)) loadZReport(zReportDate); }}
              disabled={zReportLoading || !zReportData}
              className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-4 py-1.5 rounded flex items-center gap-1">
              <Lock className="h-3 w-3" />Close Day
            </button>
          </div>
        </div>
      </div>

      {zrFilterBar}
      {zrInfoCard}
      {zrKpiCards}

      {/* Section 1: Sales Summary */}
      <ZRTable
        title="1. Sales Summary"
        icon={<BarChart2 className="h-4 w-4" />}
        cols={['Description', 'Amount']}
        rows={[
          ['Gross Sales', <CurrencyAmount key="z1g" amount={zTotalSales} />],
          ['Total Discount', zTotalDiscount > 0 ? `(${formatCurrencyStr(zTotalDiscount)})` : <CurrencyAmount key="z1d" amount={0} />],
          ['Net Sales Before VAT', <CurrencyAmount key="z1n" amount={zSalesExTax} />],
          ['VAT Amount (5%)', <CurrencyAmount key="z1v" amount={zTotalTax} />],
          ['Net Sales Including VAT', <span key="z1s" className="font-semibold text-[#327F74]"><CurrencyAmount amount={zTotalSales} /></span>],
        ]}
      />

      {/* Section 2: Invoice / Transaction Summary */}
      <ZRTable
        title="2. Invoice / Transaction Summary"
        icon={<FileText className="h-4 w-4" />}
        cols={['Description', 'Count', 'Amount']}
        rows={[
          ['Total Sales Invoices', String(zInvoiceCount), <CurrencyAmount key="z2s" amount={zTotalSales} />],
        ]}
      />

      {/* Section 3: Payment / Tender Summary */}
      <ZRTable
        title="3. Payment / Tender Summary"
        icon={<CreditCard className="h-4 w-4" />}
        cols={['Payment Mode', 'Count', 'Amount']}
        rows={[
          ['Cash', zSummary.cashInvoiceCount ?? '—', <CurrencyAmount key="z3c" amount={zCashSales} />],
          ['Card', zSummary.cardInvoiceCount ?? '—', <CurrencyAmount key="z3d" amount={zCardSales} />],
          ['Credit', zSummary.creditInvoiceCount ?? '—', <CurrencyAmount key="z3cr" amount={zCreditSales} />],
        ]}
        footerRow={['Total Collected', String(zInvoiceCount), <span key="z3t" className="text-[#327F74]"><CurrencyAmount amount={zTotalSales} /></span>]}
      />

      {/* Section 4: Cash Drawer Summary */}
      <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
          <span className="text-[#327F74]"><Banknote className="h-4 w-4" /></span>
          <span className="text-sm text-[#1E293B]">4. Cash Drawer Summary</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F7F7FA] text-gray-500">
              <th className="px-4 py-2 text-left font-medium border-b border-[#327F74]/10">Description</th>
              <th className="px-4 py-2 text-right font-medium border-b border-[#327F74]/10">Amount</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Opening Cash / Float', <CurrencyAmount key="z4oc" amount={zOpeningCash} />],
              ['Cash Sales', <CurrencyAmount key="z4cs" amount={zCashSales} />],
              ['Expected Cash in Drawer', <CurrencyAmount key="z4ec" amount={zExpectedCash} />],
            ].map(([d,a], i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                <td className="px-4 py-2 text-[#1E293B]">{d}</td>
                <td className="px-4 py-2 text-right text-[#1E293B]">{a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 5: Card / Bank Settlement Summary */}
      <ZRTable
        title="5. Card / Bank Settlement Summary"
        icon={<CreditCard className="h-4 w-4" />}
        cols={['Description', 'Amount']}
        rows={[
          ['Total Card Sales', <CurrencyAmount key="z5c" amount={zCardSales} />],
          ['Net Card Settlement Expected', <CurrencyAmount key="z5n" amount={zCardSales} />],
        ]}
      />

      {/* Section 6: VAT / Tax Summary */}
      <ZRTable
        title="6. VAT / Tax Summary"
        icon={<FileBarChart className="h-4 w-4" />}
        cols={['Tax Type', 'Taxable Amount', 'Tax Amount', 'Total Amount']}
        rows={[
          ['VAT 5%',
            <CurrencyAmount key="z6t" amount={zSalesExTax} />,
            <CurrencyAmount key="z6a" amount={zTotalTax} />,
            <CurrencyAmount key="z6g" amount={zTotalSales} />],
        ]}
        footerRow={[
          'Total',
          <CurrencyAmount key="z6ft" amount={zSalesExTax} />,
          <CurrencyAmount key="z6fa" amount={zTotalTax} />,
          <span key="z6fg" className="text-[#327F74]"><CurrencyAmount amount={zTotalSales} /></span>
        ]}
      />

      {/* Section 7: Discount Summary */}
      <ZRTable
        title="7. Discount Summary"
        icon={<Tag className="h-4 w-4" />}
        cols={['Description', 'Amount']}
        rows={[
          ['Total Discount', zTotalDiscount > 0 ? `(${formatCurrencyStr(zTotalDiscount)})` : <CurrencyAmount key="z7d" amount={0} />],
        ]}
      />

      {/* Section 8: Item Movement Summary */}
      <ZRTable
        title="8. Item Movement Summary"
        icon={<Package className="h-4 w-4" />}
        cols={['Description', 'Quantity', 'Amount']}
        rows={[
          ['Total Items Sold', String(zTotalItemsSold), <CurrencyAmount key="z8s" amount={zTotalSales} />],
          ['Net Quantity Sold', String(zTotalItemsSold), <CurrencyAmount key="z8n" amount={zTotalSales} />],
        ]}
      />

      {/* Section 10: Cashier Wise Summary (derived from sessions) */}
      {(() => {
        const cashierRows = zSessions.map(s => [
          s.openedBy || '—',
          String(s.invoiceCount || 0),
          <CurrencyAmount key={`c10ns${s.id}`} amount={s.totalSales ?? 0} />,
          <CurrencyAmount key={`c10ca${s.id}`} amount={s.totalCashSales ?? 0} />,
          <CurrencyAmount key={`c10cd${s.id}`} amount={s.totalCardSales ?? 0} />,
          <CurrencyAmount key={`c10cr${s.id}`} amount={s.totalCreditSales ?? 0} />,
        ]);
        return (
          <ZRTable
            title="10. Cashier / Session Wise Summary"
            icon={<Users className="h-4 w-4" />}
            cols={['Cashier', 'Invoice Count', 'Net Sales', 'Cash', 'Card', 'Credit']}
            rows={cashierRows.length > 0 ? cashierRows : [['—', '0', <CurrencyAmount key="c10e" amount={0} />, <CurrencyAmount key="c10e2" amount={0} />, <CurrencyAmount key="c10e3" amount={0} />, <CurrencyAmount key="c10e4" amount={0} />]]}
            footerRow={['Total', String(zInvoiceCount), <CurrencyAmount key="c10tf" amount={zTotalSales} />, <CurrencyAmount key="c10cf" amount={zCashSales} />, <CurrencyAmount key="c10df" amount={zCardSales} />, <CurrencyAmount key="c10rf" amount={zCreditSales} />]}
          />
        );
      })()}

      {/* Section 11: Customer Credit Summary (derived from invoice data) */}
      {(() => {
        const zInvoices = zReportData?.invoices || [];
        const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
        const creditTotal = creditInvoices.reduce((s, inv) => s + (Number(inv.invoiceTotal) || 0), 0);
        return (
          <ZRTable
            title="11. Customer Credit Summary"
            icon={<UserCheck className="h-4 w-4" />}
            cols={['Description', 'Count', 'Amount']}
            rows={[
              ['Credit Sales', String(creditInvoices.length), <CurrencyAmount key="z11c" amount={creditTotal} />],
              ['Outstanding Created Today', String(creditInvoices.length), <CurrencyAmount key="z11o" amount={creditTotal} />],
            ]}
          />
        );
      })()}

      {/* Section 12: Opening and Closing Invoice Numbers (derived from invoices) */}
      {(() => {
        const zInvoices = zReportData?.invoices || [];
        const invNums = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();
        const firstInv = invNums[0] || '—';
        const lastInv = invNums[invNums.length - 1] || '—';
        return (
          <ZRTable
            title="12. Opening &amp; Closing Invoice Numbers"
            icon={<Hash className="h-4 w-4" />}
            cols={['Document Type', 'Starting No.', 'Ending No.']}
            rows={[
              ['Sales Invoice', firstInv, lastInv],
            ]}
          />
        );
      })()}

      {/* Section 13: Final Day Close Summary */}
      {(() => {
        const zId = zReportData?.sessions?.[0]?.id;
        const reportNo = zId ? `ZR-${String(zId).padStart(9,'0')}` : `ZR-${zReportDate?.replace(/-/g,'')}-001`;
        const totalExpectedCash = zOpeningCash + zCashSales;
        return (
          <div className="bg-[#1E293B] border border-[#327F74]/40 rounded-lg shadow p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-4 w-4 text-[#F5C742]" />
              <span className="text-sm text-white">13. Final Day Close Summary</span>
              <span className="ml-auto text-xs bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded">Z-Report #{reportNo}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Total Net Sales Inc. VAT', <CurrencyAmount key="z13a" amount={zTotalSales} />, 'text-[#F5C742]'],
                ['Total Discount', <CurrencyAmount key="z13b" amount={zTotalDiscount} />, 'text-red-400'],
                ['Total Collection', <CurrencyAmount key="z13c" amount={zTotalSales} />, 'text-[#F5C742]'],
                ['Opening Cash / Float', <CurrencyAmount key="z13d" amount={zOpeningCash} />, 'text-white'],
                ['Expected Cash in Drawer', <CurrencyAmount key="z13e" amount={totalExpectedCash} />, 'text-white'],
                ['Cash Sales', <CurrencyAmount key="z13f" amount={zCashSales} />, 'text-green-400'],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-white/5 rounded p-2">
                  <div className="text-xs text-gray-400">{l}</div>
                  <div className={`text-sm font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Declaration & Verification */}
      <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-[#327F74]" />
          <span className="text-sm text-[#1E293B]">Declaration &amp; Verification</span>
        </div>
        <p className="text-xs text-gray-600 mb-4 bg-[#F7F7FA] rounded p-2 border-l-2 border-[#327F74]">
          I confirm that the above sales, collections, returns, and cash drawer details have been verified and closed for the selected business date / shift.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500">Cashier Signature</label>
            <div className="mt-1 border border-[#327F74]/30 rounded h-12 bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400">Sign here</div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Supervisor / Manager Signature</label>
            <div className="mt-1 border border-[#327F74]/30 rounded h-12 bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400">Sign here</div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Closing Remarks</label>
            <textarea className="mt-1 w-full border border-[#327F74]/30 rounded h-12 bg-[#F7F7FA] text-xs p-1.5 text-[#1E293B] resize-none focus:outline-none focus:ring-1 focus:ring-[#327F74]" placeholder="Enter remarks..." />
          </div>
        </div>
      </div>

      {/* System Notes */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-1 mb-1.5">
          <Info className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs text-amber-700">System Notes</span>
        </div>
        <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
          <li>Once Z-Report is generated and day is closed, no direct edit is allowed for that closed POS session.</li>
          <li>Any correction after Z-Report should be handled through authorized adjustment entries, credit notes, or manager-approved transactions.</li>
          <li>Z-Report is printable in A4 and POS thermal format.</li>
          <li>Report is filterable by Branch, POS Terminal, Cashier, Shift, and Business Date.</li>
          <li>Z-Report number is auto-generated and stored for audit based on session ID.</li>
        </ul>
      </div>
    </div>
  );
  };

  // X-Report View (Session Close Report)
  const renderXReport = () => {
    const denomKeys = ['1000','500','200','100','50','20','10','5','1','0.50','0.25'];
    const denomLabels = {'1000':'AED 1000','500':'AED 500','200':'AED 200','100':'AED 100','50':'AED 50','20':'AED 20','10':'AED 10','5':'AED 5','1':'AED 1 Coin','0.50':'AED 0.50 Coin','0.25':'AED 0.25 Coin'};
    const actualCash = calculateDenominationTotal(closingDenominations);

    // Pull live figures from xReportData when available, fall back to session state
    const xSummary = xReportData?.summary || {};
    const openingCashVal = xSummary.openingCash ?? currentSession?.openingCash ?? 0;
    const cashSales = xSummary.cashSales ?? 0;
    const cashDropIn = xSummary.cashDropIn ?? 0;
    const cashDropOut = xSummary.cashDropOut ?? 0;
    const totalSales = xSummary.totalSales ?? 0;
    const cardSales = xSummary.cardSales ?? 0;
    const creditSales = xSummary.creditSales ?? 0;
    const invoiceCount = xSummary.invoiceCount ?? currentSession?.invoiceCount ?? 0;
    const expectedCashVal = xSummary.expectedCash ?? (openingCashVal + cashSales + cashDropIn - cashDropOut);

    const cashVariance = actualCash - expectedCashVal;
    const isBalanced = actualCash === 0 || Math.abs(cashVariance) < 0.01;
    const varStatus = actualCash === 0 ? 'Pending Count' : isBalanced ? 'Balanced' : cashVariance < 0 ? 'Short' : 'Excess';
    const varColor = actualCash === 0 ? 'text-gray-500 bg-gray-50' : isBalanced ? 'text-green-600 bg-green-50' : cashVariance < 0 ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50';

    const XRTable = ({ title, icon, cols, rows, footerRow, highlightLast }) => (
      <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
          <span className="text-[#327F74]">{icon}</span>
          <span className="text-sm text-[#1E293B]">{title}</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F7F7FA] text-gray-500">
              {cols.map((c,i) => <th key={i} className={`px-4 py-2 text-left font-medium border-b border-[#327F74]/10 ${i>0?'text-right':''}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,ri) => (
              <tr key={ri} className={`border-b border-gray-50 ${highlightLast && ri===rows.length-1 ? 'bg-[#FFF8DC]' : 'hover:bg-[#F7F7FA]/60'}`}>
                {r.map((cell,ci) => <td key={ci} className={`px-4 py-2 text-[#1E293B] ${ci>0?'text-right':''} ${highlightLast && ri===rows.length-1 ? 'font-semibold' : ''}`}>{renderAED(cell)}</td>)}
              </tr>
            ))}
            {footerRow && (
              <tr className="bg-[#F5C742]/10 border-t border-[#F5C742]/30">
                {footerRow.map((cell,ci) => <td key={ci} className={`px-4 py-2 font-semibold text-[#1E293B] ${ci>0?'text-right':''}`}>{renderAED(cell)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );

    return (
    <div className="bg-[#F7F7FA] min-h-full flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#F7F7FA] border-b border-[#327F74]/10 px-6 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <span className="hover:text-[#327F74] cursor-pointer" onClick={() => setCurrentView('dashboard')}>Dashboard</span>
              <ChevronRight className="h-3 w-3" />
              <span>POS</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-[#327F74]">X-Report / Close Session</span>
            </div>
            <h1 className="text-xl text-[#1E293B]">X-Report / Close Session</h1>
            <p className="text-xs text-gray-500 mt-0.5">Close the current POS session, verify cash drawer balance, enter denomination count, and generate the session closing report.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleXReportPreview} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><Eye className="h-3 w-3" />Preview</button>
            <button onClick={handleXReportExportPDF} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><FileText className="h-3 w-3" />Export PDF</button>
            <button onClick={handleXReportExportExcel} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><Download className="h-3 w-3" />Export Excel</button>
            <button onClick={handleXReportPrint} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><Printer className="h-3 w-3" />Print</button>
            <button onClick={loadXReport} disabled={xReportLoading} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-50">
              {xReportLoading ? <><div className="w-3 h-3 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin" />Loading...</> : <><FileBarChart className="h-3 w-3" />Generate X-Report</>}
            </button>
            <button
              onClick={() => { if (currentSession?.status === 'OPEN') setShowCloseSessionDialog(true); }}
              disabled={currentSession?.status !== 'OPEN'}
              className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-4 py-1.5 rounded flex items-center gap-1">
              <Lock className="h-3 w-3" />{currentSession?.status === 'CLOSED' ? 'Session Closed' : 'Close Session'}
            </button>
          </div>
        </div>
        {/* Status strip */}
        {(() => {
          const sessStatus = (xReportData?.session?.status || currentSession?.status || 'OPEN').toUpperCase();
          const sessId = xReportData?.session?.id || currentSession?.id;
          const reportNo = sessId ? `XR-${String(sessId).padStart(9, '0')}` : '—';
          const sessionStatusColor = sessStatus === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600';
          return (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Session Status:</span><span className={`text-xs rounded px-2 py-0.5 ${sessionStatusColor}`}>{sessStatus === 'OPEN' ? 'Open' : sessStatus === 'CLOSED' ? 'Closed' : sessStatus}</span></div>
              <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Cash Status:</span><span className={`text-xs rounded px-2 py-0.5 ${isBalanced ? 'bg-green-100 text-green-700' : cashVariance < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{actualCash === 0 ? 'Pending' : varStatus}</span></div>
              <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Supervisor Approval:</span><span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{!isBalanced && actualCash > 0 ? 'Required' : 'Not Required'}</span></div>
              <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Report No.:</span><span className="text-xs text-[#327F74]">{reportNo}</span></div>
            </div>
          );
        })()}
      </div>

      <div className="p-6 flex-1">
        {/* Filter / Session Info Bar */}
        {(() => {
          const sess = xReportData?.session || currentSession;
          const sessionNo = sess?.id ? `SESS-${String(sess.id).padStart(9, '0')}` : '—';
          const businessDate = sess?.sessionDate || new Date().toISOString().slice(0, 10);
          const branchName = sess?.branchName || currentTerminal?.branchName || '—';
          const terminalId = sess?.terminalId || currentTerminal?.terminalId || '—';
          const cashier = sess?.openedBy || '—';
          const openedAt = sess?.openedAt ? new Date(sess.openedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
          const currentTime = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
          return (
            <div className="flex flex-wrap gap-2 items-end bg-white border border-[#327F74]/20 rounded-lg p-3 mb-4 shadow-sm">
              {[
                {label:'Business Date', val: businessDate, type:'date'},
                {label:'Branch / Outlet', val: branchName, type:'text'},
                {label:'POS Terminal', val: terminalId, type:'text'},
                {label:'Cashier', val: cashier, type:'text'},
                {label:'Session No.', val: sessionNo, type:'text'},
                {label:'Session Opened Time', val: openedAt, type:'text'},
                {label:'Current Time', val: currentTime, type:'text'},
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-xs text-gray-500">{f.label}</label>
                  <input readOnly value={f.val} type={f.type==='date'?'date':'text'} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs text-[#1E293B] bg-[#F7F7FA] focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                </div>
              ))}
              <button onClick={loadXReport} className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-4 py-2 rounded flex items-center gap-1"><Search className="h-3 w-3" />Refresh</button>
            </div>
          );
        })()}

        {/* Session Information Card */}
        {xReportLoading && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Loading session data...
          </div>
        )}
        <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm p-4 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 text-xs">
              {[
                ['Branch / Outlet', xReportData?.session?.branchName || currentSession?.branchName || '—'],
                ['POS Terminal', xReportData?.session?.terminalId || currentTerminal?.terminalId || '—'],
                ['Counter', xReportData?.session?.counterName || currentTerminal?.counterName || '—'],
                ['Report Type', 'X-Report / Close Session Report'],
              ].map(([k,v]) => (
                <div key={k} className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
              ))}
            </div>
            <div className="space-y-1 text-xs">
              {[
                ['Session No.', xReportData?.session?.id ? `SESS-${String(xReportData.session.id).padStart(6,'0')}` : currentSession?.id ? `SESS-${String(currentSession.id).padStart(6,'0')}` : '—'],
                ['Business Date', xReportData?.session?.sessionDate || currentSession?.sessionDate || new Date().toLocaleDateString()],
                ['Cashier', xReportData?.session?.openedBy || currentSession?.openedBy || '—'],
                ['Opened At', xReportData?.session?.openedAt ? new Date(xReportData.session.openedAt).toLocaleTimeString() : currentSession?.openedAt ? new Date(currentSession.openedAt).toLocaleTimeString() : '—'],
                ['Status', xReportData?.session?.status || currentSession?.status || 'OPEN'],
                ['Invoice Count', String(invoiceCount)],
              ].map(([k,v]) => (
                <div key={k} className="flex gap-2"><span className="text-gray-500 w-40 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {[
            {label:'Opening Cash / Float',value:<CurrencyAmount amount={openingCashVal} />,icon:<Wallet className="h-4 w-4" />},
            {label:'Total Sales',value:<CurrencyAmount amount={totalSales} />,icon:<TrendingUp className="h-4 w-4" />},
            {label:'Cash Sales',value:<CurrencyAmount amount={cashSales} />,icon:<Banknote className="h-4 w-4" />},
            {label:'Card Sales',value:<CurrencyAmount amount={cardSales} />,icon:<CreditCard className="h-4 w-4" />},
            {label:'Expected Cash',value:<CurrencyAmount amount={expectedCashVal} />,icon:<Calculator className="h-4 w-4" />},
            {label:'Actual Cash Counted',value:<CurrencyAmount amount={actualCash} />,icon:<CheckCircle className="h-4 w-4" />},
            {label:'Cash Variance',value:<CurrencyAmount amount={Math.abs(cashVariance)} />,icon:<AlertCircle className="h-4 w-4" />,badge:actualCash===0?'Pending':varStatus,badgeColor:isBalanced?'bg-green-100 text-green-700':cashVariance<0?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'},
          ].map(k => (
            <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[#327F74]">{k.icon}<span className="text-xs text-gray-400 leading-tight">{k.label}</span></div>
              <div className="text-sm font-bold text-[#1E293B]">{k.value}</div>
              {k.badge && <span className={`text-xs rounded px-1.5 py-0.5 w-fit ${k.badgeColor}`}>{k.badge}</span>}
            </div>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-2 gap-4">
          {/* LEFT COLUMN */}
          <div>
            {/* Section 1: Denomination Count */}
            <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                <span className="text-[#327F74]"><Calculator className="h-4 w-4" /></span>
                <span className="text-sm text-[#1E293B]">1. Denomination Count</span>
              </div>
              <div className="px-4 py-2">
                <p className="text-xs text-gray-500 mb-2">Enter the physical cash count available in the drawer before closing the session.</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F7F7FA] text-gray-500">
                      <th className="px-2 py-1.5 text-left font-medium">Denomination</th>
                      <th className="px-2 py-1.5 text-right font-medium">Quantity</th>
                      <th className="px-2 py-1.5 text-right font-medium">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {denomKeys.map(k => (
                      <tr key={k} className="border-t border-gray-50">
                        <td className="px-2 py-1.5 text-[#1E293B]">{renderAED(denomLabels[k])}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            value={closingDenominations[k] || 0}
                            onChange={e => setClosingDenominations({...closingDenominations, [k]: parseInt(e.target.value)||0})}
                            className="w-16 border border-[#327F74]/30 rounded px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#1E293B]">
                          <DirhamSymbol /> {(parseFloat(k) * (closingDenominations[k]||0)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#F5C742]/30 bg-[#FFF8DC] px-2 py-1.5 rounded">
                  <span className="text-xs font-semibold text-[#1E293B]">Total Cash Counted</span>
                  <span className="text-sm font-bold text-[#327F74]"><DirhamSymbol /> {actualCash.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Section 2: Cash Drawer Expected */}
            <XRTable
              title="2. Cash Drawer Expected Amount"
              icon={<Banknote className="h-4 w-4" />}
              cols={['Description','Amount']}
              rows={[
                ['Opening Cash / Float',<CurrencyAmount key="oc" amount={openingCashVal} />],
                ['Cash Sales',<CurrencyAmount key="cs" amount={cashSales} />],
                ['Cash Paid In',<CurrencyAmount key="ci" amount={cashDropIn} />],
                ['Less: Cash Paid Out',cashDropOut > 0 ? `(${formatCurrencyStr(cashDropOut)})` : <CurrencyAmount key="co" amount={0} />],
                ['Expected Cash in Drawer',<span key="ec" className="font-bold text-[#327F74]"><CurrencyAmount amount={expectedCashVal} /></span>],
              ]}
              highlightLast
            />

            {/* Section 3: Cash Variance Summary */}
            <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                <span className="text-[#327F74]"><AlertCircle className="h-4 w-4" /></span>
                <span className="text-sm text-[#1E293B]">3. Cash Variance Summary</span>
              </div>
              <div className="p-4 space-y-2 text-xs">
                {[
                  ['Expected Cash in Drawer',<CurrencyAmount amount={expectedCashVal} />,'text-[#1E293B]'],
                  ['Actual Cash Counted',<CurrencyAmount amount={actualCash} />,'text-[#1E293B]'],
                  ['Cash Difference / Variance',<>{cashVariance<0?'(':''}<CurrencyAmount amount={Math.abs(cashVariance)} />{cashVariance<0?')':''}</>, cashVariance<0?'text-red-600':cashVariance>0?'text-amber-600':'text-green-600'],
                ].map(([l,v,c]) => (
                  <div key={l} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-gray-600">{l}</span>
                    <span className={`font-semibold ${c}`}>{v}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-gray-600">Cash Status:</span>
                  <span className={`text-xs rounded px-2 py-0.5 font-semibold ${isBalanced?'bg-green-100 text-green-700':cashVariance<0?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>
                    {actualCash===0?'Pending — Enter Count':varStatus}
                  </span>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-500 mb-1 block">Variance Reason / Remarks {!isBalanced && actualCash>0 && <span className="text-red-500">*</span>}</label>
                  <textarea
                    value={xReportVarianceRemarks}
                    onChange={e => setXReportVarianceRemarks(e.target.value)}
                    placeholder="Enter variance reason..."
                    className="w-full border border-[#327F74]/30 rounded p-2 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]"
                  />
                </div>
                {!isBalanced && actualCash>0 && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-700">Variance exceeds allowed limit. Supervisor approval is required to close session.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 13: Manual Actions */}
            {(() => {
              const xInvoices = xReportData?.invoices || [];
              const discountCount = xInvoices.filter(i => (Number(i.billDiscountAmount) || 0) > 0).length;
              const discountTotal = xInvoices.reduce((s, i) => s + (Number(i.billDiscountAmount) || 0), 0);
              return (
                <XRTable
                  title="13. Manual Actions / Exception Summary"
                  icon={<AlertTriangle className="h-4 w-4" />}
                  cols={['Action Type','Count','Remarks']}
                  rows={[
                    ['Manual Discount', String(discountCount), discountTotal > 0 ? formatCurrencyStr(discountTotal) : '—'],
                    ['Item Void', String(xSummary.voidItemCount ?? 0), xSummary.voidItemCount > 0 ? `${xSummary.voidItemCount} items` : '—'],
                    ['Session Reopened','0','—'],
                  ]}
                />
              );
            })()}

            {/* Section 14: Checklist */}
            <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                <span className="text-[#327F74]"><CheckCircle className="h-4 w-4" /></span>
                <span className="text-sm text-[#1E293B]">14. Close Session Confirmation</span>
              </div>
              <div className="p-4 space-y-2">
                {([
                  ['cashCount','Cash Count Completed'],
                  ['varianceReviewed','Variance Reviewed'],
                  ['cardSettlement','Card Settlement Verified'],
                  ['holdBills','Pending Hold Bills Checked'],
                  ['supervisorApproval','Supervisor Approval'],
                  ['sessionClosed','Session Closed Successfully'],
                ]).map(([key,label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={xReportChecklist[key]}
                      onChange={e => setXReportChecklist({...xReportChecklist,[key]:e.target.checked})}
                      className="h-3.5 w-3.5 accent-[#327F74] rounded"
                    />
                    <span className={`text-xs ${xReportChecklist[key]?'text-green-700 line-through':'text-[#1E293B]'}`}>{label}</span>
                    {xReportChecklist[key] && <span className="text-xs text-green-500 ml-auto">&#x2713;</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            {/* Section 4: Payment / Tender Summary */}
            <XRTable
              title="4. Payment / Tender Summary"
              icon={<CreditCard className="h-4 w-4" />}
              cols={['Payment Mode','Count','Amount']}
              rows={[
                ['Cash', xSummary.cashInvoiceCount ?? '—', <CurrencyAmount key="cs4" amount={cashSales} />],
                ['Card', xSummary.cardInvoiceCount ?? '—', <CurrencyAmount key="cd4" amount={cardSales} />],
                ['Credit', xSummary.creditInvoiceCount ?? '—', <CurrencyAmount key="cr4" amount={creditSales} />],
              ].filter(r => r[2] !== undefined)}
              footerRow={['Total Collection', String(invoiceCount), <CurrencyAmount key="tc4" amount={totalSales} />]}
            />

            {/* Section 5: Card / Bank Settlement */}
            {(() => {
              const xInvoices = xReportData?.invoices || [];
              const cardInvoices = xInvoices.filter(inv => {
                const m = (inv.paymentMode || '').toLowerCase();
                return m.includes('card') || m.includes('credit card');
              });
              const bankInvoices = xInvoices.filter(inv => {
                const m = (inv.paymentMode || '').toLowerCase();
                return m.includes('bank') || m.includes('transfer');
              });
              const onlineInvoices = xInvoices.filter(inv => {
                const m = (inv.paymentMode || '').toLowerCase();
                return m.includes('online') || m.includes('wallet');
              });
              const cardPayTotal = cardInvoices.reduce((s,i)=>s+(Number(i.invoiceTotal)||0),0);
              const refundTotal = Number(xReportData?.session?.totalRefunds ?? 0);
              const netCardSettle = cardPayTotal - refundTotal;
              const bankTotal = bankInvoices.reduce((s,i)=>s+(Number(i.invoiceTotal)||0),0);
              const onlineTotal = onlineInvoices.reduce((s,i)=>s+(Number(i.invoiceTotal)||0),0);
              const cardRows = [
                ['Card Payments', String(cardInvoices.length), <CurrencyAmount key="cs5cp" amount={cardPayTotal} />],
                ['Card Refunds', String(xReportData?.session?.totalVoids ?? 0), refundTotal > 0 ? <span key="cs5rf" className="text-red-600">({formatCurrencyStr(refundTotal)})</span> : <CurrencyAmount key="cs5rf0" amount={0} />],
                ['Net Card Settlement', String(Math.max(0, cardInvoices.length - (xReportData?.session?.totalVoids ?? 0))), <CurrencyAmount key="cs5nc" amount={netCardSettle} />],
                ...(bankTotal > 0 ? [['Bank Transfer Payments', String(bankInvoices.length), <CurrencyAmount key="cs5bt" amount={bankTotal} />]] : []),
                ...(onlineTotal > 0 ? [['Online / Wallet Payments', String(onlineInvoices.length), <CurrencyAmount key="cs5ow" amount={onlineTotal} />]] : []),
              ];
              return (
                <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                    <span className="text-[#327F74]"><CreditCard className="h-4 w-4" /></span>
                    <span className="text-sm text-[#1E293B]">5. Card / Bank Settlement Summary</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="bg-[#F7F7FA] text-gray-500">{['Description','Count','Amount'].map((c,i)=><th key={i} className={`px-4 py-2 text-left font-medium border-b border-[#327F74]/10 ${i>0?'text-right':''}`}>{c}</th>)}</tr></thead>
                    <tbody>
                      {cardRows.map((r,i)=>(
                        <tr key={i} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                          {r.map((cell,ci)=><td key={ci} className={`px-4 py-2 text-[#1E293B] ${ci>0?'text-right':''}`}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 border-t border-[#327F74]/10 flex items-center gap-6">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">Card Machine Batch No.</label>
                      <input value={xReportCardBatchNo} onChange={e=>setXReportCardBatchNo(e.target.value)} placeholder="BATCH-001" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Card Settlement Verified:</label>
                      <button onClick={()=>setXReportCardVerified(!xReportCardVerified)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${xReportCardVerified?'bg-[#327F74]':'bg-gray-200'}`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${xReportCardVerified?'translate-x-4':'translate-x-0.5'}`} />
                      </button>
                      <span className={`text-xs ${xReportCardVerified?'text-green-600':'text-gray-400'}`}>{xReportCardVerified?'Yes':'No'}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Section 6: Session Summary */}
            <XRTable
              title="6. Session Summary"
              icon={<BarChart2 className="h-4 w-4" />}
              cols={['Description','Value']}
              rows={[
                ['Opening Cash / Float',<CurrencyAmount key="s6oc" amount={openingCashVal} />],
                ['Total Sales Invoices', String(invoiceCount)],
                ['Total Sales Amount',<CurrencyAmount key="s6ts" amount={xSummary.salesAmountExTax ?? totalSales} />],
                ['Total Discount',xSummary.totalDiscount > 0 ? `(${formatCurrencyStr(xSummary.totalDiscount ?? 0)})` : <CurrencyAmount key="s6td" amount={0} />],
                ['VAT Amount',<CurrencyAmount key="s6vat" amount={xSummary.totalTax ?? 0} />],
                ['Net Sales Including VAT',<span key="s6ns" className="font-bold text-[#327F74]"><CurrencyAmount amount={totalSales} /></span>],
              ]}
              highlightLast
            />

            {/* Section 7: Invoice / Transaction Summary */}
            <XRTable
              title="7. Invoice / Transaction Summary"
              icon={<FileText className="h-4 w-4" />}
              cols={['Description','Count','Amount']}
              rows={[
                ['Sales Invoices', String(invoiceCount), <CurrencyAmount key="s7si" amount={totalSales} />],
                ['Void Items', String(xSummary.voidItemCount ?? 0), '—'],
              ]}
            />

            {/* Section 8: Discount & Promotion Summary */}
            {(() => {
              const xInvoices = xReportData?.invoices || [];
              const billDiscountCount = xInvoices.filter(i => (Number(i.billDiscountAmount) || 0) > 0).length;
              const billDiscountTotal = xInvoices.reduce((s, i) => s + (Number(i.billDiscountAmount) || 0), 0);
              const totalDiscount = xSummary.totalDiscount ?? billDiscountTotal;
              return (
                <XRTable
                  title="8. Discount Summary"
                  icon={<Tag className="h-4 w-4" />}
                  cols={['Discount Type','Count','Amount']}
                  rows={[
                    ['Bill Level Discount', String(billDiscountCount), <CurrencyAmount key="d8b" amount={billDiscountTotal} />],
                  ]}
                  footerRow={['Total Discount', String(billDiscountCount), totalDiscount > 0 ? `(${formatCurrencyStr(totalDiscount)})` : <CurrencyAmount key="d8t" amount={0} />]}
                />
              );
            })()}

            {/* Section 9: Returns / Refund Summary */}
            <XRTable
              title="9. Returns / Refund Summary"
              icon={<RotateCcw className="h-4 w-4" />}
              cols={['Description','Count','Amount']}
              rows={[
                ['Total Refunds', String(xReportData?.session?.totalVoids ?? 0), <CurrencyAmount key="r9r" amount={xReportData?.session?.totalRefunds ?? 0} />],
              ]}
            />

            {/* Section 10: VAT / Tax Summary */}
            <XRTable
              title="10. VAT / Tax Summary"
              icon={<FileBarChart className="h-4 w-4" />}
              cols={['Tax Type','Taxable Amount','Tax Amount','Total Amount']}
              rows={[
                ['VAT 5%',
                  <CurrencyAmount key="vat5t" amount={xSummary.salesAmountExTax ?? 0} />,
                  <CurrencyAmount key="vat5a" amount={xSummary.totalTax ?? 0} />,
                  <CurrencyAmount key="vat5g" amount={totalSales} />],
              ]}
              footerRow={[
                'Total',
                <CurrencyAmount key="vatft" amount={xSummary.salesAmountExTax ?? 0} />,
                <CurrencyAmount key="vatfa" amount={xSummary.totalTax ?? 0} />,
                <CurrencyAmount key="vatfg" amount={totalSales} />
              ]}
            />

            {/* Section 11: Item Movement */}
            <XRTable
              title="11. Item Movement Summary"
              icon={<Package className="h-4 w-4" />}
              cols={['Description','Quantity','Amount']}
              rows={[
                ['Total Items Sold', String(xSummary.totalItemsSold ?? 0), <CurrencyAmount key="im1" amount={totalSales} />],
                ['Net Quantity Sold', String(xSummary.totalItemsSold ?? 0), <CurrencyAmount key="im3" amount={totalSales} />],
              ]}
            />

            {/* Section 12: Document Numbers */}
            {(() => {
              const xInvoices = xReportData?.invoices || [];
              const invNums = xInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();
              const firstInv = invNums[0] || '—';
              const lastInv = invNums[invNums.length - 1] || '—';
              return (
                <XRTable
                  title="12. Opening & Closing Document Numbers"
                  icon={<Hash className="h-4 w-4" />}
                  cols={['Document Type','Starting No.','Ending No.']}
                  rows={[
                    ['Sales Invoice', firstInv, lastInv],
                  ]}
                />
              );
            })()}

            {/* Section 15: Declaration & Approval */}
            <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                <span className="text-[#327F74]"><Shield className="h-4 w-4" /></span>
                <span className="text-sm text-[#1E293B]">15. Declaration &amp; Approval</span>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-600 mb-3 bg-[#F7F7FA] rounded p-2 border-l-2 border-[#327F74]">
                  I confirm that the above sales, collections, refunds, cash drawer balance, and denomination count have been verified for this POS session.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Cashier Name</label>
                    <input value={xReportCashierName} onChange={e=>setXReportCashierName(e.target.value)} className="mt-0.5 w-full border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Supervisor / Manager Name</label>
                    <input value={xReportSupervisorName} onChange={e=>setXReportSupervisorName(e.target.value)} placeholder="Enter name" className="mt-0.5 w-full border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Cashier Signature</label>
                    <div className="mt-0.5 border border-[#327F74]/30 rounded h-10 bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400">Sign here</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Supervisor Signature</label>
                    <div className="mt-0.5 border border-[#327F74]/30 rounded h-10 bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400">Sign here</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Closing Remarks</label>
                    <textarea value={xReportClosingRemarks} onChange={e=>setXReportClosingRemarks(e.target.value)} placeholder="Enter remarks..." className="mt-0.5 w-full border border-[#327F74]/30 rounded p-2 text-xs resize-none h-14 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                  </div>
                </div>
              </div>
            </div>

            {/* System Control Notes */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-1 mb-1.5"><Info className="h-3.5 w-3.5 text-amber-600" /><span className="text-xs text-amber-700">System Control Notes</span></div>
              <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                <li>X-Report must be generated before closing the current cashier/POS session.</li>
                <li>Cashier cannot close session without entering denomination count.</li>
                <li>If cash variance exists, remarks are mandatory.</li>
                <li>If variance exceeds allowed limit, supervisor approval is required.</li>
                <li>After session close, no further billing is allowed in the same session.</li>
                <li>Session can be reopened only with supervisor or admin approval.</li>
                <li>X-Report is printable in POS thermal format and A4 format.</li>
                <li>X-Report number auto-generated for audit: <strong>{xReportData?.session?.id ? `XR-${String(xReportData.session.id).padStart(9,'0')}` : currentSession?.id ? `XR-${String(currentSession.id).padStart(9,'0')}` : 'XR-—'}</strong></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer Action Bar */}
      <div className="sticky bottom-0 bg-white border-t border-[#327F74]/20 px-6 py-3 flex items-center justify-between shadow-lg">
        <button onClick={() => setCurrentView('dashboard')} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 flex items-center gap-1"><ChevronRight className="h-3 w-3 rotate-180" />Back to POS</button>
        <div className="flex items-center gap-2">
          <button onClick={handleXReportPreview} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 flex items-center gap-1"><Eye className="h-3 w-3" />Preview Report</button>
          <button onClick={handleXReportExportPDF} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 flex items-center gap-1"><FileText className="h-3 w-3" />Export PDF</button>
          <button onClick={handleXReportExportExcel} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 flex items-center gap-1"><Download className="h-3 w-3" />Export Excel</button>
          <button onClick={handleXReportPrint} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 flex items-center gap-1"><Printer className="h-3 w-3" />Print X-Report</button>
          {!isBalanced && actualCash > 0 ? (
            <button onClick={() => setShowCloseSessionDialog(true)} className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-4 py-2 rounded flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Submit for Approval</button>
          ) : (
            <button onClick={() => setShowCloseSessionDialog(true)} className="border border-[#327F74]/40 text-[#327F74] text-xs px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><FileBarChart className="h-3 w-3" />Submit for Approval</button>
          )}
          <button
            onClick={() => { if (currentSession?.status === 'OPEN') setShowCloseSessionDialog(true); }}
            disabled={currentSession?.status !== 'OPEN'}
            className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-5 py-2 rounded flex items-center gap-1">
            <Lock className="h-3 w-3" />{currentSession?.status === 'CLOSED' ? 'Session Closed' : 'Close Session'}
          </button>
        </div>
      </div>
    </div>
  );
  };

  // Customer Management View — extracted to CustomerView memo component above POSSales

  return (
    <div className="min-h-screen bg-[#F7F7FA]">
      {/* Render current view */}
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'console' && renderConsole()}
      {currentView === 'touch-screen' && renderTouchScreen()}
      {currentView === 'z-report' && renderZReport()}
      {currentView === 'x-report' && renderXReport()}
      {currentView === 'customer' && <CustomerView customerOptions={customerOptions} posCustomersLoading={posCustomersLoading} setCurrentView={setCurrentView} />}
      {currentView === 'sales-analytics' && renderSalesAnalytics()}

      {/* Start Session Dialog */}
      <Dialog open={showStartSessionDialog} onOpenChange={setShowStartSessionDialog}>
        <DialogContent className="sm:max-w-3xl border-0 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Start New POS Session</DialogTitle>
            <DialogDescription>
              Enter opening cash drawer amount and denomination breakdown
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Opening Cash Drawer Amount</Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><DirhamSymbol /></span>
                <Input
                  type="number"
                  value={calculateDenominationTotal(denominations)}
                  disabled
                  className="pl-9 h-11 text-lg font-bold text-[#327F74] bg-[#F7F7FA] border-gray-200"
                />
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-[#1E293B] mb-3 block">Denomination Breakdown</Label>
              
              {/* Bank Notes */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-slate-200"></div>
                  <span className="text-xs font-medium text-slate-500 uppercase">Bank Notes</span>
                  <div className="h-px flex-1 bg-slate-200"></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {['1000', '500', '200', '100', '50', '20', '10', '5'].map((note) => (
                    <div key={note} className="flex items-center space-x-3">
                      <DenominationLabel value={note} />
                      <Input
                        type="number"
                        min="0"
                        value={denominations[note]}
                        onChange={(e) =>
                          setDenominations({
                            ...denominations,
                            [note]: parseInt(e.target.value) || 0
                          })
                        }
                        className="w-24 flex-none text-center"
                      />
                      <DenominationAmount
                        amount={parseFloat(note) * denominations[note]}
                        className="text-gray-600"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Coins */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-amber-200"></div>
                  <span className="text-xs font-medium text-amber-600 uppercase">Coins</span>
                  <div className="h-px flex-1 bg-amber-200"></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {['1', '0.50', '0.25'].map((coin) => (
                    <div key={coin} className="flex items-center space-x-3 bg-[#F5C742]/10 p-2 rounded-lg">
                      <DenominationLabel value={coin} />
                      <Input
                        type="number"
                        min="0"
                        value={denominations[coin]}
                        onChange={(e) =>
                          setDenominations({
                            ...denominations,
                            [coin]: parseInt(e.target.value) || 0
                          })
                        }
                        className="w-24 flex-none bg-white text-center"
                      />
                      <DenominationAmount
                        amount={parseFloat(coin) * denominations[coin]}
                        className="font-medium text-amber-700"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#F5C742] text-white p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span>Total Opening Cash:</span>
                <CurrencyAmount
                  amount={calculateDenominationTotal(denominations)}
                  className="text-2xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStartSessionDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartSession}
              className="bg-[#F5C742] hover:bg-[#e6b838] text-white"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={showCloseSessionDialog} onOpenChange={setShowCloseSessionDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col border-0 shadow-xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-[#1E293B]">Close POS Session</DialogTitle>
            <DialogDescription>Count closing cash and settle card payments before closing</DialogDescription>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl flex-shrink-0">
            {([['cash', 'Cash Count', Banknote], ['card', 'Card Settlement', CreditCard]]).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setCloseSessionTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                  closeSessionTab === id
                    ? 'bg-white text-[#1E293B] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ── Cash Count Tab ── */}
            {closeSessionTab === 'cash' && (
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-[#1E293B] mb-3 block">Closing Denomination Count</Label>

                  {/* Bank Notes */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-slate-200"></div>
                      <span className="text-xs font-medium text-slate-500 uppercase">Bank Notes</span>
                      <div className="h-px flex-1 bg-slate-200"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {['1000', '500', '200', '100', '50', '20', '10', '5'].map((note) => (
                        <div key={note} className="flex items-center space-x-3">
                          <DenominationLabel value={note} />
                          <Input type="number" min="0"
                            value={closingDenominations[note]}
                            onChange={(e) => setClosingDenominations({ ...closingDenominations, [note]: parseInt(e.target.value) || 0 })}
                            className="w-24 flex-none text-center" />
                          <DenominationAmount
                            amount={parseFloat(note) * closingDenominations[note]}
                            className="text-gray-600"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Coins */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-[#F5C742]/40"></div>
                      <span className="text-xs font-medium text-[#F5C742] uppercase">Coins</span>
                      <div className="h-px flex-1 bg-[#F5C742]/40"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {['1', '0.50', '0.25'].map((coin) => (
                        <div key={coin} className="flex items-center space-x-3 bg-[#F5C742]/10 p-2 rounded-lg">
                          <DenominationLabel value={coin} />
                          <Input type="number" min="0"
                            value={closingDenominations[coin]}
                            onChange={(e) => setClosingDenominations({ ...closingDenominations, [coin]: parseInt(e.target.value) || 0 })}
                            className="w-24 flex-none bg-white text-center" />
                          <DenominationAmount
                            amount={parseFloat(coin) * closingDenominations[coin]}
                            className="font-medium text-[#F5C742]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {(() => {
                    const sessionExpectedCash = (Number(currentSession?.openingCash) || 0) + (Number(currentSession?.totalCashSales) || 0);
                    const actualCounted = calculateDenominationTotal(closingDenominations);
                    const variance = actualCounted - sessionExpectedCash;
                    return (
                      <>
                        <div className="flex justify-between items-center p-3 bg-[#F7F7FA] rounded">
                          <span className="text-[#1E293B]">Expected Cash:</span>
                          <CurrencyAmount amount={sessionExpectedCash} className="text-[#1E293B] font-semibold" />
                        </div>
                        <div className="flex justify-between items-center p-3 bg-[#F7F7FA] rounded">
                          <span className="text-[#1E293B]">Actual Cash (Counted):</span>
                          <CurrencyAmount amount={actualCounted} className="text-[#F5C742] font-bold" />
                        </div>
                        {Math.abs(variance) >= 0.01 && (
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded border border-[#E63946]">
                            <span className="text-[#E63946]">Variance:</span>
                            <CurrencyAmount amount={variance} className="text-[#E63946] font-bold" />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Card Settlement Tab ── */}
            {closeSessionTab === 'card' && (
              <div className="space-y-4 pt-2">
                {/* Session card summary */}
                {(() => {
                  const sessionCardTotal = Number(currentSession?.totalCardSales) || 0;
                  return (
                    <div className="rounded-xl border border-[#327F74]/30 bg-[#327F74]/5 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#327F74] mb-3">Session Card Totals</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between py-1.5 border-b border-[#327F74]/10">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-3.5 w-3.5 text-[#327F74]" />
                            <span className="text-sm text-[#1E293B]">Card / POS Payments</span>
                            <span className="text-[10px] text-gray-400">({currentSession?.invoiceCount || 0} invoices total)</span>
                          </div>
                          <span className={`text-sm font-bold ${sessionCardTotal > 0 ? 'text-[#327F74]' : 'text-gray-300'}`}>
                            {formatCurrency(sessionCardTotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-sm font-bold text-[#1E293B]">Total Card Sales</span>
                          <span className="text-base font-black text-[#327F74]">{formatCurrency(sessionCardTotal)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Terminal settlement */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Terminal Settlement</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm text-[#1E293B] mb-1 block">Settlement Amount (from terminal)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium"><DirhamSymbol /></span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={cardSettlementAmount}
                          onChange={e => setCardSettlementAmount(e.target.value)}
                          className="pl-12 text-right font-mono text-base"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm text-[#1E293B] mb-1 block">Batch / Reference No.</Label>
                      <Input
                        placeholder="e.g. BATCH-20240526-001"
                        value={cardSettlementRef}
                        onChange={e => setCardSettlementRef(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Variance */}
                  {(() => {
                    const sessionCardTotal = Number(currentSession?.totalCardSales) || 0;
                    const settled = parseFloat(cardSettlementAmount) || 0;
                    const cardVariance = settled - sessionCardTotal;
                    return cardSettlementAmount ? (
                      <div className={`mt-3 flex justify-between items-center p-3 rounded border ${
                        Math.abs(cardVariance) < 0.01
                          ? 'bg-green-50 border-green-300'
                          : 'bg-red-50 border-[#E63946]'
                      }`}>
                        <span className={`text-sm font-semibold ${Math.abs(cardVariance) < 0.01 ? 'text-green-700' : 'text-[#E63946]'}`}>
                          {Math.abs(cardVariance) < 0.01 ? '✓ Settled — no variance' : 'Variance:'}
                        </span>
                        {Math.abs(cardVariance) >= 0.01 && (
                          <span className="text-sm font-bold text-[#E63946]">
                            {formatCurrency(cardVariance)}
                          </span>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Quick-fill */}
                {(() => {
                  const sessionCardTotal = Number(currentSession?.totalCardSales) || 0;
                  return (
                    <button type="button"
                      onClick={() => setCardSettlementAmount(sessionCardTotal.toFixed(2))}
                      className="w-full py-2 text-sm font-semibold text-[#327F74] border border-[#327F74]/40 rounded-xl hover:bg-[#327F74]/5 transition-colors">
                      Auto-fill from session total (<DirhamSymbol /> {sessionCardTotal.toFixed(2)})
                    </button>
                  );
                })()}
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={() => setShowCloseSessionDialog(false)}>Cancel</Button>
            <Button onClick={handleCloseSession} className="bg-[#E63946] hover:bg-[#d32f3d] text-white">
              <Lock className="h-4 w-4 mr-2" />
              Close Session & Print Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CHECKOUT SCREEN — Full-screen two-column ─── */}
      {showPaymentDialog && (() => {
        // ── Payment Complete phase: render in the SAME overlay to avoid DOM churn ──
        if (checkoutPhase === 'complete' && lastPaidInvoice) {
          const closeComplete = () => {
            setShowPaymentDialog(false);
            setCheckoutPhase('payment');
            setReceiptSharePhone('');
            setReceiptShareEmail('');
          };
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-b from-[#327F74] to-[#256660] px-6 pt-8 pb-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-9 w-9 text-white" />
                  </div>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-1">Payment Complete</p>
                  <p className="text-white font-black text-lg">{lastPaidInvoice.id}</p>
                </div>
                {/* Change back */}
                <div className="bg-[#F5C742]/10 border-b border-[#F5C742]/30 px-6 py-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Change Back</p>
                  <p className="text-4xl font-black text-[#1E293B]">
                    <DirhamSymbol /> {(lastPaidInvoice.changeAmount || 0).toFixed(2)}
                  </p>
                  {(lastPaidInvoice.changeAmount || 0) === 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">Exact amount — no change</p>
                  )}
                </div>
                {/* Summary */}
                <div className="px-6 py-4 space-y-2.5">
                  {[
                    ['Sale Amount', formatCurrencyStr(lastPaidInvoice.total)],
                    ...(lastPaidInvoice.depositAmount > 0 ? [['Deposit Applied', `−${formatCurrencyStr(lastPaidInvoice.depositAmount)}`]] : []),
                    ['Paid Amount', formatCurrencyStr(lastPaidInvoice.paidAmount || 0)],
                    ['Pay Mode', lastPaidInvoice.paymentMode],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className={`font-bold ${label === 'Deposit Applied' ? 'text-[#327F74]' : 'text-[#1E293B]'}`}>{value}</span>
                    </div>
                  ))}
                  {/* Share */}
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Send Receipt</p>
                    <input
                      placeholder="+971 50 000 0000 or email"
                      value={receiptSharePhone}
                      onChange={e => setReceiptSharePhone(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#327F74] mb-2"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button"
                        onClick={() => { const ph = receiptSharePhone.replace(/\D/g, ''); if (!ph) return; window.open(`https://wa.me/${ph}?text=${encodeURIComponent(`Receipt ${lastPaidInvoice.id} – ${formatCurrencyStr(lastPaidInvoice.total)}`)}`, '_blank'); }}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-gray-200 hover:bg-green-50 hover:border-green-300 transition-all text-xs font-semibold text-gray-600">
                        <Smartphone className="h-4 w-4 text-green-600" />WhatsApp
                      </button>
                      <button type="button"
                        onClick={() => { const ph = receiptSharePhone.replace(/\D/g, ''); if (!ph) return; alert(`SMS to ${ph}: Receipt ${lastPaidInvoice.id} – ${formatCurrencyStr(lastPaidInvoice.total)}`); }}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-all text-xs font-semibold text-gray-600">
                        <Smartphone className="h-4 w-4 text-blue-500" />SMS
                      </button>
                      <button type="button"
                        onClick={async () => { const email = receiptSharePhone.includes('@') ? receiptSharePhone : receiptShareEmail; if (!email || !lastPaidInvoice?.invoice?.id) return; try { await sendSalesInvoiceEmail(lastPaidInvoice.invoice.id, { toEmail: email, subject: `Receipt ${lastPaidInvoice.id}`, htmlBody: `<p>Invoice: ${lastPaidInvoice.id}, Total: ${formatCurrencyStr(lastPaidInvoice.total)}</p>` }); } catch { alert('Failed to send email.'); } }}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-gray-200 hover:bg-[#327F74]/5 hover:border-[#327F74]/40 transition-all text-xs font-semibold text-gray-600">
                        <FileText className="h-4 w-4 text-[#327F74]" />Email
                      </button>
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="px-6 pb-6 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={async () => {
                      if (!lastPaidInvoice?.invoice?.id) return;
                      try {
                        const full = await getSalesInvoiceById(lastPaidInvoice.invoice.id);
                        if (tplInvoicePaper === 'A4') {
                          const template = buildPosA4Template(tplInvoiceFooter, { showLogo:tplInvoiceShowLogo, showCompanyDetails:tplInvoiceShowCompanyDetails, showTrn:tplInvoiceShowTrn, showCustomerDetails:tplInvoiceShowCustomerDetails, showTerms:tplInvoiceShowTerms, showNotes:tplInvoiceShowNotes, showBankDetails:tplInvoiceShowBankDetails, showQRCode:tplInvoiceShowQRCode, showStamp:tplInvoiceShowStamp, showSignature:tplInvoiceShowSignature, showGrandTotalBanner:tplInvoiceShowGrandTotalBanner, colItemCode:tplInvoiceColItemCode, colItemImage:tplInvoiceColItemImage, colBarcode:tplInvoiceColBarcode, colBatchNo:tplInvoiceColBatchNo, colDiscount:tplInvoiceColDiscount, colVatPct:tplInvoiceColVatPct, colVatAmt:tplInvoiceColVatAmt });
                          const data = buildPosPrintData(full, tplInvoiceFooter);
                          const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
                          printHtml(generateDocumentPrintHtml(template, data, options));
                        } else {
                          const tlv = buildZatcaTlvBase64(tplOutletName, tplOutletTrn, full.invoiceDate ? new Date(full.invoiceDate).toISOString() : new Date().toISOString(), full.invoiceTotal, full.taxTotal);
                          const qrDataUrl = tplInvoiceShowQRCode ? await QRCode.toDataURL(tlv, { errorCorrectionLevel: 'M', width: 160 }) : null;
                          printHtml(buildThermalReceiptHtml(tplInvoicePaper, full, { companyName: tplOutletName, trn: tplOutletTrn, header: tplInvoiceHeader, footer: tplInvoiceFooter, showTrn: true, zatcaQrDataUrl: qrDataUrl }));
                        }
                      } catch (err) { console.warn('POS print error', err); }
                    }}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <Printer className="h-4 w-4" />Print Receipt
                    </button>
                    <button type="button" onClick={() => { closeComplete(); setShowReprintModal(true); }}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <RotateCcw className="h-4 w-4" />Reprint Inv.
                    </button>
                  </div>
                  <button type="button" onClick={closeComplete}
                    className="w-full py-3 rounded-xl bg-[#327F74] hover:bg-[#256660] text-white font-black text-sm transition-colors flex items-center justify-center gap-2">
                    <ArrowRightCircle className="h-5 w-5" />New Sale
                  </button>
                  <p className="text-center text-[10px] text-gray-400">Scan next item to start a new sale automatically</p>
                </div>
              </div>
            </div>
          );
        }

        const grandTotal = currentInvoice.total;
        const subtotal = currentInvoice.subtotal;
        const totalDisc = currentInvoice.totalDiscount;
        const totalVat = currentInvoice.tax;
        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
        const effectiveDue = Math.max(0, grandTotal - depositAmt);
        const invoiceNo = `SI-POS-${String(invoiceCounter + 1).padStart(6, '0')}`;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-AE', { day:'2-digit', month:'short', year:'numeric' });
        const timeStr = now.toLocaleTimeString('en-AE', { hour:'2-digit', minute:'2-digit', hour12:true });
        const customer = selectedCustomerData;

        // Keypad handler
        const handleKpad = (key) => {
          const setter = checkoutKeypadTarget === 'tender' ? setTenderedAmount
            : checkoutKeypadTarget === 'mixed-cash' ? setMixedCashAmount
            : checkoutKeypadTarget === 'mixed-card' ? setMixedCardAmount
            : setCheckoutCardRef;
          const cur = checkoutKeypadTarget === 'tender' ? tenderedAmount
            : checkoutKeypadTarget === 'mixed-cash' ? mixedCashAmount
            : checkoutKeypadTarget === 'mixed-card' ? mixedCardAmount
            : checkoutCardRef;
          if (key === 'C') { setter(''); }
          else if (key === '⌫') { setter(cur.slice(0, -1)); }
          else if (key === '.' && cur.includes('.')) { /* noop */ }
          else if (key === 'EXACT') { setter(effectiveDue > 0 ? String(effectiveDue.toFixed(2)) : ''); }
          else { setter(cur + key); }
        };

        const tenderedNum = parseFloat(tenderedAmount) || 0;
        const mixedCashNum = parseFloat(mixedCashAmount) || 0;
        const mixedCardNum = parseFloat(mixedCardAmount) || 0;
        const change = tenderedNum - effectiveDue;
        const mixedDiff = Math.abs(mixedCashNum + mixedCardNum - effectiveDue);

        const canSettle =
          (checkoutPayMode === 'cash' && tenderedNum >= effectiveDue) ||
          (checkoutPayMode === 'card' && !!checkoutCardType) ||
          (checkoutPayMode === 'credit' && !!checkoutCreditCustomer) ||
          (checkoutPayMode === 'mixed' && mixedDiff < 0.01 && !!mixedCardType);

        const numKeys = ['7','8','9','4','5','6','1','2','3','.','0','⌫'];
        const alphaRows = [['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['Z','X','C','V','B','N','M','⌫']];

        return (
          <div className="fixed inset-0 z-[60] flex bg-[#1a1f2e]">

            {/* ══ LEFT: Invoice Preview ══════════════════════════════ */}
            <div className="w-[42%] flex flex-col bg-white border-r-4 border-[#F5C742]">
              {/* Invoice header */}
              <div className="bg-[#F5C742] px-6 py-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center">
                        <span className="text-[#F5C742] font-black text-xs">BB</span>
                      </div>
                      <div>
                        <p className="font-black text-[#1E293B] text-base leading-none">BillBull</p>
                        <p className="text-[#1E293B]/70 text-[10px] leading-none">Retail OS</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[#1E293B] font-bold text-sm">Main Branch – Dubai Mall</p>
                    <p className="text-[#1E293B]/70 text-[10px]">POS-01 · Ahmad Al-Farsi · Session #1042</p>
                    <p className="text-[#1E293B]/70 text-[10px]">TRN: 100123456700003</p>
                  </div>
                </div>
              </div>

              {/* Invoice meta */}
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Invoice No.</p>
                  <p className="font-bold text-[#1E293B] text-sm">{invoiceNo}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Date</p>
                  <p className="font-semibold text-[#1E293B] text-xs">{dateStr}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Time</p>
                  <p className="font-semibold text-[#1E293B] text-xs">{timeStr}</p>
                </div>
              </div>

              {/* Customer */}
              <div className="px-6 py-2.5 border-b border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F5C742]/20 flex items-center justify-center">
                    <User className="h-4 w-4 text-[#F5C742]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1E293B]">{customer?.name || 'Walk-in Customer'}</p>
                    {customer ? <p className="text-[10px] text-gray-400">{customer.membershipId} · {customer.tier || 'Standard'}</p>
                      : <p className="text-[10px] text-gray-400">No loyalty account</p>}
                  </div>
                  {customer?.loyaltyPoints && <div className="ml-auto"><span className="bg-[#F5C742]/20 text-[#b8920e] text-[10px] font-bold px-2 py-0.5 rounded-full">{customer.loyaltyPoints} pts</span></div>}
                </div>
              </div>

              {/* Items table */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {/* Column headers */}
                <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <span className="col-span-5">Item</span>
                  <span className="col-span-1 text-center">Qty</span>
                  <span className="col-span-2 text-right">Price</span>
                  <span className="col-span-2 text-right">Disc</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>
                {currentInvoice.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                    <ShoppingCart className="h-10 w-10 mb-2" />
                    <p className="text-xs">No items in cart</p>
                  </div>
                ) : (
                  currentInvoice.items.map((item, i) => (
                    <div key={item.id} className={`grid grid-cols-12 gap-1 px-2 py-2 text-xs border-b border-gray-50 ${item.isVoided ? 'bg-red-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <div className="col-span-5">
                        <div className="flex items-center gap-1">
                          <p className={`font-semibold text-[11px] leading-tight truncate ${item.isVoided ? 'line-through text-gray-400' : 'text-[#1E293B]'}`}>{item.name}</p>
                          {item.isVoided && <span className="text-[8px] font-black bg-red-500 text-white px-1 py-0 rounded shrink-0">VOID</span>}
                        </div>
                        <p className="text-[9px] text-gray-400">{item.id}</p>
                      </div>
                      <span className={`col-span-1 text-center font-medium ${item.isVoided ? 'line-through text-gray-400' : 'text-gray-600'}`}>{item.quantity}</span>
                      <span className={`col-span-2 text-right ${item.isVoided ? 'line-through text-gray-400' : 'text-gray-600'}`}>{(item.price).toFixed(2)}</span>
                      <span className="col-span-2 text-right text-green-600">{item.isVoided ? '—' : item.discount > 0 ? `-${item.discount.toFixed(2)}` : '—'}</span>
                      <span className={`col-span-2 text-right font-bold ${item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}`}>{item.isVoided ? `-${(item.total).toFixed(2)}` : (item.total).toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Totals */}
              <div className="px-6 py-3 border-t-2 border-[#F5C742]/30 bg-white shrink-0 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Subtotal</span><span className="font-medium text-[#1E293B]"><CurrencyAmount amount={subtotal} /></span>
                </div>
                {totalDisc > 0 && <div className="flex justify-between text-xs">
                  <span className="text-green-600">Discount</span><span className="font-medium text-green-600">− <CurrencyAmount amount={totalDisc} /></span>
                </div>}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>VAT (5%)</span><span className="font-medium text-[#1E293B]"><CurrencyAmount amount={totalVat} /></span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t-2 border-[#F5C742]">
                  <span className="text-base font-black text-[#1E293B]">Grand Total</span>
                  <span className="text-2xl font-black text-[#1E293B]"><CurrencyAmount amount={grandTotal} /></span>
                </div>
                {depositAmt > 0 && <>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-[#327F74] font-semibold">Deposit Applied</span>
                    <span className="font-bold text-[#327F74]">− <CurrencyAmount amount={depositAmt} /></span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t-2 border-[#327F74]/40">
                    <span className="text-sm font-black text-[#327F74]">Balance Due</span>
                    <span className="text-xl font-black text-[#327F74]"><CurrencyAmount amount={effectiveDue} /></span>
                  </div>
                </>}
                <p className="text-center text-[9px] text-gray-400 uppercase tracking-widest pt-1">TAX INVOICE — VAT INCLUDED</p>
              </div>
            </div>

            {/* ══ RIGHT: Payment & Settlement ═══════════════════════ */}
            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden">

              {/* Right header */}
              <div className="bg-[#1E293B] px-6 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F5C742] flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-[#1E293B]" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base leading-none">Checkout</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">{currentInvoice.items.length} item{currentInvoice.items.length !== 1 ? 's' : ''} · {invoiceNo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-gray-400 text-[10px]">{depositAmt > 0 ? 'Balance Due' : 'Total Amount'}</p>
                    <p className="text-[#F5C742] font-black text-2xl leading-none"><CurrencyAmount amount={depositAmt > 0 ? effectiveDue : grandTotal} /></p>
                  </div>
                  <button type="button" onClick={() => setShowPaymentDialog(false)} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-3">

                  {/* ── Pay Mode ── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Payment Mode</p>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        ['cash',  'Cash',   Banknote,   '#16a34a'],
                        ['card',  'Card',   CreditCard, '#2563eb'],
                        ['credit','Credit', Users,      '#9333ea'],
                        ['mixed', 'Mixed',  Wallet,     '#ea580c'],
                      ]).map(([id, label, Icon, color]) => (
                        <button key={id} type="button" onClick={() => { setCheckoutPayMode(id); setCheckoutKeypadTarget(id === 'mixed' ? 'mixed-cash' : id === 'card' ? 'ref' : 'tender'); }}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${checkoutPayMode === id ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-gray-200 hover:border-[#F5C742]/50 bg-gray-50'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutPayMode === id ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                            <Icon className={`h-4 w-4 ${checkoutPayMode === id ? 'text-[#1E293B]' : 'text-gray-500'}`} />
                          </div>
                          <span className={`text-xs font-bold ${checkoutPayMode === id ? 'text-[#1E293B]' : 'text-gray-500'}`}>{label}</span>
                          {checkoutPayMode === id && <div className="w-4 h-1 rounded-full bg-[#F5C742]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Cash section ── */}
                  {checkoutPayMode === 'cash' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cash Payment</p>
                      {/* Smart dynamic tender buttons based on invoice amount */}
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          // Generate smart denominations based on the amount actually due now
                          const total = effectiveDue;
                          const rounds = [];
                          // Exact total
                          rounds.push(total);
                          // Next 5 AED round-up
                          const r5 = Math.ceil(total / 5) * 5;
                          if (r5 !== total) rounds.push(r5);
                          // Next 10 AED round-up
                          const r10 = Math.ceil(total / 10) * 10;
                          if (!rounds.includes(r10)) rounds.push(r10);
                          // Next 50 AED round-up
                          const r50 = Math.ceil(total / 50) * 50;
                          if (!rounds.includes(r50)) rounds.push(r50);
                          // Next 100 AED round-up
                          const r100 = Math.ceil(total / 100) * 100;
                          if (!rounds.includes(r100)) rounds.push(r100);
                          // Standard 500, 1000 only if applicable
                          if (total > 100 && !rounds.includes(500)) rounds.push(500);
                          if (total > 400 && !rounds.includes(1000)) rounds.push(1000);
                          return [...new Set(rounds)].sort((a,b)=>a-b).slice(0, 6).map(d => (
                            <button key={d} type="button" onClick={() => { setTenderedAmount(d === total ? String(total.toFixed(2)) : String(d)); setCheckoutKeypadTarget('tender'); }}
                              className={`px-3 py-1.5 text-sm font-bold rounded-lg border-2 transition-all ${parseFloat(tenderedAmount) === d ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-[#F5C742]/40 text-gray-700 hover:bg-[#F5C742]/10'}`}>
                              {d === total ? 'Exact' : d}
                            </button>
                          ));
                        })()}
                      </div>
                      {/* Tendered display */}
                      <div className="bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer"
                        onClick={() => { setCheckoutKeypadTarget('tender'); setCheckoutKeypadMode('numeric'); setCheckoutKeypadVisible(true); }}>
                        <span className="text-xs font-bold text-gray-500 uppercase">Tendered</span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-[#1E293B]"><DirhamSymbol /> {tenderedAmount || '0.00'}</span>
                          <span className="text-[9px] text-gray-400 border border-gray-300 rounded px-1 py-0.5">tap to edit</span>
                        </div>
                      </div>
                      {/* Change / Balance */}
                      {tenderedNum > 0 && tenderedNum >= grandTotal && (
                        <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                          <span className="text-sm font-semibold text-green-700">Change Return</span>
                          <span className="text-lg font-black text-green-700"><CurrencyAmount amount={change} /></span>
                        </div>
                      )}
                      {tenderedNum > 0 && tenderedNum < effectiveDue && (
                        <div className="flex justify-between items-center px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                          <span className="text-sm font-semibold text-red-600">Balance Due</span>
                          <span className="text-lg font-black text-red-600"><CurrencyAmount amount={effectiveDue - tenderedNum} /></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Card section ── */}
                  {checkoutPayMode === 'card' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Card Payment</p>
                      <div className="grid grid-cols-4 gap-2">
                        {['Visa','Mastercard','Amex','Other'].map(ct => (
                          <button key={ct} type="button" onClick={() => setCheckoutCardType(ct)}
                            className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${checkoutCardType === ct ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-600 hover:border-[#F5C742]/50'}`}>
                            {ct}
                          </button>
                        ))}
                      </div>
                      <div className="bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setCheckoutKeypadTarget('ref')}>
                        <span className="text-xs font-bold text-gray-500 uppercase">Amount</span>
                        <span className="text-2xl font-black text-[#1E293B]"><CurrencyAmount amount={effectiveDue} /></span>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Reference No. (optional)</label>
                        <div className="mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between cursor-pointer"
                          onClick={() => { setCheckoutKeypadTarget('ref'); setCheckoutKeypadMode('alpha'); setCheckoutKeypadVisible(true); }}>
                          <span className="text-sm text-gray-500">{checkoutCardRef || 'Tap to enter...'}</span>
                          {checkoutKeypadTarget === 'ref' && checkoutKeypadVisible && <span className="w-0.5 h-4 bg-[#F5C742] animate-pulse" />}
                        </div>
                      </div>
                      {!checkoutCardType && <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"><AlertCircle className="h-4 w-4 text-amber-500 shrink-0" /><span className="text-xs text-amber-700">Please select a card type to proceed</span></div>}
                    </div>
                  )}

                  {/* ── Credit section ── */}
                  {checkoutPayMode === 'credit' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Credit Payment</p>
                      {!checkoutCreditCustomer && (
                        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-xl">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-amber-800">Customer Required</p>
                            <p className="text-[10px] text-amber-700">Credit payment requires a registered customer account.</p>
                          </div>
                        </div>
                      )}
                      {/* Customer search */}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block">Search Customer</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                          <input value={checkoutCreditCustomerSearch} onChange={e => setCheckoutCreditCustomerSearch(e.target.value)}
                            placeholder="Name, mobile, code…"
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5C742] bg-gray-50" />
                        </div>
                        {checkoutCreditCustomerSearch && (
                          <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-md max-h-36 overflow-y-auto">
                            {checkoutCreditCustomerOptions.map(c => (
                              <button key={c.id} type="button" onClick={() => { setCheckoutCreditCustomer(c.id); setCheckoutCreditCustomerSearch(''); }}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F5C742]/10 text-left border-b border-gray-50 last:border-0 transition-colors">
                                <div className="w-7 h-7 rounded-full bg-[#F5C742] flex items-center justify-center text-xs font-bold text-[#1E293B]">{c.name.charAt(0)}</div>
                                <div><p className="text-sm font-medium text-[#1E293B]">{c.name}</p><p className="text-[10px] text-gray-400">{c.membershipId}</p></div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Selected customer card */}
                      {creditCustomerData && (
                        <div className="flex items-center justify-between px-3 py-2.5 bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#F5C742] flex items-center justify-center text-sm font-black text-[#1E293B]">{creditCustomerData.name.charAt(0)}</div>
                            <div>
                              <p className="text-sm font-bold text-[#1E293B]">{creditCustomerData.name}</p>
                              <p className="text-[10px] text-gray-500">{creditCustomerData.membershipId}</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => setCheckoutCreditCustomer(null)} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                        </div>
                      )}
                      {/* Add new customer shortcut */}
                      {!creditCustomerData && (
                        <button type="button" onClick={() => setShowAddCustomerDialog(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#F5C742]/50 text-[#b8920e] text-sm font-semibold hover:bg-[#F5C742]/5 transition-colors">
                          <UserPlus className="h-4 w-4" />
                          Add New Customer
                        </button>
                      )}
                      {/* Credit terms */}
                      {creditCustomerData && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Credit Terms (Days)</label>
                            <select value={checkoutCreditTerms} onChange={e => setCheckoutCreditTerms(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#F5C742]">
                              {['7','14','30','45','60','90'].map(d => <option key={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Due Date</label>
                            <input type="date" value={checkoutCreditDueDate} onChange={e => setCheckoutCreditDueDate(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          </div>
                        </div>
                      )}
                      <div className="bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase">Credit Amount</span>
                        <span className="text-2xl font-black text-[#1E293B]"><CurrencyAmount amount={grandTotal} /></span>
                      </div>
                    </div>
                  )}

                  {/* ── Mixed section ── */}
                  {checkoutPayMode === 'mixed' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mixed Payment — Cash + Card</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Cash Amount</label>
                          <div className={`mt-1 border-2 rounded-xl px-3 py-2.5 flex items-center justify-between cursor-pointer ${checkoutKeypadTarget==='mixed-cash'?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 bg-gray-50'}`}
                            onClick={() => { setCheckoutKeypadTarget('mixed-cash'); setCheckoutKeypadMode('numeric'); setCheckoutKeypadVisible(true); }}>
                            <span className="text-xs text-gray-400"><DirhamSymbol /></span>
                            <span className="text-lg font-black text-[#1E293B]">{mixedCashAmount || '0.00'}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Card Amount</label>
                          <div className={`mt-1 border-2 rounded-xl px-3 py-2.5 flex items-center justify-between cursor-pointer ${checkoutKeypadTarget==='mixed-card'?'border-[#F5C742] bg-[#F5C742]/5':'border-gray-200 bg-gray-50'}`}
                            onClick={() => { setCheckoutKeypadTarget('mixed-card'); setCheckoutKeypadMode('numeric'); setCheckoutKeypadVisible(true); }}>
                            <span className="text-xs text-gray-400"><DirhamSymbol /></span>
                            <span className="text-lg font-black text-[#1E293B]">{mixedCardAmount || '0.00'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {['Visa','Mastercard','Amex','Other'].map(ct => (
                          <button key={ct} type="button" onClick={() => setMixedCardType(ct)}
                            className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${mixedCardType === ct ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-600 hover:border-[#F5C742]/50'}`}>
                            {ct}
                          </button>
                        ))}
                      </div>
                      {mixedCashAmount && mixedCardAmount && (
                        <div className={`flex justify-between items-center px-4 py-2.5 rounded-xl border-2 ${mixedDiff < 0.01 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                          <span className={`text-sm font-bold ${mixedDiff < 0.01 ? 'text-green-700' : 'text-red-600'}`}>{mixedDiff < 0.01 ? '✓ Amounts Balanced' : <>Difference: <DirhamSymbol /> {mixedDiff.toFixed(2)}</>}</span>
                          <span className="text-xs text-gray-500">Total: <DirhamSymbol /> {grandTotal.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── On-Demand Keypad ── */}
                  {checkoutKeypadVisible && (
                    <div className="bg-white rounded-2xl border-2 border-[#F5C742]/50 p-4 shadow-md">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Keypad</p>
                          <span className="text-[9px] text-gray-300">—</span>
                          <span className="text-[10px] text-[#F5C742] font-semibold">
                            {checkoutKeypadTarget === 'tender' ? 'Cash Tendered'
                              : checkoutKeypadTarget === 'mixed-cash' ? 'Cash Amount'
                              : checkoutKeypadTarget === 'mixed-card' ? 'Card Amount'
                              : 'Reference / Text'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
                            <button type="button" onClick={() => setCheckoutKeypadMode('numeric')}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${checkoutKeypadMode==='numeric'?'bg-[#F5C742] text-[#1E293B]':'text-gray-500'}`}>123</button>
                            <button type="button" onClick={() => setCheckoutKeypadMode('alpha')}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${checkoutKeypadMode==='alpha'?'bg-[#F5C742] text-[#1E293B]':'text-gray-500'}`}>ABC</button>
                          </div>
                          <button type="button" onClick={() => setCheckoutKeypadVisible(false)}
                            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {checkoutKeypadMode === 'numeric' ? (
                        <div className="grid grid-cols-3 gap-2">
                          {numKeys.map(k => (
                            <button key={k} type="button" onClick={() => handleKpad(k)}
                              className={`h-12 rounded-xl font-bold text-sm border-2 transition-all active:scale-95 ${k==='⌫'?'border-red-200 bg-red-50 text-red-500 hover:bg-red-100':'border-[#F5C742]/40 bg-[#F5C742]/5 text-[#1E293B] hover:bg-[#F5C742]/20'}`}>
                              {k}
                            </button>
                          ))}
                          <button type="button" onClick={() => handleKpad('EXACT')}
                            className="col-span-2 h-12 rounded-xl font-bold text-xs border-2 border-[#327F74]/40 bg-[#327F74]/5 text-[#327F74] hover:bg-[#327F74]/10 transition-all">
                            EXACT AMOUNT
                          </button>
                          <button type="button" onClick={() => handleKpad('C')}
                            className="h-12 rounded-xl font-bold text-sm border-2 border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all">
                            CLR
                          </button>
                          <button type="button" onClick={() => setCheckoutKeypadVisible(false)}
                            className="col-span-3 h-10 rounded-xl font-bold text-sm border-2 border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B] hover:bg-[#F5C742]/20 transition-all mt-1">
                            Done ✓
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {alphaRows.map((row, ri) => (
                            <div key={ri} className="flex gap-1 justify-center">
                              {row.map(k => (
                                <button key={k} type="button" onClick={() => handleKpad(k)}
                                  className={`h-9 flex-1 rounded-lg font-bold text-xs border transition-all active:scale-95 ${k==='⌫'?'border-red-200 bg-red-50 text-red-500 hover:bg-red-100 px-3 flex-none':'border-[#F5C742]/40 bg-[#F5C742]/5 text-[#1E293B] hover:bg-[#F5C742]/20'}`}>
                                  {k}
                                </button>
                              ))}
                            </div>
                          ))}
                          <div className="flex gap-1.5 mt-1">
                            <button type="button" onClick={() => handleKpad(' ')} className="flex-1 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs font-bold hover:bg-gray-100">SPACE</button>
                            <button type="button" onClick={() => handleKpad('C')} className="flex-none px-4 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs font-bold hover:bg-gray-100">CLR</button>
                            <button type="button" onClick={() => setCheckoutKeypadVisible(false)} className="flex-none px-4 h-9 rounded-lg border-2 border-[#F5C742] bg-[#F5C742]/10 text-[#1E293B] text-xs font-bold hover:bg-[#F5C742]/20">Done ✓</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Remarks ── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Remarks / Reference</label>
                    <input value={checkoutRemarks} onChange={e => setCheckoutRemarks(e.target.value)}
                      onFocus={() => { setCheckoutKeypadMode('alpha'); setCheckoutKeypadTarget('ref'); setCheckoutKeypadVisible(true); }}
                      placeholder="Tap to enter note…"
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />
                  </div>

                  {/* ── E-Bill / Receipt Sharing ── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Print / E-Bill</p>
                    <div className="space-y-2">
                      {/* Print */}
                      <label className="flex items-center justify-between py-2 px-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillPrint?'bg-[#F5C742]':'bg-gray-100'}`}>
                            <Printer className={`h-4 w-4 ${checkoutEbillPrint?'text-[#1E293B]':'text-gray-400'}`} />
                          </div>
                          <span className="text-sm font-semibold text-[#1E293B]">Print Receipt</span>
                        </div>
                        <input type="checkbox" checked={checkoutEbillPrint} onChange={e => setCheckoutEbillPrint(e.target.checked)} className="w-4 h-4 accent-[#F5C742]" />
                      </label>
                      {/* SMS */}
                      <div>
                        <label className="flex items-center justify-between py-2 px-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillSms?'bg-[#F5C742]':'bg-gray-100'}`}>
                              <Smartphone className={`h-4 w-4 ${checkoutEbillSms?'text-[#1E293B]':'text-gray-400'}`} />
                            </div>
                            <span className="text-sm font-semibold text-[#1E293B]">Send by SMS</span>
                          </div>
                          <input type="checkbox" checked={checkoutEbillSms} onChange={e => setCheckoutEbillSms(e.target.checked)} className="w-4 h-4 accent-[#F5C742]" />
                        </label>
                        {checkoutEbillSms && <input value={checkoutEbillPhone} onChange={e => setCheckoutEbillPhone(e.target.value)} onFocus={() => { setCheckoutKeypadMode('numeric'); setCheckoutKeypadTarget('ref'); setCheckoutKeypadVisible(true); }} placeholder="+971 5X XXX XXXX" className="mt-1 w-full border border-[#F5C742]/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />}
                      </div>
                      {/* WhatsApp */}
                      <div>
                        <label className="flex items-center justify-between py-2 px-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillWhatsapp?'bg-[#F5C742]':'bg-gray-100'}`}>
                              <Smartphone className={`h-4 w-4 ${checkoutEbillWhatsapp?'text-[#1E293B]':'text-gray-400'}`} />
                            </div>
                            <span className="text-sm font-semibold text-[#1E293B]">Send by WhatsApp</span>
                          </div>
                          <input type="checkbox" checked={checkoutEbillWhatsapp} onChange={e => setCheckoutEbillWhatsapp(e.target.checked)} className="w-4 h-4 accent-[#F5C742]" />
                        </label>
                        {checkoutEbillWhatsapp && <input value={checkoutEbillPhone} onChange={e => setCheckoutEbillPhone(e.target.value)} onFocus={() => { setCheckoutKeypadMode('numeric'); setCheckoutKeypadTarget('ref'); setCheckoutKeypadVisible(true); }} placeholder="+971 5X XXX XXXX" className="mt-1 w-full border border-[#F5C742]/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />}
                      </div>
                      {/* Email */}
                      <div>
                        <label className="flex items-center justify-between py-2 px-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillEmail?'bg-[#F5C742]':'bg-gray-100'}`}>
                              <FileText className={`h-4 w-4 ${checkoutEbillEmail?'text-[#1E293B]':'text-gray-400'}`} />
                            </div>
                            <span className="text-sm font-semibold text-[#1E293B]">Send by Email</span>
                          </div>
                          <input type="checkbox" checked={checkoutEbillEmail} onChange={e => setCheckoutEbillEmail(e.target.checked)} className="w-4 h-4 accent-[#F5C742]" />
                        </label>
                        {checkoutEbillEmail && <input type="email" value={checkoutEbillEmailAddr} onChange={e => setCheckoutEbillEmailAddr(e.target.value)} onFocus={() => { setCheckoutKeypadMode('alpha'); setCheckoutKeypadTarget('ref'); setCheckoutKeypadVisible(true); }} placeholder="customer@email.com" className="mt-1 w-full border border-[#F5C742]/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#F5C742]" />}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Settlement footer ── */}
              <div className="bg-white border-t-2 border-[#F5C742]/30 px-5 py-4 shrink-0">
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-[#F5C742]/10 border border-[#F5C742]/40 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-gray-500 uppercase font-bold">{depositAmt > 0 ? 'Balance Due' : 'Total'}</p>
                    <p className="text-base font-black text-[#1E293B]"><CurrencyAmount amount={depositAmt > 0 ? effectiveDue : grandTotal} /></p>
                    {depositAmt > 0 && <p className="text-[8px] text-[#327F74] font-semibold mt-0.5">Deposit −{depositAmt.toFixed(2)}</p>}
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${canSettle ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[9px] text-gray-500 uppercase font-bold">Paid</p>
                    <p className={`text-base font-black ${canSettle ? 'text-green-700' : 'text-gray-400'}`}>
                      <DirhamSymbol /> {checkoutPayMode === 'cash' ? (tenderedNum > effectiveDue ? effectiveDue : tenderedNum).toFixed(2)
                        : checkoutPayMode === 'mixed' ? (mixedCashNum + mixedCardNum).toFixed(2)
                        : canSettle ? effectiveDue.toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${checkoutPayMode === 'cash' && change > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[9px] text-gray-500 uppercase font-bold">{checkoutPayMode === 'cash' && change > 0 ? 'Change' : 'Balance'}</p>
                    <p className={`text-base font-black ${checkoutPayMode === 'cash' && change > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                      <DirhamSymbol /> {checkoutPayMode === 'cash' && change > 0 ? change.toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>
                {/* Error display */}
                {checkoutError && (
                  <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {checkoutError}
                  </div>
                )}
                {/* Action buttons */}
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowPaymentDialog(false); setCheckoutError(null); setTenderedAmount(''); setCheckoutCardType(''); setMixedCashAmount(''); setMixedCardAmount(''); setMixedCardType(''); setCheckoutKeypadValue(''); setCheckoutKeypadVisible(false); }}
                    className="flex-none px-5 py-3.5 rounded-xl border-2 border-gray-300 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="button" onClick={processPayment} disabled={!canSettle || currentInvoice.items.length === 0 || checkoutLoading}
                    className={`flex-1 py-3.5 rounded-xl font-black text-base flex items-center justify-center gap-2 transition-all ${canSettle && currentInvoice.items.length > 0 && !checkoutLoading ? 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] shadow-lg shadow-[#F5C742]/30' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    {checkoutLoading
                      ? <><div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />Processing...</>
                      : <><CheckCircle className="h-5 w-5" />Settle Payment · <DirhamSymbol /> {effectiveDue.toFixed(2)}</>
                    }
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Supervisor PIN Dialog */}
      {showSupervisorPin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-t-2xl px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/20">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Supervisor Approval</h2>
                  <p className="text-xs text-amber-100 mt-0.5">
                    {pendingLayawayAbortAction
                      ? (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to clear layaway cart' : 'Enter PIN to clear layaway cart')
                      : (supervisorApprovalMode === 'PASSWORD' ? 'Enter password to authorize void' : 'Enter PIN to authorize void')}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  {supervisorApprovalMode === 'PASSWORD' ? 'Supervisor Password' : 'Supervisor PIN'}
                </label>
                <input
                  type="password"
                  value={supervisorPinValue}
                  onChange={e => { setSupervisorPinValue(e.target.value); setSupervisorPinError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSupervisorPinSubmit(); }}
                  autoFocus
                  maxLength={supervisorApprovalMode === 'PASSWORD' ? 64 : 8}
                  className={`w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-400 ${supervisorApprovalMode === 'PASSWORD' ? 'text-base' : 'text-center text-xl tracking-[0.5em]'}`}
                  placeholder={supervisorApprovalMode === 'PASSWORD' ? 'Manager password' : '····'}
                />
                {supervisorPinError && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />{supervisorPinError}
                  </p>
                )}
              </div>
              {supervisorApprovalMode !== 'PASSWORD' && (
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9,'C',0,'✓'].map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === 'C') { setSupervisorPinValue(''); setSupervisorPinError(''); }
                      else if (k === '✓') handleSupervisorPinSubmit();
                      else setSupervisorPinValue(p => (p + k).slice(0, 8));
                    }}
                    className={`py-3 rounded-xl text-sm font-bold transition-colors ${
                      k === '✓' ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                      k === 'C' ? 'bg-red-100 hover:bg-red-200 text-red-600' :
                      'bg-gray-100 hover:bg-gray-200 text-[#1E293B]'
                    }`}
                  >{k}</button>
                ))}
              </div>
              )}
              {supervisorApprovalMode === 'PASSWORD' && (
                <button
                  type="button"
                  onClick={handleSupervisorPinSubmit}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors"
                >Authorize</button>
              )}
              <button
                type="button"
                onClick={() => { setShowSupervisorPin(false); setPendingVoidItemId(null); setSupervisorPinValue(''); setSupervisorPinError(''); }}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}


      {/* Cash Drop/Out Dialog */}
      <Dialog open={showCashDropDialog} onOpenChange={setShowCashDropDialog}>
        <DialogContent className="sm:max-w-md border-0 shadow-2xl">
          {/* Coloured header strip */}
          <div className={`-mx-6 -mt-6 px-6 pt-6 pb-5 rounded-t-lg mb-2 ${cashDropType === 'in' ? 'bg-gradient-to-r from-[#327F74]/10 to-transparent border-b border-[#327F74]/15' : 'bg-gradient-to-r from-red-50 to-transparent border-b border-red-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${cashDropType === 'in' ? 'bg-[#327F74]/15' : 'bg-red-100'}`}>
                {cashDropType === 'in'
                  ? <ArrowDown className="h-5 w-5 text-[#327F74]" />
                  : <ArrowUp className="h-5 w-5 text-red-500" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1E293B]">Cash Drop / Out</h2>
                <p className="text-xs text-gray-500 mt-0.5">Record cash movements other than sales</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 py-1">
            {/* Type */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Movement Type</label>
              <Select value={cashDropType} onValueChange={(val) => setCashDropType(val || 'in')}>
                <SelectTrigger className="h-11 border-gray-200 focus:ring-2 focus:ring-[#327F74]/30 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">
                    <div className="flex items-center gap-2.5 py-0.5">
                      <div className="p-1 bg-[#327F74]/10 rounded"><ArrowDown className="h-3.5 w-3.5 text-[#327F74]" /></div>
                      <div>
                        <div className="text-sm font-medium text-[#1E293B]">Cash Drop (IN)</div>
                        <div className="text-xs text-gray-400">Add cash to drawer</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="out">
                    <div className="flex items-center gap-2.5 py-0.5">
                      <div className="p-1 bg-red-50 rounded"><ArrowUp className="h-3.5 w-3.5 text-red-500" /></div>
                      <div>
                        <div className="text-sm font-medium text-[#1E293B]">Cash Out</div>
                        <div className="text-xs text-gray-400">Pay for expenses</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                Amount <span className="inline-flex items-center gap-0.5 text-gray-400 normal-case font-normal">(<DirhamSymbol />)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 flex items-center">
                  <DirhamSymbol />
                </span>
                <Input
                  type="number"
                  value={cashDropAmount}
                  onChange={(e) => setCashDropAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-9 h-11 text-lg font-semibold border-gray-200 focus:ring-2 focus:ring-[#327F74]/30"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description / Purpose</label>
              <Input
                value={cashDropDescription}
                onChange={(e) => setCashDropDescription(e.target.value)}
                placeholder={cashDropType === 'in' ? 'e.g., Cash from admin safe' : 'e.g., Office supplies, Cleaning'}
                className="h-11 border-gray-200 focus:ring-2 focus:ring-[#327F74]/30"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => openCashDrawer('MANUAL_OPEN')}
              className="border-[#327F74]/30 text-[#327F74] hover:bg-[#327F74]/5 h-10"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Open Drawer
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCashDropDialog(false)} className="border-gray-200 text-gray-600 h-10">
                Cancel
              </Button>
              <Button
                onClick={handleCashDrop}
                className={`h-10 px-6 font-semibold ${cashDropType === 'in' ? 'bg-[#327F74] hover:bg-[#2a6b61] text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Record {cashDropType === 'in' ? 'Cash Drop' : 'Cash Out'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock POS Dialog */}
      <Dialog open={showLockPOS} onOpenChange={v => { if (!v) { setShowLockPOS(false); setLockPOSPin(''); } }}>
        <DialogContent className="max-w-sm border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-[#F5C742]" /> Lock POS</DialogTitle>
            <DialogDescription>Enter a PIN to lock the POS terminal. Staff will need to enter this PIN to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Set PIN (4–6 digits)</label>
            <Input type="password" placeholder="Enter PIN…" value={lockPOSPin} onChange={e => setLockPOSPin(e.target.value)} maxLength={6} className="h-11 text-center text-xl tracking-widest border-gray-200" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLockPOS(false)} className="border-gray-200">Cancel</Button>
            <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold" onClick={() => { if (lockPOSPin.length >= 4) { setPosLocked(true); setShowLockPOS(false); } }}>
              <Lock className="h-4 w-4 mr-2" />Lock Terminal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POS Locked Overlay */}
      {posLocked && (
        <div className="fixed inset-0 z-[100] bg-[#1E293B] flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#F5C742]/10 border-2 border-[#F5C742] flex items-center justify-center">
            <Lock className="h-10 w-10 text-[#F5C742]" />
          </div>
          <h2 className="text-white text-2xl font-bold">POS Terminal Locked</h2>
          <p className="text-gray-400 text-sm">Enter your PIN to unlock</p>
          <div className="w-64 space-y-3">
            <Input type="password" placeholder="Enter PIN..." value={unlockPin} onChange={e => setUnlockPin(e.target.value)}
              className="text-center text-lg bg-white/10 border-white/20 text-white placeholder-gray-500" />
            <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold"
              onClick={() => { if (unlockPin === lockPOSPin) { setPosLocked(false); setUnlockPin(''); setLockPOSPin(''); } else { setUnlockPin(''); } }}>
              Unlock
            </Button>
          </div>
        </div>
      )}

      {/* Credit Card Balance Dialog */}
      <Dialog open={showCreditCardBalance} onOpenChange={v => { if (!v) { setShowCreditCardBalance(false); setCreditCardNumber(''); setCreditCardResult(null); } }}>
        <DialogContent className="max-w-sm border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-violet-500" /> Check Credit Balance</DialogTitle>
            <DialogDescription>Swipe or enter the card number to check the available balance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Card Number</label>
              <Input placeholder="Swipe or enter card number…" value={creditCardNumber} onChange={e => setCreditCardNumber(e.target.value)} className="h-11 border-gray-200 font-mono tracking-wider" />
            </div>
            {creditCardResult && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
                <span className="text-sm text-green-700 font-medium">Available Balance</span>
                <span className="text-lg font-bold text-green-700 inline-flex items-center gap-1"><DirhamSymbol /> {creditCardResult}</span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreditCardBalance(false)} className="border-gray-200">Cancel</Button>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white font-semibold" onClick={() => setCreditCardResult((Math.random() * 3000 + 500).toFixed(2))}>
              Check Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Last Receipt Dialog */}
      <Dialog open={showLastReceiptDialog} onOpenChange={setShowLastReceiptDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-gray-600" /> Last Receipt</DialogTitle>
            <DialogDescription>Most recent completed transaction</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {invoiceCounter === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No transactions yet in this session.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Invoice #</span><span className="font-semibold">{invoiceCounter}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{selectedCustomerData?.name || 'Walk-in'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Session</span><span className="font-semibold">{currentSession?.id}</span></div>
                <Separator />
                <p className="text-xs text-gray-400 text-center">Receipt details shown for last completed transaction.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLastReceiptDialog(false)}>Close</Button>
            <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-white">
              <Printer className="h-4 w-4 mr-2" />Reprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprint Invoice Modal */}
      {showReprintModal && (() => {
        const toDisplayStatus = (s) => {
          if (!s) return 'Unknown';
          if (s === 'POSTED' || s === 'PAID' || s === 'PARTIALLY_PAID') return 'Completed';
          if (s === 'CANCELLED') return 'Cancelled';
          if (s === 'DRAFT') return 'Draft';
          return s.charAt(0) + s.slice(1).toLowerCase();
        };
        const mapped = reprintInvoices.map(inv => ({
          _raw: inv,
          id: inv.invoiceNumber,
          dbId: inv.id,
          date: inv.invoiceDate,
          time: inv.createdAt ? new Date(inv.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
          customer: inv.customerName || 'Walk-in Customer',
          cashier: inv.posCounterName || '—',
          terminal: inv.posTerminalId || '—',
          payMode: inv.paymentMode || 'Cash',
          items: (inv.items || []).filter(i => !i.voided).length,
          amount: inv.invoiceTotal || 0,
          status: toDisplayStatus(inv.status),
          reprints: 0,
        }));
        const filtered = mapped.filter(inv => {
          if (reprintFilterInvoiceNo && !inv.id?.toLowerCase().includes(reprintFilterInvoiceNo.toLowerCase())) return false;
          if (reprintFilterCustomer && !inv.customer.toLowerCase().includes(reprintFilterCustomer.toLowerCase())) return false;
          if (reprintFilterCashier && !inv.cashier.toLowerCase().includes(reprintFilterCashier.toLowerCase())) return false;
          if (reprintFilterPayMode !== 'All' && inv.payMode !== reprintFilterPayMode) return false;
          if (reprintFilterStatus !== 'All' && inv.status !== reprintFilterStatus) return false;
          return true;
        });
        const selected = filtered.find(inv => inv.id === reprintSelectedInvoice) || null;
        const statusColor = (s) => s === 'Completed' ? 'bg-green-100 text-green-700' : s === 'Returned' ? 'bg-blue-100 text-blue-700' : s === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
        const payModeColor = (p) => p === 'Cash' ? 'bg-emerald-50 text-emerald-700' : p === 'Card' ? 'bg-sky-50 text-sky-700' : p === 'Mixed' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700';
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowReprintModal(false)} />
            <div className="relative ml-auto w-full max-w-6xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              {/* Modal Header */}
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <Printer className="h-5 w-5 text-[#327F74]" />
                    <span className="text-base font-semibold text-[#1E293B]">Reprint Previous Invoices</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">View and reprint previously generated POS invoices.</p>
                  <p className="text-xs text-[#327F74] mt-0.5">Showing invoices for: {reprintFilterDateFrom}{reprintFilterDateTo !== reprintFilterDateFrom ? ` → ${reprintFilterDateTo}` : ''}</p>
                </div>
                <button onClick={() => setShowReprintModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X className="h-5 w-5" /></button>
              </div>

              {/* Filter Bar */}
              <div className="bg-white border-b border-[#327F74]/10 px-5 py-3 shrink-0">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Date From</label><input type="date" value={reprintFilterDateFrom} onChange={e=>setReprintFilterDateFrom(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Date To</label><input type="date" value={reprintFilterDateTo} onChange={e=>setReprintFilterDateTo(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Invoice No.</label><input value={reprintFilterInvoiceNo} onChange={e=>setReprintFilterInvoiceNo(e.target.value)} placeholder="SI-POS-..." className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Customer</label><input value={reprintFilterCustomer} onChange={e=>setReprintFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Cashier</label><input value={reprintFilterCashier} onChange={e=>setReprintFilterCashier(e.target.value)} placeholder="Cashier" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Payment Mode</label>
                    <select value={reprintFilterPayMode} onChange={e=>setReprintFilterPayMode(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['All','Cash','Card','Mixed','Credit'].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Status</label>
                    <select value={reprintFilterStatus} onChange={e=>setReprintFilterStatus(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['All','Completed','Returned','Cancelled','Reprinted'].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <button onClick={fetchReprintInvoices} disabled={reprintLoading} className="mt-auto bg-[#327F74] hover:bg-[#286660] disabled:opacity-60 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />{reprintLoading ? 'Loading…' : 'Search'}</button>
                  <button onClick={() => { setReprintFilterInvoiceNo(''); setReprintFilterCustomer(''); setReprintFilterCashier(''); setReprintFilterPayMode('All'); setReprintFilterStatus('All'); }} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                </div>
                {reprintError && <p className="text-xs text-red-500 mt-1">{reprintError}</p>}
              </div>

              {/* Main body: list + preview */}
              <div className="flex flex-1 min-h-0">
                {/* Invoice List */}
                <div className={`flex flex-col ${selected ? 'w-[55%]' : 'w-full'} border-r border-[#327F74]/10 overflow-hidden`}>
                  <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
                    <span className="text-xs text-gray-500">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''} found</span>
                    <span className="text-xs text-[#327F74]">Latest first</span>
                  </div>
                  <div className="overflow-auto flex-1">
                    {reprintLoading ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                        <p className="text-sm text-gray-400">Loading invoices…</p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                        <FileText className="h-10 w-10 text-gray-300 mb-3" />
                        <p className="text-sm text-gray-500">No POS invoices found for the selected date.</p>
                        <p className="text-xs text-gray-400 mt-1">Try adjusting the filters above.</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#F7F7FA] z-10">
                          <tr className="text-gray-500 border-b border-[#327F74]/10">
                            {['Invoice No.','Date & Time','Customer','Cashier','Terminal','Pay Mode','Items','Amount','Status','Action'].map((h,i) => (
                              <th key={i} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${i >= 6 ? 'text-right' : ''} ${i === 9 ? 'text-center' : ''}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(inv => (
                            <tr key={inv.id} onClick={() => setReprintSelectedInvoice(inv.id === reprintSelectedInvoice ? null : inv.id)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors ${inv.id === reprintSelectedInvoice ? 'bg-[#FFF8DC] border-l-2 border-l-[#F5C742]' : 'hover:bg-white'}`}>
                              <td className="px-3 py-2">
                                <span className="font-semibold text-[#1E293B]">{inv.id}</span>
                                {inv.reprints > 0 && <span className="ml-1 text-[9px] bg-amber-100 text-amber-600 rounded px-1">×{inv.reprints} reprint</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{inv.date}&nbsp;{inv.time}</td>
                              <td className="px-3 py-2 text-[#1E293B] max-w-[100px] truncate">{inv.customer}</td>
                              <td className="px-3 py-2 text-gray-500">{inv.cashier}</td>
                              <td className="px-3 py-2 text-gray-500">{inv.terminal}</td>
                              <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${payModeColor(inv.payMode)}`}>{inv.payMode}</span></td>
                              <td className="px-3 py-2 text-right text-gray-600">{inv.items}</td>
                              <td className="px-3 py-2 text-right font-semibold text-[#1E293B]"><CurrencyAmount amount={inv.amount} /></td>
                              <td className="px-3 py-2 text-right"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(inv.status)}`}>{inv.status}</span></td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={e => { e.stopPropagation(); setReprintSelectedInvoice(inv.id); }} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-2 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                                  <button onClick={e => { e.stopPropagation(); setReprintSelectedInvoice(inv.id); setReprintConfirmOpen(true); }}
                                    disabled={inv.status === 'Cancelled'}
                                    className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-0.5 ${inv.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'}`}>
                                    <Printer className="h-2.5 w-2.5" />Print
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Receipt Preview Panel */}
                {selected && (
                  <div className="w-[45%] flex flex-col overflow-hidden bg-white">
                    <div className="px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] flex items-center justify-between shrink-0">
                      <span className="text-xs font-semibold text-[#1E293B]">Receipt Preview — {selected.id}</span>
                      <button onClick={() => setReprintSelectedInvoice(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      {/* Duplicate watermark banner */}
                      <div className="bg-amber-50 border border-amber-300 rounded text-center py-1 mb-3">
                        <span className="text-xs font-bold text-amber-700 tracking-widest uppercase">Duplicate Copy / Reprint</span>
                      </div>
                      {/* Receipt summary */}
                      <div className="bg-white border border-gray-200 rounded p-4 text-xs space-y-3 shadow-sm">
                        <div className="text-center border-b border-gray-100 pb-3">
                          <p className="font-bold text-[#1E293B] text-sm">{selected._raw?.branchName || currentTerminal?.branchName || 'BillBull Retail'}</p>
                          <p className="text-gray-500">{selected._raw?.branchCode || ''}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1 border-b border-gray-100 pb-3">
                          {[['Invoice No.',selected.id],['Date',selected.date || ''],['Time',selected.time],['Cashier',selected.cashier],['Terminal',selected.terminal],['Customer',selected.customer]].map(([k,v])=>(
                            <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                          ))}
                        </div>
                        {(selected._raw?.items || []).filter(i=>!i.voided).length > 0 ? (
                          <table className="w-full border-b border-gray-100 pb-2">
                            <thead><tr className="text-gray-400">{['Item','Qty','Price','Total'].map(h=><th key={h} className={`py-0.5 text-left ${h!=='Item'?'text-right':''}`}>{h}</th>)}</tr></thead>
                            <tbody>
                              {(selected._raw.items).filter(i=>!i.voided).map((it,i)=>(
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-0.5 text-[#1E293B]">{it.itemName || it.itemCode}</td>
                                  <td className="py-0.5 text-right text-[#1E293B]">{it.quantity}</td>
                                  <td className="py-0.5 text-right text-[#1E293B]">{(it.price||0).toFixed(2)}</td>
                                  <td className="py-0.5 text-right text-[#1E293B]">{(it.netAmount||it.quantity*(it.price||0)).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-gray-400 text-center py-2">Line items not loaded — click Print to fetch full invoice.</p>
                        )}
                        <div className="space-y-1">
                          {[['Subtotal',(selected._raw?.subTotal||0).toFixed(2)],['VAT',(selected._raw?.taxTotal||0).toFixed(2)],['Total',(selected._raw?.invoiceTotal||0).toFixed(2)]].map(([l,v])=>(
                            <div key={l} className={`flex justify-between ${l==='Total'?'font-bold text-[#1E293B] border-t border-gray-200 pt-1':''}`}><span className="text-gray-500">{l}</span><span>{v}</span></div>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 pt-2 space-y-0.5">
                          <div className="flex justify-between"><span className="text-gray-400">Payment Mode</span><span className="font-semibold">{selected.payMode}</span></div>
                        </div>
                      </div>
                      {/* Audit Info */}
                      <div className="mt-3 bg-[#F7F7FA] border border-[#327F74]/20 rounded p-3 space-y-1 text-xs">
                        <p className="font-semibold text-[#1E293B] mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5 text-[#327F74]" />Invoice Info</p>
                        {[['Invoice No.',selected.id],['Date',selected.date||''],['Customer',selected.customer],['Cashier',selected.cashier],['Terminal',selected.terminal]].map(([k,v])=>(
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                    {/* Print Actions */}
                    <div className="border-t border-[#327F74]/10 p-3 bg-white flex items-center gap-2 shrink-0 flex-wrap">
                      <button onClick={() => setReprintConfirmOpen(true)} disabled={selected.status==='Cancelled' || reprintPrinting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded ${selected.status==='Cancelled'?'bg-gray-100 text-gray-400 cursor-not-allowed':'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'}`}>
                        <Printer className="h-3.5 w-3.5" />{reprintPrinting ? 'Printing…' : 'Print Receipt'}
                      </button>
                      <button onClick={() => setReprintSelectedInvoice(null)} className="ml-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
                        <X className="h-3 w-3" />Close
                      </button>
                      {selected.status === 'Cancelled' && (
                        <div className="w-full flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded p-1.5 border border-red-200">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />This invoice is cancelled. Printing is not allowed.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-2.5 flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
                  <Info className="h-3 w-3 shrink-0" />Reprint does not create a new invoice. Every reprint is recorded in the audit log.
                </div>
                <button onClick={() => setShowReprintModal(false)} className="ml-auto border border-gray-300 text-gray-600 text-xs px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cash Drop feedback toast */}
      {cashDropFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${cashDropFeedback.type === 'success' ? 'bg-[#327F74] text-white' : 'bg-red-500 text-white'}`}>
          {cashDropFeedback.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {cashDropFeedback.message}
        </div>
      )}

      {/* Reprint Confirm Popup */}
      <Dialog open={reprintConfirmOpen} onOpenChange={setReprintConfirmOpen}>
        <DialogContent className="sm:max-w-[380px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1E293B]"><Printer className="h-4 w-4 text-[#327F74]" />Confirm Reprint</DialogTitle>
            <DialogDescription>
              You are about to reprint the selected POS invoice. This action will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {reprintSelectedInvoice && (
              <div className="bg-[#FFF8DC] border border-[#F5C742]/40 rounded p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Invoice No.</span><span className="font-semibold text-[#1E293B]">{reprintSelectedInvoice}</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-500">Date Range</span><span className="text-[#1E293B]">{reprintFilterDateFrom}{reprintFilterDateTo !== reprintFilterDateFrom ? ` → ${reprintFilterDateTo}` : ''}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReprintConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]" onClick={handleReprintConfirm} disabled={reprintPrinting}>
              <Printer className="h-4 w-4 mr-1" />{reprintPrinting ? 'Printing…' : 'Confirm & Print'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coupons Dialog */}
      <Dialog open={showCouponsDialog} onOpenChange={v => { if (!v) { setShowCouponsDialog(false); setCouponCode(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-pink-500" /> Apply Coupon</DialogTitle>
            <DialogDescription>Enter a coupon code to apply a discount to the current sale.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Coupon Code</Label>
            <Input placeholder="e.g. SAVE10, WELCOME20..." value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} />
            {appliedCoupon && (
              <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />Coupon "{appliedCoupon}" applied!
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 font-semibold">Available Coupons</p>
              {['SAVE10 — 10% off', 'WELCOME20 — 20% off first purchase', 'MEMBER15 — 15% for members'].map(c => (
                <button key={c} type="button" onClick={() => setCouponCode(c.split(' ')[0])}
                  className="w-full text-left text-xs px-3 py-2 bg-pink-50 hover:bg-pink-100 rounded-lg border border-pink-100 text-pink-700 transition-colors">{c}</button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCouponsDialog(false)}>Cancel</Button>
            <Button className="bg-pink-500 hover:bg-pink-600 text-white" onClick={() => { if (couponCode) { setAppliedCoupon(couponCode); setShowCouponsDialog(false); } }}>
              Apply Coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promotions Dialog */}
      <Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /> Active Promotions</DialogTitle>
            <DialogDescription>Current promotions available for this sale</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {[
              { name: 'Buy 2 Get 1 Free', desc: 'On all supplements — add 3 items, lowest free', tag: 'Auto', color: 'bg-orange-50 border-orange-200' },
              { name: 'Weekend 15% Off', desc: 'All apparel this weekend', tag: 'Active', color: 'bg-green-50 border-green-200' },
              { name: 'Member Double Points', desc: 'Gold & Platinum members earn 2× loyalty points', tag: 'Members', color: 'bg-purple-50 border-purple-200' },
              { name: 'Bundle Discount', desc: <>Protein + Shaker combo — <DirhamSymbol /> 10 off</>, tag: 'Bundle', color: 'bg-blue-50 border-blue-200' },
            ].map(p => (
              <div key={p.name} className={`p-3 rounded-xl border ${p.color} flex items-start gap-3`}>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1E293B]">{p.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                </div>
                <Badge className="bg-orange-500 text-white text-[10px]">{p.tag}</Badge>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-white" onClick={() => setShowPromotionsDialog(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save  Dialog */}
      <Dialog open={showSaveOrderDialog} onOpenChange={v => { if (!v) { setShowSaveOrderDialog(false); setOrderNotes(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-500" /> Save </DialogTitle>
            <DialogDescription>Save this sale as a pending order to fulfil later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-indigo-50 rounded-lg text-sm">
              <p className="font-semibold text-indigo-800">{currentInvoice.items.length} items · {formatCurrency(currentInvoice.total)}</p>
              <p className="text-indigo-600 text-xs mt-0.5">Customer: {selectedCustomerData?.name || 'Walk-in'}</p>
            </div>
            <Label>Order Notes (optional)</Label>
            <Input placeholder="e.g. Deliver by Friday, call before..." value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveOrderDialog(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => {
              setSavedOrders(prev => [...prev, { id: `ORD-${Date.now()}`, total: currentInvoice.total, items: currentInvoice.items.length, note: orderNotes }]);
              clearInvoice(); setShowSaveOrderDialog(false); setOrderNotes('');
            }}>
              <FileText className="h-4 w-4 mr-2" />Save Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legacy Layaways Dialog (kept for backward compat) */}
      <Dialog open={showLayawaysDialog} onOpenChange={v => { if (!v) setShowLayawaysDialog(false); }}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Layaway</DialogTitle></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setShowLayawaysDialog(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PRICE CHECK MODAL ─── */}
      {showPriceCheck && (() => {
        const foundProduct = priceCheckResult && priceCheckResult !== 'searching' && priceCheckResult !== 'notfound' ? priceCheckResult : null;
        const vatRate = foundProduct ? toNumber(foundProduct.salesTax, 5) : 5;
        const basePrice = foundProduct ? toNumber(foundProduct.price, 0) : 0;
        const discountPct = foundProduct ? toNumber(foundProduct.defaultDiscount, 0) : 0;
        const discountedPrice = basePrice * (1 - discountPct / 100);
        const finalPrice = discountedPrice * (1 + vatRate / 100);
        const doSearch = async () => {
          const q = priceCheckQuery.trim();
          if (!q) { setPriceCheckResult('notfound'); return; }
          setPriceCheckResult('searching');
          try {
            // Try unified resolver first (handles barcode, batch, product code)
            const resolved = await resolvePosEntry(q);
            if (resolved?.type === 'PRODUCT' && resolved.product) {
              setPriceCheckResult(mapPosProductAggregateItem(resolved.product, q));
              return;
            }
            // Fallback: name/keyword search via product list
            const searchData = await getProductsList(0, 1, q);
            if (Array.isArray(searchData?.content) && searchData.content.length > 0) {
              setPriceCheckResult(mapPosProductListItem(searchData.content[0]));
              return;
            }
            setPriceCheckResult('notfound');
          } catch { setPriceCheckResult('notfound'); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowPriceCheck(false)} />
            <div className="relative bg-[#F7F7FA] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Search className="h-4 w-4 text-cyan-600" /><span className="text-base font-semibold text-[#1E293B]">Price Check</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Scan or search an item to check price, stock, barcode, and product details.</p>
                </div>
                <button onClick={() => setShowPriceCheck(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Search */}
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex gap-2 shrink-0">
                <input value={priceCheckQuery} onChange={e => setPriceCheckQuery(e.target.value)} onKeyDown={e => e.key==='Enter' && doSearch()}
                  placeholder="Scan barcode or type item name / code..." className="flex-1 border border-[#327F74]/30 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" autoFocus />
                <button onClick={doSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-4 py-2 rounded flex items-center gap-1"><Search className="h-3.5 w-3.5" />Search</button>
                <button onClick={() => { setPriceCheckQuery(''); setPriceCheckResult(null); }} className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50">Clear</button>
              </div>
              <div className="overflow-auto flex-1 p-5">
                {priceCheckResult === null && (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <Search className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Scan a barcode or type an item name to check price and availability.</p>
                  </div>
                )}
                {priceCheckResult === 'searching' && (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm text-gray-400">Searching...</p>
                  </div>
                )}
                {priceCheckResult === 'notfound' && (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <AlertCircle className="h-10 w-10 text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No item found for the scanned barcode or search keyword.</p>
                  </div>
                )}
                {foundProduct && (
                  <div className="space-y-4">
                    {/* Item Card */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 flex gap-4 shadow-sm">
                      {foundProduct.image
                        ? <img src={foundProduct.image} className="w-20 h-20 rounded-lg object-cover shrink-0" alt={foundProduct.name} />
                        : <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 text-gray-300 text-xs">IMG</div>}
                      <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        {[['Item Code',foundProduct.code],['Barcode',foundProduct.barcode],['Item Name',foundProduct.name],['Department',foundProduct.departmentName||'—']].map(([k,v])=>(
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                        ))}
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <div className="text-2xl font-bold text-[#327F74]"><CurrencyAmount amount={finalPrice} /></div>
                        <div className="text-xs text-gray-400">Base: <DirhamSymbol /> {basePrice.toFixed(2)}</div>
                        {discountPct > 0 && <div className="text-xs text-orange-500">Disc {discountPct}%: −<DirhamSymbol /> {(basePrice - discountedPrice).toFixed(2)}</div>}
                        <div className="text-xs text-gray-400">VAT {vatRate}% included</div>
                        <div className="mt-2"><span className={`text-xs rounded px-2 py-0.5 ${foundProduct.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{foundProduct.stock > 0 ? `In Stock: ${foundProduct.stock}` : 'Out of Stock'}</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                {foundProduct && (
                  <button onClick={() => { addToInvoice(foundProduct); setShowPriceCheck(false); setPriceCheckQuery(''); setPriceCheckResult(null); }}
                    className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" />Add to Cart
                  </button>
                )}
                <button onClick={() => setShowPriceCheck(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── CREDIT BALANCE MODAL ─── */}
      {showCreditBalance && (() => {
        // creditBalanceResult: null | 'searching' | 'notfound' | { found, customer, outstanding, creditLimit, advanceBalance }
        const data = creditBalanceResult && typeof creditBalanceResult === 'object' && creditBalanceResult.found ? creditBalanceResult : null;
        const doCreditSearch = async () => {
          const q = creditBalanceQuery.trim();
          if (!q) { setCreditBalanceResult('notfound'); return; }
          setCreditBalanceResult('searching');
          try {
            const res = await posCreditBalance(q);
            setCreditBalanceResult(res.found ? res : 'notfound');
          } catch { setCreditBalanceResult('notfound'); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreditBalance(false)} />
            <div className="relative bg-[#F7F7FA] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Star className="h-4 w-4 text-violet-600" /><span className="text-base font-semibold text-[#1E293B]">Credit Balance / Advance Check</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Search customer to view outstanding balance, credit limit, and advance (deposit) balance.</p>
                </div>
                <button onClick={() => setShowCreditBalance(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex gap-2 shrink-0">
                <input value={creditBalanceQuery} onChange={e=>setCreditBalanceQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doCreditSearch()}
                  placeholder="Scan loyalty card / enter mobile / customer code..." className="flex-1 border border-[#327F74]/30 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" autoFocus />
                <button onClick={doCreditSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-4 py-2 rounded flex items-center gap-1"><Search className="h-3.5 w-3.5" />Search</button>
                <button onClick={()=>{setCreditBalanceQuery('');setCreditBalanceResult(null);}} className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50">Clear</button>
              </div>
              <div className="overflow-auto flex-1 p-5">
                {creditBalanceResult === null && <div className="flex flex-col items-center justify-center h-40 text-center"><Star className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Scan loyalty card or enter mobile number to check balance.</p></div>}
                {creditBalanceResult === 'searching' && <div className="flex flex-col items-center justify-center h-40 text-center"><div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm text-gray-400">Searching...</p></div>}
                {creditBalanceResult === 'notfound' && <div className="flex flex-col items-center justify-center h-40 text-center"><AlertCircle className="h-10 w-10 text-gray-300 mb-3" /><p className="text-sm text-gray-500">No customer found for the scanned card.</p></div>}
                {data && (
                  <div className="space-y-4">
                    {/* Customer Card */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-[#1E293B]">{data.customer.name}</p>
                          <p className="text-xs text-gray-500">{data.customer.code}</p>
                        </div>
                        <span className={`text-xs rounded px-2 py-0.5 ${data.customer.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{data.customer.status || '—'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {[['Mobile', data.customer.mobile||'—'], ['Email', data.customer.email||'—'], ['Type', data.customer.groupType||'—']].map(([k,v])=>(
                          <div key={k}><span className="text-gray-400">{k}:</span><span className="ml-1 text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {label:'Outstanding',val:<CurrencyAmount amount={toNumber(data.outstanding,0)} />,sub:'unpaid invoices',color:'text-red-600'},
                        {label:'Credit Limit',val:<CurrencyAmount amount={toNumber(data.creditLimit,0)} />,sub:'approved limit',color:'text-[#327F74]'},
                        {label:'Advance Balance',val:<CurrencyAmount amount={toNumber(data.advanceBalance,0)} />,sub:'available deposit',color:'text-violet-600'},
                      ].map(k=>(
                        <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg p-4 text-center shadow-sm">
                          <p className="text-[11px] text-gray-400 mb-1">{k.label}</p>
                          <p className={`text-lg font-bold ${k.color}`}>{k.val}</p>
                          <p className="text-[10px] text-gray-400">{k.sub}</p>
                        </div>
                      ))}
                    </div>
                    {/* Credit limit utilisation bar */}
                    {toNumber(data.creditLimit, 0) > 0 && (() => {
                      const pct = Math.min(100, (toNumber(data.outstanding,0) / toNumber(data.creditLimit,0)) * 100);
                      const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[#327F74]';
                      return (
                        <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Credit utilisation</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{width:`${pct}%`}} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                <button onClick={()=>setShowCreditBalance(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── LAYAWAYS LIST MODAL ─── */}
      {showLayawaysList && (() => {
        // Server filters the list; map entity rows to the view shape the table uses.
        const filtered = (layawaysList || []).map(l => {
          const eff = l.effectiveStatus || l.status;
          const created = l.createdAt ? new Date(l.createdAt) : null;
          return {
            id: l.layawayNumber,
            entityId: l.id,
            date: created ? created.toLocaleDateString() : '—',
            time: created ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            customer: l.customerName || l.customerCode || '—',
            cashier: l.cashierName || '—',
            items: (l.items || []).length,
            saleAmt: l.saleTotal || 0,
            deposit: l.depositAmount || 0,
            balance: l.balanceAmount || 0,
            due: l.dueDate || '—',
            status: STATUS_ENUM_TO_LABEL[eff] || eff,
            isOpen: eff === 'ACTIVE' || eff === 'PARTIALLY_PAID' || eff === 'READY_TO_CONVERT',
            raw: l,
          };
        });
        const selected = filtered.find(l => l.entityId === selectedLayawayId) || null;
        const statusColor = (s) => ({Active:'bg-green-100 text-green-700','Partially Paid':'bg-blue-100 text-blue-700','Ready to Convert':'bg-[#F5C742]/20 text-amber-700','Converted to Sale':'bg-gray-100 text-gray-600',Cancelled:'bg-red-100 text-red-600',Expired:'bg-red-50 text-red-500'}[s] || 'bg-gray-100 text-gray-500');
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowLayawaysList(false)} />
            <div className="relative ml-auto w-full max-w-5xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Pause className="h-4 w-4 text-amber-500" /><span className="text-base font-semibold text-[#1E293B]">Layaways</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">View and manage all sales reserved using Save Layaway.</p>
                </div>
                <button onClick={()=>setShowLayawaysList(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Filters */}
              <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Layaway No.</label><input value={layawaysFilterNo} onChange={e=>setLayawaysFilterNo(e.target.value)} placeholder="LAY-..." className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Customer</label><input value={layawaysFilterCustomer} onChange={e=>setLayawaysFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Status</label>
                  <select value={layawaysFilterStatus} onChange={e=>setLayawaysFilterStatus(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                    {['All','Active','Partially Paid','Ready to Convert','Converted to Sale','Cancelled','Expired'].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <button onClick={()=>loadLayaways()} className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
                <button onClick={()=>{setLayawaysFilterStatus('All');setLayawaysFilterCustomer('');setLayawaysFilterNo('');setTimeout(loadLayaways,0);}} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                <button onClick={()=>{setShowLayawaysList(false);setShowSaveLayaway(true);}} className="mt-auto ml-auto bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Plus className="h-3 w-3" />New Layaway</button>
              </div>
              <div className="flex flex-1 min-h-0">
                <div className={`flex flex-col overflow-hidden ${selected?'w-[55%]':'w-full'} border-r border-[#327F74]/10`}>
                  <div className="overflow-auto flex-1">
                    {layawaysLoading ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><RefreshCw className="h-8 w-8 text-gray-300 mb-3 animate-spin" /><p className="text-sm text-gray-400">Loading layaways…</p></div>
                    ) : layawaysError ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><AlertTriangle className="h-8 w-8 text-red-300 mb-3" /><p className="text-sm text-red-500">{layawaysError}</p></div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center"><Archive className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">No layaways found.</p></div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#F7F7FA] z-10 border-b border-[#327F74]/10">
                          <tr className="text-gray-500">{['Layaway No.','Date & Time','Customer','Cashier','Items','Sale Amt','Deposit','Balance','Due Date','Status','Action'].map((h,i)=><th key={i} className={`px-3 py-2 text-left font-medium ${i>=4&&i<=7?'text-right':''} ${i===10?'text-center':''}`}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {filtered.map(l=>(
                            <tr key={l.entityId} onClick={()=>setSelectedLayawayId(l.entityId===selectedLayawayId?null:l.entityId)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors ${l.status==='Expired'?'bg-red-50/30':''} ${l.entityId===selectedLayawayId?'bg-[#FFF8DC] border-l-2 border-l-[#F5C742]':'hover:bg-white'}`}>
                              <td className="px-3 py-2 font-semibold text-[#1E293B]">{l.id}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.date}</td>
                              <td className="px-3 py-2 text-[#1E293B] max-w-[90px] truncate">{l.customer}</td>
                              <td className="px-3 py-2 text-gray-500">{l.cashier}</td>
                              <td className="px-3 py-2 text-right">{l.items}</td>
                              <td className="px-3 py-2 text-right font-semibold"><CurrencyAmount amount={l.saleAmt} /></td>
                              <td className="px-3 py-2 text-right text-green-700"><CurrencyAmount amount={l.deposit} /></td>
                              <td className="px-3 py-2 text-right text-red-600"><CurrencyAmount amount={l.balance} /></td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.due}</td>
                              <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(l.status)}`}>{l.status}</span></td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={e=>{e.stopPropagation();setSelectedLayawayId(l.entityId);}} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                                  {l.isOpen && <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-[10px] px-1.5 py-0.5 rounded" onClick={e=>{e.stopPropagation();startLayawayConversion(l.entityId);}}>Convert</button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                {selected && (
                  <div className="w-[45%] flex flex-col bg-white overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                      <span className="text-xs font-semibold text-[#1E293B]">{selected.id}</span>
                      <button onClick={()=>setSelectedLayawayId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="overflow-auto flex-1 p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-1">
                        {[['Customer',selected.customer],['Cashier',selected.cashier],['Sale Amount',<CurrencyAmount amount={selected.saleAmt} />],['Deposit Paid',<CurrencyAmount amount={selected.deposit} />],['Balance Due',<CurrencyAmount amount={selected.balance} />],['Due Date',selected.due],['Status',selected.status],['Created',selected.date+' '+selected.time]].map(([k,v])=>(
                          <div key={k} className="flex gap-1"><span className="text-gray-400 w-24 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                        ))}
                      </div>
                      {selected.raw?.remarks && (
                        <div className="text-[11px] text-gray-500 bg-[#F7F7FA] rounded p-2"><span className="font-semibold text-[#1E293B]">Remarks: </span>{selected.raw.remarks}</div>
                      )}
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-xs font-semibold text-[#1E293B] mb-1">Reserved Items</p>
                        {(!selectedLayawayDetail || selectedLayawayDetail.id !== selected.entityId) ? (
                          <p className="text-[11px] text-gray-400 py-2">Loading items…</p>
                        ) : (
                        <table className="w-full text-xs">
                          <thead><tr className="text-gray-400">{['Item','Qty','Rate','Amount'].map(h=><th key={h} className={`py-0.5 text-left ${h!=='Item'?'text-right':''}`}>{h}</th>)}</tr></thead>
                          <tbody>
                            {(selectedLayawayDetail.items || []).map((it,i)=>(
                              <tr key={i} className="border-t border-gray-50">
                                <td className="py-1 text-[#1E293B]">{it.itemName}{it.pinnedBatchNumber && <span className="ml-1 text-[9px] text-amber-600">[{it.pinnedBatchNumber}]</span>}</td>
                                <td className="py-1 text-right text-[#1E293B]">{it.quantity}</td>
                                <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={it.price||0} /></td>
                                <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={(it.price||0)*(it.quantity||0)*(1-(it.discount||0)/100)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                      {selected.isOpen && <button onClick={()=>startLayawayConversion(selected.entityId)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Zap className="h-3 w-3" />Convert to Sale</button>}
                      {selected.isOpen && <button disabled={layawayBusyId===selected.entityId} onClick={()=>handleCancelLayaway(selected.entityId)} className="border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-50 flex items-center gap-1 disabled:opacity-40"><XCircle className="h-3 w-3" />{layawayBusyId===selected.entityId?'Cancelling…':'Cancel'}</button>}
                      {selected.raw?.convertedInvoiceNumber && <span className="text-[11px] text-gray-500 self-center">Converted → {selected.raw.convertedInvoiceNumber}</span>}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-2.5 flex justify-end shrink-0">
                <button onClick={()=>setShowLayawaysList(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── SAVE LAYAWAY MODAL ─── */}
      {showSaveLayaway && (() => {
        // Can't create a new layaway while converting an existing one.
        if (activeLayawayId) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={()=>setShowSaveLayaway(false)} />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
                <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-[#1E293B]">Layaway Conversion In Progress</p>
                <p className="text-xs text-gray-500">Complete or cancel the current layaway conversion before saving a new one.</p>
                <button onClick={()=>setShowSaveLayaway(false)} className="mt-2 bg-[#327F74] text-white text-sm px-4 py-2 rounded hover:bg-[#286660]">OK</button>
              </div>
            </div>
          );
        }
        const total = currentInvoice.total || 0;
        const dep = saveLayawayDepositReq ? (parseFloat(saveLayawayDeposit) || 0) : 0;
        const balance = Math.max(0, total - dep);
        const hasCustomer = !!selectedCustomerData && selectedCustomerData.id !== WALK_IN_CUSTOMER.id;
        const activeCartItems = currentInvoice.items.filter(i => !i.isVoided);
        const canSave = hasCustomer && activeCartItems.length > 0 && !saveLayawayBusy;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={()=>setShowSaveLayaway(false)} />
            <div className="relative bg-[#F7F7FA] rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Archive className="h-4 w-4 text-amber-500" /><span className="text-base font-semibold text-[#1E293B]">Save Layaway</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Reserve the current sale for the customer with or without deposit and print a layaway receipt.</p>
                </div>
                <button onClick={()=>setShowSaveLayaway(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="overflow-auto flex-1">
                <div className="grid grid-cols-2 gap-4 p-5">
                  {/* LEFT */}
                  <div className="space-y-4">
                    {/* Customer */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <p className="text-xs font-semibold text-[#1E293B] mb-2">Customer</p>
                      {!hasCustomer ? (
                        <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Customer is required to save layaway.</div>
                      ) : (
                        <div className="space-y-1 text-xs">
                          <p className="font-medium text-[#1E293B]">{selectedCustomerData?.name}</p>
                          <p className="text-gray-500">{selectedCustomerData?.phone} · {selectedCustomerData?.code}</p>
                        </div>
                      )}
                      <button onClick={()=>{ setShowSaveLayaway(false); setShowCustomerDropdown(true); }} className="mt-2 text-xs text-[#327F74] border border-[#327F74]/30 rounded px-2 py-1 hover:bg-[#327F74]/5 flex items-center gap-1"><UserPlus className="h-3 w-3" />Search / Add Customer</button>
                    </div>
                    {/* Cart Items */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                      <div className="px-4 py-2 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B]">Cart Items</div>
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-400 border-b border-gray-100">{['Item','Qty','Rate','Disc','VAT','Total'].map(h=><th key={h} className={`px-3 py-1.5 text-left ${h!=='Item'?'text-right':''}`}>{h}</th>)}</tr></thead>
                        <tbody>
                          {activeCartItems.length === 0 && currentInvoice.items.filter(i=>i.isVoided).length === 0 ? (
                            <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No items in cart</td></tr>
                          ) : currentInvoice.items.map((item,i)=>(
                            <tr key={i} className={`border-b border-gray-50 ${item.isVoided ? 'bg-red-50/60 opacity-70' : ''}`}>
                              <td className="px-3 py-1.5">
                                <span className={item.isVoided ? 'line-through text-red-400' : 'text-[#1E293B]'}>{item.name}</span>
                                {item.isVoided && <span className="ml-1 text-[9px] font-bold text-red-500">VOIDED</span>}
                              </td>
                              <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'line-through text-red-400' : ''}`}>{item.quantity}</td>
                              <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'line-through text-red-400' : ''}`}><CurrencyAmount amount={item.price} /></td>
                              <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'text-red-300' : 'text-red-500'}`}>{item.discount>0?`${item.discount}%`:'—'}</td>
                              <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'line-through text-red-400' : ''}`}>{toNumber(item.taxRate,5)}%</td>
                              <td className={`px-3 py-1.5 text-right font-semibold ${item.isVoided ? 'line-through text-red-400' : ''}`}><CurrencyAmount amount={item.isVoided ? 0 : item.quantity*item.price*(1-item.discount/100)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* RIGHT */}
                  <div className="space-y-4">
                    {/* Payment Section */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-xs font-semibold text-[#1E293B]">Layaway Payment</p>
                      <div className="flex justify-between items-center py-1 border-b border-gray-100">
                        <span className="text-xs text-gray-500">Total Sale Amount</span>
                        <span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={total} /></span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Deposit Required</span>
                        <button onClick={()=>setSaveLayawayDepositReq(!saveLayawayDepositReq)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${saveLayawayDepositReq?'bg-[#327F74]':'bg-gray-200'}`}>
                          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${saveLayawayDepositReq?'translate-x-4':'translate-x-0.5'}`} />
                        </button>
                      </div>
                      {saveLayawayDepositReq && (
                        <>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Deposit Amount (<DirhamSymbol />)</label>
                            <input type="number" value={saveLayawayDeposit} onChange={e=>setSaveLayawayDeposit(e.target.value)} placeholder="0.00" className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Deposit Payment Mode</label>
                            <select value={saveLayawayPayMode} onChange={e=>setSaveLayawayPayMode(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                              {['Cash','Card','Bank Transfer','Wallet'].map(o=><option key={o}>{o}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between items-center py-1 bg-[#FFF8DC] rounded px-2">
                        <span className="text-xs text-gray-600">Balance Amount</span>
                        <span className="text-sm font-bold text-amber-700"><CurrencyAmount amount={balance} /></span>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Due / Expiry Date</label>
                        <input type="date" value={saveLayawayDueDate} onChange={e=>setSaveLayawayDueDate(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Remarks</label>
                        <textarea value={saveLayawayRemarks} onChange={e=>setSaveLayawayRemarks(e.target.value)} placeholder="Collection instructions, notes..." className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs resize-none h-14 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                    </div>
                    {/* Options */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2">
                      <p className="text-xs font-semibold text-[#1E293B] mb-1">Options</p>
                      {([['Reserve Stock',saveLayawayReserveStock,setSaveLayawayReserveStock],['Print Layaway Receipt',saveLayawayPrintReceipt,setSaveLayawayPrintReceipt],['Send SMS / WhatsApp',saveLayawaySendSms,setSaveLayawaySendSms]]).map(([label,val,setter])=>(
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{label}</span>
                          <button onClick={()=>setter(!val)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${val?'bg-[#327F74]':'bg-gray-200'}`}>
                            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${val?'translate-x-4':'translate-x-0.5'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Receipt Preview */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                      <div className="px-4 py-2 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B]">Receipt Preview</div>
                      <div className="p-3 text-xs space-y-1">
                        <p className="text-center font-bold text-[#1E293B]">BillBull Retail LLC</p>
                        <p className="text-center text-gray-500 text-[10px]">Main Branch - Dubai Mall</p>
                        <div className="border-t border-gray-100 my-1 pt-1 text-[10px] text-amber-700 font-semibold text-center">NOT A TAX INVOICE — LAYAWAY RECEIPT</div>
                        {[['Layaway No.','Auto (LAY-…)'],['Date',new Date().toLocaleDateString()],['Customer',hasCustomer ? selectedCustomerData?.name : '—'],['Total',<CurrencyAmount amount={total} />],['Deposit',<CurrencyAmount amount={dep} />],['Balance Due',<CurrencyAmount amount={balance} />],['Expiry',saveLayawayDueDate]].map(([k,v])=>(
                          <div key={k} className="flex justify-between text-[10px]"><span className="text-gray-400">{k}</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                        <p className="text-center text-[10px] text-gray-400 border-t border-gray-100 pt-1 mt-1">Items will be reserved until the due date. Balance must be paid on collection.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {saveLayawayError && (
                <div className="bg-red-50 border-t border-red-200 px-5 py-2 text-xs text-red-600 shrink-0">{saveLayawayError}</div>
              )}
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                <button onClick={()=>setShowSaveLayaway(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                <button disabled={!canSave} onClick={()=>saveCurrentLayaway(false)} className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"><Archive className="h-3.5 w-3.5" />{saveLayawayBusy ? 'Saving…' : 'Save Layaway'}</button>
                <button disabled={!canSave} onClick={()=>saveCurrentLayaway(true)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"><Printer className="h-3.5 w-3.5" />Save &amp; Print Receipt</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── SALES RETURN MODAL ─── */}
      {showReturn && (() => {
        // Compute totals from real returnable items
        const activeItems = returnableItems.filter(it => (returnSelectedItems[it.itemCode] || 0) > 0);
        const returnSubtotal = returnableItems.reduce((s, it) => {
          const qty = returnSelectedItems[it.itemCode] || 0;
          return s + qty * parseFloat(it.unitPrice || 0);
        }, 0);
        const returnVAT = returnableItems.reduce((s, it) => {
          const qty = returnSelectedItems[it.itemCode] || 0;
          return s + qty * parseFloat(it.unitPrice || 0) * (parseFloat(it.taxRate || 5) / 100);
        }, 0);
        const returnNet = returnSubtotal + returnVAT;
        const anyItemSelected = activeItems.length > 0;

        const doSearchInvoice = async () => {
          const q = returnInvoiceQuery.trim();
          const mob = returnCustomerMobile.trim();
          if (!q && !mob) return;
          setReturnInvoiceLoading(true);
          setReturnInvoiceError('');
          setReturnInvoiceFound(null);
          try {
            const inv = await lookupPosInvoice({
              invoiceNumber: q || undefined,
              customerMobile: mob || undefined,
              dateFrom: returnDateFrom || undefined,
              branchId: currentTerminal?.branchId || undefined,
            });
            setReturnInvoiceFound(inv);
          } catch (err) {
            if (err?.response?.status === 404) {
              setReturnInvoiceFound(false);
            } else {
              setReturnInvoiceError(err?.response?.data?.message || 'Search failed. Try again.');
            }
          } finally {
            setReturnInvoiceLoading(false);
          }
        };

        const doLoadReturnableItems = async () => {
          if (!returnInvoiceFound || returnInvoiceFound === false) return;
          setReturnItemsLoading(true);
          try {
            const batches = await getReturnableBatches(returnInvoiceFound.invoiceNumber);
            const grouped = {};
            (batches || []).forEach(b => {
              const key = b.itemCode;
              if (!grouped[key]) {
                grouped[key] = { itemCode: b.itemCode, itemName: b.itemName, unit: b.unit,
                  soldQty: 0, alreadyReturned: 0, returnable: 0, unitPrice: 0, taxRate: 5, batches: [] };
              }
              grouped[key].soldQty += parseFloat(b.originalQty || 0);
              grouped[key].alreadyReturned += parseFloat(b.alreadyReturnedQty || 0);
              grouped[key].returnable += parseFloat(b.returnableQty || 0);
              grouped[key].batches.push(b);
            });
            const invoiceItems = returnInvoiceFound.items || [];
            Object.values(grouped).forEach(g => {
              const invItem = invoiceItems.find(i => i.itemCode === g.itemCode);
              if (invItem) { g.unitPrice = parseFloat(invItem.price || 0); g.taxRate = parseFloat(invItem.taxRate || 5); }
            });
            invoiceItems.forEach(invItem => {
              if (!grouped[invItem.itemCode] && !invItem.voided) {
                grouped[invItem.itemCode] = { itemCode: invItem.itemCode, itemName: invItem.itemName,
                  unit: invItem.unit || 'Each', soldQty: parseFloat(invItem.quantity || 0),
                  alreadyReturned: 0, returnable: parseFloat(invItem.quantity || 0),
                  unitPrice: parseFloat(invItem.price || 0), taxRate: parseFloat(invItem.taxRate || 5), batches: [] };
              }
            });
            setReturnableItems(Object.values(grouped));
          } catch { setReturnableItems([]); } finally { setReturnItemsLoading(false); }
        };

        const doAdvanceToItems = async () => { await doLoadReturnableItems(); setReturnStep(2); };

        const doSaveReturn = async (andApprove = false, andPrint = false) => {
          if (!anyItemSelected) return;
          setReturnSaving(true);
          try {
            const inv = returnInvoiceFound;
            const itemsPayload = returnableItems
              .filter(it => (returnSelectedItems[it.itemCode] || 0) > 0)
              .map(it => {
                const qty = returnSelectedItems[it.itemCode] || 0;
                const itemStatus = (returnItemConditions[it.itemCode] || 'Good') === 'Damaged' ? 'Damaged/Scrap' : 'Good/Restock';
                const itemTotal = qty * parseFloat(it.unitPrice || 0) * (1 + parseFloat(it.taxRate || 5) / 100);
                const batchesForItem = it.batches.slice(0, qty).map(b => ({
                  originalAllocationId: b.allocationId, batchMasterId: b.batchMasterId,
                  batchNumber: b.batchNumber, binCode: b.binCode, quantity: 1, expiryDate: b.expiryDate,
                }));
                return { itemCode: it.itemCode, itemName: it.itemName, unit: it.unit,
                  soldQty: it.soldQty, returnQty: qty, price: it.unitPrice, taxRate: it.taxRate,
                  taxAmount: qty * parseFloat(it.unitPrice || 0) * (parseFloat(it.taxRate || 5) / 100),
                  total: itemTotal, itemStatus, reason: returnReasons[it.itemCode] || '', batches: batchesForItem };
              });
            const payload = {
              linkedInvoice: inv.invoiceNumber, returnDate: new Date().toISOString().split('T')[0],
              customerCode: inv.customerCode, customerName: inv.customerName,
              subTotal: returnSubtotal, taxAmount: returnVAT, totalAmount: returnNet,
              reason: Object.values(returnReasons).filter(Boolean).join(', ') || 'POS Return',
              returnAction: returnRefundMethod === 'Credit Voucher' ? 'Credit Note' : 'Refund',
              internalNotes: `Refund method: ${returnRefundMethod}. POS terminal ${currentTerminal?.terminalId || ''}.`,
              status: 'DRAFT', branchId: inv.branchId, branchName: inv.branchName, branchCode: inv.branchCode,
              items: itemsPayload,
            };
            const saved = await saveSalesReturn(payload);
            if (andApprove || andPrint) await updateSalesReturnStatus(saved.id, 'APPROVED');
            if (andPrint) {
              const html = `<html><body style="font-family:monospace;font-size:12px;max-width:300px;margin:auto">
                <p style="text-align:center;font-weight:bold">${inv.branchName || 'BillBull'}</p>
                <p style="text-align:center">SALES RETURN / CREDIT NOTE</p><hr/>
                <p>Invoice: ${inv.invoiceNumber}</p><p>Return: ${saved.returnNumber}</p>
                <p>Customer: ${inv.customerName || 'Walk-in'}</p><p>Refund: ${returnRefundMethod}</p><hr/>
                ${itemsPayload.map(i=>`<p>${i.itemName} ×${i.returnQty} = AED ${i.total?.toFixed(2)}</p>`).join('')}
                <hr/><p>VAT: AED ${returnVAT.toFixed(2)}</p><p><b>Total Refund: AED ${returnNet.toFixed(2)}</b></p>
                </body></html>`;
              printHtml(html);
            }
            setShowReturn(false); setReturnStep(1); setReturnInvoiceQuery(''); setReturnCustomerMobile('');
            setReturnDateFrom(''); setReturnInvoiceFound(null); setReturnableItems([]);
            setReturnSelectedItems({}); setReturnReasons({}); setReturnItemConditions({});
            setReturnRefundMethod('Cash Back'); setReturnSavedId(null);
          } catch (err) {
            alert(err?.response?.data?.message || err?.message || 'Error processing return.');
          } finally { setReturnSaving(false); }
        };
        const steps = ['Scan Invoice','Select Items','Refund Method','Confirm Return'];
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={()=>setShowReturn(false)} />
            <div className="relative ml-auto w-full max-w-4xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-purple-600" /><span className="text-base font-semibold text-[#1E293B]">Sales Return</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Scan the old invoice, select returned items and quantities, and process refund or credit voucher.</p>
                </div>
                <button onClick={()=>setShowReturn(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Step Progress */}
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-0 shrink-0">
                {steps.map((s,i)=>(
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${returnStep>i+1?'bg-[#327F74] text-white':returnStep===i+1?'bg-[#F5C742] text-[#1E293B]':'bg-gray-100 text-gray-400'}`}>{returnStep>i+1?'✓':i+1}</div>
                      <span className={`text-xs ${returnStep===i+1?'font-semibold text-[#1E293B]':'text-gray-400'}`}>{s}</span>
                    </div>
                    {i<steps.length-1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
                  </React.Fragment>
                ))}
              </div>
              <div className="overflow-auto flex-1 p-5">
                {/* STEP 1 — Invoice Lookup */}
                {returnStep === 1 && (
                  <div className="max-w-lg mx-auto space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Scan / Search Invoice</p>
                      <input value={returnInvoiceQuery}
                        onChange={e=>{setReturnInvoiceQuery(e.target.value);setReturnInvoiceFound(null);setReturnInvoiceError('');}}
                        onKeyDown={e=>e.key==='Enter'&&doSearchInvoice()}
                        placeholder="Scan invoice barcode or enter invoice number..."
                        className="w-full border border-[#327F74]/30 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" autoFocus />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">Customer Mobile</label>
                          <input value={returnCustomerMobile}
                            onChange={e=>{setReturnCustomerMobile(e.target.value);setReturnInvoiceFound(null);setReturnInvoiceError('');}}
                            onKeyDown={e=>e.key==='Enter'&&doSearchInvoice()}
                            placeholder="+971 XX XXX XXXX" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">From Date</label>
                          <input type="date" value={returnDateFrom} onChange={e=>setReturnDateFrom(e.target.value)}
                            className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={doSearchInvoice} disabled={returnInvoiceLoading||(!returnInvoiceQuery.trim()&&!returnCustomerMobile.trim())}
                          className="bg-[#327F74] hover:bg-[#286660] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded flex items-center gap-1">
                          <Search className="h-3.5 w-3.5" />{returnInvoiceLoading?'Searching…':'Search Invoice'}
                        </button>
                        <button onClick={()=>{setReturnInvoiceQuery('');setReturnCustomerMobile('');setReturnDateFrom('');setReturnInvoiceFound(null);setReturnInvoiceError('');}}
                          className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50">Clear</button>
                      </div>
                    </div>
                    {returnInvoiceError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600"><AlertCircle className="h-4 w-4 shrink-0" />{returnInvoiceError}</div>
                    )}
                    {returnInvoiceFound === false && !returnInvoiceError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600"><AlertCircle className="h-4 w-4 shrink-0" />Invoice not found. Please check the invoice number and try again.</div>
                    )}
                    {returnInvoiceFound && returnInvoiceFound !== false && (
                      <div className="bg-white border border-[#F5C742]/40 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm text-[#1E293B]">Invoice Found</p>
                          <span className="text-xs bg-green-100 text-green-700 rounded px-2 py-0.5">Eligible for Return</span>
                        </div>
                        {[
                          ['Invoice No.', returnInvoiceFound.invoiceNumber],
                          ['Date', returnInvoiceFound.invoiceDate],
                          ['Customer', returnInvoiceFound.customerName||returnInvoiceFound.customerCode||'Walk-in'],
                          ['Terminal', returnInvoiceFound.posCounterName||returnInvoiceFound.posTerminalId||'—'],
                          ['Payment Mode', returnInvoiceFound.paymentMode||'—'],
                          ['Invoice Total', <CurrencyAmount amount={parseFloat(returnInvoiceFound.invoiceTotal||0)} />],
                          ['Status', returnInvoiceFound.status],
                        ].map(([k,v])=>(
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* STEP 2 — Select Items */}
                {returnStep === 2 && (
                  <div className="space-y-3">
                    {returnItemsLoading ? (
                      <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
                        <div className="w-4 h-4 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin" />Loading items…
                      </div>
                    ) : (
                      <>
                        <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                          <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B]">
                            Select Items to Return — Invoice {returnInvoiceFound?.invoiceNumber}
                          </div>
                          {returnableItems.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-400">No returnable items found for this invoice.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-[#327F74]/10">
                                  {['Code','Item','Sold','Returned','Returnable','Return Qty','Rate','VAT','Return Amt','Condition','Reason'].map(h=>(
                                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {returnableItems.map(it=>{
                                  const returnable=parseFloat(it.returnable||0);
                                  const selQty=returnSelectedItems[it.itemCode]||0;
                                  const lineAmt=selQty*parseFloat(it.unitPrice||0)*(1+parseFloat(it.taxRate||5)/100);
                                  return (
                                    <tr key={it.itemCode} className={`border-b border-gray-50 ${returnable===0?'bg-gray-50 opacity-60':''}`}>
                                      <td className="px-2 py-2 text-gray-500">{it.itemCode}</td>
                                      <td className="px-2 py-2 text-[#1E293B]">{it.itemName}</td>
                                      <td className="px-2 py-2 text-center">{it.soldQty}</td>
                                      <td className="px-2 py-2 text-center text-amber-600">{it.alreadyReturned}</td>
                                      <td className="px-2 py-2 text-center text-green-700">{returnable}</td>
                                      <td className="px-2 py-2">
                                        {returnable>0?(
                                          <input type="number" min={0} max={returnable} value={selQty}
                                            onChange={e=>setReturnSelectedItems(prev=>({...prev,[it.itemCode]:Math.min(returnable,Math.max(0,parseInt(e.target.value)||0))}))}
                                            className="w-14 border border-[#327F74]/30 rounded px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                                        ):<span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">N/A</span>}
                                      </td>
                                      <td className="px-2 py-2 text-right"><CurrencyAmount amount={parseFloat(it.unitPrice||0)} /></td>
                                      <td className="px-2 py-2 text-right">{it.taxRate||5}%</td>
                                      <td className="px-2 py-2 text-right font-semibold text-[#327F74]"><CurrencyAmount amount={lineAmt} /></td>
                                      <td className="px-2 py-2">
                                        {returnable>0?(
                                          <select value={returnItemConditions[it.itemCode]||'Good'} onChange={e=>setReturnItemConditions(prev=>({...prev,[it.itemCode]:e.target.value}))}
                                            className="border border-[#327F74]/30 rounded px-1 py-0.5 text-[10px] focus:outline-none w-20">
                                            <option>Good</option><option>Damaged</option>
                                          </select>
                                        ):<span className="text-[10px] text-gray-400">—</span>}
                                      </td>
                                      <td className="px-2 py-2">
                                        {returnable>0?(
                                          <select value={returnReasons[it.itemCode]||''} onChange={e=>setReturnReasons(prev=>({...prev,[it.itemCode]:e.target.value}))}
                                            className="border border-[#327F74]/30 rounded px-1 py-0.5 text-[10px] focus:outline-none w-28">
                                            <option value="">Select…</option>
                                            {['Damaged Goods','Wrong item','Changed mind','Expired item','Price issue','Defective','Other'].map(o=><option key={o}>{o}</option>)}
                                          </select>
                                        ):<span className="text-[10px] text-gray-400">—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                        <div className="bg-[#FFF8DC] border border-[#F5C742]/40 rounded-lg p-3 flex items-center justify-between text-sm">
                          <span className="text-gray-600">Total Return Amount (incl. VAT):</span>
                          <span className="font-bold text-[#1E293B]"><CurrencyAmount amount={returnNet} /></span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* STEP 3 — Refund Method */}
                {returnStep === 3 && (
                  <div className="max-w-lg mx-auto space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <p className="text-sm font-semibold text-[#1E293B] mb-3">Return Summary</p>
                      {[['Subtotal',returnSubtotal],['VAT Reversal',returnVAT],['Net Refund Amount',returnNet]].map(([k,v])=>(
                        <div key={k} className={`flex justify-between py-1 ${k==='Net Refund Amount'?'font-bold border-t border-gray-200 pt-2':''}`}>
                          <span className="text-gray-500 text-sm">{k}</span><span className="text-sm"><CurrencyAmount amount={v} /></span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <p className="text-sm font-semibold text-[#1E293B] mb-3">Select Refund Method</p>
                      <div className="space-y-2">
                        {['Cash Back','Card Refund','Credit Voucher','Customer Credit Balance','Exchange Adjustment'].map(method=>(
                          <label key={method} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[#F7F7FA]">
                            <input type="radio" name="refund" value={method} checked={returnRefundMethod===method} onChange={()=>setReturnRefundMethod(method)} className="accent-[#327F74]" />
                            <span className="text-sm text-[#1E293B]">{method}</span>
                          </label>
                        ))}
                      </div>
                      {returnRefundMethod==='Credit Voucher'&&(
                        <div className="mt-3 p-3 bg-[#F7F7FA] border border-[#327F74]/20 rounded space-y-2 text-xs">
                          <div className="flex justify-between"><span className="text-gray-500">Voucher Amount</span><span className="font-semibold"><CurrencyAmount amount={returnNet} /></span></div>
                          <div><label className="text-gray-500 block mb-0.5">Voucher Expiry</label>
                            <input type="date" value={returnVoucherExpiry} onChange={e=>setReturnVoucherExpiry(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                          </div>
                        </div>
                      )}
                      {returnRefundMethod==='Cash Back'&&(
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Cash refund requires manager approval. Please request supervisor authorization.</div>
                      )}
                    </div>
                  </div>
                )}
                {/* STEP 4 — Confirm */}
                {returnStep === 4 && (
                  <div className="max-w-lg mx-auto space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                      <p className="text-sm font-semibold text-[#1E293B] mb-2">Confirm Return</p>
                      {[
                        ['Original Invoice', returnInvoiceFound?.invoiceNumber||'—'],
                        ['Customer', returnInvoiceFound?.customerName||returnInvoiceFound?.customerCode||'Walk-in'],
                        ['Items Selected', `${activeItems.length} line(s)`],
                        ['Refund Method', returnRefundMethod],
                        ['Subtotal', <CurrencyAmount amount={returnSubtotal} />],
                        ['VAT Reversal', <CurrencyAmount amount={returnVAT} />],
                        ['Net Refund Amount', <CurrencyAmount amount={returnNet} />],
                      ].map(([k,v])=>(
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0">
                          <span className="text-gray-400 w-40 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2 text-xs text-amber-700">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>Every return is recorded in the audit log. Stock will be updated based on return condition. VAT will be reversed correctly.</div>
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                      <div className="px-4 py-2 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B]">Return Receipt Preview</div>
                      <div className="p-3 text-[10px] space-y-0.5">
                        <p className="text-center font-bold text-sm">{returnInvoiceFound?.branchName||'BillBull'}</p>
                        <p className="text-center text-purple-600 font-bold border-t border-b border-gray-100 py-1 my-1">SALES RETURN / CREDIT NOTE</p>
                        {[
                          ['Original Invoice', returnInvoiceFound?.invoiceNumber||'—'],
                          ['Customer', returnInvoiceFound?.customerName||'Walk-in'],
                          ['Refund Method', returnRefundMethod],
                          ['Net Refund', <CurrencyAmount amount={returnNet} />],
                        ].map(([k,v])=>(
                          <div key={k} className="flex justify-between"><span className="text-gray-400">{k}</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                        <div className="border-t border-gray-100 mt-1 pt-1 space-y-0.5">
                          {activeItems.map(it=>(
                            <div key={it.itemCode} className="flex justify-between">
                              <span className="text-gray-500">{it.itemName} ×{returnSelectedItems[it.itemCode]}</span>
                              <CurrencyAmount amount={(returnSelectedItems[it.itemCode]||0)*parseFloat(it.unitPrice||0)*(1+parseFloat(it.taxRate||5)/100)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex items-center justify-between shrink-0">
                <div className="flex gap-2">
                  {returnStep>1&&!returnSaving&&<button onClick={()=>setReturnStep(s=>s-1)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">← Back</button>}
                  <button onClick={()=>setShowReturn(false)} disabled={returnSaving} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                </div>
                <div className="flex gap-2">
                  {returnStep===1&&(
                    <button onClick={doAdvanceToItems} disabled={!returnInvoiceFound||returnInvoiceFound===false||returnInvoiceLoading}
                      className="bg-[#327F74] hover:bg-[#286660] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded">Next →</button>
                  )}
                  {returnStep===2&&(
                    <button onClick={()=>setReturnStep(3)} disabled={!anyItemSelected}
                      className={`text-sm px-5 py-2 rounded ${!anyItemSelected?'bg-gray-100 text-gray-400 cursor-not-allowed':'bg-[#327F74] hover:bg-[#286660] text-white'}`}>Next →</button>
                  )}
                  {returnStep===3&&(
                    <button onClick={()=>setReturnStep(4)} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-5 py-2 rounded">Next →</button>
                  )}
                  {returnStep===4&&(<>
                    <button onClick={()=>doSaveReturn(false,false)} disabled={returnSaving||!anyItemSelected}
                      className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 disabled:opacity-50">
                      {returnSaving?'Saving…':'Save Draft'}
                    </button>
                    <button onClick={()=>doSaveReturn(true,false)} disabled={returnSaving||!anyItemSelected}
                      className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" />{returnSaving?'Processing…':'Confirm Return'}
                    </button>
                    <button onClick={()=>doSaveReturn(true,true)} disabled={returnSaving||!anyItemSelected}
                      className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1 disabled:opacity-50">
                      <Printer className="h-3.5 w-3.5" />{returnSaving?'Processing…':'Confirm & Print'}
                    </button>
                  </>)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Shipping Dialog */}
      <Dialog open={showAddShippingDialog} onOpenChange={v => { if (!v) setShowAddShippingDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-teal-500" /> Add Shipping</DialogTitle>
            <DialogDescription>Add shipping details and cost to this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Delivery Address</Label>
              <Input placeholder="Street, city, emirate..." value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Shipping Method</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[{id:'standard',label:'Standard',price:'15'},{id:'express',label:'Express',price:'35'},{id:'same-day',label:'Same Day',price:'60'}].map(m => (
                  <button key={m.id} type="button" onClick={() => { setShippingMethod(m.id); setShippingCost(m.price); }}
                    className={`p-2 rounded-lg border-2 text-center transition-colors ${shippingMethod === m.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}`}>
                    <p className="text-xs font-semibold text-[#1E293B]">{m.label}</p>
                    <p className="text-[10px] text-teal-600"><DirhamSymbol /> {m.price}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Shipping Cost (<DirhamSymbol />)</Label>
              <Input type="number" value={shippingCost} onChange={e => setShippingCost(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddShippingDialog(false)}>Cancel</Button>
            <Button className="bg-teal-500 hover:bg-teal-600 text-white" onClick={() => setShowAddShippingDialog(false)}>
              <CheckCircle className="h-4 w-4 mr-2" />Add Shipping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={showAddCustomerDialog} onOpenChange={v => { if (!v) { setShowAddCustomerDialog(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerEmail(''); } }}>
        <DialogContent className="max-w-sm border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-sky-500" /> Add New Customer</DialogTitle>
            <DialogDescription>Register a new customer and assign them to this sale.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Full Name <span className="text-red-400 normal-case font-normal">*</span></label>
              <Input placeholder="Customer name…" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="h-11 border-gray-200" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Phone Number</label>
              <Input placeholder="+971 50 000 0000" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} className="h-11 border-gray-200" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Email <span className="normal-case font-normal text-gray-400">(optional)</span></label>
              <Input type="email" placeholder="customer@email.com" value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)} className="h-11 border-gray-200" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddCustomerDialog(false)} className="border-gray-200">Cancel</Button>
            <Button className="bg-sky-500 hover:bg-sky-600 text-white font-semibold" disabled={!newCustomerName.trim()} onClick={() => {
              setShowAddCustomerDialog(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerEmail('');
            }}>
              <UserPlus className="h-4 w-4 mr-2" />Save Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── SERIAL / BATCH CHECK MODAL ─── */}
      {showSerialBatch && (() => {
        // serialBatchResult: null | 'searching' | 'notfound' | { results, total }
        const results = serialBatchResult && typeof serialBatchResult === 'object' ? serialBatchResult.results || [] : [];
        const hasResults = results.length > 0;
        const selectedItem = serialBatchSelectedItem;
        const isConvert = serialBatchSubView === 'convert';
        const isService = serialBatchSubView === 'service';
        const doBatchSearch = async () => {
          const q = serialBatchQuery.trim();
          const inv = serialBatchInvoiceNo.trim();
          const ic = serialBatchItemCode.trim();
          const mob = serialBatchCustomerMobile.trim();
          if (!q && !inv && !ic && !mob) { setSerialBatchResult('notfound'); return; }
          setSerialBatchResult('searching');
          setSerialBatchSelectedItem(null);
          try {
            const res = await posBatchCheck({ batchNumber: q, invoiceNumber: inv, itemCode: ic, customerMobile: mob });
            setSerialBatchResult(res.total > 0 ? res : 'notfound');
          } catch { setSerialBatchResult('notfound'); }
        };
        const resetBatchSearch = () => {
          setSerialBatchQuery(''); setSerialBatchInvoiceNo(''); setSerialBatchItemCode('');
          setSerialBatchCustomerMobile(''); setSerialBatchResult(null); setSerialBatchSelectedItem(null);
        };
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
        const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={()=>setShowSerialBatch(false)} />
            <div className="relative ml-auto w-full max-w-3xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              {/* Header */}
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    {isConvert && <button onClick={()=>setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
                    {isService && <button onClick={()=>setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
                    <Hash className="h-4 w-4 text-teal-600" />
                    <span className="text-base font-semibold text-[#1E293B]">{isConvert ? 'Convert to Return' : isService ? 'Create Service Job' : 'Serial / Batch Check'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{isConvert ? 'Process return for this serial/batch item.' : isService ? 'Create a service repair job for this item.' : 'Search sold batch or serial items, view invoice details, and convert eligible items to return.'}</p>
                </div>
                <button onClick={()=>setShowSerialBatch(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              {/* ── CHECK VIEW ── */}
              {!isConvert && !isService && (
                <>
                  {/* Search */}
                  <div className="bg-white border-b border-gray-100 px-5 py-3 space-y-2 shrink-0">
                    <input value={serialBatchQuery} onChange={e=>setSerialBatchQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doBatchSearch()}
                      placeholder="Scan batch number..." autoFocus
                      className="w-full border border-[#327F74]/30 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    <div className="flex flex-wrap gap-2">
                      <input value={serialBatchItemCode} onChange={e=>setSerialBatchItemCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doBatchSearch()}
                        placeholder="Item code / barcode" className="flex-1 min-w-[140px] border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      <input value={serialBatchInvoiceNo} onChange={e=>setSerialBatchInvoiceNo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doBatchSearch()}
                        placeholder="Invoice number" className="flex-1 min-w-[140px] border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      <input value={serialBatchCustomerMobile} onChange={e=>setSerialBatchCustomerMobile(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doBatchSearch()}
                        placeholder="Customer mobile" className="flex-1 min-w-[120px] border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      <button onClick={doBatchSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
                      <button onClick={resetBatchSearch} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                    </div>
                  </div>
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Results list */}
                    <div className={`flex flex-col overflow-hidden ${selectedItem ? 'w-[45%] border-r border-[#327F74]/10' : 'w-full'}`}>
                      <div className="overflow-auto flex-1 p-5">
                        {serialBatchResult === null && (
                          <div className="flex flex-col items-center justify-center h-48 text-center"><Hash className="h-12 w-12 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Scan or enter a batch number or invoice to search sold items.</p></div>
                        )}
                        {serialBatchResult === 'searching' && (
                          <div className="flex flex-col items-center justify-center h-48 text-center"><div className="w-8 h-8 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm text-gray-400">Searching...</p></div>
                        )}
                        {serialBatchResult === 'notfound' && (
                          <div className="flex flex-col items-center justify-center h-48 text-center"><AlertCircle className="h-12 w-12 text-gray-300 mb-3" /><p className="text-sm text-gray-500">No sold batch item found.</p><p className="text-xs text-gray-400 mt-1">Try searching by invoice number or item code.</p></div>
                        )}
                        {hasResults && (
                          <div className="space-y-2">
                            {results.map((item, i) => (
                              <div key={i} onClick={() => setSerialBatchSelectedItem(item)}
                                className={`bg-white border rounded-lg p-3 shadow-sm cursor-pointer transition-colors ${selectedItem === item ? 'border-[#327F74] bg-[#F0FAF8]' : 'border-[#327F74]/20 hover:border-[#327F74]/50'}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-[#1E293B] text-sm truncate">{item.itemName}</p>
                                    <p className="text-xs text-gray-500">{item.itemCode}{item.batchNumber ? ` · ${item.batchNumber}` : ''}</p>
                                  </div>
                                  <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5 shrink-0">{item.status}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-xs">
                                  <div><span className="text-gray-400">Invoice: </span><span className="text-[#1E293B]">{item.invoiceNumber}</span></div>
                                  <div><span className="text-gray-400">Date: </span><span className="text-[#1E293B]">{fmtDate(item.invoiceDate)}</span></div>
                                  <div><span className="text-gray-400">Customer: </span><span className="text-[#1E293B]">{item.customerName || '—'}</span></div>
                                  <div><span className="text-gray-400">Qty: </span><span className="text-[#1E293B]">{item.soldQty}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Detail panel */}
                    {selectedItem && (
                      <div className="flex-1 flex flex-col bg-white overflow-hidden">
                        <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                          <span className="text-xs font-semibold text-[#1E293B]">{selectedItem.itemName}</span>
                          <button onClick={() => setSerialBatchSelectedItem(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-4 space-y-3">
                          <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><Package className="h-3.5 w-3.5 text-[#327F74]" />Item Details</p>
                            <div className="space-y-0.5 text-xs">
                              {[['Item Code', selectedItem.itemCode||'—'], ['Batch No.', selectedItem.batchNumber||'—'], ['Expiry', fmtDate(selectedItem.expiryDate)], ['Sold Qty', selectedItem.soldQty]].map(([k,v])=>(
                                <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-[#327F74]" />Invoice Details</p>
                            <div className="space-y-0.5 text-xs">
                              {[['Invoice No.', selectedItem.invoiceNumber], ['Date', fmtDateTime(selectedItem.invoiceCreatedAt||selectedItem.invoiceDate)], ['Customer', selectedItem.customerName||'—'], ['Cashier', selectedItem.cashierName||'—'], ['Branch', selectedItem.branchName||'—'], ['Payment', selectedItem.paymentMode||'—'], ['Item Net', <CurrencyAmount amount={selectedItem.itemNetAmount||0} />], ['VAT', <CurrencyAmount amount={selectedItem.itemTaxAmount||0} />]].map(([k,v])=>(
                                <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                          <button onClick={()=>setSerialBatchSubView('convert')} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><RotateCcw className="h-3 w-3" />Convert to Return</button>
                          <button onClick={()=>setSerialBatchSubView('service')} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Wrench className="h-3 w-3" />Create Service Job</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!selectedItem && (
                    <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                      <button onClick={()=>setShowSerialBatch(false)} className="border border-gray-300 text-gray-500 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
                    </div>
                  )}
                </>
              )}

              {/* ── CONVERT TO RETURN VIEW ── */}
              {isConvert && (
                <>
                  <div className="overflow-auto flex-1 p-5 space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                      <p className="text-sm font-semibold text-[#1E293B] mb-2">Original Invoice &amp; Item</p>
                      {[
                        ['Original Invoice', selectedItem?.invoiceNumber || '—'],
                        ['Invoice Date', selectedItem ? fmtDateTime(selectedItem.invoiceCreatedAt || selectedItem.invoiceDate) : '—'],
                        ['Customer', selectedItem?.customerName || '—'],
                        ['Item', selectedItem?.itemName || '—'],
                        ['Item Code', selectedItem?.itemCode || '—'],
                        ['Batch No.', selectedItem?.batchNumber || '—'],
                        ['Sold Qty', selectedItem?.soldQty ?? '—'],
                      ].map(([k,v])=>(
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-36 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Return Details</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Quantity (max: {selectedItem?.soldQty ?? 1})</label>
                          <input type="number" min={1} max={selectedItem?.soldQty ?? 1} value={serialBatchReturnQty} onChange={e=>setSerialBatchReturnQty(Math.min(selectedItem?.soldQty??1,Math.max(1,parseInt(e.target.value)||1)))} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Reason</label>
                          <select value={serialBatchReturnReason} onChange={e=>setSerialBatchReturnReason(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option value="">Select reason…</option>
                            {['Damaged','Wrong item','Customer changed mind','Warranty claim','Defective item','Expired item','Other'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Condition</label>
                          <select value={serialBatchReturnCondition} onChange={e=>setSerialBatchReturnCondition(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option value="">Select condition…</option>
                            {['Resalable','Damaged','Defective','Warranty claim','Scrap','Needs service inspection'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Refund Method</label>
                          <select value={serialBatchRefundMethod} onChange={e=>setSerialBatchRefundMethod(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            {['Cash Back','Card Refund','Credit Voucher','Customer Credit Balance','Exchange Adjustment'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>
                      {serialBatchReturnCondition === 'Needs service inspection' && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          Item condition requires service inspection. Consider creating a Service Job instead of direct refund.
                          <button onClick={()=>setSerialBatchSubView('service')} className="ml-auto text-[#327F74] underline whitespace-nowrap">Create Service Job</button>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#FFF8DC] border border-[#F5C742]/40 rounded-lg p-3 flex items-center justify-between text-sm">
                      <span className="text-gray-600">Refund Amount (incl. VAT reversal):</span>
                      <span className="font-bold text-[#1E293B]"><CurrencyAmount amount={((selectedItem?.itemNetAmount || 0) / (selectedItem?.soldQty || 1)) * serialBatchReturnQty} /></span>
                    </div>
                  </div>
                  <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                    <button onClick={()=>setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Confirm Return</button>
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Confirm &amp; Print</button>
                  </div>
                </>
              )}

              {/* ── CREATE SERVICE JOB VIEW ── */}
              {isService && (
                <>
                  <div className="overflow-auto flex-1 p-5 space-y-3">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2 text-xs">
                      <p className="text-sm font-semibold text-[#1E293B] mb-1">Pre-filled from Batch Check</p>
                      {[
                        ['Customer', selectedItem?.customerName || '—'],
                        ['Item', selectedItem?.itemName || '—'],
                        ['Batch No.', selectedItem?.batchNumber || '—'],
                        ['Invoice Ref', selectedItem?.invoiceNumber || '—'],
                      ].map(([k,v])=>(
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Problem Details</p>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Customer Reported Problem</label>
                        <textarea placeholder="Describe the issue reported by customer..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Problem Category</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Select…</option>
                            {['Display issue','Battery issue','Charging issue','Software issue','Speaker/mic issue','Network issue','Camera issue','Physical damage','Water damage','Other'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Service Priority</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Normal</option><option>Urgent</option><option>High</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Expected Delivery Date</label>
                          <input type="date" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Assign Technician</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Select Technician</option>
                            {['Mohammed Al-Rashid','Rajan Kumar','Ali Hassan'].map(t=><option key={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded p-3 flex items-start gap-2 text-xs text-green-700">
                      <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Item is Under Warranty. This repair may be eligible for free service. Warranty coverage will be verified by the technician.
                    </div>
                  </div>
                  <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                    <button onClick={()=>setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                    <button onClick={()=>{setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1);}} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Create Service Job</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}
      {showServiceRepair && (() => {
        const mockJobs = [];
        const statusColor = (s) => ({
          'New':'bg-blue-100 text-blue-700','Inspection Pending':'bg-amber-100 text-amber-700',
          'Under Warranty':'bg-green-100 text-green-700','Warranty Rejected':'bg-red-100 text-red-600',
          'Waiting for Parts':'bg-orange-100 text-orange-700','Estimate Shared':'bg-cyan-100 text-cyan-700',
          'Pending Customer Approval':'bg-purple-100 text-purple-700','Approved':'bg-teal-100 text-teal-700',
          'In Repair':'bg-sky-100 text-sky-700','Ready for Delivery':'bg-lime-100 text-lime-700',
          'Delivered':'bg-gray-100 text-gray-600','Cancelled':'bg-red-50 text-red-500'
        }[s]||'bg-gray-100 text-gray-500');
        const warrantyColor = (w) => w==='Under Warranty'?'text-green-700':w==='Warranty Expired'?'text-red-600':'text-gray-500';
        const filteredJobs = mockJobs.filter(j=>{
          if(serviceJobFilter.status!=='All'&&j.status!==serviceJobFilter.status) return false;
          if(serviceJobFilter.customer&&!j.customer.toLowerCase().includes(serviceJobFilter.customer.toLowerCase())) return false;
          if(serviceJobFilter.jobNo&&!j.no.toLowerCase().includes(serviceJobFilter.jobNo.toLowerCase())) return false;
          if(serviceJobFilter.serial&&!j.serial.toLowerCase().includes(serviceJobFilter.serial.toLowerCase())) return false;
          if(serviceJobFilter.technician&&!j.tech.toLowerCase().includes(serviceJobFilter.technician.toLowerCase())) return false;
          if(serviceJobFilter.warranty!=='All'&&j.warranty!==serviceJobFilter.warranty) return false;
          return true;
        });
        const kpis = [
          {label:'Open Jobs',val:'—',icon:<ClipboardList className="h-4 w-4" />,color:'text-sky-700',bg:'bg-sky-50'},
          {label:'Under Warranty',val:'—',icon:<Shield className="h-4 w-4" />,color:'text-green-700',bg:'bg-green-50'},
          {label:'Pending Approval',val:'—',icon:<AlertCircle className="h-4 w-4" />,color:'text-purple-700',bg:'bg-purple-50'},
          {label:'Ready for Delivery',val:'—',icon:<PackageCheck className="h-4 w-4" />,color:'text-lime-700',bg:'bg-lime-50'},
          {label:'Delivered Today',val:'—',icon:<Truck className="h-4 w-4" />,color:'text-gray-600',bg:'bg-gray-50'},
          {label:'Chargeable',val:'—',icon:<DollarSign className="h-4 w-4" />,color:'text-amber-700',bg:'bg-amber-50'},
          {label:'Parts Value',val:'—',icon:<Package className="h-4 w-4" />,color:'text-[#327F74]',bg:'bg-teal-50'},
        ];
        const serviceSteps = ['Customer Details','Item & Warranty','Problem Details','Technician & Parts','Estimate','Service Invoice','Delivery'];
        const detailTabs = ['overview','warranty','diagnosis','parts','estimate','invoice','payments','delivery','activity'];
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-[#F7F7FA]">
            {/* Top Bar */}
            <div className="bg-[#1E293B] border-b border-[#327F74]/30 px-6 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={()=>setShowServiceRepair(false)} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm"><ChevronRight className="h-4 w-4 rotate-180" />POS</button>
                <span className="text-gray-600">/</span>
                <span className="text-white flex items-center gap-2"><Wrench className="h-4 w-4 text-[#F5C742]" />Service &amp; Repair Management</span>
              </div>
              <div className="flex items-center gap-2">
                {serviceView!=='new-job' && <button onClick={()=>{setServiceView('new-job');setServiceJobStep(1);}} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-1.5 rounded flex items-center gap-1"><Plus className="h-3.5 w-3.5" />New Service Job</button>}
                {serviceView!=='settings' && <button onClick={()=>setServiceView('settings')} className="border border-gray-600 text-gray-300 text-sm px-3 py-1.5 rounded hover:border-gray-400 flex items-center gap-1"><Settings className="h-3.5 w-3.5" />Settings</button>}
                <button onClick={()=>setShowServiceRepair(false)} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
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
                <div className="grid grid-cols-7 gap-3 mb-5">
                  {kpis.map(k=>(
                    <div key={k.label} className={`${k.bg} border border-[#327F74]/10 rounded-lg p-3 flex flex-col gap-1`}>
                      <div className={`flex items-center gap-1 ${k.color}`}>{k.icon}<span className="text-xs text-gray-500">{k.label}</span></div>
                      <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
                    </div>
                  ))}
                </div>
                {/* Filters */}
                <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-end shadow-sm">
                  {[
                    {label:'Job No.',key:'jobNo',ph:'SRV-...'},
                    {label:'Customer',key:'customer',ph:'Name / Mobile'},
                    {label:'Serial / Batch',key:'serial',ph:'Serial No.'},
                    {label:'Technician',key:'technician',ph:'Name'},
                  ].map(f=>(
                    <div key={f.label} className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-400">{f.label}</label>
                      <input value={serviceJobFilter[f.key]} onChange={e=>setServiceJobFilter(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    </div>
                  ))}
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Status</label>
                    <select value={serviceJobFilter.status} onChange={e=>setServiceJobFilter(p=>({...p,status:e.target.value}))} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['All','New','Inspection Pending','Under Warranty','Warranty Rejected','Waiting for Parts','Estimate Shared','Pending Customer Approval','Approved','In Repair','Ready for Delivery','Delivered','Cancelled'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Warranty</label>
                    <select value={serviceJobFilter.warranty} onChange={e=>setServiceJobFilter(p=>({...p,warranty:e.target.value}))} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['All','Under Warranty','Warranty Expired','No Warranty','Warranty Rejected'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <button className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
                  <button onClick={()=>setServiceJobFilter({status:'All',customer:'',jobNo:'',serial:'',technician:'',warranty:'All'})} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                </div>
                {/* Table */}
                <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F7F7FA] border-b border-[#327F74]/10">
                      <tr className="text-gray-500">{['Job No.','Job Date','Customer','Item Name','Serial/Batch','Warranty','Problem','Technician','Est. Amt','Status','Delivery Date','Action'].map((h,i)=><th key={i} className={`px-3 py-2.5 text-left font-medium ${i===11?'text-center':''}`}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map(j=>(
                        <tr key={j.no} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                          <td className="px-3 py-2 font-semibold text-[#327F74] cursor-pointer hover:underline" onClick={()=>setServiceView('detail')}>{j.no}</td>
                          <td className="px-3 py-2 text-gray-500">{j.date}</td>
                          <td className="px-3 py-2 text-[#1E293B]">{j.customer}</td>
                          <td className="px-3 py-2 text-[#1E293B] max-w-[120px] truncate">{j.item}</td>
                          <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{j.serial}</td>
                          <td className="px-3 py-2"><span className={`text-[10px] font-medium ${warrantyColor(j.warranty)}`}>{j.warranty}</span></td>
                          <td className="px-3 py-2 text-gray-500">{j.problem}</td>
                          <td className="px-3 py-2 text-gray-500">{j.tech}</td>
                          <td className="px-3 py-2 text-right">{j.estAmt>0?<CurrencyAmount amount={j.estAmt} />:'—'}</td>
                          <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(j.status)}`}>{j.status}</span></td>
                          <td className="px-3 py-2 text-gray-500">{j.delivery}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={()=>setServiceView('detail')} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                              <button className="border border-gray-200 text-gray-500 text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-50">Edit</button>
                              {j.status==='Ready for Delivery'&&<button className="bg-[#F5C742] text-[#1E293B] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#e6b838]">Deliver</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ─ NEW JOB FORM ─ */}
            {serviceView === 'new-job' && (
              <div className="flex-1 overflow-auto">
                {/* Step bar */}
                <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-0 shrink-0">
                  {serviceSteps.map((s,i)=>(
                    <React.Fragment key={s}>
                      <div className="flex items-center gap-2 cursor-pointer" onClick={()=>setServiceJobStep(i+1)}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${serviceJobStep>i+1?'bg-[#327F74] text-white':serviceJobStep===i+1?'bg-[#F5C742] text-[#1E293B]':'bg-gray-100 text-gray-400'}`}>{serviceJobStep>i+1?'✓':i+1}</div>
                        <span className={`text-xs ${serviceJobStep===i+1?'font-semibold text-[#1E293B]':'text-gray-400'}`}>{s}</span>
                      </div>
                      {i<serviceSteps.length-1&&<div className="flex-1 h-px bg-gray-200 mx-2"/>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="p-6">
                  {/* Step 1: Customer */}
                  {serviceJobStep===1&&(
                    <div className="max-w-2xl mx-auto bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">A. Customer Details</p></div>
                      <div className="grid grid-cols-2 gap-4">
                        {[{l:'Customer Name',ph:'Full name'},{l:'Mobile Number',ph:'+971 XX XXX XXXX'},{l:'Email',ph:'email@example.com'},{l:'Customer Code',ph:'CUS-XXXXX'},{l:'Address',ph:'Street, City, Emirate'}].map(f=>(
                          <div key={f.l} className={f.l==='Address'?'col-span-2':''}>
                            <label className="text-xs text-gray-500 block mb-0.5">{f.l}</label>
                            <input placeholder={f.ph} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                          </div>
                        ))}
                      </div>
                      <button className="text-xs text-[#327F74] border border-[#327F74]/30 rounded px-2 py-1 hover:bg-[#327F74]/5 flex items-center gap-1"><Search className="h-3 w-3" />Search Existing Customer</button>
                    </div>
                  )}
                  {/* Step 2: Item & Warranty */}
                  {serviceJobStep===2&&(
                    <div className="max-w-2xl mx-auto space-y-4">
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">B. Product / Item Details</p></div>
                        <div className="grid grid-cols-2 gap-3">
                          {[{l:'Invoice Number',ph:'SI-POS-...'},{l:'Serial Number',ph:'SXXXXX-XXXXX'},{l:'Batch Number',ph:'BT-XXXX'},{l:'Item Code',ph:'PRD-...'},{l:'Item Name',ph:'Product name'},{l:'Brand',ph:'Brand name'},{l:'Model',ph:'Model No.'},{l:'Category',ph:'Category'}].map(f=>(
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
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          {[['Warranty Status','Under Warranty'],['Start Date','12 Mar 2026'],['Expiry Date','12 Mar 2027'],['Warranty Period','12 Months'],['Covered','Yes'],['Repair Charge','AED 0.00']].map(([k,v])=>(
                            <div key={k} className="flex gap-1"><span className="text-green-600 w-28 shrink-0">{k}:</span><span className="text-green-800 font-medium">{renderAED(v)}</span></div>
                          ))}
                        </div>
                        <p className="text-xs text-green-600 mt-2">1-year manufacturer warranty. Excludes physical/water damage.</p>
                      </div>
                    </div>
                  )}
                  {/* Step 3: Problem */}
                  {serviceJobStep===3&&(
                    <div className="max-w-2xl mx-auto bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 mb-1"><Stethoscope className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">D. Problem / Complaint Details</p></div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Customer Reported Problem</label>
                        <textarea placeholder="Describe the issue..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-0.5">Problem Category</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Select…</option>
                            {['Display issue','Battery issue','Charging issue','Software issue','Speaker/mic issue','Network issue','Camera issue','Physical damage','Water damage','Other'].map(o=><option key={o}>{o}</option>)}
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
                          {['Charger','Cable','Box','SIM tray','Memory card','Cover','Other'].map(a=>(
                            <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" className="accent-[#327F74]" />{a}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Step 4: Technician & Parts */}
                  {serviceJobStep===4&&(
                    <div className="max-w-3xl mx-auto space-y-4">
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-1"><Wrench className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">E. Technician Diagnosis</p></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Technician</label>
                            <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                              <option>Select…</option>
                              {['Mohammed Al-Rashid','Rajan Kumar','Ali Hassan'].map(t=><option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Labour Charge (<DirhamSymbol />)</label>
                            <input type="number" placeholder="0.00" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                          </div>
                        </div>
                        {[{l:'Problems Found',ph:'Describe findings...'},{l:'Root Cause',ph:'Identified root cause...'},{l:'Recommended Fix',ph:'Recommended repair steps...'}].map(f=>(
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
                        <table className="w-full text-xs">
                          <thead><tr className="bg-[#F7F7FA] text-gray-500 border-b border-[#327F74]/10">{['Part Code','Part Name','Stock Avail.','Qty','Unit Price','Disc.','VAT','Net Amt',''].map(h=><th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
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
                  )}
                  {/* Step 5: Estimate */}
                  {serviceJobStep===5&&(
                    <div className="max-w-lg mx-auto space-y-4">
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-2">
                        <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">G. Estimate &amp; Customer Approval</p></div>
                        {[['Labour Charge','AED 0.00'],['Parts Total','AED 294.00'],['Discount','—'],['VAT (5%)','AED 14.70'],['Total Estimated','AED 308.70'],['Warranty Covered','AED 308.70'],['Customer Payable','AED 0.00']].map(([k,v])=>(
                          <div key={k} className={`flex justify-between py-1.5 border-b border-gray-50 last:border-0 ${k==='Customer Payable'?'font-bold text-[#1E293B] border-t-2 border-[#327F74]/20 pt-2':''}`}>
                            <span className="text-sm text-gray-500">{k}</span><span className="text-sm">{renderAED(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2">
                        <p className="text-sm font-semibold text-[#1E293B] mb-2">Customer Approval</p>
                        {[['Estimate Shared','Yes'],['Customer Approved','Pending'],['Approval Date','—']].map(([k,v])=>(
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
                  {serviceJobStep===6&&(
                    <div className="max-w-lg mx-auto space-y-4">
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-2">
                        <div className="flex items-center gap-2 mb-2"><FileText className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">H. Service Invoice</p></div>
                        {[['Service Job No.','—'],['Customer','—'],['Labour Charge','AED 0.00'],['Parts Amount','AED 0.00'],['VAT','AED 0.00'],['Total Invoice Amount','AED 0.00'],['Warranty Covered','AED 0.00'],['Customer Payable','AED 0.00'],['Advance Paid','AED 0.00'],['Balance Due','AED 0.00']].map(([k,v])=>(
                          <div key={k} className={`flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm ${k==='Customer Payable'?'font-bold text-[#327F74]':''}`}>
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
                  {serviceJobStep===7&&(
                    <div className="max-w-lg mx-auto space-y-4">
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-5 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-1"><Truck className="h-4 w-4 text-[#327F74]" /><p className="text-sm font-semibold text-[#1E293B]">I. Delivery / Completion</p></div>
                        <div className="grid grid-cols-2 gap-3">
                          {[{l:'Ready for Delivery Date',t:'date'},{l:'Delivered Date',t:'date'},{l:'Delivered By',t:'text',ph:'Staff name'},{l:'Received By (Customer)',t:'text',ph:'Customer name'}].map(f=>(
                            <div key={f.l}>
                              <label className="text-xs text-gray-500 block mb-0.5">{f.l}</label>
                              <input type={f.t} placeholder={(f).ph||''} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
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
                <div className="bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center shrink-0 sticky bottom-0">
                  <div className="flex gap-2">
                    {serviceJobStep>1&&<button onClick={()=>setServiceJobStep(s=>s-1)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">← Back</button>}
                    <button onClick={()=>setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                  </div>
                  <div className="flex gap-2">
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5">Save Draft</button>
                    {serviceJobStep<serviceSteps.length ? <button onClick={()=>setServiceJobStep(s=>s+1)} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-5 py-2 rounded">Next →</button>
                    : <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-5 py-2 rounded flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Complete Job</button>}
                  </div>
                </div>
              </div>
            )}

            {/* ─ DETAIL VIEW ─ */}
            {serviceView === 'detail' && (
              <div className="flex-1 overflow-auto p-6">
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={()=>setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 rotate-180" />Back to List</button>
                  <span className="text-[#1E293B] font-semibold">Service Job</span>
                  <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5">—</span>
                  <div className="ml-auto flex gap-2">
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print Job Card</button>
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-3 py-1.5 rounded flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Create Invoice</button>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-0 border-b border-[#327F74]/20 mb-4">
                  {detailTabs.map(t=>(
                    <button key={t} onClick={()=>setServiceDetailTab(t)}
                      className={`px-4 py-2 text-xs capitalize border-b-2 transition-colors ${serviceDetailTab===t?'border-[#F5C742] text-[#1E293B] font-semibold':'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      {t==='activity'?'Activity Log':t}
                    </button>
                  ))}
                </div>
                {serviceDetailTab==='overview'&&(
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <p className="text-sm font-semibold text-[#1E293B] mb-3">Job Timeline</p>
                      <div className="space-y-3">
                        {[
                          {label:'Job Created',time:'Pending',done:false},
                          {label:'Warranty Checked',time:'Pending',done:false},
                          {label:'Inspection Completed',time:'Pending',done:false},
                          {label:'Estimate Shared',time:'Pending',done:false},
                          {label:'Customer Approved',time:'Pending',done:false},
                          {label:'Repair Started',time:'Pending',done:false},
                          {label:'Parts Consumed',time:'Pending',done:false},
                          {label:'Invoice Generated',time:'Pending',done:false},
                          {label:'Ready for Delivery',time:'Pending',done:false},
                          {label:'Delivered',time:'Pending',done:false},
                        ].map((ev,i)=>(
                          <div key={i} className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ev.done?'bg-[#327F74]':'bg-gray-100'}`}>
                              {ev.done?<CheckCircle className="h-3 w-3 text-white"/>:<div className="w-1.5 h-1.5 rounded-full bg-gray-300"/>}
                            </div>
                            <div><p className={`text-xs ${ev.done?'text-[#1E293B] font-medium':'text-gray-400'}`}>{ev.label}</p><p className="text-[10px] text-gray-400">{ev.time}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm text-xs space-y-1">
                        <p className="text-sm font-semibold text-[#1E293B] mb-2">Customer &amp; Item</p>
                        {[['Customer','—'],['Mobile','—'],['Item','—'],['Serial','—'],['Warranty','—'],['Technician','—'],['Priority','—'],['Expected Delivery','—']].map(([k,v])=>(
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {serviceDetailTab!=='overview'&&(
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
                  <button onClick={()=>setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 rotate-180" />Back</button>
                  <h1 className="text-xl text-[#1E293B]">Service &amp; Repair Settings</h1>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {title:'1. Warranty Rules',icon:<Shield className="h-4 w-4 text-[#327F74]" />,fields:['Default warranty period','Warranty by product category','Warranty by brand','Allow warranty without invoice: Yes/No','Warranty validation based on invoice date']},
                    {title:'2. Service Charges',icon:<DollarSign className="h-4 w-4 text-[#327F74]" />,fields:['Default inspection charge (AED)','Default labour charge (AED)','Urgent service charge (AED)','Minimum repair charge (AED)','VAT applicable: Yes/No']},
                    {title:'3. Approval Rules',icon:<CheckCircle className="h-4 w-4 text-[#327F74]" />,fields:['Manager approval for warranty rejection','Customer approval before repair','Approval required for high-value parts','Approval required for free repair without invoice']},
                    {title:'4. Inventory Consumption',icon:<Package className="h-4 w-4 text-[#327F74]" />,fields:['Consume parts on estimate approval','Consume parts on invoice confirmation','Consume parts on delivery','Allow negative stock: Yes/No','Default warehouse for service parts']},
                    {title:'5. Print Templates',icon:<Printer className="h-4 w-4 text-[#327F74]" />,fields:['Job card template','Estimate receipt template','Service invoice template','Delivery receipt template','Warranty receipt template']},
                    {title:'6. Notification Settings',icon:<Smartphone className="h-4 w-4 text-[#327F74]" />,fields:['SMS/WhatsApp when job created','Estimate shared notification','Customer approval received','Ready for delivery alert','Delivered confirmation']},
                  ].map(section=>(
                    <div key={section.title} className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">{section.icon}<p className="text-sm font-semibold text-[#1E293B]">{section.title}</p></div>
                      <div className="space-y-2">
                        {section.fields.map(f=>(
                          <div key={f} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                            <span className="text-xs text-gray-600">{f}</span>
                            {f.includes('Yes/No')||f.includes('Yes / No') ? (
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
                <div className="mt-4 flex justify-end gap-2">
                  <button className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                  <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-5 py-2 rounded flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Save Settings</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* POS Configure & Customize Panel */}
      {showPOSConfig && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowPOSConfig(false)} />
          <div className="relative bg-white w-80 h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-[#1E293B] to-[#334155] flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5 text-[#F5C742]" />
                  POS Configure
                </h2>
                <p className="text-gray-400 text-xs mt-0.5">Customize your POS layout & appearance</p>
              </div>
              <button onClick={() => setShowPOSConfig(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Service & Repair Quick Access */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Modules</h3>
                <button onClick={() => { setShowServiceRepair(true); setServiceView('list'); setShowPOSConfig(false); }} className="w-full flex items-center gap-3 p-3 bg-teal-50 border-2 border-teal-300 rounded-xl hover:bg-teal-100 transition-colors text-left">
                  <div className="w-10 h-10 rounded-xl bg-[#327F74] flex items-center justify-center shrink-0">
                    <Wrench className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#1E293B]">Service &amp; Repair Management</p>
                    <p className="text-[10px] text-teal-700 mt-0.5">Warranty checks, repair jobs, invoices &amp; delivery</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-teal-500" />
                </button>
                <button onClick={() => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setShowPOSConfig(false); setShowSerialBatch(true); }} className="w-full flex items-center gap-3 p-3 bg-[#F5C742]/10 border-2 border-[#F5C742]/50 rounded-xl hover:bg-[#F5C742]/20 transition-colors text-left mt-2">
                  <div className="w-10 h-10 rounded-xl bg-[#F5C742] flex items-center justify-center shrink-0">
                    <Hash className="h-5 w-5 text-[#1E293B]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#1E293B]">Serial / Batch Check</p>
                    <p className="text-[10px] text-amber-700 mt-0.5">Search sold items, view invoice &amp; warranty details</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-500" />
                </button>
              </div>

              {/* Layout Toggles */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Panel Visibility</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#F5C742]/10 flex items-center justify-center">
                        <LayoutTemplate className="h-4 w-4 text-[#F5C742]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1E293B]">Categories Bar</p>
                        <p className="text-[10px] text-gray-500">Left category navigation</p>
                      </div>
                    </div>
                    <Switch
                      checked={!hideCategoriesPanel}
                      onCheckedChange={(v) => setHideCategoriesPanel(!v)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#F5C742]/10 flex items-center justify-center">
                        <LayoutGrid className="h-4 w-4 text-[#F5C742]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1E293B]">Items Panel</p>
                        <p className="text-[10px] text-gray-500">Product grid with search</p>
                      </div>
                    </div>
                    <Switch
                      checked={!hideItemsPanel}
                      onCheckedChange={(v) => setHideItemsPanel(!v)}
                    />
                  </div>
                </div>
              </div>

              {/* Screen Template */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Screen Template</h3>
                <div className="space-y-2">
                  {[
                    { id: 'classic', label: 'Classic', desc: 'Categories + Products + Cart', icon: Columns },
                    { id: 'compact', label: 'Compact', desc: 'Products + Cart (no categories)', icon: LayoutGrid },
                    { id: 'focus', label: 'Cart Focus', desc: 'Cart only — scan or search', icon: ShoppingCart },
                  ].map(({ id, label, desc, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setPosTemplate(id);
                        if (id === 'classic') { setHideCategoriesPanel(false); setHideItemsPanel(false); }
                        else if (id === 'compact') { setHideCategoriesPanel(true); setHideItemsPanel(false); }
                        else if (id === 'focus') { setHideCategoriesPanel(true); setHideItemsPanel(true); }
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        posTemplate === id
                          ? 'border-[#F5C742] bg-[#FEF9E7]'
                          : 'border-gray-100 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${posTemplate === id ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                        <Icon className={`h-4 w-4 ${posTemplate === id ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${posTemplate === id ? 'text-[#1E293B]' : 'text-gray-700'}`}>{label}</p>
                        <p className="text-[10px] text-gray-500">{desc}</p>
                      </div>
                      {posTemplate === id && <CheckCircle className="h-4 w-4 text-[#F5C742] ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Button Visibility — only shown when in Cart Focus template */}
              {posTemplate === 'focus' && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Right Panel Buttons</h3>
                  <p className="text-[10px] text-gray-400 mb-3">Toggle which action buttons appear in the Cart Focus right panel.</p>
                  <div className="space-y-1.5">
                    {[
                      { id: 'add-qty', label: 'Add Qty' },
                      { id: 'remove', label: 'Remove Item' },
                      { id: 'discount', label: 'Discount' },
                      { id: 'layaways', label: 'Layaways' },
                      { id: 'save-layaway', label: 'Save Layaway' },
                      { id: 'save-order', label: 'Save ' },
                      { id: 'add-shipping', label: 'Add Shipping' },
                      { id: 'add-customer', label: 'Add Customer' },
                      { id: 'coupons', label: 'Coupons' },
                      { id: 'promotions', label: 'Promotions' },
                      { id: 'return', label: 'Return' },
                      { id: 'price-chk', label: 'Price Check' },
                      { id: 'cash-drop', label: 'Cash Drawer' },
                      { id: 'last-receipt', label: 'Last Receipt' },
                      { id: 'credit-balance', label: 'Credit Balance' },
                      { id: 'z-report', label: 'Z-Report' },
                      { id: 'serial-batch', label: 'Serial/Batch Check' },
                      { id: 'reprint', label: 'Reprint' },
                      { id: 'lock-pos', label: 'Lock POS' },
                      { id: 'close-session', label: 'Close Session' },
                    ].map(btn => (
                      <div key={btn.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-[#1E293B]">{btn.label}</span>
                        <Switch
                          checked={!hiddenPanelButtons.has(btn.id)}
                          onCheckedChange={() => togglePanelButton(btn.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100">
              <Button onClick={() => setShowPOSConfig(false)} className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold">
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply & Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ NEW DELIVERY ORDER modal ══════════════════════════════════════ */}
      {showDeliveryModal && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="bg-[#F5C742] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-[#1E293B]" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1E293B]/70">NEW DELIVERY ORDER</p>
                  <p className="text-sm font-black text-[#1E293B]">{currentInvoice.items.length} items • {formatCurrency(currentInvoice.total)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowDeliveryModal(false)} className="text-[#1E293B]/60 hover:text-[#1E293B]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Customer tab switcher */}
            <div className="flex border-b border-gray-200">
              <button type="button" onClick={() => setDeliveryModalTab('existing')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${deliveryModalTab === 'existing' ? 'border-b-2 border-[#327F74] text-[#327F74]' : 'text-gray-400 hover:text-gray-600'}`}>
                Select Existing Customer
              </button>
              <button type="button" onClick={() => setDeliveryModalTab('new')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${deliveryModalTab === 'new' ? 'border-b-2 border-[#327F74] text-[#327F74]' : 'text-gray-400 hover:text-gray-600'}`}>
                + Create New Customer
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
              {deliveryModalTab === 'existing' ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Select Customer</label>
                  <select value={deliveryCustomerId} onChange={e => setDeliveryCustomerId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]">
                    <option value="">— Choose customer —</option>
                    {realCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.mobile ? ` · ${c.mobile}` : ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" value={deliveryNewName} onChange={e => setDeliveryNewName(e.target.value)}
                      placeholder="Customer full name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Mobile <span className="text-red-500">*</span></label>
                      <input type="tel" value={deliveryNewMobile} onChange={e => setDeliveryNewMobile(e.target.value)}
                        placeholder="+971 50 000 0000"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Email</label>
                      <input type="email" value={deliveryNewEmail} onChange={e => setDeliveryNewEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Address <span className="text-red-500">*</span></label>
                <textarea rows={3} value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Building, street, area, city..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Charge (AED)</label>
                  <input type="number" min="0" step="0.01" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)}
                    placeholder="AED 0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Optional — leave blank if free delivery</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Assign Delivery Person</label>
                  <select value={deliveryDriver} onChange={e => setDeliveryDriver(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]">
                    <option value="">— Select person —</option>
                    {['Ahmed K.', 'Ravi S.', 'Omar F.'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Order Notes / Delivery Remarks</label>
                <textarea rows={2} value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="Special instructions, landmarks, contact note..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] resize-none" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setShowDeliveryModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={!deliveryAddress || currentInvoice.items.length === 0 || (deliveryModalTab === 'new' && (!deliveryNewName || !deliveryNewMobile))}
                onClick={() => {
                  setShowDeliveryModal(false);
                  const balanceDue = activeLayawayId && activeLayawayDeposit > 0
                    ? Math.max(0, currentInvoice.total - activeLayawayDeposit)
                    : currentInvoice.total;
                  setCheckoutPhase('payment');
                  setShowPaymentDialog(true);
                  setTenderedAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
                  setCheckoutKeypadVisible(false);
                  setCheckoutKeypadMode('numeric');
                  setCheckoutKeypadTarget('tender');
                }}
                className="flex-1 py-3 rounded-xl bg-[#327F74] hover:bg-[#2a6b61] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <Truck className="h-4 w-4" />
                Out for Delivery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELIVERY SETTLEMENT modal ═════════════════════════════════════ */}
      {showDeliverySettleModal && (() => {
        const mockOrders = [
          { id: 1, customer: 'Sarah Johnson',   invoice: 'SI-POS-000421', mobile: '+971 50 123 4567', person: 'Ahmed', invoiceAmt: 285.00, deliveryCharge: 15.00, paidAmt: 0.00 },
          { id: 2, customer: 'Alex Martinez',   invoice: 'SI-POS-000418', mobile: '+971 55 987 6543', person: 'Ravi',  invoiceAmt: 420.00, deliveryCharge: 20.00, paidAmt: 0.00 },
          { id: 3, customer: 'Emma Wilson',     invoice: 'SI-POS-000410', mobile: '+971 52 456 7890', person: 'Omar',  invoiceAmt: 180.00, deliveryCharge:  0.00, paidAmt: 180.00 },
          { id: 4, customer: 'Mohammed Rashid', invoice: 'SI-POS-000408', mobile: '+971 54 321 0987', person: 'Ahmed', invoiceAmt: 640.00, deliveryCharge: 25.00, paidAmt: 0.00 },
        ];
        const persons = ['All Persons', ...new Set(mockOrders.map(o => o.person))];
        const filtered = mockOrders.filter(o => {
          const q = deliverySettleSearch.toLowerCase();
          const matchSearch = !q || o.customer.toLowerCase().includes(q) || o.invoice.toLowerCase().includes(q) || o.mobile.includes(q);
          const matchPerson = deliverySettlePersonFilter === 'All Persons' || o.person === deliverySettlePersonFilter;
          return matchSearch && matchPerson;
        });
        const sel = deliverySettleSelected;
        const selTotal = sel ? sel.invoiceAmt + sel.deliveryCharge : 0;
        const selBalance = sel ? Math.max(0, selTotal - sel.paidAmt) : 0;
        return (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-[#F5C742] px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
                    <PackageCheck className="h-4 w-4 text-[#1E293B]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1E293B]/70">DELIVERY SETTLEMENT</p>
                    <p className="text-sm font-black text-[#1E293B]">{mockOrders.length} orders out for delivery</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowDeliverySettleModal(false)} className="text-[#1E293B]/60 hover:text-[#1E293B]">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Search + filter */}
              <div className="px-4 py-3 border-b border-gray-100 flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" value={deliverySettleSearch} onChange={e => setDeliverySettleSearch(e.target.value)}
                    placeholder="Search by invoice, customer, or mobile..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#327F74]" />
                </div>
                <select value={deliverySettlePersonFilter} onChange={e => setDeliverySettlePersonFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#327F74]">
                  {persons.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              {/* Order list */}
              <div className="overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-[1fr_80px_100px_80px_100px] px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <div>Customer / Invoice</div>
                  <div>Person</div>
                  <div className="text-right">Invoice</div>
                  <div className="text-right">Delivery</div>
                  <div className="text-right">Balance</div>
                </div>
                {filtered.map(o => {
                  const balance = Math.max(0, o.invoiceAmt + o.deliveryCharge - o.paidAmt);
                  const isPaid = balance === 0;
                  const isSelected = sel?.id === o.id;
                  return (
                    <div key={o.id}>
                      <button type="button" onClick={() => setDeliverySettleSelected(isSelected ? null : o)}
                        className={`w-full grid grid-cols-[1fr_80px_100px_80px_100px] px-4 py-3 border-b border-gray-100 text-left transition-colors ${isSelected ? 'bg-[#FFF8E7] border-[#FDE6A9]' : 'hover:bg-gray-50'}`}>
                        <div>
                          <p className="text-sm font-semibold text-[#1E293B]">{o.customer}</p>
                          <p className="text-[10px] text-gray-400">{o.invoice}</p>
                          <p className="text-[10px] text-gray-400">{o.mobile}</p>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">{o.person}</div>
                        <div className="flex items-center justify-end text-sm text-gray-700">AED {o.invoiceAmt.toFixed(2)}</div>
                        <div className="flex items-center justify-end text-sm text-gray-500">{o.deliveryCharge > 0 ? `AED ${o.deliveryCharge.toFixed(2)}` : '–'}</div>
                        <div className={`flex items-center justify-end text-sm font-bold ${isPaid ? 'text-[#327F74]' : 'text-red-600'}`}>
                          AED {balance.toFixed(2)}
                        </div>
                      </button>

                      {/* Expanded payment panel */}
                      {isSelected && (
                        <div className="bg-[#FFFBF0] border-b-2 border-[#FDE6A9] px-4 py-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-sm font-bold text-[#1E293B]">{o.customer} — {o.invoice}</p>
                              <p className="text-xs text-gray-500">{o.person} · {o.mobile}</p>
                            </div>
                            <p className="text-base font-black text-[#1E293B]">Total Due <span className="text-[#327F74]">AED {selBalance.toFixed(2)}</span></p>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mb-4">
                            {[
                              { label: 'Invoice Amt',     val: o.invoiceAmt,     highlight: false, red: false },
                              { label: 'Delivery Charge', val: o.deliveryCharge, highlight: false, red: false },
                              { label: 'Paid Amt',        val: o.paidAmt,        highlight: true,  red: false },
                              { label: 'Balance Due',     val: selBalance,       highlight: false, red: selBalance > 0 },
                            ].map(r => (
                              <div key={r.label} className={`rounded-xl p-2.5 border text-center ${r.highlight ? 'bg-[#327F74]/10 border-[#327F74]/30' : r.red ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                                <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500 mb-1">{r.label}</p>
                                <p className={`text-sm font-bold ${r.red ? 'text-red-600' : 'text-[#1E293B]'}`}>AED {r.val.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mb-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">Payment Mode</p>
                            <div className="flex gap-2">
                              {['Cash', 'Card', 'Credit', 'Mix'].map(m => (
                                <button key={m} type="button" onClick={() => setDeliverySettlePayMode(m)}
                                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${deliverySettlePayMode === m ? 'border-[#F5C742] bg-[#F5C742]/20 text-[#1E293B]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                                  {m}
                                </button>
                              ))}
                            </div>
                          </div>
                          <button type="button"
                            disabled={selBalance === 0}
                            onClick={() => setShowDeliverySettleModal(false)}
                            className="w-full py-3 rounded-xl bg-[#327F74] hover:bg-[#2a6b61] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                            <CheckCircle className="h-4 w-4" />
                            Finalize Order — AED {selBalance.toFixed(2)}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
