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
import { createProduct, validateDuplicateProduct, createProductFromPos, validateDuplicateProductFromPos } from '../../api/productsApi';
import { getUnits } from '../../api/unitsApi';
import { getAllCustomers, createCustomer, validateDuplicateCustomer } from '../../api/customerledgerApi';
import { sendSalesInvoiceEmail, getSalesInvoiceById, getAllSalesInvoices, getNextInvoiceNumber } from '../../api/salesInvoiceApi';
import { saveSalesOrder, getNextSalesOrderNumber, getSalesOrdersPage, getSalesOrderById, updateSalesOrderStatus, deleteSalesOrder } from '../../api/salesorderApi';
import { saveSalesPayment } from '../../api/salesPaymentApi';
import { receiptVoucherApi } from '../../api/receiptVoucherApi';
import { fetchStatementOfAccount } from '../../api/financialsApi';
import { getBankAccounts } from '../../api/ledgerApi';
import {
  getPosSettings, getPosSettingsForBranch, savePosSettings, verifySupervisorAuth, openPosSession,
  getPosSessionById,
  addPosCashMovement, getPosXReport, generatePosXReport, getPosZReport, getPosDayCloseSummary, closePosDay, posCheckout,
  checkPosXReportPrintable, checkPosZReportPrintable,
  getAllPosTerminals, renamePosTerminal, setTerminalStatus, setMainPosTerminal,
  getDenominationLadder,
  createLayaway,
  posCreditBalance, getPosInvoices, lookupPosInvoice,
  getPosCustomerHistory,
  settleDeliveryOrder,
  reprintPosReceipt,
  getPosDayStatus, getPosSessionHistory,
  transferPosSession,
} from '../../api/posApi';
import { getSelectableCategories } from '../../api/posCashMovementCategoryApi';
import { getBranchTaxConfiguration, getBranchTaxConfigurationForBranch } from '../../api/branchTaxApi';
import { saveSalesReturn, updateSalesReturnStatus, getReturnableBatches, getSalesReturnsPage } from '../../api/salesReturnApi';
// Sections 4/26 - POS -> Actions -> Return renders the shared Sales Return workflow,
// the same component Customer & Sales -> Sales Return hosts. No POS-specific copy.
import SalesReturnScreen from './SalesReturn/SalesReturnScreen';
import { ENTRY_POINT } from './SalesReturn/constants';
import { getSalesAnalytics } from '../../api/salesReportsApi';
import { resolvePrintTemplate } from '../../api/printTemplateApi';
import { generateDocumentPrintHtml } from '../../utils/documentTemplateRenderer';
import { computeLineTaxTotals } from '../../utils/vatMath';
import { isTaxInvoiceDocument, getInvoiceDocumentTitle } from '../../utils/documentTaxType';
import { buildXReportViewModel as buildXReportViewModelShared, buildZReportViewModel as buildZReportViewModelShared } from '../../utils/posReportViewModel';
import { CASH_NOTE_KEYS, CASH_COIN_KEYS, DENOM_KEYS, DENOM_LABELS, emptyDenominations, setDenominationLadder } from '../../utils/cashDenominations';
import { calculateDenominationTotal } from '../../utils/posReportViewModel';
import { printHtml, generateReportA4Html, generateReportThermalHtml, generateReportThermalText, downloadPdfViaServer, buildQrContent, generatePrintHtmlAsync } from '../../utils/printGenerator';
import QRCode from 'qrcode';
import { exportToPDF, exportToExcel } from '../../utils/exportUtils';
import { isSessionUsableForSelling, resolveSessionBusinessDate, sessionBusinessDay } from '../../utils/posSessionBusinessDay';
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
  Search,
  Percent,
  FileBarChart,
  FileText,
  Printer,
  RotateCcw,
  Pause,
  Play,
  DollarSign,
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
  ClipboardList,
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
  Coins,
  Monitor,
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
import { WALK_IN_CUSTOMER, STATUS_ENUM_TO_LABEL } from './POS/posConstants';
import { toNumber, mapPosProductAggregateItem, mapPosCustomer, getPriceFloor, mergeSavedPosSettings } from './POS/posUtils';
import {
  buildZatcaTlvBase64, buildThermalReceiptHtml, buildLayawayReceiptHtml, buildLayawayReceiptText,
  buildPosPrintData,
  buildDocumentPreviewHtml, buildThermalPrintHtml, buildServiceJobA4Html,
  USE_NEW_POS_PRINT_TEMPLATE, buildDraftPrintDataFromCart,
} from './POS/posPrintUtils';
import {
  ThermalMock, useA4BlobUrl, A4PreviewFrame, A4LivePreview,
  ServiceJobA4Preview, PaperSizePicker, ImageUploadBox,
} from './POS/POSPrintPreview';
import { usePaymentManager } from './POS/payments/usePaymentManager';
import { buildCheckoutPaymentFields, buildSettlementPaymentFields } from './POS/payments/paymentPayloadAdapter';
import { buildPaymentBlock, buildPaymentBlockFromRecords, paymentBlockRows, matchesPaymentFilter, PAYMENT_FILTERS } from './POS/payments/paymentPresentation';
import { useCheckoutCapabilities } from './POS/payments/useCheckoutCapabilities';
import PaymentAllocationPanel from './POS/payments/PaymentAllocationPanel';
import { PAYMENT_TYPES } from './POS/payments/paymentModel';
import { planVoucherApplication, capVoucherAllocations } from './POS/payments/voucherRedemption';
import { formatUserDisplayName } from '../../utils/displayName';
import { useCompany } from '../../context/CompanyContext';
import { useBranch } from '../../context/BranchContext';
import { usePermissions } from '../../context/PermissionContext';
import CustomerView from './POS/CustomerView';
import POSConsole from './POS/POSConsole';
import POSTouchScreen from './POS/POSTouchScreen';
import { TradePOSTouchScreen } from './POS/TradePOS/TradePOSTouchScreen';
import POSItemEntryContainer from '../../components/pos/ItemEntry/POSItemEntryContainer';
import { getPosPrinters } from '../../api/posPrinterApi';
import { useIdleTimeout } from '../../hooks/useIdleTimeout';
import TerminalStatusBadge from '../../components/pos/TerminalStatusBadge';
import SupervisorTakeoverDialog from '../../components/pos/SupervisorTakeoverDialog';
import BusinessDayStatusBanner from '../../components/pos/BusinessDayStatusBanner';
import { BusinessDayStatusProvider } from '../../components/pos/BusinessDayStatusContext';
import ReceiptShareModal from '../../components/pos/ReceiptShareModal';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter, warmPrintAgent } from '../../utils/localPrintAgent';
import { startPrintTimer } from '../../utils/printTiming';
import { buildEscPosDocumentBase64 } from '../../utils/escPosReceipt';
import { mapToTemplate2Data, mapInvoiceToTxn } from './POS/receiptTemplates/billBullTaxInvoiceData';
import { buildTemplate2Html } from './POS/receiptTemplates/buildTemplate2Html';
// ─── POS feature modules (Phase 3 in-place decomposition) ─────────────────────
import { DELIVERY_SETTLE_METHODS } from './POS/features/delivery/deliveryConstants';
import NewDeliveryOrder from './POS/features/delivery/NewDeliveryOrder';
import LayawaysList from './POS/features/layaway/LayawaysList';
import CreditBalance from './POS/features/customers/CreditBalance';
import PriceCheck from './POS/features/products/PriceCheck';
import ProductSearch from './POS/features/products/ProductSearch';
import ServiceRepair from './POS/features/service/ServiceRepair';
import SerialBatch from './POS/features/products/SerialBatch';
import { buildPosScannerStorageKey } from './POS/device/scanner/scannerStorage';
import { useCashDrawer } from './POS/device/cashDrawer/useCashDrawer';
import { usePosBehaviourSettings } from './POS/features/settings/usePosBehaviourSettings';
import { useHeldSales } from './POS/features/heldSales/useHeldSales';
import { useLayaway } from './POS/features/layaway/useLayaway';
import { useDelivery } from './POS/features/delivery/useDelivery';
import { usePosPrinting } from './POS/device/printing/usePosPrinting';
import { useTemplateSettings } from './POS/features/templateSettings/useTemplateSettings';
import { useCheckout } from './POS/features/checkout/useCheckout';
import { useCart } from './POS/features/cart/useCart';
import { useProductEntry } from './POS/features/products/useProductEntry';
import { useProductCatalog } from './POS/features/products/useProductCatalog';
import { useSupervisorApproval } from './POS/features/approval/useSupervisorApproval';
import { usePosSession } from './POS/features/session/usePosSession';
import { useSessionClosure } from './POS/features/session/useSessionClosure';
import { isClosureWorkflowError } from './POS/features/session/sessionWorkflowErrors';
import SessionInvalidatedOverlay from './POS/features/session/SessionInvalidatedOverlay';
import IdleLockOverlay from './POS/features/session/IdleLockOverlay';
import CloseDayVarianceDialog from './POS/features/session/CloseDayVarianceDialog';
import RangeExclusionConfirmDialog from './POS/features/session/RangeExclusionConfirmDialog';
import LockPosDialog from './POS/features/session/LockPosDialog';
import CashDropDialog from './POS/features/session/CashDropDialog';
import LiveSessionDialog from './POS/features/session/LiveSessionDialog';
import SupervisorPinDialog from './POS/features/session/SupervisorPinDialog';
import CheckoutCompleteSummary from './POS/features/checkout/CheckoutCompleteSummary';
import CheckoutCompleteActions from './POS/features/checkout/CheckoutCompleteActions';
import CheckoutSettlementSummary from './POS/features/checkout/CheckoutSettlementSummary';
import CheckoutPaymentHeader from './POS/features/checkout/CheckoutPaymentHeader';
import CheckoutPaymentFooter from './POS/features/checkout/CheckoutPaymentFooter';
import CheckoutRemarks from './POS/features/checkout/CheckoutRemarks';
import CheckoutPaymentPreview from './POS/features/checkout/CheckoutPaymentPreview';
import PosLockedOverlay from './POS/features/session/PosLockedOverlay';
import SessionOwnerRequiredDialog from './POS/features/session/SessionOwnerRequiredDialog';
import TerminalUnavailableOverlay from './POS/features/session/TerminalUnavailableOverlay';
import PreviousBusinessDayBlockOverlay from './POS/features/session/PreviousBusinessDayBlockOverlay';
import PosFeedbackToasts from './POS/features/notifications/PosFeedbackToasts';
import ConfirmAction from './POS/features/notifications/ConfirmAction';
import { buildThermalReceiptArtifacts as buildThermalReceiptArtifactsImpl } from './POS/device/printing/buildThermalReceiptArtifacts';
import { round2Money, formatMoney2, todayInputDate, parseUTCDate } from './POS/lib/posFormatting';
import { buildZReportExcelSections, buildXReportExcelRows } from './POS/features/reports/reportExcelBuilders';





export default function POSSales() {
  const renderCountRef = React.useRef(0);
  renderCountRef.current++;
  const currentRenderCount = renderCountRef.current;

  React.useEffect(() => {
    window.__LATEST_POS_SETTINGS = posSettings;
  });

  const { company } = useCompany();
  const { branches } = useBranch();
  // Active currency CODE from the company profile (falls back to AED). Report
  // view-models emit this code as the money token; the print engine
  // (renderTextWithCurrencySymbols) rewrites it to the configured symbol/image.
  const activeCurrency = company?.currency || 'AED';
  // Sync the on-screen currency renderers (POSCurrency) with the company profile.
  useEffect(() => { setActiveCurrency(activeCurrency); }, [activeCurrency]);
  // Render the count screens from the server's ladder. On failure the bundled AED list stands
  // in for rendering only -- the backend validates every submitted count regardless, so a stale
  // or failed fetch cannot widen what counts as money.
  useEffect(() => {
    let cancelled = false;
    getDenominationLadder(activeCurrency)
      .then((ladder) => { if (!cancelled) setDenominationLadder(ladder); })
      .catch((err) => console.warn('Denomination ladder unavailable; using bundled AED fallback', err));
    return () => { cancelled = true; };
  }, [activeCurrency]);
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
  const [openSessionDropdownId, setOpenSessionDropdownId] = useState(null);
  // The session the backend has refused for continuation (PREVIOUS_DAY_SESSION_OPEN), kept
  // with the server's own wording so re-raising the block never invents a second message.
  // Survives navigating to the closure screen and back: loading a stale session *for
  // closure* must not make it usable for selling again.
  const [prevDayBlockedSessionId, setPrevDayBlockedSessionId] = useState(null);
  const [prevDayBlockedMsg, setPrevDayBlockedMsg] = useState(null);
  // Declared above usePosSession, which reads the heartbeat interval from it.
  const [posSettings, setPosSettings] = useState(null);

  // ── POS session / terminal lifecycle ───────────────────────────────────────
  // Implementation lives in POS/features/session/usePosSession.js: the single owner of
  // currentSession, currentTerminal and currentBusinessDay, terminal registration, session
  // resume, the sync poll, heartbeat, branch-changed re-resolution and the mount-time init.
  // Called here, above the first reader of currentSession (isSessionActive, just below).
  // The work it hands back to POSSales — the init settings loader, the block modals, the
  // discovery reset and the invalidated-session reset — is declared much further down
  // (the reset writes useCheckout's setters), so it is late-bound through this ref and
  // assigned below useCheckout. Session OPEN/TRANSFER stays here; the closure workflow is
  // useSessionClosure.
  const sessionLifecycleHandlersRef = useRef(null);
  const {
    currentSession, setCurrentSession,
    currentTerminal, setCurrentTerminal,
    currentBusinessDay,
    sessionInvalidated, sessionInvalidReason, acknowledgeSessionInvalidation,
    terminalRegistrationError,
    terminalLockedBy, clearTerminalLock,
    openSessionsBlock, dismissOpenSessionsBlock,
    posInitLoading,
    businessDayRefreshRef,
    resumeTerminalSession,
  } = usePosSession({ posSettings, handlersRef: sessionLifecycleHandlersRef });

  // True when this terminal has a live POS session. Session-bound features
  // (X/Z report, cash drop/out, customer management) are locked until this is
  // true and re-enable automatically — no refresh — when a session is opened.
  const isSessionActive = currentSession?.status === 'active' || currentSession?.status === 'OPEN';
  // An operator explicitly started this session's closure ("Close Session"), so it may no
  // longer be used for selling — only closed, or its closure cancelled by a supervisor.
  // Backed by the server's `awaitingClosure` flag (closingStartedAt), and enforced
  // server-side regardless of what this renders (PosSessionClosureWorkflowGate); hiding the
  // tile is a courtesy, not the control. Note this is NOT tied to the X-Report: generating
  // one is informational and leaves the till fully operational.
  const sessionAwaitingClosure = isSessionActive && !!currentSession?.awaitingClosure;
  // The session belongs to an earlier Business Day, so the backend's
  // BusinessDayContinuationGate will refuse every continuation call on it. It stays loaded
  // (the dashboard and the X-Report / Close Session screen both need it) but it is NOT a
  // usable selling session — "existing session" and "usable active POS session" are
  // different concepts. Enforced server-side regardless of what this renders.
  const sessionBlockedByPreviousDay = !!currentSession
    && !isSessionUsableForSelling(currentSession, {
      currentBusinessDay,
      blockedSessionId: prevDayBlockedSessionId,
    })
    && (currentSession.status === 'OPEN' || currentSession.status === 'SUSPENDED' || currentSession.status === 'active');
  // Selling is only offered for a live session that is NOT mid-closure and NOT stranded on
  // a previous Business Day.
  const canContinueSelling = isSessionActive && !sessionAwaitingClosure && !sessionBlockedByPreviousDay;
  const { hasAnyRole } = usePermissions();
  const [sessionNowMs, setSessionNowMs] = useState(() => Date.now());

  // Behavior-settings editor (Console → Behavior tab). Declared after usePosSession
  // because the save handler re-polls through the businessDayRefreshRef it returns.
  const {
    settingsDraft, setSettingsDraft,
    settingsSaving, setSettingsSaving,
    settingsSavedFlash, setSettingsSavedFlash,
    beginEditSettings, handleSaveSettings,
  } = usePosBehaviourSettings({ posSettings, setPosSettings, businessDayRefreshRef });
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
  // ── Supervisor approval queue ──────────────────────────────────────────────
  // Implementation lives in POS/features/approval/useSupervisorApproval.js: the PIN dialog
  // credential state, the five pending-request slots and the dispatcher that resumes the
  // interrupted action once a supervisor is verified. Called here, at the top of the
  // component, because businessDayClosureFlowActive below already reads showSupervisorPin;
  // the dispatcher's continuations (processPayment, handleCloseDay, the cart editors) are
  // handed to it at submit time instead of as arguments, which is what the original
  // component-scope closures did and what keeps them out of the temporal dead zone.
  //
  // Session closure is NOT owned here: the FORCE_CLOSE_SESSION branch writes through
  // closureAuthGrantRef/forceCloseContextRef, which stay POSSales-owned. forceCloseReason and
  // forceCloseAuditAcknowledged, which it also reads, come from useSessionClosure.
  const {
    showSupervisorPin,
    supervisorPinValue, setSupervisorPinValue,
    supervisorPinEmail, setSupervisorPinEmail,
    supervisorPinError, setSupervisorPinError,
    pendingVoidItemId,
    pendingPriceOverride,
    pendingLayawayAbortAction,
    pendingSupervisorAction,
    requestApproval,
    requireLayawayApproval,
    cancelApproval,
    submitSupervisorApproval,
  } = useSupervisorApproval();
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverEmail, setHandoverEmail] = useState('');
  const [handoverPassword, setHandoverPassword] = useState('');
  const [handoverError, setHandoverError] = useState('');
  // X-Report / Z-Report live data
  const [xReportData, setXReportData] = useState(null);
  const [xReportLoading, setXReportLoading] = useState(false);
  // X-Report history picker: browse/reprint a past CLOSED session's X-Report without
  // disturbing the live currentSession view.
  const [showXReportHistory, setShowXReportHistory] = useState(false);
  const [xHistoryDateFrom, setXHistoryDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [xHistoryDateTo, setXHistoryDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [xHistoryResults, setXHistoryResults] = useState([]);
  const [xHistoryLoading, setXHistoryLoading] = useState(false);
  const [viewingHistoricalXReport, setViewingHistoricalXReport] = useState(false);
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
  // Session-driven Day Close resolution: the next business date actually needing a
  // Day Close (or null if there's nothing pending) — see PosPendingDayCloseResolver.
  const [pendingDayCloseDate, setPendingDayCloseDate] = useState(null);
  // Day Close session-range resolution: the backend auto-resolves first/last session
  // by default (rangeOverride stays null); a supervisor may narrow the range via the
  // collapsed Advanced section, which re-triggers loadDaySummary with the override.
  const [daySummary, setDaySummary] = useState(null);
  const [daySummaryLoading, setDaySummaryLoading] = useState(false);
  const [rangeOverride, setRangeOverride] = useState({ startSessionId: '', endSessionId: '' });
  const [showAdvancedRange, setShowAdvancedRange] = useState(false);
  const [advancedRangeUnlocked, setAdvancedRangeUnlocked] = useState(false);
  // Populated when close-day is rejected with SESSION_RANGE_EXCLUSION_UNCONFIRMED —
  // holds the excluded-session list so the supervisor can review before confirming.
  const [rangeExclusionConfirm, setRangeExclusionConfirm] = useState(null);
  const [showStartSessionDialog, setShowStartSessionDialog] = useState(false);
  const [prevDaySessionOpenMsg, setPrevDaySessionOpenMsg] = useState(null);
  const [prevDaySessionOpenId, setPrevDaySessionOpenId] = useState(null);
  // "Complete Session Closure" block — raised whenever the backend refuses an operation
  // with SESSION_CLOSING_WORKFLOW (session mid-closure). Deliberately separate state from
  // the previous-Business-Day block above: two different conditions, two different
  // remedies, never one modal wording both.
  const [closureRequiredMsg, setClosureRequiredMsg] = useState(null);
  const [closureRequiredId, setClosureRequiredId] = useState(null);
  // Session Roaming Phase 11 — discovery response from openSession's Phase 7 structured 409.
  const [discoveryResponse, setDiscoveryResponse] = useState(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [discoverySupervisorPin, setDiscoverySupervisorPin] = useState('');
  // Closure target. Stays here rather than in useSessionClosure: loadXReport, the supervisor
  // dispatcher's FORCE_CLOSE_SESSION branch, the terminal-card menu and
  // businessDayClosureFlowActive all read or write it.
  const [sessionToClose, setSessionToClose] = useState(null);
  // The session the Session Owner Verification modal is currently authorizing.
  // Captured at click time so authorization always targets the terminal card
  // that was chosen, never whichever session state happens to be current.
  const cashierAuthTargetRef = useRef(null);
  // Single-use grant returned by /authorize-closure, keyed by the session it authorizes.
  // Replayed on the close call so the backend accepts a close performed by someone other
  // than the session owner (the owner's verified credentials are the authority, not the
  // logged-in user). Cleared once consumed.
  const closureAuthGrantRef = useRef(null);
  // Held in a ref, never in state or storage: the grant is single-use and short-lived, and a
  // reload must re-derive the situation from the server rather than replay a stale token.
  const varianceGrantRef = useRef(null);
  // Force Close context carried from the Supervisor Approval modal to the close call,
  // so the recorded reason survives the X-Report step in between.
  const forceCloseContextRef = useRef(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCashDropDialog, setShowCashDropDialog] = useState(false);
  const [closeDayVariance, setCloseDayVariance] = useState(null);
  // Live Session quick-view — dashboard tile that pops the current session's
  // sales/cash figures without navigating away (X-Report is the full page version).
  const [showLiveSessionDialog, setShowLiveSessionDialog] = useState(false);

  // Session opening states. Closing-count state lives in useSessionClosure.
  const [openingCash, setOpeningCash] = useState('');
  const [denominations, setDenominations] = useState(emptyDenominations);

  const [xReportVarianceRemarks, setXReportVarianceRemarks] = useState('');
  const [xReportCardBatchNo, setXReportCardBatchNo] = useState('');
  const [xReportCardVerified, setXReportCardVerified] = useState(false);
  const [xReportCashierName, setXReportCashierName] = useState('');
  const [xReportSupervisorName, setXReportSupervisorName] = useState('');
  const [xReportClosingRemarks, setXReportClosingRemarks] = useState('');

  // ── Session closure workflow ───────────────────────────────────────────────
  // Implementation lives in POS/features/session/useSessionClosure.js: Session Owner
  // Verification, the Close Session dialog (count, card settlement, error), variance
  // approval, the Force Close fields and Cancel Closure. Called here, below the X-Report
  // declaration fields the close request carries and above the first render-time reader of
  // closingDenominations (getReportClosingDenominations). Lifecycle stays in usePosSession;
  // sessionToClose, the four closure refs and the previous-day/closure-required blocks stay
  // here. loadXReport, loadDaySummary and syncPosData are declared far below, so they are
  // late-bound through sessionClosureLoadersRef (assigned beside syncPosDataRef).
  const sessionClosureLoadersRef = useRef(null);
  const {
    showCancelClosureDialog, setShowCancelClosureDialog,
    cancelClosureUsername, setCancelClosureUsername,
    cancelClosurePassword, setCancelClosurePassword,
    cancelClosureReason, setCancelClosureReason,
    cancelClosureError,
    cancelClosureLoading,
    openCancelClosureDialog, handleCancelClosureSubmit,
    showCloseSessionDialog, setShowCloseSessionDialog,
    closeSessionError, setCloseSessionError,
    closeSessionTab, setCloseSessionTab,
    closingDenominations, setClosingDenominations,
    cardSettlementAmount, setCardSettlementAmount,
    proceedToCloseSessionDialog, handleCloseSession,
    varianceApproval, setVarianceApproval,
    varianceApprovalBusy,
    varianceApprovalError, setVarianceApprovalError,
    varianceSupervisorUser, setVarianceSupervisorUser,
    varianceSupervisorPassword, setVarianceSupervisorPassword,
    varianceApprovalReason, setVarianceApprovalReason,
    handleAuthorizeVariance,
    setClosureAction,
    forceCloseReason, setForceCloseReason,
    forceCloseAuditAcknowledged, setForceCloseAuditAcknowledged,
    showSessionOwnerRequiredDialog, setShowSessionOwnerRequiredDialog,
    handleDayCloseNormalClose, handleTradingEndedCloseSession,
    showCashierAuthDialog, setShowCashierAuthDialog,
    cashierAuthUsername, setCashierAuthUsername,
    cashierAuthPassword, setCashierAuthPassword,
    cashierAuthError, setCashierAuthError,
    cashierAuthLoading,
    handleCashierAuthSubmit,
  } = useSessionClosure({
    currentSession, setCurrentSession,
    sessionToClose, setSessionToClose,
    closureAuthGrantRef, varianceGrantRef, forceCloseContextRef, cashierAuthTargetRef,
    report: {
      xReportVarianceRemarks, xReportCardBatchNo, xReportCardVerified,
      xReportCashierName, xReportSupervisorName, xReportClosingRemarks,
      pendingXAutoPrintRef, zReportDate,
    },
    setCurrentView, setSessionNowMs, businessDayRefreshRef,
    loadersRef: sessionClosureLoadersRef,
  });

  // Cart Focus Col 3 tab
  const [rightPanelTab, setRightPanelTab] = useState('functions');

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

  const [customerHistory, setCustomerHistory] = useState([]);
  const [customerHistoryLoading, setCustomerHistoryLoading] = useState(false);
  // Customer History pane — invoice preview modal
  const [showCustomerHistoryPreview, setShowCustomerHistoryPreview] = useState(false);
  const [customerHistoryPreviewInvoice, setCustomerHistoryPreviewInvoice] = useState(null);
  const [customerHistoryPreviewLoading, setCustomerHistoryPreviewLoading] = useState(false);
  const [customerHistoryPreviewError, setCustomerHistoryPreviewError] = useState('');

  // Online payment mode — bank account linking for reconciliation/reporting
  const [checkoutOnlineBankAccounts, setCheckoutOnlineBankAccounts] = useState([]);
  const [checkoutOnlineBankAccountsLoading, setCheckoutOnlineBankAccountsLoading] = useState(false);
  // E-bill options (embedded in checkout)

  // Receipt sharing — 'payment' shows the checkout form, 'complete' shows the
  // payment-done screen in the SAME overlay (avoids simultaneous unmount+mount).
  // While a settlement is in flight we FREEZE the A4 preview html so clearInvoice()
  // (which empties the cart) cannot null the live iframe's blob src in the same
  // commit that the phase switch unmounts that iframe — that race is what threw
  // "Failed to execute 'removeChild' on 'Node'" on Settle Payment.
  // True while post-payment side-effects (receipt printing, cash drawer, layaway
  // conversion) run AFTER the payment itself has already been confirmed by the
  // backend and the success screen is showing. Drives the subtle "Printing
  // receipt…" indicator on the complete screen so the cashier isn't blocked on
  // the checkout form waiting for the printer round-trip (perceived-latency fix).
  // ZATCA QR data URL for the checkout A4 preview (used only when QR is enabled
  // and no company stamp occupies that slot — "stamp if uploaded, else QR").
  const [checkoutPreviewQrDataUrl, setCheckoutPreviewQrDataUrl] = useState(null);
  // Customer's outstanding balance for the checkout Thermal preview's Credit Account
  // section — fetched async (useMemo can't await), mirrors the lookup done at print time.
  const [checkoutPreviewCreditBalance, setCheckoutPreviewCreditBalance] = useState(null);
  // Share Receipt: which channel dialog is open ('sms' | 'whatsapp' | 'email' | null)
  // and the transient success/failure toast it raises.
  const [receiptShareChannel, setReceiptShareChannel] = useState(null);
  const [receiptShareFeedback, setReceiptShareFeedback] = useState(null);

  // ── Cart ───────────────────────────────────────────────────────────────────
  // Implementation lives in POS/features/cart/useCart.js. The single authoritative live
  // cart object; destructured under its original names so every consumer (the JSX, both
  // prop bags and all four feature hooks) reads the same state through the same binding.
  const {
    currentInvoice, setCurrentInvoice, currentInvoiceRef,
    recalculateInvoice, resetCartState,
    removeFromInvoice, applyVoid, cartItemsToPayload,
  } = useCart({ posSettings });
  // True when the Quick Customer modal was launched from the Checkout credit
  // panel, so the newly created customer is auto-selected as the credit buyer.
  const quickCustomerCreditCtxRef = useRef(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [selectedCustomer, setSelectedCustomer] = useState(WALK_IN_CUSTOMER.id);
  const [posCustomers, setPosCustomers] = useState([]);
  const [posCustomersLoading, setPosCustomersLoading] = useState(false);
  const [posCustomersError, setPosCustomersError] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');

  // Enhanced payment states
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
  // The feedback toaster. It touches only the state setter above and setTimeout, so it is
  // stable for the life of the screen and every caller - the voucher handlers just below,
  // useProductEntry's frozen callbacks and the JSX - can hold it directly. Each call
  // schedules its own clear; an earlier timer can still clear a later message early.
  const showFeedback = useCallback((type, message) => {
    setBarcodeScanFeedback({ type, message });
    setTimeout(() => setBarcodeScanFeedback(null), 2500);
  }, []);
  const barcodeInputRef = useRef(null);
  const [invoiceCounter, setInvoiceCounter] = useState(0);
  // Real next invoice number previewed from the backend numbering sequence
  // (GET /api/sales-invoices/next-number). POS checkout posts through the same
  // SalesInvoice save path, so this is the number the sale will actually get —
  // used for the checkout header + receipt preview instead of a fabricated
  // client-side counter. Null until fetched; callers fall back gracefully.
  const [previewInvoiceNo, setPreviewInvoiceNo] = useState(null);
  const [posActionMode, setPosActionMode] = useState('none');

  // ── Product catalog / search ────────────────────────────────────────────────
  // Implementation lives in POS/features/products/useProductCatalog.js. Owns the grid's
  // product list/paging/search, categories, favourites, the Search Products modal and the
  // Cart Focus type-ahead suggestions, plus the single productCacheRef that useProductEntry
  // below reads/writes on its own scan-resolve path.
  const {
    posProducts, posProductPage, posProductTotalPages, posProductTotalElements,
    posProductsLoading, posProductsLoadingMore, posProductsError,
    loadPosProducts, loadMorePosProducts,
    searchQuery, setSearchQuery,
    productCategories, horizontalCategories, selectedCategory, setSelectedCategory,
    favouriteProductIds, toggleFavourite,
    productCacheRef,
    barcodeSuggestions, barcodeSuggestionsLoading, setBarcodeSuggestions,
    showProductSearch, setShowProductSearch,
    productSearchQuery, setProductSearchQuery,
    productSearchResults, setProductSearchResults, productSearchLoading,
  } = useProductCatalog({ currentTerminal, currentSession, barcodeInput, posActionMode });

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
  // Credit Balance modal
  const [showCreditBalance, setShowCreditBalance] = useState(false);
  const [creditBalanceQuery, setCreditBalanceQuery] = useState('');
  const [creditBalanceResult, setCreditBalanceResult] = useState(null);
  // Save Layaway
  const [saveLayawayBusy, setSaveLayawayBusy] = useState(false);
  const [saveLayawayError, setSaveLayawayError] = useState(null);
  // Confirmation modal (replaces window.confirm for delete/cancel actions)
  const [confirmAction, setConfirmAction] = useState(null); // { title, message, onConfirm, busy }
  // Save Layaway modal
  const [showSaveLayaway, setShowSaveLayaway] = useState(false);
  const [saveLayawayDepositReq, setSaveLayawayDepositReq] = useState(true);
  const [saveLayawayDueDate, setSaveLayawayDueDate] = useState(todayInputDate);
  const [saveLayawayRemarks, setSaveLayawayRemarks] = useState('');
  const [saveLayawayReserveStock, setSaveLayawayReserveStock] = useState(true);
  const [saveLayawayPrintReceipt, setSaveLayawayPrintReceipt] = useState(true);
  const [saveLayawaySendSms, setSaveLayawaySendSms] = useState(false);
  // Reset the due date to today each time the dialog opens, so a terminal left
  // running past midnight never offers a stale (past) default.
  useEffect(() => {
    if (showSaveLayaway) setSaveLayawayDueDate(todayInputDate());
  }, [showSaveLayaway]);
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
  // Sales Return. Only the open/closed flag lives here now — invoice lookup, line
  // selection, per-line condition/reason, refund method and submission are all owned by
  // the shared SalesReturnScreen, so POS no longer carries a parallel copy of that state.
  const [showReturn, setShowReturn] = useState(false);
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
  // ── Print-template / designer settings ─────────────────────────────────────
  // Implementation lives in POS/features/templateSettings/useTemplateSettings.js.
  // Destructured under the existing names so the POSConsole prop bag, the designer
  // JSX and every print call site stay untouched.
  const {
    tplReceiptHeader, setTplReceiptHeader, tplReceiptHeaderAr, setTplReceiptHeaderAr,
    tplReceiptFooter, setTplReceiptFooter, tplReceiptPaper, setTplReceiptPaper,
    tplReceiptShowLogo, setTplReceiptShowLogo, tplReceiptShowTrn, setTplReceiptShowTrn,
    tplReceiptShowBarcode, setTplReceiptShowBarcode, tplInvoiceHeader, setTplInvoiceHeader,
    tplInvoiceHeaderAr, setTplInvoiceHeaderAr, tplInvoiceFooter, setTplInvoiceFooter,
    tplInvoicePaper, setTplInvoicePaper, tplReturnHeader, setTplReturnHeader,
    tplReturnFooter, setTplReturnFooter, tplReturnPaper, setTplReturnPaper,
    tplJobCardFooter, setTplJobCardFooter, tplJobCardPaper, setTplJobCardPaper,
    tplOutletName, setTplOutletName, tplOutletTrn, setTplOutletTrn,
    tplOutletAddress, setTplOutletAddress, tplOutletPhone, setTplOutletPhone,
    tplLogoDataUrl, setTplLogoDataUrl, tplStampDataUrl, setTplStampDataUrl,
    tplReceiptShowStamp, setTplReceiptShowStamp, tplInvoiceShowLogo, setTplInvoiceShowLogo,
    tplInvoiceShowCompanyDetails, setTplInvoiceShowCompanyDetails, tplInvoiceShowTrn, setTplInvoiceShowTrn,
    tplInvoiceShowCustomerDetails, setTplInvoiceShowCustomerDetails, tplInvoiceShowTerms, setTplInvoiceShowTerms,
    tplInvoiceShowNotes, setTplInvoiceShowNotes, tplInvoiceShowBankDetails, setTplInvoiceShowBankDetails,
    tplInvoiceShowQRCode, setTplInvoiceShowQRCode, tplInvoiceShowStamp, setTplInvoiceShowStamp,
    tplInvoiceQrPlacement, setTplInvoiceQrPlacement, tplInvoiceShowSignature, setTplInvoiceShowSignature,
    tplInvoiceShowGrandTotalBanner, setTplInvoiceShowGrandTotalBanner, tplInvoiceColItemCode, setTplInvoiceColItemCode,
    tplInvoiceColItemImage, setTplInvoiceColItemImage, tplInvoiceColBarcode, setTplInvoiceColBarcode,
    tplInvoiceColBatchNo, setTplInvoiceColBatchNo, tplInvoiceColDiscount, setTplInvoiceColDiscount,
    tplInvoiceColVatPct, setTplInvoiceColVatPct, tplInvoiceColVatAmt, setTplInvoiceColVatAmt,
    tplReceiptShowCompanyDetails, setTplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails, setTplReceiptShowCustomerDetails,
    tplReceiptColItemCode, setTplReceiptColItemCode, tplReceiptColItemImage, setTplReceiptColItemImage,
    tplReceiptColBatchNo, setTplReceiptColBatchNo, tplReceiptColDiscount, setTplReceiptColDiscount,
    tplReceiptColVatPct, setTplReceiptColVatPct, tplReceiptColVatAmt, setTplReceiptColVatAmt,
    tplReceiptShowGrandTotalBanner, setTplReceiptShowGrandTotalBanner, tplReceiptShowTerms, setTplReceiptShowTerms,
    tplReceiptShowNotes, setTplReceiptShowNotes, tplReceiptShowBankDetails, setTplReceiptShowBankDetails,
    tplReceiptShowQRCode, setTplReceiptShowQRCode, tplReceiptShowSignature, setTplReceiptShowSignature,
    tplReturnShowLogo, setTplReturnShowLogo, tplReturnShowTrn, setTplReturnShowTrn,
    tplReturnShowStamp, setTplReturnShowStamp, tplReturnShowCompanyDetails, setTplReturnShowCompanyDetails,
    tplReturnShowCustomerDetails, setTplReturnShowCustomerDetails, tplReturnColItemCode, setTplReturnColItemCode,
    tplReturnColBatchNo, setTplReturnColBatchNo, tplReturnColDiscount, setTplReturnColDiscount,
    tplReturnColVatPct, setTplReturnColVatPct, tplReturnColVatAmt, setTplReturnColVatAmt,
    tplReturnShowGrandTotalBanner, setTplReturnShowGrandTotalBanner, tplReturnShowTerms, setTplReturnShowTerms,
    tplReturnShowNotes, setTplReturnShowNotes, tplReturnShowQRCode, setTplReturnShowQRCode,
    tplReturnShowSignature, setTplReturnShowSignature, tplReturnShowCreditBalance, setTplReturnShowCreditBalance,
    tplJobCardShowLogo, setTplJobCardShowLogo, tplJobCardShowTrn, setTplJobCardShowTrn,
    tplJobCardShowStamp, setTplJobCardShowStamp, tplJobCardShowCompanyDetails, setTplJobCardShowCompanyDetails,
    tplJobCardShowCustomerDetails, setTplJobCardShowCustomerDetails, tplJobCardShowSerialNumber, setTplJobCardShowSerialNumber,
    tplJobCardShowWarranty, setTplJobCardShowWarranty, tplJobCardShowTechnician, setTplJobCardShowTechnician,
    tplJobCardShowExpectedDate, setTplJobCardShowExpectedDate, tplJobCardShowCustomerSignature, setTplJobCardShowCustomerSignature,
    tplJobCardShowTerms, setTplJobCardShowTerms, receiptTemplateId, setReceiptTemplateId,
    t2ShowLogo, setT2ShowLogo, t2ShowCompanyDetails, setT2ShowCompanyDetails,
    t2ShowTrn, setT2ShowTrn, t2ShowArabic, setT2ShowArabic,
    t2ShowCustomerDetails, setT2ShowCustomerDetails, t2ShowAccountBalance, setT2ShowAccountBalance,
    t2ShowDelivery, setT2ShowDelivery, t2ShowVatSummary, setT2ShowVatSummary,
    t2ShowPaymentDetails, setT2ShowPaymentDetails, t2ShowLoyalty, setT2ShowLoyalty,
    t2ShowQRCode, setT2ShowQRCode, t2ShowFooterText, setT2ShowFooterText,
    t2ShowBarcode, setT2ShowBarcode, t2ReceiptShowLogo, setT2ReceiptShowLogo,
    t2ReceiptShowCompanyDetails, setT2ReceiptShowCompanyDetails, t2ReceiptShowTrn, setT2ReceiptShowTrn,
    t2ReceiptShowArabic, setT2ReceiptShowArabic, t2ReceiptShowCustomerDetails, setT2ReceiptShowCustomerDetails,
    t2ReceiptShowAccountBalance, setT2ReceiptShowAccountBalance, t2ReceiptShowDelivery, setT2ReceiptShowDelivery,
    t2ReceiptShowVatSummary, setT2ReceiptShowVatSummary, t2ReceiptShowPaymentDetails, setT2ReceiptShowPaymentDetails,
    t2ReceiptShowLoyalty, setT2ReceiptShowLoyalty, t2ReceiptShowQRCode, setT2ReceiptShowQRCode,
    t2ReceiptShowFooterText, setT2ReceiptShowFooterText, t2ReceiptShowBarcode, setT2ReceiptShowBarcode,
    t2InvoiceShowLogo, setT2InvoiceShowLogo, t2InvoiceShowCompanyDetails, setT2InvoiceShowCompanyDetails,
    t2InvoiceShowTrn, setT2InvoiceShowTrn, t2InvoiceShowArabic, setT2InvoiceShowArabic,
    t2InvoiceShowCustomerDetails, setT2InvoiceShowCustomerDetails, t2InvoiceShowAccountBalance, setT2InvoiceShowAccountBalance,
    t2InvoiceShowDelivery, setT2InvoiceShowDelivery, t2InvoiceShowVatSummary, setT2InvoiceShowVatSummary,
    t2InvoiceShowPaymentDetails, setT2InvoiceShowPaymentDetails, t2InvoiceShowLoyalty, setT2InvoiceShowLoyalty,
    t2InvoiceShowQRCode, setT2InvoiceShowQRCode, t2InvoiceShowFooterText, setT2InvoiceShowFooterText,
    t2InvoiceShowBarcode, setT2InvoiceShowBarcode,
    effectiveOutletTrn,
    receiptArtifactTemplateSettings,
    applyPrintTemplateConfig,
  } = useTemplateSettings({ branches, company });

  // resolvedPosInvoiceTemplate below, which every print call site now goes through.
  const [resolvedPosInvoiceTemplate, setResolvedPosInvoiceTemplate] = useState(null);
  const [resolvedPosCreditNoteTemplate, setResolvedPosCreditNoteTemplate] = useState(null);

  // The tplInvoice* designer flags an A4 print applies. Assembled here because these
  // flags are general POS configuration (each is also read by the designer JSX and the
  // POSConsole prop bag), not print-owned state. Same 18 keys, same order, as the six
  // inline literals this replaced.
  const invoiceTemplateOptions = useMemo(() => ({
    showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails,
    showTrn: tplInvoiceShowTrn, showCustomerDetails: tplInvoiceShowCustomerDetails,
    showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes,
    showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode,
    showStamp: tplInvoiceShowStamp, showSignature: tplInvoiceShowSignature,
    showGrandTotalBanner: tplInvoiceShowGrandTotalBanner,
    colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage,
    colBarcode: tplInvoiceColBarcode, colBatchNo: tplInvoiceColBatchNo,
    colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct,
    colVatAmt: tplInvoiceColVatAmt,
  }), [
    tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn,
    tplInvoiceShowCustomerDetails, tplInvoiceShowTerms, tplInvoiceShowNotes,
    tplInvoiceShowBankDetails, tplInvoiceShowQRCode, tplInvoiceShowStamp,
    tplInvoiceShowSignature, tplInvoiceShowGrandTotalBanner, tplInvoiceColItemCode,
    tplInvoiceColItemImage, tplInvoiceColBarcode, tplInvoiceColBatchNo,
    tplInvoiceColDiscount, tplInvoiceColVatPct, tplInvoiceColVatAmt,
  ]);

  // ── Print orchestration / device boundary ──────────────────────────────────
  // Implementation lives in POS/device/printing/usePosPrinting.js. Document
  // generation (buildThermalReceiptArtifacts and the receipt builders) stays here —
  // see that module's header for why.
  const {
    printFeedback, setPrintFeedback,
    notifyPrintFallback,
    printThermalReceiptWithConfiguredPrinter,
    resolveInvoiceA4Template,
    resolveCreditNoteA4Template,
    resolveInvoiceA4TemplateFor,
  } = usePosPrinting({
    printerConfigs, currentTerminal,
    resolvedPosInvoiceTemplate, resolvedPosCreditNoteTemplate,
    invoiceTemplateOptions, tplInvoiceFooter,
  });

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
  // Cash Movement Categories (Phase 2) — refetched whenever the dialog opens or the
  // in/out direction changes, since categories are direction-compatible, not universal.
  const [cashDropCategoryId, setCashDropCategoryId] = useState('');
  const [cashDropCategories, setCashDropCategories] = useState([]);
  const [cashDropCategoryRequired, setCashDropCategoryRequired] = useState(false);

  useEffect(() => {
    if (!showCashDropDialog) return;
    const movementType = cashDropType === 'in' ? 'DROP_IN' : 'DROP_OUT';
    const activeBranchIdRaw = sessionStorage.getItem('activeBranchId');
    const branchId = activeBranchIdRaw && activeBranchIdRaw !== 'ALL' ? activeBranchIdRaw : undefined;
    setCashDropCategoryId('');
    getSelectableCategories(movementType, branchId)
      .then((data) => {
        setCashDropCategories(data?.categories || []);
        setCashDropCategoryRequired(Boolean(data?.categoryRequired));
      })
      .catch(() => { setCashDropCategories([]); setCashDropCategoryRequired(false); });
  }, [showCashDropDialog, cashDropType]);

  const customerOptions = useMemo(() => [WALK_IN_CUSTOMER, ...posCustomers], [posCustomers]);

  // syncPosData is defined below and depends on the loadHeldSales useHeldSales returns,
  // so both hooks reach it late through this ref.
  const syncPosDataRef = useRef(null);

  // ── Layaways ────────────────────────────────────────────────────────────────
  // Implementation lives in POS/features/layaway/useLayaway.js. Called BEFORE
  // useHeldSales so startLayawayConversion can be passed to it directly rather than
  // through a ref. saveCurrentLayaway stays in POSSales — see the hook's header note.
  // Declared here (rather than immediately before useHeldSales, further down) because
  // activeLayawayDeposit feeds checkoutEffectiveDue/checkoutPaymentFields directly below —
  // referencing it in a useMemo before this hook runs throws "Cannot access before
  // initialization".
  const {
    showLayawaysList, setShowLayawaysList,
    layawaysFilterStatus, setLayawaysFilterStatus,
    layawaysFilterCustomer, setLayawaysFilterCustomer,
    layawaysFilterNo, setLayawaysFilterNo,
    selectedLayawayId, setSelectedLayawayId,
    layawaysList, layawaysLoading, layawaysError,
    selectedLayawayDetail, layawayBusyId,
    activeLayawayId, setActiveLayawayId,
    activeLayawayDeposit, setActiveLayawayDeposit,
    loadLayaways, startLayawayConversion, handleCancelLayaway,
  } = useLayaway({
    currentSession, currentTerminal, posSettings,
    recalculateInvoice, setCurrentInvoice, customerOptions, setSelectedCustomer,
    setConfirmAction, syncPosDataRef,
  });

  // ══ Checkout Payment Manager ═══════════════════════════════════════════════
  // Amount the cashier has to collect: cart total + shipping, less any layaway deposit
  // already taken. Every payment figure on the checkout screen is measured against this.
  const checkoutEffectiveDue = useMemo(() => {
    const shippingChargeNum = Number(shippingCharge) || 0;
    const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
    const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
    return Math.max(0, grandTotal - depositAmt);
  }, [currentInvoice.total, shippingCharge, activeLayawayDeposit]);

  // Sole owner of checkout payment state. POSSales no longer computes the remaining balance,
  // allocated amount, change, payment summary or settlement readiness — it reads them from
  // here, so screen and settlement can never disagree.
  const checkoutPayment = usePaymentManager({
    invoiceTotal: checkoutEffectiveDue,
  });

  // Owned here (not inside useDelivery) because deliverySettleBalance below derives from it
  // and useDelivery takes clearDeliverySettleLines (itself derived from deliverySettleBalance)
  // as an input — so the state can't originate inside the hook without a circular
  // "hook needs a value that needs the hook" dependency. Passed into useDelivery further down.
  const [deliverySettleSelected, setDeliverySettleSelected] = useState(null);

  // Balance still owed on the delivery order the cashier has open, and the Payment Manager
  // that settles it. Same manager, selectors and validation as checkout -- one settlement
  // architecture, not one per screen.
  const deliverySettleBalance = useMemo(() => {
    const sel = deliverySettleSelected;
    if (!sel) return 0;
    return Math.max(0, (sel.invoiceAmt + sel.deliveryCharge) - sel.paidAmt);
  }, [deliverySettleSelected]);

  const deliverySettlePayment = usePaymentManager({ invoiceTotal: deliverySettleBalance });
  const { clearLines: clearDeliverySettleLines } = deliverySettlePayment;

  const deliverySettleFields = useMemo(
    () => buildSettlementPaymentFields(deliverySettlePayment.paymentLines, {
      amountDue: deliverySettleBalance,
    }),
    [deliverySettlePayment.paymentLines, deliverySettleBalance],
  );

  // Layaway deposit. A deposit is a payment like any other, so it is collected through the
  // same manager, modals and validation as a till sale rather than a bespoke amount+mode pair.
  const saveLayawayTotal = useMemo(() => currentInvoice.total || 0, [currentInvoice.total]);
  const saveLayawayPayment = usePaymentManager({ invoiceTotal: saveLayawayTotal });
  const { clearLines: clearSaveLayawayLines } = saveLayawayPayment;

  const saveLayawayFields = useMemo(
    () => buildSettlementPaymentFields(saveLayawayPayment.paymentLines, {
      amountDue: saveLayawayTotal,
    }),
    [saveLayawayPayment.paymentLines, saveLayawayTotal],
  );

  // Confirms the server accepts progressive payment allocations before any sale is settled.
  // Probed when the checkout opens; settlement stays blocked until it answers yes, because a
  // server that ignores the field would post the invoice with no payment recorded. The Save
  // Layaway dialog takes a deposit through the same allocation panel, so it arms the probe
  // too — otherwise its banner would sit on "checking" forever, never having asked.
  const checkoutCompatibility = useCheckoutCapabilities(showPaymentDialog || showSaveLayaway);

  // The payment fields of the checkout payload, plus the post-checkout figures (change,
  // credit carried forward, whether the drawer opens) — all projected from the allocations.
  const checkoutPaymentFields = useMemo(
    () => buildCheckoutPaymentFields(checkoutPayment.paymentLines, {
      effectiveDue: checkoutEffectiveDue,
      layawayDeposit: activeLayawayDeposit,
    }),
    [checkoutPayment.paymentLines, checkoutEffectiveDue, activeLayawayDeposit],
  );


  // ── Credit Voucher redemption from the sales screen ───────────────────────
  //
  // A voucher applied by scanning at the till is NOT a second mechanism: it is a VOUCHER
  // payment allocation on the very same Payment Manager that the checkout panel writes to.
  // That is what keeps one source of truth — the footer, the checkout screen, the payload,
  // the receipt and the backend redemption all read the same allocation. A voucher is never
  // a cart line: it carries no quantity, no stock movement, no VAT and no revenue.
  //
  // Nothing here spends the voucher. Applying it only records the intent; the backend
  // redeems it under a row lock during checkout, which is why the cashier can add it,
  // remove it, or abandon the sale entirely and the balance is untouched.
  const appliedVoucherLines = useMemo(
    () => checkoutPayment.paymentLines.filter((l) => l.paymentType === PAYMENT_TYPES.VOUCHER),
    [checkoutPayment.paymentLines],
  );

  const voucherRedeemedTotal = useMemo(
    () => round2Money(appliedVoucherLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)),
    [appliedVoucherLines],
  );

  /** What the customer still has to settle in cash/card/etc. after the applied vouchers. */
  const amountDueAfterVouchers = useMemo(
    () => Math.max(0, round2Money(checkoutEffectiveDue - voucherRedeemedTotal)),
    [checkoutEffectiveDue, voucherRedeemedTotal],
  );

  const { addLine: addCheckoutLine, updateLine: updateCheckoutLine, removeLine: removeCheckoutLine } = checkoutPayment;
  const checkoutPaymentLinesRef = useRef(checkoutPayment.paymentLines);
  checkoutPaymentLinesRef.current = checkoutPayment.paymentLines;
  const checkoutEffectiveDueRef = useRef(checkoutEffectiveDue);
  checkoutEffectiveDueRef.current = checkoutEffectiveDue;

  /**
   * Applies a voucher the cashier scanned or typed into the main POS search box.
   *
   * Returns `{ ok, message }` so the caller can surface a voucher-specific message — a
   * cancelled or spent voucher must never read as "no product found".
   */
  const applyScannedVoucher = useCallback((voucher) => {
    // Every rule lives in planVoucherApplication (POS/payments/voucherRedemption) so the
    // edge cases — expired, cancelled, spent, double scan, voucher bigger or smaller than the
    // bill — are decided in one pure, directly tested place rather than inside this screen.
    const plan = planVoucherApplication(voucher, checkoutPaymentLinesRef.current || [],
      checkoutEffectiveDueRef.current || 0);
    if (!plan.ok) return { ok: false, message: plan.reason };

    addCheckoutLine({
      paymentType: PAYMENT_TYPES.VOUCHER,
      amount: plan.amount,
      // The code is the whole contract of the allocation — it is what the backend redeems.
      reference: voucher.voucherCode,
      // Display only, so the footer and receipt can name the voucher without a refetch.
      // Never read as authority for balance or eligibility.
      metadata: { voucher, voucherNumber: voucher.voucherNumber },
    });

    return {
      ok: true,
      message: plan.remainingOnVoucher > 0
        ? `Voucher ${voucher.voucherNumber} applied ${formatMoney2(plan.amount)} — ${formatMoney2(plan.remainingOnVoucher)} stays on the voucher`
        : `Voucher ${voucher.voucherNumber} applied ${formatMoney2(plan.amount)}`,
    };
  }, [addCheckoutLine]);

  /**
   * Backing out of the payment screen drops the tenders taken there — but keeps a voucher
   * applied on the sales screen.
   *
   * A voucher scanned at the cart belongs to the cart, the way the items do: cancelling
   * checkout returns the cashier to that cart, and silently losing the voucher they already
   * scanned would make them hunt for the paper again. Clearing it is still one click away
   * (remove it from the footer) or automatic when the cart is cleared.
   */
  const cancelCheckoutTenders = useCallback(() => {
    (checkoutPaymentLinesRef.current || []).forEach((l) => {
      if (l.paymentType !== PAYMENT_TYPES.VOUCHER) removeCheckoutLine(l.id);
    });
  }, [removeCheckoutLine]);

  /** Drops one applied voucher. Nothing was spent, so there is nothing to reverse. */
  const removeAppliedVoucher = useCallback((lineId) => {
    const line = (checkoutPaymentLinesRef.current || []).find((l) => l.id === lineId);
    removeCheckoutLine(lineId);
    if (line) {
      showFeedback('success',
        `Voucher ${line.metadata?.voucherNumber || line.reference} removed`);
    }
  }, [removeCheckoutLine, showFeedback]);

  // Keeps applied vouchers inside the bill as the cart changes.
  //
  // A voucher applied against a 500 bill cannot still claim 500 after the cashier voids a
  // line and the bill drops to 300 — the backend refuses non-cash tender above the invoice
  // total, so the sale would simply fail at settlement. Re-cap the allocations here instead,
  // in the order they were applied, and drop any that no longer fit. Only ever shrinks: a
  // voucher is never silently grown to swallow items added later.
  useEffect(() => {
    const lines = checkoutPaymentLinesRef.current || [];
    capVoucherAllocations(lines, checkoutEffectiveDue).forEach((adj) => {
      const line = lines.find((l) => l.id === adj.id);
      const name = line?.metadata?.voucherNumber || line?.reference;
      if (adj.action === 'remove') {
        removeCheckoutLine(adj.id);
        showFeedback('error', `Voucher ${name} removed — the sale no longer needs it`);
      } else {
        updateCheckoutLine(adj.id, { amount: adj.amount });
        showFeedback('success', `Voucher ${name} reduced to ${formatMoney2(adj.amount)}`);
      }
    });
  }, [checkoutEffectiveDue, removeCheckoutLine, updateCheckoutLine, showFeedback]);

  // Single source of truth for "who is this sale's customer". A credit allocation names the
  // account it is charged to; if that pick never mirrored back onto selectedCustomer, the
  // preview, printed receipt AND the posted invoice all fell back to Walk-in even though a
  // real customer was chosen. Resolve the effective customer here so every consumer
  // (preview, print, backend payload) agrees: prefer the credit allocation's customer, else
  // the main selection.
  const effectiveCustomerId = useMemo(() => {
    const creditCode = checkoutPaymentFields.creditCustomer?.code;
    if (creditCode) {
      const match = customerOptions.find(c => (c.code || c.id) === creditCode);
      if (match) return match.id;
    }
    return selectedCustomer;
  }, [checkoutPaymentFields.creditCustomer, customerOptions, selectedCustomer]);

  const selectedCustomerData = useMemo(
    () => customerOptions.find(c => c.id === effectiveCustomerId) || WALK_IN_CUSTOMER,
    [customerOptions, effectiveCustomerId]
  );

  // Owned here (not inside useCheckout) because checkoutThermalHtml below reads them to
  // decide whether to return the frozen preview, and useCheckout takes checkoutThermalHtml
  // as an input — so the hook can't be the one creating this state without a circular
  // "hook needs the memo that needs the hook" dependency. Passed into useCheckout as
  // `previewFreeze` further down.
  const [checkoutSettling, setCheckoutSettling] = useState(false);
  const checkoutPreviewFreezeRef = useRef('');

  const checkoutThermalHtml = useMemo(() => {
    if (checkoutSettling) return checkoutPreviewFreezeRef.current;
    if (!currentInvoice) return '';
    try {
      const now = new Date();
      // Real next number from the backend sequence; blank until fetched so the
      // preview never shows a fabricated SI-POS-000001.
      const invoiceNo = previewInvoiceNo || '';
      // Pre-payment preview must resolve the same Tax Invoice vs POS Receipt
      // template the real checkout print will use (see buildThermalReceiptArtifacts'
      // hasTax routing) — otherwise a no-tax cart would preview "TAX INVOICE" and
      // then print "SALES INVOICE", confusing the cashier before they even tender.
      const previewHasTax = isTaxInvoiceDocument(currentInvoice);
      const previewShowQRCodeToggle = previewHasTax ? tplInvoiceShowQRCode : tplReceiptShowQRCode;
      const stampAvailable = previewShowQRCodeToggle && !!tplStampDataUrl;
      const showQrInPreview = previewShowQRCodeToggle && !stampAvailable;
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
        // Customer's address on file (mapPosCustomer.address = default shipping,
        // falling back to billing) — printed in the CUSTOMER block by both
        // templates, separate from the sale's DELIVERY ADDRESS section.
        customerAddress: customer?.address || '',
        saleType: currentInvoice.saleType || '',
        shippingAddress: customer?.shippingAddress || customer?.address || '',
        posTerminalId: currentTerminal?.terminalId || '',
        posCounterName: currentTerminal?.counterName || '',
        paymentMode: checkoutPaymentFields.paymentMode,
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

      const previewHeader = previewHasTax ? tplInvoiceHeader : tplReceiptHeader;
      const previewHeaderAr = previewHasTax ? tplInvoiceHeaderAr : tplReceiptHeaderAr;
      const previewFooter = previewHasTax ? tplInvoiceFooter : tplReceiptFooter;
      // Forced off on the no-tax path — see activeShowTrn's note in
      // buildThermalReceiptArtifacts for why this isn't just defaulted off.
      const previewShowTrn = previewHasTax ? tplInvoiceShowTrn : false;
      const previewShowVatSummary = previewHasTax ? tplInvoiceColVatAmt : false;
      const previewShowFooterText = previewHasTax ? tplInvoiceShowTerms : tplReceiptShowTerms;
      const previewShowLogo = previewHasTax ? tplInvoiceShowLogo : tplReceiptShowLogo;
      const previewShowCompanyDetails = previewHasTax ? tplInvoiceShowCompanyDetails : tplReceiptShowCompanyDetails;
      const previewShowCustomerDetails = previewHasTax ? tplInvoiceShowCustomerDetails : tplReceiptShowCustomerDetails;
      const previewShowQRCode = previewHasTax ? tplInvoiceShowQRCode : tplReceiptShowQRCode;
      const previewShowPaymentDetails = previewHasTax ? tplInvoiceColDiscount : tplReceiptColDiscount;
      const previewShowLoyaltyPoints = previewHasTax ? tplInvoiceShowNotes : tplReceiptShowNotes;
      const previewShowCreditBalance = previewHasTax ? tplInvoiceShowBankDetails : tplReceiptShowBankDetails;
      const previewT2 = previewHasTax
        ? {
            hasTax: true,
            showLogo: t2InvoiceShowLogo, showCompanyDetails: t2InvoiceShowCompanyDetails, showTrn: t2InvoiceShowTrn,
            showArabic: t2InvoiceShowArabic, showCustomerDetails: t2InvoiceShowCustomerDetails,
            showAccountBalance: t2InvoiceShowAccountBalance, showDelivery: t2InvoiceShowDelivery,
            showVatSummary: t2InvoiceShowVatSummary, showPaymentDetails: t2InvoiceShowPaymentDetails,
            showLoyalty: t2InvoiceShowLoyalty, showQRCode: t2InvoiceShowQRCode,
            showFooterText: t2InvoiceShowFooterText, showBarcode: t2InvoiceShowBarcode,
          }
        : {
            // No-tax preview: drop all tax content (matches the real print path).
            hasTax: false,
            showLogo: t2ReceiptShowLogo, showCompanyDetails: t2ReceiptShowCompanyDetails, showTrn: false,
            showArabic: t2ReceiptShowArabic, showCustomerDetails: t2ReceiptShowCustomerDetails,
            showAccountBalance: t2ReceiptShowAccountBalance, showDelivery: t2ReceiptShowDelivery,
            showVatSummary: false, showPaymentDetails: t2ReceiptShowPaymentDetails,
            showLoyalty: t2ReceiptShowLoyalty, showQRCode: t2ReceiptShowQRCode,
            showFooterText: t2ReceiptShowFooterText, showBarcode: t2ReceiptShowBarcode,
          };

      // The payment block the preview renders — built from the live allocations by the
      // same function the printed receipt uses, so what the cashier sees on screen and
      // what comes out of the printer cannot differ.
      const previewPaymentBlock = buildPaymentBlock(checkoutPayment.paymentLines, {
        invoiceTotal: checkoutEffectiveDue,
      });

      // Template 2 (Arabic/bilingual) has its own HTML renderer — the checkout
      // preview must show whichever template is saved in Print Templates, same
      // as the ESC/POS print path below already does (see buildReceiptEscPosBase64).
      if (receiptTemplateId === 'billbull-ar') {
        const isWalkInPreview = !customer || customer.id === 'walk-in';
        // Template 2's Show/Hide toggles are split per sub-tab (previewT2 already
        // resolved above by previewHasTax) so the preview honours whichever tab's
        // settings the till will actually print.
        const t2Toggles = previewT2;
        const t2StampAvailable = previewT2.showQRCode && !!tplStampDataUrl;
        const t2ShowQr = previewT2.showQRCode && !t2StampAvailable;
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
          showCreditBalance: previewT2.showAccountBalance && !isWalkInPreview && checkoutPreviewCreditBalance != null,
          creditPreviousBalance: checkoutPreviewCreditBalance,
          creditInvoiceCredit: previewGrand,
          creditAmountPaid: 0,
          creditUpdatedBalance: checkoutPreviewCreditBalance != null ? Number(checkoutPreviewCreditBalance) + previewGrand : null,
          paymentBlock: previewPaymentBlock,
        });
        const outlet = {
          name: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone,
          logoDataUrl: tplLogoDataUrl,
          // Real QR in preview when QR is enabled and no stamp overrides it; stamp
          // image shown separately when uploaded (parity with Template 1 preview).
          qrDataUrl: t2ShowQr ? checkoutPreviewQrDataUrl : null,
          stampDataUrl: t2StampAvailable ? tplStampDataUrl : null,
          footerText: previewFooter,
          titleEn: previewHeader,
          titleAr: previewHeaderAr,
        };
        const html = buildTemplate2Html(mapToTemplate2Data(outlet, txn, t2Toggles));
        checkoutPreviewFreezeRef.current = html;
        return html;
      }

      const activeThermalPaper = previewHasTax ? tplInvoicePaper : tplReceiptPaper;
      // User request: always use 80mm print preview in the checkout window.
      const html = buildThermalReceiptHtml('80mm', mockInvoice, {
        shippingCharge: previewShipping > 0 ? previewShipping : null,
        depositApplied: previewDeposit > 0 ? previewDeposit : null,
        balanceDue: previewDeposit > 0 ? Math.max(0, previewGrand - previewDeposit) : null,
        companyName: tplOutletName, trn: effectiveOutletTrn, documentTitle: previewHeader, footer: previewFooter,
        showTrn: previewShowTrn, zatcaQrDataUrl: showQrInPreview ? checkoutPreviewQrDataUrl : null,
        logoDataUrl: tplLogoDataUrl, stampDataUrl: stampAvailable ? tplStampDataUrl : null,
        showLogo: previewShowLogo, showCompanyDetails: previewShowCompanyDetails,
        outletAddress: tplOutletAddress, outletPhone: tplOutletPhone, showServiceCharge: tplInvoiceShowGrandTotalBanner,
        showVatSummary: previewShowVatSummary, hasTax: previewHasTax, showPaymentDetails: previewShowPaymentDetails, showQRCode: showQrInPreview,
        showCustomerDetails: previewShowCustomerDetails, showLoyaltyPoints: previewShowLoyaltyPoints,
        showCreditBalance: previewShowCreditBalance, showFooterText: previewShowFooterText,
        creditPreviousBalance: checkoutPreviewCreditBalance,
        cashierName: cashierDisplayName, terminalId: currentTerminal?.terminalId, counterName: currentTerminal?.counterName,
        currency: activeCurrency, qrPlacement: tplInvoiceQrPlacement,
        paymentBlock: previewPaymentBlock,
      });

      checkoutPreviewFreezeRef.current = html;
      return html;
    } catch (e) {
      console.warn('Checkout Thermal preview failed:', e);
      return '';
    }
  }, [checkoutSettling, currentInvoice, selectedCustomerData, previewInvoiceNo, activeLayawayDeposit, shippingCharge,
    checkoutPayment, checkoutPaymentFields, currentTerminal, cashierDisplayName, activeCurrency,
    tplInvoiceHeader, tplInvoiceHeaderAr, tplInvoiceFooter, tplOutletName, effectiveOutletTrn, tplOutletAddress, tplOutletPhone, tplLogoDataUrl,
    tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn, tplInvoiceShowCustomerDetails,
    tplInvoiceShowTerms, tplInvoiceShowNotes, tplInvoiceShowBankDetails, tplInvoiceShowGrandTotalBanner,
    tplInvoiceShowStamp, tplInvoiceShowQRCode, tplStampDataUrl, checkoutPreviewQrDataUrl, tplInvoiceColVatAmt,
    tplInvoiceColDiscount, tplInvoiceQrPlacement, checkoutPreviewCreditBalance, receiptTemplateId, currentSession,
    tplReceiptHeader, tplReceiptHeaderAr, tplReceiptFooter, tplReceiptShowTrn, tplReceiptColVatAmt, tplReceiptShowTerms,
    tplReceiptShowLogo, tplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails, tplReceiptShowQRCode,
    tplReceiptColDiscount, tplReceiptShowNotes,
    t2ReceiptShowLogo, t2ReceiptShowCompanyDetails, t2ReceiptShowTrn, t2ReceiptShowArabic, t2ReceiptShowCustomerDetails,
    t2ReceiptShowAccountBalance, t2ReceiptShowDelivery, t2ReceiptShowVatSummary, t2ReceiptShowPaymentDetails,
    t2ReceiptShowLoyalty, t2ReceiptShowQRCode, t2ReceiptShowFooterText, t2ReceiptShowBarcode,
    t2InvoiceShowLogo, t2InvoiceShowCompanyDetails, t2InvoiceShowTrn, t2InvoiceShowArabic, t2InvoiceShowCustomerDetails,
    t2InvoiceShowAccountBalance, t2InvoiceShowDelivery, t2InvoiceShowVatSummary, t2InvoiceShowPaymentDetails,
    t2InvoiceShowLoyalty, t2InvoiceShowQRCode, t2InvoiceShowFooterText, t2InvoiceShowBarcode]);

  const checkoutPreviewBlobUrl = useA4BlobUrl(checkoutThermalHtml);

  // Phase 3 cutover: A4 checkout-time preview — net-new capability, gated on both
  // USE_NEW_POS_PRINT_TEMPLATE and the invoice being configured for A4 paper (the
  // thermal preview above never checked paper size; this one must, so a thermal-only
  // branch never sees an A4 preview attempt). Uses the same draft-cart -> printData
  // pipeline the real print/reprint path already uses via buildPosPrintData, so the
  // checkout preview and the actual printed A4 output are guaranteed to agree.
  const _previewHasTax = currentInvoice ? isTaxInvoiceDocument(currentInvoice) : false;
  const _activePreviewPaper = _previewHasTax ? tplInvoicePaper : tplReceiptPaper;
  // User request: always use 80mm print preview in the checkout window.
  const showA4CheckoutPreview = false;
  const checkoutA4Html = useMemo(() => {
    if (!showA4CheckoutPreview) return '';
    if (checkoutSettling) return checkoutPreviewFreezeRef.current || '';
    if (!currentInvoice) return '';
    try {
      const customer = selectedCustomerData;
      const previewShipping = Number(shippingCharge) || 0;
      const draftData = buildDraftPrintDataFromCart({
        invoiceNumber: previewInvoiceNo || '',
        invoiceDate: new Date().toISOString(),
        customer,
        saleType: currentInvoice.saleType || '',
        terminalId: currentTerminal?.terminalId || '',
        counterName: currentTerminal?.counterName || '',
        paymentMode: checkoutPaymentFields.paymentMode,
        subTotal: currentInvoice.subtotal || 0,
        taxTotal: currentInvoice.tax || 0,
        taxInclusive: !!currentInvoice.taxInclusive,
        invoiceTotal: (currentInvoice.total || 0) + previewShipping,
        discountTotal: currentInvoice.totalDiscount || 0,
        branchName: currentTerminal?.branchName || currentSession?.branchName || '',
        items: (currentInvoice.items || []).map(it => ({
          itemCode: it.code || it.productId || it.id || '',
          itemName: it.name || '',
          description: it.description || '',
          quantity: it.quantity || 0,
          unitPrice: it.price || 0,
          netAmount: it.total || 0,
          discountPercent: it.discount || 0,
          taxPercent: it.taxRate,
          taxAmount: it.taxAmount,
          batchNumber: it.pinnedBatchNumber || it.batchNumber || '',
          voided: !!it.isVoided,
        })),
      }, tplInvoiceFooter);
      const template = resolveInvoiceA4Template(tplInvoiceFooter, {
        showLogo: tplInvoiceShowLogo, showCompanyDetails: tplInvoiceShowCompanyDetails, showTrn: tplInvoiceShowTrn,
        showCustomerDetails: tplInvoiceShowCustomerDetails, showTerms: tplInvoiceShowTerms, showNotes: tplInvoiceShowNotes,
        showBankDetails: tplInvoiceShowBankDetails, showQRCode: tplInvoiceShowQRCode, showStamp: tplInvoiceShowStamp,
        showSignature: tplInvoiceShowSignature, showGrandTotalBanner: tplInvoiceShowGrandTotalBanner,
        colItemCode: tplInvoiceColItemCode, colItemImage: tplInvoiceColItemImage, colBarcode: tplInvoiceColBarcode,
        colBatchNo: tplInvoiceColBatchNo, colDiscount: tplInvoiceColDiscount, colVatPct: tplInvoiceColVatPct, colVatAmt: tplInvoiceColVatAmt,
      }, isTaxInvoiceDocument(currentInvoice));
      const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: activeCurrency || 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
      return generateDocumentPrintHtml(template, draftData, options);
    } catch (e) {
      console.warn('A4 checkout preview failed:', e);
      return '';
    }
  }, [showA4CheckoutPreview, checkoutSettling, currentInvoice, selectedCustomerData, previewInvoiceNo, shippingCharge,
    checkoutPaymentFields, currentTerminal, currentSession, activeCurrency, resolveInvoiceA4Template,
    tplInvoiceFooter, tplInvoiceShowLogo, tplInvoiceShowCompanyDetails, tplInvoiceShowTrn, tplInvoiceShowCustomerDetails,
    tplInvoiceShowTerms, tplInvoiceShowNotes, tplInvoiceShowBankDetails, tplInvoiceShowQRCode, tplInvoiceShowStamp,
    tplInvoiceShowSignature, tplInvoiceShowGrandTotalBanner, tplInvoiceColItemCode, tplInvoiceColItemImage,
    tplInvoiceColBarcode, tplInvoiceColBatchNo, tplInvoiceColDiscount, tplInvoiceColVatPct, tplInvoiceColVatAmt,
    tplOutletName, effectiveOutletTrn, tplOutletAddress, tplOutletPhone, tplLogoDataUrl, tplStampDataUrl]);
  const checkoutA4BlobUrl = useA4BlobUrl(checkoutA4Html);

  // Heartbeat moved into usePosSession (terminal keep-alive is lifecycle-owned).

  // Idle timeout — auto-lock the screen when no activity
  useIdleTimeout({
    timeoutMs: isSessionActive && posSettings?.sessionIdleTimeoutMinutes > 0
      ? posSettings.sessionIdleTimeoutMinutes * 60_000 : 0,
    touchIntervalMs: 30_000,
    sessionId: currentSession?.id,
    onIdle: () => { if (isSessionActive) setIsIdleLocked(true); },
  });

  // Fetch the selected customer's outstanding balance for the checkout preview's
  // Credit Account / Account Balance section — same lookup used at actual print
  // time. Gated on ANY of the four toggles that could end up driving the actual
  // print (Template 1 receipt/invoice tab, Template 2 receipt/invoice tab) since
  // which one applies depends on hasTax/receiptTemplateId, resolved later in the
  // preview builder — checking only tplInvoiceShowBankDetails here meant the
  // balance never got fetched (and the section never rendered) whenever the
  // active toggle was the POS Receipt tab's or Template 2's own toggle.
  const needsCreditBalancePreview = tplInvoiceShowBankDetails || tplReceiptShowBankDetails
    || t2InvoiceShowAccountBalance || t2ReceiptShowAccountBalance;
  useEffect(() => {
    if (!needsCreditBalancePreview || !showPaymentDialog || !selectedCustomerData || selectedCustomerData.id === 'walk-in') {
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
  }, [needsCreditBalancePreview, showPaymentDialog, selectedCustomerData]);

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
    currentInvoice, previewInvoiceNo, selectedCustomer, tplInvoiceFooter, tplOutletName, effectiveOutletTrn]);

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


  // Customer History pane — fetch the full invoice (with line items) for preview.
  // The history list only carries summary fields, so this pulls the complete
  // record the same way Reprint/Last Receipt do.
  const openCustomerHistoryPreview = useCallback(async (inv) => {
    setShowCustomerHistoryPreview(true);
    setCustomerHistoryPreviewInvoice(null);
    setCustomerHistoryPreviewError('');
    if (!inv?.id) { setCustomerHistoryPreviewError('This invoice has no details to preview.'); return; }
    setCustomerHistoryPreviewLoading(true);
    try {
      const full = await getSalesInvoiceById(inv.id);
      setCustomerHistoryPreviewInvoice(full);
    } catch (err) {
      setCustomerHistoryPreviewError(err?.response?.data?.message || 'Failed to load invoice details.');
    } finally {
      setCustomerHistoryPreviewLoading(false);
    }
  }, []);

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

  /** Raise the single "Previous Day Not Closed" flow for every path that can hit it
   *  (Start Session, Continue Session, day-status at mount). The server message is
   *  the only copy of the wording; the session id is read out of it so
   *  "Go to Close Session" lands on that exact session. */
  const showPreviousDayBlock = useCallback((serverMsg, knownSessionId = null) => {
    const cleanMsg = String(serverMsg).replace('PREVIOUS_DAY_SESSION_OPEN: ', '');
    // Accept both message shapes the backend produces: "Session #67" and "Session ID : 67".
    const idMatch = cleanMsg.match(/Session (?:#|ID\s*:\s*)(\d+)/);
    const blockedId = knownSessionId ?? (idMatch ? Number(idMatch[1]) : null);
    setPrevDaySessionOpenId(blockedId);
    setPrevDaySessionOpenMsg(cleanMsg);
    // Remembered beyond the modal: the session may legitimately be loaded afterwards for
    // its closure workflow, and that must not turn it back into a sellable session.
    setPrevDayBlockedSessionId(blockedId);
    setPrevDayBlockedMsg(cleanMsg);
  }, []);

  /** Raise the single "Complete Session Closure" flow for every path that can hit it
   *  (Continue Session at mount, checkout, cash movement). Same discipline as
   *  showPreviousDayBlock: the server message is the only copy of the wording, and the
   *  session id is read out of it so "Go to Close Session" lands on that exact session. */
  const showClosureRequiredBlock = useCallback((serverMsg, knownSessionId = null) => {
    const cleanMsg = String(serverMsg).replace('SESSION_CLOSING_WORKFLOW: ', '');
    const idMatch = cleanMsg.match(/Session (?:#|ID\s*:\s*)(\d+)/);
    setClosureRequiredId(knownSessionId ?? (idMatch ? Number(idMatch[1]) : null));
    setClosureRequiredMsg(cleanMsg);
  }, []);

  // ── POS initialization: settings half ──
  // usePosSession owns the mount-time init sequence (this loader → terminal registration →
  // session resume → posInitLoading=false) and its cancellation flag. The settings, branch
  // tax, layout and print-template seeding it runs first stay here, unchanged; isCancelled()
  // reads that flag exactly where the original effect read `cancelled`. Reached through
  // sessionLifecycleHandlersRef (assigned below useCheckout).
  const loadInitialPosSettings = async (isCancelled) => {
    // Load POS settings
    const settings = await getPosSettings().catch(() => null);
    if (!isCancelled() && settings) {
      setPosSettings(settings);
      // Tax Enabled / Tax Mode / Branch Default VAT Rate live in BranchTaxConfiguration
      // now, not PosSettings — merge them into the same client-side posSettings object
      // so the rest of the POS UI (which reads posSettings.taxInclusive /
      // branchDefaultVatRate) keeps working unchanged. Source of truth and editing both
      // belong to Branch Settings > Tax Configuration; this is read-only here. Resolve
      // against the Branch Selector's active branch (not the ambiguous "current branch"
      // endpoint) so switching branches on this terminal picks up that branch's own Tax
      // Enabled / Tax Mode / VAT rate instead of the cashier's home/HQ branch.
      const activeBranchIdRaw = sessionStorage.getItem('activeBranchId');
      const activeBranchId = activeBranchIdRaw && activeBranchIdRaw !== 'ALL'
        ? Number(activeBranchIdRaw)
        : null;
      (activeBranchId ? getBranchTaxConfigurationForBranch(activeBranchId) : getBranchTaxConfiguration()).then(taxConfig => {
        if (!isCancelled() && taxConfig) {
          setPosSettings(prev => ({ ...(prev || {}), ...taxConfig }));
        }
      }).catch(() => {});
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
          applyPrintTemplateConfig(tpl);
        } catch (e) { /* stale/malformed config — fall through to defaults */ }
      }
    }
  };

  // Correct posSettings once the terminal's actual branch is known. The initial fetch above
  // (getPosSettings, ambient) resolves branch from this tab's Branch Selector state, which can
  // diverge from the terminal actually being operated — e.g. "All Branches" selected, or the
  // admin configured Behavior/Price Override settings in a different browser tab with a
  // different branch context. Re-fetching explicitly by currentTerminal.branchId guarantees the
  // live cart always enforces the settings of the branch it's actually running under (void
  // approval, supervisor PIN, price override, etc.) instead of a stale/mismatched branch's row.
  useEffect(() => {
    if (!currentTerminal?.branchId) return;
    let cancelled = false;
    getPosSettingsForBranch(currentTerminal.branchId).then(settings => {
      if (cancelled || !settings) return;
      setPosSettings(prev => ({ ...(prev || {}), ...settings }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentTerminal?.branchId]);

  // Phase 3 cutover: resolve the real Back Office "Sales Invoice"/"Sales Return"
  // PrintTemplate rows when USE_NEW_POS_PRINT_TEMPLATE is on — POS now shares the
  // exact same template Back Office's Sales Invoice designer edits, not a separate
  // POS-only category. buildPosA4Template's fabricated template remains authoritative
  // until both resolve successfully — a failed/partial fetch here simply leaves
  // resolvedPos*Template null, and every call site already falls back to
  // buildPosA4Template in that case.
  useEffect(() => {
    if (!USE_NEW_POS_PRINT_TEMPLATE) return;
    const branchId = currentTerminal?.branchId || currentSession?.branchId || null;
    let cancelled = false;
    (async () => {
      const [invoiceTpl, creditNoteTpl] = await Promise.all([
        resolvePrintTemplate('Sales Invoice', branchId).catch(() => null),
        resolvePrintTemplate('Sales Return', branchId).catch(() => null),
      ]);
      if (cancelled) return;
      if (invoiceTpl) setResolvedPosInvoiceTemplate(invoiceTpl);
      if (creditNoteTpl) setResolvedPosCreditNoteTemplate(creditNoteTpl);
    })();
    return () => { cancelled = true; };
  }, [currentTerminal?.branchId, currentSession?.branchId]);

  // Auto-load report data when entering report views
  useEffect(() => {
    // Opening the dedicated X-Report view is the deliberate "Generate X Report"
    // action — mark this terminal complete so it clears the Z-Report gate.
    if (currentView === 'x-report') loadXReport(true);
    if (currentView === 'z-report') {
      const branchId = currentTerminal?.branchId || currentSession?.branchId;
      if (branchId) {
        getPosDayStatus().then((status) => {
          const pending = status?.pendingDayCloseDate || null;
          setPendingDayCloseDate(pending);
          if (pending && pending !== zReportDate) {
            setZReportDate(pending);
            loadZReport(pending);
            return;
          }
          loadZReport(zReportDate);
        }).catch(() => loadZReport(zReportDate));
      } else {
        loadZReport(zReportDate);
      }
    }
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
      { branch: cp.companyName, filters: [{ label: 'Date', value: sessionBusinessDay(sess) || '—' }, { label: 'Cashier', value: sess?.openedBy || '' }] },
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

  // A session that entered its close workflow can never be sitting on the selling screen —
  // bounce back to the close screen. Covers the case where the closure was started
  // elsewhere (another tab, a supervisor's device) while this view was already open. The
  // backend refuses the sale regardless; this just avoids letting a cashier build a cart
  // that cannot be settled.
  useEffect(() => {
    if (sessionAwaitingClosure && currentView === 'touch-screen') {
      setCurrentView('x-report');
    }
  }, [sessionAwaitingClosure, currentView]);

  // Same guarantee for a session stranded on a previous Business Day: it must never be the
  // session behind the selling screen, however that screen was reached (stale local state,
  // a direct navigation, or a refresh that restored the session before day-status resolved).
  useEffect(() => {
    if (sessionBlockedByPreviousDay && currentView === 'touch-screen') {
      setCurrentView('dashboard');
      if (prevDayBlockedMsg) showPreviousDayBlock(prevDayBlockedMsg, prevDayBlockedSessionId);
    }
  }, [sessionBlockedByPreviousDay, currentView, prevDayBlockedMsg, prevDayBlockedSessionId, showPreviousDayBlock]);

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

  const formatCurrency = (amount) => <CurrencyAmount amount={amount} />;
  const formatCurrencyStr = (amount) => `${activeCurrency} ${Number(amount || 0).toFixed(2)}`;

  // Display-only subtotal, imported rather than redefined. Counted Cash is computed by the
  // backend from the submitted quantities -- the browser no longer decides what a drawer
  // is worth.


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
    // A drawer count belongs to exactly one session. `closingDenominations` is
    // component state that outlives a close, so without this the quantities counted
    // for the previous session stayed in the inputs and pre-filled the next session's
    // X-Report and Close Session dialog with a drawer that was never counted.
    // Re-hydrate from what the server persisted for THIS session, else start empty.
    let saved = null;
    const rawSaved = info.closingDenominationsJson || xReportData?.session?.closingDenominationsJson;
    if (rawSaved) {
      try {
        const parsed = typeof rawSaved === 'string' ? JSON.parse(rawSaved) : rawSaved;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
      } catch (err) {
        console.warn('Unable to parse saved closing denominations', err);
      }
    }
    setClosingDenominations(saved ? { ...emptyDenominations(), ...saved } : emptyDenominations());
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
    // Never fabricate a terminalId here. A made-up ID like `T001-<timestamp>` doesn't exist
    // in pos_terminals, so openSession() would still create a real, persisted session against
    // it (PosSession.terminalId isn't a real FK) — but that session becomes an orphaned
    // "phantom": invisible to the terminal console, unrecoverable on refresh, and later
    // blocks the next day's session-open via the "previous day session still open" guard.
    if (!currentTerminal?.terminalId) {
      alert(terminalRegistrationError
        || 'This device is not registered as a POS terminal yet. Please wait a moment or refresh the page before starting a session.');
      return;
    }
    const total = calculateDenominationTotal(denominations);
    try {
      const terminalId = currentTerminal.terminalId;
      const counterName = currentTerminal?.counterName || 'Main Counter';
      const session = await openPosSession({ terminalId, counterName, openingCash: total });
      setCurrentSession(session);
      // The count has been banked as this session's opening cash — leave nothing
      // behind for the next session's open/close dialogs to inherit.
      setDenominations(emptyDenominations());
      setClosingDenominations(emptyDenominations());
      setXReportData(null);
      setZReportData(null);
      setSessionNowMs(Date.now());
    } catch (err) {
      // Previous day's session was left open/suspended — block silent continuation and
      // guide the user to close it instead of starting a new day on top of it (BBQA-5.3-013).
      const serverMsg = err?.response?.data?.message || err?.response?.data;
      if (err?.response?.status === 409 && typeof serverMsg === 'string' && serverMsg.includes('PREVIOUS_DAY_SESSION_OPEN')) {
        showPreviousDayBlock(serverMsg);
        return;
      }

      // Session Roaming Phase 11 — detect the Phase 7 structured 409 from openSession's
      // discovery integration. The response body carries a `status` field that is one of
      // the PosSessionDiscoveryStatus enum values (OWNER_SESSION, CONFLICT,
      // MULTIPLE_OWNER_SESSIONS). Distinguish from the PREVIOUS_DAY_SESSION_OPEN 409
      // (plain string message) by checking for a recognized discovery status.
      const DISCOVERY_STATUSES = new Set(['OWNER_SESSION', 'CONFLICT', 'MULTIPLE_OWNER_SESSIONS']);
      if (err?.response?.status === 409 && DISCOVERY_STATUSES.has(err?.response?.data?.status)) {
        setDiscoveryResponse(err.response.data);
        setDiscoveryError(null);
        setDiscoverySupervisorPin('');
        setShowStartSessionDialog(false);
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

  // Session Roaming Phase 11 — transfer the user's existing session from its current
  // terminal to this terminal, then automatically retry openSession. The transfer
  // endpoint requires `confirm: true` (always sent) and optionally a `supervisorPin`
  // when the policy reports SUPERVISOR_REQUIRED.
  const handleSessionTransfer = async () => {
    if (discoveryBusy) return; // prevent double-click
    if (!discoveryResponse?.ownerSessionId || !currentTerminal?.terminalId) return;

    // Phase 11.6: Capture the active branch to detect stale async continuations.
    const startingBranchId = sessionStorage.getItem('activeBranchId');
    const isStale = () => sessionStorage.getItem('activeBranchId') !== startingBranchId;

    setDiscoveryBusy(true);
    setDiscoveryError(null);
    try {
      await transferPosSession(discoveryResponse.ownerSessionId, {
        destinationTerminalId: currentTerminal.terminalId,
        reason: 'Session roaming — operator transferred session to current terminal',
        supervisorPin: discoverySupervisorPin || undefined,
      });

      if (isStale()) return; // Abort silently

      // Transfer succeeded — clear discovery state and retry openSession.
      setDiscoveryResponse(null);
      setDiscoverySupervisorPin('');
      // Auto-retry: now that the user's session is hosted on this terminal, openSession
      // should succeed (it finds SAME_SESSION and resumes). Use the same denomination
      // total the user entered.
      try {
        const total = calculateDenominationTotal(denominations);
        const terminalId = currentTerminal.terminalId;
        const counterName = currentTerminal?.counterName || 'Main Counter';
        const session = await openPosSession({ terminalId, counterName, openingCash: total });
        
        if (isStale()) return; // Abort silently

        setCurrentSession(session);
        // The count has been banked as this session's opening cash — leave nothing
        // behind for the next session's open/close dialogs to inherit.
        setDenominations(emptyDenominations());
        setClosingDenominations(emptyDenominations());
        setXReportData(null);
        setZReportData(null);
        setSessionNowMs(Date.now());
        setShowStartSessionDialog(false);
        setCurrentView('touch-screen');
      } catch (retryErr) {
        if (isStale()) return;
        // Transfer worked but openSession still failed — surface the error and let
        // the cashier try again manually. Do NOT loop.
        console.error('Post-transfer openSession retry failed', retryErr);
        alert(retryErr?.response?.data?.message || 'Session transferred but could not open it. Please try again.');
      }
    } catch (err) {
      if (isStale()) return;
      
      const msg = err?.response?.data?.message || err?.response?.data;
      const reasonCode = err?.response?.data?.policyReasonCode || err?.response?.data?.transferReasonCode;
      // Map known backend reason codes to user-friendly messages.
      if (reasonCode === 'DESTINATION_TERMINAL_OCCUPIED') {
        setDiscoveryError('This terminal already has an active session. The other session must be closed first.');
      } else if (reasonCode === 'SAME_TERMINAL_NOT_APPLICABLE') {
        setDiscoveryError('Your session is already on this terminal.');
      } else if (reasonCode === 'DESTINATION_TERMINAL_NOT_FOUND') {
        setDiscoveryError('This terminal could not be found. Please refresh and try again.');
      } else if (err?.response?.status === 403) {
        setDiscoveryError('Invalid supervisor PIN or insufficient permissions.');
      } else if (err?.response?.status === 409) {
        setDiscoveryError(typeof msg === 'string' ? msg : 'A concurrent change prevented the transfer. Please try again.');
      } else {
        setDiscoveryError(typeof msg === 'string' ? msg : 'Transfer failed. Please try again.');
      }
    } finally {
      if (!isStale()) {
        setDiscoveryBusy(false);
      }
    }
  };

  // Session Roaming Phase 11 — dismiss the discovery dialog and clear all related state.
  const handleDiscoveryDismiss = () => {
    setDiscoveryResponse(null);
    setDiscoveryBusy(false);
    setDiscoveryError(null);
    setDiscoverySupervisorPin('');
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

  /**
   * "Open Day Close" from the Trading-Period-Ended overlay, shown once every
   * session on the closed Trading Date is closed but the day is not finalized.
   *
   * Pure navigation into the *existing* Day Close / Z-Report view — no second
   * Z-Report implementation and no validation is skipped: entering 'z-report'
   * runs the same effect the Z-Report dashboard tile does, which re-reads
   * day-status, pins zReportDate to the authoritative pendingDayCloseDate and
   * loads the already-generated session/X-Report state. The date passed here is
   * only a hint for that load; the effect's own lookup still wins.
   *
   * Switching to 'z-report' also flips `businessDayClosureFlowActive` below, so
   * the blocking overlay stands down instead of covering the Day Close page.
   */
  const handleTradingEndedOpenDayClose = (targetDate) => {
    if (targetDate) {
      setPendingDayCloseDate(targetDate);
      setZReportDate(targetDate);
    }
    setCurrentView('z-report');
  };

  /**
   * While any part of the closure/Day Close work is on screen, the blocking
   * Business Day overlay stands down. It is a *blocking* layer at z-[100]: left
   * mounted it would render on top of the owner-verification dialog, the X-Report
   * denomination screen and the Close Session dialog — which is exactly the
   * "denomination visible but not clickable" state. It comes back on its own if
   * the operator walks back to the till with sessions still open.
   */
  const businessDayClosureFlowActive = Boolean(
    showCashierAuthDialog || showCloseSessionDialog || showSupervisorPin || sessionToClose
    || currentView === 'x-report' || currentView === 'z-report',
  );

  // ── Product entry ──────────────────────────────────────────────────────────
  // Implementation lives in POS/features/products/useProductEntry.js. Everything from a
  // scanned/typed/tapped value to a cart line: unified entry parsing + resolution, the
  // Product Entry Mode decision, the Item Entry dialog and addToInvoice itself. It writes
  // through the cart boundary above; useCart remains the single cart owner. The
  // supervisor-approval queue is owned by useSupervisorApproval — entry only enqueues an
  // ADD_ITEM request through requestApproval, and the dispatcher below sends it back
  // through the addToInvoice returned here.
  const {
    addToInvoice,
    handleUnifiedEntry, handleBarcodeScan, handleProductSelection, handleEditItem,
    lastScannedItem, setLastScannedItem,
    isItemEntryOpen, selectedProductForEntry, itemEntryAction, itemEntryContext,
    itemEntryInitialValues, closeItemEntry, handleItemEntryConfirm,
  } = useProductEntry({
    posSettings, currentRenderCount,
    setCurrentInvoice, currentInvoiceRef, recalculateInvoice,
    requestApproval,
    productCacheRef, setBarcodeInput, setSearchQuery, setSelectedCustomer,
    applyScannedVoucher, showFeedback,
  });


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

  const updateDiscount = (itemId, discount, approved = false) => {
    if (!approved && posSettings?.requirePriceOverrideApproval) {
      const target = currentInvoiceRef.current?.items?.find(i => i.id === itemId);
      const floor = target ? getPriceFloor(target.minPrice, target.cost) : null;
      const effectivePrice = target ? toNumber(target.price, 0) * (1 - toNumber(discount, 0) / 100) : null;
      if (floor != null && effectivePrice != null && effectivePrice < floor) {
        requestApproval({
          priceOverride: {
            type: 'UPDATE_DISCOUNT',
            itemId, newDiscount: discount, itemName: target?.name, minPrice: floor, attemptedPrice: effectivePrice,
          },
        });
        return;
      }
    }
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

  const updateItemPrice = (itemId, newPrice, approved = false) => {
    if (newPrice <= 0) return;
    if (!approved && posSettings?.requirePriceOverrideApproval) {
      const target = currentInvoiceRef.current?.items?.find(i => i.id === itemId);
      const floor = target ? getPriceFloor(target.minPrice, target.cost) : null;
      const effectivePrice = target ? newPrice * (1 - toNumber(target.discount, 0) / 100) : newPrice;
      if (floor != null && effectivePrice < floor) {
        requestApproval({
          priceOverride: {
            type: 'UPDATE_PRICE',
            itemId, newPrice, itemName: target?.name, minPrice: floor, attemptedPrice: effectivePrice,
          },
        });
        return;
      }
    }
    setCurrentInvoice(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId
          ? { ...item, price: newPrice, total: item.quantity * newPrice * (1 - item.discount / 100) }
          : item
      );
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
      requestApproval({ voidItemId: itemId });
      return;
    }
    applyVoid(itemId);
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
      clearTerminalLock();

      // Handover unlocks the terminal but the ongoing session (owned by the
      // previous cashier) still exists — resume it rather than falling through
      // to "Start Session".
      await resumeTerminalSession();

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
  // Implementation lives in POS/features/settings/usePosBehaviourSettings.js.

  // markGenerated=true stamps this terminal as having completed its X-Report (the
  // deliberate "Generate X Report" action). The dashboard preview passes false so
  // merely viewing the dashboard never satisfies the Z-Report end-of-day gate.
  const loadXReport = async (markGenerated = false) => {
    const targetSession = sessionToClose || currentSession;
    if (!targetSession?.id || typeof targetSession.id !== 'number') return;
    setXReportLoading(true);
    try {
      const data = markGenerated
        ? await generatePosXReport(targetSession.id)
        : await getPosXReport(targetSession.id);
      setXReportData(data);
    } catch (err) {
      console.warn('X-Report load failed', err);
    } finally {
      setXReportLoading(false);
    }
  };

  // Search past CLOSED sessions in a date range for the X-Report history picker.
  const searchXReportHistory = async () => {
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    setXHistoryLoading(true);
    try {
      const page = await getPosSessionHistory({
        branchId, dateFrom: xHistoryDateFrom, dateTo: xHistoryDateTo, status: 'CLOSED', size: 30,
      });
      setXHistoryResults(page?.content || []);
    } catch (err) {
      console.warn('X-Report history search failed', err);
      setXHistoryResults([]);
    } finally {
      setXHistoryLoading(false);
    }
  };

  // View a past session's X-Report read-only — never calls generatePosXReport (which
  // would only stamp OPEN sessions anyway), so this never mutates historical state.
  const loadHistoricalXReport = async (sessionId) => {
    setXReportLoading(true);
    try {
      const data = await getPosXReport(sessionId);
      setXReportData(data);
      setViewingHistoricalXReport(true);
      setShowXReportHistory(false);
    } catch (err) {
      console.warn('Historical X-Report load failed', err);
    } finally {
      setXReportLoading(false);
    }
  };

  const returnToCurrentSessionXReport = () => {
    setViewingHistoricalXReport(false);
    loadXReport();
  };

  const loadZReport = async (date) => {
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    if (!branchId) return;
    setZReportLoading(true);
    try {
      const data = await getPosZReport(
        branchId, date || zReportDate,
        rangeOverride.startSessionId || undefined, rangeOverride.endSessionId || undefined
      );
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
    loadDaySummary(date || zReportDate);
  };

  /**
   * Day Close review-screen summary — auto-resolved first/last session by default,
   * or the supervisor-adjusted range when rangeOverride is set. Recalculates
   * included sessions/count/time span immediately on every range change.
   */
  const loadDaySummary = async (date, override) => {
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    if (!branchId) return;
    const eff = override !== undefined ? override : rangeOverride;
    setDaySummaryLoading(true);
    try {
      const data = await getPosDayCloseSummary(
        branchId, date || zReportDate,
        eff.startSessionId || undefined, eff.endSessionId || undefined
      );
      setDaySummary(data);
    } catch (err) {
      console.warn('Day Close summary load failed', err);
      setDaySummary(null);
    } finally {
      setDaySummaryLoading(false);
    }
  };

  const applyRangeOverride = (nextOverride) => {
    setRangeOverride(nextOverride);
    loadDaySummary(zReportDate, nextOverride);
  };

  const resetRangeOverride = () => {
    applyRangeOverride({ startSessionId: '', endSessionId: '' });
  };

  // Advanced session-range override is collapsed and supervisor-gated by default,
  // reusing the existing supervisor-PIN pattern (see handleSupervisorPinSubmit).
  const toggleAdvancedRange = () => {
    if (showAdvancedRange) {
      setShowAdvancedRange(false);
      return;
    }
    if (advancedRangeUnlocked) {
      setShowAdvancedRange(true);
      return;
    }
    requestApproval({ unlockAdvancedRange: true });
  };

  // Approval continuation for the gate above — the dispatcher calls this once a
  // supervisor is verified.
  const unlockAdvancedRange = () => {
    setAdvancedRangeUnlocked(true);
    setShowAdvancedRange(true);
  };

  const handleCloseDay = async (acknowledgeExclusions = false) => {
    const branchId = currentTerminal?.branchId || currentSession?.branchId;
    if (!branchId) return;

    // Strict validation guard: Ensure Day Close cannot be triggered (e.g. via keyboard shortcut) 
    // while blocking validations exist.
    const isXReportsMissing = Array.isArray(zReportPending) && zReportPending.length > 0;
    const isOpenSessions = (typeof daySummary !== 'undefined' && daySummary) ? (daySummary.openSessionCount > 0) : false;
    const isSuspendedBills = (typeof daySummary !== 'undefined' && daySummary) ? (daySummary.suspendedSessionCount > 0) : false;
    const isNoSessions = !daySummary || daySummary.totalSessions === 0;

    if (isXReportsMissing || isOpenSessions || isSuspendedBills || isNoSessions) {
      alert(isNoSessions
        ? "Cannot close day: no POS sessions exist for this business date."
        : "Cannot close day while blocking validations exist. Please resolve all pending actions.");
      return;
    }

    if (posSettings?.requireSupervisorForDayClose && !hasAnyRole('SUPERVISOR', 'ROLE_SUPERVISOR', 'MANAGER', 'ROLE_MANAGER', 'ADMIN', 'ROLE_ADMIN', 'BRANCH_ADMIN', 'ROLE_BRANCH_ADMIN')) {
      requestApproval({
        supervisorAction: { type: 'DAY_CLOSE', payload: { acknowledgeExclusions } },
        resetEmail: true,
      });
      return;
    }

    try {
      setZReportLoading(true);
      const data = await closePosDay(
        branchId, zReportDate,
        rangeOverride.startSessionId || undefined, rangeOverride.endSessionId || undefined,
        acknowledgeExclusions || undefined
      );
      setZReportData(data);
      setRangeExclusionConfirm(null);
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
      } else if (body?.code === 'SESSION_RANGE_EXCLUSION_UNCONFIRMED') {
        // Narrowed range leaves otherwise-eligible sessions out of this close —
        // surface them for explicit supervisor confirmation instead of retrying blind.
        setRangeExclusionConfirm({ message: body.message, ...body.details });
      } else {
        alert(body?.message || 'Failed to close business day.');
      }
    } finally {
      setZReportLoading(false);
    }
  };

  // Global VAT mode: Inclusive means the entered price already contains VAT,
  // Exclusive means VAT is added on top. Fallback rate from the branch's Tax
  // Configuration — 0 outright when Tax Enabled is off (kill switch), regardless
  // of the configured Branch Default VAT Rate. The math itself lives in
  // posUtils.computePosCartTotals so it can be unit-tested; this reads the live
  // posSettings (every cart mutation re-runs it, so a scan always uses the
  // current mode, never a mount-time snapshot).

  // Workspace reset: the cart, the order-level shipping charge and the tenders. The cart
  // half lives in useCart; the other two are not cart state, which is why this composite
  // stays here.
  const clearInvoice = () => {
    resetCartState();
    // Shipping is an order-level charge, not a cart line — clear it with the cart.
    setShippingCharge(0);
    // Abandoning the cart abandons its tenders too. A voucher applied to a cart that is then
    // cleared must not carry over onto the next customer's sale — nothing was spent (the
    // backend only redeems at checkout), so dropping the allocation releases it entirely.
    checkoutPayment.clearLines();
  };


  // ── Delivery ───────────────────────────────────────────────────────────────

  // Implementation lives in POS/features/delivery/useDelivery.js. Everything is
  // destructured back under its original name so existing consumers are untouched;
  // handleOutForDelivery and the settlement handler stay below (print-coupled).
  const {
    deliveryAddress, setDeliveryAddress, deliveryNotes, setDeliveryNotes,
    deliveryDriver, setDeliveryDriver, deliveryCharge, setDeliveryCharge,
    showDeliveryModal, setShowDeliveryModal, deliveryModalTab, setDeliveryModalTab,
    deliveryCustomerId, setDeliveryCustomerId, deliveryCustomerSearch, setDeliveryCustomerSearch,
    deliveryNewName, setDeliveryNewName, deliveryNewMobile, setDeliveryNewMobile,
    deliveryNewEmail, setDeliveryNewEmail, deliveryDate, setDeliveryDate,
    deliveryTimeSlot, setDeliveryTimeSlot, deliveryInstructions, setDeliveryInstructions,
    deliveryValidationErrors, setDeliveryValidationErrors,
    deliveryPersons, deliveryPersonsLoading, selectedDeliveryPerson,
    deliveryShowAddressPicker, setDeliveryShowAddressPicker,
    deliveryShowAddAddressModal, setDeliveryShowAddAddressModal,
    deliveryNewAddress, setDeliveryNewAddress,
    deliveryAddressSaving, deliveryAddressError, setDeliveryAddressError,
    handleSaveDeliveryNewAddress,
    showDeliverySettleModal, setShowDeliverySettleModal,
    deliverySettleSearch, setDeliverySettleSearch,
    deliverySettlePersonFilter, setDeliverySettlePersonFilter,
    deliveryOrders, deliveryOrdersLoading, loadDeliveryOrders,
    deliveryOutLoading, setDeliveryOutLoading,
    deliverySettleLoading, setDeliverySettleLoading,
    openDeliveryModal, validateDeliveryOrder,
  } = useDelivery({
    currentTerminal, currentInvoice, selectedCustomerData,
    setPosCustomers, clearDeliverySettleLines,
    deliverySettleSelected, setDeliverySettleSelected,
  });

  // Lazily load configured bank accounts the first time the cashier opens any flow that
  // allocates payments — checkout, layaway deposit, or delivery settlement all render
  // PaymentAllocationPanel, and its Online modal needs them to offer a receiving account.
  // excludeCash drops Cash in Hand / Petty Cash: money arriving by bank transfer must not
  // land on a cash account, or the session's drawer count expects notes that were never taken.
  const needsBankAccounts = showPaymentDialog || showSaveLayaway || showDeliverySettleModal;
  useEffect(() => {
    if (!needsBankAccounts) return;
    if (checkoutOnlineBankAccounts.length > 0 || checkoutOnlineBankAccountsLoading) return;
    let cancelled = false;
    setCheckoutOnlineBankAccountsLoading(true);
    getBankAccounts({ excludeCash: true })
      .then(data => { if (!cancelled) setCheckoutOnlineBankAccounts(Array.isArray(data) ? data : []); })
      .catch(err => { console.warn('Failed to load bank accounts', err); if (!cancelled) setCheckoutOnlineBankAccounts([]); })
      .finally(() => { if (!cancelled) setCheckoutOnlineBankAccountsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBankAccounts]);

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
        // A delivery order posts unpaid — no allocations, so no payment is recorded. The
        // balance is collected later through the delivery-settle flow.
        paymentMode: 'Delivery',
        sessionId: currentSession?.id || null,
        terminalId: currentTerminal?.terminalId || null,
        counterName: currentTerminal?.counterName || null,
        branchId: currentTerminal?.branchId || null,
        branchName: currentTerminal?.branchName || null,
        branchCode: currentTerminal?.branchCode || null,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        taxInclusive: posSettings?.taxInclusive === true,
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
          const template = resolveInvoiceA4TemplateFor(savedInvoice);
          const data = buildPosPrintData(savedInvoice, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(savedInvoice) ? tplInvoiceHeader : tplReceiptHeader);
          const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
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
            customerTrn: customer?.trn,
            customerAddress: customer?.address,
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


  // ── Hold (persisted, session-scoped) ───────────────────────────────────────
  const sessionId = currentSession?.id && typeof currentSession.id === 'number' ? currentSession.id : null;
  // Implementation lives in POS/features/heldSales/useHeldSales.js.
  const {
    heldSales, holdBusy, loadHeldSales, holdInvoice, recallInvoice, deleteHeldBill,
  } = useHeldSales({
    sessionId, currentSession, currentTerminal, currentInvoice, selectedCustomerData, posSettings,
    cartItemsToPayload, clearInvoice, setConfirmAction,
    syncPosDataRef, startLayawayConversion,
  });

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
  // Late-bound for useHeldSales: hold/delete re-sync POS data after mutating a hold,
  // but syncPosData itself depends on the loadHeldSales that hook returns.
  syncPosDataRef.current = syncPosData;
  // Late-bound for useSessionClosure (called ~2,500 lines up). The first point at which all
  // three loaders are initialised. Its handlers snapshot this on entry, never during render.
  sessionClosureLoadersRef.current = { loadXReport, loadDaySummary, syncPosData };



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
        // The allocations are the source of truth for the deposit; the scalars below are
        // derived from them and kept so an older server still records the right figures.
        paymentAllocations: saveLayawayDepositReq ? saveLayawayFields.paymentAllocations : [],
        depositAmount: saveLayawayDepositReq ? saveLayawayFields.amountTendered : 0,
        depositPaymentMode: saveLayawayDepositReq ? saveLayawayFields.paymentMode : null,
        dueDate: saveLayawayDueDate || null,
        remarks: saveLayawayRemarks || null,
        reserveStockRequested: saveLayawayReserveStock,
        billDiscountAmount: currentInvoice.billDiscountAmount || 0,
        taxInclusive: posSettings?.taxInclusive === true,
        items: cartItemsToPayload(currentInvoice.items),
      });
      if (print) {
        try {
          const layawayHtmlOpts = {
            companyName: tplOutletName,
            trn: effectiveOutletTrn,
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
                // Same branded-header bridge as the X/Z reports (see
                // buildReportEscPosWithBrandedHeader): the body is generated with
                // omitHeader so the standard logo/company/TRN block (Arabic-safe
                // canvas raster) isn't duplicated by this plain-text builder.
                const layawayText = buildLayawayReceiptText(tplReceiptPaper, saved, { ...layawayHtmlOpts, omitHeader: true });
                const escPosBase64 = await buildEscPosDocumentBase64(layawayText, {
                  paperSize: tplReceiptPaper,
                  documentTitle: 'LAYAWAY RECEIPT',
                  companyName: tplOutletName,
                  header: tplReceiptHeader,
                  trn: effectiveOutletTrn,
                  outletAddress: tplOutletAddress,
                  outletPhone: tplOutletPhone,
                  logoDataUrl: tplLogoDataUrl,
                  showTrn: tplReceiptShowTrn,
                });
                const fallbackText = buildLayawayReceiptText(tplReceiptPaper, saved, layawayHtmlOpts);
                await sendEscPosReceiptToConfiguredPrinter(printer, { dataBase64: escPosBase64, receiptText: fallbackText, title: `Layaway ${saved.layawayNumber || ''}`.trim() });
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
      clearSaveLayawayLines();
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



  // ── Cash drawer control ────────────────────────────────────────────────────
  // Implementation lives in POS/device/cashDrawer/useCashDrawer.js.
  const { openCashDrawer } = useCashDrawer(posSettings);
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

  // Discover (and keep a warm connection to) the local print agent as soon as the
  // POS screen mounts, rather than on the first Print click. The probe is bounded,
  // deduped and cached inside localPrintAgent, so this just moves a round-trip that
  // used to sit inside the operator's first print out of the critical path.
  useEffect(() => { warmPrintAgent(); }, []);

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

  // ── Thermal receipt artifacts ──────────────────────────────────────────────
  // Generation lives in POS/device/printing/buildThermalReceiptArtifacts.js as a pure
  // async function. This wrapper only injects the two explicit context objects that
  // replaced its 83-entry closure dependency array, so all six call sites are unchanged.
  const buildThermalReceiptArtifacts = useCallback(
    (args) => buildThermalReceiptArtifactsImpl({
      ...args,
      templateSettings: receiptArtifactTemplateSettings,
      posContext: {
        activeCurrency, cashierDisplayName, customerOptions,
        currentTerminal, currentSession,
      },
    }),
    [
      receiptArtifactTemplateSettings, activeCurrency, cashierDisplayName,
      customerOptions, currentTerminal, currentSession,
    ],
  );

  // ESC/POS-first: raw ESC/POS is the only path with real density/heat/font/
  // logo control, so it's always attempted first. If the Windows queue's driver
  // rejects the raw job (v4/WSD-class drivers refuse datatype RAW), the agent
  // layer falls back to the text/GDI path so the customer still gets a receipt —
  // and that downgrade is surfaced as a visible amber "compatibility mode" toast
  // (never silent), telling the operator to install the vendor or Generic/
  // Text-Only driver. A missing printer or a send that fails in BOTH modes still
  // throws. notifyPrintFallback reports hard failures via the dismissible toast.

  // overrideCreds, when present, carries a supervisor PIN ({pin}) or credentials
  // ({email,password}) already confirmed via the supervisor-approval dialog (see
  // handleSupervisorPinSubmit's 'CHECKOUT' branch) — attached to the checkout payload so the
  // backend's §2.4 price-override gate (PosCheckoutController) can verify and bypass it,
  // instead of only the pos_price_override role-permission check.
  // ── Checkout orchestration ─────────────────────────────────────────────────
  // Implementation lives in POS/features/checkout/useCheckout.js, which documents the
  // full load-bearing sequence (payment-confirmed boundary, backgrounded finalisation).
  const {
    checkoutLoading,
    checkoutError, setCheckoutError,
    checkoutPhase, setCheckoutPhase,
    checkoutFinalizing, setCheckoutFinalizing,
    lastPaidInvoice,
    checkoutRemarks, setCheckoutRemarks,
    processPayment,
  } = useCheckout({
    payment: { checkoutPayment, checkoutPaymentFields, checkoutEffectiveDue, checkoutCompatibility },
    cart: { currentInvoice, clearInvoice, setInvoiceCounter, checkoutThermalHtml },
    previewFreeze: { checkoutSettling, setCheckoutSettling, checkoutPreviewFreezeRef },
    customerCtx: { selectedCustomerData, customerOptions },
    sessionCtx: { currentSession, currentTerminal, posSettings },
    layaway: { activeLayawayId, activeLayawayDeposit, setActiveLayawayId, setActiveLayawayDeposit },
    shipping: { shippingCharge, shippingAddress, deliveryAddress, deliveryDriver, deliveryNotes },
    printing: {
      resolveInvoiceA4TemplateFor, printThermalReceiptWithConfiguredPrinter,
      buildThermalReceiptArtifacts, openCashDrawer,
    },
    a4Template: {
      tplInvoicePaper, tplInvoiceFooter, tplInvoiceHeader, tplReceiptHeader,
      tplInvoiceShowStamp, tplOutletName, tplOutletAddress, tplOutletPhone,
      tplLogoDataUrl, tplStampDataUrl, tplInvoiceShowBankDetails, effectiveOutletTrn, company,
    },
    errorRouting: {
      isClosureWorkflowError, showClosureRequiredBlock, setShowPaymentDialog,
      requestApproval,
    },
    posReset: {
      syncPosData, setReceivedAmount, setSelectedCardType,
      setSelectedCreditCustomer, setLastScannedItem,
    },
  });

  // Late-bound for usePosSession (called at the top of the component). Assigned during
  // render, here, because this is the first point at which every binding it closes over is
  // initialised — setCheckoutPhase/setCheckoutError come from useCheckout just above. The
  // hook reads it only from effects, async continuations and event handlers, all of which
  // run after this render has finished.
  sessionLifecycleHandlersRef.current = {
    loadInitialPosSettings,
    showPreviousDayBlock,
    showClosureRequiredBlock,
    resetDiscovery: handleDiscoveryDismiss,
    // Session invalidated by the sync poll: the cart, customer, open dialogs and checkout
    // phase are reset in exactly the order the poll effect used to write them.
    resetForInvalidatedSession: () => {
      setCurrentInvoice({ items: [], subtotal: 0, totalDiscount: 0, tax: 0, total: 0, billDiscountAmount: 0 });
      setSelectedCustomer(WALK_IN_CUSTOMER.id);
      setShowPaymentDialog(false);
      setShowCloseSessionDialog(false);
      setShowCashDropDialog(false);
      setShowCustomerSelector(false);
      setCheckoutPhase('payment');
      setCheckoutError(null);
    },
  };

  // Approval continuation for a full-clear layaway abort: dropping the whole cart abandons
  // the conversion, so the layaway tagging is dropped with it. A void/remove abort leaves
  // the conversion active and never reaches here.
  const clearLayawayConversion = () => {
    setActiveLayawayId(null);
    setActiveLayawayDeposit(0);
  };

  // Supervisor-approval dispatcher entry point. useSupervisorApproval owns the queue and
  // every branch of the decision; POSSales only binds the continuations, which is why this
  // sits below useCheckout — processPayment and handleCloseDay must already be declared.
  // The continuations stay owned by their domains: the cart editors, product entry,
  // checkout, Day Close and (through the two refs) session closure.
  const handleSupervisorPinSubmit = () => submitSupervisorApproval({
    supervisorApprovalMode, currentTerminal, cashierDisplayName,
    forceCloseReason, forceCloseAuditAcknowledged, sessionToClose, currentSession,
    closureAuthGrantRef, forceCloseContextRef, setCurrentView,
    unlockAdvancedRange,
    applyVoid, addToInvoice, updateItemPrice, updateDiscount,
    processPayment,
    clearLayawayConversion,
    handleCloseDay,
  });

  // Pre-fill the share dialog from the customer on the settled sale. A walk-in
  // has neither, so the cashier gets an empty field to type into.
  const receiptShareInitialValue = useMemo(() => {
    const cust = lastPaidInvoice?.customer;
    if (!cust || cust.id === WALK_IN_CUSTOMER.id) return '';
    return (receiptShareChannel === 'email' ? cust.email : cust.phone || cust.mobile) || '';
  }, [lastPaidInvoice, receiptShareChannel]);

  // The three send paths are unchanged — WhatsApp still opens wa.me, Email still
  // calls sendSalesInvoiceEmail with the same payload. Throwing here keeps the
  // dialog open so the cashier can retry.
  const handleReceiptShareSend = useCallback(async (value) => {
    if (!lastPaidInvoice) return;
    const summary = `Receipt ${lastPaidInvoice.id} – ${formatCurrencyStr(lastPaidInvoice.total)}`;
    if (receiptShareChannel === 'whatsapp') {
      const digits = value.replace(/\D/g, '');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(summary)}`, '_blank');
      setReceiptShareFeedback({ type: 'success', message: 'WhatsApp opened with the receipt message.' });
      return;
    }
    if (receiptShareChannel === 'sms') {
      // No SMS gateway is wired up yet; this keeps the previous stub behaviour
      // (which used alert()) and only swaps the notice for the standard toast.
      setReceiptShareFeedback({ type: 'success', message: `${summary} — SMS queued for ${value}.` });
      return;
    }
    if (receiptShareChannel === 'email') {
      if (!lastPaidInvoice?.invoice?.id) throw new Error('Invoice is not available to email yet.');
      await sendSalesInvoiceEmail(lastPaidInvoice.invoice.id, {
        toEmail: value,
        subject: `Receipt ${lastPaidInvoice.id}`,
        htmlBody: `<p>Invoice: ${lastPaidInvoice.id}, Total: ${formatCurrencyStr(lastPaidInvoice.total)}</p>`,
      });
      setReceiptShareFeedback({ type: 'success', message: `Receipt emailed to ${value}.` });
    }
  }, [lastPaidInvoice, receiptShareChannel]);

  useEffect(() => {
    if (!receiptShareFeedback) return undefined;
    const t = setTimeout(() => setReceiptShareFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [receiptShareFeedback]);

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
    if (cashDropCategoryRequired && !cashDropCategoryId) {
      setCashDropFeedback({ type: 'error', message: 'Select a category before saving.' });
      setTimeout(() => setCashDropFeedback(null), 3000);
      return;
    }
    const movementType = cashDropType === 'in' ? 'DROP_IN' : 'DROP_OUT';
    try {
      if (currentSession?.id && typeof currentSession.id === 'number') {
        await addPosCashMovement(currentSession.id, {
          movementType,
          amount,
          description: cashDropDescription || (cashDropType === 'in' ? 'Cash Drop In' : 'Cash Out'),
          categoryId: cashDropCategoryId || undefined,
        });
      }
      // Drawer opens only once the movement is accepted — a refused cash out (e.g. more
      // than the drawer holds) must not pop the drawer.
      openCashDrawer(cashDropType === 'in' ? 'CASH_DROP' : 'CASH_OUT');
      setCashDropFeedback({ type: 'success', message: cashDropType === 'in' ? 'Cash drop recorded.' : 'Cash out recorded.' });
    } catch (err) {
      console.warn('Cash movement API error', err);
      if (isClosureWorkflowError(err)) {
        // Session is mid-closure — a drop/payout now would move the drawer away from the
        // X-Report figure the cashier is about to be counted against. Route to closure.
        setShowCashDropDialog(false);
        showClosureRequiredBlock(err?.response?.data?.message || err?.response?.data);
        return;
      }
      // Surface the server's reason (insufficient cash in drawer, category required, …)
      // and keep the dialog open with the typed amount so it can be corrected.
      const apiMessage = typeof err?.response?.data === 'string'
        ? err.response.data
        : err?.response?.data?.message;
      setCashDropFeedback({ type: 'error', message: apiMessage || 'Failed to record cash movement.' });
      setTimeout(() => setCashDropFeedback(null), 5000);
      return;
    }
    setCashDropAmount('');
    setCashDropDescription('');
    setCashDropCategoryId('');
    setShowCashDropDialog(false);
    setTimeout(() => setCashDropFeedback(null), 3000);
  };

  /**
   * The payment block for a reprint, rebuilt from the invoice's recorded tender rows.
   *
   * The backend returns `paymentSummary.allocations` — one entry per Payment row, the same
   * reconstruction the sales list and invoice screens use — so a reprinted receipt shows the
   * tenders that actually settled the sale rather than whatever the till holds now. Returns
   * null for a sale with no recorded tender (an unpaid credit invoice), where the renderer's
   * existing cash fallback still applies.
   */
  const buildReprintPaymentBlock = useCallback((reprintResult, full) => {
    const allocations = reprintResult?.paymentSummary?.allocations;
    if (!Array.isArray(allocations) || allocations.length === 0) return null;
    return buildPaymentBlockFromRecords(allocations, {
      invoiceTotal: Number(full?.invoiceTotal) || 0,
    });
  }, []);

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
    const timer = startPrintTimer(`reprint (${reprintPrintMode})`);
    try {
      const inv = reprintInvoices.find(i => i.invoiceNumber === reprintSelectedInvoice);
      if (inv?.id) {
        // reprintPosReceipt (not getSalesInvoiceById) both fetches the invoice AND
        // logs a RECEIPT_REPRINTED audit entry + bumps reprintCount/lastReprintedBy/At
        // server-side, so the Audit / Reprint History panel reflects reality.
        const reprintResult = await reprintPosReceipt(inv.id, {
          sessionId: currentSession?.id,
          terminalId: currentTerminal?.terminalId,
          branchId: currentTerminal?.branchId || currentSession?.branchId,
        });
        timer.mark("backend /reprint (invoice + audit)");
        const full = reprintResult.invoice;
        setReprintInvoices(prev => prev.map(i => i.id === inv.id
          ? { ...i, reprintCount: full.reprintCount, lastReprintedBy: full.lastReprintedBy, lastReprintedAt: full.lastReprintedAt }
          : i));
        const companyOptions = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
        if (reprintPrintMode === 'a4' || reprintPrintMode === 'pdf') {
          const template = resolveInvoiceA4TemplateFor(full);
          const data = buildPosPrintData(full, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(full) ? tplInvoiceHeader : tplReceiptHeader);
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
            // The tender breakdown is rebuilt from the recorded payments the backend returned,
            // never from the till's current state — a reprint has to show the Credit Voucher
            // (and every other leg) exactly as the original receipt did, whichever terminal or
            // day it is reprinted from.
            paymentBlock: buildReprintPaymentBlock(reprintResult, full),
            customerPhone: custRec?.phone,
            customerEmail: custRec?.email,
            customerTrn: custRec?.trn,
            customerAddress: custRec?.address,
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
          timer.mark("build ESC/POS + text");
          openCashDrawer('RECEIPT_PRINT');
          await printThermalReceiptWithConfiguredPrinter({
            full,
            text,
            escPosBase64,
            title: `Reprint ${full.invoiceNumber || reprintSelectedInvoice || ''}`.trim(),
          });
          timer.mark("send to printer");
        }
      }
      timer.end('ok');
    } catch (err) {
      timer.end('failed');
      console.warn('Reprint error', err);
      alert(`Reprint failed: ${err?.message || 'printer error'}.`);
    } finally {
      setReprintPrinting(false);
      setReprintConfirmOpen(false);
    }
  };

  const filteredProducts = posProducts;

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
                  {PAYMENT_FILTERS.map(m => <option key={m}>{m}</option>)}
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
            if (sessionBlockedByPreviousDay) {
              // Stranded on a previous Business Day: re-raise the one existing "Previous Day
              // Not Closed" flow (whose "Go to Close Session" routes to the closure screen)
              // rather than opening the selling screen the backend would refuse anyway.
              if (prevDayBlockedMsg) showPreviousDayBlock(prevDayBlockedMsg, prevDayBlockedSessionId);
              else setCurrentView('x-report');
            } else if (sessionAwaitingClosure) {
              // Mid-closure: the only way out is finishing the closure, so route back to
              // the X-Report / Close Session screen instead of the selling screen.
              setCurrentView('x-report');
            } else if (canContinueSelling) {
              setCurrentView('touch-screen');
            } else {
              setShowStartSessionDialog(true);
            }
          }}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className={`bg-gradient-to-r ${(sessionAwaitingClosure || sessionBlockedByPreviousDay) ? 'from-amber-500 to-amber-400' : 'from-[#F5C742] to-[#f4d673]'} p-4 rounded-lg`}>
                {posInitLoading ? (
                  <div className="h-8 w-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                ) : (sessionAwaitingClosure || sessionBlockedByPreviousDay) ? (
                  <Lock className="h-8 w-8 text-white" />
                ) : isSessionActive ? (
                  <Play className="h-8 w-8 text-white" />
                ) : (
                  <Unlock className="h-8 w-8 text-white" />
                )}
              </div>
              {sessionBlockedByPreviousDay ? (
                <Badge className="bg-amber-500">Closure Required</Badge>
              ) : sessionAwaitingClosure ? (
                <Badge className="bg-amber-500">Closing</Badge>
              ) : isSessionActive ? (
                <Badge className="bg-green-500">Active</Badge>
              ) : null}
            </div>
            <CardTitle className="mt-4">
              {posInitLoading ? 'Connecting...'
                : sessionBlockedByPreviousDay ? 'Previous Day Session Open'
                : sessionAwaitingClosure ? 'Session Closure Required'
                : isSessionActive ? 'Continue Session' : 'Start Session'}
            </CardTitle>
            <CardDescription>
              {posInitLoading ? 'Checking terminal & session status...'
                : sessionBlockedByPreviousDay
                  ? 'This session belongs to a previous business day. Close it before selling can continue.'
                : sessionAwaitingClosure
                  ? 'Closure has been started for this session. Complete the session closure before continuing sales.'
                  : isSessionActive
                    ? 'Resume your active POS session'
                    : 'Open cash drawer and start new session'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSessionActive && (
              <div className="text-sm space-y-1">
                <p className="text-gray-600">Opening Cash: {formatCurrency(currentSession.openingCash)}</p>
                <p className="text-gray-600">Started: {currentSession.openedAt ? parseUTCDate(currentSession.openedAt)?.toLocaleTimeString() : currentSession.startTime ? parseUTCDate(currentSession.startTime)?.toLocaleTimeString() : '—'}</p>
                {sessionAwaitingClosure && (
                  <>
                    <p className="text-amber-700 font-medium">Complete Session Closure</p>
                    <p className="text-gray-600">
                      Closure started by {currentSession.closingStartedBy || '—'}. Sales are locked until it is completed.
                    </p>
                    {/* Cancelling is a supervisor decision made through the backend, never a
                        casual button that silently unlocks selling. stopPropagation so it
                        doesn't also trigger the card's navigate-to-closure handler. */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openCancelClosureDialog(); }}
                      className="mt-1 text-xs underline text-slate-500 hover:text-slate-700"
                    >
                      Cancel Closure (supervisor)
                    </button>
                  </>
                )}
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
        // Authoritative Expected Cash, read as-is. There is deliberately no client-side
        // fallback formula: a second implementation is how the X and Z reports drifted
        // apart, and a fallback yields a plausible wrong number instead of an obvious gap.
        const statExpectedCash = Number(xSummary.expectedCash ?? 0);

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
    trn: effectiveOutletTrn,
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
  // Delegates to the shared, pure builder in utils/posReportViewModel.js so the live
  // POS screen and the back-office "POS Reports" historical viewer render identical
  // output from identical input — single implementation, never duplicated.
  const buildZReportViewModel = () => buildZReportViewModelShared(zReportData, {
    currency: activeCurrency,
    businessDate: zReportDate,
    terminalLabel: currentTerminal?.terminalId || 'All Terminals',
  });

  // ── Z-Report: Excel flat rows ─────────────────────────────────────────────

  // ── X-Report: build A4 view-model for print/PDF ───────────────────────────
  // Delegates to the shared, pure builder in utils/posReportViewModel.js so the live
  // POS screen and the back-office "POS Reports" historical viewer render identical
  // output from identical input — single implementation, never duplicated. Falls back
  // to currentSession while xReportData hasn't loaded yet (pre-existing behavior).
  const buildXReportViewModel = () => buildXReportViewModelShared(
    { ...xReportData, session: xReportData?.session || currentSession },
    {
      currency: activeCurrency,
      liveDenominations: getReportClosingDenominations(),
      liveCardBatchNo: xReportCardBatchNo,
      liveCardVerified: xReportCardVerified,
    }
  );

  // ── X-Report: Excel flat rows ─────────────────────────────────────────────

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
      trn: cp.trn || effectiveOutletTrn,
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
    const rows = buildZReportExcelSections(zReportData);
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
    printReportWithConfiguredPrinter(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sessionBusinessDay(sess) || '—' }, { label: 'Cashier', value: sess?.openedBy || '' }] });
  };

  const handleXReportPreview = () => {
    const vm = buildXReportViewModel();
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    const html = renderReportHtml(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sessionBusinessDay(sess) || '—' }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleXReportExportPDF = async () => {
    if (!(await assertXReportPrintable())) return;
    const vm = buildXReportViewModel();
    const cp = reportCompanyProfile();
    const sess = xReportData?.session || currentSession;
    // PDF export always uses the A4 template.
    const html = generateReportA4Html(vm, cp, { branch: cp.companyName, filters: [{ label: 'Date', value: sessionBusinessDay(sess) || '—' }, { label: 'Cashier', value: sess?.openedBy || '' }] });
    const filename = `X-Report_${sess?.id ? `SESS-${String(sess.id).padStart(6, '0')}` : new Date().toISOString().slice(0, 10)}`;
    try { await downloadPdfViaServer(html, filename); } catch {
      const { downloadPdf } = await import('../../utils/printGenerator');
      await downloadPdf(html, filename);
    }
  };

  const handleXReportExportExcel = async () => {
    if (!(await assertXReportPrintable())) return;
    const rows = buildXReportExcelRows({
      xReportData,
      currentSession,
      closingDenominations: getReportClosingDenominations(),
      xReportCardBatchNo,
      xReportCardVerified,
    });
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
      dateFrom: sessionBusinessDay(sess),
      dateTo: sessionBusinessDay(sess),
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
    // Backend-authoritative. The previous local sum omitted cash movements entirely, so it
    // hid every cash refund, drop and payout from the day's expected drawer position.
    const zExpectedCash = Number(zSummary.expectedCash ?? 0);
    const zSessionCount = zSummary.sessionCount ?? zSessions.length;
    // Consolidated Cash Position — additive, informational only (never feeds zExpectedCash above).
    const zCashPosition = zSummary.cashPosition || {};
    const zCpOpeningCash = Number(zCashPosition.openingCash ?? zOpeningCash);
    const zCpCashSales = Number(zCashPosition.cashSales ?? zCashSales);
    const zCpReceiptsTotal = Number(zCashPosition.customerReceiptsTotal ?? 0);
    const zCpAdvancesTotal = Number(zCashPosition.customerAdvancesTotal ?? 0);
    const zCpDropIn = Number(zCashPosition.cashDropIn ?? 0);
    const zCpDropOut = Number(zCashPosition.cashDropOut ?? 0);
    const zCpRefundsSupported = zCashPosition.cashRefundsSupported === true;
    // netCashPosition removed — see above.
    const zCpReceiptRows = Array.isArray(zCashPosition.customerReceiptRows) ? zCashPosition.customerReceiptRows : [];
    const zCpAdvanceRows = Array.isArray(zCashPosition.customerAdvanceRows) ? zCashPosition.customerAdvanceRows : [];
    const zCpDropRows = Array.isArray(zCashPosition.cashDropRows) ? zCashPosition.cashDropRows : [];

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
          onClick={() => { setRangeOverride({ startSessionId: '', endSessionId: '' }); setShowAdvancedRange(false); loadZReport(zReportDate); }}
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

    // Day Close review-screen summary: business date, auto-resolved (or supervisor-
    // adjusted) first/last session, total sessions, cashiers/counters/terminals,
    // trading time span, and session statuses — reviewed before Close Day is enabled.
    const allRangeSessions = [
      ...((daySummary?.sessions) || []),
      ...((daySummary?.excludedSessions) || []),
    ].sort((a, b) => new Date(a.openedAt || 0) - new Date(b.openedAt || 0));

    const sessionOptionLabel = (s) => {
      const time = s.openedAt ? new Date(s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
      return `${s.sessionNo || ('SESS-' + s.sessionId)} · ${s.cashier || '—'} · ${time} · ${s.status || ''}`;
    };

    const zrDaySummaryPanel = (
      <div className="bg-white border border-[#327F74]/20 rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2"><Lock className="h-4 w-4 text-[#327F74]" />Day Close Summary</h3>
          {daySummaryLoading && <span className="text-xs text-gray-400">Recalculating…</span>}
        </div>
        {!daySummary ? (
          <p className="text-xs text-gray-400">Generate the report to resolve the session range for this business date.</p>
        ) : daySummary.totalSessions === 0 ? (
          <p className="text-xs text-gray-500">No sessions found for this business date.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs mb-3">
              {[
                ['Business Date', daySummary.businessDate],
                ['First Session', daySummary.startSession ? sessionOptionLabel(daySummary.startSession) : '—'],
                ['Last Session', daySummary.endSession ? sessionOptionLabel(daySummary.endSession) : '—'],
                ['Total Sessions', String(daySummary.totalSessions)],
                ['Cashiers', (daySummary.cashiers || []).join(', ') || '—'],
                ['Terminals', (daySummary.terminals || []).join(', ') || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <span className="text-gray-400">{k}</span>
                  <span className="text-[#1E293B] font-medium truncate" title={String(v)}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-2">
              <span>Counters: <span className="text-[#1E293B]">{(daySummary.counters || []).join(', ') || '—'}</span></span>
              <span>Trading Span: <span className="text-[#1E293B]">
                {daySummary.tradingStart ? new Date(daySummary.tradingStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                {' – '}
                {daySummary.tradingEnd ? new Date(daySummary.tradingEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span></span>
              {daySummary.openSessionCount > 0 && (
                <span className="text-red-600 font-medium">{daySummary.openSessionCount} session(s) still OPEN</span>
              )}
              {daySummary.suspendedSessionCount > 0 && (
                <span className="text-red-600 font-medium">{daySummary.suspendedSessionCount} session(s) SUSPENDED — resume and close first</span>
              )}
            </div>
            {daySummary.excludedSessionCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex items-start gap-2 mb-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{daySummary.excludedSessionCount} eligible session(s) fall outside the selected range and will be excluded from this Day Close.</span>
              </div>
            )}

            {/* Advanced: supervisor-only session-range override, collapsed by default */}
            <div className="border-t border-[#327F74]/10 pt-2 mt-2">
              <button
                type="button"
                onClick={toggleAdvancedRange}
                className="text-xs text-[#327F74] flex items-center gap-1 hover:underline"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${showAdvancedRange ? 'rotate-90' : ''}`} />
                Advanced: Adjust Session Range {advancedRangeUnlocked ? '' : '(supervisor PIN required)'}
              </button>
              {showAdvancedRange && advancedRangeUnlocked && (
                <div className="flex flex-wrap items-end gap-3 mt-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">First Session</label>
                    <select
                      value={rangeOverride.startSessionId || ''}
                      onChange={e => applyRangeOverride({ ...rangeOverride, startSessionId: e.target.value })}
                      className="border border-[#327F74]/30 rounded px-2 py-1 text-xs text-[#1E293B] bg-white focus:outline-none"
                    >
                      <option value="">Auto (earliest)</option>
                      {allRangeSessions.map(s => (
                        <option key={s.sessionId} value={s.sessionId}>{sessionOptionLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Last Session</label>
                    <select
                      value={rangeOverride.endSessionId || ''}
                      onChange={e => applyRangeOverride({ ...rangeOverride, endSessionId: e.target.value })}
                      className="border border-[#327F74]/30 rounded px-2 py-1 text-xs text-[#1E293B] bg-white focus:outline-none"
                    >
                      <option value="">Auto (latest)</option>
                      {allRangeSessions.map(s => (
                        <option key={s.sessionId} value={s.sessionId}>{sessionOptionLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                  {(rangeOverride.startSessionId || rangeOverride.endSessionId) && (
                    <button type="button" onClick={resetRangeOverride} className="text-xs text-gray-500 hover:text-[#327F74] underline mb-1">
                      Reset to automatic
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );

    const renderZrInfoCard = () => (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Business Overview Card */}
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-6 py-5">
          <h2 className="text-base font-bold text-[#1E293B] mb-4 border-b border-[#327F74]/10 pb-2">Business Overview</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Business Date</span><span className="text-sm font-bold text-[#1E293B]">{zReportDate || new Date().toLocaleDateString()}</span></div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Business Status</span>
              <div>
                {zReportData?.isDayClosed ? (
                  <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center w-fit gap-1"><span className="h-2 w-2 rounded-full bg-gray-400"></span>DAY CLOSED</span>
                ) : isDayCloseBlocked ? (
                  <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center w-fit gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>OPEN</span>
                ) : (
                  <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center w-fit gap-1"><span className="h-2 w-2 rounded-full bg-amber-500"></span>READY FOR DAY CLOSE</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Generated Time</span><span className="text-sm font-bold text-[#1E293B]">{new Date().toLocaleTimeString()}</span></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Report Type</span><span className="text-sm font-bold text-[#1E293B]">Consolidated Z-Report</span></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Branch</span><span className="text-sm font-bold text-[#1E293B] truncate" title={zReportData?.branchName || currentTerminal?.branchName || '—'}>{zReportData?.branchName || currentTerminal?.branchName || '—'}</span></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Session Scope</span><span className="text-sm font-bold text-[#1E293B]">{zSessionCount ? `${zSessionCount} session(s)` : '—'}</span></div>
          </div>
        </div>

        {/* Store Operations Card */}
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-6 py-5">
          <h2 className="text-base font-bold text-[#1E293B] mb-4 border-b border-[#327F74]/10 pb-2">Store Operations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Sessions</span>
              <div className="flex flex-wrap gap-2 mt-0.5">
                <div className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-emerald-600 font-bold">OPEN</span><span className="text-xs font-bold text-emerald-700">{typeof daySummary !== 'undefined' && daySummary ? daySummary.openSessionCount || 0 : '—'}</span></div>
                <div className="bg-gray-50 border border-gray-200 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-gray-500 font-bold">CLOSED</span><span className="text-xs font-bold text-gray-700">{typeof daySummary !== 'undefined' && daySummary ? daySummary.closedSessionCount ?? zSessionCount : zSessionCount}</span></div>
                <div className="bg-amber-50 border border-amber-100 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-amber-600 font-bold">PENDING</span><span className="text-xs font-bold text-amber-700">{typeof daySummary !== 'undefined' && daySummary ? daySummary.suspendedSessionCount || 0 : '—'}</span></div>
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Terminals</span>
              <div className="flex flex-wrap gap-2 mt-0.5">
                <div className="bg-gray-50 border border-gray-200 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-gray-500 font-bold">CONFIGURED</span><span className="text-xs font-bold text-gray-700">—</span></div>
                <div className="bg-gray-50 border border-gray-200 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-gray-500 font-bold">ONLINE</span><span className="text-xs font-bold text-gray-700">—</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Cashiers</span><span className="text-sm font-bold text-[#1E293B]">—</span></div>
              <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Invoices</span><span className="text-sm font-bold text-[#1E293B]">{String(zInvoiceCount)}</span></div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Exceptions</span>
              <div className="flex flex-wrap gap-2 mt-0.5">
                <div className="bg-rose-50 border border-rose-100 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-rose-600 font-bold">RETURNS</span><span className="text-xs font-bold text-rose-700">{String(zSummary?.salesReturnCount || 0)}</span></div>
                <div className="bg-gray-50 border border-gray-200 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-gray-500 font-bold">VOIDS</span><span className="text-xs font-bold text-gray-700">—</span></div>
                <div className="bg-amber-50 border border-amber-100 px-2 py-1 rounded flex items-center gap-1.5"><span className="text-[9px] text-amber-600 font-bold">SUSPENDED</span><span className="text-xs font-bold text-amber-700">—</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    const BusinessAccordionGroup = ({ title, icon, description, sectionCount, defaultOpen = false, summaryContent, children }) => {
      const [isOpen, setIsOpen] = React.useState(defaultOpen);

      return (
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm mb-6 overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex flex-col md:flex-row md:items-center justify-between p-5 bg-[#F7F7FA] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 transition-colors text-left"
            aria-expanded={isOpen}
          >
            <div className="flex items-center gap-4 mb-3 md:mb-0">
              <div className="h-12 w-12 rounded-lg bg-white border border-[#327F74]/10 flex items-center justify-center text-[#327F74] shadow-sm shrink-0">
                {icon}
              </div>
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#1E293B] uppercase">{title}</h3>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 opacity-90">{description}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 self-start md:self-auto ml-16 md:ml-0">
              {summaryContent && (
                <div className="hidden lg:flex items-center gap-6 mr-4">
                  {summaryContent}
                </div>
              )}
              <span className="bg-[#327F74]/10 text-[#327F74] text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap">{sectionCount} Sections</span>
              <div className="text-gray-400 shrink-0">
                {isOpen ? <ChevronDown className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
              </div>
            </div>
          </button>
          {isOpen && (
            <div className="p-4 md:p-6 border-t border-[#327F74]/10 bg-white">
              {children}
            </div>
          )}
        </div>
      );
    };

    const zrKpiCards = (
      <div className="lg:sticky lg:top-0 lg:z-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 bg-gray-50/80 backdrop-blur-md py-4 border-b border-[#327F74]/10">
        {/* GROUP 1: SALES */}
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-5 py-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#327F74]/10">
            <div className="p-2.5 bg-[#327F74]/10 rounded-lg text-[#327F74]">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-semibold text-[#1E293B] uppercase">SALES</h2>
          </div>
          <div className="flex flex-col gap-3 flex-1 justify-end">
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Gross Sales</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zTotalSales} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Net Sales</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zSalesExTax} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Invoices</span><span className="text-sm font-bold text-[#1E293B]">{String(zInvoiceCount)}</span></div>
          </div>
        </div>

        {/* GROUP 2: PAYMENTS */}
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-5 py-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#327F74]/10">
            <div className="p-2.5 bg-[#327F74]/10 rounded-lg text-[#327F74]">
              <CreditCard className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-semibold text-[#1E293B] uppercase">PAYMENTS</h2>
          </div>
          <div className="flex flex-col gap-3 flex-1 justify-end">
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Cash</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zCashSales} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Card</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zCardSales} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Credit</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zCreditSales} /></span></div>
          </div>
        </div>

        {/* GROUP 3: CASH */}
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-5 py-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#327F74]/10">
            <div className="p-2.5 bg-[#327F74]/10 rounded-lg text-[#327F74]">
              <Wallet className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-semibold text-[#1E293B] uppercase">CASH</h2>
          </div>
          <div className="flex flex-col gap-3 flex-1 justify-end">
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Opening Cash</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zOpeningCash} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Expected Cash</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zExpectedCash} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Cash Variance</span><span className="text-sm font-bold text-[#1E293B]">—</span></div>
          </div>
        </div>

        {/* GROUP 4: COMPLIANCE */}
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-5 py-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#327F74]/10">
            <div className="p-2.5 bg-[#327F74]/10 rounded-lg text-[#327F74]">
              <Shield className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-semibold text-[#1E293B] uppercase">COMPLIANCE</h2>
          </div>
          <div className="flex flex-col gap-3 flex-1 justify-end">
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">VAT</span><span className="text-sm font-bold text-[#1E293B]"><CurrencyAmount amount={zTotalTax} /></span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Returns</span><span className="text-sm font-bold text-rose-600">{zSummary?.salesReturnTotal > 0 ? `(${formatCurrencyStr(zSummary.salesReturnTotal)})` : <CurrencyAmount amount={0} />}</span></div>
            <div className="flex justify-between items-center"><span className="text-xs text-gray-500 uppercase">Discount</span><span className="text-sm font-bold text-amber-600">{zTotalDiscount > 0 ? `(${formatCurrencyStr(zTotalDiscount)})` : <CurrencyAmount amount={0} />}</span></div>
          </div>
        </div>
      </div>
    );

    const ZRTable = ({ title, icon, cols, rows, footerRow, emptyMessage }) => (
      <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#327F74]/10 bg-[#F7F7FA]">
          <div className="flex items-center gap-2.5">
            <span className="text-[#327F74]">{icon}</span>
            <span className="text-sm font-semibold text-[#1E293B] uppercase">{title}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-[#F7F7FA] shadow-sm">
              <tr className="text-gray-500">
                {cols.map((c, i) => <th key={i} className={`px-6 py-3.5 text-left font-medium border-b border-[#327F74]/10 whitespace-nowrap ${i > 0 && cols.length > 2 ? 'text-right' : i === cols.length - 1 && cols.length === 2 ? 'text-right' : ''}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows && rows.length > 0 ? (
                rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-gray-50 hover:bg-[#327F74]/5 transition-colors">
                    {r.map((cell, ci) => <td key={ci} className={`px-6 py-4 text-[#1E293B] ${ri % 2 === 1 ? 'bg-gray-50/30' : ''} ${ci > 0 && cols.length > 2 ? 'text-right' : ci === cols.length - 1 && cols.length === 2 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
                  </tr>
                ))
              ) : emptyMessage ? (
                <tr>
                  <td colSpan={cols.length} className="px-6 py-8 text-center bg-gray-50/50">
                    <span className="text-gray-400 font-medium italic">{emptyMessage}</span>
                  </td>
                </tr>
              ) : null}
              {footerRow && (
                <tr className="bg-[#F7F7FA] border-t-2 border-[#327F74]/20">
                  {footerRow.map((cell, ci) => <td key={ci} className={`px-6 py-4 font-semibold text-[#1E293B] ${ci > 0 && cols.length > 2 ? 'text-right' : ci === cols.length - 1 && cols.length === 2 ? 'text-right' : ''}`}>{renderAED(cell)}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    // End-of-day gate: when the backend reports terminals still owing an X-Report
    const zReportBlocked = Array.isArray(zReportPending) && zReportPending.length > 0;
    
    // Global Day Close Validation Gate
    const isXReportsMissing = zReportBlocked;
    const isOpenSessions = (typeof daySummary !== 'undefined' && daySummary) ? (daySummary.openSessionCount > 0) : false;
    const isSuspendedBills = (typeof daySummary !== 'undefined' && daySummary) ? (daySummary.suspendedSessionCount > 0) : false;
    // A day with no sessions at all has nothing to close — the backend rejects
    // it outright, so the checklist must not report "ready" for this case.
    const isNoSessions = !daySummary || daySummary.totalSessions === 0;
    const isDayCloseBlocked = isXReportsMissing || isOpenSessions || isSuspendedBills || isNoSessions;

    /**
     * The cash-variance checklist row, derived from the backend reconciliation of the day's
     * frozen session snapshots.
     *
     * A day is "within limits" only when every drawer was counted AND the resulting variance is
     * within the branch threshold. An uncounted drawer fails rather than passing quietly:
     * nothing was verified, so nothing can be said to be within limits.
     */
    const cashVarianceChecklistItem = () => {
      const summary = zReportData?.summary || {};
      const status = summary.reconciliationStatus;
      const uncounted = Number(summary.uncountedSessionCount ?? 0);
      const variance = summary.cashVariance;

      if (uncounted > 0 || status === 'NOT_COUNTED' || variance === null || variance === undefined) {
        return {
          label: 'Cash Variance Within Limits',
          passed: false,
          info: uncounted > 0
            ? `${uncounted} session${uncounted === 1 ? '' : 's'} not counted`
            : 'No physical count recorded',
        };
      }
      const threshold = Number(posSettings?.cashVarianceThreshold ?? 0);
      const withinLimits = Math.abs(Number(variance)) <= threshold;
      return {
        label: 'Cash Variance Within Limits',
        passed: withinLimits,
        info: withinLimits ? undefined : `${status}: ${Number(variance).toFixed(2)}`,
      };
    };

    const renderValidationChecklist = () => {
      const checklist = [
        { label: 'All Sessions Closed', passed: !isOpenSessions },
        { label: 'X-Reports Generated', passed: !isXReportsMissing },
        { label: 'Draft Bills Cleared', passed: !isSuspendedBills },
        // Derived from the authoritative reconciliation, not asserted. A checklist item
        // that always passes trains operators to trust it, and this one covered the single
        // control that matters most: whether the money is actually there.
        cashVarianceChecklistItem(),
        { label: 'Business Date Ready', passed: !isDayCloseBlocked }
      ];

      const allPassed = !isDayCloseBlocked;

      const issues = [];
      if (isNoSessions) {
        issues.push({ title: 'No Sessions Found', desc: 'No POS sessions exist for this business date — there is nothing to close.' });
      }
      if (typeof daySummary !== 'undefined' && daySummary) {
        if (daySummary.openSessionCount > 0) {
          issues.push({ title: 'Open Sessions', desc: `${daySummary.openSessionCount} session(s) are still open and must be closed.` });
        }
        if (daySummary.suspendedSessionCount > 0) {
          issues.push({ title: 'Pending Draft Bills', desc: `${daySummary.suspendedSessionCount} suspended bill(s) found. Clear or void them.` });
        }
      }
      if (zReportBlocked) {
        issues.push({ title: 'Missing X-Reports', desc: `Some terminals are missing X-Reports.` });
      }

      return (
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-6 py-5 mb-6">
          <div className="flex items-center justify-between mb-4 border-b border-[#327F74]/10 pb-3">
            <h2 className="text-base font-bold text-[#1E293B]">Validation Checklist</h2>
            {allPassed ? (
              <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold px-3 py-1 rounded-full tracking-wide uppercase border border-emerald-200">
                <CheckCircle className="h-3.5 w-3.5" />
                Ready for Day Close
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-rose-50 text-rose-700 text-[11px] font-bold px-3 py-1 rounded-full tracking-wide uppercase border border-rose-200">
                <AlertCircle className="h-3.5 w-3.5" />
                Attention Required
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
            {checklist.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2.5">
                {item.passed ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                )}
                <span className={`text-[13px] tracking-wide ${item.passed ? 'text-[#1E293B]' : 'text-rose-600 font-bold'}`}>{item.label}</span>
                {item.info && <span className="text-[10px] text-gray-400 font-medium">({item.info})</span>}
              </div>
            ))}
          </div>

          {isNoSessions && (
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-5">
              <div className="text-[13px] text-slate-600">
                {pendingDayCloseDate ? (
                  <>
                    <span className="font-bold text-[#1E293B]">No pending Day Close.</span> The next business date with
                    activity is <span className="font-bold text-[#1E293B]">{pendingDayCloseDate}</span> — nothing to do
                    for {zReportDate} until sessions exist on it.
                  </>
                ) : (
                  <>
                    <span className="font-bold text-[#1E293B]">No pending Day Close.</span> No POS sessions have occurred
                    since the last close — calendar dates without activity never require operator action.
                  </>
                )}
              </div>
            </div>
          )}

          {!allPassed && issues.length > 0 && (() => {
            const blockingTerminals = [];
            
            // 1. Add all open sessions
            allRangeSessions.forEach(s => {
              if (s.status === 'OPEN') {
                blockingTerminals.push({
                  terminalId: s.terminalId,
                  terminalName: s.terminalName || s.terminalId || '—',
                  // buildSessionInfo() on the backend emits this as `counter`;
                  // other session payloads (history/X-Report) use `counterName`.
                  counter: s.counterName || s.counter || '—',
                  cashier: s.cashier || s.openedBy || '—',
                  sessionNo: s.sessionNo || (s.sessionId ? `SESS-${s.sessionId}` : '—'),
                  totalSales: s.totalSales ?? s.sessionSalesAmount ?? 0,
                  invoiceCount: s.invoiceCount ?? s.totalInvoices ?? 0,
                  status: 'OPEN',
                  session: { ...s, id: s.id || s.sessionId }
                });
              }
            });
            
            // 2. Add missing X-reports not already captured by open sessions
            (zReportPending || []).forEach(t => {
              if (!blockingTerminals.some(b => String(b.terminalId) === String(t.terminalId))) {
                // Find the latest session for this terminal (reverse chronological search)
                const matchingSession = [...allRangeSessions].reverse().find(s => String(s.terminalId) === String(t.terminalId) && s.status === 'CLOSED')
                                     || [...allRangeSessions].reverse().find(s => String(s.terminalId) === String(t.terminalId));
                                     
                blockingTerminals.push({
                  terminalId: t.terminalId,
                  terminalName: t.terminalName || matchingSession?.terminalName || t.terminalId || '—',
                  counter: t.counter || matchingSession?.counterName || matchingSession?.counter || '—',
                  cashier: t.openedBy || matchingSession?.cashier || matchingSession?.openedBy || '—',
                  sessionNo: matchingSession ? (matchingSession.sessionNo || (matchingSession.sessionId ? `SESS-${matchingSession.sessionId}` : '—')) : '—',
                  totalSales: matchingSession?.totalSales ?? matchingSession?.sessionSalesAmount ?? 0,
                  invoiceCount: matchingSession?.invoiceCount ?? matchingSession?.totalInvoices ?? 0,
                  status: 'MISSING X-REPORT',
                  session: matchingSession ? { ...matchingSession, id: matchingSession.id || matchingSession.sessionId } : matchingSession
                });
              }
            });

            return (
              <div className="bg-rose-50/50 border border-rose-200 rounded-lg p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <h3 className="text-[13px] font-bold text-rose-800 uppercase tracking-wide">Required Actions</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {issues.map((issue, idx) => (
                    <div key={idx} className="flex gap-2.5 bg-white p-3 rounded border border-rose-100">
                      <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold text-rose-700">{issue.title}</span>
                        <span className="text-[11px] text-rose-600/80 mt-1 leading-relaxed">{issue.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Restored Day Close Blocking Details Grid */}
                {blockingTerminals.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                    {blockingTerminals.map((bt, i) => (
                      <div key={i} className="bg-white border border-rose-200/60 rounded-xl overflow-hidden shadow-sm flex flex-col">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-slate-500" />
                            <span className="font-bold text-slate-800 text-sm">{bt.terminalName}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                            bt.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {bt.status}
                          </span>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-4 flex-1">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Cashier</p>
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span className="truncate">{bt.cashier}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Counter</p>
                            <p className="text-sm font-medium text-slate-700 truncate">{bt.counter}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Session No.</p>
                            <p className="text-sm font-medium text-slate-700 font-mono text-xs truncate">{bt.sessionNo}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Sales / Invoices</p>
                            <p className="text-sm font-bold text-slate-700">
                              {formatCurrency(bt.totalSales || 0)} <span className="text-slate-400 font-medium ml-0.5">({bt.invoiceCount || 0})</span>
                            </p>
                          </div>
                        </div>
                        <div className="p-3 border-t border-gray-50 bg-gray-50/50 relative">
                          <button
                            onClick={() => {
                              if (openSessionDropdownId === bt.terminalId) {
                                setOpenSessionDropdownId(null);
                              } else {
                                setOpenSessionDropdownId(bt.terminalId);
                              }
                            }}
                            className="w-full py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            Close Session <ChevronDown className="h-3 w-3 text-slate-400" />
                          </button>
                          
                          {openSessionDropdownId === bt.terminalId && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenSessionDropdownId(null)}></div>
                              <div className="absolute left-3 right-3 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden text-sm">
                                <button
                                  onClick={() => {
                                    setOpenSessionDropdownId(null);
                                    if (bt.session) {
                                      setSessionToClose(bt.session);
                                      setClosureAction('NORMAL_CLOSE');
                                      handleDayCloseNormalClose(bt.session);
                                    }
                                  }}
                                  className="w-full px-4 py-2 text-left hover:bg-slate-50 transition-colors border-b border-gray-100 flex flex-col"
                                >
                                  <span className="text-slate-700 font-semibold text-[13px]">Close Session</span>
                                  <span className="text-[10px] text-slate-400 font-medium leading-tight">Normal session closure</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenSessionDropdownId(null);
                                    if (bt.session) {
                                      setSessionToClose(bt.session);
                                      setClosureAction('FORCE_CLOSE');
                                      closureAuthGrantRef.current = null;
                                      forceCloseContextRef.current = null;
                                      setForceCloseReason('');
                                      setForceCloseAuditAcknowledged(false);
                                      requestApproval({
                                        supervisorAction: { type: 'FORCE_CLOSE_SESSION' },
                                        resetEmail: true,
                                      });
                                    }
                                  }}
                                  className="w-full px-4 py-2 text-left hover:bg-orange-50 transition-colors flex flex-col group"
                                >
                                  <span className="text-orange-600 font-semibold text-[13px] group-hover:text-orange-700 transition-colors">Force Close</span>
                                  <span className="text-[10px] text-orange-400/80 font-medium leading-tight">Supervisor authorization</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );
    };

    const renderDayCloseProgress = () => {
      const steps = [
        'Business Open',
        'Trading Complete',
        'Sessions Closed',
        'Validation Passed',
        'Financial Review',
        'Ready For Day Close',
        'Business Closed'
      ];

      let activeStepIndex = 0;
      const isOpenSessions = (typeof daySummary !== 'undefined' && daySummary) ? (daySummary.openSessionCount > 0) : false;
      const isSuspendedBills = (typeof daySummary !== 'undefined' && daySummary) ? (daySummary.suspendedSessionCount > 0) : false;

      if (zReportData?.isDayClosed) {
        activeStepIndex = 6;
      } else {
        activeStepIndex = 1;
        if (!zReportBlocked) {
          activeStepIndex = 2;
          if (!isOpenSessions) {
            activeStepIndex = 3;
            if (!isSuspendedBills) {
              activeStepIndex = 4;
            }
          }
        }
      }

      return (
        <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm px-6 py-6 mb-6 overflow-x-auto">
          <div className="flex min-w-[750px] justify-between">
            {steps.map((step, idx) => {
              const isCompleted = idx < activeStepIndex;
              const isActive = idx === activeStepIndex;
              const isLast = idx === steps.length - 1;
              return (
                <div key={idx} className={`relative flex flex-col items-center ${isLast ? '' : 'flex-1'}`}>
                  {/* Line */}
                  {!isLast && (
                    <div className={`absolute top-2.5 left-[50%] w-full h-0.5 ${isCompleted ? 'bg-emerald-500' : 'bg-gray-200'} z-0`}></div>
                  )}
                  {/* Step Item */}
                  <div className="flex flex-col items-center relative z-[1]">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center border-2 mb-2 bg-white transition-colors ${
                      isCompleted ? 'border-emerald-500 bg-emerald-500 text-white' : 
                      isActive ? 'border-[#327F74] bg-white text-[#327F74] shadow-sm' : 
                      'border-gray-200 bg-gray-50'
                    }`}>
                      {isCompleted ? <CheckCircle className="h-3 w-3" /> : <div className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-[#327F74]' : 'bg-transparent'}`}></div>}
                    </div>
                    <span className={`text-[10px] font-bold uppercase text-center max-w-[100px] whitespace-nowrap leading-none ${
                      isCompleted ? 'text-emerald-700' : isActive ? 'text-[#1E293B]' : 'text-gray-400'
                    }`}>
                      {step}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="bg-[#F7F7FA] min-h-full p-4 lg:p-6">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 bg-[#F7F7FA] pt-1 pb-3 border-b border-[#327F74]/10 mb-4">
          <div className="flex flex-wrap items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-0.5">
                <span className="hover:text-[#327F74] cursor-pointer" onClick={() => setCurrentView('dashboard')}>Dashboard</span>
                <ChevronRight className="h-3 w-3" />
                <span>POS</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-[#327F74]">Day Close Management</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1E293B]">Day Close Management</h1>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl">Manage the complete end-of-business-day closing process, review financial summaries, validate sessions and finalize the business date.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-[#327F74]/20 p-1 rounded-lg shadow-sm">
                <select value={reportPrintMode} onChange={e => setReportPrintMode(e.target.value)} title="Print / preview format" className="border border-transparent hover:border-[#327F74]/20 text-[#327F74] font-medium text-xs px-2 py-2 rounded focus:outline-none transition-colors">
                  <option value="a4">A4</option>
                  <option value="80mm">Thermal 80mm</option>
                  <option value="58mm">Thermal 58mm</option>
                </select>
                <div className="w-px h-5 bg-gray-200 mx-1"></div>
                <button onClick={handleZReportPreview} disabled={!zReportData} className="text-[#327F74] font-medium text-xs px-3 py-2 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1.5 transition-colors"><Eye className="h-4 w-4" />Preview</button>
                <button onClick={handleZReportPrint} disabled={!zReportData || !zReportData?.isDayClosed} title={zReportData && !zReportData?.isDayClosed ? 'Close the business day first to print the Z-Report.' : undefined} className="text-[#327F74] font-medium text-xs px-3 py-2 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1.5 transition-colors"><Printer className="h-4 w-4" />Print</button>
                <button onClick={handleZReportExportPDF} disabled={!zReportData || !zReportData?.isDayClosed} title={zReportData && !zReportData?.isDayClosed ? 'Close the business day first to export the Z-Report.' : undefined} className="text-[#327F74] font-medium text-xs px-3 py-2 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1.5 transition-colors"><FileText className="h-4 w-4" />Export PDF</button>
                <button onClick={handleZReportExportExcel} disabled={!zReportData || !zReportData?.isDayClosed} title={zReportData && !zReportData?.isDayClosed ? 'Close the business day first to export the Z-Report.' : undefined} className="text-[#327F74] font-medium text-xs px-3 py-2 rounded hover:bg-[#327F74]/5 disabled:opacity-40 flex items-center gap-1.5 transition-colors"><Download className="h-4 w-4" />Export Excel</button>
              </div>

              <button
                onClick={() => { if (window.confirm(`Close business day ${zReportDate}? This will finalize all sessions for the day.`)) handleCloseDay(); }}
                disabled={zReportLoading || !zReportData || zReportData?.isDayClosed || isDayCloseBlocked}
                title={isDayCloseBlocked ? "Resolve all pending actions in the Validation Checklist before closing the day." : undefined}
                className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed text-[#1E293B] font-bold shadow-sm text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all">
                <Lock className="h-4 w-4" />{zReportData?.isDayClosed ? 'Day Closed' : 'Close Day'}
              </button>
            </div>
          </div>
        </div>

        {zrFilterBar}
        {!zReportData?.isDayClosed && zrDaySummaryPanel}

        {zReportData?.isDayClosed && (
          <div className="bg-yellow-50 text-yellow-800 p-3 mb-4 rounded border border-yellow-200 flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" />
            This business day has been officially closed. Showing finalized snapshot.
          </div>
        )}

        {renderZrInfoCard()}
        {renderValidationChecklist()}
        {renderDayCloseProgress()}

        {isDayCloseBlocked ? null : (<>
          {zrKpiCards}

          <BusinessAccordionGroup
            title="Sales Performance"
            icon={<TrendingUp className="h-6 w-6" />}
            description="Sales performance, invoices and revenue"
            sectionCount={2}
            defaultOpen={true}
            summaryContent={
              <>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Gross Sales</span><span className="text-[13px] font-bold text-[#1E293B]"><CurrencyAmount amount={zTotalSales} /></span></div>
              </>
            }
          >
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

          </BusinessAccordionGroup>

          <BusinessAccordionGroup
            title="Payments & Cash"
            icon={<Wallet className="h-6 w-6" />}
            description="Tenders, cash drawer and bank settlements"
            sectionCount={5}
            defaultOpen={false}
            summaryContent={
              <>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Cash</span><span className="text-[13px] font-bold text-[#1E293B]"><CurrencyAmount amount={zCashSales} /></span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Card</span><span className="text-[13px] font-bold text-[#1E293B]"><CurrencyAmount amount={zCardSales} /></span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Tender Count</span><span className="text-[13px] font-bold text-[#1E293B]">{String(zInvoiceCount)}</span></div>
              </>
            }
          >
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
              /* Memo rows — a SUBSET of the tender rows above, not additional money. Tender is
                 attributed to the drawer that collected it, so a credit customer settling an
                 August invoice at a September till appears in Cash/Card/Online above while its
                 sale was recognised in August. Surfacing the amount here is what explains the
                 gap between Total Collected and the day's sales without it reading as an error. */
              ...((zSummary.earlierInvoiceCollections ?? 0) > 0
                ? [['of which: settling earlier invoices', zSummary.earlierInvoiceCollectionCount ?? '—', <CurrencyAmount key="z3e" amount={zSummary.earlierInvoiceCollections} />]]
                : []),
              ...((zSummary.advanceCollections ?? 0) > 0
                ? [['of which: customer advances', zSummary.advanceCollectionCount ?? '—', <CurrencyAmount key="z3a" amount={zSummary.advanceCollections} />]]
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

          {/* Section 4a: Consolidated Cash Position — additive, informational only */}
          <ZRTable
            title="4a. Consolidated Cash Position (Informational)"
            icon={<Banknote className="h-4 w-4" />}
            cols={['Description', 'Amount']}
            rows={[
              ['Opening Cash', <CurrencyAmount key="z4aoc" amount={zCpOpeningCash} />],
              ['Cash Sales', <CurrencyAmount key="z4acs" amount={zCpCashSales} />],
              ['Customer Receipts (Cash)', <CurrencyAmount key="z4acr" amount={zCpReceiptsTotal} />],
              ['Customer Advances (Cash)', <CurrencyAmount key="z4aca" amount={zCpAdvancesTotal} />],
              ['Cash Drop In', <CurrencyAmount key="z4adi" amount={zCpDropIn} />],
              ['Cash Refunds (Cash)', zCpRefundsSupported ? <CurrencyAmount key="z4arf" amount={zCashPosition.cashRefundsTotal ?? 0} /> : <span key="z4arfn" className="text-gray-400 italic">Not available — refund payment mode not tracked</span>],
              ['Cash Drop Out', zCpDropOut > 0 ? `(${formatCurrencyStr(zCpDropOut)})` : <CurrencyAmount key="z4ado" amount={0} />],
            ]}
            footerRow={['Back-office cash is excluded from drawer reconciliation', '']}
          />

          {/* Section 4b: Customer Receipts detail */}
          <ZRTable
            title="4b. Customer Receipts"
            icon={<Banknote className="h-4 w-4" />}
            cols={['Sl No', 'Customer Name', 'Received By', 'Received Amount']}
            rows={zCpReceiptRows.length ? zCpReceiptRows.map(r => [String(r.slNo ?? ''), r.customerName || '—', r.receivedBy || '—', <CurrencyAmount key={`z4brow-${r.slNo}`} amount={r.receivedAmount ?? 0} />]) : []}
            emptyMessage="— No customer receipts recorded"
            footerRow={['', '', 'Total', <CurrencyAmount key="z4bt" amount={zCpReceiptsTotal} />]}
          />

          {/* Section 4c: Customer Advances detail */}
          <ZRTable
            title="4c. Customer Advances"
            icon={<Banknote className="h-4 w-4" />}
            cols={['Sl No', 'Customer Name', 'Paid By', 'Paid Amount']}
            rows={zCpAdvanceRows.length ? zCpAdvanceRows.map(r => [String(r.slNo ?? ''), r.customerName || '—', r.paidBy || '—', <CurrencyAmount key={`z4crow-${r.slNo}`} amount={r.paidAmount ?? 0} />]) : []}
            emptyMessage="— No customer advances recorded"
            footerRow={['', '', 'Total', <CurrencyAmount key="z4ct" amount={zCpAdvancesTotal} />]}
          />

          {/* Section 4d: Cash Drop / Cash Out detail */}
          <ZRTable
            title="4d. Cash Drop / Cash Out"
            icon={<Banknote className="h-4 w-4" />}
            cols={['Sl No', 'Type', 'Amount']}
            rows={zCpDropRows.length ? zCpDropRows.map(r => [String(r.slNo ?? ''), r.type || '—', <CurrencyAmount key={`z4drow-${r.slNo}`} amount={r.amount ?? 0} />]) : []}
            emptyMessage="— No cash drops recorded"
            footerRow={['', 'Total', <CurrencyAmount key="z4dt" amount={zCpDropIn - zCpDropOut} />]}
          />

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

          </BusinessAccordionGroup>

          <BusinessAccordionGroup
            title="Tax & Compliance"
            icon={<Shield className="h-6 w-6" />}
            description="VAT, returns, refunds and discounts"
            sectionCount={3}
            defaultOpen={false}
            summaryContent={
              <>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">VAT</span><span className="text-[13px] font-bold text-[#1E293B]"><CurrencyAmount amount={zTotalTax} /></span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Returns</span><span className="text-[13px] font-bold text-rose-600">{zSummary?.salesReturnTotal > 0 ? `(${formatCurrencyStr(zSummary.salesReturnTotal)})` : <CurrencyAmount amount={0} />}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Discount</span><span className="text-[13px] font-bold text-amber-600">{zTotalDiscount > 0 ? `(${formatCurrencyStr(zTotalDiscount)})` : <CurrencyAmount amount={0} />}</span></div>
              </>
            }
          >
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

          </BusinessAccordionGroup>

          <BusinessAccordionGroup
            title="Productivity"
            icon={<Users className="h-6 w-6" />}
            description="Item movement, cashier shifts and credit"
            sectionCount={4}
            defaultOpen={false}
            summaryContent={
              <>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Invoices</span><span className="text-[13px] font-bold text-[#1E293B]">{String(zInvoiceCount)}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Cashiers</span><span className="text-[13px] font-bold text-[#1E293B]">{String(zSessionCount)}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Items</span><span className="text-[13px] font-bold text-[#1E293B]">{String(zSummary?.totalItemsSold ?? 0)}</span></div>
              </>
            }
          >
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
          cash/card/credit split from the recorded tender rows (sales_payments), so a sale
          settled Cash+Card contributes to both columns for the amount each tender took.
          Aggregating the tender rather than any mode label is what makes this reconcile
          exactly with the tender block above. */}
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
                rows={cashierRows}
                emptyMessage="— No cashier activity recorded"
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

          </BusinessAccordionGroup>

          <BusinessAccordionGroup
            title="Day Close"
            icon={<Lock className="h-6 w-6" />}
            description="Final declaration, verification and system notes"
            sectionCount={3}
            defaultOpen={true}
            summaryContent={
              <>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Business Status</span><span className="text-[13px] font-bold text-[#1E293B]">{zReportData?.isDayClosed ? 'CLOSED' : 'OPEN'}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Ready For Close</span><span className="text-[13px] font-bold text-[#1E293B]">{!isDayCloseBlocked ? 'YES' : 'NO'}</span></div>
                {zReportData?.isDayClosed && <div className="flex flex-col"><span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Z-Report #</span><span className="text-[13px] font-bold text-[#1E293B]">{`ZR-${String(zReportData?.sessions?.[0]?.id ?? '0').padStart(9, '0')}`}</span></div>}
              </>
            }
          >
          {/* Section 13: Final Day Close Summary */}
          {(() => {
            const zId = zReportData?.sessions?.[0]?.id;
            const reportNo = zId ? `ZR-${String(zId).padStart(9, '0')}` : `ZR-${zReportDate?.replace(/-/g, '')}-001`;
            const totalExpectedCash = Number(zSummary.expectedCash ?? 0);
            return (
              <div className="bg-[#1E293B] border border-[#327F74]/40 rounded-xl shadow-md p-6 mb-6">
                <div className="flex items-center justify-between mb-5 border-b border-gray-700/50 pb-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-[#F5C742]" />
                    <span className="text-[16px] font-bold uppercase tracking-wide text-white">Final Day Close Summary</span>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider bg-[#F5C742] text-[#1E293B] px-3 py-1 rounded-full">Z-Report #{reportNo}</span>
                </div>
                
                <div className="flex flex-wrap gap-x-8 gap-y-4 mb-6 border-b border-gray-700/50 pb-5">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Business Date</span>
                    <span className="text-[13px] font-medium text-white">{zReportDate ? new Date(zReportDate).toLocaleDateString('en-GB') : '—'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Branch</span>
                    <span className="text-[13px] font-medium text-white">{zReportData?.branchName || 'Main Branch'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status</span>
                    <span className="text-[13px] font-medium text-[#F5C742]">{zReportData?.isDayClosed ? 'CLOSED' : 'PENDING'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Generated</span>
                    <span className="text-[13px] font-medium text-white">{new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    ['Total Net Sales Inc. VAT', <CurrencyAmount key="z13a" amount={zTotalSales} />, 'text-[#F5C742]', 'bg-[#F5C742]/10 border-[#F5C742]/20'],
                    ['Total Discount', <CurrencyAmount key="z13b" amount={zTotalDiscount} />, 'text-red-400', 'bg-red-400/10 border-red-400/20'],
                    ['Total Collection', <CurrencyAmount key="z13c" amount={zTotalSales} />, 'text-[#F5C742]', 'bg-[#F5C742]/10 border-[#F5C742]/20'],
                    ['Opening Cash / Float', <CurrencyAmount key="z13d" amount={zOpeningCash} />, 'text-white', 'bg-white/5 border-white/10'],
                    ['Expected Cash in Drawer', <CurrencyAmount key="z13e" amount={totalExpectedCash} />, 'text-white', 'bg-white/5 border-white/10'],
                    ['Cash Sales', <CurrencyAmount key="z13f" amount={zCashSales} />, 'text-emerald-400', 'bg-emerald-400/10 border-emerald-400/20'],
                  ].map(([l, v, c, bg]) => (
                    <div key={l} className={`border rounded-lg p-3 ${bg}`}>
                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{l}</div>
                      <div className={`text-[16px] font-bold ${c}`}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Declaration & Verification */}
          <div className="bg-white border border-[#327F74]/20 rounded-xl shadow-sm mb-6 p-6">
            <div className="flex items-center gap-2 mb-4 border-b border-[#327F74]/10 pb-3">
              <Shield className="h-5 w-5 text-[#327F74]" />
              <span className="text-[14px] font-bold uppercase tracking-wide text-[#1E293B]">Declaration &amp; Verification</span>
            </div>
            <p className="text-[13px] text-gray-600 mb-6 bg-[#F7F7FA] rounded-lg p-4 border-l-4 border-[#327F74] leading-relaxed">
              I confirm that the above sales, collections, returns, and cash drawer details have been verified and closed for the selected business date / shift.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500 block mb-2">Cashier Signature</label>
                <div className="border border-[#327F74]/30 rounded-lg h-24 bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400 border-dashed">Sign here</div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500 block mb-2">Supervisor / Manager Signature</label>
                <div className="border border-[#327F74]/30 rounded-lg h-24 bg-[#F7F7FA] flex items-center justify-center text-xs text-gray-400 border-dashed">Sign here</div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500 block mb-2">Closing Remarks</label>
                <textarea className="w-full border border-[#327F74]/30 rounded-lg h-24 bg-[#F7F7FA] text-[13px] p-3 text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/50 transition-shadow" placeholder="Enter remarks..." />
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
          </BusinessAccordionGroup>
        </>)}
      </div>
    );
  };

  // X-Report View (Session Close Report)
  const renderXReport = () => {
    const denomKeys = DENOM_KEYS;
    const denomLabels = DENOM_LABELS;
    const reportDenominations = getReportClosingDenominations();
    const actualCash = calculateDenominationTotal(reportDenominations);
    // Once closed, reportDenominations comes from the immutable backend snapshot and
    // ignores further local edits — disable the inputs so they can't be edited with
    // no visible effect.
    // The X-Report can be opened for another terminal's session (Day Close →
    // Close Session), in which case `currentSession` is unrelated (or null).
    // Every status gate on this screen must follow the session actually being
    // reported on, not this terminal's own session.
    const xReportSession = sessionToClose || currentSession;
    const xReportSessionStatus = (xReportData?.session?.status || xReportSession?.status || 'OPEN').toUpperCase();
    const isSessionClosed = xReportSessionStatus === 'CLOSED';
    const canCloseSession = xReportSessionStatus === 'OPEN' || xReportSessionStatus === 'ACTIVE';

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
    const expectedCashVal = Number(xSummary.expectedCash ?? 0);
    // Consolidated Cash Position — additive, informational only (never feeds expectedCashVal above).
    // X-Report never includes Customer Receipts/Advances (back-office vouchers, no session linkage yet).
    const xCashPosition = xSummary.cashPosition || {};
    const xCpDropRows = Array.isArray(xCashPosition.cashDropRows) ? xCashPosition.cashDropRows : [];
    const xCpRefundsSupported = xCashPosition.cashRefundsSupported === true;
    // netCashPosition removed — back-office cash is reported beside drawer reconciliation,
    // never summed into it.

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
              <button onClick={() => { setShowXReportHistory(true); searchXReportHistory(); }} className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><Calendar className="h-3 w-3" />History</button>
              <button onClick={loadXReport} disabled={xReportLoading} className="border border-[#327F74]/40 text-[#327F74] text-xs px-3 py-1.5 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-50">
                {xReportLoading ? <><div className="w-3 h-3 border-2 border-[#327F74] border-t-transparent rounded-full animate-spin" />Loading...</> : <><FileBarChart className="h-3 w-3" />Generate X-Report</>}
              </button>
              <button
                onClick={proceedToCloseSessionDialog}
                disabled={!canCloseSession}
                className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-4 py-1.5 rounded flex items-center gap-1">
                <Lock className="h-3 w-3" />{isSessionClosed ? 'Session Closed' : 'Close Session'}
              </button>
            </div>
          </div>
          {/* Status strip */}
          {(() => {
            const sessStatus = xReportSessionStatus;
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

        {viewingHistoricalXReport && (
          <div className="mx-6 mt-3 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <span className="text-xs text-amber-700 flex items-center gap-1"><Calendar className="h-3 w-3" />Viewing a historical session's X-Report (read-only)</span>
            <button onClick={returnToCurrentSessionXReport} className="text-xs text-amber-800 font-semibold hover:underline">Back to Current Session</button>
          </div>
        )}

        <div className="p-6 flex-1">
          {/* Filter / Session Info Bar */}
          {(() => {
            const sess = xReportData?.session || currentSession;
            const sessionNo = sess?.id ? `SESS-${String(sess.id).padStart(9, '0')}` : '—';
            // The SESSION's own Business/Trading Date — never the currently resolved
            // Business Day. This screen is about the selected session, so viewing a
            // 2026-08-10 session on 2026-08-11 must still read 2026-08-10.
            const businessDate = resolveSessionBusinessDate(xReportData, currentSession) || '';
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
                  ['Business Date', resolveSessionBusinessDate(xReportData, currentSession) || '—'],
                  ['Cashier', xReportData?.session?.openedBy || currentSession?.openedBy || '—'],
                  ['Opened At', xReportData?.session?.openedAt ? parseUTCDate(xReportData.session.openedAt)?.toLocaleTimeString() : currentSession?.openedAt ? parseUTCDate(currentSession.openedAt)?.toLocaleTimeString() : '—'],
                  ['Status', xReportData?.session?.status || xReportSession?.status || 'OPEN'],
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

              {/* Section 2a: Consolidated Cash Position — additive, informational only */}
              <XRTable
                title="2a. Consolidated Cash Position (Informational)"
                icon={<Banknote className="h-4 w-4" />}
                cols={['Description', 'Amount']}
                rows={[
                  ['Opening Cash', <CurrencyAmount key="xcpoc" amount={openingCashVal} />],
                  ['Cash Sales', <CurrencyAmount key="xcpcs" amount={cashSales} />],
                  ['Customer Receipts (Cash)', <span key="xcpcrn" className="text-gray-400 italic">Not available in X-Report</span>],
                  ['Customer Advances (Cash)', <span key="xcpcan" className="text-gray-400 italic">Not available in X-Report</span>],
                  ['Cash Drop In', <CurrencyAmount key="xcpdi" amount={cashDropIn} />],
                  ['Cash Refunds (Cash)', xCpRefundsSupported ? <CurrencyAmount key="xcprf" amount={xCashPosition.cashRefundsTotal ?? 0} /> : <span key="xcprfn" className="text-gray-400 italic">Not available — refund payment mode not tracked</span>],
                  ['Cash Drop Out', cashDropOut > 0 ? `(${formatCurrencyStr(cashDropOut)})` : <CurrencyAmount key="xcpdo" amount={0} />],
                ]}
                footerRow={['Back-office cash is excluded from drawer reconciliation', '']}
                highlightLast
              />

              {/* Section 2b: Cash Drop / Cash Out detail */}
              <XRTable
                title="2b. Cash Drop / Cash Out"
                icon={<Banknote className="h-4 w-4" />}
                cols={['Sl No', 'Type', 'Amount']}
                rows={xCpDropRows.length
                  ? xCpDropRows.map(r => [String(r.slNo ?? ''), r.type || '—', <CurrencyAmount key={`xcpdrow-${r.slNo}`} amount={r.amount ?? 0} />])
                  : [['—', 'No cash drops recorded', <CurrencyAmount key="xcpdempty" amount={0} />]]}
                footerRow={['', 'Total', <CurrencyAmount key="xcpdt" amount={cashDropIn - cashDropOut} />]}
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
                    const sessionStatusNow = xReportSessionStatus;
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
                        <input
                          value={xReportCardBatchNo}
                          onChange={e => setXReportCardBatchNo(e.target.value)}
                          placeholder="BATCH-001"
                          disabled={isSessionClosed}
                          title={isSessionClosed ? 'Session is closed — settlement details are locked.' : undefined}
                          className="border border-[#327F74]/30 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-[#327F74] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Card Settlement Verified:</label>
                        <button
                          onClick={() => setXReportCardVerified(!xReportCardVerified)}
                          disabled={isSessionClosed}
                          title={isSessionClosed ? 'Session is closed — settlement details are locked.' : undefined}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${xReportCardVerified ? 'bg-[#327F74]' : 'bg-gray-200'}`}
                        >
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
              <button onClick={proceedToCloseSessionDialog} disabled={!canCloseSession} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs px-4 py-2 rounded flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Submit for Approval</button>
            ) : (
              <button onClick={proceedToCloseSessionDialog} disabled={!canCloseSession} className="border border-[#327F74]/40 text-[#327F74] disabled:opacity-50 text-xs px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1"><FileBarChart className="h-3 w-3" />Submit for Approval</button>
            )}
            <button
              onClick={proceedToCloseSessionDialog}
              disabled={!canCloseSession}
              className="bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-50 text-[#1E293B] text-xs px-5 py-2 rounded flex items-center gap-1">
              <Lock className="h-3 w-3" />{isSessionClosed ? 'Session Closed' : 'Close Session'}
            </button>
          </div>
        </div>

        {/* ─── X-REPORT HISTORY PICKER ─── */}
        {showXReportHistory && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-2 sm:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-100 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2"><Calendar className="h-4 w-4 text-[#327F74]" />X-Report History</h3>
                <button onClick={() => setShowXReportHistory(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-5 space-y-3 overflow-y-auto">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">From</label>
                    <input type="date" value={xHistoryDateFrom} onChange={e => setXHistoryDateFrom(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">To</label>
                    <input type="date" value={xHistoryDateTo} onChange={e => setXHistoryDateTo(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1.5 text-xs" />
                  </div>
                  <button onClick={searchXReportHistory} disabled={xHistoryLoading}
                    className="bg-[#327F74] hover:bg-[#286660] text-white text-xs px-4 py-2 rounded flex items-center gap-1 disabled:opacity-50">
                    <Search className="h-3 w-3" />{xHistoryLoading ? 'Searching…' : 'Search'}
                  </button>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {xHistoryResults.length === 0 && !xHistoryLoading && (
                    <p className="text-xs text-slate-400 text-center py-6">No closed sessions found in this date range.</p>
                  )}
                  {xHistoryResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => loadHistoricalXReport(s.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-all"
                    >
                      <div className="w-9 h-9 bg-[#327F74]/10 text-[#327F74] rounded-lg flex items-center justify-center shrink-0">
                        <FileBarChart className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {s.counterName || 'Counter'} · {s.terminalName || s.terminalId}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />{s.openedBy}
                          <span className="text-slate-300">•</span>
                          <Clock className="h-3 w-3" />{s.closedAt ? new Date(s.closedAt).toLocaleString() : (s.openedAt ? new Date(s.openedAt).toLocaleDateString() : '—')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Customer Management View — see POS/CustomerView.jsx

  const consoleProps = {
    currentTerminal, setCurrentTerminal, setTerminalsLoading, setTerminalList, setEditingTerminalId, setEditTerminalName, setEditCounterName, setTerminalSaving, editTerminalName, editCounterName, terminalList,
    setCurrentView, consoleTab, setConsoleTab, settingsSaving, setSettingsSaving, posSettings, setPosSettings, settingsSavedFlash, setSettingsSavedFlash,
    tplOutletName, setTplOutletName, tplOutletTrn, setTplOutletTrn, tplOutletAddress, setTplOutletAddress, tplOutletPhone, setTplOutletPhone, effectiveOutletTrn,
    tplLogoDataUrl, setTplLogoDataUrl, tplStampDataUrl, setTplStampDataUrl,
    tplReceiptHeader, setTplReceiptHeader, tplReceiptHeaderAr, setTplReceiptHeaderAr, tplReceiptFooter, setTplReceiptFooter, tplReceiptPaper, setTplReceiptPaper,
    tplReceiptShowLogo, tplReceiptShowTrn, tplReceiptShowStamp, tplReceiptShowBarcode, tplReceiptShowCompanyDetails, tplReceiptShowCustomerDetails,
    tplReceiptColItemCode, tplReceiptColItemImage, tplReceiptColBatchNo, tplReceiptColDiscount, tplReceiptColVatPct, tplReceiptColVatAmt,
    tplReceiptShowGrandTotalBanner, tplReceiptShowTerms, tplReceiptShowNotes, tplReceiptShowBankDetails, tplReceiptShowQRCode, tplReceiptShowSignature,
    tplInvoiceHeader, setTplInvoiceHeader, tplInvoiceHeaderAr, setTplInvoiceHeaderAr, tplInvoiceFooter, setTplInvoiceFooter, tplInvoicePaper, setTplInvoicePaper,
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
    resolvedPosInvoiceTemplate, resolvedPosCreditNoteTemplate,
    setTplReceiptShowLogo, setTplReceiptShowCompanyDetails, setTplReceiptShowTrn, setTplReceiptShowCustomerDetails, setTplReceiptShowTerms, setTplReceiptShowNotes, setTplReceiptShowBankDetails, setTplReceiptShowQRCode, setTplReceiptShowStamp, setTplReceiptShowSignature, setTplReceiptShowGrandTotalBanner, setTplReceiptColItemCode, setTplReceiptColItemImage, setTplReceiptShowBarcode, setTplReceiptColBatchNo, setTplReceiptColDiscount, setTplReceiptColVatPct, setTplReceiptColVatAmt,
    setTplInvoiceShowLogo, setTplInvoiceShowCompanyDetails, setTplInvoiceShowTrn, setTplInvoiceShowCustomerDetails, setTplInvoiceShowTerms, setTplInvoiceShowNotes, setTplInvoiceShowBankDetails, setTplInvoiceShowQRCode, setTplInvoiceShowStamp, setTplInvoiceShowSignature, setTplInvoiceShowGrandTotalBanner, setTplInvoiceColItemCode, setTplInvoiceColItemImage, setTplInvoiceColBatchNo, setTplInvoiceColDiscount, setTplInvoiceColVatPct, setTplInvoiceColVatAmt,
    setTplReturnShowLogo, setTplReturnShowCompanyDetails, setTplReturnShowTrn, setTplReturnShowCustomerDetails, setTplReturnShowTerms, setTplReturnShowNotes, setTplReturnShowQRCode, setTplReturnShowStamp, setTplReturnShowSignature, setTplReturnShowGrandTotalBanner, setTplReturnColItemCode, setTplReturnColBatchNo, setTplReturnColDiscount, setTplReturnColVatPct, setTplReturnColVatAmt, setTplReturnShowCreditBalance,
    setTplJobCardShowLogo, setTplJobCardShowCompanyDetails, setTplJobCardShowTrn, setTplJobCardShowCustomerDetails, setTplJobCardShowSerialNumber, setTplJobCardShowWarranty, setTplJobCardShowTechnician, setTplJobCardShowExpectedDate, setTplJobCardShowCustomerSignature, setTplJobCardShowTerms, setTplJobCardShowStamp,
    // Template 2 (Arabic) independent Show/Hide toggles + setters
    t2ShowLogo, t2ShowCompanyDetails, t2ShowTrn, t2ShowArabic, t2ShowCustomerDetails, t2ShowAccountBalance, t2ShowDelivery,
    t2ShowVatSummary, t2ShowPaymentDetails, t2ShowLoyalty, t2ShowQRCode, t2ShowFooterText, t2ShowBarcode,
    setT2ShowLogo, setT2ShowCompanyDetails, setT2ShowTrn, setT2ShowArabic, setT2ShowCustomerDetails, setT2ShowAccountBalance, setT2ShowDelivery,
    setT2ShowVatSummary, setT2ShowPaymentDetails, setT2ShowLoyalty, setT2ShowQRCode, setT2ShowFooterText, setT2ShowBarcode,
    // Template 2 toggles split per sub-tab (POS Receipt / Tax Invoice) — drive the
    // real checkout print (see buildThermalReceiptArtifacts' hasTax routing); the
    // designer UI binds these when Template 2 is active on each respective tab.
    t2ReceiptShowLogo, t2ReceiptShowCompanyDetails, t2ReceiptShowTrn, t2ReceiptShowArabic, t2ReceiptShowCustomerDetails, t2ReceiptShowAccountBalance, t2ReceiptShowDelivery,
    t2ReceiptShowVatSummary, t2ReceiptShowPaymentDetails, t2ReceiptShowLoyalty, t2ReceiptShowQRCode, t2ReceiptShowFooterText, t2ReceiptShowBarcode,
    setT2ReceiptShowLogo, setT2ReceiptShowCompanyDetails, setT2ReceiptShowTrn, setT2ReceiptShowArabic, setT2ReceiptShowCustomerDetails, setT2ReceiptShowAccountBalance, setT2ReceiptShowDelivery,
    setT2ReceiptShowVatSummary, setT2ReceiptShowPaymentDetails, setT2ReceiptShowLoyalty, setT2ReceiptShowQRCode, setT2ReceiptShowFooterText, setT2ReceiptShowBarcode,
    t2InvoiceShowLogo, t2InvoiceShowCompanyDetails, t2InvoiceShowTrn, t2InvoiceShowArabic, t2InvoiceShowCustomerDetails, t2InvoiceShowAccountBalance, t2InvoiceShowDelivery,
    t2InvoiceShowVatSummary, t2InvoiceShowPaymentDetails, t2InvoiceShowLoyalty, t2InvoiceShowQRCode, t2InvoiceShowFooterText, t2InvoiceShowBarcode,
    setT2InvoiceShowLogo, setT2InvoiceShowCompanyDetails, setT2InvoiceShowTrn, setT2InvoiceShowArabic, setT2InvoiceShowCustomerDetails, setT2InvoiceShowAccountBalance, setT2InvoiceShowDelivery,
    setT2InvoiceShowVatSummary, setT2InvoiceShowPaymentDetails, setT2InvoiceShowLoyalty, setT2InvoiceShowQRCode, setT2InvoiceShowFooterText, setT2InvoiceShowBarcode,
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
        defaultShippingAddress: quickCustomerForm.deliveryAddress,
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
      if (showDeliveryModal) {
        setDeliveryCustomerId(String(newCust.id));
        if (newCust.defaultShippingAddress || newCust.address) {
          setDeliveryAddress(newCust.defaultShippingAddress || newCust.address);
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
        const duplicates = await validateDuplicateProductFromPos({
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
          status: 'ACTIVE',
          productType: 'STOCK',
          isBatch: false,
          isSerial: false,
          isDiscountAllowed: true,
          availableInPos: true,
          detailedDesc: quickProductForm.description,
          brand: { id: 1 }
        },
        pricing: {
          retailPrice: parseFloat(quickProductForm.sellingPrice) || 0,
          cost: parseFloat(quickProductForm.purchasePrice) || 0,
          purchasePrice: parseFloat(quickProductForm.purchasePrice) || 0
        },
        tax: {
          // Blank means "not configured" -> falls back to the branch's Default VAT
          // Rate at sale time; an explicit 0 is sent through as a zero-rated item.
          salesTax: quickProductForm.taxRate === '' || quickProductForm.taxRate === null || quickProductForm.taxRate === undefined
            ? null
            : Number(quickProductForm.taxRate)
        },
        inventory: {
          openingStock: parseFloat(quickProductForm.initialStock) || 0,
          minStock: parseFloat(quickProductForm.alertQuantity) || 0,
          trackInventory: quickProductForm.trackInventory || false,
          allowNegativeStock: true,
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
              cost: parseFloat(quickProductForm.purchasePrice) || 0,
              price: parseFloat(quickProductForm.sellingPrice) || 0,
              barcode: quickProductForm.barcode || ''
            }
          ]
        }
      };

      formData.append('data', JSON.stringify(productReq));

      const newProdRes = await createProductFromPos(formData);
      await loadPosProducts(0, false);

      if (newProdRes && newProdRes.product) {
        const mappedProduct = mapPosProductAggregateItem(newProdRes);
        const res = handleProductSelection(mappedProduct);
        if (res?.deferred) {
          showFeedback('success', `${mappedProduct.name} created — confirm the entry to add it.`);
        } else if (res && res.ok === false) {
          showFeedback('error', res.reason || `${mappedProduct.name} created but could not be added.`);
        } else {
          showFeedback('success', `${mappedProduct.name} created and added to cart!`);
        }
      }

      setShowQuickProductModal(false);
    } catch (err) {
      setQuickProductError(err.response?.data?.message || err.message || 'Failed to create product');
    } finally {
      setQuickProductLoading(false);
    }
  }, [quickProductForm, loadPosProducts, handleProductSelection, showFeedback]);

  const handleCheckout = useCallback(() => {
    setCheckoutPhase('payment');
    setShowPaymentDialog(true);
    // The Payment Manager starts with no allocations — the cashier picks a method and
    // enters an amount, so there is nothing to pre-seed here any more.
  }, []);

  const touchScreenProps = {
    handleCheckout,
    showQuickCustomerModal, setShowQuickCustomerModal, quickCustomerForm, setQuickCustomerForm, quickCustomerDuplicateWarning, setQuickCustomerDuplicateWarning, quickCustomerLoading, quickCustomerError, openQuickCustomerModal, handleSaveQuickCustomer,
    showQuickProductModal, setShowQuickProductModal, quickProductForm, setQuickProductForm, quickProductDuplicateWarning, setQuickProductDuplicateWarning, quickProductLoading, quickProductError, handleSaveQuickProduct,
    setCurrentView, currentSession, sessionId, posSettings,
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
    filteredCustomerOptions, customerHistory, customerHistoryLoading, openCustomerHistoryPreview,
    posCustomersLoading, posCustomersError,
    // Product Entry Mode is decided here, once, for every template.
    handleProductSelection, handleEditItem,
    // addToInvoice/createInvoiceLine/updateInvoiceLine are deliberately NOT
    // handed to templates — a template that could call them directly could
    // bypass the Product Entry Mode decision, which is the bug this fixes.
    updateQuantity, updateDiscount, updateItemPrice, voidFromInvoice,
    guardedRemoveFromInvoice, guardedClearInvoice, holdInvoice, recallInvoice, heldSales, holdBusy, deleteHeldBill,
    activeLayawayId, activeLayawayDeposit, shippingCharge,
    // Credit Vouchers applied to the open sale. Payment instruments, not cart lines: the
    // templates render them in the totals footer, below the product totals, and never as items.
    appliedVoucherLines, voucherRedeemedTotal, amountDueAfterVouchers, removeAppliedVoucher,
    posActionMode, setPosActionMode, selectedFocusItemId, setSelectedFocusItemId,
    classicNumpadMode, setClassicNumpadMode, classicNumpadValue, setClassicNumpadValue,
    classicDiscountType, setClassicDiscountType, discountInputType, setDiscountInputType,
    resetFocusMode,
    rightPanelTab, setRightPanelTab, hiddenPanelButtons, hideCategoriesPanel, hideItemsPanel,
    posTemplate,
    cartViewDetailed, cartLineDetails,
    setShowPaymentDialog, setCheckoutPhase,
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
    setShowServiceRepair, setServiceView, setShowReturn, setShowAddShippingDialog,
    setShowAddCustomerDialog, setShowDeliveryModal, setDeliveryModalTab, setDeliveryCustomerId,
    setShowDeliverySettleModal, setDeliverySettleSearch, setDeliverySettlePersonFilter,
    setDeliverySettleSelected, setShowLockPOS,
    openDeliveryModal,
    formatCurrency, showFeedback,
    favouriteProductIds, toggleFavourite,
  };

  return (
    <BusinessDayStatusProvider terminalId={currentTerminal?.terminalId} refreshRef={businessDayRefreshRef}>
    <div className={currentView === 'touch-screen' ? 'h-screen overflow-hidden bg-[#F7F7FA]' : 'min-h-screen bg-[#F7F7FA]'}>
      {/* ─── TERMINAL REGISTRATION REJECTED (archived / blocked / decommissioned / maintenance) ─── */}
      {terminalRegistrationError && (
        <TerminalUnavailableOverlay
          reason={terminalRegistrationError}
          onRegisterNew={() => {
            if (window.confirm('This will assign a new independent terminal to this device.\n\nContinue?')) {
              localStorage.removeItem('billbull:pos:device_fingerprint');
              Object.keys(localStorage)
                .filter(k => k.startsWith('billbull:pos:terminal_id'))
                .forEach(k => localStorage.removeItem(k));
              window.location.reload();
            }
          }}
        />
      )}

      {/* ─── IDLE LOCK OVERLAY ─── */}
      {isIdleLocked && (
        <IdleLockOverlay
          onResume={() => setIsIdleLocked(false)}
          onSupervisorTakeover={() => { setIsIdleLocked(false); setShowTakeoverDialog(true); }}
        />
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
                    clearTerminalLock();
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
                      // Clear every branch-scoped terminal_id cached on this device, not just the
                      // active branch's, so no stale pointer survives the fingerprint reset.
                      Object.keys(localStorage)
                        .filter(k => k.startsWith('billbull:pos:terminal_id'))
                        .forEach(k => localStorage.removeItem(k));
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

      {/* ─── BUSINESS DAY OVERLAYS (scheduled-end notice / closed) ───
           Renders nothing at all for a branch with no Business Day Window
           configured, which is the default. The standing status now lives in the
           POS header chip (BusinessDayStatusChip); this only owns the blocking
           CLOSED screen and the once-per-day extension announcement. Backend gates
           in openSession/checkout remain the authoritative controls regardless. */}
      <BusinessDayStatusBanner
        openSession={currentSession}
        currentTerminalId={currentTerminal?.terminalId}
        onCloseSession={handleTradingEndedCloseSession}
        onOpenDayClose={handleTradingEndedOpenDayClose}
        closureFlowActive={businessDayClosureFlowActive}
      />

      {/* ─── PREVIOUS BUSINESS DATE STILL OPEN (BLOCKS POS ENTRY) ─── */}
      {openSessionsBlock && (
        <PreviousBusinessDayBlockOverlay
          block={openSessionsBlock}
          onDismiss={dismissOpenSessionsBlock}
          onSelectSession={(s) => {
            // Deep-link a supervisor to the terminal that owns this session.
            localStorage.setItem(
              `billbull:pos:terminal_id:${openSessionsBlock.branchId || sessionStorage.getItem('activeBranchId') || 'default'}`,
              s.terminalId
            );
            window.location.reload();
          }}
        />
      )}

      {/* ─── SESSION ROAMING DISCOVERY DIALOG (Phase 11) ─── */}
      {discoveryResponse && (() => {
        const dr = discoveryResponse;
        const isOwner = dr.status === 'OWNER_SESSION';
        const isConflict = dr.status === 'CONFLICT';
        const isMultiple = dr.status === 'MULTIPLE_OWNER_SESSIONS';
        const canTransfer = isOwner && dr.transferAuthorization && dr.transferAuthorization !== 'DENIED';
        const needsSupervisor = dr.transferAuthorization === 'SUPERVISOR_REQUIRED';
        const isDenied = isOwner && dr.transferAuthorization === 'DENIED';
        return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 max-h-[95vh] overflow-y-auto">
            {/* ── Header ── */}
            <div className={`p-5 sm:p-8 text-center relative rounded-t-2xl sm:rounded-t-3xl ${
              isConflict || isMultiple
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white'
                : 'bg-[#F5C742] text-slate-900'
            }`}>
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/30 shadow-inner">
                {isConflict || isMultiple
                  ? <AlertTriangle className="h-7 w-7 sm:h-10 sm:w-10 text-white" />
                  : <ArrowRightCircle className="h-7 w-7 sm:h-10 sm:w-10 text-slate-900" />
                }
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight mb-1">
                {isOwner && 'Active Session Found'}
                {isConflict && 'Session Conflict'}
                {isMultiple && 'Multiple Sessions Detected'}
              </h2>
              <p className={`text-xs sm:text-sm font-medium ${isConflict || isMultiple ? 'text-white/80' : 'text-slate-800'}`}>
                {isOwner && 'You have an open session on another terminal'}
                {isConflict && 'Both this terminal and your account have active sessions'}
                {isMultiple && 'Manual resolution required'}
              </p>
            </div>

            <div className="p-4 sm:p-8 space-y-4 sm:space-y-5">
              {/* ── Backend message ── */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-sm text-slate-700">
                {dr.message}
              </div>

              {/* ── OWNER_SESSION details ── */}
              {isOwner && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-blue-800 font-bold text-sm mb-2">
                      <Info className="h-4 w-4 text-blue-600 shrink-0" />
                      <span>Your Active Session</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Session ID</span>
                        <p className="text-slate-800 font-bold">#{dr.ownerSessionId}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Terminal</span>
                        <p className="text-slate-800 font-bold">{dr.ownerSessionTerminalId || '—'}</p>
                      </div>
                      {dr.ownerSessionBranchId && (
                        <div>
                          <span className="text-slate-500 font-medium">Branch</span>
                          <p className="text-slate-800 font-bold">{branches?.find(b => b.id === dr.ownerSessionBranchId)?.name || dr.ownerSessionBranchId}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500 font-medium">Transfer</span>
                        <p className={`font-bold ${canTransfer ? 'text-emerald-700' : isDenied ? 'text-red-600' : 'text-amber-600'}`}>
                          {canTransfer && !needsSupervisor && '✓ Available'}
                          {canTransfer && needsSupervisor && '🔒 Supervisor Required'}
                          {isDenied && '✗ Not Available'}
                          {!dr.transferAuthorization && '—'}
                        </p>
                      </div>
                    </div>
                    {dr.transferMessage && (
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{dr.transferMessage}</p>
                    )}
                  </div>

                  {/* Denied explanation */}
                  {isDenied && dr.transferReasonCode && (
                    <div className="bg-red-50 border border-red-200/80 rounded-2xl p-4 text-xs text-red-700">
                      <div className="flex items-center gap-2 font-bold text-sm mb-1">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Transfer Not Possible</span>
                      </div>
                      {dr.transferReasonCode === 'DESTINATION_TERMINAL_OCCUPIED' && 'This terminal already has an active session owned by another user. That session must be closed before a transfer.'}
                      {dr.transferReasonCode === 'SAME_TERMINAL_NOT_APPLICABLE' && 'Your session is already on this terminal.'}
                      {dr.transferReasonCode === 'DESTINATION_TERMINAL_NOT_FOUND' && 'The destination terminal could not be found.'}
                      {!['DESTINATION_TERMINAL_OCCUPIED', 'SAME_TERMINAL_NOT_APPLICABLE', 'DESTINATION_TERMINAL_NOT_FOUND'].includes(dr.transferReasonCode) && (dr.transferMessage || 'The transfer policy does not allow this operation.')}
                    </div>
                  )}

                  {/* Supervisor PIN input when required */}
                  {canTransfer && needsSupervisor && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                        <Shield className="h-5 w-5 text-amber-600 shrink-0" />
                        <span>Supervisor Authorization Required</span>
                      </div>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        This transfer requires supervisor approval. Enter the supervisor PIN to proceed.
                      </p>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={10}
                        value={discoverySupervisorPin}
                        onChange={(e) => { setDiscoverySupervisorPin(e.target.value); setDiscoveryError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !discoveryBusy) handleSessionTransfer(); }}
                        placeholder="Supervisor PIN"
                        className={`w-full border rounded-xl px-4 py-2.5 sm:py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                          discoveryError ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
                        }`}
                        autoFocus
                        disabled={discoveryBusy}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── CONFLICT details ── */}
              {isConflict && (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200/80 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-sm mb-2">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <span>Two Active Sessions</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="bg-white/70 rounded-xl p-3 border border-red-100">
                        <span className="text-slate-500 font-medium">This Terminal's Session</span>
                        <p className="text-slate-800 font-bold">#{dr.terminalSessionId} — opened by {dr.terminalSessionOpenedBy || 'unknown'}</p>
                      </div>
                      <div className="bg-white/70 rounded-xl p-3 border border-red-100">
                        <span className="text-slate-500 font-medium">Your Session Elsewhere</span>
                        <p className="text-slate-800 font-bold">#{dr.ownerSessionId} — terminal {dr.ownerSessionTerminalId || '—'}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Both sessions must be resolved manually. Contact a supervisor to close or transfer the conflicting sessions.
                  </p>
                </div>
              )}

              {/* ── MULTIPLE_OWNER_SESSIONS details ── */}
              {isMultiple && (
                <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{dr.ownerSessionCount || 'Multiple'} Open Sessions</span>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Your account owns multiple active POS sessions. The system cannot determine which session to use.
                    A supervisor must close the extra sessions from Console before you can start or transfer a session.
                  </p>
                </div>
              )}

              {/* ── Error message ── */}
              {discoveryError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {discoveryError}
                </div>
              )}

              {/* ── Action buttons ── */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDiscoveryDismiss}
                  disabled={discoveryBusy}
                  className="flex-1 py-3 sm:py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                {canTransfer && (
                  <button
                    type="button"
                    onClick={handleSessionTransfer}
                    disabled={discoveryBusy || (needsSupervisor && !discoverySupervisorPin.trim())}
                    className="flex-1 py-3 sm:py-3.5 rounded-2xl bg-[#F5C742] hover:bg-[#e3b83c] text-slate-900 font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowRightCircle className="h-4 w-4" />
                    {discoveryBusy ? 'Transferring…' : 'Transfer Session Here'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Render current view */}
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'console' && <POSConsole {...consoleProps} />}
      {currentView === 'touch-screen' && (posTemplate === 'compact' ? <TradePOSTouchScreen {...touchScreenProps} /> : <POSTouchScreen {...touchScreenProps} />)}

      {/* Item Entry dialog — owned here so every template and every entry path
          (click, touch, scan, keyboard search) shares one instance and one
          Product Entry Mode decision. */}
      {selectedProductForEntry && (
        <POSItemEntryContainer
          isOpen={isItemEntryOpen}
          onClose={closeItemEntry}
          onConfirm={handleItemEntryConfirm}
          product={itemEntryAction === 'add' ? selectedProductForEntry : undefined}
          invoiceLine={itemEntryAction === 'edit' ? selectedProductForEntry : undefined}
          mode={itemEntryAction}
          initialValues={itemEntryInitialValues}
          lockQuantity={Boolean(itemEntryContext?.lockQuantity)}
          lockedBatch={itemEntryContext?.batch || null}
          lockedSerial={itemEntryContext?.serial || null}
          posSettings={posSettings}
          customerId={selectedCustomerData?.id}
          customerCode={selectedCustomerData?.code}
          customerName={selectedCustomerData?.name}
          warehouseId={currentSession?.warehouseId || posSettings?.defaultWarehouseId}
        />
      )}
      {currentView === 'z-report' && renderZReport()}
      {currentView === 'x-report' && renderXReport()}
      {currentView === 'customer' && <CustomerView customerOptions={customerOptions} posCustomersLoading={posCustomersLoading} setCurrentView={setCurrentView} syncPosData={syncPosData} printerConfigs={printerConfigs} currentTerminal={currentTerminal} currentSession={currentSession}
        printTemplate={{
          // Same branding the Tax Invoice header uses, so the Customer Receipt /
          // Receive Advance / Statement prints render an identical logo + company
          // block (req 12). tplLogoDataUrl is a data URL — safe for the ESC/POS
          // raster ditherer — unlike the company profile's logoUrl (a server path).
          logoDataUrl: tplLogoDataUrl,
          companyName: tplOutletName,
          trn: effectiveOutletTrn,
          address: tplOutletAddress,
          phone: tplOutletPhone,
          showLogo: tplInvoiceShowLogo,
          showTrn: tplInvoiceShowTrn,
          currency: activeCurrency,
        }} />}
      {currentView === 'sales-analytics' && renderSalesAnalytics()}

      {/* Previous Day Session Still Open — blocks silent continuation into a new day (BBQA-5.3-013) */}
      {/* Supervisor-authorized Cancel Closure. Deliberately not a plain "Cancel" button:
          un-starting a closure is what would let a cashier told to close out simply put the
          till back into service, so it is a supervisor decision, verified server-side. */}
      <Dialog open={showCancelClosureDialog} onOpenChange={(o) => { if (!o) setShowCancelClosureDialog(false); }}>
        <DialogContent className="sm:max-w-md border-0 shadow-xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Cancel Session Closure
            </DialogTitle>
            <DialogDescription>
              A supervisor must authorize returning this session to normal trading. The X-Report
              and all session totals are left untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <input
              type="text" autoComplete="off"
              placeholder="Supervisor email or username"
              className="w-full border rounded px-3 py-2 text-sm"
              value={cancelClosureUsername}
              onChange={(e) => setCancelClosureUsername(e.target.value)}
            />
            <input
              type="password" autoComplete="off"
              placeholder="Supervisor password"
              className="w-full border rounded px-3 py-2 text-sm"
              value={cancelClosurePassword}
              onChange={(e) => setCancelClosurePassword(e.target.value)}
            />
            <input
              type="text"
              placeholder="Reason (recorded in the audit log)"
              className="w-full border rounded px-3 py-2 text-sm"
              value={cancelClosureReason}
              onChange={(e) => setCancelClosureReason(e.target.value)}
            />
            {cancelClosureError && (
              <p className="text-sm text-red-600 whitespace-pre-line">{cancelClosureError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCancelClosureDialog(false)}>Keep Closing</Button>
            <Button
              className="bg-[#327F74] hover:bg-[#286660] text-white"
              disabled={cancelClosureLoading}
              onClick={handleCancelClosureSubmit}
            >
              {cancelClosureLoading ? 'Cancelling...' : 'Cancel Closure'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Session Closure Required — the close-workflow counterpart to the "Previous Day
          Not Closed" dialog below. Dismissing it is safe and leaves nothing inconsistent:
          the session simply stays OPEN and still requiring closure, and every server-side
          operation on it keeps being refused until the close succeeds or a supervisor
          cancels it. */}
      <Dialog open={!!closureRequiredMsg} onOpenChange={(o) => { if (!o) setClosureRequiredMsg(null); }}>
        <DialogContent className="sm:max-w-md border-0 shadow-xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Session Closure Required
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line">{closureRequiredMsg}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setClosureRequiredMsg(null)}>Cancel</Button>
            <Button
              className="bg-[#327F74] hover:bg-[#286660] text-white"
              onClick={async () => {
                const sessionId = closureRequiredId;
                setClosureRequiredMsg(null);
                setClosureRequiredId(null);
                setShowStartSessionDialog(false);
                if (!sessionId) { setCurrentView('x-report'); return; }
                try {
                  const session = await getPosSessionById(sessionId);
                  setCurrentSession(session);
                  setXReportData(null);
                  setSessionNowMs(Date.now());
                  setCurrentView('x-report');
                } catch (err) {
                  alert(err?.response?.data?.message || 'Failed to load the session. Please close it manually.');
                }
              }}
            >
              Complete Session Closure
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!prevDaySessionOpenMsg} onOpenChange={(o) => { if (!o) setPrevDaySessionOpenMsg(null); }}>
        <DialogContent className="sm:max-w-md border-0 shadow-xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Previous Day Not Closed
            </DialogTitle>
            {/* Server message is line-structured (sentence, detail lines, next step) —
                keep its line breaks so it doesn't read as one run-on paragraph. */}
            <DialogDescription className="whitespace-pre-line">{prevDaySessionOpenMsg}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPrevDaySessionOpenMsg(null)}>Cancel</Button>
            <Button
              className="bg-[#327F74] hover:bg-[#286660] text-white"
              onClick={async () => {
                const sessionId = prevDaySessionOpenId;
                const isDayClosePending = prevDaySessionOpenMsg?.includes('Day Close has not been run') || prevDaySessionOpenMsg?.includes('All sessions for this Business Day are already closed');

                setPrevDaySessionOpenMsg(null);
                setPrevDaySessionOpenId(null);
                setShowStartSessionDialog(false);

                if (isDayClosePending) {
                  const dateMatch = prevDaySessionOpenMsg?.match(/Business Day (\d{4}-\d{2}-\d{2})/);
                  const targetDate = dateMatch ? dateMatch[1] : null;
                  handleTradingEndedOpenDayClose(targetDate);
                  return;
                }

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
              {prevDaySessionOpenMsg?.includes('Day Close has not been run') || prevDaySessionOpenMsg?.includes('All sessions for this Business Day are already closed') ? 'Go to Day Close' : 'Go to Close Session'}
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
                  {CASH_NOTE_KEYS.map((note) => (
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
                  {CASH_COIN_KEYS.map((coin) => (
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

      {/* Session Owner Required Dialog */}
      {showSessionOwnerRequiredDialog && (
        <SessionOwnerRequiredDialog
          targetSession={sessionToClose || currentSession}
          onClose={() => setShowSessionOwnerRequiredDialog(false)}
        />
      )}

      {/* Cashier Auth Dialog */}
      {showCashierAuthDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-[#F5C742] to-[#E8B22E] rounded-t-2xl px-5 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/40">
                  <User className="h-5 w-5 text-[#7A5B0B]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#4A3708] leading-tight">Session Owner Verification</h2>
                  <p className="text-[11px] text-[#7A5B0B] mt-0.5 leading-tight">Enter the credentials of the cashier who opened this session.</p>
                </div>
              </div>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto">
              {(() => {
                const targetSession = cashierAuthTargetRef.current || sessionToClose || currentSession;
                if (!targetSession) return null;
                return (
                  <div className="bg-[#FFF8E7] p-3 rounded-lg border border-[#FDE6A9]">
                    <p className="text-[10px] text-[#7A5B0B] font-bold mb-1.5 uppercase tracking-wide">Target Session</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-[#9A7B2B]">Terminal</span> <span className="font-semibold text-[#4A3708]">{targetSession.terminalName || targetSession.terminalId}</span></div>
                      <div className="flex justify-between"><span className="text-[#9A7B2B]">Counter</span> <span className="font-semibold text-[#4A3708]">{targetSession.counterName || targetSession.counter || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-[#9A7B2B]">Session</span> <span className="font-semibold text-[#4A3708]">{targetSession.sessionNo || (targetSession.id ? `SESS-${targetSession.id}` : '—')}</span></div>
                      <div className="flex justify-between"><span className="text-[#9A7B2B]">Cashier</span> <span className="font-semibold text-[#4A3708]">{targetSession.cashier || targetSession.openedBy || targetSession.userId || '—'}</span></div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                    Session Owner Email / Username
                  </label>
                  <input
                    type="text"
                    value={cashierAuthUsername}
                    onChange={e => { setCashierAuthUsername(e.target.value); setCashierAuthError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleCashierAuthSubmit(); }}
                    autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                    Session Owner Password
                  </label>
                  <input
                    type="password"
                    value={cashierAuthPassword}
                    onChange={e => { setCashierAuthPassword(e.target.value); setCashierAuthError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleCashierAuthSubmit(); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                  />
                  {cashierAuthError && (
                    <p className="text-[11px] font-medium text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{cashierAuthError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 shrink-0 space-y-2">
              <button
                type="button"
                onClick={handleCashierAuthSubmit}
                disabled={cashierAuthLoading || !cashierAuthUsername || !cashierAuthPassword}
                className="w-full py-2.5 rounded-lg bg-[#F5C742] hover:bg-[#E8B22E] disabled:opacity-50 disabled:cursor-not-allowed text-[#4A3708] text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {cashierAuthLoading ? 'Verifying...' : 'Authorize & Continue'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCashierAuthDialog(false); cashierAuthTargetRef.current = null; setCashierAuthUsername(''); setCashierAuthPassword(''); setCashierAuthError(''); }}
                className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Session Dialog */}
      <Dialog open={showCloseSessionDialog} onOpenChange={setShowCloseSessionDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col border-0 shadow-xl bg-white">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-[#1E293B]">Close POS Session</DialogTitle>
            <DialogDescription>Count closing cash and settle card payments before closing</DialogDescription>
            {(() => {
              const tgt = sessionToClose || currentSession;
              if (!tgt) return null;
              return (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-left grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-blue-700/70">Terminal:</span> <span className="font-medium text-blue-900">{tgt.terminalName || tgt.terminalId}</span></div>
                  <div><span className="text-blue-700/70">Counter:</span> <span className="font-medium text-blue-900">{tgt.counterName || tgt.counter || '—'}</span></div>
                  <div><span className="text-blue-700/70">Session:</span> <span className="font-medium text-blue-900">{tgt.sessionNo || (tgt.id ? `SESS-${tgt.id}` : '—')}</span></div>
                  <div><span className="text-blue-700/70">Cashier:</span> <span className="font-medium text-blue-900">{tgt.cashier || tgt.openedBy || tgt.userId || '—'}</span></div>
                </div>
              );
            })()}
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
                      {CASH_NOTE_KEYS.map((note) => (
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
                      {CASH_COIN_KEYS.map((coin) => (
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
                    // Same source as the X-Report page: the backend's authoritative
                    // expectedCash. The local fallback that used to stand in while xReportData
                    // loaded is gone — it was a second copy of the formula, and the modal is
                    // exactly where a wrong Expected Cash does the most damage.
                    const xSummaryModal = xReportData?.summary || {};
                    const sessionExpectedCash = Number(xSummaryModal.expectedCash ?? 0);
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

          {closeSessionError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{closeSessionError}</span>
            </div>
          )}

          {/* ─── Variance approval — an exception, not an error ───────────────────────────
              Every figure below is read from the server's refusal. The page computes none of
              them, so the amount a supervisor authorizes is exactly the amount the close was
              evaluated against. */}
          {varianceApproval && (
            <div className="rounded-lg border-2 border-[#E63946] bg-red-50 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#E63946]" />
                <div>
                  <div className="text-sm font-bold text-[#E63946]">Supervisor Authorization Required</div>
                  <div className="text-xs text-[#1E293B] mt-0.5">{varianceApproval.message}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Expected Cash', varianceApproval.expectedCash],
                  ['Counted Cash', varianceApproval.countedCash],
                  [`Variance (${varianceApproval.varianceDirection || '—'})`, varianceApproval.varianceAmount],
                  ['Allowed Threshold', varianceApproval.threshold],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between bg-white rounded px-2 py-1.5">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-bold text-[#1E293B]">
                      {value === null || value === undefined ? '—' : <CurrencyAmount amount={Number(value)} />}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Supervisor username or email"
                  value={varianceSupervisorUser}
                  onChange={(e) => setVarianceSupervisorUser(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Supervisor password"
                  value={varianceSupervisorPassword}
                  onChange={(e) => setVarianceSupervisorPassword(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                />
                <textarea
                  rows={2}
                  placeholder="Reason for this variance (required)"
                  value={varianceApprovalReason}
                  onChange={(e) => setVarianceApprovalReason(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                />
              </div>

              {varianceApprovalError && (
                <div className="text-xs font-medium text-[#E63946]">{varianceApprovalError}</div>
              )}

              <div className="text-[11px] text-gray-500">
                Authorization applies to this exact count. If the drawer is recounted, it must be
                authorized again.
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={() => {
              setShowCloseSessionDialog(false);
              setSessionToClose(null);
              setCloseSessionError('');
              varianceGrantRef.current = null;
              setVarianceApproval(null);
              setVarianceApprovalError('');
              setVarianceSupervisorUser('');
              setVarianceSupervisorPassword('');
              setVarianceApprovalReason('');
            }}>Cancel</Button>
            {varianceApproval ? (
              <Button
                onClick={handleAuthorizeVariance}
                disabled={varianceApprovalBusy}
                className="bg-[#E63946] hover:bg-[#d32f3d] text-white"
              >
                <Lock className="h-4 w-4 mr-2" />
                {varianceApprovalBusy ? 'Authorizing…' : 'Authorize & Close Session'}
              </Button>
            ) : (
              <Button onClick={handleCloseSession} className="bg-[#E63946] hover:bg-[#d32f3d] text-white">
                <Lock className="h-4 w-4 mr-2" />
                Close Session & Print Report
              </Button>
            )}
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
            setReceiptShareChannel(null);
            setSelectedCustomer(WALK_IN_CUSTOMER.id);
          };
          
          const paymentRows = lastPaidInvoice.paymentBlock ? paymentBlockRows(lastPaidInvoice.paymentBlock) : [];
          const usedMethods = paymentRows.filter(r => r.label !== 'Total Received' && r.label !== 'Change Returned');

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* 1. Redesigned Success Header */}
                <div className="bg-gradient-to-b from-[#F5C742] to-[#E5B532] px-6 pt-5 pb-4 text-center shrink-0">
                  <div className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest mb-0.5">Payment Complete</p>
                  <p className="text-white font-bold text-lg">{lastPaidInvoice.id}</p>
                </div>

                {/* 2. Amount Paid (Primary Financial Highlight) */}
                <div className="bg-[#FFFBEB] border-b border-amber-100/50 px-6 py-4 text-center shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/60 mb-0.5">Amount Paid</p>
                  <p className="text-3xl font-black text-[#1E293B]">
                    <DirhamSymbol /> {(lastPaidInvoice.paidAmount ?? lastPaidInvoice.total ?? 0).toFixed(2)}
                  </p>
                </div>

                {/* Background finalize indicator */}
                {checkoutFinalizing && (
                  <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 flex items-center justify-center gap-2 shrink-0">
                    <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
                    <span className="text-[11px] font-bold text-amber-600">Printing receipt…</span>
                  </div>
                )}

                <CheckoutCompleteSummary
                  lastPaidInvoice={lastPaidInvoice}
                  paymentRows={paymentRows}
                  usedMethods={usedMethods}
                  formatCurrencyStr={formatCurrencyStr}
                />

                {/* 6. Action Priority */}
                <CheckoutCompleteActions
                  onNewSale={closeComplete}
                  onPrintReceipt={async () => {
                    if (!lastPaidInvoice?.invoice?.id) return;
                    try {
                      const full = await getSalesInvoiceById(lastPaidInvoice.invoice.id);
                      if (tplInvoicePaper === 'A4') {
                        const template = resolveInvoiceA4TemplateFor(full);
                        const data = buildPosPrintData(full, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(full) ? tplInvoiceHeader : tplReceiptHeader);
                        const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
                        printHtml(generateDocumentPrintHtml(template, data, options));
                      } else {
                        const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                          full, cashGiven: lastPaidInvoice?.paidAmount, changeAmount: lastPaidInvoice?.changeAmount, customerNameOverride: (lastPaidInvoice?.customer && lastPaidInvoice.customer.id !== 'walk-in') ? lastPaidInvoice.customer.name : null, customerPhone: lastPaidInvoice?.customer?.phone, customerEmail: lastPaidInvoice?.customer?.email, customerTrn: lastPaidInvoice?.customer?.trn, customerAddress: lastPaidInvoice?.customer?.address, creditPreviousBalance: lastPaidInvoice?.creditPreviousBalance ?? null, creditInvoiceCredit: lastPaidInvoice?.creditInvoiceCredit ?? null, creditAmountPaid: lastPaidInvoice?.creditAmountPaid ?? null, creditUpdatedBalance: lastPaidInvoice?.creditUpdatedBalance ?? null,
                        });
                        await printThermalReceiptWithConfiguredPrinter({
                          full, text, escPosBase64, title: `Receipt ${full.invoiceNumber || ''}`.trim(),
                        });
                      }
                    } catch (err) { console.warn('POS print error', err); alert(`Print failed: ${err?.message || 'printer error'}.`); }
                  }}
                  onReprint={() => {
                    closeComplete();
                    setShowReprintModal(true);
                  }}
                  onShare={(key) => setReceiptShareChannel(key)}
                />
              </div>

              {/* Share Receipt dialog — one component, three configured channels. */}
              {receiptShareChannel && (
                <ReceiptShareModal
                  key={receiptShareChannel}
                  channel={receiptShareChannel}
                  initialValue={receiptShareInitialValue}
                  onClose={() => setReceiptShareChannel(null)}
                  onSend={handleReceiptShareSend}
                />
              )}
            </div>
          );
        }

        const shippingChargeNum = Number(shippingCharge) || 0;
        const grandTotal = (currentInvoice.total || 0) + shippingChargeNum;
        const depositAmt = activeLayawayDeposit > 0 ? activeLayawayDeposit : 0;
        // Owned by the Payment Manager (checkoutEffectiveDue) so the screen and the manager
        // measure every allocation against exactly the same amount due.
        const effectiveDue = checkoutEffectiveDue;
        // Real next number from the backend sequence (fetched when the dialog
        // opened); blank until it lands so no fabricated number is shown.
        const invoiceNo = previewInvoiceNo || '';

        // Every payment figure below comes from the Payment Manager, which owns the
        // cashier's allocations. See CheckoutPaymentManager for the allocation UI itself.
        // Settlement needs both a fully-allocated bill and a server that will record it.
        const canSettle = checkoutPayment.canSettle && checkoutCompatibility.canSettle;

        return (
          <div className="fixed inset-0 z-[60] flex flex-col lg:flex-row bg-[#1a1f2e]">

            {/* ══ LEFT: Invoice Preview ════════════════════════════════ */}
            <div className={`w-full shrink-0 flex flex-col max-h-[40vh] lg:max-h-none min-h-0 bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-[#F5C742] transition-all duration-300 ${
              showA4CheckoutPreview ? 'lg:w-[400px] xl:w-[500px] 2xl:w-[600px]' :
              'lg:w-[280px] xl:w-[340px] 2xl:w-[400px]'
            }`}>
              <CheckoutPaymentPreview
                showA4CheckoutPreview={showA4CheckoutPreview}
                checkoutA4Html={checkoutA4Html}
                checkoutA4BlobUrl={checkoutA4BlobUrl}
                checkoutPreviewBlobUrl={checkoutPreviewBlobUrl}
              />
            </div>

            {/* ══ RIGHT: Payment & Settlement ═══════════════════════ */}
            <div className="flex-1 flex flex-col bg-[#F7F7FA] overflow-hidden min-h-0">

              {/* Right header */}
              <CheckoutPaymentHeader
                itemCount={currentInvoice.items.length}
                invoiceNo={invoiceNo}
                depositAmt={depositAmt}
                effectiveDue={effectiveDue}
                grandTotal={grandTotal}
                onClose={() => setShowPaymentDialog(false)}
              />

              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-3">

                  {/* ── Settlement summary (shipping and/or layaway-hold deposit) ── */}
                  {(depositAmt > 0 || shippingChargeNum > 0) && (
                    <CheckoutSettlementSummary
                      itemsTotal={currentInvoice.total || 0}
                      shippingChargeNum={shippingChargeNum}
                      grandTotal={grandTotal}
                      depositAmt={depositAmt}
                      effectiveDue={effectiveDue}
                    />
                  )}

                  {/* ══ Progressive Payment Allocation ══════════════════════
                      Pick a method, enter an amount, confirm — repeat until Remaining
                      reaches zero. There is no "Mixed" mode: a sale settled two ways is
                      simply a sale with two allocations. */}
                  <PaymentAllocationPanel
                    payment={checkoutPayment}
                    compatibility={checkoutCompatibility}
                    customers={customerOptions}
                    onCustomerCreated={loadPosCustomers}
                    selectedCustomerId={selectedCustomer}
                    selectedCustomerName={selectedCustomerData?.name}
                    bankAccounts={checkoutOnlineBankAccounts}
                    bankAccountsLoading={checkoutOnlineBankAccountsLoading}
                  />


                  {/* ── Remarks ── */}
                  <CheckoutRemarks
                    checkoutRemarks={checkoutRemarks}
                    setCheckoutRemarks={setCheckoutRemarks}
                  />



                </div>
              </div>

              {/* ── Settlement footer ── */}
              <CheckoutPaymentFooter
                changeDue={checkoutPaymentFields.changeDue}
                checkoutError={checkoutError}
                canSettle={canSettle}
                itemCount={currentInvoice.items.length}
                checkoutLoading={checkoutLoading}
                effectiveDue={checkoutEffectiveDue}
                onCancel={() => {
                  setShowPaymentDialog(false);
                  setCheckoutError(null);
                  cancelCheckoutTenders();
                }}
                onSettle={() => processPayment()}
              />

            </div>
          </div>
        );
      })()}

      {/* Supervisor PIN Dialog */}
      {showSupervisorPin && (
        <SupervisorPinDialog
          pendingPriceOverride={pendingPriceOverride}
          pendingSupervisorAction={pendingSupervisorAction}
          pendingLayawayAbortAction={pendingLayawayAbortAction}
          supervisorApprovalMode={supervisorApprovalMode}
          sessionToClose={sessionToClose}
          forceCloseReason={forceCloseReason}
          setForceCloseReason={setForceCloseReason}
          forceCloseAuditAcknowledged={forceCloseAuditAcknowledged}
          setForceCloseAuditAcknowledged={setForceCloseAuditAcknowledged}
          supervisorPinEmail={supervisorPinEmail}
          setSupervisorPinEmail={setSupervisorPinEmail}
          supervisorPinValue={supervisorPinValue}
          setSupervisorPinValue={setSupervisorPinValue}
          supervisorPinError={supervisorPinError}
          setSupervisorPinError={setSupervisorPinError}
          onSubmit={handleSupervisorPinSubmit}
          onCancel={cancelApproval}
        />
      )}


      {/* Cash Drop/Out Dialog */}
      <CashDropDialog
        open={showCashDropDialog}
        onOpenChange={setShowCashDropDialog}
        cashDropType={cashDropType}
        onCashDropTypeChange={e => setCashDropType(e.target.value)}
        cashDropAmount={cashDropAmount}
        onCashDropAmountChange={e => setCashDropAmount(e.target.value)}
        cashDropCategories={cashDropCategories}
        cashDropCategoryRequired={cashDropCategoryRequired}
        cashDropCategoryId={cashDropCategoryId}
        onCashDropCategoryIdChange={e => setCashDropCategoryId(e.target.value)}
        cashDropDescription={cashDropDescription}
        onCashDropDescriptionChange={e => setCashDropDescription(e.target.value)}
        onClose={() => setShowCashDropDialog(false)}
        onRecord={handleCashDrop}
      />

      {/* Live Session Quick View — dashboard tile popup showing current session
          sales/cash figures, sourced from the same X-Report summary the full
          X-Report page uses so the numbers never disagree. */}
      <LiveSessionDialog
        open={showLiveSessionDialog}
        onOpenChange={setShowLiveSessionDialog}
        xReportData={xReportData}
        xReportLoading={xReportLoading}
        currentSession={currentSession}
        currentTerminal={currentTerminal}
        sessionNowMs={sessionNowMs}
        onRefresh={loadXReport}
        onClose={() => setShowLiveSessionDialog(false)}
        onOpenFullXReport={() => {
          setShowLiveSessionDialog(false);
          setCurrentView('x-report');
        }}
      />

      {/* Close Day Reconciliation Variance Dialog */}
      <CloseDayVarianceDialog
        open={!!closeDayVariance}
        onOpenChange={(open) => { if (!open) setCloseDayVariance(null); }}
        closeDayVariance={closeDayVariance}
        onClose={() => setCloseDayVariance(null)}
      />

      {/* Session Range Exclusion Confirmation — the selected/auto-resolved range
          leaves eligible sessions out of this Day Close; require explicit
          acknowledgement before resubmitting with acknowledgeExclusions=true. */}
      <RangeExclusionConfirmDialog
        open={!!rangeExclusionConfirm}
        onOpenChange={(open) => { if (!open) setRangeExclusionConfirm(null); }}
        rangeExclusionConfirm={rangeExclusionConfirm}
        onCancel={() => setRangeExclusionConfirm(null)}
        onConfirm={() => handleCloseDay(true)}
      />

      {/* Lock POS Dialog */}
      <LockPosDialog
        open={showLockPOS}
        onOpenChange={v => {
          if (!v) {
            setShowLockPOS(false);
            setLockPOSPin('');
          }
        }}
        pin={lockPOSPin}
        onPinChange={e => setLockPOSPin(e.target.value)}
        onCancel={() => setShowLockPOS(false)}
        onLock={() => {
          if (lockPOSPin.length >= 4) {
            setPosLocked(true);
            setShowLockPOS(false);
          }
        }}
      />

      {/* POS Locked Overlay */}
      {posLocked && (
        <PosLockedOverlay
          unlockPin={unlockPin}
          onUnlockPinChange={e => setUnlockPin(e.target.value)}
          onUnlock={() => {
            if (unlockPin === lockPOSPin) {
              setPosLocked(false);
              setUnlockPin('');
              setLockPOSPin('');
            } else {
              setUnlockPin('');
            }
          }}
        />
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
                const reprintResult = await reprintPosReceipt(lastPaidInvoice.invoice.id, {
                  sessionId: currentSession?.id,
                  terminalId: currentTerminal?.terminalId,
                  branchId: currentTerminal?.branchId || currentSession?.branchId,
                });
                const full = reprintResult.invoice;
                openCashDrawer('RECEIPT_PRINT');
                if (tplInvoicePaper === 'A4') {
                  const template = resolveInvoiceA4TemplateFor(full);
                  const data = buildPosPrintData(full, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(full) ? tplInvoiceHeader : tplReceiptHeader);
                  const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
                  printHtml(await generatePrintHtmlAsync(template, data, options));
                } else {
                  // Reuse the credit-account figures snapshotted at checkout (lastPaidInvoice)
                  // rather than re-querying posCreditBalance — by now it already reflects
                  // this invoice and would be mislabeled as "previous balance".
                  const { text, escPosBase64 } = await buildThermalReceiptArtifacts({
                    full,
                    isReprint: true,
                    // Same rule as the Reprint dialog: the tenders come from what was recorded
                    // against the invoice, so the voucher leg survives a page reload.
                    paymentBlock: buildReprintPaymentBlock(reprintResult, full),
                    cashGiven: lastPaidInvoice?.paidAmount,
                    changeAmount: lastPaidInvoice?.changeAmount,
                    customerPhone: lastPaidInvoice?.customer?.phone,
                    customerEmail: lastPaidInvoice?.customer?.email,
                    customerTrn: lastPaidInvoice?.customer?.trn,
                    customerAddress: lastPaidInvoice?.customer?.address,
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

      {/* Customer History — Invoice Preview Modal */}
      <Dialog open={showCustomerHistoryPreview} onOpenChange={(open) => { setShowCustomerHistoryPreview(open); if (!open) { setCustomerHistoryPreviewInvoice(null); setCustomerHistoryPreviewError(''); } }}>
        <DialogContent className="sm:max-w-xl border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden max-h-[88vh] flex flex-col">
          {(() => {
            const inv = customerHistoryPreviewInvoice;
            const statusMeta = {
              PAID: { label: 'Paid', cls: 'bg-green-100 text-green-700 border-green-200' },
              POSTED: { label: 'Posted', cls: 'bg-green-100 text-green-700 border-green-200' },
              PARTIALLY_PAID: { label: 'Partially Paid', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
              DRAFT: { label: 'Draft', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
              CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700 border-red-200' },
            }[inv?.status] || { label: inv?.status || '—', cls: 'bg-gray-100 text-gray-600 border-gray-200' };

            return (
              <>
                <div className="px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100 shrink-0 bg-gradient-to-r from-[#327F74]/5 to-transparent">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-[#327F74]/10 shrink-0">
                        <Receipt className="h-5 w-5 text-[#327F74]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-[#1E293B] truncate">{inv?.invoiceNumber || 'Invoice Preview'}</h2>
                          {inv && <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${statusMeta.cls}`}>{statusMeta.label}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{inv?.branchName || 'BillBull Retail'}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowCustomerHistoryPreview(false)} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5 shrink-0">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="px-4 sm:px-6 py-5 overflow-y-auto flex-1">
                  {customerHistoryPreviewLoading && (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <RefreshCw className="h-8 w-8 text-gray-300 mb-3 animate-spin" />
                      <p className="text-sm text-gray-400">Loading invoice…</p>
                    </div>
                  )}
                  {!customerHistoryPreviewLoading && customerHistoryPreviewError && (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <AlertTriangle className="h-8 w-8 text-red-300 mb-3" />
                      <p className="text-sm text-red-500">{customerHistoryPreviewError}</p>
                    </div>
                  )}
                  {!customerHistoryPreviewLoading && !customerHistoryPreviewError && inv && (() => {
                    const items = (inv.items || []).filter(it => !it.voided);
                    const itemDiscountTotal = items.reduce((s, it) => s + (Number(it.discountAmount) || (Number(it.discountPercent) || 0) * (Number(it.unitPrice ?? it.price ?? 0)) * (Number(it.quantity) || 0) / 100), 0);
                    const billDiscount = Number(inv.billDiscountAmount) || 0;
                    const totalDiscount = Number(inv.discountTotal) || (itemDiscountTotal + billDiscount) || 0;
                    const amountPaid = inv.amountPaid ?? (inv.invoiceTotal - (inv.balance || 0));
                    const cashierName = inv.createdBy ? formatUserDisplayName(inv.createdBy.includes('@') ? inv.createdBy.split('@')[0] : inv.createdBy) : (inv.posCounterName || '—');
                    const invoiceTime = inv.createdAt ? new Date(inv.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null;

                    return (
                      <div className="space-y-4">
                        {/* Meta info card */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5 text-xs bg-gray-50 border border-gray-100 rounded-xl p-4">
                          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Date &amp; Time</span><span className="text-[#1E293B] font-semibold">{inv.invoiceDate || '—'}{invoiceTime ? ` · ${invoiceTime}` : ''}</span></div>
                          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Payment Mode</span><span className="text-[#1E293B] font-semibold">{inv.paymentMode || '—'}</span></div>
                          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Customer</span><span className="text-[#1E293B] font-semibold truncate">{inv.customerName || 'Walk-in Customer'}</span></div>
                          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Cashier</span><span className="text-[#1E293B] font-semibold truncate">{cashierName}</span></div>
                          {inv.posCounterName && (
                            <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Terminal</span><span className="text-[#1E293B] font-semibold">{inv.posCounterName}</span></div>
                          )}
                          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Items</span><span className="text-[#1E293B] font-semibold">{items.length} item{items.length !== 1 ? 's' : ''}</span></div>
                        </div>

                        {/* Line items — internally scrollable so a long invoice doesn't push
                            the totals/footer off screen; header stays pinned while scrolling. */}
                        <div className="border border-gray-100 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto">
                            <div className="max-h-64 overflow-y-auto">
                              <table className="w-full text-xs min-w-[420px]">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                  <tr className="text-gray-500">
                                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">Item</th>
                                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-[10px]">Qty</th>
                                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-[10px]">Price</th>
                                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-[10px]">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {items.length === 0 ? (
                                    <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No line items on this invoice.</td></tr>
                                  ) : items.map((it, i) => {
                                    const imgSrc = it.image
                                      ? (it.image.startsWith('data:') || it.image.startsWith('http') ? it.image : `data:image/jpeg;base64,${it.image}`)
                                      : null;
                                    return (
                                      <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/60' : ''}>
                                        <td className="px-3 py-2.5 text-[#1E293B] align-top">
                                          <div className="flex items-start gap-2.5">
                                            <div className="w-9 h-9 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                                              {imgSrc
                                                ? <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                                                : <Package className="w-4 h-4 text-gray-300" />}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-medium leading-tight">{it.itemName || it.itemCode}</p>
                                              <p className="text-[10px] font-mono text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                                                {it.itemCode && <span>{it.itemCode}</span>}
                                                {(it.pinnedBatchNumber || it.batchNumber) && (
                                                  <span className="text-amber-600 font-sans font-semibold">⛓ {it.pinnedBatchNumber || it.batchNumber}</span>
                                                )}
                                                {(it.discountPercent > 0) && (
                                                  <span className="text-orange-500 font-sans font-semibold">−{it.discountPercent}%</span>
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-[#1E293B] align-top">{it.quantity}</td>
                                        <td className="px-3 py-2.5 text-right text-[#1E293B] align-top">{formatCurrency(it.unitPrice ?? it.price ?? 0)}</td>
                                        <td className="px-3 py-2.5 text-right font-semibold text-[#1E293B] align-top">{formatCurrency(it.netAmount ?? it.lineTotal ?? 0)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        {/* Totals */}
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-1.5 text-xs">
                          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="text-[#1E293B] font-medium">{formatCurrency(inv.subTotal || 0)}</span></div>
                          {totalDiscount > 0 && (
                            <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-orange-600 font-medium">−{formatCurrency(totalDiscount)}</span></div>
                          )}
                          <div className="flex justify-between"><span className="text-gray-500">VAT</span><span className="text-[#1E293B] font-medium">{formatCurrency(inv.taxTotal || 0)}</span></div>
                          <div className="flex items-center justify-between border-t border-gray-200 pt-2 mt-1">
                            <span className="text-sm font-bold text-[#1E293B]">Grand Total</span>
                            <span className="text-lg font-black text-[#327F74]">{formatCurrency(inv.invoiceTotal || 0)}</span>
                          </div>
                          {(inv.balance || 0) > 0 && (
                            <div className="flex justify-between pt-1.5 border-t border-gray-200 mt-1">
                              <span className="text-gray-500">Amount Paid</span>
                              <span className="text-[#1E293B] font-medium">{formatCurrency(amountPaid)}</span>
                            </div>
                          )}
                          {(inv.balance || 0) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-red-500 font-semibold">Balance Due</span>
                              <span className="text-red-500 font-bold">{formatCurrency(inv.balance)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="px-4 sm:px-6 pb-6 pt-2 flex items-center justify-end gap-3 flex-wrap shrink-0 border-t border-gray-100">
                  <button
                    onClick={() => setShowCustomerHistoryPreview(false)}
                    className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    disabled={!inv}
                    onClick={() => {
                      const invNo = inv?.invoiceNumber;
                      const invDate = inv?.invoiceDate;
                      setShowCustomerHistoryPreview(false);
                      if (invDate) { setReprintFilterDateFrom(invDate); setReprintFilterDateTo(invDate); }
                      setReprintFilterInvoiceNo(invNo || '');
                      setShowReprintModal(true);
                      setReprintSelectedInvoice(invNo || null);
                    }}
                    className="h-10 px-6 text-sm font-semibold rounded-xl bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] disabled:opacity-40 flex items-center gap-2 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Print / Reprint
                  </button>
                </div>
              </>
            );
          })()}
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
          reprints: inv.reprintCount || 0,
          lastReprintedBy: inv.lastReprintedBy || null,
          lastReprintedTime: inv.lastReprintedAt
            ? new Date(inv.lastReprintedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
            : null,
        }));
        const filtered = mapped.filter(inv => {
          if (reprintFilterInvoiceNo && !inv.id?.toLowerCase().includes(reprintFilterInvoiceNo.toLowerCase())) return false;
          if (reprintFilterCustomer && !inv.customer.toLowerCase().includes(reprintFilterCustomer.toLowerCase())) return false;
          if (reprintFilterCashier && !inv.cashier.toLowerCase().includes(reprintFilterCashier.toLowerCase())) return false;
          // Matched against the sale's tenders, not an equality test on its stored label:
          // a sale settled Cash + Visa belongs under both Cash and Card.
          if (!matchesPaymentFilter(reprintFilterPayMode, null, inv.payMode)) return false;
          if (reprintFilterStatus !== 'All' && inv.status !== reprintFilterStatus) return false;
          return true;
        });
        const selected = filtered.find(inv => inv.id === reprintSelectedInvoice) || null;
        const statusColor = (s) => s === 'Completed' ? 'bg-green-100 text-green-700' : s === 'Returned' ? 'bg-blue-100 text-blue-700' : s === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
        // Colour by the leading tender; a split sale ("Cash + Visa") reads as multi-tender.
        const payModeColor = (p) => {
          const label = String(p || '');
          if (label.includes('+') || /mixed/i.test(label)) return 'bg-purple-50 text-purple-700';
          if (/cash/i.test(label)) return 'bg-emerald-50 text-emerald-700';
          if (/card|visa|master|amex|jcb/i.test(label)) return 'bg-sky-50 text-sky-700';
          return 'bg-orange-50 text-orange-700';
        };
        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowReprintModal(false)} />
            <div className="relative ml-auto w-full max-w-6xl bg-[#F7F7FA] flex flex-col shadow-2xl h-full overflow-hidden">
              {/* Modal Header */}
              <div className="bg-white border-b border-[#F5C742]/20 px-5 py-3 flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <Printer className="h-5 w-5 text-[#F5C742]" />
                    <span className="text-base font-semibold text-[#1E293B]">Reprint Previous Invoices</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">View and reprint previously generated POS invoices.</p>
                  <p className="text-xs text-[#F5C742] mt-0.5">Showing invoices for: {reprintFilterDateFrom}{reprintFilterDateTo !== reprintFilterDateFrom ? ` → ${reprintFilterDateTo}` : ''}</p>
                </div>
                <button onClick={() => setShowReprintModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X className="h-5 w-5" /></button>
              </div>

              {/* Filter Bar */}
              <div className="bg-white border-b border-[#F5C742]/10 px-5 py-3 shrink-0">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Date From</label><input type="date" value={reprintFilterDateFrom} onChange={e => setReprintFilterDateFrom(e.target.value)} className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5C742]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Date To</label><input type="date" value={reprintFilterDateTo} onChange={e => setReprintFilterDateTo(e.target.value)} className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5C742]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Invoice No.</label><input value={reprintFilterInvoiceNo} onChange={e => setReprintFilterInvoiceNo(e.target.value)} placeholder="SI-POS-..." className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#F5C742]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Customer</label><input value={reprintFilterCustomer} onChange={e => setReprintFilterCustomer(e.target.value)} placeholder="Name / Mobile" className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#F5C742]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Cashier</label><input value={reprintFilterCashier} onChange={e => setReprintFilterCashier(e.target.value)} placeholder="Cashier" className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-[#F5C742]" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Payment Mode</label>
                    <select value={reprintFilterPayMode} onChange={e => setReprintFilterPayMode(e.target.value)} className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5C742]">
                      {PAYMENT_FILTERS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Status</label>
                    <select value={reprintFilterStatus} onChange={e => setReprintFilterStatus(e.target.value)} className="border border-[#F5C742]/30 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5C742]">
                      {['All', 'Completed', 'Returned', 'Cancelled', 'Reprinted'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <button onClick={fetchReprintInvoices} disabled={reprintLoading} className="mt-auto bg-[#F5C742] hover:bg-[#E5B532] disabled:opacity-60 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><Search className="h-3 w-3" />{reprintLoading ? 'Loading…' : 'Search'}</button>
                  <button onClick={() => { setReprintFilterInvoiceNo(''); setReprintFilterCustomer(''); setReprintFilterCashier(''); setReprintFilterPayMode('All'); setReprintFilterStatus('All'); }} className="mt-auto border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset</button>
                </div>
                {reprintError && <p className="text-xs text-red-500 mt-1">{reprintError}</p>}
              </div>

              {/* Main body: list + preview */}
              <div className="flex flex-col lg:flex-row flex-1 min-h-0">
                {/* Invoice List */}
                <div className={`flex flex-col w-full min-h-0 ${selected ? 'lg:w-[55%] max-h-[50vh] lg:max-h-none' : 'lg:w-full'} lg:border-r border-b lg:border-b-0 border-[#F5C742]/10 overflow-hidden`}>
                  <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
                    <span className="text-xs text-gray-500">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''} found</span>
                    <span className="text-xs text-[#F5C742]">Latest first</span>
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
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-xs">
                        <thead className="sticky top-0 bg-[#F7F7FA] z-10">
                          <tr className="text-gray-500 border-b border-[#F5C742]/10">
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
                                  <button onClick={e => { e.stopPropagation(); setReprintSelectedInvoice(inv.id); }} className="border border-[#F5C742]/30 text-[#F5C742] text-[10px] px-2 py-0.5 rounded hover:bg-[#F5C742]/5">View</button>
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
                      </div>
                    )}
                  </div>
                </div>

                {/* Receipt Preview Panel */}
                {selected && (
                  <div className="w-full lg:w-[45%] flex flex-col overflow-hidden min-h-0 bg-white">
                    <div className="px-4 py-2.5 border-b border-[#F5C742]/10 bg-[#F7F7FA] flex items-center justify-between shrink-0">
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
                      <div className="mt-3 bg-[#F7F7FA] border border-[#F5C742]/20 rounded p-3 space-y-1 text-xs">
                        <p className="font-semibold text-[#1E293B] mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5 text-[#F5C742]" />Invoice Info</p>
                        {[['Invoice No.', selected.id], ['Date', selected.date || ''], ['Customer', selected.customer], ['Cashier', selected.cashier], ['Terminal', selected.terminal]].map(([k, v]) => (
                          <div key={k} className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">{k}:</span><span className="text-[#1E293B]">{v}</span></div>
                        ))}
                      </div>
                      {/* Audit / Reprint History */}
                      <div className="mt-3 bg-[#F7F7FA] border border-[#F5C742]/20 rounded p-3 space-y-1 text-xs">
                        <p className="font-semibold text-[#1E293B] mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5 text-[#F5C742]" />Audit / Reprint History</p>
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
                    <div className="border-t border-[#F5C742]/10 p-3 bg-white flex items-center gap-2 shrink-0 flex-wrap">
                      <button onClick={() => { setReprintPrintMode('thermal'); setReprintConfirmOpen(true); }} disabled={selected.status === 'Cancelled' || reprintPrinting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded ${selected.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'}`}>
                        <Printer className="h-3.5 w-3.5" />{reprintPrinting && reprintPrintMode === 'thermal' ? 'Printing…' : 'Print Thermal Receipt'}
                      </button>
                      <button onClick={() => { setReprintPrintMode('a4'); setReprintConfirmOpen(true); }} disabled={selected.status === 'Cancelled' || reprintPrinting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded ${selected.status === 'Cancelled' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-[#F5C742]/40 text-[#F5C742] hover:bg-[#F5C742]/5'}`}>
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
              <div className="bg-white border-t border-[#F5C742]/10 px-5 py-2.5 flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
                  <Info className="h-3 w-3 shrink-0" />Reprint does not create a new invoice. Every reprint is recorded in the audit log.
                </div>
                <button onClick={() => setShowReprintModal(false)} className="ml-auto border border-gray-300 text-gray-600 text-xs px-4 py-1.5 rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cash Drop / Share Receipt / Print fallback feedback toasts */}
      <PosFeedbackToasts
        cashDropFeedback={cashDropFeedback}
        receiptShareFeedback={receiptShareFeedback}
        printFeedback={printFeedback}
        onDismissPrintFeedback={() => setPrintFeedback(null)}
      />

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
                  items: activeItems.map(item => {
                    const taxRate = item.taxRate != null ? item.taxRate : (posSettings?.taxEnabled === false ? 0 : toNumber(posSettings?.branchDefaultVatRate, 0));
                    const { taxableAmount, taxAmount, total: lineTotal } = computeLineTaxTotals({
                      netAfterDiscount: item.total,
                      taxPercent: taxRate,
                    });
                    return {
                      itemCode: item.code || item.barcode || item.id,
                      description: item.name,
                      quantity: item.quantity,
                      price: item.price,
                      discount: item.discount || 0,
                      taxRate,
                      taxableAmount,
                      taxAmount,
                      lineTotal,
                    };
                  }),
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
          const mapped = items.map(it => {
            const price = toNumber(it.unitPrice || it.rate || it.price, 0);
            const quantity = toNumber(it.quantity || it.qty, 1);
            const discount = toNumber(it.discountPercent || it.discount, 0);
            return {
              id: it.productId || it.id || it.itemCode,
              name: it.productName || it.itemName || it.name || '',
              code: it.productCode || it.itemCode || it.code || '',
              price,
              quantity,
              discount,
              taxRate: toNumber(it.taxRate || it.vatRate, 0),
              total: price * quantity * (1 - discount / 100),
              unit: it.unit || 'Pcs',
              batchNumber: it.batchNumber || null,
              serialNumber: it.serialNumber || null,
            };
          });
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
              <div className="flex flex-col md:flex-row flex-1 min-h-0">
                {/* Left: list */}
                <div className="w-full md:w-64 max-h-[35vh] md:max-h-none min-h-0 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col bg-gray-50 shrink-0">
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
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
                        <div className="rounded-xl border border-gray-100 overflow-hidden mb-4 overflow-x-auto">
                          <table className="w-full min-w-[420px] text-xs">
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
                              <span>VAT ({toNumber((sel || selOrder).vatRate || (sel || selOrder).taxRate, 0)}%)</span>
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
                      <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap gap-2 bg-gray-50 shrink-0">
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
      {showPriceCheck && (
        <PriceCheck
          showPriceCheck={showPriceCheck}
          setShowPriceCheck={setShowPriceCheck}
          priceCheckQuery={priceCheckQuery}
          setPriceCheckQuery={setPriceCheckQuery}
          priceCheckResult={priceCheckResult}
          setPriceCheckResult={setPriceCheckResult}
          currentTerminal={currentTerminal}
          currentSession={currentSession}
          handleProductSelection={handleProductSelection}
        />
      )}

      {/* ─── SEARCH PRODUCTS MODAL ─── */}
      {showProductSearch && (
        <ProductSearch
          showProductSearch={showProductSearch}
          setShowProductSearch={setShowProductSearch}
          productSearchQuery={productSearchQuery}
          setProductSearchQuery={setProductSearchQuery}
          productSearchResults={productSearchResults}
          productSearchLoading={productSearchLoading}
          handleProductSelection={handleProductSelection}
          showFeedback={showFeedback}
          formatCurrency={formatCurrency}
        />
      )}

      {/* ─── CREDIT BALANCE MODAL ─── */}
      {showCreditBalance && (
        <CreditBalance
          showCreditBalance={showCreditBalance}
          setShowCreditBalance={setShowCreditBalance}
          creditBalanceQuery={creditBalanceQuery}
          setCreditBalanceQuery={setCreditBalanceQuery}
          creditBalanceResult={creditBalanceResult}
          setCreditBalanceResult={setCreditBalanceResult}
          posCustomers={posCustomers}
        />
      )}

      {/* ─── LAYAWAYS LIST MODAL ─── */}
      {showLayawaysList && (
        <LayawaysList
          showLayawaysList={showLayawaysList}
          setShowLayawaysList={setShowLayawaysList}
          layawaysFilterStatus={layawaysFilterStatus}
          setLayawaysFilterStatus={setLayawaysFilterStatus}
          layawaysFilterCustomer={layawaysFilterCustomer}
          setLayawaysFilterCustomer={setLayawaysFilterCustomer}
          layawaysFilterNo={layawaysFilterNo}
          setLayawaysFilterNo={setLayawaysFilterNo}
          selectedLayawayId={selectedLayawayId}
          setSelectedLayawayId={setSelectedLayawayId}
          layawaysList={layawaysList}
          layawaysLoading={layawaysLoading}
          layawaysError={layawaysError}
          selectedLayawayDetail={selectedLayawayDetail}
          layawayBusyId={layawayBusyId}
          loadLayaways={loadLayaways}
          startLayawayConversion={startLayawayConversion}
          handleCancelLayaway={handleCancelLayaway}
          setShowSaveLayaway={setShowSaveLayaway}
        />
      )}

      {/* ─── CONFIRM ACTION MODAL ─── */}
      {confirmAction && (
        <ConfirmAction
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
        />
      )}

      {/* ─── SAVE LAYAWAY MODAL ─── */}
      {showSaveLayaway && (() => {
        // Can't create a new layaway while converting an existing one.
        if (activeLayawayId) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        const dep = saveLayawayDepositReq ? saveLayawayFields.amountTendered : 0;
        const balance = Math.max(0, total - dep);
        const hasCustomer = !!selectedCustomerData && selectedCustomerData.id !== WALK_IN_CUSTOMER.id;
        const activeCartItems = currentInvoice.items.filter(i => !i.isVoided);
        const canSave = hasCustomer && activeCartItems.length > 0 && !saveLayawayBusy;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                        <table className="w-full min-w-[480px] text-xs">
                          <thead><tr className="text-gray-400 border-b border-gray-100">{['Item', 'Qty', 'Rate', 'Disc', 'VAT', 'Total'].map(h => <th key={h} className={`px-3 py-1.5 text-left ${h !== 'Item' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                          <tbody>
                            {activeCartItems.length === 0 && currentInvoice.items.filter(i => i.isVoided).length === 0 ? (
                              <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No items in cart</td></tr>
                            ) : currentInvoice.items.map((item, i) => (
                              // Voided line: muted red + [VOID] tag + negative amounts (no
                              // strike-through). Excluded from the total; disclosed in the
                              // Voided Items summary row below.
                              <tr key={i} className={`border-b border-gray-50 ${item.isVoided ? 'bg-red-50/60' : ''}`}>
                                <td className="px-3 py-1.5">
                                  <span className={item.isVoided ? 'text-red-500' : 'text-[#1E293B]'}>{item.name}</span>
                                  {item.isVoided && <span className="ml-1 text-[9px] font-bold text-red-500">[VOID]</span>}
                                </td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'text-red-500' : ''}`}>{item.isVoided ? `- ${item.quantity}` : item.quantity}</td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'text-red-500' : ''}`}><CurrencyAmount amount={item.price} prefix={item.isVoided ? '- ' : ''} /></td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'text-red-500' : 'text-red-500'}`}>{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                                <td className={`px-3 py-1.5 text-right ${item.isVoided ? 'text-red-500' : ''}`}>{toNumber(item.taxRate, 0)}%</td>
                                <td className={`px-3 py-1.5 text-right font-semibold ${item.isVoided ? 'text-red-500' : ''}`}><CurrencyAmount amount={item.quantity * item.price * (1 - item.discount / 100)} prefix={item.isVoided ? '- ' : ''} /></td>
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
                          {/* A deposit is collected exactly like any other POS payment, with
                              the same panel, modals and validation. Unlike a sale it need not
                              cover the full amount -- whatever is allocated becomes the deposit
                              and the rest stays as the layaway balance. */}
                          <PaymentAllocationPanel
                            payment={saveLayawayPayment}
                            compatibility={checkoutCompatibility}
                            bankAccounts={checkoutOnlineBankAccounts}
                            bankAccountsLoading={checkoutOnlineBankAccountsLoading}
                            selectedCustomerName={selectedCustomerData?.name}
                            methods={DELIVERY_SETTLE_METHODS}
                            compact
                          />
                        </>
                      )}
                      <div className="flex justify-between items-center py-1 bg-[#FFF8DC] rounded px-2">
                        <span className="text-xs text-gray-600">Balance Amount</span>
                        <span className="text-sm font-bold text-amber-700"><CurrencyAmount amount={balance} /></span>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Due / Expiry Date</label>
                        <input type="date" value={saveLayawayDueDate} min={todayInputDate()} onChange={e => setSaveLayawayDueDate(e.target.value)} className="w-full border border-[#327F74]/30 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#327F74]" />
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
              <div className="bg-white border-t border-[#327F74]/10 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                <button onClick={() => setShowSaveLayaway(false)} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded hover:bg-gray-50">Cancel</button>
                <button disabled={!canSave} onClick={() => saveCurrentLayaway(false)} className="border border-[#327F74]/40 text-[#327F74] text-sm px-4 py-2 rounded hover:bg-[#327F74]/5 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"><Archive className="h-3.5 w-3.5" />{saveLayawayBusy ? 'Saving…' : 'Save Layaway'}</button>
                <button disabled={!canSave} onClick={() => saveCurrentLayaway(true)} className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] text-sm px-4 py-2 rounded flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"><Printer className="h-3.5 w-3.5" />Save &amp; Print Receipt</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- SALES RETURN -----------------------------------------------
          Section 4/26 - the previous inline 4-step wizard lived here (~630 lines) and was
          a second, divergent implementation of the return workflow. It is replaced by the
          shared SalesReturnScreen, the same component Customer & Sales -> Sales Return
          renders. POS supplies only its context; every rule lives in the shared layer. */}
      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] h-[92vh] overflow-hidden">
            <SalesReturnScreen
              entryPoint={ENTRY_POINT.POS}
              embedded
              posContext={{
                branchId: currentTerminal?.branchId ?? null,
                terminalId: currentTerminal?.terminalId ?? null,
                counterName: currentTerminal?.counterName ?? null,
                // Only a genuinely open session counts. A CLOSED or awaiting-closure session
                // must not authorise a cash refund out of a drawer that is already counted,
                // so it is passed as null and the UI disables Cash Refund accordingly.
                sessionId: isSessionActive ? (currentSession?.id ?? null) : null,
                tradingDate: currentSession?.tradingDate ?? null,
                cashierName: currentSession?.openedBy ?? null,
              }}
              onClose={() => setShowReturn(false)}
              onComplete={() => {
                // Deliberately does NOT close the modal. Closing here unmounted
                // SalesReturnScreen the instant the return posted, which destroyed the
                // Credit Voucher card and the receipt print buttons before the cashier
                // could see or use them — the voucher existed in the database but the
                // cashier only ever saw a toast. The screen stays up showing its
                // completion state; the cashier leaves via "Back to POS", which calls
                // onClose. Same reasoning as the Sales Return register entry point.
              }}
            />
          </div>
        </div>
      )}

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
      {showSerialBatch && (
        <SerialBatch
          setShowSerialBatch={setShowSerialBatch}
          serialBatchQuery={serialBatchQuery}
          setSerialBatchQuery={setSerialBatchQuery}
          serialBatchResult={serialBatchResult}
          setSerialBatchResult={setSerialBatchResult}
          serialBatchSubView={serialBatchSubView}
          setSerialBatchSubView={setSerialBatchSubView}
          serialBatchReturnQty={serialBatchReturnQty}
          setSerialBatchReturnQty={setSerialBatchReturnQty}
          serialBatchReturnReason={serialBatchReturnReason}
          setSerialBatchReturnReason={setSerialBatchReturnReason}
          serialBatchReturnCondition={serialBatchReturnCondition}
          setSerialBatchReturnCondition={setSerialBatchReturnCondition}
          serialBatchRefundMethod={serialBatchRefundMethod}
          setSerialBatchRefundMethod={setSerialBatchRefundMethod}
          serialBatchInvoiceNo={serialBatchInvoiceNo}
          setSerialBatchInvoiceNo={setSerialBatchInvoiceNo}
          serialBatchItemCode={serialBatchItemCode}
          setSerialBatchItemCode={setSerialBatchItemCode}
          serialBatchCustomerMobile={serialBatchCustomerMobile}
          setSerialBatchCustomerMobile={setSerialBatchCustomerMobile}
          serialBatchSelectedItem={serialBatchSelectedItem}
          setSerialBatchSelectedItem={setSerialBatchSelectedItem}
          currentTerminal={currentTerminal}
          currentSession={currentSession}
          setShowServiceRepair={setShowServiceRepair}
          setServiceView={setServiceView}
          setServiceJobStep={setServiceJobStep}
        />
      )}

      {/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}
      {showServiceRepair && (
        <ServiceRepair
          showServiceRepair={showServiceRepair}
          setShowServiceRepair={setShowServiceRepair}
          serviceView={serviceView}
          setServiceView={setServiceView}
          serviceJobStep={serviceJobStep}
          setServiceJobStep={setServiceJobStep}
          serviceDetailTab={serviceDetailTab}
          setServiceDetailTab={setServiceDetailTab}
          serviceJobFilter={serviceJobFilter}
          setServiceJobFilter={setServiceJobFilter}
        />
      )}

      {/* POS Configure & Customize Panel */}
      {showPOSConfig && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowPOSConfig(false)} />
          <div className="relative bg-white w-full sm:w-80 h-full shadow-2xl flex flex-col overflow-hidden">
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

              {/* Tax Mode / Default VAT Rate — Branch-level configuration (moved out of POS
                  Settings; owned by BranchTaxConfiguration). Shown here read-only so cashiers
                  understand the active mode; edited from Branch Settings > Tax Configuration. */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Tax Configuration</h3>
                <div className="rounded-xl border-2 border-gray-100 bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Tax Enabled</span>
                    <span className="font-semibold text-[#1E293B]">{posSettings?.taxEnabled === false ? 'Off' : 'On'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Tax Mode</span>
                    <span className="font-semibold text-[#1E293B]">{posSettings?.taxInclusive ? 'Inclusive' : 'Exclusive'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Branch Default VAT Rate</span>
                    <span className="font-semibold text-[#1E293B]">{toNumber(posSettings?.branchDefaultVatRate, 0)}%</span>
                  </div>
                  <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-200">
                    Managed centrally in Branch Settings &gt; Tax Configuration — applies to this branch across POS, Sales, and every other module.
                  </p>
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
              <Button
                disabled={settingsSaving}
                onClick={async () => {
                  setSettingsSaving(true);
                  try {
                    const saved = await savePosSettings({
                      ...(posSettings || {}),
                      defaultLayout: posTemplate,
                      layoutHideCategoryPanel: hideCategoriesPanel,
                      layoutHideItemsPanel: hideItemsPanel,
                      layoutHiddenPanelButtons: [...hiddenPanelButtons].join(','),
                    });
                    setPosSettings(prev => mergeSavedPosSettings(prev, saved));
                  } catch (e) {
                    console.warn('POS layout save failed', e);
                  } finally {
                    setSettingsSaving(false);
                    setShowPOSConfig(false);
                  }
                }}
                className="w-full bg-[#F5C742] hover:bg-[#e6b838] disabled:opacity-60 text-[#1E293B] font-semibold"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {settingsSaving ? 'Saving…' : 'Apply & Close'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ NEW DELIVERY ORDER modal (+ nested Add-Address) ═══════════════ */}
      {showDeliveryModal && (
        <NewDeliveryOrder
          customerOptions={customerOptions}
          currentInvoice={currentInvoice}
          formatCurrency={formatCurrency}
          openQuickCustomerModal={openQuickCustomerModal}
          handleOutForDelivery={handleOutForDelivery}
          showDeliveryModal={showDeliveryModal}
          setShowDeliveryModal={setShowDeliveryModal}
          deliveryCustomerId={deliveryCustomerId}
          setDeliveryCustomerId={setDeliveryCustomerId}
          deliveryCustomerSearch={deliveryCustomerSearch}
          setDeliveryCustomerSearch={setDeliveryCustomerSearch}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          deliveryShowAddressPicker={deliveryShowAddressPicker}
          setDeliveryShowAddressPicker={setDeliveryShowAddressPicker}
          deliveryDate={deliveryDate}
          setDeliveryDate={setDeliveryDate}
          deliveryTimeSlot={deliveryTimeSlot}
          setDeliveryTimeSlot={setDeliveryTimeSlot}
          deliveryInstructions={deliveryInstructions}
          setDeliveryInstructions={setDeliveryInstructions}
          deliveryCharge={deliveryCharge}
          setDeliveryCharge={setDeliveryCharge}
          deliveryNotes={deliveryNotes}
          setDeliveryNotes={setDeliveryNotes}
          deliveryPersons={deliveryPersons}
          deliveryPersonsLoading={deliveryPersonsLoading}
          deliveryDriver={deliveryDriver}
          setDeliveryDriver={setDeliveryDriver}
          deliveryValidationErrors={deliveryValidationErrors}
          setDeliveryValidationErrors={setDeliveryValidationErrors}
          deliveryOutLoading={deliveryOutLoading}
          deliveryShowAddAddressModal={deliveryShowAddAddressModal}
          setDeliveryShowAddAddressModal={setDeliveryShowAddAddressModal}
          deliveryNewAddress={deliveryNewAddress}
          setDeliveryNewAddress={setDeliveryNewAddress}
          deliveryAddressSaving={deliveryAddressSaving}
          deliveryAddressError={deliveryAddressError}
          setDeliveryAddressError={setDeliveryAddressError}
          handleSaveDeliveryNewAddress={handleSaveDeliveryNewAddress}
        />
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

        const canFinalizeSettlement = deliverySettlePayment.canSettle
          && deliverySettlePayment.paymentLines.length > 0;
        const displayPaymentMode = deliverySettleFields.paymentSummary;

        const handleFinalize = async (supervisorOverrideOrEvent = null) => {
          if (!sel || selBalance <= 0 || deliverySettleLoading || !canFinalizeSettlement) return;
          setDeliverySettleLoading(true);
          const supervisorOverride = (supervisorOverrideOrEvent && !supervisorOverrideOrEvent.nativeEvent) ? supervisorOverrideOrEvent : null;
          
          try {
            const payload = {
              ...deliverySettleFields,
              sessionId: currentSession?.id || null,
              terminalId: currentTerminal?.terminalId || null,
              branchId: currentTerminal?.branchId || null,
            };
            if (supervisorOverride) {
              if (supervisorOverride.email) payload.supervisorOverrideEmail = supervisorOverride.email;
              if (supervisorOverride.password) payload.supervisorOverridePassword = supervisorOverride.password;
              if (supervisorOverride.pin) payload.supervisorOverridePin = supervisorOverride.pin;
            }

            const settledInvoice = await settleDeliveryOrder(sel.id, payload);

            try {
              // recordPayment() stamps the invoice's own paymentMode per settlement leg
              // (last write wins for a split Cash+Card settle), so the receipt shows the
              // mode actually selected here rather than trusting that stamp.
              const custRec = customerOptions.find(c => c.code === settledInvoice?.customerCode);
              const receiptInvoice = { ...settledInvoice, paymentMode: displayPaymentMode };
              if (tplInvoicePaper === 'A4') {
                const template = resolveInvoiceA4TemplateFor(receiptInvoice);
                const data = buildPosPrintData(receiptInvoice, tplInvoiceFooter, customerOptions, isTaxInvoiceDocument(receiptInvoice) ? tplInvoiceHeader : tplReceiptHeader);
                const options = { companyProfile: { companyName: tplOutletName, trn: effectiveOutletTrn, address: tplOutletAddress, phone: tplOutletPhone, currency: 'AED', logoUrl: tplLogoDataUrl || company?.logoUrl || undefined, stampUrl: tplStampDataUrl || undefined, showStampInPrint: USE_NEW_POS_PRINT_TEMPLATE ? !!tplStampDataUrl : tplInvoiceShowStamp } };
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
                  customerTrn: custRec?.trn,
                  customerAddress: custRec?.address,
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
            deliverySettlePayment.clearLines();
            await loadDeliveryOrders();
            syncPosData();
          } catch (err) {
            console.error('Delivery settle failed', err);
            const errMsg = err?.response?.data?.message || err.message;
            if (err?.response?.status === 403 && errMsg === 'SUPERVISOR_AUTHORIZATION_REQUIRED') {
                requestApproval({
                  supervisorAction: { type: 'DELIVERY_SETTLEMENT', retry: handleFinalize },
                  resetEmail: true,
                });
            } else {
                alert(errMsg || 'Failed to finalize delivery. Please try again.');
            }
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
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-3">
                <div className="flex-1 min-w-[160px] relative">
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
                  <div className="overflow-x-auto">
                  <div className="min-w-[560px]">
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
                          <button type="button" onClick={() => { setDeliverySettleSelected(isSelected ? null : o); deliverySettlePayment.clearLines(); }}
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
                              {/* The same allocation panel the till uses. A delivery balance
                                  cannot be settled by putting it back on account -- that is
                                  simply leaving it unpaid -- so CREDIT is not offered here. */}
                              <div className="mb-3">
                                <PaymentAllocationPanel
                                  payment={deliverySettlePayment}
                                  compatibility={checkoutCompatibility}
                                  bankAccounts={checkoutOnlineBankAccounts}
                                  bankAccountsLoading={checkoutOnlineBankAccountsLoading}
                                  selectedCustomerName={o.customer}
                                  methods={DELIVERY_SETTLE_METHODS}
                                  compact
                                />
                              </div>

                              <button type="button"
                                disabled={selBalance === 0 || deliverySettleLoading || !canFinalizeSettlement}
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
                  </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Phase 12 - Session Transferred/Invalidated Overlay */}
      {sessionInvalidated && (
        <SessionInvalidatedOverlay
          sessionInvalidReason={sessionInvalidReason}
          onReturnToDashboard={() => {
            acknowledgeSessionInvalidation();
            setCurrentView('dashboard');
          }}
        />
      )}
    </div>
    </BusinessDayStatusProvider>
  );
}

