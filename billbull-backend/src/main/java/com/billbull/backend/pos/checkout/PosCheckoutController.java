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

    private final SalesInvoiceService invoiceService;
    private final PosSessionService sessionService;
    private final SalesInvoiceRepository invoiceRepository;
    private final CustomerRepository customerRepository;
    private final PosAuditService auditService;
    private final BranchRepository branchRepository;
    private final SerialMasterRepository serialMasterRepository;
    private final ProductRepository productRepository;
    private final ProductPricingRepository pricingRepository;
    private final RolePermissionService permissionService;
    private final ProductService productService;
    private final EmployeeRepository employeeRepository;
    private final PaymentRepository paymentRepository;
    private final com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;

    public PosCheckoutController(SalesInvoiceService invoiceService, PosSessionService sessionService,
                                  SalesInvoiceRepository invoiceRepository, CustomerRepository customerRepository,
                                  PosAuditService auditService, BranchRepository branchRepository,
                                  SerialMasterRepository serialMasterRepository,
                                  ProductRepository productRepository,
                                  ProductPricingRepository pricingRepository,
                                  RolePermissionService permissionService,
                                  ProductService productService,
                                  EmployeeRepository employeeRepository,
                                  PaymentRepository paymentRepository,
                                  com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService) {
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
        this.productService = productService;
        this.employeeRepository = employeeRepository;
        this.paymentRepository = paymentRepository;
        this.terminalActivityService = terminalActivityService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SalesInvoice> checkout(@RequestBody PosCheckoutRequest request) {
        // Idempotency guard: if the frontend sends the same checkoutKey twice (network retry),
        // return the already-completed invoice instead of creating a duplicate.
        if (request.getCheckoutKey() != null && !request.getCheckoutKey().isBlank()) {
            var existing = invoiceRepository.findByPosCheckoutKey(request.getCheckoutKey().trim());
            if (existing.isPresent()) {
                return ResponseEntity.ok(invoiceService.getById(existing.get().getId()));
            }
        }

        SalesInvoice invoice = buildInvoice(request);

        // Step 1: save builds the invoice (number, totals, items) as DRAFT.
        // amountPaid is zero at this point — status/side-effects are deferred.
        // save() also defaults the branch warehouse onto every stock line that
        // arrived without one, so the auto-DN posting in Step 2 has a location.
        SalesInvoice saved = invoiceService.save(invoice);

        double invoiceTotal = saved.getInvoiceTotal() != null ? saved.getInvoiceTotal().doubleValue() : 0.0;
        double cashAmt = request.getCashAmount() != null ? request.getCashAmount() : 0.0;
        double cardAmt = request.getCardAmount() != null ? request.getCardAmount() : 0.0;
        double onlineAmt = request.getOnlineAmount() != null ? request.getOnlineAmount() : 0.0;
        boolean hasSplitAmounts = cashAmt > 0.001 || cardAmt > 0.001 || onlineAmt > 0.001;
        double paymentAmount = hasSplitAmounts
                ? Math.min(cashAmt + cardAmt + onlineAmt, invoiceTotal)
                : Math.min(request.getAmountTendered() != null ? request.getAmountTendered() : 0.0, invoiceTotal);
        // A Credit checkout with a partial receipt (cashAmt/cardAmt/onlineAmt < invoiceTotal) must
        // keep the invoice's paymentMode stamped "Credit" — the leg mode (Cash/Card/Online) belongs
        // on the Payment/Receipt row, not on the invoice, so the remaining balance still reads as
        // outstanding credit rather than looking like a plain Cash/Card sale.
        boolean isCreditCheckout = "credit".equalsIgnoreCase(request.getPaymentMode());
        String creditStamp = isCreditCheckout ? "Credit" : null;

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
            try {
                invoiceService.delete(saved.getId());
            } catch (RuntimeException cleanupEx) {
                // Best-effort cleanup — don't mask the original posting failure.
            }
            throw ex;
        }

        // Step 3: record payment — creates Payment row(s) + Receipt Voucher(s) + GL.
        // Split into per-leg rows when both cash and card amounts are provided: each leg
        // gets the correct settlement account (Cash 1001 vs Merchant Clearing 1013).
        if (paymentAmount > 0) {
            if (hasSplitAmounts && cashAmt > 0.001 && cardAmt > 0.001) {
                // Card leg first (exact); cash fills the remainder up to invoiceTotal.
                double cardPayment = Math.min(cardAmt, invoiceTotal);
                double cashPayment = Math.max(0, Math.min(invoiceTotal - cardPayment, cashAmt));
                String cardMode = resolveCardMode(request);
                // Each recordPayment call below re-stamps invoice.paymentMode, so both legs
                // must carry the same combined label (e.g. "Cash + Card") — otherwise the
                // second (cash) call silently overwrites the first with just its own leg mode.
                String splitCombinedMode = request.getCombinedPaymentMode() != null
                        ? request.getCombinedPaymentMode() : creditStamp;
                if (cardPayment > 0) {
                    invoiceService.recordPayment(saved.getId(), cardPayment, cardMode,
                            request.getCardReference(), LocalDate.now(),
                            null, null, null, splitCombinedMode);
                }
                if (cashPayment > 0) {
                    invoiceService.recordPayment(saved.getId(), cashPayment, "Cash",
                            null, LocalDate.now(), null, null, null, splitCombinedMode);
                }
            } else {
                // Single-leg payment (pure Cash, pure Card, pure Online, Credit partial receipt, etc.)
                String paymentMode = hasSplitAmounts && cardAmt > 0.001
                        ? resolveCardMode(request)      // card-only with explicit cardAmt
                        : hasSplitAmounts && onlineAmt > 0.001
                        ? "Online"                       // online-only with explicit onlineAmt
                        : hasSplitAmounts               // cash-only with explicit cashAmt
                        ? "Cash"
                        : resolvePaymentMode(request);  // legacy: use paymentMode string
                String combinedMode = request.getCombinedPaymentMode() != null
                        ? request.getCombinedPaymentMode() : creditStamp;
                invoiceService.recordPayment(saved.getId(), paymentAmount, paymentMode,
                        request.getCardReference(), LocalDate.now(),
                        request.getBankAccountName(), null, null, combinedMode);
            }
        }

        // Update session totals
        if (request.getSessionId() != null) {
            sessionService.recordInvoiceOnSession(request.getSessionId(), saved);
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
                                sm.setSoldAt(LocalDateTime.now());
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
                    ? saved.getInvoiceDate().atStartOfDay() : LocalDateTime.now();
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
            LocalDate from = dateFrom != null ? LocalDate.parse(dateFrom) : LocalDate.now().minusDays(90);
            List<SalesInvoice> invoices = invoiceRepository.findPosInvoicesByDateRange(from, LocalDate.now(), branchId);
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
        LocalDate from = dateFrom != null ? LocalDate.parse(dateFrom) : LocalDate.now();
        LocalDate to   = dateTo   != null ? LocalDate.parse(dateTo)   : LocalDate.now();
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
                ? invoice.getInvoiceDate().atStartOfDay() : LocalDateTime.now();

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
        SalesInvoice invoice = invoiceService.getById(id);
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
                    ? invoice.getInvoiceDate().atStartOfDay() : LocalDateTime.now();
            qrCode = ZatcaQrGenerator.generate(sellerName, trn, invoiceAt, totalWithVat, vatTotal);
        }

        // §4.2 Audit log: RECEIPT_REPRINTED for fraud detection
        auditService.logReceiptReprinted(
                sessionId, terminalId, branchId != null ? branchId : invoice.getBranchId(),
                id, invoice.getInvoiceNumber());

        // Bump the reprint counter / last-reprinted-by/at so the "Reprint Previous
        // Invoices" screen shows real audit history instead of always 0/blank.
        String reprintedBy = currentUser();
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

        double cashAmt = req.getCashAmount() != null ? req.getCashAmount() : 0.0;
        double cardAmt = req.getCardAmount() != null ? req.getCardAmount() : 0.0;
        boolean hasSplit = cashAmt > 0.001 || cardAmt > 0.001;
        double paymentAmount = hasSplit
                ? Math.min(cashAmt + cardAmt, balanceDue)
                : Math.min(req.getAmountTendered() != null ? req.getAmountTendered() : balanceDue, balanceDue);
        if (paymentAmount <= 0.001)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment amount must be greater than zero");

        if (hasSplit && cashAmt > 0.001 && cardAmt > 0.001) {
            double cardPayment = Math.min(cardAmt, balanceDue);
            double cashPayment = Math.max(0, Math.min(balanceDue - cardPayment, cashAmt));
            String cardMode = (req.getCardType() != null && !req.getCardType().isBlank()) ? req.getCardType() : "Card";
            // Same combined label must be passed to both legs, or the second recordPayment
            // call overwrites invoice.paymentMode with just its own leg mode.
            String splitCombinedMode = "Cash + " + cardMode;
            if (cardPayment > 0) invoiceService.recordPayment(id, cardPayment, cardMode, req.getCardReference(), LocalDate.now(), null, null, null, splitCombinedMode);
            if (cashPayment > 0) invoiceService.recordPayment(id, cashPayment, "Cash", null, LocalDate.now(), null, null, null, splitCombinedMode);
        } else {
            String mode = hasSplit && cardAmt > 0.001
                    ? (req.getCardType() != null && !req.getCardType().isBlank() ? req.getCardType() : "Card")
                    : hasSplit ? "Cash"
                    : (req.getPaymentMode() != null && !req.getPaymentMode().isBlank() ? req.getPaymentMode() : "Cash");
            invoiceService.recordPayment(id, paymentAmount, mode, req.getCardReference(), LocalDate.now(), null, null, null, null);
        }

        auditService.logCheckoutCompleted(req.getSessionId(), req.getTerminalId(),
                req.getBranchId() != null ? req.getBranchId() : invoice.getBranchId(),
                id, invoice.getInvoiceNumber());
        terminalActivityService.recordActivity(req.getTerminalId(), "CHECKOUT");
        return ResponseEntity.ok(invoiceService.getById(id));
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
        inv.setInvoiceDate(LocalDate.now());
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

        // §2.4 Price override gate: batch-load product pricings and verify that any
        // below-list-price sale is made by a user with the pos_price_override permission.
        if (req.getItems() != null && !req.getItems().isEmpty()) {
            List<String> codes = req.getItems().stream()
                    .filter(i -> !Boolean.TRUE.equals(i.getVoided()) && i.getItemCode() != null)
                    .map(PosCheckoutRequest.PosCheckoutItem::getItemCode)
                    .distinct().collect(Collectors.toList());
            if (!codes.isEmpty()) {
                productRepository.findByCodeIn(codes).forEach(p -> {
                    pricingRepository.findByProductId(p.getId()).ifPresent(pr -> pricingByCode.put(p.getCode(), pr));
                });
                for (PosCheckoutRequest.PosCheckoutItem item : req.getItems()) {
                    if (Boolean.TRUE.equals(item.getVoided()) || item.getPrice() == null) continue;
                    ProductPricing pr = pricingByCode.get(item.getItemCode());
                    if (pr == null) continue;
                    BigDecimal itemPrice = BigDecimal.valueOf(item.getPrice());
                    BigDecimal minPrice = pr.getMinPrice() != null ? pr.getMinPrice()
                                       : (pr.getRetailPrice() != null ? pr.getRetailPrice() : null);
                    if (minPrice != null && itemPrice.compareTo(minPrice) < 0) {
                        if (!permissionService.currentUserCanEdit("pos_price_override")) {
                            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                                    "Price below minimum for " + item.getItemCode()
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
                si.setTaxRate(item.getTaxRate() != null ? item.getTaxRate() : 5.0);
                // Cost-at-sale snapshot, so a later Sales Return can reverse COGS/Inventory
                // even if the product's cost is changed/cleared after this sale.
                ProductPricing itemPricing = item.getItemCode() != null ? pricingByCode.get(item.getItemCode()) : null;
                if (itemPricing != null) si.setCost(itemPricing.getCost());
                si.setVoided(Boolean.TRUE.equals(item.getVoided()));
                if (si.isVoided()) {
                    si.setVoidReason(item.getVoidReason());
                    si.setVoidedBy(currentUser());
                    si.setVoidedAt(LocalDateTime.now());
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

    /** Returns the card network name to use as payment mode (e.g. "Visa", "Card"). */
    private String resolveCardMode(PosCheckoutRequest req) {
        if (req.getCardType() != null && !req.getCardType().isBlank()) return req.getCardType();
        return "Card";
    }

    private String resolvePaymentMode(PosCheckoutRequest req) {
        if (req.getCombinedPaymentMode() != null && !req.getCombinedPaymentMode().isBlank()) {
            return req.getCombinedPaymentMode();
        }
        if (req.getPaymentMode() != null) return req.getPaymentMode();
        return "Cash";
    }
}
