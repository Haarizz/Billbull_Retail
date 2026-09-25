import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CHARACTERIZATION — the architecture of POSSales.jsx as an orchestration component.
 *
 * This is a STRUCTURAL suite, not a behaviour suite. Every behaviour named here is already
 * characterized by the hook/component suite that owns it (useCheckout, useCart, usePosSession,
 * useSessionClosure, useDelivery, useLayaway, useHeldSales, usePosPrinting, useProductEntry,
 * useProductCatalog, useTemplateSettings, useSupervisorApproval, the Checkout* components, the
 * session overlays/dialogs, PosFeedbackToasts, PaymentAllocationPanel). Nothing is duplicated
 * from those.
 *
 * What this suite pins is the SHAPE of the remaining orchestrator, so the next phase of the
 * standalone-POS extraction cannot drift by accident:
 *
 *   1. the hook inventory and the order the hooks are called in
 *   2. the three late-bound refs that break the hook-ordering cycles, and where they are assigned
 *   3. single ownership — the state each hook owns is not re-declared in POSSales
 *   4. the already-extracted child components are still rendered from POSSales (no regression
 *      back to inline markup, no accidental second call site)
 *   5. the top-level view/overlay/modal region anchors, in source order
 *   6. the cross-feature orchestration handlers POSSales still owns, and the ordering
 *      constraints between them
 *   7. blunt size/shape counters (state, refs, effects) as a drift alarm
 *   8. the coupling budget of the candidate extraction boundaries identified in the
 *      architecture pass, so an "unrelated" edit that widens one of them fails here
 *
 * POSSales.jsx is not rendered by this project's test setup (a ~12k-line component with a
 * ~110-entry and a ~250-entry prop bag and two dozen network-touching effects), so — exactly as
 * usePosSession.characterization and posShowFeedback.characterization already do — the wiring is
 * asserted against the real source.
 *
 * Known current state pinned as-is (do NOT fix here):
 *   - Seven imports are dead: TerminalStatusBadge, A4PreviewFrame, A4LivePreview, ThermalMock,
 *     ServiceJobA4Preview, PaperSizePicker and ImageUploadBox each appear exactly once in the
 *     file — on their own import line.
 *   - `showA4CheckoutPreview` is a hard-coded `false`, so the checkoutA4Html memo and the second
 *     useA4BlobUrl call are dead weight kept live behind that constant.
 *   - The Service & Repair screen (~475 lines, now POS/features/service/ServiceRepair.jsx) renders
 *     from `const mockJobs = []` — inert placeholder UI, not a wired feature.
 *   - `checkoutRemarks` is still collected and never sent anywhere (see CheckoutRemarks' suite).
 *   - The counters in "shape counters" are EXPECTED to change as extraction proceeds; when a
 *     deliberate extraction moves state or an effect out, update the number in the same commit.
 */

// EOL-normalised: POSSales.jsx is checked out with CRLF on Windows.
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
const SRC = read('../../POSSales.jsx');
const LINES = SRC.split('\n');

/** Index of a needle that must appear at least once. */
const at = (needle) => {
  const i = SRC.indexOf(needle);
  expect(i, `missing anchor: ${needle}`).toBeGreaterThan(-1);
  return i;
};
/** Number of occurrences of a literal needle. */
const count = (needle) => SRC.split(needle).length - 1;
/** Top-level declarations only: the component body sits at exactly two spaces of indent. */
const topLevel = (re) => LINES.filter((l) => re.test(l));

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 1. HOOK INVENTORY AND CALL ORDER.
 *
 * The order is load-bearing, not cosmetic: each entry is declared above its first reader, and
 * several hooks take a value produced by an earlier one. The per-hook suites document why; this
 * pins that the sequence itself does not move.
 */
describe('hook inventory and call order', () => {
  // Anchors in the exact order POSSales calls them.
  const CALL_ORDER = [
    ['useCompany', 'const { company } = useCompany();'],
    ['useBranch', 'const { branches } = useBranch();'],
    ['usePosSession', '} = usePosSession({ posSettings, handlersRef: sessionLifecycleHandlersRef });'],
    ['usePermissions', 'const { hasAnyRole } = usePermissions();'],
    ['usePosBehaviourSettings', '} = usePosBehaviourSettings({ posSettings, setPosSettings, businessDayRefreshRef });'],
    ['useSupervisorApproval', '} = useSupervisorApproval();'],
    ['useSessionClosure', '} = useSessionClosure({'],
    ['useCart', '} = useCart({ posSettings });'],
    ['useProductCatalog', '} = useProductCatalog({ currentTerminal, currentSession, barcodeInput, posActionMode });'],
    ['useTemplateSettings', '} = useTemplateSettings({ branches, company });'],
    ['usePosPrinting', '} = usePosPrinting({'],
    ['useLayaway', '} = useLayaway({'],
    ['usePaymentManager (checkout)', 'const checkoutPayment = usePaymentManager({'],
    ['usePaymentManager (delivery settle)', 'const deliverySettlePayment = usePaymentManager({ invoiceTotal: deliverySettleBalance });'],
    ['usePaymentManager (layaway deposit)', 'const saveLayawayPayment = usePaymentManager({ invoiceTotal: saveLayawayTotal });'],
    ['useCheckoutCapabilities', 'const checkoutCompatibility = useCheckoutCapabilities(showPaymentDialog || showSaveLayaway);'],
    ['useIdleTimeout', '  useIdleTimeout({'],
    ['useProductEntry', '} = useProductEntry({'],
    ['useDelivery', '} = useDelivery({'],
    ['useHeldSales', '} = useHeldSales({'],
    ['useCashDrawer', 'const { openCashDrawer } = useCashDrawer(posSettings);'],
    ['useCheckout', '} = useCheckout({'],
  ];

  it('has exactly these 22 feature/context hook call sites', () => {
    expect(CALL_ORDER).toHaveLength(22);
    for (const [name, anchor] of CALL_ORDER) {
      expect(SRC.indexOf(anchor), `missing hook call site: ${name}`).toBeGreaterThan(-1);
    }
  });

  it('calls them in this order', () => {
    const positions = CALL_ORDER.map(([name, anchor]) => [name, at(anchor)]);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i][1], `${positions[i][0]} must follow ${positions[i - 1][0]}`)
        .toBeGreaterThan(positions[i - 1][1]);
    }
  });

  it.each([
    ['usePosSession', 1], ['usePosBehaviourSettings', 1], ['useSupervisorApproval', 1],
    ['useSessionClosure', 1], ['useCart', 1], ['useProductCatalog', 1], ['useTemplateSettings', 1],
    ['usePosPrinting', 1], ['useLayaway', 1], ['useProductEntry', 1], ['useDelivery', 1],
    ['useHeldSales', 1], ['useCashDrawer', 1], ['useCheckout', 1], ['useCheckoutCapabilities', 1],
    ['useIdleTimeout', 1], ['useCompany', 1], ['useBranch', 1], ['usePermissions', 1],
    // The only deliberately repeated hooks: one Payment Manager per settlement surface
    // (checkout / delivery settle / layaway deposit) and one A4 blob url per preview.
    ['usePaymentManager', 3], ['useA4BlobUrl', 2],
  ])('%s is called exactly %i time(s)', (hook, times) => {
    expect(SRC.match(new RegExp(`[^A-Za-z0-9_]${hook}\\(`, 'g')) || []).toHaveLength(times);
  });

  it('creates no context of its own; BusinessDayStatusProvider is the one provider it renders', () => {
    expect(SRC).not.toContain('createContext');
    expect(SRC).not.toContain('PosWorkspaceContext');
    expect(count('<BusinessDayStatusProvider')).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 2. LATE-BOUND REFS.
 *
 * Three hook-ordering cycles are broken by a ref declared before the hook that reads it and
 * assigned during render once every binding it closes over exists. Each assignment must stay
 * BELOW the declarations it captures; that is the whole contract.
 */
describe('late-bound handler/loader refs', () => {
  it.each([
    ['sessionLifecycleHandlersRef', 'const sessionLifecycleHandlersRef = useRef(null);', 'sessionLifecycleHandlersRef.current = {'],
    ['sessionClosureLoadersRef', 'const sessionClosureLoadersRef = useRef(null);', 'sessionClosureLoadersRef.current = { loadXReport, loadDaySummary, syncPosData };'],
    ['syncPosDataRef', 'const syncPosDataRef = useRef(null);', 'syncPosDataRef.current = syncPosData;'],
  ])('%s is declared once and assigned once, declaration before assignment', (_n, decl, assign) => {
    expect(count(decl)).toBe(1);
    expect(count(assign)).toBe(1);
    expect(at(decl)).toBeLessThan(at(assign));
  });

  it('the lifecycle handler bag still carries exactly its five entries', () => {
    const start = at('sessionLifecycleHandlersRef.current = {');
    const body = SRC.slice(start, SRC.indexOf('\n  };', start));
    for (const key of ['loadInitialPosSettings', 'showPreviousDayBlock', 'showClosureRequiredBlock',
      'resetDiscovery: handleDiscoveryDismiss', 'resetForInvalidatedSession:']) {
      expect(body, key).toContain(key);
    }
  });

  it('the invalidated-session reset writes the cart, customer, four dialogs and the checkout phase in that order', () => {
    const start = at('resetForInvalidatedSession: () => {');
    const body = SRC.slice(start, SRC.indexOf('\n    },', start));
    const order = ['setCurrentInvoice(', 'setSelectedCustomer(', 'setShowPaymentDialog(false)',
      'setShowCloseSessionDialog(false)', 'setShowCashDropDialog(false)', 'setShowCustomerSelector(false)',
      "setCheckoutPhase('payment')", 'setCheckoutError(null)'];
    let prev = -1;
    for (const step of order) {
      const i = body.indexOf(step);
      expect(i, step).toBeGreaterThan(prev);
      prev = i;
    }
  });

  it('the closure loader bag is assigned below all three loaders it captures', () => {
    const assign = at('sessionClosureLoadersRef.current = { loadXReport, loadDaySummary, syncPosData };');
    for (const decl of ['const loadXReport = async', 'const loadDaySummary = async', 'const syncPosData = useCallback(']) {
      expect(at(decl), decl).toBeLessThan(assign);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 3. SINGLE OWNERSHIP.
 *
 * Each feature hook is the sole owner of its state; POSSales must not re-declare it. The four
 * documented exceptions are asserted positively: they are POSSales-owned on purpose, because a
 * value the hook takes as an input derives from them.
 */
describe('state ownership boundaries', () => {
  const declaresState = (name) => new RegExp(`^ {2}const \\[${name},`, 'm').test(SRC);

  it.each([
    // useCart
    'currentInvoice',
    // useProductCatalog
    'posProducts', 'searchQuery', 'selectedCategory', 'showProductSearch', 'barcodeSuggestions',
    // useProductEntry
    'lastScannedItem', 'selectedProductForEntry', 'isItemEntryOpen',
    // useCheckout
    'checkoutPhase', 'checkoutLoading', 'checkoutError', 'checkoutFinalizing', 'lastPaidInvoice',
    'checkoutRemarks',
    // useSessionClosure
    'showCloseSessionDialog', 'closingDenominations', 'cardSettlementAmount', 'varianceApproval',
    'showCancelClosureDialog', 'showCashierAuthDialog', 'forceCloseReason',
    // useLayaway
    'layawaysList', 'activeLayawayId', 'activeLayawayDeposit', 'showLayawaysList',
    // useDelivery
    'deliveryAddress', 'showDeliveryModal', 'deliveryOrders', 'deliveryPersons',
    'showDeliverySettleModal',
    // useHeldSales
    'heldSales', 'holdBusy',
    // usePosPrinting
    'printFeedback',
    // useSupervisorApproval
    'showSupervisorPin', 'supervisorPinValue', 'pendingVoidItemId',
    // usePosBehaviourSettings
    'settingsDraft', 'settingsSaving',
  ])('POSSales does not re-declare hook-owned state: %s', (name) => {
    expect(declaresState(name)).toBe(false);
  });

  it.each([
    ['deliverySettleSelected', 'deliverySettleBalance derives from it and useDelivery takes clearDeliverySettleLines'],
    ['checkoutSettling', 'checkoutThermalHtml reads it and useCheckout takes checkoutThermalHtml'],
    ['posSettings', 'usePosSession reads the heartbeat interval from it'],
    ['sessionToClose', 'loadXReport, the approval dispatcher and businessDayClosureFlowActive all touch it'],
  ])('POSSales deliberately still owns %s', (name) => {
    expect(declaresState(name)).toBe(true);
  });

  it('the four session-closure grant refs stay POSSales-owned', () => {
    for (const ref of ['cashierAuthTargetRef', 'closureAuthGrantRef', 'varianceGrantRef', 'forceCloseContextRef']) {
      expect(count(`const ${ref} = useRef(`), ref).toBe(1);
    }
  });

  it('the checkout preview freeze ref and the two payment mirror refs stay POSSales-owned', () => {
    for (const ref of ['checkoutPreviewFreezeRef', 'checkoutPaymentLinesRef', 'checkoutEffectiveDueRef']) {
      expect(count(`const ${ref} = useRef(`), ref).toBe(1);
    }
    // Mirrors are written during render, every render, on purpose — the voucher callbacks read
    // them so they can stay stable across cart edits.
    expect(SRC).toContain('checkoutPaymentLinesRef.current = checkoutPayment.paymentLines;');
    expect(SRC).toContain('checkoutEffectiveDueRef.current = checkoutEffectiveDue;');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 4. ALREADY-EXTRACTED BOUNDARIES DO NOT MOVE BACK.
 *
 * Every component below has its own characterization suite. This only asserts that POSSales
 * still renders it, exactly once (three Payment Manager surfaces share PaymentAllocationPanel),
 * and that the import still resolves to the extracted module.
 */
describe('extracted child components stay extracted', () => {
  it.each([
    ['SessionInvalidatedOverlay', './POS/features/session/SessionInvalidatedOverlay', 1],
    ['IdleLockOverlay', './POS/features/session/IdleLockOverlay', 1],
    ['CloseDayVarianceDialog', './POS/features/session/CloseDayVarianceDialog', 1],
    ['RangeExclusionConfirmDialog', './POS/features/session/RangeExclusionConfirmDialog', 1],
    ['LockPosDialog', './POS/features/session/LockPosDialog', 1],
    ['CashDropDialog', './POS/features/session/CashDropDialog', 1],
    ['LiveSessionDialog', './POS/features/session/LiveSessionDialog', 1],
    ['SupervisorPinDialog', './POS/features/session/SupervisorPinDialog', 1],
    ['PosLockedOverlay', './POS/features/session/PosLockedOverlay', 1],
    ['SessionOwnerRequiredDialog', './POS/features/session/SessionOwnerRequiredDialog', 1],
    ['TerminalUnavailableOverlay', './POS/features/session/TerminalUnavailableOverlay', 1],
    ['PreviousBusinessDayBlockOverlay', './POS/features/session/PreviousBusinessDayBlockOverlay', 1],
    ['CheckoutCompleteSummary', './POS/features/checkout/CheckoutCompleteSummary', 1],
    ['CheckoutCompleteActions', './POS/features/checkout/CheckoutCompleteActions', 1],
    ['CheckoutSettlementSummary', './POS/features/checkout/CheckoutSettlementSummary', 1],
    ['CheckoutPaymentHeader', './POS/features/checkout/CheckoutPaymentHeader', 1],
    ['CheckoutPaymentFooter', './POS/features/checkout/CheckoutPaymentFooter', 1],
    ['CheckoutRemarks', './POS/features/checkout/CheckoutRemarks', 1],
    ['CheckoutPaymentPreview', './POS/features/checkout/CheckoutPaymentPreview', 1],
    ['PosFeedbackToasts', './POS/features/notifications/PosFeedbackToasts', 1],
    ['ConfirmAction', './POS/features/notifications/ConfirmAction', 1],
    ['NewDeliveryOrder', './POS/features/delivery/NewDeliveryOrder', 1],
    ['LayawaysList', './POS/features/layaway/LayawaysList', 1],
    ['CreditBalance', './POS/features/customers/CreditBalance', 1],
    ['ProductSearch', './POS/features/products/ProductSearch', 1],
    ['PriceCheck', './POS/features/products/PriceCheck', 1],
    ['ServiceRepair', './POS/features/service/ServiceRepair', 1],
    ['SerialBatch', './POS/features/products/SerialBatch', 1],
    ['CouponsDialog', './POS/features/sales/CouponsDialog', 1],
    ['PaymentAllocationPanel', './POS/payments/PaymentAllocationPanel', 3],
  ])('%s is imported from %s and rendered %i time(s)', (name, from, times) => {
    expect(SRC).toContain(`import ${name} from '${from}'`);
    expect(SRC.match(new RegExp(`<${name}[\\s/>]`, 'g')) || []).toHaveLength(times);
  });

  it('renders the three top-level POS surfaces and the shared dialogs once each', () => {
    for (const [name, times] of [
      ['POSConsole', 1], ['POSTouchScreen', 1], ['TradePOSTouchScreen', 1],
      // CustomerPicker's only POSSales use moved into POS/features/customers/CreditBalance.jsx.
      ['CustomerView', 1], ['CustomerPicker', 0], ['POSItemEntryContainer', 1],
      ['SupervisorTakeoverDialog', 1], ['BusinessDayStatusBanner', 1],
      ['ReceiptShareModal', 1], ['SalesReturnScreen', 1],
    ]) {
      expect(SRC.match(new RegExp(`<${name}[\\s/>]`, 'g')) || [], name).toHaveLength(times);
    }
  });

  it('the touch-screen template choice stays a single conditional on posTemplate', () => {
    expect(SRC).toContain(
      "{currentView === 'touch-screen' && (posTemplate === 'compact' ? <TradePOSTouchScreen {...touchScreenProps} /> : <POSTouchScreen {...touchScreenProps} />)}",
    );
  });

  it('seven imports are still dead (characterized, not fixed)', () => {
    for (const name of ['TerminalStatusBadge', 'A4PreviewFrame', 'A4LivePreview', 'ThermalMock',
      'ServiceJobA4Preview', 'PaperSizePicker', 'ImageUploadBox']) {
      // Imported, never rendered, and never referenced outside the import statement.
      expect(SRC.match(new RegExp(`<${name}[\\s/>]`, 'g')) || [],
        `${name} is imported but not rendered`).toHaveLength(0);
      // Nothing below the import block (i.e. inside the component) mentions them at all.
      const componentBody = SRC.slice(at('export default function POSSales() {'));
      expect(componentBody.includes(name), `${name} should appear only in the import block`).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 5. TOP-LEVEL REGION ANCHORS.
 *
 * The render tree is a flat list of guarded regions under one <div> inside
 * BusinessDayStatusProvider. Their source order is what the architecture pass measured coupling
 * against, so it is pinned here.
 */
describe('render-tree region anchors, in source order', () => {
  const REGIONS = [
    ['provider root', '<BusinessDayStatusProvider terminalId={currentTerminal?.terminalId} refreshRef={businessDayRefreshRef}>'],
    ['terminal registration rejected', '{terminalRegistrationError && ('],
    ['idle lock', '{isIdleLocked && ('],
    ['supervisor takeover', '{showTakeoverDialog && currentSession?.id && ('],
    ['shift handover overlay', '{terminalLockedBy && ('],
    ['business day banner', '<BusinessDayStatusBanner'],
    ['open sessions block', '{openSessionsBlock && ('],
    ['session roaming discovery', '{discoveryResponse && (() => {'],
    ['view: dashboard', "{currentView === 'dashboard' && renderDashboard()}"],
    ['view: console', "{currentView === 'console' && <POSConsole {...consoleProps} />}"],
    ['view: touch-screen', "{currentView === 'touch-screen' && (posTemplate === 'compact'"],
    ['item entry dialog', '{selectedProductForEntry && ('],
    ['view: z-report', "{currentView === 'z-report' && renderZReport()}"],
    ['view: x-report', "{currentView === 'x-report' && renderXReport()}"],
    ['view: customer', "{currentView === 'customer' && <CustomerView"],
    ['view: sales-analytics', "{currentView === 'sales-analytics' && renderSalesAnalytics()}"],
    ['cancel closure dialog', '<Dialog open={showCancelClosureDialog}'],
    ['closure required dialog', '<Dialog open={!!closureRequiredMsg}'],
    ['previous day session open dialog', '<Dialog open={!!prevDaySessionOpenMsg}'],
    ['start session dialog', '<Dialog open={showStartSessionDialog}'],
    ['session owner required', '{showSessionOwnerRequiredDialog && ('],
    ['cashier auth dialog', '{showCashierAuthDialog && ('],
    ['close session dialog', '<Dialog open={showCloseSessionDialog}'],
    ['CHECKOUT screen', '{showPaymentDialog && (() => {'],
    ['supervisor pin dialog', '{showSupervisorPin && ('],
    ['cash drop dialog', '<CashDropDialog'],
    ['live session dialog', '<LiveSessionDialog'],
    ['close day variance dialog', '<CloseDayVarianceDialog'],
    ['range exclusion confirm', '<RangeExclusionConfirmDialog'],
    ['lock pos dialog', '<LockPosDialog'],
    ['pos locked overlay', '{posLocked && ('],
    ['credit card balance dialog', '<Dialog open={showCreditCardBalance}'],
    ['last receipt dialog', '<Dialog open={showLastReceiptDialog}'],
    ['customer history preview', '<Dialog open={showCustomerHistoryPreview}'],
    ['reprint modal', '{showReprintModal && (() => {'],
    ['feedback toasts', '<PosFeedbackToasts'],
    ['reprint confirm', '<Dialog open={reprintConfirmOpen}'],
    ['coupons dialog (in CouponsDialog)', '{/* Coupons Dialog */}\n      <CouponsDialog'],
    ['promotions dialog', '<Dialog open={showPromotionsDialog}'],
    ['save order dialog', '<Dialog open={showSaveOrderDialog}'],
    ['orders list dialog', '{showOrdersListDialog && (() => {'],
    ['legacy layaways dialog', '<Dialog open={showLayawaysDialog}'],
    ['price check modal (in PriceCheck)', '{showPriceCheck && (\n        <PriceCheck'],
    ['product search modal (in ProductSearch)', '{showProductSearch && (\n        <ProductSearch'],
    ['credit balance modal (in CreditBalance)', '{showCreditBalance && (\n        <CreditBalance'],
    ['layaways list modal (in LayawaysList)', '{showLayawaysList && (\n        <LayawaysList'],
    ['confirm action modal', '{confirmAction && ('],
    ['save layaway modal', '{showSaveLayaway && (() => {'],
    ['sales return', '{showReturn && ('],
    ['add shipping dialog', '<Dialog open={showAddShippingDialog}'],
    ['add customer dialog', '<Dialog open={showAddCustomerDialog}'],
    ['serial / batch modal (in SerialBatch)', '{showSerialBatch && (\n        <SerialBatch'],
    ['service & repair screen (in ServiceRepair)', '{showServiceRepair && (\n        <ServiceRepair'],
    ['pos config panel', '{showPOSConfig && ('],
    ['new delivery order modal (+ nested add-address, in NewDeliveryOrder)', '{showDeliveryModal && ('],
    ['delivery settlement modal', '{showDeliverySettleModal && (() => {'],
    ['session invalidated overlay', '{sessionInvalidated && ('],
  ];

  it('has exactly these 57 top-level regions', () => {
    expect(REGIONS).toHaveLength(57);
  });

  it('renders them in this order', () => {
    const jsxStart = at('  return (\n    <BusinessDayStatusProvider');
    let prev = jsxStart - 1;
    for (const [name, anchor] of REGIONS) {
      const i = SRC.indexOf(anchor, prev);
      expect(i, `region out of order or missing: ${name}`).toBeGreaterThan(prev);
      prev = i;
    }
  });

  it('the checkout overlay stays ONE guarded IIFE — the payment/complete phase switch must not split into two roots', () => {
    expect(count('{showPaymentDialog && (() => {')).toBe(1);
    // Both phases render inside that single region, so the overlay DOM is reused across the
    // phase transition (the removeChild race the preview freeze exists to avoid). The switch is
    // a single early return for 'complete'; 'payment' is the fall-through, which is why there is
    // exactly one `checkoutPhase ===` test inside the region.
    const start = at('{showPaymentDialog && (() => {');
    const region = SRC.slice(start, at('{/* Supervisor PIN Dialog */}'));
    expect(region.match(/checkoutPhase === /g) || []).toHaveLength(1);
    expect(region).toContain("if (checkoutPhase === 'complete' && lastPaidInvoice) {");
    expect(region).toContain('// ── Payment Complete phase: render in the SAME overlay to avoid DOM churn ──');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 6. CROSS-FEATURE ORCHESTRATION STILL OWNED BY POSSALES.
 *
 * These handlers each span more than one feature, which is why they have not moved into a hook.
 * The assertions pin ownership plus the declaration-order constraints that make the bindings
 * reachable.
 */
describe('cross-feature orchestration handlers', () => {
  it.each([
    ['clearInvoice', 'const clearInvoice = () => {'],
    ['handleOutForDelivery', 'const handleOutForDelivery = useCallback(async () => {'],
    ['saveCurrentLayaway', 'const saveCurrentLayaway = async (print = false) => {'],
    ['syncPosData', 'const syncPosData = useCallback(async () => {'],
    ['handleSupervisorPinSubmit', 'const handleSupervisorPinSubmit = () => submitSupervisorApproval({'],
    ['handleCheckout', 'const handleCheckout = useCallback(() => {'],
    ['handleCashDrop', 'const handleCashDrop = async () => {'],
    ['handleStartSession', 'const handleStartSession = async () => {'],
    ['handleSessionTransfer', 'const handleSessionTransfer = async () => {'],
    ['handleHandoverSubmit', 'const handleHandoverSubmit = async () => {'],
    ['handleCloseDay', 'const handleCloseDay = async (acknowledgeExclusions = false) => {'],
    ['handleReprintConfirm', 'const handleReprintConfirm = async () => {'],
    ['handleReceiptShareSend', 'const handleReceiptShareSend = useCallback(async (value) => {'],
    ['buildThermalReceiptArtifacts', 'const buildThermalReceiptArtifacts = useCallback('],
    ['applyScannedVoucher', 'const applyScannedVoucher = useCallback((voucher) => {'],
    ['cancelCheckoutTenders', 'const cancelCheckoutTenders = useCallback(() => {'],
    ['removeAppliedVoucher', 'const removeAppliedVoucher = useCallback((lineId) => {'],
  ])('%s is declared exactly once in POSSales', (_n, decl) => {
    expect(count(decl)).toBe(1);
  });

  it('clearInvoice composes cart reset + shipping reset + tender release, in that order', () => {
    const start = at('const clearInvoice = () => {');
    const body = SRC.slice(start, SRC.indexOf('\n  };', start));
    expect(body.indexOf('resetCartState();')).toBeGreaterThan(-1);
    expect(body.indexOf('setShippingCharge(0);')).toBeGreaterThan(body.indexOf('resetCartState();'));
    expect(body.indexOf('checkoutPayment.clearLines();')).toBeGreaterThan(body.indexOf('setShippingCharge(0);'));
  });

  it('useCheckout receives clearInvoice, so checkout → cart reset → tender release runs through one composite', () => {
    const start = at('} = useCheckout({');
    const args = SRC.slice(start, SRC.indexOf('\n  });', start));
    expect(args).toContain('cart: { currentInvoice, clearInvoice, setInvoiceCounter, checkoutThermalHtml }');
  });

  it('useCheckout owns the post-payment device sequence: printing then drawer', () => {
    const start = at('    printing: {');
    const group = SRC.slice(start, SRC.indexOf('},', start));
    for (const dep of ['resolveInvoiceA4TemplateFor', 'printThermalReceiptWithConfiguredPrinter',
      'buildThermalReceiptArtifacts', 'openCashDrawer']) {
      expect(group, dep).toContain(dep);
    }
  });

  it('the approval dispatcher binds continuations from five different features', () => {
    const start = at('const handleSupervisorPinSubmit = () => submitSupervisorApproval({');
    const body = SRC.slice(start, SRC.indexOf('\n  });', start));
    for (const cont of [
      'applyVoid', 'addToInvoice', 'updateItemPrice', 'updateDiscount', // cart + product entry
      'processPayment', // checkout
      'clearLayawayConversion', // layaway
      'handleCloseDay', // day close
      'closureAuthGrantRef', 'forceCloseContextRef', // session closure (refs)
      'unlockAdvancedRange', // day-close range
    ]) {
      expect(body, cont).toContain(cont);
    }
  });

  it('the dispatcher is declared below useCheckout, handleCloseDay and useSupervisorApproval', () => {
    const dispatcher = at('const handleSupervisorPinSubmit = () => submitSupervisorApproval({');
    expect(at('} = useCheckout({')).toBeLessThan(dispatcher);
    expect(at('const handleCloseDay = async')).toBeLessThan(dispatcher);
    expect(at('} = useSupervisorApproval();')).toBeLessThan(dispatcher);
  });

  it('syncPosData fans out to the four loaders and clears the shared product cache first', () => {
    const start = at('const syncPosData = useCallback(async () => {');
    const body = SRC.slice(start, SRC.indexOf("currentSession?.status]);", start));
    expect(body.indexOf('productCacheRef.current.clear();')).toBeGreaterThan(-1);
    expect(body.indexOf('Promise.allSettled')).toBeGreaterThan(body.indexOf('productCacheRef.current.clear();'));
    for (const loader of ['loadPosCustomers()', 'loadPosProducts(0, false, controller.signal)',
      'loadXReport()', 'loadHeldSales()']) {
      expect(body, loader).toContain(loader);
    }
  });

  it('the business-day blocking overlay stands down for the whole closure flow', () => {
    const start = at('const businessDayClosureFlowActive = Boolean(');
    const body = SRC.slice(start, SRC.indexOf(');', start));
    for (const flag of ['showCashierAuthDialog', 'showCloseSessionDialog', 'showSupervisorPin',
      'sessionToClose', "currentView === 'x-report'", "currentView === 'z-report'"]) {
      expect(body, flag).toContain(flag);
    }
  });

  it('the two session-usability guards redirect away from the selling screen', () => {
    expect(SRC).toContain("if (sessionAwaitingClosure && currentView === 'touch-screen') {");
    expect(SRC).toContain("if (sessionBlockedByPreviousDay && currentView === 'touch-screen') {");
  });

  it('the X/Z auto-print handshake is armed by a ref and fired by an effect on fresh report data', () => {
    expect(count('const pendingXAutoPrintRef = useRef(null);')).toBe(1);
    expect(count('const pendingZAutoPrintRef = useRef(null);')).toBe(1);
    expect(count('const printedReportKeysRef = useRef(new Set());')).toBe(1);
    expect(SRC).toContain('if (!pendingXAutoPrintRef.current) return;');
    expect(SRC).toContain('if (!pendingZAutoPrintRef.current) return;');
    // The X-Report arm is handed to useSessionClosure, not fired from it.
    expect(SRC).toContain('pendingXAutoPrintRef, zReportDate,');
  });

  it('the scanner → product entry → cart path goes through one entry point', () => {
    const entry = at('} = useProductEntry({');
    const args = SRC.slice(entry, SRC.indexOf('\n  });', entry));
    for (const dep of ['setCurrentInvoice', 'currentInvoiceRef', 'recalculateInvoice', 'requestApproval',
      'productCacheRef', 'applyScannedVoucher', 'showFeedback']) {
      expect(args, dep).toContain(dep);
    }
    // Templates never get addToInvoice — the Product Entry Mode decision must not be bypassed.
    const bag = SRC.slice(at('const touchScreenProps = {'), at('  return (\n    <BusinessDayStatusProvider'));
    expect(bag).not.toMatch(/^\s*addToInvoice,/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 7. SHAPE COUNTERS.
 *
 * Blunt drift alarm. These numbers are EXPECTED to fall as extraction proceeds; update them in
 * the same commit that moves the state/effect out, and never upward without a reason recorded in
 * the commit message.
 */
describe('shape counters (update deliberately)', () => {
  it('declares 231 top-level useState pairs', () => {
    expect(topLevel(/^ {2}const \[/)).toHaveLength(231);
  });

  it('declares 16 top-level refs', () => {
    expect(topLevel(/^ {2}const [A-Za-z0-9_]+ = (React\.)?useRef\(/)).toHaveLength(16);
  });

  it('declares 33 top-level effects', () => {
    expect(topLevel(/^ {2}(React\.)?useEffect\(/)).toHaveLength(33);
  });

  it('declares 19 top-level memos and 23 top-level callbacks', () => {
    expect(topLevel(/^ {2}const [A-Za-z0-9_]+ = useMemo\(/)).toHaveLength(19);
    expect(topLevel(/^ {2}const [A-Za-z0-9_]+ = useCallback\(/)).toHaveLength(23);
  });

  it('all state is declared in the first 1,300 lines — the render tree below owns none', () => {
    const lastState = LINES.reduce((acc, l, i) => (/^ {2}const \[/.test(l) ? i + 1 : acc), 0);
    expect(lastState).toBeGreaterThan(0);
    expect(lastState).toBeLessThan(1300);
  });

  it('keeps the two prop bags as plain objects spread into one child each', () => {
    expect(count('const consoleProps = {')).toBe(1);
    expect(count('const touchScreenProps = {')).toBe(1);
    expect(count('{...consoleProps}')).toBe(1);
    expect(count('{...touchScreenProps}')).toBe(2); // classic + compact template
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * 8. COUPLING BUDGET OF THE CANDIDATE BOUNDARIES.
 *
 * The architecture pass measured how many component-scope bindings each candidate region reads.
 * The assertions below pin the FACT that makes each candidate low-risk — that the region touches
 * only its own state plus a named short list — so an edit that quietly reaches across a boundary
 * fails here instead of being discovered mid-extraction.
 */
describe('candidate boundary coupling budget', () => {
  const region = (startAnchor, endAnchor) => {
    const a = at(startAnchor);
    const b = SRC.indexOf(endAnchor, a);
    expect(b, `region end not found after: ${startAnchor}`).toBeGreaterThan(a);
    return SRC.slice(a, b);
  };

  it('the New Delivery Order call site passes delivery state only, plus five shared values', () => {
    // The region itself now lives in POS/features/delivery/NewDeliveryOrder.jsx; what is pinned
    // here is that the POSSales call site still hands it exactly the same coupling surface.
    const body = region('{showDeliveryModal && (', '{/* ══ DELIVERY SETTLEMENT modal');
    for (const shared of ['customerOptions', 'currentInvoice', 'formatCurrency',
      'openQuickCustomerModal', 'handleOutForDelivery']) {
      expect(body, shared).toContain(shared);
    }
    // And nothing from the settlement, checkout, session-closure or report surfaces.
    for (const forbidden of ['checkoutPayment', 'checkoutPaymentFields', 'processPayment', 'xReportData',
      'sessionToClose', 'closingDenominations', 'deliverySettlePayment', 'deliverySettleFields',
      'openCashDrawer', 'buildThermalReceiptArtifacts']) {
      expect(body, `delivery capture must not reach ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the Layaways List call site passes useLayaway state only, plus the Save Layaway opener', () => {
    // The region itself now lives in POS/features/layaway/LayawaysList.jsx; what is pinned here is
    // that the POSSales call site still hands it exactly the same coupling surface — the 18
    // useLayaway bindings plus the one parent-owned setter.
    const body = region('{showLayawaysList && (\n        <LayawaysList', '{/* ─── CONFIRM ACTION MODAL ─── */}');
    for (const own of ['showLayawaysList', 'setShowLayawaysList',
      'layawaysFilterStatus', 'setLayawaysFilterStatus',
      'layawaysFilterCustomer', 'setLayawaysFilterCustomer',
      'layawaysFilterNo', 'setLayawaysFilterNo',
      'selectedLayawayId', 'setSelectedLayawayId',
      'layawaysList', 'layawaysLoading', 'layawaysError', 'selectedLayawayDetail',
      'layawayBusyId', 'loadLayaways', 'startLayawayConversion', 'handleCancelLayaway',
      'setShowSaveLayaway']) {
      expect(body, own).toContain(`${own}={${own}}`);
    }
    // Exactly 19 props, passed one per line, with no spread of the useLayaway object.
    expect(body.match(/^ {10}[A-Za-z0-9_]+=\{/gm)).toHaveLength(19);
    expect(body).not.toContain('{...');
    for (const forbidden of ['checkoutPayment', 'processPayment', 'xReportData', 'sessionToClose']) {
      expect(body, `layaway list must not reach ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the Layaways List extraction moved presentation only — useLayaway ownership stayed in POSSales', () => {
    const CHILD = fs.readFileSync(
      path.resolve(__dirname, '../features/layaway/LayawaysList.jsx'), 'utf8').replace(/\r\n/g, '\n');
    // The hook is still called exactly once, and only in POSSales.
    expect(SRC.split('useLayaway(').length - 1).toBe(1);
    expect(SRC).toContain('} = useLayaway({');
    expect(CHILD).not.toContain('useLayaway(');
    expect(CHILD).not.toMatch(/import[^\n]*useLayaway[^\n]*from/);
    // setShowSaveLayaway is parent-owned and explicitly passed, never recreated in the child.
    expect(SRC).toContain('const [showSaveLayaway, setShowSaveLayaway] = useState(false);');
    expect(SRC).toContain('setShowSaveLayaway={setShowSaveLayaway}');
    expect(CHILD).not.toContain('useState(');
    // The child is the ONLY new boundary: the IIFE is gone, one call site, no key/memo wrapper.
    expect(SRC).not.toContain('{showLayawaysList && (() => {');
    expect(SRC.split('<LayawaysList').length - 1).toBe(1);
    expect(SRC).not.toContain('<LayawaysList key=');
    // Delivery Settlement remains inline in POSSales and is untouched by this extraction.
    expect(SRC).toContain('{showDeliverySettleModal && (() => {');
    expect(CHILD).not.toContain('deliverySettle');
    // The legacy Layaways dialog is a different, unrelated modal and stays where it was.
    expect(SRC).toContain('<Dialog open={showLayawaysDialog}');
    expect(CHILD).not.toContain('showLayawaysDialog');
  });

  it('the Confirm Action extraction moved presentation only — confirmAction state stayed in POSSales', () => {
    // Behaviour and the full dependency surface live in ConfirmAction.characterization.test.jsx,
    // which also byte-compares this call site against the original 41-line region.
    const CHILD = read('../features/notifications/ConfirmAction.jsx');
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    // Imported from the notifications feature boundary PosFeedbackToasts established, rendered once.
    expect(SRC).toContain("import ConfirmAction from './POS/features/notifications/ConfirmAction';");
    expect(SRC.match(/<ConfirmAction[\s/>]/g)).toHaveLength(1);
    // The mount guard stays parent-owned, under the unchanged anchor, with exactly the two props.
    expect(SRC).toContain('      {/* ─── CONFIRM ACTION MODAL ─── */}\n'
      + '      {confirmAction && (\n'
      + '        <ConfirmAction\n'
      + '          confirmAction={confirmAction}\n'
      + '          setConfirmAction={setConfirmAction}\n'
      + '        />\n'
      + '      )}\n');
    expect(count('{confirmAction && (')).toBe(1);
    expect(SRC).not.toContain('showConfirmAction');
    // The state is declared exactly once, in POSSales, and did not move into a hook, context or the child.
    expect(SRC).toContain('  // Confirmation modal (replaces window.confirm for delete/cancel actions)\n'
      + '  const [confirmAction, setConfirmAction] = useState(null); // { title, message, onConfirm, busy }\n');
    expect(SRC.match(/const \[confirmAction, /g)).toHaveLength(1);
    expect(SRC).not.toMatch(/useConfirmAction|ConfirmActionContext|ConfirmActionProvider/);
    for (const hook of ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'memo(', 'Context', 'Provider']) {
      expect(CHILD_CODE, hook).not.toContain(hook);
    }
    expect(CHILD_CODE).not.toMatch(/\buse[A-Z]/);
    // The old inline modal JSX is gone from POSSales — moved, not copied.
    expect(SRC).not.toContain('z-[700]');
    expect(SRC).not.toContain('Deleting…');
    expect(SRC).not.toMatch(/confirmAction\.\w+/);
    // Trash2 was exclusive to the region, so it left with it; the two shared icons stayed behind.
    expect(SRC).not.toMatch(/\bTrash2\b/);
    expect(CHILD).toContain("import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';");
    for (const icon of ['AlertTriangle', 'RefreshCw']) {
      expect(SRC, icon).toMatch(new RegExp(`^  ${icon},$`, 'm'));
      expect(SRC.match(new RegExp(`\\b${icon}\\b`, 'g')).length, icon).toBeGreaterThan(1);
    }
    // The two writers are untouched: they still receive setConfirmAction as a hook argument.
    expect(count('    setConfirmAction, syncPosDataRef,\n  });')).toBe(1);
    expect(count('    cartItemsToPayload, clearInvoice, setConfirmAction,\n')).toBe(1);
    expect(CHILD_CODE).not.toMatch(/useLayaway|useHeldSales|cancelLayaway/);
    // No unrelated extraction rode along: both neighbours are still exactly where they were.
    expect(SRC).toContain('{showLayawaysList && (\n        <LayawaysList');
    expect(SRC).toContain('{showSaveLayaway && (() => {');
    expect(CHILD_CODE).not.toMatch(/showLayawaysList|showSaveLayaway|layaway/i);
  });

  it('the Coupons Dialog extraction moved presentation only — every coupon state stayed in POSSales', () => {
    // Behaviour and the full dependency surface live in CouponsDialog.characterization.test.jsx,
    // which byte-compares the child against the original 71-line inline region (POSSales.jsx:9121-9191).
    const CHILD = read('../features/sales/CouponsDialog.jsx');
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    // Imported once from the new sales feature boundary, rendered once.
    expect(SRC).toContain("import CouponsDialog from './POS/features/sales/CouponsDialog';");
    expect(SRC.match(/<CouponsDialog[\s/>]/g)).toHaveLength(1);
    // The call site is UNCONDITIONAL — the Radix Dialog keeps owning open/closed through
    // `open={showCouponsDialog}`, exactly as it did inline. No `{showCouponsDialog && ...}`.
    expect(SRC).toContain('      {/* Coupons Dialog */}\n'
      + '      <CouponsDialog\n'
      + '        showCouponsDialog={showCouponsDialog}\n'
      + '        couponCode={couponCode}\n'
      + '        appliedCoupon={appliedCoupon}\n'
      + '        couponDiscount={couponDiscount}\n'
      + '        currentInvoice={currentInvoice}\n'
      + '        setShowCouponsDialog={setShowCouponsDialog}\n'
      + '        setCouponCode={setCouponCode}\n'
      + '        setAppliedCoupon={setAppliedCoupon}\n'
      + '        setCouponDiscount={setCouponDiscount}\n'
      + '        setCurrentInvoice={setCurrentInvoice}\n'
      + '        recalculateInvoice={recalculateInvoice}\n'
      + '        showFeedback={showFeedback}\n'
      + '        formatCurrency={formatCurrency}\n'
      + '      />\n');
    expect(SRC).not.toContain('{showCouponsDialog && ');
    expect(CHILD).toContain('<Dialog open={showCouponsDialog}');
    // Exactly the 13 props, no spread, no derived wrapper prop, no memo.
    const callsiteStart = at('      <CouponsDialog\n');
    const callsite = SRC.slice(callsiteStart, SRC.indexOf('      />\n', callsiteStart));
    expect(callsite.split('={').length - 1).toBe(13);
    expect(callsite).not.toContain('{...');
    expect(CHILD_CODE).not.toContain('memo(');
    // All five coupon/cart bindings are declared exactly once, in POSSales, and did not move.
    expect(SRC).toContain('  const [showCouponsDialog, setShowCouponsDialog] = useState(false);\n'
      + "  const [couponCode, setCouponCode] = useState('');\n"
      + '  const [appliedCoupon, setAppliedCoupon] = useState(null);\n'
      + '  const [couponDiscount, setCouponDiscount] = useState(0);\n');
    for (const s of ['showCouponsDialog', 'couponCode', 'appliedCoupon', 'couponDiscount']) {
      expect(SRC.match(new RegExp(`const \\[${s}, `, 'g')), s).toHaveLength(1);
    }
    expect(count('const [currentInvoice, setCurrentInvoice]')).toBe(0); // owned by useCart
    expect(SRC).toContain('recalculateInvoice,');
    // The child is presentation only: no state, no hooks, no context, no API.
    for (const hook of ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'Context', 'Provider', 'Api.', 'axios']) {
      expect(CHILD_CODE, hook).not.toContain(hook);
    }
    expect(CHILD_CODE).not.toMatch(/\buse[A-Z]/);
    // The old 71-line inline dialog JSX is gone from POSSales — moved, not copied.
    for (const token of [
      '<Dialog open={showCouponsDialog}', 'const COUPON_RULES = [', 'const applyAndClose = () => {',
      'Unknown coupon code:', 'Available Coupons', 'e.g. SAVE10, WELCOME20...',
      'recalculateInvoice(prev.items, discountAmt)',
    ]) {
      expect(SRC, token).not.toContain(token);
    }
    // No import cleanup rode along: every primitive the child imports is still used by other
    // POSSales regions, so none of them could be removed from the parent.
    for (const icon of ['Tag', 'CheckCircle']) {
      expect(SRC, icon).toMatch(new RegExp(`^  ${icon},$`, 'm'));
      expect(SRC.match(new RegExp(`<${icon}[\\s/>]`, 'g')).length, icon).toBeGreaterThanOrEqual(1);
    }
    for (const ui of ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'Button', 'Input', 'Label']) {
      expect(SRC.match(new RegExp(`<${ui}[\\s/>]`, 'g')).length, ui).toBeGreaterThanOrEqual(1);
    }
    // Both neighbours stayed put and unchanged — no unrelated extraction rode along.
    expect(SRC).toContain('      {/* Reprint Confirm Popup */}\n      <Dialog open={reprintConfirmOpen} onOpenChange={setReprintConfirmOpen}>');
    expect(SRC).toContain('      {/* Promotions Dialog */}\n      <Dialog open={showPromotionsDialog} onOpenChange={setShowPromotionsDialog}>');
    expect(count('{/* Promotions Dialog */}')).toBe(1);
    // The Promotions Dialog still reads the coupon state from POSSales, which is why it stayed there.
    expect(SRC).toContain('{formatCurrency(couponDiscount)} off applied');
    expect(CHILD_CODE).not.toContain('showPromotionsDialog');
    expect(CHILD_CODE).not.toContain('reprintConfirmOpen');
  });

  it('the Product Search extraction moved presentation only — catalog, entry and selection stayed in POSSales', () => {
    const CHILD = read('../features/products/ProductSearch.jsx');
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    const TOUCH = read('../POSTouchScreen.jsx');
    // Both product hooks are still called exactly once, and only in POSSales.
    expect(SRC.split('useProductCatalog(').length - 1).toBe(1);
    expect(SRC).toContain('} = useProductCatalog({ currentTerminal, currentSession, barcodeInput, posActionMode });');
    expect(SRC.split('useProductEntry(').length - 1).toBe(1);
    expect(SRC).toContain('} = useProductEntry({');
    for (const hook of ['useProductCatalog', 'useProductEntry', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'memo(']) {
      expect(CHILD_CODE, hook).not.toContain(hook);
    }
    // handleProductSelection is parent-owned (from useProductEntry) and passed straight through.
    expect(SRC).toContain('    handleUnifiedEntry, handleBarcodeScan, handleProductSelection, handleEditItem,\n');
    expect(CHILD_CODE).not.toContain('const handleProductSelection');
    // The mount condition stays in the parent; one call site; exactly 9 props, no spread.
    const body = region('{showProductSearch && (\n        <ProductSearch', '{/* ─── CREDIT BALANCE MODAL ─── */}');
    for (const own of ['showProductSearch', 'setShowProductSearch', 'productSearchQuery', 'setProductSearchQuery',
      'productSearchResults', 'productSearchLoading', 'handleProductSelection', 'showFeedback', 'formatCurrency']) {
      expect(body, own).toContain(`${own}={${own}}`);
    }
    expect(body.match(/^ {10}[A-Za-z0-9_]+=\{/gm)).toHaveLength(9);
    expect(body).not.toContain('{...');
    expect(body).not.toContain('setProductSearchResults');
    expect(SRC.split('{showProductSearch && ').length - 1).toBe(1);
    expect(SRC.split('<ProductSearch').length - 1).toBe(1);
    expect(CHILD_CODE).not.toContain('showProductSearch &&');
    // POSTouchScreen is untouched: it still owns the only opener and knows nothing of the child.
    expect(TOUCH).toContain("action: () => { setProductSearchQuery(''); setProductSearchResults([]); setShowProductSearch(true); } },");
    expect(TOUCH).not.toContain('ProductSearch from');
    expect(TOUCH).not.toContain('<ProductSearch');
  });

  it('the Price Check extraction moved presentation only — state, session and entry stayed in POSSales', () => {
    const CHILD = read('../features/products/PriceCheck.jsx');
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    const TOUCH = read('../POSTouchScreen.jsx');
    // usePosSession and useProductEntry are still called exactly once, and only in POSSales.
    expect(SRC.split('usePosSession(').length - 1).toBe(1);
    expect(SRC).toContain('} = usePosSession({ posSettings, handlersRef: sessionLifecycleHandlersRef });');
    expect(SRC.split('useProductEntry(').length - 1).toBe(1);
    expect(SRC).toContain('} = useProductEntry({');
    for (const hook of ['usePosSession', 'useProductEntry', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'memo(']) {
      expect(CHILD_CODE, hook).not.toContain(hook);
    }
    // All three Price Check states (and setters) remain declared in POSSales.
    expect(SRC).toContain('  // Price Check modal\n  const [showPriceCheck, setShowPriceCheck] = useState(false);\n'
      + "  const [priceCheckQuery, setPriceCheckQuery] = useState('');\n"
      + '  const [priceCheckResult, setPriceCheckResult] = useState(null);\n');
    // The mount condition stays in the parent; exactly one call site; exactly 9 direct props.
    const body = region('{showPriceCheck && (\n        <PriceCheck', '{/* ─── SEARCH PRODUCTS MODAL ─── */}');
    const PROPS = ['showPriceCheck', 'setShowPriceCheck', 'priceCheckQuery', 'setPriceCheckQuery', 'priceCheckResult',
      'setPriceCheckResult', 'currentTerminal', 'currentSession', 'handleProductSelection'];
    expect(body.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    PROPS.forEach((own) => expect(body, own).toContain(`${own}={${own}}`));
    expect(body).not.toContain('{...');
    expect(body).not.toContain('=>');
    expect(SRC).not.toContain('{showPriceCheck && (() => {');
    expect(SRC.split('{showPriceCheck && ').length - 1).toBe(1);
    expect(SRC.split('<PriceCheck').length - 1).toBe(1);
    expect(CHILD_CODE).not.toContain('showPriceCheck &&');
    for (const forbidden of ['checkoutPayment', 'processPayment', 'setCurrentInvoice', 'xReportData']) {
      expect(CHILD_CODE, `price check must not reach ${forbidden}`).not.toContain(forbidden);
    }
    // POSTouchScreen is untouched: it still owns the only opener, POSSales still forwards the setters,
    // and the touch screen knows nothing of the child.
    expect(TOUCH).toContain("action: () => { setPriceCheckQuery(''); setPriceCheckResult(null); setShowPriceCheck(true); } },");
    expect(SRC).toContain('    setShowCouponsDialog, setShowPromotionsDialog, setShowPriceCheck, setPriceCheckQuery,\n    setPriceCheckResult, setShowProductSearch, setProductSearchQuery, setProductSearchResults,\n');
    expect(TOUCH).not.toContain('PriceCheck from');
    expect(TOUCH).not.toContain('<PriceCheck');
  });

  it('the Service & Repair extraction moved presentation only — all five states and setters stayed in POSSales', () => {
    const CHILD = read('../features/service/ServiceRepair.jsx');
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    const TOUCH = read('../POSTouchScreen.jsx');
    // All five Service & Repair states (and setters) remain declared in POSSales, unchanged.
    expect(SRC).toContain('  // Service & Repair view\n'
      + '  const [showServiceRepair, setShowServiceRepair] = useState(false);\n'
      + "  const [serviceView, setServiceView] = useState('list');\n"
      + '  const [serviceJobStep, setServiceJobStep] = useState(1);\n'
      + "  const [serviceDetailTab, setServiceDetailTab] = useState('overview');\n"
      + "  const [serviceJobFilter, setServiceJobFilter] = useState({ status: 'All', customer: '', jobNo: '', serial: '', technician: '', warranty: 'All' });\n");
    // None of it moved into a hook, context or the child.
    for (const name of ['showServiceRepair', 'serviceView', 'serviceJobStep', 'serviceDetailTab', 'serviceJobFilter']) {
      expect(SRC.split(`const [${name}, `).length - 1, name).toBe(1);
    }
    expect(SRC).not.toMatch(/useServiceRepair|ServiceRepairContext|ServiceRepairProvider/);
    for (const hook of ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'memo(']) {
      expect(CHILD_CODE, hook).not.toContain(hook);
    }
    expect(CHILD_CODE).not.toMatch(/\/api\//);
    expect(CHILD_CODE).toContain('  const mockJobs = [];');
    // The mount condition stays in the parent; exactly one call site; exactly the 10 state bindings.
    const body = region('{showServiceRepair && (\n        <ServiceRepair', '{/* POS Configure & Customize Panel */}');
    const PROPS = ['showServiceRepair', 'setShowServiceRepair', 'serviceView', 'setServiceView', 'serviceJobStep',
      'setServiceJobStep', 'serviceDetailTab', 'setServiceDetailTab', 'serviceJobFilter', 'setServiceJobFilter'];
    expect(body.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    PROPS.forEach((own) => expect(body, own).toContain(`${own}={${own}}`));
    expect(body).not.toContain('{...');
    expect(body).not.toContain('=>');
    expect(SRC).not.toContain('{showServiceRepair && (() => {');
    expect(SRC.split('{showServiceRepair && ').length - 1).toBe(1);
    expect(SRC.split('<ServiceRepair').length - 1).toBe(1);
    expect(CHILD_CODE).not.toContain('showServiceRepair &&');
    for (const forbidden of ['currentInvoice', 'currentSession', 'currentTerminal', 'checkoutPayment',
      'posSettings', 'xReportData', 'syncPosData', 'serialBatch', 'SerialBatch']) {
      expect(CHILD_CODE, `service screen must not reach ${forbidden}`).not.toContain(forbidden);
    }
    // The Serial/Batch -> Service & Repair transition is unchanged; it moved, verbatim, into the SerialBatch child.
    const SERIAL_CHILD = read('../features/products/SerialBatch.jsx');
    expect(SERIAL_CHILD.split("onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }}").length - 1).toBe(1);
    expect(SRC.split("onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }}").length - 1).toBe(0);
    expect(SRC).toContain('{showSerialBatch && (\n        <SerialBatch');
    // POSSales still forwards the two setters to POSTouchScreen, which still never calls them.
    expect(SRC).toContain('    setShowServiceRepair, setServiceView, setShowReturn, setShowAddShippingDialog,\n');
    expect(TOUCH.split('setShowServiceRepair').length - 1).toBe(1);
    expect(TOUCH).not.toContain('<ServiceRepair');
  });

  it('the Serial / Batch extraction moved presentation only — all twelve states and setters stayed in POSSales', () => {
    // Behaviour and the full dependency surface live in SerialBatch.characterization.test.jsx.
    const CHILD = read('../features/products/SerialBatch.jsx');
    const CHILD_CODE = CHILD.replace(/^\/\/.*\n/gm, '');
    const TOUCH = read('../POSTouchScreen.jsx');
    // All twelve Serial / Batch states (and setters) are declared in POSSales, contiguous, exactly once.
    expect(SRC).toContain('  // Serial / Batch Check modal\n'
      + '  const [showSerialBatch, setShowSerialBatch] = useState(false);\n'
      + "  const [serialBatchQuery, setSerialBatchQuery] = useState('');\n"
      + '  const [serialBatchResult, setSerialBatchResult] = useState(null);\n'
      + "  const [serialBatchSubView, setSerialBatchSubView] = useState('check');\n"
      + '  const [serialBatchReturnQty, setSerialBatchReturnQty] = useState(1);\n'
      + "  const [serialBatchReturnReason, setSerialBatchReturnReason] = useState('');\n"
      + "  const [serialBatchReturnCondition, setSerialBatchReturnCondition] = useState('');\n"
      + "  const [serialBatchRefundMethod, setSerialBatchRefundMethod] = useState('Cash Back');\n"
      + "  const [serialBatchInvoiceNo, setSerialBatchInvoiceNo] = useState('');\n"
      + "  const [serialBatchItemCode, setSerialBatchItemCode] = useState('');\n"
      + "  const [serialBatchCustomerMobile, setSerialBatchCustomerMobile] = useState('');\n"
      + '  const [serialBatchSelectedItem, setSerialBatchSelectedItem] = useState(null);\n'
      + '  // Service & Repair view\n');
    expect(SRC.match(/const \[(showSerialBatch|serialBatch\w+), /g)).toHaveLength(12);
    // None of it moved into a hook, context or the child.
    expect(SRC).not.toMatch(/useSerialBatch|SerialBatchContext|SerialBatchProvider/);
    for (const hook of ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'memo(', 'Context', 'Provider']) {
      expect(CHILD_CODE, hook).not.toContain(hook);
    }
    expect(CHILD_CODE).not.toMatch(/\buse[A-Z]/);
    // The mount condition stays in the parent; exactly one call site; exactly the 28 direct props, no spread.
    const body = region('{/* ─── SERIAL / BATCH CHECK MODAL ─── */}', '{/* ─── SERVICE & REPAIR MANAGEMENT SCREEN ─── */}');
    expect(body.split('\n').slice(0, 3)).toEqual(['{/* ─── SERIAL / BATCH CHECK MODAL ─── */}', '      {showSerialBatch && (', '        <SerialBatch']);
    const PROPS = ['setShowSerialBatch', 'serialBatchQuery', 'setSerialBatchQuery', 'serialBatchResult', 'setSerialBatchResult',
      'serialBatchSubView', 'setSerialBatchSubView', 'serialBatchReturnQty', 'setSerialBatchReturnQty', 'serialBatchReturnReason',
      'setSerialBatchReturnReason', 'serialBatchReturnCondition', 'setSerialBatchReturnCondition', 'serialBatchRefundMethod',
      'setSerialBatchRefundMethod', 'serialBatchInvoiceNo', 'setSerialBatchInvoiceNo', 'serialBatchItemCode', 'setSerialBatchItemCode',
      'serialBatchCustomerMobile', 'setSerialBatchCustomerMobile', 'serialBatchSelectedItem', 'setSerialBatchSelectedItem',
      'currentTerminal', 'currentSession', 'setShowServiceRepair', 'setServiceView', 'setServiceJobStep'];
    expect(PROPS).toHaveLength(28);
    expect(body.match(/^ {10}[A-Za-z0-9_]+=\{/gm).map((l) => l.trim().slice(0, -2))).toEqual(PROPS);
    PROPS.forEach((own) => expect(body, own).toContain(`${own}={${own}}`));
    expect(body).not.toContain('{...');
    expect(body).not.toContain('=>');
    expect(body).not.toContain(' showSerialBatch=');
    expect(count('{showSerialBatch && ')).toBe(1);
    expect(SRC).not.toContain('{showSerialBatch && (() => {');
    expect(SRC.match(/<SerialBatch[\s/>]/g)).toHaveLength(1);
    expect(CHILD_CODE).not.toContain('showSerialBatch');
    // The Service & Repair handoff moved with the child, unchanged; POSSales no longer writes those setters.
    const HANDOFF = "onClick={() => { setShowSerialBatch(false); setShowServiceRepair(true); setServiceView('new-job'); setServiceJobStep(1); }}";
    expect(CHILD_CODE.split(HANDOFF).length - 1).toBe(1);
    expect(count(HANDOFF)).toBe(0);
    for (const setter of ['setShowServiceRepair(', 'setServiceView(', 'setServiceJobStep(']) expect(count(setter), setter).toBe(0);
    // Direct API ownership moved with the child: it calls the four lookups directly, and POSSales no longer does.
    for (const [api, calls] of [['posBatchCheck(', 2], ['getProductsList(', 1], ['getSalesInvoicesPage(', 1], ['searchCustomersAllFields(', 1]]) {
      expect(CHILD_CODE.split(api).length - 1, api).toBe(calls);
      expect(count(api), api).toBe(0);
    }
    expect(CHILD_CODE.split('currentTerminal?.branchId || currentSession?.branchId').length - 1).toBe(1);
    expect(CHILD_CODE.split('setTimeout(() => doBatchSearch(), 50);').length - 1).toBe(4);
    // No unrelated extraction rode along: the neighbours are still where they were.
    expect(SRC).toContain('<Dialog open={showAddCustomerDialog}');
    expect(SRC).toContain('{showServiceRepair && (\n        <ServiceRepair');
    for (const forbidden of ['currentInvoice', 'checkoutPayment', 'posSettings', 'xReportData', 'syncPosData', 'showServiceRepair',
      'showAddCustomerDialog', 'showPOSConfig', 'showDeliveryModal']) {
      expect(CHILD_CODE, `serial / batch must not reach ${forbidden}`).not.toContain(forbidden);
    }
    // POSTouchScreen is untouched: it still owns the only opener, POSSales still forwards the setters,
    // and the touch screen knows nothing of the child.
    expect(TOUCH).toContain("action: () => { setSerialBatchQuery(''); setSerialBatchResult(null); setSerialBatchSubView('check'); setSerialBatchInvoiceNo(''); setSerialBatchItemCode(''); setSerialBatchCustomerMobile(''); setSerialBatchSelectedItem(null); setShowSerialBatch(true); } },");
    const BAG = '    setShowSerialBatch, setSerialBatchQuery, setSerialBatchResult, setSerialBatchSubView,\n'
      + '    setSerialBatchInvoiceNo, setSerialBatchItemCode, setSerialBatchCustomerMobile, setSerialBatchSelectedItem,\n'
      + '    setShowServiceRepair, setServiceView, setShowReturn, setShowAddShippingDialog,\n';
    expect(count(BAG)).toBe(1);
    expect(TOUCH.split(BAG).length - 1).toBe(1);
    expect(TOUCH.match(/serialBatch|SerialBatch/g)).toHaveLength(16);
    expect(TOUCH).not.toMatch(/<SerialBatch\b|SerialBatch from/);
  });

  it('the Delivery Settlement modal is the HIGH-coupling half of delivery and is NOT a near-term boundary', () => {
    const body = region('{showDeliverySettleModal && (() => {',
      '{/* Phase 12 - Session Transferred/Invalidated Overlay */}');
    // It spans payment allocation, printing, approval, session and template settings at once.
    for (const crossing of ['deliverySettlePayment', 'deliverySettleFields', 'checkoutCompatibility',
      'checkoutOnlineBankAccounts', 'buildThermalReceiptArtifacts', 'printThermalReceiptWithConfiguredPrinter',
      'resolveInvoiceA4TemplateFor', 'requestApproval', 'syncPosData', 'sessionId', 'tplInvoicePaper']) {
      expect(body, crossing).toContain(crossing);
    }
  });

  it('the X-Report and Z-Report renderers remain report closures reading session-closure state', () => {
    // Pinned as HIGH risk: both reach into the closure refs/handlers, so neither is a near-term
    // boundary. This asserts the coupling still exists rather than endorsing it.
    const z = region('const renderZReport = () => {', 'const renderXReport = () => {');
    for (const crossing of ['closureAuthGrantRef', 'forceCloseContextRef', 'handleCloseDay',
      'setSessionToClose', 'requestApproval', 'setClosureAction']) {
      expect(z, crossing).toContain(crossing);
    }
    const x = region('const renderXReport = () => {', 'const openQuickCustomerModal = useCallback(');
    for (const crossing of ['proceedToCloseSessionDialog', 'closingDenominations', 'setClosingDenominations',
      'getReportClosingDenominations', 'consoleProps', 'loadXReport']) {
      expect(x, crossing).toContain(crossing);
    }
  });
});
