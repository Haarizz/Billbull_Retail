package com.billbull.backend.pos.checkout;

import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.receipt.ZatcaQrGenerator;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.settings.branch.BranchRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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

    public PosCheckoutController(SalesInvoiceService invoiceService, PosSessionService sessionService,
                                  SalesInvoiceRepository invoiceRepository, CustomerRepository customerRepository,
                                  PosAuditService auditService, BranchRepository branchRepository) {
        this.invoiceService = invoiceService;
        this.sessionService = sessionService;
        this.invoiceRepository = invoiceRepository;
        this.customerRepository = customerRepository;
        this.auditService = auditService;
        this.branchRepository = branchRepository;
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
        SalesInvoice saved = invoiceService.save(invoice);

        double invoiceTotal = saved.getInvoiceTotal() != null ? saved.getInvoiceTotal().doubleValue() : 0.0;
        double cashAmt = request.getCashAmount() != null ? request.getCashAmount() : 0.0;
        double cardAmt = request.getCardAmount() != null ? request.getCardAmount() : 0.0;
        boolean hasSplitAmounts = cashAmt > 0.001 || cardAmt > 0.001;
        double paymentAmount = hasSplitAmounts
                ? Math.min(cashAmt + cardAmt, invoiceTotal)
                : Math.min(request.getAmountTendered() != null ? request.getAmountTendered() : 0.0, invoiceTotal);

        // Step 2: transition status while the invoice is still DRAFT so that
        // doUpdateStatus() fires: FEFO/batch reservation, auto-DN generation,
        // stock deduction, and the GL invoice-posting journal all happen here.
        SalesInvoiceStatus intendedStatus =
                (paymentAmount >= invoiceTotal - 0.001 && invoiceTotal > 0) ? SalesInvoiceStatus.PAID
              : (paymentAmount > 0)                                           ? SalesInvoiceStatus.PARTIALLY_PAID
              :                                                                  SalesInvoiceStatus.CONFIRMED;
        invoiceService.updateStatus(saved.getId(), intendedStatus);

        // Step 3: record payment — creates Payment row(s) + Receipt Voucher(s) + GL.
        // Split into per-leg rows when both cash and card amounts are provided: each leg
        // gets the correct settlement account (Cash 1001 vs Merchant Clearing 1013).
        if (paymentAmount > 0) {
            if (hasSplitAmounts && cashAmt > 0.001 && cardAmt > 0.001) {
                // Card leg first (exact); cash fills the remainder up to invoiceTotal.
                double cardPayment = Math.min(cardAmt, invoiceTotal);
                double cashPayment = Math.max(0, Math.min(invoiceTotal - cardPayment, cashAmt));
                String cardMode = resolveCardMode(request);
                if (cardPayment > 0) {
                    invoiceService.recordPayment(saved.getId(), cardPayment, cardMode,
                            request.getCardReference(), LocalDate.now(),
                            null, null, null, null);
                }
                if (cashPayment > 0) {
                    invoiceService.recordPayment(saved.getId(), cashPayment, "Cash",
                            null, LocalDate.now(), null, null, null, null);
                }
            } else {
                // Single-leg payment (pure Cash, pure Card, Credit, Bank Transfer, etc.)
                String paymentMode = hasSplitAmounts && cardAmt > 0.001
                        ? resolveCardMode(request)      // card-only with explicit cardAmt
                        : hasSplitAmounts               // cash-only with explicit cashAmt
                        ? "Cash"
                        : resolvePaymentMode(request);  // legacy: use paymentMode string
                invoiceService.recordPayment(saved.getId(), paymentAmount, paymentMode,
                        request.getCardReference(), LocalDate.now(),
                        null, null, null, request.getCombinedPaymentMode());
            }
        }

        // Update session totals
        if (request.getSessionId() != null) {
            sessionService.recordInvoiceOnSession(request.getSessionId(), saved);
        }

        // Audit: completed checkout + any voided lines
        final SalesInvoice finalSaved = saved;
        auditService.logCheckoutCompleted(
                request.getSessionId(), request.getTerminalId(), request.getBranchId(),
                finalSaved.getId(), finalSaved.getInvoiceNumber());
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
    @PreAuthorize("hasPermission(null, 'sales', 'view')")
    public ResponseEntity<?> lookupInvoiceForReturn(
            @RequestParam(required = false) String invoiceNumber,
            @RequestParam(required = false) String customerMobile,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) Long branchId) {

        if (invoiceNumber != null && !invoiceNumber.isBlank()) {
            Optional<SalesInvoice> found = invoiceRepository.findByInvoiceNumber(invoiceNumber.trim().toUpperCase());
            if (found.isEmpty()) {
                // Try prefix search — return first (latest) match
                List<SalesInvoice> byPrefix = invoiceRepository.findByInvoiceNumberPrefixWithItems(invoiceNumber.trim().toUpperCase());
                if (byPrefix.isEmpty()) return ResponseEntity.notFound().build();
                return ResponseEntity.ok(byPrefix.get(0));
            }
            SalesInvoice inv = found.get();
            // Eagerly initialize items to avoid lazy-load issues in serialization
            if (inv.getItems() != null) inv.getItems().size();
            return ResponseEntity.ok(inv);
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
            return invoices.stream()
                    .filter(i -> code.equalsIgnoreCase(i.getCustomerCode()))
                    .findFirst()
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
        return invoiceRepository.findPosInvoicesByDateRange(from, to, branchId);
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

    private SalesInvoice buildInvoice(PosCheckoutRequest req) {
        SalesInvoice inv = new SalesInvoice();
        inv.setSalesType(SalesType.POS_SALE);
        inv.setSalesChannel("POS");
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
        if (req.getDriverName() != null && !req.getDriverName().isBlank()) {
            inv.setPosDriverName(req.getDriverName());
        }
        if (req.getDeliveryNotes() != null && !req.getDeliveryNotes().isBlank()) {
            inv.setPosDeliveryNotes(req.getDeliveryNotes());
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
                si.setVoided(Boolean.TRUE.equals(item.getVoided()));
                if (si.isVoided()) {
                    si.setVoidReason(item.getVoidReason());
                    si.setVoidedBy(currentUser());
                    si.setVoidedAt(LocalDateTime.now());
                } else if (item.getBatchNumber() != null && !item.getBatchNumber().isBlank()) {
                    si.setPinnedBatchNumber(item.getBatchNumber().trim());
                }
                si.setSalesInvoice(inv);
                return si;
            }).toList());
        }

        return inv;
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
