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
import { getProducts, getProductsList, getFavouriteProducts, getRecentlySoldProducts, getTopSoldProducts, addProductFavourite, removeProductFavourite, createProduct, validateDuplicateProduct } from '../../api/productsApi';
import { getDepartments } from '../../api/departmentsApi';
import { getUnits } from '../../api/unitsApi';
import { getAllCustomers, createCustomer, validateDuplicateCustomer, searchCustomersAllFields } from '../../api/customerledgerApi';
import { sendSalesInvoiceEmail, getSalesInvoiceById, getAllSalesInvoices, getSalesInvoicesPage, getNextInvoiceNumber } from '../../api/salesInvoiceApi';
import AsyncSearchableDropdown from '../../components/AsyncSearchableDropdown';
import { saveSalesOrder, getNextSalesOrderNumber, getSalesOrdersPage, getSalesOrderById, updateSalesOrderStatus, deleteSalesOrder } from '../../api/salesorderApi';
import { saveSalesPayment } from '../../api/salesPaymentApi';
import { receiptVoucherApi } from '../../api/receiptVoucherApi';
import { fetchStatementOfAccount } from '../../api/financialsApi';
import { getBankAccounts } from '../../api/ledgerApi';
import {
  registerPosTerminal, getPosSettings, savePosSettings, verifyPosSupervisorPin, verifySupervisorAuth, openPosSession, getActivePosSession,
  getPosSessionById,
  closePosSession, addPosCashMovement, getPosXReport, generatePosXReport, getPosZReport, closePosDay, posCheckout,
  checkPosXReportPrintable, checkPosZReportPrintable,
  getAllPosTerminals, renamePosTerminal, setTerminalStatus, setMainPosTerminal, resolvePosEntry,
  createLayaway, getLayaways, getLayaway, cancelLayaway, convertLayaway,
  posCreditBalance, posBatchCheck, getPosInvoices, lookupPosInvoice,
  getPosCustomerHistory,
  getDeliveryOrders, settleDeliveryOrder,
} from '../../api/posApi';
import { saveSalesReturn, updateSalesReturnStatus, getReturnableBatches, getSalesReturnsPage } from '../../api/salesReturnApi';
import { getSalesAnalytics } from '../../api/salesReportsApi';
import { generateDocumentPrintHtml } from '../../utils/documentTemplateRenderer';
import { printHtml, generateReportA4Html, generateReportThermalHtml, generateReportThermalText, downloadPdfViaServer, buildQrContent, generatePrintHtmlAsync } from '../../utils/printGenerator';
import QRCode from 'qrcode';
import { exportToPDF, exportToExcel } from '../../utils/exportUtils';
import {
  Calculator,
  ShoppingCart,
  Receipt,
  CreditCard,
  Banknote,
  Landmark,
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
  Upload,
  Heart,
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

// ─── POS sub-modules ──────────────────────────────────────────────────────────
import { DirhamSymbol, DenominationLabel, CurrencyAmount, DenominationAmount, renderAED, setActiveCurrency } from './POS/POSCurrency';
import { WALK_IN_CUSTOMER, POS_PRODUCT_PAGE_SIZE, CATEGORY_ICONS, STATUS_LABEL_TO_ENUM, STATUS_ENUM_TO_LABEL } from './POS/posConstants';
import { toNumber, mapPosProductListItem, mapPosProductAggregateItem, mapPosCustomer, cachePosProduct } from './POS/posUtils';
import {
  buildZatcaTlvBase64, buildThermalReceiptHtml, buildLayawayReceiptHtml, buildLayawayReceiptText,
  buildPosPrintData, buildPosA4Template, buildThermalReceiptText,
  buildDocumentPreviewHtml, buildThermalPrintHtml, buildServiceJobA4Html,
} from './POS/posPrintUtils';
import {
  ThermalMock, useA4BlobUrl, A4PreviewFrame, A4LivePreview,
  ServiceJobA4Preview, PaperSizePicker, ImageUploadBox, A4ScaledPreview, ThermalScaledPreview,
} from './POS/POSPrintPreview';
import CustomerPicker from './POS/CustomerPicker';
import { formatUserDisplayName } from '../../utils/displayName';
import { useCompany } from '../../context/CompanyContext';
import CustomerView from './POS/CustomerView';
import POSConsole from './POS/POSConsole';
import POSTouchScreen from './POS/POSTouchScreen';
import { getPosPrinters } from '../../api/posPrinterApi';
import { getDeliveryPersons } from '../../api/employeeApi';
import { useHeartbeat } from '../../hooks/useHeartbeat';
import { useIdleTimeout } from '../../hooks/useIdleTimeout';
import TerminalStatusBadge from '../../components/pos/TerminalStatusBadge';
import SupervisorTakeoverDialog from '../../components/pos/SupervisorTakeoverDialog';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from '../../utils/localPrintAgent';
import { buildEscPosReceiptBase64, buildEscPosFromPlainTextBase64, buildEscPosDocumentBase64 } from '../../utils/escPosReceipt';
import { getReceiptTemplate, DEFAULT_RECEIPT_TEMPLATE_ID } from './POS/receiptTemplates';
import { mapToTemplate2Data, mapInvoiceToTxn } from './POS/receiptTemplates/billBullTaxInvoiceData';
import { buildTemplate2Html } from './POS/receiptTemplates/buildTemplate2Html';

const SPECIAL_CATEGORIES = new Set(['favourites', 'recently-sold', 'top-sold']);
const buildPosScannerStorageKey = (branchId, terminalId) => {
  if (!branchId && !terminalId) return null;
  return `billbull:pos:scanner:${branchId ?? 'branch'}:${terminalId || 'shared'}`;
};

function DeliveryPersonSelect({ options = [], value, onChange, loading = false, error = '' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef(null);

  const selected = useMemo(
    () => options.find(person => String(person.employeeCode) === String(value)) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(person => [
      person.name,
      person.employeeCode,
      person.phone,
    ].some(part => String(part || '').toLowerCase().includes(q)));
  }, [options, search]);

  useEffect(() => {
    const handleClickAway = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [search, options.length]);

  const commitSelection = (person) => {
    if (!person) return;
    onChange(person.employeeCode);
    setSearch('');
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(index => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commitSelection(filtered[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center border rounded-xl bg-white overflow-hidden focus-within:border-[#327F74] ${error ? 'border-red-300' : 'border-gray-200'}`}>
        <Search className="h-4 w-4 text-gray-400 ml-3 shrink-0" />
        <input
          type="text"
          value={open ? search : (selected ? `${selected.name} (${selected.employeeCode})` : '')}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading delivery persons...' : 'Search delivery person'}
          className="flex-1 min-w-0 px-2 py-2.5 text-sm focus:outline-none"
          role="combobox"
          aria-expanded={open}
        />
        {selected && (
          <button
            type="button"
            onClick={() => { onChange(''); setSearch(''); setOpen(false); }}
            className="p-2 text-gray-400 hover:text-gray-700"
            aria-label="Clear delivery person"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="p-2 text-gray-400 hover:text-gray-700"
          aria-label="Open delivery person list"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-3 text-xs text-gray-500">Loading delivery persons...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500">No active delivery persons found</div>
          ) : filtered.map((person, index) => (
            <button
              type="button"
              key={person.employeeCode || person.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitSelection(person)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-emerald-50 ${index === highlighted ? 'bg-emerald-50' : 'bg-white'}`}
            >
              <div className="text-sm font-semibold text-gray-900 truncate">{person.name || 'Unnamed employee'}</div>
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>{person.employeeCode || '-'}</span>
                <span>{person.phone || '-'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const parseUTCDate = (ts) => {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(ts);
  const tIdx = s.indexOf('T');
  if (tIdx !== -1 && !s.endsWith('Z')) {
    const timePart = s.slice(tIdx);
    if (!timePart.includes('+') && !timePart.includes('-')) {
      s += 'Z';
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export default function POSSales() {
  const { company } = useCompany();
  // Active currency CODE from the company profile (falls back to AED). Report
  // view-models emit this code as the money token; the print engine
  // (renderTextWithCurrencySymbols) rewrites it to the configured symbol/image.
  const activeCurrency = company?.currency || 'AED';
  // Sync the on-screen currency renderers (POSCurrency) with the company profile.
  useEffect(() => { setActiveCurrency(activeCurrency); }, [activeCurrency]);
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
  // True when this terminal has a live POS session. Session-bound features
  // (X/Z report, cash drop/out, customer management) are locked until this is
  // true and re-enable automatically — no refresh — when a session is opened.
  const isSessionActive = currentSession?.status === 'active' || currentSession?.status === 'OPEN';
  const [sessionNowMs, setSessionNowMs] = useState(() => Date.now());
  const [posSettings, setPosSettings] = useState(null);
  // Behavior-settings editor (Console → Behavior tab)
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavedFlash, setSettingsSavedFlash] = useState(false);
  const [currentTerminal, setCurrentTerminal] = useState(null);
  const [terminalLockedBy, setTerminalLockedBy] = useState(null);
  const [isIdleLocked, setIsIdleLocked] = useState(false);
  const [showTakeoverDialog, setShowTakeoverDialog] = useState(false);
  // Logged-in POS user shown as "Cashier" on the receipt (§2A). Prefers the
  // employee's real first/last name (stored at login as "fullName", resolved
  // server-side from the linked HR employee record) over the login username —
  // a shared/system account like "admin" should never appear on a receipt.
  const cashierDisplayName = useMemo(() => {
    const storedFullName = sessionStorage.getItem('fullName');
    if (storedFullName) return formatUserDisplayName(storedFullName);
    const raw = sessionStorage.getItem('user') || '';
    return formatUserDisplayName(raw.includes('@') ? raw.split('@')[0] : raw);
  }, []);
  const [posInitLoading, setPosInitLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  // Supervisor PIN dialog for void
  const [showSupervisorPin, setShowSupervisorPin] = useState(false);
  const [supervisorPinValue, setSupervisorPinValue] = useState('');
  const [supervisorPinError, setSupervisorPinError] = useState('');
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverEmail, setHandoverEmail] = useState('');
  const [handoverPassword, setHandoverPassword] = useState('');
  const [handoverError, setHandoverError] = useState('');
  const [pendingVoidItemId, setPendingVoidItemId] = useState(null);
  // Action pending supervisor approval during layaway conversion (Clear / Remove / Void)
  const [pendingLayawayAbortAction, setPendingLayawayAbortAction] = useState(null);
  // true = action is a full cart clear (should also reset layaway conversion state)
  const [pendingLayawayAbortIsFullClear, setPendingLayawayAbortIsFullClear] = useState(false);
  // X-Report / Z-Report live data
  const [xReportData, setXReportData] = useState(null);
  const [xReportLoading, setXReportLoading] = useState(false);
  const [zReportData, setZReportData] = useState(null);
  // Auto-print bookkeeping for X/Z reports: printedReportKeysRef dedupes so a
  // report is auto-printed at most once per session/day close; the pending refs
  // arm the auto-print to fire from the effect that runs once the fresh report
  // data lands in state (so we print exactly what the preview shows).
  const printedReportKeysRef = useRef(new Set());
  const pendingXAutoPrintRef = useRef(null); // session id awaiting X-Report auto-print
  const pendingZAutoPrintRef = useRef(null); // date string awaiting Z-Report auto-print
  // When the Z-Report is blocked because terminals still owe an X-Report, this
  // holds the pending-terminal list to display; zReportData is cleared so the
  // report body and its print/export actions stay hidden until eligible.
  const [zReportPending, setZReportPending] = useState(null);
  const [zReportLoading, setZReportLoading] = useState(false);
  const [zReportDate, setZReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [showStartSessionDialog, setShowStartSessionDialog] = useState(false);
  const [prevDaySessionOpenMsg, setPrevDaySessionOpenMsg] = useState(null);
  const [prevDaySessionOpenId, setPrevDaySessionOpenId] = useState(null);
  const [showCloseSessionDialog, setShowCloseSessionDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCashDropDialog, setShowCashDropDialog] = useState(false);
  const [closeDayVariance, setCloseDayVariance] = useState(null);
  // Live Session quick-view — dashboard tile that pops the current session's
  // sales/cash figures without navigating away (X-Report is the full page version).
  const [showLiveSessionDialog, setShowLiveSessionDialog] = useState(false);

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

  const [xReportVarianceRemarks, setXReportVarianceRemarks] = useState('');
  const [xReportCardBatchNo, setXReportCardBatchNo] = useState('');
  const [xReportCardVerified, setXReportCardVerified] = useState(false);
  const [xReportCashierName, setXReportCashierName] = useState('');
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
  const [deliveryCustomerSearch, setDeliveryCustomerSearch] = useState('');
  const [deliveryNewName, setDeliveryNewName] = useState('');
  const [deliveryNewMobile, setDeliveryNewMobile] = useState('');
  const [deliveryNewEmail, setDeliveryNewEmail] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [deliveryPersonsLoading, setDeliveryPersonsLoading] = useState(false);
  const [deliveryValidationErrors, setDeliveryValidationErrors] = useState({});

  // Quick Customer Creation Modal State
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);
  const [quickCustomerForm, setQuickCustomerForm] = useState({
    name: '', mobile: '', email: '', trn: '', customerType: 'Retail', companyName: '', deliveryAddress: '', deliveryNote: '',
    isCreditCustomer: false, creditLimit: '', openingBalance: '', status: 'Active',
    city: '', country: '', vatDetails: '', notes: '', alternateContact: '', payTerms: 'Cash', expandMoreDetails: false
  });
  const [quickCustomerDuplicateWarning, setQuickCustomerDuplicateWarning] = useState(null);
  const [quickCustomerLoading, setQuickCustomerLoading] = useState(false);
  const [quickCustomerError, setQuickCustomerError] = useState(null);

  // Quick Product Creation Modal State
  const [showQuickProductModal, setShowQuickProductModal] = useState(false);
  const [quickProductForm, setQuickProductForm] = useState({
    name: '', code: '', barcode: '', salesPrice: '', costPrice: '', purchasePrice: '', category: '', brand: '',
    uom: 'Pcs', tax: '5%', openingStock: '', lowStockAlert: '', status: 'Active',
    sku: '', hsnSac: '', description: '', supplier: '', isBatch: false, isSerial: false, trackInventory: true, allowNegativeStock: false, isDiscountAllowed: true, expandMoreDetails: false
  });
  const [quickProductDuplicateWarning, setQuickProductDuplicateWarning] = useState(null);
  const [quickProductLoading, setQuickProductLoading] = useState(false);
  const [quickProductError, setQuickProductError] = useState(null);

  // Delivery settle modal
  const [showDeliverySettleModal, setShowDeliverySettleModal] = useState(false);
  const [deliverySettleSearch, setDeliverySettleSearch] = useState('');
  const [deliverySettlePersonFilter, setDeliverySettlePersonFilter] = useState('All Persons');
  const [deliverySettleSelected, setDeliverySettleSelected] = useState(null);
  const [deliverySettlePayMode, setDeliverySettlePayMode] = useState('Cash');
  const [deliverySettleMixCash, setDeliverySettleMixCash] = useState('');
  const [deliverySettleMixCard, setDeliverySettleMixCard] = useState('');
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [deliveryOrdersLoading, setDeliveryOrdersLoading] = useState(false);
  const [deliveryOutLoading, setDeliveryOutLoading] = useState(false);
  const [deliverySettleLoading, setDeliverySettleLoading] = useState(false);
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
  // Online payment mode — bank account linking for reconciliation/reporting
  const [checkoutOnlineBankAccounts, setCheckoutOnlineBankAccounts] = useState([]);
  const [checkoutOnlineBankAccountsLoading, setCheckoutOnlineBankAccountsLoading] = useState(false);
  const [checkoutOnlineBankAccountId, setCheckoutOnlineBankAccountId] = useState('');
  const [checkoutOnlineReference, setCheckoutOnlineReference] = useState('');
  const [checkoutRemarks, setCheckoutRemarks] = useState('');
  const [checkoutCreditCustomerSearch, setCheckoutCreditCustomerSearch] = useState('');
  const [checkoutCreditCustomer, setCheckoutCreditCustomer] = useState(null);
  const [checkoutCreditDueDate, setCheckoutCreditDueDate] = useState('2026-06-28');
  const [checkoutCreditTerms, setCheckoutCreditTerms] = useState('30');
  // Partial receipt against a Credit sale — cashier can collect part of the bill now
  // (Cash/Card/Online/Bank) while the remainder posts to the customer's receivable.
  const [checkoutCreditReceivedMode, setCheckoutCreditReceivedMode] = useState('');
  const [checkoutCreditReceivedAmount, setCheckoutCreditReceivedAmount] = useState('');
  const [checkoutCreditReceivedCardType, setCheckoutCreditReceivedCardType] = useState('');
  const [checkoutCreditReceivedRef, setCheckoutCreditReceivedRef] = useState('');
  const [checkoutCreditReceivedBankAccountId, setCheckoutCreditReceivedBankAccountId] = useState('');
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
  // While a settlement is in flight we FREEZE the A4 preview html so clearInvoice()
  // (which empties the cart) cannot null the live iframe's blob src in the same
  // commit that the phase switch unmounts that iframe — that race is what threw
  // "Failed to execute 'removeChild' on 'Node'" on Settle Payment.
  const [checkoutSettling, setCheckoutSettling] = useState(false);
  // True while post-payment side-effects (receipt printing, cash drawer, layaway
  // conversion) run AFTER the payment itself has already been confirmed by the
  // backend and the success screen is showing. Drives the subtle "Printing
  // receipt…" indicator on the complete screen so the cashier isn't blocked on
  // the checkout form waiting for the printer round-trip (perceived-latency fix).
  const [checkoutFinalizing, setCheckoutFinalizing] = useState(false);
  const checkoutPreviewFreezeRef = useRef('');
  // ZATCA QR data URL for the checkout A4 preview (used only when QR is enabled
  // and no company stamp occupies that slot — "stamp if uploaded, else QR").
  const [checkoutPreviewQrDataUrl, setCheckoutPreviewQrDataUrl] = useState(null);
  // Customer's outstanding balance for the checkout Thermal preview's Credit Account
  // section — fetched async (useMemo can't await), mirrors the lookup done at print time.
  const [checkoutPreviewCreditBalance, setCheckoutPreviewCreditBalance] = useState(null);
  const [receiptSharePhone, setReceiptSharePhone] = useState('');
  const [receiptShareEmail, setReceiptShareEmail] = useState('');
  const [lastPaidInvoice, setLastPaidInvoice] = useState(null);

  // Touch screen POS states
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [favouriteProductIds, setFavouriteProductIds] = useState(new Set());
  const [favouriteTogglePending, setFavouriteTogglePending] = useState(new Set());
  const [currentInvoice, setCurrentInvoice] = useState({
    items: [],
    subtotal: 0,
    totalDiscount: 0,
    tax: 0,
    total: 0,
    billDiscountAmount: 0,
  });
  const currentInvoiceRef = useRef(null);
  // True when the Quick Customer modal was launched from the Checkout credit
  // panel, so the newly created customer is auto-selected as the credit buyer.
  const quickCustomerCreditCtxRef = useRef(false);
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
  // Live autocomplete for the Cart Focus scan/search box — shows a "select item"
  // dropdown of matching products as the cashier types, so a name/code/barcode
  // search works even when the Items Panel is hidden.
  const [barcodeSuggestions, setBarcodeSuggestions] = useState([]);
  const [barcodeSuggestionsLoading, setBarcodeSuggestionsLoading] = useState(false);
  const [invoiceCounter, setInvoiceCounter] = useState(0);
  // Real next invoice number previewed from the backend numbering sequence
  // (GET /api/sales-invoices/next-number). POS checkout posts through the same
  // SalesInvoice save path, so this is the number the sale will actually get —
  // used for the checkout header + receipt preview instead of a fabricated
  // client-side counter. Null until fetched; callers fall back gracefully.
  const [previewInvoiceNo, setPreviewInvoiceNo] = useState(null);
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
  const [reprintPrintMode, setReprintPrintMode] = useState('thermal');
  const [reprintPreviewCredit, setReprintPreviewCredit] = useState(null);
  // X/Z report output format: 'a4' | '80mm' | '58mm'. One view-model, two renderers.
  const [reportPrintMode, setReportPrintMode] = useState('a4');
  const [cashDropFeedback, setCashDropFeedback] = useState(null);
  const [printFeedback, setPrintFeedback] = useState(null);
  const [showCouponsDialog, setShowCouponsDialog] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [showPromotionsDialog, setShowPromotionsDialog] = useState(false);
  const [showSaveOrderDialog, setShowSaveOrderDialog] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [savedOrders, setSavedOrders] = useState([]);
  const [saveOrderBusy, setSaveOrderBusy] = useState(false);
  const [saveOrderError, setSaveOrderError] = useState('');
  const [showOrdersListDialog, setShowOrdersListDialog] = useState(false);
  const [ordersList, setOrdersList] = useState([]);
  const [ordersListLoading, setOrdersListLoading] = useState(false);
  const [ordersListSearch, setOrdersListSearch] = useState('');
  const [ordersListStatusFilter, setOrdersListStatusFilter] = useState('All');
  const [ordersListSelected, setOrdersListSelected] = useState(null);
  const [ordersListSelectedDetail, setOrdersListSelectedDetail] = useState(null);
  const [ordersListDetailLoading, setOrdersListDetailLoading] = useState(false);
  const [addCustomerBusy, setAddCustomerBusy] = useState(false);
  const [addCustomerError, setAddCustomerError] = useState('');
  const [showLayawaysDialog, setShowLayawaysDialog] = useState(false);
  const [layawayDeposit, setLayawayDeposit] = useState('');
  const [layawayCustomerNote, setLayawayCustomerNote] = useState('');
  // Price Check modal
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState('');
  const [priceCheckResult, setPriceCheckResult] = useState(null);
  // Search Products modal — dedicated multi-result lookup by item code, barcode, or
  // product name (substring match anywhere, backed by the same server-side LIKE
  // search as the items grid) so cashiers can find and add items even when the Items
  // Panel is hidden in Cart Focus.
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
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
  // Confirmation modal (replaces window.confirm for delete/cancel actions)
  const [confirmAction, setConfirmAction] = useState(null); // { title, message, onConfirm, busy }
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
  // Committed shipping charge applied to the order as a separate (non-product, untaxed)
  // totals line — NOT a cart item. Added to the grand total at checkout/preview/receipt.
  const [shippingCharge, setShippingCharge] = useState(0);
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
  const [printerConfigs, setPrinterConfigs] = useState([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [scannerConfig, setScannerConfig] = useState({
    enabled: false,
    deviceCode: '',
    deviceName: '',
    connectionType: 'USB',
    inputMode: 'KEYBOARD_WEDGE',
    status: 'ACTIVE',
    autoFocusOnPOS: true,
    notes: '',
  });
  const [scannerConfigSavedFlash, setScannerConfigSavedFlash] = useState(false);
  const [consoleDevices, setConsoleDevices] = useState([
    { id: 'd1', type: 'Receipt Printer', name: 'Epson TM-T82III', port: 'USB', status: 'Online' },
    { id: 'd2', type: 'Barcode Scanner', name: 'Honeywell Voyager 1202g', port: 'USB', status: 'Online' },
    { id: 'd3', type: 'Cash Drawer', name: 'APG Vasario 1616', port: 'Kick-out', status: 'Online' },
    { id: 'd4', type: 'Card Terminal', name: 'Ingenico Move 5000', port: 'Bluetooth', status: 'Offline' },
  ]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevType, setNewDevType] = useState('Receipt Printer');
  const [newDevName, setNewDevName] = useState('');
  const [newDevPort, setNewDevPort] = useState('USB');
  const [newDevIp, setNewDevIp] = useState('');
  const createDefaultScannerConfig = useCallback(() => ({
    enabled: false,
    deviceCode: currentTerminal?.terminalId ? `${currentTerminal.terminalId}-SCAN-01` : '',
    deviceName: currentTerminal?.terminalName ? `${currentTerminal.terminalName} Scanner` : '',
    connectionType: 'USB',
    inputMode: 'KEYBOARD_WEDGE',
    status: 'ACTIVE',
    autoFocusOnPOS: true,
    notes: '',
  }), [currentTerminal?.terminalId, currentTerminal?.terminalName]);
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
  // QR / stamp / footer-image placement on the receipt: 'before' | 'after' the footer text.
  const [tplInvoiceQrPlacement, setTplInvoiceQrPlacement] = useState('before');
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
  const [tplReturnShowCreditBalance, setTplReturnShowCreditBalance] = useState(false);
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
  // Which receipt template (Template 1 "native" vs Template 2 "billbull-ar")
  // drives the actual checkout print — persisted alongside the rest of
  // printTemplateConfig so the Print Templates designer's saved selection is
  // what the till prints at checkout, not just the designer's own test print.
  const [receiptTemplateId, setReceiptTemplateId] = useState(DEFAULT_RECEIPT_TEMPLATE_ID);

  // ── Template 2 (Arabic/bilingual) Show/Hide toggles ─────────────────────────
  // Template 2 renders its own sections (Account Balance, Delivery, Loyalty,
  // bilingual Arabic text) that Template 1 doesn't have, so it carries its OWN
  // independent toggle state rather than reusing Template 1's. Selecting
  // Template 2 in the designer swaps the toggle list AND its saved values.
  // Persisted alongside the rest of printTemplateConfig. Defaults preserve the
  // current Template 2 output (everything on except QR, which stays opt-in).
  const [t2ShowLogo, setT2ShowLogo] = useState(true);
  const [t2ShowCompanyDetails, setT2ShowCompanyDetails] = useState(true);
  const [t2ShowTrn, setT2ShowTrn] = useState(true);
  const [t2ShowArabic, setT2ShowArabic] = useState(true);
  const [t2ShowCustomerDetails, setT2ShowCustomerDetails] = useState(true);
  const [t2ShowAccountBalance, setT2ShowAccountBalance] = useState(true);
  const [t2ShowDelivery, setT2ShowDelivery] = useState(true);
  const [t2ShowVatSummary, setT2ShowVatSummary] = useState(true);
  const [t2ShowPaymentDetails, setT2ShowPaymentDetails] = useState(true);
  const [t2ShowLoyalty, setT2ShowLoyalty] = useState(true);
  const [t2ShowQRCode, setT2ShowQRCode] = useState(false);
  const [t2ShowFooterText, setT2ShowFooterText] = useState(true);
  const [t2ShowBarcode, setT2ShowBarcode] = useState(true);

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

  const horizontalCategories = useMemo(() => ([
    { id: 'all', name: 'All Items', icon: Package },
    { id: 'favourites', name: 'Favourites ❤️', icon: Heart },
    { id: 'recently-sold', name: 'Recently Sold', icon: Clock },
    { id: 'top-sold', name: 'Top Sold', icon: TrendingUp },
  ]), []);

  const customerOptions = useMemo(() => [WALK_IN_CUSTOMER, ...posCustomers], [posCustomers]);

  // Single source of truth for "who is this sale's customer". In Credit mode the
  // cashier picks in the dedicated credit search box (checkoutCreditCustomer),
  // which lives in its own state; if that pick never mirrored back onto
  // selectedCustomer, the preview, printed receipt AND the posted invoice all fell
  // back to Walk-in even though a real customer was chosen. Resolve the effective
  // customer here so every consumer (preview, print, backend payload) agrees:
  // prefer the Credit-box selection when in Credit mode, else the main selection.
  const effectiveCustomerId = useMemo(
    () => (checkoutPayMode === 'credit' && checkoutCreditCustomer) ? checkoutCreditCustomer : selectedCustomer,
    [checkoutPayMode, checkoutCreditCustomer, selectedCustomer]
  );

  const selectedCustomerData = useMemo(
    () => customerOptions.find(c => c.id === effectiveCustomerId) || WALK_IN_CUSTOMER,
    [customerOptions, effectiveCustomerId]
  );

  const checkoutThermalHtml = useMemo(() => {
    if (checkoutSettling) return checkoutPreviewFreezeRef.current;
    if (!currentInvoice) return '';
    try {
      const now = new Date();
      // Real next number from the backend sequence; blank until fetched so the
      // preview never shows a fabricated SI-POS-000001.
      const invoiceNo = previewInvoiceNo || '';
      const stampAvailable = tplInvoiceShowQRCode && !!tplStampDataUrl;
      const showQrInPreview = tplInvoiceShowQRCode && !stampAvailable;
      // Use the same authoritative resolution the printed receipt + backend payload
      // use (selectedCustomerData) so the preview never disagrees with the actual
      // print — in Credit mode this honours the credit-box selection.
      const customer = selectedCustomerData;
      const previewShipping = Number(shippingCharge) || 0;

      const mockInvoice = {
        invoiceNumber: invoiceNo,
        invoiceDate: now.toISOString(),
        createdAt: now.toISOString(),
        customerName: customer?.name || 'Walk-in Customer',
        customerPhone: customer?.phone || '',
        customerEmail: customer?.email || '',
        // Customer code (Fix 2 — Template 2 Customer Details) + credit TRN.
        customerCode: (customer && customer.id !== 'walk-in') ? (customer.code || customer.id || '') : '',
        customerTrn: customer?.trn || '',
        saleType: currentInvoice.saleType || '',
        shippingAddress: customer?.shippingAddress || customer?.address || '',
        posTerminalId: currentTerminal?.terminalId || '',
        posCounterName: currentTerminal?.counterName || '',
        paymentMode: checkoutPayMode === 'cash' ? 'Cash' : checkoutPayMode === 'card' ? (checkoutCardType || 'Card') : checkoutPayMode === 'credit' ? 'Credit' : checkoutPayMode === 'online' ? 'Online' : 'Cash + Card',
        subTotal: currentInvoice.subtotal || 0,
        taxTotal: currentInvoice.tax || 0,
        taxInclusive: !!currentInvoice.taxInclusive,
        invoiceTotal: (currentInvoice.total || 0) + previewShipping,
        discountTotal: currentInvoice.totalDiscount || 0,
        items: (currentInvoice.items || []).map(it => ({
          itemCode: it.code || it.productId || it.id || '',
          itemName: it.name || '',
          // Arabic item name (Fix 5) — carried from the cart line's nameAr, which
          // the cart builder now sources from the product's localName.
          localName: it.nameAr || it.localName || '',
          description: it.description || '',
          quantity: it.quantity || 0,
          unitPrice: it.price || 0,
          netAmount: it.total || 0,
          discountPercent: it.discount || 0,
          taxPercent: it.taxRate != null ? it.taxRate : undefined,
          taxAmount: it.taxAmount != null ? it.taxAmount : undefined,
          grossAmount: (it.quantity || 0) * (it.price || 0),
          batchNumber: it.pinnedBatchNumber || it.batchNumber || '',
          serialNumber: it.serialNumber || '',
          voided: !!it.isVoided,
        })),
      };

      const previewDeposit = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
      const previewGrand = (currentInvoice.total || 0) + previewShipping;

      // Mixed (cash + card) split for the receipt preview — only when the mode is
      // Mixed and both portions were entered, so cash/card/credit sales don't show
      // an empty split. Passed to BOTH template renderers below.
      const previewMixedCash = checkoutPayMode === 'mixed' ? (parseFloat(mixedCashAmount) || 0) : 0;
      const previewMixedCard = checkoutPayMode === 'mixed' ? (parseFloat(mixedCardAmount) || 0) : 0;
      const previewHasMixed = checkoutPayMode === 'mixed' && (previewMixedCash > 0 || previewMixedCard > 0);

      // Template 2 (Arabic/bilingual) has its own HTML renderer — the checkout
      // preview must show whichever template is saved in Print Templates, same
      // as the ESC/POS print path below already does (see buildReceiptEscPosBase64).
      if (receiptTemplateId === 'billbull-ar') {
        const isWalkInPreview = !customer || customer.id === 'walk-in';
        // Template 2 has its OWN Show/Hide toggles (independent of Template 1's
        // invoice toggles). The preview honours them so what the merchant sees
        // here matches what the till prints at checkout.
        const t2Toggles = {
          showLogo: t2ShowLogo, showCompanyDetails: t2ShowCompanyDetails, showTrn: t2ShowTrn,
          showArabic: t2ShowArabic, showCustomerDetails: t2ShowCustomerDetails,
          showAccountBalance: t2ShowAccountBalance, showDelivery: t2ShowDelivery,
          showVatSummary: t2ShowVatSummary, showPaymentDetails: t2ShowPaymentDetails,
          showLoyalty: t2ShowLoyalty, showQRCode: t2ShowQRCode,
          showFooterText: t2ShowFooterText, showBarcode: t2ShowBarcode,
        };
        const t2StampAvailable = t2ShowQRCode && !!tplStampDataUrl;
        const t2ShowQr = t2ShowQRCode && !t2StampAvailable;
        const txn = mapInvoiceToTxn(mockInvoice, {
          currency: activeCurrency,
          terminalId: currentTerminal?.terminalId,
          cashierName: cashierDisplayName,
          customerPhone: customer?.phone,
          branchName: currentTerminal?.branchName || currentSession?.branchName || '',
          shippingCharge: previewShipping > 0 ? previewShipping : null,
          // Account Balance section (Fix 3): mirror Template 1's checkout preview
          // — show it when the credit block is enabled and we have a balance for a
          // non-walk-in customer. Invoice Credit = grand total, Amount Paid = 0
          // (nothing collected yet in the preview), New Balance = prev + this.
          // Additionally gated by Template 2's own Account Balance toggle.
          showCreditBalance: t2ShowAccountBalance && !isWalkInPreview && checkoutPreviewCreditBalance != null,
          creditPreviousBalance: checkoutPreviewCreditBalance,
          creditInvoiceCredit: previewGrand,
          creditAmountPaid: 0,
          creditUpdatedBalance: checkoutPreviewCreditBalance != null ? Number(checkoutPreviewCreditBalance) + previewGrand : null,
          mixedCashGiven: previewHasMixed ? previewMixedCash : null,
          mixedCardGiven: previewHasMixed ? previewMixedCard : null,
          mixedCardType: previewHasMixed ? (mixedCardType || 'Card') : null,
        });
        const outlet = {
          name: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone,
          logoDataUrl: tplLogoDataUrl,
          // Real QR in preview when QR is enabled and no stamp overrides it; stamp
          // image shown separately when uploaded (parity with Template 1 preview).
          qrDataUrl: t2ShowQr ? checkoutPreviewQrDataUrl : null,
          stampDataUrl: t2StampAvailable ? tplStampDataUrl : null,
          footerText: tplInvoiceFooter,
        };
        const html = buildTemplate2Html(mapToTemplate2Data(outlet, txn, t2Toggles));
        checkoutPreviewFreezeRef.current = html;
        return html;
      }

      const html = buildThermalReceiptHtml('80mm', mockInvoice, {
        shippingCharge: previewShipping > 0 ? previewShipping : null,
        depositApplied: previewDeposit > 0 ? previewDeposit : null,
        balanceDue: previewDeposit > 0 ? Math.max(0, previewGrand - previewDeposit) : null,
        companyName: tplOutletName, trn: tplOutletTrn, header: tplInvoiceHeader, footer: tplInvoiceFooter,
        showTrn: tplInvoiceShowTrn, zatcaQrDataUrl: showQrInPreview ? checkoutPreviewQrDataUrl : null,
        logoDataUrl: tplLogoDataUrl, stampDataUrl: stampAvailable ? tplStampDataUrl : null,
        showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails,
        outletAddress: tplOutletAddress, outletPhone: tplOutletPhone, showServiceCharge: tplInvoiceShowGrandTotalBanner,
        showVatSummary: tplInvoiceColVatAmt, showPaymentDetails: tplInvoiceColDiscount, showQRCode: showQrInPreview,
        showCustomerDetails: tplInvoiceShowCustomerDetails, showLoyaltyPoints: tplInvoiceShowNotes,
        showCreditBalance: tplInvoiceShowBankDetails, showFooterText: tplInvoiceShowTerms,
        creditPreviousBalance: checkoutPreviewCreditBalance,
        cashierName: cashierDisplayName, terminalId: currentTerminal?.terminalId, counterName: currentTerminal?.counterName,
        currency: activeCurrency, qrPlacement: tplInvoiceQrPlacement,
        mixedCashGiven: previewHasMixed ? previewMixedCash : null,
        mixedCardGiven: previewHasMixed ? previewMixedCard : null,
        mixedCardType: previewHasMixed ? (mixedCardType || 'Card') : null,
      });

      checkoutPreviewFreezeRef.current = html;
      return html;
    } catch (e) {
      console.warn('Checkout Thermal preview failed:', e);
      return '';
    }
  }, [checkoutSettling, currentInvoice, selectedCustomerData, previewInvoiceNo, activeLayawayDeposit, shippingCharge,
    checkoutPayMode, checkoutCardType, mixedCashAmount, mixedCardAmount, mixedCardType, currentTerminal, cashierDisplayName, activeCurrency,
    tplInvoiceHeader, tplInvoiceFooter, tplOutletName, tplOutletTrn, tplOutletAddress, tplOutletPhone, tplLogoDataUrl,
    tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn, tplInvoiceShowCustomerDetails,
    tplInvoiceShowTerms, tplInvoiceShowNotes, tplInvoiceShowBankDetails, tplInvoiceShowGrandTotalBanner,
    tplInvoiceShowStamp, tplInvoiceShowQRCode, tplStampDataUrl, checkoutPreviewQrDataUrl, tplInvoiceColVatAmt,
    tplInvoiceColDiscount, tplInvoiceQrPlacement, checkoutPreviewCreditBalance, receiptTemplateId, currentSession,
    t2ShowLogo, t2ShowCompanyDetails, t2ShowTrn, t2ShowArabic, t2ShowCustomerDetails, t2ShowAccountBalance, t2ShowDelivery,
    t2ShowVatSummary, t2ShowPaymentDetails, t2ShowLoyalty, t2ShowQRCode, t2ShowFooterText, t2ShowBarcode]);

  const checkoutPreviewBlobUrl = useA4BlobUrl(checkoutThermalHtml);

  // Heartbeat — keeps the terminal ACTIVE on the server
  useHeartbeat(
    currentTerminal?.terminalId,
    (posSettings?.heartbeatIntervalSeconds ?? 60) * 1000,
  );

  // Idle timeout — auto-lock the screen when no activity
  useIdleTimeout({
    timeoutMs: isSessionActive && posSettings?.sessionIdleTimeoutMinutes > 0
      ? posSettings.sessionIdleTimeoutMinutes * 60_000 : 0,
    touchIntervalMs: 30_000,
    sessionId: currentSession?.id,
    onIdle: () => { if (isSessionActive) setIsIdleLocked(true); },
  });

  // Fetch the selected customer's outstanding balance for the checkout preview's
  // Credit Account section — same lookup used at actual print time.
  useEffect(() => {
    if (!tplInvoiceShowBankDetails || !showPaymentDialog || !selectedCustomerData || selectedCustomerData.id === 'walk-in') {
      setCheckoutPreviewCreditBalance(null);
      return;
    }
    const code = selectedCustomerData.code || selectedCustomerData.id;
    if (!code) {
      setCheckoutPreviewCreditBalance(null);
      return;
    }
    let cancelled = false;
    // Seed 0 (not null) so the Credit Account section renders in the preview the
    // instant the toggle is on and a real customer is picked — the builder gate is
    // `creditPreviousBalance != null`, so a null here would hide the whole section.
    // A customer with no prior ledger record (lookup found:false) legitimately has
    // a 0 previous balance; the print path uses the same 0-fallback, so the preview
    // and the printed receipt now agree instead of the preview silently dropping it.
    setCheckoutPreviewCreditBalance(0);
    posCreditBalance(code)
      .then(cr => { if (!cancelled) setCheckoutPreviewCreditBalance(cr?.found ? (cr.outstanding ?? 0) : 0); })
      .catch(() => { if (!cancelled) setCheckoutPreviewCreditBalance(0); });
    return () => { cancelled = true; };
  }, [tplInvoiceShowBankDetails, showPaymentDialog, selectedCustomerData]);

  // Credit Balance function-button modal: auto-load the currently selected POS
  // customer's due/credit balance on open, and refresh if the selection changes
  // while the modal stays open (e.g. after a transaction updates their balance).
  useEffect(() => {
    if (!showCreditBalance || !selectedCustomerData || selectedCustomerData.id === 'walk-in') return;
    const code = selectedCustomerData.code || selectedCustomerData.id;
    if (!code) return;
    setCreditBalanceQuery(selectedCustomerData.id);
    let cancelled = false;
    setCreditBalanceResult('searching');
    posCreditBalance(code)
      .then(res => { if (!cancelled) setCreditBalanceResult(res.found ? res : 'notfound'); })
      .catch(() => { if (!cancelled) setCreditBalanceResult('notfound'); });
    return () => { cancelled = true; };
  }, [showCreditBalance, selectedCustomerData]);

  // Generate the preview ZATCA QR only when the QR is enabled and no stamp is
  // taking its slot. Built from the live (unsaved) totals so the preview shows a
  // representative code; the real archived QR is regenerated at print time.
  useEffect(() => {
    const stampAvailable = tplInvoiceShowQRCode && !!tplStampDataUrl;
    if (!tplInvoiceShowQRCode || stampAvailable || !showPaymentDialog) {
      setCheckoutPreviewQrDataUrl(null);
      return;
    }
    let cancelled = false;
    try {
      const mockInv = {
        invoiceNumber: previewInvoiceNo || '',
        invoiceDate: new Date().toISOString(),
        customerName: selectedCustomer?.name || 'Walk-in Customer',
        subTotal: currentInvoice?.subtotal || 0,
        taxTotal: currentInvoice?.tax || 0,
        invoiceTotal: currentInvoice?.total || 0,
        items: (currentInvoice?.items || []).map(it => ({
          itemCode: it.code || it.productId || it.id || '',
          itemName: it.name || '',
          quantity: it.quantity || 0,
          unitPrice: it.price || 0,
          netAmount: it.total || 0,
          voided: !!it.isVoided,
        })),
      };
      const qrContent = buildQrContent(buildPosPrintData(mockInv, tplInvoiceFooter), tplOutletName);
      QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'L', width: 160, margin: 1 })
        .then(url => { if (!cancelled) setCheckoutPreviewQrDataUrl(url); })
        .catch(() => { if (!cancelled) setCheckoutPreviewQrDataUrl(null); });
    } catch { setCheckoutPreviewQrDataUrl(null); }
    return () => { cancelled = true; };
  }, [tplInvoiceShowQRCode, tplInvoiceShowStamp, tplStampDataUrl, showPaymentDialog,
    currentInvoice, previewInvoiceNo, selectedCustomer, tplInvoiceFooter, tplOutletName, tplOutletTrn]);

  // Safety net: whenever the checkout overlay is fully dismissed, drop the
  // settle-freeze so the next sale's preview tracks the live cart again. Covers
  // every exit path (close X, cancel, auto-new-sale) without threading a reset
  // through each handler.
  useEffect(() => {
    if (!showPaymentDialog && checkoutSettling) setCheckoutSettling(false);
  }, [showPaymentDialog, checkoutSettling]);

  // Fetch the REAL next invoice number from the backend numbering sequence when
  // the checkout dialog opens, so the header + receipt preview show the number
  // the sale will actually be assigned (not a fabricated SI-POS-000001). It's a
  // preview (numberingService.preview) — no sequence is consumed until the sale
  // posts — so it's re-fetched each time the dialog opens and after each sale
  // (invoiceCounter bump) to stay current under concurrent tills.
  useEffect(() => {
    if (!showPaymentDialog) return;
    let cancelled = false;
    getNextInvoiceNumber()
      .then(no => { if (!cancelled && no) setPreviewInvoiceNo(no); })
      .catch(() => { /* keep last value; UI falls back to blank if never fetched */ });
    return () => { cancelled = true; };
  }, [showPaymentDialog, invoiceCounter]);

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
        [c.name, c.code, c.membershipId, c.phone, c.mobile, c.email, c.trn]
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
      [c.name, c.code, c.membershipId, c.phone, c.mobile, c.email, c.trn]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    ).slice(0, 30);
  }, [checkoutCreditCustomerSearch, customerOptions]);

  const creditCustomerData = useMemo(
    () => customerOptions.find(c => c.id === checkoutCreditCustomer) || null,
    [checkoutCreditCustomer, customerOptions]
  );

  useEffect(() => { currentInvoiceRef.current = currentInvoice; }, [currentInvoice]);

  // When the checkout opens with a real customer already on the bill, carry that
  // customer into the Credit-payment section so the cashier never has to
  // re-select. Only seeds once per open and never overrides a manual pick.
  useEffect(() => {
    if (!showPaymentDialog) return;
    if (checkoutCreditCustomer) return;
    if (selectedCustomer && selectedCustomer !== WALK_IN_CUSTOMER.id) {
      setCheckoutCreditCustomer(selectedCustomer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentDialog]);

  // Lazily load configured bank accounts the first time the cashier opens checkout
  // and switches to Online mode (or Credit mode, whose partial-receipt leg can also
  // be received Online/Bank) — same list/endpoint Bank Reconciliation already uses.
  useEffect(() => {
    if (checkoutPayMode !== 'online' && checkoutPayMode !== 'credit') return;
    if (checkoutOnlineBankAccounts.length > 0 || checkoutOnlineBankAccountsLoading) return;
    let cancelled = false;
    setCheckoutOnlineBankAccountsLoading(true);
    getBankAccounts()
      .then(data => { if (!cancelled) setCheckoutOnlineBankAccounts(Array.isArray(data) ? data : []); })
      .catch(err => { console.warn('Failed to load bank accounts', err); if (!cancelled) setCheckoutOnlineBankAccounts([]); })
      .finally(() => { if (!cancelled) setCheckoutOnlineBankAccountsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutPayMode]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search Products modal — live, debounced lookup as the cashier types. Reuses the
  // paginated product list endpoint, which already matches item code, SKU, barcode,
  // and product name anywhere in the string (not just a prefix).
  useEffect(() => {
    if (!showProductSearch) return undefined;
    const query = productSearchQuery.trim();
    if (!query) {
      setProductSearchResults([]);
      setProductSearchLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setProductSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await getProductsList(0, 30, query, controller.signal, null, null, null, true);
        const mapped = Array.isArray(data?.content) ? data.content.map(mapPosProductListItem) : [];
        mapped.forEach(product => cachePosProduct(productCacheRef.current, product));
        setProductSearchResults(mapped);
      } catch (error) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        console.error('Product search failed', error);
        setProductSearchResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [productSearchQuery, showProductSearch]);

  // Cart Focus scan/search box — live "select item" suggestions as the cashier
  // types. Suppressed while the same field is repurposed as a qty/discount/price
  // numpad (posActionMode !== 'none'), where its value is a number, not a search.
  useEffect(() => {
    const query = barcodeInput.trim();
    if (posActionMode !== 'none' || !query) {
      setBarcodeSuggestions([]);
      setBarcodeSuggestionsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setBarcodeSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await getProductsList(0, 8, query, controller.signal, null, null, null, true);
        const mapped = Array.isArray(data?.content) ? data.content.map(mapPosProductListItem) : [];
        mapped.forEach(product => cachePosProduct(productCacheRef.current, product));
        setBarcodeSuggestions(mapped);
      } catch (error) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        setBarcodeSuggestions([]);
      } finally {
        setBarcodeSuggestionsLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [barcodeInput, posActionMode]);

  const loadPosCustomers = useCallback(async () => {
    setPosCustomersLoading(true);
    setPosCustomersError('');
    try {
      const data = await getAllCustomers();
      const mapped = Array.isArray(data)
        ? data.map(mapPosCustomer).filter(c => c.id && c.id !== WALK_IN_CUSTOMER.id)
        : [];
      setPosCustomers(mapped);
    } catch (error) {
      console.error('Failed to load POS customers', error);
      setPosCustomers([]);
      setPosCustomersError('Customers could not be loaded.');
    } finally {
      setPosCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosCustomers();
  }, [loadPosCustomers]);

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
              if (tpl.receiptShowCompanyDetails != null) setTplReceiptShowCompanyDetails(tpl.receiptShowCompanyDetails);
              if (tpl.receiptShowCustomerDetails != null) setTplReceiptShowCustomerDetails(tpl.receiptShowCustomerDetails);
              if (tpl.receiptColItemCode != null) setTplReceiptColItemCode(tpl.receiptColItemCode);
              if (tpl.receiptColItemImage != null) setTplReceiptColItemImage(tpl.receiptColItemImage);
              if (tpl.receiptColBatchNo != null) setTplReceiptColBatchNo(tpl.receiptColBatchNo);
              if (tpl.receiptColDiscount != null) setTplReceiptColDiscount(tpl.receiptColDiscount);
              if (tpl.receiptColVatPct != null) setTplReceiptColVatPct(tpl.receiptColVatPct);
              if (tpl.receiptColVatAmt != null) setTplReceiptColVatAmt(tpl.receiptColVatAmt);
              if (tpl.receiptShowGrandTotalBanner != null) setTplReceiptShowGrandTotalBanner(tpl.receiptShowGrandTotalBanner);
              if (tpl.receiptShowTerms != null) setTplReceiptShowTerms(tpl.receiptShowTerms);
              if (tpl.receiptShowNotes != null) setTplReceiptShowNotes(tpl.receiptShowNotes);
              if (tpl.receiptShowBankDetails != null) setTplReceiptShowBankDetails(tpl.receiptShowBankDetails);
              if (tpl.receiptShowQRCode != null) setTplReceiptShowQRCode(tpl.receiptShowQRCode);
              if (tpl.receiptShowSignature != null) setTplReceiptShowSignature(tpl.receiptShowSignature);
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
              if (tpl.invoiceQrPlacement != null) setTplInvoiceQrPlacement(tpl.invoiceQrPlacement);
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
              if (tpl.returnShowCompanyDetails != null) setTplReturnShowCompanyDetails(tpl.returnShowCompanyDetails);
              if (tpl.returnShowCustomerDetails != null) setTplReturnShowCustomerDetails(tpl.returnShowCustomerDetails);
              if (tpl.returnColItemCode != null) setTplReturnColItemCode(tpl.returnColItemCode);
              if (tpl.returnColBatchNo != null) setTplReturnColBatchNo(tpl.returnColBatchNo);
              if (tpl.returnColDiscount != null) setTplReturnColDiscount(tpl.returnColDiscount);
              if (tpl.returnColVatPct != null) setTplReturnColVatPct(tpl.returnColVatPct);
              if (tpl.returnColVatAmt != null) setTplReturnColVatAmt(tpl.returnColVatAmt);
              if (tpl.returnShowGrandTotalBanner != null) setTplReturnShowGrandTotalBanner(tpl.returnShowGrandTotalBanner);
              if (tpl.returnShowTerms != null) setTplReturnShowTerms(tpl.returnShowTerms);
              if (tpl.returnShowNotes != null) setTplReturnShowNotes(tpl.returnShowNotes);
              if (tpl.returnShowQRCode != null) setTplReturnShowQRCode(tpl.returnShowQRCode);
              if (tpl.returnShowSignature != null) setTplReturnShowSignature(tpl.returnShowSignature);
              if (tpl.returnShowCreditBalance != null) setTplReturnShowCreditBalance(tpl.returnShowCreditBalance);
              if (tpl.jobCardFooter != null) setTplJobCardFooter(tpl.jobCardFooter);
              if (tpl.jobCardPaper != null) setTplJobCardPaper(tpl.jobCardPaper);
              if (tpl.jobCardShowLogo != null) setTplJobCardShowLogo(tpl.jobCardShowLogo);
              if (tpl.jobCardShowTrn != null) setTplJobCardShowTrn(tpl.jobCardShowTrn);
              if (tpl.jobCardShowStamp != null) setTplJobCardShowStamp(tpl.jobCardShowStamp);
              if (tpl.jobCardShowCompanyDetails != null) setTplJobCardShowCompanyDetails(tpl.jobCardShowCompanyDetails);
              if (tpl.jobCardShowCustomerDetails != null) setTplJobCardShowCustomerDetails(tpl.jobCardShowCustomerDetails);
              if (tpl.jobCardShowSerialNumber != null) setTplJobCardShowSerialNumber(tpl.jobCardShowSerialNumber);
              if (tpl.jobCardShowWarranty != null) setTplJobCardShowWarranty(tpl.jobCardShowWarranty);
              if (tpl.jobCardShowTechnician != null) setTplJobCardShowTechnician(tpl.jobCardShowTechnician);
              if (tpl.jobCardShowExpectedDate != null) setTplJobCardShowExpectedDate(tpl.jobCardShowExpectedDate);
              if (tpl.jobCardShowCustomerSignature != null) setTplJobCardShowCustomerSignature(tpl.jobCardShowCustomerSignature);
              if (tpl.jobCardShowTerms != null) setTplJobCardShowTerms(tpl.jobCardShowTerms);
              if (tpl.receiptTemplateId != null) setReceiptTemplateId(tpl.receiptTemplateId);
              // Template 2 (Arabic) independent Show/Hide toggles
              if (tpl.t2ShowLogo != null) setT2ShowLogo(tpl.t2ShowLogo);
              if (tpl.t2ShowCompanyDetails != null) setT2ShowCompanyDetails(tpl.t2ShowCompanyDetails);
              if (tpl.t2ShowTrn != null) setT2ShowTrn(tpl.t2ShowTrn);
              if (tpl.t2ShowArabic != null) setT2ShowArabic(tpl.t2ShowArabic);
              if (tpl.t2ShowCustomerDetails != null) setT2ShowCustomerDetails(tpl.t2ShowCustomerDetails);
              if (tpl.t2ShowAccountBalance != null) setT2ShowAccountBalance(tpl.t2ShowAccountBalance);
              if (tpl.t2ShowDelivery != null) setT2ShowDelivery(tpl.t2ShowDelivery);
              if (tpl.t2ShowVatSummary != null) setT2ShowVatSummary(tpl.t2ShowVatSummary);
              if (tpl.t2ShowPaymentDetails != null) setT2ShowPaymentDetails(tpl.t2ShowPaymentDetails);
              if (tpl.t2ShowLoyalty != null) setT2ShowLoyalty(tpl.t2ShowLoyalty);
              if (tpl.t2ShowQRCode != null) setT2ShowQRCode(tpl.t2ShowQRCode);
              if (tpl.t2ShowFooterText != null) setT2ShowFooterText(tpl.t2ShowFooterText);
              if (tpl.t2ShowBarcode != null) setT2ShowBarcode(tpl.t2ShowBarcode);
            } catch (e) { /* stale/malformed config — fall through to defaults */ }
          }
        }

        // Generate or retrieve persistent device fingerprint and terminal ID
        const nav = window.navigator;
        let fp = localStorage.getItem('billbull:pos:device_fingerprint');
        if (!fp) {
          fp = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
          localStorage.setItem('billbull:pos:device_fingerprint', fp);
        }
        const cachedTerminalId = localStorage.getItem('billbull:pos:terminal_id') || null;
        const deviceInfo = `${nav.userAgent.split('(')[1]?.split(')')[0] || 'Unknown'} – ${screen.width}×${screen.height}`;

        const regResult = await registerPosTerminal({ terminalId: cachedTerminalId, deviceFingerprint: fp, deviceInfo }).catch(() => null);
        if (!cancelled && regResult?.terminal) {
          setCurrentTerminal(regResult.terminal);
          localStorage.setItem('billbull:pos:terminal_id', regResult.terminal.terminalId);

          // Try to resume an existing open session for this terminal
          const termId = regResult.terminal.terminalId;
          try {
            const active = await getActivePosSession(termId);
            if (!cancelled && active?.id) {
              setCurrentSession(active);
            }
          } catch (err) {
            if (err.response?.status === 409) {
              if (!cancelled) setTerminalLockedBy(err.response?.data?.message || err.response?.data || 'Another active cashier');
            }
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
    // Opening the dedicated X-Report view is the deliberate "Generate X Report"
    // action — mark this terminal complete so it clears the Z-Report gate.
    if (currentView === 'x-report') loadXReport(true);
    if (currentView === 'z-report') loadZReport(zReportDate);
    // Refresh dashboard stats whenever returning to dashboard with an active session
    if (currentView === 'dashboard' && (currentSession?.status === 'active' || currentSession?.status === 'OPEN')) {
      loadXReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Auto-print the X-Report once, after Close Session, when the fresh report data
  // has loaded into state (armed by handleCloseSession). Waiting for xReportData
  // guarantees the printout matches the on-screen X-Report exactly.
  useEffect(() => {
    if (!pendingXAutoPrintRef.current) return;
    if (xReportLoading || !xReportData) return;
    const sessId = pendingXAutoPrintRef.current;
    pendingXAutoPrintRef.current = null;
    const vm = buildXReportViewModel();
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    void autoPrintReportThermal(
      vm, cp,
      { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0, 10) }, { label: 'Cashier', value: sess?.openedBy || '' }] },
      `x-report:${sessId}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xReportData, xReportLoading]);

  // Auto-print the Z-Report once, after Close Day, when the fresh report data has
  // loaded into state (armed by handleCloseDay).
  useEffect(() => {
    if (!pendingZAutoPrintRef.current) return;
    if (zReportLoading || !zReportData) return;
    const dateKey = pendingZAutoPrintRef.current;
    pendingZAutoPrintRef.current = null;
    const vm = buildZReportViewModel();
    const cp = reportCompanyProfile();
    void autoPrintReportThermal(
      vm, cp,
      { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] },
      `z-report:${dateKey}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zReportData, zReportLoading]);

  // Load dashboard stats once the session becomes available on initial page load.
  // The view-change effect above misses this because currentView is already 'dashboard'
  // when currentSession resolves asynchronously after terminal registration.
  useEffect(() => {
    if (currentView === 'dashboard' && (currentSession?.status === 'active' || currentSession?.status === 'OPEN') && !xReportData && !xReportLoading) {
      loadXReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id]);

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
    const hasSearch = Boolean(debouncedSearchQuery);
    const isSpecial = !hasSearch && SPECIAL_CATEGORIES.has(selectedCategory);

    if (append) {
      setPosProductsLoadingMore(true);
    } else {
      setPosProductsLoading(true);
      setPosProductsError('');
      setPosProducts([]);
    }

    try {
      let data;

      if (isSpecial) {
        if (selectedCategory === 'favourites') {
          data = await getFavouriteProducts(page, POS_PRODUCT_PAGE_SIZE, signal);
        } else if (selectedCategory === 'recently-sold') {
          data = await getRecentlySoldProducts(page, POS_PRODUCT_PAGE_SIZE, signal);
        } else if (selectedCategory === 'top-sold') {
          data = await getTopSoldProducts(page, POS_PRODUCT_PAGE_SIZE, signal);
        }
      } else {
        const departmentId = (hasSearch || selectedCategory === 'all') ? null : Number(selectedCategory);
        data = await getProductsList(
          page,
          POS_PRODUCT_PAGE_SIZE,
          debouncedSearchQuery,
          signal,
          null,
          Number.isFinite(departmentId) ? departmentId : null,
          null,
          true
        );
      }

      const mapped = Array.isArray(data?.content)
        ? data.content.map(mapPosProductListItem)
        : [];

      mapped.forEach(product => cachePosProduct(productCacheRef.current, product));

      // When searching, fall back to resolve endpoint if no products found
      if (mapped.length === 0 && !append && debouncedSearchQuery && !isSpecial) {
        try {
          const resolved = await resolvePosEntry(debouncedSearchQuery);
          if (signal?.aborted) return;
          if (resolved?.type === 'PRODUCT' && resolved.product) {
            const resolvedProduct = mapPosProductAggregateItem(resolved.product, debouncedSearchQuery);
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

      // Load favourite IDs in background when switching to favourites tab
      if (selectedCategory === 'favourites' && mapped.length > 0) {
        setFavouriteProductIds(new Set(mapped.map(p => p.id)));
      }

      setPosProducts(prev => append ? [...prev, ...mapped] : mapped);
      setPosProductPage(data?.page ?? page);
      setPosProductTotalPages(data?.totalPages ?? 0);
      setPosProductTotalElements(data?.totalElements ?? mapped.length);
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      console.error('Failed to load POS products', error);
      if (!append) {
        try {
          const fallbackProducts = await getProducts();
          if (signal?.aborted) return;
          const fallbackMapped = Array.isArray(fallbackProducts)
            ? fallbackProducts.map(product => mapPosProductAggregateItem(product)).filter(p => p.availableInPos !== false)
            : [];

          fallbackMapped.forEach(product => cachePosProduct(productCacheRef.current, product));
          setPosProducts(fallbackMapped);
          setPosProductPage(0);
          setPosProductTotalPages(1);
          setPosProductTotalElements(fallbackMapped.length);
          setPosProductsError('');
          return;
        } catch (fallbackError) {
          if (fallbackError?.name === 'CanceledError' || fallbackError?.code === 'ERR_CANCELED') return;
          console.error('Fallback POS product load failed', fallbackError);
          setPosProducts([]);
        }
      }
      setPosProductsError('Products could not be loaded.');
    } finally {
      if (append) {
        setPosProductsLoadingMore(false);
      } else {
        setPosProductsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toggleFavourite = useCallback(async (productId) => {
    if (favouriteTogglePending.has(productId)) return;
    setFavouriteTogglePending(prev => new Set([...prev, productId]));
    const isFav = favouriteProductIds.has(productId);
    // Optimistic update
    setFavouriteProductIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(productId); else next.add(productId);
      return next;
    });
    try {
      if (isFav) {
        await removeProductFavourite(productId);
        // Remove from grid if currently on favourites tab
        if (selectedCategory === 'favourites') {
          setPosProducts(prev => prev.filter(p => p.id !== productId));
        }
      } else {
        await addProductFavourite(productId);
      }
    } catch {
      // Revert optimistic update on failure
      setFavouriteProductIds(prev => {
        const next = new Set(prev);
        if (isFav) next.add(productId); else next.delete(productId);
        return next;
      });
    } finally {
      setFavouriteTogglePending(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, [favouriteProductIds, favouriteTogglePending, selectedCategory]);

  const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;
  const formatCurrencyStr = (amount) => `${activeCurrency} ${Number(amount || 0).toFixed(2)}`;

  const calculateDenominationTotal = (denom) => {
    return Object.entries(denom).reduce((total, [note, count]) => {
      return total + (parseFloat(note) * count);
    }, 0);
  };

  const getReportClosingDenominations = useCallback(() => {
    const raw = xReportData?.sessionInfo?.closingDenominationsJson
      || xReportData?.session?.closingDenominationsJson
      || currentSession?.closingDenominationsJson;
    if (!raw) return closingDenominations;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.warn('Unable to parse saved closing denominations', err);
    }
    return closingDenominations;
  }, [closingDenominations, currentSession?.closingDenominationsJson, xReportData?.sessionInfo?.closingDenominationsJson, xReportData?.session?.closingDenominationsJson]);

  // Hydrate Declaration & Card Settlement fields from the backend the first time a
  // session's report data loads (not on every refresh, so in-progress edits aren't
  // clobbered by a Refresh/modal-open re-fetch of the same session). Re-fires only
  // when the session id itself changes, so values never leak across sessions and
  // persisted values reappear correctly when an already-closed session is reopened.
  useEffect(() => {
    const sessId = xReportData?.session?.id;
    if (!sessId) return;
    const info = xReportData?.sessionInfo || {};
    setXReportCashierName(info.closingCashierName || xReportData?.session?.openedBy || '');
    setXReportSupervisorName(info.closingSupervisorName || '');
    setXReportClosingRemarks(info.closingRemarks || '');
    setXReportVarianceRemarks(info.varianceRemarks || '');
    setXReportCardBatchNo(info.cardBatchNo || '');
    setXReportCardVerified(!!info.cardSettlementVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xReportData?.session?.id]);

  useEffect(() => {
    const isActive = currentSession?.status === 'OPEN' || currentSession?.status === 'active';
    if (!isActive || !currentSession?.openedAt) {
      setSessionNowMs(Date.now());
      return undefined;
    }
    setSessionNowMs(Date.now());
    const timer = window.setInterval(() => setSessionNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentSession?.id, currentSession?.openedAt, currentSession?.status]);

  const handleStartSession = async () => {
    const total = calculateDenominationTotal(denominations);
    try {
      const terminalId = currentTerminal?.terminalId || `T001-${Date.now()}`;
      const counterName = currentTerminal?.counterName || 'Main Counter';
      const session = await openPosSession({ terminalId, counterName, openingCash: total });
      setCurrentSession(session);
      setXReportData(null);
      setZReportData(null);
      setSessionNowMs(Date.now());
    } catch (err) {
      // Previous day's session was left open/suspended — block silent continuation and
      // guide the user to close it instead of starting a new day on top of it (BBQA-5.3-013).
      const serverMsg = err?.response?.data?.message || err?.response?.data;
      if (err?.response?.status === 409 && typeof serverMsg === 'string' && serverMsg.includes('PREVIOUS_DAY_SESSION_OPEN')) {
        const cleanMsg = serverMsg.replace('PREVIOUS_DAY_SESSION_OPEN: ', '');
        // Message is built server-side as "Session #<id> on <date> (terminal <t>) is
        // still <status>..." (PosSessionService.openSession) — pull the id out so
        // "Go to Close Session" can load that exact stale session instead of landing
        // on whatever report happens to be cached (BBQA follow-up: previously this
        // button just switched views with no session loaded, so it silently showed
        // a stale/unrelated X-Report instead of the blocking session).
        const idMatch = cleanMsg.match(/Session #(\d+)/);
        setPrevDaySessionOpenId(idMatch ? Number(idMatch[1]) : null);
        setPrevDaySessionOpenMsg(cleanMsg);
        return;
      }
      // Do NOT fabricate a local session here — a fake `SES-<timestamp>` id is never
      // persisted server-side, so every downstream action (settle payment, session
      // totals, X/Z reports) later fails with "not a valid Long value" once it's sent
      // to an endpoint expecting the real numeric session id. Surface the real error
      // and let the cashier retry instead.
      console.error('Failed to open POS session', err);
      alert(err?.response?.data?.message || 'Failed to open POS session. Please try again.');
      return;
    }
    setShowStartSessionDialog(false);
    setCurrentView('touch-screen');
  };

  const handleCloseSession = async () => {
    if (currentSession) {
      if (currentSession.status === 'CLOSED') {
        setShowCloseSessionDialog(false);
        setCurrentView('x-report');
        return;
      }
      try {
        if (currentSession.id && typeof currentSession.id === 'number') {
          const closingTotal = calculateDenominationTotal(closingDenominations);
          const closed = await closePosSession(currentSession.id, {
            closingCash: closingTotal,
            closingDenominations,
            notes: xReportVarianceRemarks,
            cardBatchNo: xReportCardBatchNo,
            cardSettlementVerified: xReportCardVerified,
            closingCashierName: xReportCashierName,
            closingSupervisorName: xReportSupervisorName,
            closingRemarks: xReportClosingRemarks,
          });
          setCurrentSession(closed);
          // Arm the X-Report auto-print: the session is now closed & saved. The
          // x-report view mounts below and loadXReport() populates xReportData;
          // an effect fires the 80mm auto-print once that fresh data lands, so we
          // print exactly what the X-Report preview shows. Dedupe is keyed on the
          // session id so re-closing can't double-print.
          pendingXAutoPrintRef.current = currentSession.id;
        } else {
          setCurrentSession({ ...currentSession, status: 'CLOSED' });
        }
      } catch (err) {
        console.warn('Close session API error', err);
        // Close failed server-side — do NOT arm the auto-print (req: only print on
        // a successful operation). The local CLOSED flag is UI-only.
        setCurrentSession({ ...currentSession, status: 'CLOSED' });
      }
      setShowCloseSessionDialog(false);
      setSessionNowMs(Date.now());
      setCurrentView('x-report');
      syncPosData();
    }
  };

  // Keeps cardSettlementVerified (the flag actually persisted by handleCloseSession)
  // in sync with the terminal settlement amount typed into the Close Session modal's
  // Card Settlement tab, so a cashier who enters a matching settlement doesn't also
  // have to flip the legacy toggle on the X-Report page separately.
  useEffect(() => {
    if (!showCloseSessionDialog) return;
    const sessionCardTotal = Number(xReportData?.summary?.cardSales) || 0;
    const settled = parseFloat(cardSettlementAmount) || 0;
    const isSettled = cardSettlementAmount !== '' && Math.abs(settled - sessionCardTotal) < 0.01;
    setXReportCardVerified(isSettled);
  }, [cardSettlementAmount, showCloseSessionDialog, xReportData]);

  // Single entry point for opening the Close Session modal: always refreshes
  // xReportData first so the modal's Expected/Actual/Variance match the X-Report
  // page exactly, instead of relying on a possibly-stale cached xReportData.
  const openCloseSessionDialog = () => {
    if (currentSession?.status === 'active' || currentSession?.status === 'OPEN') {
      setCardSettlementAmount('');
      setShowCloseSessionDialog(true);
      loadXReport();
    }
  };

  // Returns { ok, reason }. Callers can surface `reason` when ok === false so
  // the cashier learns why an add was refused (one-batch-one-unit enforcement).
  const addToInvoice = (product, quantity = 1, pinnedBatchNumber = null, pinnedSerialNumber = null, pinnedExpiry = null) => {
    // A serialized unit is always qty 1 and never merges (a serial is unique by
    // definition). A pinned batch is also a single scanned physical unit.
    const isPinned = !!pinnedBatchNumber || !!pinnedSerialNumber;
    // In this system a batch/serial-controlled product is stored one-physical-
    // unit-per-batch-number. A grid add without a scanned batch therefore can't
    // legitimately bump quantity (each extra unit needs its own distinct batch).
    // We add a single qty-1 line and refuse to merge/re-add; extra units must be
    // scanned. Non-controlled products keep the normal merge-by-id behaviour.
    const isBatchControlled = !isPinned && (Boolean(product.isBatch) || Boolean(product.isSerial));
    const qtyToAdd = (pinnedSerialNumber || isBatchControlled) ? 1 : Math.max(1, Number(quantity) || 1);
    const unitPrice = toNumber(product.price, 0);

    // Block re-adding a batch-controlled product from the grid (its line already
    // holds one physical unit; another unit means another batch → must be scanned).
    if (isBatchControlled) {
      const already = (currentInvoiceRef.current?.items || [])
        .some(item => item.productId === product.id || item.id === product.id);
      if (already) {
        return { ok: false, reason: `${product.name} is batch-tracked — scan a specific batch to add another unit.` };
      }
    }

    setCurrentInvoice(prev => {
      // A pinned line (scanned batch or serial) represents one specific physical
      // unit, so it always gets its own cart row (with a composite id) and never
      // stacks onto an existing line. Batch-controlled grid lines also never merge.
      const existingItem = (isPinned || isBatchControlled)
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
        const pinKey = pinnedSerialNumber ? `S:${pinnedSerialNumber}` : pinnedBatchNumber;
        newItems = [{
          id: isPinned ? `${product.id}::${pinKey}` : product.id,
          productId: product.id,
          name: product.name,
          // Arabic name: the Product master persists it as `localName` (Jackson
          // serializes it under that key); `nameAr` kept as a fallback alias.
          nameAr: product.localName || product.nameAr || '',
          barcode: product.barcode || product.code || product.id,
          code: product.code || '',
          image: product.image || null,
          price: unitPrice,
          quantity: qtyToAdd,
          discount: toNumber(product.defaultDiscount, 0),
          taxRate: product.salesTax != null ? product.salesTax : toNumber(posSettings?.defaultTaxRate, 5),
          total: unitPrice * qtyToAdd * (1 - toNumber(product.defaultDiscount, 0) / 100),
          pinnedBatchNumber: pinnedBatchNumber || null,
          serialNumber: pinnedSerialNumber || null,
          expiryDate: pinnedExpiry || product.expiryDate || null,
          // Lock qty on batch/serial lines — each line is exactly one physical
          // unit. The cart UI disables +/- for lines flagged batchControlled.
          batchControlled: isPinned || isBatchControlled,
        }, ...prev.items];
      }

      return recalculateInvoice(newItems);
    });
    return { ok: true };
  };

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromInvoice(itemId);
      return;
    }

    // A batch/serial line is exactly one physical unit — its quantity is fixed.
    // Selling more means scanning more distinct batches, not bumping this line.
    const target = currentInvoiceRef.current?.items?.find(i => i.id === itemId);
    if (target?.batchControlled && newQuantity !== target.quantity) {
      showFeedback?.('error', 'Batch-tracked items are one unit per line — scan another batch to add more.');
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

  const handleHandoverSubmit = async () => {
    if (!handoverEmail) { setHandoverError('Enter supervisor email or username.'); return; }
    if (!handoverPassword) { setHandoverError('Enter supervisor password.'); return; }
    setHandoverBusy(true);
    setHandoverError('');
    try {
      const result = await verifySupervisorAuth({
        email: handoverEmail,
        password: handoverPassword,
        terminalId: currentTerminal?.terminalId || '',
        lockedBy: terminalLockedBy || '',
      });
      if (!result?.valid) {
        setHandoverError(result?.reason || 'Authorization failed. Please try again.');
        return;
      }
      setHandoverEmail('');
      setHandoverPassword('');
      setTerminalLockedBy(null);

      // Handover unlocks the terminal but the ongoing session (owned by the
      // previous cashier) still exists — resume it rather than falling through
      // to "Start Session".
      if (currentTerminal?.terminalId) {
        try {
          const active = await getActivePosSession(currentTerminal.terminalId);
          if (active?.id) setCurrentSession(active);
        } catch { /* no active session to resume */ }
      }

      showFeedback(
        `Shift handover authorized by ${result.supervisorName}. Terminal unlocked.`,
        'success'
      );
    } catch {
      setHandoverError('Could not verify credentials. Check connection and retry.');
    } finally {
      setHandoverBusy(false);
    }
  };

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

  // RemovalBehavior (VOID vs DELETE) governs how a *single* removed line is
  // treated: VOID keeps it struck-through so it carries onto the posted
  // invoice/receipt + audit log; DELETE drops it. Clearing the whole cart is a
  // different action — it abandons an un-posted sale outright. An un-posted cart
  // lives only in client state and produces no backend audit record, so there
  // is nothing to preserve by voiding every line (and doing so would strand the
  // cashier with un-clearable struck-through rows). Clear therefore always
  // empties; only the layaway-conversion case is gated behind approval because
  // it would dump reserved stock.
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
    // Delegate to voidFromInvoice — it already honors RemovalBehavior
    // (VOID vs DELETE), the supervisor-PIN gate, and the active-layaway
    // approval flow, so the action-bar Remove behaves like the per-line button.
    voidFromInvoice(itemId);
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
      taxInclusive: !!posSettings?.taxInclusive,
      defaultTaxRate: posSettings?.defaultTaxRate ?? 5,
    });
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    try {
      const payload = { ...(posSettings || {}), ...settingsDraft };
      console.log('SAVING POS SETTINGS PAYLOAD:', payload);
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

  // Tax mode (Exclusive/Inclusive + default VAT rate) is edited directly from the
  // POS Configure quick sidebar, independent of the Behavior tab's settingsDraft,
  // so it applies immediately without requiring a trip to Configure & customize.
  const patchTaxSettings = async (changes) => {
    const payload = { ...(posSettings || {}), ...changes };
    setPosSettings(payload);
    try {
      const saved = await savePosSettings(payload);
      setPosSettings(saved || payload);
    } catch (err) {
      console.warn('Failed to save POS tax settings', err);
    }
  };

  // markGenerated=true stamps this terminal as having completed its X-Report (the
  // deliberate "Generate X Report" action). The dashboard preview passes false so
  // merely viewing the dashboard never satisfies the Z-Report end-of-day gate.
  const loadXReport = async (markGenerated = false) => {
    if (!currentSession?.id || typeof currentSession.id !== 'number') return;
    setXReportLoading(true);
    try {
      const data = markGenerated
        ? await generatePosXReport(currentSession.id)
        : await getPosXReport(currentSession.id);
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
      // Backend blocks the day's report until every still-open terminal has run
      // its X-Report; surface the pending list instead of the report numbers.
      if (data && data.eligible === false) {
        setZReportPending(data.pendingTerminals || []);
        setZReportData(null);
      } else {
        setZReportPending(null);
        setZReportData(data);
      }
    } catch (err) {
      console.warn('Z-Report load failed', err);
    } finally {
      setZReportLoading(false);
    }
  };

  const handleCloseDay = async () => {
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    if (!branchId) return;
    try {
      setZReportLoading(true);
      const data = await closePosDay(branchId, zReportDate);
      setZReportData(data);
      // Day closed successfully → arm the Z-Report auto-print. The effect watching
      // zReportData fires the 80mm print once, keyed on the closed date so a repeat
      // Close Day can't double-print. Only reached on success (a failure throws to
      // the catch below and never arms this).
      pendingZAutoPrintRef.current = zReportDate;
      alert('Business day has been officially closed.');
    } catch (err) {
      const body = err?.response?.data;
      if (body?.code === 'RECONCILIATION_FAILED' && body?.breakdown) {
        setCloseDayVariance({ stage: body.stage, message: body.message, breakdown: body.breakdown });
      } else {
        alert(body?.message || 'Failed to close business day.');
      }
    } finally {
      setZReportLoading(false);
    }
  };

  const recalculateInvoice = (items, billDiscountAmount = 0) => {
    const activeItems = items.filter(i => !i.isVoided);
    // Global VAT mode: Inclusive means the entered price already contains VAT,
    // Exclusive means VAT is added on top. Fallback rate from POS settings.
    const taxInclusive = !!posSettings?.taxInclusive;
    const fallbackRate = toNumber(posSettings?.defaultTaxRate, 5);

    let subtotal = 0;       // net (ex-VAT) line value before line discount
    let totalDiscount = 0;  // line discount on the same net basis
    let tax = 0;            // extracted/added VAT after line discount

    activeItems.forEach(item => {
      const rate = toNumber(item.taxRate, fallbackRate) / 100;
      const disc = (item.discount || 0) / 100;
      const lineValue = item.price * item.quantity;
      // In inclusive mode the price carries VAT, so strip it to get the net base.
      const net = taxInclusive ? lineValue / (1 + rate) : lineValue;
      subtotal += net;
      totalDiscount += net * disc;
      tax += net * (1 - disc) * rate;
    });

    const total = Math.max(0, subtotal - totalDiscount - billDiscountAmount + tax);

    return { items, subtotal, totalDiscount, tax, total, billDiscountAmount, taxInclusive };
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
    // Shipping is an order-level charge, not a cart line — clear it with the cart.
    setShippingCharge(0);
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
        taxRate: toNumber(item.taxRate, toNumber(posSettings?.defaultTaxRate, 5)),
        batchNumber: item.isVoided ? null : (item.pinnedBatchNumber || null),
        serialNumber: item.isVoided ? null : (item.serialNumber || null),
        voided: !!item.isVoided,
      }));
  }, [posSettings?.voidMode, posSettings?.defaultTaxRate]);

  // ── Delivery ───────────────────────────────────────────────────────────────

  const loadDeliveryOrders = useCallback(async () => {
    const branchId = currentTerminal?.branchId || null;
    setDeliveryOrdersLoading(true);
    try {
      const data = await getDeliveryOrders(branchId);
      setDeliveryOrders(Array.isArray(data) ? data.map(inv => ({
        id: inv.id,
        customer: inv.customerName || 'Walk-in Customer',
        invoice: inv.invoiceNumber,
        mobile: '',
        person: inv.posDriverName || '',
        invoiceAmt: toNumber(inv.invoiceTotal) - toNumber(inv.deliveryCharge),
        deliveryCharge: toNumber(inv.deliveryCharge),
        paidAmt: toNumber(inv.amountPaid),
      })) : []);
    } catch (err) {
      console.warn('Failed to load delivery orders', err);
      setDeliveryOrders([]);
    } finally {
      setDeliveryOrdersLoading(false);
    }
  }, [currentTerminal?.branchId]);

  const loadDeliveryPersons = useCallback(async () => {
    setDeliveryPersonsLoading(true);
    try {
      const data = await getDeliveryPersons();
      setDeliveryPersons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load delivery persons', err);
      setDeliveryPersons([]);
    } finally {
      setDeliveryPersonsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDeliverySettleModal) {
      setDeliverySettleSearch('');
      setDeliverySettlePersonFilter('All Persons');
      setDeliverySettleSelected(null);
      setDeliverySettlePayMode('Cash');
      setDeliverySettleMixCash('');
      setDeliverySettleMixCard('');
      loadDeliveryOrders();
    }
  }, [showDeliverySettleModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showDeliveryModal) {
      loadDeliveryPersons();
      setDeliveryValidationErrors({});
    }
  }, [showDeliveryModal, loadDeliveryPersons]);

  const selectedDeliveryPerson = useMemo(
    () => deliveryPersons.find(person => String(person.employeeCode) === String(deliveryDriver)) || null,
    [deliveryPersons, deliveryDriver]
  );

  const validateDeliveryOrder = useCallback(() => {
    const errors = {};
    if (currentInvoice.items.length === 0) errors.items = 'Add at least one item before dispatching.';
    if (!deliveryCustomerId) errors.customer = 'Customer is required.';
    if (!deliveryAddress.trim()) errors.address = 'Delivery address is required.';
    if (!deliveryDate) errors.date = 'Delivery date is required.';
    if (!deliveryTimeSlot) errors.timeSlot = 'Time slot is required.';
    if (!deliveryDriver) errors.deliveryDriver = 'Assign a delivery person.';
    setDeliveryValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      alert('Please complete the required delivery details before sending the order out for delivery.');
      return false;
    }
    return true;
  }, [currentInvoice.items.length, deliveryAddress, deliveryCustomerId, deliveryDate, deliveryDriver, deliveryTimeSlot]);

  const handleOutForDelivery = useCallback(async () => {
    if (!validateDeliveryOrder()) return;
    setDeliveryOutLoading(true);
    try {
      const customer = deliveryCustomerId
        ? customerOptions.find(c => String(c.id) === String(deliveryCustomerId)) || { id: 'walk-in', name: deliveryNewName || 'Walk-in Customer', code: 'WALK-IN' }
        : { id: 'walk-in', name: deliveryNewName || 'Walk-in Customer', code: 'WALK-IN' };

      // Previous balance must be read BEFORE posCheckout posts this invoice below —
      // same reasoning as the main checkout flow. Nothing is collected at dispatch
      // time, so the full invoice (incl. delivery charge) becomes outstanding until
      // settled at delivery — the same accounting as a Credit sale.
      let creditPrevBalAuto = null;
      if (tplInvoiceShowBankDetails && customer?.id !== 'walk-in') {
        creditPrevBalAuto = 0;
        const custCodeForBalance = customer?.code || customer?.id;
        if (custCodeForBalance) {
          try {
            const cr = await posCreditBalance(custCodeForBalance);
            if (cr?.found && cr.outstanding != null) creditPrevBalAuto = parseFloat(cr.outstanding) || 0;
          } catch (_) { /* keep the 0 fallback so the section still renders */ }
        }
      }

      const payload = {
        customerCode: customer.id !== 'walk-in' ? (customer.code || customer.id) : 'WALK-IN',
        customerName: customer.name,
        paymentMode: 'Delivery',
        amountTendered: 0,
        cashAmount: 0,
        cardAmount: 0,
        sessionId: currentSession?.id || null,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        branchId: currentTerminal?.branchId || null,
        branchName: currentTerminal?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        shippingAddress: deliveryAddress,
        driverName: selectedDeliveryPerson?.name || null,
        deliveryPersonEmployeeCode: deliveryDriver || null,
        deliveryDate,
        deliveryTimeSlot,
        deliveryNotes: [
          deliveryDate ? `Date: ${deliveryDate}` : '',
          deliveryTimeSlot ? `Slot: ${deliveryTimeSlot}` : '',
          deliveryInstructions ? `Instructions: ${deliveryInstructions}` : '',
          deliveryNotes ? `Notes: ${deliveryNotes}` : ''
        ].filter(Boolean).join(' | ') || null,
        deliveryCharge: toNumber(deliveryCharge, 0) || null,
        items: cartItemsToPayload(currentInvoice.items),
      };

      const savedInvoice = await posCheckout(payload);

      try {
        if (tplInvoicePaper === 'A4') {
          const template = buildPosA4Template(tplInvoiceFooter, { showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes, showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner, colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt });
          const data = buildPosPrintData(savedInvoice, tplInvoiceFooter);
          const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
          printHtml(await generatePrintHtmlAsync(template, data, options));
        } else {
          const deliveryDueAmt = parseFloat(savedInvoice?.invoiceTotal || 0);
          const creditInvoiceCreditAuto = creditPrevBalAuto != null ? deliveryDueAmt : null;
          const creditAmountPaidAuto = creditPrevBalAuto != null ? 0 : null;
          const creditUpdatedBalanceAuto = creditPrevBalAuto != null
            ? creditPrevBalAuto + creditInvoiceCreditAuto - creditAmountPaidAuto
            : null;
          const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
            full: savedInvoice,
            customerNameOverride: (customer && customer.id !== 'walk-in') ? customer.name : null,
            customerPhone: customer?.phone,
            customerEmail: customer?.email,
            creditPreviousBalance: creditPrevBalAuto,
            creditInvoiceCredit: creditInvoiceCreditAuto,
            creditAmountPaid: creditAmountPaidAuto,
            creditUpdatedBalance: creditUpdatedBalanceAuto,
            // Delivery Order receipt (Out for Delivery): the goods are not yet paid
            // for — settlement happens later via Delivery Settle. Suppress the CREDIT
            // ACCOUNT block here so the receipt ends after the Customer section; the
            // block reappears on the Delivery Settlement receipt.
            showCreditBalanceOverride: false,
          });
          await printThermalReceiptWithConfiguredPrinter({
            full: savedInvoice,
            text,
            escPosBase64,
            title: `Delivery ${savedInvoice.invoiceNumber || ''}`.trim(),
          });
        }
      } catch (printErr) {
        console.warn('Out-for-delivery receipt print failed', printErr);
        alert(`Delivery order saved, but the receipt didn't print: ${printErr?.message || 'printer error'}.`);
      }

      setShowDeliveryModal(false);
      setInvoiceCounter(c => c + 1);
      clearInvoice();
      syncPosData();
      setDeliveryAddress('');
      setDeliveryNotes('');
      setDeliveryDriver('');
      setDeliveryCharge('');
      setDeliveryCustomerId('');
      setDeliveryNewName('');
      setDeliveryNewMobile('');
      setDeliveryNewEmail('');
      setDeliveryDate('');
      setDeliveryTimeSlot('');
      setDeliveryInstructions('');
      setDeliveryValidationErrors({});
    } catch (err) {
      console.error('Out for delivery failed', err);
      alert(err?.response?.data?.message || 'Failed to create delivery order. Please try again.');
    } finally {
      setDeliveryOutLoading(false);
    }
    // buildThermalReceiptArtifacts/printThermalReceiptWithConfiguredPrinter are
    // intentionally omitted here — they're declared further down in this component,
    // so referencing them in this array (evaluated immediately, before those consts
    // exist yet on this render pass) throws "Cannot access before initialization".
    // currentInvoice already forces this callback to be recreated on every cart
    // change, so it picks up their current values in practice regardless.
  }, [currentInvoice, deliveryAddress, deliveryCustomerId, deliveryDriver, deliveryDate, deliveryTimeSlot, deliveryInstructions,
    deliveryNotes, deliveryCharge, deliveryNewName, customerOptions, currentSession,
    currentTerminal, cartItemsToPayload, clearInvoice, selectedDeliveryPerson, validateDeliveryOrder,
    tplInvoiceShowBankDetails, tplInvoicePaper]);

  // Open the New Delivery Order dialog, pre-seeding the customer + default
  // address from whoever is already selected on the POS bill (a walk-in seeds
  // nothing). The cashier can still change either field in the dialog.
  const openDeliveryModal = useCallback(() => {
    setDeliveryModalTab('existing');
    const cust = selectedCustomerData;
    const isReal = cust && cust.id !== WALK_IN_CUSTOMER.id;
    if (isReal) {
      setDeliveryCustomerId(String(cust.id));
      if (cust.address) setDeliveryAddress(prev => (prev?.trim() ? prev : cust.address));
    } else {
      setDeliveryCustomerId('');
    }
    setShowDeliveryModal(true);
  }, [selectedCustomerData]);

  // ── Hold (persisted, session-scoped) ───────────────────────────────────────
  const sessionId = currentSession?.id && typeof currentSession.id === 'number' ? currentSession.id : null;

  const loadHeldSales = useCallback(async () => {
    if (!sessionId) { setHeldSales([]); return; }
    try {
      // A "Hold" is a zero-deposit layaway (hold=true). The quick-recall pills show
      // this session's open holds; full layaways live in the Layaways list.
      const branchId = currentTerminal?.branchId || currentSession?.branchId || null;
      const all = await getLayaways({ branchId, status: 'ACTIVE' });
      const holds = (all || [])
        .filter(l => l.hold === true && l.posSessionId === sessionId)
        .map(l => ({
          id: l.id,
          label: l.layawayNumber,
          total: l.saleTotal || 0,
          itemCount: (l.items || []).length,
          customerName: l.customerName,
        }));
      setHeldSales(holds);
    } catch (err) {
      console.warn('Held sales load failed', err);
    }
  }, [sessionId, currentTerminal, currentSession]);

  useEffect(() => { loadHeldSales(); }, [loadHeldSales]);

  const syncPosData = useCallback(async () => {
    if (productCacheRef.current) {
      productCacheRef.current.clear();
    }
    const controller = new AbortController();
    try {
      await Promise.allSettled([
        loadPosCustomers(),
        loadPosProducts(0, false, controller.signal),
        (currentSession?.status === 'active' || currentSession?.status === 'OPEN') ? loadXReport() : Promise.resolve(),
        loadHeldSales(),
      ]);
    } catch (err) {
      console.warn('POS data sync encountered an error:', err);
    }
  }, [loadPosCustomers, loadPosProducts, loadXReport, loadHeldSales, currentSession?.status]);

  // Hold = a zero-deposit layaway. Reuses the layaway reservation workflow (stock is
  // reserved, it shows in the Layaways list) but takes no deposit and allows Walk-in.
  const holdInvoice = async () => {
    if (currentInvoice.items.length === 0 || holdBusy) return;
    if (!sessionId) { alert('Open a POS session before holding a bill.'); return; }
    setHoldBusy(true);
    try {
      const isWalkIn = !selectedCustomerData || selectedCustomerData.id === WALK_IN_CUSTOMER.id;
      await createLayaway({
        hold: true,
        customerCode: isWalkIn ? 'WALK-IN' : (selectedCustomerData.code || selectedCustomerData.id),
        customerName: isWalkIn ? 'Walk-in Customer' : selectedCustomerData.name,
        customerPhone: isWalkIn ? null : (selectedCustomerData.phone || null),
        branchId: currentTerminal?.branchId || currentSession?.branchId || null,
        branchName: currentTerminal?.branchName || currentSession?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        sessionId,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        depositRequired: false,
        depositAmount: 0,
        reserveStockRequested: true,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        items: cartItemsToPayload(currentInvoice.items),
      });
      clearInvoice();
      await loadHeldSales();
      syncPosData();
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to hold the bill.');
    } finally {
      setHoldBusy(false);
    }
  };

  // Recall a held bill: load its hold-layaway back into the live cart for completion
  // (checkout marks the hold converted, releasing its reservation).
  const recallInvoice = async (id) => {
    try {
      await startLayawayConversion(id);
      await loadHeldSales();
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to recall the held bill.');
    }
  };

  // Delete a held bill: cancel the underlying layaway (releases reserved stock)
  // and refresh the held-sales list so the pill disappears.
  const deleteHeldBill = (id) => {
    const heldBill = heldSales.find(h => h.id === id);
    setConfirmAction({
      title: 'Delete Held Bill',
      message: `Delete ${heldBill?.label || 'this held bill'}? Reserved stock will be released.`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, busy: true }));
        try {
          await cancelLayaway(id);
          await loadHeldSales();
          syncPosData();
          setConfirmAction(null);
        } catch (err) {
          const status = err?.response?.status;
          setConfirmAction(prev => ({
            ...prev, busy: false,
            error: status === 403
              ? 'You do not have permission to delete a held bill (supervisor required).'
              : (err?.response?.data?.message || 'Failed to delete held bill.'),
          }));
        }
      },
    });
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

  // Keep the reprint preview's Credit Account section in sync with the selected
  // invoice — mirrors the credit lookup done at actual print time so the on-screen
  // preview doesn't silently omit the customer's balance.
  useEffect(() => {
    const inv = reprintInvoices.find(i => i.invoiceNumber === reprintSelectedInvoice);
    const isWalkIn = !inv?.customerName || inv.customerName === 'Walk-in Customer';
    if (!tplInvoiceShowBankDetails || !inv || isWalkIn || !inv.customerCode) {
      setReprintPreviewCredit(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cr = await posCreditBalance(inv.customerCode);
        if (!cancelled) setReprintPreviewCredit(cr?.found ? { previousBalance: cr.outstanding ?? 0 } : null);
      } catch (_) {
        if (!cancelled) setReprintPreviewCredit(null);
      }
    })();
    return () => { cancelled = true; };
  }, [reprintSelectedInvoice, reprintInvoices, tplInvoiceShowBankDetails]);

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
        try {
          const layawayHtmlOpts = {
            companyName: tplOutletName,
            trn: tplOutletTrn,
            header: tplReceiptHeader,
            footer: tplReceiptFooter,
            showTrn: tplReceiptShowTrn,
          };
          if (tplReceiptPaper === 'A4') {
            printHtml(buildLayawayReceiptHtml(tplReceiptPaper, saved, layawayHtmlOpts), { fast: true });
          } else {
            const printer = resolvePrinterForContext(printerConfigs, {
              deviceType: 'RECEIPT_PRINTER',
              branchId: saved.branchId || currentTerminal?.branchId || null,
              terminalId: currentTerminal?.terminalId || null,
            });
            if (!printer) {
              notifyPrintFallback('No receipt printer is configured for this terminal — the layaway was saved, but the slip did not print. Set one up in Settings → Devices.');
            } else {
              try {
                const layawayText = buildLayawayReceiptText(tplReceiptPaper, saved, layawayHtmlOpts);
                const escPosBase64 = buildEscPosFromPlainTextBase64(layawayText, tplReceiptPaper);
                await sendEscPosReceiptToConfiguredPrinter(printer, { dataBase64: escPosBase64, receiptText: layawayText, title: `Layaway ${saved.layawayNumber || ''}`.trim() });
              } catch (err) {
                console.warn('ESC/POS print failed for layaway receipt', err);
                notifyPrintFallback(`The layaway was saved, but the slip didn't print: ${err?.message || 'printer error'}.`);
              }
            }
          }
        } catch { /* print is best-effort */ }
      }
      clearInvoice();
      syncPosData();
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
        serialNumber: it.serialNumber || null,
        expiryDate: it.expiryDate || null,
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

  const handleCancelLayaway = (layawayId) => {
    const lay = (layawaysList || []).find(l => l.id === layawayId);
    setConfirmAction({
      title: 'Cancel Layaway',
      message: `Cancel ${lay?.layawayNumber || 'this layaway'}? Reserved stock will be released.`,
      onConfirm: async () => {
        setConfirmAction(prev => ({ ...prev, busy: true }));
        setLayawayBusyId(layawayId);
        try {
          await cancelLayaway(layawayId);
          if (selectedLayawayId === layawayId) setSelectedLayawayId(null);
          await loadLayaways();
          syncPosData();
          setConfirmAction(null);
        } catch (err) {
          const status = err?.response?.status;
          setConfirmAction(prev => ({
            ...prev, busy: false,
            error: status === 403
              ? 'You do not have permission to cancel a layaway (supervisor required).'
              : (err?.response?.data?.message || 'Failed to cancel layaway.'),
          }));
        } finally {
          setLayawayBusyId(null);
        }
      },
    });
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

  const loadPrinterConfigs = useCallback(async (branchIdOverride = null) => {
    const fallbackBranchId = sessionStorage.getItem('activeBranchId');
    const branchId = branchIdOverride
      ?? currentTerminal?.branchId
      ?? (fallbackBranchId && fallbackBranchId !== 'ALL' ? Number(fallbackBranchId) : null);
    if (!branchId) {
      setPrinterConfigs([]);
      return;
    }
    setPrintersLoading(true);
    try {
      const data = await getPosPrinters({ branchId });
      setPrinterConfigs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load POS printers', err);
      setPrinterConfigs([]);
    } finally {
      setPrintersLoading(false);
    }
  }, [currentTerminal?.branchId]);

  useEffect(() => {
    loadPrinterConfigs();
  }, [loadPrinterConfigs]);

  const scannerStorageKey = useMemo(() => buildPosScannerStorageKey(
    currentTerminal?.branchId ?? null,
    currentTerminal?.terminalId ?? null,
  ), [currentTerminal?.branchId, currentTerminal?.terminalId]);

  useEffect(() => {
    const fallback = createDefaultScannerConfig();
    if (!scannerStorageKey) {
      setScannerConfig(fallback);
      return;
    }
    try {
      const raw = localStorage.getItem(scannerStorageKey);
      if (!raw) {
        setScannerConfig(fallback);
        return;
      }
      const parsed = JSON.parse(raw);
      setScannerConfig({
        ...fallback,
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
      });
    } catch (err) {
      console.warn('Failed to load scanner config', err);
      setScannerConfig(fallback);
    }
  }, [createDefaultScannerConfig, scannerStorageKey]);

  const saveScannerConfig = useCallback((nextConfig) => {
    const fallback = createDefaultScannerConfig();
    const payload = {
      ...fallback,
      ...(nextConfig && typeof nextConfig === 'object' ? nextConfig : {}),
      branchId: currentTerminal?.branchId ?? null,
      branchName: currentTerminal?.branchName ?? '',
      terminalId: currentTerminal?.terminalId ?? null,
      terminalName: currentTerminal?.terminalName ?? '',
      counterName: currentTerminal?.counterName ?? '',
      savedAt: new Date().toISOString(),
    };
    setScannerConfig(payload);
    if (scannerStorageKey) {
      localStorage.setItem(scannerStorageKey, JSON.stringify(payload));
    }
    setScannerConfigSavedFlash(true);
    window.setTimeout(() => setScannerConfigSavedFlash(false), 1600);
    return payload;
  }, [
    createDefaultScannerConfig,
    currentTerminal?.branchId,
    currentTerminal?.branchName,
    currentTerminal?.counterName,
    currentTerminal?.terminalId,
    currentTerminal?.terminalName,
    scannerStorageKey,
  ]);

  const buildThermalReceiptArtifacts = useCallback(async ({
    full: fullArg,
    isReprint = false,
    cashGiven = null,
    changeAmount = null,
    mixedCashGiven = null,
    mixedCardGiven = null,
    mixedCardType = null,
    customerNameOverride = null,
    customerPhone = null,
    customerEmail = null,
    creditPreviousBalance = null,
    creditInvoiceCredit = null,
    creditAmountPaid = null,
    creditUpdatedBalance = null,
    cashierNameOverride = null,
    depositApplied = null,
    balanceDue = null,
    shippingCharge = null,
    // Per-call override of the CREDIT ACCOUNT block visibility. Normally the block
    // follows the tplInvoiceShowBankDetails template toggle, but specific workflows
    // pin it: a Delivery Order print (Out for Delivery) hides it (null → suppressed),
    // while a Delivery Settlement print shows it. null = defer to template toggle.
    showCreditBalanceOverride = null,
  }) => {
    const resolvedShowCreditBalance = showCreditBalanceOverride != null
      ? showCreditBalanceOverride
      : tplInvoiceShowBankDetails;
    // Customer name (client item 3): the printed receipt must show the SAME
    // customer the checkout preview shows. The preview reads the selected customer
    // object directly (customer.name), while the print path was reading it off the
    // round-tripped backend invoice — which reads "Walk-in Customer" whenever the
    // saved customerName came back blank. When the caller passes the live selected
    // name, override it onto a shallow copy so BOTH the ESC/POS and HTML builders
    // (which read invoice.customerName) print the real customer, not "Walk-in".
    const full = (customerNameOverride && customerNameOverride.trim())
      ? { ...fullArg, customerName: customerNameOverride.trim() }
      : fullArg;
    const qrContent = buildQrContent(buildPosPrintData(full, tplInvoiceFooter), tplOutletName);

    // The QR *image* (for the HTML/browser path) and the ESC/POS build (which only
    // needs the raw qrContent *string* — the printer renders its own QR natively, and
    // dithers the logo raster if any) are independent of each other. Running them
    // concurrently instead of one-after-the-other roughly halves the wait before the
    // preferred, fastest print path (ESC/POS, no OS print dialog at all) is ready.
    // QR image is needed when the ACTIVE template's QR toggle is on — Template 2
    // has its own (t2ShowQRCode); Template 1 uses the invoice toggle.
    const qrToggleOn = receiptTemplateId === 'billbull-ar' ? t2ShowQRCode : tplInvoiceShowQRCode;
    const qrDataUrlPromise = qrToggleOn
      ? QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'L', width: 160, margin: 1 })
      : Promise.resolve(null);
    const escPosOpts = {
      companyName: tplOutletName,
      trn: tplOutletTrn,
      header: tplInvoiceHeader,
      footer: tplInvoiceFooter,
      showTrn: tplInvoiceShowTrn,
      isReprint,
      logoDataUrl: tplLogoDataUrl,
      showLogo: tplInvoiceShowLogo,
      showCompanyDetails: tplInvoiceShowCompanyDetails,
      outletAddress: tplOutletAddress,
      outletPhone: tplOutletPhone,
      showServiceCharge: tplInvoiceShowGrandTotalBanner,
      showVatSummary: tplInvoiceColVatAmt,
      showPaymentDetails: tplInvoiceColDiscount,
      showQRCode: tplInvoiceShowQRCode,
      qrContent: tplInvoiceShowQRCode ? qrContent : null,
      // Social/stamp image + placement — same values the HTML preview below gets,
      // so a merchant-uploaded social image prints (and suppresses the QR) on the
      // ESC/POS path too, honouring the configured before/after-footer placement.
      stampDataUrl: tplInvoiceShowQRCode ? tplStampDataUrl : null,
      qrPlacement: tplInvoiceQrPlacement,
      showCustomerDetails: tplInvoiceShowCustomerDetails,
      showFooterText: tplInvoiceShowTerms,
      cashierName: cashierNameOverride || cashierDisplayName,
      terminalId: full.posTerminalId || currentTerminal?.terminalId,
      counterName: full.posCounterName || currentTerminal?.counterName,
      // Template 2 (bilingual canvas) reads these extras; Template 1's ESC/POS
      // builder ignores them, so it's safe to always pass them on the shared bag.
      branchName: full.branchName || currentTerminal?.branchName || currentSession?.branchName || '',
      saleType: full.salesType || full.saleType || '',
      showBarcode: tplReceiptShowBarcode !== false,
      showLoyaltyPoints: tplInvoiceShowNotes,
      deliveryAddress: full.shippingAddress || null,
      cashGiven,
      changeAmount,
      mixedCashGiven,
      mixedCardGiven,
      mixedCardType,
      depositApplied,
      balanceDue,
      shippingCharge,
      customerPhone,
      customerEmail,
      showCreditBalance: resolvedShowCreditBalance,
      creditPreviousBalance,
      creditInvoiceCredit,
      creditAmountPaid,
      creditUpdatedBalance,
      currency: activeCurrency,
    };

    // Template 2 (Arabic/bilingual) carries its OWN independent Show/Hide
    // toggles. When it's the active template, override the shared opts bag's
    // toggle flags with the t2* values so the real checkout print honours the
    // Template 2 designer settings — not Template 1's invoice toggles. These
    // keys are consumed by the bilingual canvas renderer (ESC/POS) and, below,
    // by mapToTemplate2Data (HTML fallback).
    const t2Toggles = {
      showLogo: t2ShowLogo, showCompanyDetails: t2ShowCompanyDetails, showTrn: t2ShowTrn,
      showArabic: t2ShowArabic, showCustomerDetails: t2ShowCustomerDetails,
      showAccountBalance: t2ShowAccountBalance, showDelivery: t2ShowDelivery,
      showVatSummary: t2ShowVatSummary, showPaymentDetails: t2ShowPaymentDetails,
      showLoyalty: t2ShowLoyalty, showQRCode: t2ShowQRCode,
      showFooterText: t2ShowFooterText, showBarcode: t2ShowBarcode,
    };
    if (receiptTemplateId === 'billbull-ar') {
      escPosOpts.showLogo = t2ShowLogo;
      escPosOpts.showCompanyDetails = t2ShowCompanyDetails;
      escPosOpts.showTrn = t2ShowTrn;
      escPosOpts.showArabic = t2ShowArabic;
      escPosOpts.showCustomerDetails = t2ShowCustomerDetails;
      escPosOpts.showVatSummary = t2ShowVatSummary;
      escPosOpts.showPaymentDetails = t2ShowPaymentDetails;
      escPosOpts.showLoyaltyPoints = t2ShowLoyalty;
      escPosOpts.showDelivery = t2ShowDelivery;
      escPosOpts.showFooterText = t2ShowFooterText;
      escPosOpts.showBarcode = t2ShowBarcode;
      escPosOpts.showQRCode = t2ShowQRCode;
      escPosOpts.qrContent = t2ShowQRCode ? qrContent : null;
      escPosOpts.stampDataUrl = t2ShowQRCode ? tplStampDataUrl : null;
      // Account Balance section is data-gated (showCreditBalance) — respect the
      // T2 toggle on top of the existing credit-block resolution.
      escPosOpts.showCreditBalance = resolvedShowCreditBalance && t2ShowAccountBalance;
    }
    // Whichever template is SAVED in Print Templates (Template 1 "native" vs
    // Template 2 "billbull-ar") drives the actual checkout print — not just the
    // designer's own Test Print. Both builders share the same
    // (paperSize, invoice, opts) signature, so this is a straight swap.
    const activeReceiptTemplate = getReceiptTemplate(receiptTemplateId);
    const buildReceiptEscPosBase64 = activeReceiptTemplate.buildEscPosBase64 || buildEscPosReceiptBase64;
    const escPosPromise = buildReceiptEscPosBase64(tplInvoicePaper, full, escPosOpts).catch((err) => {
      console.warn('ESC/POS receipt build failed, will fall back to text/HTML print', err);
      return null;
    });

    const [qrDataUrl, escPosBase64] = await Promise.all([qrDataUrlPromise, escPosPromise]);

    // Template 2 (Arabic/bilingual) uses its own HTML renderer for the browser
    // print-preview / fallback path — same swap the ESC/POS build above already
    // makes, so a fallback print (or reprint) still matches the saved template.
    const html = receiptTemplateId === 'billbull-ar'
      ? buildTemplate2Html(mapToTemplate2Data(
          {
            name: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone,
            logoDataUrl: tplLogoDataUrl,
            // Real ZATCA QR (image) when QR is enabled AND no stamp is uploaded;
            // an uploaded stamp replaces the QR (same rule as Template 1). Kept
            // separate so the component prints a genuine verifiable QR, not the
            // stamp image mislabelled as a QR. Gated by Template 2's own QR toggle.
            qrDataUrl: t2ShowQRCode && !tplStampDataUrl ? qrDataUrl : null,
            stampDataUrl: t2ShowQRCode ? tplStampDataUrl : null,
            footerText: tplInvoiceFooter,
          },
          mapInvoiceToTxn(full, {
            ...escPosOpts,
            // Account Balance is data-gated on showCreditBalance in the mapper;
            // the T2 toggle is already folded into escPosOpts.showCreditBalance.
            cashierName: cashierNameOverride || cashierDisplayName,
            terminalId: full.posTerminalId || currentTerminal?.terminalId,
          }),
          t2Toggles,
        ))
      : buildThermalReceiptHtml(tplInvoicePaper, full, {
      companyName: tplOutletName,
      trn: tplOutletTrn,
      header: tplInvoiceHeader,
      footer: tplInvoiceFooter,
      showTrn: tplInvoiceShowTrn,
      isReprint,
      zatcaQrDataUrl: qrDataUrl,
      logoDataUrl: tplLogoDataUrl,
      stampDataUrl: tplInvoiceShowQRCode ? tplStampDataUrl : null,
      showLogo: tplInvoiceShowLogo,
      showCompanyDetails: tplInvoiceShowCompanyDetails,
      outletAddress: tplOutletAddress,
      outletPhone: tplOutletPhone,
      showServiceCharge: tplInvoiceShowGrandTotalBanner,
      showVatSummary: tplInvoiceColVatAmt,
      showPaymentDetails: tplInvoiceColDiscount,
      showQRCode: tplInvoiceShowQRCode,
      showCustomerDetails: tplInvoiceShowCustomerDetails,
      showLoyaltyPoints: tplInvoiceShowNotes,
      showCreditBalance: resolvedShowCreditBalance,
      showFooterText: tplInvoiceShowTerms,
      cashierName: cashierNameOverride || cashierDisplayName,
      terminalId: full.posTerminalId || currentTerminal?.terminalId,
      counterName: full.posCounterName || currentTerminal?.counterName,
      cashGiven,
      changeAmount,
      mixedCashGiven,
      mixedCardGiven,
      mixedCardType,
      depositApplied,
      balanceDue,
      shippingCharge,
      customerPhone,
      customerEmail,
      deliveryAddress: full.shippingAddress || null,
      creditPreviousBalance,
      creditInvoiceCredit,
      creditAmountPaid,
      creditUpdatedBalance,
      currency: activeCurrency,
      qrPlacement: tplInvoiceQrPlacement,
    });
    const text = buildThermalReceiptText(tplInvoicePaper, full, {
      companyName: tplOutletName,
      trn: tplOutletTrn,
      header: tplInvoiceHeader,
      footer: tplInvoiceFooter,
      showTrn: tplInvoiceShowTrn,
      cashierName: cashierNameOverride || cashierDisplayName,
      terminalId: full.posTerminalId || currentTerminal?.terminalId,
      counterName: full.posCounterName || currentTerminal?.counterName,
      cashGiven,
      changeAmount,
      depositApplied,
      balanceDue,
      shippingCharge,
      customerPhone,
      customerEmail,
      showCustomerDetails: tplInvoiceShowCustomerDetails,
      currency: activeCurrency,
    });
    return { html, text, escPosBase64 };
  }, [
    activeCurrency, cashierDisplayName, currentTerminal?.counterName, currentTerminal?.terminalId,
    tplInvoiceColDiscount, tplInvoiceColVatAmt, tplInvoiceFooter, tplInvoiceHeader, tplInvoicePaper,
    tplInvoiceQrPlacement, tplInvoiceShowBankDetails, tplInvoiceShowCompanyDetails, tplInvoiceShowCustomerDetails,
    tplInvoiceShowGrandTotalBanner, tplInvoiceShowLogo, tplInvoiceShowNotes, tplInvoiceShowQRCode,
    tplInvoiceShowStamp, tplInvoiceShowTerms, tplInvoiceShowTrn, tplLogoDataUrl, tplOutletAddress,
    tplOutletName, tplOutletPhone, tplOutletTrn, tplStampDataUrl, receiptTemplateId,
    tplReceiptShowBarcode, currentTerminal?.branchName, currentSession?.branchName,
    t2ShowLogo, t2ShowCompanyDetails, t2ShowTrn, t2ShowArabic, t2ShowCustomerDetails, t2ShowAccountBalance, t2ShowDelivery,
    t2ShowVatSummary, t2ShowPaymentDetails, t2ShowLoyalty, t2ShowQRCode, t2ShowFooterText, t2ShowBarcode,
  ]);

  // ESC/POS-first: raw ESC/POS is the only path with real density/heat/font/
  // logo control, so it's always attempted first. If the Windows queue's driver
  // rejects the raw job (v4/WSD-class drivers refuse datatype RAW), the agent
  // layer falls back to the text/GDI path so the customer still gets a receipt —
  // and that downgrade is surfaced as a visible amber "compatibility mode" toast
  // (never silent), telling the operator to install the vendor or Generic/
  // Text-Only driver. A missing printer or a send that fails in BOTH modes still
  // throws. notifyPrintFallback reports hard failures via the dismissible toast.
  const notifyPrintFallback = useCallback((message) => {
    setPrintFeedback({ type: 'error', message });
    setTimeout(() => setPrintFeedback(null), 6000);
  }, []);

  const printThermalReceiptWithConfiguredPrinter = useCallback(async ({
    full,
    text,
    escPosBase64,
    title = 'BillBull POS Receipt',
  }) => {
    const printer = resolvePrinterForContext(printerConfigs, {
      deviceType: 'RECEIPT_PRINTER',
      branchId: full.branchId || currentTerminal?.branchId || null,
      terminalId: full.posTerminalId || currentTerminal?.terminalId || null,
    });
    if (!printer) {
      throw new Error('No receipt printer is configured for this terminal. Set one up in Settings → Devices.');
    }
    if (!escPosBase64) {
      throw new Error('Could not build the ESC/POS receipt for this sale.');
    }
    const result = await sendEscPosReceiptToConfiguredPrinter(printer, { dataBase64: escPosBase64, receiptText: text, title });
    if (result?.fallbackUsed) {
      setPrintFeedback({
        type: 'warning',
        message: `Receipt printed in text compatibility mode — "${printer.deviceName || printer.systemPrinterName}" rejected raw ESC/POS (${result.escPosError || 'driver error'}). Install the printer's vendor driver or "Generic / Text Only" for full print quality.`,
      });
      setTimeout(() => setPrintFeedback(null), 10000);
      return { mode: 'agent-text-fallback', printer };
    }
    return { mode: 'agent-escpos', printer };
  }, [currentTerminal?.branchId, currentTerminal?.terminalId, printerConfigs]);

  const processPayment = async () => {
    if (currentInvoice.items.length === 0 || checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    // Freeze the A4 preview on its current render BEFORE we touch the cart, so the
    // clearInvoice()/phase-switch below can't tear the live iframe src out from
    // under React (the removeChild crash). Snapshot the latest html into the ref
    // in case the memo hasn't run yet this render.
    if (checkoutThermalHtml) checkoutPreviewFreezeRef.current = checkoutThermalHtml;
    setCheckoutSettling(true);
    try {
      // Shipping is an untaxed flat add on top of the product total (not a cart line).
      const shippingChargeNum = Number(shippingCharge) || 0;
      const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
      const tenderedNum = parseFloat(tenderedAmount) || 0;
      const mixedCashNum = parseFloat(mixedCashAmount) || 0;
      const mixedCardNum = parseFloat(mixedCardAmount) || 0;
      const depositSnapshot = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
      const effectiveDueAmt = Math.max(0, grandTotal - depositSnapshot);
      // Partial receipt against a Credit sale — the amount collected now (if any);
      // the remainder posts to the customer's receivable balance.
      const creditReceivedNum = checkoutPayMode === 'credit'
        ? Math.min(parseFloat(checkoutCreditReceivedAmount) || 0, effectiveDueAmt)
        : 0;

      // Build payment mode string
      let paymentMode = checkoutPayMode === 'cash' ? 'Cash'
        : checkoutPayMode === 'card' ? (checkoutCardType || 'Card')
          : checkoutPayMode === 'credit' ? 'Credit'
            : checkoutPayMode === 'online' ? 'Online'
              : 'Cash + Card';
      let combinedPaymentMode = checkoutPayMode === 'mixed' ? `Cash + ${mixedCardType || 'Card'}` : null;
      let amountTendered = checkoutPayMode === 'cash' ? tenderedNum
        : checkoutPayMode === 'card' ? grandTotal
          : checkoutPayMode === 'credit' ? creditReceivedNum
            : checkoutPayMode === 'online' ? grandTotal
              : mixedCashNum + mixedCardNum;

      // Selected bank account — for Online mode, or a Credit sale's partial receipt
      // when it was collected Online/Bank — formatted "{code} - {name}" so the
      // backend's resolveSelectedPaymentAccount() can resolve it to the exact
      // Chart-of-Accounts row for GL posting + reconciliation.
      const selectedOnlineAccount = checkoutPayMode === 'online'
        ? checkoutOnlineBankAccounts.find(a => String(a.id) === String(checkoutOnlineBankAccountId))
        : (checkoutPayMode === 'credit' && (checkoutCreditReceivedMode === 'Online' || checkoutCreditReceivedMode === 'Bank'))
          ? checkoutOnlineBankAccounts.find(a => String(a.id) === String(checkoutCreditReceivedBankAccountId))
          : null;
      const bankAccountName = selectedOnlineAccount
        ? `${selectedOnlineAccount.code || selectedOnlineAccount.accountCode || ''} - ${selectedOnlineAccount.name}`.trim()
        : null;

      // Layaway conversion: the deposit was collected at layaway creation (not yet
      // posted), so it's pre-credited here as already-paid tender. The cashier only
      // collects the remaining balance now; recorded payment = deposit + balance.
      if (activeLayawayId && activeLayawayDeposit > 0) {
        amountTendered += activeLayawayDeposit;
      }

      const customer = selectedCustomerData;

      // Credit account "Previous Balance" must be read BEFORE posCheckout() posts
      // this invoice below — otherwise the lookup returns the balance AFTER this
      // sale was added to the ledger, which is the Updated Balance, not Previous.
      let creditPrevBalAuto = null;
      if (tplInvoiceShowBankDetails && customer?.id !== 'walk-in') {
        creditPrevBalAuto = 0;
        const custCodeForBalance = customer?.code || customer?.id;
        if (custCodeForBalance) {
          try {
            const cr = await posCreditBalance(custCodeForBalance);
            if (cr?.found && cr.outstanding != null) creditPrevBalAuto = parseFloat(cr.outstanding) || 0;
          } catch (_) { /* keep the 0 fallback so the section still renders */ }
        }
      }

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
          taxRate: toNumber(item.taxRate, toNumber(posSettings?.defaultTaxRate, 5)),
          batchNumber: item.isVoided ? null : (item.pinnedBatchNumber || null),
          serialNumber: item.isVoided ? null : (item.serialNumber || null),
          voided: !!item.isVoided,
        }));

      const payload = {
        customerCode: customer.id !== 'walk-in' ? (customer.code || customer.id) : 'WALK-IN',
        customerName: customer.name,
        paymentMode,
        combinedPaymentMode,
        amountTendered,
        cashAmount: checkoutPayMode === 'mixed' ? mixedCashNum
          : checkoutPayMode === 'cash' ? amountTendered
            : (checkoutPayMode === 'credit' && checkoutCreditReceivedMode === 'Cash') ? creditReceivedNum
              : 0,
        cardAmount: checkoutPayMode === 'mixed' ? mixedCardNum
          : checkoutPayMode === 'card' ? grandTotal
            : (checkoutPayMode === 'credit' && checkoutCreditReceivedMode === 'Card') ? creditReceivedNum
              : 0,
        onlineAmount: (checkoutPayMode === 'credit' && (checkoutCreditReceivedMode === 'Online' || checkoutCreditReceivedMode === 'Bank'))
          ? creditReceivedNum : 0,
        cardReference: checkoutPayMode === 'credit' ? (checkoutCreditReceivedRef || null)
          : checkoutPayMode === 'online' ? (checkoutOnlineReference || null)
            : (checkoutCardRef || null),
        cardType: checkoutPayMode === 'credit' ? (checkoutCreditReceivedCardType || null) : (checkoutCardType || mixedCardType || null),
        bankAccountName,
        sessionId: currentSession?.id || null,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        branchId: currentTerminal?.branchId || null,
        branchName: currentTerminal?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        shippingAddress: deliveryAddress || shippingAddress || null,
        shippingCharge: shippingChargeNum > 0 ? shippingChargeNum : null,
        taxInclusive: !!posSettings?.taxInclusive,
        driverName: (deliveryDriver && deliveryDriver !== 'Unassigned') ? deliveryDriver : null,
        deliveryNotes: deliveryNotes || null,
        items,
      };

      // ── PAYMENT CONFIRMED HERE ────────────────────────────────────────────
      // posCheckout resolving is the backend's authoritative confirmation that
      // the sale posted (GL, stock, receivable all committed). Everything below
      // — cash drawer, receipt printing, layaway conversion — is a post-success
      // side-effect that does NOT gate whether the payment succeeded. So we show
      // the success screen the moment this resolves and run those side-effects in
      // the background, instead of making the cashier wait on the printer round-
      // trip (the bulk of the old 3–5 s). No false success: this only runs after
      // the await above resolves; a rejection skips straight to catch().
      const savedInvoice = await posCheckout(payload);

      const changeDue = checkoutPayMode === 'cash' ? Math.max(0, tenderedNum - effectiveDueAmt) : 0;

      // Credit account posting for THIS invoice — same formula for every payment
      // mode: Invoice Credit is the invoice's due amount (net of any layaway deposit
      // already collected), Amount Paid is what was actually received against it now.
      // A fully-settled cash/card/online/mixed sale nets to 0 (balance unchanged);
      // an unpaid or partially-paid Credit sale carries the remainder forward.
      const creditAppliedAmount = checkoutPayMode === 'credit' ? creditReceivedNum : effectiveDueAmt;
      const creditInvoiceCreditAuto = creditPrevBalAuto != null ? effectiveDueAmt : null;
      const creditAmountPaidAuto = creditPrevBalAuto != null ? creditAppliedAmount : null;
      const creditUpdatedBalanceAuto = creditPrevBalAuto != null
        ? creditPrevBalAuto + creditInvoiceCreditAuto - creditAmountPaidAuto
        : null;

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
            : checkoutPayMode === 'credit' ? creditReceivedNum
              : effectiveDueAmt,
        creditBalance: checkoutPayMode === 'credit' ? Math.max(0, effectiveDueAmt - creditReceivedNum) : 0,
        // Snapshotted here so the "Print Receipt" / "Last Receipt" reprint actions
        // (which reuse lastPaidInvoice) show the same correct figures instead of
        // re-querying the customer's balance, which by then already reflects this
        // invoice and would be mislabeled as "previous".
        creditPreviousBalance: creditPrevBalAuto,
        creditInvoiceCredit: creditInvoiceCreditAuto,
        creditAmountPaid: creditAmountPaidAuto,
        creditUpdatedBalance: creditUpdatedBalanceAuto,
      };

      // Snapshot everything the background finalize needs into locals BEFORE the
      // state resets below wipe the React state it was reading from (customer,
      // amounts, layaway id). savedInvoice/paid/changeDue etc. are already locals.
      const layawayIdSnapshot = activeLayawayId;
      const cashTaken = checkoutPayMode === 'cash' || (checkoutPayMode === 'mixed' && mixedCashNum > 0)
        || (checkoutPayMode === 'credit' && checkoutCreditReceivedMode === 'Cash' && creditReceivedNum > 0);
      const printPaper = tplInvoicePaper;

      // ── Show success immediately, then finalize in the background ───────────
      // The payment is already confirmed (posCheckout resolved). Commit the
      // success state + clear the cart NOW so the cashier sees "Payment Complete"
      // without waiting on the printer. checkoutFinalizing drives the subtle
      // "Printing receipt…" indicator on the complete screen until printing ends.
      setLastPaidInvoice(paid);
      setCheckoutFinalizing(true);
      setInvoiceCounter(c => c + 1);
      clearInvoice();
      syncPosData();
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
      setCheckoutOnlineBankAccountId('');
      setCheckoutOnlineReference('');
      setCheckoutRemarks('');
      setCheckoutCreditCustomer(null);
      setCheckoutCreditCustomerSearch('');
      setCheckoutCreditReceivedMode('');
      setCheckoutCreditReceivedAmount('');
      setCheckoutCreditReceivedCardType('');
      setCheckoutCreditReceivedRef('');
      setCheckoutCreditReceivedBankAccountId('');
      if (layawayIdSnapshot) { setActiveLayawayId(null); setActiveLayawayDeposit(0); }
      // Transition the checkout overlay to the "complete" screen in-place.
      // Deferred to a separate React commit (queueMicrotask) so the state
      // resets above (clearInvoice, setCheckoutPayMode, etc.) are committed
      // and painted BEFORE React unmounts the payment form subtree and mounts
      // the complete screen. Without this, React 18's automatic batching
      // tries to reconcile DOM changes inside the payment-form buttons (e.g.
      // indicator divs) while simultaneously unmounting those buttons — which
      // throws "Failed to execute 'removeChild' on 'Node'".
      queueMicrotask(() => setCheckoutPhase('complete'));

      // Post-success side-effects: cash drawer, receipt print, layaway convert.
      // Fire-and-forget — the success screen is already up; failures here surface
      // as a non-blocking notice (the sale itself is safely posted). NOT awaited,
      // so the checkout handler's finally{} releases checkoutLoading right away.
      void (async () => {
        try {
          // Cash drawer — open on cash settlement, and again if change is due.
          if (cashTaken) {
            openCashDrawer('CASH_SETTLEMENT');
            openCashDrawer('CASH_PAYMENT');
          }
          if (changeDue > 0) openCashDrawer('CHANGE_RETURN');

          try {
            if (printPaper === 'A4') {
              const template = buildPosA4Template(tplInvoiceFooter, { showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes, showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner, colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt });
              const data = buildPosPrintData(savedInvoice, tplInvoiceFooter);
              const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
              printHtml(await generatePrintHtmlAsync(template, data, options));
              openCashDrawer('RECEIPT_PRINT');
            } else {
              // Credit account fields ALL come from the single pre-checkout snapshot
              // (creditPrevBalAuto, read at line ~3280 BEFORE posCheckout posted this
              // invoice) so Previous Balance + Invoice Credit − Amount Paid = Updated
              // Balance holds internally. Do NOT re-query posCreditBalance here: after
              // checkout the ledger already includes this invoice, so the re-queried
              // value is the NEW balance — passing it as "Previous Balance" while the
              // other three fields stay on the pre-sale snapshot made the printed math
              // contradict itself (Previous showed the post-sale balance, Updated the
              // pre-sale one).
              const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                full: savedInvoice,
                cashGiven: paid.paidAmount,
                changeAmount: changeDue,
                // Mixed (cash + card) split — only for a genuine mixed payment where
                // both portions were entered, so cash/card/credit sales stay clean.
                mixedCashGiven: checkoutPayMode === 'mixed' && mixedCashNum > 0 ? mixedCashNum : null,
                mixedCardGiven: checkoutPayMode === 'mixed' && mixedCardNum > 0 ? mixedCardNum : null,
                mixedCardType: checkoutPayMode === 'mixed' ? (mixedCardType || 'Card') : null,
                // Print the actual selected customer's name (client item 3) — the same
                // `customer` object the checkout preview rendered. Walk-in stays null so
                // the builders fall back to "Walk-in Customer" only for a genuine walk-in.
                customerNameOverride: (customer && customer.id !== 'walk-in') ? customer.name : null,
                customerPhone: customer?.phone,
                customerEmail: customer?.email,
                creditPreviousBalance: creditPrevBalAuto,
                creditInvoiceCredit: creditInvoiceCreditAuto,
                creditAmountPaid: creditAmountPaidAuto,
                creditUpdatedBalance: creditUpdatedBalanceAuto,
                depositApplied: depositSnapshot > 0 ? depositSnapshot : null,
                balanceDue: depositSnapshot > 0 ? effectiveDueAmt : null,
                shippingCharge: shippingChargeNum > 0 ? shippingChargeNum : null,
              });
              await printThermalReceiptWithConfiguredPrinter({
                full: savedInvoice,
                text,
                escPosBase64,
                title: `Receipt ${savedInvoice.invoiceNumber || ''}`.trim(),
              });
              openCashDrawer('RECEIPT_PRINT');
            }
          } catch (autoPrintErr) {
            console.warn('Automatic receipt print failed', autoPrintErr);
            alert(`Sale saved, but the receipt didn't print: ${autoPrintErr?.message || 'printer error'}. Use "Print Receipt" to retry.`);
          }

          // If this checkout settled a layaway, stamp it converted (releases its
          // reservations; the sale re-reserved its own batches). Best-effort — the
          // sale already posted, so a failure here just leaves the layaway open.
          if (layawayIdSnapshot) {
            try {
              await convertLayaway(layawayIdSnapshot, {
                invoiceId: savedInvoice.id,
                invoiceNumber: savedInvoice.invoiceNumber,
              });
            } catch (convErr) {
              console.warn('Layaway mark-converted failed', convErr);
            }
          }
        } finally {
          setCheckoutFinalizing(false);
        }
      })();
    } catch (err) {
      // Settle failed — the cart is untouched (clearInvoice only runs on success).
      // Do NOT unfreeze the preview here: flipping checkoutSettling false in the
      // same render that mounts the error banner swaps the live iframe's blob src
      // while React is reconciling, which races the iframe's external DOM mutation
      // and throws "Failed to execute 'removeChild' on 'Node'". The freeze is
      // released safely when the payment dialog closes (effect on showPaymentDialog),
      // so the cashier can read the error / retry against the still-frozen preview.
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
    // Cash drop / cash out are session-bound — refuse if no session is open even
    // if the dialog was reached from a template that doesn't gate the button.
    if (!isSessionActive) {
      setCashDropFeedback({ type: 'error', message: 'Open a POS session before recording cash movements.' });
      setTimeout(() => setCashDropFeedback(null), 3000);
      return;
    }
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
        const companyOptions = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
        if (reprintPrintMode === 'a4' || reprintPrintMode === 'pdf') {
          const template = buildPosA4Template(tplInvoiceFooter, { showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes, showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner, colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt });
          const data = buildPosPrintData(full, tplInvoiceFooter);
          const html = await generatePrintHtmlAsync(template, data, companyOptions);
          if (reprintPrintMode === 'pdf') {
            const filename = `${full.invoiceNumber || reprintSelectedInvoice}.pdf`;
            try { await downloadPdfViaServer(html, filename); } catch {
              const { downloadPdf } = await import('../../utils/printGenerator');
              await downloadPdf(html, filename);
            }
          } else {
            openCashDrawer('RECEIPT_PRINT');
            printHtml(html);
          }
        } else {
          const custRec = customerOptions.find(c => c.code === full.customerCode || c.id === full.customerCode);
          const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
            full,
            isReprint: true,
            customerPhone: custRec?.phone,
            customerEmail: custRec?.email,
            // Suppress the CREDIT ACCOUNT block on a reprint of a historical invoice.
            // The block is a point-in-time snapshot of the ledger AS OF the original
            // sale, and those figures are not persisted on the invoice. Re-querying
            // posCreditBalance returns the customer's CURRENT outstanding (which may
            // reflect many later transactions), so using it as "Previous Balance" —
            // then letting the renderer fabricate Updated = prev + invoiceTotal —
            // prints numbers that never existed. A "COPY / REPRINT" with an invented
            // balance is worse than a reprint that simply omits it.
            showCreditBalanceOverride: false,
            cashierNameOverride: full.createdBy ? formatUserDisplayName(full.createdBy.includes('@') ? full.createdBy.split('@')[0] : full.createdBy) : cashierDisplayName,
          });
          openCashDrawer('RECEIPT_PRINT');
          await printThermalReceiptWithConfiguredPrinter({
            full,
            text,
            escPosBase64,
            title: `Reprint ${full.invoiceNumber || reprintSelectedInvoice || ''}`.trim(),
          });
        }
      }
    } catch (err) {
      console.warn('Reprint error', err);
      alert(`Reprint failed: ${err?.message || 'printer error'}.`);
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
    // Batch/serial-controlled products skip the cache and always go through the
    // backend resolver so a scanned barcode can still pin the exact unit and the
    // one-batch-one-unit rule is enforced rather than silently merging quantity.
    const cached = productCacheRef.current.get(value.toLowerCase());
    if (cached && !cached.isBatch && !cached.isSerial) {
      if (cached.availableInPos === false) {
        showFeedback('error', 'This product is disabled for POS sales.');
        clearInputs();
        return;
      }
      const res = addToInvoice(cached, qty);
      if (res && res.ok === false) {
        showFeedback('error', res.reason || 'Could not add this item.');
        clearInputs();
        return;
      }
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

    // A batch/serial unit that exists but can't be sold (reserved / consumed /
    // sold). The backend already refuses to add it — surface its reason so the
    // cashier knows why, and never fall through to the grid-filter branch.
    if (result?.type === 'BLOCKED') {
      showFeedback('error', result.message || 'This unit is not available for sale.');
      setBarcodeInput('');
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
      const pinnedSerialNumber = result.pinnedSerialNumber || null;
      const pinnedExpiry = result.pinnedExpiry || null;
      const cartItems = currentInvoiceRef.current?.items || [];

      // A scanned serial is a single unique unit. The same serial can never be
      // sold twice on one bill, so block the duplicate outright (no qty bump).
      if (pinnedSerialNumber) {
        if (cartItems.some(i => i.serialNumber === pinnedSerialNumber)) {
          showFeedback('error', `Serial number ${pinnedSerialNumber} already exists in cart`);
          clearInputs();
          return;
        }
        addToInvoice(product, 1, null, pinnedSerialNumber);
        setLastScannedItem({
          name: product.name, nameAr: product.nameAr || '',
          barcode: pinnedSerialNumber, qty: 1, total: product.price,
        });
        showFeedback('success', `${product.name} — serial ${pinnedSerialNumber}`);
        clearInputs();
        return;
      }

      // A pinned batch is one physical unit — force qty 1 for that line.
      const effectiveQty = pinnedBatchNumber ? 1 : qty;
      // Prevent the same physical batch unit from being added twice.
      if (pinnedBatchNumber && cartItems.some(i => i.pinnedBatchNumber === pinnedBatchNumber)) {
        showFeedback('error', `Batch ${pinnedBatchNumber} already exists in cart`);
        clearInputs();
        return;
      }
      // addToInvoice enforces one-batch-one-unit for batch/serial products added
      // without a pin (e.g. resolved by product code) — surface its refusal.
      const addRes = addToInvoice(product, effectiveQty, pinnedBatchNumber, null, pinnedExpiry);
      if (addRes && addRes.ok === false) {
        showFeedback('error', addRes.reason || 'Could not add this item.');
        clearInputs();
        return;
      }
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
    const pl = analyticsData?.pipeline;
    const fmt = (v) => v == null ? '—' : `AED ${Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtN = (v) => v == null ? '—' : String(v);

    const kpis = [
      { label: 'Total Sales', value: kpi ? fmt(kpi.totalSales) : '—', sub: kpi ? `${kpi.invoiceCount} invoices` : '—', trend: 'up', icon: <TrendingUp className="h-5 w-5" />, color: '#327F74' },
      { label: 'Total Receivables', value: kpi ? fmt(kpi.totalReceivables) : '—', sub: 'Outstanding balance', trend: 'neu', icon: <Wallet className="h-5 w-5" />, color: '#F59E0B' },
      { label: 'Pending Quotations', value: fmtN(kpi?.pendingQuotations), sub: 'Pending approval / active', trend: 'neu', icon: <FileText className="h-5 w-5" />, color: '#6366F1' },
      { label: 'Open Sales Orders', value: fmtN(kpi?.openSalesOrders), sub: 'Confirmed & in progress', trend: 'neu', icon: <ShoppingCart className="h-5 w-5" />, color: '#8B5CF6' },
      { label: 'Pending Proforma', value: fmtN(kpi?.pendingProforma), sub: 'Draft proforma invoices', trend: 'neu', icon: <FileBarChart className="h-5 w-5" />, color: '#0EA5E9' },
      { label: 'Pending Delivery Notes', value: fmtN(kpi?.pendingDeliveryNotes), sub: 'Draft / dispatched', trend: 'neu', icon: <Truck className="h-5 w-5" />, color: '#F97316' },
      { label: 'Overdue Invoices', value: fmtN(kpi?.overdueInvoices), sub: 'Unpaid >30 days', trend: kpi?.overdueInvoices > 0 ? 'warn' : 'neu', icon: <AlertTriangle className="h-5 w-5" />, color: '#EF4444' },
      { label: 'Sales Returns Value', value: kpi ? fmt(kpi.salesReturnsValue) : '—', sub: 'Period total', trend: 'neu', icon: <RotateCcw className="h-5 w-5" />, color: '#EC4899' },
      { label: 'Credit Notes Value', value: kpi ? fmt(kpi.creditNotesValue) : '—', sub: 'Period total', trend: 'neu', icon: <CreditCard className="h-5 w-5" />, color: '#14B8A6' },
    ];

    const pipelineStages = [
      { stage: 'Quotation', count: pl?.quotations ?? 0, value: pl?.quotationsValue ?? 0, icon: <FileText className="h-4 w-4" />, color: '#6366F1' },
      { stage: 'Sales Order', count: pl?.salesOrders ?? 0, value: pl?.salesOrdersValue ?? 0, icon: <ShoppingCart className="h-4 w-4" />, color: '#8B5CF6' },
      { stage: 'Proforma Inv.', count: pl?.proformaInvoices ?? 0, value: pl?.proformaValue ?? 0, icon: <FileBarChart className="h-4 w-4" />, color: '#0EA5E9' },
      { stage: 'Delivery Note', count: pl?.deliveryNotes ?? 0, value: pl?.deliveryNotesValue ?? 0, icon: <Truck className="h-4 w-4" />, color: '#F97316' },
      { stage: 'Sales Invoice', count: pl?.invoices ?? 0, value: pl?.invoicesValue ?? 0, icon: <Receipt className="h-4 w-4" />, color: '#327F74' },
      { stage: 'Receipt', count: pl?.receipts ?? 0, value: pl?.receiptsValue ?? 0, icon: <CheckCircle className="h-4 w-4" />, color: '#22C55E' },
    ];

    const agingData = (analyticsData?.agingBuckets ?? []);
    const topOverdue = [];
    const topCustomers = (analyticsData?.topCustomers ?? []);
    const salesTrendData = (analyticsData?.salesTrend ?? []);
    const paymentSplitData = (analyticsData?.paymentBreakdown ?? []).map((p, i) => ({
      name: p.name, value: p.value,
      fill: ['#F5C742', '#327F74', '#6366F1', '#EC4899', '#0EA5E9'][i % 5],
    }));
    const branchSalesData = (analyticsData?.branchSales ?? []).map(b => ({ branch: b.name, sales: b.value, returns: 0 }));
    const returnReasonData = [];

    const tabs = [
      { id: 'pipeline', label: 'Sales Pipeline' },
      { id: 'receivables', label: 'Receivables' },
      { id: 'customers', label: 'Customer Analytics' },
      { id: 'invoices', label: 'Invoice & POS' },
      { id: 'returns', label: 'Returns & Credit Notes' },
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
                  {['All', 'Dubai Mall', 'Deira City', 'Ibn Battuta', 'Mirdif City', 'Online'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Payment Mode</label>
                <select value={analyticsPayMode} onChange={e => setAnalyticsPayMode(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#1E293B] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40">
                  {['All', 'Cash', 'Card', 'Credit', 'Mixed'].map(m => <option key={m}>{m}</option>)}
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
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-3">
            {kpis.map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg" style={{ background: k.color + '18', color: k.color }}>
                    {k.icon}
                  </div>
                  {k.trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                  {k.trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
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
                        <stop offset="5%" stopColor={GOLD} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradPOS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#327F74" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#327F74" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales" name="Total Sales" stroke={GOLD} strokeWidth={2} fill="url(#gradSales)" />
                    <Area type="monotone" dataKey="pos" name="POS Sales" stroke="#327F74" strokeWidth={2} fill="url(#gradPOS)" />
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
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Bar dataKey="sales" name="Sales" fill={GOLD} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="returns" name="Returns" fill="#F87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══ RECEIVABLES TAB ══ */}
          {analyticsTab === 'receivables' && (
            <div className="space-y-6">
              {/* Aging summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {agingData.map((a, i) => {
                  const colors = ['#22C55E', '#F59E0B', '#F97316', '#EF4444'];
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
                  <AreaChart data={salesTrendData.map((d, i) => ({ ...d, outstanding: [48320, 44200, 51800, 39400, 46600, 48320][i], overdue: [22130, 18400, 26100, 17200, 20400, 22130][i] }))} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradOver" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="outstanding" name="Outstanding" stroke="#0EA5E9" strokeWidth={2} fill="url(#gradOut)" />
                    <Area type="monotone" dataKey="overdue" name="Overdue" stroke="#EF4444" strokeWidth={2} fill="url(#gradOver)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top overdue customers table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-[#1E293B] mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Top Overdue Customers
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Customer', 'Mobile', 'Overdue Amount', 'Days Overdue', 'Action'].map(h => (
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
            </div>
          )}

          {/* ══ CUSTOMERS TAB ══ */}
          {analyticsTab === 'customers' && (
            <div className="space-y-6">
              {/* Customer summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Customers', value: analyticsData?.customerMetrics ? String(analyticsData.customerMetrics.totalCustomers) : '—', icon: <Users className="h-4 w-4" />, color: '#327F74' },
                  { label: 'New This Period', value: '—', icon: <UserPlus className="h-4 w-4" />, color: '#22C55E' },
                  { label: 'Active Customers', value: analyticsData?.customerMetrics ? String(analyticsData.customerMetrics.activeCustomers) : '—', icon: <UserCheck className="h-4 w-4" />, color: '#6366F1' },
                  { label: 'Inactive (90+ days)', value: '—', icon: <User className="h-4 w-4" />, color: '#94A3B8' },
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['#', 'Customer', 'Invoices', 'Total Sales', 'Outstanding', 'Purchase Trend'].map(h => (
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
                              {[0.5, 0.7, 0.4, 0.9, 0.8, 1.0].map((v, j) => (
                                <div key={j} className="w-2 rounded-sm" style={{ height: `${v * 100}%`, background: '#327F74', opacity: 0.4 + v * 0.6 }} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                    <Bar dataKey="new" name="New Customers" fill="#22C55E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="returning" name="Returning Customers" fill={GOLD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══ INVOICES TAB ══ */}
          {analyticsTab === 'invoices' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                          <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Average Invoice Value', value: kpi ? fmt(kpi.avgInvoiceValue) : '—', sub: 'Per invoice', icon: <DollarSign className="h-4 w-4" />, color: '#327F74' },
                  { label: 'Total Invoices Issued', value: kpi ? fmtN(kpi.invoiceCount) : '—', sub: 'In period', icon: <FileText className="h-4 w-4" />, color: '#6366F1' },
                  { label: 'POS Transactions', value: '—', sub: '—', icon: <ShoppingCart className="h-4 w-4" />, color: GOLD },
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
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v) => [`AED ${v.toLocaleString()}`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Bar dataKey="pos" name="POS Sales" fill="#327F74" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ══ RETURNS TAB ══ */}
          {analyticsTab === 'returns' && (
            <div className="space-y-6">
              {/* Returns KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Sales Return Value', value: analyticsData?.returnMetrics ? fmt(analyticsData.returnMetrics.salesReturnsValue) : '—', sub: '—', icon: <RotateCcw className="h-4 w-4" />, color: '#EC4899' },
                  { label: 'Credit Notes Value', value: '—', sub: '—', icon: <CreditCard className="h-4 w-4" />, color: '#14B8A6' },
                  { label: 'Total Return Txns', value: analyticsData?.returnMetrics ? fmtN(analyticsData.returnMetrics.returnCount) : '—', sub: '—', icon: <Package className="h-4 w-4" />, color: '#F97316' },
                  { label: 'Return %', value: analyticsData?.returnMetrics ? `${analyticsData.returnMetrics.returnPct.toFixed(1)}%` : '—', sub: 'of sales', icon: <Percent className="h-4 w-4" />, color: '#6366F1' },
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
                        <stop offset="5%" stopColor={GOLD} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gR2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EC4899" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#EC4899" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip formatter={(v, name) => [`AED ${v.toLocaleString()}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales" name="Sales" stroke={GOLD} strokeWidth={2} fill="url(#gS2)" />
                    <Area type="monotone" dataKey="returns" name="Returns" stroke="#EC4899" strokeWidth={2} fill="url(#gR2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Return reason analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                            <div className="h-full rounded-full" style={{ width: `${r.count / maxCount * 100}%`, background: ['#EC4899', '#F97316', '#F59E0B', '#6366F1', '#14B8A6'][i] }} />
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Credit Note #', 'Customer', 'Amount', 'Status'].map(h => (
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
                <p className="text-gray-600">Started: {currentSession.openedAt ? parseUTCDate(currentSession.openedAt)?.toLocaleTimeString() : currentSession.startTime ? parseUTCDate(currentSession.startTime)?.toLocaleTimeString() : '—'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* X-Report Tile — generate the shift X-Report without closing the session.
            Running this clears the terminal for the end-of-day Z-Report. */}
        <Card
          className={`${posDashboardTileClass}${isSessionActive ? '' : ' opacity-50 cursor-not-allowed'}`}
          onClick={() => { if (isSessionActive) setCurrentView('x-report'); }}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <FileText className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">X-Report / Close Session</CardTitle>
            <CardDescription>
              Generate report and close session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {isSessionActive
                ? 'Generate shift report or close current session'
                : 'Start a session to generate the X-Report'}
            </p>
          </CardContent>
        </Card>

        {/* Z-Report Tile — a cross-session, end-of-day report keyed by branch/date, not
            by this terminal's own session, so it must stay reachable after this
            terminal's session is closed (that's normally exactly when a cashier wants
            to check Z-Report eligibility or pull the day's consolidated report). */}
        <Card
          className={`${posDashboardTileClass}${currentTerminal?.branchId ? '' : ' opacity-50 cursor-not-allowed'}`}
          onClick={() => { if (currentTerminal?.branchId) setCurrentView('z-report'); }}
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
              {currentTerminal?.branchId
                ? 'Consolidated end-of-day report (all terminals must run X-Report first)'
                : 'Register a terminal to access the Z-Report'}
            </p>
          </CardContent>
        </Card>



        {/* Customer Tile */}
        <Card
          className={`${posDashboardTileClass}${isSessionActive ? '' : ' opacity-50 cursor-not-allowed'}`}
          onClick={() => { if (isSessionActive) setCurrentView('customer'); }}
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
              {isSessionActive
                ? 'View statements, receive payments, manage advances'
                : 'Start a session to manage customers'}
            </p>
          </CardContent>
        </Card>

        {/* Cash Drop / Out Tile */}
        <Card
          className={`${posDashboardTileClass}${isSessionActive ? '' : ' opacity-50 cursor-not-allowed'}`}
          onClick={() => { if (isSessionActive) setShowCashDropDialog(true); }}
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
              {isSessionActive
                ? 'Add cash drops or record cash payouts'
                : 'Start a session to record cash movements'}
            </p>
          </CardContent>
        </Card>

        {/* Live Session Tile — quick-view popup of current session sales/cash figures */}
        <Card
          className={`${posDashboardTileClass}${isSessionActive ? '' : ' opacity-50 cursor-not-allowed'}`}
          onClick={() => {
            if (!isSessionActive) return;
            setShowLiveSessionDialog(true);
            loadXReport();
          }}
        >
          <CardHeader>
            <div className="bg-gradient-to-r from-[#F5C742] to-[#f4d673] p-4 rounded-lg w-fit">
              <Activity className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="mt-4">Live Session</CardTitle>
            <CardDescription>
              Quick view of current session values
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {isSessionActive
                ? 'Sales, cash drop, cash out & drawer total at a glance'
                : 'Start a session to view live session values'}
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

        const sessionStart = currentSession?.openedAt ? parseUTCDate(currentSession.openedAt) : null;
        const nowMs = sessionNowMs;
        const diffMin = sessionStart ? Math.floor((nowMs - sessionStart.getTime()) / 60000) : 0;
        const durH = Math.floor(diffMin / 60);
        const durM = diffMin % 60;
        const sessionDuration = sessionStart ? (durH > 0 ? `${durH}h ${durM}m` : `${durM}m`) : '—';

        const loading = xReportLoading || xReportData === null;

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

  // ── Report company profile helper ────────────────────────────────────────────
  const reportCompanyProfile = () => ({
    companyName: tplOutletName || 'BillBull ERP',
    branchName: currentTerminal?.branchName || company?.branchName || '',
    trn: tplOutletTrn || '',
    address: tplOutletAddress || '',
    phone: tplOutletPhone || '',
    currency: company?.currency || 'AED',
    currencySymbol: company?.currencySymbol || '',
    logoUrl: tplLogoDataUrl || undefined,
    stampUrl: (tplInvoiceShowStamp && tplStampDataUrl) ? tplStampDataUrl : undefined,
    showStampInPrint: tplInvoiceShowStamp && !!tplStampDataUrl,
    showLogo: tplInvoiceShowLogo,
  });

  // ── Z-Report: build A4 view-model for print/PDF ───────────────────────────
  const buildZReportViewModel = () => {
    const zSummary = zReportData?.summary || {};
    const zSessions = zReportData?.sessions || [];
    const zInvoices = zReportData?.invoices || [];
    const totalSalesV = Number(zSummary.totalSales ?? 0);
    const cashSalesV = Number(zSummary.cashSales ?? 0);
    const cardSalesV = Number(zSummary.cardSales ?? 0);
    const creditSalesV = Number(zSummary.creditSales ?? 0);
    // Online payments are tendered against a bank account, so they land in the
    // same reconciliation bucket as generic bank transfers (see POS backend
    // tenderBucket()).
    const bankTransferSalesV = Number(zSummary.bankTransferSales ?? 0);
    const totalTaxV = Number(zSummary.totalTax ?? 0);
    const salesExTaxV = Number(zSummary.salesAmountExTax ?? 0);
    const discountV = Number(zSummary.totalDiscount ?? 0);
    const itemsSoldV = zSummary.totalItemsSold ?? 0;
    const invoiceCount = zSummary.invoiceCount ?? 0;
    const sessionCount = zSummary.sessionCount ?? zSessions.length;
    const openingCash = zSessions.reduce((s, ss) => s + Number(ss.openingCash ?? 0), 0);
    const expectedCash = openingCash + cashSalesV;
    const fmt = (n) => `${activeCurrency} ${Number(n).toFixed(2)}`;
    const zId = zSessions[0]?.id;
    const reportNo = zId ? `ZR-${String(zId).padStart(9, '0')}` : `ZR-${zReportDate?.replace(/-/g, '')}-001`;

    const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
    const creditTotal = creditInvoices.reduce((s, inv) => s + (Number(inv.invoiceTotal) || 0), 0);
    const invNums = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();
    // Detailed void/removal + per-cashier collection from the backend.
    const postedVoids = Array.isArray(zReportData?.voids) ? zReportData.voids : [];
    const cartRemovals = Array.isArray(zReportData?.cartRemovals) ? zReportData.cartRemovals : [];
    const cashierRows = Array.isArray(zReportData?.cashiers) ? zReportData.cashiers : [];
    const totalPaidV = Number(zSummary.totalPaid ?? totalSalesV);
    const voidAmountV = Number(zSummary.voidAmount ?? 0);
    const refundTotal = Number(zSummary.totalRefunds ?? 0);
    const actualCash = zSessions.reduce((s, ss) => s + Number(ss.closingCash ?? 0), 0);
    const cashVariance = actualCash - expectedCash;
    const zCashierLabel = cashierRows.length ? cashierRows.map(c => c.cashier).filter(Boolean).join(', ') : 'All cashiers';
    const zSessionInfoRows = Array.isArray(zReportData?.sessionInfo) ? zReportData.sessionInfo : [];
    const fmtTs = (t) => {
      const d = parseUTCDate(t);
      if (!d) return '—';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const denomKeys = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];
    const denomLabels = { '1000': 'AED 1000', '500': 'AED 500', '200': 'AED 200', '100': 'AED 100', '50': 'AED 50', '20': 'AED 20', '10': 'AED 10', '5': 'AED 5', '1': 'AED 1 Coin', '0.50': 'AED 0.50 Coin', '0.25': 'AED 0.25 Coin' };
    const cardTypeBreakdown = Array.isArray(zSummary.cardTypeBreakdown) ? zSummary.cardTypeBreakdown : [];
    const zDenominationTotals = denomKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    zSessionInfoRows.forEach((row) => {
      const raw = row?.closingDenominationsJson;
      if (!raw) return;
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        denomKeys.forEach((key) => { zDenominationTotals[key] += Number(parsed?.[key] || 0); });
      } catch (err) {
        console.warn('Unable to parse Z-report closing denominations', err);
      }
    });

    return {
      reportTitle: 'Z-Report / End-of-Day Closing Report',
      note: `Report No: ${reportNo}  |  Business Date: ${zReportDate || new Date().toISOString().slice(0, 10)}  |  Sessions: ${sessionCount}`,
      reportMeta: [
        { label: 'Report No', value: reportNo },
        { label: 'Session No', value: `${sessionCount} session${sessionCount === 1 ? '' : 's'}` },
        { label: 'Cashier', value: zCashierLabel },
        { label: 'Date & Time', value: new Date().toLocaleString() },
        { label: 'Business Date', value: zReportDate || new Date().toISOString().slice(0, 10) },
        { label: 'Terminal', value: currentTerminal?.terminalId || 'All Terminals' },
      ],
      kpis: [
        { label: 'Opening Cash', value: fmt(openingCash), hint: `${sessionCount} session(s)`, icon: 'OC' },
        { label: 'Total Sales', value: fmt(totalSalesV), hint: 'Inc. VAT', icon: 'TS' },
        { label: 'Cash Sales', value: fmt(cashSalesV), hint: 'Cash payments', icon: 'CS' },
        { label: 'Card Sales', value: fmt(cardSalesV), hint: 'Card payments', icon: 'CA' },
        { label: 'Credit Sales', value: fmt(creditSalesV), hint: 'Credit invoices', icon: 'CR' },
        { label: 'Online / Bank Transfer', value: fmt(bankTransferSalesV), hint: 'Online payments', icon: 'OB' },
        { label: 'Returns', value: fmt(refundTotal), hint: 'Refunds / returns', icon: 'RT' },
        { label: 'Discounts', value: fmt(discountV), hint: 'Bill and line discounts', icon: 'DS' },
        { label: 'Expected Cash', value: fmt(expectedCash), hint: 'Opening + cash sales', icon: 'EC' },
        { label: 'Actual Cash', value: fmt(actualCash), hint: 'Closed session counts', icon: 'AC' },
        { label: 'Cash Variance', value: fmt(Math.abs(cashVariance)), hint: actualCash === 0 ? 'Pending close count' : Math.abs(cashVariance) < 0.01 ? 'Balanced' : cashVariance < 0 ? 'Short' : 'Excess', icon: 'CV' },
      ],
      sections: [
        {
          title: '0. Session Information', type: 'table',
          cols: ['Session', 'Cashier', 'Opened At', 'Closed At', 'Expected Cash', 'Actual Cash'],
          rows: zSessionInfoRows.length
            ? zSessionInfoRows.map((row) => [
              row.sessionNo || 'â€”',
              row.cashier || 'â€”',
              fmtTs(row.openedAt),
              fmtTs(row.closedAt),
              fmt(Number(row.expectedCash ?? 0)),
              fmt(Number(row.closingCash ?? 0)),
            ])
            : zSessions.map((row) => [
              row.id ? `SESS-${String(row.id).padStart(6, '0')}` : 'â€”',
              row.openedBy || 'â€”',
              fmtTs(row.openedAt),
              fmtTs(row.closedAt),
              fmt(Number(row.expectedCash ?? 0)),
              fmt(Number(row.closingCash ?? 0)),
            ]),
        },
        {
          title: '1. Denomination Count', type: 'table',
          cols: ['Denomination', 'Quantity', 'Total Amount'],
          rows: denomKeys.map(k => [denomLabels[k], String(zDenominationTotals[k] || 0), fmt((zDenominationTotals[k] || 0) * parseFloat(k))]),
          footer: ['Total Cash Counted', '', fmt(calculateDenominationTotal(zDenominationTotals))],
        },
        {
          title: '2. Sales Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Gross Sales', fmt(totalSalesV)],
            ['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)],
            ['Net Sales Before VAT', fmt(salesExTaxV)],
            ['VAT Amount (5%)', fmt(totalTaxV)],
            ['Net Sales Including VAT', fmt(totalSalesV)],
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
            ['Cash', String(zSummary.cashInvoiceCount ?? '—'), fmt(cashSalesV)],
            ['Card', String(zSummary.cardInvoiceCount ?? '—'), fmt(cardSalesV)],
            ['Credit', String(zSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
          ],
          footer: ['Total Collected', String(invoiceCount), fmt(totalSalesV)],
        },
        {
          title: '4. Cash Drawer Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Opening Cash / Float', fmt(openingCash)],
            ['Cash Sales', fmt(cashSalesV)],
            ['Expected Cash in Drawer', fmt(expectedCash)],
          ],
        },
        {
          title: '5. Card / Bank Settlement Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ...cardTypeBreakdown.map(row => [row.cardType, fmt(row.amount ?? 0)]),
            ['Total Card Sales', fmt(cardSalesV)],
            ['Net Card Settlement Expected', fmt(cardSalesV)],
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
          title: '8. Returns / Refund Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Sales Returns', String(zSummary.salesReturnCount ?? 0), zSummary.salesReturnTotal > 0 ? `(${fmt(zSummary.salesReturnTotal)})` : fmt(0)],
            ['Refunds Processed', String(zSummary.refundCount ?? 0), zSummary.refundTotal > 0 ? `(${fmt(zSummary.refundTotal)})` : fmt(0)],
            ['Credit Notes Issued', String(zSummary.creditNoteCount ?? 0), zSummary.creditNoteTotal > 0 ? `(${fmt(zSummary.creditNoteTotal)})` : fmt(0)],
            ['Exchange Transactions', String(zSummary.exchangeCount ?? 0), fmt(zSummary.exchangeTotal ?? 0)],
            ['Total Refunds (Tender)', String(zSummary.totalRefundCount ?? 0), fmt(zSummary.totalRefunds ?? 0)],
          ],
        },
        {
          title: '9. Product / Item Movement Summary', type: 'table',
          cols: ['Description', 'Quantity', 'Amount'],
          rows: [
            ['Total Items Sold', String(itemsSoldV), fmt(totalSalesV)],
            ['Total Items Returned', String(zSummary.totalItemsReturned ?? 0), (zSummary.totalItemsReturned ?? 0) > 0 ? `(${fmt(zSummary.salesReturnTotal ?? 0)})` : fmt(0)],
            ['Net Quantity Sold', String(zSummary.netQuantitySold ?? itemsSoldV), fmt(totalSalesV)],
            ...((Array.isArray(zReportData?.topSellingItems) ? zReportData.topSellingItems : []).map(it =>
              [`  Top Seller: ${it.itemCode || '—'} — ${it.itemName || '—'}`, String(it.quantity ?? 0), fmt(it.amount ?? 0)])),
          ],
        },
        {
          title: '10. Cashier Wise Summary', type: 'table',
          cols: ['Cashier', 'Invoice Count', 'Net Sales', 'Cash', 'Card', 'Credit'],
          rows: (Array.isArray(zReportData?.cashierWiseSummary) ? zReportData.cashierWiseSummary : []).length > 0
            ? zReportData.cashierWiseSummary.map(c => [c.cashier || '—', String(c.invoiceCount || 0), fmt(c.netSales ?? 0), fmt(c.cash ?? 0), fmt(c.card ?? 0), fmt(c.credit ?? 0)])
            : [['—', '0', fmt(0), fmt(0), fmt(0), fmt(0)]],
          footer: ['Total', String(invoiceCount), fmt(totalSalesV), fmt(cashSalesV), fmt(cardSalesV), fmt(creditSalesV)],
        },
        {
          // Per-cashier collection attribution (by who took payment) — supports
          // multi-cashier operation within a single session.
          title: '10a. Cashier Collection Attribution', type: 'table',
          cols: ['Cashier', 'Collected'],
          rows: cashierRows.length
            ? cashierRows.map(c => [c.cashier || '—', fmt(Number(c.collected ?? 0))])
            : [['—', fmt(0)]],
          footer: ['Total Collected', fmt(totalPaidV)],
        },
        {
          title: '10b. Voided Items (Posted then Voided)', type: 'table',
          cols: ['Invoice', 'Item', 'Qty', 'Unit Price', 'Line Total', 'Reason', 'Voided By', 'Time'],
          rows: postedVoids.length
            ? postedVoids.map(v => [
              v.invoiceNumber || '—',
              `${v.itemName || v.itemCode || '—'}${v.serialNumber ? ` [SN:${v.serialNumber}]` : ''}`,
              String(v.quantity ?? 0),
              fmt(Number(v.unitPrice ?? 0)),
              fmt(Number(v.lineTotal ?? 0)),
              v.voidReason || '—',
              v.voidedBy || '—',
              v.voidedAt ? String(v.voidedAt).replace('T', ' ').slice(0, 16) : '—',
            ])
            : [['—', 'No voided items', '', '', '', '', '', '']],
          footer: ['Total', '', '', '', fmt(voidAmountV), `${postedVoids.length} item(s)`, '', ''],
        },
        {
          title: '10c. Removed From Cart (Never Posted)', type: 'table',
          cols: ['Item', 'Detail', 'Removed By', 'Terminal', 'Time'],
          rows: cartRemovals.length
            ? cartRemovals.map(r => [
              r.itemCode || '—',
              r.description || '—',
              r.voidedBy || '—',
              r.terminalId || '—',
              r.voidedAt ? String(r.voidedAt).replace('T', ' ').slice(0, 16) : '—',
            ])
            : [['—', 'No cart removals', '', '', '']],
        },
        {
          title: '11. Customer Credit Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Credit Sales', String(creditInvoices.length), fmt(creditTotal)],
            ['Outstanding Created Today', String(creditInvoices.length), fmt(creditTotal)],
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
            ['Total Net Sales Inc. VAT', fmt(totalSalesV)],
            ['Total Discount', fmt(discountV)],
            ['Total Collection', fmt(totalPaidV)],
            ['Opening Cash / Float', fmt(openingCash)],
            ['Expected Cash in Drawer', fmt(expectedCash)],
            ['Cash Sales', fmt(cashSalesV)],
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
    const totalSalesV = fmt(zSummary.totalSales ?? 0);
    const cashSalesV = fmt(zSummary.cashSales ?? 0);
    const cardSalesV = fmt(zSummary.cardSales ?? 0);
    const creditSalesV = fmt(zSummary.creditSales ?? 0);
    const totalTaxV = fmt(zSummary.totalTax ?? 0);
    const salesExTaxV = fmt(zSummary.salesAmountExTax ?? 0);
    const discountV = fmt(zSummary.totalDiscount ?? 0);
    const itemsSold = zSummary.totalItemsSold ?? 0;
    const invoiceCount = zSummary.invoiceCount ?? 0;
    const openingCash = fmt(zSessions.reduce((s, ss) => s + Number(ss.openingCash ?? 0), 0));
    const expectedCash = fmt(openingCash + cashSalesV);
    const creditInvoices = zInvoices.filter(inv => inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
    const creditTotal = fmt(creditInvoices.reduce((s, inv) => s + Number(inv.invoiceTotal || 0), 0));
    const invNums = zInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();

    return [
      // Sales summary rows tagged with section header
      { Section: 'Sales Summary', Description: 'Gross Sales', Count: '', Amount: totalSalesV },
      { Section: '', Description: 'Total Discount', Count: '', Amount: discountV },
      { Section: '', Description: 'Net Sales Before VAT', Count: '', Amount: salesExTaxV },
      { Section: '', Description: 'VAT Amount (5%)', Count: '', Amount: totalTaxV },
      { Section: '', Description: 'Net Sales Including VAT', Count: '', Amount: totalSalesV },
      { Section: 'Payment / Tender', Description: 'Cash', Count: zSummary.cashInvoiceCount ?? 0, Amount: cashSalesV },
      { Section: '', Description: 'Card', Count: zSummary.cardInvoiceCount ?? 0, Amount: cardSalesV },
      { Section: '', Description: 'Credit', Count: zSummary.creditInvoiceCount ?? 0, Amount: creditSalesV },
      { Section: '', Description: 'Total Collected', Count: invoiceCount, Amount: totalSalesV },
      { Section: 'Cash Drawer', Description: 'Opening Cash / Float', Count: '', Amount: openingCash },
      { Section: '', Description: 'Cash Sales', Count: '', Amount: cashSalesV },
      { Section: '', Description: 'Expected Cash in Drawer', Count: '', Amount: expectedCash },
      { Section: 'VAT / Tax', Description: 'VAT 5% — Taxable Amount', Count: '', Amount: salesExTaxV },
      { Section: '', Description: 'VAT 5% — Tax Amount', Count: '', Amount: totalTaxV },
      { Section: '', Description: 'Total Inc. VAT', Count: '', Amount: totalSalesV },
      { Section: 'Discount', Description: 'Total Discount', Count: '', Amount: discountV },
      { Section: 'Returns / Refund', Description: 'Sales Returns', Count: zSummary.salesReturnCount ?? 0, Amount: fmt(zSummary.salesReturnTotal ?? 0) },
      { Section: '', Description: 'Refunds Processed', Count: zSummary.refundCount ?? 0, Amount: fmt(zSummary.refundTotal ?? 0) },
      { Section: '', Description: 'Credit Notes Issued', Count: zSummary.creditNoteCount ?? 0, Amount: fmt(zSummary.creditNoteTotal ?? 0) },
      { Section: '', Description: 'Exchange Transactions', Count: zSummary.exchangeCount ?? 0, Amount: fmt(zSummary.exchangeTotal ?? 0) },
      { Section: '', Description: 'Total Refunds (Tender)', Count: zSummary.totalRefundCount ?? 0, Amount: fmt(zSummary.totalRefunds ?? 0) },
      { Section: 'Item Movement', Description: 'Total Items Sold', Count: String(itemsSold), Amount: totalSalesV },
      { Section: '', Description: 'Total Items Returned', Count: String(zSummary.totalItemsReturned ?? 0), Amount: fmt(zSummary.salesReturnTotal ?? 0) },
      { Section: '', Description: 'Net Quantity Sold', Count: String(zSummary.netQuantitySold ?? itemsSold), Amount: totalSalesV },
      ...(Array.isArray(zReportData?.topSellingItems) ? zReportData.topSellingItems : []).map((it, i) => ({
        Section: i === 0 ? 'Top Selling Items' : '',
        Description: `${it.itemCode || '—'} — ${it.itemName || '—'}`,
        Count: it.quantity ?? 0,
        Amount: fmt(it.amount ?? 0),
      })),
      { Section: 'Customer Credit', Description: 'Credit Sales', Count: creditInvoices.length, Amount: creditTotal },
      { Section: 'Invoice Range', Description: 'First Invoice', Count: invNums[0] || '—', Amount: '' },
      { Section: '', Description: 'Last Invoice', Count: invNums[invNums.length - 1] || '—', Amount: '' },
      ...(Array.isArray(zReportData?.cashierWiseSummary) ? zReportData.cashierWiseSummary : []).map((c, i) => ({
        Section: i === 0 ? 'Cashier Wise' : '',
        Description: c.cashier || '—',
        Count: c.invoiceCount || 0,
        Amount: fmt(c.netSales ?? 0),
      })),
    ];
  };

  // ── X-Report: build A4 view-model for print/PDF ───────────────────────────
  const buildXReportViewModel = () => {
    const xSummary = xReportData?.summary || {};
    const xInvoices = xReportData?.invoices || [];
    const sess = xReportData?.session || currentSession;
    const fmt = (n) => `${activeCurrency} ${Number(n).toFixed(2)}`;
    const openingCashVal = Number(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
    const cashSalesV = Number(xSummary.cashSales ?? 0);
    const cardSalesV = Number(xSummary.cardSales ?? 0);
    const creditSalesV = Number(xSummary.creditSales ?? 0);
    const bankTransferSalesV = Number(xSummary.bankTransferSales ?? 0);
    const totalSalesV = Number(xSummary.totalSales ?? 0);
    const totalTaxV = Number(xSummary.totalTax ?? 0);
    const salesExTaxV = Number(xSummary.salesAmountExTax ?? 0);
    const discountV = Number(xSummary.totalDiscount ?? 0);
    const cashDropIn = Number(xSummary.cashDropIn ?? 0);
    const cashDropOut = Number(xSummary.cashDropOut ?? 0);
    const invoiceCount = xSummary.invoiceCount ?? currentSession?.invoiceCount ?? 0;
    const expectedCashVal = Number(xSummary.expectedCash ?? (openingCashVal + cashSalesV + cashDropIn - cashDropOut));
    const reportDenominations = getReportClosingDenominations();
    const actualCash = calculateDenominationTotal(reportDenominations);
    const cashVariance = actualCash - expectedCashVal;
    const varStatus = actualCash === 0 ? 'Pending Count' : Math.abs(cashVariance) < 0.01 ? 'Balanced' : cashVariance < 0 ? 'Short' : 'Excess';
    const sessId = sess?.id || currentSession?.id;
    const reportNo = sessId ? `XR-${String(sessId).padStart(9, '0')}` : '—';
    const denomKeys = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];
    const denomLabels = { '1000': 'AED 1000', '500': 'AED 500', '200': 'AED 200', '100': 'AED 100', '50': 'AED 50', '20': 'AED 20', '10': 'AED 10', '5': 'AED 5', '1': 'AED 1 Coin', '0.50': 'AED 0.50 Coin', '0.25': 'AED 0.25 Coin' };

    const cardPayCount = Number(xSummary.cardInvoiceCount ?? 0);
    const refundTotal = Number(xSummary.totalRefunds ?? 0);
    const totalRefundCount = Number(xSummary.totalRefundCount ?? 0);
    const cardRefundTotal = Number(xSummary.cardRefundSales ?? 0);
    const cardRefundCount = Number(xSummary.cardRefundCount ?? 0);
    const netCardSettle = cardSalesV - cardRefundTotal;
    const netCardCount = Math.max(0, cardPayCount - cardRefundCount);
    const cardTypeBreakdown = Array.isArray(xSummary.cardTypeBreakdown) ? xSummary.cardTypeBreakdown : [];
    const itemsSoldCount = Number(xSummary.totalItemsSold ?? 0);
    // Detailed void/removal data from the backend audit trail + persisted voided lines.
    const postedVoids = Array.isArray(xReportData?.voids) ? xReportData.voids : [];
    const cartRemovals = Array.isArray(xReportData?.cartRemovals) ? xReportData.cartRemovals : [];
    const cashierRows = Array.isArray(xReportData?.cashiers) ? xReportData.cashiers : [];
    const totalVoids = Number(xSummary.voidItemCount ?? sess?.totalVoids ?? 0);
    const totalPaidV = Number(xSummary.totalPaid ?? totalSalesV);
    const voidAmountV = Number(xSummary.voidAmount ?? 0);
    const sessInfo = xReportData?.sessionInfo || {};
    const fmtTs = (t) => {
      const d = parseUTCDate(t);
      if (!d) return '—';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const fmtDuration = (seconds) => {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      if (!total) return '0m';
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    const durationSeconds = sessInfo.durationSeconds ?? sess?.durationSeconds
      ?? ((sess?.openedAt && sess?.closedAt)
        ? Math.max(0, Math.floor((parseUTCDate(sess.closedAt).getTime() - parseUTCDate(sess.openedAt).getTime()) / 1000))
        : null);

    return {
      reportTitle: 'X-Report / Session Close Report',
      note: `Report No: ${reportNo}  |  Cashier: ${sess?.openedBy || '—'}  |  Session: SESS-${String(sessId || 0).padStart(6, '0')}  |  Date: ${sess?.sessionDate || new Date().toISOString().slice(0, 10)}`,
      reportMeta: [
        { label: 'Report No', value: reportNo },
        { label: 'Session No', value: sessInfo.sessionNo || `SESS-${String(sessId || 0).padStart(6, '0')}` },
        { label: 'Cashier', value: sessInfo.cashier || sess?.openedBy || '-' },
        { label: 'Date & Time', value: new Date().toLocaleString() },
        { label: 'Business Date', value: sess?.sessionDate || new Date().toISOString().slice(0, 10) },
        { label: 'Terminal', value: sessInfo.terminalId || sess?.terminalId || '-' },
      ],
      kpis: [
        { label: 'Opening Cash', value: fmt(openingCashVal), hint: 'Float', icon: 'OC' },
        { label: 'Total Sales', value: fmt(totalSalesV), hint: 'Inc. VAT', icon: 'TS' },
        { label: 'Cash Sales', value: fmt(cashSalesV), hint: 'Cash payments', icon: 'CS' },
        { label: 'Card Sales', value: fmt(cardSalesV), hint: 'Card payments', icon: 'CA' },
        { label: 'Credit Sales', value: fmt(creditSalesV), hint: 'Credit invoices', icon: 'CR' },
        { label: 'Online / Bank Transfer', value: fmt(bankTransferSalesV), hint: 'Online payments', icon: 'OB' },
        { label: 'Returns', value: fmt(refundTotal), hint: 'Refunds / returns', icon: 'RT' },
        { label: 'Discounts', value: fmt(discountV), hint: 'Bill and line discounts', icon: 'DS' },
        { label: 'Expected Cash', value: fmt(expectedCashVal), hint: 'Opening + cash sales', icon: 'EC' },
        { label: 'Actual Cash', value: fmt(actualCash), hint: 'Denomination count', icon: 'AC' },
        { label: 'Cash Variance', value: fmt(Math.abs(cashVariance)), hint: varStatus, icon: 'CV' },
      ],
      sections: [
        {
          title: '0. Session Information', type: 'table',
          cols: ['Field', 'Value'],
          rows: [
            ['Session No.', sessInfo.sessionNo || `SESS-${String(sessId || 0).padStart(6, '0')}`],
            ['Branch', sessInfo.branch || sess?.branchName || '—'],
            ['Terminal', sessInfo.terminalId || sess?.terminalId || '—'],
            ['Counter', sessInfo.counter || sess?.counterName || '—'],
            ['Device', sessInfo.device || '—'],
            ...(sessInfo.deviceInfo ? [['Device Info', sessInfo.deviceInfo.substring(0, 48)]] : []),
            ['Shift', sessInfo.shift || '—'],
            ['Cashier', sessInfo.cashier || sess?.openedBy || '—'],
            ['Opened At', fmtTs(sessInfo.openedAt || sess?.openedAt)],
            ['Closed At', fmtTs(sessInfo.closedAt || sess?.closedAt)],
            ['Duration', fmtDuration(durationSeconds)],
          ],
        },
        {
          title: '1. Denomination Count', type: 'table',
          cols: ['Denomination', 'Quantity', 'Total Amount'],
          rows: denomKeys.map(k => [denomLabels[k], String(reportDenominations[k] || 0), fmt((reportDenominations[k] || 0) * parseFloat(k))]),
          footer: ['Total Cash Counted', '', fmt(actualCash)],
        },
        {
          title: '2. Cash Drawer Summary', type: 'table',
          cols: ['Description', 'Amount'],
          rows: [
            ['Opening Cash / Float', fmt(openingCashVal)],
            ['Cash Sales', fmt(cashSalesV)],
            ['Cash Drop In', fmt(cashDropIn)],
            ['Cash Drop Out', fmt(cashDropOut)],
            ['Expected Cash in Drawer', fmt(expectedCashVal)],
            ['Actual Cash Counted', fmt(actualCash)],
          ],
          footer: ['Cash Variance (' + varStatus + ')', fmt(Math.abs(cashVariance))],
        },
        {
          title: '3. Payment / Tender Summary', type: 'table',
          cols: ['Payment Mode', 'Count', 'Amount'],
          rows: [
            ['Cash', String(xSummary.cashInvoiceCount ?? '—'), fmt(cashSalesV)],
            ['Card', String(xSummary.cardInvoiceCount ?? '—'), fmt(cardSalesV)],
            ['Credit', String(xSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
            ...((xSummary.otherSales ?? 0) > 0
              ? [['Online', String(xSummary.otherInvoiceCount ?? '—'), fmt(xSummary.otherSales)]]
              : []),
          ],
          // Total Collected = actual tender taken across every mode, not invoice count/value.
          footer: ['Total Collected', String(xSummary.totalTenderCount ?? invoiceCount), fmt(totalPaidV)],
        },
        {
          title: '4. Card / Bank Settlement Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ...cardTypeBreakdown.map(row => [row.cardType, String(row.count ?? 0), fmt(row.amount ?? 0)]),
            ['Card Sales', String(cardPayCount), fmt(cardSalesV)],
            ['Card Refunds', String(cardRefundCount), cardRefundTotal > 0 ? `(${fmt(cardRefundTotal)})` : fmt(0)],
            ['Net Card Settlement', String(netCardCount), fmt(netCardSettle)],
            ['Card Machine Batch No.', sessInfo.cardBatchNo || xReportCardBatchNo || '—', ''],
            ['Card Settlement Verified', (sessInfo.cardSettlementVerified ?? xReportCardVerified) ? 'Yes' : 'No', ''],
          ],
        },
        {
          title: '5. Invoice / Transaction Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Total Invoices', String(invoiceCount), fmt(totalSalesV)],
            ['Cash Invoices', String(xSummary.cashInvoiceCount ?? '—'), fmt(cashSalesV)],
            ['Card Invoices', String(xSummary.cardInvoiceCount ?? '—'), fmt(cardSalesV)],
            ['Credit Invoices', String(xSummary.creditInvoiceCount ?? '—'), fmt(creditSalesV)],
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
          rows: [
            ['Bill Level Discount', fmt(xSummary.billDiscount ?? 0)],
            ['Line Item Discount', fmt(xSummary.lineDiscount ?? 0)],
          ],
          footer: ['Total Discount', discountV > 0 ? `(${fmt(discountV)})` : fmt(0)],
        },
        {
          title: '8. Return / Refund Summary', type: 'table',
          cols: ['Description', 'Count', 'Amount'],
          rows: [
            ['Total Refunds', String(totalRefundCount), fmt(refundTotal)],
            ['Card Refunds', String(cardRefundCount), fmt(cardRefundTotal)],
          ],
        },
        {
          title: '9. Item Movement Summary', type: 'table',
          cols: ['Description', 'Quantity', 'Amount'],
          rows: [['Total Items Sold', String(itemsSoldCount || xSummary.totalItemsSold || 0), fmt(totalSalesV)]],
        },
        {
          // Posted-then-voided: lines rung up on a posted invoice, then voided.
          // Full audit detail from sales_invoice_items (reason / by / when / serial).
          title: '10. Voided Items (Posted then Voided)', type: 'table',
          cols: ['Invoice', 'Item', 'Qty', 'Unit Price', 'Line Total', 'Reason', 'Voided By', 'Time'],
          rows: postedVoids.length
            ? postedVoids.map(v => [
              v.invoiceNumber || '—',
              `${v.itemName || v.itemCode || '—'}${v.serialNumber ? ` [SN:${v.serialNumber}]` : ''}`,
              String(v.quantity ?? 0),
              fmt(Number(v.unitPrice ?? 0)),
              fmt(Number(v.lineTotal ?? 0)),
              v.voidReason || '—',
              v.voidedBy || '—',
              v.voidedAt ? String(v.voidedAt).replace('T', ' ').slice(0, 16) : '—',
            ])
            : [['—', 'No voided items', '', '', '', '', '', '']],
          footer: ['Total', '', '', '', fmt(voidAmountV), `${postedVoids.length} item(s)`, '', ''],
        },
        {
          // Removed-from-cart: ITEM_VOIDED audit entries with no posted line —
          // removed before the sale was ever posted. Never mixed with posted voids.
          title: '11. Removed From Cart (Never Posted)', type: 'table',
          cols: ['Item', 'Detail', 'Removed By', 'Terminal', 'Time'],
          rows: cartRemovals.length
            ? cartRemovals.map(r => [
              r.itemCode || '—',
              r.description || '—',
              r.voidedBy || '—',
              r.terminalId || '—',
              r.voidedAt ? String(r.voidedAt).replace('T', ' ').slice(0, 16) : '—',
            ])
            : [['—', 'No cart removals', '', '', '']],
        },
        {
          // Per-cashier collection attribution — supports multi-cashier sessions.
          title: '12. Cashier Attribution', type: 'table',
          cols: ['Cashier', 'Collected'],
          rows: cashierRows.length
            ? cashierRows.map(c => [c.cashier || '—', fmt(Number(c.collected ?? 0))])
            : [[sess?.openedBy || '—', fmt(totalPaidV)]],
          footer: ['Total Collected', fmt(totalPaidV)],
        },
      ],
    };
  };

  // ── X-Report: Excel flat rows ─────────────────────────────────────────────
  const buildXReportExcelRows = () => {
    const xSummary = xReportData?.summary || {};
    const xInvoices = xReportData?.invoices || [];
    const sess = xReportData?.session || currentSession;
    const fmt = (n) => Number(Number(n).toFixed(2));
    const openingCashVal = fmt(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
    const cashSalesV = fmt(xSummary.cashSales ?? 0);
    const cardSalesV = fmt(xSummary.cardSales ?? 0);
    const creditSalesV = fmt(xSummary.creditSales ?? 0);
    const totalSalesV = fmt(xSummary.totalSales ?? 0);
    const totalTaxV = fmt(xSummary.totalTax ?? 0);
    const salesExTaxV = fmt(xSummary.salesAmountExTax ?? 0);
    const discountV = fmt(xSummary.totalDiscount ?? 0);
    const cashDropIn = fmt(xSummary.cashDropIn ?? 0);
    const cashDropOut = fmt(xSummary.cashDropOut ?? 0);
    const invoiceCount = xSummary.invoiceCount ?? currentSession?.invoiceCount ?? 0;
    const expectedCash = fmt(xSummary.expectedCash ?? (openingCashVal + cashSalesV + cashDropIn - cashDropOut));
    const reportDenominations = getReportClosingDenominations();
    const actualCash = fmt(calculateDenominationTotal(reportDenominations));
    const variance = fmt(actualCash - expectedCash);
    const refundTotal = fmt(xSummary.totalRefunds ?? 0);
    const totalRefundCount = xSummary.totalRefundCount ?? 0;
    const cardRefundTotal = fmt(xSummary.cardRefundSales ?? 0);
    const cardRefundCount = xSummary.cardRefundCount ?? 0;
    const otherSalesV = fmt(xSummary.otherSales ?? 0);
    const totalPaidV = fmt(xSummary.totalPaid ?? totalSalesV);
    const totalTenderCountV = xSummary.totalTenderCount ?? invoiceCount;
    const denomKeys = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];
    const denomLabels = { '1000': 'AED 1000', '500': 'AED 500', '200': 'AED 200', '100': 'AED 100', '50': 'AED 50', '20': 'AED 20', '10': 'AED 10', '5': 'AED 5', '1': 'AED 1 Coin', '0.50': 'AED 0.50 Coin', '0.25': 'AED 0.25 Coin' };

    return [
      ...denomKeys.map((k, i) => ({
        Section: i === 0 ? 'Denomination Count' : '',
        Description: denomLabels[k],
        Count: reportDenominations[k] || 0,
        Amount: fmt((reportDenominations[k] || 0) * parseFloat(k)),
      })),
      { Section: 'Cash Drawer', Description: 'Opening Cash / Float', Count: '', Amount: openingCashVal },
      { Section: '', Description: 'Cash Sales', Count: '', Amount: cashSalesV },
      { Section: '', Description: 'Cash Drop In', Count: '', Amount: cashDropIn },
      { Section: '', Description: 'Cash Drop Out', Count: '', Amount: cashDropOut },
      { Section: '', Description: 'Expected Cash in Drawer', Count: '', Amount: expectedCash },
      { Section: '', Description: 'Actual Cash Counted', Count: '', Amount: actualCash },
      { Section: '', Description: 'Cash Variance', Count: '', Amount: variance },
      { Section: 'Payment Tender', Description: 'Cash', Count: xSummary.cashInvoiceCount ?? 0, Amount: cashSalesV },
      { Section: '', Description: 'Card', Count: xSummary.cardInvoiceCount ?? 0, Amount: cardSalesV },
      { Section: '', Description: 'Credit', Count: xSummary.creditInvoiceCount ?? 0, Amount: creditSalesV },
      ...(otherSalesV > 0 ? [{ Section: '', Description: 'Online', Count: xSummary.otherInvoiceCount ?? 0, Amount: otherSalesV }] : []),
      { Section: '', Description: 'Total', Count: totalTenderCountV, Amount: totalPaidV },
      { Section: 'VAT / Tax', Description: 'VAT 5% — Taxable Amount', Count: '', Amount: salesExTaxV },
      { Section: '', Description: 'VAT 5% — Tax Amount', Count: '', Amount: totalTaxV },
      { Section: '', Description: 'Total Inc. VAT', Count: '', Amount: totalSalesV },
      { Section: 'Discount', Description: 'Bill Level Discount', Count: xSummary.billDiscountCount ?? 0, Amount: fmt(xSummary.billDiscount ?? 0) },
      { Section: '', Description: 'Line Item Discount', Count: xSummary.lineDiscountCount ?? 0, Amount: fmt(xSummary.lineDiscount ?? 0) },
      { Section: '', Description: 'Total Discount', Count: '', Amount: discountV },
      { Section: 'Return / Refund', Description: 'Sales Returns', Count: xSummary.salesReturnCount ?? 0, Amount: fmt(xSummary.salesReturnTotal ?? 0) },
      { Section: '', Description: 'Refunds Processed', Count: xSummary.refundCount ?? 0, Amount: fmt(xSummary.refundTotal ?? 0) },
      { Section: '', Description: 'Credit Notes Issued', Count: xSummary.creditNoteCount ?? 0, Amount: fmt(xSummary.creditNoteTotal ?? 0) },
      { Section: '', Description: 'Exchange Transactions', Count: xSummary.exchangeCount ?? 0, Amount: fmt(xSummary.exchangeTotal ?? 0) },
      { Section: '', Description: 'Total Refunds (In-session)', Count: totalRefundCount, Amount: refundTotal },
      { Section: 'Card Settlement', Description: 'Card Refunds', Count: cardRefundCount, Amount: cardRefundTotal },
      { Section: '', Description: 'Net Card Settlement', Count: Math.max(0, (xSummary.cardInvoiceCount ?? 0) - cardRefundCount), Amount: fmt(Math.max(0, cardSalesV - cardRefundTotal)) },
      { Section: '', Description: 'Card Machine Batch No.', Count: '', Amount: sess?.cardBatchNo || xReportCardBatchNo || '—' },
      { Section: '', Description: 'Card Settlement Verified', Count: '', Amount: (sess?.cardSettlementVerified ?? xReportCardVerified) ? 'Yes' : 'No' },
      { Section: 'Invoice Count', Description: 'Total Invoices', Count: invoiceCount, Amount: totalSalesV },
      ...xInvoices.slice(0, 200).map((inv, i) => ({
        Section: i === 0 ? 'Invoice List' : '',
        Description: inv.invoiceNumber || `Invoice #${i + 1}`,
        Count: inv.paymentMode || '—',
        Amount: fmt(inv.invoiceTotal || 0),
      })),
    ];
  };

  // ── Report print/export handlers ──────────────────────────────────────────
  // Single rendering dispatch: one view-model, renderer chosen by reportPrintMode.
  // A4 → enterprise template; 80mm/58mm → thermal template. Preview, print and PDF
  // all flow through here so every output shows identical data.
  const renderReportHtml = (vm, cp, meta) => {
    if (reportPrintMode === '80mm' || reportPrintMode === '58mm') {
      return generateReportThermalHtml(vm, cp, { ...meta, paper: reportPrintMode });
    }
    return generateReportA4Html(vm, cp, meta);
  };

  // Build an X/Z report as ESC/POS with the SAME branded header the POS Sales
  // receipt uses (logo + big company name + branch + TRN), then the report body.
  // The body is generated with omitHeader so its own plain-text company block is
  // suppressed and not printed twice. The report title (e.g. "X-REPORT / SESSION
  // CLOSE REPORT") becomes the branded header's bold document title.
  const buildReportEscPosWithBrandedHeader = (vm, cp, meta) => {
    const paper = meta.paper === '58mm' ? '58mm' : '80mm';
    const body = generateReportThermalText(vm, cp, { ...meta, omitHeader: true });
    return buildEscPosDocumentBase64(body, {
      paperSize: paper,
      documentTitle: (meta.reportTitle || vm.reportTitle || 'POS REPORT').toUpperCase(),
      companyName: cp.companyName || tplOutletName,
      header: cp.branchName || '',
      trn: cp.trn || tplOutletTrn,
      outletAddress: cp.address || tplOutletAddress,
      outletPhone: cp.phone || tplOutletPhone,
      logoDataUrl: cp.logoUrl || tplLogoDataUrl,
      showLogo: cp.showLogo !== false,
    });
  };

  // Thermal reports go straight to the configured default printer (no browser
  // print dialog); A4 reports keep using the browser dialog since the local
  // print agent only carries raw text/ESC-POS, not full HTML, today.
  const printReportWithConfiguredPrinter = async (vm, cp, meta) => {
    if (reportPrintMode !== '80mm' && reportPrintMode !== '58mm') {
      printHtml(renderReportHtml(vm, cp, meta));
      return;
    }
    const printer = resolvePrinterForContext(printerConfigs, {
      deviceType: 'RECEIPT_PRINTER',
      branchId: currentTerminal?.branchId || null,
      terminalId: currentTerminal?.terminalId || null,
    });
    if (!printer) {
      notifyPrintFallback('No receipt printer is configured for this terminal. Set one up in Settings → Devices.');
      return;
    }
    try {
      const escPosBase64 = await buildReportEscPosWithBrandedHeader(vm, cp, { ...meta, paper: reportPrintMode });
      const fallbackText = generateReportThermalText(vm, cp, { ...meta, paper: reportPrintMode });
      await sendEscPosReceiptToConfiguredPrinter(printer, { dataBase64: escPosBase64, receiptText: fallbackText, title: meta.reportTitle || vm.reportTitle || 'POS Report' });
    } catch (err) {
      console.warn('ESC/POS print failed for report print', err);
      notifyPrintFallback(`Report failed to print: ${err?.message || 'printer error'}.`);
    }
  };

  // Auto-print an X/Z report to the configured 80mm printer after a successful
  // Close Session / Close Day — ALWAYS forces 80mm (unlike the manual buttons,
  // which honour the user's chosen reportPrintMode) and is dedupe-guarded so the
  // same session/day report can't be pushed to the printer twice (e.g. the user
  // clicks Close again). Runs silently and non-blocking; a missing printer or send
  // failure only surfaces as the existing dismissible fallback toast, never an
  // interruption of the close workflow.
  const autoPrintReportThermal = async (vm, cp, meta, dedupeKey) => {
    if (dedupeKey && printedReportKeysRef.current.has(dedupeKey)) return;
    if (dedupeKey) printedReportKeysRef.current.add(dedupeKey);
    const printer = resolvePrinterForContext(printerConfigs, {
      deviceType: 'RECEIPT_PRINTER',
      branchId: currentTerminal?.branchId || null,
      terminalId: currentTerminal?.terminalId || null,
    });
    if (!printer) {
      if (dedupeKey) printedReportKeysRef.current.delete(dedupeKey);
      notifyPrintFallback('No receipt printer is configured for this terminal. Set one up in Settings → Devices.');
      return;
    }
    try {
      const escPosBase64 = await buildReportEscPosWithBrandedHeader(vm, cp, { ...meta, paper: '80mm' });
      const fallbackText = generateReportThermalText(vm, cp, { ...meta, paper: '80mm' });
      await sendEscPosReceiptToConfiguredPrinter(printer, { dataBase64: escPosBase64, receiptText: fallbackText, title: meta.reportTitle || vm.reportTitle || 'POS Report' });
    } catch (err) {
      console.warn('Auto-print failed for report', err);
      if (dedupeKey) printedReportKeysRef.current.delete(dedupeKey);
      notifyPrintFallback(`Report failed to auto-print: ${err?.message || 'printer error'}.`);
    }
  };

  // ERP rule: Z-Report print/PDF/Excel export requires the business day to already be
  // closed (matches the backend gate in PosSessionController#checkZReportPrintable).
  const assertZReportPrintable = async () => {
    if (!zReportData) { alert('Please generate the Z-Report first.'); return false; }
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    try {
      await checkPosZReportPrintable(branchId, zReportDate);
      return true;
    } catch (err) {
      alert(err?.response?.data?.message || 'Z-Report can only be printed or exported after the business day is closed.');
      return false;
    }
  };

  const handleZReportPrint = async () => {
    if (!(await assertZReportPrintable())) return;
    const vm = buildZReportViewModel();
    const cp = reportCompanyProfile();
    printReportWithConfiguredPrinter(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] });
  };

  const handleZReportPreview = () => {
    if (!zReportData) { alert('Please generate the Z-Report first.'); return; }
    const vm = buildZReportViewModel();
    const cp = reportCompanyProfile();
    const html = renderReportHtml(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleZReportExportPDF = async () => {
    if (!(await assertZReportPrintable())) return;
    const vm = buildZReportViewModel();
    const cp = reportCompanyProfile();
    // PDF export always uses the A4 template (a thermal roll PDF is not useful here).
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: zReportDate }] });
    const filename = `Z-Report_${zReportDate || new Date().toISOString().slice(0, 10)}`;
    try { await downloadPdfViaServer(html, filename); } catch {
      const { downloadPdf } = await import('../../utils/printGenerator');
      await downloadPdf(html, filename);
    }
  };

  const handleZReportExportExcel = async () => {
    if (!(await assertZReportPrintable())) return;
    const rows = buildZReportExcelSections();
    const cols = [
      { header: 'Section', key: 'Section', width: 22 },
      { header: 'Description', key: 'Description', width: 32 },
      { header: 'Count', key: 'Count', width: 12 },
      { header: `Amount (${activeCurrency})`, key: 'Amount', width: 18 },
    ];
    const cp = reportCompanyProfile();
    await exportToExcel(rows, cols, `Z-Report_${zReportDate || new Date().toISOString().slice(0, 10)}`, {
      companyProfile: cp,
      branch: cp.companyName,
      dateFrom: zReportDate,
      dateTo: zReportDate,
    });
  };

  // ERP rule: X-Report print/PDF/Excel export requires the session to already be closed
  // (matches the backend gate in PosSessionController#checkXReportPrintable). Viewing the
  // report on screen — Preview, and the report page itself — stays available while open.
  const assertXReportPrintable = async () => {
    const sessId = xReportData?.session?.id || currentSession?.id;
    if (!sessId) { alert('No session to report on.'); return false; }
    try {
      await checkPosXReportPrintable(sessId);
      return true;
    } catch (err) {
      alert(err?.response?.data?.message || 'X-Report can only be printed or exported after the session is closed.');
      return false;
    }
  };

  const handleXReportPrint = async () => {
    if (!(await assertXReportPrintable())) return;
    const vm = buildXReportViewModel();
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    printReportWithConfiguredPrinter(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0, 10) }, { label: 'Cashier', value: sess?.openedBy || '' }] });
  };

  const handleXReportPreview = () => {
    const vm = buildXReportViewModel();
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    const html = renderReportHtml(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0, 10) }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleXReportExportPDF = async () => {
    if (!(await assertXReportPrintable())) return;
    const vm = buildXReportViewModel();
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    // PDF export always uses the A4 template.
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sess?.sessionDate || new Date().toISOString().slice(0, 10) }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    const filename = `X-Report_${sess?.id ? `SESS-${String(sess.id).padStart(6, '0')}` : new Date().toISOString().slice(0, 10)}`;
    try { await downloadPdfViaServer(html, filename); } catch {
      const { downloadPdf } = await import('../../utils/printGenerator');
      await downloadPdf(html, filename);
    }
  };

  const handleXReportExportExcel = async () => {
    if (!(await assertXReportPrintable())) return;
    const rows = buildXReportExcelRows();
    const cols = [
      { header: 'Section', key: 'Section', width: 22 },
      { header: 'Description', key: 'Description', width: 32 },
      { header: 'Count', key: 'Count', width: 16 },
      { header: `Amount (${activeCurrency})`, key: 'Amount', width: 18 },
    ];
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    await exportToExcel(rows, cols, `X-Report_${sess?.id ? `SESS-${String(sess.id).padStart(6, '0')}` : new Date().toISOString().slice(0, 10)}`, {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 text-xs">
            {[
              ['Report Date', zReportDate || new Date().toLocaleDateString()],
              ['Sessions', String(zSessionCount)],
              ['Report Type', 'Z-Report (End-of-Day)'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
            ))}
          </div>
          <div className="space-y-1 text-xs">
            {[
              ['Total Invoices', String(zInvoiceCount)],
              ['Total Sales', formatCurrencyStr(zTotalSales)],
              ['Cash Sales', formatCurrencyStr(zCashSales)],
              ['Card Sales', formatCurrencyStr(zCardSales)],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2"><span className="text-gray-500 w-36 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    );

    const zrKpiCards = (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F7F7FA] text-gray-500">
                {cols.map((c, i) => <th key={i} className={`px-4 py-2 text-left font-medium border-b border-[#327F74]/10 ${i > 0 && cols.length > 2 ? 'text-right' : i === cols.length - 1 && cols.length === 2 ? 'text-right' : ''}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                  {r.map((cell, ci) => <td key={ci} className={`px-4 py-2 text-[#1E293B] ${ci > 0 && cols.length > 2 ? 'text-right' : ci === cols.length - 1 && cols.length === 2 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
                </tr>
              ))}
              {footerRow && (
                <tr className="bg-[#F7F7FA] border-t border-[#327F74]/20">
                  {footerRow.map((cell, ci) => <td key={ci} className={`px-4 py-2 font-semibold text-[#1E293B] ${ci > 0 && cols.length > 2 ? 'text-right' : ci === cols.length - 1 && cols.length === 2 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    // End-of-day gate: when the backend reports terminals still owing an X-Report,
    // show only this blocker (the report body and its actions stay hidden).
    const zReportBlocked = Array.isArray(zReportPending) && zReportPending.length > 0;
    const zrPendingBlocker = (
      <div className="bg-white border border-red-200 rounded-lg shadow-sm p-6 mb-4">
        <div className="flex items-center gap-2 mb-2 text-red-600">
          <Lock className="h-5 w-5" />
          <h3 className="text-base font-semibold">Z-Report blocked — terminals pending X-Report</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Every active terminal must generate its X-Report before the end-of-day Z-Report can be produced.
          The following terminal(s) are still open without an X-Report:
        </p>
        <div className="border border-red-100 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-red-50 text-red-700">
                <th className="px-4 py-2 text-left font-medium">Terminal</th>
                <th className="px-4 py-2 text-left font-medium">Counter</th>
                <th className="px-4 py-2 text-left font-medium">Cashier</th>
              </tr>
            </thead>
            <tbody>
              {(zReportPending || []).map((t, i) => (
                <tr key={i} className="border-t border-red-50">
                  <td className="px-4 py-2 text-[#1E293B]">{t.terminalName || t.terminalId || '—'}</td>
                  <td className="px-4 py-2 text-[#1E293B]">{t.counter || '—'}</td>
                  <td className="px-4 py-2 text-[#1E293B]">{t.openedBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Ask each listed terminal to run <span className="font-medium text-[#327F74]">X-Report</span> from its POS dashboard, then generate the Z-Report again.
        </p>
      </div>
    );

    return (
      <div className="bg-[#F7F7FA] min-h-full p-6">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-[#F7F7FA] pb-3 border-b border-[#327F74]/10 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
              <select value={reportPrintMode} onChange={e => setReportPrintMode(e.target.value)} title="Print / preview format" className="border border-[#327F74]/40 text-[#327F74] text-xs px-2 py-1.5 rounded bg-white focus:outline-none">
                <option value="a4">A4</option>
                <option value="80mm">Thermal 80mm</option>
                <option value="58mm">Thermal 58mm</option>
              </select>
              <button onClick={handleZReportPreview} disabled={!zReportData} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><Eye className="h-3 w-3" />Preview</button>
              <button onClick={handleZReportPrint} disabled={!zReportData || !zReportData?.isDayClosed} title={zReportData && !zReportData?.isDayClosed ? 'Close the business day first to print the Z-Report.' : undefined} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><Printer className="h-3 w-3" />Print</button>
              <button onClick={handleZReportExportPDF} disabled={!zReportData || !zReportData?.isDayClosed} title={zReportData && !zReportData?.isDayClosed ? 'Close the business day first to export the Z-Report.' : undefined} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><FileText className="h-3 w-3" />Export PDF</button>
              <button onClick={handleZReportExportExcel} disabled={!zReportData || !zReportData?.isDayClosed} title={zReportData && !zReportData?.isDayClosed ? 'Close the business day first to export the Z-Report.' : undefined} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1"><Download className="h-3 w-3" />Export Excel</button>
              <button
                onClick={() => { if (window.confirm(`Close business day ${zReportDate}? This will finalize all sessions for the day.`)) handleCloseDay(); }}
                disabled={zReportLoading || !zReportData || zReportData?.isDayClosed}
                className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-4 py-1.5 rounded flex items-center gap-1">
                <Lock className="h-3 w-3" />{zReportData?.isDayClosed ? 'Day Closed' : 'Close Day'}
              </button>
            </div>
          </div>
        </div>

        {zrFilterBar}

        {zReportData?.isDayClosed && (
          <div className="bg-yellow-50 text-yellow-800 p-3 mb-4 rounded border border-yellow-200 flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" />
            This business day has been officially closed. Showing finalized snapshot.
          </div>
        )}

        {zReportBlocked ? zrPendingBlocker : (<>
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
              ...((zSummary.otherSales ?? 0) > 0
                ? [['Online', zSummary.otherInvoiceCount ?? '—', <CurrencyAmount key="z3o" amount={zSummary.otherSales} />]]
                : []),
            ]}
            footerRow={['Total Collected', String(zInvoiceCount), <span key="z3t" className="text-[#327F74]"><CurrencyAmount amount={zTotalSales} /></span>]}
          />

          {/* Section 4: Cash Drawer Summary */}
          <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
              <span className="text-[#327F74]"><Banknote className="h-4 w-4" /></span>
              <span className="text-sm text-[#1E293B]">4. Cash Drawer Summary</span>
            </div>
            <div className="overflow-x-auto">
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
                  ].map(([d, a], i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                      <td className="px-4 py-2 text-[#1E293B]">{d}</td>
                      <td className="px-4 py-2 text-right text-[#1E293B]">{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

          {/* Section 8: Returns / Refund Summary */}
          <ZRTable
            title="8. Returns / Refund Summary"
            icon={<RotateCcw className="h-4 w-4" />}
            cols={['Description', 'Count', 'Amount']}
            rows={[
              ['Sales Returns', String(zSummary.salesReturnCount ?? 0), zSummary.salesReturnTotal > 0 ? `(${formatCurrencyStr(zSummary.salesReturnTotal)})` : <CurrencyAmount key="z8sr" amount={0} />],
              ['Refunds Processed', String(zSummary.refundCount ?? 0), zSummary.refundTotal > 0 ? `(${formatCurrencyStr(zSummary.refundTotal)})` : <CurrencyAmount key="z8rf" amount={0} />],
              ['Credit Notes Issued', String(zSummary.creditNoteCount ?? 0), zSummary.creditNoteTotal > 0 ? `(${formatCurrencyStr(zSummary.creditNoteTotal)})` : <CurrencyAmount key="z8cn" amount={0} />],
              ['Exchange Transactions', String(zSummary.exchangeCount ?? 0), <CurrencyAmount key="z8ex" amount={zSummary.exchangeTotal ?? 0} />],
              ['Total Refunds (Tender)', String(zSummary.totalRefundCount ?? 0), <CurrencyAmount key="z8tr" amount={zSummary.totalRefunds ?? 0} />],
            ]}
          />

          {/* Section 9: Item Movement Summary */}
          {(() => {
            const topItems = Array.isArray(zReportData?.topSellingItems) ? zReportData.topSellingItems : [];
            const itemsReturned = zSummary.totalItemsReturned ?? 0;
            const netQty = zSummary.netQuantitySold ?? zTotalItemsSold;
            return (
              <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                  <span className="text-[#327F74]"><Package className="h-4 w-4" /></span>
                  <span className="text-sm text-[#1E293B]">9. Product / Item Movement Summary</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F7F7FA] text-gray-500">
                      <th className="px-4 py-2 text-left font-medium border-b border-[#327F74]/10">Description</th>
                      <th className="px-4 py-2 text-right font-medium border-b border-[#327F74]/10">Quantity</th>
                      <th className="px-4 py-2 text-right font-medium border-b border-[#327F74]/10">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Total Items Sold', String(zTotalItemsSold), <CurrencyAmount key="z9s" amount={zTotalSales} />],
                      ['Total Items Returned', String(itemsReturned), itemsReturned > 0 ? `(${formatCurrencyStr(zSummary.salesReturnTotal ?? 0)})` : <CurrencyAmount key="z9rt" amount={0} />],
                      ['Net Quantity Sold', String(netQty), <CurrencyAmount key="z9n" amount={zTotalSales} />],
                    ].map(([d, q, a], i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                        <td className="px-4 py-2 text-[#1E293B]">{d}</td>
                        <td className="px-4 py-2 text-right text-[#1E293B]">{q}</td>
                        <td className="px-4 py-2 text-right text-[#1E293B]">{a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {topItems.length > 0 && (
                  <div className="px-4 py-3 border-t border-[#327F74]/10">
                    <p className="text-xs font-semibold text-[#1E293B] mb-2">Top Selling Items</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="px-2 py-1 text-left font-medium">Item Code</th>
                          <th className="px-2 py-1 text-left font-medium">Item Name</th>
                          <th className="px-2 py-1 text-right font-medium">Qty</th>
                          <th className="px-2 py-1 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topItems.map((it, i) => (
                          <tr key={i} className="border-t border-gray-50">
                            <td className="px-2 py-1 text-[#327F74]">{it.itemCode || '—'}</td>
                            <td className="px-2 py-1 text-[#1E293B]">{it.itemName || '—'}</td>
                            <td className="px-2 py-1 text-right text-[#1E293B]">{it.quantity ?? 0}</td>
                            <td className="px-2 py-1 text-right text-[#1E293B]"><CurrencyAmount amount={it.amount ?? 0} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Section 10: Cashier Wise Summary — backend-aggregated per session owner, with
          cash/card/credit split from actual tender (sales_payments), so a split
          Cash+Card sale correctly shows in both columns instead of landing nowhere
          (the per-session totalCashSales/totalCardSales counters never see "mixed"
          sales — those are bucketed into a separate totalMixedSales counter only). */}
          {(() => {
            const cashierWise = Array.isArray(zReportData?.cashierWiseSummary) ? zReportData.cashierWiseSummary : [];
            const cashierRows = cashierWise.map((c, i) => [
              c.cashier || '—',
              String(c.invoiceCount || 0),
              <CurrencyAmount key={`c10ns${i}`} amount={c.netSales ?? 0} />,
              <CurrencyAmount key={`c10ca${i}`} amount={c.cash ?? 0} />,
              <CurrencyAmount key={`c10cd${i}`} amount={c.card ?? 0} />,
              <CurrencyAmount key={`c10cr${i}`} amount={c.credit ?? 0} />,
            ]);
            return (
              <ZRTable
                title="10. Cashier Wise Summary"
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
            const reportNo = zId ? `ZR-${String(zId).padStart(9, '0')}` : `ZR-${zReportDate?.replace(/-/g, '')}-001`;
            const totalExpectedCash = zOpeningCash + zCashSales;
            return (
              <div className="bg-[#1E293B] border border-[#327F74]/40 rounded-lg shadow p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-4 w-4 text-[#F5C742]" />
                  <span className="text-sm text-white">13. Final Day Close Summary</span>
                  <span className="ml-auto text-xs bg-[#F5C742] text-[#1E293B] px-2 py-0.5 rounded">Z-Report #{reportNo}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        </>)}
      </div>
    );
  };

  // X-Report View (Session Close Report)
  const renderXReport = () => {
    const denomKeys = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.50', '0.25'];
    const denomLabels = { '1000': 'AED 1000', '500': 'AED 500', '200': 'AED 200', '100': 'AED 100', '50': 'AED 50', '20': 'AED 20', '10': 'AED 10', '5': 'AED 5', '1': 'AED 1 Coin', '0.50': 'AED 0.50 Coin', '0.25': 'AED 0.25 Coin' };
    const reportDenominations = getReportClosingDenominations();
    const actualCash = calculateDenominationTotal(reportDenominations);
    // Once closed, reportDenominations comes from the immutable backend snapshot and
    // ignores further local edits — disable the inputs so they can't be edited with
    // no visible effect.
    const isSessionClosed = (xReportData?.session?.status || currentSession?.status || 'OPEN').toUpperCase() === 'CLOSED';

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
              {cols.map((c, i) => <th key={i} className={`px-4 py-2 text-left font-medium border-b border-[#327F74]/10 ${i > 0 ? 'text-right' : ''}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={`border-b border-gray-50 ${highlightLast && ri === rows.length - 1 ? 'bg-[#FFF8DC]' : 'hover:bg-[#F7F7FA]/60'}`}>
                {r.map((cell, ci) => <td key={ci} className={`px-4 py-2 text-[#1E293B] ${ci > 0 ? 'text-right' : ''} ${highlightLast && ri === rows.length - 1 ? 'font-semibold' : ''}`}>{renderAED(cell)}</td>)}
              </tr>
            ))}
            {footerRow && (
              <tr className="bg-[#F5C742]/10 border-t border-[#F5C742]/30">
                {footerRow.map((cell, ci) => <td key={ci} className={`px-4 py-2 font-semibold text-[#1E293B] ${ci > 0 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
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
          <div className="flex flex-wrap items-start justify-between gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
              <select value={reportPrintMode} onChange={e => setReportPrintMode(e.target.value)} title="Print / preview format" className="border border-gray-300 text-gray-600 text-xs px-2 py-1.5 rounded bg-white focus:outline-none">
                <option value="a4">A4</option>
                <option value="80mm">Thermal 80mm</option>
                <option value="58mm">Thermal 58mm</option>
              </select>
              <button onClick={handleXReportPreview} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><Eye className="h-3 w-3" />Preview</button>
              <button onClick={handleXReportExportPDF} disabled={!isSessionClosed} title={!isSessionClosed ? 'Close the session first to export the X-Report.' : undefined} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><FileText className="h-3 w-3" />Export PDF</button>
              <button onClick={handleXReportExportExcel} disabled={!isSessionClosed} title={!isSessionClosed ? 'Close the session first to export the X-Report.' : undefined} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><Download className="h-3 w-3" />Export Excel</button>
              <button onClick={handleXReportPrint} disabled={!isSessionClosed} title={!isSessionClosed ? 'Close the session first to print the X-Report.' : undefined} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><Printer className="h-3 w-3" />Print</button>
              <button onClick={loadXReport} disabled={xReportLoading} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-50">
                {xReportLoading ? <><div className="w-3 h-3 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin" />Loading...</> : <><FileBarChart className="h-3 w-3" />Generate X-Report</>}
              </button>
              <button
                onClick={openCloseSessionDialog}
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
            const openedAt = sess?.openedAt ? parseUTCDate(sess.openedAt)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div className="flex flex-wrap gap-2 items-end bg-white border border-[#327F74]/20 rounded-lg p-3 mb-4 shadow-sm">
                {[
                  { label: 'Business Date', val: businessDate, type: 'date' },
                  { label: 'Branch / Outlet', val: branchName, type: 'text' },
                  { label: 'POS Terminal', val: terminalId, type: 'text' },
                  { label: 'Cashier', val: cashier, type: 'text' },
                  { label: 'Session No.', val: sessionNo, type: 'text' },
                  { label: 'Session Opened Time', val: openedAt, type: 'text' },
                  { label: 'Current Time', val: currentTime, type: 'text' },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-1 min-w-[120px]">
                    <label className="text-xs text-gray-500">{f.label}</label>
                    <input readOnly value={f.val} type={f.type === 'date' ? 'date' : 'text'} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs text-[#1E293B] bg-[#F7F7FA] focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 text-xs">
                {[
                  ['Branch / Outlet', xReportData?.session?.branchName || currentSession?.branchName || '—'],
                  ['POS Terminal', xReportData?.session?.terminalId || currentTerminal?.terminalId || '—'],
                  ['Counter', xReportData?.session?.counterName || currentTerminal?.counterName || '—'],
                  ['Report Type', 'X-Report / Close Session Report'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                ))}
              </div>
              <div className="space-y-1 text-xs">
                {[
                  ['Session No.', xReportData?.session?.id ? `SESS-${String(xReportData.session.id).padStart(6, '0')}` : currentSession?.id ? `SESS-${String(currentSession.id).padStart(6, '0')}` : '—'],
                  ['Business Date', xReportData?.session?.sessionDate || currentSession?.sessionDate || new Date().toLocaleDateString()],
                  ['Cashier', xReportData?.session?.openedBy || currentSession?.openedBy || '—'],
                  ['Opened At', xReportData?.session?.openedAt ? parseUTCDate(xReportData.session.openedAt)?.toLocaleTimeString() : currentSession?.openedAt ? parseUTCDate(currentSession.openedAt)?.toLocaleTimeString() : '—'],
                  ['Status', xReportData?.session?.status || currentSession?.status || 'OPEN'],
                  ['Invoice Count', String(invoiceCount)],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-gray-500 w-40 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                ))}
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
            {[
              { label: 'Opening Cash / Float', value: <CurrencyAmount amount={openingCashVal} />, icon: <Wallet className="h-4 w-4" /> },
              { label: 'Total Sales', value: <CurrencyAmount amount={totalSales} />, icon: <TrendingUp className="h-4 w-4" /> },
              { label: 'Cash Sales', value: <CurrencyAmount amount={cashSales} />, icon: <Banknote className="h-4 w-4" /> },
              { label: 'Card Sales', value: <CurrencyAmount amount={cardSales} />, icon: <CreditCard className="h-4 w-4" /> },
              { label: 'Credit Sales', value: <CurrencyAmount amount={creditSales} />, icon: <FileText className="h-4 w-4" /> },
              { label: 'Expected Cash', value: <CurrencyAmount amount={expectedCashVal} />, icon: <Calculator className="h-4 w-4" /> },
              { label: 'Actual Cash Counted', value: <CurrencyAmount amount={actualCash} />, icon: <CheckCircle className="h-4 w-4" /> },
              { label: 'Cash Variance', value: <CurrencyAmount amount={Math.abs(cashVariance)} />, icon: <AlertCircle className="h-4 w-4" />, badge: actualCash === 0 ? 'Pending' : varStatus, badgeColor: isBalanced ? 'bg-green-100 text-green-700' : cashVariance < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1 text-[#327F74]">{k.icon}<span className="text-xs text-gray-400 leading-tight">{k.label}</span></div>
                <div className="text-sm font-bold text-[#1E293B]">{k.value}</div>
                {k.badge && <span className={`text-xs rounded px-1.5 py-0.5 w-fit ${k.badgeColor}`}>{k.badge}</span>}
              </div>
            ))}
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                              value={reportDenominations[k] || 0}
                              onChange={e => setClosingDenominations({ ...closingDenominations, [k]: parseInt(e.target.value) || 0 })}
                              disabled={isSessionClosed}
                              className="w-16 border border-[#327F74]/30 rounded px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-[#F5C742] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right text-[#1E293B]">
                            <DirhamSymbol /> {(parseFloat(k) * (reportDenominations[k] || 0)).toFixed(2)}
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
                cols={['Description', 'Amount']}
                rows={[
                  ['Opening Cash / Float', <CurrencyAmount key="oc" amount={openingCashVal} />],
                  ['Cash Sales', <CurrencyAmount key="cs" amount={cashSales} />],
                  ['Cash Paid In', <CurrencyAmount key="ci" amount={cashDropIn} />],
                  ['Less: Cash Paid Out', cashDropOut > 0 ? `(${formatCurrencyStr(cashDropOut)})` : <CurrencyAmount key="co" amount={0} />],
                  ['Expected Cash in Drawer', <span key="ec" className="font-bold text-[#327F74]"><CurrencyAmount amount={expectedCashVal} /></span>],
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
                    ['Expected Cash in Drawer', <CurrencyAmount amount={expectedCashVal} />, 'text-[#1E293B]'],
                    ['Actual Cash Counted', <CurrencyAmount amount={actualCash} />, 'text-[#1E293B]'],
                    ['Cash Difference / Variance', <>{cashVariance < 0 ? '(' : ''}<CurrencyAmount amount={Math.abs(cashVariance)} />{cashVariance < 0 ? ')' : ''}</>, cashVariance < 0 ? 'text-red-600' : cashVariance > 0 ? 'text-amber-600' : 'text-green-600'],
                  ].map(([l, v, c]) => (
                    <div key={l} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                      <span className="text-gray-600">{l}</span>
                      <span className={`font-semibold ${c}`}>{v}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="text-gray-600">Cash Status:</span>
                    <span className={`text-xs rounded px-2 py-0.5 font-semibold ${isBalanced ? 'bg-green-100 text-green-700' : cashVariance < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {actualCash === 0 ? 'Pending — Enter Count' : varStatus}
                    </span>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 mb-1 block">Variance Reason / Remarks {!isBalanced && actualCash > 0 && <span className="text-red-500">*</span>}</label>
                    <textarea
                      value={xReportVarianceRemarks}
                      onChange={e => setXReportVarianceRemarks(e.target.value)}
                      placeholder="Enter variance reason..."
                      className="w-full border border-[#327F74]/30 rounded p-2 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]"
                    />
                  </div>
                  {!isBalanced && actualCash > 0 && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded p-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700">Variance exceeds allowed limit. Supervisor approval is required to close session.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 13: Manual Actions */}
              {(() => {
                // Reuses the same backend-computed bill-discount figures as Section 8
                // (no separate client recompute of the same number), and sources
                // "Session Reopened" from the audit log rather than a hardcoded '0'.
                const discountCount = xSummary.billDiscountCount ?? 0;
                const discountTotal = xSummary.billDiscount ?? 0;
                const reopenedCount = xSummary.sessionReopenedCount ?? 0;
                return (
                  <XRTable
                    title="14. Manual Actions / Exception Summary"
                    icon={<AlertTriangle className="h-4 w-4" />}
                    cols={['Action Type', 'Count', 'Remarks']}
                    rows={[
                      ['Manual Discount', String(discountCount), discountTotal > 0 ? formatCurrencyStr(discountTotal) : '—'],
                      ['Item Void', String(xSummary.voidItemCount ?? 0), xSummary.voidItemCount > 0 ? `${xSummary.voidItemCount} items` : '—'],
                      ['Session Reopened', String(reopenedCount), reopenedCount > 0 ? `${reopenedCount} time(s)` : '—'],
                    ]}
                  />
                );
              })()}

              {/* Section 14: Checklist — every flag below is derived live from real
                session/cash/card/hold-bill state, never from user input. Cashiers
                cannot tick these; they reflect actual validation outcomes. */}
              <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                  <span className="text-[#327F74]"><CheckCircle className="h-4 w-4" /></span>
                  <span className="text-sm text-[#1E293B]">15. Close Session Confirmation</span>
                </div>
                <div className="p-4 space-y-2">
                  {(() => {
                    const sessionStatusNow = (xReportData?.session?.status || currentSession?.status || 'OPEN').toUpperCase();
                    const supervisorApprovalRequired = !isBalanced && actualCash > 0;
                    const closeChecklist = {
                      cashCount: actualCash > 0,
                      varianceReviewed: actualCash > 0 && (isBalanced || xReportVarianceRemarks.trim().length > 0),
                      cardSettlement: xReportCardVerified,
                      holdBills: (heldSales || []).length === 0,
                      supervisorApproval: !supervisorApprovalRequired,
                      sessionClosed: sessionStatusNow === 'CLOSED',
                    };
                    return [
                      ['cashCount', 'Cash Count Completed'],
                      ['varianceReviewed', 'Variance Reviewed'],
                      ['cardSettlement', 'Card Settlement Verified'],
                      ['holdBills', 'Pending Hold Bills Checked'],
                      ['supervisorApproval', 'Supervisor Approval'],
                      ['sessionClosed', 'Session Closed Successfully'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-not-allowed">
                        <input
                          type="checkbox"
                          checked={closeChecklist[key]}
                          disabled
                          readOnly
                          className="h-3.5 w-3.5 accent-[#327F74] rounded cursor-not-allowed disabled:opacity-100"
                        />
                        <span className={`text-xs transition-colors duration-200 ${closeChecklist[key] ? 'text-green-700 line-through' : 'text-[#1E293B]'}`}>{label}</span>
                        {closeChecklist[key] && <span className="text-xs text-green-500 ml-auto">&#x2713;</span>}
                      </label>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div>
              {/* Section 4: Payment / Tender Summary */}
              <XRTable
                title="4. Payment / Tender Summary"
                icon={<CreditCard className="h-4 w-4" />}
                cols={['Payment Mode', 'Count', 'Amount']}
                rows={[
                  ['Cash', xSummary.cashInvoiceCount ?? '—', <CurrencyAmount key="cs4" amount={cashSales} />],
                  ['Card', xSummary.cardInvoiceCount ?? '—', <CurrencyAmount key="cd4" amount={cardSales} />],
                  ['Credit', xSummary.creditInvoiceCount ?? '—', <CurrencyAmount key="cr4" amount={creditSales} />],
                  ...((xSummary.otherSales ?? 0) > 0
                    ? [['Online', xSummary.otherInvoiceCount ?? '—', <CurrencyAmount key="ot4" amount={xSummary.otherSales} />]]
                    : []),
                ].filter(r => r[2] !== undefined)}
                // Total Collection = actual tender taken across every mode (cash+card+credit+other),
                // not the invoice count/value — they can differ (e.g. credit notes, rounding).
                footerRow={['Total Collection', String(xSummary.totalTenderCount ?? invoiceCount), <CurrencyAmount key="tc4" amount={xSummary.totalPaid ?? totalSales} />]}
              />

              {/* Section 5: Card / Bank Settlement */}
              {(() => {
                // Sourced from the same authoritative tender aggregate as the "Card Sales" KPI
                // and Section 4 (xSummary.cardSales/cardInvoiceCount) — not re-derived from
                // invoice.paymentMode text-matching, which double-counted split payments and
                // could disagree with the rest of the report. Refunds come from real refund
                // Payment rows for this session (xSummary.cardRefundSales/cardRefundCount),
                // not the unrelated item-void counter.
                const cardPayTotal = Number(cardSales) || 0;
                const cardPayCount = Number(xSummary.cardInvoiceCount ?? 0);
                const cardRefundTotal = Number(xSummary.cardRefundSales ?? 0);
                const cardRefundCount = Number(xSummary.cardRefundCount ?? 0);
                const netCardSettle = cardPayTotal - cardRefundTotal;
                const netCardCount = Math.max(0, cardPayCount - cardRefundCount);
                const bankTotal = Number(xSummary.bankTransferSales ?? 0);
                const onlineTotal = Number(xSummary.walletSales ?? 0);
                const cardTypeBreakdown = Array.isArray(xSummary.cardTypeBreakdown) ? xSummary.cardTypeBreakdown : [];
                const cardRows = [
                  ...cardTypeBreakdown.map((row, i) => [row.cardType, String(row.count ?? 0), <CurrencyAmount key={`cs5ct${i}`} amount={row.amount ?? 0} />]),
                  ['Card Payments', String(cardPayCount), <CurrencyAmount key="cs5cp" amount={cardPayTotal} />],
                  ['Card Refunds', String(cardRefundCount), cardRefundTotal > 0 ? <span key="cs5rf" className="text-red-600">({formatCurrencyStr(cardRefundTotal)})</span> : <CurrencyAmount key="cs5rf0" amount={0} />],
                  ['Net Card Settlement', String(netCardCount), <CurrencyAmount key="cs5nc" amount={netCardSettle} />],
                  ...(bankTotal > 0 ? [['Bank Transfer Payments', '—', <CurrencyAmount key="cs5bt" amount={bankTotal} />]] : []),
                  ...(onlineTotal > 0 ? [['Online / Wallet Payments', '—', <CurrencyAmount key="cs5ow" amount={onlineTotal} />]] : []),
                ];
                return (
                  <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm mb-4">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#327F74]/10 bg-[#F7F7FA] rounded-t-lg">
                      <span className="text-[#327F74]"><CreditCard className="h-4 w-4" /></span>
                      <span className="text-sm text-[#1E293B]">5. Card / Bank Settlement Summary</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr className="bg-[#F7F7FA] text-gray-500">{['Description', 'Count', 'Amount'].map((c, i) => <th key={i} className={`px-4 py-2 text-left font-medium border-b border-[#327F74]/10 ${i > 0 ? 'text-right' : ''}`}>{c}</th>)}</tr></thead>
                      <tbody>
                        {cardRows.map((r, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-[#F7F7FA]/60">
                            {r.map((cell, ci) => <td key={ci} className={`px-4 py-2 text-[#1E293B] ${ci > 0 ? 'text-right' : ''}`}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-4 border-t border-[#327F74]/10 flex items-center gap-6">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Card Machine Batch No.</label>
                        <input value={xReportCardBatchNo} onChange={e => setXReportCardBatchNo(e.target.value)} placeholder="BATCH-001" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Card Settlement Verified:</label>
                        <button onClick={() => setXReportCardVerified(!xReportCardVerified)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${xReportCardVerified ? 'bg-[#327F74]' : 'bg-gray-200'}`}>
                          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${xReportCardVerified ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                        <span className={`text-xs ${xReportCardVerified ? 'text-green-600' : 'text-gray-400'}`}>{xReportCardVerified ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Section 6: Session Summary */}
              <XRTable
                title="6. Session Summary"
                icon={<BarChart2 className="h-4 w-4" />}
                cols={['Description', 'Value']}
                rows={[
                  ['Opening Cash / Float', <CurrencyAmount key="s6oc" amount={openingCashVal} />],
                  ['Total Sales Invoices', String(invoiceCount)],
                  ['Total Sales Amount', <CurrencyAmount key="s6ts" amount={xSummary.salesAmountExTax ?? totalSales} />],
                  ['Total Discount', xSummary.totalDiscount > 0 ? `(${formatCurrencyStr(xSummary.totalDiscount ?? 0)})` : <CurrencyAmount key="s6td" amount={0} />],
                  ['VAT Amount', <CurrencyAmount key="s6vat" amount={xSummary.totalTax ?? 0} />],
                  ['Net Sales Including VAT', <span key="s6ns" className="font-bold text-[#327F74]"><CurrencyAmount amount={totalSales} /></span>],
                ]}
                highlightLast
              />

              {/* Section 7: Invoice / Transaction Summary */}
              <XRTable
                title="7. Invoice / Transaction Summary"
                icon={<FileText className="h-4 w-4" />}
                cols={['Description', 'Count', 'Amount']}
                rows={[
                  ['Sales Invoices', String(invoiceCount), <CurrencyAmount key="s7si" amount={totalSales} />],
                  ['Void Items', String(xSummary.voidItemCount ?? 0), '—'],
                ]}
              />

              {/* Section 8: Credit Sales Summary */}
              {(() => {
                // Per-invoice credit breakdown, filtered the same way as the Z-Report's
                // credit invoice list (paymentMode contains "credit", excludes "credit card")
                // so this section's invoice rows agree with the creditSales KPI/Section 4 total.
                const xInvoices = xReportData?.invoices || [];
                const creditInvoicesList = xInvoices.filter(inv =>
                  inv.paymentMode?.toLowerCase().includes('credit') && !inv.paymentMode?.toLowerCase().includes('card'));
                const creditRows = creditInvoicesList.length > 0
                  ? creditInvoicesList.map((inv, i) => [
                    inv.invoiceNumber || '—',
                    inv.customerName || inv.customer?.name || '—',
                    <CurrencyAmount key={`cs8-${i}`} amount={inv.invoiceTotal ?? 0} />,
                  ])
                  : [['—', 'No credit sales this session', <CurrencyAmount key="cs8-0" amount={0} />]];
                return (
                  <XRTable
                    title="8. Credit Sales Summary"
                    icon={<FileText className="h-4 w-4" />}
                    cols={['Invoice No.', 'Customer', 'Amount']}
                    rows={creditRows}
                    footerRow={['Total Credit Sales', String(xSummary.creditInvoiceCount ?? creditInvoicesList.length), <CurrencyAmount key="cs8t" amount={creditSales} />]}
                  />
                );
              })()}

              {/* Section 9: Discount & Promotion Summary */}
              {(() => {
                // Sourced entirely from the backend's authoritative discount aggregation
                // (xSummary.billDiscount/lineDiscount + counts) instead of recomputing only
                // the bill-level figure from raw invoices client-side — that left line-item
                // discounts silently missing, so the footer (which used totalDiscount, bill+line)
                // never matched the sum of the rows actually shown.
                const billDiscountCount = xSummary.billDiscountCount ?? 0;
                const billDiscountTotal = xSummary.billDiscount ?? 0;
                const lineDiscountCount = xSummary.lineDiscountCount ?? 0;
                const lineDiscountTotal = xSummary.lineDiscount ?? 0;
                const totalDiscount = xSummary.totalDiscount ?? (billDiscountTotal + lineDiscountTotal);
                const totalDiscountCount = billDiscountCount + lineDiscountCount;
                return (
                  <XRTable
                    title="9. Discount Summary"
                    icon={<Tag className="h-4 w-4" />}
                    cols={['Discount Type', 'Count', 'Amount']}
                    rows={[
                      ['Bill Level Discount', String(billDiscountCount), <CurrencyAmount key="d8b" amount={billDiscountTotal} />],
                      ['Line Item Discount', String(lineDiscountCount), <CurrencyAmount key="d8l" amount={lineDiscountTotal} />],
                    ]}
                    footerRow={['Total Discount', String(totalDiscountCount), totalDiscount > 0 ? `(${formatCurrencyStr(totalDiscount)})` : <CurrencyAmount key="d8t" amount={0} />]}
                  />
                );
              })()}

              {/* Section 10: Returns / Refund Summary */}
              <XRTable
                title="10. Returns / Refund Summary"
                icon={<RotateCcw className="h-4 w-4" />}
                cols={['Description', 'Count', 'Amount']}
                rows={[
                  ['Sales Returns', String(xSummary.salesReturnCount ?? 0), xSummary.salesReturnTotal > 0 ? `(${formatCurrencyStr(xSummary.salesReturnTotal)})` : <CurrencyAmount key="r9sr" amount={0} />],
                  ['Refunds Processed', String(xSummary.refundCount ?? 0), xSummary.refundTotal > 0 ? `(${formatCurrencyStr(xSummary.refundTotal)})` : <CurrencyAmount key="r9rf" amount={0} />],
                  ['Credit Notes Issued', String(xSummary.creditNoteCount ?? 0), xSummary.creditNoteTotal > 0 ? `(${formatCurrencyStr(xSummary.creditNoteTotal)})` : <CurrencyAmount key="r9cn" amount={0} />],
                  ['Exchange Transactions', String(xSummary.exchangeCount ?? 0), <CurrencyAmount key="r9ex" amount={xSummary.exchangeTotal ?? 0} />],
                  ['Total Refunds (In-session)', String(xSummary.totalRefundCount ?? 0), <CurrencyAmount key="r9r" amount={xSummary.totalRefunds ?? 0} />],
                ]}
              />

              {/* Section 11: VAT / Tax Summary */}
              <XRTable
                title="11. VAT / Tax Summary"
                icon={<FileBarChart className="h-4 w-4" />}
                cols={['Tax Type', 'Taxable Amount', 'Tax Amount', 'Total Amount']}
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

              {/* Section 12: Item Movement */}
              <XRTable
                title="12. Item Movement Summary"
                icon={<Package className="h-4 w-4" />}
                cols={['Description', 'Quantity', 'Amount']}
                rows={[
                  ['Total Items Sold', String(xSummary.totalItemsSold ?? 0), <CurrencyAmount key="im1" amount={totalSales} />],
                  ['Net Quantity Sold', String(xSummary.totalItemsSold ?? 0), <CurrencyAmount key="im3" amount={totalSales} />],
                ]}
              />

              {/* Section 13: Document Numbers */}
              {(() => {
                const xInvoices = xReportData?.invoices || [];
                const invNums = xInvoices.map(i => i.invoiceNumber).filter(Boolean).sort();
                const firstInv = invNums[0] || '—';
                const lastInv = invNums[invNums.length - 1] || '—';
                return (
                  <XRTable
                    title="13. Opening & Closing Document Numbers"
                    icon={<Hash className="h-4 w-4" />}
                    cols={['Document Type', 'Starting No.', 'Ending No.']}
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
                  <span className="text-sm text-[#1E293B]">16. Declaration &amp; Approval</span>
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-600 mb-3 bg-[#F7F7FA] rounded p-2 border-l-2 border-[#327F74]">
                    I confirm that the above sales, collections, refunds, cash drawer balance, and denomination count have been verified for this POS session.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Cashier Name</label>
                      <input value={xReportCashierName} onChange={e => setXReportCashierName(e.target.value)} className="mt-0.5 w-full border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Supervisor / Manager Name</label>
                      <input value={xReportSupervisorName} onChange={e => setXReportSupervisorName(e.target.value)} placeholder="Enter name" className="mt-0.5 w-full border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
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
                      <textarea value={xReportClosingRemarks} onChange={e => setXReportClosingRemarks(e.target.value)} placeholder="Enter remarks..." className="mt-0.5 w-full border border-[#327F74]/30 rounded p-2 text-xs resize-none h-14 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
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
                  <li>X-Report number auto-generated for audit: <strong>{xReportData?.session?.id ? `XR-${String(xReportData.session.id).padStart(9, '0')}` : currentSession?.id ? `XR-${String(currentSession.id).padStart(9, '0')}` : 'XR-—'}</strong></li>
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
            <button onClick={handleXReportExportPDF} disabled={!isSessionClosed} title={!isSessionClosed ? 'Close the session first to export the X-Report.' : undefined} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><FileText className="h-3 w-3" />Export PDF</button>
            <button onClick={handleXReportExportExcel} disabled={!isSessionClosed} title={!isSessionClosed ? 'Close the session first to export the X-Report.' : undefined} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><Download className="h-3 w-3" />Export Excel</button>
            <button onClick={handleXReportPrint} disabled={!isSessionClosed} title={!isSessionClosed ? 'Close the session first to print the X-Report.' : undefined} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1"><Printer className="h-3 w-3" />Print X-Report</button>
            {!isBalanced && actualCash > 0 ? (
              <button onClick={openCloseSessionDialog} disabled={currentSession?.status !== 'OPEN'} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs px-4 py-2 rounded flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Submit for Approval</button>
            ) : (
              <button onClick={openCloseSessionDialog} disabled={currentSession?.status !== 'OPEN'} className="border border-[#327F74]/40 text-[#327F74] disabled:opacity-50 text-xs px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><FileBarChart className="h-3 w-3" />Submit for Approval</button>
            )}
            <button
              onClick={openCloseSessionDialog}
              disabled={currentSession?.status !== 'OPEN'}
              className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-5 py-2 rounded flex items-center gap-1">
              <Lock className="h-3 w-3" />{currentSession?.status === 'CLOSED' ? 'Session Closed' : 'Close Session'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Customer Management View — see POS/CustomerView.jsx

  const consoleProps = {
    currentTerminal, setCurrentTerminal, setTerminalsLoading, setTerminalList, setEditingTerminalId, setEditTerminalName, setEditCounterName, setTerminalSaving, editTerminalName, editCounterName, terminalList,
    setCurrentView, consoleTab, setConsoleTab, settingsSaving, setSettingsSaving, posSettings, setPosSettings, settingsSavedFlash, setSettingsSavedFlash,
    tplOutletName, setTplOutletName, tplOutletTrn, setTplOutletTrn, tplOutletAddress, setTplOutletAddress, tplOutletPhone, setTplOutletPhone,
    tplLogoDataUrl, setTplLogoDataUrl, tplStampDataUrl, setTplStampDataUrl,
    tplReceiptHeader, setTplReceiptHeader, tplReceiptFooter, setTplReceiptFooter, tplReceiptPaper, setTplReceiptPaper,
    tplReceiptShowLogo, tplReceiptShowTrn, tplReceiptShowStamp, tplReceiptShowBarcode, tplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails,
    tplReceiptColItemCode, tplReceiptColItemImage, tplReceiptColBatchNo, tplReceiptColDiscount, tplReceiptColVatPct, tplReceiptColVatAmt,
    tplReceiptShowGrandTotalBanner, tplReceiptShowTerms, tplReceiptShowNotes, tplReceiptShowBankDetails, tplReceiptShowQRCode, tplReceiptShowSignature,
    tplInvoiceHeader, setTplInvoiceHeader, tplInvoiceFooter, setTplInvoiceFooter, tplInvoicePaper, setTplInvoicePaper,
    tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn, tplInvoiceShowCustomerDetails, tplInvoiceShowStamp, tplInvoiceShowSignature,
    tplInvoiceShowGrandTotalBanner, tplInvoiceShowTerms, tplInvoiceShowNotes, tplInvoiceShowBankDetails, tplInvoiceShowQRCode,
    tplInvoiceQrPlacement, setTplInvoiceQrPlacement,
    tplInvoiceColItemCode, tplInvoiceColItemImage, tplInvoiceColBarcode, setTplInvoiceColBarcode, tplInvoiceColBatchNo, tplInvoiceColDiscount, tplInvoiceColVatPct, tplInvoiceColVatAmt,
    tplReturnHeader, setTplReturnHeader, tplReturnFooter, setTplReturnFooter, tplReturnPaper, setTplReturnPaper,
    tplReturnShowLogo, tplReturnShowTrn, tplReturnShowStamp, tplReturnShowCompanyDetails, tplReturnShowCustomerDetails,
    tplReturnColItemCode, tplReturnColBatchNo, tplReturnColDiscount, tplReturnColVatPct, tplReturnColVatAmt,
    tplReturnShowGrandTotalBanner, tplReturnShowTerms, tplReturnShowNotes, tplReturnShowQRCode, tplReturnShowSignature, tplReturnShowCreditBalance,
    tplJobCardFooter, setTplJobCardFooter, tplJobCardPaper, setTplJobCardPaper,
    tplJobCardShowLogo, tplJobCardShowTrn, tplJobCardShowStamp, tplJobCardShowCompanyDetails, tplJobCardShowCustomerDetails,
    tplJobCardShowSerialNumber, tplJobCardShowWarranty, tplJobCardShowTechnician, tplJobCardShowExpectedDate, tplJobCardShowCustomerSignature, tplJobCardShowTerms,
    receiptTemplateId, setReceiptTemplateId,
    posTemplate, setPosTemplate, hideCategoriesPanel, setHideCategoriesPanel, hideItemsPanel, setHideItemsPanel, hiddenPanelButtons, togglePanelButton,
    settingsDraft, setSettingsDraft, handleSaveSettings, beginEditSettings,
    consoleDevices, setConsoleDevices, showAddDevice, setShowAddDevice, newDevType, setNewDevType, newDevName, setNewDevName, newDevPort, setNewDevPort, newDevIp, setNewDevIp,
    printerConfigs, setPrinterConfigs, printersLoading, loadPrinterConfigs,
    scannerConfig, setScannerConfig, saveScannerConfig, scannerConfigSavedFlash,
    getAllPosTerminals, renamePosTerminal, setTerminalStatus, setMainPosTerminal, savePosSettings, templateSubTab, setTemplateSubTab,
    setTplReceiptShowLogo, setTplReceiptShowCompanyDetails, setTplReceiptShowTrn, setTplReceiptShowCustomerDetails, setTplReceiptShowTerms, setTplReceiptShowNotes, setTplReceiptShowBankDetails, setTplReceiptShowQRCode, setTplReceiptShowStamp, setTplReceiptShowSignature, setTplReceiptShowGrandTotalBanner, setTplReceiptColItemCode, setTplReceiptColItemImage, setTplReceiptShowBarcode, setTplReceiptColBatchNo, setTplReceiptColDiscount, setTplReceiptColVatPct, setTplReceiptColVatAmt,
    setTplInvoiceShowLogo, setTplInvoiceShowCompanyDetails, setTplInvoiceShowTrn, setTplInvoiceShowCustomerDetails, setTplInvoiceShowTerms, setTplInvoiceShowNotes, setTplInvoiceShowBankDetails, setTplInvoiceShowQRCode, setTplInvoiceShowStamp, setTplInvoiceShowSignature, setTplInvoiceShowGrandTotalBanner, setTplInvoiceColItemCode, setTplInvoiceColItemImage, setTplInvoiceColBatchNo, setTplInvoiceColDiscount, setTplInvoiceColVatPct, setTplInvoiceColVatAmt,
    setTplReturnShowLogo, setTplReturnShowCompanyDetails, setTplReturnShowTrn, setTplReturnShowCustomerDetails, setTplReturnShowTerms, setTplReturnShowNotes, setTplReturnShowQRCode, setTplReturnShowStamp, setTplReturnShowSignature, setTplReturnShowGrandTotalBanner, setTplReturnColItemCode, setTplReturnColBatchNo, setTplReturnColDiscount, setTplReturnColVatPct, setTplReturnColVatAmt, setTplReturnShowCreditBalance,
    setTplJobCardShowLogo, setTplJobCardShowCompanyDetails, setTplJobCardShowTrn, setTplJobCardShowCustomerDetails, setTplJobCardShowSerialNumber, setTplJobCardShowWarranty, setTplJobCardShowTechnician, setTplJobCardShowExpectedDate, setTplJobCardShowCustomerSignature, setTplJobCardShowTerms, setTplJobCardShowStamp,
    // Template 2 (Arabic) independent Show/Hide toggles + setters
    t2ShowLogo, t2ShowCompanyDetails, t2ShowTrn, t2ShowArabic, t2ShowCustomerDetails, t2ShowAccountBalance, t2ShowDelivery,
    t2ShowVatSummary, t2ShowPaymentDetails, t2ShowLoyalty, t2ShowQRCode, t2ShowFooterText, t2ShowBarcode,
    setT2ShowLogo, setT2ShowCompanyDetails, setT2ShowTrn, setT2ShowArabic, setT2ShowCustomerDetails, setT2ShowAccountBalance, setT2ShowDelivery,
    setT2ShowVatSummary, setT2ShowPaymentDetails, setT2ShowLoyalty, setT2ShowQRCode, setT2ShowFooterText, setT2ShowBarcode,
    editingTerminalId, terminalsLoading, terminalSaving,
  };

  const openQuickCustomerModal = useCallback((searchValue = '') => {
    quickCustomerCreditCtxRef.current = false;
    const str = (searchValue || '').trim();
    let name = '';
    let mobile = '';
    let email = '';
    let trn = '';

    if (str) {
      if (str.includes('@')) {
        email = str;
      } else if (/^\d{15}$/.test(str) && str.startsWith('100')) {
        trn = str;
      } else if (/^(\+?\d{1,4}[\s-]?)?\d{7,10}$/.test(str)) {
        mobile = str;
      } else {
        const parts = str.split(/\s+/);
        const nameParts = [];
        parts.forEach(p => {
          if (p.includes('@')) email = p;
          else if (/^\d{15}$/.test(p) && p.startsWith('100')) trn = p;
          else if (/^(\+?\d{1,4}[\s-]?)?\d{7,10}$/.test(p)) mobile = p;
          else nameParts.push(p);
        });
        name = nameParts.join(' ');
      }
    }

    setQuickCustomerForm({
      name, mobile, email, trn,
      customerType: 'Retail', companyName: '', deliveryAddress: '', deliveryNote: '',
      isCreditCustomer: false, creditLimit: '', openingBalance: '', status: 'Active',
      city: '', country: '', vatDetails: '', notes: '', alternateContact: '', payTerms: 'Cash',
      expandMoreDetails: false
    });
    setQuickCustomerDuplicateWarning(null);
    setQuickCustomerError(null);
    setShowQuickCustomerModal(true);
  }, []);

  const handleSaveQuickCustomer = useCallback(async (overrideDuplicate = false) => {
    try {
      setQuickCustomerLoading(true);
      setQuickCustomerError(null);

      if (!overrideDuplicate) {
        const duplicates = await validateDuplicateCustomer({
          name: quickCustomerForm.name,
          mobile: quickCustomerForm.mobile,
          email: quickCustomerForm.email,
          trn: quickCustomerForm.trn
        });
        if (duplicates && duplicates.length > 0) {
          setQuickCustomerDuplicateWarning(duplicates);
          setQuickCustomerLoading(false);
          return;
        }
      }

      const payload = {
        name: quickCustomerForm.name || 'Unnamed Customer',
        mobile: quickCustomerForm.mobile,
        email: quickCustomerForm.email,
        trn: quickCustomerForm.trn,
        groupType: quickCustomerForm.customerType,
        payTerms: quickCustomerForm.payTerms,
        status: quickCustomerForm.status,
        city: quickCustomerForm.city,
        country: quickCustomerForm.country,
        notes: quickCustomerForm.notes,
        billingAddress: quickCustomerForm.deliveryAddress,
        creditStatus: quickCustomerForm.isCreditCustomer ? 'ALLOWED' : 'NONE',
        creditLimitAmount: quickCustomerForm.creditLimit ? parseFloat(quickCustomerForm.creditLimit) : 0,
        balance: quickCustomerForm.openingBalance ? parseFloat(quickCustomerForm.openingBalance) : 0
      };

      const newCust = await createCustomer(payload);
      await loadPosCustomers();
      // posCustomers (via mapPosCustomer) always stores id as a string, so the
      // freshly-created customer's raw numeric id must be coerced to match —
      // otherwise the strict-equality lookups in selectedCustomerData /
      // creditCustomerData silently miss and the UI falls back to Walk-in.
      const newCustId = String(newCust.id);
      setSelectedCustomer(newCustId);
      if (quickCustomerCreditCtxRef.current) {
        setCheckoutCreditCustomer(newCustId);
        setCheckoutCreditCustomerSearch('');
        quickCustomerCreditCtxRef.current = false;
      }
      if (showDeliveryModal) {
        setDeliveryCustomerId(String(newCust.id));
        if (newCust.billingAddress || newCust.address) {
          setDeliveryAddress(newCust.billingAddress || newCust.address);
        }
      }
      setShowQuickCustomerModal(false);
      showFeedback('success', 'Customer created and selected successfully!');
    } catch (err) {
      setQuickCustomerError(err.response?.data?.message || err.message || 'Failed to create customer');
    } finally {
      setQuickCustomerLoading(false);
    }
  }, [quickCustomerForm, loadPosCustomers, setSelectedCustomer, showDeliveryModal, setDeliveryCustomerId, setDeliveryAddress, showFeedback]);

  const handleSaveQuickProduct = useCallback(async (overrideDuplicate = false) => {
    try {
      setQuickProductLoading(true);
      setQuickProductError(null);

      if (!overrideDuplicate) {
        const duplicates = await validateDuplicateProduct({
          name: quickProductForm.name,
          code: quickProductForm.code,
          sku: quickProductForm.sku,
          barcode: quickProductForm.barcode
        });
        if (duplicates && duplicates.length > 0) {
          setQuickProductDuplicateWarning(duplicates);
          setQuickProductLoading(false);
          return;
        }
      }

      const units = await getUnits();
      const defaultUnit = units.find(u => u.name?.toLowerCase() === quickProductForm.uom?.toLowerCase()) || units[0];
      if (!defaultUnit) {
        throw new Error('No units configured. Please create a unit under Inventory > Units first.');
      }

      const formData = new FormData();
      const productReq = {
        product: {
          name: quickProductForm.name || 'Unnamed Product',
          code: quickProductForm.code || `PRD-${Date.now().toString().slice(-6)}`,
          sku: quickProductForm.sku || `SKU-${Date.now().toString().slice(-6)}`,
          category: quickProductForm.category || 'General',
          status: quickProductForm.status === 'Active' ? 'ACTIVE' : 'DRAFT',
          productType: 'STOCK',
          isBatch: quickProductForm.isBatch,
          isSerial: quickProductForm.isSerial,
          isDiscountAllowed: quickProductForm.isDiscountAllowed,
          availableInPos: true,
          detailedDesc: quickProductForm.description,
          brand: { id: 1 }
        },
        pricing: {
          retailPrice: parseFloat(quickProductForm.salesPrice) || 0,
          cost: parseFloat(quickProductForm.costPrice) || 0,
          purchasePrice: parseFloat(quickProductForm.purchasePrice) || 0
        },
        inventory: {
          openingStock: parseFloat(quickProductForm.openingStock) || 0,
          minStock: parseFloat(quickProductForm.lowStockAlert) || 0,
          trackInventory: quickProductForm.trackInventory,
          allowNegativeStock: quickProductForm.allowNegativeStock,
          defaultUnit: { id: defaultUnit.id },
          packings: [
            {
              level: 'L1',
              unit: defaultUnit.id,
              conversion: 1,
              baseQty: 1,
              isSale: true,
              isPurchase: true,
              isLPO: false,
              cost: parseFloat(quickProductForm.costPrice) || 0,
              price: parseFloat(quickProductForm.salesPrice) || 0,
              barcode: quickProductForm.barcode || ''
            }
          ]
        }
      };

      formData.append('data', JSON.stringify(productReq));

      const newProdRes = await createProduct(formData);
      await loadPosProducts(0, false);

      if (newProdRes && newProdRes.product) {
        addToInvoice(newProdRes.product);
        showFeedback('success', `${newProdRes.product.name} created and added to cart!`);
      }

      setShowQuickProductModal(false);
    } catch (err) {
      setQuickProductError(err.response?.data?.message || err.message || 'Failed to create product');
    } finally {
      setQuickProductLoading(false);
    }
  }, [quickProductForm, loadPosProducts, addToInvoice, showFeedback]);

  const touchScreenProps = {
    showQuickCustomerModal, setShowQuickCustomerModal, quickCustomerForm, setQuickCustomerForm, quickCustomerDuplicateWarning, setQuickCustomerDuplicateWarning, quickCustomerLoading, quickCustomerError, openQuickCustomerModal, handleSaveQuickCustomer,
    showQuickProductModal, setShowQuickProductModal, quickProductForm, setQuickProductForm, quickProductDuplicateWarning, setQuickProductDuplicateWarning, quickProductLoading, quickProductError, handleSaveQuickProduct,
    setCurrentView, currentSession, sessionId,
    currentInvoice, currentInvoiceRef, invoiceCounter,
    posProducts, filteredProducts, posProductsLoading, posProductsLoadingMore, posProductsError,
    posProductPage, posProductTotalPages, posProductTotalElements, loadMorePosProducts,
    productCategories, horizontalCategories, selectedCategory, setSelectedCategory,
    searchQuery, setSearchQuery, barcodeInput, setBarcodeInput, barcodeInputRef,
    barcodeScanFeedback, lastScannedItem, handleBarcodeScan, handleUnifiedEntry,
    barcodeSuggestions, barcodeSuggestionsLoading, setBarcodeSuggestions,
    scannerConfig,
    customerOptions, selectedCustomer, setSelectedCustomer, selectedCustomerData,
    customerSearchQuery, setCustomerSearchQuery, showCustomerDropdown, setShowCustomerDropdown,
    filteredCustomerOptions, customerHistory, customerHistoryLoading,
    posCustomersLoading, posCustomersError,
    addToInvoice, updateQuantity, updateDiscount, updateItemPrice, voidFromInvoice,
    guardedRemoveFromInvoice, guardedClearInvoice, holdInvoice, recallInvoice, heldSales, holdBusy, deleteHeldBill,
    activeLayawayId, activeLayawayDeposit, shippingCharge,
    posActionMode, setPosActionMode, selectedFocusItemId, setSelectedFocusItemId,
    classicNumpadMode, setClassicNumpadMode, classicNumpadValue, setClassicNumpadValue,
    classicDiscountType, setClassicDiscountType, discountInputType, setDiscountInputType,
    resetFocusMode,
    rightPanelTab, setRightPanelTab, hiddenPanelButtons, hideCategoriesPanel, hideItemsPanel,
    posTemplate,
    cartViewDetailed, cartLineDetails,
    setShowPaymentDialog, setTenderedAmount, setCheckoutPhase, setCheckoutKeypadMode,
    setCheckoutKeypadTarget, setCheckoutKeypadVisible,
    setShowPOSConfig, setShowCashDropDialog, setShowLastReceiptDialog,
    setShowReprintModal, setShowSaveOrderDialog, setShowLayawaysList, setShowSaveLayaway,
    setShowOrdersListDialog: async () => {
      setOrdersListLoading(true);
      setOrdersListSearch('');
      setOrdersListStatusFilter('All');
      setOrdersListSelected(null);
      setOrdersListSelectedDetail(null);
      setShowOrdersListDialog(true);
      try {
        const result = await getSalesOrdersPage({ page: 0, size: 50 });
        setOrdersList(Array.isArray(result?.content) ? result.content : (Array.isArray(result) ? result : []));
      } catch { setOrdersList([]); } finally { setOrdersListLoading(false); }
    },
    setShowCouponsDialog, setShowPromotionsDialog, setShowPriceCheck, setPriceCheckQuery,
    setPriceCheckResult, setShowProductSearch, setProductSearchQuery, setProductSearchResults,
    setShowCreditBalance, setCreditBalanceQuery, setCreditBalanceResult,
    setShowSerialBatch, setSerialBatchQuery, setSerialBatchResult, setSerialBatchSubView,
    setSerialBatchInvoiceNo, setSerialBatchItemCode, setSerialBatchCustomerMobile, setSerialBatchSelectedItem,
    setShowServiceRepair, setServiceView, setShowReturn, setReturnStep, setReturnInvoiceQuery,
    setReturnInvoiceFound, setReturnSelectedItems, setReturnReasons, setShowAddShippingDialog,
    setShowAddCustomerDialog, setShowDeliveryModal, setDeliveryModalTab, setDeliveryCustomerId,
    setShowDeliverySettleModal, setDeliverySettleSearch, setDeliverySettlePersonFilter,
    setDeliverySettleSelected, setDeliverySettlePayMode, setShowLockPOS,
    openDeliveryModal,
    formatCurrency, showFeedback,
    favouriteProductIds, toggleFavourite,
  };

  return (
    <div className={currentView === 'touch-screen' ? 'h-screen overflow-hidden bg-[#F7F7FA]' : 'min-h-screen bg-[#F7F7FA]'}>
      {/* ─── IDLE LOCK OVERLAY ─── */}
      {isIdleLocked && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 text-center p-8 space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Session Locked</h2>
            <p className="text-sm text-gray-500">This terminal was locked due to inactivity.</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => setIsIdleLocked(false)}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600"
              >
                Resume My Session
              </button>
              <button
                onClick={() => { setIsIdleLocked(false); setShowTakeoverDialog(true); }}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50"
              >
                Supervisor Takeover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUPERVISOR TAKEOVER DIALOG ─── */}
      {showTakeoverDialog && currentSession?.id && (
        <SupervisorTakeoverDialog
          sessionId={currentSession.id}
          onSuccess={(session) => { setCurrentSession(session); setShowTakeoverDialog(false); }}
          onCancel={() => setShowTakeoverDialog(false)}
        />
      )}

      {/* ─── TERMINAL LOCKED BY ACTIVE CASHIER (SHIFT HANDOVER OVERLAY) ─── */}
      {terminalLockedBy && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 p-5 sm:p-8 text-center text-white relative rounded-t-2xl sm:rounded-t-3xl">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/20 shadow-inner">
                <Lock className="h-7 w-7 sm:h-10 sm:w-10 text-white animate-pulse" />
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">Terminal in Active Use</h2>
              <p className="text-white/80 text-xs sm:text-sm font-medium">This POS Terminal has an ongoing session</p>
            </div>
            <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Occupant</p>
                  <p className="text-base sm:text-lg font-extrabold text-slate-800 break-words">{terminalLockedBy}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Session is strictly isolated to prevent multi-device collision.</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <Shield className="h-5 w-5 text-amber-600 shrink-0" />
                  <span>Supervisor Override &amp; Shift Handover</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  A supervisor must sign in to authorize this handover. This action is logged with their identity.
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Supervisor Email or Username</label>
                    <input
                      type="text"
                      autoFocus
                      autoComplete="username"
                      placeholder="supervisor@company.com"
                      value={handoverEmail}
                      onChange={(e) => { setHandoverEmail(e.target.value); setHandoverError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleHandoverSubmit(); }}
                      className={`w-full border rounded-xl px-4 py-2.5 sm:py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#327F74] ${handoverError ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Password</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={handoverPassword}
                      onChange={(e) => { setHandoverPassword(e.target.value); setHandoverError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleHandoverSubmit(); }}
                      className={`w-full border rounded-xl px-4 py-2.5 sm:py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#327F74] ${handoverError ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'}`}
                    />
                  </div>
                  {handoverError && (
                    <p className="text-xs text-red-500 mt-1 text-center font-semibold flex items-center justify-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />{handoverError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setHandoverEmail('');
                    setHandoverPassword('');
                    setHandoverError('');
                    setTerminalLockedBy(null);
                    showFeedback('Viewing dashboard in read-only mode', 'info');
                  }}
                  className="flex-1 py-3 sm:py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                >
                  Dismiss (Read-Only)
                </button>
                <button
                  type="button"
                  disabled={handoverBusy}
                  onClick={handleHandoverSubmit}
                  className="flex-1 py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-[#327F74] to-[#256660] hover:from-[#2a6b61] hover:to-[#1c4d48] text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-4 w-4" />
                  {handoverBusy ? 'Verifying…' : 'Authorize Handover'}
                </button>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] text-slate-400 text-center mb-2">On a different physical device? Your device may have inherited a stale terminal assignment.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('This will assign a new independent terminal to this device.\n\nContinue?')) {
                      localStorage.removeItem('billbull:pos:device_fingerprint');
                      localStorage.removeItem('billbull:pos:terminal_id');
                      window.location.reload();
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-semibold text-xs hover:bg-slate-50 hover:text-slate-700 transition-all"
                >
                  Register as New Terminal (Different Device)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render current view */}
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'console' && <POSConsole {...consoleProps} />}
      {currentView === 'touch-screen' && <POSTouchScreen {...touchScreenProps} />}
      {currentView === 'z-report' && renderZReport()}
      {currentView === 'x-report' && renderXReport()}
      {currentView === 'customer' && <CustomerView customerOptions={customerOptions} posCustomersLoading={posCustomersLoading} setCurrentView={setCurrentView} syncPosData={syncPosData} printerConfigs={printerConfigs} currentTerminal={currentTerminal}
        printTemplate={{
          // Same branding the Tax Invoice header uses, so the Customer Receipt /
          // Receive Advance / Statement prints render an identical logo + company
          // block (req 12). tplLogoDataUrl is a data URL — safe for the ESC/POS
          // raster ditherer — unlike the company profile's logoUrl (a server path).
          logoDataUrl: tplLogoDataUrl,
          companyName: tplOutletName,
          trn: tplOutletTrn,
          address: tplOutletAddress,
          phone: tplOutletPhone,
          showLogo: tplInvoiceShowLogo,
          showTrn: tplInvoiceShowTrn,
          currency: activeCurrency,
        }} />}
      {currentView === 'sales-analytics' && renderSalesAnalytics()}

      {/* Previous Day Session Still Open — blocks silent continuation into a new day (BBQA-5.3-013) */}
      <Dialog open={!!prevDaySessionOpenMsg} onOpenChange={(o) => { if (!o) setPrevDaySessionOpenMsg(null); }}>
        <DialogContent className="sm:max-w-md border-0 shadow-xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Previous Day Not Closed
            </DialogTitle>
            <DialogDescription>{prevDaySessionOpenMsg}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPrevDaySessionOpenMsg(null)}>Cancel</Button>
            <Button
              className="bg-[#327F74] hover:bg-[#286660] text-white"
              onClick={async () => {
                const sessionId = prevDaySessionOpenId;
                setPrevDaySessionOpenMsg(null);
                setPrevDaySessionOpenId(null);
                setShowStartSessionDialog(false);
                if (!sessionId) {
                  // Couldn't parse the session id out of the server message — fall
                  // back to the old (best-effort) behavior rather than dead-ending.
                  setCurrentView('x-report');
                  return;
                }
                try {
                  const session = await getPosSessionById(sessionId);
                  setCurrentSession(session);
                  setXReportData(null);
                  setZReportData(null);
                  setSessionNowMs(Date.now());
                  setCurrentView('x-report');
                } catch (err) {
                  alert(err?.response?.data?.message || 'Failed to load the stale session. Please close it manually.');
                }
              }}
            >
              Go to Close Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Start Session Dialog */}
      <Dialog open={showStartSessionDialog} onOpenChange={setShowStartSessionDialog}>
        <DialogContent className="sm:max-w-3xl border-0 shadow-xl bg-white">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col border-0 shadow-xl bg-white">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-[#1E293B]">Close POS Session</DialogTitle>
            <DialogDescription>Count closing cash and settle card payments before closing</DialogDescription>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl flex-shrink-0">
            {([['cash', 'Cash Count', Banknote], ['card', 'Card Settlement', CreditCard]]).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setCloseSessionTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${closeSessionTab === id
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    // Same source as the X-Report page: prefer the backend's authoritative
                    // expectedCash (live tender + cash drops), falling back to the identical
                    // formula only while xReportData hasn't loaded yet — never the old
                    // simplified opening+totalCashSales calc, which ignored cash drops and
                    // caused the modal to disagree with the X-Report.
                    const xSummaryModal = xReportData?.summary || {};
                    const sessionExpectedCash = xSummaryModal.expectedCash ?? (
                      (Number(currentSession?.openingCash) || 0)
                      + (Number(xSummaryModal.cashSales) || 0)
                      + (Number(xSummaryModal.cashDropIn) || 0)
                      - (Number(xSummaryModal.cashDropOut) || 0)
                    );
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
                  const sessionCardTotal = Number(xReportData?.summary?.cardSales) || 0;
                  const cardTypeBreakdown = Array.isArray(xReportData?.summary?.cardTypeBreakdown)
                    ? xReportData.summary.cardTypeBreakdown : [];
                  const amountByType = {};
                  const countByType = {};
                  cardTypeBreakdown.forEach(row => {
                    const key = String(row.cardType || '').toLowerCase();
                    amountByType[key] = (amountByType[key] || 0) + (Number(row.amount) || 0);
                    countByType[key] = (countByType[key] || 0) + (Number(row.count) || 0);
                  });
                  const visaMastercardAmount = (amountByType['visa'] || 0) + (amountByType['mastercard'] || 0) + (amountByType['card'] || 0);
                  const visaMastercardCount = (countByType['visa'] || 0) + (countByType['mastercard'] || 0) + (countByType['card'] || 0);
                  const amexAmount = amountByType['amex'] || 0;
                  const amexCount = countByType['amex'] || 0;
                  const walletAmount = Number(xReportData?.summary?.walletSales) || 0;
                  const walletCount = Number(xReportData?.summary?.walletInvoiceCount) || 0;
                  const cardRows = [
                    { label: 'Visa / Mastercard', amount: visaMastercardAmount, count: visaMastercardCount },
                    { label: 'American Express', amount: amexAmount, count: amexCount },
                    { label: 'Apple / Google Pay', amount: walletAmount, count: walletCount },
                  ];
                  const totalCardSales = sessionCardTotal + walletAmount;
                  return (
                    <div className="rounded-xl border border-[#327F74]/30 bg-[#327F74]/5 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#327F74] mb-3">Session Card Totals</p>
                      <div className="space-y-2">
                        {cardRows.map((row, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#327F74]/10">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-3.5 w-3.5 text-[#327F74]" />
                              <span className="text-sm text-[#1E293B]">{row.label}</span>
                              <span className="text-[10px] text-gray-400">({row.count} txn)</span>
                            </div>
                            <span className={`text-sm font-bold ${row.amount > 0 ? 'text-[#327F74]' : 'text-gray-300'}`}>
                              {formatCurrency(row.amount)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-sm font-bold text-[#1E293B]">Total Card Sales</span>
                          <span className="text-base font-black text-[#327F74]">{formatCurrency(totalCardSales)}</span>
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
                        value={xReportCardBatchNo}
                        onChange={e => setXReportCardBatchNo(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Variance — also drives cardSettlementVerified, which is what
                      actually gets persisted on close (see handleCloseSession and the
                      sync effect near the state declarations). */}
                  {(() => {
                    const sessionCardTotal = Number(xReportData?.summary?.cardSales) || 0;
                    const settled = parseFloat(cardSettlementAmount) || 0;
                    const cardVariance = settled - sessionCardTotal;
                    return cardSettlementAmount ? (
                      <div className={`mt-3 flex justify-between items-center p-3 rounded border ${Math.abs(cardVariance) < 0.01
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
                  const sessionCardTotal = Number(xReportData?.summary?.cardSales) || 0;
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
            setCheckoutSettling(false);
            // Clear the finalize indicator on close — the receipt print is a
            // fire-and-forget background task and doesn't need to block closing.
            setCheckoutFinalizing(false);
            setReceiptSharePhone('');
            setReceiptShareEmail('');
            setSelectedCustomer(WALK_IN_CUSTOMER.id);
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
                {/* Main focal point: Total Paid */}
                <div className="bg-[#F5C742]/10 border-b border-[#F5C742]/30 px-6 py-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Amount Paid</p>
                  <p className="text-4xl font-black text-[#1E293B]">
                    <DirhamSymbol /> {(lastPaidInvoice.paidAmount ?? lastPaidInvoice.total ?? 0).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1 font-semibold">Successfully settled via {lastPaidInvoice.paymentMode || 'Cash'}</p>
                </div>
                {/* Background finalize indicator — subtle, non-blocking. The sale is
                    already confirmed; this only reflects that the receipt is being
                    sent to the printer. Disappears once printing/finalize completes. */}
                {checkoutFinalizing && (
                  <div className="bg-[#327F74]/5 border-b border-[#327F74]/15 px-6 py-2.5 flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-[#327F74]/40 border-t-[#327F74] rounded-full animate-spin" />
                    <span className="text-[11px] font-bold text-[#327F74]">Printing receipt…</span>
                  </div>
                )}
                {/* Change Due alert (only if change is > 0) */}
                {(lastPaidInvoice.changeAmount || 0) > 0 && (
                  <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Change Due</span>
                    <span className="text-lg font-black text-emerald-700">
                      <DirhamSymbol /> {(lastPaidInvoice.changeAmount || 0).toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Credit Balance alert (only for a Credit sale with a remaining receivable) */}
                {(lastPaidInvoice.creditBalance || 0) > 0 && (
                  <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-orange-800">This Invoice Balance</span>
                      <span className="text-lg font-black text-orange-700">
                        <DirhamSymbol /> {(lastPaidInvoice.creditBalance || 0).toFixed(2)}
                      </span>
                    </div>
                    {lastPaidInvoice.creditUpdatedBalance != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-orange-800">Customer Total Outstanding</span>
                        <span className="text-base font-black text-orange-700">
                          <DirhamSymbol /> {lastPaidInvoice.creditUpdatedBalance.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* Summary */}
                <div className="px-6 py-4 space-y-2.5">
                  {[
                    ['Sale Amount', formatCurrencyStr(lastPaidInvoice.total)],
                    ...(lastPaidInvoice.depositAmount > 0 ? [['Deposit Applied', `−${formatCurrencyStr(lastPaidInvoice.depositAmount)}`]] : []),
                    ['Paid Amount', formatCurrencyStr(lastPaidInvoice.paidAmount ?? 0)],
                    ['Change Returned', formatCurrencyStr(lastPaidInvoice.changeAmount || 0)],
                    ...(lastPaidInvoice.creditBalance > 0 ? [['This Invoice Balance', formatCurrencyStr(lastPaidInvoice.creditBalance)]] : []),
                    ...(lastPaidInvoice.creditBalance > 0 && lastPaidInvoice.creditUpdatedBalance != null
                      ? [['Customer Total Outstanding', formatCurrencyStr(lastPaidInvoice.creditUpdatedBalance)]] : []),
                    ['Pay Mode', lastPaidInvoice.paymentMode],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className={`font-bold ${label === 'Deposit Applied' ? 'text-[#327F74]' : label === 'Change Returned' && (lastPaidInvoice.changeAmount || 0) > 0 ? 'text-emerald-600' : 'text-[#1E293B]'}`}>{value}</span>
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
                          const template = buildPosA4Template(tplInvoiceFooter, { showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes, showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner, colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt });
                          const data = buildPosPrintData(full, tplInvoiceFooter);
                          const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
                          printHtml(generateDocumentPrintHtml(template, data, options));
                        } else {
                          // Reuse the credit-account figures snapshotted at checkout (lastPaidInvoice)
                          // rather than re-querying posCreditBalance — by now it already reflects
                          // this invoice and would be mislabeled as "previous balance".
                          const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                            full,
                            cashGiven: lastPaidInvoice?.paidAmount,
                            changeAmount: lastPaidInvoice?.changeAmount,
                            customerNameOverride: (lastPaidInvoice?.customer && lastPaidInvoice.customer.id !== 'walk-in') ? lastPaidInvoice.customer.name : null,
                            customerPhone: lastPaidInvoice?.customer?.phone,
                            customerEmail: lastPaidInvoice?.customer?.email,
                            creditPreviousBalance: lastPaidInvoice?.creditPreviousBalance ?? null,
                            creditInvoiceCredit: lastPaidInvoice?.creditInvoiceCredit ?? null,
                            creditAmountPaid: lastPaidInvoice?.creditAmountPaid ?? null,
                            creditUpdatedBalance: lastPaidInvoice?.creditUpdatedBalance ?? null,
                          });
                          await printThermalReceiptWithConfiguredPrinter({
                            full,
                            text,
                            escPosBase64,
                            title: `Receipt ${full.invoiceNumber || ''}`.trim(),
                          });
                        }
                      } catch (err) { console.warn('POS print error', err); alert(`Print failed: ${err?.message || 'printer error'}.`); }
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

        const shippingChargeNum = Number(shippingCharge) || 0;
        const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
        const subtotal = currentInvoice.subtotal;
        const totalDisc = currentInvoice.totalDiscount;
        const totalVat = currentInvoice.tax;
        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
        const effectiveDue = Math.max(0, grandTotal - depositAmt);
        // Real next number from the backend sequence (fetched when the dialog
        // opened); blank until it lands so no fabricated number is shown.
        const invoiceNo = previewInvoiceNo || '';
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true });
        const customer = selectedCustomerData;

        // Strip an amount string down to digits + a single decimal point, so both
        // physical-keyboard typing (onChange) and the on-screen keypad (handleKpad)
        // produce the same shape of value.
        const sanitizeAmountInput = (raw) => {
          let next = String(raw).replace(/[^\d.]/g, '');
          const dot = next.indexOf('.');
          if (dot !== -1) next = next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, '');
          return next;
        };

        // Mixed-payment fields (mixed-cash / mixed-card) auto-balance each other:
        // whichever field the cashier edits — via keyboard or the on-screen keypad —
        // is the "driving" amount, and the other field is recomputed as the
        // remaining balance (bill total − driving amount) so the two always sum to
        // the due amount without manual math.
        const applyMixedAmount = (isCash, rawValue) => {
          const next = sanitizeAmountInput(rawValue);
          const drivingNum = parseFloat(next) || 0;
          const remaining = Math.max(0, effectiveDue - drivingNum).toFixed(2);
          if (isCash) { setMixedCashAmount(next); setMixedCardAmount(remaining); }
          else { setMixedCardAmount(next); setMixedCashAmount(remaining); }
        };

        // On-screen keypad handler (touch terminals). Physical-keyboard typing is
        // wired directly on each <input>'s onChange via sanitizeAmountInput /
        // applyMixedAmount so both input methods work on the same POS screen.
        const handleKpad = (key) => {
          if (checkoutKeypadTarget === 'mixed-cash' || checkoutKeypadTarget === 'mixed-card') {
            const isCash = checkoutKeypadTarget === 'mixed-cash';
            const cur = isCash ? mixedCashAmount : mixedCardAmount;
            let next = cur;
            if (key === 'C') next = '';
            else if (key === '⌫') next = cur.slice(0, -1);
            else if (key === '.' && cur.includes('.')) { /* noop */ }
            else if (key === 'EXACT') next = effectiveDue > 0 ? String(effectiveDue.toFixed(2)) : '';
            else next = cur + key;
            applyMixedAmount(isCash, next);
            return;
          }

          const setter = checkoutKeypadTarget === 'tender' ? setTenderedAmount : setCheckoutCardRef;
          const cur = checkoutKeypadTarget === 'tender' ? tenderedAmount : checkoutCardRef;
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

        // Partial receipt against a Credit sale — amount collected now is capped at
        // the bill total; whatever's left posts to the customer's credit balance.
        const creditReceivedNum = Math.min(parseFloat(checkoutCreditReceivedAmount) || 0, effectiveDue);
        const creditBalanceNum = Math.max(0, effectiveDue - creditReceivedNum);
        const creditReceivedModeReady =
          !checkoutCreditReceivedMode || creditReceivedNum <= 0 ||
          (checkoutCreditReceivedMode === 'Card' && !!checkoutCreditReceivedCardType) ||
          ((checkoutCreditReceivedMode === 'Online' || checkoutCreditReceivedMode === 'Bank') && !!checkoutCreditReceivedBankAccountId) ||
          checkoutCreditReceivedMode === 'Cash';

        const canSettle =
          (checkoutPayMode === 'cash' && tenderedNum >= effectiveDue) ||
          (checkoutPayMode === 'card' && !!checkoutCardType) ||
          (checkoutPayMode === 'credit' && !!checkoutCreditCustomer && creditReceivedModeReady) ||
          (checkoutPayMode === 'mixed' && mixedDiff < 0.01 && !!mixedCardType) ||
          (checkoutPayMode === 'online' && !!checkoutOnlineBankAccountId);

        const numKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];
        const alphaRows = [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']];

        return (
          <div className="fixed inset-0 z-[60] flex bg-[#1a1f2e]">

            {/* ══ LEFT: Invoice Preview ════════════════════════════════ */}
            <div className="w-[280px] lg:w-[340px] xl:w-[400px] shrink-0 flex flex-col bg-white border-r-4 border-[#F5C742]">
              {checkoutPreviewBlobUrl ? (
                <ThermalScaledPreview src={checkoutPreviewBlobUrl} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                  <ShoppingCart className="h-10 w-10 mb-2" />
                  <p className="text-xs">Add items to preview</p>
                </div>
              )}
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
                    <p className="text-gray-400 text-[10px] mt-0.5">{currentInvoice.items.length} item{currentInvoice.items.length !== 1 ? 's' : ''}{invoiceNo ? ` · ${invoiceNo}` : ''}</p>
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

                  {/* ── Settlement summary (shipping and/or layaway-hold deposit) ── */}
                  {(depositAmt > 0 || shippingChargeNum > 0) && (
                    <div className="bg-white rounded-2xl border border-[#F5C742]/50 p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Settlement Summary</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Items Total</span>
                          <span className="font-semibold text-[#1E293B]"><CurrencyAmount amount={currentInvoice.total || 0} /></span>
                        </div>
                        {shippingChargeNum > 0 && (
                          <div className="flex justify-between text-gray-600">
                            <span>Shipping</span>
                            <span className="font-semibold text-[#1E293B]"><CurrencyAmount amount={shippingChargeNum} /></span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#1E293B] border-t border-gray-100 pt-1.5">
                          <span className="font-semibold">Order Total</span>
                          <span className="font-semibold"><CurrencyAmount amount={grandTotal} /></span>
                        </div>
                        {depositAmt > 0 && (
                          <div className="flex justify-between text-green-700">
                            <span>Deposit Paid</span>
                            <span className="font-semibold">− <CurrencyAmount amount={depositAmt} /></span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-[#1E293B]">
                          <span className="font-bold">{depositAmt > 0 ? 'Balance Due Now' : 'Total Payable'}</span>
                          <span className="font-black text-[#F5C742]"><CurrencyAmount amount={effectiveDue} /></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Pay Mode ── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Payment Mode</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {([
                        ['cash', 'Cash', Banknote, '#16a34a'],
                        ['card', 'Card', CreditCard, '#2563eb'],
                        ['credit', 'Credit', Users, '#9333ea'],
                        ['mixed', 'Mixed', Wallet, '#ea580c'],
                        ['online', 'Online', Landmark, '#0891b2'],
                      ]).map(([id, label, Icon, color]) => (
                        <button key={id} type="button" onClick={() => { setCheckoutPayMode(id); setCheckoutKeypadTarget(id === 'mixed' ? 'mixed-cash' : id === 'card' ? 'ref' : 'tender'); }}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${checkoutPayMode === id ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-gray-200 hover:border-[#F5C742]/50 bg-gray-50'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutPayMode === id ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                            <Icon className={`h-4 w-4 ${checkoutPayMode === id ? 'text-[#1E293B]' : 'text-gray-500'}`} />
                          </div>
                          <span className={`text-xs font-bold ${checkoutPayMode === id ? 'text-[#1E293B]' : 'text-gray-500'}`}>{label}</span>
                          <div className={`w-4 h-1 rounded-full bg-[#F5C742] transition-opacity ${checkoutPayMode === id ? 'opacity-100' : 'opacity-0'}`} />
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
                          return [...new Set(rounds)].sort((a, b) => a - b).slice(0, 6).map(d => (
                            <button key={d} type="button" onClick={() => { setTenderedAmount(d === total ? String(total.toFixed(2)) : String(d)); setCheckoutKeypadTarget('tender'); }}
                              className={`px-3 py-1.5 text-sm font-bold rounded-lg border-2 transition-all ${parseFloat(tenderedAmount) === d ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-[#F5C742]/40 text-gray-700 hover:bg-[#F5C742]/10'}`}>
                              {d === total ? 'Exact' : d}
                            </button>
                          ));
                        })()}
                      </div>
                      {/* Tendered display — real input so it accepts both physical
                          keyboard typing (desktop tills) and the on-screen keypad. */}
                      <label className="bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl px-4 py-3 flex items-center justify-between gap-2 cursor-text">
                        <span className="text-xs font-bold text-gray-500 uppercase shrink-0">Tendered</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <DirhamSymbol />
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={tenderedAmount}
                            placeholder="0.00"
                            onFocus={() => { setCheckoutKeypadTarget('tender'); setCheckoutKeypadMode('numeric'); setCheckoutKeypadVisible(true); }}
                            onChange={e => setTenderedAmount(sanitizeAmountInput(e.target.value))}
                            className="w-28 bg-transparent text-2xl font-black text-[#1E293B] text-right outline-none"
                          />
                        </div>
                      </label>
                      {/* Change / Balance */}
                      {tenderedNum > 0 && Math.round((tenderedNum - effectiveDue) * 100) / 100 > 0 && (
                        <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                          <span className="text-sm font-semibold text-green-700">Change Return</span>
                          <span className="text-lg font-black text-green-700"><CurrencyAmount amount={Math.round((tenderedNum - effectiveDue) * 100) / 100} /></span>
                        </div>
                      )}
                      {tenderedNum > 0 && Math.round((effectiveDue - tenderedNum) * 100) / 100 > 0 && (
                        <div className="flex justify-between items-center px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                          <span className="text-sm font-semibold text-red-600">Balance Due</span>
                          <span className="text-lg font-black text-red-600"><CurrencyAmount amount={Math.round((effectiveDue - tenderedNum) * 100) / 100} /></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Card section ── */}
                  {checkoutPayMode === 'card' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Card Payment</p>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {['Visa', 'Mastercard', 'Amex', 'Other'].map(ct => (
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
                        <input
                          type="text"
                          autoComplete="off"
                          value={checkoutCardRef}
                          placeholder="Enter reference…"
                          onFocus={() => { setCheckoutKeypadTarget('ref'); setCheckoutKeypadMode('alpha'); setCheckoutKeypadVisible(true); }}
                          onChange={e => setCheckoutCardRef(e.target.value)}
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F5C742]"
                        />
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
                              <button key={c.id} type="button" onClick={() => { setCheckoutCreditCustomer(c.id); setSelectedCustomer(c.id); setCheckoutCreditCustomerSearch(''); }}
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
                        <button type="button" onClick={() => { openQuickCustomerModal(checkoutCreditCustomerSearch); quickCustomerCreditCtxRef.current = true; }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#F5C742]/50 text-[#b8920e] text-sm font-semibold hover:bg-[#F5C742]/5 transition-colors">
                          <UserPlus className="h-4 w-4" />
                          Add New Customer
                        </button>
                      )}
                      {/* Credit terms */}
                      {creditCustomerData && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Credit Terms (Days)</label>
                            <select value={checkoutCreditTerms} onChange={e => setCheckoutCreditTerms(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#F5C742]">
                              {['7', '14', '30', '45', '60', '90'].map(d => <option key={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Due Date</label>
                            <input type="date" value={checkoutCreditDueDate} onChange={e => setCheckoutCreditDueDate(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#F5C742]" />
                          </div>
                        </div>
                      )}
                      {/* Partial receipt — collect part of the bill now, rest posts to receivable */}
                      {creditCustomerData && (
                        <div className="space-y-3 border-t border-gray-100 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Received Now (optional)</p>
                          <div className="grid grid-cols-4 gap-2">
                            {['Cash', 'Card', 'Online', 'Bank'].map(m => (
                              <button key={m} type="button"
                                onClick={() => setCheckoutCreditReceivedMode(prev => prev === m ? '' : m)}
                                className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${checkoutCreditReceivedMode === m ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-600 hover:border-[#F5C742]/50'}`}>
                                {m}
                              </button>
                            ))}
                          </div>
                          {checkoutCreditReceivedMode && (
                            <>
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Amount Received</label>
                                <div className="mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-[#F5C742]">
                                  <span className="text-xs text-gray-400 shrink-0"><DirhamSymbol /></span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={checkoutCreditReceivedAmount}
                                    placeholder="0.00"
                                    onChange={e => {
                                      const next = sanitizeAmountInput(e.target.value);
                                      const num = parseFloat(next) || 0;
                                      setCheckoutCreditReceivedAmount(num > effectiveDue ? String(effectiveDue.toFixed(2)) : next);
                                    }}
                                    className="w-full min-w-0 bg-transparent text-lg font-black text-[#1E293B] outline-none"
                                  />
                                  <button type="button" onClick={() => setCheckoutCreditReceivedAmount(effectiveDue > 0 ? String(effectiveDue.toFixed(2)) : '0')}
                                    className="text-[10px] font-bold text-[#b8920e] shrink-0">FULL</button>
                                </div>
                              </div>
                              {checkoutCreditReceivedMode === 'Card' && (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                  {['Visa', 'Mastercard', 'Amex', 'Other'].map(ct => (
                                    <button key={ct} type="button" onClick={() => setCheckoutCreditReceivedCardType(ct)}
                                      className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${checkoutCreditReceivedCardType === ct ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-600 hover:border-[#F5C742]/50'}`}>
                                      {ct}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {(checkoutCreditReceivedMode === 'Online' || checkoutCreditReceivedMode === 'Bank') && (
                                <div>
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">Bank Account</label>
                                  <select
                                    value={checkoutCreditReceivedBankAccountId}
                                    onChange={e => setCheckoutCreditReceivedBankAccountId(e.target.value)}
                                    className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F5C742]"
                                  >
                                    <option value="" disabled>
                                      {checkoutOnlineBankAccountsLoading
                                        ? 'Loading bank accounts…'
                                        : checkoutOnlineBankAccounts.length === 0
                                          ? 'No bank accounts configured'
                                          : 'Select bank account…'}
                                    </option>
                                    {checkoutOnlineBankAccounts.map(acc => (
                                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.code || acc.accountCode || '-'})</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Reference (optional)</label>
                                <input
                                  type="text"
                                  autoComplete="off"
                                  value={checkoutCreditReceivedRef}
                                  placeholder="Enter reference…"
                                  onChange={e => setCheckoutCreditReceivedRef(e.target.value)}
                                  className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F5C742]"
                                />
                              </div>
                              {checkoutCreditReceivedMode === 'Card' && !checkoutCreditReceivedCardType && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"><AlertCircle className="h-4 w-4 text-amber-500 shrink-0" /><span className="text-xs text-amber-700">Please select a card type to proceed</span></div>
                              )}
                              {(checkoutCreditReceivedMode === 'Online' || checkoutCreditReceivedMode === 'Bank') && !checkoutCreditReceivedBankAccountId && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"><AlertCircle className="h-4 w-4 text-amber-500 shrink-0" /><span className="text-xs text-amber-700">Please select a bank account to proceed</span></div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {creditReceivedNum > 0 && (
                        <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                          <span className="text-sm font-semibold text-green-700">Received Now ({checkoutCreditReceivedMode})</span>
                          <span className="text-lg font-black text-green-700"><CurrencyAmount amount={creditReceivedNum} /></span>
                        </div>
                      )}
                      <div className="bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase">Credit Balance</span>
                        <span className="text-2xl font-black text-[#1E293B]"><CurrencyAmount amount={creditBalanceNum} /></span>
                      </div>
                    </div>
                  )}

                  {/* ── Mixed section ── */}
                  {checkoutPayMode === 'mixed' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mixed Payment — Cash + Card</p>
                      <p className="text-[10px] text-gray-400 -mt-1">Enter one amount — the balance is applied to the other mode automatically.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Cash Amount{checkoutKeypadTarget === 'mixed-card' && mixedCashAmount ? ' (balance)' : ''}</label>
                          <label className={`mt-1 border-2 rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-text ${checkoutKeypadTarget === 'mixed-cash' ? 'border-[#F5C742] bg-[#F5C742]/5' : 'border-gray-200 bg-gray-50'}`}>
                            <span className="text-xs text-gray-400 shrink-0"><DirhamSymbol /></span>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={mixedCashAmount}
                              placeholder="0.00"
                              onFocus={() => { setCheckoutKeypadTarget('mixed-cash'); setCheckoutKeypadMode('numeric'); setCheckoutKeypadVisible(true); }}
                              onChange={e => applyMixedAmount(true, e.target.value)}
                              className="w-full min-w-0 bg-transparent text-lg font-black text-[#1E293B] outline-none"
                            />
                          </label>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Card Amount{checkoutKeypadTarget === 'mixed-cash' && mixedCardAmount ? ' (balance)' : ''}</label>
                          <label className={`mt-1 border-2 rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-text ${checkoutKeypadTarget === 'mixed-card' ? 'border-[#F5C742] bg-[#F5C742]/5' : 'border-gray-200 bg-gray-50'}`}>
                            <span className="text-xs text-gray-400 shrink-0"><DirhamSymbol /></span>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={mixedCardAmount}
                              placeholder="0.00"
                              onFocus={() => { setCheckoutKeypadTarget('mixed-card'); setCheckoutKeypadMode('numeric'); setCheckoutKeypadVisible(true); }}
                              onChange={e => applyMixedAmount(false, e.target.value)}
                              className="w-full min-w-0 bg-transparent text-lg font-black text-[#1E293B] outline-none"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {['Visa', 'Mastercard', 'Amex', 'Other'].map(ct => (
                          <button key={ct} type="button" onClick={() => setMixedCardType(ct)}
                            className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${mixedCardType === ct ? 'bg-[#F5C742] border-[#F5C742] text-[#1E293B]' : 'border-gray-200 text-gray-600 hover:border-[#F5C742]/50'}`}>
                            {ct}
                          </button>
                        ))}
                      </div>
                      {mixedCashAmount && mixedCardAmount && (
                        <div className={`flex justify-between items-center px-4 py-2.5 rounded-xl border-2 ${mixedDiff < 0.01 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                          <span className={`text-sm font-bold ${mixedDiff < 0.01 ? 'text-green-700' : 'text-red-600'}`}>{mixedDiff < 0.01 ? '✓ Amounts Balanced' : <>Difference: <DirhamSymbol /> {mixedDiff.toFixed(2)}</>}</span>
                          <span className="text-xs text-gray-500">Total: <DirhamSymbol /> {effectiveDue.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Online section ── */}
                  {checkoutPayMode === 'online' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Online Payment</p>
                      <div className="bg-[#F5C742]/10 border-2 border-[#F5C742] rounded-xl px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase">Amount</span>
                        <span className="text-2xl font-black text-[#1E293B]"><CurrencyAmount amount={effectiveDue} /></span>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Bank Account</label>
                        <select
                          value={checkoutOnlineBankAccountId}
                          onChange={e => setCheckoutOnlineBankAccountId(e.target.value)}
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F5C742]"
                        >
                          <option value="" disabled>
                            {checkoutOnlineBankAccountsLoading
                              ? 'Loading bank accounts…'
                              : checkoutOnlineBankAccounts.length === 0
                                ? 'No bank accounts configured'
                                : 'Select bank account…'}
                          </option>
                          {checkoutOnlineBankAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name} ({acc.code || acc.accountCode || '-'})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Transaction Reference (optional)</label>
                        <input
                          type="text"
                          autoComplete="off"
                          value={checkoutOnlineReference}
                          placeholder="UTR / transfer ref…"
                          onChange={e => setCheckoutOnlineReference(e.target.value)}
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#F5C742]"
                        />
                      </div>
                      {!checkoutOnlineBankAccountId && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                          <span className="text-xs text-amber-700">Please select a bank account to proceed</span>
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
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${checkoutKeypadMode === 'numeric' ? 'bg-[#F5C742] text-[#1E293B]' : 'text-gray-500'}`}>123</button>
                            <button type="button" onClick={() => setCheckoutKeypadMode('alpha')}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${checkoutKeypadMode === 'alpha' ? 'bg-[#F5C742] text-[#1E293B]' : 'text-gray-500'}`}>ABC</button>
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
                              className={`h-12 rounded-xl font-bold text-sm border-2 transition-all active:scale-95 ${k === '⌫' ? 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100' : 'border-[#F5C742]/40 bg-[#F5C742]/5 text-[#1E293B] hover:bg-[#F5C742]/20'}`}>
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
                                  className={`h-9 flex-1 rounded-lg font-bold text-xs border transition-all active:scale-95 ${k === '⌫' ? 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100 px-3 flex-none' : 'border-[#F5C742]/40 bg-[#F5C742]/5 text-[#1E293B] hover:bg-[#F5C742]/20'}`}>
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
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillPrint ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                            <Printer className={`h-4 w-4 ${checkoutEbillPrint ? 'text-[#1E293B]' : 'text-gray-400'}`} />
                          </div>
                          <span className="text-sm font-semibold text-[#1E293B]">Print Receipt</span>
                        </div>
                        <input type="checkbox" checked={checkoutEbillPrint} onChange={e => setCheckoutEbillPrint(e.target.checked)} className="w-4 h-4 accent-[#F5C742]" />
                      </label>
                      {/* SMS */}
                      <div>
                        <label className="flex items-center justify-between py-2 px-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillSms ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                              <Smartphone className={`h-4 w-4 ${checkoutEbillSms ? 'text-[#1E293B]' : 'text-gray-400'}`} />
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
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillWhatsapp ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                              <Smartphone className={`h-4 w-4 ${checkoutEbillWhatsapp ? 'text-[#1E293B]' : 'text-gray-400'}`} />
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
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checkoutEbillEmail ? 'bg-[#F5C742]' : 'bg-gray-100'}`}>
                              <FileText className={`h-4 w-4 ${checkoutEbillEmail ? 'text-[#1E293B]' : 'text-gray-400'}`} />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  <div className="bg-[#F5C742]/10 border border-[#F5C742]/40 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-gray-500 uppercase font-bold">{depositAmt > 0 ? 'Balance Due' : 'Total'}</p>
                    <p className="text-base font-black text-[#1E293B]"><CurrencyAmount amount={depositAmt > 0 ? effectiveDue : grandTotal} /></p>
                    {depositAmt > 0 && <p className="text-[8px] text-[#327F74] font-semibold mt-0.5">Deposit −{depositAmt.toFixed(2)}</p>}
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${canSettle ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[9px] text-gray-500 uppercase font-bold">Paid</p>
                    <p className={`text-base font-black ${canSettle ? 'text-green-700' : 'text-gray-400'}`}>
                      <DirhamSymbol /> {checkoutPayMode === 'cash' ? (tenderedNum > 0 ? tenderedNum.toFixed(2) : '0.00')
                        : checkoutPayMode === 'mixed' ? (mixedCashNum + mixedCardNum).toFixed(2)
                          : canSettle ? effectiveDue.toFixed(2) : '0.00'}
                    </p>
                  </div>
                  {(() => {
                    const changeAmt = checkoutPayMode === 'cash'
                      ? Math.round(Math.max(0, tenderedNum - effectiveDue) * 100) / 100
                      : 0;
                    return (
                      <div className={`rounded-xl p-3 text-center border ${changeAmt > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                        <p className="text-[9px] text-gray-500 uppercase font-bold">{changeAmt > 0 ? 'Change' : 'Balance'}</p>
                        <p className={`text-base font-black ${changeAmt > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                          <DirhamSymbol /> {changeAmt > 0 ? changeAmt.toFixed(2) : '0.00'}
                        </p>
                      </div>
                    );
                  })()}
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
                  <button type="button" onClick={() => { setShowPaymentDialog(false); setCheckoutError(null); setTenderedAmount(''); setCheckoutCardType(''); setMixedCashAmount(''); setMixedCardAmount(''); setMixedCardType(''); setCheckoutOnlineBankAccountId(''); setCheckoutOnlineReference(''); setCheckoutKeypadValue(''); setCheckoutKeypadVisible(false); setCheckoutCreditReceivedMode(''); setCheckoutCreditReceivedAmount(''); setCheckoutCreditReceivedCardType(''); setCheckoutCreditReceivedRef(''); setCheckoutCreditReceivedBankAccountId(''); }}
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
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (k === 'C') { setSupervisorPinValue(''); setSupervisorPinError(''); }
                        else if (k === '✓') handleSupervisorPinSubmit();
                        else setSupervisorPinValue(p => (p + k).slice(0, 8));
                      }}
                      className={`py-3 rounded-xl text-sm font-bold transition-colors ${k === '✓' ? 'bg-amber-500 hover:bg-amber-600 text-white' :
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
        <DialogContent className="sm:max-w-md border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${cashDropType === 'in' ? 'bg-[#327F74]/10' : 'bg-red-50'}`}>
                  {cashDropType === 'in'
                    ? <ArrowDown className="h-5 w-5 text-[#327F74]" />
                    : <ArrowUp className="h-5 w-5 text-red-500" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Cash Drop / Out</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Record cash movements other than sales</p>
                </div>
              </div>
              <button onClick={() => setShowCashDropDialog(false)} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Type dropdown */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <div className="relative">
                <select
                  value={cashDropType}
                  onChange={e => setCashDropType(e.target.value)}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium text-[#1E293B] border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40 cursor-pointer"
                >
                  <option value="in">Cash Drop (IN) - Add cash to drawer</option>
                  <option value="out">Cash Out - Pay for expenses</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Amount (AED)</label>
              <input
                type="number"
                value={cashDropAmount}
                onChange={e => setCashDropAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description / Purpose</label>
              <input
                type="text"
                value={cashDropDescription}
                onChange={e => setCashDropDescription(e.target.value)}
                placeholder={cashDropType === 'in' ? 'e.g., Cash from admin safe' : 'e.g., Office supplies, Cleaning'}
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setShowCashDropDialog(false)}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCashDrop}
              className={`h-10 px-6 text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors ${cashDropType === 'in'
                  ? 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
            >
              <CheckCircle className="h-4 w-4" />
              Record {cashDropType === 'in' ? 'Cash Drop' : 'Cash Out'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Live Session Quick View — dashboard tile popup showing current session
          sales/cash figures, sourced from the same X-Report summary the full
          X-Report page uses so the numbers never disagree. */}
      <Dialog open={showLiveSessionDialog} onOpenChange={setShowLiveSessionDialog}>
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          {(() => {
            const xSummary = xReportData?.summary || {};
            const sess = xReportData?.session || currentSession;
            const totalSales = Number(xSummary.totalSales ?? 0);
            const txCount = Number(xSummary.invoiceCount ?? 0);
            const openingCash = Number(xSummary.openingCash ?? currentSession?.openingCash ?? 0);
            const cashSales = Number(xSummary.cashSales ?? 0);
            const cardSales = Number(xSummary.cardSales ?? 0);
            const walletSales = Number(xSummary.walletSales ?? 0);
            const dropIn = Number(xSummary.cashDropIn ?? 0);
            const dropOut = Number(xSummary.cashDropOut ?? 0);
            const expectedCash = Number(xSummary.expectedCash ?? (openingCash + cashSales + dropIn - dropOut));
            const sessionStart = sess?.openedAt ? parseUTCDate(sess.openedAt) : (sess?.startTime ? parseUTCDate(sess.startTime) : null);
            const diffMin = sessionStart ? Math.floor((sessionNowMs - sessionStart.getTime()) / 60000) : 0;
            const durH = Math.floor(diffMin / 60);
            const durM = diffMin % 60;
            const duration = sessionStart ? (durH > 0 ? `${durH}h ${durM}m` : `${durM}m`) : '—';
            const loading = xReportLoading || xReportData === null;

            const rows = [
              { label: "Today's Sales", value: <CurrencyAmount amount={totalSales} />, accent: '#327F74' },
              { label: 'Transactions', value: txCount, accent: '#6366F1' },
              { label: 'Cash Sales', value: <CurrencyAmount amount={cashSales} />, accent: '#1E293B' },
              { label: 'Card Sales', value: <CurrencyAmount amount={cardSales} />, accent: '#1E293B' },
              { label: 'Wallet Sales', value: <CurrencyAmount amount={walletSales} />, accent: '#1E293B' },
              { label: 'Opening Cash', value: <CurrencyAmount amount={openingCash} />, accent: '#1E293B' },
              { label: 'Cash Drop In', value: <CurrencyAmount amount={dropIn} />, accent: '#327F74' },
              { label: 'Cash Out', value: dropOut > 0 ? <>(<CurrencyAmount amount={dropOut} />)</> : <CurrencyAmount amount={0} />, accent: '#EF4444' },
              { label: 'Expected Cash in Drawer', value: <CurrencyAmount amount={expectedCash} />, accent: '#F5C742' },
            ];

            return (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#F5C742]/15">
                        <Activity className="h-5 w-5 text-[#b8920e]" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-[#1E293B]">Live Session</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {sess?.id ? `Session #${sess.id}` : 'Current session'} · {duration} elapsed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={loadXReport} disabled={xReportLoading} title="Refresh"
                        className="text-gray-400 hover:text-[#327F74] transition-colors mt-0.5 disabled:opacity-40">
                        <RefreshCw className={`h-4 w-4 ${xReportLoading ? 'animate-spin' : ''}`} />
                      </button>
                      <button onClick={() => setShowLiveSessionDialog(false)} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4">
                    <p>Cashier: <span className="text-[#1E293B] font-medium">{sess?.openedBy || '—'}</span></p>
                    <p>Terminal: <span className="text-[#1E293B] font-medium">{sess?.terminalId || currentTerminal?.terminalId || '—'}</span></p>
                  </div>
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                    {rows.map(row => (
                      <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">{row.label}</span>
                        <span className="text-sm font-bold" style={{ color: row.accent }}>
                          {loading ? <span className="inline-block h-4 w-16 bg-gray-200 rounded animate-pulse" /> : row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-6 pb-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowLiveSessionDialog(false)}
                    className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => { setShowLiveSessionDialog(false); setCurrentView('x-report'); }}
                    className="h-10 px-6 text-sm font-semibold rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] flex items-center gap-2 transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Full X-Report
                  </button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Close Day Reconciliation Variance Dialog */}
      <Dialog open={!!closeDayVariance} onOpenChange={(open) => { if (!open) setCloseDayVariance(null); }}>
        <DialogContent className="sm:max-w-lg border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">
                    {closeDayVariance?.stage === 'CASH' ? 'Cash Reconciliation Failed' : 'Sales Reconciliation Failed'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Close day was blocked — review the variance breakdown below</p>
                </div>
              </div>
              <button onClick={() => setCloseDayVariance(null)} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {closeDayVariance?.breakdown && Object.entries(closeDayVariance.breakdown).map(([key, value]) => {
              const isVariance = key === 'variance';
              const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
              const num = Number(value);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg ${isVariance ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}
                >
                  <span className={`text-sm ${isVariance ? 'font-semibold text-red-600' : 'text-gray-600'}`}>{label}</span>
                  <span className={`text-sm font-mono ${isVariance ? 'font-bold text-red-600' : 'text-[#1E293B]'}`}>
                    {Number.isFinite(num) ? num.toFixed(2) : String(value)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setCloseDayVariance(null)}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lock POS Dialog */}
      <Dialog open={showLockPOS} onOpenChange={v => { if (!v) { setShowLockPOS(false); setLockPOSPin(''); } }}>
        <DialogContent className="max-w-sm border-0 shadow-2xl bg-white">
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
        <DialogContent className="max-w-sm border-0 shadow-2xl bg-white">
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
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-gray-600" /> Last Receipt</DialogTitle>
            <DialogDescription>Most recent completed transaction</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {!lastPaidInvoice ? (
              <p className="text-sm text-gray-500 text-center py-6">No transactions yet in this session.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Invoice #</span><span className="font-semibold">{lastPaidInvoice.id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{lastPaidInvoice.customer?.name || 'Walk-in'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-semibold text-[#F5C742]">{formatCurrency(lastPaidInvoice.total)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-semibold">{formatCurrency(lastPaidInvoice.paidAmount ?? lastPaidInvoice.total)}</span></div>
                {(lastPaidInvoice.changeAmount || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Change</span><span className="font-semibold text-green-600">{formatCurrency(lastPaidInvoice.changeAmount)}</span></div>}
                {(lastPaidInvoice.creditBalance || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">This Invoice Balance</span><span className="font-semibold text-orange-600">{formatCurrency(lastPaidInvoice.creditBalance)}</span></div>}
                {(lastPaidInvoice.creditBalance || 0) > 0 && lastPaidInvoice.creditUpdatedBalance != null && <div className="flex justify-between"><span className="text-gray-500">Customer Total Outstanding</span><span className="font-semibold text-orange-600">{formatCurrency(lastPaidInvoice.creditUpdatedBalance)}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Pay Mode</span><span className="font-semibold">{lastPaidInvoice.paymentMode || 'Cash'}</span></div>
                <Separator />
                <p className="text-xs text-gray-400 text-center">{lastPaidInvoice.items?.length || 0} item(s) · Session {currentSession?.id}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLastReceiptDialog(false)}>Close</Button>
            <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]" disabled={!lastPaidInvoice?.invoice?.id} onClick={async () => {
              if (!lastPaidInvoice?.invoice?.id) return;
              try {
                const full = await getSalesInvoiceById(lastPaidInvoice.invoice.id);
                openCashDrawer('RECEIPT_PRINT');
                if (tplInvoicePaper === 'A4') {
                  const template = buildPosA4Template(tplInvoiceFooter, { showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes, showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner, colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt });
                  const data = buildPosPrintData(full, tplInvoiceFooter);
                  const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
                  printHtml(await generatePrintHtmlAsync(template, data, options));
                } else {
                  // Reuse the credit-account figures snapshotted at checkout (lastPaidInvoice)
                  // rather than re-querying posCreditBalance — by now it already reflects
                  // this invoice and would be mislabeled as "previous balance".
                  const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                    full,
                    isReprint: true,
                    cashGiven: lastPaidInvoice?.paidAmount,
                    changeAmount: lastPaidInvoice?.changeAmount,
                    customerPhone: lastPaidInvoice?.customer?.phone,
                    customerEmail: lastPaidInvoice?.customer?.email,
                    creditPreviousBalance: lastPaidInvoice?.creditPreviousBalance ?? null,
                    creditInvoiceCredit: lastPaidInvoice?.creditInvoiceCredit ?? null,
                    creditAmountPaid: lastPaidInvoice?.creditAmountPaid ?? null,
                    creditUpdatedBalance: lastPaidInvoice?.creditUpdatedBalance ?? null,
                    cashierNameOverride: full.createdBy ? formatUserDisplayName(full.createdBy.includes('@') ? full.createdBy.split('@')[0] : full.createdBy) : cashierDisplayName,
                  });
                  await printThermalReceiptWithConfiguredPrinter({
                    full,
                    text,
                    escPosBase64,
                    title: `Reprint ${full.invoiceNumber || ''}`.trim(),
                  });
                }
                setShowLastReceiptDialog(false);
              } catch (err) { console.warn('Last receipt reprint error', err); alert(`Reprint failed: ${err?.message || 'printer error'}.`); }
            }}>
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
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Date From</label><input type="date" value={reprintFilterDateFrom} onChange={e => setReprintFilterDateFrom(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Date To</label><input type="date" value={reprintFilterDateTo} onChange={e => setReprintFilterDateTo(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Invoice No.</label><input value={reprintFilterInvoiceNo} onChange={e => setReprintFilterInvoiceNo(e.target.value)} placeholder="SI-POS-..." className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Customer</label><input value={reprintFilterCustomer} onChange={e => setReprintFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Cashier</label><input value={reprintFilterCashier} onChange={e => setReprintFilterCashier(e.target.value)} placeholder="Cashier" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Payment Mode</label>
                    <select value={reprintFilterPayMode} onChange={e => setReprintFilterPayMode(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['All', 'Cash', 'Card', 'Mixed', 'Credit'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Status</label>
                    <select value={reprintFilterStatus} onChange={e => setReprintFilterStatus(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                      {['All', 'Completed', 'Returned', 'Cancelled', 'Reprinted'].map(o => <option key={o}>{o}</option>)}
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
                <div className={`flex flex-col ${selected ? 'w-1/2 lg:w-[55%]' : 'w-full'} border-r border-[#327F74]/10 overflow-hidden`}>
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
                            {['Invoice No.', 'Date & Time', 'Customer', 'Cashier', 'Terminal', 'Pay Mode', 'Items', 'Amount', 'Status', 'Action'].map((h, i) => (
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
                              <td className="px-3 py-2 text-[#1E293B] max-w-[160px] truncate">{inv.customer}</td>
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
                  <div className="w-1/2 lg:w-[45%] flex flex-col overflow-hidden bg-white">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 border-b border-gray-100 pb-3">
                          {[['Invoice No.', selected.id], ['Date', selected.date || ''], ['Time', selected.time], ['Cashier', selected.cashier], ['Terminal', selected.terminal], ['Customer', selected.customer]].map(([k, v]) => (
                            <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                          ))}
                        </div>
                        {(selected._raw?.items || []).filter(i => !i.voided).length > 0 ? (
                          <table className="w-full border-b border-gray-100 pb-2">
                            <thead><tr className="text-gray-400">{['Item', 'Qty', 'Price', 'Total'].map(h => <th key={h} className={`py-0.5 text-left ${h !== 'Item' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                            <tbody>
                              {(selected._raw.items).filter(i => !i.voided).map((it, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-0.5 text-[#1E293B]">{it.itemName || it.itemCode}</td>
                                  <td className="py-0.5 text-right text-[#1E293B]">{it.quantity}</td>
                                  <td className="py-0.5 text-right text-[#1E293B]">{(it.price || 0).toFixed(2)}</td>
                                  <td className="py-0.5 text-right text-[#1E293B]">{(it.netAmount || it.quantity * (it.price || 0)).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-gray-400 text-center py-2">Line items not loaded — click Print to fetch full invoice.</p>
                        )}
                        <div className="space-y-1">
                          {[['Subtotal', (selected._raw?.subTotal || 0).toFixed(2)], ['VAT', (selected._raw?.taxTotal || 0).toFixed(2)], ['Total', (selected._raw?.invoiceTotal || 0).toFixed(2)]].map(([l, v]) => (
                            <div key={l} className={`flex justify-between ${l === 'Total' ? 'font-bold text-[#1E293B] border-t border-gray-200 pt-1' : ''}`}><span className="text-gray-500">{l}</span><span>{v}</span></div>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 pt-2 space-y-0.5">
                          <div className="flex justify-between"><span className="text-gray-400">Payment Mode</span><span className="font-semibold">{selected.payMode}</span></div>
                        </div>
                        {reprintPreviewCredit && (
                          <div className="border-t border-gray-100 pt-2 space-y-0.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Credit Account</p>
                            {[
                              ['Previous Balance', (reprintPreviewCredit.previousBalance || 0).toFixed(2)],
                              ['Invoice Credit', (0).toFixed(2)],
                              ['Amount Paid', (selected._raw?.invoiceTotal || 0).toFixed(2)],
                              ['Updated Balance', (reprintPreviewCredit.previousBalance || 0).toFixed(2)],
                            ].map(([l, v]) => (
                              <div key={l} className="flex justify-between"><span className="text-gray-400">{l}</span><span className="text-[#1E293B]">{v}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Audit Info */}
                      <div className="mt-3 bg-[#F7F7FA] border border-[#327F74]/20 rounded p-3 space-y-1 text-xs">
                        <p className="font-semibold text-[#1E293B] mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5 text-[#327F74]" />Invoice Info</p>
                        {[['Invoice No.', selected.id], ['Date', selected.date || ''], ['Customer', selected.customer], ['Cashier', selected.cashier], ['Terminal', selected.terminal]].map(([k, v]) => (
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                      {/* Audit / Reprint History */}
                      <div className="mt-3 bg-[#F7F7FA] border border-[#327F74]/20 rounded p-3 space-y-1 text-xs">
                        <p className="font-semibold text-[#1E293B] mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5 text-[#327F74]" />Audit / Reprint History</p>
                        {[
                          ['Original Printed By', selected.cashier || '—'],
                          ['Original Printed Time', (() => { const raw = selected._raw?.createdAt; return raw ? new Date(raw).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; })()],
                          ['Reprint Count', selected.reprints > 0 ? `${selected.reprints} Times` : '0 Times'],
                          ['Last Reprinted By', selected.reprints > 0 ? (selected.lastReprintedBy || '—') : '—'],
                          ['Last Reprinted Time', selected.reprints > 0 ? (selected.lastReprintedTime || '—') : '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-36 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                    {/* Print Actions */}
                    <div className="border-t border-[#327F74]/10 p-3 bg-white flex items-center gap-2 shrink-0 flex-wrap">
                      <button onClick={() => { setReprintPrintMode('thermal'); setReprintConfirmOpen(true); }} disabled={selected.status === 'Cancelled' || reprintPrinting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded ${selected.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'}`}>
                        <Printer className="h-3.5 w-3.5" />{reprintPrinting && reprintPrintMode === 'thermal' ? 'Printing…' : 'Print Thermal Receipt'}
                      </button>
                      <button onClick={() => { setReprintPrintMode('a4'); setReprintConfirmOpen(true); }} disabled={selected.status === 'Cancelled' || reprintPrinting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded ${selected.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-[#327F74]/40 text-[#327F74] hover:bg-[#327F74]/5'}`}>
                        <FileText className="h-3.5 w-3.5" />{reprintPrinting && reprintPrintMode === 'a4' ? 'Printing…' : 'Print A4 Invoice'}
                      </button>
                      <button onClick={() => { setReprintPrintMode('pdf'); setReprintConfirmOpen(true); }} disabled={selected.status === 'Cancelled' || reprintPrinting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded ${selected.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                        <Download className="h-3.5 w-3.5" />{reprintPrinting && reprintPrintMode === 'pdf' ? 'Downloading…' : 'Download PDF'}
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

      {/* Print fallback toast — explains why a browser print-preview just opened
          (no printer configured, or the configured one/agent didn't respond). */}
      {printFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md ${printFeedback.type === 'warning' ? 'bg-amber-500 text-gray-900' : 'bg-red-500 text-white'}`}>
          <Printer className="h-4 w-4 shrink-0" />
          <span>{printFeedback.message}</span>
          <button type="button" onClick={() => setPrintFeedback(null)} className="ml-1 shrink-0 opacity-80 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Reprint Confirm Popup */}
      <Dialog open={reprintConfirmOpen} onOpenChange={setReprintConfirmOpen}>
        <DialogContent className="sm:max-w-[380px] bg-white" aria-describedby={undefined}>
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
              {reprintPrintMode === 'pdf' ? <Download className="h-4 w-4 mr-1" /> : <Printer className="h-4 w-4 mr-1" />}
              {reprintPrinting ? (reprintPrintMode === 'pdf' ? 'Downloading…' : 'Printing…') : (reprintPrintMode === 'thermal' ? 'Confirm & Print Thermal' : reprintPrintMode === 'a4' ? 'Confirm & Print A4' : 'Confirm & Download PDF')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coupons Dialog */}
      <Dialog open={showCouponsDialog} onOpenChange={v => { if (!v) { setShowCouponsDialog(false); setCouponCode(''); } }}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-pink-500" /> Apply Coupon</DialogTitle>
            <DialogDescription>Enter a coupon code to apply a discount to the current sale.</DialogDescription>
          </DialogHeader>
          {(() => {
            const COUPON_RULES = [
              { code: 'SAVE10', label: 'SAVE10 — 10% off', type: 'percent', value: 10 },
              { code: 'WELCOME20', label: 'WELCOME20 — 20% off first purchase', type: 'percent', value: 20 },
              { code: 'MEMBER15', label: 'MEMBER15 — 15% for members', type: 'percent', value: 15 },
            ];
            const matched = COUPON_RULES.find(r => r.code === couponCode);
            const applyAndClose = () => {
              if (!matched) return;
              const subtotal = currentInvoice.subtotal || 0;
              const discountAmt = matched.type === 'percent' ? subtotal * matched.value / 100 : matched.value;
              setAppliedCoupon(matched.code);
              setCouponDiscount(discountAmt);
              setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));
              setShowCouponsDialog(false);
              showFeedback('success', `Coupon ${matched.code} applied — ${matched.type === 'percent' ? matched.value + '%' : 'AED ' + matched.value} off`);
            };
            return (
              <div className="space-y-3 py-2">
                <Label>Coupon Code</Label>
                <Input placeholder="e.g. SAVE10, WELCOME20..." value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') applyAndClose(); }} />
                {appliedCoupon && (
                  <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" />Coupon "{appliedCoupon}" applied — {formatCurrency(couponDiscount)} off</span>
                    <button type="button" className="text-red-400 hover:text-red-600 text-[10px] font-bold" onClick={() => {
                      setAppliedCoupon(null); setCouponDiscount(0);
                      setCurrentInvoice(prev => recalculateInvoice(prev.items, 0));
                      setCouponCode('');
                    }}>Remove</button>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-semibold">Available Coupons</p>
                  {COUPON_RULES.map(c => (
                    <button key={c.code} type="button" onClick={() => setCouponCode(c.code)}
                      className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${couponCode === c.code ? 'bg-pink-100 border-pink-300 text-pink-800' : 'bg-pink-50 hover:bg-pink-100 border-pink-100 text-pink-700'}`}>{c.label}</button>
                  ))}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCouponsDialog(false)}>Cancel</Button>
            <Button className="bg-pink-500 hover:bg-pink-600 text-white" disabled={!couponCode} onClick={() => {
              const COUPON_RULES = [
                { code: 'SAVE10', type: 'percent', value: 10 },
                { code: 'WELCOME20', type: 'percent', value: 20 },
                { code: 'MEMBER15', type: 'percent', value: 15 },
              ];
              const matched = COUPON_RULES.find(r => r.code === couponCode);
              if (!matched) { showFeedback('error', `Unknown coupon code: ${couponCode}`); return; }
              const subtotal = currentInvoice.subtotal || 0;
              const discountAmt = matched.type === 'percent' ? subtotal * matched.value / 100 : matched.value;
              setAppliedCoupon(matched.code); setCouponDiscount(discountAmt);
              setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));
              setShowCouponsDialog(false);
              showFeedback('success', `Coupon ${matched.code} applied — ${matched.value}% off`);
            }}>
              Apply Coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promotions Dialog */}
      <Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /> Active Promotions</DialogTitle>
            <DialogDescription>Current promotions available for this sale</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {appliedCoupon && (
              <div className="p-3 rounded-xl border bg-green-50 border-green-200 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1E293B]">Coupon: {appliedCoupon}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Bill discount — {formatCurrency(couponDiscount)} off applied</p>
                </div>
                <Badge className="bg-green-500 text-white text-[10px]">Active</Badge>
              </div>
            )}
            {(currentInvoice.billDiscountAmount > 0) && !appliedCoupon && (
              <div className="p-3 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1E293B]">Bill Discount</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(currentInvoice.billDiscountAmount)} off applied to this sale</p>
                </div>
                <Badge className="bg-amber-500 text-white text-[10px]">Active</Badge>
              </div>
            )}
            {!appliedCoupon && !(currentInvoice.billDiscountAmount > 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                <Zap className="h-8 w-8 opacity-30" />
                <p className="text-sm">No active promotions for this sale.</p>
                <p className="text-xs text-center">Use the Coupons button to apply a discount code.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-white" onClick={() => setShowPromotionsDialog(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Order Dialog */}
      <Dialog open={showSaveOrderDialog} onOpenChange={v => { if (!v) { setShowSaveOrderDialog(false); setOrderNotes(''); setSaveOrderError(''); } }}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-500" /> Save as Order</DialogTitle>
            <DialogDescription>Save this sale as a pending order to fulfil later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-indigo-50 rounded-lg text-sm">
              <p className="font-semibold text-indigo-800">{currentInvoice.items.filter(i => !i.isVoided).length} items · {formatCurrency(currentInvoice.total)}</p>
              <p className="text-indigo-600 text-xs mt-0.5">Customer: {selectedCustomerData?.name || 'Walk-in'}</p>
            </div>
            {saveOrderError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{saveOrderError}</p>}
            <Label>Order Notes (optional)</Label>
            <Input placeholder="e.g. Deliver by Friday, call before..." value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSaveOrderDialog(false); setOrderNotes(''); setSaveOrderError(''); }}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={saveOrderBusy || currentInvoice.items.filter(i => !i.isVoided).length === 0} onClick={async () => {
              setSaveOrderBusy(true); setSaveOrderError('');
              try {
                const soNumber = await getNextSalesOrderNumber();
                const branchId = currentTerminal?.branchId || currentSession?.branchId;
                const activeItems = currentInvoice.items.filter(i => !i.isVoided);
                const payload = {
                  soNumber,
                  orderDate: new Date().toISOString().slice(0, 10),
                  customerCode: selectedCustomerData?.id !== 'walk-in' ? (selectedCustomerData?.code || selectedCustomerData?.customerCode || null) : null,
                  customerName: selectedCustomerData?.name || 'Walk-in Customer',
                  status: 'DRAFT',
                  subTotal: currentInvoice.subtotal,
                  taxTotal: currentInvoice.tax,
                  orderTotal: currentInvoice.total,
                  customerNotes: orderNotes || null,
                  branch: branchId ? { id: branchId } : null,
                  items: activeItems.map(item => ({
                    itemCode: item.code || item.barcode || item.id,
                    description: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    discount: item.discount || 0,
                    taxRate: item.taxRate || 5,
                    taxAmount: item.total - (item.price * item.quantity * (1 - (item.discount || 0) / 100)),
                    lineTotal: item.total,
                  })),
                };
                await saveSalesOrder(payload);
                clearInvoice();
                syncPosData();
                setShowSaveOrderDialog(false);
                setOrderNotes('');
                showFeedback('success', `Order ${soNumber} saved`);
              } catch (e) {
                setSaveOrderError(e?.response?.data?.message || e?.message || 'Failed to save order');
              } finally {
                setSaveOrderBusy(false);
              }
            }}>
              <FileText className="h-4 w-4 mr-2" />{saveOrderBusy ? 'Saving…' : 'Save Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Orders List Dialog */}
      {showOrdersListDialog && (() => {
        const pendingCount = ordersList.filter(o => o.status === 'DRAFT' || o.status === 'CONFIRMED').length;
        const statusTabs = ['All', 'Pending', 'Completed', 'Cancelled'];
        const filteredOrders = ordersList.filter(o => {
          const matchSearch = !ordersListSearch.trim() ||
            (o.soNumber || '').toLowerCase().includes(ordersListSearch.toLowerCase()) ||
            (o.customerName || '').toLowerCase().includes(ordersListSearch.toLowerCase());
          const matchStatus = ordersListStatusFilter === 'All' ||
            (ordersListStatusFilter === 'Pending' && (o.status === 'DRAFT' || o.status === 'CONFIRMED')) ||
            (ordersListStatusFilter === 'Completed' && (o.status === 'INVOICED' || o.status === 'DELIVERED')) ||
            (ordersListStatusFilter === 'Cancelled' && o.status === 'CANCELLED');
          return matchSearch && matchStatus;
        });
        const sel = ordersListSelectedDetail;
        const selOrder = ordersListSelected;
        const statusBadge = (status) => {
          if (status === 'DRAFT') return 'bg-orange-100 text-orange-700 border-orange-200';
          if (status === 'CONFIRMED') return 'bg-blue-100 text-blue-700 border-blue-200';
          if (status === 'INVOICED') return 'bg-green-100 text-green-700 border-green-200';
          if (status === 'DELIVERED') return 'bg-teal-100 text-teal-700 border-teal-200';
          if (status === 'CANCELLED') return 'bg-red-100 text-red-600 border-red-200';
          return 'bg-gray-100 text-gray-500 border-gray-200';
        };
        const statusLabel = (status) => {
          if (status === 'DRAFT') return 'Pending';
          if (status === 'CONFIRMED') return 'Confirmed';
          return status ? status.charAt(0) + status.slice(1).toLowerCase() : '';
        };
        const handleSelectOrder = async (order) => {
          setOrdersListSelected(order);
          setOrdersListSelectedDetail(null);
          setOrdersListDetailLoading(true);
          try {
            const detail = await getSalesOrderById(order.id);
            setOrdersListSelectedDetail(detail);
          } catch { setOrdersListSelectedDetail(order); }
          finally { setOrdersListDetailLoading(false); }
        };
        const handleCancelOrder = async () => {
          if (!selOrder) return;
          if (!window.confirm(`Cancel order ${selOrder.soNumber}?`)) return;
          try {
            await updateSalesOrderStatus(selOrder.id, 'CANCELLED');
            const result = await getSalesOrdersPage({ page: 0, size: 50 });
            setOrdersList(Array.isArray(result?.content) ? result.content : (Array.isArray(result) ? result : []));
            setOrdersListSelected(null);
            setOrdersListSelectedDetail(null);
          } catch (e) { alert(e?.response?.data?.message || 'Failed to cancel order'); }
        };
        const handleOpenOrder = async () => {
          if (!sel) return;
          const items = sel.items || sel.orderItems || [];
          if (items.length === 0) { alert('Order has no items to load.'); return; }
          const mapped = items.map(it => ({
            id: it.productId || it.id || it.itemCode,
            name: it.productName || it.itemName || it.name || '',
            code: it.productCode || it.itemCode || it.code || '',
            price: toNumber(it.unitPrice || it.rate || it.price, 0),
            qty: toNumber(it.quantity || it.qty, 1),
            discount: toNumber(it.discountPercent || it.discount, 0),
            taxRate: toNumber(it.taxRate || it.vatRate, 0),
            unit: it.unit || 'Pcs',
            batchNumber: it.batchNumber || null,
            serialNumber: it.serialNumber || null,
          }));
          setCurrentInvoice(recalculateInvoice(mapped));
          setShowOrdersListDialog(false);
          setOrdersListSelected(null);
          setOrdersListSelectedDetail(null);
        };
        const handleCheckout = async () => {
          await handleOpenOrder();
          setShowPaymentDialog(true);
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => { setShowOrdersListDialog(false); setOrdersListSelected(null); setOrdersListSelectedDetail(null); }} />
            <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">SAVED ORDERS</p>
                  <p className="text-sm text-gray-500">{pendingCount} pending · {ordersList.length} total</p>
                </div>
                <button type="button" onClick={() => { setShowOrdersListDialog(false); setOrdersListSelected(null); setOrdersListSelectedDetail(null); }} className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body — split layout */}
              <div className="flex flex-1 min-h-0">
                {/* Left: list */}
                <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50 shrink-0">
                  <div className="p-3 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={ordersListSearch}
                        onChange={e => setOrdersListSearch(e.target.value)}
                        placeholder="Search by order no., customer, or item..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1 px-3 py-2 border-b border-gray-100 flex-wrap">
                    {statusTabs.map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setOrdersListStatusFilter(tab)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${ordersListStatusFilter === tab ? 'bg-amber-400 text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {ordersListLoading ? (
                      <div className="flex items-center justify-center h-24 text-gray-400 gap-2 text-xs">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading…
                      </div>
                    ) : filteredOrders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-1">
                        <Package className="h-8 w-8" />
                        <p className="text-xs text-gray-400">No orders found</p>
                      </div>
                    ) : filteredOrders.map(order => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => handleSelectOrder(order)}
                        className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors ${selOrder?.id === order.id ? 'bg-amber-50 border-l-2 border-l-amber-400' : 'hover:bg-white'}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-xs font-bold text-amber-600">{order.soNumber}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadge(order.status)}`}>{statusLabel(order.status)}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 truncate">{order.customerName || 'Walk-in Customer'}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-gray-400">{order.orderDate} · {(order.items || []).length} item{(order.items || []).length !== 1 ? 's' : ''}</span>
                          <span className="text-[11px] font-bold text-amber-500">{formatCurrency(order.orderTotal)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: detail */}
                <div className="flex-1 flex flex-col min-w-0">
                  {!selOrder ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-2">
                      <Package className="h-12 w-12" />
                      <p className="text-sm text-gray-400">Select an order to view details</p>
                    </div>
                  ) : ordersListDetailLoading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 gap-2 text-sm">
                      <RefreshCw className="h-4 w-4 animate-spin" />Loading details…
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base font-black text-amber-600">{selOrder.soNumber}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBadge(selOrder.status)}`}>{statusLabel(selOrder.status)}</span>
                            </div>
                            <p className="text-base font-semibold text-gray-800">{(sel || selOrder).customerName || 'Walk-in Customer'}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{selOrder.orderDate} {selOrder.orderTime ? ', ' + selOrder.orderTime : ''}</p>
                          </div>
                        </div>
                        {/* Items table */}
                        <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Item</th>
                                <th className="text-center px-3 py-2 font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Qty</th>
                                <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Price</th>
                                <th className="text-center px-3 py-2 font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Disc</th>
                                <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase text-[10px] tracking-wide">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {((sel || selOrder).items || (sel || selOrder).orderItems || []).map((it, idx) => {
                                const price = toNumber(it.unitPrice || it.rate || it.price, 0);
                                const qty = toNumber(it.quantity || it.qty, 1);
                                const disc = toNumber(it.discountPercent || it.discount, 0);
                                const amt = toNumber(it.lineTotal || it.amount || (price * qty * (1 - disc / 100)), 0);
                                return (
                                  <tr key={idx} className="border-t border-gray-50">
                                    <td className="px-3 py-2 text-gray-800 font-medium">{it.productName || it.itemName || it.name || '—'}</td>
                                    <td className="px-3 py-2 text-center text-gray-600">{qty}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(price)}</td>
                                    <td className="px-3 py-2 text-center text-gray-400">{disc ? `${disc}%` : '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatCurrency(amt)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Totals */}
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>{formatCurrency(toNumber((sel || selOrder).subTotal || (sel || selOrder).orderTotal, 0))}</span>
                          </div>
                          {toNumber((sel || selOrder).vatAmount || (sel || selOrder).taxAmount, 0) > 0 && (
                            <div className="flex justify-between text-gray-500">
                              <span>VAT ({toNumber((sel || selOrder).vatRate || (sel || selOrder).taxRate, 5)}%)</span>
                              <span>{formatCurrency(toNumber((sel || selOrder).vatAmount || (sel || selOrder).taxAmount, 0))}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-black text-base text-gray-800 pt-1 border-t border-gray-200">
                            <span>Total</span>
                            <span>{formatCurrency(toNumber((sel || selOrder).orderTotal, 0))}</span>
                          </div>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="border-t border-gray-100 px-5 py-3 flex gap-2 bg-gray-50 shrink-0">
                        <button
                          type="button"
                          onClick={handleCancelOrder}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />Cancel Order
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenOrder}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#1E293B] rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />Open / Pick Order
                        </button>
                        <button
                          type="button"
                          onClick={handleCheckout}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />Checkout
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-white shrink-0">
                <button type="button" onClick={() => { setShowOrdersListDialog(false); setOrdersListSelected(null); setOrdersListSelectedDetail(null); }} className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Close</button>
                <Button className="bg-amber-400 hover:bg-amber-500 text-white text-xs font-semibold" onClick={() => { setShowOrdersListDialog(false); setOrdersListSelected(null); setOrdersListSelectedDetail(null); setShowSaveOrderDialog(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />New Order
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Legacy Layaways Dialog (kept for backward compat) */}
      <Dialog open={showLayawaysDialog} onOpenChange={v => { if (!v) setShowLayawaysDialog(false); }}>
        <DialogContent className="max-w-sm bg-white" aria-describedby={undefined}>
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
            const searchData = await getProductsList(0, 1, q, undefined, null, null, null, true);
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
            <div className="relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-6 py-4 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2.5"><Search className="h-5 w-5 text-cyan-600" /><span className="text-lg font-bold text-[#1E293B]">Price Check</span></div>
                  <p className="text-sm text-gray-500 mt-1">Scan or search an item to check price, stock, barcode, and product details.</p>
                </div>
                <button onClick={() => setShowPriceCheck(false)} className="text-gray-400 hover:text-[#1E293B] transition-colors"><X className="h-6 w-6" /></button>
              </div>
              {/* Search */}
              <div className="bg-white border-b border-gray-100 px-6 py-4 flex gap-3 shrink-0">
                <div className="relative flex-1">
                  <AsyncSearchableDropdown
                    value={null}
                    inputValue={priceCheckQuery}
                    onInputChange={setPriceCheckQuery}
                    placeholder="Scan barcode or type item name / code..."
                    fetchOptions={async (query) => {
                      if (!query) return [];
                      try {
                        const resolved = await resolvePosEntry(query);
                        if (resolved?.type === 'PRODUCT' && resolved.product) {
                          return [mapPosProductAggregateItem(resolved.product, query)];
                        }
                        const searchData = await getProductsList(0, 10, query, undefined, null, null, null, true);
                        if (Array.isArray(searchData?.content)) {
                          return searchData.content.map(p => mapPosProductListItem(p));
                        }
                      } catch { return []; }
                      return [];
                    }}
                    renderOption={(opt, active) => (
                      <div className="flex items-center gap-3 p-2">
                        {opt.image ? (
                          <img src={opt.image.startsWith('data:') || opt.image.startsWith('http') ? opt.image : `data:image/jpeg;base64,${opt.image}`} alt="" className="w-10 h-10 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0"><Search className="h-5 w-5 text-gray-400" /></div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-sm text-gray-900 leading-tight truncate">{opt.name}</p>
                          <p className="text-xs text-gray-500 leading-tight truncate">{opt.code} {opt.barcode ? `| ${opt.barcode}` : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-[#327F74] text-sm">{opt.price} AED</p>
                          <p className="text-[10px] text-gray-500">Stock: {opt.stock}</p>
                        </div>
                      </div>
                    )}
                    onSelect={(opt) => {
                      if (opt) {
                        setPriceCheckQuery(opt.name || opt.code || '');
                        setPriceCheckResult(opt);
                      }
                    }}
                    className="w-full text-base"
                    debounceMs={300}
                  />
                </div>
                <button onClick={doSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0"><Search className="h-4 w-4" />Search</button>
                <button onClick={() => { setPriceCheckQuery(''); setPriceCheckResult(null); }} className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shrink-0">Clear</button>
              </div>
              <div className="overflow-auto flex-1 p-6">
                {priceCheckResult === null && (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                    <Search className="h-12 w-12 text-gray-300 mb-4" />
                    <p className="text-sm font-medium text-gray-500">Scan a barcode or type an item name to check price and availability.</p>
                  </div>
                )}
                {priceCheckResult === 'searching' && (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                    <div className="w-10 h-10 border-4 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin mb-4" />
                    <p className="text-sm font-medium text-gray-500">Searching...</p>
                  </div>
                )}
                {priceCheckResult === 'notfound' && (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                    <AlertCircle className="h-12 w-12 text-red-300 mb-4" />
                    <p className="text-sm font-medium text-gray-500">No item found for the scanned barcode or search keyword.</p>
                  </div>
                )}
                {foundProduct && (
                  <div className="space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-2xl p-5 flex flex-col md:flex-row gap-6 shadow-sm">
                      {/* Left: Image & Details */}
                      <div className="flex flex-1 gap-5">
                        <div className="w-28 h-28 shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                          {foundProduct.image
                            ? <img src={foundProduct.image} className="w-full h-full object-cover" alt={foundProduct.name} />
                            : <ShoppingCart className="w-8 h-8 text-gray-300" />}
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-3">
                          <div>
                            <h3 className="text-lg font-bold text-[#1E293B] leading-tight">{foundProduct.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{foundProduct.departmentName || 'General Department'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-1">
                            <div className="flex flex-col"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Item Code</span><span className="font-mono text-[#1E293B] font-semibold mt-0.5">{foundProduct.code}</span></div>
                            <div className="flex flex-col"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Barcode</span><span className="font-mono text-[#1E293B] font-semibold mt-0.5">{foundProduct.barcode}</span></div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Pricing & Stock */}
                      <div className="md:w-64 shrink-0 bg-gray-50 rounded-xl p-4 flex flex-col justify-center border border-gray-100 relative">
                        <div className="absolute -top-3 right-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm border ${foundProduct.stock > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {foundProduct.stock > 0 ? `${foundProduct.stock} in Stock` : 'Out of Stock'}
                          </span>
                        </div>

                        <div className="text-center mt-3 mb-4">
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Selling Price</p>
                          <div className="text-3xl font-black text-[#327F74] flex items-center justify-center gap-1">
                            <DirhamSymbol /> {finalPrice.toFixed(2)}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1.5 font-medium">VAT {vatRate}% Included</p>
                        </div>

                        <div className="space-y-1.5 pt-3 border-t border-gray-200">
                          <div className="flex justify-between text-[11px] font-semibold">
                            <span className="text-gray-500">Base Price:</span>
                            <span className="text-[#1E293B]"><DirhamSymbol /> {basePrice.toFixed(2)}</span>
                          </div>
                          {discountPct > 0 && (
                            <div className="flex justify-between text-[11px] text-orange-600 font-bold">
                              <span>Discount ({discountPct}%):</span>
                              <span>−<DirhamSymbol /> {(basePrice - discountedPrice).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3 shrink-0">
                <button onClick={() => setShowPriceCheck(false)} className="bg-white border border-gray-300 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Close</button>
                {foundProduct && (
                  <button onClick={() => { addToInvoice(foundProduct); setShowPriceCheck(false); setPriceCheckQuery(''); setPriceCheckResult(null); }}
                    className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold text-sm px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition-colors">
                    <Plus className="h-4 w-4" />Add to Cart
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── SEARCH PRODUCTS MODAL ─── */}
      {showProductSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowProductSearch(false)} />
          <div className="relative bg-[#F7F7FA] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-white border-b border-[#327F74]/20 px-6 py-4 flex items-start justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2.5"><Search className="h-5 w-5 text-cyan-600" /><span className="text-lg font-bold text-[#1E293B]">Search Products</span></div>
                <p className="text-sm text-gray-500 mt-1">Search by item code, barcode, or product name — matches anywhere in the name.</p>
              </div>
              <button onClick={() => setShowProductSearch(false)} className="text-gray-400 hover:text-[#1E293B] transition-colors"><X className="h-6 w-6" /></button>
            </div>
            <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={productSearchQuery}
                  onChange={e => setProductSearchQuery(e.target.value)}
                  placeholder="Type an item code, barcode, or any part of a product name..."
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#F5C742] focus:bg-white"
                />
              </div>
            </div>
            <div className="overflow-auto flex-1 p-6">
              {!productSearchQuery.trim() && (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                  <Search className="h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-sm font-medium text-gray-500">Start typing to search the product catalogue.</p>
                </div>
              )}
              {productSearchQuery.trim() && productSearchLoading && (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                  <div className="w-10 h-10 border-4 border-[#327F74]/20 border-t-[#327F74] rounded-full animate-spin mb-4" />
                  <p className="text-sm font-medium text-gray-500">Searching...</p>
                </div>
              )}
              {productSearchQuery.trim() && !productSearchLoading && productSearchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
                  <AlertCircle className="h-12 w-12 text-red-300 mb-4" />
                  <p className="text-sm font-medium text-gray-500">No products match "{productSearchQuery.trim()}".</p>
                </div>
              )}
              {!productSearchLoading && productSearchResults.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {productSearchResults.map(product => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        const res = addToInvoice(product, 1);
                        if (res && res.ok === false) {
                          showFeedback('error', res.reason || 'Could not add this item.');
                          return;
                        }
                        showFeedback('success', `${product.name} added`);
                      }}
                      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-[#F5C742] hover:shadow-md transition-all text-left"
                    >
                      <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                        {product.image
                          ? <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
                          : <Package className="w-5 h-5 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1E293B] leading-tight truncate">{product.name}</p>
                        <p className="text-[11px] font-mono text-gray-400 truncate">{product.code}{product.barcode ? ` | ${product.barcode}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[#327F74]">{formatCurrency(product.price)}</p>
                        <p className={`text-[10px] font-bold ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                          {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end shrink-0">
              <button onClick={() => setShowProductSearch(false)} className="bg-white border border-gray-300 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

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
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex gap-2 shrink-0 overflow-visible">
                <div className="flex-1">
                  <CustomerPicker
                    customers={posCustomers}
                    value={creditBalanceQuery}
                    onChange={async (customerId) => {
                      setCreditBalanceQuery(customerId || '');
                      if (!customerId) {
                        setCreditBalanceResult(null);
                        return;
                      }
                      const c = posCustomers.find(x => x.id === customerId);
                      if (!c) return;
                      setCreditBalanceResult('searching');
                      try {
                        const res = await posCreditBalance(c.code || c.mobile || String(customerId));
                        setCreditBalanceResult(res.found ? res : 'notfound');
                      } catch { setCreditBalanceResult('notfound'); }
                    }}
                    placeholder="Search or select customer..."
                  />
                </div>
                <button onClick={() => { setCreditBalanceQuery(''); setCreditBalanceResult(null); }} className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded hover:bg-gray-50">Clear</button>
              </div>
              <div className="overflow-auto flex-1 p-5">
                {creditBalanceResult === null && <div className="flex flex-col items-center justify-center h-40 text-center"><Star className="h-10 w-10 text-gray-200 mb-3" /><p className="text-sm text-gray-400">Search customer to check balance.</p></div>}
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        {[['Mobile', data.customer.mobile || '—'], ['Email', data.customer.email || '—'], ['Type', data.customer.groupType || '—']].map(([k, v]) => (
                          <div key={k}><span className="text-gray-400">{k}:</span><span className="ml-1 text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                    </div>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { label: 'Outstanding', val: <CurrencyAmount amount={toNumber(data.outstanding, 0)} />, sub: 'unpaid invoices', color: 'text-red-600' },
                        { label: 'Credit Limit', val: <CurrencyAmount amount={toNumber(data.creditLimit, 0)} />, sub: 'approved limit', color: 'text-[#327F74]' },
                        { label: 'Advance Balance', val: <CurrencyAmount amount={toNumber(data.advanceBalance, 0)} />, sub: 'available deposit', color: 'text-violet-600' },
                      ].map(k => (
                        <div key={k.label} className="bg-white border border-[#327F74]/20 rounded-lg p-4 text-center shadow-sm">
                          <p className="text-[11px] text-gray-400 mb-1">{k.label}</p>
                          <p className={`text-lg font-bold ${k.color}`}>{k.val}</p>
                          <p className="text-[10px] text-gray-400">{k.sub}</p>
                        </div>
                      ))}
                    </div>
                    {/* Credit limit utilisation bar */}
                    {toNumber(data.creditLimit, 0) > 0 && (() => {
                      const pct = Math.min(100, (toNumber(data.outstanding, 0) / toNumber(data.creditLimit, 0)) * 100);
                      const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[#327F74]';
                      return (
                        <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Credit utilisation</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                <button onClick={() => setShowCreditBalance(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Close</button>
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
            hold: !!l.hold,
            raw: l,
          };
        });
        const selected = filtered.find(l => l.entityId === selectedLayawayId) || null;
        const statusColor = (s) => ({ Active: 'bg-green-100 text-green-700', 'Partially Paid': 'bg-blue-100 text-blue-700', 'Ready to Convert': 'bg-[#F5C742]/20 text-amber-700', 'Converted to Sale': 'bg-gray-100 text-gray-600', Cancelled: 'bg-red-100 text-red-600', Expired: 'bg-red-50 text-red-500' }[s] || 'bg-gray-100 text-gray-500');
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowLayawaysList(false)} />
            <div className="relative ml-auto w-full max-w-5xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Pause className="h-4 w-4 text-amber-500" /><span className="text-base font-semibold text-[#1E293B]">Layaways</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">View and manage all sales reserved using Save Layaway.</p>
                </div>
                <button onClick={() => setShowLayawaysList(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Filters */}
              <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Layaway No.</label><input value={layawaysFilterNo} onChange={e => setLayawaysFilterNo(e.target.value)} placeholder="LAY-..." className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Customer</label><input value={layawaysFilterCustomer} onChange={e => setLayawaysFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#327F74]" /></div>
                <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-400">Status</label>
                  <select value={layawaysFilterStatus} onChange={e => setLayawaysFilterStatus(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                    {['All', 'Active', 'Partially Paid', 'Ready to Convert', 'Converted to Sale', 'Cancelled', 'Expired'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <button onClick={() => loadLayaways()} className="mt-auto bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />Search</button>
                <button onClick={() => { setLayawaysFilterStatus('All'); setLayawaysFilterCustomer(''); setLayawaysFilterNo(''); setTimeout(loadLayaways, 0); }} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                <button onClick={() => { setShowLayawaysList(false); setShowSaveLayaway(true); }} className="mt-auto ml-auto bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Plus className="h-3 w-3" />New Layaway</button>
              </div>
              <div className="flex flex-1 min-h-0">
                <div className={`flex flex-col overflow-hidden ${selected ? 'w-1/2 lg:w-[55%]' : 'w-full'} border-r border-[#327F74]/10`}>
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
                          <tr className="text-gray-500">{['Layaway No.', 'Date & Time', 'Customer', 'Cashier', 'Items', 'Sale Amt', 'Deposit', 'Balance', 'Due Date', 'Status', 'Action'].map((h, i) => <th key={i} className={`px-3 py-2 text-left font-medium ${i >= 4 && i <= 7 ? 'text-right' : ''} ${i === 10 ? 'text-center' : ''}`}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {filtered.map(l => (
                            <tr key={l.entityId} onClick={() => setSelectedLayawayId(l.entityId === selectedLayawayId ? null : l.entityId)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors ${l.status === 'Expired' ? 'bg-red-50/30' : ''} ${l.entityId === selectedLayawayId ? 'bg-[#FFF8DC] border-l-2 border-l-[#F5C742]' : 'hover:bg-white'}`}>
                              <td className="px-3 py-2 font-semibold text-[#1E293B] whitespace-nowrap">
                                {l.id}
                                {l.hold && <span className="ml-1.5 text-[9px] uppercase tracking-wide rounded px-1 py-0.5 bg-purple-100 text-purple-700">Hold</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.date}</td>
                              <td className="px-3 py-2 text-[#1E293B] max-w-[160px] truncate">{l.customer}</td>
                              <td className="px-3 py-2 text-gray-500">{l.cashier}</td>
                              <td className="px-3 py-2 text-right">{l.items}</td>
                              <td className="px-3 py-2 text-right font-semibold"><CurrencyAmount amount={l.saleAmt} /></td>
                              <td className="px-3 py-2 text-right text-green-700"><CurrencyAmount amount={l.deposit} /></td>
                              <td className="px-3 py-2 text-right text-red-600"><CurrencyAmount amount={l.balance} /></td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.due}</td>
                              <td className="px-3 py-2"><span className={`text-[10px] rounded px-1.5 py-0.5 ${statusColor(l.status)}`}>{l.status}</span></td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={e => { e.stopPropagation(); setSelectedLayawayId(l.entityId); }} className="border border-[#327F74]/30 text-[#327F74] text-[10px] px-1.5 py-0.5 rounded hover:bg-[#327F74]/5">View</button>
                                  {l.isOpen && <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-[10px] px-1.5 py-0.5 rounded" onClick={e => { e.stopPropagation(); startLayawayConversion(l.entityId); }}>Convert</button>}
                                  {l.isOpen && <button disabled={layawayBusyId === l.entityId} className="border border-red-300 text-red-600 text-[10px] px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-40" onClick={e => { e.stopPropagation(); handleCancelLayaway(l.entityId); }}>{layawayBusyId === l.entityId ? '…' : 'Delete'}</button>}
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
                  <div className="w-1/2 lg:w-[45%] flex flex-col bg-white overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F7F7FA] border-b border-[#327F74]/10 flex items-center justify-between shrink-0">
                      <span className="text-xs font-semibold text-[#1E293B]">{selected.id}</span>
                      <button onClick={() => setSelectedLayawayId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="overflow-auto flex-1 p-4 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {[['Customer', selected.customer], ['Cashier', selected.cashier], ['Sale Amount', <CurrencyAmount amount={selected.saleAmt} />], ['Deposit Paid', <CurrencyAmount amount={selected.deposit} />], ['Balance Due', <CurrencyAmount amount={selected.balance} />], ['Due Date', selected.due], ['Status', selected.status], ['Created', selected.date + ' ' + selected.time]].map(([k, v]) => (
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
                            <thead><tr className="text-gray-400">{['Item', 'Qty', 'Rate', 'Amount'].map(h => <th key={h} className={`py-0.5 text-left ${h !== 'Item' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                            <tbody>
                              {(selectedLayawayDetail.items || []).map((it, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-1 text-[#1E293B]">{it.itemName}{it.pinnedBatchNumber && <span className="ml-1 text-[9px] text-amber-600">[{it.pinnedBatchNumber}]</span>}</td>
                                  <td className="py-1 text-right text-[#1E293B]">{it.quantity}</td>
                                  <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={it.price || 0} /></td>
                                  <td className="py-1 text-right text-[#1E293B]"><CurrencyAmount amount={(it.price || 0) * (it.quantity || 0) * (1 - (it.discount || 0) / 100)} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                      {selected.isOpen && <button onClick={() => startLayawayConversion(selected.entityId)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><Zap className="h-3 w-3" />Convert to Sale</button>}
                      {selected.isOpen && <button disabled={layawayBusyId === selected.entityId} onClick={() => handleCancelLayaway(selected.entityId)} className="border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-50 flex items-center gap-1 disabled:opacity-40"><XCircle className="h-3 w-3" />{layawayBusyId === selected.entityId ? 'Cancelling…' : 'Cancel'}</button>}
                      {selected.raw?.convertedInvoiceNumber && <span className="text-[11px] text-gray-500 self-center">Converted → {selected.raw.convertedInvoiceNumber}</span>}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-2.5 flex justify-end shrink-0">
                <button onClick={() => setShowLayawaysList(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── CONFIRM ACTION MODAL ─── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !confirmAction.busy && setConfirmAction(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-[#1E293B] mb-1">{confirmAction.title}</h3>
              <p className="text-sm text-gray-500">{confirmAction.message}</p>
              {confirmAction.error && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                  {confirmAction.error}
                </div>
              )}
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={confirmAction.busy}
                className="flex-1 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={confirmAction.onConfirm}
                disabled={confirmAction.busy}
                className="flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {confirmAction.busy ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Deleting…</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5" />Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SAVE LAYAWAY MODAL ─── */}
      {showSaveLayaway && (() => {
        // Can't create a new layaway while converting an existing one.
        if (activeLayawayId) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowSaveLayaway(false)} />
              <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
                <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-[#1E293B]">Layaway Conversion In Progress</p>
                <p className="text-xs text-gray-500">Complete or cancel the current layaway conversion before saving a new one.</p>
                <button onClick={() => setShowSaveLayaway(false)} className="mt-2 bg-[#327F74] text-white text-sm px-4 py-2 rounded hover:bg-[#286660]">OK</button>
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
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowSaveLayaway(false)} />
            <div className="relative bg-[#F7F7FA] rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><Archive className="h-4 w-4 text-amber-500" /><span className="text-base font-semibold text-[#1E293B]">Save Layaway</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Reserve the current sale for the customer with or without deposit and print a layaway receipt.</p>
                </div>
                <button onClick={() => setShowSaveLayaway(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="overflow-auto flex-1">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
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
                      <button onClick={() => { setShowSaveLayaway(false); setShowCustomerDropdown(true); }} className="mt-2 text-xs text-[#327F74] border border-[#327F74]/30 rounded px-2 py-1 hover:bg-[#327F74]/5 flex items-center gap-1"><UserPlus className="h-3 w-3" />Search / Add Customer</button>
                    </div>
                    {/* Cart Items */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                      <div className="px-4 py-2 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B]">Cart Items</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="text-gray-400 border-b border-gray-100">{['Item', 'Qty', 'Rate', 'Disc', 'VAT', 'Total'].map(h => <th key={h} className={`px-3 py-1.5 text-left ${h !== 'Item' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                          <tbody>
                            {activeCartItems.length === 0 && currentInvoice.items.filter(i => i.isVoided).length === 0 ? (
                              <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No items in cart</td></tr>
                            ) : currentInvoice.items.map((item, i) => (
                              <tr key={i} className={`border-b border-gray-50 ${item.isVoided ? 'bg-red-50/60 opacity-70' : ''}`}>
                                <td className="px-3 py-1.5">
                                  <span className={item.isVoided ? 'line-through text-red-400' : 'text-[#1E293B]'}>{item.name}</span>
                                  {item.isVoided && <span className="ml-1 text-[9px] font-bold text-red-500">VOIDED</span>}
                                </td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'line-through text-red-400' : ''}`}>{item.quantity}</td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'line-through text-red-400' : ''}`}><CurrencyAmount amount={item.price} /></td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'text-red-300' : 'text-red-500'}`}>{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'line-through text-red-400' : ''}`}>{toNumber(item.taxRate, 5)}%</td>
                                <td className={`px-3 py-1.5 text-right font-semibold ${item.isVoided ? 'line-through text-red-400' : ''}`}><CurrencyAmount amount={item.isVoided ? 0 : item.quantity * item.price * (1 - item.discount / 100)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
                        <button onClick={() => setSaveLayawayDepositReq(!saveLayawayDepositReq)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${saveLayawayDepositReq ? 'bg-[#327F74]' : 'bg-gray-200'}`}>
                          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${saveLayawayDepositReq ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                      {saveLayawayDepositReq && (
                        <>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Deposit Amount (<DirhamSymbol />)</label>
                            <input type="number" value={saveLayawayDeposit} onChange={e => setSaveLayawayDeposit(e.target.value)} placeholder="0.00" className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Deposit Payment Mode</label>
                            <select value={saveLayawayPayMode} onChange={e => setSaveLayawayPayMode(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                              {['Cash', 'Card', 'Bank Transfer', 'Wallet'].map(o => <option key={o}>{o}</option>)}
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
                        <input type="date" value={saveLayawayDueDate} onChange={e => setSaveLayawayDueDate(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Remarks</label>
                        <textarea value={saveLayawayRemarks} onChange={e => setSaveLayawayRemarks(e.target.value)} placeholder="Collection instructions, notes..." className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs resize-none h-14 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                    </div>
                    {/* Options */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-2">
                      <p className="text-xs font-semibold text-[#1E293B] mb-1">Options</p>
                      {([['Reserve Stock', saveLayawayReserveStock, setSaveLayawayReserveStock], ['Print Layaway Receipt', saveLayawayPrintReceipt, setSaveLayawayPrintReceipt], ['Send SMS / WhatsApp', saveLayawaySendSms, setSaveLayawaySendSms]]).map(([label, val, setter]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{label}</span>
                          <button onClick={() => setter(!val)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${val ? 'bg-[#327F74]' : 'bg-gray-200'}`}>
                            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Receipt Preview */}
                    <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden">
                      <div className="px-4 py-2 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B]">Receipt Preview</div>
                      <div className="p-3 text-xs space-y-1">
                        <p className="text-center font-bold text-[#1E293B]">{tplOutletName}</p>
                        <p className="text-center text-gray-500 text-[10px]">{tplOutletAddress}</p>
                        <div className="border-t border-gray-100 my-1 pt-1 text-[10px] text-amber-700 font-semibold text-center">NOT A TAX INVOICE — LAYAWAY RECEIPT</div>
                        {[['Layaway No.', 'Auto (LAY-…)'], ['Date', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })], ['Customer', hasCustomer ? selectedCustomerData?.name : '—'], ['Total', <CurrencyAmount amount={total} />], ['Deposit', <CurrencyAmount amount={dep} />], ['Balance Due', <CurrencyAmount amount={balance} />], ['Expiry', saveLayawayDueDate]].map(([k, v]) => (
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
                <button onClick={() => setShowSaveLayaway(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                <button disabled={!canSave} onClick={() => saveCurrentLayaway(false)} className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"><Archive className="h-3.5 w-3.5" />{saveLayawayBusy ? 'Saving…' : 'Save Layaway'}</button>
                <button disabled={!canSave} onClick={() => saveCurrentLayaway(true)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"><Printer className="h-3.5 w-3.5" />Save &amp; Print Receipt</button>
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
        const returnDiscount = returnableItems.reduce((s, it) => {
          const qty = returnSelectedItems[it.itemCode] || 0;
          return s + qty * parseFloat(it.unitPrice || 0) * (parseFloat(it.discountPercent || 0) / 100);
        }, 0);
        const returnVAT = returnableItems.reduce((s, it) => {
          const qty = returnSelectedItems[it.itemCode] || 0;
          const gross = qty * parseFloat(it.unitPrice || 0);
          const disc = gross * (parseFloat(it.discountPercent || 0) / 100);
          return s + (gross - disc) * (parseFloat(it.taxRate || 5) / 100);
        }, 0);
        const returnNet = returnSubtotal - returnDiscount + returnVAT;
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
            const pastReturnsPage = await getSalesReturnsPage({ search: returnInvoiceFound.invoiceNumber, size: 100 });
            const pastReturns = pastReturnsPage?.content || [];

            const alreadyReturnedMap = {};
            pastReturns.forEach(ret => {
              if (ret.status === 'DRAFT' || ret.status === 'REJECTED') return;
              (ret.items || []).forEach(ri => {
                if (ri.itemCode) {
                  alreadyReturnedMap[ri.itemCode] = (alreadyReturnedMap[ri.itemCode] || 0) + (Number(ri.returnQty) || 0);
                }
              });
            });

            const grouped = {};
            (batches || []).forEach(b => {
              const key = b.itemCode;
              if (!grouped[key]) {
                grouped[key] = {
                  itemCode: b.itemCode, itemName: b.itemName, unit: b.unit,
                  soldQty: 0, alreadyReturned: 0, returnable: 0, unitPrice: 0, taxRate: 5, discountPercent: 0, batches: []
                };
              }
              grouped[key].soldQty += parseFloat(b.originalQty || 0);
              grouped[key].batches.push(b);
            });
            const invoiceItems = returnInvoiceFound.items || [];

            invoiceItems.forEach(invItem => {
              if (!grouped[invItem.itemCode] && !invItem.voided) {
                grouped[invItem.itemCode] = {
                  itemCode: invItem.itemCode, itemName: invItem.itemName,
                  unit: invItem.unit || 'Each', soldQty: parseFloat(invItem.quantity || 0),
                  alreadyReturned: 0, returnable: 0,
                  unitPrice: parseFloat(invItem.price || 0), taxRate: parseFloat(invItem.taxRate || 5),
                  discountPercent: parseFloat(invItem.discount || 0), batches: []
                };
              }
            });

            Object.values(grouped).forEach(g => {
              const invItem = invoiceItems.find(i => i.itemCode === g.itemCode);
              if (invItem) { g.unitPrice = parseFloat(invItem.price || 0); g.taxRate = parseFloat(invItem.taxRate || 5); g.discountPercent = parseFloat(invItem.discount || 0); }

              const totalSold = g.soldQty;
              const alreadyRet = alreadyReturnedMap[g.itemCode] || 0;
              g.alreadyReturned = alreadyRet;
              g.returnable = Math.max(0, totalSold - alreadyRet);
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
                // Send the raw condition ('Good' / 'Damaged') — the backend's restock/COGS-reversal
                // logic does an exact match against "Good"; the display-style "Good/Restock" /
                // "Damaged/Scrap" strings this used to send never matched, so every POS-originated
                // return was silently treated as scrap (no stock restored, no COGS reversed).
                const itemStatus = returnItemConditions[it.itemCode] || 'Good';
                const grossAmt = qty * parseFloat(it.unitPrice || 0);
                const discountAmt = grossAmt * (parseFloat(it.discountPercent || 0) / 100);
                const netAmt = grossAmt - discountAmt;
                const taxAmt = netAmt * (parseFloat(it.taxRate || 5) / 100);
                const itemTotal = netAmt + taxAmt;
                const batchesForItem = it.batches.slice(0, qty).map(b => ({
                  originalAllocationId: b.allocationId, batchMasterId: b.batchMasterId,
                  batchNumber: b.batchNumber, binCode: b.binCode, quantity: 1, expiryDate: b.expiryDate,
                }));
                return {
                  itemCode: it.itemCode, itemName: it.itemName, unit: it.unit,
                  soldQty: it.soldQty, returnQty: qty, price: it.unitPrice, taxRate: it.taxRate,
                  discountPercent: it.discountPercent || 0, discountAmount: discountAmt,
                  taxAmount: taxAmt,
                  total: itemTotal, itemStatus, reason: returnReasons[it.itemCode] || '', batches: batchesForItem
                };
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
              const returnInvoiceData = {
                invoiceNumber: saved.returnNumber || '',
                invoiceDate: saved.returnDate || new Date().toISOString(),
                createdAt: saved.createdAt || new Date().toISOString(),
                customerName: inv.customerName || 'Walk-in Customer',
                customerAddress: inv.customerAddress || '',
                customerPhone: inv.customerPhone || '',
                paymentMode: returnRefundMethod,
                subTotal: returnSubtotal,
                discountTotal: returnDiscount,
                taxTotal: returnVAT,
                invoiceTotal: returnNet,
                items: itemsPayload.map(i => ({
                  itemName: i.itemName,
                  quantity: i.returnQty,
                  unitPrice: i.price,
                  netAmount: i.total,
                  batchNumber: i.batches?.[0]?.batchNumber || '',
                })),
              };
              const returnA4Data = {
                title: 'CREDIT NOTE',
                docNo: saved.returnNumber || '',
                date: saved.returnDate || new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }),
                customer: { name: inv.customerName || 'Walk-in Customer', address: inv.customerAddress || '', phone: inv.customerPhone || '', email: '', trn: '' },
                items: itemsPayload.map(i => ({
                  code: i.itemCode || '',
                  name: i.itemName,
                  desc: `Orig. Invoice: ${inv.invoiceNumber}`,
                  qty: i.returnQty,
                  price: i.price,
                  discountPercent: i.discountPercent || 0,
                  discountAmount: i.discountAmount || 0,
                  tax: i.taxRate || 5,
                  taxAmt: i.taxAmount || 0,
                  total: i.total,
                  batchNumber: i.batches?.[0]?.batchNumber || '',
                })),
                totals: { subTotal: returnSubtotal, tax: returnVAT, grandTotal: returnNet, itemDiscountAmount: returnDiscount, billDiscountAmount: 0 },
                meta: { notes: tplReturnFooter, paymentMode: returnRefundMethod, location: tplOutletName, salesPerson: '' },
              };
              if (tplReturnPaper === 'A4') {
                const returnA4Template = buildPosA4Template(tplReturnFooter, {
                  showLogo: tplReturnShowLogo, showCompanyDetails: tplReturnShowCompanyDetails,
                  showTrn: tplReturnShowTrn, showCustomerDetails: tplReturnShowCustomerDetails,
                  showTerms: tplReturnShowTerms, showNotes: tplReturnShowNotes,
                  showQRCode: tplReturnShowQRCode, showStamp: tplReturnShowStamp,
                  showSignature: tplReturnShowSignature, showGrandTotalBanner: tplReturnShowGrandTotalBanner,
                  colItemCode: tplReturnColItemCode, colBatchNo: tplReturnColBatchNo,
                  colDiscount: tplReturnColDiscount, colVatPct: tplReturnColVatPct, colVatAmt: tplReturnColVatAmt,
                }, 'Sales Return');
                const returnA4Options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplReturnShowStamp } };
                printHtml(await generatePrintHtmlAsync(returnA4Template, returnA4Data, returnA4Options));
              } else {
                const returnPrinter = resolvePrinterForContext(printerConfigs, {
                  deviceType: 'RECEIPT_PRINTER',
                  branchId: inv.branchId || currentTerminal?.branchId || null,
                  terminalId: currentTerminal?.terminalId || null,
                });
                // Credit-account block for a return. The backend does NOT return the
                // customer's post-return balance on the save response, so the old code
                // fell back to Previous=0 / Updated=returnNet — i.e. it printed the
                // return amount as a NEW positive balance the customer owes, the exact
                // opposite of what a credit note does. Fix: a Credit Voucher reduces the
                // customer's outstanding, so query the real post-approval balance (the
                // return is APPROVED above) and render it as a reduction — Invoice Credit
                // is 0 (no new charge) and "Amount Paid" carries the credited amount, so
                // Previous − returnNet = Updated holds. A cash/card Refund does not touch
                // the credit ledger, so the block is suppressed for it (nothing to show).
                let retCreditPrev = null, retCreditUpdated = null, retShowCredit = false;
                if (tplReturnShowCreditBalance && returnRefundMethod === 'Credit Voucher'
                    && inv.customerCode && inv.customerName && inv.customerName !== 'Walk-in Customer') {
                  try {
                    const cr = await posCreditBalance(inv.customerCode);
                    if (cr?.found && cr.outstanding != null) {
                      retCreditUpdated = parseFloat(cr.outstanding) || 0;
                      retCreditPrev = retCreditUpdated + returnNet;
                      retShowCredit = true;
                    }
                  } catch (_) { /* leave the block suppressed if the lookup fails */ }
                }
                if (!returnPrinter) {
                  notifyPrintFallback('No receipt printer is configured for this terminal — the credit note was saved, but it did not print. Set one up in Settings → Devices.');
                } else {
                  try {
                    const qrContent = tplReturnShowQRCode ? buildQrContent(returnA4Data, tplOutletName) : null;
                    const returnText = buildThermalReceiptText(tplReturnPaper, returnInvoiceData, { companyName: tplOutletName, trn: tplOutletTrn, header: tplReturnHeader, footer: tplReturnFooter, showTrn: tplReturnShowTrn, documentTitle: 'CREDIT NOTE', currency: activeCurrency, customerPhone: returnInvoiceData.customerPhone, showCustomerDetails: tplReturnShowCustomerDetails });
                    const returnBuildEscPosBase64 = (getReceiptTemplate(receiptTemplateId).buildEscPosBase64) || buildEscPosReceiptBase64;
                    const returnEscPosBase64 = await returnBuildEscPosBase64(tplReturnPaper, returnInvoiceData, {
                      companyName: tplOutletName, trn: tplOutletTrn, header: tplReturnHeader, footer: tplReturnFooter,
                      showTrn: tplReturnShowTrn, documentTitle: 'CREDIT NOTE',
                      logoDataUrl: tplLogoDataUrl, showLogo: tplReturnShowLogo,
                      showCompanyDetails: tplReturnShowCompanyDetails, outletAddress: tplOutletAddress, outletPhone: tplOutletPhone,
                      showServiceCharge: tplReturnShowGrandTotalBanner, showVatSummary: tplReturnColVatAmt, showPaymentDetails: tplReturnColDiscount,
                      showQRCode: tplReturnShowQRCode, qrContent,
                      showCustomerDetails: tplReturnShowCustomerDetails, showFooterText: tplReturnShowTerms,
                      customerPhone: returnInvoiceData.customerPhone, currency: activeCurrency,
                      cashierName: cashierDisplayName,
                      terminalId: currentTerminal?.terminalId,
                      counterName: currentTerminal?.counterName,
                      showCreditBalance: retShowCredit,
                      creditPreviousBalance: retShowCredit ? retCreditPrev : null,
                      creditInvoiceCredit: 0,
                      creditAmountPaid: retShowCredit ? returnNet : 0,
                      creditUpdatedBalance: retShowCredit ? retCreditUpdated : null,
                    });
                    await sendEscPosReceiptToConfiguredPrinter(returnPrinter, { dataBase64: returnEscPosBase64, receiptText: returnText, title: `Credit Note ${saved.returnNumber || ''}`.trim() });
                  } catch (err) {
                    console.warn('ESC/POS print failed for return receipt', err);
                    notifyPrintFallback(`The credit note was saved, but it didn't print: ${err?.message || 'printer error'}.`);
                  }
                }
              }
            }
            syncPosData();
            setShowReturn(false); setReturnStep(1); setReturnInvoiceQuery(''); setReturnCustomerMobile('');
            setReturnDateFrom(''); setReturnInvoiceFound(null); setReturnableItems([]);
            setReturnSelectedItems({}); setReturnReasons({}); setReturnItemConditions({});
            setReturnRefundMethod('Cash Back'); setReturnSavedId(null);
          } catch (err) {
            alert(err?.response?.data?.message || err?.message || 'Error processing return.');
          } finally { setReturnSaving(false); }
        };
        const steps = ['Scan Invoice', 'Select Items', 'Refund Method', 'Confirm Return'];
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowReturn(false)} />
            <div className="relative ml-auto w-full max-w-4xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-purple-600" /><span className="text-base font-semibold text-[#1E293B]">Sales Return</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">Scan the old invoice, select returned items and quantities, and process refund or credit voucher.</p>
                </div>
                <button onClick={() => setShowReturn(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {/* Step Progress */}
              <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-0 shrink-0">
                {steps.map((s, i) => (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${returnStep > i + 1 ? 'bg-[#327F74] text-white' : returnStep === i + 1 ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-100 text-gray-400'}`}>{returnStep > i + 1 ? '✓' : i + 1}</div>
                      <span className={`text-xs ${returnStep === i + 1 ? 'font-semibold text-[#1E293B]' : 'text-gray-400'}`}>{s}</span>
                    </div>
                    {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
                  </React.Fragment>
                ))}
              </div>
              <div className="overflow-auto flex-1 p-5">
                {/* STEP 1 — Invoice Lookup */}
                {returnStep === 1 && (
                  <div className="max-w-lg mx-auto space-y-4">
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Scan / Search Invoice</p>
                      <AsyncSearchableDropdown
                        value={null}
                        inputValue={returnInvoiceQuery}
                        onInputChange={(val) => { setReturnInvoiceQuery(val); setReturnInvoiceFound(null); setReturnInvoiceError(''); }}
                        placeholder="Scan invoice barcode or enter invoice number..."
                        fetchOptions={async (query) => {
                          if (!query) return [];
                          try {
                            const res = await getSalesInvoicesPage({ search: query, size: 5 });
                            if (res && res.content) {
                              return res.content;
                            }
                          } catch { return []; }
                          return [];
                        }}
                        renderOption={(opt, active) => (
                          <div className="flex justify-between items-center p-2 border-b border-gray-50 last:border-0">
                            <div>
                              <p className="font-bold text-sm text-[#1E293B]">{opt.invoiceNumber}</p>
                              <p className="text-xs text-gray-500">{opt.customerName || 'Walk-in'}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-[#327F74] text-sm">{opt.grandTotal} AED</p>
                              <p className="text-[10px] text-gray-400">{opt.invoiceDate ? new Date(opt.invoiceDate).toLocaleDateString() : ''}</p>
                            </div>
                          </div>
                        )}
                        onSelect={(opt) => {
                          if (opt) {
                            setReturnInvoiceQuery(opt.invoiceNumber);
                            // Give state a moment to update before running doSearchInvoice, which reads from returnInvoiceQuery state
                            setTimeout(() => document.getElementById('searchInvoiceBtn')?.click(), 50);
                          }
                        }}
                        className="w-full"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">Customer Mobile</label>
                          <input value={returnCustomerMobile}
                            onChange={e => { setReturnCustomerMobile(e.target.value); setReturnInvoiceFound(null); setReturnInvoiceError(''); }}
                            onKeyDown={e => e.key === 'Enter' && doSearchInvoice()}
                            placeholder="+971 XX XXX XXXX" className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">From Date</label>
                          <input type="date" value={returnDateFrom} onChange={e => setReturnDateFrom(e.target.value)}
                            className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button id="searchInvoiceBtn" onClick={doSearchInvoice} disabled={returnInvoiceLoading || (!returnInvoiceQuery.trim() && !returnCustomerMobile.trim())}
                          className="bg-[#327F74] hover:bg-[#286660] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded flex items-center gap-1">
                          <Search className="h-3.5 w-3.5" />{returnInvoiceLoading ? 'Searching…' : 'Search Invoice'}
                        </button>
                        <button onClick={() => { setReturnInvoiceQuery(''); setReturnCustomerMobile(''); setReturnDateFrom(''); setReturnInvoiceFound(null); setReturnInvoiceError(''); }}
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
                          ['Customer', returnInvoiceFound.customerName || returnInvoiceFound.customerCode || 'Walk-in'],
                          ['Terminal', returnInvoiceFound.posCounterName || returnInvoiceFound.posTerminalId || '—'],
                          ['Payment Mode', returnInvoiceFound.paymentMode || '—'],
                          ['Invoice Total', <CurrencyAmount amount={parseFloat(returnInvoiceFound.invoiceTotal || 0)} />],
                          ['Status', returnInvoiceFound.status],
                        ].map(([k, v]) => (
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
                                  {['Code', 'Item', 'Sold', 'Returned', 'Returnable', 'Return Qty', 'Rate', 'VAT', 'Return Amt', 'Condition', 'Reason'].map(h => (
                                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {returnableItems.map(it => {
                                  const returnable = parseFloat(it.returnable || 0);
                                  const selQty = returnSelectedItems[it.itemCode] || 0;
                                  const lineGross = selQty * parseFloat(it.unitPrice || 0);
                                  const lineDisc = lineGross * (parseFloat(it.discountPercent || 0) / 100);
                                  const lineAmt = (lineGross - lineDisc) * (1 + parseFloat(it.taxRate || 5) / 100);
                                  return (
                                    <tr key={it.itemCode} className={`border-b border-gray-50 ${returnable === 0 ? 'bg-gray-50 opacity-60' : ''}`}>
                                      <td className="px-2 py-2 text-gray-500">{it.itemCode}</td>
                                      <td className="px-2 py-2 text-[#1E293B]">{it.itemName}</td>
                                      <td className="px-2 py-2 text-center">{it.soldQty}</td>
                                      <td className="px-2 py-2 text-center text-amber-600">{it.alreadyReturned}</td>
                                      <td className="px-2 py-2 text-center text-green-700">{returnable}</td>
                                      <td className="px-2 py-2">
                                        {returnable > 0 ? (
                                          <input type="number" min={0} max={returnable} value={selQty}
                                            onChange={e => setReturnSelectedItems(prev => ({ ...prev, [it.itemCode]: Math.min(returnable, Math.max(0, parseInt(e.target.value) || 0)) }))}
                                            className="w-14 border border-[#327F74]/30 rounded px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                                        ) : <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">N/A</span>}
                                      </td>
                                      <td className="px-2 py-2 text-right"><CurrencyAmount amount={parseFloat(it.unitPrice || 0)} /></td>
                                      <td className="px-2 py-2 text-right">{it.taxRate || 5}%</td>
                                      <td className="px-2 py-2 text-right font-semibold text-[#327F74]"><CurrencyAmount amount={lineAmt} /></td>
                                      <td className="px-2 py-2">
                                        {returnable > 0 ? (
                                          <select value={returnItemConditions[it.itemCode] || 'Good'} onChange={e => setReturnItemConditions(prev => ({ ...prev, [it.itemCode]: e.target.value }))}
                                            className="border border-[#327F74]/30 rounded px-1 py-0.5 text-[10px] focus:outline-none w-20">
                                            <option>Good</option><option>Damaged</option>
                                          </select>
                                        ) : <span className="text-[10px] text-gray-400">—</span>}
                                      </td>
                                      <td className="px-2 py-2">
                                        {returnable > 0 ? (
                                          <select value={returnReasons[it.itemCode] || ''} onChange={e => setReturnReasons(prev => ({ ...prev, [it.itemCode]: e.target.value }))}
                                            className="border border-[#327F74]/30 rounded px-1 py-0.5 text-[10px] focus:outline-none w-28">
                                            <option value="">Select…</option>
                                            {['Damaged Goods', 'Wrong item', 'Changed mind', 'Expired item', 'Price issue', 'Defective', 'Other'].map(o => <option key={o}>{o}</option>)}
                                          </select>
                                        ) : <span className="text-[10px] text-gray-400">—</span>}
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
                      {[['Subtotal', returnSubtotal], ['VAT Reversal', returnVAT], ['Net Refund Amount', returnNet]].map(([k, v]) => (
                        <div key={k} className={`flex justify-between py-1 ${k === 'Net Refund Amount' ? 'font-bold border-t border-gray-200 pt-2' : ''}`}>
                          <span className="text-gray-500 text-sm">{k}</span><span className="text-sm"><CurrencyAmount amount={v} /></span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm">
                      <p className="text-sm font-semibold text-[#1E293B] mb-3">Select Refund Method</p>
                      <div className="space-y-2">
                        {['Cash Back', 'Card Refund', 'Credit Voucher', 'Customer Credit Balance', 'Exchange Adjustment'].map(method => (
                          <label key={method} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[#F7F7FA]">
                            <input type="radio" name="refund" value={method} checked={returnRefundMethod === method} onChange={() => setReturnRefundMethod(method)} className="accent-[#327F74]" />
                            <span className="text-sm text-[#1E293B]">{method}</span>
                          </label>
                        ))}
                      </div>
                      {returnRefundMethod === 'Credit Voucher' && (
                        <div className="mt-3 p-3 bg-[#F7F7FA] border border-[#327F74]/20 rounded space-y-2 text-xs">
                          <div className="flex justify-between"><span className="text-gray-500">Voucher Amount</span><span className="font-semibold"><CurrencyAmount amount={returnNet} /></span></div>
                          <div><label className="text-gray-500 block mb-0.5">Voucher Expiry</label>
                            <input type="date" value={returnVoucherExpiry} onChange={e => setReturnVoucherExpiry(e.target.value)} className="border border-[#327F74]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                          </div>
                        </div>
                      )}
                      {returnRefundMethod === 'Cash Back' && (
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
                        ['Original Invoice', returnInvoiceFound?.invoiceNumber || '—'],
                        ['Customer', returnInvoiceFound?.customerName || returnInvoiceFound?.customerCode || 'Walk-in'],
                        ['Items Selected', `${activeItems.length} line(s)`],
                        ['Refund Method', returnRefundMethod],
                        ['Subtotal', <CurrencyAmount amount={returnSubtotal} />],
                        ['VAT Reversal', <CurrencyAmount amount={returnVAT} />],
                        ['Net Refund Amount', <CurrencyAmount amount={returnNet} />],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0">
                          <span className="text-gray-400 w-40 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2 text-xs text-amber-700">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>Every return is recorded in the audit log. Stock will be updated based on return condition. VAT will be reversed correctly.</div>
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm overflow-hidden flex flex-col">
                      <div className="px-4 py-2 bg-[#F7F7FA] border-b border-[#327F74]/10 text-xs font-semibold text-[#1E293B] flex-shrink-0">Return Receipt Preview</div>
                      <div className="bg-[#f0f0f3] flex-1 min-h-[300px] flex items-center justify-center p-4">
                        <iframe
                          title="return-preview"
                          srcDoc={buildThermalReceiptHtml(tplReturnPaper, {
                            invoiceNumber: returnInvoiceFound?.invoiceNumber || 'PREVIEW',
                            invoiceDate: new Date().toISOString(),
                            customerName: returnInvoiceFound?.customerName || 'Walk-in Customer',
                            paymentMode: returnRefundMethod,
                            subTotal: returnSubtotal,
                            discountTotal: returnDiscount,
                            taxTotal: returnVAT,
                            invoiceTotal: returnNet,
                            items: activeItems.map(it => {
                              const returnQty = returnSelectedItems[it.itemCode] || 0;
                              return {
                                itemName: it.itemName,
                                quantity: returnQty,
                                unitPrice: it.unitPrice,
                                netAmount: returnQty * (parseFloat(it.unitPrice) || 0) * (1 + (parseFloat(it.taxRate) || 0) / 100),
                              };
                            }).filter(i => i.quantity > 0)
                          }, {
                            companyName: tplOutletName, trn: tplOutletTrn, header: tplReturnHeader, footer: tplReturnFooter,
                            showTrn: tplReturnShowTrn, documentTitle: 'CREDIT NOTE', isReturn: true,
                            logoDataUrl: tplLogoDataUrl, showLogo: tplReturnShowLogo,
                            stampDataUrl: tplReturnShowQRCode ? tplStampDataUrl : null,
                            showCompanyDetails: tplReturnShowCompanyDetails, outletAddress: tplOutletAddress, outletPhone: tplOutletPhone,
                            showServiceCharge: tplReturnShowGrandTotalBanner, showVatSummary: tplReturnColVatAmt, showPaymentDetails: tplReturnColDiscount,
                            showQRCode: tplReturnShowQRCode, showCustomerDetails: tplReturnShowCustomerDetails, showLoyaltyPoints: tplReturnShowNotes,
                            showFooterText: tplReturnShowTerms, currency: activeCurrency, qrPlacement: tplInvoiceQrPlacement,
                            cashierName: cashierDisplayName,
                            terminalId: currentTerminal?.terminalId,
                            counterName: currentTerminal?.counterName,
                            customerPhone: returnInvoiceFound?.customerPhone,
                            customerEmail: returnInvoiceFound?.customerEmail,
                            // Suppress the credit-account block in the return PREVIEW: the
                            // real post-return balance isn't known until the credit note is
                            // approved (see the print path, which queries it then). Showing
                            // Previous=0 / Updated=returnNet here printed the return amount
                            // as a positive balance owed — the opposite of a credit note.
                            showCreditBalance: false,
                          })}
                          style={{
                            width: tplReturnPaper === '58mm' ? '240px' : '320px',
                            height: '400px',
                            border: 'none',
                            background: '#fff',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex items-center justify-between shrink-0">
                <div className="flex gap-2">
                  {returnStep > 1 && !returnSaving && <button onClick={() => setReturnStep(s => s - 1)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">← Back</button>}
                  <button onClick={() => setShowReturn(false)} disabled={returnSaving} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                </div>
                <div className="flex gap-2">
                  {returnStep === 1 && (
                    <button onClick={doAdvanceToItems} disabled={!returnInvoiceFound || returnInvoiceFound === false || returnInvoiceLoading}
                      className="bg-[#327F74] hover:bg-[#286660] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded">Next →</button>
                  )}
                  {returnStep === 2 && (
                    <button onClick={() => setReturnStep(3)} disabled={!anyItemSelected}
                      className={`text-sm px-5 py-2 rounded ${!anyItemSelected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#327F74] hover:bg-[#286660] text-white'}`}>Next →</button>
                  )}
                  {returnStep === 3 && (
                    <button onClick={() => setReturnStep(4)} className="bg-[#327F74] hover:bg-[#286660] text-white text-sm px-5 py-2 rounded">Next →</button>
                  )}
                  {returnStep === 4 && (<>
                    <button onClick={() => doSaveReturn(false, false)} disabled={returnSaving || !anyItemSelected}
                      className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 disabled:opacity-50">
                      {returnSaving ? 'Saving…' : 'Save Draft'}
                    </button>
                    <button onClick={() => doSaveReturn(true, false)} disabled={returnSaving || !anyItemSelected}
                      className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" />{returnSaving ? 'Processing…' : 'Confirm Return'}
                    </button>
                    <button onClick={() => doSaveReturn(true, true)} disabled={returnSaving || !anyItemSelected}
                      className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1 disabled:opacity-50">
                      <Printer className="h-3.5 w-3.5" />{returnSaving ? 'Processing…' : 'Confirm & Print'}
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
        <DialogContent className="max-w-sm bg-white">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                {[{ id: 'standard', label: 'Standard', price: '15' }, { id: 'express', label: 'Express', price: '35' }, { id: 'same-day', label: 'Same Day', price: '60' }].map(m => (
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
            <Button className="bg-teal-500 hover:bg-teal-600 text-white" onClick={() => {
              const cost = parseFloat(shippingCost) || 0;
              // Shipping is a separate (untaxed) totals line, not a cart product — the
              // cart keeps only real products. Stored as state and added at the total.
              setShippingCharge(cost);
              if (cost > 0) showFeedback('success', `Shipping ${shippingMethod} added — AED ${cost}`);
              else showFeedback('success', 'Shipping charge cleared');
              setShowAddShippingDialog(false);
            }}>
              <CheckCircle className="h-4 w-4 mr-2" />Add Shipping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={showAddCustomerDialog} onOpenChange={v => { if (!v) { setShowAddCustomerDialog(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerEmail(''); setAddCustomerError(''); } }}>
        <DialogContent className="max-w-sm border-0 shadow-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-sky-500" /> Add New Customer</DialogTitle>
            <DialogDescription>Register a new customer and assign them to this sale.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {addCustomerError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{addCustomerError}</p>}
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
            <Button variant="outline" onClick={() => { setShowAddCustomerDialog(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerEmail(''); setAddCustomerError(''); }} className="border-gray-200">Cancel</Button>
            <Button className="bg-sky-500 hover:bg-sky-600 text-white font-semibold" disabled={!newCustomerName.trim() || addCustomerBusy} onClick={async () => {
              setAddCustomerBusy(true); setAddCustomerError('');
              try {
                const saved = await createCustomer({ name: newCustomerName.trim(), mobile: newCustomerPhone.trim() || null, email: newCustomerEmail.trim() || null });
                // Reload customer list and auto-select the new customer
                const allC = await getAllCustomers();
                const rawList = Array.isArray(allC) ? allC : (allC?.content || []);
                setPosCustomers(rawList.map(mapPosCustomer).filter(c => c.id && c.id !== WALK_IN_CUSTOMER.id));
                const newId = saved?.id?.toString();
                if (newId) setSelectedCustomer(newId);
                setShowAddCustomerDialog(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerEmail('');
                showFeedback('success', `Customer ${saved.name} added`);
              } catch (e) {
                setAddCustomerError(e?.response?.data?.message || e?.message || 'Failed to save customer');
              } finally {
                setAddCustomerBusy(false);
              }
            }}>
              <UserPlus className="h-4 w-4 mr-2" />{addCustomerBusy ? 'Saving…' : 'Save Customer'}
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
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowSerialBatch(false)} />
            <div className="relative ml-auto w-full max-w-3xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              {/* Header */}
              <div className="bg-white border-b border-[#327F74]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    {isConvert && <button onClick={() => setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
                    {isService && <button onClick={() => setSerialBatchSubView('check')} className="text-gray-400 hover:text-[#327F74]"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
                    <Hash className="h-4 w-4 text-teal-600" />
                    <span className="text-base font-semibold text-[#1E293B]">{isConvert ? 'Convert to Return' : isService ? 'Create Service Job' : 'Serial / Batch Check'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{isConvert ? 'Process return for this serial/batch item.' : isService ? 'Create a service repair job for this item.' : 'Search sold batch or serial items, view invoice details, and convert eligible items to return.'}</p>
                </div>
                <button onClick={() => setShowSerialBatch(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              {/* ── CHECK VIEW ── */}
              {!isConvert && !isService && (
                <>
                  {/* Search */}
                  <div className="bg-white border-b border-gray-100 px-5 py-3 space-y-2 shrink-0">
                    <AsyncSearchableDropdown
                      value={null}
                      inputValue={serialBatchQuery}
                      onInputChange={setSerialBatchQuery}
                      placeholder="Scan or search batch number..."
                      fetchOptions={async (query) => {
                        if (!query) return [];
                        try {
                          const res = await posBatchCheck({ batchNumber: query, invoiceNumber: serialBatchInvoiceNo, itemCode: serialBatchItemCode, customerMobile: serialBatchCustomerMobile });
                          if (res && res.results) {
                            return res.results;
                          }
                        } catch { return []; }
                        return [];
                      }}
                      renderOption={(opt, active) => (
                        <div className="flex justify-between items-center p-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="font-bold text-sm text-[#1E293B]">{opt.batchNumber}</p>
                            <p className="text-xs text-gray-500">{opt.itemName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-xs text-gray-700">Inv: {opt.invoiceNumber}</p>
                            <p className="text-[10px] text-gray-400">Qty: {opt.soldQty}</p>
                          </div>
                        </div>
                      )}
                      onSelect={(opt) => {
                        if (opt) {
                          setSerialBatchQuery(opt.batchNumber || '');
                          if (opt.invoiceNumber) setSerialBatchInvoiceNo(opt.invoiceNumber);
                          if (opt.itemCode) setSerialBatchItemCode(opt.itemCode);
                          setTimeout(() => doBatchSearch(), 50);
                        }
                      }}
                      className="w-full text-sm"
                      debounceMs={400}
                    />
                    <div className="flex flex-wrap gap-2">
                      <div className="flex-1 min-w-[140px]">
                        <AsyncSearchableDropdown
                          value={null}
                          inputValue={serialBatchItemCode}
                          onInputChange={setSerialBatchItemCode}
                          placeholder="Item code / barcode"
                          fetchOptions={async (query) => {
                            if (!query) return [];
                            try {
                              const res = await getProductsList(0, 5, query, undefined, null, null, null, true);
                              return res?.content || [];
                            } catch { return []; }
                          }}
                          renderOption={(opt) => (
                            <div className="flex flex-col py-1">
                              <span className="font-medium text-xs">{opt.itemName}</span>
                              <span className="text-[10px] text-gray-500">{opt.itemCode} {opt.barcode ? `| ${opt.barcode}` : ''}</span>
                            </div>
                          )}
                          onSelect={(opt) => {
                            if (opt) {
                              setSerialBatchItemCode(opt.itemCode || opt.barcode || '');
                              setTimeout(() => doBatchSearch(), 50);
                            }
                          }}
                          className="w-full text-xs"
                        />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <AsyncSearchableDropdown
                          value={null}
                          inputValue={serialBatchInvoiceNo}
                          onInputChange={setSerialBatchInvoiceNo}
                          placeholder="Invoice number"
                          fetchOptions={async (query) => {
                            if (!query) return [];
                            try {
                              const res = await getSalesInvoicesPage({ search: query, size: 5 });
                              return res?.content || [];
                            } catch { return []; }
                          }}
                          renderOption={(opt) => (
                            <div className="flex justify-between py-1">
                              <span className="font-medium text-xs">{opt.invoiceNumber}</span>
                              <span className="text-[10px] text-gray-500">{opt.customerName || 'Walk-in'}</span>
                            </div>
                          )}
                          onSelect={(opt) => {
                            if (opt) {
                              setSerialBatchInvoiceNo(opt.invoiceNumber || '');
                              setTimeout(() => doBatchSearch(), 50);
                            }
                          }}
                          className="w-full text-xs"
                        />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <AsyncSearchableDropdown
                          value={null}
                          inputValue={serialBatchCustomerMobile}
                          onInputChange={setSerialBatchCustomerMobile}
                          placeholder="Customer mobile"
                          fetchOptions={async (query) => {
                            if (!query) return [];
                            try {
                              const res = await searchCustomersAllFields(query);
                              return res || [];
                            } catch { return []; }
                          }}
                          renderOption={(opt) => (
                            <div className="flex flex-col py-1">
                              <span className="font-medium text-xs">{opt.name}</span>
                              <span className="text-[10px] text-gray-500">{opt.mobile || opt.email || ''}</span>
                            </div>
                          )}
                          onSelect={(opt) => {
                            if (opt) {
                              setSerialBatchCustomerMobile(opt.mobile || opt.name || '');
                              setTimeout(() => doBatchSearch(), 50);
                            }
                          }}
                          className="w-full text-xs"
                        />
                      </div>
                      <button onClick={doBatchSearch} className="bg-[#327F74] hover:bg-[#286660] text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 shrink-0"><Search className="h-3 w-3" />Search</button>
                      <button onClick={resetBatchSearch} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1 shrink-0"><RotateCcw className="h-3 w-3" />Reset</button>
                    </div>
                  </div>
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Results list */}
                    <div className={`flex flex-col overflow-hidden ${selectedItem ? 'w-1/2 lg:w-[45%] border-r border-[#327F74]/10' : 'w-full'}`}>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-xs">
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
                              {[['Item Code', selectedItem.itemCode || '—'], ['Batch No.', selectedItem.batchNumber || '—'], ['Expiry', fmtDate(selectedItem.expiryDate)], ['Sold Qty', selectedItem.soldQty]].map(([k, v]) => (
                                <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white border border-[#327F74]/20 rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-semibold text-[#1E293B] mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-[#327F74]" />Invoice Details</p>
                            <div className="space-y-0.5 text-xs">
                              {[['Invoice No.', selectedItem.invoiceNumber], ['Date', fmtDateTime(selectedItem.invoiceCreatedAt || selectedItem.invoiceDate)], ['Customer', selectedItem.customerName || '—'], ['Cashier', selectedItem.cashierName || '—'], ['Branch', selectedItem.branchName || '—'], ['Payment', selectedItem.paymentMode || '—'], ['Item Net', <CurrencyAmount amount={selectedItem.itemNetAmount || 0} />], ['VAT', <CurrencyAmount amount={selectedItem.itemTaxAmount || 0} />]].map(([k, v]) => (
                                <div key={k} className="flex gap-1"><span className="text-gray-400 w-20 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-[#327F74]/10 p-3 flex flex-wrap gap-2 shrink-0">
                          <button onClick={() => setSerialBatchSubView('convert')} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-xs px-3 py-1.5 rounded flex items-center gap-1"><RotateCcw className="h-3 w-3" />Convert to Return</button>
                          <button onClick={() => setSerialBatchSubView('service')} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Wrench className="h-3 w-3" />Create Service Job</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!selectedItem && (
                    <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                      <button onClick={() => setShowSerialBatch(false)} className="border border-gray-300 text-gray-500 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
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
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-36 shrink-0">{k}:</span><span className="text-[#1E293B] font-medium">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Return Details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Quantity (max: {selectedItem?.soldQty ?? 1})</label>
                          <input type="number" min={1} max={selectedItem?.soldQty ?? 1} value={serialBatchReturnQty} onChange={e => setSerialBatchReturnQty(Math.min(selectedItem?.soldQty ?? 1, Math.max(1, parseInt(e.target.value) || 1)))} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Reason</label>
                          <select value={serialBatchReturnReason} onChange={e => setSerialBatchReturnReason(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option value="">Select reason…</option>
                            {['Damaged', 'Wrong item', 'Customer changed mind', 'Warranty claim', 'Defective item', 'Expired item', 'Other'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Return Condition</label>
                          <select value={serialBatchReturnCondition} onChange={e => setSerialBatchReturnCondition(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option value="">Select condition…</option>
                            {['Resalable', 'Damaged', 'Defective', 'Warranty claim', 'Scrap', 'Needs service inspection'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Refund Method</label>
                          <select value={serialBatchRefundMethod} onChange={e => setSerialBatchRefundMethod(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            {['Cash Back', 'Card Refund', 'Credit Voucher', 'Customer Credit Balance', 'Exchange Adjustment'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>
                      {serialBatchReturnCondition === 'Needs service inspection' && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          Item condition requires service inspection. Consider creating a Service Job instead of direct refund.
                          <button onClick={() => setSerialBatchSubView('service')} className="ml-auto text-[#327F74] underline whitespace-nowrap">Create Service Job</button>
                        </div>
                      )}
                    </div>
                    <div className="bg-[#FFF8DC] border border-[#F5C742]/40 rounded-lg p-3 flex items-center justify-between text-sm">
                      <span className="text-gray-600">Refund Amount (incl. VAT reversal):</span>
                      <span className="font-bold text-[#1E293B]"><CurrencyAmount amount={((selectedItem?.itemNetAmount || 0) / (selectedItem?.soldQty || 1)) * serialBatchReturnQty} /></span>
                    </div>
                  </div>
                  <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex justify-end gap-2 shrink-0">
                    <button onClick={() => setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
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
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-1 border-b border-gray-50 last:border-0"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white border border-[#327F74]/20 rounded-lg p-4 shadow-sm space-y-3">
                      <p className="text-sm font-semibold text-[#1E293B]">Problem Details</p>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Customer Reported Problem</label>
                        <textarea placeholder="Describe the issue reported by customer..." className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Problem Category</label>
                          <select className="w-full border border-[#327F74]/30 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]">
                            <option>Select…</option>
                            {['Display issue', 'Battery issue', 'Charging issue', 'Software issue', 'Speaker/mic issue', 'Network issue', 'Camera issue', 'Physical damage', 'Water damage', 'Other'].map(o => <option key={o}>{o}</option>)}
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
                            {['Mohammed Al-Rashid', 'Rajan Kumar', 'Ali Hassan'].map(t => <option key={t}>{t}</option>)}
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
                    <button onClick={() => setSerialBatchSubView('check')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                    <button onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Create Service Job</button>
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
            <div className="bg-[#1E293B] border-b border-[#327F74]/30 px-6 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => setShowServiceRepair(false)} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm"><ChevronRight className="h-4 w-4 rotate-180" />POS</button>
                <span className="text-gray-600">/</span>
                <span className="text-white flex items-center gap-2"><Wrench className="h-4 w-4 text-[#F5C742]" />Service &amp; Repair Management</span>
              </div>
              <div className="flex items-center gap-2">
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
                  <table className="w-full text-xs">
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
            )}

            {/* ─ NEW JOB FORM ─ */}
            {serviceView === 'new-job' && (
              <div className="flex-1 overflow-auto">
                {/* Step bar */}
                <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-0 shrink-0">
                  {serviceSteps.map((s, i) => (
                    <React.Fragment key={s}>
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setServiceJobStep(i + 1)}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${serviceJobStep > i + 1 ? 'bg-[#327F74] text-white' : serviceJobStep === i + 1 ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-100 text-gray-400'}`}>{serviceJobStep > i + 1 ? '✓' : i + 1}</div>
                        <span className={`text-xs ${serviceJobStep === i + 1 ? 'font-semibold text-[#1E293B]' : 'text-gray-400'}`}>{s}</span>
                      </div>
                      {i < serviceSteps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
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
                        <table className="w-full text-xs">
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
                <div className="bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center shrink-0 sticky bottom-0">
                  <div className="flex gap-2">
                    {serviceJobStep > 1 && <button onClick={() => setServiceJobStep(s => s - 1)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">← Back</button>}
                    <button onClick={() => setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                  </div>
                  <div className="flex gap-2">
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
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => setServiceView('list')} className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 rotate-180" />Back to List</button>
                  <span className="text-[#1E293B] font-semibold">Service Job</span>
                  <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5">—</span>
                  <div className="ml-auto flex gap-2">
                    <button className="border border-[#327F74]/40 text-[#327F74] text-sm px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print Job Card</button>
                    <button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-3 py-1.5 rounded flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Create Invoice</button>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-0 border-b border-[#327F74]/20 mb-4">
                  {detailTabs.map(t => (
                    <button key={t} onClick={() => setServiceDetailTab(t)}
                      className={`px-4 py-2 text-xs capitalize border-b-2 transition-colors ${serviceDetailTab === t ? 'border-[#F5C742] text-[#1E293B] font-semibold' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
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
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${posTemplate === id
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

              {/* Tax Mode */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Tax Mode</h3>
                <p className="text-[10px] text-gray-500 mb-3">Decide whether product prices already include VAT or VAT is added at checkout.</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    [false, 'Exclusive', 'VAT added on top'],
                    [true, 'Inclusive', 'VAT extracted from price'],
                  ].map(([val, label, desc]) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => patchTaxSettings({ taxInclusive: val })}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${!!posSettings?.taxInclusive === val
                          ? 'border-[#F5C742] bg-[#FEF9E7]'
                          : 'border-gray-100 bg-white hover:border-gray-300'
                        }`}
                    >
                      <p className={`text-xs font-semibold ${!!posSettings?.taxInclusive === val ? 'text-[#1E293B]' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                      {!!posSettings?.taxInclusive === val && <CheckCircle className="h-3.5 w-3.5 text-[#F5C742] mt-1.5" />}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Default VAT Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={toNumber(posSettings?.defaultTaxRate, 5)}
                    onBlur={(e) => {
                      const rate = e.target.value === '' ? 0 : Number(e.target.value);
                      if (rate !== toNumber(posSettings?.defaultTaxRate, 5)) patchTaxSettings({ defaultTaxRate: rate });
                    }}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742]"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Used when a product has no VAT rate of its own.</p>
                </div>
              </div>

              {/* Button Visibility — only shown when in Cart Focus template */}
              {posTemplate === 'focus' && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Right Panel Buttons</h3>
                  <p className="text-[10px] text-gray-400 mb-3">Toggle which action buttons appear in the Cart Focus right panel.</p>
                  <div className="space-y-1.5">
                    {[
                      { id: 'hold', label: 'Hold Bill' },
                      { id: 'add-qty', label: 'Add Qty' },
                      { id: 'remove', label: 'Remove Item' },
                      { id: 'discount', label: 'Discount' },
                      { id: 'layaways', label: 'Layaways' },
                      { id: 'save-layaway', label: 'Save Layaway' },
                      { id: 'save-order', label: 'Save ' },
                      { id: 'add-shipping', label: 'Add Shipping' },
                      { id: 'coupons', label: 'Coupons' },
                      { id: 'promotions', label: 'Promotions' },
                      { id: 'return', label: 'Return' },
                      { id: 'price-chk', label: 'Price Check' },
                      { id: 'cash-drop', label: 'Cash Drawer' },
                      { id: 'last-receipt', label: 'Last Receipt' },
                      { id: 'credit-balance', label: 'Credit Balance' },
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
              <button type="button" onClick={() => { setShowDeliveryModal(false); setDeliveryCustomerSearch(''); }} className="text-[#1E293B]/60 hover:text-[#1E293B]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Unified Smart Customer Search */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Customer / Recipient <span className="text-red-500">*</span></label>
                {deliveryCustomerId ? (() => {
                  const c = customerOptions.find(x => String(x.id) === String(deliveryCustomerId));
                  if (!c) return null;
                  return (
                    <div className="border border-[#327F74]/30 rounded-xl px-4 py-3 bg-[#f0faf8] flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.phone || c.mobile || ''} {c.email ? `· ${c.email}` : ''}
                          {c.tier ? <span className="ml-2 text-[#327F74] font-medium">· {c.tier}</span> : null}
                        </p>
                      </div>
                      <button type="button" onClick={() => { setDeliveryCustomerId(''); setDeliveryCustomerSearch(''); }}
                        className="text-xs text-[#327F74] hover:underline font-bold px-2 py-1 bg-white rounded-lg border border-[#327F74]/20 shadow-sm">
                        Change
                      </button>
                    </div>
                  );
                })() : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input autoFocus type="text" placeholder="Search by Name, Mobile, Email, TRN..." value={deliveryCustomerSearch}
                        onChange={e => setDeliveryCustomerSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#327F74]" />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl bg-white shadow-inner divide-y divide-gray-100">
                      {customerOptions
                        .filter(c => c.id !== WALK_IN_CUSTOMER.id)
                        .filter(c => {
                          const q = (deliveryCustomerSearch || '').toLowerCase();
                          if (!q) return true;
                          return (c.name || '').toLowerCase().includes(q) ||
                            (c.phone || '').toLowerCase().includes(q) ||
                            (c.mobile || '').toLowerCase().includes(q) ||
                            (c.email || '').toLowerCase().includes(q) ||
                            (c.trn || '').toLowerCase().includes(q);
                        })
                        .slice(0, 5)
                        .map(c => (
                          <button key={c.id} type="button"
                            onClick={() => {
                              setDeliveryCustomerId(String(c.id));
                              setDeliveryValidationErrors(prev => ({ ...prev, customer: '' }));
                              if (c.address || c.billingAddress) setDeliveryAddress(prev => prev?.trim() ? prev : (c.address || c.billingAddress));
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors">
                            <div className="w-8 h-8 rounded-full bg-[#327F74]/10 text-[#327F74] flex items-center justify-center font-bold text-xs">
                              {c.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                              <p className="text-xs text-gray-500 truncate">{c.phone || c.mobile || ''} {c.email ? `· ${c.email}` : ''}</p>
                            </div>
                          </button>
                        ))}
                      <div className="p-2 bg-slate-50">
                        <button type="button" onClick={() => openQuickCustomerModal(deliveryCustomerSearch)}
                          className="w-full py-2.5 px-3 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          Create New Customer: "{deliveryCustomerSearch || 'Enter details'}"
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {deliveryValidationErrors.customer && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.customer}</p>}

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Address <span className="text-red-500">*</span></label>
                <textarea rows={3} value={deliveryAddress} onChange={e => { setDeliveryAddress(e.target.value); setDeliveryValidationErrors(prev => ({ ...prev, address: '' })); }}
                  placeholder="Building, street, area, city..."
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] resize-none ${deliveryValidationErrors.address ? 'border-red-300' : 'border-gray-200'}`} />
                {deliveryValidationErrors.address && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.address}</p>}
              </div>

              {/* Delivery Schedule (Date & Time Slot) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Date <span className="text-red-500">*</span></label>
                  <input type="date" value={deliveryDate} onChange={e => { setDeliveryDate(e.target.value); setDeliveryValidationErrors(prev => ({ ...prev, date: '' })); }}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] bg-white ${deliveryValidationErrors.date ? 'border-red-300' : 'border-gray-200'}`} />
                  {deliveryValidationErrors.date && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.date}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Time Slot <span className="text-red-500">*</span></label>
                  <select value={deliveryTimeSlot} onChange={e => { setDeliveryTimeSlot(e.target.value); setDeliveryValidationErrors(prev => ({ ...prev, timeSlot: '' })); }}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] bg-white ${deliveryValidationErrors.timeSlot ? 'border-red-300' : 'border-gray-200'}`}>
                    <option value="">— Select slot —</option>
                    <option value="Morning (9 AM - 1 PM)">Morning (9 AM - 1 PM)</option>
                    <option value="Afternoon (1 PM - 5 PM)">Afternoon (1 PM - 5 PM)</option>
                    <option value="Evening (5 PM - 9 PM)">Evening (5 PM - 9 PM)</option>
                  </select>
                  {deliveryValidationErrors.timeSlot && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.timeSlot}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Special Delivery Instructions</label>
                <input type="text" value={deliveryInstructions} onChange={e => setDeliveryInstructions(e.target.value)}
                  placeholder="e.g. Call before arriving, leave at door..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Charge (AED)</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#327F74]">
                    <span className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-200 shrink-0">AED</span>
                    <input type="number" min="0" step="0.01" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">Optional — leave blank if free delivery</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Assign Delivery Person <span className="text-red-500">*</span></label>
                  <DeliveryPersonSelect
                    options={deliveryPersons}
                    value={deliveryDriver}
                    loading={deliveryPersonsLoading}
                    error={deliveryValidationErrors.deliveryDriver}
                    onChange={(employeeCode) => {
                      setDeliveryDriver(employeeCode);
                      setDeliveryValidationErrors(prev => ({ ...prev, deliveryDriver: '' }));
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Order Notes / Delivery Remarks</label>
                <textarea rows={2} value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="Special instructions, landmarks, contact note..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] resize-none" />
              </div>
            </div>

            {parseFloat(deliveryCharge) > 0 && (
              <div className="px-5 py-3 bg-[#FFF8E7] border-t border-[#FDE6A9] flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Order: <span className="font-semibold text-gray-800">{formatCurrency(currentInvoice.total)}</span>
                  {' '}+{' '}Delivery: <span className="font-semibold text-gray-800">{formatCurrency(parseFloat(deliveryCharge) || 0)}</span>
                </span>
                <span className="font-bold text-[#1E293B]">= {formatCurrency(currentInvoice.total + (parseFloat(deliveryCharge) || 0))}</span>
              </div>
            )}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setShowDeliveryModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={deliveryOutLoading || currentInvoice.items.length === 0}
                onClick={handleOutForDelivery}
                className="flex-1 py-3 rounded-xl bg-[#327F74] hover:bg-[#2a6b61] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <Truck className="h-4 w-4" />
                {deliveryOutLoading ? 'Saving…' : 'Out for Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELIVERY SETTLEMENT modal ═════════════════════════════════════ */}
      {showDeliverySettleModal && (() => {
        const persons = ['All Persons', ...new Set(deliveryOrders.map(o => o.person).filter(Boolean))];
        const filtered = deliveryOrders.filter(o => {
          const q = deliverySettleSearch.toLowerCase();
          const matchSearch = !q || o.customer.toLowerCase().includes(q) || o.invoice.toLowerCase().includes(q) || o.mobile.includes(q);
          const matchPerson = deliverySettlePersonFilter === 'All Persons' || o.person === deliverySettlePersonFilter;
          return matchSearch && matchPerson;
        });
        const sel = deliverySettleSelected;
        const selTotal = sel ? sel.invoiceAmt + sel.deliveryCharge : 0;
        const selBalance = sel ? Math.max(0, selTotal - sel.paidAmt) : 0;

        const mixCash = parseFloat(deliverySettleMixCash) || 0;
        const mixCard = parseFloat(deliverySettleMixCard) || 0;
        const mixTotal = mixCash + mixCard;
        const mixBalanced = deliverySettlePayMode === 'Mix' ? Math.abs(mixTotal - selBalance) < 0.01 : true;

        const handleFinalize = async () => {
          if (!sel || selBalance <= 0 || deliverySettleLoading || !mixBalanced) return;
          setDeliverySettleLoading(true);
          try {
            const cashAmt = deliverySettlePayMode === 'Cash' ? selBalance : deliverySettlePayMode === 'Mix' ? mixCash : 0;
            const cardAmt = deliverySettlePayMode === 'Card' ? selBalance : deliverySettlePayMode === 'Mix' ? mixCard : 0;
            const displayPaymentMode = deliverySettlePayMode === 'Mix' ? 'Cash + Card' : deliverySettlePayMode;
            const settledInvoice = await settleDeliveryOrder(sel.id, {
              paymentMode: displayPaymentMode,
              amountTendered: selBalance,
              cashAmount: cashAmt,
              cardAmount: cardAmt,
              sessionId: currentSession?.id || null,
              terminalId: currentTerminal?.terminalId || null,
              branchId: currentTerminal?.branchId || null,
            });

            try {
              // recordPayment() stamps the invoice's own paymentMode per settlement leg
              // (last write wins for a split Cash+Card settle), so the receipt shows the
              // mode actually selected here rather than trusting that stamp.
              const custRec = customerOptions.find(c => c.code === settledInvoice?.customerCode);
              const receiptInvoice = { ...settledInvoice, paymentMode: displayPaymentMode };
              if (tplInvoicePaper === 'A4') {
                const template = buildPosA4Template(tplInvoiceFooter, { showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes, showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner, colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt });
                const data = buildPosPrintData(receiptInvoice, tplInvoiceFooter);
                const options = { companyProfile: { companyName: tplOutletName, trn: tplOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: tplInvoiceShowStamp } };
                printHtml(await generatePrintHtmlAsync(template, data, options));
              } else {
                // Delivery Settlement receipt: unlike the Out-for-Delivery slip, this
                // one MUST carry the CREDIT ACCOUNT block. Snapshot the customer's
                // outstanding balance (which now already reflects this settlement, so
                // it is the UPDATED balance) and derive the previous balance by adding
                // back the amount just paid on this settlement.
                let creditUpdatedBalanceSettle = null;
                let creditPreviousBalanceSettle = null;
                if (settledInvoice?.customerCode && custRec?.id !== 'walk-in') {
                  try {
                    const cr = await posCreditBalance(settledInvoice.customerCode);
                    if (cr?.found && cr.outstanding != null) {
                      creditUpdatedBalanceSettle = cr.outstanding;
                      creditPreviousBalanceSettle = cr.outstanding + selBalance;
                    }
                  } catch (_) { /* fall back to no credit figures below */ }
                }
                const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                  full: receiptInvoice,
                  cashGiven: selBalance,
                  customerPhone: custRec?.phone,
                  customerEmail: custRec?.email,
                  // Force the CREDIT ACCOUNT block on for the settlement receipt.
                  showCreditBalanceOverride: creditPreviousBalanceSettle != null,
                  creditPreviousBalance: creditPreviousBalanceSettle,
                  // A settlement is a PAYMENT against a balance that already carries
                  // this invoice (it was added to the ledger at Out-for-Delivery). So
                  // Invoice Credit here is 0 — nothing new is being charged — and the
                  // block reads Previous − Amount Paid = Updated. Passing invoiceTotal
                  // as Invoice Credit would double-count the invoice and make the
                  // printed arithmetic (Previous + Credit − Paid) fail to equal Updated.
                  creditInvoiceCredit: 0,
                  creditAmountPaid: selBalance,
                  creditUpdatedBalance: creditUpdatedBalanceSettle,
                });
                await printThermalReceiptWithConfiguredPrinter({
                  full: receiptInvoice,
                  text,
                  escPosBase64,
                  title: `Delivery Settled ${settledInvoice?.invoiceNumber || sel.invoice || ''}`.trim(),
                });
              }
            } catch (printErr) {
              console.warn('Delivery settlement receipt print failed', printErr);
              alert(`Delivery settled, but the receipt didn't print: ${printErr?.message || 'printer error'}.`);
            }

            setDeliverySettleSelected(null);
            setDeliverySettleMixCash('');
            setDeliverySettleMixCard('');
            await loadDeliveryOrders();
            syncPosData();
          } catch (err) {
            console.error('Delivery settle failed', err);
            alert(err?.response?.data?.message || 'Failed to finalize delivery. Please try again.');
          } finally {
            setDeliverySettleLoading(false);
          }
        };

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
                    <p className="text-sm font-black text-[#1E293B]">
                      {deliveryOrdersLoading ? 'Loading…' : `${deliveryOrders.length} orders out for delivery`}
                    </p>
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
                {deliveryOrdersLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading delivery orders…</div>
                ) : filtered.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-gray-400 text-sm">No pending delivery orders</div>
                ) : (
                  <>
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
                          <button type="button" onClick={() => { setDeliverySettleSelected(isSelected ? null : o); setDeliverySettlePayMode('Cash'); setDeliverySettleMixCash(''); setDeliverySettleMixCard(''); }}
                            className={`w-full grid grid-cols-[1fr_80px_100px_80px_100px] px-4 py-3 border-b border-gray-100 text-left transition-colors ${isSelected ? 'bg-[#FFF8E7] border-[#FDE6A9]' : 'hover:bg-gray-50'}`}>
                            <div>
                              <p className="text-sm font-semibold text-[#1E293B]">{o.customer}</p>
                              <p className="text-[10px] text-gray-400">{o.invoice}</p>
                              {o.mobile && <p className="text-[10px] text-gray-400">{o.mobile}</p>}
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
                                  <p className="text-xs text-gray-500">{o.person}{o.mobile ? ` · ${o.mobile}` : ''}</p>
                                </div>
                                <p className="text-base font-black text-[#1E293B]">Total Due <span className="text-[#327F74]">AED {selBalance.toFixed(2)}</span></p>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                {[
                                  { label: 'Invoice Amt', val: o.invoiceAmt, highlight: false, red: false },
                                  { label: 'Delivery Charge', val: o.deliveryCharge, highlight: false, red: false },
                                  { label: 'Paid Amt', val: o.paidAmt, highlight: true, red: false },
                                  { label: 'Balance Due', val: selBalance, highlight: false, red: selBalance > 0 },
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
                                    <button key={m} type="button" onClick={() => { setDeliverySettlePayMode(m); setDeliverySettleMixCash(''); setDeliverySettleMixCard(''); }}
                                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${deliverySettlePayMode === m ? 'border-[#F5C742] bg-[#F5C742]/20 text-[#1E293B]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                                      {m}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {deliverySettlePayMode === 'Credit' && (
                                <div className="mb-3 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3">
                                  <p className="text-sm font-semibold text-purple-800">Credit Settlement</p>
                                  <p className="text-xs text-purple-600 mt-0.5">Balance of AED {selBalance.toFixed(2)} will be posted to {o.customer}'s credit account.</p>
                                </div>
                              )}

                              {deliverySettlePayMode === 'Mix' && (
                                <div className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                                    <div>
                                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 block mb-1">Cash (AED)</label>
                                      <input type="number" min="0" step="0.01" value={deliverySettleMixCash}
                                        onChange={e => setDeliverySettleMixCash(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#327F74]" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 block mb-1">Card (AED)</label>
                                      <input type="number" min="0" step="0.01" value={deliverySettleMixCard}
                                        onChange={e => setDeliverySettleMixCard(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#327F74]" />
                                    </div>
                                  </div>
                                  <div className={`flex items-center justify-between text-xs font-semibold ${mixBalanced ? 'text-[#327F74]' : 'text-red-500'}`}>
                                    <span>{mixBalanced ? '✓ Amount balanced' : 'Total must equal balance due'}</span>
                                    <span>AED {mixTotal.toFixed(2)} / AED {selBalance.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}

                              <button type="button"
                                disabled={selBalance === 0 || deliverySettleLoading || !mixBalanced}
                                onClick={handleFinalize}
                                className="w-full py-3 rounded-xl bg-[#327F74] hover:bg-[#2a6b61] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                                <CheckCircle className="h-4 w-4" />
                                {deliverySettleLoading ? 'Finalizing…' : `Finalize Order — AED ${selBalance.toFixed(2)}`}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
