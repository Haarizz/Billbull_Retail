package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Regression tests for {@link PosCheckoutController#checkout}.
 *
 * <p>Pins the fix for the "invoice stays DRAFT / Paid=0 after a successful payment"
 * defect: a cash checkout must (1) save the draft, (2) transition status to PAID, and
 * (3) record the payment — and the §4.1 QR archival that runs last must persist through
 * {@link SalesInvoiceService#archiveReceiptQr} (single-column UPDATE), never by
 * re-saving the stale draft entity via {@code invoiceRepository.save}, which would
 * revert the just-committed PAID/payment state.
 */
class PosCheckoutControllerTest {

    @Mock private SalesInvoiceService invoiceService;
    @Mock private PosSessionService sessionService;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private PosAuditService auditService;
    @Mock private BranchRepository branchRepository;
    @Mock private SerialMasterRepository serialMasterRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductPricingRepository pricingRepository;
    @Mock private RolePermissionService permissionService;
    @Mock private PosSettingsService posSettingsService;
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService;
    /** Mocked to a no-op by default: these tests cover pricing/payment behavior, and
     *  a mocked gate simply allows. Business Day closure enforcement has its own
     *  dedicated coverage in {@code BusinessDayCheckoutGateTest}. */
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate;
    /** Continuation gate — mocked to a no-op here; the previous-Business-Day rule
     *  itself has dedicated coverage in {@code BusinessDayContinuationGateTest}. */
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayContinuationGate businessDayContinuationGate;
    /** Close-workflow gate — a REAL instance, deliberately not a mock: it is a pure,
     *  dependency-free predicate over the session, so mocking it would only hide whether
     *  these checkouts are gated. Sessions here have no X-Report, so it is a no-op.
     *  Dedicated coverage lives in PosSessionServiceTest. */
    @org.mockito.Spy private com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate =
            new com.billbull.backend.pos.session.PosSessionClosureWorkflowGate();
    /** A REAL clock, deliberately not a mock, and deliberately on a zone that is not the
     *  JVM default: these tests must exercise the same Business Day timezone indirection
     *  production uses. See PosCheckoutBusinessDateTest for the date-correctness assertions. */
    @org.mockito.Spy private com.billbull.backend.pos.businessdate.BusinessDayClock businessDayClock =
            new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Kolkata");
    /** Real instance, not a mock: the resolver is pure logic and these tests assert on the
     *  payment legs/labels it produces from the legacy request fields. */
    @org.mockito.Spy private PosPaymentAllocationResolver allocationResolver = new PosPaymentAllocationResolver();

    // Receipt-only collaborator: attaches the customer's contact details to the
    // invoice for the printed CUSTOMER block. Mocked to a no-op here — these tests
    // cover authorization and audit, not receipt content.
    @Mock private InvoiceCustomerContactService invoiceCustomerContactService;

    /** Needed for the delivery-settlement tests below (settleDelivery's owner check);
     *  unused by checkout() so every existing test above leaves it unstubbed/lenient. */
    @Mock private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;
    @Mock private com.billbull.backend.hr.targets.TargetReadinessService targetReadinessService;
    @Mock private com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;
    @Mock private com.billbull.backend.hr.employees.SalespersonService salespersonService;

    // Till permission (sales.pos) check on every till endpoint; a bare mock grants it.
    @Mock private com.billbull.backend.security.ModulePermissionService modulePermissionService;
    @InjectMocks private PosCheckoutController controller;

    /** The real settlement collaborator wired in {@link #setUp()} — kept as a field so the
     *  payment-date tests can also exercise {@code settle()} directly, which is the only
     *  way to reach its null-business-date fallback (the controller's own resolver never
     *  returns null: with no session it falls through to the Business Day clock). */
    private PosDeliverySettlementService deliverySettlementService;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        // Phase 2 salesperson/target settings default to OFF, which is the state in which
        // this suite's pre-Phase-2 behaviour is defined. The enforcement paths have their
        // own suite (PosCheckoutSalespersonEnforcementTest).
        org.mockito.Mockito.lenient().when(salesSettingsService.getSettings())
                .thenReturn(new com.billbull.backend.sales.settings.SalesSettings());
        lenient().when(branchTaxResolutionService.resolveSalesTaxRateForProduct(any(), any()))
                .thenReturn(BigDecimal.ZERO);
        // PosDeliverySettlementService is a real collaborator built from these SAME mocks —
        // @InjectMocks can't auto-construct a nested bean for the controller's constructor,
        // so it's wired here and injected post-construction. See that class's javadoc for
        // why the whole settleDelivery() critical section had to move out of this
        // (non-transactional) controller into one atomic transactional method.
        deliverySettlementService = new PosDeliverySettlementService(
                invoiceRepository, invoiceService, ownershipAccessService, posSettingsService, auditService,
                sessionService, businessDayContinuationGate, closureWorkflowGate, allocationResolver,
                terminalActivityService, invoiceCustomerContactService);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "deliverySettlementService",
                deliverySettlementService);
    }

    @Test
    void cashCheckoutPostsPaidStatusRecordsPaymentAndArchivesQrWithoutResavingInvoice()
            throws Exception {
        // Draft built by save() — total 3080, paid 0, DRAFT (the snapshot that the
        // old code wrongly re-saved at QR time).
        SalesInvoice draft = new SalesInvoice();
        draft.setId(42L);
        draft.setInvoiceNumber("INV-2026-0041");
        draft.setInvoiceTotal(new BigDecimal("3080.00"));
        draft.setTaxTotal(new BigDecimal("280.00"));
        draft.setInvoiceDate(LocalDate.now());
        draft.setStatus(SalesInvoiceStatus.DRAFT);

        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(42L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(3080.0);
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode("10593");
        item.setItemName("WATER TANK");
        item.setQuantity(1);
        item.setPrice(3500.0);
        req.setItems(List.of(item));

        controller.checkout(req);

        // Full-payment cash sale must transition the draft to PAID.
        verify(invoiceService).updateStatus(42L, SalesInvoiceStatus.PAID);
        // Payment of the full 3080 must be recorded against the invoice.
        verify(invoiceService).recordPayment(eq(42L), eq(3080.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), isNull(), any(), any());
        // QR is archived through the safe single-column update path...
        verify(invoiceService).archiveReceiptQr(eq(42L), anyString());
        // ...and the controller NEVER re-saves the stale invoice entity (the bug).
        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void idempotentReplayReturnsExistingInvoiceWithoutReposting() {
        SalesInvoice existing = new SalesInvoice();
        existing.setId(42L);
        existing.setInvoiceNumber("INV-2026-0041");
        existing.setStatus(SalesInvoiceStatus.PAID);

        when(invoiceRepository.findByPosCheckoutKey("KEY-1"))
                .thenReturn(java.util.Optional.of(existing));
        when(invoiceService.getById(42L)).thenReturn(existing);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCheckoutKey("KEY-1");

        var resp = controller.checkout(req);

        // checkout() now returns ResponseEntity<?> because a Business-Day-closed
        // refusal carries a different body type than the invoice — the success path's
        // body is unchanged.
        assertEquals(SalesInvoiceStatus.PAID, ((SalesInvoice) resp.getBody()).getStatus());
        // No new invoice, no status change, no payment, no QR write on replay.
        verify(invoiceService, never()).save(any());
        verify(invoiceService, never()).updateStatus(anyLong(), any());
        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any(), any());
    }

    private SalesInvoice draftInvoice(long id, String number, String total) {
        SalesInvoice draft = new SalesInvoice();
        draft.setId(id);
        draft.setInvoiceNumber(number);
        draft.setInvoiceTotal(new BigDecimal(total));
        draft.setTaxTotal(BigDecimal.ZERO);
        draft.setInvoiceDate(LocalDate.now());
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        return draft;
    }

    private PosCheckoutRequest.PosCardLeg cardLeg(String type, double amount, String reference) {
        PosCheckoutRequest.PosCardLeg leg = new PosCheckoutRequest.PosCardLeg();
        leg.setCardType(type);
        leg.setAmount(amount);
        leg.setReferenceNumber(reference);
        return leg;
    }

    @Test
    void multiCardCheckoutRecordsOnePaymentPerLegWithSharedSplitGroupIdAndCombinedMode() {
        SalesInvoice draft = draftInvoice(50L, "INV-2026-0050", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(50L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(
                cardLeg("Visa", 300.0, "REF-1"),
                cardLeg("Mastercard", 450.0, "REF-2"),
                cardLeg("Amex", 250.0, "REF-3")));

        controller.checkout(req);

        verify(invoiceService).updateStatus(50L, SalesInvoiceStatus.PAID);

        ArgumentCaptor<String> splitGroupCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> combinedModeCaptor = ArgumentCaptor.forClass(String.class);
        verify(invoiceService).recordPayment(eq(50L), eq(300.0), eq("Visa"), eq("REF-1"),
                any(LocalDate.class), isNull(), isNull(), splitGroupCaptor.capture(), combinedModeCaptor.capture(), any());
        verify(invoiceService).recordPayment(eq(50L), eq(450.0), eq("Mastercard"), eq("REF-2"),
                any(LocalDate.class), isNull(), isNull(), anyString(), anyString(), any());
        verify(invoiceService).recordPayment(eq(50L), eq(250.0), eq("Amex"), eq("REF-3"),
                any(LocalDate.class), isNull(), isNull(), anyString(), anyString(), any());

        // All three legs must share one splitGroupId and one combined-mode label.
        assertNotNull(splitGroupCaptor.getValue());
        assertEquals("Visa + Mastercard + Amex", combinedModeCaptor.getValue());
    }

    @Test
    void mixedCashAndTwoCardLegsShareOneSplitGroupId() {
        SalesInvoice draft = draftInvoice(51L, "INV-2026-0051", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(51L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("mixed");
        req.setCashAmount(400.0);
        req.setCardLegs(List.of(
                cardLeg("Visa", 350.0, null),
                cardLeg("Mastercard", 250.0, null)));

        controller.checkout(req);

        verify(invoiceService).recordPayment(eq(51L), eq(400.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Cash + Visa + Mastercard"), any());
        verify(invoiceService).recordPayment(eq(51L), eq(350.0), eq("Visa"),
                isNull(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Cash + Visa + Mastercard"), any());
        verify(invoiceService).recordPayment(eq(51L), eq(250.0), eq("Mastercard"),
                isNull(), any(LocalDate.class), isNull(), isNull(), anyString(), eq("Cash + Visa + Mastercard"), any());
    }

    @Test
    void singleLegCheckoutStillGetsNoSplitGroupId() {
        SalesInvoice draft = draftInvoice(52L, "INV-2026-0052", "3080.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(52L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(3080.0);

        controller.checkout(req);

        // Unchanged legacy behavior: a single-leg checkout passes a null splitGroupId.
        verify(invoiceService).recordPayment(eq(52L), eq(3080.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), isNull(), any(), any());
    }

    @Test
    void legacyScalarCardFieldsStillWorkWhenCardLegsAbsent() {
        SalesInvoice draft = draftInvoice(53L, "INV-2026-0053", "500.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(53L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardAmount(500.0);
        req.setCardType("Visa");
        req.setCardReference("LEGACY-REF");

        controller.checkout(req);

        verify(invoiceService).recordPayment(eq(53L), eq(500.0), eq("Visa"), eq("LEGACY-REF"),
                any(LocalDate.class), isNull(), isNull(), isNull(), any(), any());
    }

    @Test
    void cardLegMissingCardTypeIsRejectedBeforeInvoiceIsCreated() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(cardLeg(null, 100.0, null), cardLeg("Visa", 900.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void cardLegWithZeroAmountIsRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(cardLeg("Visa", 0.0, null), cardLeg("Mastercard", 1000.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void duplicateReferenceNumbersAcrossCardLegsAreRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(
                cardLeg("Visa", 500.0, "DUP-1"),
                cardLeg("Mastercard", 500.0, "dup-1")));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void moreThanFiveCardLegsIsRejected() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        req.setCardLegs(List.of(
                cardLeg("Visa", 100.0, null), cardLeg("Visa", 100.0, null),
                cardLeg("Visa", 100.0, null), cardLeg("Visa", 100.0, null),
                cardLeg("Visa", 100.0, null), cardLeg("Visa", 100.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void cardLegTotalMismatchOnNonCreditCheckoutIsRejectedAndDraftInvoiceIsCleanedUp() {
        SalesInvoice draft = draftInvoice(54L, "INV-2026-0054", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("card");
        // Legs only sum to 900 against a 1000 invoice — must be rejected, not silently truncated.
        req.setCardLegs(List.of(cardLeg("Visa", 500.0, null), cardLeg("Mastercard", 400.0, null)));

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).updateStatus(anyLong(), any());
        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any(), any());
        verify(invoiceService).delete(54L);
    }

    @Test
    void cardLegPartialReceiptIsAllowedOnCreditCheckout() {
        SalesInvoice draft = draftInvoice(55L, "INV-2026-0055", "1000.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(55L)).thenReturn(draft);

        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("credit");
        // Partial receipt against a Credit sale — legs need not sum to the full invoice total.
        req.setCardLegs(List.of(cardLeg("Visa", 300.0, null), cardLeg("Mastercard", 200.0, null)));

        controller.checkout(req);

        verify(invoiceService, times(2)).recordPayment(eq(55L), anyDouble(), anyString(),
                any(), any(LocalDate.class), isNull(), isNull(), anyString(), anyString(), any());
    }

    // ── §2.4 price-override gate ────────────────────────────────────────────

    private void stubBelowMinimumPricedProduct(String code, long productId, String minPrice) {
        Product product = new Product();
        product.setId(productId);
        product.setCode(code);
        ProductPricing pricing = new ProductPricing();
        pricing.setProduct(product);
        pricing.setMinPrice(new BigDecimal(minPrice));
        lenient().when(productRepository.findByCodeIn(any())).thenReturn(List.of(product));
        // Pricing is batch-loaded for every checkout (one query over the distinct products).
        lenient().when(pricingRepository.findByProductIdIn(any())).thenReturn(List.of(pricing));
    }

    private PosCheckoutRequest belowMinimumCheckoutRequest(String code, double price) {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(price);
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode(code);
        item.setQuantity(1);
        item.setPrice(price);
        req.setItems(List.of(item));
        return req;
    }

    @Test
    void belowMinimumPriceRejectedWithoutPermissionOrSupervisorOverride() {
        stubBelowMinimumPricedProduct("10672", 900L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void belowMinimumPriceAllowedWhenUserHasPermissionNoOverrideNeeded() {
        SalesInvoice draft = draftInvoice(60L, "INV-2026-0060", "180.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(60L)).thenReturn(draft);
        stubBelowMinimumPricedProduct("10672", 900L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(true);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);

        controller.checkout(req);

        verify(invoiceService).updateStatus(60L, SalesInvoiceStatus.PAID);
        verify(posSettingsService, never()).verifyPin(any());
    }

    @Test
    void belowMinimumPriceBypassedWithValidSupervisorPin() {
        SalesInvoice draft = draftInvoice(61L, "INV-2026-0061", "180.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(61L)).thenReturn(draft);
        stubBelowMinimumPricedProduct("10672", 901L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        when(posSettingsService.verifyPin("4321")).thenReturn(true);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
        req.setSupervisorOverridePin("4321");

        controller.checkout(req);

        verify(invoiceService).updateStatus(61L, SalesInvoiceStatus.PAID);
    }

    @Test
    void belowMinimumPriceRejectedWithWrongSupervisorPin() {
        stubBelowMinimumPricedProduct("10672", 902L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        when(posSettingsService.verifyPin("0000")).thenReturn(false);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
        req.setSupervisorOverridePin("0000");

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void belowMinimumPriceBypassedWithValidSupervisorCredentials() {
        SalesInvoice draft = draftInvoice(62L, "INV-2026-0062", "180.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(62L)).thenReturn(draft);
        stubBelowMinimumPricedProduct("10672", 903L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        when(posSettingsService.verifySupervisorCredentials(eq("manager@example.com"), eq("secret"), any(), any()))
                .thenReturn(PosSettingsService.SupervisorAuthResult.valid("Manager", "manager"));
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
        req.setSupervisorOverrideEmail("manager@example.com");
        req.setSupervisorOverridePassword("secret");

        controller.checkout(req);

        verify(invoiceService).updateStatus(62L, SalesInvoiceStatus.PAID);
    }

    @Test
    void gateSkippedEntirelyWhenRequirePriceOverrideApprovalIsOff() {
        SalesInvoice draft = draftInvoice(64L, "INV-2026-0064", "180.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(64L)).thenReturn(draft);
        stubBelowMinimumPricedProduct("10672", 905L, "190.00");
        PosSettings offSettings = new PosSettings();
        offSettings.setRequirePriceOverrideApproval(false);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
        req.setBranchId(1L);
        when(posSettingsService.getForBranch(1L)).thenReturn(offSettings);

        controller.checkout(req);

        verify(invoiceService).updateStatus(64L, SalesInvoiceStatus.PAID);
        verify(permissionService, never()).currentUserCanEdit(any());
        verify(posSettingsService, never()).verifyPin(any());
    }

    @Test
    void gateStillEnforcedWhenRequirePriceOverrideApprovalIsOn() {
        stubBelowMinimumPricedProduct("10672", 906L, "190.00");
        PosSettings onSettings = new PosSettings();
        onSettings.setRequirePriceOverrideApproval(true);
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
        req.setBranchId(1L);
        when(posSettingsService.getForBranch(1L)).thenReturn(onSettings);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void gateFailsSafeOnWhenBranchSettingsCannotBeResolved() {
        stubBelowMinimumPricedProduct("10672", 907L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
        req.setBranchId(1L);
        when(posSettingsService.getForBranch(1L)).thenReturn(null);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
    }

    @Test
    void atOrAboveMinimumPriceNeverConsultsPermissionOrOverride() {
        SalesInvoice draft = draftInvoice(63L, "INV-2026-0063", "200.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(63L)).thenReturn(draft);
        stubBelowMinimumPricedProduct("10672", 904L, "190.00");
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 200.0);

        controller.checkout(req);

        verify(permissionService, never()).currentUserCanEdit(any());
        verify(posSettingsService, never()).verifyPin(any());
    }

    // ── Checkout capability advertisement ──────────────────────────────────────

    @Test
    void capabilitiesEndpointAdvertisesPaymentAllocationSupport() {
        PosCheckoutCapabilitiesResponse caps = controller.getCapabilities();

        // A terminal refuses to settle unless this is true, so it must never regress:
        // a server that quietly stopped honouring allocations would drop the tender.
        assertTrue(caps.isPaymentAllocations());
        assertTrue(caps.isLegacyPaymentScalars());
        assertEquals(2, caps.getCheckoutApiVersion());
        assertEquals(PosPaymentAllocationResolver.MAX_CARD_LEGS, caps.getMaxCardAllocations());
        // VOUCHER is how a terminal discovers that Credit Voucher redemption is available as a
        // tender. It is a payment instrument that draws down the store-credit liability, never a
        // coupon/discount — see CreditVoucherService.
        // BNPL likewise: the terminal only offers Buy Now Pay Later once the server has said it
        // understands the tender, because a server that ignored it would post the sale unpaid.
        assertEquals(java.util.List.of("CASH", "CARD", "ONLINE", "CREDIT", "VOUCHER", "BNPL"),
                caps.getSupportedAllocationTypes());
        // Customer Advance is a customer-ledger operation, not a checkout tender — a terminal
        // must not discover it here and offer it as a payment button.
        assertTrue(!caps.getSupportedAllocationTypes().contains("ADVANCE"));
    }

    // ---------------------------------------------------------------------
    // Business Day closure: selling stops, and the ONLY way through is the
    // existing per-transaction supervisor authorization.
    // ---------------------------------------------------------------------

    /** Makes the Business Day gate refuse, as it does once the extension has expired. */
    private void businessDayIsClosed() {
        com.billbull.backend.pos.businessdate.BusinessDayClosedResponse closed =
                new com.billbull.backend.pos.businessdate.BusinessDayClosedResponse();
        closed.setTradingDate(LocalDate.of(2026, 8, 10));
        closed.setClosedAt(LocalDateTime.of(2026, 8, 10, 23, 0));
        closed.setNextStartAt(LocalDateTime.of(2026, 8, 11, 9, 0));
        doThrow(new com.billbull.backend.pos.businessdate.BusinessDayClosedException(closed))
                .when(businessDayCheckoutGate).assertCheckoutAllowed(any());
    }

    private PosCheckoutRequest simpleCashRequest() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setBranchId(1L);
        req.setSessionId(9L);
        req.setTerminalId("T1");
        req.setPaymentMode("Cash");
        req.setAmountTendered(100.0);
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode("X");
        item.setItemName("ITEM");
        item.setQuantity(1);
        item.setPrice(100.0);
        req.setItems(List.of(item));
        return req;
    }

    @Test
    void checkoutAfterBusinessDayClosureIsRefusedWithoutSupervisorAuthorization() {
        businessDayIsClosed();

        var resp = controller.checkout(simpleCashRequest());

        assertEquals(423, resp.getStatusCode().value());
        var body = (com.billbull.backend.pos.businessdate.BusinessDayClosedResponse) resp.getBody();
        // The POS is told a supervisor can release THIS transaction, so it can raise
        // the existing authorization dialog rather than present a dead end.
        assertTrue(body.isSupervisorAuthorizationAvailable());
        // Nothing was created: a refused checkout must leave no stranded invoice.
        verify(invoiceService, never()).save(any());
    }

    @Test
    void supervisorPinReleasesExactlyOnePendingCheckoutAfterClosure() {
        businessDayIsClosed();
        when(posSettingsService.verifyPin("4321")).thenReturn(true);

        SalesInvoice draft = new SalesInvoice();
        draft.setId(42L);
        draft.setInvoiceNumber("POS-1");
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(42L)).thenReturn(draft);

        PosCheckoutRequest req = simpleCashRequest();
        req.setSupervisorOverridePin("4321");

        var resp = controller.checkout(req);

        assertEquals(200, resp.getStatusCode().value());
        // The release is audited — a sale rung up after closure must never be
        // indistinguishable from one rung up during trading.
        verify(auditService).logBusinessDayClosedCheckoutAuthorized(
                eq(1L), eq(9L), eq("T1"), eq("2026-08-10"), eq("2026-08-10T23:00"));
    }

    @Test
    void aWrongSupervisorPinDoesNotReleaseTheCheckout() {
        businessDayIsClosed();
        when(posSettingsService.verifyPin("0000")).thenReturn(false);

        PosCheckoutRequest req = simpleCashRequest();
        req.setSupervisorOverridePin("0000");

        assertEquals(423, controller.checkout(req).getStatusCode().value());
        verify(invoiceService, never()).save(any());
    }

    @Test
    void checkoutOnAPreviousBusinessDaySessionIsRefusedEvenWithSupervisorAuthorization() {
        // The one-sale supervisor authorization releases a sale on a *closed current*
        // Business Day. It must never be spendable to keep selling on a session that
        // belongs to an *earlier* Business Day whose Day Close is still outstanding.
        businessDayIsClosed();
        lenient().when(posSettingsService.verifyPin("4321")).thenReturn(true);
        com.billbull.backend.pos.session.PosSession stale = new com.billbull.backend.pos.session.PosSession();
        stale.setId(9L);
        when(sessionService.getById(9L)).thenReturn(stale);
        org.mockito.Mockito.doThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT, "PREVIOUS_DAY_SESSION_OPEN: blocked"))
                .when(businessDayContinuationGate).assertMayContinue(stale);

        PosCheckoutRequest req = simpleCashRequest();
        req.setSupervisorOverridePin("4321");

        org.springframework.web.server.ResponseStatusException ex = assertThrows(
                org.springframework.web.server.ResponseStatusException.class, () -> controller.checkout(req));
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void checkoutOnASessionInTheClosureWorkflowIsRefusedEvenWithSupervisorAuthorization() {
        // Same reasoning as the previous-Business-Day case above: the one-sale supervisor
        // authorization releases a sale against a closed Business Day, it is not a licence
        // to add sales to a session an operator has already started closing.
        businessDayIsClosed();
        lenient().when(posSettingsService.verifyPin("4321")).thenReturn(true);
        com.billbull.backend.pos.session.PosSession closing = new com.billbull.backend.pos.session.PosSession();
        closing.setId(9L);
        closing.setTerminalId("T1");
        closing.setStatus(com.billbull.backend.pos.session.PosSessionStatus.OPEN);
        closing.setClosingStartedAt(java.time.LocalDateTime.now());
        closing.setClosingStartedBy("cashier1");
        when(sessionService.getById(9L)).thenReturn(closing);

        PosCheckoutRequest req = simpleCashRequest();
        req.setSupervisorOverridePin("4321");

        org.springframework.web.server.ResponseStatusException ex = assertThrows(
                org.springframework.web.server.ResponseStatusException.class, () -> controller.checkout(req));
        assertTrue(ex.getReason().contains("SESSION_CLOSING_WORKFLOW"));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void checkoutIsUnaffectedByAnInformationalXReport() {
        // The X-Report is a mid-shift read. A session that has produced one, but whose
        // closure was never started, must still sell normally.
        com.billbull.backend.pos.session.PosSession xReported = new com.billbull.backend.pos.session.PosSession();
        xReported.setId(9L);
        xReported.setStatus(com.billbull.backend.pos.session.PosSessionStatus.OPEN);
        xReported.setXReportGeneratedAt(java.time.LocalDateTime.now());
        when(sessionService.getById(9L)).thenReturn(xReported);

        SalesInvoice draft = new SalesInvoice();
        draft.setId(42L);
        draft.setInvoiceNumber("POS-1");
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(42L)).thenReturn(draft);

        assertEquals(200, controller.checkout(simpleCashRequest()).getStatusCode().value());
    }

    @Test
    void authorizationDoesNotCarryOverToTheNextSale() {
        // The distinction this whole design turns on: authorizing one pending sale
        // must NOT leave the till able to ring up another. A second checkout with no
        // credentials of its own is refused, even immediately afterwards.
        businessDayIsClosed();
        when(posSettingsService.verifyPin("4321")).thenReturn(true);

        SalesInvoice draft = new SalesInvoice();
        draft.setId(42L);
        draft.setInvoiceNumber("POS-1");
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(42L)).thenReturn(draft);

        PosCheckoutRequest authorized = simpleCashRequest();
        authorized.setSupervisorOverridePin("4321");
        assertEquals(200, controller.checkout(authorized).getStatusCode().value());

        // Same session, same terminal, moments later — no credentials, no sale.
        assertEquals(423, controller.checkout(simpleCashRequest()).getStatusCode().value());
    }

    // ---------------------------------------------------------------------
    // settleDelivery() -- cross-session delivery settlement: the collection session
    // (Payment.posSessionId, the session actually open when cash is collected) is now
    // threaded through independently of the invoice's own, immutable creation session
    // (SalesInvoice.posSessionId).
    // ---------------------------------------------------------------------

    private SalesInvoice deliveryInvoice(Long id, String invoiceNumber, double total, double amountPaid) {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(id);
        inv.setInvoiceNumber(invoiceNumber);
        inv.setInvoiceTotal(new BigDecimal(total));
        inv.setAmountPaid(new BigDecimal(amountPaid));
        inv.setInvoiceDate(LocalDate.now());
        inv.setBranchId(1L);
        // The invoice's own creation session -- Session 99 -- must never move.
        inv.setPosSessionId(99L);
        return inv;
    }

    private PosSession openPosSession(Long id) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setStatus(PosSessionStatus.OPEN);
        s.setBranchId(1L);
        return s;
    }

    private PosCheckoutController.DeliverySettleRequest deliverySettleRequest(Long sessionId) {
        PosCheckoutController.DeliverySettleRequest req = new PosCheckoutController.DeliverySettleRequest();
        req.setSessionId(sessionId);
        req.setTerminalId("T1");
        req.setBranchId(1L);
        return req;
    }

    @Test
    void settleDeliveryAttributesPaymentToTheSettlingSessionNotTheInvoicesOriginalSession() {
        // Mirrors the real INV-2026-0891 / PAY-2026-0881 case: invoice created (and still
        // tagged) under session 99, driver collects cash today under session 100 -- the
        // session that is actually open right now.
        SalesInvoice invoice = deliveryInvoice(891L, "INV-2026-0891", 195.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(891L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        when(sessionService.getById(100L)).thenReturn(openPosSession(100L));

        controller.settleDelivery(891L, deliverySettleRequest(100L));

        // The COLLECTION session travels as the Payment's own, new trailing argument --
        // never derived from invoice.getPosSessionId() (which stays 99).
        verify(invoiceService).recordPayment(eq(891L), eq(195.0), eq("Cash"), any(),
                any(LocalDate.class), any(), isNull(), isNull(), any(), eq(100L));
        assertEquals(Long.valueOf(99L), invoice.getPosSessionId(),
                "settling in a later session must never move the sale's own creation session");
    }

    @Test
    void settleDeliveryAllowsNullSessionForBackOfficeSettlementWithoutFallingBackToInvoiceSession() {
        SalesInvoice invoice = deliveryInvoice(892L, "INV-2026-0892", 195.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(892L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);

        controller.settleDelivery(892L, deliverySettleRequest(null));

        // No POS session at all -- the collection session stays null. It must NOT
        // silently become invoice.getPosSessionId() (99).
        verify(invoiceService).recordPayment(eq(892L), eq(195.0), eq("Cash"), any(),
                any(LocalDate.class), any(), isNull(), isNull(), any(), isNull());
        verify(sessionService, never()).getById(any());
    }

    @Test
    void settleDeliveryRejectsAClosedSettlingSession() {
        SalesInvoice invoice = deliveryInvoice(893L, "INV-2026-0893", 195.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(893L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        PosSession closedSession = openPosSession(101L);
        closedSession.setStatus(PosSessionStatus.CLOSED);
        when(sessionService.getById(101L)).thenReturn(closedSession);

        assertThrows(ResponseStatusException.class,
                () -> controller.settleDelivery(893L, deliverySettleRequest(101L)));

        // A stale/closed session reference must never reach payment creation -- the
        // "lost cash" bug this fix closes, reintroduced via a different trigger.
        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any(), any());
        verify(invoiceService, never()).recordPaymentForAuthorizedDeliverySettlement(
                anyLong(), anyDouble(), anyString(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void settleDeliveryRejectsASettlingSessionFromADifferentBranch() {
        // Delivery invoice belongs to branch 1 (deliveryInvoice()'s default); the settling
        // session belongs to branch 2 — a cross-branch delivery/session mismatch must never
        // let branch 2's cash reconciliation silently absorb branch 1's collection.
        SalesInvoice invoice = deliveryInvoice(897L, "INV-2026-0897", 195.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(897L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        PosSession otherBranchSession = openPosSession(102L);
        otherBranchSession.setBranchId(2L);
        when(sessionService.getById(102L)).thenReturn(otherBranchSession);

        assertThrows(ResponseStatusException.class,
                () -> controller.settleDelivery(897L, deliverySettleRequest(102L)));

        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any(), any());
        verify(invoiceService, never()).recordPaymentForAuthorizedDeliverySettlement(
                anyLong(), anyDouble(), anyString(), any(), any(), any(), any(), any(), any(), any());
        // The invoice's own branch must be untouched by a rejected settlement attempt.
        assertEquals(Long.valueOf(1L), invoice.getBranchId());
    }

    @Test
    void settleDeliveryLocksTheInvoiceRowPessimistically() {
        SalesInvoice invoice = deliveryInvoice(894L, "INV-2026-0894", 195.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(894L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        when(sessionService.getById(100L)).thenReturn(openPosSession(100L));

        controller.settleDelivery(894L, deliverySettleRequest(100L));

        // Concurrency guard: two simultaneous settlement requests for the same delivery
        // must serialize on this row lock, never load it via the plain, unlocked finder.
        verify(invoiceRepository).findByIdForUpdate(894L);
        verify(invoiceRepository, never()).findById(894L);
    }

    @Test
    void settleDeliverySkipsRecordingWhenTheBalanceIsAlreadyZero() {
        // Sequential retry after the first settlement already committed: amountPaid now
        // equals invoiceTotal, so the existing balanceDue<=0.001 guard is the natural
        // idempotency protection -- a second, identical request records nothing further.
        SalesInvoice invoice = deliveryInvoice(895L, "INV-2026-0895", 195.0, 195.0);
        when(invoiceRepository.findByIdForUpdate(895L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);

        controller.settleDelivery(895L, deliverySettleRequest(null));

        verify(invoiceService, never()).recordPayment(anyLong(), anyDouble(), anyString(),
                any(), any(), any(), any(), any(), any(), any());
    }

    // ---------------------------------------------------------------------
    // settleDelivery() -- collection DATE. The date half of the same bug class as the
    // collection-SESSION tests above: a delivery raised on Business Day D1 and collected
    // on D2 is a D2 receipt. Stamping it D1 hid today's cash from every date-keyed
    // cash/receipt report and back-dated the ReceiptVoucher (PaymentService.
    // upsertReceiptVoucher copies Payment.paymentDate onto it) -- and therefore its GL
    // entry -- into what may already be a closed accounting period.
    // ---------------------------------------------------------------------

    /** Business Day the delivery was raised on. */
    private static final LocalDate SALE_DATE_D1 = LocalDate.of(2026, 8, 10);
    /** Business Day the driver actually brings the cash back on -- four days later. */
    private static final LocalDate SETTLE_DATE_D2 = LocalDate.of(2026, 8, 14);

    /** An open settling session carrying its own Trading Date, exactly as production does. */
    private PosSession openPosSessionTrading(Long id, LocalDate tradingDate) {
        PosSession s = openPosSession(id);
        s.setTradingDate(tradingDate);
        return s;
    }

    private LocalDate capturedSettlementPaymentDate() {
        ArgumentCaptor<LocalDate> captor = ArgumentCaptor.forClass(LocalDate.class);
        verify(invoiceService).recordPayment(anyLong(), anyDouble(), any(), any(),
                captor.capture(), any(), any(), any(), any(), any());
        return captor.getValue();
    }

    @Test
    void settleDeliveryDatesThePaymentOnTheSettlingBusinessDayNotTheInvoiceDate() {
        // Scenario A: raised D1 (2026-08-10), collected D2 (2026-08-14) under session 100.
        SalesInvoice invoice = deliveryInvoice(898L, "INV-2026-0898", 195.0, 0.0);
        invoice.setInvoiceDate(SALE_DATE_D1);
        when(invoiceRepository.findByIdForUpdate(898L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        when(sessionService.getById(100L)).thenReturn(openPosSessionTrading(100L, SETTLE_DATE_D2));

        controller.settleDelivery(898L, deliverySettleRequest(100L));

        // The receipt -- and every date-keyed report and GL posting derived from it --
        // belongs to the day the money was collected.
        assertEquals(SETTLE_DATE_D2, capturedSettlementPaymentDate(),
                "the payment/collection date must be the settling session's Business Day");
        // ...and the collection session fix is intact: same call, session 100.
        verify(invoiceService).recordPayment(eq(898L), eq(195.0), eq("Cash"), any(),
                eq(SETTLE_DATE_D2), any(), isNull(), isNull(), any(), eq(100L));
        // The sale's own identity never moves: neither its date nor its creation session.
        assertEquals(SALE_DATE_D1, invoice.getInvoiceDate(),
                "settling later must never rewrite the invoice's own date");
        assertEquals(Long.valueOf(99L), invoice.getPosSessionId());
    }

    @Test
    void settleDeliveryDatesEveryTenderLegOfASplitOnTheSettlingBusinessDay() {
        // One settlement, two legs -- both are the same collection event, so both carry D2.
        SalesInvoice invoice = deliveryInvoice(899L, "INV-2026-0899", 195.0, 0.0);
        invoice.setInvoiceDate(SALE_DATE_D1);
        when(invoiceRepository.findByIdForUpdate(899L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        when(sessionService.getById(100L)).thenReturn(openPosSessionTrading(100L, SETTLE_DATE_D2));

        PosCheckoutController.DeliverySettleRequest req = deliverySettleRequest(100L);
        req.setCashAmount(95.0);
        req.setCardAmount(100.0);
        req.setCardType("Visa");

        controller.settleDelivery(899L, req);

        verify(invoiceService, times(2)).recordPayment(eq(899L), anyDouble(), anyString(),
                any(), eq(SETTLE_DATE_D2), any(), isNull(), anyString(), anyString(), eq(100L));
    }

    @Test
    void settleDeliveryFallsBackToTheInvoiceDateWhenThereIsNoSettlementBusinessDate() {
        // Scenario B: the documented fallback. Only reachable by calling settle() directly --
        // the controller's posBusinessDate() never returns null (with no session it falls
        // through to the Business Day clock, covered by the next test).
        SalesInvoice invoice = deliveryInvoice(900L, "INV-2026-0900", 195.0, 0.0);
        invoice.setInvoiceDate(SALE_DATE_D1);
        when(invoiceRepository.findByIdForUpdate(900L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);

        deliverySettlementService.settle(900L, deliverySettleRequest(null), null);

        assertEquals(SALE_DATE_D1, capturedSettlementPaymentDate(),
                "with no settling Business Day resolvable at all, the invoice date is the fallback");
    }

    @Test
    void backOfficeSettlementWithNoSessionDatesThePaymentOnTheBusinessDayClock() {
        // Back-office settlement of an old delivery: still a collection happening TODAY,
        // so it is dated by the Business Day clock (never LocalDate.now() in the JVM zone,
        // never the stale invoice date).
        SalesInvoice invoice = deliveryInvoice(901L, "INV-2026-0901", 195.0, 0.0);
        invoice.setInvoiceDate(SALE_DATE_D1);
        when(invoiceRepository.findByIdForUpdate(901L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);

        controller.settleDelivery(901L, deliverySettleRequest(null));

        assertEquals(businessDayClock.now().toLocalDate(), capturedSettlementPaymentDate());
        assertEquals(SALE_DATE_D1, invoice.getInvoiceDate());
    }

    @Test
    void settleDeliveryUsesTheSessionDateWhenALegacySessionHasNoTradingDate() {
        // Sessions predating tradingDate fall back to sessionDate -- the same precedence
        // posBusinessDate() applies at checkout. Still never the invoice date.
        SalesInvoice invoice = deliveryInvoice(902L, "INV-2026-0902", 195.0, 0.0);
        invoice.setInvoiceDate(SALE_DATE_D1);
        when(invoiceRepository.findByIdForUpdate(902L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        PosSession legacy = openPosSession(103L);
        legacy.setTradingDate(null);
        legacy.setSessionDate(SETTLE_DATE_D2);
        when(sessionService.getById(103L)).thenReturn(legacy);

        controller.settleDelivery(902L, deliverySettleRequest(103L));

        assertEquals(SETTLE_DATE_D2, capturedSettlementPaymentDate());
    }

    @Test
    void settleDeliveryNonCashModeStillCarriesTheSettlingSession() {
        SalesInvoice invoice = deliveryInvoice(896L, "INV-2026-0896", 195.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(896L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        when(sessionService.getById(100L)).thenReturn(openPosSession(100L));

        PosCheckoutController.DeliverySettleRequest req = deliverySettleRequest(100L);
        req.setCardAmount(195.0);
        req.setCardType("Visa");
        req.setCardReference("CARD-REF-1");

        controller.settleDelivery(896L, req);

        // Every tender leg of one settlement shares the same collection session,
        // regardless of tender type -- only the CASH bucket feeds expected-cash math,
        // but the session attribution itself is uniform.
        verify(invoiceService).recordPayment(eq(896L), eq(195.0), eq("Visa"), eq("CARD-REF-1"),
                any(LocalDate.class), any(), isNull(), isNull(), any(), eq(100L));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POS → Orders (Sales Order take-up) and the PI Flow delivery workflow
    // ═══════════════════════════════════════════════════════════════════════

    private PosCheckoutRequest cashRequest(double amount) {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setPaymentMode("Cash");
        req.setAmountTendered(amount);
        req.setCustomerCode("C-001");
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode("10593");
        item.setItemName("WATER TANK");
        item.setQuantity(1);
        item.setPrice(amount);
        item.setSalesOrderItemId(7L);
        req.setItems(List.of(item));
        return req;
    }

    private SalesInvoice draftInvoice(Long id, String total) {
        SalesInvoice draft = new SalesInvoice();
        draft.setId(id);
        draft.setInvoiceNumber("INV-" + id);
        draft.setInvoiceTotal(new BigDecimal(total));
        draft.setInvoiceDate(LocalDate.now());
        draft.setStatus(SalesInvoiceStatus.DRAFT);
        return draft;
    }

    @Test
    void checkoutOfASalesOrderLinksTheInvoiceAndCompletesTheOrderAfterThePayment() {
        var soService = mock(com.billbull.backend.pos.salesorder.PosSalesOrderService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "posSalesOrderService", soService);
        SalesInvoice draft = draftInvoice(61L, "500.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(61L)).thenReturn(draft);

        PosCheckoutRequest req = cashRequest(500.0);
        req.setLinkedSalesOrder(" SO-0120 ");
        controller.checkout(req);

        verify(soService).assertCanTakeUp("SO-0120", "C-001");
        ArgumentCaptor<SalesInvoice> saved = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceService).save(saved.capture());
        assertEquals("SO-0120", saved.getValue().getLinkedSalesOrder());
        assertEquals(7L, saved.getValue().getItems().get(0).getSalesOrderItemId());
        var order = org.mockito.Mockito.inOrder(invoiceService);
        order.verify(invoiceService).recordPayment(eq(61L), eq(500.0), eq("Cash"),
                isNull(), any(LocalDate.class), isNull(), isNull(), isNull(), any(), any());
        order.verify(invoiceService).completeSalesOrderConversion(61L);
    }

    @Test
    void aSalesOrderTakeUpWithNoSalespersonNamedInheritsTheOrdersSalesperson() {
        var soService = mock(com.billbull.backend.pos.salesorder.PosSalesOrderService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "posSalesOrderService", soService);
        var rep = new com.billbull.backend.hr.employees.Employee();
        rep.setId(44L);
        rep.setEmployeeCode("EMP-44");
        rep.setFirstName("Asha");
        rep.setLastName("Nair");
        when(soService.orderSalesperson("SO-0120")).thenReturn(rep);
        when(salespersonService.resolveEligible(44L, "EMP-44")).thenReturn(rep);
        SalesInvoice draft = draftInvoice(63L, "500.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(63L)).thenReturn(draft);

        PosCheckoutRequest req = cashRequest(500.0);
        req.setLinkedSalesOrder("SO-0120");
        controller.checkout(req);

        ArgumentCaptor<SalesInvoice> saved = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceService).save(saved.capture());
        assertEquals(44L, saved.getValue().getSalespersonEmployeeId());
        assertEquals("EMP-44", saved.getValue().getSalespersonEmployeeCode());
        assertEquals("Asha Nair", saved.getValue().getSalespersonName());
    }

    @Test
    void aSalespersonNamedAtTheTillWinsOverTheOrders() {
        var soService = mock(com.billbull.backend.pos.salesorder.PosSalesOrderService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "posSalesOrderService", soService);

        PosCheckoutRequest req = cashRequest(500.0);
        req.setLinkedSalesOrder("SO-0120");
        req.setSalespersonEmployeeId(55L);
        controller.inheritSalesOrderSalesperson(req);

        verify(soService, never()).orderSalesperson(any());
        assertEquals(55L, req.getSalespersonEmployeeId());
    }

    @Test
    void aRefusedSalesOrderTakeUpWritesNothing() {
        var soService = mock(com.billbull.backend.pos.salesorder.PosSalesOrderService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "posSalesOrderService", soService);
        when(soService.assertCanTakeUp(any(), any())).thenThrow(
                new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "taken"));

        PosCheckoutRequest req = cashRequest(500.0);
        req.setLinkedSalesOrder("SO-0120");
        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));

        verify(invoiceService, never()).save(any());
    }

    @Test
    void anOrdinarySaleNeverTouchesTheSalesOrderPath() {
        SalesInvoice draft = draftInvoice(62L, "500.00");
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(62L)).thenReturn(draft);

        controller.checkout(cashRequest(500.0));

        verify(invoiceService, never()).completeSalesOrderConversion(any());
        ArgumentCaptor<SalesInvoice> saved = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceService).save(saved.capture());
        assertEquals(null, saved.getValue().getItems().get(0).getSalesOrderItemId());
    }

    @Test
    void settlingAPendingProformaConvertsItBeforeRecordingThePayment() {
        PosProformaDeliveryService proforma = mock(PosProformaDeliveryService.class);
        deliverySettlementService.setProformaDeliveryService(proforma);
        SalesInvoice invoice = deliveryInvoice(901L, "INV-901", 300.0, 0.0);
        invoice.setStatus(SalesInvoiceStatus.DRAFT);
        invoice.setPosProformaPending(Boolean.TRUE);
        when(invoiceRepository.findByIdForUpdate(901L)).thenReturn(java.util.Optional.of(invoice));
        when(invoiceRepository.findById(901L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);
        when(sessionService.getById(100L)).thenReturn(openPosSession(100L));

        controller.settleDelivery(901L, deliverySettleRequest(100L));

        var order = org.mockito.Mockito.inOrder(proforma, invoiceService);
        order.verify(proforma).convert(eq(901L), eq(100L), any(LocalDate.class));
        order.verify(invoiceService).recordPayment(eq(901L), eq(300.0), any(), any(),
                any(LocalDate.class), any(), isNull(), isNull(), any(), eq(100L));
    }

    @Test
    void settlingAnOrdinaryDeliveryNeverConverts() {
        PosProformaDeliveryService proforma = mock(PosProformaDeliveryService.class);
        deliverySettlementService.setProformaDeliveryService(proforma);
        SalesInvoice invoice = deliveryInvoice(902L, "INV-902", 300.0, 0.0);
        when(invoiceRepository.findByIdForUpdate(902L)).thenReturn(java.util.Optional.of(invoice));
        when(ownershipAccessService.canAccessRecord(any(), any())).thenReturn(true);

        controller.settleDelivery(902L, deliverySettleRequest(null));

        verify(proforma, never()).convert(any(), any(), any());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // P0-1: invoice construction is independent of the price-approval setting
    // ═══════════════════════════════════════════════════════════════════════

    private static final long P0_BRANCH = 1L;

    private Product p0Product(long id, String code, com.billbull.backend.inventory.product.ProductType type) {
        Product p = new Product();
        p.setId(id);
        p.setCode(code);
        p.setProductType(type);
        return p;
    }

    private ProductPricing p0Pricing(Product product, String cost, String minPrice) {
        ProductPricing pr = new ProductPricing();
        pr.setProduct(product);
        if (cost != null) pr.setCost(new BigDecimal(cost));
        if (minPrice != null) pr.setMinPrice(new BigDecimal(minPrice));
        return pr;
    }

    private PosCheckoutRequest.PosCheckoutItem p0Line(String code, double price, Double taxRate) {
        PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
        item.setItemCode(code);
        item.setItemName(code);
        item.setQuantity(1);
        item.setPrice(price);
        item.setTaxRate(taxRate);
        return item;
    }

    /** A cash checkout of the given lines on {@link #P0_BRANCH}, with price approval on or off. */
    private PosCheckoutRequest p0Request(boolean approvalRequired, double total,
                                         PosCheckoutRequest.PosCheckoutItem... lines) {
        PosSettings settings = new PosSettings();
        settings.setRequirePriceOverrideApproval(approvalRequired);
        when(posSettingsService.getForBranch(P0_BRANCH)).thenReturn(settings);
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setBranchId(P0_BRANCH);
        req.setPaymentMode("Cash");
        req.setAmountTendered(total);
        req.setItems(List.of(lines));
        return req;
    }

    /** Runs the checkout and returns the invoice handed to save() — what buildInvoice built. */
    private SalesInvoice p0Checkout(PosCheckoutRequest req, long invoiceId, String total) {
        SalesInvoice draft = draftInvoice(invoiceId, "INV-P0-" + invoiceId, total);
        when(invoiceService.save(any())).thenReturn(draft);
        when(invoiceService.getById(invoiceId)).thenReturn(draft);
        controller.checkout(req);
        ArgumentCaptor<SalesInvoice> built = ArgumentCaptor.forClass(SalesInvoice.class);
        verify(invoiceService).save(built.capture());
        return built.getValue();
    }

    /** Swaps the mocked tax resolver for the REAL one over mocked repositories, so the
     *  product-tax precedence (and zero-rating) is exercised rather than stubbed. */
    private com.billbull.backend.inventory.product.ProductTaxRepository realTaxResolver(
            Double branchDefaultVatRate, Boolean taxEnabled) {
        var productTaxRepo = mock(com.billbull.backend.inventory.product.ProductTaxRepository.class);
        var configService = mock(com.billbull.backend.settings.branch.BranchTaxConfigurationService.class);
        var config = new com.billbull.backend.settings.branch.BranchTaxConfiguration();
        config.setBranchDefaultVatRate(branchDefaultVatRate);
        config.setTaxEnabled(taxEnabled);
        when(configService.getForBranch(P0_BRANCH)).thenReturn(config);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "branchTaxResolutionService",
                new com.billbull.backend.common.tax.BranchTaxResolutionService(productTaxRepo, configService));
        return productTaxRepo;
    }

    private static java.util.Optional<com.billbull.backend.inventory.product.ProductTax> salesTax(
            Product product, String rate) {
        var tax = new com.billbull.backend.inventory.product.ProductTax();
        tax.setProduct(product);
        tax.setSalesTax(rate != null ? new BigDecimal(rate) : null);
        return java.util.Optional.of(tax);
    }

    @Test
    void approvalOffStillLoadsProductsAndPricingInOneBatchEach() {
        Product stock = p0Product(1001L, "STK-1", com.billbull.backend.inventory.product.ProductType.STOCK);
        Product svc = p0Product(1002L, "SVC-1", com.billbull.backend.inventory.product.ProductType.SERVICE);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock, svc));
        when(pricingRepository.findByProductIdIn(any()))
                .thenReturn(List.of(p0Pricing(stock, "40.00", null), p0Pricing(svc, "15.00", null)));

        p0Checkout(p0Request(false, 150.0,
                p0Line("STK-1", 100.0, 5.0), p0Line("STK-1", 100.0, 5.0), p0Line("SVC-1", 50.0, 5.0)),
                3001L, "150.00");

        ArgumentCaptor<List<String>> codes = ArgumentCaptor.forClass(List.class);
        verify(productRepository, times(1)).findByCodeIn(codes.capture());
        assertEquals(List.of("STK-1", "SVC-1"), codes.getValue()); // distinct codes, one query
        verify(pricingRepository, times(1)).findByProductIdIn(any());
        verify(pricingRepository, never()).findByProductId(any()); // no per-product N+1
    }

    @Test
    void approvalOffSaleBelowMinimumCompletesWithoutConsultingTheGate() {
        Product stock = p0Product(1011L, "STK-2", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock));
        when(pricingRepository.findByProductIdIn(any())).thenReturn(List.of(p0Pricing(stock, "40.00", "190.00")));

        SalesInvoice built = p0Checkout(p0Request(false, 180.0, p0Line("STK-2", 180.0, 5.0)), 3002L, "180.00");

        assertEquals(1, built.getItems().size());
        verify(invoiceService).updateStatus(3002L, SalesInvoiceStatus.PAID);
        verify(permissionService, never()).currentUserCanEdit(any());
        verify(posSettingsService, never()).verifyPin(any());
    }

    @Test
    void approvalOnStillRefusesBelowMinimumFromTheSameBatchLookup() {
        Product stock = p0Product(1021L, "STK-3", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock));
        when(pricingRepository.findByProductIdIn(any())).thenReturn(List.of(p0Pricing(stock, "40.00", "190.00")));
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);

        PosCheckoutRequest req = p0Request(true, 180.0, p0Line("STK-3", 180.0, 5.0));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        assertTrue(ex.getReason().contains("Price below minimum (190.00) for STK-3"));
        verify(invoiceService, never()).save(any());
    }

    @Test
    void approvalOnFallsBackToCostAsTheFloorAndAcceptsAVerifiedPin() {
        // minPrice unset → cost is the floor (unchanged semantics); a valid PIN releases it.
        Product stock = p0Product(1031L, "STK-4", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock));
        when(pricingRepository.findByProductIdIn(any())).thenReturn(List.of(p0Pricing(stock, "50.00", null)));
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        when(posSettingsService.verifyPin("1234")).thenReturn(true);
        PosCheckoutRequest req = p0Request(true, 45.0, p0Line("STK-4", 45.0, 5.0));
        req.setSupervisorOverridePin("1234");

        p0Checkout(req, 3003L, "45.00");

        verify(posSettingsService, times(1)).verifyPin("1234");
        verify(invoiceService).updateStatus(3003L, SalesInvoiceStatus.PAID);
    }

    @Test
    void absentTaxRateUsesTheProductRateKeepingZeroRatedItemsAtZeroWithApprovalOff() {
        var productTaxRepo = realTaxResolver(5.0, true);
        Product zeroRated = p0Product(1041L, "ZR-1", com.billbull.backend.inventory.product.ProductType.STOCK);
        Product unset = p0Product(1042L, "STD-1", com.billbull.backend.inventory.product.ProductType.STOCK);
        Product reduced = p0Product(1043L, "RED-1", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(zeroRated, unset, reduced));
        when(productTaxRepo.findByProductId(1041L)).thenReturn(salesTax(zeroRated, "0"));
        when(productTaxRepo.findByProductId(1042L)).thenReturn(salesTax(unset, null));
        when(productTaxRepo.findByProductId(1043L)).thenReturn(salesTax(reduced, "2.5"));

        SalesInvoice built = p0Checkout(p0Request(false, 400.0,
                p0Line("ZR-1", 100.0, null),
                p0Line("ZR-1", 100.0, null),   // same product again: resolved once
                p0Line("STD-1", 100.0, null),
                p0Line("RED-1", 50.0, null),
                p0Line("UNKNOWN", 50.0, null), // no product → branch default
                p0Line("STD-1", 100.0, 12.0)), // a client-sent rate is used as sent
                3004L, "400.00");

        List<Double> rates = built.getItems().stream()
                .map(com.billbull.backend.sales.invoice.SalesInvoiceItem::getTaxRate).toList();
        assertEquals(List.of(0.0, 0.0, 5.0, 2.5, 5.0, 12.0), rates);
        verify(productTaxRepo, times(1)).findByProductId(1041L);
    }

    @Test
    void absentTaxRateResolvesTheSameWithApprovalOn() {
        var productTaxRepo = realTaxResolver(5.0, true);
        Product zeroRated = p0Product(1051L, "ZR-2", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(zeroRated));
        when(productTaxRepo.findByProductId(1051L)).thenReturn(salesTax(zeroRated, "0"));

        SalesInvoice built = p0Checkout(p0Request(true, 100.0, p0Line("ZR-2", 100.0, null)), 3005L, "100.00");

        assertEquals(0.0, built.getItems().get(0).getTaxRate());
    }

    @Test
    void absentTaxRateIsZeroWhenTheBranchHasTaxDisabled() {
        var productTaxRepo = realTaxResolver(5.0, false);
        Product unset = p0Product(1061L, "STD-2", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(unset));
        when(productTaxRepo.findByProductId(1061L)).thenReturn(salesTax(unset, null));

        SalesInvoice built = p0Checkout(p0Request(false, 100.0, p0Line("STD-2", 100.0, null)), 3006L, "100.00");

        assertEquals(0.0, built.getItems().get(0).getTaxRate());
    }

    @Test
    void aBranchOwnedProductWinsOverTheGlobalRowWithTheSameCode() {
        var productTaxRepo = realTaxResolver(5.0, true);
        Product global = p0Product(1071L, "DUP-CODE", com.billbull.backend.inventory.product.ProductType.STOCK);
        Product branchOwned = p0Product(1072L, "DUP-CODE", com.billbull.backend.inventory.product.ProductType.STOCK);
        com.billbull.backend.settings.branch.Branch branch = new com.billbull.backend.settings.branch.Branch();
        branch.setId(P0_BRANCH);
        branchOwned.setBranch(branch);
        Product inactive = p0Product(1073L, "DUP-CODE", com.billbull.backend.inventory.product.ProductType.STOCK);
        inactive.setBranch(branch);
        inactive.setActive(false);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(global, inactive, branchOwned));
        when(productTaxRepo.findByProductId(1072L)).thenReturn(salesTax(branchOwned, "0"));

        SalesInvoice built = p0Checkout(p0Request(false, 100.0, p0Line("DUP-CODE", 100.0, null)), 3007L, "100.00");

        assertEquals(0.0, built.getItems().get(0).getTaxRate());
        verify(productTaxRepo, never()).findByProductId(1071L);
        verify(productTaxRepo, never()).findByProductId(1073L);
    }

    @Test
    void missingPricingIsSafeWithApprovalOn() {
        Product stock = p0Product(1081L, "NOPRICE", com.billbull.backend.inventory.product.ProductType.STOCK);
        Product svc = p0Product(1082L, "SVC-NOPRICE", com.billbull.backend.inventory.product.ProductType.SERVICE);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock, svc));
        when(pricingRepository.findByProductIdIn(any())).thenReturn(List.of());

        SalesInvoice built = p0Checkout(p0Request(true, 30.0,
                p0Line("NOPRICE", 10.0, 5.0), p0Line("SVC-NOPRICE", 20.0, 5.0)), 3008L, "30.00");

        // No floor to check against and no cost to record: the sale goes through.
        built.getItems().forEach(line -> assertEquals(null, line.getCost()));
        verify(permissionService, never()).currentUserCanEdit(any());
        verify(invoiceService).updateStatus(3008L, SalesInvoiceStatus.PAID);
    }

    @Test
    void inventoryLinesAreLeftForDeliveryCostingAndServiceLinesTakeTheirCostWhateverTheSetting() {
        for (boolean approval : new boolean[] { false, true }) {
            org.mockito.Mockito.reset(invoiceService, productRepository, pricingRepository);
            Product stock = p0Product(1091L, "STK-9", com.billbull.backend.inventory.product.ProductType.STOCK);
            Product svc = p0Product(1092L, "SVC-9", com.billbull.backend.inventory.product.ProductType.SERVICE);
            when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock, svc));
            when(pricingRepository.findByProductIdIn(any()))
                    .thenReturn(List.of(p0Pricing(stock, "40.00", null), p0Pricing(svc, "15.00", null)));

            SalesInvoice built = p0Checkout(p0Request(approval, 250.0,
                    p0Line("STK-9", 100.0, 5.0),
                    p0Line("STK-9", 100.0, 5.0),  // the same product on a second line (one unit per line)
                    p0Line("SVC-9", 50.0, 5.0)), 3010L, "250.00");

            var lines = built.getItems();
            // Inventory: costed at delivery with the warehouse WAC, on EVERY line — no master-cost
            // snapshot here that would pre-empt it (and leave a repeated product half-costed).
            assertEquals(null, lines.get(0).getCost(), "stock line 1, approval=" + approval);
            assertEquals(null, lines.get(1).getCost(), "stock line 2, approval=" + approval);
            // Service: never delivered, so its configured cost is recorded now.
            assertEquals(new BigDecimal("15.00"), lines.get(2).getCost(), "service line, approval=" + approval);
        }
    }

    @Test
    void voidedLinesDoNotTriggerLookupsForTheirCodes() {
        Product stock = p0Product(1101L, "LIVE", com.billbull.backend.inventory.product.ProductType.STOCK);
        when(productRepository.findByCodeIn(any())).thenReturn(List.of(stock));
        when(pricingRepository.findByProductIdIn(any())).thenReturn(List.of(p0Pricing(stock, "5.00", null)));
        PosCheckoutRequest.PosCheckoutItem voided = p0Line("VOIDED", 10.0, 5.0);
        voided.setVoided(true);

        p0Checkout(p0Request(false, 10.0, p0Line("LIVE", 10.0, 5.0), voided), 3011L, "10.00");

        ArgumentCaptor<List<String>> codes = ArgumentCaptor.forClass(List.class);
        verify(productRepository).findByCodeIn(codes.capture());
        assertEquals(List.of("LIVE"), codes.getValue());
    }

    // ── Pricing Phase 2: a customer's negotiated price is an authorised selling price ──────

    private com.billbull.backend.sales.pricing.PricingResolutionService negotiatedPriceResolver(String price) {
        var resolver = mock(com.billbull.backend.sales.pricing.PricingResolutionService.class);
        var level = new com.billbull.backend.sales.pricing.PricingModels.ResolvedLevel(1L, "RETAIL", "Retail", true,
                com.billbull.backend.sales.pricing.PriceLevelSource.DEFAULT, null);
        var line = new com.billbull.backend.sales.pricing.PricingModels.LinePrice(900L, "10672", null,
                new BigDecimal(price), new BigDecimal("200.00"),
                com.billbull.backend.sales.pricing.PriceSource.CUSTOMER_SPECIFIC, 1L, "Retail", false,
                new BigDecimal("200.00"), com.billbull.backend.sales.pricing.PriceSource.BASE_PRICE,
                77L, null, LocalDate.now().minusDays(1), null);
        when(resolver.resolve(any(), any())).thenReturn(
                new com.billbull.backend.sales.pricing.PricingModels.Resolution(level, 1L, List.of(line)));
        controller.setPricingResolutionService(resolver);
        return resolver;
    }

    @Test
    void belowMinimumButAtTheCustomersNegotiatedPriceNeedsNoSupervisor() {
        com.billbull.backend.security.BranchContextHolder.set(
                new com.billbull.backend.security.BranchContextHolder.BranchContext(1L, java.util.Set.of(1L), false));
        try {
            SalesInvoice draft = draftInvoice(70L, "INV-2026-0070", "180.00");
            when(invoiceService.save(any())).thenReturn(draft);
            when(invoiceService.getById(70L)).thenReturn(draft);
            stubBelowMinimumPricedProduct("10672", 900L, "190.00");
            when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
            var resolver = negotiatedPriceResolver("180.00");
            PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
            req.setCustomerCode("ABC");

            controller.checkout(req);

            verify(invoiceService).updateStatus(70L, SalesInvoiceStatus.PAID);
            verify(posSettingsService, never()).verifyPin(any());
            ArgumentCaptor<com.billbull.backend.sales.pricing.PricingModels.Context> ctx =
                    ArgumentCaptor.forClass(com.billbull.backend.sales.pricing.PricingModels.Context.class);
            verify(resolver).resolve(ctx.capture(), any());
            // Priced on the trusted branch for the sale's customer — never on a client price source.
            assertEquals(1L, ctx.getValue().branchId());
            assertEquals("ABC", ctx.getValue().customerCode());
        } finally {
            com.billbull.backend.security.BranchContextHolder.clear();
        }
    }

    @Test
    void sellingBelowTheNegotiatedPriceAndTheMinimumStillNeedsASupervisor() {
        com.billbull.backend.security.BranchContextHolder.set(
                new com.billbull.backend.security.BranchContextHolder.BranchContext(1L, java.util.Set.of(1L), false));
        try {
            stubBelowMinimumPricedProduct("10672", 900L, "190.00");
            when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
            negotiatedPriceResolver("180.00");
            PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 170.0);
            req.setCustomerCode("ABC");

            assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
            verify(invoiceService, never()).save(any());
        } finally {
            com.billbull.backend.security.BranchContextHolder.clear();
        }
    }

    @Test
    void walkInSaleBelowMinimumDoesNotConsultCustomerPrices() {
        stubBelowMinimumPricedProduct("10672", 900L, "190.00");
        when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
        var resolver = negotiatedPriceResolver("180.00");
        PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);

        assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
        verify(resolver, never()).resolve(any(), any());
    }

    // ── Pricing Phase 3: bill discounts and quantity tiers never bypass the approval rule ──

    @Test
    void billDiscountTakingANegotiatedLineBelowItsAgreedPriceNeedsASupervisor() {
        com.billbull.backend.security.BranchContextHolder.set(
                new com.billbull.backend.security.BranchContextHolder.BranchContext(1L, java.util.Set.of(1L), false));
        try {
            stubBelowMinimumPricedProduct("10672", 900L, "190.00");
            when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
            negotiatedPriceResolver("180.00");
            PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
            req.setCustomerCode("ABC");
            req.setBillDiscountAmount(10.0);

            assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
            verify(invoiceService, never()).save(any());
        } finally {
            com.billbull.backend.security.BranchContextHolder.clear();
        }
    }

    @Test
    void billDiscountThatKeepsTheLineAtTheNegotiatedPriceNeedsNoSupervisor() {
        com.billbull.backend.security.BranchContextHolder.set(
                new com.billbull.backend.security.BranchContextHolder.BranchContext(1L, java.util.Set.of(1L), false));
        try {
            SalesInvoice draft = draftInvoice(71L, "INV-2026-0071", "180.00");
            when(invoiceService.save(any())).thenReturn(draft);
            when(invoiceService.getById(71L)).thenReturn(draft);
            stubBelowMinimumPricedProduct("10672", 900L, "190.00");
            when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
            negotiatedPriceResolver("180.00");
            PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 185.0);
            req.setCustomerCode("ABC");
            req.setBillDiscountAmount(5.0);

            controller.checkout(req);

            verify(posSettingsService, never()).verifyPin(any());
            verify(invoiceService).updateStatus(71L, SalesInvoiceStatus.PAID);
        } finally {
            com.billbull.backend.security.BranchContextHolder.clear();
        }
    }

    @Test
    void quantityTierPriceBelowTheMinimumIsNotExemptFromApproval() {
        com.billbull.backend.security.BranchContextHolder.set(
                new com.billbull.backend.security.BranchContextHolder.BranchContext(1L, java.util.Set.of(1L), false));
        try {
            stubBelowMinimumPricedProduct("10672", 900L, "190.00");
            when(permissionService.currentUserCanEdit("pos_price_override")).thenReturn(false);
            var resolver = mock(com.billbull.backend.sales.pricing.PricingResolutionService.class);
            var level = new com.billbull.backend.sales.pricing.PricingModels.ResolvedLevel(2L, "WHOLESALE", "Wholesale",
                    false, com.billbull.backend.sales.pricing.PriceLevelSource.CUSTOMER, null);
            var tierLine = new com.billbull.backend.sales.pricing.PricingModels.LinePrice(900L, "10672", null,
                    new BigDecimal("180.00"), new BigDecimal("200.00"),
                    com.billbull.backend.sales.pricing.PriceSource.QUANTITY_TIER, 2L, "Wholesale", false);
            when(resolver.resolve(any(), any())).thenReturn(
                    new com.billbull.backend.sales.pricing.PricingModels.Resolution(level, 1L, List.of(tierLine)));
            controller.setPricingResolutionService(resolver);
            PosCheckoutRequest req = belowMinimumCheckoutRequest("10672", 180.0);
            req.setCustomerCode("TRADER");

            assertThrows(ResponseStatusException.class, () -> controller.checkout(req));
            verify(invoiceService, never()).save(any());
        } finally {
            com.billbull.backend.security.BranchContextHolder.clear();
        }
    }

    @Test
    void billDiscountShareIsApportionedLikeTheInvoiceAllocator() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        PosCheckoutRequest.PosCheckoutItem one = p0Line("A", 100.0, 1.0);
        one.setQuantity(1);
        PosCheckoutRequest.PosCheckoutItem two = p0Line("B", 300.0, 1.0);
        two.setQuantity(1);
        PosCheckoutRequest.PosCheckoutItem voided = p0Line("C", 500.0, 1.0);
        voided.setVoided(true);
        req.setItems(List.of(one, two, voided));
        req.setBillDiscountAmount(40.0);

        var ratios = controller.billDiscountShareRatios(req);

        assertEquals(0, new BigDecimal("0.1").compareTo(ratios.get(0)));
        assertEquals(0, new BigDecimal("0.1").compareTo(ratios.get(1)));
        assertEquals(null, ratios.get(2));
        req.setBillDiscountAmount(null);
        assertEquals(java.util.Map.of(), controller.billDiscountShareRatios(req));
    }
}
