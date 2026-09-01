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

    @InjectMocks private PosCheckoutController controller;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        lenient().when(branchTaxResolutionService.resolveSalesTaxRateForProduct(any(), any()))
                .thenReturn(BigDecimal.ZERO);
        // PosDeliverySettlementService is a real collaborator built from these SAME mocks —
        // @InjectMocks can't auto-construct a nested bean for the controller's constructor,
        // so it's wired here and injected post-construction. See that class's javadoc for
        // why the whole settleDelivery() critical section had to move out of this
        // (non-transactional) controller into one atomic transactional method.
        PosDeliverySettlementService deliverySettlementService = new PosDeliverySettlementService(
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
        pricing.setMinPrice(new BigDecimal(minPrice));
        lenient().when(productRepository.findByCodeIn(any())).thenReturn(List.of(product));
        lenient().when(pricingRepository.findByProductId(productId)).thenReturn(java.util.Optional.of(pricing));
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
}
