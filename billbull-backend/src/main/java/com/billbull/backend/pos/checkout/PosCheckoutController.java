package com.billbull.backend.pos.checkout;

import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.invoice.SalesType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
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

    public PosCheckoutController(SalesInvoiceService invoiceService, PosSessionService sessionService,
                                  SalesInvoiceRepository invoiceRepository, CustomerRepository customerRepository) {
        this.invoiceService = invoiceService;
        this.sessionService = sessionService;
        this.invoiceRepository = invoiceRepository;
        this.customerRepository = customerRepository;
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
        double tenderedNum  = request.getAmountTendered() != null ? request.getAmountTendered() : 0.0;
        double paymentAmount = Math.min(tenderedNum, invoiceTotal);

        // Step 2: transition status while the invoice is still DRAFT so that
        // doUpdateStatus() fires: FEFO/batch reservation, auto-DN generation,
        // stock deduction, and the GL invoice-posting journal all happen here.
        SalesInvoiceStatus intendedStatus =
                (paymentAmount >= invoiceTotal && invoiceTotal > 0) ? SalesInvoiceStatus.PAID
              : (paymentAmount > 0)                                  ? SalesInvoiceStatus.PARTIALLY_PAID
              :                                                         SalesInvoiceStatus.CONFIRMED;
        invoiceService.updateStatus(saved.getId(), intendedStatus);

        // Step 3: record payment — creates Payment row + Receipt Voucher + GL
        // (Dr Cash/Card → Cr AR), and syncs amountPaid/balance on the invoice.
        if (paymentAmount > 0) {
            String paymentMode = resolvePaymentMode(request);
            invoiceService.recordPayment(saved.getId(), paymentAmount, paymentMode,
                    request.getCardReference(), LocalDate.now(),
                    null, null, null, request.getCombinedPaymentMode());
        }

        // Update session totals
        if (request.getSessionId() != null) {
            sessionService.recordInvoiceOnSession(request.getSessionId(), saved);
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
                if (!si.isVoided() && item.getBatchNumber() != null && !item.getBatchNumber().isBlank()) {
                    si.setPinnedBatchNumber(item.getBatchNumber().trim());
                }
                si.setSalesInvoice(inv);
                return si;
            }).toList());
        }

        return inv;
    }

    private String resolvePaymentMode(PosCheckoutRequest req) {
        if (req.getCombinedPaymentMode() != null && !req.getCombinedPaymentMode().isBlank()) {
            return req.getCombinedPaymentMode();
        }
        if (req.getPaymentMode() != null) return req.getPaymentMode();
        return "Cash";
    }
}
