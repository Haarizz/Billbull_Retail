package com.billbull.backend.pos.checkout;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.inventory.product.ProductPricing;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductService;
import com.billbull.backend.inventory.serial.SerialMaster;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.inventory.serial.SerialStatus;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.receipt.ZatcaQrGenerator;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.payment.Payment;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * POS-specific checkout endpoint. Accepts the cart + payment details in one call,
 * creates the SalesInvoice (salesType=POS_SALE) and records the payment atomically.
 */
@RestController
@RequestMapping("/api/pos/checkout")
@CrossOrigin
public class PosCheckoutController {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(PosCheckoutController.class);


    private final SalesInvoiceService invoiceService;
    /** Draws down store credit for VOUCHER tender legs; see {@link #redeemVoucherAllocation}. */
    private final com.billbull.backend.sales.voucher.CreditVoucherService creditVoucherService;
    private final PosSessionService sessionService;
    private final com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate;
    private final com.billbull.backend.pos.businessdate.BusinessDayContinuationGate businessDayContinuationGate;
    private final com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate;
    private final SalesInvoiceRepository invoiceRepository;
    private final CustomerRepository customerRepository;
    private final PosAuditService auditService;
    private final BranchRepository branchRepository;
    private final SerialMasterRepository serialMasterRepository;
    private final ProductRepository productRepository;
    private final ProductPricingRepository pricingRepository;
    private final RolePermissionService permissionService;
    private final com.billbull.backend.security.ModulePermissionService modulePermissionService;

    /** Single-switch RBAC row (canView == "granted"), same shape as permissions.pos.cashmovement.*. */
    static final String RECEIPT_REPRINT_PERMISSION = "permissions.pos.receipt.reprint";
    private final PosSettingsService posSettingsService;
    private final ProductService productService;
    private final EmployeeRepository employeeRepository;
    private final PaymentRepository paymentRepository;
    private final com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    private final com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService;
    private final PosPaymentAllocationResolver allocationResolver;
    /** The one Business Day clock. Used for POS *timestamps* (serial soldAt, line-void
     *  time, QR fallback). POS *business dates* do NOT come from here — see
     *  {@link #posBusinessDate(Long)}. */
    private final com.billbull.backend.pos.businessdate.BusinessDayClock businessDayClock;

    public PosCheckoutController(SalesInvoiceService invoiceService, PosSessionService sessionService,
                                  SalesInvoiceRepository invoiceRepository, CustomerRepository customerRepository,
                                  PosAuditService auditService, BranchRepository branchRepository,
                                  SerialMasterRepository serialMasterRepository,
                                  ProductRepository productRepository,
                                  ProductPricingRepository pricingRepository,
                                  RolePermissionService permissionService,
                                  PosSettingsService posSettingsService,
                                  ProductService productService,
                                  EmployeeRepository employeeRepository,
                                  PaymentRepository paymentRepository,
                                  com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService,
                                  com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate,
                                  com.billbull.backend.pos.businessdate.BusinessDayContinuationGate businessDayContinuationGate,
                                  com.billbull.backend.common.tax.BranchTaxResolutionService branchTaxResolutionService,
                                  PosPaymentAllocationResolver allocationResolver,
                                  com.billbull.backend.pos.businessdate.BusinessDayClock businessDayClock,
                                  com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate,
                                  com.billbull.backend.security.ModulePermissionService modulePermissionService,
                                  com.billbull.backend.sales.voucher.CreditVoucherService creditVoucherService) {
        this.creditVoucherService = creditVoucherService;
        this.modulePermissionService = modulePermissionService;
        this.closureWorkflowGate = closureWorkflowGate;
        this.invoiceService = invoiceService;
        this.sessionService = sessionService;
        this.invoiceRepository = invoiceRepository;
        this.customerRepository = customerRepository;
        this.auditService = auditService;
        this.branchRepository = branchRepository;
        this.serialMasterRepository = serialMasterRepository;
        this.productRepository = productRepository;
        this.pricingRepository = pricingRepository;
        this.permissionService = permissionService;
        this.posSettingsService = posSettingsService;
        this.productService = productService;
        this.employeeRepository = employeeRepository;
        this.paymentRepository = paymentRepository;
        this.terminalActivityService = terminalActivityService;
        this.branchTaxResolutionService = branchTaxResolutionService;
        this.allocationResolver = allocationResolver;
        this.businessDayCheckoutGate = businessDayCheckoutGate;
        this.businessDayContinuationGate = businessDayContinuationGate;
        this.businessDayClock = businessDayClock;
    }

    /**
     * The business date a POS document belongs to.
     *
     * <p>Deliberately the session's {@code tradingDate}, not the calendar date and not
     * {@code businessDayClock.now().toLocalDate()}. Under an overnight Business Day
     * (e.g. Aug 10 09:00 → Aug 11 02:00) a sale rung at Aug 11 01:00 has calendar date
     * Aug 11 but Trading Date Aug 10, and it must be invoiced — and its payment dated —
     * into Aug 10 or the Z-Report and the GL disagree with the sales ledger.
     *
     * <p>Fallbacks, in order: {@code tradingDate} (authoritative), {@code sessionDate}
     * (the legacy accounting bucket, for sessions predating tradingDate), then the
     * Business Day clock's date for checkouts with no session at all (delivery
     * settlement from the back office). Never {@code LocalDate.now()}.
     */
    private LocalDate posBusinessDate(Long sessionId) {
        if (sessionId != null) {
            try {
                var session = sessionService.getById(sessionId);
                if (session != null) {
                    if (session.getTradingDate() != null) return session.getTradingDate();
                    if (session.getSessionDate() != null) return session.getSessionDate();
                }
            } catch (RuntimeException ignored) {
                // Session missing/unreadable — fall through to the clock rather than fail
                // a checkout over a date lookup.
            }
        }
        return businessDayClock.now().toLocalDate();
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> checkout(@RequestBody PosCheckoutRequest request) {
        // Idempotency guard: if the frontend sends the same checkoutKey twice (network retry),
        // return the already-completed invoice instead of creating a duplicate.
        // Deliberately BEFORE the Business Day gate below: a sale that already
        // completed must stay retrievable by its key even after the Business Day has
        // closed, or a network retry at 23:01 would look like a failed sale and
        // tempt the cashier into ringing it a second time.
        if (request.getCheckoutKey() != null && !request.getCheckoutKey().isBlank()) {
            var existing = invoiceRepository.findByPosCheckoutKey(request.getCheckoutKey().trim());
            if (existing.isPresent()) {
                return ResponseEntity.ok(invoiceService.getById(existing.get().getId()));
            }
        }

        // Previous-Business-Day continuation gate. Deliberately BEFORE — and outside —
        // the supervisor-authorized exception below: the one-sale supervisor
        // authorization releases a sale on a *closed current* Business Day, it may never
        // be spent to keep trading on a session that belongs to an *earlier* Business
        // Day whose Day Close is still outstanding. Propagates as the same 409
        // PREVIOUS_DAY_SESSION_OPEN the POS already renders.
        // Close-workflow gate — same placement rationale, and equally outside the
        // supervisor-authorized exception: that authorization releases one sale against a
        // closed Business Day, it is not a licence to add sales to a session an operator
        // has already started closing. Kept separate from the Business Day gate above so
        // the two conditions report their own distinct 409s. The authoritative re-check
        // happens inside the transaction, in recordInvoiceOnSession.
        if (request.getSessionId() != null) {
            var checkoutSession = sessionService.getById(request.getSessionId());
            businessDayContinuationGate.assertMayContinue(checkoutSession);
            closureWorkflowGate.assertMayOperate(checkoutSession);
        }

        // Business Day closure gate — the control that actually stops selling once
        // the extension has expired. Runs before any invoice row is created so a
        // refused checkout leaves nothing behind.
        //
        // The single exception is the per-transaction supervisor authorization this
        // request already carries for price overrides — reused here rather than
        // inventing a second authorization path, and deliberately NOT a time-based
        // grace: it releases exactly this sale, is credential-verified, and grants
        // nothing to the next one.
        try {
            businessDayCheckoutGate.assertCheckoutAllowed(request.getBranchId());
        } catch (com.billbull.backend.pos.businessdate.BusinessDayClosedException ex) {
            if (!verifySupervisorPriceOverride(request)) {
                return ResponseEntity.status(HttpStatus.LOCKED)
                        .body(ex.getResponse().asPendingCheckoutRefusal());
            }
            // Authorized. Audited synchronously and unconditionally: a sale rung up
            // after the Business Day closed must never be indistinguishable from one
            // rung up during it.
            auditService.logBusinessDayClosedCheckoutAuthorized(
                    request.getBranchId(), request.getSessionId(), request.getTerminalId(),
                    String.valueOf(ex.getResponse().getTradingDate()),
                    String.valueOf(ex.getResponse().getClosedAt()));
        }

        // Structural validation of the payment (allocation list or legacy multi-card split)
        // fails fast, before any invoice row is created — a malformed payment must never leave
        // a stranded DRAFT invoice behind.
        allocationResolver.validateStructure(request);

        SalesInvoice invoice = buildInvoice(request);

        // Step 1: save builds the invoice (number, totals, items) as DRAFT.
        // amountPaid is zero at this point — status/side-effects are deferred.
        // save() also defaults the branch warehouse onto every stock line that
        // arrived without one, so the auto-DN posting in Step 2 has a location.
        SalesInvoice saved = invoiceService.save(invoice);

        double invoiceTotal = saved.getInvoiceTotal() != null ? saved.getInvoiceTotal().doubleValue() : 0.0;

        // Normalise the payment into an ordered allocation list. Whether the client sent the new
        // progressive-payment `paymentAllocations` array or the legacy scalars/cardLegs, the rest
        // of this method sees exactly one shape.
        PosPaymentPlan plan;
        try {
            plan = allocationResolver.resolve(request, invoiceTotal);
        } catch (RuntimeException ex) {
            deleteQuietly(saved.getId());
            log.warn("POS settlement rejected invoice={} reason=invalid-allocations: {}",
                    saved.getInvoiceNumber(), ex.getMessage());
            throw ex;
        }
        double paymentAmount = plan.getSettledAmount();
        boolean isCreditCheckout = allocationResolver.isCreditCheckout(request);

        // Explicit multi-card split on a non-credit checkout must fully settle the invoice —
        // there's no "change" concept for card tenders the way there is for cash overpayment,
        // so unlike the legacy cash/card scalars (which silently cap at invoiceTotal), a
        // mismatched card-leg total is rejected rather than silently truncated.
        if (plan.isUsesCardLegs() && !isCreditCheckout && invoiceTotal > 0
                && Math.abs(plan.getTenderTotal() - invoiceTotal) > ROUNDING_TOLERANCE) {
            deleteQuietly(saved.getId());
            log.warn("POS settlement rejected invoice={} reason=card-legs-do-not-total tender={} total={}",
                    saved.getInvoiceNumber(), String.format("%.2f", plan.getTenderTotal()),
                    String.format("%.2f", invoiceTotal));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.format(
                    "Total of all payment legs (%.2f) must equal the invoice total (%.2f).",
                    plan.getTenderTotal(), invoiceTotal));
        }

        // Step 2: transition status while the invoice is still DRAFT so that
        // doUpdateStatus() fires: FEFO/batch reservation, auto-DN generation,
        // stock deduction, and the GL invoice-posting journal all happen here.
        // save() runs in its own committed transaction, so if posting throws
        // (e.g. the branch truly has no resolvable warehouse, or a batch shortfall)
        // the DRAFT invoice would otherwise be left stranded with Paid=0. Roll the
        // DRAFT back ourselves and surface the real cause to the cashier instead.
        SalesInvoiceStatus intendedStatus =
                (paymentAmount >= invoiceTotal - 0.001 && invoiceTotal > 0) ? SalesInvoiceStatus.PAID
              : (paymentAmount > 0)                                           ? SalesInvoiceStatus.PARTIALLY_PAID
              :                                                                  SalesInvoiceStatus.CONFIRMED;
        try {
            invoiceService.updateStatus(saved.getId(), intendedStatus);
        } catch (RuntimeException ex) {
            deleteQuietly(saved.getId());
            throw ex;
        }

        // Step 3: record payment — creates Payment row(s) + Receipt Voucher(s) + GL, one of
        // each per payment leg. Every checkout is treated as a collection of legs (Cash,
        // 0..N card legs, Online) that all flow through the same recordPayment() pipeline —
        // Cash+Card Mixed and an N-way card split are the same mechanism, just a different
        // leg count. Legs sharing this checkout get a common splitGroupId so they can be
        // traced back to one logical transaction; a single-leg checkout gets none (unchanged
        // from prior behavior).
        if (paymentAmount > 0) {
            int legCount = plan.getLegCount();
            String splitGroupId = legCount > 1 ? java.util.UUID.randomUUID().toString() : null;
            // Each recordPayment call re-stamps invoice.paymentMode, so every leg must carry
            // the same combined label (e.g. "Cash + Visa + Mastercard") — otherwise the last
            // call silently overwrites the invoice's displayed mode with just its own leg.
            String combinedMode = plan.getCombinedPaymentMode();

            for (ResolvedPaymentAllocation allocation : plan.getAllocations()) {
                if (allocation.getAmount() <= 0.001) continue; // cash trimmed to zero by the balance cap

                // A VOUCHER leg must draw the store credit down before it is recorded as settling
                // the invoice. Doing it first means an invalid, expired or already-spent voucher
                // fails the checkout rather than producing a Payment row backed by nothing.
                if (allocation.getType() == PosPaymentAllocationType.VOUCHER) {
                    redeemVoucherAllocation(saved, allocation, request);
                }

                if (allocation.isReceipt()) {
                    invoiceService.recordPayment(saved.getId(), allocation.getAmount(),
                            allocation.getModeLabel(), allocation.getReference(), saved.getInvoiceDate(),
                            allocation.getBankAccountName(), null, splitGroupId, combinedMode);
                }
                // CREDIT allocations intentionally record nothing: the amount stays outstanding
                // on the customer's A/R ledger, which the invoice balance already represents.
            }

            logSettlement(saved.getInvoiceNumber(), plan, invoiceTotal, splitGroupId);
        }

        // Update session totals
        if (request.getSessionId() != null) {
            // Pass the plan so the session's tender counters are split by what each allocation
            // actually took, rather than re-derived from the invoice's combined mode label.
            sessionService.recordInvoiceOnSession(request.getSessionId(), saved, plan);
        }

        // Mark serial numbers as SOLD for serialized-product line items
        if (saved.getItems() != null) {
            for (SalesInvoiceItem soldItem : saved.getItems()) {
                if (soldItem.getSerialNumber() != null && !soldItem.getSerialNumber().isBlank()
                        && !Boolean.TRUE.equals(soldItem.getVoided())) {
                    serialMasterRepository.findBySerialNumberForUpdate(soldItem.getSerialNumber())
                            .ifPresent(sm -> {
                                sm.setStatus(SerialStatus.SOLD);
                                sm.setSoldInvoiceId(saved.getId());
                                sm.setSoldInvoiceNumber(saved.getInvoiceNumber());
                                sm.setSoldAt(businessDayClock.now());
                                serialMasterRepository.save(sm);
                            });
                }
            }
        }

        // §4.1 Receipt archival: generate ZATCA QR at checkout time and store on the invoice.
        // CRITICAL: persist via a single-column UPDATE (invoiceService.archiveReceiptQr →
        // repo.updatePosReceiptQr), NOT invoiceRepository.save(saved). `saved` is the
        // detached DRAFT snapshot built in Step 1 (amountPaid=null, status=DRAFT,
        // deliveryStatus=PENDING). Steps 2 & 3 already committed PAID/posted state and the
        // auto-DN/stock/GL in their own transactions; merging the stale entity back here
        // would revert all of that — the exact "invoice stays DRAFT, Paid=0 after a
        // successful payment" defect. A targeted UPDATE touches only posReceiptQr.
        try {
            String sellerName = saved.getBranchName();
            String trn = null;
            if (saved.getBranchId() != null) {
                var branch = branchRepository.findById(saved.getBranchId()).orElse(null);
                if (branch != null) {
                    if (sellerName == null || sellerName.isBlank()) sellerName = branch.getName();
                    trn = branch.getTrnNumber();
                }
            }
            BigDecimal totalWithVat = saved.getInvoiceTotal() != null ? saved.getInvoiceTotal() : BigDecimal.ZERO;
            BigDecimal vatTotal = saved.getTaxTotal() != null ? saved.getTaxTotal() : BigDecimal.ZERO;
            LocalDateTime invoiceAt = saved.getInvoiceDate() != null
                    ? saved.getInvoiceDate().atStartOfDay() : businessDayClock.now();
            String qr = ZatcaQrGenerator.generate(sellerName, trn, invoiceAt, totalWithVat, vatTotal);
            invoiceService.archiveReceiptQr(saved.getId(), qr);
        } catch (Exception e) {
            // Non-blocking — QR archival failure must not roll back the checkout.
        }

        // Update sales stats (last_sold_at + total_quantity_sold) for each non-voided line
        if (request.getItems() != null && !request.getItems().isEmpty()) {
            try {
                java.util.Map<String, Integer> codeToQty = new java.util.LinkedHashMap<>();
                for (PosCheckoutRequest.PosCheckoutItem item : request.getItems()) {
                    if (Boolean.TRUE.equals(item.getVoided())) continue;
                    String code = item.getItemCode();
                    if (code == null || code.isBlank()) continue;
                    int qty = item.getQuantity() != null ? item.getQuantity() : 1;
                    codeToQty.merge(code, qty, Integer::sum);
                }
                productService.recordSaleStats(codeToQty);
            } catch (Exception ignored) {
                // Non-blocking — stats update must never roll back the checkout
            }
        }

        // Audit: completed checkout + any voided lines
        final SalesInvoice finalSaved = saved;
        auditService.logCheckoutCompleted(
                request.getSessionId(), request.getTerminalId(), request.getBranchId(),
                finalSaved.getId(), finalSaved.getInvoiceNumber());
        terminalActivityService.recordActivity(request.getTerminalId(), "CHECKOUT");
        if (request.getItems() != null) {
            request.getItems().stream()
                    .filter(it -> Boolean.TRUE.equals(it.getVoided()))
                    .forEach(it -> auditService.logItemVoided(
                            request.getSessionId(), request.getTerminalId(), request.getBranchId(),
                            it.getItemCode(), it.getItemName(), it.getVoidReason()));
        }

        return ResponseEntity.ok(invoiceService.getById(saved.getId()));
    }

    /**
     * Advertises what this build's checkout endpoint accepts, so a POS terminal can confirm
     * the server understands progressive payment allocations before it tries to settle.
     * A server predating them would ignore the field and post the invoice with no payment
     * recorded; the terminal checks here and refuses to settle instead of losing the tender.
     *
     * <p>Deliberately unauthenticated-cheap and side-effect free — it is a static description
     * of the contract, safe to call on every checkout open.
     *
     * GET /api/pos/checkout/capabilities
     */
    @GetMapping("/capabilities")
    @PreAuthorize("isAuthenticated()")
    public PosCheckoutCapabilitiesResponse getCapabilities() {
        return new PosCheckoutCapabilitiesResponse(
                true,   // paymentAllocations — see PosPaymentAllocationResolver
                true,   // legacy scalars still accepted when no allocations are sent
                PosPaymentAllocationResolver.MAX_CARD_LEGS,
                java.util.Arrays.stream(PosPaymentAllocationType.values()).map(Enum::name).toList(),
                CHECKOUT_API_VERSION);
    }

    /** Bumped whenever the accepted checkout request shape changes. 1 = legacy scalars only;
     *  2 = progressive payment allocations. */
    private static final int CHECKOUT_API_VERSION = 2;

    /**
     * Look up a single POS invoice by invoice number (exact) for the Sales Return flow.
     * Optionally filtered by customerMobile and/or dateFrom when no invoice number is given,
     * returning the best match (latest first).
     */
    @GetMapping("/invoices/lookup")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> lookupInvoiceForReturn(
            @RequestParam(required = false) String invoiceNumber,
            @RequestParam(required = false) String customerMobile,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) Long branchId) {

        if (invoiceNumber != null && !invoiceNumber.isBlank()) {
            // Items are eagerly fetched in the query itself — the repository call's own
            // transaction/session is closed by the time the controller body runs, so a
            // post-hoc inv.getItems().size() here throws LazyInitializationException.
            Optional<SalesInvoice> found = invoiceRepository.findByInvoiceNumberWithItems(invoiceNumber.trim().toUpperCase());
            if (found.isEmpty()) {
                // Try prefix search — return first (latest) match
                List<SalesInvoice> byPrefix = invoiceRepository.findByInvoiceNumberPrefixWithItems(invoiceNumber.trim().toUpperCase());
                if (byPrefix.isEmpty()) return ResponseEntity.notFound().build();
                return ResponseEntity.ok(byPrefix.get(0));
            }
            return ResponseEntity.ok(found.get());
        }

        if (customerMobile != null && !customerMobile.isBlank()) {
            String mobile = customerMobile.trim();
            Optional<Customer> customer = customerRepository
                    .findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                            mobile, mobile, mobile, mobile);
            if (customer.isEmpty()) return ResponseEntity.notFound().build();
            String code = customer.get().getCode();
            LocalDate from = dateFrom != null ? LocalDate.parse(dateFrom) : businessDayClock.now().toLocalDate().minusDays(90);
            List<SalesInvoice> invoices = invoiceRepository.findPosInvoicesByDateRange(from, businessDayClock.now().toLocalDate(), branchId);
            Optional<String> matchedInvoiceNumber = invoices.stream()
                    .filter(i -> code.equalsIgnoreCase(i.getCustomerCode()))
                    .findFirst()
                    .map(SalesInvoice::getInvoiceNumber);
            if (matchedInvoiceNumber.isEmpty()) return ResponseEntity.notFound().build();
            // Re-fetch with items eagerly fetched (findPosInvoicesByDateRange is a
            // summary-only projection — see its own doc comment).
            return invoiceRepository.findByInvoiceNumberWithItems(matchedInvoiceNumber.get())
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        }

        return ResponseEntity.badRequest().build();
    }

    /**
     * List POS invoices for the reprint screen.
     * Returns lightweight invoice summaries (no items) ordered latest-first.
     */
    @GetMapping("/invoices")
    @PreAuthorize("isAuthenticated()")
    public List<SalesInvoice> getPosInvoices(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long branchId) {
        LocalDate from = dateFrom != null ? LocalDate.parse(dateFrom) : businessDayClock.now().toLocalDate();
        LocalDate to   = dateTo   != null ? LocalDate.parse(dateTo)   : businessDayClock.now().toLocalDate();
        List<SalesInvoice> invoices = invoiceRepository.findPosInvoicesByDateRange(from, to, branchId);
        applyActualPaymentMode(invoices);
        return invoices;
    }

    /** Overrides each invoice's stored {@code paymentMode} text with a label built from the
     *  actual recorded payment legs (e.g. "Cash + Visa") whenever more than one distinct mode
     *  was used. The stored field is set once at invoice creation (or, for delivery orders,
     *  never updated after settlement) and can drift out of sync with reality whenever a sale
     *  is split or its balance is settled later — the {@code sales_payments} ledger is the only
     *  place split/late-settled tender is reliably recorded, so it's the source of truth here. */
    private void applyActualPaymentMode(List<SalesInvoice> invoices) {
        List<String> numbers = invoices.stream()
                .map(SalesInvoice::getInvoiceNumber)
                .filter(n -> n != null && !n.isBlank())
                .toList();
        if (numbers.isEmpty()) return;

        Map<String, java.util.LinkedHashSet<String>> modesByInvoice = new java.util.HashMap<>();
        for (Payment p : paymentRepository.findTenderForInvoices(numbers)) {
            if (p.getLinkedInvoice() == null || p.getPaymentMode() == null) continue;
            modesByInvoice.computeIfAbsent(p.getLinkedInvoice(), k -> new java.util.LinkedHashSet<>())
                    .add(p.getPaymentMode());
        }
        for (SalesInvoice inv : invoices) {
            java.util.LinkedHashSet<String> modes = modesByInvoice.get(inv.getInvoiceNumber());
            if (modes != null && modes.size() > 1) {
                inv.setPaymentMode(String.join(" + ", modes));
            }
        }
    }

    /**
     * Receipt data endpoint: returns the invoice plus a ZATCA-compliant QR code payload.
     * The QR payload is a base64 TLV string the frontend passes to qrcode.js for rendering.
     *
     * GET /api/pos/checkout/invoices/{id}/receipt
     */
    @GetMapping("/invoices/{id}/receipt")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getReceiptData(@PathVariable Long id) {
        SalesInvoice invoice = invoiceService.getById(id);
        if (invoice.getItems() != null) invoice.getItems().size(); // init LAZY

        // Resolve seller name + TRN from branch
        String sellerName = invoice.getBranchName();
        String trn = null;
        if (invoice.getBranchId() != null) {
            var branch = branchRepository.findById(invoice.getBranchId()).orElse(null);
            if (branch != null) {
                if (sellerName == null || sellerName.isBlank()) sellerName = branch.getName();
                trn = branch.getTrnNumber();
            }
        }

        BigDecimal totalWithVat = invoice.getInvoiceTotal() != null
                ? invoice.getInvoiceTotal() : BigDecimal.ZERO;
        BigDecimal vatTotal = invoice.getTaxTotal() != null
                ? invoice.getTaxTotal() : BigDecimal.ZERO;

        LocalDateTime invoiceAt = invoice.getInvoiceDate() != null
                ? invoice.getInvoiceDate().atStartOfDay() : businessDayClock.now();

        String qrCode = ZatcaQrGenerator.generate(sellerName, trn, invoiceAt, totalWithVat, vatTotal);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("invoice", invoice);
        result.put("zatcaQr", qrCode);
        result.put("sellerName", sellerName);
        result.put("trn", trn);
        return ResponseEntity.ok(result);
    }

    /**
     * §4.2 Receipt reprint: same data as /receipt but also logs a RECEIPT_REPRINTED
     * audit entry for fraud detection (duplicate printout tracking).
     *
     * GET /api/pos/checkout/invoices/{id}/reprint
     */
    @GetMapping("/invoices/{id}/reprint")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> reprintReceipt(@PathVariable Long id,
            @RequestParam(required = false) Long sessionId,
            @RequestParam(required = false) String terminalId,
            @RequestParam(required = false) Long branchId) {
        // Reprint authorization is deliberately NOT invoice ownership. Who may hand a customer a
        // duplicate receipt is a permission + branch question: any holder of
        // permissions.pos.receipt.reprint may reprint any invoice of a branch they can act on,
        // whichever cashier originally rang it up (403 without the permission, 403 for a foreign
        // branch, 404 only when the invoice genuinely does not exist).
        modulePermissionService.requireCanView(RECEIPT_REPRINT_PERMISSION);
        SalesInvoice invoice = invoiceService.getByIdForReceiptReprint(id);
        if (invoice.getItems() != null) invoice.getItems().size();

        String sellerName = invoice.getBranchName();
        String trn = null;
        if (invoice.getBranchId() != null) {
            var branch = branchRepository.findById(invoice.getBranchId()).orElse(null);
            if (branch != null) {
                if (sellerName == null || sellerName.isBlank()) sellerName = branch.getName();
                trn = branch.getTrnNumber();
            }
        }

        // Use stored QR if available, otherwise regenerate.
        String qrCode = invoice.getPosReceiptQr();
        if (qrCode == null || qrCode.isBlank()) {
            BigDecimal totalWithVat = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal() : BigDecimal.ZERO;
            BigDecimal vatTotal = invoice.getTaxTotal() != null ? invoice.getTaxTotal() : BigDecimal.ZERO;
            LocalDateTime invoiceAt = invoice.getInvoiceDate() != null
                    ? invoice.getInvoiceDate().atStartOfDay() : businessDayClock.now();
            qrCode = ZatcaQrGenerator.generate(sellerName, trn, invoiceAt, totalWithVat, vatTotal);
        }

        // §4.2 Audit log: RECEIPT_REPRINTED for fraud detection. The operator is resolved here, on
        // the request thread, and passed in — the audit service is @Async and has no principal.
        String reprintedBy = currentUser();
        auditService.logReceiptReprinted(
                sessionId, terminalId, branchId != null ? branchId : invoice.getBranchId(),
                id, invoice.getInvoiceNumber(), reprintedBy);

        // Bump the reprint counter / last-reprinted-by/at so the "Reprint Previous
        // Invoices" screen shows real audit history instead of always 0/blank. This stamps only
        // the reprint columns (single-column UPDATE) — the invoice's createdBy/createdByUserId
        // stays the original cashier.
        Instant reprintedAt = Instant.now();
        invoiceService.recordReprint(id, reprintedBy);
        invoice.setReprintCount((invoice.getReprintCount() == null ? 0 : invoice.getReprintCount()) + 1);
        invoice.setLastReprintedBy(reprintedBy);
        invoice.setLastReprintedAt(reprintedAt);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("invoice", invoice);
        result.put("zatcaQr", qrCode);
        result.put("sellerName", sellerName);
        result.put("trn", trn);
        return ResponseEntity.ok(result);
    }

    // ── Delivery orders ────────────────────────────────────────────────────────

    /** List POS invoices sent out for delivery (CONFIRMED / PARTIALLY_PAID with a driver set). */
    @GetMapping("/deliveries")
    @PreAuthorize("isAuthenticated()")
    public List<SalesInvoice> getPendingDeliveries(@RequestParam(required = false) Long branchId) {
        return invoiceRepository.findPendingDeliveryOrders(branchId);
    }

    /** Settle (collect payment for) a pending delivery order. */
    @PostMapping("/deliveries/{id}/settle")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SalesInvoice> settleDelivery(@PathVariable Long id,
            @RequestBody DeliverySettleRequest req) {
        SalesInvoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));

        double invoiceTotal = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal().doubleValue() : 0.0;
        double alreadyPaid = invoice.getAmountPaid() != null ? invoice.getAmountPaid().doubleValue() : 0.0;
        double balanceDue  = Math.max(0, invoiceTotal - alreadyPaid);
        if (balanceDue <= 0.001) return ResponseEntity.ok(invoiceService.getById(id));

        // Delivery settlement runs through the same allocation engine as checkout: same
        // over-allocation guard, same cash capping, same summary label. There is one
        // settlement architecture, not one per screen.
        PosPaymentPlan plan = resolveDeliverySettlementPlan(req, balanceDue);
        double paymentAmount = plan.getSettledAmount();
        if (paymentAmount <= 0.001)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment amount must be greater than zero");

        // Every leg carries the same combined label, or the last recordPayment call would
        // overwrite the invoice's displayed mode with just its own leg.
        String combinedMode = plan.getCombinedPaymentMode();
        String splitGroupId = plan.getLegCount() > 1 ? java.util.UUID.randomUUID().toString() : null;
        for (ResolvedPaymentAllocation allocation : plan.getAllocations()) {
            if (allocation.getAmount() <= 0.001) continue;
            if (!allocation.isReceipt()) continue; // credit stays on the customer's ledger
            invoiceService.recordPayment(id, allocation.getAmount(), allocation.getModeLabel(),
                    allocation.getReference(),
                    invoice.getInvoiceDate() != null ? invoice.getInvoiceDate() : posBusinessDate(req.getSessionId()),
                    allocation.getBankAccountName(),
                    null, splitGroupId, combinedMode);
        }

        auditService.logCheckoutCompleted(req.getSessionId(), req.getTerminalId(),
                req.getBranchId() != null ? req.getBranchId() : invoice.getBranchId(),
                id, invoice.getInvoiceNumber());
        terminalActivityService.recordActivity(req.getTerminalId(), "CHECKOUT");
        return ResponseEntity.ok(invoiceService.getById(id));
    }

    /**
     * Resolves a delivery settlement into the same {@link PosPaymentPlan} a checkout produces.
     * Prefers the progressive {@code paymentAllocations} list; falls back to the legacy
     * cash/card scalars for a terminal whose browser tab has not been reloaded since deploy
     * (dropping that path would make those tills settle a delivery with no payment recorded).
     */
    private PosPaymentPlan resolveDeliverySettlementPlan(DeliverySettleRequest req, double balanceDue) {
        if (req.getPaymentAllocations() != null && !req.getPaymentAllocations().isEmpty()) {
            return allocationResolver.resolveAllocations(
                    req.getPaymentAllocations(), balanceDue, req.getPaymentMode(), "Cash");
        }
        // Legacy scalars, expressed as allocations so the settlement loop stays single-path.
        java.util.List<PosPaymentAllocation> legacy = new java.util.ArrayList<>();
        double cashAmt = req.getCashAmount() != null ? req.getCashAmount() : 0.0;
        double cardAmt = req.getCardAmount() != null ? req.getCardAmount() : 0.0;
        if (cashAmt <= 0.001 && cardAmt <= 0.001) {
            double tendered = req.getAmountTendered() != null ? req.getAmountTendered() : balanceDue;
            legacy.add(legacyAllocation(
                    req.getPaymentMode() != null && !req.getPaymentMode().isBlank() ? req.getPaymentMode() : "Cash",
                    Math.min(tendered, balanceDue), req.getCardReference()));
        } else {
            if (cardAmt > 0.001) {
                legacy.add(legacyAllocation(
                        req.getCardType() != null && !req.getCardType().isBlank() ? req.getCardType() : "Card",
                        cardAmt, req.getCardReference()));
            }
            if (cashAmt > 0.001) legacy.add(legacyAllocation("Cash", cashAmt, null));
        }
        return allocationResolver.resolveAllocations(legacy, balanceDue, null, "Cash");
    }

    /** Builds one allocation from a legacy mode label, inferring its type from the label. */
    private PosPaymentAllocation legacyAllocation(String modeLabel, double amount, String reference) {
        PosPaymentAllocation a = new PosPaymentAllocation();
        PosPaymentAllocationType parsed = PosPaymentAllocationType.parse(modeLabel);
        // An unrecognised label is a card network name ("Visa", "Mastercard"), which is the
        // only mode the legacy delivery-settle UI could send besides Cash.
        a.setType((parsed != null ? parsed : PosPaymentAllocationType.CARD).name());
        a.setSubtype(parsed == null || parsed == PosPaymentAllocationType.CARD ? modeLabel : null);
        a.setAmount(amount);
        a.setReference(reference);
        return a;
    }

    public static class DeliverySettleRequest {
        private String paymentMode;
        private Double amountTendered;
        private Double cashAmount;
        private Double cardAmount;
        private String cardType;
        private String cardReference;
        private Long sessionId;
        private String terminalId;
        private Long branchId;
        /** Progressive payment allocations — the canonical shape, same as checkout. */
        private List<PosPaymentAllocation> paymentAllocations;

        public List<PosPaymentAllocation> getPaymentAllocations() { return paymentAllocations; }
        public void setPaymentAllocations(List<PosPaymentAllocation> paymentAllocations) { this.paymentAllocations = paymentAllocations; }

        public String getPaymentMode() { return paymentMode; }
        public void setPaymentMode(String paymentMode) { this.paymentMode = paymentMode; }
        public Double getAmountTendered() { return amountTendered; }
        public void setAmountTendered(Double amountTendered) { this.amountTendered = amountTendered; }
        public Double getCashAmount() { return cashAmount; }
        public void setCashAmount(Double cashAmount) { this.cashAmount = cashAmount; }
        public Double getCardAmount() { return cardAmount; }
        public void setCardAmount(Double cardAmount) { this.cardAmount = cardAmount; }
        public String getCardType() { return cardType; }
        public void setCardType(String cardType) { this.cardType = cardType; }
        public String getCardReference() { return cardReference; }
        public void setCardReference(String cardReference) { this.cardReference = cardReference; }
        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public String getTerminalId() { return terminalId; }
        public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
    }

    private SalesInvoice buildInvoice(PosCheckoutRequest req) {
        Employee deliveryPerson = resolveDeliveryPerson(req);
        SalesInvoice inv = new SalesInvoice();
        inv.setSalesType(SalesType.POS_SALE);
        inv.setSalesChannel(isDeliveryCheckout(req) ? "Retail_Delivery" : "Retail_POS");
        // Business date, not calendar date — see posBusinessDate().
        inv.setInvoiceDate(posBusinessDate(req.getSessionId()));
        inv.setCustomerCode(req.getCustomerCode() != null ? req.getCustomerCode() : "WALK-IN");
        inv.setCustomerName(req.getCustomerName() != null ? req.getCustomerName() : "Walk-in Customer");
        inv.setPaymentMode(resolvePaymentMode(req));
        inv.setBranchId(req.getBranchId());
        inv.setBranchName(req.getBranchName());
        inv.setBranchCode(req.getBranchCode());
        inv.setPosSessionId(req.getSessionId());
        inv.setPosTerminalId(req.getTerminalId());
        inv.setPosCounterName(req.getCounterName());
        if (req.getCheckoutKey() != null && !req.getCheckoutKey().isBlank()) {
            inv.setPosCheckoutKey(req.getCheckoutKey().trim());
        }
        inv.setBillDiscountAmount(req.getBillDiscountAmount() != null
                ? java.math.BigDecimal.valueOf(req.getBillDiscountAmount()) : null);
        inv.setInternalNotes(req.getNotes());
        if (req.getShippingAddress() != null && !req.getShippingAddress().isBlank()) {
            inv.setShippingAddress(req.getShippingAddress());
        }
        if (deliveryPerson != null) {
            inv.setPosDriverEmployeeId(deliveryPerson.getId());
            inv.setPosDriverEmployeeCode(deliveryPerson.getEmployeeCode());
            inv.setPosDriverName(employeeFullName(deliveryPerson));
        } else if (req.getDriverName() != null && !req.getDriverName().isBlank()) {
            inv.setPosDriverName(req.getDriverName());
        }
        if (req.getDeliveryDate() != null && !req.getDeliveryDate().isBlank()) {
            inv.setDueDate(LocalDate.parse(req.getDeliveryDate()));
        }
        if (req.getDeliveryNotes() != null && !req.getDeliveryNotes().isBlank()) {
            inv.setPosDeliveryNotes(req.getDeliveryNotes());
        }
        if (req.getDeliveryCharge() != null && req.getDeliveryCharge() > 0) {
            inv.setDeliveryCharge(java.math.BigDecimal.valueOf(req.getDeliveryCharge()));
        }
        if (req.getShippingCharge() != null && req.getShippingCharge() > 0) {
            inv.setShippingCharge(java.math.BigDecimal.valueOf(req.getShippingCharge()));
        }
        boolean taxInclusive = Boolean.TRUE.equals(req.getTaxInclusive());
        inv.setTaxInclusive(taxInclusive);
        inv.setVatMode(taxInclusive
                ? com.billbull.backend.sales.common.VatMode.INCLUSIVE
                : com.billbull.backend.sales.common.VatMode.EXCLUSIVE);

        // Batch-loaded product pricings, keyed by item code — used both for the price-override
        // gate below and to snapshot each line's cost-at-sale (see the items-mapping loop
        // further down), the same way DeliveryNoteService/SalesOrderService already do for
        // non-POS sales. Without this snapshot, a Sales Return against a POS sale has no cost
        // to reverse if the product's cost is ever cleared/changed after the sale — Returns
        // approval then refuses to post (an unbalanced COGS/Inventory entry is worse than none).
        Map<String, ProductPricing> pricingByCode = new java.util.HashMap<>();
        // Batch-loaded product ids by code, used to resolve the Branch Default VAT Rate
        // fallback (via BranchTaxResolutionService) for any line whose taxRate the client
        // didn't send.
        Map<String, Long> productIdByCode = new java.util.HashMap<>();

        // §2.4 Price override gate: batch-load product pricings and verify that any
        // below-list-price sale is made by a user with the pos_price_override permission (or a
        // verified supervisor override). Gated by PosSettings.requirePriceOverrideApproval —
        // when the branch has this off, below-minimum sales are allowed through untouched, same
        // as the cart-add-time dialog being off. When the branch/setting can't be resolved,
        // fail safe (gate stays ON) rather than silently letting every sale bypass it.
        Long gateBranchId = req.getBranchId();
        PosSettings priceOverrideSettings = gateBranchId != null
                ? posSettingsService.getForBranch(gateBranchId)
                : posSettingsService.getForCurrentBranch();
        boolean priceOverrideGateEnabled = priceOverrideSettings == null
                || !Boolean.FALSE.equals(priceOverrideSettings.getRequirePriceOverrideApproval());
        if (priceOverrideGateEnabled && req.getItems() != null && !req.getItems().isEmpty()) {
            List<String> codes = req.getItems().stream()
                    .filter(i -> !Boolean.TRUE.equals(i.getVoided()) && i.getItemCode() != null)
                    .map(PosCheckoutRequest.PosCheckoutItem::getItemCode)
                    .distinct().collect(Collectors.toList());
            if (!codes.isEmpty()) {
                productRepository.findByCodeIn(codes).forEach(p -> {
                    productIdByCode.put(p.getCode(), p.getId());
                    pricingRepository.findByProductId(p.getId()).ifPresent(pr -> pricingByCode.put(p.getCode(), pr));
                });
                // Lazily verified at most once per checkout — a supervisor PIN/password supplied
                // by the frontend's price-override dialog (see PosSettings.requirePriceOverrideApproval)
                // grants the same bypass as the pos_price_override permission, for every line in
                // this request. null = not yet checked, so a checkout with no below-min lines never
                // pays the verification cost.
                Boolean supervisorOverrideVerified = null;
                for (PosCheckoutRequest.PosCheckoutItem item : req.getItems()) {
                    if (Boolean.TRUE.equals(item.getVoided()) || item.getPrice() == null) continue;
                    ProductPricing pr = pricingByCode.get(item.getItemCode());
                    if (pr == null) continue;
                    BigDecimal unitPrice = BigDecimal.valueOf(item.getPrice());
                    // Compute effective selling price after line discount so that
                    // discounts cannot bypass the minimum price rule.
                    double discountPct = item.getDiscount() != null ? item.getDiscount() : 0.0;
                    BigDecimal effectivePrice = unitPrice.multiply(
                            BigDecimal.ONE.subtract(BigDecimal.valueOf(discountPct / 100.0)));
                    // Temporary fallback: minPrice → cost (not retail).
                    // Zero is treated as "not configured" — a zero cost is not a valid floor.
                    BigDecimal effectiveMin = isPositive(pr.getMinPrice()) ? pr.getMinPrice()
                                           : (isPositive(pr.getCost()) ? pr.getCost() : null);
                    if (effectiveMin != null && effectivePrice.compareTo(effectiveMin) < 0
                            && !permissionService.currentUserCanEdit("pos_price_override")) {
                        if (supervisorOverrideVerified == null) {
                            supervisorOverrideVerified = verifySupervisorPriceOverride(req);
                        }
                        if (!supervisorOverrideVerified) {
                            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                                    "Price below minimum (" + effectiveMin + ") for " + item.getItemCode()
                                    + ". Supervisor override required (pos_price_override).");
                        }
                    }
                }
            }
        }

        if (req.getItems() != null) {
            inv.setItems(req.getItems().stream().map(item -> {
                com.billbull.backend.sales.invoice.SalesInvoiceItem si = new com.billbull.backend.sales.invoice.SalesInvoiceItem();
                si.setItemCode(item.getItemCode());
                si.setItemName(item.getItemName());
                si.setQuantity(item.getQuantity());
                si.setUnit(item.getUnit() != null ? item.getUnit() : "Each");
                si.setPrice(item.getPrice() != null ? java.math.BigDecimal.valueOf(item.getPrice()) : null);
                si.setDiscount(item.getDiscount() != null ? item.getDiscount() : 0.0);
                si.setTaxRate(item.getTaxRate() != null
                        ? item.getTaxRate()
                        : branchTaxResolutionService.resolveSalesTaxRateForProduct(
                                item.getItemCode() != null ? productIdByCode.get(item.getItemCode()) : null,
                                req.getBranchId()).doubleValue());
                // Cost-at-sale snapshot, so a later Sales Return can reverse COGS/Inventory
                // even if the product's cost is changed/cleared after this sale.
                ProductPricing itemPricing = item.getItemCode() != null ? pricingByCode.get(item.getItemCode()) : null;
                if (itemPricing != null) si.setCost(itemPricing.getCost());
                si.setVoided(Boolean.TRUE.equals(item.getVoided()));
                if (si.isVoided()) {
                    si.setVoidReason(item.getVoidReason());
                    si.setVoidedBy(currentUser());
                    si.setVoidedAt(businessDayClock.now());
                } else {
                    if (item.getBatchNumber() != null && !item.getBatchNumber().isBlank()) {
                        si.setPinnedBatchNumber(item.getBatchNumber().trim());
                    }
                    if (item.getSerialNumber() != null && !item.getSerialNumber().isBlank()) {
                        si.setSerialNumber(item.getSerialNumber().trim());
                    }
                }
                si.setSalesInvoice(inv);
                return si;
            }).toList());
        }

        return inv;
    }

    private Employee resolveDeliveryPerson(PosCheckoutRequest req) {
        if (!isDeliveryCheckout(req)) return null;

        if (req.getCustomerCode() == null || req.getCustomerCode().isBlank()
                || "WALK-IN".equalsIgnoreCase(req.getCustomerCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Customer is required before sending an order out for delivery.");
        }
        if (req.getShippingAddress() == null || req.getShippingAddress().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delivery address is required.");
        }
        if (req.getDeliveryDate() == null || req.getDeliveryDate().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delivery date is required.");
        }
        try {
            LocalDate.parse(req.getDeliveryDate());
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delivery date must be a valid ISO date.");
        }
        if (req.getDeliveryTimeSlot() == null || req.getDeliveryTimeSlot().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delivery time slot is required.");
        }

        Employee employee = null;
        if (req.getDeliveryPersonEmployeeId() != null) {
            employee = employeeRepository.findById(req.getDeliveryPersonEmployeeId()).orElse(null);
        }
        if (employee == null && req.getDeliveryPersonEmployeeCode() != null
                && !req.getDeliveryPersonEmployeeCode().isBlank()) {
            employee = employeeRepository.findByEmployeeCodeIgnoreCase(req.getDeliveryPersonEmployeeCode().trim()).orElse(null);
        }
        if (employee == null || !isActiveDeliveryPerson(employee)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Assigned delivery person must be an active employee with the Delivery Person role.");
        }
        return employee;
    }

    private boolean isDeliveryCheckout(PosCheckoutRequest req) {
        String mode = resolvePaymentMode(req);
        return mode != null && "delivery".equalsIgnoreCase(mode.trim());
    }

    private boolean isActiveDeliveryPerson(Employee employee) {
        String role = employee.getRole() != null ? employee.getRole().trim().toLowerCase() : "";
        String status = employee.getStatus() != null ? employee.getStatus().trim().toLowerCase() : "";
        return "active".equals(status) && ("delivery person".equals(role) || "delivery_person".equals(role));
    }

    private String employeeFullName(Employee employee) {
        return (employee.getFirstName() + " "
                + (employee.getMiddleName() != null ? employee.getMiddleName() + " " : "")
                + employee.getLastName()).trim().replaceAll("\\s+", " ");
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    /** Single-mode label for invoice creation / delivery detection — see the resolver. */
    private String resolvePaymentMode(PosCheckoutRequest req) {
        return allocationResolver.resolvePaymentMode(req);
    }

    /** Currency rounding tolerance used when comparing a payment-leg total against the invoice total. */
    private static final double ROUNDING_TOLERANCE = PosPaymentAllocationResolver.ROUNDING_TOLERANCE;

    /**
     * One line per settled sale, carrying what a support engineer needs when a till total and
     * a ledger total disagree: how many tenders, in what order, how much was received versus
     * carried on account, and the label stamped on the invoice.
     *
     * <p>Deliberately a single INFO line rather than one per allocation — a busy till writes
     * thousands of these a day, and a log that is expensive to keep is a log that gets turned
     * off. The splitGroupId is included because it is the key that ties the resulting Payment
     * rows back to this one checkout.
     */
    private void logSettlement(String invoiceNumber, PosPaymentPlan plan,
                               double invoiceTotal, String splitGroupId) {
        if (!log.isInfoEnabled()) return;
        StringBuilder tenders = new StringBuilder();
        for (ResolvedPaymentAllocation a : plan.getAllocations()) {
            if (a.getAmount() <= ROUNDING_TOLERANCE) continue;
            if (tenders.length() > 0) tenders.append(", ");
            tenders.append(a.getModeLabel()).append(' ').append(String.format("%.2f", a.getAmount()));
        }
        log.info("POS settlement invoice={} total={} allocations={} [{}] received={} receivable={} "
                        + "mode='{}' splitGroup={}",
                invoiceNumber, String.format("%.2f", invoiceTotal), plan.getLegCount(), tenders,
                String.format("%.2f", plan.getSettledAmount()),
                String.format("%.2f", plan.getCreditAmount()),
                plan.getCombinedPaymentMode(), splitGroupId != null ? splitGroupId : "-");
    }

    /** Best-effort rollback of a DRAFT invoice whose payment could not be completed —
     *  never masks the original failure with a cleanup error. */
    private void deleteQuietly(Long invoiceId) {
        try {
            invoiceService.delete(invoiceId);
        } catch (RuntimeException cleanupEx) {
            // Intentionally swallowed: the caller is about to rethrow the real cause.
        }
    }

    /** Returns true when a BigDecimal value is non-null and strictly positive (> 0). */
    private static boolean isPositive(BigDecimal value) {
        return value != null && value.compareTo(BigDecimal.ZERO) > 0;
    }

    /** §2.4 price-override bypass: verifies a supervisor PIN or credentials supplied on the
     *  checkout request, via the same PosSettingsService checks the cart-add-time approval
     *  dialog uses (ARCHFIX S5 — PIN is BCrypt-hashed; credentials check role membership). PIN
     *  is tried first when both are present, matching PIN being the simpler/default approval mode. */
    /**
     * Draws a Credit Voucher down for a VOUCHER tender leg.
     *
     * <p>The voucher code arrives as the allocation's {@code reference} — the string the cashier
     * scanned or typed. It is resolved and redeemed server-side: nothing the client sent about the
     * voucher's balance, status or expiry is trusted, because a till showing a stale balance is
     * exactly how a voucher gets spent twice.
     *
     * <p>{@code CreditVoucherService.redeem} takes a row lock and re-validates under it, so two
     * terminals racing on the same voucher serialise and the loser is refused.
     */
    private void redeemVoucherAllocation(com.billbull.backend.sales.invoice.SalesInvoice invoice,
                                         ResolvedPaymentAllocation allocation,
                                         PosCheckoutRequest request) {
        String voucherToken = allocation.getReference();
        if (voucherToken == null || voucherToken.isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "A voucher payment must carry the voucher code in its reference.");
        }

        var voucher = creditVoucherService.findByToken(voucherToken);

        creditVoucherService.redeem(
                voucher.getId(),
                java.math.BigDecimal.valueOf(allocation.getAmount())
                        .setScale(2, java.math.RoundingMode.HALF_UP),
                invoice.getInvoiceNumber(),
                invoice.getId(),
                invoice.getBranchId(),
                request.getTerminalId(),
                request.getSessionId(),
                invoice.getInvoiceDate(),
                invoice.getBranchEntity());
    }

    private boolean verifySupervisorPriceOverride(PosCheckoutRequest req) {
        if (req.getSupervisorOverridePin() != null && !req.getSupervisorOverridePin().isBlank()) {
            return posSettingsService.verifyPin(req.getSupervisorOverridePin());
        }
        if (req.getSupervisorOverrideEmail() != null && !req.getSupervisorOverrideEmail().isBlank()
                && req.getSupervisorOverridePassword() != null && !req.getSupervisorOverridePassword().isBlank()) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String cashier = auth != null ? auth.getName() : null;
            return posSettingsService.verifySupervisorCredentials(
                    req.getSupervisorOverrideEmail(), req.getSupervisorOverridePassword(),
                    req.getTerminalId(), cashier).isValid();
        }
        return false;
    }
}
